const express = require('express'),
      router = express.Router(),
      fs = require('fs'),
      path = require('path'),
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
  let sortedBackupDates = getSortedBackupDates();
  res.render('dashboard', {
    title: 'Dashboard :: Alcove Backup System',
    dashboard: {
      oldestBackupDate: util.getFormattedDate(sortedBackupDates[0]).substring(0, 10),
      newestBackupDate: util.getFormattedDate(sortedBackupDates[sortedBackupDates.length - 1]).substring(0, 10),
      lastSummaryEmailDate: util.getFormattedDate(getLastSummaryEmailDate()).substring(0, 10)
    }
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
    let machinePath = path.join(config.data_dir, machineName);
    let machineBackups = fs.readdirSync(machinePath).filter(child => {
      return fs.statSync(path.join(machinePath, child)).isDirectory();
    });
    for (let backup of machineBackups)
    {
      backups.push(util.parseISODateString(backup));
    }
  }
  backups.sort((a, b) => {
    return a.getTime() - b.getTime();
  });
  return backups;
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
