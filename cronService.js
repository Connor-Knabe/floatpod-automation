module.exports = function(options, got, logger, lightFanService, getLastColorUpdate) {
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
        const lastColorUpdate = getLastColorUpdate ? getLastColorUpdate() : null;
        if (!lastColorUpdate) return false;
        
        // Check if last color update was within the last 2 hours (120 minutes)
        const twoHoursAgo = Date.now() - (120 * 60 * 1000);
        return lastColorUpdate > twoHoursAgo;
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
                    const durationSeconds = parseInt(floatStatus.duration, 10);
                    const minutes = Math.floor(durationSeconds / 60);
                    const seconds = durationSeconds % 60;
                    logger.debug(`${key}: Session status - Status: ${floatStatus.status}, Duration: ${minutes}m ${seconds}s`);
                    
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
                        // Fast polling for 2 hours after color update
                        nextPollMs = 4 * 60 * 1000; // 4 minutes
                        pollReason = 'recent color update (4m)';
                    } else if (isNightTime()) {
                        // Nighttime (10 PM - 8 AM) uses 20-minute intervals
                        nextPollMs = 20 * 60 * 1000; // 20 minutes
                        pollReason = 'nighttime (20m)';
                    } else if (isTuesdayOrWednesday()) {
                        // Tuesday/Wednesday uses 20-minute intervals
                        nextPollMs = 20 * 60 * 1000; // 20 minutes
                        pollReason = 'Tuesday/Wednesday (20m)';
                    } else {
                        // Default to 4-minute intervals
                        nextPollMs = 4 * 60 * 1000; // 4 minutes
                        pollReason = 'default (4m)';
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
                        
                        // If within 1 minute of music start, poll every 20 seconds
                        if (timeToMusicStart > 0 && timeToMusicStart < 60 * 1000) {
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
                    logger.debug(`${key}: Scheduled next check in ${nextPollMs/1000} seconds`);
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