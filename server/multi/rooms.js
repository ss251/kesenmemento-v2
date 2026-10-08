// In-memory rooms. Nothing here is written to disk. A room dies when its last player leaves,
// and a quiet socket dies after IDLE_MS. The relay is a snapshot at RELAY_HZ, not a forward of every packet.

import {
  ALPHABET, CODE_LEN, MAX_PLAYERS, MAX_ROOMS, MAX_PER_SEC, IDLE_MS, RELAY_MS,
  STAMP_COUNT, STAMP_GAP_MS, COUNT_LEAD_MS, FINISH_MAX_MS, FISH, COLORS,
  codeOk, normCode, courseOk, packPose, encode, decode,
} from './wire.js';

function pickIdentity(players, rng) {
  const used = new Set();
  for (let i = 0; i < players.length; i++) used.add(players[i].fish + '/' + players[i].color);
  const free = [];
  for (let f = 0; f < FISH.length; f++) {
    for (let c = 0; c < COLORS.length; c++) {
      const id = FISH[f] + '/' + COLORS[c].id;
      if (!used.has(id)) free.push([FISH[f], COLORS[c].id]);
    }
  }
  if (!free.length) return null;
  const i = Math.min(free.length - 1, Math.floor(rng() * free.length));
  return { fish: free[i][0], color: free[i][1] };
}

function makeCode(rng, taken) {
  for (let n = 0; n < 24; n++) {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    if (!taken.has(s)) return s;
  }
  return null;
}

/**
 * @param {object} [o]
 * @param {() => number} [o.now]
 * @param {() => number} [o.rng]
 */
