var nodemailer = require('nodemailer');

var config = require('./config/config').environmentVar;

var transportOpt = {
  host: config.notifications.smtp.host,
  port: config.notifications.smtp.port,
  secure: config.notifications.smtp.secure,
  auth: {
    user: config.notifications.smtp.auth_user,
    pass: config.notifications.smtp.auth_pass
  }
};
var transporter = nodemailer.createTransport(transportOpt);

module.exports = emailDispatcher = {

  backupErrorEmail: function (machine, rsyncInfo, exitCode) {
    var mailOptions = {
      from: config.notifications.from_email_addr,
      to: config.notifications.receiving_email_addr.join(),
      subject: 'Error during backup process',
      text: 'While backing up the machine ' + machine.name + ' during a scheduled backup,' +
          ' rsync exited with code ' + exitCode + ' with the following error message.\n\n' + 
          rsyncInfo.stderr + '.\n' + 'The backup attempt occurred at ' + rsyncInfo.startTime + '.\n\n' +
          'Please resolve this issue before the next scheduled attempt.  You may be able to look in the log files to help ' +
          'resolve this problem.  Thank you.'
    }

    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.log(error);
      }
      else {
        console.log('Message sent:  ' + info.response);
      }
    });
  },

  backupSummaryEmail: function() {
    //TODO: Find all backup attempts from the database since the  last scheduled backup summary email.
    
    //TODO: Sort them by machine and date and perhaps list the ones that failed separately.

    // TODO: Set timeout until next backup summary email.
  }

  // TODO: add other email that is just a blanket error or other notification.
}
