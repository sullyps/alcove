var express = require('express');
var fs = require('fs');
var glob = require('glob');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');
var compress = require('compression');
var methodOverride = require('method-override');
var auth = require('http-auth');
var swig = require('swig');

module.exports = function(app, config) {
  app.engine('swig', swig.renderFile);
  app.set('views', config.root + '/app/views');
  app.set('view engine', 'swig');

  var env = process.env.NODE_ENV || 'development';
  app.locals.ENV = env;
  app.locals.ENV_DEVELOPMENT = env == 'development';

  // Basic Morgan request logging
  app.use(logger('dev'));

  // Setup basic HTTP AUTH
  if (config.authFile)
  {
    try
    {
      var basic = auth.basic({ realm: 'Bioneos System Backup', file: config.authFile});
      app.use(auth.connect(basic));
    }
    catch (e)
    {
      console.log(e + '\n\n');
      console.log('Looks like we cannot access your configured HTTP Auth file: "' + 
        config.authFile + '"');
      process.exit(-40);
    }
  }

  //app.use(favicon(config.root + '/public/img/favicon.ico'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(compress());
  app.use(express.static(config.root + '/public'));
  app.use(methodOverride());

  var controllers = glob.sync(config.root + '/app/controllers/*.js');
  controllers.forEach(function (controller) {
    require(controller)(app);
  });

  app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
  });
  
  if(app.get('env') === 'development'){
    app.use(function (err, req, res, next) {
      res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: err,
        title: 'error'
      });
    });
  }

  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
      res.render('error', {
        message: err.message,
        error: {},
        title: 'error'
      });
  });
};
