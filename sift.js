var sift = require('sift');

//use a custom compare function so we can search on ObjectIDs
var compare = sift.compare;
sift.compare = function(a, b) {
  if(a && b && a._bsontype && b._bsontype) {
    return a.equals(b)? 0 : (compare(time(a), time(b)) || compare(a.str, b.str));
  }
  return compare(a,b);
};
function time(id) {
  return id.getTimestamp().getTime()
}

module.exports = sift;
