// [play] Round 3 stills: the あそぶ hub, the coach, the restyled HUD, the charm, the fireworks.
//   env -u NODE_OPTIONS bun tools/anime/play-r3-shots.mjs --port 9465 --set charm
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9465));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const out = arg('out', join(ROOT, 'docs/play/shots/play-kit'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[r3]', ...a);
const want = new Set(String(arg('set', 'hub,ui,charm,fw,perf')).split(','));
const on = (k) => want.has(k);

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

function jpg(png, file, width) {
  const args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '62'];
  if (width) args.push('--resampleWidth', String(width));
  args.push(png, '--out', file);
  const r = Bun.spawnSync(args);
  rmSync(png, { force: true });
  if (r.exitCode !== 0) throw new Error('sips ' + r.stderr.toString().slice(0, 200));
}

async function session(name, w, h, { dsf = null, q = 'high', extra = '' } = {}, fn) {
  const workdir = join(ROOT, 'dist/perf/wk-r3-' + name + '-' + process.pid);
  rmSync(workdir, { recursive: true, force: true });
  const url = `${srv.url}index.html?shot=1&w=${w}&h=${h}&q=${q}&cam=hero${extra}`;
  const env = { ...process.env, KLC_WK_EPHEMERAL: '1' };
  if (dsf) env.KLC_DSF = String(dsf);
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

async function page(wk, name, width) {
  const png = join(out, name + '.png');
  await wk.page(png);
  jpg(png, join(out, name + '.jpg'), width);
  log('saved', name);
}

const BOOT = `document.body.classList.add('playing'); window.__raf.step(8); return document.querySelector('#klc-play [data-act="play"] span')?.textContent || 'NO-PLAY';`;

const AIM = `(dist, side, lift) => {
  const s = window.__play.spots.find(x => x.id === 'w-open');
  const dx = s.x - 168, dz = s.z + 122;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const x = s.x - ux * dist - uz * (side || 0);
  const z = s.z - uz * dist + ux * (side || 0);
  const y = s.y + (lift == null ? 0.35 : lift);
  window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
  const i = window.__play.spots.findIndex(p => p.id === 'w-open');
  const phase = ((i * 0.37) % 2.2);
  const t = (0.14 - phase + 2.2) % 2.2;
  window.__simTo(t < 0.05 ? t + 2.2 : t);
  window.__raf.step(4);
  const cam = window.__ctx.camera.position;
  return JSON.stringify({ i, dist: +Math.hypot(cam.x - s.x, cam.y - s.y, cam.z - s.z).toFixed(1), camY: +cam.y.toFixed(1) });
}`;

async function charmPass(wk, prefix, width) {
  await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__aim = ${AIM}; return 1`);
  const where = await wk.eval(`return window.__aim(2.2, 0.55, 0.22)`);
  log(prefix, 'charm', where);
  await page(wk, prefix + '-charm-day', width);
  await wk.eval(`window.__setHours(21); window.__aim(2.2, 0.55, 0.22); return 1`);
  await page(wk, prefix + '-charm-night', width);
  const far = await wk.eval(`window.__setHours(12);
    const s = window.__play.spots.find(p => p.id === 'w-open');
    const dx = 168 - s.x, dz = -122 - s.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    const x = s.x - uz * 60, z = s.z + ux * 60, y = s.y + 1.6;
    window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
    window.__simTo(0.14);
    window.__raf.step(4);
    const cam = window.__ctx.camera.position;
    return JSON.stringify({ occluded: window.__play.occluded, dist: +Math.hypot(cam.x - s.x, cam.y - s.y, cam.z - s.z).toFixed(1) });`);
  log(prefix, '60', far);
  await page(wk, prefix + '-charm-60', width);
  const spark = await wk.eval(`window.__aim(1.8, 0.4, 0.15); const s = window.__play.spots.find(p => p.id === 'w-open'); window.__play.fx.burst({ x: s.x, y: s.y + 0.15, z: s.z }, 'gold', { count: 24 }); const t = window.__simTo(0.2); window.__raf.step(2); return t;`);
  log(prefix, 'spark', spark);
  await page(wk, prefix + '-spark', width);
}

async function cardStill() {
  const src = join(out, 'desktop-ja-charm-day.jpg');
  if (!existsSync(src)) return;
  const meta = await sharp(src).metadata();
  const cw = Math.round(meta.width * 0.46);
  const ch = Math.round(cw * 10 / 16);
  const left = Math.max(0, Math.round((meta.width - cw) / 2));
  const top = Math.max(0, Math.round(meta.height * 0.28));
  const dest = join(ROOT, 'data/play/katsuo.webp');
  mkdirSync(dirname(dest), { recursive: true });
  let buf = null;
  for (let q = 58; q >= 28; q -= 6) {
    buf = await sharp(src).extract({ left, top, width: Math.min(cw, meta.width - left), height: Math.min(ch, meta.height - top) }).resize(640, 400).webp({ quality: q }).toBuffer();
    log('webp try', q, buf.length);
    if (buf.length <= 40 * 1024) break;
  }
  writeFileSync(dest, buf);
  log('webp', dest, buf.length);
}

async function hubPass(wk, prefix, width) {
  const label = await wk.eval(BOOT);
  log(prefix, 'play', label);
  await page(wk, prefix + '-hub-closed', width);
  const opened = await wk.eval(`document.querySelector('#klc-play [data-act="play"]').click(); window.__raf.step(2); return (document.querySelector('#klc-play .hub h2')?.textContent || 'NO-HUB') + ' new=' + document.querySelectorAll('#klc-play .newb').length;`);
  log(prefix, 'hub', opened);
  await Bun.sleep(250);
  await page(wk, prefix + '-hub-open', width);
  const card = await wk.eval(`const c = document.querySelector('#klc-play .mcard'); if (c) c.click(); return document.querySelector('#klc-play .mcard.open .go')?.textContent || 'NO-GO';`);
  log(prefix, 'card', card);
  await Bun.sleep(200);
  await page(wk, prefix + '-hub-card', width);
  await wk.eval(`document.querySelector('#klc-play .mcard.open .go').click(); return 1`);
  await Bun.sleep(780);
  const title = await wk.eval(`return document.querySelector('#klc-play .titlecard h2')?.textContent || 'NO-TITLE';`);
  log(prefix, 'title', title);
  await page(wk, prefix + '-title', width);
  await wk.eval(`document.querySelector('#klc-play .titlecard')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 1`);
  await Bun.sleep(350);
  const coach = await wk.eval(`const live = window.__play.ui.t('play.katsuo.coach');
    const text = live && live.indexOf('play.') !== 0 ? live : 'キラッと光っている。そばに行くと、ひろえる。';
    window.__play.ui.coach({ id: 'shot-coach', force: true, gesture: 'swipe', dim: true, text, target: () => ({ x: innerWidth * 0.46, y: innerHeight * 0.58 }) });
    const p = document.querySelector('#klc-play .coach .say p');
    if (p) p.textContent = text;
    const caret = document.querySelector('#klc-play .coach .caret');
    if (caret) caret.hidden = true;
    const g = document.querySelector('#klc-play .glove');
    if (g) { g.style.animation = 'none'; g.style.opacity = '1'; g.style.transform = 'translateY(-22px)'; }
    return text + ' hand=' + (g ? '1' : '0');`);
  log(prefix, 'coach', coach);
  await page(wk, prefix + '-coach', width);
}

async function uiPass(wk, prefix, width, lang) {
  await wk.eval(BOOT);
  await wk.eval(`document.querySelector('#klc-play .titlecard')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); const c = document.querySelector('#klc-play .coach'); if (c) c.hidden = true; return 1`);
  const ja = lang !== 'en';
  await wk.eval(`window.__play.ui.toast(${JSON.stringify(ja ? 'ザバッ' : 'SPLASH')}, { ono: true }); return 1`);
  await Bun.sleep(180);
  await page(wk, prefix + '-ono', width);
  await wk.eval(`document.querySelector('#klc-play .toasts').replaceChildren(); const now = window.__simTo(0.05); window.__cd = now; window.__play.ui.countdown({}); return now;`);
  await wk.eval(`window.__simTo(0.05 + 0.8); window.__raf.step(2); return document.querySelector('#klc-play .count')?.textContent || '';`);
  await page(wk, prefix + '-countdown', width);
  await wk.eval(`document.querySelector('#klc-play .count').hidden = true; window.__tm = window.__play.ui.timer(); window.__tm.start(); window.__simTo(12.4); window.__raf.step(1); return document.querySelector('#klc-play .timer')?.textContent || '';`);
  await page(wk, prefix + '-timer', width);
  await wk.eval(`window.__tm.hide(); const cast = ${JSON.stringify(ja ? 'なげる' : 'Cast')}; const bait = ${JSON.stringify(ja ? 'えさ' : 'Bait')}; window.__play.ui.actions([{ id: 'cast', icon: 'pole', label: cast, key: 'F', primary: true, onPress() {} }, { id: 'bait', icon: 'bait', label: bait, key: 'E', cooldownMs: 4000, onPress() {} }]); const b = document.querySelector('#klc-play .cluster [data-id="bait"]'); if (b) b.click(); return document.querySelectorAll('#klc-play .cluster .act').length;`);
  await page(wk, prefix + '-actions', width);
  await wk.eval(`window.__play.ui.actions([]); const title = ${JSON.stringify(ja ? '金のカツオさがし' : 'Find the golden bonito')}; window.__play.ui.resultCard({ title, medal: 'gold', timeMs: 83450, isBest: true, onRetry() {}, onQuit() {} }); return 1`);
  await Bun.sleep(1100);
  await wk.eval(`window.__raf.step(4); return document.querySelector('#klc-play .veil .time')?.textContent || '';`);
  await page(wk, prefix + '-results', width);
  await wk.eval(`document.querySelector('#klc-play .veil [data-act="quit"]')?.click(); return 1`);
}

try {
  if (on('far')) {
    const farJs = `document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12);
        const s = window.__play.spots.find(p => p.id === 'w-open');
        const dx = 168 - s.x, dz = -122 - s.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const x = s.x - uz * 60, z = s.z + ux * 60, y = s.y + 1.6;
        window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
        window.__simTo(0.12); window.__raf.step(2);
        const v = new window.THREE.Vector3(s.x, s.y, s.z).project(window.__ctx.camera);
        const star = document.querySelector('.play-glint:not([hidden])');
        return JSON.stringify({ px: Math.round((v.x*0.5+0.5)*innerWidth), py: Math.round((-v.y*0.5+0.5)*innerHeight), stars: document.querySelectorAll('.play-glint:not([hidden])').length, w: star ? star.style.width : '0', at: star ? star.style.transform : '' });`;
    await session('far-ja', 1440, 900, { extra: '&face=1&pose=1' }, async (wk) => {
      log('far', await wk.eval(farJs));
      await page(wk, 'desktop-ja-charm-60');
    });
    await session('far-phone', 393, 852, { dsf: 3, q: 'phone', extra: '&face=1&pose=1' }, async (wk) => {
      await wk.eval(farJs);
      await page(wk, 'phone-ja-charm-60', 786);
    });
    await session('far-en', 1440, 900, { extra: '&face=1&pose=1&lang=en' }, async (wk) => {
      await wk.eval(farJs);
      await page(wk, 'desktop-en-charm-60');
    });
  }
  if (on('charm')) {
    await session('charm-ja', 1440, 900, { extra: '&face=1&pose=1' }, async (wk) => { await charmPass(wk, 'desktop-ja', null); });
    await cardStill();
    await session('charm-phone', 393, 852, { dsf: 3, q: 'phone', extra: '&face=1&pose=1' }, async (wk) => { await charmPass(wk, 'phone-ja', 786); });
    await session('charm-en', 1440, 900, { extra: '&face=1&pose=1&lang=en' }, async (wk) => {
      await wk.eval(`document.body.classList.add('playing', 'noui'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__setHours(12); window.__aim = ${AIM}; return window.__aim(2.2, 0.55, 0.22)`);
      await page(wk, 'desktop-en-charm-day');
      await wk.eval(`const s = window.__play.spots.find(p => p.id === 'w-open');
        const dx = 168 - s.x, dz = -122 - s.z; const len = Math.hypot(dx, dz) || 1; const ux = dx / len, uz = dz / len;
        const x = s.x - uz * 60, z = s.z + ux * 60, y = s.y + 1.6;
        window.__setHours(12);
        window.__camSpec(x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2) + '>' + s.x + ',' + s.y.toFixed(2) + ',' + s.z);
        window.__simTo(0.14); window.__raf.step(4); return 1`);
      await page(wk, 'desktop-en-charm-60');
    });
  }
  if (on('hub')) {
    await session('hub-ja', 1440, 900, {}, async (wk) => { await hubPass(wk, 'desktop-ja', null); });
    await session('hub-en', 1440, 900, { extra: '&lang=en' }, async (wk) => { await hubPass(wk, 'desktop-en', null); });
    await session('hub-phone', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => { await hubPass(wk, 'phone-ja', 786); });
    await session('hub-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en' }, async (wk) => { await hubPass(wk, 'phone-en', 786); });
  }
  if (on('ui')) {
    await session('ui-ja', 1440, 900, {}, async (wk) => { await uiPass(wk, 'desktop-ja', null, 'ja'); });
    await session('ui-en', 1440, 900, { extra: '&lang=en' }, async (wk) => { await uiPass(wk, 'desktop-en', null, 'en'); });
    await session('ui-phone', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => { await uiPass(wk, 'phone-ja', 786, 'ja'); });
    await session('ui-phone-en', 393, 852, { dsf: 3, q: 'phone', extra: '&lang=en' }, async (wk) => { await uiPass(wk, 'phone-en', 786, 'en'); });
  }
  if (on('fw')) {
    const sky = `document.body.classList.add('playing'); window.__setHours(21); window.__camSpec('168,8,-100>156,210,-40'); window.__play.fx.fireworks({ centre: { x: 156, y: 8, z: -33 }, seconds: 25 }); window.__simTo(1.7); window.__raf.step(2);
      let n = 0, sx = 0, sy = 0, sz = 0, vis = false;
      window.__ctx.scene.traverse(o => { if (o.name !== 'play-fx') return; vis = o.visible; const st = o.geometry.getAttribute('iStyle').array; const dt = o.geometry.getAttribute('iData').array; for (let i = 52; i < st.length / 4; i++) { if (st[i * 4 + 3] > 0.05) { n++; if (!sx) { sx = dt[i * 4]; sy = dt[i * 4 + 1]; sz = dt[i * 4 + 2]; } } } });
      const v = new window.THREE.Vector3(sx, sy, sz).project(window.__ctx.camera);
      return JSON.stringify({ n, vis, sx: +sx.toFixed(1), sy: +sy.toFixed(1), sz: +sz.toFixed(1), px: Math.round((v.x * 0.5 + 0.5) * innerWidth), py: Math.round((-v.y * 0.5 + 0.5) * innerHeight), z: +v.z.toFixed(3) });`;
    await session('fw-ja', 1440, 900, {}, async (wk) => { log('fw', await wk.eval(sky)); await page(wk, 'desktop-ja-fireworks'); });
    await session('fw-phone', 393, 852, { dsf: 3, q: 'phone' }, async (wk) => { await wk.eval(sky); await page(wk, 'phone-ja-fireworks', 786); });
    await session('fw-en', 1440, 900, { extra: '&lang=en' }, async (wk) => { await wk.eval(sky); await page(wk, 'desktop-en-fireworks'); });
  }
  if (on('perf')) {
    await session('perf', 1280, 720, { q: 'phone', extra: '&perf=1&pose=1' }, async (wk) => {
      const perf = await wk.eval(`document.body.classList.add('playing'); window.__play.store.update('katsuo', (d) => { d.found = {}; }); window.__camSpec('walk'); window.__perf && window.__perf.start(); window.__raf.step(120); const cost = window.__playCost ? window.__playCost() : null; const d = window.__perf ? window.__perf.stop() : { cpu: [], calls: [], buckets: {} }; const col = (d.buckets && d.buckets['upd:play'] || []).filter(v => v > 0).sort((a,b)=>a-b); const cpu = (d.cpu||[]).slice().sort((a,b)=>a-b); const q = (a,p) => a.length ? a[Math.min(a.length-1, Math.floor(p*(a.length-1)))] : 0; return JSON.stringify({ cost, playN: col.length, playP50: q(col,0.5), playP95: q(col,0.95), playMax: col[col.length-1]||0, cpuP50: q(cpu,0.5), cpuP95: q(cpu,0.95), cpuP99: q(cpu,0.99), hitch: (d.cpu||[]).filter(v => v > 50).length, calls: (d.calls||[])[(d.calls||[]).length-1] });`);
      writeFileSync(join(out, 'perf-r3.json'), perf);
      log('perf', perf);
    });
  }
} finally {
  try { srv.stop(); } catch { /* */ }
}
log('done', out);
