
if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    };
}

String.prototype.insert = function (index, string) {
    if (index > 0)
        return this.substring(0, index) + string + this.substring(index, this.length);
    else
        return string + this;
};

String.prototype.startsWith = function (str) {
    return this.indexOf(str) == 0;
};

String.prototype.endsWith = function (suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

String.prototype.replaceAll = function (search, replace) {
    var replacer = new RegExp(search, "g");
    return this.replace(replacer, replace);
};

String.prototype.diacritics = { "á": "a", "ă": "a", "ǟ": "a", "à": "a", "ǎ": "a", "ā": "a", "ą": "a", "ȧ": "a", "å": "a", "ã": "a", "ä": "a", "â": "a", "ḃ": "b", "ć": "c", "ç": "c", "č": "c", "ċ": "c", "ĉ": "c", "ḑ": "d", "ď": "d", "ḋ": "d", "ð": "d", "đ": "d", "é": "e", "ĕ": "e", "ȅ": "e", "è": "e", "ě": "e", "ē": "e", "ę": "e", "ė": "e", "ë": "e", "ê": "e", "ḟ": "f", "ğ": "g", "ģ": "g", "ǧ": "g", "ġ": "g", "ĝ": "g", "ȟ": "h", "ḣ": "h", "ḥ": "h", "ħ": "h", "ĥ": "h", "í": "i", "ĭ": "i", "ì": "i", "ǐ": "i", "ī": "i", "į": "i", "ı": "i", "ĩ": "i", "ï": "i", "î": "i", "ȷ": "j", "ĵ": "j", "ḱ": "k", "ķ": "k", "ǩ": "k", "ḳ": "k", "ĺ": "l", "ļ": "l", "ľ": "l", "ŀ": "l", "ḷ": "l", "ł": "l", "ṁ": "m", "ṃ": "m", "ń": "n", "ņ": "n", "ň": "n", "ṅ": "n", "ñ": "n", "ó": "o", "ŏ": "o", "ő": "o", "ò": "o", "ǒ": "o", "ō": "o", "ȫ": "o", "ȭ": "o", "ǫ": "o", "ọ": "o", "ȯ": "o", "ø": "o", "ǿ": "o", "õ": "o", "ö": "o", "ô": "o", "ṗ": "p", "ŕ": "r", "ŗ": "r", "ř": "r", "ṙ": "r", "ś": "s", "ş": "s", "š": "s", "ș": "s", "ṡ": "s", "ŝ": "s", "ţ": "t", "ť": "t", "ț": "t", "ṫ": "t", "ŧ": "t", "ú": "u", "ŭ": "u", "ű": "u", "ù": "u", "ǔ": "u", "ū": "u", "ų": "u", "ů": "u", "ũ": "u", "ü": "u", "û": "u", "ŵ": "w", "ý": "y", "ȳ": "y", "ÿ": "y", "ŷ": "y", "ź": "z", "ž": "z", "ż": "z", "ƶ": "z", "æ": "ae", "ﬁ": "fi", "ĳ": "ij", "œ": "oe", "ꜩ": "tz" };
String.prototype.toNormalizedSearchString = function () {
    var result = "";
    var lower = this.toLocaleLowerCase();
    for (ch of lower) result += String.prototype.diacritics[ch] || ch;
    return result;
};

Node.prototype.isChildOf = function (node) {
    var parentNode = this;
    while ((parentNode = parentNode.parentNode) != undefined) {
        if (parentNode == node) {
            return true;
        }
    }
    return false;
}

window.alert = function () { console.warn("alert() must not be used in apps"); };
window.prompt = function () { console.warn("prompt() must not be used in apps"); };
window.confirm = function () { console.warn("confirm() must not be used in apps"); };

// static innovaphone.lib functions

var innovaphone = innovaphone || {};
innovaphone.lib1 = innovaphone.lib1 || (function () {

    var activeInput = null,
        loadingScripts = [];

    var keyCodes = {
        arrowDown: 40,
        arrowUp: 38,
        escape: 27,
        enter: 13,
        tab: 9,
        space: 32,
        backSpace: 8,
        insert: 45,
        f1: 112,
        f12: 123
    };

    function isInt(value) {
        return !isNaN(value) && parseInt(value) == value;
    }

    function isFloat(value) {
        return !isNaN(value) && parseFloat(value) == value;
    }

    function isPrimitiveType(value) {
        if (typeof (value) == "string" || typeof (value) == "number" || typeof (value) == "boolean") {
            return true;
        }
        return false;
    }

    function httpGet(url, funcComplete, funcFailed, usr, pwd) {
        var xmlReq = new window.XMLHttpRequest();
        if (xmlReq) {
            xmlReq.open("GET", url, funcComplete ? true : false);
            if (usr) xmlReq.setRequestHeader("Authorization", "Basic " + btoa(usr + ':' + pwd));
            xmlReq.send(null);
            if (funcComplete) {
                xmlReq.onreadystatechange = function () {
                    if (this.readyState == 4) {
                        if (this.status == 200) {
                            funcComplete(this.responseText, this.responseXML);
                        }
                        else {
                            if (funcFailed) funcFailed(this);
                            else funcComplete("");
                        }
                    }
                }
            }
        }
        return xmlReq;
    }

    function httpPostFile(url, file, funcComplete, funcFailed) {
        var xmlReq = new window.XMLHttpRequest();
        if (xmlReq) {
            xmlReq.open("POST", url, funcComplete ? true : false);
            xmlReq.send(file);
            if (funcComplete) {
                if (!funcFailed) funcFailed = funcComplete;
                xmlReq.onreadystatechange = function () {
                    console.log("httpPostFile " + this.readyState + " " + this.status);
                    if (this.readyState == 4) {
                        if (this.status == 200) {
                            funcComplete(0);
                        }
                        else {
                            if (funcFailed) funcFailed(this.status);
                        }
                    }
                }
            }
        }
    }

    function loadObjectScripts(scripts, onload) {
        var scriptsCopy = scripts.slice();
        loadNextScript();

        function loadNextScript() {
            if (scriptsCopy.length == 0) onload();
            else loadObjectScript(scriptsCopy.shift(), loadNextScript);
        }
    }

    function loadObjectScript(type, onload, onloadObj) {
        var parts = type.split("/");
        var path = "";
        for (var i = 0; i < parts.length - 1; i++) {
            path += parts[i] + "/";
        }
        var className = parts[i];
        var classParts = className.split(".");
        var current = window;
        var loaded = true;
        var obj = null;
        for (var i = 0; i <= classParts.length; i++) {
            if (!current) {
                var scriptFile = className + ".js";
                loaded = false;
                if (path) {
                    scriptFile = path + scriptFile;
                }
                if (onload) {
                    // search through script tags, which are currently loading and not yet ready
                    var loadingObj = null;
                    for (var s = 0; s < loadingScripts.length; s++) {
                        if (loadingScripts[s].path == scriptFile) {
                            loadingObj = loadingScripts[s];
                            break;
                        }
                    }
                    var func = function () {
                        scriptLoaded(classParts);
                    };
                    if (!loadingObj) {   // not loading, so create a new script tag
                        var head = document.getElementsByTagName("head")[0];
                        var script = document.createElement("script");
                        script.type = "text/javascript";
                        script.addEventListener("load", func);
                        script.src = scriptFile;
                        head.appendChild(script);
                        obj = { script: script, path: scriptFile };
                        loadingScripts.push(obj);
                    }
                    else {                  // loading, so just add event listener
                        loadingObj.script.addEventListener("load", func);
                    }
                }
                else {
                    alert("no script file should be loaded without callback function (" + scriptFile + ")");
                }
                break;
            }
            if (i == classParts.length) break;
            var old = current;
            current = current[classParts[i]];
            if (!current) {          // classname directly found in object
                for (var property in old) {     // check if there is a property independent of the casing of the class name or/and file name
                    if (old.hasOwnProperty(property)) {
                        if (property.toLowerCase() == classParts[i].toLowerCase()) {
                            current = old[property];
                            break;
                        }
                    }
                }
            }
        }
        if (loaded && onload) { // javascript file has been already loaded, so directly call onload
            loadResources(classParts);
        }

        function loadResources(classParts) {
            var current = window;
            var i = 0;
            for (i = 0; i < classParts.length - 1; i++) {
                current = current[classParts[i]];
            }
            if (current && current[classParts[i] + "Resources"] && !current[classParts[i] + "ResourcesLoaded"]) {
                current[classParts[i] + "Resources"](onload);
            }
            else {
                onload(onloadObj);
            }
        }

        function scriptLoaded(classParts) {
            if (loadingScripts.indexOf(obj) >= 0) {
                loadingScripts.splice(loadingScripts.indexOf(obj), 1);
            }
            loadResources(classParts);
        }
    }

    function loadCss(url) {
        var head = document.getElementsByTagName('head')[0];
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = url;
        link.media = 'all';
        head.appendChild(link);
    }

    var dummyFrame = null;

    function openLink(url) {
        if (!dummyFrame) {
            dummyFrame = document.createElement("iframe");
            dummyFrame.style = "visibility: collapse; position: absolute;";
            document.body.appendChild(dummyFrame);
        }
        dummyFrame.src = url;
    }

    function fireEvent(element, eventName, memo) {
        var event;
        event = document.createEvent("HTMLEvents");
        event.initEvent(eventName, true, true);

        event.eventName = eventName;
        event.memo = memo || {};

        element.dispatchEvent(event);
    }

    function addClass(element, className) {
        removeClass(element, className);
        element.className += (element.className ? " " : "") + className;
    }

    function removeClass(element, className) {
        var classes = element.className.split(" ");
        element.className = "";
        for (var i in classes) {
            if (classes[i] && classes[i] != className) {
                element.className += (element.className ? " " : "") + classes[i];
            }
        }
    }

    function Start(onload) {
        return start(null, null, onload);
    }

    function start(langFile, langs, onload) {
        var params = location.search.substring(1),
            pairs = params.split("&"),
            numberOfArguments = pairs.length,
            start = {},
            onapiconsumerclosed = new Event(start),
            onapirequest = new Event(start),
            onapiresult = new Event(start),
            onapiupdate = new Event(start),
            onchannelconnected = new Event(start),
            onchannelclosed = new Event(start),
            onchannelmessage = new Event(start),
            logins = [],
            currentSrc = 0,
            prefixSrc = Math.ceil(Math.random() * 0xffffffff).toString(16);

        if (window.opener) {
            setInterval(() => {
                if (!window.opener || window.opener.closed) window.close();
            }, 1000);
        }

        if (navigator.userAgent.includes("myApps")) {
            try {
                if ((typeof(window.parent.console) != "undefined") && window.parent.console.custom) {
                    if (typeof(window.custom_saved_console_) == "undefined") {
                        window.custom_saved_console_ = window.console;
                    }
                    window.console = window.parent.console;
                }
                if ((typeof(window.parent.custom_saved_window_open_) != "undefined") && (typeof(window.custom_saved_window_open_) == "undefined")) {
                    window.custom_saved_window_open_ = window.open;
                    window.open = window.parent.open;
                }
                if (window.parent.webkit && window.parent.webkit.messageHandlers) {
                    if (window.parent.webkit.messageHandlers.console_message_) {
                        window.webkit.messageHandlers.console_message_ = window.parent.webkit.messageHandlers.console_message_;
                    }
                    if (window.parent.webkit.messageHandlers.window_open_) {
                        window.webkit.messageHandlers.window_open_ = window.parent.webkit.messageHandlers.window_open_;
                    }
                }
            }
            catch (e) {
            }
        }
        start.lang = (navigator.language || "en").split("-")[0].toLowerCase();
        start.scheme = "dark";
        start.size = "1";
        start.visible = false;
        start.args = {};
        start.margs = {};
        start.apis = {};
        start.defaultApiProviders = {};
        start.prepareReloadCallback = null;
        start.onapiupdate = onapiupdate;
        start.onlangchanged = new Event(start);
        start.onschemechanged = new Event(start);
        start.onsizechanged = new Event(start);
        start.onargschanged = new Event(start);
        start.onshow = new Event(start);
        start.onvisiblechanged = new Event(start);
        start.onmenustatechanged = new Event(start);
        start.postClientMessage = function (obj) {
            if (window.opener) window.opener.postMessage(JSON.stringify(obj), "*");
            else window.parent.postMessage(JSON.stringify(obj), "*");
        };
        start.show = function (value) {
            start.postClientMessage({ mt: "Action", type: "ShowApp", value: value });
        };
        start.bringToFront = function () {
            start.postClientMessage({ mt: "Action", type: "BringToFront" });
        };
        start.close = function () {
            start.postClientMessage({ mt: "Action", type: "CloseApp" });
        };
        start.blur = function () {
            start.postClientMessage({ mt: "Action", type: "BlurApp" });
        };
        start.home = function () {
            start.postClientMessage({ mt: "Action", type: "ShowApp", value: "@home" });
        };
        start.requestPrepareReload = function (callback) {
            start.postClientMessage({ mt: "RequestPrepareReload" });
            start.prepareReloadCallback = callback;
        };
        start.prepareReloadComplete = function() {
            start.postClientMessage({ mt: "PrepareReloadComplete" });
        };
        start.setArgs = function (args, title) {
            start.postClientMessage({ mt: "Action", type: "SetArgs", args: args, title: title });
        };
        start.setBadge = function (val) {
            start.postClientMessage({ mt: "Action", type: "SetBadge", value: val });
        };
        start.startActivity = function () {
            start.postClientMessage({ mt: "Action", type: "StartActivity" });
        };
        start.finishActivity = function () {
            start.postClientMessage({ mt: "Action", type: "FinishActivity" });
        };
        start.setMenuState = function (val) {
            start.postClientMessage({ mt: "SetMenuState", value: val });
        };
        start.setColor = function (val) {
            start.postClientMessage({ mt: "SetColor", value: val });
        };
        start.provideApi = function (api) {
            return new (function (api) {
                var that = this;

                this.onmessage = new Event(this);
                this.onconsumerclosed = new Event(this);
                this.isDefaultApiProvider = function () { return start.defaultApiProviders[api] == start.name; }
                this.send = function (msg, consumer, src) { start.postClientMessage({ mt: "ApiResult", api: api, consumer: consumer, src: src, msg: msg }); };
                this.update = function (model) { start.postClientMessage({ mt: "ApiModel", api: api, model: model }); };

                onapirequest.attach(function (src, obj) { if (obj.api == api) that.onmessage.notify({ consumer: obj.consumer, src: obj.src, msg: obj.msg }); });
                onapiconsumerclosed.attach(function (src, obj) { if (obj.api == api) that.onconsumerclosed.notify({ api: api, consumer: obj.consumer }); });
                start.postClientMessage({ mt: "RegisterApi", api: api });
            })(api);
        };
        start.consumeApi = function (api) {
            return new (function (api) {
                var that = this;

                this.model = {};
                this.providers = [];
                this.defaultApiProvider = null;
                this.onupdate = new Event(this);
                this.onmessage = new Event(this);
                this.send = function (msg, provider, src, title) { start.postClientMessage({ mt: "ApiRequest", api: api, provider: provider, src: src, title: title, msg: msg }); }
                this.sendSrc = function (message, provider, result, obj) {
                    var src = new that.Src(function (m) {
                        src.close();
                        result(m, src.obj);
                    });
                    src.obj = obj;
                    src.send(message, provider);
                }

                function update() {
                    var changed = false;
                    if (that.defaultApiProvider != start.defaultApiProviders[api]) {
                        that.defaultApiProvider = start.defaultApiProviders[api];
                        console.log("API consumer(" + api + "): defaultApiProvider = " + that.defaultApiProvider);
                        changed = true;
                    }
                    var newModel = start.apis[api] || {};
                    if (JSON.stringify(newModel) != JSON.stringify(that.model)) {
                        that.model = newModel;
                        that.providers = [];
                        for (var key in newModel) that.providers.push(key);
                        changed = true;
                    }
                    if (changed) that.onupdate.notify();
                }

                this.Src = function (onmessage) {
                    return new (function (onmessage, apiConsumer) {
                        var src = "apisrc-" + prefixSrc + "-" + (++currentSrc);
                        this.close = function () {
                            apiConsumer.onmessage.detach(onapiresult);
                            src = null;
                        };
                        this.send = function (msg, provider, title) {
                            if (src) apiConsumer.send(msg, provider, src, title);
                        };
                        function onapiresult(sender, obj) {
                            if (obj.src == src) onmessage(obj);
                        }
                        apiConsumer.onmessage.attach(onapiresult);
                    })(onmessage, that);
                };

                onapiupdate.attach(function (src, obj) { update() });
                onapiresult.attach(function (src, obj) { if (obj.api == api) that.onmessage.notify({ provider: obj.provider, src: obj.src, msg: obj.msg || {}, errorText: obj.errorText }); });
                update();
                start.postClientMessage({ mt: "ConsumeApi", api: api });
            })(api);
        };
        start.onopenchannel = function (channel, opener, args) { start.postClientMessage({ mt: "ChannelClosed", channel: channel }); };
        start.openChannel = function (dst, args) {
            return new (function (dst, args) {
                var that = this,
                    channel = null;
                src = ++currentSrc;

                this.onconnected = function () { };
                this.onclosed = function () { };
                this.onmessage = function (msg) { };
                this.send = function (msg) {
                    if (channel) start.postClientMessage({ mt: "ChannelMessage", channel: channel, msg: msg });
                };
                this.close = function () {
                    if (channel) start.postClientMessage({ mt: "ChannelClosed", channel: channel });
                    channel = null;
                    src = null;
                    onchannelconnected.detach(connected);
                    onchannelclosed.detach(closed);
                    onchannelmessage.detach(message);
                };

                function connected(sender, obj) {
                    if (obj.src == src) {
                        channel = obj.channel;
                        that.onconnected();
                    }
                }
                function closed(sender, obj) {
                    if (obj.src == src || obj.channel == channel) {
                        that.onclosed();
                    }
                }
                function message(sender, obj) {
                    if (obj.channel == channel) {
                        that.onmessage(obj.msg);
                    }
                }

                onchannelconnected.attach(connected);
                onchannelclosed.attach(closed);
                onchannelmessage.attach(message);
                start.postClientMessage({ mt: "OpenChannel", src: src, dst: dst, args: args });
            })(dst, args);
        };
        start.acceptChannel = function (channel) {
            return new (function (channel) {
                var that = this;

                this.onclosed = function () { };
                this.onmessage = function (msg) { };
                this.send = function (msg) {
                    if (channel) start.postClientMessage({ mt: "ChannelMessage", channel: channel, msg: msg });
                };
                this.close = function () {
                    if (channel) start.postClientMessage({ mt: "ChannelClosed", channel: channel });
                    channel = null;
                    onchannelclosed.detach(closed);
                    onchannelmessage.detach(message);
                };

                function closed(sender, obj) {
                    if (obj.channel == channel) {
                        that.onclosed();
                    }
                }
                function message(sender, obj) {
                    if (obj.channel == channel) {
                        that.onmessage(obj.msg);
                    }
                }

                onchannelclosed.attach(closed);
                onchannelmessage.attach(message);
                start.postClientMessage({ mt: "ChannelConnected", channel: channel });
            })(channel);
        };
        start.rejectChannel = function (channel) {
            start.postClientMessage({ mt: "ChannelClosed", channel: channel });
        };

        var requests = [];
        var requestsRef = 0;
        window.addEventListener("message", function (e) {
            if (JSON && e.data && typeof e.data == "string") {
                try {
                    var obj = JSON.parse(e.data);
                } catch (e) {
                    return;
                }
                switch (obj.mt) {
                    case "SetLang":
                        start.lang = obj.lang;
                        start.onlangchanged.notify();
                        break;
                    case "SetScheme":
                        start.scheme = obj.scheme;
                        start.onschemechanged.notify();
                        break;
                    case "SetSize":
                        start.size = obj.size;
                        start.onsizechanged.notify();
                        break;
                    case "SetArgs":
                        start.args = obj.args;
                        start.onargschanged.notify();
                        break;
                    case "SetVisible":
                        start.visible = obj.visible;
                        start.onvisiblechanged.notify();
                        break;
                    case "Show":
                        start.onshow.notify();
                        break;
                    case "ConsumeApi":
                        if (e.source != opener && e.source != parent) {
                            new (function (iframe, api) {
                                onapiupdate.attach(update);
                                onapiresult.attach(result);
                                function update(src, obj) {
                                    check();
                                    if (iframe) iframe.postMessage(JSON.stringify(obj), "*");
                                }
                                function result(src, obj) {
                                    check();
                                    if (iframe && obj.api == api) iframe.postMessage(JSON.stringify(obj), "*");
                                }
                                function check() {
                                    if (!iframe || iframe.closed) {
                                        onapiupdate.detach(update);
                                        onapiresult.detach(result);
                                        iframe = null;
                                        api = null;
                                    }
                                }
                                iframe.postMessage(JSON.stringify({ mt: "ApiUpdate", apis: start.apis }), "*");
                            })(e.source, obj.api);
                            start.postClientMessage(obj);
                        }
                        break;
                    case "ApiConsumerClosed":
                        if (e.source == opener || e.source == parent) onapiconsumerclosed.notify(obj);
                        else start.postClientMessage(obj);
                        break;
                    case "ApiRequest":
                        if (e.source == opener || e.source == parent) {
                            onapirequest.notify(obj);
                        }
                        else {
                            let r = requests.find((x) => obj.src == x.src && e.source === x.win);
                            if (!r) {
                                r = { win: e.source, src: obj.src, map: String(requestsRef++).padStart(10, "0") + (obj.src ? obj.src : "") };
                                requests.push(r);
                            }
                            obj.src = r.map;
                            start.postClientMessage(obj);
                        }
                        break;
                    case "ApiResult":
                        let r = requests.find((x) => obj.src == x.map );
                        if (r) {
                            if (!r.win.closed) {
                                obj.src = r.src;
                                r.win.postMessage(JSON.stringify(obj), "*");
                            }
                            else {
                                requests.splice(requests.indexOf(r), 1);
                            }
                        }
                        else if (e.source == opener || e.source == parent) {
                            onapiresult.notify(obj);
                        }
                        break;
                    case "ApiUpdate":
                        if (e.source == opener || e.source == parent) {
                            start.apis = obj.apis;
                            start.defaultApiProviders = obj.defaultApiProviders || {};
                            onapiupdate.notify(obj);
                        }
                        break;
                    case "OpenChannel":
                        start.onopenchannel(obj.channel, obj.opener, obj.args);
                        break;
                    case "ChannelConnected":
                        onchannelconnected.notify(obj);
                        break;
                    case "ChannelClosed":
                        onchannelclosed.notify(obj);
                        break;
                    case "ChannelMessage":
                        onchannelmessage.notify(obj);
                        break;
                    case "SetMenuState":
                        start.onmenustatechanged.notify(obj.value);
                        break;
                    case "PrepareReload":
                        if (start.prepareReloadCallback) start.prepareReloadCallback();
                        else start.prepareReloadComplete();
                        break;
                    case "getLogin":
                        logins.push(e.source);
                        (parent ? parent : opener).postMessage(e.data, "*");
                        break;
                    case "Login":
                        var login = logins.shift();
                        if (login) login.postMessage(e.data, "*");
                        break;
                }
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key == "Escape") {
                if (e.target == e.currentTarget) start.blur();
            }
        });

        for (var i = 0; i < numberOfArguments; i++) {
            var pos = pairs[i].indexOf('=');
            if (pos == -1) {
                continue;
            }
            var argname = pairs[i].substring(0, pos);
            var value = pairs[i].substring(pos + 1);
            value = decodeURIComponent(value);
            if (argname == "lang") {
                start.lang = value;
            }
            else if (argname == "scheme") {
                start.scheme = value;
            }
            else if (argname == "size") {
                start.size = value;
            }
            else if (argname == "name") {
                start.name = value;
            }
            else if (argname == "title") {
                start.title = value;
            }
            else if (argname == "url") {
                start.url = value;
            }
            else if (argname == "originalUrl") {
                start.originalUrl = value.slice(0, value.lastIndexOf("/"));
            }
            else if (argname == "clientUrl") {
                start.clientUrl = value;
            }
            else if (argname == "proxyUrl") {
                start.proxyUrl = value;
            }
            else {
                if (!start.args[argname]) start.args[argname] = value;
                (start.margs[argname] = start.margs[argname] || []).push(value);
            }
        }
        start.url = start.url || location.href;
        start.url = start.url.slice(0, start.url.lastIndexOf("/"));
        start.url = start.url.replace("http", "ws");
        if (!start.originalUrl) start.originalUrl = location.href.slice(0, location.href.lastIndexOf("/", location.href.lastIndexOf("/") - 1));
        start.search = start.search || location.search;
        start.postClientMessage({ mt: "Alive" });
        if (langFile) loadObjectScript(langFile + "." + start.lang, function () { onload(start); });
        else onload(start);
        return start;
    }

    function replace$Args(translatedString) {
        for (var i = arguments.length - 1; i >= 1; i--) {
            var replacer = new RegExp("\\$" + i.toString(), "g");
            translatedString = translatedString.replace(replacer, arguments[i]);
        }
        return translatedString;
    }

    function Event(sender, onattach) {
        this.sender = sender;
        this.onattach = onattach;
        this.listeners = [];
    }

    Event.prototype = {
        attach: function (listener) {
            if (this.listeners.includes(listener)) {
                console.warn("listener already attached");
            }
            this.listeners.push(listener);
            if (this.onattach) this.onattach(listener);
            return listener;
        },
        detach: function (listener) {
            var index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
        },
        notify: function (args) {
            var list = this.listeners.slice();
            for (var i = 0; i < list.length; i++) {
                list[i](this.sender, args);
            }
        },
        close: function () { this.listeners = [] }
    };

    function Languages(texts, lang) {
        var that = this;
        var fallback = { ca: "es", eu: "es" };
        this.current = texts[lang] ? lang : texts[fallback[lang]] ? fallback[lang] : "en";
        this.onlangchanged = new Event(this);
        this.onnoderemoved = new Event(this);
        document.documentElement.lang = this.current;

        this.activate = function (newLang) {
            that.current = texts[newLang] ? newLang : texts[fallback[newLang]] ? fallback[newLang] : "en";
            document.documentElement.lang = that.current;
            that.onlangchanged.notify(that.current);
        };

        this.text = function (id, args) {
            var t = texts[that.current][id] || (fallback[that.current] ? texts[fallback[that.current]][id] : null) || texts["en"][id] || (id ? "{" + id + "}" : "");
            if (t && args) {
                for (var i = args.length - 1; i >= 0; i--) {
                    t = t.replace(new RegExp("\\$" + i.toString(), "g"), args[i]);
                }
            }
            return t;
        };

        this.langText = function (lang, id, args) {
            var t = texts[lang] ? texts[lang][id] || "" : "";
            if (t && args) {
                for (var i = args.length - 1; i >= 0; i--) {
                    t = t.replace(new RegExp("\\$" + i.toString(), "g"), args[i]);
                }
            }
            return t;
        };

        this.create = function (node, property, id, args) {
            return new TranslatedNode(that, node.container || node, property || "innerText", id, args);
        };

        this.clear = function (node) {
            if (node && node.container) node = node.container;
            that.onnoderemoved.notify(node);
        };

        this.supported = function (lang) {
            return texts[lang] != undefined;
        };
    }

    function createGUID() {
        let u = Date.now().toString(16) + Math.random().toString(16) + '0'.repeat(16);
        return [u.substr(0,8), u.substr(8,4), '40008' + u.substr(13,3), u.substr(16,12)].join("");
    }

    function TranslatedNode(languages, node, property, id, args) {
        var that = this;

        this.remove = function () {
            languages.onlangchanged.detach(that.update);
            languages.onnoderemoved.detach(that.checkRemoved);
        };

        this.update = function () {
            if (that.node) that.node[property] = languages.text(id, args);
        };

        this.setId = function (newId) {
            id = newId;
            that.update();
        };

        this.setArgs = function (newArgs) {
            args = newArgs;
            that.update();
        };

        this.checkRemoved = function (sender, node) {
            if (!node || node == that.node || node.contains && node.contains(that.node)) that.remove();
        };

        this.node = node;
        this.property = property;
        this.update();
        languages.onlangchanged.attach(that.update);
        languages.onnoderemoved.attach(that.checkRemoved);
    }

    return {
        isInt: isInt,
        isFloat: isFloat,
        isPrimitiveType: isPrimitiveType,
        httpGet: httpGet,
        httpPostFile: httpPostFile,
        loadObjectScript: loadObjectScript,
        loadObjectScripts: loadObjectScripts,
        loadCss: loadCss,
        openLink: openLink,
        fireEvent: fireEvent,
        addClass: addClass,
        removeClass: removeClass,
        start: start,
        Start: Start,
        replace$Args: replace$Args,
        Event: Event,
        Languages: Languages,
        keyCodes: keyCodes,
        createGUID: createGUID
    }
})();
