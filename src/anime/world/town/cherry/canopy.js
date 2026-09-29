// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/canopy.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Blossom masses: the flower clusters of a crown (pads) are turned into ONE implicit "blossom mass"
// field (sum of soft ellipsoidal kernels, one per cluster; keep-out boxes / floors carve it), which is
// polygonised with surface nets into a welded, indexed, smooth mesh and then billow-displaced (rounded
// flower-clump bumps with soft creases).  Why: stacked flat sheets read as paper plates — every sheet
// edge becomes a depth step the outline pass draws and every flat sheet shades as one facet.  A single
// continuous surface only has depth steps at its real silhouette, branch gaps and deep folds.
//
// Per vertex:
//   normal    = smooth canopy envelope normal (outline pre-pass sees no normal edges inside the crown;
//               also drives the backlit rim glow)
//   uv, col.b = full 3D shading normal (surface normal blended with the cluster-lobe and canopy
//               normals -> soft, curved cel terminators; cavity side bent downward)
//   col.r     = tone 0..1 (quantised into 4 pink bands in the shader), col.g = peach + 2 * palette
// The same per-vertex data seeds the alpha-tested blossom cards (lace on the silhouette, flower texture,
// hanging sprays, underside cover).
import * as THREE from 'three';
import { clamp01, mix3 } from './util.js';

const V3 = THREE.Vector3;

// ------------------------------------------------------------------------------------------ field
function preparePads(pads, sup) {
  const out = [];
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  for (const pd of pads) {
    const core = pd.core ?? 1;
    const k = (pd.kScale ?? 1) * sup;
    const sx = pd.rx * core * k, sz = pd.rz * core * k, sy = pd.ry * (0.4 + 0.6 * core) * k * (pd.yScale ?? 1.12);
    q.copy(pd.q || new THREE.Quaternion()).invert();
    m.makeRotationFromQuaternion(q);
    const e = m.elements; // column major
    out.push({
      pad: pd, cx: pd.c.x, cy: pd.c.y, cz: pd.c.z,
      m00: e[0], m01: e[4], m02: e[8], m10: e[1], m11: e[5], m12: e[9], m20: e[2], m21: e[6], m22: e[10],
      ix: 1 / (sx * sx), iy: 1 / (sy * sy), iyb: 1 / (sy * sy * 0.72), iz: 1 / (sz * sz),
      R: Math.max(sx, sy, sz), w: pd.weight ?? 1,
    });
  }
  return out;
}
/** kernel value (0..1) of prepared pad P at (x,y,z) */
function kern(P, x, y, z) {
  const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz;
  if (dx > P.R || dx < -P.R || dy > P.R || dy < -P.R || dz > P.R || dz < -P.R) return 0;
  const lx = P.m00 * dx + P.m01 * dy + P.m02 * dz, ly = P.m10 * dx + P.m11 * dy + P.m12 * dz, lz = P.m20 * dx + P.m21 * dy + P.m22 * dz;
  const d2 = lx * lx * P.ix + ly * ly * (ly < 0 ? P.iyb : P.iy) + lz * lz * P.iz;
  if (d2 >= 1) return 0;
  const t = 1 - d2;
  return t * t * t * P.w;
}

/** carving penalty (>= 0) of keep-out boxes, floor and ceiling at a point (floorY precomputed) */
function carve(spec, x, y, z, floorY) {
  let pen = 0;
  if (floorY !== undefined) { const d = floorY + 0.12 - y; if (d > -0.35) pen = Math.max(pen, (d + 0.35) / 0.5); }
  if (spec.ceilY !== undefined) { const d = y - (spec.ceilY - 0.1); if (d > -0.35) pen = Math.max(pen, (d + 0.35) / 0.5); }
  if (spec.keepOut) for (const b of spec.keepOut) {
    // signed penetration depth into the box (positive inside)
    const d = Math.min(x - b.x0, b.x1 - x, y - b.y0, b.y1 - y, z - b.z0, b.z1 - z);
    if (d > -0.3) pen = Math.max(pen, (d + 0.3) / 0.45);
  }
  return pen;
}

// ------------------------------------------------------------------------------------------ surface nets
const CORNER = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

