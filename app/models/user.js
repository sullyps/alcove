'use strict';

module.exports = (sequelize, DataTypes) => {
  let User = sequelize.define('User', {
    'username' : DataTypes.STRING,
    'password' : DataTypes.STRING,
    'access' : DataTypes.STRING
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    }
  });
  return User;
}
