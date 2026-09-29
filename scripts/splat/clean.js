// Crop + clean a Brush 3DGS PLY of the glass-cased scale model and compute its "gallery" transform.
//
//   env -u NODE_OPTIONS bun scripts/splat/clean.js --ply in.ply --sparse <colmap sparse/0> --out clean.ply \
//       [--report report.json] [--width 3.0] [--yaw 0] [--hmin auto] [--hmax auto] [--gapFrac 0.002] [--margin 0.01] \
//       [--fill] [--fillMode all|holes] [--fillH auto] [--fillColor b5c4c9] [--fillCell 0.003] [--noSeams] \
//       [--minOpacity 0.04] [--maxScale 0.015] [--maxScaleAbs 0.06] [--sorK 10] [--sorStd 2.5]
//
// Model frame: RANSAC plane through the COLMAP points = the model's top surface (water, streets); "up"
// points toward the cameras (they look down through the glass). In-plane axes come from PCA of the plane
// inliers (u = long side). Heights and box limits are fractions of the model's long side W.
// Removal order: bounding box (below the glass, above the reflections' virtual images) -> opacity ->
// scale -> statistical outlier removal (mean distance to k nearest neighbours).
// The PLY keeps its COLMAP coordinates (so SH stays valid); the transform goes in the report/splats.json.
import { readPly, writePly, readColmapImages, readColmapPoints } from "./ply.js";

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

