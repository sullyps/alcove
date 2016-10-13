'use strict';
var fs = require('fs-extra'),
    path = require('path'),
    ini = require('ini'),
    logging = require('./config/log4js');

var rsync = require('./rsync'),
    emailDispatcher = require('./emailDispatcher');

var logger = logging.getLogger();
var backupQueues = { remaining: [], inProgress: [] };
var machines = {};
var summaryTimeoutId, config, db;

// Methods to handle the process being killed and commit event to db
const SIGINT = 128 + 2;
const SIGTERM = 128 + 15;

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

  // Shortcircuit if the db is inaccessible
  if (!db) return process.kill(process.pid, code);

  var exitReason = 'Unknown';
  switch(code) {
    case 0:
      exitReason = 'COMPLETED';
      break;
    case SIGINT:
      exitReason = 'SIGINT';
      break;
    case SIGTERM:
      exitReason = 'SIGTERM';
      break;
  }

  // Push the shutdown event to the database.
  (function shutdown() {db.ProcessEvent.create({
    'event' : 'exit',
    'exitCode' : code,
    'exitReason' : exitReason,
  })
  .then(function(processEvent) {
    logger.debug('Process exiting with exit code ' + processEvent.exitCode);
    process.exit(0);
  })
  .catch(function (err) {
    logger.error('Could not save shutdown event to the database: ' + err);
    // Send signal anyways but don't write the exit event to the database.
    process.kill(process.pid, code);
  });
  })();
}
process.on('SIGINT', function() { addProcessExitEvent(SIGINT); });
process.on('SIGTERM', function() { addProcessExitEvent(SIGTERM); });
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

      // Create an appropriate logger for this machine
      logging.addMachine(machine);

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
  console.debug('All machines are prepared for backups');
}

/**
 * Private helper to finds the next scheduled summary time, given the schedule 
 * and current time.
 * @param String scheduleStr
 *   Schedule definition using the backup schedule syntax but omitting the 
 *   # of backups (the portion in parentheses).
 */
