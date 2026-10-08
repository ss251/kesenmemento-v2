// [v3:foundation] Pure derivations for the anime layout (tested in test/v3-layout.test.js). No I/O.
export const TAU = Math.PI * 2;

/** FNV-1a 32-bit hash of a string -> uint32. */
export function hash32(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; }
export function hash01(s) { return hash32(s) / 4294967296; }
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function polyArea(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function centroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cz += (p[1] + q[1]) * c; }
  if (Math.abs(a) < 1e-9) { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; }
  return [cx / (3 * a), cz / (3 * a)];
}
export function convexHull(pts) {
  const P = pts.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop(); return lo.concat(hi);
}
/** Minimum-area oriented bounding box: { cx, cz, ang (rad, direction of axis u), hu, hv } (half extents along u, v). */
export function minAreaRect(pts) {
  const H = convexHull(pts);
  let best = null;
  const n = H.length;
  for (let i = 0; i < Math.max(1, n); i++) {
    const a = H[i], b = H[(i + 1) % n];
    const ang = n > 1 ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0;
    const c = Math.cos(ang), s = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area - 1e-9) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      best = { area, ang, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2, cx: um * c - vm * s, cz: um * s + vm * c };
    }
  }
  return best;
}
/** The 4 sides of an OBB as { mid:[x,z], n:[nx,nz] (outward), len }. */
export function obbSides(r) {
  const c = Math.cos(r.ang), s = Math.sin(r.ang);
  const u = [c, s], v = [-s, c];
  return [
    { n: u, len: 2 * r.hv, half: r.hu }, { n: [-u[0], -u[1]], len: 2 * r.hv, half: r.hu },
    { n: v, len: 2 * r.hu, half: r.hv }, { n: [-v[0], -v[1]], len: 2 * r.hu, half: r.hv },
  ].map((sd) => ({ ...sd, mid: [r.cx + sd.n[0] * sd.half, r.cz + sd.n[1] * sd.half] }));
}
/** three.js rotation.y that turns local +Z into the horizontal direction n = [nx, nz]. */
export function rotYFacing(nx, nz) { return Math.atan2(nx, nz); }

export function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  const qx = a[0] + t * dx, qz = a[1] + t * dz;
  return { d: Math.hypot(px - qx, pz - qz), q: [qx, qz], t };
}
export function polylineLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
/** Point + unit tangent at arc length s along a polyline. */
export function alongPolyline(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 1) { const t = L > 0 ? Math.min(1, s / L) : 0; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: L > 0 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0] }; }
    s -= L;
  }
  return { p: pts[0], t: [1, 0] };
}

/** Spatial hash for segments: add(a, b, data), near(x, z, r) -> [{a,b,data}]. */
export class SegHash {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  add(a, b, data) {
    const c = this.cell, s = { a, b, data };
    const i0 = Math.floor(Math.min(a[0], b[0]) / c), i1 = Math.floor(Math.max(a[0], b[0]) / c);
    const j0 = Math.floor(Math.min(a[1], b[1]) / c), j1 = Math.floor(Math.max(a[1], b[1]) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = this.key(i, j); let l = this.map.get(k); if (!l) this.map.set(k, (l = [])); l.push(s); }
  }
  near(x, z, r) {
    const c = this.cell, out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) { const l = this.map.get(this.key(i, j)); if (l) for (const s of l) out.add(s); }
    return [...out];
  }
}

// ------------------------------------------------------------------ roads
/** GSI rnkWidth class + the display width code (monotonic in width inside a class) -> metres (assumed). */
const WIDTH_BY_CODE = { 408: 2.2, 409: 2.8, 674: 3.6, 675: 4.4, 676: 5.2, 1321: 6.5, 1322: 8.0, 1323: 10.0, 1324: 12.0, 2060: 14.0, 2061: 15.0, 2062: 16.0, 2063: 17.0, 2065: 18.5, 2534: 21.0, 2762: 24.0 };
const WIDTH_BY_RANK = { "3m未満": 2.5, "3m-5.5m未満": 4.4, "5.5m-13m未満": 8.0, "13m-19.5m未満": 16.0, "19.5m以上": 22.0 };
export function nominalWidth(f) { return WIDTH_BY_CODE[f.width] ?? WIDTH_BY_RANK[f.rnkwidth] ?? 4; }
export function roadKind(f) {
  if (f.code === 2703 || f.code === 2713 || f.code === 2722) return "bridge";
  if (f.rdctg === "国道" || f.motorway === 1) return "national";
  if (f.rdctg === "都道府県道") return "prefectural";
  return nominalWidth(f) < 3 ? "alley" : "city";
}

