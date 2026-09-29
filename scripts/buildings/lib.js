// Pure helpers for the buildings / trees pipeline (P2). No I/O here, so tests import it directly.
import earcut, { deviation } from "earcut";
import { hash01 } from "../../src/core/geo.js";

// ---------------------------------------------------------------- height heuristic (BUILD-SPEC §3)
export const BASE_HEIGHT = { 3101: 6.5, 3102: 11.0, 3103: 24.0, 3111: 4.0, 3112: 4.0 };
export const DEFAULT_HEIGHT = 6.0;
export const GABLE_SHARE = 0.3;
export const RIDGE_RISE = 1.5;
export const LIT_SHARE = 0.35;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Eave height (m) for a footprint of `area` m² with GSI code `code` and stable id. */
export function buildingHeight(code, area, id) {
  const base = BASE_HEIGHT[code] ?? DEFAULT_HEIGHT;
  let h = base * (1 + 0.25 * clamp(Math.log10(Math.max(area, 1e-6) / 120), -1, 1));
  h *= 0.94 + 0.12 * hash01(id);
  return clamp(h, 3, 45);
}

export function isGabled(code, id) {
  return code === 3101 && hash01(`${id}#gable`) < GABLE_SHARE;
}

export function isLit(id) {
  return hash01(`${id}#lit`) < LIT_SHARE;
}

/** The per-vertex `code` byte in *.mesh.bin: vt_code - 3100 for 31xx codes, else 0. */
export function codeByte(code) {
  return code >= 3100 && code < 3200 ? code - 3100 : 0;
}

// ---------------------------------------------------------------- polygon geometry
/** Shoelace signed area over [a, b] pairs (positive = CCW in a right-handed (a, b) plane). */
export function signedArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/**
 * Winding convention for ENU [x, z] rings: "CCW" means counter-clockwise viewed from above (+y),
 * i.e. on a north-up map (GeoJSON style). Since z points south that is signedArea over (x, -z) > 0,
 * which equals signedArea over (x, z) < 0.
 */
export function isCcwFromAbove(ring) {
  return signedArea(ring) < 0;
}

export function centroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const m = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / ring.length, m[1] / ring.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x, z, poly, holes = []) {
  if (!pointInRing(x, z, poly)) return false;
  for (const h of holes) if (pointInRing(x, z, h)) return false;
  return true;
}

/** Drop closing duplicate, consecutive near-duplicates (< eps m) and collinear points. */
export function cleanRing(ring, eps = 0.05) {
  let pts = ring.slice();
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < eps) pts.pop();
  }
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= eps) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < eps) out.pop();
  }
  // collinear removal (repeat until stable)
  let changed = true;
  let r = out;
  while (changed && r.length > 3) {
    changed = false;
    const next = [];
    for (let i = 0; i < r.length; i++) {
      const p = r[(i - 1 + r.length) % r.length], c = r[i], n = r[(i + 1) % r.length];
      const cross = (c[0] - p[0]) * (n[1] - p[1]) - (c[1] - p[1]) * (n[0] - p[0]);
      const len = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
      if (Math.abs(cross) / len < eps * 0.5) {
        changed = true;
        continue;
      }
      next.push(c);
    }
    if (next.length < 3) break;
    r = next;
  }
  return r;
}

/** Douglas-Peucker on a closed ring (keeps at least 3 points). */
export function simplifyRing(ring, tol) {
  if (ring.length <= 4 || tol <= 0) return ring;
  // split at the point farthest from ring[0]
  let far = 0, fd = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) (fd = d), (far = i);
  }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
    let idx = -1, md = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
      if (d > md) (md = d), (idx = i);
    }
    if (md <= tol) return [a, b];
    const l = dp(pts.slice(0, idx + 1));
    const r = dp(pts.slice(idx));
    return l.slice(0, -1).concat(r);
  };
  const first = dp(ring.slice(0, far + 1));
  const second = dp(ring.slice(far).concat([ring[0]]));
  const out = first.slice(0, -1).concat(second.slice(0, -1));
  return out.length >= 3 ? out : ring;
}

/** Sutherland-Hodgman clip of a ring (tile coords) to the square [lo, hi]². */
export function clipRingToBox(ring, lo, hi) {
  let out = ring;
  const edges = [
    (p) => p[0] >= lo, (p) => p[0] <= hi, (p) => p[1] >= lo, (p) => p[1] <= hi,
  ];
  const inter = [
    (a, b) => [lo, a[1] + ((b[1] - a[1]) * (lo - a[0])) / (b[0] - a[0])],
    (a, b) => [hi, a[1] + ((b[1] - a[1]) * (hi - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (lo - a[1])) / (b[1] - a[1]), lo],
    (a, b) => [a[0] + ((b[0] - a[0]) * (hi - a[1])) / (b[1] - a[1]), hi],
  ];
  for (let e = 0; e < 4; e++) {
    const inp = out;
    out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i - 1 + inp.length) % inp.length];
      const ci = edges[e](cur), pi = edges[e](prev);
      if (ci) {
        if (!pi) out.push(inter[e](prev, cur));
        out.push(cur);
      } else if (pi) out.push(inter[e](prev, cur));
    }
  }
  return out;
}

