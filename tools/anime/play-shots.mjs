// [play] HUD stills and a short pickup clip. WebKit, no Chrome.
//   env -u NODE_OPTIONS bun tools/anime/play-shots.mjs --port 9466
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import { marimba } from '../../src/anime/play/kit/voices.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9466));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const out = arg('out', join(ROOT, 'docs/play/shots/play-kit'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[play-shots]', ...a);
const want = new Set(String(arg('set', 'all')).split(','));
const on = (k) => want.has('all') || want.has(k);

const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

async function session(name, w, h, { dsf = null, q = 'high', extra = '', reduce = false } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-play-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?shot=1&w=${w}&h=${h}&q=${q}&cam=hero${extra}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  if (reduce) env.KLC_REDUCE = '1';
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  try {
    const ready = await wk.ready(420);
    log(name, 'ready', ready.ms);
    await fn(wk);
  } finally {
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function showHud(wk) {
  await wk.eval(`document.body.classList.add('playing'); return 1`);
  await wk.eval(`window.__raf.step(8); return 1`);
}
async function page(wk, name, width) {
  const png = join(out, name + '.png');
  await wk.page(png);
  jpg(png, join(out, name + '.jpg'), width);
  log('saved', name);
}

const SHOW = `document.body.classList.add('playing'); window.__raf.step(6); return document.querySelector('#klc-play .book span')?.textContent || ''`;

try {
  if (on('desk')) await session('desk-ja', 1600, 900, {}, async (wk) => {
    const label = await wk.eval(SHOW);
    log('ja label', label);
    await page(wk, 'desktop-ja-day');
    await wk.eval(`window.__setHours(21); window.__raf.step(4); return 1`);
    await page(wk, 'desktop-ja-night');
    await wk.eval(`window.__setHours(16); document.querySelector('#klc-play .book').click(); return document.querySelector('#klc-play .sheet h2').textContent`);
    await Bun.sleep(300);
    await page(wk, 'desktop-ja-book');
  });
  if (on('desk')) await session('desk-en', 1600, 900, { extra: '&lang=en' }, async (wk) => {
    const label = await wk.eval(SHOW);
    log('en label', label);
    await page(wk, 'desktop-en-day');
    await wk.eval(`document.querySelector('#klc-play .book').click(); return 1`);
    await Bun.sleep(300);
    await page(wk, 'desktop-en-book');
  });
  if (on('phone')) await session('phone-ja', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => {
    await wk.eval(SHOW);
    await page(wk, 'phone-ja-day', 786);
    await wk.eval(`document.querySelector('#klc-play .book').click(); return 1`);
    await Bun.sleep(300);
    await page(wk, 'phone-ja-book', 786);
  });
  if (on('phone')) await session('phone-land', 852, 393, { dsf: 3, q: 'phone' }, async (wk) => {
    await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__camSpec('walk'); window.__setHours(12); window.__simTo(0.14); window.__raf.step(6); return 1`);
    await page(wk, 'phone-ja-land', 852);
  });
  if (on('phone')) await session('phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en' }, async (wk) => {
    const label = await wk.eval(SHOW);
    log('phone en', label);
    await page(wk, 'phone-en-day', 786);
  });
  if (on('cost')) await session('cost', 1280, 720, { q: 'phone', extra: '&perf=1&pose=1' }, async (wk) => {
    const perf = await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__camSpec('walk'); window.__perf && window.__perf.start(); window.__raf.step(120); const cost = window.__playCost ? window.__playCost() : null; const d = window.__perf ? window.__perf.stop() : { cpu: [], calls: [] }; const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (a,p) => a.length ? a[Math.min(a.length-1, Math.floor(p*(a.length-1)))] : 0; return JSON.stringify({ cost, cpuP50: q(cpu,0.5), cpuP95: q(cpu,0.95), cpuP99: q(cpu,0.99), hitch: (d.cpu||[]).filter(v => v > 50).length, calls: (d.calls||[])[(d.calls||[]).length-1] });`);
    writeFileSync(join(out, 'perf.json'), perf);
    log('perf', perf);
  });
  if (on('reduce')) await session('reduce', 1600, 900, { reduce: true }, async (wk) => {
    await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__camSpec('walk'); window.__setHours(12); window.__simTo(0.2); window.__raf.step(6); return 1`);
    await page(wk, 'desktop-ja-reduce');
  });

  if (on('pick')) await session('pick', 1280, 720, { q: 'phone', extra: '&perf=1' }, async (wk) => {
    await wk.eval(`document.body.classList.add('playing'); return 1`);
    const spec = await wk.eval(`const s = window.__play.spots.find(x => x.id === 'w-otokoyama'); return (s.x + 1.6) + ',' + (s.y + 0.15) + ',' + s.z + '>' + s.x + ',' + s.y + ',' + s.z`);
    await wk.eval(`window.__camSpec(${JSON.stringify(spec)}); return 1`);
    const frames = join(out, 'pickup-frames');
    mkdirSync(frames, { recursive: true });
    for (let i = 0; i < 28; i++) await wk.shot(join(frames, String(i).padStart(2, '0') + '.png'), 2);
    const perf = await wk.eval(`window.__perf && window.__perf.start(); window.__raf.step(90); const cost = window.__playCost ? window.__playCost() : null; const d = window.__perf ? window.__perf.stop() : { cpu: [], calls: [], buckets: {} }; const col = (d.buckets['upd:play']||[]).filter(v => v > 0).sort((a,b)=>a-b); const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (a,p) => a.length ? a[Math.min(a.length-1, Math.floor(p*(a.length-1)))] : 0; return JSON.stringify({ cost, playN: col.length, playP50: q(col,0.5), playP95: q(col,0.95), playMax: col[col.length-1]||0, cpuP50: q(cpu,0.5), cpuP95: q(cpu,0.95), cpuP99: q(cpu,0.99), hitch: (d.cpu||[]).filter(v => v > 50).length, calls: (d.calls||[])[(d.calls||[]).length-1] });`);
    writeFileSync(join(out, 'perf.json'), perf);
    log('perf', perf);
    const count = await wk.eval(`return document.querySelector('#klc-play .counter b')?.textContent || ''`);
    log('counter after pickup', count);
    await Bun.sleep(200);
    await wk.page(join(out, 'desktop-ja-pickup.png'));
    jpg(join(out, 'desktop-ja-pickup.png'), join(out, 'desktop-ja-pickup.jpg'));
  });
  if (on('book')) await session('book-ja', 1600, 900, {}, async (wk) => {
    await wk.eval(SHOW);
    await wk.eval(`document.querySelector('#klc-play .book').click(); window.__raf.step(3); return 1`);
    await page(wk, 'desktop-ja-book');
  });
  if (on('book')) await session('book-en', 1600, 900, { extra: '&lang=en' }, async (wk) => {
    await wk.eval(SHOW);
    await wk.eval(`document.querySelector('#klc-play .book').click(); window.__raf.step(3); return 1`);
    await page(wk, 'desktop-en-book');
  });
  if (on('book')) await session('book-phone', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => {
    await wk.eval(SHOW);
    await wk.eval(`document.querySelector('#klc-play .book').click(); window.__raf.step(3); return 1`);
    await page(wk, 'phone-ja-book', 786);
  });
  if (on('retina')) await session('retina', 1600, 900, { dsf: 2 }, async (wk) => {
    await wk.eval(SHOW);
    await wk.eval(`document.querySelector('#klc-play .book').click(); window.__raf.step(3); return 1`);
    await page(wk, 'desktop-ja-retina', 1600);
  });
  if (on('gold')) {
    const aim = `(dist, side) => {
      const s = window.__play.spots.find(x => x.id === 'w-open');
      const dx = s.x - 168, dz = s.z + 122;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const x = s.x - ux * dist - uz * side;
      const z = s.z - uz * dist + ux * side;
      const y = s.y + 0.32;
      window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
      window.__simTo(0.14);
      window.__raf.step(4);
      return JSON.stringify({ id: s.id, x: s.x, y: s.y, z: s.z });
    }`;
    const far = `(dist) => {
      const s = window.__play.spots.find(x => x.id === 'w-open');
      const dx = s.x - 168, dz = s.z + 122;
      const len = Math.hypot(dx, dz) || 1;
      const x = s.x - (dx / len) * dist;
      const z = s.z - (dz / len) * dist;
      window.__camSpec(x.toFixed(2) + ',9,' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
      window.__simTo(0.14);
      window.__raf.step(4);
      return s.id;
    }`;
    await session('gold-day', 1600, 900, { extra: '&face=1&pose=1' }, async (wk) => {
      const where = await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__aim = ${aim}; const id = window.__aim(2.4, 0.7); return id + ' counter ' + (document.querySelector('#klc-play [data-counter]')?.textContent || '');`);
      log('w-open', where);
      await page(wk, 'desktop-ja-charm-day');
      await wk.eval(`window.__setHours(19.5); window.__raf.step(4); return 1`);
      await page(wk, 'desktop-ja-charm-night');
      await wk.eval(`window.__setHours(12); window.__far = ${far}; return window.__far(60)`);
      await page(wk, 'desktop-ja-charm-60');
      await wk.eval(`document.body.classList.remove('noui'); window.__camSpec('walk'); window.__setHours(12); window.__simTo(0.14); window.__raf.step(6); return 1`);
      await page(wk, 'desktop-ja-spawn');
    });
    await session('gold-phone', 393, 852, { dsf: 3, q: 'phone', extra: '&face=1&pose=1' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__aim = ${aim}; return window.__aim(1.45, 0.35)`);
      await page(wk, 'phone-ja-charm-day', 786);
      await wk.eval(`window.__setHours(19.5); window.__raf.step(4); return 1`);
      await page(wk, 'phone-ja-charm-night', 786);
      await wk.eval(`window.__setHours(12); window.__far = ${far}; return window.__far(60)`);
      await page(wk, 'phone-ja-charm-60', 786);
      await wk.eval(`document.body.classList.remove('noui'); window.__camSpec('walk'); window.__setHours(12); window.__simTo(0.14); window.__raf.step(6); return 1`);
      await page(wk, 'phone-ja-spawn', 786);
    });
    await session('gold-en', 1600, 900, { extra: '&face=1&pose=1&lang=en' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__aim = ${aim}; return window.__aim(2.4, 0.7)`);
      await page(wk, 'desktop-en-charm-day');
    });
  }
  if (on('far')) {
    const look = `(x, y, z) => {
      const s = window.__play.spots.find(p => p.id === 'w-open');
      window.__play.store.update('katsuo', (d) => { d.found = {}; });
      window.__setHours(12);
      window.__camSpec(x + ',' + y + ',' + z + '>' + s.x + ',' + s.y + ',' + s.z);
      window.__simTo(0.14);
      window.__raf.step(4);
      return s.id;
    }`;
    await session('far', 1600, 900, { extra: '&face=1&pose=1' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing', 'noui'); window.__far = ${look}; return window.__far(210.9, 22, -138.5)`);
      await page(wk, 'desktop-ja-charm-60');
    });
    await session('far-phone', 393, 852, { dsf: 3, q: 'phone', extra: '&face=1&pose=1' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing', 'noui'); window.__far = ${look}; return window.__far(210.9, 22, -138.5)`);
      await page(wk, 'phone-ja-charm-60', 786);
    });
  }
  if (on('juice') || on('mid')) {
    const stand = `(ahead) => {
      const s = window.__play.spots.find(p => p.id === 'w-open');
      const dx = s.x - 168, dz = s.z + 122;
      const len = Math.hypot(dx, dz) || 1;
      const x = s.x - (dx / len) * ahead;
      const z = s.z - (dz / len) * ahead;
      const yaw = Math.atan2(-(s.x - x), -(s.z - z)) * 180 / Math.PI;
      window.__camSpec(x.toFixed(2) + ',' + z.toFixed(2) + ',' + yaw.toFixed(2) + ',-6');
      return s.id;
    }`;
    await session('juice', 1600, 900, {}, async (wk) => {
      await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__stand = ${stand}; return window.__stand(1.1)`);
      const mid = await wk.eval(`window.__simTo(0.32); window.__raf.step(3); return document.querySelector('#klc-play [data-counter]')?.textContent || ''`);
      log('mid', mid);
      await page(wk, 'desktop-ja-pickup');
    });
    if (on('juice')) await session('finale', 1600, 900, {}, async (wk) => {
      const title = await wk.eval(`document.body.classList.add('playing');
        const spots = window.__play.spots;
        window.__play.store.update('katsuo', (d) => { d.found = {}; for (const s of spots) if (s.id !== 'w-open') d.found[s.id] = '2026-10-07T00:00:00.000Z'; });
        window.__setHours(19.5);
        window.__stand = ${stand};
        window.__stand(1.1);
        window.__simTo(0.7);
        window.__camSpec('168,12,-110>156,58,-33');
        window.__simTo(1.6);
        window.__raf.step(3);
        return document.querySelector('#klc-play [data-counter]')?.textContent || '';`);
      log('sky', title);
      await page(wk, 'desktop-ja-fireworks');
      const book = await wk.eval(`document.querySelector('#klc-play .book').click();
        const tab = [...document.querySelectorAll('#klc-play .tabs button')].find(b => (b.textContent || '').indexOf('カツオ') >= 0);
        if (tab) tab.click();
        window.__raf.step(2);
        return document.querySelector('#klc-play .body')?.innerText?.slice(0, 120) || '';`);
      log('finale', book);
      await Bun.sleep(200);
      await page(wk, 'desktop-ja-finale');
    });
    await session('juice-phone', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__stand = ${stand}; window.__stand(1.1); window.__simTo(0.32); window.__raf.step(3); return 1`);
      await page(wk, 'phone-ja-pickup', 786);
    });
  }
  if (on('street')) await session('street', 1600, 900, {}, async (wk) => {
    await wk.eval(SHOW);
    const info = await wk.eval(`window.__camSpec('walk'); window.__raf.step(20);
      const sheet = document.querySelector('#klc-play .sheet');
      const pl = window.__ctx.playerObj;
      const s = window.__play.spots.find(x => x.id === 'w-prom');
      const before = { hidden: sheet.hidden, display: getComputedStyle(sheet).display, tabs: document.querySelectorAll('#klc-play .tabs button').length, feetY: pl.pos.y, eye: pl.eye, sx: s.x, sy: s.y, sz: s.z };
      sheet.hidden = true;
      return JSON.stringify(before);`);
    log('street', info);
    await page(wk, 'desktop-ja-spawn');
    await wk.eval(`const s = window.__play.spots.find(x => x.id === 'w-prom');
      const pl = window.__ctx.playerObj;
      const eye = pl.pos.y + pl.eye;
      window.__camSpec(pl.pos.x + ',' + eye + ',' + pl.pos.z + '>' + s.x + ',' + (s.y + 0.3) + ',' + s.z);
      document.querySelector('#klc-play .sheet').hidden = true;
      window.__raf.step(8); return 1;`);
    await page(wk, 'desktop-ja-first');
  });
} finally {
  try { srv.stop(); } catch { /* */ }
}

const frames = join(out, 'pickup-frames');
if (existsSync(frames)) {
  const sr = 44100;
  const pcm = marimba(sr, 587, 0.7);
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length * 2, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.max(-1, Math.min(1, pcm[i])) * 32767, 44 + i * 2);
  const wavPath = join(out, 'chime.wav');
  writeFileSync(wavPath, wav);
  const vid = join(out, 'pickup.mp4');
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', '12', '-i', join(frames, '%02d.png'), '-i', wavPath, '-shortest', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', vid]);
  if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(-400));
  else { log('video', vid); rmSync(frames, { recursive: true, force: true }); rmSync(wavPath, { force: true }); }
}
log('done', out);
