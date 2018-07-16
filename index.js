const bcrypt = require('bcrypt');
const crypto = require('crypto');
const FB = require('fb');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongo_client = require('mongodb').MongoClient;
const { OAuth2Client } = require('google-auth-library');
const path = require('path');

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

http.createServer(handleRequest)
    .listen(config.port, () => console.log(`Server is running on port ${config.port}`));



//////////////////////
// HELPER FUNCTIONS //
//////////////////////
function handleRequest(req, res) {
    let { method, url } = req;
    if (url === '/') url = '/index.html';

    const is_auth_required = URLS_REQUIRING_AUTHENTICATION.indexOf(url) !== -1;
    const is_req_for_static_file = method === "GET" && !/^\/api\//.test(url);
    const is_req_body_allowed = method !== "GET";

    const asynctasks = [];
    asynctasks.push(cb => middleware.processRequestQuery(req, cb));
    asynctasks.push(cb => middleware.processRequestCookies(req, cb));
    asynctasks.push(cb => middleware.processRequestBody(req, cb));

    async.parallel(asynctasks, err => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));

            console.error(err);
        } else if (req.cookies.token) {
            decodeToken(req, err => {
                if (err || req.decoded === null) {
                    // bad token, so redirect to home
                    res.statusCode = 302;
                    res.setHeader('location', '/');
                    res.end();
                } else if (req.url === '/index.html') {
                    // if an already-logged-in user lands on the home page,
                    //   redirect him to the boards page
                    res.statusCode = 302;
                    res.setHeader('location', '/boards.html');
                    res.end();
                } else {
                    continueHandlingRequest();
                }
            });
        } else if (is_auth_required) {
            res.statusCode = 302;
            res.setHeader('location', '/');
            res.end();
        } else {
            continueHandlingRequest();
        }
    });

    function continueHandlingRequest() {
        if (is_req_for_static_file) {
            sendFile(`./static${url}`, res);
        } else if (method === "POST" && url === "/api/register") {
            getUser(req.body.username, (err, user) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Server error' }));
                    throw err;
                } else if (user) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'USERNAME_TAKEN' }));
                } else {
                    createUser(req.body.username, req.body.password, false, err => {
                        if (err) {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ error: 'Server error' }));
                            throw err;
                        } else {
                            jwt.sign({ username: req.body.username }, config.jsonwebtoken.key, { expiresIn: config.jsonwebtoken.expiry }, (err, token) => {
                                if (err) {
                                    console.error(`Error creating JWT token`);
                                    console.error(err);
                                    res.end(JSON.stringify({}));
                                } else {
                                    res.setHeader('Set-Cookie', `token=${token}; Max-Age=${config.jsonwebtoken.expiry}; Path=/`)
                                    res.end(JSON.stringify({ redirect_url: '/boards.html' }));
                                };
                            });
                        }
                    });
                }
            });
        } else if (method === "POST" && url === "/api/login") {
            if (req.body.provider === 'google') return loginWithGoogle(req.body.token, res);
            else if (req.body.provider === 'facebook') return loginWithFacebook(req.body.token, res);
            else loginWithPassword(req.body.username, req.body.password, res);
        }
    }
}

function sendFile(filename, res) {
    fs.readFile(filename, (err, data) => {
        if (err && err.code === 'ENOENT') {
            res.statusCode = 404;
            res.end();
        } else if (err) {
            throw err;
        } else {
            res.setHeader('Content-type', getMIMEType(filename));
            res.end(data);
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

function getUser(username, cb) {
    const collection = db.collection('users');
    collection.find({ username: username }).toArray((err, users) => {
        if (err) cb(err);
        else if (users.length > 0) cb(null, users[0]);
        else cb(null, false);
    });
}

function createUser(username, password, verified, cb) {
    const collection = db.collection('users');

    bcrypt.hash(password, config.bcrypt.rounds, (err, hashed_p) => {
        if (err) cb(err);
        else collection.insertOne({ username: username, password: hashed_p, verified: verified, boards: [] }, cb);
    });
}

function decodeToken(req, cb) {
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

function extractCookieVal(cookie, key) {
    if (cookie === undefined || cookie === "") return false;
    const tmp = util.stringToKeyValuePairs(cookie, ';', '=');
    return tmp[key] || false;
}

function sendLoginSuccessResponse(payload, res, cb) {
    if (cb === undefined) cb = function () { };
    jwt.sign(payload, config.jsonwebtoken.key, { expiresIn: config.jsonwebtoken.expiry }, (err, token) => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));

            console.error(`Error creating JWT token`);
            console.error(err);
            cb(err);
        } else {
            res.setHeader('Set-Cookie', `token=${token}; Max-Age=${config.jsonwebtoken.expiry}; Path=/`)
            res.end(JSON.stringify({ redirect_url: '/boards.html' }));
            cb(null, token);
        };
    });
}

function loginWithGoogle(token, res) {
    google_auth_client.verifyIdToken({ idToken: token, audience: config.google.client_id }, (err, ticket) => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));
            console.error(err);
        } else {
            const username = ticket.getPayload().email;
            sendLoginSuccessResponse({ username: username }, res);

            // WARNING: OK to ignore DUP_KEY errors below,
            //            but what about other kinds of DB errors?
            createUser(username, util.randomString(12), true, function () { });
        }
    });
}

function loginWithFacebook(token, res) {
    const appsecret_proof = crypto.createHmac('sha256', config.facebook.app_secret)
        .update(token)
        .digest('hex');
    FB.api('/me', { access_token: token, appsecret_proof: appsecret_proof, fields: 'email' }, response => {
        if (response.error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));
            console.error(err);
        } else {
            const username = response.email;
            sendLoginSuccessResponse({ username: username }, res);

            // WARNING: OK to ignore DUP_KEY errors below,
            //            but what about other kinds of DB errors?
            createUser(username, util.randomString(12), true, function () { });
        }
    });
}

function loginWithPassword(username, password, res) {
    getUser(username, (err, user) => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));
            throw err;
        } else if (!user) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Incorrect username/password' }));
        } else {
            bcrypt.compare(password, user.password, (err, matched) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Server error' }));

                    console.error('Error comparing passwords');
                    console.error(err);
                } else if (!matched) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Incorrect username/password' }));
                } else {
                    sendLoginSuccessResponse({ username: username }, res);
                }
            });
        }
    });
}
