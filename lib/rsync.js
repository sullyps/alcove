var rsyncWrapper = require('rsyncwrapper'),
    fs = require('fs'),
    ini = require('ini'),
    log4js = require('log4js'),
    path = require('path');

var system = require('./system'),
    config = require('./config/config').environmentVar;

// TODO: add error and statistic parsing to add to the returned rsyncInfo object.

// Library for getting ready to call rsync
// @param machine 
//   machine that is to be backed up.
// @param destinationDir
//   directory that the backups go directly into.
module.exports = rsync  =  {

  runRsync: function (machine, callback) {
    var logger = log4js.getLogger(machine.name);
    logger.info('Running rsync for machine ' + machine.name);
    var date = new Date(Date.now());
    var backupInfo = {};
    backupInfo.date = date;

    // TODO: Right now rsync only creates one directory for the destination I think this is ok and just warn the
    //     : user/stop process at startup if the directory doesn't exist
    var rsyncOptions = {
      src: machine.inclusionPatterns,
      excludeFirst: machine.exclusionPatterns,
      dest: path.join(config.rsync.destination_dir, machine.name, date.toISOString()),
      ssh: true,
      recursive: true,
      dryRun: false,
      args: ['--stats', '-z']
    };
    // Run rsync with the above options.
    rsyncWrapper(rsyncOptions, function(error, stdout, stderr, cmd) {
      // Initialized to success.
      var err = false;
      var code = 0;
      var stats = {};
      parseInt
      if (error) {
        err = true;
        //TODO: email and/or text addresses that should be notified depending on error.  But perhaps system should take care of the emailing?
        logger.info('stdout: ' + stdout);

        code = rsync.parseErrorCode(error.message);
        logger.error('rsync exited with code ' + code);
        logger.error('stderr:\n' + stderr);
      }
      else {
        logger.info('Successfully backed up with no errors.');
        logger.info('stdout: ' + stdout);
        logger.debug('Backed up into directory: ' + destinationDir);
      }


      var destStats = fs.statSync(rsyncOptions.dest);
      if (destStats.isDirectory() || destStats.isFile())
        backupInfo.newDir = rsyncOptions.dest;

      if (callback !== null)
        callback(err,code, backupInfo);
    });
  },

  /* Method to parse the error code out of the returned error message.
   * @param errorMsg
   *   message that is returned from rsyncwrapper.
   * @return Integer
   *   value of the error code.
   */
  parseErrorCode: function(errorMsg) {
    return parseInt(errorMsg.split("rsync exited with code ")[1]);
  },

  parseStdout: function (stdout) {
    var stats = {};

  }
}

/*
Example output

[2016-04-05 12:32:54.595] [INFO] skylinux - stdout:
Number of files: 10 (reg: 8, dir: 2)
Number of created files: 10 (reg: 8, dir: 2)
Number of deleted files: 0
Number of regular files transferred: 8
Total file size: 52,826,117 bytes
Total transferred file size: 52,826,117 bytes
Literal data: 52,825,990 bytes
Matched data: 0 bytes
File list size: 0
File list generation time: 0.001 seconds
File list transfer time: 0.000 seconds
Total bytes sent: 12,806,629
Total bytes received: 180

sent 12,806,629 bytes  received 180 bytes  1,348,085.16 bytes/sec
total size is 52,826,117  speedup is 4.12

[2016-04-05 12:32:54.596] [ERROR] skylinux - rsync exited with code 23
[2016-04-05 12:32:54.596] [ERROR] skylinux - stderr:
rsync: opendir "/home/backup_test/.ssh" failed: Permission denied (13)
rsync: send_files failed to open "/home/backup_test/.Xauthority": Permission denied (13)
rsync: send_files failed to open "/home/backup_test/.bash_history": Permission denied (13)
rsync error: some files/attrs were not transferred (see previous errors) (code 23) at main.c(1178) [sender=3.1.2]

*/
