// [ship] Sail mode: take the helm of 第一昭福丸 (58.6 m tuna longliner, 7KFY) from the コの字岸壁 out under かなえ大橋 to
// the bay mouth (ship/route.js OUTBOUND). Ship handling is a pure, tested model (boatStep + resolveShore):
//   - surge with inertia: an engine order that lags, thrust against quadratic + linear drag, no brakes (reverse the
//     engine to stop), astern thrust ~30 % of ahead;
//   - a rate-limited rudder, a first-order (Nomoto) yaw response whose rate scales with speed (a ship turns on a circle
//     of roughly fixed size whatever her speed: tactical diameter ~3.5 LOA), a little sideslip outward in a turn, and
//     a little speed lost while turning;
//   - 12 kn (6.2 m/s), her service speed rounded from 12.3 kn (JASNAOE SOY 2020). Playtests 2026-10-08: the old 6 kn harbour
//     pace was too slow for kids. "boost" is TIME COMPRESSION (x4): the whole model runs four times faster, so she
//     covers the bay at an apparent 48 kn but turns on the same circle and keeps the same feel;
//   - the shore: L.shoreDist (signed distance to the coastline, + at sea) sampled at the bow, the stern and the beam
//     corners; she slides along a quay, never through it, and loses speed on contact.
// Chase camera and the touch stick are copied from explore/drive.js. Autopilot (pure pursuit on OUTBOUND) takes over
// when you let go (8 s idle: underway, against a bank or stalled by one) and hands back the moment you touch the
// controls; left on a bank, it backs her off astern before going ahead again (pursue's recovery). If the back-and-fill
// has not freed her after AUTO.towAfter (45) sim seconds more than 60 m off the line, the tow-assist puts her back on
// it (state.towed counts them), so she can never be left stuck.
//
// Keys (while sailing): W / S or the arrows up / down move the engine order (it stays where you leave it: a ship's
// telegraph), X stops the engine, A / D or left / right put the rudder over (it returns to midships when released),
// Shift holds the x4 time compression, P toggles the autopilot, Esc leaves. Touch (ui/touchpad.js, the 'sail' mode that
// ship/padmode.js registers): the pad's analog stick (up/down = order, left/right = rudder), the 停止 / 自動操船 / 4× /
// 町へ戻る buttons; a drag on the right looks around the chase camera through player.lookSink (radians, from the pad).
//
//   const sail = createSail(ctx, { ship, route })   ship = buildShofukumaru(...) result (or omitted: a 58.6 x 9.2 m stand-in)
//   sail.enter(at?) / sail.exit() / sail.active / sail.state / sail.setAutopilot(on) / sail.focus() / sail.onEvent(cb)
//   events: { type: 'passKanae' | 'passMirai' | 'passShoko' | 'bayMouth' | 'arrived', s, x, z, t }
//
// Conventions: world +X east, -Z north, metres. `yaw` = the ship group's rotation.y (bow along (sin yaw, cos yaw));
// a starboard turn (rudder > 0) DEcreases yaw. Ship local frame: origin on the centreline at the waterline at midship
// (s = 29.3 m aft of the stem), local +Z = forward, starboard = local -X, port = local +X.
import * as THREE from 'three';
import * as L from '../layout.js';
import { damp, lerp, lerpAngle } from '../../core/timestep.js';   // [smooth]
import { OUTBOUND_PATH, BERTH, KANAE_CROSSING, SHOKO, MIRAI, BAY_MOUTH, makePath, SHIP_DIMS } from '../ship/route.js';
import { KANAE } from '../harbor/real.js';
import { KATSUO, KATSUO_SAMPLES } from '../ship/boat-params.js';   // [ippon] the second boat's handling
import { HELD_R } from '../../ui/holdkey.js';   // [r-hold]
import { mouseLook, lookBlocked } from '../../ui/look-settings.js';

export const KN = 0.514444;   // m/s per knot

/** Ship handling constants (sources in the comments; the "game" values are tuned to the real ones' proportions). */
export const BOAT = {
  L: SHIP_DIMS.loa, B: SHIP_DIMS.beam,
  vMax: 12 * KN,         // 6.17 m/s. Service speed is 12.3 kn (JASNAOE SOY 2020); 12 kn is the playtest pace (playtests 2026-10-08)
  accel: 2.15,           // m/s^2 from rest at full ahead: 0 -> 90 % of 12 kn in ~8 s (playtests 2026-10-08)
  coast: 0.26,           // m/s^2 of drag at vMax. Ahead thrust eases from accel down to this, so she still settles at vMax and coasts with the engine stopped (no brakes)
  astern: 0.3,           // astern thrust / ahead thrust (fixed-pitch propeller going astern)
  linDrag: 0.012,        // 1/s: lets her come to rest instead of coasting forever on the quadratic drag
  turnDrag: 0.25,        // speed lost per rad/s of yaw rate (a ship slows in a turn)
  engineLag: 1.2,        // s: the engine order takes effect (playtests 2026-10-08; was 3 s at the 6 kn pace)
  rudderRate: 0.45,      // full rudder (35 deg) from midships in ~2.2 s (game; SOLAS asks 35 -> -30 deg in 28 s)
  R0: 96,                // m: steady turning radius at full rudder; with the yaw lag the tactical diameter is ~3.5 LOA
  Tn: 5.0,               // s: yaw (Nomoto T) time constant for a ~50 m Lpp hull
  slip: 0.12,            // rad: drift angle at full rudder (the stern swings out)
  slipLag: 4.0,          // s
  boostX: 4,             // time compression for the bay transit
  tcRate: 0.8,           // 1/s: how fast the time compression eases in and out
  margin: 2.0,           // m: the closest any hull sample point gets to the shoreline (fenders)
  friction: 2.5,         // 1/s: speed lost while rubbing along a quay
};

/** Hull sample points [lateral x (port +), forward z] in metres from midship at the waterline (stem at +29.3). */
export const HULL_SAMPLES = (() => {
  const h = SHIP_DIMS.beam / 2, F = SHIP_DIMS.loa / 2;
  const pts = [[0, F], [0, -F]];
  for (const [w, z] of [[h * 0.62, F - 6], [h, F - 18], [h, 0], [h, -18], [h * 0.82, -F + 1.5]]) pts.push([w, z], [-w, z]);
  return pts;
})();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt, tau) => Math.min(1, dt / Math.max(1e-6, tau));

