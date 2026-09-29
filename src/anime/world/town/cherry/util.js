// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/util.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Sakura module helpers: a flat-array geometry builder, seeded 3D value noise,
// tapered tubes with parallel-transport frames, and cached unit icospheres.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Accumulates vertices (position, normal, uv, colour) + indices; builds one BufferGeometry. */
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.count = 0; }
  v(x, y, z, nx, ny, nz, u, w, r = 1, g = 1, b = 1) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(r, g, b);
    return this.count++;
  }
  t(a, b, c) { this.i.push(a, b, c); }
  get tris() { return this.i.length / 3; }
  append(o) { // merge another builder
    const off = this.count;
    for (let k = 0; k < o.p.length; k++) this.p.push(o.p[k]);
    for (let k = 0; k < o.n.length; k++) this.n.push(o.n[k]);
    for (let k = 0; k < o.uv.length; k++) this.uv.push(o.uv[k]);
    for (let k = 0; k < o.c.length; k++) this.c.push(o.c[k]);
    for (let k = 0; k < o.i.length; k++) this.i.push(o.i[k] + off);
    this.count += o.count;
  }
  build(withColor = true) {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    if (withColor) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setIndex(new THREE.BufferAttribute(this.count > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** Seeded 3D value noise in [-1,1] (smooth, cheap). */
export function createNoise(rng) {
  const perm = new Uint16Array(512), val = new Float32Array(256), p = [];
  for (let k = 0; k < 256; k++) p.push(k);
  for (let k = 255; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); const t = p[k]; p[k] = p[j]; p[j] = t; }
  for (let k = 0; k < 512; k++) perm[k] = p[k & 255];
  for (let k = 0; k < 256; k++) val[k] = rng() * 2 - 1;
  const L = (x, y, z) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const f = (t) => t * t * (3 - 2 * t);
  function n3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = f(x - ix), fy = f(y - iy), fz = f(z - iz);
    const a = L(ix, iy, iz), b = L(ix + 1, iy, iz), c = L(ix, iy + 1, iz), d = L(ix + 1, iy + 1, iz);
    const e = L(ix, iy, iz + 1), g = L(ix + 1, iy, iz + 1), h = L(ix, iy + 1, iz + 1), k = L(ix + 1, iy + 1, iz + 1);
    const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (g - e) * fx, x4 = h + (k - h) * fx;
    const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
    return y1 + (y2 - y1) * fz;
  }
  n3.fbm = (x, y, z) => n3(x, y, z) * 0.62 + n3(x * 2.13 + 5.1, y * 2.13 + 1.7, z * 2.13 + 9.3) * 0.38;
  return n3;
}

const _ico = new Map();
/** Indexed unit icosphere {pos: Float32Array, idx: Uint16Array|Uint32Array}. */
export function icosphere(detail) {
  if (_ico.has(detail)) return _ico.get(detail);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const r = { pos: g.attributes.position.array, idx: g.index.array, count: g.attributes.position.count };
  _ico.set(detail, r);
  return r;
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _tmp = new THREE.Vector3();
/** Tapered tube through pts (Vector3[]) with radii[] (m). seg radial segments.
 *  uTile / vTile = metres per texture repeat around / along. Returns nothing (appends to builder). */
export function tube(B, pts, radii, seg, uTile = 0.8, vTile = 1.6, opts = {}) {
  const n = pts.length; if (n < 2) return;
  let avgR = 0; for (const r of radii) avgR += r; avgR /= radii.length;
  const uRep = Math.max(1, Math.round((2 * Math.PI * avgR) / uTile));
  // initial frame
  const T0 = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
  let N = Math.abs(T0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.sub(_tmp.copy(T0).multiplyScalar(N.dot(T0))).normalize();
  let vAcc = opts.v0 || 0;
  const base = B.count;
  for (let i = 0; i < n; i++) {
    if (i === 0) _t.copy(T0);
    else if (i === n - 1) _t.subVectors(pts[i], pts[i - 1]).normalize();
    else _t.subVectors(pts[i + 1], pts[i - 1]).normalize();
    // parallel transport
    N.sub(_tmp.copy(_t).multiplyScalar(N.dot(_t))).normalize();
    _b.crossVectors(_t, N).normalize();
    if (i > 0) vAcc += pts[i].distanceTo(pts[i - 1]) / vTile;
    const r = radii[i];
    // slope of the taper tilts the normal a little along the axis
    const dr = i < n - 1 ? (radii[i] - radii[i + 1]) / Math.max(1e-3, pts[i].distanceTo(pts[i + 1])) : 0;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      _n.set(N.x * ca + _b.x * sa, N.y * ca + _b.y * sa, N.z * ca + _b.z * sa);
      const nx = _n.x + _t.x * dr * 0.6, ny = _n.y + _t.y * dr * 0.6, nz = _n.z + _t.z * dr * 0.6;
      const nl = Math.hypot(nx, ny, nz) || 1;
      B.v(pts[i].x + _n.x * r, pts[i].y + _n.y * r, pts[i].z + _n.z * r, nx / nl, ny / nl, nz / nl, (j / seg) * uRep, vAcc,
        opts.color ? opts.color[0] : 1, opts.color ? opts.color[1] : 1, opts.color ? opts.color[2] : 1);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
      B.t(a, b, c); B.t(b, d, c);
    }
  }
  // close the tip with a small cone point
  if (opts.capEnd && radii[n - 1] > 0.004) {
    const tip = B.v(pts[n - 1].x + _t.x * radii[n - 1] * 0.8, pts[n - 1].y + _t.y * radii[n - 1] * 0.8, pts[n - 1].z + _t.z * radii[n - 1] * 0.8, _t.x, _t.y, _t.z, 0.5, vAcc + 0.05);
    const last = base + (n - 1) * row;
    for (let j = 0; j < seg; j++) B.t(last + j, last + j + 1, tip);
  }
}

/** Quadratic bezier sampled into n+1 points (Vector3). */
export function bezier(a, c, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(new THREE.Vector3(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z));
  }
  return out;
}

export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }; // linear rgb
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Piecewise-linear gradient over stops [[t, rgb], ...]. */
export function ramp(stops, t) {
  t = clamp01(t);
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) { const a = stops[k - 1], b = stops[k]; return mix3(a[1], b[1], (t - a[0]) / Math.max(1e-6, b[0] - a[0])); }
  }
  return stops[stops.length - 1][1].slice();
}
