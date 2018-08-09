const express = require('express'),
      router = express.Router(),
      fs = require('fs'),
      path = require('path'),
      system = require('../../../lib/system'),
      models = require('../../models'),
      rsync = require('../../../lib/rsync'),
      util = require('../../../lib/util');

let config, db;

const logger = require('../../../lib/config/log4js').getLogger();

router.get('/:name/backup/:backup_id/size',(req, res, next) => {
  // Attempt to grab the machine that is requested
  let machine = system.getMachines()[req.params.name];
  if (!machine)
  {
    logger.warn('API Request for unknown machine with name: "' + req.params.name + '"');
    return res.status(404).json({ error: 'No machine with name "' + req.params.name + '"' });
  }

  logger.trace(machine);

  config = system.getConfig();
  db = models.getDatabase();

  const id = parseInt(req.params.backup_id, 10);
  db.BackupEvent.findOne({
    where: {
      id: id,
      machine: machine.name
    }
  })
  .then(backupEvent => {
    if (!backupEvent)
    {
      return res.status(404).json({ error: 'No backup with id "' + id + '" for machine "' + machine.name + '"'});
    }
    logger.trace(backupEvent);
    if (backupEvent.rsyncExitCode)
    {
      return res.json({ size: util.getFormattedSize(0) });
    }
    const machinePath = path.join(config.data_dir, machine.name);
    let backups = fs.readdirSync(machinePath).filter(backup => {
      return fs.statSync(path.join(machinePath, backup)).isDirectory() &&
          backup !== rsync.getInProgressName();
    });
    const tolerance = 300000;
    const backupTime = backupEvent.backupTime.getTime() - (1000 * backupEvent.transferTimeSec);
    for (let backup of backups)
    {
      if (Math.abs(util.parseISODateString(backup).getTime() - backupTime) <= tolerance)
      {
        return res.json({ size: util.getFormattedSize(util.findDirSize(path.join(machinePath, backup))) });
      }
    }
    return res.status(404).json({ error: 'Backup directory not found.' });
  });
});

module.exports = app => {
  app.use('/api/machine', router);
};