export function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function percentile(arr, p) {
  const a = Float64Array.from(arr).sort();
  if (!a.length) return NaN;
  const i = Math.min(a.length - 1, Math.max(0, (a.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/** RANSAC plane over n points (flat xyz array). Returns unit normal, offset d (n·x = d) and inlier mask. */
export function ransacPlane(xyz, { iters = 800, thresh, seed = 7 } = {}) {
  const n = xyz.length / 3, rnd = mulberry32(seed);
  const P = (i) => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];
  let best = { count: -1 };
  for (let it = 0; it < iters; it++) {
    const a = P(Math.floor(rnd() * n)), b = P(Math.floor(rnd() * n)), c = P(Math.floor(rnd() * n));
    const cr = cross(sub(b, a), sub(c, a)); const l = Math.hypot(...cr); if (l < 1e-12) continue;
    const nn = scale3(cr, 1 / l), d = dot(nn, a);
    let count = 0;
    for (let i = 0; i < n; i++) if (Math.abs(nn[0] * xyz[3 * i] + nn[1] * xyz[3 * i + 1] + nn[2] * xyz[3 * i + 2] - d) < thresh) count++;
    if (count > best.count) best = { count, normal: nn, d };
  }
  // least-squares refit on inliers (PCA smallest eigenvector)
  const inl = new Uint8Array(n); const pts = [];
  for (let i = 0; i < n; i++) if (Math.abs(dot(best.normal, P(i)) - best.d) < thresh) { inl[i] = 1; pts.push(P(i)); }
  const { mean, vecs } = pca(pts);
  let normal = vecs[2]; if (dot(normal, best.normal) < 0) normal = scale3(normal, -1);
  const d = dot(normal, mean);
  for (let i = 0; i < n; i++) inl[i] = Math.abs(dot(normal, P(i)) - d) < thresh ? 1 : 0;
  return { normal, d, inliers: inl, count: inl.reduce((s, v) => s + v, 0) };
}

/** PCA of a list of [x,y,z]: mean and eigenvectors sorted by decreasing eigenvalue (Jacobi). */
export function pca(pts) {
  const m = [0, 0, 0]; for (const p of pts) for (let c = 0; c < 3; c++) m[c] += p[c] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const q = sub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += q[i] * q[j] / pts.length; }
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], A = C.map((r) => r.slice());
  for (let sweep = 0; sweep < 50; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(A[p][q]) < 1e-18) continue;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((i, j) => A[j][j] - A[i][i]);
  return { mean: m, vals: order.map((i) => A[i][i]), vecs: order.map((i) => norm([V[0][i], V[1][i], V[2][i]])) };
}

/**
 * Model frame from SfM points + camera centres.
 * Returns { origin (box centre on the plane), u, up, w (= u x up), halfU, halfW, W (long side, COLMAP units) }.
 */
export function modelFrame(pointsXyz, cameraCenters, { threshFrac = 0.004, pLo = 0.005, pHi = 0.995, margin = 0.01, seed = 7 } = {}) {
  const n = pointsXyz.length / 3;
  const pts = []; for (let i = 0; i < n; i++) pts.push([pointsXyz[3 * i], pointsXyz[3 * i + 1], pointsXyz[3 * i + 2]]);
  const { vals } = pca(pts);
  const extent = Math.sqrt(vals[0]) * 4; // ~ full width of the point cloud
  const plane = ransacPlane(pointsXyz, { thresh: extent * threshFrac, seed });
  let up = plane.normal, d = plane.d;
  const cc = [0, 1, 2].map((c) => cameraCenters.reduce((a, p) => a + p[c], 0) / cameraCenters.length);
  if (dot(up, cc) - d < 0) { up = scale3(up, -1); d = -d; }
  const inl = pts.filter((_, i) => plane.inliers[i]);
  const { vecs } = pca(inl.map((p) => sub(p, scale3(up, dot(up, p) - d)))); // project onto plane
  let u = norm(sub(vecs[0], scale3(up, dot(vecs[0], up))));
  const w = cross(u, up);
  const us = inl.map((p) => dot(p, u)), ws = inl.map((p) => dot(p, w));
  const u0 = percentile(us, pLo), u1 = percentile(us, pHi), w0 = percentile(ws, pLo), w1 = percentile(ws, pHi);
  const W = u1 - u0, mU = margin * W;
  const cu = (u0 + u1) / 2, cw = (w0 + w1) / 2;
  const origin = [0, 1, 2].map((c) => u[c] * cu + w[c] * cw + up[c] * d);
  return { origin, u, up, w, halfU: (u1 - u0) / 2 + mU, halfW: (w1 - w0) / 2 + mU, W, planeInliers: plane.count, planeThresh: extent * threshFrac };
}

/** Express flat xyz in model-frame coordinates (a along u, h along up, b along w), normalised by W. */
export function toModel(frame, x, y, z) {
  const q = [x - frame.origin[0], y - frame.origin[1], z - frame.origin[2]];
  return [dot(q, frame.u) / frame.W, dot(q, frame.up) / frame.W, dot(q, frame.w) / frame.W];
}

/** Statistical outlier removal: mean distance to k nearest neighbours via a uniform hash grid. */
export function sorMask(pos, { k = 10, stdRatio = 2.5, cell } = {}) {
  const n = pos.length / 3;
  if (n <= k) return new Uint8Array(n).fill(1);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = pos[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  if (!cell) { // aim for ~k points per occupied cell on a surface-like cloud
    const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort((a, b) => b - a);
    cell = Math.sqrt((span[0] * span[1]) / (n / k)) || 1e-3;
  }
  const key = (ix, iy, iz) => (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
  const cellOf = (i, c) => Math.floor((pos[3 * i + c] - lo[c]) / cell);
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const kk = key(cellOf(i, 0), cellOf(i, 1), cellOf(i, 2));
    let a = grid.get(kk); if (!a) grid.set(kk, (a = [])); a.push(i);
  }
  const meanD = new Float32Array(n), best = new Float64Array(k), far = cell * 2;
  for (let i = 0; i < n; i++) {
    best.fill(Infinity);
    const cx = cellOf(i, 0), cy = cellOf(i, 1), cz = cellOf(i, 2), px = pos[3 * i], py = pos[3 * i + 1], pz = pos[3 * i + 2];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(key(cx + dx, cy + dy, cz + dz)); if (!a) continue;
      for (let t = 0; t < a.length; t++) {
        const j = a[t]; if (j === i) continue;
        const ex = pos[3 * j] - px, ey = pos[3 * j + 1] - py, ez = pos[3 * j + 2] - pz, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < best[k - 1]) { let m = k - 1; while (m > 0 && best[m - 1] > d2) { best[m] = best[m - 1]; m--; } best[m] = d2; }
      }
    }
    let s = 0; for (let m = 0; m < k; m++) s += best[m] === Infinity ? far : Math.sqrt(best[m]);
    meanD[i] = s / k;
  }
  let mu = 0; for (let i = 0; i < n; i++) mu += meanD[i] / n;
  let v = 0; for (let i = 0; i < n; i++) v += (meanD[i] - mu) ** 2 / n;
  const thr = mu + stdRatio * Math.sqrt(v);
  const keep = new Uint8Array(n); for (let i = 0; i < n; i++) keep[i] = meanD[i] <= thr ? 1 : 0;
  return keep;
}