// ------------------------------------------------------------------ colours
export const ROOF_PALETTE = {
  green: "#4d6457", slate: "#56677a", navy: "#3e4a63", brown: "#6a5448", terracotta: "#a0573f", red: "#8e4540",
  blue: "#4a78a0", grey: "#7b8691", charcoal: "#4a4f58", white: "#d8dbd6", concrete: "#b9bab4",
};
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx > 0 ? d / mx : 0, mx];
}
/** Snap an aerial roof colour (sRGB 0..255) to the anime roof palette -> palette key. */
export function snapRoof(rgb) {
  if (!rgb) return "charcoal";
  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  if (s < 0.13 || v < 0.18) { if (v > 0.74) return "white"; if (v > 0.58) return "concrete"; if (v > 0.42) return "grey"; return "charcoal"; }
  if (h < 22 || h >= 330) return v > 0.55 ? "terracotta" : "red";
  if (h < 48) return v > 0.6 && s < 0.35 ? "concrete" : "brown";
  if (h < 75) return s < 0.3 ? "grey" : "brown";
  if (h < 165) return "green";
  if (h < 205) return s > 0.3 ? "blue" : "slate";
  if (h < 255) return v < 0.45 ? "navy" : s > 0.35 ? "blue" : "slate";
  return v < 0.5 ? "navy" : "slate";
}
// [sys:9] Wall colours follow what the ground photos show of rebuilt Kesennuma (client IMG_0893 tally of 27 walls: white 37 %, cream
// 22 %, grey 19 %, salmon / mauve 7 %, dark 7 %, tan 4 %, light blue 4 %, mint 0): the house list is a 40-slot weighted
// table (repeat an entry to weight it). The same table lives in src/anime/world/town/palette.js (wallOf draws from it too).
const W_WHITE = ["#f6f4e6", "#f2f0e8", "#eceae0", "#f5f5f0", "#e8e6dc"], W_GREY = ["#bab9aa", "#c4c4bf", "#a9aaa5", "#8c8e89", "#b5b6b0", "#cfcfca"];
const W_CREAM = ["#efe6d2", "#e3d4b8", "#e8e0cc", "#e5dabc", "#f0e9cc"], W_SALMON = ["#e1c6ae", "#e6cbbd"], W_DARK = ["#55585d", "#3f434a", "#6b5a4c"];
const W_BLUE = ["#c4ccd4", "#cfd6dc"], W_OTHER = ["#d9b48c", "#d6c8a0"];
const rep = (arr, n) => Array.from({ length: n }, (_, i) => arr[i % arr.length]);
export const WALLS = {
  house: [...rep(W_WHITE, 14), ...rep(W_GREY, 8), ...rep(W_CREAM, 9), ...rep(W_SALMON, 2), ...rep(W_DARK, 4), ...rep(W_BLUE, 1), ...rep(W_OTHER, 2)],
  shop: [...rep(W_WHITE, 13), ...rep(W_GREY, 8), ...rep(W_CREAM, 10), ...rep(W_SALMON, 2), ...rep(W_DARK, 3), ...rep(W_OTHER, 2), ...rep(W_BLUE, 2)],
  apartment: [...rep(W_WHITE, 14), ...rep(W_GREY, 12), ...rep(W_CREAM, 8), ...rep(W_SALMON, 2), ...rep(W_DARK, 2), ...rep(W_BLUE, 2)],
  office: [...rep(W_WHITE, 12), ...rep(W_GREY, 14), ...rep(W_CREAM, 8), ...rep(W_DARK, 3), ...rep(W_BLUE, 3)],
  warehouse: ["#c8ced3", "#9fb3c4", "#d7d2c4", "#b9a48e", "#aebfc6", "#d0d4d0"],
  carpark: ["#bdbab2", "#b4b2ac", "#c4c1b8"],   // [v6:c6r3] exposed concrete of an open deck
  factory: ["#c8ced3", "#d7d2c4", "#aebfc6", "#c5c0b4"],
  public: ["#e3dfd6", "#e8e2d6", "#d7d9d2"], school: ["#ece6d8", "#e3dfd6"],
  temple: ["#e8dcc6", "#d9c7a8"], shrine: ["#e8dcc6"], landmark: ["#e3dfd6"],
};

