const express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser');

const bcrypt = require('bcrypt');
const db = require('../../models').getDatabase();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended : true }));

// User requests to login with a username and password
router.post('/login', (req, res) => {
  db.User.findOne({
    where: {
      username : req.body.username
    }
  })
  .then (user => {
    // Keep error messages vague to avoid releasing too much information
    if (!user) return res.status(401).send("Wrong username or password");

    bcrypt.compare(req.body.password, user.password).then( match => {
      if (!match) return res.status(401).send("Wrong username or password");
      else res.status(200).send("Successful Login");
    })
    .catch (err => {
      return res.status(401).send("There was an internal problem comparing the" +
      " password using bcrypt");
    });
  })
  .catch (err => {
    return res.status(401).send("There was a problem finding that user in the database" + err.message);
  });
});

module.exports = (app => {
  app.use('/api',router);
});