/** Height band of the model from a list of model-frame heights (fractions of W); see the CLI comment. */
export function autoHeightLimits(hs, { bin = 0.005, gapFrac = 0.002, margin = 0.01, lo = -0.1, hi = 0.3 } = {}) {
  const nb = Math.round((hi - lo) / bin), cnt = new Array(nb).fill(0);
  for (const h of hs) { const k = Math.floor((h - lo) / bin); if (k >= 0 && k < nb) cnt[k]++; }
  const peak = Math.max(...cnt), thr = Math.max(1, peak * gapFrac), k0 = Math.floor((0 - lo) / bin);
  let up = k0; while (up + 1 < nb && !(cnt[up + 1] < thr && (up + 2 >= nb || cnt[up + 2] < thr))) up++;
  let dn = k0; while (dn - 1 >= 0 && !(cnt[dn - 1] < thr && (dn - 2 < 0 || cnt[dn - 2] < thr))) dn--;
  return { hmin: +(lo + dn * bin - margin).toFixed(4), hmax: +(lo + (up + 1) * bin + margin).toFixed(4) };
}

/**
 * Glass-seam removal. The case's glass panels meet in straight seams aligned with the model box; Brush bakes
 * them into the model as lines of dark, elongated splats. For each axis, bin dark (lum < darkLum), elongated
 * (long/mid > aniso) splats whose long axis is within `angleDeg` of that axis by their cross coordinate
 * (bin = binFrac*W); a bin whose along-axis coverage (cells of cellFrac*W) is > `ratio` x the median bin and
 * > `minCover` of the interior length is a seam; its splats (+-1 bin) are dropped. Interior only (edge 5%).
 * Returns { drop: Uint8Array, seams: [{axis, at}] }.
 */