// ------------------------------------------------------------------ lots
export const KINDS = ["house", "shop", "apartment", "office", "warehouse", "carpark", "factory", "public", "school", "temple", "shrine", "landmark"];
export const SHAPES = ["gable", "hip", "flat", "shed", "saw"];
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
function pickW(r, table) { let t = 0; for (const [, w] of table) t += w; let x = r() * t; for (const [k, w] of table) { x -= w; if (x <= 0) return k; } return table[0][0]; }

/**
 * Lot semantics from footprint facts. f = { id, code, area, h, zone, shore (m, - on land), front: { kind, width, dist } | null, tag, legacy? }.
 * -> { kind, storeys, height, roofShape, wallless? }
 */
export function classifyLot(f) {
  const r = mulberry(hash32(f.id + "#kind"));
  const A = f.area, shoreNear = f.shore > -90;
  let kind;
  if (f.tag) kind = f.tag;
  else if (f.code === 3111 || f.code === 3112) kind = "warehouse";
  else if (A > 1500 && shoreNear) kind = "factory";
  else if (A > 260 && shoreNear && f.shore > -60) kind = A > 900 ? "factory" : "warehouse";
  else if (f.code === 3102) kind = A > 700 ? pick(r, ["office", "public", "apartment"]) : pick(r, ["apartment", "office", "apartment"]);
  else if (A > 1200) kind = pick(r, ["warehouse", "factory", "public", "office"]);
  else if (A > 380) kind = pick(r, ["apartment", "office", "warehouse", "apartment"]);
  else {
    const fr = f.front, main = fr && fr.dist < 9 && (fr.kind === "national" || fr.kind === "prefectural" || (fr.kind === "city" && fr.width >= 6));
    const pShop = main ? (f.zone === "hero" ? 0.72 : 0.45) : f.zone === "hero" && fr && fr.dist < 6 && fr.kind === "city" ? 0.22 : 0.03;
    kind = A >= 30 && r() < pShop ? "shop" : A > 190 && r() < 0.35 ? "apartment" : "house";
  }
  let storeys, height, roofShape;
  switch (kind) {
    case "house": storeys = A < 28 ? 1 : r() < 0.2 ? 1 : 2; height = storeys * 2.9; roofShape = A < 28 ? "shed" : pickW(r, [["gable", 0.52], ["hip", 0.38], ["shed", 0.1]]); break;
    case "shop": storeys = pickW(r, [[2, 0.6], [3, 0.3], [1, 0.1]]); height = storeys * 2.9 + 0.3; roofShape = pickW(r, [["gable", 0.35], ["flat", 0.35], ["shed", 0.15], ["hip", 0.15]]); break;
    case "apartment": r(); storeys = Math.min(4, 2 + (A > 300 ? 1 : 0) + (A > 600 ? 1 : 0)); height = storeys * 2.9; roofShape = pickW(r, [["flat", 0.55], ["hip", 0.25], ["gable", 0.2]]); break;
    case "hotel": r(); storeys = 3 + (A > 800 ? 1 : 0); height = storeys * 3.1; roofShape = "flat"; break;   // [v4:polish1]
    case "office": r(); storeys = 2 + (f.code === 3102 ? 1 : 0) + (A > 600 ? 1 : 0); height = storeys * 3.3; roofShape = "flat"; break;
    case "warehouse": storeys = 1; height = Math.min(11, 5.5 + Math.sqrt(A) * 0.08 + r() * 1.5); roofShape = f.code === 3111 ? "shed" : pickW(r, [["gable", 0.5], ["flat", 0.3], ["saw", 0.08], ["shed", 0.12]]); break;
    // [v6:c6r3] a multi-storey car park (OSM building=parking): an open stepped deck. OSM and Earth give no storey count or height here (Earth is 2.5D),
    // so this is the least a 'multi-storey' can be, two decks of 2.8 m each, and the value is a derived placeholder until a ground photo measures it
    case "carpark": storeys = 2; height = 5.6; roofShape = "flat"; break;
    case "factory": storeys = r() < 0.35 ? 2 : 1; height = Math.min(16, 7.5 + Math.sqrt(A) * 0.07 + r() * 2 + (storeys - 1) * 3); roofShape = pickW(r, [["flat", 0.45], ["gable", 0.3], ["saw", 0.25]]); break;
    // [v6:c5r2] a school footprint under 30 m2 is a gate post, stair, bike shed or kerb in the grounds (the Earth shadows end at
    // 2-4.5 m, the 2025-09 ground photo shows nothing taller than the 3-storey blocks), not a 10.8-14.4 m classroom tower
    case "school": { const four = r() < 0.5; if (A < 30) { storeys = 1; height = 3.2; } else { storeys = 3 + (four ? 1 : 0); height = storeys * 3.6; } roofShape = "flat"; break; }
    case "public": storeys = 2 + (A > 900 ? 1 : 0); height = storeys * 3.5; roofShape = r() < 0.7 ? "flat" : "hip"; break;
    case "temple": storeys = 1; height = 6.5; roofShape = "hip"; break;
    case "shrine": storeys = 1; height = 4.5; roofShape = "gable"; break;
    default: storeys = Math.max(1, Math.round(f.h / 2.9)); height = f.h; roofShape = "flat";
  }
  // [r2:2][r2:4] Height follows the footprint for small lots. The kind's storeys and heights above came from the kind and one draw, not from
  // how big the footprint is: a 7 m2 'warehouse' stood 7 m high, a 20 m2 'school' 11-14 m. These rules run AFTER the switch and make no
  // random draw, so the draw order of every other lot is unchanged. `f.legacy` (the photo-survey south shore, which another workflow owns)
  // keeps the old values. Not capped: shop, house, temple, shrine (no evidence), and no generic 'min side < 5.5 m' rule (only the area is known here).
  let wallless = false;
  if (!f.legacy) {
    if (kind === "warehouse" && (f.code === 3111 || f.code === 3112) && A < WALLLESS_MAX_AREA) {
      // [r2:4] GSI 3111 / 3112 are 普通無壁舎 / 堅ろう無壁舎, wall-less sheds (carports, eaves, lean-tos, canopies): in Earth small low roofs beside the
      // neighbouring buildings (shadows 2.2-4.5 m), not closed 6-7 m boxes. One storey at the GSI eave height (3.0-3.8 m, 3.4 without one), roof
      // shape 'shed', and `wallless` so the builders draw a roof slab on posts with no walls or ribs.
      storeys = 1; height = Math.min(3.8, Math.max(3.0, f.h > 0 ? f.h : 3.4)); roofShape = "shed"; wallless = true;
    } else if (A < 25 && (kind === "school" || kind === "public" || kind === "office")) {
      // [r2:2] under 25 m2 these are gate posts, stairs, bike sheds and kiosks in the grounds (the c9 overrides read 3.5 m)
      storeys = 1; height = Math.min(height, 3.5);
    } else if (A < 25 && kind === "apartment") height = Math.min(height, 5.8);
    else if (A < 100 && kind === "factory") { storeys = 1; height = Math.min(height, 6); }   // [r2:2] a small works shed
  }
  const out = { kind, storeys, height: Math.round(height * 10) / 10, roofShape };
  if (wallless) out.wallless = true;
  return out;
}
/** [r2:4] a wall-less shed (GSI 3111 / 3112) under this area (m2) is drawn as a roof on posts; larger ones are reviewed one by one against Earth */
export const WALLLESS_MAX_AREA = 100;

