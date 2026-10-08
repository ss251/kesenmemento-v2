// Round 2: two real clients in the town, one room, on 港町.
// WebKit (no Chrome lock). The relay is local. Leaves nothing running.
//
//   env -u NODE_OPTIONS bun src/anime/play/multi/town-shots.mjs
//   env -u NODE_OPTIONS bun src/anime/play/multi/town-shots.mjs --nobuild 1

import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { build, serve, ROOT } from '../../../../tools/anime/cdp.mjs';
import { open } from '../../../../tools/perf/wk/wkc.mjs';
import { startServer } from '../../../../server/multi/index.js';
import { taiko, goCue, marimba } from '../kit/voices.js';

const WEB = 9506;
const RELAY = 9505;
const OUT = join(ROOT, 'docs/play/shots/play-multi');
const RESEARCH = join(ROOT, 'dist/play-multi-shots');   // a second copy of the shots (the project's research notes keep one outside this repository)
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf('--' + k);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d;
};
const log = (...a) => console.error('[town]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
mkdirSync(RESEARCH, { recursive: true });

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}

const dist = join(ROOT, 'dist/anime-9506');
if (arg('nobuild') !== '1') log('build', JSON.stringify(await build({ outdir: dist, quiet: true })));
const web = serve({ port: WEB, dist });
const relay = startServer({ port: RELAY, hostname: '127.0.0.1', allow: null });

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 300));
  try { copyFileSync(file, join(RESEARCH, file.slice(file.lastIndexOf('/') + 1))); } catch (e) { log('copy', e.message); }
  log('saved', file.slice(file.lastIndexOf('/') + 1));
}

function session(name, w, h, { dsf = null, q = 'high', extra = '' } = {}) {
  const workdir = join(ROOT, 'dist/perf/wk-town-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${web.url}index.html?shot=1&w=${w}&h=${h}&q=${q}${extra}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  let sim = 0;
  return {
    wk,
    url,
    async ready() {
      const r = await wk.ready(420);
      log(name, 'ready', r.ms);
      return r;
    },
    async advance(sec) {
      sim += sec;
      return wk.eval(`window.__simTo(${sim}); return ${sim}`);
    },
    async shot(file, width) {
      await wk.eval('window.__raf.step(16); return 1');
      const png = file.endsWith('.png') ? file : file + '.png';
      await wk.page(png);
      jpg(png, png.replace(/\.png$/, '.jpg'), width);
    },
    async close() {
      try { await wk.quit(); } catch { /* */ }
      try { proc.kill(9); } catch { /* */ }
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

const YAW = 2.3825;
// The course start faces the far card. The opposite heading looks back along 港町 into the town.
const FACE = YAW + Math.PI;
function spot(ahead, side, yaw = FACE) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  return {
    x: 102.38 + fx * ahead + rx * side,
    z: 111.29 + fz * ahead + rz * side,
    yaw,
  };
}

async function arm(page) {
  await page.wk.eval(`document.body.classList.add('playing'); try { window.__ctx.audio.start(); } catch (e) {} return window.__ctx.audio.ready ? 'audio' : 'silent'`);
}

async function driveAt(page, ahead, side, color) {
  const p = spot(ahead, side);
  const info = await page.wk.eval(`
    const d = window.__ctx.services.explore.drive;
    ${color ? `d.setLook({ color: '${color}', paint: 'ai' });` : ''}
    const ok = d.enter({ x: ${p.x}, z: ${p.z}, yaw: ${p.yaw} });
    try { window.__ctx.services.multi.close(); } catch (e) {}
    const s = d.state || {};
    return JSON.stringify({ ok, x: s.x, z: s.z, y: s.y, yaw: s.yaw, active: d.active, kind: window.__multiKind || null });
  `);
  log('drive', info);
  return JSON.parse(info);
}

async function settle(page) {
  const info = await page.wk.eval(`
    const ex = window.__ctx.services.explore;
    const d = ex.drive;
    d.place(0);
    const s = d.state;
    const cam = window.__ctx.camera.position;
    ex.stream.settle(s.x, s.z, 'ground');
    d.place(0);
    window.__raf.step(3);
    const sum = ex.stream.summary();
    return JSON.stringify({
      camY: +cam.y.toFixed(2), x: +s.x.toFixed(1), z: +s.z.toFixed(1),
      l0: sum.l0, l1: sum.l1, far: sum.farHidden, built: sum.built,
      fail: sum.failures, pending: sum.pending
    });
  `);
  log('settle', info);
}

async function cruise(page, sec) {
  await page.wk.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })); return 1`);
  await page.advance(sec);
  await page.wk.eval(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })); return 1`);
}

