function TopicDiscovery(send) {
    var pendingReads = {};
    var nextRequestId = 0;
    var timeoutMs = 30000;

    if (typeof send !== "function") {
        throw new Error("TopicDiscovery requires a Messages API sender");
    }

    this.readTopics = function (onSuccess, onError) {
        if (typeof onSuccess !== "function" || typeof onError !== "function") {
            throw new Error("ReadTopics success and error callbacks are required");
        }

        nextRequestId++;
        var sourceId = "rss-topics-" + nextRequestId;
        var pending = {
            onSuccess: onSuccess,
            onError: onError,
            topics: [],
            timeout: null
        };
        pendingReads["$" + sourceId] = pending;

        try {
            pending.timeout = setTimer(function () {
                complete(sourceId, "Timed out waiting for Messages API ReadTopicsResult");
            }, timeoutMs);

            send({
                src: sourceId,
                mt: "ReadTopics"
            });
        }
        catch (error) {
            complete(sourceId, error);
        }
    };

    this.handleMessage = function (message) {
        if (message.mt !== "Topic" && message.mt !== "ReadTopicsResult") {
            return false;
        }

        if (!message.src) {
            return true;
        }

        var key = "$" + message.src;
        var pending = pendingReads[key];
        if (!pending) {
            return true;
        }

        if (message.mt === "Topic") {
            if (typeof message.sip !== "string" || !message.sip) {
                complete(message.src, "Messages API returned a topic without a SIP URI");
                return true;
            }

            pending.topics.push({
                id: message.id,
                sip: message.sip,
                dn: message.dn || ""
            });
            return true;
        }

        complete(
            message.src,
            message.error ? "Messages API rejected the ReadTopics request" : null
        );
        return true;
    };

    this.failAll = function (error) {
        var failure = error || "Messages API connection closed";
        var sourceIds = [];
        for (var key in pendingReads) {
            if (Object.prototype.hasOwnProperty.call(pendingReads, key)) {
                sourceIds.push(key.substring(1));
            }
        }
        sourceIds.forEach(function (sourceId) {
            complete(sourceId, failure);
        });
    };

    function complete(sourceId, error) {
        var key = "$" + sourceId;
        var pending = pendingReads[key];
        if (!pending) {
            return;
        }

        delete pendingReads[key];
        if (pending.timeout !== null) {
            clearTimer(pending.timeout);
        }
        if (error) {
            pending.onError(error && error.message ? error.message : String(error));
        }
        else {
            pending.onSuccess(pending.topics);
        }
    }

    function setTimer(callback, delay) {
        if (typeof Timers !== "undefined" &&
            Timers && typeof Timers.setTimeout === "function") {
            return Timers.setTimeout(callback, delay);
        }
        if (typeof setTimeout === "function") {
            return setTimeout(callback, delay);
        }
        throw new Error("Timers.setTimeout is not available");
    }

    function clearTimer(timer) {
        if (typeof Timers !== "undefined" &&
            Timers && typeof Timers.clearTimeout === "function") {
            Timers.clearTimeout(timer);
            return;
        }
        if (typeof clearTimeout === "function") {
            clearTimeout(timer);
            return;
        }
        throw new Error("Timers.clearTimeout is not available");
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        TopicDiscovery: TopicDiscovery
    };
}
