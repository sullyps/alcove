
var path = require('path'),
    fs = require('fs'),
    rootPath = path.normalize(__dirname + '/../..'),
    machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines'),
    system = require('../system');
    env = process.env.NODE_ENV || 'development';

var environmentConfig = {
  development: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    db: 'sqlite://localhost/backup-development',
    storage: rootPath + '/data/backup-development'
  },

  test: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    db: 'sqlite://localhost/backup-test',
    storage: rootPath + '/data/backup-test'
  },

  production: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    auth: rootPath + '/resources/htpassword',
    db: 'sqlite://localhost/backup-production',
    storage: rootPath + '/data/backup-production'
  }
};

// Read in each of the machine config files as a machine.
module.exports = {
  configMachines: function(app) {
    fs.readdir(machineConfPath, function(error, files) {
      if (error || files.length < 1) {
        console.log('Please make sure you have configured machines in '+ machineConfPath +'.');
        return;
      }
      files.forEach(function(file) {
        // TODO: have a check to make sure the config parameters are all correct and each name is unique.
        var machine = require(path.join(machineConfPath, file));
        var currentTime = new Date(Date.now());
        var nextBackup = system.findNextScheduledTime(machine.schedule, currentTime);
        console.log('Setting timeout for ' + (nextBackup));
        // Start the systems process by setting the timeout until the machines scheduled backup time.
        setTimeout(function() { backupProcess(machine) }, nextBackup - currentTime.getTime());
        app.locals.machines.push(machine);
      });
    });
  },
  // return the configuration for the environment that we 
  config: environmentConfig[env]
}

