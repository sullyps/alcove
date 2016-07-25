var nodemailer = require('nodemailer'),
    execSync = require('child_process').execSync,
    log4js = require('log4js');

var config = require('./config/config').environmentVar,
    db = require('../app/models');

console.log(config.notifications, config.notifications.smtp);
var transporter = nodemailer.createTransport(config.notifications.smtp || { direct: true });
var logger = log4js.getLogger();

transporter.verify(function (error, success) {
  if (error) {
    // If the email dispatcher is set to be used, throw an error.
    if (config.notifications.receive_email_notifications)
    {
      logger.error('Email transport unable to validate, check the config file to make sure all the email related ' +
          'smtp config parameters are correct.  Setting email notifications to false will turn this and email ' +
          'notifications off. Error: ' + error.message);
      process.exit(1);
    }
  }
  else {
    // TODO: send test email to make sure email addresses are correct?
    logger.info('Email smtp settings verified to be correct.');
  }
});

/**
 * Method that returns the size of the directory and it's contents as a string.
 */
function findFileSize(directory) {
  // FIXME: Make platform independent!!
  var stdoutBuff = execSync('du -s -c -h ' + directory);
  var stdout = stdoutBuff.toString();
  stdout = stdout.split('\n')[0];
  stdout = stdout.split(/\s+/)[0];
  return stdout;
}

/**
 * Method that returns the available disk space as a string.
 */
function findFreeSpace() {
  // FIXME: Make platform independent!!
  var stdoutBuff = execSync('df -h');
  var diskInfo = stdoutBuff.toString().split('\n');
  var freeSpace = diskInfo[1].split(/\s+/)[3];
  return freeSpace;
}

