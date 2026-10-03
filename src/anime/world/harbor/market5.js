// [v6:rebuild] 気仙沼市魚市場 C棟's roof deck rebuilt to the photo survey (docs/anime/survey/market.md; every number comes
// from data/survey/market/model.json, the rebuild spec, whose `src` fields name the measurements). Called from
// harbor/market4.js's C棟 block. The deck is built in the penthouse-wall frame: a group at the frame origin turned so
// local +Z runs along the east wall (s) and local +X points out of it (off, east); y stays T.P.
//
//   * the deck slab at T.P. 15.585 (weathered concrete, saw-cut joints) from the C棟 north edge to the cooking studio,
//     and east to the parapet rail at off 21.3; the strip beyond is a lower roof;
//   * the penthouse (C棟's upper floor) west of the wall: pale-blue panelled east wall 6.6 m high with the plinth band,
//     ten triplets of 1.95 x 1.64 m windows, louvred vents, the raised letters 「気仙沼市魚市場」 (2.4 m glyphs at 5.2 m),
//     the visitors' entrance with its canopy and ramp rails, and the two raised roof sections behind the parapet with
//     their rounded white end caps;
//   * the cooking-studio block across the south end: its north face, door canopy, windows, sign and mascot, the rooftop
//     rail, louvred plant box, two hybrid wind / solar lamps and the flagpole;
//   * eight glazed observation pavilions in four mirrored pairs (outer roof ends sweep up, inner ends curl down), the
//     white stacks with their four stays, the orange enclosed lifeboat on its trailer and the cones (the photographed
//     cars are measured in the spec but not built: they are transient).
import * as THREE from 'three';
import { prismWalls, capGeo, paint } from './lmkit.js';
import { mapMat, textTex, FONT } from './util.js';
import { nightMat } from './lights.js';
import { shopGlass } from './detail5.js';
import MODEL from '../../../../data/survey/market/model.json';

export const DECK = MODEL;
const FR = MODEL.frame;
export const ROT = Math.atan2(FR.u[0], FR.u[1]);
/** Wall frame (s along the wall, off out of it) -> ENU [x, z]. */
export const enu = (s, off) => [FR.o[0] + FR.u[0] * s + FR.n[0] * off, FR.o[1] + FR.u[1] * s + FR.n[1] * off];
/** ENU [x, z] -> wall frame [s, off]. */
export const wallOf = (x, z) => { const dx = x - FR.o[0], dz = z - FR.o[1]; return [dx * FR.u[0] + dz * FR.u[1], dx * FR.n[0] + dz * FR.n[1]]; };

/** C棟 in the wall frame: the GSI / OSM outline is a rectangle to 0.3 m (north s -13.2, south s 183.0, west off -32.0,
 *  east off 34.3 with the plant-room notches beyond). */
export const CBOX = { s0: -13.2, s1: 183.0, o0: -32.0, o1: 34.3 };

/** Height of the pavilion roof's top surface above the deck at t (0 = inner curled end, 1 = outer swept-up end). */
export function pavRoofH(t, R = MODEL.pavilions.roof) {
  const K = [[0, R.curl], [0.05, R.curl + 0.45], [0.13, R.low + 0.05], [0.32, R.low + 0.12], [0.56, R.low + 0.04], [0.76, R.low + 0.2], [0.9, R.low + 0.6 * (R.tip - R.low)], [1, R.tip]];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const a = K[i - 1], b = K[i], f = (t - a[0]) / (b[0] - a[0]), g = f * f * (3 - 2 * f); return a[1] + (b[1] - a[1]) * g; }
  return R.tip;
}

/** The studio's north face in the wall frame: s at a given off (the GSI line shifted by the survey's studio_off). */
export function studioS(off) { const [a, b] = MODEL.studio.face.map(([x, z]) => wallOf(x, z)); return a[0] + (b[0] - a[0]) * (off - a[1]) / (b[1] - a[1]); }

