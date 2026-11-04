var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var pluginPath = path.join(
    __dirname,
    "..",
    "httpfiles",
    "f3nti.ManagerRssFeedConnector.js"
);
var rootClass;
var context = {
    innovaphone: {
        ui1: {
            nodePrototype: {
                createNode: function (type, style, content, className) {
                    rootClass = className;
                    this.container = {};
                },
                add: function (node) {
                    return node;
                }
            },
            Div: function () {}
        }
    }
};
vm.runInNewContext(fs.readFileSync(pluginPath, "utf8"), context);

new context.plugin.f3nti.ManagerRssFeedConnector(
    { consumeApi: function () { return null; } },
    { uri: "https://app.example/app/4/" },
    {}
);
assert.strictEqual(rootClass, "item-node");
assert.strictEqual(context.button, undefined);
assert.strictEqual(context.addField, undefined);
assert.strictEqual(context.parseAppList, undefined);

var request = context.plugin.f3nti.ManagerRssFeedConnector.buildAppObjectRequest(
    "RSS Feed",
    "rss-feed-connector",
    "temporary-password",
    "https://app.example/app/4/rss-feed-connector.htm"
);

assert.strictEqual(request.api, "PbxAdminApi");
assert.strictEqual(request.mt, "UpdateObject");
assert.strictEqual(request.cn, "rss-feed-connector");
assert.strictEqual(request.dn, "RSS Feed");
assert.strictEqual(request.h323, "rss-feed-connector");
assert.strictEqual(Object.prototype.hasOwnProperty.call(request, "config"), false);
assert.strictEqual(request.apps, "connect,messages-api");
assert.strictEqual(request.pwd, "temporary-password");
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(request.pseudo)),
    {
        type: "app",
        app: {
            url: "https://app.example/app/4/rss-feed-connector.htm",
            websocket: true,
            "no-cert-check": true,
            messages: true,
            services: true
        }
    }
);
var updateRequest = context.plugin.f3nti.ManagerRssFeedConnector.buildAppObjectRequest(
    "RSS Feed",
    "rss-feed-connector",
    null,
    "https://app.example/app/4/rss-feed-connector.htm",
    "existing-guid"
);
assert.strictEqual(updateRequest.guid, "existing-guid");
assert.strictEqual(Object.prototype.hasOwnProperty.call(updateRequest, "pwd"), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(updateRequest, "config"), false);
var secondAppRequest = context.plugin.f3nti.ManagerRssFeedConnector.buildAppObjectRequest(
    "RSS Feed Backup",
    "rss-feed-backup",
    null,
    "https://app.example/app/4/rss-feed-connector.htm",
    null,
    "rss-feed-backup",
    "rss-feed-connector"
);
assert.strictEqual(secondAppRequest.cn, "rss-feed-backup");
assert.strictEqual(secondAppRequest.copyPwd, "rss-feed-connector");
assert.strictEqual(Object.prototype.hasOwnProperty.call(secondAppRequest, "pwd"), false);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(
        context.plugin.f3nti.ManagerRssFeedConnector.buildDeleteObjectRequest("app-guid")
    )),
    {
        api: "PbxAdminApi",
        mt: "DeleteObject",
        guid: "app-guid"
    }
);

var mergeAppList = context.plugin.f3nti.ManagerRssFeedConnector.mergeAppList;
var isManagedAppObject = context.plugin.f3nti.ManagerRssFeedConnector.isManagedAppObject;
var displayAppUrl = context.plugin.f3nti.ManagerRssFeedConnector.displayAppUrl;
assert.strictEqual(
    displayAppUrl("https://pbx.example/innovaphone-files"),
    "/innovaphone-files"
);
assert.strictEqual(displayAppUrl("/innovaphone-files"), "/innovaphone-files");
var appObjectFromGetObjectResult =
    context.plugin.f3nti.ManagerRssFeedConnector.appObjectFromGetObjectResult;
