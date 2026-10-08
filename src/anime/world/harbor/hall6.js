// [v6:fix1] The north facility's open quay hall, built to the dawn photo survey (IMG_0853-0861; docs/anime/survey/market.md,
// "Quay hall, re-solved"). Every number is in data/survey/market/model.json `hall`, measured by tools/survey/market_hall.py
// from data/survey/market/hall-picks.json. The hall is built in the quay frame: a group at the layout quay line's start,
// turned so local +Z runs along the quay (a) and local +X points out to sea (d); y stays T.P.
//
//   * the roof edge 19.8 m inland of the quay edge (market4.js moves the OSM outline 7.5 m inland), columns on a 14.4 m
//     grid at d -21.4 (the one marked 「7」 at a 81.35: black band with the yellow numeral, facing the hall), the column
//     girder, the edge beam, two longitudinal beams and the transverse beams every 7.2 m (one measured, at a 59.7);
//   * the floor items the frames show: two rows of 1.44 x 1.19 x 0.74 m fish tubs, the sorting conveyor with its sorter,
//     the steel hopper and the stacks of four tubs beside the column, a 2 t truck on the apron, the striped quay curb
//     and the mooring bitts every 9.65 m.
import * as THREE from 'three';
import { bollard } from './props.js';
import { textTex, mapMat, FONT } from './util.js';
import { capGeo, prismWalls } from './lmkit.js';
import { fishTub, crateMats } from './crate6.js';
import { buildTruck } from './truck6.js';
import { buildTug } from './tug6.js';
import MODEL from '../../../../data/survey/market/model.json';

export const HALL = MODEL.hall;
const Q0 = HALL.quay.p0, Q1 = HALL.quay.p1, QL = Math.hypot(Q1[0] - Q0[0], Q1[1] - Q0[1]);
export const QU = [(Q1[0] - Q0[0]) / QL, (Q1[1] - Q0[1]) / QL];
export const QN = [QU[1], -QU[0]];
export const QROT = Math.atan2(QU[0], QU[1]);
/** Quay frame (a along the quay line, d out to sea) -> ENU [x, z]. */
export const quayEnu = (a, d) => [Q0[0] + QU[0] * a + QN[0] * d, Q0[1] + QU[1] * a + QN[1] * d];
/** ENU [x, z] -> quay frame [a, d]. */
export const quayOf = (x, z) => { const dx = x - Q0[0], dz = z - Q0[1]; return [dx * QU[0] + dz * QU[1], dx * QN[0] + dz * QN[1]]; };
const E3 = (a, d, y) => { const [x, z] = quayEnu(a, d); return [x, y, z]; };
/** The shed outline moved `shift` m inland (against the quay normal). */
export function shiftShed(poly, shift = HALL.shift) { return poly.map(([x, z]) => [x - QN[0] * shift, z - QN[1] * shift]); }

