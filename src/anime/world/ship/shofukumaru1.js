// [ship] 第一昭福丸 (SHOFUKU MARU No.1, call sign 7KFY, MG1-2112) at true scale, anime cel style.
//
// Sources: docs/ship/shofukumaru-dossier.md (the captain's sourced dossier) and the reference photos it lists. The
// profile below was measured by this builder from the side-on model photo shofukumaru02 (port, 0.1226 m/px,
// stem head x = 158, waterline y = 291) with the silhouette segmentation in tools/anime/ship-profile.mjs, and
// cross-checked on shofukumaru03 (starboard), 05 and designboom-1800 (aft details), 07 (aerial deck plan) and the
// WCPFC registry photo (the real ship from starboard).
//
// Frame (shared by the three ship builders):
//   s = metres aft of the stem head, h = metres above the waterline (the top of the red antifouling).
//   Local origin on the centreline at the waterline at midship s = 29.3 m; local +Z = forward (z = 29.3 - s),
//   +Y up, port = +X, starboard = -X (as in src/anime/world/harbor/boats.js).
//
//   buildShofukumaru(ctx, { livery: 'nendo' | 'fallback', tier: 'high' | 'phone' })
//     -> { group, anchors, setFlags(on), setNight(f), update(dt, t), dispose(), ready, livery, triangles, ... }
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { nightMat } from '../harbor/lights.js';
import { ATLAS, sideUV, cellUV, fallbackPlan, cleanNendo, loadNendo, paintAtlas, makeCanvas } from './livery.js';
import { resolveFlags } from './flags.js';

// ------------------------------------------------------------------------------------------------- particulars
export const SHIP = {
  name: '第一昭福丸', nameEn: 'SHOFUKU MARU No.1', callSign: '7KFY', registration: 'MG1-2112',   // WCPFC VID 11921, IATTC 18109; MG1-2112 painted on the bridge (designboom-1800)
  imo: 9896660, mmsi: 431629000,                 // WCPFC, VesselFinder
  owner: '株式会社臼福本店', builder: '株式会社みらい造船 (気仙沼市朝日町)', completed: '2020-02-05',   // WCPFC, IATTC, Usui slide
  LOA: 58.60,                                    // usufuku.jp, slide, VesselFinder
  Lpp: 50.5, Lreg: 50.95,                        // JASNAOE Ship of the Year 2020; WCPFC/IATTC
  B: 9.2,                                        // moulded breadth (SOY, WCPFC, IATTC); VesselFinder's 10.0 is AIS rounding
  D: 3.91,                                       // moulded depth to the upper deck (SOY, WCPFC, IATTC)
  d: 3.54,                                       // design draft (SOY)
  keelModel: 4.25,                               // measured: keel 34-35 px under the paint line in shofukumaru02 (design draft + boot-top + keel)
  GT: 486, speedKn: 12.3, engineKW: 735,         // registries; SOY; WCPFC
  holdM3: 523.1, holdC: -60,                     // WCPFC; 北かつ
  crew: 23,                                      // berths (nendo); 25 normal complement (WCPFC)
  midS: 29.3,                                    // local origin (the builders' shared frame)
  airDraft: 21.0,                                // dossier §2: ≈ 21 m to the top of the radar lattice (mast top measured 20.7 + lamp); かなえ大橋 clearance 32 m
  stemHead: 6.2, sheerMid: 5.0,                  // measured (dossier section 3)
  foremast: { s: 14.2, top: 16.1 },              // measured
  bridge: { s0: 28.3, s1: 40.0, roof: 10.0, rail: 10.9, house1: [28.3, 42.6] },   // measured; level-1 house to the aft shelter
  radarMast: { s: 42.8, top: 20.7 },             // measured: white lattice tower, the tallest point
  funnel: { s: 47.8, s0: 46.5, s1: 49.1, top: 10.5 },   // measured; white with a black top (designboom-1800)
  aftShelter: { s0: 42.6, s1: 58.6, roof: 7.3, rail: 8.7 },   // measured: line-setting shelter, 7KFY on the aft rail
  aftMast: { s: 53.7, top: 19.1 },               // measured
  gangway: { side: 'starboard', s0: 22.8, s1: 31.3, h0: 3.0, h1: 4.7 },   // 舷門: starboard only (北かつ: 揚縄は船の前方右側の舷門から)
  sternOpening: { s0: 56.6, h0: 5.8, h1: 7.2 },  // measured: the open stern bay where the line is set (投縄)
  bulbNose: { s: 1.95, h: -1.2 },                // measured: knuckle-bulb (SOY: first tuna longliner with a large bulbous bow)
  propeller: { s: 51.9, h: -2.65, r: 1.3, blades: 4 },   // measured (bronze 4-blade)
  rudder: { s0: 53.4, s1: 55.0, h0: -4.5, h1: -0.9 },    // measured
  wellDeck: 3.0, promenade: 5.0,                 // the 舷門 sill; the deck round the bridge house
};
export const MID_S = SHIP.midS;
export const zOf = (s) => MID_S - s;
export const sOf = (z) => MID_S - z;

// ------------------------------------------------------------------------------------------------- the profile
const lerpTab = (tab, x) => {   // tab: [[x, y], ...] ascending x, clamped
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1); }
  return tab[tab.length - 1][1];
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** Top of the hull shell (s -> h). Forward it is the sheer, aft of s 42.6 the flush side of the setting shelter. */
export const SHEER = [[0, 6.2], [2, 6.1], [5, 6.0], [9, 5.7], [12.5, 5.4], [17, 5.05], [20, 5.0], [41.6, 5.0], [42.6, 7.3], [58.6, 7.3]];
/** Stem above the bulb (h -> s), measured on the shofukumaru02 silhouette. */
export const STEM = [[0.7, 5.86], [1.2, 5.75], [2.0, 5.55], [2.9, 5.15], [3.4, 4.7], [4.0, 4.0], [4.5, 2.9], [4.8, 2.3], [5.6, 1.1], [6.2, 0.0]];
/** Bulb front contour (h -> s): the knuckle-bulb nose at s 1.95, h -1.2. */
export const BULB = [[-4.05, 9.0], [-3.95, 6.0], [-3.85, 5.0], [-3.7, 4.4], [-3.4, 4.0], [-3.1, 3.3], [-2.8, 2.9], [-2.6, 2.6], [-2.2, 2.2], [-1.2, 1.95], [-0.2, 2.2], [0.1, 2.6], [0.4, 2.9], [0.62, 3.7], [0.7, 5.86]];
/** Forefoot of the hull proper behind the bulb (h -> s). */
const FOREFOOT = [[-4.3, 12.0], [-4.0, 9.5], [-3.5, 8.2], [-2.5, 7.0], [-1.0, 6.2], [0.7, 5.86]];
/** Stern (h -> s): rounded cruiser stern over the counter; LOA 58.6 at the top. */
export const STERN = [[-6, 55.1], [-0.9, 55.1], [-0.5, 56.3], [0, 57.2], [0.5, 57.8], [1.1, 58.15], [1.8, 58.5], [3.0, 58.6], [9, 58.6]];

