module.exports = function(got,logger,options) {
        const lightFanService = require('./lightFanService.js')(got,logger,options);
        async function checkFloatStatus(deviceName,floatDevice,floatStatus){
            logger.debug(`${deviceName}: floatStatus ${JSON.stringify(floatStatus)}`);
            const deviceNewSession = floatStatus.status == 1 || floatStatus.status == 2;
            const deviceActiveSession = floatStatus.status==3;
            const idleScreen = floatStatus.status == 0;
           
            if(deviceActiveSession){
                const minsToPlayMusicBeforeEndSession = floatStatus.music_pre_end > 5 ? floatStatus.music_pre_end : 5;
                //start automation 1 minute after music starts
                const minsTillSessionEnds = floatStatus.duration + floatStatus.duration/60 - minsToPlayMusicBeforeEndSession + 1;
                const activeSessionNonLast5Min = floatStatus.duration/60 != 5;
        
                logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
                logger.debug(`${deviceName}: music will play ${minsToPlayMusicBeforeEndSession} mins before session over`);
                logger.debug(`${deviceName}: mins till session ends ${minsTillSessionEnds}`);
                logger.debug(`${deviceName}: duration mins ${floatStatus.duration/60}`);
        
                if(activeSessionNonLast5Min){
                    if(floatDevice.minutesInSession >= minsTillSessionEnds){
                        logger.info(`${deviceName}: turning light and fan on end of session`);
                        await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName,floatDevice);
                        floatDevice.minutesInSession = 1;
                    } else if (floatDevice.minutesInSession == 0) {
                        logger.info(`${deviceName}: turning fan off 0 mins into active session`);
                        // await got.get(floatDevice.fanOffUrl);
                        lightFanService.turnFanOff(deviceName, floatDevice);
                        lightFanService.turnLightOff(deviceName, floatDevice);
                        floatDevice.minutesInSession = 1
                    }
                    floatDevice.minutesInSession++;
                } else if(floatDevice.minutesInSession > -1){
                    logger.info(`${deviceName} turning light and fan on manual 5 min timer`);
                    await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
                    floatDevice.minutesInSession = -1;
                }
            } else if (deviceNewSession){
                //only want to turn off fan once when in new session screen
                logger.debug(`mins in session  now${floatDevice.minutesInSession}`);
                if(floatDevice.minutesInSession==0){
                    logger.info(`${deviceName}: turning fan off when in new session screen`);
                    // await got.get(floatDevice.fanOffUrl);
                    lightFanService.turnFanOff(deviceName, floatDevice);
                    lightFanService.turnLightOff(deviceName, floatDevice);
                    floatDevice.minutesInSession = 1;
                }
                await checkForOverNightSession(deviceName, floatDevice);

            } else if (idleScreen) {
                logger.debug(`${deviceName}: no session active screen.`);
                floatDevice.minutesInSession = 0;
            }
        }
        async function checkForOverNightSession(deviceName, floatDevice){
            const theTime = new Date();
            if(theTime.getHours() >= 0 && theTime.getHours() < 7){
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
        return {
            checkFloatStatus: checkFloatStatus
        }
};