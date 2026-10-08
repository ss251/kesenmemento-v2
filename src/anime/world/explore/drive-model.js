// Slip-based bicycle for the kei car (PLAY-DESIGN-2 §E). Pure: no three.js, no allocations when `out` is the
// same object as `s`. The town's old kinematic step still runs below LOW_U so reverse and the first metres
// match the v4 contract; above that the tyres make the yaw.
//
// Frame (same as drive.js): yaw 0 faces north (−Z). Positive steer is a right turn, yaw decreases, yawRate > 0
// is clockwise. u is forward speed (m/s), vLat is sideways speed to the car's right.

export const LOW_U = 2.55;
export const PEAK_SLIP = 8 * Math.PI / 180;
export const PEAK_MU = 0.62;          // ~6.1 m/s², the town's old lateral cap
export const SLIDE_MU = 0.36;
export const SLIP_FALLOFF = 18 * Math.PI / 180;
export const HAND_BRAKE_REAR = 0.35;
export const ASSIST_MAX = 0.55;       // added to the −1..1 steer, never past full lock
export const ASSIST_SLIP = 6 * Math.PI / 180;
export const SUBSTEP = 1 / 120;

export const CAR = {
  wheelbase: 2.46, halfW: 0.74, radius: 1.15,
  vMax: 11.1, vBoost: 16.7, vRev: 3.5,
  acc: 3.2, brake: 7.5, drag: 0.9, steerMax: 0.62,
};

/** Race mode: 110 km/h, boost included. Street stays on CAR (40 / 60 km/h). */
export const RACE = { ...CAR, vMax: 110 / 3.6, vBoost: 110 / 3.6 };

const MASS = 720;
const G = 9.81;
const CG_H = 0.48;
const INERTIA = 860;
const GEARS = [2.45, 1.7, 1.18, 0.8];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Signed friction coefficient. Peaks at 8° of slip, then falls toward the sliding value. Positive slip → negative μ. */
export function lateralMu(slip) {
  const a = slip < 0 ? -slip : slip;
  if (a === 0) return 0;
  const sign = slip < 0 ? -1 : 1;
  let mag;
  if (a <= PEAK_SLIP) mag = PEAK_MU * Math.sin((a / PEAK_SLIP) * Math.PI * 0.5);
  else {
    const t = Math.min(1, (a - PEAK_SLIP) / SLIP_FALLOFF);
    const e = t * t * (3 - 2 * t);
    mag = PEAK_MU + (SLIDE_MU - PEAK_MU) * e;
  }
  return -sign * mag;
}

/** Lateral tyre force (newtons). `scale` is 1, or HAND_BRAKE_REAR on the rear axle while the lever is in. */
export function lateralForce(slip, normal, scale = 1) {
  return lateralMu(slip) * normal * scale;
}

/**
 * Assisted counter-steer, in the same −1..1 units as the stick.
 * Opposes yawRate once the rear is sliding. 0 when disabled, when the slide is small, or when the
 * player is already at full lock that way (their input wins).
 */
export function counterSteer(playerSteer, yawRate, slipR, enabled) {
  if (!enabled) return 0;
  const slip = slipR < 0 ? -slipR : slipR;
  if (slip < ASSIST_SLIP) return 0;
  const gate = Math.min(1, (slip - ASSIST_SLIP) / ASSIST_SLIP);
  let add = -yawRate * 0.42 * gate;
  if (add > ASSIST_MAX) add = ASSIST_MAX;
  else if (add < -ASSIST_MAX) add = -ASSIST_MAX;
  const room = add > 0 ? 1 - playerSteer : 1 + playerSteer;
  if (room <= 0) return 0;
  if (add > room) add = room;
  else if (add < -room) add = -room;
  return add;
}

function steerAngle(o, input, h, C) {
  const u = Math.abs(o.u ?? o.speed ?? 0);
  const lock = C.steerMax * (1 - 0.62 * Math.min(1, u / C.vBoost));
  const player = clamp(input.steer || 0, -1, 1);
  const add = counterSteer(player, o.yawRate || 0, o.slipR || 0, !!input.counterSteer);
  const cmd = clamp(player + add, -1, 1);
  const target = cmd * lock;
  o.steer = (o.steer || 0) + (target - (o.steer || 0)) * Math.min(1, h * 6);
  return o.steer;
}

