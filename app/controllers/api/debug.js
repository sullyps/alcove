const express = require('express'),
      router = express.Router(),
      fs = require('fs'),
      path = require('path'),
      system = require('../../../lib/system'),
      models = require('../../models'),
      rsync = require('../../../lib/rsync'),
      util = require('../../../lib/util');

let config, db;

const logger = require('../../../lib/config/log4js').getLogger();

router.get('*',(req, res, next) => {
  logger.trace(system.getMachines());

  config = system.getConfig();
  db = models.getDatabase();

  res.json(system.getMachines());
});

module.exports = app => {
  app.use('/api/debug', router);
};
