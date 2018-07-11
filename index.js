const bcrypt = require('bcrypt');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongo_client = require('mongodb').MongoClient;
const path = require('path');

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

http.createServer((req, res) => {
    let { method, url } = req;
    if (url === '/') url = '/index.html';

    const req_for_static_file = method === "GET" && !/^\/api\//.test(url);

    if (req_for_static_file) {
        if (URLS_REQUIRING_AUTHENTICATION.indexOf(url) !== -1) {
            const token = extractCookieVal(req.headers.cookie, 'token');
            if (!token) {
                res.statusCode = 401;
                res.end();
            } else {
                jwt.verify(token, SECRET_KEY, (err, decoded) => {
                    if (err) {
                        res.statusCode = 401;
                        res.end();

                        // ALTERNATIVE
                        // sendFile('./static/index.html', res);
                    } else {
                        sendFile(`./static${url}`, res);
                    }
                });
            }
        } else {
            sendFile(`./static${url}`, res);
        }
    } else if (method === "POST" && url === "/api/register") {
        processRequestBody(req, (err, body) => {
            if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Server error' }));
                console.error('Error processing request body');
                console.error(err);
            } else {
                getUser(body.username, (err, user) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: 'Server error' }));
                        throw err;
                    } else if (user) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Username already taken' }));
                    } else {
                        createUser(body.username, body.password, err => {
                            if (err) {
                                res.statusCode = 500;
                                res.end(JSON.stringify({ error: 'Server error' }));
                                throw err;
                            } else {
                                jwt.sign({ username: body.username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                                    if (err) {
                                        console.error(`Error creating JWT token`);
                                        console.error(err);
                                        res.end(JSON.stringify({}));
                                    } else {
                                        res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
                                        res.end(JSON.stringify({
                                            redirect_url: '/boards.html'
                                        }));
                                    };
                                });
                            }
                        });
                    }
                });
            }
        });
    } else if (method === "POST" && url === "/api/login") {
        processRequestBody(req, (err, body) => {
            if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Server error' }));
                console.error('Error processing request body');
                console.error(err);
            } else {
                getUser(body.username, (err, user) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: 'Server error' }));
                        throw err;
                    } else if (!user) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Incorrect username/password' }));
                    } else {
                        bcrypt.compare(body.password, user.password, (err, res) => {
                            if (err) {
                                res.statusCode = 500;
                                res.end(JSON.stringify({ error: 'Server error' }));

                                console.error('Error comparing passwords');
                                console.error(err);
                            } else if (!res) {
                                res.statusCode = 400;
                                res.end(JSON.stringify({ error: 'Incorrect username/password' }));
                            } else {
                                jwt.sign({ username: body.username }, SECRET_KEY, { expiresIn: JWT_EXPIRY }, (err, token) => {
                                    if (err) {
                                        res.statusCode = 500;
                                        res.end(JSON.stringify({ error: 'Server error' }));

                                        console.error(`Error creating JWT token`);
                                        console.error(err);
                                    } else {
                                        res.setHeader('Set-Cookie', `token=${token}; Max-Age=${JWT_EXPIRY}; Path=/`)
                                        res.end(JSON.stringify({
                                            redirect_url: '/boards.html'
                                        }));
                                    };
                                });
                            }
                        });
                    }
                });
            }
        });
    }
}).listen(PORT, () => console.log(`Server is running on port ${PORT}`));

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

function extractCookieVal(cookie, key) {
    if (cookie === undefined || cookie === "") return false;
    const tmp = cookie.split(';')
        .map(kvpair => kvpair.trim().split('='))
        .filter(pair => pair[0] === key);

    if (tmp.length === 0) return false;
    else return tmp[0][1];
}
