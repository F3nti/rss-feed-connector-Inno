function MessagesClient(transport) {
    var pendingPosts = {};
    var nextSourceId = 0;
    var postTimeoutMs = 30000;
    var TopicDiscoveryConstructor;

    if (!transport ||
        typeof transport.send !== "function" ||
        typeof transport.onmessage !== "function" ||
        typeof transport.onclose !== "function") {
        throw new Error("MessagesClient requires a connected-service transport");
    }

    if (typeof require === "function") {
        try {
            TopicDiscoveryConstructor = require("./topic-discovery.js").TopicDiscovery;
        }
        catch (error) {
            if (typeof TopicDiscovery !== "function") {
                throw error;
            }
        }
    }

    if (!TopicDiscoveryConstructor && typeof TopicDiscovery === "function") {
        TopicDiscoveryConstructor = TopicDiscovery;
    }

    if (!TopicDiscoveryConstructor) {
        throw new Error("TopicDiscovery implementation not available");
    }

    var topicDiscovery = new TopicDiscoveryConstructor(function (message) {
        transport.send(message);
    });

    transport.onmessage(handleMessage);
    transport.onclose(function (error) {
        failPendingPosts(error);
        topicDiscovery.failAll(error);
    });

    this.readTopics = topicDiscovery.readTopics;

    this.post = function (message, onSuccess, onError) {
        if (!message || typeof message !== "object") {
            throw new Error("Message payload is required");
        }
        if (typeof message.topic !== "string" || !message.topic.trim()) {
            throw new Error("Message topic must be a non-empty string");
        }
        if (typeof message.title !== "string" || !message.title.trim()) {
            throw new Error("Message title must be a non-empty string");
        }
        if (typeof message.text !== "string" || !message.text) {
            throw new Error("Message text must be a non-empty string");
        }
        if (Object.prototype.toString.call(message.tags) !== "[object Array]") {
            throw new Error("Message tags must be an array");
        }
        if (typeof onSuccess !== "function" || typeof onError !== "function") {
            throw new Error("Post success and error callbacks are required");
        }

        nextSourceId++;
        var sourceId = "rss-post-" + nextSourceId;
        var pending = {
            onSuccess: onSuccess,
            onError: onError,
            timeout: null
        };
        pendingPosts["$" + sourceId] = pending;

        try {
            pending.timeout = setTimer(function () {
                completePost(sourceId, "Timed out waiting for Messages API PostResult");
            }, postTimeoutMs);

            transport.send({
                src: sourceId,
                mt: "Post",
                topic: message.topic,
                text: message.text,
                tags: message.tags
            });
        }
        catch (error) {
            completePost(sourceId, error);
        }
    };

    function handleMessage(rawMessage) {
        var response;
        try {
            response = JSON.parse(rawMessage);
        }
        catch (error) {
            failPendingPosts("Invalid Messages API response: " + error);
            topicDiscovery.failAll("Invalid Messages API response: " + error);
            return;
        }

        if (response.mt === "PostResult" && response.src) {
            if (response.error) {
                completePost(response.src, getPostError(response));
            }
            else {
                completePost(response.src, null, response);
            }
            return;
        }

        topicDiscovery.handleMessage(response);
    }

    function getPostError(response) {
        var reason = response.errorText || response.reason || response.description;
        if (typeof reason === "string" && reason.trim()) {
            return "Messages API rejected the post: " + reason;
        }
        return "Messages API rejected the post";
    }

    function completePost(sourceId, error, response) {
        var key = "$" + sourceId;
        var pending = pendingPosts[key];
        if (!pending) {
            return;
        }

        delete pendingPosts[key];
        if (pending.timeout !== null) {
            clearTimer(pending.timeout);
        }
        if (error) {
            pending.onError(error && error.message ? error.message : String(error));
        }
        else {
            pending.onSuccess(response);
        }
    }

    function failPendingPosts(error) {
        var failure = error || "Messages API connection closed";
        var sourceIds = [];
        for (var key in pendingPosts) {
            if (Object.prototype.hasOwnProperty.call(pendingPosts, key)) {
                sourceIds.push(key.substring(1));
            }
        }

        sourceIds.forEach(function (sourceId) {
            completePost(sourceId, failure);
        });
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
        MessagesClient: MessagesClient
    };
}
