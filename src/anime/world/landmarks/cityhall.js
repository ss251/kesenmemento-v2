// [v4:landmarks-B] 気仙沼市役所 (docs/anime/landmarks/city-hall.md).
//   八日町 campus, on the OSM outlines:
//     本庁舎 (way 602638650, 3 storeys, 1960): a beige-grey rendered RC block on its terrace (T.P. 10.6) with ribbon
//       windows of green-tinted glass, a rooftop penthouse and two lattice radio masts, the entrance canopy, the
//       vertical 「気仙沼市役所」 plate at the gate, a pine and a hedge (Commons "Kesennuma City Hall 01.JPG")
//     第二庁舎 (way 819508286, 1909): the two-storey former wooden school, dark weathered siding, white sash windows,
//       a long grey gable roof; 第三庁舎 (1974), 東分庁舎 and 第二東分庁舎 (1960): low rendered blocks
//     ワン・テン庁舎 (way 631751376, 4 levels, 1999): a mauve two-storey base with a teal band and shop windows, two
//       open parking decks above in grey concrete, and the corner tower with the 「One-Ten」 script logo
//   田中: the new city hall under construction on the old city-hospital site (実施設計説明書 2024-09): the B1/1F
//     base, the 2–4F steel frame with the first white cement-panel bands, scaffold sheeting, a crawler crane and the
//     site offices. Completion October 2027; the site is dressed as it stands in September 2026 (frame up, not clad).
import * as THREE from 'three';
import { OSM, SPEC, NEW_CITY_HALL } from './sites.js';
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, paintWindow, pitchedRoof, flatRoof, colliders, sign, vsign, capGeo, prismWalls, mapMat, textTex, FONT, nightMat, offsetRing, edges, treeClump } from './kit.js';

