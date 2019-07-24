'use strict';

const path = require('path'),
      fs = require('fs-extra'),
      ini = require('ini'),
      child_process = require('child_process');

const logging = require('./log4js');
const defaults = require('./defaults');

/**
 * Define the allowable configuration specification.
 */
const SPEC = {
  valid: [ 
    "ip", "port", "log_dir", "log_level", "data_dir",
    "allow_insecure", "secure.key", "secure.cert",
    "rsync.max_simultaneous", "rsync.identity", "rsync.user",
    "rsync.retry.max_attempts", "rsync.retry.time",
    "rsync.retry.multiplier",
    "notifications.summary_schedule", "notifications.tag",
    "notifications.email_to", "notifications.email_from", 
    "notifications.smtp.host", "notifications.smtp.port", "notifications.smtp.user", "notifications.smtp.pass",
    "notifications.sms.access_key", "notifications.sms.secret_key",
    "notifications.sms.aws_region", "notifications.sms.sms_to",
    "notifications.slack.webhook", "notifications.slack.level"
  ],
  required: [
    "ip", "port", "log_dir", "log_level", "data_dir",
    "rsync.max_simultaneous", 
    "rsync.retry.max_attempts", "rsync.retry.time", "rsync.retry.multiplier",
    "notifications.email_to", "notifications.email_from"
  ],
  machines: {
    valid: [
      "name", "host", "backup_directories", "ignore_extensions",
      "ignore_files", "schedule"
    ],
    required: [
      "name", "host", "backup_directories", "schedule"
    ]
  }
};


/**
 * Read the config file from the specified location.
 */
function readConfig(filename)
{
  // Read in the main configuration file
  let config;
  try
  {
    config = ini.parse(fs.readFileSync(filename, 'utf-8'));
    config.app = {};
    config.app.config_file = filename;
    // Simple transform on log_level
    config.log_level = config.log_level.toLowerCase();
  }
  catch (error)
  {
    if (error instanceof TypeError)
      throw new Error("Config filename is not a String");
    else if (error.code === "EISDIR")
      throw new Error(`Directory specified instead of config file (${filename})`);
    else if (error.code === "EACCES")
      throw new Error(`Permission denied or config file inaccessible (${filename})`);
    else if (error.code === "ENOENT")
      throw new Error(`Missing config file (${filename})`);
    else
      // This rarely happens. In general I don't expect to ever see it...
      throw new Error(`Parsing or unknown error with config file (${filename}): ${error.message}`);
  }

  // Machine specific second
  // Test the location first, to isolate from individual errors
  config.machines = {};
  let machineConfPath, machineConfs;
  try
  {
    machineConfPath = path.join(path.dirname(filename), 'machines');
    machineConfs = fs.readdirSync(machineConfPath);
  }
  catch (error)
  {
    if (error.code === "EACCES")
      throw new Error(`Permission denied on machine configuration dir (${machineConfPath})`);
    else if (error.code === "ENOENT")
      throw new Error(`No directory found for machine configuration files (${machineConfPath})`);
    else 
      throw new Error(`Unexpected error on machine configuration dir (${machineConfPath}): ${error.message}`);
  }

  // Now parse / load each machine, but die eagerly on errors
  machineConfs.forEach( file => {
    // Only process ".ini" files
    if (!file.match(/.+\.ini$/)) return;
    let machineFilename, machineConfig;
    try
    {
      machineFilename = path.join(machineConfPath, file);
      machineConfig = ini.parse(fs.readFileSync(machineFilename, 'utf-8'));
    }
    catch (error)
    {
      if (error.code === "EISDIR")
        throw new Error(`Directory specified instead of config file (${machineFilename})`);
      else if (error.code === "EACCES")
        throw new Error(`Permission denied or config file inaccessible (${machineFilename})`);
      else
        // This rarely happens. In general I don't expect to ever see it...
        throw new Error(`Parsing or unknown error with machine config file (${machineFilename}): ${error.message}`);
    }

    // Require name (other requirements are checked in the validate function)
    if (!machineConfig.name)
      throw new Error(`Missing required machine name in file (${machineFilename})`);
    // Abort on multiple machine definitions
    if (config.machines[machineConfig.name])
      throw new Error(`Multiple definitions for machine '${machineConfig.name}'`);

    // Save in our config obj
    config.machines[machineConfig.name] = machineConfig;
  });

  let sshHostTestPromises = [];
  for (let machineConfig of Object.values(config.machines))
  {
    sshHostTestPromises.push(ensureSSHConnections(machineConfig));
  }

  return Promise.all(sshHostTestPromises)
  .then(() => {
    return config;
  })
  .catch(error => {
    throw new Error(error);
  });
}

