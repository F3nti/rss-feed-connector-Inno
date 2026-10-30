var assert = require("assert");
var fs = require("fs");
var path = require("path");
var parser = require("../service/rss/rss-parser.js");

function readFixture(name) {
    return fs.readFileSync(path.join(__dirname, name), "utf8");
}

var rssEntries = parser.parse(readFixture("sample-rss.xml"));
assert.strictEqual(rssEntries.length, 2);
assert.deepStrictEqual(rssEntries[0], {
    title: "RSS & XML basics",
    link: "https://example.com/rss-item",
    guid: "rss-001",
    description: "<p>A &amp; B</p>",
    published: "Tue, 27 Oct 2026 10:00:00 GMT"
});
assert.strictEqual(rssEntries[1].guid, "https://example.com/rss-second");
assert.strictEqual(rssEntries[1].published, "");

var atomEntries = parser.parse(readFixture("sample-atom.xml"));
assert.strictEqual(atomEntries.length, 2);
assert.deepStrictEqual(atomEntries[0], {
    title: "Atom entry",
    link: "https://example.com/atom-entry",
    guid: "urn:example:atom-001",
    description: "Atom & XML summary",
    published: "2026-10-27T10:00:00Z"
});
assert.deepStrictEqual(atomEntries[1], {
    title: "Updated-only entry",
    link: "https://example.com/atom-updated",
    guid: "urn:example:atom-002",
    description: "<p>Content</p>",
    published: "2026-10-27T11:00:00Z"
});

var malformedEntityEntries = parser.parse(
    '<rss><channel><item>' +
    '<title>R&amp;D: A & B &nbsp; News &</title>' +
    '<link>https://example.com/feed?a=1&b=2</link>' +
    '<description>Unescaped & and unknown &copy; entity</description>' +
    '</item></channel></rss>'
);
assert.strictEqual(malformedEntityEntries[0].title, "R&D: A & B &nbsp; News &");
assert.strictEqual(malformedEntityEntries[0].link, "https://example.com/feed?a=1&b=2");
assert.strictEqual(
    malformedEntityEntries[0].description,
    "Unescaped & and unknown &copy; entity"
);

assert.throws(function () {
    parser.parse("<rss><channel></rss>");
}, /Unexpected XML closing tag/);
assert.throws(function () {
    parser.parse("<html></html>");
}, /Unsupported feed root element/);
assert.throws(function () {
    parser.parse("<rss/><feed/>");
}, /more than one root element/);
assert.throws(function () {
    parser.parse("<rss><channel><item><title>&#x110000;</title></item></channel></rss>");
}, /Invalid XML character reference/);
assert.throws(function () {
    parser.parse("Feed response: <rss><channel/></rss>");
}, /text found before the XML root element at offset 0 \(leading character codes: 0x46 0x65 0x65 0x64/);
assert.throws(function () {
    parser.parse("<rss><channel/></rss>feed response footer");
}, /text found after the XML root element at offset 21 \(leading character codes: 0x66 0x65 0x65 0x64/);
assert.doesNotThrow(function () {
    parser.parse("<rss><channel><item><title>A & B</title></item></channel></rss>");
});

console.log("RSS and Atom parser tests passed");
