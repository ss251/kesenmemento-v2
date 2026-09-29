// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/tree.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Seeded procedural cherry tree generator (Somei-Yoshino style + weeping 枝垂れ桜).
//
// Canopy = flower clusters (pads) sampled on a lobed umbrella envelope, grouped into lobes (one per
// branch) and fused into ONE soft blossom-mass surface per crown (implicit field -> surface nets ->
// billow displacement, see canopy.js): welded smooth geometry, geometry normal = smooth crown
// envelope (outline pre-pass only finds the silhouette, branch gaps and deep folds; backlit rim glow),
// shading normal = surface / lobe / canopy blend (soft curved cel terminators). A per-vertex tone is
// quantised in the shader into 4 painted pink bands (deep pink pockets -> sakura -> pale -> near-white
// tops, a few peach clumps), the shadow side is eased toward lavender-grey, and a soft triplanar
// blossom speckle gives flower texture. The surface is dressed with alpha-tested blossom cards (lace
// that breaks every silhouette, hanging sprays under the rim, sparse cover in the cavity; dappled
// shadows, wind sway). The crown is a hollow shell open below, so walking under a tree shows the deep
// pink underside with the branches spreading into it. Low clusters of near trees get smaller kernels
// + denser cards (lacier right above the viewer).
// Skeleton = trunk -> limbs (forking at staggered heights) -> secondary limbs -> branches spread along
// their parent -> one twig per cluster, grown toward cluster targets (hierarchical clustering), so
// branches really carry the flowers and the crown keeps branch gaps.
//
// Everything is emitted in WORLD space into three GeoBuilders: bark, blob, cards.
import * as THREE from 'three';
import { GeoBuilder, tube, bezier, hex, mix3, clamp01 } from './util.js';
import { blossomSurface, dressSurface, emitCard } from './canopy.js';
import { SUN_DIR } from '../../layout.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const SUN = (() => { const l = Math.hypot(...SUN_DIR); return SUN_DIR.map(v => v / l); })();

// ---------------------------------------------------------------- palettes (linear rgb)
// Four tone bands (deep pink near the flower centres / undersides -> soft sakura pink -> pale pink
// -> near-white). The pad shader quantises a per-vertex tone value into these bands (see
// materials.js BANDS — keep in sync); cards use the same bands on the CPU (bandColor).
export const BANDS = {
  normal: ['#e597b2', '#f3bccd', '#f9d8e2', '#fce9ef'],
  weeping: ['#dc81a1', '#e99db7', '#f2c0d0', '#f8dde6'],
  peach: '#f6c7b8',
};
const PAL = {
  normal: BANDS.normal.map(hex),
  weeping: BANDS.weeping.map(hex),
  peach: hex(BANDS.peach),
  leaf: hex('#f1efe3'),
};
/** Soft-quantised 4-band colour for tone t in [0,1] (matches the pad shader). */
function bandColor(bands, t) {
  t = clamp01(t);
  const w = 0.035;
  let c = bands[0];
  for (let k = 1; k < 4; k++) {
    const e = k / 4, a = clamp01((t - (e - w)) / (2 * w)), s = a * a * (3 - 2 * a);
    if (s > 0) c = mix3(c, bands[k], s);
  }
  return c.slice ? c.slice() : c;
}

// ---------------------------------------------------------------- LOD quality table
// padK: cluster size factor (smaller = more, finer clusters); h: surface-nets grid step (m);
// amp / freq: billow displacement; cov / covIn: blossom-card coverage on the outer surface / cavity;
// hang: share of lower-rim cards that hang as sprays
const LODQ = [
  { padK: 0.66, innerX: 0.22, h: 0.23, amp: 0.34, freq: 1.6, cov: 4.5, covIn: 1.3, hang: 0.3, trunkSeg: 12, limbSeg: 8, subSeg: 6, twigSeg: 4, cardK: 1.0, cardS: 0.72, sprig: 0.22, stubs: 2, twigs: true, roots: 5 },
  { padK: 0.8, innerX: 0.15, fill: true, smooth: 3, cover: 0.62, h: 0.4, amp: 0.34, freq: 1.05, cov: 2.1, covIn: 0.8, hang: 0.25, trunkSeg: 7, limbSeg: 5, subSeg: 4, twigSeg: 3, cardK: 1.0, cardS: 0.9, twigP: 0.45, sprig: 0.1, stubs: 0, twigs: true, roots: 3 },
  { padK: 1.05, fill: true, smooth: 3, h: 0.6, amp: 0.32, freq: 0.7, cov: 0.8, covIn: 0, hang: 0.15, trunkSeg: 7, limbSeg: 5, subSeg: 4, twigSeg: 3, cardK: 1.0, cardS: 1.15, sprig: 0, stubs: 0, twigs: false, roots: 0 },
];

// atlas cells (u0, v0) for the 2x2 blossom atlas (canvas y down, texture flipY)
const CELL = { dense: [0, 0.5], spray: [0.5, 0.5], loose: [0, 0], leaf: [0.5, 0] };

function randUnit(r, out = new V3()) {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, z, Math.sin(a) * s);
}

/** Pushes p (half extents rx, ry) out of keep-out boxes and above the floor (+floorOff). Returns displacement. */
function constrain(p, rx, ry, spec, skipFloor = false, floorOff = 0) {
  let moved = 0;
  if (spec.keepOut) for (const b of spec.keepOut) {
    if (p.x + rx > b.x0 && p.x - rx < b.x1 && p.z + rx > b.z0 && p.z - rx < b.z1 && p.y + ry > b.y0 && p.y - ry < b.y1) {
      let d = 0;
      if (b.push === 'x+') { d = b.x1 + rx - p.x; p.x += d; }
      else if (b.push === 'x-') { d = p.x - (b.x0 - rx); p.x -= d; }
      else if (b.push === 'z+') { d = b.z1 + rx - p.z; p.z += d; }
      else if (b.push === 'z-') { d = p.z - (b.z0 - rx); p.z -= d; }
      else if (b.push === 'y+') { d = b.y1 + ry - p.y; p.y += d; }
      moved += Math.abs(d);
    }
  }
  if (!skipFloor && spec.floorAt) {
    const f = spec.floorAt(p.x, p.z) + floorOff;
    if (p.y - ry < f) { moved += f - (p.y - ry); p.y = f + ry; }
  }
  if (spec.ceilY !== undefined && p.y + ry > spec.ceilY) { moved += p.y + ry - spec.ceilY; p.y = spec.ceilY - ry; }
  return moved;
}

