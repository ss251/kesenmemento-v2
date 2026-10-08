// The page's side of the relay. Poses go out at 15 Hz. Snapshots land in a 120 ms buffer.
// The socket is injectable so tests never need a port.

import {
  encode, decode, packPose, unpackPose, codeOk, normCode, courseOk, STAMP_COUNT, STAMP_GAP_MS,
} from '../../../../server/multi/wire.js';
import { createBuffer, pushSnap } from './interp.js';
import { STAMP_MS } from './presence.js';

export function createSession(o = {}) {
  const now = o.now || Date.now;
  const url = o.url || '';
  const listeners = [];
  const peers = new Map();
  const order = [];
  let ws = null;
  let self = null;
  let code = '';
  let host = 0;
  let open = false;
  let pending = '';
  let stampAt = 0;
  let sendN = 0;
  let sendWin = 0;
  let drop = false;

  function emit(e) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](e); } catch { /* one listener stays off the socket */ }
    }
  }

  function on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  function send(obj) {
    const t = now();
    if (t - sendWin >= 1000) { sendWin = t; sendN = 0; }
    if (sendN >= 20) return false;
    const text = encode(obj);
    if (!text || !ws || !open) return false;
    sendN++;
    try { ws.send(text); return true; } catch { return false; }
  }

  function setSelf(msg) {
    self = { id: msg.id, fish: msg.fish, color: msg.color };
    code = msg.c || code;
    host = Number.isInteger(msg.host) ? msg.host : msg.id;
    peers.clear();
    order.length = 0;
    const list = msg.peers || [];
    for (let i = 0; i < list.length; i++) addPeer(list[i]);
  }

  function addPeer(p) {
    if (!p || p.id == null || (self && p.id === self.id)) return;
    if (peers.has(p.id)) return;
    const rec = { id: p.id, fish: p.fish, color: p.color, buf: createBuffer(), stamp: '', stampUntil: 0 };
    peers.set(p.id, rec);
    order.push(rec);
  }

  function ingest(raw) {
    const decoded = decode(typeof raw === 'string' ? raw : '');
    if (decoded.error || !decoded.msg) return;
    const msg = decoded.msg;
    if (msg.t === 'room') {
      setSelf(msg);
      emit({ type: 'room', code, self, host, peers: roster() });
    } else if (msg.t === 'peer') {
      addPeer(msg);
      emit({ type: 'peer', id: msg.id, fish: msg.fish, color: msg.color, peers: roster() });
    } else if (msg.t === 'gone') {
      const peer = peers.get(msg.id);
      const fish = peer?.fish;
      const color = peer?.color;
      const label = peer?.label;
      peers.delete(msg.id);
      for (let i = 0; i < order.length; i++) if (order[i].id === msg.id) { order.splice(i, 1); break; }
      emit({ type: 'gone', id: msg.id, fish, color, label, peers: roster() });
    } else if (msg.t === 'host') {
      host = msg.id;
      emit({ type: 'host', id: msg.id });
    } else if (msg.t === 's') {
      const rows = msg.p || [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length !== 9) continue;
        const id = row[0];
        if (!Number.isInteger(id) || (self && id === self.id)) continue;
        const peer = peers.get(id);
        if (!peer) continue;
        const pose = unpackPose([row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]]);
        if (pose) pushSnap(peer.buf, msg.n, pose);
      }
      emit({ type: 'snap', n: msg.n });
    } else if (msg.t === 'stamp') {
      const peer = peers.get(msg.id);
      if (peer && Number.isInteger(msg.s) && msg.s >= 0 && msg.s < STAMP_COUNT) {
        peer.stamp = String(msg.s);
        peer.stampUntil = now() + STAMP_MS;
        emit({ type: 'stamp', id: msg.id, s: msg.s });
      }
    } else if (msg.t === 'race') {
      if (courseOk(msg.c) && Number.isFinite(msg.go)) emit({ type: 'race', course: msg.c, go: msg.go, n: msg.n });
    } else if (msg.t === 'board') {
      emit({ type: 'board', n: msg.n, rows: Array.isArray(msg.rows) ? msg.rows : [] });
    } else if (msg.t === 'err') emit({ type: 'err', e: msg.e || 'bad' });
    else if (msg.t === 'closed') emit({ type: 'closed', e: msg.e || 'closed' });
  }

  function roster() {
    const out = [];
    for (const p of peers.values()) out.push({ id: p.id, fish: p.fish, color: p.color });
    return out;
  }

  function bind(socket) {
    ws = socket;
    socket.addEventListener('open', () => {
      open = true;
      const want = pending;
      pending = '';
      if (want === 'create') send({ t: 'create' });
      else if (want) send({ t: 'join', c: want });
      emit({ type: 'open' });
    });
    socket.addEventListener('message', (ev) => { if (typeof ev.data === 'string') ingest(ev.data); });
    socket.addEventListener('close', () => {
      const mine = ws === socket;
      if (mine) { open = false; ws = null; }
      if (drop) { drop = false; return; }
      if (!mine) return;
      self = null; code = ''; host = 0; peers.clear(); order.length = 0;
      emit({ type: 'closed', e: 'closed' });
    });
    socket.addEventListener('error', () => emit({ type: 'offline' }));
  }

  function connect() {
    if (ws) return;
    if (!url) { emit({ type: 'offline' }); return; }
    const Factory = o.socketFactory || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!Factory) { emit({ type: 'offline' }); return; }
    let sock = null;
    try { sock = new Factory(url); }
    catch {
      try { sock = Factory(url); } catch { sock = null; }
    }
    if (!sock || typeof sock.addEventListener !== 'function') { emit({ type: 'offline' }); return; }
    bind(sock);
  }

  function create() {
    connect();
    if (open) send({ t: 'create' });
    else pending = 'create';
  }

  function join(c) {
    const codeIn = normCode(c);
    if (!codeOk(codeIn)) { emit({ type: 'err', e: 'bad' }); return; }
    connect();
    if (open) send({ t: 'join', c: codeIn });
    else pending = codeIn;
  }

  function leave() {
    pending = '';
    const sock = ws;
    if (open && sock) send({ t: 'bye' });
    self = null; code = ''; host = 0; peers.clear(); order.length = 0; open = false; ws = null;
    if (!sock) return;
    drop = true;
    try { sock.close(); } catch { drop = false; }
  }

  function sendPose(pose) {
    if (!self || !open) return false;
    const d = packPose(pose);
    if (!d) return false;
    return send({ t: 'pose', d });
  }

  function stamp(s) {
    if (!Number.isInteger(s) || s < 0 || s >= STAMP_COUNT) return false;
    const t = now();
    if (t - stampAt < STAMP_GAP_MS) return false;
    if (!send({ t: 'stamp', s })) return false;
    stampAt = t;
    emit({ type: 'stamp', id: self?.id, s, local: true });
    return true;
  }

  function startRace(course) {
    if (!courseOk(course) || !self || self.id !== host) return false;
    return send({ t: 'race', c: course });
  }

  function finish(ms) {
    const n = Math.round(ms);
    if (!Number.isFinite(n)) return false;
    return send({ t: 'fin', ms: n });
  }

  return {
    on, connect, create, join, leave, sendPose, stamp, startRace, finish, ingest,
    peers, order,
    get code() { return code; },
    get self() { return self; },
    get host() { return host; },
    get isHost() { return !!(self && self.id === host); },
    get ready() { return open; },
    roster,
  };
}
