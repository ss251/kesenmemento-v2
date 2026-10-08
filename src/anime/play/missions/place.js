// [play:missions] Where a person can stand and still be seen. Sampled, not a raycast:
// the engine has no ray API (PLAY-DESIGN). Trees and solids are tested every half metre
// from the approach, and from the two places the talk camera can sit.

export const SAMPLE_STEP = 0.5;
export const APPROACH = 4;

const SHIFTS = [
  [0, 0],
  [1.4, 0], [-1.4, 0],
  [2.8, 0], [-2.8, 0],
  [0, 1.8], [1.6, 1.8], [-1.6, 1.8],
  [0, 3.2], [2.8, 2.4], [-2.8, 2.4],
  [4.2, 1.2], [-4.2, 1.2],
  [1.4, 4.2], [-1.4, 4.2],
];

/**
 * Where a person's feet go at (x, z): the highest walkable top a walker could step onto there (a quay deck, a promenade,
 * a pier or a ramp: physics.groundHeight, the player's own rule) when it is at most `reach` m above the terrain, else the
 * terrain. People used the terrain alone, so the oyster farmer on the 南町 promenade (terrain 1.45 m, deck 2.92 m) stood
 * waist-deep in it. A roof or an upper floor is out of reach; a broken or missing physics falls back to the terrain.
 */
export function standHeight(x, z, groundAt, physics, reach = 3) {
  const g = groundAt(x, z);
  if (!physics || typeof physics.groundHeight !== 'function') return g;
  try {
    const h = physics.groundHeight(x, z, g + reach);
    return Number.isFinite(h) && h > g ? h : g;
  } catch {
    return g;
  }
}

/** True when a sample along the segment hits a blocker. The ends themselves are not tested. */
export function sightBlocked(ax, az, bx, bz, y, sample, step = SAMPLE_STEP) {
  if (!sample) return false;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.8) return false;
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (sample(ax + dx * t, az + dz * t, y)) return true;
  }
  return false;
}

/**
 * Can you walk up to this spot and still see the face, from the front and from at least
 * one side of the two-shot? `sample(x, z, y)` is true inside a tree or a solid.
 */
export function readable(x, z, y, yaw, sample) {
  if (!standingClear(x, z, y, sample)) return false;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const lx = -fz, lz = fx;
  const ax = x + fx * APPROACH, az = z + fz * APPROACH;
  if (sightBlocked(ax, az, x, z, y + 1.55, sample)) return false;
  const px = x + fx * 2.2, pz = z + fz * 2.2;
  const mx = (px + x) * 0.5, mz = (pz + z) * 0.5;
  const head = y + 1.45;
  const left = !sightBlocked(mx + lx * 2.6, mz + lz * 2.6, x, z, head, sample);
  const right = !sightBlocked(mx - lx * 2.6, mz - lz * 2.6, x, z, head, sample);
  return left || right;
}

/** The body, not just the centre point. A street-tree collider is only 0.25 m across; the trunk drawn on top of it is wider, and so is a person. */
export function standingClear(x, z, y, sample) {
  if (sample(x, z, y + 1.05) || sample(x, z, y + 1.55)) return false;
  const chest = y + 1.2;
  const R = 0.48;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    if (sample(x + Math.cos(a) * R, z + Math.sin(a) * R, chest)) return false;
  }
  return true;
}

/**
 * Slide along the facing until the approach and one camera side are clear.
 * Yaw stays: they still face the way you walk up. If the street ahead is busy
 * but the person is standing inside a trunk, the first clear patch of ground wins.
 */
export function clearStance(npc, sample, groundY) {
  const yaw = npc.yaw || 0;
  const y0 = npc.y || 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let escape = null;
  for (let i = 0; i < SHIFTS.length; i++) {
    const s = SHIFTS[i][0], f = SHIFTS[i][1];
    const x = npc.x + rx * s + fx * f;
    const z = npc.z + rz * s + fz * f;
    const y = groundY ? groundY(x, z) : y0;
    if (!standingClear(x, z, y, sample)) continue;
    if (!escape && (s !== 0 || f !== 0)) escape = { x, z, y, yaw, moved: true };
    if (readable(x, z, y, yaw, sample)) {
      return { x, z, y, yaw, moved: s !== 0 || f !== 0 };
    }
  }
  if (!standingClear(npc.x, npc.z, y0, sample) && escape) return escape;
  return { x: npc.x, z: npc.z, y: y0, yaw, moved: false };
}