export const sheerAt = (s) => lerpTab(SHEER, s);
export const fwdS = (h) => (h >= 0.7 ? lerpTab(STEM, h) : lerpTab(BULB, h));
export const sternS = (h) => lerpTab(STERN, h);
/** Keel line: drag aft (-4.05 forward to -4.5 at s 46, measured), then the buttock-flow run up to the counter over the propeller. */
export function keelAt(s) {
  if (s < 46) return -4.05 - 0.45 * clamp((s - 8) / 38);
  if (s < 51) return -4.5 + 3.2 * smooth((s - 46) / 5);
  if (s < 55.1) return -1.3 + 0.4 * ((s - 51) / 4.1);
  return -0.9;
}
/** Half-breadth of the moulded hull at (s, h), bulb included. */
export function halfBreadth(s, h) {
  const Bh = SHIP.B / 2;
  const s0 = h >= 0.7 ? lerpTab(STEM, h) : lerpTab(FOREFOOT, h);
  const d = s - s0, Lent = 9 + 8 * (clamp(1 - h / 6.2, 0, 1.6) / 1.6);
  const f = d <= 0 ? 0 : d >= Lent ? 1 : 1 - (1 - d / Lent) ** 2;
  const sa = sternS(h), dA = sa - s, LA = 4.6 + Math.max(0, -h) * 0.9;
  const g = dA <= 0 ? 0 : dA >= LA ? 1 : Math.sqrt(1 - (1 - dA / LA) ** 2);
  const kb = keelAt(s), R = 1.6;
  let bil = 1;
  if (h < kb + R) { const c = clamp((kb + R - h) / R); bil = (Bh - R + R * Math.sqrt(1 - c * c)) / Bh; }
  let b = Bh * f * g * bil;
  if (h < 0.62 && h > -3.98 && s < 13) {   // the bulb: an elliptic section round h -1.65, 2.5 m wide, nose at BULB
    const dn = s - lerpTab(BULB, h);
    const e = 1 - ((h + 1.65) / 2.27) ** 2;
    if (dn > 0 && e > 0) b = Math.max(b, 1.25 * Math.sqrt(e) * Math.sqrt(Math.min(1, dn / 1.8)) * (s < 9 ? 1 : (13 - s) / 4));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------- tiers
export const TIERS = {
  high: { ds: [0.4, 0.8, 0.4], under: [0, 0.015, 0.05, 0.12, 0.22, 0.36, 0.52, 0.7, 0.85], above: [0, 0.3, 0.62, 0.75, 1.4, 2.2, 3.0, 3.6, 4.2, 4.7, 5.0, 5.4, 5.8, 6.2, 6.6, 7.0, 7.2, 7.3], seg: 10, railStep: 1.4, midRail: true, floats: 14, flags: 22, rbox: true, whips: 7 },
  phone: { ds: [0.9, 1.8, 0.9], under: [0, 0.05, 0.2, 0.45, 0.7], above: [0, 0.62, 0.75, 1.6, 3.0, 4.0, 4.7, 5.0, 5.8, 6.4, 7.2, 7.3], seg: 6, railStep: 2.8, midRail: false, floats: 6, flags: 12, rbox: false, whips: 3 },
};
export const BUDGET = { high: 150000, phone: 60000 };
const BREAKS = [16.5, 22.8, 28.3, 31.3, 41.6, 42.6, 55.1, 56.6, 58.6];
export function stations(tier = 'high') {
  const [a, b, c] = TIERS[tier].ds; const out = [];
  for (let s = 0; s < 8; s += a) out.push(s);
  for (let s = 8; s < 50; s += b) out.push(s);
  for (let s = 50; s < SHIP.LOA; s += c) out.push(s);
  const keep = out.filter((s) => !BREAKS.some((b) => Math.abs(s - b) < 0.15) && s < SHIP.LOA - 0.15);
  return [...new Set([...keep, ...BREAKS, 0, SHIP.LOA])].sort((p, q) => p - q);
}

// ------------------------------------------------------------------------------------------------- hull loft
/** The hull shell (both sides, bottom closed) as one geometry with atlas UVs. Openings: 舷門 (starboard), stern bay. */
export function hullGeometry(tier = 'high') {
  const T = TIERS[tier], S = stations(tier);
  const rows = [...T.under.map((t) => ({ t })), ...T.above.slice(1).map((h) => ({ h }))];
  const NI = S.length, NJ = rows.length;
  const pos = [], uv = [], idx = [];
  const vert = (side, i, j) => {
    const s = S[i], r = rows[j];
    let h = r.h ?? keelAt(s) * (1 - r.t);
    h = Math.min(h, sheerAt(s));
    let ss = s, b;
    const f = fwdS(h), a = sternS(h);
    if (s < f) { ss = f; b = 0; } else if (s > a) { ss = a; b = 0; } else b = halfBreadth(s, h);
    pos.push(side * b, h, zOf(ss));
    uv.push(...sideUV(side > 0 ? 'port' : 'starboard', ss, h));
  };
  const base = { 1: 0, [-1]: NI * NJ };
  for (const side of [1, -1]) for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) vert(side, i, j);
  const G = SHIP.gangway, O = SHIP.sternOpening;
  for (const side of [1, -1]) {
    const o = base[side];
    for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ - 1; j++) {
      const h0 = rows[j].h, h1 = rows[j + 1].h;
      if (h0 !== undefined) {
        if (side < 0 && S[i] >= G.s0 - 1e-6 && S[i + 1] <= G.s1 + 1e-6 && h0 >= G.h0 - 1e-6 && h1 <= G.h1 + 1e-6) continue;   // 舷門
        if (S[i] >= O.s0 - 1e-6 && h0 >= O.h0 - 1e-6 && h1 <= O.h1 + 1e-6) continue;   // stern bay (both sides)
      }
      const a = o + i * NJ + j, b = a + NJ, c = a + 1, d = b + 1;
      if (side > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
  }
  // flat bottom: port row 0 to starboard row 0
  for (let i = 0; i < NI - 1; i++) {
    const a = base[1] + i * NJ, b = base[1] + (i + 1) * NJ, c = base[-1] + i * NJ, d = base[-1] + (i + 1) * NJ;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  ng.userData.stations = NI; ng.userData.rows = NJ;
  return ng;
}

// ------------------------------------------------------------------------------------------------- small kit
const _box = new THREE.BoxGeometry(1, 1, 1);
const _cyl = new Map();
const cylGeo = (seg) => { if (!_cyl.has(seg)) _cyl.set(seg, new THREE.CylinderGeometry(0.5, 0.5, 1, seg)); return _cyl.get(seg); };
const _up = new THREE.Vector3(0, 1, 0);
const P = (s, h, x = 0) => [x, h, zOf(s)];

function makeKit(parent, tier) {
  const T = TIERS[tier];
  const add = (m, pos, rot, scale) => { if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); if (scale) m.scale.set(scale[0], scale[1], scale[2]); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const k = {
    parent, T,
    /** box from s0..s1, h0..h1, x0..x1 (ship coordinates) */
    blk(mat, s0, s1, h0, h1, x0, x1) { return add(new THREE.Mesh(_box, mat), [(x0 + x1) / 2, (h0 + h1) / 2, zOf((s0 + s1) / 2)], null, [Math.abs(x1 - x0), Math.abs(h1 - h0), Math.abs(s1 - s0)]); },
    /** rounded block (plain block on the phone tier) */
    rblk(mat, s0, s1, h0, h1, x0, x1, r = 0.15) {
      if (!T.rbox) return k.blk(mat, s0, s1, h0, h1, x0, x1);
      const w = Math.abs(x1 - x0), hh = Math.abs(h1 - h0), d = Math.abs(s1 - s0);
      return add(new THREE.Mesh(new RoundedBoxGeometry(w, hh, d, 2, Math.min(r, w / 2, hh / 2, d / 2)), mat), [(x0 + x1) / 2, (h0 + h1) / 2, zOf((s0 + s1) / 2)]);
    },
    /** vertical cylinder at (s, x) from h0 to h1 */
    post(mat, s, x, h0, h1, r0, r1 = r0, seg = T.seg) {
      if (r0 === r1) return add(new THREE.Mesh(cylGeo(seg), mat), [x, (h0 + h1) / 2, zOf(s)], null, [r0 * 2, h1 - h0, r0 * 2]);
      return add(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h1 - h0, seg), mat), [x, (h0 + h1) / 2, zOf(s)]);
    },
    /** square bar between two local points [x, y, z] */
    bar(mat, a, b, w = 0.06, d = w) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = new THREE.Vector3().subVectors(B, A); const len = dir.length(); if (len < 1e-4) return null;
      const m = new THREE.Mesh(_box, mat); m.scale.set(w, len, d); m.quaternion.setFromUnitVectors(_up, dir.normalize()); m.position.copy(A).addScaledVector(dir, len / 2);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    },
    /** round bar between two local points */
    rod(mat, a, b, r = 0.05, seg = 6) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = new THREE.Vector3().subVectors(B, A); const len = dir.length(); if (len < 1e-4) return null;
      const m = new THREE.Mesh(cylGeo(seg), mat); m.scale.set(r * 2, len, r * 2); m.quaternion.setFromUnitVectors(_up, dir.normalize()); m.position.copy(A).addScaledVector(dir, len / 2);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    },
    sphere(mat, pos, r, seg = T.seg) { return add(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg * 0.6 | 0)), mat), pos); },
    mesh(geo, mat, pos, rot) { return add(new THREE.Mesh(geo, mat), pos, rot); },
    /** railing along a polyline of local points (top rail h above, optional mid rail, stanchions) */
    railing(mat, pts, h = 1.0, { step = T.railStep, mid = T.midRail, w = 0.06, rails = [0.5] } = {}) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        k.bar(mat, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], w);
        if (mid) for (const f of rails) k.bar(mat, [a[0], a[1] + h * f, a[2]], [b[0], b[1] + h * f, b[2]], w * 0.7);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(L / step));
        for (let q = 0; q < n; q++) { const t = q / n; const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; k.bar(mat, p, [p[0], p[1] + h, p[2]], w * 0.9); }
      }
      const e = pts[pts.length - 1]; k.bar(mat, e, [e[0], e[1] + h, e[2]], w * 0.9);
    },
  };
  return k;
}

