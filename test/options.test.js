var should = require('should');
var fo = require('../').find_options;
function find_options() {
  return fo(arguments);
}

describe('options tests', function () {
  var cb = function(){};
  var noop = Boolean;

  it('should accept signature: empty arguments', function(){
    var options = find_options();
    options.should.eql({ callback:noop, fields:{}, limit:0, query:{}, skip:0 });
  });
  it('should accept signature: "callback"', function(){
    var options = find_options(cb);
    options.should.eql({ callback:cb, fields:{}, limit:0, query:{}, skip:0 });
  });
  it('should accept signature: "selector"', function(){
    var options = find_options({_id:"ABC123"});
    options.should.eql({ callback:noop, fields:{}, limit:0, query:{_id:"ABC123"}, skip:0 });
  });
  it('should accept signature: "selector, callback"', function(){
    var options = find_options({_id:"ABC123"}, cb);
    options.should.eql({ callback:cb, fields:{}, limit:0, query:{_id:"ABC123"}, skip:0 });
  });
  it('should accept signature: "selector, fields"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1});
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:0 });
  });
  it('should accept signature: "selector, fields, callback"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:0 });
  });
  it('should accept signature: "selector, undefined, callback"', function(){
    var options = find_options({_id:"ABC123"}, undefined, cb);
    options.should.eql({ callback:cb, fields:undefined, limit:0, query:{_id:"ABC123"}, skip:0 });
  });
  it('should accept signature: "selector, options"', function(){
    var options = find_options({_id:"ABC123"}, {fields:{_id:-1}, skip:100});
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, options"', function(){
    var options = find_options({_id:"ABC123"}, {projection:{_id:-1}, skip:100});
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, options, callback"', function(){
    var options = find_options({_id:"ABC123"}, {fields:{_id:-1}, skip:100}, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, options, callback"', function(){
    var options = find_options({_id:"ABC123"}, {projection:{_id:-1}, skip:100}, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, fields, options"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, {skip:100});
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, fields, options, callback"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, {skip:100}, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:0, query:{_id:"ABC123"}, skip:100 });
  });
  it('should accept signature: "selector, fields, skip, limit"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, 200, 100);
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:100, query:{_id:"ABC123"}, skip:200 });
  });
  it('should accept signature: "selector, fields, skip, limit, callback"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, 200, 100, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:100, query:{_id:"ABC123"}, skip:200 });
  });
  it('should accept signature: "selector, fields, skip, limit, timeout"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, 200, 100, 600000);
    options.should.eql({ callback:noop, fields:{_id:-1}, limit:100, query:{_id:"ABC123"}, skip:200, timeout:600000 });
  });
  it('should accept signature: "selector, fields, skip, limit, timeout, callback"', function(){
    var options = find_options({_id:"ABC123"}, {_id:-1}, 200, 100, 600000, cb);
    options.should.eql({ callback:cb, fields:{_id:-1}, limit:100, query:{_id:"ABC123"}, skip:200, timeout:600000 });
  });
});