/** k-means on Vector3 points (weighted y), returns array of index arrays. */
function kmeans(points, k, r, wy = 1) {
  if (points.length <= k) return points.map((_, i) => [i]);
  const cent = [points[Math.floor(r() * points.length)].clone()];
  const d2 = (a, b) => (a.x - b.x) ** 2 + ((a.y - b.y) * wy) ** 2 + (a.z - b.z) ** 2;
  while (cent.length < k) {
    let best = -1, bi = 0;
    for (let i = 0; i < points.length; i++) { let m = Infinity; for (const c of cent) m = Math.min(m, d2(points[i], c)); if (m > best) { best = m; bi = i; } }
    cent.push(points[bi].clone());
  }
  let groups = [];
  for (let it = 0; it < 8; it++) {
    groups = cent.map(() => []);
    for (let i = 0; i < points.length; i++) { let m = Infinity, gi = 0; for (let c = 0; c < cent.length; c++) { const d = d2(points[i], cent[c]); if (d < m) { m = d; gi = c; } } groups[gi].push(i); }
    for (let c = 0; c < cent.length; c++) { if (!groups[c].length) continue; cent[c].set(0, 0, 0); for (const i of groups[c]) cent[c].add(points[i]); cent[c].divideScalar(groups[c].length); }
  }
  return groups.filter(g => g.length);
}

// ============================================================================ canopy helpers
function makeCanopy(C, Rx, Ry, Rz, pal, noise, weeping) {
  const nc = new V3(), nl = new V3(), np = new V3();
  const W = weeping ? { c: 0.6, l: 0.0, p: 0.4, up: 0.1 } : { c: 0.36, l: 0.52, p: 0.14, up: 0.08 };
  const cv = {
    C, Rx, Ry, Rz, pal, palId: weeping ? 1 : 0,
    normalAt(p, out = new V3()) {
      if (weeping) out.set((p.x - C.x) / Rx, ((p.y - C.y) / Ry) * 0.45 + 0.28, (p.z - C.z) / Rz);
      else out.set((p.x - C.x) / Rx, (p.y - C.y) / Ry + 0.16, (p.z - C.z) / Rz);
      return out.normalize();
    },
    /** blended canopy / lobe / pad normal (padN optional: analytic pad normal) */
    field(p, pad, padN, out = new V3()) {
      cv.normalAt(p, nc);
      const L = pad.lobe;
      if (L) nl.set((p.x - L.c.x) / L.rx, (p.y - L.c.y) / L.ry + 0.12, (p.z - L.c.z) / L.rz).normalize(); else nl.copy(nc);
      if (padN) np.copy(padN); else np.set((p.x - pad.c.x) / pad.rx, (p.y - pad.c.y) / pad.ry, (p.z - pad.c.z) / pad.rz).normalize();
      return out.set(nc.x * W.c + nl.x * W.l + np.x * W.p, nc.y * W.c + nl.y * W.l + np.y * W.p + W.up, nc.z * W.c + nl.z * W.l + np.z * W.p).normalize();
    },
    /** scalar tone in [0,1]: higher + more outward + lit side = paler; inner / underside = deeper */
    toneT(p, jit = 0) {
      const h = clamp01((p.y - (C.y - Ry * 0.8)) / (Ry * 1.8));
      const o = Math.min(1.25, Math.hypot((p.x - C.x) / Rx, (p.y - C.y) / Ry, (p.z - C.z) / Rz));
      cv.normalAt(p, nc);
      const sun = nc.x * SUN[0] + nc.y * SUN[1] + nc.z * SUN[2];
      return clamp01(0.22 + 0.5 * h + 0.28 * (o - 0.55) + 0.12 * sun + jit + noise(p.x * 0.55, p.y * 0.55, p.z * 0.55) * 0.16);
    },
    tone(p, jit, extra = 0) { return bandColor(pal, cv.toneT(p, jit + extra)); },
  };
  return cv;
}
const _tmpv = new V3();

// ============================================================================ main generator
/**
 * spec: { id, kind:'old'|'medium'|'young'|'weeping', seed, x, z, height, spread, spreadZ?, trunkR, forkH,
 *         lean:[dx,dz], offset:[dx,dz] (canopy centre vs fork), limbs, lod, padR, vr (Ry/Rx), lobes, gaps,
 *         archDirs:[azimuth rad…] (sectors whose limbs arch low), thetaMax (rad), floorAt(x,z), keepOut:[…],
 *         ceilY, bark:'old'|'young', rootReach, cardDensity }
 * env:  { rng, noise, heightAt }
 */
