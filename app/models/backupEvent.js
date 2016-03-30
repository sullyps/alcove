'use strict';

module.exports = function(sequelize, DataTypes) {
  var BackupEvent = sequelize.define('BackupEvent', {
    'machine' : {
      'type' : DataTypes.STRING,
      'validate' : {
        'notEmpty' : {
          'msg' : 'An machine name is required'
        }
      }
    },
    'rsyncExitCode' : DataTypes.INTEGER,
    'rsyncExitReason' : DataTypes.STRING,
    'transferSize' : DataTypes.INTEGER,
    'transferTimeSec' : DataTypes.INTEGER
  }, {
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    },
    'createdAt' : 'backupTime',
    'updatedAt' : false
  });

  return BackupEvent;
};
