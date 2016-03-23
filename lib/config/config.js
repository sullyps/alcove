var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini'),
    log4js = require('log4js'),
    system = require('../system'),
    env = process.env.NODE_ENV || 'development',
    rootPath = path.normalize(__dirname + '/../..'),
    machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines'),
    logger = log4js.getLogger('config');

var environmentConfig = {
  development: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    ip: '0.0.0.0',
    port: 3000,
    ssl_port: 3443,
    key: rootPath + '/resources/ssl/ssl.key',
    cert: rootPath + '/resources/ssl/ssl.crt',
    db: 'sqlite://localhost/backup-development',
    storage: rootPath + '/data/backup-development',
    logs: rootPath + '/logs/'
  },

  test: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    ip: '0.0.0.0',
    port: 3000,
    ssl_port: 3443,
    key: rootPath + '/resources/ssl/ssl.key',
    cert: rootPath + '/resources/ssl/ssl.crt',
    db: 'sqlite://localhost/backup-test',
    storage: rootPath + '/data/backup-test',
    logs: rootPath + '/logs/'
  },

  production: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    ip: '0.0.0.0',
    port: 3000,
    ssl_port: 3443,
    key: rootPath + '/resources/ssl/ssl.key',
    cert: rootPath + '/resources/ssl/ssl.crt',
    auth: rootPath + '/resources/htpassword',
    db: 'sqlite://localhost/backup-production',
    storage: rootPath + '/data/backup-production',
    logs: rootPath + '/logs/'
  }
};

// Read in each of the machine config files as a machine.
module.exports = {
  configureMachines: function(app) {
    fs.readdir(machineConfPath, function(error, files) {
      if (error) {
        logger.error('Please make sure you have configured machines in ' + machineConfPath + '.');
        return;
      }
      for (var i=0; i<files.length; i++) {
        var file = files[i];
        if (file.match(/[.]*example[.]*/) || file.match(/[.]*\.swp/)) {
          continue;
        }
        logger.info('reading file: ' + path.join(machineConfPath, file));
        var machineConfig = ini.parse(fs.readFileSync(path.join(machineConfPath, file), 'utf-8'));
        
        var machine = {
          schedule: machineConfig.schedule,
          name: machineConfig.name,
          ip: machineConfig.ip,
          inclusionPatterns: machineConfig.inclusionPatterns,
          exclusionPatterns: machineConfig.exclusionPatterns
        };
        for (var j=0; j<app.locals.machines.length; j++) {
          if (machine.name === app.locals.machines[j].name) {
            logger.error('Please make sure each machine name is unique.');
            logger.error('  ' + file + ' and at least one other machine have the name ' + machine.name);
            throw 'MachineConfigException';
          }
        }
        // Append a logger for the machine.
        log4js.addAppender(log4js.appenders.file(environmentConfig[env]['logs'] + machine.name + '.log'), machine.name);
        logger.debug(environmentConfig[env].logs);

        // If it has a unique name add it to the list of machines.
        app.locals.machines.push(machine);
      }
      if (app.locals.machines.length < 1) {
        logger.error('Please make sure you have configured machines.');
        throw 'MachineConfigException';
      }
      // Set the timeouts on the machines for the first scheduled backup.
      system.init(app.locals.machines);
    });
  },
  // return the configuration for the environment that we 
  config: environmentConfig[env]
}

