'use strict';

var path = require('path'),
    fs = require('fs-extra'),
    ini = require('ini');
//wrap = require('word-wrap');

var logging = require('./log4js');
var defaults = require('./defaults');

var env = process.env.NODE_ENV || 'development';
var logger = logging.getLogger('config');


/**
 * Read the config files.
 * TODO: Allow this filename to be specified from the command line
 */
function readConfig(file)
{
  try
  {
    var filename = file || ((env == 'production') ? '/' : '') + 'etc/backup/backup.ini';
    fs.accessSync(filename, fs.F_OK);
  }
  catch (error)
  {
    // TODO: handle more appropriately
    if (error.code === "EACCES")
      throw new Error('Permission denied or file inaccessible:\n  ' + filename);
    else if (error.code === "ENOENT")
      throw new Error('File or path not found:\n  ' + filename);
    else
      throw new Error('Unknown error accessing file:\n  ' + error.message);
  }

  // Main config first
  try
  {
    var config = ini.parse(fs.readFileSync(filename, 'utf-8'));
  }
  catch (error)
  {
    if (error.code === "EISDIR")
      throw new Error('Directory specified instead of config file:\n  ' + filename);
    else if (error.code === "ENOENT")
      throw new Error('It doesn\'t appear that the specified file exists:\n  ' + filename);
    else
      // This rarely happens. In general I don't expect to ever see it...
      throw new Error('Parsing error (' + filename + '): ' + error.message);
  }

  // Machine specific second
  try
  {
    config.machines = {};
    var confDir = path.normalize(path.join(filename, '..'));
    var machineConfPath = path.join(confDir, 'machines');
    fs.accessSync(machineConfPath);

    // Attempt to isolate machine conf errors to specific files
    var machineConfs = fs.readdirSync(machineConfPath);
    machineConfs.forEach(function(file) {
      // Only process ".ini" files
      if (!file.match(/.+\.ini$/)) return;
      try
      {
        var filename = path.join(machineConfPath, file);
        var machineConfig = ini.parse(fs.readFileSync(filename, 'utf-8'));

        var machine = {
          schedule: machineConfig.schedule,
          name: machineConfig.name,
          ip: machineConfig.ip,
          inclusionPatterns: machineConfig.inclusionPatterns,
          exclusionPatterns: machineConfig.exclusionPatterns,
        };

        // Require name, ip, and schedule
        if (!machine.name || !machine.ip || !machine.schedule)
          throw new Error('Missing required options');

        // Abort on multiple machine definitions
        if (config.machines[machine.name])
          throw new Error('Multiple definitions for machine "' + machine.name + "'");

        // Save in our config obj
        config.machines[machine.name] = machine;
      }
      catch (error)
      {
        // TODO handle these the same as the above config parsing errors (main config)
        throw new Error('(' + filename + '): ' + error.message);
      }
    });
  }
  catch (error)
  {
    if (error.code === "EACCES")
      throw new Error('Permission denied on machine configuration files:\n  ' + machineConfPath);
    else if (error.code === "ENOENT")
      throw new Error('No directory found for machine configuration files:\n  ' + machineConfPath);
  }

  // All done
  return config;
}

/**
 * Validate the current config options.
 */
function validateConfig(config)
{
  // TODO: also report any "unknown" errors. Those entries that aren't
  // defined in our config spec. This will handle any config typo errors.
  var errs = [];

  // Validate some important configurations
  if (!config.ip) errs.push('You need to specify "ip" for the IP or domain to attach the webserver');
  if (!config.port) errs.push('You need to specify "port" for the webserver');
  if (!config.logs_dir) errs.push('You need to specify "logs_dir" for the logs directory');
  if (!config.data_dir) errs.push('You must specify the "data_dir"');
  if (!config.db) errs.push('You must specify the "db" filename for our Events DB');
  if ((config.secure) && (!config.secure.key || !config.secure.cert)) 
      errs.push('For HTTPS operation you must specify BOTH "secure.key" and "secure.cert"');

  // TODO (all of these)
  // Verify machine schedules
  // Verify port is numeric
  // Verify notification emails are valid, in an []
  // Verify notification SMSes are valid, in an []
  // Verify data_dir is accessible?
  // Verify rsync.max_simultaneous
  // Verify rsync.additional_args is an []
  // Verify rsync.ssh_key is defined (can be null)
  // Verify rsync.user is a non-empty string

  if (errs.length > 0)
    throw new Error('Invalid config file!\n\n' + errs.join('\n'));
}

/**
 * Add in the defaults from the first object, only if they are missing from
 * the second object.
 */
function addDefaults(def, target)
{
  if (typeof(def) === 'undefined')
    throw new Error('Defaults cannot be undefined');
  else if (def instanceof Object && typeof(target) !== 'undefined' && !(target instanceof Object))
    // Defaults defines a container where config defines a primitive
    // TODO: this is very hard to debug from this info. Might need to get smarter
    //    about this error message...
    throw new Error('Config syntax');

  // Loop defaults, adding properties that are missing, and merging in Objects
  for (var key in def)
  {
    if (def[key] instanceof Object)
    {
      // Ensure object
      if (target[key] === undefined) target[key] = {};
      // Recurse subcategory
      addDefaults(def[key], target[key]);
    }
    else if (target[key] === undefined)
    {
      // Copy in the defaults (non-objects)
      target[key] = def[key];
    }
  }
}


/**
 * Module pattern
 */
module.exports = {
  getConfig: function() {
    var config = readConfig();
    addDefaults(defaults[env], config);
    validateConfig(config);
    logging.configure(config);

    return (config);
  }
};
