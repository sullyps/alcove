const express = require('express'),
  router = express.Router(),
  //bcrypt = require('bcrypt');
  argon = require('argon2');
const db = require('../../models').getDatabase();

/**
 * Service login requests by matching a username and password to the Database.
 */
router.post('/login', (req, res, next) => {
  db.User.findOne({
    where: {
      username : req.body.username
    }
  }).then (user => {
    // Keep error messages vague to avoid releasing too much information
    if (!user) return res.status(401).send("Wrong username or password");

    argon.verify(user.password, req.body.password).then( match => {
      if (!match) return res.status(401).send("Wrong username or password");
      else res.status(200).send("Successful Login");
    }).catch (err => {
      return res.status(401).send("There was an internal problem comparing the" +
      " password using bcrypt");
    });
  }).catch (err => {
    return res.status(401).send("There was a problem finding that user in the database" + err.message);
  });
});

module.exports = (app => {
  app.use('/api', router);
});
