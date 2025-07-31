module.exports = function(options,got,logger, lightFanService) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    
    // Store the active interval for each device
    const deviceIntervals = {};
    
    async function checkDevice(key) {
        const floatDevice = options.floatDevices[key];
        logger.debug("Checking status for ", key);
        
        try {
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
                    // Get silence status in parallel
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
                    } catch (ex) {
                        logger.error(`${key}: failed to parse silent status response`, ex);
                    }
                    
                    // Process the status update
                    await checkService.checkFloatStatus(key, floatDevice, floatStatus, silentStatus);
                    
                    // Determine next poll interval based on session state
                    let nextPollMs = 4 * 60 * 1000; // Default: 4 minutes
                    
                    // If we have an active session with an end time
                    if (floatStatus.status === 3 && floatDevice.sessionEndTime) {
                        const now = Date.now();
                        const musicStartTime = floatDevice.sessionEndTime.getTime() - 
                                           (floatDevice.musicLeadTime || 5) * 60 * 1000;
                        const timeToMusicStart = musicStartTime - now;
                        
                        // If within 1 minute of music start, poll every 20 seconds
                        if (timeToMusicStart > 0 && timeToMusicStart < 60 * 1000) {
                            nextPollMs = 20 * 1000; // 20 seconds
                            logger.debug(`${key}: Within 1 minute of music start, polling every 20s`);
                        }
                    }
                    
                    // Clear any existing interval and set a new one
                    clearInterval(deviceIntervals[key]);
                    deviceIntervals[key] = setTimeout(() => checkDevice(key), nextPollMs);
                    
                    // Make health check call
                    got.get(floatDevice.healthCheckUrl).catch(ex => 
                        logger.error(`${key}: Health check failed`, ex)
                    );
                }
            } catch (ex) {
                logger.error(`${key}: failed to process status`, ex);
                // On error, retry after 1 minute
                clearInterval(deviceIntervals[key]);
                deviceIntervals[key] = setTimeout(() => checkDevice(key), 60 * 1000);
            }
        } catch (ex) {
            logger.error(`${key}: API call failed:`, ex);
            // On error, retry after 1 minute
            clearInterval(deviceIntervals[key]);
            deviceIntervals[key] = setTimeout(() => checkDevice(key), 60 * 1000);
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