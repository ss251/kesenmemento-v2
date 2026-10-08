// [play:ippon] カツオ一本釣り. The view plays what this returns.
// Season, the length-weight, and the 28-year record follow IPPON-RESEARCH.md.
// The ナブラ's minute-scale and the swing windows are game timing (a real session is 15 min to about 2 h;
// a master lands about one fish every 2 s). priceOf stays null: the card shows a cited daily average as an example, not a payout.
// In season the school is just outside the bay mouth. The run there is pure pursuit on OUTBOUND (sail.js pursue).

import { BAY_MOUTH, OUTBOUND_PATH } from '../../world/ship/route.js';
import { pursue, AUTO } from '../../world/explore/sail.js';
import { KATSUO } from '../../world/ship/boat-params.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Open water east-northeast of the gate. Continuing the channel's last leg runs into the coast. */
const GROUNDS = [
  { id: 'a', past: 900, bearing: 36, r: 70, w: 0.04, ph: 0.4 },
  { id: 'b', past: 1200, bearing: 48, r: 80, w: -0.03, ph: 1.2 },
  { id: 'c', past: 1450, bearing: 28, r: 70, w: 0.022, ph: 2.4 },
];

function seaPoint(past, bearing) {
  const dist = BAY_MOUTH.r + past;
  const a = bearing * Math.PI / 180;
  return {
    x: Math.round((BAY_MOUTH.x + Math.cos(a) * dist) * 10) / 10,
    z: Math.round((BAY_MOUTH.z + Math.sin(a) * dist) * 10) / 10,
  };
}

export const CFG = {
  workRadius: 70,
  seeBirds: 2000,
  season: { from: [5, 20], to: [11, 30] },
  nabura: { spray: 0.36, bait: 0.22, decay: 0.02, die: 0.08, biteAt: 0.42, sessionS: 80 },
  fish: { minCm: 38, maxCm: 82, mean: 48, sd: 6, bigP: 0.14, bigMean: 72, bigSd: 4 },
  weightK: 0.000024,
  fresh: { warm: 0.0055, ice: 0.00035 },
  comboWindow: 4.5,
  price: null,
  // A playable trip, not a 12-minute commute. Hold or clock ends it; 「帰港」 does too.
  trip: { seconds: 240, holdKg: 36 },
  // The open window is 260 ms. A first fish uses twice that. Bloom's soft knee starts at 0.55.
  sprayRgb: [0.40, 0.48, 0.50],
  schools: {
    near: GROUNDS.map((g) => ({ ...seaPoint(g.past, g.bearing), id: g.id, r: g.r, w: g.w, ph: g.ph, past: g.past })),
    far: [
      { id: 'a', x: 2025, z: 7425, r: 110, w: 0.02, ph: 0.2 },
      { id: 'b', x: 2400, z: 6800, r: 90, w: -0.018, ph: 1.5 },
    ],
  },
};

/** 来てけら: 5月下旬から11月あたり (IPPON-RESEARCH §5). 10 October 2026 is in. December through mid-May is out. */
export function inSeason(month, day) {
  const [fm, fd] = CFG.season.from, [tm, td] = CFG.season.to;
  const m = month | 0, d = day | 0;
  if (m < fm || m > tm) return false;
  if (m === fm) return d >= fd;
  if (m === tm) return d <= td;
  return true;
}

export function schoolsFor(on) {
  return on ? CFG.schools.near : CFG.schools.far;
}

/** Distance from the bay-mouth gate centre. In-season centres sit r + 0.8–1.5 km out, east of the gate. */
export function fromMouth(x, z) {
  return Math.hypot(x - BAY_MOUTH.x, z - BAY_MOUTH.z);
}

/** A hose droplet. t = 0 at the mouth, t = T on the water. vy is upward so the arc crests in the sun. */
export function hoseVelocity(ox, oy, oz, tx, ty, tz, T = 1.15, g = 9) {
  return {
    vx: (tx - ox) / T,
    vy: (ty - oy) / T + 0.5 * g * T,
    vz: (tz - oz) / T,
    T,
    g,
  };
}

/** Where that droplet is at time t (same g as hoseVelocity). */
export function hoseAt(ox, oy, oz, v, t) {
  const g = v.g || 9;
  return {
    x: ox + v.vx * t,
    y: oy + v.vy * t - 0.5 * g * t * t,
    z: oz + v.vz * t,
  };
}

