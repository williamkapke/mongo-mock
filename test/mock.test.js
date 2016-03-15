var should = require('should');
var ObjectId = require('bson-objectid');
var id = ObjectId();
var mongo = require('../');
var MongoClient = mongo.MongoClient;
MongoClient.persist = "mongo.js";

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


  describe('indexes', function () {
    it('should create a unique index', function (done) {
      collection.createIndex({test:1}, {unique:true}, function (err, name) {
        if(err) return done(err);
        name.should.equal('test_1');
        done();
      });
    });

    it('should deny unique constraint violations on insert', function (done) {
      collection.insert([{test:333},{test:444},{test:555, baz:1},{test:555,baz:2}], function (err, result) {
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

  });

  describe('collections', function () {
    'insert,findOne,update,remove'.split(',').forEach(function(key) {
      it("should have a '"+key+"' function", function () {
        collection.should.have.property(key);
        collection[key].should.be.type('function');
      });
    });

    it('should insert data', function (done) {
      collection.insert({test:123}, function (err, result) {
        if(err) return done(err);
        (!!result.ops).should.be.true;
        (!!result.ops[0]).should.be.true;
        (!!result.ops[0]._id).should.be.true;
        result.ops[0]._id.toString().should.have.length(24);
        result.ops[0].should.have.property('test', 123);
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
    it('should return only the fields specified', function (done) {
      collection.findOne({test:456}, {foo:1}, function (err, doc) {
        if(err) return done(err);
        (!!doc).should.be.true;
        doc.should.eql({foo:true});
        done();
      });
    });
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
    it('should findOne by an ObjectId', function (done) {
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
        result.n.should.equal(5);

        collection.find({foo:"bar"}).count(function (err, n) {
          if(err) return done(err);
          n.should.equal(5);
          done();
        });
      });
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
  });
});
