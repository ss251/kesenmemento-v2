// Round 3 stills. WebKit, on screen, because an off-screen snapshot misses the
// new camera. The GL buffer is drawn with __bench and copied into an image so
// the snapshot shows the frame the simulation just posed.
//
//   env -u NODE_OPTIONS bun tools/anime/play-avatar-round3.mjs
//   env -u NODE_OPTIONS bun tools/anime/play-avatar-round3.mjs --only desktop-ja
// The town is already on 127.0.0.1:9490.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cdp.mjs';
import { footstep } from '../../src/anime/play/avatar/steps.js';
import { cry } from '../../src/anime/play/gull/voice.js';

const port = 9490;
const out = join(ROOT, 'docs/play/shots/avatar');
const artDir = join(ROOT, 'play/art');
mkdirSync(out, { recursive: true });
mkdirSync(artDir, { recursive: true });

const SWIFT = join(ROOT, 'tools/anime/webkit-shot.swift');
const BIN = '/tmp/webkit-shot-avatar';
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SWIFT).mtimeMs) {
  const r = spawnSync('swiftc', ['-O', SWIFT, '-o', BIN], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const PRE = `
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const g = window.__ctx && window.__ctx.services && window.__ctx.services.play && window.__ctx.services.play.gull;
  if (g && g.start) break;
  await new Promise((r) => setTimeout(r, 250));
}
document.getElementById('intro')?.remove();
document.body.classList.add('playing');
window.__simClock = window.__simClock || 8;
const dt = 1 / 30;
function step(n) {
  for (let i = 0; i < n; i++) { window.__simClock += dt; window.__simTo(window.__simClock, dt); }
}
function bake() {
  if (window.__bench) window.__bench(1);
  const scene = document.querySelector('#scene');
  const url = scene.toDataURL('image/jpeg', 0.82);
  let img = document.getElementById('r3-frame');
  if (!img) {
    img = document.createElement('img');
    img.id = 'r3-frame';
    img.alt = '';
    img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:5;object-fit:fill;pointer-events:none;';
    document.body.appendChild(img);
  }
  img.src = url;
  return url;
}
`;

function shot(name, cssW, cssH, scale, bufW, bufH, lang, q) {
  const url = `http://127.0.0.1:${port}/?shot=1&ui=1&lang=${lang}&q=${q}&w=${bufW}&h=${bufH}&t=8&cam=walk`;
  const dir = join(out, '_r3', name);
  mkdirSync(dir, { recursive: true });
  const ja = lang !== 'en';
  const steps = [
    { js: `${PRE}
      try { localStorage.removeItem('klc.play.gull.v1'); } catch (e) {}
      try { window.__lifeSet('hiru'); } catch (e) {}
      step(6);
      const g = window.__ctx.services.play.gull;
      const ok = g.start();
      step(6);
      bake();
      const s = g.state;
      const prompt = document.querySelector('#klc-play .prompt');
      return JSON.stringify({ ok, open: +(s.open || 0).toFixed(2), prompt: prompt && !prompt.hidden ? prompt.textContent : '' });
    `, wait: 350, out: join(dir, 'lookout.png') },
    { js: `${PRE}
      const play = document.getElementById('klc-play');
      if (play) play.style.visibility = 'hidden';
      step(2);
      bake();
      if (play) play.style.visibility = '';
      return 'art';
    `, wait: 200, out: join(dir, 'art.png') },
    { js: `${PRE}
      const title = ${JSON.stringify(ja ? 'ウミネコになる' : 'Be a gull')};
      const hook = ${JSON.stringify(ja ? '空から港を見下ろす' : 'Look down on the harbour')};
      const time = ${JSON.stringify(ja ? '3分' : '3 min')};
      let card = document.getElementById('r3-hub');
      if (card) card.remove();
      card = document.createElement('div');
      card.id = 'r3-hub';
      card.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(23,24,75,.55);font-family:"Hiragino Sans","Noto Sans JP",sans-serif;line-break:strict;';
      card.innerHTML = '<article style="width:min(300px,78vw);background:#FBFAF5;color:#223A70;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(23,24,75,.28)">'
        + '<div style="position:relative"><img alt="" style="display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#89C3EB">'
        + '<b style="position:absolute;top:8px;right:8px;background:#F8B500;color:#223A70;border-radius:999px;padding:4px 10px;font-size:12px">NEW</b></div>'
        + '<div style="padding:12px 16px 16px"><h2 style="margin:0;font-size:20px;line-height:1.3;word-break:auto-phrase"></h2>'
        + '<p style="margin:6px 0 10px;font-size:14px;line-height:1.5;color:#595857"></p>'
        + '<p class="meta" style="margin:0;font-size:13px"></p></div></article>';
      const play = document.getElementById('klc-play');
      if (play) play.style.visibility = 'hidden';
      card.querySelector('h2').textContent = title;
      card.querySelector('p').textContent = hook;
      card.querySelector('.meta').textContent = '⏱ ' + time + '   ★☆☆';
      const frame = document.getElementById('r3-frame');
      card.querySelector('img').src = frame ? frame.src : '';
      document.body.appendChild(card);
      return title;
    `, wait: 250, out: join(dir, 'hub.png') },
    { js: `${PRE}
      const card = document.getElementById('r3-hub');
      if (card) card.remove();
      const play = document.getElementById('klc-play');
      if (play) play.style.visibility = '';
      const g = window.__ctx.services.play.gull;
      if (g.active) g.leave('stop');
      const p = window.__ctx.playerObj;
      p.person = 'third'; p.fly = false; p.gull = false; p.enabled = true;
      p.setPose(168, -122, 20, 0);
      step(10);
      bake();
      return 'stand';
    `, wait: 200, out: join(dir, 'lean0.png') },
    { js: `${PRE}
      const p = window.__ctx.playerObj;
      p.keys.delete('KeyW');
      const av = window.__ctx.services.play.avatar;
      const ups = window.__ctx._updates || [];
      const nudge = () => { for (const fn of ups) { try { fn(1 / 30, window.__simClock); } catch (e) {} } };
      let lean = 0;
      for (let i = 0; i < 18; i++) { p.yaw += 0.1; p.step(1 / 30); nudge(); lean = av.characterLean; }
      bake();
      return JSON.stringify({ deg: +(lean * 180 / Math.PI).toFixed(2) });
    `, wait: 200, out: join(dir, 'lean1.png') },
  ];
  if (q === 'phone') {
    steps.push({ js: `${PRE}
      const g = window.__ctx.services.play.gull;
      if (g.active) g.leave('stop');
      const p = window.__ctx.playerObj;
      p.person = 'third'; p.fly = false; p.gull = false; p.enabled = true;
      function place(yaw) {
        p.setPose(-96, -72, yaw, 0);
        step(8);
        const av = window.__ctx.services.play.avatar;
        const c = window.__ctx.camera.position;
        return { yaw, boom: +av.boom.toFixed(2), camY: +c.y.toFixed(2) };
      }
      const tight = place(90);
      bake();
      const open = place(135);
      return JSON.stringify({ tight, openYaw: open.yaw, openBoom: open.boom });
    `, wait: 200, out: join(dir, 'uomachi90.png') });
    steps.push({ js: `${PRE}
      bake();
      const av = window.__ctx.services.play.avatar;
      return 'boom ' + (av ? av.boom.toFixed(2) : '?');
    `, wait: 200, out: join(dir, 'uomachi.png') });
  }
  writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps));
  console.error('[r3]', name, url);
  const args = ['--url', url, '--w', String(cssW), '--h', String(cssH), '--scale', String(scale), '--timeout', '180', '--onscreen', '--steps', join(dir, 'steps.json')];
  if (q === 'phone') args.push('--ua', 'iphone');
  const r = spawnSync(BIN, args, { stdio: 'inherit', timeout: 240000 });
  if (r.status !== 0) throw new Error(name + ' exited ' + r.status);
  return dir;
}

