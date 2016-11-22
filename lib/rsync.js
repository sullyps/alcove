var rsyncWrapper = require('rsyncwrapper'),
    fs = require('fs-extra'),
    log4js = require('log4js'),
    path = require('path'),
    util = require('util');

// Library for getting ready to call rsync
// @param machine 
//   machine that is to be backed up.
// @param destinationDir
//   directory that the backups go directly into.
module.exports = rsync  =  {
  getInProgressName: function() {
    return 'backup_in_progress';
  },

  /*
   * Method that does the underlying call to rsync.  Passes
   * along information from the backup process to the callback.
   * 
   * @param config
   *   The system configuration read in at startup.
   * @param machine
   *   The machine object for the machine that is getting backed up.
   * @param callback
   *   The callback function(error, statisticsObj).
   */
  runRsync: function (config, machine, callback) {
    var logger = log4js.getLogger(machine.name);
    var backupDate = new Date(Date.now());
    var user = config.rsync.user;
    var machineIP = machine.ip;

    // Copy the inclusion and exclusion patterns to a new array with the user
    // and ip to access the machine.
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
      dest: path.join(config.data_dir, machine.name, rsync.getInProgressName()),
      ssh: true,
      recursive: true,
      dryRun: false,
      args: ['--stats', '-z']
    };
    
    // Use default key unless private key is specified here
    if (config.rsync.ssh_key) 
      rsyncOptions.privateKey = config.rsync.ssh_key;

    // Additional arguments from config (may deprecate in future)
    if (config.rsync.additional_args)
      rsyncOptions.args.push(config.rsync.additional_args);

    // Ensure dir
    // TODO: empty directory too (in case it was part of a previous partial backup)
    try
    {
      logger.trace('Ensuring directory: ' + rsyncOptions.dest);
      fs.ensureDirSync(rsyncOptions.dest);
    }
    catch (error)
    {
      return callback(error, {code: -1, error: error});
    }

    // Handle Hard links for incremental transfer
    try
    {
      var machineDir = path.normalize(path.join(rsyncOptions.dest, '..'));
      var linkDest = rsync.getLastBackupDir(machineDir);
      // NOTE: This doesn't account for the rare situation where the most
      // recent backup directory is actually scheduled to be deleted...
      // To fix that we would need the "bucket list" but it is such a rare
      // occurrence that, and wouldn't cause any data loss, that we aren't
      // going to handle that situation.
      if (linkDest) rsyncOptions.args.push('--link-dest=' + linkDest);
      logger.trace('Hard link dest: ' + linkDest);
    }
    catch (error)
    {
      logger.warn('Cannot find previous backup directory for hard links: ' + error.message);
      logger.debug(error.stack);
      logger.warn('Current backup will be FULL instead of INCREMENTAL...');
    }

    // Run rsync with the above options.
    rsyncWrapper(rsyncOptions, function(error, stdout, stderr, cmd) {
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

      // Handle completed rsync
      if (error) 
      {
        logger.debug('stdout: ' + stdout);
        logger.debug('Parsing error code.');
        stats.code = rsync.parseErrorCode(error.message);
        stats.error = error;
      }
      else 
      {
        // Backed up successfully
        stats.code = 0;
        logger.info('Successfully backed up with no errors.');
        logger.trace('stdout: ' + stdout);
        var newDirectory = path.join(path.resolve(rsyncOptions.dest, '..'), backupDate.toISOString());
        try
        {
          fs.renameSync(rsyncOptions.dest, newDirectory);
        }
        catch (renameErr)
        {
          logger.error('Could not rename working directory: ' + renameErr.message);
          logger.debug(renameErr.stack);
          logger.warn('Please correct this error before the next backup...');
        }
        logger.debug('Backed up into directory: ' + newDirectory);
      }

      // Callback if not null and pass it true or false if an error occurred,
      // the rsync exit code, and rsync info.
      if (callback !== null)
        callback(error, stats);
    });
  },

  /**
   * Method to return the directory name of the most recent successful
   * backup driectory, when pointed to a machine's backup data directory.
   * This technique assumes directories are named using ISOString format.
   *
   * TODO: Perhaps require a stricter naming format here than Date.parse()
   * @sync
   * @throws (fs-extra Errors)
   *   I/O errors
   */
   getLastBackupDir: function(machineBackupDir) {
     var linkDestOption = '';
     var dirs = fs.readdirSync(machineBackupDir);

     var last = {};
     dirs.forEach(function(dirname) {
       var date = new Date(dirname);
       if (!last.date) last = {date: date, dir: dirname};
       else if (last.date < date) last = {date: date, dir: dirname};
     });
     if (!last.date) return null;

     return path.join(machineBackupDir, last.dir);
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
    // TODO use regexp here
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
