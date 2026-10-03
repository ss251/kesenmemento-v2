// [v6:survey] Small, dependency-free geometry kit for the photo surveys (tools/anime/survey/*, tools/anime/photo-align.mjs,
// tools/anime/survey-diff.mjs): COLMAP text-model reader, camera models (COLMAP's OPENCV / RADIAL / SIMPLE_RADIAL /
// PINHOLE conventions), similarity alignment (Horn / Umeyama), PCA plane and line fits, RANSAC, a damped Gauss-Newton
// (Levenberg-Marquardt) solver with a numeric Jacobian, multi-view triangulation, the app's ENU frame and the DEM.
//
// Frames:
//   * COLMAP camera: x right, y down, z forward; x_cam = R * X + t, the centre C = -R^T t.
//   * ENU (the app's world): x = east, y = up (T.P. metres), z = south; x = (lon - 141.575) * 86744, z = -(lat - 38.906) * 111014.
//   * three.js camera: x right, y up, looking down -z; its world rotation is R_c2w * diag(1, -1, -1).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ------------------------------------------------------------------ small linear algebra (row-major arrays)
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const scale = (a, s) => a.map((v) => v * s);
export const norm = (a) => Math.sqrt(dot(a, a));
export const unit = (a) => scale(a, 1 / norm(a));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 3x3 matrix (array of 3 rows) times vector. */
export const mv = (M, v) => M.map((r) => dot(r, v));
export const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
export const tr = (M) => M[0].map((_, j) => M.map((r) => r[j]));
export const mean = (pts) => pts[0].map((_, j) => pts.reduce((s, p) => s + p[j], 0) / pts.length);
export function median(a) { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
export const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));

/** Solve A x = b (A n x n) by Gaussian elimination with partial pivoting. */
export function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; if (Math.abs(d) < 1e-300) throw new Error('singular system');
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
/** Inverse of a small square matrix. */
export function inv(A) { const n = A.length; return tr(A.map((_, j) => solve(A, A.map((__, i) => (i === j ? 1 : 0))))); }

/** Jacobi eigen-decomposition of a symmetric matrix -> { values (descending), vectors (columns as arrays) }. */
export function eigSym(S) {
  const n = S.length, A = S.map((r) => [...r]), V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [...Array(n).keys()].sort((a, b) => A[b][b] - A[a][a]);
  return { values: idx.map((i) => A[i][i]), vectors: idx.map((i) => V.map((r) => r[i])) };
}

// ------------------------------------------------------------------ rotations
/** Unit quaternion [w, x, y, z] -> 3x3 rotation (COLMAP's convention). */
export function qToR([w, x, y, z]) {
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
}
export function rToQ(R) {
  const t = R[0][0] + R[1][1] + R[2][2]; let w, x, y, z;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s; }
  else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; w = (R[2][1] - R[1][2]) / s; x = s / 4; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s; }
  else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = s / 4; z = (R[1][2] + R[2][1]) / s; }
  else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = s / 4; }
  const q = [w, x, y, z], n = norm(q); return scale(w < 0 ? scale(q, -1) : q, 1 / n);
}
/** Rotation vector (axis * angle, radians) -> 3x3. */
export function rvecToR(r) {
  const th = norm(r); if (th < 1e-12) return [[1, -r[2], r[1]], [r[2], 1, -r[0]], [-r[1], r[0], 1]];
  const [x, y, z] = scale(r, 1 / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
export function rToRvec(R) {
  const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2)), th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  const k = th / (2 * Math.sin(th)); return [(R[2][1] - R[1][2]) * k, (R[0][2] - R[2][0]) * k, (R[1][0] - R[0][1]) * k];
}
/** Rotation angle between two rotation matrices (degrees). */
export function rotAngleDeg(A, B) { const R = mm(tr(A), B); return Math.acos(Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2))) * 180 / Math.PI; }

/** three.js Euler 'YXZ' (yaw about +y, pitch about x, roll about z) of a three.js camera world rotation (3x3). */
export function threeYawPitchRoll(Rw) {
  // three.js Euler.setFromRotationMatrix, order YXZ
  const m13 = Rw[0][2], m22 = Rw[1][1], m23 = Rw[1][2], m11 = Rw[0][0], m21 = Rw[1][0], m31 = Rw[2][0], m33 = Rw[2][2];
  const x = Math.asin(-Math.max(-1, Math.min(1, m23)));
  let y, z;
  if (Math.abs(m23) < 0.9999999) { y = Math.atan2(m13, m33); z = Math.atan2(m21, m22); } else { y = Math.atan2(-m31, m11); z = 0; }
  const D = 180 / Math.PI; return { yaw: y * D, pitch: x * D, roll: z * D };
}

