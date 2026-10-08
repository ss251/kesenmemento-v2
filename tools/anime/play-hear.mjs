// [play] A walk with the live marimba. ?hear=1 calls audio.start(); the tap is the
// master bus, not an offline render. Frames and the wav come from the same run.
//   env -u NODE_OPTIONS bun tools/anime/play-hear.mjs --port 9467 --nobuild 1
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9467));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const out = join(ROOT, 'docs/play/shots/play-kit');
const frames = join(out, 'hear-frames');
mkdirSync(frames, { recursive: true });
for (const f of readdirSync(frames)) rmSync(join(frames, f), { force: true });
const log = (...a) => console.error('[hear]', ...a);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed');
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

const DT = 0.15;
const END = 31;

function lerp(a, b, u) { return a + (b - a) * Math.min(1, Math.max(0, u)); }

const workdir = join(ROOT, 'dist/perf/wk-hear-' + process.pid);
rmSync(workdir, { recursive: true, force: true });
const url = `${srv.url}index.html?shot=1&hear=1&w=1280&h=720&q=high&cam=walk`;
const proc = Bun.spawn([BIN, url, workdir, '1280', '720'], { stdout: 'pipe', stderr: 'pipe' });
const wk = open(workdir);

try {
  const ready = await wk.ready(420);
  log('ready', ready.ms);
  const boot = await wk.eval(`document.body.classList.add('playing');
    const a = window.__ctx && window.__ctx.audio;
    if (a && a.start) a.start();
    const ac = a && a.context;
    if (ac && ac.state !== 'running') { try { await ac.resume(); } catch (e) {} }
    const spots = window.__play.spots;
    const keep = { 'w-open': 1, 'w-prom': 1, 'w-isuzu': 1 };
    window.__play.store.update('katsuo', (d) => {
      d.found = {};
      for (const s of spots) if (!keep[s.id]) d.found[s.id] = '2026-10-07T00:00:00.000Z';
    });
    window.__setHours(12);
    const trio = spots.filter(s => keep[s.id]).map(s => ({ id: s.id, x: s.x, z: s.z }));
    return JSON.stringify({ hear: !!window.__hear, samples: window.__hear ? window.__hear.samples : 0, state: ac ? ac.state : null, trio });`);
  log('boot', boot);
  const info = JSON.parse(boot);
  if (!info.hear) throw new Error('no live audio tap');
  const by = Object.fromEntries(info.trio.map((s) => [s.id, s]));
  const A = by['w-open'], B = by['w-prom'], C = by['w-isuzu'];
  const spawn = { x: 168, z: -122 };

  const at = (t) => {
    const leg = (t0, t1, p, q) => {
      const u = (t - t0) / (t1 - t0);
      return { x: lerp(p.x, q.x, u), z: lerp(p.z, q.z, u), look: q, sky: false, book: false };
    };
    if (t < 2.6) return leg(0, 2.6, spawn, A);
    if (t < 3.3) return { x: A.x, z: A.z, look: A, sky: false, book: false };
    if (t < 12.6) return leg(3.3, 12.6, A, B);
    if (t < 13.4) return { x: B.x, z: B.z, look: B, sky: false, book: false };
    if (t < 22.2) return leg(13.4, 22.2, B, C);
    if (t < 23.2) return { x: C.x, z: C.z, look: C, sky: false, book: false };
    if (t < 28) return { sky: true, book: false };
    return { sky: true, book: true };
  };

  let sim = 0;
  let n = 0;
  let book = false;
  const tAudio0 = Date.now();
  const samples0 = info.samples;
  while (sim < END) {
    sim = Math.round((sim + DT) * 1000) / 1000;
    const p = at(sim);
    let js;
    if (p.sky) {
      js = `window.__camSpec('150,14,-80>156,46,-33'); window.__simTo(${sim});`;
      if (p.book && !book) {
        book = true;
        js += `document.querySelector('#klc-play .book').click();
          const tab = [...document.querySelectorAll('#klc-play .tabs button')].find(b => (b.textContent || '').indexOf('カツオ') >= 0);
          if (tab) tab.click();`;
      }
    } else {
      const yaw = Math.atan2(-(p.look.x - p.x), -(p.look.z - p.z)) * 180 / Math.PI;
      js = `window.__camSpec(${JSON.stringify(p.x.toFixed(2) + ',' + p.z.toFixed(2) + ',' + yaw.toFixed(2) + ',-5')}); window.__simTo(${sim});`;
    }
    js += `window.__raf.step(1); return (document.querySelector('#klc-play [data-counter]')?.textContent || '') + ' ' + (window.__hear ? window.__hear.samples : 0);`;
    const label = await wk.eval(js);
    n++;
    const file = join(frames, String(n).padStart(4, '0') + '.png');
    await wk.page(file);
    if (n === 1 || n % 20 === 0) log('f', n, 'sim', sim, label);
    if (sim > 24 && sim < 24.3) {
      const { spawnSync } = Bun;
      spawnSync(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60', file, '--out', join(out, 'desktop-ja-fireworks.jpg')]);
    }
  }
  const pcmB64 = await wk.eval(`window.__hear.stop(); return window.__hear.pcm()`);
  const raw = Buffer.from(pcmB64, 'base64');
  const rate = await wk.eval(`return window.__hear.rate`);
  const skip = Math.max(0, samples0) * 2;
  const sliced = raw.subarray(Math.min(skip, raw.length));
  let peak = 0, sum = 0, count = 0;
  for (let i = 0; i + 1 < sliced.length; i += 2) {
    const s = sliced.readInt16LE(i) / 32768;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sum += s * s;
    count++;
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  log('audio', { rate, samples: count, sec: (count / rate).toFixed(2), peak: peak.toFixed(4), rms: rms.toFixed(4), wall: ((Date.now() - tAudio0) / 1000).toFixed(1) });
  if (rms < 0.001) throw new Error('the live tap was silent');
  const wav = Buffer.alloc(44 + sliced.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + sliced.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(sliced.length, 40);
  sliced.copy(wav, 44);
  const wavPath = join(out, 'play-live.wav');
  writeFileSync(wavPath, wav);
  const fps = n / (count / rate);
  const mp4 = join(out, 'play.mp4');
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(fps), '-start_number', '1', '-i', join(frames, '%04d.png'), '-i', wavPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4], { stdout: 'pipe', stderr: 'pipe' });
  if (ff.exitCode !== 0) throw new Error('ffmpeg ' + ff.stderr.toString().slice(-800));
  log('mp4', mp4, 'frames', n, 'fps', fps.toFixed(2));
} finally {
  try { await wk.quit(); } catch { /* */ }
  try { proc.kill(9); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
  rmSync(workdir, { recursive: true, force: true });
}
