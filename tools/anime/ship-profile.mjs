// [ship] Orthographic profile check of 第一昭福丸 against the nendo model photos.
//
//   tools/anime/gate.sh chrome env -u NODE_OPTIONS bun tools/anime/ship-profile.mjs [--port 8961] [--livery nendo|fallback]
//       [--tier high|phone] [--out docs/ship/shots] [--min-iou 0.85]
//
// Renders the ship side-on at exactly 0.1226 m/px (the scale of shofukumaru02: stem head x 158 -> transom x 636 =
// LOA 58.60 m) with the stem head and the waterline on the reference's pixels (port: stem x 158, waterline y 291;
// starboard: stem x 652, waterline y 291), then measures:
//   silhouette IoU   ship vs. background. The reference is segmented from its seamless white background (max channel
//                    difference > 8 from a per-row background taken at the image edges, rows above the floor shadow),
//                    the render from its alpha; both then go through the same clean-up: a 1 px opening (drops wires
//                    and 1 px masts), hole filling (white-on-white superstructure), and the thin pixels OR-ed back.
//   livery IoU       (a) per colour against the traced shapes (data/ship/shofukumaru1/livery-nendo.json), sampled
//                    every 5 cm in (s, h) over the hull side above the waterline, starboard ignore zones excluded;
//                    (b) per colour against the photo's own pixels in the hull band (h 0-9.2 m), classified exactly
//                    like docs/ship/livery-trace.py (black: max < 85; red: R > 120, G < 60, B < 65, R - B > 80).
// The render goes through the app's own pipeline (ink outlines on; vignette, leak, bloom and grading neutral) at 2x and
// is downsampled like a photo, then segmented exactly like the reference; the plain alpha-mask IoU is reported too.
// Starboard (shofukumaru03) is a slight three-quarter view, so it is also scored at its own fitted scale
// (0.1266 m/px, stem 652 -> stern 189) and is expected to score lower.
//
// Outputs (docs/ship/shots/): profile-<side>-<livery>-<tier>.png (the render), *-ref-sbs.png (reference | render),
// *-ref-overlay.png (grey both, red reference only, blue render only), atlas-<livery>.png, profile-metrics.json.
// Composites that contain the reference photos (*-ref-*.png) and nendo renders are local-only (.gitignore there):
// the photos are copyrighted and the livery is behind the dev flag.
import { join, resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { build, serve, launch } from './cdp.mjs';
import { sheerAt, fwdS, sternS } from '../../src/anime/world/ship/shofukumaru1.js';
import { sidePx, ATLAS } from '../../src/anime/world/ship/livery.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REFS = {
  port: { file: 'shofukumaru02_akihiro_yoshida.jpg', bowX: 158, wlY: 291, mpp: 0.1226 },
  starboard: { file: 'shofukumaru03_akihiro_yoshida.jpg', bowX: 652, wlY: 291, mpp: 0.1226, fitMpp: 58.6 / 463 },
};
const REF_DIR = join(ROOT, 'raw/ref/shofukumaru');
const Y_MAX = 338;   // rows below this hold the floor shadow in the reference photos

// --------------------------------------------------------------------------------------------- image helpers
export async function loadRGBA(src) { const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, H: info.height }; }
export function dilate(m, W, H, r = 1) { const o = new Uint8Array(m.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let dy = -r; dy <= r && !v; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && m[yy * W + xx]) { v = 1; break; } } o[y * W + x] = v; } return o; }
export function erode(m, W, H, r = 1) { const o = new Uint8Array(m.length); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 1; for (let dy = -r; dy <= r && v; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !m[yy * W + xx]) { v = 0; break; } } o[y * W + x] = v; } return o; }
export function fillHoles(m, W, H) {
  const seen = new Uint8Array(m.length), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (seen[i] || m[i]) continue; seen[i] = 1; const x = i % W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (i >= W) st.push(i - W); if (i < (H - 1) * W) st.push(i + W); }
  const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = seen[i] ? 0 : 1; return o;
}
/** Thin lines out, holes filled, thin pixels back. */
export function solid(m, W, H) {
  const op = dilate(erode(m, W, H, 1), W, H, 1);
  const f = fillHoles(erode(dilate(op, W, H, 1), W, H, 1), W, H);
  const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = f[i] | m[i]; return o;
}
export function segmentRef({ data, W, H }, { thr = 8, yMax = Y_MAX } = {}) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < Math.min(H, yMax); y++) {
    const L = [0, 0, 0], R = [0, 0, 0];
    for (let x = 0; x < 40; x++) for (let c = 0; c < 3; c++) { L[c] += data[(y * W + x) * 4 + c] / 40; R[c] += data[(y * W + W - 1 - x) * 4 + c] / 40; }
    for (let x = 0; x < W; x++) { const t = x / (W - 1); let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(data[(y * W + x) * 4 + c] - (L[c] * (1 - t) + R[c] * t))); if (d > thr) m[y * W + x] = 1; }
  }
  return m;
}
export function segmentAlpha({ data, W, H }, { thr = 40, yMax = Y_MAX } = {}) { const m = new Uint8Array(W * H); for (let y = 0; y < Math.min(H, yMax); y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > thr) m[y * W + x] = 1; return m; }
export function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; } return u ? i / u : 1; }
const isBlack = (r, g, b) => Math.max(r, g, b) < 85;
const isRed = (r, g, b) => r > 120 && g < 60 && b < 65 && r - b > 80;
export function liveryMasks({ data, W, H }, ship, { wlY, mpp }) {
  const y0 = Math.max(0, Math.round(wlY - 9.2 / mpp)), black = new Uint8Array(W * H), red = new Uint8Array(W * H);
  for (let y = y0; y < wlY; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (!ship[k]) continue; const r = data[k * 4], g = data[k * 4 + 1], b = data[k * 4 + 2]; if (isBlack(r, g, b)) black[k] = 1; else if (isRed(r, g, b)) red[k] = 1; }
  return { black, red };
}
async function png(mask, W, H, file, fn) { const b = Buffer.alloc(W * H * 3, 255); for (let i = 0; i < W * H; i++) { const c = fn(i); if (c) { b[i * 3] = c[0]; b[i * 3 + 1] = c[1]; b[i * 3 + 2] = c[2]; } } await sharp(b, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file); }

