// [play] The kit's visual pass: the same poses BEFORE and AFTER, and the DOM measurement table.
//   env -u NODE_OPTIONS bun tools/anime/play-v-shots.mjs --port 9466 --tag before --set charm,ui
//   env -u NODE_OPTIONS bun tools/anime/play-v-shots.mjs --port 9466 --tag after --set charm,ui,hub,fw --pairs 1
// Frames: docs/play/shots/play-kit/v-<tag>-<desktop|phone>-<ja|en>-<item>.jpg
// Sizes:  docs/play/shots/play-kit/v-<tag>-measure.json (getBoundingClientRect at 1440x900 and 393x852)
// Pairs:  v-pair-<device>-<lang>-<item>.jpg, BEFORE on the left, AFTER on the right (--pairs 1)
// WebKit through the lane's wks session (tools/perf/wk). No desktop Chrome. Everything quits at the end.
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9466));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const tag = arg('tag', 'after');
const out = arg('out', join(ROOT, 'docs/play/shots/play-kit'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[v]', ...a);
const want = new Set(String(arg('set', 'charm,ui,hub,fw')).split(','));
const on = (k) => want.has(k);
const devices = String(arg('devices', 'desktop,phone')).split(',');
const langs = String(arg('langs', 'ja,en')).split(',');

const SRC = join(ROOT, 'tools/perf/wk/wks.swift');
const BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

const sizesFile = join(out, `v-${tag}-measure.json`);
const sizes = existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, 'utf8')) : {};
const saveSizes = () => writeFileSync(sizesFile, JSON.stringify(sizes, null, 1) + '\n');

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

const DEV = {
  desktop: { w: 1440, h: 900, dsf: null, q: 'high', width: null },
  phone: { w: 393, h: 852, dsf: 3, q: 'phone', width: 786 },
  card: { w: 1280, h: 800, dsf: null, q: 'high', width: null, extra: '&faceYaw=' + arg('cardyaw', '24') },
  // The 出荷前チェック sizes: phone landscape, a wide desktop, a Retina desktop, and reduced motion (JS matchMedia).
  land: { w: 852, h: 393, dsf: 3, q: 'phone', width: 1278 },
  wide: { w: 1600, h: 900, dsf: null, q: 'high', width: null },
  retina: { w: 1440, h: 900, dsf: 2, q: 'high', width: 1440 },
  reduce: { w: 1440, h: 900, dsf: null, q: 'high', width: null, reduce: true },
  perf: { w: 1280, h: 720, dsf: null, q: 'phone', width: null, extra: '&perf=1' },
};

