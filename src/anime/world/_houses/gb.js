// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Geometry accumulator for the houses module.
// Thousands of small parts (frames, sills, pots, meters…) are appended as raw vertex data into
// per-material bins (vertex colours carry the colour, so one material serves many colours), then
// flushed into a handful of meshes per region. ctx.addStatic() + core batching merge them further.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const _n3 = new THREE.Matrix3(), _col = new THREE.Color(), _v = new THREE.Vector3();

// face table for boxes: [normal, uAxis, vAxis] (u/v axis index + sign) like BoxGeometry (px,nx,py,ny,pz,nz)
const BOX_FACES = [
  { n: [1, 0, 0], u: [2, -1], v: [1, 1] },   // +X : u runs -z, v runs +y
  { n: [-1, 0, 0], u: [2, 1], v: [1, 1] },   // -X
  { n: [0, 1, 0], u: [0, 1], v: [2, -1] },   // +Y : u +x, v -z
  { n: [0, -1, 0], u: [0, 1], v: [2, 1] },   // -Y
  { n: [0, 0, 1], u: [0, 1], v: [1, 1] },    // +Z : u +x, v +y  (front)
  { n: [0, 0, -1], u: [0, -1], v: [1, 1] },  // -Z
];

const geoCache = new Map();
/** Convert a BufferGeometry into plain arrays once (cached by key). */
export function rawOf(key, make) {
  let r = geoCache.get(key);
  if (r) return r;
  let g = make();
  if (g.index === null) { /* non-indexed ok */ }
  const p = g.attributes.position.array, n = g.attributes.normal ? g.attributes.normal.array : null;
  const u = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
  let i;
  if (g.index) i = g.index.array; else { i = new Uint32Array(g.attributes.position.count); for (let k = 0; k < i.length; k++) i[k] = k; }
  if (!n) { g.computeVertexNormals(); }
  // optional per-vertex colours (linear, e.g. baked foliage gradients) multiply the colour given at emit time
  const c = g.attributes.color ? Float32Array.from(g.attributes.color.array) : null;
  r = { p: Float32Array.from(p), n: Float32Array.from(g.attributes.normal.array), u: Float32Array.from(u), i: Uint32Array.from(i), c };
  geoCache.set(key, r);
  g.dispose();
  return r;
}

