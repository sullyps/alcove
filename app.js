'use strict';
const DEVEL = (process.env.NODE_ENV !== "production");
const CONFIG = (DEVEL ? "." : "") + "/etc/alcove/alcove.ini";

// Include 3rd party libraries
const express = require('express'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    wrap = require('wordwrapjs'),
    SingleInstance = require('single-instance');

// Include our libraries
const logging = require('./lib/config/log4js'),
    configInit = require('./lib/config/init'),
    models = require('./app/models'),
    system = require('./lib/system');

// Application logger and global Config
let logger, config, db;

// Prevent multiple instances
const locker = new SingleInstance('alcove-backup-system');
locker.lock()
.catch(err => {
  console.error(err);
  console.error('You cannot run more than one instance of the Alcove Backup System at the same time.');
  process.exit(-7);
})
.then(() => {
  // Explicitly warn about non-production modes
  if (DEVEL)
  {
    console.warn("*** Non-production environment        ***");
    console.warn("*** Are you sure you want to do this? ***");
    console.warn("(In a production deployment, you should not ever run 'app.js' directly)\n\n");
  }

  //
  // Config file parsing
  //
  // NOTE: No logger available yet so minimize output and wrap all messages to
  // fit to an 80 character screen.
  // NOTE2: This is intended to be a system service so the config is hardcoded
  //
  return configInit.getConfig(CONFIG);
})
.catch(error => {
  // Record startup error in the log
  let msg = '[Config ERROR] ' + error.message;
  // And output to the console (for immediate feedback to sys-admin)
  console.error(wrap.wrap(msg, {width: 80, noTrim: true}));
  // NOTE: This isn't recommended but until unless we replaced the uncaught
  // exception handler (requires Node >=9.3), it really is the best way.
  process.exit(-3);
})
.then(configuration => {
  config = configuration;
  // If in development mode and an rsync key file is specified, give warning
  // TODO: Change this to a simple ownership / permissions check, it applies to all ENVs
  if (config.rsync.identity)
  {
    console.warn('**  Warning **');
    console.warn('*** You have configured an SSH identity. ***');
    console.warn('Make sure the file permissions for your keys match your backup user,');
    console.warn('or your rsync connections will always fail.');
  }

  //
  // Create the logger as configured
  //
  try
  {
    logging.configure(config);
    logger = logging.getLogger();
  }
  catch(error)
  {
    const msg = '[Config ERROR] ' + error.message;
    console.error(wrap.wrap(msg, {width: 80, noTrim: true}));
    throw(error);
  }

  logger.info(config.app.name + ' v' + config.app.version + ' starting up!');


  //
  // Main Startup chain
  //   1) Load events DB
  //   2) Initialize the Backup system
  //   3) Startup the webapp
  //

  // DB
  logger.debug('Loading the Events DB...');
  db = models.init(config);
  logger.trace('  models.init() complete...');
  return db.sequelize.sync();
})
.catch(err => {
  logger.error('Error loading the Events DB. Check your configuration and data files: ' + err.message);
  logger.debug(err.stack);
  process.exit(-2);
})
.then(() => {
  // System
  logger.debug('Starting main process...');
  return system.init(config, db);
})
.catch(err => {
  logger.error('Error during Alcove Backup System startup: ' + err.message);
  logger.debug(err.stack);
  process.exit(-1);
})
.then(() => {
  // Webapp
  let app = express();
  require('./lib/config/express')(app, config);

  // Start either HTTP or HTTPS server, based on configuration file
  logger.debug('Starting the monitoring web interface...');
  if (config.secure)
  {
    let key = fs.readFileSync(config.secure.key, 'utf-8');
    let cert = fs.readFileSync(config.secure.cert, 'utf-8');
    logger.info('HTTPS Monitoring interface ready and listening on port ' + config.port + '...');
    require('https').createServer({'key': key, 'cert': cert}, app).listen(config.port);
  }
  else
  {
    logger.info('HTTP Monitoring interface ready and listening on port ' + config.port + '...');
    app.listen(config.port);
  }
})
.catch(err => {
  logger.error('Error while starting the Alcove Backup System UI: ' + err.message);
  logger.debug(err.stack);
  process.exit(-1);
});
