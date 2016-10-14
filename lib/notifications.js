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
          // Enable email dispatching
          var from = config.notifications.email_from || "root";
          var smtp = config.notifications.email_smtp || "localhost";
          var to = config.notifications.email_to;
          dispatchers.push(require('./notifications/email')(tag, to, from, smtp));
        }
        if (config.notifications.sms_to && config.notifications.sms_to.length > 0)
        {
          // Enable SMS dispatching
          dispatchers.push(require('./notifications/sms')(tag, config.notifications.sms_to));
        }
      }
    }
    catch (error)
    {
      logger.error('Problems initializing the notifications sub-system: ' + error.message);
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
