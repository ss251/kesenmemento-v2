// [v3:foundation] Land cover from the aerial photos, snapped to the anime ground palette.
//   env -u NODE_OPTIONS bun run scripts/anime/build-landcover.js
// -> data/anime/landcover_core.png  2048x2048 over data/ortho/core.jpg's bbox (~2.1 m/px)
//    data/anime/landcover_city.png  1024x1024 over data/ortho/city.jpg's bbox (~17 m/px)
//    data/anime/landcover.json      bboxes (ENU) + class legend
// landcover_*.png RGB = painted ground colour (forest / cedar / grass / field / dirt / sand / paving / town ground);
// forest_*.png grey = forest density (0..255, blurred), used by the terrain shader for tree crowns and by the forest scatter. Classes are cleaned with a
// 3x3 majority filter so the ground reads as flat painted areas, never photo noise.
import sharp from "sharp";
import { join } from "node:path";
import { ROOT } from "../terrain/tiles.js";
import * as L from "../../src/anime/world/layout.js";

export const CLASSES = [
  { id: "forest", color: "#6f9a5c" }, { id: "cedar", color: "#557f5b" }, { id: "grass", color: "#9fc076" }, { id: "field", color: "#bccb86" },
  { id: "dirt", color: "#cbb792" }, { id: "sand", color: "#e2d4ae" }, { id: "paving", color: "#c9c5bc" }, { id: "town", color: "#bdb7aa" }, { id: "water", color: "#6f9fbf" },
];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL = CLASSES.map((c) => hex(c.color));

function boxBlur(src, size, R) {
  const n = size * size, t = new Float32Array(n), o = new Float32Array(n);
  for (let y = 0; y < size; y++) { let s = 0; for (let x = -R; x <= R; x++) s += src[y * size + Math.min(size - 1, Math.max(0, x))]; for (let x = 0; x < size; x++) { t[y * size + x] = s / (2 * R + 1); s += src[y * size + Math.min(size - 1, x + R + 1)] - src[y * size + Math.max(0, x - R)]; } }
  for (let x = 0; x < size; x++) { let s = 0; for (let y = -R; y <= R; y++) s += t[Math.min(size - 1, Math.max(0, y)) * size + x]; for (let y = 0; y < size; y++) { o[y * size + x] = s / (2 * R + 1); s += t[Math.min(size - 1, y + R + 1) * size + x] - t[Math.max(0, y - R) * size + x]; } }
  return o;
}
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
/** Pixel -> class index. Exported for tests. */
export function classify(r, g, b) {
  r = Math.min(255, r * 1.1); b = Math.min(255, b * 1.05);   // the GSI photos carry a green cast: neutralise town grey first
  const [h, s, v] = hsv(r, g, b);
  const exg = 2 * g - r - b;                             // excess green
  if (b > r + 12 && b > g - 4 && v < 0.55 && s > 0.2) return 8;          // water
  if (exg > 26 && v < 0.56) return h > 105 && v < 0.4 ? 1 : 0;          // canopy: cedar / mixed forest
  if (exg > 34) return 2;                                                 // bright lush green: grass
  if (exg > 12) return h < 80 ? 3 : 2;                                    // light green: field / grass
  if (s > 0.16 && h >= 18 && h < 60 && v > 0.45) return v > 0.7 ? 5 : 4; // tan: sand / bare ground
  if (s < 0.12 && v > 0.62) return 6;                                     // bright grey: paving / concrete
  return 7;                                                               // town ground
}

