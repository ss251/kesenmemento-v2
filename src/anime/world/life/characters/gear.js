// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/gear.js.
// Accessories and hand-held props, merged into each character's skinned mesh (bone-local geometry).
import * as THREE from 'three';
import { rings, limb, sweep, curve, ellipsoid, rbox, surface, TAU, DEG, clamp, lerp } from './skin.js';
import { cellUV } from './atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = () => new THREE.Matrix4();
const TR = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const ROT = (x, y, z, order = 'XYZ') => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, order));
const at = (m, x, y, z) => m.setPosition(x, y, z);

/** Japanese railway staff cap (制帽): flat flared crown, dark band, glossy visor, gold badge + cord. */
export function staffCap(h, o = {}) {
  const hd = h.P.head, k = h.P.k * h.P.hk, bone = h.b.head;
  const y0 = hd.cy + hd.ry * 0.3, z0 = hd.cz - 0.006 * k;
  const a = hd.rx * 1.1, b = hd.rz * 1.13;
  const m = ROT(-0.12, 0, 0); m.setPosition(0, y0, z0);
  const cap = rings([{ y: -0.004, a: a * 0.97, b: b * 0.97 }, { y: 0, a, b }, { y: 0.034 * k, a: a * 1.01, b: b * 1.01 }, { y: 0.062 * k, a: a * 1.16, b: b * 1.14, z: 0.006 * k },
    { y: 0.078 * k, a: a * 1.17, b: b * 1.15, z: 0.008 * k }, { y: 0.084 * k, a: a * 1.08, b: b * 1.06, z: 0.008 * k }, { y: 0.086 * k, a: 0, b: 0, z: 0.008 * k }], 22);
  h.add(cap, { bone, color: o.color || '#3d4866', matrix: m });
  const band = rings([{ y: 0.001, a: a * 1.006, b: b * 1.006 }, { y: 0.03 * k, a: a * 1.016, b: b * 1.016 }], 22);
  h.add(band, { bone, color: o.band || '#343c56', matrix: m.clone() });
  // visor: half disc tilted down
  const vis = surface(12, 3, (u, v) => {
    const ph = lerp(-80, 80, u) * DEG; const r = lerp(0.0, 1, v);
    const x = Math.sin(ph) * a * 1.02, z = Math.cos(ph) * b * 1.02;
    const x2 = Math.sin(ph) * a * 1.05, z2 = Math.cos(ph) * (b + 0.055 * k);
    return [lerp(x, x2, r), -0.004 * k - r * r * 0.018 * k, lerp(z, z2, r)];
  });
  h.add(vis, { bone, color: o.visor || '#2f3446', matrix: m.clone() });
  // badge + cord
  const mb = m.clone().multiply(TR(0, 0.045 * k, b * 1.14));
  h.add(ellipsoid(0.013 * k, 0.012 * k, 0.004 * k, [0, 0, 0], 8, 6), { bone, color: o.badge || '#d9b45a', matrix: mb });
  h.add(ellipsoid(0.018 * k, 0.005 * k, 0.003 * k, [0, 0, 0], 8, 4), { bone, color: o.badge || '#d9b45a', matrix: mb.clone().multiply(TR(0, -0.012 * k, 0.001)) });
  const cord = [];
  for (let i = 0; i <= 8; i++) { const ph = lerp(-62, 62, i / 8) * DEG; cord.push(V(Math.sin(ph) * a * 1.03, 0.012 * k, Math.cos(ph) * b * 1.03)); }
  h.add(sweep(cord, () => 0.004 * k, () => 0.004 * k, (p) => V(p.x, 0, p.z).normalize(), 4), { bone, color: o.badge || '#d9b45a', matrix: m.clone() });
}

