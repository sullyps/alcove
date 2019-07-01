const express = require('express'),
    router = express.Router(),
    Op = require('sequelize').Op,
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

  getBackupCalendarHistory(machine, util.parseSchedule('0,2,3,4,5,6(6)|1(4);[21:00]'));

  res.sendStatus(200);
});

module.exports = app => {
  app.use('/machine2', router);
};

function print2DArray(arr)
{
  arr.forEach(row => {
    let str;
    row.forEach(obj => {
      str += JSON.stringify(obj) + ', ';
    });
    console.log(str + '\n');
  });
}

function addDays(date, days)
{
  let result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDay(date1, date2)
{
  return date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate();
}

function getBackupCalendarHistory(machine)
{
  let today = new Date();

  // Initialize flat (one-dimensional) calendar array for easier manipulation
  let calendar = [];
  for (let i = 0; i < 5 * 7; i++)
  {
    calendar.push({
      date: undefined,
      backupEvents: [],
      successfulBackups: 0,
      attemptedBackups: 0,
      bucket: false
    });
  }

  // Get dates
  calendar[4 * 7 + today.getDay()].date = today;
  for (let i = 4 * 7 + today.getDay() - 1; i >= 0; i--)
  {
    calendar[i].date = addDays(calendar[i + 1].date, -1);
  }
  for (let i = 4 * 7 + today.getDay() + 1; i < calendar.length; i++)
  {
    calendar[i].date = addDays(calendar[i - 1].date, 1);
  }

  db.BackupEvent.findAll({
    where: {
      machine: machine.name,
      backupTime: {
        [Op.gte]: calendar[0].date.setHours(0, 0, 0, 0)
      }
    },
    order: [['backupTime']]
  })
  .then(backupEvents => {
    // Add backup events to each calendar date
    backupEvents.forEach(backupEvent => {
      for (let i = 0; i < calendar.length; i++)
      {
        if (sameDay(calendar[i].date, backupEvent.backupTime))
        {
          calendar[i].backupEvents.push(backupEvent);
          calendar[i].attemptedBackups++;
          if (!backupEvent.rsyncExitCode)
          {
            calendar[i].successfulBackups++;
          }
          return;
        }
      }
    });

    // Count successful and unsuccessful backup days
    const buckets = system.getBuckets(machine.schedule, new Date());
    buckets.forEach(bucket => {
      for (let i = 0; i < calendar.length; i++)
      {
        if (sameDay(calendar[i].date, bucket.date))
        {
          calendar[i].bucket = true;
          return;
        }
      }
    });

    // Convert to a 2D array like an actual calendar
    let calendarMatrix = [];
    for (let i = 0; i < 5; i++)
    {
      let row = [];
      for (let j = 0; j < 7; j++)
      {
        row.push(calendar[(7 * i) + j]);
      }
      calendarMatrix.push(row);
    }
    print2DArray(calendarMatrix);
  });
}
