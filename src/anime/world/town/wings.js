// [v4:town-accuracy] Real footprint shapes. A GSI footprint is traced along the roof outline on the aerial photo, and
// about a fifth of the town's area was lost or invented by building every lot on its oriented bounding box (L- and
// T-shaped houses, stepped warehouses, courtyards). This module turns a lot polygon into the pieces the builders need:
//   * wings(lot)       a rectilinear decomposition in the lot's own frame (the OBB frame: local x along obb.w, local z
//                      along obb.d, +z = the street side): the polygon's vertex coordinates, snapped, cut the frame into a
//                      grid; cells whose centre is inside the polygon are filled and merged into maximal rectangles, so
//                      an L-shaped house becomes a main wing and an annex, each with its own roof (cross gables);
//   * outerSides(r, R) which sides of a wing are on the outside of the building (walls are inset under the eaves only
//                      there; a wall on a shared side would open a gap between two wings);
//   * localPoly(lot)   the polygon in that frame; insetRing(ring, d) a mitred inward offset (flat roofs, parapets).
// Pure functions, no three.js: tested in test/v4-town-accuracy.test.js.

const EPS = 1e-6;

export function ringArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(a) / 2; }
export function signedArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return a / 2; }
export function inRing(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}

/** The lot polygon in the OBB frame: world = (cx + lx cos + lz sin, cz - lx sin + lz cos). Drops a closing duplicate. */
export function localPoly(lot) {
  const o = lot.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY);
  const out = [];
  for (const [x, z] of lot.poly) { const dx = x - o.cx, dz = z - o.cz; out.push([dx * c - dz * s, dx * s + dz * c]); }
  if (out.length > 2) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS) out.pop(); }
  return out;
}
/** local (lx, lz) of the OBB frame -> world [x, z] */
export function toWorld(o, lx, lz) { const c = Math.cos(o.rotY), s = Math.sin(o.rotY); return [o.cx + lx * c + lz * s, o.cz - lx * s + lz * c]; }

/** Sorted cut positions: the values clustered within `snap` m (their mean), always including the extremes. */
function cuts(vals, snap) {
  const v = [...vals].sort((a, b) => a - b), out = [];
  let grp = [v[0]];
  for (let i = 1; i < v.length; i++) { if (v[i] - grp[grp.length - 1] <= snap) grp.push(v[i]); else { out.push(grp); grp = [v[i]]; } }
  out.push(grp);
  const c = out.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
  c[0] = v[0]; c[c.length - 1] = v[v.length - 1];
  return c;
}

/**
 * Rectilinear decomposition of a lot polygon.
 * -> { rects: [{ cx, cz, w, d, area }] (largest first, local frame), rect: polygon area / OBB area, fill: covered area /
 *    polygon area, simple: true when the OBB alone is the building (near-rectangular footprints), grid: cut counts }
 */
export function wings(lot, { snap = 0.7, minSide = 1.4, minArea = 5, maxCuts = 14, rectOk = 0.93 } = {}) {
  const o = lot.obb, P = localPoly(lot), A = ringArea(P), boxA = o.w * o.d;
  const whole = { cx: 0, cz: 0, w: o.w, d: o.d, area: boxA };
  const rect = boxA > 0 ? A / boxA : 1;
  if (P.length < 4 || rect >= rectOk) return { rects: [whole], rect, fill: boxA / Math.max(A, EPS), simple: true, grid: [1, 1] };
  const xs = cuts(P.map((p) => p[0]), snap), zs = cuts(P.map((p) => p[1]), snap);
  if (xs.length > maxCuts + 1 || zs.length > maxCuts + 1) return { rects: [whole], rect, fill: boxA / Math.max(A, EPS), simple: true, curvy: true, grid: [xs.length - 1, zs.length - 1] };
  const nx = xs.length - 1, nz = zs.length - 1, cell = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const w = xs[i + 1] - xs[i], d = zs[j + 1] - zs[j];
    if (w < EPS || d < EPS) continue;
    // a cell is in when most of it is: sample the centre and four inner points
    let k = 0; for (const [u, v] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) if (inRing(xs[i] + u * w, zs[j] + v * d, P)) k++;
    cell[j * nx + i] = k >= 3 ? 1 : 0;
  }
  // greedy maximal rectangles: grow the widest run of each row downwards while the rows below have the same run filled
  const used = new Uint8Array(nx * nz), rects = [];
  for (;;) {
    let best = null;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!cell[j * nx + i] || used[j * nx + i]) continue;
      let i1 = i; while (i1 + 1 < nx && cell[j * nx + i1 + 1] && !used[j * nx + i1 + 1]) i1++;
      // every width from i..i1: grow down, keep the largest area
      for (let ie = i; ie <= i1; ie++) {
        let j1 = j;
        const rowOk = (jj) => { for (let q = i; q <= ie; q++) if (!cell[jj * nx + q] || used[jj * nx + q]) return false; return true; };
        while (j1 + 1 < nz && rowOk(j1 + 1)) j1++;
        const a = (xs[ie + 1] - xs[i]) * (zs[j1 + 1] - zs[j]);
        if (!best || a > best.a + EPS) best = { i0: i, i1: ie, j0: j, j1, a };
      }
    }
    if (!best) break;
    for (let j = best.j0; j <= best.j1; j++) for (let i = best.i0; i <= best.i1; i++) used[j * nx + i] = 1;
    const x0 = xs[best.i0], x1 = xs[best.i1 + 1], z0 = zs[best.j0], z1 = zs[best.j1 + 1];
    rects.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, area: (x1 - x0) * (z1 - z0) });
  }
  const kept = rects.filter((r) => Math.min(r.w, r.d) >= minSide && r.area >= minArea).sort((a, b) => b.area - a.area);
  if (!kept.length) return { rects: [whole], rect, fill: boxA / Math.max(A, EPS), simple: true, grid: [nx, nz] };
  const cover = kept.reduce((s, r) => s + r.area, 0);
  return { rects: kept, rect, fill: cover / Math.max(A, EPS), simple: kept.length === 1 && Math.abs(kept[0].w - o.w) < 0.05 && Math.abs(kept[0].d - o.d) < 0.05, grid: [nx, nz] };
}

