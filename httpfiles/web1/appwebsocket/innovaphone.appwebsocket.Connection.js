/*---------------------------------------------------------------------------*/
/* innovaphone.appwebsocket.Connection.js                                    */
/* A client for connecting to the innovaphone PBX                            */
/*---------------------------------------------------------------------------*/

/*
 * Copyright (C) 2015 innovaphone AG
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in
 *    the documentation and/or other materials provided with the
 *    distribution.
 *  * Neither the name of the copyright holder nor the names of
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS
 * OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 */

var innovaphone = innovaphone || {};
innovaphone.appwebsocket = innovaphone.appwebsocket || {};
innovaphone.appwebsocket.Test = innovaphone.appwebsocket.Test || {};
innovaphone.appwebsocket.Connection = innovaphone.appwebsocket.Connection || function (url, app, password, domain, fonconnected, fonmessage, fonerror, fonclosed, fgetlogin, usr, appObj) {
    console.log("AppWebsocket(" + app + ") " + url);
    var TIMEOUT_MIN = 500,
        TIMEOUT_MAX = 32000,
        TIMEOUT_KEEPALIVE = 60000,
        states = { "CONNECT": 1, "OPENED": 2, "LOGIN2": 3, "CONNECTED": 4, "CLOSED": 5 };

    var instance = this,
        url = url,
        ws = null,
        state = appObj != "-" ? states.CONNECT : states.CLOSED,
        user = null,
        dn = null,
        sessionKey = null,
        info = null,
        unique = 0,
        timeout = TIMEOUT_MIN,
        timeoutId = null,
        keepAlive = false,
        keepAliveTimer = null,
        loginSrc = "";

    this.checkBuild = false;
    window.addEventListener('message', onpostmessage);
    window.addEventListener('beforeunload', function () {
        console.log(app + ": close beforeunload");
        stopKeepAlive();
    });
    window.addEventListener("unload", function () {
        console.log(app + ": close unload");
    });

    innovaphone.appwebsocket.Test[app] = 0;

    function onopen() {
        console.log(app + ": opened " + ws.url + " location " + location.href);
        state = states.OPENED;
        if (instance.checkBuild) {
            send({ mt: "CheckBuild", url: location.href });
        }
        send({ mt: "AppChallenge", user: usr, appObj: appObj });
    }

    function onmessage(message) {
        var obj = JSON.parse(message.data);
        if (obj && obj.mt) {
            console.log(app + ": recv: " + message.data);
            switch (obj.mt) {
                case "AppChallengeResult":
                    if (obj.sysClient) password = "";
                    if (password || obj.sysClient) passwordLogin(obj.challenge);
                    else if (fgetlogin) fgetlogin(app, obj.challenge, obj.dn, obj.nonce);
                    else if (window.self == window.top) adminLogin(obj.challenge);
                    else {
                        loginSrc =  "" + Math.round(Math.random() * 1000000000);
                        window.parent.postMessage(JSON.stringify({ mt: "getLogin", src: loginSrc, app: app, challenge: obj.challenge, nonce: obj.nonce, dn: obj.dn }), "*");
                    }
                    break;
                case "AppLoginResult":
                    window.parent.postMessage(JSON.stringify({ mt: "loginResult", ok: obj.ok }), "*");
                    if (obj.ok) {
                        timeout = TIMEOUT_MIN;
                        state = states.CONNECTED;
                        restartKeepAlive();
                        instance.onconnected(domain, user, dn, obj.domain);
                        innovaphone.appwebsocket.Test[app] += 1;
                    }
                    else {
                        var error = "LOGIN_FAILURE";
                        if (instance.logindata) {
                            if (instance.logindata.info && instance.logindata.info.unlicensed) error = "UNLICENSED";
                            else if (instance.logindata.errorText) error = instance.logindata.errorText;
                            else if (instance.logindata.error) error = "Error " + instance.logindata.error;
                        }
                        close(error);
                    }
                    break;
                case "CheckBuildResult":
                    if (instance.checkBuild) {
                        if (obj.url) {
                            console.log(app + ": build mismatch, redirect to: " + obj.url);
                            stopKeepAlive();
                            if (ws) {
                                ws.onclose = undefined;
                                ws.onerror = undefined;
                                ws.close();
                                ws = null;
                            }
                            location.href = obj.url;
                        }
                        break;
                    }
                default:
                    if (state == states.CONNECTED) {
                        restartKeepAlive();
                        var s = srcs.find(function (s) { return s.src == obj.src });
                        if (s) {
                            s.onmessage(obj);
                            return;
                        }
                        var a = apis.find(function (a) { return a.name == obj.api });
                        if (a) {
                            a.api.onmessage(obj);
                            return;
                        }

                        instance.onmessage(obj);
                    }
                    break;
            }

        }
    }

    function onpostmessage(e) {
        if (JSON && e.data && typeof e.data == "string") {
            try {
                var obj = JSON.parse(e.data);
            } catch (e) {
                return;
            }
            if (obj.mt && obj.mt == "Login") {
                if (!obj.src || obj.src == loginSrc) {
                    loginSrc = "";
                    console.log(app + ": AppLogin(" + obj.sip + "@" + obj.domain + ", guid=" + obj.guid + ", dn=" + obj.dn + ", app=" + obj.app + ", src=" + obj.src +")");
                    if (app == obj.pbxObj) login(obj);
                    else delete obj.key;
                    instance.logindata = obj;
                }
            }
            else {
                instance.onFromPBX(obj);
            }
        }
    }

    function login(obj) {
        user = obj.sip;
        domain = obj.domain;
        dn = obj.dn;
        sessionKey = obj.key;
        info = obj.info;
        delete obj.key;
        send({ mt: "AppLogin", app: obj.app, domain: obj.domain, sip: obj.sip, guid: obj.guid, dn: obj.dn, info: obj.info, digest: obj.digest, pbxObj: app });
    }

    function passwordLogin(challenge) {
        var obj = {};
        obj.app = app;
        obj.sip = app;
        obj.domain = domain ? domain : "";
        obj.lang = "en";
        obj.guid = "00000000000000000000000000000000";
        obj.dn = "Admin";
        obj.digest = innovaphone.crypto.sha256(app + ":" + obj.domain + ":" + obj.sip + ":" + obj.guid + ":" + obj.dn + ":" + challenge + ":" + password);
        obj.key = innovaphone.crypto.sha256("innovaphoneAppSessionKey:" + challenge + ":" + password);
        login(obj);
    }

    function calculateDigest(app, domain, sip, guid, dn, challenge, password) {
        return innovaphone.crypto.sha256(app + ":" + domain + ":" + sip + ":" + guid + ":" + dn + ":" + challenge + ":" + password);
    }

    function adminLogin(challenge) {
        var inp = document.createElement("input");
        inp.type = "password";
        inp.setAttribute("style", "position: absolute; left: 10px; top: 10px");
        inp.onkeypress = function (event) { if (event.keyCode == 13) click(); };
        document.body.appendChild(inp);
        var button = document.createElement("button");
        button.setAttribute("style", "position: absolute; left: 10px; top: 50px");
        button.innerHTML = "Login";
        document.body.appendChild(button);
        button.addEventListener('click', click);
        inp.focus();

        function click() {
            var obj = new Object();
            obj.app = app;
            obj.sip = app;
            obj.domain = "";
            obj.lang = "en";
            obj.guid = "00000000000000000000000000000000";
            obj.dn = "Admin";
            obj.digest = innovaphone.crypto.sha256(app + ":" + obj.domain + ":" + obj.sip + ":" + obj.guid + ":" + obj.dn + ":" + challenge + ":" + inp.value);
            obj.key = innovaphone.crypto.sha256("innovaphoneAppSessionKey:" + challenge + ":" + inp.value);
            login(obj);
            inp.remove();
            button.remove();
        }
    }

    function onerror(error) {
        console.log(app + ": error");
        if (ws) {
            ws.onclose = null;
            ws.onmessage = null;
            ws.onopen = null;
            ws.onerror = null;
            ws = null;
        }
        close("WEBSOCKET_ERROR");
    }

    function onclose() {
        if (console) console.log(app + ": closed");
        ws = null;
        if (state != states.CLOSED) close("REMOTE_CLOSE");
    }

    function restartKeepAlive() {
        window.clearTimeout(keepAliveTimer);
        keepAliveTimer = keepAlive ? window.setTimeout(function () {
            send({ mt: "KeepAlive" });
        }, TIMEOUT_KEEPALIVE) : null;
    }

    function stopKeepAlive() {
        window.clearTimeout(keepAliveTimer);
        keepAliveTimer = null;
    }

    // general control functions
    function connect() {
        state = states.CONNECT;
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            ws.close();
            ws = null;
        }
        ws = new WebSocket(url);
        ws.onopen = onopen;
        ws.onmessage = onmessage;
        ws.onerror = onerror;
        ws.onclose = onclose;
    }

    function close(error) {
        stopKeepAlive();
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (state != states.CLOSED) {
            console.log(app + ": closing");
            state = states.CLOSED;
            if (ws) {
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                ws.close();
                ws = null;
            }
            if (error) {
                srcs.forEach((s) => { s.onmessage({ mt: "ERROR" }) });
                if (instance.onerror(error)) error = null;
            }
            else instance.onclosed();
        }
        if (error) {
            console.log(app + ": reconnect in " + timeout + "ms");
            timeoutId = window.setTimeout(function () { timeoutId = null; if (state == states.CLOSED) connect(); }, timeout);
            if (timeout < TIMEOUT_MAX) timeout *= 2;
        }
    }

    function byteArrayToString(arr) {
        // input: utf-8-encoded byte array
        var str = "";
        for (var i = 0; i < arr.length; i++) {
            var c = arr.charCodeAt(i);
            if ((c & 0x80) == 0x00) {
                // one-byte character [0xxxxxxx] (code points 0-7F)
                var codePoint = (c & 0x7F);
                str += String.fromCodePoint(codePoint);
            }
            else if ((c & 0xe0) == 0xc0) {
                // two-byte character [110xxxxx 10xxxxxx] (code points 80-7FF)
                var codePoint = (c & 0x1F) << 6;
                codePoint |= (arr.charCodeAt(++i) & 0x3F);
                str += String.fromCodePoint(codePoint);
            }
            else if ((c & 0xf0) == 0xe0) {
                // three-byte character [1110xxxx 10xxxxxx 10xxxxxx] (code points 800-FFFF)
                var codePoint = (c & 0x0F) << 12;
                codePoint |= (arr.charCodeAt(++i) & 0x3F) << 6;
                codePoint |= (arr.charCodeAt(++i) & 0x3F);
                str += String.fromCodePoint(codePoint);
            }
            else if ((c & 0xf8) == 0xf0) {
                // four-byte character [11110xxx 10xxxxxx 10xxxxxx 10xxxxxx] (code points 10000-1FFFFF)
                var codePoint = (c & 0x07) << 18;
                codePoint |= (arr.charCodeAt(++i) & 0x3F) << 12;
                codePoint |= (arr.charCodeAt(++i) & 0x3F) << 6;
                codePoint |= (arr.charCodeAt(++i) & 0x3F);
                str += String.fromCodePoint(codePoint);
            }
        }
        return str;
    }

    function encrypt(seed, data) {
        var keyBytes = new textEncode(seed + ":" + sessionKey);
        var strBytes = new textEncode(data);
        return innovaphone.crypto.str2hex(innovaphone.crypto.rc4Bytes(keyBytes, strBytes));
    }

    function decrypt(seed, data) {
        var keyBytes = new textEncode(seed + ":" + sessionKey);
        var arr = innovaphone.crypto.rc4Bytes(keyBytes, innovaphone.crypto.hex2bin(data));
        return byteArrayToString(arr);
    }

    function textEncode(str) {
        if (window.TextEncoder) {
            return new TextEncoder('utf-8').encode(str);
        }
        var utf8 = unescape(encodeURIComponent(str));
        var result = new Uint8Array(utf8.length);
        for (var i = 0; i < utf8.length; i++) {
            result[i] = utf8.charCodeAt(i);
        }
        return result;
    }

    function hash(seed, data) {
        return innovaphone.crypto.sha256(seed + ":" + sessionKey + ":" + data);
    }

    // outgoing messages
    // session
    function send(obj) {
        var messageJSON = JSON.stringify(obj);
        if (ws) {
            console.log(app + ": send: " + messageJSON);
            ws.send(messageJSON);
        }
        else {
            console.log(app + ": discard: " + messageJSON);
        }
        restartKeepAlive();
    }

    // public interface
    this.connect = function (a) {
        appObj = a;
        timeout = TIMEOUT_MIN;
        if (state == states.CLOSED) connect();
    }
    this.send = function (message) {
        if (state == states.CONNECTED) send(message);
    }
    this.sendSrc = function (message, result, obj, last) {
        var src = new instance.Src(function (m) {
            if (!last || m.mt == "last") src.close();
            if (result) result(m, src.obj);
        });
        src.obj = obj;
        src.send(message);
    }
    this.sendSrcMore = function (message, result, obj) {
        var src = new instance.Src(function (m) {
            if (m.more) {
                if (m.more !== true) {
                    message.more = m.more;
                    src.send(message);
                }
            }
            else {
                src.close();
            }
            if (result) result(m, src.obj);
        });
        src.obj = obj;
        src.send(message);
    }
    this.close = function (error) {
        close(error);
    }
    this.login = function (obj) {
        login(obj);
    }
    this.calculateDigest = calculateDigest;
    this.toPBX = function (obj) {
        window.parent.postMessage(JSON.stringify(obj), "*");
    }
    this.dn = function () {
        return dn;
    }
    this.user = function () {
        return user;
    }
    this.obj = function () {
        return app;
    }
    this.connected = function () {
        return state == states.CONNECTED;
    }
    this.setKeepAlive = function (on) {
        keepAlive = on;
        if (on) restartKeepAlive();
        else stopKeepAlive();
    }
    this.encrypt = encrypt;
    this.decrypt = decrypt;
    this.hash = hash;
    this.key = function () { return sessionKey; };
    this.info = function () { return info; };

    // public event handlers
    // session
    this.onconnected = fonconnected ? fonconnected : function () { };
    this.onmessage = fonmessage ? fonmessage : function (message) { };
    this.onerror = fonerror ? fonerror : function (error) { };
    this.onclosed = fonclosed ? fonclosed : function () { };
    this.onFromPBX = function () { };

    // start
    if (appObj != "-") connect();

    var srcs = [];
    this.src = function (src) {
        if (!src) src = "src" + unique++;
        this.src = src;
        this.onmessage = null;
        this.send = function (message) {
            message.src = src;
            send(message)
        }
        this.close = function () {
            if (srcs.find(function (s) { return s.src == src })) srcs.splice(srcs.indexOf(this), 1);
        }
        var s = srcs.find(function (s) { return s.src == src });
        if (s) {
            console.log(app + ": duplicate src " + src);
            srcs.splice(srcs.indexOf(s), 1);
        }
        srcs.push(this);

        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.hash = hash;
    }

    this.Src = function (on, src) {
        if (!src) src = "src" + unique++;
        this.src = src;
        this.onmessage = on;
        this.send = function (message) {
            message.src = src;
            send(message);
            return this;
        }
        this.close = function () {
            if (srcs.find(function (s) { return s.src == src })) srcs.splice(srcs.indexOf(this), 1);
        }
        this.restart = function () {
            src = "src" + unique++;
            this.src = src;
        }
        var s = srcs.find(function (s) { return s.src == src });
        if (s) {
            console.log(app + ": duplicate src " + src);
            srcs.splice(srcs.indexOf(s), 1);
        }
        srcs.push(this);

        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.hash = hash;
    }

    var apis = [];
    this.registerApi = function (obj, name) {
        for (var i = 0; i < apis.length; ++i) {
            if (apis[i].name == name) {
                console.log(app + ": registerApi(): duplicate api " + name);
                return;
            }
        }

        apis.push({ name: name, api: obj });
    }
};

