const express = require('express'),
      router = express.Router();
const db = require('../../models').getDatabase();

const logger = require('../../../lib/config/log4js').getLogger();

router.get('/:id',(req, res, next) => {
  res.render('machine', {
    name : req.params.id,
    successfulBackups: // integer,
    totalBackups: // integer,
    lastBackupDate: // STRING in format 'MM-DD-YYYY HH:MM',
    timeSinceLastRestart: // STRING in format 'X days, Y hours, Z minutes since last backup',
    backups: // array of backupEvents
  });
});

module.exports = app => {
  app.use('/machine',router);
};
