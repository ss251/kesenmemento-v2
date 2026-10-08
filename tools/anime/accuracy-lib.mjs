// [v4:town-accuracy] Pure helpers of tools/anime/accuracy.mjs (raster masks and colour difference), tested in
// test/v4-town-accuracy.test.js.

/** scanline fill of a ring (+ holes cleared) into mask (px x px) of a tile; val bit */
export function fillRing(mask, px, x0, z0, res, ring, val, clear = false) {
  let zmin = Infinity, zmax = -Infinity; for (const p of ring) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const j0 = Math.max(0, Math.floor((zmin - z0) / res)), j1 = Math.min(px - 1, Math.ceil((zmax - z0) / res));
  for (let j = j0; j <= j1; j++) {
    const zz = z0 + (j + 0.5) * res, xs = [];
    for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xa, za] = ring[i], [xb, zb] = ring[k]; if ((za > zz) !== (zb > zz)) xs.push(xa + ((zz - za) / (zb - za)) * (xb - xa)); }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - x0) / res - 0.5)), i1 = Math.min(px - 1, Math.floor((xs[q + 1] - x0) / res - 0.5));
      for (let i = i0; i <= i1; i++) { if (clear) mask[j * px + i] &= ~val; else mask[j * px + i] |= val; }
    }
  }
}
/** thick polyline into a mask (disc stamps every res/2 along the line) */
export function stampLine(mask, px, x0, z0, res, pts, halfW, val) {
  const r = Math.max(res * 0.5, halfW), ri = Math.ceil(r / res);
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (res * 0.5)));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n, ci = Math.floor((x - x0) / res), cj = Math.floor((z - z0) / res);
      for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= px || j >= px) continue;
        const qx = x0 + (i + 0.5) * res - x, qz = z0 + (j + 0.5) * res - z; if (qx * qx + qz * qz <= r * r) mask[j * px + i] |= val;
      }
    }
  }
}
// sRGB -> Lab (D65) and CIEDE2000
export function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  X = t(X); Y = t(Y); Z = t(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
export function dE2000(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2), dL = L2 - L1, dC = C2p - C1p;
  let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad), Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dT = 30 * Math.exp(-(((hm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T, Rt = -Math.sin(2 * dT * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

// ------------------------------------------------------------------ [sys:27] the rendered footprint of a building landmark against its OSM outline
/** distance (m) from a point to a ring's outline */
export function ringEdgeDist(x, z, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, az] = ring[j], [bx, bz] = ring[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); }
  return d;
}
const inRing = (x, z, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
/**
 * Score a render mask against an OSM outline (not against a connected blob, so neighbouring canopies and annexes do not count):
 *   recall    = share of the outline's pixels rendered as building (height above `buildM` m);
 *   precision = share of the rendered building pixels within the outline dilated by `dilate` m that fall inside the outline itself;
 *   iou       = from those counts (inside / (outline + building within the dilated outline - inside));
 *   centroidErr = the distance from the centroid of the rendered pixels inside the dilated outline to the outline's area centroid.
 * h: Uint8 heights above the terrain in 0.25 m units (accuracy.mjs acc.mask), px x px over a square `size` m centred on (cx, cz), north up.
 * A landmark passes with iou >= 0.7 and centroidErr <= 5 m. -> { recall, precision, iou, centroidErr, pass, outlinePx, buildingPx }
 */
export function landmarkScore({ h, px, size, cx, cz, poly, buildM = 2.2, dilate = 6, minIou = 0.7, maxErr = 5 }) {
  const res = size / px, x0 = cx - size / 2, z0 = cz - size / 2;
  let zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity; for (const p of poly) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const i0 = Math.max(0, Math.floor((xmin - dilate - x0) / res)), i1 = Math.min(px - 1, Math.ceil((xmax + dilate - x0) / res)), j0 = Math.max(0, Math.floor((zmin - dilate - z0) / res)), j1 = Math.min(px - 1, Math.ceil((zmax + dilate - z0) / res));
  let outline = 0, inside = 0, near = 0, sx = 0, sz = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res, building = h[j * px + i] > buildM * 4;
    const inP = inRing(x, z, poly);
    if (inP) { outline++; if (building) inside++; }
    if (building && (inP || ringEdgeDist(x, z, poly) <= dilate)) { near++; sx += x; sz += z; }
  }
  // the outline's area centroid
  let a = 0, gx = 0, gz = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const c = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += c; gx += (poly[j][0] + poly[i][0]) * c; gz += (poly[j][1] + poly[i][1]) * c; }
  const ocx = Math.abs(a) > 1e-9 ? gx / (3 * a) : (xmin + xmax) / 2, ocz = Math.abs(a) > 1e-9 ? gz / (3 * a) : (zmin + zmax) / 2;
  const recall = outline ? inside / outline : 0, precision = near ? inside / near : 0, union = outline + near - inside, iou = union ? inside / union : 0;
  const centroidErr = near ? Math.hypot(sx / near - ocx, sz / near - ocz) : Infinity;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { recall: r3(recall), precision: r3(precision), iou: r3(iou), centroidErr: Number.isFinite(centroidErr) ? Math.round(centroidErr * 10) / 10 : null, pass: iou >= minIou && centroidErr <= maxErr, outlinePx: outline, buildingPx: near };
}

// ------------------------------------------------------------------ [r3:19] coverage of the audit over the accuracy cells
/**
 * The headline numbers (buildings.iou, roofs, roads, heights) score only what lies inside the audit region: for the default `core` that is the 1.1 km mid-zone disc round (250, 150), so c4 (59 of its 126
 * lots), c12 (28 of 44), c9 (242 of 308) and c1 (159 of 160) are only partly measured and the headline says nothing about their other lots. These pure helpers make the coverage explicit.
 * cells: data/anime/cells.json `cells` ({ id: { bbox: [x0, z0, x1, z1] } }); the pier7 cell (PIER7 / the south shore) belongs to the photo-survey workflow and is left out unless asked for.
 */
export function cellIdAt(cells, x, z, { skip = ['pier7', 'kameyama', 'asahi'] } = {}) {
  for (const [id, c] of Object.entries(cells)) { if (skip.includes(id)) continue; const b = c.bbox; if (x >= b[0] && x < b[2] && z >= b[1] && z < b[3]) return id; }
  return null;
}
/**
 * items: [{ cx, cz, area }] (footprint centres and areas). scored(item) -> was it inside the audited region AND inside a rendered tile.
 * -> { cells: { [id]: { n, scored, share, area, areaScored, areaShare } }, all: { n, scored, share, area, areaScored, areaShare } }
 */
export function cellCoverage(cells, items, scored) {
  const blank = () => ({ n: 0, scored: 0, area: 0, areaScored: 0 });
  const out = {}, all = blank();
  for (const id of Object.keys(cells)) if (!['pier7', 'kameyama', 'asahi'].includes(id)) out[id] = blank();
  for (const it of items) {
    const id = cellIdAt(cells, it.cx, it.cz); if (!id) continue;
    const s = !!scored(it), a = it.area || 0;
    for (const t of [out[id], all]) { t.n++; t.area += a; if (s) { t.scored++; t.areaScored += a; } }
  }
  const fin = (t) => ({ n: t.n, scored: t.scored, share: t.n ? Math.round((t.scored / t.n) * 1000) / 1000 : null, area: Math.round(t.area), areaScored: Math.round(t.areaScored), areaShare: t.area ? Math.round((t.areaScored / t.area) * 1000) / 1000 : null });
  return { cells: Object.fromEntries(Object.entries(out).map(([id, t]) => [id, fin(t)])), all: fin(all) };
}
/** the share (0..1, 3 decimals) a / b, null for an empty b */
export const shareOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
