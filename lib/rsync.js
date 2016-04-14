var rsyncWrapper = require('rsyncwrapper'),
    fs = require('fs'),
    ini = require('ini'),
    log4js = require('log4js'),
    path = require('path'),
    util = require('util');

var system = require('./system'),
    config = require('./config/config').environmentVar;

// Library for getting ready to call rsync
// @param machine 
//   machine that is to be backed up.
// @param destinationDir
//   directory that the backups go directly into.
module.exports = rsync  =  {

  /*
   * Method that does the underlying call to rsync.  Passes
   * along information from the backup process to the callback.
   * @param machine
   *   the machine object for the machine that is getting backed up.
   * @param callback
   *   the callback to be called when rsync is done running.
   */
  runRsync: function (machine, callback) {
    var logger = log4js.getLogger(machine.name);
    var backupDate = new Date(Date.now());
    var user = config.rsync.user;
    var machineIP = machine.ip;
    var inProgressDir = 'backup_in_progress';

    // TODO: Right now rsync only creates one directory for the destination, we should probably make a directory for the machine, possibly when they are getting configured.
    //     : user/stop process at startup if the directory doesn't exist

    // Copy the inclusion and exclusion patterns to a new array with the user and ip to access the machine.
    var machineInclusionPatterns = [];
    var machineExclusionPatterns = [];
    for (var i=0; i< machine.inclusionPatterns.length; i++) {
      var pattern = user + '@' + machineIP + ':' + machine.inclusionPatterns[i];
      machineInclusionPatterns.push(pattern);
    }

    logger.trace('Setting up the rsync options.');
    var rsyncOptions = {
      src: machine.inclusionPatterns,
      excludeFirst: machine.exclusionPatterns,
      dest: path.join(config.rsync.destination_dir, machine.name, inProgressDir),
      ssh: true,
      privateKey: config.rsync.ssh_key,
      recursive: true,
      dryRun: false,
      args: ['--stats', '-z']
    };

    // Find the last backup directory and hard link unchanged files from it to the next one.
    rsyncOptions.args.push(rsync.getlinkDestOption(path.normalize(path.join(rsyncOptions.dest, '..'))));

    // Run rsync with the above options.
    rsyncWrapper(rsyncOptions, function(error, stdout, stderr, cmd) {
      // Initialized to success.
      var err = false;
      var code = 0;

      // Parse the stats from rsync given in stdout
      logger.debug('Parsing stdout from rsync.');
      var stats = rsync.parseStdout(stdout);

      // Store the start time in this object
      stats.startTime = backupDate;

      // Find the total time it took to back up using rsync.
      stats.totalTransferTime = (new Date().getTime() - backupDate.getTime())/1000;
      logger.debug("Total time backing up: " + stats.totalTransferTime + 's');
      logger.trace('rsync stats from stdout: ' + JSON.stringify(stats));
      stats.stdout = stdout;
      stats.stderr = stderr;

      if (error) {
        err = true;
        logger.info('stdout: ' + stdout);
        logger.debug('Parsing error code.');
        code = rsync.parseErrorCode(error.message);
      }
      else {
        // Backed up successfully
        logger.info('Successfully backed up with no errors.');
        logger.info('stdout: ' + stdout);
        var newDirectory = path.join(path.resolve(rsyncOptions.dest, '..'), backupDate.toISOString());
        fs.rename(rsyncOptions.dest, newDirectory);
        logger.debug('Backed up into directory: ' + newDirectory);
      }

      // Callback if not null and pass it true or false if an error occurred, the rsync exit code, and rsync info.
      if (callback !== null)
        callback(err,code, stats);
    });
  },

  /**
   * Method to return the --link-dest= parameter for rsync.
   *   The directory that was the last to be backed up will be
   *   the one chosen to link the next backup to.
   *   This parameter hard links any unchanged files so the files don't
   *   take up any more disk space.
   */
   getlinkDestOption: function(machineBackupDir) {
     var linkDestOption = '';
     var dirs = fs.readdirSync(machineBackupDir);

     var lastChangedTime = 0;
     for (var i=0; i<dirs.length; i++) {
       var analyzingDir = path.join(machineBackupDir, dirs[i]);
       var backupStats = fs.statSync(analyzingDir);
       if (backupStats.ctime.getTime() > lastChangedTime) {
         lastChangedTime = backupStats.ctime.getTime();
         linkDestOption = '--link-dest=' + analyzingDir;
       }
     };
     console.log(linkDestOption);

     return linkDestOption
   },

  /**
   * Methods for parsing the stderr and stdout of rsync
   */

  /*
   * Method to parse the error code out of the returned error message.
   * @param errorMsg
   *   message that is returned from rsyncwrapper.
   * @return Integer
   *   value of the error code.
   */
  parseErrorCode: function(errorMsg) {
    return parseInt(errorMsg.split("rsync exited with code ")[1]);
  },

  /*
   * Method to parse the error code out of the returned error message.
   * @param stdout
   *   stdout received from the rsync call with the --stats flag set.
   * @return Object stats
   *    object containing all of the information we would want regarding the backup.
   */
  parseStdout: function (stdout) {
    var stats = {};
    var stdoutArr = stdout.split('\n');
    for (var i=0; i< stdoutArr.length; i++) {

      if (stdoutArr[i].lastIndexOf('Number of regular files transferred:',0) === 0) {
        stats.transferredFilesCount = parseInt(stdoutArr[i].split('Number of regular files transferred: ')[1].replace(/,/g,''));
      }
      else if (stdoutArr[i].lastIndexOf('Number of deleted files:',0) === 0) {
        stats.deletedFilesCount = parseInt(stdoutArr[i].split('Number of deleted files: ')[1].replace(/,/g,''));
      }
      else if (stdoutArr[i].lastIndexOf('Total file size:',0) === 0) {
        stats.totalFileSize = parseInt(stdoutArr[i].split('Total file size: ')[1].replace(/,/g,''));
      }
      else if (stdoutArr[i].lastIndexOf('Total transferred file size:',0) === 0) {
        stats.totalTransferredFileSize = parseInt(stdoutArr[i].split('Total transferred file size: ')[1].replace(/,/g,''));
      }
      else if (stdoutArr[i].lastIndexOf('Total bytes sent:',0) === 0) {
        stats.totalBytesSent = parseInt(stdoutArr[i].split('Total bytes sent: ')[1].replace(/,/g,''));
      }
      else if (stdoutArr[i].lastIndexOf('Total bytes received:',0) === 0) {
        stats.totalBytesReceived = parseInt(stdoutArr[i].split('Total bytes received: ')[1].replace(/,/g,''));
      }
    }
    return stats;
  }
}
