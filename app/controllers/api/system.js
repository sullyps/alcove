const express = require('express'),
      router = express.Router(),
      system = require('../../../lib/system'),
      util = require('../../../lib/util'),
      logging = require('../../../lib/config/log4js');

const logger = logging.getLogger();
router.get('/size',(req, res, next) => {
  Promise.all([system.getUsedSpaceDisplay(), system.getFreeSpaceDisplay()])
    .then(results => {
      res.json({
        usedSpace: results[0], 
        freeSpace: results[1]
      });
    })
    .catch(err => {
      logger.error('Error while reading file system sizes:', err.message);
      logger.debug(err);

      res.json({'error': 'An internal error occurred...'});
    });
});

module.exports = app => {
  app.use('/api/system', router);
};
