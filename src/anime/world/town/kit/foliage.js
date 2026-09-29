// [v3:town] copied from src/anime/world/_houses/foliage.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation]
// Shared smooth cel-shaded foliage (shrubs, hedges, topiary, cloud-pruned trees). Import from any module:
//   import { makeShrub, makeHedge, shrubGeometry } from './lib/foliage.js'   (from src/world/*.js)
//   import { makeShrub, makeHedge } from '../lib/foliage.js'                 (from src/world/<module>/*.js)
//
// Why: faceted low-poly blobs (Icosahedron / toNonIndexed / flat normals) turn into hard polygon
// bands under toon lighting and the outline pass draws a line on every facet edge. These shapes are
// welded, indexed, smoothly displaced "cloud" surfaces whose normals are blended toward the overall
// ellipsoid normal, so the 3-band toon ramp gives soft painted terminators and clean silhouettes.
// The surface is built from round leaf "puffs" (dart-thrown on the surface, smooth-union domes) so the
// silhouette is scalloped like a painted bush, with darker valleys between puffs baked into colour.
// Colour (top highlight -> body -> blue-green base) is baked into vertex colours and all shrubs share
// ONE material, so the static batcher merges every shrub in a cell into a single draw call.
//
// API (all sizes in metres, origin = ground contact centre, every geometry is cached by its options):
//   shrubGeometry({rx, ry, rz, seed, colors, lumps, freq, square, flatBottom, puff, puffAmp, detail,
//                  spacing, normalBlend, cutBottom, dark})            -> indexed BufferGeometry (+color)
//   hedgeGeometry({length, h, d, seed, colors, puff, puffAmp, lumps, spacing, ground(x)->dy, round, dark})
//   flowerGeometry(geo, {count|density, size, colors, seed, minY, petals, xRange}) -> tiny 5-petal blossoms on it
//   makeShrub / makeHedge / makeTopiary / makeCloudTree (ctx, opts)    -> ready meshes (shared material)
//   foliageMaterial(ctx)  -> the shared toon material (vertex colours + procedural leaf-clump shading)
//   SHRUB_COLORS, FLOWER_COLORS                                        -> palette presets
//   make*(…, {flowers}): true | 'azalea' | 'azaleaWhite' | 'hydrangea' | 'camellia' | 'spirea' | {colors:[...], density, size, top}
//   Density: spacing = metres between vertices (default 0.075); use 0.1–0.14 for bulk / background planting.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function hash3(x, y, z, s) {
  let h = Math.imul((x | 0) ^ Math.imul(s, 0x27d4eb2d), 0x85ebca6b) ^ Math.imul(y | 0, 0xc2b2ae35) ^ Math.imul(z | 0, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
           L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
/** billowy cloud bumps in [0,1] */
function billow(x, y, z, s) {
  let a = 0, amp = 0.62, f = 1;
  for (let o = 0; o < 3; o++) { a += amp * (1 - Math.abs(vnoise(x * f, y * f, z * f, s + o * 17) * 2 - 1)); amp *= 0.45; f *= 2.03; }
  return a / 1.05;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Palette presets for different plants (sRGB). */
export const SHRUB_COLORS = {
  boxwood: { top: '#b3d27f', mid: '#78a85c', base: '#4d7c5b' },
  azalea: { top: '#a7c878', mid: '#6b9b58', base: '#46735a' },   // (use flowers:'azalea' for blossoms)
  camellia: { top: '#8fbd6e', mid: '#5b8f55', base: '#3d6a57' }, // darker glossy
  pine: { top: '#8db36c', mid: '#5f8a58', base: '#41665a' },
  young: { top: '#c6dc8c', mid: '#8ab866', base: '#5a8a5c' },
  privet: { top: '#a9cc78', mid: '#6f9f5a', base: '#4a7859' },   // イボタ / 生け垣 green
  maple: { top: '#c2da8a', mid: '#94bd6c', base: '#62905e' },    // fresh spring momiji
  olive: { top: '#b9c79e', mid: '#95a882', base: '#6c7f6c' },    // silvery
  dark: { top: '#83ad69', mid: '#557f55', base: '#3a6353' },     // osmanthus / holly / shrine evergreen
  veg: { top: '#bcd98a', mid: '#88b766', base: '#5f8d5a' },      // cabbage / lettuce rows
};
/** Blossom colour presets (sRGB). */
export const FLOWER_COLORS = {
  azalea: ['#ee8fb6', '#e8739f', '#f4a9c6', '#dd6a98'],          // 平戸ツツジ pink / magenta
  azaleaWhite: ['#f6f1f2', '#fbe6ee', '#f3eef0'],
  azaleaMix: ['#ee8fb6', '#e8739f', '#f6f1f2', '#f4a9c6'],
  hydrangea: ['#a9b8e6', '#b9b0e0', '#9fc3e3', '#c7b7e4'],
  camellia: ['#d9485a', '#e0606f', '#ef8fa6'],
  spirea: ['#f7f5f0', '#eef0ea'],
  yellow: ['#f2cf4a', '#f5dc6e'],
  mixed: ['#f2c230', '#e8697a', '#f4f0e6', '#b48ad6', '#f29a5c', '#ef9fbe'],
};
function flowerSpec(f) {
  if (!f) return null;
  if (f === true) return { colors: FLOWER_COLORS.azalea, density: 1, size: 1 };
  if (typeof f === 'string') return { colors: FLOWER_COLORS[f] || FLOWER_COLORS.azalea, density: 1, size: 1 };
  return { colors: f.colors || FLOWER_COLORS[f.kind] || FLOWER_COLORS.azalea, density: f.density ?? 1, size: f.size ?? 1, top: f.top ?? 0.3, xRange: f.xRange || null };
}

// ------------------------------------------------------------------------------------ core helpers
const _ico = new Map();
function icoBase(detail) {
  let g = _ico.get(detail);
  if (!g) { g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-5); _ico.set(detail, g); }
  return g.clone();
}

/** Dart-throw puff centres on the (base) surface vertices. ok(i) filters candidates. Returns [x,y,z,R]. */
function samplePuffs(P, n, cell, seed, ok) {
  const order = new Array(n);
  for (let i = 0; i < n; i++) order[i] = [hash3(i, 7, 3, seed), i];
  order.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [, i] of order) {
    if (ok && !ok(i)) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const md = cell * (0.8 + 0.3 * hash3(i, 1, 9, seed)), md2 = md * md;
    let good = true;
    for (let k = 0; k < out.length; k++) { const q = out[k]; const dx = q[0] - x, dy = q[1] - y, dz = q[2] - z; if (dx * dx + dy * dy + dz * dz < md2) { good = false; break; } }
    if (good) out.push([x, y, z, cell * (0.66 + 0.26 * hash3(i, 5, 2, seed))]);
  }
  return out;
}
/** Smooth union of dome profiles at point (x,y,z): returns [h (0 valley .. 1 puff centre), second best]. */
function puffField(puffs, x, y, z, grid, shape = 0.55) {
  let s = 0, h1 = 0, h2 = 0;
  const list = grid ? grid(x, y, z) : puffs;
  for (let k = 0; k < list.length; k++) {
    const q = list[k]; const dx = q[0] - x, dy = q[1] - y, dz = q[2] - z; const d2 = (dx * dx + dy * dy + dz * dz) / (q[3] * q[3]);
    if (d2 >= 1) continue;
    const h = Math.pow(1 - d2, shape);
    s += Math.exp(10 * h);
    if (h > h1) { h2 = h1; h1 = h; } else if (h > h2) h2 = h;
  }
  const hs = s > 0 ? Math.max(0, Math.min(1, Math.log(s) / 10)) : 0;
  return [hs, h1 - h2];
}
/** Spatial hash for puff lookups (big hedges). */
function puffGrid(puffs, cell) {
  const m = new Map(), c = cell * 1.1;
  const key = (i, j, k) => i * 73856093 ^ j * 19349663 ^ k * 83492791;
  for (const q of puffs) { const i = Math.floor(q[0] / c), j = Math.floor(q[1] / c), k = Math.floor(q[2] / c); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) { const kk = key(i + a, j + b, k + d); let l = m.get(kk); if (!l) m.set(kk, (l = [])); l.push(q); } }
  const empty = [];
  return (x, y, z) => m.get(key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c))) || empty;
}

