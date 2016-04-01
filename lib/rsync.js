var rsyncWrapper = require('rsyncwrapper'),
    fs = require('fs'),
    ini = require('ini'),
    log4js = require('log4js'),
    path = require('path'),
    system = require('./system'),
    config = require('./config/config').environmentVar;

// Library for getting ready to call rsync
// @param machine 
//   machine that is to be backed up.
// @param destinationDir
//   directory that the backups go directly into.
// TODO: get rid of backup info in the method signature and create a getBackupInfo in the system.js module.exports.
module.exports = rsync  = function(machine, backupInfo, callback) {
  var logger = log4js.getLogger(machine.name);
  logger.info('Running rsync for machine ' + machine.name);
  var date = new Date(Date.now());

  // TODO: Right now rsync only creates one directory for the destination
  //     : if it doesn't exist.  More is probably needed for the first 
  //     : backup of a machine (machine.name + date).
  
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
    if (error) {
      //TODO: email and/or text addresses that should be notified depending on error.
      logger.info('stdout: ' + stdout);
      logger.error(error.message);
      logger.error('stderr:\n' + stderr);
    }
    else {
      logger.info('Successfully backed up with no errors.');
      logger.info('stdout: ' + stdout);
      logger.debug('Backed up into directory: ' + destinationDir);
    }
    if (backupInfo.backupQueue.length > 0) {
      rsync(backupInfo.backupQueue.shift(), backupInfo);
    }
    else {
      backupInfo.backupCount--;
    }

    callback();
  });
}
