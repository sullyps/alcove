var express = require('express'),
  config = require('./config/config'),
  db = require('./app/models'),
  https = require('https'),
  app = express(),
  fs = require('fs'),
  bucketUtil = require('./app/lib/buckets'),
  ssl = {
    key: fs.readFileSync('./resources/ssl/ssl.key'),
    cert: fs.readFileSync('./resources/ssl/ssl.crt')
  },
  backupConfig = require('./config/backup'),
  rsync = require('./app/lib/rsync'),
  machines = [];
  

// Main operation call here and then set up listening port?
// So basically set timeouts first and then start the web app.
// TODO: Should I move this to another file?
// TODO: add loggers for each machine here too.
//
// Read in each of the machine config files as a machine.
fs.readdir('config/machines/', function(error, files) {
  files.forEach(function(file) {
    var machine = require('./config/machines/' + file);
    machines.push(machine);
  });
  // SetTimeout on each machine for backups and perform at the first scheduled time.
  machines.forEach(function(machine) {
    var currentTime = new Date(Date.now());
    var nextBackup = bucketUtil.findNextScheduledTime(machine.schedule, currentTime);
    console.log('Setting timeout for ' + (nextBackup));
    setTimeout(function() { mainLoop(machine) }, nextBackup.getTime() - currentTime.getTime());
  });
});

/**
 *  Main application loop.
 *  Gets called after a setTimeout of whenever the next scheduled backup is for the machine.
 *  Follows the steps:
 *    1. Gets a list of buckets (Times when the machine should be backed up)
 *    2. Fills buckets (checks all the times that the machine was actually backed up)
 *    3. Performs backup if necessary (It should be necessary).
 *    4. Set timeout to repeat the cycle.
 *  @params
 *    machine-machine that is scheduled to backup.
 * */
function mainLoop(machine) {
  var backupDirectory = backupConfig.destinationDir + machine.name;
  var buckets = bucketUtil.getBuckets(machine.schedule, new Date(Date.now()));

  // Asynchronous method call to fill buckets that were obtained from getBuckets
  // TODO: Call to rsync needs to be within this method or it won't know if it needs to back up or not.
  //   since that is the case, we need to pass in the machine variable as well.
  bucketUtil.fillBuckets(buckets, backupDirectory, machine, bucketUtil.removeDirectories, rsync.runRsync);
  var currentTime = new Date(Date.now());
  var nextBackup = bucketUtil.findNextScheduledTime(machine.schedule, currentTime);
  console.log('Setting timeout for ' + (nextBackup));
  setTimeout(function() { mainLoop(machine) }, nextBackup.getTime() - currentTime.getTime());
}


var app = express();

require('./config/express')(app, config);

console.log('Starting up on: ' + config.port);
console.log('  DB: ' + config.db);

db.sequelize
  .sync()
  .then(function () {
    https.createServer(ssl, app).listen(config.port);
    //app.listen(config.port);
  }).catch(function (e) {
    throw new Error(e);
  });


