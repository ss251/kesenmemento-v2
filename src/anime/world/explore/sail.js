// [ship] Sail mode: take the helm of 第一昭福丸 (58.6 m tuna longliner, 7KFY) from the コの字岸壁 out under かなえ大橋 to
// the bay mouth (ship/route.js OUTBOUND). Ship handling is a pure, tested model (boatStep + resolveShore):
//   - surge with inertia: an engine order that lags, thrust against quadratic + linear drag, no brakes (reverse the
//     engine to stop), astern thrust ~30 % of ahead;
//   - a rate-limited rudder, a first-order (Nomoto) yaw response whose rate scales with speed (a ship turns on a circle
//     of roughly fixed size whatever her speed: tactical diameter ~3.5 LOA), a little sideslip outward in a turn, and
//     a little speed lost while turning;
//   - a harbour pace of 6 kn (3.1 m/s), a game setting (no sourced harbour limit for 気仙沼); "boost" is TIME COMPRESSION (x4): the whole model runs four times faster, so she
//     covers the bay at an apparent 24 kn but turns on the same circle and keeps the same feel;
//   - the shore: L.shoreDist (signed distance to the coastline, + at sea) sampled at the bow, the stern and the beam
//     corners; she slides along a quay, never through it, and loses speed on contact.
// Chase camera and the touch stick are copied from explore/drive.js. Autopilot (pure pursuit on OUTBOUND) takes over
// when you let go and hands back the moment you touch the controls.
//
// Keys (while sailing): W / S or the arrows up / down move the engine order (it stays where you leave it: a ship's
// telegraph), X stops the engine, A / D or left / right put the rudder over (it returns to midships when released),
// Shift holds the x4 time compression, P toggles the autopilot, Esc leaves. Touch: the left stick (up/down = order,
// left/right = rudder); a drag on the right looks around.
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
import { OUTBOUND_PATH, BERTH, KANAE_CROSSING, SHOKO, MIRAI, BAY_MOUTH, makePath, SHIP_DIMS } from '../ship/route.js';
import { KANAE } from '../harbor/real.js';
import { wakeTexture } from '../harbor/arrivals.js';   // the harbour's painted V wake (shared texture)

export const KN = 0.514444;   // m/s per knot