/** Bake vertex colours: vertical gradient, puff light/valley dark, leaf-clump patches. */
function bakeColors(g, o) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  const C = o.colors || {};
  const top = new THREE.Color(C.top || '#a9cf7c'), mid = new THREE.Color(C.mid || '#6fa35c'), low = new THREE.Color(C.base || '#4a7a5a');
  const col = new Float32Array(n * 3), c = new THREE.Color();
  const H = o.H, seed = o.seed, ph = o.puffH, vl = o.valley, dark = o.dark ?? 0.2;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / H; // 0..~1
    if (t > 0.55) c.copy(mid).lerp(top, smooth(0.55, 1.0, t)); else c.copy(low).lerp(mid, smooth(0.0, 0.55, t));
    const v = vnoise(x * 1.7 + 3, y * 1.7, z * 1.7 - 2, seed + 91) - 0.5;
    c.offsetHSL(v * 0.02, v * 0.05, v * 0.05);
    if (ph) {
      const h = ph[i], ny = nor.getY(i);
      // lit puff crowns (upper, facing up/outward) and cool dark pockets between the puffs
      if (h > 0.55 && ny > 0.1 && t > 0.3) c.lerp(top, 0.28 * smooth(0.55, 0.95, h) * smooth(0.1, 0.6, ny));
      c.multiplyScalar(1 - dark + dark * smooth(0.05, 0.5, h));
      if (vl && vl[i] < 0.12 && h < 0.45) c.multiplyScalar(0.93);
    } else {
      const cl = billow(x * 3.0 + 1.3, y * 3.0 - 2.2, z * 3.0 + 0.7, seed + 53);
      if (cl > 0.66 && t > 0.35) c.lerp(top, 0.35); else if (cl < 0.3 && t < 0.7) c.multiplyScalar(0.86);
    }
    if (o.tint) c.lerp(o.tint, o.tintAmt ?? 0.1);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Drop triangles that lie entirely below y (hidden under the ground). */
