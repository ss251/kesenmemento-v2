// [v4:landmarks-A] 南町海岸: the waterfront that hides the T.P. 6.2 m seawall between architecture and landscape
// (harbor/real.js SITES, PONTOONS, MINAMI; docs/anime/landmarks/pier7.md, mukaeru.md, seawall-promenade.md):
//   PIER7 (創 ウマレル)  85 × 18.6 m bent bar: 1F and 2F glazed over the whole bar, the upper storey on the street-side
//                        ~55 % only, the bay-side 2F roof a dark grey stepped terrace ([v5:fix1] Google Earth 2026-03-11);
//                        [v5:fix2] three white roof blocks along the bar (NW ~9 m, main 3F ~13 m, SE hall ~11 m); a white
//                        street face with narrow timber louvers; 2F deck cantilevered over the wall
//   迎 (ムカエル)        3 storeys, 53 × 10 m, timber cladding and white render, shops on the 1F, the 2F bay terrace;
//                        [v5:fix1] a broken roofline in three sections and a tan stepped deck at the NW end (Earth 2026)
//   結 / 拓              low white-roofed shop houses behind 迎 (2 and 1 storeys)
//   stepped garden       the terraced ステップガーデン that falls from the wall crest to the quay: pale grey concrete paving
//                        with three white ring planters ([v5] Google Earth 2026-03-11; it was timber with three tall trees)
//   the sloped lawn      the green wedge north of 迎; the plaza deck over the wall between 迎 and PIER7
//   the pontoons         the two 気仙沼ベイクルーズ floating piers with white membrane canopies and gangways
// Returns { halls, pontoons, berth: { a, b, side } for the cruise boat, walk }.
import * as THREE from 'three';
import { SITES, PONTOONS, MINAMI } from './real.js';
import { prismWalls, capGeo, offsetRing, obbOf, seg, barAlong, openRing, signedArea, worldKit, paint, quadsGeo } from './lmkit.js';
import { nightMat, addGlint, registry } from './lights.js';
import { mapMat, textTex, FONT } from './util.js';
import { shopGlass } from './detail5.js';   // [v5:detail]
import { buildPier7Photos, buildMukaeruPhotos, buildPlazaPhotos, buildSlowStreetPhotos, buildKonbiniPhotos, buildMarkingsPhotos, buildEastPromenade, clipAxis, LAWN6, PIER7_6, P7POLY6, P7_1F6 } from './minami5.js';   // [v5:photos]

const C = { white: '#f1f1ee', roof: '#eceeed', timber: '#d6b88e', timberDark: '#a9825a', render: '#f0efe9', deck: '#b08a62', steel: '#5d6470', concrete: '#c9c6bc', stepTop: '#d7d3c8', lawn: '#8a9566', paveA: '#c6c3b8', paveB: '#b9b6ac', tanStep: '#b5ab9f', ringWhite: '#e9e7e1', soil: '#4f4a3e', lowPlant: '#4d5e3c', louver: '#cdbfa8', pontoon: '#b9bcb6', membrane: '#f4f5f2', glassPale: '#a9bccb', terraceA: '#6d6664', terraceB: '#57545b', p7deck: '#a7a39c', mukGrey: '#cfcfca', mukDark: '#8f8d8b', tanDeck: '#ae9a90',
  // [v5:fix3] 迎 from the author's photos (IMG_0818 / IMG_0824) + Earth 2026-03-11: silver rib siding, khaki render, grey metal roofs
  mukSiding: '#c8cbc8', mukKhaki: '#b3a58e', mukRoof: '#a9aca7', mukSoffit: '#55585d', mukTimberDark: '#5b4636', mukFrame: '#8d9094', mukShop: '#dedbd3' };

/** [v5:fix1] PIER7's footprint split across its depth (Google Earth 2026-03-11): `upper` = the 3F on the street-side
 *  ~55 % (street edge A-B-C, the notch vertex N at the SE end), `steps` = the nested strips of the bay-side stepped
 *  terrace (widest and lowest first), `signEdge` / `bayN` = the 3F's long bay face and its outward normal. */