/** Liang-Barsky clip of a polyline to [lo, hi]²; returns a list of polylines. */
export function clipLineToBox(line, lo, hi) {
  const parts = [];
  let cur = null;
  for (let i = 0; i < line.length - 1; i++) {
    let [x0, y0] = line[i], [x1, y1] = line[i + 1];
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    let ok = true;
    for (const [p, q] of [[-dx, x0 - lo], [dx, hi - x0], [-dy, y0 - lo], [dy, hi - y0]]) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const r = q / p;
        if (p < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; }
        else { if (r < t0) ok = false; else if (r < t1) t1 = r; }
      }
    }
    if (!ok) { if (cur) parts.push(cur), (cur = null); continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur) cur = [a];
    cur.push(b);
    if (t1 < 1) { parts.push(cur); cur = null; }
  }
  if (cur) parts.push(cur);
  return parts.filter((p) => p.length >= 2);
}

/** Triangulate polygon (+holes) with earcut; returns {indices, verts:[[x,z]...], deviation}. */
export function triangulate(poly, holes = []) {
  const flat = [];
  const holeIdx = [];
  for (const p of poly) flat.push(p[0], p[1]);
  for (const h of holes) {
    holeIdx.push(flat.length / 2);
    for (const p of h) flat.push(p[0], p[1]);
  }
  const indices = earcut(flat, holeIdx.length ? holeIdx : undefined, 2);
  const dev = indices.length ? deviation(flat, holeIdx.length ? holeIdx : undefined, 2, indices) : 1;
  const verts = [];
  for (let i = 0; i < flat.length; i += 2) verts.push([flat[i], flat[i + 1]]);
  return { indices, verts, deviation: dev };
}

/** Segment intersection test for self-intersection checks (proper crossings only). */
export function ringSelfIntersects(ring) {
  const n = ring.length;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = ring[j], d = ring[(j + 1) % n];
      const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- extrusion
/**
 * Growable mesh buffers matching the KLC1 layout plus per-vertex attributes.
 */
export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.code = [];
    this.roof = [];
    this.flags = [];
    this.idx = [];
  }
  get vertCount() {
    return this.code.length;
  }
  vert(x, y, z, nx, ny, nz, u, v, code, roof, flags) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.code.push(code);
    this.roof.push(roof);
    this.flags.push(flags);
    return this.code.length - 1;
  }
}

export const FLAG_LIT = 1, FLAG_ROOF = 2, FLAG_GABLE_END = 4;

/** Near-rectangular 4-vertex footprint suitable for a gable roof? */
export function gableable(poly, holes) {
  if (holes.length || poly.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const p = poly[(i + 3) % 4], c = poly[i], n = poly[(i + 1) % 4];
    const ax = p[0] - c[0], az = p[1] - c[1], bx = n[0] - c[0], bz = n[1] - c[1];
    const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
    if (Math.abs(cos) > 0.2) return false; // corners within ~12° of square
  }
  return true;
}

/**
 * Extrude one footprint into mb. poly: CCW-from-above outer ring [[x,z]...]; holes CW-from-above.
 * base: wall bottom y; top: eave y; gable: add a ridge RIDGE_RISE above `top` if footprint allows.
 * Returns {tris, gabled}.
 */