/** A plane mapped to an atlas cell. facing: '+x' | '-x' | '+z' | '-z' | 'up'. (s, h, x) centre, w along the face, hgt up. */
function atlasPlane(cell, w, hgt, facing, flipU = false) {
  const g = new THREE.PlaneGeometry(w, hgt);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); const [a, b] = cellUV(cell, flipU ? 1 - u : u, v); uv.setXY(i, a, b); }
  if (facing === '+x') g.rotateY(Math.PI / 2); else if (facing === '-x') g.rotateY(-Math.PI / 2); else if (facing === '-z') g.rotateY(Math.PI); else if (facing === 'up') g.rotateX(-Math.PI / 2);
  return g;
}

/** Horizontal deck strip following the hull plan at height hAt(s), from s0 to s1, inset from the shell. */
function deckGeometry(s0, s1, hAt, inset = 0.0, { step = 0.6, down = false, widthAt = null } = {}) {
  const pos = [], n = Math.max(2, Math.ceil((s1 - s0) / step));
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const ha = hAt(sa), hb = hAt(sb);
    const wa = Math.max(0, (widthAt ? widthAt(sa, ha) : halfBreadth(sa, ha)) - inset), wb = Math.max(0, (widthAt ? widthAt(sb, hb) : halfBreadth(sb, hb)) - inset);
    const A = [-wa, ha, zOf(sa)], B = [wa, ha, zOf(sa)], C = [wb, hb, zOf(sb)], D = [-wb, hb, zOf(sb)];
    if (!down) pos.push(...A, ...C, ...B, ...A, ...D, ...C); else pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/** Inner face of the bulwark (the well), from hBot to the sheer, x inset by t; holes for the 舷門 on starboard. */
function linerGeometry(s0, s1, hBot, t = 0.2, step = 0.6) {
  const pos = [], G = SHIP.gangway;
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  const ss = []; for (let i = 0; i <= n; i++) ss.push(s0 + ((s1 - s0) * i) / n);
  for (const s of [G.s0]) if (s > s0 && s < s1 && !ss.includes(s)) ss.push(s);
  ss.sort((a, b) => a - b);
  const quad = (A, B, C, D) => pos.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (const side of [1, -1]) for (let i = 0; i < ss.length - 1; i++) {
    const sa = ss[i], sb = ss[i + 1];
    const bands = side < 0 && sa >= G.s0 - 1e-6 ? [[G.h1, null]] : [[hBot, null]];
    for (const [h0] of bands) {
      const ta = sheerAt(sa), tb = sheerAt(sb);
      const wa0 = halfBreadth(sa, h0) - t, wb0 = halfBreadth(sb, h0) - t, wa1 = halfBreadth(sa, ta) - t, wb1 = halfBreadth(sb, tb) - t;
      const A = [side * wa0, h0, zOf(sa)], B = [side * wb0, h0, zOf(sb)], C = [side * wb1, tb, zOf(sb)], D = [side * wa1, ta, zOf(sa)];
      if (side > 0) quad(A, D, C, B); else quad(A, B, C, D);
      // rail cap: outer edge to inner edge at the sheer
      const oa = [side * halfBreadth(sa, ta), ta + 0.002, zOf(sa)], ob = [side * halfBreadth(sb, tb), tb + 0.002, zOf(sb)];
      const ia = [D[0], ta + 0.002, D[2]], ib = [C[0], tb + 0.002, C[2]];
      if (side > 0) quad(ia, oa, ob, ib); else quad(ia, ib, ob, oa);
    }
  }
  // 舷門 jambs, sill and head: close the shell thickness
  {
    const s = G.s0, ho = halfBreadth(s, G.h0), hi = ho - t;
    quad([-ho, G.h0, zOf(s)], [-hi, G.h0, zOf(s)], [-hi, G.h1, zOf(s)], [-ho, G.h1, zOf(s)]);
    const sill = (h, up) => { for (let i = 0; i < 6; i++) { const sa = G.s0 + ((G.s1 - G.s0) * i) / 6, sb = G.s0 + ((G.s1 - G.s0) * (i + 1)) / 6; const A = [-halfBreadth(sa, h), h, zOf(sa)], B = [-halfBreadth(sb, h), h, zOf(sb)], C = [-halfBreadth(sb, h) + t, h, zOf(sb)], D = [-halfBreadth(sa, h) + t, h, zOf(sa)]; if (up) quad(A, D, C, B); else quad(A, B, C, D); } };
    sill(G.h0, true); sill(G.h1, false);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/** A flat (s, h) polygon extruded across x (skeg, rudder), centred on x0. */
function profilePlate(pts, thick, x0 = 0) {
  const shape = new THREE.Shape(pts.map(([s, h]) => new THREE.Vector2(-s, h)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);          // extrusion axis -> x; shape x (= -s) -> z ... then shift by MID_S
  g.translate(x0, 0, MID_S);
  return g;
}

// ------------------------------------------------------------------------------------------------- merge
/** Merge every mesh under root (except kept subtrees) into one mesh per material. Returns the merged meshes. */
export function mergeByMaterial(root, keep = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m);
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { mat: o.material, geos: [], names: new Set() });
    groups.get(key).geos.push(g); if (o.name) groups.get(key).names.add(o.name);
    victims.push(o);
  });
  for (const v of victims) v.parent.remove(v);
  const out = [];
  for (const { mat, geos, names } of groups.values()) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const P3 = new Float32Array(n * 3), N3 = new Float32Array(n * 3), U2 = new Float32Array(n * 2); let o = 0;
    for (const g of geos) { P3.set(g.attributes.position.array, o * 3); N3.set(g.attributes.normal.array, o * 3); U2.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P3, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N3, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = names.size ? [...names].join('+') : 'ship-merged';
    root.add(mesh); out.push(mesh);
  }
  return out;
}

/** Triangles drawn by everything under root (instancing counted). */
export function countTriangles(root, { visibleOnly = false } = {}) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (visibleOnly) for (let p = o; p; p = p.parent) if (p.visible === false) return;
    const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    n += t * (o.isInstancedMesh ? o.count : 1);
  });
  return n;
}

