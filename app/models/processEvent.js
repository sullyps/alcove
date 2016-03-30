'use strict';

module.exports = function(sequelize, DataTypes) {
  var ProcessEvent = sequelize.define('ProcessEvent', {
    'event' : {
      'type' : DataTypes.STRING,
      'validate' : {
        'notEmpty' : {
          'msg' : 'An event is required ("started" or "stopped")'
        }
      }
    },
    'exitCode' : DataTypes.INTEGER,
    'exitReason' : DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
         // associations can be defined here
      }
    },
    'createdAt' : 'eventTime'
  });
  return ProcessEvent;
};
