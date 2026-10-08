// [play] The visual pass play-test video, with live sound (?hear=1 taps ctx.audio; not an offline mux):
// the closed HUD → あそぶ → the 金のカツオ card → はじめる (wipe, title card) → the coach → the walk to the glint →
// the pickup (chime, sparkles, the mote to the counter) → 1/50.
// Each frame keeps its wall-clock time and the sim advances by the same amount, so the mux uses per-frame durations
// and the chime lands on the pickup frame.
//   env -u NODE_OPTIONS bun tools/anime/play-v-video.mjs --port 9468
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9468));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const W = Number(arg('w', 960)), H = Number(arg('h', 540));
const lang = arg('lang', 'ja');
const out = join(ROOT, 'docs/play/shots/play-kit');
const frames = join(ROOT, 'dist/perf/v-video-frames');
mkdirSync(frames, { recursive: true });
for (const f of readdirSync(frames)) rmSync(join(frames, f), { force: true });
const log = (...a) => console.error('[vvid]', ...a);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 800));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });
const workdir = join(ROOT, 'dist/perf/wk-vvid-' + process.pid);
rmSync(workdir, { recursive: true, force: true });
const url = `${srv.url}index.html?shot=1&hear=1&w=${W}&h=${H}&q=high&cam=hero${lang === 'en' ? '&lang=en' : ''}`;
const proc = Bun.spawn([BIN, url, workdir, String(W), String(H)], { env: { ...process.env, KLC_WK_EPHEMERAL: '1' }, stdout: 'pipe', stderr: 'pipe' });
const wk = open(workdir);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const ready = await wk.ready(420);
  log('ready', ready.ms);
  const boot = await wk.eval(`document.body.classList.add('playing');
    window.__play.store.update('katsuo', (d) => { d.found = {}; });
    window.__play.store.update('meta', (d) => { delete d.hubOpened; delete d.played; delete d.seen; });
    const a = window.__ctx && window.__ctx.audio;
    if (a && a.start) a.start();
    const ac = a && a.context;
    if (ac && ac.state !== 'running') { try { await ac.resume(); } catch (e) {} }
    window.__setHours(15.5);
    // On foot at the spawn, facing the first charm: the hunt picks the nearest charm for the mode you are in.
    const s = window.__play.spots.find(p => p.id === 'w-open');
    const yaw = Math.atan2(-(s.x - 168), -(s.z + 122)) * 180 / Math.PI;
    window.__camSpec('168,-122,' + yaw.toFixed(2) + ',-6');
    window.__simTo(0.5);
    window.__raf.step(4);
    return JSON.stringify({ hear: !!window.__hear, samples: window.__hear ? window.__hear.samples : 0, state: ac ? ac.state : null, x: s.x, y: s.y, z: s.z });`);
  log('boot', boot);
  const info = JSON.parse(boot);
  if (!info.hear) throw new Error('no live audio tap');

  // The game runs in real time inside the page (a 16 ms loop drives the sim and the renderer); the client only takes
  // snapshots back to back and fires the taps. Each frame keeps its wall time, so the mux is in sync with the sound.
  await wk.eval(`window.__vlive = { on: true, walk: null };
    let last = performance.now(), sim = 0.5;
    const tick = () => {
      if (!window.__vlive.on) return;
      const now = performance.now();
      // One step of exactly the elapsed time: __simTo only integrates whole steps of its dt argument.
      const step = Math.max(0.004, Math.min(0.1, (now - last) / 1000));
      sim += step;
      last = now;
      try { if (window.__vlive.walk) window.__vlive.walk(now); window.__simTo(sim, step); window.__raf.step(1); } catch (e) { window.__vlive.err = String(e); }
      setTimeout(tick, 16);
    };
    tick();
    return 1`);
  const shots = [];
  const wall0 = Date.now();
  async function snap() {
    const file = join(frames, String(shots.length + 1).padStart(4, '0') + '.png');
    await wk.page(file);
    shots.push([file, Date.now() - wall0]);
  }
  async function hold(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) await snap();
  }
  const samples0 = info.samples;

  await hold(1000);
  await wk.eval(`document.querySelector('#klc-play [data-act="play"]').click(); return 1`);
  await hold(1300);
  await wk.eval(`const c = document.querySelector('#klc-play .mcard[data-mode="katsuo"]') || document.querySelector('#klc-play .mcard'); c.click(); return 1`);
  await hold(1100);
  await wk.eval(`document.querySelector('#klc-play .mcard.open .go').click(); return 1`);
  // The wipe and the title card run on their own timers; the hunt and its coach start when the title ends.
  await hold(3600);
  await wk.eval(`document.querySelector('#klc-play .coach .ok')?.click(); return 1`);
  await hold(500);

  // Walk to the charm along the spawn → charm line at about 4.2 m/s, eyes on the fish.
  const walk = await wk.eval(`const s = window.__play.spots.find(p => p.id === 'w-open');
    const p = window.__ctx.player.position;
    const p0 = { x: p.x, z: p.z };
    const dx = s.x - p0.x, dz = s.z - p0.z, dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
    const dur = Math.max(1200, (dist - 1.2) / 4.2 * 1000);
    const t0 = performance.now();
    window.__vlive.walk = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const k = u * (1 - 1.2 / dist);
      window.__camSpec((p0.x + dx * k).toFixed(2) + ',' + (p0.z + dz * k).toFixed(2) + ',' + yaw.toFixed(2) + ',' + (-6 - 10 * u).toFixed(1));
      if (u >= 1) window.__vlive.walk = null;
    };
    return JSON.stringify({ dist, dur });`);
  log('walk', walk);
  await hold(JSON.parse(walk).dur + 2200);
  const got = !!(await wk.eval(`return window.__play.store.get('katsuo').found['w-open'] ? 1 : 0`));
  await wk.eval(`window.__vlive.on = false; return window.__vlive.err || ''`);
  const counter = await wk.eval(`return document.querySelector('#klc-play [data-counter="katsuo"]')?.textContent || ''`);
  log('counter', counter, 'got', got);
  if (!got) throw new Error('the pickup did not land');

  const pcmB64 = await wk.eval(`window.__hear.stop(); return window.__hear.pcm()`);
  const raw = Buffer.from(pcmB64, 'base64');
  const rate = await wk.eval(`return window.__hear.rate`);
  const sliced = raw.subarray(Math.min(Math.max(0, samples0) * 2, raw.length));
  let peak = 0, sum = 0, count = 0;
  for (let i = 0; i + 1 < sliced.length; i += 2) {
    const s = sliced.readInt16LE(i) / 32768;
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
    count++;
  }
  const rms = count ? Math.sqrt(sum / count) : 0;
  log('audio', { rate, sec: (count / rate).toFixed(2), peak: peak.toFixed(3), rms: rms.toFixed(4), frames: shots.length });
  if (rms < 0.001) throw new Error('the live tap was silent');
  const wav = Buffer.alloc(44 + sliced.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + sliced.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(sliced.length, 40); sliced.copy(wav, 44);
  const wavPath = join(ROOT, 'dist/perf/v-play.wav');
  writeFileSync(wavPath, wav);
  // Per-frame durations: each frame shows until the next one was taken.
  let list = '';
  for (let i = 0; i < shots.length; i++) {
    const d = i + 1 < shots.length ? (shots[i + 1][1] - shots[i][1]) / 1000 : 0.5;
    list += `file '${shots[i][0]}'\nduration ${d.toFixed(3)}\n`;
  }
  list += `file '${shots[shots.length - 1][0]}'\n`;
  const listPath = join(frames, 'list.txt');
  writeFileSync(listPath, list);
  const mp4 = join(out, `v-play-${lang}.mp4`);
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-i', wavPath, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '24',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4], { stdout: 'pipe', stderr: 'pipe' });
  if (ff.exitCode !== 0) throw new Error('ffmpeg ' + ff.stderr.toString().slice(-800));
  const total = shots[shots.length - 1][1] / 1000;
  log('mp4', mp4, 'frames', shots.length, 'sec', total.toFixed(1), 'fps', (shots.length / total).toFixed(1));
  writeFileSync(join(out, `v-play-${lang}.json`), JSON.stringify({ frames: shots.length, seconds: +total.toFixed(2), fps: +(shots.length / total).toFixed(2), rate, peak: +peak.toFixed(3), rms: +rms.toFixed(4), counter }) + '\n');
} finally {
  try { await wk.quit(); } catch { /* */ }
  try { proc.kill(9); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
  rmSync(workdir, { recursive: true, force: true });
  if (arg('keep') !== '1') rmSync(frames, { recursive: true, force: true });
}
