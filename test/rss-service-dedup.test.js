var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var RssEntryRepository = require("../service/db/rss-entry-repository.js").RssEntryRepository;

var source = fs.readFileSync(
    path.join(__dirname, "..", "service", "rss-service.js"),
    "utf8"
);
var feedEntries = [
    { guid: "stable-entry-1", title: "First entry", link: "https://example.com/1" },
    { guid: "stable-entry-2", title: "Second entry", link: "https://example.com/2" }
];
var database = createDatabase();

function createDatabase(initialRows) {
    var rows = (initialRows || []).map(function (row, index) {
        return {
            id: index + 1,
            feedId: row.feedId,
            guid: row.guid
        };
    });
    var nextId = rows.length + 1;
    return {
        escape: function (value) {
            return String(value).replace(/'/g, "''");
        },
        exec: function (query) {
            var resultRows;
            if (query.indexOf("SELECT guid FROM rss_entries") === 0) {
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
                resultRows = rows.filter(function (row) {
                    return row.feedId === feedId &&
                        (!candidateSet || candidateSet["$" + row.guid] === true);
                }).map(function (row) {
                    return { guid: row.guid };
                });
            }
            else {
                var values = /VALUES \((\d+), '((?:''|[^'])*)'\)/.exec(query);
                assert(values, "Unexpected RSS entry database query: " + query);
                rows.push({
                    id: nextId++,
                    feedId: Number(values[1]),
                    guid: values[2].replace(/''/g, "'")
                });
                resultRows = [{ id: rows[rows.length - 1].id }];
            }

            return createOperation(function () {
                return resultRows;
            });
        },
        transaction: function () {
            var pendingRows = [];
            return {
                begin: function () {
                    return createOperation(function () {});
                },
                exec: function (query) {
                    return createOperation(function () {
                        var matcher = /\((\d+), '((?:''|[^'])*)'\)/g;
                        var match;
                        while ((match = matcher.exec(query))) {
                            pendingRows.push({
                                id: nextId++,
                                feedId: Number(match[1]),
                                guid: match[2].replace(/''/g, "'")
                            });
                        }
                        return [];
                    });
                },
                commit: function () {
                    return createOperation(function () {
                        rows = rows.concat(pendingRows);
                    });
                },
                rollback: function () {
                    return createOperation(function () {
                        pendingRows = [];
                    });
                }
            };
        }
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

function runServiceInstance(options) {
    options = options || {};
    var posts = [];
    var instanceDatabase = options.database || database;
    var instanceEntries = options.entries || feedEntries;

    function ServicesClient() {
        this.onclose = function () {};
        this.start = function (onReady) {
            onReady();
        };
    }

    function MessagesClient() {
        this.readTopics = function (onSuccess) {
            onSuccess([{ sip: "connect?test", dn: "Test" }]);
        };
        this.post = function (message, onSuccess, onError) {
            posts.push(message);
            if (typeof options.postHandler === "function") {
                options.postHandler(message, onSuccess, onError);
            }
            else {
                onSuccess({});
            }
        };
    }

    function FeedRepository() {}
    FeedRepository.prototype.list = function (onSuccess) {
        onSuccess(options.feeds || [{
            id: 1,
            name: "Test feed",
            url: "https://example.com/feed.xml",
            topic: "connect?test",
            tags: [],
            intervalMinutes: 15,
            enabled: true
        }]);
    };

    function HtmlBuilder() {
        this.build = function (entry) {
            return "<p>" + entry.title + "</p>";
        };
    }

    function RssDownloader() {
        this.download = function (url, onSuccess) {
            onSuccess("<rss/>");
        };
    }

    function Scheduler() {
        this.start = function (callback) {
            callback();
        };
        this.stop = function () {};
    }

    var modules = {
        "./rss/rss-downloader.js": { RssDownloader: RssDownloader },
        "./rss/rss-parser.js": { parse: function () { return instanceEntries; } },
        "./db/rss-entry-repository.js": { RssEntryRepository: RssEntryRepository },
        "./db/rss-feed-repository.js": { RssFeedRepository: FeedRepository },
        "./rss/html-builder.js": { HtmlBuilder: HtmlBuilder },
        "./messages/messages-client.js": { MessagesClient: MessagesClient },
        "./messages/services-client.js": { ServicesClient: ServicesClient },
        "./scheduler/scheduler.js": { Scheduler: Scheduler }
    };

    vm.runInNewContext(source, {
        require: function (modulePath) {
            if (!modules[modulePath]) {
                throw new Error("Unexpected module: " + modulePath);
            }
            return modules[modulePath];
        },
        Database: instanceDatabase,
        log: function () {}
    });

    return posts;
}

