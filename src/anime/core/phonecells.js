// [v4:phone] Fewer draw calls for the phone tier's outline pre-pass and shadow pass.
//
// The static batcher (batch2.js) leaves one mesh per material per cell. The colour pass needs that split, but the
// normal/depth pre-pass (one override material) and the shadow pass (depth only) do not: on the phone they spent ~145
// and ~170 calls drawing the same cells material by material. Here the opaque batches of each cell are merged into one
// geometry with a group per material, and three meshes share its buffers (no extra GPU or CPU memory):
//   static-cells   the colour mesh (material array: one call per material, as before), castShadow off
//   static-nd      the whole cell in one call, shown only during the pre-pass
//   static-shadow  the casters in one or two calls (front-sided, then double-sided), shown only during the shadow pass
// renderer.js swaps their visibility around the passes (setProxies). Transparent, alpha-tested, shader and
// non-default-layer meshes stay in static-batched and render as before.
import * as THREE from 'three';

const SHADOW_FRONT = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
const SHADOW_DOUBLE = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ND_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/** Can this batch join a merged cell? */
export function mergeable(o) {
  const m = o.material, g = o.geometry;
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || Array.isArray(m) || !g?.index || !g.attributes.position) return false;
  if (m.isShaderMaterial || m.transparent || m.alphaTest > 0 || m.alphaMap || !m.visible) return false;
  if (o.layers.mask !== 1 || o.renderOrder !== 0 || !o.frustumCulled || o.morphTargetInfluences) return false;
  return true;
}

/**
 * Merge the mergeable children of `batched` (the static-batched group) by cell. -> { cells, nd, shadow, stats }
 * (three Groups, added to `root`), or null when there is nothing to merge.
 */
export function mergeCells(root, batched, { cell = 400 } = {}) {
  const groups = new Map();
  const items = batched.children.filter(mergeable);
  for (const o of items) {
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const c = g.boundingSphere.center, r = g.boundingSphere.radius;
    const k = (r > cell ? 'L' : Math.floor(c.x / cell) + ',' + Math.floor(c.z / cell)) + '|' + (o.receiveShadow ? 1 : 0);
    let l = groups.get(k); if (!l) groups.set(k, (l = [])); l.push(o);
  }
  if (!groups.size) return null;
  const cells = new THREE.Group(); cells.name = 'static-cells';
  const nd = new THREE.Group(); nd.name = 'static-nd'; nd.visible = false;
  const shadow = new THREE.Group(); shadow.name = 'static-shadow'; shadow.visible = false;
  const stats = { cells: 0, merged: 0, tris: 0 };
  for (const list of groups.values()) {
    // casters first (front-sided, then double / back), then the rest: the shadow views are two draw ranges
    const rank = (o) => (o.castShadow ? (o.material.side === THREE.FrontSide ? 0 : 1) : 2);
    list.sort((a, b) => rank(a) - rank(b));
    let nv = 0, ni = 0;
    for (const o of list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 3).fill(1);
    const I = new Uint32Array(ni);
    const geo = new THREE.BufferGeometry();
    const mats = [];
    let v = 0, i = 0;
    const ends = [0, 0, 0];   // index end of each rank
    for (const o of list) {
      const g = o.geometry, n = g.attributes.position.count;
      P.set(g.attributes.position.array, v * 3);
      if (g.attributes.normal) N.set(g.attributes.normal.array, v * 3);
      if (g.attributes.uv) U.set(g.attributes.uv.array, v * 2);
      const col = g.attributes.color;
      if (col && col.itemSize === 3) C.set(col.array, v * 3);
      else if (col) for (let k = 0; k < n; k++) { C[(v + k) * 3] = col.getX(k); C[(v + k) * 3 + 1] = col.getY(k); C[(v + k) * 3 + 2] = col.getZ(k); }
      const src = g.index.array, cnt = g.index.count;
      for (let k = 0; k < cnt; k++) I[i + k] = src[k] + v;
      geo.addGroup(i, cnt, mats.length); mats.push(o.material);
      v += n; i += cnt; ends[rank(o)] = i;
      g.dispose(); o.parent.remove(o);
    }
    ends[1] = Math.max(ends[1], ends[0]); ends[2] = i;
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const view = (start, count) => {
      const g = new THREE.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);   // the same BufferAttributes: one GPU buffer
      g.setIndex(geo.index); g.setDrawRange(start, count);
      g.boundingSphere = geo.boundingSphere.clone(); g.boundingBox = geo.boundingBox.clone();
      return g;
    };
    const receive = list[0].receiveShadow;
    const mk = (g, m, parent, cast) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); parent.add(mesh); return mesh; };
    mk(geo, mats, cells, false);
    mk(view(0, i), ND_MAT, nd, false);
    if (ends[0] > 0) mk(view(0, ends[0]), SHADOW_FRONT, shadow, true);
    if (ends[1] > ends[0]) mk(view(ends[0], ends[1] - ends[0]), SHADOW_DOUBLE, shadow, true);
    stats.cells++; stats.merged += list.length; stats.tris += i / 3;
  }
  root.add(cells, nd, shadow);
  return { cells, nd, shadow, stats };
}
