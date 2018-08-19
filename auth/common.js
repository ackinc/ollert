const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const config = require('../config');

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

module.exports = { handleLoginSuccess };
