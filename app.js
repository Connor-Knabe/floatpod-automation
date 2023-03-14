const got = require('got');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
var options = require('./options.js');
const colorService = require('./colorService.js')(options);

app.use(bodyParser.json())

var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = options.loggerLevel;
logger.info("FloatPod automation start" + options.loggerLevel);
logger.error("FloatPod automation error start" + options.loggerLevel);
const lightFanService = require('./lightFanService.js')(got,logger,options);
require('./cronService.js')(options,got,logger,lightFanService);

app.get('/', function (req, res) {
    res.send('200');
});

app.post('/color-'+options.webhookKey, function (req, res) { 
	var roomColor = null;
	var rgbColor = null;
	logger.debug('req',req.body);
    try{
		//needs refactor 

		if(req.body['room_lighting_color']){
			roomColor = colorService.nearestColor(req.body['room_lighting_color']);
			rgbColor = colorService.hexToRgb(req.body['room_lighting_color']);
			rgbColor = `${rgbColor.r},${rgbColor.g},${rgbColor.b}`;
		}

		if(req.body['room_title']=='Infrared Sauna'){
			var sauna = options.devices['Infrared Sauna'];
			if(roomColor && roomColor.name == 'Black'){
				lightFanService.turnLightOff('Infrared Sauna', sauna);
				options.devices[req.body['room_title']].lightStripRGBColor = '0,0,0';
			} else {
				options.devices[req.body['room_title']].lightStripRGBColor = rgbColor;
			}
			logger.debug('roomcolor is',roomColor);
			if(roomColor != null){
				logger.info(`Color is ${roomColor.name} RGB: ${options.devices['Infrared Sauna'].lightStripRGBColor}`);
			} else {
				logger.info(`Color wasn't set for sauna`);
			}
			lightFanService.turnLightOn('Infrared Sauna', sauna);
			lightFanService.turnFanOn('Infrared Sauna', sauna);
			clearTimeout(sauna.lightTimeout);
			sauna.lightTimeout = setTimeout(async () => {
				await lightFanService.turnLightOff('Infrared Sauna', sauna);
				lightFanService.turnFanOff('Infrared Sauna', sauna);
				sauna.lightStripRGBColor = null;
			}, sauna.lightOffAfterMins * 60 * 1000)
		} else {
			if(roomColor && roomColor.name == 'Black'){
				options.floatDevices[req.body['room_title']].lightStripRGBColor = '0,0,0';
			} else {
				options.floatDevices[req.body['room_title']].lightStripRGBColor = rgbColor;
			}
			if(roomColor != null){
				logger.info(`Color is ${roomColor.name} RGB: ${options.floatDevices[req.body['room_title']].lightStripRGBColor}`);
			} else {
				logger.info(`Color wasn't set for ${req.body['room_title']}`);
			}
		}

		
    } catch (ex){
		logger.debug('req.body',req.body);
        logger.error("failed to parse room_lighting_color", ex);
    }
    res.send("OK");
});

app.listen(2336);
