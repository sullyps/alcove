const express = require('express'),
      router = express.Router();

const logger = require('../../../lib/config/log4js').getLogger();

router.get('/:id',(req, res, next) => {
  res.render('machine', {
    name : req.params.id,
    // TODO: Write functions to implement the following attributes
    /*successfulBackups:
    totalBackups:
    lastBackupDate:
    timeSinceLastRestart:
    backups:*/
  });
});

module.exports = app => {
  app.use('/machine',router);
};
