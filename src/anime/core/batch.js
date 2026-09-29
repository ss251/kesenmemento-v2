// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Static batching: merges every plain Mesh under `root` that shares a material (and layer /
// shadow flags / spatial cell) into one mesh. Cuts thousands of draw calls to a few hundred.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchStatic(root, { cell = 40 } = {}) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const victims = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noBatch || !o.visible) return;
    if (Array.isArray(o.material)) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.noBatch || !p.visible) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes?.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c);
    const big = box.max.x - box.min.x > cell * 1.5 || box.max.z - box.min.z > cell * 1.5;
    const ix = big ? 'L' : Math.floor(c.x / cell), iz = big ? 'L' : Math.floor(c.z / cell);
    const m = o.material;
    const key = `${m.uuid}|${ix},${iz}|${o.layers.mask}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${o.frustumCulled ? 1 : 0}`;
    let arr = groups.get(key); if (!arr) groups.set(key, (arr = []));
    arr.push(o);
  });
  let merged = 0, sources = 0;
  const out = new THREE.Group(); out.name = 'static-batched';
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const mat = list[0].material;
    const needColor = !!mat.vertexColors;
    const geos = [];
    for (const o of list) {
      let g = o.geometry.clone();
      // normalise attributes: position, normal, uv (+ color when the material uses it)
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (needColor && !g.attributes.color) { const a = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
      for (const name of Object.keys(g.attributes)) {
        if (name === 'position' || name === 'normal' || name === 'uv' || (needColor && name === 'color')) continue;
        g.deleteAttribute(name);
      }
      if (g.attributes.color && g.attributes.color.itemSize === 4) {
        const src = g.attributes.color, a = new Float32Array(src.count * 3);
        for (let i = 0; i < src.count; i++) { a[i * 3] = src.getX(i); a[i * 3 + 1] = src.getY(i); a[i * 3 + 2] = src.getZ(i); }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
      for (const name of Object.keys(g.attributes)) {
        const at = g.attributes[name];
        if (at.isInterleavedBufferAttribute || at.normalized || !(at.array instanceof Float32Array)) {
          const a = new Float32Array(at.count * at.itemSize);
          for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) a[i * at.itemSize + j] = at.getComponent(i, j);
          g.setAttribute(name, new THREE.BufferAttribute(a, at.itemSize));
        }
      }
      if (!g.index) { const n = g.attributes.position.count; const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
      g.clearGroups();
      g.applyMatrix4(o.matrixWorld);
      if (o.matrixWorld.determinant() < 0) { // mirrored: flip winding
        const ia = g.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      }
      g.morphAttributes = {};
      geos.push(g);
    }
    const mg = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!mg) { console.warn('batch: merge failed for', key); continue; }
    mg.computeBoundingSphere(); mg.computeBoundingBox();
    const mesh = new THREE.Mesh(mg, mat);
    const s = list[0];
    mesh.castShadow = s.castShadow; mesh.receiveShadow = s.receiveShadow; mesh.layers.mask = s.layers.mask;
    mesh.renderOrder = s.renderOrder; mesh.frustumCulled = s.frustumCulled;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    out.add(mesh);
    for (const o of list) victims.push(o);
    merged++; sources += list.length;
  }
  for (const o of victims) o.parent && o.parent.remove(o);
  root.add(out);
  // freeze remaining statics
  root.traverse((o) => { if (!o.userData.dynamic) { o.updateMatrix(); } });
  return { merged, sources };
}
