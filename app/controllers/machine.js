const path = require('path');
    express = require('express'),
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

  getBackupEvents(machine, 5)
  .then(backupEvents => {
    const machineInfo = {
      title: `${machine.name} :: Alcove Backup System`,
      machine: machine,
      backupCalendar: backupEvents.calendar,
      backupEvents: backupEvents.backupEvents
    };
    //machineInfo.backupEvents.sort((a, b) => b.backupTime - a.backupTime);
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
 * five weeks. All events that don't fit on the calendar
 * but still have buckets are included in the list that
 * follows
 * @param machine
 *   The machine to check for backup events
 * @param CALENDAR_ROWS
 *   The number of rows to include in the calendar (defaults to 5)
 * @returns
 *   An object containing the calendar object with the backup events
 *   and a list of backup events
 */
function getBackupEvents(machine, CALENDAR_ROWS = 5)
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
      id: undefined,
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


  return new Promise((resolve, reject) => { 
    // Count which days should have attempted to back up and add to the calendar
    machine.buckets.forEach(bucket => {
      for (let i = 0; i < calendar.length; i++)
      {
        if (util.sameDay(calendar[i].date, bucket.date))
        {
          calendar[i].bucket = bucket;
          return;
        }
      }
    });

    // Find the oldest bucket or the oldest date on the calendar (whichever is older)
    // and only query the DB for events after that
    const oldestIncludedBackupEvent = machine.buckets.reduce((minimum, current) => {
      return current.date < minimum.date ? current : minimum;
    }, {
      date: calendar[0].date.setHours(0, 0, 0, 0)
    });

    // Convert the flat array to a 2D array like an actual calendar
    // TODO: This is unnecessary, we could just render the flat array as a matrix in the template...
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

    // Transform the machine memory object into a simplified list of backups
    // TODO: We need additional information from the DB events, either load these here or request via AJAX
    let backupEvents = machine.buckets
      .filter(bucket => {
        return (bucket.backup)
      })
      .map(bucket => {
        return { 
          date: util.getFormattedDate(new Date(Date.parse(bucket.backup.date))), 
          size: util.getFormattedSize(bucket.backup.size)
        };
      });

    resolve({
      calendar: calendarMatrix,
      backupEvents: backupEvents
    });
  });
}
