var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var source = fs.readFileSync(
    path.join(__dirname, "..", "service", "rss-service.js"),
    "utf8"
);

function runServiceWithTopics(topics) {
    var readyCallback;
    var topicsCallback;
    var schedulerStartCount = 0;
    var readTopicsCount = 0;
    var logs = [];

    function ServicesClient() {
        this.onclose = function () {};
        this.start = function (onReady) {
            readyCallback = onReady;
        };
    }

    function MessagesClient() {
        this.readTopics = function (onSuccess) {
            readTopicsCount++;
            topicsCallback = onSuccess;
        };
    }

    function Scheduler() {
        this.start = function () {
            schedulerStartCount++;
        };
    }

    function EntryRepository() {}
    EntryRepository.prototype.exists = function () { return false; };
    EntryRepository.prototype.save = function () {};

    function FeedRepository() {}
    FeedRepository.prototype.list = function (onSuccess) {
        onSuccess([{
            id: 1,
            name: "Test feed",
            url: "https://example.com/feed.xml",
            topic: "connect?test",
            tags: [],
            intervalMinutes: 15,
            enabled: true
        }]);
    };

    function HtmlBuilder() {}

    var constructors = {
        "./db/rss-entry-repository.js": { RssEntryRepository: EntryRepository },
        "./db/rss-feed-repository.js": { RssFeedRepository: FeedRepository },
        "./rss/html-builder.js": { HtmlBuilder: HtmlBuilder },
        "./messages/messages-client.js": { MessagesClient: MessagesClient },
        "./messages/services-client.js": { ServicesClient: ServicesClient },
        "./scheduler/scheduler.js": { Scheduler: Scheduler }
    };

    vm.runInNewContext(source, {
        require: function (modulePath) {
            if (!constructors[modulePath]) {
                throw new Error("Unexpected module: " + modulePath);
            }
            return constructors[modulePath];
        },
        Database: {
            exec: function () { throw new Error("Database is not expected in this test"); },
            escape: function (value) { return String(value); }
        },
        log: function (message) {
            logs.push(message);
        }
    });

    readyCallback();
    assert.strictEqual(readTopicsCount, 1);
    topicsCallback(topics);

    return {
        logs: logs,
        schedulerStartCount: schedulerStartCount
    };
}

var invalidTopicResult = runServiceWithTopics([
    { sip: "connect", dn: "Connect" },
    { sip: "connect?technik", dn: "Technik" }
]);
assert.strictEqual(invalidTopicResult.schedulerStartCount, 0);
assert(invalidTopicResult.logs.some(function (message) {
    return message.indexOf("connect?technik") !== -1;
}));

var validTopicResult = runServiceWithTopics([
    { sip: "connect?test", dn: "Test" }
]);
assert.strictEqual(validTopicResult.schedulerStartCount, 1);
assert(validTopicResult.logs.some(function (message) {
    return message.indexOf("Scheduled RSS feed") !== -1;
}));

console.log("RSS service topic validation tests passed");