async function session(dev, lang, fn) {
  const d = DEV[dev];
  const name = `${tag}-${dev}-${lang}`;
  const workdir = join(ROOT, 'dist/perf/wk-v-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?shot=1&w=${d.w}&h=${d.h}&q=${d.q}&cam=hero&face=1&pose=1${lang === 'en' ? '&lang=en' : ''}${d.extra || ''}`;
  const env = { ...process.env, KLC_WK_EPHEMERAL: '1' };
  if (d.dsf) env.KLC_DSF = String(d.dsf);
  if (d.reduce) env.KLC_REDUCE = '1';
  const proc = Bun.spawn([BIN, url, workdir, String(d.w), String(d.h)], { env, stdout: 'pipe', stderr: 'pipe' });
  const wk = open(workdir);
  const t0 = Date.now();
  try {
    const ready = await wk.ready(480);
    log(name, 'ready', ready.ms);
    await wk.eval(HELPERS);
    const shot = async (item) => {
      const base = `v-${tag}-${dev}-${lang}-${item}`;
      const png = join(out, base + '.png');
      await wk.page(png);
      jpg(png, join(out, base + '.jpg'), d.width);
      log('saved', base);
    };
    const measure = async (item, sels) => {
      const v = await wk.eval(`return JSON.stringify(window.__vm(${JSON.stringify(sels)}))`);
      (sizes[`${dev}-${lang}`] ||= {})[item] = JSON.parse(v);
    };
    await fn({ wk, shot, measure, dev, lang, ja: lang !== 'en' });
  } finally {
    try { (sizes.errors ||= {})[name] = JSON.parse(await wk.eval('return JSON.stringify((window.__errors || []).map(String).slice(0, 8))')); } catch { /* the page is gone */ }
    saveSizes();
    try { await wk.quit(); } catch { /* */ }
    try { proc.kill(9); } catch { /* */ }
    rmSync(workdir, { recursive: true, force: true });
    log(name, 'session s', ((Date.now() - t0) / 1000).toFixed(0));
  }
}

// In the page: a measuring helper and the charm camera. Poses are relative to the pavement under w-open, so the
// BEFORE (centre 1.08 m up) and the AFTER sit in the same frame.
const HELPERS = `
window.__vm = (sels) => {
  const o = {};
  for (const [k, sel] of Object.entries(sels)) {
    const list = [...document.querySelectorAll(sel)].filter((n) => n.offsetParent !== null || getComputedStyle(n).position === 'fixed');
    o[k] = list.slice(0, 6).map((n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(0), y: +r.top.toFixed(0), fs: cs.fontSize, fw: cs.fontWeight,
        ff: cs.fontFamily.split(',')[0].replace(/"/g, ''), op: cs.opacity, filter: cs.filter === 'none' ? '' : cs.filter, text: (n.textContent || '').trim().slice(0, 18) };
    });
  }
  return o;
};
// Pause every running CSS animation at \`ms\` (or its end), so a still shows a chosen moment of a beat.
window.__vfreeze = (ms) => { for (const a of document.getAnimations()) { try { const d = a.effect.getTiming(); const end = (d.delay || 0) + (Number(d.duration) || 0); a.currentTime = Math.min(ms, end); a.pause(); } catch (e) { /* */ } } return document.getAnimations().length; };
window.__vthaw = () => { for (const a of document.getAnimations()) { try { a.play(); } catch (e) { /* */ } } return 1; };
window.__vspot = () => window.__play.spots.find((x) => x.id === 'w-open');
window.__vaim = (dist, side, eye, look) => {
  const s = window.__vspot();
  const g = s.y - 1.08;
  const dx = s.x - 168, dz = s.z + 122;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const x = s.x - ux * dist - uz * side, z = s.z - uz * dist + ux * side;
  window.__camSpec(x.toFixed(2) + ',' + (g + eye).toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + (g + look).toFixed(2) + ',' + s.z);
  window.__raf.step(2);
  return JSON.stringify({ d: +Math.hypot(x - s.x, z - s.z).toFixed(2), g: +g.toFixed(2) });
};
window.__vstars = () => {
  let mesh = null;
  window.__ctx.scene.traverse((o) => { if (o.name === 'play-fx') mesh = o; });
  if (!mesh) return { n: 0 };
  const cam = window.__ctx.camera;
  const d = mesh.geometry.getAttribute('iData').array, st = mesh.geometry.getAttribute('iStyle').array;
  const mPerPx = 2 * Math.tan((cam.fov * Math.PI / 180) / 2) / innerHeight;
  const px = [];
  for (let i = 52; i < st.length / 4; i++) {
    const sc = st[i * 4 + 3];
    if (!(sc > 0.001) || Math.abs(d[i * 4 + 3] - 2) > 0.5) continue;
    const dist = Math.max(0.35, Math.hypot(cam.position.x - d[i * 4], cam.position.y - d[i * 4 + 1], cam.position.z - d[i * 4 + 2]));
    px.push(Math.min(window.__play.fx.stats().starPx || 24, sc / (mPerPx * dist)));
  }
  px.sort((a, b) => a - b);
  const q = (p) => px.length ? +px[Math.min(px.length - 1, Math.floor(p * (px.length - 1)))].toFixed(1) : 0;
  return { n: px.length, min: q(0), p50: q(0.5), max: q(1), visible: mesh.visible };
};
return 1;`;

const BOOT = `document.body.classList.add('playing'); document.body.classList.remove('noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__raf.step(6); return document.querySelector('#klc-play [data-act="play"] span')?.textContent || 'NO-PLAY';`;

async function charmPass({ wk, shot, measure, dev }) {
  log('boot', await wk.eval(BOOT));
  log('aim', await wk.eval(`return window.__vaim(3.6, 0.8, 1.55, 0.86)`));
  await wk.eval(`window.__simTo(0.6); window.__raf.step(3); return 1`);
  await shot('charm-day');
  await measure('charm-day', { chip: '#klc-play .counter', pill: '#klc-play .play-btn', book: '#klc-play .book' });
  log('close', await wk.eval(`return window.__vaim(2.4, 0.55, 1.3, 0.98)`));
  await wk.eval(`window.__simTo(1.0); window.__raf.step(3); return 1`);
  await shot('charm-close');
  await wk.eval(`window.__setHours(21); window.__vaim(3.6, 0.8, 1.55, 0.86); window.__simTo(1.3); window.__raf.step(3); return 1`);
  await shot('charm-night');
  const far = await wk.eval(`window.__setHours(12);
    const s = window.__vspot();
    const dx = 168 - s.x, dz = -122 - s.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const x = s.x - uz * 60, z = s.z + ux * 60, y = s.y + 1.6;
    window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
    window.__simTo(0.14);
    window.__raf.step(3);
    const cam = window.__ctx.camera.position;
    const st = [...document.querySelectorAll('.play-glint:not([hidden])')].map((n) => n.getBoundingClientRect().width.toFixed(1));
    return JSON.stringify({ dist: +Math.hypot(cam.x - s.x, cam.y - s.y, cam.z - s.z).toFixed(1), stars: st });`);
  log('60m', far);
  await shot('charm-60');
  await measure('charm-60', { glint: '.play-glint:not([hidden])' });
  await wk.eval(`window.__simTo(1.0); window.__raf.step(2); return 1`);
  const rest = await wk.eval(`return JSON.stringify([...document.querySelectorAll('.play-glint:not([hidden])')].map((n) => n.getBoundingClientRect().width.toFixed(1)))`);
  (sizes.glintRest ||= {})[tag] = rest;
  const spark = await wk.eval(`window.__vaim(2.4, 0.55, 1.3, 0.98);
    const s = window.__vspot();
    const t = window.__simTo(2.0);
    const c = window.__play.charmAt ? window.__play.charmAt(s) : { x: s.x, y: s.y, z: s.z };
    window.__play.fx.burst({ x: c.x, y: c.y + 0.1, z: c.z }, 'gold', { count: 24 });
    window.__simTo(t + 0.14);
    window.__raf.step(2);
    return JSON.stringify(window.__vstars());`);
  log('spark', spark);
  (sizes.spark ||= {})[tag + '-' + dev] = JSON.parse(spark);
  await shot('spark');
}

async function uiPass({ wk, shot, measure, ja }) {
  await wk.eval(BOOT);
  await wk.eval(`window.__setHours(16); window.__camSpec('hero'); window.__simTo(3); window.__raf.step(3); return 1`);
  await shot('hud');
  await measure('hud', { pill: '#klc-play .play-btn', pillText: '#klc-play .play-btn span', book: '#klc-play .book', chip: '#klc-play .counter', chipName: '#klc-play .counter .nm', chipNum: '#klc-play .counter b' });
  // countdown: the 「2」 beat 80 ms in, then GO!
  await wk.eval(`window.__cd0 = window.__simTo(4); window.__play.ui.countdown({}); window.__simTo(4 + 1/30); return 1`);
  await wk.eval(`window.__simTo(4 + 0.8); window.__raf.step(2); window.__vfreeze(150); return document.querySelector('#klc-play .count')?.textContent || '';`);
  await shot('countdown');
  await measure('countdown', { count: '#klc-play .count', num: '#klc-play .count .cd-n' });
  await wk.eval(`window.__vthaw(); window.__simTo(4 + 2.3); window.__raf.step(2); window.__vfreeze(170); return document.querySelector('#klc-play .count')?.textContent || '';`);
  await shot('go');
  await measure('go', { count: '#klc-play .count', num: '#klc-play .count .cd-n' });
  await wk.eval(`window.__vthaw(); return 1`);
  await wk.eval(`window.__simTo(8); const c = document.querySelector('#klc-play .count'); if (c) c.hidden = true; window.__tm = window.__play.ui.timer(); window.__tm.start(); window.__simTo(8 + 1/30); window.__simTo(20.4); window.__tm.splitAt(12370, 13570); window.__raf.step(2); return document.querySelector('#klc-play .timer')?.textContent || '';`);
  await shot('timer');
  await measure('timer', { timer: '#klc-play .timer', split: '#klc-play .split' });
  const L = ja
    ? { cast: '竿を出す', bait: '撒き餌', spray: '散水', ice: '冷やす', quit: 'やめる' }
    : { cast: 'Cast', bait: 'Chum', spray: 'Spray', ice: 'Ice', quit: 'Quit' };
  await wk.eval(`window.__tm.hide();
    const L = ${JSON.stringify(L)};
    window.__acts = window.__play.ui.actions([
      { id: 'cast', icon: 'pole', label: L.cast, key: 'Space', primary: true, onPress() {} },
      { id: 'bait', icon: 'bait', label: L.bait, key: 'E', cooldownMs: 4000, onPress() {} },
      { id: 'spray', icon: 'spray', label: L.spray, key: 'R', onPress() {} },
      { id: 'ice', icon: 'ice', label: L.ice, key: 'C', onPress() {} },
      { id: 'quit', icon: 'back', label: L.quit, key: 'Escape', onPress() {} },
    ]);
    const b = document.querySelector('#klc-play .cluster [data-id="bait"]'); if (b) b.click();
    window.__simTo(21.6); window.__raf.step(2);
    return document.querySelectorAll('#klc-play .cluster .act').length;`);
  await shot('actions');
  await measure('actions', { act: '#klc-play .cluster .act', label: '#klc-play .cluster .lb', key: '#klc-play .cluster kbd' });
  // Toasts and the results card add their show class in requestAnimationFrame: step it, then let the transition run.
  await wk.eval(`window.__play.ui.actions([]); window.__play.ui.toast(${JSON.stringify(ja ? '金のカツオ10匹！' : '10 golden bonito!')}, { big: true }); window.__play.ui.toast(${JSON.stringify(ja ? 'チュートリアルをもう一度' : 'Show the tutorial again')}); window.__raf.step(2); return 1`);
  await Bun.sleep(420);
  await shot('toast');
  await measure('toast', { toast: '#klc-play .toast:not(.big):not(.ono)', big: '#klc-play .toast.big' });
  await wk.eval(`document.querySelector('#klc-play .toasts').replaceChildren(); window.__play.ui.toast(${JSON.stringify(ja ? 'ザバッ！' : 'SPLASH!')}, { ono: true }); window.__raf.step(2); return 1`);
  await Bun.sleep(320);
  await shot('ono');
  await measure('ono', { ono: '#klc-play .toast.ono' });
  await wk.eval(`document.querySelector('#klc-play .toasts').replaceChildren(); window.__play.ui.stamp(); return 1`);
  await Bun.sleep(320);
  await shot('stamp');
  await measure('stamp', { stamp: '#klc-play .floathanko' });
  await wk.eval(`const title = ${JSON.stringify(ja ? '金のカツオさがし' : 'Find the golden bonito')}; window.__play.ui.resultCard({ title, medal: 'gold', timeMs: 83450, bestMs: 83870, isBest: true, onRetry() {}, onQuit() {} }); window.__raf.step(2); return 1`);
  await Bun.sleep(400);
  await wk.eval(`window.__raf.step(30); return 1`);
  await Bun.sleep(1300);
  await wk.eval(`window.__raf.step(4); return document.querySelector('#klc-play .veil .time')?.textContent || '';`);
  await shot('results');
  await measure('results', { medal: '#klc-play .veil .medal', time: '#klc-play .veil .time', stamp: '#klc-play .veil .hanko', retry: '#klc-play .veil [data-act="retry"]', quit: '#klc-play .veil [data-act="quit"]', title: '#klc-play .veil h2' });
  // A fishing trip's results: no medal, the 優 seal, the catch line, and まちへ.
  await wk.eval(`document.querySelector('#klc-play .veil [data-act="quit"]')?.click();
    window.__play.ui.resultCard({ title: ${JSON.stringify(ja ? '一本釣り' : 'Pole-and-line bonito')}, grade: '優', extra: ${JSON.stringify(ja ? '8本・合計18.6kg・最大74cm' : '8 fish · 18.6 kg in all · best 74 cm')}, quitLabel: ${JSON.stringify(ja ? 'まちへ' : 'To town')}, onRetry() {}, onQuit() {} });
    window.__raf.step(2); return 1`);
  await Bun.sleep(400);
  await wk.eval(`window.__raf.step(30); return 1`);
  await Bun.sleep(900);
  await shot('results-grade');
  await measure('results-grade', { stamp: '#klc-play .veil .hanko', extra: '#klc-play .veil .extra' });
  await wk.eval(`document.querySelector('#klc-play .veil [data-act="quit"]')?.click(); return 1`);
}

const STUBS = `[
  { id: 'ippon', order: 10, title: { ja: '一本釣り', en: 'Pole-and-line bonito' }, hook: { ja: 'カツオを一本釣り！', en: 'Land skipjack the Kesennuma way' }, minutes: 5, stars: 2, players: 1 },
  { id: 'gull', order: 30, title: { ja: 'ウミネコになる', en: 'Be a gull' }, hook: { ja: '空から港を見下ろす', en: 'Look down on the harbour' }, minutes: 3, stars: 1, players: 1 },
  { id: 'underwater', order: 40, title: { ja: '海の中', en: 'Under the sea' }, hook: { ja: '筏の下をのぞいてみる', en: 'Swim under the rafts' }, minutes: 4, stars: 1, players: 1 },
  { id: 'race', order: 50, title: { ja: 'ドライブ・レース', en: 'Drive race' }, hook: { ja: '港町ぐるっと一周', en: 'Once round the port' }, minutes: 3, stars: 3, players: 1 },
  { id: 'quest', order: 60, title: { ja: 'クエスト', en: 'Quests' }, hook: { ja: 'まちの人のおねがい', en: 'Help the people in town' }, minutes: 6, stars: 2, players: 1 },
  { id: 'multi', order: 70, title: { ja: 'みんなで', en: 'Together' }, hook: { ja: 'いっしょに港をまわる', en: 'Explore with friends' }, minutes: 10, stars: 1, players: 'many' },
]`;

async function hubPass({ wk, shot, measure }) {
  await wk.eval(BOOT);
  await wk.eval(`window.__setHours(16); window.__camSpec('hero'); window.__play.store.update('meta', (d) => { delete d.hubOpened; delete d.played; }); window.__simTo(3); window.__raf.step(3); return 1`);
  await wk.eval(`document.querySelector('#klc-play [data-act="play"]').click(); window.__raf.step(2); return 1`);
  await Bun.sleep(450);
  await shot('hub-1');
  await measure('hub-1', { sheet: '#klc-play .hub-sheet', card: '#klc-play .mcard', title: '#klc-play .mcard h3', chip: '#klc-play .mchips span' });
  await wk.eval(`document.querySelector('#klc-play .mcard')?.click(); return 1`);
  await Bun.sleep(380);
  await shot('hub-card');
  await measure('hub-card', { open: '#klc-play .mcard.open', go: '#klc-play .mcard.open .go', how: '#klc-play .mcard.open .howbtn' });
  await wk.eval(`document.querySelector('#klc-play .hub .x')?.click(); for (const s of ${STUBS}) window.__ctx.services.play.registerMode({ ...s, start() {} }); window.__raf.step(2); document.querySelector('#klc-play [data-act="play"]').click(); window.__raf.step(2); return 1`);
  await Bun.sleep(450);
  await shot('hub-7');
  await measure('hub-7', { sheet: '#klc-play .hub-sheet', card: '#klc-play .mcard', dots: '#klc-play .dots button' });
  await wk.eval(`const c = document.querySelector('#klc-play .mcard[data-mode="katsuo"]'); if (c) { c.scrollIntoView({ inline: 'center', block: 'nearest' }); c.click(); } return 1`);
  await Bun.sleep(420);
  await shot('hub-7-card');
  await measure('hub-7-card', { open: '#klc-play .mcard.open', others: '#klc-play .mcard:not(.open)' });
  // Walk mode before はじめる: the hunt picks the nearest charm for the mode you are in (from the drone it is a roof).
  await wk.eval(`const s = window.__vspot(); const yaw = Math.atan2(-(s.x - 168), -(s.z + 122)) * 180 / Math.PI; window.__camSpec('168,-122,' + yaw.toFixed(2) + ',-9'); window.__raf.step(1); document.querySelector('#klc-play .mcard.open .go')?.click(); return 1`);
  await Bun.sleep(520);
  await wk.eval(`window.__raf.step(2); return 1`);
  await Bun.sleep(420);
  await shot('title');
  await measure('title', { title: '#klc-play .titlecard h2', seal: '#klc-play .titlecard .hanko', sub: '#klc-play .titlecard .sub' });
  await wk.eval(`document.querySelector('#klc-play .titlecard')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 1`);
  await Bun.sleep(400);
  // The hunt turns the walker to the nearest charm; the shot follows the walker's camera, as in play.
  await wk.eval(`const s = window.__vspot(); const yaw = Math.atan2(-(s.x - 168), -(s.z + 122)) * 180 / Math.PI; window.__camSpec('168,-122,' + yaw.toFixed(2) + ',-9'); window.__simTo(6); window.__raf.step(3); return 1`).catch(() => 0);
  await Bun.sleep(250);
  await shot('coach');
  await measure('coach', { bubble: '#klc-play .coach .bubble', text: '#klc-play .coach .say p' });
}

const FW_CAM = arg('fwcam', '168,8,-100>156,210,-40');
async function fwPass({ wk, shot, dev }) {
  await wk.eval(BOOT);
  // Walk the whole finale on the sim clock, count the live sparks every 0.2 s, then replay to the peak for the still.
  const r = await wk.eval(`window.__setHours(21); window.__camSpec(${JSON.stringify(FW_CAM)});
    const count = () => { let n = 0; window.__ctx.scene.traverse((o) => { if (o.name !== 'play-fx') return; const st = o.geometry.getAttribute('iStyle').array; for (let i = 52; i < st.length / 4; i++) if (st[i * 4 + 3] > 0.05) n++; }); return n; };
    window.__sim(0.05);
    window.__play.fx.fireworks({ centre: { x: 156, y: 8, z: -33 }, seconds: 25 });
    let best = { t: 0, n: -1 };
    const shells = [];
    let prev = 0;
    for (let t = 0.2; t <= 25.01; t += 0.2) { window.__simTo(0.05 + t); const n = count(); if (n > prev + 120) shells.push(+t.toFixed(1)); prev = n; if (n > best.n) best = { t: +t.toFixed(1), n }; }
    const last = shells.length ? shells[shells.length - 1] : best.t;
    // A volley's peak is its last shell, opened (0.9 s); a lone shell's peak is that shell, opened.
    const peak = shells.length >= 3 && shells[shells.length - 1] - shells[shells.length - 3] < 1.5 ? +(last + 0.5).toFixed(1) : +(best.t + 0.9).toFixed(1);
    window.__sim(0.05);
    window.__play.fx.fireworks({ centre: { x: 156, y: 8, z: -33 }, seconds: 25 });
    window.__simTo(0.05 + peak); window.__raf.step(2);
    return JSON.stringify({ ...best, launches: shells, still: peak });`, 300);
  log('fw peak', r);
  const fw = JSON.parse(r);
  (sizes.fw ||= {})[tag + '-' + dev] = fw;
  await shot('fireworks');
  // The sequence: each shell 0.9 s after it opens, from a closer pose, tiled into one strip.
  if (arg('strip') === '1' && dev === 'desktop') {
    const parts = [];
    await wk.eval(`window.__sim(0.05); window.__play.fx.fireworks({ centre: { x: 156, y: 8, z: -33 }, seconds: 25 }); window.__camSpec(${JSON.stringify(arg('stripcam', '156,40,300>156,200,-33'))}); return 1`);
    for (const t of fw.launches) {
      await wk.eval(`window.__simTo(${(0.05 + t + 0.9).toFixed(2)}); window.__raf.step(2); return 1`, 120);
      const png = join(out, `v-${tag}-fw-${parts.length}.png`);
      await wk.page(png);
      parts.push(png);
    }
    const tiles = await Promise.all(parts.map((f) => sharp(f).resize({ width: 480 }).toBuffer({ resolveWithObject: true })));
    const th = tiles[0].info.height;
    const cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * 480 + (cols - 1) * 6, height: rows * th + (rows - 1) * 6, channels: 3, background: '#17184B' } })
      .composite(tiles.map((b, i) => ({ input: b.data, left: (i % cols) * 486, top: Math.floor(i / cols) * (th + 6) })))
      .jpeg({ quality: 74 }).toFile(join(out, `v-${tag}-desktop-ja-fireworks-sequence.jpg`));
    for (const f of parts) rmSync(f, { force: true });
    log('strip', parts.length);
  }
}