/** A fresh sail state at a pose. */
export function boatState(x = BERTH.x, z = BERTH.z, yaw = BERTH.yaw) {
  return { x, z, yaw, u: 0, v: 0, r: 0, rudder: 0, eng: 0, tc: 1, contact: 0 };
}

/**
 * One step of the ship model (pure). s: { x, z, yaw, u (surge m/s), v (sway m/s, + to port), r (yaw rate rad/s,
 * + = turning to starboard), rudder (-1..1, + = starboard), eng (engine order, lagged), tc (time compression) }.
 * input: { throttle -1..1 (the engine order), rudder -1..1, boost bool }. Speeds in the state are physical (knots
 * through the water); with tc = 4 the world moves four times faster.
 */
export function boatStep(s, input, dt, P = BOAT) {
  const tc = s.tc + ((input.boost ? P.boostX : 1) - s.tc) * Math.min(1, dt * P.tcRate);
  const h = dt * tc;   // model time this frame
  const order = clamp(input.throttle || 0, -1, 1);
  const eng = s.eng + (order - s.eng) * ease(h, P.engineLag);
  // Ahead thrust is `accel` at rest and eases to `coast` at vMax. Drag ahead matches `coast`, so full ahead settles at
  // exactly vMax and cutting the engine still coasts. Astern keeps the strong drag (from `accel`) so reverse settles
  // near sqrt(astern) of vMax, and X plus astern can stop her (playtests 2026-10-08). `coast` defaults to `accel`.
  const coast = P.coast ?? P.accel;
  const kq = (s.u >= 0 ? coast : P.accel) - P.linDrag * P.vMax;
  const kqq = kq / (P.vMax * P.vMax);
  const fade = P.vMax > 0 ? clamp(s.u / P.vMax, 0, 1) : 1;
  const ahead = coast + (P.accel - coast) * (1 - fade);
  const thrust = eng >= 0 ? eng * ahead : eng * P.accel * P.astern;
  let u = s.u + (thrust - kqq * s.u * Math.abs(s.u) - P.linDrag * s.u - P.turnDrag * Math.abs(s.r) * s.u) * h;
  if (Math.abs(u) < 1e-4 && Math.abs(thrust) < 1e-4) u = 0;
  const want = clamp(input.rudder || 0, -1, 1);
  const rudder = s.rudder + clamp(want - s.rudder, -P.rudderRate * h, P.rudderRate * h);
  const rss = (u / P.R0) * rudder;                    // steady yaw rate: proportional to speed (fixed turning circle)
  const r = s.r + (rss - s.r) * ease(h, P.Tn);
  const vss = P.slip * u * rudder;                    // drift: the hull moves out of the turn (to port in a starboard turn)
  const v = s.v + (vss - s.v) * ease(h, P.slipLag);
  const yaw = wrap(s.yaw - r * h);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const x = s.x + (sy * u + cy * v) * h, z = s.z + (cy * u - sy * v) * h;
  return { ...s, x, z, yaw, u, v, r, rudder, eng, tc, contact: Math.max(0, (s.contact || 0) - dt) };
}

/** World positions of the hull samples for a pose. */
export function hullPoints(s, samples = HULL_SAMPLES) {
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  // local x (port) -> world (cos yaw, -sin yaw); local z (forward) -> world (sin yaw, cos yaw)
  return samples.map(([lx, lz]) => [s.x + cy * lx + sy * lz, s.z - sy * lx + cy * lz]);
}
/** The smallest shoreDist over the hull samples, and which one. */
export function hullClearance(s, shoreDist = L.shoreDist, samples = HULL_SAMPLES) {
  let d = Infinity, k = -1;
  const pts = hullPoints(s, samples);
  for (let i = 0; i < pts.length; i++) { const v = shoreDist(pts[i][0], pts[i][1]); if (v < d) { d = v; k = i; } }
  return { d, k, pts };
}

/**
 * Keep the hull off the shore (pure). `prev` is a valid pose (every sample >= P.margin from the shoreline), `next`
 * the proposed one. Violating samples push the ship out along the shoreDist gradient; the velocity into the shore is
 * removed and the rest scrubbed by friction (she slides along). If the push cannot fix it, she stays at `prev`, stopped.
 * Invariant: the returned pose is >= P.margin everywhere whenever `prev` was.
 */
export function resolveShore(prev, next, dt, shoreDist = L.shoreDist, P = BOAT, samples) {
  const use = samples || P.samples || HULL_SAMPLES;
  let c = hullClearance(next, shoreDist, use);
  if (c.d >= P.margin) return next;
  const out = { ...next };
  let nx = 0, nz = 0;
  for (let it = 0; it < 6 && c.d < P.margin; it++) {
    const [px, pz] = c.pts[c.k], e = 1.5;
    let gx = shoreDist(px + e, pz) - shoreDist(px - e, pz), gz = shoreDist(px, pz + e) - shoreDist(px, pz - e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-6) break;
    gx /= gl; gz /= gl; nx += gx; nz += gz;
    const push = P.margin - c.d + 0.05;
    out.x += gx * push; out.z += gz * push;
    c = hullClearance(out, shoreDist, use);
  }
  if (!(c.d >= P.margin)) return { ...prev, u: 0, v: 0, r: 0, contact: 0.5 };
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const sy = Math.sin(out.yaw), cy = Math.cos(out.yaw);
  let wx = sy * out.u + cy * out.v, wz = cy * out.u - sy * out.v;
  const into = wx * nx + wz * nz;
  if (into < 0) { wx -= nx * into; wz -= nz * into; }
  const k = Math.max(0, 1 - P.friction * dt);
  wx *= k; wz *= k;
  out.u = wx * sy + wz * cy; out.v = wx * cy - wz * sy; out.r *= 0.5; out.contact = 0.5;
  return out;
}

/**
 * boatStep + resolveShore. A step longer than half the fender margin (full ahead at 12 kn, or x4) is split, so she
 * cannot jump through a quay. `samples` defaults to the longliner's hull.
 */
export function sailStep(s, input, dt, shoreDist = L.shoreDist, P = BOAT, samples) {
  const tc = Math.max(s.tc || 1, input?.boost ? P.boostX : 1);
  const travel = Math.abs(s.u || 0) * dt * tc;
  const limit = Math.max(0.45, (P.margin || 2) * 0.5);
  const n = travel > limit ? Math.min(12, Math.ceil(travel / limit)) : 1;
  if (n <= 1) return resolveShore(s, boatStep(s, input, dt, P), dt, shoreDist, P, samples);
  const sub = dt / n;
  let cur = s;
  for (let i = 0; i < n; i++) cur = resolveShore(cur, boatStep(cur, input, sub, P), sub, shoreDist, P, samples);
  return cur;
}

