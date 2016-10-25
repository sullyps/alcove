/**
 * Notifications system.
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
            var to = config.notifications.email_to;
            dispatchers.push(require('./notifications/email')(tag, to, from, smtp));
          }
          catch (error)
          {
            logger.error('Problem initializing the email notifications: ' + error.message);
            logger.debug(error.stack);
            logger.warn('Email notifications will not be sent until this is fixed and the system restarted.');
          }
        }
        if (config.notifications.sms_to && config.notifications.sms_to.length > 0)
        {
          try
          {
            // Enable SMS dispatching
            dispatchers.push(require('./notifications/sms')(tag, config.notifications.sms_to));
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
  dispatch: function(subject, message) {
    dispatchers.forEach(function(dispatcher) {
      logger.trace('Dispatching message via: "' + dispatcher.getName() + '"');
      dispatcher.send(subject, message);
    });
  }
}