export function createHub(o = {}) {
  const now = o.now || Date.now;
  const rng = o.rng || Math.random;
  const idleMs = o.idleMs ?? IDLE_MS;
  const maxRooms = o.maxRooms ?? MAX_ROOMS;
  const maxPlayers = o.maxPlayers ?? MAX_PLAYERS;
  const rooms = new Map();
  const conns = new Map();

  function say(conn, obj) {
    const text = encode(obj);
    if (!text) return [];
    return [{ conn, text }];
  }

  function others(room, except) {
    const out = [];
    for (let i = 0; i < room.players.length; i++) if (room.players[i].conn !== except) out.push(room.players[i].conn);
    return out;
  }

  function tell(room, obj, except) {
    const text = encode(obj);
    if (!text) return [];
    const out = [];
    const list = others(room, except);
    for (let i = 0; i < list.length; i++) out.push({ conn: list[i], text });
    return out;
  }

  function tellAll(room, obj) {
    return tell(room, obj, null);
  }

  function find(conn) {
    return conns.get(conn) || null;
  }

  function roomOf(rec) {
    return rec && rec.room ? rooms.get(rec.room) : null;
  }

  function hostOf(room) {
    return room.players.length ? room.players[0].id : 0;
  }

  function peerList(room, exceptId) {
    const peers = [];
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (p.id === exceptId) continue;
      peers.push({ id: p.id, fish: p.fish, color: p.color });
    }
    return peers;
  }

  function dropPlayer(rec, why) {
    const room = roomOf(rec);
    const out = [];
    rec.player = null;
    rec.room = '';
    if (!room) return out;
    const idx = room.players.indexOf(rec);
    if (idx < 0) return out;
    const id = rec.id;
    room.players.splice(idx, 1);
    if (!room.players.length) {
      rooms.delete(room.code);
      return out;
    }
    out.push(...tellAll(room, { t: 'gone', id }));
    const host = hostOf(room);
    if (host !== room.host) {
      room.host = host;
      out.push(...tellAll(room, { t: 'host', id: host }));
    }
    if (why) { /* the leaver already knows */ }
    return out;
  }

  function rateOk(rec, t) {
    if (t - rec.win >= 1000) { rec.win = t; rec.n = 0; }
    if (rec.n >= MAX_PER_SEC) return false;
    rec.n++;
    return true;
  }

  function open(conn) {
    conns.set(conn, { conn, win: now(), n: 0, last: now(), room: '', id: 0, fish: '', color: '', pose: null, stampAt: 0, player: null });
  }

  function close(conn) {
    const rec = find(conn);
    if (!rec) return [];
    const out = dropPlayer(rec);
    conns.delete(conn);
    return out;
  }

  function addPlayer(rec, room) {
    const who = pickIdentity(room.players, rng);
    if (!who) return { error: 'full' };
    const id = room.nextId++;
    rec.room = room.code;
    rec.id = id;
    rec.fish = who.fish;
    rec.color = who.color;
    rec.pose = null;
    rec.player = rec;
    room.players.push(rec);
    if (!room.host) room.host = id;
    return { id, fish: who.fish, color: who.color };
  }

  function welcome(rec, room) {
    const out = say(rec.conn, {
      t: 'room', c: room.code, id: rec.id, fish: rec.fish, color: rec.color,
      host: room.host, peers: peerList(room, rec.id),
    });
    const race = room.race;
    const t = now();
    if (race && t < race.go + 30_000) out.push(...say(rec.conn, { t: 'race', c: race.course, go: race.go, n: race.id }));
    if (race && race.rows.length) out.push(...say(rec.conn, { t: 'board', n: race.id, rows: race.rows }));
    return out;
  }

  function message(conn, raw) {
    const rec = find(conn);
    if (!rec) return [];
    const t = now();
    if (typeof raw !== 'string') return [{ conn, close: 'size' }];
    const decoded = decode(raw);
    if (decoded.error === 'size' || decoded.error === 'forbidden') return [{ conn, close: decoded.error }];
    if (decoded.error) return [];
    if (!rateOk(rec, t)) return [];
    rec.last = t;
    const msg = decoded.msg;
    const room = roomOf(rec);

    if (msg.t === 'create') {
      if (room) return say(conn, { t: 'err', e: 'busy' });
      if (rooms.size >= maxRooms) return say(conn, { t: 'err', e: 'rooms' });
      const code = makeCode(rng, rooms);
      if (!code) return say(conn, { t: 'err', e: 'rooms' });
      const next = { code, players: [], host: 0, nextId: 1, relayAt: t, race: null, raceSeq: 0 };
      const who = addPlayer(rec, next);
      if (who.error) return say(conn, { t: 'err', e: who.error });
      rooms.set(code, next);
      return welcome(rec, next);
    }

    if (msg.t === 'join') {
      if (room) return say(conn, { t: 'err', e: 'busy' });
      const code = normCode(msg.c);
      if (!codeOk(code)) return say(conn, { t: 'err', e: 'bad' });
      const dest = rooms.get(code);
      if (!dest) return say(conn, { t: 'err', e: 'bad' });
      if (dest.players.length >= maxPlayers) return say(conn, { t: 'err', e: 'full' });
      const who = addPlayer(rec, dest);
      if (who.error) return say(conn, { t: 'err', e: who.error });
      const out = welcome(rec, dest);
      out.push(...tell(dest, { t: 'peer', id: rec.id, fish: rec.fish, color: rec.color }, conn));
      return out;
    }

    if (msg.t === 'bye') return close(conn);

    if (!room) return [];

    if (msg.t === 'pose') {
      const pose = packFromTuple(msg.d);
      if (!pose) return [];
      rec.pose = pose;
      return [];
    }

    if (msg.t === 'stamp') {
      const s = msg.s;
      if (!Number.isInteger(s) || s < 0 || s >= STAMP_COUNT) return [];
      if (t - rec.stampAt < STAMP_GAP_MS) return [];
      rec.stampAt = t;
      return tell(room, { t: 'stamp', id: rec.id, s }, conn);
    }

    if (msg.t === 'race') {
      if (rec.id !== room.host) return say(conn, { t: 'err', e: 'host' });
      if (!courseOk(msg.c)) return say(conn, { t: 'err', e: 'bad' });
      room.raceSeq++;
      room.race = { id: room.raceSeq, course: msg.c, go: t + COUNT_LEAD_MS, rows: [], done: new Set() };
      return tellAll(room, { t: 'race', c: room.race.course, go: room.race.go, n: room.race.id });
    }

    if (msg.t === 'fin') {
      const race = room.race;
      if (!race || t < race.go || race.done.has(rec.id)) return [];
      const serverMs = t - race.go;
      let ms = serverMs;
      if (Number.isInteger(msg.ms) && msg.ms >= 0 && msg.ms <= FINISH_MAX_MS && Math.abs(msg.ms - serverMs) < 2500) ms = msg.ms;
      if (ms < 0) ms = 0;
      if (ms > FINISH_MAX_MS) return [];
      race.done.add(rec.id);
      race.rows.push([rec.id, ms]);
      race.rows.sort((a, b) => a[1] - b[1]);
      return tellAll(room, { t: 'board', n: race.id, rows: race.rows });
    }

    return [];
  }

  function tick(t) {
    const at = t == null ? now() : t;
    const out = [];
    const idle = [];
    for (const rec of conns.values()) if (at - rec.last > idleMs) idle.push(rec.conn);
    for (let i = 0; i < idle.length; i++) {
      out.push(...say(idle[i], { t: 'closed', e: 'idle' }));
      out.push(...close(idle[i]));
      out.push({ conn: idle[i], close: 'idle' });
    }
    for (const room of rooms.values()) {
      if (!room.players.length) continue;
      if (at - room.relayAt < RELAY_MS) continue;
      room.relayAt = at;
      const p = [];
      for (let i = 0; i < room.players.length; i++) {
        const pl = room.players[i];
        if (!pl.pose) continue;
        p.push([pl.id, pl.pose[0], pl.pose[1], pl.pose[2], pl.pose[3], pl.pose[4], pl.pose[5], pl.pose[6], pl.pose[7]]);
      }
      if (!p.length || room.players.length < 2) continue;
      const text = encode({ t: 's', n: at, p });
      if (!text) continue;
      for (let i = 0; i < room.players.length; i++) out.push({ conn: room.players[i].conn, text });
    }
    return out;
  }

  function stats() {
    let players = 0;
    for (const room of rooms.values()) players += room.players.length;
    return { rooms: rooms.size, players };
  }

  return { open, message, close, tick, stats, rooms, conns };
}

function cm(v) {
  return typeof v === 'number' ? v / 100 : v;
}

function centi(v) {
  return typeof v === 'number' ? v * Math.PI / 180 / 100 : 0;
}

function modeFrom(m) {
  if (m === 'a') return 'avatar';
  if (m === 'c') return 'car';
  if (m === 'b') return 'boat';
  if (m === 'g') return 'gull';
  if (m === 'f') return 'fish';
  return m;
}

/** A client tuple is already packed. Re-pack so a float or a bad mode cannot sneak through. */
function packFromTuple(d) {
  if (!Array.isArray(d) || d.length !== 8) return null;
  return packPose({
    mode: modeFrom(d[0]),
    x: cm(d[1]), y: cm(d[2]), z: cm(d[3]),
    yaw: centi(d[4]), pitch: centi(d[5]), vehicle: d[6], look: centi(d[7]),
  });
}
