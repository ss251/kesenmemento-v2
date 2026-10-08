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

/** [feel] What shortens the walker's boom at once: a wall or an eave (a solid at least `wide` across), wherever it rises above the line from
 *  the camera to his head. A thin solid (a passer-by, a pole, a sign, a wire, a street tree's trunk, about 0.5 m) does not: it is SIGHT's.
 *  `maxIn` is the most the boom may shorten in one frame (a cut is not a frame of walking). `floor` is the camera's clearance above the
 *  ground under it. */
export const BOOM = Object.freeze({ wide: 0.7, floor: 0.6, maxIn: 0.24 });

/**
 * [sight] The camera keeps him in sight. He is 1.15 m tall: "him" is five lines from the camera, to his head, chest and hip and a shoulder
 * each side ([height above his feet, metres to his right]), walked from him toward the camera in `step` samples.
 * - A wall on the line to his head shortens the boom (BOOM: eased, `maxIn` a frame). The camera stops `margin` in front of it.
 * - A thin solid does not, unless it hides him: every line blocked. That is geometry: the lines are 0.4 m apart at his body and meet at the
 *   camera, so a pole 1.5 m from the lens hides all five, a pole beside him hides none. He may be hidden for `brief` seconds (a pole going
 *   by); after that the boom comes in over `ramp` seconds, on a quicker spring (`wHide`). It does not come in below `minThin`: a pole at his
 *   heels is not worth his head.
 * - The forest's trunks (placeWalk's `softAt`: no collider, he walks through them) count here only, never as a wall.
 * - A cut (a placed pose, a jump of his feet over `cut` metres) has no history: it solves straight to the clear distance.
 */
export const SIGHT = Object.freeze({
  lines: Object.freeze([[0.85, 0], [0.5, 0], [0.2, 0], [0.65, 0.2], [0.65, -0.2]]),
  step: 0.15, margin: 0.3, brief: 0.4, ramp: 0.3, relax: 3, wHide: 36, minThin: 1.2, cut: 2,
});

