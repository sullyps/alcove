var rsyncWrapper = require('rsyncwrapper');
var mainConfig = require('../etc/backup/backup.js');

module.exports =  function(machine) {
  console.log('Running rsync for machine ' + machine.name);

  var rsyncOptions = {
    src: machine.inclusionPatterns,
    excludeFirst: machine.exclusionPatterns,
    dest: mainConfig.destinationDir,
    ssh: false,
    recursive: false,
    dryRun: false
  };
  // Run rsync with the above options.
  rsyncWrapper(rsyncOptions, function(error, stdout, stderr, cmd) {
    if (error) {
      //TODO: email and/or text addresses that should be notified.
      console.error(machine.name + ':  ' + error.message);
    }
    else {
      console.log(machine.name + ':  Successfully backed up.\n  stdout:  ' + stdout);
    }
  });
}
