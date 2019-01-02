'use strict';

module.exports = (sequelize, DataTypes) => {
  let Sizes = sequelize.define('Sizes', {
    'machine' : DataTypes.STRING,
    'size' : DataTypes.INTEGER
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    }
  });

  return Sizes;
};
