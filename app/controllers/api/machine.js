const express = require('express'),
      router = express.Router();

const system = require('../../../lib/system');
const logger = require('../../../lib/config/log4js').getLogger();

router.get('/:name/backup/:backup_id/size',(req, res, next) => {
  // Attempt to grab the machine that is requested
  let machineObj = system.getMachines()[req.params.name];
  if (!machineObj) 
  {
    logger.warn('API Request for unknown machine with name: "' + req.params.name + '"');
    return res.status(404).json({ error: 'No machine with name "' + req.params.name + '"' });
  }

  // TODO: Test backup_id in the same way as above

  // Return the value
  logger.trace(machineObj);
  //logger.trace(backup);
  res.json({size: 'TODO'});
});

module.exports = app => {
  app.use('/api/machine', router);
};