export function makeTree(spec, env) {
  if (spec.kind === 'weeping') return makeWeeping(spec, env);
  const r = env.rng(spec.seed ?? spec.id);
  const noise = env.noise;
  const Q = LODQ[spec.lod ?? 0];
  const bark = new GeoBuilder(), blob = new GeoBuilder(), cards = new GeoBuilder();
  const H = env.heightAt;
  const gy = H(spec.x, spec.z);
  let gMin = gy; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; gMin = Math.min(gMin, H(spec.x + Math.cos(a) * spec.trunkR * 2.4, spec.z + Math.sin(a) * spec.trunkR * 2.4)); }
  const lean = spec.lean || [0, 0], off = spec.offset || [0, 0];
  const Fk = new V3(spec.x + lean[0], gy + spec.forkH, spec.z + lean[1]);
  const Rx = spec.spread, Rz = spec.spreadZ ?? spec.spread, Ry = spec.spread * (spec.vr ?? 0.56);
  const top = gy + spec.height;
  const C = new V3(Fk.x + off[0], top - Ry, Fk.z + off[1]);
  const canopy = makeCanopy(C, Rx, Ry, Rz, PAL.normal, noise, false);
  const padR = (spec.padR ?? 1.25) * Q.padK;

  // ------------------------------------------------ 1. pad targets on a lobed umbrella envelope
  const thetaMax = spec.thetaMax ?? 1.95;
  const arch = spec.archDirs || [];
  const nOuter = Math.round((spec.padCount ?? estimatePads(Rx, Ry, Rz, padR) * (Q.cover ?? 1)));
  const gapDirs = [];
  const nGaps = spec.gaps ?? (spec.lod ? 1 : 3);
  for (let g = 0; g < nGaps; g++) { const th = 0.95 + r() * 0.8, ph = r() * Math.PI * 2; gapDirs.push(new V3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph))); }
  const cand = [];
  const nCand = nOuter * 9;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < nCand; i++) {
    const y = 1 - (i + 0.5) / nCand * 2;
    const th = Math.acos(y), ph = phase + i * ga;
    let tmax = thetaMax;
    for (const a of arch) { const d = Math.abs(Math.atan2(Math.sin(ph - a), Math.cos(ph - a))); tmax = Math.max(tmax, thetaMax + 0.42 * Math.max(0, 1 - d / 0.75)); }
    if (th > tmax) continue;
    const dx = Math.sin(th) * Math.cos(ph), dz = Math.sin(th) * Math.sin(ph), dy = Math.cos(th);
    let inGap = false; for (const gd of gapDirs) if (gd.x * dx + gd.y * dy + gd.z * dz > 0.955) inGap = true;
    if (inGap) continue;
    const lobe = 1 + (spec.lobes ?? 0.18) * noise(dx * 1.3 + 3.3, dy * 1.3, dz * 1.3 - 1.1) + 0.07 * noise(dx * 3.4 + 7, dy * 3.4, dz * 3.4);
    const droop = th > Math.PI / 2 ? 1 + 0.12 * (th - Math.PI / 2) : 1;
    cand.push({ d: new V3(dx, dy, dz), s: lobe * droop, th });
  }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  const pads = [];
  const tryPad = (p, pr, layer) => {
    const pad = { c: p, rx: pr * (0.9 + r() * 0.32), rz: pr * (0.84 + r() * 0.32), ry: pr * (0.44 + r() * 0.12), layer };
    const moved = constrain(pad.c, Math.max(pad.rx, pad.rz) * 0.85, pad.ry, spec);
    if (moved > pr * 1.8) return false;
    for (const o of pads) if (o.c.distanceTo(pad.c) < (pr + (o.rx + o.rz) * 0.5) * (layer ? 0.5 : 0.55)) return false;
    pads.push(pad); return true;
  };
  for (const cd of cand) {
    if (pads.length >= nOuter) break;
    const pr = padR * (0.78 + r() * 0.45) * (cd.th < 0.6 ? 1.1 : 1);
    const k = cd.s;
    const p = new V3(C.x + cd.d.x * Rx * k, C.y + cd.d.y * Ry * k, C.z + cd.d.z * Rz * k);
    p.add(canopy.normalAt(p, new V3()).multiplyScalar(-pr * 0.5));
    tryPad(p, pr, 0);
  }
  const nInner = Math.round(pads.length * (spec.inner ?? 0.2));
  for (let i = 0, tries = 0; i < nInner && tries < nInner * 8; tries++) {
    const cd = cand[Math.floor(r() * cand.length)];
    if (cd.th > 1.5) continue;
    const k = cd.s * (0.62 + r() * 0.16), pr = padR * (0.7 + r() * 0.3);
    const p = new V3(C.x + cd.d.x * Rx * k, C.y + cd.d.y * Ry * k, C.z + cd.d.z * Rz * k);
    if (tryPad(p, pr, 1)) i++;
  }
  for (const pad of pads) {
    pad.seed = r() * 50; pad.jit = (r() - 0.5) * 0.14 - pad.layer * 0.14; pad.peach = r() < 0.14 ? 0.3 + r() * 0.35 : 0;
    r(); r(); // (former sheet scallop params) keeps the random sequence -> skeleton + trunk colliders unchanged
    const n = canopy.normalAt(pad.c, new V3());
    const upv = new V3().copy(UP).lerp(n, 0.18 + r() * 0.16).normalize();
    pad.q = new THREE.Quaternion().setFromUnitVectors(UP, upv).multiply(new THREE.Quaternion().setFromAxisAngle(UP, r() * Math.PI * 2));
  }

  // low clusters of near trees (seen from 1-5 m below): smaller kernels (lacier mass) + denser cards
  if ((spec.lod ?? 0) === 0) for (const pad of pads) {
    const hb = pad.c.y - pad.ry - gy;
    if (hb < 6.0) { const k = clamp01((hb - 2.6) / 3.4); pad.core = 0.72 + 0.28 * k; }
  }

  // ------------------------------------------------ 2. skeleton
  const branches = [];
  const trunkR = spec.trunkR;
  const B0 = new V3(spec.x, gMin - 0.3, spec.z);
  const tc = new V3(spec.x + lean[0] * (spec.leanEarly ?? 0.18), gy + spec.forkH * 0.55, spec.z + lean[1] * (spec.leanEarly ?? 0.18));
  const nTr = Math.max(6, Math.round(spec.forkH / 0.3) + 2);
  const tpts = bezier(B0, tc, Fk, nTr);
  const trad = [];
  const tph = r() * 100;
  for (let i = 0; i < tpts.length; i++) {
    const t = i / (tpts.length - 1);
    const hAbove = tpts[i].y - gy;
    if (i > 0 && i < tpts.length - 1) {
      const w = Math.sin(t * Math.PI) * trunkR * 0.5;
      tpts[i].x += noise(tph + tpts[i].y * 0.55, 1.3, 2.1) * w; tpts[i].z += noise(tph + tpts[i].y * 0.55, 7.7, 4.9) * w;
    }
    const flare = hAbove < 0.9 ? 1 + 0.55 * Math.pow(1 - clamp01(hAbove / 0.9), 2.2) : 1;
    const bulge = 1 + 0.07 * noise(tpts[i].y * 1.6 + tph, 0.3, 0.5) + (t > 0.86 ? 0.1 : 0);
    trad.push(trunkR * flare * bulge * (1 - 0.14 * t));
  }
  branches.push({ pts: tpts, radii: trad, seg: Q.trunkSeg, depth: 0 });
  const trunkTop = tpts[tpts.length - 1];

  const nLimbs = Math.min(spec.limbs ?? 4, pads.length);
  const dirs = pads.map(p => new V3().subVectors(p.c, Fk).setY((p.c.y - Fk.y) * 0.45).normalize());
  const limbGroups = kmeans(dirs, nLimbs, r, 1);
  const totalPads = pads.length;
  const colliders = [];
  // smooth, low-frequency wobble along a bezier (no zig-zag)
  const shaped = (S, E, ctrlUp, gnarl, n, rad, parentDir) => {
    const len = S.distanceTo(E);
    const ctrl = new V3().lerpVectors(S, E, 0.5);
    if (parentDir) ctrl.addScaledVector(parentDir, len * 0.24);
    ctrl.y += len * ctrlUp;
    const pts = bezier(S, ctrl, E, n);
    const ph = r() * 100;
    for (let i = 1; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1), w = Math.sin(t * Math.PI) * len * gnarl, s = ph + t * len * 0.42;
      pts[i].x += noise(s, 0.3, 1.7) * w;
      pts[i].y += noise(s, 5.1, 2.3) * w * 0.5;
      pts[i].z += noise(s, 9.7, 4.1) * w;
      const horiz = Math.hypot(pts[i].x - spec.x, pts[i].z - spec.z);
      constrain(pts[i], rad, rad, spec, horiz < 1.3, -0.6);
    }
    return pts;
  };
  const taper = (n, r0, r1, pw = 0.9) => { const a = []; for (let i = 0; i <= n; i++) a.push(r0 + (r1 - r0) * Math.pow(i / n, pw)); return a; };
  const pointAt = (pts, t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return new V3().lerpVectors(pts[i], pts[i + 1], f - i); };
  const dirAt = (pts, t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return new V3().subVectors(pts[i + 1], pts[i]).normalize(); };
  const closestT = (pts, p, tMin = 0) => { let best = Infinity, bt = 1; for (let i = 0; i < pts.length; i++) { const t = i / (pts.length - 1); if (t < tMin) continue; const d = pts[i].distanceToSquared(p); if (d < best) { best = d; bt = t; } } return bt; };
  const gn = spec.gnarl ?? 0.1;

  // Limbs fork off the upper trunk at staggered heights (low, sideways-reaching groups leave first),
  // split into 1-3 secondary limbs, which carry branches spread along their length (not a broom at
  // the tip), which carry one twig per flower sheet.
  const centroid = (list) => { const c = new V3(); for (const p of list) c.add(p.c); return c.divideScalar(list.length); };
  const limbData = limbGroups.map((grp) => {
    const gp = grp.map(i => pads[i]);
    const cen = centroid(gp);
    const d = new V3().subVectors(cen, Fk);
    return { gp, cen, elev: d.y / (d.length() || 1) };
  }).sort((a, b) => a.elev - b.elev);
  const fLow = spec.forkSpread ?? (spec.forkH > 1.6 ? 0.7 : 0.9);
  limbData.forEach((LD, li) => {
    const { gp, cen } = LD;
    const limbR = trunkR * 0.93 * Math.sqrt(gp.length / totalPads);
    const f = limbData.length > 1 ? fLow + (1 - fLow) * (li / (limbData.length - 1)) : 1;
    const hDir = new V3().subVectors(cen, Fk).setY(0).normalize();
    const S = pointAt(tpts, f).addScaledVector(hDir, trunkR * 0.25); if (f > 0.97) S.y -= trunkR * 0.4;
    const reach = spec.limbReach ?? 0.62;
    const E = new V3().lerpVectors(S, cen, reach + r() * 0.1);
    constrain(E, limbR, limbR, spec, false, -0.6);
    const lenL = S.distanceTo(E);
    const nL = Math.max(5, Math.round(lenL / 0.42));
    const lpts = shaped(S, E, spec.limbArch ?? 0.22, gn, nL, limbR, null);
    branches.push({ pts: lpts, radii: taper(nL, limbR, limbR * 0.5), seg: Q.limbSeg, depth: 1 });

    const nSec = gp.length >= 24 ? 3 : gp.length >= 9 ? 2 : 1;
    const secIdx = nSec > 1 ? kmeans(gp.map(p => p.c), nSec, r, 1.2) : [gp.map((_, i) => i)];
    const secs = secIdx.map(sg => { const sp = sg.map(i => gp[i]); const c = centroid(sp); return { sp, c, t: closestT(lpts, c, 0.25) }; }).sort((a, b) => a.t - b.t);
    secs.forEach((sec, si) => {
      let spts = lpts, sR = limbR * 0.72, sDepth = 1;
      if (secs.length > 1) {
        const tS = Math.min(0.9, Math.max(0.28, 0.5 * (0.28 + 0.55 * (si + 0.5) / secs.length) + 0.5 * sec.t));
        const SA = pointAt(lpts, tS);
        const sRad = Math.max(0.04, limbR * 0.86 * Math.sqrt(sec.sp.length / gp.length));
        const EA = new V3().lerpVectors(SA, sec.c, 0.56 + r() * 0.1);
        constrain(EA, sRad, sRad, spec, false, -0.6);
        const lenS = SA.distanceTo(EA);
        if (lenS > 0.4) {
          const nS = Math.max(4, Math.round(lenS / 0.42));
          spts = shaped(SA, EA, 0.16, gn * 1.05, nS, sRad, dirAt(lpts, tS));
          branches.push({ pts: spts, radii: taper(nS, sRad, sRad * 0.55), seg: Math.max(Q.subSeg, Q.limbSeg - 2), depth: 2 });
          sR = sRad * 0.8; sDepth = 2;
        }
      }
      const nSub = Math.max(1, Math.round(sec.sp.length / (spec.padsPerBranch ?? 3)));
      const subs = kmeans(sec.sp.map(p => p.c), nSub, r, 1.4).map(sg => { const sp = sg.map(i => sec.sp[i]); const sc = centroid(sp); return { sp, sc, t: closestT(spts, sc, 0.3) }; }).sort((a, b) => a.t - b.t);
      subs.forEach((sub, ui) => {
        const { sp, sc } = sub;
        // lobe (clump) volume for normal transfer
        let lrx = 0, lry = 0, lrz = 0;
        for (const p of sp) { lrx = Math.max(lrx, Math.abs(p.c.x - sc.x) + p.rx); lrz = Math.max(lrz, Math.abs(p.c.z - sc.z) + p.rz); lry = Math.max(lry, Math.abs(p.c.y - sc.y) + p.ry); }
        const lobe = { c: sc.clone(), rx: Math.max(lrx, 0.8), rz: Math.max(lrz, 0.8), ry: Math.max(lry, Math.max(lrx, lrz) * 0.55), jit: (r() - 0.5) * 0.18 };
        for (const p of sp) { p.lobe = lobe; p.jit += lobe.jit; }
        const subR = Math.max(0.03, sR * 0.9 * Math.sqrt(sp.length / sec.sp.length));
        const tRank = (sDepth > 1 ? 0.3 : 0.4) + 0.62 * (ui + 0.5) / subs.length;
        const tA = Math.min(0.97, Math.max(0.3, 0.55 * tRank + 0.45 * sub.t + (r() - 0.5) * 0.06));
        const SA = pointAt(spts, tA);
        const EA = new V3().lerpVectors(SA, sc, 0.72 + r() * 0.1); EA.y -= 0.15;
        constrain(EA, subR, subR, spec, false, -0.6);
        const lenS = SA.distanceTo(EA);
        let bpts = null;
        if (lenS > 0.25) {
          const nS = Math.max(3, Math.round(lenS / 0.42));
          bpts = shaped(SA, EA, 0.12, gn * 1.1, nS, subR, dirAt(spts, tA));
          branches.push({ pts: bpts, radii: taper(nS, subR, subR * 0.5), seg: Q.subSeg, depth: 2 });
        }
        const twR = Math.max(0.014, subR * 0.55 / Math.sqrt(sp.length));
        for (const pad of sp) {
          const src = bpts || spts;
          const tt = bpts ? Math.max(0.5, closestT(bpts, pad.c, 0.5)) : Math.max(0.6, closestT(spts, pad.c, 0.6));
          const TS = pointAt(src, tt);
          const TE = new V3().copy(pad.c); TE.y -= pad.ry * 0.3;
          const lenT = TS.distanceTo(TE);
          if (Q.twigs && lenT > 0.2 && r() < (Q.twigP ?? 1)) {
            const nT = Math.max(2, Math.round(lenT / 0.55));
            const tp = shaped(TS, TE, 0.1, 0.1, nT, twR, dirAt(src, tt));
            branches.push({ pts: tp, radii: taper(nT, twR, twR * 0.55), seg: Q.twigSeg, depth: 3 });
          }
          pad.twigDir = new V3().subVectors(TE, TS).normalize();
        }
      });
    });
    for (let s = 0; s < Q.stubs; s++) {
      const t = 0.3 + r() * 0.4;
      const SA = pointAt(lpts, t), d = dirAt(lpts, t);
      const side = randUnit(r).addScaledVector(d, 0.6); side.y = Math.abs(side.y) * 0.8 + 0.2; side.normalize();
      const L = 0.5 + r() * 0.9;
      const EA = SA.clone().addScaledVector(side, L);
      if (constrain(EA, 0.03, 0.03, spec, false, -0.6) > 0.3) continue;
      const rr = Math.max(0.02, limbR * 0.28);
      branches.push({ pts: shaped(SA, EA, 0.08, 0.08, 3, rr, d), radii: taper(3, rr, rr * 0.35), seg: Q.twigSeg, depth: 3, cap: true });
    }
  });

  // roots (buttresses sinking into the ground)
  const reachR = spec.rootReach ?? trunkR * 2.5;
  for (let k = 0; k < Q.roots; k++) {
    const a = (k / Q.roots) * Math.PI * 2 + r() * 0.8;
    const L = reachR * (0.7 + r() * 0.3);
    const S = new V3(spec.x + Math.cos(a) * trunkR * 0.3, gy + trunkR * (0.55 + r() * 0.35), spec.z + Math.sin(a) * trunkR * 0.3);
    const ex = spec.x + Math.cos(a) * L, ez = spec.z + Math.sin(a) * L;
    const E = new V3(ex, H(ex, ez) - 0.12, ez);
    const mx = spec.x + Math.cos(a) * L * 0.45, mz = spec.z + Math.sin(a) * L * 0.45;
    const rp = bezier(S, new V3(mx, H(mx, mz) + trunkR * 0.25, mz), E, 5);
    branches.push({ pts: rp, radii: taper(5, trunkR * 0.46, trunkR * 0.1, 0.7), seg: Math.max(5, Q.limbSeg - 1), depth: 1 });
  }

  // ------------------------------------------------ 3. emit bark
  const vTile = spec.bark === 'young' ? 1.0 : 1.6, uTile = spec.bark === 'young' ? 0.5 : 0.8;
  for (const b of branches) tube(bark, b.pts, b.radii, b.seg, uTile, vTile, { capEnd: b.depth >= 2 || b.cap });

  // ------------------------------------------------ 4. blossom mass surface + cards
  // extra clusters fused under the shell (own rng: the published pads / skeleton stay unchanged) so the
  // underside seen from below bulges into clumps instead of one smooth ceiling (bulges, not hanging
  // balls: deep folds would become outline depth steps)
  const extra = [];
  {
    const r2 = env.rng((spec.seed ?? spec.id) + '-inner');
    const nX = Math.round(pads.length * (Q.innerX ?? 0));
    for (let i = 0, tries = 0; i < nX && tries < nX * 10; tries++) {
      const src = pads[Math.floor(r2() * pads.length)];
      if (src.layer || src.c.y < C.y - Ry * 0.35) continue;
      const pr = padR * (0.6 + r2() * 0.3);
      const d = new V3().subVectors(src.c, C); d.y *= 0.6;
      const p = src.c.clone().addScaledVector(d.normalize(), -pr * (0.55 + r2() * 0.4)); p.y -= pr * (0.15 + r2() * 0.35);
      const e = { c: p, rx: pr * (0.9 + r2() * 0.3), rz: pr * (0.85 + r2() * 0.3), ry: pr * (0.5 + r2() * 0.15), layer: 1, lobe: src.lobe, jit: (src.jit || 0) - 0.08, peach: src.peach, q: src.q };
      if (constrain(e.c, Math.max(e.rx, e.rz) * 0.85, e.ry, spec) > pr) continue;
      extra.push(e); i++;
    }
    // mid / far trees: a core cluster fills the crown (no hidden cavity surface -> the triangles go into a
    // finer, smoother outer mass; seen from below it is a clumpy blossom ceiling)
    if (Q.fill) extra.push({ c: new V3(C.x, C.y - Ry * 0.12, C.z), rx: Rx * 0.66, ry: Ry * 0.5, rz: Rz * 0.66, layer: 1, jit: -0.1, peach: 0, q: new THREE.Quaternion(), weight: 0.9 });
    // plug the upper branch gaps (seen from above they read as craters); side / low gaps stay open
    for (const gd of gapDirs) {
      if (gd.y < Math.cos(1.22)) continue;
      const pr = padR * (1.0 + r2() * 0.2);
      const p = new V3(C.x + gd.x * Rx, C.y + gd.y * Ry, C.z + gd.z * Rz);
      p.add(canopy.normalAt(p, new V3()).multiplyScalar(-pr * 0.5));
      const e = { c: p, rx: pr * 1.1, rz: pr * 1.05, ry: pr * 0.55, layer: 0, jit: 0, peach: 0, q: new THREE.Quaternion().setFromUnitVectors(UP, canopy.normalAt(p, new V3()).lerp(UP, 0.7).normalize()) };
      if (constrain(e.c, pr * 0.9, e.ry, spec) > pr) continue;
      extra.push(e);
    }
  }
  const surf = blossomSurface(pads.concat(extra), { h: spec.meshH ?? Q.h, smooth: Q.smooth, canopy, noise, spec, amp: Q.amp, freq: Q.freq, groundY: gy });
  if (surf) surf.emit(blob);
  const cardBase = Q.cardS * (spec.cardScale ?? 1);
  const density = (spec.cardDensity ?? 1) * Q.cardK;
  const near = (spec.lod ?? 0) === 0;
  if (surf) dressSurface(cards, surf, {
    r, CELL, cardBase, bandColor, pal: PAL.normal, peachCol: PAL.peach, leafCol: PAL.leaf,
    cov: Q.cov * density, covIn: Q.covIn * density, hangP: Q.hang,
    nearBoost: near ? (hb) => 1 + 0.8 * (1 - clamp01((hb - 2.6) / 3.4)) : null,
  });
  // sprigs: thin twigs poking out of pads, carrying a few sprays
  const cc = new V3(), pnv = new V3(), nf = new V3();
  for (const pad of pads) {
    if (r() > Q.sprig) continue;
    const n0 = canopy.normalAt(pad.c, new V3());
    const d = (pad.twigDir || n0).clone().lerp(n0, 0.6).add(randUnit(r, _tmpv).multiplyScalar(0.3)).normalize();
    const L = Math.max(pad.rx, pad.rz) * (0.95 + r() * 0.3);
    const S = pad.c.clone(), E = pad.c.clone().addScaledVector(d, L);
    if (constrain(E, 0.02, 0.02, spec) > 0.2) continue;
    const pts = bezier(S, new V3().lerpVectors(S, E, 0.5).add(new V3(0, L * 0.08, 0)), E, 3);
    tube(bark, pts, taper(3, 0.02, 0.008), 3, uTile, vTile, { capEnd: true });
    const normFn = (p) => canopy.field(p, pad, null, nf);
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const t = 0.5 + (k / n) * 0.5;
      cc.lerpVectors(S, E, t).add(randUnit(r, _tmpv).multiplyScalar(0.07));
      pnv.copy(randUnit(r, _tmpv)).normalize();
      const cj = pad.jit + 0.06 + (r() - 0.5) * 0.2;
      emitCard(cards, cc, pnv, cardBase * (0.7 + r() * 0.3), r() * 6.28, r() < 0.6 ? CELL.spray : CELL.loose, (p) => canopy.tone(p, cj), normFn);
    }
  }

  // ------------------------------------------------ 5. info + colliders
  const info = summarize(pads, gy, spec);
  const p1 = pointAt(tpts, clamp01((gy + 0.6 - B0.y) / Math.max(0.01, Fk.y - B0.y)));
  const p2 = pointAt(tpts, clamp01((gy + 1.7 - B0.y) / Math.max(0.01, Fk.y - B0.y)));
  colliders.push({ x: p1.x, z: p1.z, r: trunkR * 1.05 + 0.04, y0: gy - 1, y1: gy + 1.15 });
  colliders.push({ x: p2.x, z: p2.z, r: trunkR * 0.95 + 0.03, y0: gy + 1.15, y1: gy + Math.min(spec.forkH, 2.6) });
  return { bark, blob, cards, info, colliders, groundY: gy, trunkBase: new V3(spec.x, gy, spec.z) };
}