/** The v4 kinematic bicycle, written into `o`. Used under LOW_U and in reverse. */
function kinematic(o, input, h, C) {
  const vTop = input.boost ? C.vBoost : C.vMax;
  let v = o.u ?? o.speed ?? 0;
  const th = input.throttle || 0;
  if (input.brake) v -= Math.sign(v) * Math.min(Math.abs(v), C.brake * 1.3 * h);
  else if (th > 0) v = v < -0.05 ? Math.min(0, v + C.brake * h) : Math.min(vTop, v + C.acc * th * (1 - Math.max(0, v) / (vTop * 1.15)) * h);
  else if (th < 0) v = v > 0.05 ? Math.max(0, v - C.brake * h) : Math.max(-C.vRev, v + C.acc * 0.7 * th * h);
  else v -= Math.sign(v) * Math.min(Math.abs(v), (C.drag + Math.abs(v) * 0.04) * h);
  const steer = steerAngle(o, input, h, C);
  const cap = 6 / Math.max(0.5, Math.abs(v));
  const yawRate = clamp((v / C.wheelbase) * Math.tan(steer), -cap, cap);
  const yaw = o.yaw - yawRate * h;
  o.x -= Math.sin(yaw) * v * h;
  o.z -= Math.cos(yaw) * v * h;
  o.yaw = yaw;
  o.speed = v;
  o.u = v;
  o.vLat = 0;
  o.yawRate = yawRate;
  o.slipF = 0;
  o.slipR = 0;
  o.ax = 0;
}

function dynamic(o, input, h, C) {
  const vTop = input.boost ? C.vBoost : C.vMax;
  const steer = steerAngle(o, input, h, C);
  let u = o.u;
  const v = o.vLat || 0;
  const w = o.yawRate || 0;
  const th = input.throttle || 0;
  let u2;
  if (input.brake) {
    const dec = C.brake * 1.3 * h;
    u2 = Math.abs(u) <= dec ? 0 : u - Math.sign(u) * dec;
  } else if (th > 0) {
    const ax = u < -0.05 ? C.brake : C.acc * th * (1 - Math.max(0, u) / (vTop * 1.15));
    u2 = u + ax * h;
  } else if (th < 0) {
    u2 = u > 0.05 ? u - C.brake * h : u + C.acc * 0.7 * th * h;
  } else {
    const dec = (C.drag + Math.abs(u) * 0.04) * h;
    u2 = Math.abs(u) <= dec ? 0 : u - Math.sign(u) * dec;
  }
  if (u2 > vTop) u2 = vTop;
  else if (u2 < -C.vRev) u2 = -C.vRev;
  const ax = (u2 - u) / h;

  const lf = C.wheelbase * 0.48;
  const lr = C.wheelbase - lf;
  let nf = MASS * G * (lr / C.wheelbase) - MASS * ax * (CG_H / C.wheelbase);
  let nr = MASS * G * (lf / C.wheelbase) + MASS * ax * (CG_H / C.wheelbase);
  const floor = 0.12 * MASS * G;
  if (nf < floor) nf = floor;
  if (nr < floor) nr = floor;
  const sum = nf + nr;
  nf *= (MASS * G) / sum;
  nr *= (MASS * G) / sum;

  const denom = Math.max(0.6, u);
  const slipF = Math.atan2(v + w * lf, denom) - steer;
  const slipR = Math.atan2(v - w * lr, denom);
  const rear = input.brake ? HAND_BRAKE_REAR : 1;
  const Fyf = lateralForce(slipF, nf, 1);
  const Fyr = lateralForce(slipR, nr, rear);
  const yawAcc = (Fyf * lf - Fyr * lr) / INERTIA;
  const slipDrag = (Math.abs(Fyf) + Math.abs(Fyr)) * 0.012 / MASS;

  u2 -= slipDrag * h;
  if (u2 > vTop) u2 = vTop;
  else if (u2 < -C.vRev) u2 = -C.vRev;
  let v2 = v + ((Fyf + Fyr) / MASS - u * w) * h;
  let w2 = w + yawAcc * h;
  // a still car doesn't creep sideways from a leftover rate
  if (Math.abs(u2) < 0.15 && !th) { v2 = 0; w2 = 0; u2 = 0; }

  const yaw = o.yaw - w2 * h;
  o.x += (-Math.sin(o.yaw) * u2 + Math.cos(o.yaw) * v2) * h;
  o.z += (-Math.cos(o.yaw) * u2 - Math.sin(o.yaw) * v2) * h;
  o.yaw = yaw;
  o.u = u2;
  o.speed = u2;
  o.vLat = v2;
  o.yawRate = w2;
  o.slipF = slipF;
  o.slipR = slipR;
  o.ax = ax;
}

function gears(o) {
  let g = o.gear || 1;
  if (g < 1) g = 1;
  if (g > 4) g = 4;
  const rpm = 850 + Math.abs(o.u || 0) * GEARS[g - 1] * 210;
  let shift = 0;
  if (g < 4 && rpm > 5800) { g += 1; shift = 1; }
  else if (g > 1 && rpm < 2300 && Math.abs(o.u || 0) > 1) { g -= 1; shift = 1; }
  o.gear = g;
  o.rpm = 850 + Math.abs(o.u || 0) * GEARS[g - 1] * 210;
  o.shift = shift;
}

