// [cafe-rst] The café RST pictures in Safari's engine: a WKWebView session (tools/perf/wk/wks.swift, no Chrome and no Chrome lock) renders the app's shot mode on the
// Mac's own GPU, the engine and the shader compiler of an iPhone's Safari. The canvas only (no HUD): the views of tools/anime/cafe-rst-shots.mjs, so the two can be compared.
//
//   tools/anime/gate.sh run env -u NODE_OPTIONS bun tools/anime/cafe-rst-wk.mjs --out <dir> [--set desktop,phone,ref] [--port 9449] [--nobuild]
// --set   desktop = 1600 x 900 (the high tier): the counter, the dining end, the windows, the street front, three close-ups of the people, a night counter and the door at night;
//         winter = the counter, the dining end and the front in ?season=winter (snow: the room's surfaces must stay clear of it),
//         phone = a 390 x 844 window at 3x with ?q=phone (the phone tier, what an iPhone renders): the door, the counter, the dining end, the street window, by day and the counter at night;
//         ref = portrait 540 x 960 renders at the reference video's own cameras (t = 29, 38, 44 s), for the side-by-side with the frames.
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import { roomToWorld, yawToward, FRONT } from '../../src/anime/world/explore/cafe-rst.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9449));
if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
const out = arg('out', join(ROOT, 'shots/cafe/wk')), want = new Set(arg('set', 'desktop,phone,ref').split(','));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[cafe wk]', ...a);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 2000));
  log('built', BIN);
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

const spec = (x, y, dx, dy, pitch = 0) => { const [X, Z] = roomToWorld(x, y); return `${X.toFixed(2)},${Z.toFixed(2)},${yawToward(dx, dy)},${pitch}`; };
const roomYaw = (deg) => yawToward(Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180));
const FY = FRONT.floor;

/** One session: a window of w x h (and a pixel ratio), the app in shot mode; `fn(wk)` takes the pictures. */
async function session(name, w, h, { dsf = null, q = 'high', extra = '' } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-cafe-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?shot=1&w=${w}&h=${h}&t=0&q=${q}${extra}`;
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env: { ...process.env, ...(dsf ? { KLC_DSF: String(dsf) } : {}) }, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const t0 = Date.now(); const r = await wk.ready(600); log(`${name}: ready in ${Date.now() - t0} ms`, JSON.stringify(r));
    await fn(wk);
    const errs = (await wk.console()).filter((l) => /^error|onerror|unhandled/.test(l)).slice(0, 4); log(`${name}: errors`, JSON.stringify(errs));
  } finally { try { await wk.quit(); } catch { /* gone */ } try { proc.kill(9); } catch { /* gone */ } rmSync(workdir, { recursive: true, force: true }); }
}
const view = async (wk, v, file, frames = 6) => { await wk.eval(`window.__camSpec(${JSON.stringify(v)}); return 1`); await wk.shot(join(out, file), frames); log('saved', file); };
const time = (wk, id) => wk.eval(`window.__lifeSet(${JSON.stringify(id)}); return 1`);

try {
  const V = { counter: spec(4.3, 2.0, -1, -0.2, 4), dining: spec(5.2, 1.5, 0, 1, 0), windows: spec(3.3, 3.5, -0.15, -1, 2), front: spec(5.6, -5.4, -0.42, 1, 3), door: spec(2.4, -3.0, 0, 1, 4),
    barista: spec(3.2, 2.5, -1, 0.42, 1), table: spec(4.9, 2.9, 0.3, 1, 0), window: spec(4.9, -3.4, -0.1, 1, 2), doorNight: spec(2.4, -2.4, 0, 1, 4) };
  if (want.has('desktop')) await session('desktop', 1600, 900, {}, async (wk) => {
    await time(wk, 'hiru');
    for (const k of ['counter', 'dining', 'windows', 'front', 'barista', 'table', 'window']) await view(wk, V[k], `wk-day-${k}.png`);
    await time(wk, 'yoru'); await wk.eval('window.__raf.step(4); return 1');
    await view(wk, V.counter, 'wk-night-counter.png', 8); await view(wk, V.doorNight, 'wk-night-door.png', 8); await view(wk, V.window, 'wk-night-window.png', 8);
  });
  if (want.has('winter')) await session('winter', 1600, 900, { extra: '&season=winter' }, async (wk) => {   // 冬: snow lies on every up-facing cel surface unless a material opts out (noSnow): the room must stay clear of it
    await time(wk, 'hiru');
    for (const k of ['counter', 'dining', 'front']) await view(wk, V[k], `wk-winter-${k}.png`);
  });
  if (want.has('phone')) await session('phone', 390, 844, { dsf: 3, q: 'phone' }, async (wk) => {
    await time(wk, 'hiru');
    for (const [k, v] of [['door', V.door], ['counter', V.counter], ['dining', V.dining], ['window', V.window]]) await view(wk, v, `wk-phone-day-${k}.png`);
    await time(wk, 'yoru'); await wk.eval('window.__raf.step(4); return 1'); await view(wk, V.counter, 'wk-phone-night-counter.png', 8);
  });
  if (want.has('ref')) await session('ref', 540, 960, { extra: '&fov=63.6' }, async (wk) => {
    await time(wk, 'hiru');
    for (const [t, ang, pitch] of [[29, -145.2, 0.4], [38, 158.3, 0.5], [44, 107.0, 1.5]]) {
      const [X, Z] = roomToWorld(5.2, 2.5);
      await wk.eval(`window.__setCam(${X.toFixed(3)}, ${(FY + 1.55).toFixed(3)}, ${Z.toFixed(3)}, ${roomYaw(ang)}, ${pitch}); return 1`);
      await wk.shot(join(out, `wk-ref-t${t}-app.png`), 8); log('saved ref', t);
    }
  });
} finally { srv.stop(); }
process.exit(0);
