'use strict';

module.exports = (sequelize, DataTypes) => {
  let User = sequelize.define('User', {
    'username' : DataTypes.STRING,
    'password' : DataTypes.STRING,
    // TODO: Determine how we would like to define access levels
    //'access' : DataTypes.STRING // DataTypes.INTEGER
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    }
  });
  return User;
}
