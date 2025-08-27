module.exports = function(options, got, logger, lightFanService, getLastWebhookUpdate, getLastSessionEndTime, setLastSessionEndTime) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    const { formatChicagoTime: formatChicagoTimeBase } = require('./timeUtils.js');
    
    // Track the last time any session ended (for rolling 1-hour fast polling window)
    let lastSessionEndTime = 0;
    
    // Track when the service started for initial fast polling
    const serviceStartTime = Date.now();
    const deviceIntervals = {};
    const sessionEndTimeouts = {};
    const outOfSessionChecks = {};

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
                    
                    // Update last session end time when a session ends
                    if (setLastSessionEndTime && floatDevice.sessionEndTime) {
                        const sessionEndTime = new Date(floatDevice.sessionEndTime);
                        const sessionEndTimestamp = sessionEndTime.getTime();
                        
                        if (!isNaN(sessionEndTimestamp) && sessionEndTimestamp > 0) {
                            // Update the rolling window for fast polling
                            lastSessionEndTime = Date.now();
                            logger.debug(`${key}: Session ended, fast polling active until ${formatChicagoTime(new Date(lastSessionEndTime + (60 * 60 * 1000)))} (Chicago)`);
                            
                            // Also update the session end time for other components
                            setLastSessionEndTime(sessionEndTimestamp);
                            logger.debug(`${key}: Updated last session end time to ${formatChicagoTime(sessionEndTime)}`);
                        } else {
                            logger.debug(`${key}: Invalid session end time (${floatDevice.sessionEndTime}), not updating`);
                        }
                    }
                    
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
                        logger.error(`${key}: failed to parse silent status response`, ex);
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
                    
                    if (lightAndFanOn) {
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
                    
                    // Clear any existing interval and set a new one
                    clearInterval(deviceIntervals[key]);
                    const nextCheckMins = (nextPollMs / 60000).toFixed(1);
                    logger.debug(`${key}: Scheduled next check in ${nextCheckMins} minutes`);
                    deviceIntervals[key] = setTimeout(() => checkDevice(key), nextPollMs);
                    
                    // Make health check call
                    logger.debug(`${key}: Making health check call`);
                    got.get(floatDevice.healthCheckUrl)
                        .then(() => logger.debug(`${key}: Health check successful`))
                        .catch(ex => 
                            logger.error(`${key}: Health check failed: ${ex.message}`, ex)
                        );
                } else {
                    logger.warn(`${key}: No float status received`);
                }
            } catch (ex) {
                const errorTime = new Date();
                logger.error(`${key}: [${formatChicagoTime(errorTime)}] Failed to process status after ${Date.now() - startTime}ms`, ex);
                // On error, retry after 1 minute
                clearInterval(deviceIntervals[key]);
                const retryTime = Date.now() + 60000;
                logger.debug(`${key}: Will retry at ${formatChicagoTime(new Date(retryTime))} (Chicago)`);
                deviceIntervals[key] = setTimeout(() => checkDevice(key), 60000);
            }
        } catch (ex) {
            const errorTime = new Date();
            logger.error(`${key}: [${formatChicagoTime(errorTime)}] API call failed after ${Date.now() - startTime}ms`, ex);
            // On error, retry after 1 minute
            clearInterval(deviceIntervals[key]);
            const retryTime = Date.now() + 60000;
            logger.debug(`${key}: Will retry API call at ${formatChicagoTime(new Date(retryTime))} (Chicago)`);
            deviceIntervals[key] = setTimeout(() => checkDevice(key), 60000);
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
                logger.error(`Error checking session status for ${key}:`, error);
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
            clearInterval(interval);
        }
        job.stop();
        process.exit();
    });
    
    job.start();
    logger.info('Cron job started');
    return job;
};