var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env = process.env.NODE_ENV || 'development';

var config = {
  development: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    db: 'sqlite://localhost/backup-development',
    storage: rootPath + '/data/backup-development'
  },

  test: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    db: 'sqlite://localhost/backup-test',
    storage: rootPath + '/data/backup-test'
  },

  production: {
    root: rootPath,
    app: {
      name: 'backup'
    },
    port: 3443,
    auth: rootPath + '/resources/htpassword',
    db: 'sqlite://localhost/backup-production',
    storage: rootPath + '/data/backup-production'
  }
};

module.exports = config[env];
