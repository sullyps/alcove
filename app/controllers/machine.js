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
  let machine = system.getMachines()[req.params.name];
  if (!machine)
  {
    logger.warn('Request for unknown machine with name: "' + req.params.name + '"');
    return res.status(404).render('error', {
      message: 'Machine Not Configured', 
      error: { 
        status: 'There is no machine with the name of "' + req.params.name + '" configured for this system...'
      }
    });
  }

  logger.trace(machine);

  config = system.getConfig();
  db = models.getDatabase();

  let machineInfo = {
    name: machine.name,
    successfulBackups: util.countSubdirectoriesExclude(path.join(config.data_dir, machine.name), [rsync.getInProgressName()]),
    totalBackups: system.getBuckets(machine.schedule, new Date()).length
  };

  getLastBackupDate(machine.name)
  .then(backupEvents => {
    machineInfo.lastBackupDate = util.getFormattedDate(backupEvents[0].backupTime);
    res.render('machine', machineInfo);
  });
});

module.exports = app => {
  app.use('/machine', router);
};

function getLastBackupDate(machineName)
{
  return db.BackupEvent.findAll({
    where: {
      machine: machineName,
      rsyncExitCode: 0
    },
    order: [['backupTime', 'DESC']]
  });
}

function getOldestBackupDate(machineName)
{
  const machinePath = path.join(config.data_dir, machineName);
  let backups = fs.readdirSync(machinePath).filter(backup => {
    return fs.statSync(path.join(machinePath, backup)).isDirectory() &&
        backup !== rsync.getInProgressName();
  });
  let backupDates = [];
  for (let backup of backups)
  {
    backupDates.push(util.parseISODateString(backup));
  }
  backupDates.sort((a, b) => {
    return a.getTime() - b.getTime();
  });
  return backupDates[0];
}
