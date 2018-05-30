'use strict';
var fs = require('fs-extra'),
    path = require('path'),
    ini = require('ini'),
    child_process = require('child_process'),
    logging = require('./config/log4js');

var rsync = require('./rsync'),
    notifications = require('./notifications');

var logger = logging.getLogger();
var backupQueues = { remaining: [], inProgress: [] };
var machines = {};
var summaryTimeoutId, config, db;

// Methods to handle the process being killed and commit event to db
const SIGINT = 2;
const SIGTERM = 15;
const SIGUSR2 = 12;

/**
 * Private method that takes info from a backup attempt and inserts it into the
 * DB to create a history for later reference.
 *
 * @param machine
 *   The target machine for the backup event.
 * @param rsyncStats
 *   The statistics and information about the recent backup event. This may
 *   not contain any rsync data if an error occurred early in the process.
 *   We try to ensure that "code" always exists, and "error" will exist on
 *   an improper completion.
 */
function insertBackupEvent (machine, rsyncStats) {
  if (!db) return logger.error('Cannot record backup event: The Events DB has not been initialized');

  var machineLogger = logging.getLogger(machine.name);
  db.BackupEvent.create({
    'machine' : machine.name,
    'rsyncExitCode' : rsyncStats.code,
    'rsyncExitReason' : (rsyncStats.error || ''),
    'transferSize' : (rsyncStats.totalTransferredFileSize || 0),
    'transferTimeSec' : (rsyncStats.totalTransferTime || 0)
  })
  .then(function(backupInfo) {
     machineLogger.info('Backup event saved to EventsDB');
  })
  .catch(function (err) {
    machineLogger.error('Backup event insertion in EventsDB failed:', err.message);
    machineLogger.debug(err.stack);
  });
}

/**
 * Gracefully handle shutdowns due to SIGINT or SIGTERM.
 */
function addProcessExitEvent(code) {
  // Shutdown impending
  logger.info('Backup system shutting down...');
  logger.debug('Exit code: ' + code);

  // Shortcircuit if the db is inaccessible
  if (!db) process.exit(code);

  var exitReason = 'Unknown';
  switch(code) {
    case 0:
      exitReason = 'COMPLETED';
      break;
    case SIGINT:
    case SIGTERM:
    case SIGUSR2:
      exitReason = 'TERMINATED';
      break;
  }

  // Push the shutdown event to the database.
  (function shutdown() { 
    db.ProcessEvent.create({
      'event' : 'exit',
      'exitCode' : code,
      'exitReason' : exitReason,
    })
    .then(function(processEvent) {
      logger.debug('Process exit event saved to events DB, exit code: ' + processEvent.exitCode);
      process.exit(processEvent.exitCode);
    })
    .catch(function (err) {
      logger.error('Could not save exit event to the database: ' + err);
      logger.warn('Next startup might erroneously send out dirty shutdown notifications...');
      // Exit anyway...
      process.exit(processEvent.exitCode);
    });
  })();
}
process.on('SIGINT', function() { addProcessExitEvent(SIGINT); });
process.on('SIGTERM', function() { addProcessExitEvent(SIGTERM); });
process.on('SIGUSR2', function() { addProcessExitEvent(SIGUSR2); });
process.on('beforeExit', function() { addProcessExitEvent(0); });

/**
 * Private helper to create our machine Objects that store real-time backup 
 * information in memory for each configured backup from the config files.
 */
function prepareMachines(config)
{
  // Active all configured machines
  for (var key in config.machines)
  {
    logger.debug('Preparing "' + key + '"');

    // Isolate errors on any single config
    try
    {
      var machineConfig = config.machines[key];

      // Copy this machine into our local variable and decorate
      // Retain this configuration in our 'config' without changes
      var machine = {
        schedule: machineConfig.schedule,
        name: machineConfig.name,
        ip: machineConfig.ip,
        inclusionPatterns: machineConfig.inclusionPatterns,
        exclusionPatterns: machineConfig.exclusionPatterns,
        // Will be Object: { when: Date, transferSizeKb: Number, transferTimeMs: Number }
        lastBackup: {},
        // Will be Array of Objects: { when: Date, reason: String }
        failures: []
      }

      // This machine is configured
      machines[key] = machine;
    }
    catch(error)
    {
      logger.error('Error with "' + key + '": ' + error.message);
      logger.debug(error.stack);
      logger.warn('No backups will be performed for "' + key + '"');
      delete machines[key];
    }
  }
  logger.debug('All machines are prepared for backups');
}

/**
 * Private helper to find the next scheduled time, given the schedule. 
 * 
 * @param String scheduleStr
 *   Schedule definition using the backup schedule syntax.
 */