/** How far a solid reaches from (x,y,z) along ±(dx,dz), in metres (0.2 m steps, 1 m each way). */
function span(solidAt, x, y, z, dx, dz) {
  let a = 0, b = 0;
  for (let s = 0.2; s <= 1.01; s += 0.2) { if (solidAt(x + dx * s, y, z + dz * s)) a = s; else break; }
  for (let s = 0.2; s <= 1.01; s += 0.2) { if (solidAt(x - dx * s, y, z - dz * s)) b = s; else break; }
  return a + b;
}
// eight lines through the point, 22.5 degrees apart (the axes first: most walls are on them)
const DIRS = [0, 4, 2, 6, 1, 5, 3, 7].map((i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);
/**
 * How wide the solid at this sample is: its longest reach through the point, over eight lines, to 2 m (it stops as soon as it is
 * `BOOM.wide`). The reach along the ray and across it was not enough: a 0.3 m wall met at 45 degrees is 0.42 m deep either way, and read as a
 * pole. A pole, a trunk of 0.5 m, a passer-by are under 0.5 m whichever way you cross them.
 */
function solidWidth(solidAt, x, y, z) {
  let w = 0;
  for (let i = 0; i < DIRS.length; i++) {
    const v = span(solidAt, x, y, z, DIRS[i][0], DIRS[i][1]);
    if (v > w) { w = v; if (w >= BOOM.wide) return w; }
  }
  return w;
}

/** True when the solid at this sample is a wall or an eave: at least BOOM.wide across (any heading), whatever its height. Thin solids return false.
 *  (The heading arguments of the old test are kept for the callers.) */
export function occludesBoom(solidAt, x, y, z) {
  if (!solidAt || !solidAt(x, y, z)) return false;
  return solidWidth(solidAt, x, y, z) >= BOOM.wide;
}

function walkBlocked(solidAt, x, y, z, px, pz, C) {
  if (!solidAt) return false;
  if (occludesBoom(solidAt, x, y, z)) return true;
  const r = C.boomRadius > 0 ? C.boomRadius : 0;
  if (!(r > 0)) return false;
  return occludesBoom(solidAt, x + px * r, y, z + pz * r)
    || occludesBoom(solidAt, x - px * r, y, z - pz * r);
}

/**
 * The walker's boom. Same march as solveBoom, but the ground does not count (a slope or a stair keeps the framing) and a thin solid does
 * not either. With `head` (the point of his head) it also walks the line from his head to the ideal camera: a wall that rises above that
 * line anywhere along it shortens the boom, however low it is under the camera (the old "top <= camera + 0.35" let a 2.4 m wall hide him).
 */
export function solveWalkBoom(from, to, solidAt, out, C = THIRD, head = null) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  out.x = from.x; out.y = from.y; out.z = from.z; out.dist = 0;
  if (!(len > 1e-4)) return out;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const px = -uz, pz = ux;
  const step = C.boomStep;
  let reach = 0;
  let hit = false;
  // a ray that starts inside a building (the phone's solid footprint over a stair) must not collapse:
  // stay inside that solid until the ray leaves it, then occlude on the next wall
  let embedded = walkBlocked(solidAt, from.x, from.y, from.z, px, pz, C);
  for (let d = step; d <= len + 1e-4; d += step) {
    const s = Math.min(d, len);
    const x = from.x + ux * s, y = from.y + uy * s, z = from.z + uz * s;
    const blocked = walkBlocked(solidAt, x, y, z, px, pz, C);
    if (embedded) {
      if (blocked) { reach = s; continue; }
      embedded = false;
    }
    if (blocked) { hit = true; break; }
    reach = s;
    if (s >= len - 1e-4) break;
  }
  if (!hit && reach < len - 1e-3) reach = len;
  if (reach <= 0) reach = Math.min(0.08, len);
  if (head && solidAt) {
    const hx = to.x - head.x, hy = to.y - head.y, hz = to.z - head.z, hl = Math.hypot(hx, hy, hz);
    if (hl > SIGHT.step * 2) {
      const ex = hx / hl, ey = hy / hl, ez = hz / hl;
      let emb = embedded || !!solidAt(head.x, head.y, head.z);   // (as the ray: from inside a solid, leave it first; a few centimetres of height must not decide)
      for (let d = SIGHT.step; d < hl - 0.05; d += SIGHT.step) {
        const x = head.x + ex * d, y = head.y + ey * d, z = head.z + ez * d;
        if (!solidAt(x, y, z)) { emb = false; continue; }
        if (emb || solidWidth(solidAt, x, y, z) < BOOM.wide) continue;   // (a thin thing is SIGHT's)
        const b = Math.max((d - SIGHT.margin) * len / hl, Math.min(0.08, len));
        if (b < reach) reach = b;
        break;
      }
    }
  }
  out.x = from.x + ux * reach;
  out.y = from.y + uy * reach;
  out.z = from.z + uz * reach;
  out.dist = reach;
  return out;
}

/**
 * [sight] Walk one line from his body point (tx,ty,tz) toward the camera (cx,cy,cz). Returns the metres from his body to the first solid
 * (0 when the line is clear). A line that starts inside a solid (he stands in a forest trunk, or in a footprint the phone tier draws
 * solid) skips that solid. `len` receives the line's length.
 */
const _sl = { len: 0 };
function sightLine(solidAt, tx, ty, tz, cx, cy, cz) {
  const dx = cx - tx, dy = cy - ty, dz = cz - tz, L = Math.hypot(dx, dy, dz);
  _sl.len = L;
  if (!(L > SIGHT.step * 2)) return 0;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  let emb = !!solidAt(tx, ty, tz);
  for (let d = SIGHT.step; d < L - 0.05; d += SIGHT.step) {
    if (!solidAt(tx + ux * d, ty + uy * d, tz + uz * d)) { emb = false; continue; }
    if (!emb) return d;
  }
  return 0;
}

/**
 * [sight] Is he hidden from a camera at (cx,cy,cz): every one of the five lines blocked? Returns the largest boom fraction (0..1 of the
 * line) at which his head or chest is clear again, or 1 when he is not hidden. `feet` is where he is drawn, `yaw` the view's heading
 * (the shoulders are to its right). Cheap when he is seen: the first clear line ends the scan.
 */
