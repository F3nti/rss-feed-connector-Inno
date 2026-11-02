function RssEntryRepository(database) {
    if (!database || typeof database.exec !== "function" ||
        typeof database.escape !== "function") {
        throw new Error("RssEntryRepository requires the App Platform Database API");
    }

    this.listKnown = function (feedId, candidateGuids, onSuccess, onError) {
        if (!isValidFeedId(feedId)) {
            throw new Error("RSS entry feed ID must be a positive integer");
        }
        requireCallbacks(onSuccess, onError);
        if (Object.prototype.toString.call(candidateGuids) !== "[object Array]") {
            throw new Error("RSS entry GUID candidates must be an array");
        }

        var candidates = [];
        var candidateSet = {};
        candidateGuids.forEach(function (guid) {
            if (typeof guid !== "string" || !guid.trim() || guid.length > 2048) {
                throw new Error("RSS entry GUID candidates must be non-empty strings up to 2048 characters");
            }
            var key = "$" + guid;
            if (!candidateSet[key]) {
                candidateSet[key] = true;
                candidates.push(guid);
            }
        });

        if (candidates.length === 0) {
            onSuccess([]);
            return;
        }

        var known = {};
        var nextCandidate = 0;
        var queryPrefix = "SELECT guid FROM rss_entries WHERE feed_id = " +
            feedId + " AND guid IN (";
        var maximumQueryLength = 8192;
        var maximumBatchCount = 100;

        function loadNextBatch() {
            var values = [];
            var queryLength = queryPrefix.length + 1;
            while (nextCandidate < candidates.length &&
                values.length < maximumBatchCount) {
                var escaped = database.escape(candidates[nextCandidate]);
                var value = "'" + escaped + "'";
                if (values.length > 0) {
                    value = ", " + value;
                }
                if (queryLength + value.length > maximumQueryLength) {
                    if (values.length === 0) {
                        onError("RSS entry GUID is too long to query safely");
                        return;
                    }
                    break;
                }
                values.push(value);
                queryLength += value.length;
                nextCandidate++;
            }

            execute(queryPrefix + values.join("") + ")", function (rows) {
                try {
                    if (Object.prototype.toString.call(rows) !== "[object Array]") {
                        throw new Error("Database returned an invalid RSS entry list");
                    }
                    rows.forEach(function (row) {
                        if (!row || typeof row.guid !== "string" || !row.guid) {
                            throw new Error("Database returned an invalid RSS entry GUID");
                        }
                        known["$" + row.guid] = true;
                    });
                    if (nextCandidate < candidates.length) {
                        loadNextBatch();
                        return;
                    }
                    onSuccess(candidates.filter(function (guid) {
                        return known["$" + guid] === true;
                    }));
                }
                catch (error) {
                    onError(error.message || String(error));
                }
            }, onError);
        }

        loadNextBatch();
    };

    this.hasEntries = function (feedId, onSuccess, onError) {
        if (!isValidFeedId(feedId)) {
            throw new Error("RSS entry feed ID must be a positive integer");
        }
        requireCallbacks(onSuccess, onError);

        execute(
            "SELECT guid FROM rss_entries WHERE feed_id = " + feedId + " LIMIT 1",
            function (rows) {
                if (Object.prototype.toString.call(rows) !== "[object Array]") {
                    onError("Database returned an invalid RSS entry existence result");
                    return;
                }
                onSuccess(rows.length > 0);
            },
            onError
        );
    };

    this.save = function (feedId, guid, onSuccess, onError) {
        if (!isValidFeedId(feedId)) {
            throw new Error("RSS entry feed ID must be a positive integer");
        }
        if (typeof guid !== "string" || !guid.trim()) {
            throw new Error("RSS entry GUID must be a non-empty string");
        }
        requireCallbacks(onSuccess, onError);

        execute(
            "INSERT INTO rss_entries (feed_id, guid) VALUES (" +
                feedId + ", '" + database.escape(guid.trim()) + "') RETURNING id",
            function (rows) {
                if (Object.prototype.toString.call(rows) !== "[object Array]" ||
                    rows.length !== 1 || typeof rows[0].id === "undefined") {
                    onError("Database did not return the saved RSS entry ID");
                    return;
                }
                onSuccess(Number(rows[0].id));
            },
            onError
        );
    };

    this.saveMany = function (feedId, guids, onSuccess, onError) {
        if (!isValidFeedId(feedId)) {
            throw new Error("RSS entry feed ID must be a positive integer");
        }
        requireCallbacks(onSuccess, onError);
        if (Object.prototype.toString.call(guids) !== "[object Array]") {
            throw new Error("RSS entry GUIDs must be an array");
        }
        if (typeof database.transaction !== "function") {
            onError("Database transactions are not available");
            return;
        }

        var candidates = [];
        var candidateSet = {};
        guids.forEach(function (guid) {
            if (typeof guid !== "string" || !guid.trim() || guid.length > 2048) {
                throw new Error("RSS entry GUIDs must be non-empty strings up to 2048 characters");
            }
            var normalizedGuid = guid.trim();
            var key = "$" + normalizedGuid;
            if (!candidateSet[key]) {
                candidateSet[key] = true;
                candidates.push(normalizedGuid);
            }
        });

        if (candidates.length === 0) {
            onSuccess();
            return;
        }

        var transaction;
        var transactionStarted = false;
        var finished = false;
        var batchIndex = 0;
        var batches = createBatches(candidates);
        try {
            transaction = database.transaction();
            transaction.begin().oncomplete(function () {
                transactionStarted = true;
                insertNextBatch();
            }).onerror(fail);
        }
        catch (error) {
            fail(error);
        }

        function createBatches(values) {
            var result = [];
            var batch = [];
            var prefix = "INSERT INTO rss_entries (feed_id, guid) VALUES ";
            var length = prefix.length;
            values.forEach(function (guid) {
                var escaped = "'" + database.escape(guid) + "'";
                var value = "(" + feedId + ", " + escaped + ")";
                var separator = batch.length > 0 ? ", " : "";
                if (batch.length > 0 &&
                    (batch.length >= 100 || length + separator.length + value.length > 8192)) {
                    result.push(batch);
                    batch = [];
                    length = prefix.length;
                    separator = "";
                }
                if (length + separator.length + value.length > 8192) {
                    throw new Error("RSS entry GUID is too long to save safely");
                }
                batch.push(value);
                length += separator.length + value.length;
            });
            if (batch.length > 0) {
                result.push(batch);
            }
            return result;
        }

        function insertNextBatch() {
            if (batchIndex >= batches.length) {
                try {
                    transaction.commit()
                        .oncomplete(function () {
                            finished = true;
                            onSuccess();
                        })
                        .onerror(fail);
                }
                catch (error) {
                    fail(error);
                }
                return;
            }

            var query = "INSERT INTO rss_entries (feed_id, guid) VALUES " +
                batches[batchIndex++].join(", ");
            try {
                transaction.exec(query)
                    .oncomplete(insertNextBatch)
                    .onerror(fail);
            }
            catch (error) {
                fail(error);
            }
        }

        function fail(error, errorText) {
            if (finished) {
                return;
            }
            finished = true;
            var message = errorText || error && error.message || error ||
                "Database operation failed";
            if (!transactionStarted) {
                onError(String(message));
                return;
            }

            try {
                transaction.rollback()
                    .oncomplete(function () {
                        onError(String(message));
                    })
                    .onerror(function (rollbackError, rollbackText) {
                        var rollbackMessage = rollbackText || rollbackError &&
                            rollbackError.message || rollbackError ||
                            "Database rollback failed";
                        onError(String(message) + "; rollback failed: " +
                            String(rollbackMessage));
                    });
            }
            catch (rollbackError) {
                onError(String(message) + "; rollback failed: " +
                    (rollbackError.message || String(rollbackError)));
            }
        }
    };

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

    function isValidFeedId(feedId) {
        return typeof feedId === "number" &&
            isFinite(feedId) &&
            Math.floor(feedId) === feedId &&
            feedId > 0;
    }

    function requireCallbacks(onSuccess, onError) {
        if (typeof onSuccess !== "function" || typeof onError !== "function") {
            throw new Error("RSS entry success and error callbacks are required");
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        RssEntryRepository: RssEntryRepository
    };
}