function getNextScheduledTime(scheduleStr) 
{
  var now = new Date();
  var schedule;

  // Parse the schedule first
  try
  {
    schedule = system.parseSchedule(scheduleStr);
  }
  catch (error)
  {
    // Shouldn't ever happen after a successful startup.
    logger.error('Could not parse schedule: ' + error.message);
    logger.debug(error.stack);
    return null;
  }

  var dates = [];
  schedule.daysSets.forEach(function(daySet) {
    daySet.days.forEach(function(dayOfWeek) {
      var date = new Date();
      date.setHours(schedule.time.hours, schedule.time.minutes, 0, 0);

      // Determine number of days in the future for this "set"
      var diff = dayOfWeek - now.getDay();
      if ((diff < 0) || (diff == 0 && date <= now))
        diff += 7;

      // Offset this date
      date.setDate(date.getDate() + diff);

      dates.push(date);
    });
  });
  // Sort by Date time, (not String conversion)
  dates.sort(function(date1, date2) {
    if (date1 < date2) return -1;
    else if (date1 > date2) return 1;
    else return 0;
  });

  // Now the next upcoming date will be the first!
  return dates[0];
}

/**
 * Private helper method.
 * After a backup has been attempted, complete the process appropriately.
 * Either schedule an additional attempt (if failed) or schedule the next
 * expected backup (if succeeded). 
 *
 * @param rsyncErr
 *   If defined, the error from the rsync process.
 * @param machine
 *   The machine object that was just backed up.
 * @param rsyncStats
 *   The resulting data from the rsync attempt (or null).
 * @param toDelete
 *   An array of directories to remove (outdated backups). Only performed
 *   when a successful backup has occurred.
 */
function completeBackup(rsyncErr, machine, rsyncStats, toDelete)
{
  // Insert backup event
  insertBackupEvent(machine, rsyncStats);

  var maxAttempts = config.rsync.retry.max_attempts;
  var timeout = 0;

  // Handle completion in 3 ways:
  //   1) Failure, give up (when max attempts are exceeded)
  //   2) Failure, retry
  //   3) Success
  // After appropriate logging, notification, etc: Then set the timeout and
  // startup any machines that were stuck in the queue with process.nextTick()
  var now = new Date();
  if (rsyncErr && machine.failures.length == maxAttempts)
  {
    // Failure, give up and go to next regularly scheduled time
    var nextScheduledTime = getNextScheduledTime(machine.schedule);
    timeout = nextScheduledTime.getTime() - now.getTime();
    // TODO Reword this
    var message = {
      subject: 'Failed backup for "' + machine.name + '"',
      shortMessage: 'The backup failed and will not be retried: ' + rsync.error,
      longMessage: 'The backup for "' + machine.name + '" could not be completed: ' + rsync.error + '\n' +
        'No more attempts will be made to complete this backup'
    }
    notifications.dispatch(message);
    machine.failures = [];
    logger.error('Maximum retry attempts reached for machine: "' + machine.name + '"');
    logger.warn('Next backup attempt will be at the normal scheduled time: ' + nextScheduledTime);
  }
  else if (rsyncErr)
  {
    // Failure, retry according to our graduated back-off rate
    var retry = config.rsync.retry.time * 60 * 1000;
    var multiplier = config.rsync.retry.multiplier;
    timeout = retry * Math.pow(multiplier, machine.failures.length - 1);
    // TODO (probably sprintf-js this for the decimal handling)
    logger.warn('Backup failed. Retry attempt scheduled for ' + (timeout/ 1000 / 60.0) + ' minutes');
  }
  else
  {
    // Success
    var nextScheduledTime = getNextScheduledTime(machine.schedule);
    timeout = nextScheduledTime.getTime() - now.getTime();

    // Delete all specified old copies
    toDelete.forEach(function(dir) {
      logger.debug('Removing old backup directory: "' + dir + '"');
      try
      {
        fs.removeSync(dir)
      }
      catch (rmError)
      {
        logger.error('File system error removing old backup copy: "' + dir + '": ' + rmError.message);
        logger.debug(rmError.stack);
        logger.warn('Please inspect the backup directory for "' + machine.name + '"');
      }
    });

    // Reset the attempt counter if it has hit the max attempts or was successful
    machine.failures = [];
    logger.info('Next backup is at the normal scheduled time: ' + nextScheduledTime);
  }

  // Set the next timeout for this machine
  if (timeout != null)
    machine.timeoutId = setTimeout(function() { system.backupProcess(this) }.bind(machine), timeout);
  else
    logger.warn('Please verify this is correct: "' + machine.name + '" does not have any more scheduled backups??');

  // Remove this machine from the queue
  for (var i = 0; i < backupQueues.inProgress.length; i++) 
  {
    if (backupQueues.inProgress[i] === machine)
    {
      backupQueues.inProgress.splice(i,1);
      break;
    }
  }

  // Startup next queued machine (with process.nextTick())
  if (backupQueues.remaining.length > 0)
  {
    logger.debug('Starting machine from the waiting queue: ' + backupQueues.remaining[0].name);
    logger.trace(backupQueues.remaining.length + ' scheduled backups remain in the queue');
    // Pull off of queue (may end up back on...)
    var nextMachine = backupQueues.remaining.shift();
    // Next tick
    // TODO: discuss importance of nextTick here?
    process.nextTick(function() { system.backupProcess(this)}.bind(nextMachine));
  }
}


