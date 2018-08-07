const express = require('express'),
    router = express.Router(),
    fs = require('fs'),
    path = require('path'),
    system = require('../../lib/system'),
    models = require('../models'),
    rsync = require('../../lib/rsync'),
    util = require('../../lib/util');

const logger = require('../../lib/config/log4js').getLogger();

let config, db;

router.get('/:name',(req, res, next) => {
  // Attempt to grab the machine that is requested
  let machineObj = system.getMachines()[req.params.name];
  if (!machineObj)
  {
    logger.warn('Request for unknown machine with name: "' + req.params.name + '"');
    return res.status(404).render('error', {
      message: 'Machine Not Configured', 
      error: { 
        status: 'There is no machine with the name of "' + req.params.name + '" configured for this system...'
      }
    });
  }

  config = system.getConfig();
  db = models.getDatabase();

  logger.trace(machineObj);
  res.render('machine', {
    name: machineObj.name,
    successfulBackups: util.countSubdirectoriesExclude(path.join(config.data_dir, machineObj.name), [rsync.getInProgressName()]),
    totalBackups: system.getBuckets(machineObj.schedule, new Date()).length
  });
});

module.exports = app => {
  app.use('/machine', router);
};
