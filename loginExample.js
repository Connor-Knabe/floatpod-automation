module.exports.apiKey = 'keyGoesHere';

module.exports.floatDevices = {
    cabin:{
        url:'http://192.168.0.123/api',
        minutesInSession:0,
        fanOnUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        fanOffUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        // lightOnUrl:'',
        // lightOffUrl:'',
        isNewSession: true,
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        preSessionLightTimeout: null,
        preSessionLightTimeoutMins: 7,
        lightStripColor: "hexValue",
        lightsOnPreFloat: false
    }
}