// Two clients, one room. Local relay, or the deployed one.
// Does not assert a global room count on a shared server.
//
//   env -u NODE_OPTIONS bun server/multi/smoke.mjs
//   env -u NODE_OPTIONS bun server/multi/smoke.mjs \
//     --ws wss://<kesennuma-multi>/ws \
//     --origin https://kesennuma-living-city-production.up.railway.app

import { startServer } from './index.js';
import { createSession } from '../../src/anime/play/multi/session.js';

const PROD = 'https://kesennuma-living-city-production.up.railway.app';
const argv = process.argv.slice(2);
function arg(k, d = null) {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d;
}

const wsArg = arg('ws', '');
const origin = arg('origin', PROD);
const local = !wsArg;
let srv = null;

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function until(session, type, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + type)), ms);
    const off = session.on((ev) => {
      if (ev.type !== type) return;
      clearTimeout(timer);
      off();
      resolve(ev);
    });
  });
}

function client(url) {
  return createSession({
    url,
    socketFactory: (u) => new WebSocket(u, { headers: { Origin: origin } }),
  });
}

function httpBase(wsUrl) {
  const u = new URL(wsUrl);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  u.pathname = '/health';
  u.search = '';
  u.hash = '';
  return u.href;
}

try {
  let url = wsArg;
  if (local) {
    srv = startServer({ port: 0, hostname: '127.0.0.1', allow: null });
    url = `ws://127.0.0.1:${srv.port}/ws`;
    const health = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
    if (!health.ok || health.rooms !== 0) fail('local health ' + JSON.stringify(health));
    else console.log('health', health);
  } else {
    const health = await (await fetch(httpBase(url))).json();
    if (!health.ok) fail('health ' + JSON.stringify(health));
    else console.log('health', health);
  }

  const a = client(url);
  const b = client(url);
  const roomP = until(a, 'room');
  a.create();
  const room = await roomP;
  const code = room.code || a.code;
  if (!/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code)) fail('code ' + code);
  const joinedP = until(b, 'room');
  const peerP = until(a, 'peer');
  b.join(code);
  const joined = await joinedP;
  await peerP;
  if (joined.code && joined.code !== code) fail('join code ' + joined.code);
  const raceA = until(a, 'race');
  const raceB = until(b, 'race');
  if (!a.startRace('car')) fail('host could not start');
  const ra = await raceA;
  const rb = await raceB;
  if (ra.go !== rb.go) fail('go mismatch ' + ra.go + ' ' + rb.go);
  if (ra.course !== 'car') fail('course ' + ra.course);
  console.log('room', code, 'go', ra.go, 'players', 2);

  a.leave();
  b.leave();
  await new Promise((r) => setTimeout(r, 80));

  const late = client(url);
  const errP = until(late, 'err');
  late.join(code);
  const err = await errP;
  late.leave();
  if (!err.e) fail('old code still joined');
  console.log('left', code, 'rejoin', err.e);

  if (local) {
    const again = await (await fetch(`http://127.0.0.1:${srv.port}/health`)).json();
    if (again.rooms !== 0) fail('local rooms left ' + again.rooms);
    console.log('local empty', again);
  }
  if (!process.exitCode) console.log('PASS', local ? 'local' : url);
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
} finally {
  try { srv?.stop(); } catch { /* */ }
}
