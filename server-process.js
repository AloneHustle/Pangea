var path    = require('path')
var ssbKeys = require('ssb-keys')

module.exports = function (config, cb) {
  // load config

  // load languages
  var t = require('patchwork-translations')
  t.setLocale(require('os-locale').sync())

  // validate the config
  var configOracle = require('./config')(config)
  if (configOracle.hasError()) {
    if (configOracle.allowUnsafe())
      console.log('\n' + t('unsafeConfigIgnore'))
    else {
      console.log('\n' + t('unsafeConfigAbort'))
      return
    }
  }

  logLicense() // per the GPL's recommendation, let ppl know the license

  console.log(t('Starting'))

  // start sbot
  var createSbot = require('scuttlebot')
    .use(require('scuttlebot/plugins/master'))
    .use(require('./lib/persistent-gossip')) // override
    .use(require('./lib/friends-with-gossip-priority'))
    .use(require('scuttlebot/plugins/replicate'))
    .use(require('ssb-blobs'))
    .use(require('scuttlebot/plugins/invite'))
    .use(require('scuttlebot/plugins/block'))
    .use(require('scuttlebot/plugins/logging'))
    .use(require('scuttlebot/plugins/private'))
    .use(require('scuttlebot/plugins/local'))
    .use(require('ssb-notifier'))
    .use(require('./api'))

  var sbot = createSbot(config)

  // write manifest file
  var fs = require('fs')
  fs.writeFileSync(
    path.join(config.path, 'manifest.json'),
    JSON.stringify(sbot.getManifest(), null, 2)
  )

  // setup server
  var http = require('http')
  var https = require('https')
  var ws = require('pull-ws-server')
  var httpStack = require('./http-server')
  var httpServerFn = httpStack.AppStack(sbot, { uiPath: path.join(__dirname, 'ui') }, configOracle)
  var wsServerFn = require('./ws-server')(sbot)

  var serverOpts = configOracle.useTLS() ? configOracle.getTLS() : {}
  serverOpts.verifyClient = require('./ws-server').verifyClient(configOracle)
  var server = ws.createServer(serverOpts)
  server.on('error', fatalError)
  server.on('connection', wsServerFn)
  server.on('request', httpServerFn)
  server.listen(configOracle.getPort())
  if (cb) {
    server.once('listening', cb)
  }
  console.log(t('ServingAt', {url: configOracle.getLocalUrl()}))

  // basic error handling
  function fatalError (e) {
    if (e.code === 'EADDRINUSE')
      console.error('\n' + t('PortInUse', {port: e.port}) + '\n')
    else
      console.error(e.stack || e.toString())
    process.exit(1)
  }
  process.on('uncaughtException', fatalError)

  function logLicense () {
    console.log(t('LicenseConsole', {years: '2015-2016'}) + '\n')
  }
}
