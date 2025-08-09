module.exports = function(options, got, logger, lightFanService, getLastWebhookUpdate, getLastSessionEndTime, setLastSessionEndTime) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    
    // Store the active interval for each device
    const deviceIntervals = {};
    
    function formatChicagoTime(date) {
        return date.toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false });
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
        // Check for recent webhook updates (within 2 hours)
        const lastWebhookUpdate = getLastWebhookUpdate ? getLastWebhookUpdate() : null;
        if (lastWebhookUpdate) {
            const twoHoursAgo = Date.now() - (120 * 60 * 1000);
            if (lastWebhookUpdate > twoHoursAgo) {
                return true;
            }
        }
        
        // Check for recent session end (within 2 hours)
        const sessionEndTime = getLastSessionEndTime ? getLastSessionEndTime() : null;
        if (sessionEndTime) {
            const twoHoursAgo = Date.now() - (120 * 60 * 1000);
            if (sessionEndTime > twoHoursAgo) {
                return true;
            }
        }
        
        return false;
    }
    
    async function checkDevice(key) {
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
                    
                    // Update last session end time when a session is active
                    if (setLastSessionEndTime && floatDevice.sessionEndTime) {
                        const sessionEndTime = new Date(floatDevice.sessionEndTime);
                        if (!isNaN(sessionEndTime.getTime()) && sessionEndTime.getTime() > 0) {
                            logger.debug(`${key}: Updating last session end time to ${formatChicagoTime(sessionEndTime)}`);
                            setLastSessionEndTime(sessionEndTime.getTime());
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
                    logger.debug(`${key}: Calling checkFloatStatus with status: ${floatStatus.status}`);
                    await checkService.checkFloatStatus(key, floatDevice, floatStatus, silentStatus);
                    
                    // Determine next poll interval based on various conditions
                    let nextPollMs;
                    let pollReason;
                    
                    if (shouldUseFastPolling()) {
                        // Fast polling for 2 hours after webhook update
                        nextPollMs = 4 * 60 * 1000; // 4 minutes
                        pollReason = 'recent webhook update (4m)';
                    } else if (isNightTime()) {
                        // Nighttime (10 PM - 8 AM) uses 50-minute intervals
                        nextPollMs = 50 * 60 * 1000; // 50 minutes
                        pollReason = 'nighttime (50m)';
                    } else if (isTuesdayOrWednesday()) {
                        // Tuesday/Wednesday uses 40-minute intervals
                        nextPollMs = 40 * 60 * 1000; // 40 minutes
                        pollReason = 'Tuesday/Wednesday (40m)';
                    } else {
                        // Default to 10-minute intervals
                        nextPollMs = 10 * 60 * 1000; // 10 minutes
                        pollReason = 'default (10m)';
                    }
                    
                    // If we have an active session with an end time
                    if (floatStatus.status === 3 && floatDevice.sessionEndTime) {
                        const now = Date.now();

 
                        var musicLeadTime = Number(floatStatus.music_pre_end) > 5 ? Number(floatStatus.music_pre_end) : 5;

                        if(floatStatus?.music_song.includes("_DS_")){
                            musicLeadTime = 5;
                        }

                        musicLeadTime = musicLeadTime * 60 * 1000;
                        const musicStartTime = floatDevice.sessionEndTime.getTime() - musicLeadTime;
                        const timeToMusicStart = musicStartTime - now;
                        
                        // Log timing information
                        logger.debug(`${key}: Music will start at: ${formatChicagoTime(new Date(musicStartTime))} (Chicago)`);
                        const totalSeconds = Math.ceil(timeToMusicStart/1000);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        logger.debug(`${key}: Time until music starts: ${minutes}m ${seconds}s`);
                        
                        // If within 6 minutes of music start, poll every 20 seconds
                        if (timeToMusicStart > 0 && timeToMusicStart < 6 * 60 * 1000) {
                            nextPollMs = 20 * 1000; // 20 seconds
                            pollReason = 'music starting soon (20s)';
                        } else {
                            pollReason = 'active session (4m)';
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
        }
    }
    
    // Initialize the cron job to check all devices every minute
    var job = new cron(
        '0 * * * * *',
        () => {
            for (const key in options.floatDevices) {
                // Only start a new check if one isn't already in progress
                if (!deviceIntervals[key]) {
                    checkDevice(key);
                }
            }
        },
        null,
        true,
        'America/Chicago'
    );
    
    // Clean up intervals on exit
    process.on('SIGINT', () => {
        for (const interval of Object.values(deviceIntervals)) {
            clearInterval(interval);
        }
        job.stop();
        process.exit();
    });
    
    job.start();
    return job;
};