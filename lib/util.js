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
   *    The number of bytes
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
  }
};

module.exports = util;