export function sightClear(solidAt, feet, yaw, cx, cy, cz) {
  if (!solidAt) return 1;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw), n = SIGHT.lines.length;
  let best = 0;   // the farthest first hit, of the head and the chest
  for (let k = 0; k < n; k++) {
    const l = SIGHT.lines[k];
    const s = sightLine(solidAt, feet.x + rx * l[1], feet.y + l[0], feet.z + rz * l[1], cx, cy, cz);
    if (s === 0) return 1;
    if (k < 2) { const f = (s - SIGHT.margin) / _sl.len; if (f > best) best = f; }
  }
  return best < 0 ? 0 : best;
}

/**
 * [sight] The ground he is drawn on. Physics stands him on the DEM; the terrain skin is triangles on coarse grids away from the hero
 * zone, and there it can lie about a metre above the DEM (大島の船着場, 警察署, パールシティ: he stood in the drawn ground to his chest, and the
 * camera 4.5 m back saw only the top of his head). Where a road is cut into a slope the skin lies below the DEM instead, and a road mesh
 * is drawn at the DEM: so the drawn ground is the higher of the two, and only on bare terrain (nothing walkable under him).
 * `surfaceAt(x, z)` is environment's rendered surface. Metres to lift him (and the camera's picture of him), 0 to `max`.
 */
export function terrainLift(heightAt, groundHeight, surfaceAt, x, y, z, max = 1.5) {
  if (typeof surfaceAt !== 'function' || typeof heightAt !== 'function') return 0;
  const dem = heightAt(x, z);
  if (!(Math.abs(y - dem) < 0.3)) return 0;                                  // a deck, a stair, a roof: not the terrain
  if (typeof groundHeight === 'function' && groundHeight(x, z, y) > dem + 0.05) return 0;   // a walk box is under him
  const lift = surfaceAt(x, z) - dem;
  return lift > 0.02 ? Math.min(max, lift) : 0;
}

/**
 * [sight] An arrival with a wall or a trunk at his back has no room for the boom (the 気仙沼ハリストス正教会 spot: a 1.1 m trunk 0.4 m behind
 * him; the boom collapsed to his head and the picture looked straight down). Of the places `steps` metres ahead of the spot, along the view,
 * take the nearest where the boom is at least `good` of its length; failing that the one that gains most (at least `gain` metres),
 * else the spot itself. `boomAt(s)` is the boom there (a negative number: he cannot stand there). -> metres ahead.
 */
export const ARRIVE = Object.freeze({ steps: Object.freeze([0.75, 1.5, 2.25, 3, 3.75]), good: 0.7, gain: 0.5 });
export function chooseArrival(boomAt, C, A = ARRIVE) {
  const here = boomAt(0);
  if (here >= A.good * C.dist) return 0;
  let best = 0, bestBoom = here;
  for (const s of A.steps) {
    const b = boomAt(s);
    if (!(b >= 0)) continue;
    if (b >= A.good * C.dist) return s;
    if (b > bestBoom) { best = s; bestBoom = b; }
  }
  return bestBoom >= here + A.gain ? best : 0;
}

/** The ground the walker is on. `groundHeight(x, z, 1e9)` is the highest deck in the column: on PIER7 that is an upper
 *  landing, the boom ray was "below the ground", and the camera snapped to his chest. Ask within `up` metres of his feet. */
export const WALK_GROUND_UP = 2.5;
export function walkGround(groundHeight, feetY, x, z, up = WALK_GROUND_UP) {
  return groundHeight(x, z, (Number.isFinite(feetY) ? feetY : 0) + up);
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
 * - the boom length eases in quickly (20 /s) and out slowly (4 /s) toward the clear distance, and never shortens by more than
 *   BOOM.maxIn (0.24 m) in one frame: a wall is not snapped through, and it is not snapped to;
 * - beside a wall the shoulder offset is pulled in toward his column (14 /s in, 4 /s back out), probed 1.5x out so it starts early.
 */
export const WALK = { wXZ: 24, wY: 9, ff: true, lead: 0.14, leadAngle: 0.176, leadLook: true, wLeadUp: 4, wLeadDown: 12, wIn: 20, wOut: 4, wSide: 14, wRise: 12, shortLook: 0.9, maxIn: BOOM.maxIn };

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
    hid: 0, hideW: 0, seen: true, fx: NaN, fy: NaN, fz: NaN, cut: false,
    x: 0, y: 2, z: 0, tx: 0, ty: 0, tz: 0, dist: 0 };
}