export function buildQuayHall(ctx, k, { fl, y1F, aRange, dRange, phys }) {
  const t = (c, o) => ctx.mat.toon(c, o), H = HALL;
  const G = k.group([Q0[0], 0, Q0[1]], QROT), K = ctx.kit(G);
  // a box from ranges: a along the quay (local z), d out to sea (local x), y T.P.
  const hb = (mat, a0, a1, d0, d1, y0, y1) => K.box(d1 - d0, y1 - y0, a1 - a0, mat, [(d0 + d1) / 2, (y0 + y1) / 2, (a0 + a1) / 2]);
  const M = {
    beam: t('#474c54', { paint: 0.02 }), beamLight: t('#5b6068', { paint: 0.02 }), col: t('#8f918c', { paint: 0.05 }), band: t('#25272a', { paint: 0 }),
    tub: t('#2c62a6', { paint: 0.03 }), tubIn: t('#3d86c9', { paint: 0.02 }), rim: t('#e6ebe9', { paint: 0.02 }), skid: t('#2a3140', { paint: 0 }),
    steel: t('#9aa1a4', { paint: 0.03 }), steelDark: t('#6e757a', { paint: 0.03 }), tyre: t('#23252b', { paint: 0 }), hub: t('#b9bdc0', { paint: 0 }),
    cab: t('#ece8d8', { paint: 0.03 }), glass: t('#33414f', { paint: 0 }), bed: t('#d9d4c0', { paint: 0.03 }), chassis: t('#3a3d44', { paint: 0 }),
    yellow: t('#e7b93d', { paint: 0.02 }), belt: t('#34373c', { paint: 0 }), guard: t('#7f8f88', { paint: 0.03 }), black: t('#2b2c31', { paint: 0 }), apron: t('#9d9b92', { paint: 0.08 }),
  };
  const [a0, a1] = aRange, [dLand, dFace] = dRange;      // the hall's a extent; d from the land wall to the roof edge

  // ---- ceiling members (beam bottoms T.P. 7.2-7.76; the soffit slab is the generic hall ceiling at y1F)
  for (const L of H.long) hb(M.beam, a0, a1, L.d - L.w / 2, L.d + L.w / 2, L.bottom, y1F);
  { const E = H.edge; hb(M.beamLight, a0, a1, E.d - E.w / 2, E.d + E.w / 2, E.bottom, y1F); }
  const T = H.trans;
  for (let a = T.a0 + Math.ceil((a0 - T.a0) / T.pitch) * T.pitch; a < a1 - 0.5; a += T.pitch) hb(M.beam, a - T.w / 2, a + T.w / 2, dLand + 0.1, dFace, T.bottom, y1F);

  // ---- columns on the face grid, numbered (the plate faces the hall, -d)
  const C = H.col, noTx = {};
  const numTex = (n) => noTx[n] || (noTx[n] = mapMat(ctx, 'toon', '#ffffff', textTex(ctx, String(n), { w: 128, h: 256, color: '#e2b04a', bg: '#25272a', font: FONT.sans, weight: 900, size: 0.7 }), { paint: 0 }));
  for (let a = C.a + Math.ceil((a0 - C.a) / C.spacing) * C.spacing; a < a1 - 1; a += C.spacing) {
    const no = C.label + Math.round((a - C.a) / C.spacing) * C.dir;
    hb(M.col, a - C.w / 2, a + C.w / 2, C.d - C.wd / 2, C.d + C.wd / 2, fl, H.long[2].bottom);
    hb(M.band, a - C.w / 2 - 0.02, a + C.w / 2 + 0.02, C.d - C.wd / 2 - 0.02, C.d + C.wd / 2 + 0.02, fl + C.band[0], fl + C.band[1]);
    if (no >= 1) K.plane(0.6, C.band[1] - C.band[0] - 0.1, numTex(no), [C.d - C.wd / 2 - 0.035, fl + (C.band[0] + C.band[1]) / 2, a], [0, -Math.PI / 2, 0]);
    const [x, z] = quayEnu(a, C.d); phys?.addCylinder?.(x, z, C.w * 0.55, fl, y1F);
    ctx.features?.add('market', `canopy.col#${no}`, E3(a, C.d, fl));
  }

  // ---- the apron between the roof edge and the quay edge, the striped curb and the bitts
  hb(M.apron, a0, a1, H.ramp.d[1], H.curb.d[0], H.apron - 0.6, H.apron);
  { const [r0, r1] = H.ramp.d, th = 0.6;   // the hall floor falls to the apron over the last 12 m (no step in the photos): one wedge whose top is the exact slope, flush with the floor slab and the apron
    const sh = new THREE.Shape([new THREE.Vector2(r0, fl - th), new THREE.Vector2(r0, fl), new THREE.Vector2(r1, H.apron), new THREE.Vector2(r1, H.apron - th)]);
    const wg = new THREE.ExtrudeGeometry(sh, { depth: a1 - a0, bevelEnabled: false }); K.mesh(wg, M.apron, [0, 0, a0]); }
  { const c = H.curb, n = Math.round((c.a[1] - c.a[0]) / 0.6), len = (c.a[1] - c.a[0]) / n;
    for (let i = 0; i < n; i++) hb(i % 2 ? M.black : M.yellow, c.a[0] + i * len, c.a[0] + (i + 1) * len, c.d[0], c.d[1], H.apron, H.apron + c.h); }
  [80.35, 86.55, 91.37].forEach((a, i) => ctx.features?.add('market', `canopy.curb#${i + 1}`, E3(a, H.curb.d[0], H.apron)));   // the surveyed curb points (the curb line d -0.5, top T.P. 1.84)
  { const B = H.bitts, M0 = { bollard: M.black, bollardCap: M.yellow }; let nb = 0;
    for (let i = B.n[0]; i <= B.n[1]; i++) { const a = B.a0 + i * B.pitch; if (a < a0 || a > a1) continue; bollard(K, M0, H.curb.d[0], H.apron + H.curb.h, a, { big: true }); if (Math.abs(a - 83.07) < 0.01 || Math.abs(a - 92.72) < 0.01) ctx.features?.add('market', `canopy.bitt#${++nb}`, E3(a, H.curb.d[0], H.apron)); } }

  // ---- fish tubs: every tub its own crate (crate6.js), rows along the quay with the 0.04 m slit between neighbours, and the
  // stacks of four beside column 7 (each tier a crate, nested 0.68 m pitch)
  const CM = crateMats(ctx);
  H.tubs.rows.forEach((R, ri) => {
    for (let i = 0; i < R.n; i++) {
      fishTub(ctx, K, CM, { a: R.a0 + i * R.pitch, d: R.d0, y0: fl, w: H.tubs.w, l: H.tubs.l, h: H.tubs.h, i: i + ri * 3, pockets: i === 0, shellW: R.pitch });
      if (ri === 0) ctx.features?.add('market', `canopy.tub#${i + 1}`, E3(R.a0 + 0.16 + i * R.pitch, R.d0, fl + H.tubs.h));   // the survey's near rim corner of tub i
    }
  });
  H.stacks.forEach((S, si) => {
    for (let q = 0; q < S.n; q++) fishTub(ctx, K, CM, { a: S.a[0], d: S.d[0], y0: fl + q * (H.tubs.h - 0.06), w: S.a[1] - S.a[0], l: S.d[1] - S.d[0], h: H.tubs.h, i: si * 4 + q + 4, plates: q === 0 || q === S.n - 1 });
  });

  // ---- sorting conveyor No.1 (氣仙沼魚市場 No.1): the belt trough 0.39-0.85 m with its lettered side panel, top flanges, underslung channel frame
  // with cross-bracing, six swivel casters, the thin guide rails behind it; the sorter at its head (drive housing, guard plate, slanted grate)
  // and the steel hopper on its scaffold legs. a 66-81.8 (15.8 m), measured on the floor by its casters (market_hall.py).
  { const B = H.conveyor.belt, yb = fl + B.y[0], yt = fl + B.y[1], mid = (B.d[0] + B.d[1]) / 2;
    const lblTx = mapMat(ctx, 'decal', '#ffffff', textTex(ctx, '気仙沼魚市場    No.1', { w: 1024, h: 96, color: '#2c2f33', font: FONT.sans, weight: 700, size: 0.62, key: 'conv-label' }), { transparent: true, alphaTest: 0.25 });
    hb(M.steel, B.a[0], B.a[1], B.d[0], B.d[1], yb + 0.1, yt - 0.02);   // belt trough (the belt runs nearly flush with the side flanges)
    hb(M.belt, B.a[0] + 0.05, B.a[1] - 0.05, B.d[0] + 0.1, B.d[1] - 0.1, yt - 0.03, yt - 0.01);   // the dark belt surface
    hb(M.steelDark, B.a[0] - 0.02, B.a[1] + 0.02, B.d[0] - 0.02, B.d[0] + 0.06, yt - 0.06, yt + 0.04); hb(M.steelDark, B.a[0] - 0.02, B.a[1] + 0.02, B.d[1] - 0.06, B.d[1] + 0.02, yt - 0.06, yt + 0.04);   // flanges
    hb(M.steelDark, B.a[0] - 0.02, B.a[0] + 0.06, B.d[0], B.d[1], yt - 0.06, yt + 0.08); hb(M.steelDark, B.a[1] - 0.06, B.a[1] + 0.02, B.d[0], B.d[1], yt - 0.06, yt + 0.08);   // end plates
    K.plane(B.a[1] - B.a[0] - 0.6, 0.2, lblTx, [B.d[0] - 0.012, yt - 0.2, (B.a[0] + B.a[1]) / 2], [0, -Math.PI / 2, 0]);
    // underslung frame: two channels, five cross members and X-bracing
    for (const d of [B.d[0] + 0.12, B.d[1] - 0.12]) hb(M.steelDark, B.a[0] + 0.1, B.a[1] - 0.1, d - 0.05, d + 0.05, yb, yb + 0.12);
    for (let q = 0; q < 6; q++) { const a = B.a[0] + 0.2 + q * (B.a[1] - B.a[0] - 0.4) / 5; hb(M.steelDark, a - 0.04, a + 0.04, B.d[0] + 0.1, B.d[1] - 0.1, yb + 0.02, yb + 0.1); }
    // guide rails behind the belt: two thin tubes on posts, longer than the belt
    for (const [yy, dd] of [[yt + 0.12, B.d[1] + 0.55], [yt - 0.1, B.d[1] + 0.9]]) { K.cyl(0.025, 0.025, B.a[1] - B.a[0] + 1.6, M.steel, [dd, yy, (B.a[0] + B.a[1]) / 2 + 0.3], [Math.PI / 2, 0, 0], 6); }
    for (const a of [B.a[0] + 0.4, (B.a[0] + B.a[1]) / 2, B.a[1] - 0.2]) K.cyl(0.02, 0.02, 0.9, M.steelDark, [B.d[1] + 0.55, fl + 0.45, a], null, 6);
    // the hose bib: a vertical pipe with a horizontal arm, standing on the floor behind the belt
    { const pa = 78.3, pd = -16.6; K.cyl(0.02, 0.02, 1.1, M.steelDark, [pd, fl + 0.55, pa], null, 6); K.cyl(0.018, 0.018, 1.8, M.steelDark, [pd, fl + 1.1, pa - 0.9], [Math.PI / 2, 0, 0], 6); K.cyl(0.04, 0.04, 0.1, M.steelDark, [pd, fl + 0.05, pa], null, 8); }
    H.conveyor.casters.forEach(([a, d], i) => {
      K.cyl(0.1, 0.1, 0.06, M.tyre, [d, fl + 0.1, a], [0, 0, Math.PI / 2], 10); K.cyl(0.055, 0.055, 0.065, M.yellow, [d, fl + 0.1, a], [0, 0, Math.PI / 2], 8);   // wheel with its yellow hub
      hb(M.steelDark, a - 0.04, a + 0.04, d - 0.04, d + 0.04, fl + 0.2, fl + (i < 4 ? B.y[0] : 0.6));   // stem
      hb(M.steelDark, a - 0.07, a + 0.07, d - 0.07, d + 0.07, fl + 0.19, fl + 0.22);   // fork plate
      ctx.features?.add('market', `canopy.conveyor.caster#${i + 1}`, E3(a, d, fl));
    });
    // the sorter at the conveyor's head (IMG_0855 head cuts): channel frame, stacked chute bodies, the tilted perforated grate tray on top (rises toward the belt, top
    // T.P. +1.48), the drive roller tube slung under the belt's head and the four legs on casters (two of them the surveyed 68.06 / 68.18 casters)
    const S = H.sorter, sa0 = S.a[0], sa1 = S.a[1], sd0 = S.d[0], sd1 = S.d[1], sdm = (sd0 + sd1) / 2;
    hb(M.steelDark, sa0, sa1, sd0 + 0.05, sd1 - 0.05, fl + S.y[0], fl + 0.7);   // channel frame
    hb(M.steel, sa0 + 0.05, sa1 - 0.55, sd0, sd1, fl + 0.7, fl + 0.98);   // lower chute body
    hb(M.steelDark, sa0 + 0.05, sa1 - 0.55, sd0 + 0.1, sd1 - 0.1, fl + 0.98, fl + 1.0);
    { const L = 1.7, tilt = Math.atan2(0.5, 1.3), gr = K.box(sd1 - sd0 + 0.04, 0.05, L, M.steel, [sdm, fl + 1.23, sa0 + 0.2 + 0.85 * Math.cos(tilt)]); gr.rotation.x = -tilt;   // grate tray
      for (let q = 0; q < 7; q++) { const gb = K.box(sd1 - sd0 - 0.1, 0.02, 0.03, M.steelDark, [sdm, fl + 1.2 + 0.0, sa0 + 0.2 + q * 0.25 * Math.cos(tilt)]); gb.rotation.x = -tilt; gb.position.y = fl + 1.0 + q * 0.25 * Math.sin(tilt) + 0.05; }
      hb(M.steel, sa0 + 0.05, sa0 + 0.1, sd0, sd1, fl + 0.98, fl + 1.3); hb(M.steel, sa0 + 1.2, sa0 + 1.25, sd0, sd1, fl + 0.98, fl + 1.48);   // chute end plates
      for (const dd of [sd0 + 0.02, sd1 - 0.02]) { const sw = K.box(0.04, 0.45, 1.5, M.steel, [dd, fl + 1.24, sa0 + 0.7 + 0.0]); sw.rotation.x = -tilt * 0.9; } }
    hb(M.steelDark, sa1 - 0.6, sa1 + 0.15, sd0 + 0.1, sd1 - 0.1, fl + 0.5, fl + 0.82);   // the slung drive housing
    { const gp = K.box(0.06, 0.34, 1.3, M.guard, [sd0 - 0.07, fl + 0.62, sa0 + 1.4]); gp.rotation.z = 0.38; gp.rotation.x = -0.06; }   // the green-grey guard plate on the drive
    for (const [a, d] of [[sa0 + 0.2, sd0 + 0.18], [sa0 + 0.2, sd1 - 0.18], [sa1 - 0.12, sd0 + 0.18], [sa1 - 0.12, sd1 - 0.18]]) { hb(M.steelDark, a - 0.04, a + 0.04, d - 0.04, d + 0.04, fl + 0.12, fl + S.y[0] + 0.05); K.cyl(0.08, 0.08, 0.05, M.tyre, [d, fl + 0.08, a], [0, 0, Math.PI / 2], 8); }
  }
  { const Hp = H.hopper;
    hb(M.steel, Hp.a[0], Hp.a[1], Hp.d[0], Hp.d[1], fl + Hp.y[0], fl + Hp.y[1]);
    hb(M.steelDark, Hp.a[0] + 0.1, Hp.a[1] - 0.1, Hp.d[0] + 0.1, Hp.d[1] - 0.1, fl + Hp.y[1] - 0.02, fl + Hp.y[1] + 0.005);
    // bin lip, the two sloped chutes ('ears') on the stern side, and ladder-frame legs (posts with rungs)
    hb(M.steelDark, Hp.a[0] - 0.02, Hp.a[1] + 0.02, Hp.d[0] - 0.02, Hp.d[0] + 0.05, fl + Hp.y[1] - 0.04, fl + Hp.y[1] + 0.06); hb(M.steelDark, Hp.a[0] - 0.02, Hp.a[1] + 0.02, Hp.d[1] - 0.05, Hp.d[1] + 0.02, fl + Hp.y[1] - 0.04, fl + Hp.y[1] + 0.06);
    for (const [dd, a0_] of [[Hp.d[0] + 0.05, Hp.a[0] - 0.9], [Hp.d[0] + 0.8, Hp.a[0] - 0.55]]) { const ch = K.box(0.9, 0.05, 0.9, M.steel, [dd + 0.4, fl + Hp.y[1] - 0.45, a0_ + 0.3]); ch.rotation.z = 0.5; }
    for (const [a, d] of [[Hp.a[0] + 0.2, Hp.d[0] + 0.2], [Hp.a[0] + 0.2, Hp.d[1] - 0.2], [Hp.a[1] - 0.2, Hp.d[0] + 0.2], [Hp.a[1] - 0.2, Hp.d[1] - 0.2]]) {
      hb(M.rim, a - 0.04, a + 0.04, d - 0.04, d + 0.04, fl, fl + Hp.y[0]);
      for (let y = fl + 0.15; y < fl + Hp.y[0]; y += 0.2) hb(M.rim, a - 0.12, a + 0.12, d - 0.02, d + 0.02, y, y + 0.025);
    }
    Hp.legs.slice(0, 2).forEach(([a, d], i) => ctx.features?.add('market', `canopy.hopper.leg#${i + 1}`, E3(a, d, fl)));
  }

  // ---- the 2 t JF みやぎ flat-bed truck on the apron (truck6.js): front axle at the survey's front tyre, heading toward -a
  { const Tk = H.truck, [fa, fd] = Tk.front, [ra, rd] = Tk.rear, wb = Math.hypot(fa - ra, fd - rd), w = Tk.width;
    const tg = new THREE.Group(); tg.position.set(fd, H.apron, fa); tg.rotation.y = Math.atan2(fd - rd, fa - ra); G.add(tg);
    tg.name = 'hall.truck'; buildTruck(ctx, tg, { ...Tk, wb }); ctx.noBatch(tg);   // unbatched, so photo-align can hide it in the frames taken before it drove in (cameras.json absent)
    ctx.features?.add('market', 'canopy.truck.wheel#1', E3(fa, fd, H.apron)); ctx.features?.add('market', 'canopy.truck.wheel#2', E3(ra, rd, H.apron));
    const [bx, bz] = quayEnu((fa + ra) / 2, (fd + rd) / 2); phys?.addBox?.(bx, bz, w + 0.2, wb + 2.0, QROT + Math.atan2(fd - rd, fa - ra) - Math.PI / 2 * 0, H.apron, H.apron + 2.0);
  }
  // ---- the bunch of black cables hanging from the girder just left of column 7 (IMG_0853 / 0860: eight strands, 7.6 down to T.P. 5.7-6.1, cut at d -22: a 79.4-79.9)
  { const cr = ctx.rng('hall-cables');
    for (let q = 0; q < 8; q++) { const a = 79.4 + q * 0.07 + cr.range(-0.02, 0.02), low = 5.7 + cr.range(0, 0.4), len = 7.65 - low;
      K.cyl(0.014, 0.014, len, M.black, [-22.0 + cr.range(-0.08, 0.08), low + len / 2, a], [cr.range(-0.03, 0.03), 0, cr.range(-0.03, 0.03)], 5); K.sphere(0.03, M.black, [-22.0, low - 0.02, a], 5); }
    hb(M.black, 79.3, 80.0, -22.12, -21.88, 6.5, 6.58); }   // the tie band
  // ---- the free-standing U-shaped pipe rail on the floor ramp behind the hopper (IMG_0853 / 0855 / 0860 / 0861: a 1.35 m tall pipe loop, 0.37 m wide), cut on the floor at a 86.2 / d -13.4
  { const ua = 86.2, ud = -13.4, uy = fl - (fl - H.apron) * (ud - H.ramp.d[0]) / (H.ramp.d[1] - H.ramp.d[0]);
    for (const s of [-1, 1]) K.cyl(0.018, 0.018, 1.2, M.steelDark, [ud, uy + 0.6, ua + s * 0.18], null, 6);
    K.cyl(0.018, 0.018, 0.36, M.steelDark, [ud, uy + 1.3, ua], [Math.PI / 2, 0, 0], 6);
    for (const s of [-1, 1]) K.sphere(0.04, M.steelDark, [ud, uy + 1.26, ua + s * 0.18], 6);
    K.box(0.3, 0.02, 0.4, M.steelDark, [ud, uy + 0.01, ua]); }
  // ---- people the frames caught (transient: cameras.json `absent` hides them in the frames that did not): two crew by the squid boat's stern in
  // IMG_0861 (an olive jacket and a man in blue rubber overalls), and a man in a dark jacket on the tug's deck by the stair in IMG_0855
  { const person = (name, list, y) => {
      const root = new THREE.Group(); root.name = name; G.add(root);
      list.forEach(([a, d, rot, { jacket, pants, cap, apron }]) => {
        const g = new THREE.Group(); g.position.set(d, y, a); g.rotation.y = rot; root.add(g); const P = ctx.kit(g), skin = t('#c99a78', { paint: 0.02 });
        const jm = t(jacket, { paint: 0.03 }), pm = t(pants, { paint: 0.03 }), cm = t(cap, { paint: 0.03 });
        for (const s of [-1, 1]) { P.cyl(0.075, 0.065, 0.85, pm, [s * 0.1, 0.45, 0], null, 8); P.box(0.11, 0.07, 0.26, M.black, [s * 0.1, 0.035, 0.05]); }
        P.rbox(0.42, 0.62, 0.24, 0.07, jm, [0, 1.17, 0]); if (apron) P.box(0.4, 0.78, 0.04, t(apron, { paint: 0.02 }), [0, 0.98, 0.14]);
        for (const s of [-1, 1]) P.cyl(0.05, 0.045, 0.6, jm, [s * 0.27, 1.1, 0.02], null, 8);
        P.sphere(0.115, skin, [0, 1.62, 0], 10); P.box(0.25, 0.07, 0.27, cm, [0, 1.73, 0.01]);
      });
      ctx.noBatch(root);
    };
    person('hall.crew', [[79.1, 2.0, -Math.PI / 2 + 0.2, { jacket: '#6f7249', pants: '#3c3a33', cap: '#4a3a2a' }], [79.6, 2.2, Math.PI / 2 + 0.3, { jacket: '#2b2d33', pants: '#3a5fa8', cap: '#222328', apron: '#3a74b8' }]], 1.9);
    person('hall.man', [[91.5, 1.9, -Math.PI / 2 - 0.4, { jacket: '#3d423a', pants: '#2f3036', cap: '#2a2b2e' }]], 2.1);
  }
  // ---- the deflector plate hanging under the transverse girder at a 58.8 / d -42.1 (triangulated from IMG_0853 x 0861: tip T.P. 7.18, 0.46 m wide, 0.4 m deep)
  { const sh = new THREE.Shape([new THREE.Vector2(-0.23, 0), new THREE.Vector2(0.23, 0), new THREE.Vector2(0.0, -0.4)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); g.rotateY(-Math.PI / 2); K.mesh(g, M.beamLight, [-42.1 + 0.025, 7.58, 58.78]); }
  // ---- the berthed tug 「KO1-875」, the squid boat behind it and the vessel at its bow (tug6.js, data/survey/market/tug.json)
  buildTug(ctx, K, { floorY: H.vessel.floor, add: (name, a, d, y) => ctx.features?.add('market', name, E3(a, d, y)), dim: (name, v) => ctx.features?.dim('market', name, v) });
  return { G, K };
}
