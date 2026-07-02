// Minimal static server for the Ducat × Tron swap demo.
// Run: node serve.mjs   (then open the printed URL)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  if (p.includes('..')) { res.statusCode = 400; return res.end('bad'); }
  try {
    const buf = await readFile(join(ROOT, p));
    const ext = extname(p);
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    if (ext === '.woff2' || ext === '.png' || ext === '.jpg' || ext === '.svg') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    res.end(buf);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

// Try ports 5180..5195 until one is free, so a busy port never blocks the demo.
let port = Number(process.env.PORT) || 5180;
const MAX = port + 15;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port < MAX) { server.listen(++port, '127.0.0.1'); }
  else { console.error(e.message); process.exit(1); }
});
server.on('listening', () => {
  console.log('\n  Ducat swap demo is running. Open this in your browser:\n');
  console.log(`      http://localhost:${port}\n`);
  console.log('  Leave this terminal window open. Press Ctrl+C to stop.\n');
});
server.listen(port, '127.0.0.1');
