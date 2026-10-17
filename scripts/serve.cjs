const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const port = Number(process.argv[2] || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('Use a port between 1 and 65535');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json'};
http.createServer((request, response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  let route;
  try { route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  // Match the canonical routes cached by the production Service Worker.
  if (route === '/') route = '/index.html';
  if (route === '/combat-preview') route = '/combat-preview.html';
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ — 試作: http://127.0.0.1:${port}/?trial=strategy`));
