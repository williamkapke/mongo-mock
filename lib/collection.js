var _ = require('lodash');
var ObjectId = require('bson-objectid');
var debug = require('debug')('mongo-mock:collection');
var asyncish = require('../').asyncish;
var cursor = require('./cursor.js');
var modifyjs = require('modifyjs');

var sift = require('../sift.js');

function addToSet (array, other) {
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
  debug('initializing instance of `%s` with %s documents', name, state.documents? state.documents.length : undefined);

  var interface = {
    get collectionName(){ return name; },
    get hit(){ NotImplemented() },
    get name(){ return name; },
    get namespace(){ return db.databaseName+'.'+name; },
    get writeConcern(){ NotImplemented() },

    aggregate: NotImplemented,
    bulkWrite: NotImplemented,
    count: function() {
      var opts = find_options(arguments);
      return this.find(opts.query || {}, opts).count(opts.callback);
    },
    createIndex: function (keys, options, callback) {
      return db.createIndex(name, keys, options, callback);
    },
    createIndexes: NotImplemented,
    deleteMany: function (filter, options, callback) {
      callback = arguments[arguments.length-1];

      debug('deleteMany %j', filter);

      asyncish(function() {
        var docs = _.remove(state.documents||[], filter);
        if(docs.length) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback(null, {result:{n:docs.length, ok: 1}, deletedCount:docs.length, connection:db});
      });
      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    deleteOne: function (filter, options, callback) {
      callback = arguments[arguments.length-1];

      debug('deleteOne %j', filter);

      asyncish(function() {
        var deletionIndex = _.findIndex(state.documents||[], filter);
        var docs = deletionIndex === -1 ? [] : state.documents.splice(deletionIndex, 1);

        if(deletionIndex > -1) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback(null, {result:{n:docs.length, ok: 1}, deletedCount:docs.length, connection:db});
      });
      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    distinct: NotImplemented,
    drop: function (callback) {
      db.dropCollection(name, callback);
    },
    dropIndex: NotImplemented,
    dropIndexes: NotImplemented,
    ensureIndex: function (fieldOrSpec, options, callback) { return this.createIndex(fieldOrSpec, options, callback); },
    find: function () {
      var opts = find_options(arguments);
      debug('find %j callback=%s', opts, typeof opts.callback);

      var crsr = cursor(state.documents, opts);

      if(!opts.callback)
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

      if(!opts.callback)
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
          self.findOne({_id: opResult.upsertedId})
            .catch(callback)
            .then(function (doc) {
              findResult.value = doc;
              callback(null, findResult);
            });
        })
        .catch(callback);

      if(typeof callback!=='function') {
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
    initializeOrderedBulkOp: NotImplemented,
    initializeUnorderedBulkOp: NotImplemented,
    insert: function(docs, options, callback) {
      debug('insert %j', docs);
      callback = arguments[arguments.length-1];
      //if(callback===options) options = {};//ignored when mocking
      if(!Array.isArray(docs))
        docs = [docs];
      if(name==='system.indexes') return interface.createIndexes(docs, callback)

      //make copies to break refs to the persisted docs
      docs = _.cloneDeepWith(docs, cloneObjectIDs);

      //The observed behavior of `mongodb` is that documents
      // are committed until the first error. No information
      // about the successful inserts are return :/
      asyncish(function () {
        var insertedIds = [];
        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          if(!doc._id) doc._id = pk();

          var conflict = state.findConflict(doc);
          if(conflict) {
            state.persist();
            return callback(conflict);
          }

          if(!state.documents) state.documents = [doc];
          else state.documents.push(doc);

          insertedIds.push(doc._id)
        }

        state.persist();
        callback(null, {
          insertedIds: insertedIds,
          insertedCount: docs.length,
          result: {ok:1,n:docs.length},
          connection: {},
          ops: _.cloneDeepWith(docs, cloneObjectIDs)
        });
      });
      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    get insertMany() { return this.insert; },
    insertOne: function(doc, options, callback) {
      callback = arguments[arguments.length-1];

      this.insert([doc], options, function (e, r) {
        if(e) return callback(e)
        callback(null, {
          insertedId: r.insertedIds[0],
          insertedCount: r.result.n,
          result: r.result,
          connection: r.connection,
          ops: r.ops
        })
      })

      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
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
    reIndex: NotImplemented,
    remove: function (selector, options, callback) {
      callback = arguments[arguments.length-1];

      debug('remove %j', selector);

      asyncish(function() {
        var docs = _.remove(state.documents||[], selector);
        if(docs.length) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback(null, {result:{n:docs.length}, ops:docs, connection:db});
      });
      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
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
      callback = arguments[arguments.length-1];
      if(typeof options!=='object') options = {};

      var result = {connection:db};
      var action = (options.upsert?"upsert: ":"update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function() {
        var docs = (options.multi? sift : first)(selector, state.documents||[]) || [];
        if(!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloned = _.cloneDeepWith(data.$setOnInsert || data.$set || data, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if(conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if(!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          result.n = 1;
          result.ops = [cloned];
        }
        else {
          debug('%s.%s checking for index conflicts', name, action);
          for (var i = 0; i < docs.length; i++) {
            var conflict = modify(docs[i], data, state);
            if (conflict) return callback(conflict);
          }
          result.n = docs.length;
        }

        state.persist();
        callback(null, result);
      });

      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    updateMany: function (selector, data, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof options!=='object') options = {};

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
      var action = (options.upsert?"upsert: ":"update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function() {
        var docs = sift(selector, state.documents||[]) || [];
        if(!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloned = _.cloneDeepWith(data.$setOnInsert || data.$set, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if(conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if(!state.documents) state.documents = [cloned];
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

      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },
    updateOne: function (selector, data, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof options!=='object') options = {};

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
      var action = (options.upsert?"upsert: ":"update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function() {
        var docs = first(selector, state.documents||[]) || [];
        if(!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloned = _.cloneDeepWith(data.$setOnInsert || data.$set || data, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if(conflict) {
            debug('conflict found %j', conflict);
            return callback(conflict);
          }

          if(!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          opResult.matchedCount = opResult.result.n = 1;
          opResult.upsertedCount = opResult.result.nModified = 1;
          opResult.upsertedId = { _id: cloned._id };
        }
        else {
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

      if(typeof callback!=='function') {
        return new Promise(function (resolve,reject) {
          callback = function (e, r) { e? reject(e) : resolve(r) };
        })
      }
    },

    toJSON: function () {
      return state;
    }
  };
  interface.removeOne = interface.deleteOne;
  interface.removeMany = interface.deleteMany;
  interface.dropAllIndexes = interface.dropIndexes;
  return interface;
};
function modify(original, updates, state) {
  var updated = modifyjs(original, updates);
  updated._id = original._id;
  var conflict = state.findConflict(updated, original);
  if(conflict) {
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
function NotImplemented(){
  throw Error('Not Implemented');
}
function cloneObjectIDs(value) {
  return value instanceof ObjectId? ObjectId(value) : undefined;
}
function restoreObjectIDs(originalValue, updatedValue) {
  return updatedValue && updatedValue.constructor.name === 'ObjectID' && updatedValue.id ? ObjectId(updatedValue.id) : undefined;
}
function first(query, collection) {
  return collection[sift.indexOf(query, collection)];
}

function find_options(args) {
  if(!args) args = [];
  var signature = Array.prototype.map.call(args, function(arg){ return Array.isArray(arg)? "array" : typeof arg }).join();
  var options = {
    query: args[0],
    fields: args[1],
    skip: 0,
    limit: 0,
    callback: /function$/.test(signature)? args[args.length-1] : undefined
  };
  switch(signature) {
    //callback?
    case "":
    case "undefined":
    case "function":
      options.query = {};
      options.fields = {};
      break;
    //selector, callback?,
    case "object":
    case "object,function":
      options.fields = {};
      break;
    //selector, fields, callback?
    //selector, options, callback?
    case "object,object":
    case "object,undefined,function":
    case "object,object,function":
      //sniff for a 1 or -1 to detect fields object
      if(!args[1] || Math.abs(args[1][0])===1) {
        options.fields = args[1];
      }
      else {
        if(args[1].skip) options.skip = args[1].skip;
        if(args[1].limit) options.limit = args[1].limit;
        if(args[1].fields) options.fields = args[1].fields;
        if(args[1].projection) options.fields = args[1].projection;
      }
      break;
    //selector, fields, options, callback?
    case "object,object,object":
    case "object,object,object,function":
      if(args[2].skip) options.skip = args[2].skip;
      if(args[2].limit) options.limit = args[2].limit;
      if(args[2].fields) options.fields = args[2].fields;
      if(args[2].projection) options.fields = args[2].projection;
      break;
    //selector, fields, skip, limit, timeout, callback?
    case "object,object,number,number,number":
    case "object,object,number,number,number,function":
      options.timeout = args[4];
    //selector, fields, skip, limit, callback?
    case "object,object,number,number":
    case "object,object,number,number,function":
      options.skip = args[2];
      options.limit = args[3];
      //if(typeof args[4]==="number") options.timeout = args[4];
      break;
    default:
      throw new Error("unknown signature: "+ signature);
  }
  return options;
}