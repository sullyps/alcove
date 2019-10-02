'use strict';

module.exports = (sequelize, DataTypes) => {
  let Sizes = sequelize.define('Sizes', {
    'machine' : DataTypes.STRING,
    // 'location' indicates the directory name and implicitly the type of measurement.
    //   It will either contain the directory name relative to the backup destination
    //   for the 'machine' or else "." if the measurement is a totalSize measurement 
    //   for the whole 'machine'.
    'location' : DataTypes.STRING,
    'size' : DataTypes.INTEGER,
    // TODO: this value might not be necessary, only possible before prepareMachines has completed...
    'dirty' : {
      'type' : DataTypes.BOOLEAN,
      'defaultValue': false
    }
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    }
  });

  return Sizes;
};