export function extrudeBuilding(mb, { poly, holes = [], base, top, code, roof = 0, lit = false, gable = false }) {
  const cb = codeByte(code);
  const litF = lit ? FLAG_LIT : 0;
  const H = top - base;
  const t0 = mb.idx.length;
  const rings = [poly, ...holes];
  for (const ring of rings) {
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const nx = -dz / L, nz = dx / L; // outward = cross(dir, up)
      const i0 = mb.vert(a[0], base, a[1], nx, 0, nz, u, 0, cb, roof, litF);
      const i1 = mb.vert(b[0], base, b[1], nx, 0, nz, u + L, 0, cb, roof, litF);
      const i2 = mb.vert(b[0], top, b[1], nx, 0, nz, u + L, 1, cb, roof, litF);
      const i3 = mb.vert(a[0], top, a[1], nx, 0, nz, u, 1, cb, roof, litF);
      mb.idx.push(i0, i1, i2, i0, i2, i3);
      u += L;
    }
  }
  let gabled = false;
  if (gable && gableable(poly, holes)) {
    gabled = true;
    // long edges: pick the pair (0-1, 2-3) or (1-2, 3-0) with the greater length
    const len = (i) => Math.hypot(poly[(i + 1) % 4][0] - poly[i][0], poly[(i + 1) % 4][1] - poly[i][1]);
    const s = len(0) + len(2) >= len(1) + len(3) ? 0 : 1;
    const v = [0, 1, 2, 3].map((k) => poly[(k + s) % 4]); // v0-v1 and v2-v3 are the long eaves
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m1 = mid(v[1], v[2]), m3 = mid(v[3], v[0]);
    const ridge = top + RIDGE_RISE;
    const face = (pts, flags) => {
      // pts: [[x,y,z]...] planar convex polygon; normal from first triangle, forced upward/outward
      const [p, q, r] = pts;
      let nx = (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]);
      let ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
      let nz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L, ny /= L, nz /= L;
      const ids = pts.map((pt) => mb.vert(pt[0], pt[1], pt[2], nx, ny, nz, 0, 1, cb, roof, flags | litF));
      for (let k = 1; k < ids.length - 1; k++) mb.idx.push(ids[0], ids[k], ids[k + 1]);
    };
    const P = (p, y) => [p[0], y, p[1]];
    // slopes: order chosen so the normal points up (CCW seen from above in x/-z)
    const slope = (a, b, c, d) => {
      const pts = [P(a, top), P(b, top), P(c, ridge), P(d, ridge)];
      const ny = (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]) - (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]);
      face(ny >= 0 ? pts : pts.slice().reverse(), FLAG_ROOF);
    };
    slope(v[0], v[1], m1, m3);
    slope(v[2], v[3], m3, m1);
    // gable ends (vertical triangles on the short edges, facing outward like the wall below)
    const gableEnd = (a, b, m) => {
      const pts = [P(a, top), P(b, top), P(m, ridge)];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      const ids = pts.map((pt) => mb.vert(pt[0], pt[1], pt[2], nx, 0, nz, 0, 1, cb, roof, FLAG_GABLE_END | litF));
      mb.idx.push(ids[0], ids[1], ids[2]);
    };
    gableEnd(v[1], v[2], m1);
    gableEnd(v[3], v[0], m3);
  } else {
    const { indices, verts } = triangulate(poly, holes);
    const ids = verts.map((p) => mb.vert(p[0], top, p[1], 0, 1, 0, 0, 1, cb, roof, FLAG_ROOF | litF));
    for (let k = 0; k < indices.length; k += 3) {
      const a = verts[indices[k]], b = verts[indices[k + 1]], c = verts[indices[k + 2]];
      // y component of (b-a) x (c-a) in (x, y, z): (b.z-a.z)*(c.x-a.x) - (b.x-a.x)*(c.z-a.z)
      const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      if (ny >= 0) mb.idx.push(ids[indices[k]], ids[indices[k + 1]], ids[indices[k + 2]]);
      else mb.idx.push(ids[indices[k]], ids[indices[k + 2]], ids[indices[k + 1]]);
    }
  }
  return { tris: (mb.idx.length - t0) / 3, gabled };
}

// ---------------------------------------------------------------- KLC1 mesh binary
export const MESH_MAGIC = 0x4b4c4331; // 'KLC1'
export const ATTR_MAGIC = 0x4b4c4131; // 'KLA1'

/**
 * Pad the vertex count to a multiple of 4 with unreferenced copies of the last vertex, so that in
 * the unpadded KLC1 layout (12 + 33*V bytes before idx) the uint32 index block is 4-byte aligned.
 */
export function alignVertexCount(mb) {
  const V = mb.vertCount;
  if (!V) return mb;
  const k = V - 1;
  while (mb.vertCount % 4) {
    mb.vert(
      mb.pos[k * 3], mb.pos[k * 3 + 1], mb.pos[k * 3 + 2],
      mb.nrm[k * 3], mb.nrm[k * 3 + 1], mb.nrm[k * 3 + 2],
      mb.uv[k * 2], mb.uv[k * 2 + 1], mb.code[k], mb.roof[k], mb.flags[k],
    );
  }
  return mb;
}

/**
 * Encode KLC1 exactly per BUILD-SPEC §3: uint32 magic, vertCount, indexCount (LE), then
 * f32 pos[V*3], f32 nrm[V*3], f32 uv[V*2], u8 code[V], u32 idx[I]. No padding bytes; the
 * vertex count is padded to a multiple of 4 first so idx starts 4-byte aligned.
 */
