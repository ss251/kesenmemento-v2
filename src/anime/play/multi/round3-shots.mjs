// Round 3: hub card, lobby, countdown, results. Phone 393×852 @3 and desktop 1440×900, ja and en.
// WebKit only. The relay is local. Leaves nothing running.
//
//   env -u NODE_OPTIONS bun src/anime/play/multi/round3-shots.mjs

import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { build, serve, ROOT } from '../../../../tools/anime/cdp.mjs';
import { open } from '../../../../tools/perf/wk/wkc.mjs';
import { startServer } from '../../../../server/multi/index.js';
import { taiko, goCue, marimba } from '../kit/voices.js';

const WEB = 9506;
const RELAY = 9505;
const OUT = join(ROOT, 'docs/play/shots/play-multi');
const RESEARCH = join(ROOT, 'dist/play-multi-shots');   // a second copy of the shots (the project's research notes keep one outside this repository)
const log = (...a) => console.error('[r3]', ...a);
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
log('build', JSON.stringify(await build({ outdir: dist, quiet: true })));
const web = serve({ port: WEB, dist });
const relay = startServer({ port: RELAY, hostname: '127.0.0.1', allow: null });

function keep(file) {
  try { copyFileSync(file, join(RESEARCH, file.slice(file.lastIndexOf('/') + 1))); } catch (e) { log('copy', e.message); }
}

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '60'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 300));
  keep(file);
  log('saved', file.slice(file.lastIndexOf('/') + 1), statSync(file).size);
}

