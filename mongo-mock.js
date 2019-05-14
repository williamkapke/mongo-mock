var delay = 400;

module.exports = {
  get max_delay() { return delay; },
  set max_delay(n) { delay = Number(n) || 0; },
  // pretend we are doing things async
  asyncish: function asyncish(callback) {
    setTimeout(callback, Math.random()*(delay));
  },
  get find_options() { return require('./lib/find_options.js') },
  get MongoClient() { return require('./lib/mongo_client.js') },
  get ObjectId() { return require('bson-objectid') },
  get ObjectID() { return require('bson-objectid') }
};
