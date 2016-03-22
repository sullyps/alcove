var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini'),
    rootPath = path.normalize(__dirname + '/../..'),
    machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines'),
    system = require('../system'),
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
  configureMachines: function(app) {
    fs.readdir(machineConfPath, function(error, files) {
      if (error) {
        console.log('Please make sure you have configured machines in '+ machineConfPath +'.');
        return;
      }
      for (var i=0; i<files.length; i++) {
        var file = files[i];
        if (file.match(/[.]*example[.]*/) || file.match(/[.]*\.swp/)) {
          continue;
        }
        console.log('reading file: ' + path.join(machineConfPath, file));
        var config = ini.parse(fs.readFileSync(path.join(machineConfPath, file), 'utf-8'));
        var machine = {};
        machine.schedule = config.schedule;
        machine.name = config.name;
        machine.ip = config.ip;
        machine.inclusionPatterns = config.inclusionPatterns;
        machine.exclusionPatterns = config.exclusionPatterns;
        console.log('machine = ');
        console.log(machine);
        for (var j=0; j<app.locals.machines.length; j++) {
          if (machine.name === app.locals.machines[j].name) {
            console.error('Please make sure each machine name is unique.');
            console.error('  ' + file + ' and at least one other machine have the name ' + machine.name);
            throw 'MachineConfigException';
          }
        }
        // If it has a unique name add it to the list of machines.
        app.locals.machines.push(machine);
      }
      if (app.locals.machines.length < 1) {
        console.error('Please make sure you have configured machines.');
        throw 'MachineConfigException';
      }
      // Set the timeouts on the machines for the first scheduled backup.
      system.init(app.locals.machines);
    });
  },
  // return the configuration for the environment that we 
  config: environmentConfig[env]
}

