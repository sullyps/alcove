'use strict';

var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini');

var logging = require('./log4js');
var defaults = require('./defaults');

/**
 * Define the allowable configuration specification.
 */
const SPEC = {
  valid: [ 
    "ip", "port", "log_dir", "log_level", "data_dir",
    "secure.key", "secure.cert",
    "rsync.max_simultaneous", "rsync.identity", "rsync.user",
    "rsync.retry.max_attempts", "rsync.retry.time",
    "notifications.email_to", "notifications.email_from", "notifications.summary_schedule",
    "notifications.smtp.host", "notifications.smtp.port", "notifications.smtp.user", "notifications.smtp.pass",
    "notifications.sms_accessKey", "notifications.sms_secretKey",
    "notifications.sms_region", "notifications.sms_to"
  ],
  required: [
    "ip", "port", "log_dir", "log_level", "data_dir",
    "rsync.max_simultaneous", 
    "rsync.retry.max_attempts", "rsync.retry.time",
    "notifications.email_to", "notifications.email_from"
  ],
  machines: {
    valid: [
      "name", "ip", "topLevelInclusion", "extensionExclusion",
      "fileExclusion", "schedule"
    ],
    required: [
      "name", "ip", "topLevelInclusion", "schedule"
    ]
  }
};


/**
 * Read the config file from the specified location.
 */
