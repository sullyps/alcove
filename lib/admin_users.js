#!/usr/bin/env node
const DEVEL = (process.env.NODE_ENV !== 'production');
const CONFIG = (DEVEL ? '.' : '') + '/etc/backup/backup.ini';

const readline = require('readline'),
      argon = require('argon2'),
      wrap = require('wordwrapjs');

const configInit = require('./config/init'),
      models = require('../app/models');

/**
 * Private helper function that exits the script with message and code.
 * @param message
 *  The message describing the result of the script execution.
 * @param code
 *  The code that corresponds to the result of the script execution.
 */
function exit(message, code)
{
  if (code)
  {
    console.error(wrap.wrap(message, {width: 80, noTrim: true}));
  }
  else
  {
    console.log(wrap.wrap(message, {width: 80, noTrim: true}));
  }
  process.exit(code);
}

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
    exit('[Config ERROR] ' + error.message, -3);
  }

  try
  {
    db = models.init(config);
  }
  catch (error)
  {
    exit('Error loading the Events DB. Check your configuration and data files: ' + error.message, -2);
  }
}

function addUser(rl)
{
  let user = {};
  rl.question('Username: ', usernameInput => {
    db.User.findOne({
      where: {
        username: usernameInput
      }
    })
    .then(existingUser => {
      if (existingUser)
      {
        exit('User \'' + existingUser.username + '\' already exists. Please try again with a different username.', -6);
      }
      if (/\s/.test(usernameInput))
      {
        exit('Username cannot contain whitespace. Please try again with a different username.', -6);
      }
      user.username = usernameInput;
      rl.question('Password: ', passwordInput => {
        argon.hash(passwordInput)
        .then(hashedPassword => {
          user.password = hashedPassword;
          return db.User.create(user);
        })
        .then(() => {
          exit('User \'' + usernameInput + '\' added to the database successfully.', 0);
        });
      });
    });
  });
}

function deleteUser(rl) {
  rl.question('Username: ', usernameInput => {
    rl.question('Password: ', passwordInput => {
      db.User.findOne({
        where: {
          username: usernameInput
        }
      })
      .then(user => {
        if (!user)
        {
          exit('Incorrect username and/or password.', -6);
        }
        return argon.verify(user.password, passwordInput);
      })
      .then(match => {
        if (!match)
        {
          exit('Incorrect username and/or password.', -6);
        }
        return db.User.destroy({
          where: {
            username: usernameInput
          }
        })
      })
      .then(() => {
        exit('User \'' + usernameInput + '\' deleted from the database successfully.', 0);
      });
    });
  });
}

function changePassword(rl) {
  rl.question('Username: ', usernameInput => {
    rl.question('Current Password: ', currentPasswordInput => {
      db.User.findOne({
        where: {
          username: usernameInput
        }
      })
      .then(user => {
        if (!user)
        {
          exit('Incorrect username and/or password.', -6);
        }
        return argon.verify(user.password, currentPasswordInput);
      })
      .then(match => {
        if (!match)
        {
          exit('Incorrect username and/or password.', -6);
        }
        rl.question('New Password: ', newPasswordInput => {
          argon.hash(newPasswordInput)
          .then(hashedPassword => {
            return db.User.update({
              password: hashedPassword
            }, {
              where: {
                username: usernameInput
              }
            });
          })
          .then(() => {
            exit('Password for user \'' + usernameInput + '\' updated successfully.', 0);
          });
        });
      });
    });
  });
}

const rl = readline.createInterface(process.stdin, process.stdout);
rl.question('What do you want to do? (addUser, deleteUser, changePassword): ', operationInput => {
  if (operationInput === 'addUser')
  {
    addUser(rl);
  }
  else if (operationInput === 'deleteUser')
  {
    deleteUser(rl);
  }
  else if (operationInput === 'changePassword')
  {
    changePassword(rl);
  }
  else
  {
    exit('Invalid operation. Must be one of: addUser, deleteUser, changePassword.', -6);
  }
});
