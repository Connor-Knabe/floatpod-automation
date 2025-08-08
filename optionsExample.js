module.exports.apiKey = 'API_KEY_GOES_HERE';
module.exports.defaultRGBColor = '255,127,0';
module.exports.defaultSaunaRGBColor = '255,127,0';
// Default hex/name pair used by colorService when no color is specified
module.exports.defaultColor = {
    hex: '#ff7f00',
    name: 'Orange'
};
module.exports.webhookKey = 'WEBHOOK_KEY_GOES_HERE';
module.exports.loggerLevel = 'debug';
const iftttApiKey = 'IFTTT_API_KEY_GOES_HERE';
module.exports.minsInSessionBeforeAlert = 10;

module.exports.ifttt = {
    alertUrl: 'https://maker.ifttt.com/trigger/deviceIsNOTInSession/with/key/'+iftttApiKey,
    noDeviceInSessionUrl: 'https://maker.ifttt.com/trigger/noDeviceInSession/with/key/'+iftttApiKey,
    atLeastOneDeviceInSessionUrl: 'https://maker.ifttt.com/trigger/atleastOneDeviceInSession/with/key/'+iftttApiKey,
    preUrl:'https://maker.ifttt.com/trigger/',
    postUrl:'/with/key/'+iftttApiKey,
    event:{
        fanOn:'_fan_on',
        fanOff:'_fan_off',
        lightOn:'_light_on',
        lightOff:'_light_off',
        lightColorDefault:'_light_default_color',
        lightColorRGB:'_light_rgb_color'
    },
};

module.exports.floatDevices = {
    "Dream Cabin":{
        url:'http://IPHERE/api',
        iftttDeviceName:"cabin",
        minutesInSession:0,
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripRGBColor: null,
        healthCheckUrl:'URLHERE',
        status: null,
        silentStatus: null
    },
    "Dream Pod 1":{
        url:'http://IPHERE/api',
        iftttDeviceName:"pod1",
        minutesInSession:0,
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripRGBColor: null,
        healthCheckUrl:'URLHERE',
        status: null,
        silentStatus: null

    }
}
module.exports.devices = {
    "Infrared Sauna":{
        iftttDeviceName:"sauna",
        lightStripRGBColor: null,
        lightTimeout: null,
        fanStartTimeout: null,
        lightFanOffAfterMins: 90,
        fanOnAfterMins: 45
    }
}

