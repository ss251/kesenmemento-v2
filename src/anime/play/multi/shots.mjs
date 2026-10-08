// First shots and the two-page proof for 「みんなであそぶ」.
// Headless Chrome, only through the gate:
//   tools/anime/gate.sh chrome --fg env -u NODE_OPTIONS bun src/anime/play/multi/shots.mjs
// Leaves nothing running. Writes JPGs and a short video into docs/play/shots/play-multi.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch } from '../../../../tools/anime/cdp.mjs';
import { startServer } from '../../../../server/multi/index.js';
import { taiko, goCue, marimba, fanfare } from '../kit/voices.js';

const ROOT = new URL('../../../../', import.meta.url).pathname;
const OUT = join(ROOT, 'docs/play/shots/play-multi');
const RESEARCH = join(ROOT, 'dist/play-multi-shots');   // a second copy of the shots (the project's research notes keep one outside this repository)
const WS_PORT = 9505;
const WEB_PORT = 9506;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serveFiles() {
  return Bun.serve({
    port: WEB_PORT,
    hostname: '127.0.0.1',
    async fetch(req) {
      const u = new URL(req.url);
      const rel = decodeURIComponent(u.pathname);
      if (rel === '/favicon.ico') return new Response(null, { status: 204 });
      if (rel.includes('..')) return new Response('no', { status: 400 });
      const file = Bun.file(ROOT + rel);
      if (!(await file.exists())) return new Response('no', { status: 404 });
      // Chrome loads `import x from './a.json'` only as a JavaScript module.
      if (rel.endsWith('.json')) {
        const text = await file.text();
        return new Response('export default ' + text + '\n', { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
        return new Response(file, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return new Response(file);
    },
  });
}

function jpg(png, dest) {
  const r = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '62', png, '--out', dest]);
  if (r.status !== 0) throw new Error(r.stderr?.toString() || 'sips');
  rmSync(png, { force: true });
}

function wav(samples, sr) {
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

function mixAt(out, cue, at, sr, gain) {
  const i0 = Math.floor(at * sr);
  for (let i = 0; i < cue.length && i0 + i < out.length; i++) out[i0 + i] += cue[i] * gain;
}

const relay = startServer({ port: WS_PORT, hostname: '127.0.0.1', allow: null });
const web = serveFiles();
let browser = await launch({ quiet: true });
const framesDir = join(OUT, 'frames');
mkdirSync(OUT, { recursive: true });
mkdirSync(framesDir, { recursive: true });

const shots = [];
let shotPage = null;
async function pageOf(w, h, dpr) {
  if (!shotPage) shotPage = await browser.page({ width: w, height: h, dpr });
  else await shotPage.S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false, screenWidth: w, screenHeight: h });
  return shotPage;
}
async function openProof(page, search) {
  await page.goto(`http://127.0.0.1:${WEB_PORT}/src/anime/play/multi/proof.html${search}`);
  try {
    await page.waitFor('window.__ready === true', { timeout: 15000 });
  } catch (e) {
    const info = await page.eval('JSON.stringify({ href: location.href, ready: window.__ready, errors: window.__errors || [], text: document.body && document.body.innerText.slice(0, 400) })').catch((err) => String(err));
    console.error('PAGE', info);
    console.error('LOGS', JSON.stringify(page.errors()));
    throw e;
  }
  await page.frames(4);
}

try {
  const views = process.env.PROOF_ONLY === '1' ? [] : [
    ['phone-ja', 393, 852, 3, '?lang=ja&shot=1', false],
    ['phone-en', 393, 852, 3, '?lang=en&shot=1', false],
    ['phone-landscape-ja', 852, 393, 3, '?lang=ja&shot=1', false],
    ['desktop-ja', 1600, 900, 1, '?lang=ja&shot=1', false],
    ['desktop-en', 1600, 900, 1, '?lang=en&shot=1', false],
    ['desktop-retina-ja', 1600, 900, 2, '?lang=ja&shot=1', false],
    ['desktop-night-ja', 1600, 900, 1, '?lang=ja&shot=1&night=1', false],
  ];
  for (const [name, w, h, dpr, search] of views) {
    const page = await pageOf(w, h, dpr);
    await openProof(page, search);
    const png = join(OUT, name + '.png');
    await page.shot(png);
    const errs = page.errors();
    if (errs.length) console.error(name, errs.map((e) => e.text).join('\n'));
    jpg(png, join(OUT, name + '.jpg'));
    shots.push(name + '.jpg');
    console.error('shot', name);
  }

  if (process.env.PROOF_ONLY !== '1') {
    const still = await pageOf(1600, 900, 1);
    await still.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await openProof(still, '?lang=ja&shot=1');
    const stillPng = join(OUT, 'desktop-reduced-ja.png');
    await still.shot(stillPng);
    jpg(stillPng, join(OUT, 'desktop-reduced-ja.jpg'));
    shots.push('desktop-reduced-ja.jpg');
    console.error('shot', 'desktop-reduced-ja');
  }

  const a = await pageOf(1600, 900, 1);
  await a.S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  console.error('proof', 'open-a');
  await openProof(a, '?lang=ja&shot=1');
  const code = await a.eval('window.__proof.code');
  console.error('proof', 'code', code);
  if (!/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code)) throw new Error('bad code ' + code);
  console.error('proof', 'open-b');
  const b = await browser.page({ width: 393, height: 852, dpr: 2 });
  await openProof(b, `?lang=ja#room=${code}`);
  console.error('proof', 'joined');
  await a.eval(`addEventListener('klc-multi-race', (e) => { window.__go = e.detail.go; }); window.__go = 0;`);
  await b.eval(`addEventListener('klc-multi-race', (e) => { window.__go = e.detail.go; }); window.__go = 0;`);
  await b.eval('window.__hero.x = -1.2; window.__hero.z = 0.4; window.__hero.yaw = Math.PI; window.__hero.mode = "car";');
  await sleep(700);
  let seen = await a.eval('window.__proof.peers()');
  if (!seen.length) {
    await sleep(500);
    seen = await a.eval('window.__proof.peers()');
  }
  if (!seen.length) throw new Error('page A never saw page B');
  console.error('proof', 'seen', JSON.stringify(seen));
  console.error('proof', 'shift');
  await b.eval('window.__hero.x = 1.6');
  console.error('proof', 'shifted');
  await sleep(700);
  const moved = await a.eval('window.__proof.peers()');
  console.error('proof', 'peers', JSON.stringify(moved));
  if (!(moved[0] && moved[0].x > seen[0].x)) throw new Error('friend did not move ' + JSON.stringify({ seen, moved }));
  await a.eval('window.__multi.close()');
  await sleep(80);
  const worldPng = join(OUT, 'desktop-world-ja.png');
  await a.shot(worldPng);
  jpg(worldPng, join(OUT, 'desktop-world-ja.jpg'));
  shots.push('desktop-world-ja.jpg');
  const worldFrame = join(framesDir, '00-world.png');
  await a.shot(worldFrame);

  console.error('proof', 'moved', JSON.stringify(moved));
  await a.eval('window.__multi.startTogether("car")');
  console.error('proof', 'race');
  async function waitCount(want) {
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const c = await a.eval('window.__proof.count');
      if (c === want) return;
      await sleep(40);
    }
    throw new Error('countdown never showed ' + want);
  }
  const seq = [];
  async function grab(id) {
    const png = join(framesDir, id + '.png');
    await a.shot(png);
    seq.push(png);
  }
  await waitCount('3');
  const goA = await a.eval('window.__go');
  const goB = await b.eval('window.__go');
  if (!goA || goA !== goB) throw new Error('go mismatch ' + goA + ' ' + goB);
  await grab('03');
  const three = join(OUT, 'desktop-count-ja.png');
  await a.shot(three);
  jpg(three, join(OUT, 'desktop-count-ja.jpg'));
  shots.push('desktop-count-ja.jpg');
  await waitCount('2');
  await grab('02');
  await waitCount('1');
  await grab('01');
  await waitCount('GO!');
  await grab('go');
  await a.eval('window.__multi.finishTogether(800)');
  await sleep(350);
  await grab('board');
  seq.unshift(worldFrame);
  await b.eval('document.querySelector("#klc-multi [data-act=\\"leave\\"]")?.click()');
  await sleep(400);
  const left = await a.eval('window.__proof.peers().length');
  if (left !== 0) throw new Error('leave left ' + left);

  const sr = 44100;
  const dur = seq.length * 0.85;
  const mix = new Float32Array(Math.ceil((dur + 0.4) * sr));
  const cues = [
    [marimba(sr), 0.1, 0.5],
    [taiko(sr), 0.85, 0.7],
    [taiko(sr), 1.7, 0.7],
    [taiko(sr), 2.55, 0.7],
    [goCue(sr), 3.4, 0.55],
    [fanfare(sr), 4.25, 0.5],
  ];
  for (let i = 0; i < cues.length; i++) mixAt(mix, cues[i][0], cues[i][1], sr, cues[i][2]);
  const wavPath = join(framesDir, 'sound.wav');
  writeFileSync(wavPath, wav(mix, sr));
  const list = seq.map((p) => `file '${p}'\nduration 0.85`).join('\n') + `\nfile '${seq[seq.length - 1]}'\n`;
  const listPath = join(framesDir, 'list.txt');
  writeFileSync(listPath, list);
  const mp4 = join(OUT, 'together.mp4');
  const ff = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-i', wavPath, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error((ff.stderr || '').slice(-1500) || 'ffmpeg');
  shots.push('together.mp4');

  const note = { code, go: goA, moved: { from: seen[0].x, to: moved[0].x }, shots };
  writeFileSync(join(OUT, 'proof.json'), JSON.stringify(note, null, 2));
  try {
    if (RESEARCH !== OUT) {
      mkdirSync(RESEARCH, { recursive: true });
      for (const name of shots) {
        const bin = await Bun.file(join(OUT, name)).arrayBuffer();
        writeFileSync(join(RESEARCH, name), Buffer.from(bin));
      }
      writeFileSync(join(RESEARCH, 'proof.json'), JSON.stringify(note, null, 2));
    }
  } catch (e) { console.error('research copy skipped', e.message); }
  console.log(JSON.stringify(note));
} finally {
  try { await browser.close(); } catch { /* */ }
  try { relay.stop(); } catch { /* */ }
  try { web.stop(true); } catch { /* */ }
  rmSync(framesDir, { recursive: true, force: true });
}
