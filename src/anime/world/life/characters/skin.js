// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/skin.js.
// Skinned-character toolkit: parametric surfaces, a skinning builder that merges every part of a
// character into ONE SkinnedMesh (one draw call, GPU skinning => outlines follow the pose), and a
// two-bone IK solver. Everything here is deterministic and allocation-light at update time.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ geometry primitives
/** Parametric grid surface. fn(u, v) -> [x, y, z]; u across cols, v across rows (both 0..1). */
export function surface(cols, rows, fn, opts = {}) {
  const nv = (cols + 1) * (rows + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  let k = 0;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols, v = j / rows; const p = fn(u, v);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = u; uv[k * 2 + 1] = v; k++;
  }
  const idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.weld !== false) weldNormals(g);
  return g;
}

/** Average normals of vertices sharing a position (fixes seams / poles => no false outline lines). */
export function weldNormals(g, eps = 1e-5) {
  const p = g.attributes.position, n = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(p.getX(i) / eps)},${Math.round(p.getY(i) / eps)},${Math.round(p.getZ(i) / eps)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i); let e = map.get(k);
    if (!e) map.set(k, (e = [0, 0, 0, []]));
    e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e[3].push(i);
  }
  for (const e of map.values()) {
    if (e[3].length < 2) continue;
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
  }
  n.needsUpdate = true;
  return g;
}

/** Ellipsoid centred at c. Optional deform(x,y,z,u,v)->[x,y,z]. */
export function ellipsoid(rx, ry, rz, c = [0, 0, 0], cols = 12, rows = 8, deform) {
  return surface(cols, rows, (u, v) => {
    const ph = (u - 0.5) * TAU, th = (0.5 - v) * Math.PI;
    let x = rx * Math.sin(ph) * Math.cos(th), y = ry * Math.sin(th), z = rz * Math.cos(ph) * Math.cos(th);
    if (deform) [x, y, z] = deform(x, y, z, u, v);
    return [c[0] + x, c[1] + y, c[2] + z];
  });
}

/** Stack of horizontal elliptical rings. rings: [{y, a, b, x?, z?}], closed at both ends
 *  when the first/last ring has a=b=0. Seam is at the back (-Z) so it is never seen. */
export function rings(list, cols = 12, radial) {
  const rows = list.length - 1;
  return surface(cols, rows, (u, v) => {
    const r = list[Math.round(v * rows)];
    const ph = (u - 0.5) * TAU; // u=0 / u=1 -> back (-Z) seam, u=0.5 -> front (+Z)
    let a = r.a, b = r.b;
    if (radial) { const f = radial(ph, r, Math.round(v * rows)); a *= f; b *= f; }
    return [(r.x || 0) + Math.sin(ph) * a, r.y, (r.z || 0) + Math.cos(ph) * b];
  });
}

/** Rounded limb hanging down from the local origin along -Y. r0 top radius, r1 bottom radius,
 *  mid: optional [t, r] bulge, depth: z/x ratio of the section. */
export function limb(len, r0, r1, opt = {}) {
  const d = opt.depth ?? 1, cols = opt.cols ?? 10, capT = opt.capTop ?? 0.75, capB = opt.capBottom ?? 0.75;
  const L = [];
  if (capT > 0) { L.push({ y: r0 * capT, a: 0, b: 0 }); L.push({ y: r0 * capT * 0.72, a: r0 * 0.68, b: r0 * 0.68 * d }); }
  L.push({ y: 0, a: r0, b: r0 * d });
  if (opt.mid) for (const [t, r] of opt.mid) L.push({ y: -len * t, a: r, b: r * d, z: opt.midZ ? opt.midZ(t) : 0 });
  L.push({ y: -len, a: r1, b: r1 * d });
  if (capB > 0) { L.push({ y: -len - r1 * capB * 0.72, a: r1 * 0.68, b: r1 * 0.68 * d }); L.push({ y: -len - r1 * capB, a: 0, b: 0 }); }
  return rings(L, cols);
}

/** Sweep a lens-shaped cross-section along points (hair locks, straps, tails).
 *  width(s), thick(s): s = 0..1 along the path; out(p, i): direction the flat side faces. */
