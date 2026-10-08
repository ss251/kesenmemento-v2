// [play] Two to four gulls in a loose formation beside the player, not a ring.
// They ease in from a little further out, then hold their places with a slow wander.

const HOME = [
  { side: 2.3, back: 0.7, up: 0.45 },
  { side: 3.5, back: 1.7, up: 1.05 },
  { side: -2.6, back: 1.2, up: 0.62 },
  { side: 4.3, back: 0.35, up: 1.35 },
];

export function makeFlock(n = 3) {
  const count = Math.max(2, Math.min(4, n | 0 || 3));
  const birds = [];
  for (let i = 0; i < count; i++) {
    const h = HOME[i];
    birds.push({
      side: h.side, back: h.back, up: h.up,
      ph: i * 1.7, inn: 0,
      x: 0, y: 0, z: 0, yaw: 0, roll: 0,
    });
  }
  return birds;
}

/** Mutates each bird toward a spot beside `lead` ({ x, y, z, yaw }). Reduced motion freezes the wander and shows them in place. */
export function flockStep(birds, lead, dt, reduced) {
  if (!birds || !lead) return birds;
  const yaw = lead.yaw || 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  for (let i = 0; i < birds.length; i++) {
    const b = birds[i];
    if (reduced || !(dt > 0)) b.inn = 1;
    else {
      b.ph += dt * (0.7 + i * 0.08);
      b.inn = Math.min(1, b.inn + dt * 0.85);
    }
    const sway = reduced ? 0 : Math.sin(b.ph) * 0.5;
    const lift = reduced ? 0 : Math.sin(b.ph * 0.8) * 0.22;
    const j = b.inn;
    const spread = (1 - j) * 5.5;
    const side = b.side + sway + spread * (b.side < 0 ? -1 : 1);
    b.x = lead.x - fx * b.back + rx * side;
    b.z = lead.z - fz * b.back + rz * side;
    b.y = lead.y + b.up + lift + (1 - j) * 1.4;
    b.yaw = yaw;
    b.roll = reduced ? 0 : Math.sin(b.ph) * 0.18;
  }
  return birds;
}
