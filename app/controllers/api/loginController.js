const express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser');

router.use(bodyParser.urlencoded({ extended : true }));
const User = require('../../models/user.js');

// Create a new user
router.post('/', (req, res) => {
  // TODO: Determine if I need the instance of the db to properly
  // utilize the .create() function.
  User.create({
    'username' : req.body.name,
    // TODO: This password will need to be hashed and stored in db
    'password' : req.body.password,
    'access' : 'low-level'
  })
  .then( user => {
    res.status(200).send(user);
  })
  .catch(err) {
    return res.status(401).send("Failed to add information to database");
  }
});

// NOTE: I wrote this method thinking that there would be a need for it,
// but I don't think we will want to allow seeing all of the users in the db.
/*// Get all the users in the database
router.get('/', (req, res) => {
  User.findAll().then( users => {
    res.send(200).send(users);
  })
  .catch(err) {
    return res.status(401).send("Failure in finding all users");
  }
});*/
