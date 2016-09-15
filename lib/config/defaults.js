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
      additional_args: [],
      ssh_key: null,
      user: 'root',
      retry: {
        max_attempts: 4,
        multiplier: 3,
        time: 3
      }
    },

    notifications: {
      from_email_addr: 'backups@example.com',
      email_subject: '[BackupSystem]',
      smtp_host: 'localhost',
      
      to_email_addr: [],
      to_sms_addr: [],   
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
    summary: '1;8:00'
  }
};

module.exports = DEFAULTS;