export function seamMask(ply, keep, frame, { darkLum = 0.3, aniso = 3, angleDeg = 20, binFrac = 0.0017, cellFrac = 0.017, ratio = 1.8, minCover = 0.6 } = {}) {
  const { index: ix, stride, data, count } = ply, C0 = 0.28209479177387814;
  const hu = frame.halfU / frame.W, hw = frame.halfW / frame.W, cosT = Math.cos((angleDeg * Math.PI) / 180);
  const cand = []; // [i, a, b, alongU?]
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    const o = i * stride;
    const lum = (3 * 0.5 + C0 * (data[o + ix.f_dc_0] + data[o + ix.f_dc_1] + data[o + ix.f_dc_2])) / 3;
    if (lum >= darkLum) continue;
    const sc = [data[o + ix.scale_0], data[o + ix.scale_1], data[o + ix.scale_2]];
    const order = [0, 1, 2].sort((p, q) => sc[q] - sc[p]);
    if (sc[order[0]] - sc[order[1]] < Math.log(aniso)) continue;
    // long axis direction = rotation applied to the local axis order[0]; quaternion (w,x,y,z)
    const w = data[o + ix.rot_0], x = data[o + ix.rot_1], y = data[o + ix.rot_2], z = data[o + ix.rot_3], n = Math.hypot(w, x, y, z);
    const q = [w / n, x / n, y / n, z / n];
    const R = [
      [1 - 2 * (q[2] ** 2 + q[3] ** 2), 2 * (q[1] * q[2] - q[0] * q[3]), 2 * (q[1] * q[3] + q[0] * q[2])],
      [2 * (q[1] * q[2] + q[0] * q[3]), 1 - 2 * (q[1] ** 2 + q[3] ** 2), 2 * (q[2] * q[3] - q[0] * q[1])],
      [2 * (q[1] * q[3] - q[0] * q[2]), 2 * (q[2] * q[3] + q[0] * q[1]), 1 - 2 * (q[1] ** 2 + q[2] ** 2)],
    ];
    const d = [R[0][order[0]], R[1][order[0]], R[2][order[0]]];
    const du = Math.abs(d[0] * frame.u[0] + d[1] * frame.u[1] + d[2] * frame.u[2]);
    const dw = Math.abs(d[0] * frame.w[0] + d[1] * frame.w[1] + d[2] * frame.w[2]);
    const [a, , b] = toModel(frame, data[o + ix.x], data[o + ix.x + 1], data[o + ix.x + 2]);
    if (Math.abs(a) > 0.95 * hu || Math.abs(b) > 0.95 * hw) continue;
    if (dw > cosT) cand.push([i, a, b, 0]);      // runs along w: seam at constant a
    else if (du > cosT) cand.push([i, a, b, 1]); // runs along u: seam at constant b
  }
  const drop = new Uint8Array(count), seams = [];
  for (const axis of [0, 1]) {
    const cross = axis === 0 ? 1 : 2, alongHalf = axis === 0 ? hw : hu;
    const cells = new Map();
    for (const c of cand) if (c[3] === axis) {
      const k = Math.floor(c[cross] / binFrac); const cell = Math.floor((axis === 0 ? c[2] : c[1]) / cellFrac);
      let st = cells.get(k); if (!st) cells.set(k, (st = new Set())); st.add(cell);
    }
    if (cells.size < 10) continue;
    const cov = [...cells.values()].map((st) => st.size).sort((p, q) => p - q), med = cov[Math.floor(cov.length / 2)];
    const total = (2 * 0.95 * alongHalf) / cellFrac;
    const hot = [...cells.entries()].filter(([, st]) => st.size > ratio * med && st.size > minCover * total).map(([k]) => Number(k));
    const hotSet = new Set(hot.flatMap((k) => [k - 1, k, k + 1]));
    for (const k of hot) seams.push({ axis: axis === 0 ? "along-w" : "along-u", at: +(k * binFrac).toFixed(4) });
    for (const c of cand) if (c[3] === axis && hotSet.has(Math.floor(c[cross] / binFrac))) drop[c[0]] = 1;
  }
  return { drop, seams };
}

