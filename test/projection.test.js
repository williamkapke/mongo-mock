require('should');
var Cursor = require('../lib/cursor.js');
var docs = [
  { _id: '1', a:11, b: 111 },
  { _id: '2', a:22, b: 222 },
  { _id: '3', a:33, b: 333 }
];

describe('Cursor tests', function () {

  describe('getProjectionType', function() {
    it('should identify a "pick"', function(){
      var type = Cursor._getProjectionType({ a:1, b:1, c:1 });
      type.should.equal('pick')
    });
    it('should identify a "pick" with an explicit _id exclusion', function(){
      var type = Cursor._getProjectionType({ a:1, _id:0, b:1, c:1 });
      type.should.equal('pick')
    });
    it('should identify an "omit"', function(){
      var type = Cursor._getProjectionType({ a:0, b:0, c:0 });
      type.should.equal('omit')
    });
    it('should identify an "omit with an explicit _id inclusion"', function(){
      var type = Cursor._getProjectionType({ a:0, _id:1, b:0, c:0 });
      type.should.equal('omit')
    });
    it('should default to "pick" if no fields given', function(){
      var type = Cursor._getProjectionType({ });
      type.should.equal('pick')
    });
    it('should be a "pick" for { _id:1 }', function(){
      var type = Cursor._getProjectionType({ _id:1 });
      type.should.equal('pick')
    });
    it('should be a "omit" for { _id:0 }', function(){
      var type = Cursor._getProjectionType({ _id:0 });
      type.should.equal('omit')
    });
  });

  describe('applyProjection', function () {
    it('should include fields specified', function () {
      var results = Cursor._applyProjection(docs, { a:1, _id:1, b:1, c:1 });
      results.should.eql(docs)
    });
    it('should include fields and _id', function () {
      var results = Cursor._applyProjection(docs, { a:1 });
      results.should.eql([
        { _id: '1', a:11 },
        { _id: '2', a:22 },
        { _id: '3', a:33 }
      ])
    });
    it('should include fields and explicitly exclude _id', function () {
      var results = Cursor._applyProjection(docs, { _id:0, a:1 });
      results.should.eql([
        { a:11 },
        { a:22 },
        { a:33 }
      ])
    });
    it('should exclude fields', function () {
      var results = Cursor._applyProjection(docs, { a:0 });
      results.should.eql([
        { _id: '1', b:111 },
        { _id: '2', b:222 },
        { _id: '3', b:333 }
      ])
    });
    it('should exclude the _id field too', function () {
      var results = Cursor._applyProjection(docs, { _id:0, a:0 });
      results.should.eql([
        { b:111 },
        { b:222 },
        { b:333 }
      ])
    });
    it('should not exclude the _id field if explicitly asking for it', function () {
      var results = Cursor._applyProjection(docs, { _id:1, b:0 });
      results.should.eql([
        { _id: '1', a:11 },
        { _id: '2', a:22 },
        { _id: '3', a:33 }
      ])
    });

    // addition edge case test
    it('should handle { _id:1 }', function () {
      var results = Cursor._applyProjection(docs, { _id:1 });
      results.should.eql([
        { _id: '1' },
        { _id: '2' },
        { _id: '3' }
      ])
    });
    it('should handle { _id:0 }', function () {
      var results = Cursor._applyProjection(docs, { _id:1 });
      results.should.eql([
        { _id: '1' },
        { _id: '2' },
        { _id: '3' }
      ])
    });
  });

});
