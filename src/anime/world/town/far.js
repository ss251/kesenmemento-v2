// [v3:town] Far zone: every remaining GSI footprint of the city as instanced anime houses and blocks, bodies with the
// procedural facade (facade.js, instanced path) and gable / hip / flat roofs in the photo-sampled palette, chunked in
// two rings (near casts shadows); small footprints far away are skipped (sub-pixel from any view).
import * as THREE from 'three';
import { unitGable, unitHip } from './kit/far.js';
import { facadeMaterial } from './facade.js';
import { styleOf } from './mid.js';
import { wallOf, pitchedRoofOf, flatRoofOf } from './palette.js';

const DARK = ['#4d6457', '#56677a', '#3e4a63', '#6a5448', '#4a4f58', '#7b8691', '#8e4540', '#4a78a0', '#a0573f', '#5d6f86'];

function bodyGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // drop the bottom face (never seen)
  const idx = g.index.array, keep = [];
  const pos = g.attributes.position;
  for (let i = 0; i < idx.length; i += 3) { const y = pos.getY(idx[i]) + pos.getY(idx[i + 1]) + pos.getY(idx[i + 2]); if (y > 0.01) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
  g.setIndex(keep);
  return g;
}

export function buildFar(ctx, lots, { centre, maxDist = 7000, ring = 2200, skipSmallBeyond = 2000 } = {}) {
  const list = [];
  for (const l of lots) {
    if (l.obb.w < 1.5 || l.obb.d < 1.5) continue;
    if (ctx.L.shoreDist(l.obb.cx, l.obb.cz) > 0.5) continue;
    const dist = Math.hypot(l.obb.cx - centre.cx, l.obb.cz - centre.cz);
    if (dist > maxDist) continue;
    if (dist > skipSmallBeyond && l.area < 70) continue;
    if (dist > 4000 && l.area < 130) continue;
    list.push(l);
  }
  // two rings around the inner bay: the near ring casts shadows, the outer ring does not (fewer draw calls than tiles;
  // frustum culling of 1.6 km tiles bought less than the extra calls cost)
  const tiles = new Map();
  for (const l of list) { const k = Math.hypot(l.obb.cx - centre.cx, l.obb.cz - centre.cz) < ring ? 'near' : 'outer'; let t = tiles.get(k); if (!t) tiles.set(k, (t = [])); t.push(l); }
  const body = bodyGeo(), gable = unitGable(), hip = unitHip(), cap = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const facade = facadeMaterial(ctx, { instanced: true });
  const roofMat = ctx.mat.toon('#ffffff', { paint: 0.05 });
  const shapeOf = (l) => (l.height > 11 || l.kind === 'factory' || (l.roof.shape === 'flat' && l.area > 260) ? 'flat' : l.roof.shape === 'hip' ? 'hip' : 'gable');
  const roofCol = (l, sh) => (sh === 'flat' ? flatRoofOf(l) : pitchedRoofOf(l));
  const group = new THREE.Group(); group.name = 'town-far';
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let count = 0, tris = 0;
  for (const tl of tiles.values()) {
    const cnt = { gable: 0, hip: 0, flat: 0 };
    for (const l of tl) cnt[shapeOf(l)]++;
    const bodies = new THREE.InstancedMesh(body, facade, tl.length);
    const fac = new Float32Array(tl.length * 4);
    const roofs = {};
    for (const k of ['gable', 'hip', 'flat']) if (cnt[k]) roofs[k] = new THREE.InstancedMesh(k === 'gable' ? gable : k === 'hip' ? hip : cap, roofMat, cnt[k]);
    const fill = { gable: 0, hip: 0, flat: 0 };
    tl.forEach((l, i) => {
      const o = l.obb, h = Math.max(2.6, l.height), base = l.groundY - 0.6;
      Q.setFromAxisAngle(Y, o.rotY);
      P.set(o.cx, base, o.cz); S.set(Math.max(1, o.w - 0.25), h + 0.6, Math.max(1, o.d - 0.25));
      bodies.setMatrixAt(i, M4.compose(P, Q, S));
      bodies.setColorAt(i, col.set(wallOf(l)));
      fac[i * 4] = styleOf(l, false); fac[i * 4 + 1] = (l.seed % 997) / 997; fac[i * 4 + 2] = h; fac[i * 4 + 3] = 0;
      const sh = shapeOf(l), k = fill[sh]++;
      if (sh === 'flat') { P.set(o.cx, base + h + 0.6, o.cz); S.set(o.w - 0.1, 0.35, o.d - 0.1); }
      else {
        const along = o.w >= o.d;
        Q.setFromAxisAngle(Y, o.rotY + (along ? 0 : Math.PI / 2));
        const Lr = Math.max(o.w, o.d), D = Math.min(o.w, o.d);
        P.set(o.cx, base + h + 0.6, o.cz); S.set(Lr - 0.25, Math.min(3.2, D * 0.32), D - 0.25);
      }
      roofs[sh].setMatrixAt(k, M4.compose(P, Q, S));
      roofs[sh].setColorAt(k, col.set(roofCol(l, sh)));
    });
    bodies.geometry = body.clone();
    bodies.geometry.setAttribute('aFac', new THREE.InstancedBufferAttribute(fac, 4));
    // tiles whose centre is beyond the drone shadow box (~700 m) do not cast shadows (saves the shadow pass)
    const cast = tl === tiles.get('near');
    for (const m of [bodies, ...Object.values(roofs)]) {
      m.castShadow = cast; m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere(); m.computeBoundingBox?.();
      group.add(m);
      tris += m.count * (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3);
    }
    count += tl.length;
  }
  ctx.add(group);
  return { count, tiles: tiles.size, tris: Math.round(tris), meshes: group.children.length };
}
