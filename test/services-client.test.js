var assert = require("assert");
var ServicesClient = require("../service/messages/services-client.js").ServicesClient;
var MessagesClient = require("../service/messages/messages-client.js").MessagesClient;

var servicesConnection;
var appConnection;
var appConnectionArguments;
var servicesMessages = [];
var readyCount = 0;
var errors = [];
var closeCount = 0;
var postResult;
var postError;
var topics;
var topicsError;

global.PbxApi = function (api) {
    assert.strictEqual(api, "Services");
    this.onconnected = function (callback) {
        this.connected = callback;
        global.servicesConnected = callback;
    };
};

global.AppWebsocketClient = {
    connect: function (url, password, app) {
        appConnectionArguments = [url, password, app];
        appConnection = {
            onauth: function (callback) {
                this.authCallback = callback;
                return this;
            },
            onopen: function (callback) {
                this.openCallback = callback;
                return this;
            },
            onmessage: function (callback) {
                this.messageCallback = callback;
                return this;
            },
            onclose: function (callback) {
                this.closeCallback = callback;
                return this;
            },
            auth: function () {
                this.authArguments = Array.prototype.slice.call(arguments);
                return this;
            },
            send: function (message) {
                this.sentMessage = JSON.parse(message);
            },
            close: function () {
                this.closed = true;
            }
        };
        global.Timers = {
            setTimeout: function () { return 1; },
            clearTimeout: function () {}
        };
        return appConnection;
    }
};

var servicesClient = new ServicesClient({ serviceName: "messages-api" });
servicesClient.onmessage(function (message) {
    servicesMessages.push(JSON.parse(message));
});
servicesClient.onclose(function () {
    closeCount++;
});
servicesClient.start(function () {
    readyCount++;
}, function (error) {
    errors.push(error);
});

servicesConnection = {
    sent: [],
    onmessage: function (callback) {
        this.messageCallback = callback;
    },
    onclose: function (callback) {
        this.closeCallback = callback;
    },
    send: function (message) {
        this.sent.push(JSON.parse(message));
    },
    decrypt: function (salt, key) {
        assert.strictEqual(salt, "salt-1");
        assert.strictEqual(key, "encrypted-key");
        return "decrypted-key";
    }
};
global.servicesConnected(servicesConnection);
assert.deepStrictEqual(servicesConnection.sent[0], {
    api: "Services",
    mt: "SubscribeServices"
});

servicesConnection.messageCallback(JSON.stringify({
    api: "Services",
    mt: "ServicesInfo",
    services: [
        { name: "unrelated@pbx.example", url: "wss://pbx/unrelated" },
        { name: "messages-api@pbx.example", url: "https://pbx.example/appdev/messages/innovaphone-messages-api" }
    ]
}));

assert.deepStrictEqual(appConnectionArguments, [
    "wss://pbx.example/appdev/messages/innovaphone-messages-api",
    null,
    "messages-api"
]);

var authenticationConnection = {
    callbackOnly: true
};
appConnection.authCallback(authenticationConnection, "messages-api", "challenge-1");
assert.deepStrictEqual(servicesConnection.sent[1], {
    api: "Services",
    mt: "GetServiceLogin",
    src: "rss-service-login-1",
    app: "messages-api@pbx.example",
    challenge: "challenge-1"
});

servicesConnection.messageCallback(JSON.stringify({
    api: "Services",
    mt: "GetServiceLoginResult",
    src: "rss-service-login-1",
    domain: "pbx.example",
    sip: "rss-connector",
    guid: "user-guid",
    dn: "RSS Connector",
    pbxObj: "pbx.example",
    app: "messages-api",
    info: { role: "service" },
    digest: "digest",
    key: "encrypted-key",
    salt: "salt-1"
}));

assert.deepStrictEqual(appConnection.authArguments, [
    "pbx.example",
    "rss-connector",
    "user-guid",
    "RSS Connector",
    "pbx.example",
    "messages-api",
    JSON.stringify({ role: "service" }),
    "digest",
    "decrypted-key"
]);

appConnection.openCallback(appConnection);
assert.strictEqual(readyCount, 1);
assert.deepStrictEqual(errors, []);

var messagesClient = new MessagesClient(servicesClient);
messagesClient.post({
    topic: "connect?technik@pbx.example",
    title: "Feed update",
    text: "<h3>Feed update</h3>",
    tags: ["security"]
}, function (result) {
    postResult = result;
}, function (error) {
    throw new Error(error);
});

assert.deepStrictEqual(appConnection.sentMessage, {
    src: "rss-post-1",
    mt: "Post",
    topic: "connect?technik@pbx.example",
    text: "<h3>Feed update</h3>",
    tags: ["security"]
});

messagesClient.readTopics(function (result) {
    topics = result;
}, function (error) {
    topicsError = error;
});
assert.deepStrictEqual(appConnection.sentMessage, {
    src: "rss-topics-1",
    mt: "ReadTopics"
});
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "unrelated-request",
    mt: "Topic",
    sip: "ignored@pbx.example",
    dn: "Ignored"
}));
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-topics-1",
    mt: "Topic",
    id: 7,
    sip: "connect@pbx.example",
    dn: "Connect"
}));
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-topics-1",
    mt: "Topic",
    sip: "connect?technik@pbx.example",
    dn: "Technik"
}));
assert.strictEqual(topics, undefined);
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-topics-1",
    mt: "ReadTopicsResult"
}));
assert.deepStrictEqual(topics, [
    { id: 7, sip: "connect@pbx.example", dn: "Connect" },
    { id: undefined, sip: "connect?technik@pbx.example", dn: "Technik" }
]);
assert.strictEqual(topicsError, undefined);

messagesClient.readTopics(function () {
    throw new Error("Rejected ReadTopics must not be reported as success");
}, function (error) {
    topicsError = error;
});
assert.deepStrictEqual(appConnection.sentMessage, {
    src: "rss-topics-2",
    mt: "ReadTopics"
});
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-topics-2",
    mt: "ReadTopicsResult",
    error: true
}));
assert.strictEqual(topicsError, "Messages API rejected the ReadTopics request");

appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-post-1",
    mt: "PostResult",
    error: false,
    id: 42
}));
assert.strictEqual(postResult.id, 42);
assert.deepStrictEqual(servicesMessages, []);

messagesClient.post({
    topic: "connect?technik@pbx.example",
    title: "Rejected update",
    text: "<h3>Rejected update</h3>",
    tags: []
}, function () {
    throw new Error("Rejected PostResult must not be reported as success");
}, function (error) {
    postError = error;
});
appConnection.messageCallback(appConnection, JSON.stringify({
    src: "rss-post-2",
    mt: "PostResult",
    error: true,
    errorText: "Unknown topic"
}));
assert.strictEqual(postError, "Messages API rejected the post: Unknown topic");

appConnection.closeCallback(appConnection);
assert.strictEqual(closeCount, 1);

console.log("Services discovery, authentication, close handling, and Messages API post tests passed");
