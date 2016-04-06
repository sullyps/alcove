var fs = require('fs-extra'),
    path = require('path'),
    ini = require('ini'),
    rmdir = require('rmdir'),
    log4js = require('log4js');

var rsync = require('./rsync'),
    db = require('../app/models'),
    config = require('./config/config').environmentVar;

var logger = log4js.getLogger(),
    backupQueues = { remaining: [], inProgress: [] },
    app;


// Methods to handle the process being killed and commit event to db
var SIGINT = 128+2;
var SIGTERM = 128+15;

/*
 * Adds the process kill event to the database
 * if it catches it as one of the main exit codes.
 */
function addProcessExitEvent(code) {
  var defLogger = log4js.getLogger();
  console.log('Got exit code: ' + code);
  var exitReason = 'Unknown';
  switch(code) {
    case SIGINT:
      exitReason = 'SIGINT';
      break;
    case SIGTERM:
      exitReason = 'SIGTERM';
      break;
  }
  // Push the start event to the database.
  // TODO: Check to see that the last event was a kill event, if not notify via email.
  defLogger
  db.ProcessEvent.create({
    'event' : 'exit',
    'exitCode' : code,
    'exitReason' : exitReason,
  }).then(function(processEvent) {
    defLogger.info('Process exiting with exit code ' + processEvent.exitCode);
    process.exit(code);
  }).catch(function (err) {
    defLogger.error(err);
    // kill anyways but don't write the exit event to the database.
    process.kill(code);
  });
}

process.on('SIGINT', function() {
  console.log('Got SIGINT');
  addProcessExitEvent(SIGINT);
  //process.exit(SIGINT);
});

process.on('SIGTERM', function() {
  console.log('Got SIGTERM');
  addProcessExitEvent(SIGTERM);
  //process.exit(SIGTERM);
});

function datesSort (date1, date2) {
  if (date1 > date2) return 1;
  if (date1 < date2) return -1;
  return 0;
};

