const logging = require('../../lib/config/log4js');
const logger = logging.getLogger();

/**
 * This middleware takes action based on the previous settings recorded to the
 * request object by our other auth-related middleware. IF the settings are
 * missing, or authorization is not required, it does nothing. If authorization
 * is required, this will look for a valid, active, logged-in session before
 * taking action. When this session is missing, either return a 401 (for an API
 * route) or redirect back to the homepage (with a ?dest= query parameter).
 */
module.exports = (req, res, next) => {
  // Take action 
  if (req.auth && req.auth.required)
  {
    let authFailed = true;

    // Look for a valid session, check if it is logged-in
    if (!req.session)
    {
      logger.warn('Attempt to visit a route requiring authorization, but no session is present? Perhaps session timed-out...');
    }
    else if (!req.session.authorized)
    {
      logger.info('Session is active, but not authorized for current request');
    }
    else if (req.session.authorized)
    {
      logger.trace('Session is active, and Authorization is present for current request');
      authFailed = false;
    }

    // Take appropriate action
    if (authFailed && req.auth.api)
    {
      res.type('json');
      return res.status(401).send({});
    }
    else if (authFailed)
    {
      return res.redirect('/?dest=' + encodeURIComponent(req.originalUrl));
    }
  }

  logger.debug('No action required for this route');
  next();
};

