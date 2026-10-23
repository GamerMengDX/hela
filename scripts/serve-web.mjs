#!/usr/bin/env node
// Small static server for the directory build, for local checks only.
//
//   npm run build:web && npm run dev [-- --port 4173]
//
// It serves `dist/web` with relative paths preserved, so the same folder layout
// is exercised that GitHub Pages would serve from any sub-directory. It is not
// part of either published artifact and is never started by the build scripts.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../dist/web', import.meta.url)));

const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}));

function port() {
  const index = process.argv.indexOf('--port');
  const value = index > 0 ? Number(process.argv[index + 1]) : Number(process.env.PORT || 4173);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 4173;
}

async function resolveTarget(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  // No directory traversal: everything is resolved inside ROOT or rejected.
  const candidate = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      const indexInfo = await stat(index);
      return indexInfo.isFile() ? index : null;
    }
    return info.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {'allow': 'GET, HEAD'}).end();
    return;
  }
  const target = await resolveTarget(request.url || '/');
  if (!target) {
    response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'}).end('404 Not Found');
    return;
  }
  const info = await stat(target);
  response.writeHead(200, {
    'content-type': MIME.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-cache'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(target).pipe(response);
});

server.listen(port(), '127.0.0.1', () => {
  console.log('[serve-web] http://127.0.0.1:' + port() + '/  (dist/web, Ctrl+C 结束)');
});
