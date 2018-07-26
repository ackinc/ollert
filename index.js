const bcrypt = require('bcrypt');
const crypto = require('crypto');
const FB = require('fb');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongo_client = require('mongodb').MongoClient;
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const pug = require('pug');
const Redis = require('redis');
const URL = require('url');

const async = require('./libs/async');
const config = require('./config');
const middleware = require('./libs/middleware');
const util = require('./libs/util');

const URLS_REQUIRING_AUTHENTICATION = [
    '/boards.html',
    '/api/me/boards'
];

const google_auth_client = new OAuth2Client(config.google.client_id);

let db;
mongo_client.connect(config.db.url, { useNewUrlParser: true }, (err, client) => {
    if (err) throw err;
    db = client.db(config.db.dbname);
    console.log(`Connected to database at ${config.db.url}/${config.db.dbname}`);
});

const redis = Redis.createClient(config.cache.url);
redis.on('connect', () => console.log(`Connected to cache at ${config.cache.url}`));
redis.on('error', err => { throw err; });

const mail_transporter = nodemailer.createTransport(config.email);

http.createServer(handleRequest)
    .listen(config.port, () => console.log(`Server is running on port ${config.port}`));



//////////////////////
// HELPER FUNCTIONS //
//////////////////////
function handleRequest(req, res) {
    res.error = sendServerErrorResponse;
    res.json = sendJSONResponse;
    res.redirect = sendRedirectResponse;
    res.sendFile = sendStaticFileResponse;

    let { method, url } = req;
    url = URL.parse(url).pathname;
    if (url === '/') url = '/index.html';
    else if (url === '/reset_password') url = '/index.html';

    const is_auth_required = URLS_REQUIRING_AUTHENTICATION.indexOf(url) !== -1;
    const is_req_for_static_file = method === "GET" && !/^\/api\//.test(url);

    const asynctasks = [];
    asynctasks.push(cb => middleware.processRequestQuery(req, cb));
    asynctasks.push(cb => middleware.processRequestCookies(req, cb));
    asynctasks.push(cb => middleware.processRequestBody(req, cb));

    async.parallel(asynctasks, err => {
        if (err) {
            res.error(err, `Pre-processing incoming request`);
        } else {
            decodeRequestToken(req, err => {
                if (err) {
                    res.error(err, `Decoding JWT token`);
                } else if (is_auth_required && req.decoded === null) {
                    // Bad token, so redirect to home
                    // WARNING: this could cause some *bad* user experiences
                    //   1. user is editing boards
                    //   2. token expires before he is done
                    //   3. user tries to save edits
                    //   4. redirected to home page since token has expired; edits lost!
                    // Possible fix: extend expiry time of cookie and token every time they are
                    //   successfully sent
                    res.redirect('/');
                } else if (req.url === '/index.html' && req.decoded !== null) {
                    // if an already-logged-in user lands on the home page,
                    //   redirect him to the boards page
                    res.redirect('/boards.html');
                } else {
                    continueHandlingRequest();
                }
            });
        }
    });

    function continueHandlingRequest() {
        if (is_req_for_static_file) {
            res.sendFile(`./static${url}`);
        } else if (method === "POST" && url === "/api/register") {
            registerNewUser(req, res);
        } else if (method === "POST" && url === "/api/login") {
            if (req.body.provider === 'google') loginWithGoogle(req.body.token, res);
            else if (req.body.provider === 'facebook') loginWithFacebook(req.body.token, res);
            else loginWithPassword(req.body.username, req.body.password, res);
        } else if (method === "GET" && url === '/api/resend_verification_email') {
            resendVerificationEmailRequestHandler(req, res);
        } else if (method === "POST" && url === '/api/verify_email') {
            emailVerificationRequestHandler(req, res);
        } else if (method === "GET" && url === '/api/forgot_password') {
            forgotPasswordRequestHandler(req, res);
        } else if (method === "POST" && url === '/api/reset_password') {
            resetPasswordRequestHandler(req, res);
        } else if (method === "GET" && url === '/api/me/boards') {
            retrieveUserBoards(req, res);
        } else if (method === "POST" && url === '/api/me/boards') {
            saveUserBoards(req, res);
        }
    }
}

function decodeRequestToken(req, cb) {
    const token = req.cookie.token;
    if (!token) {
        req.decoded = null;
        process.nextTick(cb);
    } else {
        jwt.verify(token, config.jsonwebtoken.key, (err, decoded) => {
            if (err) {
                cb(err);
            } else {
                req.decoded = decoded;
                cb();
            }
        });
    }
}



// functions to make sending responses easier
function sendServerErrorResponse(err, context) {
    this.statusCode = 500;
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify({ error: 'SERVER_ERROR' }));

    console.error(`Error context: ${context}`);
    console.error(err);
}

function sendJSONResponse(body, status = 200) {
    this.statusCode = status;
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(body));
}