// --------------------------------------------------------------------------------------------- traced-shape IoU
const inPoly = (pts, s, h) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [si, hi] = pts[i], [sj, hj] = pts[j]; if ((hi > h) !== (hj > h) && s < ((sj - si) * (h - hi)) / (hj - hi) + si) c = !c; } return c; };
export function tracedIoU(atlas, traced, marks, side, step = 0.05) {
  const res = {};
  const ignore = marks?.[side]?.ignore || [];
  for (const colour of ['black', 'red']) {
    const polys = (traced[side]?.shapes || []).filter((s) => s.colour === colour).map((s) => s.pts);
    let I = 0, U = 0;
    for (let s = 0; s <= 58.6; s += step) for (let h = 0.05; h <= 8.0; h += step) {
      if (h > sheerAt(s) || s < fwdS(h) || s > sternS(h)) continue;
      if (ignore.some((z) => s >= z.s[0] && s <= z.s[1] && h >= z.h[0] && h <= z.h[1])) continue;
      const [x, y] = sidePx(side, s, h); const k = (Math.round(y) * atlas.W + Math.round(x)) * 4;
      const a = atlas.data[k + 3] > 128, r = atlas.data[k], g = atlas.data[k + 1], b = atlas.data[k + 2];
      const mine = a && (colour === 'black' ? isBlack(r, g, b) : isRed(r, g, b));
      const ref = polys.some((p) => inPoly(p, s, h));
      if (mine && ref) I++; if (mine || ref) U++;
    }
    res[colour] = U ? I / U : 1;
  }
  return res;
}