/** Round thin glasses. */
export function glasses(h, o = {}) {
  const hd = h.P.head, k = h.P.k * h.P.hk, bone = h.b.head;
  const f = h.spec.face;
  for (const s of [1, -1]) {
    const p = h.headPt(s * (f.eyeP) * DEG, (f.eyeT + 1) * DEG, 1.07);
    const ring = [];
    for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU; ring.push(V(p[0] + Math.cos(a) * 0.019 * k, p[1] + Math.sin(a) * 0.016 * k, p[2] + 0.004 * k - Math.abs(Math.cos(a)) * 0.004 * k * s * 0)); }
    h.add(sweep(ring, () => 0.0028 * k, () => 0.0028 * k, () => V(0, 0, 1), 4), { bone, color: o.color || '#6b5a57' });
    // temple arm to the ear
    const e = h.headPt(s * 92 * DEG, (f.eyeT + 4) * DEG, 1.03);
    h.add(sweep([V(p[0] + s * 0.019 * k, p[1] + 0.004 * k, p[2]), V(e[0], e[1], e[2])], () => 0.0025 * k, () => 0.0025 * k, () => V(0, 1, 0), 4), { bone, color: o.color || '#6b5a57' });
  }
  const pl = h.headPt(-(f.eyeP - 11) * DEG, (f.eyeT + 3) * DEG, 1.08), pr = h.headPt((f.eyeP - 11) * DEG, (f.eyeT + 3) * DEG, 1.08);
  h.add(sweep(curve([pl, [0, (pl[1] + pr[1]) / 2 + 0.004 * k, pl[2] + 0.004 * k], pr], 5), () => 0.0025 * k, () => 0.0025 * k, () => V(0, 1, 0), 4), { bone, color: o.color || '#6b5a57' });
}

/** Hair clip / ribbon accessory at head angles. */
export function hairClip(h, phDeg, thDeg, color) {
  const k = h.P.k * h.P.hk;
  const p = h.headPt(phDeg * DEG, thDeg * DEG, 1.1);
  h.add(rbox(0.012 * k, 0.03 * k, 0.008 * k, 0, [0, 0, 0]), { bone: h.b.head, color, matrix: ROT(0, phDeg * DEG, 0.6).setPosition(p[0], p[1], p[2]) });
}

/** School shoulder bag: strap from the right shoulder across the chest, bag at the left hip. */
export function shoulderBag(h, o = {}) {
  const P = h.P, k = P.k, b = h.b;
  const spY = h.bindPos(b.spine)[1];
  const tp = (ph, y, off) => { const p = h.torsoPt(P.outer, ph * DEG, y, off); return V(p[0], p[1] - spY, p[2]); };
  const col = o.color || '#434b66';
  const pts = [tp(-50, P.shY + 0.02 * k, 0.02 * k), tp(-28, P.chest + 0.06 * k, 0.024 * k), tp(0, P.chest - 0.03 * k, 0.026 * k), tp(40, P.waist, 0.026 * k), tp(80, P.waist - 0.08 * k, 0.03 * k)];
  const back = [tp(-50, P.shY + 0.02 * k, 0.02 * k), tp(-130, P.chest + 0.04 * k, 0.022 * k), tp(-180, P.chest - 0.05 * k, 0.024 * k), tp(-230, P.waist, 0.026 * k), tp(-280, P.waist - 0.08 * k, 0.03 * k)];
  for (const line of [pts, back]) h.add(sweep(curve(line.map(p => [p.x, p.y, p.z]), 12), () => 0.03 * k, () => 0.004 * k, (p) => V(p.x, 0, p.z).normalize(), 4), { bone: b.spine, color: o.strap || col, weights: h.torsoWeights() });
  // bag at the left hip (hips bone)
  const hy = P.waist - 0.13 * k - P.hip;
  const x = (P.pelvis[1][1] + 0.05) * 1.05;
  const m = ROT(0.04, 1.35, 0.06).setPosition(x, hy, -0.01 * k);
  h.add(rbox(0.32 * k, 0.24 * k, 0.085 * k, 0, [0, 0, 0]), { bone: b.hips, color: col, matrix: m });
  h.add(rbox(0.3 * k, 0.1 * k, 0.09 * k, 0, [0, 0.075 * k, 0.004 * k]), { bone: b.hips, color: o.flap || '#3c4460', matrix: m.clone() });
  if (o.charm) h.add(ellipsoid(0.016 * k, 0.018 * k, 0.012 * k, [0.1 * k, -0.02 * k, 0.05 * k], 8, 6), { bone: b.hips, color: o.charm, matrix: m.clone() });
}