function sendRedirectResponse(location) {
    this.statusCode = 302;
    this.setHeader('location', location);
    this.end();
}

function sendStaticFileResponse(filename, status_code = 200) {
    fs.readFile(filename, (err, data) => {
        if (err && err.code === 'ENOENT') {
            this.sendFile('./static/404.html', 404);
        } else if (err) {
            this.error(err, `Reading file from file system`);
        } else {
            this.statusCode = status_code;
            this.setHeader('Content-type', getMIMEType(filename));
            this.end(data);
        }
    });
}

function getMIMEType(filename) {
    const ext = path.extname(filename).substr(1); // remove the leading '.'
    switch (ext) {
        case 'js':
            return `application/javascript`;
        case 'html':
        case 'css':
            return `text/${ext}`;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
            return `image/${ext}`;
        default:
            throw new Error('Asked for MIME type of file with unrecognized extension');
    }
}



// functions dealing with the DB
function getUser(username, cb) {
    const collection = db.collection('users');
    collection.find({ username: username }).toArray((err, users) => {
        if (err) cb(err);
        else if (users.length > 0) cb(null, users[0]);
        else cb(null, false);
    });
}

function createUser(username, password, verified, cb = genericCallback) {
    const collection = db.collection('users');
    collection.insertOne({ username: username, password: password, verified: verified, boards: '[]' }, cb);
}

function updateUser(username, data, cb = genericCallback) {
    db.collection('users').updateOne({ username: username }, { $set: data }, cb);
}

function retrieveUserBoards(req, res) {
    const username = req.decoded.username;
    getUser(username, (err, user) => {
        if (err) res.error(err, `Retrieving user details from DB on receiving request for user's boards`);
        else if (!user) res.json({ error: 'USER_NOT_FOUND' }, 400);
        else res.json({ boards: JSON.parse(user.boards) });
    });
}

function saveUserBoards(req, res) {
    const username = req.decoded.username;
    const boards = req.body.boards;
    updateUser(username, { boards: JSON.stringify(boards) }, err => {
        if (err) res.error(err, `Saving user's boards to DB`);
        else res.json({ message: 'BOARDS_SAVED' });
    });
}



// functions involved in the registration process
function registerNewUser(req, res) {
    const username = req.body.username, password = req.body.password;
    bcrypt.hash(password, config.bcrypt.rounds, (err, hashed_p) => {
        if (err) res.error(err, `Encrypting password on new user registration`);
        else {
            createUser(username, hashed_p, false, err => {
                if (err && err.code === 11000) {
                    res.json({ error: 'USERNAME_IN_USE' }, 400);
                } else if (err) {
                    res.error(err, `Creating new user in DB on registration`);
                } else {
                    beginEmailVerification(username, err => {
                        if (err) {
                            // TODO: should be doing something else, like trying again
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' });

                            console.error(err);
                        } else {
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' });
                        }
                    });
                }
            });
        }
    });
}

// The email verification process can be started in 3 ways:
// 1. New user registers
// 2. Unverified user tries to login
// 3. User requests "resend verification email"
function beginEmailVerification(email, cb) {
    const code = util.randomString(config.verification_settings.email.token_length);
    redis.set(`email_verification_token:${email}`, code, 'EX', config.verification_settings.email.token_expiry, err => {
        if (err) {
            cb(err);
        } else {
            sendVerificationEmail(email, code);
            cb();
        }
    });
}

function resendVerificationEmailRequestHandler(req, res) {
    getUser(req.query.email, (err, user) => {
        if (err) res.error(err, `Retrieving user details on request to resend verification email`);
        else if (!user) res.json({ error: 'USER_NOT_FOUND' }, 400);
        else beginEmailVerification(req.query.email, err => {
            if (err) {
                // TODO: should be doing something else, like trying again
                res.json({ message: 'VERIFICATION_EMAIL_SENT' });
            } else {
                res.json({ message: 'VERIFICATION_EMAIL_SENT' });
            }
        });
    });
}

function sendVerificationEmail(email, code, cb = genericCallback) {
    const html = pug.renderFile(config.email_templates.EMAIL_VERIFICATION.template_path, { code: code });
    const options = {
        from: config.email.auth.user,
        to: email,
        subject: config.email_templates.EMAIL_VERIFICATION.subject,
        html: html
    };
    mail_transporter.sendMail(options, cb);
}

function emailVerificationRequestHandler(req, res) {
    getUser(req.body.email, (err, user) => {
        if (err) res.error(err, `Retrieving user details on request to resend verification email`);
        else if (!user) res.json({ error: 'USER_NOT_FOUND' }, 400);
        else if (user.verified) res.json({ error: 'USER_ALREADY_VERIFIED' }, 400);
        else {
            redis.get(`email_verification_token:${req.body.email}`, (err, reply) => {
                if (err) res.error(err, `Retrieving email verification token from redis`);
                else if (reply === null) res.json({ error: 'TOKEN_EXPIRED' }, 400);
                else if (reply !== req.body.code) res.json({ error: 'TOKEN_INCORRECT' }, 400);
                else updateUser(user.username, { verified: true }, err => {
                    if (err) res.error(err, `Updating user's verified status`);
                    else handleLoginSuccess({ username: req.body.email }, res);
                });
            });
        }
    });
}



