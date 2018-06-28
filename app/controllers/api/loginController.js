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
    // TODO: Determine if the request will have a body & name attributes,
    // how does that work?
    'username' : req.body.name,
    // TODO: This password will need to be hashed and stored in db
    'password' : req.body.password,
    'access' : 'low-level'
  })
  .then( user => {
    res.status(200).send(user);
  })
  .catch(err) {
    return res.status(401).send("There was a problem adding the user to the databse.");
  }
});

// Get a single user from the database
router.get('/:id', (req, res) => {
  User.findById(req.params.id)
  .then( user = > {
    if (!user) return res.status(401).send("No user found");
    res.status(200).send(user);
  })
  .catch(err) {
    return res.status(401).send("There was a problem finding the user.")
  }
})

// NOTE: I wrote this method thinking that there would be a need for it,
// but I don't think we will want to allow seeing all of the users in the db.
/*// Get all the users in the database
router.get('/', (req, res) => {
  User.findAll().then( users => {
    res.send(200).send(users);
  })
  .catch(err) {
    return res.status(401).send("There was a problem finding all users");
  }
});*/

module.exports = app => {
  app.use('/', router);
}
