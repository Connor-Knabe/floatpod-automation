module.exports = function(got,logger) {
    async function lightAndFanOnOffPostSessionTimer(deviceName, floatDevice){
        logger.debug("turnLightAndFanOnOffTimer", deviceName);

        await got.get(floatDevice.fanOnUrl);
        //turn light on
        await got.get(floatDevice.lightOnUrl);

        clearTimeout(floatDevice.postSessionLightFanTimeout);
        floatDevice.postSessionLightFanTimeout = setTimeout(async () => {
            logger.info(`${deviceName}: turning fan off after ${floatDevice.postSessionLightFanTimeoutMins}`);
            await got.get(floatDevice.fanOffUrl);
            //reset light to original color
            got.get(floatDevice.lightOffUrl);

            }, floatDevice.postSessionLightFanTimeoutMins * 60 * 1000)
        // }, 0 * 60 * 1000)
    }

    async function lightOnOffPreSessionTimer(deviceName, floatDevice){
        if(floatDevice.lightsOnPreFloat){
            //floatDevice.lightStripColor

            logger.info(`${deviceName}: turning light on for ${floatDevice.preSessionLightTimeout}`);
            clearTimeout(floatDevice.preSessionLightTimeout);
            floatDevice.preSessionLightTimeout = setTimeout(async () => {
                logger.info(`${deviceName}: turning light off after timeout ${floatDevice.preSessionLightTimeoutMins}`);
                await got.get(floatDevice.lightOffUrl);
                //reset light to original color
                //got.get(floatDevice.lightOffUrl);

                }, floatDevice.preSessionLightTimeoutMins * 60 * 1000)
            }
    }
      return {
		lightAndFanOnOffPostSessionTimer: lightAndFanOnOffPostSessionTimer,
        lightOnOffPreSessionTimer:lightOnOffPreSessionTimer
      }
};