export const PIER7_SPLIT = (() => {
  const P = SITES.pier7.poly, [A, B, Cc, b0, b1, b2, , N] = P;
  const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const D = lerp(Cc, b0, 0.55), E = lerp(B, b1, 0.55), I = [D, E, N], O = [b0, b1, b2];
  const steps = [0.75, 0.5, 0.25].map((f) => [I[0], I[1], I[2], lerp(I[2], O[2], f), lerp(I[1], O[1], f), lerp(I[0], O[0], f)]);
  const L = Math.hypot(N[0] - E[0], N[1] - E[1]), u = [(N[0] - E[0]) / L, (N[1] - E[1]) / L];
  let n = [u[1], -u[0]]; if ((b1[0] - E[0]) * n[0] + (b1[1] - E[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const upper = [A, B, Cc, D, E, N];
  // [v5:fix2] the 3F roofline in three blocks along the bar (Google Earth 2026-03-11 top, o0, o90, o270): a lower NW block
  // (~14 m, the 2F roof only, ~9 m), the main 3F block (~43 m, ~13 m) and the SE end block (~22 m, ~11 m; the tall 2F
  // light-sports hall). Seams measured on the Earth top at -2.5 m and 40.6 m along E->N from E.
  const pr = (p) => (p[0] - E[0]) * u[0] + (p[1] - E[1]) * u[1];
  const clip = (ring, keep) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], kp = keep(pr(p)), kq = keep(pr(q));
      if (kp.in) out.push(p);
      if (kp.in !== kq.in) { const t = (kp.d) / (kp.d - kq.d); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  };
  const between = (ring, lo, hi) => clip(clip(ring, (v) => ({ in: v >= lo, d: v - lo })), (v) => ({ in: v <= hi, d: hi - v }));
  const cuts = [-2.5, 40.6];
  const blocks = [
    { id: 'nw', poly: between(upper, -1e3, cuts[0]), h: 9 },
    { id: 'main', poly: between(upper, cuts[0], cuts[1]), h: 13 },
    { id: 'se', poly: between(upper, cuts[1], 1e3), h: 11 },
  ];
  // the stepped terrace starts at the NW seam: beside the low NW block the 2F roof stays flat (Earth top: lot 17 strip)
  return { upper, blocks, axis: { o: E, u }, steps: steps.map((st) => between(st, cuts[0], 1e3)), signEdge: [E, N], bayN: n };
})();

/** [v5:fix1] 迎's footprint in three sections along its NNW-SSE axis (north wing lower, middle block taller, south
 *  block white), from Google Earth 2026-03-11 top + o180; `dy` = the roof height against the v4 roof. */
export const MUKAERU_SPLIT = (() => {
  const [S1, Sb, Sa, Ba, Bb] = SITES.mukaeru.poly;   // S1 = the south tip; Sa / Ba = the north end (street / bay side)
  const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const at = (t) => [lerp(Sa, Sb, t), lerp(Ba, Bb, t)];
  const [s45, b45] = at(0.45), [s72, b72] = at(0.72);
  return [
    { poly: [Sa, s45, b45, Ba], dy: -0.7, roof: 'grey' },
    { poly: [s45, s72, b72, b45], dy: 0.7, roof: 'dark' },
    { poly: [s72, Sb, S1, Bb, b72], dy: 0, roof: 'white' },
  ];
})();
/** [v5:fix3] 迎's bar axis: `u` along the street face from the north corner Sa to Sb, `n` across it toward the bay. */
export const MUKAERU_AXIS = (() => {
  const [, Sb, Sa, Ba] = SITES.mukaeru.poly, L = Math.hypot(Sb[0] - Sa[0], Sb[1] - Sa[1]), u = [(Sb[0] - Sa[0]) / L, (Sb[1] - Sa[1]) / L];
  let n = [u[1], -u[0]]; if ((Ba[0] - Sa[0]) * n[0] + (Ba[1] - Sa[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { u, n, len: L };
})();
/** [v5:fix1] the tan stepped deck off 迎's bay face at its NW end: along the bay edge from the north corner for 12 m. */
export const MUKAERU_STEPS = (() => {
  const P = SITES.mukaeru.poly, Ba = P[3], Bb = P[4], L = Math.hypot(Bb[0] - Ba[0], Bb[1] - Ba[1]), u = [(Bb[0] - Ba[0]) / L, (Bb[1] - Ba[1]) / L];
  const n = [u[1], -u[0]];   // the bay-side normal (NE): the ring runs north along the bay face, so it is the right-hand side
  return { a: [Ba[0] + u[0] * 1.0, Ba[1] + u[1] * 1.0], b: [Ba[0] + u[0] * 13.0, Ba[1] + u[1] * 13.0], n, steps: 4 };
})();

/** [v5:fix3] the share of the stepped garden's W->N depth taken by the bleacher steps; the rest is a flat quay-level plaza */
export const GARDEN_STEP_BAND = 0.22;
/** [v5:fix3] the plaza's paving level at (x, z): flat at quay level (T.P. 2.1 + the override apron's lift + a margin),
 *  rising over the DEM's bump at the west corner instead of letting it poke through (z-fight blotches in review) */
export const GARDEN_FLAT = 2.25;
export function plazaY(L, x, z) { return Math.max(GARDEN_FLAT, L.heightAt(x, z) + 0.12); }
/** [v5:fix3] the stepped garden's surface height at (x, z) (top of the step there, or the paved plaza; a planter of
 *  radius r takes the highest paving under it) */
export function gardenY(L, x, z, r = 0, top = MINAMI.wallCrest, n = 8) {
  const [N, , , W] = MINAMI.garden;
  const f = ((x - W[0]) * (N[0] - W[0]) + (z - W[1]) * (N[1] - W[1])) / ((N[0] - W[0]) ** 2 + (N[1] - W[1]) ** 2);
  if (f < GARDEN_STEP_BAND) return top - (top - GARDEN_FLAT) * Math.floor(Math.max(0, f) / GARDEN_STEP_BAND * n) / n;
  let y = plazaY(L, x, z);
  if (r > 0) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; y = Math.max(y, plazaY(L, x + Math.cos(a) * r, z + Math.sin(a) * r)); }
  return y;
}

/** [v5:photos] true: 迎, 結 / 拓, the plaza, the store and the junction markings from minami5.js (the author's photos); false:
 *  the v5:fix3 迎 and garden below (plus the v4 結 / 拓 boxes). PIER7's photo changes apply either way. */
export const PHOTOS5 = true;

function edgesOf(poly, fn) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.3) continue; const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; fn(a, b, len, sign > 0 ? [u[1], -u[0]] : [-u[1], u[0]], u, i); }
}
function seaward(L, a, b, n, r = 70) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; for (let d = 4; d <= r; d += 4) if (L.isWater(mx + n[0] * d, mz + n[1] * d)) return true; return false; }

