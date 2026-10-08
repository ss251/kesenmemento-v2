// [play:courses] One flown run of 安波山, with the game's own voices.
// Chrome is launched muted, so the taiko, the ring, the fanfare and the stamp
// are the same buffers as src/anime/play/kit/voices.js, laid on the sim clock.
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/play-courses-r3-film.mjs [--port 9479]
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, launch } from './cdp.mjs';
import * as V from '../../src/anime/play/kit/voices.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9479));
if (port < 9475 || port > 9479) throw new Error('courses lane ports are 9475-9479');
const OUT = join(import.meta.dir, '../../docs/play/shots/play-courses');
const framesDir = join(import.meta.dir, '../../dist/perf/r3-film');
mkdirSync(framesDir, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 1280, H = 720, FPS = 8, DT = 1 / FPS;
const dist = join(import.meta.dir, '../../dist/anime-' + port);
console.error(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });
const browser = await launch({ quiet: true });

const TICK = `(() => {
  const adv = (sec, dt) => { window.__shotSim = window.__simTo(window.__shotSim + sec, dt); };
  const aim = (x, y, z, tx, ty, tz) => {
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
    window.__setCam(x, y, z, yaw, pitch);
  };
  const pd = (p, g) => (p.x - g.x) * g.nx + (p.y - g.y) * (g.ny || 0) + (p.z - g.z) * g.nz;
  const line = () => document.querySelector('#course-hud .line')?.textContent || '';
  const count = () => {
    const el = document.querySelector('#klc-play .count');
    return el && !el.hidden ? el.textContent : '';
  };
  const medal = () => document.querySelector('#klc-play .medal')?.textContent || '';
  if (!window.__courseFilm) {
    const list = window.__race && window.__race.courses;
    const c = list && list.find ? list.find((x) => x && x.id === 'anba') : null;
    if (!c || !c.gates || !c.start) {
      const ids = [];
      if (list && list.length) for (let i = 0; i < list.length; i++) ids.push((list[i] && list[i].id) + ':' + (list[i] && list[i].gates && list[i].gates.length));
      return { phase: 'missing', hold: 0, sim: 0, count: '', line: ids.join(',') || 'no-courses', time: '', medal: '', card: '', done: false };
    }
    const gates0 = [];
    for (let i = 0; i < c.gates.length; i++) {
      const g = c.gates[i];
      gates0.push({ x: g.x, y: g.y, z: g.z, nx: g.nx, ny: g.ny || 0, nz: g.nz });
    }
    try { localStorage.removeItem('klc.play.v1'); } catch (e) {}
    window.__shotSim = 0;
    window.__race.start('anba');
    adv(0.04, 1 / 30);
    window.__courseFilm = { gates: gates0, phase: 'count', i: 0, pos: { x: c.start.x, y: c.start.y, z: c.start.z }, hold: 0 };
  }
  const F = window.__courseFilm;
  const gates = F.gates;
  if (!gates) return { phase: 'missing', hold: 0, sim: 0, count: '', line: 'no-gates', time: '', medal: '', card: '', done: false };
  if (F.phase === 'count') {
    adv(${DT}, ${DT});
    const live = !!document.querySelector('#course-hud:not([hidden])');
    if (live) {
      F.phase = 'fly';
    }
  } else if (F.phase === 'fly') {
    const g = gates[F.i];
    if (!g) F.phase = 'flyby';
    else if (F.cross) {
      const fore = { x: g.x + g.nx * 5, y: g.y, z: g.z + g.nz * 5 };
      const look = gates[F.i + 1] || g;
      aim(fore.x, fore.y, fore.z, look.x, look.y, look.z);
      adv(1 / 30, 1 / 30);
      F.pos = fore;
      F.cross = false;
      F.i += 1;
      if (F.i >= gates.length) F.phase = 'flyby';
    } else {
      const gatePt = { x: g.x + g.nx * -8, y: g.y, z: g.z + g.nz * -8 };
      const dx = gatePt.x - F.pos.x, dy = gatePt.y - F.pos.y, dz = gatePt.z - F.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = 80 * ${DT};
      if (dist < step + 1.5 || pd(F.pos, g) > -10) {
        const back = { x: g.x + g.nx * -3, y: g.y, z: g.z + g.nz * -3 };
        aim(back.x, back.y, back.z, g.x, g.y, g.z);
        adv(1 / 30, 1 / 30);
        F.pos = back;
        F.cross = true;
      } else {
        const k = step / dist;
        F.pos = { x: F.pos.x + dx * k, y: F.pos.y + dy * k, z: F.pos.z + dz * k };
        aim(F.pos.x, F.pos.y, F.pos.z, g.x, g.y, g.z);
        adv(${DT}, ${DT});
      }
    }
  }
  if (F.phase === 'flyby') {
    adv(${DT}, ${DT});
    if (medal()) F.phase = 'card';
    else if (window.__shotSim > 80) F.phase = 'card';
  } else if (F.phase === 'card') {
    F.hold += ${DT};
  }
  const panel = document.querySelector('#klc-play .panel');
  return {
    phase: F.phase,
    hold: F.hold,
    sim: window.__shotSim,
    count: count(),
    line: line(),
    time: document.querySelector('#course-hud .time')?.textContent || '',
    medal: medal(),
    card: panel ? panel.innerText.replace(/\\s+/g, ' ').trim() : '',
    done: F.phase === 'card' && F.hold >= 2,
  };
})()`;