/** Per-boat handling. `shofuku` is BOAT itself (the voyage). `katsuo` is the lighter pole-and-line boat. */
export const BOATS = { shofuku: BOAT, katsuo: KATSUO };
export const BOAT_SAMPLES = { shofuku: HULL_SAMPLES, katsuo: KATSUO_SAMPLES };
export { KATSUO };

// ------------------------------------------------------------------------------------------------ autopilot (pure)
export const AUTO = {
  straightUntil: 80,    // m along the route: rudder midships until the stern is clear of the quay's SE corner
  slowUntil: 70,        // m along the route: slow ahead while she comes off the quay
  boostFrom: 260,       // m: the x4 time compression from here (clear of the send-off) ...
  boostEndBefore: 450,  // ... until this far before the end of the route
  window: [-60, 400],   // projection window around the last progress (no jumping between legs)
  stuckFor: 2,          // s stuck on a bank before backing off it
  clearBy: 12,          // m beyond the fender margin before going ahead again
  roomToTurn: 30,       // m beyond the fender margin: room to turn ahead even while still pointing away
  backMax: 45,          // s: the longest a backing run lasts
  towAfter: 45,         // sim s of back-and-fill or repeated contact, more than towXte off the line, before the tow-assist
  towXte: 60,           // m: the cross-track error the tow-assist needs
  towGrace: 20,         // s: a gap in the trouble shorter than this does not reset the tow clock
  towSpeed: 1.5,        // m/s: her way after the tow
};
/**
 * Pure pursuit on a path: steer toward the point `Ld` ahead of the ship's projection. Returns { throttle, rudder,
 * boost, s (progress), xte (cross-track m), rec }. `progress` = the last returned s (keeps the projection local).
 *
 * Recovery (pure: the memory goes in as `rec` and comes back as the result's `rec`; pass `dt` for its timers). Pure
 * pursuit only goes ahead and its yaw rate scales with speed, so with her bow on a bank it would hold her there. When
 * she has been stuck for more than `A.stuckFor` s (in contact, or the engine ahead at under 0.3 m/s), near the shore
 * and pointing more than 0.6 rad off the look-ahead point, she goes full astern with the rudder at +sign(alpha) (going
 * astern that swings the bow toward the line) until she is `A.clearBy` m off the shore and within 0.5 rad of the
 * point (or `A.roomToTurn` m off it, room to turn ahead: a back-and-fill), then resumes ahead. A backing run is capped at `A.backMax` s (the stern may find a bank too).
 */
export function pursue(path, s, progress = 0, P = BOAT, A = AUTO, rec = null, dt = 0, shoreDist = L.shoreDist, out = null) {
  const q = path.project(s.x, s.z, Math.max(0, progress + A.window[0]), progress + A.window[1]);
  const vWorld = Math.abs(s.u) * (s.tc || 1);
  // 70 m + 7 s of way: the 6 kn tune. Its cap was 200 m (16 s at the old x4). At 12 kn the same 7 s of way
  // is a longer look, and the cap scales so x4 (~25 m/s) is not stuck on an 8 s preview (playtests 2026-10-08).
  const Ld = clamp(70 + vWorld * 7, 70, 280);
  const [tx, tz] = path.at(q.s + Ld);
  const alpha = wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw);
  // curvature to reach the look-ahead point; yaw rises with a port turn (rudder < 0): rudder = -kappa * R0
  const kappa = (2 * Math.sin(alpha)) / Ld;
  // [B1] the straight, slow start applies only on the quay's own line: lost 100-300 m off it near the start (the
  // projection window lets s fall back under straightUntil), she steers and recovers like anywhere else
  const nearQuay = q.s < A.straightUntil && Math.abs(q.d) < 40;
  const rudder = nearQuay ? 0 : clamp(-kappa * P.R0 * 1.3, -1, 1);
  const left = path.len - q.s;
  let throttle = q.s < A.slowUntil && Math.abs(q.d) < 40 ? 0.45 : 1;
  if (left < 160) throttle = left < 30 ? 0 : 0.35;
  const boost = q.s > A.boostFrom && left > A.boostEndBefore;
  const xte = q.d * (q.side || 1);
  // ---- recovery off a bank. `out` and `rec` are reused by the fishing run so a frame allocates nothing.
  const ret = out || {};
  const r0 = rec || { stuck: 0, backing: false, backT: 0 };
  const fill = (th, ru, bo, stuck, backing, backT) => {
    r0.stuck = stuck; r0.backing = backing; r0.backT = backT;
    ret.throttle = th; ret.rudder = ru; ret.boost = bo; ret.s = q.s; ret.xte = xte; ret.rec = r0;
    return ret;
  };
  const off = !nearQuay && left > 30;   // never off the quay (she starts slow there) or at the end
  if (!off) return fill(throttle, rudder, boost, 0, false, 0);
  const clear = r0.backing || r0.stuck > 0 || s.contact > 0 ? hullClearance(s, shoreDist).d : Infinity;
  if (r0.backing) {
    const backT = r0.backT + dt;
    // off once clear and pointing at the line; or, still pointing away, once there is room to turn ahead (back and fill)
    const done = (clear > P.margin + A.clearBy && Math.abs(alpha) < 0.5) || clear > P.margin + A.roomToTurn || backT > A.backMax;
    if (!done) return fill(-1, Math.sign(alpha) || 1, false, 0, true, backT);
    return fill(throttle, rudder, boost, 0, false, 0);
  }
  const stuckNow = s.contact > 0 || (throttle > 0 && Math.abs(s.u) < 0.3);
  const stuck = stuckNow ? r0.stuck + dt : 0;
  if (stuck > A.stuckFor && Math.abs(alpha) > 0.6 && clear < P.margin + A.clearBy) {
    return fill(-1, Math.sign(alpha) || 1, false, 0, true, 0);
  }
  return fill(throttle, rudder, boost, stuck, false, 0);
}

// ------------------------------------------------------------------------------------------------ events (pure)
const KLINE = makePath(KANAE.line);
function crossesKanae(ax, az, bx, bz) {
  const P = KLINE.pts;
  for (let j = 1; j < P.length; j++) {
    const [cx, cz] = P[j - 1], [dx, dz] = P[j];
    const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(den) < 1e-12) continue;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return KLINE.acc[j - 1] + Math.hypot(dx - cx, dz - cz) * u;
  }
  return null;
}
/**
 * Route events between two poses (pure): returns the newly fired event types given the latched set `fired`.
 * passKanae: the hull crossed the bridge axis (anywhere: the land part is over land); passMirai / passShoko: progress
 * past the landmark's abeam point while within 600 m of the route; bayMouth: inside the mouth gate; arrived: the end.
 */
