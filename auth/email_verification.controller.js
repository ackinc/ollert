const common = require("./common");
const config = require("../config");
const db = require("../db");
const mailer = require("../mailer");
const redis = require("../cache");
const util = require("../libs/util");

// The email verification process can be started in 3 ways:
// 1. New user registers
// 2. Unverified user tries to login
// 3. User requests "resend verification email"
function beginEmailVerification(email, cb) {
  const code = util.randomString(
    config.verification_settings.email.token_length
  );
  redis.set(
    `email_verification_token:${email}`,
    code,
    "EX",
    config.verification_settings.email.token_expiry,
    (err) => {
      if (err) {
        cb(err);
      } else {
        mailer.sendEmail("EMAIL_VERIFICATION", email, { code: code });
        cb();
      }
    }
  );
}

function resendVerificationEmailRequestHandler(req, res) {
  db.getUser(req.query.email, (err, user) => {
    if (err)
      res.error(
        err,
        `Retrieving user details on request to resend verification email`
      );
    else if (!user) res.json({ error: "USER_NOT_FOUND" }, 400);
    else
      beginEmailVerification(req.query.email, (err) => {
        if (err) {
          // TODO: retry, instead of misleading the user and expecting
          //         him/her to re-fill the verification form when there's no email
          res.json({ message: "VERIFICATION_EMAIL_SENT" });
        } else {
          res.json({ message: "VERIFICATION_EMAIL_SENT" });
        }
      });
  });
}

function emailVerificationRequestHandler(req, res) {
  db.getUser(req.body.email, (err, user) => {
    if (err)
      res.error(err, `Retrieving user details on request to verify email`);
    else if (!user) res.json({ error: "USER_NOT_FOUND" }, 400);
    else if (user.verified) res.json({ error: "USER_ALREADY_VERIFIED" }, 400);
    else {
      redis.get(`email_verification_token:${req.body.email}`, (err, reply) => {
        if (err)
          res.error(err, `Retrieving email verification token from redis`);
        else if (reply === null) res.json({ error: "TOKEN_EXPIRED" }, 400);
        else if (reply !== req.body.code)
          res.json({ error: "TOKEN_INCORRECT" }, 400);
        else
          db.updateUser(user.username, { verified: true }, (err) => {
            if (err) res.error(err, `Updating user's verified status`);
            else common.handleLoginSuccess({ username: req.body.email }, res);
          });
      });
    }
  });
}

module.exports = {
  beginEmailVerification,
  emailVerificationRequestHandler,
  resendVerificationEmailRequestHandler,
};
