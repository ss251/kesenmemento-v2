// [play] A small white puff when the gull flaps. One instanced mesh, slots
// reused. The kit's bursts are gold and confetti; these are feathers.

import * as THREE from 'three';

const WHITE = '#f4f1ea';

export function createPuff(n = 10) {
  const slots = new Array(n);
  for (let i = 0; i < n; i++) {
    slots[i] = { on: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0.42, spin: 0, rx: 0, ry: 0, rz: 0 };
  }
  return { slots, cursor: 0, n };
}

/** Six feathers off the wing tips, drifting back. Mutates the pool. */
export function emitPuff(puff, x, y, z, yaw) {
  if (!puff) return puff;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const slots = puff.slots;
  for (let i = 0; i < 6; i++) {
    const s = slots[puff.cursor];
    puff.cursor = (puff.cursor + 1) % slots.length;
    const side = (i & 1) ? 1 : -1;
    const spread = 0.22 + (i % 3) * 0.06;
    s.on = 1;
    s.x = x + rx * side * spread - fx * 0.04;
    s.y = y + 0.06 + (i % 3) * 0.02;
    s.z = z + rz * side * spread - fz * 0.04;
    s.vx = rx * side * 0.7 - fx * 1.5;
    s.vy = 0.35 + (i % 3) * 0.18;
    s.vz = rz * side * 0.7 - fz * 1.5;
    s.life = 0.42;
    s.max = 0.42;
    s.spin = side * 5.5;
    s.rx = 0.5;
    s.ry = yaw;
    s.rz = side * 0.8;
  }
  return puff;
}

export function stepPuff(puff, dt) {
  if (!puff || !(dt > 0)) return puff;
  const slots = puff.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.on) continue;
    s.life -= dt;
    if (s.life <= 0) { s.on = 0; continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.vy -= 1.4 * dt;
    s.rz += s.spin * dt;
  }
  return puff;
}

export function puffAlive(puff) {
  if (!puff) return 0;
  let n = 0;
  for (let i = 0; i < puff.slots.length; i++) if (puff.slots[i].on) n++;
  return n;
}

function featherGeo() {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([
    0, 0, 0, 0.028, 0.05, 0, 0, 0.2, 0,
    0, 0, 0, 0, 0.2, 0, -0.028, 0.05, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

export function createFeatherMesh(ctx, n) {
  const geo = featherGeo();
  const mat = ctx.mat.toon(WHITE, { paint: 0, side: 'double', noSnow: true });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'play-gull-feathers';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.visible = false;
  if (ctx.noOutline) ctx.noOutline(mesh);
  if (ctx.noBatch) ctx.noBatch(mesh);
  ctx.add(mesh);
  return { mesh, dummy: new THREE.Object3D() };
}

export function writeFeathers(view, puff) {
  if (!view || !puff) return;
  const d = view.dummy, m = view.mesh;
  let n = 0;
  const slots = puff.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.on) continue;
    const u = s.life / s.max;
    d.position.set(s.x, s.y, s.z);
    d.rotation.set(s.rx, s.ry, s.rz);
    d.scale.set(u, 0.55 + 0.45 * u, u);
    d.updateMatrix();
    m.setMatrixAt(n, d.matrix);
    n++;
  }
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
  m.visible = n > 0;
}
