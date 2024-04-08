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

router.get('/:name/backup-now', (req, res, next) => {
	const machine = system.getMachines()[req.params.name];

	if (!machine) {
		logger.warn(
			'API Request for unknown machine with name: "' + req.params.name + '"'
		);
		console.log(
			'API Request for unknown machine with name: "' + req.params.name + '"'
		);

		return res
			.status(404)
			.json({ error: 'No machine with name "' + req.params.name + '"' });
	}

	// on success, send back the machineStats object from above
	// TODO: it might actually be worth running rsync here, because there would only be on flag that would need to be changed
	rsync.runRequestedRsync(system.getConfig(), machine, (error, rsyncStats) => {
		if (error) {
			logger.error('Error running requested rsync:', error);
			return res.status(500).json({
				success: false,
				message: `Backup of ${machine.name} was not successful. Check the logs for more info.`,
			});
		}

		system.insertRequestedBackup(machine, rsyncStats);

		res.json({
			success: true,
			message: `backup successful`,
			machineStats: `${JSON.stringify(rsyncStats)}`
		});
	});
});

router.get('/:name/backup/:backup_id/size', (req, res, next) => {
	// Attempt to grab the machine that is requested
	let machine = system.getMachines()[req.params.name];
	if (!machine) {
		logger.warn(
			'API Request for unknown machine with name: "' + req.params.name + '"'
		);
		return res
			.status(404)
			.json({ error: 'No machine with name "' + req.params.name + '"' });
	}

	logger.trace(machine);

	config = system.getConfig();
	db = models.getDatabase();

	// Placeholder for Promise results
	let size = {};

	// Attempt to find the request backup event
	const id = parseInt(req.params.backup_id, 10);
	db.BackupEvent.findOne({
		where: {
			id: id,
			machine: machine.name
		}
	})
		.then((backupEvent) => {
			// Error handling
			if (!backupEvent) {
				return res.status(404).json({
					error:
						'No backup with id "' + id + '" for machine "' + machine.name + '"'
				});
			}

			logger.trace(backupEvent);
			size.type = 'complete';

			// Check rsync status
			if (backupEvent.rsyncExitCode) {
				// There was an rsync error, so size might be off
				size.type = 'approximate';
				size.rsyncExitCode = backupEvent.rsyncExitCode;
			}

			// Get any size measurement for this directory based on Sizes.location == BackupEvent.dir
			let dir = backupEvent.dir.split('/').slice(-1);
			return db.Sizes.findOne({
				where: {
					location: dir,
					machine: machine.name
				}
			});
		})
		.then((dbSizeRecord) => {
			if (!dbSizeRecord) size.type = 'unknown';
			else size.size = dbSizeRecord.size;
			res.json(size);
		})
		.catch(() => {
			return res.status(500).json({
				error: 'There was an internal problem, please contact support...'
			});
		});
});

module.exports = (app) => {
	app.use('/api/machine', router);
};
