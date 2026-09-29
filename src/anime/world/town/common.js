// [v3:town] Shared helpers for the town package: the house-kit context H (Sakura's generator bound to our ctx),
// a spatial hash over lots and roads, polygon utilities and small geometry helpers.
import * as THREE from 'three';
import { GB, Frame, slab, poly } from './kit/gb.js';
import { makeHouseTextures, makeHouseMaterials } from './kit/tex.js';
import { makeProps, blobRaw, leafRaw } from './kit/props.js';
import { Laundry } from './kit/laundry.js';
import { boundarySeg, boundarySegZ } from './kit/lot.js';
import { foliageMaterial } from './kit/foliage.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const pick = (r, a) => a[Math.floor(r() * a.length)];
export const wpick = (r, items) => { let s = 0; for (const [, w] of items) s += w; let x = r() * s; for (const [v, w] of items) { x -= w; if (x <= 0) return v; } return items[items.length - 1][0]; };

/** The house-kit context: materials, atlas, geometry batcher and frame helpers (see kit/house.js). */
export function makeH(ctx) {
  const L = ctx.L;
  const tex = makeHouseTextures(ctx);
  const M = makeHouseMaterials(ctx, tex);
  M.foliage = foliageMaterial(ctx);
  M.meshFence = ctx.mat.decal('#ffffff', { map: tex.decal.texture, vertexColors: true, transparent: true, side: 'double' });
  const gb = new GB(ctx);
  const H = { ctx, L, M, tex, A: tex.atlas, gb, slab, poly, blobRaw, leafRaw, lod: 2, Frame };
  H.antennaAz = Math.atan2(-0.62, -0.78) + Math.PI / 2;
  H.dishAz = 0.7;
  H.P = H.props = makeProps(H);
  H.laundry = new Laundry(H);
  H.bnd = { boundarySeg, boundarySegZ };
  const phys = ctx.physics;
  H.gy = (fr, x, z) => { const p = fr.w(x, 0, z); return L.heightAt(p.x, p.z) - p.y; };
  H.col = (fr, x, z, w, d, ry, y0, y1) => { const p = fr.w(x, 0, z); phys.addBox(p.x, p.z, w, d, fr.ry + ry, p.y + y0, p.y + y1); };
  H.colC = (fr, x, z, rad, y0, y1) => { const p = fr.w(x, 0, z); phys.addCylinder(p.x, p.z, rad, p.y + y0, p.y + y1); };
  H.walk = (fr, x, z, w, d, ry, top, bottom) => { const p = fr.w(x, 0, z); phys.addWalkBox(p.x, p.z, w, d, fr.ry + ry, p.y + top, bottom !== undefined ? p.y + bottom : p.y + top - 0.6); };
  const quadsMesh = (fr, mat, col, quads, fl) => {
    const P = [], N = [], U = [], I = [];
    for (const q of quads) {
      const k = P.length / 3;
      for (let i = 0; i < 4; i++) { P.push(...q.p[i]); N.push(...q.n); U.push(...(q.uv ? q.uv[i] : [0, 0])); }
      const a = q.p[0], b = q.p[1], c = q.p[2];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      if (cx * q.n[0] + cy * q.n[1] + cz * q.n[2] >= 0) I.push(k, k + 1, k + 2, k, k + 2, k + 3); else I.push(k, k + 2, k + 1, k, k + 3, k + 2);
    }
    if (quads.length) gb.mesh(mat, col, P, N, U, I, fr.M(0, 0, 0), fl);
  };
  H.quads = quadsMesh;
  H.slopedWall = (fr, a, b, z, h, t, mat, col, uS, vS, base) => {
    const L2 = b - a; if (L2 <= 0.01) return;
    const n = Math.max(1, Math.ceil(L2 / 2.5));
    const quads = [];
    const z0 = z - t / 2, z1 = z + t / 2;
    for (let i = 0; i < n; i++) {
      const x0 = a + L2 * i / n, x1 = a + L2 * (i + 1) / n;
      const g0 = H.gy(fr, x0, z), g1 = H.gy(fr, x1, z);
      const bo = base === undefined ? -0.3 : base;
      const b0 = g0 + bo, b1 = g1 + bo, t0 = g0 + h, t1 = g1 + h;
      const uv = (x, dy) => (uS ? [x / uS, dy / vS] : [0.5, 0.5]);
      quads.push({ p: [[x0, b0, z1], [x1, b1, z1], [x1, t1, z1], [x0, t0, z1]], n: [0, 0, 1], uv: [uv(x0, bo), uv(x1, bo), uv(x1, h), uv(x0, h)] });
      quads.push({ p: [[x1, b1, z0], [x0, b0, z0], [x0, t0, z0], [x1, t1, z0]], n: [0, 0, -1], uv: [uv(-x1, bo), uv(-x0, bo), uv(-x0, h), uv(-x1, h)] });
      quads.push({ p: [[x0, t0, z1], [x1, t1, z1], [x1, t1, z0], [x0, t0, z0]], n: [0, 1, 0], uv: [uv(x0, 0), uv(x1, 0), uv(x1, t), uv(x0, t)] });
      if (i === 0) quads.push({ p: [[x0, b0, z0], [x0, b0, z1], [x0, t0, z1], [x0, t0, z0]], n: [-1, 0, 0], uv: [uv(0, bo), uv(t, bo), uv(t, h), uv(0, h)] });
      if (i === n - 1) quads.push({ p: [[x1, b1, z1], [x1, b1, z0], [x1, t1, z0], [x1, t1, z1]], n: [1, 0, 0], uv: [uv(0, bo), uv(t, bo), uv(t, h), uv(0, h)] });
    }
    quadsMesh(fr, mat, col, quads);
  };
  H.groundRect = (fr, x0, z0, x1, z1, mat, col, lift = 0.02, uvS = 2) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    const nx = Math.max(1, Math.ceil((x1 - x0) / 2.2)), nz = Math.max(1, Math.ceil((z1 - z0) / 2.2));
    const P = [], N = [], U = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      const w = fr.w(x, 0, z);
      P.push(x, L.heightAt(w.x, w.z) - w.y + lift, z); N.push(0, 1, 0); U.push(w.x / uvS, -w.z / uvS);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, c, b, b, c, d); }
    gb.mesh(mat, col, P, N, U, I, fr.M(0, 0, 0), { shadow: false });
  };
  H.decal = (fr, name, x, y, w, h, z, col, o = {}) => {
    const rc = tex.decal.rects[name]; if (!rc) return;
    const uv = [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]];
    if (o.floor) {
      const zz = o.z, g = (xx, zv) => (o.gy ? o.gy(xx, zv) : H.gy(fr, xx, zv)) + 0.066;
      quadsMesh(fr, M.decal, col, [{ p: [[x - w / 2, g(x - w / 2, zz + h / 2), zz + h / 2], [x + w / 2, g(x + w / 2, zz + h / 2), zz + h / 2], [x + w / 2, g(x + w / 2, zz - h / 2), zz - h / 2], [x - w / 2, g(x - w / 2, zz - h / 2), zz - h / 2]], n: [0, 1, 0], uv }], { shadow: false, noOutline: true });
      return;
    }
    quadsMesh(fr, M.decal, col, [{ p: [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]], n: [0, 0, 1], uv }], { shadow: false, noOutline: true });
  };
  H.meshPanel = (fr, a, b, z, y0, y1, col) => {
    const rc = tex.decal.rects.mesh;
    const n = Math.max(1, Math.round((b - a) / 1.0));
    const quads = [];
    for (let i = 0; i < n; i++) {
      const x0 = a + (b - a) * i / n, x1 = a + (b - a) * (i + 1) / n;
      const g0 = H.gy(fr, x0, z), g1 = H.gy(fr, x1, z);
      quads.push({ p: [[x0, g0 + y0, z], [x1, g1 + y0, z], [x1, g1 + y1, z], [x0, g0 + y1, z]], n: [0, 0, 1], uv: [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]] });
    }
    quadsMesh(fr, M.meshFence, col, quads, { shadow: false, noOutline: true });
  };
  /** a textured quad (atlas material + uv rect [u0,v0,u1,v1]) facing +Z of the frame, centred at (x, y, z) */
  H.card = (fr, mat, rect, x, y, z, w, h, o = {}) => {
    const uv = [[rect[0], rect[1]], [rect[2], rect[1]], [rect[2], rect[3]], [rect[0], rect[3]]];
    const F2 = o.ry ? fr.sub(x, 0, z, o.ry) : fr.sub(x, 0, z, 0);
    quadsMesh(F2, mat, o.color ?? '#ffffff', [{ p: [[-w / 2, y - h / 2, 0], [w / 2, y - h / 2, 0], [w / 2, y + h / 2, 0], [-w / 2, y + h / 2, 0]], n: [0, 0, 1], uv }], { shadow: o.shadow ?? false, noOutline: o.noOutline ?? false });
  };
  return H;
}

