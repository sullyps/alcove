'use strict';
var fs = require('fs-extra'),
    path = require('path'),
    ini = require('ini'),
    rmdir = require('rmdir'),
    logging = require('./config/log4js');

var rsync = require('./rsync'),
    emailDispatcher = require('./emailDispatcher');

var logger = logging.getLogger();
var backupQueues = { remaining: [], inProgress: [] };
var machines = {};
var summaryTimeoutId, db;

// Methods to handle the process being killed and commit event to db
const SIGINT = 128 + 2;
const SIGTERM = 128 + 15;

/**
 * Private method that takes info from a backup attempt and inserts it into the
 * DB to create a history for later reference.
 *
 * @param machine
 *   Object for the machine that just had the backup attempt that is being added to the db.
 * @param backupInfo
 *   All of the info that is passed along from the backup process that may be needed.
 * @param rsyncExitCode
 *   The status code that rsync exited with. 0 means success, everything else is an error.
 */
function insertBackupEvent (machine, backupInfo, rsyncExitCode) {
  if (!db) throw new Error('The Events DB has not been properly created');

  var machineLogger = logging.getLogger(machine.name);
  var exitReason = '';
  db.BackupEvent.create({
    'machine' : machine.name,
    'rsyncExitCode' : rsyncExitCode,
    'rsyncExitReason' : exitReason,
    'transferSize' : backupInfo.totalTransferredFileSize,
    'transferTimeSec' : backupInfo.totalTransferTime
  })
  .then(function(backupInfo) {
     machineLogger.info('Info stored from backup:', backupInfo.dataValues);
  })
  .catch(function (err) {
    machineLogger.error('BackupEvent db insertion failed:', err);
  });
}

/**
 * Gracefully handle shutdowns due to SIGINT or SIGTERM.
 */