// functions involved in the login process
function handleLoginSuccess(payload, res) {
    jwt.sign(payload, config.jsonwebtoken.key, { expiresIn: config.jsonwebtoken.expiry }, (err, token) => {
        if (err) {
            res.error(err, 'Creating JWT token on login');
        } else {
            res.setHeader('Set-Cookie', `token=${token}; Max-Age=${config.jsonwebtoken.expiry}; Path=/`);
            res.json({ redirect_url: '/boards.html' });
        };
    });
}

function loginWithGoogle(token, res) {
    google_auth_client.verifyIdToken({ idToken: token, audience: config.google.client_id }, (err, ticket) => {
        if (err) {
            res.error(err, `Verifying Google ID token on login attempt`);
        } else {
            const username = ticket.getPayload().email;

            createUser(username, util.randomString(12), true, err => {
                if (err && err.code === 11000) {
                    handleLoginSuccess({ username: username }, res);
                    updateUser(username, { verified: true });
                } else if (err) {
                    res.error(err, `Creating user on login with Google`);
                } else {
                    handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

function loginWithFacebook(token, res) {
    const appsecret_proof = crypto.createHmac('sha256', config.facebook.app_secret)
        .update(token)
        .digest('hex');
    FB.api('/me', { access_token: token, appsecret_proof: appsecret_proof, fields: 'email' }, response => {
        if (response.error) {
            res.error(response.error, `Retrieving user details using Facebook token`);
        } else {
            const username = response.email;

            createUser(username, util.randomString(12), true, err => {
                if (err && err.code === 11000) {
                    handleLoginSuccess({ username: username }, res);
                    updateUser(username, { verified: true });
                } else if (err) {
                    res.error(err, `Creating user on login with Facebook`);
                } else {
                    handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

function loginWithPassword(username, password, res) {
    getUser(username, (err, user) => {
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
                    beginEmailVerification(username, err => {
                        if (err) {
                            // TODO: should be doing something else, like trying again
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' }, 400);

                            console.error(err);
                        } else {
                            res.json({ message: 'VERIFICATION_EMAIL_SENT' }, 400);
                        }
                    });
                } else {
                    handleLoginSuccess({ username: username }, res);
                }
            });
        }
    });
}

function forgotPasswordRequestHandler(req, res) {
    const username = req.query.username;
    getUser(username, (err, user) => {
        if (err) {
            res.error(err, `Retrieving user from DB after receiving forgot password request`);
        } else if (!user) {
            res.json({ error: 'USER_NOT_FOUND' }, 400);
        } else {
            const code = util.randomString(config.password_reset_settings.token_length);
            redis.set(`reset_password_token:${username}`, code, 'EX', config.password_reset_settings.token_expiry, err => {
                if (err) res.error(err, `Setting reset password token in redis`);
                else {
                    res.json({ message: 'RESET_PASSWORD_EMAIL_SENT', validity: config.password_reset_settings.token_expiry });
                    sendResetPasswordEmail(username, `${config.site_url}/reset_password?username=${username}&password_reset_code=${code}`);
                }
            });
        }
    })
}

function sendResetPasswordEmail(email, pwreset_link, cb = genericCallback) {
    const html = pug.renderFile(config.email_templates.RESET_PASSWORD.template_path, { pwreset_link: pwreset_link });
    const options = {
        from: config.email.auth.user,
        to: email,
        subject: config.email_templates.RESET_PASSWORD.subject,
        html: html
    };
    mail_transporter.sendMail(options, cb);
}

function resetPasswordRequestHandler(req, res) {
    getUser(req.body.username, (err, user) => {
        if (err) res.error(err, `Retrieving user details from DB on reset password request`);
        else if (!user) res.json({ error: 'USER_NOT_FOUND' }, 400);
        else {
            redis.get(`reset_password_token:${req.body.username}`, (err, reply) => {
                if (err) res.error(err, `Retrieving reset password token from Redis`);
                else if (!reply) res.json({ error: 'TOKEN_EXPIRED' }, 400);
                else if (reply !== req.body.code) res.json({ error: 'INCORRECT_TOKEN' }, 400);
                else {
                    bcrypt.hash(req.body.password, config.bcrypt.rounds, (err, hashed_p) => {
                        if (err) res.error(err, `Encrypting new password`);
                        else updateUser(req.body.username, { verified: true, password: hashed_p }, err => {
                            if (err) res.error(err, `Updating user's password`);
                            else res.json({ message: 'PASSWORD_UPDATED' });
                        });
                    });
                }
            });
        }
    });
}



function genericCallback(err) {
    if (err) console.error(err);
}
