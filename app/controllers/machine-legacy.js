const express = require('express'),
    router = express.Router(),
    Op = require('sequelize').Op,
    fs = require('fs'),
    path = require('path'),
    system = require('../../lib/system'),
    models = require('../models'),
    rsync = require('../../lib/rsync'),
    util = require('../../lib/util'),
    logger = require('../../lib/config/log4js').getLogger();

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

  getBackupEvents(machine.name)
  .then(backupEvents => {
    let lastBackup, i = 0;
    do
    {
      lastBackup = backupEvents[i];
      i++;
    }
    while (lastBackup.rsyncExitCode !== 0);
    machineInfo.lastBackupDate = util.getFormattedDate(lastBackup.backupTime);
    machineInfo.events = [];
    for (let event of backupEvents)
    {
      machineInfo.events.push({
        date: util.getFormattedDate(event.backupTime).substring(0, 10),
        time: util.getFormattedDate(event.backupTime).substring(11),
        size: util.getFormattedSize(event.transferSize),
        transferTime: util.getFormattedTimespan(1000 * event.transferTimeSec),
        exitCode: event.rsyncExitCode,
        errReason: event.rsyncExitCode ? event.rsyncExitReason : null
      });
    }
    console.log(machineInfo);
    res.render('machine-legacy', machineInfo);
  });
});

module.exports = app => {
  app.use('/machine-legacy', router);
};

/**
 * Gets a list of all the backup events (successful and
 * unsuccessful) since the last backup on disk for machine
 * machineName.
 * @param machineName
 *   The name of the machine to inspect for backup events.
 * @returns
 *   A promise containing an array of backup events
 */
function getBackupEvents(machineName)
{
  return db.BackupEvent.findAll({
    where: {
      machine: machineName,
      backupTime: {
        [Op.gte]: getOldestBackupDate(machineName)
      }
    },
    order: [['backupTime', 'DESC']]
  });
}

/**
 * Gets the date of the oldest backup on disk
 * for machine machineName
 * @param machineName
 *   The name of the machine to inspect for the oldest backup
 * @returns
 *   A date object representing the oldest backup on disk
 */
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