/** Bag hanging from a hand (tote, eco bag, paper bag, briefcase). */
export function handBag(h, side, o) {
  const k = h.P.k, bone = h.b['hand' + side];
  const w = o.w * k, hh = o.h * k, d = o.d * k, drop = (o.drop ?? 0.08) * k;
  const c = [0, -0.05 * k - drop - hh / 2, 0.01 * k];
  const m = ROT(0, o.yaw ?? Math.PI / 2, 0).setPosition(c[0], c[1], c[2]);
  h.add(rbox(w, hh, d, 0, [0, 0, 0]), { bone, color: o.color, matrix: m });
  if (o.band) h.add(rbox(w * 1.01, hh * 0.18, d * 1.02, 0, [0, hh * 0.28, 0]), { bone, color: o.band, matrix: m.clone() });
  // handles: two arcs up to the hand
  if (o.handles !== false) for (const s of [1, -1]) {
    const pts = curve([[s * w * 0.22, hh / 2 - 0.004, 0], [s * w * 0.12, hh / 2 + drop * 0.7, 0], [0, hh / 2 + drop + 0.035 * k, 0]], 6);
    h.add(sweep(pts, () => (o.handleW ?? 0.012) * k, () => 0.005 * k, () => V(0, 0, 1), 4), { bone, color: o.handle || o.color, matrix: m.clone() });
  }
  if (o.leek) {
    const lm = m.clone().multiply(ROT(0, 0, -0.32).setPosition(w * 0.18, hh * 0.3, 0));
    h.add(limb(0.28 * k, 0.014 * k, 0.013 * k, { cols: 8, capTop: 0.4, capBottom: 0.6 }), { bone, color: '#eeeadb', matrix: lm.clone().multiply(TR(0, 0.1 * k, 0)) });
    for (let i = 0; i < 3; i++) h.add(limb(0.22 * k, 0.012 * k, 0.004 * k, { cols: 6, capTop: 0.3 }), { bone, color: i ? '#7fa55a' : '#8fb867', matrix: lm.clone().multiply(ROT(Math.PI + (i - 1) * 0.16, 0, (i - 1) * 0.12).setPosition(0, 0.1 * k, 0)) });
  }
  if (o.greens) h.add(ellipsoid(w * 0.35, 0.05 * k, d * 0.35, [-w * 0.15, hh / 2 + 0.02 * k, 0], 8, 6), { bone, color: o.greens, matrix: m.clone() });
  if (o.logo) h.add(rbox(w * 0.4, hh * 0.3, d * 1.04, 0, [0, -hh * 0.05, 0]), { bone, color: o.logo, matrix: m.clone() });
}

/** Smartphone in the hand. */
export function phone(h, side, color = '#5c6a86') {
  const k = h.P.k, bone = h.b['hand' + side];
  const m = ROT(0.2, 0, 0).setPosition(0, -0.06 * k, 0.03 * k);
  h.add(rbox(0.012 * k, 0.13 * k, 0.065 * k, 0, [0, 0, 0]), { bone, color, matrix: m });
  const s = side === 'L' ? -1 : 1;
  h.add(rbox(0.002 * k, 0.11 * k, 0.055 * k, 0, [s * 0.007 * k, 0, 0]), { bone, color: '#9fc0de', matrix: m.clone() });
}

/** Backpack on the chest bone. */
export function backpack(h, o = {}) {
  const P = h.P, k = P.k, b = h.b;
  const spY = h.bindPos(b.spine)[1];
  const [a, bb] = [P.torso[6][1], P.torso[6][2]];
  const cy = P.chest + 0.02 * k - spY;
  h.add(rbox(0.27 * k, 0.34 * k, 0.13 * k, 0, [0, cy, -bb - 0.075 * k]), { bone: b.spine, color: o.color || '#5f6f8c', weights: h.torsoWeights() });
  h.add(rbox(0.23 * k, 0.12 * k, 0.05 * k, 0, [0, cy - 0.08 * k, -bb - 0.15 * k]), { bone: b.spine, color: o.pocket || '#53617c', weights: h.torsoWeights() });
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; const ph = (s * lerp(160, 25, t)) * DEG; const y = lerp(P.shY + 0.03 * k, P.chest - 0.1 * k, Math.sin(t * Math.PI / 2) * 0.6 + t * 0.4); const p = h.torsoPt(P.outer, ph, y, 0.022 * k); pts.push(V(p[0] * (t < 0.3 ? 1 : 1), p[1] - spY, p[2])); }
    h.add(sweep(pts, () => 0.035 * k, () => 0.006 * k, (p) => V(p.x, 0.4, p.z).normalize(), 4), { bone: b.spine, color: o.strap || '#48546c', weights: h.torsoWeights() });
  }
}

