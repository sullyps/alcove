conf = {
  retryFactor: 3,
  // Where the backups will be stored.
  destinationDir: '/path/to/directory/',
  // Max number of backups to perform at one time to not bog down the server
  maxSimultaneousBackups: 4,
  
  // Email to notify if there is a failure in the backup process.
  notifiedEmailOnFailure: 'user@bioneos.com'

  // SMS location notified if there is a failure backing up.
  smsNotifiedOnFailure: '',

  // Email address to send the notifying email from
  sendingEmail: 'info@bioneos.com',

  // Path to the location to store the log files
  logLocation: '/path/to/logFile',

  // Location of the database to store crucial information.
  dbLocation: '',

  // Path to the location of the ssh keys to access the machines backing up.
  sshKeysLocation: '/path/to/sshKeys'
}

module.exports = conf;