// ------------------------------------------------------------------ camera models (COLMAP conventions)
const NPARAM = { SIMPLE_PINHOLE: 3, PINHOLE: 4, SIMPLE_RADIAL: 4, RADIAL: 5, OPENCV: 8, OPENCV_FISHEYE: 8, FULL_OPENCV: 12 };
/** Normalise a COLMAP camera to { model, width, height, fx, fy, cx, cy, dist: { k1, k2, p1, p2, k3, k4, k5, k6 } }. */
export function cameraOf(model, width, height, p) {
  const d = { k1: 0, k2: 0, p1: 0, p2: 0, k3: 0, k4: 0, k5: 0, k6: 0 };
  let fx, fy, cx, cy;
  switch (model) {
    case 'SIMPLE_PINHOLE': [fx, cx, cy] = p; fy = fx; break;
    case 'PINHOLE': [fx, fy, cx, cy] = p; break;
    case 'SIMPLE_RADIAL': [fx, cx, cy, d.k1] = p; fy = fx; break;
    case 'RADIAL': [fx, cx, cy, d.k1, d.k2] = p; fy = fx; break;
    case 'OPENCV': [fx, fy, cx, cy, d.k1, d.k2, d.p1, d.p2] = p; break;
    case 'FULL_OPENCV': [fx, fy, cx, cy, d.k1, d.k2, d.p1, d.p2, d.k3, d.k4, d.k5, d.k6] = p; break;
    default: throw new Error('unsupported camera model ' + model);
  }
  return { model, width, height, fx, fy, cx, cy, dist: d };
}
/** Apply the (FULL_)OPENCV distortion to normalised image coordinates. */
export function distortN(x, y, d) {
  const r2 = x * x + y * y, r4 = r2 * r2, r6 = r4 * r2;
  const rad = (1 + d.k1 * r2 + d.k2 * r4 + d.k3 * r6) / (1 + d.k4 * r2 + d.k5 * r4 + d.k6 * r6);
  return [x * rad + 2 * d.p1 * x * y + d.p2 * (r2 + 2 * x * x), y * rad + d.p1 * (r2 + 2 * y * y) + 2 * d.p2 * x * y];
}
/** Invert distortN by fixed-point iteration (converges for the iPhone lenses well inside the frame). */
export function undistortN(xd, yd, d) {
  let x = xd, y = yd;
  for (let i = 0; i < 30; i++) { const [ex, ey] = distortN(x, y, d); const dx = ex - xd, dy = ey - yd; x -= dx; y -= dy; if (dx * dx + dy * dy < 1e-24) break; }
  return [x, y];
}
/** World point -> pixel for a camera { R, t } and intrinsics cam; null behind the camera. */
export function project(cam, pose, X) {
  const Xc = add(mv(pose.R, X), pose.t); if (Xc[2] <= 1e-6) return null;
  const [x, y] = distortN(Xc[0] / Xc[2], Xc[1] / Xc[2], cam.dist);
  return [cam.fx * x + cam.cx, cam.fy * y + cam.cy];
}
/** Pixel -> unit ray in the camera frame (undistorted). */
export function pixelRay(cam, u, v) { const [x, y] = undistortN((u - cam.cx) / cam.fx, (v - cam.cy) / cam.fy, cam.dist); return unit([x, y, 1]); }
export const centre = (pose) => scale(mv(tr(pose.R), pose.t), -1);

