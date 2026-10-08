// [play] Third-person boom. The orbit sits 4.5 m behind, 1.6 m up, pitched −8°,
// shoulder 0.35 m. Walls shorten it: sample a solid predicate along the segment.
// The follow is critically damped (~0.12 s). No allocation on the hot path.

export const THIRD = {
  dist: 4.5,
  height: 1.6,
  pitch: -8 * Math.PI / 180,
  shoulder: 0.35,
  tau: 0.12,
  boomStep: 0.12,
  boomMin: 0.42,
  boomRadius: 0.18,
  groundClear: 0.3,
  hide: 0.7,
};

const _damp = { x: 0, v: 0 };

/** Critically damped spring. Writes `out.x` and `out.v`. */
export function damp1(x, v, target, dt, omega, out) {
  if (!(dt > 0) || !Number.isFinite(omega) || omega > 80) { out.x = target; out.v = 0; return out; }
  const ox = x - target;
  const exp = Math.exp(-omega * dt);
  const n = (v + omega * ox) * dt;
  out.x = target + (ox + n) * exp;
  out.v = (v - omega * n) * exp;
  return out;
}

/** Look target and the ideal camera. `out` holds tx,ty,tz (target) and x,y,z (camera). */
export function desiredCam(feetX, feetY, feetZ, yaw, out, C = THIRD) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  out.tx = feetX + rx * C.shoulder;
  out.ty = feetY + C.height;
  out.tz = feetZ + rz * C.shoulder;
  const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
  out.x = out.tx - fx * C.dist * cp;
  out.z = out.tz - fz * C.dist * cp;
  out.y = out.ty - C.dist * sp;
  return out;
}

function blocked(solidAt, groundAt, x, y, z, C) {
  if (groundAt) {
    const g = groundAt(x, z);
    const m = C && C.groundClear > 0 ? C.groundClear : 0.3;
    if (Number.isFinite(g) && y < g + m) return true;
  }
  return !!(solidAt && solidAt(x, y, z));
}

function sphereHit(solidAt, groundAt, x, y, z, px, pz, radius, C) {
  if (blocked(solidAt, groundAt, x, y, z, C)) return true;
  if (solidAt && solidAt(x, y + 0.24, z)) return true;
  if (radius > 0) {
    if (blocked(solidAt, groundAt, x + px * radius, y, z + pz * radius, C)) return true;
    if (blocked(solidAt, groundAt, x - px * radius, y, z - pz * radius, C)) return true;
    if (blocked(solidAt, null, x, y + radius * 0.85, z, C)) return true;
  }
  return false;
}

/** Walk the boom from the look target toward the ideal camera. Stops at the first solid sample. */
export function solveBoom(from, to, solidAt, groundAt, out, C = THIRD) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  out.x = from.x; out.y = from.y; out.z = from.z; out.dist = 0;
  if (!(len > 1e-4)) return out;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const px = -uz, pz = ux;
  const step = C.boomStep;
  let reach = 0;
  let hit = false;
  for (let d = step; d <= len + 1e-4; d += step) {
    const s = Math.min(d, len);
    const x = from.x + ux * s, y = from.y + uy * s, z = from.z + uz * s;
    if (sphereHit(solidAt, groundAt, x, y, z, px, pz, C.boomRadius, C)) { hit = true; break; }
    reach = s;
    if (s >= len - 1e-4) break;
  }
  if (!hit && reach < len - 1e-3) reach = len;
  if (reach <= 0) reach = Math.min(0.08, len);
  out.x = from.x + ux * reach;
  out.y = from.y + uy * reach;
  out.z = from.z + uz * reach;
  out.dist = reach;
  return out;
}

export function createChaseState() {
  return { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: 0, ready: false, dist: 0 };
}

/** Put the smoothed camera on a known point (a mode change) so the next frame eases from there. */
export function seedChase(st, x, y, z) {
  st.x = x; st.y = y; st.z = z;
  st.vx = st.vy = st.vz = 0;
  st.ready = true;
  return st;
}

