// [v4:polish1] 風待ち地区 (魚町): two of the registered tangible cultural properties rebuilt on their own lots, from their
// records and photos (harbor/real.js KAZEMACHI, docs/anime/landmarks/kazemachi.md). 男山本店店舗 is explore's (built with
// its walk-in shop by explore/interiors.js).
//
//   角星店舗 (c. 1929, rebuilt Nov 2016): the 角星 sake brewery's shop, 土蔵風 two storeys on a trapezoid lot, the front
//   angled to the sea. White plaster walls over a black plinth, a deep tiled pent roof (下屋) over the lit timber shop
//   front, a black 2F front board carrying the brewery's name, a grey tiled gable roof with its ridge along the street
//   (the gable ends on the sides), a small rooftop lantern sign. Photo: 風待ち project report ①.
//   武山米店 (1930, rebuilt April 2018): the rice merchant's two-storey house on a fan-shaped lot. A dark timber shop
//   front of glazed sliding doors under a pent roof, the 2F front clad in green copper (銅板張の腰壁) under a band of
//   windows, a grey sheet-steel gable roof whose front rafters fan out at the eaves (扇垂木); beside it on its own lot the
//   white 土蔵 of the 炊飯博物館 with its gable to the street, joined by a one-storey link under a pent roof. Photo: ④.
//
// Each building stands on its GSI footprint (walls follow the real outline; the roof covers its main body), with
// colliders on the walls, windows that light at night (life's registry through nightMat), and the names as signage.
import * as THREE from 'three';
import { KAZEMACHI } from './real.js';
import { nightMat } from './lights.js';
import { openRing, signedArea, capGeo, prismWalls, obbOf } from './lmkit.js';
import { wallGeo, pitchedRoof, colliders, textTex, FONT, vTextTex, mapMat } from '../landmarks/kit.js';

/** Local frame of a lot: origin at the frontage centre, +z toward the street, the building at z <= 0 (layout.lotFrame). */
function lotFrame(ctx, parent, lot, y0) {
  const f = ctx.L.lotFrame(lot);
  const g = new THREE.Group(); g.position.set(f.x, y0, f.z); g.rotation.y = f.rotY; parent.add(g); g.updateMatrixWorld(true);
  const c = Math.cos(f.rotY), s = Math.sin(f.rotY);
  const toW = (x, z) => [f.x + x * c + z * s, f.z - x * s + z * c];
  const toL = (X, Z) => { const dx = X - f.x, dz = Z - f.z; return [dx * c - dz * s, dx * s + dz * c]; };
  return { f, g, k: ctx.kit(g), toW, toL, rotY: f.rotY };
}

/** Sutherland–Hodgman: the part of `poly` (world) with local z >= zMin (the front `depth` metres of the lot). */
function clipFront(poly, F, zMin) {
  const P = openRing(poly).map(([x, z]) => F.toL(x, z));
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ina = a[1] >= zMin, inb = b[1] >= zMin;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (zMin - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, zMin]); }
  }
  return out.length >= 3 ? out.map(([x, z]) => F.toW(x, z)) : openRing(poly);
}

