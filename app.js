const got = require('got');
const express = require('express');
const app = express();
const options = require('./options.js');
const colorService = require('./colorService.js')(options);
const { formatChicagoTime } = require('./timeUtils.js');

app.use(express.json());

const log4js = require('log4js');
const logger = log4js.getLogger();
logger.level = options.loggerLevel;
logger.info(`FloatPod automation start ${options.loggerLevel}`);
const lightFanService = require('./lightFanService.js')(got, logger, options);

// Track last webhook update time and last session end time
let lastWebhookUpdate = null;
let lastSessionEndTime = null;

function markWebhook(source) {
    lastWebhookUpdate = Date.now();
    logger.debug(`${source} update received at: ${formatChicagoTime(lastWebhookUpdate)}`);
}

async function relayFloatHelmColor(roomTitle, hexColor) {
    const controlPlaneUrl = process.env.FLOATPOD_CONTROL_PLANE_URL;
    const bypassToken = process.env.SITES_BYPASS_TOKEN;
    if (!controlPlaneUrl || !bypassToken) {
        return false;
    }
    const endpoint = new URL(`/color-${options.webhookKey}`, controlPlaneUrl);
    if (endpoint.protocol !== 'https:') {
        throw new Error('FLOATPOD_CONTROL_PLANE_URL must use HTTPS');
    }
    await got.post(endpoint, {
        json: {
            room_title: roomTitle,
            room_lighting_color: hexColor
        },
        headers: {
            'OAI-Sites-Authorization': `Bearer ${bypassToken}`
        },
        timeout: 10000,
        retry: 0
    });
    return true;
}

// Pass getters to cronService
require('./cronService.js')(options, got, logger, lightFanService,
    () => lastWebhookUpdate,  // getLastWebhookUpdate
    () => lastSessionEndTime,  // getLastSessionEndTime
    (time) => {
        lastSessionEndTime = time;
        logger.debug(`Updated last session end time to: ${time ? formatChicagoTime(time) : 'null'}`);
    }  // setLastSessionEndTime
);

// Perform initial health check for all devices on startup
function performInitialHealthChecks() {
    logger.debug('Performing initial health checks for all devices');
    for (const [deviceName, device] of Object.entries(options.floatDevices || {})) {
        if (device.healthCheckUrl) {
            logger.debug(`${deviceName}: Making initial health check`);
            got.get(device.healthCheckUrl, { timeout: 10000, retry: 0 })
                .then(() => logger.info(`${deviceName}: Initial health check successful`))
                .catch(ex =>
                    logger.error(`${deviceName}: Initial health check failed: ${ex.message}`)
                );
        }
    }
}

// Run initial health checks after a short delay to allow other initialization to complete
setTimeout(performInitialHealthChecks, 5000);

app.get('/', function (req, res) {
    res.send('200');
});

app.get(`/motion-${options.webhookKey}`, (req, res) => {
    markWebhook('Motion');
    res.send('200');
});

app.post(`/checkout-${options.webhookKey}`, (req, res) => {
    markWebhook('Checkout');
    res.send('200');
});

app.post(`/color-${options.webhookKey}`, async (req, res) => {
    markWebhook('Color');
    try {
        const { room_lighting_color: hexColor, room_title: roomTitle } = req.body;
        let roomColor = null;
        let rgbColor = null;

        if (hexColor) {
            roomColor = colorService.nearestColor(hexColor);
            const rgb = colorService.hexToRgb(hexColor);
            if (rgb) {
                rgbColor = `${rgb.r},${rgb.g},${rgb.b}`;
            }
        }

        if (roomTitle === 'Infrared Sauna') {
            const sauna = options.devices['Infrared Sauna'];
            if (roomColor && roomColor.name === 'Black') {
                lightFanService.turnLightOff('Infrared Sauna', sauna);
                sauna.lightStripRGBColor = '0,0,0';
            } else if (rgbColor) {
                sauna.lightStripRGBColor = rgbColor;
            }
            logger.debug('roomcolor is', roomColor);
            logger.info(roomColor ? `Color is ${roomColor.name} RGB: ${sauna.lightStripRGBColor}` : `Color wasn't set for sauna`);

            lightFanService.turnLightOn('Infrared Sauna', sauna);
            clearTimeout(sauna.fanStartTimeout);
            sauna.fanStartTimeout = setTimeout(async () => {
                await lightFanService.turnFanOn('Infrared Sauna', sauna);
            }, sauna.fanOnAfterMins * 60 * 1000);

            clearTimeout(sauna.lightTimeout);
            sauna.lightTimeout = setTimeout(async () => {
                await lightFanService.turnLightOff('Infrared Sauna', sauna);
                await lightFanService.turnFanOff('Infrared Sauna', sauna);
                sauna.lightStripRGBColor = null;
            }, sauna.lightFanOffAfterMins * 60 * 1000);
        } else {
            const device = options.floatDevices[roomTitle];
            if (device) {
                if (roomColor && roomColor.name === 'Black') {
                    device.lightStripRGBColor = '0,0,0';
                } else if (rgbColor) {
                    device.lightStripRGBColor = rgbColor;
                }
                logger.info(roomColor ? `Color is ${roomColor.name} RGB: ${device.lightStripRGBColor}` : `Color wasn't set for ${roomTitle}`);
            }
        }
        if (roomTitle !== 'Infrared Sauna' && roomTitle && hexColor) {
            const relayed = await relayFloatHelmColor(roomTitle, hexColor);
            if (relayed) {
                logger.info(`Relayed customer color to control plane for ${roomTitle}`);
            }
        }
    } catch (ex) {
        logger.error(`failed to parse room_lighting_color: ${ex.message}`);
        return res.status(502).send('Color update could not be completed');
    }
    res.send('OK');
});

app.listen(2336);
