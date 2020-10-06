const child_process = require('child_process');
const logging = require('./config/log4js');
const fs = require('fs');

const logger = logging.getLogger();

// NOTE: Due to some performance factors outside of our control, we utilize the
//   GNU coreutils for a few of these disk operations (du / df). There is an
//   example replacement JS function for getDirSize, but the performance is
//   orders of magnitude slower than the external process calls.
//   JS Performance issues stem from comments in this discussion (bindings):
//   https://github.com/nodejs/node-v0.x-archive/issues/6662
// With the expected slow performance for these operations, make sure all of
// the calls in this module are returning Promises.

let util = {
  /**
   * Helper method to return whether backup dirname matches naming
   * convention.
   * @param
   *   Backup directory dirname
   * @returns
   *   Whether or not the dirname matches the naming convention
   */
  isValidDirname: dirname => {
    return dirname.match(/^(19|20)\d\d\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])T(0[0-9]|1[0-9]|2[0-3])\:([0-5]\d)\:([0-5]\d)\.\d\d\dZ$/);
  },

  /**
   * Utility method that returns size of directory contents as an integer, using
   * an external call to GNU coreutil's "du". This will ensure that hard linked
   * files are only counted once, and yields the fastest result for the call by
   * avoiding slowness with many JS -> C++ binding operations.
   *
   * NOTE: if there are errors during the external call, but a result can still
   *   be calculated, we log a warning and return the (potentially incorrect)
   *   result as determined.
   *
   * @param directory
   *   The target to inspect for size.
   * @return
   *   A Promise that will resolve with the size value as an integer (in 1-byte 
   *   blocks).
   */
  getDirSize: directory => {
    return new Promise((resolve, reject) => {
      logger.debug('getDirSize: "du -bs ' + directory + '"...');
      child_process.exec('du -bs ' + directory, {}, (error, stdout, stderr) => {
        let size = parseInt(stdout.toString().split(/\s+/)[0]);
        if (Number.isNaN(size)) size = 0;

        if (size && error)
        {
          logger.warn('Errors occurred getting size of "' + directory + '", size might be incorrectly reported...');
          logger.debug(error);
          resolve(size);
        }
        else if (!error)
        {
          resolve(size);
        }
        else
        {
          reject(error);
        }
      });
    });
  },

  /**
   * Utility method that returns the size of the available disk space, given a
   * specified directory, using an external call to GNU coreutil's "df".
   *
   * @param directory
   *   A specified target file / directory, we will use the file system on 
   *   which this file exists as the volume to calculate free space.
   * @return
   *   A Promise that will resolve with the free space value as an integer (in
   *   1 byte blocks).
   */
  getFreeSpace: directory => {
    return new Promise((resolve, reject) => {
      // -B1 for 1 byte blocks (no suffix)
      child_process.exec('df -B1 ' + directory, (error, stdout, stderr) => {
        let line = stdout.toString().split(/\n/)[1];
        let size = (line) ? parseInt(line.split(/\s+/)[3]) : NaN;
        if (Number.isNaN(size)) size = 0;

        if (size && error)
        {
          logger.warn('Errors occurred getting free space for parent file system of "' + directory + '", free space might be incorrectly reported...');
          logger.debug(error);
          resolve(size);
        }
        else if (!error)
        {
          resolve(size);
        }
        else
        {
          reject(error);
        }
      });
    });
  },

  /**
   *  Utility function that will take a Date object and returns a string
   *  formatted with the pattern YYYY-MM-DD
   *  with leading zeroes in front of single digits
   *  @param
   *    Date object
   */
  getFormattedDate: date => {
    if (!(date instanceof Date)) return "unknown";

    return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) +
        '-' + ('0' + date.getDate()).slice(-2) + ' ' +
        (date.getHours() <= 12 ? date.getHours() : date.getHours()-12) +
        ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes() +
        (date.getHours() < 12 ? 'am' : 'pm');
  },

  /**
   * Utility function that takes an integer number of bytes and
   * returns a string with bytes converted to a relevant data size.
   * (bytes, kilobytes, megabytes, gigabytes, terabytes, petabytes)
   * @param bytes
   *   The number of bytes
   */
  getFormattedSize: bytes => {
    if (!Number.isFinite(bytes)) return "unknown";

    // rate = bytes per kilobyte (1000 or 1024)
    const rate = 1024;
    const types = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let type = 0;
    while (Math.trunc(bytes / rate) >= 1 && type < types.length - 1)
    {
      bytes /= rate;
      type++;
    }
    return bytes.toFixed(2) + ' ' + types[type];
  },

  /**
   * Utility function that takes a decimal number of milliseconds
   * and returns a string formatted to represent the time in an
   * easily comprehensible manner.
   * @param milliseconds
   *   The number of milliseconds in the timespan
   * @returns
   *   A string which is a formatted version of milliseconds
   */
  getFormattedTimespan: milliseconds => {
    if (milliseconds === 0) return '0s';
    const timeUnits = [
      {
        ms: 86400000,
        unit: 'd'
      }, {
        ms: 3600000,
        unit: 'h'
      }, {
        ms: 60000,
        unit: 'm'
      }, {
        ms: 1000,
        unit: 's'
      }, {
        ms: 1,
        unit: 'ms'
      }, {
        ms: 0.001,
        unit: 'μs'
      }, {
        ms: 0.000001,
        unit: 'ns'
      }
    ];
    let formattedTimespan = '';
    let unitsUsed = 0;
    let timeUnit = 0;
    while (unitsUsed < 3 && timeUnit < timeUnits.length)
    {
      let timeAddition = Math.floor(milliseconds / timeUnits[timeUnit].ms);
      if (timeAddition !== 0)
      {
        formattedTimespan += timeAddition + timeUnits[timeUnit].unit + ' ';
        milliseconds -= timeAddition * timeUnits[timeUnit].ms;
        unitsUsed++;
      }
      timeUnit++;
    }
    return formattedTimespan.substring(0, formattedTimespan.length - 1);
  },

  /**
   * Utility method which converts an ISO date string to a
   * date object.
   * @param dateString
   *   An ISO date string representing the desired date object
   * @returns
   *   The date object that represents dateString
   */
  parseISODateString: dateString => {
    const dateParts = dateString.split(/\D+/g);
    return new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], dateParts[3], dateParts[4], dateParts[5], dateParts[6]));
  },

  /**
   * Adds a given number of days to the date specified and
   * lets JS handle timezone conversion, leap years, daylight
   * savings, changing months, changing years, etc.
   * @param date
   *   The date to add the days to
   * @param days
   *   The number of days to add (a negative number goes back in time)
   * @returns
   *   The resulting date
   */
  addDays: (date, days) =>
  {
    let result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  /**
   * Checks if two dates are the same i.e. they are in the same
   * year, in the same month, and on the same date
   * @param date1
   *   The first date object
   * @param date2
   *   The second date object
   * @returns
   *   Whether or not the two dates are the same
   */
  sameDay: (date1, date2) =>
  {
    date1 = new Date(date1);
    date2 = new Date(date2);
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
  },

  /**
   * Parses schedule and creates an easily traversable object.
   * Example:
   *   DAYS(N)|DAYS2(M)|...;[TIME]
   * Optional number of backups (N)
   *
   * @param schedule (string)
   *     The schedule in the initial string format.
   * @return
   *     schedule object from the parsed schedule.
   */
  parseSchedule: schedule => {
    let scheduleObj = {};

    // Be sure to throw all errors as Schedule syntax errors
    try
    {
      let partialSplit = schedule.split(';');

      // Parse "[TIME]" component
      scheduleObj.time = {};
      // Remove the brackets from the time.
      let time = partialSplit[1].replace(/[\[\]]/g,'').split(':');
      scheduleObj.time.hours = parseInt(time[0]);
      scheduleObj.time.minutes = parseInt(time[1]);
      scheduleObj.daysSets = [];

      // Parse the "DAYS(N)|..." component
      partialSplit[0].split('|').forEach( schedSet => {
        let daysSet = {};

        // The DAYS(N)|DAYS2(M)|...;TIME syntax should allow for missing (N)
        let schedSetArr = schedSet.split('(');
        daysSet.number = (schedSetArr[1]) ? parseInt(schedSetArr[1]) : 0;

        // Split comma separated days
        daysSet.days = [];
        schedSetArr[0].split(',').forEach(days => {
          if (days.length === 1)
          {
            daysSet.days.push(parseInt(days));
          }
          else if (days.length === 3 && days.charAt(1) === '-')
          {
            for (let day = parseInt(days.charAt(0)); day !== (parseInt(days.charAt(2)) + 1) % 7; day = (day + 1) % 7)
            {
              daysSet.days.push(day);
            }
          }
        });
        daysSet.days.sort((a, b) => a - b).forEach(day => {
          if (day < 0 || day >= 7)
          {
            throw new Error('Invalid dates specified');
          }
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
   * Finds the last scheduled email date from the schedule given in
   * the form of d,d,d,d;[hh:mm]
   * with d representing the days of the week 0 Sunday to 6 Saturday, hh:mm the time
   * @param schedule
   *   the string schedule, from config.notifications.summary_schedule
   * @param date
   *    date to find the previous summary email
   */
  getLastSummaryEmailTime: (schedule, date) => {
    let matches = schedule.match(/([\d,]+);\[(\d{1,2}):(\d\d)\]/);
    let scheduledDays, scheduledHour, scheduledMin;
    if (matches)
    {
      scheduledDays = matches[1].split(',');
      scheduledHour = matches[2];
      scheduledMin = matches[3];
    }
    else
    {
      throw new Error('Invalid Summary schedule: ' + schedule);
    }
    let day = date.getDay();

    let includeDay = ((date.getHours() > scheduledHour) ||
        (date.getHours() == scheduledHour && date.getMinutes() > scheduledMin));

    let numberOfDaysAgo;
    let found = false;
    let i = scheduledDays.length-1;
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
    let lastEmailTime = new Date(date.toString());
    lastEmailTime.setDate( date.getDate() - numberOfDaysAgo );
    lastEmailTime.setHours(scheduledHour);
    lastEmailTime.setMinutes(scheduledMin);
    lastEmailTime.setSeconds(0);
    lastEmailTime.setMilliseconds(0);
    return lastEmailTime;
  },

  /**
   *  Takes the easily parsable schedule format for the machine and
   *  turns it into words so that when it needs to be written out for
   *  a user it is more easily understood.
   *  @param scheduleObj (scheduleObject)
   *    The schedule as a scheduleObject from the util.parseSchedule method.
   *  @return
   *    Human readable schedule as a string
   */
  convertSchedObjToReadable: scheduleObj => {
    let daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let readableSched = "";
    for (let i=0; i<scheduleObj.daysSets.length; i++)
    {
      let daysSet = scheduleObj.daysSets[i];
      readableSched += "Last " + daysSet.number + " Days " + daysOfWeek[daysSet.days[0]];
      for (let j=1; j<daysSet.days.length; j++)
      {
        readableSched += ", " + daysOfWeek[daysSet.days[j]];
      }
      readableSched += "\n";
    }
    let period = (scheduleObj.time.hours < 12) ? "a.m." : "p.m.";
    let hour = (scheduleObj.time.hours > 12) ? scheduleObj.time.hours - 12 : scheduleObj.time.hours;
    readableSched += "  at " + hour + " " + period;
    return readableSched;
  },

  /*
   * Takes in two date objects, finds the difference between the dates,
   * and returns a string with the format 'W days X hours Y minutes Z seconds`
   * TODO: Write more tests for this function
   */
  getTimeSinceDate: (previousDate, date) => {
    let msecDiff = date.getTime() - previousDate.getTime();

    let dd = Math.floor(msecDiff / 1000 / 24 / 60 / 60);
    msecDiff -= dd*1000*24*60*60;
    let hh = Math.floor(msecDiff / 1000 / 60 / 60);
    msecDiff -= hh*1000*60*60;
    let mm = Math.floor(msecDiff / 1000 / 60);
    msecDiff -= mm*1000*60;
    let ss = Math.floor(msecDiff / 1000);

    let dateDiff = [];
    if (dd != 0)
      dateDiff.push(dd + (dd > 1 ? ' days' : ' day'));
    if (hh != 0)
      dateDiff.push(hh + (hh > 1 ? ' hours' : ' hour'));
    if (mm != 0)
      dateDiff.push(mm + (mm > 1 ? ' minutes' : ' minute'));
    if (ss != 0)
      dateDiff.push(ss + (ss > 1 ? ' seconds' : ' second'));

    if (dateDiff.length != 0)
      return dateDiff.join(', ');

    // Completely rare event that milliseconds are exactly the same
    return "Backup just occurred";
  },


  /**
  Method to log to both main log and machine specific log if important 
  * @param message
  *   message that is to be logged to both logs
  * @param severity
  *   specifies which level of log the statement should be
  * @param loggers
  *   array of loggers that should output the intended message
  */
 importantLogs: (message, severity, ...loggers) => {
  if (severity === 'trace') 
  {
    for (const log in loggers) 
    {
      loggers[log].trace(message);
    }
  } 
  else if (severity === 'debug') 
  {
    for (const log in loggers) 
    {
      loggers[log].debug(message);
    }
  } 
  else if (severity === 'info') 
  {
    for (const log in loggers) 
    {
      loggers[log].info(message);
    }
  } 
  else if (severity === 'warn') 
  {
    for (const log in loggers) 
    {
      loggers[log].warn(message);
    }
  } 
  else if (severity == 'error') 
  {
    for (const log in loggers) 
    {
      loggers[log].error(message);
    }
  } 
  else 
  {

  }
}
};

module.exports = util;