/** Decide which splats to keep. Returns { keep: Uint8Array, stats }. */
export function cleanSplats(ply, frame, opts = {}) {
  const { hmin = -0.03, hmax = 0.2, minOpacity = 0.04, maxScale = 0.015, maxScaleAbs = 0.06, sorK = 10, sorStd = 2.5 } = opts;
  const { index: ix, stride, data, count } = ply;
  const X = ix.x, O = ix.opacity, S0 = ix.scale_0;
  const keep = new Uint8Array(count);
  const stats = { input: count, box: 0, opacity: 0, scale: 0, seam: 0, sor: 0 };
  // scale rule: flat discs lying on the model (textureless water, roofs) are fine; blobs and long needles are
  // floaters. Reject when the middle axis > maxScale*W or the longest axis > maxScaleAbs*W.
  const maxLogScale = Math.log(maxScale * frame.W), maxLogAbs = Math.log(maxScaleAbs * frame.W), minLogit = Math.log(minOpacity / (1 - minOpacity));
  const hu = frame.halfU / frame.W, hw = frame.halfW / frame.W;
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    const [a, h, b] = toModel(frame, data[o + X], data[o + X + 1], data[o + X + 2]);
    if (Math.abs(a) > hu || Math.abs(b) > hw || h < hmin || h > hmax) { stats.box++; continue; }
    if (data[o + O] < minLogit) { stats.opacity++; continue; }
    const s0 = data[o + S0], s1 = data[o + S0 + 1], s2 = data[o + S0 + 2];
    const mx = Math.max(s0, s1, s2), mid = s0 + s1 + s2 - mx - Math.min(s0, s1, s2);
    if (mid > maxLogScale || mx > maxLogAbs) { stats.scale++; continue; }
    keep[i] = 1;
  }
  if (opts.seams !== false) {
    const { drop, seams } = seamMask(ply, keep, frame, opts.seamOpts ?? {});
    let n = 0; for (let i = 0; i < count; i++) if (drop[i] && keep[i]) { keep[i] = 0; n++; }
    stats.seam = n; stats.seams = seams;
  }
  if (sorK > 0) {
    const idx = []; for (let i = 0; i < count; i++) if (keep[i]) idx.push(i);
    const pos = new Float32Array(idx.length * 3);
    idx.forEach((i, j) => { pos[3 * j] = data[i * stride + X]; pos[3 * j + 1] = data[i * stride + X + 1]; pos[3 * j + 2] = data[i * stride + X + 2]; });
    const m = sorMask(pos, { k: sorK, stdRatio: sorStd });
    idx.forEach((i, j) => { if (!m[j]) { keep[i] = 0; stats.sor++; } });
  }
  stats.output = keep.reduce((s, v) => s + v, 0);
  return { keep, stats };
}

/**
 * Fill holes in the model's footprint (typically the textureless pale water under glass) with a flat layer
 * of synthetic splats at `h` (model-frame height, fraction of W). Cells (size cell*W) that contain no kept
 * splat with opacity >= 0.3 (after a 1-cell dilation) get one flat, opaque disc of `color`.
 * Returns a new PLY-like object (kept rows + fill rows) and the number of fill splats.
 */
export function fillBase(ply, keep, frame, { h = -0.008, cell = 0.004, color = [0.71, 0.77, 0.79], opacity = 0.97, dilate = 1, all = false } = {}) {
  const { index: ix, stride, data, count } = ply;
  const nu = Math.ceil((2 * frame.halfU) / (cell * frame.W)), nw = Math.ceil((2 * frame.halfW) / (cell * frame.W));
  const occ = new Uint8Array(nu * nw), minLogit = Math.log(0.3 / 0.7);
  const hu = frame.halfU / frame.W, hw = frame.halfW / frame.W;
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    const o = i * stride; if (data[o + ix.opacity] < minLogit) continue;
    const [a, , b] = toModel(frame, data[o + ix.x], data[o + ix.x + 1], data[o + ix.x + 2]);
    const cu = Math.floor((a + hu) / cell), cw = Math.floor((b + hw) / cell);
    if (cu >= 0 && cu < nu && cw >= 0 && cw < nw) occ[cw * nu + cu] = 1;
  }
  const occD = new Uint8Array(occ);
  for (let cw = 0; cw < nw; cw++) for (let cu = 0; cu < nu; cu++) if (occ[cw * nu + cu])
    for (let dw = -dilate; dw <= dilate; dw++) for (let du = -dilate; du <= dilate; du++) {
      const x = cu + du, y = cw + dw; if (x >= 0 && x < nu && y >= 0 && y < nw) occD[y * nu + x] = 1;
    }
  // all=true: a complete base layer under the whole footprint (no dark halos where the reconstruction is thin)
  const fills = []; for (let k = 0; k < nu * nw; k++) if (all || !occD[k]) fills.push(k);
  const nKeep = keep.reduce((a, v) => a + v, 0), out = new Float32Array((nKeep + fills.length) * stride);
  let j = 0; for (let i = 0; i < count; i++) if (keep[i]) out.set(data.subarray(i * stride, (i + 1) * stride), stride * j++);
  // splat local axes -> world: x->u, y->up (thin), z->w; columns of M are u, up, w
  const M = [frame.u[0], frame.up[0], frame.w[0], frame.u[1], frame.up[1], frame.w[1], frame.u[2], frame.up[2], frame.w[2]];
  const [qx, qy, qz, qw] = matToQuat(M);
  const C0 = 0.28209479177387814, sXZ = Math.log(0.8 * cell * frame.W), sY = Math.log(0.02 * cell * frame.W);
  for (const k of fills) {
    const cu = k % nu, cw = Math.floor(k / nu);
    const a = (cu + 0.5) * cell - hu, b = (cw + 0.5) * cell - hw;
    const p = [0, 1, 2].map((c) => frame.origin[c] + frame.W * (frame.u[c] * a + frame.up[c] * h + frame.w[c] * b));
    const o = stride * j++;
    for (let t = 0; t < stride; t++) out[o + t] = 0;
    out[o + ix.x] = p[0]; out[o + ix.y] = p[1]; out[o + ix.z] = p[2];
    out[o + ix.f_dc_0] = (color[0] - 0.5) / C0; out[o + ix.f_dc_1] = (color[1] - 0.5) / C0; out[o + ix.f_dc_2] = (color[2] - 0.5) / C0;
    out[o + ix.opacity] = Math.log(opacity / (1 - opacity));
    out[o + ix.scale_0] = sXZ; out[o + ix.scale_1] = sY; out[o + ix.scale_2] = sXZ;
    out[o + ix.rot_0] = qw; out[o + ix.rot_1] = qx; out[o + ix.rot_2] = qy; out[o + ix.rot_3] = qz;
  }
  return { ply: { ...ply, count: nKeep + fills.length, data: out }, filled: fills.length, grid: [nu, nw] };
}

