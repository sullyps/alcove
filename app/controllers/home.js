const express = require('express'),
  router = express.Router();

module.exports = app => {
  app.use('/', router);
};

router.get('/', (req, res, next) => {
  res.render('index', {title: 'Login :: Alcove Backup System'});
});