/** Raise a short boom, stopping at the first solid (a door lintel, a stair soffit). [feel] Under C.liftAt (2.4 m on the 4.5 m boom,
 *  scaled with a shorter rig: thirdFor), 0.45 m for each metre lost. */
export function liftBoom(solved, solidAt, groundAt, C = THIRD) {
  const at = C.liftAt ?? 2.4;
  if (!(solved.dist < at)) return solved;
  const y1 = solved.y + (at - solved.dist) * 0.45;
  const step = 0.1;
  let y = solved.y;
  for (let ny = solved.y + step; ny <= y1 + 1e-4; ny += step) {
    const yy = ny > y1 ? y1 : ny;
    if (sphereHit(solidAt, groundAt, solved.x, yy, solved.z, 1, 0, C.boomRadius, C)) break;
    y = yy;
  }
  solved.y = y;
  return solved;
}

/** True when the straight path between two camera points crosses a solid. */
export function pathBlocked(x0, y0, z0, x1, y1, z1, solidAt, groundAt, C = THIRD) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0.08)) return false;
  const step = C.boomStep > 0 ? C.boomStep : 0.12;
  const n = Math.min(28, Math.ceil(len / step));
  const px = -dz / len, pz = dx / len;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (sphereHit(solidAt, groundAt, x0 + dx * t, y0 + dy * t, z0 + dz * t, px, pz, C.boomRadius, C)) return true;
  }
  return false;
}

/** Smooth `st` toward `target`. `snap` (reduced motion, a still) lands on it. */
export function follow(st, target, dt, omega, snap) {
  if (snap || !st.ready || !(dt > 0)) {
    st.x = target.x; st.y = target.y; st.z = target.z;
    st.vx = st.vy = st.vz = 0; st.ready = true; st.dist = target.dist || 0;
    return st;
  }
  damp1(st.x, st.vx, target.x, dt, omega, _damp); st.x = _damp.x; st.vx = _damp.v;
  damp1(st.y, st.vy, target.y, dt, omega, _damp); st.y = _damp.x; st.vy = _damp.v;
  damp1(st.z, st.vz, target.z, dt, omega, _damp); st.z = _damp.x; st.vz = _damp.v;
  st.dist = target.dist || 0;
  return st;
}

const _want = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
const _solved = { x: 0, y: 0, z: 0, dist: 0 };
const _from = { x: 0, y: 0, z: 0 };

/**
 * One chase sample. `solidAt(x, y, z)` and `groundAt(x, z)` are world predicates
 * (physics.solidAt is (x, z, y); the caller wraps it). If the smoothed point
 * is inside a wall, the camera snaps to the solved point.
 */
export function placeChase(st, feetX, feetY, feetZ, yaw, dt, solidAt, groundAt, snap, C = THIRD) {
  desiredCam(feetX, feetY, feetZ, yaw, _want, C);
  _from.x = _want.tx; _from.y = _want.ty; _from.z = _want.tz;
  solveBoom(_from, _want, solidAt, groundAt, _solved, C);
  // A short boom rises, so a wall fills the view from above the head. The rise stops under a lintel.
  liftBoom(_solved, solidAt, groundAt, C);
  // The walker's short boom looks a little lower, so the body stays in frame under a lintel.
  // The gull passes its own rig (no groundClear) and keeps the look height it asked for.
  if (C.groundClear) {
    const u = _solved.dist > 2.4 ? 1 : _solved.dist / 2.4;
    _want.ty = feetY + 0.9 + 0.7 * u;
  }
  const was = st.ready;
  const ox = st.x, oy = st.y, oz = st.z;
  follow(st, _solved, dt, 1 / C.tau, snap);
  const inside = solidAt && solidAt(st.x, st.y, st.z);
  const crossed = was && !snap && pathBlocked(ox, oy, oz, st.x, st.y, st.z, solidAt, groundAt, C);
  if (inside || crossed) {
    st.x = _solved.x; st.y = _solved.y; st.z = _solved.z;
    st.vx = st.vy = st.vz = 0;
    st.dist = _solved.dist;
  }
  st.tx = _want.tx; st.ty = _want.ty; st.tz = _want.tz;
  return st;
}

