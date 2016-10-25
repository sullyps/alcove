// NOTE: for testing only! This module is definitely less than robust, and a
// truly viable solution for this system should be implemented with something
// like Twilio or another other provider.
var log4js = require('log4js'),
    textbelt = require('textbelt');

// Singleton
var SmsNotifier = null;
// Logger
var logger = log4js.getLogger('sms');

var opts = {};
var toSms = [];

/**
 * Private initialization function
 */
function init(from, to)
{
  logger.debug('Initializing SMS notifications');

  opts.fromAddr = from;
  opts.fromName = 'BackupSystem';
  opts.region = 'us';
  if (Array.isArray(to) && to.length > 0)
  {
    to.forEach(function(possiblePhone) {
      if (possiblePhone.match(/^\d+$/)) toSms.push(possiblePhone);
      else logger.error('Invalid destination phone number (use only digits): ' + possiblePhone);
    });
  }
  else
  {
    logger.warn('SMS notifications configured without any destinations...');
  }


  SmsNotifier = {
    getName: function() { return "sms"; },
    send: function(subject, message) {
      toSms.forEach(function(phone) {
        textbelt.sendText(phone, '[' + subject + '] ' + message, opts, function(err) {
          if (err) 
          {
            logger.error('Error delivering notification via SMS: ' + err.message);
            logger.debug(err.stack);
            return;
          }

          logger.debug('Successfully delivered notification to ' + phone);
        });
      });
    }
  };
  logger.debug('SMS notifications initialized');
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function(from, to) {
  if (!SmsNotifier) init(from, to);
  return SmsNotifier;
};
