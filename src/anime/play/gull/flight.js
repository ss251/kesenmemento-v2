// [play] A bird, not a drone. Glide sinks 1.2 m/s at 11 m/s. A flap adds lift and
// speed on a cooldown. Pitch down dives (clamped at 28 m/s). Pull up trades
// speed for height. Bank ±45° turns. Below 6 m/s the nose drops; the bird never
// crashes. Mutates `st`. Allocates nothing.

export const GULL = {
  glideSpeed: 11,
  glideSink: 1.2,
  maxSpeed: 28,
  stall: 6,
  flapBoost: 2.6,
  flapLift: 3.4,
  flapWindow: 0.26,
  flapCd: 0.38,
  bankMax: Math.PI / 4,
  pitchRate: 1.55,
  bankRate: 2.4,
  drag: 0.42,
  bankDrag: 0.55,
  g: 9.81,
  perchSpeed: 7.2,
  perchDist: 4.2,
  flareH: 2.8,
  skim: 0.45,
  pitchMin: -1.15,
  pitchMax: 0.7,
};

export function gullState(x, y, z, yaw = 0) {
  return {
    x, y, z, yaw, pitch: 0, roll: 0,
    speed: GULL.glideSpeed, vy: -GULL.glideSink,
    flapT: 0, flapCd: 0, flapped: false,
    perched: false, agl: 99, flaring: false,
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * `input`: { pitch, bank, flap, perch, launch, lookYaw, lookPitch } in -1..1
 * except the look deltas, which are radians this step.
 * `world`: { floor(x, z), solid(x, y, z), perch: { x, y, z, d, ok } }.
 */
export function gullStep(st, input, dt, world) {
  const G = GULL;
  const inp = input || _zero;
  const w = world || _none;
  st.flapped = false;
  if (!(dt > 0)) return st;

  if (st.perched) {
    st.speed = 0; st.vy = 0; st.roll = 0; st.pitch *= 0.9; st.agl = 0; st.flaring = false;
    if (inp.launch || inp.flap) {
      st.perched = false;
      st.speed = 8.6;
      st.vy = 2.6;
      st.pitch = 0.22;
      st.flapT = G.flapWindow;
      st.flapCd = G.flapCd;
      st.flapped = true;
    }
    return st;
  }

  st.yaw += inp.lookYaw || 0;
  st.pitch += inp.lookPitch || 0;
  const pitchIn = clamp(inp.pitch || 0, -1, 1);
  const bankIn = clamp(inp.bank || 0, -1, 1);
  st.pitch += pitchIn * G.pitchRate * dt;
  const wantRoll = bankIn * G.bankMax;
  st.roll += (wantRoll - st.roll) * Math.min(1, G.bankRate * dt);
  st.pitch = clamp(st.pitch, G.pitchMin, G.pitchMax);
  st.roll = clamp(st.roll, -G.bankMax, G.bankMax);

  st.flapCd = Math.max(0, st.flapCd - dt);
  st.flapT = Math.max(0, st.flapT - dt);
  if (inp.flap && st.flapCd <= 0) {
    st.flapCd = G.flapCd;
    st.flapT = G.flapWindow;
    st.speed = Math.min(G.maxSpeed, st.speed + G.flapBoost);
    st.flapped = true;
  }

  const floor = w.floor ? w.floor(st.x, st.z) : -1e9;
  const agl = st.y - (Number.isFinite(floor) ? floor : -1e9);
  st.agl = agl;
  const perch = w.perch;
  const perchClose = !!(perch && perch.ok && perch.d < 7.5 && st.speed < 13);

  st.flaring = false;
  if (st.speed < G.stall) {
    const target = -0.55;
    st.pitch += (target - st.pitch) * Math.min(1, 3.4 * dt);
    st.speed += 1.6 * dt;
  } else if ((agl < G.flareH && st.vy < -0.45) || perchClose) {
    // Landing flare: nose up, wings will follow, speed bleeds back toward a glide.
    st.flaring = true;
    const want = 0.38;
    st.pitch += (want - st.pitch) * Math.min(1, 2.8 * dt);
    st.pitch = clamp(st.pitch, G.pitchMin, G.pitchMax);
    const bleed = G.glideSpeed * 0.85;
    if (st.speed > bleed) st.speed += (bleed - st.speed) * Math.min(1, 0.9 * dt);
  }

  const lifting = st.flapT > 0;
  const drag = G.drag * (st.speed - G.glideSpeed) + G.bankDrag * Math.abs(st.roll) * (st.speed / G.glideSpeed);
  st.speed += (-G.g * Math.sin(st.pitch) - drag) * dt;
  if (st.speed < 0) st.speed = 0;
  if (st.speed > G.maxSpeed) st.speed = G.maxSpeed;

  if (st.speed > 0.8) st.yaw += Math.tan(st.roll) * G.g / st.speed * dt;

  const sink = lifting ? 0 : G.glideSink * (G.glideSpeed / Math.max(st.speed, 0.5));
  st.vy = st.speed * Math.sin(st.pitch) - sink + (lifting ? G.flapLift : 0);

  const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
  const nx = st.x + fx * st.speed * dt;
  const nz = st.z + fz * st.speed * dt;
  let ny = st.y + st.vy * dt;

  const skim = (Number.isFinite(floor) ? floor : -1e9) + G.skim;
  if (ny < skim) { ny = skim; if (st.vy < 0) st.vy = 0; if (st.pitch < -0.15) st.pitch = -0.05; }

  if (w.solid && w.solid(nx, ny, nz)) {
    if (st.vy < 0.4) st.vy = 0.6;
    st.speed *= 0.92;
  } else {
    st.x = nx; st.y = ny; st.z = nz;
  }

  if (inp.perch && perch && perch.ok && st.speed < G.perchSpeed) {
    const dx = perch.x - st.x, dy = perch.y - st.y, dz = perch.z - st.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < G.perchDist) {
      st.perched = true;
      st.x = perch.x; st.y = perch.y; st.z = perch.z;
      st.speed = 0; st.vy = 0; st.roll = 0; st.pitch = 0; st.agl = 0;
    }
  }
  return st;
}

const _zero = { pitch: 0, bank: 0, flap: false, perch: false, launch: false, lookYaw: 0, lookPitch: 0 };
const _none = {};

/** Wing angle for the mesh. flap 0..1 is a downstroke, flare lifts the wings for a landing. */
export function wingPose(st, reduced) {
  if (reduced) return { flap: 0, flare: st && st.perched ? 0.35 : 0 };
  if (!st || st.perched) {
    const open = !st || st.open == null ? 1 : st.open;
    return { flap: 0.05 * open, flare: 0.42 * open };
  }
  if (st.flapT > 0) {
    const u = 1 - st.flapT / GULL.flapWindow;
    return { flap: Math.sin(u * Math.PI), flare: 0 };
  }
  if (st.flaring || (st.agl < GULL.flareH && st.vy < -0.2)) return { flap: 0, flare: 0.88 };
  return { flap: 0.06, flare: 0 };
}
