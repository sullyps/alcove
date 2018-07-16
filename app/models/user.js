'use strict';

module.exports = (sequelize, DataTypes) => {
  let User = sequelize.define('User', {
    'username' : DataTypes.STRING,
    'password' : DataTypes.STRING
  }, {
    classMethods: {
      associate: (models) => {
        // associations can be defined here
      }
    },
    'updatedAt' : 'lastLogin'
  });

  return User;
};