/**
 * Private helper method that returns size of directory contents as a string.
 * @param directory 
 *   The target to inspect for size.
 */
function findDirSize(directory)
{
  // TODO: Find platform independent alternatives
  var stdoutBuff = child_process.execSync('du -hs ' + directory);
  var stdout = stdoutBuff.toString();
  return stdout.split(/\s+/)[0];
}

/**
 * Private helper method that returns the size of the available disk space
 * as a string.
 */
function findFreeSpace()
{
  // TODO: Find platform independent alternatives
  var stdoutBuff = child_process.execSync('df -h ' + config.data_dir);
  var diskInfo = stdoutBuff.toString().split('\n');
  // Use the second line, 4th position
  var freeSpace = diskInfo[1].split(/\s+/)[3]; 
  return freeSpace;
}

/**
 * Finds the last scheduled email date from the schedule given in
 * the form of d,d,d,d;[hh:mm]
 * with d representing the days of the week 0 Sunday to 6 Saturday, hh:mm the time
 * @param schedule
 *   the string schedule, from config.notifications.summary_schedule
 * @param date
 *    date to find the previous summary email
 */
function getLastSummaryEmailTime(schedule, date){ 
  var matches = schedule.match(/([\d,]+);\[(\d{1,2}):(\d\d)\]/);
  if (matches)
  {
    var scheduledDays = matches[1].split(',');
    var scheduledHour = matches[2];
    var scheduledMin = matches[3];
  }
  else
  {
    throw new Error('Invalid Summary schedule: ' + schedule);
  }
  var day = date.getDay();

  var includeDay = ((date.getHours() > scheduledHour) || 
    (date.getHours() == scheduledHour && date.getMinutes() > scheduledMin));

  var numberOfDaysAgo;
  var found = false;
  var i = scheduledDays.length-1;
  while (i >= 0 && !found) {
    if (scheduledDays[i] < day || (scheduledDays[i] == day && includeDay)) {
      numberOfDaysAgo = day - scheduledDays[i];
      found = true;
    }
    i--;
  }
  if (!found) {
    numberOfDaysAgo = day + 7 - scheduledDays[scheduledDays.length - 1];
  }
  var lastEmailTime = new Date(date.toString());
  lastEmailTime.setDate( date.getDate() - numberOfDaysAgo );
  lastEmailTime.setHours(scheduledHour);
  lastEmailTime.setMinutes(scheduledMin);
  lastEmailTime.setSeconds(0);
  lastEmailTime.setMilliseconds(0);
  return lastEmailTime;
} 

/**
 * Private async helper method to create weekly summary email. 
 * Finds date of last scheduled summary and gets lists of all
 * backups that have occurred since then and other useful information.
 * Occurs based off the email summary schedule in config file.
 * 
 * @return 
 *   Async method that returns a Promise.
 */
