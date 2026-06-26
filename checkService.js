module.exports = function(got, logger, options, lightFanService) {
    let shouldAlertDeviceInSession = true;
    let shouldTurnHallwayLightsOff = true;
    const debugOvernightSessionCancel = options.debugOvernightSessionCancel === true;
    const overnightCancelAfterMs = 5 * 60 * 1000;

    if (debugOvernightSessionCancel) {
        logger.warn('debugOvernightSessionCancel is enabled: overnight new-session cancel can run outside midnight hour');
    }

    function getChicagoHour(date = new Date()) {
        return Number(new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric',
            hourCycle: 'h23'
        }).format(date));
    }

    function isOvernightCancelWindow(date = new Date()) {
        if (debugOvernightSessionCancel) {
            return true;
        }
        const hour = getChicagoHour(date);
        return hour >= 0 && hour < 1;
    }

    function clearOvernightSessionState(floatDevice) {
        floatDevice.overnightSessionStartedAt = null;
        floatDevice.overnightSessionCancelSent = false;
    }

    function clearSessionEndTimer(floatDevice) {
        if (floatDevice.sessionEndTimer) {
            clearTimeout(floatDevice.sessionEndTimer);
            floatDevice.sessionEndTimer = null;
        }
        floatDevice.sessionLightFanTriggerTime = null;
    }

    function schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession, shouldPlayAtSessionEnd) {
        if (!floatDevice.sessionEndTime) {
            return;
        }

        if (floatDevice.endScheduleTriggered) {
            return;
        }

        const triggerTime = shouldPlayAtSessionEnd
            ? floatDevice.sessionEndTime.getTime()
            : floatDevice.sessionEndTime.getTime() - (minsToPlayMusicBeforeEndSession * 60000);
        const triggerReason = shouldPlayAtSessionEnd
            ? '_DS_ song end'
            : `music start (${minsToPlayMusicBeforeEndSession}m before end)`;

        if (floatDevice.sessionLightFanTriggerTime === triggerTime) {
            return;
        }

        clearSessionEndTimer(floatDevice);
        floatDevice.sessionLightFanTriggerTime = triggerTime;

        const delay = triggerTime - Date.now();
        if (delay > 0) {
            const minutes = Math.floor(delay / 60000);
            const seconds = Math.round((delay % 60000) / 1000);
            logger.debug(`${deviceName}: scheduling light/fan for ${triggerReason} in ${minutes}m ${seconds}s`);
            floatDevice.sessionEndTimer = setTimeout(async () => {
                logger.info(`${deviceName}: ${triggerReason}, turning light and fan on`);
                await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
                floatDevice.endScheduleTriggered = true;
                floatDevice.sessionEndTimer = null;
                floatDevice.sessionLightFanTriggerTime = null;
            }, delay);
        } else {
            logger.debug(`${deviceName}: ${triggerReason} already passed, turning light and fan on now`);
            floatDevice.endScheduleTriggered = true;
            floatDevice.sessionLightFanTriggerTime = null;
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
            clearOvernightSessionState(floatDevice);
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

            const shouldPlayAtSessionEnd = floatStatus?.music_song?.includes("_DS_");
            const minsToPlayMusicBeforeEndSession = Number(floatStatus.music_pre_end) > 5 ? Number(floatStatus.music_pre_end) : 5;

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
                    floatDevice.endScheduleTriggered = false;
                } else if (newEndTime.getTime() !== floatDevice.sessionEndTime.getTime()) {
                    logger.info(`${deviceName}: session end time changed from ${floatDevice.sessionEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })} to ${newEndTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}`);
                    floatDevice.sessionEndTime = newEndTime;
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
                floatDevice.endScheduleTriggered = false;
            }
            if (floatDevice.sessionEndTime) {
                schedulePostSessionStart(deviceName, floatDevice, minsToPlayMusicBeforeEndSession, shouldPlayAtSessionEnd);
            }
            const timeRemainingMs = floatDevice.sessionEndTime ? floatDevice.sessionEndTime.getTime() - Date.now() : null;
            if (timeRemainingMs !== null) {
                logger.debug(`${deviceName}: time remaining mins ${timeRemainingMs / 60000}`);
            }
            logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
            floatDevice.minutesInSession++;
        } else if (deviceNewSession){
            if (!floatDevice.overnightSessionStartedAt) {
                floatDevice.overnightSessionStartedAt = Date.now();
                floatDevice.overnightSessionCancelSent = false;
            }
            //only want to turn off fan once when in new session screen
            logger.debug(`${deviceName}: mins in session now ${floatDevice.minutesInSession}`);
            if(floatDevice.minutesInSession==0){
                logger.info(`${deviceName}: turning fan off when in new session screen`);
                lightFanService.turnFanOff(deviceName, floatDevice);
                lightFanService.turnLightOff(deviceName, floatDevice);
                floatDevice.minutesInSession = 1;
            }
            clearSessionEndTimer(floatDevice);
            floatDevice.endScheduleTriggered = false;
            await checkForOverNightSession(deviceName, floatDevice);

        } else if (idleScreen) {
            clearOvernightSessionState(floatDevice);
            floatDevice.minutesInSession = 0;
            floatDevice.sessionEndTime = null; // clear stored end time when idle
            clearSessionEndTimer(floatDevice);
            floatDevice.endScheduleTriggered = false;
            await checkForAllDevicesInSession();
        }
    }
    async function checkForOverNightSession(deviceName, floatDevice){
        if(isOvernightCancelWindow()){
            const overnightSessionStartedAt = floatDevice.overnightSessionStartedAt || Date.now();
            const elapsedMs = Date.now() - overnightSessionStartedAt;
            const elapsedMins = Math.floor(elapsedMs / 60000);
            logger.debug(`checkForOverNightSession elapsed mins ${elapsedMins}`);
            if(elapsedMs >= overnightCancelAfterMs && !floatDevice.overnightSessionCancelSent){
                //send request to take out of session
                logger.info(`${deviceName}: taking out of session overnight`);
                await got.post(floatDevice.url, {
                    form:{
                        "api_key": options.apiKey,
                        "command":"set_session_cancel"
                    }
                });
                floatDevice.overnightSessionCancelSent = true;
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
