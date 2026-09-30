// [v3:polish3] environment/scatter.js — hand-placed ground dressing where a walk spot looks over bare terrain.
// The 安波山 lookout looked down on a bare grass carpet, and the かなえ大橋 / 大島 spots stood on flat, empty ground
// polygons (the coarse 70 m city grid). Here: cedar and broadleaf trees on the slope below the lookout rail, and grass
// tufts, shore rocks, shrubs and a few trees at the sides of the two bridge spots (the view to the bridge stays open).
// Everything sits on the RENDERED terrain surface (terrain.js surfaceAt), avoids water, lots and roads, and is seeded
// (ctx.rng) so every build is identical. Five InstancedMeshes in all (cedar, broadleaf, autumn, tufts, rocks).
import * as THREE from 'three';
import * as L from '../layout.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cedarGeometry, broadGeometry, TREE_TINTS, treeMaterial } from './trees.js';
import { FRAMES } from '../life/tour.js';

const DEG = Math.PI / 180;
/** View direction of a walk pose (tour.js yaw convention: yaw = atan2(-dx, -dz)). */
const dirOf = (yawDeg) => [-Math.sin(yawDeg * DEG), -Math.cos(yawDeg * DEG)];

/** The dressing per walk spot. cone: [min, max] |angle| from the view direction (deg); r: [min, max] metres. */
export function scatterPlan() {
  const A = FRAMES.anba.walk, K = FRAMES.kanae.walk, O = FRAMES.oshima.walk;
  const bridgeSpot = (w, seed) => ({
    id: seed, x: w.x, z: w.z, yaw: w.yaw,
    groups: [
      { kind: 'tuft', n: 80, r: [2.5, 18], cone: [0, 62], minY: 0.2 },
      { kind: 'rock', n: 16, r: [3, 22], cone: [0, 66], minY: -0.3 },
      { kind: 'shrub', n: 12, r: [5, 26], cone: [16, 58], minY: 0.4 },   // (the frame is +-42 deg across: the centre stays open to the bridge)
      { kind: 'tree', n: 10, r: [16, 55], cone: [26, 70], minY: 0.8 },
    ],
  });
  return [
    { id: 'anba', x: A.x, z: A.z, yaw: A.yaw, below: 2.5,   // only on the slope below the rail
      groups: [
        // the lookout looks 10 deg down a steep slope: the frame's lower edge meets the ground ~45 m out
        { kind: 'tree', n: 70, r: [40, 175], cone: [0, 48], minY: 1 },
        { kind: 'tree', n: 8, r: [18, 40], cone: [30, 60], minY: 1 },
        { kind: 'shrub', n: 18, r: [28, 90], cone: [0, 50], minY: 1 },
      ] },
    bridgeSpot(K, 'kanae'),
    bridgeSpot(O, 'oshima'),
  ];
}

function tuftGeometry() {
  // six thin leaning blades round a centre, darker at the root, sunlit at the tips (unit height)
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + (i % 2) * 0.4, lean = 0.28 + 0.12 * (i % 3);
    const b = new THREE.ConeGeometry(0.05, 1 - 0.12 * (i % 3), 3, 1).translate(0, 0.5, 0);
    b.rotateZ(lean); b.rotateY(a); b.translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    b.deleteAttribute('uv');
    const p = b.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color(), lo = new THREE.Color('#4f7a3f'), hi = new THREE.Color('#b6cf7c');
    for (let k = 0; k < p.count; k++) { col.copy(lo).lerp(hi, Math.min(1, Math.max(0, p.getY(k)))); c[k * 3] = col.r; c[k * 3 + 1] = col.g; c[k * 3 + 2] = col.b; }
    b.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(b.toNonIndexed());
  }
  const g = mergeGeometries(parts); g.computeVertexNormals();
  return g;
}
function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0); g.deleteAttribute('uv');
  g.scale(1, 0.62, 0.85); g.translate(0, 0.18, 0);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color(), lo = new THREE.Color('#77757a'), hi = new THREE.Color('#b9b4ad');
  for (let k = 0; k < p.count; k++) { col.copy(lo).lerp(hi, Math.min(1, Math.max(0, p.getY(k) / 0.45 + 0.3))); c[k * 3] = col.r; c[k * 3 + 1] = col.g; c[k * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

/** Points near roads / buildings / water are skipped. Returns a predicate for one spot's neighbourhood. */
function freeTest(sx, sz, R) {
  const roads = [], lots = [];
  for (const r of L.ROADS) { const pts = r.pts || []; if (pts.some(([x, z]) => Math.abs(x - sx) < R + 60 && Math.abs(z - sz) < R + 60)) roads.push(r); }
  for (const l of L.LOTS) { const o = l.obb; if (o && Math.abs(o.cx - sx) < R + 40 && Math.abs(o.cz - sz) < R + 40) lots.push(o); }
  const segD = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); };
  return (x, z, pad) => {
    if (L.isWater(x, z) && pad > 0.5) return false;
    for (const o of lots) {
      const c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = x - o.cx, dz = z - o.cz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < o.w / 2 + pad && Math.abs(lz) < o.d / 2 + pad) return false;
    }
    for (const r of roads) { const P = r.pts; for (let i = 0; i + 1 < P.length; i++) if (segD(x, z, P[i], P[i + 1]) < (r.width || 4) / 2 + pad) return false; }
    return true;
  };
}

