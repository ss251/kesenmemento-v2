// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// First-person walker: pointer-lock mouse look (drag-look fallback), WASD / arrows, Shift run,
// Space jump, F fly (noclip). Touch (the floating stick, the drag look, the jump / fly buttons) lives in ui/touchpad.js:
// the player consumes pad.move, pad.takeLook() and the pad's jump / fly / land events (attachPad).
import * as THREE from 'three';
import { STEP_HEIGHT } from './physics.js';

const DEG = Math.PI / 180;
export const FLY = 25, FLY_RUN = 70;   // [v4:polish3] fly speeds, m/s
/** [v5:fix3] feet height of a walking eye placed over open water (sea level 0 + a small boat deck), m */
export const SEA_DECK = 0.6;

export class Player {
  constructor(camera, dom, physics, bounds) {
    this.camera = camera; this.dom = dom; this.physics = physics; this.bounds = bounds;
    this.pos = new THREE.Vector3(0, 0, 0); // feet
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.52; this.radius = 0.3; this.height = 1.7;
    this.walk = 3.1; this.run = 6.4;
    this.fly = false; this.enabled = false; this.onGround = true;
    this.keys = new Set();
    this.bob = 0; this.smoothY = null;
    this.look = { dx: 0, dy: 0 };
    this._touchMove = new THREE.Vector2();   // the stick when there is no pad (tests, the ship branch's fallback)
    this.pad = null; this.lookSink = null;
    this.distance = 0;
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
  jump() { if (this.enabled && this.onGround && !this.fly) { this.vy = 4.2; return true; } return false; }

  _bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.fly = !this.fly;
      if (e.code === 'Space' && this.enabled && (this.onGround || this.fly)) { if (!this.fly) this.vy = 4.2; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // mouse look
    let dragging = false, lx = 0, ly = 0;
    d.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === d) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
      else if (dragging) { this.look.dx += (e.clientX - lx) * 1.4; this.look.dy += (e.clientY - ly) * 1.4; lx = e.clientX; ly = e.clientY; }
    });
  }

  requestLock() { try { const p = this.dom.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag-look fallback */ } }

  /** x,z world; yaw/pitch in degrees (yaw 0 = north). y optional (fly). */
  setPose(x, z, yawDeg = 0, pitchDeg = 0, y = null) {
    this.pos.set(x, 0, z);
    this.pos.y = y !== null ? y - this.eye : this.physics.groundHeight(x, z, 1e9);
    // [v5:fix3] a walking eye set over open water stands at boat-deck height on the surface, never on the seabed: the
    // eye under the sea saw the water plane's culled underside, a white half-frame (review3 walk/p7_prom, sh_ukimi)
    if (y === null && this.physics.isWater?.(x, z) && this.pos.y < SEA_DECK) this.pos.y = SEA_DECK;
    if (y !== null) this.fly = true;
    this.yaw = yawDeg * DEG; this.pitch = pitchDeg * DEG; this.vy = 0; this.smoothY = null;
    this.applyCamera(0);
  }

  update(dt) {
    // [v4:polish3] fly keeps a 0.1 s step (no ground collisions to keep stable): at a throttled 14 fps the 0.05 cap
    // halved the flying speed
    dt = Math.min(dt, this.fly ? 0.1 : 0.05);
    const sens = 0.0022;
    this.yaw -= this.look.dx * sens; this.pitch -= this.look.dy * sens; this.look.dx = this.look.dy = 0;
    if (this.pad) {   // the pad's drag look, already in radians and smoothed; the car's chase camera takes it while driving (lookSink)
      const l = this.pad.takeLook(dt);
      if (this.lookSink) this.lookSink(l.dx, l.dy); else { this.yaw -= l.dx; this.pitch -= l.dy; }
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -85 * DEG, 85 * DEG);
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
    let speed = this.fly ? (running ? FLY_RUN : FLY) : (running ? this.run : this.walk);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);  // right
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const target = new THREE.Vector3(mx * speed, 0, mz * speed);
    const acc = this.onGround || this.fly ? 10 : 2.5;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, acc * dt);

    if (this.fly) {
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.pos.y += u * speed * 0.5 * dt;   // climb / sink at half the flying speed
      this.onGround = false;
    } else {
      // substeps keep collisions stable
      const dist = Math.hypot(this.vel.x, this.vel.z) * dt;
      const n = Math.max(1, Math.ceil(dist / 0.12));
      const p = { x: this.pos.x, z: this.pos.z };
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
      this.distance += Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      this.pos.x = p.x; this.pos.z = p.z;
      let g = this.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
      if (g < SEA_DECK && this.physics.isWater?.(this.pos.x, this.pos.z)) g = SEA_DECK;   // [v5:fix3] afloat, not on the seabed
      this.vy -= 12 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.onGround = true; }
      else if (this.pos.y - g < 0.06 && this.vy <= 0) { this.pos.y = g; this.vy = 0; this.onGround = true; }
      else this.onGround = false;
    }
    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && sp > 0.3) this.bob += dt * sp * 2.1; else this.bob *= 0.9;
    const bobY = this.fly ? 0 : Math.sin(this.bob * 2) * 0.022 * Math.min(1, sp / 3);
    const eyeY = this.pos.y + this.eye;
    if (this.smoothY === null || this.fly) this.smoothY = eyeY;
    else this.smoothY += (eyeY - this.smoothY) * Math.min(1, dt * 14);
    if (Math.abs(this.smoothY - eyeY) > 1.2) this.smoothY = eyeY;
    this.camera.position.set(this.pos.x, this.smoothY + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.0025 * Math.min(1, sp / 3), 'YXZ');
  }
}
