const express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser');

const sequelize = require('sequelize');
const db = require('../../models').getDatabase();

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
