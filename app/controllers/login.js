const express = require('express'),
  router = express.Router();

module.exports = app => {
  app.use('/', router);
};

router.get('/', (req, res, next) => {
  res.render('login', {title: 'Login :: Alcove Backup System'});
});