export function sweep(points, width, thick, out, sides = 6) {
  const n = points.length;
  const T = [], F = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  const pos = [], uvs = [], sArr = [];
  let acc = 0; const lens = [0];
  for (let i = 1; i < n; i++) { acc += points[i].distanceTo(points[i - 1]); lens.push(acc); }
  for (let i = 0; i < n; i++) {
    const s = acc > 0 ? lens[i] / acc : i / (n - 1);
    const o = out(points[i], i, s).clone();
    const B = new THREE.Vector3().crossVectors(T[i], o).normalize();
    const N = new THREE.Vector3().crossVectors(B, T[i]).normalize();
    const w = width(s) * 0.5, t = thick(s) * 0.5;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU;
      const p = points[i].clone().addScaledVector(B, Math.cos(a) * w).addScaledVector(N, Math.sin(a) * t);
      pos.push(p.x, p.y, p.z); uvs.push(k / sides, s); sArr.push(s);
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals(); weldNormals(g);
  g.userData.s = sArr;
  return g;
}

/** Catmull-Rom resample of control points (array of [x,y,z]) into n points. */
export function curve(ctrl, n = 8) {
  const c = new THREE.CatmullRomCurve3(ctrl.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  return c.getPoints(n - 1);
}

/** Box with rounded edges (for shoes, bags...). */
export function rbox(w, h, d, r, c = [0, 0, 0], seg = 2) {
  // superellipsoid (smooth, cheap, no seams)
  const e = 6; // exponent: higher = boxier
  const sgn = (x) => (x < 0 ? -1 : 1);
  const f = (x) => sgn(x) * Math.pow(Math.abs(x), 2 / e);
  // tessellation follows size: tiny badges / buttons stay cheap, bags and soles stay smooth
  const m = Math.max(w, h, d), cols = m < 0.07 ? 6 : m < 0.2 ? 8 : 12, rows = m < 0.07 ? 4 : m < 0.2 ? 6 : 8;
  return surface(cols, rows, (u, v) => {
    const ph = (u - 0.5) * TAU, th = (0.5 - v) * Math.PI;
    const x = f(Math.cos(th)) * f(Math.sin(ph)), y = f(Math.sin(th)), z = f(Math.cos(th)) * f(Math.cos(ph));
    return [c[0] + x * w / 2, c[1] + y * h / 2, c[2] + z * d / 2];
  });
}

// ------------------------------------------------------------------ skinning builder
const _c = new THREE.Color();
export class SkinBuilder {
  constructor(name = 'skin') {
    this.name = name;
    this.bones = []; this.bind = new Map();
    this.P = []; this.N = []; this.UV = []; this.C = []; this.SI = []; this.SW = []; this.I = [];
    this.nv = 0;
    this.whiteUV = [0.75, 0.75];
  }
  /** Create a bone at local offset (x,y,z) from parent (bind pose has identity rotations). */
  bone(name, parent, x = 0, y = 0, z = 0) {
    const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
    if (parent) parent.add(b);
    b.userData.bi = this.bones.length; this.bones.push(b);
    const pb = parent ? this.bind.get(parent) : null;
    this.bind.set(b, pb ? [pb[0] + x, pb[1] + y, pb[2] + z] : [x, y, z]);
    b.userData.rest = b.position.clone();
    return b;
  }
  bindPos(b) { return this.bind.get(b); }
  /** Add a geometry defined in `bone`-local coordinates.
   *  o: { bone, color | colorFn(x,y,z,s), weights(lx,ly,lz,s,i) -> [[bone,w],...], rect:[u0,v0,u1,v1] (remap geo uv into atlas),
   *       uvFn(lx,ly,lz,u,v,i)->[u,v] (atlas uv), matrix (extra local transform) } */
  add(geo, o) {
    if (o.matrix) { geo = geo.clone(); geo.applyMatrix4(o.matrix); }
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    const sA = geo.userData.s;
    const bp = this.bind.get(o.bone) || [0, 0, 0];
    const base = this.nv;
    if (o.color !== undefined) _c.set(o.color);
    const nm = o.matrix ? new THREE.Matrix3().getNormalMatrix(o.matrix) : null;
    const nv3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
      this.P.push(lx + bp[0], ly + bp[1], lz + bp[2]);
      nv3.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      this.N.push(nv3.x, nv3.y, nv3.z);
      const s = sA ? sA[i] : (uv ? uv.getY(i) : 0);
      if (o.uvFn) { const t = o.uvFn(lx, ly, lz, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, i); this.UV.push(t[0], t[1]); }
      else if (o.rect && uv) { const r = o.rect; this.UV.push(r[0] + (r[2] - r[0]) * uv.getX(i), r[1] + (r[3] - r[1]) * uv.getY(i)); }
      else this.UV.push(this.whiteUV[0], this.whiteUV[1]);
      if (o.colorFn) { _c.set(o.colorFn(lx, ly, lz, s, i)); }
      this.C.push(_c.r, _c.g, _c.b);
      let w = o.weights ? o.weights(lx, ly, lz, s, i) : [[o.bone, 1]];
      if (w.length > 4) w = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = 0; for (const e of w) tot += e[1];
      const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
      w.forEach((e, k) => { si[k] = e[0].userData.bi; sw[k] = tot > 0 ? e[1] / tot : 0; });
      if (tot <= 0) { si[0] = o.bone.userData.bi; sw[0] = 1; }
      this.SI.push(...si); this.SW.push(...sw);
    }
    if (geo.index) { const a = geo.index.array; for (let i = 0; i < a.length; i++) this.I.push(base + a[i]); }
    else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
    this.nv += pos.count;
    return this;
  }
  get triangles() { return this.I.length / 3; }
  /** Build the SkinnedMesh. root: Object3D that holds the root bone (at identity when called). */
  build(root, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingBox();
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.name = this.name;
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    mesh.bind(skeleton, mesh.matrixWorld);
    // generous fixed bounds in mesh space (pose changes never cull wrongly)
    const bb = g.boundingBox; const c = new THREE.Vector3(); bb.getCenter(c);
    const r = bb.getSize(new THREE.Vector3()).length() * 0.5 + 0.6;
    mesh.boundingSphere = new THREE.Sphere(c, r);
    mesh.geometry.boundingSphere = new THREE.Sphere(c, r);
    return mesh;
  }
}

// ------------------------------------------------------------------ IK & bone helpers
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _T = new THREE.Vector3(), _P = new THREE.Vector3(), _D = new THREE.Vector3(), _pv = new THREE.Vector3();
const _u = new THREE.Vector3(), _f = new THREE.Vector3(), _perp = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _x1 = new THREE.Vector3(), _x2 = new THREE.Vector3(), _E = new THREE.Vector3();

/** Two-bone IK. upper, lower: bones (lower child of upper). endLocal: offset of the end effector in
 *  lower's local space (bind). target/pole: world points. bendDir: rest direction (upper-local) the
 *  lower bone folds toward (arms: +Z, legs: -Z). Leaves lower.rotation a pure hinge. */
export function ik2(upper, lower, endLocal, target, pole, bendDir) {
  const parent = upper.parent;
  parent.updateWorldMatrix(true, false);
  _m.copy(parent.matrixWorld).invert();
  _T.copy(target).applyMatrix4(_m); _P.copy(pole).applyMatrix4(_m);
  const S = upper.position;
  const l1 = lower.userData.rest ? lower.userData.rest.length() : lower.position.length();
  const l2 = endLocal.length();
  _D.subVectors(_T, S); let d = _D.length(); if (d < 1e-6) return;
  _D.divideScalar(d);
  d = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  _pv.subVectors(_P, S); _pv.addScaledVector(_D, -_pv.dot(_D));
  if (_pv.lengthSq() < 1e-10) _pv.set(0, 0, -1).addScaledVector(_D, _D.z); _pv.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), A = Math.acos(cosA);
  _u.copy(_D).multiplyScalar(Math.cos(A)).addScaledVector(_pv, Math.sin(A)).normalize(); // upper dir
  _E.copy(S).addScaledVector(_u, l1);
  _f.copy(S).addScaledVector(_D, d).sub(_E).normalize();                                   // fore dir
  _perp.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_perp.lengthSq() < 1e-8) _perp.copy(_pv).multiplyScalar(-1);
  _perp.normalize();
  // rest frame of the upper bone: axis a (toward lower), bend b
  _a.copy(lower.userData.rest || lower.position).normalize();
  _b.copy(bendDir).addScaledVector(_a, -bendDir.dot(_a)).normalize();
  _x1.crossVectors(_a, _b); _x2.crossVectors(_u, _perp);
  _m.makeBasis(_a, _b, _x1); _m2.makeBasis(_u, _perp, _x2);
  _m2.multiply(_m.transpose());
  upper.quaternion.setFromRotationMatrix(_m2);
  // lower: rotate its rest axis onto the fore direction expressed in upper-local space
  _q.copy(upper.quaternion).invert();
  _f.applyQuaternion(_q);
  _D.copy(endLocal).normalize();
  lower.quaternion.setFromUnitVectors(_D, _f);
}

/** Set a bone's world orientation to q (world quaternion). */
export function setWorldQuat(obj, q) {
  obj.parent.updateWorldMatrix(true, false);
  obj.parent.getWorldQuaternion(_q2);
  obj.quaternion.copy(_q2.invert().multiply(q));
}

/** Rotation that tilts a bone hanging along -Y toward horizontal direction (dx,dz) by angle a. */
export function tiltQuat(q, dx, dz, a) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-6 || Math.abs(a) < 1e-6) return q.identity();
  _x1.set(-dz / l, 0, dx / l);
  return q.setFromAxisAngle(_x1, a);
}

/** Smooth deterministic noise from sines (per-character phase). */
export function wave(t, seed, f = 1) {
  return (Math.sin(t * 0.73 * f + seed * 1.7) * 0.5 + Math.sin(t * 1.37 * f + seed * 3.1) * 0.3 + Math.sin(t * 2.21 * f + seed * 5.3) * 0.2);
}
