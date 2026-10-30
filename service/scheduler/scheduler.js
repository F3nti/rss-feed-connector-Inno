    function Scheduler(configuredIntervalMs) {
        var running = false;
        var intervalMs = typeof configuredIntervalMs === "number" && configuredIntervalMs > 0
            ? configuredIntervalMs
            : 15 * 60 * 1000;
        var timeoutHandle = null;
        var scheduledCallback = null;

        this.start = function(callback) {
            if (typeof callback !== "function") {
                throw new Error("Scheduler callback must be a function");
            }
            if (running) {
                schedulerLog("Scheduler läuft bereits");
                return;
            }

            scheduledCallback = callback;
            running = true;
            schedulerLog(
                "Scheduler gestartet (" +
                (intervalMs / 1000) +
                " Sekunden)"
            );

            execute();
        };

        this.stop = function() {
            running = false;
            scheduledCallback = null;
            if (timeoutHandle !== null) {
                clearTimer(timeoutHandle);
                timeoutHandle = null;
            }
            schedulerLog("Scheduler gestoppt");
        };

        this.runNow = function(callback) {
            if (typeof callback !== "function") {
                throw new Error("Scheduler callback must be a function");
            }
            schedulerLog("Manueller Lauf gestartet");

            try {
                callback();
            }
            catch (e) {
                schedulerLog("Fehler im manuellen Lauf: " + e);
        }
        };

        function execute() {
            if (!running) {
                return;
            }

            try {
                var now = new Date();
                var timestamp = typeof now.toISOString === "function"
                    ? now.toISOString()
                    : now.toString();
                schedulerLog("RSS-Zyklus gestartet: " + timestamp);
                scheduledCallback();
            }
            catch (e) {
                schedulerLog("Scheduler Fehler: " + e);
            }

            if (running) {
                try {
                    timeoutHandle = setTimer(function () {
                        timeoutHandle = null;
                        execute();
                    }, intervalMs);
                }
                catch (error) {
                    running = false;
                    schedulerLog("Scheduler timer unavailable: " + error);
                }
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

        function clearTimer(timer) {
            if (typeof Timers !== "undefined" &&
                Timers && typeof Timers.clearTimeout === "function") {
                Timers.clearTimeout(timer);
                return;
            }
            if (typeof clearTimeout === "function") {
                clearTimeout(timer);
                return;
            }
            throw new Error("Timers.clearTimeout is not available");
        }

        function schedulerLog(message) {
            if (typeof log === "function") {
                log(message);
            }
            else if (typeof console !== "undefined" && typeof console.log === "function") {
                console.log(message);
            }
        }
    }

    if (typeof module !== "undefined") {
        module.exports = {
            Scheduler: Scheduler
        };
    }