const pages = [];
try {
  const phone = session('phone', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=ja' });
  pages.push(phone);
  await phone.ready();
  log('audio', await arm(phone));
  await phone.wk.eval(`
    window.__ctx.services.multi.open();
    document.querySelector('#klc-multi [data-act="create"]').click();
    return 1;
  `);
  let code = '';
  for (let i = 0; i < 50 && !/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code); i++) {
    code = await phone.wk.eval(`return (document.querySelector('#klc-multi [data-f="code"]')?.textContent || '').trim()`);
    if (!/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code)) await sleep(200);
  }
  if (!/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code)) {
    const err = await phone.wk.eval(`return (document.querySelector('#klc-multi [data-f="err"]')?.textContent || '') + ' | ' + JSON.stringify((window.__console||[]).slice(-8))`);
    throw new Error('no room: ' + code + ' ' + err);
  }
  log('room', code);

  const desk = session('desk', 1600, 900, { extra: '&lang=ja#room=' + code });
  pages.push(desk);
  await desk.ready();
  log('desk audio', await arm(desk));
  let peers = 0;
  for (let i = 0; i < 40 && peers < 1; i++) {
    peers = await desk.wk.eval(`return window.__ctx.services.multi.peers.size`);
    if (peers < 1) await sleep(200);
  }
  log('peers', peers);

  // The phone follows. Its chase camera looks forward at the desktop's van.
  const follow = await driveAt(phone, 0, 0, '#165E83');
  const lead = await driveAt(desk, 8, 0);
  await settle(phone);
  await settle(desk);
  await cruise(phone, 1.2);
  await cruise(desk, 1.2);
  await phone.advance(0.35);
  await desk.advance(0.35);
  await phone.wk.eval(`
    const d = window.__ctx.services.explore.drive;
    d.lookOrbit(0.22, -0.05, 80);
    d.place(0);
    return 1;
  `);
  await desk.wk.eval(`
    const d = window.__ctx.services.explore.drive;
    d.lookOrbit(-0.2, -0.04, 80);
    d.place(0);
    return 1;
  `);
  const seen = await phone.wk.eval(`
    window.__raf.step(1);
    const tags = [];
    document.querySelectorAll('#klc-multi .tag').forEach((el) => { if (!el.hidden) tags.push(el.textContent); });
    const people = document.querySelector('#klc-multi .people')?.textContent || '';
    const cost = window.__playCost ? window.__playCost() : null;
    return JSON.stringify({ tags, people, cost });
  `);
  log('seen', seen);
  await phone.shot(join(OUT, 'town-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'town-desktop-ja.png'));
  if (arg('peek') === '1') log('peek');
  else {

  await desk.wk.eval(`document.querySelector('#klc-multi [data-s="1"]').click(); return 1`);
  await desk.advance(0.25);
  await phone.advance(0.25);
  await phone.shot(join(OUT, 'town-stamp-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'town-stamp-ja.png'));

  const started = await phone.wk.eval(`return window.__ctx.services.multi.startTogether('car') ? 'started' : 'no'`);
  log('race', started);
  await sleep(350);
  await phone.advance(0.3);
  await desk.advance(0.3);
  const count = await desk.wk.eval(`return document.querySelector('#klc-play .count')?.textContent || ''`);
  log('count', count);
  const face = FACE;
  const reframe = `
    const d = window.__ctx.services.explore.drive;
    if (d && d.state) d.state.yaw = ${face};
    d.lookOrbit(0.22, -0.05, 80);
    d.place(0);
    return 1;
  `;
  await phone.wk.eval(reframe);
  await desk.wk.eval(reframe);
  await phone.shot(join(OUT, 'town-count-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'town-count-ja.png'));
  await phone.advance(3.2);
  await desk.advance(3.2);
  await sleep(2800);
  await desk.wk.eval(`
    const go = window.__ctx.services.multi.goAt || Date.now();
    const ms = Math.max(0, Date.now() - go);
    window.__ctx.services.multi.finishTogether(ms);
    return ms;
  `);
  await phone.wk.eval(`
    const go = window.__ctx.services.multi.goAt || Date.now();
    const ms = Math.max(0, Date.now() - go + 900);
    window.__ctx.services.multi.finishTogether(ms);
    return ms;
  `);
  await sleep(400);
  await phone.wk.eval(reframe);
  await desk.wk.eval(reframe);
  await desk.advance(0.05);
  const board = await desk.wk.eval(`return document.querySelector('#klc-play .extra')?.innerText || ''`);
  log('board', board.slice(0, 240));
  await desk.wk.eval('window.__raf.step(2); return 1');
  await phone.wk.eval('window.__raf.step(2); return 1');
  await sleep(450);
  await desk.shot(join(OUT, 'town-board-ja.png'));
  await phone.shot(join(OUT, 'town-board-phone-ja.png'), 1179);

  await desk.wk.eval(`document.querySelector('[data-act="lang"]')?.click(); window.__ctx.services.multi.setLang('en'); return document.documentElement.lang`);
  await phone.wk.eval(`document.querySelector('[data-act="lang"]')?.click(); window.__ctx.services.multi.setLang('en'); return 1`);
  await phone.wk.eval(reframe);
  await desk.wk.eval(reframe);
  await desk.shot(join(OUT, 'town-desktop-en.png'));
  await phone.shot(join(OUT, 'town-phone-en.png'), 1179);
  await desk.shot(join(OUT, 'town-board-en.png'));

  const frames = join(OUT, 'town-frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  for (let i = 0; i < 16; i++) {
    await desk.advance(0.12);
    await desk.wk.eval(`
      if (${i} === 0) { try { window.__ctx.audio.start(); } catch (e) {} }
      window.__raf.step(1);
      return 1;
    `);
    await desk.wk.page(join(frames, String(i).padStart(2, '0') + '.png'));
  }
  const sr = 44100;
  const dur = 16 / 8;
  const pcm = new Float32Array(Math.ceil(sr * dur));
  const mix = (cue, at, gain) => {
    const i0 = Math.floor(at * sr);
    for (let i = 0; i < cue.length && i0 + i < pcm.length; i++) pcm[i0 + i] += cue[i] * gain;
  };
  mix(taiko(sr), 0.15, 0.55);
  mix(taiko(sr), 0.87, 0.55);
  mix(goCue(sr), 1.55, 0.7);
  mix(marimba(sr, 880, 0.35), 0.4, 0.45);
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length * 2, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24);
  wav.writeUInt32LE(sr * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, pcm[i] * 32767)), 44 + i * 2);
  const wavPath = join(frames, 'town.wav');
  writeFileSync(wavPath, wav);
  const mp4 = join(OUT, 'town.mp4');
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', '8', '-i', join(frames, '%02d.png'), '-i', wavPath, '-shortest', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', mp4]);
  if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(0, 500));
  else {
    try { copyFileSync(mp4, join(RESEARCH, 'town.mp4')); } catch { /* */ }
    log('saved', 'town.mp4');
  }
  rmSync(frames, { recursive: true, force: true });

  const cost = await desk.wk.eval(`return JSON.stringify(window.__playCost ? window.__playCost() : null)`);
  writeFileSync(join(OUT, 'town.json'), JSON.stringify({ code, seen, count, board, cost, lead, follow }, null, 2));
  try { copyFileSync(join(OUT, 'town.json'), join(RESEARCH, 'town.json')); } catch { /* */ }
  log('done', cost);
  }
} finally {
  for (const p of pages) { try { await p.close(); } catch { /* */ } }
  try { relay.stop(); } catch { /* */ }
  try { web.stop(); } catch { /* */ }
  log('stopped');
}
