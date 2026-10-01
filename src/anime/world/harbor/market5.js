// [v5:photos] 気仙沼市魚市場 C棟's roof deck from the author's photos (raw/photos-sailesh IMG_0792-0798, 2026-10-01 17:07 JST;
// GPS z ~ 1040 lies inside C棟 and the views look over the parapet to the bay, so the "apron" is the 3F roof deck, open
// to visitors with its car park). Called from harbor/market4.js's C棟 block in place of the v4 equipment boxes:
//   * the deck: weathered concrete slabs with saw-cut joints every ~5 m, a few yellow stall lines, red-and-white cones;
//   * a pale-blue penthouse along the land side of the deck (light blue metal panels with stepped joint lines, a row of
//     small framed windows, raised white letters 「気仙沼市魚市場」 along its east face, the visitors' entrance with a flat
//     canopy and handrails, a white low roof with a rounded eave), and the cross block at its south end with
//     「クッキングスタジオ COOKING STUDIO」 and a louvred plant box on top;
//   * a row of glazed observation pavilions ~12 m east of the penthouse with wave-shaped white roofs that sweep up at both
//     ends over a pale-blue base, and white rocket-like stacks with stays between them;
//   * the orange enclosed lifeboat on its trailer, and parked cars nose-in along the pavilion row (pushed into market4's
//     instanced car list).
// The penthouse wall line is fixed by IMG_0795 (the entrance 14 m from the camera at bearing 253) and runs along the hall's
// long axis (155 deg).
import * as THREE from 'three';
import { capGeo, prismWalls, offsetRing, obbOf, seg, barAlong, paint } from './lmkit.js';
import { mapMat, textTex, FONT } from './util.js';
import { nightMat } from './lights.js';

export const CROOF = { o: [704.6, 1043.8], d: [0.423, 0.906], n: [0.906, -0.423], s0: -50, s1: 50, depth: 16, h: 6.4, pav: [-65, -38.5, -12, 14.5, 41], pavOff: 20, lifeboat: [-4, 15.5] };
const P = (s, t) => [CROOF.o[0] + CROOF.d[0] * s + CROOF.n[0] * t, CROOF.o[1] + CROOF.d[1] * s + CROOF.n[1] * t];
const ROT = Math.atan2(CROOF.d[0], CROOF.d[1]);   // local +Z along the deck axis (SSE)

