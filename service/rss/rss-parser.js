function parse(xml) {
    if (typeof xml !== "string" || !xml.trim()) {
        throw new Error("RSS XML must be a non-empty string");
    }

    xml = xml.replace(/^\uFEFF/, "");
    var documentNode = { name: "#document", attributes: {}, children: [] };
    var stack = [documentNode];
    var position = 0;

    while (position < xml.length) {
        if (xml.charAt(position) !== "<") {
            var textEnd = xml.indexOf("<", position);
            if (textEnd === -1) {
                textEnd = xml.length;
            }

            var text = decodeEntities(xml.substring(position, textEnd));
            if (stack.length === 1 && text.trim()) {
                throw new Error(firstElement(documentNode)
                    ? "Non-whitespace text found after the XML root element at offset " + position +
                        " (leading character codes: " + characterCodes(text) + ")"
                    : "Non-whitespace text found before the XML root element at offset " + position +
                        " (leading character codes: " + characterCodes(text) + ")");
            }
            stack[stack.length - 1].children.push(text);
            position = textEnd;
            continue;
        }

        if (xml.substr(position, 4) === "<!--") {
            position = skipUntil(xml, position + 4, "-->");
            continue;
        }

        if (xml.substr(position, 9) === "<![CDATA[") {
            if (stack.length === 1) {
                throw new Error("CDATA section found outside the XML root element");
            }

            var cdataEnd = xml.indexOf("]]>", position + 9);
            if (cdataEnd === -1) {
                throw new Error("Unterminated CDATA section");
            }
            stack[stack.length - 1].children.push(xml.substring(position + 9, cdataEnd));
            position = cdataEnd + 3;
            continue;
        }

        if (xml.substr(position, 2) === "<?") {
            position = skipUntil(xml, position + 2, "?>");
            continue;
        }

        if (/^<!DOCTYPE\b/i.test(xml.substring(position))) {
            position = skipDoctype(xml, position);
            continue;
        }

        if (xml.substr(position, 2) === "</") {
            var closeEnd = xml.indexOf(">", position + 2);
            if (closeEnd === -1) {
                throw new Error("Unterminated XML closing tag");
            }

            var closeName = xml.substring(position + 2, closeEnd).trim();
            if (stack.length === 1 || stack[stack.length - 1].name !== closeName) {
                throw new Error("Unexpected XML closing tag: " + closeName);
            }

            stack.pop();
            position = closeEnd + 1;
            continue;
        }

        var tagEnd = findTagEnd(xml, position + 1);
        if (tagEnd === -1) {
            throw new Error("Unterminated XML opening tag");
        }

        var tagContents = xml.substring(position + 1, tagEnd);
        var selfClosing = /\/\s*$/.test(tagContents);
        if (selfClosing) {
            tagContents = tagContents.replace(/\/\s*$/, "");
        }

        var parsedTag = parseOpeningTag(tagContents);
        if (stack.length === 1 && firstElement(documentNode)) {
            throw new Error("XML document has more than one root element");
        }

        var node = {
            name: parsedTag.name,
            attributes: parsedTag.attributes,
            children: []
        };
        stack[stack.length - 1].children.push(node);

        if (!selfClosing) {
            stack.push(node);
        }
        position = tagEnd + 1;
    }

    if (stack.length !== 1) {
        throw new Error("Unclosed XML element: " + stack[stack.length - 1].name);
    }

    var root = firstElement(documentNode);
    if (!root) {
        throw new Error("XML document has no root element");
    }

    var rootName = localName(root.name);
    var entries;
    if (rootName === "rss") {
        var channel = firstChild(root, "channel");
        entries = channel ? childrenNamed(channel, "item") : [];
    }
    else if (rootName === "feed") {
        entries = childrenNamed(root, "entry");
    }
    else {
        throw new Error("Unsupported feed root element: " + rootName);
    }

    return entries.map(function (entry) {
        var link = firstChild(entry, "link");
        var linkValue = link ? link.attributes.href : "";
        if (!linkValue && link) {
            linkValue = nodeText(link);
        }

        if (rootName === "feed" && link && linkValue) {
            var alternateLink = childrenNamed(entry, "link").filter(function (candidate) {
                return !candidate.attributes.rel || candidate.attributes.rel === "alternate";
            })[0];
            if (alternateLink) {
                linkValue = alternateLink.attributes.href || nodeText(alternateLink);
            }
        }

        var title = firstChild(entry, "title");
        var guid = firstChild(entry, rootName === "feed" ? "id" : "guid");
        var description = rootName === "feed"
            ? firstChild(entry, "content") || firstChild(entry, "summary")
            : firstChild(entry, "encoded") || firstChild(entry, "description");
        var published = firstChild(entry, "published") ||
            firstChild(entry, "pubDate") ||
            firstChild(entry, "updated");

        return {
            title: title ? nodeText(title).trim() : "",
            link: linkValue ? linkValue.trim() : "",
            guid: guid ? nodeText(guid).trim() : (linkValue ? linkValue.trim() : ""),
            description: description ? nodeText(description).trim() : "",
            published: published ? nodeText(published).trim() : ""
        };
    });
}

