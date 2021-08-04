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
  dashboard.machineStatuses = getMachineStatuses();

  dashboard.machines = [];
  for (let machineName in machines)
  {
    let timeSinceLastBackup = 'No backups were found for this machine';
    let lastBackup;
    for (let bucket of machines[machineName].buckets)
    {
      bucketDate = Date.parse(bucket.date);
      // Only look at successful backups
      if (bucket.backup && (!lastBackup || bucketDate > lastBackup))
      {
        lastBackup = Date.parse(bucket.date);
        timeSinceLastBackup = util.getFormattedTimespan(new Date().getTime() - lastBackup) + ' ago';
      }
    }
    // TODO: Could make use of complete/approx/unknown theme here too
    let totalSize = (machines[machineName].totalSize) ? machines[machineName].totalSize.size : 'unknown';
    dashboard.machines.push({
      name: machineName,
      successfulBackups: getSuccessfulBackups(machineName),
      scheduledBackups: getScheduledBackups(machineName),
      totalSize: util.getFormattedSize(totalSize),
      timeSinceLastBackup: timeSinceLastBackup
    });
  }

  db.ProcessEvent.findAll({
    where: {
      event : 'start'
    },
    order: [['eventTime', 'DESC']]
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
  let backups = [];
  for (let machineName in machines)
  {
    let machine = machines[machineName];
    let machinePath = path.join(config.data_dir, machine.name);
    backups.push(...getPreviousBackupNames(machinePath));
  }
  return util.parseISODateString(backups.reduce((min, value) => {
    return value < min ? value : min;
  }));
}

/**
 * Reads the data directory of a certain machine and inspects
 * for a list of backup names (dates) that aren't currently in
 * progress (i.e. not rsync.getInProgressName())
 * @param machinePath
 *   The path to the data directory of the specific machine
 * @returns
 *   A list of backup names (dates) as strings
 */
function getPreviousBackupNames(machinePath)
{
  return fs.readdirSync(machinePath).filter(backup => {
    return fs.statSync(path.join(machinePath, backup)).isDirectory() && backup !== rsync.getInProgressName();
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
    allBackups: 0,
    someBackups: 0,
    noBackups: 0,
    idle: 0,
    total: 0
  };
  for (let machineName in machines)
  {
    let machineStatus = getMachineStatus(machineName);
    if (machineStatus === 0) machineStatuses.allBackups++;
    else if (machineStatus === 1) machineStatuses.someBackups++;
    else if (machineStatus === 2) machineStatuses.noBackups++;
    else machineStatuses.idle++;

    machineStatuses.total++;
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
  let machine = system.getMachines()[machineName];
  return machine.buckets.filter(bucket => bucket.backup).length;
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
  return system.getMachines()[machineName].buckets.length;
}
