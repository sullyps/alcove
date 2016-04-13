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
    // TODO: Add capability  to do relative to rootPath from the config file?
    environment: {
      ip: (backupConfig.environment.ip !== undefined) ? backupConfig.environment.ip : '0.0.0.0',
      port: (backupConfig.environment.port !== undefined) ? backupConfig.environment.port : 3000,
      ssl_port: (backupConfig.environment.ssl_port !== undefined) ? backupConfig.environment.ssl_port : 3443,
      key: (backupConfig.environment.ssl_key !== undefined) ? backupConfig.environment.ssl_key : rootPath + '/etc/ssl/ssl.key',
      cert: (backupConfig.environment.ssl_cert !== undefined) ? backupConfig.environment.ssl_cert : rootPath + '/etc/ssl/ssl.crt',
      auth: (backupConfig.environment.auth !== undefined) ? backupConfig.environment.auth : rootPath + '/resources/.htpasswd',
      db_url: (backupConfig.environment.db !== undefined) ? backupConfig.environment.db_url : 'sqlite://localhost/backup-development',
      db_storage: (backupConfig.environment.db_storage !== undefined) ? backupConfig.environment.db_storage : rootPath + '/data/development',
      log_directory: (backupConfig.environment.log_directory !== undefined) ? backupConfig.environment.log_directory : rootPath + '/var/log/backup-system'
    },
    rsync: {
    // TODO: make sure destination dir exists at startup so that the user can fix right away.
      destination_dir: (backupConfig.rsync.destination_dir !== undefined) ? backupConfig.rsync.destination_dir : '/home/backup',
      additional_args: (backupConfig.rsync.additional_args !== undefined) ? backupConfig.rsync.additional_args : [],
      max_backups: (backupConfig.rsync.max_backups !== undefined) ? backupConfig.rsync.max_backups : 6,
      ssh_key: (backupConfig.rsync.ssh_key !== undefined) ? backupConfig.rsync.ssh_key : undefined,
      user: (backupConfig.rsync.user !== undefined) ? backupConfig.rsync.user : 'root',
      retry: {
        max_attempts: (backupConfig.rsync.retry.max_attempts !== undefined) ? backupConfig.rsync.retry.max_attempts : 4,
        multiplier: (backupConfig.rsync.retry.multiplier !== undefined) ? backupConfig.rsync.retry.multiplier : 3,
        time: (backupConfig.rsync.retry.time !== undefined) ? backupConfig.rsync.retry.time : 3
      }
    },
    notifications: {
      receive_email_notifications: (backupConfig.notifications.receive_email_notifications !== undefined) ? backupConfig.notifications.receive_email_notifications : true,
      from_email_addr: (backupConfig.notifications.from_email_addr !== undefined) ? backupConfig.notifications.from_email_addr : 'example@gmail.com',
      receiving_email_addr: (backupConfig.notifications.receiving_email_addr !== undefined) ? backupConfig.notifications.receiving_email_addr : [],
      receiving_sms_addr: (backupConfig.notifications.receiving_sms_addr !== undefined) ? backupConfig.notifications.receiving_sms_addr : [],
      summary_email_sched: (backupConfig.notifications.summary_email_sched !== undefined) ? backupConfig.notifications.summary_email_sched : '1;8:00',

      // SMTP: see options for nodemailer to set up transport https://github.com/nodemailer/nodemailer
      // TODO: Send a test email at the startup of the app so user can know if it is configured correctly.
      smtp: {
        host: (backupConfig.notifications.smtp.host !== undefined) ? backupConfig.notifications.smtp.host : 'smpt.gmail.com',
        port: (backupConfig.notifications.smtp.port !== undefined) ? backupConfig.notifications.smtp.port : 25,
        secure: (backupConfig.notifications.smtp.secure !== undefined) ? backupConfig.notifications.smtp.secure : false,
        auth_user: (backupConfig.notifications.smtp.auth_user !== undefined) ? backupConfig.notifications.smtp.auth_user : 'example@gmail.com',
        auth_pass: (backupConfig.notifications.smtp.auth_user !== undefined) ? backupConfig.notifications.smtp.auth_pass : 'password1234',
        pool: (backupConfig.notifications.smtp.pool !== undefined) ? backupConfig.notifications.smtp.pool : false,
      }
    }
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
    logDirectory: rootPath + 'var/log'
  },

  production: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    ip: (backupConfig.ip !== undefined) ? backupConfig.ip : '0.0.0.0',
    port: (backupConfig.port !== undefined) ? backupConfig.port : 3000,
    ssl_port: (backupConfig.ssl_port !== undefined) ? backupConfig.ssl_port : 3443,
    key: (backupConfig.ssl_key !== undefined) ? backupConfig.ssl_key : rootPath + '/resources/ssl/ssl.key',
    cert: (backupConfig.ssl_cert !== undefined) ? backupConfig.ssl_cert : rootPath + '/resources/ssl/ssl.crt',
    auth: (backupConfig.auth !== undefined) ? backupConfig.auth : rootPath + '/resources/htpassword',
    db: (backupConfig.db !== undefined) ? backupConfig.db : 'sqlite://localhost/backup-production',
    db_storage: (backupConfig.db_storage !== undefined) ? backupConfig.db_storage : rootPath + '/data/production',
    log_directory: (backupConfig.log_directory !== undefined) ? backupConfig.log_directory : rootPath + '/var/log/backup-system'
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
          exclusionPatterns: machineConfig.exclusionPatterns,
          backupAttemptCount: 0
        };
        for (var j=0; j<app.locals.machines.length; j++) {
          if (machine.name === app.locals.machines[j].name) {
            configLogger.error('Please make sure each machine name is unique.');
            configLogger.error('  ' + file + ' and at least one other machine have the name ' + machine.name);
            throw 'MachineConfigException';
          }
        }
        // Append a logger for the machine.
        var machineLogPath = environmentConfig[env].environment.log_directory + '/' + machine.name + '.log';
        log4js.addAppender(log4js.appenders.file(machineLogPath), machine.name);
        var logger = log4js.getLogger(machine.name);
        logger.setLevel(logConfig.logLevel);

        // If it has a unique name add it to the list of machines.
        app.locals.machines.push(machine);
      }
      if (app.locals.machines.length < 1) {
        console.error('Please make sure you have configured machines.');
        throw 'MachineConfigException';
      }
      // Set the timeouts on the machines for the first scheduled backup.
    });
  },
  // return the configuration for the environment that we 
  environmentVar: environmentConfig[env]
};

