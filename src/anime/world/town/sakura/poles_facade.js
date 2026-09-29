// [v3:town] vendored from Sakuragaoka Station src/world/poles/facade.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Facade finder for service drops (引込線). Runs once, after every module has been built and just before
// the shared wire mesh is generated (see poles.js: it wraps ctx.wires.build). It casts short segments
// against the static scene to find the real wall a drop wire should end on. Other modules' meshes are
// only read, never modified. Plain JS triangle loop with a coarse spatial grid and per-triangle AABB
// rejection — a few hundred short segments cost well under 100 ms.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const _e1 = new V3(), _e2 = new V3(), _p = new V3(), _q = new V3(), _s = new V3();
const CELL = 12;

export function createFacadeFinder(ctx, { exclude = new Set() } = {}) {
  let meshes = null;
  const grid = new Map();

  function collect() {
    meshes = [];
    grid.clear();
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.name === 'wires') return;
      if ((o.layers.mask & 1) === 0) return;                         // alpha cut-outs / particles live on layer 1
      if (o.userData && o.userData.dynamic) return;                    // trains, animated things
      const m = o.material; if (!m || Array.isArray(m) || exclude.has(m)) return;
      if (m.alphaTest > 0) return;
      const g = o.geometry; const pa = g && g.attributes.position;
      if (!pa || pa.isInterleavedBufferAttribute || pa.itemSize !== 3) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox.isEmpty()) return;
      const box = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!Number.isFinite(box.min.x)) return;
      // solid = an opaque cel surface a wire may end on; anything else (glass, lit panels) only blocks
      const solid = !m.transparent && m.type === 'MeshToonMaterial';
      const e = o.matrixWorld.elements;
      const identity = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
      const it = { o, g, box, identity, inv: null, nm: null, solid, stamp: 0, buckets: null };
      meshes.push(it);
      const x0 = Math.floor(box.min.x / CELL), x1 = Math.floor(box.max.x / CELL), z0 = Math.floor(box.min.z / CELL), z1 = Math.floor(box.max.z / CELL);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = ix + ',' + iz; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(it); }
    });
    return meshes.length;
  }

  // lazily bucket a mesh's triangles on a local-space XZ grid (merged meshes can span the whole town)
  const BC = 4;
  function bucketize(it) {
    const g = it.g, pos = g.attributes.position.array, idx = g.index ? g.index.array : null;
    const n = (idx ? idx.length : pos.length / 3) / 3 | 0;
    const bb = g.boundingBox, nx = Math.max(1, Math.ceil((bb.max.x - bb.min.x) / BC)), nz = Math.max(1, Math.ceil((bb.max.z - bb.min.z) / BC));
    const b = { x0: bb.min.x, z0: bb.min.z, nx, nz, cells: new Map(), seen: new Uint32Array(n), q: 0 };
    if (n < 400 || nx * nz < 3) { it.buckets = false; return; }
    for (let t = 0; t < n; t++) {
      const i0 = (idx ? idx[t * 3] : t * 3) * 3, i1 = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, i2 = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
      const ax = Math.min(pos[i0], pos[i1], pos[i2]), bx = Math.max(pos[i0], pos[i1], pos[i2]);
      const az = Math.min(pos[i0 + 2], pos[i1 + 2], pos[i2 + 2]), bz = Math.max(pos[i0 + 2], pos[i1 + 2], pos[i2 + 2]);
      const cx0 = Math.max(0, Math.floor((ax - b.x0) / BC)), cx1 = Math.min(nx - 1, Math.floor((bx - b.x0) / BC));
      const cz0 = Math.max(0, Math.floor((az - b.z0) / BC)), cz1 = Math.min(nz - 1, Math.floor((bz - b.z0) / BC));
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const k = cx * 100003 + cz; let a = b.cells.get(k); if (!a) b.cells.set(k, (a = [])); a.push(t); }
    }
    it.buckets = b;
  }

  let stamp = 0;
  /** meshes whose world AABB touches box */
  function near(box) {
    if (!meshes) collect();
    const out = []; stamp++;
    const x0 = Math.floor(box.min.x / CELL), x1 = Math.floor(box.max.x / CELL), z0 = Math.floor(box.min.z / CELL), z1 = Math.floor(box.max.z / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = grid.get(ix + ',' + iz); if (!a) continue;
      for (const it of a) { if (it.stamp === stamp) continue; it.stamp = stamp; if (it.box.intersectsBox(box)) out.push(it); }
    }
    return out;
  }

  /** nearest hit of segment A->B (world). returns { t (0..1), dist, point, normal, solid } or null */
  function seg(A, B) {
    const list = near(new THREE.Box3().setFromPoints([A, B]).expandByScalar(0.05));
    let best = null;
    for (const it of list) {
      let a = A, b = B;
      if (!it.identity) {
        if (!it.inv) { it.inv = it.o.matrixWorld.clone().invert(); it.nm = new THREE.Matrix3().getNormalMatrix(it.o.matrixWorld); }
        a = A.clone().applyMatrix4(it.inv); b = B.clone().applyMatrix4(it.inv);
      }
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const mnx = Math.min(a.x, b.x) - 0.01, mxx = Math.max(a.x, b.x) + 0.01;
      const mny = Math.min(a.y, b.y) - 0.01, mxy = Math.max(a.y, b.y) + 0.01;
      const mnz = Math.min(a.z, b.z) - 0.01, mxz = Math.max(a.z, b.z) + 0.01;
      const pos = it.g.attributes.position.array, idx = it.g.index ? it.g.index.array : null;
      if (it.buckets === null) bucketize(it);
      let tris = null;
      if (it.buckets) {
        const b = it.buckets; tris = []; b.q++;
        const cx0 = Math.max(0, Math.floor((mnx - b.x0) / BC)), cx1 = Math.min(b.nx - 1, Math.floor((mxx - b.x0) / BC));
        const cz0 = Math.max(0, Math.floor((mnz - b.z0) / BC)), cz1 = Math.min(b.nz - 1, Math.floor((mxz - b.z0) / BC));
        for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const a = b.cells.get(cx * 100003 + cz); if (a) for (const t of a) if (b.seen[t] !== b.q) { b.seen[t] = b.q; tris.push(t); } }
        if (!tris.length) continue;
      }
      const n = tris ? tris.length * 3 : idx ? idx.length : pos.length / 3;
      for (let j = 0; j + 2 < n; j += 3) {
        const i = tris ? tris[j / 3] * 3 : j;
        const i0 = (idx ? idx[i] : i) * 3, i1 = (idx ? idx[i + 1] : i + 1) * 3, i2 = (idx ? idx[i + 2] : i + 2) * 3;
        const x0 = pos[i0], x1 = pos[i1], x2 = pos[i2];
        if ((x0 < mnx && x1 < mnx && x2 < mnx) || (x0 > mxx && x1 > mxx && x2 > mxx)) continue;
        const z0 = pos[i0 + 2], z1 = pos[i1 + 2], z2 = pos[i2 + 2];
        if ((z0 < mnz && z1 < mnz && z2 < mnz) || (z0 > mxz && z1 > mxz && z2 > mxz)) continue;
        const y0 = pos[i0 + 1], y1 = pos[i1 + 1], y2 = pos[i2 + 1];
        if ((y0 < mny && y1 < mny && y2 < mny) || (y0 > mxy && y1 > mxy && y2 > mxy)) continue;
        // Möller–Trumbore
        _e1.set(x1 - x0, y1 - y0, z1 - z0); _e2.set(x2 - x0, y2 - y0, z2 - z0);
        _p.set(dy * _e2.z - dz * _e2.y, dz * _e2.x - dx * _e2.z, dx * _e2.y - dy * _e2.x);
        const det = _e1.dot(_p); if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        _s.set(a.x - x0, a.y - y0, a.z - z0);
        const u = _s.dot(_p) * inv; if (u < 0 || u > 1) continue;
        _q.crossVectors(_s, _e1);
        const v = (dx * _q.x + dy * _q.y + dz * _q.z) * inv; if (v < 0 || u + v > 1) continue;
        const t = _e2.dot(_q) * inv; if (t < 0 || t > 1) continue;
        if (!best || t < best.t) {
          const nrm = new V3().crossVectors(_e1, _e2);
          if (!it.identity) nrm.applyMatrix3(it.nm);
          nrm.normalize();
          best = { t, nrm, solid: it.solid };
        }
      }
    }
    if (!best) return null;
    const D = new V3().subVectors(B, A);
    const point = A.clone().addScaledVector(D, best.t);
    if (best.nrm.dot(D) > 0) best.nrm.negate();
    return { t: best.t, dist: best.t * D.length(), point, normal: best.nrm, solid: best.solid };
  }

  return { collect, near, seg, get count() { return meshes ? meshes.length : 0; } };
}