function wavBytes(samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

function mixVoices(events, seconds) {
  const sr = 44100;
  const mix = new Float32Array((seconds * sr) | 0);
  const put = (samples, at, gain) => {
    const i0 = Math.max(0, (at * sr) | 0);
    for (let i = 0; i < samples.length && i0 + i < mix.length; i++) mix[i0 + i] += samples[i] * gain;
  };
  const taiko = V.taiko(sr);
  const go = V.goCue(sr);
  const ring = V.ringCue(sr);
  const fanfare = V.fanfare(sr);
  let rings = 0;
  let finishAt = null;
  for (const e of events) {
    if (e.ev === '3' || e.ev === '2' || e.ev === '1') put(taiko, e.t, 0.8);
    else if (e.ev === 'GO!') put(go, e.t, 0.7);
    else if (e.ev === 'ring') { put(ring, e.t, 0.55); rings++; }
    else if (e.ev === 'finish') { finishAt = e.t; put(fanfare, e.t, 0.62); }
    else if (e.ev === 'card') put(taiko, e.t, 0.85);
  }
  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const g = peak > 0.01 ? 0.9 / peak : 1;
  for (let i = 0; i < mix.length; i++) mix[i] *= g;
  return { wav: wavBytes(mix, sr), rings, finishAt, peak };
}

try {
  const page = await browser.page({ width: W, height: H, dpr: 1 });
  await page.S('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 1, mobile: false, screenWidth: W, screenHeight: H,
  });
  await page.S('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('klc.play.v1'); } catch (e) {}`,
  });
  await page.goto(`${srv.url}index.html?shot=1&lang=ja&t=0&w=${W}&h=${H}&q=high`);
  await page.waitFor('window.__ready === true && window.__race && window.__race.courses.length === 3', { timeout: 180000 });
  await page.eval(`(() => { document.body.classList.add('playing'); window.__lifeSet && window.__lifeSet('hiru'); return 1; })()`);
  await page.frames(2);

  const cues = [];
  let seen = '';
  let prevN = 0;
  let finished = false;
  let stamped = false;
  let last = null;
  let frames = 0;
  const max = 520;
  for (let i = 0; i < max; i++) {
    last = await page.eval(TICK);
    const t = i / FPS;
    if (last.count && last.count !== seen) { cues.push({ t, ev: last.count }); seen = last.count; }
    const n = Number((last.line || '').match(/(\d+)\//)?.[1] || 0);
    if (n > prevN) {
      cues.push({ t, ev: 'ring' });
      if (n >= 12 && !finished) { cues.push({ t, ev: 'finish' }); finished = true; }
      prevN = n;
    }
    if (last.medal && !stamped) { cues.push({ t, ev: 'card' }); stamped = true; }
    const name = String(i).padStart(4, '0');
    const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
    writeFileSync(join(framesDir, `f-${name}.jpg`), Buffer.from(data, 'base64'));
    if (last.phase === 'missing') throw new Error('course gates missing: ' + last.line);
    if (i % 16 === 0) console.error('frame', i, last.phase, last.line || last.count, last.time, last.medal);
    frames = i + 1;
    if (last.done) break;
  }
  if (!last?.done || !last.medal) throw new Error('film did not finish: ' + JSON.stringify({ phase: last?.phase, line: last?.line, card: last?.card, sim: last?.sim, medal: last?.medal }));
  const timeline = cues;
  const seconds = frames / FPS + 0.4;
  const audio = mixVoices(timeline, Math.max(seconds, 8));
  const wav = join(framesDir, 'voices.wav');
  writeFileSync(wav, audio.wav);
  const mp4 = join(OUT, 'r3-anba-run.mp4');
  const enc = Bun.spawnSync([
    'ffmpeg', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'f-%04d.jpg'),
    '-i', wav, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4,
  ], { stdout: 'ignore', stderr: 'pipe' });
  if (enc.exitCode !== 0) throw new Error(enc.stderr.toString().slice(0, 500));
  console.error('card', last.card);
  console.error('rings', audio.rings, 'saved', mp4);
} finally {
  try { await browser.close(); } catch { /* gone */ }
  try { srv.stop(); } catch { /* gone */ }
  rmSync(framesDir, { recursive: true, force: true });
}
