// Model-mode trees (ADDENDUM): instanced round "model trees" (ball on a short stem) scattered where the ortho
// photo is vegetated, like the dotted wooded slopes of the physical model.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hash01 } from "../../core/geo.js";
import { MODEL_LOOK } from "../config.js";

function treeGeometry() {
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const p = crown.attributes.position, n = crown.attributes.normal;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  crown.scale(1, 0.92, 1).translate(0, 1.1, 0);                  // centre at ground + 1.1 r (P2 trees.json)
  const stem = new THREE.CylinderGeometry(0.08, 0.11, 0.4, 4, 1, true).translate(0, 0.2, 0).toNonIndexed();
  for (const g of [crown, stem]) g.deleteAttribute("uv");
  const cc = new Float32Array(crown.attributes.position.count * 3).fill(1), sc = new Float32Array(stem.attributes.position.count * 3);
  for (let i = 0; i < sc.length; i += 3) sc.set([0.55, 0.45, 0.36], i);
  crown.setAttribute("color", new THREE.BufferAttribute(cc, 3)); stem.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  return mergeGeometries([crown, stem]);
}

export function isVegetation(c) {
  if (!c) return false;
  const [r, g, b] = c;
  return g > r * 1.06 && g > b * 1.12 && r + g + b < 1.6;
}

/** KLT1 (P2 trees_*.bin): u32 magic 'KLT1', u32 count, f32 [x, y, z, r] * count, u8 type[count]; shuffled order. */
export function parseTrees(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x4b4c5431) throw new Error("trees.bin: bad magic");
  const n = dv.getUint32(4, true);
  return { count: n, xyzr: new Float32Array(buffer.slice(8, 8 + n * 16)), type: new Uint8Array(buffer, 8 + n * 16, n) };
}

/** Instanced model trees from KLT1 point sets: the first `count` of each (uniform subsample). */
export function createTreesFromPoints({ atm, sets }) {
  const total = sets.reduce((s, x) => s + Math.min(x.take, x.data.count), 0);
  const geo = treeGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  atm.shadowMaterial(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, total)); mesh.name = "trees";
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const palette = MODEL_LOOK.tree.map((c) => new THREE.Color(c)), conifer = new THREE.Color("#4f7a4a"), bamboo = new THREE.Color("#8fb36a");
  let i = 0;
  for (const { data, take } of sets) for (let k = 0; k < Math.min(take, data.count); k++, i++) {
    const [x, y, z, r0] = data.xyzr.subarray(k * 4, k * 4 + 4), r = Math.max(1.5, r0);
    s.set(r, r * (data.type[k] === 1 ? 1.25 : 1), r); p.set(x, y - 0.2, z);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    const base = data.type[k] === 1 ? conifer : data.type[k] === 2 ? bamboo : palette[k % palette.length];
    mesh.setColorAt(i, col.copy(base).multiplyScalar(0.88 + ((k * 2654435761) % 1000) / 1000 * 0.24));
  }
  mesh.count = i; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, count: i, triangles: i * geo.attributes.position.count / 3 };
}

export function createTrees({ atm, heightAt, sample, box, count, buildingsNear }) {
  const [x0, z0, x1, z1] = box, area = (x1 - x0) * (z1 - z0);
  const spacing = Math.max(7, Math.sqrt(area / (count * 2.2)));
  const pts = [];
  for (let z = z0; z < z1; z += spacing) for (let x = x0; x < x1; x += spacing) {
    const jx = x + (hash01(`${x},${z}a`) - 0.5) * spacing * 0.9, jz = z + (hash01(`${x},${z}b`) - 0.5) * spacing * 0.9;
    const h = heightAt(jx, jz); if (h < 2.5) continue;
    if (!isVegetation(sample(jx, jz))) continue;
    if (buildingsNear?.(jx, jz)) continue;
    pts.push([jx, h, jz]);
  }
  const keep = Math.min(count, pts.length), step = pts.length / Math.max(1, keep);
  const geo = treeGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  atm.shadowMaterial(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, keep)); mesh.name = "trees";
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const palette = MODEL_LOOK.tree.map((c) => new THREE.Color(c));
  for (let i = 0; i < keep; i++) {
    const [x, h, z] = pts[Math.floor(i * step)], r = 2.6 + hash01(`${x}r`) * 2.2;
    s.set(r, r * (0.95 + hash01(`${z}s`) * 0.25), r); p.set(x, h - 0.2, z);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
    col.copy(palette[Math.floor(hash01(`${x},${z}c`) * palette.length)]).multiplyScalar(0.9 + hash01(`${z}v`) * 0.2);
    mesh.setColorAt(i, col);
  }
  mesh.count = keep; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, count: keep, triangles: keep * (geo.index ? geo.index.count : geo.attributes.position.count) / 3 };
}
