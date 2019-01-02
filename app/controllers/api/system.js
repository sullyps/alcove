const express = require('express'),
      router = express.Router(),
      system = require('../../../lib/system'),
      util = require('../../../lib/util');

router.get('/size',(req, res, next) => {
  let config = system.getConfig();
  Promise.all([util.findDirSize(config.data_dir), util.findFreeSpace(config.data_dir)])
    .then(results => {
      res.json({
        dirSize: util.getFormattedSize(results[0] * 1024), 
        freeSpace: util.getFormattedSize(results[1] * 1024)
      });
    })
    .catch(err => {
      // TODO: log this
      res.json({'error': 'An internal error occurred...'});
    });
});

module.exports = app => {
  app.use('/api/system', router);
};
