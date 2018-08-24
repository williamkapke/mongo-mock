var should = require('should');
var _ = require('lodash');
var mongo = require('../');
var MongoClient = mongo.MongoClient;
var ObjectID = mongo.ObjectID;
var id = ObjectID();
MongoClient.persist = "mongo.js";

// this number is used in all the query/find tests, so it's easier to add more docs
var EXPECTED_TOTAL_TEST_DOCS = 12;

describe('mock tests', function () {
  var connected_db;
  var collection;

  before(function (done) {
    MongoClient.connect("mongodb://someserver/mock_database", function(err, db) {
      connected_db = db;
      collection = connected_db.collection("users");
      done();
    });
  });
  after(function(done) {
    connected_db.close().then(done).catch(done)
  });


  describe('databases', function() {
    it('should list collections', function(done) {
      var listCollectionName = "test_databases_listCollections_collection";
      connected_db.createCollection(listCollectionName, function(err, listCollection) {
        if(err) return done(err);
        connected_db.listCollections().toArray(function(err, items) {
          if(err) return done(err);
          var instance = _.find(items, {name:listCollectionName} );
          instance.should.not.be.undefined;
          done();
        });
      });
    });
    it('should drop collection', function (done) {
      var dropCollectionName = "test_databases_dropCollection_collection";
      connected_db.createCollection(dropCollectionName, function (err, dropCollection){
        if(err) return done(err);
        connected_db.dropCollection(dropCollectionName, function (err, result) {
          if(err) return done(err);
          connected_db.listCollections().toArray(function(err, items) {
            var instance = _.find(items, {name:dropCollectionName} );
            (instance === undefined).should.be.true;
            done();
          });
        });
      });
    });
    it('should load another db', function (done) {
      var otherCollectionName = 'someOtherCollection';
      var otherDb = connected_db.db('some_other_mock_database');
      otherDb.createCollection(otherCollectionName, function (err, otherCollection) {
        if(err) return done(err);
        connected_db.listCollections().toArray(function(err, mainCollections) {
          if(err) return done(err);
          otherDb.listCollections().toArray(function(err, otherCollections) {
            // otherDb should have a separate list of collections
            if(err) return done(err);
            var otherInstance = _.find(otherCollections, {name:otherCollectionName} );
            otherInstance.should.not.be.undefined;
            var mainInstance = _.find(mainCollections, {name:otherCollectionName} );
            (mainInstance === undefined).should.be.true;
            otherDb.close().then(done).catch(done);
          });
        });
      });
    });
  });

  describe('indexes', function () {
    it('should create a unique index', function (done) {
      collection.createIndex({test:1}, {unique:true}, function (err, name) {
        if(err) return done(err);
        name.should.equal('test_1');
        done();
      });
    });

    it('should deny unique constraint violations on insert', function (done) {
      collection.insertMany([{test:333},{test:444},{test:555, baz:1},{test:555,baz:2}], function (err, result) {
        (!!err).should.be.true;
        (!!result).should.be.false;
        err.message.should.equal('E11000 duplicate key error index: mock_database.users.$test_1');

        //the first one should succeed
        collection.findOne({test:555}, function (err, doc) {
          if(err) return done(err);
          (!!doc).should.be.true;
          doc.should.have.property('baz', 1);
          done();
        });
      });
    });
    it('should deny unique constraint violations on update', function (done) {
      collection.update({test:333},{$set:{test:444,baz:2}}, function (err, result) {
        (!!err).should.be.true;
        (!!result).should.be.false;
        err.message.should.equal('E11000 duplicate key error index: mock_database.users.$test_1');

        //make sure it didn't update the data
        collection.findOne({test:333}, function (err, doc) {
          if(err) return done(err);
          (!!doc).should.be.true;
          doc.should.not.have.property('baz');
          done();
        });
      });
    });

    it('should create a non-unique index', function (done) {
      collection.createIndex({test_nonunique:1}, {unique:false}, function (err, name) {
        if(err) return done(err);
        name.should.equal('test_nonunique_1');
        done();
      });
    });

    it('should create a non-unique index by default', function (done) {
      collection.createIndex({test_nonunique_default:1}, {}, function (err, name) {
        if(err) return done(err);
        collection.indexInformation({full:true}, function (err, indexes) {
          if(err) return done(err);
          var index = _.filter(indexes, {name: 'test_nonunique_default_1'})[0];
          index.unique.should.be.false;
          done();
        });
      });
    });

    it('should allow insert with same non-unique index property', function (done) {
      collection.insertMany([
          {test:3333, test_nonunique:3333},
          {test:4444, test_nonunique:4444},
          {test:5555, test_nonunique:3333}], function (err, result) {
        (!!err).should.be.false;
        result.result.ok.should.be.eql(1);
        result.result.n.should.eql(3);
        done();
      });
    });
    it('should allow update with same non-unique index property', function (done) {
      collection.update({test:4444}, {$set:{test_nonunique:3333}}, function (err, result) {
        (!!err).should.be.false;
        result.n.should.eql(1);
        done();
      });
    });
});

  describe('collections', function () {
    'drop,insert,findOne,findOneAndUpdate,update,updateOne,updateMany,remove,deleteOne,deleteMany,save'.split(',').forEach(function(key) {
      it("should have a '"+key+"' function", function () {
        collection.should.have.property(key);
        collection[key].should.be.type('function');
      });
    });

    it('should insert data', function (done) {
      collection.insertOne({test:123}, function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;
        (!!result.ops[0]).should.be.true;
        (!!result.ops[0]._id).should.be.true;
        result.ops[0]._id.toString().should.have.length(24);
        result.ops[0].should.have.property('test', 123);
        result.should.have.property('insertedId');
        result.should.have.property('insertedCount');
        done();
      });
    });
    it('should allow _id to be defined', function (done) {
      collection.insert({_id:id, test:456, foo:true}, function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;
        (!!result.ops[0]).should.be.true;
        (!!result.ops[0]._id).should.be.true;
        result.ops[0]._id.toString().should.have.length(24);
        result.ops[0].should.have.property('test', 456);
        done();
      });
    });

    it('should findOne by a property', function (done) {
      collection.findOne({test:123}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.true;
        doc.should.have.property('_id');
        doc._id.toString().should.have.length(24);//auto generated _id
        doc.should.have.property('test', 123);
        done();
      });
    });
    it('should return only the fields specified by field projection', () =>
      collection.findOne({test:456}, {projection: {foo:1}})
      .then(doc => {
        (!!doc).should.be.true;
        Object.keys(doc).should.eql(['foo', '_id']);
      })
    );
    it('should return only the fields specified', () =>
      collection.findOne({test:456}, {foo:1})
      .then(doc => {
        (!!doc).should.be.true;
        Object.keys(doc).should.eql(['foo', '_id']);
      })
    );
    it('should accept undefined fields', function (done) {
      collection.findOne({test:456}, undefined, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.true;
        doc.should.have.property('_id');
        doc._id.toString().should.have.length(24);//auto generated _id
        doc.should.have.property('test', 456);
        doc.should.have.property('foo', true);
        done();
      });
    });
    it('should findOne by an ObjectID', function (done) {
      collection.findOne({_id:id}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.true;
        doc.should.have.property('_id');
        id.str.should.eql(doc._id.str);
        doc.should.have.property('test', 456);
        done();
      });
    });
    it('should NOT findOne if it does not exist', function (done) {
      collection.findOne({_id:"asdfasdf"}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.false;
        done();
      });
    });

    it('should NOT findOne if the collection has just been created', function (done) {
      var collection = connected_db.collection('some_brand_new_collection');
      collection.findOne({_id:"asdfasdf"}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.false;
        done();
      });
    })

    it('should update one (updateOne)', function (done) {
      //query, data, options, callback
      collection.updateOne({test:123}, { $set: { foo: { bar: "buzz", fang: "dang" } } }, function (err, opResult) {
        if(err) return done(err);
        opResult.result.n.should.equal(1);

        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          (!!doc).should.be.true;
          doc.should.have.property("foo", { bar: "buzz", fang: "dang" });
          done();
        });
      });
    });

    it('should update one (updateOne) with shallow overwrite', function (done) {
      //query, data, options, callback
      collection.updateOne({ test: 123 }, { $set: { foo: { newValue: "bar" } } }, function (err, opResult) {
        if (err) return done(err);
        opResult.result.n.should.equal(1);

        collection.findOne({ test: 123 }, function (err, doc) {
          if (err) return done(err);
          (!!doc).should.be.true;
          doc.should.have.property("foo", { newValue: "bar" });
          done();
        });
      });
    });

    it('should update one (findOneAndUpdate)', function (done) {
      //query, data, options, callback
      collection.findOneAndUpdate({test:123}, {$set:{foo:"john"}}, function (err, opResult) {
        if(err) return done(err);
        opResult.should.have.properties("ok", "lastErrorObject", "value");
        opResult.ok.should.equal(1);
        opResult.value.should.have.property("foo", "john");

        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          (!!doc).should.be.true;
          doc.should.have.property("foo", "john");
          done();
        });
      });
    });

    it('should update one (default)', function (done) {
      //query, data, options, callback
      collection.update({test:123}, {$set:{foo:"bar"}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);

        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          (!!doc).should.be.true;
          doc.should.have.property("foo", "bar");
          done();
        });
      });
    });
    it('should update multi', function (done) {
      collection.update({}, {$set:{foo:"bar"}}, {multi:true}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(8);

        collection.find({foo:"bar"}).count(function (err, n) {
          if(err) return done(err);
          n.should.equal(8);
          done();
        });
      });
    });
    it('should updateMany', function (done) {
      collection.updateMany({}, {$set:{updateMany:"bar"}}, function (err, opResult) {
        if(err) return done(err);
        opResult.result.n.should.equal(8);
        opResult.result.nModified.should.equal(8);
        opResult.matchedCount.should.equal(8);
        opResult.modifiedCount.should.equal(8);

        collection.find({updateMany:"bar"}).count(function (err, n) {
          if(err) return done(err);
          n.should.equal(8);
          done();
        });
      });
    });
    it('should update subdocs in dot notation', function (done) {
      collection.update({}, {$set:{"update.subdocument":true}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);

        collection.find({"update.subdocument":true}).count(function (err, n) {
          if(err) return done(err);
          n.should.equal(1);
          done();
        });
      });
    });
    it('should update subdoc arrays in dot notation', function (done) {
      collection.update({}, {$set:{"update.arr.0": true}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);

        collection.find({"update.arr.0": true}).count(function (err, n) {
          if(err) return done(err);
          n.should.equal(1);
          done();
        });
      });
    });
    it('should $unset', function (done) {
      var original = { test: 237, parent0 :999, parent1 :{ child1 :111, child2 :222, child3 :333, child4 :{ child5 :555}}};
      var expected = '{"test":237,"parent1":{"child1":111,"child3":333,"child4":{}}}';

      collection.insert(original)
      .then(r1 =>
        collection.update({test: 237}, {$unset: { "parent0": 1, "parent1.child2": 1, "parent1.child4.child5": 1 }})
        .then(r2 =>
          collection.findOne({test: 237})
          .then(doc => {
            let copy = _.clone(doc);
            delete copy._id;
            JSON.stringify(copy).should.eql(expected);
          })
        )
      )
      .then(done)
      .catch(done)
    });
    it('should upsert', function (done) {
      //prove it isn't there...
      collection.findOne({test:1}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.false;

        collection.update({test:1}, {test:1,bar:"none"}, {upsert:true}, function (err, result) {
          if(err) return done(err);
          result.n.should.equal(1);

          collection.find({test:1}).count(function (err, n) {
            if(err) return done(err);
            n.should.equal(1);
            done();
          });
        });
      });
    });
    it('should upsert (updateMany)', function (done) {
      //prove it isn't there...
      collection.findOne({upsertMany:1}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.false;

        collection.updateMany({upsertMany:1}, { $set:{upsertMany:1,bar:"none"} }, {upsert:true}, function (err, opResult) {
          if(err) return done(err);
          opResult.result.n.should.equal(1);

          collection.find({upsertMany:1}).count(function (err, n) {
            if(err) return done(err);
            n.should.equal(1);
            done();
          });
        });
      });
    });
    it('should save (no _id)', function (done) {
      //prove it isn't there...
      collection.findOne({test:2}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.false;

        collection.save({test:2,bar:"none"}, function (err, result) {
          if(err) return done(err);
          result.n.should.equal(1);

          collection.find({test:2}).count(function (err, n) {
            if(err) return done(err);
            n.should.equal(1);
            done();
          });
        });
      });
    });
    it('should save (with _id)', function (done) {
      //prove it isn't there...
      collection.findOne({test:2}, function (err, doc) {
        if(err) return done(err);
        (!doc).should.be.false;

        collection.save({_id: doc._id,test:3,bar:"none"}, function (err, result) {
          if(err) return done(err);
          result.n.should.equal(1);

          collection.find({test:3}).count(function (err, n) {
            if(err) return done(err);
            n.should.equal(1);
            done();
          });
        });
      });
    });
    /***************/
    it('should delete one', function (done) {
      //query, data, options, callback
      collection.insert({test:967, delete: true}, function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;

        collection.deleteOne({test:967}, function (err, result) {
          if (err) return done(err);
          result.result.n.should.equal(1);

          collection.findOne({test: 967}, function (err, doc) {
            if (err) return done(err);
            (!!doc).should.be.false;
            done();
          });
        });
      });
    });
    it('should delete one and only one', function (done) {
      //query, data, options, callback
      collection.insertMany([{test:967, delete: true}, {test:5309, delete: true}], function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;

        collection.deleteOne({delete: true}, function (err, result) {
          if (err) return done(err);
          result.result.n.should.equal(1);

          collection.find({delete: true}).count(function (err, n) {
            if (err) return done(err);
            n.should.equal(1);
            done();
          });
        });
      });
    });
    it('should delete many', function (done) {
      //query, data, options, callback
      collection.insertOne({test:967, delete: true}, function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;
        collection.find({delete: true}).count(function (err, n) {
          if (err) return done(err);
          n.should.equal(2);

          collection.deleteMany({delete: true}, function (err, result) {
            if (err) return done(err);
            result.result.n.should.equal(2);

            collection.find({delete: true}).count(function (err, n) {
              if (err) return done(err);
              n.should.equal(0);
              done();
            });
          });
        });
      });
    });
    it('should add to set (default)', function (done) {
      collection.update({test:123}, {$addToSet:{ boo:"bar"}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);
        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          doc.should.have.property("boo", ["bar"]);
          done();
        });
      });
    });
    it('should add to set', function (done) {
      collection.update({test:123}, {$addToSet:{ boo:"foo"}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);
        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          doc.should.have.property("boo", ["bar", "foo"]);
          done();
        });
      });
    });
    it('should not add to set already existing item', function (done) {
      collection.update({test:123}, {$addToSet:{ boo:"bar"}}, function (err, result) {
        if(err) return done(err);
        result.n.should.equal(1);
        collection.findOne({test:123}, function (err, doc) {
          if(err) return done(err);
          doc.should.have.property("boo", ["bar", "foo"]);
          done();
        });
      });
    });
    it('should increment a number', function(done) {
      // add some fields to increment
      collection.update({test:333}, {$set: {incTest: 1, multiIncTest: { foo: 1 }}}, function (err, result) {
        if (err) done(err);
        collection.update({test:333}, { $inc: { incTest: 1, 'multiIncTest.foo': 2}}, function (err, result) {
          if (err) done(err);
          result.n.should.equal(1);
          collection.findOne({test:333}, function (err, doc) {
            if (err) done(err);
            doc.incTest.should.equal(2);
            doc.multiIncTest.foo.should.equal(3);
            done();
          });
        });
      });
    });
    it('should decrement a number', function(done) {
      collection.update({test:333}, { $inc: { incTest: -1, 'multiIncTest.foo': -2, 'some.new.key': 42}}, function (err, result) {
        if (err) done(err);
        result.n.should.equal(1);
        collection.findOne({test:333}, function (err, doc) {
          if (err) done(err);
          doc.incTest.should.equal(1);
          doc.multiIncTest.foo.should.equal(1);
          doc.some.new.key.should.equal(42);
          done();
        });
      });
    });
    it('should push item into array', function (done) {
      collection.update({test:333}, { $set: {pushTest: []}}, function (err, result) {
        if (err) done(err);
        collection.update({test:333}, { $push:{ pushTest: {$each: [ 2 ]} }} ,function (err, result) {
          if (err) done(err);
          result.n.should.equal(1);
          collection.findOne({test:333}, function (err, doc) {
            if (err) done(err);
            doc.pushTest.should.have.length(1);
            doc.pushTest.should.containEql(2);
            done();
          });
        });
      });
    });
    it('should push item into array that does not yet exist on the doc', function (done) {
      collection.update({test:333}, { $push:{ newPushTest: {$each: [ 2 ]} }} ,function (err, result) {
        if (err) done(err);
        result.n.should.equal(1);
        collection.findOne({test: 333}, function (err, doc) {
          if (err) done(err);
          doc.newPushTest.should.have.length(1);
          doc.newPushTest.should.containEql(2);
          done();
        });
      });
    });
    it('should push item into array + $slice', function (done) {
      collection.update({test:333}, { $set: {pushTest: []}}, function (err, result) {
        if (err) done(err);
        collection.update({test:333}, { $push:{ pushTest: {$each: [ 1, 2, 3, 4 ], $slice: -2 } }} ,function (err, result) {
          if (err) done(err);
          result.n.should.equal(1);
          collection.findOne({test:333}, function (err, doc) {
            if (err) done(err);
            doc.pushTest.should.have.length(2);
            doc.pushTest.should.containEql(3, 4);
            done();
          });
        });
      });
    });
    it('should count the number of items in the collection', function(done) {
      collection.should.have.property('count');
      collection.count({}, function(err, cnt) {
        if (err) done(err);
        cnt.should.equal(EXPECTED_TOTAL_TEST_DOCS);

        collection.count({ test:333 }, function(err, singleCnt) {
          if (err) done(err);
          singleCnt.should.equal(1);
          done();
        });
      });
    });
    it('should drop themselves', function(done) {
      var dropCollectionName = "test_collections_drop_collection";
      connected_db.createCollection(dropCollectionName, function(err, dropCollection) {
        if(err) return done(err);
        dropCollection.drop(function(err, reply) {
          if(err) return done(err);
          connected_db.listCollections().toArray(function(err, items) {
            if(err) return done(err);
            var instance = _.find(items, {name:dropCollectionName} );
            (instance === undefined).should.be.true;
            done();
          });
        });
      });
    });
  });

  describe('cursors', function() {
    it('should return a count of found items', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('count');
      crsr.count(function(err, cnt) {
        cnt.should.equal(EXPECTED_TOTAL_TEST_DOCS);
        done();
      });
    });

    it('should limit the fields in the documents using project', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('project');
      crsr.project({ _id: 1 }).toArray(function(err, res) {
        res.length.should.equal(EXPECTED_TOTAL_TEST_DOCS);
        res.forEach(function(doc) {
          Object.keys(doc).should.eql(['_id']);
        });
        done();
      });
    });

    it('should remove property/properites from the documents', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('project');
      crsr.project({ _id: 0, foo: 0 }).toArray(function(err, res) {
        res.length.should.equal(EXPECTED_TOTAL_TEST_DOCS);
        res.forEach(function(doc) {
          doc.should.not.have.keys('_id', 'foo');
        });
        done();
      });
    });

    it('should skip 1 item', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('skip');
      crsr.skip(1).toArray(function(err, res) {
        res.length.should.equal(EXPECTED_TOTAL_TEST_DOCS - 1);
        done();
      });
    });

    it('should limit to 3 items', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('limit');
      crsr.limit(3).toArray(function(err, res) {
        res.length.should.equal(3);
        done();
      });
    });

    it('should skip 1 item, limit to 3 items', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('limit');
      crsr.skip(1).limit(3).toArray(function(err, res) {
        res.length.should.equal(3);
        done();
      });
    });

    it('should count all items regardless of skip/limit', function (done) {
      var crsr = collection.find({});
      crsr.skip(1).limit(3).count(function(err, cnt) {
        cnt.should.equal(EXPECTED_TOTAL_TEST_DOCS);
        done();
      });
    });

    it('should count only skip/limit results', function (done) {
      var crsr = collection.find({});
      crsr.skip(1).limit(3).count(true, function(err, cnt) {
        cnt.should.equal(3);
        done();
      });
    });

    it('should toggle count applySkipLimit and not', function (done) {
      var crsr = collection.find({}).skip(1).limit(3);
      crsr.count(true, function(err, cnt) {
        cnt.should.equal(3);
        crsr.count(function(err, cnt) {
          cnt.should.equal(EXPECTED_TOTAL_TEST_DOCS);
          done();
        });
      });
    });

    it('should count only skip/limit results but return actual count if less than limit', function (done) {
      var crsr = collection.find({});
      crsr.skip(4).limit(6).count(true, function(err, cnt) {
        cnt.should.equal(6);
        done();
      });
    });

    it('should count only skip/limit results for size', function (done) {
      var crsr = collection.find({});
      crsr.skip(2).limit(3).size(function(err, cnt) {
        cnt.should.equal(3);
        done();
      });
    });

    it('should sort results by `test` ascending', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('sort');
      crsr.sort({test: 1}).toArray(function(err, res) {
        if (err) done(err);

        var sorted = res.sort(function(a,b) {
          a = typeof a.test === 'undefined' ? null : a.test;
          b = typeof b.test === 'undefined' ? null : b.test;
          return a - b;
        });
        res.should.eql(sorted);
        done();
      });
    });

    it('should sort results by `test` descending', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('sort');
      crsr.sort({test: -1}).toArray(function(err, res) {
        if (err) done(err);

        var sorted = res.sort(function(a,b) {
          a = typeof a.test === 'undefined' ? null : a.test;
          b = typeof b.test === 'undefined' ? null : b.test;
          return b - a;
        });
        res.should.eql(sorted);
        done();
      });
    });

    it('should map results', function (done) {
      var crsr = collection.find({});
      crsr.should.have.property('map');
      crsr.map(c => c.test).toArray(function(err, res) {
        if (err) done(err);
        var sampleTest = 333;
        res.should.containEql(sampleTest);
        done();
      });
    });
  });
});
