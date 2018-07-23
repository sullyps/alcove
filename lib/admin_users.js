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

const operations = {
  addUser: rl => {
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
          exit('That user already exists. Please try again with a different username.', -6);
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
            db.User.create(user)
            .then(() => {
              exit('User added to the database successfully.', 0);
            });
          });
        });
      });
    });
  },

  deleteUser: () => {
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
            exit('Wrong username or password.', -6);
          }
          else
          {
            argon.verify(user.password, passwordInput)
            .then(match => {
              if (!match)
              {
                exit('Wrong username or password.', -6);
              }
              else
              {
                db.User.destroy({
                  where: {
                    username: usernameInput
                  }
                })
                .then(() => {
                  exit('User deleted from the database successfully.', 0);
                });
              }
            });
          }
        });
      });
    });
  }
};

const rl = readline.createInterface(process.stdin, process.stdout);
rl.question('What would you like to do? (addUser, deleteUser): ', operationInput => {
  if (operationInput === 'addUser')
  {
    operations.addUser(rl);
  }
  else if (operationInput === 'deleteUser')
  {
    operations.deleteUser(rl);
  }
  else
  {
    exit('Invalid operation. Must be one of: addUser, deleteUser.', -6);
  }
});
