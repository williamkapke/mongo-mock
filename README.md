mongo-mock &nbsp;&nbsp;&nbsp;&nbsp;[![Build Status](https://travis-ci.org/williamkapke/mongo-mock.svg?branch=master)](https://travis-ci.org/williamkapke/mongo-mock)
=======================================================================================================================================================================

This is an in-memory _'pretend'_ mongodb. The goal is to make the interface compatible with
[the real mongodb](https://github.com/mongodb/node-mongodb-native) module so they are interchangeable.

There are a TON of features for mongo and I can't write them all myself- so **pull requests are encouraged!**
My initial goal was to provide _basic_ CRUD operations to enable this to work as a throw-something-together tool.

## Why?
Maybe you don't want to (or can't) connect to a MongoDB instance for your tests?<br>
Maybe you want to throw together a quick example app?

## Demo code
```javascript
var mongodb = require('mongo-mock');
mongodb.max_delay = 0;//you can choose to NOT pretend to be async (default is 400ms)
var MongoClient = mongodb.MongoClient;
MongoClient.persist="mongo.js";//persist the data to disk

// Connection URL
var url = 'mongodb://localhost:27017/myproject';
// Use connect method to connect to the Server
MongoClient.connect(url, {}, function(err, db) {
  // Get the documents collection
  var collection = db.collection('documents');
  // Insert some documents
  var docs = [ {a : 1}, {a : 2}, {a : 3}];
  collection.insertMany(docs, function(err, result) {
    console.log('inserted',result);

    collection.updateOne({ a : 2 }, { $set: { b : 1 } }, function(err, result) {
      console.log('updated',result);

      collection.findOne({a:2}, {b:1}, function(err, doc) {
        console.log('foundOne', doc);

        collection.removeOne({ a : 3 }, function(err, result) {
          console.log('removed',result);

          collection.find({}, {_id:-1}).toArray(function(err, docs) {
            console.log('found',docs);
            
            function cleanup(){            
              var state = collection.toJSON();
              // Do whatever you want. It's just an Array of Objects.
              state.documents.push({a : 2});
              
              // truncate
              state.documents.length = 0;
              
              // closing connection
              db.close();
            }
            
            setTimeout(cleanup, 1000);
          });
        });
      });
    });
  });
});
```

## Install
Well, you know.. the usual:
```
$ npm install mongo-mock
```
