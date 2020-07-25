'use strict';
const fs = require('fs-extra'),
      path = require('path'),
      ini = require('ini'),
      child_process = require('child_process'),
      logging = require('./config/log4js');
const rsync = require('./rsync'),
      notifications = require('./notifications'),
      nj = require('nunjucks'),
      util = require('./util');

const sequelize = require('sequelize');
const { importantLogs } = require('./util');
const Op = sequelize.Op;

const logger = logging.getLogger();
let backupQueues = { remaining: [], inProgress: [] };
let machines = {};
let summaryTimeoutId, config, db;

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
function insertBackupEvent(machine, bucket, rsyncStats) {
  if (!db) return logger.error('Cannot record backup event: The Events DB has not been initialized');

  let machineLogger = logging.getLogger(machine.name);
  return db.BackupEvent.create({
    'machine' : machine.name,
    'schedule' : machine.schedule,
    'bucket' : bucket,
    'rsyncExitCode' : rsyncStats.code,
    'rsyncExitReason' : rsyncStats.error,
    // TODO: Shouldn't we use -1 as an indicator that this is unknown (or allow NULL)? 
    //   I think the zeros are misleading and incorrect.
    'transferSize' : (rsyncStats.totalTransferredFileSize || 0),
    'transferTimeSec' : (rsyncStats.totalTransferTime || 0),
    'dir': rsyncStats.newDirectory
  })
  .then(backupInfo => {
     machineLogger.info('Backup event saved to EventsDB');
  })
  .catch(err => {
    machineLogger.error('Backup event insertion in EventsDB failed:', err.message);
    machineLogger.debug(err.stack);
  });
}

/**
 * Add a start event to the DB
 */
