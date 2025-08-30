module.exports = function(got, logger, options, lightFanService) {
    let shouldAlertDeviceInSession = true;
    let shouldTurnHallwayLightsOff = true;

    function schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession) {
        if (floatDevice.sessionEndTimer) {
            clearTimeout(floatDevice.sessionEndTimer);
            floatDevice.sessionEndTimer = null;
        }
        if (!floatDevice.sessionEndTime) {
            return;
        }
        // Always trigger 10 seconds AFTER the session end time
        const triggerTime = floatDevice.sessionEndTime.getTime() + 10000; // +10s
        const delay = triggerTime - Date.now();
        if (delay > 0) {
            const minutes = Math.floor(delay / 60000);
            const seconds = Math.round((delay % 60000) / 1000);
            logger.debug(`${deviceName}: scheduling light/fan for 10s after session end in ${minutes}m ${seconds}s`);
            floatDevice.sessionEndTimer = setTimeout(async () => {
                logger.info(`${deviceName}: session ended, turning light and fan on (10s post-session)`);
                await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
                floatDevice.sessionEndTimer = null;
            }, delay);
        } else {
            logger.debug(`${deviceName}: session already ended >10s ago, turning light and fan on now`);
            lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
        }
    }

    async function checkFloatStatus(deviceName,floatDevice,floatStatus, silentStatus){
        const deviceNewSession = floatStatus.status == 1 || floatStatus.status == 2;
        const deviceActiveSession = floatStatus.status==3;
        const idleScreen = floatStatus.status == 0;
        floatDevice.status = floatStatus.status;
        floatDevice.silentStatus = silentStatus;

        const minsBeforeCountInSession = -1;
        let devicesInSession = await anyDevicesInSession(minsBeforeCountInSession);
        if(devicesInSession == "" && !shouldTurnHallwayLightsOff) {
            shouldTurnHallwayLightsOff = true;
            //light strip on
            logger.debug("turning hallway light strip on");
            await got.post(options.ifttt.noDeviceInSessionUrl, {
                json: {
                    value1: "",
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
                        value1: "",
                    }
                });
            }

            let minsToPlayMusicBeforeEndSession = Number(floatStatus.music_pre_end) > 5 ? Number(floatStatus.music_pre_end) : 5;
            if(floatStatus?.music_song?.includes("_DS_")){
                minsToPlayMusicBeforeEndSession = 5;
            }

            // Use controller-provided end_time (includes delay)
            let newEndTime = null;
            if (floatStatus.end_time) {
                const endTimeNum = Number(floatStatus.end_time);
                if (!isNaN(endTimeNum)) {
                    newEndTime = new Date(endTimeNum * 1000);
                } else {
                    const parsed = new Date(floatStatus.end_time);
                    if (!isNaN(parsed.getTime())) {
                        newEndTime = parsed;
                    }
                }
            }

            if (newEndTime) {
                if (!floatDevice.sessionEndTime) {
                    logger.debug(`${deviceName}: sessionEndTime set (Chicago) ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                    floatDevice.sessionEndTime = newEndTime;
                    logger.info(`${deviceName}: turning fan off 0 mins into active session`);
                    lightFanService.turnFanOff(deviceName, floatDevice);
                    lightFanService.turnLightOff(deviceName, floatDevice);
                    floatDevice.minutesInSession = 1;
                    schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession);
                } else if (newEndTime.getTime() !== floatDevice.sessionEndTime.getTime()) {
                    logger.info(`${deviceName}: session end time changed from ${floatDevice.sessionEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })} to ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                    floatDevice.sessionEndTime = newEndTime;
                    schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession);
                }
            } else if (!floatDevice.sessionEndTime) {
                // Fallback to manual calculation if end_time not provided
                const now = Date.now();
                const sessionDurationMs = Number(floatStatus.duration) * 1000;
                floatDevice.sessionEndTime = new Date(now + sessionDurationMs);
                logger.debug(`${deviceName}: sessionEndTime set (Chicago) ${floatDevice.sessionEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                logger.info(`${deviceName}: turning fan off 0 mins into active session`);
                lightFanService.turnFanOff(deviceName, floatDevice);
                lightFanService.turnLightOff(deviceName, floatDevice);
                floatDevice.minutesInSession = 1;
                schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession);
            }
            const timeRemainingMs = floatDevice.sessionEndTime ? floatDevice.sessionEndTime.getTime() - Date.now() : null;
            if (timeRemainingMs !== null) {
                logger.debug(`${deviceName}: time remaining mins ${timeRemainingMs / 60000}`);
            }
            logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
            floatDevice.minutesInSession++;
        } else if (deviceNewSession){
            //only want to turn off fan once when in new session screen
            logger.debug(`${deviceName}: mins in session now ${floatDevice.minutesInSession}`);
            if(floatDevice.minutesInSession==0){
                logger.info(`${deviceName}: turning fan off when in new session screen`);
                lightFanService.turnFanOff(deviceName, floatDevice);
                lightFanService.turnLightOff(deviceName, floatDevice);
                floatDevice.minutesInSession = 1;
            }
            if (floatDevice.sessionEndTimer) {
                clearTimeout(floatDevice.sessionEndTimer);
                floatDevice.sessionEndTimer = null;
            }
            await checkForOverNightSession(deviceName, floatDevice);

        } else if (idleScreen) {
            floatDevice.minutesInSession = 0;
            floatDevice.sessionEndTime = null; // clear stored end time when idle
            if (floatDevice.sessionEndTimer) {
                clearTimeout(floatDevice.sessionEndTimer);
                floatDevice.sessionEndTimer = null;
            }
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
        let devicesInSession = "";
        let count = 0;
        for (const key in options.floatDevices) {
            if (options.floatDevices.hasOwnProperty(key)) {
                const floatDevice = options.floatDevices[key];
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
        let devicesNotInSession = "";
        for (const key in options.floatDevices) {
            if (options.floatDevices.hasOwnProperty(key)) {
                const floatDevice = options.floatDevices[key];
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
