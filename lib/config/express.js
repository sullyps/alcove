const express = require('express'),
  session = require('express-session'),
  MemoryStore = require('memorystore')(session);
const fs = require('fs'),
  glob = require('glob'),
  path = require('path');
const log4js = require('log4js');
const bodyParser = require('body-parser'),
  compress = require('compression'),
  favicon = require('serve-favicon'),
  methodOverride = require('method-override');
const nunjucks = require('nunjucks');
const publicAuth = require('../../app/middleware/public'),
  privateAuth = require('../../app/middleware/secured'),
  apiAuth = require('../../app/middleware/api'),
  action = require('../../app/middleware/action');


module.exports = (app, config) => {
  let env = process.env.NODE_ENV;

  // Attach to the log4js logger (instantiated by <app_root>/lib/system.js)
  let logger = log4js.getLogger('backup');
  app.use(log4js.connectLogger(logger, { level: 'auto'}));

  // Setup Nunjucks rendering
  nunjucks.configure(path.join(config.app.root, 'app', 'views'), {
    autoescape: true,
    express: app
  });
  app.engine('njk', nunjucks.render);
  app.set('view engine', 'njk');

  // TODO: create this icon
  // app.use(favicon(path.join(config.app.root, 'public', 'favicon.ico')));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({
    extended: true
  }));

  // Gzip transmission
  app.use(compress());

  // Static file serving
  // (Served before any authorization middleware)
  app.use(express.static(path.join(config.app.root, 'public')));

  // Support newer HTTP verbs on older clients with override
  app.use(methodOverride());

  // Setup session support
  app.use(session({ 
    secret: "%%BUILD_SECRET%%",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: (env === 'production') },
    store: new MemoryStore({
      checkPeriod: 3600000  // 1 hr
    })
  }));

  //
  // Define all authorization requirements
  // 
  // Ex] Open up a single route to the public (can be API or webpage):
  //   app.use('/api/public', publicAuth);
  //   app.use('/public', publicAuth);
  // Note these changes must be entered above the existing definitions.
  app.use('/api/*', apiAuth);
  app.use(/\/$/, publicAuth);
  app.use('*', privateAuth);
  app.use('*', action);

  //
  // Configure all controllers defined in our app
  //
  let controllers = glob.sync(path.join(config.app.root, 'app', 'controllers','**','*.js'));
  controllers.forEach( controller => {
    logger.debug('Configuring ' + controller + ' controller');
    require(controller)(app);
  });
  
  // Setup the 404 (Not Found) page
  app.use( (req, res, next) => {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
  });
  
  // Setup the 500 (Internal Error) page
  app.use( (err, req, res, next) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      // Only display a stack trace in development mode:
      error: (env === 'development') ? err : {},
      title: 'error'
    });
  });
};
