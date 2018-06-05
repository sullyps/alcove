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
function init(to, key, secret, region)
{
  logger.debug('Initializing SMS notifications');

  AWS.config.update({
    accessKeyId: key,
    secretAccessKey: secret,
    region: region,
  });

  // initialize sns object after configuration
  sns = new AWS.SNS();

  var which = '';

  if (to.match(/arn\:aws\:sns\:(us|ap|ca|eu|sa)\-(east|west|north|south|central|   northeast|northwest|southwest|southeast)\-\d\:\d{12}\:[a-z\-]+/))
  {
    which = 'topicArn';
  }
  else if (to.match(/^\d{10}/))
  {
    which = 'phoneNum';
  }
  logger.debug('Trying to send SMS to: ' + to);
  logger.debug('Which service = ' + which);
  SmsNotifier = {
    getName: function() { return 'sms'; },
    send: function(message) {
      var params = {
        Message: message.shortMessage,
        // TODO: Subject does not appear in text messages
        Subject: message.subject,
        TopicArn: (which === 'topicArn' ? to : undefined),
        PhoneNumber: (which === 'phoneNum' ? to : undefined),
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
module.exports = function(to, key, secretKey, region) {
  if (!SmsNotifier) init(to, key, secretKey, region);
  return SmsNotifier;
};
