var nodemailer = require('nodemailer'),
    util = require('util'),
    log4js = require('log4js');
// Singleton
var EmailNotifier = null;
// Logger
var logger = log4js.getLogger('email');
// Other local variables
var transporter;
var subjectTag = '';
var fromEmail = 'backup';
var toEmails = [];
var smtpHost = '';

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
  if (Array.isArray(to) && to.length > 0)
  {
    to.forEach(function(possibleEmail) {
      if (validEmail(possibleEmail)) toEmails.push(possibleEmail);
      else logger.error('Invalid destination email address: ' + possibleEmail);
    });
  }
  else if (!Array.isArray(to))
  {
    logger.warn('Email notifications configured without any destinations...');
  }
  if (validEmail(from)) fromEmail = from;
  else logger.error('Invalid FROM email address: ' + from);
  if (smtp) smtpHost = {host: smtp};
  else smtpHost = {sendmail: true};

  // Test transport (throw errors if needed)
  transporter = nodemailer.createTransport(smtpHost);
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
  transporter.verify(function (error, success) {
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
    getName: function() { return 'email'; },
    send: performSend
  };
  // NOTE: When "sendmail: true", nodemailer.verify() doesn't appear to return
  if (smtpHost.sendmail) EmailNotifier.verified = true;

  logger.debug('Email notifications initialized, but verification of settings not yet completed');
  logger.debug('  host: ' + ((smtpHost.host) ? smtpHost.host : 'piped to sendmail executable'));
  logger.debug('  from: ' + fromEmail);
  logger.debug('  to:   [' + toEmails.join(', ') + ']');
  if (subjectTag)
    logger.debug('  tag:  ' + subjectTag);
}

/**
 * Private method to perform actual emailing.
 */
function performSend(subject, message)
{
  if (EmailNotifier.failed)
    return logger.warn('No emails are being sent. Attempted to send email notification, ' + 
        'but settings validation had failed during startup...');
  else if (!EmailNotifier.verified)
    return logger.warn('Attempted to send an email but settings have not yet been verified.');

  // Send message
  transporter.sendMail({
    from: fromEmail,
    to: toEmails.join(', '),
    subject: subjectTag + subject,
    // TODO: How can we process this to HTML generically? Can we?
    html: message
  }, function(error, info) {
    if (error)
    {
      logger.error('There was problem sending a notification via email: ' + error.message);
      logger.debug(error.stack);
      return;
    }

    // Success
    logger.debug('Email sent to [' + toEmails.join(', ') + ']: "' + subjectTag + subject + '"');
    logger.trace(util.inspect(info));
  });
}

/**
 * Private helper to ensure valid email addresses
 * Borrowed: http://stackoverflow.com/questions/46155/validate-email-address-in-javascript
 */
function validEmail(email) 
{
  var re = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;
  return re.test(email);
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function(tag, to, from, smtp) {
  if (!EmailNotifier) init(tag, to, from, smtp);
  return EmailNotifier;
};