// --------------------------------------------------------------------------------------------- main
async function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(arg('port', 8961)); if ([8787, 8790, 8791].includes(port)) throw new Error('port reserved');
  const liveries = arg('livery', 'nendo,fallback').split(','), tiers = arg('tier', 'high,phone').split(',');
  const out = resolve(ROOT, arg('out', 'docs/ship/shots')); mkdirSync(out, { recursive: true });
  const minIoU = Number(arg('min-iou', 0.85));
  if (!existsSync(join(REF_DIR, REFS.port.file))) throw new Error('reference photos missing: ' + REF_DIR);
  const dist = join(ROOT, `dist/ship-profile-${port}`);
  await build({ entry: join(ROOT, 'tools/anime/ship-profile/index.html'), outdir: dist, strict: true });
  const srv = serve({ port, dist });
  const browser = await launch();
  const metrics = { date: new Date().toISOString(), mpp: REFS.port.mpp, runs: [] };
  try {
    const refs = {};
    for (const side of ['port', 'starboard']) {
      const img = await loadRGBA(join(REF_DIR, REFS[side].file));
      const ship = solid(segmentRef(img), img.W, img.H);
      refs[side] = { img, ship, liv: liveryMasks(img, ship, REFS[side]) };
    }
    const traced = await Bun.file(join(ROOT, 'data/ship/shofukumaru1/livery-nendo.json')).json();
    const marks = await Bun.file(join(ROOT, 'data/ship/shofukumaru1/livery-nendo-marks.json')).json();
    for (const livery of liveries) for (const tier of tiers) {
      const page = await browser.page({ width: 820, height: 547 });
      await page.goto(`${srv.url}index.html?livery=${livery}&tier=${tier}`);
      await page.waitFor('window.__ready === true', { timeout: 120000 });
      const info = await page.eval('window.__info');
      const run = { livery, tier, info, sides: {} };
      for (const side of ['port', 'starboard']) {
        const R = refs[side], cfg = REFS[side];
        const scales = side === 'starboard' ? [['strict', cfg.mpp], ['fitted', cfg.fitMpp]] : [['strict', cfg.mpp]];
        run.sides[side] = {};
        for (const [label, mpp] of scales) {
          // rendered at 2x and downsampled like a photo, then segmented exactly like the reference
          const SS = 2, W = R.img.W, H = R.img.H;
          const opt = JSON.stringify({ side, mpp: mpp / SS, bowX: cfg.bowX * SS, wlY: cfg.wlY * SS, w: W * SS, h: H * SS });
          const down = async (url) => sharp(Buffer.from(url.split(',')[1], 'base64')).resize(W, H, { kernel: 'lanczos3' }).png().toBuffer();
          const colorBuf = await down(await page.eval(`window.__render({ ...${opt}, mask: false })`));
          const alphaBuf = await down(await page.eval(`window.__render({ ...${opt}, mask: true })`));
          const color = await loadRGBA(colorBuf), alpha = await loadRGBA(alphaBuf);
          const mine = solid(segmentRef(color), W, H);
          const mineAlpha = solid(segmentAlpha(alpha), W, H);
          const sil = iou(R.ship, mine);
          const lv = liveryMasks(color, mine, cfg);
          const m = { mpp, silhouetteIoU: +sil.toFixed(4), silhouetteIoUalpha: +iou(R.ship, mineAlpha).toFixed(4), photoLiveryIoU: { black: +iou(R.liv.black, lv.black).toFixed(4), red: +iou(R.liv.red, lv.red).toFixed(4) } };
          run.sides[side][label] = m;
          const tag = `${side}-${livery}-${tier}${label === 'fitted' ? '-fit' : ''}`;
          writeFileSync(join(out, `profile-${tag}.png`), colorBuf);
          // side by side and overlay (contain the reference photo: local only)
          await sharp({ create: { width: W * 2, height: H, channels: 3, background: '#ffffff' } })
            .composite([{ input: join(REF_DIR, cfg.file), left: 0, top: 0 }, { input: colorBuf, left: W, top: 0 }]).png().toFile(join(out, `profile-${tag}-ref-sbs.png`));
          await png(null, W, H, join(out, `profile-${tag}-ref-overlay.png`), (i) => (R.ship[i] && mine[i] ? [170, 170, 176] : R.ship[i] ? [220, 40, 40] : mine[i] ? [40, 90, 230] : null));
          console.log(`${tag}: silhouette IoU ${m.silhouetteIoU} (alpha mask ${m.silhouetteIoUalpha})  photo livery IoU black ${m.photoLiveryIoU.black} red ${m.photoLiveryIoU.red}`);
        }
      }
      if (livery === 'nendo' && info.livery === 'nendo') {
        const atl = await loadRGBA(Buffer.from((await page.eval(`window.__atlas('shapes')`)).split(',')[1], 'base64'));
        run.tracedIoU = { port: tracedIoU(atl, traced, marks, 'port'), starboard: tracedIoU(atl, traced, marks, 'starboard') };
        console.log('traced-shape IoU', JSON.stringify(run.tracedIoU));
      }
      if (tier === 'high') for (const [name, extra] of [['flags', 'flags: true'], ['night', 'night: 1']]) {
        // 大漁旗 dressed (setFlags) and lit (setNight) port views, rendered the same way (2x, downsampled)
        const url = await page.eval(`window.__render({ side: 'port', mpp: ${REFS.port.mpp / 2}, bowX: ${REFS.port.bowX * 2}, wlY: ${REFS.port.wlY * 2}, w: 1640, h: 1094, ${extra} })`);
        await sharp(Buffer.from(url.split(',')[1], 'base64')).resize(820, 547, { kernel: 'lanczos3' }).png().toFile(join(out, `profile-port-${livery}-${tier}-${name}.png`));
      }
      writeFileSync(join(out, `atlas-${livery}-${tier}.png`), Buffer.from((await page.eval(`window.__atlas('')`)).split(',')[1], 'base64'));
      const errs = page.errors(); if (errs.length) { run.pageErrors = errs; console.error('page errors', errs); }
      metrics.runs.push(run);
    }
  } finally { await browser.close(); srv.stop(); }
  writeFileSync(join(out, 'profile-metrics.json'), JSON.stringify(metrics, null, 1));
  const worst = Math.min(...metrics.runs.map((r) => r.sides.port.strict.silhouetteIoU));
  console.log(`RESULT: port silhouette IoU min ${worst.toFixed(4)} (target >= ${minIoU}) ${worst >= minIoU ? 'OK' : 'BELOW TARGET'}`);
  if (worst < minIoU) process.exitCode = 1;
}

if (import.meta.main) await main();