// [sys:4] A real building has one roof. The shape a derived lot ends with is decided HERE, once, seeded by the lot id, and
// stored in lot.roof.shape with src.roof 'derived-resolved'; the mid, hero (L0 kit) and far builders draw it as it is and
// keep only geometric constraints (a warehouse hip is a gable, a big curved footprint is flat on its polygon).
// Two reinterpretations of the derived draw used to be re-rolled per builder with different seeds: a derived 'shed' is
// mostly a low gable / hip read from above, and a small low flat roof on a house or shop is mostly pitched.
export const SHED_TO_PITCHED = 0.55, LOW_FLAT_TO_PITCHED = 0.6, LOW_FLAT_H = 7.5, LOW_FLAT_AREA = 220;
// [r3:6] A house or shop of 100 m2 or more is rarely a mono-pitch: of 24 derived sheds of 100 m2 or more read on the Earth 2026-03-11 tops (12 px/m), 14 showed two or more roof planes (hips, gables,
// a double gable, a long gable warehouse) and only wall-less carports and a few pale low roofs were mono-pitch, i.e. about 58 % pitched: 0.55 left too many big sheds. Houses and shops of 100 m2 or
// more resolve at 0.75; smaller lots and warehouses keep their draw (a warehouse is not a house roof), and the wall-less 3111 / 3112 sheds and open carports are not house or shop lots at all.
export const SHED_TO_PITCHED_BIG = 0.75, BIG_SHED_AREA = 100;
export function resolveRoofShape(f) {
  const r = mulberry(hash32(f.id + "#roof-resolve"));
  const a = r(), b = r(), c = r();
  const lowKind = f.kind === "house" || f.kind === "shop";
  if (f.shape === "shed" && lowKind && a < ((f.area ?? 0) >= BIG_SHED_AREA ? SHED_TO_PITCHED_BIG : SHED_TO_PITCHED)) return b < 0.5 ? "gable" : "hip";
  if (f.shape === "flat" && lowKind && f.height < LOW_FLAT_H && f.area < LOW_FLAT_AREA && c < LOW_FLAT_TO_PITCHED) return b < 0.55 ? "gable" : "hip";
  return f.shape;
}

