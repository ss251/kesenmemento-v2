// [v4:polish1] 気仙沼プラザホテル (柏崎 1-1, 65 rooms) on the 柏崎 bluff over 港町, facing the inner bay, from the
// reference photo (Wikimedia Commons "Kesennnuma plaza hotel 20130601.JPG", Opqr, 2013; reference only), the GSI z18
// photo and footprints, the DEM and the hotel's facility page (pkanyo.jp: the lift that links the hotel to the お魚いちば
// below). docs/anime/landmarks/plaza-hotel.md.
//
//   the tower: a cross-shaped block of 7 storeys on the bluff top (T.P. 25.2; GSI traces its roof as a cross), stepped
//     back at the top two floors, and the crown with the hotel's roundel;
//   the podium round it (lobby, restaurants, the baths) at 1½ storeys, on the footprint the GSI tile edge splits in two,
//     and the south wing of 5 storeys with the 「港ふれあい 気仙沼プラザホテル」 sign box on its roof;
//   [v6:c7] 2026 cladding and crown from the author's photo IMG_0896 (2026-10-02) and Commons "Cityscape of Kessennuma
//     City, 2026" (2026-03-29), both superseding the 2013 photo: the tower is dusty salmon-pink tile with a continuous
//     projecting balcony slab at every floor (rounded ends) over recessed window bands; the crown is a pink-beige slab
//     about 10.5 m tall with cream tapered panels and the roundel; the wing is greige with pink-mauve slab bands; the
//     roof decks are pale green (Google Earth 2026-03-11: #a5ada2..#afb9ae, GSI #bed5cb); and the お魚いちば signs
//     and the 気仙沼温泉 pylon at the lift's foot (IMG_0895);
//   the glass lift tower at the cliff foot on 港町 (GSI footprint 6 × 7 m, T.P. 2.3) with the roundel on its white
//     head, a lattice spire, and the enclosed bridge. The GSI footprint (25 × 3.7 m) stops short of both the lift
//     shaft and the podium; the mesh runs from the shaft (embedded in the head) to the first hotel wall at deck
//     height (IMG_0896: it enters the low building under the tower, with no gap and no mid-span pier).
import * as THREE from 'three';
import { nightMat } from './lights.js';
import { wallGeo, flatRoof, colliders, textTex, FONT, mapMat, facadeMat, paintWindow, obbOf, obbPt, capGeo, openRing } from '../landmarks/kit.js';

export const PLAZA = {
  main: '16/58541/25068/142', wing: '16/58541/25069/27', annex: '16/58541/25068/141', bridge: '16/58541/25068/137', lift: '16/58541/25068/136', liftHall: '16/58541/25068/135',
  towerC: [306, 212], towerY: 25.2, floors: 7, fh: 3.1, rot: -0.12,
  arms: [[30, 12], [12, 28]],   // the cross: an east-west arm and a north-south arm (m), from the z18 roof
};
/** The lots the hotel replaces (town, the mid builder and explore leave them: world/lotfix.js tags them). */
export const PLAZA_LOTS = [PLAZA.main, PLAZA.wing, PLAZA.annex, PLAZA.bridge, PLAZA.lift, PLAZA.liftHall];

/** [plaza-bridge] The hotel mark on the lift head and the crown (IMG_0896, both roundels): a 巴 of two commas,
 *  red in the upper right and navy in the lower left, a white ring, and a thin white S on the join. The old
 *  straight diagonal (red upper left, blue lower right) read as a soft-drink logo. */
function roundelTex(ctx) {
  return ctx.tex.draw(256, 256, (g, W, H) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = W * 0.42, r = R - W * 0.048;
    g.fillStyle = '#f7f6f2'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a2f5e'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();   // 紺, the lower-left comma
    g.fillStyle = '#c4383a'; g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);                                     // the right half, head up
    g.arc(cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);                           // tail back through the centre
    g.arc(cx, cy - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false);                          // the upper bowl, head to the right
    g.fill();
    g.strokeStyle = '#f7f6f2'; g.lineWidth = W * 0.022; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.arc(cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
    g.arc(cx, cy - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false);
    g.stroke();
  }, { key: 'plaza-roundel', anisotropy: 8 });
}

/** [v6:c7] 「気仙沼プラザホテル」 with プラザ in pink (IMG_0896), on the sign box's greige */
function plazaSignTex(ctx, bg) {
  const parts = [['気仙沼', '#2d4a7a'], ['プラザ', '#c46a7a'], ['ホテル', '#2d4a7a']];
  return ctx.tex.draw(1024, 192, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    let s = H * 0.62; g.font = `800 ${s}px ${FONT.sans}`;
    const tw = () => parts.reduce((a, [t]) => a + g.measureText(t).width, 0);
    const m = tw(); if (m > W * 0.94) { s = Math.max(8, Math.floor(s * (W * 0.94) / m)); g.font = `800 ${s}px ${FONT.sans}`; }
    g.textAlign = 'left'; g.textBaseline = 'middle';
    let x = (W - tw()) / 2;
    for (const [t, c] of parts) { g.fillStyle = c; g.fillText(t, x, H * 0.54); x += g.measureText(t).width; }
  }, { key: 'plaza-sign-v6', anisotropy: 8 });
}