/** Local x extent of the front edge (the lot's frontage width at z ~ 0). */
function frontSpan(poly, F) {
  let x0 = Infinity, x1 = -Infinity;
  for (const [X, Z] of openRing(poly)) { const [x, z] = F.toL(X, Z); if (z > -2.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
  return Number.isFinite(x0) && x1 - x0 > 2 ? [x0, x1] : [-F.f.w / 2, F.f.w / 2];
}

/** A gable roof over the ring's OBB with the ridge parallel to the street (`front`) or running back from it (`deep`). */
function roofOver(k, ring, F, eave, { pitch, over, ridge, roofMat, gableMat, fasciaMat }) {
  const o = obbOf(ring);
  const fx = Math.cos(F.rotY), fz = -Math.sin(F.rotY);           // the street direction (local +x) in world
  const alongD = Math.abs(o.ux * fx + o.uz * fz) > 0.7;           // the OBB's long side d runs along the street
  const along = ridge === 'front' ? (alongD ? 'd' : 'w') : (alongD ? 'w' : 'd');
  const R = pitchedRoof(o, eave, { kind: 'gable', pitch, over, along });
  k.mesh(R.roof, roofMat); k.mesh(R.fascia, fasciaMat); if (R.gables) k.mesh(R.gables, gableMat);
  return R;
}

function buildKakuboshi(ctx, root, spec, M) {
  const L = ctx.L, lot = L.lotById(spec.lot); if (!lot) return null;
  const poly = lot.poly, gy = Math.max(lot.groundY, L.heightAt(lot.front.x, lot.front.z)) + 0.1;
  const F = lotFrame(ctx, root, lot, gy);
  const { k } = F, W = ctx.kit(root);
  const H1 = 3.6, eave = gy + spec.eave;
  // walls on the real outline: a black plinth, white plaster above (土蔵風), a black band under the eaves
  W.mesh(prismWalls(poly, gy - 0.8, gy + 0.55, { tile: 2 }), M.black);
  W.mesh(wallGeo(poly, gy + 0.55, eave - 0.35, { tu: 3, tv: 3 }), M.plaster);
  W.mesh(prismWalls(poly, eave - 0.35, eave, { tile: 2 }), M.black);
  const R = roofOver(W, poly, F, eave, { pitch: 0.42, over: 0.7, ridge: spec.ridge, roofMat: M.tile, gableMat: M.plaster, fasciaMat: M.black });
  const [x0, x1] = frontSpan(poly, F), fw = x1 - x0, xm = (x0 + x1) / 2;
  // 1F shop front: timber posts, glazed lattice panels lit warm at dusk, a noren over the door
  k.boxB(fw - 0.2, 0.3, 0.3, M.black, [xm, -0.02, 0.1]);
  const bays = Math.max(3, Math.round(fw / 1.8)), bw = (fw - 0.4) / bays;
  for (let i = 0; i <= bays; i++) k.boxB(0.16, H1 - 0.3, 0.2, M.wood, [x0 + 0.2 + i * bw, 0.28, 0.12]);
  for (let i = 0; i < bays; i++) {
    const cx = x0 + 0.2 + (i + 0.5) * bw;
    k.boxB(bw - 0.18, H1 - 0.75, 0.06, M.shopGlow, [cx, 0.5, 0.06]);
    for (let j = 1; j < 4; j++) k.box(bw - 0.18, 0.04, 0.05, M.wood, [cx, 0.5 + j * (H1 - 0.75) / 4, 0.1]);
    k.box(0.04, H1 - 0.75, 0.05, M.wood, [cx, 0.5 + (H1 - 0.75) / 2, 0.1]);
  }
  k.boxB(1.5, 0.9, 0.03, M.noren, [xm, H1 - 1.15, 0.24]);
  // the deep pent roof (下屋) over the shop front, on brackets (腕木)
  const pd = 1.6, pent = k.box(fw + 0.6, 0.16, pd, M.tile, [xm, H1 + 0.1, pd / 2 - 0.1]); pent.rotation.x = 0.22;
  k.box(fw + 0.6, 0.12, 0.08, M.black, [xm, H1 + 0.1 - Math.sin(0.22) * pd / 2 - 0.05, pd - 0.12]);
  for (let i = 0; i <= 3; i++) k.box(0.12, 0.12, pd - 0.2, M.wood, [x0 + 0.3 + i * (fw - 0.6) / 3, H1 - 0.18, pd / 2 - 0.1]);
  // 2F: a black front board with the brewery's name, lit windows either side
  const signT = textTex(ctx, '角星', { w: 512, h: 192, color: '#f0c46a', bg: '#1f1b1a', font: FONT.brush, weight: 700, size: 0.78, key: 'kz-kakuboshi-sign' });
  k.boxB(fw * 0.62, 1.7, 0.12, M.black, [xm, H1 + 0.75, 0.06]);
  k.mesh(new THREE.PlaneGeometry(fw * 0.54, 1.45), mapMat(ctx, 'toon', '#ffffff', signT, { paint: 0, nightGlow: 0.9 }), [xm, H1 + 1.6, 0.13]);
  for (const s of [-1, 1]) k.boxB(0.9, 1.1, 0.06, M.win, [xm + s * fw * 0.4, H1 + 1.0, 0.04]);
  // a small hanging 杉玉 at the door (the sake brewery's sign)
  k.sphere(0.36, M.sugi, [xm - 1.3, H1 - 0.55, 0.55], 10);
  colliders(ctx, poly, gy - 1, eave + 1);
  return { id: 'kakuboshi', x: lot.obb.cx, z: lot.obb.cz, y: gy, top: eave + R.rise };
}

function buildTakeyama(ctx, root, spec, kura, M) {
  const L = ctx.L, lot = L.lotById(spec.lot); if (!lot) return null;
  const gy = Math.max(lot.groundY, L.heightAt(lot.front.x, lot.front.z)) + 0.1;
  const F = lotFrame(ctx, root, lot, gy);
  const { k } = F, W = ctx.kit(root);
  const H1 = 3.5, eave = gy + spec.eave;
  // the main house on the front of the fan-shaped lot; a one-storey back wing on the rest
  const main = clipFront(lot.poly, F, -spec.depth);
  const back = (() => { const P = openRing(lot.poly).map(([x, z]) => F.toL(x, z)); return P.some(([, z]) => z < -spec.depth - 1) ? lot.poly : null; })();
  if (back) { W.mesh(prismWalls(back, gy - 0.6, gy + 3.2, { tile: 2 }), M.boardDark); W.mesh(capGeo(back, gy + 3.2, { tile: 3 }), M.steel); }
  W.mesh(prismWalls(main, gy - 0.6, gy + 0.4, { tile: 2 }), M.stone);
  W.mesh(wallGeo(main, gy + 0.4, eave - 0.3, { tu: 3, tv: 3 }), M.boardDark);
  W.mesh(prismWalls(main, eave - 0.3, eave, { tile: 2 }), M.wood);
  const R = roofOver(W, main, F, eave, { pitch: 0.45, over: 0.8, ridge: spec.ridge, roofMat: M.steel, gableMat: M.boardDark, fasciaMat: M.wood });
  const [x0, x1] = frontSpan(main, F), fw = x1 - x0, xm = (x0 + x1) / 2;
  // 1F: glazed timber sliding doors (lit at night), the pent roof on brackets
  const bays = Math.max(3, Math.round(fw / 1.7)), bw = (fw - 0.3) / bays;
  for (let i = 0; i <= bays; i++) k.boxB(0.15, H1 - 0.2, 0.2, M.wood, [x0 + 0.15 + i * bw, 0.2, 0.12]);
  for (let i = 0; i < bays; i++) {
    const cx = x0 + 0.15 + (i + 0.5) * bw;
    k.boxB(bw - 0.16, H1 - 0.9, 0.06, M.shopGlow2, [cx, 0.45, 0.06]);
    for (let j = 1; j < 3; j++) k.box(bw - 0.16, 0.05, 0.05, M.wood, [cx, 0.45 + j * (H1 - 0.9) / 3, 0.1]);
  }
  const pd = 1.3, pent = k.box(fw + 0.4, 0.14, pd, M.steel, [xm, H1 + 0.05, pd / 2 - 0.1]); pent.rotation.x = 0.2;
  for (let i = 0; i <= 3; i++) k.box(0.1, 0.1, pd - 0.2, M.wood, [x0 + 0.3 + i * (fw - 0.6) / 3, H1 - 0.2, pd / 2 - 0.1]);
  // 2F: the copper-clad (銅板張) lower wall, a band of windows with white frames above it
  k.boxB(fw - 0.2, 1.05, 0.1, M.copper, [xm, H1 + 0.45, 0.04]);
  const wn = Math.max(3, Math.round(fw / 1.6)), ww = (fw - 0.6) / wn;
  for (let i = 0; i < wn; i++) { const cx = x0 + 0.3 + (i + 0.5) * ww; k.boxB(ww - 0.14, 1.2, 0.06, M.win, [cx, H1 + 1.55, 0.02]); k.boxB(ww, 0.08, 0.1, M.white, [cx, H1 + 2.78, 0.04]); }
  k.boxB(fw - 0.2, 0.08, 0.12, M.white, [xm, H1 + 1.5, 0.06]);
  // 扇垂木: rafter ends fanning out under the front eave
  const eL = eave - gy;
  for (let i = -6; i <= 6; i++) { const r = k.box(0.07, 0.07, 0.95, M.wood, [xm + i * fw / 13, eL - 0.12, 0.35]); r.rotation.y = i * 0.07; }
  // the name board over the door and the museum's vertical sign
  const nm = textTex(ctx, '武山米店', { w: 512, h: 128, color: '#f3ead2', bg: '#2d2620', font: FONT.serif, weight: 900, size: 0.72, key: 'kz-takeyama-name' });
  k.mesh(new THREE.PlaneGeometry(2.6, 0.65), mapMat(ctx, 'toon', '#ffffff', nm, { paint: 0, nightGlow: 0.6 }), [xm, H1 + 0.1 - 0.62, pd - 0.02]);
  colliders(ctx, lot.poly, gy - 1, eave + 1);
  // ---- the 土蔵 (炊飯博物館) on its own lot, gable to the street, and the one-storey link
  let kuraOut = null;
  const kl = kura && L.lotById(kura.lot);
  if (kl) {
    const ky = Math.max(kl.groundY, L.heightAt(kl.front.x, kl.front.z)) + 0.1, keave = ky + kura.eave;
    const KF = lotFrame(ctx, root, kl, ky), kk = KF.k;
    const body = clipFront(kl.poly, KF, -9.5);
    W.mesh(prismWalls(body, ky - 0.6, ky + 0.9, { tile: 2 }), M.namako);
    W.mesh(prismWalls(body, ky + 0.9, keave, { tile: 3 }), M.kuraWhite);
    const KR = roofOver(W, body, KF, keave, { pitch: 0.6, over: 0.5, ridge: kura.ridge, roofMat: M.kuraRoof, gableMat: M.kuraWhite, fasciaMat: M.black });
    // the rest of the lot toward the main house: the single-storey link under a pent roof
    const link = openRing(kl.poly).map(([x, z]) => KF.toL(x, z)).some(([, z]) => z < -10.5);
    if (link) { W.mesh(prismWalls(kl.poly, ky - 0.6, ky + 3.0, { tile: 2 }), M.boardDark); W.mesh(capGeo(kl.poly, ky + 3.0, { tile: 3 }), M.steel); }
    // the door (観音扉 frame) and a small window high in the gable, the museum's name plate
    const [a0, a1] = frontSpan(body, KF), am = (a0 + a1) / 2;
    kk.boxB(1.6, 2.3, 0.12, M.black, [am, 0.2, 0.06]); kk.boxB(1.2, 2.0, 0.05, M.doorWood, [am, 0.25, 0.1]);
    kk.boxB(0.9, 0.7, 0.1, M.black, [am, kura.eave + 0.5, 0.05]);
    const mt = vTextTex(ctx, '炊飯博物館', { w: 96, h: 384, color: '#2d2620', bg: '#efe6cf', font: FONT.serif, weight: 800, key: 'kz-suihan' });
    kk.mesh(new THREE.PlaneGeometry(0.42, 1.7), mapMat(ctx, 'toon', '#ffffff', mt, { paint: 0 }), [am + 1.35, 1.3, 0.14]);
    colliders(ctx, kl.poly, ky - 1, keave + 1);
    kuraOut = { x: kl.obb.cx, z: kl.obb.cz, y: ky, top: keave + KR.rise };
  }
  return { id: 'takeyama', x: lot.obb.cx, z: lot.obb.cz, y: gy, top: eave + R.rise, kura: kuraOut };
}

export function buildKazemachi(ctx) {
  const root = new THREE.Group(); root.name = 'harbor-kazemachi';
  ctx.addStatic(root);
  const t = (c, o = {}) => ctx.mat.toon(c, { paint: 0.03, ...o });
  const M = {
    black: t('#2a2626', { paint: 0.02 }), plaster: t('#f1eee6', { paint: 0.02 }), tile: t('#5f676c', { paint: 0.05 }), wood: t('#5a3d2a'),
    noren: t('#2f4d6e', { paint: 0.02 }), sugi: t('#6f7a3c', { paint: 0.06 }), stone: t('#8d8a84'), boardDark: t('#4a3a2e'), steel: t('#8a9496', { paint: 0.04 }),
    copper: t('#5f9a86', { paint: 0.06 }), white: t('#ecebe4', { paint: 0.01 }), namako: t('#3b3d44'), kuraWhite: t('#f3f1ea', { paint: 0.02 }), kuraRoof: t('#4f5658', { paint: 0.04 }),
    doorWood: t('#6b4a30'),
    shopGlow: nightMat(ctx, '#b9a27a', '#ffcf8a', 1.5), shopGlow2: nightMat(ctx, '#8d9aa0', '#ffd9a0', 1.3), win: nightMat(ctx, '#6f8796', '#ffd9a0', 1.2),
  };
  const out = { built: [] };
  // the lots carry the models' storeys and heights (build-layout.js writes the same values; this keeps an older
  // layout.json consistent for labels, walk framings and the accuracy audit)
  for (const v of Object.values(KAZEMACHI)) { const l = ctx.L.lotById(v.lot); if (l) { l.storeys = v.storeys; l.height = v.height; } }
  const kb = buildKakuboshi(ctx, root, KAZEMACHI.kakuboshi, M); if (kb) out.built.push(kb);
  const ty = buildTakeyama(ctx, root, KAZEMACHI.takeyama, KAZEMACHI.takeyamaKura, M); if (ty) out.built.push(ty);
  root.updateMatrixWorld(true);
  return out;
}
