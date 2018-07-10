const logging = require('../../lib/config/log4js')
const logger = logging.getLogger();

module.exports = (req, res, next) => {
  req.auth = req.auth || {};
  // Unless previously set, this request will need a valid, active session 
  // (or should result in a 401). If a previous middleware has already set the
  // authorization requirement, don't change it.
  if (req.auth.required === undefined) req.auth.required = true;
  logger.debug('Marking request as Secured. Auth required? ' + req.auth.required);

  next();
};
