const express = require('express'),
  router = express.Router();

module.exports = app => {
  app.use('/', router);
};

router.get('/', (req, res, next) => {
  req.app.locals.version = process.env.npm_package_version;
  res.render('login', {title: 'Login :: Alcove Backup System'});
});
