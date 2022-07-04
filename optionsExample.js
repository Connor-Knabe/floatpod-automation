module.exports.apiKey = 'API_KEY_GOES_HERE';
module.exports.defaultRGBColor = '255,127,0';
module.exports.webhookKey = 'WEBHOOK_KEY_GOES_HERE';
module.exports.loggerLevel = 'debug';
const iftttApiKey = 'IFTTT_API_KEY_GOES_HERE';
module.exports.ifttt = {
    preUrl:'https://maker.ifttt.com/trigger/',
    postUrl:'/with/key/'+iftttApiKey,
    event:{
        fanOn:'_fan_on',
        fanOff:'_fan_off',
        lightOn:'_light_on',
        lightOff:'_light_off',
        lightColorDefault:'_light_default_color',
        lightColorRGB:'_light_rgb_color',
    }
};

module.exports.floatDevices = {
    "Dream Cabin":{
        url:'http://IPHERE/api',
        iftttDeviceName:"cabin",
        minutesInSession:0,
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripRGBColor: null,
        healthCheckUrl:'https://hc-ping.com/38193a04-d6d6-4262-8eea-ae6c48e1e9ec'
    },
    "Dream Pod 1":{
        url:'http://IPHERE/api',
        iftttDeviceName:"pod1",
        minutesInSession:0,
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripRGBColor: null,
        healthCheckUrl:'https://hc-ping.com/b8e5d846-e93b-4778-912a-3d67f1753186'

    }
}
module.exports.devices = {
    "Infrared Sauna":{
        iftttDeviceName:"sauna",
        lightStripRGBColor: null,
        lightTimeout: null,
        lightOffAfterMins: 90,
    }
}

