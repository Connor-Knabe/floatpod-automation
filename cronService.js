module.exports = function(options,got,logger, lightFanService) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    var job = new cron(
        '0 * * * * *',
        //debug
        // '* * * * * *',
        async () => {
            for (var key in options.floatDevices) {
                if (options.floatDevices.hasOwnProperty(key)) {
                    var floatDevice = options.floatDevices[key];
                    logger.debug("Checking status for ", key);
                        // Adaptive polling: skip API call if within quiet interval
                        const nowTs = Date.now();
                        if (floatDevice.nextPollAllowed && nowTs < floatDevice.nextPollAllowed) {
                            logger.debug(`${key}: skipping poll until ${new Date(floatDevice.nextPollAllowed).toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                            continue;
                        }
                    try {
                        /*
                        * Commands:
                        "ping",
                        "get_water_temperature",
                        "get_controller_temperature",
                        "get_relay_status",
                        "get_silence_status",
                        "set_silence_on",
                        "set_silence_off",
                        "get_session_status",
                        "set_session_start",
                        "set_session_cancel",
                        */

                        logger.debug("before calling float device");

                        const data = await got.post(options.floatDevices[key].url, {
                            form:{
                            "api_key": options.apiKey,
                            "command":"get_session_status"
                            }
                        });


                        try {
                            var floatStatus = data ? JSON.parse(data.body) : null;
                            floatStatus = floatStatus ? JSON.parse(floatStatus.msg) : null;
                        } catch (ex){
                            logger.error(`${key}: failed to parse float status response ${ex}`)
                        }

                        logger.debug("after calling float device");
                        logger.debug("float status",floatStatus);


                        const silentData = await got.post(options.floatDevices[key].url, {
                            form:{
                            "api_key": options.apiKey,
                            "command":"get_silence_status"
                            }
                        });
                        

                        var silentStatus = null;
                        try {
                            silentStatus = silentData ? JSON.parse(silentData.body) : null;
                            silentStatus = silentStatus ? silentStatus.msg : null;
                        } catch (ex){
                            logger.error(`${key}: failed to parse silent status response ${ex}`)
                        }


                        if(floatStatus["status"] != undefined){
                            logger.debug("status is valid");
                            checkService.checkFloatStatus(key,floatDevice,floatStatus,silentStatus);
                            // After processing, decide next poll interval
                            try {
                                const nowTs2 = Date.now();
                                let minsToPlayMusicBeforeEnd = 5;
                                if (floatStatus && floatStatus.music_pre_end) {
                                    minsToPlayMusicBeforeEnd = Number(floatStatus.music_pre_end) > 5 ? Number(floatStatus.music_pre_end) : 5;
                                    if (floatStatus.music_song?.includes('_DS_')) minsToPlayMusicBeforeEnd = 5;
                                }
                                let timeRemainingMins = null;
                                if (floatDevice.sessionEndTime instanceof Date) {
                                    timeRemainingMins = (floatDevice.sessionEndTime.getTime() - nowTs2) / 60000;
                                }
                                let intervalMins = 1;
                                if (timeRemainingMins === null || timeRemainingMins > (minsToPlayMusicBeforeEnd + 1)) {
                                    intervalMins = 4;
                                }
                                floatDevice.nextPollAllowed = nowTs2 + intervalMins * 60_000;
                                // If pod is idle, reset to poll immediately
                                if (floatStatus.status == 0) {
                                    floatDevice.nextPollAllowed = 0;
                                }
                            } catch (e) {
                                logger.error(`${key}: failed to schedule next poll interval`, e);
                            }
                            got.get(options.floatDevices[key].healthCheckUrl);
                        } else {
                            logger.debug(`${key}: couldn't find float status`);
                        }
                    } catch (ex){
                        logger.debug('Failed to get status', ex);
                    }
                

                }
            }
        },
        null,
        true,
        'America/Chicago'
    );
    job.start();
};