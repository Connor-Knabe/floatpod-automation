const got = require('got');
var cron = require('cron').CronJob;
var login = require('./login');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = 'debug';
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


// exports.main = async () => {
//   const data = await got.post('https://httpbin.org/anything', {
//     json: {
//       hello: 'world'
//     }
//   }).json();
//   return {"data":data};
// }

var job = new cron(
  '15 * * * * *',
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
        var floatStatus = data ? JSON.parse(data.body) : null;
        floatStatus = floatStatus ? JSON.parse(floatStatus.msg) : null;
        if(floatStatus){
          checkSession(key,floatDevice,floatStatus);
        } else {
          logger.error("Couldn't find float status");
        }
      }
    
    }

    
  },
  null,
  true,
  'America/Chicago'
);
job.start();

function checkSession(deviceName,floatDevice,floatStatus){
  logger.debug("FloatStatus",floatStatus);
  if(floatStatus.status==3){
    const minsTillSessionEnds = (floatStatus.duration/60 - 5);
    floatDevice.minutes++;

    if(floatDevice.minutes > minsTillSessionEnds){
      //send request to turn on fan
    } else if (floatDevice.minutes > 1) {
      //send request to turn fan off
    }
    logger.debug('status',floatStatus);
    logger.debug('name',deviceName)
    logger.debug('floatdevice min', floatDevice.minutes);
  } else if (floatStatus.status == 1){
    floatDevice.minutes++;
    if(floatDevice.minutes > 10){
      //send request to take out of session
      floatDevice.minutes = 0;
    } 
  } else if (floatStatus.status == 0) {
    floatDevice.minutes = 0;
  }
}