module.exports = function(options,got,logger) {
    const checkService = require('./checkService.js')(got,logger,options);
    const cron = require('cron').CronJob;
    var job = new cron(
        '0 * * * * *',
        //debug
        // '* * * * * *',
        async () => {
            for (var key in options.floatDevices) {
                if (options.floatDevices.hasOwnProperty(key)) {
                var floatDevice = options.floatDevices[key];
                try{

                    const data = await got.post(options.floatDevices[key].url, {
                        form:{
                        "api_key": options.apiKey,
                        "command":"get_session_status"
                        }
                    });
            
                    try {
                        var floatStatus = data ? JSON.parse(data.body) : null;
                        floatStatus = floatStatus ? JSON.parse(floatStatus.msg) : null;
                    } catch (ex){
                        logger.error(`${key}: failed to parse float status response ${ex}`)
                    }
        
                    
                } catch (ex){
                    logger.error('Failed to get status', ex);
                }
               
                if(floatStatus){
                    checkService.checkFloatStatus(key,floatDevice,floatStatus);
                } else {
                    logger.error(`${key}: couldn't find float status`);
                }
                }
            }
        },
        null,
        true,
        'America/Chicago'
    );
    job.start();
};