async function build(name, size) {
  const meta = await Bun.file(join(ROOT, `data/ortho/${name}.json`)).json();
  const { data } = await sharp(join(ROOT, `data/ortho/${name}.jpg`), { limitInputPixels: false }).resize(size, size, { kernel: "cubic" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = size * size, cls = new Uint8Array(n);
  for (let k = 0; k < n; k++) cls[k] = classify(data[k * 3], data[k * 3 + 1], data[k * 3 + 2]);
  // 3x3 majority filter, twice
  let a = cls, bb = new Uint8Array(n);
  for (let pass = 0; pass < 2; pass++) {
    const cnt = new Uint8Array(CLASSES.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.min(size - 1, Math.max(0, x + dx)), yy = Math.min(size - 1, Math.max(0, y + dy)); cnt[a[yy * size + xx]]++; }
      let best = a[y * size + x], bc = 0; for (let c = 0; c < cnt.length; c++) if (cnt[c] > bc) { bc = cnt[c]; best = c; }
      bb[y * size + x] = best;
    }
    [a, bb] = [bb, a];
  }
  // hills: GSI photos read shaded canopy as grey ground at this scale; above the town line it is forest (杉 on the steepest)
  const W = meta.width * meta.dx, H = meta.height * meta.dz, hMin = name === "core" ? 36 : 28;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x, c = a[k];
    if (c !== 4 && c !== 6 && c !== 7) continue;
    const wx = meta.x0 + (x + 0.5) / size * W, wz = meta.z0 + (y + 0.5) / size * H;
    const h = L.heightAt(wx, wz);
    if (h > hMin + ((x * 7 + y * 13) % 11)) a[k] = h > 120 && (x + y) % 3 === 0 ? 1 : 0;
  }
  // building density (footprint centres, blurred ~50 m): grey ground far from buildings is fields / paddies, not town
  const bd = new Float32Array(n);
  for (const l of L.LOTS) {
    const x = Math.floor((l.obb.cx - meta.x0) / W * size), y = Math.floor((l.obb.cz - meta.z0) / H * size);
    if (x >= 0 && y >= 0 && x < size && y < size) bd[y * size + x] += 1;
  }
  const RB = Math.max(1, Math.round(50 / (W / size)));
  const bdb = boxBlur(bd, size, RB);
  for (let k = 0; k < n; k++) if ((a[k] === 6 || a[k] === 7 || a[k] === 4) && bdb[k] < 0.002 * (W / size) * (W / size) / 4) a[k] = (k * 2654435761 >>> 0) % 7 === 0 ? 2 : 3;
  // forest density (box blur of the forest classes)
  const fm = new Float32Array(n);
  for (let k = 0; k < n; k++) fm[k] = a[k] === 0 || a[k] === 1 ? 1 : 0;
  const R = Math.max(1, Math.round(size / 700));
  const blur = (src) => {
    const t = new Float32Array(n), o = new Float32Array(n);
    for (let y = 0; y < size; y++) { let s = 0; for (let x = -R; x <= R; x++) s += src[y * size + Math.min(size - 1, Math.max(0, x))]; for (let x = 0; x < size; x++) { t[y * size + x] = s / (2 * R + 1); s += src[y * size + Math.min(size - 1, x + R + 1)] - src[y * size + Math.max(0, x - R)]; } }
    for (let x = 0; x < size; x++) { let s = 0; for (let y = -R; y <= R; y++) s += t[Math.min(size - 1, Math.max(0, y)) * size + x]; for (let y = 0; y < size; y++) { o[y * size + x] = s / (2 * R + 1); s += t[Math.min(size - 1, y + R + 1) * size + x] - t[Math.max(0, y - R) * size + x]; } }
    return o;
  };
  const fb = blur(fm);
  // photo "water" on land is shade or ponds: the sea and rivers come from the grids, so paint it as forest shade or town ground
  for (let k = 0; k < n; k++) if (a[k] === 8) a[k] = fb[k] > 0.25 ? 1 : 7;
  const out = Buffer.alloc(n * 3), fo = Buffer.alloc(n);
  const hist = new Array(CLASSES.length).fill(0);
  for (let k = 0; k < n; k++) { const c = PAL[a[k]]; out[k * 3] = c[0]; out[k * 3 + 1] = c[1]; out[k * 3 + 2] = c[2]; fo[k] = Math.round(Math.min(1, fb[k]) * 255); hist[a[k]]++; }
  await sharp(out, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(ROOT, `data/anime/landcover_${name}.png`));
  await sharp(fo, { raw: { width: size, height: size, channels: 1 } }).png({ compressionLevel: 9 }).toFile(join(ROOT, `data/anime/forest_${name}.png`));
  return { file: `landcover_${name}.png`, forest: `forest_${name}.png`, size, x0: meta.x0, z0: meta.z0, x1: meta.x0 + W, z1: meta.z0 + H, hist: Object.fromEntries(CLASSES.map((c, i) => [c.id, +(hist[i] / n).toFixed(3)])) };
}

if (import.meta.main) {
  const t0 = performance.now();
  const core = await build("core", 2048), city = await build("city", 1024);
  const meta = { version: 1, classes: CLASSES, core, city };
  await Bun.write(join(ROOT, "data/anime/landcover.json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), core: core.hist, city: city.hist }));
}
