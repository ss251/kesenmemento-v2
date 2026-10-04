// [v4:explore] Drive mode (V3-SPEC section 10: "walk and drive modes (a car on real roads)"): a kei car on the real
// road network (explore/roadnet.js: every GSI centre-line with its measured carriageway width). The car keeps to the
// carriageways: past the kerb it slides along the road edge instead of leaving it, buildings and the sea stop it, and
// it rides over the river bridges' decks. A light lane assist keeps it on the left lane (Japan drives on the left)
// when you are not steering. Chase camera behind the car; the mouse (or a drag) orbits it.
//
// Keys: C enter / leave the car. W / S or the arrows: accelerate, brake and reverse; A / D steer; Space handbrake;
// Shift: faster (60 km/h instead of 40). Touch (ui/touchpad.js): the stick steers and throttles (past 85 % = boost),
// ブレーキ holds the handbrake, ブースト boosts, 降りる gets out, and a drag on the right orbits the chase camera.
//
//   const drive = createDrive(ctx, { net })   drive.enter() / drive.exit() / drive.toggle() / drive.active
//   drive.state -> { x, z, y, yaw, speed (m/s), kmh, road }   drive.focus() -> streaming focus ahead of the car
//   drive.canEnter(r = 14) -> is there a road within r metres of the player (the touch pad's 乗る button)
import * as THREE from 'three';
import { makeKeiCar } from '../town/sakura/vehicles_cars.js';

export const CAR = { wheelbase: 2.46, halfW: 0.74, radius: 1.15, vMax: 11.1, vBoost: 16.7, vRev: 3.5, acc: 3.2, brake: 7.5, drag: 0.9, steerMax: 0.62 };

/** One step of the kinematic bicycle model (pure: tested). input { throttle -1..1, steer -1..1, brake bool, boost }. */
export function carStep(s, input, dt, C = CAR) {
  const vTop = input.boost ? C.vBoost : C.vMax;
  let v = s.speed;
  const th = input.throttle || 0;
  if (input.brake) v -= Math.sign(v) * Math.min(Math.abs(v), C.brake * 1.3 * dt);
  else if (th > 0) v = v < -0.05 ? Math.min(0, v + C.brake * dt) : Math.min(vTop, v + C.acc * th * (1 - Math.max(0, v) / (vTop * 1.15)) * dt + 0.0);
  else if (th < 0) v = v > 0.05 ? Math.max(0, v - C.brake * dt) : Math.max(-C.vRev, v + C.acc * 0.7 * th * dt);
  else v -= Math.sign(v) * Math.min(Math.abs(v), (C.drag + Math.abs(v) * 0.04) * dt);
  // steering: full lock at walking pace, about a third of it at speed
  const lock = C.steerMax * (1 - 0.62 * Math.min(1, Math.abs(v) / C.vBoost));
  const target = (input.steer || 0) * lock;
  const steer = s.steer + (target - s.steer) * Math.min(1, dt * 6);
  // yaw rate from the bicycle model, capped by the grip (lateral acceleration at most ~6 m/s^2)
  const cap = 6 / Math.max(0.5, Math.abs(v));
  const yawRate = Math.max(-cap, Math.min(cap, (v / C.wheelbase) * Math.tan(steer)));
  const yaw = s.yaw - yawRate * dt;   // yaw 0 = north (-Z); a right turn (steer > 0) turns clockwise seen from above
  const x = s.x - Math.sin(yaw) * v * dt, z = s.z - Math.cos(yaw) * v * dt;
  return { ...s, x, z, yaw, speed: v, steer };
}

