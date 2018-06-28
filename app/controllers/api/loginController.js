const express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser');

const sequelize = require('sequelize');
const db = require('../../models');

router.use(bodyParser.urlencoded({ extended : true }));
router.use(bodyParser.json())

// TODO: Will want to hash the password and query for that hash
router.post('/', (req, res) => {
  res.status(200).send('The object ' + req.name);
  /*db.User.findOne({
    where: {
      // TODO: Determine what format this request will be in
      username : req.body.username,
      password : req.body.password
    }
  })
  .then( user => {
    if (!user) return res.status(401).send("Incorrect username or password");
    res.status(200).send("Found user in database");
  })
  .catch( err => {
    return res.status(401).send("There was a problem finding that user in the database");
  });*/
});

module.exports = (app => {
  app.use('/login',router);
});