function surfaceNets(F, nx, ny, nz, x0, y0, z0, h) {
  const sx = 1, sy = nx, sz = nx * ny;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const b = i + j * sy + k * sz;
    let mask = 0;
    for (let c = 0; c < 8; c++) { const cc = CORNER[c]; const val = F[b + cc[0] * sx + cc[1] * sy + cc[2] * sz]; v[c] = val; if (val > 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, e] of EDGES) {
      if ((v[a] > 0) === (v[e] > 0)) continue;
      const t = v[a] / (v[a] - v[e]);
      const A = CORNER[a], E = CORNER[e];
      px += A[0] + (E[0] - A[0]) * t; py += A[1] + (E[1] - A[1]) * t; pz += A[2] + (E[2] - A[2]) * t; n++;
    }
    cell[i + j * cx + k * cx * cy] = pos.length / 3;
    pos.push(x0 + (i + px / n) * h, y0 + (j + py / n) * h, z0 + (k + pz / n) * h);
  }
  const idx = [];
  const C = (i, j, k) => cell[i + j * cx + k * cx * cy];
  const P = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
  const d2 = (a, b) => { const A = P(a), B = P(b); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
  const quad = (a, b, c, d, axis, sign) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // orientation check against the outward direction (inside -> outside along the edge axis)
    const A = P(a), B = P(b), Cc = P(c), D = P(d);
    const u = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]], w = [D[0] - B[0], D[1] - B[1], D[2] - B[2]];
    const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (nrm[axis] * sign < 0) { const t = b; b = d; d = t; }
    if (d2(a, c) < d2(b, d)) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const b = i + j * sy + k * sz;
    const in0 = F[b] > 0;
    if (i < cx && j > 0 && k > 0 && j < cy && k < cz && in0 !== (F[b + sx] > 0)) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), 0, in0 ? 1 : -1);
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz && in0 !== (F[b + sy] > 0)) quad(C(i - 1, j, k - 1), C(i, j, k - 1), C(i, j, k), C(i - 1, j, k), 1, in0 ? 1 : -1);
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy && in0 !== (F[b + sz] > 0)) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), 2, in0 ? 1 : -1);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

function vertexNormals(pos, idx, out) {
  out.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { out[q] += nx; out[q + 1] += ny; out[q + 2] += nz; }
  }
  for (let q = 0; q < out.length; q += 3) { const l = Math.hypot(out[q], out[q + 1], out[q + 2]) || 1; out[q] /= l; out[q + 1] /= l; out[q + 2] /= l; }
}
function smooth(pos, idx, iters, lam) {
  const n = pos.length / 3;
  const acc = new Float32Array(n * 3), cnt = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    acc.fill(0); cnt.fill(0);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3];
      acc[a * 3] += pos[b * 3]; acc[a * 3 + 1] += pos[b * 3 + 1]; acc[a * 3 + 2] += pos[b * 3 + 2]; cnt[a]++;
      acc[b * 3] += pos[a * 3]; acc[b * 3 + 1] += pos[a * 3 + 1]; acc[b * 3 + 2] += pos[a * 3 + 2]; cnt[b]++;
    }
    for (let q = 0; q < n; q++) if (cnt[q]) for (let c = 0; c < 3; c++) pos[q * 3 + c] += lam * (acc[q * 3 + c] / cnt[q] - pos[q * 3 + c]);
  }
}

/**
 * Build the blossom-mass surface of a crown.
 * pads: [{ c, rx, ry, rz, q, core?, jit, peach, lobe? }]
 * o: { h (grid step), canopy, noise, spec, amp, freq, iso, support, cavityDown }
 * Returns { n, pos, nT (true normals), nS (shading normals), tone, peach, outer (0 cavity..1 outer),
 *           crease (0..1), hb (height above ground), idx, tris, emit(B) }
 */