export function buildCityHall(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  const { k } = group(ctx, 'lmB-cityhall');
  const out = {};

  // ---------------------------------------------------------------- 本庁舎
  {
    const sp = SPEC.cityHall, poly = OSM.cityHall.poly, o = obbOf(poly), gs = groundSpan(L, poly);
    const y0 = gs.lo + 0.3, top = y0 + sp.storeys * sp.fh;   // the DEM floor at the street front (8.4); the hill rises 3 m behind
    const fac = facadeMat(ctx, 'cityhall', { draw: paintWindow({ wall: sp.wall, frame: '#dedcd4', glass: ['#46625f', '#9bb5ae'], win: [0.07, 0.3, 0.93, 0.8], mull: 2, sill: '#b8b3a8', curtain: '#e8e4d8' }), win: [0.07, 0.3, 0.93, 0.8], lit: 0.35 });
    const plinth = t('#a9a59b', { paint: 0.06 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), plinth);
    k.mesh(wallGeo(poly, y0, top, { tu: 3.4, tv: sp.fh, yRef: y0 }), fac);
    flatRoof(k, poly, top, t(sp.roof, { paint: 0.04 }), t(sp.wall, { paint: 0.02 }), 0.9);
    // penthouse (stair + lift) and two lattice radio masts
    const pc = obbPt(o, 6, -2);
    const P = k.group([pc[0], top, pc[1]], o.rotY), kp = ctx.kit(P);
    kp.boxB(7.5, 3.4, 9, t(sp.wall, { paint: 0.03 }), [0, 0, 0]);
    kp.box(7.6, 0.2, 9.1, t('#b9b6ad', { paint: 0 }), [0, 3.5, 0]);
    for (const z of [-2.5, 0, 2.5]) kp.box(0.05, 1.1, 1.6, nightMat(ctx, '#5f7773', '#ffd9a0', 1.1), [3.77, 2.0, z]);
    for (const [mx, mz, h] of [[4, 18, 13], [3, -14, 10]]) {
      const mp = obbPt(o, mx, mz), M = k.group([mp[0], top, mp[1]], o.rotY), km = ctx.kit(M), st = t('#8a8f98', { paint: 0 });
      for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) km.box(0.08, h, 0.08, st, [a, h / 2, b]);
      for (let y = 1; y < h; y += 1.4) { km.box(0.9, 0.05, 0.05, st, [0, y, -0.45]); km.box(0.9, 0.05, 0.05, st, [0, y, 0.45]); km.box(0.05, 0.05, 0.9, st, [-0.45, y, 0]); km.box(0.05, 0.05, 0.9, st, [0.45, y, 0]); }
      km.box(0.05, 2.2, 0.05, st, [0, h + 1.1, 0]);
    }
    // entrance: canopy on two posts, glass doors, the vertical name plate at the gate, a pine and a hedge
    const ec = obbPt(o, o.w / 2, 4), E = k.group([ec[0], y0, ec[1]], o.rotY), ke = ctx.kit(E);
    ke.box(5.5, 0.35, 7, t('#bfbcb3', { paint: 0.02 }), [2.8, 3.3, 0]);
    for (const z of [-3, 3]) ke.box(0.3, 3.2, 0.3, t('#9a978f', { paint: 0 }), [5.2, 1.6, z]);
    ke.box(0.1, 2.5, 4.0, nightMat(ctx, '#7b95a0', '#ffe0b0', 1.3), [0.06, 1.25, 0]);
    const gate = obbPt(o, o.w / 2 + 8.5, 10);
    vsign(ctx, k, '気仙沼市役所', 0.5, 2.6, gate[0], y0 + 1.6, gate[1], o.rotY + Math.PI / 2, { bg: '#f4f1e8' });
    k.box(0.7, 3.0, 0.3, t('#a9a59b', { paint: 0.05 }), [gate[0] - Math.sin(o.rotY + Math.PI / 2) * 0.2, y0 + 1.5, gate[1] - Math.cos(o.rotY + Math.PI / 2) * 0.2], [0, o.rotY + Math.PI / 2, 0]);
    const pine = obbPt(o, o.w / 2 + 6, 16);
    treeClump(ctx, k, pine[0], y0, pine[1], 1.2, { leaf: '#3f5f45', leafLit: '#577a55', conifer: false });
    const hg = obbPt(o, o.w / 2 + 7.5, -6); k.box(1.2, 1.0, 12, t('#4f7a47', { paint: 0.1 }), [hg[0], y0 + 0.5, hg[1]], [0, o.rotY, 0]);
    colliders(ctx, poly, gs.lo - 2, top + 1);
    out.main = { x: ec[0], z: ec[1], y: y0 };
  }
  // ---------------------------------------------------------------- 第二庁舎: the former wooden school (1909)
  {
    const sp = SPEC.cityHall2, poly = OSM.cityHall2.poly, o = obbOf(poly), gs = groundSpan(L, poly);
    const y0 = gs.lo + 0.4, top = y0 + sp.storeys * sp.fh;
    const siding = (g, W, H) => {
      g.fillStyle = sp.wall; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) { g.fillStyle = y % 12 ? '#564d42' : '#665c4f'; g.fillRect(0, y, W, 5); g.fillStyle = '#463e35'; g.fillRect(0, y + 5, W, 1); }
      const X0 = W * 0.2, X1 = W * 0.8, Y0 = H * 0.2, Y1 = H * 0.72;
      g.fillStyle = '#e9e6dc'; g.fillRect(X0 - 3, Y0 - 3, X1 - X0 + 6, Y1 - Y0 + 6);
      const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#61788a'); gr.addColorStop(1, '#adbfca'); g.fillStyle = gr; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      g.fillStyle = '#e9e6dc'; g.fillRect((X0 + X1) / 2 - 1.5, Y0, 3, Y1 - Y0); g.fillRect(X0, (Y0 + Y1) / 2 - 1.5, X1 - X0, 3);
    };
    const fac = facadeMat(ctx, 'cityhall2', { draw: siding, win: [0.2, 0.28, 0.8, 0.8], lit: 0.3 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#8f8a80', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, top, { tu: 2.7, tv: sp.fh, yRef: y0 }), fac);
    // the main gable roof over the long bar (local x −4.4..7.4) and flat caps over the stair bays that stand out
    const core = { cx: 0, cz: 0, w: 11.8, d: 47.6 }; const cc = obbPt(o, 1.5, 0);
    const ro = { ...o, cx: cc[0], cz: cc[1], w: core.w, d: core.d };
    const R = pitchedRoof(ro, top, { kind: 'gable', pitch: 0.55, over: 0.7 });
    const rm = t(sp.roof, { paint: 0.05 });
    k.mesh(R.roof, rm); k.mesh(R.fascia, t('#5a6266', { paint: 0 })); if (R.gables) k.mesh(R.gables, t(sp.wall, { paint: 0.03 }));
    for (const z of [-15, -4, 14.2, 20]) { const c = obbPt(o, -6.4, z); k.box(4.4, 0.25, 5.6, rm, [c[0], top + 0.1, c[1]], [0, o.rotY, 0]); }
    colliders(ctx, poly, gs.lo - 2, top + 1);
  }
  // ---------------------------------------------------------------- 第三庁舎, 東分庁舎, 第二東分庁舎
  for (const id of ['cityHall3', 'cityHallE', 'cityHallE2']) {
    const sp = SPEC[id], poly = OSM[id].poly, gs = groundSpan(L, poly), y0 = gs.lo + 0.3, top = y0 + sp.storeys * sp.fh;
    const fac = facadeMat(ctx, 'ch-' + id, { draw: paintWindow({ wall: sp.wall, frame: '#e2e0d8', glass: ['#566f7a', '#a4b8c2'], win: [0.14, 0.32, 0.86, 0.8], mull: 1, sill: '#b5b0a5' }), win: [0.14, 0.32, 0.86, 0.8], lit: 0.3 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a39f95', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, top, { tu: 3.2, tv: sp.fh, yRef: y0 }), fac);
    if (id === 'cityHallE') { const o = obbOf(poly), R = pitchedRoof(o, top, { kind: 'hip', pitch: 0.3, over: 0.5 }); k.mesh(R.roof, t(sp.roof, { paint: 0.05 })); k.mesh(R.fascia, t('#8a7a72', { paint: 0 })); }
    else flatRoof(k, poly, top, t(sp.roof, { paint: 0.04 }), t(sp.wall, { paint: 0.02 }), 0.7);
    colliders(ctx, poly, gs.lo - 2, top + 1);
  }
  // ---------------------------------------------------------------- ワン・テン庁舎
  {
    const sp = SPEC.oneTen, poly = OSM.oneTen.poly, o = obbOf(poly), gs = groundSpan(L, poly);
    const y0 = gs.lo + 0.2, f2 = y0 + 2 * 3.5, top = f2 + 2 * 2.9;
    const base = facadeMat(ctx, 'oneten', { draw: (g, W, H) => {
      g.fillStyle = sp.base; g.fillRect(0, 0, W, H);
      g.fillStyle = sp.band; g.fillRect(0, H * 0.02, W, H * 0.07);
      const X0 = W * 0.08, X1 = W * 0.92, Y0 = H * 0.16, Y1 = H * 0.8;
      g.fillStyle = '#e6dfe0'; g.fillRect(X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4);
      const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#5c7488'); gr.addColorStop(1, '#b6c6d0'); g.fillStyle = gr; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    }, win: [0.08, 0.2, 0.92, 0.84], lit: 0.55 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a09a94', { paint: 0.05 }));
    k.mesh(wallGeo(poly, y0, f2, { tu: 4.5, tv: 3.5, yRef: y0 }), base);
    // the parking decks: slab edges and solid parapet bands with the dark open storey between
    const deck = t(sp.deck, { paint: 0.07 }), dark = t('#4a4d55', { paint: 0 });
    const inner = offsetRing(poly, -0.6);
    for (let i = 0; i < 2; i++) {
      const yb = f2 + i * 2.9;
      k.mesh(prismWalls(poly, yb, yb + 1.1, { tile: 3 }), deck);
      k.mesh(prismWalls(inner, yb + 1.1, yb + 2.9, { tile: 3 }), dark);
      for (const e of edges(poly)) for (let s = 4; s < e.len - 1; s += 8.5) k.box(0.5, 1.8, 0.5, deck, [e.a[0] + e.ux * s - e.n[0] * 0.3, yb + 2.0, e.a[1] + e.uz * s - e.n[1] * 0.3]);
    }
    k.mesh(prismWalls(poly, top, top + 1.1, { tile: 3 }), deck);
    k.mesh(capGeo(poly, top + 0.02, { tile: 3 }), t('#a7a8a6', { paint: 0.05 }));
    // roof-deck parking: white stall lines and a few parked cars (kei and sedans in the town's colours)
    const lines = t('#f2f2ee', { paint: 0 }), cars = ['#e8e8e4', '#3d4f6a', '#9c2f33', '#c9cbd0', '#2d2f36'];
    for (let i = -3; i <= 3; i++) { const c = obbPt(o, i * 5.6, 8); k.box(0.12, 0.02, 5.2, lines, [c[0], top + 0.05, c[1]], [0, o.rotY, 0]); const c2 = obbPt(o, i * 5.6, -12); k.box(0.12, 0.02, 5.2, lines, [c2[0], top + 0.05, c2[1]], [0, o.rotY, 0]); }
    for (const [i, z, ci] of [[-2.5, 8, 0], [0.5, 8, 1], [1.5, -12, 2], [-1.5, -12, 3], [2.5, 8, 4]]) { const c = obbPt(o, i * 5.6, z); const C = k.group([c[0], top + 0.05, c[1]], o.rotY), kc = ctx.kit(C); kc.boxB(1.75, 0.8, 4.3, t(cars[ci], { paint: 0.02 }), [0, 0.15, 0]); kc.boxB(1.55, 0.55, 2.2, t('#44546a', { paint: 0 }), [0, 0.95, -0.2]); }
    // the corner tower with the One-Ten logo (NE corner of the outline)
    const tc = obbPt(o, o.w / 2 - 3, o.d / 2 - 3);
    const T = k.group([tc[0], y0, tc[1]], o.rotY), kt = ctx.kit(T);
    kt.boxB(5.2, top - y0 + 4.2, 5.2, t('#ece8e2', { paint: 0.02 }), [0, 0, 0]);
    kt.boxB(5.3, 0.6, 5.3, t(sp.band, { paint: 0 }), [0, top - y0 + 3.6, 0]);
    const logo = ctx.tex.draw(512, 256, (g, W, H) => { g.fillStyle = '#ece8e2'; g.fillRect(0, 0, W, H); g.fillStyle = '#3f8f94'; g.font = `italic 700 118px ${FONT.en || 'serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('One-Ten', W / 2, H * 0.45); g.fillStyle = '#6d5a60'; g.font = `700 34px ${FONT.sans}`; g.fillText('気仙沼市役所 ワン・テン庁舎', W / 2, H * 0.82); }, { key: 'lmB-oneten-logo' });
    const lm = mapMat(ctx, 'toon', '#ffffff', logo, { paint: 0 });
    for (const [rx, px, pz] of [[0, 0, 2.62], [Math.PI / 2, 2.62, 0], [-Math.PI / 2, -2.62, 0]]) kt.plane(4.6, 2.3, lm, [px, top - y0 + 1.6, pz], [0, rx, 0]);
    colliders(ctx, poly, gs.lo - 2, top + 2);
    out.oneTen = { x: tc[0], z: tc[1] };
  }
  // ---------------------------------------------------------------- 田中: the new city hall under construction
  out.newCityHall = buildNewCityHall(ctx, k, t);
  return out;
}

function buildNewCityHall(ctx, k, t) {
  const L = ctx.L, N = NEW_CITY_HALL;
  const P = (lx, lz) => [N.corner[0] + lx * N.X[0] + lz * N.Z[0], N.corner[1] + lx * N.X[1] + lz * N.Z[1]];
  const rotY = Math.atan2(N.Z[0], N.Z[1]);   // local +Z of the plan (south) as the group's +Z
  const b = N.box, pd = N.podium;
  const cBox = P(b.x0 - b.w / 2, b.z0 - b.d / 2);
  // floor levels (T.P.): B1 at the street / plaza (≈ 5.0), 1F = 9.45, 2F–4F, the roof; the building is 24.75 m high
  const yB1 = 5.0, y1 = N.fl1, ys = [y1 + 4.85, y1 + 9.3, y1 + 13.75], yR = y1 + 18.3, yTop = yB1 + N.height;
  const G = k.group([cBox[0], 0, cBox[1]], rotY), kk = ctx.kit(G);   // local +x = plan east, +z = plan south
  const steel = t('#8b6f5c', { paint: 0.03 }), steelGrey = t('#6f757e', { paint: 0 }), deck = t('#9ea3a8', { paint: 0.04 }), conc = t('#bdbab2', { paint: 0.06 });
  const ecp = t('#f1f1ee', { paint: 0.02 }), glass = nightMat(ctx, '#7f98aa', '#ffe0b4', 1.2);
  const W2 = b.w / 2, D2 = b.d / 2;
  // B1/1F base: concrete walls cast, the glazing not in yet (dark openings on the plaza sides), the 1F deck
  {
    const bw = b.w + 2 * pd.grow, bd = b.d + 2 * pd.grow + pd.south, zc = pd.south / 2;
    const ring = [[-bw / 2, zc - bd / 2], [bw / 2, zc - bd / 2], [bw / 2, zc + bd / 2], [-bw / 2, zc + bd / 2]];
    kk.mesh(prismWalls(ring, yB1 - 1.5, y1, { tile: 3 }), conc);
    kk.box(bw - 0.8, 0.3, bd - 0.8, deck, [0, y1 - 0.15, zc]);
    for (const [x, z, w, d] of [[0, zc + bd / 2 + 0.02, bw - 6, 0.05], [bw / 2 + 0.02, zc + 8, 0.05, bd - 22]]) kk.box(w, y1 - yB1 - 1.6, d, t('#3d424a', { paint: 0 }), [x, yB1 + (y1 - yB1 - 1.6) / 2 + 0.4, z]);
  }
  // columns on the plan grid (X: 6.2, 6.2, 7.8 ×4; Y: 7.8 ×2, 6.2 ×6) from 1F to the roof, beams at every floor
  const xs = [0, 6.2, 12.4, 20.2, 28, 35.8, 43.6].map((x) => x - 43.6 / 2);
  const zs = [0, 7.8, 15.6, 21.8, 28, 34.2, 40.4, 46.6, 52.8].map((z) => z - 52.8 / 2);
  for (const x of xs) for (const z of zs) kk.boxB(0.5, yR - y1, 0.5, steel, [x, y1, z]);
  for (const y of [...ys, yR]) {
    for (const x of xs) kk.box(0.3, 0.7, zs.at(-1) - zs[0], steel, [x, y - 0.35, 0]);
    for (const z of zs) kk.box(xs.at(-1) - xs[0], 0.7, 0.3, steel, [0, y - 0.35, z]);
    if (y < yR) kk.box(b.w - 0.8, 0.2, b.d - 0.8, deck, [0, y - 0.05, 0]);   // deck plates poured on 2F–4F
  }
  // the first white extruded-cement-panel bands on the south and east faces of 2F, windows framed
  for (const [face, len] of [['s', b.w], ['e', b.d]]) {
    const G2 = kk.group(face === 's' ? [0, 0, D2 + 0.3] : [W2 + 0.3, 0, 0], face === 's' ? 0 : Math.PI / 2), k2 = ctx.kit(G2);
    k2.box(len, 1.4, 0.2, ecp, [0, ys[0] + 0.7, 0]);
    k2.box(len, 1.0, 0.2, ecp, [0, ys[1] - 0.6, 0]);
    k2.box(len - 1, ys[1] - ys[0] - 2.8, 0.06, glass, [0, (ys[0] + ys[1]) / 2 + 0.2, -0.05]);
  }
  // scaffold with mesh sheeting on the north and west faces (grey-white 養生シート on a pipe frame)
  const sheet = t('#dfe3e4', { paint: 0.04, side: 'double' }), pipe = t('#9aa0a8', { paint: 0 });
  for (const [x, z, len, ry] of [[0, -D2 - 1.2, b.w + 2.4, 0], [-W2 - 1.2, 0, b.d + 2.4, Math.PI / 2]]) {
    const S = kk.group([x, 0, z], ry), ks = ctx.kit(S);
    ks.box(len, yR + 1.5 - y1, 0.05, sheet, [0, (y1 + yR + 1.5) / 2, 0]);
    for (let s = -len / 2; s <= len / 2; s += 1.8) ks.box(0.05, yR + 1.5 - y1, 0.05, pipe, [s, (y1 + yR + 1.5) / 2, 0.4]);
  }
  // the crawler crane on the east side, its boom over the frame
  const cc = [W2 + 12, D2 - 18];
  const Cr = kk.group([cc[0], y1 - 0.4, cc[1]], 0.4), kc = ctx.kit(Cr);
  kc.boxB(4.5, 1.2, 7.5, t('#3b3f47', { paint: 0 }), [0, 0, 0]);
  kc.boxB(3.4, 2.8, 4.6, t('#e7c23a', { paint: 0.02 }), [0, 1.2, 0]);
  const boom = new THREE.Group(); boom.position.set(0, 3.2, -1.8); boom.rotation.x = 1.0; Cr.add(boom);
  const kb = ctx.kit(boom);
  for (const [a, c] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) kb.box(0.14, 0.14, 38, t('#e7c23a', { paint: 0 }), [a, c, -19]);
  for (let s = 1; s < 38; s += 2.4) kb.box(1.3, 0.08, 0.08, t('#e7c23a', { paint: 0 }), [0, 0.6, -s]);
  // two-storey site offices (white prefab) and the contractor board at the plaza corner
  const off = kk.group([-W2 - 20, y1 - 1.5, D2 + 10], 0), ko = ctx.kit(off);
  for (let f = 0; f < 2; f++) { ko.boxB(14, 2.6, 5.4, t('#f0f0ec', { paint: 0.02 }), [0, f * 2.7, 0]); for (let i = -2; i <= 2; i++) ko.box(1.4, 0.9, 0.05, glass, [i * 2.6, f * 2.7 + 1.5, 2.72]); }
  ko.box(14.4, 0.12, 1.2, t('#9aa0a8', { paint: 0 }), [0, 2.75, 3.2]);
  const bd = P(-2, 4);
  sign(ctx, k, '気仙沼市新庁舎建設工事  2027年10月完成予定', 7.0, 1.1, bd[0], L.heightAt(bd[0], bd[1]) + 2.4, bd[1], rotY, { color: '#1e3150', bg: '#f3f2ec' });
  const gx0 = b.x0 + pd.grow, gx1 = b.x0 - b.w - pd.grow, gz0 = b.z0 + pd.grow + pd.south, gz1 = b.z0 - b.d - pd.grow;
  const base = [P(gx0, gz0), P(gx1, gz0), P(gx1, gz1), P(gx0, gz1)];
  colliders(ctx, base, yB1 - 3, yTop);
  return { x: cBox[0], z: cBox[1], top: yTop };
}
