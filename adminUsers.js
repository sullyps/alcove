#!/usr/bin/env node
const DEVEL = (process.env.NODE_ENV !== 'production');
const CONFIG = (DEVEL ? '.' : '') + '/etc/backup/backup.ini';

const input = require('prompt'),
      argon = require('argon2'),
      wrap = require('wordwrapjs');

const configInit = require('./lib/config/init'),
      models = require('./app/models');

// Prepare to receive input using 'prompt'
input.start();
input.message = '';


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

/**
 * Adds a user to the Alcove database given the username and password supplied.
 */
function addUser()
{
  let user = {};
  let schema = { 
    properties: { 
      username: { 
        description: 'Username',
        pattern: /^\S+$/,
        message: 'Username cannot contain whitespace, please try again with a different username...',
        required: true
      }
    }
  };
  input.get(schema, (err, results) => { 
    db.User.findOne({
      where: {
        username: results.username
      }
    })
    .then(existingUser => {
      if (existingUser)
      {
        exit('User "' + existingUser.username + '" already exists. Please try again with a different username.', -6);
      }
      user.username = results.username;
      let schema2 = { 
        properties: { 
          password: { 
            description: 'Password',
            hidden: true,
            replace: '*',
            required: true
          },
          password2: { 
            description: 'Verify Password',
            hidden: true,
            replace: '*',
            required: true
          }
        }
      };

      // And now the password
      return new Promise(function (resolve, reject) {
        input.get(schema2, (err, results) => {
          if (err != null) reject(err);
          else resolve(results);
        });
      });
    })
    .then(results => {
      if (results.password !== results.password2)
      {
        exit('Passwords do not match. Please try again...', -7);
      }

      return argon.hash(results.password);
    })
    .then(hashedPassword => {
      user.password = hashedPassword;
      return db.User.create(user);
    })
    .then(() => {
      exit('User "' + user.username + '" added to the database successfully.', 0);
    });
  });
}

/**
 * Deletes a user from the Alcove database.
 */
function deleteUser() {
  let schema = { 
    properties: { 
      username: {
        description: 'Username',
        pattern: /^\S+$/,
        message: 'Username cannot contain whitespace, please try again with a different username...',
        required: true
      }
    }
  };
  input.get(schema, (err, results) => {
    db.User.findOne({
      where: {
        username: results.username
      }
    })
    .then(user => {
      if (!user)
      {
        exit('User "' + results.username + '" does not exit.', -7);
      }

      console.log('User "' + results.username + '" will be deleted.');
      let schema = { 
        properties: { 
          verify: {
            description: 'Are you sure you want to do this (y/N)?',
            required: true
          }
        }
      };
      return new Promise(function (resolve, reject) {
        input.get(schema, (err, results) => {
          if (err != null) reject(err);
          else resolve(results);
        });
      });
    })
    .then(results2 => {
      if (results2.verify.toLowerCase()[0] !== 'y')
      {
        exit('Aborting...', 0);
      }
      return db.User.destroy({
        where: {
          username: results.username
        }
      });
    })
    .then(() => {
      exit('User \'' + results.username + '\' deleted from the database successfully.', 0);
    });
  });
}

/**
 * Changes the password of the user from the Alcove database.
 */
function changePassword() {
  let user = {};
  let schema = { 
    properties: { 
      username: { 
        description: 'Username',
        pattern: /^\S+$/,
        message: 'Username cannot contain whitespace, please try again with a different username...',
        required: true
      },
      password: { 
        description: 'Password',
        hidden: true,
        replace: '*',
        required: true
      },
    }
  };
  input.get(schema, (err, results) => { 
    db.User.findOne({
      where: {
        username: results.username
      }
    })
    .then(existingUser => {
      if (!existingUser)
      {
        exit('User "' + results.username + '" does not exist...', -7);
      }
      user = existingUser;

      return argon.verify(user.password, results.password);
    })
    .then((match) => {
      if (!match)
      {
        exit('Password is not correct for user "' + results.username + '". Aborting...', -7);
      }
      
      let schema2 = { 
        properties: { 
          password: { 
            description: 'New Password',
            hidden: true,
            replace: '*',
            required: true
          },
          password2: { 
            description: 'Verify new Password',
            hidden: true,
            replace: '*',
            required: true
          }
        }
      };
      // And now the password
      return new Promise(function (resolve, reject) {
        input.get(schema2, (err, results) => {
          if (err != null) reject(err);
          else resolve(results);
        });
      });
    })
    .then(results => {
      if (results.password !== results.password2)
      {
        exit('Passwords do not match. Please try again...', -7);
      }

      return argon.hash(results.password);
    })
    .then(hashedPassword => {
      user.password = hashedPassword;
      return db.User.update(
        {
          password: hashedPassword
        }, {
        where: {
          username: user.username
        }
      });
    })
    .then(() => {
      exit('Password for user "' + user.username + '" successfully updated.', 0);
    });
  });
}

// Ask user what operation to perform (add user, delete user, or change password)
console.log('Welcome to the Alcove CLI User Management script');
console.log('  1) Add a new User');
console.log('  2) Delete a User');
console.log('  3) Edit a User');
console.log('  (Any other entry to cancel)');
let schema = { 
  properties: { 
    choice: { 
      description: 'What do you want to do? ',
      required: true
    }
  }
};
input.get(schema, (err, results) => {
  if (results.choice === '1') addUser();
  else if (results.choice=== '2') deleteUser();
  else if (results.choice=== '3') changePassword();
  else exit('Quitting...', 0);
});
