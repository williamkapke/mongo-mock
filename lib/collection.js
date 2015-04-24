var _ = require('lodash');
var ObjectId = require('bson-objectid');
var debug = require('debug')('mongo-mock:collection');
var asyncish = require('../').asyncish;
var cursor = require('./cursor.js');

module.exports = function Collection(db, state) {
  var name = state.name;
  var pk = state.pkFactory || ObjectId();
  debug('initializing instance of `%s` with %s documents', name, state.documents? state.documents.length : undefined);

  var interface = {
    get collectionName(){ return name; },
    get hit(){ NotImplemented() },
    get name(){ return name; },
    get namespace(){ return db.databaseName+'.'+name; },
    get writeConcern(){ NotImplemented() },

    aggregate: NotImplemented,
    bulkWrite: NotImplemented,
    count: NotImplemented,
    createIndex: function (keys, options, callback) {
      return db.createIndex(name, keys, options, callback);
    },
    createIndexes: NotImplemented,
    deleteMany: NotImplemented,
    deleteOne: NotImplemented,
    distinct: NotImplemented,
    drop: NotImplemented,
    dropIndex: NotImplemented,
    dropIndexes: NotImplemented,
    ensureIndex: function (fieldOrSpec, options, callback) { throw Error('deprecated'); },
    find: function () {
      var opts = find_options(arguments);
      debug('find %j callback=%s', opts, typeof opts.callback);
      if(!opts.callback)
        return cursor(interface, opts);

      asyncish(function () {
        var documents = state.documents;
        if(!documents) return opts.callback(null, []);

        var docs = _.where(documents, opts.query);
        docs = _.cloneDeep(docs, cloneObjectIDs);
        if(opts.fields) {
          var props = Object.keys(opts.fields);
          var type = opts.fields[props[0]];
          type = type === 1 ? "pick" : type === -1 ? "omit" : undefined;
          if (docs.length && type) {
            docs = docs.map(function (doc) {
              return _[type](doc, props);//only supports simple projections. PRs welcome! :)
            });
          }
        }
        opts.callback(null, docs);
      });
    },
    findAndModify: NotImplemented,
    findAndRemove: NotImplemented,
    findOne: function () {
      var opts = find_options(arguments);
      debug('findOne %j callback=%s', opts, typeof opts.callback);
      if(!opts.callback)
        return cursor(interface, opts);

      asyncish(function () {
        var documents = state.documents;
        if(!documents) return opts.callback(null, null);

        var doc = _.find(documents, opts.query);
        doc = _.cloneDeep(doc, cloneObjectIDs);
        if(opts.fields) {
          var props = Object.keys(opts.fields);
          var type = opts.fields[props[0]];
          type = type === 1 ? "pick" : type === -1 ? "omit" : undefined;
          if (doc && type)
            doc = _[type](doc, props);//only supports simple projections. PRs welcome! :)
        }

        opts.callback(null, doc);
      });
    },
    findOneAndDelete: NotImplemented,
    findOneAndReplace: NotImplemented,
    findOneAndUpdate: NotImplemented,
    geoHaystackSearch: NotImplemented,
    geoNear: NotImplemented,
    group: NotImplemented,
    indexExists: NotImplemented,
    indexInformation: function (options, callback) {
      db.indexInformation(name, options, callback);
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
      docs = _.cloneDeep(docs, cloneObjectIDs);

      //The observed behavior of `mongodb` is that documents
      // are committed until the first error. No information
      // about the successful inserts are return :/
      asyncish(function () {
        for (var i = 0; i < docs.length; i++) {
          var doc = docs[i];
          if(!doc._id) doc._id = pk();

          var conflict = state.findConflict(doc);
          if(conflict) {
            state.persist();
            return callback && callback(conflict);
          }

          if(!state.documents) state.documents = [doc];
          else state.documents.push(doc);
        }

        state.persist();
        if(callback) callback(null, {
          result: {ok:1,n:docs.length},
          connection: {},
          ops: _.cloneDeep(docs, cloneObjectIDs)
        });
      });
    },
    insertMany: NotImplemented,
    insertOne: NotImplemented,
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
      if(typeof callback !== "function") callback = undefined;
      else if(callback===options) options = {};

      debug('remove %j', selector);

      asyncish(function() {
        var docs = _.remove(state.documents||[], selector);
        if(docs.length) {
          if (debug.enabled) debug("removed: " + docs.map(function (doc) { return doc._id; }));
          state.persist();
        }
        callback && callback(null, {result:{n:docs.length}, ops:docs, connection:db});
      });
    },
    rename: NotImplemented,
    replaceOne: NotImplemented,
    save: NotImplemented,
    stats: NotImplemented,
    update: function (selector, data, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof callback !== "function") callback = undefined;
      else if(callback===options) options = {};

      var result = {connection:db};
      var action = (options.upsert?"upsert: ":"update: ");
      debug('%s.%s %j', name, action, selector);

      asyncish(function() {
        var docs = (options.multi? _.where : _.find)(state.documents||[], selector) || [];
        if(!Array.isArray(docs)) docs = [docs];
        debug('%s.%s %j', name, action, docs);

        if(!docs.length && options.upsert) {
          var cloned = _.cloneDeep(data.$setOnInsert || data.$set || data, cloneObjectIDs);
          cloned._id = selector._id || pk();

          debug('%s.%s checking for index conflict', name, action);
          var conflict = state.findConflict(cloned);
          if(conflict) {
            debug('conflict found %j', conflict);
            return callback && callback(conflict);
          }

          if(!state.documents) state.documents = [cloned];
          else state.documents.push(cloned);

          result.n = 1;
          result.ops = [cloned];
        }
        else {
          debug('%s.%s checking for index conflicts', name, action);
          for (var i = 0; i < docs.length; i++) {
            var original = docs[i];
            var updated = _.extend({}, original, data.$set);
            var conflict = state.findConflict(updated, original);
            if(conflict) {
              debug('conflict found %j', conflict);
              return callback && callback(conflict);
            }
            _.merge(original, data.$set);
          }
          result.n = docs.length;
        }

        state.persist();
        callback && callback(null, result);
      });
    },
    updateMany: NotImplemented,
    updateOne: NotImplemented,

    toJSON: function () {
      return state;
    }
  };
  interface.removeOne = interface.deleteOne;
  interface.removeMany = interface.deleteMany;
  interface.dropAllIndexes = interface.dropIndexes;
  return interface;
};
function NotImplemented(){
  throw Error('Not Implemented');
}
function cloneObjectIDs(value) {
  return value instanceof ObjectId? ObjectId(value) : undefined;
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
      }
      break;
    //selector, fields, options, callback?
    case "object,object,object":
    case "object,object,object,function":
      if(args[2].skip) options.skip = args[2].skip;
      if(args[2].limit) options.limit = args[2].limit;
      if(args[2].fields) options.fields = args[2].fields;
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
