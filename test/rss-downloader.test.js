var assert = require("assert");
var TextDecoder = require("util").TextDecoder;
var RssDownloader = require("../service/rss/rss-downloader.js").RssDownloader;

function createRequest(statusCode) {
    return {
        receive: null,
        complete: null,
        error: null,
        recvCalls: 0,
        onrecv: function (callback) {
            this.receive = callback;
            return this;
        },
        recv: function () {
            this.recvCalls++;
            return this;
        },
        oncomplete: function (callback) {
            this.complete = callback;
            return this;
        },
        onerror: function (callback) {
            this.error = callback;
            return this;
        },
        responseCode: function () {
            return statusCode;
        },
        responseCodeDescription: function () {
            return statusCode + " Test Status";
        },
        responseHeader: function (field) {
            assert.strictEqual(field, "Content-Type");
            return ["application/atom+xml; charset=utf-8"];
        }
    };
}

var originalHttpClient = global.HttpClient;
var originalTextDecoder = global.TextDecoder;
var originalDns = global.Dns;
var originalLog = global.log;
var logs = [];
global.TextDecoder = TextDecoder;
global.log = function (message) {
    logs.push(message);
};
global.Dns = {
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
};

try {
    var request = createRequest(200);
    global.HttpClient = {
        request: function (method, url) {
            assert.strictEqual(method, "GET");
            assert.strictEqual(url, "https://example.com/feed.xml");
            return request;
        }
    };

    var downloadedXml = "";
    var downloadError = null;
    var responseMetadata = null;
    new RssDownloader().download(
        "https://example.com/feed.xml",
        function (xml, metadata) {
            downloadedXml = xml;
            responseMetadata = metadata;
        },
        function (error) {
            downloadError = error;
        }
    );

    request.receive(request, new Uint8Array(Buffer.from("<rss>caf")), false);
    request.receive(request, new Uint8Array(Buffer.from("é</rss>")), true);
    request.complete(request, true);

    assert.strictEqual(downloadedXml, "<rss>café</rss>");
    assert.strictEqual(downloadError, null);
    assert.deepStrictEqual(responseMetadata, {
        statusCode: 200,
        contentType: "application/atom+xml; charset=utf-8"
    });
    assert.ok(logs.indexOf("RSS URL destination validation passed") >= 0);
    assert.ok(logs.indexOf("RSS HTTP request created") >= 0);
    assert.ok(logs.indexOf(
        "RSS HTTP response: 200, Content-Type application/atom+xml; charset=utf-8," +
            " first response bytes 0x3C 0x72 0x73 0x73 0x3E 0x63 0x61 0x66"
    ) >= 0);
    assert.strictEqual(logs.filter(function (message) {
        return message.indexOf("RSS HTTP response:") === 0;
    }).length, 1);
    assert.strictEqual(request.recvCalls, 1);

    var utf16LeRequest = createRequest(200);
    global.HttpClient.request = function () {
        return utf16LeRequest;
    };
    downloadedXml = "";
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function (xml) {
        downloadedXml = xml;
    }, function (error) {
        downloadError = error;
    });
    var utf16LeBytes = Buffer.concat([
        Buffer.from([0xFF, 0xFE]),
        Buffer.from("<rss/>", "utf16le")
    ]);
    utf16LeRequest.receive(utf16LeRequest, new Uint8Array(utf16LeBytes.slice(0, 1)), false);
    utf16LeRequest.receive(utf16LeRequest, new Uint8Array(utf16LeBytes.slice(1, 4)), false);
    utf16LeRequest.receive(utf16LeRequest, new Uint8Array(utf16LeBytes.slice(4)), true);
    utf16LeRequest.complete(utf16LeRequest, true);
    assert.strictEqual(downloadedXml, "<rss/>");
    assert.strictEqual(downloadError, null);

    var utf16BeRequest = createRequest(200);
    global.HttpClient.request = function () {
        return utf16BeRequest;
    };
    downloadedXml = "";
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function (xml) {
        downloadedXml = xml;
    }, function (error) {
        downloadError = error;
    });
    var utf16BeBytes = Buffer.concat([
        Buffer.from([0xFE, 0xFF]),
        Buffer.from("<rss/>", "utf16le").swap16()
    ]);
    utf16BeRequest.receive(utf16BeRequest, new Uint8Array(utf16BeBytes), true);
    utf16BeRequest.complete(utf16BeRequest, true);
    assert.strictEqual(downloadedXml, "<rss/>");
    assert.strictEqual(downloadError, null);

    var failedRequest = createRequest(503);
    global.HttpClient.request = function () {
        return failedRequest;
    };

    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function () {
        throw new Error("Failed response must not be reported as a success");
    }, function (error) {
        downloadError = error;
    });
    failedRequest.receive(failedRequest, new Uint8Array(Buffer.from("unavailable")), true);
    failedRequest.complete(failedRequest, true);

    assert.strictEqual(
        downloadError,
        "RSS feed request returned HTTP 503 (HTTP 503, Content-Type application/atom+xml; charset=utf-8)"
    );

    var abortedRequest = createRequest(0);
    global.HttpClient.request = function () {
        return abortedRequest;
    };
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function () {
        throw new Error("Aborted response must not be reported as a success");
    }, function (error) {
        downloadError = error;
    });
    abortedRequest.complete(abortedRequest, false);
    assert.strictEqual(
        downloadError,
        "RSS feed request failed: 0 Test Status (HTTP 0, Content-Type application/atom+xml; charset=utf-8)"
    );

    var parserErrorRequest = createRequest(200);
    global.HttpClient.request = function () {
        return parserErrorRequest;
    };
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function () {
        throw new Error("Parser errors routed to onerror must not be reported as success");
    }, function (error) {
        downloadError = error;
    });
    parserErrorRequest.error("Non-whitespace text found before the XML root element at offset 0");
    assert.strictEqual(
        downloadError,
        "RSS feed request aborted: Non-whitespace text found before the XML root element at offset 0" +
            " (HTTP 200, Content-Type application/atom+xml; charset=utf-8)"
    );

    var redirectRequest = createRequest(302);
    global.HttpClient.request = function () {
        return redirectRequest;
    };
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function () {
        throw new Error("Redirects must not be followed");
    }, function (error) {
        downloadError = error;
    });
    redirectRequest.complete(redirectRequest, true);
    assert.strictEqual(
        downloadError,
        "RSS feed redirects are not allowed (HTTP 302, Content-Type application/atom+xml; charset=utf-8)"
    );

    var privateDnsRequestCount = 0;
    global.HttpClient.request = function () {
        privateDnsRequestCount++;
        throw new Error("Private DNS answers must not reach HttpClient");
    };
    global.Dns.getHostByName = function (hostName, all, timeout) {
        return {
            onresult: function (callback) {
                callback(hostName, [{ addr: "10.0.0.5" }]);
                return this;
            }
        };
    };
    downloadError = null;
    new RssDownloader().download("https://example.com/feed.xml", function () {
        throw new Error("Private DNS answers must be rejected");
    }, function (error) {
        downloadError = error;
    });
    assert.strictEqual(downloadError, "Feed host resolves to a non-public IP address");
    assert.strictEqual(privateDnsRequestCount, 0);
    assert.ok(logs.indexOf(
        "RSS download failed during URL validation: " +
            "Feed host resolves to a non-public IP address"
    ) >= 0);

    console.log("RSS downloader tests passed");
}
finally {
    if (originalHttpClient === undefined) {
        delete global.HttpClient;
    }
    else {
        global.HttpClient = originalHttpClient;
    }

    if (originalTextDecoder === undefined) {
        delete global.TextDecoder;
    }
    else {
        global.TextDecoder = originalTextDecoder;
    }

    if (originalDns === undefined) {
        delete global.Dns;
    }
    else {
        global.Dns = originalDns;
    }

    if (originalLog === undefined) {
        delete global.log;
    }
    else {
        global.log = originalLog;
    }
}
