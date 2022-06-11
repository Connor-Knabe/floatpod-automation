module.exports = function(login,got,logger) {
    const checkService = require('./checkService.js')(got,logger);
    const cron = require('cron').CronJob;
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
                checkService.checkFloatStatus(key,floatDevice,floatStatus);
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
    // return {
    //     funct: funct,
    // }
};