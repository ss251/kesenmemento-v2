// [v4:landmarks-B] Hospitals (docs/anime/landmarks/hospitals.md).
//   気仙沼市立病院 (赤岩杉ノ沢, 2017; OSM way 761241989): SRC with seismic isolation, 6 storeys built (7F legal + B1),
//     8,174 m² footprint. [v6:outside-hospital r3] The 6-storey wing (pilotis 1F with timber panels + 5 floors of ribbon windows,
//     24.6 m) stands flush on the roundabout face (OSM edge 14 -> 15, 110 m), with the stair tower and balconies at its west end,
//     the plant penthouse mid-roofline and the name near the east end of the wall (Commons 65676447, 2017). The GSI ortho shows
//     the wing's roof as a ~30 m deep kite tapering to the south-east tip, and the NE strip as low terraces: a 4-storey terrace
//     with planters beside the wing, then the 3-storey outer deck. The NW block stays 3 storeys; the 5 m west arm (OSM 8-13) is a
//     one-storey covered link. Entrance canopy and the ground-level heliport (OSM aeroway=helipad 761241990) as before.
//   大友病院 (新町; OSM way 761402305, building:levels 5): white walls, the mint-green flat roofs of the ortho.
import * as THREE from 'three';
import { OSM, SPEC, POOLS_HELI } from './sites.js';
import { group, quadsGeo, obbOf, obbPt, groundSpan, wallGeo, facadeMat, paintWindow, flatRoof, flipFaces, colliders, sign, capGeo, prismWalls, mapMat, textTex, FONT, nightMat, offsetRing, edges } from './kit.js';

/**
 * [v6:outside-hospital] 気仙沼市立病院's drop-off canopy on the roundabout side (r17966-r17969), the two GSI footprints
 * 16/58539/25072/144 and /145 (data/anime/explore.json; they were drawn as two warehouses). Each is a curved band about
 * 5 m wide: `A` is its outer (kerb) edge along the roundabout's ring road, `B` the building side, both run west -> east
 * (lot 144) and north -> south (lot 145), copied from the footprints' vertices.
 * Evidence: Earth 2026-03-11 top (raw/ref/earth/lm/lm-hospital/top_annot.jpg #22 and #23: a light-grey roof band, no shed)
 * and Commons 65676447 (2017 front photo): a thin exposed-concrete slab, about 1 m fascia, on square board-marked piers
 * along the kerb side, about 9-10 m apart, the underside about 1.5 bus heights (4 m) above the pavement; no walls.
 */
const CANOPY = [
  { id: '16/58539/25072/144',
    A: [[-830.4, 2053.1], [-826.2, 2051.9], [-822.5, 2051.3], [-819.4, 2051.4], [-812.6, 2053], [-806.3, 2056.4], [-803.2, 2059.4], [-799.7, 2064.8], [-798.7, 2067.3], [-797.4, 2073], [-797.7, 2079]],
    B: [[-832.6, 2048.3], [-824.7, 2046], [-818.2, 2045.7], [-809.7, 2047.8], [-808.2, 2049], [-797.3, 2060.1], [-794.2, 2064], [-793, 2066.7], [-791.9, 2073.4], [-792.6, 2079.8]] },
  { id: '16/58539/25072/145', skipFirst: true,
    A: [[-793.4, 2080.1], [-794.4, 2084.2], [-795.9, 2087.9], [-798.9, 2092.5], [-804.2, 2097.6], [-808.4, 2099.8]],
    B: [[-787.8, 2080.7], [-789.8, 2087.3], [-792.4, 2092.9], [-798.3, 2099.6], [-805.3, 2104.6]] },
];
const CANOPY_UNDER = 4.0, CANOPY_FASCIA = 1.0, CANOPY_COLOR = '#b9b9b5', PIER_ALONG = 1.6, PIER_ACROSS = 1.2, PIER_SPACING = 9.5, PIER_INSET = 0.9;   // Commons 65676447: the stone-clad piers are about 1.5 x the 1.0-1.1 m fascia wide (not the 1 x 1 m first estimated)

