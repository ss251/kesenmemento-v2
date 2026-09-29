// [v3:harbor] 鎮守の森: the dense shrine grove that covers 神明崎 around 五十鈴神社 (the aerial photo shows the whole
// peninsula wooded: pines on the rocky rim, broadleaf crowns inside, a few early 紅葉). Uses the environment's own
// tree geometry, colours and material so it reads as the same painted forest. Two InstancedMeshes.
import * as THREE from 'three';
import { cedarGeometry, broadGeometry, TREE_TINTS, treeMaterial } from '../environment/trees.js';   // [v3:integrate] treeMaterial
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';   // [v3:fix]

// [v3:fix] a close-up broadleaf for the grove: the environment's 20-face blobs are built for distance and read as giant
// low-poly cubes from the 浮見堂 walkway. Seven subdivided, smooth-shaded lobes in a rounded crown, vertex-coloured like
// the environment's (lighter tops, darker skirts), same unit size (height 1, radius ~0.5).
let _heroBroad = null;
function heroBroadGeometry() {
  if (_heroBroad) return _heroBroad;
  const parts = [];
  const paint = (g, fn) => { const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color(); for (let i = 0; i < p.count; i++) { fn(p.getY(i), col); c.set([col.r, col.g, col.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.46, 6).translate(0, 0.23, 0); trunk.deleteAttribute('uv');
  parts.push(paint(trunk.toNonIndexed(), (y, c) => c.set('#76604e')));
  for (const [bx, bz, by] of [[-0.2, 0.08, 0.44], [0.2, -0.06, 0.46]]) { const l = new THREE.CylinderGeometry(0.018, 0.028, 0.3, 5).rotateZ(-bx * 2.2).translate(bx * 0.45, by, bz * 0.45); l.deleteAttribute('uv'); parts.push(paint(l.toNonIndexed(), (y, c) => c.set('#76604e'))); }
  const lobes = [[0, 0.72, 0, 0.3], [0.24, 0.6, 0.1, 0.24], [-0.23, 0.62, -0.08, 0.25], [0.06, 0.58, 0.26, 0.22], [-0.06, 0.6, -0.27, 0.22], [0.2, 0.8, -0.14, 0.18], [-0.18, 0.82, 0.14, 0.18]];
  for (const [x, y, z, r] of lobes) {
    let g = new THREE.IcosahedronGeometry(r, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g); g.scale(1, 0.84, 1); g.translate(x, y, z); g.computeVertexNormals();
    parts.push(paint(g.toNonIndexed(), (yy, c) => { const t = Math.min(1, Math.max(0, (yy - (y - r)) / (2 * r))); c.set('#5a8752').lerp(new THREE.Color('#a8ca7c'), t * 0.9); }));
  }
  _heroBroad = mergeGeometries(parts);
  return _heroBroad;
}

/**
 * opts: center {x,z}, r (m), spacing (m), keep: [[x, z, r]] clearings (shrine, torii, paths), seed.
 * Returns { count, trees: [{x, y, z, h}] }.
 */
export function buildShrineGrove(ctx, opts = {}) {
  const L = ctx.L;
  if (!L?.heightAt || !L?.isWater) return { count: 0, trees: [] };
  const c = opts.center || L.SPOTS?.shinmeizaki || { x: 352, z: -80 };
  const R = opts.r ?? 80, sp = opts.spacing ?? 5.2;
  const keep = opts.keep || [];
  const r = ctx.rng(opts.seed ?? 'shrine-grove');
  const lots = (L.LOTS || []).filter((l) => l.zone === 'hero' && Math.hypot(l.obb.cx - c.x, l.obb.cz - c.z) < R + 40 && l.landmark !== 'isuzuShrine');
  const inLot = (x, z) => lots.some((l) => {
    const o = l.obb, dx = x - o.cx, dz = z - o.cz, cs = Math.cos(o.rotY), sn = Math.sin(o.rotY);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    return Math.abs(lx) < o.w / 2 + 2.5 && Math.abs(lz) < o.d / 2 + 2.5;
  });
  const roads = (L.ROADS || []).filter((rd) => rd.zone === 'hero');
  const nearRoad = (x, z) => roads.some((rd) => { for (let i = 0; i < rd.pts.length - 1; i++) { const [ax, az] = rd.pts[i], [bx, bz] = rd.pts[i + 1]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < (rd.width || 6) / 2 + 2) return true; } return false; });
  const pts = [[], []];   // 0 cedar/pine, 1 broadleaf (incl. autumn tint)
  const trees = [];
  for (let gx = c.x - R; gx <= c.x + R; gx += sp) for (let gz = c.z - R; gz <= c.z + R; gz += sp) {
    const x = gx + r.range(-sp * 0.4, sp * 0.4), z = gz + r.range(-sp * 0.4, sp * 0.4);
    if (Math.hypot(x - c.x, z - c.z) > R || (opts.clip && !opts.clip(x, z))) continue;
    if (L.isWater(x, z)) continue;
    const sd = L.shoreDist ? L.shoreDist(x, z) : -10;              // + sea, - land
    if (sd > -1.5) continue;
    const y = L.heightAt(x, z);
    if (y < 2.2) continue;                                          // the flat quay-side ground stays open
    if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
    if (inLot(x, z) || nearRoad(x, z)) continue;
    const rim = sd > -9;                                            // rocky rim: pines lean out over the water
    const t = rim ? (r.chance(0.7) ? 0 : 1) : (r.chance(0.22) ? 0 : 1);
    const h = t === 0 ? r.range(8, 13) : r.range(6.5, 10);   // [v3:fix] smaller crowns (they filled the 浮見堂 frame)
    const rad = t === 0 ? h * r.range(0.24, 0.3) : h * r.range(0.36, 0.46);
    const autumn = t === 1 && r.chance(0.14);
    pts[t].push({ x, y, z, h, rad, autumn, tint: r.int(0, 255) });
    trees.push({ x, y, z, h });
  }
  const geos = [cedarGeometry(), heroBroadGeometry()];   // [v3:fix] close-up broadleaf
  void broadGeometry;
  const mats = [treeMaterial(ctx, true), treeMaterial(ctx, false)];   // [v3:integrate] seasonal, same as the environment's trees
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const g = new THREE.Group(); g.name = 'shrine-grove';
  pts.forEach((list, t) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geos[t], mats[t], list.length);
    list.forEach((p, i) => {
      const w = t === 0 ? p.rad / 0.22 : p.rad / 0.5;
      Q.setFromAxisAngle(Y, (p.tint / 255) * Math.PI * 2);
      P.set(p.x, p.y - 0.35, p.z); S.set(w, p.h, w);
      m.setMatrixAt(i, M4.compose(P, Q, S));
      const pal = t === 0 ? TREE_TINTS[0] : p.autumn ? TREE_TINTS[2] : TREE_TINTS[1];
      m.setColorAt(i, col.set(pal[p.tint % pal.length]));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); m.name = 'shrine-grove-' + t;
    g.add(m);
  });
  ctx.add(g);
  return { count: trees.length, trees, group: g };
}
