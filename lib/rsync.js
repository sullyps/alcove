var rsyncWrapper = require('rsyncwrapper'),
    fs = require('fs'),
    ini = require('ini'),
    backupConf = ini.parse(fs.readFileSync('./etc/backup/backup.ini', 'utf-8'));

// @param machine 
//   machine that is to be backed up.
// @param destinationDir
//   directory that the backups go directly into.
module.exports =  function(machine, destinationDir) {
  console.log('Running rsync for machine ' + machine.name);

  var rsyncOptions = {
    src: machine.inclusionPatterns,
    excludeFirst: machine.exclusionPatterns,
    dest: destinationDir,
    ssh: false,
    recursive: false,
    dryRun: false
  };
  // Run rsync with the above options.
  rsyncWrapper(rsyncOptions, function(error, stdout, stderr, cmd) {
    if (error) {
      //TODO: email and/or text addresses that should be notified.
      //Probably don't want to stop for just any error.
      console.error(machine.name + ':  ' + error.message);
    }
    else {
      console.log(machine.name + ':  Successfully backed up.\n  stdout:  ' + stdout);
    }
  });
}
