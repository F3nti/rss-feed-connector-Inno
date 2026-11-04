var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var icon = fs.readFileSync(
    path.join(__dirname, "..", "httpfiles", "rss-feed-connector.png")
);
assert.strictEqual(icon.readUInt32BE(0), 0x89504e47);
assert.strictEqual(icon.readUInt32BE(16), 100);
assert.strictEqual(icon.readUInt32BE(20), 100);
assert.deepStrictEqual(icon, fs.readFileSync(
    path.join(__dirname, "..", "httpfiles", "rss-connect-icon.png")
));
var appLogo = fs.readFileSync(path.join(
    __dirname,
    "..",
    "httpfiles",
    "rss-connect-logo.svg"
), "utf8");
assert(appLogo.indexOf('viewBox="32 32 448 448"') !== -1);
assert.strictEqual(
    fs.readFileSync(path.join(__dirname, "..", "httpfiles", "build.txt"), "utf8").trim(),
    "9"
);
assert.strictEqual(
    fs.readFileSync(path.join(__dirname, "..", "httpfiles", "label.txt"), "utf8").trim(),
    "rc"
);

var html = fs.readFileSync(
    path.join(__dirname, "..", "httpfiles", "rss-feed-connector.htm"),
    "utf8"
);
assert(html.indexOf('id="feed-enabled"') < html.indexOf('id="feed-initial-post-all"'));
assert(html.indexOf('src="web1/lib1/innovaphone.lib1.js"') !== -1);
assert(html.indexOf('src="web1/appwebsocket/innovaphone.appwebsocket.Connection.js"') !== -1);
assert(html.indexOf('src="rss-connect-logo.svg"') !== -1);
assert(html.indexOf('id="access-gate"') !== -1);
assert(html.indexOf('id="app-shell" class="app" hidden') !== -1);
assert(fs.existsSync(path.join(__dirname, "..", "httpfiles", "web1", "lib1", "innovaphone.lib1.js")));
assert(fs.existsSync(path.join(
    __dirname,
    "..",
    "httpfiles",
    "web1",
    "appwebsocket",
    "innovaphone.appwebsocket.Connection.js"
)));

var elements = {};
var topicOptions = [];
[
    "access-gate",
    "access-gate-heading",
    "access-gate-message",
    "app-shell",
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
].forEach(function (id) {
    elements[id] = {
        listeners: {},
        addEventListener: function (name, callback) {
            this.listeners[name] = callback;
        },
        setAttribute: function () {},
        removeAttribute: function () {},
        getAttribute: function () { return ""; },
        appendChild: function () {},
        removeChild: function () {},
        scrollIntoView: function () {},
        reset: function () {},
        textContent: "",
        value: "",
        firstChild: null,
        hidden: false,
        disabled: false,
        checked: false
    };
});
elements["feed-topic"].appendChild = function (option) {
    topicOptions.push(option);
    elements["feed-topic"].firstChild = topicOptions[0];
};
elements["feed-topic"].removeChild = function () {
    topicOptions.shift();
    elements["feed-topic"].firstChild = topicOptions[0] || null;
};

var connectionArguments;
var createdConnection;
var sentMessages = [];
var startCallback;
var schemeChanged;
var documentAttributes = {};
var context = {
    document: {
        documentElement: {
            setAttribute: function (name, value) {
                documentAttributes[name] = value;
            }
        },
        getElementById: function (id) {
            return elements[id];
        },
        createElement: function (tagName) {
            return {
                tagName: tagName,
                appendChild: function () {},
                addEventListener: function () {},
                setAttribute: function () {},
                textContent: "",
                className: "",
                value: ""
            };
        }
    },
    window: {
        setInterval: function () { return 1; },
        clearInterval: function () {},
        setTimeout: function () {},
        confirm: function () { return true; }
    },
    innovaphone: {
        lib1: {
            Start: function (callback) {
                startCallback = callback;
            }
        },
        appwebsocket: {
            Connection: function (url, name) {
                connectionArguments = [url, name];
                createdConnection = this;
                this.send = function (message) {
                    sentMessages.push(message);
                };
            }
        }
    }
};

vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "httpfiles", "rss-feed-connector.js"), "utf8"),
    context
);
assert.strictEqual(typeof startCallback, "function");
startCallback({});
assert.strictEqual(elements["access-gate"].hidden, false);
assert.strictEqual(elements["access-gate-heading"].textContent, "Nicht autorisiert");
assert.strictEqual(elements["app-shell"].hidden, true);
assert.strictEqual(createdConnection, undefined);
var appStart = {
    url: "wss://app.example/app",
    name: "rss-feed-connector",
    scheme: "dark",
    onschemechanged: {
        attach: function (callback) {
            schemeChanged = callback;
        }
    }
};
startCallback(appStart);
assert.strictEqual(elements["access-gate-heading"].textContent, "Verbindung wird geprüft");
assert.strictEqual(elements["app-shell"].hidden, true);
assert.strictEqual(documentAttributes["data-scheme"], "dark");
assert.strictEqual(typeof schemeChanged, "function");
appStart.scheme = "light";
schemeChanged();
assert.strictEqual(documentAttributes["data-scheme"], "light");
assert.strictEqual(JSON.stringify(connectionArguments), JSON.stringify([
    "wss://app.example/app",
    "rss-feed-connector"
]));
createdConnection.onconnected("example.com", "admin", "Admin");
assert.strictEqual(elements["access-gate"].hidden, true);
assert.strictEqual(elements["app-shell"].hidden, false);
assert.strictEqual(elements["identity-app"].textContent, "rss-feed-connector");
assert.strictEqual(elements["identity-user"].textContent, "Admin (admin@example.com)");
assert.strictEqual(sentMessages.length, 1);
assert.strictEqual(sentMessages[0].api, "rss-control");
assert.strictEqual(sentMessages[0].src, "rss-ui-1");
assert.strictEqual(sentMessages[0].mt, "GetState");
createdConnection.onmessage({
    mt: "State",
    topics: [
        { sip: "rssfeed", dn: "RSS Feed Connector" },
        { sip: "messages", dn: "Messages" },
        { sip: "connect?technik@example.com", dn: "Technik" }
    ],
    feeds: [],
    statuses: {}
});
assert.deepStrictEqual(topicOptions.map(function (option) { return option.value; }), [
    "",
    "connect?technik@example.com"
]);
assert.strictEqual(elements["feed-topic"].disabled, false);
assert.strictEqual(elements["save-feed"].disabled, false);
elements["feed-name"].value = "Test feed";
elements["feed-url"].value = "https://example.com/feed.xml";
elements["feed-interval"].value = "15";
elements["feed-initial-post-limit"].value = "7";
elements["feed-initial-post-all"].checked = true;
elements["feed-initial-post-all"].listeners.change.call(
    elements["feed-initial-post-all"]
);
assert.strictEqual(elements["feed-initial-post-limit"].disabled, true);
elements["feed-form"].listeners.submit({
    preventDefault: function () {}
});
assert.strictEqual(sentMessages[1].mt, "SaveFeed");
assert.strictEqual(sentMessages[1].feed.initialPostLimit, 7);
assert.strictEqual(sentMessages[1].feed.initialPostAll, true);
createdConnection.onmessage({
    mt: "State",
    topics: [
        { sip: "rssfeed", dn: "RSS Feed Connector" },
        { sip: "messages", dn: "Messages" }
    ],
    feeds: [],
    statuses: {}
});
assert.deepStrictEqual(topicOptions.map(function (option) { return option.value; }), [""]);
assert.strictEqual(elements["feed-topic"].disabled, true);
assert.strictEqual(elements["save-feed"].disabled, true);

createdConnection.onerror("authentication failed");
assert.strictEqual(elements["access-gate"].hidden, false);
assert.strictEqual(elements["access-gate-heading"].textContent, "myApps-Verbindung fehlgeschlagen");
assert.strictEqual(elements["access-gate-message"].textContent.indexOf("authentication failed") !== -1, true);
assert.strictEqual(elements["app-shell"].hidden, true);

console.log("myApps UI startup tests passed");