export function blossomSurface(pads, o) {
  const h = o.h, iso = o.iso ?? 0.17, sup = o.support ?? 1.5, spec = o.spec, canopy = o.canopy, noise = o.noise;
  const PP = preparePads(pads, sup);
  if (!PP.length) return null;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const P of PP) { x0 = Math.min(x0, P.cx - P.R); x1 = Math.max(x1, P.cx + P.R); y0 = Math.min(y0, P.cy - P.R); y1 = Math.max(y1, P.cy + P.R); z0 = Math.min(z0, P.cz - P.R); z1 = Math.max(z1, P.cz + P.R); }
  x0 -= 2 * h; y0 -= 2 * h; z0 -= 2 * h;
  const nx = Math.ceil((x1 - x0) / h) + 3, ny = Math.ceil((y1 - y0) / h) + 3, nz = Math.ceil((z1 - z0) / h) + 3;
  const F = new Float32Array(nx * ny * nz);
  // splat kernels
  for (const P of PP) {
    const i0 = Math.max(0, Math.floor((P.cx - P.R - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((P.cx + P.R - x0) / h));
    const j0 = Math.max(0, Math.floor((P.cy - P.R - y0) / h)), j1 = Math.min(ny - 1, Math.ceil((P.cy + P.R - y0) / h));
    const k0 = Math.max(0, Math.floor((P.cz - P.R - z0) / h)), k1 = Math.min(nz - 1, Math.ceil((P.cz + P.R - z0) / h));
    for (let k = k0; k <= k1; k++) {
      const z = z0 + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = y0 + j * h, row = j * nx + k * nx * ny;
        for (let i = i0; i <= i1; i++) { const v = kern(P, x0 + i * h, y, z); if (v) F[row + i] += v; }
      }
    }
  }
  // iso offset + carving (floor per column)
  const hasFloor = !!spec.floorAt;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * h, z = z0 + k * h;
    const fy = hasFloor ? spec.floorAt(x, z) : undefined;
    for (let j = 0; j < ny; j++) {
      const id = i + j * nx + k * nx * ny;
      let f = F[id] - iso;
      if (f > -0.5) { const pen = carve(spec, x, y0 + j * h, z, fy); if (pen > 0) f -= pen; }
      if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) f = -1;
      F[id] = f;
    }
  }
  const S = surfaceNets(F, nx, ny, nz, x0, y0, z0, h);
  const pos = S.pos, idx = S.idx, n = pos.length / 3;
  if (!n) return null;
  smooth(pos, idx, o.smooth ?? 2, 0.45);
  const nT = new Float32Array(n * 3);
  vertexNormals(pos, idx, nT);

  // billow displacement: rounded flower-clump bumps (|noise|) with soft creases, weaker in the cavity
  const A = o.amp ?? 0.2, fr = o.freq ?? 1.3;
  const crease = new Float32Array(n);
  const nc = new V3(), p = new V3();
  const outerW = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    canopy.normalAt(p.set(x, y, z), nc);
    const s = nT[q * 3] * nc.x + nT[q * 3 + 1] * nc.y + nT[q * 3 + 2] * nc.z;
    const w = clamp01((s + 0.3) / 0.6); outerW[q] = w;
    const b1 = Math.abs(noise(x * fr + 3.1, y * fr * 1.3 - 1.7, z * fr + 8.3));
    const b2 = Math.abs(noise(x * fr * 2.3 - 5.2, y * fr * 2.6 + 2.9, z * fr * 2.3 + 1.1));
    const bump = Math.min(1, b1 * 1.55) * 0.75 + Math.min(1, b2 * 1.5) * 0.25; // 0 = crease .. 1 = clump top
    crease[q] = bump;
    const d = A * (0.7 + 0.3 * w) * (bump - 0.45);
    pos[q * 3] += nT[q * 3] * d; pos[q * 3 + 1] += nT[q * 3 + 1] * d; pos[q * 3 + 2] += nT[q * 3 + 2] * d;
  }
  vertexNormals(pos, idx, nT);

  // per-vertex cluster data (tone jitter, peach, lobe normal) from the pad kernels
  const nS = new Float32Array(n * 3), tone = new Float32Array(n), peach = new Float32Array(n), hb = new Float32Array(n);
  const nl = new V3(), ns = new V3(), nt = new V3();
  const gy = o.groundY ?? 0;
  const cavDown = o.cavityDown ?? 1.6;
  const W = o.weights || { t: 0.62, l: 0.23, c: 0.15, up: 0.06 };
  for (let q = 0; q < n; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    p.set(x, y, z);
    let sk = 0, sj = 0, sp = 0, km = 0; nl.set(0, 0, 0);
    for (const P of PP) {
      const kv = kern(P, x, y, z); if (!kv) continue;
      const pd = P.pad; sk += kv; sj += kv * (pd.jit || 0); sp += kv * (pd.peach || 0); if (kv > km) km = kv;
      const L = pd.lobe;
      if (L) nl.x += kv * (x - L.c.x) / L.rx, nl.y += kv * ((y - L.c.y) / L.ry + 0.12), nl.z += kv * (z - L.c.z) / L.rz;
      else nl.x += kv * (x - P.cx), nl.y += kv * (y - P.cy), nl.z += kv * (z - P.cz);
    }
    const jit = sk > 1e-5 ? sj / sk : 0, pch = sk > 1e-5 ? sp / sk : 0;
    // cluster dominance: ~1 on a clump body, ~0.5 in the crease where two clusters fuse
    const dom = sk > 1e-5 ? km / sk : 1;
    canopy.normalAt(p, nc);
    if (nl.lengthSq() < 1e-8) nl.copy(nc); else nl.normalize();
    nt.set(nT[q * 3], nT[q * 3 + 1], nT[q * 3 + 2]);
    const w = outerW[q];
    // outer surface: soft blend of surface / lobe / canopy normals; cavity: true normal bent downward
    ns.set(nt.x * W.t + nl.x * W.l + nc.x * W.c, nt.y * W.t + nl.y * W.l + nc.y * W.c + W.up, nt.z * W.t + nl.z * W.l + nc.z * W.c).normalize();
    const cx_ = nt.x, cy_ = nt.y - cavDown, cz_ = nt.z; const cl = Math.hypot(cx_, cy_, cz_) || 1;
    ns.set(ns.x * w + (cx_ / cl) * (1 - w), ns.y * w + (cy_ / cl) * (1 - w), ns.z * w + (cz_ / cl) * (1 - w)).normalize();
    nS[q * 3] = ns.x; nS[q * 3 + 1] = ns.y; nS[q * 3 + 2] = ns.z;
    // tone: canopy tone + clump jitter, paler on clump tops / up-facing, deeper in creases and the cavity
    const cr = crease[q];
    tone[q] = clamp01(canopy.toneT(p, jit) + 0.07 * ns.y + (0.22 + 0.07 * (1 - w)) * (cr - 0.5) + 0.24 * (dom - 0.72) + 0.02 * w - 0.07 * (1 - w) + (o.toneBias ?? 0));
    peach[q] = pch; hb[q] = y - gy;
  }
  const palId = canopy.palId || 0;
  return {
    n, pos, nT, nS, tone, peach, outer: outerW, crease, hb, idx, tris: idx.length / 3,
    // one welded surface on the outline layer (splitting it into outlined / no-outline parts would turn
    // every part boundary into a depth step the outline pass draws)
    emit(B) {
      const base = B.count, env = new V3();
      for (let q = 0; q < n; q++) {
        canopy.normalAt(p.set(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]), env);
        B.v(pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2], env.x, env.y, env.z, nS[q * 3], nS[q * 3 + 2], tone[q], peach[q] + 2 * palId, nS[q * 3 + 1]);
      }
      for (let t = 0; t < idx.length; t += 3) B.t(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
    },
  };
}

