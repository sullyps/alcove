const express = require('express'),
  router = express.Router();

module.exports = app => {
  app.use('/dashboard', router);
};

router.get('/', (req, res, next) => {
  res.render('dashboard', {title: 'Dashboard :: Alcove Backup System'});
});
