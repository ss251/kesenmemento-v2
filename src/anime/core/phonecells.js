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
//
// [mobile-perf] Built cell by cell, to keep the load's memory peak down (deploy #5's iPhone crash was that peak): each cell's
// source batches are freed as soon as they are copied (they were a second copy of its vertices), and with `upload(mesh)` (main.js:
// one draw into a 1x1 target) each cell goes to the GPU at once and its CPU arrays are dropped after the upload (`release`). Without
// them, every cell's arrays and every source batch lived together until the first frame uploaded the lot.
import * as THREE from 'three';

const SHADOW_FRONT = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
const SHADOW_DOUBLE = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ND_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const EMPTY = new THREE.BufferGeometry();   // a source batch after its arrays are freed (it is out of the scene)

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
export function mergeCells(root, batched, { cell = 400, upload = null, release = null } = {}) {
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
      for (const k in g.attributes) g.attributes[k].array = null;   // [mobile-perf] the batch's own copy goes now (its arrays are its alone: batch2 merged them)
      if (g.index) g.index.array = null;
      o.geometry = EMPTY;
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
    const colour = mk(geo, mats, cells, false);
    mk(view(0, i), ND_MAT, nd, false);
    if (ends[0] > 0) mk(view(0, ends[0]), SHADOW_FRONT, shadow, true);
    if (ends[1] > ends[0]) mk(view(ends[0], ends[1] - ends[0]), SHADOW_DOUBLE, shadow, true);
    stats.cells++; stats.merged += list.length; stats.tris += i / 3;
    list.length = 0;
    // [mobile-perf] to the GPU now, and the CPU copy dropped on upload: one cell's arrays at a time
    if (upload) { if (release) release(geo); try { upload(colour); stats.uploaded = (stats.uploaded || 0) + 1; } catch (e) { console.warn('[phonecells] upload', e); } }
  }
  root.add(cells, nd, shadow);
  return { cells, nd, shadow, stats };
}

// ------------------------------------------------------------------ [mobile-perf] the phone's cells straight from the sources
//
// The load used to make the static town three times over on a phone: the sources (the modules' meshes), batch2's per-material merges
// (core/batch2.js: a clone of every source, converted, then merged), then this file's cells (a copy of those merges). Deploy #5's iPhone
// crash was that peak (WebContent ~1.1-1.4 GB just before the title, conductor's simulator run). Here batch2 hands over its groups and each
// cell is written straight from its sources: positions and normals transformed by the source's world matrix, the uvs remapped into their
// atlas tile, the material colour baked into the vertex colours: what batch2's merge did, without the clone and the merged copy. A source
// leaves the scene as soon as it is written; the cell is uploaded at once and its arrays dropped. At any moment the load holds the sources
// it has not reached yet and one cell.

/** Can a batch2 group (its target material, its first source) join a merged cell? (mergeable(), for a group that is not merged yet) */
export function groupMergeable(mat, o) {
  if (!mat || Array.isArray(mat) || mat.isShaderMaterial || mat.transparent || mat.alphaTest > 0 || mat.alphaMap || !mat.visible) return false;
  if (o.layers.mask !== 1 || o.renderOrder !== 0 || !o.frustumCulled || o.morphTargetInfluences) return false;
  return true;
}

