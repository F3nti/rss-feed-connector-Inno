function HtmlBuilder() {
    var allowedTags = {
        a: true,
        b: true,
        blockquote: true,
        br: true,
        code: true,
        div: true,
        em: true,
        figcaption: true,
        figure: true,
        h1: true,
        h2: true,
        h3: true,
        h4: true,
        h5: true,
        h6: true,
        i: true,
        img: true,
        li: true,
        ol: true,
        p: true,
        pre: true,
        section: true,
        small: true,
        span: true,
        strong: true,
        sub: true,
        sup: true,
        u: true,
        ul: true
    };
    var voidTags = {
        br: true,
        img: true
    };
    var contentTags = {
        iframe: true,
        object: true,
        script: true,
        style: true,
        svg: true
    };

    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeHtmlText(value) {
        return String(value)
            .replace(/&(?!(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function escapeHtmlAttribute(value) {
        return escapeHtmlText(value)
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function safeUrl(value) {
        var url = String(value || "").trim();
        return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
    }

    function sanitizeAttributes(tag, attributes) {
        var output = "";
        var attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
        var match;

        while ((match = attributePattern.exec(attributes))) {
            var name = match[1].toLowerCase();
            var value = match[2] !== undefined
                ? match[2]
                : (match[3] !== undefined ? match[3] : match[4]);

            if (tag === "a" && name === "href") {
                var href = safeUrl(value);
                if (href) {
                    output += ' href="' + escapeHtmlAttribute(href) + '" rel="noopener noreferrer"';
                }
            }
            else if (tag === "img" && name === "src") {
                var src = safeUrl(value);
                if (src) {
                    output += ' src="' + escapeHtmlAttribute(src) + '"';
                }
            }
            else if ((name === "alt" || name === "title") &&
                (tag === "img" || tag === "a")) {
                output += " " + name + '="' + escapeHtmlAttribute(value) + '"';
            }
        }

        return output;
    }

    function sanitizeHtml(value) {
        var input = String(value).replace(
            /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi,
            function (match, attributes, content) {
                return /<img\b/i.test(content) ? content : match;
            }
        );
        var output = "";
        var openTags = [];
        var tokenPattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi;
        var suppressedTag = null;
        var suppressedDepth = 0;
        var match;

        while ((match = tokenPattern.exec(input))) {
            var token = match[0];
            var tagMatch = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([^>]*)>$/i.exec(token);
            if (!tagMatch) {
                if (!suppressedTag && token.substr(0, 4) !== "<!--") {
                    output += escapeHtmlText(token);
                }
                continue;
            }

            var closing = tagMatch[1] === "/";
            var tag = tagMatch[2].toLowerCase();
            var selfClosing = /\/\s*>$/.test(token) || voidTags[tag];

            if (suppressedTag) {
                if (tag === suppressedTag) {
                    if (closing) {
                        suppressedDepth--;
                        if (suppressedDepth === 0) {
                            suppressedTag = null;
                        }
                    }
                    else if (!selfClosing) {
                        suppressedDepth++;
                    }
                }
                continue;
            }

            if (contentTags[tag] && !closing) {
                suppressedTag = tag;
                suppressedDepth = selfClosing ? 0 : 1;
                if (selfClosing) {
                    suppressedTag = null;
                }
                continue;
            }

            if (!allowedTags[tag]) {
                continue;
            }

            if (closing) {
                var openIndex = openTags.lastIndexOf(tag);
                if (openIndex === -1) {
                    continue;
                }
                while (openTags.length > openIndex) {
                    output += "</" + openTags.pop() + ">";
                }
                continue;
            }

            output += "<" + tag + sanitizeAttributes(tag, tagMatch[3]) + ">";
            if (!voidTags[tag] && !selfClosing) {
                openTags.push(tag);
            }
        }

        while (openTags.length > 0) {
            output += "</" + openTags.pop() + ">";
        }
        return output;
    }

    this.build = function (entry) {
        if (!entry || typeof entry !== "object") {
            throw new Error("RSS entry is required to build message HTML");
        }

        var html = "<h3>" + escapeHtml(entry.title) + "</h3>";
        if (entry.description) {
            html += sanitizeHtml(entry.description);
        }

        if (entry.link) {
            var safeLink = String(entry.link);
            if (/^https?:\/\//i.test(safeLink)) {
                html += '<p><a href="' + escapeHtml(safeLink) +
                    '" target="_blank" rel="noopener noreferrer">Read more</a></p>';
            }
            else {
                html += "<p>" + escapeHtml(safeLink) + "</p>";
            }
        }

        if (entry.published) {
            html += "<small>" + escapeHtml(entry.published) + "</small>";
        }

        return html;
    };
}

if (typeof module !== "undefined") {
    module.exports = {
        HtmlBuilder: HtmlBuilder
    };
}