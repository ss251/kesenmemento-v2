// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// First-person walker: pointer-lock mouse look (drag-look fallback), WASD / arrows, Shift run,
// Space jump, F fly (noclip). Touch (the floating stick, the drag look, the jump / fly buttons) lives in ui/touchpad.js:
// the player consumes pad.move, pad.takeLook() and the pad's jump / fly / land events (attachPad).
import * as THREE from 'three';
import { STEP_HEIGHT } from './physics.js';
import { chaseOwns, damp1 } from '../play/avatar/camera.js';
import { mouseLook, lookBlocked } from '../ui/look-settings.js';

const DEG = Math.PI / 180;
export const FLY = 25, FLY_RUN = 70;   // [v4:polish3] fly speeds, m/s
/** [v5:fix3] feet height of a walking eye placed over open water (sea level 0 + a small boat deck), m */
export const SEA_DECK = 0.6;

/**
 * [feel] How the walk feels (the movement-feel lane; measured by tools/anime/feel-probe.mjs, numbers in docs/play/FEEL.md). Every rate is
 * per second and every spring is solved exactly over the step, so 30 and 60 fps (and the fixed 1/60 s step) give the same curves.
 * - wGo / wStop: the ground velocity is a critically damped spring toward the stick's velocity. Speeding up or steering at 38 /s reaches
 *   90 % in 0.10 s on an S-curve that already moves on the first step; stopping at 46 /s is under 5 % in 0.10 s, a 0.13 m stop from a
 *   walk, and never runs past the stop (no overshoot, no slide).
 * - wTurn: third person turns him to face the stick on a critically damped angle: 180° within 10° in 0.15 s, a nudge of the stick curves.
 *   While he faces away from where the stick points his speed is held back (pivotFrom..pivotTo, the cosine of the angle left to turn):
 *   a reversal is a quick pivot on the spot, never a walk backwards.
 * - wLift: a grounded walker follows the ground down a kerb, a stair or a slope (up to STEP_HEIGHT, no fall off each step), and the drawn
 *   feet ease over every step the physics takes in one go (~0.15 s) instead of jumping by it.
 * - land*: ending a flight over the sea (or high above the town) is an eased descent to the nearest quay or street, never a fall onto the
 *   water (landSpot).
 */
export const FEEL = {
  wGo: 38, wStop: 46, wTurn: 30, wLift: 26,
  pivotFrom: Math.cos(35 * DEG), pivotTo: Math.cos(120 * DEG),
  landHigh: 3, landMin: 0.6, landMax: 1.6, landPerM: 1 / 150, landRadius: 600,
};

const _d = { x: 0, v: 0 };
/** prefers-reduced-motion (CRAFT.md §4: motion becomes a fade, or nothing): a landing is then a cut to the quay, not a descent. */
function reducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/** [feel] The share of his speed allowed while he still has `err` radians to turn toward the stick (1 when facing it, 0 from 120° off). */
export function pivotScale(err) { return smooth01(FEEL.pivotTo, FEEL.pivotFrom, Math.cos(err)); }

/** [feel] Can a walker stand at (x, z)? Land (or a deck over the water) with nothing solid at his body's height, 0.6 m of room around and
 *  ground within 0.3 m across that room (not a roof edge or a wall's foot). Returns the street-level ground height, or null. */
export function spotGround(P, x, z) {
  const t = P.heightAt(x, z);
  const base = Math.max(t, 0) + 1;   // walkable tops up to ~1.45 m above the terrain: pavements, quays, decks and steps, never roofs
  if (P.isWater?.(x, z) && !(P.standable?.(x, z, base))) return null;
  const g = P.groundHeight(x, z, base);
  if (P.isWater?.(x, z) && g < 0.2) return null;
  for (let i = 0; i < 5; i++) {
    const ox = i === 1 ? 0.6 : i === 2 ? -0.6 : 0, oz = i === 3 ? 0.6 : i === 4 ? -0.6 : 0;
    const px = x + ox, pz = z + oz;
    if (P.solidAt(px, pz, g + 0.5) || P.solidAt(px, pz, g + 1.2)) return null;
    if (i && (Math.abs(P.groundHeight(px, pz, g + 0.3) - g) > 0.3 || (P.isWater?.(px, pz) && !P.standable?.(px, pz, g + 0.3)))) return null;
  }
  return g;
}