export class GB {
  constructor(ctx) { this.ctx = ctx; this.bins = new Map(); this.tris = 0; }
  _bin(mat, fl) {
    const shadow = fl && fl.shadow === false ? 0 : 1, no = fl && fl.noOutline ? 1 : 0, rec = fl && fl.receive === false ? 0 : 1;
    const key = mat.uuid + '|' + shadow + no + rec;
    let b = this.bins.get(key);
    if (!b) { b = { mat, p: [], n: [], u: [], c: [], i: [], vc: 0, shadow: !!shadow, noOutline: !!no, receive: !!rec }; this.bins.set(key, b); }
    return b;
  }
  /** Append raw arrays transformed by m4. uvx: null | [su,sv,ou,ov] | function(u,v,vertexIndex)->[u,v]
   *  C: optional per-vertex linear colours (multiplied by color). */
  raw(mat, color, P, N, U, I, m4, uvx, fl, C) {
    const b = this._bin(mat, fl);
    const base = b.vc;
    const e = m4.elements;
    _n3.getNormalMatrix(m4); const ne = _n3.elements;
    let cr = 1, cg = 1, cb = 1;
    if (color !== null && color !== undefined) { _col.set(color); cr = _col.r; cg = _col.g; cb = _col.b; }
    const nv = P.length / 3;
    const isF = typeof uvx === 'function';
    for (let k = 0; k < nv; k++) {
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      b.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const a = N[k * 3], bb = N[k * 3 + 1], c = N[k * 3 + 2];
      let nx = ne[0] * a + ne[3] * bb + ne[6] * c, ny = ne[1] * a + ne[4] * bb + ne[7] * c, nz = ne[2] * a + ne[5] * bb + ne[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1; b.n.push(nx / l, ny / l, nz / l);
      let uu = U[k * 2], vv = U[k * 2 + 1];
      if (uvx) { if (isF) { const r = uvx(uu, vv, k); uu = r[0]; vv = r[1]; } else { uu = uu * uvx[0] + uvx[2]; vv = vv * uvx[1] + uvx[3]; } }
      b.u.push(uu, vv);
      if (C) b.c.push(cr * C[k * 3], cg * C[k * 3 + 1], cb * C[k * 3 + 2]); else b.c.push(cr, cg, cb);
    }
    for (let k = 0; k < I.length; k++) b.i.push(I[k] + base);
    b.vc += nv;
    this.tris += I.length / 3;
  }
  /** Box of size w×h×d centred at the origin of m4. uv: null (0..1 per face), {world:s} (meters/s),
   *  {rect:[u0,v0,u1,v1], white:[u,v], faces:'front'|'all'|'front+back'} for atlas mapping. */
  box(mat, color, w, h, d, m4, uv, fl) {
    const P = [], N = [], U = [], I = [];
    const hs = [w / 2, h / 2, d / 2], dims = [w, h, d];
    // fl.skip: faces to omit (hidden against a wall / floor): r=+X l=-X t=+Y d=-Y f=+Z b=-Z
    const skip = fl && fl.skip;
    for (let f = 0; f < 6; f++) {
      if (skip && skip.includes('rltdfb'[f])) continue;
      const F = BOX_FACES[f];
      const ua = F.u[0], us = F.u[1], va = F.v[0], vs = F.v[1];
      const na = F.n.findIndex(v => v !== 0), ns = F.n[na];
      const base = P.length / 3;
      for (let j = 0; j < 4; j++) {
        const su = (j === 1 || j === 2) ? 1 : -1, sv = (j >= 2) ? 1 : -1;
        const q = [0, 0, 0];
        q[na] = ns * hs[na]; q[ua] = su * us * hs[ua]; q[va] = sv * vs * hs[va];
        P.push(q[0], q[1], q[2]); N.push(F.n[0], F.n[1], F.n[2]);
        let u0 = (su + 1) / 2, v0 = (sv + 1) / 2;
        if (uv && uv.world) { u0 = (su * dims[ua] / 2 + (uv.ou || 0)) / uv.world; v0 = (sv * dims[va] / 2 + (uv.ov || 0)) / (uv.worldV || uv.world); }
        else if (uv && uv.rect) {
          const front = f === 4 || (uv.faces === 'front+back' && f === 5) || uv.faces === 'all';
          if (front) { const r = uv.rect; u0 = r[0] + (r[2] - r[0]) * u0; v0 = r[1] + (r[3] - r[1]) * v0; }
          else { u0 = uv.white[0]; v0 = uv.white[1]; }
        }
        U.push(u0, v0);
      }
      // winding: (0,1,2),(0,2,3) must face outward; check with cross product
      const a = [P[base * 3], P[base * 3 + 1], P[base * 3 + 2]], b2 = [P[base * 3 + 3], P[base * 3 + 4], P[base * 3 + 5]], c2 = [P[base * 3 + 6], P[base * 3 + 7], P[base * 3 + 8]];
      const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      if (cx * F.n[0] + cy * F.n[1] + cz * F.n[2] >= 0) I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    if (uv && uv.skipBottom && !skip) { I.splice(18, 6); }
    this.raw(mat, color, P, N, U, I, m4, null, fl);
  }
  /** Generic triangle list given explicit arrays (local), e.g. roof slabs. */
  mesh(mat, color, P, N, U, I, m4, fl) { this.raw(mat, color, P, N, U, I, m4, null, fl); }

  /** Emit the accumulated bins as meshes into parent. */
  flush(parent, name = 'houses') {
    const ctx = this.ctx;
    const out = [];
    for (const b of this.bins.values()) {
      if (!b.vc) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      if (b.mat.vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.setIndex(b.vc > 65535 ? new THREE.Uint32BufferAttribute(b.i, 1) : new THREE.Uint16BufferAttribute(b.i, 1));
      g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, b.mat);
      m.name = name;
      m.castShadow = b.shadow; m.receiveShadow = b.receive;
      if (b.noOutline) ctx.noOutline(m);
      parent.add(m);
      out.push(m);
    }
    this.bins.clear();
    return out;
  }
}

/** A rigid placement frame (translation + rotation about Y) bound to a GB. Local +Z = "front". */
export class Frame {
  constructor(gb, m4, ry = 0) { this.gb = gb; this.m = m4 || new THREE.Matrix4(); this.ry = ry; }
  static at(gb, x, y, z, ry = 0) { const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); return new Frame(gb, m, ry); }
  sub(x, y, z, ry = 0) {
    const l = new THREE.Matrix4().makeRotationY(ry); l.setPosition(x, y, z);
    return new Frame(this.gb, this.m.clone().multiply(l), this.ry + ry);
  }
  /** world position of local point */
  w(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.m).clone(); }
  get origin() { return new THREE.Vector3().setFromMatrixPosition(this.m); }
  M(x, y, z, o) {
    _e.set(o && o.rx || 0, o && o.ry || 0, o && o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    if (o && (o.sx || o.sy || o.sz)) _s.set(o.sx || 1, o.sy || 1, o.sz || 1); else _s.set(1, 1, 1);
    const l = new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s);
    return this.m.clone().multiply(l);
  }
  /** centred box */
  box(mat, col, w, h, d, x, y, z, o) { this.gb.box(mat, col, w, h, d, this.M(x, y, z, o), o && o.uv, o); }
  /** box with bottom at y */
  boxB(mat, col, w, h, d, x, y, z, o) { this.gb.box(mat, col, w, h, d, this.M(x, y + h / 2, z, o), o && o.uv, o); }
  /** raw geometry (from rawOf) */
  raw(mat, col, R, x, y, z, o) { this.gb.raw(mat, col, R.p, R.n, R.u, R.i, this.M(x, y, z, o), o && o.uvx, o, R.c); }
  /** cylinder along local Y, centred */
  cyl(mat, col, r, h, x, y, z, o = {}) {
    const seg = o.seg || 8, rt = o.rTop ?? r;
    const R = rawOf(`cyl|${rt}|${r}|${seg}|${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, r, 1, seg, 1, !!o.open));
    this.gb.raw(mat, col, R.p, R.n, R.u, R.i, this.M(x, y, z, { ...o, sy: h }), o.uvx, o);
  }
  /** a box spanning from point a to point b (local coords arrays), cross-section w (horizontal) × h */
  beam(mat, col, a, b, w, h, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3().crossVectors(up, dir); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const nup = new THREE.Vector3().crossVectors(dir, side).normalize();
    // local box axes: x = side, y = nup, z = dir
    const basis = new THREE.Matrix4().makeBasis(side, nup, dir);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    basis.setPosition(mid.x, mid.y + (o.dy || 0), mid.z);
    const M = this.m.clone().multiply(basis);
    this.gb.box(mat, col, w, h, len + (o.extend || 0), M, o.uv, o);
  }
}

/** Build a slab (roof plane) from a planar convex top polygon (array of [x,y,z]) pushed down by t (vertical).
 *  Returns raw arrays. uvTop(x,y,z)->[u,v] maps the top face; bottom & sides get uvSide. */
export function slab(poly, t, uvTop) {
  const P = [], N = [], U = [], I = [];
  const n = poly.length;
  // top normal
  const a = new THREE.Vector3(...poly[0]), b = new THREE.Vector3(...poly[1]), c = new THREE.Vector3(...poly[2]);
  const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  if (nrm.y < 0) { poly = poly.slice().reverse(); nrm.negate(); }
  // top
  let base = 0;
  for (const q of poly) { P.push(q[0], q[1], q[2]); N.push(nrm.x, nrm.y, nrm.z); const uv = uvTop(q); U.push(uv[0], uv[1]); }
  for (let k = 1; k < n - 1; k++) I.push(base, base + k, base + k + 1);
  // bottom
  base = P.length / 3;
  for (const q of poly) { P.push(q[0], q[1] - t, q[2]); N.push(-nrm.x, -nrm.y, -nrm.z); U.push(0.001, 0.001); }
  for (let k = 1; k < n - 1; k++) I.push(base, base + k + 1, base + k);
  // sides (outward normal via centroid test, winding chosen to match)
  const cx = poly.reduce((s, q) => s + q[0], 0) / n, cz = poly.reduce((s, q) => s + q[2], 0) / n;
  for (let k = 0; k < n; k++) {
    const p0 = poly[k], p1 = poly[(k + 1) % n];
    const ex = p1[0] - p0[0], ez = p1[2] - p0[2];
    if (Math.hypot(ex, ez) < 1e-5) continue;
    let sx = ez, sz = -ex; const sl = Math.hypot(sx, sz); sx /= sl; sz /= sl;
    const mx = (p0[0] + p1[0]) / 2 - cx, mz = (p0[2] + p1[2]) / 2 - cz;
    if (mx * sx + mz * sz < 0) { sx = -sx; sz = -sz; }
    base = P.length / 3;
    P.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p1[0], p1[1] - t, p1[2], p0[0], p0[1] - t, p0[2]);
    for (let j = 0; j < 4; j++) N.push(sx, 0, sz);
    U.push(0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002, 0.002);
    // cross((p1t - p0t), (p1b - p0t))
    const ax = ex, ay = p1[1] - p0[1], az = ez, bx = ex, by = p1[1] - t - p0[1], bz = ez;
    const cxx = ay * bz - az * by, czz = ax * by - ay * bx;
    if (cxx * sx + czz * sz > 0) I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else I.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { p: P, n: N, u: U, i: I };
}

/** Flat polygon (e.g. gable triangle) with a given outward normal, double-winding safe. */
export function poly(points, normal, uvf) {
  const P = [], N = [], U = [], I = [];
  for (const q of points) { P.push(q[0], q[1], q[2]); N.push(normal[0], normal[1], normal[2]); const uv = uvf ? uvf(q) : [0, 0]; U.push(uv[0], uv[1]); }
  const a = new THREE.Vector3(...points[0]), b = new THREE.Vector3(...points[1]), c = new THREE.Vector3(...points[2]);
  const nn = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a));
  const ok = nn.x * normal[0] + nn.y * normal[1] + nn.z * normal[2] >= 0;
  for (let k = 1; k < points.length - 1; k++) { if (ok) I.push(0, k, k + 1); else I.push(0, k + 1, k); }
  return { p: P, n: N, u: U, i: I };
}
