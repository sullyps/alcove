const nodemailer = require('nodemailer'),
    util = require('util'),
    log4js = require('log4js');
// Singleton
let EmailNotifier = null;
// Logger
const logger = log4js.getLogger('email');
// Other local variables
let transporter;
let subjectTag = '';
let fromEmail = '';
let toEmails = [];
let transport = '';

/**
 * Private initialization function.
 * 
 * @throws
 *   Errors if email transport fails.
 */
function init(tag, to, from, smtp)
{
  // Initialize all variables with some sane defaults
  logger.debug('Initializing email notifications...');
  subjectTag = tag || '';
  if (subjectTag) subjectTag = '[' + subjectTag + '] ';
  if (!Array.isArray(to) || to.length === 0)
  {
    EmailNotifier = { failed: true };
    return logger.warn('Email notifications configured without any destinations... Not sending any emails!');
  }

  // Save source and destination emails
  toEmails = to;
  fromEmail = from;

  // Select the transportation type based on the config
  if (smtp)
  {
    transport = { host: smtp.host };

    // Add the appropriate port / secure values
    if (smtp.hasOwnProperty('port') && smtp.port === 465)
    {
      transport.port = smtp.port;
      transport.secure = true;
    }
    else if (smtp.hasOwnProperty('port'))
    {
      transport.port = smtp.port;
      transport.secure = false;
    }
    else
    {
      transport.port = 587;
      transport.secure = false;
    }

    // Add user auth
    if (smtp.hasOwnProperty('user') && smtp.hasOwnProperty('pass'))
    {
      transport.auth = {
        user: smtp.user,
        pass: smtp.pass
      };
    }
  }
  else
  {
    transport = { sendmail: true };
  }

  // Test transport (throw errors if needed)
  transporter = nodemailer.createTransport(transport);
  // NOTE: There are several ways to handle this async call
  //   1) We could change the call for all notifications to be async, and 
  //      completed within a Promise chain.
  //   2) We could try something more ES2016 like (await)
  //   3) We could allow this to complete async, and in the interim the email
  //      behavior could be undefined, then handle appropriately after.
  //   4) We could skip verification, until the first attempted email, then
  //      mark the status at that time.
  // Currently implemented #3, but we can revisit this, even just as a good
  // design discussion on sync/async pros and cons, given different reqs.
  // 
  // This decision does make it important to ensure that dirty shutdown
  // detection must be delayed after startup, if sending that notification via
  // email is important. Or messages could be queued while waiting for the
  // verification process to complete.
  transporter.verify((error, success) => {
    if (error)
    {
      EmailNotifier.failed = true;
      logger.error('Email transport verification failed. Error: ' + error.message);
      logger.debug(error.stack);
    }
    else
    {
      EmailNotifier.verified = true;
      logger.debug('Email transport verified!');
    }
  });


  //
  // Finally, create our singleton 
  EmailNotifier = {
    getName: () => { return 'email'; },
    send: performSend
  };
  // NOTE: When "sendmail: true", nodemailer.verify() doesn't appear to return
  if (transport.sendmail) EmailNotifier.verified = true;

  logger.debug('Email notifications initialized, but verification of settings not yet completed');
  logger.debug('  transport: ' + ((transport.host) ? ('smtp through ' + transport.host) : 'piped to sendmail executable'));
  logger.debug('  from     : ' + fromEmail);
  logger.debug('  to       : [' + toEmails.join(', ') + ']');
  if (subjectTag)
    logger.debug('  tag:  ' + subjectTag);
}

/**
 * Private method to perform actual emailing.
 */
function performSend(message)
{
  if (EmailNotifier.failed)
    return logger.warn('No emails are being sent. Attempted to send email notification, ' + 
        'but settings validation had failed during startup...');
  else if (!EmailNotifier.verified)
    logger.warn('Attempted to send an email but settings have not yet been verified.');

  // Send message
  transporter.sendMail({
    from: fromEmail,
    to: toEmails.join(', '),
    subject: subjectTag + message.subject,
    html: message.htmlMessage,
    text: message.longMessage
  }, (error, info) => {
    if (error)
    {
      logger.error('There was problem sending a notification via email: ' + error.message);
      logger.debug(error.stack);
      return;
    }

    // Success
    logger.debug('Email sent to [' + toEmails.join(', ') + ']: "' + subjectTag + message.subject + '"');
    logger.trace(util.inspect(info));
  });
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = (tag, to, from, smtp) => {
  if (!EmailNotifier) init(tag, to, from, smtp);
  return EmailNotifier;
};
