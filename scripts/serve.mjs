// Tiny static server for local and tailnet testing. Production is Cloudflare Pages.
//   HOST=127.0.0.1 PORT=8080 node scripts/serve.mjs      (npm run serve)
// Sends no-cache + Last-Modified so edits show up on the next load, and supports Range for audio.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    const s = await stat(file);
    if (!file.startsWith(root) || !s.isFile()) throw new Error('not found');
    const headers = { 'Cache-Control': 'no-cache', 'Last-Modified': s.mtime.toUTCString(), 'Accept-Ranges': 'bytes' };
    if (Date.parse(req.headers['if-modified-since']) >= Math.floor(s.mtimeMs / 1000) * 1000) return res.writeHead(304, headers).end();
    let [start, end, status] = [0, s.size - 1, 200];
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (m && (m[1] || m[2])) {
      start = m[1] ? +m[1] : Math.max(0, s.size - +m[2]);
      end = m[1] && m[2] ? Math.min(+m[2], end) : end;
      if (start > end) return res.writeHead(416, { 'Content-Range': `bytes */${s.size}` }).end();
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${s.size}`;
    }
    res.writeHead(status, { ...headers, 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(+(process.env.PORT ?? 8080), process.env.HOST ?? '127.0.0.1');
