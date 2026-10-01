// [v3:town] Gardens around the houses of the hero and mid zones (Sakura's overview reads green between the roofs):
// lawn patches, rounded shrubs, garden trees (the environment's broadleaf clump + small cedars, same style as the
// hills), and clipped hedges along street frontages. Placed on free land beside each house (never on a road, another
// footprint or the sea); three InstancedMeshes + one merged lawn mesh. Autumn: a few crowns turn orange / yellow.
import * as THREE from 'three';
import { broadGeometry, cedarGeometry } from '../environment/trees.js';

function shrubGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const pos = g.attributes.position;
  // merge duplicated vertices -> smooth cel normals
  const map = new Map(), P = [], I = [];
  for (let i = 0; i < pos.count; i++) { const k = pos.getX(i).toFixed(4) + ',' + pos.getY(i).toFixed(4) + ',' + pos.getZ(i).toFixed(4); let j = map.get(k); if (j === undefined) { j = P.length / 3; map.set(k, j); P.push(pos.getX(i), pos.getY(i) * 0.8 + 0.4, pos.getZ(i)); } I.push(j); }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); m.setIndex(I); m.computeVertexNormals();
  const c = new Float32Array(P.length), a = new THREE.Color('#4f7a4c'), b = new THREE.Color('#9dc27a'), t = new THREE.Color();
  for (let i = 0; i < P.length / 3; i++) { t.copy(a).lerp(b, Math.min(1, Math.max(0, P[i * 3 + 1] / 0.8)) * 0.9); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
  m.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return m;
}

const GREEN = ['#ffffff', '#f0f6e6', '#e5f0d8', '#fff7df', '#d9e8cf'];
const AUTUMN = ['#ffb46a', '#ff8f5e', '#ffd070', '#f7a45c'];

export function buildGardens(ctx, lots, { lotIdx, roadIdx, heroZone, maxDist = 1150 } = {}) {
  const L = ctx.L;
  const shrubs = [], trees = [], cedars = [], lawns = [];
  const free = (x, z, pad = 0.4) => L.shoreDist(x, z) < -2 && !lotIdx.at(x, z, pad) && !roadIdx.covering(x, z, 0.9, null).length;
  for (const lot of lots) {
    if (lot.kind !== 'house' && lot.kind !== 'apartment') continue;
    const o = lot.obb;
    if (Math.hypot(o.cx - heroZone.cx, o.cz - heroZone.cz) > maxDist) continue;
    const r = ctx.rng('garden-' + lot.id);
    if (r() < 0.25) continue;
    const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    const W = (lx, lz) => [o.cx + lx * c + lz * s, o.cz - lx * s + lz * c];
    // candidate spots: around the footprint, 1.2 - 3.2 m out
    const cand = [];
    for (let k = 0; k < 10; k++) {
      const side = Math.floor(r() * 4), t = r() - 0.5, off = 1.2 + r() * 2.0;
      const lx = side === 0 ? t * o.w : side === 1 ? t * o.w : side === 2 ? o.w / 2 + off : -o.w / 2 - off;
      const lz = side === 0 ? o.d / 2 + off : side === 1 ? -o.d / 2 - off : t * o.d;
      const p = W(lx, lz);
      if (free(p[0], p[1])) cand.push(p);
    }
    if (!cand.length) continue;
    // a lawn under the garden, then 1-4 plants
    const lp = cand[0];
    if (r() < 0.7) lawns.push({ x: lp[0], z: lp[1], w: 2.5 + r() * 3, d: 2 + r() * 2.5, rot: o.rotY, col: ['#8fb86f', '#86ad64', '#9dc27a', '#7fa860'][Math.floor(r() * 4)] });
    const n = 1 + Math.floor(r() * Math.min(4, cand.length));
    for (let i = 0; i < n; i++) {
      const [x, z] = cand[i % cand.length];
      const y = L.heightAt(x, z);
      const k = r();
      if (k < 0.45) shrubs.push({ x, y, z, s: 0.9 + r() * 0.9, h: 0.7 + r() * 0.6, rot: r() * 6.28 });
      else if (k < 0.85) trees.push({ x, y, z, s: 2.8 + r() * 2.4, rot: r() * 6.28, autumn: r() < 0.05 });   // [v5:fix1] few 紅葉 (was 22 %): the default view keeps the autumn tint <= 2 %
      else cedars.push({ x, y, z, s: 4 + r() * 3, rot: r() * 6.28 });
    }
  }
  const group = new THREE.Group(); group.name = 'town-gardens';
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const inst = (geo, list, fn, tints) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05 }), list.length);
    list.forEach((it, i) => { fn(it); m.setMatrixAt(i, M4.compose(P, Q, S)); m.setColorAt(i, col.set(tints(it, i))); });
    m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
    group.add(m); return m;
  };
  inst(shrubGeometry(), shrubs, (it) => { P.set(it.x, it.y - 0.05, it.z); Q.setFromAxisAngle(Y, it.rot); S.set(it.s, it.h, it.s * 0.85); }, (it, i) => GREEN[i % GREEN.length]);
  inst(broadGeometry(), trees, (it) => { P.set(it.x, it.y - 0.1, it.z); Q.setFromAxisAngle(Y, it.rot); S.set(it.s * 0.9, it.s, it.s * 0.9); }, (it, i) => (it.autumn ? AUTUMN[i % AUTUMN.length] : GREEN[i % GREEN.length]));
  inst(cedarGeometry(), cedars, (it) => { P.set(it.x, it.y - 0.1, it.z); Q.setFromAxisAngle(Y, it.rot); S.set(it.s, it.s, it.s); }, () => '#9dbb95');
  // lawns: draped 3x3 quads, merged
  if (lawns.length) {
    const pos = [], nor = [], colr = [], idx = [];
    for (const l of lawns) {
      const c = Math.cos(l.rot), s = Math.sin(l.rot); col.set(l.col);
      const base = pos.length / 3;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const lx = (i / 2 - 0.5) * l.w, lz = (j / 2 - 0.5) * l.d, x = l.x + lx * c + lz * s, z = l.z - lx * s + lz * c;
        pos.push(x, L.heightAt(x, z) + 0.06, z); nor.push(0, 1, 0); colr.push(col.r, col.g, col.b);
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const a = base + j * 3 + i; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.1, polygonOffset: -1 }));
    m.receiveShadow = true; group.add(m);
  }
  ctx.add(group);
  return { shrubs: shrubs.length, trees: trees.length, cedars: cedars.length, lawns: lawns.length };
}