/**
 * [v6:outside-hospital r3] The outline of 気仙沼市立病院 (OSM way 761241989) cut into the parts that have their own height. They
 * tile the OSM outline exactly (the test checks the areas). Vertex numbers are OSM ring indices; 14 -> 15 is the roundabout face.
 *   wing    6 storeys: the roundabout face, its west end (13 -> 14) and the tip; the NE and N boundaries are read off the GSI ortho
 *           (roof brightness: W3 (-775, 2035), W4 (-744, 2066.6), W5 (-736, 2085))
 *   rest    the NW block, 3 storeys (ortho: bright roof with plant, 12 m shadow bands)
 *   arm     the 5 m strip 8 -> 13 to the west, one storey (ortho: a thin shadow band, no tower shadow)
 *   deck    the NE strip, 3 storeys, medium grey; `terrace` is the 4-storey step beside the wing (10 m wide, with planters)
 */
const HOSP_W3 = [-775, 2035], HOSP_W4 = [-744, 2066.6], HOSP_W5 = [-736, 2085], HOSP_Q = [-777.3, 2003.8];
const HOSP_TERRACE_STOREYS = 4, HOSP_TERRACE_W = 10, HOSP_RECESS = 2.4, HOSP_PIER_PITCH = 8.2, HOSP_TOWER_W = 8.5, HOSP_SIGN_S = 92;
const HOSP_PENT = { s: 56, d: 12.5, w: 26, dd: 9, h: 4.2 };
export function hospitalParts(P) {
  const wing = [P[14], P[13], HOSP_W3, HOSP_W4, HOSP_W5, P[17], P[16], P[15]];
  const rest = [P[4], P[5], P[6], P[7], P[8], P[13], HOSP_W3, HOSP_Q];
  const arm = [P[8], P[9], P[10], P[11], P[12], P[13]];
  const deck = [HOSP_W3, HOSP_W4, HOSP_W5, P[17], P[18], P[19], P[20], P[21], P[22], P[23], P[24], P[25], P[26], P[0], P[1], P[2], P[3], HOSP_Q];
  const nrm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };   // NE side of W3 -> W4 -> W5
  const n1 = nrm(HOSP_W3, HOSP_W4), n2 = nrm(HOSP_W4, HOSP_W5), m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]), mm = [m[0] / ml, m[1] / ml], w = HOSP_TERRACE_W, c = mm[0] * n1[0] + mm[1] * n1[1];
  const terrace = [HOSP_W3, HOSP_W4, HOSP_W5, [HOSP_W5[0] + n2[0] * w, HOSP_W5[1] + n2[1] * w], [HOSP_W4[0] + mm[0] * w / c, HOSP_W4[1] + mm[1] * w / c], [HOSP_W3[0] + n1[0] * w, HOSP_W3[1] + n1[1] * w]];
  return { wing, rest, arm, deck, terrace };
}

/** A flat roof over `ring` at y with a parapet and coping on every edge except `skip` (edges against a higher block). */
function deckRoof(k, ring, y, roofMat, parMat, par, skip) {
  k.mesh(capGeo(ring, y + 0.02, { tile: 3 }), roofMat);
  const sk = (i) => !!skip && skip.has(i), inner = offsetRing(ring, -0.25);
  k.mesh(wallGeo(ring, y, y + par, { skip: (i) => sk(i) }), parMat);
  const g = wallGeo(inner, y, y + par, { skip: (i) => sk(i) }); flipFaces(g); k.mesh(g, parMat);
  const q = [];
  ring.forEach((a, i) => { if (sk(i)) return; const j = (i + 1) % ring.length, b = ring[j], ai = inner[i], bi = inner[j], Y = y + par; q.push([[a[0], Y, a[1]], [b[0], Y, b[1]], [bi[0], Y, bi[1]], [ai[0], Y, ai[1]], [0, 1, 0]]); });
  if (q.length) k.mesh(quadsGeo(q, 3), parMat);
}

