var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('mongo-mock:cursor');
var asyncish = require('../').asyncish;


var Cursor = module.exports = function(collection, options) {
  debug('initializing cursor');
  var i = 0;
  var state = Cursor.INIT;

  var interface = {
    batchSize: NotImplemented,
    clone: NotImplemented,
    close: function (callback) {
      state = Cursor.CLOSED;
      debug('closing cursor');
      interface.emit('close');
      if(callback) return callback(null, interface);
    },
    each: NotImplemented,
    next: NotImplemented,
    rewind: NotImplemented,
    toArray: function (callback) {
      if(!callback) throw new Error('callback is mandatory');
      debug('cursor.toArray()');

      state = Cursor.OPEN;
      collection.find(options.query, options.fields, options, function (err, docs) {
        i = docs.length;
        interface.close();
        callback(null, docs);
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


















