// Singleton
var EmailNotifier = null;

/**
 * Private initialization function
 */
function init()
{
  EmailNotifier = {
    getName: function() { return "email"; },
    send: function(subject, message) {
      console.log('TODO: email broadcast message');
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = function() {
  if (!EmailNotifier) init();
  return EmailNotifier;
};
