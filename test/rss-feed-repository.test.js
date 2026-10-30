var assert = require("assert");
var RssFeedRepository = require("../service/db/rss-feed-repository.js").RssFeedRepository;

function MockDatabase() {
    this.queries = [];
    this.rows = [{
        id: "4",
        name: "Security",
        url: "https://example.com/feed.xml",
        topic: "connect?test",
        tags: "[\"security\",\"heise\"]",
        interval_minutes: "30",
        enabled: true
    }];
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
    enabled: true
}]);

var savedId;
repository.save({
    id: null,
    name: "Heise's feed",
    url: "https://example.com/rss",
    topic: "connect?test",
    tags: ["news"],
    intervalMinutes: 10,
    enabled: true
}, function (id) {
    savedId = id;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(savedId, 11);
assert(database.queries[1].indexOf("'Heise''s feed'") !== -1);
assert(database.queries[1].indexOf("RETURNING id") !== -1);

var removed;
repository.remove(11, function (result) {
    removed = result;
}, function (error) {
    throw new Error(error);
});
assert.strictEqual(removed, true);

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