/**
 * [feel] The nearest place to land a walk that ends a flight at (x, z): rings outward (2 m apart near, 8 % apart far, up to FEEL.landRadius);
 * on the first ring with good ground, the spot most in front of the view (yaw), then up to 3 m further the same way when that is still good
 * ground (off the very edge of a quay). Writes { x, y, z } into `out`; null when there is nowhere within reach.
 */
export function landSpot(P, x, z, yaw, out = { x: 0, y: 0, z: 0 }) {
  const here = spotGround(P, x, z);
  if (here !== null) { out.x = x; out.y = here; out.z = z; return out; }
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (let r = 2; r <= FEEL.landRadius; r = r < 30 ? r + 2 : r * 1.08) {
    const n = Math.min(160, Math.max(16, Math.ceil(2 * Math.PI * r / 2.5)));
    let bx = 0, bz = 0, bdx = 0, bdz = 0, best = -3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const dot = dx * fx + dz * fz;
      if (dot <= best) continue;
      if (spotGround(P, x + dx * r, z + dz * r) === null) continue;
      best = dot; bx = x + dx * r; bz = z + dz * r; bdx = dx; bdz = dz;
    }
    if (best > -3) {
      for (const more of [3, 2, 1]) {
        if (spotGround(P, bx + bdx * more, bz + bdz * more) !== null) { bx += bdx * more; bz += bdz * more; break; }
      }
      out.x = bx; out.z = bz; out.y = spotGround(P, bx, bz);
      return out;
    }
  }
  return null;
}

export class Player {
  constructor(camera, dom, physics, bounds) {
    this.camera = camera; this.dom = dom; this.physics = physics; this.bounds = bounds;
    this.pos = new THREE.Vector3(0, 0, 0); // feet
    this.prevPos = new THREE.Vector3();   // [smooth] the feet one simulation step ago (present() blends prevPos -> pos)
    this._p = { x: 0, z: 0 };
    this.vel = new THREE.Vector3();
    this.acc = new THREE.Vector2();       // [feel] the ground velocity spring's rate of change (x, z)
    this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.face = 0; this.faceV = 0; this.prevFace = 0; this.faceErr = 0;   // [feel] the body's heading (third person: toward the stick), its rate, last step's, the turn left
    this.lift = 0; this.liftV = 0; this.prevLift = 0;   // [feel] drawn feet - physics feet (eases a step out), its rate, last step's
    this.eye = 1.52; this.radius = 0.3; this.height = 1.7;
    this.walk = 3.1; this.run = 6.4;
    this.fly = false; this.enabled = false; this.onGround = true;
    this.gull = false;
    this.keys = new Set();
    this.bob = 0; this.smoothY = null;
    this.look = { dx: 0, dy: 0 };
    this._touchMove = new THREE.Vector2();   // the stick when there is no pad (tests, the ship branch's fallback)
    this.pad = null; this.lookSink = null;
    this.distance = 0;
    this._landing = null; this._spot = { x: 0, y: 0, z: 0 }; this._flyWas = false; this._placed = false;
    this._bind();
  }

  /** Backward compatible: the touch stick as a Vector2 (x right, y down, length 0..1). The pad's when it is attached. */
  get touchMove() { return this.pad ? this.pad.move : this._touchMove; }
  set touchMove(v) { this._touchMove.copy(v); }

  /** Take the touch pad's input: its stick, its look deltas and the jump / fly / land buttons. */
  attachPad(pad) {
    this.pad = pad;
    pad?.on?.((e) => {
      if (e.type !== 'action') return;
      if (e.id === 'jump') this.jump();
      else if (e.id === 'fly') { this.fly = true; this.vy = 0; this.onGround = false; }
      else if (e.id === 'land') this.fly = false;
    });
    return this;
  }
  /** A jump from the ground (the Space key's one). */
  jump() { if (this.enabled && this.onGround && !this.fly && !this._landing) { this.vy = 4.2; return true; } return false; }