/** The chase owns the camera only while walking in third person. */
export function chaseOwns(player) {
  return !!player && !player.fly && player.person === 'third' && typeof player.chase === 'function';
}

// ------------------------------------------------------------------ [feel] the walker's camera (the movement-feel lane)
/**
 * The walker's rig on a portrait phone. THIRD frames him at ~22 % of a landscape or desktop picture; a portrait phone sees 88° tall
 * (core/fov.js), so the same boom left him at 12 % (measured: tools/anime/feel-probe.mjs). This closer boom, looking at his chest and
 * down 14°, frames him at ~20 % with his feet two thirds of the way down, clear of the pad and the top bar.
 */
export const THIRD_PORTRAIT = { dist: 2.6, height: 0.9, pitch: -14 * Math.PI / 180, shoulder: 0.15 };

/**
 * The walker's follow (measured offline in test/feel-camera.test.js and in the town by tools/anime/feel-probe.mjs):
 * - the boom's origin tracks his feet with their own velocity fed forward (a critically damped spring at 24 /s only on what the velocity
 *   does not explain): a steady walk trails by 5 cm, a run by 11, and a stop leaves the camera still within 0.05 s, 8 mm later, with no
 *   catch-up and no overshoot (a lead that moved the camera overshot a stop by 0.23 m and came back);
 * - its height follows on a softer spring (9 /s), so kerbs and stairs never shake the picture;
 * - the look-ahead turns the view toward where he is going: 0.14 s of travel, at most ~10° of the view (0.176 × the boom), built on a
 *   slow spring (4 /s) and let go on a quicker one (12 /s), so it never swings on a reversal;
 * - the boom length eases in quickly (20 /s) and out slowly (4 /s) toward the clear distance and is clamped to it the moment a wall comes
 *   between (never a view through a wall);
 * - beside a wall the shoulder offset is pulled in toward his column (14 /s in, 4 /s back out), probed 1.5x out so it starts early.
 */
export const WALK = { wXZ: 24, wY: 9, ff: true, lead: 0.14, leadAngle: 0.176, leadLook: true, wLeadUp: 4, wLeadDown: 12, wIn: 20, wOut: 4, wSide: 14, wRise: 12, shortLook: 0.9 };

const _rig = { aspect: NaN };
/** The rig for a screen of this aspect: THIRD from square up, THIRD_PORTRAIT at 1:2 and taller, in between linearly. Cached per aspect. */
export function thirdFor(aspect, out = _rig) {
  if (out.aspect === aspect) return out;
  const a = Number.isFinite(aspect) ? aspect : 16 / 9;
  const u = a >= 1 ? 0 : a <= 0.5 ? 1 : (1 - a) / 0.5;
  for (const k in THIRD) out[k] = THIRD[k];
  out.dist = THIRD.dist + (THIRD_PORTRAIT.dist - THIRD.dist) * u;
  out.height = THIRD.height + (THIRD_PORTRAIT.height - THIRD.height) * u;
  out.pitch = THIRD.pitch + (THIRD_PORTRAIT.pitch - THIRD.pitch) * u;
  out.shoulder = THIRD.shoulder + (THIRD_PORTRAIT.shoulder - THIRD.shoulder) * u;
  out.liftAt = 2.4 * out.dist / THIRD.dist;   // a boom shorter than this rises (liftBoom), as 2.4 m does on the 4.5 m boom
  out.aspect = aspect;
  return out;
}

export function createWalkCam() {
  return { ready: false, sx: 0, sy: 0, sz: 0, vx: 0, vy: 0, vz: 0, lx: 0, lz: 0, lvx: 0, lvz: 0, sk: 1, skV: 0, boom: 0, boomV: 0, rise: 0, riseV: 0,
    x: 0, y: 2, z: 0, tx: 0, ty: 0, tz: 0, dist: 0 };
}

