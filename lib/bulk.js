module.exports = function Bulk(collection, ordered) {
  var ops = [];
  var executedOps = [];
  var interface = {
    insert: function(docs, options, callback) {
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
    execute: function() {
      if (ordered) {
        return executeOperations(ops);
      } else {
        return executeOperationsParallel(ops);
      }
    },
  };

  //Runs operations only one at a time
  function executeOperations(ops) {
    return ops.reduce((acc, op) => {
      return acc.then(() => {
        executedOps.push(op);
        return op.fnc.apply(this, op.args);
      });
    }, Promise.resolve());
  }

  //Exhibits a more "fire and forget" behavior
  function executeOperationsParallel(ops) {
    var promises = [];

    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      promises.push(op.fnc.apply(this, op.args));
    }

    return Promise.all(promises);
  }

  return interface;
};

function FindOperators(collection, query, ops) {
  var cursor = collection.find(query);
  var upsert = false;

  var interface = {
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
    // replaceOne: function(replacement) {
    //   ops.push({
    //     args: [],
    //     fnc: () => {
    //       cursor = getLatestCursor();
    //       return cursor.next().then((doc) => {
    //         if (!doc) {
    //           return;
    //         }
    //
    //         return collection.replaceOne({_id: doc._id}, replacement);
    //       });
    //     }
    //   });
    //
    //   return this;
    // },
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

  return interface;
}

function NotImplemented(){
  throw Error('Not Implemented');
}
