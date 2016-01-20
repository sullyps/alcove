var fs = require('fs'),
    rmdir = require('rmdir');

// Every day for the last 7 days, every Monday for the past 5 Mondays, 
// Monday, Wednesday, Friday, for the past 3 times.

var app = {
   dates_sort: function (date1, date2) {
    if (date1 > date2) return 1;
    if (date1 < date2) return -1;
    return 0;
  },

  // Parses schedule and creates an easily traversable object.
  // @param schedule (string)
  //   The schedule in the intial string format.
  // @return
  //   schedule object that making schedule data easier.
  parseSchedule: function (schedule) { 
    var scheduleObj = {};
    var partialSplit = schedule.split('_');
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
    app.findNextScheduledTime(sched, date);
    schedObj = app.parseSchedule(sched);
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
        app.addBucketToList(bucket, buckets);
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
    var scheduleObject = app.parseSchedule(schedule);
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
      if (index == daysObj.days.length || index < 0) {
        index = 0;
      }
      var tempNumDays = 0;
      if (index > 0)  { tempNumDays = daysObj.days[index] - day; }
      else  { 
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
  // @param callback
  //   callback function that does what you want to the directories to remove.
  fillBuckets: function (buckets, dir, callback) {
    var dateArr = [];
    fs.readdir(dir, function(err, backupsData) {
      if (err != null) {
        throw err;
      }
      else {
        backupsData.forEach(function(datedDir) {
          dateArr.push(new Date(datedDir));
        });
      }

      // Make sure the dates array is sorted in chronological order.
      dateArr.sort(app.dates_sort);
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

      callback(dir, buckets);
    });    
  },
 
  // Makes a call to getRemovedDirectoriesList and passes a callback
  // to list them out.
  listDirectoriesToRemove: function(dir, buckets) {
    app.getRemovedDirectoriesList(dir, buckets, function(removedDirectories) {
      console.log("\nRemove directories:");
      removedDirectories.forEach(function(unusedBackupDir) {
        console.log(unusedBackupDir);
      });
    });
  },

  // Makes a call to getRemovedDirectoriesList and passes a callback
  // to delete them from the filesystem.
  removeDirectories: function (dir, buckets) {
    app.getRemovedDirectoriesList(dir, buckets, function(removedDirectories) {
      removedDirectories.forEach(function(unusedBackupDir) {
        console.log('Removing ' + unusedBackupDir);
        rmdir(dir + unusedBackupDir, function(err, dirs, files) {
          if (err)  throw err;
        });
      });
    });
  },

  // Asynchronous call takes in callback and does something with
  // the list of directories that need to be removed.
  getRemovedDirectoriesList: function(dir, buckets, callback) {
    var removedDirectories = [];
    fs.readdir(dir, function(err, backupsData) {
      if (err) { 
        throw err;
      }
      else {
        backupsData.forEach(function(datedDir) {
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
      }
      callback(removedDirectories);
    });
  }
}
module.exports = app;  
