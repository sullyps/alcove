var express = require('express'),
    router = express.Router(),
    schedule = ['']

module.exports = function (app) {
  app.use('/', router);
};

router.get('/', function (req, res, next) {
  res.render('index', {title: 'BN System Backup'});
});




