function RssFeedRepository(database) {
    if (!database || typeof database.exec !== "function" ||
        typeof database.escape !== "function") {
        throw new Error("RssFeedRepository requires the App Platform Database API");
    }

    this.list = function (onSuccess, onError) {
        execute(
            "SELECT id, name, url, topic, tags, interval_minutes, enabled " +
            "FROM rss_feeds ORDER BY id",
            function (rows) {
                try {
                    if (Object.prototype.toString.call(rows) !== "[object Array]") {
                        throw new Error("Database returned an invalid feed list");
                    }
                    onSuccess(rows.map(parseRow));
                }
                catch (error) {
                    onError(error.message || String(error));
                }
            },
            onError
        );
    };

    this.save = function (feed, onSuccess, onError) {
        var values = [
            sqlString(feed.name),
            sqlString(feed.url),
            sqlString(feed.topic),
            sqlString(JSON.stringify(feed.tags)),
            String(feed.intervalMinutes),
            feed.enabled ? "TRUE" : "FALSE"
        ];
        var query;

        if (feed.id === null) {
            query = "INSERT INTO rss_feeds " +
                "(name, url, topic, tags, interval_minutes, enabled) VALUES (" +
                values.join(", ") + ") RETURNING id";
        }
        else {
            query = "UPDATE rss_feeds SET name = " + values[0] +
                ", url = " + values[1] +
                ", topic = " + values[2] +
                ", tags = " + values[3] +
                ", interval_minutes = " + values[4] +
                ", enabled = " + values[5] +
                " WHERE id = " + feed.id +
                " RETURNING id";
        }

        execute(query, function (rows) {
            if (Object.prototype.toString.call(rows) !== "[object Array]" ||
                rows.length !== 1 || typeof rows[0].id === "undefined") {
                onError("Database did not return the saved feed ID");
                return;
            }
            onSuccess(Number(rows[0].id));
        }, onError);
    };

    this.remove = function (id, onSuccess, onError) {
        execute(
            "DELETE FROM rss_feeds WHERE id = " + id + " RETURNING id",
            function (rows) {
                if (Object.prototype.toString.call(rows) !== "[object Array]" ||
                    rows.length > 1) {
                    onError("Database returned an invalid feed delete result");
                    return;
                }
                onSuccess(rows.length === 1);
            },
            onError
        );
    };

    function sqlString(value) {
        return "'" + database.escape(value) + "'";
    }

    function execute(query, onSuccess, onError) {
        try {
            database.exec(query)
                .oncomplete(onSuccess)
                .onerror(function (error, errorText) {
                    onError(errorText || error || "Database operation failed");
                });
        }
        catch (error) {
            onError(error.message || String(error));
        }
    }

    function parseRow(row) {
        var tags;
        try {
            tags = JSON.parse(row.tags);
        }
        catch (error) {
            throw new Error("Stored feed tags are invalid for feed " + row.id);
        }
        if (Object.prototype.toString.call(tags) !== "[object Array]") {
            throw new Error("Stored feed tags are invalid for feed " + row.id);
        }

        return {
            id: Number(row.id),
            name: row.name,
            url: row.url,
            topic: row.topic,
            tags: tags,
            intervalMinutes: Number(row.interval_minutes),
            enabled: row.enabled === true || row.enabled === "true"
        };
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        RssFeedRepository: RssFeedRepository
    };
}
