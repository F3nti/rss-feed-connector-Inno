function RssDownloader() {
    this.download = function (feedUrl, onSuccess, onError) {
        var completed = false;
        var responseText = "";
        var decoder;
        var initialBytes = [];
        var request;
        var responseMetadata;
        var responseLogged = false;
        var phase = "URL validation";

        function fail(error) {
            if (completed) {
                return;
            }

            completed = true;
            if (typeof onError === "function") {
                var message = error && error.message ? error.message : String(error);
                var metadata = responseMetadata || getResponseMetadata(request);
                if (metadata) {
                    message += " (HTTP " + metadata.statusCode +
                        (metadata.contentType
                            ? ", Content-Type " + metadata.contentType
                            : "") + ")";
                }
                logDiagnostic("RSS download failed during " + phase + ": " + message);
                onError(message);
            }
        }

        var urlPolicy;
        try {
            urlPolicy = getUrlPolicy();
        }
        catch (error) {
            fail(error);
            return;
        }

        urlPolicy.validateDestination(feedUrl, function () {
            try {
                logDiagnostic("RSS URL destination validation passed");
                phase = "HTTP request setup";
                if (typeof HttpClient === "undefined" || typeof HttpClient.request !== "function") {
                    throw new Error("HttpClient.request is not available");
                }

                if (typeof TextDecoder !== "function") {
                    throw new Error("TextDecoder is not available");
                }

                request = HttpClient.request("GET", feedUrl);
                logDiagnostic("RSS HTTP request created");
                phase = "HTTP response";
                if (!request ||
                    typeof request.onrecv !== "function" ||
                    typeof request.recv !== "function" ||
                    typeof request.oncomplete !== "function" ||
                    typeof request.onerror !== "function" ||
                    typeof request.responseCode !== "function") {
                    throw new Error("HttpClient.request returned an unsupported request");
                }

                request.onrecv(function (req, data, last) {
                    if (completed) {
                        return;
                    }

                    try {
                        responseMetadata = getResponseMetadata(req);
                        if (!responseLogged) {
                            logResponseMetadata(responseMetadata, data);
                            responseLogged = true;
                        }
                        responseText += decodeResponseChunk(data, last);

                        if (!last) {
                            req.recv();
                        }
                    }
                    catch (error) {
                        fail(error);
                    }
                }, 1024);

                request.oncomplete(function (req, success) {
                    if (completed) {
                        return;
                    }

                    responseMetadata = getResponseMetadata(req);
                    if (!responseLogged) {
                        logResponseMetadata(responseMetadata, null);
                        responseLogged = true;
                    }

                    if (!success) {
                        var responseDescription = typeof req.responseCodeDescription === "function"
                            ? req.responseCodeDescription()
                            : null;
                        fail(
                            responseDescription
                                ? "RSS feed request failed: " + responseDescription
                                : "RSS feed request failed"
                        );
                        return;
                    }

                    var responseCode = req.responseCode();
                    if (typeof responseCode !== "number" ||
                        responseCode < 200 ||
                        responseCode >= 300) {
                        fail(responseCode >= 300 && responseCode < 400
                            ? "RSS feed redirects are not allowed"
                            : "RSS feed request returned HTTP " + responseCode);
                        return;
                    }

                    if (!responseText) {
                        fail("RSS feed returned no data");
                        return;
                    }

                    completed = true;
                    if (typeof onSuccess === "function") {
                        onSuccess(responseText, getResponseMetadata(req));
                    }
                });

                request.onerror(function (error) {
                    fail("RSS feed request aborted: " + error);
                });
            }
            catch (error) {
                fail(error);
            }
        }, fail);

        function decodeResponseChunk(data, last) {
            if (!decoder) {
                for (var i = 0; i < data.length; i++) {
                    initialBytes.push(data[i]);
                }

                if (initialBytes.length < 4 && !last) {
                    return "";
                }

                decoder = new TextDecoder(detectEncoding(initialBytes));
                data = new Uint8Array(initialBytes);
                initialBytes = [];
            }

            return decoder.decode(data, { stream: !last });
        }

        function detectEncoding(bytes) {
            if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
                return "utf-16le";
            }
            if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
                return "utf-16be";
            }
            if (bytes[0] === 0x3C && bytes[1] === 0x00) {
                return "utf-16le";
            }
            if (bytes[0] === 0x00 && bytes[1] === 0x3C) {
                return "utf-16be";
            }
            return "utf-8";
        }

        function getResponseMetadata(req) {
            if (!req || typeof req.responseCode !== "function") {
                return null;
            }

            var metadata = {
                statusCode: req.responseCode(),
                contentType: ""
            };
            if (typeof req.responseHeader === "function") {
                var contentTypes = req.responseHeader("Content-Type");
                if (contentTypes && contentTypes.length > 0) {
                    metadata.contentType = String(contentTypes[0]).substring(0, 128);
                }
            }
            return metadata;
        }

        function logResponseMetadata(metadata, data) {
            var message = "RSS HTTP response: " +
                (metadata ? metadata.statusCode : "status unavailable") +
                (metadata && metadata.contentType
                    ? ", Content-Type " + metadata.contentType
                    : ", Content-Type unavailable");
            if (data && typeof data.length === "number") {
                var codes = [];
                for (var i = 0; i < Math.min(data.length, 8); i++) {
                    codes.push("0x" + data[i].toString(16).toUpperCase());
                }
                message += ", first response bytes " + codes.join(" ");
            }

            logDiagnostic(message);
        }

        function logDiagnostic(message) {
            if (typeof log === "function") {
                log(message);
            }
            else if (typeof console !== "undefined" &&
                typeof console.log === "function") {
                console.log(message);
            }
        }
    };

    function getUrlPolicy() {
        if (typeof require === "function") {
            try {
                return require("./rss-url-policy.js");
            }
            catch (error) {
                if (typeof RssUrlPolicy === "undefined") {
                    throw error;
                }
            }
        }
        if (typeof RssUrlPolicy !== "undefined") {
            return RssUrlPolicy;
        }
        throw new Error("RSS URL policy implementation not available");
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        RssDownloader: RssDownloader
    };
}