// ------------------------------------------------------------------------------------------ cards
const _t1 = new V3(), _t2 = new V3(), _ru = new V3(), _vv = new V3();
export function emitCard(B, c, pn, size, rot, cell, col, nrm, aspect = 1) {
  _ru.set(0.31, 0.93, 0.2); if (Math.abs(pn.dot(_ru)) > 0.9) _ru.set(0.9, 0.1, 0.4);
  _t1.crossVectors(pn, _ru).normalize(); _t2.crossVectors(pn, _t1).normalize();
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const ax = _t1.x * cr + _t2.x * sr, ay = _t1.y * cr + _t2.y * sr, az = _t1.z * cr + _t2.z * sr;
  const bx = -_t1.x * sr + _t2.x * cr, by = -_t1.y * sr + _t2.y * cr, bz = -_t1.z * sr + _t2.z * cr;
  const hw = size * 0.5 * aspect, hh = size * 0.5;
  const base = B.count;
  const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  for (const [sx, sy, u, v] of corners) {
    _vv.set(c.x + ax * hw * sx + bx * hh * sy, c.y + ay * hw * sx + by * hh * sy, c.z + az * hw * sx + bz * hh * sy);
    const nn = typeof nrm === 'function' ? nrm(_vv) : nrm;
    const cc = typeof col === 'function' ? col(_vv) : col;
    B.v(_vv.x, _vv.y, _vv.z, nn.x, nn.y, nn.z, cell[0] + u * 0.5, cell[1] + v * 0.5, cc[0], cc[1], cc[2]);
  }
  B.t(base, base + 1, base + 2); B.t(base, base + 2, base + 3);
}

function randUnit(r, out) {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, z, Math.sin(a) * s);
}

