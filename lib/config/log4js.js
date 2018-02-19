'use strict';
var log4js = require('log4js'),
    fs = require('fs-extra'),
    path = require('path');

// Track our application log dest
var logDir;

// FIXME Remove this ENV control 
var env = process.env.NODE_ENV || "development";
// Allow shell environment overrides for logging level (should we remove this?)
var loggingLevel = process.env.LOGGING_LEVEL || ((env === 'development') ? 'DEBUG' : 'INFO');

// Instantiate the application logger
// TODO Explicitly do this externally (will be easier to migrate to newer versions of log4js anyway)
if (env === 'development')
{
  // When in 'development' mode adjust the logger config to help debug
  // Add 1) a console logger appender, and 2) replace console.log() 
  log4js.configure({
    appenders: [
      { type: 'console' }
    ],
    replaceConsole: true
  });
}
else
{
  // No console logger appenders in production mode
  log4js.configure({ appenders: [] });
}

// Setup the application Logger
var logger = log4js.getLogger();
logger.setLevel(loggingLevel);

logger.trace('Logger instantiated with log level ' + loggingLevel);



module.exports = {
  /**
   * Allow for reconfiguring the initial Logger to add in file logging as
   * specified in the configuration files.
   */
  configure: function(config) {
    // Override our default log level, unless it was set in the env
    var logger = log4js.getLogger();
    loggingLevel = process.env.LOGGING_LEVEL || config.log_level;
    logger.setLevel(loggingLevel);

    // Ensure logging directory (errors will be thrown)
    try
    {
      fs.mkdirpSync(config.logs_dir);
    }
    catch(error)
    {
      throw new Error('Error with specified logging directory "' +
        config.logs_dir + '": ' + error.message);
    }

    // Add file based appender
    log4js.loadAppender('file');
    log4js.addAppender(log4js.appenders.file(path.join(config.logs_dir, 'backup-system.log'),
          null, 10240, 7, true));

    // Track our configured log destination
    logDir = config.logs_dir;
  },
  /**
   * Pass through calls for loggers, so both modules don't have to be
   * referenced in any files.
   */
  getLogger: log4js.getLogger,
  /**
   * Add a File appender for a new machine category. Once configured, the
   * Logger isn't removed even if the machine is removed as it won't provide
   * any overhead and will be removed at next system restart.
   */
  addMachine: function(machine) {
    if (!logDir) return;

    log4js.addAppender(log4js.appenders.file(path.join(logDir, machine.name + '.log'),
          null, 10240, 5, true), machine.name);
    log4js.getLogger(machine.name).setLevel(loggingLevel);
  },
};

