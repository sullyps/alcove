#!/usr/bin/env node
const DEVEL = (process.env.NODE_ENV !== 'production');
const CONFIG = (DEVEL ? '.' : '') + '/etc/backup/backup.ini';

const readline = require('readline'),
      argon = require('argon2'),
      wrap = require('wordwrapjs');

const configInit = require('./config/init'),
      models = require('../app/models');

let resultMessage;

// Initialize database
let db;
try
{
  db = models.getDatabase();
}
catch (error)
{
  // Parse config file
  let config;
  try
  {
    config = configInit.getConfig(CONFIG);
  }
  catch (error)
  {
    // NOTE: See app.js for notes about config file parsing
    resultMessage = '[Config ERROR] ' + error.message;
    console.error(wrap.wrap(resultMessage, {width: 80, noTrim: true}));
    process.exit(-3);
  }

  try
  {
    db = models.init(config);
  }
  catch (error)
  {
    resultMessage = 'Error loading the Events DB. Check your configuration and data files: ' + error.message;
    console.error(wrap.wrap(resultMessage, {width: 80, noTrim: true}));
    console.debug(error.stack);
    process.exit(-2);
  }
}

// Listen to user input and create User in events database
let user = {};
const rl = readline.createInterface(process.stdin, process.stdout);
rl.question('Username: ', usernameInput => {
  db.User.findOne({
    where: {
      username: usernameInput
    }
  })
  .then(existingUser => {
    if (existingUser)
    {
      resultMessage = 'That user already exists. Please try again with a different username.';
      console.error(wrap.wrap(resultMessage, {width: 80, noTrim: true}));
      process.exit(-1);
    }
    user.username = usernameInput;
    rl.question('Password: ', passwordInput => {
      argon.hash(passwordInput)
      .then(hashedPassword => {
        user.password = hashedPassword;
        db.User.create(user)
        .then(() => {
          resultMessage = 'User added to the database successfully.';
          console.log(wrap.wrap(resultMessage, {width: 80, noTrim: true}));
          process.exit(0);
        });
      });
    });
  });
});
