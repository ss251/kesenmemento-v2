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
  // [v4:polish3] forest / cedar darkened toward the aerial photo's canopy (dense dark 杉 on every hill; the old #6f9a5c
  // read as a lime meadow beyond the 3D trees)
  { id: "forest", color: "#3d6b3f" }, { id: "cedar", color: "#2f5634" }, { id: "grass", color: "#9fc076" }, { id: "field", color: "#bccb86" },
  // [v5:fix1] town ground and paving at the asphalt / gravel brightness of Google Earth 2026-03-11 (Earth lum 117-141 over
  // the unbuilt lots of 魚町, 南町, 八日町 and the market south; the old pale beige #bdb7aa / #c9c5bc rendered at ~200)
  { id: "dirt", color: "#cbb792" }, { id: "sand", color: "#e2d4ae" }, { id: "paving", color: "#787577" }, { id: "town", color: "#6d696b" }, { id: "water", color: "#6f9fbf" },
  // [v5:fix2] a clear-cut slope: bare brown ground with stumps (Earth 2026-03-11 c1-c, above 八日町); only the override
  // use `felled` paints it (the photo's tan stays dirt / sand)
  { id: "felled", color: "#7f6b57" },
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
/** The neutralised HSV of a photo pixel (the GSI photos carry a green cast: town grey is neutralised first). */
export function photoHSV(r, g, b) { return hsv(Math.min(255, r * 1.1), g, Math.min(255, b * 1.05)); }
/** [v5:fix2] Where the hills are 杉 plantations (Google Earth 2026-03-11 c1-c, c1-d: 安波山 and the slopes behind 八日町
 *  and 魚町 are dark sugi with bare brown broadleaf): cells c1, c2 and c5 (data/anime/cells.json), ground above 30 m. */
export const CEDAR_CELLS = [[-700, -800, -200, -200], [-200, -800, 300, -200], [-700, -200, -200, 400]];
export const inCedarCells = (x, z) => CEDAR_CELLS.some(([x0, z0, x1, z1]) => x >= x0 && x < x1 && z >= z0 && z < z1);
/** [v5:fix2] A canopy pixel on the cedar hills is cedar when its hue is over 95 or its value under 0.45. */
export const cedarCanopy = (h, v) => h > 95 || v < 0.45;
/** [v5:fix2] The core town: the grey-ground-far-from-buildings rule (grass / field) holds only outside it (ground over
 *  8 m, or beyond 1.5 km of (250, 150)); the cleared core is grey or tan ground with few buildings, and Earth
 *  2026 shows asphalt, gravel or bare ground there, not lawns. */
export const coreTown = (x, z, h) => h <= 8 && Math.hypot(x - 250, z - 150) <= 1500;
/** [v6:c4e] sand above this ground height (m), away from buildings, is a bare cut or clear-cut (felled), not a beach. */
export const SAND_HILL_H = 12;
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

/** One majority pass over a (2R+1)^2 window -> a new class array. */
function majority(a, size, R) {
  const o = new Uint8Array(a.length), cnt = new Uint16Array(CLASSES.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    cnt.fill(0);
    for (let dy = -R; dy <= R; dy++) { const yy = Math.min(size - 1, Math.max(0, y + dy)) * size; for (let dx = -R; dx <= R; dx++) cnt[a[yy + Math.min(size - 1, Math.max(0, x + dx))]]++; }
    let best = a[y * size + x], bc = cnt[best]; for (let c = 0; c < cnt.length; c++) if (cnt[c] > bc) { bc = cnt[c]; best = c; }
    o[y * size + x] = best;
  }
  return o;
}
/** Scanline fill of a ring (and holes) on the class grid: pixel centres inside get class c. -> pixels set */
function fillRing(a, size, x0, z0, px, pz, ring, holes, c, only = null) {
  let zMin = Infinity, zMax = -Infinity, set = 0;
  for (const p of ring) { zMin = Math.min(zMin, p[1]); zMax = Math.max(zMax, p[1]); }
  const j0 = Math.max(0, Math.floor((zMin - z0) / pz)), j1 = Math.min(size - 1, Math.ceil((zMax - z0) / pz));
  const rings = [ring, ...(holes || [])];
  for (let j = j0; j <= j1; j++) {
    const z = z0 + (j + 0.5) * pz, xs = [];
    for (const R of rings) for (let i = 0, k = R.length - 1; i < R.length; k = i++) { const [xi, zi] = R[i], [xk, zk] = R[k]; if ((zi > z) !== (zk > z)) xs.push(xi + (z - zi) / (zk - zi) * (xk - xi)); }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / px - 0.5)), i1 = Math.min(size - 1, Math.floor((xs[q + 1] - x0) / px - 0.5));
      for (let i = i0; i <= i1; i++) { const k = j * size + i; if (only && !only.has(a[k])) continue; a[k] = c; set++; }
    }
  }
  return set;
}
const SURFACE_CLASS = { parking: 6, apron: 6, plaza: 6, levee: 6, gravel: 7, grave: 7, construction: 7, felled: 9, forest: 0, cedar: 1 };
/** [v5:fix2] Paint the known surfaces over the photo classes: every lot footprint (OBB) is town ground; every car park,
 *  override apron, plaza, gravel lot and building site is paving or town ground; override forest / cedar / felled are
 *  forest, cedar and bare ground. Woods are not painted over by a lot (a hillside shed in the trees). */
