var sift = require('sift');

//use a custom compare function so we can search on ObjectIDs
var compare = sift.compare;
sift.compare = function(a, b) {
  if(a && b && a._bsontype && b._bsontype) {
    if(a.equals(b)) return 0;
    a = a.getTimestamp().getTime();
    b = b.getTimestamp().getTime();
  }
  return compare(a,b);
};

module.exports = sift;