  _bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.fly = !this.fly;
      if (e.code === 'Space' && this.enabled && (this.onGround || this.fly) && !this._landing) { if (!this.fly) this.vy = 4.2; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // mouse look
    let dragging = false, lx = 0, ly = 0;
    d.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', (e) => {
      if (lookBlocked()) return;
      if (!this.enabled && !this.lookWhileDisabled) return;
      if (document.pointerLockElement === d) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
      else if (dragging) { this.look.dx += (e.clientX - lx) * 1.4; this.look.dy += (e.clientY - ly) * 1.4; lx = e.clientX; ly = e.clientY; }
    });
  }

  requestLock() {
    if (lookBlocked()) return;
    try { const p = this.dom.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag-look fallback */ }
  }

  /** x,z world; yaw/pitch in degrees (yaw 0 = north). y optional (fly). */
  setPose(x, z, yawDeg = 0, pitchDeg = 0, y = null) {
    this.pos.set(x, 0, z);
    this.pos.y = y !== null ? y - this.eye : this.physics.groundHeight(x, z, 1e9);
    // [v5:fix3] a walking eye set over open water stands at boat-deck height on the surface, never on the seabed: the
    // eye under the sea saw the water plane's culled underside, a white half-frame (review3 walk/p7_prom, sh_ukimi)
    if (y === null && this.physics.isWater?.(x, z) && this.pos.y < SEA_DECK) this.pos.y = SEA_DECK;
    if (y !== null) this.fly = true;
    this.yaw = yawDeg * DEG; this.pitch = pitchDeg * DEG; this.vy = 0; this.smoothY = null;
    // [feel] a placed pose starts still and facing the view: no eased step, no turn, no landing carried over
    this.face = this.prevFace = this.yaw; this.faceV = 0;
    this.lift = this.prevLift = 0; this.liftV = 0;
    if (this.acc) this.acc.set(0, 0);
    this._landing = null; this._placed = true;
    (this.prevPos ??= new THREE.Vector3()).copy(this.pos);   // [smooth] a placed pose is never blended from where the feet were (??=: tests build players without the constructor)
    this.applyCamera(0);
  }

  /** One frame without the fixed clock (tests and tools): the look, one step of the body, the camera at the newest state. main.js runs
   *  the three parts itself: look() and present() every rendered frame, step() at the fixed rate (core/timestep.js). */
  update(dt) {
    // [v4:polish3] fly keeps a 0.1 s step (no ground collisions to keep stable): at a throttled 14 fps the 0.05 cap
    // halved the flying speed
    dt = Math.min(dt, this.fly ? 0.1 : 0.05);
    this.lookStep(dt);
    this.step(dt);
    this.applyCamera(dt);
  }

  /** [smooth] The look (the mouse, the pad's drag): every rendered frame, so a turn of the view is answered in the frame it is made. */
  lookStep(dt) {
    // [look] speed and invert Y are the shared setting (ui/look-settings.js). 1× is this walker's old 0.0022 rad/px.
    // A mode that owns the camera takes the raw pixels (the 1.4 drag gain is already in them) and calls mouseLook itself.
    if (lookBlocked()) this.look.dx = this.look.dy = 0;
    else if (typeof this.lookCapture === 'function') this.lookCapture(this.look.dx, this.look.dy);
    else {
      const d = mouseLook(this.look.dx, this.look.dy);
      this.yaw += d.yaw; this.pitch += d.pitch;
    }
    this.look.dx = this.look.dy = 0;
    if (this.pad) {   // the pad's drag look, already in radians and smoothed; the car's and the ship's chase cameras take it (lookSink)
      const l = this.pad.takeLook(dt);
      if (this.lookSink) this.lookSink(l.dx, l.dy); else { this.yaw -= l.dx; this.pitch -= l.dy; }
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -85 * DEG, 85 * DEG);
  }

  /** [feel] Third person on foot: the body faces the stick and the springs above apply. First person keeps the view's heading. */
  get thirdOnFoot() { return !this.fly && !this.gull && chaseOwns(this); }

  /** [smooth] One simulation step of the body (walk, run, fly, gravity, collisions), dt seconds: a fixed 1/60 s from main.js. The feet
   *  before the step stay in prevPos, so the camera can be drawn anywhere between the two (present). */
  step(dt) {
    (this.prevPos ??= new THREE.Vector3()).copy(this.pos);
    this.prevFace = this.face ?? this.yaw; this.prevLift = this.lift || 0;
    // [feel] a flight that ended without a placed pose (歩く on the pad's chip, its 着地 button, F, a mode that just clears fly) lands on
    // the nearest quay or street when it ended over the sea or high above the town
    if (this._flyWas && !this.fly && !this._placed && !this._landing) this._beginLanding();
    if (this._landing && this.fly) { this._landing = null; this.vy = 0; }   // 飛ぶ again mid-descent (or a mode that takes off): fly on from here
    this._flyWas = this.fly; this._placed = false;
    if (this._landing) { this._landStep(dt); return; }
    const k = this.keys;
    let f = 0, s = 0, u = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
      if (k.has('KeyE') || k.has('Space')) u += 1;
      if (k.has('KeyQ') || k.has('ControlLeft')) u -= 1;
      f -= this.touchMove.y; s += this.touchMove.x;
      if (this.pad) u += this.pad.vertical;   // 上昇 / 下降 (fly)
    }
    // Shift, or the stick pushed past 85 % (RUN), the ダッシュ toggle on foot, 加速 in flight
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || (!this.pad && this.touchMove.length() > 0.95)
      || (!!this.pad && (this.pad.running || (this.fly ? this.pad.boost : this.pad.dash && this.touchMove.lengthSq() > 0)));
    // [v4:polish3] fly: 25 m/s, Shift 70 m/s (a 5 km city; walk x 2.6 was 8 m/s)
    // [feel] third person can walk at the character's own speeds (walk3 / run3: his legs' no-slide speeds), first person keeps walk / run
    const own = !this.fly && !this.gull && chaseOwns(this);
    let speed = this.fly ? (running ? FLY_RUN : FLY) : (running ? (own && this.run3 > 0 ? this.run3 : this.run) : (own && this.walk3 > 0 ? this.walk3 : this.walk));
    this.running = !!running && !this.fly;   // [feel] the gait the walk cycle shows (avatar/index.js passes it to the model as run)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);  // right
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    // [feel] third person: turn the body toward the stick on a critically damped angle; hold the speed back while he faces away
    const third = this.thirdOnFoot;
    let go = 1;
    if (third) {
      if (ml > 0.02) {
        const want = Math.atan2(-mx, -mz);
        let err = wrapPi(this.face - want);
        // straight back: keep turning the way he already turns, else the stick's side of him decides (never a dither at ±180°)
        if (Math.abs(err) > 0.97 * Math.PI) { const side = this.faceV || (mx * -Math.cos(this.face) + mz * Math.sin(this.face)) || 1; err = side > 0 ? -Math.abs(err) : Math.abs(err); }
        damp1(err, this.faceV, 0, dt, FEEL.wTurn, _d);
        this.face = wrapPi(want + _d.x); this.faceV = _d.v; this.faceErr = _d.x;
        go = pivotScale(_d.x);
      } else {   // no stick: he keeps his heading; any turn still under way settles
        damp1(0, this.faceV, 0, dt, FEEL.wTurn, _d);
        this.face = wrapPi(this.face + _d.x); this.faceV = _d.v; this.faceErr = 0;
      }
    } else { this.face = this.yaw; this.faceV = 0; this.faceErr = 0; }
    const tx = mx * speed * go, tz = mz * speed * go;   // [smooth] the target velocity (was a new Vector3 every frame)
    if (this.onGround && !this.fly) {
      // [feel] the ground velocity: a critically damped spring (exact over the step), stiffer when stopping than when setting off
      const A = (this.acc ??= new THREE.Vector2());
      const stopping = tx * tx + tz * tz < (this.vel.x * this.vel.x + this.vel.z * this.vel.z) * 0.98 || tx * this.vel.x + tz * this.vel.z < 0;
      const w = stopping ? FEEL.wStop : FEEL.wGo;
      damp1(this.vel.x, A.x, tx, dt, w, _d); this.vel.x = _d.x; A.x = _d.v;
      damp1(this.vel.z, A.y, tz, dt, w, _d); this.vel.z = _d.x; A.y = _d.v;
    } else {
      const acc = this.onGround || this.fly ? 10 : 2.5;
      this.vel.x += (tx - this.vel.x) * Math.min(1, acc * dt);
      this.vel.z += (tz - this.vel.z) * Math.min(1, acc * dt);
      this.acc?.set(0, 0);
    }

    if (this.fly) {
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.pos.y += u * speed * 0.5 * dt;   // climb / sink at half the flying speed
      // [integration] take-off: entering flight from a walk eases up to a viewing height (liftTo), unless the player steers up or down
      if (this.liftTo != null) {
        const dy = this.liftTo - this.pos.y;
        if (u !== 0 || dy <= 0.05) this.liftTo = null;
        else this.pos.y += Math.min(dy, Math.min(20, Math.max(2, dy * 2.2)) * dt);
      }
      this.onGround = false;
      this.lift = this.liftV = 0;
    } else {
      // substeps keep collisions stable
      const dist = Math.hypot(this.vel.x, this.vel.z) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.12));
      const p = (this._p ??= { x: 0, z: 0 }); p.x = this.pos.x; p.z = this.pos.z;   // [smooth] reused: no garbage per step
      for (let i = 0; i < n; i++) {
        const ox = p.x, oz = p.z;
        p.x += this.vel.x * dt / n; p.z += this.vel.z * dt / n;
        this.physics.resolve(p, this.radius, this.pos.y, this.height);
        // don't walk up anything steeper than a step
        const g = this.physics.groundHeight(p.x, p.z, this.pos.y);
        if (g - this.pos.y > STEP_HEIGHT) { p.x = ox; p.z = oz; }
        // [v3:fix] the quay edge is a wall: never step into the sea (slide along the edge instead)
        if (this.physics.standable && !this.physics.standable(p.x, p.z, this.pos.y) && this.physics.standable(ox, oz, this.pos.y)) {
          const nx = p.x, nz = p.z;
          if (this.physics.standable(nx, oz, this.pos.y)) { p.x = nx; p.z = oz; }
          else if (this.physics.standable(ox, nz, this.pos.y)) { p.x = ox; p.z = nz; }
          else { p.x = ox; p.z = oz; }
        }
      }
      const b = this.bounds;
      p.x = THREE.MathUtils.clamp(p.x, b.x0, b.x1); p.z = THREE.MathUtils.clamp(p.z, b.z0, b.z1);
      // [feel] against a wall (or along the quay edge) the velocity is what he really moved: the walk cycle, the footsteps and the camera's
      // look-ahead see a body that is stopped or sliding, not one still striding at the stick's speed into the wall
      if (this.onGround && dt > 0) {
        const ax = (p.x - this.pos.x) / dt, az = (p.z - this.pos.z) / dt;
        if (ax * ax + az * az < (this.vel.x * this.vel.x + this.vel.z * this.vel.z) * 0.9) { this.vel.x = ax; this.vel.z = az; this.acc?.set(0, 0); }
      }
      this.distance += Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.pos.x = p.x; this.pos.z = p.z;
      let g = this.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
      if (g < SEA_DECK && this.physics.isWater?.(this.pos.x, this.pos.z)) g = SEA_DECK;   // [v5:fix3] afloat, not on the seabed
      const wasGround = this.onGround, y0 = this.pos.y;
      if (wasGround && this.vy <= 0 && g < y0 && y0 - g <= STEP_HEIGHT + 1e-6) {
        // [feel] down a kerb, a stair or a slope: the feet stay on the ground (it used to fall a little off every step)
        this.pos.y = g; this.vy = 0; this.onGround = true;
      } else {
        this.vy -= 12 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.onGround = true; }
        else if (this.pos.y - g < 0.06 && this.vy <= 0) { this.pos.y = g; this.vy = 0; this.onGround = true; }
        else this.onGround = false;
      }
      // [feel] a step taken while walking (up or down) is drawn as an eased lift, not a jump in y; a landing from the air is not eased,
      // and neither is a slope (a change under 4 cm + half the step's run is the ground's own shape, followed exactly)
      const dy = y0 - this.pos.y, run = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
      if (wasGround && this.onGround && Math.abs(dy) > 0.04 + 0.5 * run) {
        const lift = (this.lift || 0) + dy;
        this.lift = Math.max(-1.5 * STEP_HEIGHT, Math.min(1.5 * STEP_HEIGHT, lift));
      }
      damp1(this.lift || 0, this.liftV || 0, 0, dt, FEEL.wLift, _d); this.lift = _d.x; this.liftV = _d.v;
    }
  }

  /** [feel] Start the eased landing if the flight ended over the sea or high above the town; false when the ordinary drop will do. */
  _beginLanding() {
    const P = this.physics, x = this.pos.x, z = this.pos.z, y = this.pos.y;
    if (!P?.groundHeight || !P.heightAt) return false;
    const below = P.groundHeight(x, z, y);
    const sea = !!P.isWater?.(x, z) && !(P.standable?.(x, z, y));
    if (!sea && y - below < FEEL.landHigh) return false;
    const s = landSpot(P, x, z, this.yaw, this._spot);
    if (!s) return false;
    const dist = Math.hypot(s.x - x, s.y - y, s.z - z);
    const dur = reducedMotion() ? 0 : Math.min(FEEL.landMax, Math.max(FEEL.landMin, 0.5 + dist * FEEL.landPerM));
    this._landing = { t: 0, dur, x0: x, y0: y, z0: z, x1: s.x, y1: s.y, z1: s.z };
    this.vel.set(0, 0, 0); this.acc?.set(0, 0); this.vy = 0; this.onGround = false;
    this.lift = this.liftV = 0; this.face = this.prevFace = this.yaw; this.faceV = 0; this.smoothY = null;
    try { this.onLanding?.(this._landing); } catch (e) { /* a listener's problem is not the landing's */ }
    return true;
  }

  /** [feel] One step of the landing: an eased path (smootherstep across and down) that arrives still on the quay or the street. */
  _landStep(dt) {
    const L = this._landing;
    L.t += dt;
    const u = L.dur > 0 ? Math.min(1, L.t / L.dur) : 1, e = smoother(u);
    const y = L.y0 + (L.y1 - L.y0) * e;
    this.vy = dt > 0 ? (y - this.pos.y) / dt : 0;
    this.pos.set(L.x0 + (L.x1 - L.x0) * e, y, L.z0 + (L.z1 - L.z0) * e);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    if (u >= 1) { this._landing = null; this.pos.set(L.x1, L.y1, L.z1); this.vy = 0; this.onGround = true; }
  }

  /** [feel] Landing from a flight right now (the chase eases its own camera; tools read it). */
  get landing() { return this._landing; }

  /** [smooth] The camera at the frame's instant: the feet blended between the last two steps (alpha 0 = the step before, 1 = the newest),
   *  the eye smoothing and the head bob in the frame's time, the view from this frame's look. */
  present(alpha, dt) { this.applyCamera(dt, alpha); }

  applyCamera(dt, alpha = 1) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // [smooth] frame-rate independent: the bob decays by 0.9 per 1/60 s at any frame rate (it was 0.9 per frame)
    if (this.onGround && sp > 0.3) this.bob += dt * sp * 2.1; else this.bob *= Math.exp(-6.32 * dt);
    const bobY = this.fly ? 0 : Math.sin(this.bob * 2) * 0.022 * Math.min(1, sp / 3);
    const a = alpha >= 1 ? 1 : Math.max(0, alpha), P = this.pos, Q = this.prevPos ?? P;
    const x = Q.x + (P.x - Q.x) * a, y = Q.y + (P.y - Q.y) * a, z = Q.z + (P.z - Q.z) * a;
    if (chaseOwns(this)) {
      // [feel] the chase sees the drawn feet (the step's eased lift) and the velocity (its look-ahead)
      const l0 = this.prevLift || 0, l1 = this.lift || 0;
      const fr = (this._frame ??= { x: 0, y: 0, z: 0, dt: 0, sp: 0, alpha: 1, vx: 0, vz: 0, landing: false });
      fr.x = x; fr.y = y + l0 + (l1 - l0) * a; fr.z = z; fr.dt = dt; fr.sp = sp; fr.alpha = a; fr.vx = this.vel.x; fr.vz = this.vel.z; fr.landing = !!this._landing;
      this.chase(this, fr);
    } else {
      const eyeY = y + this.eye;
      if (this.smoothY === null || this.fly) this.smoothY = eyeY;
      else this.smoothY += (eyeY - this.smoothY) * (1 - Math.exp(-15.9 * dt));   // [smooth] was min(1, 14 dt): 15.9 /s gives its 0.233 per 1/60 s, and the same curve at any frame rate
      if (Math.abs(this.smoothY - eyeY) > 1.2) this.smoothY = eyeY;
      this.camera.position.set(x, this.smoothY + bobY, z);
      this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.0025 * Math.min(1, sp / 3), 'YXZ');
    }
    if (this.cameraBlend) this.cameraBlend(this.camera, dt);
  }
}
