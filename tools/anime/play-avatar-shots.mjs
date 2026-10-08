// First stills and play videos for the avatar lane. WebKit (no Chrome lock).
// The town must already be serving: env -u NODE_OPTIONS bun run scripts/serve.js --port 9490
//
//   env -u NODE_OPTIONS bun tools/anime/play-avatar-shots.mjs --set probe
//   env -u NODE_OPTIONS bun tools/anime/play-avatar-shots.mjs --set all
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import { footstep } from '../../src/anime/play/avatar/steps.js';
import { cry } from '../../src/anime/play/gull/voice.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9490));
const base = arg('url', `http://127.0.0.1:${port}/`);
const out = arg('out', join(ROOT, 'docs/play/shots/avatar'));
const want = new Set(arg('set', 'all').split(','));
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[avatar shot]', ...a);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 2000));
  log('built', BIN);
}

const PAGE = `
const P = () => window.__ctx.playerObj;
const av = () => window.__ctx.services.play.avatar;
const gu = () => window.__ctx.services.play.gull;
function clockSet(t) { window.__simClock = t; }
function advance(dt) {
  const t = window.__simTo((window.__simClock || 0) + dt, dt);
  window.__simClock = t;
  return t;
}
function placeWalk(x, z, yaw) {
  const p = P();
  const g = gu();
  if (g && g.active) g.leave('stop');
  p.gull = false; p.fly = false; p.person = 'third'; p.enabled = true;
  p.setPose(x, z, yaw, 0);
  p.present(1, 0);
  try { window.__life.hud.noteMode('walk3'); } catch (e) {}
  const c = window.__ctx.camera.position;
  return { x: +x.toFixed(2), z: +z.toFixed(2), yaw, boom: +Math.hypot(c.x - x, c.z - z).toFixed(2), feet: +p.pos.y.toFixed(2), camY: +c.y.toFixed(2) };
}
function walk(sec) {
  const p = P();
  p.keys.add('KeyW');
  const dt = 1 / 30;
  const n = Math.max(1, Math.round(sec / dt));
  for (let i = 0; i < n; i++) { p.step(dt); advance(dt); }
  return { clip: av().clip, boom: +av().boom.toFixed(2), x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2) };
}
function hold(sec) {
  const dt = 1 / 30;
  const n = Math.max(1, Math.round(sec / dt));
  for (let i = 0; i < n; i++) advance(dt);
  const s = gu().state;
  const c = window.__ctx.camera.position;
  return { x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1), speed: +s.speed.toFixed(2), pitch: +s.pitch.toFixed(2), perched: s.perched, cam: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)] };
}
function readable(x0, x1, z0, z1, step) {
  let best = null;
  const yaws = [0, 45, 90, 135, 180, 225, 270, 315];
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      if (window.__ctx.L.isWater(x, z)) continue;
      for (const yaw of yaws) {
        const s = placeWalk(x, z, yaw);
        if (s.boom < 1.45 || s.boom > 2.9) continue;
        const score = Math.abs(s.boom - 2.05);
        if (!best || score < best.score) best = Object.assign({ score }, s);
      }
    }
  }
  return best;
}
function tight(x0, x1, z0, z1, step) {
  let best = null;
  const yaws = [0, 45, 90, 135, 180, 225, 270, 315];
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      if (window.__ctx.L.isWater(x, z)) continue;
      for (const yaw of yaws) {
        const s = placeWalk(x, z, yaw);
        if (s.boom < 0.75 || s.boom > 3.2) continue;
        if (!best || s.boom < best.boom) best = s;
      }
    }
  }
  return best;
}
function aim(x, z, tx, tz) {
  const dx = tx - x, dz = tz - z;
  return Math.atan2(-dx, -dz) * 180 / Math.PI;
}
function startGull(x, z, y, yaw) {
  const p = P();
  p.person = 'third';
  p.setPose(x, z, yaw, -8, y);
  p.enabled = true;
  const g = gu();
  if (g.active) g.leave('stop');
  p.setPose(x, z, yaw, -8, y);
  const ok = g.enter();
  advance(1 / 30);
  const s = g.state;
  return { ok, x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1), speed: +s.speed.toFixed(2) };
}
function clearStick() {
  const p = P();
  p.keys.delete('ArrowDown'); p.keys.delete('ArrowUp'); p.keys.delete('KeyS'); p.keys.delete('KeyW'); p.keys.delete('Space');
}
function glide(sec) { clearStick(); return hold(sec); }
function dive(sec) {
  const p = P();
  clearStick();
  p.keys.add('ArrowDown'); p.keys.add('KeyS');
  const r = hold(sec);
  p.keys.delete('ArrowDown'); p.keys.delete('KeyS');
  return r;
}
function pull(sec) {
  const p = P();
  clearStick();
  p.keys.add('ArrowUp');
  const r = hold(sec);
  p.keys.delete('ArrowUp');
  return r;
}
function perchNear(tx, tz, rad) {
  const list = window.__ctx.services.harbor.perches || [];
  let best = null;
  for (const raw of list) {
    const q = Array.isArray(raw) ? { x: raw[0], y: raw[1], z: raw[2] } : raw;
    if (!q || !Number.isFinite(q.x)) continue;
    const d = Math.hypot(q.x - tx, q.z - tz);
    if (d > rad) continue;
    if (!best || q.y > best.y) best = { x: q.x, y: q.y, z: q.z, d: +d.toFixed(1) };
  }
  return best;
}
function settle(spot) {
  sit(spot);
  const s = gu().state;
  s.yaw = aim(spot.x, spot.z, spot.x - 80, spot.z + 40);
  return hold(1.3);
}
function flapOnce() {
  const p = P();
  p.keys.add('Space');
  const r = hold(0.12);
  p.keys.delete('Space');
  return r;
}
function sit(spot) {
  const g = gu();
  const s = g.state;
  const p = P();
  s.perched = true; s.x = spot.x; s.y = spot.y; s.z = spot.z; s.speed = 0; s.vy = 0; s.pitch = 0; s.roll = 0;
  p.pos.set(spot.x, spot.y, spot.z);
  p.prevPos && p.prevPos.copy(p.pos);
  advance(1 / 30);
  return { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), perched: s.perched };
}
function solidCam() {
  const c = window.__ctx.camera.position;
  const phys = window.__ctx.physics;
  const s = (y) => { try { return !!phys.solidAt(c.x, c.z, y); } catch (e) { return null; } };
  return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), boom: av() && +av().boom.toFixed(2), at: s(c.y), up: s(c.y + 0.22), feet: +P().pos.y.toFixed(2), model: av() && av().model, clip: av() && av().clip };
}
function march(x, z, yaw, steps) {
  placeWalk(x, z, yaw);
  P().keys.add('KeyW');
  const samples = [solidCam()];
  const n = steps || 36;
  for (let i = 0; i < n; i++) {
    P().step(1 / 30); advance(1 / 30);
    if (i % 3 === 2) samples.push(solidCam());
  }
  P().keys.delete('KeyW');
  const bad = samples.filter((s) => s.at || s.up);
  return { n: samples.length, bad: bad.length, first: samples[0], last: samples[samples.length - 1], hits: bad.slice(0, 4) };
}
function handoffStep(kind) {
  const p = P();
  const g = gu();
  if (kind === 'glide') return glide(0.1);
  if (kind === 'drone') { if (g.active) g.leave('drone'); return hold(0.1); }
  if (kind === 'walk') { if (g.active) g.leave('walk'); p.keys.add('KeyW'); p.step(0.1); advance(0.1); return { clip: av().clip, fly: p.fly, gull: !!g.active }; }
  if (kind === 'up') { if (!g.active) g.enter(); return hold(0.1); }
  return hold(0.1);
}
function creditOn() {
  const el = document.querySelector('.hoya-credit');
  return { hidden: !el || el.hidden, text: el ? el.textContent.replace(/\\s+/g, ' ').trim() : '' };
}
function diag() {
  const errs = (window.__console || []).filter((l) => /error|onerror|unhandled|\\[avatar\\]|\\[play\\]|\\[gull\\]/i.test(l)).slice(-12);
  const p = P();
  return {
    person: p.person, fly: p.fly, gull: p.gull,
    model: av() && av().model, clip: av() && av().clip, boom: av() && +av().boom.toFixed(2),
    view: window.__life && window.__life.hud && window.__life.hud.view,
    personUi: window.__life && window.__life.hud && window.__life.hud.person,
    label: (document.querySelector('[data-act="view"]') || {}).innerText || '',
    lang: document.documentElement.lang || (document.getElementById('klc-ui') || {}).lang || '',
    errs,
  };
}
function costs() {
  const third = window.__bench(4);
  const p = P();
  p.person = 'first';
  try { window.__life.hud.noteMode('walk1'); } catch (e) {}
  advance(1 / 30);
  const first = window.__bench(4);
  p.person = 'third';
  try { window.__life.hud.noteMode('walk3'); } catch (e) {}
  advance(1 / 30);
  return {
    avatar: av().cost(),
    gull: gu().cost(),
    callsThird: third.calls, callsFirst: first.calls,
  };
}
function grab() {
  window.__raf.step(2);
  const src = document.querySelector('#scene');
  return src.toDataURL('image/jpeg', 0.74);
}
`;

