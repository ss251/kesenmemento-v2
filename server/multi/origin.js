// Origin allow-list. The browser sends the page's origin, never the player's place.
// Localhost is allowed only when ALLOWED_ORIGINS is unset, so a dev page can reach a local relay.
// A set list is exact: production should name the app and nothing else.

import { DEFAULT_ORIGINS } from './wire.js';

export function parseAllow(env) {
  if (env == null || String(env).trim() === '') return null;
  const list = [];
  for (const part of String(env).split(',')) {
    const s = part.trim();
    if (s) list.push(s);
  }
  return list;
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/** True when this page may open a socket. `allow` null means the built-in list plus localhost. */
export function originAllowed(origin, allow) {
  if (!origin || origin === 'null') return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  if (u.username || u.password) return false;
  if (u.pathname !== '/' && u.pathname !== '') return false;
  if (u.search || u.hash) return false;
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (allow == null && isLocalHost(u.hostname)) return u.protocol === 'http:' || u.protocol === 'https:';
  const list = allow == null ? DEFAULT_ORIGINS : allow;
  return list.indexOf(origin) >= 0;
}