/**
 * Verify that a machine schedule is specified using the correct format.
 */
function validateBackupSchedule(schedule)
{
  let errs = [];
  // TODO: Discuss whether this regex should be more lenient, allowing for 
  // minutes to be greater than 60 & printing out corresponding error
  // or letting error message be that the schedule does not match regex.
  if (schedule.match(/^(([0-6,\-]){1,13}\(\d\)\|*)+\;\[\d{1,2}\:[0-5]\d\]$/))
  {
    try
    {
      let time = schedule.split(';')[1].replace(/[\[\]]/g,'');
      let hour = time.split(':')[0];
      let min = time.split(':')[1];
      if (parseFloat(hour) >= 24 || parseFloat(min) >= 60)
        errs.push('Backup Schedule (' + schedule + ') contains an invalid time [HH:mm]');

      let dates = schedule.split(';')[0].split('|');
      dates.forEach( dateSet => {
        if (!dateSet.match(/^([0-6,\-]){1,13}\(\d\)$/))
          errs.push('Invalid set of days provided in schedule (' + schedule + ')');
      });
    }
    catch(err)
    {
      errs.push('Could not parse Backup schedule (' + schedule + '): ' + err.message);
    }
  }
  else
  {
    errs.push('Backup schedule (' + schedule + ') format is incorrect. Should be: DAYS(N);[HH:mm]');
  }

  return errs;
}

/**
 * Obtain an object value from a key path.
 */
function getValue(obj, path)
{
  path = path.split('.');
  for (let i = 0 ; i < path.length; i++)
  {
    obj = obj[path[i]];
    if (obj == undefined) return undefined;
  }
  return obj;
}
/**
 * Obtain a list of all object key paths represented in this config object.
 * Skips the machine specific configs, and internal app settings.
 */
function getKeyPaths(config, prefix='')
{
  let paths = [];
  Object.keys(config).forEach( option => {
    if (option === "machines" || option === "app") return;
    if (config[option] instanceof Object && !(config[option] instanceof Array))
      paths = paths.concat(getKeyPaths(config[option], prefix + option + "."));
    else
      paths = paths.concat(prefix + option);
  });
  return paths;
}

/**
 * Validate that a given given string is a positive integer (>=1).
 * @param {string} str - The string value to test, if already a number the 
 *   tests for limits and integer value are still performed.
 * @param {integer} max - The maximum allowed value (inclusive). The 
 *   default is Infinity if this is not specified.
 */
function isPositiveInteger(str, max)
{
  let n = Math.floor(Number(str));
  let maxVal = max || Infinity;
  if (maxVal < Infinity && !Number.isInteger(maxVal))
    throw new Error('When providing a max to isPositiveInteger() you must use a "Number" value');
  return n !== Infinity && String(n) === String(str) && n >= 1 && n <= maxVal;
}

/**
 * Validate the current config options.
 */
function validateConfig(config)
{
  let errs = [];

  // Validate log_level
  let validLogLevels = ['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off'];
  if (!validLogLevels.includes(config.log_level))
    errs.push('Setting for "log_level" should be one of (' + validLogLevels.join(', ') + ') [Config specified: ' + config.log_level + ']');

  // Validate the HTTPS options are not half entered
  if ((config.secure) && (!config.secure.key || !config.secure.cert)) 
    errs.push('For HTTPS operation you must specify BOTH "secure.key" and "secure.cert"');

  // Look at the spec to determine missing required parameters
  SPEC.required.forEach( option => {
    if (getValue(config, option) === undefined)
      errs.push(`Missing required value '${option}'`);
  });
  // Look at the resulting config to determine any invalid parameters from the spec
  getKeyPaths(config).forEach( setting => { 
    if (!SPEC.valid.includes(setting))
      errs.push(`Unknown option '${setting}' encountered in configuration`);
  });

  // Ensure there is at least 1 successfully configured machine
  if (Object.keys(config.machines).length == 0)
    errs.push("You must configure at least one machine for backup");
  
  // Verify data_dir is accessible
  let dataPath;
  try
  {
    if (config.data_dir !== undefined)
    {
      dataPath = (config.data_dir[0] === '/') ? config.data_dir : path.join(config.app.root, config.data_dir);
      fs.readdirSync(dataPath);
    }
  }
  catch (error)
  {
    if (error.code === "EACCES")
      errs.push(`Permission denied on "data_dir" backup destination (${dataPath})`);
    else if (error.code === "ENOENT")
      errs.push(`Specified "data_dir" backup destination is not found (${dataPath})`);
    else 
      errs.push(`Unexpected error on "data_dir" backup destination (${dataPath}): ${error.message}`);
  }

  // Verify port, number of max simulataneous process, and max attempts
  // rsync commands to be positive integers
  if (!isPositiveInteger(config.port, 65535))
  {
    errs.push('Port must be a positive integer (from 1 to 65535) [Config specified: ' + config.port + ']');
  }
  if (!isPositiveInteger(config.rsync.max_simultaneous))
  {
    errs.push('Max simultaneous rsync processes must be a positive integer [Config specified: ' + config.rsync.max_simultaneous + ']');
  }
  if (!isPositiveInteger(config.rsync.retry.max_attempts))
  {
    errs.push('Max attempts must be a positive integer value [Config specified: ' + config.rsync.retry.max_attempts + ']');
  }

  // Verify the SSH identity
  errs = errs.concat(validateIdentity(config));

  // Verify the notification settings
  errs = errs.concat(validateNotifications(config.notifications));

  if (errs.length > 0)
    throw new Error('Invalid configuration!\n\n' + errs.join('\n'));
}

