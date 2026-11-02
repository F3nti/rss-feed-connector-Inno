var assert = require("assert");
var RssEntryRepository = require("../service/db/rss-entry-repository.js").RssEntryRepository;

function MockDatabase() {
    this.rows = [];
    this.nextId = 1;
    this.queries = [];
    this.exec = function (query) {
        this.queries.push(query);
        var rows;
        if (query.indexOf("SELECT guid FROM rss_entries") === 0 &&
            query.indexOf("LIMIT 1") !== -1) {
            var existingFeedId = Number(/feed_id = (\d+)/.exec(query)[1]);
            rows = this.rows.filter(function (row) {
                return row.feedId === existingFeedId;
            }).slice(0, 1).map(function (row) {
                return { guid: row.guid };
            });
        }
        else if (query.indexOf("SELECT guid FROM rss_entries") === 0) {
            var feedId = Number(/feed_id = (\d+)/.exec(query)[1]);
            var candidateSet = null;
            var inClause = / AND guid IN \((.*)\)$/.exec(query);
            if (inClause) {
                candidateSet = {};
                var matcher = /'((?:''|[^'])*)'/g;
                var match;
                while ((match = matcher.exec(inClause[1]))) {
                    candidateSet["$" + match[1].replace(/''/g, "'")] = true;
                }
            }
            rows = this.rows.filter(function (row) {
                return row.feedId === feedId &&
                    (!candidateSet || candidateSet["$" + row.guid] === true);
            }).map(function (row) {
                return { guid: row.guid };
            });
        }
        else {
            var values = /VALUES \((\d+), '((?:''|[^'])*)'\)/.exec(query);
            assert(values, "Expected an escaped RSS entry insert");
            var inserted = {
                id: this.nextId++,
                feedId: Number(values[1]),
                guid: values[2].replace(/''/g, "'")
            };
            this.rows.push(inserted);
            rows = [{ id: inserted.id }];
        }

        var operation = {
            oncomplete: function (callback) {
                callback(rows);
                return operation;
            },
            onerror: function () {
                return operation;
            }
        };
        return operation;
    };
    this.transaction = function () {
        var database = this;
        var pendingRows = [];
        return {
            begin: function () {
                return createOperation(function () {});
            },
            exec: function (query) {
                database.queries.push(query);
                return createOperation(function () {
                    var matcher = /\((\d+), '((?:''|[^'])*)'\)/g;
                    var match;
                    while ((match = matcher.exec(query))) {
                        pendingRows.push({
                            id: database.nextId++,
                            feedId: Number(match[1]),
                            guid: match[2].replace(/''/g, "'")
                        });
                    }
                    return [];
                });
            },
            commit: function () {
                return createOperation(function () {
                    database.rows = database.rows.concat(pendingRows);
                });
            },
            rollback: function () {
                return createOperation(function () {
                    pendingRows = [];
                });
            }
        };
    };
    this.escape = function (value) {
        return String(value).replace(/'/g, "''");
    };

    function createOperation(execute) {
        var operation = {};
        var complete;
        var error;
        var executed = false;
        function run() {
            if (executed || !complete || !error) {
                return;
            }
            executed = true;
            try {
                complete(execute());
            }
            catch (exception) {
                error(exception, exception.message);
            }
        }
        operation.oncomplete = function (callback) {
            complete = callback;
            run();
            return operation;
        };
        operation.onerror = function (callback) {
            error = callback;
            run();
            return operation;
        };
        return operation;
    }
}

var database = new MockDatabase();
var repository = new RssEntryRepository(database);
var initialEntries;
repository.listKnown(7, [], function (entries) {
    initialEntries = entries;
}, function (error) {
    throw new Error(error);
});
assert.deepStrictEqual(initialEntries, []);

var hasEntries;
repository.hasEntries(7, function (result) {
    hasEntries = result;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(hasEntries, false);

var insertedId;
repository.save(7, "entry-'one", function (id) {
    insertedId = id;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(insertedId, 1);
assert(database.queries.some(function (query) {
    return query.indexOf("'entry-''one'") !== -1;
}));

var savedMany;
repository.saveMany(7, ["ignored-'two", "ignored-three", "ignored-'two"], function () {
    savedMany = true;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(savedMany, true);
assert.strictEqual(database.rows.filter(function (row) {
    return row.feedId === 7;
}).length, 3);

var otherFeedId;
repository.save(8, "entry-two", function (id) {
    otherFeedId = id;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(otherFeedId, 4);

var matchingEntries;
repository.listKnown(7, ["entry-'one", "missing", "entry-'one"], function (entries) {
    matchingEntries = entries;
}, function (error) {
    throw new Error(error);
});
assert.deepStrictEqual(matchingEntries, ["entry-'one"]);
assert(database.queries[database.queries.length - 1].indexOf(
    "AND guid IN ('entry-''one', 'missing')"
) !== -1);

var batchedGuids = [];
for (var i = 0; i < 205; i++) {
    batchedGuids.push("entry-" + i);
}
var beforeBatches = database.queries.length;
repository.listKnown(7, batchedGuids, function (entries) {
    assert.deepStrictEqual(entries, []);
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(database.queries.length - beforeBatches, 3);

var emptyQueryCount = database.queries.length;
repository.listKnown(7, [], function (entries) {
    assert.deepStrictEqual(entries, []);
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(database.queries.length, emptyQueryCount);

var restartedRepository = new RssEntryRepository(database);
var afterRestart;
restartedRepository.listKnown(7, ["entry-'one"], function (entries) {
    afterRestart = entries;
}, function (error) {
    throw new Error(error);
});
assert.deepStrictEqual(afterRestart, ["entry-'one"]);

repository.hasEntries(7, function (result) {
    hasEntries = result;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(hasEntries, true);

var databaseError;
var failingRepository = new RssEntryRepository({
    escape: function (value) { return value; },
    exec: function () {
        return {
            oncomplete: function () { return this; },
            onerror: function (callback) {
                callback("error", "Database unavailable");
                return this;
            }
        };
    }
});
failingRepository.listKnown(7, ["entry"], function () {
    throw new Error("Database errors must not be reported as a successful load");
}, function (error) {
    databaseError = error;
});
assert.strictEqual(databaseError, "Database unavailable");

assert.throws(function () {
    repository.listKnown(0, [], function () {}, function () {});
}, /positive integer/);
assert.throws(function () {
    repository.save(7, " ", function () {}, function () {});
}, /non-empty string/);

console.log("RSS entry repository persistence tests passed");
