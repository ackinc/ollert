const util = require('./util');

// extracts query string from request url and makes it available as an object
//   at req.query
function processRequestQuery(req, cb) {
    let tmp, query_string;

    if ((tmp = req.url.indexOf('?')) === -1) {
        req.query = {};
    } else {
        query_string = req.url.substr(tmp + 1);
        if ((tmp = query_string.indexOf('#')) !== -1) query_string = query_string.substr(0, tmp);
        req.query = util.stringToKeyValuePairs(query_string, '&', '=');
    }
    process.nextTick(cb);
}

// extracts cookie string from request headers and makes it available as an object
//   at req.cookie
function processRequestCookies(req, cb) {
    if (!req.headers.cookie) req.cookie = {};
    else req.cookie = util.stringToKeyValuePairs(req.headers.cookie, ';', '=');
    process.nextTick(cb);
}

// extracts body from request and makes it available as an object
//   at req.body
function processRequestBody(req, cb) {
    if (req.method === "GET") {
        req.body = {};
        process.nextTick(cb);
    } else {
        const tmp = [];
        req
            .on('error', cb)
            .on('data', chunk => {
                tmp.push(chunk);
            }).on('end', () => {
                try {
                    // TODO: don't assume request has Content-Type JSON
                    req.body = JSON.parse(tmp.join(''));
                } catch (e) {
                    req.body = {};
                } finally {
                    cb();
                }
            });
    }
}

module.exports = {
    processRequestQuery: processRequestQuery,
    processRequestCookies: processRequestCookies,
    processRequestBody: processRequestBody
};
