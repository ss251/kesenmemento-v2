// The together-room relay. Memory only: create, join, leave, eight people,
// message size, rate, idle close, and the Origin allow-list. A live Bun server
// on 127.0.0.1 proves two sockets can meet, move, start one race, and leave.

import { describe, test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHub } from '../server/multi/rooms.js';
import { startServer } from '../server/multi/index.js';
import { originAllowed, parseAllow } from '../server/multi/origin.js';
import {
  ALPHABET, CODE_LEN, MAX_BYTES, MAX_PLAYERS, MAX_ROOMS, IDLE_MS, RELAY_MS, COUNT_LEAD_MS,
  FISH, COLORS, encode, decode, packPose, unpackPose, codeOk,
} from '../server/multi/wire.js';

const ROOT = resolve(import.meta.dir, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
const PROD = 'https://kesennuma-living-city-production.up.railway.app';

function fake() {
  return { sent: [], closed: null, send(text) { this.sent.push(text); }, close(code, reason) { this.closed = { code, reason }; } };
}
function apply(actions) {
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a.conn) continue;
    if (a.text && a.conn.send) a.conn.send(a.text);
    if (a.close && a.conn.close) a.conn.close(1008, a.close);
  }
  return actions;
}
function say(c) { return JSON.parse(c.sent[c.sent.length - 1]); }
function pose(x) {
  return packPose({ mode: 'avatar', x, y: 1, z: 2, yaw: 0, pitch: 0, look: 0, vehicle: 0 });
}

describe('room codes and the wire', () => {
  test('the alphabet has no look-alike glyphs', () => {
    for (const ch of '0O1IL2Z5S6G8B') expect(ALPHABET.includes(ch)).toBe(false);
    expect(ALPHABET.length).toBe(23);
    expect(CODE_LEN).toBe(4);
    expect(codeOk('AAAA')).toBe(true);
    expect(codeOk('aaaa')).toBe(false);
    expect(codeOk('AAAO')).toBe(false);
  });

  test('a pose survives the centimetre round trip, including a right angle', () => {
    const yaw = Math.PI / 2;
    const packed = packPose({ mode: 'car', x: 12.34, y: 1.5, z: -8, yaw, pitch: 0, look: -0.2, vehicle: 15 });
    expect(packed[0]).toBe('c');
    expect(packed[4]).toBe(9000);
    const back = unpackPose(packed);
    expect(back.mode).toBe('car');
    expect(back.x).toBeCloseTo(12.34, 2);
    expect(back.vehicle).toBe(15);
    expect(back.yaw).toBeCloseTo(yaw, 4);
  });

  test('eight players still fit in one snapshot', () => {
    const p = [];
    for (let i = 1; i <= 8; i++) p.push([i, 'c', 123456, 200, -654321, 18000, -18000, 15, 9000]);
    const text = encode({ t: 's', n: 1_700_000_000_000, p });
    expect(text).not.toBeNull();
    expect(text.length).toBeLessThanOrEqual(MAX_BYTES);
  });

  test('a name, a chat string, or a coordinate key closes the socket', () => {
    for (const k of ['name', 'text', 'chat', 'msg', 'message', 'nick', 'lat', 'lon', 'lng', 'gps', 'email', 'user']) {
      expect(decode(JSON.stringify({ t: 'pose', [k]: 'x' })).error).toBe('forbidden');
    }
  });
});

