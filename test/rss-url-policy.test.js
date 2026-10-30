var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var RssUrlPolicy = require("../service/rss/rss-url-policy.js");
var serviceConfig = require("../config.json");

assert.strictEqual(serviceConfig.javascript.eval[0], "service/rss/rss-url-policy.js");
assert.strictEqual(RssUrlPolicy.parse("https://example.com/feed.xml").hostname, "example.com");
assert.strictEqual(RssUrlPolicy.parse("http://8.8.8.8/feed.xml").isIpLiteral, true);
assert.strictEqual(RssUrlPolicy.parse("http://192.0.3.8/feed.xml").isIpLiteral, true);
assert.strictEqual(RssUrlPolicy.isPublicAddress("2001:4860:4860::8888"), true);
assert.strictEqual(RssUrlPolicy.isPublicAddress("::ffff:127.0.0.1"), false);

var runtimeContext = vm.createContext({
    Dns: {
        getHostByName: function (hostName, all, timeout) {
            assert.strictEqual(hostName, "example.com");
            assert.strictEqual(all, true);
            assert.strictEqual(timeout, 5000);
            return {
                onresult: function (callback) {
                    callback(hostName, [{ addr: "93.184.216.34" }]);
                    return this;
                }
            };
        }
    }
});
[
    "../service/rss/rss-url-policy.js",
    "../service/rss/rss-parser.js"
].forEach(function (file) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), runtimeContext);
});
var runtimeValidation = vm.runInContext(
    "(function () {" +
        "var result;" +
        "RssUrlPolicy.validateDestination('https://example.com/feed.xml'," +
            "function () { result = 'success'; }," +
            "function (error) { result = error; });" +
        "return result;" +
    "}())",
    runtimeContext
);
assert.strictEqual(runtimeValidation, "success");

[
    "http://127.0.0.1/feed.xml",
    "http://10.1.2.3/feed.xml",
    "http://169.254.169.254/latest/meta-data",
    "http://172.16.0.1/feed.xml",
    "http://192.168.1.1/feed.xml",
    "http://192.0.2.1/feed.xml",
    "http://127.1/feed.xml",
    "http://0x7f000001/feed.xml",
    "http://0x7f.0.0.1/feed.xml",
    "http://[::1]/feed.xml",
    "http://[fe80::1]/feed.xml",
    "https://user:password@example.com/feed.xml",
    "https://example.com:70000/feed.xml"
].forEach(function (url) {
    assert.throws(function () {
        RssUrlPolicy.parse(url);
    }, Error, url);
});

var originalDns = global.Dns;
try {
    var validationError;
    var validationSucceeded = false;
    global.Dns = {
        getHostByName: function (hostName, all, timeout) {
            assert.strictEqual(hostName, "example.com");
            assert.strictEqual(all, true);
            assert.strictEqual(timeout, 5000);
            return {
                onresult: function (callback) {
                    callback(hostName, [
                        { addr: "93.184.216.34" },
                        { addr: "2001:4860:4860::8888" }
                    ]);
                    return this;
                }
            };
        }
    };
    RssUrlPolicy.validateDestination("https://example.com/feed.xml", function () {
        validationSucceeded = true;
    }, function (error) {
        validationError = error;
    });
    assert.strictEqual(validationSucceeded, true);
    assert.strictEqual(validationError, undefined);

    global.Dns.getHostByName = function (hostName, all, timeout) {
        return {
            onresult: function (callback) {
                callback(hostName, [
                    { addr: "93.184.216.34" },
                    { addr: "10.0.0.5" }
                ]);
                return this;
            }
        };
    };
    validationError = null;
    RssUrlPolicy.validateDestination("https://example.com/feed.xml", function () {
        throw new Error("Mixed public and private DNS answers must be rejected");
    }, function (error) {
        validationError = error;
    });
    assert.strictEqual(validationError, "Feed host resolves to a non-public IP address");

    delete global.Dns;
    validationError = null;
    RssUrlPolicy.validateDestination("https://example.com/feed.xml", function () {
        throw new Error("Missing DNS validation must fail closed");
    }, function (error) {
        validationError = error;
    });
    assert.strictEqual(validationError, "DNS validation is not available");
    console.log("RSS URL destination policy tests passed");
}
finally {
    if (originalDns === undefined) {
        delete global.Dns;
    }
    else {
        global.Dns = originalDns;
    }
}
