module.exports = function(got,logger) {

    async function turnLightOn(deviceName, floatDevice){
        logger.info(`turning ${deviceName} light on`)
        await got.get(floatDevice.lightOnUrl);    }

    async function turnLightOff(deviceName, floatDevice){
        logger.info(`turning ${deviceName} light off`)
        await got.get(floatDevice.lightOffUrl);
        floatDevice.needToTurnOffPreFloatLight = false;
    }



    async function lightAndFanOnOffPostSessionTimer(deviceName, floatDevice){
        logger.debug("turnLightAndFanOnOffTimer", deviceName);
        floatDevice.needToTurnOffPreFloatLight = false;
        
        await got.get(floatDevice.fanOnUrl);
        //turn light on
        turnLightOn(deviceName, floatDevice);

        clearTimeout(floatDevice.postSessionLightFanTimeout);
        floatDevice.postSessionLightFanTimeout = setTimeout(async () => {
            logger.info(`${deviceName}: turning fan off after ${floatDevice.postSessionLightFanTimeoutMins}`);
            await got.get(floatDevice.fanOffUrl);
            //reset light to original color
            got.get(floatDevice.lightOffUrl);

            }, floatDevice.postSessionLightFanTimeoutMins * 60 * 1000)
        // }, 0 * 60 * 1000)
    }
      return {
		lightAndFanOnOffPostSessionTimer: lightAndFanOnOffPostSessionTimer,
        turnLightOn:turnLightOn,
        turnLightOff:turnLightOff
      }
};