describe('rooms', () => {
  test('rng 0 makes AAAA, and a taken code takes the next draw', () => {
    const draws = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0];
    let i = 0;
    const rng = () => draws[Math.min(i++, draws.length - 1)];
    let t = 1000;
    const hub = createHub({ now: () => t, rng });
    const a = fake();
    hub.open(a);
    apply(hub.message(a, encode({ t: 'create' })));
    expect(say(a).c).toBe('AAAA');
    expect(say(a).fish).toBe('saba');
    expect(say(a).color).toBe('ao');
    const b = fake();
    hub.open(b);
    apply(hub.message(b, encode({ t: 'create' })));
    expect(say(b).c).toBe('QAAA');
    expect(hub.rooms.size).toBe(2);
  });

  test('join is case-insensitive, leave drops an empty room at once, and the ninth person is turned away', () => {
    let t = 5000;
    const hub = createHub({ now: () => t, rng: () => 0 });
    const host = fake();
    hub.open(host);
    apply(hub.message(host, encode({ t: 'create' })));
    const code = say(host).c;
    const people = [host];
    for (let n = 0; n < MAX_PLAYERS - 1; n++) {
      const c = fake();
      hub.open(c);
      t += 10;
      apply(hub.message(c, encode({ t: 'join', c: code.toLowerCase() })));
      expect(say(c).t).toBe('room');
      expect(say(c).c).toBe(code);
      people.push(c);
    }
    expect(hub.rooms.get(code).players.length).toBe(8);
    const fish = new Set(hub.rooms.get(code).players.map((p) => p.fish + '/' + p.color));
    expect(fish.size).toBe(8);
    const ninth = fake();
    hub.open(ninth);
    apply(hub.message(ninth, encode({ t: 'join', c: code })));
    expect(say(ninth).t).toBe('err');
    expect(say(ninth).e).toBe('full');
    expect(hub.rooms.get(code).players.length).toBe(8);
    for (const c of people) apply(hub.message(c, encode({ t: 'bye' })));
    expect(hub.rooms.has(code)).toBe(false);
    expect(hub.tick(t + 1).length).toBe(0);
  });

  test('the room cap answers rooms, and a bad code answers bad', () => {
    const hub = createHub({ now: () => 1, rng: Math.random, maxRooms: 2 });
    for (let i = 0; i < 2; i++) {
      const c = fake();
      hub.open(c);
      apply(hub.message(c, encode({ t: 'create' })));
      expect(say(c).t).toBe('room');
    }
    const extra = fake();
    hub.open(extra);
    apply(hub.message(extra, encode({ t: 'create' })));
    expect(say(extra).e).toBe('rooms');
    const joiner = fake();
    hub.open(joiner);
    apply(hub.message(joiner, encode({ t: 'join', c: 'QQQQ' })));
    expect(say(joiner).e).toBe('bad');
    expect(MAX_ROOMS).toBe(200);
  });

  test('an oversized or forbidden message closes the socket and stores nothing', () => {
    let t = 1000;
    const hub = createHub({ now: () => t, rng: () => 0 });
    const c = fake();
    hub.open(c);
    apply(hub.message(c, encode({ t: 'create' })));
    const fat = 'あ'.repeat(200);
    apply(hub.message(c, JSON.stringify({ t: 'pose', d: fat })));
    expect(c.closed.reason).toBe('size');
    expect(hub.conns.get(c).pose).toBeNull();
    const d = fake();
    hub.open(d);
    apply(hub.message(d, encode({ t: 'create' })));
    apply(hub.message(d, JSON.stringify({ t: 'pose', d: pose(3), name: 'kid' })));
    expect(d.closed.reason).toBe('forbidden');
    const stored = [];
    for (const room of hub.rooms.values()) {
      for (let i = 0; i < room.players.length; i++) stored.push(room.players[i].fish, room.players[i].color, room.players[i].pose);
    }
    expect(JSON.stringify(stored)).not.toContain('kid');
    expect(hub.conns.get(d).pose).toBeNull();
  });

  test('thirty poses a second are kept and the thirty-first is dropped', () => {
    let t = 10_000;
    const hub = createHub({ now: () => t, rng: () => 0 });
    const c = fake();
    hub.open(c);
    apply(hub.message(c, encode({ t: 'create' })));
    t += 1000;
    for (let i = 0; i < 30; i++) apply(hub.message(c, encode({ t: 'pose', d: pose(i) })));
    const kept = hub.conns.get(c).pose.slice();
    apply(hub.message(c, encode({ t: 'pose', d: pose(99) })));
    expect(hub.conns.get(c).pose).toEqual(kept);
    t += 1000;
    apply(hub.message(c, encode({ t: 'pose', d: pose(99) })));
    expect(hub.conns.get(c).pose[1]).toBe(9900);
  });

  test('a quiet socket is closed after ten minutes and the room goes with it', () => {
    let t = 50_000;
    const hub = createHub({ now: () => t, rng: () => 0, idleMs: IDLE_MS });
    const c = fake();
    hub.open(c);
    apply(hub.message(c, encode({ t: 'create' })));
    expect(hub.tick(t + IDLE_MS).length).toBe(0);
    const actions = hub.tick(t + IDLE_MS + 1);
    apply(actions);
    expect(say(c).t).toBe('closed');
    expect(say(c).e).toBe('idle');
    expect(c.closed.reason).toBe('idle');
    expect(hub.stats()).toEqual({ rooms: 0, players: 0 });
  });

  test('the host starts one countdown, finishes are ordered, and a stranger cannot start', () => {
    let t = 80_000;
    const hub = createHub({ now: () => t, rng: () => 0 });
    const host = fake();
    const guest = fake();
    hub.open(host);
    apply(hub.message(host, encode({ t: 'create' })));
    const code = say(host).c;
    hub.open(guest);
    apply(hub.message(guest, encode({ t: 'join', c: code })));
    apply(hub.message(guest, encode({ t: 'race', c: 'car' })));
    expect(say(guest).e).toBe('host');
    host.sent.length = 0;
    guest.sent.length = 0;
    apply(hub.message(host, encode({ t: 'race', c: 'car' })));
    const a = say(host);
    const b = say(guest);
    expect(a.t).toBe('race');
    expect(b.t).toBe('race');
    expect(a.go).toBe(t + COUNT_LEAD_MS);
    expect(b.go).toBe(a.go);
    expect(a.c).toBe('car');
    apply(hub.message(host, encode({ t: 'fin', ms: 10 })));
    expect(host.sent.length).toBe(1);
    t = a.go + 5000;
    apply(hub.message(guest, encode({ t: 'fin', ms: 4800 })));
    apply(hub.message(host, encode({ t: 'fin', ms: 5100 })));
    const board = say(host);
    expect(board.t).toBe('board');
    expect(board.rows.map((r) => r[1])).toEqual([4800, 5100]);
    const n = board.rows.length;
    apply(hub.message(guest, encode({ t: 'fin', ms: 100 })));
    expect(say(guest).rows.map((r) => r[1])).toEqual([4800, 5100]);
    expect(n).toBe(2);
  });

  test('stamps are four words, cooled down, and a snapshot reaches both players', () => {
    let t = 90_000;
    const hub = createHub({ now: () => t, rng: () => 0 });
    const host = fake();
    const guest = fake();
    hub.open(host);
    apply(hub.message(host, encode({ t: 'create' })));
    const code = say(host).c;
    hub.open(guest);
    apply(hub.message(guest, encode({ t: 'join', c: code })));
    guest.sent.length = 0;
    apply(hub.message(host, encode({ t: 'stamp', s: 9 })));
    expect(guest.sent.length).toBe(0);
    apply(hub.message(host, encode({ t: 'stamp', s: 1 })));
    expect(say(guest).t).toBe('stamp');
    expect(say(guest).s).toBe(1);
    apply(hub.message(host, encode({ t: 'stamp', s: 2 })));
    expect(say(guest).s).toBe(1);
    t += 1200;
    apply(hub.message(host, encode({ t: 'stamp', s: 2 })));
    expect(say(guest).s).toBe(2);
    apply(hub.message(host, encode({ t: 'pose', d: pose(4) })));
    apply(hub.message(guest, encode({ t: 'pose', d: pose(8) })));
    t += RELAY_MS;
    host.sent.length = 0;
    guest.sent.length = 0;
    apply(hub.tick(t));
    const snap = say(host);
    expect(snap.t).toBe('s');
    expect(snap.p.length).toBe(2);
    expect(say(guest).n).toBe(snap.n);
  });
});

