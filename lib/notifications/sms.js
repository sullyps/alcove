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


var sns = new AWS.SNS();
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

  // TODO: Determine if to will contain array of phone numbers or string value
  // containing aws topic
  // TODO: Check if each number in to array is subscribed to the topic
  // If not subscribed, add to topic if not at max subscribers
  // Note: went with to containing aws topic arn
  topic = to[0];

  SmsNotifier = {
    getName: function() { return 'sms'; },
    send: function(message) {
      var params = {
        Message: message.shortMessage,
        Subject: 'BackupSystem',
        TopicArn: topic,
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
