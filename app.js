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


require('./cronService.js')(options,got,logger);



app.get('/', function (req, res) {
    res.send('200');
});

app.post('/color-'+options.webhookKey, function (req, res) { 
	var roomColor = null;
	var rgbColor = null;
	logger.debug('req',req.body);
    try{
		if (req.body['room_title']=='Dream Cabin'){
			roomColor = colorService.nearestColor(req.body['room_lighting_color']);
			rgbColor = colorService.hexToRgb(req.body['room_lighting_color']);
			rgbColor = `${rgbColor.r},${rgbColor.g},${rgbColor.b}`;
			if(roomColor.name == 'Black'){
				options.floatDevices[req.body['room_title']].lightStripRGBColor = '0,0,0';
			} else {
				options.floatDevices[req.body['room_title']].lightStripRGBColor = rgbColor;
			}
			logger.info(`Color is ${roomColor.name} RGB: ${options.floatDevices[req.body['room_title']].lightStripRGBColor}`);
		}

    } catch (ex){
		logger.debug('req.body',req.body);
        logger.error("failed to parse room_lighting_color", ex);
    }
    res.send("OK");
});

app.listen(2336);
