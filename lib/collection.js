var assert = require('assert');
var _ = require('lodash');
var objectAssignDeep = require('object-assign-deep');

var ObjectId = require('bson-objectid');
var debug = require('debug')('mongo-mock:collection');
var asyncish = require('../').asyncish;
var cursor = require('./cursor.js');
var modifyjs = require('modifyjs');
var bulk = require('./bulk.js');
var find_options = require('./find_options.js');

var sift = require('../sift.js');

function addToSet(array, other) {
  other = _.isArray(other) ? other : [other];

  var index = -1,
    length = array.length,
    othIndex = -1,
    othLength = other.length,
    result = Array(length);

  while (++index < length) {
    result[index] = array[index];
  }
  while (++othIndex < othLength) {
    if (_.indexOf(array, other[othIndex]) < 0) {
      result.push(other[othIndex]);
    }
  }
  return result;
};

module.exports = function Collection(db, state) {
  var name = state.name;
  var pk = state.pkFactory || ObjectId;
  debug('initializing instance of `%s` with %s documents', name, state.documents ? state.documents.length : undefined);

  var iface = {
    get collectionName() { return name; },
    get hit() { NotImplemented() },
    get name() { return name; },
    get namespace() { return db.databaseName + '.' + name; },
    get writeConcern() { NotImplemented() },

    aggregate: NotImplemented,
    bulkWrite: function (operations, options, callback) {
      const promises = []
  
      for (const operation of operations) {
        let promise
    
        // Determine which operation to forward to
        if (operation.insertOne) {
          const { document } = operation.insertOne
          promise = this.insertOne(document, options)
        } else if (operation.updateOne) {
          const { filter, update, ...opts } = operation.updateOne
          promise = this.updateOne(filter, update, { ...options, ...opts })
        } else if (operation.updateMany) {
          const { filter, update, ...opts } = operation.updateMany
          promise = this.updateMany(filter, update, { ...options, ...opts })
        } else if (operation.deleteOne) {
          const { filter } = operation.deleteOne
          promise = this.deleteOne(filter, options)
        } else if (operation.deleteMany) {
          const { filter } = operation.deleteMany
          promise = this.deleteMany(filter, options)
        } else if (operation.replaceOne) {
          const { filter, replacement, ...opts } = operation.replaceOne
          promise = this.replaceOne(filter, replacement, { ...options, ...opts })
        } else {
          throw Error('bulkWrite only supports insertOne, updateOne, updateMany, deleteOne, deleteMany')
        }
        
        // Add the operation results to the list
        promises.push(promise)
      }

      Promise.all(promises).then(function(values) {
        // Loop through all operation results, and aggregate
        // the result object
        let ops = []
        let n = 0
        for (const value of values) {
          if (value.insertedId || value.insertedIds) {
            ops = [...ops, ...value.ops]
          }
          n += value.result.n
        }

        callback(null, {
          ops,
          connection: db,
          result: {
            ok: 1,
            n
          }
        })
      }).catch(function (error) {
        callback(error, null)
      })

      if (typeof callback !== 'function') {
        return new Promise(function(resolve, reject) {
          callback = function(e, r) { e ? reject(e) : resolve(r); };
        });
      }
    },
    count: count,
    countDocuments: count,
    estimatedDocumentCount: function(options, callback){
      return this.find({}, options).count(callback);
    },
    createIndex: function (keys, options, callback) {
      return db.createIndex(name, keys, options, callback);
    },
    createIndexes: NotImplemented,
    deleteMany: function (filter, options, callback) {
      callback = arguments[arguments.length - 1];
      debug('deleteMany %j', filter);

      const opts = find_options(arguments);
      asyncish(function () {
        cursor(state.documents || [], opts).toArray((err, docsToRemove) => {
          debug('docs', docsToRemove);
          if (docsToRemove.length) {
            debug(state.documents.length);
            debug(docsToRemove.length);
            const idsToRemove = _.map(docsToRemove, '_id');
            _.remove(state.documents || [], document => _.includes(idsToRemove, document._id));
            debug(state.documents.length);

            // debug(documentsLeft);
            if (debug.enabled) debug("removed: " + docsToRemove.map(function (doc) { return doc._id; }));
            state.persist();
          }
          callback(null, { result: { n: docsToRemove.length, ok: 1 }, deletedCount: docsToRemove.length, connection: db });
        });
      });

      if (typeof callback !== 'function') {
        return new Promise(function(resolve, reject) {
          callback = function(e, r) { e ? reject(e) : resolve(r); };
        });
      }
    },
    deleteOne: function (filter, options, callback) {
      callback = arguments[arguments.length - 1];

      debug('deleteOne %j', filter);

      asyncish(function () {
        var deletionIndex = _.findIndex(state.documents || [], filter);
        var docs = deletionIndex === -1 ? [] : state.documents.splice(deletionIndex, 1);

        if (deletionIndex > -1) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback(null, { result: { n: docs.length, ok: 1 }, deletedCount: docs.length, connection: db });
      });
      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    distinct: NotImplemented,
    drop: function (callback) {
      return db.dropCollection(name, callback);
    },
    dropIndex: NotImplemented,
    dropIndexes: NotImplemented,
    ensureIndex: function (fieldOrSpec, options, callback) { return this.createIndex(fieldOrSpec, options, callback); },
    find: function () {
      var opts = find_options(arguments);
      debug('find %j callback=%s', opts, typeof opts.callback);

      var crsr = cursor(state.documents, opts);

      if (!opts.callback)
        return crsr;

      asyncish(function () {
        opts.callback(null, crsr);
      });
    },
    findAndModify: NotImplemented,
    findAndRemove: NotImplemented,
    findOne: function () {
      var opts = find_options(arguments);
      debug('findOne %j callback=%s', opts, typeof opts.callback);

      var crsr = cursor(state.documents, opts);

      if (!opts.callback)
        return crsr.next();

      crsr.next().then(function (doc) {
        opts.callback(null, doc);
      });
    },
    findOneAndDelete: NotImplemented,
    findOneAndReplace: NotImplemented,
    findOneAndUpdate: function (selector, data, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof options!=='object') options = {};
      var self = this;
      this.updateOne(selector, data, options)
        .then(function (opResult) {
          let findResult = {
            ok: 1,
            lastErrorObject: null
          };
          var findQuery = { _id: opResult.upsertedId };
          if (options.upsert === true && opResult.upsertedId._id) findQuery._id = opResult.upsertedId._id;
          self.findOne(findQuery)
            .catch(callback)
            .then(function (doc) {
              findResult.value = doc;
              if (options.upsert) {
                findResult.lastErrorObject = {
                  n: 1,
                  updatedExisting: !opResult.upsertedCount,
                };
                if (!!opResult.upsertedCount) findResult.lastErrorObject.upserted = opResult.upsertedId._id;
              }
              callback(null, findResult);
            });
        })
        .catch(callback);

      if (typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    geoHaystackSearch: NotImplemented,
    geoNear: NotImplemented,
    group: NotImplemented,
    indexExists: NotImplemented,
    indexInformation: function (options, callback) {
      return db.indexInformation(name, options, callback);
    },
    indexes: NotImplemented,
    initializeOrderedBulkOp: function () {
      return new bulk(this, true);
    },
    initializeUnorderedBulkOp: function () {
      return new bulk(this, false);
    },
    insert: function (docs, options, callback) {
      debug('insert %j', docs);
      callback = arguments[arguments.length - 1];
      //if(callback===options) options = {};//ignored when mocking
      if (!Array.isArray(docs))
        docs = [docs];
      if (name === 'system.indexes') return iface.createIndexes(docs, callback)

      //make copies to break refs to the persisted docs
      docs = _.cloneDeepWith(docs, cloneObjectIDs);

      //The observed behavior of `mongodb` is that documents
      // are committed until the first error. No information
      // about the successful inserts are return :/
      asyncish(function () {
        var insertedIds = [];
        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          if (!doc._id) doc._id = pk();

          var conflict = state.findConflict(doc);
          if (conflict) {
            state.persist();
            return callback(conflict);
          }

          if (!state.documents) state.documents = [doc];
          else state.documents.push(doc);

          insertedIds.push(doc._id)
        }

        state.persist();
        callback(null, {
          insertedIds: insertedIds,
          insertedCount: docs.length,
          result: { ok: 1, n: docs.length },
          connection: {},
          ops: _.cloneDeepWith(docs, cloneObjectIDs)
        });
      });
      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    get insertMany() { return this.insert; },
    insertOne: function (doc, options, callback) {
      callback = arguments[arguments.length - 1];

      this.insert([doc], options, function (e, r) {
        if (e) return callback(e)
        callback(null, {
          insertedId: r.insertedIds[0],
          insertedCount: r.result.n,
          result: r.result,
          connection: r.connection,
          ops: r.ops
        })
      })

      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    isCapped: NotImplemented,
    listIndexes: NotImplemented,
    mapReduce: NotImplemented,
    options: NotImplemented,
    parallelCollectionScan: NotImplemented,
    persist: function () {
      //this is one of the very few functions that are unique
      // to the `mock-mongo` interface. It causes a collection
      // to be materialized and the data to be persisted to disk.
      state.persist();
    },
    // reIndex: NotImplemented,
    remove: function (selector, options, callback) {
      callback = arguments[arguments.length - 1];

      debug('remove %j', selector);

      asyncish(function () {
        var docs = _.remove(state.documents || [], selector);
        if (docs.length) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback(null, {result:{n:docs.length,ok:1}, ops:docs, connection:db});
      });
      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    rename: NotImplemented,
    replaceOne: NotImplemented,
    save: function (doc, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof options!=='object') options = {};
      return this.update({ _id: doc._id }, doc, Object.assign({}, options, { upsert: true }), callback)
    },
    stats: NotImplemented,
    update: function (selector, data, options, callback) {
      callback = arguments[arguments.length - 1];
      if (typeof options !== 'object') options = {};

      var opResult = {
        result: {
            ok: 1,
            nModified: 0,
            n: 0
        },
        connection:db
      };
      var action = (options.upsert?"upsert: ":"update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function () {
        var docs = state.documents || [];
        if (options.multi) {
          docs = docs.filter(sift(selector))
        }
        else {
          docs = first(selector, docs) || []
        }
        if (!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloneData = upsertClone(selector, data);
          var cloned = _.cloneDeepWith(cloneData, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if (conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if (!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          opResult.result.n = 1;
          opResult.result.nModified = 1;
          opResult.ops = [cloned];
        }
        else {
          debug('%s.%s checking for index conflicts', name, action);
          for (var i = 0; i < docs.length; i++) {
            var conflict = modify(docs[i], data, state);
            if (conflict) return callback(conflict);
          }
          opResult.result.n = docs.length;
          opResult.result.nModified = docs.length;
        }

        state.persist();
        callback(null, opResult);
      });

      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    updateMany: function (selector, data, options, callback) {
      callback = arguments[arguments.length - 1];
      if (typeof options !== 'object') options = {};

      var opResult = {
        result: {
          ok: 1,
          nModified: 0,
          n: 0
        },
        connection: db,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      };
      var action = (options.upsert ? "upsert: " : "update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function () {
        var docs = (state.documents || []).filter(sift(selector));
        if (!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloneData = upsertClone(selector, data);
          var cloned = _.cloneDeepWith(cloneData, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if (conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if (!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          opResult.matchedCount = opResult.result.n = 1;
          opResult.upsertedCount = opResult.result.nModified = 1;
          opResult.upsertedId = { _id: cloned._id };
        }
        else {
          debug('%s.%s checking for index conflicts', name, action);
          for (var i = 0; i < docs.length; i++) {
            var conflict = modify(docs[i], data, state);
            if (conflict) return callback(conflict);
          }
          opResult.matchedCount = opResult.result.n = docs.length;
          opResult.modifiedCount = opResult.result.nModified = docs.length;
        }

        state.persist();
        callback(null, opResult);
      });

      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },
    updateOne: function (selector, data, options, callback) {
      callback = arguments[arguments.length - 1];
      if (typeof options !== 'object') options = {};

      var opResult = {
        result: {
          ok: 1,
          nModified: 0,
          n: 0
        },
        connection: db,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      };
      var action = (options.upsert ? "upsert: " : "update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function () {
        var docs = first(selector, state.documents || []) || [];
        if (!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);


        if(!docs.length && options.upsert) {
          var cloneData = upsertClone(selector, data);
          var cloned = _.cloneDeepWith(cloneData, cloneObjectIDs);
          cloned._id = cloned._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if (conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if (!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          opResult.matchedCount = opResult.result.n = 1;
          opResult.upsertedCount = opResult.result.nModified = 1;
          opResult.upsertedId = { _id: cloned._id };
        }
        else if (docs.length > 0) {
          debug('%s.%s checking for index conflicts', name, action);
          var conflict = modify(docs[0], data, state);
          if (conflict) return callback(conflict);
          opResult.matchedCount = opResult.result.n = docs.length;
          opResult.modifiedCount = opResult.result.nModified = docs.length;
          opResult.upsertedId = docs[0]._id;
        }

        state.persist();
        callback(null, opResult);
      });

      if (typeof callback !== 'function') {
        return new Promise(function (resolve, reject) {
          callback = function (e, r) { e ? reject(e) : resolve(r) };
        })
      }
    },

    toJSON: function () {
      return state;
    }
  };
  iface.removeOne = iface.deleteOne;
  iface.removeMany = iface.deleteMany;
  iface.dropAllIndexes = iface.dropIndexes;
  return iface;
};
function modify(original, updates, state) {
  var updated = modifyjs(original, updates);
  updated._id = original._id;
  var conflict = state.findConflict(updated, original);
  if (conflict) {
    debug('conflict found %j', conflict);
    return conflict;
  }
  // remove unset properties
  if (typeof updates.$unset === "object") {
    Object.keys(updates.$unset).forEach(function (k) {
      _.unset(original, k);
    });
  }
  _.assign(original, updated);
}
function NotImplemented() {
  throw Error('Not Implemented');
}
function cloneObjectIDs(value) {
  return value instanceof ObjectId ? ObjectId(value) : undefined;
}
function restoreObjectIDs(originalValue, updatedValue) {
  return updatedValue && updatedValue.constructor.name === 'ObjectID' && updatedValue.id ? ObjectId(updatedValue.id) : undefined;
}

function isOperator(key) {
  return key.length > 0 && key[0] === '$';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProducingEmptyObject(obj) {
  assert(isPlainObject(obj), 'Invalid "obj" argument. Must be a plain object.');

  for (const key of Object.keys(obj)) {
      if (key === '$and' || !isOperator(key)) {
          return false;
      }
  }

  return true;
}

function operatorArrayToNormalizedObject(array, result) {
  assert(Array.isArray(array), 'Invalid "array" argument. Must be an array.');

  for (const item of array) {
    assert(isPlainObject(item), 'MongoError: $or/$and/$nor entries need to be full objects.');

    for (const itemKey of Object.keys(item)) {
        assert(!Boolean(result[itemKey]), `MongoError: cannot infer query fields to set, path '${itemKey}' is matched twice.`);
    }

    normalizeSelectorToData(item, result);
  }
}

/*
Normalizing a selector object to data object here means flattening $and operators,
getting rid of $or and $nor operators, conserving the structure when needed.
*/
function normalizeSelectorToData(obj, result) {
  result = result || {};

  assert(isPlainObject(obj), 'Invalid "obj" argument. Must be a plain object.');

  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // Normalize the $and operator array.
    if (key === '$and') {
      operatorArrayToNormalizedObject(val, result); // Merge into result.
      continue;
    }

    // Skip other operators ($or and $nor).
    if (isOperator(key)) {
      continue;
    }

    // Process non plain objects as is.
    if (!isPlainObject(val)) {
      result[key] = val;
      continue;
    }

    // Ensure processed object would still be meaningful.
    if (!isProducingEmptyObject(val)) {
      result[key] = normalizeSelectorToData(val);
    }
  }

  return result;
}

function upsertClone (selector, data) {
  if (data.$setOnInsert) {
    var dataToClone = {};
    dataToClone.$set = objectAssignDeep({}, data.$set, data.$setOnInsert);
    selector = normalizeSelectorToData(selector);
    return objectAssignDeep({}, modifyjs({}, selector || {}), modifyjs({}, dataToClone));
  }
  selector = normalizeSelectorToData(selector);
  return objectAssignDeep({}, modifyjs({}, data || {}), modifyjs({}, selector || {}));
}

function first(query, collection) {
  return collection[collection.findIndex(sift(query))];
}

function count() {
  var opts = find_options(arguments);
  return this.find(opts.query || {}, opts).count(opts.callback);
}

