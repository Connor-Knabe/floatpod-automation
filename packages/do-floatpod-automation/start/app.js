const got = require('got');

var cron = require('cron').CronJob;
var login = require('./login');
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
exports.main = async (args) => {

  const data = await got.post('https://httpbin.org/anything', {
    json: {
      hello: 'world'
    }
  }).json();

  return {"data":data};
}