/** Rotation matrix (row-major, rows = target axes in source coords) -> quaternion [x,y,z,w]. */
export function matToQuat(m) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m, tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  const l = Math.hypot(x, y, z, w); return [x / l, y / l, z / l, w / l];
}

/**
 * three.js object transform (position, quaternion, scale) that maps PLY/COLMAP coords to the gallery:
 * model base plane at y=0, box centre at the origin, long side along x scaled to `width` metres,
 * then rotated by `yawDeg` about +y (use it to point the model's north arrow to -z).
 */
export function galleryTransform(frame, { width = 3.0, yawDeg = 0 } = {}) {
  const s = width / frame.W;
  const t = (yawDeg * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
  // base rotation rows: x' = u, y' = up, z' = w  (w = u x up keeps it right-handed)
  const B = [...frame.u, ...frame.up, ...frame.w];
  const Y = [c, 0, sn, 0, 1, 0, -sn, 0, c]; // R_y(t)
  const R = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[3 * i + j] += Y[3 * i + k] * B[3 * k + j];
  const Ro = [0, 1, 2].map((i) => R[3 * i] * frame.origin[0] + R[3 * i + 1] * frame.origin[1] + R[3 * i + 2] * frame.origin[2]);
  return { position: Ro.map((v) => -s * v), quaternion: matToQuat(R), scale: s, matrix: R };
}

export function applyTransform(tf, p) {
  const R = tf.matrix;
  return [0, 1, 2].map((i) => tf.position[i] + tf.scale * (R[3 * i] * p[0] + R[3 * i + 1] * p[1] + R[3 * i + 2] * p[2]));
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) o[k] = true; else { o[k] = v; i++; } }
  return o;
}

