// [play] One pool. Typed arrays only, so a burst never allocates.
// Slots 0..pinCount-1 are reserved (the charm glints). The rest are sparks,
// rings and the finale. `data` is xyz+kind, `style` is rgb+scale, both
// Float32Arrays the mesh reads directly.

export const KIND_DISC = 0;
export const KIND_RING = 1;
export const KIND_STAR = 2;
export const KIND_STREAK = 3;
/** Screen-facing collectible glint. Drawn by the outlined pass, not the additive one. */
export const KIND_GLINT = 4;
/** Bright-pass knee opens at threshold 1.05 − 0.5. Stay under that so a sprite stays a sprite. */
export const BLOOM_MAX = 0.54;
/**
 * Sparkle stars (a pickup, the motes): 6–14 CSS px, drawn with a 紺 edge and a
 * pale core up to STAR_MAX. That is still under the bright-pass threshold
 * (1.05), and a 14 px star cannot sum into a ball (normal blending).
 */
export const STAR_MAX = 0.9;
export const STAR_PX = 14;

export function createSim(n) {
  return {
    n,
    alive: new Uint8Array(n),
    pin: new Uint8Array(n),
    life: new Float32Array(n),
    max: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    vz: new Float32Array(n),
    grav: new Float32Array(n),
    grow: new Float32Array(n),
    base: new Float32Array(n),
    cursor: 0,
    seed: 0x6ac1f00d,
  };
}

export function pinRange(sim, count) {
  const c = Math.max(0, Math.min(sim.n, count | 0));
  for (let i = 0; i < c; i++) sim.pin[i] = 1;
  sim.cursor = c % sim.n;
  return c;
}

/** Mulberry, in place. Returns 0..1. */
export function rnd(sim) {
  sim.seed = (sim.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(sim.seed ^ (sim.seed >>> 15), 1 | sim.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** `tail` (s, optional): a streak's length is the distance it covers in `tail` seconds (a comet), not its scale. */
export function emit(sim, data, style, x, y, z, vx, vy, vz, life, scale, kind, r, g, b, grav, grow, extra, tail = 0) {
  const n = sim.n;
  for (let k = 0; k < n; k++) {
    const i = (sim.cursor + k) % n;
    if (sim.pin[i] || sim.alive[i]) continue;
    sim.cursor = (i + 1) % n;
    sim.alive[i] = 1;
    sim.life[i] = life;
    sim.max[i] = life > 0 ? life : 0.001;
    sim.vx[i] = vx;
    sim.vy[i] = vy;
    sim.vz[i] = vz;
    sim.grav[i] = grav;
    sim.grow[i] = grow;
    sim.base[i] = scale;
    const p = i * 4;
    data[p] = x;
    data[p + 1] = y;
    data[p + 2] = z;
    data[p + 3] = kind;
    style[p] = r;
    style[p + 1] = g;
    style[p + 2] = b;
    style[p + 3] = scale;
    if (extra) {
      extra[p] = vx;
      extra[p + 1] = vy;
      extra[p + 2] = vz;
      extra[p + 3] = tail;
    }
    return i;
  }
  return -1;
}

export function writePin(data, style, i, x, y, z, scale, kind, r, g, b) {
  const p = i * 4;
  data[p] = x;
  data[p + 1] = y;
  data[p + 2] = z;
  data[p + 3] = kind;
  style[p] = r;
  style[p + 1] = g;
  style[p + 2] = b;
  style[p + 3] = scale;
}

/** Integrate. Returns how many slots are showing. */
export function stepSim(sim, data, style, dt, extra) {
  const d = dt > 0 && dt < 0.1 ? dt : 0.016;
  let live = 0;
  const n = sim.n;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (sim.pin[i]) {
      if (style[p + 3] > 0.001) live++;
      continue;
    }
    if (!sim.alive[i]) continue;
    sim.life[i] -= d;
    if (sim.life[i] <= 0) {
      sim.alive[i] = 0;
      style[p + 3] = 0;
      continue;
    }
    sim.vy[i] -= sim.grav[i] * d;
    data[p] += sim.vx[i] * d;
    data[p + 1] += sim.vy[i] * d;
    data[p + 2] += sim.vz[i] * d;
    const u = sim.life[i] / sim.max[i];
    const grown = 1 + sim.grow[i] * (1 - u);
    style[p + 3] = sim.base[i] * grown * Math.min(1, u * 4);
    if (extra) {
      extra[p] = sim.vx[i];
      extra[p + 1] = sim.vy[i];
      extra[p + 2] = sim.vz[i];
    }
    live++;
  }
  return live;
}
