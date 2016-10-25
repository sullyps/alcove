const path = require('path');
const version = require('../../package.json').version;

// Default environment configuration values.
const ROOT_PATH = path.normalize(__dirname + '/../..');
const DEFAULTS = {
  development: {
    app: {
      name: 'Bio::Neos Backup System',
      version: version,
      root: ROOT_PATH
    },

    ip: '0.0.0.0',
    port: 4567,
    db: 'events-devel.db',
    data_dir: path.join(ROOT_PATH, 'data'),
    logs_dir: path.join(ROOT_PATH, 'logs'),
    summary: '1;8:00',

    //secure: {
    //  key: path.join(ROOT_PATH, 'etc/backup/secure/key',
    //  cert: path.join(ROOT_PATH, 'etc/backup/secure/cert',
    //},

    rsync: {
      max_simultaneous: 3,
      additional_args: [],
      ssh_key: null,
      user: 'root',
      retry: {
        max_attempts: 4,
        multiplier: 3,
        // In minutes
        time: 3
      }
    },

    notifications: {
      tag: 'BackupSystem',
      
      email_from: 'backups@example.com',
      email_to: [],

      sms_from: 'backups@example.com',
      sms_to: []
    }
  },

  // TODO (we will adjust from development once unit testing is ready
  test: {},

  // Minimal defaults for production:
  // This intentially will not pass as a valid configuration
  production: {
    app: {
      name: 'Bio::Neos Backup System',
      version: version,
      root: ROOT_PATH
    },
    ip: '127.0.0.1',
    port: 4567,
    db: 'events.db',
    data_dir: path.join(ROOT_PATH, 'data'),
    logs_dir: path.join(ROOT_PATH, 'logs'),
    summary: '1;8:00',
    
    rsync: {
      max_simultaneous: 0,
      additional_args: [],
      ssh_key: null,
      user: 'root'
    }
  }
};

module.exports = DEFAULTS;
