'use strict';
const log4js = require('log4js'),
    fs = require('fs-extra'),
    path = require('path');

// New 2.x API allows for much less programmatic access, so all configuration
// must be determined before requiring this module, and configuration should
// be passed into the object.

module.exports = {
  /**
   * Allow for reconfiguring the initial Logger to add in file logging as
   * specified in the configuration files.
   */
  configure: (config) => {
    // Ensure logging directory (errors will be thrown)
    let logPath;
    try
    {
      if (config.log_dir !== undefined)
      {
        logPath = (config.log_dir[0] === '/') ? config.log_dir : path.join(config.app.root, config.log_dir);
        fs.mkdirpSync(logPath);
      }
    }
    catch (error)
    {
      if (error.code === "EACCES")
        throw new Error(`Permission denied on logs directory (${logPath})`);
      else 
        throw new Error(`Unexpected error ensuring logs directory (${logPath}): ${error.message}`);
    }

    // Configure everything
    // Appenders
    const fileAppenderFactory = (name) => {
      return {
        type: 'file',
        filename: path.join(logPath, name + '.log'),
        maxLogSize: 10240,
        backups: 7,
        compress: true,
        keepFileExt: true
      };
    };
    let appenders = {
      console: { type: 'console' },
      backup: fileAppenderFactory('backup')
    };

    // Categories
    const categoryFactory = (name) => { 
      return (process.env.NODE_ENV !== "production") ? 
        { appenders: [ name, 'console' ], level: config.log_level } : 
        { appenders: [ name ], level: config.log_level };
    }
    let categories = {
      default: categoryFactory('backup')
    };
    
    // Now add all machine backup logs as separate appenders & categories
    Object.keys(config.machines).forEach((name) => {
      appenders[name] = fileAppenderFactory(name),
      categories[name] = categoryFactory(name)
    });

    // Done!
    log4js.configure({ appenders: appenders, categories: categories });

    // NOTE: This is purely a developer convenience...
    // This isn't really supported by log4js anymore, but should be okay. Replace the
    // console loggers with log4js.
    const logger = log4js.getLogger('console');
    if (process.env.NODE_ENV !== "production") 
    {
      console.log = logger.info.bind(logger);
      console.debug = logger.debug.bind(logger);
      console.error = logger.error.bind(logger);
      console.warn = logger.warn.bind(logger);
      logger.debug('Replaced console with log4js logger (May not be supported, use at your own risk)');
    }
  },
  /**
   * Pass through calls for loggers, so both modules don't have to be
   * referenced in any files.
   */ 
  getLogger: log4js.getLogger
};

