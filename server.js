const http = require('http');
const fs = require('fs');
const path = require('path');

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/app/index.html' : req.url;
  let filePath = path.join(__dirname, urlPath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath);
  const type = (mime[ext] || 'text/plain') + ';charset=utf-8';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}).listen(8000, '0.0.0.0', () => {
  console.log('서버 시작: http://localhost:8000/app/index.html');
});
