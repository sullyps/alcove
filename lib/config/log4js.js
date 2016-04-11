var log4js = require('log4js'),
    fs = require('fs-extra'),
    path = require('path');

var loggingLevel = 'DEBUG';

module.exports = {
  configure: function (config) {
    if (!fs.existsSync(config.environment.log_directory)) {
      fs.mkdirsSync(config.environment.log_directory);
    }
    log4js.configure({
      appenders: [
        {
          type: 'console'
        },
        {
          type: 'file',
          filename: 'backup-system.log',
          maxLogSize: 20480,
          backups: 3
        },
      ]
    }, {cwd: config.environment.log_directory});
    var logger = log4js.getLogger();

    // Set the logging level.
    logger.setLevel(loggingLevel);
    return logger;
  },
  logLevel: loggingLevel
};

