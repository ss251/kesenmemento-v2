// [v3:town] Parking lots (月極駐車場 / 時間貸し) on the empty flat land beside the hero streets: the open ground of the
// inner-bay district reads as parking in the aerial photos. Each lot: an asphalt pad aligned to the nearest road,
// white stall lines, concrete wheel stops, a "P" sign on a post, and kei cars / kei vans parked in about half the stalls.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder } from './sakura/street_mesh.js';
import { makeKeiCar, makeKeiVan } from './sakura/vehicles_cars.js';
import { JP_CAR_COLS } from './carcolors.js';
import { pavedIndex } from './landuse.js';

const UP = [0, 1, 0];

/** Susuki clump (unit ~1 m): 14 arching blades (green to straw) and 5 stalks with pale silver-pink plumes. */
function susukiGeometry() {
  const P = [], C = [], I = [];
  const push = (x, y, z, c) => { P.push(x, y, z); C.push(c.r, c.g, c.b); return P.length / 3 - 1; };
  const g0 = new THREE.Color('#5f7f4a'), g1 = new THREE.Color('#b8b26a'), pl = new THREE.Color('#efe6d6'), st = new THREE.Color('#8f8a5a');
  for (let k = 0; k < 14; k++) {
    const a = k * 2.39996, lean = 0.25 + (k % 3) * 0.12, h = 0.7 + (k % 4) * 0.1, w = 0.035;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const b0 = push(px, 0, pz, g0), b1 = push(-px, 0, -pz, g0);
    const m0 = push(dx * lean * 0.5 + px * 0.7, h * 0.6, dz * lean * 0.5 + pz * 0.7, g0.clone().lerp(g1, 0.5)), m1 = push(dx * lean * 0.5 - px * 0.7, h * 0.6, dz * lean * 0.5 - pz * 0.7, g0.clone().lerp(g1, 0.5));
    const tp = push(dx * lean * 1.4, h * 0.85, dz * lean * 1.4, g1);
    I.push(b0, b1, m1, b0, m1, m0, m0, m1, tp);
  }
  for (let k = 0; k < 5; k++) {
    const a = k * 1.25 + 0.4, lean = 0.12 + k * 0.03, h = 1.25 + (k % 2) * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), w = 0.012;
    const s0 = push(-dz * w, 0, dx * w, st), s1 = push(dz * w, 0, -dx * w, st);
    const s2 = push(dx * lean - dz * w, h - 0.3, dz * lean + dx * w, st), s3 = push(dx * lean + dz * w, h - 0.3, dz * lean - dx * w, st);
    I.push(s0, s1, s3, s0, s3, s2);
    // plume: a feathery lozenge drooping outward
    const q0 = push(dx * lean, h - 0.32, dz * lean, pl), q1 = push(dx * (lean + 0.1) - dz * 0.035, h - 0.08, dz * (lean + 0.1) + dx * 0.035, pl);
    const q2 = push(dx * (lean + 0.2), h + 0.02, dz * (lean + 0.2), pl), q3 = push(dx * (lean + 0.1) + dz * 0.035, h - 0.08, dz * (lean + 0.1) - dx * 0.035, pl);
    I.push(q0, q1, q2, q0, q2, q3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  g.computeVertexNormals();
  // soften: blades are lit mostly from above
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { n.setY(i, Math.abs(n.getY(i)) * 0.5 + 0.6); } n.needsUpdate = true;
  return g;
}

/** Low-poly parked car (kei proportions, forward +z): body, cabin with dark glass band, tyres. Vertex colours:
 *  white body (tinted by the instance colour), dark glass and tyres (stay dark under any tint). */
function simpleCar() {
  const parts = [];
  const box = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.toNonIndexed()); };
  box(1.46, 0.62, 3.3, 0, 0.55, 0, '#ffffff');
  box(1.3, 0.5, 1.9, 0, 1.1, -0.25, '#3c4150');
  box(1.34, 0.08, 1.95, 0, 1.39, -0.25, '#ffffff');
  for (const [x, z] of [[-0.68, 1.05], [0.68, 1.05], [-0.68, -1.05], [0.68, -1.05]]) box(0.2, 0.46, 0.46, x, 0.23, z, '#3a3640');
  const g = mergeGeometries(parts); g.computeVertexNormals();
  return g;
}
// [v5:fix2] the Japanese car-colour mix (town/carcolors.js): 14 variants, the car body colour of variant v is every other
// entry of JP_CAR_COLS (5 white / pearl, 2 black, 1 silver, 1 grey, 1 dark blue in 10); it was a rainbow with mint and baby blue
const CAR_COLS = Array.from({ length: 10 }, (_, i) => JP_CAR_COLS[i * 2]);

