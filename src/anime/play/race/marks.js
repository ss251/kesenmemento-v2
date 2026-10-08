// Skid ribbon. One mesh, a ring of quads, positions rewritten in place. Tyre smoke is race/smoke.js.
import * as THREE from 'three';

const MAX = 96;

export function createSkids(ctx) {
  const pos = new Float32Array(MAX * 12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = new Uint32Array(MAX * 6);
  for (let i = 0; i < MAX; i++) {
    const b = i * 4, o = i * 6;
    idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2;
    idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x24262e, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'play-skid';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  // [mobile-play] hidden until the first mark: an empty ribbon still made its program in every phone's start view
  mesh.visible = false;
  ctx.noOutline?.(mesh);
  ctx.add(mesh);

  const prev = { on: false, lx: 0, lz: 0, rx: 0, rz: 0 };
  let cursor = 0, filled = 0;
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }

  function write(i, y, ax, az, bx, bz, cx, cz, dx, dz) {
    const o = i * 12;
    pos[o] = ax; pos[o + 1] = y; pos[o + 2] = az;
    pos[o + 3] = bx; pos[o + 4] = y; pos[o + 5] = bz;
    pos[o + 6] = cx; pos[o + 7] = y; pos[o + 8] = cz;
    pos[o + 9] = dx; pos[o + 10] = y; pos[o + 11] = dz;
  }

  function ribbon(i, y, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * 0.09, pz = dx / len * 0.09;
    const yy = y + 0.04;
    write(i, yy, x0 + px, z0 + pz, x0 - px, z0 - pz, x1 - px, z1 - pz, x1 + px, z1 + pz);
  }

  return {
    mesh,
    /** Rear-axle contact patch, world metres. `mark` is false to break the ribbon (a gap, or reduced motion). */
    step(lx, lz, rx, rz, y, mark) {
      if (!mark || reduced) { prev.on = false; return; }
      if (prev.on) {
        const gap = Math.hypot(lx - prev.lx, lz - prev.lz);
        if (gap < 4 && gap > 0.04) {
          const n = (cursor + 1) % MAX;
          ribbon(cursor, y, prev.lx, prev.lz, lx, lz);
          ribbon(n, y, prev.rx, prev.rz, rx, rz);
          cursor = (cursor + 2) % MAX;
          if (filled < MAX) filled = Math.min(MAX, filled + 2);
          geo.attributes.position.needsUpdate = true;
          geo.setDrawRange(0, filled * 6);
          mesh.visible = true;
        } else if (gap >= 4) {
          prev.on = false;
        }
      }
      prev.lx = lx; prev.lz = lz; prev.rx = rx; prev.rz = rz; prev.on = true;
    },
  };
}

/** World-space rear contact points. Writes into `out` = {lx,lz,rx,rz}. */
const patch = { lx: 0, lz: 0, rx: 0, rz: 0 };
export function rearPatch(x, z, yaw, out = patch) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const bx = x - fx * 1.23, bz = z - fz * 1.23;
  out.lx = bx - rx * 0.55; out.lz = bz - rz * 0.55;
  out.rx = bx + rx * 0.55; out.rz = bz + rz * 0.55;
  return out;
}