function generateBackupSummaryEmail() {
  var message = {};

  // Calculate and cache a few values (the first call is potentially very slow)
  // TODO: what are the units on these calls, and can we make them dynamic?
  var dataDirSize = findDirSize(config.data_dir);
  var freeSpace = findFreeSpace();
  var summarySchedule = config.notifications.summary_schedule;
  var lastSummaryDate = getLastSummaryEmailTime(summarySchedule, new Date());

  message.subject = 'Weekly backup summary';
  message.shortMessage = 'Backup Size: ' + dataDirSize + '\n' +
    'Free Space: ' + freeSpace + '\n';

  logger.info('Summary of backups since the last summary (' + lastSummaryDate + '):')
  logger.info('  Total Size of all Backups = ' + dataDirSize);
  logger.info('  Remaining space on disk = ' + freeSpace);
  
  // Synchronous Inspection for the concatentated email
  //   http://bluebirdjs.com/docs/api/synchronous-inspection.html
  var header = '';
    
  return db.ProcessEvent.findOne({
    where: {
      event : 'start',
    },
    order: [['eventTime', 'DESC']],
  }).then(function(processEvents) {
    header = 
      'Weekly Backup Summary\r\n' +
      // TODO Add a note mentioning when to when this summary covers
      '=====\r\n' +
      'Total size of all backups: ' + dataDirSize + '\r\n' +
      'Disk space remaining: ' + freeSpace + '\r\n' +
      // TODO: format this date
      "Running since: " + processEvents.eventTime + '\r\n' + 
      // TODO: check if the process was restarted during our time period. How many times? How many shutdowns?
      '=====\r\n';
  })
  .then(function() {
    logger.debug('Getting all backup events since ' + lastSummaryDate);
    return db.BackupEvent.findAll({
      where: {
        backupTime: {
          gt: lastSummaryDate
        }
      }
    });
  }).then(function(backupEvents) {
    // Should be available because previous promise was fulfilled before this "then"
    // although ES6/ES8 offer better methods of this (yield or await)
    message.longMessage = header;
    for (var machineName in machines) 
    {
      var machine = machines[machineName];
      logger.trace('Working on machine: ', machine);
      message.longMessage +='Summary for ' +  machine.name + ':\r\n-----\r\n';

      for (var j=0; j<backupEvents.length; j++) {
        var data = backupsEvents[j].dataValues;
        logger.debug('data: ', data);
        if (data.machine === machine.name) 
        {
          message.longMessage += '  ' + 
            data.backupTime + ' ' +  
            (data.transferSize/(1024*1024*1024)).toFixed(2) + 'GB ' +
            'were backed up in ' + (data.transferTimeSec/60).toFixed(2) +
            ' min'
          if (data.rsyncExitCode) 
          {
            message.longMessage += ' with *failure*, err code: *' + data.rsyncExitCode + '*\r\n';
            message.longMessage += '    Reason: *' + data.rsyncExitReason + '*\r\n';
          }
          else
          {
            message.longMessage += ' successfully\r\n';
          }
        }
      }
      if (backupEvents.length == 0) message.longMessage += 'No backups or attempts occurred since the last summary...\r\n';
      message.longMessage += '\r\n';
    }

    logger.debug('Number of machines in Summary Notification: ' + machines.length);
    logger.info('Summary Notification generated.');

    // Fulfill the promise
    return message;
  });
}


/** 
 * Private helper method to send the Summary Notification and schedule the next
 * message to be sent via a timeout.
*/
function sendSummaryEmail()
{
  generateBackupSummaryEmail().then(function(message) {
    // Send the message that was generated
    notifications.dispatch(message);
  })
  .catch(function(err) {
    logger.error('Error occurred while generating the Summary Notification: ' + err.message);
    logger.debug(err.stack);
    notifications.dispatch({
      subject: 'Error sending Summary Email',
      shortMessage: 'Could not send',
      longMessage: 'While attempting to generate the Summary Notification, an error occurred:' + err.message + '\r\n\r\n' +
        'Please see the logfile on the server for more details\r\n\r\n' +
        'Sincerely,\r\nYour ' + config.app.name + ' (' + config.app.version + ')\r\n' 
    });
  })
  .finally(function() {
    var nextScheduledTime = getNextScheduledTime(config.notifications.summary_schedule);
    logger.debug('Scheduling next Summary notification for: ' + nextScheduledTime);
    // nextScheduledTime will be null on errors
    if (nextScheduledTime)
    {
      // Remove the old timeout (in case it is still active)
      clearTimeout(summaryTimeoutId);

      // Arrange the new timeout
      summaryTimeoutId = setTimeout(sendSummaryEmail, nextScheduledTime.getTime() - new Date().getTime());
    }
    else
    {
      // NOTE: This shouldn't ever happen unless the config can be changed...
      logger.error('Problem parsing Summary notification schedule. Summary is disabled...');
    }
  });
}

/**
 * Main Backup system definition.
 */
