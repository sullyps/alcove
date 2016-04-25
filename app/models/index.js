'use strict';

var fs = require('fs'),
  path = require('path'),
  Sequelize = require('sequelize'),
  config = require('../../lib/config/config').environmentVar,
  db = {};

// Check to make sure the data directory exists before running the application
(function() {
  var parentDataDir = path.normalize(path.join(config.environment.db_storage, '..'));
  try 
  {
    fs.statSync(parentDataDir);
  }
  catch (error) 
  {
    throw new Error('Please create the parent directory, ' + parentDataDir + ' of your' +
        ' data storage file before running the application.');
  }
})();

var sequelize = new Sequelize(config.environment.db_url, {
  storage: config.environment.db_storage
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

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