const _w = { x: 0, v: 0 };
const _wFrom = { x: 0, y: 0, z: 0 }, _wWant = { x: 0, y: 0, z: 0 }, _wHard = { x: 0, y: 0, z: 0, dist: 0 }, _wCam = { x: 0, y: 0, z: 0, dist: 0 }, _head = { x: 0, y: 0, z: 0 };

/** Track (pos, vel) toward a target moving at `V`: predict at its own speed, then damp the error and the speed difference. Writes _w. */
function trackFF(pos, vel, T, V, dt, w) {
  damp1(pos + vel * dt - T, vel - V, 0, dt, w, _w);
  _w.x += T; _w.v += V;
  return _w;
}

/**
 * One walker camera sample. `f` is the player's frame { x, y, z (drawn feet), vx, vz, dt, landing }; `yaw` the view's heading; `solidAt`
 * and `groundAt` as for placeChase; `snap` lands on the target (reduced motion, a still, a placed pose); C = thirdFor(aspect).
 * Writes st.x/y/z (camera), st.tx/ty/tz (look point) and st.boom, and st.cut when this frame was a cut: a placed pose, the first frame, a
 * frame with no time, or his feet more than SIGHT.cut metres from where the last frame had them (a teleport, an arrival, a door, a car's
 * exit). A cut solves straight to the clear distance; walking eases (see the walls and SIGHT above). `snap` alone (reduced motion) lands
 * every frame on its target with no easing, but is not a cut: a pole going by still gets its moment. A caller that tells the frame
 * which it is (`f.cut`) says whether `snap` is a cut; without it, a snap is a cut.
 * `softAt` (optional) is a solid the walls never see but that can hide him: the forest's trunks, which he walks through (no collider).
 * It counts in SIGHT only (hidden for a moment, and not below SIGHT.minThin), never as a wall. Writes st.seen: he is seen from where the
 * boom is going (false: hidden and nothing to be done, e.g. a trunk at his heels).
 */
