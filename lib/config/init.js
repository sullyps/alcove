'use strict';

var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini');

var logging = require('./log4js');
var defaults = require('./defaults');

var logger = logging.getLogger('config');

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
      "name", "ip", "inclusionPatterns", "exclusionPatterns", "schedule"
    ],
    required: [
      "name", "ip", "schedule"
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

    // Save in our config obj
    config.machines[machineConfig.name.toLowerCase()] = machineConfig;
  });

  // All done
  return config;
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
 * Skips the machine specific configs.
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
 * Validate the current config options.
 */
function validateConfig(config, spec)
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
  // Now check machine configs for required / invalid parameters
  Object.keys(config.machines).forEach(function(machineName) {
    var machine = config.machines[machineName];
    // Check required
    SPEC.machines.required.forEach(function(option) {
      if (getValue(machine, option) === undefined)
        errs.push(`Machine '${machineName}' is missing required value '${option}'`);
    });

    // Look for invalid
    getKeyPaths(machine).forEach(function(setting) {
      if (!SPEC.machines.valid.includes(setting))
        errs.push(`Unknown option '${setting}' encountered in configuration for machine '${machineName}'`);
    });
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

  // TODO (all of these)
  // Verify machine schedules
  // Verify port is numeric
  // Verify notification emails are valid, in an []
  // Verify rsync.max_simultaneous is numeric

  // Verify the sms_to field is valid
  if (config.notifications.sms_to)
  {
    var smsTo = config.notifications.sms_to;
    // The recipient must be specified in one of two formats for SMS to configure properly.
    // NOTE: The following regex may change when/if AWS adds more regions or changes how the ARNs are generated
    if (smsTo.match(/^arn\:aws\:sns\:(us|ap|ca|eu|sa)\-(east|west|north|south|central|northeast|northwest|southwest|southeast)\-[1-3]\:\d{12}\:[a-zA-z\-\_\d]{1,256}/))
      config.notifications.sms_type = 'topicArn';
    // Phone number must be in E.164 format, with a leading country code (1-9) and max of 15 digits
    else if (smsTo.match(/^\+?[1-9]\d{10,14}$/))
      config.notifications.sms_type = 'phoneNum';
    else
    {
      errs.push('Invalid notifications sms recipient field.');
      config.notifications.sms_type = '';
    }
  }

  // Verify the AWS region is valid
  if (config.notifications.sms_region)
  {
    var region = config.notifications.sms_region;
    if (!region.match(/^(us|ap|ca|cn|eu|sa)\-(east|west|north|south|central|northeast|northwest|southeast|southwest)\-[1-3]$/))
    {
      errs.push('Invalid AWS region provided in notifications');
    }
  }

  if (errs.length > 0)
    throw new Error('Invalid configuration!\n\n' + errs.join('\n'));
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
    throw new Error('Config syntax error');

  // Loop defaults, adding properties that are missing, and merging in Objects
  for (var key in defaults)
  {
    if (defaults[key] instanceof Object)
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
}


/**
 * Module pattern
 */
module.exports = {
  getConfig: function(filename) {
    var config = readConfig(filename);
    addDefaults(defaults, config);
    validateConfig(config, SPEC);
    logging.configure(config);

    return (config);
  }
};
