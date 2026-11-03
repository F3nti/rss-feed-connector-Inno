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

    function initialize(appStart) {
        applyScheme(appStart && appStart.scheme);
        if (appStart && appStart.onschemechanged &&
            typeof appStart.onschemechanged.attach === "function") {
            appStart.onschemechanged.attach(function () {
                applyScheme(appStart.scheme);
            });
        }

        document.getElementById("identity-app").textContent =
            appStart && appStart.name ? appStart.name : "RSS Feed Connector";

        if (!appStart || !appStart.url || !appStart.name ||
            typeof innovaphone === "undefined" ||
            !innovaphone.appwebsocket ||
            typeof innovaphone.appwebsocket.Connection !== "function") {
            setConnectionStatus("myApps-Verbindung nicht verfügbar", "error");
            showNotice("Die App konnte nicht im myApps-Kontext gestartet werden.", "error");
            return;
        }

        appConnection = new innovaphone.appwebsocket.Connection(appStart.url, appStart.name);
        appConnection.onconnected = function (domain, user, displayName) {
            connected = true;
            var identity = user || "";
            if (domain) {
                identity += (identity ? "@" : "") + domain;
            }
            document.getElementById("identity-user").textContent =
                displayName ? displayName + " (" + identity + ")" : identity || "Angemeldet";
            setConnectionStatus("Verbunden", "connected");
            requestState();
            if (refreshTimer === null) {
                refreshTimer = window.setInterval(requestState, 15000);
            }
        };
        appConnection.onmessage = handleMessage;
        appConnection.onerror = function (error) {
            connected = false;
            setConnectionStatus("Verbindungsfehler", "error");
            showNotice("Die Verbindung zur App Platform ist fehlgeschlagen: " + error, "error");
        };
        appConnection.onclosed = function () {
            connected = false;
            setConnectionStatus("Getrennt", "error");
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
            showNotice("Die Verbindung zur App Platform ist nicht verfügbar.", "error");
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
            showNotice("Anfrage konnte nicht gesendet werden: " + error, "error");
            return false;
        }
    }

    function handleMessage(message) {
        var callback = message.src && pendingRequests[message.src];
        if (message.src && Object.prototype.hasOwnProperty.call(pendingRequests, message.src)) {
            delete pendingRequests[message.src];
        }

        if (message.mt === "ApiError") {
            showNotice(message.error || "Die Anfrage ist fehlgeschlagen.", "error");
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
            showNotice("Feed gespeichert.");
            requestState();
        }
        else if (message.mt === "FeedDeleted") {
            showNotice(message.removed ? "Feed gelöscht." : "Feed war bereits gelöscht.");
            requestState();
        }
        else if (message.mt === "FeedRunStarted") {
            showNotice("Feed-Abruf gestartet.");
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
                "Feed-Konfiguration geladen, aber Connect-Topics konnten nicht gelesen werden: " +
                state.topicError,
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
            connectTopics.length ? "Connect-Zone auswählen …" : "Keine Connect-Zonen verfügbar"
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

    function renderFeeds(feeds, statuses) {
        clearChildren(feedList);
        if (feeds.length === 0) {
            var empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "Noch keine Feeds konfiguriert. Füge oben deinen ersten RSS- oder Atom-Feed hinzu.";
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
        addChip(meta, "Topic: " + feed.topic);
        addChip(meta, "Alle " + feed.intervalMinutes + " Min.");
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
        enabled.textContent = feed.enabled ? "Aktiv" : "Pausiert";
        statusHeader.appendChild(enabled);

        var statusDetails = document.createElement("div");
        statusDetails.className = "feed-status";
        statusDetails.setAttribute("data-state", status ? status.state : "waiting");
        var statusText = status ? status.summary : "Wartet auf den ersten Abruf";
        var summary = document.createElement("span");
        summary.className = "feed-status-summary";
        summary.textContent = statusText;
        statusDetails.appendChild(summary);
        if (status && status.lastRun) {
            var lastRun = document.createElement("span");
            lastRun.className = "feed-last-run";
            lastRun.textContent = "Letzter Abruf: " + status.lastRun;
            statusDetails.appendChild(lastRun);
        }
        statusHeader.appendChild(statusDetails);
        controls.appendChild(statusHeader);

        var actions = document.createElement("div");
        actions.className = "feed-actions";
        var runButton = makeButton("Jetzt abrufen", "button button-primary", function () {
            sendRequest({ mt: "RunFeed", feedId: feed.id });
        });
        runButton.disabled = !feed.enabled;
        actions.appendChild(runButton);
        actions.appendChild(makeButton("Bearbeiten", "button button-quiet", function () {
            editFeed(feed);
        }));
        var deleteConfirmed = false;
        var cancelDeleteButton;
        var deleteButton = makeButton("Löschen", "button button-danger", function () {
            if (!deleteConfirmed) {
                deleteConfirmed = true;
                deleteButton.textContent = "Löschen bestätigen";
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
                        deleteButton.textContent = "Erneut versuchen";
                    }
                }
            );
            if (!requestSent) {
                deleteButton.disabled = false;
                cancelDeleteButton.disabled = false;
            }
        });
        cancelDeleteButton = makeButton("Abbrechen", "button button-quiet", function () {
            deleteConfirmed = false;
            deleteButton.disabled = false;
            deleteButton.textContent = "Löschen";
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
        document.getElementById("form-heading").textContent = "Feed bearbeiten";
        document.getElementById("save-feed").textContent = "Änderungen speichern";
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
        document.getElementById("form-heading").textContent = "Feed hinzufügen";
        document.getElementById("save-feed").textContent = "Feed hinzufügen";
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
        setConnectionStatus("myApps-Startbibliothek nicht verfügbar", "error");
        showNotice("Die App konnte nicht initialisiert werden.", "error");
    }
}());
