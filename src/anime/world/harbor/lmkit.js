// [v4:landmarks-A] Geometry helpers for the landmarks built on real outlines (harbor/real.js): prisms from polygons
// with metric UVs (so one wrapping facade / parking / board texture fits any wall), caps, swept decks along 3D
// polylines, walls between two points, oriented boxes of polygons, polygon offsets. All in world metres.
import * as THREE from 'three';

/** Signed area in (x, z) (> 0 for a ring counter-clockwise in the x-right / z-up plane, i.e. clockwise on the map, z south). */
export function signedArea(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
/** Drop the closing duplicate point. */
export function openRing(poly) { const n = poly.length; return n > 1 && poly[0][0] === poly[n - 1][0] && poly[0][1] === poly[n - 1][1] ? poly.slice(0, -1) : poly.slice(); }

/** Outward unit normal of edge a->b for a ring of the given orientation (sign = Math.sign(signedArea)). */
function outN(a, b, sign) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return sign > 0 ? [dz / l, -dx / l] : [-dz / l, dx / l]; }

/**
 * Walls of a vertical prism over a ring, from y0 to y1 (numbers, or functions (x, z) -> y for a sloped top/bottom).
 * UVs: u = metres along the perimeter / tile, v = height above y0 / tile. Normals face outward.
 */
export function prismWalls(poly, y0, y1, { tile = 4, skip = null } = {}) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  const Y0 = typeof y0 === 'function' ? y0 : () => y0, Y1 = typeof y1 === 'function' ? y1 : () => y1;
  const pos = [], uv = [], nrm = [];
  let u = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05 || (skip && skip(i, a, b))) { u += len; continue; }
    const n = outN(a, b, sign);
    const ya0 = Y0(a[0], a[1]), ya1 = Y1(a[0], a[1]), yb0 = Y0(b[0], b[1]), yb1 = Y1(b[0], b[1]);
    const base = Math.min(ya0, yb0);
    const quad = [[a[0], ya0, a[1], u, ya0 - base], [b[0], yb0, b[1], u + len, yb0 - base], [b[0], yb1, b[1], u + len, yb1 - base], [a[0], ya1, a[1], u, ya1 - base]];
    // wind so the face points outward: (b - a) x up = outward for the right winding
    const tri = (i0, i1, i2) => { for (const q of [quad[i0], quad[i1], quad[i2]]) { pos.push(q[0], q[1], q[2]); uv.push(q[3] / tile, q[4] / tile); nrm.push(n[0], 0, n[1]); } };
    // triangle (a0, b0, b1) has normal edge x up = (-ez, 0, ex) (right-handed); keep it if that faces outward
    const ex = b[0] - a[0], ez = b[1] - a[1];
    if (-ez * n[0] + ex * n[1] > 0) { tri(0, 1, 2); tri(0, 2, 3); } else { tri(0, 2, 1); tri(0, 3, 2); }
    u += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Flat cap over a ring at height y (or y(x, z)), facing up (or down). UVs = world x / tile, z / tile. */
export function capGeo(poly, y, { tile = 4, down = false, holes = [], uvFrame = null } = {}) {
  const P = openRing(poly);
  const Y = typeof y === 'function' ? y : () => y;
  const contour = P.map((p) => new THREE.Vector2(p[0], p[1]));
  const H = holes.map((h) => openRing(h).map((p) => new THREE.Vector2(p[0], p[1])));
  const tris = THREE.ShapeUtils.triangulateShape(contour, H);
  const all = [...contour, ...H.flat()];
  const pos = [], uv = [];
  for (const t of tris) {
    const idx = down ? t : [t[0], t[2], t[1]];
    // make the triangle face up (+Y) unless down
    const [a, b, c] = idx.map((i) => all[i]);
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);   // in (x, z): > 0 means clockwise from +Y
    const order = (cr < 0) !== down ? [a, b, c] : [a, c, b];
    for (const v of order) {
      pos.push(v.x, Y(v.x, v.y), v.y);
      if (uvFrame) {   // texture axes along a frame: u along ax from u0, v along ay from v0 (v grows down the canvas)
        const f = uvFrame, dx = v.x - f.cx, dz = v.y - f.cz;
        uv.push((dx * f.ax[0] + dz * f.ax[1] - f.u0) / tile, -(dx * f.ay[0] + dz * f.ay[1] - f.v0) / tile);
      } else uv.push(v.x / tile, -v.y / tile);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Offset a ring outward by d metres (negative = inward), mitred. */
export function offsetRing(poly, d) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const n1 = outN(a, b, sign), n2 = outN(b, c, sign);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const cos = Math.max(0.35, mx * n1[0] + mz * n1[1]);
    out.push([b[0] + mx * d / cos, b[1] + mz * d / cos]);
  }
  return out;
}