/** Roof colour for a lot: snapped aerial sample; flat roofs lean concrete, warehouses keep tin colours. */
export function lotRoofColor(kind, shape, rgb, id) {
  const key = snapRoof(rgb);
  if (shape === "flat" && kind !== "warehouse" && kind !== "factory") {
    if (key === "green" || key === "blue" || key === "slate") return ROOF_PALETTE[key === "green" ? "green" : "slate"];
    return ROOF_PALETTE[hash01(id + "#flat") < 0.6 ? "concrete" : "grey"];
  }
  return ROOF_PALETTE[key];
}
export function lotWallColor(kind, id) { const l = WALLS[kind] || WALLS.house; return l[hash32(id + "#wall") % l.length]; }

// ------------------------------------------------------------------ [sys:6] ground under a footprint on a slope
/** Terrain heights on a 1 m grid inside a ring, inset 0.5 m from its edge: { n, hs (sorted), min, med, max }. */
export function terrainInRing(ring, heightAt, inset = 0.5, step = 1) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
  const hs = [], m = ring.length;
  for (let x = Math.ceil(x0 / step) * step + step / 2; x < x1; x += step) for (let z = Math.ceil(z0 / step) * step + step / 2; z < z1; z += step) {
    let inside = false, near = false;
    for (let i = 0, j = m - 1; i < m; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      if (inset > 0 && segDist(x, z, a, b).d < inset) { near = true; break; }
    }
    if (inside && !near) hs.push(heightAt(x, z));
  }
  hs.sort((p, q) => p - q);
  const n = hs.length;
  return { n, hs, min: n ? hs[0] : NaN, med: n ? hs[n >> 1] : NaN, max: n ? hs[n - 1] : NaN };
}
/** Share of the samples whose terrain stands above the roof minus 0.5 m. */
export function buriedShare(hs, groundY, height) {
  if (!hs.length) return 0;
  const lim = groundY + height - 0.5; let k = 0;
  for (const h of hs) if (h > lim) k++;
  return k / hs.length;
}
export const PLINTH_MAX = { house: 3.0, warehouse: 4.0, carpark: 4.0, factory: 4.0 };
export const plinthMax = (kind) => PLINTH_MAX[kind] ?? 3.0;
/** Floor height of a building on a slope. The old rule (the lowest of the centre and the OBB corners) measured the height up
 *  from the lowest corner, so the uphill part ended under the terrain. Now: tmax - height + 0.6, clamped to [tmin, tmin + Pmax]
 *  (the floor never sits more than Pmax above the lowest terrain in the footprint). -> { groundY, baseY (the lowest terrain in the footprint: the plinth starts there) }. */
export function plinthGround({ ts, height, kind, groundOld }) {
  if (!ts || ts.n < 4) return { groundY: groundOld, baseY: groundOld };
  const P = plinthMax(kind);
  const g = Math.max(ts.min, Math.min(ts.max - height + 0.6, ts.min + P));   // (the old rule + Pmax cap is dropped: the OBB corner can lie 6 m downhill of the polygon, e.g. 16/58541/25070/77)
  return { groundY: g, baseY: Math.min(ts.min, g) };
}

