// [play:underwater] Round-3 art stills: the same eight frames in every size and language, so BEFORE and AFTER pair up.
//   env -u NODE_OPTIONS bun tools/anime/underwater-r3.mjs --port 9500 --prefix r3-before --sets dj,pj
//   env -u NODE_OPTIONS bun tools/anime/underwater-r3.mjs --port 9501 --prefix r3-after --shots caustics,surface --perf
// --sets: dj desktop ja (1440×900), de desktop en, pj phone ja (393×852 @3, resampled to 786 wide), pe phone en, pl phone landscape ja,
//   dr desktop ja at 2× (Retina, resampled to 1440 wide). --q '&preset=yoru' (any extra query), --shots a,b (meadow is an extra).
// --nobuild serves the existing dist/anime-<port> (a BEFORE bundle built from the old head stays untouched while the source moves on).
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9501));
if (port < 9500 || port > 9504) throw new Error('underwater ports are 9500-9504');
const out = arg('out', join(ROOT, 'docs/play/shots/underwater'));
const prefix = arg('prefix', 'r3-after');
const sets = String(arg('sets', 'dj,de,pj,pe')).split(',');
const ORDER = ['caustics', 'school', 'meadow', 'jelly', 'breach', 'apex', 'surface', 'raft', 'hoya', 'shafts'];
// meadow and jelly are extras (store-listing frames); the round-2 set is the other eight
const shots = arg('shots') ? String(arg('shots')).split(',') : ORDER.filter((s) => s !== 'meadow' && s !== 'jelly');
const extraQ = arg('q', '');
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[r3]', ...a);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') {
  const built = await build({ outdir: dist, quiet: true });
  log('build', JSON.stringify(built));
  if (built.reused) throw new Error('build failed and would have reused a stale bundle');
}
if (arg('buildonly') === '1') process.exit(0);
const srv = serve({ port, dist });

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