/** 
 * Validate the identity that we will use for the transfers, and record the
 * absolute path for the keypair, for ease of use.
 */
function validateIdentity(config)
{
  let errs = [];

  // These defaults are defined within the man page of openssh, we will search
  // them in order, if a user-defined keypair cannot be found
  const TYPES = ['id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa'];
  let paths = [];

  // Make a list of possible paths, in the order that we want to check
  if (config.rsync.identity)
  {
    if (config.rsync.identity[0] === '/')
    {
      // Absolute path specified
      paths.push(config.rsync.identity);
    }
    else 
    {
      // Anchor relative paths at the config directory
      let configDir = path.dirname(config.app.config_file);
      paths.push(path.join(configDir, config.rsync.identity));
    }
  }
  else
  {
    // If nothing was specified, check all the defaults
    // SSH will automatically use the default files from /<user_home>/.ssh/ directory
    let homeDir = process.env.HOME;
    TYPES.forEach(type => {
      paths.push(path.join(homeDir, '.ssh', type));
    });
  }

  // To ensure we find a valid key pair, adjust the config
  config.rsync.identity = '';

  // Now test all paths for a pair, and use the first found
  paths.forEach(testPath => {
    if (fs.existsSync(testPath) && fs.existsSync(testPath + ".pub"))
    {
      // Test permissions and ownership on the private key
      try
      {
        let stats = fs.statSync(testPath);

        // Ensure ownership
        if (stats.uid !== process.getuid()) 
          errs.push('Private key (' + testPath + ') is owned by wrong UID (' + stats.uid + ')');

        // Check for restricted group/world permissions
        // NOTE: stats are octal, so 0x0e3f (7077) will unmask any permissions aside from "owner"
        if (stats.mode & 0x0e3f) 
          errs.push('Private key (' + testPath + ') has wrong permissions (' + (stats.mode & 0x0fff).toString(8) + ')');
      }
      catch (err)
      {
        errs.push('Could not validate permissions on keypair: ' + err.message);
      }
      
      // Always record our absolute path for ease of use
      config.rsync.identity = testPath;

      return;
    }
  });

  // Nothing could be found
  if (!config.rsync.identity) errs.push('No valid public keys could be found in the following locations: ', paths);

  // All done
  return errs;
}

/**
 * Tests the SSH connection for the machine described by
 * machineConfig and kills the entire startup if a machine
 * connection doesn't work.
 * @param machineConfig
 *   The machine configuration for the machine whose
 *   SSH connection is to be tested
 * @returns
 *   A promise that resolves when the test is done and
 *   rejects with an error if the connection fails.
 */
function ensureSSHConnections(machineConfig)
{
  return new Promise((resolve, reject) => {
    // As per https://serverfault.com/a/182060
    child_process.exec(`ssh-keygen -H -F ${machineConfig.host}`, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error || !stdout || stderr)
      {
        reject(`There was an error connecting to ${machineConfig.name}. Make sure its public key is added to the known_hosts file.`);
      }
      else
      {
        resolve();
      }
    });
  });
}

/**
 *  Verify configurations for email and sms notifications.
 */
