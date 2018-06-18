/**
 * Notifications system.
 *
 * This modularized system accepts messages for dispatch and sends them to all
 * registered notification mechanisms. The dispath method expects an Object
 * with the following properties
 *
 * notifications.dispatch({
 *   subject - "shortest text" 
 *   shortMessage - "140 char or less"
 *   longMessage - "text format detailed message"
 *   htmlMessage - "html styled long message"
 * });
 *
 * Each dispatcher will choose the appropriate message for its method of 
 * delivery, and will ignore the unused parts. Therefore, it is up to the
 * caller to ensure enough data is included in all message formats so that the
 * audience can take appropriate measures.
 */
var logging = require('./config/log4js');
var logger = logging.getLogger();

var dispatchers = [];

module.exports = {
  init: function(config) {
    // Always include the console dispatcher
    dispatchers.push(require('./notifications/console')());
    
    try
    {
      if (config.notifications) 
      {
        var tag = config.notifications.tag;
        if (config.notifications.email_to && config.notifications.email_to.length > 0)
        {
          try
          {
            // Enable email dispatching
            var from = config.notifications.email_from;
            var smtp = config.notifications.email_smtp;
            var emailTo = config.notifications.email_to;
            dispatchers.push(require('./notifications/email')(tag, emailTo, from, smtp));
          }
          catch (error)
          {
            logger.error('Problem initializing the email notifications: ' + error.message);
            logger.debug(error.stack);
            logger.warn('Email notifications will not be sent until this is fixed and the system restarted.');
          }
        }
        // The following assumes that the provided config values are valid
        if (config.notifications.sms_to && config.notifications.sms_accessKey && 
            config.notifications.sms_secretKey && config.notifications.sms_region
            && config.notifications.sms_type)
        {
          try
          {
            // Enable SMS dispatching
            var accessKeyId = config.notifications.sms_accessKey;
            var secretAccessKey = config.notifications.sms_secretKey;
            var region = config.notifications.sms_region;
            var smsTo = config.notifications.sms_to;
            var smsType = config.notifications.sms_type;

            dispatchers.push(require('./notifications/sms')(smsTo, accessKeyId, secretAccessKey, region, smsType));
          }
          catch (error)
          {
            logger.error('Problem initializing the SMS notifications: ' + error.message);
            logger.debug(error.stack);
            logger.warn('SMS notifications will not be sent until this is fixed and the system restarted.');
          }
        }
      }
    }
    catch (error)
    {
      logger.error('Unexpected problem initializing the notifications sub-system: ' + error.message);
      logger.debug(error.stack);
      logger.warn('Until this error is corrected and the system is restarted, ' + 
          'notifications will only occur on the console');
    }
  },
  dispatch: function(message) {
    dispatchers.forEach(function(dispatcher) {
      logger.trace('Dispatching message via: "' + dispatcher.getName() + '"');
      dispatcher.send(message);
    });
  }
}
