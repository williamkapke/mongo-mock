var should = require('should');
var ObjectId = require('bson-objectid');
var id = ObjectId();
var mongo = require('../');
var MongoClient = mongo.MongoClient;


describe('mock tests', function () {
  var connected_db;
  var collection;

  before(function (done) {
    MongoClient.connect("mock_database", {persist:"mongo.json"}, function(err, db) {
      connected_db = db;
      collection = connected_db.collection("users");
      done();
    });
  });

  describe('collections', function () {
    'insert,findOne,update,remove'.split(',').forEach(function(key) {
      it("should have a '"+key+"' function", function () {
        collection.should.have.property(key);
        collection[key].should.be.type('function');
      });
    });

    it('should create data', function (done) {
      collection.insert({test:123}, function (err, result) {
        (!!err).should.be.false;
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
        (!!err).should.be.false;
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
        (!!err).should.be.false;
        (!!doc).should.be.true;
        doc.should.have.property('_id');
        doc._id.toString().should.have.length(24);//auto generated _id
        doc.should.have.property('test', 123);
        done();
      });
    });
    it('should return only the fields specified', function (done) {
      collection.findOne({test:456}, {foo:1}, function (err, doc) {
        (!!err).should.be.false;
        (!!doc).should.be.true;
        doc.should.eql({foo:true});
        done();
      });
    });
    it('should accept undefined fields', function (done) {
      collection.findOne({test:456}, undefined, function (err, doc) {
        (!!err).should.be.false;
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
        (!!err).should.be.false;
        (!!doc).should.be.true;
        doc.should.have.property('_id', id);
        doc.should.have.property('test', 456);
        done();
      });
    });
    it('should NOT findOne if it does not exist', function (done) {
      collection.findOne({_id:"asdfasdf"}, function (err, doc) {
        (!!err).should.be.false;
        (!!doc).should.be.false;
        done();
      });
    });

    it('should update one (default)', function (done) {
      //query, data, options, callback
      collection.update({test:123}, {$set:{foo:"bar"}}, function (err, count) {
        (!!err).should.be.false;
        count.should.equal(1);

        collection.findOne({test:123}, function (err, doc) {
          (!!err).should.be.false;
          (!!doc).should.be.true;
          doc.should.have.property("foo", "bar");
          done();
        });
      });
    });
    it('should update multi', function (done) {
      collection.update({}, {$set:{foo:"bar"}}, {multi:true}, function (err, count) {
        (!!err).should.be.false;
        count.should.equal(2);

        collection.find({foo:"bar"}, function (err, results) {
          (!!err).should.be.false;
          (!!results).should.be.true;
          results.length.should.equal(2);
          done();
        });
      });
    });
    it('should upsert', function (done) {
      //prove it isn't there...
      collection.findOne({anew:1}, function (err, doc) {
        (!!err).should.be.false;
        (!!doc).should.be.false;

        collection.update({anew:1}, {anew:1,bar:"none"}, {upsert:true}, function (err, count) {
          (!!err).should.be.false;
          count.should.equal(1);

          collection.find({anew:1}, function (err, results) {
            (!!err).should.be.false;
            (!!results).should.be.true;
            results.length.should.equal(1);
            done();
          });
        });
      });
    })
  });
});
