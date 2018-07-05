const express = require('express'),
      router = express.Router(),
      schedule = [''];

module.exports = app => {
  app.use('/', router);
};

router.get('/', (req, res, next) => {
  res.render('index', {title: 'BN System Backup'});
});