function jpg(png, file) {
  const dest = join(out, file);
  const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '62', png, '--out', dest], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('sips ' + file);
  return dest;
}
function pair(a, b, file) {
  const dest = join(out, file);
  const r = spawnSync('ffmpeg', ['-y', '-i', a, '-i', b, '-filter_complex', 'hstack', '-q:v', '5', dest], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(-400));
  return dest;
}
function webp(png) {
  const dest = join(artDir, 'gull.webp');
  // This Mac's ffmpeg has no libwebp. Pillow writes the 16:10 card when ffmpeg cannot.
  const r = spawnSync('ffmpeg', ['-y', '-i', png, '-vf', 'crop=ih*8/5:ih,scale=640:-2', '-c:v', 'libwebp', '-quality', '62', dest], { stdio: 'pipe' });
  if (r.status === 0 && statSync(dest).size <= 40 * 1024) return dest;
  const py = spawnSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('RGB')
w, h = im.size
tw, th = w, int(round(w * 10 / 16))
if th > h:
    th = h; tw = int(round(h * 16 / 10))
left, top = (w - tw) // 2, (h - th) // 2
im.crop((left, top, left + tw, top + th)).resize((640, 400), Image.Resampling.LANCZOS).save(${JSON.stringify(dest)}, 'WEBP', quality=62, method=6)
`], { stdio: 'inherit' });
  if (py.status !== 0) throw new Error('webp');
  console.error('[r3] webp', statSync(dest).size);
  return dest;
}
function wavBytes(samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE((Math.max(-1, Math.min(1, samples[i])) * 32767) | 0, 44 + i * 2);
  return buf;
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const jobs = [
  ['desktop-ja', 1440, 900, 1, 1440, 900, 'ja', 'high'],
  ['desktop-en', 1440, 900, 1, 1440, 900, 'en', 'high'],
  ['phone-ja', 393, 852, 3, 1179, 2556, 'ja', 'phone'],
  ['phone-en', 393, 852, 3, 1179, 2556, 'en', 'phone'],
].filter((j) => !only || j[0] === only);
const dirs = {};
for (const [name, cssW, cssH, scale, bufW, bufH, lang, q] of jobs) dirs[name] = shot(name, cssW, cssH, scale, bufW, bufH, lang, q);

function pack(name, prefix, phoneShot) {
  const dir = dirs[name];
  if (!dir) return;
  jpg(join(dir, 'lookout.png'), prefix + '-lookout.jpg');
  jpg(join(dir, 'hub.png'), prefix + '-hub.jpg');
  pair(join(dir, 'lean0.png'), join(dir, 'lean1.png'), prefix + '-lean.jpg');
  if (phoneShot) {
    jpg(join(dir, 'uomachi.png'), prefix + '-uomachi.jpg');
    if (existsSync(join(dir, 'uomachi90.png'))) jpg(join(dir, 'uomachi90.png'), prefix + '-uomachi90.jpg');
  }
}
if (dirs['desktop-ja']) webp(join(dirs['desktop-ja'], 'art.png'));
pack('desktop-ja', 'r3-desktop-ja', false);
pack('desktop-en', 'r3-desktop-en', false);
pack('phone-ja', 'r3-phone-ja', true);
pack('phone-en', 'r3-phone-en', true);

if (!only || only === 'desktop-ja') {
  const sr = 22050;
  const wind = new Float32Array(sr * 3);
  let b = 0;
  for (let i = 0; i < wind.length; i++) { const w = Math.random() * 2 - 1; b = b * 0.992 + w * 0.02; wind[i] = b * 0.4; }
  const call = cry(sr);
  for (let i = 0; i < call.length && i + sr * 0.6 < wind.length; i++) wind[(sr * 0.6 + i) | 0] += call[i] * 0.85;
  writeFileSync(join(out, '_r3', 'gull.wav'), wavBytes(wind, sr));
  const stepsSnd = new Float32Array(sr * 2);
  const tap = footstep(sr, 'asphalt');
  for (let t = 0.15; t < 2; t += 0.38) {
    const o = (t * sr) | 0;
    for (let i = 0; i < tap.length && o + i < stepsSnd.length; i++) stepsSnd[o + i] += tap[i] * 0.9;
  }
  writeFileSync(join(out, '_r3', 'steps.wav'), wavBytes(stepsSnd, sr));
}
console.error('[r3] stills done');
