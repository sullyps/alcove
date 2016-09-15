var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini'),
    wrap = require('word-wrap'),
    log4js = require('log4js');
var logConfig = require('./log4js');
var env = process.env.NODE_ENV || 'development';
var rootPath = path.normalize(__dirname + '/../..');
var machineConfPath = path.join(rootPath, 'etc', 'backup', 'machines');

// Try to nicely wrap text:
const TEXT_WRAP = 80;
// Alternatively, try to detect a screen size:  (disabled because of odd size reporting
// required a magic number... and I don't like that!)
//const TEXT_WRAP = Math.max((process.stdout.columns - 3), 120) || 80;

// Default environment configuration values.
const DEFAULTS = {
  development: {
    root: rootPath,
    app: {
      name: 'Backup System'
    },
    environment: {
      ip: '0.0.0.0',
      port: 3000,
      run_securely: false,
      ssl_port: 3443,
      key: rootPath + '/etc/backup/ssl/ssl.key',
      cert: rootPath + '/etc/backup/ssl/ssl.crt',
      auth: rootPath + '/resources/.htpasswd',
      db_url: 'sqlite://localhost/backup-development',
      db_storage: rootPath + '/data/development',
      log_directory: rootPath + '/logs'
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
      from_email_addr: 'backups@example.com',
      receiving_email_addr: [],
      receiving_sms_addr: [],
      summary_email_sched: '1;8:00',
    }
  },

  test: {
    root: rootPath,
    app: {
      name: 'Backup System'
    },
    environment: {
      ip: '0.0.0.0',
      port: 3000,
      run_securely: false,
      ssl_port: 3443,
      key: rootPath + '/etc/backup/ssl/ssl.key',
      cert: rootPath + '/etc/backup/ssl/ssl.crt',
      auth: rootPath + '/resources/.htpasswd',
      db_url: 'sqlite://localhost/backup-development',
      db_storage: rootPath + '/data/development',
      log_directory: rootPath + '/logs'
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
      from_email_addr: 'backups@example.com',
      receiving_email_addr: [],
      receiving_sms_addr: [],
      summary_email_sched: '1;8:00',
    }
  },

  production: {
    root: rootPath,
    app: {
      name: 'Backup System'
    },
    ip: '0.0.0.0',
    port: 3000,
    log_directory: rootPath + '/logs'
    // SMTP: see options for nodemailer to set up transport https://github.com/nodemailer/nodemailer
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
  // TODO: support rootPath/etc OR /etc:
  var filename = (fs.existsSync('/etc/backup/backup.ini') ? '' : rootPath) + "/etc/backup/backup.ini";
  backupConfig = ini.parse(fs.readFileSync(filename, 'utf-8'));
  console.log(backupConfig);
  process.exit();
  updateConfigParams(backupConfig, DEFAULTS[env]);
}
catch(error) 
{
  var msg = wrap('Config file "backup.ini" not found in "/etc/backup/" OR "' + rootPath + '/etc/backup/"', { width: TEXT_WRAP, indent: '' });
  var detail = wrap('Using default values (you probably don\'t want to do this)...\nAlternatively, create the config file ' +
    '"backup.ini" with appropriate parameters and restart the application.',
    { width: TEXT_WRAP, indent: '  ' });
  console.log(msg);
  console.log(detail);
  console.log('\n  Error: ' + error.message);
  if (env == 'development') console.log(error.stack);
}

// Exports from the file include the machine configuring method and the combined configuration
//   from the defaults and the user defined parameters.
module.exports = {
  configureMachines: function(app) {
    var configLogger = log4js.getLogger('config');
    fs.readdir(machineConfPath, function(error, files) {
      if (error)
      {
        configLogger.error('Cannot read machine configurations from the specified directory: "' + machineConfPath + '"');
        process.exit(-1);
      }

      var destinationDirectory = DEFAULTS[env].rsync.destination_dir;
      try 
      {
        // FIXME: No, just mkdirp this! No need to require a mkdir() call!
        fs.statSync(path.join(destinationDirectory));
      }
      catch (err)
      {
        configLogger.error('Create the backups destination directory "' + destinationDirectory + 
            '" defined in "backup.ini" before restarting the application.');
        process.exit(-2);
      }

      for (var i=0; i<files.length; i++) {
        var file = files[i];
        
        // Only process ".ini" files
        if (!file.match(/.+\.ini$/)) continue;

        configLogger.info('Reading file: ' + path.join(machineConfPath, file));
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
            configLogger.error('  "' + file + '" defines a non-unique machine name: ' + machine.name);
            process.exit(-10);
          }
        }
        // Append a logger for the machine.
        var machineLogPath = DEFAULTS[env].environment.log_directory + '/' + machine.name + '.log';
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
        // Inform the user that nothing is configured (not necessarily an error case.
        configLogger.warn('No machines configured for backup. Nothing to do...');
      }
      // Set the timeouts on the machines for the first scheduled backup.
    });
  },
  // return the configuration for the environment that we 
  environmentVar: DEFAULTS[env]
};

