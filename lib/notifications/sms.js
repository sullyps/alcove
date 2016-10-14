// Singleton
var SmsNotifier = null;

/**
 * Private initialization function
 */
function init()
{
  SmsNotifier = {
    getName: function() { return "sms"; },
    send: function(subject, message) {
      console.log('TODO: SMS broadcast message');
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function() {
  if (!SmsNotifier) init();
  return SmsNotifier;
};
