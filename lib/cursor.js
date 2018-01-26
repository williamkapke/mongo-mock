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

  function getDocs(applySkipLimit) {
    state = Cursor.OPEN;
    var docs = sift(opts.query, documents);
    if (opts.sort) {
      docs = docs.sort(function(a,b) {
        var retVal = 0;
        for (var field in opts.sort) {
          var aVal = _.get(a, field);
          var bVal = _.get(b, field);
          if (aVal > bVal) retVal = 1;
          else if (aVal < bVal) retVal = -1;
          retVal *= opts.sort[field];

          if (retVal !== 0) break; // no need to continue;
        }

        return retVal;
      });
    }
    if (applySkipLimit) {
      docs = docs.slice(opts.skip||0, opts.skip+(opts.limit||docs.length));
    }
    docs = _.cloneDeep(docs, cloneObjectIDs);

    if(docs.length && opts.fields) {
      // The MongoDB does always return _id, if it wasn't opt out
      opts.fields._id = opts.fields._id === 0 ? 0 : 1;
      var validFields = _.pick(opts.fields, function (value) { return !!value; });
      var props = Object.keys(validFields);
      docs = docs.map(function (doc) { return _.pick(doc, props); }); //only supports simple projections. PRs welcome! :)
    }
    return docs;
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

function NotImplemented(){
  throw Error('Not Implemented');
}

function cloneObjectIDs(value) {
  return value instanceof ObjectId? ObjectId(value) : undefined;
}
