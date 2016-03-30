var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini'),
    log4js = require('log4js'),
    logConfig = require('./log4js'),
    env = process.env.NODE_ENV || 'development',
    rootPath = path.normalize(__dirname + '/../..'),
    machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines'),
    backupConfig = ini.parse(fs.readFileSync('./etc/backup/backup.ini', 'utf-8'));

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
    storage: rootPath + '/data/development',
    logging: rootPath + '/logs'
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
    storage: rootPath + '/data/test',
    logging: rootPath + '/logs'
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
    storage: rootPath + '/data/production',
    logging: rootPath + '/logs'
  }
};

module.exports = {
  configureMachines: function(app) {
    var configLogger = log4js.getLogger('config');
    fs.readdir(machineConfPath, function(error, files) {
      if (error) {
        configLogger.error('Please make sure you have configured machines in ' + machineConfPath + '.');
        return;
      }
      for (var i=0; i<files.length; i++) {
        var file = files[i];
        if (file.match(/[.]*example[.]*/) || file.match(/[.]*\.swp/)) {
          continue;
        }
        configLogger.info('reading file: ' + path.join(machineConfPath, file));
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
            configLogger.error('Please make sure each machine name is unique.');
            configLogger.error('  ' + file + ' and at least one other machine have the name ' + machine.name);
            throw 'MachineConfigException';
          }
        }
        // Append a logger for the machine.
        var machineLogPath = environmentConfig[env].logging + '/' + machine.name + '.log';
        log4js.addAppender(log4js.appenders.file(machineLogPath), machine.name);
        var logger = log4js.getLogger(machine.name);
        logger.setLevel(logConfig.logLevel);

        // If it has a unique name add it to the list of machines.
        app.locals.machines.push(machine);
      }
      if (app.locals.machines.length < 1) {
        configLogger.error('Please make sure you have configured machines.');
        throw 'MachineConfigException';
      }
      // Set the timeouts on the machines for the first scheduled backup.
    });
  },
  // return the configuration for the environment that we 
  config: environmentConfig[env]
};

