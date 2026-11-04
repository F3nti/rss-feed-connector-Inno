var assert = require("assert");
var config = require("../config.json");
var RssFeedRepository = require("../service/db/rss-feed-repository.js").RssFeedRepository;

var feedColumns = config.database.init[0].init.map(function (column) {
    return column.name;
});
assert(feedColumns.indexOf("last_status") !== -1);
assert(feedColumns.indexOf("last_run") !== -1);
assert(feedColumns.indexOf("last_summary") !== -1);

function MockDatabase() {
    this.queries = [];
    this.transactionQueries = [];
    this.rows = [{
        id: "4",
        name: "Security",
        url: "https://example.com/feed.xml",
        topic: "connect?test",
        tags: "[\"security\",\"heise\"]",
        interval_minutes: "30",
        enabled: true,
        initial_post_limit: "10",
        initial_post_all: false,
        last_status: "success",
        last_run: "2026-11-03T12:00:00.000Z",
        last_summary: "2 posted, 0 duplicates, 0 failed"
    }];
    this.entries = [];
    this.failQuery = null;
    this.exec = function (query) {
        this.queries.push(query);
        var result = {};
        var rows;
        if (query.indexOf("SELECT ") === 0) {
            rows = this.rows;
        }
        else {
            rows = [{ id: 11 }];
        }
        result.oncomplete = function (callback) {
            result.complete = function () {
                callback(rows);
            };
            return result;
        };
        result.onerror = function (callback) {
            result.error = callback;
            result.complete();
            return result;
        };
        return result;
    };
    this.escape = function (value) {
        return String(value).replace(/'/g, "''");
    };
    this.transaction = function () {
        var database = this;
        var rows = database.rows.slice();
        var entries = database.entries.slice();
        return {
            begin: function () {
                return createOperation(function () {});
            },
            exec: function (query) {
                database.transactionQueries.push(query);
                return createOperation(function () {
                    if (database.failQuery &&
                        query.indexOf(database.failQuery) !== -1) {
                        throw new Error("Simulated database failure");
                    }
                    if (query.indexOf("DELETE FROM rss_entries") === 0) {
                        var entryFeedId = Number(/feed_id = (\d+)/.exec(query)[1]);
                        entries = entries.filter(function (entry) {
                            return entry.feedId !== entryFeedId;
                        });
                        return [];
                    }
                    if (query.indexOf("DELETE FROM rss_feeds") === 0) {
                        var feedId = Number(/id = (\d+)/.exec(query)[1]);
                        var found = rows.some(function (row) {
                            return Number(row.id) === feedId;
                        });
                        rows = rows.filter(function (row) {
                            return Number(row.id) !== feedId;
                        });
                        return found ? [{ id: feedId }] : [];
                    }
                    throw new Error("Unexpected transaction query: " + query);
                });
            },
            commit: function () {
                return createOperation(function () {
                    database.rows = rows;
                    database.entries = entries;
                });
            },
            rollback: function () {
                return createOperation(function () {});
            }
        };
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
var repository = new RssFeedRepository(database);
var loadedFeeds;
repository.list(function (feeds) {
    loadedFeeds = feeds;
}, function (error) {
    throw new Error(error);
});
assert.deepStrictEqual(loadedFeeds, [{
    id: 4,
    name: "Security",
    url: "https://example.com/feed.xml",
    topic: "connect?test",
    tags: ["security", "heise"],
    intervalMinutes: 30,
    enabled: true,
    initialPostLimit: 10,
    initialPostAll: false,
    status: {
        state: "success",
        lastRun: "2026-11-03T12:00:00.000Z",
        summary: "2 posted, 0 duplicates, 0 failed"
    }
}]);

var savedId;
repository.save({
    id: null,
    name: "Heise's feed",
    url: "https://example.com/rss",
    topic: "connect?test",
    tags: ["news"],
    intervalMinutes: 10,
    enabled: true,
    initialPostLimit: 7,
    initialPostAll: true
}, function (id) {
    savedId = id;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(savedId, 11);
assert(database.queries[1].indexOf("'Heise''s feed'") !== -1);
assert(database.queries[1].indexOf("RETURNING id") !== -1);
assert(database.queries[1].indexOf("initial_post_limit") !== -1);
assert(database.queries[1].indexOf("7, TRUE") !== -1);

var savedStatus;
repository.saveStatus(11, {
    state: "error",
    lastRun: "2026-11-03T12:30:00.000Z",
    summary: "Feed download failed: temporary failure"
}, function () {
    savedStatus = true;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(savedStatus, true);
assert(database.queries[2].indexOf(
    "last_status = 'error', last_run = '2026-11-03T12:30:00.000Z'"
) !== -1);
assert(database.queries[2].indexOf(
    "last_summary = 'Feed download failed: temporary failure'"
) !== -1);

var removed;
database.rows = [{ id: "11" }];
database.entries = [
    { feedId: 11, guid: "old-entry-1" },
    { feedId: 11, guid: "old-entry-2" },
    { feedId: 12, guid: "other-feed-entry" }
];
repository.remove(11, function (result) {
    removed = result;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(removed, true);
assert.deepStrictEqual(database.rows, []);
assert.deepStrictEqual(database.entries, [{ feedId: 12, guid: "other-feed-entry" }]);
assert.strictEqual(database.transactionQueries[0],
    "DELETE FROM rss_entries WHERE feed_id = 11");
assert.strictEqual(database.transactionQueries[1],
    "DELETE FROM rss_feeds WHERE id = 11 RETURNING id");

database.rows = [{ id: "12" }];
database.entries = [{ feedId: 12, guid: "keep-this-entry" }];
database.failQuery = "DELETE FROM rss_feeds";
var deleteError;
repository.remove(12, function () {
    throw new Error("Failed feed deletion must not be reported as successful");
}, function (error) {
    deleteError = error;
});
assert.strictEqual(deleteError, "Simulated database failure");
assert.deepStrictEqual(database.rows, [{ id: "12" }]);
assert.deepStrictEqual(database.entries, [{ feedId: 12, guid: "keep-this-entry" }]);
database.failQuery = null;

database.rows = [{
    id: "5",
    name: "Invalid",
    url: "https://example.com",
    topic: "connect",
    tags: "not-json",
    interval_minutes: "5",
    enabled: true
}];
var loadError;
repository.list(function () {
    throw new Error("Invalid stored tags must not be reported as a successful load");
}, function (error) {
    loadError = error;
});
assert.strictEqual(loadError, "Stored feed tags are invalid for feed 5");

console.log("RSS feed repository tests passed");
