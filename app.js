var express = require('express'),
  fs = require('fs'),
  https = require('https'),
  db = require('./app/models'),
  system = require('./lib/system'),
  config = require('./lib/config/config').config;


  // TODO: Do not hardcode these values.
var ssl = {
    key: fs.readFileSync('./resources/ssl/ssl.key'),
    cert: fs.readFileSync('./resources/ssl/ssl.crt')
  };

var app = express();
app.locals.machines = [];
require('./lib/config/config').configureMachines(app);
require('./lib/config/express')(app, config);

console.log('Starting up on: ' + config.port);
console.log('  DB: ' + config.db);

db.sequelize
  .sync()
  .then(function () {
    https.createServer(ssl, app).listen(config.port);
    //app.listen(config.port);
  }).catch(function (e) {
    throw new Error(e);
  });

