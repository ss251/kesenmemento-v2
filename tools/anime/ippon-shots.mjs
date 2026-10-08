// [play:ippon] Round-2 stills and a compressed trip. WebKit, no Chrome.
//   env -u NODE_OPTIONS bun tools/anime/ippon-shots.mjs --port 9480
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import { splash, whoosh, marimba, bell, fanfare, pon } from '../../src/anime/play/kit/voices.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9480));
if (port < 9480 || port > 9484) throw new Error('ippon ports are 9480-9484');
const out = join(ROOT, 'docs/play/shots/ippon');
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[ippon-shots]', ...a);
const only = arg('only', 'stills,video,perf');
const on = (k) => only.split(',').includes(k);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

async function session(name, w, h, { dsf = null, q = 'high', extra = '', perf = false } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-ippon-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?shot=1&ippon=1&frame=quay&w=${w}&h=${h}&q=${q}${perf ? '&perf=1' : ''}${extra}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const ready = await wk.ready(520);
    log(name, 'ready', ready.ms);
    await fn(wk);
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

const SIM = { pov: 0.55, apex: 0.4, deck: 0.45, spray: 0.9, nabura: 1.2, crew: 0.62, swing: 0.4, radar: 0.6, birds: 0.8, quay: 0.15, auction: 0.25, outbound: 0.35, mouth: 0.35, cast: 0.2, talk: 0.3, 'coach-birds': 0.35, 'coach-bait': 0.4, 'coach-spray': 0.45, 'coach-pole': 0.4, 'coach-swipe': 0.35, actions: 0.5, catch: 0.25, stamp: 0.35, results: 0.2 };

async function still(wk, frame, file, width) {
  const phase = await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); if (window.__sim) window.__sim(${SIM[frame] || 0.4}); window.__raf.step(2); return JSON.stringify({ phase: window.__ippon.session.phase, n: window.__ippon.session.holdN, swing: !!window.__ippon.session.swing, cam: window.__ippon.debug && window.__ippon.debug() })`);
  log(frame, phase);
  const png = file.replace(/\.jpg$/, '.png');
  await wk.page(png);
  jpg(png, file, width);
  log('saved', file);
}

const DESK = ['pov', 'apex', 'deck', 'spray', 'nabura', 'crew'];

try {
  if (on('r3') || on('r3desk')) {
    const R3 = ['deck', 'crew', 'spray', 'pov', 'cast', 'outbound', 'mouth'];
    await session('r3-desk-ja', 1600, 900, {}, async (wk) => {
      const err = await wk.eval(`return JSON.stringify((window.__errors||[]).slice(0, 6))`);
      log('errors', err);
      for (const f of R3) await still(wk, f, join(out, `r3-${f}-ja-desktop.jpg`));
      await wk.eval(`window.__setHours && window.__setHours(21); return 1`);
      await still(wk, 'deck', join(out, 'r3-deck-ja-desktop-night.jpg'));
      await still(wk, 'crew', join(out, 'r3-crew-ja-desktop-night.jpg'));
      await wk.eval(`window.__setHours && window.__setHours(16); return 1`);
    });
    if (on('r3')) {
      await session('r3-desk-en', 1600, 900, { extra: '&lang=en' }, async (wk) => {
        for (const f of ['deck', 'crew', 'spray', 'outbound', 'mouth']) await still(wk, f, join(out, `r3-${f}-en-desktop.jpg`));
      });
      await session('r3-desk-retina', 1600, 900, { dsf: 2 }, async (wk) => {
        await still(wk, 'crew', join(out, 'r3-crew-ja-desktop-retina.jpg'), 1600);
      });
      await session('r3-phone-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=ja', perf: true }, async (wk) => {
        for (const f of ['deck', 'crew', 'spray', 'pov', 'outbound', 'mouth']) await still(wk, f, join(out, `r3-${f}-ja-phone.jpg`), 1179);
        const perf = await wk.eval(`if (!window.__perf) return 'off'; window.__perf.start(); window.__ippon.frame('crew'); window.__ippon.session.nabura = 1; if (window.__sim) window.__sim(0.8); window.__raf.step(24); const d = window.__perf.stop(); const own = window.__ippon.cost ? window.__ippon.cost() : null; const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (p) => cpu.length ? cpu[Math.min(cpu.length-1, Math.floor(p*(cpu.length-1)))] : 0; return JSON.stringify({ own, frames: d.n, cpuP50: q(0.5), cpuP95: q(0.95), cpuP99: q(0.99), hitch: (d.cpu||[]).filter(v => v > 50).length });`);
        writeFileSync(join(out, 'r3-perf.json'), perf);
        log('perf', perf);
      });
      await session('r3-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en' }, async (wk) => {
        for (const f of ['deck', 'crew', 'outbound']) await still(wk, f, join(out, `r3-${f}-en-phone.jpg`), 1179);
      });
      await session('r3-land-ja', 852, 393, { dsf: 3, q: 'phone', extra: '&lang=ja' }, async (wk) => {
        for (const f of ['deck', 'crew', 'pov']) await still(wk, f, join(out, `r3-${f}-ja-land.jpg`), 2556);
      });
      await session('r3-reduce', 1600, 900, { extra: '&reduce=1' }, async (wk) => {
        await still(wk, 'crew', join(out, 'r3-crew-ja-desktop-reduce.jpg'));
        await still(wk, 'outbound', join(out, 'r3-outbound-ja-desktop-reduce.jpg'));
      });
    }
  }

  if (on('r3') || on('r3video')) {
    const frames = join(out, 'r3-trip-frames');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    let n = 0;
    const marks = {};
    await session('r3-trip', 1280, 720, { q: 'high' }, async (wk) => {
      let sim = 0;
      async function grab(ds) {
        sim += ds;
        await wk.eval(`if (window.__simTo) window.__simTo(${sim}); window.__raf.step(1); return 1`);
        const png = join(frames, String(n).padStart(4, '0') + '.png');
        await wk.page(png);
        n++;
      }
      async function hold(frame, count, ds) {
        await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); return 1`);
        marks[frame] = n;
        for (let i = 0; i < count; i++) await grab(ds);
      }
      await hold('quay', 8, 0.08);
      await hold('outbound', 14, 0.1);
      await hold('mouth', 10, 0.1);
      await hold('spray', 10, 0.08);
      await hold('nabura', 10, 0.08);
      await hold('crew', 10, 0.08);
      await hold('pov', 8, 0.06);
      marks.catch = n;
      await wk.eval(`window.__ippon.frame('pov'); window.__ippon.session.nabura = 1; window.__ippon.session.holdN = 0; window.__ippon.pull(0.66); return window.__ippon.session.phase`);
      for (let i = 0; i < 48; i++) await grab(1 / 30);
      marks.deck = n;
      await hold('deck', 12, 0.1);
      marks.auction = n;
      await hold('auction', 10, 0.1);
      log('frames', n, marks);
      writeFileSync(join(out, 'r3-trip-marks.json'), JSON.stringify({ n, marks }));
    });
    const sr = 44100;
    const travelN = marks.catch || 0;
    const catchN = Math.max(0, (marks.deck || n) - travelN);
    const endN = Math.max(0, n - travelN - catchN);
    const travelFps = 1.6;
    const catchFps = 8;
    const endFps = 2;
    const dur = travelN / travelFps + catchN / catchFps + endN / endFps;
    const mix = new Float32Array(sr * Math.ceil(dur + 0.5));
    const add = (at, samples, gain) => {
      const i0 = Math.floor(at * sr);
      for (let i = 0; i < samples.length && i0 + i < mix.length; i++) mix[i0 + i] += samples[i] * gain;
    };
    const sec = (frame) => {
      const i = marks[frame] || 0;
      if (i <= travelN) return i / travelFps;
      if (i <= travelN + catchN) return travelN / travelFps + (i - travelN) / catchFps;
      return travelN / travelFps + catchN / catchFps + (i - travelN - catchN) / endFps;
    };
    add(sec('outbound'), marimba(sr, 523, 0.45), 0.4);
    add(sec('mouth'), bell(sr, 880, 0.45), 0.3);
    add(sec('spray'), whoosh(sr, 0.7), 0.35);
    add(sec('nabura'), whoosh(sr, 0.5), 0.25);
    add(sec('nabura') + 0.4, bell(sr, 988, 0.6), 0.35);
    add(sec('crew'), pon(sr, 0.25), 0.35);
    add(sec('catch'), splash(sr, 0.45), 0.7);
    add(sec('catch') + 0.05, marimba(sr, 587, 0.5), 0.55);
    add(sec('catch') + 1.7, whoosh(sr, 0.28), 0.3);
    add(sec('catch') + 3.1, pon(sr, 0.3), 0.55);
    add(sec('deck'), whoosh(sr, 0.22), 0.28);
    add(sec('auction'), fanfare(sr), 0.45);
    const wav = Buffer.alloc(44 + mix.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + mix.length * 2, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(mix.length * 2, 40);
    for (let i = 0; i < mix.length; i++) {
      const s = Math.max(-1, Math.min(1, mix[i]));
      wav.writeInt16LE(s * 32767, 44 + i * 2);
    }
    const wavPath = join(out, 'r3-trip.wav');
    writeFileSync(wavPath, wav);
    const vid = join(out, 'r3-trip.mp4');
    const part = (start, count, fps, file) => {
      if (count < 1) return null;
      const r = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(fps), '-start_number', String(start), '-i', join(frames, '%04d.png'), '-frames:v', String(count), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      if (r.exitCode !== 0) { log('ffmpeg', r.stderr.toString().slice(-400)); return null; }
      return file;
    };
    const parts = [part(0, travelN, travelFps, join(out, 'r3-a.mp4')), part(travelN, catchN, catchFps, join(out, 'r3-b.mp4')), part(travelN + catchN, endN, endFps, join(out, 'r3-c.mp4'))].filter(Boolean);
    const list = join(out, 'r3-concat.txt');
    writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
    const ff = Bun.spawnSync(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wavPath, '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', vid]);
    if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(-500));
    else {
      log('video', vid, 's', dur.toFixed(1));
      rmSync(frames, { recursive: true, force: true });
      rmSync(wavPath, { force: true });
      rmSync(list, { force: true });
      for (const p of parts) rmSync(p, { force: true });
    }
  }

  if (on('stills') || on('desk')) {
    await session('desk-ja', 1600, 900, {}, async (wk) => {
      const err = await wk.eval(`return JSON.stringify((window.__errors||[]).slice(0, 4))`);
      log('errors', err);
      for (const f of DESK) await still(wk, f, join(out, `r2-${f}-ja-desktop.jpg`));
      await wk.eval(`window.__setHours && window.__setHours(21); return 1`);
      await still(wk, 'pov', join(out, 'r2-pov-ja-desktop-night.jpg'));
      await wk.eval(`window.__setHours && window.__setHours(16); return 1`);
    });
    if (!on('stills')) log('desk only');
    else {
    await session('desk-en', 1600, 900, { extra: '&lang=en' }, async (wk) => {
      for (const f of ['pov', 'apex', 'deck', 'nabura', 'crew']) await still(wk, f, join(out, `r2-${f}-en-desktop.jpg`));
    });
    await session('phone-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&touch=1&lang=ja', perf: true }, async (wk) => {
      for (const f of DESK) await still(wk, f, join(out, `r2-${f}-ja-phone.jpg`), 1179);
      const perf = await wk.eval(`if (!window.__perf) return 'off'; window.__perf.start(); window.__ippon.frame('pov'); window.__ippon.session.nabura = 1; if (window.__sim) window.__sim(1.2); window.__raf.step(8); const d = window.__perf.stop(); const own = window.__ippon.cost ? window.__ippon.cost() : null; const keys = Object.keys(d.buckets||{}).filter(n => /ippon|play|kit|gull|upd:/.test(n)); const brief = {}; for (const k of keys) { const col = (d.buckets[k]||[]).filter(v => v > 0).sort((a,b)=>a-b); const q = (p) => col.length ? col[Math.min(col.length-1, Math.floor(p*(col.length-1)))] : 0; brief[k] = { n: col.length, p95: q(0.95) }; } return JSON.stringify({ own, frames: d.n, names: d.names, brief });`);
      writeFileSync(join(out, 'r2-perf.json'), perf);
      log('perf', perf);
    });
    await session('phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&touch=1&lang=en' }, async (wk) => {
      for (const f of ['pov', 'apex', 'deck']) await still(wk, f, join(out, `r2-${f}-en-phone.jpg`), 1179);
    });
    }
  }

  if (on('video')) {
    const frames = join(out, 'r2-trip-frames');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    let n = 0;
    const marks = {};
    await session('trip', 1280, 720, { q: 'high' }, async (wk) => {
      let sim = 0;
      async function grab(ds) {
        sim += ds;
        await wk.eval(`if (window.__simTo) window.__simTo(${sim}); window.__raf.step(1); return 1`);
        const png = join(frames, String(n).padStart(4, '0') + '.png');
        await wk.page(png);
        n++;
      }
      async function hold(frame, count, ds) {
        await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); return 1`);
        marks[frame] = n;
        for (let i = 0; i < count; i++) await grab(ds);
      }
      await hold('quay', 10, 0.08);
      await hold('birds', 8, 0.1);
      await hold('radar', 8, 0.08);
      await hold('spray', 10, 0.08);
      await hold('nabura', 12, 0.08);
      await hold('crew', 8, 0.08);
      await hold('pov', 8, 0.06);
      marks.catch = n;
      await wk.eval(`window.__ippon.frame('pov'); window.__ippon.session.nabura = 1; window.__ippon.session.holdN = 0; window.__ippon.pull(0.66); return window.__ippon.session.phase`);
      for (let i = 0; i < 48; i++) await grab(1 / 30);
      marks.deck = n;
      await hold('deck', 10, 0.12);
      marks.auction = n;
      await hold('auction', 8, 0.12);
      log('frames', n, marks);
      writeFileSync(join(out, 'r2-trip-marks.json'), JSON.stringify({ n, marks }));
    });

    const sr = 44100;
    const travelN = marks.catch || 0;
    const catchN = Math.max(0, (marks.deck || n) - travelN);
    const endN = Math.max(0, n - travelN - catchN);
    const travelFps = 1.7;
    const catchFps = 8;
    const endFps = 2;
    const dur = travelN / travelFps + catchN / catchFps + endN / endFps;
    const mix = new Float32Array(sr * Math.ceil(dur + 0.5));
    const add = (at, samples, gain) => {
      const i0 = Math.floor(at * sr);
      for (let i = 0; i < samples.length && i0 + i < mix.length; i++) mix[i0 + i] += samples[i] * gain;
    };
    const sec = (frame) => {
      const i = marks[frame] || 0;
      if (i <= travelN) return i / travelFps;
      if (i <= travelN + catchN) return travelN / travelFps + (i - travelN) / catchFps;
      return travelN / travelFps + catchN / catchFps + (i - travelN - catchN) / endFps;
    };
    add(sec('spray'), whoosh(sr, 0.7), 0.35);
    add(sec('nabura'), whoosh(sr, 0.5), 0.25);
    add(sec('nabura') + 0.4, bell(sr, 988, 0.6), 0.35);
    add(sec('nabura') + 1.6, bell(sr, 1174, 0.5), 0.28);
    add(sec('catch'), splash(sr, 0.45), 0.7);
    add(sec('catch') + 0.05, marimba(sr, 587, 0.5), 0.55);
    add(sec('catch') + 1.7, whoosh(sr, 0.28), 0.3);
    add(sec('catch') + 3.1, pon(sr, 0.3), 0.55);
    add(sec('catch') + 3.3, whoosh(sr, 0.22), 0.28);
    add(sec('auction'), fanfare(sr), 0.45);
    const wav = Buffer.alloc(44 + mix.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + mix.length * 2, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(mix.length * 2, 40);
    for (let i = 0; i < mix.length; i++) {
      const s = Math.max(-1, Math.min(1, mix[i]));
      wav.writeInt16LE(s * 32767, 44 + i * 2);
    }
    const wavPath = join(out, 'r2-trip.wav');
    writeFileSync(wavPath, wav);
    const vid = join(out, 'r2-trip.mp4');
    const part = (start, count, fps, file) => {
      if (count < 1) return null;
      const r = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(fps), '-start_number', String(start), '-i', join(frames, '%04d.png'), '-frames:v', String(count), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      if (r.exitCode !== 0) { log('ffmpeg', r.stderr.toString().slice(-400)); return null; }
      return file;
    };
    const parts = [part(0, travelN, travelFps, join(out, 'r2-a.mp4')), part(travelN, catchN, catchFps, join(out, 'r2-b.mp4')), part(travelN + catchN, endN, endFps, join(out, 'r2-c.mp4'))].filter(Boolean);
    const list = join(out, 'r2-concat.txt');
    writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
    const ff = Bun.spawnSync(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wavPath, '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', vid]);
    if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(-500));
    else {
      log('video', vid, 's', dur.toFixed(1));
      rmSync(frames, { recursive: true, force: true });
      rmSync(wavPath, { force: true });
      rmSync(list, { force: true });
      for (const p of parts) rmSync(p, { force: true });
    }
  }
  if (on('r4')) {
    const desk = ['quay', 'talk', 'coach-birds', 'coach-bait', 'coach-spray', 'coach-pole', 'coach-swipe', 'actions', 'spray', 'crew', 'deck', 'catch', 'stamp', 'results'];
    await session('r4-desk-ja', 1440, 900, { extra: '&lang=ja' }, async (wk) => {
      const err = await wk.eval(`return JSON.stringify((window.__errors||[]).slice(0, 8))`);
      log('errors', err);
      for (const f of desk) await still(wk, f, join(out, `r4-${f}-ja-desktop.jpg`));
    });
    const proof = ['quay', 'talk', 'coach-birds', 'coach-bait', 'coach-spray', 'coach-pole', 'coach-swipe', 'actions', 'spray', 'catch', 'stamp', 'results'];
    await session('r4-desk-en', 1440, 900, { extra: '&lang=en' }, async (wk) => {
      for (const f of proof) await still(wk, f, join(out, `r4-${f}-en-desktop.jpg`));
    });
    await session('r4-phone-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=ja&touch=1', perf: true }, async (wk) => {
      for (const f of [...proof, 'crew', 'deck']) await still(wk, f, join(out, `r4-${f}-ja-phone.jpg`), 1179);
      const perf = await wk.eval(`if (!window.__perf) return 'off'; window.__perf.start(); window.__ippon.frame('spray'); window.__ippon.session.nabura = 1; if (window.__sim) window.__sim(0.8); window.__raf.step(24); const d = window.__perf.stop(); const own = window.__ippon.cost ? window.__ippon.cost() : null; const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (p) => cpu.length ? cpu[Math.min(cpu.length-1, Math.floor(p*(cpu.length-1)))] : 0; return JSON.stringify({ own, frames: d.n, cpuP50: q(0.5), cpuP95: q(0.95), cpuP99: q(0.99), hitch: (cpu).filter(v => v > 50).length });`);
      writeFileSync(join(out, 'r4-perf.json'), perf);
      log('perf', perf);
    });
    await session('r4-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en&touch=1' }, async (wk) => {
      for (const f of proof) await still(wk, f, join(out, `r4-${f}-en-phone.jpg`), 1179);
    });
  }
  if (on('r4fix')) {
    const fix = ['spray'];
    await session('r4fix-desk-ja', 1440, 900, { extra: '&lang=ja' }, async (wk) => {
      for (const f of fix) await still(wk, f, join(out, `r4-${f}-ja-desktop.jpg`));
    });
    await session('r4fix-desk-en', 1440, 900, { extra: '&lang=en' }, async (wk) => {
      for (const f of fix) await still(wk, f, join(out, `r4-${f}-en-desktop.jpg`));
    });
    await session('r4fix-phone-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=ja&touch=1' }, async (wk) => {
      for (const f of fix) await still(wk, f, join(out, `r4-${f}-ja-phone.jpg`), 1179);
    });
    await session('r4fix-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en&touch=1' }, async (wk) => {
      for (const f of fix) await still(wk, f, join(out, `r4-${f}-en-phone.jpg`), 1179);
    });
  }
  if (on('r4video')) {
    const frames = join(out, 'r4-first-frames');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    let n = 0;
    const marks = {};
    await session('r4-first', 1280, 720, { q: 'high', extra: '&lang=ja' }, async (wk) => {
      let sim = 0;
      async function grab(ds) {
        sim += ds;
        await wk.eval(`if (window.__simTo) window.__simTo(${sim}); window.__raf.step(1); return 1`);
        const png = join(frames, String(n).padStart(4, '0') + '.png');
        await wk.page(png);
        n++;
      }
      async function hold(frame, count, ds) {
        await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); return 1`);
        marks[frame] = n;
        for (let i = 0; i < count; i++) await grab(ds);
      }
      await hold('quay', 20, 0.12);
      await hold('talk', 22, 0.1);
      await hold('coach-birds', 14, 0.1);
      await hold('coach-bait', 16, 0.1);
      await hold('coach-spray', 14, 0.1);
      await hold('coach-pole', 14, 0.1);
      await hold('coach-swipe', 14, 0.08);
      marks.catch = n;
      await wk.eval(`window.__ippon.frame('catch'); return 1`);
      for (let i = 0; i < 18; i++) {
        await wk.eval(`window.__ippon.session.swing = true; const v = window.__ippon.debug && window.__ippon.debug(); return 1`);
        await grab(1 / 24);
      }
      marks.stamp = n;
      await hold('stamp', 16, 0.1);
      marks.results = n;
      await hold('results', 24, 0.1);
      marks.again = n;
      await hold('actions', 20, 0.1);
      log('frames', n, marks);
      writeFileSync(join(out, 'r4-first-marks.json'), JSON.stringify({ n, marks }));
    });
    const sr = 44100;
    const fps = 2;
    const dur = n / fps;
    const mix = new Float32Array(sr * Math.ceil(dur + 0.4));
    const add = (at, samples, gain) => {
      const i0 = Math.floor(at * sr);
      for (let i = 0; i < samples.length && i0 + i < mix.length; i++) mix[i0 + i] += samples[i] * gain;
    };
    const sec = (frame) => (marks[frame] || 0) / fps;
    add(sec('talk'), bell(sr, 523, 0.4), 0.3);
    add(sec('coach-birds'), whoosh(sr, 0.55), 0.28);
    add(sec('coach-bait'), pon(sr, 0.22), 0.4);
    add(sec('coach-spray'), whoosh(sr, 0.7), 0.35);
    add(sec('coach-pole'), marimba(sr, 659, 0.35), 0.4);
    add(sec('catch'), splash(sr, 0.5), 0.75);
    add(sec('catch') + 0.08, marimba(sr, 784, 0.4), 0.5);
    add(sec('stamp'), pon(sr, 0.28), 0.55);
    add(sec('results'), fanfare(sr), 0.42);
    add(sec('again'), whoosh(sr, 0.4), 0.3);
    const wav = Buffer.alloc(44 + mix.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + mix.length * 2, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(mix.length * 2, 40);
    for (let i = 0; i < mix.length; i++) {
      const s = Math.max(-1, Math.min(1, mix[i]));
      wav.writeInt16LE(s * 32767, 44 + i * 2);
    }
    const wavPath = join(out, 'r4-first.wav');
    writeFileSync(wavPath, wav);
    const vid = join(out, 'r4-first.mp4');
    const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(fps), '-i', join(frames, '%04d.png'), '-i', wavPath, '-t', String(dur), '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', vid]);
    if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(-500));
    else {
      log('video', vid, 's', dur.toFixed(1));
      rmSync(frames, { recursive: true, force: true });
      rmSync(wavPath, { force: true });
    }
  }
  if (on('r5')) {
    const proof = ['quay', 'talk', 'coach-bait', 'actions', 'catch', 'results'];
    async function stillHud(wk, frame, file, width) {
      const sim = String(frame).startsWith('coach') ? 1.2 : (SIM[frame] || 0.4);
      const phase = await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); if (window.__sim) window.__sim(${sim}); window.__raf.step(3); if (${JSON.stringify(frame)} === 'catch') { window.__ippon.juice('catch'); window.__raf.step(2); } const hits = window.__ippon.overlaps ? window.__ippon.overlaps() : []; return JSON.stringify({ phase: window.__ippon.session.phase, play: document.body.classList.contains('playing'), hud: !!document.getElementById('klc-ui'), kit: !!document.getElementById('klc-play') && getComputedStyle(document.getElementById('klc-play')).display !== 'none', hits })`);
      const settle = frame === 'results' ? 680 : frame === 'catch' ? 280 : 180;
      await new Promise((r) => setTimeout(r, settle));
      log(frame, phase);
      const png = file.replace(/\.jpg$/, '.png');
      await wk.page(png);
      jpg(png, file, width);
      log('saved', file);
      return phase;
    }
    const overlaps = {};
    const shoot = async (wk, tag, width) => {
      const rows = {};
      for (const f of proof) rows[f] = JSON.parse(await stillHud(wk, f, join(out, `r5-${f}-${tag}.jpg`), width));
      overlaps[tag] = rows;
    };
    await session('r5-desk-ja', 1440, 900, { extra: '&ui=1&lang=ja' }, async (wk) => {
      const err = await wk.eval(`return JSON.stringify((window.__errors||[]).slice(0, 8))`);
      log('errors', err);
      await shoot(wk, 'ja-desktop');
    });
    await session('r5-desk-en', 1440, 900, { extra: '&ui=1&lang=en' }, async (wk) => {
      await shoot(wk, 'en-desktop');
    });
    await session('r5-phone-ja', 393, 852, { dsf: 3, q: 'phone', extra: '&ui=1&lang=ja&touch=1', perf: true }, async (wk) => {
      await shoot(wk, 'ja-phone', 1179);
      const perf = await wk.eval(`if (!window.__perf) return 'off'; window.__perf.start(); window.__ippon.frame('actions'); if (window.__sim) window.__sim(0.8); window.__raf.step(24); const d = window.__perf.stop(); const own = window.__ippon.cost ? window.__ippon.cost() : null; const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (p) => cpu.length ? cpu[Math.min(cpu.length-1, Math.floor(p*(cpu.length-1)))] : 0; return JSON.stringify({ own, frames: d.n, cpuP50: q(0.5), cpuP95: q(0.95), cpuP99: q(0.99), hitch: (cpu).filter(v => v > 50).length });`);
      writeFileSync(join(out, 'r5-perf.json'), perf);
      log('perf', perf);
    });
    await session('r5-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&ui=1&lang=en&touch=1' }, async (wk) => {
      await shoot(wk, 'en-phone', 1179);
    });
    writeFileSync(join(out, 'r5-overlaps.json'), JSON.stringify(overlaps, null, 2));
    log('overlaps', join(out, 'r5-overlaps.json'));
  }
  if (on('r5fix')) {
    const fix = ['quay', 'results'];
    async function stillFix(wk, frame, file, width) {
      const phase = await wk.eval(`window.__ippon.frame(${JSON.stringify(frame)}); if (window.__sim) window.__sim(${SIM[frame] || 0.3}); window.__raf.step(3); const hits = window.__ippon.overlaps ? window.__ippon.overlaps() : []; return JSON.stringify({ phase: window.__ippon.session.phase, play: document.body.classList.contains('playing'), hud: !!document.getElementById('klc-ui'), kit: !!document.getElementById('klc-play') && getComputedStyle(document.getElementById('klc-play')).display !== 'none', hits, bang: !!(document.querySelector('#klc-ippon .balloon.bang') && !document.querySelector('#klc-ippon .balloon').hidden) })`);
      await new Promise((r) => setTimeout(r, frame === 'results' ? 680 : 180));
      log(frame, phase);
      const png = file.replace(/\.jpg$/, '.png');
      await wk.page(png);
      jpg(png, file, width);
      return phase;
    }
    for (const spec of [
      { name: 'r5fix-desk-ja', w: 1440, h: 900, extra: '&ui=1&lang=ja', tag: 'ja-desktop' },
      { name: 'r5fix-desk-en', w: 1440, h: 900, extra: '&ui=1&lang=en', tag: 'en-desktop' },
      { name: 'r5fix-phone-ja', w: 393, h: 852, extra: '&ui=1&lang=ja&touch=1', tag: 'ja-phone', dsf: 3, q: 'phone', width: 1179 },
      { name: 'r5fix-phone-en', w: 393, h: 852, extra: '&ui=1&lang=en&touch=1', tag: 'en-phone', dsf: 3, q: 'phone', width: 1179 },
    ]) {
      await session(spec.name, spec.w, spec.h, { dsf: spec.dsf || null, q: spec.q || 'high', extra: spec.extra }, async (wk) => {
        for (const f of fix) await stillFix(wk, f, join(out, `r5-${f}-${spec.tag}.jpg`), spec.width);
      });
    }
  }
} finally {
  try { srv.stop(); } catch { /* */ }
}
log('done', out);
