// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/anim.js.
// Pose driver for Human rigs: reset, planted-feet leg IK, arm FK/IK, look-at, breathing,
// blinking, wind on hair chains & skirt bones. All deterministic from (t, dt).
import * as THREE from 'three';
import { ik2, setWorldQuat, tiltQuat, clamp, lerp, smooth, wave, DEG } from './skin.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _w = new THREE.Vector3(), _g = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const ARM_BEND = new THREE.Vector3(0, 0, 1), LEG_BEND = new THREE.Vector3(0, 0, -1);

export function rot(bone, x = 0, y = 0, z = 0, order = 'XYZ') { _e.set(x, y, z, order); bone.quaternion.setFromEuler(_e); }
export function rotMul(bone, x = 0, y = 0, z = 0, order = 'XYZ') { _e.set(x, y, z, order); _q.setFromEuler(_e); bone.quaternion.multiply(_q); }

export class Driver {
  constructor(ctx, h, o = {}) {
    this.ctx = ctx; this.h = h; this.b = h.b;
    this.seed = o.seed ?? 1;
    this.blinkP = 2.8 + (this.seed * 0.713 % 1) * 2.4;
    this.look = { yaw: 0, pitch: 0 };
    this.lookInit = false;
    this.feet = null;
    this.windScale = o.wind ?? 1;
    this.hairAmp = o.hairAmp ?? 1;
    this.skirtAmp = o.skirtAmp ?? 1;
  }
  /** Place the character root in the world. */
  place(x, y, z, rotY) { const g = this.h.group; g.position.set(x, y, z); g.rotation.set(0, rotY, 0); g.updateMatrixWorld(true); this.rotY = rotY; }
  reset() {
    for (const [bone, r] of this.h.rest) { bone.position.copy(r.p); bone.quaternion.identity(); }
  }
  /** local (character space) -> world */
  W(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.h.group.matrixWorld); }

  breathe(t, amt = 1) {
    const b = this.b, s = Math.sin(t * TAU_BREATH + this.seed);
    rotMul(b.chest, -0.012 * s * amt, 0, 0);
    rotMul(b.clavL, 0, 0, 0.012 * s * amt); rotMul(b.clavR, 0, 0, -0.012 * s * amt);
  }
  /** Standing legs: planted feet in character space, hips offset/tilt. */
  stand(o = {}) {
    const h = this.h, P = h.P, b = this.b;
    const fx = P.hipJx * (o.stance ?? 1.08);
    const L = o.footL || [fx, P.ankle, o.fzL ?? 0.01], R = o.footR || [-fx, P.ankle, o.fzR ?? 0.0];
    b.hips.position.x += o.hx || 0; b.hips.position.y += o.hy || 0; b.hips.position.z += o.hz || 0;
    rotMul(b.hips, o.hrx || 0, o.hry || 0, o.hrz || 0);
    h.group.updateMatrixWorld(true);
    this.leg('L', L, o.toeL ?? 0.14, o.kneeL); this.leg('R', R, -(o.toeR ?? 0.14), o.kneeR);
  }
  leg(n, foot, yaw = 0, knee) {
    const b = this.b; const s = n === 'L' ? 1 : -1;
    const tgt = this.W(foot[0], foot[1], foot[2], _v);
    const pole = this.W(foot[0] + s * (knee?.[0] ?? 0.05), foot[1] + 0.45, foot[2] + (knee?.[1] ?? 1.0), _v2);
    ik2(b['thigh' + n], b['shin' + n], b['foot' + n].userData.rest, tgt, pole, LEG_BEND);
    // foot flat, yawed
    this.h.group.getWorldQuaternion(_q2);
    _e.set(foot[3] || 0, yaw, 0, 'YXZ'); _q3.setFromEuler(_e);
    _q2.multiply(_q3);
    setWorldQuat(b['foot' + n], _q2);
  }
  /** Arm FK: fwd (raise forward), out (abduct), twist, elbow (flex), hand [x,y,z] */
  arm(n, fwd = 0, out = 0, twist = 0, elbow = 0, hand = null) {
    const b = this.b, s = n === 'L' ? 1 : -1;
    rot(b['uarm' + n], -fwd, s * twist, s * out, 'XZY');
    rot(b['farm' + n], -elbow, 0, 0);
    if (hand) rot(b['hand' + n], hand[0], s * (hand[1] || 0), s * (hand[2] || 0));
  }
  /** Arm IK to a world point (wrist). pole: world elbow hint. */
  armIK(n, target, pole) {
    const b = this.b;
    ik2(b['uarm' + n], b['farm' + n], b['hand' + n].userData.rest, target, pole, ARM_BEND);
  }
  /** Look at a world point (distributes over neck/head), smoothed. */
  lookAt(target, dt, o = {}) {
    const b = this.b;
    b.chest.updateWorldMatrix(true, false);
    _v.copy(target); b.chest.worldToLocal(_v);
    const hy = this.h.bindPos(b.head)[1] - this.h.bindPos(b.chest)[1] + 0.1;
    let yaw = Math.atan2(_v.x, _v.z), pitch = -Math.atan2(_v.y - hy, Math.hypot(_v.x, _v.z));
    yaw = clamp(yaw, -(o.maxYaw ?? 1.2), o.maxYaw ?? 1.2); pitch = clamp(pitch, -(o.maxUp ?? 0.6), o.maxDown ?? 0.7);
    this.lookYP(yaw, pitch, dt, o);
  }
  lookYP(yaw, pitch, dt, o = {}) {
    const k = this.lookInit && dt > 0 ? 1 - Math.exp(-dt * (o.speed ?? 3)) : 1;
    if (!this.lookInit && dt === 0) { this.look.yaw = yaw; this.look.pitch = pitch; }
    this.look.yaw = lerp(this.look.yaw, yaw, k); this.look.pitch = lerp(this.look.pitch, pitch, k);
    this.lookInit = true;
    const b = this.b;
    rotMul(b.neck, this.look.pitch * 0.3, this.look.yaw * 0.35, 0, 'YXZ');
    rotMul(b.head, this.look.pitch * 0.7, this.look.yaw * 0.65, o.tilt || 0, 'YXZ');
  }
  blink(t, talk = false) {
    const ph = (t + this.seed * 1.37) % this.blinkP;
    const dbl = (Math.floor((t + this.seed * 1.37) / this.blinkP) % 4) === 2;
    const closed = ph < 0.12 || (dbl && ph > 0.24 && ph < 0.34);
    this.h.setFace(closed ? 'blink' : talk ? 'talk' : 'open');
  }
  /** Wind + gravity on hair chains and skirt bones. strength ~0..1.5 */
  wind(t, dt, o = {}) {
    const ctx = this.ctx, h = this.h, b = this.b;
    const W = ctx.shared.uWind.value, gust = ctx.shared.uGust.value;
    const str = (0.35 + 0.95 * gust) * this.windScale * (o.boost ?? 1);
    _w.set(W.x, 0, W.y).multiplyScalar(str);
    // ---- hair
    if (h.hairChains.length) {
      b.head.updateWorldMatrix(true, false);
      b.head.getWorldQuaternion(_q2); _q2.invert();
      for (const ch of h.hairChains) {
        _g.copy(DOWN).applyQuaternion(_q2);                 // gravity in head space
        _v.copy(_w).applyQuaternion(_q2);                   // wind in head space
        const amp = (ch.amp || 1) * this.hairAmp;
        const wob = wave(t * 1.6, this.seed + ch.b1.id * 0.37) * 0.35 + wave(t * 3.1, ch.b1.id) * 0.12;
        // hang direction: mostly gravity, pushed by the wind
        _v2.copy(_g).addScaledVector(_v, 0.32 * amp).normalize();
        _v2.x += wob * 0.1 * amp * (0.5 + gust); _v2.z += wave(t * 1.3, ch.b1.id * 0.7) * 0.05 * amp;
        // hair lies on the back / shoulders: it cannot swing forward into the body
        if (_v2.z > (ch.maxFwd ?? 0.08)) _v2.z = ch.maxFwd ?? 0.08;
        if (_v2.y > -0.35) _v2.y = -0.35;
        _v2.normalize();
        _q.setFromUnitVectors(DOWN, _v2);
        ch.b1.quaternion.identity().slerp(_q, 0.75);
        // tip: a bit more wind + lag
        _v3.copy(_v).applyQuaternion(_q.clone().invert());
        const a2 = (0.12 + 0.35 * gust) * amp * clamp(_v3.length(), 0, 1.5) + wob * 0.12 * amp;
        tiltQuat(ch.b2.quaternion, _v3.x + 1e-4, _v3.z, a2);
      }
    }
    // ---- skirt
    if (h.skirtBones.length) {
      b.hips.updateWorldMatrix(true, false);
      b.hips.getWorldQuaternion(_q2); _q2.invert();
      _v.copy(_w).applyQuaternion(_q2);
      _g.copy(DOWN).applyQuaternion(_q2);
      const wl = Math.hypot(_v.x, _v.z) || 1e-6;
      const wx = _v.x / wl, wz = _v.z / wl;
      const sa = this.skirtAmp;
      const legs = o.legs || null;
      for (const sb of h.skirtBones) {
        const ph = sb.userData.ph; const dx = Math.sin(ph), dz = Math.cos(ph);
        const dot = dx * wx + dz * wz;
        const flutter = wave(t * 2.3, ph * 3 + this.seed) * 0.5 + wave(t * 4.1, ph * 5) * 0.25;
        let flare = (o.flare ?? 0.04) + Math.max(0, dot) * wl * 0.22 * sa + flutter * 0.045 * sa * (0.4 + gust) - Math.max(0, -dot) * wl * 0.05 * sa;
        flare = Math.max(-0.05, flare);
        let tx = dx * flare + wx * wl * 0.06 * sa + _g.x * 0.9, tz = dz * flare + wz * wl * 0.06 * sa + _g.z * 0.9;
        // gravity: keep hanging when the hips tilt
        if (legs) for (const lg of legs) {
          // lg: {x: side (-1..1), a: forward angle}. Smooth falloff round the hem so neighbouring panels never split.
          const side = clamp(1 - Math.abs(dx - lg.x * 0.5) * 0.6, 0.35, 1);
          if (lg.a > 0) tz += lg.a * Math.pow(0.5 + 0.5 * dz, 1.4) * side * 0.9;
          else tz += lg.a * Math.pow(0.5 - 0.5 * dz, 1.4) * side * 0.6;
        }
        const a = Math.hypot(tx, tz);
        tiltQuat(sb.quaternion, tx, tz, a);
      }
    }
  }
}
const TAU_BREATH = Math.PI * 2 / 4.3;
