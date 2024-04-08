'use strict';

/*
RequestedBackupEvent is similar to backup event, but without the bucket and schedule fields.
It is also stored in the RequestedBackupEvents table rather than the BackupEvents table for organization purposes.
*/
module.exports = (sequelize, DataTypes) => {
  let RequestedBackupEvent = sequelize.define('RequestedBackupEvent', {
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
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    },
    'createdAt' : 'backupTime',
    'updatedAt' : false
  });

  return RequestedBackupEvent;
};