if (import.meta.main) {
  const a = parseArgs(process.argv.slice(2));
  const num = (k, d) => (a[k] === undefined ? d : Number(a[k]));
  const t0 = performance.now();
  const imgs = readColmapImages(await Bun.file(`${a.sparse}/images.bin`).bytes());
  const pts = readColmapPoints(await Bun.file(`${a.sparse}/points3D.bin`).bytes());
  // SfM points with a decent track only (drops most reflection-induced junk)
  const good = []; for (let i = 0; i < pts.count; i++) if (pts.track[i] >= 3 && pts.err[i] < 2) good.push(pts.xyz[3 * i], pts.xyz[3 * i + 1], pts.xyz[3 * i + 2]);
  const frame = modelFrame(Float64Array.from(good), imgs.map((im) => im.center), { margin: num("margin", 0.01) });
  // automatic height limits: walk a 0.005 W histogram of SfM point heights inside the box outward from the
  // plane until the density falls below `gapFrac` of the peak (the empty gap between the model's tallest
  // features and the glass / room above it, and between the base and the mirrored images below it).
  const hs = [];
  for (let i = 0; i < good.length / 3; i++) {
    const [u, h, w] = toModel(frame, good[3 * i], good[3 * i + 1], good[3 * i + 2]);
    if (Math.abs(u) < frame.halfU / frame.W && Math.abs(w) < frame.halfW / frame.W) hs.push(h);
  }
  const { hmin: hminAuto, hmax: hmaxAuto } = autoHeightLimits(hs, { gapFrac: num("gapFrac", 0.002) });
  const opts = { hmin: a.hmin && a.hmin !== "auto" ? Number(a.hmin) : hminAuto, hmax: a.hmax && a.hmax !== "auto" ? Number(a.hmax) : hmaxAuto, minOpacity: num("minOpacity", 0.04),
    seams: !a.noSeams, maxScale: num("maxScale", 0.015), maxScaleAbs: num("maxScaleAbs", 0.06), sorK: num("sorK", 10), sorStd: num("sorStd", 2.5) };
  const ply = readPly(await Bun.file(a.ply).bytes());
  const { keep, stats } = cleanSplats(ply, frame, opts);
  let outPly = ply, outKeep = keep, fill = null;
  if (a.fill) {
    // fill height: low percentile of kept splat heights (the model's water surface)
    const hk = []; for (let i = 0; i < ply.count; i += 7) if (keep[i]) { const o = i * ply.stride; hk.push(toModel(frame, ply.data[o + ply.index.x], ply.data[o + ply.index.x + 1], ply.data[o + ply.index.x + 2])[1]); }
    const hFill = a.fillH !== undefined ? Number(a.fillH) : percentile(hk, 0.03);
    const color = a.fillColor ? a.fillColor.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255) : [0.71, 0.77, 0.79];
    const r = fillBase(ply, keep, frame, { h: hFill, cell: num("fillCell", 0.003), color, all: (a.fillMode ?? "all") === "all" });
    outPly = r.ply; outKeep = null; fill = { filled: r.filled, grid: r.grid, h: hFill, color, mode: a.fillMode ?? "all" };
    stats.fill = r.filled;
  }
  if (a.out) await Bun.write(a.out, writePly(outPly, outKeep));
  const tf = galleryTransform(frame, { width: num("width", 3.0), yawDeg: num("yaw", 0) });
  const camsG = imgs.map((im) => applyTransform(tf, im.center));
  const hist = [-0.05, -0.02, -0.01, 0, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 1].map((e) => [e, hs.filter((h) => h < e).length]);
  const report = { input: a.ply, output: a.out ?? null, sparse: a.sparse, images: imgs.length, sfmPoints: pts.count, sfmPointsUsed: good.length / 3,
    frame: { ...frame, planeInliers: frame.planeInliers }, opts, fill, hminAuto, hmaxAuto, heightCdf: hist, stats, transform: tf,
    galleryHeightAboveModelOfCameras: { min: Math.min(...camsG.map((c) => c[1])), median: percentile(camsG.map((c) => c[1]), 0.5), max: Math.max(...camsG.map((c) => c[1])) },
    galleryFootprint: { x: [-tf.scale * frame.halfU, tf.scale * frame.halfU], z: [-tf.scale * frame.halfW, tf.scale * frame.halfW] },
    seconds: Math.round((performance.now() - t0) / 100) / 10 };
  if (a.report) await Bun.write(a.report, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ stats, W: frame.W, halfU: frame.halfU, halfW: frame.halfW, hmax: opts.hmax, planeInliers: frame.planeInliers, sfm: good.length / 3, cams: report.galleryHeightAboveModelOfCameras, seconds: report.seconds }));
}