function forceSurfaces(a, size, x0, z0, px, pz) {
  const st = { lots: 0 };
  const OPENG = new Set([2, 3, 4, 5, 6, 7, 8]);
  for (const l of L.LOTS) {
    const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), hw = o.w / 2, hd = o.d / 2;
    // lot local x / z -> world (three.js rotation.y): x' = x cos + z sin, z' = -x sin + z cos
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [o.cx + u * c + v * s, o.cz - u * s + v * c]);
    st.lots += fillRing(a, size, x0, z0, px, pz, ring, null, 7, OPENG);
  }
  for (const lu of L.LANDUSE || []) {
    const ovr = String(lu.type || "").startsWith("override:");
    let c = SURFACE_CLASS[lu.cls];
    if (c == null) continue;
    if ((lu.cls === "forest" || lu.cls === "plaza") && !ovr) continue;   // OSM woods: the photo decides; OSM plazas are often green squares
    if (!lu.ring?.length) continue;
    st[lu.cls] = (st[lu.cls] || 0) + fillRing(a, size, x0, z0, px, pz, lu.ring, lu.holes, c);
  }
  return st;
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
    if (c !== 4 && c !== 5 && c !== 6 && c !== 7) continue;
    const wx = meta.x0 + (x + 0.5) / size * W, wz = meta.z0 + (y + 0.5) / size * H;
    const h = L.heightAt(wx, wz);
    if (h > hMin + ((x * 7 + y * 13) % 11)) a[k] = c === 5 ? 9 : h > 120 && (x + y) % 3 === 0 ? 1 : 0;   // [v6:c4e] bright tan (sand) on a hill is a bare cut / clear-cut: felled, not cream sand
  }
  // [v5:fix2] the cedar hills of c1, c2 and c5: canopy above 30 m is 杉 when it is blue-green or dark
  let cedarN = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x; if (a[k] !== 0) continue;
    const wx = meta.x0 + (x + 0.5) / size * W, wz = meta.z0 + (y + 0.5) / size * H;
    if (!inCedarCells(wx, wz) || L.heightAt(wx, wz) <= 30) continue;
    const [hh, , vv] = photoHSV(data[k * 3], data[k * 3 + 1], data[k * 3 + 2]);
    if (cedarCanopy(hh, vv)) { a[k] = 1; cedarN++; }
  }
  if (cedarN) console.error(`[landcover ${name}] cedar hills: ${cedarN} px forest -> cedar`);
  // building density (footprint centres, blurred ~50 m): grey ground far from buildings is fields / paddies, not town
  const bd = new Float32Array(n);
  for (const l of L.LOTS) {
    const x = Math.floor((l.obb.cx - meta.x0) / W * size), y = Math.floor((l.obb.cz - meta.z0) / H * size);
    if (x >= 0 && y >= 0 && x < size && y < size) bd[y * size + x] += 1;
  }
  const RB = Math.max(1, Math.round(50 / (W / size)));
  const bdb = boxBlur(bd, size, RB);
  for (let k = 0; k < n; k++) {
    if (!((a[k] === 6 || a[k] === 7 || a[k] === 4) && bdb[k] < 0.002 * (W / size) * (W / size) / 4)) continue;
    const x = k % size, y = (k / size) | 0, wx = meta.x0 + (x + 0.5) / size * W, wz = meta.z0 + (y + 0.5) / size * H;
    if (coreTown(wx, wz, L.heightAt(wx, wz))) continue;   // [v5:fix2] not in the cleared core town
    a[k] = (k * 2654435761 >>> 0) % 7 === 0 ? 2 : 3;
  }
  // [v6:c4e] bare-cut sand away from the town. The aerial photo (2020-22) shows the 三陸沿岸道路 works as bare cream cuts and
  // the hill rule above only reaches ground over 36 m, but the cuts sit at 15-45 m: Earth 2026-03-11 shows the road finished and
  // the slopes dormant tan-brown grass (L* about 47 = `felled`), nowhere cream. Sand over SAND_HILL_H m (a beach is under 6 m)
  // with no building within about 50 m is felled ground. Real sand stays: beaches, and any quarry that Earth confirms.
  let sandN = 0;
  for (let k = 0; k < n; k++) {
    if (a[k] !== 5 || bdb[k] >= 0.002 * (W / size) * (W / size) / 4) continue;
    const x = k % size, y = (k / size) | 0, wx = meta.x0 + (x + 0.5) / size * W, wz = meta.z0 + (y + 0.5) / size * H;
    if (L.heightAt(wx, wz) > SAND_HILL_H) { a[k] = 9; sandN++; }
  }
  if (sandN) console.error(`[landcover ${name}] bare-cut sand over ${SAND_HILL_H} m, away from buildings: ${sandN} px sand -> felled`);
  // [v4:polish3] the working quays: the apron between the harbour road and the berths is concrete and asphalt (aerial z18,
  // 港町 / 魚市場前), but its weedy joints and the photo's green cast read as a lawn strip. Grass / field within 25 m of a
  // quay or seawall on low ground (< 5 m) is paving; the forest of 神明崎 and the hills stays.
  const px = W / size, Rq = 25, cellQ = 32;
  const qh = new Map();
  for (const q of L.QUAYS) {
    if (q.kind !== "quay" && q.kind !== "seawall") continue;
    const x0 = Math.floor((Math.min(q.a[0], q.b[0]) - Rq) / cellQ), x1 = Math.floor((Math.max(q.a[0], q.b[0]) + Rq) / cellQ);
    const z0 = Math.floor((Math.min(q.a[1], q.b[1]) - Rq) / cellQ), z1 = Math.floor((Math.max(q.a[1], q.b[1]) + Rq) / cellQ);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const key = i + "," + j; let c = qh.get(key); if (!c) qh.set(key, (c = [])); c.push(q); }
  }
  const nearQuay = (x, z) => {
    for (const q of qh.get(Math.floor(x / cellQ) + "," + Math.floor(z / cellQ)) || []) {
      const dx = q.b[0] - q.a[0], dz = q.b[1] - q.a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - q.a[0]) * dx + (z - q.a[1]) * dz) / l2));
      if (Math.hypot(q.a[0] + dx * t - x, q.a[1] + dz * t - z) < Rq) return true;
    }
    return false;
  };
  let apron = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = y * size + x; if (a[k] !== 2 && a[k] !== 3) continue;
    const wx = meta.x0 + (x + 0.5) * px, wz = meta.z0 + (y + 0.5) / size * H;
    if (L.heightAt(wx, wz) < 5 && nearQuay(wx, wz)) { a[k] = 6; apron++; }
  }
  if (apron) console.error(`[landcover ${name}] quay apron: ${apron} px grass -> paving`);
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
  const fb0 = blur(fm);
  // photo "water" on land is shade or ponds: the sea and rivers come from the grids, so paint it as forest shade or town ground
  for (let k = 0; k < n; k++) if (a[k] === 8) a[k] = fb0[k] > 0.25 ? 1 : 7;
  // [v5:fix2] smooth the class edges: one 5x5 majority pass (the 2 m classes with only the 3x3 filter left stair-steps)
  a = majority(a, size, 2);
  // [v5:fix2] surfaces we know: town ground under every footprint, paving on every car park and override apron, gravel
  // and building site; the override woods, 杉 and clear-cuts (data/anime/overrides, docs/anime/OVERRIDES.md)
  const forced = forceSurfaces(a, size, meta.x0, meta.z0, W / size, H / size);
  console.error(`[landcover ${name}] forced: ${JSON.stringify(forced)}`);
  // forest density from the final classes (an override wood or clear-cut moves the crowns too)
  for (let k = 0; k < n; k++) fm[k] = a[k] === 0 || a[k] === 1 ? 1 : 0;
  const fb = blur(fm);
  const out = Buffer.alloc(n * 3), fo = Buffer.alloc(n);
  const hist = new Array(CLASSES.length).fill(0);
  for (let k = 0; k < n; k++) { const c = PAL[a[k]]; out[k * 3] = c[0]; out[k * 3 + 1] = c[1]; out[k * 3 + 2] = c[2]; fo[k] = Math.round(Math.min(1, fb[k]) * 255); hist[a[k]]++; }
  // [v5:fix2] a 1 px feather: a pixel on a class edge takes the mean colour of its 3x3 neighbourhood
  const out2 = Buffer.from(out);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const k = y * size + x, c = a[k];
    if (a[k - 1] === c && a[k + 1] === c && a[k - size] === c && a[k + size] === c) continue;
    for (let ch = 0; ch < 3; ch++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += out[((y + dy) * size + x + dx) * 3 + ch]; out2[k * 3 + ch] = Math.round(s / 9); }
  }
  out2.copy(out);
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
