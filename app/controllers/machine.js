const express = require('express'),
      router = express.Router();

const system = require('../../lib/system');

const logger = require('../../lib/config/log4js').getLogger();

router.get('/:name',(req, res, next) => {
  // Attempt to grab the machine that is requested
  let machineObj = system.getMachines()[req.params.name];
  if (!machineObj)
  {
    logger.warn('Request for unknown machine with name: "' + req.params.name + '"');
    return res.status(404).render('error', {
      message: 'Machine Not Configured', 
      error: { 
        status: 'There is no machine with the name of "' + req.params.name + '" configured for this system...'
      }
    });
  }

  logger.trace(machineObj);
  res.render('machine', { machine: machineObj });
});

module.exports = app => {
  app.use('/machine', router);
};
