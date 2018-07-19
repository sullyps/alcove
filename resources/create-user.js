#!/usr/bin/env node
const DEVEL = (process.env.NODE_ENV !== 'production');
const CONFIG = (DEVEL ? '.' : '') + '/etc/backup/backup.ini';

const readline = require('readline'),
      argon = require('argon2'),
      wrap = require('wordwrapjs');

const configInit = require('../lib/config/init'),
      models = require('../app/models');

// Parse configuration file
let config;
try
{
  config = configInit.getConfig(CONFIG);
}
catch (error)
{
  // NOTE: See app.js for notes about config file parsing
  let msg = '[Config ERROR] ' + error.message;
  console.error(wrap.wrap(msg, {width: 80, noTrim: true}));
  process.exit(-3);
}

// Initialize database
let db;
try
{
  db = models.init(config);
}
catch (error)
{
  console.error('Error loading the Events DB. Check your configuration and data files: ' + error.message);
  console.debug(error.stack);
  process.exit(-2);
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
      console.error('That user already exists. Please try again with a different username.');
      process.exit(-1);
    }
    user.username = usernameInput;
    rl.question('Password: ', passwordInput => {
      argon.hash(passwordInput)
      .then(hashedPassword => {
        user.password = hashedPassword;
        db.User.create(user)
        .then(() => {
          console.log('User added to the database successfully.');
          process.exit(0);
        });
      });
    });
  });
});
