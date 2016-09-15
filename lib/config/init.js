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
    throw new Error('File not found or not accessible (' + filename + '): ' + error.message);
  }

  try
  {
    var config = ini.parse(fs.readFileSync(filename, 'utf-8'));
    config.app = config.app || {};
    config.app.config = filename;
    return config;
  }
  catch (error)
  {
    throw new Error('Parsing error (' + filename + '): ' + error.message);
  }
}

/**
 * Validate the current config options.
 */
function validateConfig(config)
{
  var errs = [];

  // Validate some important configurations
  if (!config.ip) errs.push('You need to specify "ip" for the IP or domain to attach the webserver');
  if (!config.port) errs.push('You need to specify "port" for the webserver');
  if (!config.logs_dir) errs.push('You need to specify "logs_dir" for the logs directory');
  if (!config.data_dir) errs.push('You must specify the "data_dir"');
  if (!config.db) errs.push('You must specify the "db" filename for our Events DB');
  if ((config.secure) && (!config.secure.key || !config.secure.cert)) 
      errs.push('For HTTPS operation you must specify BOTH "secure.key" and "secure.cert"');

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