export function routeEvents(prev, next, progress, fired, path = OUTBOUND_PATH) {
  const out = [];
  const fire = (type, extra = {}) => { if (!fired.has(type)) { fired.add(type); out.push({ type, s: Math.round(progress.s), x: next.x, z: next.z, ...extra }); } };
  const bs = crossesKanae(prev.x, prev.z, next.x, next.z);
  if (bs != null) fire('passKanae', { bridgeS: Math.round(bs), between: bs > KANAE.pylonS && bs < KANAE.pylonN, clearance: KANAE_CROSSING?.margin });
  const near = progress.d < 600;
  if (near && progress.s >= MIRAI.s) fire('passMirai');
  if (near && progress.s >= SHOKO.s) fire('passShoko');
  if (Math.hypot(next.x - BAY_MOUTH.x, next.z - BAY_MOUTH.z) < BAY_MOUTH.r) fire('bayMouth');
  if (fired.has('bayMouth') && (path.len - progress.s < 30 || Math.hypot(next.x - path.pts[path.pts.length - 1][0], next.z - path.pts[path.pts.length - 1][1]) < 45)) fire('arrived');
  return out;
}

// ------------------------------------------------------------------------------------------------ the runtime
export function createSail(ctx, { ship = null, route = OUTBOUND_PATH, shoreDist = null } = {}) {
  const LL = ctx.L || L, cam = ctx.camera;
  const sd = shoreDist || LL.shoreDist || L.shoreDist;
  const path = Array.isArray(route) ? makePath(route) : route;
  const phone = !!ctx.quality?.phone;
  const listeners = new Set();
  const fired = new Set();
  let boat = boatState();
  // [play:ippon] which hull is mounted, and her handling. 第一昭福丸 stays the default so the voyage is unchanged.
  let boatKind = 'shofuku';
  let hullP = BOAT;
  let held = false;
  let camHook = null;
  const boats = new Map();
  const state = {
    active: false, autopilot: true, x: boat.x, z: boat.z, yaw: boat.yaw, u: 0, kn: 0, vWorld: 0, tc: 1, rudder: 0, eng: 0,
    s: 0, xte: 0, contact: 0, events: [], idle: 0, recovering: false, towed: 0,
  };
  const orbit = { yaw: 0, pitch: -0.12, back: 0 };
  // the look drag handed over by player.js while she sails (see place())
  const lookIn = { dx: 0, dy: 0 };
  const captureLook = (dx, dy) => { lookIn.dx += dx; lookIn.dy += dy; };
  // [ship:pad] the pad's drag look arrives in radians through player.lookSink (the same hook the car's chase camera uses)
  const lookRad = { dx: 0, dy: 0 };
  const padLook = (dx, dy) => { lookRad.dx += dx; lookRad.dy += dy; };
  const pad = { stop: false, boost: false };   // touch buttons (ship/padmode.js): the 4x hold
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _ct = new THREE.Vector3();
  // [smooth] the ship one simulation step ago: present() draws her between that and the newest step
  const was = { x: 0, z: 0, yaw: 0, t: 0 };
  const keep = () => { was.x = boat.x; was.z = boat.z; was.yaw = boat.yaw; was.t = t; };
  let camInit = false, t = 0;

  // ---- the ship: the real model if given, else a stand-in box at the true size (local +Z forward, waterline y = 0)
  const S = ship || makeStandIn(ctx);
  const carrier = new THREE.Group(); carrier.name = 'sail:carrier';
  let hullG = S.group;
  carrier.add(hullG);
  ctx.add(carrier);
  boats.set('shofuku', { group: hullG, berth: BERTH });
  const wake = makeWake(ctx, { phone });
  ctx.add(wake.group);
  place(0);

  // ---- input (copied from drive.js: keys + the player's left touch stick + a drag to orbit)
  const keys = new Set();
  const input = { throttle: 0, rudder: 0, boost: false };
  let order = 0;
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!state.active) return;
      keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP' && !e.repeat) setAutopilot(!state.autopilot);
      if (e.code === 'KeyX') stopEngine();
      if (e.code === 'Escape') { if (boatKind === 'katsuo') return; exit(); }
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    let dragX = 0, dragY = 0;
    addEventListener('mousedown', (e) => { dragX = e.clientX; dragY = e.clientY; });
    addEventListener('mousemove', (e) => {
      if (!state.active || lookBlocked()) return;
      const locked = typeof document !== 'undefined' && document.pointerLockElement === ctx.renderer?.domElement;
      let d = null;
      if (locked) d = mouseLook(e.movementX || 0, e.movementY || 0);
      else if (e.buttons) { d = mouseLook(e.clientX - dragX, e.clientY - dragY, { drag: true }); dragX = e.clientX; dragY = e.clientY; }
      if (!d) return;
      orbit.yaw += d.yaw; orbit.pitch = clamp(orbit.pitch + d.pitch, -0.8, 0.3); orbit.back = 3;
    });
  }
  /** Stopped in the water with an engine order ahead and next to the shore: the player left her on a bank. */
  function stalled() { return Math.abs(boat.u) < 0.3 && hullClearance(boat, sd).d < BOAT.margin + AUTO.clearBy; }
  function takeOver() { if (state.autopilot) { state.autopilot = false; order = boat.eng; } state.idle = 0; }
  // X / 停止: the telegraph to stop, the helm taken (takeOver from the autopilot sets the order to the engine's, so zero it after), and the
  // autopilot kept off until the next helm input or 自動操船 (else it would re-engage 8 s later, while she still carries way, and run on)
  let stopHold = false;
  let guide = null;   // [ippon] an outside helm (follow the birds). A real touch clears it.
  function stopEngine() { takeOver(); order = 0; stopHold = true; }
  function readInput(dt) {
    // the stick is the pad's (player.touchMove is the same vector once the pad is attached; a bare player has none)
    const k = keys, pd = ctx.pad, tm = (pd?.active && pd.move) || ctx.playerObj?.touchMove || { x: 0, y: 0 };
    let dO = 0, rd = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) dO += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dO -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) rd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) rd += 1;
    dO -= tm.y; rd += tm.x;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') || pad.boost;
    if (pad.stop) { pad.stop = false; stopEngine(); }
    // 4x / Shift is time compression, not a helm input: holding it must not take the helm from the autopilot
    const touched = Math.abs(dO) > 0.05 || Math.abs(rd) > 0.05;
    if (guide && !touched) return { throttle: clamp(guide.throttle || 0, -1, 1), rudder: clamp(guide.rudder || 0, -1, 1), boost: !!guide.boost || boost };
    if (touched) guide = null;
    if (touched) { stopHold = false; takeOver(); } else if (!boost) state.idle += dt;
    // re-engage on idle: underway, or against a bank, or stalled (the autopilot backs her off: pursue's recovery)
    // only 第一昭福丸 hands the helm back to the outbound autopilot; a fishing boat stays with the player
    if (boatKind === 'shofuku' && !state.autopilot && !stopHold && state.idle > 8 && (Math.abs(boat.u) > 0.5 || boat.contact > 0 || stalled())) setAutopilot(true);
    order = clamp(order + dO * 0.5 * dt, -1, 1);
    return { throttle: order, rudder: clamp(rd, -1, 1), boost };
  }

  // ---- engine: a slow diesel thump (two detuned oscillators through a low-pass), level with the order
  const eng = { on: false };
  function engine() {
    const A = ctx.audio, ac = A?.context;
    if (!ac || ac.state !== 'running') return;
    if (!eng.on) {
      eng.g = ac.createGain(); eng.g.gain.value = 0; eng.lp = ac.createBiquadFilter(); eng.lp.type = 'lowpass'; eng.lp.frequency.value = 160;
      eng.o1 = ac.createOscillator(); eng.o1.type = 'sawtooth'; eng.o2 = ac.createOscillator(); eng.o2.type = 'square';
      eng.o1.connect(eng.lp); eng.o2.connect(eng.lp); eng.lp.connect(eng.g); eng.g.connect(ac.destination); eng.o1.start(); eng.o2.start(); eng.on = true;
    }
    const base = hullP.engineHz ?? 22, rise = hullP.engineRise ?? 14, harm = hullP.engineHarm ?? 1.5;
    const f = base + Math.abs(boat.eng) * rise, level = !state.active || A.muted ? 0 : 0.02 + Math.abs(boat.eng) * 0.025, now = ac.currentTime;
    eng.o1.frequency.setTargetAtTime(f, now, 0.3); eng.o2.frequency.setTargetAtTime(f * harm, now, 0.3); eng.g.gain.setTargetAtTime(level, now, 0.3);
  }

  let progress = { s: 0, d: 0 };
  let rec = null;   // the autopilot's recovery memory (pursue)
  // [B2] tow-assist: she can never be left stuck. The autopilot's back-and-fill can fail in a pocket mid harbour; after
  // AUTO.towAfter sim seconds of backing or repeated contact more than AUTO.towXte off the line, she is put back on it
  const tow = { clock: 0, last: -1e9 };
  let camEase = 0;
  function towAssist(dt) {
    const off = state.autopilot && Math.abs(progress.d) > AUTO.towXte;
    const trouble = off && (!!rec?.backing || boat.contact > 0 || Math.abs(boat.u) < 0.3);
    if (trouble) { tow.clock += dt; tow.last = t; }
    else if (off && t - tow.last < AUTO.towGrace) tow.clock += dt;
    else tow.clock = 0;
    if (tow.clock <= AUTO.towAfter) return;
    const [x, z] = path.at(progress.s), [dx, dz] = path.dirAt(progress.s);
    boat = { ...boatState(x, z, Math.atan2(dx, dz)), u: AUTO.towSpeed, tc: boat.tc };
    progress = { s: progress.s, d: 0 };
    rec = null; state.recovering = false; state.towed = (state.towed || 0) + 1;
    tow.clock = 0; tow.last = -1e9; camEase = 2.5;
  }
  /** One frame without the fixed clock (tests, tools): a step, then the ship and the camera at the newest state. */
  function update(dt) { if (step(dt)) present(dt, 1); }
  /** [smooth] One simulation step (main.js: a fixed 1/60 s): the tow assist, the helm or the autopilot, the ship model, the route. -> moved */
  function step(dt) {
    if (ctx.services.swim?.active) return false;   // [play:underwater] the boat stays put while you are the fish
    if (!state.active || dt <= 0) return false;
    keep();
    dt = Math.min(dt, 0.05); t += dt;
    if (boatKind === 'shofuku' && !held) towAssist(dt);
    let inp;
    if (held) { order = 0; inp = { throttle: 0, rudder: 0, boost: false }; rec = null; state.recovering = false; }
    else {
      const man = readInput(dt);
      inp = man;
      if (state.autopilot && boatKind === 'shofuku') {
        const ap = pursue(path, boat, progress.s, BOAT, AUTO, rec, dt, sd);
        rec = ap.rec; state.recovering = rec.backing;
        inp = { throttle: ap.throttle, rudder: ap.rudder, boost: ap.boost || man.boost };
      } else { rec = null; state.recovering = false; }
    }
    const prev = boat;
    boat = sailStep(boat, inp, dt, sd, hullP);
    const q = path.project(boat.x, boat.z, Math.max(0, progress.s + AUTO.window[0]), progress.s + AUTO.window[1]);
    progress = { s: q.s, d: q.d };
    for (const ev of routeEvents(prev, boat, progress, fired, path)) emit({ ...ev, t });
    sync();
    const pl = ctx.playerObj;
    if (pl?.pos) { pl.pos.set(boat.x, hullP.playerY ?? 6, boat.z); pl.vel?.set(0, 0, 0); pl.yaw = boat.yaw + Math.PI; }
    return true;
  }
  function sync() {
    Object.assign(state, { x: boat.x, z: boat.z, yaw: boat.yaw, u: boat.u, kn: boat.u / KN, tc: boat.tc, vWorld: boat.u * boat.tc, rudder: boat.rudder, eng: boat.eng, s: progress.s, xte: progress.d, contact: boat.contact });
  }

  /** Put the ship and the camera where she is now (entering, setPose): no blend from an older step. */
  function place(dt) { keep(); present(dt, 1); }
  /** [smooth] Draw the ship and the chase camera at this frame: alpha of the way from the step before to the newest (ctx.alpha); the
   *  camera's easing in the frame's own time, so the same at 60 and 120 Hz. */
  function present(dt, alpha = 1) {
    if (ctx.services.swim?.active) return;   // [play:underwater] the swim camera owns the frame
    const a = alpha >= 1 ? 1 : Math.max(0, alpha);
    const bx = lerp(was.x, boat.x, a), bz = lerp(was.z, boat.z, a), byaw = lerpAngle(was.yaw, boat.yaw, a), bt = lerp(was.t, t, a);
    carrier.position.set(bx, LL.SEA?.level ?? 0, bz);
    carrier.rotation.set(0, byaw, 0);
    // swell + heel: a slow pitch and roll, heeling outward in a turn (to port when turning to starboard)
    const heel = clamp(-boat.r * boat.u * 1.6, -0.06, 0.06);
    hullG.rotation.set(Math.sin(bt * 0.55) * 0.006, 0, Math.sin(bt * 0.8) * 0.012 + heel, 'YXZ');
    hullG.position.y = Math.sin(bt * 0.9) * 0.08;
    wake.update(boat, dt, hullP);
    if (!state.active) return;
    if (camHook && camHook({ x: bx, z: bz, yaw: byaw, y: carrier.position.y, t: bt }) === true) {
      const pl = ctx.playerObj;
      if (pl?.pos) { pl.pos.set(boat.x, hullP.playerY ?? 6, boat.z); pl.vel?.set(0, 0, 0); pl.yaw = boat.yaw + Math.PI; }
      return;
    }
    // touch look-around: player.js accumulates a right-half drag in playerObj.look (its mouse look is gated off while
    // sailing, so a mouse drag is not counted twice). player.update() runs before this in the frame and would consume
    // it, so while she sails it hands the drag to lookCapture (set in enter) and it collects in lookIn
    const plk = ctx.playerObj?.look;
    const ldx = lookIn.dx + (plk?.dx || 0), ldy = lookIn.dy + (plk?.dy || 0);
    lookIn.dx = lookIn.dy = 0; if (plk) plk.dx = plk.dy = 0;
    const rdx = lookRad.dx, rdy = lookRad.dy; lookRad.dx = lookRad.dy = 0;
    if (ldx || ldy || rdx || rdy) {
      const d = mouseLook(ldx, ldy);
      orbit.yaw += d.yaw - rdx; orbit.pitch = clamp(orbit.pitch + d.pitch - rdy * 0.6, -0.8, 0.3); orbit.back = 3;
    }
    // chase camera: behind and above the ship; the mouse orbit eases back behind her
    // [smooth] the easings are exponential in the frame's time (they were per frame: 1.21, 1.01 and 3.08 /s are what they gave at 60 Hz)
    if (dt > 0 && orbit.back > 0) orbit.back -= dt; else if (dt > 0) orbit.yaw *= Math.exp(-1.21 * dt);
    // Follow rate and look-ahead scale with world speed above her own cruise, so x4 at 12 kn does not leave the
    // camera behind and does not have to catch up in one whip (playtests 2026-10-08). At cruise, pace is 1: the old rates.
    const vW = Math.abs(boat.u * boat.tc), pace = Math.max(1, Math.min(4, vW / Math.max(0.5, hullP.vMax || BOAT.vMax)));
    const cy = byaw + Math.PI + orbit.yaw, dist = (hullP.camBack ?? 92) + vW * (hullP.camSpeed ?? 1.6), hgt = (hullP.camHeight ?? 26) - orbit.pitch * (hullP.camPitch ?? 60);
    const tx = bx + Math.sin(cy) * dist, tz = bz + Math.cos(cy) * dist;
    const ty = Math.max(hgt, (LL.heightAt ? LL.heightAt(tx, tz) : 0) + 6);
    if (!camInit || dt <= 0) { camPos.set(tx, ty, tz); camInit = true; } else camPos.lerp(_ct.set(tx, ty, tz), damp(camEase > 0 ? 1.01 : 3.08 * pace, dt));
    if (camEase > 0) camEase -= dt;
    const la = (hullP.lookAhead ?? 25) * pace;
    camLook.set(bx + Math.sin(byaw) * la, hullP.lookY ?? 9, bz + Math.cos(byaw) * la);
    if (cam) { cam.position.copy(camPos); cam.lookAt(camLook); }
    const pl = ctx.playerObj;
    if (pl?.pos) { pl.pos.set(boat.x, hullP.playerY ?? 6, boat.z); pl.vel?.set(0, 0, 0); pl.yaw = boat.yaw + Math.PI; }
  }

  function homeOf(kind) {
    if (kind === 'shofuku') return BERTH;
    return boats.get(kind)?.berth || BERTH;
  }
  const shofukuHold = new THREE.Group(); shofukuHold.name = 'sail:shofuku-hold'; ctx.add(shofukuHold);
  /** Park a hull in the world at her own berth (the carrier only holds the boat under way). */
  function parkBoat(kind) {
    if (kind === 'shofuku') {
      shofukuHold.position.copy(carrier.position);
      shofukuHold.rotation.copy(carrier.rotation);
      shofukuHold.add(S.group);
      S.group.position.set(0, 0, 0);
      S.group.rotation.set(0, 0, 0);
      return;
    }
    const e = boats.get(kind);
    if (!e?.group) return;
    const g = e.group, b = e.berth || BERTH;
    g.parent?.remove(g);
    g.position.set(b.x, 0, b.z);
    g.rotation.set(0, b.yaw || 0, 0);
    ctx.add(g);
  }
  function mountBoat(kind) {
    if (kind === boatKind) return;
    parkBoat(boatKind);
    if (kind === 'shofuku') {
      carrier.add(S.group);
      S.group.position.set(0, 0, 0);
      S.group.rotation.set(0, 0, 0);
      hullG = S.group;
      return;
    }
    const e = boats.get(kind);
    if (!e?.group) return;
    const g = e.group;
    g.parent?.remove(g);
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    carrier.add(g);
    hullG = g;
  }
  function applyBoat(kind) {
    const id = BOATS[kind] ? kind : 'shofuku';
    if (id !== 'shofuku' && !boats.has(id)) return boatKind;
    hullP = BOATS[id];
    if (id !== boatKind) { mountBoat(id); boatKind = id; }
    return id;
  }

  function enter(at = null) {
    const prevKind = boatKind;
    const id = applyBoat(at?.boat || 'shofuku');
    const home = homeOf(id);
    const p = (at && (at.x != null || at.z != null)) ? at : (id === 'shofuku' ? (at || BERTH) : home);
    boat = boatState(p.x, p.z, p.yaw ?? home.yaw ?? BERTH.yaw);
    if (at?.u) boat.u = at.u;
    order = 0; rec = null; fired.clear(); state.events = []; tow.clock = 0; tow.last = -1e9; state.towed = 0;
    progress = { s: path.project(boat.x, boat.z).s, d: 0 };
    state.active = true; state.autopilot = at?.autopilot ?? (id === 'shofuku'); state.idle = 0;
    if (id !== 'shofuku') stopHold = true;
    else if (prevKind !== 'shofuku') stopHold = false;
    held = false; camHook = null;
    orbit.yaw = 0; orbit.pitch = -0.12; camInit = false;
    const pl = ctx.playerObj; if (pl) { pl.enabled = false; pl.fly = true; if (pl.look) pl.look.dx = pl.look.dy = 0; pl.lookCapture = captureLook; pl.lookSink = padLook; }
    lookIn.dx = lookIn.dy = 0; lookRad.dx = lookRad.dy = 0; pad.stop = pad.boost = false;
    ctx.services.life?.tour?.stop?.();
    sync(); place(0);
    return true;
  }
  function exit() {
    if (!state.active) return;
    state.active = false; keys.clear(); pad.stop = pad.boost = false; held = false; camHook = null;
    const pl = ctx.playerObj;
    const home = homeOf(boatKind);
    const ashore = boatKind === 'shofuku' ? 60 : (home.ashore ?? 48);
    if (pl) {
      if (pl.lookCapture === captureLook) pl.lookCapture = null;   // the walker's own look again
      if (pl.lookSink === padLook) pl.lookSink = null;
      pl.enabled = typeof document !== 'undefined' ? (document.body?.classList?.contains('playing') ?? true) : true;
      // at the berth: step ashore on the quay apron by the gangway; underway: hover where the camera is
      if (Math.hypot(boat.x - home.x, boat.z - home.z) < ashore) { pl.fly = false; pl.setPose?.(home.quay[0], home.quay[1], ((home.yaw ?? BERTH.yaw) + Math.PI / 2) * 180 / Math.PI, 0); }
      else pl.setPose?.(cam.position.x, cam.position.z, (boat.yaw + Math.PI) * 180 / Math.PI, -10, cam.position.y);
    }
    // a fishing boat goes back alongside her quay; 第一昭福丸 stays where the voyage left her
    if (boatKind !== 'shofuku' && home) {
      boat = boatState(home.x, home.z, home.yaw ?? 0);
      sync();
      place(0);
    } else wake.update(boat, 0, hullP);
  }
  /** [play:ippon] Register another hull. She waits at `berth` until enter({ boat: id }). */
  function registerBoat(id, spec = {}) {
    const group = spec.group || spec.ship?.group;
    const berth = spec.berth || spec.home;
    if (!BOATS[id] || !group || !berth) return false;
    boats.set(id, { group, berth });
    if (id !== boatKind) parkBoat(id);
    return true;
  }
  /** [play:ippon] Freeze the helm (the pole is in the water). */
  function hold(on) { held = !!on; if (held) order = 0; }
  /** [play:ippon] When the hook returns true, this mode owns the camera for the frame. */
  function setCam(fn) { camHook = typeof fn === 'function' ? fn : null; }
  /** [ship:pad] 停止: the engine telegraph to stop (X), taking the helm. */
  function stop() { pad.stop = true; }
  /** [ship:pad] 4x: hold (true) / release (false) the time compression, like Shift. */
  function speed(on) { pad.boost = !!on; }
  function setAutopilot(on) { stopHold = false; state.autopilot = !!on; state.idle = 0; rec = null; if (!on) order = boat.eng; }
  /** Streaming focus: ahead of the bow, further at speed (the world moves x tc). */
  function focus() { const k = 40 + Math.abs(boat.u * boat.tc) * 12; return { x: boat.x + Math.sin(boat.yaw) * k, z: boat.z + Math.cos(boat.yaw) * k }; }
  /** Put the ship at a pose without sailing (acts: back at the berth for the homecoming). */
  function setPose(x, z, yaw) { boat = boatState(x, z, yaw); sync(); place(0); }
  function emit(ev) { state.events.push(ev); for (const f of listeners) try { f(ev, api); } catch (e) { console.error(e); } }

  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (ctx.services.swim?.active) return;   // [play:underwater] V / hold R / F leave the water, not the boat
      const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (state.active && boatKind !== 'katsuo' && !typing && (e.code === 'KeyV' || e.code === 'KeyF' || e.code === 'KeyC' || /^Digit\d$/.test(e.code))) exit();
    }, true);
    addEventListener(HELD_R, () => {
      if (ctx.services.swim?.active) return;
      if (state.active && boatKind !== 'katsuo') exit();
    });
  }
  // [smooth] the ship model at the fixed rate, the drawing every frame (in shot mode and window.__sim: one after the other, as update() did)
  ctx.onStep((dt) => { step(dt); });
  ctx.onUpdate((dt) => {
    if (state.active && (ctx.services.life?.tour?.flying || ctx.planet?.active)) exit();
    if (state.active || eng.on) try { engine(); } catch (e) { /* no audio */ }
    if (state.active && dt > 0) present(dt, ctx.alpha ?? 1);
  });

  const api = {
    enter, exit, update, focus, setAutopilot, setPose, place, stop, speed, registerBoat, hold, setCam,
    guide(g) { guide = g || null; },
    get active() { return state.active; }, state,
    get boat() { return boat; }, get boatKind() { return boatKind; }, get boatId() { return boatKind; }, get handling() { return hullP; },
    get ship() { return S; }, get carrier() { return carrier; }, path,
    onEvent: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    dispose() { carrier.parent?.remove(carrier); wake.group.parent?.remove(wake.group); wake.dispose(); listeners.clear(); },
  };
  ctx.services.sail = api;   // harbor/arrivals.js reads it: AI boats near her hold position
  return api;
}

