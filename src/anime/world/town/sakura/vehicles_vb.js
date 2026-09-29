// [v3:town] vendored from Sakuragaoka Station src/world/vehicles/vb.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Vertex-colour geometry builder for the vehicles module.
// Every opaque part of a bicycle / car is appended (transformed + per-vertex coloured) into ONE
// BufferGeometry, so a whole vehicle is one mesh with ONE shared material
// (ctx.mat.toon('#ffffff', { vertexColors: true })) — and after static batching all vehicles in a
// 40 m cell collapse into a single draw call.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GC = new Map();
/** cached primitive geometry (never mutated: VB clones before transforming) */
export function cg(key, make) { let g = GC.get(key); if (!g) { g = make(); GC.set(key, g); } return g; }

const _cache = new Map();
/** sRGB hex -> linear THREE.Color (cached) */
export function C(hex) {
  if (hex && hex.isColor) return hex;
  let c = _cache.get(hex); if (!c) { c = new THREE.Color(hex); _cache.set(hex, c); } return c;
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** Matrix from pos [x,y,z], rot [rx,ry,rz] (XYZ), scale [sx,sy,sz] */
export function mtx(pos, rot, scale) {
  _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _e.set(rot ? rot[0] || 0 : 0, rot ? rot[1] || 0 : 0, rot ? rot[2] || 0 : 0);
  _q.setFromEuler(_e);
  _s.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
const UP = new THREE.Vector3(0, 1, 0);

function withIndex(g) {
  if (g.index) return g;
  const n = g.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export class VB {
  constructor() { this.geos = []; this.M = new THREE.Matrix4(); this.stack = []; this.tris = 0; }
  /** multiply the current transform by m (Matrix4) until pop() */
  push(m) { this.stack.push(this.M.clone()); this.M.multiply(m); return this; }
  pop() { this.M.copy(this.stack.pop()); return this; }
  /** Append geometry `geo` with colour `color` (hex or Color) under local matrix `local`.
   *  tint(p, c, n): optional per-vertex colour modifier (p, n in builder space). uvMap(uvAttr): optional. */
  add(geo, color, local, tint, uvMap) {
    const g = withIndex(geo.clone());
    const m = local ? this.M.clone().multiply(local) : this.M.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    // normalise attribute storage to plain Float32
    for (const k of Object.keys(g.attributes)) {
      const at = g.attributes[k];
      if (at.isInterleavedBufferAttribute || !(at.array instanceof Float32Array)) {
        const a = new Float32Array(at.count * at.itemSize);
        for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) a[i * at.itemSize + j] = at.getComponent(i, j);
        g.setAttribute(k, new THREE.BufferAttribute(a, at.itemSize));
      }
    }
    g.applyMatrix4(m);
    if (m.determinant() < 0) { const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } }
    if (uvMap) uvMap(g.attributes.uv);
    const n = g.attributes.position.count, ca = new Float32Array(n * 3);
    const base = C(color), cc = new THREE.Color(), p = new THREE.Vector3(), nn = new THREE.Vector3();
    const pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      cc.copy(base);
      if (tint) { p.fromBufferAttribute(pa, i); nn.fromBufferAttribute(na, i); tint(p, cc, nn); }
      ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    this.geos.push(g);
    this.tris += g.index.count / 3;
    return g;
  }
  box(w, h, d, color, pos, rot, tint) { return this.add(cg('box', () => new THREE.BoxGeometry(1, 1, 1)), color, mtx(pos, rot, [w, h, d]), tint); }
  /** rounded box (seg 1 = chamfer-like, cheap; seg 2 = smoother) */
  rbox(w, h, d, r, color, pos, rot, seg = 1, tint) {
    const R = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const key = `rb|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${R.toFixed(3)}|${seg}`;
    return this.add(cg(key, () => new RoundedBoxGeometry(w, h, d, seg, R)), color, mtx(pos, rot), tint);
  }
  cyl(rt, rb, h, color, pos, rot, seg = 10, tint) {
    const key = `cy|${rt.toFixed(4)}|${rb.toFixed(4)}|${h.toFixed(4)}|${seg}`;
    return this.add(cg(key, () => new THREE.CylinderGeometry(rt, rb, h, seg)), color, mtx(pos, rot), tint);
  }
  sph(r, color, pos, seg = 8, scale, rot) {
    return this.add(cg('sp|' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, seg * 0.66 | 0))), color, mtx(pos, rot, scale ? [r * scale[0], r * scale[1], r * scale[2]] : [r, r, r]));
  }
  torus(R, r, color, pos, rot, radSeg = 6, tubSeg = 24, arc = Math.PI * 2) {
    const key = `to|${R.toFixed(4)}|${r.toFixed(4)}|${radSeg}|${tubSeg}|${arc.toFixed(3)}`;
    return this.add(cg(key, () => new THREE.TorusGeometry(R, r, radSeg, tubSeg, arc)), color, mtx(pos, rot));
  }
  /** straight rod from a to b ([x,y,z]) */
  rod(a, b, r, color, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-5) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    return this.add(cg('rod|' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)), color, m);
  }
  /** flat bar (box) from a to b: w across (local x), t thick (local z) */
  bar(a, b, w, t, color, twist = 0) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-5) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    if (twist) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, twist));
    const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(w, len, t));
    return this.add(cg('box', () => new THREE.BoxGeometry(1, 1, 1)), color, m);
  }
  /** smooth tube through points (CatmullRom) */
  tube(points, r, color, tubSeg = 12, radSeg = 6, tension = 0.5) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', tension);
    const g = new THREE.TubeGeometry(curve, tubSeg, r, radSeg, false);
    return this.add(g, color);
  }
  geo(g, color, pos, rot, scale, tint) { return this.add(g, color, mtx(pos, rot, scale), tint); }
  build() {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    for (const x of this.geos) x.dispose();
    this.geos = [];
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Arc band swept around the local X axis (fenders, wheel arches): radius R, profile [[x, dr], ...]
 *  (closed loop, ordered top(+dr) left->right, right side down, inner right->left, left side up),
 *  angle a0 < a1 where angle 0 = +Z (forward), PI/2 = +Y (up). */
export function arcSweep(R, prof, a0, a1, seg) {
  const pos = [], idx = [];
  for (let e = 0; e < prof.length; e++) {
    const p0 = prof[e], p1 = prof[(e + 1) % prof.length], base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * i / seg, s = Math.sin(a), c = Math.cos(a);
      for (const p of [p0, p1]) { const rr = R + p[1]; pos.push(p[0], rr * s, rr * c); }
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Quad from 4 corners (counter-clockwise when seen from the front side). */
export function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/** Flat polygon (points [[x,y],...]) in the XY plane facing +Z. */
export function poly(points) {
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
  return new THREE.ShapeGeometry(shape);
}

/** Convex hull (2D, monotone chain) of [[x,y],...] -> CCW polygon */
export function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