/** Build the dressing. surfaceAt(x, z): the rendered terrain height (terrain.js). Returns { meshes, counts, list }. */
export function buildScatter(ctx, surfaceAt, plan = scatterPlan()) {
  const buckets = { cedar: [], broad: [], autumn: [], tuft: [], rock: [] };
  const list = [];
  for (const spot of plan) {
    const rng = ctx.rng('scatter-' + spot.id);
    const [fx, fz] = dirOf(spot.yaw);
    const Rmax = Math.max(...spot.groups.map((g) => g.r[1]));
    const free = freeTest(spot.x, spot.z, Rmax);
    const eyeGround = surfaceAt(spot.x, spot.z);
    const taken = [];
    for (const gdef of spot.groups) {
      let placed = 0;
      for (let tries = 0; placed < gdef.n && tries < gdef.n * 40; tries++) {
        const side = rng() < 0.5 ? -1 : 1;
        const ang = side * (gdef.cone[0] + (gdef.cone[1] - gdef.cone[0]) * rng()) * DEG;
        // uniform over the ring's area (more far than near), a little bias to the near edge for the small dressing
        const u = rng(), rr = Math.sqrt(gdef.r[0] ** 2 + u * (gdef.r[1] ** 2 - gdef.r[0] ** 2));
        const c = Math.cos(ang), s = Math.sin(ang);
        const x = spot.x + (fx * c - fz * s) * rr, z = spot.z + (fx * s + fz * c) * rr;
        const y = surfaceAt(x, z);
        if (y < (gdef.minY ?? 0.2)) continue;
        if (spot.below != null && y > eyeGround - spot.below) continue;
        const big = gdef.kind === 'tree', pad = big ? 2.2 : gdef.kind === 'shrub' ? 1.2 : 0.6;
        if (!free(x, z, pad)) continue;
        const sep = big ? 4.2 : gdef.kind === 'shrub' ? 2.2 : 0.7;
        if (taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < Math.max(sep, t[2]))) continue;
        taken.push([x, z, sep]);
        const tint = Math.floor(rng() * 255);
        if (gdef.kind === 'tree') {
          const k = rng(), t = k < 0.52 ? 0 : k < 0.9 ? 1 : 2;
          const h = t === 0 ? 8.5 + rng() * 6 : 6 + rng() * 4.5, rad = t === 0 ? 2.1 + rng() * 1.1 : 2.8 + rng() * 1.8;
          buckets[['cedar', 'broad', 'autumn'][t]].push({ x, y, z, h, rad, tint, t }); list.push({ x, z, y, h, r: rad, type: ['cedar', 'broadleaf', 'autumn'][t], scatter: spot.id });
        } else if (gdef.kind === 'shrub') {
          const t = rng() < 0.85 ? 1 : 2, h = 1.4 + rng() * 1.6, rad = 1.0 + rng() * 0.8;
          buckets[t === 1 ? 'broad' : 'autumn'].push({ x, y, z, h, rad, tint, t });
        } else if (gdef.kind === 'tuft') {
          const n = 1 + Math.floor(rng() * 3);   // small clumps of 1-3 tufts
          for (let i = 0; i < n; i++) { const ox = (rng() - 0.5) * 0.9, oz = (rng() - 0.5) * 0.9; buckets.tuft.push({ x: x + ox, y: surfaceAt(x + ox, z + oz), z: z + oz, h: 0.35 + rng() * 0.4, rad: 0.5 + rng() * 0.5, tint, rot: rng() * Math.PI * 2 }); }
        } else {
          buckets.rock.push({ x, y, z, h: 0.35 + rng() * 0.9, rad: 0, tint, rot: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.4 });
        }
        placed++;
      }
    }
  }
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const g = new THREE.Group(); g.name = 'env-scatter';
  const meshes = [];
  const make = (geo, mat, items, place, tint, name) => {
    if (!items.length) return;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { place(it); m.setMatrixAt(i, M4.compose(P, Q, S)); m.setColorAt(i, tint(it)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); m.name = name;
    g.add(m); meshes.push(m);
  };
  const treePlace = (it) => { const w = it.t === 0 ? it.rad / 0.22 : it.rad / 0.5; Q.setFromAxisAngle(Y, (it.tint / 255) * Math.PI * 2); P.set(it.x, it.y - 0.35, it.z); S.set(w, it.h, w); };
  const treeTint = (t) => (it) => col.set(TREE_TINTS[t][it.tint % TREE_TINTS[t].length]);
  make(cedarGeometry(), treeMaterial(ctx, true), buckets.cedar, treePlace, treeTint(0), 'env-scatter-cedar');
  make(broadGeometry(), treeMaterial(ctx, false), buckets.broad, treePlace, treeTint(1), 'env-scatter-broadleaf');
  make(broadGeometry(), treeMaterial(ctx, false), buckets.autumn, treePlace, treeTint(2), 'env-scatter-autumn');
  const tuftMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, side: 'double' });
  make(tuftGeometry(), tuftMat, buckets.tuft, (it) => { Q.setFromAxisAngle(Y, it.rot); P.set(it.x, it.y - 0.04, it.z); S.set(it.rad, it.h, it.rad); },
    (it) => col.setScalar(0.85 + (it.tint / 255) * 0.25), 'env-scatter-tufts');
  const rockMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.08 });
  make(rockGeometry(), rockMat, buckets.rock, (it) => { Q.setFromEuler(E.set(it.tilt, it.rot, it.tilt * 0.5)); P.set(it.x, it.y - 0.1 * it.h, it.z); S.set(it.h * 1.3, it.h, it.h * 1.1); },
    (it) => col.setScalar(0.82 + (it.tint / 255) * 0.3), 'env-scatter-rocks');
  ctx.add(g);
  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
  return { group: g, meshes, counts, list };
}
