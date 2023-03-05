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
            
            const sessionDelayBefore = Number(floatStatus.session_delay_before) > 0 ? Number(floatStatus.session_delay_before)/60 : 1;
            logger.debug(`${deviceName}: sessionDelayBefore ${sessionDelayBefore}`);
            //start automation 1 minute after music starts
            // const minsWhenSessionEnds = floatStatus.duration/60 - minsToPlayMusicBeforeEndSession + sessionDelayBefore;
            const minsWhenSessionEnds = floatStatus.duration/60 - minsToPlayMusicBeforeEndSession + 1;
            const activeSessionNonLast5Min = floatStatus.duration/60 != 5;
    
            logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
            logger.debug(`${deviceName}: music will play ${minsToPlayMusicBeforeEndSession} mins before session over`);
            logger.debug(`${deviceName}: mins when session ends ${minsWhenSessionEnds}`);
            logger.debug(`${deviceName}: duration mins ${floatStatus.duration/60}`);

    
            if(activeSessionNonLast5Min){
                if(floatDevice.minutesInSession >= minsWhenSessionEnds){
                    logger.info(`${deviceName}: turning light and fan on end of session`);
                    await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName,floatDevice);
                    floatDevice.minutesInSession = 1;
                } else if (floatDevice.minutesInSession == 0) {
                    logger.info(`${deviceName}: turning fan off 0 mins into active session`);
                    lightFanService.turnFanOff(deviceName, floatDevice);
                    lightFanService.turnLightOff(deviceName, floatDevice);
                    floatDevice.minutesInSession = 1
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