// ------------------------------------------------------------------ road width from road-edge lines (RdEdg)
/** Allowed width range per GSI rnkWidth class (metres). */
export const RANK_RANGE = { "3m未満": [1.6, 3.6], "3m-5.5m未満": [2.8, 6.2], "5.5m-13m未満": [5.0, 14.0], "13m-19.5m未満": [11.5, 21.0], "19.5m以上": [17.0, 40.0] };
/** Ray (p + t*d) vs segment a-b: t >= 0 of the hit, or null. */
export function raySeg(p, d, a, b) {
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const wx = a[0] - p[0], wz = a[1] - p[1];
  const t = (wx * ez - wz * ex) / den, u = (wx * d[1] - wz * d[0]) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}
const WIDE_MAX = 21;
/** Median road width measured by perpendicular probes from the centre-line to the nearest edge line on both sides.
 *  edges: SegHash of edge segments. Returns null when fewer than 2 good probes (use the nominal width).
 *  [sys:11] The GSI class '5.5m-13m未満' counts the carriageway only, while the RdEdg lines include the sidewalks, so the
 *  main roads of this class measure about 16 m (気仙沼街道, 気仙沼唐桑線, 南町魚市場線...): the probes above the class limit
 *  are kept (hiw) and, when most of them agree within 1 m and outnumber the in-range ones, their median is the width. */
export function roadWidthFromEdges(pts, rank, edges, step = 6, wideOk = true) {
  const [lo, hi] = RANK_RANGE[rank] || [1.6, 30];
  const wide = wideOk && rank === "5.5m-13m未満";
  const L = polylineLength(pts), ws = [], hiw = [];
  for (let s = Math.min(step / 2, L / 2); s < L; s += step) {
    const { p, t } = alongPolyline(pts, s);
    const n = [-t[1], t[0]];
    const near = edges.near(p[0], p[1], (wide ? WIDE_MAX : hi) / 2 + 2);
    let a = Infinity, b = Infinity;
    for (const e of near) {
      const ta = raySeg(p, n, e.a, e.b); if (ta !== null && ta > 0.4 && ta < a) a = ta;
      const tb = raySeg(p, [-n[0], -n[1]], e.a, e.b); if (tb !== null && tb > 0.4 && tb < b) b = tb;
    }
    if (a === Infinity || b === Infinity) continue;
    const w = a + b;
    if (!(Math.abs(a - b) < Math.max(1.5, w * 0.35))) continue;
    if (w >= lo && w <= hi) ws.push(w);
    else if (wide && w > hi && w <= WIDE_MAX) hiw.push(w);
  }
  if (wide && hiw.length >= 2) {
    hiw.sort((x, y) => x - y);
    const m = hiw[hiw.length >> 1], k = hiw.filter((w) => Math.abs(w - m) <= 1.0);
    if (k.length >= 2 && k.length >= 0.6 * hiw.length && k.length > ws.length) return k[k.length >> 1];
  }
  if (ws.length < 2) return null;
  ws.sort((x, y) => x - y);
  return ws[ws.length >> 1];
}
/** Douglas-Peucker simplification of an open or closed polyline (tolerance in metres). */
export function simplify(pts, tol) {
  if (pts.length <= 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let md = -1, mk = -1;
    for (let k = i + 1; k < j; k++) { const d = segDist(pts[k][0], pts[k][1], pts[i], pts[j]).d; if (d > md) { md = d; mk = k; } }
    if (md > tol) { keep[mk] = 1; stack.push([i, mk], [mk, j]); }
  }
  const out = pts.filter((_, k) => keep[k]);
  return out.length >= 3 || pts.length < 3 ? out : [pts[0], pts[pts.length >> 1], pts[pts.length - 1]];
}

/** Coastline piece -> quay kind. f = { x, z, zone, land (ground y inland), slope (rise per metre inland), roadNear } */
export function quayKind(f) {
  // the inner-bay ring (内湾) is the new seawall with the promenade on top; 神明崎 has rocky shores
  const inner = Math.hypot(f.x - 170, f.z + 10) < 230 && f.z < 60 && f.x < 330;
  if (Math.hypot(f.x - 352, f.z + 80) < 55) return "rocks";
  if (inner) return f.z < -20 ? "promenade" : "seawall";
  if (f.slope > 0.18 && !f.roadNear) return "rocks";
  if (f.land < 1.6 && !f.roadNear && f.zone !== "hero") return "beach";
  return f.roadNear || f.zone === "hero" ? "quay" : "seawall";
}
