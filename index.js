'use strict'
const express = require('express')
const busboy = require('connect-busboy')
const bodyparser = require('body-parser')
const auth = require('basic-auth')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const graphite = require('graphite')
const config = require('./config')

const client = graphite.createClient(config.graphiteUrl)

let storagePath = config.storagePath
if (/^\.\//.test(storagePath)) { storagePath = path.join(__dirname, storagePath) }
let lastImage

const app = express()
app.use(busboy({ immediate: true }))
app.use(bodyparser.json())

app.post('/envaya/', (req, res) => {
  console.log('POST /envaya/')
  const params = {}
  req.busboy.on('field', (key, value) => { params[key] = value })
  req.busboy.on('file', (key, stream, fileName, encoding, mimeType) => {
    stream.on('data', data => {})
    console.log('file', key, fileName)
  })

  req.busboy.on('finish', () => {
    const { action } = params
    console.log(action, events.length)

    const keys = Object.keys(params)
    keys.sort()
    const hash = crypto.createHash('sha1')
    hash.update(`https://${req.headers['x-forwarded-server']}${req.path}`)
    for (const key of keys) {
      hash.update(`,${key}=${params[key]}`)
    }
    hash.update(`,${config.password}`)
    if (req.headers['x-request-signature'] !== hash.digest('base64')) {
      console.log('wrong password')
      res.statusCode = 403
      res.end('')
      return
    }

    actions[action](params)

    res.json({
      events: events.splice(0)
    })
  })
})
const events = []
const actions = {
  outgoing: (options) => {
      console.log(options);
    const metrics = {
      [`supervision.envaya.${options.phone_number}.battery`]: options.battery,
      [`supervision.envaya.${options.phone_number}.power`]: options.power
    }

    client.write(metrics, err => {
      if (err) {
        console.error(err)
        process.exit(1)
      }
    })
  },
  incoming: ({ from, message_type: messageType, message, timestamp, mms_parts = [] }) => {
    console.log('From:', from)
    console.log(message)
    for (const part of JSON.parse(mms_parts)) {
      console.log(part)
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
  }
}

const deny = (req, res) => {
  const credentials = auth(req)
  if (!credentials || config.auth[credentials.name] !== credentials.pass) {
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic realm="example"')
    res.end('Access denied')
    return true
  }
  return false
}

app.post('/send/', (req, res) => {
  console.log('POST /send/')
  if (deny(req, res)) return

  const params = {}
  req.busboy.on('field', (key, value) => {
    console.log(key, value)
    params[key] = value
  })
  req.busboy.on('file', (key, stream, fileName, encoding, mimeType) => {
    stream.on('data', data => {})
    console.log('file', key, fileName)
  })

  req.busboy.on('finish', () => {
    events.push({
      event: 'send',
      messages: [{ ...params }]
    })
    res.json({ ok: true })
  })
})

let supervisionTestTimeout
let supervisionTestStatus = true
app.post('/alert/', (req, res) => {
  console.log('POST /alert/')
  if (deny(req, res)) return

  const { imageUrl, message, title, evalMatches } = req.body
  if (/Envaya test value alert/.test(title)) {
    if (!supervisionTestStatus) {
      supervisionTestStatus = true
      events.push({
        event: 'send',
        messages: [{
          to: req.query.to,
          message: `Grafana is up`
        }]
      })
    }
    clearTimeout(supervisionTestTimeout)
    supervisionTestTimeout = setTimeout(() => {
      supervisionTestStatus = false
      events.push({
        event: 'send',
        messages: [{
          to: req.query.to,
          message: `Grafana is down`
        }]
      })
    }, 5 * 60000)
  } else {
    events.push({
      event: 'send',
      messages: [{
        to: req.query.to,
        message: `Grafana Alert
    ${title}
    ${message || ''} ${evalMatches.map(ev => `${ev.metric} = ${ev.value}`).join(', ')}
    ${imageUrl || lastImage || ''}`
      }]
    })
  }
  res.send('')
})

const getFilename = req => {
  return path.join(storagePath, path.basename(req.path))
}

app.put(/^\/storage/, (req, res) => {
  console.log('PUT /storage')
  if (deny(req, res)) return

  if (req.headers['content-size'] > 1024 * 1024) {
    res.statusCode = 400
    res.end('Too big')
    return
  }

  const filename = getFilename(req)
  const file = fs.createWriteStream(filename)
  req.pipe(file)
  req.on('end', () => {
    lastImage = `https://${req.headers['x-forwarded-server']}${req.path}`
    file.close()
    res.status = 201
    res.end()
  })
})

app.use(/^\/storage/, express.static(storagePath, { index: false }))

// test graphana supervision
let testValue = 0
setInterval(() => {
  testValue = (testValue + 1) % 24
  client.write({
    'supervision.test': testValue
  }, err => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
  })
}, 10000)

app.listen(config.port || 3000, () => console.log(`Listening on ${config.port || 3000}`))