export function buildCRoofPhotos(ctx, k, { cars }) {
  const t = (c, o) => ctx.mat.toon(c, o), phys = ctx.physics, M = MODEL, D = M.deck, y = D.y;
  const G = k.group([FR.o[0], 0, FR.o[1]], ROT), K = ctx.kit(G);
  const at = (s, off, h = 0) => { const [x, z] = enu(s, off); return [x, y + h, z]; };
  const slab = paint(ctx, 'c6-slab', 512, 512, (g, w, h) => {   // 10 m tile: 5 x 5 m slabs with saw-cut joints and water stains
    g.fillStyle = '#b5ab97'; g.fillRect(0, 0, w, h);
    const rr = ctx.rng('c6slab');
    for (let i = 0; i < 80; i++) { g.globalAlpha = 0.1; g.fillStyle = rr() < 0.6 ? '#857c6b' : '#cfc6b2'; g.beginPath(); g.ellipse(rr() * w, rr() * h, 10 + rr() * 60, 6 + rr() * 34, rr() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#5f584c'; for (const v of [0, w / 2]) { g.fillRect(v, 0, 2, h); g.fillRect(0, v, w, 2); }
  }, [1, 1]);
  const panel = paint(ctx, 'c6-blue', 256, 256, (g, w, h) => {   // 8 m tile: pale-blue panels, stepped joint lines
    g.fillStyle = '#93b5d8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#789bbe'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h * 0.3); g.lineTo(w * 0.25, h * 0.3); g.lineTo(w * 0.25, h * 0.2); g.lineTo(w * 0.75, h * 0.2); g.lineTo(w * 0.75, h * 0.3); g.lineTo(w, h * 0.3); g.stroke();
  }, [1, 1]);
  const m = {
    slab: mapMat(ctx, 'toon', '#ffffff', slab, { paint: 0.03 }), blue: mapMat(ctx, 'toon', '#ffffff', panel, { paint: 0.03 }),
    blueP: t('#9fbcd9', { paint: 0.03 }), base: t('#a7aaa6', { paint: 0.03 }), white: t('#eef0ee', { paint: 0.03 }), whiteD: t('#eceeec', { paint: 0.03, side: 'double' }),
    grey: t('#a3a7a9', { paint: 0.03 }), greyD: t('#9a9fa3', { paint: 0.03, side: 'double' }), roofTop: t('#b9bcbc', { paint: 0.03, side: 'double' }), concrete: t('#c1bfb7', { paint: 0.05 }),
    frame: t('#6f6a64', { paint: 0 }), rail: t('#b7bec4', { paint: 0 }), cone: t('#df3f2b', { paint: 0.02 }), coneW: t('#f2f0ea', { paint: 0.02 }),
    black: t('#2a2b2e', { paint: 0 }), orange: t('#ee5a2a', { paint: 0.03 }), orangeD: t('#c4441f', { paint: 0.03 }), navy: t('#2c3a5c', { paint: 0.02 }), steel: t('#a9b0b6', { paint: 0 }),
    win: t('#3e4954', { paint: 0 }), plinth: t('#a9c6dd', { paint: 0.03 }), solar: t('#1f2833', { paint: 0 }),
    glass: shopGlass(ctx, 'office', 0.75), door: shopGlass(ctx, 'office', 1.0), lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2),
  };
  // ------------------------------------------------------------------ the deck
  const S0 = D.north, S1 = studioS(D.edge), E = D.edge;
  // the slab: C棟's roof between the north edge, the studio face and the parapet; under the penthouse it is roof, not deck
  const deckRing = [[CBOX.o0, S0], [E, S0], [E, studioS(E)], [0, studioS(0)], [0, M.wall.s[0]], [CBOX.o0, M.wall.s[0]]];
  K.mesh(capGeo(deckRing, y + 0.01, { tile: 10 }), m.slab);
  // C棟's body between the lower east strip and the deck (market4 builds the hall below that level)
  const lowY = y - D.lowerDrop, body = [[CBOX.o0, CBOX.s0], [E, CBOX.s0], [E, CBOX.s1], [CBOX.o0, CBOX.s1]];
  K.mesh(prismWalls(body, lowY - 0.05, y, { tile: 4 }), m.white);
  if (phys?.addWalkBox) { const n = 12; for (let i = 0; i < n; i++) { const sa = S0 + (S1 - S0) * i / n, sb = S0 + (S1 - S0) * (i + 1) / n, [x, z] = enu((sa + sb) / 2, E / 2); phys.addWalkBox(x, z, E - 0.6, sb - sa, ROT, y, y - 1); } }
  // the parapet and rail along the east edge (IMG_0797 / 0798 see the bay over it)
  { const R = M.rail, len = S1 - S0;
    K.box(0.3, R.parapet + 0.3, len, m.concrete, [E - 0.15, y + (R.parapet - 0.3) / 2, (S0 + S1) / 2]);
    K.box(0.07, 0.07, len, m.rail, [E - 0.15, y + R.h, (S0 + S1) / 2]); K.box(0.04, 0.04, len, m.rail, [E - 0.15, y + R.parapet + 0.12, (S0 + S1) / 2]);
    const bars = paint(ctx, 'c6-bars', 64, 32, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#b7bec4'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 2, h); }, [1, 1]);
    const bm = mapMat(ctx, 'toon', '#ffffff', bars, { transparent: true, alphaTest: 0.4, side: 'double', paint: 0 }); bm.map.repeat.set(len / 1.2, 1);
    K.plane(len, R.h - R.parapet - 0.12, bm, [E - 0.15, y + (R.h + R.parapet + 0.12) / 2, (S0 + S1) / 2], [0, Math.PI / 2, 0]);
    for (let s = S0; s <= S1; s += R.post) K.box(0.06, R.h - R.parapet, 0.06, m.rail, [E - 0.15, y + (R.h + R.parapet) / 2, s]);
    if (phys?.addBox) for (let i = 0; i < 10; i++) { const sa = S0 + len * i / 10, [x, z] = enu(sa + len / 20, E - 0.15); phys.addBox(x, z, 0.3, len / 10, ROT, y, y + R.h); } }
  // ------------------------------------------------------------------ the penthouse (C棟's upper floor) and its east wall
  const W = M.wall, top = (s) => W.top[0] + (W.top[1] - W.top[0]) * (s - W.s[0]) / (W.s[1] - W.s[0]), topMid = (W.top[0] + W.top[1]) / 2;
  const ph = [[CBOX.o0, W.s[0]], [0, W.s[0]], [0, CBOX.s1], [CBOX.o0, CBOX.s1]];
  K.mesh(prismWalls(ph, y, topMid, { tile: 8 }), m.blue);
  K.mesh(capGeo(ph, topMid, { tile: 6 }), m.roofTop);
  // the east wall's top follows the survey (22.31 at the north corner, 22.15 at the studio): a coping strip on the slope
  { const len = W.s[1] - W.s[0], b = K.box(0.34, 0.2, len, m.white, [0.02, (top(W.s[0]) + top(W.s[1])) / 2 - 0.1, (W.s[0] + W.s[1]) / 2]); b.rotation.x = Math.atan2(top(W.s[0]) - top(W.s[1]), len); }
  K.box(W.plinth.out + 0.02, W.plinth.h, W.s[1] - W.s[0], m.base, [W.plinth.out / 2, y + W.plinth.h / 2, (W.s[0] + W.s[1]) / 2]);
  if (phys?.addBox) { const [x, z] = enu((W.s[0] + CBOX.s1) / 2, CBOX.o0 / 2); phys.addBox(x, z, -CBOX.o0, CBOX.s1 - W.s[0], ROT, y, topMid + 1); }
  // windows (dark two-pane sliders in grey frames) and the louvred vents above each triplet's middle window
  const Wn = W.windows, win = [];
  for (const s of Wn.list) {
    const h0 = y + Wn.h0, h1 = y + Wn.h1; win.push(s);
    K.box(0.08, h1 - h0 + 0.1, Wn.w + 0.1, m.frame, [0.03, (h0 + h1) / 2, s]);
    K.box(0.06, h1 - h0 - 0.06, Wn.w - 0.06, m.win, [0.05, (h0 + h1) / 2, s]);
    K.box(0.07, h1 - h0 - 0.06, 0.05, m.frame, [0.07, (h0 + h1) / 2, s]);
  }
  for (const s of Wn.vents) { const v0 = y + W.vents.h0, v1 = y + W.vents.h1; K.box(0.06, v1 - v0, W.vents.w, m.frame, [0.03, (v0 + v1) / 2, s]); for (let q = 1; q < 5; q++) K.box(0.07, 0.03, W.vents.w - 0.08, m.grey, [0.05, v0 + (v1 - v0) * q / 5, s]); }
  // the raised letters
  { const L = W.letters;
    [...L.chars].forEach((ch, i) => {
      const tex = textTex(ctx, ch, { w: 256, h: 256, color: '#f4f5f3', font: FONT.sans, weight: 700, size: 0.94 }), sh = textTex(ctx, ch, { w: 256, h: 256, color: '#6b8198', font: FONT.sans, weight: 700, size: 0.94 });
      K.plane(L.size, L.size, mapMat(ctx, 'decal', '#ffffff', sh, { transparent: true, alphaTest: 0.3 }), [L.out - 0.08, y + L.h[i] - 0.07, L.s[i] + 0.06], [0, Math.PI / 2, 0]);
      K.plane(L.size, L.size, mapMat(ctx, 'decal', '#ffffff', tex, { transparent: true, alphaTest: 0.3 }), [L.out, y + L.h[i], L.s[i]], [0, Math.PI / 2, 0]);
    }); }
  // the visitors' entrance: glazed doors, the flat canopy, ramp rails
  { const En = W.entrance, d0 = En.door[0], d1 = En.door[1], c0 = En.canopy[0], c1 = En.canopy[1];
    for (let i = 0; i < 4; i++) { const sa = d0 + (d1 - d0) * i / 4, sb = d0 + (d1 - d0) * (i + 1) / 4; K.box(0.05, En.doorH - 0.1, sb - sa - 0.08, m.door, [0.04, y + En.doorH / 2, (sa + sb) / 2]); K.box(0.07, En.doorH, 0.07, m.frame, [0.05, y + En.doorH / 2, sa]); }
    K.box(0.07, En.doorH, 0.07, m.frame, [0.05, y + En.doorH / 2, d1]); K.box(0.08, 0.08, d1 - d0, m.frame, [0.05, y + En.doorH, (d0 + d1) / 2]);
    K.box(En.canopyOut, En.canopyH[1] - En.canopyH[0], c1 - c0, m.white, [En.canopyOut / 2, y + (En.canopyH[0] + En.canopyH[1]) / 2, (c0 + c1) / 2]);
    for (const sd of [c0 + 0.3, c1 - 0.3]) { const b = K.box(0.04, 0.04, Math.hypot(En.canopyOut, 1.2), m.steel, [En.canopyOut / 2, y + En.canopyH[1] + 0.55, sd]); b.rotation.z = Math.atan2(1.2, En.canopyOut); }
    { const Ld = W.landing; K.box(Ld.out, Ld.h, Ld.s[1] - Ld.s[0], m.concrete, [Ld.out / 2, y + Ld.h / 2, (Ld.s[0] + Ld.s[1]) / 2]); if (phys?.addWalkBox) { const [x, z] = enu((Ld.s[0] + Ld.s[1]) / 2, Ld.out / 2); phys.addWalkBox(x, z, Ld.out, Ld.s[1] - Ld.s[0], ROT, y + Ld.h, y); } }
    for (const R of W.ramps) { const len = R.s[1] - R.s[0]; for (const h of [R.h, R.h - 0.35]) K.box(0.05, 0.05, len, m.rail, [R.out, y + h, (R.s[0] + R.s[1]) / 2]); for (let s = R.s[0]; s <= R.s[1] + 0.01; s += len / 3) K.box(0.05, R.h, 0.05, m.rail, [R.out, y + R.h / 2, s]); }
    if (phys?.addBox) { const [x, z] = enu((c0 + c1) / 2, 0.6); phys.addBox(x, z, 1.2, c1 - c0, ROT, y + 3.0, y + 3.5); } }
  // raised roof sections set back behind the parapet, rounded white end caps (IMG_0792, 0794, 0795)
  for (const Ev of W.eaves) {
    const len = Ev.s[1] - Ev.s[0], hTop = y + Ev.h, x0 = -Ev.set - Ev.depth, x1 = -Ev.set;
    K.box(Ev.depth, hTop - topMid, len, m.blue, [(x0 + x1) / 2, (topMid + hTop) / 2, (Ev.s[0] + Ev.s[1]) / 2]);
    const prof = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; prof.push([(x0 + x1) / 2 - Math.cos(a) * (Ev.depth / 2 + 0.25), hTop - 0.15 + Math.sin(a) * 0.9]); }
    const shape = new THREE.Shape(prof.map(([px, py]) => new THREE.Vector2(px, py)));
    const cap = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false, curveSegments: 4 }); cap.translate(0, 0, Ev.s[0] - 0.3); K.mesh(cap, m.white);
  }
  // ------------------------------------------------------------------ the cooking-studio block across the south end
  const St = M.studio, sTop = St.top, sf = (off) => studioS(off);
  { const ring = [[0, sf(0)], [E, sf(E)], [E, St.south], [0, St.south]];
    K.mesh(prismWalls(ring, y, sTop, { tile: 8 }), m.blue);
    K.mesh(capGeo(ring, sTop - 0.25, { tile: 6 }), m.roofTop);
    K.mesh(prismWalls(ring.map(([o, s]) => [o, s]), sTop - 0.25, sTop, { tile: 4 }), m.white);
    if (phys?.addBox) { const [x, z] = enu((sf(E / 2) + St.south) / 2, E / 2); phys.addBox(x, z, E, St.south - sf(E / 2), ROT, y, sTop + 1); }
    // the roof's guard rail along the north parapet (IMG_0798: visitors walk the studio roof), the louvred plant box, lamps
    const lenN = Math.hypot(E, sf(E) - sf(0)), rotN = Math.atan2(sf(E) - sf(0), E);
    const rr = K.box(lenN, 0.05, 0.05, m.rail, [E / 2, sTop + 1.1, (sf(0) + sf(E)) / 2 + 0.4]); rr.rotation.y = -rotN;
    for (let o = 0.4; o < E; o += 1.6) K.box(0.05, 1.1, 0.05, m.rail, [o, sTop + 0.55, sf(o) + 0.4]);
    const [la, lb] = [wallOf(...St.louvre.a), wallOf(...St.louvre.b)], Lw = Math.hypot(lb[1] - la[1], lb[0] - la[0]);
    const lv = K.box(Lw, St.louvre.y[1] - St.louvre.y[0], St.louvre.depth, m.grey, [(la[1] + lb[1]) / 2, (St.louvre.y[0] + St.louvre.y[1]) / 2, (la[0] + lb[0]) / 2 + St.louvre.depth / 2]); lv.rotation.y = -Math.atan2(lb[0] - la[0], lb[1] - la[1]);
    for (let q = 1; q < 8; q++) { const b = K.box(Lw + 0.05, 0.06, 0.05, m.frame, [(la[1] + lb[1]) / 2, St.louvre.y[0] + (St.louvre.y[1] - St.louvre.y[0]) * q / 8, (la[0] + lb[0]) / 2 - 0.03]); b.rotation.y = lv.rotation.y; }
    for (const L of St.lamps) { const [ls, lo] = wallOf(L[0], L[2]); K.cyl(0.07, 0.09, L[1] - sTop + 0.6, m.steel, [lo, (sTop + L[1] + 0.6) / 2, ls], null, 8); K.box(0.9, 0.7, 0.06, m.solar, [lo, L[1], ls - 0.1], [0.5, 0, 0]); K.box(0.04, 0.04, 1.2, m.white, [lo, L[1] + 0.75, ls]); K.box(0.04, 1.2, 0.04, m.white, [lo, L[1] + 0.75, ls]); }
    // the flagpole in the inside corner (IMG_0794 / 0798)
    K.cyl(0.05, 0.08, 9.5, m.steel, [0.6, sTop + 4.75, sf(0.6) + 0.5], null, 8);
    // north face: the windows (survey deck.studio.window), the door canopy, the sign and mascot
    const face = (off, h, out = 0.06) => [off, y + h, sf(off) - out];
    for (const Wd of St.windows) { const [ws, wo] = wallOf(...Wd.c); const h0 = Wd.h[0], h1 = Wd.h[1]; K.box(Wd.w + 0.1, h1 - h0 + 0.1, 0.08, m.frame, [wo, (h0 + h1) / 2, ws - 0.03], [0, -rotN, 0]); K.box(Wd.w - 0.06, h1 - h0 - 0.06, 0.06, m.win, [wo, (h0 + h1) / 2, ws - 0.05], [0, -rotN, 0]);
    }
    const Dr = St.door, dO = Dr.off, dW = Dr.w, cO = (Dr.canopy[0] + Dr.canopy[1]) / 2, cW = Dr.canopy[1] - Dr.canopy[0];
    K.box(dW, Dr.h, 0.08, m.door, face(dO, Dr.h / 2), [0, -rotN, 0]);
    for (let q = 0; q <= 4; q++) K.box(0.07, Dr.h, 0.1, m.frame, face(dO - dW / 2 + dW * q / 4, Dr.h / 2, 0.08), [0, -rotN, 0]);
    K.box(cW, Dr.canopyH[1] - Dr.canopyH[0], Dr.canopyOut, m.white, [cO, y + (Dr.canopyH[0] + Dr.canopyH[1]) / 2, sf(cO) - Dr.canopyOut / 2], [0, -rotN, 0]);
    const tx = textTex(ctx, 'クッキングスタジオ', { w: 1024, h: 128, color: '#f4f5f3', font: FONT.sans, weight: 900, size: 0.72 }), te = textTex(ctx, 'COOKING STUDIO', { w: 1024, h: 128, color: '#f4f5f3', font: FONT.sans, weight: 900, size: 0.72 });
    K.plane(4.4, 0.55, mapMat(ctx, 'decal', '#ffffff', tx, { transparent: true, alphaTest: 0.3 }), face(St.sign.off, St.sign.h[0], 0.08), [0, Math.PI - rotN, 0]);
    K.plane(3.6, 0.42, mapMat(ctx, 'decal', '#ffffff', te, { transparent: true, alphaTest: 0.3 }), face(St.sign.off, St.sign.h[1], 0.08), [0, Math.PI - rotN, 0]);
    const [ms, mo] = wallOf(St.mascot[0], St.mascot[2]); K.box(0.9, 1.5, 0.05, m.orange, [mo, St.mascot[1], ms - 0.06], [0, -rotN, 0]); K.sphere(0.32, m.white, [mo, St.mascot[1] + 0.85, ms - 0.1]);
  }
  // ------------------------------------------------------------------ the pavilions
  const P = M.pavilions, H = P.h, RF = P.roof;
  const pavRoof = (len, wid, outerAtMax) => {   // a roof plate along local z (0..len), across x (-wid/2..wid/2), top at pavRoofH
    const n = 40, pos = [], idx = [], push = (a, b, c) => idx.push(a, b, c);
    for (let i = 0; i <= n; i++) { const f = i / n, tt = outerAtMax ? f : 1 - f, h = pavRoofH(tt, RF), z = f * len;
      for (const [x, yy] of [[-wid / 2, h], [wid / 2, h], [wid / 2, h - RF.th], [-wid / 2, h - RF.th]]) pos.push(x, yy, z); }
    for (let i = 0; i < n; i++) { const a = i * 4, b = a + 4; push(a, b, a + 1); push(a + 1, b, b + 1); push(a + 3, a + 2, b + 3); push(a + 2, b + 2, b + 3); push(a, a + 3, b); push(a + 3, b + 3, b); push(a + 1, b + 1, a + 2); push(a + 2, b + 1, b + 2); }
    const e = n * 4; idx.push(0, 1, 2, 0, 2, 3, e, e + 2, e + 1, e, e + 3, e + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
  };
  P.list.forEach((pv, i) => {
    const [s0, s1] = pv.s, [o0, o1] = pv.o, L = s1 - s0, Wd = o1 - o0, cs = (s0 + s1) / 2, co = (o0 + o1) / 2, outerS = pv.outer === 'S';
    const base = y; K.box(Wd + 0.4, H.curb, L + 0.4, m.concrete, [co, base + H.curb / 2, cs]);
    K.box(Wd, H.plinth - H.curb, L, m.plinth, [co, base + (H.curb + H.plinth) / 2, cs]);
    K.box(Wd - 0.16, H.fascia - H.plinth, L - 0.16, m.glass, [co, base + (H.plinth + H.fascia) / 2, cs]);
    for (const [x, z, w, d] of [[o0, cs, 0.1, L], [o1, cs, 0.1, L], [co, s0, Wd, 0.1], [co, s1, Wd, 0.1]]) { K.box(w, 0.08, d, m.frame, [x, base + H.plinth + 0.04, z]); K.box(w, 0.07, d, m.frame, [x, base + 1.42, z]); }
    for (let z = s0; z <= s1 + 0.01; z += L / Math.max(1, Math.round(L / 1.35))) for (const x of [o0, o1]) K.box(0.1, H.glass - H.plinth, 0.1, m.frame, [x, base + (H.plinth + H.glass) / 2, z]);
    for (let x = o0; x <= o1 + 0.01; x += Wd / Math.max(1, Math.round(Wd / 1.35))) for (const z of [s0, s1]) K.box(0.1, H.glass - H.plinth, 0.1, m.frame, [x, base + (H.plinth + H.glass) / 2, z]);
    K.box(Wd + 0.12, H.fascia - H.glass, L + 0.12, m.grey, [co, base + (H.glass + H.fascia) / 2, cs]);
    const rl = L + RF.outer + RF.inner, rz0 = outerS ? s0 - RF.inner : s0 - RF.outer;
    const g = pavRoof(rl, Wd + 2 * RF.over, outerS); g.translate(co, base, rz0); K.mesh(g, m.greyD);
    if (phys?.addBox) { const [x, z] = enu(cs, co); phys.addBox(x, z, Wd, L, ROT, base, base + H.fascia); }
  });
  // the stacks: a white tube with a pointed cone cap and a collar, four stays to the deck
  for (const [s, off, tip] of M.stacks.list) {
    const R = M.stacks.r, hTop = tip - M.stacks.cone, ht = hTop - y;
    K.cyl(R, R * 1.05, ht, m.white, [off, y + ht / 2, s], null, 16);
    K.mesh(new THREE.ConeGeometry(R * 1.12, M.stacks.cone, 16), m.steel, [off, hTop + M.stacks.cone / 2, s]);
    K.cyl(R * 1.25, R * 1.25, 0.18, m.white, [off, y + M.stacks.collarH, s], null, 16); K.cyl(R * 1.18, R * 1.18, 0.12, m.white, [off, hTop - 0.05, s], null, 16);
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) { const ex = off + Math.cos(a) * 2.6, ez = s + Math.sin(a) * 2.6, hh = 3.0, L = Math.hypot(2.6, hh); const b = K.box(0.05, 0.05, L, m.white, [(off + ex) / 2, y + hh / 2, (s + ez) / 2]); b.rotation.order = 'YXZ'; b.rotation.set(Math.atan2(hh, 2.6), Math.atan2(ex - off, ez - s), 0); }
    if (phys?.addBox) { const [x, z] = enu(s, off); phys.addBox(x, z, 0.9, 0.9, ROT, y, tip); }
  }
  // the orange enclosed lifeboat on its trailer: a 5.3 x 2.3 m hull (its stencil), stern to the south (IMG_0793)
  { const LB = M.lifeboat, s1 = LB.stern, s0 = s1 - LB.L, c = (s0 + s1) / 2, o = LB.off, B = LB.B;
    K.box(1.5, 0.1, LB.L - 0.4, m.steel, [o, y + LB.keel - 0.08, c]); for (const sd of [-1, 1]) { K.box(0.1, 0.12, LB.L + 0.2, m.steel, [o + sd * 0.7, y + 0.3, c]); for (const zz of [s0 + 0.5, s1 - 0.5]) K.cyl(0.14, 0.14, 0.1, m.black, [o + sd * 0.75, y + 0.14, zz], [0, 0, Math.PI / 2], 10); }
    const hull = new THREE.CapsuleGeometry(B / 2, LB.L - B, 6, 16); hull.rotateX(Math.PI / 2); K.mesh(hull, m.orange, [o, y + LB.keel + (LB.sheer - LB.keel) / 2 + 0.05, c], null, [1, (LB.sheer - LB.keel + 0.1) / B, 1]);
    K.box(B + 0.06, 0.08, LB.L - 0.3, m.navy, [o, y + LB.sheer, c]);
    const cab = new THREE.CapsuleGeometry(B / 2 - 0.1, LB.L - B - 0.2, 6, 14); cab.rotateX(Math.PI / 2); K.mesh(cab, m.orange, [o, y + LB.sheer + 0.02, c - 0.1], null, [1, (LB.canopy - LB.sheer) * 2 / (B - 0.2), 1]);
    K.box(1.3, LB.top - LB.canopy + 0.2, 1.4, m.orange, [o, y + (LB.canopy + LB.top) / 2 - 0.1, s1 - 1.2]);
    for (const sd of [-1, 1]) K.box(0.05, 0.4, 0.45, m.win, [o + sd * (B / 2 - 0.05), y + 1.45, c - 0.6]);
    if (phys?.addBox) { const [x, z] = enu(c, o); phys.addBox(x, z, B, LB.L, ROT, y, y + LB.top); } }
  // cones (survey deck.cone#1-4)
  const cones = M.cones.map(([x, z]) => wallOf(x, z));
  for (const [s, off] of cones) { K.cyl(0.04, 0.16, 0.7, m.cone, [off, y + 0.37, s], null, 10); K.cyl(0.09, 0.12, 0.12, m.coneW, [off, y + 0.42, s], null, 10); K.box(0.4, 0.04, 0.4, m.black, [off, y + 0.02, s]); }
  // the photographed cars (IMG_0792-0798, 17:07): positions and headings in the wall frame
  let n = 0;
  for (const c of M.carsBuilt === false ? [] : M.cars || []) { const [x, z] = enu(c.s, c.o), f = { W: [-FR.n[0], -FR.n[1]], E: FR.n, N: [-FR.u[0], -FR.u[1]], S: FR.u }[c.face]; cars.push({ x, y, z, rot: Math.atan2(f[0], f[1]), color: c.color }); n++; }
  deckFeatures(ctx, { y, win, cones });
  return { deckY: y, penthouseTop: topMid, lowY, cars: n };
}