// ------------------------------------------------------------------ COLMAP text model
/** Read a COLMAP sparse model directory (TXT; run `colmap model_converter --output_type TXT` first). */
export function readColmapText(dir) {
  const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const cameras = {};
  for (const l of lines('cameras.txt')) { const a = l.trim().split(/\s+/); cameras[a[0]] = cameraOf(a[1], +a[2], +a[3], a.slice(4).map(Number)); }
  // images.txt: two lines per image, the second (the 2D points) may be empty: keep empty lines here
  const images = {}; const L = readFileSync(join(dir, 'images.txt'), 'utf8').split('\n').filter((l) => !l.startsWith('#'));
  for (let i = 0; i < L.length; i += 2) {
    if (!L[i].trim()) break;
    const a = L[i].trim().split(/\s+/), q = a.slice(1, 5).map(Number), t = a.slice(5, 8).map(Number);
    const pts = (L[i + 1] || '').trim().split(/\s+/).filter(Boolean).map(Number), obs = [];
    for (let k = 0; k + 2 < pts.length + 1; k += 3) if (pts[k + 2] !== -1 && pts.length) obs.push({ xy: [pts[k], pts[k + 1]], p3: pts[k + 2] });
    images[a[9]] = { id: +a[0], name: a[9], camera: a[8], q, R: qToR(q), t, obs };
  }
  const points = new Map();
  if (existsSync(join(dir, 'points3D.txt'))) for (const l of lines('points3D.txt')) {
    const a = l.trim().split(/\s+/).map(Number);
    const track = []; for (let k = 8; k + 1 < a.length; k += 2) track.push([a[k], a[k + 1]]);
    points.set(a[0], { id: a[0], X: [a[1], a[2], a[3]], rgb: [a[4], a[5], a[6]], err: a[7], track });
  }
  return { cameras, images, points };
}

// ------------------------------------------------------------------ fits
/** Least-squares similarity B ~ s R A + t (Umeyama 1991). -> { s, R, t, rms } */
export function umeyama(A, B, withScale = true) {
  const n = A.length, ma = mean(A), mb = mean(B);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let va = 0;
  for (let i = 0; i < n; i++) { const a = sub(A[i], ma), b = sub(B[i], mb); va += dot(a, a); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += b[r] * a[c]; }
  // Horn's quaternion method on the cross-covariance (b a^T): the best rotation maximises sum b . R a
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = tr(S);
  const N = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz], [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const R = qToR(eigSym(N).vectors[0]);
  let num = 0; for (let i = 0; i < n; i++) num += dot(sub(B[i], mb), mv(R, sub(A[i], ma)));
  const s = withScale ? num / va : 1, t = sub(mb, scale(mv(R, ma), s));
  const res = A.map((a, i) => norm(sub(add(scale(mv(R, a), s), t), B[i])));
  return { s, R, t, rms: rms(res), res };
}
export const applySim = (T, X) => add(scale(mv(T.R, X), T.s), T.t);
/** PCA plane through points -> { n (unit normal), c (centroid), d (n . x = d), rms }. */
export function fitPlane(P) {
  const c = mean(P), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const q = sub(p, c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r][k] += q[r] * q[k]; }
  const n = eigSym(C).vectors[2];
  return { n, c, d: dot(n, c), rms: rms(P.map((p) => dot(n, p) - dot(n, c))) };
}
/** PCA 3D line -> { u (unit direction), c, rms } */
export function fitLine(P) {
  const c = mean(P), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const q = sub(p, c); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r][k] += q[r] * q[k]; }
  const u = eigSym(C).vectors[0];
  return { u, c, rms: rms(P.map((p) => { const q = sub(p, c); return norm(sub(q, scale(u, dot(q, u)))); })) };
}
/** Deterministic RANSAC plane: -> { plane, inliers } */
export function ransacPlane(P, tol, iters = 2000, seed = 1, accept = null) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let best = null;
  for (let i = 0; i < iters; i++) {
    const a = P[Math.floor(rnd() * P.length)], b = P[Math.floor(rnd() * P.length)], c = P[Math.floor(rnd() * P.length)];
    const n0 = cross(sub(b, a), sub(c, a)), l = norm(n0); if (l < 1e-9) continue;
    const n = scale(n0, 1 / l); if (accept && !accept(n)) continue;
    const d = dot(n, a), inl = []; for (let k = 0; k < P.length; k++) if (Math.abs(dot(n, P[k]) - d) < tol) inl.push(k);
    if (!best || inl.length > best.inliers.length) best = { inliers: inl };
  }
  if (!best) return null;
  return { plane: fitPlane(best.inliers.map((k) => P[k])), inliers: best.inliers };
}

