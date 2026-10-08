// [play] Which clip the body is in. The mesh applies it; this file only decides.

export function wrapPi(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function easeAngle(from, to, dt, tau) {
  const d = wrapPi(to - from);
  if (!(dt > 0) || !(tau > 0)) return from + d;
  return from + d * (1 - Math.exp(-dt / tau));
}

/** idle | walk | run | jump | fall | land | turn */
export function clipOf(speed, onGround, vy, land, yawErr) {
  if (!onGround) return vy > 0.4 ? 'jump' : 'fall';
  if (land > 0) return 'land';
  if (speed < 0.35 && Math.abs(yawErr) > 0.45) return 'turn';
  if (speed > 4.6) return 'run';
  if (speed > 0.35) return 'walk';
  return 'idle';
}

/** A custom character's setPose has idle, walk, run, jump, fall. Land and turn rest on idle.
 *  The live walker uses setPose('auto') so the model's own animator sees speed and the landing. */
export function characterPose(clip) {
  if (clip === 'land' || clip === 'turn') return 'idle';
  return clip;
}

/** Third-person speeds for a custom character, m/s. The original walker keeps 3.1 / 6.4 (walk3 and run3 stay null). */
export const CHARACTER_SPEED = Object.freeze({ walk: 1.5, run: 3.0 });

/** CHARACTER_SPEED unless ?speed= says otherwise. `?speed=0` (or any non-positive walk) gives the walker's speeds (null, null). */
export function speedFrom(search) {
  let raw = null;
  try { raw = new URLSearchParams(search || '').get('speed'); } catch (e) { raw = null; }
  if (raw === null || raw === '') return { walk: CHARACTER_SPEED.walk, run: CHARACTER_SPEED.run };
  const [w, r] = String(raw).split(',').map(Number);
  if (!(w > 0)) return { walk: null, run: null };
  return { walk: w, run: r > 0 ? r : CHARACTER_SPEED.run * w / CHARACTER_SPEED.walk };
}

/** The original walker's proportion (height 1.62 / the rig's 1.58). */
export const WALKER_K = 1.62 / 1.58;
const STANCE = 1.15;

/** Half the planted foot's local-Z travel. Longer steps as speed rises, still within the leg. */
export function footAmp(speed, k = WALKER_K) {
  const base = 0.36 * k * 1.8 * 0.34;
  const stretch = Math.min(0.14 * k, Math.max(0, speed - 1.1) * 0.038);
  return base + stretch;
}

/** Metres the body travels while one foot is planted. */
export function stanceTravel(speed, k = WALKER_K) {
  return 2 * footAmp(speed, k);
}

/** Left foot plus right foot, in metres. Phase advances by 2 across one cycle. */
export function cycleLength(speed, k = WALKER_K) {
  return stanceTravel(speed, k) * (2 / STANCE);
}

/** Phase units per second. One cycle is 2. */
export function phaseRate(speed, k = WALKER_K) {
  if (!(speed > 0.3)) return 0;
  const per = cycleLength(speed, k) / 2;
  return per > 1e-4 ? speed / per : 0;
}

export function stepPhase(phase, speed, dt, k = WALKER_K) {
  if (!(dt > 0)) return phase;
  return phase + phaseRate(speed, k) * dt;
}

/** Local foot speed plus body speed during the plant. Zero means the sole is not sliding. */
export function plantMatch(speed, k = WALKER_K) {
  const A = footAmp(speed, k);
  const rate = phaseRate(speed, k);
  const footVz = -2 * A * (rate / STANCE);
  return footVz + speed;
}

export function gaitPhase(dist, speed, k = WALKER_K) {
  const v = typeof speed === 'number' ? speed : (speed === 'run' ? 6 : 1.6);
  const per = cycleLength(v, k) / 2;
  return dist / per;
}

/** Roll into a turn, radians. yawRate is radians per second. The sign matches the original rig. */
export function turnLean(yawRate) {
  if (!yawRate) return 0;
  const r = -yawRate * 0.055;
  return r < -0.22 ? -0.22 : r > 0.22 ? 0.22 : r;
}

/** Whole-body lean for a custom character. 6° is a pose of the root, not a deformed part. */
export const LEAN_MAX = 6 * Math.PI / 180;
export const BODY_BOB = 0.04;
export const LEAN_TAU = 0.18;

export function characterTurnLean(yawRate) {
  const r = turnLean(yawRate);
  return r < -LEAN_MAX ? -LEAN_MAX : r > LEAN_MAX ? LEAN_MAX : r;
}

/** Ease a scalar toward a target. A still frame lands on the target. */
export function easeScalar(from, to, dt, tau) {
  if (!(dt > 0) || !(tau > 0)) return to;
  return from + (to - from) * (1 - Math.exp(-dt / tau));
}

/**
 * Soft landing dip, metres, translation only. Peaks at −4 cm halfway through
 * `dur` and is 0 at both ends. Never a scale.
 */
export function landBob(land, dur) {
  if (!(land > 0) || !(dur > 0)) return 0;
  const u = land / dur > 1 ? 1 : land / dur;
  return -BODY_BOB * Math.sin(u * Math.PI);
}

/** Place a custom character's root. Yaw, then a roll into the turn. Scale stays 1. */
export function placeCharacterRoot(root, x, y, z, yaw, lean, bob) {
  const max = LEAN_MAX;
  const rz = lean > max ? max : lean < -max ? -max : (lean || 0);
  const dy = bob > BODY_BOB ? BODY_BOB : bob < -BODY_BOB ? -BODY_BOB : (bob || 0);
  root.position.set(x, y + dy, z);
  root.rotation.order = 'YZX';
  root.rotation.set(0, yaw, rz);
  if (root.scale && root.scale.set) root.scale.set(1, 1, 1);
  return root;
}

/** Landing squash for the original rig. `land` counts down from `dur`. Feet stay on the ground (scale about the origin). */
export function landSquash(land, dur, out) {
  const o = out || { y: 1, xz: 1 };
  if (!(land > 0) || !(dur > 0)) { o.y = 1; o.xz = 1; return o; }
  const u = land / dur > 1 ? 1 : land / dur;
  const s = u * u;
  o.y = 1 - 0.18 * s;
  o.xz = 1 + 0.08 * s;
  return o;
}
