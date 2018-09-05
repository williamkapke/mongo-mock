var asyncish = require('../').asyncish;

module.exports = function Bulk(collection, ordered) {
  var ops = [];
  var executedOps = [];
  var iface = {
    insert: function (docs, options, callback) {
      ops.push({
        args: Array.from(arguments),
        fnc: collection.insert,
      });

      return this;
    },
    find: function() {
      return new FindOperators(collection, arguments[0], ops);
    },
    getOperations: NotImplemented,
    tojson: NotImplemented,
    toString: NotImplemented,
    execute: function(callback) {
      if (ordered) {
        return executeOperations(ops, callback);
      } else {
        return executeOperationsParallel(ops, callback);
      }
    },
  };

  //Runs operations only one at a time
  function executeOperations(operations, callback) {
    callback = arguments[arguments.length - 1];
    asyncish(() => {
      operations.reduce((promiseChain, operation) => {
        return promiseChain.then(() => {
          executedOps.push(operation);
          return operation.fnc.apply(this, operation.args)
        });
      }, Promise.resolve([]))
      .then(() => {
        callback(null, executedOps);
      })
      .catch(callback)
    });
    if (typeof callback !== 'function') {
      return new Promise(function (resolve, reject) {
        callback = function (e, r) { e ? reject(e) : resolve(r) };
      })
    }
  }

  //Exhibits a more "fire and forget" behavior
  function executeOperationsParallel(operations, callback) {
    callback = arguments[arguments.length - 1];
    var promises = [];
    for (var i = 0; i < operations.length; i++) {
      var operation = operations[i];
      promises.push(operation.fnc.apply(this, operation.args));
    }

    asyncish(() => {
      Promise.all(promises)
      .then((operations) => {
        callback(null, operations)
      })
      .catch(callback);
    });

    if (typeof callback !== 'function') {
      return new Promise(function (resolve, reject) {
        callback = function (e, r) { e ? reject(e) : resolve(r) };
      })
    }

  }

   return iface;
};

function FindOperators(collection, query, ops) {
  var cursor = collection.find(query);
  var upsert = false;

  var iface = {
    remove: function() {
      var process = (doc) => {
        cursor = getLatestCursor();
        if (!doc) {
          return Promise.resolve();
        }

        return collection.remove({_id: doc._id}).then(() => {
          return cursor.next().then((d) => process(d));
        });
      };

      ops.push({
        args: [],
        fnc: () => {
          return cursor.next().then((d) => {
            return process(d);
          });
        },
      });

      return this;
    },
    removeOne: function() {
      ops.push({
        args: [],
        fnc: () => {
          cursor = getLatestCursor();
          return cursor.next().then((doc) => {
            if (!doc) {
              return;
            }
            return collection.deleteOne({_id: doc._id});
          });
        },
      });

      return this;
    },
    replaceOne: NotImplemented,
    update: function(updateSpec) {
      ops.push({
        args: [],
        fnc: () => {
          return collection.update(query, updateSpec, {
            multi: true,
            upsert: upsert,
          });
        }
      });

      return this;
    },
    updateOne: function(updateSpec) {
      ops.push({
        args: [],
        fnc: () => {
          return collection.updateOne(query, updateSpec, {
            upsert: upsert,
          });
        }
      });

      return this;
    },
    upsert: function() {
      upsert = true;
      return this;
    },
    collation: NotImplemented,
    arrayFilters: NotImplemented,
  };

  function getLatestCursor() {
    return collection.find(query);
  }

  return iface;
}

function NotImplemented(){
  throw Error('Not Implemented');
}