// TODO: Combine with findNextScheduledTime?
function getNextSummaryTime(scheduleStr) 
{
  var now = new Date();
  var schedule;

  // Parse the schedule first
  try
  {
    schedule = system.parseSchedule(scheduleStr);

    if (schedule.daysSets.length != 1)
      throw new Error('Only single day set definition allowed');
  }
  catch (error)
  {
    // Shouldn't ever happen after a successful startup.
    logger.error('Could not parse summary schedule: ' + error.message);
    logger.debug(error.stack);
    logger.warn('Summaries will be disabled...');
    return null;
  }

  var dates = [];
  schedule.daysSets[0].days.forEach(function(dayOfWeek) {
    var date = new Date();
    date.setHours(schedule.time.hours);
    date.setMinutes(schedule.time.minutes);
    date.setSeconds(0);

    // Determine number of days in the future for this "set"
    var diff = dayOfWeek - now.getDay();
    if ((diff < 0) || (diff == 0 && date < now))
      diff += 7;

    // Offset this date
    date.setDate(date.getDate() + diff);

    dates.push(date);
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
    var nextScheduledTime = system.findNextScheduledTime(machine.schedule, now);
    timeout = nextScheduledTime.getTime() - now.getTime();
    // TODO Major error warning must go out to notifications system
    machine.failures = [];
    logger.warn('Next backup attempt will be at the normal scheduled time: ' + nextScheduledTime);
  }
  else if (rsyncErr)
  {
    // Failure, retry according to our graduated back-off rate
    var retry = config.rsync.retry.time * 60 * 1000;
    var multiplier = config.rsync.retry.multiplier;
    timeout = retry * Math.pow(multiplier, machine.failures.length - 1);
    // TODO (probably sprintf-js this for the decimal handling)
    logger.warn('Backup failed. Retry attempt scheduled for ' + (timeoutTime/ 1000 / 60.0) + ' minutes');
  }
  else
  {
    // Success
    var nextScheduledTime = system.findNextScheduledTime(machine.schedule, now);
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
  // TODO: test for and handle a "null" timeout value
  machine.timeoutId = setTimeout(function() { system.backupProcess(this) }.bind(machine), timeout);

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
    // Save private reference to our db and config
    db = dbh;
    config = cfg;

    // Create machine objects from configurations
    prepareMachines(config);

    // Configure the notification dispatchers (email, sms, or log)
    // TODO

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
        var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
        var timeoutTime = nextBackup.getTime() - currentTime.getTime();
        machineLogger.info('Scheduling backup at ' + nextBackup + ' for "' + machine.name + '"');
        machine.timeoutId = setTimeout(function() { 
          system.backupProcess(this);
        }.bind(machine), timeoutTime);
      }
      catch (error)
      {
        machineLogger.error('Could not schedule backup for "' + name + '": ' + error.message);
        machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
          'backups until this problem is resolved***');
        logger.debug(error.stack);
      }
    });
    
    // Set the timeout for the Periodic Backup Summary
    // (Removing config.summary from the .ini disables this)
    if (config.summary)
    {
      var nextScheduledTime = getNextSummaryTime(config.summary);
      if (nextScheduledTime)
      {
        // nextScheduledTime will be null on errors
        /* TODO
        summaryTimeoutId = setTimeout(function() {
          emailDispatcher.backupSummaryEmail(machines)
        }, nextScheduledTime.getTime() - currentTime.getTime());
        */
      }
    }
    else
    {
      logger.warn('No Backup Summary notification configured');
    }

    // Check to make sure the program ended didn't end last time with an unexpected shutdown.
    db.ProcessEvent.findOne({
      order: [
        ['eventTime', 'DESC']
      ]
    })
    .then(function(processEvent) {
      if (processEvent && processEvent.event !== 'exit')
      {
        logger.debug('**Last shutdown does not appear clean**');

        // TODO - Improve this
        var subject = 'Backup System Unexpected Shutdown Occurred';
        var text = 'The backup system restarted after an unexpected shutdown.';
        text += 'Some backups may be missing...';
        
        // TODO
        //dispatchNotification(subject, text);
      }

      // Now complete our successful startup with an event
      db.ProcessEvent
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
        // TODO number = 0 should be unlimited
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
   * Returns the next scheduled backup time.
   * @param schedule (string)
   *     the raw unparsed schedule.
   * @param date
   *     the date that you wish to find the next scheduled time from.  Usually the current time.
   */
  findNextScheduledTime: function (schedule, date)  {
    // TODO: Handle errors here or throw up?
    var scheduleObject = system.parseSchedule(schedule);
    // boolean for including date given as a possible next scheduled backup day.
    var includeDay = date.getHours() < scheduleObject.time.hours || 
          (date.getHours() == scheduleObject.time.hours && 
           date.getMinutes() < scheduleObject.time.minutes);
    var day = date.getDay();
    //
    // Set variable numberOfDaysFromNow to high number so it has
    // to be less than this many days the first time through.
    // 
    var numberOfDaysFromNow = Number.POSITIVE_INFINITY;
    scheduleObject.daysSets.forEach(function(daysObj) {
      var index = -1;
      for (var i=0; i<daysObj.days.length; i++) {
        if (day == daysObj.days[i] && includeDay || day < daysObj.days[i])
        {
          index = i;
          break;
        }
        else if (day == daysObj.days[i] && !includeDay)
        {
          index = i + 1;
          break;
        }
      }
      
      var tempNumDays = 0;
      if (index >= 0 && index < daysObj.days.length)  { tempNumDays = daysObj.days[index] - day; }
      else
      {
        index = 0;
        tempNumDays = 7 - day + daysObj.days[index];
      }
      if (tempNumDays < numberOfDaysFromNow)
      {
        numberOfDaysFromNow = tempNumDays;
      }
    });

    // Set the date and times for the next backup date.
    var nextScheduledBackup = new Date(date.toString());
    nextScheduledBackup.setDate( date.getDate() + numberOfDaysFromNow );
    nextScheduledBackup.setHours(scheduleObject.time.hours);
    nextScheduledBackup.setMinutes(scheduleObject.time.minutes);
    nextScheduledBackup.setSeconds(0);
    nextScheduledBackup.setMilliseconds(0);
    return nextScheduledBackup;
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
