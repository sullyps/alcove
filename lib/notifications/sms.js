var log4js = require('log4js'),
  AWS = require('aws-sdk');

// Singleton
var SmsNotifier = null;
// Logger
var logger = log4js.getLogger('sms');

var sns;

/**
 * Private initialization function.
 */
function init(to, key, secret, region, type)
{
  logger.debug('Initializing SMS notifications');

  AWS.config.update({
    accessKeyId: key,
    secretAccessKey: secret,
    region: region,
  });

  // initialize sns object after configuration
  sns = new AWS.SNS();

  logger.debug('Trying to send SMS to: ' + to);
  logger.debug('Type of sms service = ' + type);
  SmsNotifier = {
    getName: function() { return 'sms'; },
    send: function(message) {
      var params = {
        Message: message.shortMessage,
        // TODO: Subject does not appear in text messages
        Subject: message.subject,
        TopicArn: (type === 'topicArn' ? to : undefined),
        PhoneNumber: (type === 'phoneNum' ? to : undefined),
      };
      sns.publish(params, function(err, data) {
        if (err)
        {
          logger.error('Error delivering notification via SMS: ' + err.message);
          logger.debug(err.stack);
          return;
        }

        logger.debug('Successfully delivered notification to ' + to);
      });
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function(to, key, secretKey, region, type) {
  if (!SmsNotifier) init(to, key, secretKey, region, type);
  return SmsNotifier;
};