/** Open paperback with one turning page. Returns { book, page } bones. */
export function book(h, o = {}) {
  const k = h.P.k;
  const bk = h.propBone('book', h.b.hips, 0, 0.2, 0.3);
  const pg = h.propBone('page', bk, 0, 0, 0.004 * k);
  const W = 0.105 * k, H = 0.16 * k;
  for (const s of [1, -1]) {
    // cover half (slightly tilted up from the spine => shallow V)
    const m = ROT(0, -s * 0.16, 0).setPosition(0, 0, 0);
    h.add(rbox(W, H, 0.004 * k, 0, [s * W / 2, 0, -0.004 * k]), { bone: bk, color: o.cover || '#c7836a', matrix: m });
    h.add(rbox(W * 0.95, H * 0.95, 0.012 * k, 0, [s * W * 0.49, 0, 0.003 * k]), { bone: bk, color: '#f1ece2', matrix: m.clone() });
  }
  // turning page: lies on the right half at rest (rotates about the local Y axis)
  h.add(rbox(W * 0.93, H * 0.93, 0.0015 * k, 0, [W * 0.47, 0, 0.004 * k]), { bone: pg, color: '#f4efe6', matrix: ROT(0, -0.16, 0) });
  return { book: bk, page: pg, W, H };
}

/** Chalk stick / small cloth in the hand. */
export function chalk(h, side) {
  const k = h.P.k;
  h.add(limb(0.05 * k, 0.005 * k, 0.005 * k, { cols: 6 }), { bone: h.b['hand' + side], color: '#f0ede6', matrix: ROT(1.2, 0, 0).setPosition(0, -0.06 * k, 0.03 * k) });
}

/** Wristwatch band. */
export function watch(h, side, color = '#6b5a57') {
  const k = h.P.k; const fa = h.P.farmR[1];
  h.add(rings([{ y: -h.P.farm + 0.03 * k, a: fa * 1.12, b: fa * 1.12 }, { y: -h.P.farm + 0.012 * k, a: fa * 1.12, b: fa * 1.12 }], 10), { bone: h.b['farm' + side], color });
}

// [v3:life] Harbour-town headwear.
/** 鉢巻き / 手ぬぐい headband tied round the forehead (fishermen, market workers). */
export function headband(h, o = {}) {
  const hd = h.P.head, k = h.P.k * h.P.hk, bone = h.b.head;
  const y0 = hd.cy + hd.ry * 0.28, a = hd.rx * 1.06, b = hd.rz * 1.07;
  const m = ROT(-0.18, 0, 0); m.setPosition(0, y0, hd.cz - 0.004 * k);
  h.add(rings([{ y: -0.016 * k, a: a * 0.995, b: b * 0.995 }, { y: 0.0, a: a * 1.02, b: b * 1.02 }, { y: 0.016 * k, a: a * 0.99, b: b * 0.99 }], 22), { bone, color: o.color || '#eef0f2', matrix: m });
  // knot at the back + two short tails
  const mk = m.clone().multiply(TR(0, 0, -b * 1.02));
  h.add(ellipsoid(0.02 * k, 0.016 * k, 0.012 * k, [0, 0, 0], 8, 5), { bone, color: o.color || '#eef0f2', matrix: mk });
  for (const s of [1, -1]) h.add(rbox(0.018 * k, 0.05 * k, 0.005 * k, 0.003, [s * 0.012 * k, -0.03 * k, -0.004 * k]), { bone, color: o.color || '#eef0f2', matrix: mk.clone().multiply(ROT(0.2, 0, s * 0.35)) });
}
/** Soft work cap (作業帽) with a short visor. */
export function workCap(h, o = {}) {
  const hd = h.P.head, k = h.P.k * h.P.hk, bone = h.b.head;
  const y0 = hd.cy + hd.ry * 0.22, a = hd.rx * 1.07, b = hd.rz * 1.09;
  const m = ROT(-0.1, 0, 0); m.setPosition(0, y0, hd.cz - 0.004 * k);
  h.add(rings([{ y: -0.004, a: a * 0.98, b: b * 0.98 }, { y: 0.0, a, b }, { y: 0.045 * k, a: a * 0.98, b: b * 0.97 }, { y: 0.08 * k, a: a * 0.8, b: b * 0.8 }, { y: 0.1 * k, a: a * 0.45, b: b * 0.45 }, { y: 0.106 * k, a: 0, b: 0 }], 20), { bone, color: o.color || '#4a5a7a', matrix: m });
  const vis = surface(10, 3, (u, v) => {
    const ph = lerp(-70, 70, u) * DEG;
    return [Math.sin(ph) * a * lerp(1.0, 1.02, v), -0.002 * k - v * v * 0.01 * k, Math.cos(ph) * lerp(b, b + 0.06 * k, v)];
  });
  h.add(vis, { bone, color: o.visor || o.color || '#4a5a7a', matrix: m.clone() });
}
