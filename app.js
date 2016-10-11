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