function writeJpeg(file, dataUrl) {
  const buf = Buffer.from(String(dataUrl).replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  writeFileSync(file, buf);
  return buf.length;
}

async function waitModel(wk) {
  for (let i = 0; i < 40; i++) {
    const m = await wk.eval(PAGE + 'advance(0.05); return (av() && av().model) || "";');
    if (m === 'hoya') { log('hoya ready', i); return 'hoya'; }
    await sleep(250);
  }
  log('hoya missing', JSON.stringify(await wk.eval(PAGE + 'return diag();')));
  return 'original';
}

async function session(name, w, h, { dsf = null, q = 'high', cssW = w, cssH = h } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-avatar-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${base}?shot=1&ui=1&lang=ja&q=${q}&w=${w}&h=${h}&t=8&cam=walk`;
  log(name, url);
  const proc = Bun.spawn([BIN, url, workdir, String(cssW), String(cssH)], { env: { ...process.env, ...(dsf ? { KLC_DSF: String(dsf) } : {}) }, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  const bag = {};
  try {
    const t0 = Date.now();
    const r = await wk.ready(600);
    log(`${name}: ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(r));
    await wk.eval(PAGE + 'clockSet(8); window.__lifeSet("hiru"); return 1;');
    bag.model = await waitModel(wk);
    await wk.eval(PAGE + 'placeWalk(168, -122, 111); return diag();');
    await fn(wk, bag);
    const errs = (await wk.console()).filter((l) => /^error|onerror|unhandled/.test(l)).slice(0, 8);
    log(`${name}: errors`, JSON.stringify(errs));
    bag.errors = errs;
  } finally {
    try { await wk.quit(); } catch { /* gone */ }
    try { proc.kill(9); } catch { /* gone */ }
    rmSync(workdir, { recursive: true, force: true });
  }
  return bag;
}

