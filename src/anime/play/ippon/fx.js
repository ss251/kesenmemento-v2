// [ippon] One instanced mesh for spray, bait splashes and the silver boil. Slots are reused. No per-frame alloc.
import * as THREE from 'three';

const N = 48;

export function createBoil(ctx) {
  const geo = new THREE.SphereGeometry(0.12, 6, 5);
  const mat = ctx.mat?.toon ? ctx.mat.toon('#f4f7f8', { transparent: true, opacity: 0.85 }) : new THREE.MeshBasicMaterial({ color: '#f4f7f8', transparent: true, opacity: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'ippon-boil';
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const slots = [];
  for (let i = 0; i < N; i++) slots.push({ on: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.2 });
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  const zero = new THREE.Vector3(0, -20, 0);
  ctx.add(mesh);
  try { ctx.noOutline?.(mesh); } catch (e) { /* */ }

  function emit(x, y, z, vx, vy, vz, s, life) {
    for (let i = 0; i < N; i++) {
      const sl = slots[i];
      if (sl.on) continue;
      sl.on = 1; sl.life = life; sl.x = x; sl.y = y; sl.z = z; sl.vx = vx; sl.vy = vy; sl.vz = vz; sl.s = s;
      return;
    }
  }
  function update(dt) {
    const h = dt > 0 ? dt : 0;
    for (let i = 0; i < N; i++) {
      const sl = slots[i];
      if (!sl.on) { M.compose(zero, Q, S.set(0, 0, 0)); mesh.setMatrixAt(i, M); continue; }
      sl.life -= h;
      if (sl.life <= 0) { sl.on = 0; M.compose(zero, Q, S.set(0, 0, 0)); mesh.setMatrixAt(i, M); continue; }
      sl.x += sl.vx * h; sl.y += sl.vy * h; sl.z += sl.vz * h; sl.vy -= 4.5 * h;
      const k = sl.s * Math.min(1, sl.life * 3);
      M.compose(P.set(sl.x, sl.y, sl.z), Q, S.set(k, k, k));
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { emit, update, mesh };
}
