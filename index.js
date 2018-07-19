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

const async = require('./libs/async');
const config = require('./config');
const middleware = require('./libs/middleware');
const util = require('./libs/util');

const URLS_REQUIRING_AUTHENTICATION = [
    '/boards.html'
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
    // TODO: do we have to do this every time?
    res.error = sendServerErrorResponse;
    res.json = sendJSONResponse;
    res.redirect = sendRedirectResponse;
    res.sendFile = sendStaticFileResponse;

    let { method, url } = req;
    if (url === '/') url = '/index.html';

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
            if (req.body.provider === 'google') return loginWithGoogle(req.body.token, res);
            else if (req.body.provider === 'facebook') return loginWithFacebook(req.body.token, res);
            else loginWithPassword(req.body.username, req.body.password, res);
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

function sendStaticFileResponse(filename) {
    fs.readFile(filename, (err, data) => {
        if (err && err.code === 'ENOENT') {
            this.json({ error: 'RESOURCE_NOT_FOUND' }, 404);
        } else if (err) {
            this.error(err, `Reading file from file system`);
        } else {
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

function createUser(username, password, verified, cb = function () { }) {
    const collection = db.collection('users');
    collection.insertOne({ username: username, password: password, verified: verified, boards: [] }, cb);
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



// functions involved in the login process
function handleLoginSuccess(payload, res) {
    if (cb === undefined) cb = function () { };
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
                if (err && err.code !== 11000) { // ignore DUP_KEY errors
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
                if (err && err.code !== 11000) { // ignore DUP_KEY errors
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



function genericCallback(err) {
    if (err) console.error(err);
}