/** The wing's facade cell (3.6 m x one storey): white slab edge, a continuous ribbon of glazing, thin mullions. */
const ribbonCell = (wall) => (g, W, H) => {
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f7f8f6'; g.fillRect(0, H * 0.78, W, H * 0.22);                     // slab edge (y up: 0 - 0.22)
  g.fillStyle = '#b4babe'; g.fillRect(0, H * 0.72, W, H * 0.05);                      // its shadow line on the glazing below
  const Y0 = H * 0.24, Y1 = H * 0.70, gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#5e7890'); gr.addColorStop(1, '#b3c6d3');
  g.fillStyle = '#e4e7e8'; g.fillRect(0, Y0 - 2, W, Y1 - Y0 + 4);
  g.fillStyle = gr; g.fillRect(1, Y0, W - 2, Y1 - Y0);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(W * 0.12, Y0 + 3, W * 0.2, 3);
  g.fillStyle = '#e4e7e8'; g.fillRect(W * 0.5 - 1.5, Y0, 3, Y1 - Y0); g.fillRect(0, Y0, 2, Y1 - Y0);
  g.fillStyle = '#c9cdcf'; g.fillRect(0, 0, W, H * 0.04);                             // soffit shade under the slab above
};
/** The pilotis storey (7.5 m x 4.1 m): board-marked timber panels with a dark glazed bay. */
const timberCell = (g, W, H) => {
  g.fillStyle = '#b98a58'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#9d7143'; for (let i = 1; i < 8; i++) g.fillRect(W * 0.72 * i / 8 - 1, 0, 2, H);
  g.fillStyle = '#8f6639'; g.fillRect(0, H * 0.5 - 1, W * 0.72, 2); g.fillRect(W * 0.72 - 2, 0, 3, H);
  const X0 = W * 0.76, X1 = W * 0.98, gr = g.createLinearGradient(0, H * 0.2, 0, H); gr.addColorStop(0, '#4d5963'); gr.addColorStop(1, '#2f3841');
  g.fillStyle = '#d6d9d8'; g.fillRect(X0 - 2, H * 0.16, X1 - X0 + 4, H * 0.84); g.fillStyle = gr; g.fillRect(X0, H * 0.2, X1 - X0, H * 0.8);
  g.fillStyle = '#d6d9d8'; g.fillRect((X0 + X1) / 2 - 1, H * 0.2, 2, H * 0.8);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, W, H * 0.07);
};

/** `n + 1` points along a polyline at equal fractions of its length. */
function resample(P, n) {
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = cum[cum.length - 1], out = [];
  for (let j = 0, i = 1; j <= n; j++) {
    const d = tot * j / n; while (i < P.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    out.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]);
  }
  return { pts: out, len: tot };
}

/**
 * [r3:audit] The west arm (OSM 8 -> 13: a 5 m strip about 70 m long) as a covered link that follows the slope: `arm` = hospitalParts().arm, whose long sides are
 * 0 -> 1 -> 2 and 5 -> 4 (both east -> west), the east end 5 -> 0 against the NW block and the west end 2 -> 3 -> 4. The roof is `fh` above the highest ground
 * across each section (smoothed, so it ramps and does not step), the walls run from 0.5 m under the lowest ground to the roof. Returns the roof height at the east end.
 */
