/* Functions to deal with components of URLs */
function parse(url) {
    return {
        protocol: protocol(url),
        hostname: hostname(url),
        port: port(url),
        path: path(url),
        query: query(url),
        fragment: fragment(url)
    }
}

function protocol(url) {
    const end = url.indexOf('://');
    if (end === -1) return 'http';
    else return url.substr(0, end);
}

function hostname(url) {
    let tmp;
    const start = (tmp = url.indexOf('://')) === -1 ? 0 : tmp + 3;

    let end = firstOccurrenceOf([':', '/', '?', '#'], url.substr(start));
    if (end === -1) end = undefined;

    return url.substr(start, end);
}

function port(url) {
    let tmp;
    return (tmp = url.match(/:(\d+)/)) === null ? 80 : +tmp[1];
}

function path(url) {
    // may be absent

    // if present, will start with '/' and may end with ['?', '#']
    let end = firstOccurrenceOf(['?', '#'], url);
    if (end === -1) end = url.length;

    let host_start, path_start;
    host_start = url.indexOf('://');

    if (host_start === -1) host_start = 0;
    else host_start += 3;

    path_start = url.substr(host_start, end - host_start).indexOf('/');

    if (path_start === -1) return '/';
    else {
        path_start += host_start;
        return url.substr(path_start, end - path_start);
    }
}

function query(url) {
    let start = url.indexOf('?');
    if (start === -1) return '';
    start += 1;

    let tmp;
    const end = (tmp = url.indexOf('#')) === -1 ? url.length : tmp;

    return url.substr(start, end - start);
}

function fragment(url) {
    const start = url.indexOf('#');
    if (start !== -1) return url.substr(start + 1);
    else return '';
}

function firstOccurrenceOf(chars, s) {
    return chars.map(c => s.indexOf(c)).reduce((acc, i) => i >= 0 && (acc === -1 || i < acc) ? i : acc, -1);
}

module.exports = {
    parse: parse,
    protocol: protocol,
    hostname: hostname,
    path: path,
    query: query,
    fragment: fragment
};
