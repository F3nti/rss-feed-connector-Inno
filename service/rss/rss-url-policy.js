function parseIpv4(address) {
    var parts = address.split(".");
    if (parts.length !== 4) {
        return null;
    }

    var octets = [];
    for (var i = 0; i < parts.length; i++) {
        if (!/^(0|[1-9][0-9]{0,2})$/.test(parts[i])) {
            return null;
        }
        var octet = Number(parts[i]);
        if (octet > 255) {
            return null;
        }
        octets.push(octet);
    }
    return octets;
}

function isPublicIpv4(octets) {
    var first = octets[0];
    var second = octets[1];
    var third = octets[2];

    if (first === 0 || first === 10 || first === 127 || first >= 224 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 0 && (third === 0 || third === 2)) ||
        (first === 192 && second === 168) ||
        (first === 192 && second === 88 && third === 99) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113)) {
        return false;
    }
    return true;
}

function parseIpv6(address) {
    if (typeof address !== "string" || !address || address.indexOf("%") !== -1) {
        return null;
    }

    var normalized = address.toLowerCase();
    var doubleColon = normalized.indexOf("::");
    if (doubleColon !== normalized.lastIndexOf("::")) {
        return null;
    }

    if (normalized.indexOf(".") !== -1) {
        var lastColon = normalized.lastIndexOf(":");
        if (lastColon === -1) {
            return null;
        }
        var ipv4 = parseIpv4(normalized.substring(lastColon + 1));
        if (!ipv4) {
            return null;
        }
        var high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
        var low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
        normalized = normalized.substring(0, lastColon + 1) + high + ":" + low;
        doubleColon = normalized.indexOf("::");
    }

    var groups;
    if (doubleColon !== -1) {
        var left = normalized.substring(0, doubleColon);
        var right = normalized.substring(doubleColon + 2);
        var leftGroups = left ? left.split(":") : [];
        var rightGroups = right ? right.split(":") : [];
        var missingGroups = 8 - leftGroups.length - rightGroups.length;
        if (missingGroups < 1) {
            return null;
        }
        var zeroGroups = [];
        for (var i = 0; i < missingGroups; i++) {
            zeroGroups.push("0");
        }
        groups = leftGroups.concat(zeroGroups, rightGroups);
    }
    else {
        groups = normalized.split(":");
        if (groups.length !== 8) {
            return null;
        }
    }

    if (groups.length !== 8) {
        return null;
    }
    for (var i = 0; i < groups.length; i++) {
        if (!/^[0-9a-f]{1,4}$/.test(groups[i])) {
            return null;
        }
        groups[i] = parseInt(groups[i], 16);
    }
    return groups;
}

function isPublicIpv6(groups) {
    if (!groups) {
        return false;
    }

    if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
        groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
        return isPublicIpv4([
            groups[6] >> 8,
            groups[6] & 255,
            groups[7] >> 8,
            groups[7] & 255
        ]);
    }

    if (groups[0] < 0x2000 || groups[0] >= 0x4000) {
        return false;
    }
    if (groups[0] === 0x2001 && groups[1] <= 0x01ff) {
        return false;
    }
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) {
        return false;
    }
    if (groups[0] === 0x2002) {
        return false;
    }
    if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) {
        return false;
    }
    return true;
}

function isPublicAddress(address) {
    var ipv4 = parseIpv4(address);
    if (ipv4) {
        return isPublicIpv4(ipv4);
    }
    if (typeof address === "string" && address.indexOf(":") !== -1) {
        return isPublicIpv6(parseIpv6(address));
    }
    return false;
}

function parseFeedUrl(url) {
    if (typeof url !== "string" || !url || url.length > 2048 ||
        /[\u0000-\u0020\u007f\\]/.test(url)) {
        throw new Error("Feed URL must be a valid HTTP or HTTPS URL");
    }

    var match = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url);
    if (!match || match[2].indexOf("@") !== -1 || match[2].indexOf("%") !== -1) {
        throw new Error("Feed URL must be a valid HTTP or HTTPS URL without credentials");
    }

    var authority = match[2];
    var host;
    var port;
    var ipv6Match;
    var authorityMatch;
    if (authority.charAt(0) === "[") {
        ipv6Match = /^\[([^\]]+)\](?::([0-9]+))?$/.exec(authority);
        if (!ipv6Match || !parseIpv6(ipv6Match[1])) {
            throw new Error("Feed URL has an invalid IP address");
        }
        host = ipv6Match[1].toLowerCase();
        port = ipv6Match[2];
    }
    else {
        authorityMatch = /^([^:]+)(?::([0-9]+))?$/.exec(authority);
        if (!authorityMatch) {
            throw new Error("Feed URL has an invalid host or port");
        }
        host = authorityMatch[1].toLowerCase();
        port = authorityMatch[2];
    }

    if (port && (Number(port) < 1 || Number(port) > 65535)) {
        throw new Error("Feed URL has an invalid port");
    }

    if (host.charAt(host.length - 1) === ".") {
        host = host.substring(0, host.length - 1);
    }
    if (!host) {
        throw new Error("Feed URL must include a host");
    }

    var ipLiteral = host.indexOf(":") !== -1 || !!parseIpv4(host);
    if (host.indexOf(":") === -1) {
        if (/^(?:(?:0x[0-9a-f]+)|[0-9]+)(?:\.(?:(?:0x[0-9a-f]+)|[0-9]+))*$/i.test(host)) {
            if (!parseIpv4(host)) {
                throw new Error("Feed URL has an invalid IP address");
            }
        }
        else if (host.length > 253 ||
            !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host)) {
            throw new Error("Feed URL has an invalid host name");
        }
    }

    if (ipLiteral && !isPublicAddress(host)) {
        throw new Error("Feed URL must not target a non-public IP address");
    }

    return {
        hostname: host,
        isIpLiteral: ipLiteral
    };
}

function validateDestination(url, onSuccess, onError) {
    if (typeof onSuccess !== "function" || typeof onError !== "function") {
        throw new Error("Feed URL validation callbacks are required");
    }

    var parsed;
    try {
        parsed = parseFeedUrl(url);
    }
    catch (error) {
        onError(error.message || String(error));
        return;
    }

    if (parsed.isIpLiteral) {
        onSuccess();
        return;
    }
    if (typeof Dns === "undefined" || !Dns ||
        typeof Dns.getHostByName !== "function") {
        onError("DNS validation is not available");
        return;
    }

    try {
        var request = Dns.getHostByName(parsed.hostname, true, 5000);
        if (!request || typeof request.onresult !== "function") {
            onError("DNS validation returned an unsupported request");
            return;
        }
        request.onresult(function (hostName, results) {
            if (Object.prototype.toString.call(results) !== "[object Array]" ||
                results.length === 0) {
                onError("Feed host could not be resolved");
                return;
            }

            for (var i = 0; i < results.length; i++) {
                if (!results[i] || typeof results[i].addr !== "string" ||
                    !isPublicAddress(results[i].addr)) {
                    onError("Feed host resolves to a non-public IP address");
                    return;
                }
            }
            onSuccess();
        });
    }
    catch (error) {
        onError(error.message || String(error));
    }
}

var RssUrlPolicy = {
    parse: parseFeedUrl,
    isPublicAddress: isPublicAddress,
    validateDestination: validateDestination
};

if (typeof module !== "undefined") {
    module.exports = RssUrlPolicy;
}
