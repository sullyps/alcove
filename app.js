var express = require('express'),
  fs = require('fs'),
  http = require('http'),
  https = require('https'),
  db = require('./app/models'),
  system = require('./lib/system'),
  config = require('./lib/config/config').config,
  logger = require('./lib/config/log4js').configure(config);
  ssl = {
    key: fs.readFileSync(config.key),
    cert: fs.readFileSync(config.cert)
  };

var app = express();
app.locals.machines = [];

// Configure the machines and push them to the array of machines.
require('./lib/config/config').configureMachines(app);
require('./lib/config/express')(app, config);

logger.info('Starting up on: ' + config.port);
logger.info('  DB: ' + config.db);

// Sync the database then start the server and the main backup prcess.
db.sequelize
  .sync()
  .then(function () {
    http.createServer(app).listen(config.port, config.ip);
    https.createServer(ssl, app).listen(config.ssl_port, config.ip);
    system.init(app.locals.machines);
  }).catch(function (e) {
    throw new Error(e);
  });

