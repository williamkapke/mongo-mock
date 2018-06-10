var delay = 400;

module.exports = {
  get max_delay() { return delay; },
  set max_delay(n) { delay = Number(n) || 0; },
  // pretend we are doing things async
  asyncish: function asyncish(callback) {
    setTimeout(callback, Math.random()*(delay));
  },
  find_options: find_options,
  get MongoClient() { return require('./lib/mongo_client.js') },
  get ObjectId() { return require('bson-objectid') },
  get ObjectID() { return require('bson-objectid') }
};

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