function cutBelow(g, y0) {
  const idx = g.index.array, pos = g.attributes.position, keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < y0) continue;
    keep.push(a, b, c);
  }
  g.setIndex(keep);
}

function blendNormals(g, base, blend) {
  const nor = g.attributes.normal, n = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i); b.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    n.lerp(b, blend).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

const _cache = new Map();

/** Smooth lumpy shrub geometry made of round leaf puffs.
 *  rx, ry, rz: half-extents (m). lumps: large-scale bump amount 0..0.35. freq: large bumps per metre-ish.
 *  square: 1 = ellipsoid, 2.5..4 = boxy clipped shape. flatBottom: flatten the underside.
 *  puff: puff (leaf clump) size in m (auto from size; 0 = no puffs). puffAmp: puff relief (0..0.5, rel. to puff).
 *  detail / spacing: mesh density (icosphere subdivision, or target vertex spacing in m, default 0.075).
 *  seg: legacy (UV-sphere segments) — still accepted as a density hint.
 *  seed: variation. colors: {top, mid, base} sRGB hex — baked as vertex colours (linear).
 *  dark: valley darkening (0.2). cutBottom: drop the hidden underside (default true). */
export function shrubGeometry(o = {}) {
  const rx = o.rx ?? 0.6, ry = o.ry ?? 0.5, rz = o.rz ?? 0.6;
  const lumps = o.lumps ?? 0.22, freq = o.freq ?? 2.2, square = o.square ?? 1, seed = (o.seed ?? 1) | 0;
  const size = Math.max(rx, ry, rz), reff = (rx + ry + rz) / 3;
  let detail = o.detail;
  if (detail === undefined) {
    const sp = o.spacing ?? (o.seg ? (Math.PI * 2 * reff) / o.seg : 0.075);
    detail = Math.round((reff * 1.1) / sp) - 1;
  }
  detail = Math.max(1, Math.min(o.maxDetail ?? 11, detail | 0));
  const spacing = (reff * 1.1) / (detail + 1);
  const puff = o.puff ?? Math.max(spacing * 3.6, Math.min(0.55, 0.16 + size * 0.3));
  const puffAmp = o.puffAmp ?? 0.42;
  const puffShape = o.puffShape ?? 0.5;
  const flat = o.flatBottom ?? true;
  const key = JSON.stringify(['s2', rx, ry, rz, lumps, freq, square, seed, detail, flat, o.colors || null, puff, puffAmp, o.normalBlend ?? null, o.cutBottom ?? true, o.scallop ?? null, puffShape, o.dark ?? null]);
  if (_cache.has(key)) return _cache.get(key);

  const g = icoBase(detail);
  const pos = g.attributes.position, n = pos.count;
  const base = new Float32Array(n * 3); // ellipsoid normals for blending / displacement
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    if (square > 1) { // superellipsoid for boxy clipped shapes
      const e = 2 / square, sgn = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
      p.set(sgn(p.x), sgn(p.y), sgn(p.z));
    }
    const d = p.clone().normalize();
    const bump = billow(d.x * freq * size + 11.3, d.y * freq * size + 3.7, d.z * freq * size - 5.1, seed);
    let r = 1 + lumps * (bump - 0.55);
    if (o.scallop) { const sf = 3.2 * size; r += o.scallop * (billow(d.x * sf + 2.1, d.y * sf - 7.3, d.z * sf + 4.4, seed + 37) - 0.5); }
    p.multiplyScalar(r);
    p.set(p.x * rx, p.y * ry, p.z * rz);
    if (flat && p.y < -ry * 0.55) p.y = -ry * 0.55 + (p.y + ry * 0.55) * 0.25;
    pos.setXYZ(i, p.x, p.y + ry * 0.55, p.z); // origin at the ground contact
    nn.set(p.x / (rx * rx), p.y / (ry * ry), p.z / (rz * rz)).normalize();
    if (square > 1) nn.set(Math.sign(p.x) * Math.pow(Math.abs(p.x / rx), square - 1) / rx, Math.sign(p.y) * Math.pow(Math.abs(p.y / ry), square - 1) / ry, Math.sign(p.z) * Math.pow(Math.abs(p.z / rz), square - 1) / rz).normalize();
    base[i * 3] = nn.x; base[i * 3 + 1] = nn.y; base[i * 3 + 2] = nn.z;
  }
  const H = ry * 2 * 0.86;
  // ---- leaf puffs
  let ph = null, vl = null;
  if (puff > 0 && puffAmp > 0) {
    const P = pos.array;
    const puffs = samplePuffs(P, n, puff, seed + 3, (i) => P[i * 3 + 1] > H * 0.08);
    ph = new Float32Array(n); vl = new Float32Array(n);
    const amp = puffAmp * puff;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const [h, sep] = puffField(puffs, x, y, z, null, puffShape);
      ph[i] = h; vl[i] = sep;
      const fade = smooth(0.0, H * 0.22, y); // keep the ground contact clean
      const dd = amp * (h - 0.5) * fade;
      pos.setXYZ(i, x + base[i * 3] * dd, y + base[i * 3 + 1] * dd * 0.9, z + base[i * 3 + 2] * dd);
    }
  }
  g.computeVertexNormals();
  blendNormals(g, base, o.normalBlend ?? (ph ? 0.6 : 0.55));
  bakeColors(g, { colors: o.colors, H, seed, puffH: ph, valley: vl, dark: o.dark });
  if (o.cutBottom ?? true) cutBelow(g, -0.004);
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.foliage = { H, spacing, puff };
  _cache.set(key, g);
  return g;
}

