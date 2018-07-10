const logging = require('../../lib/config/log4js')
const logger = logging.getLogger();


/** 
 * Be cautious when using this middleware as it will override previous auth
 * requirements and could make a route accessible unintentionally. Only include
 * this middleware if there is no security requirement for the underlying route.
 */
module.exports = (req, res, next) => {
  req.auth = req.auth || {};
  // Make this route accessible to the world (regardless of any previous settings)
  req.auth.required = false;
  logger.debug('Marking request as Public');

  next();
};
