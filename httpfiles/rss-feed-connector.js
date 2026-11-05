(function () {
    var apiName = "rss-control";
    var requestNumber = 0;
    var pendingRequests = {};
    var feedForm = document.getElementById("feed-form");
    var feedList = document.getElementById("feed-list");
    var topicSelect = document.getElementById("feed-topic");
    var notice = document.getElementById("notice");
    var connectionStatus = document.getElementById("connection-status");
    var refreshTimer = null;
    var appConnection;
    var connected = false;
    var editingFeedId = null;
    var language = "de";

    var translations = {
        de: {
            pageTitle: "RSS Feed Connector",
            logoAlt: "Connect mit RSS",
            gateUnauthorized: "Nicht autorisiert",
            gateUnavailable: "Diese Oberfläche ist nur über myApps verfügbar. Bitte öffne die App über deinen myApps App Drawer.",
            gateCheckingTitle: "Verbindung wird geprüft",
            gateChecking: "Die myApps-Anmeldung wird überprüft …",
            gateConnectionFailed: "myApps-Verbindung fehlgeschlagen",
            gateConnectionError: "Die Anmeldung konnte nicht bestätigt werden. Prüfe die Verbindung und App-Berechtigungen. Fehler: {error}",
            gateDisconnected: "Verbindung getrennt",
            gateDisconnectedMessage: "Die myApps-Verbindung wurde getrennt. Bitte öffne die App erneut über deinen myApps App Drawer.",
            appEyebrow: "CONNECT · FEED-VERWALTUNG",
            appSubtitle: "Feeds verwalten und automatisch in Connect veröffentlichen.",
            connectionConnecting: "Verbinde …",
            connectionConnected: "Verbunden",
            identityPanel: "Plattform-Identität",
            identityUserLabel: "Angemeldet als",
            identityAppLabel: "myApps-App",
            identityDescription: "Domain und App-Identität werden von myApps bereitgestellt.",
            signedIn: "Angemeldet",
            configuration: "KONFIGURATION",
            addFeed: "Feed hinzufügen",
            editFeed: "Feed bearbeiten",
            saveChanges: "Änderungen speichern",
            cancel: "Abbrechen",
            feedName: "Feed-Name",
            feedNamePlaceholder: "z. B. Heise Security",
            feedUrl: "Feed-URL",
            feedTopic: "Connect-Zone / Topic",
            loadingTopics: "Topics werden geladen …",
            feedTags: "Tags",
            feedTagsPlaceholder: "security, heise",
            intervalMinutes: "Abrufintervall (Minuten)",
            initialPostLimit: "Beiträge beim ersten Abruf (max. 50)",
            feedEnabled: "Feed aktiv",
            loadAllPosts: "Alle vorhandenen Beiträge laden",
            overview: "ÜBERSICHT",
            feedsHeading: "Deine Feeds",
            refresh: "Aktualisieren",
            loadingFeeds: "Lade Feed-Konfiguration …",
            chooseTopic: "Connect-Zone auswählen …",
            noTopics: "Keine Connect-Zonen verfügbar",
            noFeeds: "Noch keine Feeds konfiguriert. Füge oben deinen ersten RSS- oder Atom-Feed hinzu.",
            topicPrefix: "Topic: {topic}",
            intervalChip: "Alle {minutes} Min.",
            active: "Aktiv",
            paused: "Pausiert",
            waitingFirstRun: "Wartet auf den ersten Abruf",
            lastRun: "Letzter Abruf: {time}",
            runNow: "Jetzt abrufen",
            edit: "Bearbeiten",
            delete: "Löschen",
            confirmDelete: "Löschen bestätigen",
            retry: "Erneut versuchen",
            connectionUnavailable: "Die Verbindung zur App Platform ist nicht verfügbar.",
            requestSendFailed: "Anfrage konnte nicht gesendet werden: {error}",
            requestFailed: "Die Anfrage ist fehlgeschlagen.",
            feedSaved: "Feed gespeichert.",
            feedDeleted: "Feed gelöscht.",
            feedAlreadyDeleted: "Feed war bereits gelöscht.",
            feedRunStarted: "Feed-Abruf gestartet.",
            topicLoadError: "Feed-Konfiguration geladen, aber Connect-Topics konnten nicht gelesen werden: {error}",
            feedDisabledStatus: "Feed ist deaktiviert",
            messagesUnavailableStatus: "Messages API ist nicht bereit",
            topicUnavailableStatus: "Connect-Topic ist nicht zugänglich",
            interruptedStatus: "Vorheriger Feed-Abruf wurde durch einen Service-Neustart unterbrochen",
            messagesConnectionUnavailableStatus: "Verbindung zur Messages API ist nicht bereit",
            downloadingStatus: "Feed wird heruntergeladen",
            postSummary: "{posted} veröffentlicht, {duplicates} Duplikate, {failed} fehlgeschlagen",
            postSummaryWithSkipped: "{posted} veröffentlicht, {duplicates} Duplikate, {skipped} ältere Beiträge übersprungen, {failed} fehlgeschlagen"
        },
        en: {
            pageTitle: "RSS Feed Connector",
            logoAlt: "Connect with RSS",
            gateUnauthorized: "Not authorized",
            gateUnavailable: "This interface is only available through myApps. Please open the app from your myApps app drawer.",
            gateCheckingTitle: "Checking connection",
            gateChecking: "Verifying the myApps sign-in …",
            gateConnectionFailed: "myApps connection failed",
            gateConnectionError: "The sign-in could not be verified. Check the connection and app permissions. Error: {error}",
            gateDisconnected: "Connection lost",
            gateDisconnectedMessage: "The myApps connection was lost. Please reopen the app from your myApps app drawer.",
            appEyebrow: "CONNECT · FEED MANAGEMENT",
            appSubtitle: "Manage feeds and automatically publish them to Connect.",
            connectionConnecting: "Connecting …",
            connectionConnected: "Connected",
            identityPanel: "Platform identity",
            identityUserLabel: "Signed in as",
            identityAppLabel: "myApps app",
            identityDescription: "The domain and app identity are provided by myApps.",
            signedIn: "Signed in",
            configuration: "CONFIGURATION",
            addFeed: "Add feed",
            editFeed: "Edit feed",
            saveChanges: "Save changes",
            cancel: "Cancel",
            feedName: "Feed name",
            feedNamePlaceholder: "e.g. Heise Security",
            feedUrl: "Feed URL",
            feedTopic: "Connect zone / topic",
            loadingTopics: "Loading topics …",
            feedTags: "Tags",
            feedTagsPlaceholder: "security, heise",
            intervalMinutes: "Polling interval (minutes)",
            initialPostLimit: "Posts on first fetch (max. 50)",
            feedEnabled: "Feed enabled",
            loadAllPosts: "Load all existing posts",
            overview: "OVERVIEW",
            feedsHeading: "Your feeds",
            refresh: "Refresh",
            loadingFeeds: "Loading feed configuration …",
            chooseTopic: "Select a Connect zone …",
            noTopics: "No Connect zones available",
            noFeeds: "No feeds configured yet. Add your first RSS or Atom feed above.",
            topicPrefix: "Topic: {topic}",
            intervalChip: "Every {minutes} min",
            active: "Active",
            paused: "Paused",
            waitingFirstRun: "Waiting for the first fetch",
            lastRun: "Last fetch: {time}",
            runNow: "Fetch now",
            edit: "Edit",
            delete: "Delete",
            confirmDelete: "Confirm delete",
            retry: "Try again",
            connectionUnavailable: "The connection to the App Platform is unavailable.",
            requestSendFailed: "Could not send request: {error}",
            requestFailed: "The request failed.",
            feedSaved: "Feed saved.",
            feedDeleted: "Feed deleted.",
            feedAlreadyDeleted: "Feed was already deleted.",
            feedRunStarted: "Feed fetch started.",
            topicLoadError: "Feed configuration loaded, but Connect topics could not be read: {error}",
            feedDisabledStatus: "Feed is disabled",
            messagesUnavailableStatus: "Messages API is not ready",
            topicUnavailableStatus: "Connect topic is not accessible",
            interruptedStatus: "Previous feed cycle was interrupted by a service restart",
            messagesConnectionUnavailableStatus: "Messages API connection is not ready",
            downloadingStatus: "Downloading feed",
            postSummary: "{posted} posted, {duplicates} duplicates, {failed} failed",
            postSummaryWithSkipped: "{posted} posted, {duplicates} duplicates, {skipped} older entries skipped, {failed} failed"
        }
    };

    var staticTranslations = {
        "page-title": "pageTitle",
        "brand-logo": "logoAlt",
        "access-gate-heading": "gateUnauthorized",
        "access-gate-message": "gateUnavailable",
        "app-eyebrow": "appEyebrow",
        "app-subtitle": "appSubtitle",
        "connection-status": "connectionConnecting",
        "identity-user-label": "identityUserLabel",
        "identity-app-label": "identityAppLabel",
        "identity-description": "identityDescription",
        "configuration-eyebrow": "configuration",
        "form-heading": "addFeed",
        "cancel-edit": "cancel",
        "feed-name-label": "feedName",
        "feed-url-label": "feedUrl",
        "feed-topic-label": "feedTopic",
        "feed-topic-loading": "loadingTopics",
        "feed-tags-label": "feedTags",
        "feed-interval-label": "intervalMinutes",
        "feed-initial-post-limit-label": "initialPostLimit",
        "feed-enabled-label": "feedEnabled",
        "feed-initial-post-all-label": "loadAllPosts",
        "save-feed": "addFeed",
        "overview-eyebrow": "overview",
        "feeds-heading": "feedsHeading",
        "refresh": "refresh",
        "feed-list-loading": "loadingFeeds"
    };

    var placeholders = {
        "feed-name": "feedNamePlaceholder",
        "feed-tags": "feedTagsPlaceholder"
    };

    var translatedAttributes = {
        "identity-panel": {
            attribute: "aria-label",
            key: "identityPanel"
        }
    };

    function initialize(appStart) {
        applyLanguage(appStart && appStart.lang);
        applyScheme(appStart && appStart.scheme);
        if (appStart && appStart.onschemechanged &&
            typeof appStart.onschemechanged.attach === "function") {
            appStart.onschemechanged.attach(function () {
                applyScheme(appStart.scheme);
            });
        }

        if (!appStart || !appStart.url || !appStart.name ||
            typeof innovaphone === "undefined" ||
            !innovaphone.appwebsocket ||
            typeof innovaphone.appwebsocket.Connection !== "function") {
            setAccessState(
                text("gateUnauthorized"),
                text("gateUnavailable")
            );
            return;
        }

        setAccessState(text("gateCheckingTitle"), text("gateChecking"));
        document.getElementById("identity-app").textContent = appStart.name;
        appConnection = new innovaphone.appwebsocket.Connection(appStart.url, appStart.name);
        appConnection.onconnected = function (domain, user, displayName) {
            connected = true;
            document.getElementById("access-gate").hidden = true;
            document.getElementById("app-shell").hidden = false;
            var identity = user || "";
            if (domain) {
                identity += (identity ? "@" : "") + domain;
            }
            document.getElementById("identity-user").textContent =
                displayName ? displayName + " (" + identity + ")" : identity || text("signedIn");
            setConnectionStatus(text("connectionConnected"), "connected");
            requestState();
            if (refreshTimer === null) {
                refreshTimer = window.setInterval(requestState, 15000);
            }
        };
        appConnection.onmessage = handleMessage;
        appConnection.onerror = function (error) {
            connected = false;
            setAccessState(
                text("gateConnectionFailed"),
                text("gateConnectionError", { error: error })
            );
        };
        appConnection.onclosed = function () {
            if (connected) {
                document.getElementById("app-shell").hidden = true;
                setAccessState(
                    text("gateDisconnected"),
                    text("gateDisconnectedMessage")
                );
            }
            connected = false;
            if (refreshTimer !== null) {
                window.clearInterval(refreshTimer);
                refreshTimer = null;
            }
        };

        document.getElementById("refresh").addEventListener("click", requestState);
        document.getElementById("cancel-edit").addEventListener("click", resetForm);
        document.getElementById("feed-initial-post-all").addEventListener("change", function () {
            document.getElementById("feed-initial-post-limit").disabled = this.checked;
        });
        feedForm.addEventListener("submit", saveCurrentFeed);
    }

    function sendRequest(message, callback) {
        if (!connected) {
            showNotice(text("connectionUnavailable"), "error");
            return false;
        }
        requestNumber++;
        var sourceId = "rss-ui-" + requestNumber;
        message.api = apiName;
        message.src = sourceId;
        if (typeof callback === "function") {
            pendingRequests[sourceId] = callback;
        }
        try {
            appConnection.send(message);
            return true;
        }
        catch (error) {
            delete pendingRequests[sourceId];
            showNotice(text("requestSendFailed", { error: error }), "error");
            return false;
        }
    }

    function handleMessage(message) {
        var callback = message.src && pendingRequests[message.src];
        if (message.src && Object.prototype.hasOwnProperty.call(pendingRequests, message.src)) {
            delete pendingRequests[message.src];
        }

        if (message.mt === "ApiError") {
            showNotice(message.error || text("requestFailed"), "error");
            if (callback) {
                callback(message);
            }
            return;
        }

        if (message.mt === "State") {
            renderState(message);
        }
        else if (message.mt === "FeedSaved") {
            resetForm();
            showNotice(text("feedSaved"));
            requestState();
        }
        else if (message.mt === "FeedDeleted") {
            showNotice(message.removed ? text("feedDeleted") : text("feedAlreadyDeleted"));
            requestState();
        }
        else if (message.mt === "FeedRunStarted") {
            showNotice(text("feedRunStarted"));
            window.setTimeout(requestState, 1000);
        }

        if (callback) {
            callback(message);
        }
    }

    function requestState() {
        if (!appConnection) {
            return;
        }
        sendRequest({ mt: "GetState" });
    }

    function renderState(state) {
        renderTopics(state.topics || []);
        renderFeeds(state.feeds || [], state.statuses || {});

        if (state.topicError) {
            showNotice(
                text("topicLoadError", { error: state.topicError }),
                "error"
            );
        }
        else if (notice.getAttribute("data-type") === "error") {
            clearNotice();
        }
    }

    function renderTopics(topics) {
        var connectTopics = topics.filter(isConnectTopic);
        var current = topicSelect.value;
        clearChildren(topicSelect);
        addOption(
            topicSelect,
            "",
            connectTopics.length ? text("chooseTopic") : text("noTopics")
        );
        connectTopics.forEach(function (topic) {
            var label = topic.dn ? topic.dn + " — " + topic.sip : topic.sip;
            addOption(topicSelect, topic.sip, label);
        });
        if (current) {
            topicSelect.value = current;
        }
        topicSelect.disabled = connectTopics.length === 0;
        document.getElementById("save-feed").disabled = connectTopics.length === 0;
    }

    function isConnectTopic(topic) {
        return topic &&
            typeof topic.sip === "string" &&
            /^connect\?.+/i.test(topic.sip);
    }

    function applyScheme(scheme) {
        document.documentElement.setAttribute(
            "data-scheme",
            scheme === "dark" ? "dark" : "light"
        );
    }

    function applyLanguage(startLanguage) {
        language = typeof startLanguage === "string" &&
            /^en(?:-|$)/i.test(startLanguage) ? "en" : "de";
        var strings = translations[language];
        document.documentElement.lang = language;
        Object.keys(staticTranslations).forEach(function (id) {
            var element = document.getElementById(id);
            if (id === "brand-logo") {
                element.alt = strings[staticTranslations[id]];
            }
            else {
                element.textContent = strings[staticTranslations[id]];
            }
        });
        Object.keys(placeholders).forEach(function (id) {
            document.getElementById(id).setAttribute(
                "placeholder",
                strings[placeholders[id]]
            );
        });
        Object.keys(translatedAttributes).forEach(function (id) {
            var translation = translatedAttributes[id];
            document.getElementById(id).setAttribute(
                translation.attribute,
                strings[translation.key]
            );
        });
    }

    function text(key, values) {
        var value = translations[language][key];
        if (typeof value !== "string") {
            throw new Error("Missing UI translation: " + key);
        }
        Object.keys(values || {}).forEach(function (name) {
            value = value.replace("{" + name + "}", String(values[name]));
        });
        return value;
    }

    function translateStatusSummary(summary) {
        var exactTranslations = {
            "Waiting for first feed cycle": "waitingFirstRun",
            "Feed is disabled": "feedDisabledStatus",
            "Messages API is not ready": "messagesUnavailableStatus",
            "Connect topic is not accessible": "topicUnavailableStatus",
            "Previous feed cycle was interrupted by service restart": "interruptedStatus",
            "Messages API connection is not ready": "messagesConnectionUnavailableStatus",
            "Downloading feed": "downloadingStatus"
        };
        if (exactTranslations[summary]) {
            return text(exactTranslations[summary]);
        }
        var counts = summary && summary.match(
            /^(\d+) posted, (\d+) duplicates, (?:(\d+) older entries skipped, )?(\d+) failed$/
        );
        if (counts) {
            return text(counts[3] ? "postSummaryWithSkipped" : "postSummary", {
                posted: counts[1],
                duplicates: counts[2],
                skipped: counts[3],
                failed: counts[4]
            });
        }
        return summary;
    }

    function renderFeeds(feeds, statuses) {
        clearChildren(feedList);
        if (feeds.length === 0) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = text("noFeeds");
            feedList.appendChild(empty);
            return;
        }

        feeds.forEach(function (feed) {
            feedList.appendChild(createFeedCard(feed, statuses[String(feed.id)]));
        });
    }

    function createFeedCard(feed, status) {
        var card = document.createElement("article");
        card.className = "feed-card";

        var details = document.createElement("div");
        details.className = "feed-details";
        var heading = document.createElement("div");
        heading.className = "feed-heading";
        var headingDetails = document.createElement("div");
        var name = document.createElement("h3");
        name.textContent = feed.name;
        headingDetails.appendChild(name);
        var url = document.createElement("a");
        url.className = "feed-url";
        url.href = feed.url;
        url.target = "_blank";
        url.rel = "noopener noreferrer";
        url.textContent = feed.url;
        headingDetails.appendChild(url);
        heading.appendChild(headingDetails);
        details.appendChild(heading);

        var meta = document.createElement("div");
        meta.className = "feed-meta";
        addChip(meta, text("topicPrefix", { topic: feed.topic }));
        addChip(meta, text("intervalChip", { minutes: feed.intervalMinutes }));
        (feed.tags || []).forEach(function (tag) {
            var tagElement = document.createElement("span");
            tagElement.className = "tag";
            tagElement.textContent = "#" + tag;
            meta.appendChild(tagElement);
        });
        details.appendChild(meta);
        card.appendChild(details);

        var controls = document.createElement("div");
        controls.className = "feed-controls";
        var statusHeader = document.createElement("div");
        statusHeader.className = "feed-status-header";
        var enabled = document.createElement("span");
        enabled.className = "feed-enabled";
        enabled.setAttribute("data-enabled", feed.enabled ? "true" : "false");
        enabled.textContent = feed.enabled ? text("active") : text("paused");
        statusHeader.appendChild(enabled);

        var statusDetails = document.createElement("div");
        statusDetails.className = "feed-status";
        statusDetails.setAttribute("data-state", status ? status.state : "waiting");
        var statusText = status ? translateStatusSummary(status.summary) : text("waitingFirstRun");
        var summary = document.createElement("span");
        summary.className = "feed-status-summary";
        summary.textContent = statusText;
        statusDetails.appendChild(summary);
        if (status && status.lastRun) {
            var lastRun = document.createElement("span");
            lastRun.className = "feed-last-run";
            lastRun.textContent = text("lastRun", { time: status.lastRun });
            statusDetails.appendChild(lastRun);
        }
        statusHeader.appendChild(statusDetails);
        controls.appendChild(statusHeader);

        var actions = document.createElement("div");
        actions.className = "feed-actions";
        var runButton = makeButton(text("runNow"), "button button-primary", function () {
            sendRequest({ mt: "RunFeed", feedId: feed.id });
        });
        runButton.disabled = !feed.enabled;
        actions.appendChild(runButton);
        actions.appendChild(makeButton(text("edit"), "button button-quiet", function () {
            editFeed(feed);
        }));
        var deleteConfirmed = false;
        var cancelDeleteButton;
        var deleteButton = makeButton(text("delete"), "button button-danger", function () {
            if (!deleteConfirmed) {
                deleteConfirmed = true;
                deleteButton.textContent = text("confirmDelete");
                cancelDeleteButton.hidden = false;
                return;
            }

            deleteButton.disabled = true;
            cancelDeleteButton.disabled = true;
            var requestSent = sendRequest(
                { mt: "DeleteFeed", feedId: feed.id },
                function (response) {
                    if (response.mt === "ApiError") {
                        deleteButton.disabled = false;
                        cancelDeleteButton.disabled = false;
                        deleteButton.textContent = text("retry");
                    }
                }
            );
            if (!requestSent) {
                deleteButton.disabled = false;
                cancelDeleteButton.disabled = false;
            }
        });
        cancelDeleteButton = makeButton(text("cancel"), "button button-quiet", function () {
            deleteConfirmed = false;
            deleteButton.disabled = false;
            deleteButton.textContent = text("delete");
            cancelDeleteButton.hidden = true;
        });
        cancelDeleteButton.hidden = true;
        actions.appendChild(deleteButton);
        actions.appendChild(cancelDeleteButton);
        controls.appendChild(actions);
        card.appendChild(controls);
        return card;
    }

    function saveCurrentFeed(event) {
        event.preventDefault();
        var tags = document.getElementById("feed-tags").value
            .split(",")
            .map(function (tag) { return tag.trim(); })
            .filter(function (tag) { return tag.length > 0; });

        sendRequest({
            mt: "SaveFeed",
            feed: {
                id: editingFeedId,
                name: document.getElementById("feed-name").value,
                url: document.getElementById("feed-url").value,
                topic: topicSelect.value,
                tags: tags,
                intervalMinutes: Number(document.getElementById("feed-interval").value),
                enabled: document.getElementById("feed-enabled").checked,
                initialPostLimit: Number(
                    document.getElementById("feed-initial-post-limit").value
                ),
                initialPostAll: document.getElementById("feed-initial-post-all").checked
            }
        });
    }

    function editFeed(feed) {
        editingFeedId = feed.id;
        document.getElementById("feed-id").value = feed.id;
        document.getElementById("feed-name").value = feed.name;
        document.getElementById("feed-url").value = feed.url;
        document.getElementById("feed-tags").value = (feed.tags || []).join(", ");
        document.getElementById("feed-interval").value = feed.intervalMinutes;
        document.getElementById("feed-enabled").checked = feed.enabled;
        document.getElementById("feed-initial-post-limit").value =
            feed.initialPostLimit || 5;
        document.getElementById("feed-initial-post-all").checked =
            feed.initialPostAll === true;
        document.getElementById("feed-initial-post-limit").disabled =
            feed.initialPostAll === true;
        topicSelect.value = feed.topic;
        document.getElementById("form-heading").textContent = text("editFeed");
        document.getElementById("save-feed").textContent = text("saveChanges");
        document.getElementById("cancel-edit").hidden = false;
        feedForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function resetForm() {
        editingFeedId = null;
        feedForm.reset();
        document.getElementById("feed-id").value = "";
        document.getElementById("feed-interval").value = "15";
        document.getElementById("feed-initial-post-limit").value = "5";
        document.getElementById("feed-initial-post-all").checked = false;
        document.getElementById("feed-initial-post-limit").disabled = false;
        document.getElementById("form-heading").textContent = text("addFeed");
        document.getElementById("save-feed").textContent = text("addFeed");
        document.getElementById("cancel-edit").hidden = true;
    }

    function makeButton(text, className, action) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = text;
        button.addEventListener("click", action);
        return button;
    }

    function addChip(parent, text) {
        var chip = document.createElement("span");
        chip.className = "meta-chip";
        chip.textContent = text;
        parent.appendChild(chip);
    }

    function addOption(select, value, text) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }

    function clearChildren(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    function setConnectionStatus(text, state) {
        connectionStatus.textContent = text;
        connectionStatus.setAttribute("data-state", state);
    }

    function setAccessState(heading, message) {
        document.getElementById("access-gate-heading").textContent = heading;
        document.getElementById("access-gate-message").textContent = message;
        document.getElementById("access-gate").hidden = false;
        document.getElementById("app-shell").hidden = true;
    }

    function showNotice(text, type) {
        notice.textContent = text;
        notice.setAttribute("data-type", type || "success");
        notice.hidden = false;
    }

    function clearNotice() {
        notice.textContent = "";
        notice.hidden = true;
        notice.removeAttribute("data-type");
    }

    if (typeof innovaphone !== "undefined" &&
        innovaphone.lib1 && typeof innovaphone.lib1.Start === "function") {
        innovaphone.lib1.Start(initialize);
    }
    else {
        setAccessState(
            text("gateUnauthorized"),
            text("gateUnavailable")
        );
    }
}());