const _w = { x: 0, v: 0 };
const _wFrom = { x: 0, y: 0, z: 0 }, _wWant = { x: 0, y: 0, z: 0 }, _wHard = { x: 0, y: 0, z: 0, dist: 0 }, _wCam = { x: 0, y: 0, z: 0, dist: 0 };

/** Track (pos, vel) toward a target moving at `V`: predict at its own speed, then damp the error and the speed difference. Writes _w. */
function trackFF(pos, vel, T, V, dt, w) {
  damp1(pos + vel * dt - T, vel - V, 0, dt, w, _w);
  _w.x += T; _w.v += V;
  return _w;
}

/**
 * One walker camera sample. `f` is the player's frame { x, y, z (drawn feet), vx, vz, dt, landing }; `yaw` the view's heading; `solidAt`
 * and `groundAt` as for placeChase; `snap` lands on the target (reduced motion, a still, a placed pose); C = thirdFor(aspect).
 * Writes st.x/y/z (camera), st.tx/ty/tz (look point) and st.boom.
 */
export function placeWalk(st, f, yaw, solidAt, groundAt, snap, C = THIRD, W = WALK) {
  const dt = f.dt > 0 ? f.dt : 0;
  const hard = snap || !st.ready || !(dt > 0);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  // the look-ahead: where he is going, eased (a landing has none)
  let ax = f.landing ? 0 : (f.vx || 0) * W.lead, az = f.landing ? 0 : (f.vz || 0) * W.lead;
  const leadMax = W.leadMax ?? (W.leadAngle ?? 0) * C.dist;
  const al = Math.hypot(ax, az); if (al > leadMax) { const q = leadMax > 0 ? leadMax / al : 0; ax *= q; az *= q; }
  if (hard) { st.lx = ax; st.lz = az; st.lvx = st.lvz = 0; }
  else {   // it builds slowly as he gets going and lets go quickly when he slows (no long drift after a stop)
    const wl = ax * ax + az * az > st.lx * st.lx + st.lz * st.lz ? W.wLeadUp : W.wLeadDown;
    damp1(st.lx, st.lvx, ax, dt, wl, _w); st.lx = _w.x; st.lvx = _w.v;
    damp1(st.lz, st.lvz, az, dt, wl, _w); st.lz = _w.x; st.lvz = _w.v;
  }
  // the boom's origin: his feet + the shoulder (+ the lead when it moves the camera). Beside a wall the offset is pulled in toward his own
  // column, eased (in quickly, out slowly), from a probe 1.5x out so the ease has room: it never snaps across, and it never starts inside
  // the wall (a snapped origin jumped the picture 0.35 m sideways on the kerb route)
  const Ty = f.y + C.height;
  const ox = rx * C.shoulder + (W.leadLook ? 0 : st.lx), oz = rz * C.shoulder + (W.leadLook ? 0 : st.lz);
  let kWant = 1;
  if (solidAt && (ox !== 0 || oz !== 0)) {
    if (solidAt(f.x + ox * 1.5, Ty, f.z + oz * 1.5)) kWant = solidAt(f.x + ox * 0.75, Ty, f.z + oz * 0.75) ? (solidAt(f.x + ox * 0.35, Ty, f.z + oz * 0.35) ? 0 : 0.25) : 0.5;
  }
  if (hard || !(st.sk >= 0)) { st.sk = kWant; st.skV = 0; }
  else { damp1(st.sk, st.skV || 0, kWant, dt, kWant < st.sk ? W.wSide : W.wOut, _w); st.sk = _w.x; st.skV = _w.v; }
  if (solidAt && st.sk > 0 && solidAt(f.x + ox * st.sk, Ty, f.z + oz * st.sk)) { st.sk = Math.min(st.sk, kWant); st.skV = 0; }   // (rare: the wall came faster than the ease)
  const Tx = f.x + ox * st.sk, Tz = f.z + oz * st.sk;
  const Vx = (f.vx || 0) + (W.leadLook ? 0 : st.lvx * st.sk), Vz = (f.vz || 0) + (W.leadLook ? 0 : st.lvz * st.sk);
  if (hard || f.landing) { st.sx = Tx; st.sy = Ty; st.sz = Tz; st.vx = Vx; st.vy = 0; st.vz = Vz; }
  else if (W.ff === false) {
    damp1(st.sx, st.vx, Tx, dt, W.wXZ, _w); st.sx = _w.x; st.vx = _w.v;
    damp1(st.sz, st.vz, Tz, dt, W.wXZ, _w); st.sz = _w.x; st.vz = _w.v;
    damp1(st.sy, st.vy, Ty, dt, W.wY, _w); st.sy = _w.x; st.vy = _w.v;
  } else {
    trackFF(st.sx, st.vx, Tx, Vx, dt, W.wXZ); st.sx = _w.x; st.vx = _w.v;
    trackFF(st.sz, st.vz, Tz, Vz, dt, W.wXZ); st.sz = _w.x; st.vz = _w.v;
    damp1(st.sy, st.vy, Ty, dt, W.wY, _w); st.sy = _w.x; st.vy = _w.v;
  }
  // the boom: from the look point back along the view, solved against walls and the ground (from his own column if the smoothed point
  // is inside a solid)
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
  if (solidAt && solidAt(st.sx, st.sy, st.sz)) { st.sx = f.x; st.sz = f.z; st.vx = Vx; st.vz = Vz; }
  _wFrom.x = st.sx; _wFrom.y = st.sy; _wFrom.z = st.sz;
  _wWant.x = st.sx - fx * C.dist * cp; _wWant.y = st.sy - C.dist * sp; _wWant.z = st.sz - fz * C.dist * cp;
  solveBoom(_wFrom, _wWant, solidAt, groundAt, _wHard, C);
  if (hard) { st.boom = _wHard.dist; st.boomV = 0; }
  else {
    damp1(st.boom, st.boomV, _wHard.dist, dt, _wHard.dist < st.boom ? W.wIn : W.wOut, _w); st.boom = _w.x; st.boomV = _w.v;
    if (st.boom > _wHard.dist) { st.boom = _wHard.dist; if (st.boomV > 0) st.boomV = 0; }   // a wall came between: never through it
  }
  const len = C.dist > 1e-6 ? C.dist : 1, k = st.boom / len;
  _wCam.x = st.sx + (_wWant.x - st.sx) * k; _wCam.y = st.sy + (_wWant.y - st.sy) * k; _wCam.z = st.sz + (_wWant.z - st.sz) * k;
  _wCam.dist = st.boom;
  // a short boom rises over his head (a door, a stair), eased, and never into a ceiling
  const y0 = _wCam.y;
  liftBoom(_wCam, solidAt, groundAt, C);
  const riseTo = _wCam.y - y0;
  if (hard) { st.rise = riseTo; st.riseV = 0; }
  else {
    damp1(st.rise, st.riseV, riseTo, dt, W.wRise, _w); st.rise = _w.x; st.riseV = _w.v;
    if (st.rise > riseTo) { st.rise = riseTo; if (st.riseV > 0) st.riseV = 0; }
  }
  st.x = _wCam.x; st.y = y0 + st.rise; st.z = _wCam.z;
  if (solidAt && solidAt(st.x, st.y, st.z)) { st.x = _wHard.x; st.y = _wHard.y; st.z = _wHard.z; st.boom = _wHard.dist; st.boomV = 0; st.rise = 0; st.riseV = 0; }
  // the look point: lower for a short boom (his body stays in frame under a lintel); a gull's own rig never comes here
  const u = st.boom >= (C.liftAt ?? 2.4) ? 1 : st.boom / (C.liftAt ?? 2.4);
  const look = Math.min(C.height, W.shortLook + (C.height - W.shortLook) * u);
  st.tx = st.sx + (W.leadLook ? st.lx : 0); st.ty = st.sy - C.height + look; st.tz = st.sz + (W.leadLook ? st.lz : 0);
  st.dist = st.boom;
  st.ready = true;
  return st;
}