assert.strictEqual(appObjectFromGetObjectResult({
    mt: "GetObjectResult",
    guid: "disconnected-guid",
    cn: "rss-feed-backup",
    dn: "RSS Feed Backup",
    h323: "rss-feed-backup",
    pseudo: {
        type: "app",
        state: "down",
        app: { url: "https://app.example/app/4/rss-feed-backup/rss-feed-connector.htm" }
    }
}).connected, false);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(appObjectFromGetObjectResult({
        mt: "GetObjectResult",
        guid: "existing-guid",
        cn: "rss-feed-connector",
        dn: "RSS Feed",
        h323: "rss-feed-connector",
        pseudo: {
            type: "app",
            state: "connected",
            app: {
                url: "https://app.example/app/4/rss-feed-connector.htm"
            }
        }
    }))),
    {
        title: "RSS Feed",
        cn: "rss-feed-connector",
        sip: "rss-feed-connector",
        url: "https://app.example/app/4/rss-feed-connector.htm",
        connected: true,
        guid: "existing-guid",
        pseudo: "app"
    }
);
assert.strictEqual(appObjectFromGetObjectResult({
    mt: "GetObjectResult",
    guid: "another-guid",
    pseudo: { type: "user" }
}), null);
assert.strictEqual(isManagedAppObject({
    sip: "rss-feed-connector@example.test",
    url: "https://app.example/app/old-path.htm"
}, "https://app.example/app/4/"), false);
assert.strictEqual(isManagedAppObject({
    sip: "another-app@example.test",
    url: "https://app.example/app/4/rss-feed-connector/rss-feed-connector.htm"
}, "https://app.example/app/4/"), true);
assert.strictEqual(isManagedAppObject({
    sip: "another-app@example.test",
    url: "https://app.example/app/40/another-app/rss-feed-connector.htm"
}, "https://app.example/app/4/"), false);
var getAppUrl = context.plugin.f3nti.ManagerRssFeedConnector.getAppUrl;
var getCanonicalAppUri =
    context.plugin.f3nti.ManagerRssFeedConnector.getCanonicalAppUri;
assert.strictEqual(
    getCanonicalAppUri(
        "http://localhost:10008/appproxy/ext/logintk-a.innovaphone.com/log-in-tk.de/rss-feed-connector-2/"
    ),
    "https://logintk-a.innovaphone.com/log-in-tk.de/rss-feed-connector-2/"
);
assert.strictEqual(
    getCanonicalAppUri("http://ap.example/appdev/rss-feed-connector/"),
    "https://ap.example/appdev/rss-feed-connector/"
);
assert.strictEqual(
    getCanonicalAppUri("https://ap.example/appdev/rss-feed-connector/"),
    "https://ap.example/appdev/rss-feed-connector/"
);
assert.strictEqual(
    getAppUrl("https://app.example/app/4/", "rss-feed-backup"),
    "https://app.example/app/4/rss-feed-backup/rss-feed-connector.htm"
);
assert.strictEqual(
    getAppUrl("https://app.example/app/4/", "rss-feed-backup@example.test"),
    "https://app.example/app/4/rss-feed-backup/rss-feed-connector.htm"
);
assert.throws(function () {
    getAppUrl("https://app.example/app/4/", "../other");
}, /valid App Platform instance name/);
var getUrlPath = context.plugin.f3nti.ManagerRssFeedConnector.getUrlPath;
assert.strictEqual(
    getUrlPath("https://app.example/app/4/rss-feed-backup/rss-feed-connector.htm"),
    "app/4/rss-feed-backup/rss-feed-connector.htm"
);
var getInstancePath = context.plugin.f3nti.ManagerRssFeedConnector.getInstancePath;
assert.strictEqual(
    getInstancePath("https://app.example/app/4/rss-feed-backup/rss-feed-connector.htm"),
    "app/4/rss-feed-backup"
);
var getParentInstanceRoot =
    context.plugin.f3nti.ManagerRssFeedConnector.getParentInstanceRoot;
assert.strictEqual(
    getParentInstanceRoot("https://app.example/app/4/rss-feed-connector/"),
    "https://app.example/app/4/"
);
var findAppObjectBySip = context.plugin.f3nti.ManagerRssFeedConnector.findAppObjectBySip;
assert.strictEqual(findAppObjectBySip([
    { sip: "first-app", url: "https://app.example/app/4/rss-feed-connector.htm" },
    { sip: "rss-feed-backup", url: "https://app.example/app/4/rss-feed-connector.htm" }
], "rss-feed-backup").sip, "rss-feed-backup");
assert.strictEqual(findAppObjectBySip([
    { sip: "first-app", url: "https://app.example/app/4/rss-feed-connector.htm" }
], "rss-feed-backup"), undefined);
var templateUpdate = context.plugin.f3nti.ManagerRssFeedConnector.buildTemplateAccessUpdate(
    "template-guid",
    "users,calendar",
    "users",
    "old-rss-name",
    "rss-feed-connector",
    true
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(templateUpdate)),
    {
        api: "PbxAdminApi",
        mt: "UpdateObject",
        guid: "template-guid",
        template: "without",
        apps: "users,calendar,rss-feed-connector",
        "apps-my": "users,rss-feed-connector"
    }
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(mergeAppList(
        "users, rss-feed-connector,calendar",
        "rss-feed-connector",
        "rss-feed-connector",
        false
    ))),
    ["users", "calendar"]
);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(mergeAppList(
        "users,calendar",
        "old-rss-name",
        "rss-feed-connector",
        true
    ))),
    ["users", "calendar", "rss-feed-connector"]
);

var manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "plugins.json"),
    "utf8"
));
assert.strictEqual(manifest.plugins.length, 1);
assert.strictEqual(manifest.plugins[0].js, "f3nti.ManagerRssFeedConnector");
