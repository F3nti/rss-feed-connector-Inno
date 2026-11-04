var plugin = plugin || {};
(function () {
plugin.f3nti = plugin.f3nti || {};

plugin.f3nti.ManagerRssFeedConnector = function (start, item, app) {
    this.createNode("div", "height:100%; overflow:auto; padding:16px; box-sizing:border-box; color:var(--innovaphone-text-color, #eee); background:var(--innovaphone-background-color, #252525)", null, "item-node");

    var instanceRoot = getInstanceRoot(getCanonicalAppUri(item.uri));
    var instanceBaseRoot = getParentInstanceRoot(instanceRoot);
    var appUrl = instanceRoot + "rss-feed-connector.htm";
    var appObjects = [];
    var templates = [];
    var status;
    var listing;
    var editor;
    var appName;
    var sipName;
    var templateCheckboxes = [];
    var saveButton;
    var managerApi = start.consumeApi("com.innovaphone.manager");

    if (!managerApi) {
        this.add(new innovaphone.ui1.Div(null, "The App Platform Manager API is not available."));
        return;
    }

    this.add(new innovaphone.ui1.Div(
        "font-size:20px; margin-bottom:16px",
        "Apps"
    ));
    var addButton = this.add(addAppButton(addApp));
    listing = this.add(new innovaphone.ui1.Div("margin-top:16px"));
    editor = this.add(new innovaphone.ui1.Div(
        "display:none; margin-top:12px; max-width:760px"
    ));
    status = this.add(new innovaphone.ui1.Div(
        "margin-top:12px; white-space:pre-wrap; color:#aaa"
    ));
    refresh();

    function refresh() {
        addButton.container.disabled = true;
        setStatus("Loading apps and user templates …");
        loadTemplates(function (templateResult) {
            if (templateResult.error) {
                setStatus(templateResult.error);
                return;
            }
            templates = templateResult.templates;
            loadAppObjects(function (appResult) {
                if (appResult.error) {
                    setStatus(appResult.error);
                    return;
                }
                appObjects = appResult.objects;
                renderList();
                addButton.container.disabled = false;
                setStatus("");
            });
        });
    }

    function loadTemplates(callback) {
        var result = [];
        app.sendSrcMore({
            api: "PbxAdminApi",
            mt: "GetConfigObjects",
            limit: 50
        }, function (message) {
            if (message.mt !== "GetConfigObjectsResult" || !Array.isArray(message.objects)) {
                callback({ error: "Could not load user configuration templates." });
                return;
            }
            result = result.concat(message.objects);
            if (!message.more) loadTemplateAccess(result, 0, [], callback);
        });
    }

    function loadTemplateAccess(templateObjects, index, loaded, callback) {
        if (index >= templateObjects.length) {
            callback({ templates: loaded });
            return;
        }
        var template = templateObjects[index];
        app.sendSrc({
            api: "PbxAdminApi",
            mt: "GetObject",
            cn: template.cn,
            template: "without",
            properties: ["guid", "apps", "apps-my"]
        }, function (message) {
            if (message.mt !== "GetObjectResult" || !message.guid) {
                callback({
                    error: "Could not read the app access settings for template \"" +
                        template.cn + "\"."
                });
                return;
            }
            loaded.push({
                cn: template.cn,
                guid: message.guid,
                apps: parseAppList(message.apps),
                appsMy: parseAppList(message["apps-my"])
            });
            loadTemplateAccess(templateObjects, index + 1, loaded, callback);
        });
    }

    function loadAppObjects(callback) {
        loadAppObjectsByType(function (result) {
            if (result.error) {
                callback(result);
                return;
            }
            app.sendSrc({
                api: "PbxAdminApi",
                mt: "GetObject",
                cn: "rss-feed-connector",
                template: "without"
            }, function (message) {
                if (message.mt !== "GetObjectResult" || !message.guid) {
                    callback(result);
                    return;
                }
                var existing = appObjectFromGetObjectResult(message);
                if (!existing) {
                    callback({
                        error: "The PBX object \"rss-feed-connector\" exists, but it is not an App object."
                    });
                    return;
                }
                if (!result.objects.some(function (object) {
                    return object.guid === existing.guid;
                })) {
                    result.objects.push(existing);
                }
                callback(result);
            });
        });
    }

    function loadAppObjectsByType(callback) {
        var objects = [];
        app.sendSrcMore({
            api: "PbxAdminApi",
            mt: "GetAppObjects",
            uri: instanceBaseRoot,
            pseudo: "app",
            limit: 50
        }, function (message) {
            if (message.mt !== "GetAppObjectsResult" || !Array.isArray(message.objects)) {
                callback({ error: "Could not load existing RSS Feed Connector app objects." });
                return;
            }
            objects = objects.concat(message.objects);
            if (!message.more) {
                callback({
                    objects: objects.filter(function (object) {
                    return isManagedAppObject(object, instanceBaseRoot);
                    })
                });
            }
        });
    }

    function renderList() {
        listing.clear();
        editor.setStyle("display", "none");
        addButton.setStyle("display", "block");
        appObjects.forEach(function (object) {
            var row = listing.add(new innovaphone.ui1.Div(
                "display:block; margin-top:8px; padding:10px 14px; background:#414141; cursor:pointer"
            ));
            var displayName = object.title || object.sip || "RSS Feed Connector";
            row.add(new innovaphone.ui1.Div(
                "margin-bottom:10px; color:#c8d8e8; font-size:14px",
                displayName + " App"
            ));
            var details = row.add(new innovaphone.ui1.Div(
                "display:flex; flex-wrap:wrap; align-items:center; column-gap:22px; row-gap:6px; font-size:13px"
            ));
            addMetadata(details, "Name", displayName);
            addMetadata(details, "SIP", object.sip || "");
            addMetadata(details, "URL", displayAppUrl(object.url || appUrl));
            addMetadata(details, "Status", object.connected ? "Connected" : "Not connected");
            details.add(new innovaphone.ui1.Div(
                "margin-left:auto; color:" + (object.connected ? "#8acb8a" : "#aaa") +
                    "; font-size:21px; line-height:16px",
                object.connected ? "✓" : "×"
            ));
            row.addEvent("click", function () {
                editApp(object);
            });
        });
        if (appObjects.length === 0) {
            listing.add(new innovaphone.ui1.Div(
                "padding:12px; color:#aaa",
                "No RSS Feed Connector app object has been added yet."
            ));
        }
    }

    function addApp() {
        editApp(null);
    }

    function confirmDelete(object) {
        listing.setStyle("display", "none");
        addButton.setStyle("display", "none");
        editor.clear();
        editor.setStyle("display", "block");
        editor.add(new innovaphone.ui1.Div(
            "font-size:18px; color:#aaa; margin-bottom:16px",
            "Delete the app object?"
        ));
        editor.add(new innovaphone.ui1.Div(
            "margin-bottom:20px; color:#eee",
            "Delete \"" + (object.title || object.sip) + "\" (" + object.sip +
                ")? This removes the PBX app object and its user-template access."
        ));
        var actions = editor.add(new innovaphone.ui1.Div("display:flex; gap:8px"));
        var deleteButton = actions.add(button("Delete", function () {
            deleteButton.container.disabled = true;
            deleteAppObject(object);
        }));
        actions.add(button("Cancel", cancelEdit));
        setStatus("");
    }

    function deleteAppObject(object) {
        setStatus("Deleting the app object …");
        app.sendSrc(buildDeleteObjectRequest(object.guid), function (message) {
            if (message.mt !== "DeleteObjectResult") {
                setStatus(message.error || "Could not delete the app object.");
                return;
            }
            removeTemplateAccess(object.sip, 0);
        });
    }

    function removeTemplateAccess(sip, index) {
        if (index >= templates.length) {
            setStatus("The app object and its user-template access were deleted.");
            refresh();
            return;
        }
        var template = templates[index];
        var request = buildTemplateAccessUpdate(
            template.guid,
            template.apps,
            template.appsMy,
            sip,
            sip,
            false
        );
        app.sendSrc(request, function (message) {
            if (message.mt !== "UpdateObjectResult") {
                setStatus(message.error ||
                    "The app object was deleted, but access could not be removed from template \"" +
                    template.cn + "\".");
                return;
            }
            template.apps = parseAppList(request.apps);
            template.appsMy = parseAppList(request["apps-my"]);
            removeTemplateAccess(sip, index + 1);
        });
    }

    function editApp(object) {
        listing.setStyle("display", "none");
        addButton.setStyle("display", "none");
        editor.clear();
        editor.setStyle("display", "block");
        editor.add(new innovaphone.ui1.Div(
            "font-size:18px; color:#aaa; margin-bottom:16px",
            object ? "Edit the app" : "Add an app"
        ));
        appName = addField(editor, "Name", object ? (object.title || "RSS Feed") : "RSS Feed");
        sipName = addField(editor, "SIP", object ? (object.sip || "rss-feed-connector") : "rss-feed-connector");
        editor.add(new innovaphone.ui1.Div(
            "display:flex; flex-wrap:wrap; gap:24px; margin:12px 0 20px"
        ));
        var templateArea = editor.container.lastChild;
        templateCheckboxes = [];
        templates.forEach(function (template) {
            var itemNode = new innovaphone.ui1.Node("label",
                "display:flex; align-items:center; gap:8px; cursor:pointer; color:#aaa");
            var checkbox = itemNode.add(new innovaphone.ui1.Node("input"));
            checkbox.container.type = "checkbox";
            checkbox.container.checked = object &&
                (template.apps.indexOf(object.sip) !== -1 ||
                    template.appsMy.indexOf(object.sip) !== -1);
            itemNode.add(new innovaphone.ui1.Node("span", null, template.cn));
            templateArea.appendChild(itemNode.container);
            templateCheckboxes.push({ template: template, checkbox: checkbox.container });
        });
        if (templates.length === 0) {
            editor.add(new innovaphone.ui1.Div(
                "margin:12px 0 20px; color:#aaa",
                "No user configuration templates are available."
            ));
        }
        var actions = editor.add(new innovaphone.ui1.Div(
            "display:flex; align-items:center; gap:8px; min-height:42px"
        ));
        saveButton = actions.add(button("Save", function () {
            saveApp(object);
        }));
        actions.add(button("Cancel", cancelEdit));
        if (object && object.guid) {
            var deleteButton = actions.add(button("Delete", function () {
                confirmDelete(object);
            }));
            deleteButton.setStyle(
                "display:inline-block; min-width:76px; min-height:42px; padding:8px 14px; border:0; color:#eee; background:#414141; text-align:center; cursor:pointer"
            );
        }
        setStatus("");
    }

    function saveApp(existingObject) {
        var displayName = appName.getValue();
        var sip = sipName.getValue();
        if (!displayName || !sip) {
            setStatus("Name and SIP are required.");
            return;
        }
        var targetUrl;
        try {
            targetUrl = getAppUrl(instanceBaseRoot, sip);
        }
        catch (error) {
            setStatus(error.message);
            return;
        }
        saveButton.container.disabled = true;
        if (existingObject) {
            if (normalizeAppUrl(existingObject.url) === normalizeAppUrl(targetUrl)) {
                updateAppObject(existingObject, displayName, sip, null, targetUrl);
            }
            else {
                loadAppObjects(function (result) {
                    if (result.error) {
                        setStatus(result.error);
                        saveButton.container.disabled = false;
                        return;
                    }
                    var targetObject = findAppObjectByUrl(result.objects, targetUrl);
                    if (targetObject && targetObject.guid !== existingObject.guid) {
                        updateAppObject(
                            existingObject,
                            displayName,
                            sip,
                            null,
                            targetUrl,
                            targetObject.sip
                        );
                    }
                    else {
                        setInstancePasswordAndUpdate(existingObject, displayName, sip, targetUrl);
                    }
                });
            }
        }
        else {
            loadAppObjects(function (result) {
                if (result.error) {
                    setStatus(result.error);
                    saveButton.container.disabled = false;
                    return;
                }
                var match = findAppObjectBySip(result.objects, sip);
                if (match) {
                    updateAppObject(match, displayName, sip, null, targetUrl);
                }
                else {
                    var targetObject = findAppObjectByUrl(result.objects, targetUrl);
                    if (targetObject) {
                        updateAppObject(
                            null,
                            displayName,
                            sip,
                            null,
                            targetUrl,
                            targetObject.sip
                        );
                    }
                    else {
                        createAppObject(displayName, sip, targetUrl);
                    }
                }
            });
        }
    }

    function createAppObject(displayName, sip, targetUrl) {
        setInstancePasswordAndUpdate(null, displayName, sip, targetUrl);
    }

    function setInstancePasswordAndUpdate(existingObject, displayName, sip, targetUrl) {
        if (!innovaphone.Manager || typeof innovaphone.Manager.randomPwd !== "function") {
            setStatus("The App Platform Manager password generator is not available.");
            saveButton.container.disabled = false;
            return;
        }
        var password = innovaphone.Manager.randomPwd(16);
        var path = getInstancePath(targetUrl);
        setStatus("Setting up the App Service login …");
        managerApi.sendSrc({
            mt: "SetInstancePassword",
            path: path,
            pwd: password
        }, item.ap, function (response) {
            var message = response && response.msg;
            if (!message || message.mt !== "SetInstancePasswordResult" || message.error) {
                setStatus("Could not set the App Service password.");
                saveButton.container.disabled = false;
                return;
            }
            updateAppObject(existingObject, displayName, sip, password, targetUrl);
        });
    }

    function updateAppObject(existingObject, displayName, sip, password, targetUrl, copyPwd) {
        setStatus(existingObject ? "Updating the app object …" : "Creating the app object …");
        var request = buildAppObjectRequest(
            displayName,
            sip,
            password,
            targetUrl,
            existingObject && existingObject.guid,
            existingObject && existingObject.cn || sip,
            copyPwd
        );
        app.sendSrc(request, function (message) {
            if (message.mt !== "UpdateObjectResult" ||
                (!message.guid && !(existingObject && existingObject.guid))) {
                setStatus(message.error || "Could not save the app object.");
                saveButton.container.disabled = false;
                return;
            }
            syncTemplateAccess(existingObject && existingObject.sip, sip, 0);
        });
    }

    function syncTemplateAccess(oldSip, newSip, index) {
        if (index >= templateCheckboxes.length) {
            setStatus("The app and user-template access were saved.");
            refresh();
            return;
        }
        var entry = templateCheckboxes[index];
        var selected = entry.checkbox.checked;
        var request = buildTemplateAccessUpdate(
            entry.template.guid,
            entry.template.apps,
            entry.template.appsMy,
            oldSip,
            newSip,
            selected
        );
        app.sendSrc(request, function (message) {
            if (message.mt !== "UpdateObjectResult") {
                setStatus(message.error ||
                    "The app object was saved, but access could not be updated for template \"" +
                    entry.template.cn + "\".");
                saveButton.container.disabled = false;
                return;
            }
            entry.template.apps = parseAppList(request.apps);
            entry.template.appsMy = parseAppList(request["apps-my"]);
            syncTemplateAccess(oldSip, newSip, index + 1);
        });
    }

    function cancelEdit() {
        editor.setStyle("display", "none");
        listing.setStyle("display", "block");
        addButton.setStyle("display", "block");
        setStatus("");
    }

    function setStatus(message) {
        status.addText(message);
    }
};

plugin.f3nti.ManagerRssFeedConnector.buildAppObjectRequest = buildAppObjectRequest;
plugin.f3nti.ManagerRssFeedConnector.buildDeleteObjectRequest = buildDeleteObjectRequest;
plugin.f3nti.ManagerRssFeedConnector.findAppObjectBySip = findAppObjectBySip;
plugin.f3nti.ManagerRssFeedConnector.findAppObjectByUrl = findAppObjectByUrl;
plugin.f3nti.ManagerRssFeedConnector.getAppUrl = getAppUrl;
plugin.f3nti.ManagerRssFeedConnector.getCanonicalAppUri = getCanonicalAppUri;
plugin.f3nti.ManagerRssFeedConnector.getParentInstanceRoot = getParentInstanceRoot;
plugin.f3nti.ManagerRssFeedConnector.getInstancePath = getInstancePath;
plugin.f3nti.ManagerRssFeedConnector.getUrlPath = getUrlPath;
plugin.f3nti.ManagerRssFeedConnector.mergeAppList = mergeAppList;
plugin.f3nti.ManagerRssFeedConnector.buildTemplateAccessUpdate = buildTemplateAccessUpdate;
plugin.f3nti.ManagerRssFeedConnector.isManagedAppObject = isManagedAppObject;
plugin.f3nti.ManagerRssFeedConnector.appObjectFromGetObjectResult = appObjectFromGetObjectResult;
plugin.f3nti.ManagerRssFeedConnector.displayAppUrl = displayAppUrl;
plugin.f3nti.ManagerRssFeedConnector.prototype = innovaphone.ui1.nodePrototype;

function button(text, onClick) {
    var result = new innovaphone.ui1.Node(
        "button",
        "min-height:42px; padding:8px 14px; border:0; color:#eee; background:#414141; text-align:left; cursor:pointer",
        text
    );
    result.container.type = "button";
    result.addEvent("click", onClick);
    return result;
}

function addAppButton(onClick) {
    var result = new innovaphone.ui1.Node(
        "button",
        "display:block; width:100%; min-height:52px; padding:6px 14px; border:0; color:#eee; background:#414141; text-align:left; white-space:pre; cursor:pointer",
        "+   Add an App"
    );
    result.container.type = "button";
    result.addEvent("click", onClick);
    return result;
}

function addMetadata(parent, label, value) {
    var field = parent.add(new innovaphone.ui1.Div(
        "display:flex; align-items:center; gap:8px; min-width:0"
    ));
    field.add(new innovaphone.ui1.Div("color:#929ba5", label));
    field.add(new innovaphone.ui1.Div(
        "color:#eee; overflow-wrap:anywhere",
        value
    ));
}

function displayAppUrl(url) {
    return typeof url === "string"
        ? url.replace(/^https?:\/\/[^/]+/i, "")
        : "";
}

function addField(parent, label, value) {
    var field = parent.add(new innovaphone.ui1.Div(
        "display:flex; align-items:center; gap:12px; margin:8px 0"
    ));
    field.add(new innovaphone.ui1.Div("width:48px; color:#aaa", label));
    return field.add(new innovaphone.ui1.Input(
        "width:240px; padding:6px; color:#eee; background:#181818; border:0",
        value,
        null,
        128,
        "text"
    ));
}

function getInstanceRoot(uri) {
    if (uri.slice(-1) === "/") return uri;
    return uri.slice(0, uri.lastIndexOf("/") + 1);
}

function getCanonicalAppUri(uri) {
    if (typeof uri !== "string") {
        throw new Error("The App Platform instance URL is not available.");
    }
    var proxyMatch = uri.match(
        /^https?:\/\/[^/]+\/appproxy\/ext\/([^/]+)\/(.+)$/i
    );
    if (proxyMatch) {
        return "https://" + proxyMatch[1] + "/" + proxyMatch[2];
    }
    var directMatch = uri.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
    if (!directMatch) {
        throw new Error("The App Platform instance URL is invalid.");
    }
    return "https://" + directMatch[1] + (directMatch[2] || "/");
}

function getParentInstanceRoot(instanceRoot) {
    var path = instanceRoot.replace(/\/+$/, "");
    return path.slice(0, path.lastIndexOf("/") + 1);
}

function getAppUrl(instanceBaseRoot, sip) {
    var instanceName = typeof sip === "string" ? sip.split("@")[0] : "";
    if (!instanceName || instanceName === "." || instanceName === ".." ||
        /[\/\\?#]/.test(instanceName)) {
        throw new Error("SIP must be a valid App Platform instance name.");
    }
    return instanceBaseRoot + encodeURIComponent(instanceName) +
        "/rss-feed-connector.htm";
}

function getUrlPath(url) {
    var pathStart = url.indexOf("/", url.indexOf("://") + 3);
    if (pathStart === -1) return "";
    return url.slice(pathStart + 1).replace(/\/+$/, "");
}

function getInstancePath(appUrl) {
    var instancePath = getUrlPath(appUrl).replace(/\/rss-feed-connector\.htm$/, "");
    if (!instancePath) {
        throw new Error("Could not determine the App Platform instance path.");
    }
    return instancePath;
}

function parseAppList(value) {
    if (typeof value !== "string" || value.length === 0) return [];
    return value.split(",").map(function (entry) {
        return entry.trim();
    }).filter(Boolean);
}

function normalizeAppUrl(url) {
    return typeof url === "string" ? url.replace(/\/+$/, "").toLowerCase() : "";
}

function isManagedAppObject(object, instanceRoot) {
    if (!object) return false;
    var expectedUrl = normalizeAppUrl(instanceRoot);
    var objectUrl = normalizeAppUrl(object.url);
    return objectUrl.indexOf(expectedUrl + "/") === 0 &&
        /\/rss-feed-connector\.htm$/.test(objectUrl);
}

function findAppObjectByUrl(objects, url) {
    var expectedUrl = normalizeAppUrl(url);
    return objects.find(function (object) {
        return normalizeAppUrl(object.url) === expectedUrl;
    });
}

function appObjectFromGetObjectResult(message) {
    if (!message || message.mt !== "GetObjectResult" || !message.guid ||
        !message.pseudo || message.pseudo.type !== "app") {
        return null;
    }
    return {
        cn: message.cn,
        title: message.dn,
        sip: message.h323,
        url: message.pseudo.app && message.pseudo.app.url,
        connected: message.pseudo.state === "connected",
        guid: message.guid,
        pseudo: "app"
    };
}

function findAppObjectBySip(objects, sip) {
    var expectedSip = typeof sip === "string" ? sip.split("@")[0].toLowerCase() : "";
    return objects.find(function (object) {
        return typeof object.sip === "string" &&
            object.sip.split("@")[0].toLowerCase() === expectedSip;
    });
}

function mergeAppList(current, oldSip, newSip, selected) {
    var result = parseAppList(Array.isArray(current) ? current.join(",") : current)
        .filter(function (appName) {
            return appName !== oldSip && appName !== newSip;
        });
    if (selected) result.push(newSip);
    return result;
}

function buildTemplateAccessUpdate(guid, currentApps, currentAppsMy, oldSip, newSip, selected) {
    return {
        api: "PbxAdminApi",
        mt: "UpdateObject",
        guid: guid,
        template: "without",
        apps: mergeAppList(currentApps, oldSip, newSip, selected).join(","),
        "apps-my": mergeAppList(currentAppsMy, oldSip, newSip, selected).join(",")
    };
}

function buildAppObjectRequest(displayName, sip, password, url, guid, cn, copyPwd) {
    var request = {
        api: "PbxAdminApi",
        mt: "UpdateObject",
        cn: cn || sip,
        dn: displayName,
        h323: sip,
        apps: "connect,messages-api",
        pseudo: {
            type: "app",
            app: {
                url: url,
                websocket: true,
                "no-cert-check": true,
                messages: true,
                services: true
            }
        }
    };
    if (password) request.pwd = password;
    if (guid) request.guid = guid;
    if (copyPwd) request.copyPwd = copyPwd;
    return request;
}

function buildDeleteObjectRequest(guid) {
    return {
        api: "PbxAdminApi",
        mt: "DeleteObject",
        guid: guid
    };
}
})();