/** Ground range under a centred w×d rectangle of frame F (relative to the frame origin y). */
export function groundRange(H, F, w, d) {
  let gmin = 1e9, gmax = -1e9;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0], [0, d / 2], [0, -d / 2]]) { const g = H.gy(F, x, z); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g); }
  return { gmin, gmax };
}

// ------------------------------------------------------------------ spatial hash
export class Grid {
  constructor(cell = 24) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  insertBox(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
      const k = this.key(i, j); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(item);
    }
  }
  query(x, z, r = 0) {
    const c = this.cell, out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
      const a = this.map.get(this.key(i, j)); if (a) for (const it of a) out.add(it);
    }
    return out;
  }
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

/** distance from p to segment a-b (2D) and the param t */
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}

/** Index of lots (footprint polygons) for "is this point inside a building" tests. */
export function makeLotIndex(lots, cell = 24) {
  const g = new Grid(cell);
  for (const l of lots) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of l.poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    g.insertBox(l, x0, z0, x1, z1);
  }
  return {
    grid: g,
    /** lot containing (x, z) grown by pad metres (OBB test), or null */
    at(x, z, pad = 0) {
      for (const l of g.query(x, z, pad + 1)) {
        const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY);
        const dx = x - o.cx, dz = z - o.cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= o.w / 2 + pad && Math.abs(lz) <= o.d / 2 + pad) return l;
      }
      return null;
    },
  };
}

