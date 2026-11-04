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
    var failedEntrySavesRemaining = 0;
    var entrySaveAttempts = 0;
    var database = {
        failNextEntrySaves: function (count) {
            failedEntrySavesRemaining = count;
        },
        getEntrySaveAttempts: function () {
            return entrySaveAttempts;
        },
        escape: function (value) {
            return String(value).replace(/'/g, "''");
        },
        exec: function (query) {
            var resultRows = [];
            var insertValues = null;
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
                insertValues = /VALUES \((\d+), '((?:''|[^'])*)'\)/.exec(query);
                assert(insertValues, "Unexpected RSS entry database query: " + query);
            }

            return createOperation(function () {
                if (insertValues) {
                    entrySaveAttempts++;
                    if (failedEntrySavesRemaining > 0) {
                        failedEntrySavesRemaining--;
                        throw new Error("Simulated database unavailable");
                    }
                    rows.push({
                        id: nextId++,
                        feedId: Number(insertValues[1]),
                        guid: insertValues[2].replace(/''/g, "'")
                    });
                    resultRows = [{ id: rows[rows.length - 1].id }];
                }
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

    return database;
}

function runServiceInstance(options) {
    options = options || {};
    var posts = [];
    var retryDelays = [];
    var logs = [];
    var instanceDatabase = options.database || database;
    var instanceEntries = options.entries || feedEntries;
    var statusStore = options.statusStore || {};
    var stateMessage = null;
    var controlOnConnected;

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
        var configuredFeeds = options.feeds || [{
            id: 1,
            name: "Test feed",
            url: "https://example.com/feed.xml",
            topic: "connect?test",
            tags: [],
            intervalMinutes: 15,
            enabled: true,
            initialPostLimit: 5,
            initialPostAll: false
        }];
        onSuccess(configuredFeeds.map(function (feed) {
            return {
                id: feed.id,
                name: feed.name,
                url: feed.url,
                topic: feed.topic,
                tags: feed.tags,
                intervalMinutes: feed.intervalMinutes,
                enabled: feed.enabled,
                initialPostLimit: feed.initialPostLimit,
                initialPostAll: feed.initialPostAll,
                status: statusStore["$" + feed.id] || feed.status
            };
        }));
    };
    FeedRepository.prototype.saveStatus = function (feedId, status, onSuccess) {
        statusStore["$" + feedId] = {
            state: status.state,
            lastRun: status.lastRun,
            summary: status.summary
        };
        onSuccess();
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
            if (options.holdScheduler) {
                return;
            }
            callback();
        };
        this.stop = function () {};
    }

    function JsonApi() {
        this.onconnected = function (callback) {
            controlOnConnected = callback;
        };
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
        JsonApi: JsonApi,
        Timers: {
            setTimeout: function (callback, delay) {
                if (options.retryTimerError) {
                    throw new Error(options.retryTimerError);
                }
                retryDelays.push(delay);
                callback();
                return retryDelays.length;
            },
            clearTimeout: function () {}
        },
        log: function (message) {
            logs.push(message);
        }
    });

    if (options.getState) {
        var onControlMessage;
        controlOnConnected({
            onmessage: function (callback) {
                onControlMessage = callback;
            },
            send: function (message) {
                stateMessage = JSON.parse(message);
            }
        });
        onControlMessage(JSON.stringify({ mt: "GetState", src: "state-test" }));
    }

    posts.retryDelays = retryDelays;
    posts.logs = logs;
    posts.stateMessage = stateMessage;
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

var customInitialLimitPosts = runServiceInstance({
    database: createDatabase(),
    entries: initialHistoryEntries,
    feeds: [{
        id: 1,
        name: "Custom limit feed",
        url: "https://example.com/feed.xml",
        topic: "connect?test",
        tags: [],
        intervalMinutes: 15,
        enabled: true,
        initialPostLimit: 3,
        initialPostAll: false
    }]
});
assert.strictEqual(customInitialLimitPosts.length, 3);
assert.deepStrictEqual(customInitialLimitPosts.map(function (post) {
    return post.title;
}).sort(), [
    "Initial entry 7",
    "Initial entry 8",
    "Initial entry 9"
]);