// ------------------------------------------------------------------------------------------------ stand-in + wake
/** A true-size stand-in until ship/shofukumaru1.js is wired: white hull 58.6 x 9.2 m, red bottom, a bridge block. */
export function makeStandIn(ctx) {
  const g = new THREE.Group(); g.name = 'shofukumaru-standin';
  const M = (c) => (ctx.mat?.toon ? ctx.mat.toon(c) : new THREE.MeshLambertMaterial({ color: c }));
  const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
  box(9.2, 3.54, 54, '#8c2b2b', 0, -1.77, -1.0);       // antifouling to the design draft
  box(9.2, 5.0, 56, '#f2f3f1', 0, 2.5, -1.0);           // shelter-deck side, sheer ~5 m
  box(6.4, 1.6, 6, '#f2f3f1', 0, 5.4, 25.0);            // forecastle rising to the bow
  box(8.2, 5.9, 11.7, '#f2f3f1', 0, 7.95, -5.0);        // bridge house s 28.3-40, roof ~10.9
  box(0.8, 10.7, 0.8, '#eef0ee', 0, 15.35, -13.5);      // radar mast s 42.8 to ~20.7
  const bow = box(4.6 * Math.SQRT2, 6.2, 4.6 * Math.SQRT2, '#f2f3f1', 0, 3.1 - 0.0, 29.3 - 4.6);   // a pointed stem to s = 0
  bow.rotation.y = Math.PI / 4;
  return { group: g, anchors: {}, setFlags() {}, setNight() {}, update() {}, dispose() { g.traverse((o) => { o.geometry?.dispose?.(); }); } };
}

