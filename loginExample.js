module.exports.apiKey = 'keyGoesHere';

module.exports.floatDevices = {
    cabin:{
        url:'http://192.168.0.123/api',
        minutesInSession:0,
        fanOnUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        fanOffUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        lightOnUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        lightOffUrl:'https://maker.ifttt.com/trigger/asdfasdfasdf/with/key/asdfasdfasdf',
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripColor: "hexValue",
        lightsOnPreFloat: false,
        minsSincePreFloatLightOn: 0,
        needToTurnOffPreFloatLight: true,
        preFloatLightOnMins: 7
    }
}