function skidFlag(o, input, h) {
  const slide = Math.abs(o.slipR || 0) > PEAK_SLIP && Math.abs(o.u || 0) > 3;
  const hb = !!input.brake && Math.abs(o.u || 0) > 2.4 && Math.abs(o.steer || 0) > 0.08;
  o.skid = slide || hb ? 1 : 0;
  o.driftStep = o.skid ? Math.abs(o.slipR || 0) * Math.abs(o.u || 0) * h : 0;
}

function prepare(s, out) {
  if (out && out !== s) {
    out.x = s.x; out.z = s.z; out.yaw = s.yaw;
    out.speed = s.speed || 0; out.steer = s.steer || 0;
    out.u = s.u ?? s.speed ?? 0; out.vLat = s.vLat || 0; out.yawRate = s.yawRate || 0;
    out.slipF = s.slipF || 0; out.slipR = s.slipR || 0;
    out.gear = s.gear || 1; out.rpm = s.rpm || 850;
    out.shift = 0; out.skid = 0; out.driftStep = 0; out.ax = 0;
    return out;
  }
  if (out) {
    if (out.u == null) out.u = out.speed || 0;
    if (out.vLat == null) out.vLat = 0;
    if (out.yawRate == null) out.yawRate = 0;
    if (out.gear == null) out.gear = 1;
    out.shift = 0; out.driftStep = 0;
    return out;
  }
  return {
    x: s.x, z: s.z, yaw: s.yaw, speed: s.speed || 0, steer: s.steer || 0,
    u: s.u ?? s.speed ?? 0, vLat: s.vLat || 0, yawRate: s.yawRate || 0,
    slipF: s.slipF || 0, slipR: s.slipR || 0, gear: s.gear || 1, rpm: s.rpm || 850,
    shift: 0, skid: 0, driftStep: 0, ax: 0,
  };
}

function circleHits(x, z, yaw, radius, hit) {
  if (hit(x, z)) return true;
  const fx = -Math.sin(yaw) * radius, fz = -Math.cos(yaw) * radius;
  if (hit(x + fx, z + fz) || hit(x - fx, z - fz)) return true;
  if (hit(x + fz, z - fx) || hit(x - fz, z + fx)) return true;
  return false;
}

/** True if the body crosses a solid anywhere along the step, not only at the end (a thin wall). */
function segmentHits(x0, z0, yaw0, x1, z1, yaw1, radius, hit) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(dist / 0.04));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (circleHits(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw0 + (yaw1 - yaw0) * t, radius, hit)) return true;
  }
  return false;
}

/**
 * One step. `out` optional (defaults to a new object). `hit(x, z)` optional: true inside a solid.
 * When the body circle would cross a solid, the step stops on the near side and sheds the speed into the wall.
 * Fixed 1/120 s substeps, so a 1/60 s game step and a 0.05 s test step stay stable, and a thin wall
 * cannot be jumped at race speed.
 */
export function carStep(s, input, dt, C = CAR, out = null, hit = null) {
  const o = prepare(s, out);
  if (!(dt > 0)) return o;
  let left = dt;
  while (left > 1e-8) {
    const h = left > SUBSTEP ? SUBSTEP : left;
    const x0 = o.x, z0 = o.z, yaw0 = o.yaw, u0 = o.u, v0 = o.vLat, w0 = o.yawRate, st0 = o.steer;
    if ((o.u ?? 0) < LOW_U) kinematic(o, input, h, C);
    else dynamic(o, input, h, C);
    if (hit && segmentHits(x0, z0, yaw0, o.x, o.z, o.yaw, C.radius, hit)) {
      const restore = () => {
        o.x = x0; o.z = z0; o.yaw = yaw0; o.u = u0; o.speed = u0; o.vLat = v0; o.yawRate = w0; o.steer = st0;
      };
      restore();
      let lo = 0, hi = h;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) * 0.5;
        if ((o.u ?? 0) < LOW_U) kinematic(o, input, mid, C);
        else dynamic(o, input, mid, C);
        if (segmentHits(x0, z0, yaw0, o.x, o.z, o.yaw, C.radius, hit)) hi = mid;
        else lo = mid;
        restore();
      }
      if (lo > 1e-4) {
        if ((o.u ?? 0) < LOW_U) kinematic(o, input, lo, C);
        else dynamic(o, input, lo, C);
      }
      o.u = 0; o.speed = 0; o.vLat = 0; o.yawRate = 0;
      left = 0;
    } else left -= h;
  }
  gears(o);
  skidFlag(o, input, dt);
  return o;
}
