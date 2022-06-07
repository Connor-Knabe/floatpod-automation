const got = require('got');
var cron = require('cron').CronJob;
var login = require('./login');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = 'info';
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

logger.info("App start");
var job = new cron(
  '0 * * * * *',
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
  if(floatStatus.status==3){
    const minsTillSessionEnds = floatStatus.duration/60 - 5;
    logger.debug(`${deviceName}: mins ${floatDevice.minutesInSession}`);
    logger.debug(`${deviceName}: mins till session ends ${minsTillSessionEnds}`);
    if(floatStatus.duration/60 != 5){
      if(floatDevice.minutesInSession >= minsTillSessionEnds){
        logger.info(`${deviceName}: turning fan on end of session`);
        await got.get(floatDevice.fanOnUrl);
        floatDevice.minutesInSession = 0;
      } else {
        floatDevice.minutesInSession++;
      }
    } else if(floatDevice.minutesInSession > 1){
      logger.info(`${deviceName} turning fan on manual 5 min timer`);
      await got.get(floatDevice.fanOnUrl);
      floatDevice.minutesInSession = 1;
    }

    // logger.debug('status',floatStatus);
  } else if (floatStatus.status == 1){
    const theTime = new Date();
    if(floatDevice.minutesInSession > 60 && (theTime.getHours() >= 0 && theTime.getHours() < 6)){
      //send request to take out of session
      logger.info(`${deviceName}: taking out of session as it's been over 60 mins and overnight`);
      await got.post(floatDevice.url, {
        form:{
          "api_key": login.apiKey,
          "command":"set_session_cancel"
        }
      });
    } 
    //only want to turn off fan once when in new session screen
    if(floatDevice.minutesInSession==0){
      logger.info(`${deviceName}: turning fan off when in new session screen`);
      await got.get(floatDevice.fanOffUrl);
    }
    floatDevice.minutesInSession++;
  } else if (floatStatus.status == 0) {
    logger.debug(`${deviceName}: no session active screen.`);
    floatDevice.minutesInSession = 0;
  }
}