const _m3 = new THREE.Matrix3(), _v = new THREE.Vector3();
const H = THREE.DataUtils.toHalfFloat, H1 = H(1);
const TOON_OBC = (m) => m.userData?.toon && m.onBeforeCompile === m.userData.toon.obc;
/** Does a material read the uvs? (a texture map of any kind, or a shader patch of its own that might) */
export function readsUv(m) {
  if (m.map || m.alphaMap || m.aoMap || m.lightMap || m.emissiveMap || m.normalMap || m.bumpMap || m.specularMap || m.displacementMap || m.roughnessMap || m.metalnessMap) return true;
  return m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile && !TOON_OBC(m);
}
/** Write one source into the cell's arrays at vertex v / index i (world space, colour baked, uvs into the atlas tile). -> [vertices, indices] */
function writeSource(it, needColor, A, v, i) {
  const { o, bake, tile } = it, g = o.geometry, pos = g.attributes.position, n = pos.count, M = o.matrixWorld;
  let nor = g.attributes.normal, tmp = null;
  if (!nor) { tmp = new THREE.BufferGeometry(); tmp.setAttribute('position', pos); if (g.index) tmp.setIndex(g.index); tmp.computeVertexNormals(); nor = tmp.attributes.normal; }   // (as batch2: a source without normals gets computed ones)
  _m3.getNormalMatrix(M);
  const P = A.P, N = A.N, U = A.U, C = A.C, I = A.I, uv = g.attributes.uv, col = g.attributes.color;
  const useCol = needColor && col && o.material.vertexColors, br = bake ? bake.r : 1, bg = bake ? bake.g : 1, bb = bake ? bake.b : 1;
  for (let k = 0; k < n; k++) {
    _v.fromBufferAttribute(pos, k).applyMatrix4(M); P[(v + k) * 3] = _v.x; P[(v + k) * 3 + 1] = _v.y; P[(v + k) * 3 + 2] = _v.z;
    _v.fromBufferAttribute(nor, k).applyMatrix3(_m3).normalize(); N[(v + k) * 4] = Math.round(_v.x * 127); N[(v + k) * 4 + 1] = Math.round(_v.y * 127); N[(v + k) * 4 + 2] = Math.round(_v.z * 127);
    if (uv && U) {
      let a = uv.getX(k), b = uv.getY(k);
      if (tile) { a = tile.u0 + Math.min(1, Math.max(0, a)) * tile.su; b = tile.v0 + Math.min(1, Math.max(0, b)) * tile.sv; }
      U[(v + k) * 2] = a; U[(v + k) * 2 + 1] = b;
    }
    if (needColor && useCol) { C[(v + k) * 4] = H(col.getX(k) * br); C[(v + k) * 4 + 1] = H(col.getY(k) * bg); C[(v + k) * 4 + 2] = H(col.getZ(k) * bb); }
  }
  // a source without vertex colours has one colour: its half floats are worked out once
  if (needColor && !useCol) { const hr = H(br), hg = H(bg), hb = H(bb); for (let k = 0; k < n; k++) { C[(v + k) * 4] = hr; C[(v + k) * 4 + 1] = hg; C[(v + k) * 4 + 2] = hb; } }
  const flip = M.determinant() < 0;
  let cnt;
  if (g.index) {
    const src = g.index; cnt = src.count;
    for (let k = 0; k < cnt; k += 3) {
      const a = src.getX(k) + v, b = src.getX(k + 1) + v, c = src.getX(k + 2) + v;
      I[i + k] = a; I[i + k + 1] = flip ? c : b; I[i + k + 2] = flip ? b : c;
    }
  } else {
    cnt = n;
    for (let k = 0; k < cnt; k += 3) { I[i + k] = v + k; I[i + k + 1] = v + (flip ? k + 2 : k + 1); I[i + k + 2] = v + (flip ? k + 1 : k + 2); }
  }
  if (tmp) tmp.dispose();
  return [n, cnt];
}

/**
 * Build the phone's merged cells straight from batch2's groups. `cellLists`: cell key -> [{ mat, items: [{ o, bake, tile }] }] (the items are
 * the sources, still in the scene). `upload(mesh)` / `release(geometry)` as for mergeCells. -> { cells, nd, shadow, stats } (added to `root`)
 * or null when there is nothing to build.
 */