/** Minimum-area oriented box of a ring: { cx, cz, w (along rotY's local x), d (local z, the long side), rotY }. */
export function obbOf(poly) {
  const P = openRing(poly); let best = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of P) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  const { ux, uz, u0, u1, v0, v1 } = best, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const cx = um * ux - vm * uz, cz = um * uz + vm * ux;
  const lu = u1 - u0, lv = v1 - v0;
  // local +Z along the long side
  if (lu >= lv) return { cx, cz, w: lv, d: lu, rotY: Math.atan2(ux, uz), ux, uz };
  return { cx, cz, w: lu, d: lv, rotY: Math.atan2(-uz, ux), ux: -uz, uz: ux };
}

/** Oriented box between two XZ points: centre, length and rotY (local +Z along a->b). */
export function seg(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, len, rotY: Math.atan2(dx, dz), ux: dx / (len || 1), uz: dz / (len || 1) }; }

/** Box between a and b at height y (centre) with section w × h: returns the mesh. */
export function barAlong(k, a, b, y, w, h, mat, extend = 0) { const s = seg(a, b); return k.box(w, h, s.len + extend, mat, [s.x, y, s.z], [0, s.rotY, 0]); }

/** Resample a 2D polyline every `step` metres: [{ x, z, s, ux, uz }]. */
export function resample(pts, step) {
  const out = []; let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    const n = Math.max(1, Math.ceil(l / step));
    for (let j = 0; j < n; j++) { const t = j / n; out.push({ x: a[0] + ux * l * t, z: a[1] + uz * l * t, s: s + l * t, ux, uz }); }
    s += l;
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  out.push({ x: b[0], z: b[1], s, ux: (b[0] - a[0]) / l, uz: (b[1] - a[1]) / l });
  return out;
}

/** Point and tangent at arclength s along a 2D polyline. */
export function atLen(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s || i === pts.length - 2) { const t = Math.max(0, Math.min(1, (s - acc) / (l || 1))); return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / (l || 1), uz: (b[1] - a[1]) / (l || 1) }; }
    acc += l;
  }
  return { x: pts[0][0], z: pts[0][1], ux: 1, uz: 0 };
}
export function lineLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

/**
 * A slab swept along a polyline: samples [{ x, z, y, ux, uz }] (y = top), across-path offsets l0..l1 (+ = right of
 * travel), thickness th. One geometry (top, bottom, both sides) with metric UVs; every face wound to face outward.
 */