async function still(wk, js, file) {
  const info = js ? await wk.eval(PAGE + js) : null;
  const url = await wk.eval(PAGE + 'return grab();');
  const n = writeJpeg(join(out, file), url);
  log('saved', file, (n / 1024).toFixed(0) + 'KB', info ? JSON.stringify(info).slice(0, 240) : '');
  return info;
}

async function frames(wk, dir, count, stepJs, start = 0) {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    if (stepJs) await wk.eval(PAGE + stepJs);
    const url = await wk.eval(PAGE + 'return grab();');
    writeJpeg(join(dir, `f${String(start + i).padStart(3, '0')}.jpg`), url);
  }
  return start + count;
}

function wavBytes(samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}
function mixAt(out, tap, at, gain) {
  const o = at | 0;
  for (let i = 0; i < tap.length && o + i < out.length; i++) out[o + i] += tap[i] * gain;
}
function stepsWav(seconds, kind, every) {
  const sr = 22050;
  const outS = new Float32Array((sr * seconds) | 0);
  const tap = footstep(sr, kind);
  for (let t = 0.18; t < seconds; t += every) mixAt(outS, tap, t * sr, 0.9);
  return wavBytes(outS, sr);
}
function gullWav(seconds, { cryAt = 0.45, speed = 11 } = {}) {
  const sr = 22050;
  const n = (sr * seconds) | 0;
  const outS = new Float32Array(n);
  let b = 0;
  const amp = Math.min(0.22, 0.05 + speed / 180);
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    b = b * 0.992 + white * 0.02;
    outS[i] = b * amp * 8;
  }
  mixAt(outS, cry(sr), cryAt * sr, 0.85);
  return wavBytes(outS, sr);
}
function film(name, seconds, wav, dirName = name) {
  const dir = join(out, '_frames', dirName);
  const wavPath = join(out, '_frames', name + '.wav');
  writeFileSync(wavPath, wav);
  const mp4 = join(out, name + '.mp4');
  const r = Bun.spawnSync(['ffmpeg', '-y', '-framerate', '10', '-i', join(dir, 'f%03d.jpg'), '-i', wavPath, '-shortest', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-b:a', '96k', mp4], { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) log('ffmpeg', name, r.stderr.toString().slice(-500));
  else log('film', mp4);
}

const report = {};

try {
  if (want.has('dives')) {
    report.dives = await session('dives', 1600, 900, {}, async (wk) => {
      await wk.eval(PAGE + 'window.__lifeSet("yoru"); return 1;');
      await still(wk, 'return walk(0.8);', 'desktop-ja-walk-night.jpg');
      await wk.eval(PAGE + 'window.__lifeSet("hiru"); window.__mm = window.matchMedia; window.matchMedia = (q) => String(q).includes("reduce") ? { matches: true, addEventListener(){}, removeEventListener(){} } : window.__mm.call(window, q); return 1;');
      await still(wk, 'return placeWalk(168, -122, 111);', 'desktop-ja-walk-still.jpg');
      await wk.eval(PAGE + 'window.matchMedia = window.__mm; return 1;');
      rmSync(join(out, '_frames', 'dive'), { recursive: true, force: true });
      rmSync(join(out, '_frames', 'pullup'), { recursive: true, force: true });
      await still(wk, 'return startGull(280, 30, 70, aim(280, 30, 200, 80));', 'desktop-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.1);', 'desktop-ja-dive.jpg');
      await still(wk, 'return pull(1.2);', 'desktop-ja-pullup.jpg');
      await wk.eval(PAGE + 'return startGull(280, 30, 70, aim(280, 30, 200, 80));');
      await frames(wk, join(out, '_frames', 'dive'), 12, 'return dive(0.1);');
      await frames(wk, join(out, '_frames', 'pullup'), 12, 'return pull(0.1);');
    });
    report.phoneDive = await session('phone-dive', 1179, 2556, { dsf: 3, q: 'phone', cssW: 393, cssH: 852 }, async (wk) => {
      await still(wk, 'return startGull(280, 30, 70, aim(280, 30, 200, 80));', 'phone-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.0);', 'phone-ja-dive.jpg');
      await still(wk, 'return pull(1.0);', 'phone-ja-pullup.jpg');
    });
    await session('land', 2556, 1179, { dsf: 3, q: 'phone', cssW: 852, cssH: 393 }, async (wk) => {
      await still(wk, 'return walk(1.2);', 'phone-land-ja-walk.jpg');
    });
  } else if (want.has('polish')) {
    report.polish = await session('polish', 1600, 900, {}, async (wk) => {
      const alley = await wk.eval(PAGE + 'return readable(-112, -80, -96, -48, 8);');
      log('alley', JSON.stringify(alley));
      report.alley = alley;
      if (alley) await still(wk, `return placeWalk(${alley.x}, ${alley.z}, ${alley.yaw});`, 'desktop-ja-alley.jpg');
      const col = await wk.eval(PAGE + 'return readable(-6, 14, 30, 54, 4);');
      log('colonnade', JSON.stringify(col));
      report.colonnade = col;
      if (col) await still(wk, `return placeWalk(${col.x}, ${col.z}, ${col.yaw});`, 'desktop-ja-colonnade.jpg');
      await still(wk, 'return startGull(300, 10, 36, aim(300, 10, 341, -25));', 'desktop-ja-glide-born.jpg');
      await still(wk, 'return glide(1.6);', 'desktop-ja-glide.jpg');
      await still(wk, 'return flapOnce();', 'desktop-ja-flap.jpg');
      const spot = await wk.eval(PAGE + 'return perchNear(341, -25, 90);');
      report.perch = spot;
      if (spot) await still(wk, `return settle(${JSON.stringify({ x: spot.x, y: spot.y, z: spot.z })});`, 'desktop-ja-perch.jpg');
      if (alley) {
        rmSync(join(out, '_frames', 'alley'), { recursive: true, force: true });
        await wk.eval(PAGE + `gu().leave("stop"); placeWalk(${alley.x}, ${alley.z}, ${alley.yaw}); P().keys.add("KeyW"); return 1;`);
        await frames(wk, join(out, '_frames', 'alley'), 16, 'P().step(0.1); advance(0.1); return 1;');
      }
      rmSync(join(out, '_frames', 'glide'), { recursive: true, force: true });
      await wk.eval(PAGE + 'return startGull(300, 10, 36, aim(300, 10, 341, -25));');
      await frames(wk, join(out, '_frames', 'glide'), 16, 'return glide(0.1);');
      await frames(wk, join(out, '_frames', 'glide'), 4, 'return flapOnce();', 16);
      if (spot) {
        rmSync(join(out, '_frames', 'perch'), { recursive: true, force: true });
        await wk.eval(PAGE + `return settle(${JSON.stringify({ x: spot.x, y: spot.y, z: spot.z })});`);
        await frames(wk, join(out, '_frames', 'perch'), 8, 'return hold(0.1);');
      }
      rmSync(join(out, '_frames', 'handoff'), { recursive: true, force: true });
      await wk.eval(PAGE + 'gu().leave("stop"); placeWalk(168, -122, 111); return startGull(168, -122, 6, 111);');
      let hi = 0;
      hi = await frames(wk, join(out, '_frames', 'handoff'), 8, 'return handoffStep("glide");', hi);
      hi = await frames(wk, join(out, '_frames', 'handoff'), 6, 'return handoffStep("drone");', hi);
      hi = await frames(wk, join(out, '_frames', 'handoff'), 6, 'return handoffStep("up");', hi);
      await frames(wk, join(out, '_frames', 'handoff'), 8, 'return handoffStep("walk");', hi);
    });
    report.phone = await session('phone', 1179, 2556, { dsf: 3, q: 'phone', cssW: 393, cssH: 852 }, async (wk) => {
      await still(wk, 'return walk(2.6);', 'phone-ja-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'return { label: (document.querySelector(\'[data-act="view"]\')||{}).innerText };', 'phone-en-walk.jpg');
      if (report.alley) await still(wk, `return placeWalk(${report.alley.x}, ${report.alley.z}, ${report.alley.yaw});`, 'phone-ja-alley.jpg');
      if (report.colonnade) await still(wk, `return placeWalk(${report.colonnade.x}, ${report.colonnade.z}, ${report.colonnade.yaw});`, 'phone-ja-colonnade.jpg');
      await still(wk, 'return startGull(300, 10, 36, aim(300, 10, 341, -25));', 'phone-ja-glide-born.jpg');
      await still(wk, 'glide(1.2); return flapOnce();', 'phone-ja-glide.jpg');
      if (report.perch) await still(wk, `return settle(${JSON.stringify({ x: report.perch.x, y: report.perch.y, z: report.perch.z })});`, 'phone-ja-perch.jpg');
    });
  } else if (want.has('clip')) {
    report.clip = await session('clip', 1600, 900, {}, async (wk) => {
      const door = await wk.eval(PAGE + 'return march(-14.56, 46.73, aim(-14.56, 46.73, -13.69, 45.90), 48);');
      log('door', JSON.stringify(door));
      await still(wk, 'return creditOn();', 'desktop-ja-door.jpg');
      const stair = await wk.eval(PAGE + 'return march(-1.06, 75.54, aim(-1.06, 75.54, 1.64, 80.45), 70);');
      log('stair', JSON.stringify(stair));
      await still(wk, 'return creditOn();', 'desktop-ja-stair.jpg');
      const bleach = await wk.eval(PAGE + 'return march(2.4, 45.05, aim(2.4, 45.05, 6.2, 39.2), 40);');
      log('bleach', JSON.stringify(bleach));
      return { door, stair, bleach };
    });
  } else if (want.has('retake')) {
    report.desktop = await session('desktop', 1600, 900, {}, async (wk) => {
      await still(wk, 'return walk(1.2);', 'desktop-ja-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'return { label: document.querySelector(\'[data-act="view"]\').innerText };', 'desktop-en-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'window.__lifeSet("yoru"); advance(0.05); return walk(0.2);', 'desktop-ja-walk-night.jpg');
      await wk.eval(PAGE + 'window.__lifeSet("hiru"); window.__mm = window.matchMedia; window.matchMedia = (q) => String(q).includes("reduce") ? { matches: true } : window.__mm.call(window, q); advance(0.05); return 1;');
      await still(wk, 'return placeWalk(168, -122, 111);', 'desktop-ja-walk-still.jpg');
      await wk.eval(PAGE + 'window.matchMedia = window.__mm; return 1;');
      const alley = await wk.eval(PAGE + 'return readable(-112, -80, -96, -48, 8);');
      log('alley', JSON.stringify(alley));
      report.alley = alley;
      if (alley) await still(wk, `return placeWalk(${alley.x}, ${alley.z}, ${alley.yaw});`, 'desktop-ja-alley.jpg');
      const col = await wk.eval(PAGE + 'return readable(-6, 14, 30, 54, 4);');
      log('colonnade', JSON.stringify(col));
      report.colonnade = col;
      if (col) await still(wk, `return placeWalk(${col.x}, ${col.z}, ${col.yaw});`, 'desktop-ja-colonnade.jpg');
      await still(wk, 'return startGull(260, -8, 18, aim(260, -8, 341, -25));', 'desktop-ja-glide-born.jpg');
      await still(wk, 'return glide(1.6);', 'desktop-ja-glide.jpg');
      const spot = { x: 341.6, y: 8.6, z: -23.4 };
      report.perch = spot;
      await still(wk, `return sit(${JSON.stringify(spot)});`, 'desktop-ja-perch.jpg');
      await still(wk, 'return startGull(240, 20, 48, aim(240, 20, 180, 60));', 'desktop-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.4);', 'desktop-ja-dive.jpg');
      await still(wk, 'return pull(1.5);', 'desktop-ja-pullup.jpg');
      try { report.cost = await wk.eval(PAGE + 'const g = gu(); if (g.active) g.leave("stop"); placeWalk(168,-122,111); walk(0.5); return costs();'); } catch (e) { log('cost', String(e).slice(0, 200)); }
      await wk.eval(PAGE + 'placeWalk(168, -122, 111); P().keys.add("KeyW"); return 1;');
      await frames(wk, join(out, '_frames', 'walk'), 12, 'P().step(0.1); advance(0.1); return 1;');
      await wk.eval(PAGE + 'return startGull(260, -8, 18, aim(260, -8, 341, -25));');
      await frames(wk, join(out, '_frames', 'glide'), 12, 'return glide(0.1);');
      await frames(wk, join(out, '_frames', 'perch'), 6, `return sit(${JSON.stringify(spot)});`);
      await wk.eval(PAGE + 'return startGull(240, 20, 48, aim(240, 20, 180, 60));');
      await frames(wk, join(out, '_frames', 'dive'), 10, 'return dive(0.1);');
      await frames(wk, join(out, '_frames', 'pullup'), 8, 'return pull(0.1);');
    });
    report.phone = await session('phone', 1179, 2556, { dsf: 3, q: 'phone', cssW: 393, cssH: 852 }, async (wk) => {
      await still(wk, 'return walk(1.0);', 'phone-ja-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'return { label: (document.querySelector(\'[data-act="view"]\')||{}).innerText };', 'phone-en-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      if (report.alley) await still(wk, `return placeWalk(${report.alley.x}, ${report.alley.z}, ${report.alley.yaw});`, 'phone-ja-alley.jpg');
      if (report.colonnade) await still(wk, `return placeWalk(${report.colonnade.x}, ${report.colonnade.z}, ${report.colonnade.yaw});`, 'phone-ja-colonnade.jpg');
      await still(wk, 'return startGull(260, -8, 18, aim(260, -8, 341, -25));', 'phone-ja-glide-born.jpg');
      await still(wk, 'return glide(1.4);', 'phone-ja-glide.jpg');
      await still(wk, 'return sit({x:341.6,y:8.6,z:-23.4});', 'phone-ja-perch.jpg');
      await still(wk, 'return startGull(240, 20, 48, aim(240, 20, 180, 60));', 'phone-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.2);', 'phone-ja-dive.jpg');
      await still(wk, 'return pull(1.2);', 'phone-ja-pullup.jpg');
    });
  } else if (want.has('probe') || want.has('all') || want.has('desktop')) {
    report.desktop = await session('desktop', 1600, 900, {}, async (wk) => {
      const d = await wk.eval(PAGE + 'return diag();');
      log('diag', JSON.stringify(d));
      report.diag = d;
      await still(wk, 'return walk(1.4);', 'desktop-ja-walk.jpg');
      if (want.has('probe') && !want.has('all') && !want.has('desktop')) return;
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'return { label: document.querySelector(\'[data-act="view"]\').innerText };', 'desktop-en-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      const alley = await wk.eval(PAGE + 'return readable(-112, -80, -96, -48, 8);');
      log('alley', JSON.stringify(alley));
      report.alley = alley;
      if (alley) await still(wk, `return placeWalk(${alley.x}, ${alley.z}, ${alley.yaw});`, 'desktop-ja-alley.jpg');
      const col = await wk.eval(PAGE + 'return readable(-6, 14, 30, 54, 4);');
      log('colonnade', JSON.stringify(col));
      report.colonnade = col;
      if (col) await still(wk, `return placeWalk(${col.x}, ${col.z}, ${col.yaw});`, 'desktop-ja-colonnade.jpg');
      const born = await wk.eval(PAGE + 'return startGull(300, 10, 36, aim(300, 10, 341, -25));');
      log('born', JSON.stringify(born));
      await still(wk, 'return glide(2.2);', 'desktop-ja-glide.jpg');
      const spot = await wk.eval(PAGE + 'return perchNear(341, -25, 90);');
      log('perch spot', JSON.stringify(spot));
      report.perch = spot;
      if (spot) await still(wk, `return sit(${JSON.stringify({ x: spot.x, y: spot.y, z: spot.z })});`, 'desktop-ja-perch.jpg');
      await still(wk, 'return startGull(280, 30, 70, aim(280, 30, 200, 80));', 'desktop-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.3);', 'desktop-ja-dive.jpg');
      await still(wk, 'return pull(1.6);', 'desktop-ja-pullup.jpg');
      try { report.cost = await wk.eval(PAGE + 'gu().leave("stop"); placeWalk(168, -122, 111); walk(0.6); return costs();'); } catch (e) { log('cost', e.message); }
      if (!want.has('film') && !want.has('all')) return;
      await wk.eval(PAGE + 'placeWalk(168, -122, 111); P().keys.add("KeyW"); return 1;');
      await frames(wk, join(out, '_frames', 'walk'), 20, 'P().step(0.1); advance(0.1); return 1;');
      if (alley) {
        await wk.eval(PAGE + `placeWalk(${alley.x}, ${alley.z}, ${alley.yaw}); P().keys.add("KeyW"); return 1;`);
        await frames(wk, join(out, '_frames', 'alley'), 16, 'P().step(0.1); advance(0.1); return 1;');
      }
      await wk.eval(PAGE + 'return startGull(300, 10, 36, aim(300, 10, 341, -25));');
      await frames(wk, join(out, '_frames', 'glide'), 20, 'return glide(0.1);');
      if (spot) {
        await frames(wk, join(out, '_frames', 'perch'), 8, `return sit(${JSON.stringify({ x: spot.x, y: spot.y, z: spot.z })});`);
      }
      await wk.eval(PAGE + 'return startGull(280, 30, 70, aim(280, 30, 200, 80));');
      await frames(wk, join(out, '_frames', 'dive'), 12, 'return dive(0.1);');
      await frames(wk, join(out, '_frames', 'pullup'), 12, 'return pull(0.1);');
      rmSync(join(out, '_frames', 'handoff'), { recursive: true, force: true });
      await wk.eval(PAGE + 'gu().leave("stop"); placeWalk(168, -122, 111); P().keys.delete("KeyW"); return startGull(168, -122, 6, 111);');
      let hi = 0;
      hi = await frames(wk, join(out, '_frames', 'handoff'), 8, 'return handoffStep("glide");', hi);
      hi = await frames(wk, join(out, '_frames', 'handoff'), 6, 'return handoffStep("drone");', hi);
      hi = await frames(wk, join(out, '_frames', 'handoff'), 6, 'return handoffStep("up");', hi);
      await frames(wk, join(out, '_frames', 'handoff'), 8, 'return handoffStep("walk");', hi);
    });
  }
  if (want.has('all') || want.has('phone')) {
    report.phone = await session('phone', 1179, 2556, { dsf: 3, q: 'phone', cssW: 393, cssH: 852 }, async (wk) => {
      await still(wk, 'return walk(1.2);', 'phone-ja-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      await still(wk, 'return { label: (document.querySelector(\'[data-act="view"]\')||{}).innerText };', 'phone-en-walk.jpg');
      await wk.eval(PAGE + 'document.querySelector(\'[data-act="lang"]\').click(); return 1;');
      if (report.alley) await still(wk, `return placeWalk(${report.alley.x}, ${report.alley.z}, ${report.alley.yaw});`, 'phone-ja-alley.jpg');
      if (report.colonnade) await still(wk, `return placeWalk(${report.colonnade.x}, ${report.colonnade.z}, ${report.colonnade.yaw});`, 'phone-ja-colonnade.jpg');
      await still(wk, 'return startGull(300, 10, 36, aim(300, 10, 341, -25));', 'phone-ja-glide-born.jpg');
      await still(wk, 'return glide(2);', 'phone-ja-glide.jpg');
      if (report.perch) await still(wk, `return sit(${JSON.stringify({ x: report.perch.x, y: report.perch.y, z: report.perch.z })});`, 'phone-ja-perch.jpg');
      await still(wk, 'return startGull(280, 30, 70, aim(280, 30, 200, 80));', 'phone-ja-dive-setup.jpg');
      await still(wk, 'return dive(1.2);', 'phone-ja-dive.jpg');
      await still(wk, 'return pull(1.4);', 'phone-ja-pullup.jpg');
    });
  }
} finally {
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(report, null, 2));
}

if (want.has('all') || want.has('film') || want.has('retake') || want.has('polish') || want.has('dives')) {
  const framesRoot = join(out, '_frames');
  if (existsSync(join(framesRoot, 'walk'))) film('walk', 2.0, stepsWav(2.0, 'wood', 0.2));
  if (existsSync(join(framesRoot, 'alley'))) film('alley', 1.6, stepsWav(1.6, 'asphalt', 0.78 / 3.1));
  if (existsSync(join(framesRoot, 'glide'))) film('glide', 2.0, gullWav(2.0, { speed: 11 }));
  if (existsSync(join(framesRoot, 'perch'))) film('perch', 0.8, gullWav(0.8, { cryAt: 0.15, speed: 0 }));
  if (existsSync(join(framesRoot, 'dive'))) {
    const dir = join(framesRoot, 'dive-pull');
    mkdirSync(dir, { recursive: true });
    let i = 0;
    for (const part of ['dive', 'pullup']) {
      const sub = join(framesRoot, part);
      if (!existsSync(sub)) continue;
      for (const f of readdirSync(sub).filter((n) => n.endsWith('.jpg')).sort()) {
        const b = Bun.file(join(sub, f));
        writeFileSync(join(dir, `f${String(i++).padStart(3, '0')}.jpg`), Buffer.from(await b.arrayBuffer()));
      }
    }
    film('dive', 2.4, gullWav(2.4, { cryAt: 0.3, speed: 24 }), 'dive-pull');
  }
  if (existsSync(join(framesRoot, 'handoff'))) film('handoff', 2.8, gullWav(2.8, { cryAt: 0.6, speed: 16 }));
}
log('done', out);
