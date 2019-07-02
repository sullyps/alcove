const express = require('express'),
    router = express.Router(),
    Op = require('sequelize').Op,
    system = require('../../lib/system'),
    models = require('../models'),
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

  getBackupCalendar(machine, 5)
  .then(backupCalendar => {
    const machineInfo = {
      machine: machine,
      backupCalendar: backupCalendar,
      backupEvents: []
    };
    backupCalendar.forEach(week => {
      week.forEach(day => {
        day.backupEvents.forEach(backupEvent => {
          machineInfo.backupEvents.push(backupEvent);
        });
      })
    });
    machineInfo.backupEvents.sort((a, b) => b.backupTime - a.backupTime);
    res.render('machine', machineInfo);
  });
});

module.exports = app => {
  app.use('/machine', router);
};

/**
 * Gets a history of all the backups on the given machine
 * in a calendar format i.e. each is given a day and the
 * events are arranged in a matrix that shows the past
 * five weeks
 * @param machine
 *   The machine to check for backup events
 * @param CALENDAR_ROWS
 *   The number of rows to include in the calendar (defaults to 5)
 * @returns
 *   The calendar object with the backup events
 */
function getBackupCalendar(machine, CALENDAR_ROWS = 5)
{
  let today = new Date();

  // Initialize a flat (one-dimensional) calendar array for easier manipulation
  let calendar = [];
  for (let i = 0; i < CALENDAR_ROWS * 7; i++)
  {
    calendar.push({
      today: false,
      date: undefined,
      dateString: undefined,
      backupEvents: [],
      successfulBackups: 0,
      attemptedBackups: 0,
      bucket: false
    });
  }

  // Get information about today on the calendar
  calendar[(CALENDAR_ROWS - 1) * 7 + today.getDay()].date = today;
  calendar[(CALENDAR_ROWS - 1) * 7 + today.getDay()].today = true;

  // Get dates for other days on the calendar
  for (let i = (CALENDAR_ROWS - 1) * 7 + today.getDay() - 1; i >= 0; i--)
  {
    calendar[i].date = util.addDays(calendar[i + 1].date, -1);
  }
  for (let i = (CALENDAR_ROWS - 1) * 7 + today.getDay() + 1; i < calendar.length; i++)
  {
    calendar[i].date = util.addDays(calendar[i - 1].date, 1);
  }

  // Build date strings for each day on the calendar
  for (let i = 0; i < calendar.length; i++)
  {
    calendar[i].dateString = `${calendar[i].date.getMonth() + 1}/${calendar[i].date.getDate()}`;
  }

  // Query the DB for all backup events that belong on the calendar
  return db.BackupEvent.findAll({
    where: {
      machine: machine.name,
      backupTime: {
        [Op.gte]: calendar[0].date.setHours(0, 0, 0, 0)
      }
    },
    order: [['backupTime']]
  })
  .then(backupEvents => {
    // Add backup events to each calendar date and update each day's
    // count of successful and attempted backups
    backupEvents.forEach(backupEvent => {
      for (let i = 0; i < calendar.length; i++)
      {
        if (util.sameDay(calendar[i].date, backupEvent.backupTime))
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

    // Count which days should have attempted to back up
    const buckets = system.getBuckets(machine.schedule, new Date());
    buckets.forEach(bucket => {
      for (let i = 0; i < calendar.length; i++)
      {
        if (util.sameDay(calendar[i].date, bucket.date))
        {
          calendar[i].bucket = true;
          return;
        }
      }
    });

    // Convert the flat array to a 2D array like an actual calendar
    let calendarMatrix = [];
    for (let i = 0; i < CALENDAR_ROWS; i++)
    {
      let row = [];
      for (let j = 0; j < 7; j++)
      {
        row.push(calendar[(7 * i) + j]);
      }
      calendarMatrix.push(row);
    }

    return calendarMatrix;
  });
}