let _anyA = null, _anyB = null;
function anyAt(x, y, z) { return _anyA(x, y, z) || _anyB(x, y, z); }
export function placeWalk(st, f, yaw, solidAt, groundAt, snap, C = THIRD, W = WALK, softAt = null) {
  const dt = f.dt > 0 ? f.dt : 0;
  const jumped = st.ready && Number.isFinite(st.fx) && Math.hypot(f.x - st.fx, (f.y || 0) - st.fy, f.z - st.fz) > SIGHT.cut;
  const hard = snap || !st.ready || !(dt > 0) || jumped;
  const cut = f.cut === undefined ? hard : (!!f.cut || !st.ready || !(dt > 0) || jumped);
  st.cut = cut;
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
  // the boom: from the look point back along the view. A wall or an eave on the ray, or above the line from his head to the camera,
  // shortens it (eased, at most BOOM.maxIn a frame; a cut goes straight to it). The ground, a passer-by, a pole, a sign, a wire
  // and a thin trunk do not, unless they hide him (below).
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
  if (solidAt && occludesBoom(solidAt, st.sx, st.sy, st.sz)) { st.sx = f.x; st.sz = f.z; st.vx = Vx; st.vz = Vz; }
  _wFrom.x = st.sx; _wFrom.y = st.sy; _wFrom.z = st.sz;
  _wWant.x = st.sx - fx * C.dist * cp; _wWant.y = st.sy - C.dist * sp; _wWant.z = st.sz - fz * C.dist * cp;
  const len = C.dist > 1e-6 ? C.dist : 1;
  _head.x = f.x; _head.y = (f.y || 0) + SIGHT.lines[0][0]; _head.z = f.z;
  solveWalkBoom(_wFrom, _wWant, solidAt, _wHard, C, _head);
  // [sight] hidden by a thin thing: from the camera the walls leave him, every line to his body is blocked. A moment of it (a pole going by)
  // changes nothing; a cut has no moment. After SIGHT.brief the boom comes in over SIGHT.ramp, to where his head or chest is clear again.
  let aim = _wHard.dist, hideW = 0, seen = true;
  if ((solidAt || softAt) && aim > SIGHT.minThin + 0.05) {
    const kk = aim / len;
    let any = solidAt;
    if (solidAt && softAt) { _anyA = solidAt; _anyB = softAt; any = anyAt; } else if (softAt) any = softAt;
    const clear = sightClear(any, f, yaw, st.sx + (_wWant.x - st.sx) * kk, st.sy + (_wWant.y - st.sy) * kk, st.sz + (_wWant.z - st.sz) * kk);
    const hidden = clear < 1 && aim * clear >= SIGHT.minThin;
    if (cut) st.hid = hidden ? SIGHT.brief + SIGHT.ramp : 0;
    else st.hid = hidden ? st.hid + dt : Math.max(0, st.hid - SIGHT.relax * dt);
    const q = Math.min(1, Math.max(0, (st.hid - SIGHT.brief) / SIGHT.ramp));
    hideW = q * q * (3 - 2 * q);
    if (hidden && hideW > 0) aim += (aim * clear - aim) * hideW;
    seen = clear >= 1 || (hidden && hideW >= 1 - 1e-6);
  } else st.hid = 0;
  st.hideW = hideW; st.seen = seen;
  if (hard) { st.boom = aim; st.boomV = 0; }
  else {
    const prevBoom = st.boom;
    damp1(st.boom, st.boomV, aim, dt, aim < st.boom ? W.wIn + (SIGHT.wHide - W.wIn) * hideW : W.wOut, _w); st.boom = _w.x; st.boomV = _w.v;
    const cap = W.maxIn > 0 ? W.maxIn : BOOM.maxIn;
    if (prevBoom - st.boom > cap) { st.boom = prevBoom - cap; st.boomV = 0; }
    else if (st.boom - prevBoom > cap) { st.boom = prevBoom + cap; st.boomV = 0; }
  }
  const k = st.boom / len;
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
  // a low solid the boom rode over (a car roof just above the ray): step up out of it, at most one frame's cap.
  // a wall is left for the boom ease — the old snap to the solved point dropped the picture in one frame
  if (solidAt && solidAt(st.x, st.y, st.z) && !occludesBoom(solidAt, st.x, st.y, st.z)) {
    const cap = W.maxIn > 0 ? W.maxIn : BOOM.maxIn;
    for (let s = 0.05; s <= cap + 1e-6; s += 0.05) if (!solidAt(st.x, st.y + s, st.z)) { st.y += s; break; }
  }
  // the look point: lower for a short boom (his body stays in frame under a lintel); a gull's own rig never comes here
  const u = st.boom >= (C.liftAt ?? 2.4) ? 1 : st.boom / (C.liftAt ?? 2.4);
  const look = Math.min(C.height, W.shortLook + (C.height - W.shortLook) * u);
  st.tx = st.sx + (W.leadLook ? st.lx : 0); st.ty = st.sy - C.height + look; st.tz = st.sz + (W.leadLook ? st.lz : 0);
  // never under the ground he is actually over, and never below the look point (that view looks up at him from his feet).
  // a deck several metres above the camera is a ceiling, not the floor, so it does not throw him up onto it.
  // letting that clearance go is capped, so stepping off a high surface does not drop the picture in one frame
  if (groundAt) {
    // the surface the camera is actually above. groundHeight also returns a tread within a step ABOVE the
    // query, so ask from just below the camera: the next stair up must not lift him and steepen the view
    const g = groundAt(st.x, st.z, st.y - 0.45);
    if (Number.isFinite(g) && g < st.y + 1.2 && st.y < g + BOOM.floor) st.y = g + BOOM.floor + 1e-4;
  }
  if (st.y < st.ty) st.y = st.ty;
  if (!hard && dt > 0 && Number.isFinite(st.camY)) {
    const cap = W.maxIn > 0 ? W.maxIn : BOOM.maxIn;
    const feetD = (f.y || 0) - (Number.isFinite(st.feetY) ? st.feetY : (f.y || 0));
    const lo = st.camY + feetD - cap;
    // follow a step up, and don't fall through the clearance: never more than cap behind his feet.
    // a lift to the floor is left alone (pulling it back down put the camera in the stair)
    if (st.y < lo) st.y = lo;
    if (st.y < st.ty) st.y = st.ty;
  }
  st.camY = st.y; st.feetY = f.y || 0;
  st.fx = f.x; st.fy = f.y || 0; st.fz = f.z;
  st.dist = st.boom;
  st.ready = true;
  return st;
}