export function hospitalArm(k, L, arm, fh, roofMat, wallMat) {
  const left = resample([arm[0], arm[1], arm[2]], 1), right = resample([arm[5], arm[4]], 1);
  const n = Math.max(4, Math.ceil(Math.max(left.len, right.len) / 4));
  const A = resample([arm[0], arm[1], arm[2]], n).pts, B = resample([arm[5], arm[4]], n).pts;
  const gA = A.map(([x, z]) => L.heightAt(x, z)), gB = B.map(([x, z]) => L.heightAt(x, z)), gM = A.map((a, i) => L.heightAt((a[0] + B[i][0]) / 2, (a[1] + B[i][1]) / 2));
  let top = A.map((_, i) => Math.max(gA[i], gB[i], gM[i]) + fh);
  for (let pass = 0; pass < 3; pass++) top = top.map((v, i) => Math.max(v, (top[Math.max(0, i - 1)] + v + top[Math.min(n, i + 1)]) / 3));   // smoothed, never lowered under the ground + fh
  const v3 = (p, y) => [p[0], y, p[1]], roof = [], wall = [];
  for (let i = 0; i < n; i++) {
    const a0 = A[i], a1 = A[i + 1], b0 = B[i], b1 = B[i + 1];
    roof.push([v3(a0, top[i]), v3(a1, top[i + 1]), v3(b1, top[i + 1]), v3(b0, top[i]), [0, 1, 0]]);
    const na = [(a0[0] - b0[0] + a1[0] - b1[0]) / 2, 0, (a0[1] - b0[1] + a1[1] - b1[1]) / 2];
    wall.push([v3(a0, top[i]), v3(a1, top[i + 1]), v3(a1, Math.min(gA[i + 1], gB[i + 1]) - 0.5), v3(a0, Math.min(gA[i], gB[i]) - 0.5), na]);
    wall.push([v3(b0, top[i]), v3(b1, top[i + 1]), v3(b1, Math.min(gA[i + 1], gB[i + 1]) - 0.5), v3(b0, Math.min(gA[i], gB[i]) - 0.5), [-na[0], 0, -na[2]]]);
  }
  const tx = A[n][0] - A[n - 1][0], tz = A[n][1] - A[n - 1][1];   // the west end faces the way the arm runs
  wall.push([v3(A[n], top[n]), v3(B[n], top[n]), v3(B[n], Math.min(gA[n], gB[n]) - 0.5), v3(A[n], Math.min(gA[n], gB[n]) - 0.5), [tx, 0, tz]]);
  k.mesh(quadsGeo(roof, 3), roofMat);
  k.mesh(quadsGeo(wall, 3), wallMat);
  return top[0];
}

export function hospitalCanopy(ctx, k, t) {
  const L = ctx.L, built = [];
  const concrete = t(CANOPY_COLOR, { paint: 0.03 }), pierMat = t('#a9aaa6', { paint: 0.05 });
  for (const c of CANOPY) {
    const { len: lenA } = resample(c.A, 1), { len: lenB } = resample(c.B, 1);
    const n = Math.max(4, Math.ceil(Math.max(lenA, lenB) / 2));
    const A = resample(c.A, n).pts, B = resample(c.B, n).pts;
    // underside = the local kerb (terrain on the ring-road edge) + 4 m, smoothed so the slab ramps and does not step
    let u = A.map(([x, z]) => L.heightAt(x, z) + CANOPY_UNDER);
    for (let pass = 0; pass < 3; pass++) u = u.map((v, i) => (u[Math.max(0, i - 1)] + v + u[Math.min(u.length - 1, i + 1)]) / 3);
    const top = u.map((v) => v + CANOPY_FASCIA);
    const q = [], v3 = (p, y) => [p[0], y, p[1]];
    for (let i = 0; i < n; i++) {
      const a0 = A[i], a1 = A[i + 1], b0 = B[i], b1 = B[i + 1], nx = (a0[0] - b0[0] + a1[0] - b1[0]) / 2, nz = (a0[1] - b0[1] + a1[1] - b1[1]) / 2;   // building side -> kerb side
      q.push([v3(a0, top[i]), v3(a1, top[i + 1]), v3(b1, top[i + 1]), v3(b0, top[i]), [0, 1, 0]]);                   // roof
      q.push([v3(a0, u[i]), v3(a1, u[i + 1]), v3(b1, u[i + 1]), v3(b0, u[i]), [0, -1, 0]]);                           // soffit
      q.push([v3(a0, top[i]), v3(a1, top[i + 1]), v3(a1, u[i + 1]), v3(a0, u[i]), [nx, 0, nz]]);                      // kerb-side fascia
      q.push([v3(b0, top[i]), v3(b1, top[i + 1]), v3(b1, u[i + 1]), v3(b0, u[i]), [-nx, 0, -nz]]);                    // building-side fascia
    }
    // end faces
    for (const [i, sgn] of [[0, -1], [n, 1]]) { const tx = (A[Math.min(n, i + 1)][0] - A[Math.max(0, i - 1)][0]) * sgn, tz = (A[Math.min(n, i + 1)][1] - A[Math.max(0, i - 1)][1]) * sgn; q.push([v3(A[i], top[i]), v3(B[i], top[i]), v3(B[i], u[i]), v3(A[i], u[i]), [tx, 0, tz]]); }
    k.mesh(quadsGeo(q, 3), concrete);
    // stone / board-marked concrete piers along the kerb edge, 9-10 m apart, set back from the fascia
    const m = Math.max(1, Math.round(lenA / PIER_SPACING));
    for (let j = c.skipFirst ? 1 : 0; j <= m; j++) {
      const f = j / m * n, i0 = Math.min(n - 1, Math.floor(f)), r = f - i0;
      const ax = A[i0][0] + (A[i0 + 1][0] - A[i0][0]) * r, az = A[i0][1] + (A[i0 + 1][1] - A[i0][1]) * r;
      const bx = B[i0][0] + (B[i0 + 1][0] - B[i0][0]) * r, bz = B[i0][1] + (B[i0 + 1][1] - B[i0][1]) * r;
      const tx = A[i0 + 1][0] - A[i0][0], tz = A[i0 + 1][1] - A[i0][1], wl = Math.hypot(bx - ax, bz - az) || 1;
      const x = ax + (bx - ax) / wl * PIER_INSET, z = az + (bz - az) / wl * PIER_INSET, y1 = u[i0] + (u[i0 + 1] - u[i0]) * r, y0 = L.heightAt(x, z) - 0.1, rot = Math.atan2(tx, tz);
      k.boxB(PIER_ACROSS, y1 - y0, PIER_ALONG, pierMat, [x, y0, z], [0, rot, 0]);
      ctx.physics?.addBox?.(x, z, PIER_ACROSS, PIER_ALONG, rot, y0, y1);
      built.push({ x, z, y0, y1 });
    }
  }
  return built;
}

