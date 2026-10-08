// The deployed relay. A page on localhost still uses port 9505, so a dev server
// does not dial production. `?ws=` may only name localhost, or the same host as MULTI_WS.

export const MULTI_WS = 'wss://kesennuma-multi-production.up.railway.app/ws';

function safe(q) {
  let u;
  try { u = new URL(q); } catch { return ''; }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return '';
  if (u.username || u.password) return '';
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.href;
  if (MULTI_WS) {
    try {
      const m = new URL(MULTI_WS);
      if (m.protocol === u.protocol && m.host === u.host) return u.href;
    } catch { /* MULTI_WS itself is unusable */ }
  }
  return '';
}

/** The socket URL for this page, or '' when together-play has nowhere to go. */
export function resolveWs(loc, override) {
  if (override && safe(override)) return safe(override);
  try {
    const q = new URLSearchParams(loc.search).get('ws');
    if (q && safe(q)) return safe(q);
  } catch { /* no location yet */ }
  const h = loc && loc.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return `ws://${h}:9505/ws`;
  if (MULTI_WS && safe(MULTI_WS)) return safe(MULTI_WS);
  return '';
}

/** The link a friend opens. The hash is the room code and nothing else. */
export function roomLink(loc, code) {
  const u = new URL((loc.pathname || '/') + (loc.search || ''), loc.origin || 'http://localhost');
  u.hash = 'room=' + code;
  return u.href;
}

export function codeFromHash(hash) {
  const m = /^#room=([A-Za-z0-9]{4})$/.exec(hash || '');
  return m ? m[1].toUpperCase() : '';
}
