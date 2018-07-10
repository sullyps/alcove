const logging = require('../../lib/config/log4js');
const logger = logging.getLogger();

module.exports = (req, res, next) => {
  req.auth = req.auth || {};
  // Ensure no redirects are sent as a result of this request by marking it as
  // an API call
  req.auth.api = true;
  // Unless previously set, this request will need a valid, active session 
  // (or should result in a 401). If a previous middleware has already set the
  // authorization requirement, don't change it. (Allows for public API routes).
  if (req.auth.required === undefined) req.auth.required = true;
  logger.debug('Marking request as an API route. Auth required? ' + req.auth.required);

  next();
};