function addProcessStartEvent() {
  return db.ProcessEvent.create({
    event: 'start'
  })
  .then(processEvent => {
    logger.info('Backup System startup completed at ' + processEvent.eventTime);
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

  let exitReason = 'Unknown';
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
  function shutdown() {
    return db.ProcessEvent.create({
      'event' : 'exit',
      'exitCode' : code,
      'exitReason' : exitReason,
    })
    .then(processEvent => {
      logger.debug('Process exit event saved to events DB, exit code: ' + processEvent.exitCode);
      process.exit(processEvent.exitCode);
    })
    .catch(err => {
      logger.error('Could not save exit event to the database: ' + err);
      logger.warn('Next startup might erroneously send out dirty shutdown notifications...');
      // Exit anyway...
      process.exit(code);
    });
  }

  return shutdown();
}
process.on('SIGINT', () => { addProcessExitEvent(SIGINT); });
process.on('SIGTERM', () => { addProcessExitEvent(SIGTERM); });
process.on('SIGUSR2', () => { addProcessExitEvent(SIGUSR2); });
process.on('beforeExit', () => { addProcessExitEvent(0); });

/**
 * Private helper to create our machine Objects that store real-time backup 
 * information in memory for each configured backup from the config files.
 * Additionally, in order to support rsync include/exclude rules in a way that
 * simplifies config syntax, we transform the raw config options supplied into
 * the options that will be passed to rsync. The difference in these settings
 * can be observed by looking at the machines[key] VS config.machines[key] 
 * Objects for the changes.
 */
function prepareMachines(config)
{
  // Active all configured machines
  for (let key in config.machines)
  {
    /* jshint loopfunc: true */
    logger.debug('Preparing "' + key + '" for backup');

    let machineConfig = config.machines[key];
    let machineLogger = logging.getLogger(machineConfig.name);

    // Copy this machine config into our local memory storage and decorate
    // Retain this configuration in our 'config' without changes
    let machine = {
      schedule: machineConfig.schedule,
      buckets: getBuckets(machineConfig.schedule, new Date()),
      name: machineConfig.name,
      host: machineConfig.host,
      port: machineConfig.port,
      backupDirectories: [],
      ignoreExtensions: [],
      ignoreFiles: machineConfig.ignore_files || [],
      // Object: { when: Date, transferSizeKb: Number, transferTimeMs: Number }
      lastBackup: {},
      // Total size on disk of all backups (Can be missing if never measured)
      // NOTE: This is non-trivial to calculate because of the hard linking
      //   so we do it asynchronously after backups are completed. Each backup
      //   size is also calculated asynchronous (separately from totalSize).
      // Object: { when: Integer (Timestamp), size: Integer (bytes)}
      totalSize: {},
      // Array of Objects: [ { when: Date, reason: String }, { ... } ]
      failures: []
    };

    try
    {
      // Prepend wildcards to the file extension excludes
      if (machineConfig.ignore_extensions)
      {
        for (let setting of machineConfig.ignore_extensions)
        {
          machine.ignoreExtensions.push('*' + setting);
        }
      }

      // Append "/***" on all backup directories, and add parents that were not
      // specified, so that the include rules have something to match.
      for (let setting of machineConfig.backup_directories)
      {
        let fullpath = setting;
        
        // Remove the leading and any trailing path separators
        fullpath = fullpath.slice(1);
        if (fullpath.slice(-1) === path.sep)
          fullpath = fullpath.substr(0, fullpath.length - 1);

        // Split the path and accumulate all parents as needed
        let splits = fullpath.split(path.sep);
        for (let idx = 0; idx < splits.length; idx++)
        {
          let pathComponent = splits[idx];
          // Create the partial path (contains current + all preceeding elements)
          let partial = "";
          for (let i = 0; i <= idx; i++)
            partial += path.sep + splits[i];

          // Add to our list
          if (partial === (path.sep + fullpath))
          {
            // Always append "/***" to the full path to enable recursion
            machine.backupDirectories.push(path.join(partial, "***"));
          }
          else
          {
            // Add this partial path only if we don't already have it
            // TODO: This is redundant in the case where a previous include already will recurse through
            //   this partial path. We should be able to identify that situation by looking for previous
            //   includes that share a start with our partial and end in "/***"
            //   However, for now this won't hurt anything as rsync will process the redundant list in
            //   the same way. Fix this when we get a chance.
            if (!machine.backupDirectories.includes(partial) && !machine.backupDirectories.includes(path.join(partial, "***"))) 
              machine.backupDirectories.push(partial);
          }
        }
      }

      // Use fill buckets to restore the memory model
      let machineDir = path.join(config.data_dir, machine.name);
      system.fillBuckets(machine.buckets, machineDir, machine, (err, backupNeeded, toDelete) => {
        // And grab backup sizes from the DB, after we have all of our buckets defined
        let backupDirs = machine.buckets.filter(bucket => bucket.backup).map(bucket => bucket.backup.dir);
        logger.debug(backupDirs);
        db.Sizes.findAll({
          where: {
            machine : { [Op.eq] : key },
            location : { [Op.in] : backupDirs }
          }
        })
        .then(backupDirSizes => {
          for (let bucket of machine.buckets)
          {
            backupDirSizes.forEach(size => {
              if (bucket.backup && bucket.backup.dir === size.location)
                bucket.backup.size = size.size;
            });
          }
        });
      });

      // Read size from DB (if exists), or reset as undefined
      machine.totalSize = undefined;
      db.Sizes.findOne({
        where: {
          machine : { [Op.eq] : key },
          location : { [Op.eq] : "." }
        },
        order: [['createdAt', 'DESC']]
      })
      .then( sizeResult => {
        if (sizeResult)
          machine.totalSize = { when: new Date(sizeResult.createdAt).getTime(), size: sizeResult.size };
      });
      
      // Schedule the next backup for this machine
      let currentTime = new Date();
      logger.debug('Scheduling backup for "' + machine.name + '"');
      let nextBackup = getNextScheduledTime(machine.schedule, currentTime);
      let timeoutTime = nextBackup.getTime() - currentTime.getTime();
      importantLogs(`Scheduling backup at ${nextBackup} for ${machine.name}`, 'debug', logger, machineLogger);
      machine.timeoutId = setTimeout(function() {
        system.backupProcess(this);
      }.bind(machine), timeoutTime);

      // Successfully scheduled backup call, now retain this machine object in memory
      machines[key] = machine;
    }
    catch (error)
    {
      notifications.dispatch({
        subject : 'Cannot Schedule Backup',
        shortMessage : 'Could not schedule backup for "' + machine.name + '"',
        longMessage : '*** CRITICAL ***\r\nMachine: "' + machine.name + '" will not be' +
        ' scheduled for additional backups until the following error is' +
        ' resolved\r\n' + error.message });
      importantLogs(`Could not schedule backup for ${machine.name}: ${error.message}`, 'error', logger, machineLogger);
      machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
        'backups until this problem is resolved***');
      logger.debug(error.stack);
    }
  }
  logger.debug('All machines are prepared for backups');
}

/**
 * Recalculate the total size for all machines, in parallel. Called during
 * startup to ensure all total sizes are fresh.
 *
 * NOTE: we might need to explore chaining these calls so the don't hammer
 * the disk during startup.
 */
function calculateSizes()
{
  logger.info("Refreshing all total backup sizes...");

  Object.keys(machines).forEach(key => {
    let machine = machines[key];
    let machineDir = path.join(config.data_dir, machine.name);
    logger.debug("Checking size for '" + machine.name + "': " + machineDir);
    util.getDirSize(machineDir)
      .then(size => {
        return db.Sizes.create({
          'machine' : machine.name,
          'location' : '.',
          'size' : size
        });
      })
      .then(size  => {
         logger.info('"' + machine.name + '" is ' + size.size + ' bytes currently.');
      })
      .catch(function(err) {
        logger.error('Problem checking machine size: ', err);
      });
  });
}

/*
 * Add buckets in chronological order to the bucket list. If a date overlaps
 * multiple schedules it only gets added to the list one time.
 * TODO: Should we treat the bucketList as immutable??
 *
 * @param bucket
 *   Bucket object to add to the list.
 */
function addBucketToList(bucket, bucketList)
{
  let added = false;
  for (let i=0; i< bucketList.length; i++) {
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

  return bucketList;
}

/**
 * Returns an array of buckets which is an array of date objects that defines
 * the day and time of a backup that needs to be stored.
 * 
 * @param sched
 *   The machine defined schedule from when to backup and how long the 
 *   backups are stored.
 * @param date
 *   The date from which you are trying to find the stored backups.  Usually 
 *   this is the current date.
 */
function getBuckets(sched, date)
{
  let schedObj = util.parseSchedule(sched);
  // Initialize our buckets array.
  let buckets = [];

  // Boolean var determines whether or not the day of the given date should be included as a bucket.
  let includeDay = (date.getHours() > schedObj.time.hours || 
    date.getHours() == schedObj.time.hours && date.getMinutes() >= schedObj.time.minutes);
  let day = date.getDay();
  schedObj.daysSets.forEach( daysObj => {
    // Find index of days array to create first bucket.
    let index = -1;
    for (let i=0; i<daysObj.days.length; i++) {
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

    let startingDay = day;
    let difference = 0;
    let count = daysObj.number;

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
      let bucket = {};
      bucket.date = new Date(date.toString());
      bucket.date.setDate(date.getDate() - difference);
      bucket.date.setHours(schedObj.time.hours);
      bucket.date.setMinutes(schedObj.time.minutes);
      bucket.date.setSeconds(0);
      bucket.date.setMilliseconds(0);
      buckets = addBucketToList(bucket, buckets);
      startingDay = daysObj.days[index];
      if (index == 0) { startingDay = 7 + daysObj.days[index]; }
      index = (index - 1) % daysObj.days.length;
      //
      // Javascript modulo of negative numbers doesn't work as expected
      // so once it gets negative we start over at the end of the list.
      // 
      if (index < 0) { index = daysObj.days.length - 1; }
      count--;
    }
  });
  return buckets;
}

/**
 * Private helper to find the next scheduled time, given the schedule. 
 * 
 * @param String scheduleStr
 *   Schedule definition using the backup schedule syntax.
 * @param Date obj now
 *   The date from which the next scheduled time is calculated from.
 */
function getNextScheduledTime(scheduleStr, now)
{
  let schedule;

  // Parse the schedule first
  try
  {
    schedule = util.parseSchedule(scheduleStr);
  }
  catch (error)
  {
    // Shouldn't ever happen after a successful startup.
    logger.error('Could not parse schedule: ' + error.message);
    logger.debug(error.stack);
    return null;
  }

  let dates = [];
  schedule.daysSets.forEach( daySet => {
    daySet.days.forEach( dayOfWeek => {
      let date = new Date(now.getTime());
      date.setHours(schedule.time.hours, schedule.time.minutes, 0, 0);

      // Determine number of days in the future for this "set"
      let diff = dayOfWeek - now.getDay();
      if ((diff < 0) || (diff == 0 && date <= now))
        diff += 7;

      // Offset this date
      date.setDate(date.getDate() + diff);

      dates.push(date);
    });
  });
  // Sort by Date time, (not String conversion)
  dates.sort( (date1, date2) => {
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
 * @param newBuckets
 *   The new list of bucket objects, including the most recent backup.
 * @param rsyncStats
 *   The resulting data from the rsync attempt (or null).
 * @param toDelete
 *   An array of directories to remove (outdated backups). Only performed
 *   when a successful backup has occurred.
 */
function completeBackup(rsyncErr, machine, newBuckets, rsyncStats, toDelete)
{
  let slack;
  if (config.notifications.slack.webhook && config.notifications.slack.level === 'all')
  {
    slack = require('./notifications/slack')();
  }
  else
  {
    slack = {
      getName: () => 'slack - disabled',
      send: () => {},
      sendMessage: () => {}
    };
  }

  // Insert backup event (DB)
  insertBackupEvent(machine, newBuckets[newBuckets.length - 1].date.toString(), rsyncStats);

  let maxAttempts = config.rsync.retry.max_attempts;
  let timeout = 0;

  // Handle completion in 3 ways:
  //   1) Failure, give up (when max attempts are exceeded)
  //   2) Failure, retry
  //   3) Success
  // After appropriate logging, notification, etc: Then set the timeout and
  // startup any machines that were stuck in the queue with process.nextTick()
  let now = new Date();
  if (rsyncErr && machine.failures.length == maxAttempts)
  {
    // 
    // 1) Failure, give up and go to next regularly scheduled time
    //
    let nextScheduledTime = getNextScheduledTime(machine.schedule, now);
    timeout = nextScheduledTime.getTime() - now.getTime();
    let subject = 'Failed backup';
    let shortMessage = 'Backup for "' + machine.name + '" could not be' +
      ' completed';
    let longMessage = shortMessage + '\r\nRsync Error: ' + rsyncStats.error +
      '\r\nNo more attempts will be made to complete this backup';
    notifications.dispatch({
      subject : subject,
      shortMessage : shortMessage,
      longMessage : longMessage
    });
    machine.failures = [];
    logger.error('Maximum retry attempts reached for machine: "' + machine.name + '"');
    logger.warn('Next backup attempt will be at the normal scheduled time: ' + nextScheduledTime);
  }
  else if (rsyncErr)
  {
    // 
    // 2) Failure, retry according to our graduated back-off rate
    //
    let retry = config.rsync.retry.time * 60 * 1000;
    let multiplier = config.rsync.retry.multiplier;
    timeout = retry * Math.pow(multiplier, machine.failures.length - 1);
    logger.warn('Backup failed. Retry attempt scheduled for ' + util.getFormattedTimespan(timeout) + ' from now');
    slack.sendMessage(`Backup failed for machine "${machine.name}". Retry attempt scheduled for ` +
        `${util.getFormattedTimespan(timeout)} from now.`, true);
  }
  else
  {
    // 
    // 3) Success
    //
    // TODO: This should be part of the notifications system
    slack.sendMessage(`Backup succeeded for machine "${machine.name}".`, true);

    // Success
    let nextScheduledTime = getNextScheduledTime(machine.schedule, now);
    timeout = nextScheduledTime.getTime() - now.getTime();
    let backupDir = rsyncStats.newDirectory.split('/').slice(-1)[0];

    // Update the memory model
    newBuckets[newBuckets.length - 1].backup = {
      date: backupDir,
      dir: backupDir
    };

    // Delete all specified old copies
    toDelete.forEach( dir => {
      logger.debug('Removing old backup directory: "' + dir + '"');
      try
      {
        fs.removeSync(dir);
      }
      catch (rmError)
      {
        logger.error('File system error removing old backup copy: "' + dir + '": ' + rmError.message);
        logger.debug(rmError.stack);
        logger.warn('Please inspect the backup directory for "' + machine.name + '"');
      }
    });

    // Calculate new machine size
    let machineDir = path.join(config.data_dir, machine.name);
    logger.debug('Recording new total size for "' + machine.name + '"');
    util.getDirSize(machineDir)
      .then(size => {
        return db.Sizes.create({
          'machine' : machine.name,
          'location' : '.',
          'size' : size
        });
      })
      .then(size  => {
        machine.totalSize.when = size.createdAt;
        machine.totalSize.size = size.size;
        logger.info('"' + machine.name + '" is ' + size.size + ' bytes currently.');
      })
      .catch(function(err) {
        logger.error('Problem recording new machine size: ', err);
      });

    // Calculate new backup size
    logger.debug('Recording new size for "' + machine.name + ':' + backupDir + '"');
    util.getDirSize(path.join(config.data_dir, machine.name, backupDir))
      .then(size => {
        return db.Sizes.create({
          'machine' : machine.name,
          'location' : backupDir,
          'size' : size
        });
      })
      .then(size => {
        for (let bucket of newBuckets)
        {
          if (bucket.backup && bucket.backup.dir === size.location)
            bucket.backup.size = size.size;
        }
        logger.info('"' + machine.name + '/' + backupDir + '" is ' + size.size + ' bytes currently.');
      })
      .catch(function(err) {
        logger.error('Problem recording new machine backup directory size: ', err);
      });

    // Reset the attempt counter if it has hit the max attempts or was successful
    machine.failures = [];
    logger.info('Next backup is at the normal scheduled time: ' + nextScheduledTime);

    // 
    // Replace the buckets in memory with our new list
    //   Copy sizes from the old list
    for (let oldBucket of machine.buckets)
    {
      if (oldBucket.backup && oldBucket.backup.size)
      {
        for (let newBucket of newBuckets)
        {
          if (newBucket.backup && newBucket.backup.dir === oldBucket.backup.dir)
            newBucket.backup.size = oldBucket.backup.size;
        }
      }
    }
    machine.buckets = newBuckets;
  }

  // Set the next timeout for this machine
  if (timeout != null)
  {
    machine.timeoutId = setTimeout( function(){
      system.backupProcess(this);
    }.bind(machine), timeout);
    logger.debug('Timeout set for this machine');
  }
  else
    logger.warn('Please verify this is correct: "' + machine.name + '" does not have any more scheduled backups??');

  // Remove this machine from the queue
  for (let i = 0; i < backupQueues.inProgress.length; i++) 
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
    let nextMachine = backupQueues.remaining.shift();
    // Next tick
    // TODO: discuss importance of nextTick here?
    process.nextTick(function(){ system.backupProcess(this); }.bind(nextMachine));
  }
}

/**
 * Method to generate objects with summary information to dispatch
 * to a plain-text email, html formatted email, and sms (if configured).
 * Finds date of last scheduled summary and gets lists of all
 * backups that have occurred since then and other useful information.
 * Occurs based off the email summary schedule in config file.
 * 
 * @return 
 *   Async method that returns a Promise.
 */
function generateBackupSummary() {
  let message = {};
  
  // Initializers
  let summarySchedule = config.notifications.summary_schedule;
  let lastSummaryDate = util.getLastSummaryEmailTime(summarySchedule, new Date());
  let header = '';
  let details = '';
  let emailData, dataDirSize, freeSpace;

  // Synchronous Inspection for the concatenated email
  //   http://bluebirdjs.com/docs/api/synchronous-inspection.html
  message.subject = 'Alcove Backup Summary';

  // Calculate and cache a few values (the first call is potentially very slow)
  // NOTE: This is okay as it is only generated at the time of the time of the
  //   Summary email generation. Rather than using the memory models (like on
  //   the dashboard) this will guarantee and accurate number in the email.
  logger.debug('Starting generateBackupSummary()...');
  
  // Return the Promise chain
  return util.getDirSize(config.data_dir)
  .then(size => {
    logger.debug('Calculated "data_dir" size...');
    dataDirSize = util.getFormattedSize(size);
    return util.getFreeSpace(config.data_dir);
  }).then(size => {
    logger.debug('Calculate "free_space" size...');
    freeSpace = util.getFormattedSize(size);

    logger.info('Summary of backups since the last summary (' + lastSummaryDate + ')');
    logger.info('  Total Size of all Backups = ' + dataDirSize);
    logger.info('  Remaining space on disk = ' + freeSpace);

    return db.ProcessEvent.findOne({
      where: {
        event: 'start',
      },
      order: [['eventTime', 'DESC']],
    });
  }).then(recentStartEvent => {
    let recentStartTime = recentStartEvent.eventTime;
    header =
      'Alcove Backup Summary\r\n' +
      'Backups from: ' + util.getFormattedDate(lastSummaryDate).substring(0, 10) + ' to ' +
      util.getFormattedDate(new Date()).substring(0, 10) + '\r\n' +
      '=====\r\n' +
      'Total Disk Space Used: ' + dataDirSize + '\r\n' +
      'Disk Space Remaining: ' + freeSpace + '\r\n' +
      'Last Backup System Startup: ' + util.getFormattedDate(recentStartTime) + '\r\n';
    details =
      'Alcove Backup Summary: Backup Size: ' + dataDirSize + '\r\n' +
      'Free Space: ' + freeSpace + '\r\n';
    emailData = {
      fromDate: util.getFormattedDate(lastSummaryDate).substring(0, 10),
      toDate: util.getFormattedDate(new Date()).substring(0, 10),
      totalSize: dataDirSize,
      freeSpace: freeSpace,
      lastStartDate: util.getFormattedDate(recentStartTime).substring(0, 10),
      lastStartTime: util.getFormattedDate(recentStartTime).substring(11),
    };

    return db.ProcessEvent.count({
      where: {
        eventTime : {
          [Op.gt] : lastSummaryDate
        },
        event : 'start'
      }
    });
  }).then(startEventCount => {
    header += 'Backup System Startups: ' + startEventCount + '\r\n';
    details += 'Startups: ' + startEventCount + '\r\n';
    emailData.startEvents = startEventCount;

    return db.ProcessEvent.count({
      where: {
        eventTime : {
          [Op.gt] : lastSummaryDate
        },
        event : 'exit'
      }
    });
  }).then(stopEventCount => {
    header +=
      'Backup System Shutdowns: ' + stopEventCount + '\r\n' +
       '=====\r\n\r\n';
    details += 'Shutdowns: ' + stopEventCount;
    emailData.stopEvents = stopEventCount;

    logger.debug('Getting all backup events since ' + lastSummaryDate);
    return db.BackupEvent.findAll({
      where: {
        backupTime: {
          [Op.gt]: lastSummaryDate
        }
      }
    });
  }).then(backupEvents => {
    // Should be available because previous promise was fulfilled before this "then"
    // although ES6/ES8 offer better methods of this (yield or await)
    message.longMessage = header;
    message.shortMessage = details;
    emailData.machines = [];
    for (let machineName in machines)
    {
      let machine = machines[machineName];
      let numberBackups = machines[machineName].buckets.length;
      let diskSpace = (machines[machineName].totalSize) ? machines[machineName].totalSize.size : 'unknown';
      logger.trace('Working on machine: ', machine);
      message.longMessage += 'Summary for ' +  machine.name + ':\r\n';
      message.longMessage += 'Total Number of Backups: ' + numberBackups + '\r\n';
      message.longMessage += 'Total Disk Space Used: ' + diskSpace + '\r\n';
      message.longMessage += '-----\r\n';
      let events = [];
      for (let j=0; j<backupEvents.length; j++) {
        let data = backupEvents[j].dataValues;
        logger.debug('data: ', data);
        if (data.machine === machine.name) 
        {
          message.longMessage += '  ' + 
            util.getFormattedDate(data.backupTime) + ' ' +
            util.getFormattedSize(data.transferSize) +
            ' were backed up in ' + (data.transferTimeSec/60).toFixed(2) +
            ' min';
          let event = {
            date: util.getFormattedDate(data.backupTime).substring(0, 10),
            time: util.getFormattedDate(data.backupTime).substring(11),
            size: util.getFormattedSize(data.transferSize),
            minutes: (data.transferTimeSec/60).toFixed(2) + ' min',
            exitCode: data.rsyncExitCode
          };
          if (data.rsyncExitCode)
          {
            message.longMessage += ' with *failure*, err code: *' + data.rsyncExitCode + '*\r\n';
            message.longMessage += '    Reason: *' + data.rsyncExitReason + '*\r\n';
            event.errReason = data.rsyncExitReason;
          }
          else
          {
            message.longMessage += ' successfully\r\n';
          }
          events.push(event);
        }
      }
      if (backupEvents.length === 0) message.longMessage += 'No backups or attempts occurred since the last summary...\r\n';
      message.longMessage += '\r\n';
      emailData.machines.push({
        name: machineName,
        numberBackups: numberBackups,
        diskSpace: diskSpace,
        events: events
      });
    }
    message.htmlMessage = nj.configure('./lib/templates').render('summary.njk', emailData);

    logger.debug('Number of machines in Summary Notification: ' + Object.keys(machines).length);
    logger.info('Summary Notification generated.');

    // Fulfill the promise
    return message;
  });
}


/** 
 * Private helper method to send the Summary Notification and schedule the next
 * message to be sent via a timeout.
*/
function sendSummary()
{
  generateBackupSummary().then( message => {
    // Send the message that was generated
    notifications.dispatch(message);
  })
  .catch( err => {
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
  .finally( () => {
    let now = new Date();
    let nextScheduledTime = getNextScheduledTime(config.notifications.summary_schedule, now);
    logger.debug('Scheduling next Summary notification for: ' + nextScheduledTime);
    // nextScheduledTime will be null on errors
    if (nextScheduledTime)
    {
      // Remove the old timeout (in case it is still active)
      clearTimeout(summaryTimeoutId);

      // Arrange the new timeout
      summaryTimeoutId = setTimeout(sendSummary, nextScheduledTime.getTime() - now.getTime());
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
let system = {
  /**
  * Initialize the start of the backing up process.  Set timeouts for summary emails
  *     and backing up of individual machines.
  * @param cfg
  *     configurations for the backup
  * @param dbh
  *     mysqlite database
  */
  init: (cfg, dbh) => {
    // Save private reference to our db and config
    db = dbh;
    config = cfg;

    // Only initialize config and database when in test mode- don't prepare machines or notifications
    if (config.environment && config.environment.trim().toLowerCase() === 'test')
    {
      return;
    }

    // Create machine objects from configurations, and schedule their next backup
    prepareMachines(config);

    // Check for changes in runtime Log unexpected configurations (runtime failure in machine prep)
    if (Object.keys(machines).length === 0)
    {
      let shortMessage = 'WARNING: There are no machines configured to backup\r\n' +
          'The backup system will shutdown. Please check the logs on the server for details...';
      notifications.dispatch({
        subject : 'No Machines Configured',
        shortMessage : shortMessage,
        longMessage : shortMessage + '\r\n\r\nRefer to example .ini files to ' +
          'ensure your config files are properly setup.\r\n' + 
          'Sincerely,\r\n' +
          config.app.name + '(' + config.app.version + ')'
      });
      logger.error("No machines are configured... Shutting down!");
      process.exit(-5);
    }
    else if (Object.keys(machines).length !== Object.keys(config.machines).length)
    {
      logger.warn('Some configured machines did not schedule any backups. Review previous logs for more details...');
      logger.debug(Object.keys(machines), Object.keys(config.machines));
    }

    // Start calculating sizes in the background (in case anything has changed
    // while we were shut down).
    calculateSizes(machines);
    
    // Configure the notification dispatchers (email, sms, or log)
    notifications.init(config);

    // Set the timeout for the Backup Summary message
    // (Removing config.summary from the .ini disables this)
    let currentTime = new Date();
    if (config.notifications.summary_schedule)
    {
      let nextScheduledTime = getNextScheduledTime(config.notifications.summary_schedule, currentTime);
      logger.debug('Scheduling Summary notification for: ' + nextScheduledTime);

      if (nextScheduledTime)
      {
        // Schedule a timeout to generate and send this summary. It should also schedule
        // the next timeout upon completion. We store the timeoutId so that we can cancel
        // this summary as needed, or run it out of schedule.
        summaryTimeoutId = setTimeout(sendSummary, nextScheduledTime.getTime() - currentTime.getTime());
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

    // Log our public key at INFO level so that it can easily be copy-and-pasted
    // into auth files.
    let publicIdent = config.rsync.identity + '.pub';
    try
    {
      logger.info('The following public SSH key will be used for connections:');
      logger.info(publicIdent + '\n' + fs.readFileSync(publicIdent));
      logger.info('Remember to authorize this key on the target machine(s) to enable backups');
      if (config.rsync.user)
        logger.info('(Connections will be made with the "' + config.rsync.user + '" account)');
    }
    catch (err)
    {
      logger.error('Could not read SSH public identity from "' + publicIdent + '"?? ', err.message);
      logger.debug(err);
    }

    // Check to make sure the program didn't end last time with an unexpected shutdown.
    return db.ProcessEvent.findOne({
      order: [
        ['eventTime', 'DESC']
      ]
    })
    .then( processEvent => {
      // TODO: Also include failures for dirty shutdowns (exit code != 0, SIGINT, etc)
      if (processEvent && processEvent.event !== 'exit')
      {
        logger.debug('**Last shutdown does not appear clean**');

        // TODO - Improve this following our new conventions
        let subject = 'Backup System Unexpected Shutdown Occurred';
        let text = 'The backup system restarted after an unexpected shutdown. ';
        text += 'Some backups may be missing...';
        
        // Dispatch this notification
        notifications.dispatch({ subject: subject, shortMessage: text, longMessage: text });
        // TODO - have system run backupProcess to look for missing backups
      }

      // Now complete our successful startup with an event
      return addProcessStartEvent();
    })
    .catch(err => {
      logger.error('DB Error occurred processing startup / shutdown events: ' + err.message);
      logger.debug(err.stack);
    });
  },

  /**
   * Fills the buckets obtained from the method getBuckets with the backup dirs.
   * @param buckets
   *   array of buckets obtained from getBuckets.
   * @param dir
   *   Directory that holds the backup directories for a given machine.
   * @param machine
   *   The machine that we are checking the buckets and running the backup for.
   * @param callback(err, backupNeeded, toDelete)
   *   The callback function that proceeds with backup processing. It will be
   *   passed three parameters:
   *     err: An internal error that has occurred, or null.
   *     backupNeeded: True if a backup should be performed, false if no backup is needed.
   *     toDelete: Old backup dirs that can be deleted (after a successful backup).
   */
  fillBuckets: (buckets, backupDir, machine, callback) => {
    let dateArr = [];
    let backups = [];
    let date = new Date();
    let logger = logging.getLogger(machine.name);

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
    fs.readdir(backupDir, (err, dirListing) => {
      // Hand error handling up a level
      if (err != null) return callback(err, false, []);

      let backups = [];
      dirListing.forEach( dirname => {
        let newDate = new Date(dirname);
        if (!isNaN(newDate) && util.isValidDirname(dirname))
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
      backups.sort( (d1, d2) => {
        if (d1.date < d2.date) return -1;
        else if (d1.date > d2.date) return 1;
        else return 0;
      });

      // Debug output
      logger.debug(backups.length + ' past backups from scheduled times found');
      backups.forEach( backup => { logger.trace('  "' + backup.dir + '"'); });

      logger.debug('Pairing the directories with a scheduled backup time.');
      for (let i=backups.length-1; i>=0; i--) {
        for (let j=buckets.length-1; j>=0; j--) {
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
      buckets.forEach( bucket => {
        if (bucket.backup) logger.trace('  [' + bucket.date + ']: "' + bucket.backup.dir + '"'); 
        else logger.trace('  [' + bucket.date + ']: missing'); 
      });

      // Count empty buckets and report
      let emptyBucketCount = buckets
        .map( bucket => { return (!bucket.backup) ? 1 : 0; })
        .reduce( (prev, cur) => { return prev + cur; });
      logger.info(emptyBucketCount + ' missing backups out of ' + buckets.length + ' scheduled.');

      // Find unassigned directories
      let toDelete = [];
      backups.forEach( backupObj => {
        let used = buckets
          .map( bucket => { return (bucket.backup && backupObj.dir === bucket.backup.dir); })
          .reduce( (prev, cur) => { return (prev || cur); });
        if (!used) toDelete.push(path.join(backupDir, backupObj.dir));
      });
      logger.trace(toDelete);

      // If we have a callback:
      if (callback)
      {
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
  listDirectoriesToRemove: (backups, buckets) => {
    system.getRemovedDirectoriesList(backups, buckets, removedDirectories => {
      logger.debug("\nRemove directories:");
      removedDirectories.forEach( unusedBackupDir => {
        logger.debug(unusedBackupDir);
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
  removeDirectories: (buckets, backupsPath) => {
    system.getDirectoriesToRemove(backupsPath, buckets, removedDirectories => {
      removedDirectories.forEach( unusedBackupDir => {
        fs.remove(unusedBackupDir, (err, dirs, files) => {
          if (err) { logger.error('Unable to remove directory.  \nError: ' + err.message); }
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
  getDirectoriesToRemove: (backupsPath, buckets, callback) => {
    fs.readdir(backupsPath, (err, datedDirs) => {
      let backups = [];
      datedDirs.forEach( datedDir => {
        // Add to the array of directories that contain backups
        backups.push(datedDir);
      });
      let removedDirectories = [];
      backups.forEach( datedDir => {
        let directoryDate = new Date(datedDir);
        let remove = true;
        buckets.forEach( bucket => {
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
  getBackupQueues: () => {
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
  backupProcess: machine => {
    let slack;
    if (config.notifications.slack.webhook && config.notifications.slack.level === 'all')
    {
      slack = require('./notifications/slack')();
    }
    else
    {
      slack = {
        getName: () => 'slack - disabled',
        send: () => {},
        sendMessage: () => {}
      };
    }

    let machineLogger = logging.getLogger(machine.name);
    slack.sendMessage(`Attempting to back up machine "${machine.name}"...`, true);
    importantLogs('system.backupProcess() called for ${machine.name}', 'debug', logger, machineLogger);
    let machineDir = path.join(config.data_dir, machine.name);
    let newBuckets;

    // Create our list of required backup buckets, based on our schedule
    // NOTE: maybe we should go async here, for consistency?
    try
    {
      machineLogger.trace('Creating list of backup buckets');
      newBuckets = getBuckets(machine.schedule, new Date());
    }
    catch (bucketError)
    {
      machineLogger.error('Cannot get list of scheduled backup times: ' + bucketError.message);
      machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
          'backups until this problem is resolved***');
      machineLogger.debug(bucketError.stack);

      slack.sendMessage(`Cannot get list of schedule backup times: ${bucketError.message}\n` +
            `*CRITICAL: this machine will not be schedule for additional backups until this problem is resolved*`, true);
      return;
    }

    // Compare the list of buckets to the backup directories on the disk
    machineLogger.trace('Filling buckets from disk dir: "' + machineDir + '"');
    system.fillBuckets(newBuckets, machineDir, machine, (bucketErr, backupNeeded, toDelete) => {
      if (bucketErr)
      {
        machineLogger.error('Could not assign existing backup directories to previously ' + 
            'scheduled backup times: ' + bucketErr.message);
        machineLogger.debug('Backup directories read from: "' + machineDir + '"');
        machineLogger.error('*** CRITICAL: this machine will not be scheduled for additional ' + 
            'backups until this problem is resolved***');
        machineLogger.debug(bucketErr.stack);
        
        slack.sendMessage(`Could not assign existing backup directories to previously scheduled backup times: ` +
            `${bucketErr.message}\n` +
            `*CRITICAL: this machine will not be schedule for additional backups until this problem is resolved*`, true);
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
          importantLogs(`Starting backup for machine: ${machine.name}`, 'info', logger, machineLogger);
          machineLogger.info('Starting backup for machine: ' + machine.name);
          backupQueues.inProgress.push(machine);
          
          // Run rsync (all errors returned in the callback)
          rsync.runRsync(config, machine, (rsyncErr, rsyncStats) => {
            if (rsyncErr)
            {
              importantLogs(`Network error during ${machine.name} backup: ${rsyncErr.message}`, 'error', logger, machineLogger);
              machineLogger.debug(rsyncStats.error);
              machineLogger.debug(rsyncErr.stack);
              machine.failures.push({
                when: new Date(),
                reason: rsyncErr.message
              });
            }

            // Complete Backup attempt (failures and successes)
            return completeBackup(rsyncErr, machine, newBuckets, rsyncStats, toDelete);
          });
        }
        else
        {
          logger.debug('At capacity of ' + config.rsync.max_simultaneous);
          importantLogs(`Deferring backup for machine: ${machine.name}`, 'info', logger, machineLogger);
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
        completeBackup(null, machine, '', {
          code: 0,
          error: 'Backup attempt, when no backup was needed',
        }, toDelete);
      }
    });
  },

  /**
   * Gets all BackupEvents from the database since the given date
   * for the machine if specified or for all machines if not specified
   * @param since A date object after which BackupEvents will be searched for
   * @param machineName An optional machine name to specify which machine
   *   should be searched for backup events
   * @returns
   *   A promise for an array of BackupEvents
   */
  getBackupEvents: (since, machineName) => {
    if (machineName === undefined || machineName === null)
    {
      return db.BackupEvent.findAll({
        where: {
          backupTime: {
            [Op.gte]: since
          }
        },
        order: [['backupTime', 'DESC']]
      });
    }
    else
    {
      return db.BackupEvent.findAll({
        where: {
          machine: machineName,
          backupTime: {
            [Op.gte]: since
          }
        },
        order: [['backupTime', 'DESC']]
      });
    }
  },

  /**
   * Getter function for the machines object which maps machine names
   * to machine objects. We copy this structure and remove the timeout ID
   * so that external classes cannot reference our internal timeout.
   * @returns machines
   *   The machines object.
   */
  getMachines: () => {
    const stripped = JSON.parse(JSON.stringify(machines, (key, value) => {
      if (key === 'timeoutId') return undefined;
      else return value;
    }));

    return stripped;
  },

  /**
   * Getter function for the parsed config files.
   * @returns config
   *   The config object.
   */
  getConfig: () => {
    return config;
  },

  /**
   * Get the free space available for additional backups.
   * @return
   *   A Promise that will resolve to a String with units formatted to two
   *   decimal places, indicating free space of the file system on which the
   *   `data_dir` exists, or "unknown" if an error had occurred upstream.
   */
  getFreeSpaceDisplay: () => {
    // util.getFreeSpace returns a promise
    return util.getFreeSpace(config.data_dir)
      .then(result => {
        return util.getFormattedSize(result);
      });
  },

  /**
   * Get the information about system disk usage from the current records in
   * memory. No direct disk access is performed in this method so it isn't a
   * performance concern to call this multiple times.
   * @return
   *   A Promise that will resolve to an object with the following properties:
   *   + size : A String formatted with units to indicate the disk space used
   *            by all of the machine backups.
   *   + type : Either 'unknown', 'approximate', 'complete'.
   *            'unknown' occurs when no size measurements have been completed,
   *              or an error occurred upstream.
   *            'approximate' occurs when only a subset of size measurements
   *              have been completed.
   *            'complete' indicates all size measurements are completed, but
   *              the size indicated is only accurate as of the time specified.
   *   + time : The timestamp at which the last size measurement was completed.
   *            Since it is a long running task, we only measure disk size
   *            asyncronously while the system is idle. Therefore, the disk
   *            space measurement is only accurate as of the specified date.
   */
  getUsedSpaceDisplay: () => {
    // Perform this in a Promise for consistency, in general the results
    // should be immediately available however.
    return new Promise((resolve, reject) => {
      // Defaults
      let type = "unknown";
      let result = "unknown";
      let time = 0;

      // Read from the memory models
      let missing = 0;
      for (let machineName in machines)
      {
        if (!machines[machineName].totalSize) missing++;
        else
        {
          // Ensure we have an integer for the math
          if (result === "unknown") result = 0;

          // Always use the newest time
          time = Math.max(time, machines[machineName].totalSize.when);

          // Check for times prior to the last startup (also indicate approx)
          // TODO

          // Accumulate the size
          result += machines[machineName].totalSize.size;
        }
      }

      // Determine our type
      if (missing === Object.keys(machines).length) type = "unknown";
      else if (missing > 0) type = "approximate";
      else type = "complete";

      resolve({ "type": type, "size": util.getFormattedSize(result), "time": time});
    });
  },
  
  /**
   * Get the information about a single machine's disk usage from the current
   * records in memory. No disk access.
   * @return
   *   A Promise that resolves with the same object as @see getUsedSpaceDisplay()
   */
  getMachineUsedSpaceDisplay: machineName => {
    return new Promise((resolve, reject) => {
      // Only report a value if we can find a record
      if (machines[machineName].totalSize) 
      {
        resolve({ 
          "type": 'complete', 
          "size": util.getFormattedSize(machines[machineName].totalSize.size),
          "time": machines[machineName].totalSize.when
        });
        // TODO: Check for times prior to the last startup, indicate approx
      }
      
      resolve({"type": 'unknown', "size": 'unknown', "time": 0});
    });
  },

  /* test-code */
  // All of the lines inside of these comments will be stripped by the build task
  __getBuckets: getBuckets,
  __getNextScheduledTime: getNextScheduledTime,
  __insertBackupEvent: insertBackupEvent,
  __addProcessStartEvent: addProcessStartEvent,
  __addProcessExitEvent: addProcessExitEvent
  /* end-test-code */
};

module.exports = system;
