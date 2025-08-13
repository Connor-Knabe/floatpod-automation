module.exports = function(got,logger,options,lightFanService) {
    var shouldAlertDeviceInSession = true;
    var shouldTurnHallwayLightsOff = true;
    async function checkFloatStatus(deviceName,floatDevice,floatStatus, silentStatus){
        // logger.debug(`${deviceName}: floatStatus ${JSON.stringify(floatStatus)}`);
        const deviceNewSession = floatStatus.status == 1 || floatStatus.status == 2;
        const deviceActiveSession = floatStatus.status==3;
        const idleScreen = floatStatus.status == 0;
        floatDevice.status = floatStatus.status;
        floatDevice.silentStatus = silentStatus;

      
        const minsBeforeCountInSession = -1;
        var devicesInSession = await anyDevicesInSession(minsBeforeCountInSession);
        if(devicesInSession == "" && !shouldTurnHallwayLightsOff) {
            shouldTurnHallwayLightsOff = true;
            //light strip on
            logger.debug("turning hallway light strip on");
            await got.post(options.ifttt.noDeviceInSessionUrl, {
                json: {
                    value1: ""
                }
            });
        }
        
        if(deviceActiveSession){
            if(shouldTurnHallwayLightsOff && floatDevice.minutesInSession > 10){
            // if(shouldTurnHallwayLightsOff){
                shouldTurnHallwayLightsOff = false;
                logger.debug("turning hallway light strip off");
                await got.post(options.ifttt.atLeastOneDeviceInSessionUrl, {
                    json: {
                        value1: ""
                    }
                });
            }
        
    
            var minsToPlayMusicBeforeEndSession = Number(floatStatus.music_pre_end) > 5 ? Number(floatStatus.music_pre_end) : 5;

            if(floatStatus?.music_song.includes("_DS_")){
                minsToPlayMusicBeforeEndSession = 5;
            }

            // Detect if the controller reports a new duration mid-session (e.g., session extended)
            const currentDuration = Number(floatStatus.duration);
            if (floatDevice.sessionDuration === undefined) {
                floatDevice.sessionDuration = currentDuration;
            }
            if (currentDuration !== floatDevice.sessionDuration) {
                logger.info(`${deviceName}: session duration changed from ${floatDevice.sessionDuration} to ${currentDuration} seconds – updating timers`);
                floatDevice.sessionDuration = currentDuration;
                // Re-calculate absolute end time based on remaining minutes
                const remainingMinutes = currentDuration / 60 - floatDevice.minutesInSession;
                floatDevice.sessionEndTime = new Date(Date.now() + remainingMinutes * 60 * 1000);
                logger.debug(`${deviceName}: sessionEndTime updated (Chicago) ${floatDevice.sessionEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
            }
            
            // Calculate remaining time based on absolute end time
            const activeSessionNonLast5Min = floatStatus.duration/60 != 5;
            const timeRemainingMs = floatDevice.sessionEndTime ? floatDevice.sessionEndTime.getTime() - Date.now() : null;
            const timeRemainingMins = timeRemainingMs !== null ? timeRemainingMs / 60000 : null;
    
            logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
            logger.debug(`${deviceName}: music will play ${minsToPlayMusicBeforeEndSession} mins before session over`);

            logger.debug(`${deviceName}: duration mins ${floatStatus.duration/60}`);

    
            if(activeSessionNonLast5Min){
                if(timeRemainingMins !== null && timeRemainingMins <= minsToPlayMusicBeforeEndSession && !floatDevice.endScheduleTriggered){
                    logger.info(`${deviceName}: turning light and fan on end-of-session schedule`);
                    await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName,floatDevice);
                    floatDevice.endScheduleTriggered = true;
                    floatDevice.minutesInSession = 1;
                } else if (floatDevice.minutesInSession == 0) {
                    // Record absolute session end time at the start of an active session
                    const now = Date.now();
                    // Get session delay in milliseconds (convert from seconds to ms)
                    const sessionDelayMs = Number(floatStatus.session_delay_before || 0) * 1000;
                    const sessionDurationMs = Number(floatStatus.duration) * 1000; // duration reported in seconds
                    
                    // Add session delay to the end time to account for delayed start
                    floatDevice.sessionEndTime = new Date(now + sessionDurationMs + sessionDelayMs);
                    
                    logger.debug(`${deviceName}: sessionEndTime set (Chicago) ${floatDevice.sessionEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                    if (sessionDelayMs > 0) {
                        logger.info(`${deviceName}: Accounting for session delay of ${sessionDelayMs/1000} seconds in end time calculation`);
                    }

                    logger.info(`${deviceName}: turning fan off 0 mins into active session`);
                    lightFanService.turnFanOff(deviceName, floatDevice);
                    lightFanService.turnLightOff(deviceName, floatDevice);
                    floatDevice.minutesInSession = 1;
                    floatDevice.endScheduleTriggered = false;
                }
                logger.debug(`${deviceName}: floatDevice.minutesInSession ${floatDevice.minutesInSession}`);

                floatDevice.minutesInSession++;
            } else if(floatDevice.minutesInSession > -1){
                logger.info(`${deviceName} turning light and fan on manual 5 min timer`);
                await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
                floatDevice.minutesInSession = -1;
            }
        } else if (deviceNewSession){
            //only want to turn off fan once when in new session screen
            logger.debug(`${deviceName}: mins in session now ${floatDevice.minutesInSession}`);
            floatDevice.endScheduleTriggered = false;
            if(floatDevice.minutesInSession==0){
                logger.info(`${deviceName}: turning fan off when in new session screen`);
                lightFanService.turnFanOff(deviceName, floatDevice);
                lightFanService.turnLightOff(deviceName, floatDevice);
                floatDevice.minutesInSession = 1;
            }
            await checkForOverNightSession(deviceName, floatDevice);

        } else if (idleScreen) {
            // logger.debug(`${deviceName}: no session active screen.`);
            floatDevice.minutesInSession = 0;
            floatDevice.sessionEndTime = null; // clear stored end time when idle
            floatDevice.sessionDuration = null; // clear stored duration
            floatDevice.endScheduleTriggered = false;
            await checkForAllDevicesInSession();
        }
    }
    async function checkForOverNightSession(deviceName, floatDevice){
        const theTime = new Date();
        if(theTime.getHours() >= 0 && theTime.getHours() < 1){
            logger.debug(`checkForOverNightSession time passed ${floatDevice.minutesInSession}`);
            if(floatDevice.minutesInSession > 5){
                //send request to take out of session
                logger.info(`${deviceName}: taking out of session overnight`);
                await got.post(floatDevice.url, {
                    form:{
                        "api_key": options.apiKey,
                        "command":"set_session_cancel"
                    }
                });
            } else {
                floatDevice.minutesInSession++;
                logger.debug(`checkForOverNightSession mins in session ${floatDevice.minutesInSession}`);
            }
            
        } 
    }   

    async function anyDevicesInSession(minsBeforeCountInSession){
        var devicesInSession = "";
        var count = 0;
        for (var key in options.floatDevices) {
            if (options.floatDevices.hasOwnProperty(key)) {
                var floatDevice = options.floatDevices[key];
                if(floatDevice.status > 0 && floatDevice.silentStatus != 1 && floatDevice.minutesInSession > minsBeforeCountInSession){
                    count++
                    devicesInSession += `${key}|`;
                }
            }
        }
        if(count==0){
            shouldAlertDeviceInSession = true;
        }
        return devicesInSession;
    }

    function anyDevicesNotInSession(){
        var devicesNotInSession = "";
        for (var key in options.floatDevices) {
            if (options.floatDevices.hasOwnProperty(key)) {
                var floatDevice = options.floatDevices[key];
                logger.debug(`notinsession ${key}`);
                if(floatDevice.status == 0 && floatDevice.silentStatus == 0){
                    devicesNotInSession += `${key}|`;
                }
            }
        }
        return devicesNotInSession;
    }
    
    async function checkForAllDevicesInSession(){
        const minsBeforeCountInSession = options.minsInSessionBeforeAlert;
        const devicesInSession = await anyDevicesInSession(minsBeforeCountInSession);
        if(devicesInSession != "" && shouldAlertDeviceInSession){
            //send alert
            shouldAlertDeviceInSession = false;
            logger.debug(`sending device in session alert`);
            const devicesNotInSession = anyDevicesNotInSession();
            await got.post(options.ifttt.alertUrl, {
                json: {
                    value1: devicesInSession +"!" + devicesNotInSession
                }
            });
        }
    }

    return {
        checkFloatStatus: checkFloatStatus
    }
};