function characterCodes(text) {
    var codes = [];
    var length = Math.min(text.length, 16);
    for (var i = 0; i < length; i++) {
        codes.push("0x" + text.charCodeAt(i).toString(16).toUpperCase());
    }
    return codes.join(" ");
}

function skipUntil(xml, start, terminator) {
    var end = xml.indexOf(terminator, start);
    if (end === -1) {
        throw new Error("Unterminated XML declaration or comment");
    }
    return end + terminator.length;
}

function skipDoctype(xml, start) {
    var bracketDepth = 0;
    var quote = "";

    for (var i = start + 9; i < xml.length; i++) {
        var character = xml.charAt(i);
        if (quote) {
            if (character === quote) {
                quote = "";
            }
        }
        else if (character === "\"" || character === "'") {
            quote = character;
        }
        else if (character === "[") {
            bracketDepth++;
        }
        else if (character === "]") {
            bracketDepth--;
        }
        else if (character === ">" && bracketDepth === 0) {
            return i + 1;
        }
    }

    throw new Error("Unterminated DOCTYPE declaration");
}

function findTagEnd(xml, start) {
    var quote = "";
    for (var i = start; i < xml.length; i++) {
        var character = xml.charAt(i);
        if (quote) {
            if (character === quote) {
                quote = "";
            }
        }
        else if (character === "\"" || character === "'") {
            quote = character;
        }
        else if (character === ">") {
            return i;
        }
    }
    return -1;
}

function parseOpeningTag(contents) {
    var nameMatch = /^\s*([^\s/>]+)/.exec(contents);
    if (!nameMatch) {
        throw new Error("Invalid XML opening tag");
    }

    var attributes = {};
    var remainder = contents.substring(nameMatch[0].length);
    var attributePattern = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    var consumed = 0;
    var match;

    while ((match = attributePattern.exec(remainder))) {
        if (remainder.substring(consumed, match.index).trim()) {
            throw new Error("Invalid XML attribute in element: " + nameMatch[1]);
        }
        attributes[match[1]] = decodeEntities(match[2] !== undefined ? match[2] : match[3]);
        consumed = attributePattern.lastIndex;
    }

    if (remainder.substring(consumed).trim()) {
        throw new Error("Invalid XML attribute in element: " + nameMatch[1]);
    }

    return { name: nameMatch[1], attributes: attributes };
}

function decodeEntities(value) {
    return value.replace(/&(?:([a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);)?/gi, function (entity, name) {
        if (!name) {
            return "&";
        }

        if (name === "amp") return "&";
        if (name === "lt") return "<";
        if (name === "gt") return ">";
        if (name === "quot") return "\"";
        if (name === "apos") return "'";

        var codePoint;
        if (/^#x[0-9a-f]+$/i.test(name)) {
            codePoint = parseInt(name.substring(2), 16);
        }
        else if (/^#[0-9]+$/.test(name)) {
            codePoint = parseInt(name.substring(1), 10);
        }
        else {
            return entity;
        }

        if (codePoint <= 0 || codePoint > 0x10ffff ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            throw new Error("Invalid XML character reference: &" + name + ";");
        }

        if (codePoint <= 0xffff) {
            return String.fromCharCode(codePoint);
        }

        codePoint -= 0x10000;
        return String.fromCharCode(
            0xd800 + (codePoint >> 10),
            0xdc00 + (codePoint & 0x3ff)
        );
    });
}

function firstElement(node) {
    for (var i = 0; i < node.children.length; i++) {
        if (typeof node.children[i] !== "string") {
            return node.children[i];
        }
    }
    return null;
}

function localName(name) {
    var separator = name.lastIndexOf(":");
    return separator === -1 ? name : name.substring(separator + 1);
}

function firstChild(node, name) {
    var matches = childrenNamed(node, name);
    return matches.length ? matches[0] : null;
}

function childrenNamed(node, name) {
    return node.children.filter(function (child) {
        return typeof child !== "string" && localName(child.name) === name;
    });
}

function nodeText(node) {
    var text = "";
    for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        text += typeof child === "string" ? child : nodeText(child);
    }
    return text;
}

var RssParser = { parse: parse };
if (typeof module !== "undefined") {
    module.exports = RssParser;
}