module.exports = emailDispatcher = {

  /**
   * Finds the next scheduled summary email time.
   * @param String schedule
   *   schedule definition as given by the form d,d,d,d;hh:mm
   *   with d representing the days of the week 0 Monday to 6 Saturday, hh:mm the time.
   *   There can be as few as one day and as many as 7
   * @param Date date
   *   Date that you wish to get the next backup summary email scheduled time.
   *
   */
  getNextSummaryEmailTime: function (schedule, date) {
    // Parse the schedule to determine when the next backup will be.
    schedule = schedule.split(';');
    var scheduledDays = [];
    var days = schedule[0].split(',');
    var scheduledHour = parseInt(schedule[1].split(':')[0]);
    var scheduledMin = parseInt(schedule[1].split(':')[1]);
    for (var i=0; i<days.length; i++) {
          scheduledDays.push(parseInt(days[i]));
    }

    // Sort the scheduledDays array in case the user defined the days out of order if there is more  than one.
    scheduledDays.sort();

    var day = date.getDay();
    var includeDay = (date.getHours() < scheduledHour ||  date.getHours() == scheduledHour &&
        date.getMinutes() < scheduledMin);

    var numberOfDaysFromDate;
    var found = false;
    for (var i=0; i<scheduledDays.length; i++) {
      if (scheduledDays[i] > day || (scheduledDays[i] == day && includeDay)) {
        numberOfDaysFromDate = scheduledDays[i] - day;
        logger.debug('Number of days from date inside for loop: ' + numberOfDaysFromDate);
        logger.debug('GetNextSummaryEmailTime found = true');
        found = true;
        break;
      }
    }
    if (!found) { numberOfDaysFromDate = 7 - day + scheduledDays[0]; }

    logger.debug('Setting summary email for ' + numberOfDaysFromDate + ' days from now.');

    var nextEmailTime = new Date(date.toString());
    nextEmailTime.setDate( date.getDate() + numberOfDaysFromDate );
    nextEmailTime.setHours(scheduledHour);
    nextEmailTime.setMinutes(scheduledMin);
    nextEmailTime.setSeconds(0);
    nextEmailTime.setMilliseconds(0);
    logger.debug('Next Email Time: ' + nextEmailTime);
    return nextEmailTime;
  },
 /**
  * Finds the last scheduled time from the date given with the schedule
  * given in the form of d,d,d,d;hh:mm
  * with d representing the days of the week 0 Monday to 6 Saturday, hh:mm the time.
  * @param schedule
  *   the string schedule defined in by the config files.
  * @param date
  *   date from which to find the summary email event directly prior.
  */
  getLastSummaryEmailTime: function (schedule, date) {
    schedule = schedule.split(';');
    var scheduledDays = schedule[0].split(',');
    var scheduledHour = schedule[1].split(':')[0];
    var scheduledMin = schedule[1].split(':')[1];
    var day = date.getDay();

    var includeDay = (date.getHours() > scheduledHour ||  date.getHours() == scheduledHour &&
        date.getMinutes() > scheduledMin);

    var numberOfDaysAgo;
    var found = false;
    for (var i=scheduledDays.length-1; i>=0; i--) {
      if (scheduledDays[i] < day || (scheduledDays[i] == day && includeDay)) {
        numberOfDaysAgo = day - scheduledDays[i];
        found = true;
        break;
      }
    }
    if (!found) {
      numberOfDaysAgo = day + 7 - scheduledDays[scheduledDays.length-1];
    }

    var lastEmailTime = new Date(date.toString());
    lastEmailTime.setDate( date.getDate() - numberOfDaysAgo );
    lastEmailTime.setHours(scheduledHour);
    lastEmailTime.setMinutes(scheduledMin);
    lastEmailTime.setSeconds(0);
    lastEmailTime.setMilliseconds(0);
    return lastEmailTime;
  },


  /**
   * Method to set up the email in the case that there is an error while
   *     backing up a machine
   * @param machine
   *     The object of the machine that had the error backing up.
   * @param rsyncInfo
   *     Any info that we got while trying to backup the machine.
   * @param exitCode
   *     The exit code received from rsync.
   */
  backupErrorEmail: function (machine, rsyncInfo, exitCode) {
    var mailOptions = {
      from: config.notifications.from_email_addr,
      to: config.notifications.receiving_email_addr.join(),
      subject: 'Error during backup process (Do not reply)',
      html: '<p>While backing up the machine ' + machine.name + ' during a scheduled backup,' +
          ' rsync exited with code <em>' + exitCode + '</em> with the following error message:<p style="color:red;">' +
          rsyncInfo.stderr.replace(/\n/g,'<br>') + '</p><br>' + 'The backup attempt occurred on <b>' + rsyncInfo.startTime + '</b>.<br>' +
          'Please resolve this issue before the next scheduled attempt.  You may be able to look in the log files to help ' +
          'resolve this problem.</p>'
    }

    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        logger.error('Error sending error email:' + error);
      }
      else {
        logger.info('Error message sent:  ' + info.response);
      }
    });
  },

  /**
   * Method for sending out the weekly summary email.
   *   Finds the date of the last scheduled summary and gets lists all
   *   backups that have occurred since then and other useful information.
   *   Occurs based off of the email summary schedule in the config file.
   */
  backupSummaryEmail: function() {
    var backupsDirSize = findFileSize(config.rsync.destination_dir);
    var freeSpace = findFreeSpace();
    logger.info('Summary of backups since the last summary:')
    logger.info('  Total Size of all Backups = ' + backupsDirSize);
    logger.info('  Remaining space on disk = ' + freeSpace);

    var summarySchedule = config.notifications.summary_email_sched;
    var lastSummaryDate = emailDispatcher.getLastSummaryEmailTime(summarySchedule, new Date(Date.now()));

    logger.debug('Getting all backup events since ' + lastSummaryDate);

    db.BackupEvent.findAll({
     where: {
       backupTime: {
         gt: lastSummaryDate
       }
     }
    }).then(function(backupEvents) {
      var machines = system.getApp().locals.machines;
      var emailSummary = '';
      emailSummary +=
          'Backups Summary\n' +
          '  Total size of all backups: '+ backupsDirSize+ '\n' +
          '  Disk space remaining: '+ freeSpace+ '\n\n';
      for (var i=0; i<machines.length; i++) {
        var machine = machines[i];
        emailSummary += machine.name + ':\n'

        for (var j=0; j<backupEvents.length; j++) {
          var data = backupEvents[j].dataValues;
          if (data.machine === machine.name) {
            emailSummary +=
                '  ' + data.backupTime + '\n' +
                '    rsync exit code: ' + data.rsyncExitCode + '\n' +
                '    Transfer time: ' + (data.transferTimeSec/60).toFixed(2) + ' minutes\n' +
                '    Transfer size: ' + (data.transferSize/(1024*1024*1024)).toFixed(2) + ' GB\n';
          }
        }
        emailSummary += '\n'
      }

      logger.debug('Number of machines: ' + machines.length);

      logger.info('Backups Summary: ' + emailSummary);

      var mailOptions = {
        from: config.notifications.from_email_addr,
        to: config.notifications.receiving_email_addr.join(),
        subject: 'Backups Summary (Do not reply)',
        text: emailSummary
      };

      if (config.notifications.receive_email_notifications) {
        logger.info("SENDING SUMMARY EMAIL...");
        transporter.sendMail(mailOptions, function(error, info) {
          if (error) {
            logger.error('Error sending summary email: ' + error);
          }
          else {
            logger.info('Summary email sent:  ' + info.response);
          }
        });
      }
    }).catch(function (err) {
      logger.error('Error getting backup events from database: ' + err);
    });

    var currentTime = new Date(Date.now());
    var nextSummaryTime =  emailDispatcher.getNextSummaryEmailTime(summarySchedule, currentTime);

    logger.info('next Time: ' + nextSummaryTime);
    logger.info('current Time: ' + currentTime);
    logger.info('Setting timeout for ' + (nextSummaryTime.getTime() - currentTime.getTime()) + ' ms');
    setTimeout(function() { emailDispatcher.backupSummaryEmail()}, nextSummaryTime.getTime() - currentTime.getTime());
  },

  /**
   * Method as a generic system email in case of a thrown error in different parts of the
   *   system.  Specifically for emails that just require the error message and not additional
   *   information.
   * @param subject
   *     the subject line of the email
   * @param message
   *     the body of the email message to send.
   */
  systemEmail: function(subject, message) {
    var mailOptions = {
      from: config.notifications.from_email_addr,
      to: config.notifications.receiving_email_addr.join(),
      subject: subject,
      text: message
    };
    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        logger.error('Error sending email, please check config.notifications config.notifications.smtp settings.' +
            '\nError: ' + error.message);
      }
      else {
        logger.info('Error message sent:  ' + info.response);
      }
    });
  }
}