// ×4 from just clear of the quay until the mouth. The last kilometre to the school stays at ×4 until the slow ring.
const GROUND_AUTO = { ...AUTO, boostFrom: 200, boostEndBefore: 40 };

/** Same rudder sign as pursue: a positive error (target to starboard of the bow) takes negative rudder. */
function steerAt(ship, x, z, out, opt = {}) {
  const dx = x - ship.x, dz = z - ship.z;
  const dist = Math.hypot(dx, dz) || 1;
  const alpha = Math.atan2(Math.sin(Math.atan2(dx, dz) - ship.yaw), Math.cos(Math.atan2(dx, dz) - ship.yaw));
  out.rudder = clamp(-alpha * 1.35, -1, 1);
  const work = !!opt.work;
  let throttle = dist < 90 ? 0.12 : dist < 200 ? 0.45 : 1;
  if (work && dist < 80) throttle = Math.min(throttle, 0.22);
  if (Math.abs(alpha) > 1.1) throttle = Math.min(throttle, 0.45);
  out.throttle = throttle;
  out.boost = !work && dist > 320 && Math.abs(alpha) < 0.6;
  return out;
}
const _dep = { throttle: 0, rudder: 0, boost: false, s: 0, leg: 'route', rec: null };
const _ap = { throttle: 0, rudder: 0, boost: false, s: 0, xte: 0, rec: null };

/**
 * Helm for 「漁場へ」. Join OUTBOUND from the market quay, follow it (pursue, the voyage's autopilot) at ×4
 * to the bay mouth, then run for the school. `rec` is pursue's recovery memory; pass the same object back.
 */
export function departOrder(ship, target, rec, dt) {
  const q = OUTBOUND_PATH.project(ship.x, ship.z);
  const distMouth = Math.hypot(ship.x - BAY_MOUTH.x, ship.z - BAY_MOUTH.z);
  const distSchool = Math.hypot((target?.x || 0) - ship.x, (target?.z || 0) - ship.z);
  if (distMouth < BAY_MOUTH.r + 40 || q.s > OUTBOUND_PATH.len - 60) {
    steerAt(ship, target.x, target.z, _dep, { work: distSchool < CFG.workRadius + 30 });
    _dep.s = q.s;
    _dep.leg = 'ground';
    _dep.rec = rec;
    return _dep;
  }
  if (q.d > 42) {
    const [tx, tz] = OUTBOUND_PATH.at(Math.min(OUTBOUND_PATH.len - 30, q.s + 160));
    steerAt(ship, tx, tz, _dep, {});
    _dep.boost = q.d < 160 && q.d > 70;
    _dep.s = q.s;
    _dep.leg = 'join';
    _dep.rec = rec;
    return _dep;
  }
  const ap = pursue(OUTBOUND_PATH, ship, q.s, KATSUO, GROUND_AUTO, rec, dt, undefined, _ap);
  _dep.throttle = ap.throttle;
  _dep.rudder = ap.rudder;
  _dep.boost = !!ap.boost;
  _dep.s = ap.s;
  _dep.leg = 'route';
  _dep.rec = ap.rec;
  return _dep;
}

/** A school drifting on its circle. `t` is seconds. */
export function schoolAt(s, t = 0) {
  const a = (s.ph || 0) + t * (s.w || 0);
  return { ...s, x: s.x + Math.cos(a) * (s.r || 0) * 0.35, z: s.z + Math.sin(a) * (s.r || 0) * 0.35 };
}

export function nearestSchool(x, z, schools) {
  const out = { d: Infinity, x: 0, z: 0 };
  nearestInto(x, z, schools, schools?.length || 0, out);
  return out;
}

/** Same as nearestSchool, writing into `out` (no allocation). */
export function nearestInto(x, z, schools, n, out) {
  let d = Infinity, j = 0;
  for (let i = 0; i < n; i++) {
    const s = schools[i];
    const dd = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (dd < d) { d = dd; j = i; }
  }
  const s = n ? schools[j] : null;
  out.x = s ? s.x : 0;
  out.z = s ? s.z : 0;
  out.d = d < Infinity ? Math.sqrt(d) : Infinity;
  out.i = s ? j : -1;
  return out;
}