describe('origin allow-list', () => {
  test('the built-in list is the app, plus localhost only while the list is unset', () => {
    expect(parseAllow(undefined)).toBeNull();
    expect(parseAllow('')).toBeNull();
    expect(parseAllow('https://a.example, https://b.example')).toEqual(['https://a.example', 'https://b.example']);
    expect(originAllowed(PROD, null)).toBe(true);
    expect(originAllowed('http://localhost:9506', null)).toBe(true);
    expect(originAllowed('http://127.0.0.1:9505', null)).toBe(true);
    expect(originAllowed('https://evil.example', null)).toBe(false);
    expect(originAllowed(PROD + '.evil.example', null)).toBe(false);
    expect(originAllowed('http://localhost.evil.com', null)).toBe(false);
    expect(originAllowed('null', null)).toBe(false);
    expect(originAllowed('', null)).toBe(false);
    expect(originAllowed(PROD + '/town', null)).toBe(false);
    expect(originAllowed('https://user:pw@' + PROD.slice('https://'.length), null)).toBe(false);
    const locked = [PROD];
    expect(originAllowed('http://localhost:9506', locked)).toBe(false);
    expect(originAllowed(PROD, locked)).toBe(true);
  });
});

describe('a live relay', () => {
  let srv;
  afterEach(() => { srv?.stop(); srv = null; });

  function sock(origin) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { headers: { Origin: origin } });
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('timeout')); }, 2000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(ws); });
    });
  }
  function until(ws, type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(type)), 2000);
      const on = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t !== type) return;
        clearTimeout(timer);
        ws.removeEventListener('message', on);
        resolve(msg);
      };
      ws.addEventListener('message', on);
    });
  }

  test('an evil Origin never opens; two allowed pages join, move, race and leave', async () => {
    srv = startServer({ port: 0, hostname: '127.0.0.1', allow: null });
    const health = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
    expect(health).toEqual({ ok: true, rooms: 0, players: 0 });
    await expect(sock('https://evil.example')).rejects.toBeInstanceOf(WebSocket);
    const a = await sock(PROD);
    const b = await sock('http://127.0.0.1:9506');
    const roomP = until(a, 'room');
    a.send(encode({ t: 'create' }));
    const room = await roomP;
    expect(room.t).toBe('room');
    expect(room.c).toMatch(/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/);
    const joinedP = until(b, 'room');
    const peerP = until(a, 'peer');
    b.send(encode({ t: 'join', c: room.c }));
    const joined = await joinedP;
    const peer = await peerP;
    expect(joined.t).toBe('room');
    expect(peer.t).toBe('peer');
    a.send(encode({ t: 'pose', d: pose(5) }));
    b.send(encode({ t: 'pose', d: pose(9) }));
    await new Promise((r) => setTimeout(r, 40));
    for (const room of srv.hub.rooms.values()) room.relayAt = 0;
    const snapP = until(a, 's');
    apply(srv.hub.tick(Date.now()));
    const snap = await snapP;
    expect(snap.t).toBe('s');
    expect(snap.p.some((row) => row[0] === joined.id)).toBe(true);
    const raceA = until(a, 'race');
    const raceB = until(b, 'race');
    a.send(encode({ t: 'race', c: 'race' }));
    const ra = await raceA;
    const rb = await raceB;
    expect(ra.go).toBe(rb.go);
    expect(ra.c).toBe('race');
    const goneP = until(b, 'gone');
    a.send(encode({ t: 'bye' }));
    const gone = await goneP;
    expect(gone.t).toBe('gone');
    b.send(encode({ t: 'bye' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(srv.hub.stats().rooms).toBe(0);
    const again = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
    expect(JSON.stringify(again)).not.toContain(room.c);
    a.close();
    b.close();
  });
});

describe('the relay keeps no record', () => {
  test('the server source does not write a file, and the page source does not touch localStorage', () => {
    const server = strip(['index.js', 'rooms.js', 'wire.js', 'origin.js'].map((f) => read('server/multi/' + f)).join('\n'));
    expect(server).not.toMatch(/writeFile|Bun\.write|appendFile|createWriteStream/);
    const page = strip(['index.js', 'session.js', 'sheet.js', 'names.js', 'bodies.js'].map((f) => read('src/anime/play/multi/' + f)).join('\n'));
    expect(page).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
    const coach = strip(read('src/anime/play/multi/mode.js'));
    expect(coach).toMatch(/klc\.multi\.coach/);
    expect(coach).not.toMatch(/\bsessionStorage\b|\bindexedDB\b/);
    expect(page).not.toMatch(/ホヤ/);
    const strings = read('data/play-i18n.json');
    const packed = JSON.parse(strings);
    let multiCopy = '';
    for (const lang of ['ja', 'en']) {
      for (const [k, v] of Object.entries(packed[lang])) {
        if (k.startsWith('play.multi.')) multiCopy += k + '\n' + v + '\n';
      }
    }
    expect(multiCopy).not.toMatch(/ホヤ|hoya/i);
    expect(strings).not.toMatch(/\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|慰霊|避難|防潮堤/);
  });
});