// ------------------------------------------------------------------------------------------------- materials
function materials(ctx, atlasTex, uNight) {
  const cache = new Map();
  const toon = (c, o = {}) => {
    if (ctx.mat?.toon) return ctx.mat.toon(c, o);
    const key = c + JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.isTexture ? v.uuid : v])));
    if (!cache.has(key)) cache.set(key, new THREE.MeshToonMaterial({ color: c, map: o.map || null, alphaTest: o.alphaTest || 0, side: o.side === 'double' ? THREE.DoubleSide : o.side === 'back' ? THREE.BackSide : THREE.FrontSide }));
    return cache.get(key);
  };
  // night lamps: harbor/lights.js nightMat bound to this ship's own night uniform
  const lctx = { shared: { uNight, uTime: ctx.shared?.uTime || { value: 0 }, uLit: { value: 0 } } };
  const nm = (day, night, k, o) => nightMat(lctx, day, night, k, o);
  return {
    hull: toon('#ffffff', { map: atlasTex, side: 'double', paint: 0.025 }),
    board: toon('#ffffff', { map: atlasTex, side: 'double', paint: 0 }),
    decal: toon('#ffffff', { map: atlasTex, alphaTest: 0.5, polygonOffset: -2, paint: 0 }),
    house: toon('#eceee9', { paint: 0.03 }), roof: toon('#d6dbd7'), deck: toon('#c9cfcb'), deckDark: toon('#4b505a'), inner: toon('#e2e5e0'),
    rail: toon('#eef0ea', { paint: 0 }), mast: toon('#e9ebe5', { paint: 0.02 }), black: toon('#25262e'), dark: toon('#3b3f4b'), steel: toon('#9aa1a8'),
    red: toon('#c8202a'), antifoul: toon('#8c2b2b'), bronze: toon('#b48a4f'), orange: toon('#ef7b35'), yellow: toon('#e9c24a'), blue: toon('#4f86b8'),
    green: toon('#55745f'), flagWhite: toon('#f4f4f0', { side: 'double' }), flagRed: toon('#c8202a', { side: 'double' }), lifebuoy: toon('#e2553f'), rope: toon('#c9b48a'), radome: toon('#f1f2ee'), interior: toon('#30343d', { side: 'back' }), panel: toon('#dfe3e4'),
    glass: nm('#3f4c63', '#ffd6a0', 1.25), glassDark: nm('#2f3a4f', '#ffcf94', 0.9),
    navRed: nm('#b8403a', '#ff3a2a', 2.4, { always: 0.25 }), navGreen: nm('#3f8f5b', '#3aff7a', 2.2, { always: 0.25 }),
    navWhite: nm('#bfc3c2', '#fffbe8', 2.4), flood: nm('#d9d6cc', '#ffe8c0', 2.2), lamp: nm('#c9665c', '#ff5a3a', 2.0),
  };
}

// ------------------------------------------------------------------------------------------------- builder
/**
 * Build the ship. opts: livery ('nendo' | 'fallback', default from ./flags.js), tier ('high' | 'phone', default from
 * ctx.quality), liveryData (inject the three nendo JSON files: tests, tools), fetchJson (loader for the nendo files).
 * The group is not added to the scene: the caller adds it (ctx.add for a moving ship) and poses it.
 */
