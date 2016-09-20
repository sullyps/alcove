'use strict';

// Include 3rd party libraries
var express = require('express'),
  fs = require('fs'),
  http = require('http'),
  https = require('https');
// TODO:
//  wrap = require('word-wrap');

// Include our libraries
var logging = require('./lib/config/log4js'),
  init = require('./lib/config/init'),
  models = require('./app/models'),
  system = require('./lib/system');

// Application logger and global Config
var logger = logging.getLogger();
var config, db;

// Config
try
{
  logger.debug('Processing configuration...');
  config = init.getConfig();
  logger.debug('Configured!');
}
catch (error)
{
  // TODO: Perhaps command line output wrapper to 80 cols here instead
  logger.error('Error processing configuration file: ' + error.message);
  logger.debug(error.stack);
  process.exit(-3);
}

logger.info(config.app.name + ' v' + config.app.version + ' starting up!');


// Startup chain
new Promise(function(resolve, reject) {
  // DB
  logger.debug('Loading the Events DB...');
  db = models.init(config);
  logger.trace('  models.init() complete...');
  resolve(db.sequelize.sync());
})
.catch(function(err) {
  logger.error('Error loading the Events DB. Check your configuration and data files: ' + error.message);
  logger.debug(error.stack);
  process.exit(-2);
})
.then(function() {
  // System
  return new Promise(function(resolve, reject) {
    logger.debug('Starting main process...');
    system.init(config, db);
    resolve();
  });
})
.catch(function(err) {
  logger.error('Error during Backup System startup: ' + error.message);
  logger.debug(error.stack);
  process.exit(-1);
})
.then(function() {
  // Webapp
  // TODO
});

/*try
{
  // Safely capture any library Errors

  var ssl = {};
  var app = express();
  app.locals.machines = [];


  // Configure the machines and push them to the array of machines.
  config.configureMachines(app);
}
catch(error)
{
  if (logger) logger.error('Startup Error:  ', error);
  else console.log('Startup Error:  ', error.stack);
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
*/