/** Index of road centre-line segments: nearest road + "inside a carriageway" tests. */
export function makeRoadIndex(roads, cell = 20) {
  const g = new Grid(cell);
  for (const r of roads) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i];
    const pad = r.width / 2 + 2;
    g.insertBox({ r, a, b }, Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad);
  }
  return {
    grid: g,
    /** roads whose half-width (+pad) covers (x, z), excluding `except` */
    covering(x, z, pad = 0, except = null) {
      const out = [];
      for (const s of g.query(x, z, 0)) {
        if (s.r === except) continue;
        const { d } = segDist(x, z, s.a[0], s.a[1], s.b[0], s.b[1]);
        if (d <= s.r.width / 2 + pad) out.push(s.r);
      }
      return out;
    },
    nearest(x, z, maxD = 30) {
      let best = null, bd = maxD;
      for (const s of g.query(x, z, maxD)) {
        const { d, t } = segDist(x, z, s.a[0], s.a[1], s.b[0], s.b[1]);
        if (d < bd) { bd = d; best = { road: s.r, d, a: s.a, b: s.b, t }; }
      }
      return best;
    },
  };
}

/** Resample a polyline every `step` metres: [{x, z, tx, tz, s}] (unit tangent, arclength). */
export function resample(pts, step) {
  const out = []; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, tx, tz, s: s + len * k / n });
    s += len;
  }
  if (pts.length > 1) {
    const [ax, az] = pts[pts.length - 2], [bx, bz] = pts[pts.length - 1]; const len = Math.hypot(bx - ax, bz - az) || 1;
    out.push({ x: bx, z: bz, tx: (bx - ax) / len, tz: (bz - az) / len, s });
  }
  // smooth tangents at joints
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i + 1]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1;
    out[i].tx = tx / l; out[i].tz = tz / l;
  }
  return out;
}

export function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

/** Simple vertex-coloured mesh accumulator (world coordinates). */
export class VBuf {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.vc = 0; }
  v(x, y, z, nx, ny, nz, col, u = 0, w = 0) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.u.push(u, w); return this.vc++; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get empty() { return this.vc === 0; }
}