innovaphone.crypto = innovaphone.crypto || {};
innovaphone.crypto.sha256 = innovaphone.crypto.sha256 || function (s) {

    var chrsz = 8;
    var hexcase = 0;

    function safeAdd(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    function S(X, n) { return (X >>> n) | (X << (32 - n)); }
    function R(X, n) { return (X >>> n); }
    function Ch(x, y, z) { return ((x & y) ^ ((~x) & z)); }
    function Maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)); }
    function Sigma0256(x) { return (S(x, 2) ^ S(x, 13) ^ S(x, 22)); }
    function Sigma1256(x) { return (S(x, 6) ^ S(x, 11) ^ S(x, 25)); }
    function Gamma0256(x) { return (S(x, 7) ^ S(x, 18) ^ R(x, 3)); }
    function Gamma1256(x) { return (S(x, 17) ^ S(x, 19) ^ R(x, 10)); }

    function coreSha256(m, l) {
        var K = new Array(0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0xFC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x6CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2);
        var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
        var W = new Array(64);
        var a, b, c, d, e, f, g, h, i, j;
        var T1, T2;

        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;

        for (var i = 0; i < m.length; i += 16) {
            a = HASH[0];
            b = HASH[1];
            c = HASH[2];
            d = HASH[3];
            e = HASH[4];
            f = HASH[5];
            g = HASH[6];
            h = HASH[7];

            for (var j = 0; j < 64; j++) {
                if (j < 16) W[j] = m[j + i];
                else W[j] = safeAdd(safeAdd(safeAdd(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);

                T1 = safeAdd(safeAdd(safeAdd(safeAdd(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
                T2 = safeAdd(Sigma0256(a), Maj(a, b, c));

                h = g;
                g = f;
                f = e;
                e = safeAdd(d, T1);
                d = c;
                c = b;
                b = a;
                a = safeAdd(T1, T2);
            }

            HASH[0] = safeAdd(a, HASH[0]);
            HASH[1] = safeAdd(b, HASH[1]);
            HASH[2] = safeAdd(c, HASH[2]);
            HASH[3] = safeAdd(d, HASH[3]);
            HASH[4] = safeAdd(e, HASH[4]);
            HASH[5] = safeAdd(f, HASH[5]);
            HASH[6] = safeAdd(g, HASH[6]);
            HASH[7] = safeAdd(h, HASH[7]);
        }
        return HASH;
    }

    function str2binb(str) {
        var bin = Array();
        var mask = (1 << chrsz) - 1;
        for (var i = 0; i < str.length * chrsz; i += chrsz) {
            bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
        }
        return bin;
    }

    function Utf8Encode(string) {
        string = string.replace(/\r\n/g, "\n");
        return unescape(encodeURIComponent(string));
    };

    function binb2hex(binarray) {
        var hexTab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
        var str = "";
        for (var i = 0; i < binarray.length * 4; i++) {
            str += hexTab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
            hexTab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
        }
        return str;
    }

    s = Utf8Encode(s);
    return binb2hex(coreSha256(str2binb(s), s.length * chrsz));
}

innovaphone.crypto.rc4Bytes = innovaphone.crypto.rc4Bytes || function (keyBytes, strBytes) {
    var s = [], j = 0, x, res = '';
    for (var i = 0; i < 256; i++) {
        s[i] = i;
    }
    for (i = 0; i < 256; i++) {
        j = (j + s[i] + keyBytes[i % keyBytes.length]) % 256;
        x = s[i];
        s[i] = s[j];
        s[j] = x;
    }
    i = 0;
    j = 0;
    for (var y = 0; y < strBytes.length; y++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        x = s[i];
        s[i] = s[j];
        s[j] = x;
        res += String.fromCharCode(strBytes[y] ^ s[(s[i] + s[j]) % 256]);
    }
    return res;
}

innovaphone.crypto.str2hex = innovaphone.crypto.str2hex || function (input) {
    function d2h(d) { var r = d.toString(16); if (r.length < 2) r = "0" + r; return r; }
    var tmp = input;
    var str = '';
    for (var i = 0; i < tmp.length; i++) {
        var c = tmp.charCodeAt(i);
        str += d2h(c);
    }
    return str;
}

innovaphone.crypto.hex2bin = innovaphone.crypto.hex2bin || function (input) {
    var hex = input.toString();
    var arr = [];
    for (var i = 0; i < hex.length; i += 2) {
        arr.push(parseInt(hex.substr(i, 2), 16));
    }
    return arr;
}

innovaphone.crypto.randomString = innovaphone.crypto.randomString || function (length) {
    var characters = "0123456789abcdefghijklmnopqrstuvwABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var result = "";
    for (var i = 0; i < length; i++) result += characters.charAt(Math.round(Math.random() * (characters.length - 1)));
    return result;
}
