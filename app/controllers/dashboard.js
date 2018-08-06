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
      oldestBackupDate: sortedBackupDates[0],
      newestBackupDate: sortedBackupDates[sortedBackupDates.length - 1],
      lastSummaryEmailDate: getLastSummaryEmailDate()
    }
  });
});

/**
 * Gets a list of date objects of all the backups on
 * disk in order from oldest to newest.
 * @returns {Array}
 */
function getSortedBackupDates() {
  let backups = [];
  for (let machineName in machines) {
    let machinePath = path.join(config.data_dir, machineName);
    let machineBackups = fs.readdirSync(machinePath).filter(child => {
      return fs.statSync(path.join(machinePath, child)).isDirectory();
    });
    for (let backup of machineBackups) {
      backups.push(util.parseISODateString(backup));
    }
  }
  backups.sort((a, b) => {
    return a.getTime() - b.getTime();
  });
  return backups;
}

/**
 * Gets the last time a summary email was scheduled to
 * go out as a string.
 * @returns
 *   The last summary email date as a string.
 */
function getLastSummaryEmailDate() {
  const date = util.getLastSummaryEmailTime(config.notifications.summary_schedule, new Date());
  return util.getFormattedDate(date).substring(0, 10);
}