/** [v6:c7] A slab of w × d (m) with rounded corners of radius r, h thick, its bottom at y = 0 (the balcony slabs). */
const SLAB_GEO = new Map();
function roundSlab(w, d, h, r) {
  const key = `${w}|${d}|${h}|${r}`; if (SLAB_GEO.has(key)) return SLAB_GEO.get(key);
  const x = w / 2, z = d / 2, sh = new THREE.Shape();
  sh.moveTo(-x + r, -z); sh.lineTo(x - r, -z); sh.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false);
  sh.lineTo(x, z - r); sh.absarc(x - r, z - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-x + r, z); sh.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-x, -z + r); sh.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, h, 0);   // shape (x, y) -> (x, z); the extrusion -> y in [0, h]
  SLAB_GEO.set(key, g);
  return g;
}

/** [v6:c7] A panel w wide at the top and wb at the bottom, h tall, t thick, its bottom centre at the origin. */
function taperGeo(w, wb, h, t) {
  const sh = new THREE.Shape([new THREE.Vector2(-wb / 2, 0), new THREE.Vector2(wb / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

// [v6:c7] 気仙沼お魚いちば at the lift's foot and the 気仙沼温泉 pylon by the lift tower, from the author's photo IMG_0895
// (2026-10-02, taken from (133, 69) looking 111°; also IMG_0896). The photo sees the market's long WEST front (the strip
// lot `front`; the Earth 2026-03-11 top view puts the hall's N-S gable ridge behind it): sage-green siding (the lots'
// wall, data/anime/overrides/c7.json), giant white 「お魚いちば」 (魚 orange) across the 2F over a full-width balcony
// with a white rail and a row of AC units, and a white 「いらっしゃいませ」 fascia over the 1F. Positions along the front
// are read off the photo as fractions of the front from its north end; heights are kept under the lot's 6.1 m roof.
export const UOICHI = { front: '16/58541/25068/139', hall: '16/58541/25068/138', pylon: [282, 160] };

function buildUoichiSigns(ctx, root) {
  const L = ctx.L, lot = L.lotById(UOICHI.front); if (!lot) return null;
  const t = (c, o = {}) => ctx.mat.toon(c, { paint: 0.03, ...o });
  const white = t('#f3f2ee', { paint: 0.02 }), slabM = t('#dcdcd6'), acM = t('#e9e9e4', { paint: 0.02 }), teal = t('#2f9a8f');
  // the front: the strip's long side away from the hall
  const o = obbOf(lot.poly), hall = L.lotById(UOICHI.hall);
  const sx = [o.uz, -o.ux], hc = hall ? [hall.obb.cx, hall.obb.cz] : [o.cx + 10, o.cz];
  const sgn = sx[0] * (o.cx - hc[0]) + sx[1] * (o.cz - hc[1]) >= 0 ? 1 : -1, n = [sx[0] * sgn, sx[1] * sgn];
  const G = new THREE.Group(); G.position.set(o.cx + n[0] * (o.w / 2 + 0.03), lot.groundY, o.cz + n[1] * (o.w / 2 + 0.03)); G.rotation.y = Math.atan2(n[0], n[1]); root.add(G);
  const k = ctx.kit(G), len = o.d;
  // local +X runs along the front from its north end (left in the photo) to its south end
  const sgnX = -Math.sin(G.rotation.y) >= 0 ? 1 : -1;   // local +X is (cos, -sin) in (x, z): +1 when it points south
  const X = (f) => sgnX * (-len / 2 + f * len);
  const span = (f0, f1) => [(X(f0) + X(f1)) / 2, Math.abs(X(f1) - X(f0))];
  // the 2F balcony: a 1.2 m slab with a white rail (photo 0.30..0.98 of the front), AC units behind the rail
  const [bx, bl] = span(0.30, 0.98), slabY = 3.0, railY = slabY + 0.2;
  k.boxB(bl, 0.2, 1.2, slabM, [bx, slabY, 0.6]);
  k.box(bl, 0.07, 0.07, white, [bx, railY + 1.0, 1.15]); k.box(bl, 0.06, 0.06, white, [bx, railY + 0.12, 1.15]);
  for (let x = bx - bl / 2 + 0.05; x <= bx + bl / 2; x += 1.0) k.boxB(0.05, 1.0, 0.05, white, [x, railY, 1.15]);
  for (let f = 0.42; f <= 0.96; f += 0.065) k.boxB(0.8, 0.6, 0.3, acM, [X(f), railY, 0.3]);
  // the giant letters on the 2F siding (photo お at 0.44 .. ば at 0.84), on a band of the siding's sage
  const [lx, ll] = span(0.39, 0.89);
  const letters = ctx.tex.draw(2048, 192, (g, W, H) => {
    g.fillStyle = '#cfd8c8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c3cdbb'; for (let y = 6; y < H; y += 14) g.fillRect(0, y, W, 2);   // the horizontal siding
    g.font = `900 ${Math.round(H * 0.86)}px ${FONT.round}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = H * 0.05; g.strokeStyle = '#9aa596'; g.lineJoin = 'round';
    [...'お魚いちば'].forEach((c, i) => { const x = W * (i + 0.5) / 5; g.strokeText(c, x, H * 0.54); g.fillStyle = c === '魚' ? '#e8742c' : '#ffffff'; g.fillText(c, x, H * 0.54); });
  }, { key: 'uoichi-letters', anisotropy: 8 });
  k.mesh(new THREE.PlaneGeometry(ll, 1.35), mapMat(ctx, 'toon', '#ffffff', letters, { paint: 0 }), [lx, 5.0, 0.02]);
  // the 1F fascia banner (photo 0.46 .. 0.85)
  const [fx, fl] = span(0.46, 0.85);
  k.boxB(fl, 0.9, 0.08, white, [fx, 2.0, 0.08]);
  const ft = textTex(ctx, 'いらっしゃいませ', { w: 1024, h: 96, color: '#4a5560', bg: '#f6f5f1', font: FONT.round, weight: 700, size: 0.62, key: 'uoichi-fascia' });
  k.mesh(new THREE.PlaneGeometry(fl - 0.3, 0.7), mapMat(ctx, 'toon', '#ffffff', ft, { paint: 0 }), [fx, 2.45, 0.13]);

  // ---- the 気仙沼温泉 pylon: a white column with teal edges, the diamond board on top (white, teal border, orange
  // lettering) and the IN arrow panel, its faces turned to the 港町 road (IMG_0895 / 0896 see it face-on from (133, 69))
  const [px, pz] = UOICHI.pylon, py = L.heightAt(px, pz), face = Math.atan2(133 - px, 69 - pz);
  const P = new THREE.Group(); P.position.set(px, py, pz); P.rotation.y = face; root.add(P);
  const kp = ctx.kit(P), colH = 7.0, a = 2.5, dy = colH + a * Math.SQRT1_2;
  kp.boxB(1.0, colH, 0.5, white, [0, -0.3, 0]);
  for (const s of [-1, 1]) kp.boxB(0.1, colH, 0.52, teal, [s * 0.5, -0.3, 0]);
  kp.box(a + 0.3, a + 0.3, 0.3, teal, [0, dy, 0], [0, 0, Math.PI / 4]);
  kp.box(a - 0.2, a - 0.2, 0.36, white, [0, dy, 0], [0, 0, Math.PI / 4]);
  const onsen = ctx.tex.draw(512, 512, (g, W, H) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e0602a';
    g.font = `700 ${Math.round(H * 0.2)}px ${FONT.sans}`; g.fillText('♨', W / 2, H * 0.3);
    let s = H * 0.17; g.font = `900 ${s}px ${FONT.round}`; const m = g.measureText('気仙沼温泉').width;
    if (m > W * 0.86) { s = Math.floor(s * W * 0.86 / m); g.font = `900 ${s}px ${FONT.round}`; }
    g.fillText('気仙沼温泉', W / 2, H * 0.53);
  }, { key: 'uoichi-onsen', anisotropy: 8 });
  const om = mapMat(ctx, 'decal', '#ffffff', onsen, { transparent: true, alphaTest: 0.3 });
  const inT = ctx.tex.draw(256, 160, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = '#d23a3a'; g.fillRect(0, 0, W, H * 0.14); g.fillRect(0, H * 0.86, W, H * 0.14);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(H * 0.55)}px ${FONT.sans}`; g.fillText('IN', W / 2, H * 0.52);
  }, { key: 'uoichi-in' });
  const im = mapMat(ctx, 'toon', '#ffffff', inT, { paint: 0 });
  for (const s of [-1, 1]) {
    kp.mesh(new THREE.PlaneGeometry(a * 1.25, a * 1.25), om, [0, dy, s * 0.19], [0, s < 0 ? Math.PI : 0, 0]);
    kp.mesh(new THREE.PlaneGeometry(1.3, 0.8), im, [0, 5.2, s * 0.27], [0, s < 0 ? Math.PI : 0, 0]);
  }
  if (ctx.physics?.addBox) ctx.physics.addBox(px, pz, 1.1, 0.6, face, py - 1, py + colH);
  return { front: { x: G.position.x, z: G.position.z, len: Math.round(len * 10) / 10, rotY: G.rotation.y }, pylon: { x: px, z: pz, y: py, top: py + dy + a * Math.SQRT1_2 + 0.2 } };
}

// [plaza-bridge] The enclosed bridge. The GSI footprint is the axis and the width, not the length: it ends on the
// lift hall, short of the glass shaft, and again in the air before the bluff. The near end is the shaft face (kept
// at the lift head, 0.3 m inside it). The far end is the first hotel wall the cross-section meets at deck height
// (annex, lift hall or podium — the hall is too low to count), embedded 0.3 m, or the bluff crest if no wall does.
const BRIDGE_EMBED = 0.3;
const BRIDGE_HALF = 1.75;   // the pale-green roof, the widest part of the tube

function inRing(x, z, P) {
  let c = false;
  for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
    const xi = P[i][0], zi = P[i][1], xk = P[k][0], zk = P[k][1];
    if ((zi > z) !== (zk > z) && x < ((xk - xi) * (z - zi)) / ((zk - zi) || 1e-12) + xi) c = !c;
  }
  return c;
}
/** First time the ray origin + t·dir (t > tMin) enters the ring. */
function rayEntry(origin, dir, P, tMin) {
  let best = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const sx = b[0] - a[0], sz = b[1] - a[1], den = dir[0] * sz - dir[1] * sx;
    if (Math.abs(den) < 1e-8) continue;
    const qx = a[0] - origin[0], qz = a[1] - origin[1];
    const t = (qx * sz - qz * sx) / den, u = (qx * dir[1] - qz * dir[0]) / den;
    if (u < -1e-4 || u > 1 + 1e-4 || !(t > tMin)) continue;
    if (!inRing(origin[0] + dir[0] * (t + 0.02), origin[1] + dir[1] * (t + 0.02), P)) continue;
    if (!best || t < best.t) best = { t, i, a, b, x: origin[0] + dir[0] * t, z: origin[1] + dir[1] * t };
  }
  return best;
}
function distToRing(x, z, P) {
  let d = 1e9;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], sx = b[0] - a[0], sz = b[1] - a[1], l2 = sx * sx + sz * sz || 1;
    let u = ((x - a[0]) * sx + (z - a[1]) * sz) / l2; u = Math.max(0, Math.min(1, u));
    d = Math.min(d, Math.hypot(x - (a[0] + sx * u), z - (a[1] + sz * u)));
  }
  return d;
}
/** Where the deck-height terrain along the axis first reaches deckY, else the crest. */
function bluffT(L, origin, dx, dz, deckY) {
  let prev = L.heightAt(origin[0], origin[1]), best = { t: 0, h: prev };
  for (let t = 0.5; t <= 80; t += 0.25) {
    const h = L.heightAt(origin[0] + dx * t, origin[1] + dz * t);
    if (prev < deckY && h >= deckY) return t - 0.25 * (h - deckY) / ((h - prev) || 1);
    if (h > best.h) best = { t, h };
    prev = h;
  }
  return best.t;
}