/**
 * Dress a blossom surface with alpha-tested blossom cards (area-weighted random samples):
 *  outer surface -> lace (sticks out, random tilt: breaks every silhouette, adds flower texture),
 *  lower rim     -> a few hanging sprays, cavity -> sparse down-facing cover (seen walking under).
 * o: { r, pal, peachCol, leafCol, CELL, cardBase, cov (outer coverage), covIn (cavity), hang (prob/m²),
 *      nearBoost (fn hb -> multiplier), bandColor }
 */
export function dressSurface(cards, S, o) {
  const { r, CELL, cardBase, bandColor, pal } = o;
  const pos = S.pos, idx = S.idx;
  const pc = new V3(), pn = new V3(), nt = new V3(), nsv = new V3(), tmp = new V3();
  const nearBoost = o.nearBoost || (() => 1);
  const size2 = cardBase * cardBase;
  let made = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const w = (S.outer[a] + S.outer[b] + S.outer[c]) / 3;
    const hbv = (S.hb[a] + S.hb[b] + S.hb[c]) / 3;
    const upN = (S.nS[a * 3 + 1] + S.nS[b * 3 + 1] + S.nS[c * 3 + 1]) / 3;
    const cov = (o.covIn + (o.cov - o.covIn) * w) * nearBoost(hbv) * (1 + 0.35 * clamp01(upN * 1.5) * w);
    let expect = (area * cov) / size2;
    while (expect > 0) {
      if (expect < 1 && r() > expect) break;
      expect -= 1;
      // random barycentric point
      let s1 = r(), s2 = r(); if (s1 + s2 > 1) { s1 = 1 - s1; s2 = 1 - s2; }
      const s0 = 1 - s1 - s2;
      const L = (arr, k) => arr[a * 3 + k] * s0 + arr[b * 3 + k] * s1 + arr[c * 3 + k] * s2;
      const L1 = (arr) => arr[a] * s0 + arr[b] * s1 + arr[c] * s2;
      pc.set(L(pos, 0), L(pos, 1), L(pos, 2));
      nt.set(L(S.nT, 0), L(S.nT, 1), L(S.nT, 2)).normalize();
      nsv.set(L(S.nS, 0), L(S.nS, 1), L(S.nS, 2)).normalize();
      const tn = L1(S.tone), pch = L1(S.peach), cr = L1(S.crease);
      const size = cardBase * (0.72 + r() * 0.46);
      const outer = w > 0.5;
      const hang = outer && nt.y < -0.35 && r() < (o.hangP ?? 0.25);
      if (hang) {
        // hanging spray: vertical card below the lower rim
        pc.addScaledVector(nt, size * 0.15); pc.y -= size * (0.3 + r() * 0.2);
        const ang = r() * 6.28; pn.set(Math.cos(ang), (r() - 0.5) * 0.3, Math.sin(ang)).normalize();
        const col = mixPeach(bandColor(pal, tn - 0.02 + (r() - 0.5) * 0.12), o.peachCol, pch);
        cards.cardN = (cards.cardN || 0) + 1;
        emitCard(cards, pc, pn, size, Math.PI / 2 + (r() - 0.5) * 0.9, r() < 0.6 ? CELL.spray : CELL.loose, col, nsv, 0.8);
        made++; continue;
      }
      // lace: pushed out of the surface (more on clump tops), random tilt biased outward
      pc.addScaledVector(nt, size * ((outer ? 0.14 : -0.02) + r() * 0.3 + cr * 0.12));
      pn.copy(nt).multiplyScalar(outer ? 0.8 : 1.0).add(randUnit(r, tmp).multiplyScalar(0.85)).normalize();
      const roll = r();
      const leaf = roll < (o.leafP ?? 0.045);
      const cell = leaf ? CELL.leaf : roll < 0.5 ? CELL.dense : roll < 0.78 ? CELL.loose : CELL.spray;
      const col = leaf ? o.leafCol : mixPeach(bandColor(pal, tn + (outer ? 0.03 : -0.02) + (r() - 0.5) * 0.14), o.peachCol, pch);
      emitCard(cards, pc, pn, size, r() * Math.PI * 2, cell, col, nsv);
      made++;
    }
  }
  return made;
}
function mixPeach(c, peachCol, k) { return k > 0.01 ? mix3(c, peachCol, Math.min(1, k * 0.8)) : c; }
