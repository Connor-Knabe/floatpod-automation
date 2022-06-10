const got = require('got');
const cron = require('cron').CronJob;
const express = require('express');
const app = express();
const bodyParser = require('body-parser')
app.use(bodyParser.json())

var login = require('./login');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = 'info';
logger.info("FloatPod automation start");
logger.error("FloatPod automation error start");

/*
 * Commands:
"ping",
"get_water_temperature",
"get_controller_temperature",
"get_relay_status",
"get_silence_status",
"set_silence_on",
"set_silence_off",
"get_session_status",
"set_session_start",
"set_session_cancel",
*/

app.get('/', function (req, res) {
  res.send('200');
});

app.post('/color', function (req, res) { 
  try{
    login.floatDevices[req.body['room_title']].lightStripColor = req.body['room_lighting_color'];
  } catch (ex){
    logger.error("failed to parse room_lighting_color", ex)

  }
  //wait until next light on event starts before updating light color
  res.send("OK");
  // res.send('welcome, ' + req.body.color)
});

app.listen(2336);

var job = new cron(
  '0 * * * * *',
  //debug
  // '* * * * * *',
  async () => {
    for (var key in login.floatDevices) {
      if (login.floatDevices.hasOwnProperty(key)) {
        var floatDevice = login.floatDevices[key];
        const data = await got.post(login.floatDevices[key].url, {
          form:{
            "api_key": login.apiKey,
            "command":"get_session_status"
          }
        });

        try {
          var floatStatus = data ? JSON.parse(data.body) : null;
          floatStatus = floatStatus ? JSON.parse(floatStatus.msg) : null;
        } catch (ex){
          logger.error(`${deviceName}: failed to parse float status response ${ex}`)
        }

        if(floatStatus){
          checkSession(key,floatDevice,floatStatus);
        } else {
          logger.error(`${deviceName}: couldn't find float status`);
        }
      }
    }
  },
  null,
  true,
  'America/Chicago'
);
job.start();

async function checkSession(deviceName,floatDevice,floatStatus){
  logger.debug(`${deviceName}: floatStatus ${JSON.stringify(floatStatus)}`);
  if(floatDevice.isNewSession){
    floatDevice.minutesInSession = 0;
    logger.debug("mins set to 0");
  }
  if(floatStatus.status==3){
    floatDevice.isNewSession = false;
    const minsTillSessionEnds = floatStatus.duration/60 - 5;
    logger.debug(`${deviceName}: mins ${floatDevice.minutesInSession}`);
    logger.debug(`${deviceName}: mins till session ends ${minsTillSessionEnds}`);
    logger.debug(`${deviceName}: duration mins ${floatStatus.duration/60}`);
    if(floatStatus.duration/60 != 5){
      if(floatDevice.minutesInSession >= minsTillSessionEnds){
        logger.info(`${deviceName}: turning light and fan on end of session`);
        turnLightAndFanOn(floatDevice);
        turnLightAndFanOffTimer(deviceName,floatDevice);
        floatDevice.minutesInSession = 1;
      } else if (floatDevice.minutesInSession >= 0 && floatDevice.minutesInSession <= 0) {
        logger.info(`${deviceName}: turning fan off 0 mins into active session`);
        await got.get(floatDevice.fanOffUrl);
        floatDevice.minutesInSession = 1
      }
      floatDevice.minutesInSession++;
    } else if(floatDevice.minutesInSession >= 0){
      logger.info(`${deviceName} turning light and fan on manual 5 min timer`);
      turnLightAndFanOn(floatDevice);
      turnLightAndFanOffTimer(floatDevice);
      floatDevice.minutesInSession = -1;
    }

  } else if (floatStatus.status == 1){
    const theTime = new Date();
    if(theTime.getHours() >= 0 && theTime.getHours() < 7){
      //send request to take out of session
      logger.info(`${deviceName}: taking out of session overnight`);
      await got.post(floatDevice.url, {
        form:{
          "api_key": login.apiKey,
          "command":"set_session_cancel"
        }
      });
    } 
    //only want to turn off fan once when in new session screen
    if(floatDevice.minutesInSession==0){
      floatDevice.isNewSession = false;
      logger.info(`${deviceName}: turning fan off when in new session screen`);
      await got.get(floatDevice.fanOffUrl);
      floatDevice.minutesInSession = 1;
    }
    floatDevice.minutesInSession++;
  } else if (floatStatus.status == 0) {
    floatDevice.isNewSession = true;
    logger.debug(`${deviceName}: no session active screen.`);
    floatDevice.minutesInSession = 0;
  }
}

function turnLightAndFanOffTimer(deviceName, floatDevice){
  logger.debug("turnLightAndFanOffTimer");
  clearTimeout(floatDevice.timeout);
  floatDevice.timeout = setTimeout(() => {
    logger.info(`${deviceName}: turning light and fan off after ${floatDevice.timeoutMins}`);
    got.get(floatDevice.fanOffUrl);
    //reset light to original color
    //got.get(floatDevice.lightOffUrl);

    }, floatDevice.timeoutMins * 60 * 1000)
  // }, 0 * 60 * 1000)
}


async function turnLightAndFanOn(floatDevice){
  await got.get(floatDevice.fanOnUrl);
  //floatDevice.lightStripColor
  // await got.get(floatDevice.lightOnUrl);
}
