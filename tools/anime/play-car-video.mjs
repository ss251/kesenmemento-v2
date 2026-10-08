// Drift combo and one race lap, with the car's own Web Audio (not a stand-in tone).
// Headless Chrome is launched with --mute-audio, and __simTo bursts the sim, so the live
// context clock does not span the clip. Each frame records rpm, slip and the gear blip;
// an OfflineAudioContext in the page then renders the same hum and tyre scrub the car uses.
// audio.start() still runs first, so the live context is up during the capture.
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun tools/anime/play-car-video.mjs --port 9496
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { build, serve, launch, ROOT } from './cdp.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const port = Number(arg('port', 9496));
const out = arg('out', join(ROOT, 'docs/play/shots/play-car'));
mkdirSync(out, { recursive: true });
const dist = join(ROOT, `dist/anime-${port}`);

console.log('build', JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });
const browser = await launch({ quiet: true, args: ['--autoplay-policy=no-user-gesture-required'] });

const RENDER = `async (name) => {
  const trace = window.__bed || [];
  const dt = window.__bedDt || (1 / 15);
  const sr = 44100;
  const dur = Math.max(0.2, trace.length * dt);
  const off = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  const o1 = off.createOscillator(); o1.type = 'sawtooth';
  const o2 = off.createOscillator(); o2.type = 'triangle';
  const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = off.createGain();
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(off.destination);
  const noise = off.createBuffer(1, sr, sr);
  const data = noise.getChannelData(0);
  let s = 1;
  for (let i = 0; i < sr; i++) { s = (s * 16807) % 2147483647; data[i] = s / 1073741823.5 - 1; }
  const ns = off.createBufferSource(); ns.buffer = noise; ns.loop = true;
  const bp = off.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
  const ng = off.createGain();
  ns.connect(bp); bp.connect(ng); ng.connect(off.destination);
  let blip = 0;
  for (let i = 0; i < trace.length; i++) {
    const t = i * dt;
    const row = trace[i];
    const rpm = row[0] || 850;
    let f = 32 + (rpm / 6500) * 128 + (row[4] || 0) * 18;
    if (row[3]) blip = 0.18;
    if (blip > 0) { f += 84 * (blip / 0.18); blip = Math.max(0, blip - dt); }
    const slip = Math.abs(row[2] || 0);
    const v = Math.abs(row[1] || 0);
    const skid = row[5] ? 1 : 0;
    o1.frequency.setValueAtTime(f, t);
    o2.frequency.setValueAtTime(f * 2.02, t);
    g.gain.setValueAtTime(0.02 + Math.min(1, v / 22) * 0.03 + skid * 0.012, t);
    ng.gain.setValueAtTime(skid ? Math.min(0.07, 0.014 + slip * 0.14) : 0, t);
    bp.frequency.setValueAtTime(640 + slip * 2200, t);
  }
  o1.start(0); o2.start(0); ns.start(0);
  const audio = await off.startRendering();
  const ch = audio.getChannelData(0);
  const pcm = new Int16Array(ch.length);
  let peak = 0;
  for (let i = 0; i < ch.length; i++) {
    const x = Math.max(-1, Math.min(1, ch[i]));
    if (Math.abs(x) > peak) peak = Math.abs(x);
    pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
  }
  const bytes = pcm.byteLength;
  const buf = new ArrayBuffer(44 + bytes);
  const view = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) view.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  let bin = '';
  const u8 = new Uint8Array(buf);
  const step = 8000;
  for (let i = 0; i < u8.length; i += step) bin += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  window.__wavB64 = btoa(bin);
  return { name, n: trace.length, dur: +dur.toFixed(2), peak: +peak.toFixed(3), chars: window.__wavB64.length };
}`;