var loadAllInitialPosts = runServiceInstance({
    database: createDatabase(),
    entries: initialHistoryEntries,
    feeds: [{
        id: 1,
        name: "Load all feed",
        url: "https://example.com/feed.xml",
        topic: "connect?test",
        tags: [],
        intervalMinutes: 15,
        enabled: true,
        initialPostLimit: 5,
        initialPostAll: true
    }]
});
assert.strictEqual(loadAllInitialPosts.length, 10);

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

var retryDatabase = createDatabase();
retryDatabase.failNextEntrySaves(2);
var retriedSavePosts = runServiceInstance({
    database: retryDatabase,
    entries: [feedEntries[0]]
});
assert.strictEqual(retriedSavePosts.length, 1);
assert.deepStrictEqual(retriedSavePosts.retryDelays, [500, 1500]);
assert.strictEqual(retryDatabase.getEntrySaveAttempts(), 3);
var retriedGuid;
new RssEntryRepository(retryDatabase).listKnown(
    1,
    [feedEntries[0].guid],
    function (entries) {
        retriedGuid = entries;
    },
    function (error) {
        throw new Error(error);
    }
);
assert.deepStrictEqual(retriedGuid, [feedEntries[0].guid]);
assert.strictEqual(runServiceInstance({
    database: retryDatabase,
    entries: [feedEntries[0]]
}).length, 0);

var persistedStatusStore = {};
runServiceInstance({
    database: createDatabase(),
    entries: [],
    statusStore: persistedStatusStore
});
assert.strictEqual(persistedStatusStore["$1"].state, "success");
var restartedStatusPosts = runServiceInstance({
    database: createDatabase(),
    entries: [],
    statusStore: persistedStatusStore,
    holdScheduler: true,
    getState: true
});
assert.strictEqual(restartedStatusPosts.length, 0);
assert.strictEqual(restartedStatusPosts.stateMessage.statuses["1"].state, "success");
assert.strictEqual(restartedStatusPosts.stateMessage.statuses["1"].summary,
    "0 posted, 0 duplicates, 0 failed");
assert.strictEqual(restartedStatusPosts.stateMessage.statuses["1"].lastRun,
    persistedStatusStore["$1"].lastRun);

var interruptedStatusStore = {
    "$1": {
        state: "running",
        lastRun: "2026-11-03T12:00:00.000Z",
        summary: "Downloading feed"
    }
};
var interruptedStatusPosts = runServiceInstance({
    database: createDatabase(),
    entries: [],
    statusStore: interruptedStatusStore,
    holdScheduler: true,
    getState: true
});
assert.strictEqual(interruptedStatusPosts.stateMessage.statuses["1"].state, "error");
assert.strictEqual(
    interruptedStatusPosts.stateMessage.statuses["1"].summary,
    "Previous feed cycle was interrupted by service restart"
);

var failedSaveDatabase = createDatabase();
failedSaveDatabase.failNextEntrySaves(3);
var failedSavePosts = runServiceInstance({
    database: failedSaveDatabase,
    entries: [feedEntries[0]]
});
assert.strictEqual(failedSavePosts.length, 1);
assert.deepStrictEqual(failedSavePosts.retryDelays, [500, 1500]);
assert.strictEqual(failedSaveDatabase.getEntrySaveAttempts(), 3);
assert(failedSavePosts.logs.some(function (message) {
    return message.indexOf("could not be recorded after 3 attempts") !== -1;
}));
assert.strictEqual(runServiceInstance({
    database: failedSaveDatabase,
    entries: [feedEntries[0]]
}).length, 1);

var unavailableRetryTimerDatabase = createDatabase();
unavailableRetryTimerDatabase.failNextEntrySaves(1);
var unavailableRetryTimerPosts = runServiceInstance({
    database: unavailableRetryTimerDatabase,
    entries: [feedEntries[0]],
    retryTimerError: "Retry timer unavailable"
});
assert.strictEqual(unavailableRetryTimerPosts.length, 1);
assert.strictEqual(unavailableRetryTimerDatabase.getEntrySaveAttempts(), 1);
assert(unavailableRetryTimerPosts.logs.some(function (message) {
    return message.indexOf("retry could not be scheduled") !== -1 &&
        message.indexOf("Retry timer unavailable") !== -1;
}));

console.log("RSS service restart deduplication tests passed");