async function session(name, w, h, { dsf = null, q = 'high', extra = '' } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-r3-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?w=${w}&h=${h}&q=${q}&shot=1${extra}${extraQ}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const ready = await wk.ready(600);
    log(name, 'ready', ready.ms);
    await fn(wk);
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function page(wk, file, width) {
  await wk.eval("const h = document.querySelector('.swim-hint'); if (h) h.hidden = true; const b = document.querySelector('.swim-become'); if (b) b.hidden = true; return 1");
  const png = join(out, file + '.png');
  let shot = false;
  try {
    const r = await wk.send({ op: 'page', file: png }, 30);
    shot = !!(r && r.ok);
    if (!shot) log('page fallback', file, r && r.error);
  } catch (e) { log('page fallback', file, e.message); }
  if (!shot) await wk.shot(png, 1);
  jpg(png, join(out, file + '.jpg'), width);
  log('saved', file);
}

// Each pose runs the simulation on from the last one (never back to 0), then draws two frames.
const STEP = `
  const sw = window.__swim;
  window.__r3t = (window.__r3t || 3) + 0.7;
  const go = (p, more = 0) => { sw.pose(p); window.__simTo(window.__r3t + more); window.__r3t += more; window.__raf.step(2); };
`;
const POSE = {
  caustics: `go({ x: 368, y: -1.35, z: 12, yaw: 0.8, pitch: -0.7, vx: 0, vy: 0, vz: 0, mode: 'swim' });`,
  school: `go({ x: 186, y: -2.3, z: 18, yaw: 0.5, pitch: 0.05, vx: 0, vy: 0, vz: 0, mode: 'swim' });`,
  breach: `sw.pose({ x: 420, y: 0.12, z: 40, yaw: 0, pitch: 1.05, vx: 0, vy: 9.4, vz: 0, mode: 'breach', breachT: 0 });
    window.__simTo(window.__r3t + 0.3); window.__r3t += 0.3; window.__raf.step(2);`,
  apex: `sw.pose({ x: 420, y: 2.7, z: 36, yaw: 0.35, pitch: 0.2, mode: 'breach', breachT: 0.4, vy: 5.5, vx: -1.1, vz: -2.4 });
    sw.splash('out'); window.__raf.step(3);`,
  surface: `go({ x: 392, y: -2.4, z: 26, yaw: 0.6, pitch: 0.95, vx: 0, vy: 0, vz: 0, mode: 'swim' });`,
  meadow: `go({ x: 362, y: -2.6, z: 7, yaw: 2.2, pitch: 0.1, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: { cx: 366.5, cy: -3.4, cz: 9.5, lx: 360, ly: -1.6, lz: 3.5 } });`,
  jelly: `go({ x: 352, y: -2.4, z: -6, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: { cx: 353.2, cy: -2.4, cz: -3.2, lx: 352, ly: -2.2, lz: -6 } });`,
  raft: `go({ x: 1606, y: -6.1, z: 3634, yaw: 0.4, pitch: 0.42, vx: 0, vy: 0, vz: 0, mode: 'swim' });`,
  hoya: `const h = sw.hero; go({ x: h.park.x, y: h.park.y, z: h.park.z, yaw: h.yaw, pitch: 0.15, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: h.frame });`,
  shafts: `const h = sw.hero; go({ x: h.under.x, y: h.under.y, z: h.under.z, yaw: h.yaw, pitch: 0.35, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: h.shaft, glow: h.at });`,
};

async function errors(wk) {
  const raw = await wk.eval("return JSON.stringify((window.__console||[]).filter(s => /error|Error|compile|shader/i.test(s)).slice(-30))");
  const list = JSON.parse(raw);
  if (list.length) log('console', list.join('\n'));
  return list;
}

async function perf(wk, tag) {
  const raw = await wk.eval(`
    const vis = window.__bench(10);
    const nodes = window.__swim.nodes || [];
    const shown = nodes.map((m) => m.visible);
    for (const n of nodes) n.visible = false;
    const hid = window.__bench(10);
    nodes.forEach((m, i) => { m.visible = shown[i]; });
    window.__swim._sum = 0; window.__swim._n = 0;
    window.__r3t += 3; window.__simTo(window.__r3t);
    const n = window.__swim._n || 1;
    const mem = window.__ctx.renderer.info.memory;
    return JSON.stringify({
      visCalls: vis.meanCalls, hidCalls: hid.meanCalls, delta: vis.meanCalls - hid.meanCalls,
      visMs: vis.ms, hidMs: hid.ms, visTris: vis.meanTriangles, hidTris: hid.meanTriangles,
      step: +((window.__swim._sum || 0) / n).toFixed(4), steps: window.__swim._n,
      textures: mem.textures, geometries: mem.geometries, programs: vis.programs,
      names: nodes.map((m) => m.name + ':' + (m.visible ? 'on' : 'off')),
    });
  `, 240);
  log('perf', tag, raw);
  writeFileSync(join(out, `${prefix}-perf-${tag}.json`), raw);
}

const SETS = {
  dj: { name: 'desktop-ja', w: 1440, h: 900, opt: {}, width: null },
  de: { name: 'desktop-en', w: 1440, h: 900, opt: { extra: '&lang=en' }, width: null },
  pj: { name: 'phone-ja', w: 393, h: 852, opt: { dsf: 3, q: 'phone' }, width: 786 },
  pe: { name: 'phone-en', w: 393, h: 852, opt: { dsf: 3, q: 'phone', extra: '&lang=en' }, width: 786 },
  pl: { name: 'phone-land-ja', w: 852, h: 393, opt: { dsf: 3, q: 'phone' }, width: 1278 },
  dr: { name: 'retina-ja', w: 1440, h: 900, opt: { dsf: 2 }, width: 1440 },
};

// A 20 s swim in one take, with the page's own sound: over the meadow, through the school, a leap with a spin, back
// under and over the sunlit sand. Real time (not shot mode); MediaRecorder at 30 fps, then H.264 + AAC.
async function video() {
  const name = arg('videoname', 'r3-swim');
  const workdir = join(ROOT, 'dist/perf/wk-r3-video-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?w=1280&h=720&q=high&swim=1${extraQ}`;
  const proc = Bun.spawn([BIN, url, workdir, '1280', '720'], { env: { ...process.env, KLC_AUTOPLAY: '1' }, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const t0 = Date.now();
    for (;;) {
      const v = JSON.parse(await wk.eval("return JSON.stringify({ loaded: document.body.classList.contains('loaded'), swim: !!(window.__swim && window.__swim.state), fatal: window.__fatal ? String(window.__fatal) : null })"));
      if (v.fatal) throw new Error(v.fatal);
      if (v.loaded && v.swim) break;
      if (Date.now() - t0 > 420000) throw new Error('not live');
      await Bun.sleep(1500);
    }
    log('video live', Date.now() - t0);
    const meta = await wk.eval(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      document.body.classList.add('playing', 'shot');
      for (const el of document.querySelectorAll('.swim-hint, .swim-become')) el.hidden = true;
      const swim = window.__swim;
      const audio = window.__ctx.audio;
      audio.muted = false;
      try { await audio.start(); } catch (e) {}
      try { if (audio.context && audio.context.state !== 'running') await audio.context.resume(); } catch (e) {}
      swim.pose({ x: 350, y: -2.2, z: 22, yaw: -0.72, pitch: -0.12, vx: 0, vy: 0, vz: 0, mode: 'swim' });
      window.__raf.resume && window.__raf.resume();
      await sleep(600);
      const stream = (audio.captureStream && audio.captureStream()) || null;
      const canvas = document.querySelector('#scene') || document.querySelector('canvas');
      const tracks = canvas.captureStream(30).getVideoTracks();
      if (stream) for (const t of stream.getAudioTracks()) tracks.push(t);
      const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      if (!mime) return JSON.stringify({ error: 'no MediaRecorder' });
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(250);
      const marks = [];
      const t0 = performance.now();
      const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
      const ctl = setInterval(() => {
        const s = swim.state; if (!s) return;
        const t = (performance.now() - t0) / 1000;
        const d = swim.drive || (swim.drive = { thrust: 0, strafe: 0, lift: 0, dash: false });
        if (s.splash) marks.push({ t: +t.toFixed(2), splash: s.splash, y: +s.y.toFixed(2) });
        if (s.mode === 'breach') { d.thrust = 0; d.dash = false; d.lift = 0; if (s.y > 1.25) swim.airTap(); return; }
        // over the meadow, through the school, then east into the deep water to leap, back under, and drift
        if (t < 4.5) { s.yaw = -0.72; s.pitch = -0.12; d.thrust = 0.75; d.dash = false; d.lift = 0; }
        else if (t < 7.0) { s.yaw = lerp(-0.72, -1.9, (t - 5.2) / 1.8); s.pitch = -0.04; d.thrust = 1; d.dash = true; d.lift = 0; }
        else if (t < 8.2) { s.yaw = -1.9; s.pitch = 0.3; d.thrust = 0.8; d.dash = false; d.lift = 0.1; }
        else if (t < 11.0) { s.yaw = -1.9; s.pitch = 1.05; d.thrust = 1; d.dash = s.stamina > 0.3; d.lift = 0.35; }
        else if (t < 13.8) { s.pitch = -0.55; d.thrust = 0.7; d.dash = false; d.lift = -0.2; }
        else if (t < 17.4) { s.yaw = lerp(-1.9, -2.5, (t - 13.8) / 3.6); s.pitch = -0.05; d.thrust = 0.6; d.lift = 0; }
        else { s.pitch = 0.15; d.thrust = 0.35; d.lift = 0; }
      }, 33);
      await sleep(20400);
      clearInterval(ctl);
      swim.drive = null;
      rec.stop();
      await stopped;
      const buf = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
      window.__clip = buf;
      return JSON.stringify({ bytes: buf.length, mime, audio: audio.context && audio.context.state, tracks: tracks.length, marks, breachN: swim.state && swim.state.breachN });
    `, 120);
    log('video meta', meta);
    const info = JSON.parse(meta);
    if (!info.bytes) throw new Error('no video bytes ' + meta);
    const bin = new Uint8Array(info.bytes);
    const step = 60000;
    for (let i = 0; i < info.bytes; i += step) {
      const b64 = await wk.eval(`const b = window.__clip; const i = ${i}; const n = Math.min(${step}, b.length - i); let s = ''; for (let k = 0; k < n; k += 8192) { s += String.fromCharCode.apply(null, b.subarray(i + k, i + Math.min(k + 8192, n))); } return btoa(s);`, 60);
      bin.set(Buffer.from(b64, 'base64'), i);
    }
    const raw = join(out, name + '-raw.' + (info.mime.includes('mp4') ? 'mp4' : 'webm'));
    writeFileSync(raw, bin);
    const mp4 = join(out, name + '.mp4');
    const ff = Bun.spawnSync(['ffmpeg', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4], { stdout: 'pipe', stderr: 'pipe' });
    if (ff.exitCode !== 0) throw new Error('ffmpeg ' + ff.stderr.toString().slice(-600));
    rmSync(raw, { force: true });
    const probe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', mp4]);
    writeFileSync(join(out, name + '-probe.json'), probe.stdout);
    writeFileSync(join(out, name + '-meta.json'), meta);
    log('video', mp4, probe.stdout.toString().replace(/\s+/g, ' '));
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

// Live frame time on the phone tier (real time, ?perf=1): 10 s of swimming through the school and the meadow.
// p50 / p95 / p99 of the frame interval, frames over 50 ms, the dive's own update time, the heap before and after.
async function live() {
  const workdir = join(ROOT, 'dist/perf/wk-r3-live-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const phone = arg('tier', 'phone') === 'phone';
  const [w, h] = phone ? [393, 852] : [1440, 900];
  const url = `${srv.url}index.html?w=${w}&h=${h}&q=${phone ? 'phone' : 'high'}&perf=1&swim=1${extraQ}`;
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env: { ...process.env, ...(phone ? { KLC_DSF: '3' } : {}) }, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const t0 = Date.now();
    for (;;) {
      const v = JSON.parse(await wk.eval("return JSON.stringify({ loaded: document.body.classList.contains('loaded'), swim: !!(window.__swim && window.__swim.state) })"));
      if (v.loaded && v.swim) break;
      if (Date.now() - t0 > 420000) throw new Error('not live');
      await Bun.sleep(1500);
    }
    const raw = await wk.eval(`
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const swim = window.__swim;
      swim.pose({ x: 350, y: -2.2, z: 22, yaw: -0.72, pitch: -0.1, vx: 0, vy: 0, vz: 0, mode: 'swim' });
      await sleep(3000);
      const d = swim.drive = { thrust: 0.8, strafe: 0, lift: 0, dash: false };
      swim._sum = 0; swim._n = 0;
      const heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
      window.__perf.start();
      const t0 = performance.now();
      const ctl = setInterval(() => {
        const s = swim.state; if (!s) return;
        const t = (performance.now() - t0) / 1000;
        s.yaw = -0.72 - Math.sin(t * 0.5) * 0.6; s.pitch = -0.05 + Math.sin(t * 0.7) * 0.1;
        d.dash = t > 3 && t < 5;
      }, 50);
      await sleep(10000);
      clearInterval(ctl);
      const r = window.__perf.stop();
      swim.drive = null;
      // r.t holds each frame's rAF timestamp: the frame time is the gap to the next one
      const ts = [];
      for (let i = 1; i < r.t.length; i++) { const g = r.t[i] - r.t[i - 1]; if (g > 0) ts.push(+g.toFixed(2)); }
      ts.sort((a, b) => a - b);
      const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
      const cpus = r.cpu.slice().sort((a, b) => a - b);
      const main = r.buckets['upd:main'] || [];
      const mod = {};
      for (const [k, col] of Object.entries(r.buckets)) { if (/swim|underwater/i.test(k)) mod[k] = +(col.reduce((a, b) => a + b, 0) / col.length).toFixed(3); }
      const heaps = r.heap.filter((v) => v != null);
      const errs = (window.__console || []).filter((s) => /error/i.test(s));
      return JSON.stringify({
        frames: ts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ts[ts.length - 1], over50: ts.filter((v) => v > 50).length,
        cpuMean: +(r.cpu.reduce((a, b) => a + b, 0) / Math.max(1, r.cpu.length)).toFixed(2),
        cpuP95: cpus[Math.floor(cpus.length * 0.95)],
        mainUpdMean: main.length ? +(main.reduce((a, b) => a + b, 0) / main.length).toFixed(3) : null,
        swimStepMean: +((swim._sum || 0) / Math.max(1, swim._n || 0)).toFixed(4),
        callsMean: Math.round(r.calls.reduce((a, b) => a + b, 0) / Math.max(1, r.calls.length)),
        dive: mod, buckets: Object.keys(r.buckets).slice(0, 40),
        heapMB: heaps.length ? [heaps[0], heaps[heaps.length - 1]] : heap0, longtasks: r.longtasks.length, consoleErrors: errs.length, errs: errs.slice(0, 5),
        worst: (() => {
          let wi = 1, wg = 0;
          for (let i = 1; i < r.t.length; i++) { const g = r.t[i] - r.t[i - 1]; if (g > wg) { wg = g; wi = i; } }
          const at = {};
          for (const [k, col] of Object.entries(r.buckets)) { for (const j of [wi - 1, wi]) if (col[j] > 1) at[k + '@' + j] = col[j]; }
          return { frame: wi, gap: +wg.toFixed(1), cpu: [r.cpu[wi - 1], r.cpu[wi]], calls: [r.calls[wi - 1], r.calls[wi]], buckets: at, t: +((r.t[wi] - r.t[0]) / 1000).toFixed(2) };
        })(),
      });
    `, 120);
    log('live', raw);
    writeFileSync(join(out, `r3-after-live-${phone ? 'phone' : 'desktop'}.json`), raw);
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

try {
  if (arg('live') === '1') await live();
  else if (arg('video') === '1') await video();
  else for (const k of sets) {
    const s = SETS[k];
    if (!s) throw new Error('unknown set ' + k);
    // Start in the inner bay (the default pose) so the town around 浮見堂 is streamed before the first frame.
    await session(k, s.w, s.h, { ...s.opt, extra: (s.opt.extra || '') + '&swim=1' }, async (wk) => {
      for (const shot of ORDER) {
        if (!shots.includes(shot)) continue;
        const r = await wk.eval(STEP + POSE[shot] + "\nreturn JSON.stringify({ y: +sw.state.y.toFixed(2), mode: sw.state.mode, cam: window.__ctx.camera.position.toArray().map((v) => +v.toFixed(2)) });", 180);
        log(s.name, shot, r);
        const err = await errors(wk);
        if (err.some((e) => /VALIDATE_STATUS|Shader Error|ERROR: 0:/i.test(e))) throw new Error('shader error on ' + s.name + ' ' + shot);
        await page(wk, `${prefix}-${s.name}-${shot}`, s.width);
        if (arg('perf') === '1' && k === 'pj' && shot === (arg('perfshot') || 'hoya')) await perf(wk, 'phone-' + shot);
        if (arg('perf') === '1' && k === 'dj' && shot === (arg('perfshot') || 'hoya')) await perf(wk, 'desktop-' + shot);
      }
    });
  }
} finally {
  srv.stop();
}
log('done', out);
