// [play:underwater] Round-2 stills and a play-test clip.
//   env -u NODE_OPTIONS bun tools/anime/underwater-proof.mjs --port 9501 --set stills
//   env -u NODE_OPTIONS bun tools/anime/underwater-proof.mjs --port 9501 --set video
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9501));
if (port < 9500 || port > 9504) throw new Error('underwater ports are 9500-9504');
const out = arg('out', join(ROOT, 'docs/play/shots/underwater'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[uw]', ...a);
const want = new Set(String(arg('set', 'stills')).split(','));
const on = (k) => want.has(k);

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
const srv = serve({ port, dist });

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

async function session(name, w, h, { dsf = null, q = 'high', extra = '', autoplay = false } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-uw-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?w=${w}&h=${h}&q=${q}${extra}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  if (autoplay) env.KLC_AUTOPLAY = '1';
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    if (extra.includes('shot=1')) {
      const ready = await wk.ready(480);
      log(name, 'ready', ready.ms);
    } else {
      const t0 = Date.now();
      for (;;) {
        const raw = await wk.eval("return JSON.stringify({ loaded: document.body.classList.contains('loaded'), swim: !!window.__swim, fatal: window.__fatal ? String(window.__fatal) : null })");
        const v = JSON.parse(raw);
        if (v.fatal) throw new Error(v.fatal);
        if (v.loaded && v.swim) { log(name, 'live', Date.now() - t0); break; }
        if (Date.now() - t0 > 420000) throw new Error('not live ' + raw);
        await Bun.sleep(1500);
      }
    }
    await fn(wk);
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function page(wk, name, width) {
  await wk.eval("const h = document.querySelector('.swim-hint'); if (h) h.hidden = true; const b = document.querySelector('.swim-become'); if (b) b.hidden = true; return 1");
  const png = join(out, name + '.png');
  let shot = false;
  try {
    const r = await wk.send({ op: 'page', file: png }, 18);
    shot = !!(r && r.ok);
    if (!shot) log('page fallback', name, r && r.error);
  } catch (e) { log('page fallback', name, e.message); }
  if (!shot) await wk.shot(png, 1);
  jpg(png, join(out, name + '.jpg'), width);
  log('saved', name);
}

async function errors(wk) {
  const raw = await wk.eval("return JSON.stringify((window.__console||[]).filter(s => /error|Error|compile|shader/i.test(s)).slice(-30))");
  const list = JSON.parse(raw);
  if (list.length) log('console', list.join('\n'));
  return list;
}

const SETTLE = `
  window.__simTo(0.85);
  window.__raf.step(2);
  return window.__swim && window.__swim.state ? JSON.stringify({ y: window.__swim.state.y, mode: window.__swim.state.mode, hero: !!window.__swim.hero }) : 'no swim';
`;

const POSE = {
  hoya: `const h = window.__swim.hero;
    window.__swim.pose({ x: h.park.x, y: h.park.y, z: h.park.z, yaw: h.yaw, pitch: 0.15, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: h.frame });
    window.__simTo(0.9); window.__raf.step(2);
    return JSON.stringify({ y: window.__swim.state.y, at: h.at && h.at.r });`,
  shafts: `const h = window.__swim.hero;
    window.__swim.pose({ x: h.under.x, y: h.under.y, z: h.under.z, yaw: h.yaw, pitch: 0.35, vx: 0, vy: 0, vz: 0, mode: 'swim', frame: h.shaft, glow: h.at });
    window.__simTo(4.2); window.__raf.step(2);
    return 'shafts';`,
  apex: `window.__swim.pose({ x: 420, y: 2.7, z: 36, yaw: 0.35, pitch: 0.2, mode: 'breach', breachT: 0.4, vy: 5.5, vx: -1.1, vz: -2.4 });
    window.__swim.splash('out'); window.__raf.step(3);
    return window.__swim.state.mode;`,
};

async function views(wk, prefix, width, { perf = false } = {}) {
  log(prefix, 'hoya', await wk.eval(POSE.hoya));
  const err = await errors(wk);
  if (err.some((s) => /VALIDATE_STATUS|Shader Error/i.test(s))) throw new Error('shader error on ' + prefix);
  await page(wk, `${prefix}-hoya`, width);
  if (perf) {
      const raw = await wk.eval(`
        const vis = window.__bench(8);
        const nodes = window.__swim.nodes || [];
        const shown = nodes.map((m) => m.visible);
        for (const n of nodes) n.visible = false;
        const hid = window.__bench(8);
        nodes.forEach((m, i) => { m.visible = shown[i]; });
        window.__swim._sum = 0; window.__swim._n = 0;
        const t0 = (typeof window.__simTo === 'function') ? 0 : 0;
        window.__simTo(4);
        const n = window.__swim._n || 1;
        return JSON.stringify({
          visCalls: vis.meanCalls, hidCalls: hid.meanCalls, delta: vis.meanCalls - hid.meanCalls,
          visMs: vis.ms, hidMs: hid.ms,
          step: +((window.__swim._sum || 0) / n).toFixed(4), steps: window.__swim._n, mark: t0,
          names: nodes.map((m) => m.name + ':' + (m.visible ? 'on' : 'off')),
        });
      `, 180);
    log('perf', raw);
    writeFileSync(join(out, 'perf-phone.json'), raw);
  }
  log(prefix, 'shafts', await wk.eval(POSE.shafts));
  await page(wk, `${prefix}-shafts`, width);
  log(prefix, 'apex', await wk.eval(POSE.apex));
  await page(wk, `${prefix}-apex`, width);
}

try {
  if (on('stills') || on('desk')) {
    await session('d-ja', 1600, 900, { extra: '&shot=1&swim=hoya' }, async (wk) => { await views(wk, 'desktop-ja', null, { perf: false }); });
    if (!on('stills')) { /* desktop ja is the look pass */ }
    else {
    await session('d-en', 1600, 900, { extra: '&shot=1&swim=hoya&lang=en' }, async (wk) => { await views(wk, 'desktop-en'); });
    await session('p-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&shot=1&swim=hoya&perf=1' }, async (wk) => { await views(wk, 'phone-ja', 786, { perf: on('perf') }); });
    await session('p-en', 393, 852, { dsf: 3, q: 'phone', extra: '&shot=1&swim=hoya&lang=en' }, async (wk) => { await views(wk, 'phone-en', 786); });
    }
  }

  if (on('perf') && !on('stills')) {
    await session('perf-phone', 393, 852, { dsf: 3, q: 'phone', extra: '&shot=1&swim=hoya&perf=1' }, async (wk) => {
      await wk.eval(SETTLE);
      const raw = await wk.eval(`
        const vis = window.__bench(6);
        const nodes = window.__swim.nodes || [];
        for (const n of nodes) n.visible = false;
        const hid = window.__bench(6);
        for (const n of nodes) n.visible = true;
        window.__swim._sum = 0; window.__swim._n = 0;
        window.__simTo(2.6);
        const n = window.__swim._n || 1;
        return JSON.stringify({
          visCalls: vis.meanCalls, hidCalls: hid.meanCalls, delta: vis.meanCalls - hid.meanCalls,
          visMs: vis.ms, hidMs: hid.ms,
          step: +((window.__swim._sum || 0) / n).toFixed(3), steps: window.__swim._n,
          names: nodes.map((m) => m.name + (m.visible ? '' : ':off')),
        });
      `, 180);
      log('perf', raw);
      writeFileSync(join(out, 'perf-phone.json'), raw);
    });
  }

  if (on('video')) {
    await session('video', 1280, 720, { extra: '&swim=hoya', autoplay: true }, async (wk) => {
      const meta = await wk.eval(`
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        document.body.classList.add('playing', 'shot');
        const swim = window.__swim;
        const audio = window.__ctx.audio;
        audio.muted = false;
        try { await audio.start(); } catch (e) {}
        try { if (audio.context && audio.context.state !== 'running') await audio.context.resume(); } catch (e) {}
        const h = swim.hero && swim.hero.at;
        if (h) swim.pose({ x: h.x, y: -3.2, z: h.z + 2.4, yaw: 0, pitch: -0.2, vx: 0, vy: 0, vz: 0, mode: 'swim' });
        window.__raf.resume();
        const stream = (audio.captureStream && audio.captureStream()) || null;
        const canvas = document.querySelector('#scene') || document.querySelector('canvas');
        const picture = canvas.captureStream(30);
        const tracks = picture.getVideoTracks();
        if (stream) for (const t of stream.getAudioTracks()) tracks.push(t);
        const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
        if (!mime) return JSON.stringify({ error: 'no MediaRecorder', audio: audio.context && audio.context.state });
        const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 2500000 });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const stopped = new Promise((r) => { rec.onstop = r; });
        rec.start(200);
        const marks = [];
        const school = { x: h ? h.x + 16 : 1636, z: h ? h.z + 6 : 3650 };
        const t0 = performance.now();
        const ctl = setInterval(() => {
          const s = swim.state; if (!s) return;
          const t = (performance.now() - t0) / 1000;
          const d = swim.drive || (swim.drive = { thrust: 0, strafe: 0, lift: 0, dash: false });
          if (s.splash) marks.push({ t: +t.toFixed(2), splash: s.splash, y: +s.y.toFixed(2), n: s.breachN, mode: s.mode });
          if (s.mode === 'breach') {
            d.thrust = 0; d.dash = false; d.lift = 0;
            if (s.y > 1.2) swim.airTap();
          } else if (t < 3.2) {
            s.yaw = Math.atan2(-(school.x + Math.sin(t) * 6 - s.x), -(school.z - s.z));
            s.pitch = -0.18; d.thrust = 0.85; d.dash = false; d.lift = 0;
          } else if (t < 4.7) {
            s.yaw = Math.atan2(-(school.x - s.x), -(school.z - s.z));
            s.pitch = 0.08; d.thrust = 1; d.dash = true; d.lift = 0;
          } else if (t < 5.5) {
            s.pitch = 0.35; d.thrust = 0.5; d.dash = false; d.lift = 0.2;
          } else if (t < 9.4) {
            s.pitch = 1.05; d.thrust = 1; d.lift = 0.35; d.dash = true;
          } else if (t < 11.0) {
            s.pitch = -0.85; d.thrust = 1; d.dash = false; d.lift = -0.4;
          } else if (t < 16.4) {
            s.pitch = 1.05; d.thrust = 1; d.lift = 0.35; d.dash = s.stamina > 0.9;
          } else {
            d.thrust = 0; d.dash = false; d.lift = 0;
          }
        }, 40);
        await sleep(17500);
        clearInterval(ctl);
        swim.drive = null;
        rec.stop();
        await stopped;
        const blob = new Blob(chunks, { type: mime });
        const buf = new Uint8Array(await blob.arrayBuffer());
        window.__clip = buf;
        return JSON.stringify({
          bytes: buf.length, mime, audio: audio.context && audio.context.state,
          tracks: tracks.length, marks, y: swim.state && +swim.state.y.toFixed(2), mode: swim.state && swim.state.mode, breachN: swim.state && swim.state.breachN,
        });
      `, 90);
      log('video meta', meta);
      const info = JSON.parse(meta);
      writeFileSync(join(out, 'video-meta.json'), meta);
      if (!info.bytes) throw new Error('no video bytes');
      const bin = new Uint8Array(info.bytes);
      const step = 60000;
      for (let i = 0; i < info.bytes; i += step) {
        const b64 = await wk.eval(`
          const b = window.__clip; const i = ${i}; const n = Math.min(${step}, b.length - i);
          let s = '';
          for (let k = 0; k < n; k += 8192) {
            const end = Math.min(k + 8192, n);
            const slice = b.subarray(i + k, i + end);
            s += String.fromCharCode.apply(null, slice);
          }
          return btoa(s);
        `, 60);
        const part = Buffer.from(b64, 'base64');
        bin.set(part, i);
      }
      const ext = info.mime.includes('mp4') ? 'mp4' : 'webm';
      const raw = join(out, 'dive-raw.' + ext);
      writeFileSync(raw, bin);
      const mp4 = join(out, 'dive.mp4');
      const ff = Bun.spawnSync(['ffmpeg', '-y', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4], { stdout: 'pipe', stderr: 'pipe' });
      if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(-800));
      else {
        rmSync(raw, { force: true });
        const probe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', mp4]);
        log('probe', probe.stdout.toString());
        writeFileSync(join(out, 'dive-probe.json'), probe.stdout);
      }
    });
  }
} finally {
  srv.stop();
}
log('done', out);
