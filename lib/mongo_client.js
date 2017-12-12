var Db = require('./db.js');
var servers = {};
var urlparse = require('url').parse;
var ObjectId = require('bson-objectid');
var debug = require('debug')('mongo-mock:mongo_client');
var fs = require('fs');

module.exports = MongoClient;
function MongoClient() {
 this.connect = MongoClient.connect;
}

MongoClient.connect = function(url, options, callback) {
  callback = arguments[arguments.length - 1];
  if(!options || callback===options) options = {};
  url = urlparse(url);

  var server = servers[url.host] || (servers[url.host] = { databases:{}, persist:MongoClient._persist });
  debug('connecting %s%s', url.host, url.pathname);

  var dbname = url.pathname.replace(/^\//, '');
  return new Db(dbname, server).open(callback);
};

MongoClient._persist = persist;
function persist() {
  var filename = MongoClient.persist;
  if(typeof filename!=='string') return;
  debug('persisting to %s', filename);

  var out = "var ObjectID = require('bson-objectid');\n\nmodule.exports = ";
  ObjectId.prototype.toJSON = ObjectId.prototype.inspect;
  out += JSON.stringify(servers, null, 2).replace(/"ObjectID\(([0-9a-f]{24})\)"/g, 'ObjectID("$1")');
  ObjectId.prototype.toJSON = ObjectId.prototype.toHexString;

  fs.writeFileSync(filename, out);
}

MongoClient.load = function (filename, callback) {
  filename = filename || MongoClient.persist || './mongo.json';
  var p = MongoClient.persist;
  if(p) MongoClient.persist = false;//disable while loading

  debug('loading data from %s', filename);
  try{
    var data = require(filename);
  }
  catch(e) {
    debug('Error loading data: %s', e);
  }

  var servers_names = Object.keys(data);

  function create_server(server_name) {
    if(!server_name) {
      MongoClient.persist = p;
      if(callback) callback();
      return;
    }

    var database_names = Object.keys(data[server_name].databases);

    function create_database(database_name) {
      if(!database_name)
        return create_server(servers_names.pop());

      var collections = data[server_name].databases[database_name].collections;
      MongoClient.connect('mongodb://'+server_name+'/'+database_name, function (err, db) {
        if(err) throw err;

        function create_collection(collection) {
          if(!collection) {
            db.close();
            return create_database(servers_names.pop());
          }

          db.createCollection(collection.name, function (err, instance) {
            if(err) throw err;

            function insert(doc) {
              if(!doc) return create_collection(collections.pop());

              if(doc._id) doc._id = ObjectId(doc._id);
              instance.update(doc, doc, {upsert:true}, function (err, result) {
                if(err) throw err;
                process.nextTick(function () {
                  insert(collection.documents.pop());
                });
              });
            }
            insert(collection.documents && collection.documents.pop());
          })
        }
        create_collection(collections.pop());
      });
    }
    create_database(database_names.pop());
  }

  if(typeof callback!=='function') {
    return new Promise(function (resolve) {
      callback = resolve;
      create_server(servers_names.pop());
    })
  } else {
    create_server(servers_names.pop());
  }
};
