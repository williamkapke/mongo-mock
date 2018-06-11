var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('mongo-mock:cursor');
var asyncish = require('../').asyncish;
var sift = require('../sift.js');
var _ = require('lodash');
var ObjectId = require('bson-objectid');


var Cursor = module.exports = function(documents, opts) {
  debug('initializing cursor');
  var i = 0;
  var state = Cursor.INIT;
  if(!documents) documents = [];

  function notUndefined(x) {
    return typeof x === 'undefined' ? null : x;
  }
  function getDocs(applySkipLimit) {
    state = Cursor.OPEN;
    var docs = sift(opts.query, documents);
    if (opts.sort) {
      docs = docs.sort(function(a,b) {
        var retVal = 0;
        for (var field in opts.sort) {
          var aVal = notUndefined(_.get(a, field));
          var bVal = notUndefined(_.get(b, field));
          if (aVal > bVal) retVal = 1;
          else if (aVal < bVal) retVal = -1;
          retVal *= opts.sort[field];

          if (retVal !== 0) break; // no need to continue;
        }

        return retVal;
      });
    }
    if (opts.map) {
      docs = docs.map(opts.map);
    }
    if (applySkipLimit) {
      docs = docs.slice(opts.skip||0, opts.skip+(opts.limit||docs.length));
    }
    docs = _.cloneDeepWith(docs, cloneObjectIDs);

    return applyProjection(docs, opts.fields);
  }

  var interface = {
    cmd: opts,

    batchSize: NotImplemented,

    clone: NotImplemented,

    close: function (callback) {
      state = Cursor.CLOSED;
      docs = [];
      debug('closing cursor');
      interface.emit('close');
      if(callback) return callback(null, interface);
    },

    count: function (applySkipLimit, callback) {
      callback = arguments[arguments.length-1];
      applySkipLimit = (applySkipLimit === callback) ? false : applySkipLimit;
      if(typeof callback !== 'function')
        return Promise.resolve(getDocs(applySkipLimit).length);

      asyncish(function () {
        callback(null, getDocs(applySkipLimit).length)
      });
    },

    project: function (toProject) {
      _.assign(opts, {
        fields: toProject,
      });
      return this;
    },

    each: NotImplemented,

    limit: function (n) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.limit = n;
      return this;
    },

    next: function (callback) {
      var docs = getDocs(true);
      var limit = Math.min(opts.limit || Number.MAX_VALUE, docs.length);
      var next_idx = i<limit? i++ : i;
      var doc = docs[next_idx] || null;
      if(typeof callback !== 'function')
        return Promise.resolve(doc);

      asyncish(function () {
        callback(null, doc);
      });
    },

    rewind: function () {
      i = 0;
    },

    size: function(callback) {
      return this.count(true, callback);
    },

    skip: function (n) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.skip = n;
      return this;
    },

    sort: function(fields) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.sort = fields;
      return this;
    },

    map: function(fn) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.map = fn;
      return this;
    },

    toArray: function (callback) {
      debug('cursor.toArray()');

      function done() {
        interface.rewind();
        return getDocs(true);
      }

      if(!callback)
        return Promise.resolve(done());

      asyncish(function () {
        callback(null, done())
      });
    }
  };
  interface.__proto__ = EventEmitter.prototype;
  return interface;
};
Cursor.INIT = 0;
Cursor.OPEN = 1;
Cursor.CLOSED = 2;
Cursor._applyProjection = applyProjection; //expose for testing, do not reference!
Cursor._getProjectionType = getProjectionType; //expose for testing, do not reference!

function getProjectionType(fields) {
  var values = Object.values(_.omit(fields, '_id'));
  if (!values.length) return fields._id === 0 ? 'omit' : 'pick';

  var sum = _.sum(values);
  if (sum !== 0 && sum !== values.length)
    throw new Error('Mixed projections types not allowed');
  return sum > 0 ? 'pick' : 'omit'
}
function applyProjection(docs, fields) {
  if(!docs.length || _.isEmpty(fields))
    return docs;

  var props = Object.keys(fields);
  var type = getProjectionType(fields);
  var _id = fields._id;
  // handle special rules for _id
  if ((type === 'pick' && _id === 0) || (type === 'omit' && _id === 1)) {
    props = _.without(props, '_id')
  }
  else if (type === 'pick' && !('_id' in fields)) {
    props.push('_id');
  }
  return docs.map(function (doc) {
    //only supports simple projections. Lodash v4 supports it. PRs welcome! :)
    return _[type](doc, props);
  });
}


  function NotImplemented(){
  throw Error('Not Implemented');
}

function cloneObjectIDs(value) {
  return value instanceof ObjectId? ObjectId(value) : undefined;
}