/**
 * The bridge centre line, derived from the lots. `t` is metres along the footprint axis from its lift end,
 * negative back into the shaft. Returns the mesh ends and the wall the far end enters.
 */
export function plazaBridgeSpan(L, deckY) {
  const bridge = L.lotById(PLAZA.bridge), lift = L.lotById(PLAZA.lift);
  if (!bridge || !lift) return null;
  const o = obbOf(bridge.poly), p0 = obbPt(o, 0, -o.d / 2), p1 = obbPt(o, 0, o.d / 2);
  const lc = obbOf(lift.poly);
  const nearFp = Math.hypot(p0[0] - lc.cx, p0[1] - lc.cz) < Math.hypot(p1[0] - lc.cx, p1[1] - lc.cz) ? p0 : p1;
  const farFp = nearFp === p0 ? p1 : p0;
  let dx = farFp[0] - nearFp[0], dz = farFp[1] - nearFp[1];
  const footprint = Math.hypot(dx, dz) || 1; dx /= footprint; dz /= footprint;
  const rx = -dz, rz = dx;
  const at = (t, off = 0) => [nearFp[0] + dx * t + rx * off, nearFp[1] + dz * t + rz * off];
  const liftP = openRing(lift.poly);
  let tBack = 0;
  for (const off of [-BRIDGE_HALF, 0, BRIDGE_HALF]) {
    const e = rayEntry(at(0, off), [-dx, -dz], liftP, 0.05);
    if (e && e.t > tBack) tBack = e.t;
  }
  const tNear = -(tBack + BRIDGE_EMBED);
  // walls that exist at the deck: the podium (towerY + 4.6, the same top the mesh uses), the annex, the lift hall
  const walls = [];
  const push = (id, y0, y1) => { const lot = L.lotById(id); if (lot && y1 > deckY && y0 < deckY) walls.push({ id, P: openRing(lot.poly) }); };
  push(PLAZA.main, 0, PLAZA.towerY + 4.6);
  const annex = L.lotById(PLAZA.annex); if (annex) push(PLAZA.annex, annex.groundY, annex.groundY + annex.height);
  const hall = L.lotById(PLAZA.liftHall); if (hall) push(PLAZA.liftHall, hall.groundY, hall.groundY + hall.height);
  let tWall = -1, lotId = null, center = null;
  const sides = [];
  for (const off of [-BRIDGE_HALF, 0, BRIDGE_HALF]) {
    let hit = null;
    for (const w of walls) {
      const e = rayEntry(at(0, off), [dx, dz], w.P, 1);
      if (e && (!hit || e.t < hit.t)) hit = { ...e, id: w.id };
    }
    if (hit) {
      if (hit.t > tWall) { tWall = hit.t; lotId = hit.id; }
      if (off === 0) center = hit;
      if (off !== 0) sides.push(hit);
    } else {
      const tt = bluffT(L, at(0, off), dx, dz, deckY);
      if (tt > tWall) tWall = tt;
    }
  }
  const tFar = (tWall < 0 ? bluffT(L, nearFp, dx, dz, deckY) : tWall) + BRIDGE_EMBED;
  const near = at(tNear), far = at(tFar);
  const end = [at(tFar, -BRIDGE_HALF), at(tFar, BRIDGE_HALF)];
  const nearEnd = [at(tNear, -BRIDGE_HALF), at(tNear, BRIDGE_HALF)];
  const P = lotId ? openRing(L.lotById(lotId).poly) : null;
  const gap = P ? Math.min(...end.map((p) => distToRing(p[0], p[1], P)), distToRing(far[0], far[1], P)) : null;
  let portal = null;
  if (center && sides.length === 2 && sides.every((s) => s.id === center.id && s.i === center.i)) {
    const sx = center.b[0] - center.a[0], sz = center.b[1] - center.a[1], el = Math.hypot(sx, sz) || 1;
    const opening = Math.hypot(sides[0].x - sides[1].x, sides[0].z - sides[1].z);
    const inside = [center.x + dx * 0.4, center.z + dz * 0.4];
    let nx = sz / el, nz = -sx / el;
    if ((inside[0] - center.x) * nx + (inside[1] - center.z) * nz > 0) { nx = -nx; nz = -nz; }
    portal = { x: center.x, z: center.z, yaw: Math.atan2(nx, nz), opening, edge: [center.a, center.b], outward: [nx, nz] };
  }
  return {
    near, far, end, nearEnd, portal, lot: lotId, gap,
    len: Math.hypot(far[0] - near[0], far[1] - near[1]),
    footprint, y: deckY,
    yaw: Math.atan2(far[0] - near[0], far[1] - near[1]),
  };
}

