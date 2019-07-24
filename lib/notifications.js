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
const logging = require('./config/log4js');
const logger = logging.getLogger();

let dispatchers = [];

module.exports = {
  init: (config) => {
    // Always include the console dispatcher
    dispatchers.push(require('./notifications/console')());
    
    try
    {
      if (config.notifications) 
      {
        let tag = config.notifications.tag;
        if (config.notifications.email_to && config.notifications.email_to.length > 0)
        {
          try
          {
            // Enable email dispatching
            const emailFrom = config.notifications.email_from;
            const emailTo = config.notifications.email_to;
            const smtp = config.notifications.smtp;
            dispatchers.push(require('./notifications/email')(tag, emailTo, emailFrom, smtp));
          }
          catch (error)
          {
            logger.error('Problem initializing the email notifications: ' + error.message);
            logger.debug(error.stack);
            logger.warn('Email notifications will not be sent until this is fixed and the system restarted.');
          }
        }
        // The following assumes that the provided config values are valid
        if (config.notifications.sms)
        {
          try
          {
            // Enable SMS dispatching
            const accessKeyId = config.notifications.sms.access_key;
            const secretAccessKey = config.notifications.sms.secret_key;
            const region = config.notifications.sms.aws_region;
            const smsTo = config.notifications.sms.sms_to;
            const smsType = config.notifications.sms.type;

            dispatchers.push(require('./notifications/sms')(smsTo, accessKeyId, secretAccessKey, region, smsType));
          }
          catch (error)
          {
            logger.error('Problem initializing the SMS notifications: ' + error.message);
            logger.debug(error.stack);
            logger.warn('SMS notifications will not be sent until this is fixed and the system restarted.');
          }
        }
        if (config.notifications.slack && config.notifications.slack.webhook)
        {
          dispatchers.push(require('./notifications/slack')(config.notifications.slack.webhook));
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
  dispatch: (message) => {
    dispatchers.forEach((dispatcher) => {
      logger.trace('Dispatching message via: "' + dispatcher.getName() + '"');
      dispatcher.send(message);
    });
  }
};
