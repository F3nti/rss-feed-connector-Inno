var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function createElement(tagName) {
    return {
        tagName: tagName,
        children: [],
        listeners: {},
        attributes: {},
        textContent: "",
        value: "",
        className: "",
        hidden: false,
        disabled: false,
        firstChild: null,
        addEventListener: function (name, callback) {
            this.listeners[name] = callback;
        },
        appendChild: function (child) {
            this.children.push(child);
            this.firstChild = this.children[0] || null;
        },
        removeChild: function (child) {
            this.children.splice(this.children.indexOf(child), 1);
            this.firstChild = this.children[0] || null;
        },
        setAttribute: function (name, value) {
            this.attributes[name] = value;
        },
        getAttribute: function (name) {
            return this.attributes[name] || "";
        },
        removeAttribute: function (name) {
            delete this.attributes[name];
        },
        scrollIntoView: function () {},
        reset: function () {},
        click: function () {
            this.listeners.click();
        }
    };
}

var elementIds = [
    "feed-form",
    "feed-list",
    "feed-topic",
    "notice",
    "connection-status",
    "identity-app",
    "identity-user",
    "refresh",
    "cancel-edit",
    "save-feed",
    "feed-id",
    "feed-name",
    "feed-url",
    "feed-tags",
    "feed-interval",
    "feed-initial-post-limit",
    "feed-initial-post-all",
    "feed-enabled",
    "form-heading"
];
var elements = {};
elementIds.forEach(function (id) {
    elements[id] = createElement(id);
});

var sentMessages = [];
var startCallback;
var connection;
var context = {
    document: {
        documentElement: createElement("html"),
        getElementById: function (id) {
            return elements[id];
        },
        createElement: createElement
    },
    window: {
        setInterval: function () { return 1; },
        clearInterval: function () {},
        setTimeout: function () {},
        confirm: function () {
            throw new Error("The native confirmation dialog must not be used");
        }
    },
    innovaphone: {
        lib1: {
            Start: function (callback) {
                startCallback = callback;
            }
        },
        appwebsocket: {
            Connection: function () {
                connection = this;
                this.send = function (message) {
                    sentMessages.push(message);
                };
            }
        }
    }
};

vm.runInNewContext(
    fs.readFileSync(
        path.join(__dirname, "..", "httpfiles", "rss-feed-connector.js"),
        "utf8"
    ),
    context
);
startCallback({
    url: "wss://app.example/app",
    name: "rss-feed-connector"
});
connection.onconnected("example.com", "admin", "Admin");
connection.onmessage({
    mt: "State",
    topics: [{ sip: "connect?test@example.com", dn: "Test" }],
    feeds: [{
        id: 7,
        name: "Test feed",
        url: "https://example.com/feed.xml",
        topic: "connect?test@example.com",
        tags: [],
        intervalMinutes: 15,
        enabled: true
    }],
    statuses: {
        "7": {
            state: "success",
            summary: "1 posted, 2 duplicates, 0 failed",
            lastRun: "2026-11-02T08:30:00.000Z"
        }
    }
});

var card = elements["feed-list"].children[0];
assert.strictEqual(card.children[0].className, "feed-details");
assert.strictEqual(card.children[1].className, "feed-controls");
var controls = card.children[1];
var statusHeader = controls.children[0];
assert.strictEqual(statusHeader.children[0].textContent, "Aktiv");
assert.strictEqual(
    statusHeader.children[1].children[0].textContent,
    "1 posted, 2 duplicates, 0 failed"
);
assert.strictEqual(
    statusHeader.children[1].children[1].textContent,
    "Letzter Abruf: 2026-11-02T08:30:00.000Z"
);
var buttons = controls.children[1].children;
var deleteButton = buttons.filter(function (button) {
    return button.textContent === "Löschen";
})[0];
var cancelButton = buttons.filter(function (button) {
    return button.textContent === "Abbrechen";
})[0];

deleteButton.click();
assert.strictEqual(deleteButton.textContent, "Löschen bestätigen");
assert.strictEqual(cancelButton.hidden, false);
assert.strictEqual(sentMessages.length, 1);

cancelButton.click();
assert.strictEqual(deleteButton.textContent, "Löschen");
assert.strictEqual(cancelButton.hidden, true);

deleteButton.click();
deleteButton.click();
assert.strictEqual(sentMessages.length, 2);
assert.strictEqual(sentMessages[1].mt, "DeleteFeed");
assert.strictEqual(sentMessages[1].feedId, 7);
assert.strictEqual(deleteButton.disabled, true);

connection.onmessage({
    mt: "ApiError",
    src: sentMessages[1].src,
    error: "Database unavailable"
});
assert.strictEqual(deleteButton.disabled, false);
assert.strictEqual(cancelButton.disabled, false);
assert.strictEqual(deleteButton.textContent, "Erneut versuchen");

connection.onclosed();
deleteButton.click();
assert.strictEqual(sentMessages.length, 2);
assert.strictEqual(deleteButton.disabled, false);

console.log("myApps feed delete confirmation tests passed");