// ------------------------------------------------------------------ Levenberg-Marquardt
/** Minimise sum r(x)^2. f(x) -> residual array. -> { x, cost, iters, J (at the solution), cov (sigma^2 (J^T J)^-1) } */
export function lm(f, x0, { iters = 100, eps = 1e-6, lambda = 1e-3, verbose = false } = {}) {
  let x = [...x0], r = f(x), cost = dot(r, r), lam = lambda, J = null;
  const jac = (x, r) => { const J = r.map(() => new Array(x.length).fill(0)); for (let j = 0; j < x.length; j++) { const h = eps * Math.max(1, Math.abs(x[j])), xp = [...x]; xp[j] += h; const rp = f(xp); for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - r[i]) / h; } return J; };
  let it = 0;
  for (; it < iters; it++) {
    J = jac(x, r);
    const n = x.length, A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
    for (let i = 0; i < r.length; i++) { const Ji = J[i]; for (let a = 0; a < n; a++) { if (!Ji[a]) continue; g[a] += Ji[a] * r[i]; for (let b = 0; b < n; b++) A[a][b] += Ji[a] * Ji[b]; } }
    let improved = false;
    for (let k = 0; k < 12; k++) {
      const Ad = A.map((row, a) => row.map((v, b) => (a === b ? v + lam * Math.max(v, 1e-9) : v)));
      let dx; try { dx = solve(Ad, g.map((v) => -v)); } catch { lam *= 10; continue; }
      const xn = add(x, dx), rn = f(xn), cn = dot(rn, rn);
      if (cn < cost) { const rel = (cost - cn) / Math.max(cost, 1e-30); x = xn; r = rn; cost = cn; lam = Math.max(lam / 3, 1e-9); improved = true; if (verbose) console.log('lm', it, cost); if (rel < 1e-12) it = iters; break; }
      lam *= 10;
    }
    if (!improved) break;
  }
  J = jac(x, r);
  const n = x.length, A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < r.length; i++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) A[a][b] += J[i][a] * J[i][b];
  const dof = Math.max(1, r.length - n), s2 = cost / dof;
  let cov = null; try { cov = inv(A).map((row) => row.map((v) => v * s2)); } catch { cov = null; }
  return { x, cost, r, iters: it, cov, s2 };
}

/** Linear (DLT) + LM triangulation of one point from >= 2 observations [{ cam, pose, uv }]. -> { X, res (px), sigma (m, 1-sigma) } */
export function triangulate(obs, { pxSigma = 1 } = {}) {
  // linear: closest point to the rays (least squares)
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (const o of obs) {
    const C = centre(o.pose), d = mv(tr(o.pose.R), pixelRay(o.cam, ...o.uv)), P = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((r, i) => r.map((v, j) => v - d[i] * d[j]));
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += P[i][j]; b[i] += dot(P[i], C); }
  }
  let X = solve(A, b);
  const f = (x) => obs.flatMap((o) => { const p = project(o.cam, o.pose, x); return p ? [(p[0] - o.uv[0]) / pxSigma, (p[1] - o.uv[1]) / pxSigma] : [1e3, 1e3]; });
  const s = lm(f, X, { iters: 50 });
  X = s.x;
  const res = obs.map((o) => { const p = project(o.cam, o.pose, X); return p ? Math.hypot(p[0] - o.uv[0], p[1] - o.uv[1]) * 1 : Infinity; });
  // 1-sigma from the pixel noise model (pxSigma) rather than the fit's own residual (3 rays give 3 dof only)
  let sigma = null; if (s.cov) { const k = 1 / Math.max(s.s2, 1e-12); sigma = Math.sqrt((s.cov[0][0] + s.cov[1][1] + s.cov[2][2]) * k); }
  return { X, res, sigma };
}

// ------------------------------------------------------------------ the app's frame and terrain
export const ENU = { lon0: 141.575, lat0: 38.906, kx: 86744, kz: 111014 };
export const toENU = (lat, lon) => [(lon - ENU.lon0) * ENU.kx, -(lat - ENU.lat0) * ENU.kz];
export const fromENU = (x, z) => ({ lat: ENU.lat0 - z / ENU.kz, lon: ENU.lon0 + x / ENU.kx });
let DEMS = null;
/** DEM height (T.P. m, GSI dem5a 3.7 m grid, dem z14 8 m outside) at ENU (x, z); 0 over the sea. */
export function demAt(root, x, z) {
  if (!DEMS) DEMS = ['core', 'city'].map((n) => { const meta = JSON.parse(readFileSync(join(root, `data/terrain/${n}.json`), 'utf8')); const buf = readFileSync(join(root, `data/terrain/${n}.f32`)); return { meta, a: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) }; });
  for (const { meta: m, a } of DEMS) {
    const fx = (x - m.x0) / m.dx, fz = (z - m.z0) / m.dz;
    if (fx < 0 || fz < 0 || fx >= m.width - 1 || fz >= m.height - 1) continue;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, g = (ii, jj) => a[jj * m.width + ii];
    return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
  }
  return 0;
}
/** Bearing (deg from north, clockwise) of an ENU direction (dx east, dz south). */
export const bearing = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
