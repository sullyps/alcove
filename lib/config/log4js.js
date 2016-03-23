var log4js = require('log4js');
var fs = require('fs-extra');

module.exports = function(config) {
  if (!fs.existsSync(config.logs)) {
    fs.mkdirsSync(config.logs);
  }
  log4js.configure({
    type: 'clustered',
    appenders: [
      {
        type: 'console'
      },
      {
        type: 'file',
        filename: config.app.name + '.log',
        maxLogSize: 20480,
        backups: 3,
        level: 'DEBUG'
      },
    ]
  }, {cwd: config.logs});

  var logger = log4js.getLogger();

  return logger;
};

