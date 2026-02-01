const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.json': 'application/json'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    
    // Handle routes
    if (filePath === './toravere' || filePath === './toravere/') {
        filePath = './toravere.html';
    } else if (filePath === './heatmap' || filePath === './heatmap/') {
        filePath = './heatmap.html';
    } else if (filePath === './toravere-heatmap' || filePath === './toravere-heatmap/') {
        filePath = './toravere-heatmap.html';
    } else if (filePath === './streaks' || filePath === './streaks/') {
        filePath = './streaks.html';
    } else if (filePath === './toravere-streaks' || filePath === './toravere-streaks/') {
        filePath = './toravere-streaks.html';
    } else if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log('Press Ctrl+C to stop the server');
});
