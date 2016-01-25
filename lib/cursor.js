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

  var docs;
  function getDocs() {
    if(docs) return docs;

    state = Cursor.OPEN;
    docs = sift(opts.query, documents);
    docs = docs.slice(opts.skip||0, opts.skip+(opts.limit||docs.length));
    docs = _.cloneDeep(docs, cloneObjectIDs);

    if(docs.length && opts.fields) {
      var props = Object.keys(opts.fields);
      var type = opts.fields[props[0]];
      type = type === 1 ? "pick" : type === -1 ? "omit" : undefined;
      if (docs.length && type) {
        docs = docs.map(function (doc) {
          return _[type](doc, props);//only supports simple projections. PRs welcome! :)
        });
      }
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

    count: function (callback) {
      callback = arguments[arguments.length-1];
      if(typeof callback !== 'function')
        return Promise.resolve(getDocs().length);

      asyncish(function () {
        callback(null, getDocs().length)
      });
    },

    each: NotImplemented,

    limit: function (n) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.limit = n;
    },

    next: function (callback) {
      var docs = getDocs();
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

    skip: function (n) {
      if(state !== Cursor.INIT)
        throw new Error('MongoError: Cursor is closed');
      opts.skip = n;
    },

    toArray: function (callback) {
      debug('cursor.toArray()');

      function done() {
        interface.rewind();
        return getDocs();
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

















