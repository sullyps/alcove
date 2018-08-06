const express = require('express'),
      router = express.Router(),
      system = require('../../lib/system'),
      models = require('../models'),
      util = require('../../lib/util');

let config, db, machines;

module.exports = app => {
  app.use('/dashboard', router);
};

router.get('/', (req, res, next) => {
  config = system.getConfig();
  db = models.getDatabase();
  machines = system.getMachines();
  res.render('dashboard', {
    title: 'Dashboard :: Alcove Backup System'
  });
});
