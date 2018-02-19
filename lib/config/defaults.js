const path = require('path');
const version = require('../../package.json').version;

// Default environment configuration values.
const ROOT_PATH = path.normalize(__dirname + '/../..');
const DEFAULTS = {
  app: {
    name: 'Bio::Neos Backup System',
    version: version,
    root: ROOT_PATH
  },
  ip: '127.0.0.1',
  port: 4567,
  logs_dir: path.join(ROOT_PATH, 'logs'),
  
  rsync: {
    max_simultaneous: 6,
    user: 'root',
    retry: {
      max_attempts: 6,
      time: 3
    }
  },

  notifications: {
    summary_sched: '1;8:00',
    smtp: {
      host: "127.0.0.1",
      port: 25
    }
  }
};

module.exports = DEFAULTS;
