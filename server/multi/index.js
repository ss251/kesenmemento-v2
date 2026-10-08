// kesennuma-multi: a Bun WebSocket relay for 「みんなであそぶ」.
// Memory only. No accounts, no names, no chat, no saved rooms.
// The maintainer deploys this. See DEPLOY.md. This process does not deploy itself.
//
//   PORT=9505 bun server/multi/index.js
//   GET /health     { ok, rooms, players }
//   GET /ws         WebSocket, Origin must be allow-listed

import { createHub } from './rooms.js';
import { originAllowed, parseAllow } from './origin.js';
import { RELAY_MS } from './wire.js';

export function startServer(o = {}) {
  const hub = o.hub || createHub(o);
  const allow = o.allow !== undefined ? o.allow : parseAllow(o.allowedOrigins ?? process.env.ALLOWED_ORIGINS);
  const port = o.port ?? Number(process.env.PORT || 9505);
  const hostname = o.hostname || process.env.HOST || '0.0.0.0';
  const now = o.now || Date.now;

  function apply(a) {
    const conn = a.conn;
    if (!conn) return;
    if (a.close) {
      try { conn.close(1008, String(a.close).slice(0, 16)); } catch { /* already gone */ }
      return;
    }
    if (a.text) {
      try { conn.send(a.text); } catch { /* already gone */ }
    }
  }

  const server = Bun.serve({
    port,
    hostname,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
        return Response.json({ ok: true, ...hub.stats() }, {
          headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        });
      }
      if (url.pathname === '/ws') {
        if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('upgrade', { status: 426 });
        const origin = req.headers.get('origin');
        if (!originAllowed(origin, allow)) return new Response('origin', { status: 403 });
        if (srv.upgrade(req)) return undefined;
        return new Response('upgrade', { status: 426 });
      }
      return new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws) { hub.open(ws); },
      message(ws, msg) {
        const raw = typeof msg === 'string' ? msg : byteString(msg);
        if (raw == null) { apply({ conn: ws, close: 'size' }); return; }
        const actions = hub.message(ws, raw);
        for (let i = 0; i < actions.length; i++) apply(actions[i]);
      },
      close(ws) {
        const actions = hub.close(ws);
        for (let i = 0; i < actions.length; i++) apply(actions[i]);
      },
    },
  });

  const timer = setInterval(() => {
    const actions = hub.tick(now());
    for (let i = 0; i < actions.length; i++) apply(actions[i]);
  }, o.relayMs || RELAY_MS);
  if (timer.unref) timer.unref();

  return {
    hub,
    port: server.port,
    stop() { clearInterval(timer); server.stop(true); },
  };
}

function byteString(msg) {
  const n = msg?.byteLength ?? msg?.length ?? 0;
  if (n > 512) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(msg); } catch { return null; }
}

if (import.meta.main) {
  const srv = startServer();
  console.log(JSON.stringify({ service: 'kesennuma-multi', port: srv.port, health: '/health' }));
  const stop = () => { srv.stop(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
