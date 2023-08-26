module.exports = function(options,got,logger, lightFanService) {
    const checkService = require('./checkService.js')(got,logger,options,lightFanService);
    const cron = require('cron').CronJob;
    var job = new cron(
        '0 * * * * *',
        //debug
        // '* * * * * *',
        async () => {
            for (var key in options.floatDevices) {
                if (options.floatDevices.hasOwnProperty(key)) {
                    var floatDevice = options.floatDevices[key];
                    try {
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

                        logger.debug("before calling float device");

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

                        logger.debug("after calling float device");
                        logger.debug("float status",floatStatus);


                        const silentData = await got.post(options.floatDevices[key].url, {
                            form:{
                            "api_key": options.apiKey,
                            "command":"get_silence_status"
                            }
                        });
                        

                        var silentStatus = null;
                        try {
                            silentStatus = silentData ? JSON.parse(silentData.body) : null;
                            silentStatus = silentStatus ? silentStatus.msg : null;
                        } catch (ex){
                            logger.error(`${key}: failed to parse silent status response ${ex}`)
                        }

                        if(floatStatus["status"] != undefined){
                            checkService.checkFloatStatus(key,floatDevice,floatStatus,silentStatus);
                            got.get(options.floatDevices[key].healthCheckUrl);
                        } else {
                            logger.error(`${key}: couldn't find float status`);
                        }
                    } catch (ex){
                        logger.error('Failed to get status', ex);
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