export function sweepSlab(samples, { l0 = -1, l1 = 1, th = 0.3, tile = 2, sides = true, bottom = true } = {}) {
  const pos = [], uv = [];
  const P = samples.map((p) => ({ p, rx: -p.uz, rz: p.ux }));
  const pt = (i, l, dy) => { const { p, rx, rz } = P[i]; return [p.x + rx * l, p.y + dy, p.z + rz * l]; };
  const S = []; let s = 0; for (let i = 0; i < P.length; i++) { if (i) s += Math.hypot(P[i].p.x - P[i - 1].p.x, P[i].p.z - P[i - 1].p.z); S.push(s); }
  quadInto(pos, uv, tile);
  for (let i = 0; i < P.length - 1; i++) {
    const s0 = S[i], s1 = S[i + 1], r = [(P[i].rx + P[i + 1].rx) / 2, 0, (P[i].rz + P[i + 1].rz) / 2];
    Q(pt(i, l0, 0), pt(i + 1, l0, 0), pt(i + 1, l1, 0), pt(i, l1, 0), [l0, s0], [l0, s1], [l1, s1], [l1, s0], [0, 1, 0]);
    if (bottom) Q(pt(i, l0, -th), pt(i + 1, l0, -th), pt(i + 1, l1, -th), pt(i, l1, -th), [l0, s0], [l0, s1], [l1, s1], [l1, s0], [0, -1, 0]);
    if (sides) {
      Q(pt(i, l1, 0), pt(i + 1, l1, 0), pt(i + 1, l1, -th), pt(i, l1, -th), [s0, th], [s1, th], [s1, 0], [s0, 0], r);
      Q(pt(i, l0, 0), pt(i + 1, l0, 0), pt(i + 1, l0, -th), pt(i, l0, -th), [s0, th], [s1, th], [s1, 0], [s0, 0], [-r[0], 0, -r[2]]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

let _Q = null;
function quadInto(pos, uv, tile) { _Q = { pos, uv, tile }; }
/** Quad a-b-c-d (any winding) with uvs, wound so its normal points along `want`. */
function Q(a, b, c, d, ua, ub, uc, ud, want) {
  const { pos, uv, tile } = _Q;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0;
  const T = flip ? [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]] : [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]];
  for (const [q, u] of T) { pos.push(q[0], q[1], q[2]); uv.push(u[0] / tile, u[1] / tile); }
}

/** Generic quad list -> geometry: quads [[a, b, c, d, want]] (uv = metric along a->b and a->d). */
export function quadsGeo(quads, tile = 2) {
  const pos = [], uv = []; quadInto(pos, uv, tile);
  for (const [a, b, c, d, want] of quads) {
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), lad = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    Q(a, b, c, d, [0, 0], [lab, 0], [lab, lad], [0, lad], want);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A group at the world origin, added as static scenery, with a kit on it. */
export function worldKit(ctx, name) {
  const g = new THREE.Group(); g.name = name; ctx.addStatic(g); return { g, k: ctx.kit(g) };
}

/** Painted texture helper cached by key (≤ 1024 px). */
export function paint(ctx, key, w, h, fn, repeat) { return ctx.tex.draw(w, h, fn, { key: 'lm4-' + key, repeat: repeat || [1, 1] }); }

/**
 * Sweep a closed 2D section along a 3D path. samples [{ x, y, z, ux, uz }] (horizontal tangent; y = the section
 * origin height); section [[l, dy], ...] (l = metres to the right of travel, dy up), convex or star-shaped around its
 * centroid. Faces are wound outward. UVs: u = metres along the path / tile, v = metres round the section / tile.
 */
export function sweepSection(samples, section, { tile = 4, caps = true } = {}) {
  const pos = [], uv = []; quadInto(pos, uv, tile);
  const n = section.length, cl = section.reduce((s, p) => s + p[0], 0) / n, cy = section.reduce((s, p) => s + p[1], 0) / n;
  const W = (i, j) => { const p = samples[i], [l, dy] = section[j]; return [p.x - p.uz * l, p.y + dy, p.z + p.ux * l]; };   // right = (-uz, ux)
  let S = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    let V = 0;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n, e = Math.hypot(section[j2][0] - section[j][0], section[j2][1] - section[j][1]);
      const ml = (section[j][0] + section[j2][0]) / 2 - cl, my = (section[j][1] + section[j2][1]) / 2 - cy;
      const want = [-a.uz * ml, my, a.ux * ml];
      Q(W(i, j), W(i + 1, j), W(i + 1, j2), W(i, j2), [S, V], [S + d, V], [S + d, V + e], [S, V + e], want);
      V += e;
    }
    S += d;
  }
  if (caps) for (const [i, sg] of [[0, -1], [samples.length - 1, 1]]) {
    const p = samples[i], c = [p.x - p.uz * cl, p.y + cy, p.z + p.ux * cl];
    for (let j = 0; j < n; j++) { const A = W(i, j), B = W(i, (j + 1) % n); Q(c, A, B, c, [0, 0], [1, 0], [1, 1], [0, 1], [p.ux * sg, 0, p.uz * sg]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A tube (n-gon section of radius r, or [rx, ry]) along 3D points (any direction): for pylon legs, arch ribs. */
export function tubeAlong(points, r, { sides = 8, rot = Math.PI / 8 } = {}) {
  const V = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(V, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, Math.max(4, points.length * 4), 1, sides, false);
  // TubeGeometry has a circular radius 1: scale the ring per vertex to (rx, ry) in the Frenet frame is overkill; use r
  const rx = Array.isArray(r) ? r[0] : r, p = g.attributes.position, fr = curve.computeFrenetFrames(Math.max(4, points.length * 4), false);
  const segs = Math.max(4, points.length * 4);
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs);
    for (let j = 0; j <= sides; j++) {
      const idx = i * (sides + 1) + j; const v = new THREE.Vector3(p.getX(idx), p.getY(idx), p.getZ(idx)).sub(c);
      const ry = Array.isArray(r) ? r[1] : r;
      const nx = v.dot(fr.normals[i]), bx = v.dot(fr.binormals[i]);
      const out = c.clone().addScaledVector(fr.normals[i], nx * rx).addScaledVector(fr.binormals[i], bx * ry);
      p.setXYZ(idx, out.x, out.y, out.z);
    }
  }
  void rot;
  g.computeVertexNormals();
  return g;
}
