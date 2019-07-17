'use strict';
const fs = require('fs'),
      path = require('path'),
      Sequelize = require('sequelize');

const DB_URL = 'sqlite://localhost/backup-system';
const DB_TEST_URL = 'sqlite://:memory:';
let test;
let db = {};

/**
 * Module pattern.
 */
module.exports = {
  init: config => {
    test = config.environment && config.environment.trim().toLowerCase() === 'test';

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
    let sequelize = new Sequelize(test ? DB_TEST_URL : DB_URL, {
        storage: test ? ':memory:' : path.join(config.data_dir, "events.db"),
        logging: false
      });
    fs.readdirSync(__dirname).filter((file) => {
      return (file.indexOf('.') !== 0) && (file !== 'index.js');
    }).forEach((file) => {
      let model = sequelize['import'](path.join(__dirname, file));
      db[model.name] = model;
    });
    Object.keys(db).forEach((modelName) => {
      if ('associate' in db[modelName]) {
        db[modelName].associate(db);
      }
    });
    if (test)
    {
      console.warn('Database has been initialized for a testing environment.\n' +
          'Database updates will not be saved.');

      return sequelize.sync()
      .then(() => {
        // Instance reference
        db.sequelize = sequelize;
        // Class reference
        db.Sequelize = Sequelize;

        return db;
      });
    }
    else
    {
      // Instance reference
      db.sequelize = sequelize;
      // Class reference
      db.Sequelize = Sequelize;

      return db;
    }
  },

  getDatabase: () => {
    // NOTE: This method should never be called before the init method.
    // If this error occurs during runtime, reorganize your code to ensure
    // the database is initialized before this method is used.
    if (!db.sequelize)
    {
      throw new Error('Database has not been initialized!');
    }
    if (test)
    {
      console.warn('Database has been initialized for a testing environment.');
      console.warn('Database updates will not be saved.');
    }
    return db;
  }
};
