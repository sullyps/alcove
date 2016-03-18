conf = {
  retryFactor: 3,
  destinationDir: '/home/malyon/backupTest/',
  maxSimultaneousBackups: 4,
  notifiedEmailOnFailure: 'user@bioneos.com',
  smsNotifiedOnFailure: '',
  sendingEmail: 'info@bioneos.com',
  logLocation: '/path/to/logFile',
  dbLocation: '',
  sshKeysLocation: '/path/to/sshKeys'
}

module.exports = conf;
