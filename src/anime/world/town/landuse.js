// [v4:town-accuracy] Land use on the ground of the core town (V3-SPEC section 10), from OpenStreetMap landuse /
// amenity / leisure polygons (layout LANDUSE, © OpenStreetMap contributors, ODbL), checked against the GSI aerial photo:
//   parking       asphalt with white stall rows (cars: parking.js in the hero zone, instanced kei cars in the mid zone)
//   school        the 校庭: bare rammed earth (the photo's beige yards; they were painted as field and forested)
//   sport         earth pitches with a white boundary line
//   construction  bare earth behind white steel hoarding (仮囲い), e.g. the new city hall site
//   cemetery      pale gravel with rows of granite grave stones (墓石)
//   park / grass  mown lawn;  religious: raked gravel (境内)
// Surfaces are draped on the terrain (earcut, subdivided to <= 6 m edges), lifted a few cm under the streets.
import * as THREE from 'three';
import earcut from 'earcut';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOOK = {
  parking: { col: '#8e9197', lift: 0.05 }, school: { col: '#d4c29c', lift: 0.03 }, sport: { col: '#cdb68c', lift: 0.045 },
  construction: { col: '#c9b690', lift: 0.035 }, cemetery: { col: '#d3cec2', lift: 0.035 }, park: { col: '#9cc07a', lift: 0.03 },
  grass: { col: '#a3c47f', lift: 0.03 }, religious: { col: '#dad4c6', lift: 0.035 },
  gravel: { col: '#b3ada1', lift: 0.03 }, weeds: { col: '#7d8556', lift: 0.03 },   // [v4:polish2] bare gravel lots traced on the aerial photo (world/landuse_aerial.js)
};
const ORDER = ['school', 'park', 'grass', 'weeds', 'gravel', 'religious', 'construction', 'cemetery', 'sport', 'parking'];

/** Triangulate a ring (+ holes) and split every triangle until its longest edge is <= maxE. -> flat [x, z, ...] tris */
export function drapeTriangles(ring, holes = [], maxE = 6) {
  const flat = [], hi = [];
  for (const p of ring) flat.push(p[0], p[1]);
  for (const h of holes) { hi.push(flat.length / 2); for (const p of h) flat.push(p[0], p[1]); }
  const idx = earcut(flat, hi.length ? hi : undefined);
  const out = [];
  const split = (a, b, c, depth) => {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const m = Math.max(ab, bc, ca);
    if (m <= maxE || depth > 10) { out.push(a, b, c); return; }
    if (m === ab) { const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; split(a, p, c, depth + 1); split(p, b, c, depth + 1); }
    else if (m === bc) { const p = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; split(a, b, p, depth + 1); split(a, p, c, depth + 1); }
    else { const p = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]; split(a, b, p, depth + 1); split(p, b, c, depth + 1); }
  };
  for (let k = 0; k < idx.length; k += 3) split([flat[idx[k] * 2], flat[idx[k] * 2 + 1]], [flat[idx[k + 1] * 2], flat[idx[k + 1] * 2 + 1]], [flat[idx[k + 2] * 2], flat[idx[k + 2] * 2 + 1]], 0);
  return out;
}
export function inPoly(x, z, ring, holes = []) {
  const inR = (p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  return inR(ring) && !holes.some(inR);
}
/** The minimum-area-ish frame of a ring: the direction of its longest edge. -> { ux, uz, vx, vz, cx, cz, u0, u1, v0, v1 } */
export function ringFrame(ring) {
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ux = (b[0] - a[0]) / l; uz = (b[1] - a[1]) / l; } }
  const vx = -uz, vz = ux; let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[1]; } cx /= ring.length; cz /= ring.length;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of ring) { const u = (x - cx) * ux + (z - cz) * uz, v = (x - cx) * vx + (z - cz) * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { ux, uz, vx, vz, cx, cz, u0, u1, v0, v1 };
}