/** [v6:survey] The deck's named features as built (ENU metres), for tools/anime/survey-diff.mjs against the photo survey
 *  data/survey/market/features.json (names in docs/anime/survey/market.md). */
export function deckFeatures(ctx, { y, win, cones }) {
  const F = ctx.features; if (!F) return;
  const M = MODEL, W = M.wall, A = 'market', at = (s, off, yy) => { const [x, z] = enu(s, off); return [x, yy, z]; };
  const top = (s) => W.top[0] + (W.top[1] - W.top[0]) * (s - W.s[0]) / (W.s[1] - W.s[0]);
  F.add(A, 'deck.wall.n_base', at(W.s[0], 0, y)); F.add(A, 'deck.wall.n_top', at(W.s[0], 0, top(W.s[0])));
  F.add(A, 'deck.wall.s_base', at(W.s[1], 0, y)); F.add(A, 'deck.wall.s_top', at(W.s[1], 0, top(W.s[1])));
  const En = W.entrance;
  F.add(A, 'deck.entrance.jamb_n', at(En.door[0], 0, y)); F.add(A, 'deck.entrance.jamb_s', at(En.door[1], 0, y));
  F.add(A, 'deck.entrance.canopy_nn', at(En.canopy[0], En.canopyOut, y + En.canopyH[0] + 0.1)); F.add(A, 'deck.entrance.canopy_ss', at(En.canopy[1], 0, y + En.canopyH[0] + 0.1));
  W.letters.s.forEach((s, i) => F.add(A, `deck.letter.${i + 1}`, at(s, W.letters.out, y + W.letters.h[i])));
  F.group(A, 'deck.window', win.map((s) => at(s, 0, y + (W.windows.h0 + W.windows.h1) / 2)));
  F.group(A, 'deck.cone', cones.map(([s, off]) => at(s, off, y)));
  F.group(A, 'deck.stack', M.stacks.list.map(([s, off, tip]) => at(s, off, tip)));
  F.group(A, 'deck.pavilion', M.pavilions.list.map((p) => at((p.s[0] + p.s[1]) / 2, (p.o[0] + p.o[1]) / 2, y)));
  F.add(A, 'deck.lifeboat.end_n', [M.lifeboat.n[0], y, M.lifeboat.n[1]]); F.add(A, 'deck.lifeboat.end_s', [M.lifeboat.s[0], y, M.lifeboat.s[1]]);
  const St = M.studio;
  F.add(A, 'deck.studio.window', [St.windows[0].c[0], (St.windows[0].h[0] + St.windows[0].h[1]) / 2, St.windows[0].c[1]]);
  F.add(A, 'deck.studio.door', at(studioS(St.door.off), St.door.off, y)); F.add(A, 'deck.studio.mascot', St.mascot); F.add(A, 'deck.studio.louvre_nw', [St.louvre.a[0], St.louvre.y[1], St.louvre.a[1]]); F.add(A, 'deck.studio.louvre_ne', [St.louvre.b[0], St.louvre.y[1], St.louvre.b[1]]);
  F.dim(A, 'deck.y', y); F.dim(A, 'deck.wall_h', (W.top[0] + W.top[1]) / 2 - y); F.dim(A, 'deck.studio_h', St.top - y); F.dim(A, 'deck.wall_len', W.s[1] - W.s[0]);
  F.dim(A, 'deck.pavilions', M.pavilions.list.length); F.dim(A, 'deck.stacks', M.stacks.list.length); F.dim(A, 'deck.windows', win.length);
}
