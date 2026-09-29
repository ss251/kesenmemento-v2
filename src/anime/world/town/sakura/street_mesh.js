// [v3:town] vendored from Sakuragaoka Station src/world/street/mesh.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Street module — small indexed-geometry builder used for roads, sidewalks, gutters and decals.
import * as THREE from 'three';

/** Accumulates vertices (position, normal, uv, optional colour) and triangles.
 *  quad()/tri() take a desired facing normal and fix the winding automatically. */
export class MeshBuilder {
  constructor(withColor = false) {
    this.pos = []; this.nrm = []; this.uv = []; this.col = withColor ? [] : null; this.idx = []; this.n = 0;
  }
  vert(x, y, z, u = 0, v = 0, n = UP, c = null) {
    this.pos.push(x, y, z); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
    if (this.col) { if (c) this.col.push(c[0], c[1], c[2]); else this.col.push(1, 1, 1); }
    return this.n++;
  }
  /** triangle a,b,c oriented so that its geometric normal agrees with `want` (default +Y). */
  tri(a, b, c, want = UP) {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const d = nx * want[0] + ny * want[1] + nz * want[2];
    if (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) < 1e-12) return; // degenerate
    if (d >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  quad(a, b, c, d, want = UP) { this.tri(a, b, c, want); this.tri(a, c, d, want); }
  get empty() { return this.idx.length === 0; }
  geometry(computeNormals = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (computeNormals) g.computeVertexNormals();
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, opts = {}) {
    const m = new THREE.Mesh(this.geometry(!!opts.computeNormals), material);
    m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
    if (opts.renderOrder !== undefined) m.renderOrder = opts.renderOrder;
    if (opts.name) m.name = opts.name;
    return m;
  }
}
export const UP = [0, 1, 0];

/** Build a grid (rows × cols) of vertices from fn(i, j) -> {x,y,z,u,v,c?,n?}; quads face `want`. */
export function grid(b, rows, cols, fn, want = UP) {
  const base = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const p = fn(i, j);
      row.push(b.vert(p.x, p.y, p.z, p.u, p.v, p.n || want, p.c || null));
    }
    base.push(row);
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    b.quad(base[i][j], base[i][j + 1], base[i + 1][j + 1], base[i + 1][j], want);
  }
  return base;
}

/** Polyline helpers (2D points [x,z]). */
export function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
/** Resample a polyline so that consecutive points are at most `step` apart. Returns [{x,z,s,tx,tz}]. */
export function resample(pts, step) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    const tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    for (let k = 0; k < n; k++) { const f = k / n; out.push({ x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, s: s + L * f, tx, tz }); }
    s += L;
  }
  const last = pts[pts.length - 1], prev = out[out.length - 1] || { tx: 1, tz: 0 };
  out.push({ x: last[0], z: last[1], s, tx: prev.tx, tz: prev.tz });
  // smooth tangents at interior points
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], c = out[i + 1]; let tx = c.x - a.x, tz = c.z - a.z; const l = Math.hypot(tx, tz) || 1; out[i].tx = tx / l; out[i].tz = tz / l;
  }
  return out;
}
/** Point + tangent at arc length s along a resampled polyline. */
export function pointAt(rs, s) {
  if (s <= 0) return rs[0];
  for (let i = 1; i < rs.length; i++) {
    if (rs[i].s >= s) {
      const a = rs[i - 1], b = rs[i]; const f = (s - a.s) / Math.max(1e-6, b.s - a.s);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, s, tx: a.tx + (b.tx - a.tx) * f, tz: a.tz + (b.tz - a.tz) * f };
    }
  }
  return rs[rs.length - 1];
}
