var assert = require("assert");
var Scheduler = require("../service/scheduler/scheduler.js").Scheduler;

var originalSetTimeout = global.setTimeout;
var originalClearTimeout = global.clearTimeout;
var originalTimers = global.Timers;
var scheduledCallback;
var timerId = 0;
var clearedTimer;
var runCount = 0;

global.setTimeout = undefined;
global.clearTimeout = undefined;
global.Timers = {
    setTimeout: function (callback, delay) {
        assert.strictEqual(delay, 900000);
        scheduledCallback = callback;
        timerId++;
        return timerId;
    },
    clearTimeout: function (id) {
        clearedTimer = id;
    }
};

try {
    var scheduler = new Scheduler(15 * 60 * 1000);
    scheduler.start(function () {
        runCount++;
    });

    assert.strictEqual(runCount, 1);
    assert.strictEqual(typeof scheduledCallback, "function");

    var nextRun = scheduledCallback;
    scheduledCallback = null;
    nextRun();

    assert.strictEqual(runCount, 2);
    assert.strictEqual(typeof scheduledCallback, "function");

    scheduler.stop();
    assert.strictEqual(clearedTimer, 2);

    console.log("App Platform scheduler timer tests passed");
}
finally {
    if (originalSetTimeout === undefined) {
        delete global.setTimeout;
    }
    else {
        global.setTimeout = originalSetTimeout;
    }

    if (originalClearTimeout === undefined) {
        delete global.clearTimeout;
    }
    else {
        global.clearTimeout = originalClearTimeout;
    }

    if (originalTimers === undefined) {
        delete global.Timers;
    }
    else {
        global.Timers = originalTimers;
    }
}
