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

function getSortedBackupDates() {
  let backups = [];
  for (let machineName in machines) {
    let machinePath = path.join(config.data_dir, machineName);
    let machineBackups = fs.readdirSync(machinePath).filter(child => {
      return fs.statSync(path.join(machinePath, child)).isDirectory();
    });
    for (let backup of machineBackups) {
      backups.push(parseISODateString(backup));
    }
  }
  backups.sort((a, b) => {
    return a.getTime() - b.getTime();
  });
  return backups;
}

function getLastSummaryEmailDate() {
  const date = util.getLastSummaryEmailTime(config.notifications.summary_schedule, new Date());
  return util.getFormattedDate(date).substring(0, 10);
}

function parseISODateString(dateString) {
  const dateParts = dateString.replace(/\D+/g, ' ').split(' ');
  return new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4], dateParts[5], dateParts[6]));
}
