// [play] Contact sheet for 金のカツオ. WebKit, no Chrome.
//   env -u NODE_OPTIONS bun tools/anime/play-kakure.mjs --port 9465 --limit 15
import { join } from 'node:path';
import { mkdirSync, existsSync, statSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { build, serve, ROOT } from './cdp.mjs';
import { open } from '../perf/wk/wkc.mjs';
import * as L from '../../src/anime/world/layout.js';
import { designSpots, volumeAt, lotIndex } from '../../src/anime/play/katsuo/place.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : d; };
const port = Number(arg('port', 9465));
if (port < 9465 || port > 9469) throw new Error('play-kit ports are 9465-9469');
const limit = Number(arg('limit', 50));
const only = arg('ids', '') ? new Set(arg('ids', '').split(',')) : null;
const out = arg('out', join(ROOT, 'docs/play/kakure'));
mkdirSync(out, { recursive: true });
const log = (...a) => console.error('[kakure]', ...a);

const MODE = { walk: '歩く', fly: 'ドローン', drive: '車', sail: '船', swim: '泳ぐ' };
const spots = designSpots(L).slice(0, limit);
const lotsMap = lotIndex(L.LOTS);

function camOf(s, a) {
  const horiz = 11;
  const x = s.x + Math.cos(a) * horiz;
  const z = s.z + Math.sin(a) * horiz;
  const y = Math.max(s.y + 3.4, L.heightAt(x, z) + 2.6);
  return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}>${s.x},${(s.y + 0.25).toFixed(2)},${s.z}`;
}

function goldCount(png) {
  const bmp = png + '.bmp';
  const r = Bun.spawnSync(['sips', '-s', 'format', 'bmp', png, '--out', bmp]);
  if (r.exitCode !== 0) return 0;
  const b = readFileSync(bmp);
  rmSync(bmp, { force: true });
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const h = Math.abs(b.readInt32LE(22));
  const bpp = b.readUInt16LE(28);
  if (bpp !== 24 && bpp !== 32) return 0;
  const stride = Math.ceil((w * (bpp / 8)) / 4) * 4;
  const px = bpp / 8;
  let gold = 0, navy = 0;
  const x0 = (w * 0.4) | 0, x1 = (w * 0.6) | 0, y0 = (h * 0.36) | 0, y1 = (h * 0.64) | 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = off + y * stride + x * px;
      const bl = b[i], g = b[i + 1], rd = b[i + 2];
      if (rd > 200 && g > 130 && g < 230 && bl < 80 && rd > g + 15 && g > bl + 40) gold++;
      if (rd < 70 && bl > 40 && bl > rd + 15 && g < 110) navy++;
    }
  }
  // Navy alone used to clear the bar (a dark wall scored 480) and the sun counted as gold.
  if (gold < 10) return gold;
  return gold * 8 + Math.min(navy, 80);
}

const SRC = join(ROOT, 'tools/perf/wk/wks.swift'), BIN = join(ROOT, 'dist/perf/wks');
if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
  mkdirSync(join(ROOT, 'dist/perf'), { recursive: true });
  const r = Bun.spawnSync(['swiftc', '-O', SRC, '-o', BIN]);
  if (r.exitCode !== 0) throw new Error('swiftc failed: ' + r.stderr.toString().slice(0, 1500));
}
const dist = join(ROOT, `dist/anime-${port}`);
if (arg('nobuild') !== '1') log(JSON.stringify(await build({ outdir: dist, quiet: true })));
const srv = serve({ port, dist });

const workdir = join(ROOT, 'dist/perf/wk-kakure-' + process.pid);
rmSync(workdir, { recursive: true, force: true });
const first = spots[0];
const url = `${srv.url}index.html?shot=1&face=1&pose=1&w=640&h=400&q=high&cam=${encodeURIComponent(camOf(first, 0.4))}`;
const proc = Bun.spawn([BIN, url, workdir, '640', '400'], { stdout: 'pipe', stderr: 'pipe' });
const wk = open(workdir);
const rows = [];
try {
  const t0 = Date.now();
  const ready = await wk.ready(420);
  log('ready', Date.now() - t0, JSON.stringify(ready));
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    if (only && !only.has(s.id)) { rows.push(s); continue; }
    const png = join(out, `_frame-${String(i + 1).padStart(2, '0')}.png`);
    const jpg = join(out, `${String(i + 1).padStart(2, '0')}-${s.id}.jpg`);
    let bestGold = -1;
    let bestPng = null;
    const angles = [];
    if (s.mode === 'swim') {
      for (let k = 0; k < 6; k++) angles.push([k * Math.PI / 3 + 0.2, 4.5, 0.4]);
    } else {
      for (let k = 0; k < 8; k++) angles.push([k * Math.PI / 4 + 0.3, 11, 2.6]);
      for (let k = 0; k < 4; k++) angles.push([k * Math.PI / 2 + 0.8, 8, 4.2]);
      for (let k = 0; k < 8; k++) angles.push([k * Math.PI / 4 + 0.15, 5, 1.8]);
      if (s.mode === 'drive') {
        angles.unshift([0.4, 3.2, 5], [1.4, 2.6, 7], [2.4, 4, 9]);
      }
    }
    let shotN = 0;
    for (let k = 0; k < angles.length; k++) {
      const [a, horiz, lift] = angles[k];
      const x = s.x + Math.cos(a) * horiz;
      const z = s.z + Math.sin(a) * horiz;
      const ground = L.heightAt(x, z);
      const swim = s.mode === 'swim';
      const fly = s.mode === 'fly';
      let y = s.y + lift;
      if (swim) y = s.y + lift;
      else if (fly) y = Math.max(s.y + 0.6, ground + 3);
      else if (s.mode === 'sail') {
        if (!L.isWater(x, z)) continue;
        y = Math.max(s.y + 1.2, 2.4);
      } else {
        y = s.y + lift;
        if (s.mode === 'drive' && L.isWater(x, z)) continue;
      }
      if (volumeAt(lotsMap, L.LOTS, x, y, z)) continue;
      const spec = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}>${s.x},${(s.y + 0.25).toFixed(2)},${s.z}`;
      await wk.eval(`window.__camSpec(${JSON.stringify(spec)}); return 1`);
      const tryPng = png + '.' + k;
      await wk.shot(tryPng, shotN === 0 ? 12 : 4);
      shotN++;
      const g = goldCount(tryPng);
      if (g > bestGold) {
        bestGold = g;
        if (bestPng) rmSync(bestPng, { force: true });
        bestPng = tryPng;
      } else rmSync(tryPng, { force: true });
      if (g > 80) break;
    }
    if (!bestPng) {
      const spec = camOf(s, 0.4);
      await wk.eval(`window.__camSpec(${JSON.stringify(spec)}); return 1`);
      bestPng = png + '.fb';
      await wk.shot(bestPng, 10);
      bestGold = goldCount(bestPng);
    }
    const conv = Bun.spawnSync(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '55', '--resampleWidth', '420', bestPng, '--out', jpg]);
    rmSync(bestPng, { force: true });
    if (conv.exitCode !== 0) throw new Error('sips ' + conv.stderr.toString().slice(0, 300));
    rows.push(s);
    log('saved', i + 1, s.id, s.district, s.mode, 'gold', bestGold);
  }
  const errs = (await wk.console()).filter((l) => /error|Error|uncaught/i.test(l)).slice(0, 6);
  log('console', JSON.stringify(errs));
} finally {
  try { await wk.quit(); } catch { /* */ }
  try { proc.kill(9); } catch { /* */ }
  try { srv.stop(); } catch { /* */ }
  rmSync(workdir, { recursive: true, force: true });
}

const cards = rows.map((s, i) => {
  const file = `${String(i + 1).padStart(2, '0')}-${s.id}.jpg`;
  return `<figure><img src="${file}" alt=""><figcaption><b>${s.id}</b> ${s.district} · ${MODE[s.mode] || s.mode}<br>${s.note}</figcaption></figure>`;
}).join('\n');
writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>金のカツオ ${rows.length}</title>
<style>
body{margin:0;background:#17184B;color:#FBFAF5;font:14px/1.5 "Hiragino Sans",sans-serif}
h1{font-size:18px;padding:16px 16px 0;font-weight:700}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px}
figure{margin:0;background:#223A70;border-radius:12px;overflow:hidden}
img{width:100%;display:block;background:#0e1430}
figcaption{padding:8px 10px 10px}
b{font-variant-numeric:tabular-nums}
</style>
<h1>金のカツオ ${rows.length}</h1>
<main>${cards}</main>
`);
log('sheet', join(out, 'index.html'));
const keep = new Set(rows.map((s, i) => `${String(i + 1).padStart(2, '0')}-${s.id}.jpg`));
for (const name of readdirSync(out)) {
  if (name.endsWith('.jpg') && !keep.has(name)) rmSync(join(out, name), { force: true });
}
