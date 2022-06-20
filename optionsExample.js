module.exports.apiKey = 'dreampodAPIKeyHere';
module.exports.webhookKey = 'asdfasdf';
module.exports.defaultColor = {
    "hex": "#ffa500",
    "name": "Orange",
};
module.exports.floatDevices = {
    "Dream Cabin":{
        url:'http://ipaddressgoeshere/api',
        minutesInSession:0,
        fanOnUrl:'https://maker.ifttt.com/trigger/turn_floatroom_fan_on/with/key/APIKEYGOESHERE',
        fanOffUrl:'https://maker.ifttt.com/trigger/turn_floatroom_fan_off/with/key/APIKEYGOESHERE',
        lightOnUrl:'https://maker.ifttt.com/trigger/floatroom_light_on/with/key/APIKEYGOESHERE',
        lightOffUrl:'https://maker.ifttt.com/trigger/floatroom_light_off/with/key/APIKEYGOESHERE',
        lightColorDefaultUrl:'https://maker.ifttt.com/trigger/floatroom_light_default_color/with/key/APIKEYGOESHERE',
        postSessionLightFanTimeout: null,
        postSessionLightFanTimeoutMins: 25,
        lightStripColor: "color",
        defaultColor: {
            "hex": "#ffa500",
            "name": "Orange",
        },
        lightStripColorUrl: { 
            "Red":'https://maker.ifttt.com/trigger/floatroom_light_red_color/with/key/APIKEYGOESHERE',
            "Orange":'https://maker.ifttt.com/trigger/floatroom_light_orange_color/with/key/APIKEYGOESHERE',
            "Yellow":'https://maker.ifttt.com/trigger/floatroom_light_yellow_color/with/key/APIKEYGOESHERE',
            "Green":'https://maker.ifttt.com/trigger/floatroom_light_green_color/with/key/APIKEYGOESHERE',
            "Blue":'https://maker.ifttt.com/trigger/floatroom_light_blue_color/with/key/APIKEYGOESHERE',
            "Indigo":'https://maker.ifttt.com/trigger/floatroom_light_indigo_color/with/key/APIKEYGOESHERE',
            "Purple":'https://maker.ifttt.com/trigger/floatroom_light_purple_color/with/key/APIKEYGOESHERE',
            "White":'https://maker.ifttt.com/trigger/floatroom_light_white_color/with/key/APIKEYGOESHERE',
            "Black":'https://maker.ifttt.com/trigger/floatroom_light_off/with/key/APIKEYGOESHERE',
        },
        lightsOnPreFloat: false,
        preFloatLightOnMins: 7
    }
}