/** Clipped hedge (生け垣) geometry: a lofted rounded box (flat top, soft rounded edges, rounded ends)
 *  covered with gentle leaf puffs. Length along local X, centred; origin = ground centre; open bottom.
 *  ground(x) -> dy lets the hedge follow sloping ground (local x in [-length/2, length/2]). */
export function hedgeGeometry(o = {}) {
  const L = o.length ?? 3, h = o.h ?? 1.0, d = o.d ?? 0.7, seed = (o.seed ?? 3) | 0;
  const sp = o.spacing ?? 0.13;
  const cacheable = !o.ground;
  const key = cacheable ? JSON.stringify(['h2', L, h, d, seed, sp, o.colors || null, o.puff ?? null, o.puffAmp ?? null, o.lumps ?? null, o.round ?? null, o.normalBlend ?? null, o.dark ?? null]) : null;
  if (key && _cache.has(key)) return _cache.get(key);
  const a = d / 2;
  const rTop = Math.min(h * 0.45, Math.max(0.14, a * (o.round ?? 0.85)));  // top edge rounding (vertical)
  const yc = h - rTop, y0 = -0.06;
  const capR = Math.min(a * 1.05, L * 0.45);
  // ring positions along x: dense cosine spacing in the caps, uniform in between
  const xs = [];
  const nCap = Math.max(4, Math.ceil((capR * Math.PI / 2) / sp) + 1);
  for (let k = 0; k < nCap; k++) { const t = Math.cos((k / nCap) * Math.PI / 2); xs.push([-L / 2 + capR * (1 - t), t]); }
  const mid0 = -L / 2 + capR, mid1 = L / 2 - capR, nm = Math.max(1, Math.round((mid1 - mid0) / sp));
  for (let k = 0; k <= nm; k++) xs.push([mid0 + (mid1 - mid0) * k / nm, 0]);
  for (let k = nCap - 1; k >= 0; k--) { const t = Math.cos((k / nCap) * Math.PI / 2); xs.push([L / 2 - capR * (1 - t), t]); }
  // caps: t = cos(phi) (1 at the tip); the plan outline is a circle of radius capR, e = sin(phi) scales the profile.
  // profile: front vertical side (y0 -> yc), top arc (superellipse, n=3.2), back vertical side (yc -> y0)
  const nSide = Math.max(2, Math.round((yc - y0) / (sp * 1.05)));
  const nArc = o.arcSeg ?? Math.max(8, Math.round((Math.PI * (a + rTop) / 2) / (sp * 0.72)));
  const prof = []; // [zUnit (-1..1 of a), yLocal, isArc(0..1 angle)]
  for (let k = 0; k < nSide; k++) prof.push([1, y0 + (yc - y0) * k / nSide, -1]);
  const ne = 2 / 3.2, sg = (v) => Math.sign(v) * Math.pow(Math.abs(v), ne);
  for (let k = 0; k <= nArc; k++) { const th = (k / nArc) * Math.PI; prof.push([sg(Math.cos(th)), yc + rTop * sg(Math.sin(th)), th]); }
  for (let k = nSide - 1; k >= 0; k--) prof.push([-1, y0 + (yc - y0) * k / nSide, -2]);
  const nr = xs.length, np = prof.length;
  const P = new Float32Array(nr * np * 3);
  for (let i = 0; i < nr; i++) {
    const [x, t] = xs[i];
    const e = t > 0 ? Math.sqrt(Math.max(0, 1 - t * t)) : 1;       // plan: circular cap
    const ey = t > 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 1 / 2.4) : 1; // top drops slightly around the end
    for (let j = 0; j < np; j++) {
      const [zu, y, th] = prof[j];
      let yy = y;
      if (th >= 0) yy = yc + (y - yc) * (0.55 + 0.45 * ey); else yy = Math.min(y, yc);
      const k3 = (i * np + j) * 3;
      P[k3] = x; P[k3 + 1] = yy; P[k3 + 2] = zu * a * e;
    }
  }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < np - 1; j++) {
    const A = i * np + j, B = A + 1, Cc = A + np, D = Cc + 1;
    idx.push(A, Cc, B, B, Cc, D);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(idx);
  // make sure faces point outward (winding check on a mid-top quad)
  g.computeVertexNormals();
  { const nor = g.attributes.normal; const j = nSide + Math.round(nArc / 2), i = Math.floor(nr / 2); if (nor.getY(i * np + j) < 0) { const ia = g.index.array; for (let t = 0; t < ia.length; t += 3) { const tmp = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = tmp; } g.computeVertexNormals(); } }
  const pos = g.attributes.position, n = pos.count;
  const base = Float32Array.from(g.attributes.normal.array);
  // ---- lumps + puffs (gentle: this is a clipped hedge)
  const puff = o.puff ?? Math.max(sp * 3.2, Math.min(0.5, 0.26 + h * 0.12));
  const amp = (o.puffAmp ?? 0.2) * puff;
  const lumps = o.lumps ?? 0.07;
  const puffs = samplePuffs(P, n, puff, seed + 3, (i) => P[i * 3 + 1] > h * 0.12);
  const grid = puffGrid(puffs, puff);
  const ph = new Float32Array(n), vl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const [hh, sep] = puffField(null, x, y, z, grid, 0.6);
    ph[i] = hh; vl[i] = sep;
    const big = (billow(x * 0.9 + 3.1, y * 0.9, z * 0.9 - 1.7, seed) - 0.55) * lumps * Math.min(h, 1.2);
    const fade = smooth(0.0, 0.28, y);
    const dd = (amp * (hh - 0.5) + big) * fade;
    pos.setXYZ(i, x + base[i * 3] * dd, y + base[i * 3 + 1] * dd, z + base[i * 3 + 2] * dd);
  }
  g.computeVertexNormals();
  blendNormals(g, base, o.normalBlend ?? 0.5);
  bakeColors(g, { colors: o.colors, H: h, seed, puffH: ph, valley: vl, dark: o.dark ?? 0.13 });
  if (o.ground) for (let i = 0; i < n; i++) pos.setY(i, pos.getY(i) + o.ground(pos.getX(i)));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.foliage = { H: h, spacing: sp, puff };
  if (key) _cache.set(key, g);
  return g;
}

