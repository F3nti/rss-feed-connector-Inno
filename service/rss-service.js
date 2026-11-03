var htmlBuilder = new (getConstructor("HtmlBuilder"))();
var messagesClient;
var feedRepository;
var entryRepository;
var serviceReady = false;
var availableTopics = [];
var feedSchedulers = {};
var feedRuns = {};
var deletingFeeds = {};
var feedStatuses = {};
var activeMessagePosts = 0;
var messagePostQueue = [];
var pumpingMessagePosts = false;
var messagePostPumpRequested = false;
var maxConcurrentMessagePosts = 4;
var defaultInitialPostLimit = 5;
var maximumInitialPostLimit = 50;

function safeLog(message) {
    if (typeof log === "function") {
        log(message);
        return;
    }

    if (typeof console !== "undefined" && typeof console.log === "function") {
        console.log(message);
    }
}

function getRssDownloader() {
    if (typeof require === "function") {
        try {
            return new (require("./rss/rss-downloader.js").RssDownloader)();
        }
        catch (error) {
            if (typeof RssDownloader !== "function") {
                throw error;
            }
        }
    }

    if (typeof RssDownloader === "function") {
        return new RssDownloader();
    }

    throw new Error("RSS downloader implementation not available");
}

function getRssUrlPolicy() {
    if (typeof require === "function") {
        try {
            return require("./rss/rss-url-policy.js");
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

function getRssParser() {
    if (typeof require === "function") {
        try {
            return require("./rss/rss-parser.js");
        }
        catch (error) {
            if (typeof RssParser === "undefined") {
                throw error;
            }
        }
    }

    if (typeof RssParser !== "undefined" && typeof RssParser.parse === "function") {
        return RssParser;
    }

    throw new Error("RSS parser implementation not available");
}

function getConstructor(name) {
    if (typeof require === "function") {
        try {
            if (name === "HtmlBuilder") {
                return require("./rss/html-builder.js").HtmlBuilder;
            }
            if (name === "RssEntryRepository") {
                return require("./db/rss-entry-repository.js").RssEntryRepository;
            }
            if (name === "RssFeedRepository") {
                return require("./db/rss-feed-repository.js").RssFeedRepository;
            }
            if (name === "MessagesClient") {
                return require("./messages/messages-client.js").MessagesClient;
            }
            if (name === "ServicesClient") {
                return require("./messages/services-client.js").ServicesClient;
            }
            if (name === "Scheduler") {
                return require("./scheduler/scheduler.js").Scheduler;
            }
        }
        catch (error) {
            if (typeof globalThis === "undefined" ||
                typeof globalThis[name] !== "function") {
                throw error;
            }
        }
    }

    if (typeof globalThis !== "undefined" && typeof globalThis[name] === "function") {
        return globalThis[name];
    }
    if (typeof this !== "undefined" && typeof this[name] === "function") {
        return this[name];
    }
    throw new Error(name + " implementation not available");
}

function getFeedRepository() {
    if (!feedRepository) {
        if (typeof Database === "undefined") {
            throw new Error("App Platform Database API is not available");
        }
        feedRepository = new (getConstructor("RssFeedRepository"))(Database);
    }
    return feedRepository;
}

function getEntryRepository() {
    if (!entryRepository) {
        if (typeof Database === "undefined") {
            throw new Error("App Platform Database API is not available");
        }
        entryRepository = new (getConstructor("RssEntryRepository"))(Database);
    }
    return entryRepository;
}

function start() {
    safeLog("RSS Feed Connector starting...");
    registerControlApi();
    startMessagesConnection();
}

function registerControlApi() {
    if (typeof JsonApi !== "function") {
        safeLog("RSS control API unavailable: JsonApi is not available");
        return;
    }

    new JsonApi("rss-control").onconnected(function (connection) {
        connection.onmessage(function (rawMessage) {
            handleControlMessage(connection, rawMessage);
        });
    });
}

function startMessagesConnection() {
    safeLog("Connecting to messages-api");
    var servicesClient = new (getConstructor("ServicesClient"))({
        serviceName: "messages-api"
    });
    messagesClient = new (getConstructor("MessagesClient"))(servicesClient);
    servicesClient.onclose(function () {
        serviceReady = false;
        for (var key in feedSchedulers) {
            if (Object.prototype.hasOwnProperty.call(feedSchedulers, key)) {
                feedSchedulers[key].scheduler.stop();
                delete feedSchedulers[key];
            }
        }
        safeLog("Messages API connection closed; feed schedulers stopped");
    });

    servicesClient.start(function () {
        safeLog("Connected to messages-api; discovering accessible topics");
        messagesClient.readTopics(function (topics) {
            serviceReady = true;
            availableTopics = topics;
            topics.forEach(function (topic) {
                if (topic && typeof topic.sip === "string") {
                    safeLog("Accessible Messages API topic: " + topic.sip);
                }
            });
            refreshFeeds();
        }, function (error) {
            serviceReady = false;
            safeLog("Could not read Messages API topics: " + error);
        });
    }, function (error) {
        safeLog("Messages service connection: " + error);
    });
}

function handleControlMessage(connection, rawMessage) {
    var request;
    try {
        request = JSON.parse(rawMessage);
    }
    catch (error) {
        sendApiError(connection, "", "Invalid control API request");
        return;
    }

    if (!request || typeof request.mt !== "string") {
        sendApiError(connection, request && request.src, "Control API message type is required");
        return;
    }

    if (request.mt === "GetState") {
        sendState(connection, request.src);
    }
    else if (request.mt === "SaveFeed") {
        saveFeed(connection, request);
    }
    else if (request.mt === "DeleteFeed") {
        deleteFeed(connection, request);
    }
    else if (request.mt === "RunFeed") {
        runFeedNow(connection, request);
    }
    else {
        sendApiError(connection, request.src, "Unsupported control API request");
    }
}

function sendState(connection, sourceId) {
    getFeedRepository().list(function (feeds) {
        if (!messagesClient) {
            sendStateResponse(connection, sourceId, feeds, [], "Messages API is not connected");
            return;
        }

        try {
            messagesClient.readTopics(function (topics) {
                availableTopics = topics;
                sendStateResponse(connection, sourceId, feeds, topics, "");
            }, function (error) {
                sendStateResponse(connection, sourceId, feeds, [], error);
            });
        }
        catch (error) {
            sendStateResponse(connection, sourceId, feeds, [], error.message || String(error));
        }
    }, function (error) {
        sendApiError(connection, sourceId, error);
    });
}

function sendStateResponse(connection, sourceId, feeds, topics, topicError) {
    var statuses = {};
    feeds.forEach(function (feed) {
        statuses[String(feed.id)] = feedStatuses["$" + feed.id] || {
            state: feed.enabled ? "waiting" : "disabled",
            lastRun: "",
            summary: feed.enabled ? "Waiting for first feed cycle" : "Feed is disabled"
        };
    });

    sendApiMessage(connection, {
        mt: "State",
        src: sourceId,
        feeds: feeds,
        topics: topics,
        statuses: statuses,
        topicError: topicError
    });
}

function saveFeed(connection, request) {
    var feed;
    try {
        feed = validateFeed(request.feed);
    }
    catch (error) {
        sendApiError(connection, request.src, error.message || String(error));
        return;
    }

    if (!messagesClient) {
        sendApiError(connection, request.src, "Messages API is not connected");
        return;
    }

    try {
        messagesClient.readTopics(function (topics) {
            var accessible = topics.some(function (topic) {
                return topic && topic.sip === feed.topic;
            });
            if (!accessible) {
                sendApiError(connection, request.src, "Selected Connect topic is not accessible");
                return;
            }
            availableTopics = topics;
            serviceReady = true;

            getFeedRepository().save(feed, function (feedId) {
                refreshFeeds(function (error) {
                    if (error) {
                        sendApiError(connection, request.src, error);
                        return;
                    }
                    sendApiMessage(connection, {
                        mt: "FeedSaved",
                        src: request.src,
                        feedId: feedId
                    });
                });
            }, function (error) {
                sendApiError(connection, request.src, error);
            });
        }, function (error) {
            sendApiError(connection, request.src, error);
        });
    }
    catch (error) {
        sendApiError(connection, request.src, error.message || String(error));
    }
}

function validateFeed(value) {
    if (!value || typeof value !== "object") {
        throw new Error("Feed details are required");
    }

    var name = typeof value.name === "string" ? value.name.trim() : "";
    var url = typeof value.url === "string" ? value.url.trim() : "";
    var topic = typeof value.topic === "string" ? value.topic.trim() : "";
    var interval = Number(value.intervalMinutes);
    if (!name || name.length > 128) {
        throw new Error("Feed name must contain 1 to 128 characters");
    }
    getRssUrlPolicy().parse(url);
    if (!topic || topic.length > 512) {
        throw new Error("Connect topic is required");
    }
    if (Math.floor(interval) !== interval || interval < 1 || interval > 1440) {
        throw new Error("Poll interval must be between 1 and 1440 minutes");
    }
    var initialPostLimit = value.initialPostLimit === null ||
        typeof value.initialPostLimit === "undefined"
        ? defaultInitialPostLimit
        : Number(value.initialPostLimit);
    if (Math.floor(initialPostLimit) !== initialPostLimit ||
        initialPostLimit < 1 || initialPostLimit > maximumInitialPostLimit) {
        throw new Error("Initial post limit must be between 1 and 50");
    }
    if (typeof value.initialPostAll !== "undefined" &&
        typeof value.initialPostAll !== "boolean") {
        throw new Error("Load all initial feed entries must be a boolean");
    }
    if (Object.prototype.toString.call(value.tags) !== "[object Array]" ||
        value.tags.length > 20) {
        throw new Error("Feed tags must be an array with no more than 20 tags");
    }

    var tags = [];
    value.tags.forEach(function (tag) {
        if (typeof tag !== "string" || !tag.trim() || tag.trim().length > 64) {
            throw new Error("Each tag must contain 1 to 64 characters");
        }
        tags.push(tag.trim());
    });

    var id = null;
    if (value.id !== null && typeof value.id !== "undefined" && value.id !== "") {
        id = Number(value.id);
        if (Math.floor(id) !== id || id < 1 || id > 2147483647) {
            throw new Error("Feed ID is invalid");
        }
    }

    return {
        id: id,
        name: name,
        url: url,
        topic: topic,
        tags: tags,
        intervalMinutes: interval,
        enabled: value.enabled !== false,
        initialPostLimit: initialPostLimit,
        initialPostAll: value.initialPostAll === true
    };
}

function deleteFeed(connection, request) {
    var id = Number(request.feedId);
    if (Math.floor(id) !== id || id < 1 || id > 2147483647) {
        sendApiError(connection, request.src, "Feed ID is invalid");
        return;
    }

    var key = "$" + id;
    if (deletingFeeds[key]) {
        sendApiError(connection, request.src, "Feed is already being deleted");
        return;
    }
    if (feedRuns[key]) {
        sendApiError(
            connection,
            request.src,
            "Feed is currently running; try deleting it again after the cycle completes"
        );
        return;
    }

    deletingFeeds[key] = true;
    try {
        getFeedRepository().remove(id, function (removed) {
            delete deletingFeeds[key];
            if (feedSchedulers[key]) {
                feedSchedulers[key].scheduler.stop();
                delete feedSchedulers[key];
            }
            delete feedStatuses[key];
            refreshFeeds(function (error) {
                if (error) {
                    sendApiError(connection, request.src, error);
                    return;
                }
                sendApiMessage(connection, {
                    mt: "FeedDeleted",
                    src: request.src,
                    feedId: id,
                    removed: removed
                });
            });
        }, function (error) {
            delete deletingFeeds[key];
            sendApiError(connection, request.src, error);
        });
    }
    catch (error) {
        delete deletingFeeds[key];
        sendApiError(connection, request.src, error.message || String(error));
    }
}

function runFeedNow(connection, request) {
    var id = Number(request.feedId);
    if (Math.floor(id) !== id || id < 1 || id > 2147483647) {
        sendApiError(connection, request.src, "Feed ID is invalid");
        return;
    }

    getFeedRepository().list(function (feeds) {
        var feed = null;
        feeds.some(function (item) {
            if (item.id === id) {
                feed = item;
                return true;
            }
            return false;
        });
        if (!feed) {
            sendApiError(connection, request.src, "Feed was not found");
            return;
        }
        if (!feed.enabled) {
            sendApiError(connection, request.src, "Feed is disabled");
            return;
        }
        if (deletingFeeds["$" + id]) {
            sendApiError(connection, request.src, "Feed is being deleted");
            return;
        }
        if (!serviceReady) {
            sendApiError(connection, request.src, "Messages API connection is not ready");
            return;
        }

        sendApiMessage(connection, {
            mt: "FeedRunStarted",
            src: request.src,
            feedId: id
        });
        runFeedCycle(feed);
    }, function (error) {
        sendApiError(connection, request.src, error);
    });
}

function refreshFeeds(onComplete) {
    getFeedRepository().list(function (feeds) {
        syncSchedulers(feeds);
        if (typeof onComplete === "function") {
            onComplete(null);
        }
    }, function (error) {
        safeLog("Could not load feed configuration: " + error);
        if (typeof onComplete === "function") {
            onComplete(error);
        }
    });
}

function syncSchedulers(feeds) {
    var configured = {};
    feeds.forEach(function (feed) {
        var key = "$" + feed.id;
        configured[key] = true;
        var existing = feedSchedulers[key];
        var signature = JSON.stringify(feed);
        if (existing && existing.signature !== signature) {
            existing.scheduler.stop();
            delete feedSchedulers[key];
            existing = null;
        }

        if (!feed.enabled) {
            if (existing) {
                existing.scheduler.stop();
                delete feedSchedulers[key];
            }
            setFeedStatus(feed.id, "disabled", "Feed is disabled");
            return;
        }

        var topicIsAvailable = availableTopics.some(function (topic) {
            return topic && topic.sip === feed.topic;
        });
        if (!serviceReady || !topicIsAvailable) {
            if (existing) {
                existing.scheduler.stop();
                delete feedSchedulers[key];
            }
            setFeedStatus(
                feed.id,
                "error",
                topicIsAvailable ? "Messages API is not ready" : "Connect topic is not accessible"
            );
            return;
        }

        if (!existing) {
            var scheduler = new (getConstructor("Scheduler"))(feed.intervalMinutes * 60 * 1000);
            feedSchedulers[key] = {
                signature: signature,
                scheduler: scheduler
            };
            scheduler.start(function () {
                runFeedCycle(feed);
            });
            safeLog(
                "Scheduled RSS feed \"" + feed.name + "\" every " +
                feed.intervalMinutes + " minutes for " + feed.topic
            );
        }
    });

    for (var key in feedSchedulers) {
        if (Object.prototype.hasOwnProperty.call(feedSchedulers, key) && !configured[key]) {
            feedSchedulers[key].scheduler.stop();
            delete feedSchedulers[key];
            delete entryRepositories[key];
            delete feedStatuses[key];
        }
    }

    if (feeds.length === 0) {
        safeLog("No RSS feeds configured");
    }
}

function runFeedCycle(feed) {
    var key = "$" + feed.id;
    if (deletingFeeds[key]) {
        return;
    }
    if (!serviceReady) {
        setFeedStatus(feed.id, "error", "Messages API connection is not ready");
        return;
    }
    if (feedRuns[key]) {
        safeLog("Feed cycle skipped because feed is already running: " + feed.name);
        return;
    }

    feedRuns[key] = true;
    setFeedStatus(feed.id, "running", "Downloading feed");
    try {
        getRssDownloader().download(feed.url, function (xml, responseMetadata) {
            try {
                var entries = getRssParser().parse(xml);
                processEntries(entries, feed);
            }
            catch (error) {
                var responseDetails = responseMetadata
                    ? " (HTTP " + responseMetadata.statusCode +
                        (responseMetadata.contentType
                            ? ", Content-Type " + responseMetadata.contentType
                            : "") + ")"
                    : "";
                completeFeedCycle(
                    feed,
                    "error",
                    "Feed processing failed: " + error + responseDetails
                );
            }
        }, function (error) {
            completeFeedCycle(feed, "error", "Feed download failed: " + error);
        });
    }
    catch (error) {
        completeFeedCycle(feed, "error", "Feed cycle could not be started: " + error);
    }
}

function processEntries(entries, feed) {
    var repository;
    var candidateGuids = [];
    try {
        repository = getEntryRepository();
        entries.forEach(function (entry) {
            if (entry && typeof entry.guid === "string" &&
                entry.guid.trim() && entry.guid.length <= 2048) {
                candidateGuids.push(entry.guid);
            }
        });
        repository.hasEntries(feed.id, function (hasEntries) {
            repository.listKnown(feed.id, candidateGuids, function (knownGuids) {
                postNewEntries(entries, feed, repository, knownGuids, !hasEntries);
            }, function (error) {
                completeFeedCycle(feed, "error", "Could not load posted RSS entries: " + error);
            });
        }, function (error) {
            completeFeedCycle(feed, "error", "Could not check RSS entry history: " + error);
        });
    }
    catch (error) {
        completeFeedCycle(feed, "error", "Could not load posted RSS entries: " + error);
    }
}

function postNewEntries(entries, feed, repository, knownGuids, isInitialRun) {
    var posted = 0;
    var duplicates = 0;
    var skipped = 0;
    var failures = 0;
    var activePosts = 0;
    var nextEntry = 0;
    var completed = false;
    var pumping = false;
    var pumpRequested = false;
    var newEntries = [];
    var submitted = {};
    var known = {};
    knownGuids.forEach(function (guid) {
        known["$" + guid] = true;
    });

    function finishIfDone() {
        if (completed || nextEntry < newEntries.length || activePosts > 0) {
            return;
        }
        completed = true;
        completeFeedCycle(
            feed,
            failures > 0 ? "error" : "success",
            posted + " posted, " + duplicates + " duplicates, " +
                (skipped ? skipped + " older entries skipped, " : "") +
                failures + " failed"
        );
    }

    entries.forEach(function (entry) {
        if (!entry || typeof entry.guid !== "string" ||
            !entry.guid.trim() || entry.guid.length > 2048) {
            safeLog("Skipping RSS entry without a valid GUID: " + (entry && entry.title));
            failures++;
        }
        else {
            var guidKey = "$" + entry.guid;
            if (known[guidKey] || submitted[guidKey]) {
                duplicates++;
            }
            else {
                submitted[guidKey] = true;
                newEntries.push(entry);
            }
        }
    });

    if (isInitialRun && !feed.initialPostAll &&
        newEntries.length > feed.initialPostLimit) {
        var orderedEntries = newEntries.map(function (entry, index) {
            return {
                entry: entry,
                index: index,
                published: Date.parse(entry.published || "")
            };
        }).sort(function (left, right) {
            var leftHasDate = isFinite(left.published);
            var rightHasDate = isFinite(right.published);

            if (leftHasDate && rightHasDate && left.published !== right.published) {
                return right.published - left.published;
            }
            if (leftHasDate !== rightHasDate) {
                return leftHasDate ? -1 : 1;
            }
            return left.index - right.index;
        });
        var selectedGuids = {};
        orderedEntries.slice(0, feed.initialPostLimit).forEach(function (entry) {
            selectedGuids["$" + entry.entry.guid] = true;
        });
        var ignoredGuids = [];
        newEntries.forEach(function (entry) {
            if (!selectedGuids["$" + entry.guid]) {
                ignoredGuids.push(entry.guid);
            }
        });
        var firstEntries = newEntries.filter(function (entry) {
            return selectedGuids["$" + entry.guid] === true;
        });

        try {
            repository.saveMany(feed.id, ignoredGuids, function () {
                skipped = ignoredGuids.length;
                newEntries = firstEntries;
                pumpPosts();
            }, function (error) {
                completeFeedCycle(
                    feed,
                    "error",
                    "Could not record older RSS entries as skipped: " + error
                );
            });
        }
        catch (error) {
            completeFeedCycle(
                feed,
                "error",
                "Could not record older RSS entries as skipped: " + error
            );
        }
        return;
    }

    function pumpPosts() {
        if (pumping) {
            pumpRequested = true;
            return;
        }

        pumping = true;
        do {
            pumpRequested = false;
            while (activePosts < maxConcurrentMessagePosts && nextEntry < newEntries.length) {
                startPost(newEntries[nextEntry++]);
            }
        } while (pumpRequested);
        pumping = false;
        finishIfDone();
    }

    function startPost(entry) {
        activePosts++;
        var postCompleted = false;
        var releasePostSlot = null;

        function completePost(error, wasPosted) {
            if (postCompleted) {
                return;
            }
            postCompleted = true;
            if (wasPosted) {
                posted++;
            }
            if (error) {
                failures++;
                safeLog("RSS entry could not be completed (" + entry.guid + "): " + error);
            }
            activePosts--;
            if (releasePostSlot) {
                releasePostSlot();
            }
            pumpPosts();
        }

        enqueueMessagePost(function (release) {
            releasePostSlot = release;
            try {
                messagesClient.post({
                    topic: feed.topic,
                    title: entry.title || entry.link || entry.guid,
                    text: htmlBuilder.build(entry),
                    tags: feed.tags
                }, function () {
                    try {
                        repository.save(feed.id, entry.guid, function () {
                            completePost(null, true);
                        }, function (error) {
                            completePost("post succeeded but its GUID could not be recorded: " + error, true);
                        });
                    }
                    catch (error) {
                        completePost("post succeeded but its GUID could not be recorded: " + error, true);
                    }
                }, function (error) {
                    completePost(error, false);
                });
            }
            catch (error) {
                completePost(error, false);
            }
        }, function (error) {
            failures++;
            activePosts--;
            safeLog("RSS entry could not be queued (" + entry.guid + "): " + error);
            pumpPosts();
        });
    }

    pumpPosts();
}

function enqueueMessagePost(start, onError) {
    messagePostQueue.push({
        start: start,
        onError: onError
    });
    pumpMessagePosts();
}

function pumpMessagePosts() {
    if (pumpingMessagePosts) {
        messagePostPumpRequested = true;
        return;
    }

    pumpingMessagePosts = true;
    do {
        messagePostPumpRequested = false;
        while (activeMessagePosts < maxConcurrentMessagePosts &&
            messagePostQueue.length > 0) {
            var task = messagePostQueue.shift();
            activeMessagePosts++;
            startMessagePost(task);
        }
    } while (messagePostPumpRequested);
    pumpingMessagePosts = false;
}

function startMessagePost(task) {
    var released = false;
    function releasePostSlot() {
        if (released) {
            return;
        }
        released = true;
        activeMessagePosts--;
        pumpMessagePosts();
    }

    try {
        task.start(releasePostSlot);
    }
    catch (error) {
        releasePostSlot();
        task.onError(error);
    }
}

function completeFeedCycle(feed, state, summary) {
    delete feedRuns["$" + feed.id];
    setFeedStatus(feed.id, state, summary);
    safeLog("RSS feed \"" + feed.name + "\" cycle " + state + ": " + summary);
}

function setFeedStatus(feedId, state, summary) {
    feedStatuses["$" + feedId] = {
        state: state,
        lastRun: new Date().toISOString(),
        summary: summary
    };
}

function sendApiError(connection, sourceId, error) {
    sendApiMessage(connection, {
        mt: "ApiError",
        src: sourceId,
        error: error && error.message ? error.message : String(error)
    });
}

function sendApiMessage(connection, message) {
    message.api = "rss-control";
    try {
        connection.send(JSON.stringify(message));
    }
    catch (error) {
        safeLog("Could not send RSS control API response: " + error);
    }
}

start();
