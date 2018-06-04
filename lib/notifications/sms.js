var log4js = require('log4js'),
  AWS = require('aws-sdk');

// Singleton
var SmsNotifier = null;
// Logger
var logger = log4js.getLogger('sms');

var smsAttributes = new Map();

// to send a sms to multiple phone numbers, each phone number should be
// subscribed to a specific Amazon Resource Number (ARN) topic
var topic = '';

AWS.config.update({
  // AWS username
  accessKeyId: '{AWS_KEY}',
  // AWS password
  secretAccessKey: '{AWS_SECRET}',
  // closest region that supports SMS messaging
  region: '{AWS_REGION}',
});


var sns;
/**
 * Private initialization function.
 */
function init(from, to)
{
  logger.debug('Initializing SMS notifications');

  smsAttributes.set('AWS.SNS.SMS.SenderID', from);
  // Don't send messages that cost more than 2 cents
  smsAttributes.set('AWS.SNS.SMS.MaxPrice', .02);
  smsAttributes.set('AWS.SNS.SMS.SMSType', "Promotional");

  SmsNotifier = {
    getName: function() { return 'sms'; },
    send: function(message) {
      var params = {
        Message: message.shortMessage,
        // FIXME: Subject does not appear in text messages
        Subject: message.subject,
        if (topic.matches(/aws\:arn\:sns\:(us|ap|ca|eu|sa)\-(east|west|north|south|central|northeast|northwest|southwest|southeast)\-\d\:\d{12}\:[a-z\-]+))
        {
          TopicArn: to,
        }
        else if (topic.matches(/^\d{10}))
        {
          PhoneNumber: to,
        }
        MessageAttributes: smsAttributes,
      };
      sns.publish(params, function(err, data) {
        if (err)
        {
          logger.error('Error delivering notification via SMS: ' + err.message);
          logger.debug(err.stack);
          return;
        }

        logger.debug('Successfully delivered notification to ' + topic);
      });
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function(from, to) {
  if (!SmsNotifier) init(from, to);
  return SmsNotifier;
};
