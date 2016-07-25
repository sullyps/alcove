var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini'),
    log4js = require('log4js');
var logConfig = require('./log4js');
var env = process.env.NODE_ENV || 'development';
var rootPath = path.normalize(__dirname + '/../..');
var machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines');

// Default environment configuration values.
var environmentConfig = {
  development: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    environment: {
      ip: '0.0.0.0',
      port: 3000,
      run_securely: false,
      ssl_port: 3443,
      key: rootPath + '/etc/ssl/ssl.key',
      cert: rootPath + '/etc/ssl/ssl.crt',
      auth: rootPath + '/resources/.htpasswd',
      db_url: 'sqlite://localhost/backup-development',
      db_storage: rootPath + '/data/development',
      log_directory: rootPath + '/var/log/backup-system'
    },
    rsync: {
      destination_dir: '/home/backup',
      additional_args: [],
      max_backups: 6,
      ssh_key: undefined,
      user: 'root',
      retry: {
        max_attempts: 4,
        multiplier: 3,
        time: 3
      }
    },
    notifications: {
      receive_email_notifications: true,
      from_email_addr: 'example@gmail.com',
      receiving_email_addr: [],
      receiving_sms_addr: [],
      summary_email_sched: '1;8:00',

      // SMTP: see options for nodemailer to set up transport https://github.com/nodemailer/nodemailer
      smtp: {
        host: 'smpt.gmail.com',
        port: 25,
        secure: false,
        auth_user: 'example@gmail.com',
        auth_pass: 'password1234',
        pool: false,
      }
    }
  },

  test: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    environment: {
      ip: '0.0.0.0',
      port: 3000,
      run_securely: false,
      ssl_port: 3443,
      key: rootPath + '/etc/ssl/ssl.key',
      cert: rootPath + '/etc/ssl/ssl.crt',
      auth: rootPath + '/resources/.htpasswd',
      db_url: 'sqlite://localhost/backup-development',
      db_storage: rootPath + '/data/development',
      log_directory: rootPath + '/var/log/backup-system'
    },
    rsync: {
      destination_dir: '/home/backup',
      additional_args: [],
      max_backups: 6,
      ssh_key: undefined,
      user: 'root',
      retry: {
        max_attempts: 4,
        multiplier: 3,
        time: 3
      }
    },
    notifications: {
      receive_email_notifications:  false,
      from_email_addr: 'example@gmail.com',
      receiving_email_addr: [],
      receiving_sms_addr: [],
      summary_email_sched: '1;8:00',

      // SMTP: see options for nodemailer to set up transport https://github.com/nodemailer/nodemailer
      smtp: {
        host: 'smpt.gmail.com',
        port: 25,
        secure: false,
        auth_user: 'example@gmail.com',
        auth_pass: 'password1234',
        pool: false,
      }
    }
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
    db_storage: rootPath + '/data/production',
    log_directory: rootPath + '/var/log/backup-system'
  }
};

// Function to take user given parameters and change the configuration
//   based on the values the user enters in the backup.ini file.
function updateConfigParams(backupConfig, defaultConfig)
{
  var backupConfigKeys = Object.keys(backupConfig);
  for (var i=0; i<backupConfigKeys.length; i++)
  {
    var key = backupConfigKeys[i];
    if (typeof backupConfig[key] === 'object' && (!Array.isArray(backupConfig[key])))
    {
      updateConfigParams(backupConfig[key], defaultConfig[key])
    }
    else
    {
      // Change the config properties of the default to the user defined value
      defaultConfig[key] = backupConfig[key];
    }
  }
}

// Read the users configuration and call the method
//   to update the default config parameters to the
//   user given values.
try
{
  backupConfig = ini.parse(fs.readFileSync('./etc/backup/backup.ini', 'utf-8'));
  updateConfigParams(backupConfig, environmentConfig[env]);
}
catch(error) 
{
  console.log('Config file \'backup.ini\' in ' + rootPath + '/etc/backup/ not found.' +
  '\n    Using default values instead.  If you would like to see other parameters used, create the file ' +
   ' backup.ini and change the parameters to appropriate values and restart the application.\n' + error.message);
}

// Exports from the file include the machine configuring method and the combined configuration
//   from the defaults and the user defined parameters.
module.exports = {
  configureMachines: function(app) {
    var configLogger = log4js.getLogger('config');
    fs.readdir(machineConfPath, function(error, files) {
      if (error)
      {
        configLogger.error('Please make sure you create machine config files that follow the machine.example.ini file ' +
        ' in ' + machineConfPath + ' .');
        process.exit(-1);
      }

      var destinationDirectory = environmentConfig[env].rsync.destination_dir;
      try 
      {
        fs.statSync(path.join(destinationDirectory));
      }
      catch (err)
      {
        throw new Error('Create the backups destination directory ' + destinationDirectory + 
            ' defined in backup.ini before restarting the application.');
      }

      for (var i=0; i<files.length; i++) {
        var file = files[i];
        if (file.match(/[.]*example[.]*/) || file.match(/[.]*\.swp/))
        {
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
          if (machine.name === app.locals.machines[j].name)
          {
            configLogger.error('Please make sure each machine name is unique.');
            configLogger.error('  ' + file + ' and at least one other machine have the name ' + machine.name);
            throw new Error('Machine name not unique for ' + machine.name);
          }
        }
        // Append a logger for the machine.
        var machineLogPath = environmentConfig[env].environment.log_directory + '/' + machine.name + '.log';
        log4js.addAppender(log4js.appenders.file(machineLogPath), machine.name);
        var logger = log4js.getLogger(machine.name);
        logger.setLevel(logConfig.logLevel);

        // Create the backup directory for the machine
        try
        {
          fs.statSync(path.join(destinationDirectory, machine.name))
        }
        catch (err)
        {
          fs.mkdirSync(path.join(destinationDirectory, machine.name));
        }

        // If it has a unique name add it to the list of machines.
        app.locals.machines.push(machine);
      }
      if (app.locals.machines.length < 1)
      {
        console.error('Please make sure you have machines configured to back up.');
        throw new Error('Please make sure you have machines configured to back up following' + 
        ' the machine.example.ini file in the ' + path.join(environmentConfig[env].root, 'etc/backup/machines/ directory'));
      }
      // Set the timeouts on the machines for the first scheduled backup.
    });
  },
  // return the configuration for the environment that we 
  environmentVar: environmentConfig[env]
};