var system = {
  /**
  * Initialize the start of the backing up process.  Set timeouts for summary emails
  *     and backing up of individual machines.
  * @param application
  *     express application variable.
  */
  init: function(cfg, dbh) {
    // TODO: break these into private methods 
    //   (testDataDir(), evalConfig(), scheduleBackups(), scheduleSummary(), checkDirtyShutdown())
    // Save private reference to our db and config
    db = dbh;
    config = cfg;

    // Create machine objects from configurations
    prepareMachines(config);

    // Configure the notification dispatchers (email, sms, or log)
    notifications.init(config);

    // Test data directory for access
    // TODO (or should we do this during config parsing at startup?)

    // Log unexpected configurations
    // TODO

    // Schedule machine backups
    var currentTime = new Date();
    Object.keys(machines).forEach(function(name) {
      logger.debug('Scheduling backup for "' + name + '"');
      var machine = machines[name];
      var machineLogger = logging.getLogger(machine.name);
      try
      {
        var nextBackup = getNextScheduledTime(machine.schedule);
        var timeoutTime = nextBackup.getTime() - currentTime.getTime();
        machineLogger.info('Scheduling backup at ' + nextBackup + ' for "' + machine.name + '"');
        machine.timeoutId = setTimeout(function() { 
          system.backupProcess(this);
        }.bind(machine), timeoutTime);
      }
      catch (error)
      {
        // TODO notification this
        machineLogger.error('Could not schedule backup for "' + name + '": ' + error.message);
        machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
          'backups until this problem is resolved***');
        logger.debug(error.stack);
      }
    });
    
    // Set the timeout for the Periodic Backup Summary
    // (Removing config.summary from the .ini disables this)
    if (config.notifications.summary_schedule)
    {
      var nextScheduledTime = getNextScheduledTime(config.notifications.summary_schedule);
      logger.debug('Scheduling Summary notification for: ' + nextScheduledTime);
      // nextScheduledTime will be null on errors
      if (nextScheduledTime)
      {
        // Schedule a timeout to generate and send this summary. It should also schedule
        // the next timeout upon completion. We store the timeoutId so that we can cancel
        // this summary as needed, or run it out of schedule.
        summaryTimeoutId = setTimeout(sendSummaryEmail, nextScheduledTime.getTime() - currentTime.getTime());
      }
      else
      {
        // TODO Maybe make this more obvious through a notification? 
        //   Or call this a config error and exit?
        logger.error('Problem parsing Summary notification schedule. Summary is disabled...');
      }
    }
    else
    {
      logger.warn('No Summary notification configured');
    }

    // Check to make sure the program didn't end last time with an unexpected shutdown.
    return db.ProcessEvent.findOne({
      order: [
        ['eventTime', 'DESC']
      ]
    })
    .then(function(processEvent) {
      // TODO: Also include failures for dirty shutdowns (exit code != 0, SIGINT, etc)
      if (processEvent && processEvent.event !== 'exit')
      {
        logger.debug('**Last shutdown does not appear clean**');

        // TODO - Improve this following our new conventions
        var subject = 'Backup System Unexpected Shutdown Occurred';
        var text = 'The backup system restarted after an unexpected shutdown. ';
        text += 'Some backups may be missing...';
        
        // Dispatch this notification
        notifications.dispatch({ subject: subject, shortMessage: text, longMessage: text });
      }

      // Now complete our successful startup with an event
      return db.ProcessEvent
      .create({ 'event' : 'start' })
      .then(function(processEvent) {
        logger.info('Backup System startup completed at ' + processEvent.eventTime);
      });
    })
    .catch(function (err) {
      logger.error('DB Error occurred processing startup / shutdown events: ' + err.message);
      logger.debug(err.stack);
    });
  },

  /**
   * Parses schedule and creates an easily traversable object.
   * Example:
   *   DAYS(N)|DAYS2(M)|...;[TIME]
   * Optional number of backups (N)
   *
   * @param schedule (string)
   *     The schedule in the intial string format.
   * @return
   *     schedule object from the parsed schedule.
   */
  parseSchedule: function (schedule) {
    var scheduleObj = {};

    // Be sure to throw all errors as Schedule syntax errors
    try
    {
      var partialSplit = schedule.split(';');
      
      // Parse "[TIME]" component
      scheduleObj.time = {};
      // Remove the brackets from the time.
      var time = partialSplit[1].replace(/[\[\]]/g,'').split(':');
      scheduleObj.time.hours = parseInt(time[0]);
      scheduleObj.time.minutes = parseInt(time[1]);
      scheduleObj.daysSets = [];

      // Parse the "DAYS(N)|..." component
      partialSplit[0].split('|').forEach(function(schedSet) {
        var daysSet = {};

        // The DAYS(N)|DAYS2(M)|...;TIME syntax should allow for missing (N)
        var schedSetArr = schedSet.split('(');
        daysSet.number = (schedSetArr[1]) ? parseInt(schedSetArr[1]) : 0;

        // Split comma separated days
        // TODO - support X-Y  syntax as well?
        daysSet.days = schedSetArr[0].split(',').map(function(num) {
          return parseInt(num);
        });

        // Save all days for this set
        scheduleObj.daysSets.push(daysSet);
      });
    }
    catch (error)
    {
      throw new Error('Schedule syntax error for "' + schedule + '"');
    }

    return scheduleObj;
  },

  /**
   *  Takes the easily parsable schedule format for the machine and
   *  turns it into words so that when it needs to be written out for
   *  a user it is more easily understood.
   *  @param schedule (scheduleObject)
   *    The schedule as a scheduleObject from the parseSchedule method.
   *  @return
   *    Human readable schedule as a string
   */
   convertSchedObjToReadable: function (scheduleObj) {
     var daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
     var readableSched = "";
     for (var i=0; i<scheduleObj.daysSets.length; i++)
     {
       var daysSet = scheduleObj.daysSets[i];
       readableSched += "Last " + daysSet.number + " Days " + daysOfWeek[daysSet.days[0]];
       for (var j=1; j<daysSet.days.length; j++)
       {
         readableSched += ", " + daysOfWeek[daysSet.days[j]];
       }
       readableSched += "\n";
     }
     var period = (scheduleObj.time.hours < 12) ? "a.m." : "p.m.";
     var hour = (scheduleObj.time.hours > 12) ? scheduleObj.time.hours - 12 : scheduleObj.time.hours;
     readableSched += "  at " + hour + " " + period;
     return readableSched;
   },

  /*
   * Add buckets in chronological order to the bucket list.
   *     If a date overlaps multiple schedules it only gets
   *    added to the list one time.
   * @param bucket
   *     Bucket object to add to the list.
   */
  addBucketToList: function (bucket, bucketList) {
    var added = false;
    for (var i=0; i< bucketList.length; i++) {
      if (bucket.date.getTime() < bucketList[i].date.getTime())
      {
        bucketList.splice(i, 0, bucket);
        added = true;
        break;
      }
      else if (bucket.date.getTime() == bucketList[i].date.getTime())
      {
        // If it already exists, don't add and move on.
        added = true; 
        break;
      }
    }
    if (!added)
    {
      bucketList.push(bucket);
    }
  },
  
  /**
   * Returns an array of buckets which is an array of date objects
   *    that defines the day and time of a backup that needs to be stored.
   * @param sched
   *     the machine defined schedule from when to backup and how long the backups are stored.
   * @param date
   *     the date from which you are trying to find the stored backups.  Usually this is the
   *     current date.
   */
  getBuckets: function (sched, date) {
    var schedObj = system.parseSchedule(sched);
    // Initialize our buckets array.
    var buckets = [];
  
    // Boolean var determines whether or not the day of the given date should be included as a bucket.
    var includeDay = (date.getHours() > schedObj.time.hours || 
          date.getHours() == schedObj.time.hours && date.getMinutes() >= schedObj.time.minutes)
    var day = date.getDay();
    schedObj.daysSets.forEach(function(daysObj) {
      // Find index of days array to create first bucket.
      var index = -1;
      for (var i=0; i<daysObj.days.length; i++) {
        if (day > daysObj.days[i])
        {
          continue;
        }
        else if (day == daysObj.days[i] && !includeDay || day < daysObj.days[i])
        {
          index = i-1;
          break;
        }
        else if (day == daysObj.days[i] && includeDay)
        {
          index = i;
          break;
        }
      }
      if (index == -1)
      {
        index = daysObj.days.length - 1;
      }
  
      var startingDay = day;
      var difference = 0;
      var count = daysObj.number;
  
      // While daysObject.number > 0
      while (count > 0) {
  
        if (startingDay - daysObj.days[index] < 0)
        {
          difference = difference + startingDay + 7-daysObj.days[index];
        }
        else
        {
          difference = difference + (startingDay - daysObj.days[index]);
        }
        var bucket = {};
        bucket.date = new Date(date.toString());
        bucket.date.setDate(date.getDate() - difference);
        bucket.date.setHours(schedObj.time.hours);
        bucket.date.setMinutes(schedObj.time.minutes);
        bucket.date.setSeconds(0);
        bucket.date.setMilliseconds(0);
        system.addBucketToList(bucket, buckets);
        startingDay = daysObj.days[index];
        if (index == 0) { startingDay = 7 + daysObj.days[index]; }
        index = (index - 1) % daysObj.days.length;
        //
        // Javascript modulo of negative numbers doesn't work as expected
        // so once it gets negative we start over at the end of the list.
        // 
        if (index < 0) { index = daysObj.days.length - 1 }
        count--;
      }
    });
    return buckets;
  },

  /**
   * Fills the buckets obtained from the method getBuckets with the backup dirs.
   * @param buckets
   *   array of buckets obtained from getBuckets.
   * @param dir
   *   directory that holds the backup directories for a given machine.
   * @param machine
   *   the machine that we are checking the buckets and running the backup for.
   * @param removeDirs
   *   callBack function that does something with the deleted directories (deletes or prints out.)
   */
  fillBuckets: function (buckets, backupDir, machine, callback) {
    var dateArr = [];
    var backups = [];
    var date = new Date();
    var logger = logging.getLogger(machine.name);

    // Ensure backup location (ie silently create if missing)
    // Sync to avoid one callback layer here
    try
    {
      fs.ensureDirSync(backupDir);
    }
    catch (error)
    {
      return callback(error, false, []);
    }

    // Use directory listing to assign Directories -> Buckets
    fs.readdir(backupDir, function(err, dirListing) {
      // Hand error handling up a level
      if (err != null) return callback(err, false, []);

      // TODO: should we be more strict about the name of these dirs?
      // I think we should. Maybe have a util that generates / tests the
      // naming of directories?
      var backups = [];
      dirListing.forEach(function(dirname) {
        var newDate = new Date(dirname);
        if (!isNaN(newDate))
        {
          // Valid name: Add to the array of directories that contain backups
          backups.push({date: newDate, dir: dirname});
        }
        else if (dirname != rsync.getInProgressName())
        {
          logger.warn('Found unexpected file / directory in machine backup location: ' +
              '"' + dirname + '"');
        }
      });
      // Make sure the list is sorted in chronological order
      backups.sort(function (d1, d2) {
        if (d1.date < d2.date) return -1;
        else if (d1.date > d2.date) return 1;
        else return 0;
      });

      // Debug output
      logger.debug(backups.length + ' past backups from scheduled times found');
      backups.forEach(function(backup) { logger.trace('  "' + backup.dir + '"'); });

      logger.debug('Pairing the directories with a scheduled backup time.');
      for (var i=backups.length-1; i>=0; i--) {
        for (var j=buckets.length-1; j>=0; j--) {
          // If the directory date is later than the bucket date and bucket is
          //   empty, add the directory date to the bucket.
          if (backups[i].date >= buckets[j].date && buckets[j].backup == null)
          {
            buckets[j].backup = backups[i];
            break;
          }
          else if (backups[i].date >= buckets[j].date && backups[i].date < buckets[j].backup.date)
          {
            // If it the directory date is later than the bucket date and earlier than
            //   the existing date in the bucket replace it with the earlier date.
            buckets[j].backup = backups[i];
            break;
          }
        }
      }
      buckets.forEach(function(bucket) {
        if (bucket.backup) logger.trace('  [' + bucket.date + ']: "' + bucket.backup.dir + '"'); 
        else logger.trace('  [' + bucket.date + ']: missing'); 
      });

      // Count empty buckets and report
      var emptyBucketCount = buckets
        .map(function(bucket) { return (!bucket.backup) ? 1 : 0; })
        .reduce(function(prev, cur) { return prev + cur; });
      logger.info(emptyBucketCount + ' missing backups out of ' + buckets.length + ' scheduled.');

      // Find unassigned directories
      var toDelete = [];
      backups.forEach(function(backupObj) {
        var used = buckets
          .map(function(bucket) { return (bucket.backup && backupObj.dir === bucket.backup.dir); })
          .reduce(function(prev, cur) { return (prev || cur); });
        if (!used) toDelete.push(path.join(backupDir, backupObj.dir));
      });
      logger.trace(toDelete);

      // Determine callback parameters
      if (!(buckets[buckets.length-1].backup))
      {
        // Backup needed!
        logger.debug('The last scheduled backup has yet to occur.');
        callback(null, true, toDelete);
      }
      else
      {
        // No backup needed (never delete directories in this case)
        logger.debug('No backup necessary.');
        callback(null, false, []);
      }
    });
  },
 
  /**
   * Makes a call to getRemovedDirectoriesList and passes a callback
   * to list them out.
   * @param backups
   *   list of the backup directories from different dates.
   * @param buckets
   *   list of buckets obtained from the getBuckets and fillBuckets functions.
   */
  listDirectoriesToRemove: function(backups, buckets) {
    system.getRemovedDirectoriesList(backups, buckets, function(removedDirectories) {
      console.log("\nRemove directories:");
      removedDirectories.forEach(function(unusedBackupDir) {
        console.log(unusedBackupDir);
      });
    });
  },

  /**
   * Makes a call to getRemovedDirectoriesList and passes a callback
   * to delete them from the filesystem.
   * @param backups
   *   list of the backup directories from different dates.
   * @param buckets
   *   list of buckets obtained from the getBuckets and fillBuckets functions.
   * @param backupsPath
   *   the path to the backupDirectories for a machine.
   */
  removeDirectories: function (buckets, backupsPath) {
    system.getDirectoriesToRemove(backupsPath, buckets, function(removedDirectories) {
      removedDirectories.forEach(function(unusedBackupDir) {
        fs.remove(unusedBackupDir, function(err, dirs, files) {
          if (err) { logger.error('Unable to remove directory.  \nError: ' + error.message); }
          else { (logger.info('removing ' + unusedBackupDir)); }
        });
      });
    });
  },

  /**
   * Call takes in callback and does something with
   * the list of directories that need to be removed.
   * @param backups
   *   list of the backup directories from different dates.
   * @param buckets
   *   buckets that are obtained with getBuckets and modified with fillBuckets functions.
   * @param callback
   *   function to do something with the directories to remove list.
   */
  getDirectoriesToRemove: function(backupsPath, buckets, callback) {
    fs.readdir(backupsPath, function(err, datedDirs) {
      var backups = [];
      datedDirs.forEach(function(datedDir) {
        // Add to the array of directories that contain backups
        backups.push(datedDir);
      });
      var removedDirectories = [];
      backups.forEach(function(datedDir) {
        var directoryDate = new Date(datedDir);
        var remove = true;
        buckets.forEach(function(bucket) {
          if (bucket.backup != null && bucket.backup.getTime() == directoryDate.getTime())
          {
            remove = false;
          }
        });
        if (remove)
        {
          removedDirectories.push(path.join(backupsPath, datedDir));
        }
      });
      callback(removedDirectories);
    });
  },

  /**
   * Getter function for backupQueues.  Returns the object that holds the lists of both
   *   machines currently being backed up and the list of machines that are waiting to be
   *   backed up if the system is at the limit for concurrent backups defined in the config file.
   */
  getBackupQueues: function() {
    return backupQueues;
  },
  
  /**
   *  Main application loop.
   *  Gets called after a setTimeout of whenever the next scheduled backup is for the machine.
   *  Follows the steps:
   *    1. Gets a list of buckets (Times when the machine should be backed up)
   *    2. Fills buckets (checks all the times that the machine was actually backed up)
   *    3. Performs backup if necessary (It should be necessary).
   *    4. Set timeout to repeat the cycle.
   *  @params
   *    machine-machine that is scheduled to backup.
   */
  backupProcess: function(machine) {
    var machineLogger = logging.getLogger(machine.name);
    machineLogger.debug('system.backupProcess() called for "' + machine.name + '"');
    var machineDir = path.join(config.data_dir, machine.name);
    var buckets;

    // Create our list of required backup buckets, based on our schedule
    // NOTE: maybe we should go async here, for consistency?
    try
    {
      machineLogger.trace('Creating list of backup buckets');
      buckets = system.getBuckets(machine.schedule, new Date());
    }
    catch (bucketError)
    {
      machineLogger.error('Cannot get list of scheduled backup times: ' + bucketError.message);
      machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
          'backups until this problem is resolved***');
      machineLogger.debug(bucketError.stack);
      return;
    }

    // Compare the list of buckets to the backup directories on the disk
    machineLogger.trace('Filling buckets from disk dir: "' + machineDir + '"');
    system.fillBuckets(buckets, machineDir, machine, function(bucketErr, backupNeeded, toDelete) {
      if (bucketErr)
      {
        machineLogger.error('Could not assign existing backup directories to previously ' + 
            'scheduled backup times: ' + bucketErr.message);
        machineLogger.debug('Backup directories read from: "' + machineDir + '"');
        machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
            'backups until this problem is resolved***');
        machineLogger.debug(bucketErr.stack);
        return;
      }

      // NOTE: Unless the schedule has been changed since system startup 
      //   (and the originally scheduled timeout wasn't canceled): 
      // This should *always* be true.
      // Regardless, let's handle both cases since we can.
      if (backupNeeded)
      {
        // Begin rsync unless we have reach our max simultaneous limit
        if (!config.rsync.max_simultaneous || 
            backupQueues.inProgress.length < config.rsync.max_simultaneous) 
        {
          machineLogger.info('Starting backup for machine: ' + machine.name);
          backupQueues.inProgress.push(machine);
          
          // Run rsync (all errors returned in the callback)
          rsync.runRsync(config, machine, function(rsyncErr, rsyncStats) {
            if (rsyncErr)
            {
              machineLogger.error('Network error during "' + machine.name + '" backup: ' + 
                  rsyncErr.message);
              machineLogger.debug(rsyncErr.stack);
              machine.failures.push({
                when: new Date(),
                reason: rsyncErr.message
              });
            }

            // Complete Backup attempt (failures and successes)
            return completeBackup(rsyncErr, machine, rsyncStats, toDelete);
          });
        }
        else
        {
          logger.debug('At capacity of ' + config.rsync.max_simultaneous);
          machineLogger.info('Deferring backup for machine: ' + machine.name);
          // Push onto the waiting queue to be called later.
          backupQueues.remaining.push(machine);
        }
      }
      else
      {
        machineLogger.warn('Backup process was called, despite all currently scheduled backups ' +
            'already existing on the disk. This indicates either an application error, or ' +
            'manual manipulation of the backup destination. Please review the files / directories ' +
            'on the disk in the following location: "' + machineDir + '"');
        completeBackup(null, machine, {
          code: 0,
          error: 'Backup attempt, when no backup was needed',
        }, toDelete);
      }
    });
  }
};

module.exports = system;