function readConfig(filename)
{
  // Read in the main configuration file
  try
  {
    var config = ini.parse(fs.readFileSync(filename, 'utf-8'));
    config.app = {};
    config.app.config_file = filename;
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
  var machineConfs;
  try
  {
    var machineConfPath = path.join(path.dirname(filename), 'machines');
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
  machineConfs.forEach(function(file) {
    // Only process ".ini" files
    if (!file.match(/.+\.ini$/)) return;
    try
    {
      var machineFilename = path.join(machineConfPath, file);
      var machineConfig = ini.parse(fs.readFileSync(machineFilename, 'utf-8'));
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
      throw new Error(`Multiple definitions for machine '${machine.name}'`);

    // Abort if backup schedule contains any errors
    var backupScheduleErrs = validateBackupSchedule(machineConfig.schedule);
    if (backupScheduleErrs.length)
      throw new Error('Errors found in backup schedule for machine :' + backupScheduleErrs.join(','));

    // Save in our config obj
    config.machines[machineConfig.name.toLowerCase()] = machineConfig;
  });

  // All done
  return config;
}

/**
 * Verify machine schedule is correct
 */
function validateBackupSchedule(schedule)
{
  let errs = [];
  if (schedule.match(/^(([0-6,]){1,13}\(\d\)\|*)+\;\[\d{1,2}\:[0-5]\d\]$/))
  {
    try
    {
      var time = schedule.split(';')[1].replace(/[\[\]]/g,'');
      var hour = time.split(':')[0];
      var min = time.split(':')[1];
      if (parseFloat(hour) >= 24 || parseFloat(min) >= 60)
        errs.push('Backup Schedule time [hh:mm] is an invalid time');

      var dates = schedule.split(';')[0].split('|');
      dates.forEach(function(dateSet) {
        if (!dateSet.match(/^([0-6,]){1,13}\(\d\)$/))
          errs.push('Invalid set of dates provided in: ' + dateSet);
      });
    }
    catch(err)
    {
      errs.push('Could not parse backup schedule: ' + err.message);
    }
  }
  return errs;
}

/**
 * Obtain an object value from a key path.
 */
function getValue(obj, path)
{
  for (var i = 0, path = path.split('.'), len = path.length; i < len; i++)
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
  var paths = [];
  Object.keys(config).forEach(function(option) {
    if (option === "machines" || option === "app") return;
    if (config[option] instanceof Object && !(config[option] instanceof Array))
      paths = paths.concat(getKeyPaths(config[option], prefix + option + "."));
    else
      paths = paths.concat(prefix + option);
  });
  return paths;
}

/**
 * Validate given variable is numeric.
 */
function isNumeric(n)
{
  return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * Validate the current config options.
 */
function validateConfig(config)
{
  var errs = [];

  // Validate the HTTPS options are not half entered
  if ((config.secure) && (!config.secure.key || !config.secure.cert)) 
    errs.push('For HTTPS operation you must specify BOTH "secure.key" and "secure.cert"');

  // Look at the spec to determine missing required parameters
  SPEC.required.forEach(function(option) {
    if (getValue(config, option) === undefined)
      errs.push(`Missing required value '${option}'`);
  });
  // Look at the resulting config to determine any invalid parameters from the spec
  getKeyPaths(config).forEach(function(setting) {
    if (!SPEC.valid.includes(setting))
      errs.push(`Unknown option '${setting}' encountered in configuration`);
  });

  // Ensure there is at least 1 successfully configured machine
  if (Object.keys(config.machines).length == 0)
    errs.push("You must configure at least one machine for backup");
  
  // Verify data_dir is accessible
  try
  {
    var dataPath;
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

  // Verify port and the number of max simulataneous rsync commands
  if (!isNumeric(config.port)) errs.push('Port must be numeric in configuration');
  if (!isNumeric(config.rsync.max_simultaneous)) errs.push('Max simultaneous rsync processes must be numeric in configuration');

  // Verify the notification settings
  errs = errs.concat(validateNotifications(config.notifications));

  if (errs.length > 0)
    throw new Error('Invalid configuration!\n\n' + errs.join('\n'));
}

/**
 *  Verify configurations for email and sms notifications.
 */
function validateNotifications(config)
{
  let errs = [];

  // Verify email_to is an array with valid emails
  // NOTE: Due to the nonintuitive syntax for arrays in .ini files, we will 
  //   tolerate a single String value here too (transform it to an array)
  // Borrowed: http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
  if (typeof(config.email_to) === 'string')
    config.email_to = [ config.email_to ];
  if (config.email_to instanceof Array)
  {
    const re = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;
    config.email_to.forEach(function(email) {
      if (!re.test(email))
        errs.push('Invalid email address: ' + email);
    });
  }
  else if (config.email_to)
  {
    errs.push('Invalid setting for "email_to"');
  }

  // Verify the sms_to field is valid
  if (config.sms_to)
  {
    // The recipient must be specified in one of two formats for SMS to configure properly.
    // NOTE: The following regex may change when/if AWS adds more regions or changes how the ARNs are generated
    if (config.sms_to.match(/^arn\:aws\:sns\:(us|ap|ca|eu|sa)\-(east|west|north|south|central|northeast|northwest|southwest|southeast)\-[1-3]\:\d{12}\:[a-zA-z\-\_\d]{1,256}/))
      config.sms_type = 'topicArn';
    // Phone number must be in E.164 format, with a leading country code (1-9) and max of 15 digits
    else if (config.sms_to.match(/^\+?[1-9]\d{10,14}$/))
      config.sms_type = 'phoneNum';
    else
    {
      errs.push('Invalid setting for "sms_to": Does not look like either an AWS ARN or an E.164 phone number.');
      config.sms_type = '';
    }
  }

  // Verify the AWS region is valid
  if (config.sms_region)
  {
    if (!config.sms_region.match(/^(us|ap|ca|cn|eu|sa)\-(east|west|north|south|central|northeast|northwest|southeast|southwest)\-[1-3]$/))
    {
      errs.push('Invalid setting for "sms_region": Does not look like a valid AWS region.');
    }
  }

  // Ensure region is present if using an ARN
  if (config.sms_type === 'topicArn' && !config.sms_region)
  {
    errs.push('AWS region setting ("aws_region") missing when Using an AWS ARN.');
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
  SPEC.machines.required.forEach(function(option) {
    if (getValue(config, option) === undefined)
      errs.push(`Machine '${machineName}' is missing required value '${option}'`);
  });

  // 
  // Look for invalid
  getKeyPaths(config).forEach(function(setting) {
    if (!SPEC.machines.valid.includes(setting))
      errs.push(`Unknown option '${setting}' encountered in configuration for machine '${machineName}'`);
  });

  // Now validate the rsync include/exclude settings, this is critical to 
  // enable the proper transforming of these options in system::prepareMachines()
  //
  // Excluded file extension types
  //   (Start with a period, do not contain any slashes or wildcards (* ?), warn if >10 chars)
  if (typeof(config.extensionExclusion) === 'string')
    config.extensionExclusion = [ config.extensionExclusion ];
  if (config.extensionExclusion instanceof Array)
  {
    config.extensionExclusion.forEach(function (ext) {
      // TODO: Maybe we just want to restrict the use of "**" instead of all wildcards...
      if (ext.indexOf('*') >= 0 || ext.indexOf('?') >= 0)
        errs.push('Invalid setting for "extensionExclusion": Extensions cannot include wildcards (' + ext + ')');
      else if (ext.indexOf('/') >= 0)
        errs.push('Invalid setting for "extensionExclusion": Extensions cannot be paths (' + ext + ')');
      else if (ext.indexOf('.') != 0)
        errs.push('Invalid setting for "extensionExclusion": Extensions must start with a period (' + ext + ')');
      else if (ext.length > 10)
        console.warn('Detected long file extension (' + ext + ') in config for "' + machineName + '". Is this correct?');
    });
  }
  else if (config.extensionExclusion)
  {
    errs.push('Invalid setting for "extensionExclusion"');
  }

  // Single File/Dir exclusions
  //   (absolute paths, no wildcards)
  if (typeof(config.fileExclusion) === 'string')
    config.fileExclusion = [ config.fileExclusion ];
  if (config.fileExclusion instanceof Array)
  {
    config.fileExclusion.forEach(function (file) {
      // TODO: Maybe we just want to restrict the use of "**" instead of all wildcards...
      if (file.indexOf('*') >= 0 || file.indexOf('?') >= 0)
        errs.push('Invalid setting for "fileExclusion": Excluded files cannot include wildcards (' + file + ')');
      else if (!path.isAbsolute(file))
        errs.push('Invalid setting for "fileExclusion": Excluded files must be absolute paths (' + file + ')');
    });
  }
  else if (config.fileExclusion)
  {
    errs.push('Invalid setting for "fileExclusion"');
  }

  // Top Level includes
  //   (must be absolute, no wildcards)
  if (typeof(config.topLevelInclusion) === 'string')
    config.topLevelInclusion = [ config.topLevelInclusion ];
  if (config.topLevelInclusion instanceof Array)
  {
    config.topLevelInclusion.forEach(function (dir) {
      // TODO: Maybe we just want to restrict the use of "**" instead of all wildcards...
      if (dir.indexOf('*') >= 0 || dir.indexOf('?') >= 0)
        errs.push('Invalid setting for "topLevelInclusion": Backup directories cannot include wildcards (' + dir + ')');
      else if (!path.isAbsolute(dir))
        errs.push('Invalid setting for "topLevelInclusion": Backup directories must be absolute paths (' + dir + ')');
    });
  }
  else if (config.topLevelInclusion)
  {
    errs.push('Invalid setting for "topLevelInclusion"');
  }


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
  getConfig: function(filename) {
    var config = readConfig(filename);
    addDefaults(defaults, config);
    validateConfig(config);
    Object.keys(config.machines).forEach(function(machineName) {
      validateMachineConfig(machineName, config.machines[machineName]);
    });

    return (config);
  }
};