/** Tiny 5-petal blossoms scattered (area-weighted) on a foliage geometry's upper surface: flat vertex-coloured
 *  discs lifted 1 cm, normals = the shrub's so they light like the bush. opts: count (or density per m² of
 *  the upper surface, default 28), size (petal radius m, default 0.03), colors, seed, minY (0..1 of height),
 *  petals (5; 0 = plain pentagon, 5 tris). Returns an indexed geometry with a colour attribute. */
export function flowerGeometry(src, o = {}) {
  const key = src.uuid + JSON.stringify(['f', o.count, o.density, o.size, o.colors, o.seed, o.minY, o.petals, o.xRange || null]);
  if (_cache.has(key)) return _cache.get(key);
  const pos = src.attributes.position, nor = src.attributes.normal, idx = src.index ? src.index.array : null;
  const H = src.userData.foliage?.H || (src.boundingBox ? src.boundingBox.max.y : 1);
  const seed = (o.seed ?? 7) | 0, size = o.size ?? 0.03, minY = o.minY ?? 0.3, petals = o.petals ?? 5;
  const cols = (o.colors || FLOWER_COLORS.azalea).map((c) => new THREE.Color(c));
  const nt = idx ? idx.length / 3 : pos.count / 3;
  // triangle areas on the eligible (upper, outward) surface -> CDF for area-weighted sampling
  const cdf = new Float32Array(nt); let tot = 0;
  {
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3();
    for (let t = 0; t < nt; t++) {
      const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      A.fromBufferAttribute(pos, i0); B.fromBufferAttribute(pos, i1); Cv.fromBufferAttribute(pos, i2);
      const cxm = (A.x + B.x + Cv.x) / 3;
      const ok = (A.y + B.y + Cv.y) / 3 > H * minY && nor.getY(i0) + nor.getY(i1) + nor.getY(i2) > -0.3 && (!o.xRange || (cxm > o.xRange[0] && cxm < o.xRange[1]));
      if (ok) tot += B.sub(A).cross(Cv.sub(A)).length() / 2;
      cdf[t] = tot;
    }
  }
  const count = o.count ?? Math.max(1, Math.round(tot * (o.density ?? 28)));
  const pickTri = (u) => { let lo = 0, hi = nt - 1; const v = u * tot; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < v) lo = m + 1; else hi = m; } return lo; };
  const Pp = [], Nn = [], Cc = [], Ii = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), na = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const t = tot > 0 ? pickTri(hash3(tries, 13, 5, seed)) : Math.floor(hash3(tries, 13, 5, seed) * nt);
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const u = hash3(tries, 2, 8, seed), v = hash3(tries, 9, 1, seed); const su = Math.sqrt(u);
    q.set(0, 0, 0).addScaledVector(a, 1 - su).addScaledVector(b, su * (1 - v)).addScaledVector(c, su * v);
    if (q.y < H * minY) continue;
    na.fromBufferAttribute(nor, i0).add(t1.fromBufferAttribute(nor, i1)).add(t2.fromBufferAttribute(nor, i2)).normalize();
    if (na.y < -0.1) continue;
    t1.set(0, 1, 0).cross(na); if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0); t1.normalize(); t2.crossVectors(na, t1);
    const s = size * (0.8 + 0.45 * hash3(tries, 4, 4, seed)), rot = hash3(tries, 6, 6, seed) * 6.283;
    const col = cols[Math.floor(hash3(tries, 8, 2, seed) * cols.length) % cols.length];
    const ci = col.clone().multiplyScalar(0.8);
    const o0 = Pp.length / 3;
    const lift = 0.012;
    Pp.push(q.x + na.x * (lift + 0.004), q.y + na.y * (lift + 0.004), q.z + na.z * (lift + 0.004)); Nn.push(na.x, na.y, na.z); Cc.push(ci.r, ci.g, ci.b);
    const m = petals ? petals * 2 : 5;
    for (let k = 0; k < m; k++) {
      const ang = rot + (k / m) * Math.PI * 2, rr = petals && k % 2 ? s * 0.74 : s;
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      Pp.push(q.x + t1.x * x + t2.x * y + na.x * lift, q.y + t1.y * x + t2.y * y + na.y * lift, q.z + t1.z * x + t2.z * y + na.z * lift);
      Nn.push(na.x, na.y, na.z); Cc.push(col.r, col.g, col.b);
    }
    for (let k = 0; k < m; k++) Ii.push(o0, o0 + 1 + k, o0 + 1 + ((k + 1) % m));
    placed++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(Pp.length / 3 * 2), 2));
  g.setIndex(Ii);
  // winding: faces should look along +normal
  { const ia = g.index.array; if (ia.length) { a.fromArray(Pp, ia[0] * 3); b.fromArray(Pp, ia[1] * 3); c.fromArray(Pp, ia[2] * 3); const f = b.sub(a).cross(c.sub(a)); na.fromArray(Nn, ia[0] * 3); if (f.dot(na) < 0) for (let t = 0; t < ia.length; t += 3) { const tmp = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = tmp; } } }
  g.computeBoundingBox(); g.computeBoundingSphere();
  _cache.set(key, g);
  return g;
}

