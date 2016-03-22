var fs = require('fs-extra'),
    path = require('path'),
    ini = require('ini'),
    rmdir = require('rmdir'),
    rsync = require('./rsync'),
    backupConfig = ini.parse(fs.readFileSync('./etc/backup/backup.ini', 'utf-8'));

// Every day for the last 7 days, every Monday for the past 5 Mondays, 
// Monday, Wednesday, Friday, for the past 3 times.
function datesSort (date1, date2) {
  if (date1 > date2) return 1;
  if (date1 < date2) return -1;
  return 0;
}

module.exports = system = {
  // Function to start the backup process timeouts for each of the machines
  //   first scheduled backup time.
  init: function(machines) {
    console.log('machines size = ' + machines.length);
    for (var i=0; i<machines.length; i++) {
      var machine = machines[i];
      var currentTime = new Date(Date.now());
      var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
      console.log('Setting timeout for ' + (nextBackup));
      // Start the systems process by setting the timeout until the machines scheduled backup time.
      //machine.backupTimeoutId = setTimeout(function() { system.backupProcess(machine) }, nextBackup - currentTime.getTime());
      system.backupProcess(machine);
    }
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
    this.findNextScheduledTime(sched, date);
    schedObj = this.parseSchedule(sched);
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
    console.log('schedule = ' + schedule);
    var scheduleObject = this.parseSchedule(schedule);
    // boolean for including date given as a possible next scheduled backup day.
    var includeDay = (date.getHours() < scheduleObject.time.hours || 
          date.getHours() == scheduleObject.time.hours && date.getMinutes() < scheduleObject.time.minutes)
    var day = date.getDay();
    //
    // Set variable numberOfDaysFromNow to high number so it has
    // to be less than this many days the first time through.
    // 
    var numberOfDaysFromNow = 999999;
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
  // @param runRsync
  //   callback function that runs rsync for the given machine.
  fillBuckets: function (buckets, dir, machine, removeDirs, runRsync) {
    var dateArr = [];
    var backups = [];
    var date = new Date();
    var newBackupDir = path.normalize(path.join(dir, date.toISOString()));
    fs.readdir(dir, function(err, backupsData) {
      if (err != null) {
        fs.mkdirs(dir, function(mkdirErr) {
          if (mkdirErr != null) {
            // TODO: instead of throwing error, notify correct person.
            throw err;
          }
          else {
            // TODO: Run rsync
            runRsync(machine, newBackupDir);
          }
        });
      }
      else {
        backupsData.forEach(function(datedDir) {
          dateArr.push(new Date(datedDir));
          // Add to the array of directories that contain backups
          backups.push(datedDir);
        });
        // Make sure the dates array is sorted in chronological order.
        dateArr.sort(datesSort);
        console.log('\nDirectory Dates: ');
        dateArr.forEach(function(date) {
          console.log('  ' + date);
        });

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
        console.log('\nBackups: ');
        buckets.forEach(function(bucket) {
          console.log('  ' + bucket.backup);
        });

        // Call to delete directories that aren't contained in a bucket.
        console.log('new Backup dir ' + newBackupDir);
        
        // Run rsync if the last bucket is not full.
        if (buckets[buckets.length-1].backup == null) {
          runRsync(machine, newBackupDir);
        }

        removeDirs(backups, buckets, dir);
        // TODO: call to rsync if last bucket is not full.
      }
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
  removeDirectories: function (backups, buckets, backupsPath) {
    system.getRemovedDirectoriesList(backups, buckets, function(removedDirectories) {
      removedDirectories.forEach(function(unusedBackupDir) {
        fs.remove(path.join(backupsPath, unusedBackupDir), function(err, dirs, files) {
          if (err)  throw err;
          else (console.log('removing ' + path.join(backupsPath, unusedBackupDir)));
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
  getRemovedDirectoriesList: function(backups, buckets, callback) {
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
        removedDirectories.push(datedDir);
      }
    });
    callback(removedDirectories);
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
    var backupDirectory = path.join(backupConfig.destinationDir, machine.name);
    var buckets = this.getBuckets(machine.schedule, new Date(Date.now()));
    
    // Asynchronous method call to fill buckets that were obtained from getBuckets
    system.fillBuckets(buckets, backupDirectory, machine, this.removeDirectories, rsync);
    var currentTime = new Date(Date.now());
    var nextBackup = this.findNextScheduledTime(machine.schedule, currentTime);
    console.log('Setting timeout for ' + (nextBackup));
    machine.backupTimeoutId = setTimeout(function() { system.backupProcess(machine) }, nextBackup.getTime() - currentTime.getTime());
  }
}
