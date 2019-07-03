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

router.get('/', (req, res, next) => {
  config = system.getConfig();
  db = models.getDatabase();
  machines = system.getMachines();

  let dashboard = {};
  getSuccessfulBackupEvents()
  .then(successfulBackupEvents => {
    let machineStatuses = getMachineStatuses();
    dashboard.allBackups = machineStatuses.allBackups;
    dashboard.someBackups = machineStatuses.someBackups;
    dashboard.noBackups = machineStatuses.noBackups;
    dashboard.idle = machineStatuses.idle;

    dashboard.machines = [];
    for (let machineName in machines)
    {
      let timeSinceLastBackup = 'No backups were found for this machine';
      for (let backupEvent of successfulBackupEvents)
      {
        if (backupEvent.machine === machineName)
        {
          timeSinceLastBackup = util.getFormattedTimespan(new Date().getTime() - backupEvent.backupTime) + ' ago';
          break;
        }
      }
      dashboard.machines.push({
        name: machineName,
        successfulBackups: getSuccessfulBackups(machineName),
        scheduledBackups: getScheduledBackups(machineName),
        timeSinceLastBackup: timeSinceLastBackup
      });
    }

    return getProcessEvents();
  })
  .then(processEvents => {
    dashboard.lastBackupSystemRestart = util.getFormattedDate(processEvents[0].eventTime);

    dashboard.title = 'Dashboard :: Alcove Backup System';
    res.render('dashboard', dashboard);
  });
});

module.exports = app => {
  app.use('/dashboard', router);
};

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
    },
    order: [['backupTime', 'DESC']]
  });
}

/**
 * Gets the date (as a date object) of the oldest backup
 * on disk for any machine.
 * @returns
 *   A date object representing the oldest backup on disk
 */
function getOldestBackupDate()
{
  // TODO: let's see if we can clean up this confusing flow (see linter)
  let backups = [];
  for (let machineName in machines)
  {
    let machine = machines[machineName];
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
 * Gets the statuses of all machines as determined by
 * the number of scheduled and successful backups.
 * @returns
 *   The number of machines of each status
 */
function getMachineStatuses()
{
  let machineStatuses = {
    allBackups: 0,
    someBackups: 0,
    noBackups: 0,
    idle: 0
  };
  for (let machineName in machines)
  {
    let machineStatus = getMachineStatus(machineName);
    if (machineStatus === 0) machineStatuses.allBackups++;
    else if (machineStatus === 1) machineStatuses.someBackups++;
    else if (machineStatus === 2) machineStatuses.noBackups++;
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
 *   0 = All backups - All backups succeeded
 *   1 = Some backups - Some backups succeeded
 *   2 = No backups - All backups failed
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
