mongo-mock &nbsp;&nbsp;&nbsp;&nbsp;[![Circle CI](https://circleci.com/gh/williamkapke/mongo-mock/tree/master.svg?style=svg)](https://circleci.com/gh/williamkapke/mongo-mock/tree/master)
==========

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
  collection.insert(docs, function(err, result) {
    console.log('inserted',result);

    collection.update({ a : 2 }, { $set: { b : 1 } }, function(err, result) {
      console.log('updated',result);

      collection.findOne({a:2}, {b:1}, function(err, doc) {
        console.log('foundOne', doc);

        collection.remove({ a : 3 }, function(err, result) {
          console.log('removed',result);

          collection.find({}, {_id:-1}).toArray(function(err, docs) {
            console.log('found',docs);

            setTimeout(db.close, 1000);
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

license
=======
The MIT License (MIT)

Copyright (c) 2015 William Kapke

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