const _pose = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
/** Write drifting centres into a reused list. Returns the count. */
export function poseSchools(list, t, out = _pose) {
  const n = Math.min(list.length, out.length);
  for (let i = 0; i < n; i++) {
    const s = list[i];
    const a = (s.ph || 0) + t * (s.w || 0);
    const rad = (s.r || 0) * 0.35;
    out[i].x = s.x + Math.cos(a) * rad;
    out[i].z = s.z + Math.sin(a) * rad;
  }
  return n;
}

/** FRA east-Pacific formula W = 5.5293e-6 × L^3.336. Printed checks: 40 cm 1.2 kg, 50 cm 2.6 kg, 60 cm 4.7 kg. */
export function kgFromCm(cm) {
  return Math.round(5.5293e-6 * cm ** 3.336 * 10) / 10;
}

function gauss(rng) {
  const u = Math.max(1e-8, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

export function rollCm(rng, big = false) {
  const mean = big ? CFG.fish.bigMean : CFG.fish.mean;
  const sd = big ? CFG.fish.bigSd : CFG.fish.sd;
  return Math.round(clamp(mean + gauss(rng) * sd, CFG.fish.minCm, CFG.fish.maxCm));
}

/** ナブラ 0..1. `age` is how long it has already been hot; past the session it dies back. */
export function naburaStep(n, input, dt, age) {
  let v = n;
  if (input?.spray) v += CFG.nabura.spray * dt;
  if (input?.bait) v += CFG.nabura.bait;
  const rate = age > CFG.nabura.sessionS ? CFG.nabura.die : CFG.nabura.decay;
  v -= rate * dt;
  return clamp(v, 0, 1);
}

/** A master lands about one fish every 2 s (明神水産). The floor is that pace. A cold school is slower, still inside a few seconds. */
export const RHYTHM = { floor: 2, ceiling: 4.2 };

/** Seconds until the next bite. At a hot ナブラ with a combo this sits on the floor. */
export function biteGap(nabura, combo) {
  const hot = clamp(nabura, 0, 1);
  const c = Math.min(combo | 0, 6);
  return clamp(3.55 - hot * 1.2 - c * 0.06, RHYTHM.floor, RHYTHM.ceiling);
}

/** The flight, in seconds. The first catch of a session holds the apex for APEX_HOLD. */
export const ARC_S = 0.68;
export const APEX_HOLD = 0.15;

/**
 * The 跳ね上げ in the angler's frame. +x is outboard (port, the water). +z is toward the bow.
 * u = 0 is the lure in the water. u = 1 is on the deck, inboard and aft, where the slope starts.
 * `deckY` is the plank height. The loft `h` is the extra height of the parabola.
 */
export function catchPathInto(u, h, deckY, out) {
  const k = u < 0 ? 0 : u > 1 ? 1 : u;
  const deck = deckY > 0 ? deckY : 0;
  out.u = k;
  out.x = 2.25 * (1 - k) - 1.25 * k;
  out.y = deck * k + 0.15 * (1 - k) + (h || 0) * Math.sin(Math.PI * k);
  out.z = -1.7 * k * k;
  out.onDeck = k >= 0.97;
  return out;
}

export function catchPath(u, h, deckY = 1.4) {
  return catchPathInto(u, h, deckY, { u: 0, x: 0, y: 0, z: 0, onDeck: false });
}

/** After the thud the fish slides down the slope to the belt. u = 0 is the landing, u = 1 is the belt mouth. */
export function slidePathInto(u, land, out) {
  const k = u < 0 ? 0 : u > 1 ? 1 : u;
  const e = k * k * (3 - 2 * k);
  const x0 = land && land.x != null ? land.x : -1.25;
  const y0 = land && land.y != null ? land.y : 0;
  const z0 = land && land.z != null ? land.z : -1.7;
  out.x = x0 + (-2.7 - x0) * e;
  out.y = y0 - 0.55 * e;
  out.z = z0 - 2.6 * e;
  return out;
}

export function slidePath(u, land) {
  return slidePathInto(u, land, { x: 0, y: 0, z: 0 });
}

/** A fish still in the water or in the air wears faint vertical bars. Belly lines appear once it is on the deck. */
export function fishMarks(where) {
  return where === 'deck' ? 'belly' : 'bars';
}

export function createFlight() {
  return { on: 0, u: 0, hold: 0, held: 0, phase: 'air', h: 3.2 };
}

/** Advance one flight. `first` holds APEX_HOLD seconds at the apex. Reduced motion snaps to the deck. */
export function flyStep(st, dt, opt) {
  const d = dt > 0 ? dt : 0;
  if (!st.on) return st;
  if (opt && opt.reduced) {
    st.u = 1; st.hold = 0; st.phase = 'deck'; st.on = 0;
    return st;
  }
  if (st.hold > 0) {
    st.hold = st.hold - d;
    if (st.hold < 0) st.hold = 0;
    return st;
  }
  const prev = st.u;
  st.u = st.u + d / ARC_S;
  if (st.u > 1) st.u = 1;
  if (opt && opt.first && !st.held && prev < 0.5 && st.u >= 0.5) {
    st.u = 0.5;
    st.hold = APEX_HOLD;
    st.held = 1;
    return st;
  }
  if (st.u >= 1) { st.phase = 'deck'; st.on = 0; }
  return st;
}

/** A press. The sweet length is about a fifth of a second; a stab or a long heave is weak. */
export function strengthFromHold(sec) {
  const t = Math.max(0, sec || 0);
  const g = Math.exp(-((t - 0.18) ** 2) / (2 * 0.11 * 0.11));
  return 0.12 + 0.54 * g;
}

/** Upward swipe speed, px/s, on the same 0..0.74 axis as the press. */
export function strengthFromSwipe(pxPerSec) {
  const x = Math.max(0, pxPerSec) / 1000;
  if (x < 0.35) return x * 0.4;
  return Math.min(0.72, 0.28 + (x - 0.35) * 0.48);
}

/**
 * The 跳ね上げ. `dtMs` is how late the pull is after the bite.
 * One motion over the shoulder. A heavy fish (about 10 kg) still comes in that one swing; it needs a stronger pull.
 * Two people on one skipjack is not in the sources. Too hard misses a normal fish; a heavy fish accepts a harder pull.
 */
/** Timing window. `wide` is the first fish of a first trip: twice the open band, same kindness on strength. */
export function liftWindow(wide = false) {
  if (!wide) return { early: 80, late: 340, sweet0: 140, sweet1: 260, giveUp: 480 };
  return { early: 0, late: 520, sweet0: 80, sweet1: 320, giveUp: 640 };
}

/**
 * World size of a streak that reads as `px` on screen, and never more than `maxPx`.
 * `dist` is metres, `fovDeg` the vertical field, `viewH` the CSS height.
 */
export function streakWorld(dist, fovDeg, viewH, px, maxPx = 24) {
  const focal = (viewH * 0.5) / Math.tan(((fovDeg > 0 ? fovDeg : 50) * Math.PI) / 360);
  const want = Math.min(Math.max(0, px), maxPx);
  return (want * Math.max(dist, 0.35)) / Math.max(focal, 1);
}

/** True when a particle colour stays at or under the bloom soft-knee (renderer uThreshold 1.05, knee 0.5). */
export function belowBloom(rgb, kneeStart = 0.55) {
  let m = 0;
  for (let i = 0; i < rgb.length; i++) if (rgb[i] > m) m = rgb[i];
  return m <= kneeStart + 1e-6;
}

export function judgeLift({ dtMs, strength, big = false, wide = false }) {
  const w = liftWindow(!!wide);
  const early = w.early, late = w.late, sweet0 = w.sweet0, sweet1 = w.sweet1;
  const timing = dtMs >= early && dtMs <= late;
  const sweet = dtMs >= sweet0 && dtMs <= sweet1;
  if (!timing) return { hit: false, set: false, quality: 'miss' };
  if (big) {
    if (strength < 0.7 || strength > 1.05) return { hit: false, set: false, quality: 'miss' };
    const perfect = sweet && strength >= 0.78 && strength <= 0.98;
    return { hit: true, set: false, quality: perfect ? 'perfect' : 'good', heavy: true };
  }
  if (strength < 0.25 || strength > 0.9) return { hit: false, set: false, quality: 'miss' };
  const power = strength >= 0.4 && strength <= 0.74;
  if (!power) return { hit: false, set: false, quality: 'miss' };
  const perfect = sweet && strength >= 0.55;
  return { hit: true, set: false, quality: perfect ? 'perfect' : 'good' };
}

export function nextCombo(combo, hit, gap) {
  if (!hit) return 0;
  if (gap > CFG.comboWindow) return 1;
  return (combo | 0) + 1;
}

/** Degrees from the horizontal: 36° toward the water, then up over the shoulder. */
export function poleDeg(u) {
  const k = clamp(u, 0, 1);
  return 36 + 82 * (1 - (1 - k) ** 2);
}

/** Fish path. `h` is the peak in metres. `out` is metres outboard (negative) of the rail; 0 means on the deck. */
export function arcAt(u, h) {
  const k = clamp(u, 0, 1);
  return { u: k, y: h * Math.sin(Math.PI * k), out: -2.4 * (1 - k) };
}

export function freshStep(fresh, iced, dt) {
  const rate = iced ? CFG.fresh.ice : CFG.fresh.warm;
  return clamp(fresh - rate * dt, 0.15, 1);
}

export function gradeOf({ n = 0, kg = 0, fresh = 1 }) {
  let g = kg >= 10 || n >= 6 ? 'jo' : kg >= 8 ? 'nami' : 'ko';
  if (fresh < 0.75 && g === 'jo') g = 'nami';
  if (fresh < 0.45) g = 'ko';
  return g;
}

export function priceOf() {
  return CFG.price;
}

/**
 * The captain's 「！」. Same screen floor as the missions balloon: a 1.05 m mark
 * falls under 22 px at 60 m, so the floor is what keeps it readable. The cap stops
 * it covering the face when you are standing next to him.
 */
export const BALLOON_NEAR = 60;
export const BALLOON_FAR = 108;
export const BALLOON_FLOOR_PX = 22;
export const BALLOON_CAP_PX = 64;
export const MARK_WORLD_M = 1.05;
export const RING_WORLD_M = 1.7;

/** CSS pixels a world length covers at `dist` metres, for this view height and vertical field of view. */
export function projectPx(worldM, dist, viewH, fovDeg) {
  const d = dist < 0.75 ? 0.75 : dist;
  const fov = fovDeg > 1 ? fovDeg : 55;
  const vh = viewH > 2 ? viewH : 900;
  const k = vh / (2 * Math.tan((fov * Math.PI / 180) * 0.5));
  return (worldM / d) * k;
}

/** Balloon diameter. Never under the floor, never over the cap. */
export function balloonPx(dist, viewH, fovDeg) {
  const n = projectPx(MARK_WORLD_M, dist, viewH, fovDeg);
  if (n < BALLOON_FLOOR_PX) return BALLOON_FLOOR_PX;
  if (n > BALLOON_CAP_PX) return BALLOON_CAP_PX;
  return n;
}

/** Ground-ring width under the captain. The caller derives the ellipse height. */
export function ringWidth(dist, viewH, fovDeg) {
  const n = projectPx(RING_WORLD_M, dist, viewH, fovDeg);
  if (n < 18) return 18;
  if (n > 140) return 140;
  return n;
}

/** 1 out to 60 m, then an ease to 0 at 108 m. */
export function balloonOpacity(dist) {
  if (!Number.isFinite(dist) || dist <= BALLOON_NEAR) return 1;
  if (dist >= BALLOON_FAR) return 0;
  const t = (dist - BALLOON_NEAR) / (BALLOON_FAR - BALLOON_NEAR);
  return 1 - t * t;
}

/** 優 / 良 / 可 for the results stamp. A short first trip that lands fish still reads as 良. */
export function markOf({ n = 0, kg = 0, biggest = 0 } = {}) {
  if (n >= 8 || kg >= 16 || biggest >= 70) return 'yu';
  if (n >= 3 || kg >= 6) return 'ryo';
  return 'ka';
}

/** 図鑑 size class. 小 under 50 cm, 中 to 65, 大 above that (the heavy fish). */
export function sizeClass(cm) {
  if (cm >= 65) return 'dai';
  if (cm >= 50) return 'naka';
  return 'sho';
}

export function fishId(cm) {
  return 'katsuo-' + sizeClass(cm);
}

/** End the trip into the results. `home` still sails back; this is 「帰港」, a full hold, or the clock. */
export function finishTrip(s, out) {
  if (!s || s.phase === 'done' || s.phase === 'quay') return s;
  const g = gradeOf({ n: s.holdN, kg: s.holdKg, fresh: s.fresh });
  s.grade = g;
  s.mark = markOf({ n: s.holdN, kg: s.holdKg, biggest: s.biggest });
  s.phase = 'done';
  s.swing = false;
  if (out) {
    out.event = 'landed';
    out.kg = s.holdKg;
    out.combo = s.holdN;
    out.count = s.holdN;
    out.biggest = s.biggest;
    out.grade = g;
    out.mark = s.mark;
  }
  return s;
}

export const COACH_ORDER = ['birds', 'bait', 'spray', 'pole', 'swipe'];

/**
 * The next coach line, or null. `seen` is the flag map. `s` carries phase, holdN,
 * firstFish, and whether bait / spray / the pole have happened this trip.
 * After three fish the praise line fires once, then coaching is done for good.
 */
export function coachStep(seen, s = {}) {
  const got = seen || {};
  if (got.done) return null;
  if ((s.holdN | 0) >= 3) return got.praise ? null : 'praise';
  const phase = s.phase || '';
  if (!got.birds && (phase === 'run' || phase === 'depart')) return 'birds';
  if (!got.bait && phase === 'work' && !s.baited) return 'bait';
  if (!got.spray && phase === 'work' && s.baited && !s.sprayed) return 'spray';
  if (!got.pole && phase === 'work' && s.baited && s.sprayed && !s.poled) return 'pole';
  if (!got.swipe && phase === 'swing' && s.firstFish && (s.holdN | 0) === 0) return 'swipe';
  return null;
}

export function coachSeenAfter(seen, id) {
  const next = { ...(seen || {}) };
  if (!id) return next;
  next[id] = 1;
  if (id === 'praise') {
    next.done = 1;
    for (let i = 0; i < COACH_ORDER.length; i++) next[COACH_ORDER[i]] = 1;
  }
  return next;
}

/** Where the boat sits when a trip begins at the school: just inside the work ring, bow toward the boil. */
export function groundsPose(school) {
  const x = (school?.x || 0) - 36;
  const z = (school?.z || 0) - 28;
  return { x, z, yaw: Math.atan2(36, 28) };
}

/** Seconds of ×4 off the quay before the fade to the grounds. The 8 km route at ×4 is about 12 minutes. */
export const DEPART_BEAT_S = 4.2;

/** Stick order toward a school. Far: full ahead and 4×. In the boil: a walk, no boost. */
export function helmInto(ship, target, opt, out) {
  const dx = target.x - ship.x, dz = target.z - ship.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  const err = Math.atan2(Math.sin(want - ship.yaw), Math.cos(want - ship.yaw));
  out.rudder = clamp(err * 1.6, -1, 1);
  const work = !!opt?.work;
  let throttle = dist < 100 ? 0.12 : dist < 220 ? 0.45 : 1;
  if (work && dist < 80) throttle = Math.min(throttle, 0.22);
  out.throttle = throttle;
  out.boost = !work && dist > 320;
  return out;
}

export function helmToward(ship, target, _P, opt = {}) {
  return helmInto(ship, target, opt, { throttle: 0, rudder: 0, boost: false });
}

/** Radar. yaw 0 faces +z. `u` is right, `v` is ahead, both -1..1 on the ring. */
export function radarBlip(x, z, yaw, sx, sz, see) {
  const dx = sx - x, dz = sz - z;
  const dist = Math.hypot(dx, dz);
  const ahead = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const u = dist > 1 ? right / dist : 0;
  const v = dist > 1 ? ahead / dist : 0;
  return { on: dist < see, u, v, dist };
}

export function sonar(dist, nabura) {
  if (dist >= CFG.seeBirds) return 0;
  const near = 1 - dist / CFG.seeBirds;
  return clamp(near * near * (0.25 + 0.75 * clamp(nabura, 0, 1)), 0, 1);
}

const LOG_KEY = 'klc.play.v1';

export function readLog(storage) {
  try {
    const o = JSON.parse(storage.getItem(LOG_KEY) || '{}');
    return o.ippon || { trips: 0, kg: 0, biggest: 0, n: 0 };
  } catch {
    return { trips: 0, kg: 0, biggest: 0, n: 0 };
  }
}

/** Merge a landing into klc.play.v1 without touching the kit's other fields. */
export function rememberTrip(storage, trip) {
  let o = {};
  try { o = JSON.parse(storage.getItem(LOG_KEY) || '{}') || {}; } catch { o = {}; }
  const ip = o.ippon || { trips: 0, kg: 0, biggest: 0, n: 0 };
  ip.trips = (ip.trips || 0) + 1;
  ip.kg = Math.round(((ip.kg || 0) + (trip.kg || 0)) * 10) / 10;
  ip.n = (ip.n || 0) + (trip.n || 0);
  ip.biggest = Math.max(ip.biggest || 0, trip.biggest || 0);
  if (trip.at) ip.last = trip.at;
  o.ippon = ip;
  if (!o.v) o.v = 1;
  storage.setItem(LOG_KEY, JSON.stringify(o));
  return ip;
}

export function createSession() {
  return {
    phase: 'quay', nabura: 0, hot: 0, combo: 0, since: 0,
    holdN: 0, holdKg: 0, biggest: 0, fish: [], iced: false, fresh: 1,
    swing: false, swingT: 0, big: false, set: false, cm: 0, wait: 0, quality: null,
    firstFish: 0, tripT: 0, mark: '',
  };
}

export function readSeen(storage) {
  try {
    const o = JSON.parse(storage.getItem(LOG_KEY) || '{}');
    const s = o.ippon && o.ippon.seen;
    return s && typeof s === 'object' ? { ...s } : {};
  } catch {
    return {};
  }
}

export function writeSeen(storage, seen) {
  let o = {};
  try { o = JSON.parse(storage.getItem(LOG_KEY) || '{}') || {}; } catch { o = {}; }
  const ip = o.ippon || { trips: 0, kg: 0, biggest: 0, n: 0 };
  ip.seen = { ...(seen || {}) };
  o.ippon = ip;
  if (!o.v) o.v = 1;
  storage.setItem(LOG_KEY, JSON.stringify(o));
  return ip.seen;
}

export function readFished(storage) {
  try {
    const o = JSON.parse(storage.getItem(LOG_KEY) || '{}');
    return !!(o.ippon && (o.ippon.trips || o.ippon.fished));
  } catch {
    return false;
  }
}

/** One 図鑑 row per size class, on the same klc.play.v1 object as the trip log. */
export function noteFish(storage, cm) {
  const id = fishId(cm);
  let o = {};
  try { o = JSON.parse(storage.getItem(LOG_KEY) || '{}') || {}; } catch { o = {}; }
  if (!o.fish || typeof o.fish !== 'object') o.fish = {};
  const row = o.fish[id] && typeof o.fish[id] === 'object' ? o.fish[id] : { n: 0, maxCm: 0, first: '' };
  row.n = (row.n | 0) + 1;
  row.maxCm = Math.max(row.maxCm || 0, cm || 0);
  if (!row.first) {
    const d = new Date();
    row.first = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  o.fish[id] = row;
  if (!o.v) o.v = 1;
  storage.setItem(LOG_KEY, JSON.stringify(o));
  return row;
}

export function markFished(storage) {
  let o = {};
  try { o = JSON.parse(storage.getItem(LOG_KEY) || '{}') || {}; } catch { o = {}; }
  const ip = o.ippon || { trips: 0, kg: 0, biggest: 0, n: 0 };
  ip.fished = 1;
  o.ippon = ip;
  if (!o.v) o.v = 1;
  storage.setItem(LOG_KEY, JSON.stringify(o));
  return ip;
}

function feed(s, input, dt) {
  if (s.phase === 'work' || s.phase === 'pole' || s.phase === 'swing') {
    s.nabura = naburaStep(s.nabura, input, dt, s.hot);
    if (s.nabura >= CFG.nabura.biteAt) s.hot += dt;
  }
}

/** One step. Writes `out.event` ('catch' | 'set' | 'miss' | 'landed' | null) and catch fields. */
export function sessionStep(s, input, dt, cfg, rng, out) {
  out.event = null;
  const d = dt > 0 ? dt : 0;
  if (s.combo > 0) s.since += d;
  if (input.ice) s.iced = true;
  if (s.holdN > 0 && s.phase !== 'done') s.fresh = freshStep(s.fresh, s.iced, d);
  feed(s, input, d);

  if (input.home && s.phase !== 'quay' && s.phase !== 'auction' && s.phase !== 'done' && s.phase !== 'return') {
    s.phase = 'return'; s.swing = false;
    return s;
  }
  if (input.finish && s.phase !== 'quay' && s.phase !== 'done' && s.phase !== 'auction') return finishTrip(s, out);
  const resolving = s.phase === 'swing' && !!input.lift;
  if (!resolving && (s.phase === 'work' || s.phase === 'pole' || s.phase === 'swing')) {
    s.tripT = (s.tripT || 0) + d;
    const cap = cfg.trip || CFG.trip;
    if (s.holdKg >= cap.holdKg || s.tripT >= cap.seconds) return finishTrip(s, out);
  }

  if (s.phase === 'quay') {
    if (input.castOff) s.phase = 'run';
    return s;
  }
  if (s.phase === 'run') {
    if (input.dist < cfg.workRadius) {
      if (input.rush) { out.event = 'spook'; return s; }
      s.phase = 'work';
    }
    return s;
  }
  if (s.phase === 'work') {
    if (s.hot > cfg.nabura.sessionS && s.nabura < 0.12) { s.phase = 'run'; out.event = 'scatter'; return s; }
    if (input.dist > cfg.workRadius * 1.6) s.phase = 'run';
    else if (input.pole && s.nabura >= cfg.nabura.biteAt) {
      s.phase = 'pole';
      s.wait = biteGap(s.nabura, s.combo);
    }
    return s;
  }
  if (s.phase === 'pole') {
    s.wait -= d;
    if (s.wait <= 0) {
      s.phase = 'swing';
      s.swing = true;
      s.swingT = 0;
      s.set = false;
      s.big = rng() < cfg.fish.bigP;
      s.cm = rollCm(rng, s.big);
    }
    return s;
  }
  if (s.phase === 'swing') {
    s.swingT += d * 1000;
    const wide = !!(s.firstFish && s.holdN === 0);
    const gate = liftWindow(wide);
    if (input.lift) {
      const j = judgeLift({ dtMs: input.lagMs || s.swingT, strength: input.strength || 0, big: s.big, set: s.set, wide });
      s.quality = j.quality;
      if (j.set && !j.hit) { s.set = true; out.event = 'set'; return s; }
      if (j.hit) {
        const kg = kgFromCm(s.cm);
        s.holdN += 1;
        s.holdKg = Math.round((s.holdKg + kg) * 10) / 10;
        if (s.cm > s.biggest) s.biggest = s.cm;
        s.fish.push({ cm: s.cm, kg });
        s.combo = nextCombo(s.combo, true, s.since);
        s.since = 0;
        s.swing = false;
        s.phase = 'pole';
        s.wait = biteGap(s.nabura, s.combo);
        out.event = 'catch';
        out.cm = s.cm;
        out.kg = kg;
        out.holdKg = s.holdKg;
        out.size = sizeClass(s.cm);
        return s;
      }
      if (wide) {
        s.swing = false;
        s.phase = 'pole';
        s.wait = biteGap(Math.max(s.nabura, 0.5), 0);
        out.event = 'wait';
        return s;
      }
      s.combo = nextCombo(s.combo, false, 0);
      s.swing = false;
      s.phase = 'pole';
      s.wait = biteGap(0.2, 0);
      out.event = 'miss';
      return s;
    }
    if (s.swingT > gate.giveUp) {
      if (wide) {
        s.swing = false;
        s.phase = 'pole';
        s.wait = biteGap(Math.max(s.nabura, 0.5), 0);
        out.event = 'wait';
        return s;
      }
      s.combo = nextCombo(s.combo, false, 0);
      s.swing = false;
      s.phase = 'pole';
      s.wait = biteGap(0.2, 0);
      out.event = 'miss';
    }
    return s;
  }
  if (s.phase === 'return') {
    if (input.nearHome && input.dock) s.phase = 'auction';
    return s;
  }
  if (s.phase === 'auction' && input.confirm) {
    const g = gradeOf({ n: s.holdN, kg: s.holdKg, fresh: s.fresh });
    s.grade = g;
    s.phase = 'done';
    out.event = 'landed';
    out.kg = s.holdKg;
    out.combo = s.holdN;
    out.count = s.holdN;
    out.biggest = s.biggest;
    out.grade = g;
    s.mark = markOf({ n: s.holdN, kg: s.holdKg, biggest: s.biggest });
    out.mark = s.mark;
  }
  return s;
}
