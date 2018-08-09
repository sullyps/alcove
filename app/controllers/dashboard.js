const express = require('express'),
      router = express.Router(),
      Op = require('sequelize').Op,
      fs = require('fs'),
      path = require('path'),
      system = require('../../lib/system'),
      models = require('../models'),
      rsync = require('../../lib/rsync'),
      util = require('../../lib/util');

let config, db, machines;

module.exports = app => {
  app.use('/dashboard', router);
};

router.get('/', (req, res, next) => {
  config = system.getConfig();
  db = models.getDatabase();
  machines = system.getMachines();

  let processEventsPromise = getProcessEvents();

  let machineStatuses = getMachineStatuses();
  let sortedBackupDates = getSortedBackupDates();

  let dashboard = {
    oldestBackupDate: util.getFormattedDate(sortedBackupDates[0]).substring(0, 10),
    newestBackupDate: util.getFormattedDate(sortedBackupDates[sortedBackupDates.length - 1]).substring(0, 10),
    lastSummaryEmailDate: util.getFormattedDate(getLastSummaryEmailDate()).substring(0, 10),
    successfulMachines: machineStatuses.successful,
    partialSuccessMachines: machineStatuses.partiallySuccessful,
    unsuccessfulMachines: machineStatuses.unsuccessful,
    idleMachines: machineStatuses.idle,
    machines: []
  };

  for (let machineName in machines)
  {
    dashboard.machines.push({
      name: machineName,
      successfulBackups: getSuccessfulBackups(machineName),
      totalBackups: getScheduledBackups(machineName)
    });
  }

  processEventsPromise.then(processEvents => {
    dashboard.lastRestart = util.getFormattedDate(processEvents[0].eventTime).substring(0, 10);
    res.render('dashboard', {
      title: 'Dashboard :: Alcove Backup System',
      dashboard: dashboard
    });
  });
});

/**
 * Gets the date (as a date object) of the oldest backup
 * on disk for any machine.
 * @returns
 *   A date object representing the oldest backup on disk
 */
function getOldestBackupDate()
{
  let backups = [];
  for (let machine of machines)
  {
    let machinePath = path.join(config.data_dir, machine.name);
    backups.push(...fs.readdirSync(machinePath).filter(backup => {
      return fs.statSync(path.join(machinePath, backup)).isDirectory() &&
          backup !== rsync.getInProgressName();
    }));
  }
  return util.parseISODateString(backups.reduce((min, value) => {
    return value < min ? value : min;
  }));
}

/**
 * Gets a list of all the successful backups that are
 * still kept on disk.
 * @returns
 *   A promise containing an array of successful
 *   backups that are still on disk.
 */
function getSuccessfulBackupEvents()
{
  return db.BackupEvent.findAll({
    where: {
      rsyncExitCode: 0,
      backupTime: {
        [Op.gte]: getOldestBackupDate()
      }
    }
  });
}

/**
 * Gets a list of date objects of all the backups on
 * disk in order from oldest to newest.
 * @returns
 *   An array of backup dates as strings
 */
function getSortedBackupDates()
{
  let backups = [];
  for (let machineName in machines)
  {
    let machineBackups = getSortedBackupDatesForMachine(machineName);
    for (let backup of machineBackups)
    {
      backups.push(backup);
    }
  }
  backups.sort((a, b) => {
    return a.getTime() - b.getTime();
  });
  return backups;
}

/**
 * Gets a list of date objects of all the backups for
 * the machine machineName in order from oldest to newest.
 * @param machineName
 *   The name of the machine to inspect for backups
 * @returns
 *   An array of backup dates as strings
 */
function getSortedBackupDatesForMachine(machineName)
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
  return backupDates;
}

/**
 * Gets the last time a summary email
 * was scheduled to go out.
 * @returns
 *   The last summary email date as a date object.
 */
function getLastSummaryEmailDate()
{
  return util.getLastSummaryEmailTime(config.notifications.summary_schedule, new Date());
}

/**
 * Gets an array of ProcessEvents (in a promise) in
 * order from the most recent to the least recent.
 * (Typically used to find the most recent restart.)
 * @returns
 *   A promise containing an array of ProcessEvents
 *   in order from most recent to least recent.
 */
function getProcessEvents()
{
  return db.ProcessEvent.findAll({
    where: {
      event : 'start'
    },
    order: [['eventTime', 'DESC']]
  });
}

/**
 * Gets the statuses of all machines as determined by
 * the number of scheduled and successful backups.
 * @returns
 *   The number of machines of each status
 */
function getMachineStatuses()
{
  let machineStatuses = {
    successful: 0,
    partiallySuccessful: 0,
    unsuccessful: 0,
    idle: 0
  };
  for (let machineName in machines)
  {
    let machineStatus = getMachineStatus(machineName);
    if (machineStatus === 0) machineStatuses.successful++;
    else if (machineStatus === 1) machineStatuses.partiallySuccessful++;
    else if (machineStatus === 2) machineStatuses.unsuccessful++;
    else machineStatuses.idle++;
  }
  return machineStatuses;
}

/**
 * Gets the status of the machine machineName as determined by
 * the number of scheduled and successful backups.
 * @param machineName
 *   The name of the machine to inspect for status
 * @returns
 *   The status code of the machine
 *   0 = Successful machine - All backups succeeded
 *   1 = Partially successful machine - Some backups succeeded
 *   2 = Unsuccessful machine - All backups failed
 *   3 = Idle machine - No backups were attempted
 */
function getMachineStatus(machineName)
{
  const scheduledBackups = getScheduledBackups(machineName);
  const successfulBackups = getSuccessfulBackups(machineName);
  if (scheduledBackups === 0) return 3;
  else if (successfulBackups === 0) return 2;
  else if (successfulBackups !== scheduledBackups) return 1;
  else return 0;
}

/**
 * Gets the number of scheduled backups by
 * the machine machineName.
 * @param machineName
 *   The name of the machine to inspect for scheduled backups
 * @returns
 *   The number of scheduled backups
 */
function getScheduledBackups(machineName)
{
  return system.getBuckets(machines[machineName].schedule, new Date()).length;
}

/**
 * Gets the number of successful backups by
 * the machine machineName.
 * @param machineName
 *   The name of the machine to inspect for scheduled backups
 * @returns
 *   The number of successful backups
 */
function getSuccessfulBackups(machineName)
{
  return util.countSubdirectoriesExclude(path.join(config.data_dir, machineName), [rsync.getInProgressName()]);
}
