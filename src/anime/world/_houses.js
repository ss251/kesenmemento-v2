// [v3:foundation] _houses — DEV-ONLY first look (not in main.js MODULES): Sakuragaoka Station's house generator
// (vendored in ./_houses, MIT, Kenton-GMI) placed on the real hero LOTS of Kesennuma, adapted minimally to arbitrary
// footprints (the GSI outline is the house box, frontage from the layout). Mid and near-far lots get instanced anime
// blocks (wall colour + window bands + gable / hip / flat roofs in the sampled roof colour). The town package owns the
// real buildings; this exists to prove the direction (docs/shots/v3_firstlook.png).
//   tools/anime/shot.mjs --only environment,water,_houses --cams hero
import * as THREE from 'three';
import { GB, Frame, slab, poly } from './_houses/gb.js';
import { makeHouseTextures, makeHouseMaterials } from './_houses/tex.js';
import { makeProps, blobRaw } from './_houses/props.js';
import { Laundry } from './_houses/laundry.js';
import { boundarySeg, boundarySegZ, makeSpec, PAL } from './_houses/lot.js';
import { buildHouse } from './_houses/house.js';
import { unitGable, unitHip } from './_houses/far.js';
import { foliageMaterial } from './_houses/foliage.js';
import { buildBlocks } from './_houses/blocks.js';
import { buildLotHouse, buildWarehouse } from './_houses/place.js';
import { buildPoles } from './_houses/poles.js';

export async function build(ctx) {
  const L = ctx.L;
  const tex = makeHouseTextures(ctx);
  const M = makeHouseMaterials(ctx, tex);
  M.foliage = foliageMaterial(ctx); // smooth shrubs / hedges / tree clouds (vertex colours + leaf-clump shading)
  M.meshFence = ctx.mat.decal('#ffffff', { map: tex.decal.texture, vertexColors: true, transparent: true, side: 'double' });
  const root = new THREE.Group(); root.name = 'houses'; ctx.addStatic(root);
  const gb = new GB(ctx);
  const H = { ctx, L, M, tex, A: tex.atlas, gb, slab, poly, blobRaw, lod: 2 };
  H.antennaAz = Math.atan2(-0.62, -0.78) + Math.PI / 2; // Yagi booms point toward the NW transmitter
  H.dishAz = 0.7;  // BS dishes face south-west
  H.P = H.props = makeProps(H);
  H.laundry = new Laundry(H);
  H.bnd = { boundarySeg, boundarySegZ };
  const phys = ctx.physics;

  // ------------------------------------------------------------------ helpers
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
  /** wall along local x (a..b) at z whose top follows the ground (+h); bottom at ground-0.3 or ground+base */
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
  /** terrain-following ground cover rectangle in frame-local coords; world-space UVs (uvS m per repeat) */
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
  /** decal quad (moss / streak / crack / dirt / stain) facing +z of fr, or on the floor */
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
  /** see-through wire mesh panel between a..b at z (alpha) */
  H.meshPanel = (fr, a, b, z, y0, y1, col) => {
    const rc = tex.decal.rects.mesh;
    const n = Math.max(1, Math.round((b - a) / 1.0));
    const quads = [];
    for (let i = 0; i < n; i++) {
      const x0 = a + (b - a) * i / n, x1 = a + (b - a) * (i + 1) / n;
      const g0 = H.gy(fr, x0, z), g1 = H.gy(fr, x1, z);
      const rep = (y1 - y0) / (x1 - x0);
      quads.push({ p: [[x0, g0 + y0, z], [x1, g1 + y0, z], [x1, g1 + y1, z], [x0, g0 + y1, z]], n: [0, 0, 1], uv: [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]] });
    }
    quadsMesh(fr, M.meshFence, col, quads, { shadow: false, noOutline: true });
  };
  /** asphalt / gravel strip along a world polyline (x,z) with half width */
  H.strip = (pts, hw, mat, col, lift = 0.018, uvS = 4) => {
    const P = [], N = [], U = [], I = [];
    // resample every ~2 m
    const rs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let k = 0; k < n; k++) rs.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    rs.push(pts[pts.length - 1]);
    let dist = 0;
    for (let i = 0; i < rs.length; i++) {
      const p = rs[i], q = rs[Math.min(rs.length - 1, i + 1)], o = rs[Math.max(0, i - 1)];
      let tx = q[0] - o[0], tz = q[1] - o[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz, nz = tx;
      if (i > 0) dist += Math.hypot(p[0] - rs[i - 1][0], p[1] - rs[i - 1][1]);
      for (const s of [-1, 1]) {
        const x = p[0] + nx * hw * s, z = p[1] + nz * hw * s;
        P.push(x, L.heightAt(x, z) + lift, z); N.push(0, 1, 0); U.push(x / uvS, -z / uvS);
      }
      if (i > 0) { const k = (i - 1) * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    // fix winding: make sure triangles face up
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2];
      const e1x = P[b * 3] - P[a * 3], e1z = P[b * 3 + 2] - P[a * 3 + 2], e2x = P[c * 3] - P[a * 3], e2z = P[c * 3 + 2] - P[a * 3 + 2];
      if (e1z * e2x - e1x * e2z < 0) { I[i + 1] = c; I[i + 2] = b; }
    }
    gb.mesh(mat, col, P, N, U, I, new THREE.Matrix4(), { shadow: false });
  };
  // geometry accumulates across the whole module and is emitted once per material at the end: a few
  // large meshes (core batching leaves >60 m meshes whole) instead of hundreds of 40 m cells -> far fewer draw calls.
  const flush = () => {};

  // ================================================================== real lots
  const t0 = performance.now();
  const focus = L.HERO.walk;
  const stats = { houses: 0, warehouses: 0, blocks: 0 };
  const heroLots = L.LOTS.filter((l) => l.zone === 'hero');
  const done = new Set();
  for (const lot of heroLots) {
    const dFocus = Math.hypot(lot.obb.cx - focus.x, lot.obb.cz - focus.z);
    const lod = dFocus < 140 ? 2 : dFocus < 320 ? 1 : 0;
    try {
      if (lot.kind === 'warehouse' || lot.kind === 'factory' || lot.kind === 'landmark') { if (buildWarehouse(H, lot, lod)) { stats.warehouses++; done.add(lot.id); } }
      else if (buildLotHouse(H, lot, lod)) { stats.houses++; done.add(lot.id); }
    } catch (e) { console.warn('[_houses] lot', lot.id, e); }
  }
  gb.flush(root, 'houses');
  H.laundry.build();
  stats.heroMs = Math.round(performance.now() - t0);
  const b = buildBlocks(ctx, L.LOTS.filter((l) => !done.has(l.id) && l.zone !== 'hero'), { maxDist: 5200, centre: L.ZONES.hero });
  stats.blocks = b.count;
  stats.poles = buildPoles(ctx, { centre: focus, radius: 520 }).count;
  stats.ms = Math.round(performance.now() - t0);
  if (typeof window !== 'undefined') window.__houses = stats;
  return stats;
}
