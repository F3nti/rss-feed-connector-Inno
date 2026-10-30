var assert = require("assert");
var HtmlBuilder = require("../service/rss/html-builder.js").HtmlBuilder;
var MessagesClient = require("../service/messages/messages-client.js").MessagesClient;

function MockTransport() {
    var messageHandler;
    var closeHandler;
    this.sent = [];
    this.onmessage = function (callback) {
        messageHandler = callback;
    };
    this.onclose = function (callback) {
        closeHandler = callback;
    };
    this.send = function (message) {
        this.sent.push(message);
    };
    this.respond = function (index, rejected) {
        var message = this.sent[index];
        messageHandler(JSON.stringify({
            src: message.src,
            mt: "PostResult",
            error: rejected === true,
            id: index + 1
        }));
    };
    this.close = function () {
        closeHandler();
    };
}

var builder = new HtmlBuilder();
var html = builder.build({
    title: "<Security & alert>",
    description: "<script>alert('x')</script><p class=\"feed-copy\">Safe &amp; sound</p>",
    link: "https://example.com/?a=1&b=2",
    published: "Today"
});
assert.strictEqual(html.indexOf("<h3>&lt;Security &amp; alert&gt;</h3>"), 0);
assert.ok(html.indexOf("<script>") < 0);
assert.ok(html.indexOf("alert('x')") < 0);
assert.ok(html.indexOf('<p>Safe &amp; sound</p>') >= 0);
assert.ok(html.indexOf(
    'href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"'
) >= 0);
assert.ok(html.indexOf("<small>Today</small>") >= 0);
assert.ok(builder.build({ title: "No link" }).indexOf("<a ") < 0);
assert.strictEqual(builder.build({
    title: "Cloudflare",
    description: '<section><a href="https://example.com/news"><img src="https://example.com/image.jpg?size=300&amp;quality=75" alt="Logo"/></a><p>Summary</p></section>'
}).indexOf(
    '<section><img src="https://example.com/image.jpg?size=300&amp;quality=75" alt="Logo">' +
    '<p>Summary</p></section>'
) >= 0, true);
assert.ok(builder.build({
    title: "Unsafe links",
    description: '<a href="javascript:alert(1)" onclick="alert(1)">link</a><img src="https://example.com/image" onerror="alert(1)"/>'
}).indexOf("javascript:") < 0);
assert.ok(builder.build({
    title: "Unsafe links",
    description: '<a href="javascript:alert(1)" onclick="alert(1)">link</a><img src="https://example.com/image" onerror="alert(1)"/>'
}).indexOf("onclick") < 0);
var logs = [];
var transport = new MockTransport();
var client = new MessagesClient(transport);
var knownEntries = {};
var entries = [
    { guid: "entry-1", title: "Security alert" },
    { guid: "entry-1", title: "Security alert duplicate" },
    { guid: "entry-2", title: "Second alert" }
];

function postNewEntries(feedEntries) {
    var dispatched = 0;
    var submitted = {};
    feedEntries.forEach(function (entry) {
        var guidKey = "$" + entry.guid;
        if (knownEntries[guidKey] || submitted[guidKey]) {
            return;
        }

        submitted[guidKey] = true;
        client.post({
            topic: "connect?technik@domain",
            title: entry.title,
            text: builder.build(entry),
            tags: ["security", "heise"]
        }, function () {
            knownEntries[guidKey] = true;
        }, function (error) {
            logs.push(error);
        });
        dispatched++;
    });
    return dispatched;
}

assert.strictEqual(postNewEntries(entries), 2);
assert.strictEqual(knownEntries["$entry-1"], undefined);
transport.respond(0, false);
transport.respond(1, false);
assert.strictEqual(knownEntries["$entry-1"], true);
assert.strictEqual(knownEntries["$entry-2"], true);
assert.strictEqual(postNewEntries(entries), 0);
assert.strictEqual(transport.sent.length, 2);
assert.deepStrictEqual(transport.sent[0], {
    src: "rss-post-1",
    mt: "Post",
    topic: "connect?technik@domain",
    text: "<h3>Security alert</h3>",
    tags: ["security", "heise"]
});
assert.throws(function () {
    client.post({}, function () {}, function () {});
}, /topic/);

var disconnectedTransport = new MockTransport();
var disconnectedClient = new MessagesClient(disconnectedTransport);
var disconnectedError;
disconnectedClient.post({
    topic: "connect?technik@domain",
    title: "Pending entry",
    text: "<h3>Pending entry</h3>",
    tags: []
}, function () {
    throw new Error("A disconnected post must not be reported as successful");
}, function (error) {
    disconnectedError = error;
});
disconnectedTransport.close();
assert.strictEqual(disconnectedError, "Messages API connection closed");

var originalSetTimeout = global.setTimeout;
var originalClearTimeout = global.clearTimeout;
var postTimeout;
var timeoutError;
global.setTimeout = function (callback, delay) {
    assert.strictEqual(delay, 30000);
    postTimeout = callback;
    return 17;
};
global.clearTimeout = function (timer) {
    assert.strictEqual(timer, 17);
};
try {
    var timeoutClient = new MessagesClient(new MockTransport());
    timeoutClient.post({
        topic: "connect?technik@domain",
        title: "Timed out entry",
        text: "<h3>Timed out entry</h3>",
        tags: []
    }, function () {
        throw new Error("Missing PostResult must not be reported as success");
    }, function (error) {
        timeoutError = error;
    });
    postTimeout();
    assert.strictEqual(timeoutError, "Timed out waiting for Messages API PostResult");
}
finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
}

var rejectedTransport = new MockTransport();
var rejectedClient = new MessagesClient(rejectedTransport);
var rejectedEntryError;
rejectedClient.post({
    topic: "connect?technik@domain",
    title: "Rejected entry",
    text: "<h3>Rejected entry</h3>",
    tags: []
}, function () {
    throw new Error("Rejected entries must not be recorded as posted");
}, function (error) {
    rejectedEntryError = error;
});
rejectedTransport.respond(0, true);
if (!rejectedEntryError) {
    throw new Error("Messages API rejection was not reported");
}

console.log("RSS pipeline component tests passed");
