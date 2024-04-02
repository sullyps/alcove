'use strict';

module.exports = (sequelize, DataTypes) => {
  let BackupEvent = sequelize.define('BackupEvent', {
    'machine' : {
      'type' : DataTypes.STRING,
      'validate' : {
        'notEmpty' : {
          'msg' : 'A machine name is required'
        }
      }
    },
    'schedule' : DataTypes.STRING,
    'bucket' : DataTypes.STRING,
    'rsyncExitCode' : DataTypes.INTEGER,
    'rsyncExitReason' : DataTypes.STRING,
    'transferSize' : DataTypes.INTEGER,
    'transferTimeSec' : DataTypes.INTEGER,
    'dir' : DataTypes.STRING,
    'requested': DataTypes.BOOLEAN
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    },
    'createdAt' : 'backupTime',
    'updatedAt' : false
  });

  return BackupEvent;
};