/** Ship handling constants (sources in the comments; the "game" values are tuned to the real ones' proportions). */
export const BOAT = {
  L: SHIP_DIMS.loa, B: SHIP_DIMS.beam,
  vMax: 6 * KN,          // 3.09 m/s: a harbour pace chosen for the game (no sourced limit for 気仙沼); service speed is 12.3 kn (JASNAOE SOY 2020)
  accel: 0.16,           // m/s^2 at full ahead from rest: 0 -> 90 % of harbour speed in ~28 s (a 486 GT hull)
  astern: 0.3,           // astern thrust / ahead thrust (fixed-pitch propeller going astern)
  linDrag: 0.012,        // 1/s: lets her come to rest instead of coasting forever on the quadratic drag
  turnDrag: 0.25,        // speed lost per rad/s of yaw rate (a ship slows in a turn)
  engineLag: 3.0,        // s: the engine order takes effect over a few seconds
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
  const thrust = eng >= 0 ? eng * P.accel : eng * P.accel * P.astern;
  const kq = (P.accel - P.linDrag * P.vMax) / (P.vMax * P.vMax);   // full ahead settles at exactly vMax
  let u = s.u + (thrust - kq * s.u * Math.abs(s.u) - P.linDrag * s.u - P.turnDrag * Math.abs(s.r) * s.u) * h;
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
export function resolveShore(prev, next, dt, shoreDist = L.shoreDist, P = BOAT) {
  let c = hullClearance(next, shoreDist);
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
    c = hullClearance(out, shoreDist);
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

/** boatStep + resolveShore: the full pure step. */
export function sailStep(s, input, dt, shoreDist = L.shoreDist, P = BOAT) {
  return resolveShore(s, boatStep(s, input, dt, P), dt, shoreDist, P);
}

// ------------------------------------------------------------------------------------------------ autopilot (pure)
export const AUTO = {
  straightUntil: 80,    // m along the route: rudder midships until the stern is clear of the quay's SE corner
  slowUntil: 70,        // m along the route: slow ahead while she comes off the quay
  boostFrom: 260,       // m: the x4 time compression from here (clear of the send-off) ...
  boostEndBefore: 450,  // ... until this far before the end of the route
  window: [-60, 400],   // projection window around the last progress (no jumping between legs)
};
/**
 * Pure pursuit on a path: steer toward the point `Ld` ahead of the ship's projection. Returns { throttle, rudder,
 * boost, s (progress), xte (cross-track m) }. `progress` = the last returned s (keeps the projection local).
 */
export function pursue(path, s, progress = 0, P = BOAT, A = AUTO) {
  const q = path.project(s.x, s.z, Math.max(0, progress + A.window[0]), progress + A.window[1]);
  const vWorld = Math.abs(s.u) * s.tc;
  const Ld = clamp(70 + vWorld * 7, 70, 200);
  const [tx, tz] = path.at(q.s + Ld);
  const alpha = wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw);
  // curvature to reach the look-ahead point; yaw rises with a port turn (rudder < 0): rudder = -kappa * R0
  const kappa = (2 * Math.sin(alpha)) / Ld;
  const rudder = q.s < A.straightUntil ? 0 : clamp(-kappa * P.R0 * 1.3, -1, 1);
  const left = path.len - q.s;
  let throttle = q.s < A.slowUntil ? 0.45 : 1;
  if (left < 160) throttle = left < 30 ? 0 : 0.35;
  const boost = q.s > A.boostFrom && left > A.boostEndBefore;
  return { throttle, rudder, boost, s: q.s, xte: q.d * (q.side || 1) };
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
  const state = {
    active: false, autopilot: true, x: boat.x, z: boat.z, yaw: boat.yaw, u: 0, kn: 0, vWorld: 0, tc: 1, rudder: 0, eng: 0,
    s: 0, xte: 0, contact: 0, events: [], idle: 0,
  };
  const orbit = { yaw: 0, pitch: -0.12, back: 0 };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false, t = 0;

  // ---- the ship: the real model if given, else a stand-in box at the true size (local +Z forward, waterline y = 0)
  const S = ship || makeStandIn(ctx);
  const carrier = new THREE.Group(); carrier.name = 'sail:carrier';
  const hullG = S.group;
  carrier.add(hullG);
  ctx.add(carrier);
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
      if (e.code === 'KeyX') { order = 0; takeOver(); }
      if (e.code === 'Escape') exit();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    addEventListener('mousemove', (e) => {
      if (!state.active) return;
      const locked = typeof document !== 'undefined' && document.pointerLockElement === ctx.renderer?.domElement;
      if (locked || e.buttons) { orbit.yaw -= e.movementX * 0.004; orbit.pitch = clamp(orbit.pitch - e.movementY * 0.003, -0.8, 0.3); orbit.back = 3; }
    });
  }
  function takeOver() { if (state.autopilot) { state.autopilot = false; order = boat.eng; } state.idle = 0; }
  function readInput(dt) {
    const k = keys, tm = ctx.playerObj?.touchMove || { x: 0, y: 0 };
    let dO = 0, rd = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) dO += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dO -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) rd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) rd += 1;
    dO -= tm.y; rd += tm.x;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight');
    const touched = Math.abs(dO) > 0.05 || Math.abs(rd) > 0.05 || boost;
    if (touched) takeOver(); else state.idle += dt;
    if (!state.autopilot && state.idle > 8 && Math.abs(boat.u) > 0.5) setAutopilot(true);   // re-engage on idle (underway)
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
    const f = 22 + Math.abs(boat.eng) * 14, level = !state.active || A.muted ? 0 : 0.02 + Math.abs(boat.eng) * 0.025, now = ac.currentTime;
    eng.o1.frequency.setTargetAtTime(f, now, 0.3); eng.o2.frequency.setTargetAtTime(f * 1.5, now, 0.3); eng.g.gain.setTargetAtTime(level, now, 0.3);
  }

  let progress = { s: 0, d: 0 };
  function update(dt) {
    if (!state.active || dt <= 0) return;
    dt = Math.min(dt, 0.05); t += dt;
    const man = readInput(dt);
    let inp = man;
    if (state.autopilot) {
      const ap = pursue(path, boat, progress.s);
      inp = { throttle: ap.throttle, rudder: ap.rudder, boost: ap.boost };
    }
    const prev = boat;
    boat = sailStep(boat, inp, dt, sd);
    const q = path.project(boat.x, boat.z, Math.max(0, progress.s + AUTO.window[0]), progress.s + AUTO.window[1]);
    progress = { s: q.s, d: q.d };
    for (const ev of routeEvents(prev, boat, progress, fired, path)) emit({ ...ev, t });
    sync(); place(dt);
  }
  function sync() {
    Object.assign(state, { x: boat.x, z: boat.z, yaw: boat.yaw, u: boat.u, kn: boat.u / KN, tc: boat.tc, vWorld: boat.u * boat.tc, rudder: boat.rudder, eng: boat.eng, s: progress.s, xte: progress.d, contact: boat.contact });
  }

  function place(dt) {
    carrier.position.set(boat.x, LL.SEA?.level ?? 0, boat.z);
    carrier.rotation.set(0, boat.yaw, 0);
    // swell + heel: a slow pitch and roll, heeling outward in a turn (to port when turning to starboard)
    const heel = clamp(-boat.r * boat.u * 1.6, -0.06, 0.06);
    hullG.rotation.set(Math.sin(t * 0.55) * 0.006, 0, Math.sin(t * 0.8) * 0.012 + heel, 'YXZ');
    hullG.position.y = Math.sin(t * 0.9) * 0.08;
    wake.update(boat, dt);
    if (!state.active) return;
    // chase camera: behind and above the ship; the mouse orbit eases back behind her
    if (dt > 0 && orbit.back > 0) orbit.back -= dt; else if (dt > 0) orbit.yaw *= 1 - Math.min(1, dt * 1.2);
    const cy = boat.yaw + Math.PI + orbit.yaw, dist = 92 + Math.abs(boat.u * boat.tc) * 1.6, hgt = 26 - orbit.pitch * 60;
    const tx = boat.x + Math.sin(cy) * dist, tz = boat.z + Math.cos(cy) * dist;
    const ty = Math.max(hgt, (LL.heightAt ? LL.heightAt(tx, tz) : 0) + 6);
    if (!camInit || dt <= 0) { camPos.set(tx, ty, tz); camInit = true; } else camPos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 3));
    camLook.set(boat.x + Math.sin(boat.yaw) * 25, 9, boat.z + Math.cos(boat.yaw) * 25);
    if (cam) { cam.position.copy(camPos); cam.lookAt(camLook); }
    const pl = ctx.playerObj;
    if (pl?.pos) { pl.pos.set(boat.x, 6, boat.z); pl.vel?.set(0, 0, 0); pl.yaw = boat.yaw + Math.PI; }
  }

  function enter(at = null) {
    const p = at || BERTH;
    boat = boatState(p.x, p.z, p.yaw ?? BERTH.yaw);
    if (at?.u) boat.u = at.u;
    order = 0; fired.clear(); state.events = [];
    progress = { s: path.project(boat.x, boat.z).s, d: 0 };
    state.active = true; state.autopilot = at?.autopilot ?? true; state.idle = 0;
    orbit.yaw = 0; orbit.pitch = -0.12; camInit = false;
    const pl = ctx.playerObj; if (pl) { pl.enabled = false; pl.fly = true; }
    ctx.services.life?.tour?.stop?.();
    sync(); place(0);
    return true;
  }
  function exit() {
    if (!state.active) return;
    state.active = false; keys.clear();
    const pl = ctx.playerObj;
    if (pl) {
      pl.enabled = typeof document !== 'undefined' ? (document.body?.classList?.contains('playing') ?? true) : true;
      // at the berth: step ashore on the quay apron by the gangway; underway: hover where the camera is
      if (Math.hypot(boat.x - BERTH.x, boat.z - BERTH.z) < 60) { pl.fly = false; pl.setPose?.(BERTH.quay[0], BERTH.quay[1], (BERTH.yaw + Math.PI / 2) * 180 / Math.PI, 0); }
      else pl.setPose?.(cam.position.x, cam.position.z, (boat.yaw + Math.PI) * 180 / Math.PI, -10, cam.position.y);
    }
    wake.update(boat, 0);
  }
  function setAutopilot(on) { state.autopilot = !!on; state.idle = 0; if (!on) order = boat.eng; }
  /** Streaming focus: ahead of the bow, further at speed (the world moves x tc). */
  function focus() { const k = 40 + Math.abs(boat.u * boat.tc) * 12; return { x: boat.x + Math.sin(boat.yaw) * k, z: boat.z + Math.cos(boat.yaw) * k }; }
  /** Put the ship at a pose without sailing (acts: back at the berth for the homecoming). */
  function setPose(x, z, yaw) { boat = boatState(x, z, yaw); sync(); place(0); }
  function emit(ev) { state.events.push(ev); for (const f of listeners) try { f(ev, api); } catch (e) { console.error(e); } }

  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => {
    const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if (state.active && !typing && (e.code === 'KeyV' || e.code === 'KeyR' || e.code === 'KeyF' || e.code === 'KeyC' || /^Digit\d$/.test(e.code))) exit();
  }, true);
  ctx.onUpdate((dt) => {
    if (state.active && (ctx.services.life?.tour?.flying || ctx.planet?.active)) exit();
    if (state.active || eng.on) try { engine(); } catch (e) { /* no audio */ }
    update(dt);
  });

  const api = {
    enter, exit, update, focus, setAutopilot, setPose, place,
    get active() { return state.active; }, state,
    get boat() { return boat; }, get ship() { return S; }, get carrier() { return carrier; }, path,
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

/** Wake: a soft foam ribbon along the recent stern track (prop wash: bright on the centreline, fading to the edges and
 *  with age; it follows her turns), the harbour's painted V wake (harbor/arrivals.js wakeTexture, shared with the AI
 *  boats) and a bow wave, all growing with speed. Three draw calls; the ribbon has 24 rows on the phone tier. */
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
  const flat = (tex) => new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // the painted V wake (local +Z = toward the stern once laid flat, see arrivals.js), 1.9 LOA long
  let vTex = null; try { vTex = ctx.tex?.draw ? wakeTexture(ctx) : null; } catch (e) { vTex = null; }
  const vmat = flat(vTex), WL = SHIP_DIMS.loa * 1.9, WW = SHIP_DIMS.beam * 3.6;
  const vWake = new THREE.Mesh(new THREE.PlaneGeometry(WW, WL).rotateX(-Math.PI / 2), vmat);
  vWake.renderOrder = 2; vWake.visible = !!vTex; vWake.name = 'sail:vwake'; group.add(vWake);
  // bow wave: a painted moustache of foam either side of the stem
  const bowTex = ctx.tex?.draw ? ctx.tex.draw(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    for (const sd of [-1, 1]) for (let i = 0; i < 26; i++) { const u = i / 26; g.fillStyle = `rgba(246,250,248,${(0.85 * (1 - u)).toFixed(3)})`; g.beginPath(); g.ellipse(64 + sd * (6 + u * 52), 18 + u * 96, 7 * (1 - u * 0.5), 3.2, sd * 0.5, 0, 7); g.fill(); }
  }, { key: 'sail-bowwave' }) : null;
  const bmat = flat(bowTex);
  const bowWave = new THREE.Mesh(new THREE.PlaneGeometry(16, 22).rotateX(-Math.PI / 2).rotateY(Math.PI), bmat);
  bowWave.renderOrder = 2; bowWave.visible = !!bowTex; group.add(bowWave);
  try { ctx.noOutline?.(group); } catch (e) { /* tests */ }
  const LIFE = 60;    // seconds (model time) a stretch of wash stays visible
  const trail = [];   // [x, z, age, speed]
  let acc = 0;
  function update(b, dt) {
    const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), F = SHIP_DIMS.loa / 2, sp = Math.min(1, Math.abs(b.u) / BOAT.vMax);
    const sx = b.x - sy * (F - 2), sz = b.z - cy * (F - 2);
    acc += dt;
    for (const p of trail) p[2] += dt * b.tc;
    if (!trail.length || acc > 0.25 || Math.hypot(trail[0][0] - sx, trail[0][1] - sz) > 6) { trail.unshift([sx, sz, 0, sp]); acc = 0; }
    else { trail[0][0] = sx; trail[0][1] = sz; trail[0][3] = sp; }
    while (trail.length > N || (trail.length && trail[trail.length - 1][2] > LIFE)) trail.pop();
    for (let i = 0; i < N; i++) {
      const p = trail[Math.min(i, trail.length - 1)] || [sx, sz, 0, 0], q = trail[Math.min(i + 1, trail.length - 1)] || p;
      let dx = p[0] - q[0], dz = p[1] - q[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const age = p[2], w = SHIP_DIMS.beam * 0.4 + age * 0.3, fade = (1 - age / LIFE) ** 2;
      const a = i < trail.length && i > 0 ? 0.42 * (p[3] ?? 0) * fade : 0;
      for (let k = 0; k < C; k++) {
        const sd = k - 1, o = (i * C + k) * 3, c = (i * C + k) * 4;
        pos[o] = p[0] - dz * w * sd; pos[o + 1] = 0.07; pos[o + 2] = p[1] + dx * w * sd;
        col[c] = 0.95; col[c + 1] = 0.98; col[c + 2] = 0.98; col[c + 3] = sd === 0 ? a : 0;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    vWake.position.set(b.x - sy * (F * 0.72 + WL / 2), 0.06, b.z - cy * (F * 0.72 + WL / 2)); vWake.rotation.set(0, b.yaw, 0);
    vmat.opacity = 0.8 * sp; vWake.visible = !!vTex && sp > 0.02;
    bowWave.position.set(b.x + sy * (F - 7), 0.08, b.z + cy * (F - 7)); bowWave.rotation.set(0, b.yaw, 0);
    bmat.opacity = Math.min(0.9, sp * 0.9);
  }
  return { group, update, dispose() { geo.dispose(); mat.dispose(); bmat.dispose(); vmat.dispose(); } };
}