export function buildCRoofPhotos(ctx, k, { poly, roofY, cars, r }) {
  const t = (c, o) => ctx.mat.toon(c, o), phys = ctx.physics;
  const slab = paint(ctx, 'c5-slab', 512, 512, (g, w, h) => {   // 10 m tile: slabs 5 x 5 m with joints, stains
    g.fillStyle = '#b8ad98'; g.fillRect(0, 0, w, h);
    const rr = ctx.rng('c5slab');
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.09; g.fillStyle = rr() < 0.6 ? '#8d8371' : '#d2c8b4'; g.beginPath(); g.ellipse(rr() * w, rr() * h, 10 + rr() * 50, 6 + rr() * 30, rr() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#6f6759'; for (const v of [0, w / 2]) { g.fillRect(v, 0, 2, h); g.fillRect(0, v, w, 2); }
  }, [1, 1]);
  const panel = paint(ctx, 'c5-blue', 256, 256, (g, w, h) => {   // 8 m tile: pale-blue panels with stepped joint lines
    g.fillStyle = '#93b5d8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7a9cbf'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.25, h * 0.62); g.lineTo(w * 0.25, h * 0.48); g.lineTo(w * 0.75, h * 0.48); g.lineTo(w * 0.75, h * 0.62); g.lineTo(w, h * 0.62); g.stroke();
    g.beginPath(); g.moveTo(0, h * 0.2); g.lineTo(w, h * 0.2); g.stroke();
  }, [1, 1]);
  const m = {
    slab: mapMat(ctx, 'toon', '#ffffff', slab, { paint: 0.03, polygonOffset: -1 }), blue: mapMat(ctx, 'toon', '#ffffff', panel, { paint: 0.03 }),
    blueBase: t('#9dbbd6', { paint: 0.03 }), white: t('#f0f1ef', { paint: 0.03 }), whiteD: t('#eef0ee', { paint: 0.03, side: 'double' }), grey: t('#9da3a8', { paint: 0.03 }),
    frame: t('#7e868d', { paint: 0 }), rail: t('#b7bec4', { paint: 0 }), yellow: t('#e2b23c', { paint: 0.02, polygonOffset: -2 }), cone: t('#e0442e', { paint: 0.02 }),
    coneW: t('#f2f0ea', { paint: 0.02 }), black: t('#2a2b2e', { paint: 0 }), orange: t('#ef5a2a', { paint: 0.03 }), orangeD: t('#c4441f', { paint: 0.03 }),
    navy: t('#2c3a5c', { paint: 0.02 }), steel: t('#a9b0b6', { paint: 0 }),
    win: nightMat(ctx, '#4d5a66', '#ffe2b8', 1.2), glass: nightMat(ctx, '#8ea6b6', '#ffe8c8', 1.25), door: nightMat(ctx, '#a9b8b8', '#fff0d6', 1.5),
  };
  const y = roofY + 0.03;
  // ---- the deck surface (over the white roof cap) and a walk surface for the visitors
  k.mesh(capGeo(offsetRing(poly, -0.4), y, { tile: 10 }), m.slab);
  if (phys?.addWalkBox) { const o = obbOf(poly); phys.addWalkBox(o.cx, o.cz, o.w - 1, o.d - 1, o.rotY, y, roofY - 1); }
  // ---- the penthouse
  const ph = [P(CROOF.s0, 0), P(CROOF.s1, 0), P(CROOF.s1, -CROOF.depth), P(CROOF.s0, -CROOF.depth)];
  const top = y + CROOF.h;
  k.mesh(prismWalls(ph, y, top, { tile: 8 }), m.blue);
  k.mesh(prismWalls(offsetRing(ph, 0.05), y, y + 0.45, { tile: 4 }), m.blueBase);
  // low white roof with a rounded eave (IMG_0792, 0794)
  { const o = obbOf(ph), hw = o.w / 2 + 0.7, rise = 1.1; for (const sd of [-1, 1]) { const b = k.box(Math.hypot(hw, rise), 0.14, o.d + 1.4, m.whiteD, [o.cx + (-o.uz) * sd * hw / 2, top + rise / 2, o.cz + o.ux * sd * hw / 2]); b.rotation.order = 'YXZ'; b.rotation.set(0, o.rotY, sd * Math.atan2(rise, hw)); const e = k.cyl(0.28, 0.28, o.d + 1.4, m.white, [o.cx + (-o.uz) * sd * hw, top + 0.02, o.cz + o.ux * sd * hw], null, 10); e.rotation.order = 'YXZ'; e.rotation.set(Math.PI / 2, o.rotY, 0); }
    const gt = new THREE.BufferGeometry(), V = []; for (const se of [-1, 1]) { const bx = o.cx + o.ux * se * o.d / 2, bz = o.cz + o.uz * se * o.d / 2; V.push(bx + o.uz * o.w / 2, top, bz - o.ux * o.w / 2, bx - o.uz * o.w / 2, top, bz + o.ux * o.w / 2, bx, top + rise * (o.w / 2) / hw, bz); } gt.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); gt.computeVertexNormals(); k.mesh(gt, m.whiteD); }
  if (phys?.addBox) { const o = obbOf(ph); phys.addBox(o.cx, o.cz, o.w, o.d, o.rotY, y, top + 1.2); }
  // the east face: windows, raised letters, the entrance with its canopy and handrails
  const nE = CROOF.n, ryE = Math.atan2(nE[0], nE[1]);
  for (let s = CROOF.s0 + 3; s < CROOF.s1 - 3; s += 4.3) { if (Math.abs(s + 3) < 3) continue; const [x, z] = P(s, 0.06); k.box(1.25, 1.15, 0.06, m.frame, [x, y + 1.85, z], [0, ryE, 0]); k.box(1.1, 1.0, 0.08, m.win, [x + nE[0] * 0.02, y + 1.85, z + nE[1] * 0.02], [0, ryE, 0]); }
  const letters = [['気', 16], ['仙', 10.5], ['沼', 5], ['市', -0.5], ['魚', -6], ['市', -11.5], ['場', -17]];
  for (const [ch, s] of letters) {
    const tex = textTex(ctx, ch, { w: 256, h: 256, color: '#f6f6f3', font: FONT.sans, weight: 700, size: 0.92 }), sh = textTex(ctx, ch, { w: 256, h: 256, color: '#6c8299', font: FONT.sans, weight: 700, size: 0.92 });
    const [x, z] = P(s, 0.22), [xs, zs] = P(s + 0.07, 0.12);
    k.plane(2.7, 2.7, mapMat(ctx, 'decal', '#ffffff', sh, { transparent: true, alphaTest: 0.3 }), [xs, y + 4.62, zs], [0, ryE, 0]);
    k.plane(2.7, 2.7, mapMat(ctx, 'decal', '#ffffff', tex, { transparent: true, alphaTest: 0.3 }), [x, y + 4.7, z], [0, ryE, 0]);
  }
  { const [x, z] = P(-3, 0.08); k.box(3.4, 2.6, 0.1, m.door, [x, y + 1.3, z], [0, ryE, 0]); const [cx, cz] = P(-3, 1.1); k.box(4.6, 0.14, 2.2, m.white, [cx, y + 3.0, cz], [0, ryE, 0]); for (const sd of [-1, 1]) { const a = P(-3 + sd * 2.6, 1.6), b = P(-3 + sd * 9, 1.6); barAlong(k, a, b, y + 0.95, 0.06, 0.06, m.rail); for (let f = 0; f <= 1; f += 0.25) { const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; k.box(0.05, 0.95, 0.05, m.rail, [p[0], y + 0.48, p[1]]); } } }
  // ---- the cooking-studio cross block at the south end
  { const cb = [P(CROOF.s1 - 7, 0), P(CROOF.s1, 0), P(CROOF.s1, 14), P(CROOF.s1 - 7, 14)];
    k.mesh(prismWalls(cb, y, top, { tile: 8 }), m.blue); k.mesh(capGeo(cb, top + 0.02, { tile: 4 }), m.white); k.mesh(prismWalls(offsetRing(cb, 0.05), top - 0.2, top + 0.4, { tile: 4 }), m.white);
    const nN = [-CROOF.d[0], -CROOF.d[1]], ryN = Math.atan2(nN[0], nN[1]), [ex, ez] = P(CROOF.s1 - 7.06, 7);
    k.box(3.0, 2.5, 0.1, m.door, [ex, y + 1.25, ez], [0, ryN, 0]); k.box(4.0, 0.12, 1.6, m.white, [ex - nN[0] * -0.8, y + 2.8, ez - nN[1] * -0.8], [0, ryN, 0]);
    const tx = textTex(ctx, 'クッキングスタジオ', { w: 1024, h: 128, color: '#2c3a5c', font: FONT.sans, weight: 900, size: 0.7 }), te = textTex(ctx, 'COOKING STUDIO', { w: 1024, h: 128, color: '#2c3a5c', font: FONT.sans, weight: 900, size: 0.7 });
    k.plane(4.6, 0.58, mapMat(ctx, 'decal', '#ffffff', tx, { transparent: true, alphaTest: 0.3 }), [ex + nN[0] * 0.1, y + 3.55, ez + nN[1] * 0.1], [0, ryN, 0]);
    k.plane(3.4, 0.42, mapMat(ctx, 'decal', '#ffffff', te, { transparent: true, alphaTest: 0.3 }), [ex + nN[0] * 0.1, y + 3.1, ez + nN[1] * 0.1], [0, ryN, 0]);
    const [bx, bz] = P(CROOF.s1 - 3.5, 6); k.box(6.5, 2.6, 4.0, m.grey, [bx, top + 1.3, bz], [0, ROT, 0]); for (let i = -2; i <= 2; i++) { const [lx, lz] = P(CROOF.s1 - 3.5 + i * 1.2, 3.95); k.box(0.08, 2.2, 0.12, m.frame, [lx, top + 1.3, lz]); }
    const [mx, mz] = P(CROOF.s1 - 6, 13); k.cyl(0.05, 0.06, 7.5, m.steel, [mx, top + 3.75, mz], null, 6);
    if (phys?.addBox) { const o = obbOf(cb); phys.addBox(o.cx, o.cz, o.w, o.d, o.rotY, y, top + 1); } }
  // ---- the observation pavilions and the stacks
  const stack = (s, t2) => { const [x, z] = P(s, t2); k.cyl(0.32, 0.36, 7.6, m.white, [x, y + 3.8, z], null, 14); k.mesh(new THREE.ConeGeometry(0.33, 1.1, 14), m.white, [x, y + 8.15, z]); k.cyl(0.4, 0.4, 0.3, m.white, [x, y + 5.6, z], null, 14); for (const a of [0.5, 2.6, 4.7]) { const ex = x + Math.cos(a) * 3.2, ez = z + Math.sin(a) * 3.2, ss = seg([x, z], [ex, ez]), L = Math.hypot(ss.len, 5.2), b = k.box(0.04, 0.04, L, m.steel, [(x + ex) / 2, y + 2.6, (z + ez) / 2]); b.rotation.order = 'YXZ'; b.rotation.set(Math.atan2(5.2, ss.len), ss.rotY, 0); } phys?.addBox?.(x, z, 0.8, 0.8, 0, y, y + 8); };
  for (const s of CROOF.pav) {
    const g = k.group([...[P(s, CROOF.pavOff)[0]], y, P(s, CROOF.pavOff)[1]], ROT), kk = ctx.kit(g), L = 11, W = 6.4;
    kk.box(W, 1.0, L, m.blueBase, [0, 0.5, 0]); kk.box(W - 0.3, 2.3, L - 0.3, m.glass, [0, 2.15, 0]);
    for (let z = -L / 2; z <= L / 2 + 0.01; z += L / 6) for (const xs of [-W / 2, W / 2]) kk.box(0.1, 2.3, 0.1, m.frame, [xs, 2.15, z]);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 3) for (const zs of [-L / 2, L / 2]) kk.box(0.1, 2.3, 0.1, m.frame, [x, 2.15, zs]);
    kk.box(W + 0.1, 0.5, L + 0.1, m.grey, [0, 3.55, 0]);
    // the wave roof: a slab whose ends sweep up (IMG_0793, 0797)
    const N = 16, pos = [], idx = [], hw = W / 2 + 1.0, hl = L / 2 + 1.6;
    for (let i = 0; i <= N; i++) { const zz = -hl + 2 * hl * i / N, f = zz / hl, yy = 4.0 + 0.9 * f * f * f * f + 0.15 * (1 - f * f); for (const xx of [-hw, hw]) pos.push(xx, yy, zz); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals(); kk.mesh(rg, m.whiteD);
    const eg = rg.clone(); eg.translate(0, -0.22, 0); kk.mesh(eg, m.grey);
    if (phys?.addBox) { const [px, pz] = P(s, CROOF.pavOff); phys.addBox(px, pz, W, L, ROT, y, y + 4.2); }
  }
  for (let i = 0; i <= CROOF.pav.length; i++) { const s = i < CROOF.pav.length ? CROOF.pav[i] - 13.25 : CROOF.pav[CROOF.pav.length - 1] + 13.25; stack(s, CROOF.pavOff); }
  // ---- the orange enclosed lifeboat on its trailer
  { const [x, z] = P(...CROOF.lifeboat), g = k.group([x, y, z], ROT), kk = ctx.kit(g);
    kk.box(2.0, 0.12, 6.4, m.steel, [0, 0.55, 0]); for (const sd of [-1, 1]) { kk.box(0.12, 0.5, 6.4, m.steel, [sd * 0.9, 0.3, 0]); for (const zz of [-2.4, 2.4]) kk.cyl(0.22, 0.22, 0.14, m.black, [sd * 1.05, 0.22, zz], [0, 0, Math.PI / 2], 10); }
    const hull = new THREE.CapsuleGeometry(1.25, 4.6, 6, 14); hull.rotateX(Math.PI / 2); kk.mesh(hull, m.orange, [0, 1.75, 0], null, [1, 0.62, 1]);
    kk.box(2.3, 0.14, 7.2, m.navy, [0, 1.42, 0]);
    const cab = new THREE.CapsuleGeometry(1.0, 3.2, 6, 12); cab.rotateX(Math.PI / 2); kk.mesh(cab, m.orange, [0, 2.45, -0.2], null, [1, 0.85, 1]);
    kk.box(1.0, 0.9, 1.0, m.orangeD, [0, 3.35, -1.8]); for (const sd of [-1, 1]) { kk.box(0.06, 0.6, 0.6, m.white, [sd * 1.06, 2.5, 0.6]); kk.box(0.06, 0.45, 0.45, m.win, [sd * 1.08, 2.5, 0.6]); }
    phys?.addBox?.(x, z, 2.6, 7.4, ROT, y, y + 3.8); }
  // ---- cones and yellow stall lines; cars nose-in along the pavilion row (west side) and along the penthouse
  for (const [s, t2] of [[-1, 9.5], [-2.5, 11.2], [-4, 12.9], [-1.5, 6], [6, 6], [-9, 4.5]]) { const [x, z] = P(s, t2); k.cyl(0.04, 0.17, 0.7, m.cone, [x, y + 0.37, z], null, 10); k.cyl(0.09, 0.12, 0.12, m.coneW, [x, y + 0.42, z], null, 10); k.box(0.42, 0.04, 0.42, m.black, [x, y + 0.02, z]); }
  for (let s = CROOF.s0 + 2; s < CROOF.s1 - 9; s += 2.5) { const a = P(s, 1.0), b = P(s, 5.2); barAlong(k, a, b, y + 0.012, 0.12, 0.01, m.yellow); }
  let n = 0;
  for (let s = -76; s < 52; s += 2.5) {
    if (CROOF.pav.some((p) => Math.abs(p - s) < 6.6) || Math.abs(s - CROOF.lifeboat[0]) < 6 || r() > 0.55) continue;
    const [x, z] = P(s, CROOF.pavOff - 5.8); cars.push({ x, y, z, rot: Math.atan2(CROOF.n[0], CROOF.n[1]) + r.range(-0.04, 0.04) }); n++;
  }
  for (let s = CROOF.s0 + 3.25; s < CROOF.s1 - 9; s += 2.5) { if (Math.abs(s + 3) < 6 || r() > 0.4) continue; const [x, z] = P(s, 3.1); cars.push({ x, y, z, rot: Math.atan2(-CROOF.n[0], -CROOF.n[1]) + r.range(-0.04, 0.04) }); n++; }
  return { deckY: y, penthouseTop: top, cars: n };
}
