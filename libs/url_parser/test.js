const url_parser = require('./index');

const full_url = 'http://www.localhost.com:8000/api/boards?username=anirudh.nimmagadda@gmail.com&password=abcdef#fragment';
const minimal_url = 'localhost';

console.log(url_parser.parse(full_url));
console.log(url_parser.parse(minimal_url));
