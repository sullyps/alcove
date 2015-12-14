var express = require('express'),
  config = require('./config/config'),
  db = require('./app/models'),
  https = require('https'),
  app = express(),
  fs = require('fs'),
  ssl = {
    key: fs.readFileSync('./resources/ssl/ssl.key'),
    cert: fs.readFileSync('./resources/ssl/ssl.crt')
  };

var app = express();

require('./config/express')(app, config);

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

