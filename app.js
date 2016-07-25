var express = require('express'),
  fs = require('fs'),
  http = require('http'),
  https = require('https');

try
{
  // Safely capture any library Errors
  var
    config = require('./lib/config/config').environmentVar,
    logger = require('./lib/config/log4js').configure(config),
    db = require('./app/models'),
    system = require('./lib/system');
  var ssl = {};
  var app = express();
  app.locals.machines = [];


  // Configure the machines and push them to the array of machines.
  require('./lib/config/config').configureMachines(app);
}
catch(error)
{
  if (logger) logger.error('Startup Error:  ' + error.message);
  else console.log('Startup Error:  ' + error.message);
  process.exit(-1);
}
require('./lib/config/express')(app, config);

logger.info('Starting up on: ' + config.environment.port);
logger.info('  DB: ' + config.environment.db_url);

// Sync the database then start the server and the main backup process.
db.sequelize
  .sync()
  .then(function () {
    http.createServer(app).listen(config.environment.port, config.environment.ip);
    if (config.environment.run_securely) {
      try
      {
          ssl.key = fs.readFileSync(config.environment.key);
          ssl.cert = fs.readFileSync(config.environment.cert);
      }
      catch(error)
      {
        logger.error('Please make sure you have correctly defined your ssl key and certification in the backup.ini '+
        'config file, or set the environment.run_securely variable to false.\nError: ' + error.message);
        process.exit(-1);
      }
      https.createServer(ssl, app).listen(config.environment.ssl_port, config.environment.ip);
    }
    else {
      logger.info('Starting the application without using ssl/https');
    }
    system.init(app);
  }).catch(function (e) {
    logger.error('Unable to set up/read from the database.\nError:  ' + e.message);
    process.exit(1);
  });

