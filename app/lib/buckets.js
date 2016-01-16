var fs = require('fs');

// Every day for the last 7 days, every Monday for the past 5 Mondays, 
// Monday, Wednesday, Friday, for the past 3 times.

// Parses schedule and creates an easily transversible object.
var app = {
   dates_sort: function (date1, date2) {
    if (date1 > date2) return 1;
    if (date1 < date2) return -1;
    return 0;
  },

  parseSchedule: function (schedule) { 
    var scheduleObj = {};
    var partialSplit = schedule.split('_');
    // Remove the brackets from the time.
    scheduleObj.time = {};
    var time = partialSplit[1].replace(/[\[\]]/g,'').split(':');
    scheduleObj.time.hours = parseInt(time[0]);
    scheduleObj.time.minutes = parseInt(time[1]);
    console.log(scheduleObj.time);
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

  // Function to add buckets in order from smallest to largest.
  //  If it already exists it doesn't add it again.
  addBucketToList: function (bucket, buckets) {
    var added = false;
    for (var i=0; i< buckets.length; i++) {
      if (bucket.date.getTime() < buckets[i].date.getTime()) {
        buckets.splice(i, 0, bucket);
        added = true;
        break;
      }
      else if (bucket.date.getTime() == buckets[i].date.getTime()) {
        // If it already exists, don't add and move on.
        added = true; 
        break;
      }
    }
    if (!added) {
      buckets.push(bucket);
    }
  },
  
  // Returns an array of buckets which is an array of date objects
  //   that defines the day and time of a backup that needs to be stored.
  getBuckets: function (sched, date) {
    //date = new Date(2015, 6, 9, 2, 3, 0, 0);
    date = new Date();
    app.findNextScheduledTime(sched, date);
    schedObj = app.parseSchedule(sched);
    // Initialize our buckets array.
    buckets = [];
  
    // Boolean var determines whether or not the day of the given date should be included as a bucket.
    var includeDay = (date.getHours() > schedObj.time.hours || 
          date.getHours() == schedObj.time.hours && date.getMinutes() >= schedObj.time.minutes)
    var day = date.getDay();
    schedObj.daysSets.forEach(function(daysObj) {
      console.log('date: ' + date);
      console.log('  hour: ' + date.getHours());
      console.log('  minute: ' + date.getMinutes());
      console.log(includeDay);
      
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
        app.addBucketToList(bucket, buckets);
        startingDay = daysObj.days[index];
        if (index == 0) { startingDay = 7 + daysObj.days[index]; }
        index = (index - 1) % daysObj.days.length;
        // Javascript modulo of negative numbers doesn't work as expected
        // so once it gets negative we start over at the end of the list.
        if (index < 0) { index = daysObj.days.length - 1 }
        count--;
      }
  
    });
    buckets.forEach(function(bucket) {
      console.log(bucket);
    });
    return buckets;
  },
  
  
  findNextScheduledTime: function (schedule, date)  {
    var scheduleObject = app.parseSchedule(schedule);
    var includeDay = (date.getHours() > scheduleObject.time.hours || 
          date.getHours() == scheduleObject.time.hours && date.getMinutes() >= scheduleObject.time.minutes)
    var day = date.getDay();
    // Set to high number so it is easy to be less than the first time through.
    var numberOfDaysFromNow = 999999;
    scheduleObject.daysSets.forEach(function(daysObj) {
      var index = -1;
      for (var i=0; i<daysObj.days.length; i++) {
        if (day > daysObj.days[i]) {
          index = i;
          continue;
        }
        else if (day == daysObj.days[i] && !includeDay || day < daysObj.days[i]) {
          index = i;
          break;
        }
        else if (day == daysObj.days[i] && includeDay) {
          index = i + 1;
          break;
        }
      }
      if (index == daysObj.days.length) {
        index = 0;
      }
      console.log('INDEX: ' + index);
      var tempNumDays = 0;
      if (index > 0)  { tempNumDays = daysObj.days[index] - day; }
      else  { tempNumDays = 7 - day + daysObj.days[index]; }
      console.log(' TEMP DAYS: ' + tempNumDays) ;
      if (tempNumDays < numberOfDaysFromNow) {
        numberOfDaysFromNow = tempNumDays;
      }
    });
    var nextScheduledBackup = new Date(date.toString());
    nextScheduledBackup.setDate( date.getDate() + numberOfDaysFromNow );
    nextScheduledBackup.setHours(scheduleObject.time.hours);
    nextScheduledBackup.setMinutes(scheduleObject.time.minutes);
    console.log(' CURRENT DATE: ' + date);
    console.log(' NUMBER OF DAYS FROM NOW: ' + numberOfDaysFromNow);
    console.log( ' NEXT SCHEDULED BACKUP:  ' + nextScheduledBackup);
    return nextScheduledBackup;
  },
  
  fillBuckets: function (buckets, dateArr) {
    var dates = [];
    fs.readdir('../../resources/test_backups/', function(err, backupsData) {
      if (err) {
        console.log(err);
      }
      else {
        backupsData.forEach(function(datedDir) {
          dates.push(new Date(datedDir));
        });
      }
      dateArr = dates;
      // Make sure the dates array is sorted in chronological order.
      dateArr.sort(app.dates_sort);
      console.log('\nDirectory Dates: ');
      dateArr.forEach(function(date) {
        console.log('  ' + date);
      });
      
      removedDates = [];
      for (var i=dateArr.length-1; i>=0; i--) {
        for (var j=buckets.length-1; j>=0; j--) {
          if (dateArr[i] >= buckets[j].date && buckets[j].backup == null) {
            buckets[j].backup = dateArr[i];
            break;
          }
          else if (dateArr[i] >= buckets[j].date && dateArr[i] < buckets[j].backup) {
            removedDates.push(buckets[j].backup);
            buckets[j].backup = dateArr[i];
            break;
          }
          else removedDates.push(dateArr[i]);
        }
      }
      console.log('\nRemoved Dates: ');
      removedDates.forEach(function(date) {
        console.log('  ' + date);
      });
  
      console.log('\nBuckets: ');
      buckets.forEach(function(bucket) {
        console.log('  ' + bucket.backup);
      });
    });
  }
}
module.exports = app;
   
