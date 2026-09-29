// [v3:harbor] Dev server for the harbour kit test scene (port 8813 only).
//   env -u NODE_OPTIONS bun src/anime/world/harbor/dev/serve.mjs [--port 8813]
//   open http://127.0.0.1:8813/?scene=boats&preset=golden
// Serves the project root read-only; "/" is the harbour harness page.
import { resolve, join, normalize, extname } from 'node:path';

export const ROOT = resolve(import.meta.dir, '../../../../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.f32': 'application/octet-stream', '.bin': 'application/octet-stream' };

export function start({ port = 8813, quiet = false } = {}) {
  if ([8787, 8790, 8791].includes(port)) throw new Error(`port ${port} is reserved`);
  const server = Bun.serve({
    port, hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p === '/index.html') p = '/src/anime/world/harbor/dev/index.html';
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT + '/')) return new Response('forbidden', { status: 403 });
      const f = Bun.file(file);
      if (!(await f.exists())) return new Response('not found', { status: 404 });
      if (req.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(f, { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
    },
  });
  if (!quiet) console.log(`harbor harness -> http://127.0.0.1:${server.port}/`);
  return server;
}

if (import.meta.main) {
  const i = process.argv.indexOf('--port');
  start({ port: i > 0 ? Number(process.argv[i + 1]) : 8813 });
}