export function encodeMesh(mb) {
  alignVertexCount(mb);
  const V = mb.vertCount, I = mb.idx.length;
  const size = 12 + V * 33 + I * 4;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  dv.setUint32(0, MESH_MAGIC, true);
  dv.setUint32(4, V, true);
  dv.setUint32(8, I, true);
  let o = 12;
  new Float32Array(buf, o, V * 3).set(mb.pos);
  o += V * 12;
  new Float32Array(buf, o, V * 3).set(mb.nrm);
  o += V * 12;
  new Float32Array(buf, o, V * 2).set(mb.uv);
  o += V * 8;
  new Uint8Array(buf, o, V).set(mb.code);
  o += V;
  const iv = new DataView(buf, o, I * 4);
  for (let i = 0; i < I; i++) iv.setUint32(i * 4, mb.idx[i], true);
  return new Uint8Array(buf);
}

/** Decode KLC1 (spec layout, no padding). Works for any alignment via copies. */
export function decodeMesh(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  const V = dv.getUint32(4, true), I = dv.getUint32(8, true);
  let o = 12;
  const pos = new Float32Array(buf, o, V * 3);
  o += V * 12;
  const nrm = new Float32Array(buf, o, V * 3);
  o += V * 12;
  const uv = new Float32Array(buf, o, V * 2);
  o += V * 8;
  const code = new Uint8Array(buf, o, V);
  o += V;
  const idx = o % 4 === 0 ? new Uint32Array(buf, o, I) : new Uint32Array(buf.slice(o, o + I * 4));
  return { magic, vertCount: V, indexCount: I, pos, nrm, uv, code, idx, byteLength: buf.byteLength, expectedLength: o + I * 4 };
}

/** KLA1 attribute file: header magic, vertCount, then roof palette index u8[V], flags u8[V]. */
export function encodeAttr(mb) {
  const V = mb.vertCount;
  const buf = new Uint8Array(8 + V * 2);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, ATTR_MAGIC, true);
  dv.setUint32(4, V, true);
  buf.set(mb.roof, 8);
  buf.set(mb.flags, 8 + V);
  return buf;
}

export function decodeAttr(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const V = dv.getUint32(4, true);
  return { magic: dv.getUint32(0, true), vertCount: V, roof: u8.subarray(8, 8 + V), flags: u8.subarray(8 + V, 8 + 2 * V) };
}

// ---------------------------------------------------------------- roof palette (ADDENDUM-model §2)
/** Model palette. index is what *.attr.bin stores; rgb is the model-mode render colour. */
export const PALETTE = [
  { index: 0, name: "white", rgb: [236, 233, 226] },
  { index: 1, name: "grey", rgb: [152, 152, 148] },
  { index: 2, name: "red", rgb: [178, 86, 72] },
  { index: 3, name: "blue", rgb: [86, 120, 160] },
  { index: 4, name: "brown", rgb: [142, 106, 80] },
];

export function rgbToHsv(r, g, b) {
  r /= 255, g /= 255, b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

/**
 * Quantise an aerial roof colour to the model palette index.
 * Aerial roofs are hazy and desaturated, so hue decides only when there is real chroma.
 */
export function quantiseRoof(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  const chroma = s * v; // 0..1
  if (chroma < 0.07 || s < 0.12) return v > 0.6 ? 0 : 1; // white / grey
  if (h >= 165 && h < 275) return 3; // blue / cyan / teal metal roofs
  if (h >= 75 && h < 165) return chroma < 0.12 ? (v > 0.6 ? 0 : 1) : 3; // green-ish: painted metal reads blue-green on the model
  if (h >= 345 || h < 18) return v >= 0.5 && s >= 0.2 ? 2 : 4; // bright red tile/metal vs dark red-brown
  if (h >= 275 && h < 345) return s > 0.25 ? 2 : 1; // magenta-ish -> red, else grey
  // 18..75: orange / tan / yellow -> brown, unless very bright and pale (light concrete -> white)
  if (v > 0.72 && s < 0.25) return 0;
  return 4;
}

/**
 * Grey-world gains from a pool of roof colours: most roofs are neutral, so the per-channel median
 * of the pool is mapped to its own mean grey. Gains clamped to [0.75, 1.35].
 */
export function whiteBalanceGains(pool) {
  if (!pool || pool.length < 5) return [1, 1, 1];
  const med = [0, 1, 2].map((c) => pool.map((p) => p[c]).sort((a, b) => a - b)[pool.length >> 1]);
  const grey = (med[0] + med[1] + med[2]) / 3;
  return med.map((m) => Math.min(1.35, Math.max(0.75, grey / Math.max(m, 1))));
}
