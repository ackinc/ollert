const bcrypt = require('bcrypt');
const crypto = require('crypto');
const FB = require('fb');
const { OAuth2Client } = require('google-auth-library');

const common = require('./common');
const config = require('../config');
const db = require('../db');
const ev = require('./email_verification.controller');
const google_auth_client = new OAuth2Client(config.google.client_id);
const util = require('../libs/util');

function login(req, res) {
    if (req.body.provider === 'facebook') loginWithFacebook(req, res);
    else if (req.body.provider === 'google') loginWithGoogle(req, res);
    else loginWithPassword(req, res);
}

function loginWithGoogle(req, res) {
    const token = req.body.token;

    google_auth_client.verifyIdToken({ idToken: token, audience: config.google.client_id }, (err, ticket) => {
        if (err) {
            res.error(err, `Verifying Google ID token on login attempt`);
        } else {
            const username = ticket.getPayload().email;

            db.createUser(username, util.randomString(12), true, err => {
                if (err && err.code === 11000) {
                    common.handleLoginSuccess({ username: username }, res);
                    db.updateUser(username, { verified: true });
                } else if (err) {
                    res.error(err, `Creating user on login with Google`);
                } else {
                    common.handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

function loginWithFacebook(req, res) {
    const token = req.body.token;

    const appsecret_proof = crypto.createHmac('sha256', config.facebook.app_secret)
        .update(token)
        .digest('hex');
    FB.api('/me', { access_token: token, appsecret_proof: appsecret_proof, fields: 'email' }, response => {
        if (response.error) {
            res.error(response.error, `Retrieving user details using Facebook token`);
        } else {
            const username = response.email;

            db.createUser(username, util.randomString(12), true, err => {
                if (err && err.code === 11000) {
                    common.handleLoginSuccess({ username: username }, res);
                    db.updateUser(username, { verified: true });
                } else if (err) {
                    res.error(err, `Creating user on login with Facebook`);
                } else {
                    common.handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

function loginWithPassword(req, res) {
    const username = req.body.username, password = req.body.password;

    db.getUser(username, (err, user) => {
        if (err) {
            res.error(err, `Retrieving user from DB`);
        } else if (!user) {
            res.json({ error: 'INCORRECT_USERNAME_PASSWORD' }, 400);
        } else {
            bcrypt.compare(password, user.password, (err, matched) => {
                if (err) {
                    res.error(err, `Comparing passwords on login attempt`);
                } else if (!matched) {
                    res.json({ error: 'INCORRECT_USERNAME_PASSWORD' }, 400);
                } else if (!user.verified) {
                    ev.beginEmailVerification(username, err => {
                        if (err) {
                            // TODO: should be doing something else, like trying again
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' }, 400);

                            console.error(err);
                        } else {
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' }, 400);
                        }
                    });
                } else {
                    common.handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

module.exports = { login };
