// [smooth] Transparent double-sided meshes, drawn the way three.js draws them, without its per-draw program check.
//
// three.js draws a transparent DoubleSide material in two passes, back faces then front faces (WebGLRenderer.renderObject), by setting
// material.side and material.needsUpdate = true twice per draw: each one bumps the material's version, so every draw of every such mesh
// makes three.js rebuild the material's program parameters and cache key (getParameters < getProgram: the largest source of garbage in the
// frame, measured with tools/perf/run.mjs --alloc). Here each such mesh gets the same two passes as two geometry groups over the same
// triangles, a BackSide copy of its material then a FrontSide copy: the same draws in the same order (a mesh's groups stay together in the
// transparent sort: same object, same depth, stable order), and the materials never change again.
//
//   splitTwoSided(root) -> number of meshes changed (plain Meshes only: not instanced, batched or skinned; not ones already split)
//
// Only the static batches' merged meshes (parent 'static-batched', core/batch2.js): they are made after every module has built, so no code
// holds them and writes mesh.material.opacity (the arriving boats' wakes and labels do that to their own meshes every frame; on a split mesh
// the write would land on the array). Their materials can still change: the two sides read the original.
import * as THREE from 'three';

/** The material seen with another side: an object whose prototype is the material itself, so it reads every property of the original as it
 *  is now and later (a colour, an opacity, a uniform or a needsUpdate set on the original by a season, the night lights, a fade), and holds
 *  only its own side. three.js keeps a program state per material object, so the two never trip each other's program check.
 *  (Material.clone() would freeze the values and drop the shader patches set as own properties.) */
function sided(m, side) {
  const c = Object.create(m);
  c.side = side;
  return c;
}

export function splitTwoSided(root, accept = (o) => o.parent?.name === 'static-batched') {
  const cache = new Map();   // material -> [back, front]: meshes that shared a material keep sharing its two copies
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh || o.userData.twoSided || !accept(o)) return;
    const m = o.material;
    if (!m || Array.isArray(m) || !m.transparent || m.side !== THREE.DoubleSide || m.forceSinglePass) return;
    const g = o.geometry;
    if (!g || g.groups.length || !g.attributes.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();   // now, while the arrays are there (the phone tier drops them once uploaded)
    if (!g.boundingBox) g.computeBoundingBox();
    let pair = cache.get(m);
    if (!pair) { pair = [sided(m, THREE.BackSide), sided(m, THREE.FrontSide)]; cache.set(m, pair); }
    // a geometry of its own that shares the attribute and index buffers (nothing is uploaded twice), with the two groups
    const g2 = new THREE.BufferGeometry();
    g2.setIndex(g.index);
    for (const k in g.attributes) g2.setAttribute(k, g.attributes[k]);
    for (const k in g.morphAttributes) g2.morphAttributes[k] = g.morphAttributes[k];
    g2.morphTargetsRelative = g.morphTargetsRelative;
    g2.boundingBox = g.boundingBox; g2.boundingSphere = g.boundingSphere;
    const count = g.index ? g.index.count : g.attributes.position.count;
    const start = g.drawRange.start, len = Math.min(count - start, g.drawRange.count);
    g2.addGroup(start, len, 0); g2.addGroup(start, len, 1);
    g2.name = g.name;
    o.geometry = g2;
    o.material = pair;
    o.userData.twoSided = true;
    n++;
  });
  return n;
}
