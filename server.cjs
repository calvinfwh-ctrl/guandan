const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const args = process.argv.slice(2);
const portIndex = args.findIndex((arg) => arg === '--port');
const hostIndex = args.findIndex((arg) => arg === '--host');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 7100);
const host = hostIndex >= 0 && args[hostIndex + 1] && !args[hostIndex + 1].startsWith('--')
  ? args[hostIndex + 1]
  : '0.0.0.0';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400).end('Bad request');
    return;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, host, () => {
  console.log(`掼蛋教练：http://localhost:${port}`);
});