/** Land-use polygons of the detail area, in paint order. */
export function landuseIn(L, inside) {
  return (L.LANDUSE || []).filter((l) => LOOK[l.cls] && l.ring?.length > 2 && l.ring.some(([x, z]) => inside(x, z)))
    .sort((a, b) => ORDER.indexOf(a.cls) - ORDER.indexOf(b.cls));
}

export function buildLanduse(ctx, { inside, heroIn, lotIdx, roadIdx, low = false, trees = null }) {
  const L = ctx.L;
  const polys = landuseIn(L, inside);
  const root = new THREE.Group(); root.name = 'town-landuse';
  const S = { p: [], n: [], c: [], i: [] }, F = { p: [], n: [], c: [], i: [] }, WHITE = { r: 0.93, g: 0.93, b: 0.9 };
  const col = new THREE.Color();
  const put = (B, x, y, z, n, c) => { B.p.push(x, y, z); B.n.push(n[0], n[1], n[2]); if (B.c) B.c.push(c.r, c.g, c.b); return B.p.length / 3 - 1; };
  /** a triangle wound to face up (+y) */
  const up = (B, a, b, c) => { const P = B.p, ny = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]); if (ny >= 0) B.i.push(a, b, c); else B.i.push(a, c, b); };
  const stats = {}; const stones = [], cars = [];
  // trees of the environment (planted where the aerial photo shows forest): a wooded cemetery keeps its woods
  const TG = new Map(), tk = (x, z) => Math.floor(x / 8) + ',' + Math.floor(z / 8);
  for (const t of trees || []) { const k = tk(t.x, t.z); let l = TG.get(k); if (!l) TG.set(k, (l = [])); l.push(t); }
  const forestAt = ctx.services.environment?.forestAt || (() => 0);
  const nearTree = (x, z, r) => { if (forestAt(x, z) > 0.45) return true; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of TG.get(tk(x + i * 8, z + j * 8)) || []) if (Math.hypot(t.x - x, t.z - z) < r) return true; return false; };
  polys.forEach((lu, k) => {
    const look = LOOK[lu.cls];
    stats[lu.cls] = (stats[lu.cls] || 0) + 1;
    const lift = look.lift + k * 0.0004;   // later polygons (smaller classes) sit a hair higher
    const tris = drapeTriangles(lu.ring, lu.holes || [], heroIn(lu.ring[0][0], lu.ring[0][1]) ? 5 : 8);
    const r = ctx.rng('lu-' + k + '-' + Math.round(lu.ring[0][0]));
    const base = col.set(look.col);
    for (let t = 0; t < tris.length; t += 3) {
      if (lu.cls === 'cemetery' && nearTree((tris[t][0] + tris[t + 1][0] + tris[t + 2][0]) / 3, (tris[t][1] + tris[t + 1][1] + tris[t + 2][1]) / 3, 4.5)) continue;
      const ids = [];
      for (let q = 0; q < 3; q++) {
        const [x, z] = tris[t + q];
        const n = 0.96 + 0.08 * (Math.sin(x * 0.37 + z * 0.21) * 0.5 + 0.5);   // a painterly tone drift
        ids.push(put(S, x, L.heightAt(x, z) + lift, z, [0, 1, 0], { r: base.r * n, g: base.g * n, b: base.b * n }));
      }
      up(S, ids[0], ids[1], ids[2]);
    }
    const fr = ringFrame(lu.ring);
    const W = (u, v) => [fr.cx + fr.ux * u + fr.vx * v, fr.cz + fr.uz * u + fr.vz * v];
    const line = (a, b, w, lft = lift + 0.02) => {   // a white paint line from a to b
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
      const q = [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]].map(([x, z]) => put(S, x, L.heightAt(x, z) + lft, z, [0, 1, 0], WHITE));
      up(S, q[0], q[1], q[2]); up(S, q[0], q[2], q[3]);   // paint lines ride in the surface mesh (one draw call)
    };
    const ok = (x, z, pad = 0.5) => inPoly(x, z, lu.ring, lu.holes || []) && !lotIdx?.at(x, z, pad) && !(roadIdx?.covering(x, z, 0.3, null) || []).length && L.shoreDist(x, z) < -1;
    if (lu.cls === 'parking' && !heroIn(fr.cx, fr.cz)) {
      // stall rows along the long side: 2.5 m stalls, 5 m deep, 6 m aisles (hero car parks: parking.js)
      for (let v = fr.v0 + 1; v + 5 <= fr.v1 - 0.5; v += 11) {
        for (const [vv, flip] of [[v, 1], [v + 11 - 5, -1]]) {
          if (vv + 5 > fr.v1 - 0.5) continue;
          for (let u = fr.u0 + 1; u + 2.5 <= fr.u1 - 1; u += 2.5) {
            const c = W(u + 1.25, vv + 2.5); if (!ok(...c) || !ok(...W(u, vv)) || !ok(...W(u + 2.5, vv + 5))) continue;
            line(W(u, vv), W(u, vv + 5), 0.12);
            if (!low && r() < 0.45) cars.push({ x: c[0], z: c[1], rot: Math.atan2(fr.vx, fr.vz) * 1 + (flip < 0 ? Math.PI : 0), seed: r() });
          }
        }
      }
    } else if (lu.cls === 'sport') {
      const inset = 1.6, P = [W(fr.u0 + inset, fr.v0 + inset), W(fr.u1 - inset, fr.v0 + inset), W(fr.u1 - inset, fr.v1 - inset), W(fr.u0 + inset, fr.v1 - inset)];
      if (P.every((p) => inPoly(p[0], p[1], lu.ring))) for (let e = 0; e < 4; e++) line(P[e], P[(e + 1) % 4], 0.12);
      const um = (fr.u0 + fr.u1) / 2; if (inPoly(...W(um, fr.v0 + inset), lu.ring)) line(W(um, fr.v0 + inset), W(um, fr.v1 - inset), 0.12);
    } else if (lu.cls === 'construction') {
      // white steel hoarding along the boundary (not across roads or buildings), 2.4 m, one panel seam every 1.8 m
      const R = lu.ring;
      for (let e = 0; e < R.length; e++) {
        const a = R[e], b = R[(e + 1) % R.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.5) continue;
        const n = Math.ceil(l / 1.8);
        for (let q = 0; q < n; q++) {
          const t0 = q / n, t1 = (q + 1) / n, x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          if (lotIdx?.at(mx, mz, 0.2) || (roadIdx?.covering(mx, mz, 0.2, null) || []).length || L.shoreDist(mx, mz) > -0.5) continue;
          const y0 = L.heightAt(x0, z0) - 0.2, y1 = L.heightAt(x1, z1) - 0.2, nn = [-(z1 - z0) / (l / n), 0, (x1 - x0) / (l / n)];
          const cw = col.set(q % 2 ? '#e9e9e4' : '#e1e2de'), cb = { r: 0.36, g: 0.5, b: 0.66 };
          const v = [put(F, x0, y0, z0, nn, cb), put(F, x1, y1, z1, nn, cb), put(F, x1, y1 + 0.45, z1, nn, cb), put(F, x0, y0 + 0.45, z0, nn, cb),
            put(F, x0, y0 + 0.45, z0, nn, cw), put(F, x1, y1 + 0.45, z1, nn, cw), put(F, x1, y1 + 2.6, z1, nn, cw), put(F, x0, y0 + 2.6, z0, nn, cw)];
          F.i.push(v[0], v[1], v[2], v[0], v[2], v[3], v[4], v[5], v[6], v[4], v[6], v[7]);
        }
      }
    } else if (lu.cls === 'cemetery') {
      // rows of grave stones (1 m plots, 1.9 m row pitch), each on its own little kerbed plot
      for (let v = fr.v0 + 1.2; v <= fr.v1 - 1.2; v += 2.2) for (let u = fr.u0 + 1.0; u <= fr.u1 - 1.0; u += 1.5) {
        const p = W(u, v); if (!inPoly(p[0], p[1], lu.ring, lu.holes || []) || nearTree(p[0], p[1], 4) || lotIdx?.at(p[0], p[1], 0.2)) continue;   // (cheap tests first)
        if (r() < (heroIn(p[0], p[1]) ? 0.15 : 0.45)) continue;   // thinner away from the hero zone (triangle budget)
        stones.push({ x: p[0], z: p[1], y: L.heightAt(p[0], p[1]), rot: Math.atan2(fr.vx, fr.vz), h: 0.85 + r() * 0.5, s: 0.9 + r() * 0.25, tone: r() });
      }
    }
  });
  const mk = (B, mat, name, o = {}) => {
    if (!B.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    if (B.c) g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; m.castShadow = !!o.cast; root.add(m); return m;
  };
  const surfMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, polygonOffset: -0.6 });
  mk(S, surfMat, 'landuse-surfaces');
  mk(F, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03, side: 'double' }), 'construction-hoarding', { cast: true });
  ctx.addStatic(root);
  // instanced: grave stones and parked cars (mid-zone car parks)
  const dyn = new THREE.Group(); dyn.name = 'town-landuse-inst';
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  if (stones.length) {
    // one box per stone (10 triangles: no bottom face), the plot kerb is the draped gravel
    const geo = new THREE.BoxGeometry(0.42, 1, 0.3).translate(0, 0.5, 0); geo.deleteAttribute('uv');
    { const I = geo.index.array, keep = []; const Pp = geo.attributes.position; for (let i = 0; i < I.length; i += 3) if (Pp.getY(I[i]) + Pp.getY(I[i + 1]) + Pp.getY(I[i + 2]) > 0.01) keep.push(I[i], I[i + 1], I[i + 2]); geo.setIndex(keep); }
    const im = new THREE.InstancedMesh(geo, ctx.mat.toon('#ffffff', { paint: 0.03 }), stones.length);
    stones.forEach((s, i) => { Q.setFromAxisAngle(Y, s.rot); P.set(s.x, s.y + 0.1, s.z); SC.set(s.s, s.h, s.s); im.setMatrixAt(i, M4.compose(P, Q, SC)); im.setColorAt(i, col.set(s.tone < 0.6 ? '#8f959a' : s.tone < 0.85 ? '#6f7479' : '#b3b3ad')); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    dyn.add(im);
  }
  if (cars.length) {
    const geo = mergeGeometries([new THREE.BoxGeometry(1.46, 0.62, 3.3).translate(0, 0.55, 0), new THREE.BoxGeometry(1.3, 0.5, 1.9).translate(0, 1.1, -0.25)].map((g) => { g.deleteAttribute('uv'); return g; }));
    const CC = ['#e8e8e3', '#c3c7cc', '#e8e8e3', '#44507a', '#9fd4c2', '#efe3c4', '#94434d', '#4a4753', '#a9c5e2'];
    const im = new THREE.InstancedMesh(geo, ctx.mat.toon('#ffffff', { paint: 0.02 }), cars.length);
    cars.forEach((c, i) => { Q.setFromAxisAngle(Y, c.rot); P.set(c.x, L.heightAt(c.x, c.z) + 0.05, c.z); SC.set(1, 1, 1); im.setMatrixAt(i, M4.compose(P, Q, SC)); im.setColorAt(i, col.set(CC[Math.floor(c.seed * CC.length) % CC.length])); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    dyn.add(im);
  }
  if (dyn.children.length) ctx.add(dyn);
  return { polygons: polys.length, byClass: stats, stones: stones.length, cars: cars.length, tris: S.i.length / 3 };
}

/** Parking polygons of the layout, for parking.js (its car parks stand only where OSM maps one). */
export function parkingIndex(L) {
  const P = (L.LANDUSE || []).filter((l) => l.cls === 'parking').map((l) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of l.ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return { l, x0, z0, x1, z1 }; });
  return (x, z) => P.some((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && inPoly(x, z, p.l.ring, p.l.holes || []));
}
