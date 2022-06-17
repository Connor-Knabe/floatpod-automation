const { urlencoded } = require("body-parser");

module.exports = function (got, logger, options) {
    async function turnLightOn(deviceName, floatDevice) {
        var rgbColor = floatDevice.lightStripRGBColor ? floatDevice.lightStripRGBColor : options.defaultRGBColor;
        if(rgbColor != '0,0,0'){
            logger.info(`turning ${deviceName} light on and to color ${rgbColor}`)
            const lightColorUrl = generateIftttURL(floatDevice, options.ifttt.event.lightColorRGB);
            await got.post(lightColorUrl, {
                json: {
                    value1: rgbColor
                }
            });
            floatDevice.lightStripRGBColor = null;
        } else {
            logger.info(`Not turning light on as it's set to black`);
            floatDevice.lightStripRGBColor = null;

        }
       
    }

    async function turnLightOff(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} light off`)
        const lightOffUrl = generateIftttURL(floatDevice, options.ifttt.event.lightOff);
        await got.get(lightOffUrl);
        clearTimeout(floatDevice.postSessionLightFanTimeout);
    }

    async function turnFanOn(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} fan on`);
        const fanOnUrl = generateIftttURL(floatDevice, options.ifttt.event.fanOn);
        await got.get(fanOnUrl);
    }

    async function turnFanOff(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} fan off`);
        const fanOffUrl = generateIftttURL(floatDevice, options.ifttt.event.fanOff);
        await got.get(fanOffUrl);
        clearTimeout(floatDevice.postSessionLightFanTimeout);
    }

    async function lightAndFanOnOffPostSessionTimer(deviceName, floatDevice) {
        logger.debug("turnLightAndFanOnOffTimer", deviceName);
        await turnFanOn(deviceName, floatDevice);
        await turnLightOn(deviceName, floatDevice);
        clearTimeout(floatDevice.postSessionLightFanTimeout);
        floatDevice.postSessionLightFanTimeout = setTimeout(async () => {
            logger.info(`${deviceName}: turning fan off after ${floatDevice.postSessionLightFanTimeoutMins}`);
            await turnFanOff(deviceName, floatDevice)
            await turnLightOff(deviceName, floatDevice);

        }, floatDevice.postSessionLightFanTimeoutMins * 60 * 1000)
    }

    function generateIftttURL(floatDevice, event) {
        var url = options.ifttt.preUrl + floatDevice.iftttDeviceName + event + options.ifttt.postUrl;
        return url;
    }

    return {
        lightAndFanOnOffPostSessionTimer: lightAndFanOnOffPostSessionTimer,
        turnLightOff: turnLightOff,
        turnFanOff: turnFanOff
    }
};