/** Open the podium wall where the bridge enters, and keep the rest of that edge solid. */
function cutPortal(ctx, a, b, hit, opening, deckY, roofY) {
  const ph = ctx.physics; if (!ph?.removeNear || !ph.addBox) return;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const gone = ph.removeNear((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len / 2 + 1, (it) => {
    if (it.type !== 'box' || it.hw > 0.4) return false;
    const vx = it.cx - a[0], vz = it.cz - a[1], s = vx * ux + vz * uz;
    return Math.hypot(vx - ux * s, vz - uz * s) < 0.8 && s > -0.5 && s < len + 0.5 && it.y1 > deckY && it.y0 < deckY;
  });
  if (!gone.length) return;
  const y0 = Math.min(...gone.map((it) => it.y0)), y1 = Math.max(...gone.map((it) => it.y1));
  const th = gone[0].hw * 2, it = gone[0], sIt = (it.cx - a[0]) * ux + (it.cz - a[1]) * uz;
  const nx = it.cx - (a[0] + ux * sIt), nz = it.cz - (a[1] + uz * sIt), nl = Math.hypot(nx, nz) || 1, n = [nx / nl, nz / nl];
  const place = (u0, u1, yA, yB) => {
    if (u1 - u0 < 0.25 || yB - yA < 0.2) return;
    const sm = (u0 + u1) / 2;
    ph.addBox(a[0] + ux * sm + n[0] * th / 2, a[1] + uz * sm + n[1] * th / 2, th, u1 - u0 + th, Math.atan2(ux, uz), yA, yB);
  };
  const cu = (hit[0] - a[0]) * ux + (hit[1] - a[1]) * uz, half = opening / 2 + 0.2;
  const s0 = Math.max(0, cu - half), s1 = Math.min(len, cu + half);
  place(0, s0, y0, y1);
  place(s1, len, y0, y1);
  place(s0, s1, y0, deckY - 0.05);    // solid under the deck
  place(s0, s1, roofY, y1);            // solid over the roof; the deck itself is the opening
}

export function buildPlazaHotel(ctx) {
  const L = ctx.L, lot = (id) => L.lotById(id);
  const main = lot(PLAZA.main); if (!main) return null;
  const root = new THREE.Group(); root.name = 'harbor-plaza-hotel'; ctx.addStatic(root);
  const W = ctx.kit(root), t = (c, o = {}) => ctx.mat.toon(c, { paint: 0.03, ...o });
  // [v6:c7] roof: the pale-green decks (Earth 2026-03-11 x 1.17 #c6d0c7, GSI #bed5cb); tile / crown: the 2026 cladding
  // (IMG_0896 sunlit slab bands #d9bcab / #d4bdb0); white stays for the lift head, the bridge roof, frames and parapets
  const M = {
    white: t('#eeeae2', { paint: 0.02 }), grey: t('#b9b6ae'), roof: t('#a2aca1', { paint: 0.04 }),
    tile: t('#d3b6a8'), crown: t('#cdb0a3'), cream: t('#e3dbcf'), signBox: t('#cfcac0'),
    frame: t('#f6f4ee', { paint: 0.01 }), steel: t('#9aa1a8', { paint: 0 }), glass: nightMat(ctx, '#7f98ab', '#ffe2b8', 1.3),
  };
  const rooms = facadeMat(ctx, 'plaza-rooms', { draw: paintWindow({ wall: '#d6b9ab', frame: '#b79e94', glass: ['#5c6a76', '#a8b5bd'], win: [0.08, 0.32, 0.92, 0.8], mull: 1, sill: '#c8c4bb' }), win: [0.08, 0.32, 0.92, 0.8], lit: 0.55 });
  // [v6:c7] the wing: greige walls between the window ribbons, a pink-mauve band at every floor slab, the top floor darker
  const wingFac = (key, wall) => facadeMat(ctx, key, { draw: paintWindow({ wall, frame: '#b79e94', glass: ['#5c6a76', '#a8b5bd'], win: [0.1, 0.32, 0.9, 0.8], mull: 2, band: { c: '#a3897f', y0: 0, y1: 0.2 } }), win: [0.1, 0.32, 0.9, 0.8], lit: 0.5 });
  const wingRooms = wingFac('plaza-wing', '#cbb8ab'), wingTop = wingFac('plaza-wing-top', '#a88e86');
  const halls = facadeMat(ctx, 'plaza-halls', { draw: paintWindow({ wall: '#e6e1d8', frame: '#cfccc4', glass: ['#6a8296', '#b3c5d0'], win: [0.08, 0.2, 0.92, 0.85], mull: 2 }), win: [0.08, 0.2, 0.92, 0.85], lit: 0.5 });
  const g0 = (x, z) => L.heightAt(x, z) - 0.6;
  const out = { lots: [] };

  // ---- the podium on the main footprint and the annex; the south wing
  const podTop = PLAZA.towerY + 4.6;
  for (const [id, top] of [[PLAZA.main, podTop], [PLAZA.annex, 24.5 + 4.0]]) {
    const l = lot(id); if (!l) continue;
    W.mesh(wallGeo(l.poly, g0, top, { tu: 4, tv: 3.4, yRef: PLAZA.towerY }), halls);
    flatRoof(W, l.poly, top, M.roof, M.white, 0.6);
    colliders(ctx, l.poly, 0, top + 1);
    out.lots.push(id);
  }
  const wing = lot(PLAZA.wing);
  if (wing) {
    const wy = 21.0, wt = wy + 5 * 3.2;
    W.mesh(wallGeo(wing.poly, g0, wt - 3.2, { tu: 3.4, tv: 3.2, yRef: wy }), wingRooms);
    W.mesh(wallGeo(wing.poly, wt - 3.2, wt, { tu: 3.4, tv: 3.2, yRef: wy }), wingTop);
    flatRoof(W, wing.poly, wt, M.roof, M.white, 0.8);
    colliders(ctx, wing.poly, 0, wt + 1);
    // the sign box on the roof: [v6:c7] greige, 「港ふれあい」 (pink) over 「気仙沼プラザホテル」 (navy, プラザ pink) in IMG_0896
    const o = obbOf(wing.poly), c = obbPt(o, 0, -o.d / 2 + 6);
    const S = new THREE.Group(); S.position.set(c[0], wt, c[1]); S.rotation.y = o.rotY + Math.PI / 2; root.add(S);
    const ks = ctx.kit(S);
    ks.boxB(9, 3.6, 3, M.signBox, [0, 0, 0]);
    const st = plazaSignTex(ctx, '#cfcac0');
    const sub = textTex(ctx, '港ふれあい', { w: 512, h: 128, color: '#b5607c', bg: '#cfcac0', font: FONT.round, weight: 700, size: 0.6, key: 'plaza-sign2-v6' });   // gitleaks:allow (a texture cache key, not a secret)
    for (const s of [-1, 1]) {
      ks.mesh(new THREE.PlaneGeometry(8.4, 1.6), mapMat(ctx, 'toon', '#ffffff', st, { paint: 0, nightGlow: 0.8 }), [0, 1.3, s * 1.52], [0, s < 0 ? Math.PI : 0, 0]);
      ks.mesh(new THREE.PlaneGeometry(4.2, 1.05), mapMat(ctx, 'toon', '#ffffff', sub, { paint: 0, nightGlow: 0.8 }), [0, 2.75, s * 1.52], [0, s < 0 ? Math.PI : 0, 0]);
    }
    out.lots.push(PLAZA.wing);
  }

  // ---- the cross-shaped tower, stepped back at the top two floors, with the crown and roundel
  const [tx, tz] = PLAZA.towerC, T = new THREE.Group(); T.position.set(tx, PLAZA.towerY, tz); T.rotation.y = PLAZA.rot; root.add(T);
  const kt = ctx.kit(T), fh = PLAZA.fh, H = PLAZA.floors * fh;
  const armBox = (w, d, y0, y1, inset) => {
    const ww = w - inset, dd = d - inset;
    const ring = [[-ww / 2, -dd / 2], [ww / 2, -dd / 2], [ww / 2, dd / 2], [-ww / 2, dd / 2]];
    kt.mesh(wallGeo(ring, y0, y1, { tu: 3.2, tv: fh, yRef: 0 }), rooms);
    kt.boxB(ww + 0.3, 0.3, dd + 0.3, M.tile, [0, y1, 0]);
    // [v6:c7] the deck: the pale-green roof over the ring, just above the tile edge slab (the terraces and the top)
    kt.mesh(capGeo(ring, y1 + 0.32, { tile: 3 }), M.roof);
    // [v6:c7] a continuous projecting balcony slab at every floor line, rounded at the arm ends (IMG_0896)
    for (let k = 1; k <= PLAZA.floors; k++) { const y = k * fh; if (y > y0 + 0.01 && y <= y1 + 0.01) kt.mesh(roundSlab(ww + 1.2, dd + 1.2, 0.5, 1.0), M.tile, [0, y - 0.5, 0]); }
  };
  const lowH = (PLAZA.floors - 2) * fh;
  for (const [w, d] of PLAZA.arms) { armBox(w, d, 0, lowH, 0); armBox(w, d, lowH, H, 4); }
  // [v6:c7] the crown: a pink-beige slab about 10.5 m tall (Commons 2026-03-29: 11.5 m ±10 %, IMG_0896: 10-11 m), its
  // faces with a cream panel tapering down under the roundel
  kt.boxB(9.2, 10.5, 7.5, M.crown, [0, H, 0]);
  const panel = taperGeo(5.2, 1.6, 8.8, 0.3);
  for (const s of [-1, 1]) kt.mesh(panel, M.cream, [0, H + 0.8, s * 3.8], [0, s < 0 ? Math.PI : 0, 0]);
  const rt = mapMat(ctx, 'toon', '#ffffff', roundelTex(ctx), { paint: 0, nightGlow: 0.6 });
  for (const s of [-1, 1]) kt.mesh(new THREE.PlaneGeometry(2.6, 2.6), rt, [0, H + 8.6, s * 3.97], [0, s < 0 ? Math.PI : 0, 0]);
  for (const s of [-1, 1]) kt.box(0.08, 3, 0.08, M.steel, [s * 2.5, H + 12.0, 0]);
  if (ctx.physics?.addBox) for (const [w, d] of PLAZA.arms) ctx.physics.addBox(tx, tz, w, d, PLAZA.rot, PLAZA.towerY - 1, PLAZA.towerY + H + 10.5);
  out.tower = { x: tx, z: tz, y: PLAZA.towerY, top: PLAZA.towerY + H + 10.5 };

  // ---- the lift tower at the cliff foot, its hall, and the glazed bridge up to the bluff
  const lift = lot(PLAZA.lift), hall = lot(PLAZA.liftHall), bridge = lot(PLAZA.bridge);
  const deckY = PLAZA.towerY + 0.6;
  if (lift) {
    const ly = lift.groundY, top = deckY + 5.5, o = obbOf(lift.poly);
    const G = new THREE.Group(); G.position.set(o.cx, ly, o.cz); G.rotation.y = o.rotY; root.add(G);
    const kl = ctx.kit(G), h = top - ly;
    kl.boxB(o.w, h, o.d, M.glass, [0, 0, 0]);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kl.boxB(0.5, h, 0.5, M.frame, [a * (o.w / 2 - 0.25), 0, b * (o.d / 2 - 0.25)]);
    for (let y = 3.2; y < h - 6; y += 3.2) kl.boxB(o.w + 0.1, 0.25, o.d + 0.1, M.frame, [0, y, 0]);
    kl.boxB(o.w + 0.4, 6, o.d + 0.4, M.white, [0, h - 6, 0]);
    for (const s of [-1, 1]) kl.mesh(new THREE.PlaneGeometry(2.4, 2.4), rt, [0, h - 3, s * (o.d / 2 + 0.22)], [0, s < 0 ? Math.PI : 0, 0]);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = kl.box(0.08, 4.5, 0.08, M.steel, [a * 1.2, h + 2.0, b * 1.2]); p.rotation.set(-b * 0.25, 0, a * 0.25); }
    colliders(ctx, lift.poly, ly - 1, top + 1);
    out.lift = { x: o.cx, z: o.cz, y: ly, top };
  }
  if (hall) { const hy = hall.groundY; W.mesh(wallGeo(hall.poly, g0, hy + 3.6, { tu: 3, tv: 3.6, yRef: hy }), halls); flatRoof(W, hall.poly, hy + 3.6, M.roof, M.white, 0.4); colliders(ctx, hall.poly, hy - 1, hy + 4); }
  const span = bridge && plazaBridgeSpan(L, deckY);
  if (span) {
    // level with the bluff floor (T.P. 25.8): the deck does not step where it enters the building.
    // IMG_0896 shows no pier under the span, so nothing is added between the two ends.
    const { near, far, len, yaw } = span;
    const G = new THREE.Group(); G.position.set((near[0] + far[0]) / 2, deckY, (near[1] + far[1]) / 2); G.rotation.y = yaw; root.add(G);
    const kb = ctx.kit(G);
    kb.boxB(3.4, 0.5, len, M.grey, [0, -0.5, 0]);
    // side panes, not a closed box: the ends are open, so no glass end face shows once they sit inside the head and the wall
    for (const s of [-1, 1]) kb.boxB(0.08, 2.7, len, M.glass, [s * 1.56, 0, 0]);
    kb.boxB(3.5, 0.35, len, M.roof, [0, 2.7, 0]);   // [v6:c7r1] pale green in Earth 2026-03-11 (#bdc2bb)
    for (let z = -len / 2; z <= len / 2 + 0.01; z += 3) for (const s of [-1, 1]) kb.boxB(0.12, 2.7, 0.12, M.frame, [s * 1.62, 0, z]);
    for (let z = -len / 2 + 2; z < len / 2; z += 4) { const d = kb.box(0.12, 0.12, 4.4, M.steel, [0, -1.6, z]); d.rotation.x = 0.45; }
    if (span.portal) {
      // a frame on the wall plane, larger than the cut, so the joint reads as a portal from outside
      const p = span.portal, F = new THREE.Group();
      F.position.set(p.x + p.outward[0] * 0.08, deckY, p.z + p.outward[1] * 0.08); F.rotation.y = p.yaw; root.add(F);
      const kf = ctx.kit(F), b = 0.22, ow = p.opening + 0.35, h0 = -0.15, h1 = 3.2;
      kf.boxB(ow + b * 2, b, 0.2, M.white, [0, h1, 0]);
      kf.boxB(ow + b * 2, b, 0.2, M.white, [0, h0 - b, 0]);
      kf.boxB(b, h1 - h0, 0.2, M.white, [-(ow / 2 + b / 2), h0, 0]);
      kf.boxB(b, h1 - h0, 0.2, M.white, [ow / 2 + b / 2, h0, 0]);
      cutPortal(ctx, p.edge[0], p.edge[1], [p.x, p.z], p.opening, deckY, deckY + 3.2);
    }
    if (ctx.physics?.addBox) {
      const mx = (near[0] + far[0]) / 2, mz = (near[1] + far[1]) / 2, c = Math.cos(yaw), s = Math.sin(yaw);
      ctx.physics.addWalkBox(mx, mz, 2.8, len, yaw, deckY, deckY - 0.8);   // the walk-through deck, flat, no step
      for (const side of [-1, 1]) ctx.physics.addBox(mx + side * 1.58 * c, mz - side * 1.58 * s, 0.16, len, yaw, deckY - 0.2, deckY + 3.05);
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    out.bridge = {
      len: Math.round(len * 10) / 10, y: deckY, lot: span.lot, footprint: Math.round(span.footprint * 10) / 10, gap: span.gap == null ? null : r2(span.gap),
      near: near.map(r2), far: far.map(r2), end: span.end.map((p) => p.map(r2)), nearEnd: span.nearEnd.map((p) => p.map(r2)),
    };
  }
  out.uoichi = buildUoichiSigns(ctx, root);
  root.updateMatrixWorld(true);
  return out;
}
