module.exports = function(options, got, logger, lightFanService, getLastWebhookUpdate, getLastSessionEndTime, setLastSessionEndTime) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    const { formatChicagoTime: formatChicagoTimeBase } = require('./timeUtils.js');
    const debugOvernightSessionCancel = options.debugOvernightSessionCancel === true;
    
    // Track the last time any session ended (for rolling 1-hour fast polling window)
    let lastSessionEndTime = 0;
    
    // Track when the service started for initial fast polling
    const serviceStartTime = Date.now();
    const deviceIntervals = {};
    const sessionEndTimeouts = {};
    const outOfSessionChecks = {};
    const deviceErrorCounts = {};

    const deviceLocks = {};

    function formatChicagoTime(date) {
        return formatChicagoTimeBase(date, { hour12: false });
    }
    
    function isNightTime() {
        const now = new Date();
        const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hours = chicagoTime.getHours();
        // Check if current time is between 10 PM (22) and 8 AM (8)
        return hours >= 22 || hours < 8;
    }

    function isOvernightCancelWindow() {
        if (debugOvernightSessionCancel) {
            return true;
        }
        const now = new Date();
        const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hours = chicagoTime.getHours();
        return hours >= 0 && hours < 1;
    }
    
    function isTuesdayOrWednesday() {
        const now = new Date();
        const chicagoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const day = chicagoTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        return day === 2 || day === 3; // 2 = Tuesday, 3 = Wednesday
    }
    
    function shouldUseFastPolling() {
        // Check if we're within 1 hour of service start
        if (Date.now() - serviceStartTime < 60 * 60 * 1000) {
            logger.debug('Using fast polling (first hour after boot)');
            return true;
        }
        
        // Check if we're within 1 hour of the last session end (rolling window)
        if (Date.now() - lastSessionEndTime < 60 * 60 * 1000) {
            logger.debug('Using fast polling (within 1hr of last session end)');
            return true;
        }
        
        // Check for recent webhook updates (within 2 hours)
        const lastWebhookUpdate = getLastWebhookUpdate ? getLastWebhookUpdate() : null;
        if (lastWebhookUpdate) {
            const twoHoursAgo = Date.now() - (120 * 60 * 1000);
            if (lastWebhookUpdate > twoHoursAgo) {
                logger.debug('Using fast polling (recent webhook update)');
                return true;
            }
        }
        
        return false;
    }
    
    function scheduleDeviceCheck(key, delayMs) {
        clearTimeout(deviceIntervals[key]);
        deviceIntervals[key] = setTimeout(() => {
            // A fired Timeout object stays truthy, so clear our reference before
            // checking. This lets the cron watchdog detect an unscheduled device.
            deviceIntervals[key] = null;
            checkDevice(key);
        }, delayMs);
    }

    // Failed devices retry with capped exponential backoff (1m → 2m → 4m → 8m → 15m)
    // instead of hammering a dead endpoint every 60s, and log the message only — a
    // full got error object serializes to ~40 lines of timings per failure.
    function scheduleErrorRetry(key, stage, ex) {
        deviceErrorCounts[key] = (deviceErrorCounts[key] || 0) + 1;
        const attempt = deviceErrorCounts[key];
        const delayMs = Math.min(15 * 60 * 1000, 60 * 1000 * 2 ** Math.min(attempt - 1, 4));
        logger.error(`${key}: ${stage} failed (attempt ${attempt}): ${ex.message} - retrying in ${Math.round(delayMs / 1000)}s`);
        scheduleDeviceCheck(key, delayMs);
    }

    async function checkDevice(key) {
        if (deviceLocks[key]) {
            logger.debug(`${key}: check already in progress, skipping`);
            return;
        }
        deviceLocks[key] = true;
        const floatDevice = options.floatDevices[key];
        const startTime = Date.now();
        logger.debug(`=== Starting check for ${key} at ${formatChicagoTime(new Date())} (Chicago) ===`);

        try {
            // Log before making API call
            logger.debug(`${key}: Making API call to get session status`);
            
            // Make the API call to get session status
            const data = await got.post(floatDevice.url, {
                form: {
                    "api_key": options.apiKey,
                    "command":"get_session_status"
                },
                timeout: 5000 // 5 second timeout for API call
            });

            try {
                let floatStatus = data ? JSON.parse(data.body) : null;
                floatStatus = floatStatus ? JSON.parse(floatStatus.msg) : null;
                
                if (floatStatus) {
                    let durationText = 'N/A';
                    if (floatStatus.duration !== undefined && floatStatus.duration !== null) {
                        const durationSeconds = parseInt(floatStatus.duration, 10);
                        if (!isNaN(durationSeconds)) {
                            const minutes = Math.floor(durationSeconds / 60);
                            const seconds = durationSeconds % 60;
                            durationText = `${minutes}m ${seconds}s`;
                        }
                    }
                    logger.debug(`${key}: Session status - Status: ${floatStatus.status || 'N/A'}, Duration: ${durationText}`);
                    
                    // Get silence status in parallel
                    logger.debug(`${key}: Getting silence status`);
                    const silentData = await got.post(floatDevice.url, {
                        form: {
                            "api_key": options.apiKey,
                            "command":"get_silence_status"
                        },
                        timeout: 5000
                    });
                    
                    let silentStatus = null;
                    try {
                        silentStatus = silentData ? JSON.parse(silentData.body) : null;
                        silentStatus = silentStatus ? silentStatus.msg : null;
                        logger.debug(`${key}: Silence status: ${silentStatus}`);
                    } catch (ex) {
                        logger.error(`${key}: failed to parse silent status response: ${ex.message}`);
                    }
                    
                    // Log session details before processing
                    if (floatDevice.sessionEndTime) {
                        const now = new Date();
                        const timeUntilEnd = floatDevice.sessionEndTime - now;
                        const minsUntilEnd = Math.ceil(timeUntilEnd / (60 * 1000));
                        logger.debug(`${key}: Session end time: ${formatChicagoTime(floatDevice.sessionEndTime)} (Chicago)`);
                        logger.debug(`${key}: Time until session end: ${minsUntilEnd} minutes`);
                    }

                    // Process the status update
                    const previousStatus = floatDevice.status;
                    const timeUntilEndMs =
                        floatDevice.sessionEndTime?.getTime() - Date.now();
                    if (
                        floatStatus.status === 0 &&
                        previousStatus === 3 &&
                        floatDevice.sessionEndTime &&
                        timeUntilEndMs > 0 &&
                        timeUntilEndMs <= 10 * 60 * 1000
                    ) {
                        const minsUntilEnd = Math.ceil(timeUntilEndMs / 60000);
                        logger.warn(
                            `${key}: Received idle status but session end time ${formatChicagoTime(floatDevice.sessionEndTime)} is within ${minsUntilEnd} minutes - assuming session still active`
                        );
                        floatStatus.status = 3;
                    }

                    // Refresh the fast-poll window only on an actual session end
                    // (3 → non-3). The old check ran every poll while an end time was
                    // merely set, renewing the window forever and logging a bogus
                    // "Session ended" each time.
                    if (previousStatus === 3 && floatStatus.status !== 3) {
                        lastSessionEndTime = Date.now();
                        logger.info(`${key}: Session ended, fast polling active until ${formatChicagoTime(new Date(lastSessionEndTime + (60 * 60 * 1000)))} (Chicago)`);
                        if (setLastSessionEndTime && floatDevice.sessionEndTime) {
                            const sessionEndTimestamp = new Date(floatDevice.sessionEndTime).getTime();
                            setLastSessionEndTime(!isNaN(sessionEndTimestamp) && sessionEndTimestamp > 0 ? sessionEndTimestamp : Date.now());
                        }
                    }

                    if (floatStatus.status !== 3) {
                        if (sessionEndTimeouts[key]) {
                            outOfSessionChecks[key] = (outOfSessionChecks[key] || 0) + 1;
                            logger.debug(`${key}: Out-of-session check count = ${outOfSessionChecks[key]}`);
                            if (outOfSessionChecks[key] >= 2) {
                                clearTimeout(sessionEndTimeouts[key]);
                                sessionEndTimeouts[key] = null;
                                outOfSessionChecks[key] = 0;
                                logger.debug(`${key}: Cleared session end timeout after two confirmations`);
                            }
                        }
                    } else {
                        outOfSessionChecks[key] = 0;
                    }

                    logger.debug(`${key}: Calling checkFloatStatus with status: ${floatStatus.status}`);
                    await checkService.checkFloatStatus(key, floatDevice, floatStatus, silentStatus);
                    
                    // Determine next poll interval based on various conditions
                    let nextPollMs;
                    let pollReason;
                    
                    // Check if light and fan are on (within the last 2 hours)
                    const lightAndFanOnTime = floatDevice.lightAndFanOnTime;
                    const lightAndFanOn = lightAndFanOnTime && (Date.now() - lightAndFanOnTime < 2 * 60 * 60 * 1000);
                    
                    const deviceNewSession = floatStatus.status === 1 || floatStatus.status === 2;

                    if (deviceNewSession && isOvernightCancelWindow()) {
                        // Keep the overnight cancel grace period based on real minutes, not 50-minute night polls.
                        nextPollMs = 60 * 1000; // 1 minute
                        pollReason = 'overnight new-session guard (1m)';
                    } else if (lightAndFanOn) {
                        // Use 10-minute polling when light and fan are on
                        nextPollMs = 10 * 60 * 1000; // 10 minutes
                        pollReason = 'light and fan are on (10m)';
                    } else if (shouldUseFastPolling()) {
                        // Fast polling webhook, boot, session
                        nextPollMs = 10 * 60 * 1000; // 10 minutes
                        pollReason = 'recent activity (10m)';
                    } else if (isNightTime()) {
                        // Nighttime (10 PM - 8 AM) uses 50-minute intervals
                        nextPollMs = 50 * 60 * 1000; // 50 minutes
                        pollReason = 'nighttime (50m)';
                    } else if (isTuesdayOrWednesday()) {
                        // Tuesday/Wednesday uses 40-minute intervals
                        nextPollMs = 40 * 60 * 1000; // 40 minutes
                        pollReason = 'Tuesday/Wednesday (40m)';
                    } else {
                        // Default to 20-minute intervals
                        nextPollMs = 20 * 60 * 1000; // 20 minutes
                        pollReason = 'default (20m)';
                    }
                    
                    // If we have an active session with an end time, schedule a timeout
                    if (floatStatus.status === 3 && floatDevice.sessionEndTime) {
                        const now = Date.now();
                        const timeToEnd = floatDevice.sessionEndTime.getTime() - now;
                        if (timeToEnd > 15 * 60 * 1000) {
                            // More than 15 minutes away, ensure no timeout is scheduled
                            if (sessionEndTimeouts[key]) {
                                clearTimeout(sessionEndTimeouts[key]);
                                sessionEndTimeouts[key] = null;
                                logger.debug(`${key}: Cleared session end timeout (>15m away)`);
                            }
                            nextPollMs = 10 * 60 * 1000;
                            pollReason = 'active session (10m)';
                        } else if (timeToEnd > 0) {
                            // Within 15 minutes, keep or set the timeout
                            if (!sessionEndTimeouts[key]) {
                                sessionEndTimeouts[key] = setTimeout(() => {
                                    logger.debug(`${key}: Session end timeout reached, forcing status check`);
                                    sessionEndTimeouts[key] = null;

                                    clearTimeout(deviceIntervals[key]);
                                    deviceIntervals[key] = null;
                                    checkDevice(key);
                                }, timeToEnd);
                                logger.debug(`${key}: Scheduled session end check in ${(timeToEnd/60000).toFixed(1)} minutes`);
                            } else {
                                logger.debug(`${key}: Session end timeout already scheduled`);
                            }
                            nextPollMs = 10 * 60 * 1000;
                            pollReason = 'active session (10m) with end timeout';
                        }
                    }
                    
                    logger.debug(`${key}: Next poll in ${nextPollMs/1000}s - ${pollReason}`);
                    
                    // Log timing information
                    const endTime = Date.now();
                    const processingTime = endTime - startTime;
                    logger.debug(`${key}: Processing completed in ${processingTime}ms`);
                    
                    // Schedule the next device check
                    const nextCheckMins = (nextPollMs / 60000).toFixed(1);
                    logger.debug(`${key}: Scheduled next check in ${nextCheckMins} minutes`);
                    scheduleDeviceCheck(key, nextPollMs);
                    deviceErrorCounts[key] = 0;

                    // Make health check call. Explicit timeout + no retry: without one,
                    // got waits forever on a hung endpoint and the pending sockets pile
                    // up poll after poll.
                    logger.debug(`${key}: Making health check call`);
                    got.get(floatDevice.healthCheckUrl, { timeout: 10000, retry: 0 })
                        .then(() => logger.debug(`${key}: Health check successful`))
                        .catch(ex =>
                            logger.error(`${key}: Health check failed: ${ex.message}`)
                        );
                } else {
                    scheduleErrorRetry(
                        key,
                        'status response',
                        new Error('controller returned no float status')
                    );
                }
            } catch (ex) {
                scheduleErrorRetry(key, `process status (after ${Date.now() - startTime}ms)`, ex);
            }
        } catch (ex) {
            scheduleErrorRetry(key, `API call (after ${Date.now() - startTime}ms)`, ex);
        } finally {
            deviceLocks[key] = false;
        }
    }
    
    // Function to check if any device is in session
    async function checkAnyDeviceInSession() {
        let anyDeviceInSession = false;
        
        for (const [key, device] of Object.entries(options.floatDevices || {})) {
            try {
                logger.debug(`Checking if ${key} is in session...`);
                const data = await got.post(device.url, {
                    form: {
                        "api_key": options.apiKey,
                        "command": "get_session_status"
                    },
                    timeout: 5000
                });
                
                const status = data?.body ? JSON.parse(JSON.parse(data.body).msg) : null;
                if (status?.status === 3) { // 3 means active session
                    logger.info(`${key} is in an active session`);
                    anyDeviceInSession = true;
                    break;
                }
            } catch (error) {
                logger.error(`Error checking session status for ${key}: ${error.message}`);
            }
        }
        
        return anyDeviceInSession;
    }
    
    // Initialize the cron job to check all devices every minute
    const job = new cron(
        '0 * * * * *',
        async () => {
            // Check all devices on each cron tick
            for (const key in options.floatDevices) {
                if (options.floatDevices.hasOwnProperty(key) && !deviceIntervals[key]) {
                    checkDevice(key);
                }
            }
        },
        null,
        true,
        'America/Chicago'
    );
    
    // Initial check on startup
    (async () => {
        logger.info('Performing initial device status check...');
        await checkAnyDeviceInSession();
        
        // Start initial checks for all devices
        for (const key in options.floatDevices) {
            if (options.floatDevices.hasOwnProperty(key)) {
                checkDevice(key);
            }
        }
        
        logger.info('Initial device checks completed');
    })();
    
    // Clean up intervals on exit
    process.on('SIGINT', () => {
        logger.info('Shutting down...');
        for (const interval of Object.values(deviceIntervals)) {
            clearTimeout(interval);
        }
        job.stop();
        process.exit();
    });
    
    job.start();
    logger.info('Cron job started');
    return job;
};
