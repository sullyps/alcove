const express = require('express');
const fs = require('fs');
const glob = require('glob');
const favicon = require('serve-favicon');
const log4js = require('log4js');
const bodyParser = require('body-parser');
const compress = require('compression');
const methodOverride = require('method-override');
const auth = require('http-auth');
const nunjucks = require('nunjucks');
const path = require('path');

module.exports = function(app, config) {
  let env = app.get('env');

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
  app.use(express.static(path.join(config.app.root, 'public')));

  // Support newer HTTP verbs on older clients with override
  app.use(methodOverride());

  //
  // Configure all controllers defined in our app
  //
  let controllers = glob.sync(path.join(config.app.root, 'app', 'controllers', '*.js'));
  controllers.forEach(function (controller) {
    require(controller)(app);
  });

  // Setup the 404 (Not Found) page
  app.use(function (req, res, next) {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
  });
  
  // Setup the 500 (Internal Error) page
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      // Only display a stack trace in development mode:
      error: (env === 'development') ? err : {},
      title: 'error'
    });
  });
};
