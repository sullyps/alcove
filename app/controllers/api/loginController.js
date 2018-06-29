const express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser');

let db = {};

try
{
  db = require('../../models').getDatabase();
}
catch (err)
{
  // TODO: Discuss Methods for handling an un-initialized database at this
  // point of the program.
  // Several possible outcomes:
  // 1. Inside each route, check if db initialized, kill Node if not.
  // 2. Inside function that returns database, kill Node if not initialized.
  // 3. Set a flag and check flag for each post/get response (not ideal).
  // Implementing option 1 until further discussion.
  console.error('*** The database has NOT been initialized. Exiting program ***');
  process.exit(-1);
}

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended : true }));

// User requests to login with a username and password
router.post('/', (req, res) => {
  db.User.findOne({
    where: {
      // TODO: Will want to hash the password and query for that hash
      username : req.body.username,
      password : req.body.password
    }
  })
  .then( user => {
    if (!user) return res.status(401).send("Incorrect username or password");
    res.status(200).send("Found user in database");
  })
  .catch( err => {
    return res.status(401).send("There was a problem finding that user in the database" + err.message);
  });
});

module.exports = (app => {
  app.use('/login',router);
});