// ------------------------------------------------------------------------------------ material
// Shared foliage material: the cel toon material (vertex colours) + a world-space cellular "leaf clump"
// pattern in the fragment shader — each clump is lit on its sun/up side and darker underneath, with thin
// darker gaps between clumps. Solid (3D) texture => no UVs, no seams, zero triangles, stable on merged
// static meshes; it fades out with distance (per-pixel footprint) so it never shimmers.
const LEAF_GLSL = /* glsl */`
vec3 fl_h3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
vec2 fl_worley(vec3 p, out vec3 toF){
  vec3 ip = floor(p), fp = fract(p); float f1 = 8.0, f2 = 8.0; toF = vec3(0.0);
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 b = vec3(float(i), float(j), float(k)); vec3 r = b + fl_h3(ip + b) * 0.8 + 0.1 - fp; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; toF = r; } else if (d < f2) f2 = d;
  }
  return vec2(sqrt(f1), sqrt(f2));
}`;
const _fmat = new WeakMap();
/** The shared foliage material (cached per ctx.mat). opts: side ('double'), scale (clump size m, 0.2), amount (0..1). */
export function foliageMaterial(ctx, o = {}) {
  let cache = _fmat.get(ctx.mat); if (!cache) _fmat.set(ctx.mat, (cache = new Map()));
  const key = JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const m = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03, name: 'foliage-clumps' + (o.side ? '-' + o.side : ''), ...(o.side ? { side: o.side } : {}) });
  if (!m.userData.foliage) {
    m.userData.foliage = true;
    const prev = m.onBeforeCompile;
    const sc = (1 / (o.scale ?? 0.2)).toFixed(4), amt = (o.amount ?? 1).toFixed(3);
    m.onBeforeCompile = (shader, r) => {
      if (prev) prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + LEAF_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vPWorld * ${sc};
          float fw = length(fwidth(q));
          float a = ${amt} * (1.0 - smoothstep(0.3, 0.8, fw));
          if (a > 0.001) {
            // domain-warped cells => irregular leaf clumps; each clump: light crescent on its upper/sun
            // side, cool shade on its underside (stacked "cumulus" clumps of painted foliage)
            vec3 wq = q + vec3(sin(q.y * 1.7 + q.z * 1.3), sin(q.z * 1.9 + q.x * 1.1), sin(q.x * 1.5 + q.y * 1.2)) * 0.28;
            vec3 toF; vec2 w = fl_worley(wq, toF);
            vec3 cn = normalize(-toF + vec3(1e-4));
            float lit = dot(cn, normalize(vec3(-0.35, 1.0, 0.25)));
            float aa = clamp(fw * 1.2, 0.03, 0.3);
            float r1 = w.x;
            // rounded crescent highlight on the lit side of each clump, shaded rim underneath
            float hl = smoothstep(0.28 - aa, 0.28 + aa, lit) * smoothstep(0.16 - aa, 0.16 + aa, r1) * (1.0 - smoothstep(0.5 - aa, 0.5 + aa, r1));
            float sh = (1.0 - smoothstep(-0.32 - aa, -0.32 + aa, lit)) * smoothstep(0.3 - aa, 0.3 + aa, r1);
            float tone = (1.0 + 0.1 * hl) * (1.0 - 0.14 * sh);
            diffuseColor.rgb *= mix(1.0, tone, a);
          }
        }`);
    };
    m.customProgramCacheKey = () => 'paint-foliage-' + sc + '-' + amt;
  }
  cache.set(key, m);
  return m;
}
function foliageMat(ctx) { return foliageMaterial(ctx); }

/** Blossom child mesh for a foliage mesh (flowers: see header). */
function addBlossoms(ctx, m, g, flowers, seed) {
  const fl = flowerSpec(flowers); if (!fl) return;
  const fg = flowerGeometry(g, { density: 60 * fl.density, size: 0.0145 * fl.size, colors: fl.colors, seed: seed + 17, minY: fl.top ?? 0.3, xRange: fl.xRange || undefined });
  const fm = new THREE.Mesh(fg, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02 })); fm.receiveShadow = true; fm.castShadow = false; if (ctx.noOutline) ctx.noOutline(fm); m.add(fm);
}

/** Round shrub mesh. Origin = ground contact centre. opts: r (radius), h (height), sx/sz (stretch), seed,
 *  kind (SHRUB_COLORS key) or colors, lumps, freq, puff, puffAmp, spacing/detail, square,
 *  flowers ('azalea' | {colors,density,size} -> tiny petal discs added as a child mesh; alias: blossoms). */
export function makeShrub(ctx, o = {}) {
  const r = o.r ?? 0.6, h = o.h ?? r * 1.5;
  const g = shrubGeometry({ rx: r * (o.sx ?? 1), ry: h / 2, rz: r * (o.sz ?? 1), lumps: o.lumps ?? 0.16, freq: o.freq ?? 2.4, seed: o.seed ?? 1, colors: o.colors || SHRUB_COLORS[o.kind || 'boxwood'], puff: o.puff, puffAmp: o.puffAmp, spacing: o.spacing, detail: o.detail, square: o.square, normalBlend: o.normalBlend });
  const m = new THREE.Mesh(g, foliageMat(ctx));
  m.castShadow = true; m.receiveShadow = true;
  addBlossoms(ctx, m, g, o.flowers || o.blossoms, o.seed ?? 1);
  return m;
}

/** Clipped hedge (生け垣): boxy but soft. length along local X. Origin = ground centre.
 *  opts: length, h, d, seed, kind/colors, lumps, puff, puffAmp, spacing, flowers, ground(x)->dy. */
export function makeHedge(ctx, o = {}) {
  const g = hedgeGeometry({ length: o.length ?? 3, h: o.h ?? 1.0, d: o.d ?? 0.7, seed: o.seed ?? 3, colors: o.colors || SHRUB_COLORS[o.kind || 'boxwood'], lumps: o.lumps, puff: o.puff, puffAmp: o.puffAmp, spacing: o.spacing, ground: o.ground, round: o.round });
  const m = new THREE.Mesh(g, foliageMat(ctx));
  m.castShadow = true; m.receiveShadow = true;
  addBlossoms(ctx, m, g, o.flowers, o.seed ?? 3);
  return m;
}

/** Topiary (clipped balls on a trunk, e.g. café pot plant). Returns a Group; origin = pot soil level. */
export function makeTopiary(ctx, o = {}) {
  const grp = new THREE.Group();
  const trunkH = o.trunk ?? 0.7, r = o.r ?? 0.28, seed = o.seed ?? 5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, trunkH, 8), ctx.mat.toon(o.trunkColor || '#6a5040'));
  trunk.position.y = trunkH / 2; trunk.castShadow = true; grp.add(trunk);
  const balls = o.balls ?? [[0, trunkH + r * 0.8, 0, 1], [r * 0.9, trunkH + r * 0.2, 0.05, 0.62], [-r * 0.8, trunkH + r * 0.35, -0.04, 0.7]];
  balls.forEach(([x, y, z, s], i) => { const b = makeShrub(ctx, { r: r * s, h: r * s * 1.9, seed: seed + i, lumps: 0.1, freq: 3.5, puffAmp: 0.18, kind: o.kind, colors: o.colors }); b.position.set(x, y - r * s * 0.95, z); grp.add(b); });
  return grp;
}

/** Cloud-pruned tree / pine (niwaki, 松): trunk + a few flat-bottomed foliage pads. Returns a Group
 *  (origin = ground). opts: h (overall height), r (pad radius), pads ([[x,y,z,scale]] rel. to r/h), kind, seed, trunkColor. */
export function makeCloudTree(ctx, o = {}) {
  const grp = new THREE.Group();
  const h = o.h ?? 2.2, r = o.r ?? 0.55, seed = o.seed ?? 9;
  const tm = ctx.mat.toon(o.trunkColor || '#6b5244', { paint: 0.06 });
  const lean = o.lean ?? 0.12;
  const pivot = new THREE.Group(); pivot.rotation.z = lean; grp.add(pivot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * h / 2, 0.08 * h / 2, h * 0.8, 8), tm);
  trunk.position.y = h * 0.4; trunk.castShadow = true; pivot.add(trunk);
  const pads = o.pads ?? [[0.1, 0.92, 0, 1.0], [0.55, 0.62, 0.1, 0.72], [-0.5, 0.52, -0.1, 0.66], [0.2, 0.36, 0.3, 0.5]];
  pads.forEach(([x, y, z, s], i) => {
    const pr = r * s;
    const g = shrubGeometry({ rx: pr * 1.15, ry: pr * 0.42, rz: pr, lumps: 0.1, freq: 3, seed: seed + i * 7, colors: o.colors || SHRUB_COLORS[o.kind || 'pine'], puffAmp: 0.34, puff: Math.max(0.16, pr * 0.55) });
    const m = new THREE.Mesh(g, foliageMat(ctx)); m.position.set(x * r * 1.2 - Math.sin(lean) * y * h, y * h - pr * 0.3, z * r); m.rotation.y = hash3(i, seed, 1, 3) * 6.28;
    m.castShadow = true; m.receiveShadow = true; grp.add(m);
  });
  return grp;
}