assert.strictEqual(runServiceInstance().length, 2);
assert.strictEqual(runServiceInstance().length, 0);

var initialHistoryEntries = [];
for (var initialIndex = 0; initialIndex < 10; initialIndex++) {
    initialHistoryEntries.push({
        guid: "initial-entry-" + initialIndex,
        title: "Initial entry " + initialIndex,
        published: new Date(Date.UTC(2026, 0, initialIndex + 1)).toISOString()
    });
}
initialHistoryEntries.reverse();
var initialHistoryDatabase = createDatabase();
var initialHistoryPosts = runServiceInstance({
    database: initialHistoryDatabase,
    entries: initialHistoryEntries
});
assert.strictEqual(initialHistoryPosts.length, 5);
assert.deepStrictEqual(initialHistoryPosts.map(function (post) {
    return post.title;
}).sort(), [
    "Initial entry 5",
    "Initial entry 6",
    "Initial entry 7",
    "Initial entry 8",
    "Initial entry 9"
]);
assert.strictEqual(runServiceInstance({
    database: initialHistoryDatabase,
    entries: initialHistoryEntries
}).length, 0);

var bulkEntries = [];
for (var i = 0; i < 10; i++) {
    bulkEntries.push({
        guid: "bulk-entry-" + i,
        title: "Bulk entry " + i,
        link: "https://example.com/" + i
    });
}
var activePosts = 0;
var maximumActivePosts = 0;
var pendingPostCallbacks = [];
var bulkDatabase = createDatabase([
    { feedId: 1, guid: "previous-entry-feed-one" },
    { feedId: 2, guid: "previous-entry-feed-two" }
]);
var bulkFeeds = [{
    id: 1,
    name: "Feed one",
    url: "https://example.com/feed-one.xml",
    topic: "connect?test",
    tags: [],
    intervalMinutes: 15,
    enabled: true
}, {
    id: 2,
    name: "Feed two",
    url: "https://example.com/feed-two.xml",
    topic: "connect?test",
    tags: [],
    intervalMinutes: 15,
    enabled: true
}];
var bulkPosts = runServiceInstance({
    database: bulkDatabase,
    entries: bulkEntries,
    feeds: bulkFeeds,
    postHandler: function (message, onSuccess) {
        activePosts++;
        maximumActivePosts = Math.max(maximumActivePosts, activePosts);
        pendingPostCallbacks.push(function () {
            activePosts--;
            onSuccess({});
        });
    }
});
assert.strictEqual(bulkPosts.length, 4);
assert.strictEqual(pendingPostCallbacks.length, 4);
for (var callbackIndex = 0; callbackIndex < pendingPostCallbacks.length; callbackIndex++) {
    pendingPostCallbacks[callbackIndex]();
}
assert.strictEqual(bulkPosts.length, 20);
assert.strictEqual(maximumActivePosts, 4);
assert.strictEqual(activePosts, 0);

var persistedEntries;
new RssEntryRepository(database).listKnown(
    1,
    ["stable-entry-1", "stable-entry-2"],
    function (entries) {
        persistedEntries = entries;
    },
    function (error) {
        throw new Error(error);
    }
);
assert.deepStrictEqual(persistedEntries, ["stable-entry-1", "stable-entry-2"]);

console.log("RSS service restart deduplication tests passed");