function addProcessExitEvent(code) {
  // Shortcircuit if the db is inaccessible
  if (!db) process.kill(process.pid, code);

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
function createMachines(config)
{
  var confDir = path.normalize(path.join(config.app.config, '..'));
  var machineConfPath = path.join(confDir, 'machines');

  // Check for access to machines config directory first
  try
  {
    fs.accessSync(machineConfPath);
  }
  catch (error)
  {
    logger.warn('Cannot access machine conf directory (' + machineConfPath + '): ' + error.message);
    logger.debug(error.stack);
    return;
  }

  // Now attempt to read all active configuration files (synch)
  try
  {
    var machineConfs = fs.readdirSync(machineConfPath);
    machineConfs.forEach(function(file) {
      // Only process ".ini" files
      if (!file.match(/.+\.ini$/)) return;

      // Isolate errors on any single config
      try
      {
        var filename = path.join(machineConfPath, file);
        var machineConfig = ini.parse(fs.readFileSync(filename, 'utf-8'));
        var machine = {
          schedule: machineConfig.schedule,
          name: machineConfig.name,
          ip: machineConfig.ip,
          inclusionPatterns: machineConfig.inclusionPatterns,
          exclusionPatterns: machineConfig.exclusionPatterns,
          backupAttemptCount: 0
        };

        // Warn about duplicate machine definitions
        if (machines[machine.name])
          return logger.warn('Multiple definitions for machine "' + machine.name + 
              '", please review your configuration files for issues');

        // Create an appropriate logger for this machine
        logging.addMachine(machine);

        // This machine is configured
        machines[machine.name] = machine;
      }
      catch(error)
      {
        logger.error('Parsing error (' + filename + '): ' + error.message);
        logger.debug(error.stack);
      }
    });
  }
  catch (error)
  {
    logger.error('Problem reading machine configs: ' + error.message);
    logger.debug('Machine config directory (' + machineConfPath + ')');
    logger.debug(error.stack);
    return;
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
  init: function(config, dbh) {
    // Save reference to our db
    db = dbh;

    // Create machine objects from configurations
    createMachines(config);

    // Configure the notification dispatchers (email, sms, or log)
    // TODO

    // Test data directory for access
    // TODO

    // Log unexpected configurations
    // TODO

    // Schedule machine backups
    var currentTime = new Date();
    Object.keys(machines).forEach(function(name) {
      var machine = machines[name];
      var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
      var machineLogger = logging.getLogger(machine.name);
      var timeoutTime = nextBackup.getTime() - currentTime.getTime();
      machineLogger.info('Scheduling backup at ' + nextBackup + ' for ' + machine.name);
      machine.timeoutId = setTimeout(function() { 
        system.backupProcess(this);
      }.bind(machine), timeoutTime);
    });
    
    // Set the timeout for the Weekly Backup Summary
    if (config.summary)
    {
      var summarySched = config.summary;
      // TODO: move this calculation to system
      var nextScheduledTime = emailDispatcher.getNextSummaryEmailTime(summarySched, currentTime);
      /* TODO
      summaryTimeoutId = setTimeout(function() {
        emailDispatcher.backupSummaryEmail(machines)
      }, nextScheduledTime.getTime() - currentTime.getTime());
      */
    }

setTimeout(function() {}, 1000);
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
   * @param schedule (string)
   *     The schedule in the intial string format.
   * @return
   *     schedule object from the parsed schedule.
   */
  parseSchedule: function (schedule) {
    var scheduleObj = {};
    var partialSplit = schedule.split(';');
    // Remove the brackets from the time.
    scheduleObj.time = {};
    var time = partialSplit[1].replace(/[\[\]]/g,'').split(':');
    scheduleObj.time.hours = parseInt(time[0]);
    scheduleObj.time.minutes = parseInt(time[1]);
    scheduleObj.daysSets = [];
    partialSplit[0].split('|').forEach(function(schedSet) {
      var daysSet = {};
      schedSetArr = schedSet.split('(');
      daysSet.number = parseInt(schedSetArr[1]);
      var days = schedSetArr[0].split(',');
      daysSet.days = [];
      for (var i=0; i<days.length; i++) {
        daysSet.days.push(parseInt(days[i]));
      }
      scheduleObj.daysSets.push(daysSet);
    });
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
    system.findNextScheduledTime(sched, date);
    schedObj = system.parseSchedule(sched);
    // Initialize our buckets array.
    buckets = [];
  
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
    var scheduleObject = system.parseSchedule(schedule);
    // boolean for including date given as a possible next scheduled backup day.
    var includeDay = (date.getHours() < scheduleObject.time.hours || 
          date.getHours() == scheduleObject.time.hours && date.getMinutes() < scheduleObject.time.minutes);
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
   * Based on the rsync exit code and the machines schedule and backup
   *     attempt number this method returns the time until the next
   *     backup attempt as time in milliseconds.
   * @param machine
   *     machine object that was just backed up.
   * @param rsyncExitCode
   *     status code that rsync completed with.
   */
  timeoutToNextBackup: function(machine, rsyncExitCode) {
    var attemptMultiplier = config.rsync.retry.multiplier;
    var maxAttempts = config.rsync.retry.max_attempts;
    var timeoutTime = 0;

    // If rsync exited with a successful status code or the max number of backup attempts has been hit.
    if (rsyncExitCode == 0 || machine.backupAttemptCount == maxAttempts)
    {
      var currentDate = new Date(Date.now());
      var nextScheduledTime = system.findNextScheduledTime(machine.schedule, currentDate);
      timeoutTime = nextScheduledTime.getTime() - currentDate.getTime();

      // Reset the attempt counter if it has hit the max attempts or was successful
      machine.backupAttemptCount = 0;
      logger.info('Next backup is at the normal scheduled time: ' + nextScheduledTime);
    }
    else
    {
      // First attempt after an error is 3 minutes according to this.
      var rsyncRetryTime = config.rsync.retry.time;
      var errorTimeout = rsyncRetryTime*60*1000;
      var timeoutMultiplier = Math.pow(attemptMultiplier, machine.backupAttemptCount - 1);
      timeoutTime = errorTimeout * timeoutMultiplier;
      logger.info('Next timeout scheduled for ' + timeoutTime/1000/60 + ' minutes');
    }
    return timeoutTime;
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
  fillBuckets: function (buckets, dir, machine, callback) {
    var dateArr = [];
    var backups = [];
    var date = new Date();
    var newBackupDir = path.normalize(path.join(dir, date.toISOString()));
    var logger = logging.getLogger(machine.name);

    var backupDirStats = fs.statSync(dir);
    if (!backupDirStats.isDirectory())
    {
      var errorMsg = 'Backup directory ' + dir + ' does not exist.  Please create the directory in order to run the backup system.';
      var error = new Error(errorMsg);
      error.name = 'DirectoryDoesNotExistError';
      throw 'DirectoryDoesNotExistException'
    }
    fs.readdir(dir, function(err, backupsData) {
      if (err != null)
      {
        throw err;
      }
      backupsData.forEach(function(datedDir) {
        dateArr.push(new Date(datedDir));
        // Add to the array of directories that contain backups
        backups.push(datedDir);
      });
      // Make sure the dates array is sorted in chronological order.
      dateArr.sort();
      logger.debug(dateArr.length + ' past backups from scheduled times found');
      dateArr.forEach(function(date) {
        logger.trace('  ' + date);
      });

      logger.debug('Pairing the directories with a scheduled backup time.');
      for (var i=dateArr.length-1; i>=0; i--) {
        for (var j=buckets.length-1; j>=0; j--) {
          // If the directory date is greater than the bucket date and bucket date
          //   doesn't already exist add the directory date to the bucket.
          if (dateArr[i] >= buckets[j].date && buckets[j].backup == null)
          {
            buckets[j].backup = dateArr[i];
            break;
          }
          else if (dateArr[i] >= buckets[j].date && dateArr[i] < buckets[j].backup)
          {
            // If it the directory date is greater than the bucket date and smaller than
            //   the existing date in the bucket replace it with the smaller date.
            buckets[j].backup = dateArr[i];
            break;
          }
        }
      }
      var emptyBucketCount = 0;
      var filledBucketCount = 0;

      for (var i=0; i<buckets.length; i++) {
        var bucket = buckets[i];
        if (bucket.backup == null)
          emptyBucketCount++;
      }
      logger.info(emptyBucketCount + ' missing backups out of ' + buckets.length + ' scheduled.');
      if (buckets[buckets.length-1].backup == null)
      {
        logger.debug('The last scheduled backup has yet to occur.');
      }

      // Call the callback if not null.
      try
      {
        if (callback !== null) { callback(); }
      }
      catch (err)
      {
        logger.error('Error: ' + err.message);
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
    if (backupQueues.inProgress.length < config.rsync.max_backups) {
      machineLogger.info('Starting backup process for ' + machine.name);

      // Push the machine onto the stack of inProgress backups.
      backupQueues.inProgress.push(machine);
      var backupDirectory = path.join(config.rsync.destination_dir, machine.name);

      // Get a list of schedule "buckets"
      var buckets = system.getBuckets(machine.schedule, new Date(Date.now()));

      // Fill buckets that were obtained above with directories from the backups.
      machineLogger.debug('Constructing a list of backups to retain...');
      try
      {
        system.fillBuckets(buckets, backupDirectory, machine, function() {
          if (buckets[buckets.length-1].backup == null)
          {
            machineLogger.debug('Running rsync...');
            machine.backupAttemptCount++;
            // Run rsync on the machine.
            try
            {
              rsync.runRsync(machine, function(error, code, rsyncInfo) {
                // Add the newly created date to fill the last bucket.
         
                if (code === 0)
                {
                  buckets[buckets.length-1].backup = rsyncInfo.startTime;
                  console.log(buckets[buckets.length-1].backup);
                  machineLogger.info('Rsync backup successful.');
         
                  // Remove the obsolete backup directories since rsync exited successfully.
                  machineLogger.debug('Removing backups that are not in the scheduled period...');
                  system.removeDirectories(buckets, backupDirectory);
                }
                else
                {
                  machineLogger.error('Rsync exited with exit error code ' + code);
                  machineLogger.error('stderr:\n' + rsyncInfo.stderr);
                  machineLogger.error('An email will be sent out with more information if it is set up properly.');
         
                  // If email notifications are turned on, set up send the email that there was an error.
                  if (config.notifications.receive_email_notifications)
                  {
                    emailDispatcher.backupErrorEmail(machine, rsyncInfo, code);
                  }
                }
         
                // Insert the backup event into database.
                insertBackupEvent(machine, rsyncInfo, code);
         
                // Remove machine from in progress backups list
                for (var i=0; i<backupQueues.inProgress.length; i++) {
                  if (backupQueues.inProgress[i] === machine)
                  {
                    backupQueues.inProgress.splice(i,1);
                    break;
                  }
                }
         
                var nextBackup = system.timeoutToNextBackup(machine, code);
                machine.backupTimeoutObject = setTimeout(function() { system.backupProcess(machine) }, nextBackup);
         
                // Start the next backup.
                if (backupQueues.remaining.length > 0)
                {
                  logger.debug('Starting machine from the waiting queue: ' + backupQueues.remaining[0].name);
                  logger.trace(backupQueues.remaining.length + ' scheduled backups remaining');
                  system.backupProcess(backupQueues.remaining.shift());
                }
              });
            }
            catch (err)
            {
              logger.error(err);
              if (config.notifications.receive_email_notifications)
              {
                emailDispatcher.systemEmail('Error during Rsync backup process', err.message);
              }
            }
          }
          // TODO: this does the same thing as above, somehow incorporate it up above or in a different method?
          else {
            // TODO: This shouldn't ever occur so should we double check and see if there are any events to cancel and reset the timeout.
            // Check queue just to make sure there aren't anymore machines to run backups for.
            for (var i=0; i<backupQueues.inProgress.length; i++) {
              if (backupQueues.inProgress[i] === machine)
              {
                backupQueues.inProgress.splice(i,1);
                break;
              }
            }
            if (backupQueues.remaining.length > 0)
            {
              logger.debug('Starting machine from the waiting queue: ' + backupQueues.remaining[0].name);
              logger.trace(backupQueues.remaining.length + ' scheduled backups remaining');
              system.backupProcess(backupQueues.remaining.shift());
            }
            var nextBackup = system.timeoutToNextBackup(machine, 0);
            machine.backupTimeoutObject = setTimeout(function() { system.backupProcess(machine) }, nextBackup);
          }
        });
      }
      catch(err)
      {
        logger.error(err);
        if (config.notifications.receive_email_notifications)
         {
          emailDispatcher.systemEmail('System Backup Process Error Occurred (Do not reply)', err.message);
        }
      }
    }
    else
    {
      logger.debug('Pushing machine ' + machine.name + ' into the waiting list.');
      logger.debug('At capacity of ' + config.rsync.max_backups);
      // Push onto the waiting queue to be called later.
      backupQueues.remaining.push(machine);
    }
  }
};

module.exports = system;
