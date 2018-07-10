const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 8000;

http.createServer((req, res) => {
    let { method, url } = req;
    if (url === '/') url = '/index.html';

    const req_for_static_file = method === "GET" && !/^\/api\//.test(url);

    if (req_for_static_file) {
        fs.readFile(`./static${url}`, 'utf8', (err, data) => {
            if (err) throw err;

            const ext = path.extname(url).substr(1); // remove the leading '.'
            res.setHeader('Content-type', ext === 'js' ? 'application/javascript' : `text/${ext}`);
            res.end(data);
        });
    } else {
        res.end('Received request for other than static file!');
    }
}).listen(PORT, () => console.log(`Server is running on port ${PORT}`));
