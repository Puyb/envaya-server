'use strict';
const express = require('express')
const busboy = require('connect-busboy');
const bodyparser = require('body-parser');
const config = require('./config');

const app = express()
app.use(busboy({ immediate: true }));
app.use(bodyparser.json());

app.post('/envaya/', (req, res) => {
    console.log('New Request');
    const params = {};
    req.busboy.on('field', (key, value) => params[key] = value);
    req.busboy.on('file', (key, stream, fileName, encoding, mimeType) => {
        stream.on('data', data => {});
        console.log('file', key, fileName);
    });

    req.busboy.on('finish', () => {
        const { action } = params;
        console.log(action, events.length);

        actions[action](params);

        res.json({
            events: events.splice(0)
        });
    });
});
const events = [];

app.post('/send/', (req, res) => {
    const params = {};
    req.busboy.on('field', (key, value) => {
        console.log(key, value);
        params[key] = value;
    });
    req.busboy.on('file', (key, stream, fileName, encoding, mimeType) => {
        stream.on('data', data => {});
        console.log('file', key, fileName);
    });

    req.busboy.on('finish', () => {
        const token = req.headers.authorization;
        if (!config.tokens.includes(token)) {
            return res.json({ ok: false });
        }
        console.log(params);
        events.push({
            event: 'send',
            messages: [{ ...params }],
        });
        res.json({ ok: true });
    });
});

app.post('/alert/', (req, res) => {
    const { imageUrl, message, title } = req.body;
    console.log(imageUrl, message, title);
    events.push({
        event: 'send',
        messages: [{ 
            to: req.query.to,
            message: `Grafana Alert
${title}
${message}
${imageUrl}`,
        }],
    });
    res.send('');
});


const actions = {
    outgoing: (options) => {
    },
    incoming: (options) => {
        const { from, message_type, message, timestamp, mms_parts = [] } = options;
        console.log('From:', from);
        console.log(message);
        for (const part of JSON.parse(mms_parts)) {
            console.log(part);
        }
    },
    send_status: (options) => {
    },
    device_status: (options) => {
    },
    test: (options) => {
    },
    amqp_started: (options) => {
    },
    forward_sent: (options) => {
    },
};

app.listen(3000, () => console.log('Example app listening on port 3000!'))