function estimatePads(Rx, Ry, Rz, pr) {
  const p = 1.6, a = Rx, b = Rz, c = Ry;
  const A = 4 * Math.PI * Math.pow((Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3, 1 / p);
  return (A * 0.7) / (Math.PI * pr * pr) * 1.3;
}

function summarize(pads, gy, spec) {
  let sx = 0, sy = 0, sz = 0, sw = 0, top = -Infinity, bot = Infinity;
  for (const p of pads) { const w = p.rx * p.rz; sx += p.c.x * w; sy += p.c.y * w; sz += p.c.z * w; sw += w; top = Math.max(top, p.c.y + p.ry); bot = Math.min(bot, p.c.y - p.ry); }
  if (!sw) return { x: spec.x, z: spec.z, y: gy + spec.height * 0.6, r: 2, h: spec.height, bottom: gy + 2 };
  const cx = sx / sw, cy = sy / sw, cz = sz / sw;
  let rad = 0; for (const p of pads) rad = Math.max(rad, Math.hypot(p.c.x - cx, p.c.z - cz) + Math.max(p.rx, p.rz) * 0.9);
  return { x: cx, z: cz, y: cy, r: rad, h: top - gy, bottom: bot };
}

// ============================================================================ weeping cherry (枝垂れ桜)
function makeWeeping(spec, env) {
  const r = env.rng(spec.seed ?? spec.id);
  const noise = env.noise;
  const Q = LODQ[spec.lod ?? 0];
  const H = env.heightAt;
  const bark = new GeoBuilder(), blob = new GeoBuilder(), cards = new GeoBuilder();
  const gy = H(spec.x, spec.z);
  let gMin = gy; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; gMin = Math.min(gMin, H(spec.x + Math.cos(a) * spec.trunkR * 2.4, spec.z + Math.sin(a) * spec.trunkR * 2.4)); }
  const trunkR = spec.trunkR, lean = spec.lean || [0, 0];
  const Fk = new V3(spec.x + lean[0], gy + spec.forkH, spec.z + lean[1]);
  const Rx = spec.spread, Ry = spec.height * 0.5;
  const C = new V3(Fk.x, gy + spec.height * 0.55, Fk.z);
  const canopy = makeCanopy(C, Rx, Ry, Rx, PAL.weeping, noise, true);
  const branches = [];
  const taper = (n, r0, r1, pw = 0.9) => { const a = []; for (let i = 0; i <= n; i++) a.push(r0 + (r1 - r0) * Math.pow(i / n, pw)); return a; };
  const B0 = new V3(spec.x, gMin - 0.3, spec.z);
  const tp = bezier(B0, new V3(spec.x + lean[0] * 0.1, gy + spec.forkH * 0.5, spec.z + lean[1] * 0.1), Fk, 8);
  const tph = r() * 100;
  const trad = tp.map((p, i) => { const h = p.y - gy; const t = i / (tp.length - 1); return trunkR * (h < 0.8 ? 1 + 0.5 * Math.pow(1 - clamp01(h / 0.8), 2) : 1) * (1 - 0.15 * t) * (1 + 0.06 * noise(p.y * 1.5 + tph, 1, 0.3)); });
  for (let i = 1; i < tp.length - 1; i++) { const w = Math.sin(i / (tp.length - 1) * Math.PI) * trunkR * 0.45; tp[i].x += noise(tph + tp[i].y * 0.5, 2, 0.4) * w; tp[i].z += noise(tph + tp[i].y * 0.5, 5, 7.1) * w; }
  branches.push({ pts: tp, radii: trad, seg: Q.trunkSeg, depth: 0 });
  for (let k = 0; k < Q.roots; k++) {
    const a = (k / Q.roots) * Math.PI * 2 + r() * 0.8, L = (spec.rootReach ?? trunkR * 2.4) * (0.7 + r() * 0.3);
    const S = new V3(spec.x, gy + trunkR * 0.7, spec.z);
    const ex = spec.x + Math.cos(a) * L, ez = spec.z + Math.sin(a) * L;
    const mx = spec.x + Math.cos(a) * L * 0.45, mz = spec.z + Math.sin(a) * L * 0.45;
    branches.push({ pts: bezier(S, new V3(mx, H(mx, mz) + trunkR * 0.25, mz), new V3(ex, H(ex, ez) - 0.12, ez), 5), radii: taper(5, trunkR * 0.45, trunkR * 0.1, 0.7), seg: 6, depth: 1 });
  }
  const pads = [], strands = [];
  const nLimbs = spec.limbs ?? 5;
  const arcs = [];
  for (let k = 0; k < nLimbs; k++) {
    const a = (k / nLimbs) * Math.PI * 2 + r() * 0.6;
    const out = new V3(Math.cos(a), 0, Math.sin(a));
    const rise = (spec.height - spec.forkH) * (0.62 + r() * 0.28);
    const reach = Rx * (0.38 + r() * 0.2);
    const S = Fk.clone().addScaledVector(out, trunkR * 0.3);
    const E = new V3(Fk.x + out.x * reach, Fk.y + rise * 0.8, Fk.z + out.z * reach);
    constrain(E, 0.4, 0.3, spec, true);
    const Cc = new V3(Fk.x + out.x * reach * 0.2, Fk.y + rise * 1.12, Fk.z + out.z * reach * 0.2);
    const lr = trunkR * 0.72 / Math.sqrt(nLimbs) * 1.3;
    const lp = bezier(S, Cc, E, 8);
    branches.push({ pts: lp, radii: taper(8, lr, lr * 0.55), seg: Q.limbSeg, depth: 1 });
    const nSec = 2 + Math.floor(r() * 2);
    for (let s = 0; s < nSec; s++) {
      const t = 0.45 + r() * 0.55;
      const f = t * (lp.length - 1), i = Math.min(lp.length - 2, Math.floor(f));
      const SA = new V3().lerpVectors(lp[i], lp[i + 1], f - i);
      const aa = a + (r() - 0.5) * 1.3;
      const o2 = new V3(Math.cos(aa), 0, Math.sin(aa));
      const L = Rx * (0.35 + r() * 0.3);
      const EA = SA.clone().addScaledVector(o2, L); EA.y -= L * (0.2 + r() * 0.2);
      constrain(EA, 0.5, 0.3, spec, true);
      const CA = SA.clone().addScaledVector(o2, L * 0.5); CA.y += L * 0.35;
      const sp = bezier(SA, CA, EA, 6);
      const sr = lr * 0.5;
      branches.push({ pts: sp, radii: taper(6, sr, sr * 0.4), seg: Q.subSeg, depth: 2, cap: true });
      arcs.push(sp);
    }
    arcs.push(lp);
    pads.push({ c: E.clone().add(new V3(0, 0.25, 0)), rx: 0.95 + r() * 0.3, rz: 0.9 + r() * 0.3, ry: 0.45 + r() * 0.15, layer: 0 });
  }
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2, d = r() * Rx * 0.25;
    pads.push({ c: new V3(Fk.x + Math.cos(a) * d, gy + spec.height - 0.6 - r() * 0.4, Fk.z + Math.sin(a) * d), rx: 0.95 + r() * 0.3, rz: 0.95, ry: 0.5, layer: 0 });
  }
  const nStrands = Math.round((spec.strands ?? 10) * nLimbs * (spec.lod ? 0.6 : 1));
  for (let s = 0; s < nStrands; s++) {
    const arc = arcs[Math.floor(r() * arcs.length)];
    const t = 0.25 + r() * 0.75;
    const f = t * (arc.length - 1), i = Math.min(arc.length - 2, Math.floor(f));
    const S = new V3().lerpVectors(arc[i], arc[i + 1], f - i);
    const out = new V3(S.x - Fk.x, 0, S.z - Fk.z); const dist = out.length() || 1; out.divideScalar(dist);
    out.x += (r() - 0.5) * 0.5; out.z += (r() - 0.5) * 0.5; out.normalize();
    const floor = spec.floorAt ? spec.floorAt(S.x + out.x * 0.8, S.z + out.z * 0.8) : gy + 1.8;
    const hang = Math.max(0.6, Math.min(S.y - floor, (spec.hang ?? 3.2) * (0.6 + r() * 0.5)));
    const E = S.clone().addScaledVector(out, 0.35 + r() * 0.5); E.y = S.y - hang;
    constrain(E, 0.25, 0.1, spec, true);
    const Cc = S.clone().addScaledVector(out, 0.5 + r() * 0.3); Cc.y += 0.25 + r() * 0.2;
    const pts = bezier(S, Cc, E, 6);
    strands.push(pts);
    branches.push({ pts, radii: taper(6, 0.016, 0.006), seg: 3, depth: 3, cap: true });
  }
  for (const pad of pads) {
    constrain(pad.c, pad.rx, pad.ry, spec);
    pad.seed = r() * 50; pad.jit = (r() - 0.5) * 0.2; pad.peach = 0;
    r(); r(); // (former sheet scallop params) keeps the random sequence
    pad.q = new THREE.Quaternion().setFromAxisAngle(UP, r() * 6.28);
  }
  const strandPads = [];
  for (const st of strands) {
    // a slim core only high on the strand (keeps an outline where it leaves the crown); the curtain
    // itself is made of blossom cards so it reads as hanging sprays, not capsules
    const n = r() < 0.55 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const t = 0.18 + r() * 0.12;
      const f = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f));
      const c = new V3().lerpVectors(st[i], st[i + 1], f - i);
      strandPads.push({ c, rx: 0.1 + r() * 0.03, rz: 0.1 + r() * 0.03, ry: 0.24 + r() * 0.08, seed: r() * 50, jit: (r() - 0.5) * 0.2 - 0.05, peach: 0, q: new THREE.Quaternion().setFromAxisAngle(UP, r() * 6.28), layer: 1 });
    }
  }
  const tile = spec.bark === 'young' ? [0.5, 1.0] : [0.8, 1.6];
  for (const b of branches) tube(bark, b.pts, b.radii, b.seg, tile[0], tile[1], { capEnd: !!b.cap });
  // crown clusters + slim drips where strands leave the crown -> one blossom-mass surface
  for (const p of strandPads) { p.kScale = 1.35; p.yScale = 1.0; }
  const surf = blossomSurface(pads.concat(strandPads), { h: spec.meshH ?? Q.h * 0.75, canopy, noise, spec, amp: Q.amp * 0.8, freq: Q.freq * 1.1, groundY: gy,
    weights: { t: 0.45, l: 0.15, c: 0.4, up: 0.1 } });
  if (surf) surf.emit(blob);
  const cardBase = Q.cardS * 0.85;
  if (surf) dressSurface(cards, surf, { r, CELL, cardBase, bandColor, pal: PAL.weeping, peachCol: PAL.peach, leafCol: PAL.leaf, cov: Q.cov * 1.1, covIn: Q.covIn, hangP: 0.45 });
  const nrm = new V3();
  const normFn = (p) => canopy.normalAt(p, nrm);
  const cc = new V3(), pn = new V3();
  for (const st of strands) {
    let len = 0; for (let i = 1; i < st.length; i++) len += st[i].distanceTo(st[i - 1]);
    const n = Math.max(3, Math.round((len / 0.15) * Q.cardK));
    for (let k = 0; k < n; k++) {
      const t = 0.12 + (k / n) * 0.88;
      const f = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f));
      cc.lerpVectors(st[i], st[i + 1], f - i).add(randUnit(r, _tmpv).multiplyScalar(0.05 + 0.07 * t));
      const a = r() * 6.28; pn.set(Math.cos(a), (r() - 0.5) * 0.5, Math.sin(a)).normalize();
      const cj = 0.02 + (1 - t) * 0.1 + (r() - 0.5) * 0.22;
      const roll = r();
      emitCard(cards, cc, pn, cardBase * (0.75 + r() * 0.45), Math.PI / 2 + (r() - 0.5) * 0.8, roll < 0.5 ? CELL.spray : roll < 0.85 ? CELL.loose : CELL.dense, (p) => canopy.tone(p, cj), normFn, 0.75);
    }
  }
  const all = pads.concat(strandPads);
  const info = summarize(all, gy, spec);
  const colliders = [{ x: spec.x + lean[0] * 0.1, z: spec.z + lean[1] * 0.1, r: trunkR * 1.05 + 0.04, y0: gy - 1, y1: gy + Math.min(2.4, spec.forkH) }];
  return { bark, blob, cards, info, colliders, groundY: gy, trunkBase: new V3(spec.x, gy, spec.z) };
}
