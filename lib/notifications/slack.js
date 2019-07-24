const log4js = require('log4js');
const logger = log4js.getLogger('slack');
const request = require('request');

// Singleton
let SlackNotifier = null;

// Prevent out of order messages when messages are sent in quick succession
let sending = false;
let messageQueue = [];

function pushMessage(webhook)
{
  if (messageQueue.length > 0 && !sending)
  {
    sending = true;
    const text = messageQueue.splice(0, 1)[0];
    request({
      method: 'POST',
      url: webhook,
      timeout: 5000,
      json: {
        text: text
      }
    }, error => {
      if (error)
      {
        logger.error('There was problem sending a notification via Slack: ' + error.message);
        logger.debug(error.stack);
      }
      else
      {
        logger.debug(`Slack message sent successfully "${text}"`);
      }
      sending = false;
      pushMessage(webhook);
    });
  }
}

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
      messageQueue.push(text);
      pushMessage(webhook);
    }
  };
}

/**
 * Module pattern -- return singleton factory function.
 */
module.exports = webhook => {
  if (!SlackNotifier && !webhook)
    throw new Error('Cannot initialize Slack notifications without an incoming WebHook URL');
  if (!SlackNotifier && webhook)
    init(webhook);
  return SlackNotifier;
};