function session(name, w, h, { dsf = null, q = 'high', extra = '' } = {}) {
  const workdir = join(ROOT, 'dist/perf/wk-r3-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${web.url}index.html?shot=1&perf=1&w=${w}&h=${h}&q=${q}${extra}`;
  const env = { ...process.env };
  if (dsf) env.KLC_DSF = String(dsf);
  const proc = Bun.spawn([BIN, url, workdir, String(w), String(h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  let sim = 0;
  return {
    wk,
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
      let last = null;
      for (let i = 0; i < 3; i++) {
        try { await wk.page(png); last = null; break; }
        catch (e) { last = e; log('page retry', i, String(e.message || e).slice(0, 180)); await sleep(500); }
      }
      if (last) throw last;
      jpg(png, png.replace(/\.png$/, '.jpg'), width);
    },
    async png(file) {
      await wk.eval('window.__raf.step(8); return 1');
      let last = null;
      for (let i = 0; i < 3; i++) {
        try { await wk.page(file); last = null; break; }
        catch (e) { last = e; log('page retry', i, String(e.message || e).slice(0, 180)); await sleep(500); }
      }
      if (last) throw last;
    },
    async close() {
      try { await wk.quit(); } catch { /* */ }
      try { proc.kill(9); } catch { /* */ }
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

const YAW = 2.3825;
const FACE = YAW + Math.PI;
function spot(ahead, side, yaw = FACE) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  return { x: 102.38 + fx * ahead + rx * side, z: 111.29 + fz * ahead + rz * side, yaw };
}

async function arm(page) {
  return page.wk.eval(`try { localStorage.removeItem('klc.multi.coach'); } catch (e) {} document.body.classList.add('playing'); try { window.__ctx.audio.start(); } catch (e) {} return window.__ctx.audio.ready ? 'audio' : 'silent'`);
}

async function driveAt(page, ahead, side, color) {
  const p = spot(ahead, side);
  const info = await page.wk.eval(`
    const d = window.__ctx.services.explore.drive;
    ${color ? `d.setLook({ color: '${color}', paint: 'ai' });` : ''}
    const ok = d.enter({ x: ${p.x}, z: ${p.z}, yaw: ${p.yaw} });
    const s = d.state || {};
    return JSON.stringify({ ok, x: s.x, z: s.z, yaw: s.yaw, active: d.active });
  `);
  log('drive', info);
}

async function settle(page) {
  await page.wk.eval(`
    const ex = window.__ctx.services.explore;
    const d = ex.drive;
    d.place(0);
    const s = d.state;
    ex.stream.settle(s.x, s.z, 'ground');
    d.place(0);
    window.__raf.step(3);
    return 1;
  `);
}

async function veil(page, hide) {
  await page.wk.eval(`
    const on = ${hide ? 'true' : 'false'};
    const sels = ['#klc-play', '#klc-multi', '.swim-become', '.swim-chip', '.swim-dive', '#course-quit', '#klc-pad'];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el) => { el.style.visibility = on ? 'hidden' : ''; });
    }
    return 1;
  `);
}

async function waitCode(page) {
  let code = '';
  for (let i = 0; i < 50; i++) {
    code = String(await page.wk.eval(`return document.querySelector('#klc-multi [data-f="code"]')?.dataset?.code || ''`));
    if (/^[ACDEFHJKMNPQRTUVWXY3479]{4}$/.test(code)) return code;
    await sleep(200);
  }
  throw new Error('no room ' + code);
}

async function waitCoach(page) {
  for (let i = 0; i < 50; i++) {
    const n = Number(await page.wk.eval(`
      const el = document.querySelector('#klc-multi [data-f="coach"]');
      if (!el || el.hidden) return -1;
      const full = el.dataset.full || '';
      return full && el.textContent === full ? full.length : 0;
    `));
    if (n > 0 || n === -1) return n;
    await sleep(60);
  }
  return 0;
}

async function showHub(page, art) {
  const src = JSON.stringify(art || '');
  const title = await page.wk.eval(`
    const dialog = document.querySelector('#klc-multi .dialog');
    if (dialog) dialog.style.visibility = 'hidden';
    window.__ctx.services.multi.showCard();
    const hub = document.querySelector('#klc-multi [data-f="hub"]');
    if (hub) { hub.hidden = false; hub.classList.add('show'); hub.style.opacity = '1'; }
    const tags = document.querySelector('#klc-multi .tags');
    if (tags) tags.style.visibility = 'hidden';
    const img = document.querySelector('#klc-multi .mode-card img');
    const art = ${src};
    if (img && art) { img.hidden = false; img.src = art; }
    return document.querySelector('#klc-multi .mode-card h3')?.textContent || '';
  `);
  await sleep(300);
  return title;
}

function writeArt(png) {
  const cropped = png.replace(/\.png$/, '-crop.png');
  const crop = Bun.spawnSync(['sips', '--cropToHeightWidth', '680', '1088', '--cropOffset', '180', '176', png, '--out', cropped]);
  if (crop.exitCode !== 0) log('crop', crop.stderr.toString().slice(0, 200));
  const src = existsSync(cropped) ? cropped : png;
  const webp = join(OUT, 'card.webp');
  let q = 68;
  let size = 1e9;
  for (; q >= 40 && size > 40000; q -= 8) {
    const r = Bun.spawnSync(['cwebp', '-q', String(q), '-resize', '640', '0', src, '-o', webp]);
    if (r.exitCode !== 0) throw new Error('cwebp ' + r.stderr.toString().slice(0, 300));
    size = statSync(webp).size;
    log('webp', q, size);
  }
  const b64 = readFileSync(webp).toString('base64');
  const js = `// 港町, two vans. Captured in the town. WebP data URL, under 40 KB.\nexport const ART = ${JSON.stringify('data:image/webp;base64,' + b64)};\n`;
  writeFileSync(join(ROOT, 'src/anime/play/multi/card-art.js'), js);
  keep(webp);
  rmSync(png, { force: true });
  rmSync(cropped, { force: true });
  return 'data:image/webp;base64,' + b64;
}

const pages = [];
try {
  const phone = session('phone', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=ja' });
  pages.push(phone);
  await phone.ready();
  log('audio', await arm(phone));
  await phone.advance(0.6);
  await phone.wk.eval(`
    window.__ctx.services.multi.open();
    document.querySelector('#klc-multi [data-act="create"]').click();
    return 1;
  `);
  const code = await waitCode(phone);
  const coachN = await waitCoach(phone);
  log('room', code, 'coach', coachN);
  if (coachN < 1) throw new Error('coach did not show');

  const desk = session('desk', 1440, 900, { extra: '&lang=ja#room=' + code });
  pages.push(desk);
  const deskReady = desk.ready();
  for (;;) {
    const winner = await Promise.race([
      deskReady.then(() => 'ready', (e) => { throw e; }),
      sleep(3000).then(() => 'ping'),
    ]);
    if (winner === 'ready') break;
    try { await phone.wk.eval('return 1'); } catch (e) { log('phone ping', e.message); }
  }
  log('desk audio', await arm(desk));
  await desk.advance(0.6);
  let peers = 0;
  for (let i = 0; i < 40 && peers < 1; i++) {
    peers = Number(await desk.wk.eval(`return window.__ctx.services.multi.peers.size`));
    if (peers < 1) await sleep(200);
  }
  log('peers', peers, 'desk coach', await waitCoach(desk));
  await phone.shot(join(OUT, 'r3-lobby-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'r3-lobby-desk-ja.png'));

  await phone.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await desk.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await waitCoach(phone);
  await waitCoach(desk);
  await phone.shot(join(OUT, 'r3-lobby-phone-en.png'), 1179);
  await desk.shot(join(OUT, 'r3-lobby-desk-en.png'));
  await phone.wk.eval(`return window.__ctx.services.multi.setLang('ja')`);
  await desk.wk.eval(`return window.__ctx.services.multi.setLang('ja')`);

  await veil(phone, true);
  await veil(desk, true);
  await driveAt(phone, 5.5, 2.4, '#165E83');
  await driveAt(desk, 0, -1.2);
  await settle(phone);
  await settle(desk);
  await phone.advance(1.4);
  await desk.advance(1.4);
  const seen = await desk.wk.eval(`
    const tags = [];
    document.querySelectorAll('#klc-multi .tag').forEach((el) => tags.push(el.textContent + (el.hidden ? '' : '*') ));
    const d = window.__ctx.services.explore.drive;
    d.lookOrbit(0.35, -0.08, 30);
    d.place(0);
    return JSON.stringify({ tags, x: d.state && d.state.x, z: d.state && d.state.z });
  `);
  log('card-seen', seen);
  await desk.advance(0.3);
  const raw = join(OUT, 'card-raw.png');
  await desk.png(raw);
  const art = writeArt(raw);
  await veil(phone, false);
  await veil(desk, false);
  let idle = { n: 0, sum: 0, max: 0 };
  for (let i = 0; i < 30; i++) {
    const ms = Number(await phone.wk.eval(`window.__raf.step(1); return window.__ctx.services.multi.frameMs || 0`));
    if (ms > 0) { idle.n++; idle.sum += ms; if (ms > idle.max) idle.max = ms; }
  }
  log('idle-frame', idle.n ? (idle.sum / idle.n).toFixed(3) : 0, idle.max);

  log('hub', await showHub(phone, art), await showHub(desk, art));
  await phone.shot(join(OUT, 'r3-hub-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'r3-hub-desk-ja.png'));
  await phone.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await desk.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await showHub(phone, art);
  await showHub(desk, art);
  await phone.shot(join(OUT, 'r3-hub-phone-en.png'), 1179);
  await desk.shot(join(OUT, 'r3-hub-desk-en.png'));
  await phone.wk.eval(`window.__ctx.services.multi.hideCard(); return window.__ctx.services.multi.setLang('ja')`);
  await desk.wk.eval(`window.__ctx.services.multi.hideCard(); return window.__ctx.services.multi.setLang('ja')`);

  await phone.wk.eval(`window.__ctx.services.multi.close(); return 1`);
  await desk.wk.eval(`window.__ctx.services.multi.close(); return 1`);
  await phone.shot(join(OUT, 'r3-start-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'r3-start-desk-ja.png'));

  const face = `
    const d = window.__ctx.services.explore.drive;
    if (d && d.state) d.state.yaw = ${FACE};
    d.lookOrbit(0.22, -0.05, 90);
    d.place(0);
    return 1;
  `;
  const started = await phone.wk.eval(`return window.__ctx.services.multi.startTogether('car') ? 'started' : 'no'`);
  log('race', started);
  await phone.wk.eval(face);
  await desk.wk.eval(face);
  await phone.shot(join(OUT, 'r3-count-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'r3-count-desk-ja.png'));

  const frames = join(OUT, 'r3-frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames);
  for (let i = 0; i < 10; i++) {
    await sleep(260);
    await desk.advance(0.05);
    await desk.wk.eval('window.__raf.step(1); return 1');
    await desk.wk.page(join(frames, String(i).padStart(2, '0') + '.png'));
  }

  async function finish(page, bias) {
    return page.wk.eval(`
      const go = window.__ctx.services.multi.goAt || Date.now();
      const base = Math.max(0, Date.now() - go);
      const ms = Math.max(0, base + ${bias});
      window.__ctx.services.multi.finishTogether(ms);
      return ms;
    `);
  }
  log('fin', await finish(phone, -150), await finish(desk, 700));
  await sleep(1200);
  await phone.wk.eval(face);
  await desk.wk.eval(face);
  await phone.shot(join(OUT, 'r3-board-phone-ja.png'), 1179);
  await desk.shot(join(OUT, 'r3-board-desk-ja.png'));

  await phone.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await desk.wk.eval(`return window.__ctx.services.multi.setLang('en')`);
  await sleep(1200);
  await phone.shot(join(OUT, 'r3-board-phone-en.png'), 1179);
  await desk.shot(join(OUT, 'r3-board-desk-en.png'));

  await phone.wk.eval(`return window.__ctx.services.multi.startTogether('car') ? 1 : 0`);
  await sleep(180);
  await phone.wk.eval(face);
  await desk.wk.eval(face);
  await phone.shot(join(OUT, 'r3-count-phone-en.png'), 1179);
  await desk.shot(join(OUT, 'r3-count-desk-en.png'));

  let cost = { n: 0, sum: 0, max: 0 };
  for (let i = 0; i < 40; i++) {
    const ms = Number(await phone.wk.eval(`window.__raf.step(1); return window.__ctx.services.multi.frameMs || 0`));
    if (ms > 0) { cost.n++; cost.sum += ms; if (ms > cost.max) cost.max = ms; }
  }
  const play = await phone.wk.eval(`return JSON.stringify(window.__playCost ? window.__playCost() : null)`);
  const mean = cost.n ? cost.sum / cost.n : 0;
  log('frame', mean, cost.max, play);

  const sr = 44100;
  const dur = 10 / 8;
  const pcm = new Float32Array(Math.ceil(sr * dur));
  const mix = (cue, at, gain) => {
    const i0 = Math.floor(at * sr);
    for (let i = 0; i < cue.length && i0 + i < pcm.length; i++) pcm[i0 + i] += cue[i] * gain;
  };
  mix(taiko(sr), 0.1, 0.55);
  mix(taiko(sr), 0.7, 0.55);
  mix(taiko(sr), 1.2, 0.5);
  mix(goCue(sr), 1.7, 0.7);
  mix(marimba(sr, 880, 0.35), 2.05, 0.4);
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
  writeFileSync(join(frames, 'r3.wav'), wav);
  const mp4 = join(OUT, 'r3.mp4');
  const ff = Bun.spawnSync(['ffmpeg', '-y', '-framerate', '8', '-i', join(frames, '%02d.png'), '-i', join(frames, 'r3.wav'), '-shortest', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', mp4]);
  if (ff.exitCode !== 0) log('ffmpeg', ff.stderr.toString().slice(0, 400));
  else { keep(mp4); log('saved', 'r3.mp4'); }
  rmSync(frames, { recursive: true, force: true });

  const note = {
    code, peers,
    idleMean: idle.n ? idle.sum / idle.n : 0, idleMax: idle.max, idleN: idle.n,
    frameMean: mean, frameMax: cost.max, frameN: cost.n, play,
  };
  writeFileSync(join(OUT, 'r3.json'), JSON.stringify(note, null, 2));
  keep(join(OUT, 'r3.json'));
  log('done', code);
} finally {
  for (const p of pages) { try { await p.close(); } catch { /* */ } }
  try { relay.stop(); } catch { /* */ }
  try { web.stop(); } catch { /* */ }
  log('stopped');
}
