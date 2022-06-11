module.exports = function(got,logger) {
    const lightFanService = require('./lightFanService.js')(got,logger);

    async function checkFloatStatus(deviceName,floatDevice,floatStatus){
        logger.debug(`${deviceName}: floatStatus ${JSON.stringify(floatStatus)}`);
        const deviceNewSession = floatStatus.status == 1;
        const deviceActiveSession = floatStatus.status==3;
        const idleScreen = floatStatus.status == 0;
      
        if(floatDevice.isNewSession){
          floatDevice.minutesInSession = 0;
          logger.debug("mins set to 0");
        }
        if(deviceActiveSession){
          floatDevice.isNewSession = false;
          const minsTillSessionEnds = floatStatus.duration/60 - 5;
          const activeSessionNonLast5Min = floatStatus.duration/60 != 5;
      
          logger.debug(`${deviceName}: mins in session ${floatDevice.minutesInSession}`);
          logger.debug(`${deviceName}: mins till session ends ${minsTillSessionEnds}`);
          logger.debug(`${deviceName}: duration mins ${floatStatus.duration/60}`);
      
          if(activeSessionNonLast5Min){
            if(floatDevice.minutesInSession >= minsTillSessionEnds){
              logger.info(`${deviceName}: turning light and fan on end of session`);
              await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName,floatDevice);
              floatDevice.minutesInSession = 1;
            } else if (floatDevice.minutesInSession >= 0 && floatDevice.minutesInSession <= 0) {
              logger.info(`${deviceName}: turning fan off 0 mins into active session`);
              //await lightFanService.lightOnOffPreSessionTimer(deviceName, floatDevice);
              await got.get(floatDevice.fanOffUrl);
              floatDevice.minutesInSession = 1
            }
            floatDevice.minutesInSession++;
          } else if(floatDevice.minutesInSession >= 0){
            logger.info(`${deviceName} turning light and fan on manual 5 min timer`);
            await lightFanService.lightAndFanOnOffPostSessionTimer(deviceName, floatDevice);
            floatDevice.minutesInSession = -1;
          }
      
        } else if (deviceNewSession){
          checkForOverNightSession(floatDevice);
          //only want to turn off fan once when in new session screen
          if(floatDevice.minutesInSession==0){
            floatDevice.isNewSession = false;
            logger.info(`${deviceName}: turning fan off when in new session screen`);
            //await lightFanService.lightOnOffPreSessionTimer(deviceName, floatDevice);
            await got.get(floatDevice.fanOffUrl);
            floatDevice.minutesInSession = 1;
          }
          floatDevice.minutesInSession++;
        } else if (idleScreen) {
          floatDevice.isNewSession = true;
          logger.debug(`${deviceName}: no session active screen.`);
          floatDevice.minutesInSession = 0;
        }
      }
    async function checkForOverNightSession(floatDevice){
        const theTime = new Date();
        if(theTime.getHours() >= 0 && theTime.getHours() < 7){
            //send request to take out of session
            logger.info(`${deviceName}: taking out of session overnight`);
            await got.post(floatDevice.url, {
                form:{
                    "api_key": login.apiKey,
                    "command":"set_session_cancel"
                }
            });
        } 
    }
    return {
        checkFloatStatus: checkFloatStatus
    }
};