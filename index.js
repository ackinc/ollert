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
const random = require('./libs/random');

const PASSWORD_SALT_ROUNDS = 10;
const PORT = 8000;
const JWT_EXPIRY = 60 * 60 * 24 * 2; // 2 days
const SECRET_KEY = fs.readFileSync('./secret_key.txt');
const URLS_REQUIRING_AUTHENTICATION = [
    '/boards.html'
];

const FB_APP_SECRET = fs.readFileSync('./fb_app_secret.txt');

const GOOGLE_CLIENT_ID = '396738301585-h6sjke032j2nlvn6gc2d41so8d2ins53.apps.googleusercontent.com';
const google_auth_client = new OAuth2Client(GOOGLE_CLIENT_ID);

const MONGO_URL = 'mongodb://localhost:27017';
const MONGO_DBNAME = 'trello-clone'
let db;

mongo_client.connect(MONGO_URL, { useNewUrlParser: true }, (err, client) => {
    if (err) throw err;
    db = client.db(MONGO_DBNAME);
    console.log(`Connected to database at ${MONGO_URL}/${MONGO_DBNAME}`);
});

http.createServer(handleRequest)
    .listen(PORT, () => console.log(`Server is running on port ${PORT}`));



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
    asynctasks.push(cb => checkAuthenticated(req, cb));

    let rb_idx = false;
    if (is_req_body_allowed) {
        rb_idx = asynctasks.length;
        asynctasks.push(cb => processRequestBody(req, cb));
    }

    async.parallel(asynctasks, (err, results) => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));

            console.error(err);
        } else {
            req.token = results[0];
            if (rb_idx !== false) req.body = results[rb_idx];

            if (is_auth_required && !req.token) {
                res.statusCode = 302;
                res.setHeader('location', '/');
                res.end();
            } else if (url === '/index.html' && req.token) {
                // if an already-logged-in user lands on the home page,
                //   redirect him to the boards page
                res.statusCode = 302;
                res.setHeader('location', '/boards.html');
                res.end();
            } else {
                continueHandlingRequest();
            }
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
                    res.end(JSON.stringify({ error: 'Username already taken' }));
                } else {
                    createUser(req.body.username, req.body.password, err => {
                        if (err) {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ error: 'Server error' }));
                            throw err;
                        } else {
                            jwt.sign({ username: req.body.username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                                if (err) {
                                    console.error(`Error creating JWT token`);
                                    console.error(err);
                                    res.end(JSON.stringify({}));
                                } else {
                                    res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
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

            getUser(req.body.username, (err, user) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Server error' }));
                    throw err;
                } else if (!user) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Incorrect username/password' }));
                } else {
                    bcrypt.compare(req.body.password, user.password, (err, matched) => {
                        if (err) {
                            res.statusCode = 500;
                            res.end(JSON.stringify({ error: 'Server error' }));

                            console.error('Error comparing passwords');
                            console.error(err);
                        } else if (!matched) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Incorrect username/password' }));
                        } else {
                            jwt.sign({ username: req.body.username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                                if (err) {
                                    res.statusCode = 500;
                                    res.end(JSON.stringify({ error: 'Server error' }));

                                    console.error(`Error creating JWT token`);
                                    console.error(err);
                                } else {
                                    res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
                                    res.end(JSON.stringify({ redirect_url: '/boards.html' }));
                                };
                            });
                        }
                    });
                }
            });
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

function processRequestBody(req, cb) {
    const body = [];
    req.on('error', err => {
        cb(err);
    }).on('data', chunk => {
        body.push(chunk);
    }).on('end', () => {
        cb(null, JSON.parse(body.join('')));
    });
}

function getUser(username, cb) {
    const collection = db.collection('users');
    collection.find({ username: username }).toArray((err, users) => {
        if (err) cb(err);
        else if (users.length > 0) cb(null, users[0]);
        else cb(null, false);
    });
}

function createUser(username, password, cb) {
    const collection = db.collection('users');

    bcrypt.hash(password, PASSWORD_SALT_ROUNDS, (err, hashed_p) => {
        if (err) cb(err);
        else collection.insertOne({ username: username, password: hashed_p, boards: [] }, cb);
    });
}

function checkAuthenticated(req, cb) {
    const token = extractCookieVal(req.headers.cookie, 'token');
    if (!token) process.nextTick(() => cb(null, false));
    else jwt.verify(token, SECRET_KEY, cb);
}

function extractCookieVal(cookie, key) {
    if (cookie === undefined || cookie === "") return false;
    const tmp = cookie.split(';')
        .map(kvpair => kvpair.trim().split('='))
        .filter(pair => pair[0] === key);

    if (tmp.length === 0) return false;
    else return tmp[0][1];
}

function loginWithGoogle(token, res) {
    google_auth_client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID }, (err, ticket) => {
        if (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));
            console.error(err);
        } else {
            const username = ticket.getPayload().email;

            jwt.sign({ username: username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Server error' }));

                    console.error(`Error creating JWT token`);
                    console.error(err);
                } else {
                    res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
                    res.end(JSON.stringify({ redirect_url: '/boards.html' }));
                };
            });

            // WARNING: OK to ignore DUP_KEY errors below,
            //            but what about other kinds of DB errors?
            createUser(username, random.randomString(12), function () { });
        }
    });
}

function loginWithFacebook(token, res) {
    const appsecret_proof = crypto.createHmac('sha256', FB_APP_SECRET)
        .update(token)
        .digest('hex');
    FB.api('/me', { access_token: token, appsecret_proof: appsecret_proof, fields: 'email' }, response => {
        if (response.error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Server error' }));
            console.error(err);
        } else {
            const username = response.email;

            jwt.sign({ username: username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Server error' }));

                    console.error(`Error creating JWT token`);
                    console.error(err);
                } else {
                    res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
                    res.end(JSON.stringify({ redirect_url: '/boards.html' }));
                };
            });

            // WARNING: OK to ignore DUP_KEY errors below,
            //            but what about other kinds of DB errors?
            createUser(username, random.randomString(12), function () { });
        }
    });
}
