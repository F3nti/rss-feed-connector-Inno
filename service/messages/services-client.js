function ServicesClient(options) {
    options = options || {};

    var serviceName = options.serviceName || "messages-api";
    var pbxApi;
    var servicesConnection;
    var appConnection;
    var currentService;
    var authRequest;
    var reconnectTimer = null;
    var requestNumber = 0;
    var ready = false;
    var onReady = null;
    var onError = null;
    var onMessage = null;
    var closeHandlers = [];
    var connectionAttempt = 0;

    this.start = function (readyCallback, errorCallback) {
        onReady = readyCallback;
        onError = errorCallback;

        if (typeof PbxApi !== "function") {
            reportError("PbxApi is not available in the JavaScript runtime");
            return;
        }

        try {
            pbxApi = new PbxApi("Services");
            pbxApi.onconnected(handleServicesConnection);
        }
        catch (error) {
            reportError(error);
        }
    };

    this.onmessage = function (callback) {
        onMessage = callback;
    };

    this.onclose = function (callback) {
        if (typeof callback !== "function") {
            throw new Error("ServicesClient close callback must be a function");
        }
        closeHandlers.push(callback);
    };

    this.send = function (message) {
        if (!ready || !appConnection) {
            throw new Error("messages-api connection is not ready");
        }

        appConnection.send(JSON.stringify(message));
    };

    function handleServicesConnection(connection) {
        servicesConnection = connection;
        reportInfo("Services API connected; subscribing to services");
        connection.onmessage(handleServicesMessage);
        connection.onclose(function () {
            servicesConnection = null;
            reportError("Services API connection closed");
        });
        connection.send(JSON.stringify({
            api: "Services",
            mt: "SubscribeServices"
        }));
    }

    function handleServicesMessage(rawMessage) {
        var message;
        try {
            message = JSON.parse(rawMessage);
        }
        catch (error) {
            reportError("Invalid Services API message: " + error);
            return;
        }

        if (message.mt === "ServicesInfo" ||
            message.mt === "GetServiceLoginResult" ||
            message.mt === "SubscribeServicesResult") {
            reportInfo("Services API message received: " + message.mt);
        }

        if (message.mt === "ServicesInfo") {
            discoverService(message.services);
        }
        else if (message.mt === "GetServiceLoginResult") {
            completeLogin(message);
        }
        else if (message.mt === "SubscribeServicesResult" && message.error) {
            reportError("SubscribeServices failed");
        }
    }

    function discoverService(services) {
        if (Object.prototype.toString.call(services) !== "[object Array]") {
            reportError("ServicesInfo did not contain a services array");
            return;
        }

        var matches = services.filter(function (service) {
            if (!service || typeof service.name !== "string") {
                return false;
            }

            var serviceUser = service.name.split("@")[0];
            return serviceUser.toLowerCase() === serviceName.toLowerCase();
        });

        if (matches.length > 1) {
            reportError("Multiple services match " + serviceName);
            return;
        }
        if (matches.length === 0) {
            reportError("Service not found: " + serviceName);
            return;
        }

        var service = matches[0];
        if (typeof service.url !== "string" || !service.url) {
            reportError("Discovered service has no websocket URL: " + service.name);
            return;
        }

        if (currentService &&
            currentService.name === service.name &&
            currentService.url === service.url &&
            (ready || appConnection)) {
            return;
        }

        currentService = service;
        reportInfo("Discovered " + serviceName + "; connecting to its websocket");
        connectToService(service);
    }

    function connectToService(service) {
        if (typeof AppWebsocketClient === "undefined" ||
            typeof AppWebsocketClient.connect !== "function") {
            reportError("AppWebsocketClient is not available in the JavaScript runtime");
            return;
        }

        var websocketUrl = getWebsocketUrl(service.url);
        if (!websocketUrl) {
            reportError("Unsupported websocket URL for " + service.name + ": " + service.url);
            return;
        }

        ready = false;
        authRequest = null;
        connectionAttempt++;
        var currentAttempt = connectionAttempt;

        try {
            appConnection = AppWebsocketClient.connect(
                websocketUrl,
                null,
                service.name.split("@")[0]
            );

            appConnection
                .onauth(function (connection, app, challenge) {
                    handleAuthenticationChallenge(app, challenge, currentAttempt);
                })
                .onopen(function (connection) {
                    if (currentAttempt !== connectionAttempt) {
                        return;
                    }

                    ready = true;
                    reportInfo("Authenticated connection to " + serviceName + " is open");
                    if (typeof onReady === "function") {
                        onReady();
                    }
                })
                .onmessage(function (connection, rawMessage) {
                    if (currentAttempt !== connectionAttempt) {
                        return;
                    }

                    if (typeof onMessage === "function") {
                        onMessage(rawMessage);
                    }
                })
                .onclose(function (connection) {
                    if (currentAttempt !== connectionAttempt) {
                        return;
                    }

                    ready = false;
                    appConnection = null;
                    authRequest = null;
                    reportInfo("Connection to " + serviceName + " closed");
                    closeHandlers.forEach(function (callback) {
                        callback();
                    });
                    scheduleReconnect();
                });
            reportInfo("Registered authentication and connection callbacks for " + serviceName);
        }
        catch (error) {
            appConnection = null;
            reportError("Could not connect to " + service.name + ": " + error);
            scheduleReconnect();
        }
    }

    function getWebsocketUrl(url) {
        if (/^https:\/\//i.test(url)) {
            return "wss:" + url.substring("https:".length);
        }
        if (/^wss:\/\//i.test(url) || /^conn:/i.test(url)) {
            return url;
        }
        return null;
    }

    function handleAuthenticationChallenge(app, challenge, attempt) {
        reportInfo(
            "Authentication callback invoked for " + serviceName +
            " (current attempt: " + (attempt === connectionAttempt ? "yes" : "no") +
            ", app provided: " + (typeof app === "string" && app.length > 0 ? "yes" : "no") +
            ", challenge provided: " +
            (typeof challenge === "string" && challenge.length > 0 ? "yes" : "no") + ")"
        );
        if (attempt !== connectionAttempt) {
            return;
        }
        reportInfo("Authentication challenge received for " + serviceName);
        if (!servicesConnection) {
            reportError("Services API is not connected; cannot authenticate to messages-api");
            appConnection.close();
            return;
        }

        requestNumber++;
        authRequest = {
            connection: appConnection,
            id: "rss-service-login-" + requestNumber
        };

        try {
            servicesConnection.send(JSON.stringify({
                api: "Services",
                mt: "GetServiceLogin",
                src: authRequest.id,
                app: currentService.name,
                challenge: challenge
            }));
            reportInfo("Requested service login for " + serviceName);
        }
        catch (error) {
            authRequest = null;
            reportError("Could not request service login for " + serviceName + ": " + error);
            appConnection.close();
        }
    }

    function completeLogin(message) {
        if (!authRequest || !authRequest.connection) {
            return;
        }
        if (message.src && message.src !== authRequest.id) {
            return;
        }

        var request = authRequest;
        authRequest = null;

        if (message.error) {
            reportError("GetServiceLogin failed for " + currentService.name);
            request.connection.close();
            return;
        }

        if (!message.domain || !message.sip || !message.guid ||
            !message.dn || !message.pbxObj || !message.app ||
            !message.info || !message.digest || !message.key || !message.salt) {
            reportError("GetServiceLoginResult is missing authentication parameters");
            request.connection.close();
            return;
        }

        try {
            var key = servicesConnection.decrypt(message.salt, message.key);
            reportInfo("Service login received; completing authentication for " + serviceName);
            request.connection.auth(
                message.domain,
                message.sip,
                message.guid,
                message.dn,
                message.pbxObj,
                message.app,
                JSON.stringify(message.info),
                message.digest,
                key
            );
        }
        catch (error) {
            reportError("Could not authenticate to " + currentService.name + ": " + error);
            request.connection.close();
        }
    }

    function scheduleReconnect() {
        if (!currentService || reconnectTimer !== null) {
            return;
        }

        try {
            reconnectTimer = setTimer(function () {
                reconnectTimer = null;
                if (!ready && currentService) {
                    connectToService(currentService);
                }
            }, 5000);
        }
        catch (error) {
            reportError("Cannot reconnect: " + error);
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

    function reportError(error) {
        var message = error && error.message ? error.message : String(error);
        if (typeof onError === "function") {
            onError(message);
        }
        else if (typeof log === "function") {
            log("ServicesClient error: " + message);
        }
    }

    function reportInfo(message) {
        if (typeof log === "function") {
            log("ServicesClient: " + message);
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        ServicesClient: ServicesClient
    };
}
