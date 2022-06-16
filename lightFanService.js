const { urlencoded } = require("body-parser");

module.exports = function (got, logger, options) {

    async function turnLightOn(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} light on`)
        // const deviceColor = floatDevice.lightStripColorUrl;
        // await got.get(floatDevice.lightStripColorUrl[deviceColor]);
        // setCustomLightColor(deviceName, floatDevice);

        setDefaultLightColor(deviceName, floatDevice);
        // const lightOnUrl = generateIftttURL(floatDevice,options.ifttt.event.lightOn);
        // await got.get(lightOnUrl);    

        // await got.get(floatDevice.lightOnUrl);    
    }



    async function setCustomLightColor(deviceName, floatDevice) {
        // const deviceColor = floatDevice.lightStripColorUrl;
        // await got.get(floatDevice.lightStripColorUrl[deviceColor]);
        var rgbColor = floatDevice.lightStripRGBColor ? floatDevice.lightStripRGBColor : "255,127,0";

        logger.info(`turning ${deviceName} light on and to color ${rgbColor}`)
        const lightColorUrl = generateIftttURL(floatDevice, options.ifttt.event.lightColorRGB);
        await got.post(lightColorUrl, {
            json: {
                "value1": `${floatDevice.lightStripRGBColor}`
            }
        }).json();


        // await got.get(floatDevice.lightOnUrl);    
    }

    async function setDefaultLightColor(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} light to color ${floatDevice.lightStripRGBColor}`)
        // const deviceColor = floatDevice.lightStripColorUrl;
        // await got.get(floatDevice.lightStripColorUrl[deviceColor]);
        const lightColorUrl = generateIftttURL(floatDevice, options.ifttt.event.lightColorDefault);
        await got.get(lightColorUrl);
    }

    async function turnLightOff(deviceName, floatDevice) {
        logger.info(`turning ${deviceName} light off`)

        const lightOffUrl = generateIftttURL(floatDevice, options.ifttt.event.lightOff);
        await got.get(lightOffUrl);

        // await got.get(floatDevice.lightOffUrl);
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
    }

    async function lightAndFanOnOffPostSessionTimer(deviceName, floatDevice) {
        logger.debug("turnLightAndFanOnOffTimer", deviceName);
        await turnFanOn(deviceName, floatDevice);
        // await got.get(floatDevice.fanOnUrl);
        //turn light on
        turnLightOn(deviceName, floatDevice);
        clearTimeout(floatDevice.postSessionLightFanTimeout);
        floatDevice.postSessionLightFanTimeout = setTimeout(async () => {
            logger.info(`${deviceName}: turning fan off after ${floatDevice.postSessionLightFanTimeoutMins}`);

            turnFanOff(deviceName, floatDevice)
            // await got.get(floatDevice.fanOffUrl);
            //reset light to original color
            // await got.get(floatDevice.lightColorDefaultUrl);
            // await got.get(floatDevice.lightOffUrl);

            floatDevice.lightStripRGBColor = null;
            // await setCustomLightColor(deviceName, floatDevice);

            await turnLightOff(deviceName, floatDevice);

            // const lightOffUrl = generateIftttURL(floatDevice,options.ifttt.event.lightOff);
            // await got.get(lightOffUrl);    

        }, floatDevice.postSessionLightFanTimeoutMins * 60 * 1000)
        // }, 0 * 60 * 1000)
    }

    function generateIftttURL(floatDevice, event) {
        var url = options.ifttt.preUrl + floatDevice.iftttDeviceName + event + options.ifttt.postUrl;
        logger.debug(url);
        return url;
    }



    return {
        lightAndFanOnOffPostSessionTimer: lightAndFanOnOffPostSessionTimer,
        turnLightOff: turnLightOff,
        turnFanOff: turnFanOff
    }
};