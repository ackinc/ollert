const bcrypt = require("bcrypt");

const config = require("../config");
const db = require("../db");
const mailer = require("../mailer");
const redis = require("../cache");
const util = require("../libs/util");

function forgotPasswordRequestHandler(req, res) {
  const username = req.query.username;
  db.getUser(username, (err, user) => {
    if (err) {
      res.error(
        err,
        `Retrieving user from DB after receiving forgot password request`
      );
    } else if (!user) {
      res.json({ error: "USER_NOT_FOUND" }, 400);
    } else {
      const code = util.randomString(config.passwordReset.tokenLength);
      redis.set(
        `reset_password_token:${username}`,
        code,
        "EX",
        config.passwordReset.tokenExpiry,
        (err) => {
          if (err) res.error(err, `Setting reset password token in redis`);
          else {
            res.json({
              message: "RESET_PASSWORD_EMAIL_SENT",
              validity: config.passwordReset.tokenExpiry,
            });

            const pwreset_link = `${process.env.SITE_URL}/reset_password?username=${username}&password_reset_code=${code}`;
            mailer.sendEmail("passwordReset", username, { pwreset_link });
          }
        }
      );
    }
  });
}

function resetPasswordRequestHandler(req, res) {
  db.getUser(req.body.username, (err, user) => {
    if (err)
      res.error(
        err,
        `Retrieving user details from DB on reset password request`
      );
    else if (!user) res.json({ error: "USER_NOT_FOUND" }, 400);
    else {
      redis.get(`reset_password_token:${req.body.username}`, (err, reply) => {
        if (err) res.error(err, `Retrieving reset password token from Redis`);
        else if (!reply) res.json({ error: "TOKEN_EXPIRED" }, 400);
        else if (reply !== req.body.code)
          res.json({ error: "INCORRECT_TOKEN" }, 400);
        else {
          bcrypt.hash(
            req.body.password,
            config.passwordSaltRounds,
            (err, hashed_p) => {
              if (err) res.error(err, `Encrypting new password`);
              else
                db.updateUser(
                  req.body.username,
                  { verified: true, password: hashed_p },
                  (err) => {
                    if (err) res.error(err, `Updating user's password`);
                    else res.json({ message: "PASSWORD_UPDATED" });
                  }
                );
            }
          );
        }
      });
    }
  });
}

module.exports = {
  forgotPasswordRequestHandler,
  resetPasswordRequestHandler,
};
