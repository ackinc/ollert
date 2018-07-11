const bcrypt = require('bcrypt');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongo_client = require('mongodb').MongoClient;
const path = require('path');

const async = require('./libs/async');

const PASSWORD_SALT_ROUNDS = 10;
const PORT = 8000;
const JWT_EXPIRY = 60 * 60 * 24 * 2; // 2 days
const SECRET_KEY = fs.readFileSync('./secret_key.txt');
const URLS_REQUIRING_AUTHENTICATION = [
    '/boards.html'
];

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
    fs.readFile(filename, 'utf8', (err, data) => {
        if (err && err.code === 'ENOENT') {
            res.statusCode = 404;
            res.end();
        } else if (err) {
            throw err;
        } else {
            const ext = path.extname(filename).substr(1); // remove the leading '.'
            res.setHeader('Content-type', ext === 'js' ? 'application/javascript' : `text/${ext}`);
            res.end(data);
        }
    });
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
        else collection.insertMany([{ username: username, password: hashed_p, boards: [] }], cb);
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
