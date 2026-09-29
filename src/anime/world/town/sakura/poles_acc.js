// [v3:town] vendored from Sakuragaoka Station src/world/poles/acc.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Geometry accumulator: bakes many small parts (transformed, vertex-coloured, atlas-UV'd) into one
// BufferGeometry so a whole pole is 2-3 meshes (then static batching merges poles per cell).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _M = new THREE.Matrix4();

export class Acc {
  constructor(whiteUV) { this.parts = []; this.T = new THREE.Matrix4(); this.white = whiteUV; this.tris = 0; }
  /** geo: source geometry (not modified). m: local Matrix4 (pre-multiplied by this.T). col: THREE.Color (linear)
   *  uvr: [u0,v0,u1,v1] to remap the geometry's own 0..1 UVs into an atlas rect; null = sample the white patch. */
  add(geo, m, col, uvr) {
    const g = geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    else if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
    _M.multiplyMatrices(this.T, m);
    g.applyMatrix4(_M);
    const c = new Float32Array(n * 3);
    const r = col ? col.r : 1, gg = col ? col.g : 1, b = col ? col.b : 1;
    for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const uv = g.attributes.uv.array;
    if (!uvr) { for (let i = 0; i < n; i++) { uv[i * 2] = this.white[0]; uv[i * 2 + 1] = this.white[1]; } }
    else { const [u0, v0, u1, v1] = uvr; for (let i = 0; i < n; i++) { uv[i * 2] = u0 + uv[i * 2] * (u1 - u0); uv[i * 2 + 1] = v0 + uv[i * 2 + 1] * (v1 - v0); } }
    g.attributes.uv.needsUpdate = true;
    this.tris += g.index.count / 3;
    this.parts.push(g);
    return g;
  }
  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!g) return null;
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