/** Which sides of rect r touch another rect of R (shared walls): { px, nx, pz, nz } true = outside wall. */
export function outerSides(r, R, tol = 0.05) {
  const out = { px: true, nx: true, pz: true, nz: true };
  const ox0 = r.cx - r.w / 2, ox1 = r.cx + r.w / 2, oz0 = r.cz - r.d / 2, oz1 = r.cz + r.d / 2;
  for (const q of R) {
    if (q === r) continue;
    const qx0 = q.cx - q.w / 2, qx1 = q.cx + q.w / 2, qz0 = q.cz - q.d / 2, qz1 = q.cz + q.d / 2;
    const zOver = Math.min(oz1, qz1) - Math.max(oz0, qz0), xOver = Math.min(ox1, qx1) - Math.max(ox0, qx0);
    if (zOver > 0.5) { if (Math.abs(qx0 - ox1) < tol) out.px = false; if (Math.abs(qx1 - ox0) < tol) out.nx = false; }
    if (xOver > 0.5) { if (Math.abs(qz0 - oz1) < tol) out.pz = false; if (Math.abs(qz1 - oz0) < tol) out.nz = false; }
  }
  return out;
}

/** The body of a wing under its eaves: the rect shrunk by `inset` on its outside walls only. -> { cx, cz, w, d } */
export function bodyOf(r, sides, inset) {
  const x0 = r.cx - r.w / 2 + (sides.nx ? inset : 0), x1 = r.cx + r.w / 2 - (sides.px ? inset : 0);
  const z0 = r.cz - r.d / 2 + (sides.nz ? inset : 0), z1 = r.cz + r.d / 2 - (sides.pz ? inset : 0);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: Math.max(0.6, x1 - x0), d: Math.max(0.6, z1 - z0) };
}

/** Counter-clockwise (in x, z) copy of a ring. */
export function ccw(p) { return signedArea(p) < 0 ? p.slice().reverse() : p.slice(); }

/** Mitred inward offset of a simple ring by d (m); miters are clamped at 3 d. Works on either winding. */
export function insetRing(p, d) {
  const n = p.length, s = signedArea(p) < 0 ? -1 : 1, out = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    // inward normals (for a ring with signed area s)
    const n1 = [(-e1[1] / l1) * s, (e1[0] / l1) * s], n2 = [(-e2[1] / l2) * s, (e2[0] / l2) * s];
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n1[0]; mz = n1[1]; } else { mx /= ml; mz /= ml; }
    const cos = mx * n1[0] + mz * n1[1];
    const k = Math.min(3 * d, d / Math.max(0.2, cos));
    out.push([b[0] + mx * k, b[1] + mz * k]);
  }
  return out;
}

/** Douglas-Peucker on a closed ring (keeps at least 4 points). */
export function simplifyRing(p, tol = 0.25) {
  if (p.length <= 4) return p.slice();
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    let mi = -1, md = 0;
    for (let i = 1; i < pts.length - 1; i++) { const q = pts[i]; const dd = Math.abs((q[0] - a[0]) * dz - (q[1] - a[1]) * dx) / L; if (dd > md) { md = dd; mi = i; } }
    if (md <= tol) return [a, b];
    return dp(pts.slice(0, mi + 1)).slice(0, -1).concat(dp(pts.slice(mi)));
  };
  // split at the farthest pair so both halves are open polylines
  let fi = 0, fd = 0; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > fd) { fd = d; fi = i; } }
  const A = dp(p.slice(0, fi + 1)), B = dp(p.slice(fi).concat([p[0]]));
  const out = A.slice(0, -1).concat(B.slice(0, -1));
  return out.length >= 4 ? out : p.slice();
}
