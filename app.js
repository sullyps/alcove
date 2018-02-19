'use strict';
const DEVEL = (process.env.NODE_ENV !== "production");
const CONFIG = (DEVEL ? "." : "") + "/etc/backup/backup.ini";
// Explicitly warn about non-production modes
if (DEVEL)
{
  console.log("*** Non-production environment        ***");
  console.log("*** Are you sure you want to do this? ***");
  console.log("(In a production deployment, you should not ever run 'app.js' directly)\n\n");
}

// Include 3rd party libraries
var express = require('express'),
  fs = require('fs'),
  http = require('http'),
  https = require('https'),
  wrap = require('wordwrapjs');

// Include our libraries
var logging = require('./lib/config/log4js'),
  configInit = require('./lib/config/init'),
  models = require('./app/models'),
  system = require('./lib/system');

// Application logger and global Config
var logger, config, db;

//
// Config file parsing
// 
// NOTE: No logger available yet so minimize output and wrap all messages to
// fit to an 80 character screen.
// NOTE2: This is intended to be a system service so the config is hardcoded
//
try
{
  config = configInit.getConfig(CONFIG);
}
catch (error)
{
  // Record startup error in the log
  let msg = '[Config ERROR] ' + error.message;
  // And output to the console (for immediate feedback to sys-admin)
  console.error(wrap.wrap(msg, {width: 80, noTrim: true}));
  // NOTE: This isn't recommended but until unless we replaced the uncaught
  // exception handler (requires Node >=9.3), it really is the best way. 
  process.exit(-3);
}

//
// Create the logger as configured
//
logger = logging.getLogger(config);
logger.info(config.app.name + ' v' + config.app.version + ' starting up!');


//
// Main Startup chain
//   1) Load events DB
//   2) Initialize the Backup system
//   3) Startup the webapp
//
new Promise(function(resolve, reject) {
  // DB
  logger.debug('Loading the Events DB...');
  db = models.init(config);
  logger.trace('  models.init() complete...');
  resolve(db.sequelize.sync());
})
.catch(function(err) {
  logger.error('Error loading the Events DB. Check your configuration and data files: ' + err.message);
  logger.debug(err.stack);
  process.exit(-2);
})
.then(function() {
  // System
  logger.debug('Starting main process...');
  system.init(config, db);
})
.catch(function(err) {
  logger.error('Error during Backup System startup: ' + err.message);
  logger.debug(err.stack);
  process.exit(-1);
})
.then(function() {
  // Webapp
  // TODO
});
