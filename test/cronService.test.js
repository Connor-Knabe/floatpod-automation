'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function stubModule(modulePath, exports) {
    const original = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
        children: [],
        paths: []
    };

    return () => {
        if (original) {
            require.cache[modulePath] = original;
        } else {
            delete require.cache[modulePath];
        }
    };
}

function flushAsyncWork() {
    return new Promise(resolve => setImmediate(resolve));
}

test('an empty status response keeps the device scheduled for retry', async t => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const originalSigintListeners = new Set(process.listeners('SIGINT'));
    const scheduledTimers = [];
    const debugLogs = [];

    global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, cleared: false };
        scheduledTimers.push(timer);
        return timer;
    };
    global.clearTimeout = timer => {
        if (timer) {
            timer.cleared = true;
        }
    };

    let cronJob;
    class FakeCronJob {
        constructor(_schedule, onTick) {
            this.onTick = onTick;
            cronJob = this;
        }

        start() {}
        stop() {}
    }

    const cronPath = require.resolve('cron');
    const checkServicePath = require.resolve('../checkService.js');
    const cronServicePath = require.resolve('../cronService.js');
    const restoreCron = stubModule(cronPath, { CronJob: FakeCronJob });
    const restoreCheckService = stubModule(checkServicePath, () => ({
        checkFloatStatus: async () => {}
    }));

    t.after(() => {
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
        restoreCron();
        restoreCheckService();
        delete require.cache[cronServicePath];
        for (const listener of process.listeners('SIGINT')) {
            if (!originalSigintListeners.has(listener)) {
                process.removeListener('SIGINT', listener);
            }
        }
    });

    let statusRequestCount = 0;
    let resolveRetryStatus;
    const got = {
        post: async (_url, request) => {
            assert.equal(request.form.command, 'get_session_status');
            statusRequestCount += 1;
            if (statusRequestCount === 3) {
                return new Promise(resolve => {
                    resolveRetryStatus = resolve;
                });
            }
            return { body: JSON.stringify({ msg: 'null' }) };
        },
        get: async () => {}
    };
    const logger = {
        debug: message => debugLogs.push(message),
        info: () => {},
        warn: () => {},
        error: () => {}
    };
    const options = {
        apiKey: 'test-key',
        debugOvernightSessionCancel: false,
        floatDevices: {
            'Dream Pod 1': {
                url: 'http://pod1.invalid/api',
                healthCheckUrl: 'http://health.invalid/pod1',
                minutesInSession: 0,
                status: null,
                silentStatus: null
            }
        }
    };

    const startCronService = require(cronServicePath);
    startCronService(options, got, logger, {});
    await flushAsyncWork();

    assert.equal(scheduledTimers.length, 1, 'empty status should schedule a retry');
    assert.equal(scheduledTimers[0].delay, 60_000);

    scheduledTimers[0].callback();
    assert.ok(resolveRetryStatus, 'retry should request status again');

    await cronJob.onTick();
    assert.ok(
        debugLogs.some(message => message.includes('check already in progress, skipping')),
        'a fired timer should no longer hide the active check from the cron watchdog'
    );

    resolveRetryStatus({ body: JSON.stringify({ msg: 'null' }) });
    await flushAsyncWork();

    assert.equal(scheduledTimers.length, 2, 'another empty status should remain retryable');
    assert.equal(scheduledTimers[1].delay, 120_000);
});