function validateNotifications(config)
{
  let errs = [];

  // Verify email_to is an array with valid emails
  // NOTE: Due to the unintuitive syntax for arrays in .ini files, we will
  //   tolerate a single String value here too (transform it to an array)
  // RFC 5322 Regex for validating emails
  //   https://stackoverflow.com/questions/201323/how-to-validate-an-email-address-using-a-regular-expression
  if (typeof(config.email_to) === 'string')
    config.email_to = [ config.email_to ];
  if (config.email_to)
  {
    let emails = config.email_to;
    const reBeforeAt = /^(?:[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")$/;
    const reAfterAt = /^(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;
    if (config.email_to instanceof Array)
    {
      emails.forEach( email => {
        let separateEmail = email.split('@');
        if (separateEmail.length !== 2 || !reBeforeAt.test(separateEmail[0]) || !reAfterAt.test(separateEmail[1]))
          errs.push('Invalid email address: ' + email);
      });
    }
    else
    {
      errs.push('Invalid setting for "email_to"');
    }
  }
  
  if (config.sms)
  {
    // Verify the sms_to field is valid
    // The recipient must be specified either as an AWS ARN or phone number to be valid
    if (config.sms.sms_to)
    {
      let smsTo = config.sms.sms_to;

      if (smsTo.match(/^arn\:aws\:sns\:(us|ap|ca|eu|sa)\-(east|west|north|south|central|northeast|northwest|southwest|southeast)\-[1-3]\:\d{12}\:[a-zA-z\-\_\d]{1,256}/))
      {
        // NOTE: The above regex may change when/if AWS adds more regions or
        // changes how the ARNs are generated
        config.sms.type = 'topicArn';
      }
      else if (smsTo.match(/^\+?[1-9]\d{10,14}$/))
      {
        // All valid phone numbers must be in E.164 format and can have a maximum of fifteen digits. 
        //   [+] [country code] [subscriber number including area code]
        // AWS SNS will also accept a number without the prefixed '+'.
        config.sms.type = 'phoneNum';
      }
      else
      {
        errs.push('Invalid setting for "sms_to": Does not look like either an AWS ARN or an E.164 phone number.');
        config.sms.type = '';
      }
    }

    // Verify the AWS region is valid
    if (config.sms.aws_region)
    {
      if (!config.sms.aws_region.match(/^(us|ap|ca|cn|eu|sa)\-(east|west|north|south|central|northeast|northwest|southeast|southwest)\-[1-3]$/))
      {
        // NOTE: The above regex may change when/if AWS adds more regions
        errs.push('Invalid setting for "aws_region": Does not look like a valid AWS region.');
      }
    }

    // Ensure AWS related configuration is sane
    if (config.sms.sms_to && (!config.sms.access_key || !config.sms.secret_key))
    {
      errs.push('SMS destination defined, but missing AWS credentials.');
    }
    if (config.sms.type === 'topicArn' && !config.sms.aws_region)
    {
      errs.push('AWS region setting ("aws_region") missing when Using an AWS ARN.');
    }
  }

  if (config.slack && config.slack.level)
  {
    if (!['summary', 'all'].includes(config.slack.level))
    {
      errs.push(`Invalid Slack notification level ("notifications.slack.level")`);
    }
  }

  return errs;
}

/**
 * Validate the config options for a machine specific config.
 */
function validateMachineConfig(machineName, config)
{
  let errs = [];

  // First check for required / invalid parameters
  //
  // Check required
  SPEC.machines.required.forEach( option => {
    if (getValue(config, option) === undefined)
      errs.push(`Machine '${machineName}' is missing required value '${option}'`);
  });

  // 
  // Look for invalid
  getKeyPaths(config).forEach( setting => {
    if (!SPEC.machines.valid.includes(setting))
      errs.push(`Unknown option '${setting}' encountered in configuration for machine '${machineName}'`);
  });

  // Now validate the rsync include/exclude settings, this is critical to 
  // enable the proper transforming of these options in system::prepareMachines()
  //
  // Ignored file extension types
  //   (Start with a period, do not contain any slashes or wildcards (/ * ** *** ?), warn if >10 chars)
  if (typeof(config.ignore_extensions) === 'string')
    config.ignore_extensions = [ config.ignore_extensions ];
  if (config.ignore_extensions instanceof Array)
  {
    config.ignore_extensions.forEach( ext => {
      // TODO: Maybe we just want to restrict the use of "**" instead of all wildcards...
      if (ext.indexOf('*') >= 0 || ext.indexOf('?') >= 0)
        errs.push('Invalid setting for "ignore_extensions": Extensions cannot include wildcards (' + ext + ')');
      else if (ext.indexOf('/') >= 0)
        errs.push('Invalid setting for "ignore_extensions": Extensions cannot be paths (' + ext + ')');
      else if (ext.indexOf('.') != 0)
        errs.push('Invalid setting for "ignore_extensions": Extensions must start with a period (' + ext + ')');
      else if (ext.length > 10)
        console.warn('Detected long file extension (' + ext + ') in config for "' + machineName + '". Is this correct?');
    });
  }
  else if (config.ignore_extensions)
  {
    errs.push('Invalid setting for "ignore_extensions"');
  }

  // Single File/Dir exclusions
  //   (absolute paths, no double or triple wildcards)
  if (typeof(config.ignore_files) === 'string')
    config.ignore_files = [ config.ignore_files ];
  if (config.ignore_files instanceof Array)
  {
    config.ignore_files.forEach( file => {
      if (file.indexOf('**') >= 0)
        errs.push('Invalid setting for "ignore_files": Excluded files cannot include double or triple wildcards (' + file + ')');
      else if (!path.isAbsolute(file))
        errs.push('Invalid setting for "ignore_files": Excluded files must be absolute paths (' + file + ')');
    });
  }
  else if (config.ignore_files)
  {
    errs.push('Invalid setting for "ignore_files"');
  }

  // Backup Directories
  //   (must be absolute, no double or triple wildcards)
  if (typeof(config.backup_directories) === 'string')
    config.backup_directories = [ config.backup_directories ];
  if (config.backup_directories instanceof Array)
  {
    config.backup_directories.forEach( dir => {
      if (dir.indexOf('**') >= 0)
        errs.push('Invalid setting for "backup_directories": Backup directories cannot include double or triple wildcards (' + dir + ')');
      else if (!path.isAbsolute(dir))
        errs.push('Invalid setting for "backup_directories": Backup directories must be absolute paths (' + dir + ')');
    });
  }
  else if (config.backup_directories)
  {
    errs.push('Invalid setting for "backup_directories"');
  }

  // Check the schedule
  errs = errs.concat(validateBackupSchedule(config.schedule));

  if (errs.length > 0)
    throw new Error('Invalid configuration for machine "' + machineName + '"!\n\n' + errs.join('\n'));
}

/**
 * Add in the defaults from the first object, only if they are missing from
 * the second object.
 */
function addDefaults(defaults, target)
{
  if (typeof(defaults) === 'undefined')
    throw new Error('Defaults cannot be undefined');
  else if (defaults instanceof Object && typeof(target) !== 'undefined' && !(target instanceof Object))
    // Defaults defines a container where config defines a primitive
    // TODO: this is very hard to debug from this info. Might need to get smarter
    //    about this error message... 
    //    (Maybe add a parameter that accumulates the ini path, so we can identify  
    //    which setting is involved in this error)
    throw new Error('Config syntax error');

  // Loop defaults, adding properties that are missing, and merging in Objects
  for (let key in defaults)
  {
    // Skip the embedded defaults
    if (key === 'DEFAULTS') continue;

    if (defaults[key] instanceof Array)
    {
      // Don't recurse into Arrays, just use defaults unless a user defined value is present
      if (target[key] === undefined) target[key] = defaults[key];
    }
    else if (defaults[key] instanceof Object)
    {
      // Ensure object
      if (target[key] === undefined) target[key] = {};
      // Recurse subcategory
      addDefaults(defaults[key], target[key]);
    }
    else if (target[key] === undefined)
    {
      // Copy in the defaults (non-objects)
      target[key] = defaults[key];
    }
  }

  // NOTE: The special key of DEFAULTS will enable applying these defaults
  //   to every object at the current level. This is needed so that the
  //   machine defaults can be applied, even though each machine config 
  //   object is keyed by the 'name' and cannot be hardcoded in the
  //   defaults object. 
  if (defaults.hasOwnProperty('DEFAULTS'))
  {
    for (let key in target)
    {
      addDefaults(defaults.DEFAULTS, target[key]);
    }
  }
}


/**
 * Module pattern
 */
module.exports = {
  getConfig: filename => {
    return readConfig(filename)
    .then(config => {
      addDefaults(defaults, config);
      validateConfig(config);
      Object.keys(config.machines).forEach( machineName => {
        validateMachineConfig(machineName, config.machines[machineName]);
      });

      return (config);
    });
  },
  /* test-code */
  __validateNotifications : validateNotifications,
  __validateBackupSchedule : validateBackupSchedule,
  __isPositiveInteger : isPositiveInteger
  /* end-test-code */
};
