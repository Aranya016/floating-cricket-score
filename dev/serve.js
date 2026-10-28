// Static server for previews: node dev/serve.js  ->  http://127.0.0.1:8766/dev/page.html
// HTML under /cricket-float/ requested with ?mock gets the fake chrome.* injected first.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html' && url.searchParams.has('mock')) {
    body = body.toString().replace('<head>', '<head><script src="/dev/chrome-mock.js"></script>');
  }
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
}).listen(8766, '127.0.0.1', () => console.log('serving on http://127.0.0.1:8766'));