export function buildShofukumaru(ctx, opts = {}) {
  const tier = opts.tier || (ctx.quality?.phone || ctx.quality?.tier === 'phone' ? 'phone' : 'high');
  const liveryMode = opts.livery || (resolveFlags().nendoLivery ? 'nendo' : 'fallback');
  const T = TIERS[tier];
  const group = new THREE.Group(); group.name = 'ship:shofukumaru1';
  const uNight = { value: 0 }; let manualNight = false, disposed = false, propRps = 0;

  // livery atlas (one canvas, one texture)
  const canvas = makeCanvas(ATLAS.W, ATLAS.H);
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = tier === 'phone' ? 2 : 8;
  const profile = { sheerAt };
  let plan = fallbackPlan();
  paintAtlas(g2, plan, { profile }); tex.needsUpdate = true;

  const M = materials(ctx, tex, uNight);
  const k = makeKit(group, tier);
  const anchors = { lights: [] };

  // ---- hull
  const hull = new THREE.Mesh(hullGeometry(tier), M.hull); hull.name = 'hull'; hull.castShadow = hull.receiveShadow = true; group.add(hull);
  const appendages = new THREE.Group(); appendages.name = 'appendages'; group.add(appendages);
  const ka = makeKit(appendages, tier);
  // skeg and sole piece (measured on shofukumaru02: the keel line drops to -5.1 under the propeller)
  ka.mesh(profilePlate([[34, -4.25], [44, -4.55], [48, -4.85], [50.9, -5.1], [50.9, -1.55], [46.5, -2.2], [40, -3.0], [34, -3.7]], 0.55), M.antifoul);
  ka.mesh(profilePlate([[50.8, -5.1], [53.7, -5.2], [53.7, -4.85], [50.8, -4.7]], 0.36), M.antifoul);
  const rudder = new THREE.Group(); rudder.name = 'rudder'; rudder.position.set(0, 0, zOf(53.6)); appendages.add(rudder);
  { const r = new THREE.Mesh(profilePlate([[53.4, -0.9], [55.0, -0.9], [55.0, -4.45], [53.4, -4.6]], 0.32), M.antifoul); r.position.z = -zOf(53.6); rudder.add(r); }
  const prop = new THREE.Group(); prop.name = 'propeller'; prop.position.set(0, SHIP.propeller.h, zOf(SHIP.propeller.s)); appendages.add(prop);
  { const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, T.seg), M.bronze); hub.rotation.x = Math.PI / 2; prop.add(hub);
    for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.SphereGeometry(1, T.seg, 4), M.bronze); bl.scale.set(0.46, 0.98, 0.07); bl.position.set(0, 0.72, 0); const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2; bl.rotation.y = 0.5; arm.add(bl); prop.add(arm); } }

  // ---- decks and bulkheads
  const deckMesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.receiveShadow = true; group.add(m); return m; };
  deckMesh(deckGeometry(0.35, 16.5, (s) => sheerAt(s) - 0.01, 0.0), M.deck, 'forecastle-deck');
  deckMesh(deckGeometry(16.5, 28.3, () => SHIP.wellDeck, 0.0), M.deckDark, 'well-deck');
  deckMesh(deckGeometry(28.3, 41.6, () => SHIP.promenade - 0.01, 0.0), M.deck, 'promenade-deck');
  deckMesh(deckGeometry(41.6, 58.6, () => SHIP.aftShelter.roof, 0.0, { widthAt: (s) => halfBreadth(s, 7.25) }), M.roof, 'aft-roof');
  deckMesh(deckGeometry(41.6, 58.6, () => SHIP.aftShelter.roof - 0.15, 0.0, { down: true, widthAt: (s) => halfBreadth(s, 7.15) }), M.inner, 'aft-roof-under');
  deckMesh(deckGeometry(55.8, 58.6, () => SHIP.sternOpening.h0, 0.0, { step: 0.4 }), M.deck, 'stern-setting-deck');
  deckMesh(linerGeometry(16.5, 28.3, SHIP.wellDeck), M.inner, 'well-liner');
  { // forecastle aft bulkhead (s 16.5, well deck to the forecastle deck) with a door, and the stern bay's forward bulkhead
    const b = halfBreadth(16.5, 4.5) - 0.2; k.blk(M.house, 16.45, 16.6, SHIP.wellDeck, sheerAt(16.5), -b, b);
    k.blk(M.dark, 16.4, 16.45, SHIP.wellDeck + 0.05, SHIP.wellDeck + 2.0, 0.6, 1.5);
    const bs = halfBreadth(55.8, 6.5) - 0.15; k.blk(M.house, 55.7, 55.85, SHIP.sternOpening.h0, SHIP.aftShelter.roof, -bs, bs);
    k.blk(M.dark, 55.85, 55.9, SHIP.sternOpening.h0 + 0.05, SHIP.sternOpening.h0 + 1.25, -0.5, 0.5);
    // under the bridge front, seen through the 舷門: a dark compartment
    const iw = new THREE.Mesh(_box, M.interior); iw.scale.set(4.3, 2.0, 3.1); iw.position.set(-2.2, SHIP.wellDeck + 1.0, zOf(29.85)); group.add(iw);
    k.blk(M.house, 28.25, 28.35, SHIP.wellDeck, SHIP.promenade, -halfBreadth(28.3, 4) + 0.2, halfBreadth(28.3, 4) - 0.2);   // bridge-front bulkhead over the well
    k.blk(M.dark, 28.2, 28.25, SHIP.wellDeck + 0.05, SHIP.wellDeck + 1.9, 0.8, 1.7);
  }

  // ---- bridge house: level 1 (promenade deck to the 7.3 m deck) and the wheelhouse
  const B1 = SHIP.bridge, hw1 = 3.7, hw2 = 3.2;
  k.rblk(M.house, B1.house1[0], B1.house1[1], SHIP.promenade, SHIP.aftShelter.roof, -hw1, hw1, 0.12);
  deckMesh(deckGeometry(28.3, 41.6, () => SHIP.aftShelter.roof + 0.005, 0, { widthAt: () => hw1 + 0.1 }), M.roof, 'house1-roof');
  for (const sd of [1, -1]) {   // doors and portholes on level 1
    k.blk(M.dark, 31.0, 31.9, SHIP.promenade + 0.05, SHIP.promenade + 2.0, sd * (hw1 + 0.01), sd * (hw1 + 0.03));
    for (const s of [33.5, 35.5, 37.5, 39.5]) k.blk(M.glassDark, s, s + 0.45, 6.15, 6.6, sd * (hw1 + 0.01), sd * (hw1 + 0.03));
  }
  const yW = SHIP.aftShelter.roof;
  k.rblk(M.house, B1.s0, B1.s1, yW, B1.roof, -hw2, hw2, 0.14);
  k.blk(M.roof, B1.s0 - 0.15, B1.s1 + 0.1, B1.roof, B1.roof + 0.15, -hw2 - 0.15, hw2 + 0.15);
  // wheelhouse windows (front band of 7, 5 a side forward) and the red stripe under them
  const zF = zOf(B1.s0) + 0.02;
  for (let i = 0; i < 7; i++) { const x = -hw2 + 0.35 + i * ((2 * hw2 - 0.7) / 7); k.mesh(new THREE.BoxGeometry((2 * hw2 - 0.7) / 7 - 0.14, 0.95, 0.06), M.glass, [x + ((2 * hw2 - 0.7) / 7) / 2, 8.75, zF]); k.mesh(new THREE.BoxGeometry((2 * hw2 - 0.7) / 7 - 0.14, 0.26, 0.05), M.red, [x + ((2 * hw2 - 0.7) / 7) / 2, 7.5, zF]); }
  for (const sd of [1, -1]) {
    for (let i = 0; i < 5; i++) { const s = 29.0 + i * 1.15; k.blk(M.glass, s, s + 0.85, 8.3, 9.2, sd * (hw2 + 0.01), sd * (hw2 + 0.04)); k.blk(M.red, s, s + 0.85, 7.38, 7.62, sd * (hw2 + 0.01), sd * (hw2 + 0.04)); }
    k.blk(M.dark, 36.4, 37.2, yW + 0.05, yW + 2.0, sd * (hw2 + 0.01), sd * (hw2 + 0.03));   // wheelhouse side door
    k.blk(M.glass, 38.2, 38.8, 8.4, 9.0, sd * (hw2 + 0.01), sd * (hw2 + 0.04));
    // lifebuoys on the level-1 front corners
    const lb = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 5, T.seg + 2), M.lifebuoy); lb.position.set(sd * (hw1 - 0.6), 6.3, zOf(B1.s0) + 0.1); lb.castShadow = true; group.add(lb);
  }
  // wheelhouse roof: railing, MG1-2112 boards (front and both sides), radomes, whips, Starlink panels, searchlights
  const rr = [[-hw2 + 0.05, B1.roof + 0.15, zOf(B1.s0 + 0.05)], [hw2 - 0.05, B1.roof + 0.15, zOf(B1.s0 + 0.05)], [hw2 - 0.05, B1.roof + 0.15, zOf(B1.s1 - 0.05)], [-hw2 + 0.05, B1.roof + 0.15, zOf(B1.s1 - 0.05)], [-hw2 + 0.05, B1.roof + 0.15, zOf(B1.s0 + 0.05)]];
  k.railing(M.rail, rr, 0.75);
  { const bd = k.mesh(atlasPlane('boardMG', 2.4, 0.62, '+z'), M.board, [0, B1.roof + 0.5, zOf(B1.s0) + 0.06]); bd.name = 'MG1-2112';
    for (const sd of [1, -1]) { const b2 = k.mesh(atlasPlane('boardMG', 2.8, 0.62, sd > 0 ? '+x' : '-x'), M.board, [sd * (hw2 + 0.0), B1.roof + 0.5, zOf(36.2)]); b2.name = 'MG1-2112'; } }
  for (const [s, x] of [[29.6, -1.6], [33.6, 1.6]]) {
    k.post(M.steel, s, x, B1.roof + 0.15, B1.roof + 0.6, 0.16);
    k.post(M.radome, s, x, B1.roof + 0.6, B1.roof + 1.25, 0.56);
    k.mesh(new THREE.SphereGeometry(0.56, T.seg + 2, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.radome, [x, B1.roof + 1.25, zOf(s)]);
  }
  const WHIPS = [[30.3, 2.6, 17.2], [34.8, -2.8, 16.2], [36.2, -2.6, 16.0], [37.6, 2.4, 16.8], [35.4, 2.8, 16.0], [38.2, -2.4, 16.6], [32.2, -2.7, 15.4]];
  for (const [s, x, top] of WHIPS.slice(0, T.whips)) k.post(M.mast, s, x, B1.roof + 0.15, top, 0.05, 0.025, 5);
  for (const sd of [1, -1]) {   // Starlink flat panels, no logo (slide 0950: 日本船初の高速通信)
    k.post(M.steel, 38.9, sd * 1.9, B1.roof + 0.15, B1.roof + 0.55, 0.05, 0.05, 5);
    const pn = k.mesh(new THREE.BoxGeometry(0.58, 0.05, 0.51), M.panel, [sd * 1.9, B1.roof + 0.6, zOf(38.9)], [0.14, 0, 0]); pn.name = 'starlink';
    k.post(M.dark, 28.9, sd * 2.5, B1.roof + 0.15, B1.roof + 0.55, 0.16, 0.2);   // searchlights
  }
  // promenade railing round the level-1 house (s 28.3 to the aft shelter), on the hull top
  for (const sd of [1, -1]) {
    const pts = []; for (let s = 16.5; s <= 41.6 + 1e-6; s += 2.5) { const ss = Math.min(41.6, s); pts.push([sd * (halfBreadth(ss, sheerAt(ss)) - 0.08), sheerAt(ss), zOf(ss)]); }
    k.railing(M.rail, pts, 0.95);
  }

  // ---- forecastle: deck rails, bow platform, windlass, bitts, foremast, anchors
  for (const sd of [1, -1]) {
    const pts = []; for (let s = 1.2; s <= 16.5 + 1e-6; s += 1.6) { const ss = Math.min(16.5, s); pts.push([sd * (halfBreadth(ss, sheerAt(ss)) - 0.08), sheerAt(ss), zOf(ss)]); }
    k.railing(M.rail, pts, 1.0);
  }
  { const bx = [[0.3, 0], [1.2, 0.75], [2.8, 1.25]]; const pts = [...bx.map(([s, x]) => [x, sheerAt(s), zOf(s)])].reverse().concat(bx.slice(1).map(([s, x]) => [-x, sheerAt(s), zOf(s)]));
    k.railing(M.rail, pts, 1.25); }
  k.blk(M.green, 3.4, 4.6, sheerAt(4), sheerAt(4) + 0.8, -1.3, 1.3);   // windlass
  for (const sd of [1, -1]) { k.post(M.dark, 4.0, sd * 1.6, sheerAt(4), sheerAt(4) + 0.7, 0.42); k.post(M.dark, 7.2, sd * 2.6, sheerAt(7.2), sheerAt(7.2) + 0.55, 0.17); k.post(M.dark, 7.8, sd * 2.6, sheerAt(7.8), sheerAt(7.8) + 0.55, 0.17); }
  const FM = SHIP.foremast, fmBase = sheerAt(FM.s);
  k.post(M.mast, FM.s, 0, fmBase, FM.top, 0.19, 0.09);
  k.blk(M.mast, FM.s - 0.08, FM.s + 0.08, 12.75, 12.9, -1.45, 1.45);
  k.blk(M.mast, FM.s - 0.45, FM.s + 0.45, 10.3, 10.4, -0.45, 0.45);
  k.blk(M.dark, FM.s - 0.25, FM.s + 0.25, 13.2, 13.6, -0.25, 0.25);
  for (const sd of [1, -1]) {   // anchors in their hawse recesses (s 6.3, h 2.0: measured on 02/03)
    const s = 6.3, h = 2.0, b = halfBreadth(s, h);
    k.blk(M.dark, s - 0.45, s + 0.45, h - 0.4, h + 0.4, sd * (b - 0.02), sd * (b + 0.04));
    k.blk(M.black, s - 0.12, s + 0.12, h - 1.0, h + 0.3, sd * (b + 0.04), sd * (b + 0.14));
    k.blk(M.black, s - 0.55, s + 0.55, h - 1.15, h - 0.9, sd * (b + 0.04), sd * (b + 0.16));
  }
  // forecastle 7KFY lettering (aerial 07): across the beam, tops toward the bow
  { const d = k.mesh(atlasPlane('deck7kfy', 5.2, 1.75, 'up'), M.decal, [0, sheerAt(12.0) + 0.03, zOf(12.0)], [0, Math.PI, 0]); d.name = '7KFY-deck'; }

  // ---- the well: line hauler at the starboard 舷門, slow conveyor, branch-line reel, fish boxes, tubs
  { const yd = SHIP.wellDeck, xs = -(halfBreadth(25.0, 3.5) - 0.9);
    k.post(M.steel, 25.0, xs, yd, yd + 0.9, 0.22);
    const lh = k.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, T.seg + 4), M.yellow, [xs - 0.25, yd + 1.1, zOf(25.0)], [0, 0, Math.PI / 2 - 0.35]); lh.name = 'line-hauler';
    k.blk(M.steel, 25.4, 28.2, yd + 0.55, yd + 0.7, xs - 0.3, xs + 0.4);   // 揚縄用スローコンベア
    for (let s = 25.6; s < 28.2; s += 0.9) k.post(M.steel, s, xs + 0.05, yd, yd + 0.55, 0.04, 0.04, 5);
    k.blk(M.blue, 20.0, 21.6, yd, yd + 1.3, -0.9, 0.9);   // branch-line reel (ブランリール)
    k.post(M.dark, 20.8, 0, yd + 1.3, yd + 1.5, 0.6);
    for (let i = 0; i < 6; i++) k.blk(M.orange, 24.4 + (i % 2) * 0.8, 25.1 + (i % 2) * 0.8, yd + Math.floor(i / 2) * 0.32, yd + 0.3 + Math.floor(i / 2) * 0.32, 0.6, 1.4);
    for (let i = 0; i < (tier === 'phone' ? 3 : 7); i++) k.post(M.blue, 18.0 + (i % 4) * 0.9, 2.2 - Math.floor(i / 4) * 0.9, yd, yd + 0.5, 0.36, 0.42);
    anchors.lineHauler = [xs - 0.25, yd + 1.1, zOf(25.0)];
  }

  // ---- radar lattice mast (s 42.8) on the 7.3 m deck
  const RM = SHIP.radarMast, y0 = SHIP.aftShelter.roof;
  { const legs = [[41.6, 1.0], [43.9, 1.0], [43.9, -1.0], [41.6, -1.0]], top = [[42.0, 0.7], [43.6, 0.7], [43.6, -0.7], [42.0, -0.7]], yT = 15.6;
    const at = (i, t) => [legs[i][1] + (top[i][1] - legs[i][1]) * t, y0 + (yT - y0) * t, zOf(legs[i][0] + (top[i][0] - legs[i][0]) * t)];
    for (let i = 0; i < 4; i++) k.bar(M.mast, at(i, 0), at(i, 1), 0.2);
    const lv = [0, (10.0 - y0) / (yT - y0), (13.0 - y0) / (yT - y0), 1];
    for (let L = 0; L < lv.length; L++) for (let i = 0; i < 4; i++) k.bar(M.mast, at(i, lv[L]), at((i + 1) % 4, lv[L]), 0.13);
    for (let L = 0; L < lv.length - 1; L++) for (let i = 0; i < 4; i++) { k.bar(M.mast, at(i, lv[L]), at((i + 1) % 4, lv[L + 1]), 0.1); k.bar(M.mast, at((i + 1) % 4, lv[L]), at(i, lv[L + 1]), 0.1); }
    // platforms with rails
    for (const [s0, s1, hw, h] of [[38.55, 44.0, 1.3, 13.0], [40.6, 43.8, 1.1, yT]]) {
      k.blk(M.mast, s0, s1, h - 0.12, h, -hw, hw);
      k.railing(M.rail, [[-hw, h, zOf(s1)], [-hw, h, zOf(s0)], [hw, h, zOf(s0)], [hw, h, zOf(s1)]], 0.9, { step: 1.2 });
      k.blk(M.mast, s0, s1, h, h + 0.18, hw - 0.04, hw);     // toe boards (they read as solid in the side photos)
      k.blk(M.mast, s0, s1, h, h + 0.18, -hw, -hw + 0.04);
      k.blk(M.mast, s0, s0 + 0.04, h, h + 0.18, -hw, hw);
    }
    // the forward radar frame on the wheelhouse roof (02, 05): four posts carrying the platforms ahead of the tower
    for (const s of [38.7, 40.4]) for (const x of [-1.0, 1.0]) k.bar(M.mast, [x, 10.15, zOf(s)], [x, 15.25, zOf(s)], 0.16);
    k.blk(M.mast, 38.55, 40.6, 15.13, 15.25, -1.2, 1.2);
    k.railing(M.rail, [[-1.2, 15.25, zOf(40.6)], [-1.2, 15.25, zOf(38.55)], [1.2, 15.25, zOf(38.55)], [1.2, 15.25, zOf(40.6)]], 0.85, { step: 1.0 });
    k.blk(M.dark, 38.9, 39.5, 15.25, 15.75, -0.3, 0.3);   // radar transceiver
    for (const x of [-1.0, 1.0]) { k.bar(M.mast, [x, 10.15, zOf(38.7)], [x, 12.95, zOf(40.4)], 0.1); k.bar(M.mast, [x, 12.95, zOf(38.7)], [x, 15.15, zOf(40.4)], 0.1); }
    k.blk(M.mast, 38.55, 39.6, 12.88, 13.0, -1.3, 1.3);   // platform 1 runs forward over the frame
    for (const sd of [1, -1]) k.bar(M.mast, [sd * 1.2, 12.9, zOf(39.8)], [sd * 0.9, 10.6, zOf(41.5)], 0.12);   // diagonal braces under the radar platform (05)
    // ladder up the aft face (05: the rungs read as a solid strip in the side photos)
    { const lz = zOf(44.0); for (const x of [-0.25, 0.25]) k.bar(M.mast, [x, y0, lz], [x, yT, lz + 0.3], 0.06); const nR = tier === 'phone' ? 8 : 24; for (let i = 1; i < nR; i++) { const t = i / nR; k.bar(M.mast, [-0.25, y0 + (yT - y0) * t, lz + 0.3 * t], [0.25, y0 + (yT - y0) * t, lz + 0.3 * t], 0.04); } }
    k.post(M.mast, RM.s, 0, yT, RM.top, 0.14, 0.08);
    k.blk(M.mast, RM.s - 0.07, RM.s + 0.07, 18.55, 18.67, -1.2, 1.2);
    k.blk(M.mast, RM.s - 0.06, RM.s + 0.06, 19.75, 19.85, -0.6, 0.6);
    k.post(M.lamp, RM.s, 0, RM.top - 0.25, RM.top - 0.05, 0.09);
    for (const h of [17.2, 16.6]) k.post(M.lamp, RM.s + 0.15, 0, h, h + 0.22, 0.08);
  }
  const radars = [];
  for (const [s, h, len] of [[40.4, 13.0, 3.8], [41.4, 15.6, 2.8]]) {
    k.blk(M.dark, s - 0.25, s + 0.25, h, h + 0.4, -0.25, 0.25);
    const rg = new THREE.Group(); rg.name = 'radar'; rg.position.set(0, h + 0.55, zOf(s)); rg.rotation.y = Math.PI / 2; group.add(rg);
    const bar = new THREE.Mesh(_box, M.house); bar.scale.set(len, 0.24, 0.3); bar.castShadow = true; rg.add(bar);
    radars.push(rg);
  }

  // ---- funnel (white, black top, two exhausts; the crest goes on only with the nendo livery)
  const FN = SHIP.funnel;
  k.rblk(M.house, FN.s0, FN.s1, y0, 10.0, -1.05, 1.05, 0.12);
  k.blk(M.black, FN.s0 - 0.05, FN.s1 + 0.05, 10.0, FN.top - 0.05, -1.1, 1.1);
  k.mesh(new THREE.BoxGeometry(2.3, 0.08, 1.2), M.black, [0, FN.top - 0.02, zOf(FN.s1 - 0.2)], [-0.35, 0, 0]);
  for (const [s, x] of [[47.3, 0.45], [48.0, -0.4]]) { k.post(M.black, s, x, FN.top - 0.1, FN.top + 0.55, 0.19); k.post(M.bronze, s, x, FN.top + 0.55, FN.top + 0.62, 0.2); }
  for (const [s, x, top] of [[47.3, -0.75, 14.5], [48.2, 0.75, 15.4]]) k.post(M.black, s, x, FN.top - 0.4, top, 0.05, 0.025, 5);   // two black whips at the funnel (02, 05)

  // ---- aft shelter roof: deck railing with 7KFY boards, the cage, aft mast, flagstaff, roof lettering, stern bay gear
  const AS = SHIP.aftShelter;
  for (const sd of [1, -1]) {
    const pts = [[sd * hw1, y0, zOf(28.4)], [sd * hw1, y0, zOf(42.0)]];
    for (let s = 42.6; s <= 58.2 + 1e-6; s += 1.4) pts.push([sd * (halfBreadth(s, y0) - 0.1), y0, zOf(s)]);
    pts.push([sd * (halfBreadth(58.45, y0) - 0.05), y0, zOf(58.45)], [0, y0, zOf(58.55)]);
    k.railing(M.rail, pts, AS.rail - y0, { rails: [0.34, 0.67] });   // three rails round the setting-shelter roof (05, designboom-1800)
    const b = halfBreadth(51.8, 8.0) - 0.06;
    const bd = k.mesh(atlasPlane('board7kfy', 4.0, 1.1, sd > 0 ? '+x' : '-x'), M.board, [sd * b, 8.0, zOf(51.8)]); bd.name = '7KFY-rail';
  }
  { // the fenced cage aft of the funnel (designboom-1800, 05): close vertical bars, two rails, rounded top 10.3 m
    const c0 = 49.4, c1 = 53.4, cw = 2.3, ch = 10.2, loop = [[-cw, zOf(c0)], [cw, zOf(c0)], [cw, zOf(c1)], [-cw, zOf(c1)], [-cw, zOf(c0)]];
    for (const h of [8.7, ch]) for (let i = 0; i < 4; i++) k.bar(M.rail, [loop[i][0], h, loop[i][1]], [loop[i + 1][0], h, loop[i + 1][1]], 0.07);
    const step = tier === 'phone' ? 0.7 : 0.32;
    for (let i = 0; i < 4; i++) { const a = loop[i], b = loop[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)); for (let q = 0; q < n; q++) { const t = q / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; k.bar(M.rail, [x, y0, z], [x, ch, z], 0.045); } }
    k.blk(M.house, c0 + 0.3, c1 - 0.3, y0, 8.6, -1.6, 1.6);   // the setting shelter's top house inside the cage
  }
  const AM = SHIP.aftMast;
  k.post(M.mast, AM.s, 0, y0, AM.top, 0.16, 0.08);
  k.blk(M.mast, AM.s - 0.07, AM.s + 0.07, 13.0, 13.12, -1.2, 1.2);
  k.blk(M.mast, AM.s - 0.06, AM.s + 0.06, 15.5, 15.6, -0.8, 0.8);
  { const d = k.mesh(atlasPlane('deck7kfy', 3.6, 1.2, 'up'), M.decal, [0, y0 + 0.03, zOf(56.2)], [0, -Math.PI / 2, 0]); d.name = '7KFY-roof'; }
  { // ensign staff and 日の丸 at the stern
    k.post(M.mast, 58.3, 0, y0, 10.6, 0.04, 0.03, 5);   // the ensign flies just past the stern (02: s 58.8-59.2, h 9.2-10.7)
    const fl = new THREE.Group(); fl.name = 'ensign'; fl.position.set(0, 10.15, zOf(58.3)); group.add(fl);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M.flagWhite); w.rotation.y = Math.PI / 2; w.position.z = -0.62; fl.add(w);
    const dsc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), M.flagRed); dsc.rotation.y = Math.PI / 2; dsc.position.set(0.006, 0, -0.62); fl.add(dsc);
    const dsc2 = dsc.clone(); dsc2.rotation.y = -Math.PI / 2; dsc2.position.x = -0.006; fl.add(dsc2);
  }
  { // stern bay: radio buoys (red flag, lamp), orange floats, the line-setting machine
    const yd = SHIP.sternOpening.h0;
    k.blk(M.steel, 57.2, 58.3, yd, yd + 0.7, -0.5, 0.5);
    k.blk(M.dark, 58.0, 58.5, yd + 0.4, yd + 0.55, -0.25, 0.25);
    const nb = tier === 'phone' ? 2 : 4;
    for (let i = 0; i < nb; i++) { const x = -1.6 + i * (3.2 / Math.max(1, nb - 1)), s = 56.4;
      k.post(M.yellow, s, x, yd, yd + 0.8, 0.22, 0.26);
      k.post(M.dark, s, x, yd + 0.8, yd + 2.8, 0.03, 0.03, 5);
      k.mesh(new THREE.BoxGeometry(0.02, 0.32, 0.5), M.red, [x, yd + 2.55, zOf(s) - 0.26]);
      k.sphere(M.lamp, [x, yd + 2.88, zOf(s)], 0.07, 6);
    }
    for (let i = 0; i < T.floats; i++) k.sphere(M.orange, [-2.4 + (i % 7) * 0.33, yd + 0.15 + Math.floor(i / 7) * 0.28, zOf(57.0 + (i % 3) * 0.3)], 0.15, 8);
    anchors.radioBuoys = [[-1.6, yd + 0.8, zOf(56.4)], [1.6, yd + 0.8, zOf(56.4)]];
  }

  // ---- stays and the ships' wires (thin; the dressing line carries the 大漁旗)
  // routed as in shofukumaru02: forestay from the bow rail to the foremast hounds, the triatic stays aft
  const W = (a, b) => k.rod(M.dark, a, b, 0.014, 4);
  W(P(FM.s, FM.top - 0.25), P(41.6, 17.2));
  W(P(FM.s, 10.35), P(B1.s0 + 0.1, 10.35));
  W(P(1.5, 7.3), P(FM.s, 10.6));
  W(P(RM.s, 18.6), P(AM.s, 16.0));
  W(P(AM.s, 15.5), P(58.3, 10.4));

  // ---- lights: masthead (two, aft higher), side lights on the wheelhouse, stern light, deck floods, windows
  const light = (mat, p, c, kind, size = [0.22, 0.3, 0.22]) => { const m = k.mesh(new THREE.BoxGeometry(...size), mat, p); m.name = 'light:' + kind; anchors.lights.push({ p, c, kind }); return m; };
  light(M.navWhite, P(FM.s - 0.25, 15.2), '#fff3d8', 'mast');
  light(M.navWhite, P(RM.s - 0.2, 18.1), '#fff3d8', 'mast');
  light(M.navRed, [hw2 + 0.12, 8.0, zOf(29.0)], '#ff4a3a', 'port', [0.12, 0.36, 0.5]);
  light(M.navGreen, [-hw2 - 0.12, 8.0, zOf(29.0)], '#40ff90', 'starboard', [0.12, 0.36, 0.5]);
  light(M.navWhite, P(58.5, 7.6), '#fff3d8', 'stern');
  for (const p of [P(FM.s, 12.6, 1.2), P(FM.s, 12.6, -1.2), P(39.7, 12.85, 0), P(AM.s, 12.85, 1.0), P(AM.s, 12.85, -1.0), [-2.6, 7.05, zOf(28.15)], P(56.0, 7.1, 0)])
    light(M.flood, p, '#ffe2b0', 'deck', [0.45, 0.22, 0.3]);

  // ---- 大漁旗 (福来旗) dressing: stem -> foremast -> radar mast -> aft mast -> stern staff; hidden until setFlags(true)
  const flags = new THREE.Group(); flags.name = 'tairyo-flags'; flags.visible = false; group.add(flags);
  const dress = [P(0.4, 7.4), P(FM.s, FM.top - 0.2), P(RM.s, RM.top - 0.4), P(AM.s, AM.top - 0.3), P(58.3, 10.4)];
  const flagMeshes = []; anchors.flagPoints = [];
  {
    const L = []; let tot = 0; for (let i = 0; i < dress.length - 1; i++) { const l = Math.hypot(dress[i + 1][1] - dress[i][1], dress[i + 1][2] - dress[i][2]); L.push(l); tot += l; }
    const fk = makeKit(flags, tier);
    for (let i = 0; i < dress.length - 1; i++) fk.rod(M.dark, dress[i], dress[i + 1], 0.018, 4);
    const n = T.flags;
    for (let f = 0; f < n; f++) {
      let d = ((f + 0.5) / n) * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
      const t = d / L[i], a = dress[i], b = dress[i + 1];
      const p = [0, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const fw = 2.0, fh = 1.33;
      const geo = atlasPlane('flag' + (f % 4), fw, fh, '+x');
      geo.translate(0, -fh / 2 - 0.05, 0);
      const m = new THREE.Mesh(geo, M.board); m.position.set(p[0], p[1], p[2]); m.castShadow = true; m.name = '大漁旗';
      flags.add(m); flagMeshes.push(m); anchors.flagPoints.push(p);
    }
  }

  // ---- anchors (local [x, y, z])
  const G = SHIP.gangway;
  Object.assign(anchors, {
    gangwayStbd: [-halfBreadth(26.5, G.h0), G.h0, zOf(26.5)],
    gangwayBox: { ...G, x: -SHIP.B / 2 },
    sternSetting: [0, SHIP.sternOpening.h0, zOf(58.0)],
    bridge: [0, 8.9, zOf(29.4)],
    mastTop: [0, RM.top, zOf(RM.s)],
    hornPos: [0, 13.6, zOf(40.0)],
    funnelTop: [0, FN.top, zOf(FN.s)],
    bow: [0, SHIP.stemHead, zOf(0)],
    stern: [0, AS.roof, zOf(SHIP.LOA)],
  });
  const railBy = { port: [], starboard: [] };
  for (const sd of [1, -1]) {
    for (let s = 29.0; s <= 41.0; s += 2.0) railBy[sd > 0 ? 'port' : 'starboard'].push([sd * (halfBreadth(s, 5.0) - 0.08), 5.95, zOf(s)]);
    for (let s = 43.0; s <= 57.0; s += 2.0) railBy[sd > 0 ? 'port' : 'starboard'].push([sd * (halfBreadth(s, y0) - 0.1), AS.rail - 0.1, zOf(s)]);
  }
  anchors.railPointsBySide = railBy;
  anchors.railPoints = [...railBy.port, ...railBy.starboard];

  // ---- merge the static parts by material (hull, decks, houses, rails...), keep the moving ones
  const keep = new Set([flags, rudder, prop, ...radars]);
  for (const o of group.children) if (o.name === 'ensign') keep.add(o);
  hull.userData.keep = true; keep.add(hull);
  mergeByMaterial(group, keep);

  // ---- livery: nendo data arrives asynchronously; the fallback is painted already
  const crestMeshes = [];
  const addCrest = () => {
    for (const sd of [1, -1]) {
      const m = new THREE.Mesh(atlasPlane('crest', 1.35, 1.35, sd > 0 ? '+x' : '-x'), M.board);
      m.position.set(sd * 1.075, 8.7, zOf(FN.s)); m.name = 'crest:違い山星一'; group.add(m); crestMeshes.push(m);
    }
  };
  const state = { mode: 'fallback', error: null };
  let ready = Promise.resolve(state);
  if (liveryMode === 'nendo') {
    const src = opts.liveryData ? Promise.resolve(opts.liveryData) : loadNendo(opts.fetchJson);
    ready = src.then((data) => {
      if (disposed) return state;
      plan = cleanNendo(data);
      paintAtlas(g2, plan, { profile }); tex.needsUpdate = true;
      addCrest(); state.mode = 'nendo';
      return state;
    }).catch((e) => { state.error = String(e?.message || e); return state; });
  }

  // ---- runtime
  const api = {
    group, anchors, ship: SHIP, tier,
    get livery() { return state.mode; }, get plan() { return plan; }, ready,
    atlas: { canvas, texture: tex },
    get triangles() { return countTriangles(group); },
    setFlags(on) { flags.visible = !!on; },
    setNight(f) { manualNight = true; uNight.value = clamp(+f || 0); },
    setPropeller(rps) { propRps = +rps || 0; },
    setRudder(a) { rudder.rotation.y = clamp(a, -0.6, 0.6); },
    localToWorld(p) { group.updateMatrixWorld(true); return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(group.matrixWorld); },
    update(dt, t) {
      if (!manualNight && ctx.shared?.uNight) uNight.value = ctx.shared.uNight.value;
      radars[0].rotation.y += dt * (Math.PI * 2) / 2.5;   // 24 rpm
      radars[1].rotation.y -= dt * (Math.PI * 2) / 3.0;
      prop.rotation.z += dt * propRps * Math.PI * 2;
      if (flags.visible) flagMeshes.forEach((m, i) => { m.rotation.y = 0.28 * Math.sin(t * 2.6 + i * 0.9) + 0.12 * Math.sin(t * 5.3 + i * 2.1); m.rotation.x = 0.05 * Math.sin(t * 3.1 + i); });
    },
    dispose() {
      disposed = true;
      group.traverse((o) => { if (o.isMesh && o.geometry !== _box && ![..._cyl.values()].includes(o.geometry)) o.geometry.dispose(); });
      for (const m of [M.hull, M.board, M.decal]) { m.dispose(); if (ctx.mat?.cache) for (const [key, v] of ctx.mat.cache) if (v === m) ctx.mat.cache.delete(key); }
      tex.dispose();
      if (canvas && !canvas.stub) { canvas.width = 1; canvas.height = 1; }
      group.removeFromParent();
    },
  };
  return api;
}