export function createDrive(ctx, { net }) {
  const L = ctx.L, cam = ctx.camera;
  const state = { active: false, x: 0, z: 0, y: 0, yaw: 0, speed: 0, steer: 0, pitch: 0, roll: 0, road: null, scrape: 0, km: 0 };
  const listeners = new Set();
  let car = null, lamps = null, glow = null;
  const orbit = { yaw: 0, pitch: -0.18, back: 0 };   // camera orbit offsets (radians) around the chase position
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false;

  function makeCar() {
    const g = new THREE.Group(); g.name = 'explore-car';
    const body = makeKeiCar(ctx, { color: '#f2c14e' });   // a mustard kei with a cream roof (fictional, Sakura's kit)
    g.add(body);
    // head and tail lamps that light up at dusk: small emissive discs over the kit's lamps, and a soft pool ahead
    const head = ctx.mat.emissive ? ctx.mat.emissive('#fff4d8', 1.6) : new THREE.MeshBasicMaterial({ color: '#fff4d8' });
    const tail = ctx.mat.emissive ? ctx.mat.emissive('#ff5a4a', 1.4) : new THREE.MeshBasicMaterial({ color: '#ff5a4a' });
    lamps = new THREE.Group();
    const disc = new THREE.CircleGeometry(0.085, 14);
    for (const sd of [-1, 1]) {
      const h = new THREE.Mesh(disc, head); h.position.set(sd * 0.50, 0.66, 1.775); h.rotation.x = -0.35; lamps.add(h);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.16), tail); t.position.set(sd * 0.60, 0.82, -1.72); t.rotation.y = Math.PI; lamps.add(t);
    }
    lamps.visible = false; g.add(lamps);
    const pm = new THREE.MeshBasicMaterial({ color: '#ffe7b0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.5), pm); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.08, 5.6); glow.visible = false; g.add(glow);
    g.traverse((o) => { o.userData.noBatch = true; o.userData.dynamic = true; });
    ctx.noOutline(lamps); ctx.noOutline(glow);
    ctx.add(g);
    g.visible = false;
    return g;
  }

  const input = { throttle: 0, steer: 0, brake: false, boost: false };
  const keys = new Set();
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => { if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; keys.add(e.code); if (state.active && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    addEventListener('mousemove', (e) => {
      if (!state.active) return;
      const locked = document.pointerLockElement === ctx.renderer?.domElement;
      if (locked || e.buttons) { orbit.yaw -= e.movementX * 0.004; orbit.pitch = Math.max(-0.7, Math.min(0.25, orbit.pitch - e.movementY * 0.003)); orbit.back = 2.5; }
    });
  }

  function groundY(x, z, above) {
    const P = ctx.physics;
    const g = P ? P.groundHeight(x, z, above) : L.heightAt(x, z);
    return Math.max(g, L.heightAt(x, z)) + 0.1;   // streets are laid ~0.1 m over the terrain
  }

  /** The touch pad's drag look while driving: the same orbit the mouse gives (radians in, a little less pitch). */
  function padLook(dx, dy) {
    if (!state.active || (!dx && !dy)) return;
    orbit.yaw -= dx * 0.9; orbit.pitch = Math.max(-0.7, Math.min(0.25, orbit.pitch - dy * 0.7)); orbit.back = 2.5;
  }
  /** Is there a road (the car's spawn) within r metres of where the player stands? */
  function canEnter(r = 14) {
    const p = ctx.playerObj?.pos || cam.position;
    const n = net.nearest(p.x, p.z, r);
    return !!n && Math.hypot(n.x - p.x, n.z - p.z) <= r;
  }
  function enter(at = null) {
    const p = at || ctx.playerObj?.pos || cam.position;
    const yaw = at?.yaw ?? ctx.playerObj?.yaw ?? 0;
    const sp = net.spawn(p.x, p.z, yaw);
    if (!sp) return false;
    if (!car) car = makeCar();
    Object.assign(state, { active: true, x: sp.x, z: sp.z, yaw: sp.yaw, speed: 0, steer: 0, road: sp.road });
    state.y = groundY(sp.x, sp.z, 1e9);
    orbit.yaw = 0; orbit.pitch = -0.18; camInit = false;
    car.visible = true;
    const pl = ctx.playerObj;
    if (pl) { pl.enabled = false; pl.fly = true; pl.lookSink = padLook; }   // touch look orbits the chase camera
    ctx.services.life?.tour?.stop?.();
    place(0);
    emit();
    return true;
  }
  function exit() {
    if (!state.active) return;
    state.active = false;
    if (car) car.visible = false;
    const pl = ctx.playerObj;
    if (pl) pl.lookSink = null;
    // step out on the kerb side (left of the car), facing the way the car faced
    const lx = -Math.cos(state.yaw), lz = Math.sin(state.yaw);
    let ox = state.x + lx * 1.9, oz = state.z + lz * 1.9;
    if (ctx.physics?.standable && !ctx.physics.standable(ox, oz)) { ox = state.x; oz = state.z; }
    if (pl) { pl.fly = false; pl.enabled = document.body?.classList?.contains('playing') ?? true; pl.setPose(ox, oz, state.yaw * 180 / Math.PI, 0); }
    emit();
  }
  const toggle = () => (state.active ? (exit(), false) : enter());
  function emit() { for (const f of listeners) try { f(api); } catch (e) { console.error(e); } }

  function readInput() {
    const k = keys, pl = ctx.playerObj, pad = ctx.pad;
    const t = pad?.move || pl?.touchMove || { x: 0, y: 0 };
    let th = 0, st = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) th += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) th -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) st -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) st += 1;
    th -= t.y; st += t.x;
    input.throttle = Math.max(-1, Math.min(1, th)); input.steer = Math.max(-1, Math.min(1, st));
    input.brake = k.has('Space') || !!pad?.brake;
    // boost: Shift, the ブースト button, or the stick pushed forward past 85 %
    input.boost = k.has('ShiftLeft') || k.has('ShiftRight') || !!pad?.boost || (!!pad?.running && t.y < -0.3);
    // lane assist: no steering input and moving: ease the heading onto the road ahead
    input.assist = Math.abs(st) < 0.05 && Math.abs(state.speed) > 1.2;
  }

  // engine: a soft two-oscillator hum through a low-pass, pitch and level following speed and throttle
  const eng = { on: false };
  function engine(dt) {
    const A = ctx.audio, ac = A?.context;
    if (!ac || ac.state !== 'running') return;
    if (!eng.on) {
      eng.g = ac.createGain(); eng.g.gain.value = 0; eng.lp = ac.createBiquadFilter(); eng.lp.type = 'lowpass'; eng.lp.frequency.value = 380; eng.lp.Q.value = 0.7;
      eng.o1 = ac.createOscillator(); eng.o1.type = 'sawtooth'; eng.o2 = ac.createOscillator(); eng.o2.type = 'triangle';
      eng.o1.connect(eng.lp); eng.o2.connect(eng.lp); eng.lp.connect(eng.g); eng.g.connect(ac.destination); eng.o1.start(); eng.o2.start(); eng.on = true;
    }
    const v = Math.abs(state.speed), f = 38 + v * 5.2 + Math.max(0, input.throttle) * 14;
    const level = !state.active || A.muted ? 0 : 0.018 + Math.min(1, v / 14) * 0.02 + Math.max(0, input.throttle) * 0.012;
    const t = ac.currentTime;
    eng.o1.frequency.setTargetAtTime(f, t, 0.08); eng.o2.frequency.setTargetAtTime(f * 2.02, t, 0.08); eng.g.gain.setTargetAtTime(level, t, 0.12);
    void dt;
  }

  const P = { x: 0, z: 0 };
  function update(dt) {
    if (!state.active || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    readInput();
    let next = carStep(state, input, dt);
    if (input.assist) {
      const a = net.ahead(next.x, next.z, next.yaw, 6 + Math.abs(next.speed) * 0.8);
      if (a) {
        const want = Math.atan2(-a.dx * Math.sign(next.speed || 1), -a.dz * Math.sign(next.speed || 1));
        const d = Math.atan2(Math.sin(want - next.yaw), Math.cos(want - next.yaw));
        if (Math.abs(d) < 0.6) next.yaw += d * Math.min(1, dt * 1.6);
      }
    }
    // stay on the carriageway: slide along the kerb, lose some speed
    const c = net.clampToRoad(next.x, next.z, CAR.halfW * 0.8);
    if (c.off > 0 && Number.isFinite(c.off)) { next.x = c.x; next.z = c.z; next.speed *= Math.max(0.2, 1 - dt * 3); state.scrape = 0.4; }
    else if (!Number.isFinite(c.off)) { next.x = state.x; next.z = state.z; next.speed = 0; }
    // buildings and walls (the town's colliders), then the sea
    P.x = next.x; P.z = next.z;
    const ph = ctx.physics;
    if (ph?.resolve) ph.resolve(P, CAR.radius, state.y + 0.2, 1.4);
    if (Math.hypot(P.x - next.x, P.z - next.z) > 0.02) { next.speed *= Math.max(0.1, 1 - dt * 6); state.scrape = 0.4; }
    next.x = P.x; next.z = P.z;
    if (ph?.standable && !ph.standable(next.x, next.z, state.y)) { next.x = state.x; next.z = state.z; next.speed = 0; }
    const b = L.WORLD?.play; if (b) { next.x = Math.max(b.x0, Math.min(b.x1, next.x)); next.z = Math.max(b.z0, Math.min(b.z1, next.z)); }
    state.km += Math.hypot(next.x - state.x, next.z - state.z) / 1000;
    Object.assign(state, { x: next.x, z: next.z, yaw: next.yaw, speed: next.speed, steer: next.steer });
    state.scrape = Math.max(0, state.scrape - dt);
    place(dt);
  }
  function place(dt) {
    // ride height from the ground at the four wheels (terrain, street, bridge decks): pitch and roll follow the road
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    const hw = CAR.wheelbase / 2, ht = 0.62;
    const yF = groundY(state.x + fx * hw, state.z + fz * hw, state.y + 0.8), yB = groundY(state.x - fx * hw, state.z - fz * hw, state.y + 0.8);
    const yL = groundY(state.x - rx * ht, state.z - rz * ht, state.y + 0.8), yR = groundY(state.x + rx * ht, state.z + rz * ht, state.y + 0.8);
    const yT = (yF + yB + yL + yR) / 4;
    state.y = dt > 0 ? state.y + (yT - state.y) * Math.min(1, dt * 12) : yT;
    const pitch = Math.atan2(yF - yB, CAR.wheelbase), roll = Math.atan2(yR - yL, ht * 2);
    state.pitch += (pitch - state.pitch) * Math.min(1, (dt || 1) * 10); state.roll += (roll - state.roll) * Math.min(1, (dt || 1) * 10);
    if (car) {
      car.position.set(state.x, state.y, state.z);
      car.rotation.set(0, 0, 0, 'YXZ');
      car.rotation.y = state.yaw + Math.PI;
      car.rotation.x = state.pitch; car.rotation.z = -state.roll;
      const night = ctx.shared.uNight?.value ?? 0, lampsOn = (ctx.shared.uLamps?.value ?? night) > 0.3 || night > 0.3;
      if (lamps) lamps.visible = lampsOn; if (glow) glow.visible = lampsOn;
    }
    // chase camera: behind and above, orbit offsets from the mouse ease back behind the car after a while
    if (dt > 0 && orbit.back > 0) orbit.back -= dt; else if (dt > 0) { orbit.yaw *= 1 - Math.min(1, dt * 1.5); }
    const cy = state.yaw + orbit.yaw, dist = 6.8 + Math.abs(state.speed) * 0.12, h = 2.3 - orbit.pitch * 5;
    const tx = state.x + Math.sin(cy) * dist, tz = state.z + Math.cos(cy) * dist;
    let ty = state.y + h;
    ty = Math.max(ty, L.heightAt(tx, tz) + 1.2);
    if (!camInit || dt <= 0) { camPos.set(tx, ty, tz); camInit = true; }
    else camPos.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 5));
    camLook.set(state.x - Math.sin(state.yaw) * 3, state.y + 1.2, state.z - Math.cos(state.yaw) * 3);
    cam.position.copy(camPos); cam.lookAt(camLook);
    const pl = ctx.playerObj;
    if (pl) { pl.pos.set(state.x, state.y, state.z); pl.vel.set(0, 0, 0); pl.yaw = state.yaw; }
  }
  /** Streaming focus: a little ahead of the car, more at speed. */
  function focus() { const k = 3 + Math.abs(state.speed) * 2.5, s = Math.sign(state.speed || 1); return { x: state.x - Math.sin(state.yaw) * k * s, z: state.z - Math.cos(state.yaw) * k * s }; }

  // the other views take the camera back: leave the car first (V drone / walk, R home, F fly, the number keys)
  // [v4:polish2] C is handled on keydown (not polled once per frame), so a short press during a frame hitch is never lost
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => {
    const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    if (e.code === 'KeyC' && !e.repeat && !typing && document.body?.classList?.contains('playing')) { toggle(); return; }
    if (state.active && (e.code === 'KeyV' || e.code === 'KeyR' || e.code === 'KeyF' || /^Digit\d$/.test(e.code)) && !typing) exit();
  }, true);
  ctx.onUpdate((dt) => {
    if (state.active && (ctx.services.life?.tour?.flying || ctx.planet?.active)) exit();
    if (state.active || eng.on) try { engine(dt); } catch (e) { /* no audio: silent car */ }
    update(dt);
  });

  const api = {
    enter, exit, toggle, update, focus, place, canEnter,
    get active() { return state.active; }, state,
    get kmh() { return Math.abs(state.speed) * 3.6; },
    get car() { return car; },
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
  return api;
}
