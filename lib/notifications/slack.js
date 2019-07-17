const log4js = require('log4js');
const logger = log4js.getLogger('slack');
const request = require('request');

// Singleton
let SlackNotifier = null;

/**
 * Private initialization function
 */
function init(webhook)
{
  logger.debug('Initializing Slack notifications...');
  logger.debug(`POST requests will be sent to the following Slack WebHook: ${webhook}`);
  SlackNotifier = {
    getName: () => 'slack',
    send: message => {
      let text = message.subject ? `*${message.subject}*\n${message.longMessage}` : message.longMessage;
      text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      request({
        method: 'POST',
        url: webhook,
        json: {
          text: text
        }
      }, error => {
        if (error)
        {
          logger.error('There was problem sending a notification via Slack: ' + error.message);
          logger.debug(error.stack);
          return;
        }
        logger.debug(`Slack message sent successfully "${message}"`);
      });
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = webhook => {
  if (!SlackNotifier) init(webhook);
  return SlackNotifier;
};
