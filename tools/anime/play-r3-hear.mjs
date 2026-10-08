// [play] Round 3 play-test: open the hub, start 金のカツオさがし, the coach, a pickup.
// Live sound through ?hear=1 (ctx.audio), not an offline mux.
//   env -u NODE_OPTIONS bun tools/anime/play-r3-hear.mjs --port 9466
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9466));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const out = join(ROOT, 'docs/play/shots/play-kit');
const frames = join(out, 'r3-frames');
mkdirSync(frames, { recursive: true });
for (const f of readdirSync(frames)) rmSync(join(frames, f), { force: true });
const log = (...a) => console.error('[r3hear]', ...a);

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

const workdir = join(ROOT, 'dist/perf/wk-r3hear-' + process.pid);
rmSync(workdir, { recursive: true, force: true });
const url = `${srv.url}index.html?shot=1&hear=1&w=1280&h=720&q=high&cam=hero`;
const proc = Bun.spawn([BIN, url, workdir, '1280', '720'], { env: { ...process.env, KLC_WK_EPHEMERAL: '1' }, stdout: 'pipe', stderr: 'pipe' });
const wk = open(workdir);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const ready = await wk.ready(420);
  log('ready', ready.ms);
  const boot = await wk.eval(`document.body.classList.add('playing');
    const a = window.__ctx && window.__ctx.audio;
    if (a && a.start) a.start();
    const ac = a && a.context;
    if (ac && ac.state !== 'running') { try { await ac.resume(); } catch (e) {} }
    window.__setHours(16);
    window.__raf.step(4);
    const s = window.__play.spots.find(p => p.id === 'w-open');
    return JSON.stringify({ hear: !!window.__hear, samples: window.__hear ? window.__hear.samples : 0, state: ac ? ac.state : null, x: s.x, y: s.y, z: s.z });`);
  log('boot', boot);
  const info = JSON.parse(boot);
  if (!info.hear) throw new Error('no live audio tap');
  const spot = { x: info.x, y: info.y, z: info.z };
  const spawn = { x: 168, z: -122 };
  const dx0 = spot.x - spawn.x, dz0 = spot.z - spawn.z;
  const len0 = Math.hypot(dx0, dz0) || 1;
  const ux = dx0 / len0, uz = dz0 / len0;
  const dest = { x: spot.x - ux * 1.3, z: spot.z - uz * 1.3 };

  let n = 0;
  const tAudio0 = Date.now();
  const samples0 = info.samples;
  async function grab(tag) {
    n++;
    const file = join(frames, String(n).padStart(4, '0') + '.png');
    await wk.page(file);
    if (n === 1 || n % 8 === 0) log('f', n, tag);
    return file;
  }
  async function step(sim) {
    await wk.eval(`window.__simTo(${sim}); window.__raf.step(1); return 1`);
  }

  await step(0.2);
  await grab('closed');
  await grab('closed');
  await wk.eval(`document.querySelector('#klc-play [data-act="play"]').click(); window.__raf.step(2); return 1`);
  await sleep(180);
  await grab('hub');
  await grab('hub');
  await wk.eval(`document.querySelector('#klc-play .mcard').click(); window.__raf.step(1); return 1`);
  await sleep(160);
  await grab('card');
  await grab('card');
  await wk.eval(`document.querySelector('#klc-play .mcard.open .go').click(); return 1`);
  await sleep(420);
  await grab('title');
  await sleep(280);
  await grab('title');
  await sleep(700);
  await step(1.2);
  await grab('coach');
  await sleep(240);
  await step(1.8);
  await grab('coach');
  await wk.eval(`const p = document.querySelector('#klc-play .coach .say p'); if (p && window.__play) { const t = window.__play.ui.t('play.katsuo.coach'); if (t && p.textContent.length < t.length) p.textContent = t; } const g = document.querySelector('#klc-play .glove'); if (g) { g.style.animation = 'none'; g.style.opacity = '1'; g.style.transform = 'translateY(-22px)'; } return p ? p.textContent : '';`);
  await grab('coach-hand');
  await sleep(200);
  await grab('coach-hand');
  await wk.eval(`document.querySelector('#klc-play .coach .ok')?.click(); return 1`);
  await sleep(200);
  await grab('gotit');

  const yaw = Math.atan2(-(spot.x - spawn.x), -(spot.z - spawn.z)) * 180 / Math.PI;
  const legs = 7;
  let last = '';
  for (let i = 1; i <= legs; i++) {
    const u = i / legs;
    const x = spawn.x + (dest.x - spawn.x) * u;
    const z = spawn.z + (dest.z - spawn.z) * u;
    const spec = x.toFixed(2) + ',' + z.toFixed(2) + ',' + yaw.toFixed(2) + ',0';
    const sim = (2 + i * 0.3).toFixed(2);
    last = await wk.eval(`window.__camSpec(${JSON.stringify(spec)}); window.__simTo(${sim});
      const p = window.__ctx.player.position;
      const s = window.__play.spots.find(q => q.id === 'w-open');
      const i0 = window.__play.spots.findIndex(q => q.id === 'w-open');
      const eye = p.y + 1.55;
      const horiz = Math.hypot(s.x - p.x, s.z - p.z) || 0.4;
      const pitch = Math.atan2(s.y - eye, horiz) * 180 / Math.PI;
      window.__camSpec(${JSON.stringify(x.toFixed(2) + ',' + z.toFixed(2) + ',' + yaw.toFixed(2) + ',')}+pitch.toFixed(1));
      window.__raf.step(2);
      const d = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
      const got = window.__play.store.get('katsuo').found['w-open'];
      return (document.querySelector('#klc-play [data-counter]')?.textContent || '') + ' d=' + d.toFixed(2) + ' got=' + (got ? 1 : 0) + ' pitch=' + pitch.toFixed(1);`);
    log('step', i, last);
    await grab('walk ' + last);
  }
  if (!/got=1/.test(last)) throw new Error('pickup did not land: ' + last);
  await wk.eval(`window.__simTo(6.2); window.__raf.step(3); return document.querySelector('#klc-play [data-counter]')?.textContent || ''`);
  await grab('picked');
  await grab('picked');
  await sleep(180);
  await grab('hold');
  await grab('hold');

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
  const wavPath = join(out, 'play-r3.wav');
  writeFileSync(wavPath, wav);
  const fps = n / (count / rate);
  const mp4 = join(out, 'play-r3.mp4');
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(fps), '-start_number', '1', '-i', join(frames, '%04d.png'), '-i', wavPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4], { stdout: 'pipe', stderr: 'pipe' });
  if (ff.exitCode !== 0) throw new Error('ffmpeg ' + ff.stderr.toString().slice(-800));
  log('mp4', mp4, 'frames', n, 'fps', fps.toFixed(2));
} finally {
  try { await wk.quit(); } catch { /* */ }
  try { proc.kill(9); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
  rmSync(workdir, { recursive: true, force: true });
}
