// Open AIS for /api/live. Polls Open Waters at most once a minute (cached).
// If AISSTREAM_API_KEY is set, a server-side websocket fills the same box, with reconnect and backoff.
// A local receiver may POST /api/live/ais (Bearer AIS_INGEST_TOKEN) or send JSON to AIS_UDP_PORT.
// Positions are stored as reported. This module never moves a ship into another bay.
import { cachedFetch, json } from "../../scripts/live/http.js";
import { OPEN_WATERS_URL, parseOpenWaters, parseAisMessage, packAis } from "../anime/world/life/ais.js";

const TTL = 60_000;
const direct = new Map();
let streamOn = false;
let wsTimer = null;
let backoff = 1000;
let socket = null;

function newer(a, b) {
  const ta = a?.seen ? Date.parse(a.seen) : 0;
  const tb = b?.seen ? Date.parse(b.seen) : 0;
  return (tb || 0) >= (ta || 0) ? b : a;
}

export function rememberVessels(list) {
  const now = new Date().toISOString();
  for (const v of list || []) {
    if (!v?.mmsi || v.lat == null || v.lon == null) continue;
    const prev = direct.get(v.mmsi);
    const next = { ...v, seen: v.seen || now };
    direct.set(v.mmsi, prev ? newer(prev, next) : next);
  }
}

function merged(openWaters) {
  const by = new Map();
  for (const v of openWaters || []) by.set(v.mmsi, v);
  for (const v of direct.values()) {
    const prev = by.get(v.mmsi);
    by.set(v.mmsi, prev ? newer(prev, v) : v);
  }
  return [...by.values()];
}

export function emptyAis() {
  return packAis([], { source: 'openwaters' });
}

/** Test-only: drop vessels remembered from a receiver or the stream. */
export function resetAisForTests() {
  direct.clear();
  if (wsTimer) { clearTimeout(wsTimer); wsTimer = null; }
  if (socket) { try { socket.close(); } catch { /* already */ } socket = null; }
  streamOn = false;
}

/** The ais block for /api/live. Never throws. Offline or an empty coast is coverage: 'empty'. */
export async function aisBlock() {
  ensureStream();
  ensureUdp();
  let ow = [];
  let map = null;
  let fetchedAt = null;
  let from = 'empty';
  try {
    const r = await cachedFetch(OPEN_WATERS_URL, { ttlMs: TTL, timeoutMs: 8000 });
    const body = json(r);
    ow = parseOpenWaters(body);
    map = body?.attribution || null;
    fetchedAt = new Date(r.at).toISOString();
    from = r.from === 'cache' ? 'cache' : 'openwaters';
  } catch { /* no receiver on this coast, or the network is down: an empty list, not an error badge */ }
  const vessels = merged(ow);
  const stream = vessels.some((v) => v.source === 'aisstream');
  const recv = vessels.some((v) => v.source === 'receiver');
  const source = stream && recv ? 'openwaters+aisstream+receiver'
    : stream ? 'openwaters+aisstream'
    : recv && !ow.length ? 'receiver'
    : recv ? 'openwaters+receiver'
    : 'openwaters';
  const attr = { ...(map || {}) };
  if (recv) attr.receiver = 'AIS-catcher';
  return packAis(vessels, { attributionMap: attr, fetchedAt, source: from === 'cache' && source === 'openwaters' ? 'openwaters' : source });
}

function schedule(key) {
  if (wsTimer) return;
  const wait = backoff;
  backoff = Math.min(60_000, backoff * 2);
  wsTimer = setTimeout(() => { wsTimer = null; connect(key); }, wait);
  wsTimer.unref?.();
}

function connect(key) {
  if (socket) { try { socket.close(); } catch { /* already */ } socket = null; }
  let ws;
  try { ws = new WebSocket('wss://stream.aisstream.io/v0/stream'); }
  catch { schedule(key); return; }
  socket = ws;
  ws.onopen = () => {
    backoff = 1000;
    ws.send(JSON.stringify({
      APIKey: key,
      BoundingBoxes: [[[38.70, 141.45], [38.98, 141.80]]],
      FilterMessageTypes: ['PositionReport'],
    }));
  };
  ws.onmessage = (ev) => {
    try {
      const list = parseAisMessage(JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()));
      for (const v of list) v.source = v.source || 'aisstream';
      rememberVessels(list);
    } catch { /* a bad frame is dropped */ }
  };
  ws.onclose = () => { if (socket === ws) socket = null; schedule(key); };
  ws.onerror = () => { try { ws.close(); } catch { /* close handler reconnects */ } };
}

/** One websocket for the process, only when the key is set and we are not in the offline test mode. */
export function ensureStream() {
  if (streamOn) return;
  if (process.env.KLC_LIVE_OFFLINE === '1') return;
  const key = process.env.AISSTREAM_API_KEY;
  if (!key) return;
  streamOn = true;
  connect(key);
}

let udpOn = false;
export function ensureUdp() {
  if (udpOn) return;
  if (process.env.KLC_LIVE_OFFLINE === '1') return;
  const port = Number(process.env.AIS_UDP_PORT);
  if (!port) return;
  udpOn = true;
  const open = globalThis.Bun?.udpSocket;
  if (typeof open !== 'function') { udpOn = false; return; }
  try {
    open({
      port,
      hostname: '0.0.0.0',
      socket: {
        data(_s, data) {
          try {
            const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
            rememberVessels(parseAisMessage(JSON.parse(text)));
          } catch { /* not JSON */ }
        },
      },
    });
  } catch { udpOn = false; }
}

function tokenOk(req) {
  const want = process.env.AIS_INGEST_TOKEN || '';
  if (!want) return false;
  const h = req.headers.get('authorization') || '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (got.length !== want.length) return false;
  let x = 0;
  for (let i = 0; i < got.length; i++) x |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return x === 0;
}

/** POST /api/live/ais. 404 when AIS_INGEST_TOKEN is unset, so the route is not an open write. */
export async function ingestRequest(req) {
  if (!tokenOk(req)) return new Response('not found', { status: 404 });
  const raw = await req.text();
  if (raw.length > 262144) return new Response('too large', { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const list = parseAisMessage(body);
  rememberVessels(list);
  return new Response(JSON.stringify({ ok: true, n: list.length }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