export function buildCells(root, cellLists, { upload = null, release = null } = {}) {
  if (!cellLists.size) return null;
  const cells = new THREE.Group(); cells.name = 'static-cells';
  const nd = new THREE.Group(); nd.name = 'static-nd'; nd.visible = false;
  const shadow = new THREE.Group(); shadow.name = 'static-shadow'; shadow.visible = false;
  const stats = { cells: 0, merged: 0, tris: 0, uploaded: 0, direct: true };
  const cast = (grp) => grp.items[0].o.castShadow;
  const rank = (grp) => (cast(grp) ? (grp.mat.side === THREE.FrontSide ? 0 : 1) : 2);
  for (const [ck, list] of cellLists) {
    list.sort((a, b) => rank(a) - rank(b));   // casters first (front-sided, then double / back), then the rest: the shadow views are two draw ranges
    let nv = 0, ni = 0;
    for (const grp of list) for (const it of grp.items) { const g = it.o.geometry, n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
    // [mobile-perf] normals as four signed bytes (a quarter of three floats; the toon bands and the outline pre-pass read them as before), and
    // uvs only when a material of the cell reads them: ~20 % of the cells' GPU bytes
    const needUv = list.some((grp) => readsUv(grp.mat));
    // [mobile-perf] colours as four half floats (two thirds of three floats; a baked colour may pass 1, the lamps' do, so not bytes); alpha 1
    const A = { P: new Float32Array(nv * 3), N: new Int8Array(nv * 4), U: needUv ? new Float32Array(nv * 2) : null, C: new Uint16Array(nv * 4).fill(H1), I: new Uint32Array(ni) };
    const geo = new THREE.BufferGeometry(), mats = [], ends = [0, 0, 0];
    let v = 0, i = 0, nsrc = 0;
    const receive = list[0].items[0].o.receiveShadow;
    for (const grp of list) {
      const i0 = i, needColor = !!grp.mat.vertexColors;
      for (const it of grp.items) {
        const [n, cnt] = writeSource(it, needColor, A, v, i);
        v += n; i += cnt; nsrc++;
        it.o.parent && it.o.parent.remove(it.o);   // the source leaves now: a geometry nothing else holds is garbage from here
      }
      geo.addGroup(i0, i - i0, mats.length); mats.push(grp.mat);
      ends[rank(grp)] = i;
      grp.items.length = 0;
    }
    ends[1] = Math.max(ends[1], ends[0]); ends[2] = i;
    geo.setAttribute('position', new THREE.BufferAttribute(A.P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(A.N, 4, true));
    if (A.U) geo.setAttribute('uv', new THREE.BufferAttribute(A.U, 2));
    geo.setAttribute('color', new THREE.Float16BufferAttribute(A.C, 4));
    geo.setIndex(new THREE.BufferAttribute(A.I, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    stats.noUv = (stats.noUv || 0) + (A.U ? 0 : 1);
    const view = (start, count) => {
      const g = new THREE.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);   // the same BufferAttributes: one GPU buffer
      g.setIndex(geo.index); g.setDrawRange(start, count);
      g.boundingSphere = geo.boundingSphere.clone(); g.boundingBox = geo.boundingBox.clone();
      return g;
    };
    const mk = (g, m, parent, castS) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = castS; mesh.receiveShadow = receive; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); parent.add(mesh); return mesh; };
    const colour = mk(geo, mats, cells, false);
    mk(view(0, i), ND_MAT, nd, false);
    if (ends[0] > 0) mk(view(0, ends[0]), SHADOW_FRONT, shadow, true);
    if (ends[1] > ends[0]) mk(view(ends[0], ends[1] - ends[0]), SHADOW_DOUBLE, shadow, true);
    stats.cells++; stats.merged += nsrc; stats.tris += i / 3;
    list.length = 0;
    if (upload) { if (release) release(geo); try { upload(colour); stats.uploaded++; } catch (e) { console.warn('[phonecells] upload', e); } }
    void ck;
  }
  root.add(cells, nd, shadow);
  return { cells, nd, shadow, stats };
}
