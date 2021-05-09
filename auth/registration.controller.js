const db = require("../db");
const ev = require("./email_verification.controller");

function registerNewUser(req, res) {
  const username = req.body.username,
    password = req.body.password;
  db.createUser(username, password, false, (err) => {
    if (err && err.code === 11000) {
      res.json({ error: "USERNAME_IN_USE" }, 400);
    } else if (err) {
      res.error(err, `Creating new user on registration`);
    } else {
      ev.beginEmailVerification(username, (err) => {
        if (err) {
          // TODO: should be doing something else, like trying again
          res.json({ message: "VERIFICATION_EMAIL_SENT" });

          console.error(err);
        } else {
          res.json({ message: "VERIFICATION_EMAIL_SENT" });
        }
      });
    }
  });
}

module.exports = {
  registerNewUser,
};