/** Wake: a foam ribbon along the recent stern track, a thin V of streaks, and a bow wave.
 *  Colours stay under the bloom knee so the wash does not turn into white balls. Three draw calls. */
function makeWake(ctx, { phone }) {
  const N = phone ? 24 : 64, C = 3, group = new THREE.Group(); group.name = 'sail:wake';
  const pos = new Float32Array(N * C * 3), col = new Float32Array(N * C * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const idx = [];
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < C - 1; k++) { const a = i * C + k, b = a + 1, c = a + C, d = c + 1; idx.push(a, c, b, b, c, d); }
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const ribbon = new THREE.Mesh(geo, mat); ribbon.frustumCulled = false; ribbon.renderOrder = 2; ribbon.name = 'sail:ribbon';
  group.add(ribbon);
  const flat = (tex) => new THREE.MeshBasicMaterial({ map: tex, color: 0x6a7c86, transparent: true, opacity: 0, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // the painted V wake (local +Z = toward the stern once laid flat, see arrivals.js), 1.9 LOA long
  let vTex = null;
  try {
    vTex = ctx.tex?.draw ? ctx.tex.draw(256, 512, (g) => {
      g.clearRect(0, 0, 256, 512);
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(160, 176, 184, 0.7)';
      g.lineWidth = 3;
      for (const s of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const y = 500 - t * 480;
          const x = 128 + s * (10 + t * 96);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(128, 500);
      g.lineTo(128, 80);
      g.stroke();
    }, { key: 'sail-wake-streak' }) : null;
  } catch (e) { vTex = null; }
  const vmat = flat(vTex), WL = SHIP_DIMS.loa * 1.9, WW = SHIP_DIMS.beam * 3.6;
  const vWake = new THREE.Mesh(new THREE.PlaneGeometry(WW, WL).rotateX(-Math.PI / 2), vmat);
  vWake.renderOrder = 2; vWake.visible = !!vTex; vWake.name = 'sail:vwake'; group.add(vWake);
  // bow wave: a painted moustache of foam either side of the stem
  const bowTex = ctx.tex?.draw ? ctx.tex.draw(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.lineCap = 'round';
    for (const sd of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i < 18; i++) {
        const u = i / 17;
        const x = 64 + sd * (4 + u * 48);
        const y = 16 + u * 100;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(150, 168, 176, 0.55)';
      g.lineWidth = 2.2;
      g.stroke();
    }
  }, { key: 'sail-bowwave-streak' }) : null;
  const bmat = flat(bowTex);
  const bowWave = new THREE.Mesh(new THREE.PlaneGeometry(16, 22).rotateX(-Math.PI / 2).rotateY(Math.PI), bmat);
  bowWave.renderOrder = 2; bowWave.visible = !!bowTex; group.add(bowWave);
  try { ctx.noOutline?.(group); } catch (e) { /* tests */ }
  const LIFE = 60;    // seconds (model time) a stretch of wash stays visible
  const trail = [];   // [x, z, age, speed]
  let acc = 0;
  function update(b, dt, P = null) {
    const loa = P?.L || SHIP_DIMS.loa, beam = P?.B || SHIP_DIMS.beam, vCap = P?.vMax || BOAT.vMax;
    const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), F = loa / 2, sp = Math.min(1, Math.abs(b.u) / vCap);
    const sx = b.x - sy * (F - 2), sz = b.z - cy * (F - 2);
    acc += dt;
    for (const p of trail) p[2] += dt * b.tc;
    if (!trail.length || acc > 0.25 || Math.hypot(trail[0][0] - sx, trail[0][1] - sz) > 6) { trail.unshift([sx, sz, 0, sp]); acc = 0; }
    else { trail[0][0] = sx; trail[0][1] = sz; trail[0][3] = sp; }
    while (trail.length > N || (trail.length && trail[trail.length - 1][2] > LIFE)) trail.pop();
    for (let i = 0; i < N; i++) {
      const p = trail[Math.min(i, trail.length - 1)] || [sx, sz, 0, 0], q = trail[Math.min(i + 1, trail.length - 1)] || p;
      let dx = p[0] - q[0], dz = p[1] - q[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const age = p[2], w = beam * 0.4 + age * 0.3, fade = (1 - age / LIFE) ** 2;
      const a = i < trail.length && i > 0 ? 0.42 * (p[3] ?? 0) * fade : 0;
      for (let k = 0; k < C; k++) {
        const sd = k - 1, o = (i * C + k) * 3, c = (i * C + k) * 4;
        pos[o] = p[0] - dz * w * sd; pos[o + 1] = 0.07; pos[o + 2] = p[1] + dx * w * sd;
        col[c] = 0.40; col[c + 1] = 0.46; col[c + 2] = 0.48; col[c + 3] = sd === 0 ? a : 0;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    vWake.scale.set(beam / SHIP_DIMS.beam, 1, loa / SHIP_DIMS.loa);
    vWake.position.set(b.x - sy * (F * 0.72 + (WL * loa / SHIP_DIMS.loa) / 2), 0.06, b.z - cy * (F * 0.72 + (WL * loa / SHIP_DIMS.loa) / 2)); vWake.rotation.set(0, b.yaw, 0);
    vmat.opacity = 0.8 * sp; vWake.visible = !!vTex && sp > 0.02;
    bowWave.position.set(b.x + sy * (F - 7), 0.08, b.z + cy * (F - 7)); bowWave.rotation.set(0, b.yaw, 0);
    bmat.opacity = Math.min(0.9, sp * 0.9);
  }
  return { group, update, dispose() { geo.dispose(); mat.dispose(); bmat.dispose(); vmat.dispose(); } };
}
