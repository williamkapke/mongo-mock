var _ = require('lodash');
var fs = require('fs');
var ObjectId = require('bson-objectid');
var debug = require('debug')('mongo-mock');
var inspect = require('util').inspect;
var dbs = {};
var delay = 400;

module.exports = {
  get max_delay() {
    return delay;
  },
  set max_delay(n) {
    delay = Number(n) || 0;
  },
  find_options: find_options,
  MongoClient: {
    connect: function (connString, options, callback) {
      callback = arguments[arguments.length - 1];
      if(!options || callback===options) options = {};
      debug('connecting ' + connString);

      asyncish(function () {
        //keep the process running like a live connection would
        var open = setInterval(function () {}, 600000);

        var connected_db = {
          get open() { return open; },
          collection: function (name) {
            if (!open) throw new Error("Connection closed");
            return collections[name] || (collections[name] = collection(connected_db, name));
          },
          close: function () {
            debug('closing ' + connString);
            clearInterval(open);
            open = false;
          },
          persist: function (cb) {
            if (!persist) return asyncish(cb);
            fs.writeFile(options.persist, JSON.stringify(collections, null, 2), cb);
          }
        };

        var persist = options.persist;
        var persisted = persist? try_load(persist, connected_db) : {};
        var collections = persisted || {};
        dbs[connString] = connected_db;
        callback(null, connected_db);
      });
    }
  }
};

function collection(connection, name, persisted) {
  var collection = persisted || [];
  var pk_index = collection.length? _.indexBy(collection, '_id') : {};
  var debug = require("debug")("mongo-mock:"+name);

  var mock = {
    insert: function(data, options, callback) {
      if(!connection.open) return callback(new Error("Connection closed"));
      callback = arguments[arguments.length-1];
      //if(callback===options) options = {};//ignored when mocking
      if(!Array.isArray(data))
        data = [data];

      asyncish(function() {
        data.forEach(function(doc) {
          var id = doc._id;
          if(!id) id = doc._id = ObjectId();
          if(debug.enabled) debug("insert: _id="+id);

          if(pk_index[id]) callback(new Error("Duplicate document"));
          pk_index[id] = doc;
          collection.push(doc);
        });
        callback(null, {result:{n:data.length}, ops:data, connection:connection});
      });
    },

    find: function(query, fields, callback) {
      var opts = find_options(arguments);
      if(!connection.open) return opts.callback(new Error("Connection closed"));
      if(debug.enabled) debug("find: " + inspect(opts.query));

      asyncish(function() {
        var docs = _.where(collection, opts.query);
        var props = Object.keys(opts.fields);
        var type = opts.fields[props[0]];
        type = type===1? "pick" : type===-1? "omit" : undefined;
        if(docs.length && type) {
          docs = docs.map(function(doc) {
            return _[type](doc, props);//only supports simple projections. PR welcome! :)
          });
        }
        opts.callback(null, docs);
      })
    },

    findOne: function(query, fields, callback) {
      var opts = find_options(arguments);
      if(!connection.open) return opts.callback(new Error("Connection closed"));
      if(debug.enabled) debug("findOne: " + inspect(opts.query));

      asyncish(function() {
        var first = _.find(collection, opts.query);
        if(first && opts.fields){
          var props = Object.keys(opts.fields);
          var type = opts.fields[props[0]];
          type = type===1? "pick" : type===-1? "omit" : undefined;
          if(type)
            first = _[type](first, props);//only supports simple projections. PR welcome! :)
        }
        opts.callback(null, first);
      })
    },

    update: function(query, data, options, callback) {
      callback = arguments[arguments.length-1];
      if(typeof callback !== "function") callback = undefined;
      else if(callback===options) options = {};
      if(!connection.open) return callback && callback(new Error("Connection closed"));

      if(debug.enabled) debug((options.upsert?"upsert: ":"update: ") + inspect(query));

      connection.persist(function() {
        var docs = (options.multi? _.where : _.find)(collection, query) || [];
        if(!Array.isArray(docs)) docs = [docs];

        if(!docs.length && options.upsert) {
          var cloned = _.clone(data.$set?data.$set:data);
          cloned._id = query._id || ObjectId();
          collection.push(cloned);
          pk_index[cloned._id] = data;
          docs = [cloned];
        }
        else {
          docs.forEach(function(doc) {
            _.merge(doc, data.$set);
          });
        }
        callback && callback(null, docs.length);
      });
    },

    remove: function(query, callback) {
      if(!connection.open) return callback && callback(new Error("Connection closed"));
      if(debug.enabled) debug("remove: " + inspect(query));

      connection.persist(function() {
        var docs = _.remove(collection, query);
        docs.forEach(function(doc) {
          var success = delete pk_index[doc._id];
          if(debug.enabled) debug("remove: _id="+doc._id + (success?" 👍":" 👎"));
        });
        callback && callback(null, {result:{n:docs.length}, ops:docs, connection:connection});
      });
    },
    //this is here for when we 'dump' the data
    toJSON: function() {
      return collection;
    }
  };
  return mock;
}

function try_load(path, connection) {
  try{
    var data = require(path);
    Object.keys(data).forEach(function (key) {
      data[key] = collection(connection, key, data[key]);
    });
    return data;
  }
  catch(e) { return {}; }
}

var noop = Boolean;
function find_options(args) {
  if(!args) args = [];
  var signature = Array.prototype.map.call(args, function(arg){ return Array.isArray(arg)? "array" : typeof arg }).join();
  var options = {
    query: args[0],
    fields: args[1],
    skip: 0,
    limit: 0,
    callback: /function$/.test(signature)? args[args.length-1] : noop
  };
  switch(signature) {
    //callback?
    case "":
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

// pretend we are doing things async
function asyncish(callback) {
  setTimeout(callback, Math.random()*(delay));
}

