'use strict';
var fs = require('fs'),
  path = require('path'),
  Sequelize = require('sequelize');

const DB_URL = 'sqlite://localhost/backup-system';
var db = {};

/**
 * Module pattern.
 */
module.exports = {
  init: function(config) {
    // First ensure data directory, or throw exception
    try 
    {
      fs.accessSync(config.data_dir);
    }
    catch (error)
    {
      throw new Error('Cannot access the data directory, or it does not exist (' + config.data_dir + ')');
    }

    // Read our model definitions and associate relationships
    var sequelize = new Sequelize(DB_URL, { 
      storage: path.join(config.data_dir, "events.db"),
      operatorsAliases: false,
      logging: false
    });
    fs.readdirSync(__dirname).filter(function (file) {
      return (file.indexOf('.') !== 0) && (file !== 'index.js');
    }).forEach(function (file) {
      var model = sequelize['import'](path.join(__dirname, file));
      db[model.name] = model;
    });
    Object.keys(db).forEach(function (modelName) {
      if ('associate' in db[modelName]) {
        db[modelName].associate(db);
      }
    });

    // Instance reference
    db.sequelize = sequelize;
    // Class reference
    db.Sequelize = Sequelize;

    return db;
  },
  getDatabase: function () {
    // TODO: Fix this implementation - controllers won't be able to access
    // config file if the database has not been set up, throw error (for now)
    if (!db.sequelize)
      return new Exception("Database has not been initialized!")
    return db;
  }
};
