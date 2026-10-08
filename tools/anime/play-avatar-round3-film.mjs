// Short play-test films for round 3. The town is on :9490.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cdp.mjs';
import { footstep } from '../../src/anime/play/avatar/steps.js';
import { cry } from '../../src/anime/play/gull/voice.js';

const BIN = '/tmp/webkit-shot-avatar';
const out = join(ROOT, 'docs/play/shots/avatar');
const frames = join(out, '_r3', 'film');
mkdirSync(frames, { recursive: true });

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
const dt = 1/30;
function step(n){ for (let i=0;i<n;i++){ window.__simClock += dt; window.__simTo(window.__simClock, dt);} }
function bake(){
  if (window.__bench) window.__bench(1);
  const scene = document.querySelector('#scene');
  const url = scene.toDataURL('image/jpeg', 0.8);
  let img = document.getElementById('r3-frame');
  if (!img) { img = document.createElement('img'); img.id='r3-frame'; img.alt=''; img.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:5;object-fit:fill;pointer-events:none;'; document.body.appendChild(img); }
  img.src = url;
}
function nudge(){ for (const fn of (window.__ctx._updates||[])) { try { fn(dt, window.__simClock); } catch(e){} } }
`;

const steps = [];
steps.push({ js: `${PRE}
  try { localStorage.removeItem('klc.play.gull.v1'); } catch(e){}
  const play = document.getElementById('klc-play');
  if (play) play.style.visibility = 'hidden';
  try { window.__lifeSet('hiru'); } catch(e){}
  step(4);
  window.__ctx.services.play.gull.start();
  step(2);
  bake();
  return 'open ' + (window.__ctx.services.play.gull.state.open||0).toFixed(2);
`, wait: 200, out: join(frames, 'art.png') });
for (let i = 0; i < 8; i++) {
  steps.push({ js: `${PRE}
    const play = document.getElementById('klc-play');
    if (play) play.style.visibility = '';
    step(2);
    bake();
    return 'w' + ${i};
  `, wait: 80, out: join(frames, `w${String(i).padStart(2, '0')}.png`) });
}
steps.push({ js: `${PRE}
  const g = window.__ctx.services.play.gull;
  if (g.active) g.leave('walk');
  const p = window.__ctx.playerObj;
  p.person='third'; p.fly=false; p.gull=false; p.enabled=true;
  p.setPose(168,-122,20,0);
  step(6);
  bake();
  return 'stand';
`, wait: 80, out: join(frames, 'l00.png') });
for (let i = 1; i <= 6; i++) {
  steps.push({ js: `${PRE}
    const p = window.__ctx.playerObj;
    p.keys.add('KeyW');
    for (let k=0;k<4;k++){ p.yaw += 0.1; p.step(1/30); nudge(); }
    bake();
    const deg = window.__ctx.services.play.avatar.hoyaLean * 180 / Math.PI;
    return 'lean ' + deg.toFixed(1);
  `, wait: 60, out: join(frames, `l${String(i).padStart(2, '0')}.png`) });
}
steps.push({ js: `${PRE}
  const p = window.__ctx.playerObj;
  p.keys.delete('KeyW');
  p.person='third'; p.fly=false; p.gull=false; p.enabled=true;
  p.setPose(-96,-72,135,0);
  step(6);
  bake();
  const av = window.__ctx.services.play.avatar;
  return 'alley ' + av.boom.toFixed(2) + ' walk ' + JSON.stringify(av.cost()) + ' gull ' + JSON.stringify(window.__ctx.services.play.gull.cost());
`, wait: 80, out: join(frames, 'a00.png') });
for (let i = 1; i <= 6; i++) {
  steps.push({ js: `${PRE}
    const p = window.__ctx.playerObj;
    p.keys.add('KeyW');
    p.step(1/30); step(2);
    bake();
    return 'a' + ${i};
  `, wait: 60, out: join(frames, `a${String(i).padStart(2, '0')}.png`) });
}

const stepsPath = join(frames, 'steps.json');
writeFileSync(stepsPath, JSON.stringify(steps));
const url = 'http://127.0.0.1:9490/?shot=1&ui=1&lang=ja&q=high&w=1280&h=720&t=8&cam=walk';
const r = spawnSync(BIN, ['--url', url, '--w', '1280', '--h', '720', '--scale', '1', '--timeout', '180', '--onscreen', '--steps', stepsPath], { stdio: 'inherit', timeout: 180000 });
if (r.status !== 0) process.exit(r.status || 1);

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
const sr = 22050;
const wind = new Float32Array(sr * 3);
let b = 0;
for (let i = 0; i < wind.length; i++) { const w = Math.random() * 2 - 1; b = b * 0.992 + w * 0.02; wind[i] = b * 0.4; }
const call = cry(sr);
for (let i = 0; i < call.length && i + sr * 0.4 < wind.length; i++) wind[(sr * 0.4 + i) | 0] += call[i] * 0.8;
writeFileSync(join(frames, 'gull.wav'), wavBytes(wind, sr));
const stepsSnd = new Float32Array(sr * 2);
const tap = footstep(sr, 'asphalt');
for (let t = 0.12; t < 2; t += 0.36) {
  const o = (t * sr) | 0;
  for (let i = 0; i < tap.length && o + i < stepsSnd.length; i++) stepsSnd[o + i] += tap[i] * 0.9;
}
writeFileSync(join(frames, 'steps.wav'), wavBytes(stepsSnd, sr));

function film(pattern, wav, name) {
  const mp4 = join(out, name);
  const rr = spawnSync('ffmpeg', ['-y', '-framerate', '8', '-i', join(frames, pattern), '-i', wav, '-shortest', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-b:a', '96k', mp4], { stdio: 'pipe' });
  if (rr.status !== 0) console.error(rr.stderr.toString().slice(-400));
  else console.error('[r3] film', mp4);
}
film('w%02d.png', join(frames, 'gull.wav'), 'r3-lookout.mp4');
film('l%02d.png', join(frames, 'steps.wav'), 'r3-lean.mp4');
film('a%02d.png', join(frames, 'steps.wav'), 'r3-uomachi.mp4');
