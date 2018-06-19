var express = require('express');
var fs = require('fs');
var glob = require('glob');
var favicon = require('serve-favicon');
// TODO: for consistency, route this through log4js
var logger = require('morgan');
var bodyParser = require('body-parser');
var compress = require('compression');
var methodOverride = require('method-override');
var auth = require('http-auth');
var swig = require('swig');
var path = require('path');

module.exports = function(app, config) {
  app.engine('swig', swig.renderFile);
  app.set('views', path.join(config.app.root, 'app', 'views'));
  app.set('view engine', 'swig');

  var env = app.get('env');

  // Basic Morgan request logging TODO
  app.use(logger('dev'));

  //app.use(favicon(path.join(config.app.root, 'public', 'img', 'favicon.ico')));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(compress());
  app.use(express.static(path.join(config.app.root, 'public')));
  app.use(methodOverride());

  var controllers = glob.sync(path.join(config.app.root, 'app', 'controllers', '*.js'));
  controllers.forEach(function (controller) {
    require(controller)(app);
  });

  app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });
  
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