export function buildParking(ctx, H, { lotIdx, roadIdx, heroZone, asphaltTex, lineTex, signs, SM, foci = [], maxDetailCars = 36, inParking = null }) {
  const L = ctx.L;
  const C = 5;   // candidate grid (m)
  const S = L.SPOTS || {};
  const avoid = [S.isuzuShrine, S.isuzuTorii, S.ukimido, S.anbaLookout, S.pier7].filter(Boolean).map((p) => [p.x ?? p[0], p.z ?? p[1]]);
  const ok = (x, z) => {
    // [v4:town-accuracy] car parks only where OpenStreetMap maps one (the heuristic filled vacant land with cars)
    if (inParking && !inParking(x, z)) return false;
    if (L.shoreDist(x, z) > -7) return false;
    if (lotIdx.at(x, z, 1.8)) return false;
    if (roadIdx.covering(x, z, 1.2, null).length) return false;
    const y = L.heightAt(x, z);
    if (y > 16) return false;
    if (Math.abs(L.heightAt(x + 3, z) - L.heightAt(x - 3, z)) + Math.abs(L.heightAt(x, z + 3) - L.heightAt(x, z - 3)) > 0.9) return false;
    for (const [ax, az] of avoid) if (Math.hypot(ax - x, az - z) < 45) return false;
    return true;
  };
  const tp = performance.now(); const tm = {};
  const x0 = heroZone.cx - heroZone.r, z0 = heroZone.cz - heroZone.r, n = Math.ceil(heroZone.r * 2 / C);
  const grid = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * C, z = z0 + (j + 0.5) * C;
    if (Math.hypot(x - heroZone.cx, z - heroZone.cz) > heroZone.r) continue;
    const nr = roadIdx.nearest(x, z, 45);
    if (!nr) continue;
    if (ok(x, z)) grid[j * n + i] = 1;
  }
  tm.grid = Math.round(performance.now() - tp);
  // connected components
  const comp = new Int32Array(n * n).fill(-1), comps = [];
  for (let k = 0; k < n * n; k++) {
    if (!grid[k] || comp[k] >= 0) continue;
    const cells = [], st = [k]; comp[k] = comps.length;
    while (st.length) { const c = st.pop(); cells.push(c); const i = c % n, j = (c / n) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue; const q = b * n + a; if (grid[q] && comp[q] < 0) { comp[q] = comps.length; st.push(q); } } }
    comps.push(cells);
  }
  const padB = new MeshBuilder(true), lineB = new MeshBuilder(true);
  const root = new THREE.Group(); root.name = 'town-parking';
  const simple = [];
  const carCache = new Map(); let carMs = 0, cloneMs = 0, bandMs = 0;
  const stats = { lots: 0, stalls: 0, cars: 0 };
  const WHITE = [0.94, 0.94, 0.9];
  // fine 1.25 m lookup of ok(), memoised
  const FC = 1.25, fn = Math.ceil(n * C / FC), fine = new Int8Array(fn * fn).fill(-1);
  const okFine = (x, z) => { const i = Math.floor((x - x0) / FC), j = Math.floor((z - z0) / FC); if (i < 0 || j < 0 || i >= fn || j >= fn) return false; const k = j * fn + i; if (fine[k] < 0) fine[k] = ok(x0 + (i + 0.5) * FC, z0 + (j + 0.5) * FC) ? 1 : 0; return fine[k] === 1; };
  const inComp = (x, z, id) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); return i >= 0 && j >= 0 && i < n && j < n && comp[j * n + i] === id && okFine(x, z); };
  const usedComp = new Set(), covered = new Set();
  const order = comps.map((cells, id) => ({ cells, id })).filter((c) => c.cells.length >= 8);
  order.sort((a, b) => b.cells.length - a.cells.length);
  order.forEach(({ cells, id }) => {
    if (stats.lots >= 26) return;
    // centroid + alignment to the nearest road
    let cx = 0, cz = 0; for (const c of cells) { cx += x0 + (c % n + 0.5) * C; cz += z0 + (((c / n) | 0) + 0.5) * C; }
    cx /= cells.length; cz /= cells.length;
    const nr = roadIdx.nearest(cx, cz, 60); if (!nr) return;
    let ux = nr.b[0] - nr.a[0], uz = nr.b[1] - nr.a[1]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = -uz, vz = ux;
    // extent in (u, v)
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const c of cells) { const x = x0 + (c % n + 0.5) * C - cx, z = z0 + (((c / n) | 0) + 0.5) * C - cz; const u = x * ux + z * uz, v = x * vx + z * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    u0 -= C / 2; u1 += C / 2; v0 -= C / 2; v1 += C / 2;
    const W = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
    const r = ctx.rng('park-' + id);
    const y = (x, z) => L.heightAt(x, z) + 0.045;
    // rows: stall depth 5, aisle 6: [row][aisle][row] bands along v
    const bands = []; for (let v = v0 + 0.5; v + 5 <= v1; ) { bands.push({ v, flip: false }); v += 5; if (v + 11 <= v1) { bands.push({ v: v + 6, flip: true, aisle: v }); v += 11; } else break; }
    let lotStalls = 0, signAt = null; const carSpots = []; const tb = performance.now();
    for (const b of bands) {
      for (let u = u0 + 0.5; u + 2.5 <= u1 && lotStalls < 120; u += 2.5) {
        const corners = [[u, b.v], [u + 2.5, b.v], [u + 2.5, b.v + 5], [u, b.v + 5], [u + 1.25, b.v + 2.5]];
        if (!corners.every(([a, c]) => inComp(...W(a, c), id))) continue;
        // pad
        const P = [[u, b.v], [u + 2.5, b.v], [u + 2.5, b.v + 5], [u, b.v + 5]].map(([a, c]) => { const p = W(a, c); return padB.vert(p[0], y(p[0], p[1]), p[1], p[0] / 4, -p[1] / 4, UP, [0.72, 0.72, 0.76]); });
        padB.quad(P[0], P[1], P[2], P[3]);
        // stall lines (left edge + back)
        const line = (a0, c0, a1, c1, w) => {
          const p0 = W(a0, c0), p1 = W(a1, c1); const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz) || 1; const nx = -dz / l * w / 2, nz = dx / l * w / 2;
          const Q = [[p0[0] + nx, p0[1] + nz], [p1[0] + nx, p1[1] + nz], [p1[0] - nx, p1[1] - nz], [p0[0] - nx, p0[1] - nz]].map((p, k) => lineB.vert(p[0], y(p[0], p[1]) + 0.015, p[1], k % 3 ? l / 0.8 : 0, k < 2 ? 0.1 : 0, UP, WHITE));
          lineB.quad(Q[0], Q[1], Q[2], Q[3]);
        };
        const back = b.flip ? b.v + 5 : b.v;
        line(u, b.v + 0.3, u, b.v + 4.7, 0.12); line(u + 2.5, b.v + 0.3, u + 2.5, b.v + 4.7, 0.12);
        line(u, back, u + 2.5, back, 0.12);
        // wheel stop
        const ws = W(u + 1.25, back + (b.flip ? -0.7 : 0.7)), rot = Math.atan2(ux, uz);
        H.Frame.at(H.gb, ws[0], L.heightAt(ws[0], ws[1]), ws[1], rot).boxB(H.M.concrete, '#c9c7c0', 0.14, 0.12, 0.7, 0, 0, 0, { rz: 0 });
        lotStalls++;
        for (const [a, c2] of [[u, b.v], [u + 2.5, b.v], [u + 2.5, b.v + 5], [u, b.v + 5], [u + 1.25, b.v + 2.5], [u + 1.25, b.v - 3], [u + 1.25, b.v + 8]]) { const p = W(a, c2); covered.add(Math.floor((p[1] - z0) / C) * n + Math.floor((p[0] - x0) / C)); }
        if (!signAt) { const sp = W(u + 0.3, b.flip ? b.v + 4.7 : b.v + 0.3); if (!lotIdx.at(sp[0], sp[1], 0.6)) signAt = sp; }
        // [v5:fix2] 30 % of the stalls (was 36 %): Google Earth 2026-03-11 shows the core's car parks a third full or less
        if (r() < 0.3) carSpots.push({ p: W(u + 1.25, b.v + 2.5), rot: Math.atan2(vx, vz) + (b.flip ? 0 : Math.PI) + (r() < 0.3 ? Math.PI : 0) + (r() - 0.5) * 0.06 });
      }
      if (b.aisle !== undefined) {
        // aisle pad
        const P = [[u0 + 0.5, b.aisle], [u1 - 0.5, b.aisle], [u1 - 0.5, b.aisle + 6], [u0 + 0.5, b.aisle + 6]].map(([a, c]) => W(a, c));
        if (P.every((p) => inComp(p[0], p[1], id))) { const Q = P.map((p) => padB.vert(p[0], y(p[0], p[1]) - 0.004, p[1], p[0] / 4, -p[1] / 4, UP, [0.7, 0.7, 0.74])); padB.quad(Q[0], Q[1], Q[2], Q[3]); }
      }
    }
    bandMs += performance.now() - tb;
    if (lotStalls < 4) return;
    usedComp.add(id);
    stats.lots++; stats.stalls += lotStalls;
    for (const c of carSpots) {
      const v = Math.floor(r() * 14);
      const nearFocus = foci.some(([fx, fz]) => Math.hypot(fx - c.p[0], fz - c.p[1]) < 110);
      if (!nearFocus || stats.cars >= maxDetailCars) { simple.push({ x: c.p[0], z: c.p[1], rot: c.rot, col: CAR_COLS[v % CAR_COLS.length], van: v < 4 }); continue; }
      const key = 'car' + v;
      const tc = performance.now();
      if (!carCache.has(key)) { const tpl = v < 4 ? makeKeiVan(ctx) : makeKeiCar(ctx, { color: CAR_COLS[v % CAR_COLS.length] }); tpl.traverse((o) => { o.userData = {}; }); carCache.set(key, tpl); }
      carMs += performance.now() - tc;
      const tq = performance.now();
      const car = carCache.get(key).clone();
      const gy = L.heightAt(c.p[0], c.p[1]);
      car.position.set(c.p[0], gy + 0.045, c.p[1]); car.rotation.y = c.rot;
      root.add(car); stats.cars++;
      ctx.physics.addBox(c.p[0], c.p[1], 1.5, 3.4, c.rot, gy, gy + 1.6);
      cloneMs += performance.now() - tq;
    }
    // P sign at the corner nearest the road
    const cp = signAt;
    if (!cp) return;
    const F = H.Frame.at(H.gb, cp[0], L.heightAt(cp[0], cp[1]), cp[1], Math.atan2(-vx, -vz));
    F.cyl(H.M.plain, '#aeb4ba', 0.04, 2.6, 0, 1.3, 0, { seg: 8 });
    H.card(F, SM.tops, signs.topOf('parking').rect, 0, 2.35, 0.05, 0.9, 0.9, { shadow: true });
    H.card(F.sub(0, 0, 0, Math.PI), SM.tops, signs.topOf('parking').rect, 0, 2.35, 0.05, 0.9, 0.9, { shadow: true });
  });
  tm.lots = Math.round(performance.now() - tp);
  // ---- the rest of the open land: grassy vacant lots (空き地) with weed tufts and the odd 売地 sign
  const grassB = new MeshBuilder(true); const tufts = [];
  let vacant = 0;
  // [v5:fix3] no vacant-lot grass inside a car park or any paved / bare landuse ring: the stall-less cells of a used car
  // park drew lime-green triangles through the asphalt (town-vacant's polygonOffset -1 beat landuse's -0.6; PIER7 south
  // lot, 南町, the market). Google Earth 2026-03-11 and the GSI photo show plain asphalt there.
  const inPaved = pavedIndex(L);
  comps.forEach((cells0, id) => {
    let cells = cells0;
    if (cells.length < 3) return;
    if (usedComp.has(id)) return;
    cells = cells.filter((c) => !inPaved(x0 + (c % n + 0.5) * C, z0 + (((c / n) | 0) + 0.5) * C));
    if (cells.length < 2) return;
    const r = ctx.rng('vacant-' + id);
    vacant++;
    // continuous grass: shared corner vertices, mottled colour from a smooth hash (no per-cell tiling)
    const vid = new Map();
    const base = [0.47, 0.63, 0.35], alt = [0.6, 0.66, 0.4];
    const vtx = (i, j) => {
      const k = j * (n + 1) + i; let v = vid.get(k);
      if (v === undefined) {
        const x = x0 + i * C, z = z0 + j * C;
        const t = 0.5 + 0.5 * Math.sin(x * 0.11 + z * 0.07 + id) * Math.cos(z * 0.09 - x * 0.05);
        const c = [base[0] + (alt[0] - base[0]) * t, base[1] + (alt[1] - base[1]) * t, base[2] + (alt[2] - base[2]) * t];
        v = grassB.vert(x, L.heightAt(x, z) + 0.05, z, x / 3, z / 3, UP, c); vid.set(k, v);
      }
      return v;
    };
    for (const c of cells) {
      const i = c % n, j = (c / n) | 0;
      if (!okFine(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C)) continue;
      grassB.quad(vtx(i, j), vtx(i + 1, j), vtx(i + 1, j + 1), vtx(i, j + 1));
      for (let q = 0; q < 2; q++) if (r() < 0.3) tufts.push({ x: x0 + (i + r()) * C, z: z0 + (j + r()) * C, s: 0.35 + r() * 0.55 });
    }
    if (cells.length >= 12 && r() < 0.35) {
      // 売地 sign facing the nearest road
      const c = cells[Math.floor(cells.length / 2)], x = x0 + (c % n + 0.5) * C, z = z0 + (((c / n) | 0) + 0.5) * C;
      const nr = roadIdx.nearest(x, z, 60);
      if (nr) { const F = H.Frame.at(H.gb, x, L.heightAt(x, z), z, Math.atan2(nr.a[0] - x, nr.a[1] - z)); F.cyl(H.M.plain, '#9aa1a8', 0.04, 1.6, -0.5, 0.8, 0, { seg: 6 }); F.cyl(H.M.plain, '#9aa1a8', 0.04, 1.6, 0.5, 0.8, 0, { seg: 6 }); H.card(F, SM.tops, signs.topOf('forSale').rect, 0, 1.3, 0.05, 1.2, 0.8, { shadow: true }); H.card(F.sub(0, 0, 0, Math.PI), SM.tops, signs.topOf('forSale').rect, 0, 1.3, 0.05, 1.2, 0.8, { shadow: true }); }
    }
  });
  // [v5:fix3] a weaker offset than the landuse surfaces (-0.6): where the two still meet, the paved surface wins
  if (!grassB.empty) { const m = grassB.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.12, polygonOffset: -0.3 }), { name: 'town-vacant' }); root.add(m); }
  if (tufts.length) {
    // susuki (pampas grass) clumps: thin blades + silver plumes, the autumn accent of every vacant lot
    const im = new THREE.InstancedMesh(susukiGeometry(), ctx.mat.toon('#ffffff', { vertexColors: true, side: 'double', paint: 0.04 }), tufts.length);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    tufts.forEach((t, i) => { P.set(t.x, L.heightAt(t.x, t.z), t.z); Q.setFromAxisAngle(Y, (i * 2.39996) % 6.28); Sc.set(t.s * 1.3, t.s * 1.5, t.s * 1.3); im.setMatrixAt(i, M4.compose(P, Q, Sc)); im.setColorAt(i, col.set(i % 4 === 0 ? '#f2ead0' : '#ffffff')); });
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    ctx.noOutline(im);
    ctx.add(im);
  }
  stats.vacant = vacant; stats.tufts = tufts.length;
  // simple instanced cars for the lots away from the street hearts (read as parked cars from the drone)
  if (simple.length) {
    const im = new THREE.InstancedMesh(simpleCar(), ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03 }), simple.length);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    simple.forEach((c, i) => { P.set(c.x, L.heightAt(c.x, c.z) + 0.04, c.z); Q.setFromAxisAngle(Y, c.rot); Sc.set(1, c.van ? 1.12 : 1, 1); im.setMatrixAt(i, M4.compose(P, Q, Sc)); im.setColorAt(i, col.set(c.col)); });
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    ctx.add(im);
  }
  stats.simpleCars = simple.length;
  if (!padB.empty) { const m = padB.mesh(ctx.mat.toon('#ffffff', { map: asphaltTex, vertexColors: true, paint: 0.032, polygonOffset: -1 }), { name: 'town-parking-pads' }); root.add(m); }   // [v4:town-accuracy] own material (paint 0.032): the batcher keeps car parks apart from the roads (accuracy audit)
  if (!lineB.empty) { const m = lineB.mesh(ctx.mat.decal('#ffffff', { map: lineTex, vertexColors: true }), { name: 'town-parking-lines', renderOrder: -2 }); ctx.noOutline(m); root.add(m); }
  ctx.addStatic(root);
  stats.tm = tm; stats.tm.carMs = Math.round(carMs); stats.tm.cloneMs = Math.round(cloneMs); stats.tm.bandMs = Math.round(bandMs);
  return stats;
}