export function buildHospitals(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  const { k } = group(ctx, 'lmB-hospitals');
  const out = {};
  // ---------------------------------------------------------------- 気仙沼市立病院
  {
    const sp = SPEC.cityHospital, poly = OSM.cityHospital.poly, gs = groundSpan(L, poly);
    const hs = poly.map(([x, z]) => L.heightAt(x, z)).sort((a, b) => a - b), y0 = hs[Math.floor(hs.length * 0.35)];
    const fh = sp.fh, pTop = y0 + sp.podium * fh, wTop = y0 + sp.wards * fh, t1Top = y0 + HOSP_TERRACE_STOREYS * fh;
    const fac = facadeMat(ctx, 'cityhosp', { draw: paintWindow({ wall: sp.wall, frame: '#d9dde0', glass: ['#58728a', '#aec2d0'], win: [0.06, 0.34, 0.94, 0.78], mull: 3, band: { c: sp.band, y0: 0.05, y1: 0.12 } }), win: [0.06, 0.34, 0.94, 0.78], lit: 0.55 });
    // [v6:outside-hospital r3] the 6-storey wing: five floors of ribbon windows between white slab edges (Commons 65676447)
    const rib = facadeMat(ctx, 'cityhosp-ribbon', { draw: ribbonCell(sp.wall), win: [0.02, 0.3, 0.98, 0.76], lit: 0.55 });
    const timber = facadeMat(ctx, 'cityhosp-timber', { draw: timberCell, win: [2, 2, 3, 3], lit: 0 });
    const concrete = t('#b9b9b5', { paint: 0.03 }), pierMat = t('#a9aaa6', { paint: 0.05 }), wallM = t(sp.wall, { paint: 0.02 });
    const P14 = poly[14], P15 = poly[15];
    const { wing, rest, arm, deck, terrace } = hospitalParts(poly);
    // footing, then the outline walls: the 3-storey outer deck (NE), the 3-storey NW block; the west arm and the wing have their own
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#b3b0a8', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, pTop, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => i >= 8 && i <= 16 }), fac);
    // roofs: outer deck and terrace in the ortho's medium grey, NW block in the light grey
    deckRoof(k, deck, pTop, t(sp.wardRoof, { paint: 0.04 }), wallM, 1.0, new Set([0, 1, 2, 17]));
    deckRoof(k, rest, pTop, t(sp.roof, { paint: 0.04 }), wallM, 1.0, new Set([5, 6]));
    // the NE strip steps down from the wing: a 4-storey terrace beside it (planters), then the 3-storey outer deck
    k.mesh(wallGeo(terrace, pTop, t1Top, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => i < 2 }), fac);
    deckRoof(k, terrace, t1Top, t(sp.wardRoof, { paint: 0.04 }), wallM, 0.9, new Set([0, 1]));
    const planter = t('#7d8f66', { paint: 0.05 }), planterBox = t('#a7a8a3', { paint: 0.04 });
    for (const [a, b] of [[terrace[0], terrace[1]], [terrace[1], terrace[2]]]) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = uz, nz = -ux, rot = Math.atan2(ux, uz), m = Math.floor(len / 7);
      for (let j = 0; j < m; j++) { const s = (j + 0.5) * len / m, x = a[0] + ux * s + nx * 4.6, z = a[1] + uz * s + nz * 4.6; k.boxB(1.4, 0.55, Math.min(5, len / m - 1.4), planterBox, [x, t1Top, z], [0, rot, 0]); k.boxB(1.1, 0.8, Math.min(4.6, len / m - 1.8), planter, [x, t1Top + 0.45, z], [0, rot, 0]); }
    }
    // the west arm (OSM 12 -> 13 and its pair): a 5 m covered link of one storey; the NW block's wall stands above it
    // [r3:audit] the arm lies on the terrace behind the hospital: the DEM steps up 5.5 m in the first 6 m (20.5 at the building, 26.3 from there to the west end) while a flat one-storey
    // slab at y0 + fh (24.2) stood UNDER the ground for 96 % of its area (290 of 301 m2; accuracy.mjs: the hospital's render recall 1.00 -> 0.963). It now follows the terrain: a roof fh above the local ground.
    const armTop0 = hospitalArm(k, L, arm, fh, t('#a9aaa6', { paint: 0.04 }), concrete);
    k.mesh(wallGeo([arm[0], arm[5]], armTop0, pTop, { tu: 3.6, tv: fh, yRef: y0 }), fac);
    // the wing: upper floors flush with the roundabout face (no step in front), pilotis storey with timber panels behind the piers
    const u = [P15[0] - P14[0], P15[1] - P14[1]], fl = Math.hypot(u[0], u[1]); u[0] /= fl; u[1] /= fl;
    const nIn = [u[1], -u[0]], nOut = [-u[1], u[0]];
    const loc = (s, d) => [P14[0] + u[0] * s + nIn[0] * d, P14[1] + u[1] * s + nIn[1] * d];
    k.mesh(wallGeo(wing, y0 + fh, wTop, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => !(i === 0 || i === 5 || i === 6) }), rib);             // west end and tip above the 1F
    k.mesh(wallGeo(wing, y0, y0 + fh, { tu: 7.5, tv: fh, yRef: y0, skip: (i) => !(i === 0 || i === 5 || i === 6) }), timber);          // their 1F: the same timber and glazed bays
    k.mesh(wallGeo(wing, y0 + fh, wTop, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => i !== 7 }), rib);                                     // SW face above the pilotis
    k.mesh(wallGeo(wing, pTop, wTop, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => i !== 1 && i !== 4 }), rib);                             // N edge and the tip's east side over the 3-storey roofs
    k.mesh(wallGeo(wing, t1Top, wTop, { tu: 3.6, tv: fh, yRef: y0, skip: (i) => i !== 2 && i !== 3 }), rib);                            // NE wall over the terrace
    deckRoof(k, wing, wTop, t(sp.roof, { paint: 0.04 }), wallM, 1.2, null);
    {
      const R = HOSP_RECESS, A = loc(0, R), B = loc(fl, R), q = (p, y) => [p[0], y, p[1]];
      k.mesh(wallGeo([A, B], y0, y0 + fh, { tu: 7.5, tv: fh, yRef: y0 }), timber);                                                       // 1F timber-panel band behind the piers
      k.mesh(quadsGeo([[q(P14, y0 + fh - 0.03), q(P15, y0 + fh - 0.03), q(B, y0 + fh - 0.03), q(A, y0 + fh - 0.03), [0, -1, 0]]], 3), concrete);   // soffit of the wall above
      const rot = Math.atan2(u[0], u[1]), m = Math.round(fl / HOSP_PIER_PITCH);
      for (let j = 1; j < m; j++) { const [x, z] = loc(j * fl / m, 0.55); k.boxB(1.1, fh, 1.1, pierMat, [x, y0, z], [0, rot, 0]); }
    }
    // the west stair tower with its balconies (Commons 65676447, left end): a balcony ribbon on each of the five upper floors, white fins along the face, the stair housing above the roof
    {
      const rot = Math.atan2(u[0], u[1]), W = HOSP_TOWER_W, rail = t('#7b8187', { paint: 0.02 }), hc = loc(W / 2, 4.6);
      k.boxB(W, 1.6, 9, wallM, [hc[0], wTop, hc[1]], [0, rot, 0]);
      for (let f = 1; f <= 5; f++) {
        const y = y0 + f * fh - 0.35, cc = loc(W / 2, -0.7), rc = loc(W / 2, -1.45);
        k.boxB(W - 0.6, 0.3, 1.6, concrete, [cc[0], y, cc[1]], [0, rot, 0]);
        k.boxB(W - 0.6, 1.1, 0.12, rail, [rc[0], y + 0.3, rc[1]], [0, rot, 0]);
        for (const s of [0.3, W - 0.3]) { const e = loc(s, -0.8); k.boxB(0.12, 1.1, 1.5, rail, [e[0], y + 0.3, e[1]], [0, rot, 0]); }
      }
      for (const s of [W + 0.3, W + 4.3, W + 8.3]) { const e = loc(s, -0.6); k.boxB(0.5, 5 * fh, 1.2, wallM, [e[0], y0 + fh, e[1]], [0, rot, 0]); }
    }
    // rooftop plant: the penthouse in the middle of the SW roofline with its lower plant room and the flue at the east end (Commons: penthouse
    // mid-roofline); the cooling towers on the NW block's roof (ortho, x -786..-772, z 2005..2018)
    const plant = t('#aeb3b7', { paint: 0.04 }), fanM = t('#6d747c', { paint: 0 }), capM = t('#8d949a', { paint: 0.03 }), rot = Math.atan2(u[0], u[1]);
    const ph = loc(HOSP_PENT.s, HOSP_PENT.d); k.boxB(HOSP_PENT.w, HOSP_PENT.h, HOSP_PENT.dd, t('#eceeed', { paint: 0.03 }), [ph[0], wTop, ph[1]], [0, rot, 0]); k.boxB(HOSP_PENT.w + 0.4, 0.3, HOSP_PENT.dd + 0.4, capM, [ph[0], wTop + HOSP_PENT.h, ph[1]], [0, rot, 0]);
    const pl = loc(HOSP_PENT.s - HOSP_PENT.w / 2 - 11, HOSP_PENT.d - 1.5); k.boxB(20, 2.6, 8, plant, [pl[0], wTop, pl[1]], [0, rot, 0]);
    const fl2 = loc(104, 5); k.cyl(0.4, 0.4, 6.5, fanM, [fl2[0], wTop + 3.25, fl2[1]], null, 10);
    for (const [x, z, w, d] of [[-779, 2012, 14, 9]]) { k.boxB(w, 3.2, d, plant, [x, pTop, z], [0, 0.84, 0]); for (let i = -1; i <= 1; i++) k.cyl(1.1, 1.1, 0.5, fanM, [x + i * 2.6, pTop + 3.4, z], null, 10); }
    const wc = loc(fl / 2, 14);
    // the name on the roof-level fascia of the SW wall near its east (right) end, as in the photo
    const nm = loc(HOSP_SIGN_S, -0.3);
    sign(ctx, k, '気仙沼市立病院', 16, 1.1, nm[0], wTop + 0.6, nm[1], Math.atan2(nOut[0], nOut[1]), { color: '#23557a', bg: '#f4f5f3', depth: 0.2 });
    // [v6:outside-hospital] the BRT / drop-off canopy round the roundabout (replaces the generic 9 x 26 m glass-sided canopy
    // that stood on the OSM outline's longest edge): see hospitalCanopy below
    out.cityHospitalCanopy = { piers: hospitalCanopy(ctx, k, t) };
    colliders(ctx, poly, gs.lo - 2, wTop + 2);
    // ---- the heliport (OSM 761241990): a pale pad with the white circle and H, a windsock
    const hp = POOLS_HELI.helipad.poly, ho = obbOf(hp), hy = groundSpan(L, hp).hi + 0.05;
    const heli = ctx.tex.draw(512, 512, (g, W, H) => { g.fillStyle = '#7fb4c9'; g.fillRect(0, 0, W, H); g.strokeStyle = '#f4f6f4'; g.lineWidth = 26; g.beginPath(); g.arc(W / 2, H / 2, W * 0.36, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#f4f6f4'; g.font = `900 250px ${FONT.en || 'sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', W / 2, H / 2 + 8); g.strokeStyle = '#f2c23c'; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, H - 20); }, { key: 'lmB-heli' });
    const HP = k.group([ho.cx, hy, ho.cz], ho.rotY), kh = ctx.kit(HP);
    kh.box(ho.w + 2, 0.4, ho.d + 2, t('#a9aaa6', { paint: 0.05 }), [0, -0.2, 0]);
    kh.plane(ho.w, ho.d, mapMat(ctx, 'toon', '#ffffff', heli, { paint: 0 }), [0, 0.01, 0], [-Math.PI / 2, 0, 0]);
    kh.box(0.08, 4.5, 0.08, t('#d6d8db', { paint: 0 }), [ho.w / 2 + 2, 2.25, ho.d / 2 + 2]);
    kh.cyl(0.18, 0.32, 1.4, t('#e8542f', { paint: 0 }), [ho.w / 2 + 2.7, 4.3, ho.d / 2 + 2], [0, 0, Math.PI / 2 - 0.25], 8);
    out.cityHospital = { x: wc[0], z: wc[1], y: y0, top: wTop };
    // [v6:outside-hospital r3] what the test reads: the wing's tops and its fixtures in the face frame (s along the roundabout face from OSM vertex 14, d inward)
    out.cityHospitalWing = { y0, pTop, t1Top, wTop, face: [P14, P15], len: fl, pent: { s: HOSP_PENT.s, d: HOSP_PENT.d, top: wTop + HOSP_PENT.h }, sign: { s: HOSP_SIGN_S, y: wTop + 0.6 }, tower: { s0: 0, s1: HOSP_TOWER_W }, piers: Math.round(fl / HOSP_PIER_PITCH) - 1 };
  }
  // ---------------------------------------------------------------- 大友病院
  {
    const sp = SPEC.otomo, poly = OSM.otomo.poly, gs = groundSpan(L, poly), y0 = gs.lo + 0.3, top = y0 + sp.storeys * sp.fh;
    const fac = facadeMat(ctx, 'otomo', { draw: paintWindow({ wall: sp.wall, frame: '#dfe1de', glass: ['#5a7386', '#adc1cd'], win: [0.14, 0.32, 0.86, 0.8], mull: 1, sill: '#c9c6bd' }), win: [0.14, 0.32, 0.86, 0.8], lit: 0.6 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a9a69e', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, top, { tu: 3.0, tv: sp.fh, yRef: y0 }), fac);
    flatRoof(k, poly, top, t(sp.roof, { paint: 0.04 }), t('#e8e6de', { paint: 0.02 }), 0.9);
    const o = obbOf(poly), pc = obbPt(o, -4, -20);
    k.boxB(8, 3.2, 6, t('#ecebe5', { paint: 0.02 }), [pc[0], top, pc[1]], [0, o.rotY, 0]);
    const sg = edges(poly).sort((a, b) => b.len - a.len)[0];
    sign(ctx, k, '大友病院', 6, 1.3, sg.mid[0] + sg.n[0] * 0.15, top - 1.6, sg.mid[1] + sg.n[1] * 0.15, Math.atan2(sg.n[0], sg.n[1]), { color: '#1f6a5a', bg: '#f4f4ef' });
    colliders(ctx, poly, gs.lo - 2, top + 1);
    out.otomo = { x: o.cx, z: o.cz, top };
  }
  return out;
}
