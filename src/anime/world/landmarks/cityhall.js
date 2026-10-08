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
    // [v6:c1] Commons 2026-03-29 (raw/ref/commons/untagged/187673491): the windows are grouped into wide bands of
    // 3-4 white aluminium sash units, each about 1.7 m wide with a 2x2 pane grid and a top transom, separated by narrow
    // piers of weathered board siding. One tile = one bay of 8.4 m x one floor: a band of four 1.68 m units across
    // X 0.1..0.9 and a plain siding pier (0.84 m) at each tile end.
    const BAY = 8.4, WIN = [0.1, 0.22, 0.9, 0.8];
    const siding = (g, W, H) => {
      g.fillStyle = sp.wall; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) { g.fillStyle = y % 12 ? '#564d42' : '#665c4f'; g.fillRect(0, y, W, 5); g.fillStyle = '#463e35'; g.fillRect(0, y + 5, W, 1); }
      const X0 = W * WIN[0], X1 = W * WIN[2], Y0 = H * (1 - WIN[3]), Y1 = H * (1 - WIN[1]), uw = (X1 - X0) / 4, fw = 2;
      const gl = (x, y, w, h, c0, c1) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(x, y, w, h); };
      for (let i = 0; i < 4; i++) {
        const x = X0 + i * uw;
        g.fillStyle = '#e9e6dc'; g.fillRect(x, Y0 - 2, uw, Y1 - Y0 + 4);                                 // the sash frame
        const gx = x + fw, gw = uw - 2 * fw, tr = (Y1 - Y0) * 0.2, gy = Y0 + fw + tr;                   // glass, transom height
        gl(gx, Y0 + fw, gw, tr - fw, '#61788a', '#86a0b0');                                                 // the top transom
        gl(gx, gy, gw, Y1 - fw - gy, '#6a8294', '#adbfca');                                                 // the 2x2 pane grid below
        g.fillStyle = '#e9e6dc'; g.fillRect(gx, gy - fw, gw, fw);                                           // transom rail
        g.fillRect(gx + gw / 2 - 1, gy, 2, Y1 - fw - gy); g.fillRect(gx, (gy + Y1 - fw) / 2 - 1, gw, 2);  // the 2x2 mullions
      }
    };
    const fac = facadeMat(ctx, 'cityhall2', { draw: siding, win: WIN, lit: 0.3, W: 256 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#8f8a80', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, top, { tu: BAY, tv: sp.fh, yRef: y0 }), fac);
    // the main gable roof over the long bar (local x −4.4..7.4) and flat caps over the stair bays that stand out
    const core = { cx: 0, cz: 0, w: 11.8, d: 47.6 }; const cc = obbPt(o, 1.5, 0);
    const ro = { ...o, cx: cc[0], cz: cc[1], w: core.w, d: core.d };
    const R = pitchedRoof(ro, top, { kind: 'gable', pitch: 0.55, over: 0.7 });
    const rm = t(sp.roof, { paint: 0.05 });
    k.mesh(R.roof, rm); k.mesh(R.fascia, t('#5a6266', { paint: 0 })); if (R.gables) k.mesh(R.gables, t(sp.wall, { paint: 0.03 }));
    for (const z of [-15, -4, 14.2, 20]) { const c = obbPt(o, -6.4, z); k.box(4.4, 0.25, 5.6, rm, [c[0], top + 0.1, c[1]], [0, o.rotY, 0]); }
    // [v6:c1] trims on the long walls (Commons 2026-03-29): a white pipe line between the floors, white downpipes at the
    // piers (every 8.4 m, eave to ground) and, on the car-park (south-east) wall, small bracketed pent roofs (庇) over
    // the 1F window bands. wallGeo puts the tile joints at s = -(len % BAY) / 2 (mod BAY) along each edge.
    {
      const P = poly, white = t('#e9e6dc', { paint: 0 }), timber = t('#4a3f33', { paint: 0.05 });
      const SE = 3;                                                                           // the 42.3 m car-park wall
      const dirOf = (i) => { const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, l, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l }; };
      const ref = dirOf(SE);
      for (let i = 0; i < P.length; i++) {
        const e = dirOf(i);
        if (e.l < 12 || Math.abs(e.dx * ref.dx + e.dz * ref.dz) < 0.9) continue;          // the long walls only
        const G = k.group([e.a[0], y0, e.a[1]], Math.atan2(e.dx, e.dz)), kk = ctx.kit(G);   // local z along the edge, outward = -x
        const ph = (((-(e.l % BAY)) / 2) % BAY + BAY) % BAY;
        kk.box(0.08, 0.08, e.l - 0.3, white, [-0.07, sp.fh, e.l / 2]);                        // the pipe line between the floors
        for (let s0 = ph - BAY; s0 < e.l; s0 += BAY) {
          const pier = s0 + BAY;                                                              // the tile joint = the pier centre
          if (pier > 0.6 && pier < e.l - 0.6) kk.box(0.1, sp.storeys * sp.fh - 0.3, 0.1, white, [-0.1, (sp.storeys * sp.fh - 0.3) / 2, pier]);
          if (i !== SE) continue;
          const z0 = Math.max(0.15, s0 + BAY * WIN[0] - 0.2), z1 = Math.min(e.l - 0.15, s0 + BAY * WIN[2] + 0.2);
          if (z1 - z0 < 2) continue;
          kk.box(0.62, 0.07, z1 - z0, rm, [-0.31, 2.78, (z0 + z1) / 2], [0, 0, 0.2]);          // the pent roof, dipping outward
          for (let z = s0 + BAY * WIN[0]; z <= s0 + BAY * WIN[2] + 1e-3; z += BAY * (WIN[2] - WIN[0]) / 4) {
            if (z < z0 || z > z1) continue;
            kk.box(0.06, 0.06, 0.06, timber, [-0.5, 2.62, z]);                                 // the bracket ends
            kk.box(0.05, 0.42, 0.05, timber, [-0.2, 2.5, z], [0, 0, -0.6]);                    // the exposed timber bracket
          }
        }
      }
    }
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
    const sp = SPEC.oneTen, poly0 = OSM.oneTen.poly, o = obbOf(poly0), gs = groundSpan(L, poly0);
    const y0 = gs.lo + 0.2, f1 = y0 + 3.5, f2 = y0 + 2 * 3.5, top = f2 + 2 * 2.9;
    // [v6:c5] the street corner (the vertex nearest the crossing, B) is a rounded entrance bay (Commons 2026-03-29): a
    // quarter circle R = 6 m of 9 chords, edge indices 1..9 of the ring; every other vertex keeps its OSM position
    const R = 6, NA = 9, B = poly0[1], A = poly0[0], C = poly0[2];
    const uBA = [A[0] - B[0], A[1] - B[1]], uBC = [C[0] - B[0], C[1] - B[1]];
    const lBA = Math.hypot(...uBA), lBC = Math.hypot(...uBC); uBA[0] /= lBA; uBA[1] /= lBA; uBC[0] /= lBC; uBC[1] /= lBC;
    const th = Math.acos(uBA[0] * uBC[0] + uBA[1] * uBC[1]), tl = R / Math.tan(th / 2);
    const bis = [uBA[0] + uBC[0], uBA[1] + uBC[1]], bl = Math.hypot(...bis);
    const cc = [B[0] + bis[0] / bl * R / Math.sin(th / 2), B[1] + bis[1] / bl * R / Math.sin(th / 2)];
    const P1 = [B[0] + uBA[0] * tl, B[1] + uBA[1] * tl], P2 = [B[0] + uBC[0] * tl, B[1] + uBC[1] * tl];
    const a1 = Math.atan2(P1[1] - cc[1], P1[0] - cc[0]); let da = Math.atan2(P2[1] - cc[1], P2[0] - cc[0]) - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const arc = []; for (let i = 0; i <= NA; i++) arc.push([cc[0] + Math.cos(a1 + da * i / NA) * R, cc[1] + Math.sin(a1 + da * i / NA) * R]);
    const poly = [A, ...arc, ...poly0.slice(2)];
    const onArc = (i) => i >= 1 && i <= NA;
    const segLen = Math.abs(da) * R / NA;
    const midI = Math.floor(NA / 2), mid = [(arc[midI][0] + arc[midI + 1][0]) / 2, (arc[midI][1] + arc[midI + 1][1]) / 2];
    const nMid = [mid[0] - cc[0], mid[1] - cc[1]], nl = Math.hypot(...nMid); nMid[0] /= nl; nMid[1] /= nl;
    // 1F: glazed shopfronts and the entrance between square piers, a teal fascia above
    const glass1 = (g, W, H, x0, x1) => {
      const gr = g.createLinearGradient(0, H * 0.2, 0, H * 0.9); gr.addColorStop(0, '#4f6b7a'); gr.addColorStop(1, '#a9bcc6');
      g.fillStyle = '#d9d3d4'; g.fillRect(x0 * W - 2, H * 0.2 - 2, (x1 - x0) * W + 4, H * 0.7 + 4); g.fillStyle = gr; g.fillRect(x0 * W, H * 0.2, (x1 - x0) * W, H * 0.7);
      g.fillStyle = '#c9c1c3'; g.fillRect((x0 + x1) * W / 2 - 1.5, H * 0.2, 3, H * 0.7);
    };
    const shop1 = facadeMat(ctx, 'oneten-1f', { draw: (g, W, H) => {
      g.fillStyle = sp.base; g.fillRect(0, 0, W, H);
      g.fillStyle = sp.band; g.fillRect(0, 0, W, H * 0.16);
      g.fillStyle = '#7a6870'; g.fillRect(0, H * 0.16, W, H * 0.03);
      glass1(g, W, H, 0.1, 0.9);
    }, win: [0.1, 0.1, 0.9, 0.8], lit: 0.55 });
    const door1 = facadeMat(ctx, 'oneten-1f-bay', { draw: (g, W, H) => {
      g.fillStyle = sp.base; g.fillRect(0, 0, W, H);
      g.fillStyle = sp.band; g.fillRect(0, 0, W, H * 0.16);
      glass1(g, W, H, 0.03, 0.97);
    }, win: [0.03, 0.1, 0.97, 0.8], lit: 0.55 });
    // 2F: a solid mauve stone-panel wall (joints every 1.5 m) with one punched window per 4.5 m tile and a thin teal cornice
    const wall2 = facadeMat(ctx, 'oneten-2f', { draw: (g, W, H) => {
      g.fillStyle = sp.base; g.fillRect(0, 0, W, H);
      g.fillStyle = '#a48c92';
      for (let i = 0; i < 3; i++) g.fillRect(Math.round(i * W / 3) - 1, 0, 2, H);
      for (let j = 0; j < 3; j++) g.fillRect(0, Math.round(H - j * H * 1.5 / 3.5) - 1, W, 2);
      const X0 = 0.36 * W, X1 = 0.64 * W, Y0 = (1 - 0.75) * H, Y1 = (1 - 0.25) * H;
      g.fillStyle = '#d9d3d4'; g.fillRect(X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4);
      const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#4f6b7a'); gr.addColorStop(1, '#a9bcc6'); g.fillStyle = gr; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      g.fillStyle = sp.band; g.fillRect(0, 0, W, H * 0.05);
    }, win: [0.36, 0.25, 0.64, 0.75], lit: 0.55 });
    const ribbon2 = facadeMat(ctx, 'oneten-2f-ribbon', { draw: (g, W, H) => {
      g.fillStyle = sp.base; g.fillRect(0, 0, W, H);
      const X0 = 0.1 * W, X1 = 0.9 * W, Y0 = (1 - 0.82) * H, Y1 = (1 - 0.45) * H;
      g.fillStyle = '#d9d3d4'; g.fillRect(X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4);
      const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#4f6b7a'); gr.addColorStop(1, '#a9bcc6'); g.fillStyle = gr; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      g.fillStyle = sp.band; g.fillRect(0, 0, W, H * 0.05);
    }, win: [0.1, 0.45, 0.9, 0.82], lit: 0.55 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a09a94', { paint: 0.05 }));
    k.mesh(wallGeo(poly, y0, f1, { tu: 4.5, tv: 3.5, yRef: y0, skip: (i) => onArc(i) }), shop1);
    k.mesh(wallGeo(poly, y0, f1, { tu: segLen, tv: 3.5, yRef: y0, skip: (i) => !onArc(i) }), door1);
    k.mesh(wallGeo(poly, f1, f2, { tu: 4.5, tv: 3.5, yRef: f1, skip: (i) => onArc(i) }), wall2);
    k.mesh(wallGeo(poly, f1, f2, { tu: segLen, tv: 3.5, yRef: f1, skip: (i) => !onArc(i) }), ribbon2);
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
    // 「One/10 気仙沼市役所」 over the corner doors, on the 2F wall of the rounded bay
    sign(ctx, k, 'One/10 気仙沼市役所', 3.4, 1.1, mid[0] + nMid[0] * 0.04, f1 + 0.95, mid[1] + nMid[1] * 0.04, Math.atan2(nMid[0], nMid[1]), { color: '#f1ecee', bg: '#a98f97', depth: 0.3, size: 0.52 });
    // three green canvas awnings over the side door (the short south-west face, beside the tower)
    {
      const e = edges(poly).find((q) => q.i === NA + 2);   // C to D, 8.2 m
      const awn = t('#2f6b4f', { paint: 0.02 }), ang = Math.atan2(e.n[0], e.n[1]);
      for (let j = 0; j < 3; j++) {
        const s = e.len * (0.2 + 0.3 * j), G = k.group([e.a[0] + e.ux * s, y0 + 2.7, e.a[1] + e.uz * s], ang), kk = ctx.kit(G);
        kk.box(2.2, 0.08, 1.3, awn, [0, 0, 0.6], [0.38, 0, 0]);
      }
    }
    // roof-deck parking: white stall lines and a few parked cars (kei and sedans in the town's colours)
    const lines = t('#f2f2ee', { paint: 0 }), cars = ['#e8e8e4', '#3d4f6a', '#9c2f33', '#c9cbd0', '#2d2f36'];
    for (let i = -3; i <= 3; i++) { const c = obbPt(o, i * 5.6, 8); k.box(0.12, 0.02, 5.2, lines, [c[0], top + 0.05, c[1]], [0, o.rotY, 0]); const c2 = obbPt(o, i * 5.6, -12); k.box(0.12, 0.02, 5.2, lines, [c2[0], top + 0.05, c2[1]], [0, o.rotY, 0]); }
    for (const [i, z, ci] of [[-2.5, 8, 0], [0.5, 8, 1], [1.5, -12, 2], [-1.5, -12, 3], [2.5, 8, 4]]) { const c = obbPt(o, i * 5.6, z); const C = k.group([c[0], top + 0.05, c[1]], o.rotY), kc = ctx.kit(C); kc.boxB(1.75, 0.8, 4.3, t(cars[ci], { paint: 0.02 }), [0, 0.15, 0]); kc.boxB(1.55, 0.55, 2.2, t('#44546a', { paint: 0 }), [0, 0.95, -0.2]); }
    // the corner tower: raw grey concrete with the red-and-teal 「One/Ten」 script mounted on it (no cladding, no cap)
    const tc = obbPt(o, o.w / 2 - 3, o.d / 2 - 3);
    const T = k.group([tc[0], y0, tc[1]], o.rotY), kt = ctx.kit(T);
    kt.boxB(5.2, top - y0 + 4.2, 5.2, t(sp.deck, { paint: 0.02 }), [0, 0, 0]);
    const logo = ctx.tex.draw(512, 256, (g, W, H) => {
      g.fillStyle = sp.deck; g.fillRect(0, 0, W, H); g.font = `italic 700 118px ${FONT.en || 'serif'}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const w1 = g.measureText('One').width, w2 = g.measureText('Ten').width, x0 = (W - w1 - w2 - 14) / 2;
      g.fillStyle = '#3f8f94'; g.fillText('One', x0, H * 0.5); g.fillStyle = '#c8343c'; g.fillText('Ten', x0 + w1 + 14, H * 0.5);
    }, { key: 'lmB-oneten-logo2' });
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