module.exports = system = {

  /**
  *
  */
  init: function(application) {
    app = application;
    var machines = app.locals.machines;
    for (var i=0; i<machines.length; i++) {
      var machine = machines[i];
      var currentTime = new Date(Date.now());
      var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
      var machineLogger = log4js.getLogger(machine.name);
      machineLogger.info('Setting timeout for ' + nextBackup + ' for backing up ' + machine.name);
      // Start the systems process by setting the timeout until the machines scheduled backup time.

      //machine.backupTimeoutId = setTimeout(function() {
              system.backupProcess(machine); } ,
      //      nextBackup - currentTime.getTime());
      system.backupProcess(machine);
    }
    
    db.ProcessEvent.create({
      'event' : 'start'
    }).then(function(processEvent) {
      logger.info('Process start written to db at ' + processEvent.eventTime);
    }).catch(function (err) {
      logger.error('Error writing to db: ' + err);
    });
  },

  app: function() {
    return app;
  },

  // Parses schedule and creates an easily traversable object.
  // @param schedule (string)
  //   The schedule in the intial string format.
  // @return
  //   schedule object that making schedule data easier.
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

  //  Add buckets in chronological order to the bucket list. 
  //    If a date overlaps multiple schedules it only gets 
  //    added to the list one time.
  addBucketToList: function (bucket, bucketList) {
    var added = false;
    for (var i=0; i< bucketList.length; i++) {
      if (bucket.date.getTime() < bucketList[i].date.getTime()) {
        bucketList.splice(i, 0, bucket);
        added = true;
        break;
      }
      else if (bucket.date.getTime() == bucketList[i].date.getTime()) {
        // If it already exists, don't add and move on.
        added = true; 
        break;
      }
    }
    if (!added) {
      bucketList.push(bucket);
    }
  },
  
  // Returns an array of buckets which is an array of date objects
  //   that defines the day and time of a backup that needs to be stored.
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
        if (day > daysObj.days[i]) {
          continue;
        }
        else if (day == daysObj.days[i] && !includeDay || day < daysObj.days[i]) {
          index = i-1;
          break;
        }
        else if (day == daysObj.days[i] && includeDay) {
          index = i;
          break;
        }
      }
      if (index == -1) {
        index = daysObj.days.length - 1;
      }
  
      var startingDay = day;
      var difference = 0;
      var count = daysObj.number;
  
      // While daysObject.number > 0
      while (count > 0) {
  
        if (startingDay - daysObj.days[index] < 0) {
          difference = difference + startingDay + 7-daysObj.days[index];
        }
        else {
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
  
  // Returns the next scheduled backup time.
  // @param schedule (string)
  //   the raw unparsed schedule.
  // @param date
  //   the date that you wish to find the next scheduled time from.  Usually the current time.
  findNextScheduledTime: function (schedule, date)  {
    var scheduleObject = system.parseSchedule(schedule);
    // boolean for including date given as a possible next scheduled backup day.
    var includeDay = (date.getHours() < scheduleObject.time.hours || 
          date.getHours() == scheduleObject.time.hours && date.getMinutes() < scheduleObject.time.minutes)
    var day = date.getDay();
    //
    // Set variable numberOfDaysFromNow to high number so it has
    // to be less than this many days the first time through.
    // 
    var numberOfDaysFromNow = Number.POSITIVE_INFINITY;
    scheduleObject.daysSets.forEach(function(daysObj) {
      var index = -1;
      for (var i=0; i<daysObj.days.length; i++) {
        if (day == daysObj.days[i] && includeDay || day < daysObj.days[i]) {
          index = i;
          break;
        }
        else if (day == daysObj.days[i] && !includeDay) {
          index = i + 1;
          break;
        }
      }
      
      var tempNumDays = 0;
      if (index >= 0 && index < daysObj.days.length)  { tempNumDays = daysObj.days[index] - day; }
      else  { 
        index = 0;
        tempNumDays = 7 - day + daysObj.days[index];
      }
      if (tempNumDays < numberOfDaysFromNow) {
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
  
  // Fills the buckets obtained from the method getBuckets with the backup dirs.
  // @param buckets
  //   array of buckets obtained from getBuckets.
  // @param dir
  //   directory that holds the backup directories for a given machine.
  // @param machine
  //   the machine that we are checking the buckets and running the backup for.
  // @param removeDirs
  //   callBack function that does something with the deleted directories (deletes or prints out.)

  fillBuckets: function (buckets, dir, machine, callback) {
    var dateArr = [];
    var backups = [];
    var date = new Date();
    var newBackupDir = path.normalize(path.join(dir, date.toISOString()));
    var logger = log4js.getLogger(machine.name);

    var backupDirStats = fs.statSync(dir);
    if (!backupDirStats.isDirectory()) {
      // TODO: notify via email to the people that need to know. This probably means it was deleted.
      logger.error('Backup directory ' + dir + ' does not exist.  Please create the directory.');
      throw 'DirectoryDoesNotExistException'
    }
    fs.readdir(dir, function(err, backupsData) {
      if (err != null) {
        // TODO: notify via email the people that need to be notified.
        logger.error(err);
        throw err;
      }
      backupsData.forEach(function(datedDir) {
        dateArr.push(new Date(datedDir));
        // Add to the array of directories that contain backups
        backups.push(datedDir);
      });
      // Make sure the dates array is sorted in chronological order.
      dateArr.sort(datesSort);
      logger.debug(dateArr.length + ' past backups from scheduled times found');
      dateArr.forEach(function(date) {
        logger.trace('  ' + date);
      });

      logger.debug('Paring the directories with a scheduled backup time.');
      for (var i=dateArr.length-1; i>=0; i--) {
        for (var j=buckets.length-1; j>=0; j--) {
          // If the directory date is greater than the bucket date and bucket date
          //   doesn't already exist add the directory date to the bucket.
          if (dateArr[i] >= buckets[j].date && buckets[j].backup == null) {
            buckets[j].backup = dateArr[i];
            break;
          }
          else if (dateArr[i] >= buckets[j].date && dateArr[i] < buckets[j].backup) {
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
      if (buckets[buckets.length-1].backup == null) {
        logger.debug('The last scheduled backup has yet to occur.');
      }

      // Callback, should probably pass along buckets
      if (callback !== null) { callback(); }
    });
  },
 
  // Makes a call to getRemovedDirectoriesList and passes a callback
  // to list them out.
  // @param backups
  //   list of the backup directories from different dates.
  // @param buckets
  //   list of buckets obtained from the getBuckets and fillBuckets functions.
  listDirectoriesToRemove: function(backups, buckets) {
    system.getRemovedDirectoriesList(backups, buckets, function(removedDirectories) {
      console.log("\nRemove directories:");
      removedDirectories.forEach(function(unusedBackupDir) {
        console.log(unusedBackupDir);
      });
    });
  },

  // Makes a call to getRemovedDirectoriesList and passes a callback
  // to delete them from the filesystem.
  // @param backups
  //   list of the backup directories from different dates.
  // @param buckets
  //   list of buckets obtained from the getBuckets and fillBuckets functions.
  // @param backupsPath
  //   the path to the backupDirectories for a machine.
  removeDirectories: function (buckets, backupsPath) {
    system.getDirectoriesToRemove(backupsPath, buckets, function(removedDirectories) {
      removedDirectories.forEach(function(unusedBackupDir) {
        fs.remove(unusedBackupDir, function(err, dirs, files) {
          if (err)  throw err;
          else (logger.info('removing ' + path.join(backupsPath, unusedBackupDir)));
        });
      });
    });
  },

  // Call takes in callback and does something with
  // the list of directories that need to be removed.
  // @param backups
  //   list of the backup directories from different dates.
  // @param buckets
  //   buckets that are obtained with getBuckets and modified with fillBuckets functions.
  // @param callback
  //   function to do something with the directories to remove list.
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
          if (bucket.backup != null && bucket.backup.getTime() == directoryDate.getTime()) {
            remove = false;
          }
        });
        if (remove) {
          removedDirectories.push(path.join(backupsPath, datedDir));
        }
      });
      callback(removedDirectories);
    });
  },

  // Getter function for backupQueues.  Returns the object that holds the lists of both
  //   machines currently being backed up and the list of machines that are waiting to be
  //   backed up if the system is at the limit for concurrent backups defined in the config file.
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
   * */
  backupProcess: function(machine) {
    var machineLogger = log4js.getLogger(machine.name);
    if (backupQueues.inProgress.length < config.rsync.max_backups) {
      machineLogger.info('Starting backup process for ' + machine.name);

      // Push the machine onto the stack of inProgress backups.
      backupQueues.inProgress.push(machine);
      var backupDirectory = path.join(config.rsync.destination_dir, machine.name);

      // Get a list of schedule "buckets"
      machineLogger.debug('Acquiring the backup schedule storage objects.');
      var buckets = system.getBuckets(machine.schedule, new Date(Date.now()));

      // Fill buckets that were obtained above with directories from the backups.
      machineLogger.debug('Finding backups associated with the machine schedule.');
      system.fillBuckets(buckets, backupDirectory, machine, function() {
        if (buckets[buckets.length-1].backup == null) {
          machineLogger.debug('Running rsync');
          rsync.runRsync(machine, function(error, code, rsyncInfo) {
            // Add the newly created date to fill the last bucket.
            buckets[buckets.length-1].backup = rsyncInfo.date;
            // Only remove the directories if rsync
            if (code === 0) {
              machineLogger.info('Rsync backup successful.');
              machineLogger.debug('Removing backups that are not in the scheduled period.');
              system.removeDirectories(buckets, backupDirectory);
            }
            else {
              machineLogger.error('Rsync exited with exit code ' + code);
              machineLogger.error('An email will be sent out with more information if it is set up properly.');
              // TODO: Email here?
            }

            // Remove machine from in progress backups list
            for (var i=0; i<backupQueues.inProgress.length; i++) {
              if (backupQueues.inProgress[i] === machine) {
                backupQueues.inProgress.splice(i,1);
                break;
              }
            }
            // Start the next backup.
            if (backupQueues.remaining.length > 0) {
              logger.debug('Starting machine from the waiting queue: ' + backupQueues.remaining[0].name);
              logger.debug(backupQueues.remaining.length + ' scheduled backups remaining');
              system.backupProcess(backupQueues.remaining.shift());
            }
            // TODO: schedule next backup here, whether it's successful and on track or unsuccessful and in a few minutes.
          });
        }
        // TODO: I DO  NOT LIKE  THIS ELSE STATEMENT CALLING THE SAME THING AS ABOVE.
        else {
          // TODO: This shouldn't ever occur so should we double check and see if there are any events to cancel and reset the timeout.
          // Check queue just to make sure there aren't anymore to be ran.
          for (var i=0; i<backupQueues.inProgress.length; i++) {
            if (backupQueues.inProgress[i] === machine) {
              backupQueues.inProgress.splice(i,1);
              break;
            }
          }
          if (backupQueues.remaining.length > 0) {
            logger.debug('Starting machine from the waiting queue: ' + backupQueues.remaining[0].name);
            logger.debug(backupQueues.remaining.length + ' scheduled backups remaining');
            system.backupProcess(backupQueues.remaining.shift());
          }
        }
      });

      // TODO: move inside rsync callback.
      var currentTime = new Date(Date.now());
      var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
      logger.info('Setting timeout for ' + (nextBackup));
      machine.backupTimeoutId = setTimeout(function() { system.backupProcess(machine) }, nextBackup.getTime() - currentTime.getTime());
    }
    else {
      logger.debug('Pushing machine ' + machine.name + ' into the waiting list.');
      logger.debug('At capacity of ' + config.rsync.max_backups);
      // Push onto the waiting queue to be called later.
      backupQueues.remaining.push(machine);
    }
  }
}
