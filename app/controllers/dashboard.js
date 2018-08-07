const express = require('express'),
      router = express.Router(),
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

  let sortedBackupDates = getSortedBackupDates();
  let machineStatuses = getMachineStatuses();

  let machineList = [];
  for (let machineName in machines)
  {
    // Loop through backup events much like when generating notification email in system.js
    let machineBackups = getSortedBackupDatesForMachine(machineName);

    machineList.push({
      name: machineName,
      successfulBackups: getSuccessfulBackups(machineName),
      totalBackups: getScheduledBackups(machineName),
      lastBackupDate: util.getFormattedDate(machineBackups[machineBackups.length - 1]).substring(0, 10)
    });
  }

  res.render('dashboard', {
    title: 'Dashboard :: Alcove Backup System',
    dashboard: {
      oldestBackupDate: util.getFormattedDate(sortedBackupDates[0]).substring(0, 10),
      newestBackupDate: util.getFormattedDate(sortedBackupDates[sortedBackupDates.length - 1]).substring(0, 10),
      lastSummaryEmailDate: util.getFormattedDate(getLastSummaryEmailDate()).substring(0, 10),
      successfulMachines: machineStatuses[0],
      partialSuccessMachines: machineStatuses[1],
      unsuccessfulMachines: machineStatuses[2],
      idleMachines: machineStatuses[3],
      machines: machineList
    },
  });
});

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
 * Gets the statuses of all machines as determined by
 * the number of scheduled and successful backups.
 * @returns
 *   The number of machines of each status
 *   machineStatuses[0] = Successful machines (all backups succeeded)
 *   machineStatuses[1] = Partially successful machines (some backups succeeded)
 *   machineStatuses[2] = Unsuccessful machines (all backups failed)
 *   machineStatuses[3] = Idle machines (no backups were attempted)
 */
function getMachineStatuses()
{
  let machineStatuses = [0, 0, 0, 0];
  for (let machineName in machines)
  {
    machineStatuses[getMachineStatus(machineName)]++;
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
  const machine = machines[machineName];
  let count = 0;
  util.parseSchedule(machine.schedule).daysSets.forEach(daysSet => {
    count += daysSet.number;
  });
  return count;
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
