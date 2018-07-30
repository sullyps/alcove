const child_process = require('child_process');

let util = {

  /**
   * Utility method that returns size of directory contents as a string.
   * @param directory
   *   The target to inspect for size.
   */
  findDirSize: directory => {
    // TODO: Find platform independent alternatives
    let stdoutBuff = child_process.execSync('du -sb ' + directory);
    let stdout = stdoutBuff.toString();
    return stdout.split(/\s+/)[0];
  },

  /**
   * Utility method that returns the size of the available disk space
   * as a string.
   * @param directory
   *   The target to inspect for free space.
   */
  findFreeSpace: directory => {
    // NOTE: -B1 checks true disk space whereas -b checks apparent size
    // TODO: Find platform independent alternatives
    let stdoutBuff = child_process.execSync('df -B1 ' + directory);
    let diskInfo = stdoutBuff.toString().split('\n');
    // Use the second line, 4th position
    let freeSpace = diskInfo[1].split(/\s+/)[3];
    return freeSpace;
  },

  /**
   * Utility method that returns the number of subdirectories in the
   * given directory as a number. (not recursive)
   * @param directory
   *   The target to inspect for subdirectories.
   */
  countSubdirectories: directory => {
    // TODO: Find platform independent alternatives
    let stdoutBuff = child_process.execSync('ls -l  ' + directory + ' | grep "^d" | wc -l');
    let stdout = stdoutBuff.toString();
    return Number(stdout);
  },

  /**
   *  Utility function that will take a Date object and returns a string
   *  formatted with the pattern YYYY-MM-DD
   *  with leading zeroes in front of single digits
   *  @param
   *    Date object
   */
  getFormattedDate: date => {
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
        // TODO - support X-Y  syntax as well?
        daysSet.days = schedSetArr[0].split(',').map( num => {
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
   * TODO: Write test for this function
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

    let diffString = '';
    if (dd != 0)
      diffString += dd + (dd > 1 ? ' days ' : ' day ');
    if (hh != 0)
      diffString += hh + (hh > 1 ? ' hours ' : ' hour ');
    if (mm != 0)
      diffString += mm + (mm > 1 ? ' minutes ' : ' minute ');
    if (ss != 0)
      diffString += ss + (ss > 1 ? ' seconds ' : ' second ');

    return (diffString ? diffString : 'Backup just occurred');
  }
};

module.exports = util;