export function buildMinami(ctx) {
  const L = ctx.L;
  const { k } = worldKit(ctx, 'minami4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const timberTex = paint(ctx, 'timber', 256, 256, (g, w, h) => {
    g.fillStyle = C.timber; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = ['#d3b489', '#dcc098', '#cdae83'][(x / 8) % 3]; g.fillRect(x + 1, 0, 6, h); g.fillStyle = '#b89870'; g.fillRect(x, 0, 1, h); }
  }, [1, 1]);
  // [v5:fix3] 迎's silver vertical-rib siding and corrugated grey roof (metric uv: 1 tile = 3 m wall / 2 m roof)
  const ribTex = paint(ctx, 'muk-rib', 128, 128, (g, w, h) => {
    g.fillStyle = C.mukSiding; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = '#b9bdba'; g.fillRect(x, 0, 2, h); g.fillStyle = '#d4d7d4'; g.fillRect(x + 2, 0, 3, h); }
  }, [1, 1]);
  const roofTex = paint(ctx, 'muk-roof', 128, 128, (g, w, h) => {
    g.fillStyle = C.mukRoof; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = '#9da09b'; g.fillRect(x, 0, 2, h); g.fillStyle = '#b4b7b2'; g.fillRect(x + 3, 0, 2, h); }   // ribs run down the slope
  }, [1, 1]);
  const m = {
    white: t(C.white, { paint: 0.03 }), roof: t(C.roof, { paint: 0.03 }), timber: mapMat(ctx, 'toon', '#ffffff', timberTex, { paint: 0.05 }), mullion: t('#e4e3de', { paint: 0.02 }),   // [v5:detail] light frames (IMG_0802, 0817)
   
    render: t(C.render, { paint: 0.04 }), deck: t(C.deck, { paint: 0.06 }), steel: t(C.steel, { paint: 0 }), concrete: t(C.concrete, { paint: 0.07 }), step: t(C.stepTop, { paint: 0.06 }), paveA: t(C.paveA, { paint: 0.05 }), paveB: t(C.paveB, { paint: 0.05 }), tanStep: t(C.tanStep, { paint: 0.06 }), ringWhite: t(C.ringWhite, { paint: 0.02 }), paveBand: t('#8f8d88', { paint: 0.05 }), soil: t(C.soil, { paint: 0.08 }), lowPlant: t(C.lowPlant, { paint: 0.08 }), louver: t(C.louver, { paint: 0.03 }),
    lawn: t(C.lawn, { paint: 0.08 }), pontoon: t(C.pontoon, { paint: 0.06 }), membrane: t(C.membrane, { paint: 0.02, side: 'double' }), trunk: t('#76604e', { paint: 0 }), leaf: t('#6f9a52', { paint: 0.06 }), leafLit: t('#8fb566', { paint: 0.06 }),
    glass: nightMat(ctx, '#8aa4b8', '#ffdcaa', 1.25), glassDark: nightMat(ctx, '#5f7486', '#ffdcaa', 1.3), glassWarm: nightMat(ctx, '#95a9b6', '#ffe0b0', 1.35), lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2),
    glassPale: nightMat(ctx, C.glassPale, '#ffdcaa', 1.25), terraceA: t(C.terraceA, { paint: 0.05 }), terraceB: t(C.terraceB, { paint: 0.05 }), p7deck: t(C.p7deck, { paint: 0.05 }),
    mukGrey: t(C.mukGrey, { paint: 0.04 }), mukDark: t(C.mukDark, { paint: 0.04 }), tanDeck: t(C.tanDeck, { paint: 0.06 }),
    mukSiding: mapMat(ctx, 'toon', '#ffffff', ribTex, { paint: 0.03 }), mukKhaki: t(C.mukKhaki, { paint: 0.05 }), mukRoof: mapMat(ctx, 'toon', '#ffffff', roofTex, { paint: 0.03, side: 'double' }),
    mukSoffit: t(C.mukSoffit, { paint: 0.02 }), mukTimberDark: t(C.mukTimberDark, { paint: 0.05 }), mukFrame: t(C.mukFrame, { paint: 0.02 }), mukShop: t(C.mukShop, { paint: 0.04 }),
  };
  const out = { halls: [], pontoons: [] };
  const hall = (poly, h) => { const o = obbOf(poly); out.halls.push({ x: o.cx, z: o.cz, rotY: o.rotY, depth: o.w, len: o.d, h }); if (ctx.physics?.addBox) edgesOf(poly, (a, b, len, n, u) => { const p = Math.max(1, Math.ceil(len / 16)); for (let i = 0; i < p; i++) { const s = (i + 0.5) * len / p; ctx.physics.addBox(a[0] + u[0] * s - n[0] * 0.25, a[1] + u[1] * s - n[1] * 0.25, 0.5, len / p, Math.atan2(u[0], u[1]), -5, 40); } }); return o; };
  const base = (poly) => Math.max(1.9, Math.min(...openRing(poly).map(([x, z]) => L.heightAt(x, z))));
  /** Glazed floor band with timber mullions every `sp` m and a white slab edge on top. */
  // [v5:detail] glass with a painted lit interior (detail5 shopGlass, one texture repeat per band height) and a transom
  const glazedBand = (poly, y0, y1, sp = 1.8, mat = m.glass, transom = 0) => {
    k.mesh(prismWalls(offsetRing(poly, -0.25), y0, y1, { tile: mat.name === 'shopGlass' ? y1 - y0 : 3 }), mat);
    edgesOf(poly, (a, b, len, n, u) => { for (let s = 0.2; s <= len - 0.1; s += len / Math.max(1, Math.round(len / sp))) k.box(0.1, y1 - y0, 0.16, m.mullion, [a[0] + u[0] * s - n[0] * 0.12, (y0 + y1) / 2, a[1] + u[1] * s - n[1] * 0.12], [0, Math.atan2(u[0], u[1]), 0]); if (transom) k.box(0.1, 0.1, len, m.mullion, [(a[0] + b[0]) / 2 - n[0] * 0.12, transom, (a[1] + b[1]) / 2 - n[1] * 0.12], [0, Math.atan2(u[0], u[1]), 0]); });
    k.mesh(prismWalls(poly, y1, y1 + 0.55, { tile: 3 }), m.white);
    k.mesh(capGeo(poly, y1 + 0.02, { down: true }), m.white);
  };
  const sign = (text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = null, font = FONT.sans, weight = 900 } = {}) => {
    const tex = textTex(ctx, text, { w: 1024, h: Math.round(1024 * h / w), color, bg, font, weight, size: 0.72 });
    k.plane(w, h, mapMat(ctx, bg ? 'toon' : 'decal', '#ffffff', tex, bg ? { paint: 0 } : { transparent: true, alphaTest: 0.3 }), [x, y, z], [0, rotY, 0]);
  };

  // ============================================================== PIER7
  // [v5:fix1] massing from Google Earth 2026-03-11 (top, o180; raw/ref/earth/review1-8851/pier7): 2,390-2,403 m² of floor
  // on a 1,195 m² footprint is 2.0 floors, so the 3F is partial. 1F and 2F are glazed over the whole bar; the 3F (white
  // roof) stands only on the street-side ~55 % of the depth; the bay-side 2F roof is a dark grey stepped terrace (Earth
  // #6d6664 / #504e57) that falls toward the bay. Pale glass (#a9bccb) with white solid panels and timber louvers on
  // the street face (it was a 3-storey, 13 m all-blue-glass box over the whole bar).
  {
    // [v6:rebuild] PIER7's levels from the photo survey's SfM points along the bay face (raw/survey/minami/points.ply; the
    // deck edge and its lights at T.P. 4.4-4.5, the stilts 4.1 m out, the 3F floor band at 8.6, the main roof's eave at
    // 11.9, the SE block's top at 13.6, the NW pavilion's roof edge at 8.8; IMG_0799, 0802, 0806, 0817): the bay-side
    // seawall is the T.P. ~4.1 m wall with the deck on it, not 6.2 m (the plaza's T.P. 1.83 + 4.4 m)
    const poly = SITES.pier7.poly, g0 = base(poly), f2 = PIER7_6.f2, f3 = PIER7_6.f3, roofY = PIER7_6.tops.main;
    const T = PIER7_SPLIT;
    k.mesh(prismWalls(P7_1F6, g0 - 1, g0 + 0.3), m.concrete);
    glazedBand(P7_1F6, g0 + 0.3, f2 - 0.55, 1.8, shopGlass(ctx, 'shop', 0.95), g0 + 2.6);   // [v6:rebuild] the 1F behind the corner deck
    // [v5:photos] the NW pavilion and the SE white block are full-depth volumes of their own (minami5.js), so the 2F glazing,
    // its roof and the stepped terrace cover only the middle of the bar (IMG_0800-0806)
    // [v6:rebuild] the bay face stands 1.5 m inside the seawall line (P7WALL), not on GSI's outline 3.7 m further in (SfM points
    // of the 2F / 3F glass; IMG_0802, 0814-0817): P7POLY6 carries it; the block seams at -0.5 and 39.0 along the axis
    const P6 = P7POLY6, [c0, c1] = PIER7_6.cuts;
    const MID = clipAxis(P6, T.axis.o, T.axis.u, c0, c1);
    // [v5:detail] the 2F glazing stands 3.5 m back from the bay edge behind a terrace with tables (IMG_0802, 0815); that
    // also bares the SE block's NW face with 「PIER7」 and the bay painting above the deck (IMG_0816)
    const dBay = Math.max(...MID.map((p) => (p[0] - T.axis.o[0]) * T.bayN[0] + (p[1] - T.axis.o[1]) * T.bayN[1]));
    void dBay; const MIDb = MID;   // [v6:rebuild] the 2F glass stands at the bay face; the terrace in front is the deck on the wall (minami5)
    glazedBand(MIDb, f2, f3 - 0.55, 1.25, shopGlass(ctx, 'cafe', 1.0), f2 + 2.6);
    k.mesh(capGeo(MIDb, f3 + 0.03), m.terraceA);                                   // the 2F roof (bay side shows)
    // the stepped terrace on the bay-side 2F roof: nested strips from the 3F wall toward the bay, each one step lower
    const steps5 = [];   // [v6:rebuild] no stepped terrace: the 3F glass rises straight above the 2F's head band (IMG_0802, 0817)
    steps5.forEach((st, i) => { k.mesh(prismWalls(st, f3, f3 + 0.5 * (i + 1)), i % 2 ? m.terraceA : m.terraceB); k.mesh(capGeo(st, f3 + 0.5 * (i + 1) + 0.01), i % 2 ? m.terraceA : m.terraceB); });
    if (ctx.physics?.addWalkBox) for (const [i, st] of steps5.entries()) { const o = obbOf(st); ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, f3 + 0.5 * (i + 1), f3 - 1); }
    // [v5:fix2] the 3F in three blocks with a broken roofline (Earth 2026-03-11): the NW block keeps only the 2F (a white
    // roof at ~9 m), the main block is the glazed 3F (meeting rooms and studios, ~13 m), the SE block is the tall 2F
    // light-sports hall (~11 m; white panels with a clerestory). Heights are above the street (g0), never below a floor.
    const tops = { ...PIER7_6.tops };   // [v6:rebuild] eaves as the SfM points put them (was g0 + 9 / 13 / 11)
    const along = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return Math.abs((dx * T.axis.u[0] + dz * T.axis.u[1]) / l); };
    // [v5:photos] only the main block is built here (glazed 3F; its gable roof with deep eaves is minami5's); the NW pavilion
    // and the SE white-board block are minami5's full-depth volumes
    { const top = tops.main, P = MID;   // [v6:rebuild] the glazed 3F over the main block's full depth
      glazedBand(P, f3, top - 0.55, 1.25, shopGlass(ctx, 'glow', 0.9), f3 + 2.5);
      k.mesh(capGeo(offsetRing(P, -0.4), top - 0.6, { down: true, tile: 2 }), m.timber); }
    // interior warmth: timber-lined ceilings read through the glass
    k.mesh(capGeo(offsetRing(poly, -0.4), f2 - 0.6, { down: true, tile: 2 }), m.timber); k.mesh(capGeo(offsetRing(MIDb, -0.4), f3 - 0.6, { down: true, tile: 2 }), m.timber);   // [v5:photos] MID
    // [v5:fix2] the street face: continuous white panels with narrow vertical timber louvers at a 1.1 m pitch in front of
    // the 2F and 3F (Earth o0 / l225: a white face, no punched windows; it read as an apartment block with blue windows
    // and orange panels). The louvers are a muted pale timber so they read as a texture, not as coloured rectangles.
    const streetFace = (ring, y0, y1) => edgesOf(ring, (a, b, len, n, u) => {
      if (len < 6 || seaward(L, a, b, n, 40) || along(a, b) < 0.35) return;
      const ry = Math.atan2(u[0], u[1]), mid = len / 2;
      k.box(0.16, y1 - y0, len - 0.1, m.white, [a[0] + u[0] * mid + n[0] * 0.14, (y0 + y1) / 2, a[1] + u[1] * mid + n[1] * 0.14], [0, ry, 0]);
      const nf = Math.max(1, Math.round(len / 1.1)), pitch = len / nf;
      for (let i = 0; i < nf; i++) { const s = (i + 0.5) * pitch; k.box(0.32, y1 - y0 - 0.3, 0.07, m.louver, [a[0] + u[0] * s + n[0] * 0.38, (y0 + y1) / 2, a[1] + u[1] * s + n[1] * 0.38], [0, ry, 0]); }
    });
    streetFace(MID, f2 + 0.1, f3 - 0.6);   // [v5:photos] the middle of the bar (the ends are minami5's pavilion and white block)
    for (const bl of T.blocks) if (bl.id === 'main') streetFace(bl.poly, f3 + 0.1, tops[bl.id] - 0.6);
    // [v5:photos] the bay side against the author's photos (IMG_0800-0806, 0814-0817): the seawall is the bay-side ground storey,
    // the terrace on its crest, the deck on white stilts with the lit wire rail; the NW pavilion, the SE white block with
    // 「PIER7」 and the bay painting, the main gable roof, the 3F balcony box; the NW street corner (IMG_0799, 0823). It replaces
    // the v5:fix cantilevered pale deck and the 15 m 「PIER7」 on the 3F bay face, which the photos do not show.
    out.pier7photos = buildPier7Photos(ctx, k, { L, P: P6, g0, f2, f3, T, tops, mid: MIDb });
    edgesOf(poly, (a, b, len, n, u) => {
      if (len < 30 || seaward(L, a, b, n, 40)) return;
      const p = [a[0] + u[0] * len * 0.5 + n[0] * 0.55, a[1] + u[1] * len * 0.5 + n[1] * 0.55];
      sign('PIER7', 8, 1.6, p[0], f3 - 0.05, p[1], Math.atan2(n[0], n[1]), { color: '#2f4a66', font: FONT.en || 'sans-serif' });
      const q = [a[0] + u[0] * len * 0.78 + n[0] * 0.55, a[1] + u[1] * len * 0.78 + n[1] * 0.55];
      sign('気仙沼市まち・ひと・しごと交流プラザ', 12, 0.8, q[0], f3 - 0.25, q[1], Math.atan2(n[0], n[1]), { color: '#3a4a5c' });
    });
    // the bay-cruise ticket office sign at the NW end (気仙沼ベイクルーズ)
    // [v6:rebuild] (the 気仙沼ベイクルーズ banner on the NW face is not in IMG_0799 / 0823 / 0907: removed)
    hall(poly, f3 - g0);
    for (const bl of T.blocks) if (bl.id !== 'nw') hall(bl.poly, tops[bl.id] - g0);
    out.pier7 = { g0, f2, f3, roofY, tops };
  }

  // ============================================================== [v5:fix3] 迎, 結 / 拓 and the garden (kept intact)
  // [v5:photos] NOTE: a concurrent v5:fix3 round rewrote 迎 and the garden here while the photo round (minami5.js) rebuilt the
  // same buildings from the full photo set. The v5:fix3 code below is preserved verbatim (recovered from its own bundle,
  // dist/anime-8853, after an overlapping edit) and runs when PHOTOS5 is false; the integrator picks one.
  if (!PHOTOS5) {
    {
      const poly = SITES.mukaeru.poly, g0 = base(poly), f2 = g0 + 3.6, f3 = f2 + 3.5, roofY = f3 + 3.6;
      const [, Sb, Sa] = poly, AX = MUKAERU_AXIS;
      const sOf = (p) => (p[0] - Sa[0]) * AX.u[0] + (p[1] - Sa[1]) * AX.u[1], tOf = (p) => (p[0] - Sa[0]) * AX.n[0] + (p[1] - Sa[1]) * AX.n[1];
      const P3 = (s, t2, y) => [Sa[0] + AX.u[0] * s + AX.n[0] * t2, y, Sa[1] + AX.u[1] * s + AX.n[1] * t2];
      const allS = openRing(poly).map(sOf), sMin = Math.min(...allS), sMax = Math.max(...allS);
      const inner = (a, b) => {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, along = Math.abs(((b[0] - a[0]) * AX.u[0] + (b[1] - a[1]) * AX.u[1]) / d), sm = sOf([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        return along < 0.35 && sm > sMin + 1.5 && sm < sMax - 1.5;
      };
      k.mesh(prismWalls(poly, g0 - 1, g0 + 0.2), m.concrete);
      k.mesh(prismWalls(offsetRing(poly, -0.6), g0 + 0.2, f2 - 0.5, { tile: 3 }), m.mukShop);
      glazedBand(offsetRing(poly, -0.3), g0 + 0.5, f2 - 0.9, 1.6, m.glassWarm);
      k.mesh(prismWalls(poly, f2 - 0.5, f2 + 0.3), m.render);
      const gable = (sp, ye, yr, ov, wallMat) => {
        const ss = openRing(sp).map(sOf), ts = openRing(sp).map(tOf);
        const s0 = Math.min(...ss) - ov, s1 = Math.max(...ss) + ov, t0 = Math.min(...ts) - ov, t1 = Math.max(...ts) + ov, tm = (t0 + t1) / 2;
        const up = [0, 1, 0], k0 = P3(s0, t0, ye), k1 = P3(s1, t0, ye), r0 = P3(s0, tm, yr), r1 = P3(s1, tm, yr), j0 = P3(s0, t1, ye), j1 = P3(s1, t1, ye);
        k.mesh(quadsGeo([[k0, k1, r1, r0, up], [j0, j1, r1, r0, up]], 2), m.mukRoof);
        k.mesh(quadsGeo([[k0, k1, r1, r0, [0, -1, 0]], [j0, j1, r1, r0, [0, -1, 0]]], 2), m.mukSoffit);
        const in0 = Math.min(...ts), in1 = Math.max(...ts), ri = yr - (yr - ye) * 0.15;
        for (const [s, w] of [[Math.min(...ss) + 0.02, -1], [Math.max(...ss) - 0.02, 1]]) {
          const d = [AX.u[0] * w, 0, AX.u[1] * w];
          k.mesh(quadsGeo([[P3(s, in0, ye - 0.3), P3(s, in1, ye - 0.3), P3(s, tm, ri), P3(s, tm, ri), d]], 2), wallMat);
        }
        for (const t2 of [t0, t1]) {
          const a = P3(s0, t2, ye), b = P3(s1, t2, ye);
          barAlong(k, [a[0], a[2]], [b[0], b[2]], ye - 0.12, 0.12, 0.28, m.mukSoffit);
        }
      };
      for (const sg of MUKAERU_SPLIT) {
        const box3 = sg.roof === "dark", top = box3 ? roofY + sg.dy : f3 + 0.2;
        const wallMat = box3 ? m.mukSiding : sg.roof === "white" ? m.mukKhaki : m.mukSiding;
        k.mesh(prismWalls(sg.poly, f2 + 0.3, top, { tile: 3 }), wallMat);
        if (box3) {
          k.mesh(capGeo(sg.poly, top), m.mukDark);
          k.mesh(prismWalls(offsetRing(sg.poly, 0.05), top - 0.15, top + 0.35, { tile: 3 }), m.mukGrey);
        } else if (sg.roof === "white")
          gable(sg.poly, f3 + 0.2, f3 + 1.5, 1.3, wallMat);
        else
          gable(sg.poly, f3 + 0.2, roofY + sg.dy, 0.8, wallMat);
        edgesOf(sg.poly, (a, b, len, n, u) => {
          if (len < 2.5 || inner(a, b))
            return;
          const bay = seaward(L, a, b, n), ry = Math.atan2(n[0], n[1]);
          const rows = box3 ? [f2 + 1.8, f3 + 1.7] : [f2 + 1.8];
          const pitch = box3 ? 3.2 : 2.1, wW = box3 ? 1.2 : 1.45, wH = box3 ? 1.5 : 1.45;
          if (!box3 && sg.roof === "white" && bay) {
            k.box(len - 0.2, f3 - f2 - 0.2, 0.08, m.mukTimberDark, [a[0] + u[0] * len / 2 + n[0] * 0.05, (f2 + f3) / 2 + 0.1, a[1] + u[1] * len / 2 + n[1] * 0.05], [0, ry, 0]);
            k.box(Math.min(6, len * 0.45), 2.4, 0.1, m.glassWarm, [a[0] + u[0] * len * 0.3 + n[0] * 0.1, f2 + 1.65, a[1] + u[1] * len * 0.3 + n[1] * 0.1], [0, ry, 0]);
            return;
          }
          const nW = Math.max(1, Math.floor((len - 1.4) / pitch)), s0 = (len - (nW - 1) * pitch) / 2;
          for (const y of rows)
            for (let i = 0;i < nW; i++) {
              const s = s0 + i * pitch, c = [a[0] + u[0] * s + n[0] * 0.06, a[1] + u[1] * s + n[1] * 0.06];
              k.box(wW + 0.16, wH + 0.16, 0.06, m.mukFrame, [c[0], y, c[1]], [0, ry, 0]);
              k.box(wW, wH, 0.1, m.glassDark, [c[0] + n[0] * 0.02, y, c[1] + n[1] * 0.02], [0, ry, 0]);
              k.box(0.07, wH, 0.14, m.mukFrame, [c[0] + n[0] * 0.04, y, c[1] + n[1] * 0.04], [0, ry, 0]);
            }
        });
      }
      {
        const S1 = poly[0], Bb = poly[4], len = Math.hypot(Bb[0] - S1[0], Bb[1] - S1[1]);
        const u = [(Bb[0] - S1[0]) / len, (Bb[1] - S1[1]) / len];
        let n = [u[1], -u[0]];
        const cx = poly.slice(0, 5).reduce((q, p) => [q[0] + p[0] / 5, q[1] + p[1] / 5], [0, 0]);
        if ((S1[0] - cx[0]) * n[0] + (S1[1] - cx[1]) * n[1] < 0)
          n = [-n[0], -n[1]];
        const ry = Math.atan2(n[0], n[1]), at = (f, o) => [S1[0] + u[0] * len * f + n[0] * o, S1[1] + u[1] * len * f + n[1] * o];
        const [gx, gz] = at(0.5, 0.08);
        k.box(len - 0.4, f3 - f2 - 0.3, 0.1, m.glassWarm, [gx, (f2 + f3) / 2 + 0.15, gz], [0, ry, 0]);
        const [sx, sz] = at(0.5, 0.2);
        sign("ANCHOR", Math.min(6.5, len * 0.8), 1.1, sx, f3 - 0.75, sz, ry, { color: "#f2efe6", bg: "#5a5148", font: FONT.en || "sans-serif" });
      }
      {
        const { a, b, n, steps } = MUKAERU_STEPS;
        for (let i = 0;i < steps; i++) {
          const o0 = 4.8 + i * 1.6, o1 = o0 + 1.6, gOut = L.heightAt((a[0] + b[0]) / 2 + n[0] * (4.8 + steps * 1.6), (a[1] + b[1]) / 2 + n[1] * (4.8 + steps * 1.6)) + 0.2;
          const y = MINAMI.wallCrest - (MINAMI.wallCrest - gOut) * (i + 1) / steps;
          const ring = [[a[0] + n[0] * o0, a[1] + n[1] * o0], [b[0] + n[0] * o0, b[1] + n[1] * o0], [b[0] + n[0] * o1, b[1] + n[1] * o1], [a[0] + n[0] * o1, a[1] + n[1] * o1]];
          k.mesh(prismWalls(ring, g0 - 1, y), m.tanDeck);
          k.mesh(capGeo(ring, y + 0.01), m.tanDeck);
          if (ctx.physics?.addWalkBox) {
            const o = obbOf(ring);
            ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, y, g0 - 1);
          }
        }
      }
      edgesOf(poly, (a, b, len, n, u) => {
        if (len < 8)
          return;
        if (len > 30 && seaward(L, a, b, n)) {
          const d0 = [a[0] + n[0] * 2.4, a[1] + n[1] * 2.4], d1 = [b[0] + n[0] * 2.4, b[1] + n[1] * 2.4];
          barAlong(k, d0, d1, MINAMI.wallCrest - 0.15, 4.8, 0.3, m.tanDeck);
          barAlong(k, [a[0] + n[0] * 4.7, a[1] + n[1] * 4.7], [b[0] + n[0] * 4.7, b[1] + n[1] * 4.7], MINAMI.wallCrest + 1, 0.09, 0.09, m.timberDark || m.deck);
          for (let s = 4;s < len - 3; s += 3)
            k.box(0.07, 1, 0.07, m.steel, [a[0] + u[0] * s + n[0] * 4.7, MINAMI.wallCrest + 0.5, a[1] + u[1] * s + n[1] * 4.7]);
          if (ctx.physics?.addWalkBox) {
            const s = seg(d0, d1);
            ctx.physics.addWalkBox(s.x, s.z, 4.8, s.len, s.rotY, MINAMI.wallCrest, MINAMI.wallCrest - 1);
          }
          const mid = [a[0] + u[0] * len * 0.5 + n[0] * 0.2, a[1] + u[1] * len * 0.5 + n[1] * 0.2];
          sign("迎 MUKAERU", 7, 1.2, mid[0], roofY - 0.9, mid[1], Math.atan2(n[0], n[1]), { color: "#3b3530", font: FONT.serif });
        } else if (len > 30) {
          const at = (f) => [a[0] + u[0] * len * f + n[0] * 0.2, a[1] + u[1] * len * f + n[1] * 0.2];
          for (const [f, txt, bg] of [[0.2, "アンカーコーヒー", "#2f3f5c"], [0.5, "麺食堂 いちりん", "#f3efe4"], [0.8, "Lander Blue", "#3f6fa8"]]) {
            const [x2, z2] = at(f);
            sign(txt, 4.8, 0.8, x2, g0 + 3.1, z2, Math.atan2(n[0], n[1]), { color: bg === "#f3efe4" ? "#3b3530" : "#f4f2ea", bg, font: FONT.round });
          }
          const [x, z] = at(0.5);
          sign("迎", 1.4, 1.4, x, roofY - 1.2, z, Math.atan2(n[0], n[1]), { color: "#3b3530", font: FONT.brush });
        }
      });
      hall(poly, roofY - g0);
      out.mukaeru = { g0, roofY };
    }
    for (const [id, H, label] of [["yuwaeru", 7, "結 ユワエル"], ["hirakeru", 5.4, "拓 ヒラケル"]]) {
      const poly = SITES[id].poly, g0 = base(poly), roofY = g0 + H;
      k.mesh(prismWalls(poly, g0 - 1, roofY), H > 6 ? m.timber : m.render);
      k.mesh(capGeo(poly, roofY), m.roof);
      k.mesh(prismWalls(offsetRing(poly, 0.05), roofY - 0.3, roofY + 0.4, { tile: 3 }), m.white);
      edgesOf(poly, (a, b, len, n, u) => {
        if (len < 6)
          return;
        for (let s = 1.5;s < len - 3; s += 4.5)
          k.box(3, 2.2, 0.12, m.glassWarm, [a[0] + u[0] * (s + 1.5) + n[0] * 0.05, g0 + 1.4, a[1] + u[1] * (s + 1.5) + n[1] * 0.05], [0, Math.atan2(n[0], n[1]), 0]);
        if (H > 6)
          for (let s = 1.5;s < len - 3; s += 4.5)
            k.box(2.2, 1.2, 0.12, m.glass, [a[0] + u[0] * (s + 1.5) + n[0] * 0.05, g0 + 4.9, a[1] + u[1] * (s + 1.5) + n[1] * 0.05], [0, Math.atan2(n[0], n[1]), 0]);
      });
      {
        let best = null;
        edgesOf(poly, (a2, b, len2, n2, u2) => {
          if (!best || len2 > best.len)
            best = { a: a2, b, len: len2, n: n2, u: u2 };
        });
        const { a, len, n, u } = best;
        sign(label, 4.2, 0.8, a[0] + u[0] * len / 2 + n[0] * 0.15, roofY - 0.9, a[1] + u[1] * len / 2 + n[1] * 0.15, Math.atan2(n[0], n[1]), { color: "#3b3530", font: FONT.round });
      }
      hall(poly, H);
    }
    {
      const [N, E, S, W] = MINAMI.garden;
      const top = MINAMI.wallCrest, bot = GARDEN_FLAT;
      const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      const FS = GARDEN_STEP_BAND, n = 8;
      for (let i = 0;i < n; i++) {
        const f0 = FS * i / n, f1 = FS * (i + 1) / n, y = top - (top - bot) * i / n;
        const strip = [lerp(W, N, f0), lerp(W, N, f1), lerp(S, E, f1), lerp(S, E, f0)];
        k.mesh(prismWalls(strip, bot - 1.5, y, { tile: 2 }), m.concrete);
        k.mesh(capGeo(strip, y, { tile: 2 }), m.tanStep);
        if (ctx.physics?.addWalkBox) {
          const o = obbOf(strip);
          ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, y, bot - 1);
        }
      }
      {
        const flat = [lerp(W, N, FS), N, E, lerp(S, E, FS)];
        k.mesh(prismWalls(flat, bot - 1.5, bot, { tile: 2 }), m.concrete);
        {
          const G = 18, pos = [], uv = [], idx = [];
          for (let j = 0;j <= G; j++)
            for (let i = 0;i <= G; i++) {
              const p = lerp(flat[0], flat[3], j / G), q = lerp(flat[1], flat[2], j / G), [x, z] = lerp(p, q, i / G);
              pos.push(x, plazaY(L, x, z), z);
              uv.push(x / 2, z / 2);
            }
          for (let j = 0;j < G; j++)
            for (let i = 0;i < G; i++) {
              const a = j * (G + 1) + i, b = a + 1, c = a + G + 1, d = c + 1;
              idx.push(a, c, b, b, c, d);
            }
          const g = new THREE.BufferGeometry;
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          g.setIndex(idx);
          g.computeVertexNormals();
          if (g.attributes.normal.getY(0) < 0) {
            const ix = g.index.array;
            for (let t2 = 0;t2 < ix.length; t2 += 3) {
              const tmp = ix[t2 + 1];
              ix[t2 + 1] = ix[t2 + 2];
              ix[t2 + 2] = tmp;
            }
            g.computeVertexNormals();
          }
          k.mesh(g, m.paveA);
        }
        for (const f of [0.38, 0.6, 0.82]) {
          const g = FS + (1 - FS) * f, p0 = lerp(W, N, g), p1 = lerp(S, E, g);
          for (let t2 = 0;t2 < 1; t2 += 0.125) {
            const a = lerp(p0, p1, t2), b = lerp(p0, p1, t2 + 0.125), y = Math.max(plazaY(L, ...a), plazaY(L, ...b));
            barAlong(k, a, b, y + 0.015, 1.1, 0.02, m.paveBand);
          }
        }
        if (ctx.physics?.addWalkBox) {
          const o = obbOf(flat);
          ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, bot, bot - 1);
        }
      }
      for (const [x, z] of MINAMI.pits) {
        const y = gardenY(L, x, z, 2.3);
        k.cyl(2.3, 2.3, 0.5, m.ringWhite, [x, y + 0.25, z], null, 32);
        k.cyl(1.95, 1.95, 0.06, m.soil, [x, y + 0.42, z], null, 32);
        k.cyl(1.7, 1.8, 0.1, m.lowPlant, [x, y + 0.46, z], null, 24);
        k.cyl(0.07, 0.1, 2.6, m.trunk, [x, y + 1.7, z], null, 6);
        k.mesh(new THREE.IcosahedronGeometry(1.05, 0), m.leaf, [x, y + 3.25, z], [0, x * 7 % 3, 0], [1, 0.8, 1]);
        k.mesh(new THREE.IcosahedronGeometry(0.7, 0), m.leafLit, [x + 0.35, y + 3.6, z - 0.2]);
        if (ctx.physics?.addCylinder)
          ctx.physics.addCylinder(x, z, 2.3, y - 0.1, y + 0.5);
      }
      const plaza = [[-3.9, 47.4], [W[0], W[1]], [S[0], S[1]], [7.6, 67.8], [-4.5, 74.9], [-9.5, 50.1]];
      k.mesh(prismWalls(plaza, 1, top, { tile: 2 }), m.concrete);
      k.mesh(capGeo(plaza, top + 0.02, { tile: 3 }), m.tanStep);
      if (ctx.physics?.addWalkBox) {
        const o = obbOf(plaza);
        ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, top, 1.5);
      }
      for (let f = 0.1;f < 1; f += 0.2) {
        const p = lerp(N, E, f);
        k.cyl(0.07, 0.09, 4, m.steel, [p[0], bot + 2, p[1]], null, 8);
        k.box(0.4, 0.2, 0.4, m.lamp, [p[0], bot + 4.05, p[1]]);
        registry(ctx)?.streetlight({ x: p[0], y: bot + 3.9, z: p[1], groundY: bot });
      }
      out.garden = { top, bot };
    }
  }

  // ============================================================== 迎 (ムカエル)
  // [v5:photos] rebuilt from the author's photos (IMG_0808, 0824-0828; minami5.js): the ANCHOR café (khaki render, ANCHOR
  // clerestory, café RST neon), the tall grey ribbed 3F box with its steel stair, the lower NW wings (charcoal / dark timber,
  // 「nine one」) under a gull-wing wavy roof, the 2F terrace, the SE deck with the NAIWAN 迎 totem. The v5:fix1 three-section
  // timber box with a tan NW stair is superseded (MUKAERU_SPLIT / MUKAERU_STEPS stay exported for the Earth record).
  if (PHOTOS5) {
    const r5 = buildMukaeruPhotos(ctx, k, { L, base });
    hall(SITES.mukaeru.poly, r5.roofY - r5.g0);
    out.mukaeru = { g0: r5.g0, roofY: r5.roofY };
  }

  // ============================================================== 結, 拓, the slow street, the plaza, the store, the markings
  // [v5:photos] the author's photos (minami5.js): 結 as single-storey cedar shops with colonnades (BLACK TIDE BREWING, the
  // slow-street map board, the 結 totem), 拓's corrugated / timber front (Kesennuma Amway House Hirakeru, KNEWS, the pergola
  // and かつお banners), the slow street between them; the plaza at quay level (pavers and sett bands, the ring benches with
  // young trees, the winch, the bleachers, the elevated walkway over the gate, the mesh stair cage, the composite stair); the
  // convenience store across 魚町港町線; the junction's crossings, hatched median and bollards. They replace the v4 white boxes
  // of 結 / 拓, the T.P. 6.2 m stepped garden and the solid plaza prism (the photos show a flat plaza you walk under the
  // walkway from).
  if (PHOTOS5) {
    out.slow = buildSlowStreetPhotos(ctx, k, { L, base });
    for (const id of ['yuwaeru', 'hirakeru']) hall(SITES[id].poly, id === 'yuwaeru' ? 4.4 : 5.6);
    const pz = buildPlazaPhotos(ctx, k, { L });
    // the ring planters: the photos confirm the 4.6 m white rings 0.5 m high (v5:fix2) and add a lower inner step, a sunken
    // lawn and a young staked tree in each (IMG_0801, 0803, 0807); minami5 builds them
    out.garden = pz;
    out.konbini = buildKonbiniPhotos(ctx, k, { L, base });
    out.markings = buildMarkingsPhotos(ctx, k, { L });
    out.eastPromenade = buildEastPromenade(ctx, k, { L });   // [v6:rebuild]
  }

  // ============================================================== the sloped lawn north of 迎
  {
    const P = PHOTOS5 ? LAWN6 : MINAMI.lawn, pos = [], idx = [];   // [v6:rebuild] the lawn bank as the photos place it
    const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
    const yOf = (x, z) => Math.max(L.heightAt(x, z) + 0.08, 2.2 + Math.max(0, Math.min(1, (x - 14) / -40)) * 3.2);
    const rings = 4;
    for (let r = 0; r <= rings; r++) for (const p of P) { const f = r / rings, x = c[0] + (p[0] - c[0]) * f, z = c[1] + (p[1] - c[1]) * f; pos.push(x, yOf(x, z), z); }
    const n = P.length;
    for (let r = 0; r < rings; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, cc = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const nrm = g.attributes.normal; let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } g.computeVertexNormals(); }
    k.mesh(g, m.lawn);
  }

  // ============================================================== the two floating piers
  PONTOONS.forEach((pt, i) => {
    const y = 0.55;
    k.mesh(prismWalls(pt.poly, -0.6, y), m.pontoon); k.mesh(capGeo(pt.poly, y, { tile: 2 }), ctx.mat.toon('#a9aca6', { paint: 0.06 }));
    // white membrane canopy on slim posts: a shallow curved roof over the roof outline
    const o = obbOf(pt.roof), g = k.group([o.cx, y, o.cz], o.rotY), kk = ctx.kit(g);
    const R = o.w * 0.76, arc = new THREE.CylinderGeometry(R, R, o.d, 16, 1, true, -0.72, 1.44); arc.rotateX(-Math.PI / 2);   // axis along local Z, the arc on top
    kk.mesh(arc, m.membrane, [0, 3.4 - R, 0]);
    const eave = 3.4 - R + R * Math.cos(0.72);
    for (const sx of [-1, 1]) for (let s = -o.d / 2 + 1; s <= o.d / 2 - 1 + 0.01; s += (o.d - 2) / 4) kk.cyl(0.08, 0.08, eave, m.steel, [sx * (R * Math.sin(0.72) - 0.1), eave / 2, s], null, 6);
    // gangway from the quay down to the pontoon, railed
    const [ga, gb] = pt.gang, qa = L.heightAt(gb[0], gb[1]) > 0.5 ? Math.max(1.9, L.heightAt(gb[0], gb[1])) : 2.0, s = seg(ga, gb);
    const gw = k.box(1.8, 0.2, s.len + 1, m.concrete, [s.x, (y + qa) / 2, s.z]); gw.rotation.order = 'YXZ'; gw.rotation.set(-Math.atan2(qa - y, s.len), s.rotY, 0);
    for (const sd of [-1, 1]) { const r = k.box(0.06, 0.06, s.len + 1, m.steel, [s.x + Math.cos(s.rotY) * sd * 0.9, (y + qa) / 2 + 1.0, s.z - Math.sin(s.rotY) * sd * 0.9]); r.rotation.order = 'YXZ'; r.rotation.set(-Math.atan2(qa - y, s.len), s.rotY, 0); }
    if (ctx.physics?.addWalkBox) { const po = obbOf(pt.poly); ctx.physics.addWalkBox(po.cx, po.cz, po.w, po.d, po.rotY, y, -1); ctx.physics.addWalkRamp(s.x, s.z, 1.8, s.len + 1, s.rotY, y, qa); }
    registry(ctx)?.point({ x: o.cx, y: y + 2.9, z: o.cz, color: '#fff0d0', size: 0.7, intensity: 1.5, mode: 'lamps' }); addGlint(ctx, o.cx, 0, o.cz, '#ffe0b0', 0.8, 10, 0.6);
    out.pontoons.push({ poly: pt.poly, y });
  });
  // the cruise boat's berth: along the north long side of the first pontoon, bow out to the bay
  { const P = PONTOONS[0].poly; out.berth = { a: P[2], b: P[3] }; }
  return out;
}
