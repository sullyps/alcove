const express = require('express'),
      router = express.Router(),
      system = require('../../../lib/system'),
      util = require('../../../lib/util');

router.get('/size',(req, res, next) => {
  let config = system.getConfig();
  return res.json({
    dirSize: util.getFormattedSize(util.findDirSize(config.data_dir)),
    freeSpace: util.getFormattedSize(util.findFreeSpace(config.data_dir))
  });
});

module.exports = app => {
  app.use('/api/system', router);
};