async function fwPoses({ wk }) {
  await wk.eval(BOOT);
  await wk.eval(`window.__setHours(21); window.__sim(0.05); window.__play.fx.fireworks({ centre: { x: 156, y: 8, z: -33 }, seconds: 25 }); window.__simTo(21.5); return 1`, 300);
  const poses = String(arg('poses', '')).split(';').filter(Boolean);
  for (let i = 0; i < poses.length; i++) {
    await wk.eval(`window.__camSpec(${JSON.stringify(poses[i])}); window.__raf.step(2); return 1`);
    const png = join(out, 'fwpose-' + i + '.png');
    await wk.page(png);
    jpg(png, join(out, 'fwpose-' + i + '.jpg'), 720);
    log('pose', i, poses[i]);
  }
}

async function pairs() {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(out).filter((f) => f.startsWith('v-before-') && f.endsWith('.jpg'));
  for (const f of files) {
    const a = join(out, f);
    const b = join(out, f.replace('v-before-', 'v-after-'));
    if (!existsSync(b)) continue;
    const ma = await sharp(a).metadata();
    const h = Math.min(ma.height, 900);
    const ia = await sharp(a).resize({ height: h }).toBuffer();
    const ib = await sharp(b).resize({ height: h }).toBuffer();
    const wa = (await sharp(ia).metadata()).width;
    const wb = (await sharp(ib).metadata()).width;
    const label = (text, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44"><rect width="${w}" height="44" fill="#17184B"/><text x="16" y="30" font-family="Hiragino Sans, sans-serif" font-size="22" font-weight="700" fill="#FBFAF5">${text}</text></svg>`);
    const img = await sharp({ create: { width: wa + wb + 12, height: h + 44, channels: 3, background: '#FBFAF5' } })
      .composite([
        { input: label('BEFORE (round 3)', wa), left: 0, top: 0 },
        { input: label('AFTER (visual pass)', wb), left: wa + 12, top: 0 },
        { input: ia, left: 0, top: 44 },
        { input: ib, left: wa + 12, top: 44 },
      ]).jpeg({ quality: 72 }).toBuffer();
    writeFileSync(join(out, f.replace('v-before-', 'v-pair-')), img);
  }
  log('pairs', files.length);
}

// The 出荷前チェック frames: the HUD with the actions, the countdown, the results and the 7-card hub, per check size.
async function checkPass({ wk, shot, measure, ja }) {
  await wk.eval(BOOT);
  await wk.eval(`window.__setHours(16); window.__camSpec('hero'); window.__simTo(3); window.__raf.step(3); return 1`);
  const L = ja ? { cast: '竿を出す', bait: '撒き餌', spray: '散水', ice: '冷やす', quit: 'やめる' } : { cast: 'Cast', bait: 'Chum', spray: 'Spray', ice: 'Ice', quit: 'Quit' };
  await wk.eval(`const L = ${JSON.stringify(L)}; window.__play.ui.actions([
      { id: 'cast', icon: 'pole', label: L.cast, key: 'Space', primary: true, onPress() {} },
      { id: 'bait', icon: 'bait', label: L.bait, key: 'E', onPress() {} },
      { id: 'spray', icon: 'spray', label: L.spray, key: 'R', onPress() {} },
      { id: 'quit', icon: 'back', label: L.quit, key: 'Escape', onPress() {} },
    ]); window.__play.ui.countdown({}); window.__simTo(3 + 1/30); window.__simTo(3.85); window.__raf.step(2); return 1`);
  await Bun.sleep(300);
  await shot('check-hud');
  await measure('check-hud', { pill: '#klc-play .play-btn', chip: '#klc-play .counter', act: '#klc-play .cluster .act', num: '#klc-play .count .cd-n' });
  await wk.eval(`window.__simTo(8); window.__play.ui.actions([]); window.__play.ui.resultCard({ title: ${JSON.stringify(ja ? '金のカツオさがし' : 'Find the golden bonito')}, medal: 'gold', timeMs: 83450, bestMs: 83870, isBest: true, onRetry() {}, onQuit() {} }); window.__raf.step(2); return 1`);
  await Bun.sleep(400);
  await wk.eval(`window.__raf.step(30); return 1`);
  await Bun.sleep(1300);
  await shot('check-results');
  await measure('check-results', { medal: '#klc-play .veil .medal', time: '#klc-play .veil .time', retry: '#klc-play .veil [data-act="retry"]' });
  await wk.eval(`document.querySelector('#klc-play .veil [data-act="quit"]')?.click(); for (const s of ${STUBS}) window.__ctx.services.play.registerMode({ ...s, start() {} }); document.querySelector('#klc-play [data-act="play"]').click(); window.__raf.step(2); return 1`);
  await Bun.sleep(450);
  await shot('check-hub');
  await measure('check-hub', { sheet: '#klc-play .hub-sheet', card: '#klc-play .mcard' });
}

// The hub card still (16:10, 640x400 webp ≤ 40 KB): the charm on the quay, a 3/4 turn so the glint band shows.
async function cardPass({ wk }) {
  await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(14); return 1`);
  log('card aim', await wk.eval(`return window.__vaim(${arg('carddist', '2.7')}, ${arg('cardside', '0.9')}, ${arg('cardeye', '1.15')}, ${arg('cardlook', '0.62')})`));
  await wk.eval(`window.__simTo(0.9); window.__raf.step(3); return 1`);
  const png = join(out, 'v-card.png');
  await wk.page(png);
  const dest = join(ROOT, 'data/play/katsuo.webp');
  let buf = null;
  for (let q = 62; q >= 30; q -= 4) {
    buf = await sharp(png).resize(640, 400).webp({ quality: q }).toBuffer();
    if (buf.length <= 40 * 1024) break;
  }
  writeFileSync(dest, buf);
  await sharp(png).resize(640, 400).jpeg({ quality: 80 }).toFile(join(out, `v-${tag}-card-still.jpg`));
  rmSync(png, { force: true });
  log('card', dest, buf.length);
}

// Frame cost at the walk spawn with the charms, the glints and the HUD live (the round-3 method: 120 stepped frames).
async function perfPass({ wk }) {
  const perf = await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__camSpec('walk'); window.__perf && window.__perf.start(); window.__raf.step(120); const cost = window.__playCost ? window.__playCost() : null; const d = window.__perf ? window.__perf.stop() : { cpu: [], calls: [], buckets: {} }; const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (a,p) => a.length ? a[Math.min(a.length-1, Math.floor(p*(a.length-1)))] : 0; return JSON.stringify({ cost, cpuP50: q(cpu,0.5), cpuP95: q(cpu,0.95), cpuP99: q(cpu,0.99), hitch: (d.cpu||[]).filter(v => v > 50).length, calls: (d.calls||[])[(d.calls||[]).length-1], frames: cpu.length });`, 300);
  log('perf', perf);
  (sizes.perf ||= {})[tag] = JSON.parse(perf);
}

try {
  if (on('perf')) await session('perf', 'ja', perfPass);
  if (on('card')) await session('card', 'ja', cardPass);
  if (on('checks')) for (const dev of ['land', 'wide', 'retina', 'reduce']) await session(dev, 'ja', checkPass);
  for (const dev of devices) {
    for (const lang of langs) {
      if (!(on('charm') || on('ui') || on('hub') || on('fw') || on('fwposes'))) continue;
      await session(dev, lang, async (s) => {
        if (on('charm')) await charmPass(s);
        if (on('ui')) await uiPass(s);
        if (on('fw') && lang === 'ja') await fwPass(s);
        if (on('fwposes')) await fwPoses(s);
        if (on('hub')) await hubPass(s);
      });
    }
  }
  if (arg('pairs') === '1') await pairs();
} finally {
  try { srv.stop(); } catch { /* */ }
}
log('done', out);