function sampleAt(samples, dist) {
  let i = 0;
  while (i < samples.length - 1 && samples[i + 1][2] < dist) i++;
  const a = samples[i], b = samples[Math.min(samples.length - 1, i + 1)];
  const span = Math.max(0.001, b[2] - a[2]);
  const u = Math.max(0, Math.min(1, (dist - a[2]) / span));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

try {
  const page = await browser.page({ width: 1280, height: 720, dpr: 1 });
  const boot = async (car, preset) => {
    const url = `${srv.url}index.html?shot=1&w=1280&h=720&q=high&lang=ja&car=${car}&preset=${preset}`;
    await page.goto(url);
    await page.waitFor('window.__ready === true', { timeout: 280000 });
    await page.eval('window.__explore && window.__explore.settle ? window.__explore.settle() : 1');
    await page.frames(6);
    await page.eval(`(() => { document.body.classList.add('playing'); try { window.__ctx.audio.start(); } catch (e) {} return window.__ctx.audio.context && window.__ctx.audio.context.state; })()`);
  };

  const shoot = async (dir, n, step) => {
    mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= n; i++) {
      const t = +(i * step).toFixed(4);
      const row = await page.eval(`(() => {
        window.__simTo(${t}); window.__playSim = ${t};
        const s = window.__explore.drive.state;
        const row = [Math.round(s.rpm || 0), +s.speed.toFixed(2), +((s.slipR || 0).toFixed(3)), s.shift ? 1 : 0, s.skid ? 1 : 0];
        (window.__bed = window.__bed || []).push(row);
        return { speed: row[1], skid: !!s.skid, phase: window.__playCar && window.__playCar.race && window.__playCar.race.phase };
      })()`);
      if (i % 20 === 0) console.log('frame', i, JSON.stringify(row));
      const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
      writeFileSync(join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(data, 'base64'));
    }
  };

  const mux = async (dir, mp4) => {
    const rendered = await page.eval(`(${RENDER})("bed")`);
    let b64 = '';
    for (let i = 0; i < rendered.chars; i += 200000) {
      b64 += await page.eval(`window.__wavB64.slice(${i}, ${i + 200000})`);
    }
    const wav = join(dir, 'bed.wav');
    writeFileSync(wav, Buffer.from(b64, 'base64'));
    console.log('audio', rendered.name, rendered.dur, 's', 'peak', rendered.peak, rendered.n, 'frames');
    if (!(rendered.peak > 0.01)) throw new Error('silent bed, peak ' + rendered.peak);
    const vid = Bun.spawnSync(['ffmpeg', '-y', '-framerate', String(1 / (rendered.dur / rendered.n)), '-i', join(dir, '%04d.jpg'), '-i', wav,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
    if (vid.exitCode !== 0) throw new Error(vid.stderr.toString().slice(0, 500));
    console.log('saved', mp4);
    rmSync(dir, { recursive: true, force: true });
  };

  const only = arg('only', 'both');
  if (only !== 'race') {
  await boot('drift', 'hiru');
  await page.eval(`(() => {
    window.__bed = []; window.__bedDt = 1 / 15; window.__playSim = 0;
    const d = window.__explore.drive;
    d.setAssist(false); d.setRace(true);
    d.lookOrbit(0.85, -0.04, 40);
    for (const code of ['KeyW', 'ShiftLeft']) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    return d.active;
  })()`);
  const driftDir = join(out, 'drift-frames');
  rmSync(driftDir, { recursive: true, force: true });
  const driftN = Math.round(8.2 * 15);
  const brakeAt = Math.round(4.4 * 15);
  const releaseAt = Math.round(5.2 * 15);
  for (let i = 1; i <= driftN; i++) {
    if (i === brakeAt) {
      await page.eval(`(() => { for (const code of ['KeyD', 'Space']) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return 1; })()`);
    }
    if (i === releaseAt) {
      await page.eval(`(() => { for (const code of ['KeyW', 'ShiftLeft', 'Space', 'KeyD']) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); return 1; })()`);
    }
    const t = +(i / 15).toFixed(4);
    const row = await page.eval(`(() => {
      window.__simTo(${t}); window.__playSim = ${t};
      const s = window.__explore.drive.state;
      const rec = [Math.round(s.rpm || 0), +s.speed.toFixed(2), +((s.slipR || 0).toFixed(3)), s.shift ? 1 : 0, Math.max(0, s.throttle || 0), s.skid ? 1 : 0];
      window.__bed.push(rec);
      return { speed: rec[1], skid: !!s.skid, toast: document.querySelector('#klc-play .toast')?.textContent || '' };
    })()`);
    if (i % 15 === 0) console.log('drift', i, JSON.stringify(row));
    const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
    mkdirSync(driftDir, { recursive: true });
    writeFileSync(join(driftDir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(data, 'base64'));
  }
  await mux(driftDir, join(out, 'drift.mp4'));
  }

  if (only !== 'drift') {
  if (only === 'race') await page.goto(`${srv.url}index.html?shot=1&w=1280&h=720`);
  const course = await Bun.file(join(ROOT, 'data/play/race-minato.json')).json();
  const ghost = [];
  const ghostN = 720;
  for (let k = 0; k < ghostN; k++) {
    const dist = (k / ghostN) * course.lengthM;
    const p = sampleAt(course.samples, dist);
    const q = sampleAt(course.samples, dist + 8);
    ghost.push(+p[0].toFixed(2), +p[1].toFixed(2), 1, +Math.atan2(-(q[0] - p[0]), -(q[1] - p[1])).toFixed(3));
  }
  await page.eval(`(() => {
    const state = { v: 1, katsuo: { found: {} }, courses: {}, fish: {}, meta: { firstRun: '2026-10-07T08:00:00.000Z', car: {
      assist: true,
      look: { paint: 'akane', livery: 'tairyo', wheel: 'spoke', roof: 'surf', plate: 'tairyo' },
      unlocked: { 'car.paint.kon': true, 'car.livery.tairyo': true, 'car.wheel.spoke': true, 'car.roof.surf': true },
      race: { ghost: ${JSON.stringify(ghost)}, ghostCount: ${ghostN}, bestLapMs: 72000 },
    } } };
    localStorage.setItem('klc.play.v1', JSON.stringify(state));
    return 1;
  })()`);
  await boot('race', 'yoru');
  await page.eval(`(() => {
    window.__bed = []; window.__bedDt = 0.2; window.__playSim = 0; window.__raceSamples = ${JSON.stringify(course.samples)};
    document.body.classList.add('playing');
    for (const code of ['KeyW']) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    return 1;
  })()`);
  const raceDir = join(out, 'race-frames');
  rmSync(raceDir, { recursive: true, force: true });
  mkdirSync(raceDir, { recursive: true });
  const step = 0.2;
  const cap = Math.round(130 / step);
  let frames = 0;
  let held = '';
  let lap2 = 0;
  for (let i = 1; i <= cap; i++) {
    const t = +(i * step).toFixed(3);
    const row = await page.eval(`(() => {
      window.__simTo(${t}); window.__playSim = ${t};
      const d = window.__explore.drive;
      const s = d.state;
      const samples = window.__raceSamples;
      const n = samples.length;
      let idx = 0, best = 1e9;
      const from = window.__ri || 0;
      for (let k = 0; k < 16; k++) {
        const j = (from + k) % n;
        const dist = Math.hypot(samples[j][0] - s.x, samples[j][1] - s.z);
        if (dist < best) { best = dist; idx = j; }
      }
      const phase = window.__playCar.race.phase;
      const stuck = phase === 'run' && window.__px === s.x && window.__pz === s.z;
      let placed = false;
      if (phase === 'run' && (best > 4 || stuck || s.speed < 3)) {
        const hop = (idx + (stuck ? 1 : 0)) % n;
        const p = samples[hop];
        const n1 = samples[(hop + 1) % n];
        s.x = p[0]; s.z = p[1];
        s.yaw = Math.atan2(-(n1[0] - p[0]), -(n1[1] - p[1]));
        s.speed = 18; s.u = 18;
        idx = hop;
        placed = true;
      }
      if (placed) d.place(0);
      window.__ri = idx;
      window.__px = s.x; window.__pz = s.z;
      const ahead = samples[(idx + 2) % n];
      const wantYaw = Math.atan2(-(ahead[0] - s.x), -(ahead[1] - s.z));
      const err = Math.atan2(Math.sin(wantYaw - s.yaw), Math.cos(wantYaw - s.yaw));
      const want = ['KeyW', 'ShiftLeft'];
      if (err < -0.12) want.push('KeyA');
      if (err > 0.12) want.push('KeyD');
      const next = want.join(',');
      if (next !== window.__held) {
        for (const code of (window.__held || '').split(',').filter(Boolean)) {
          if (!want.includes(code)) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        }
        for (const code of want) {
          if (!(window.__held || '').split(',').includes(code)) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        }
        window.__held = next;
      }
      const rec = [Math.round(s.rpm || 0), +s.speed.toFixed(2), +((s.slipR || 0).toFixed(3)), s.shift ? 1 : 0, 1, s.skid ? 1 : 0];
      window.__bed.push(rec);
      const lap = document.querySelector('#klc-car .lap')?.textContent || '';
      return { phase, speed: rec[1], x: +s.x.toFixed(0), z: +s.z.toFixed(0), best: +best.toFixed(1), lap };
    })()`);
    frames = i;
    held = row.phase;
    if (i % 15 === 0) console.log('race', i, JSON.stringify(row));
    const { data } = await page.S('Page.captureScreenshot', { format: 'jpeg', quality: 68 });
    writeFileSync(join(raceDir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(data, 'base64'));
    if (row.phase === 'idle' && i > 20) break;
    if (t >= Number(arg('seconds', '12'))) break;
    if (row.lap && row.lap.includes('2/') && i > 40) { lap2++; if (lap2 > 8) break; }
  }
  console.log('race frames', frames, 'phase', held);
  await mux(raceDir, join(out, 'race.mp4'));
  }
} finally {
  await browser.close();
  srv.stop();
}
