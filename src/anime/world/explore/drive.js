// [v4:explore] Drive mode (V3-SPEC section 10: "walk and drive modes (a car on real roads)"): a kei car on the real
// road network (explore/roadnet.js: every GSI centre-line with its measured carriageway width). The car keeps to the
// carriageways: past the kerb it slides along the road edge instead of leaving it, buildings and the sea stop it, and
// it rides over the river bridges' decks. A light lane assist keeps it on the left lane (Japan drives on the left)
// when you are not steering. Chase camera behind the car; the mouse (or a drag) orbits it.
//
// Keys: C enter / leave the car. W / S or the arrows: accelerate, brake and reverse; A / D steer; Space handbrake
// (the drift: rear grip falls to 35%); Shift: faster (60 km/h instead of 40; 110 km/h in a race). Touch: the stick
// steers and throttles, ドリフト holds the handbrake, ブースト boosts, 降りる gets out. A drag on the right orbits the camera.
// Counter-steer assist is on until the garage turns it off. The step is the slip model in drive-model.js.
//
//   const drive = createDrive(ctx, { net })   drive.enter() / drive.exit() / drive.toggle() / drive.active
//   drive.state -> { x, z, y, yaw, speed (m/s), kmh, road }   drive.focus() -> streaming focus ahead of the car
//   drive.canEnter(r = 14) -> is there a road within r metres of the player (the touch pad's 乗る button)
import * as THREE from 'three';
import { makeKeiCar } from '../town/sakura/vehicles_cars.js';
import { damp, lerp, lerpAngle } from '../../core/timestep.js';   // [smooth]
import { carStep, CAR, RACE } from './drive-model.js';
import { HELD_R } from '../../ui/holdkey.js';   // [r-hold]
import { mouseLook, lookBlocked } from '../../ui/look-settings.js';

export { carStep, CAR, RACE };

// Two headlight cones, cheap cards on the road. Colour stays at or below 1
// so the bloom pass does not turn them into balls. Local +Z is the nose.
const CONE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const CONE_FRAG = /* glsl */`
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    float edge = smoothstep(1.0, 0.08, across);
    float along = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
    float a = edge * along * edge * 0.42;
    if (a < 0.02) discard;
    vec3 col = mix(vec3(1.0, 0.93, 0.72), vec3(0.96, 0.74, 0.38), smoothstep(0.05, 0.8, vUv.y));
    gl_FragColor = vec4(col, a);
  }`;

function headlightCone() {
  // Flat on the asphalt, starting just past the bumper so the card never
  // cuts through the body. The chase camera sees this stretch of road.
  const y = 0.05, z0 = 2.2, z1 = 13;
  const pos = new Float32Array(24);
  const uv = new Float32Array(16);
  const idx = new Uint16Array(12);
  let v = 0, t = 0, ii = 0;
  for (const s of [1, -1]) {
    const x = 0.50 * s;
    const quad = [
      x - s * 0.12, y, z0,
      x + s * 0.28, y, z0,
      x + s * 1.7, y, z1,
      x - s * 0.85, y, z1,
    ];
    const base = v / 3;
    for (let k = 0; k < 12; k++) pos[v++] = quad[k];
    uv[t++] = 0; uv[t++] = 0; uv[t++] = 1; uv[t++] = 0; uv[t++] = 1; uv[t++] = 1; uv[t++] = 0; uv[t++] = 1;
    if (s > 0) {
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
    } else {
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 1;
      idx[ii++] = base; idx[ii++] = base + 3; idx[ii++] = base + 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'explore-headlight';
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

export function createDrive(ctx, { net, carMesh = null }) {   // [smooth] carMesh(): the car's group instead of the kei kit's (unit tests have no canvas)
  const L = ctx.L, cam = ctx.camera;
  const state = {
    active: false, x: 0, z: 0, y: 0, yaw: 0, speed: 0, steer: 0, pitch: 0, roll: 0, road: null, scrape: 0, km: 0,
    u: 0, vLat: 0, yawRate: 0, slipF: 0, slipR: 0, gear: 1, rpm: 850, skid: 0, driftStep: 0, shift: 0,
    race: false, locked: false,
  };
  const look = { color: '#F8B500' };
  let assistOn = true, dress = null, dressTick = null, fovBase = 0, chaseLag = 0;
  const onShift = new Set();
  let motionQ = null;
  const reducedMotion = () => {
    if (motionQ === null && typeof matchMedia === 'function') motionQ = matchMedia('(prefers-reduced-motion: reduce)');
    return !!motionQ?.matches;
  };
  const listeners = new Set();
  let car = null, lamps = null, glow = null;
  const orbit = { yaw: 0, pitch: -0.18, back: 0 };   // camera orbit offsets (radians) around the chase position
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _ct = new THREE.Vector3();
  let camInit = false;
  // [smooth] the car one simulation step ago: present() draws it between that and the newest step (ctx.alpha)
  const prev = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, roll: 0 };
  const keep = () => { prev.x = state.x; prev.z = state.z; prev.y = state.y; prev.yaw = state.yaw; prev.pitch = state.pitch; prev.roll = state.roll; };

  function makeCar() {
    const g = new THREE.Group(); g.name = 'explore-car';
    const body = makeKeiCar(ctx, { color: look.color });   // 山吹色 by default; the garage repaints it
    body.name = 'kei-body';
    g.add(body);
    // Headlamps, and tail lamps in 茜 #B7282E. Intensity 1.8 puts the lens just
    // over the bloom threshold (1.05) so it glows, and stays a lamp rather than a ball.
    const head = ctx.mat.emissive ? ctx.mat.emissive('#fff4d8', 2.2) : new THREE.MeshBasicMaterial({ color: '#fff4d8' });
    const tail = ctx.mat.emissive ? ctx.mat.emissive('#B7282E', 2.6) : new THREE.MeshBasicMaterial({ color: '#B7282E' });
    tail.polygonOffset = true; tail.polygonOffsetFactor = -2; tail.polygonOffsetUnits = -2;
    lamps = new THREE.Group();
    const disc = new THREE.CircleGeometry(0.09, 14);
    for (const sd of [-1, 1]) {
      const h = new THREE.Mesh(disc, head); h.position.set(sd * 0.50, 0.66, 1.78); h.rotation.x = -0.35; lamps.add(h);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), tail); t.position.set(sd * 0.52, 0.7, -1.74); t.rotation.y = Math.PI; lamps.add(t);
    }
    lamps.visible = false; g.add(lamps);
    glow = headlightCone();
    glow.visible = false;
    g.add(glow);
    g.traverse((o) => { o.userData.noBatch = true; o.userData.dynamic = true; });
    ctx.noOutline(lamps); ctx.noOutline(glow);
    if (dress) dress(g, look);
    ctx.add(g);
    g.visible = false;
    return g;
  }
  function dropCar() {
    if (!car) return;
    car.traverse((o) => { if (o.geometry?.type === 'ExtrudeGeometry') o.geometry.dispose(); });
    car.parent?.remove(car);
    car = null; lamps = null; glow = null;
  }

  const input = { throttle: 0, steer: 0, brake: false, boost: false };
  const keys = new Set();
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => { if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; keys.add(e.code); if (state.active && ['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => keys.clear());
    let dragX = 0, dragY = 0;
    addEventListener('mousedown', (e) => { dragX = e.clientX; dragY = e.clientY; });
    addEventListener('mousemove', (e) => {
      if (!state.active || lookBlocked()) return;
      const locked = document.pointerLockElement === ctx.renderer?.domElement;
      let d = null;
      if (locked) d = mouseLook(e.movementX || 0, e.movementY || 0);
      else if (e.buttons) { d = mouseLook(e.clientX - dragX, e.clientY - dragY, { drag: true }); dragX = e.clientX; dragY = e.clientY; }
      if (!d) return;
      orbit.yaw += d.yaw; orbit.pitch = Math.max(-0.7, Math.min(0.25, orbit.pitch + d.pitch)); orbit.back = 2.5;
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
    if (!car) car = carMesh ? carMesh() : makeCar();
    Object.assign(state, {
      active: true, x: sp.x, z: sp.z, yaw: sp.yaw, speed: 0, steer: 0, road: sp.road,
      u: 0, vLat: 0, yawRate: 0, slipF: 0, slipR: 0, gear: 1, rpm: 850, skid: 0,
    });
    state.y = groundY(sp.x, sp.z, 1e9);
    orbit.yaw = 0; orbit.pitch = -0.18; camInit = false; chaseLag = 0;
    fovBase = cam.fov || fovBase;
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
    state.locked = false;
    if (fovBase && cam) { cam.fov = fovBase; cam.updateProjectionMatrix?.(); }
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
    input.counterSteer = assistOn;
    // lane assist: no steering input and moving: ease the heading onto the road ahead. A drift turns it off.
    input.assist = Math.abs(st) < 0.05 && Math.abs(state.speed) > 1.2 && !input.brake && !state.skid;
    if (state.locked) { input.throttle = 0; input.steer = 0; input.brake = false; input.boost = false; input.counterSteer = false; input.assist = false; }
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
    const rpm = state.rpm || 850;
    let f = 32 + (rpm / 6500) * 128 + Math.max(0, input.throttle) * 18;
    if (state.shift) eng.blip = 0.18;
    if (eng.blip > 0) { f += 84 * (eng.blip / 0.18); eng.blip = Math.max(0, eng.blip - dt); }
    const v = Math.abs(state.speed);
    const slip = Math.abs(state.slipR || 0);
    const level = !state.active || A.muted ? 0 : 0.016 + Math.min(1, v / 22) * 0.028 + Math.max(0, input.throttle) * 0.014 + (state.skid ? 0.01 : 0);
    const t = ac.currentTime;
    eng.o1.frequency.setTargetAtTime(f, t, 0.05); eng.o2.frequency.setTargetAtTime(f * 2.02, t, 0.05); eng.g.gain.setTargetAtTime(level, t, 0.08);
    if (!eng.noise) {
      const len = ac.sampleRate;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; data[i] = s / 1073741823.5 - 1; }
      eng.noise = ac.createBufferSource();
      eng.noise.buffer = buf;
      eng.noise.loop = true;
      eng.bp = ac.createBiquadFilter();
      eng.bp.type = 'bandpass';
      eng.bp.frequency.value = 880;
      eng.bp.Q.value = 0.7;
      eng.ng = ac.createGain();
      eng.ng.gain.value = 0;
      eng.noise.connect(eng.bp);
      eng.bp.connect(eng.ng);
      eng.ng.connect(ac.destination);
      eng.noise.start();
    }
    const scrub = state.active && state.skid && !A.muted ? Math.min(0.07, 0.012 + slip * 0.14) : 0;
    eng.ng.gain.setTargetAtTime(scrub, t, 0.05);
    eng.bp.frequency.setTargetAtTime(640 + slip * 2200, t, 0.06);
    void dt;
  }

  const P = { x: 0, z: 0 };
  const solidAtHit = (x, z) => !!ctx.physics?.solidAt?.(x, z, state.y + 0.7);
  /** One frame without the fixed clock (tests, tools): a step, then the car and the camera at the newest state. */
  function update(dt) { if (step(dt)) present(dt, 1); }
  /** [smooth] One simulation step (main.js: a fixed 1/60 s): input, the slip model, the kerbs, the walls, the ride height. */
  function step(dt) {
    if (!state.active || dt <= 0) return false;
    keep();
    dt = Math.min(dt, 0.05);
    readInput();
    const ox = state.x, oz = state.z;
    const C = state.race ? RACE : CAR;
    // at race speed a single push-out can skip a thin collider; the sweep stops the body on the near side
    const sweep = state.race && Math.abs(state.speed) > 18 && ctx.physics?.solidAt ? solidAtHit : null;
    carStep(state, input, dt, C, state, sweep);
    if (state.shift) for (const f of onShift) try { f(); } catch (e) { console.error(e); }
    if (input.assist) {
      const a = net.ahead(state.x, state.z, state.yaw, 6 + Math.abs(state.speed) * 0.8);
      if (a) {
        const want = Math.atan2(-a.dx * Math.sign(state.speed || 1), -a.dz * Math.sign(state.speed || 1));
        const d = Math.atan2(Math.sin(want - state.yaw), Math.cos(want - state.yaw));
        if (Math.abs(d) < 0.6) state.yaw += d * Math.min(1, dt * 1.6);
      }
    }
    const sliding = !!state.skid || !!input.brake;
    const c = net.clampToRoad(state.x, state.z, CAR.halfW * 0.8);
    if (c.off > 0 && Number.isFinite(c.off)) {
      state.x = c.x; state.z = c.z;
      const bite = Math.min(1, c.off / 1.4);
      state.speed *= Math.max(0.45, 1 - dt * (sliding ? 1.4 : 3.2) * bite);
      state.u = state.speed;
      state.scrape = 0.4;
    } else if (!Number.isFinite(c.off)) { state.x = ox; state.z = oz; state.speed = 0; state.u = 0; }
    P.x = state.x; P.z = state.z;
    const ph = ctx.physics;
    if (ph?.resolve) ph.resolve(P, CAR.radius, state.y + 0.2, 1.4);
    if (Math.hypot(P.x - state.x, P.z - state.z) > 0.02) { state.speed *= Math.max(0.1, 1 - dt * 6); state.u = state.speed; state.scrape = 0.4; }
    state.x = P.x; state.z = P.z;
    if (ph?.standable && !ph.standable(state.x, state.z, state.y)) { state.x = ox; state.z = oz; state.speed = 0; state.u = 0; }
    const b = L.WORLD?.play; if (b) { state.x = Math.max(b.x0, Math.min(b.x1, state.x)); state.z = Math.max(b.z0, Math.min(b.z1, state.z)); }
    state.km += Math.hypot(state.x - ox, state.z - oz) / 1000;
    state.scrape = Math.max(0, state.scrape - dt);
    ride(dt);
    return true;
  }
  /** Put the car and the camera where the car is now (entering, the screenshot tools): no blend from an older step. */
  function place(dt) { ride(dt); keep(); present(dt, 1); }
  function ride(dt) {
    // ride height from the ground at the four wheels (terrain, street, bridge decks): pitch and roll follow the road
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    const hw = CAR.wheelbase / 2, ht = 0.62;
    const yF = groundY(state.x + fx * hw, state.z + fz * hw, state.y + 0.8), yB = groundY(state.x - fx * hw, state.z - fz * hw, state.y + 0.8);
    const yL = groundY(state.x - rx * ht, state.z - rz * ht, state.y + 0.8), yR = groundY(state.x + rx * ht, state.z + rz * ht, state.y + 0.8);
    const yT = (yF + yB + yL + yR) / 4;
    state.y = dt > 0 ? state.y + (yT - state.y) * Math.min(1, dt * 12) : yT;
    const pitch = Math.atan2(yF - yB, CAR.wheelbase), roll = Math.atan2(yR - yL, ht * 2);
    state.pitch += (pitch - state.pitch) * Math.min(1, (dt || 1) * 10); state.roll += (roll - state.roll) * Math.min(1, (dt || 1) * 10);
    const pl = ctx.playerObj;
    if (pl) { pl.pos.set(state.x, state.y, state.z); pl.vel.set(0, 0, 0); pl.yaw = state.yaw; }
  }
  /** [smooth] Draw the car and its chase camera at this frame: alpha of the way from the step before to the newest (ctx.alpha), the
   *  camera's easing in the frame's own time (dt), so the same at 60 and 120 Hz. */
  function present(dt, alpha = 1) {
    const a = alpha >= 1 ? 1 : Math.max(0, alpha);
    const x = lerp(prev.x, state.x, a), z = lerp(prev.z, state.z, a), y = lerp(prev.y, state.y, a), yaw = lerpAngle(prev.yaw, state.yaw, a);
    if (car) {
      car.position.set(x, y, z);
      car.rotation.set(0, 0, 0, 'YXZ');
      car.rotation.y = yaw + Math.PI;
      car.rotation.x = lerp(prev.pitch, state.pitch, a); car.rotation.z = -lerp(prev.roll, state.roll, a);
      const night = ctx.shared.uNight?.value ?? 0, lampsOn = (ctx.shared.uLamps?.value ?? night) > 0.3 || night > 0.3;
      if (lamps) lamps.visible = lampsOn; if (glow) glow.visible = lampsOn;
    }
    // chase camera: behind and above, orbit offsets from the mouse ease back behind the car after a while
    // [smooth] the easings are exponential in the frame's time (they were per frame: 1.52 /s and 5.22 /s are what they gave at 60 Hz)
    if (dt > 0 && orbit.back > 0) orbit.back -= dt; else if (dt > 0) { orbit.yaw *= Math.exp(-1.52 * dt); }
    const lagTarget = reducedMotion() ? 0 : Math.max(-0.32, Math.min(0.32, -(state.yawRate || 0) * 0.55));
    if (dt > 0) chaseLag += (lagTarget - chaseLag) * damp(2.6, dt);
    const cy = yaw + orbit.yaw + chaseLag, dist = 6.8 + Math.abs(state.speed) * 0.12, h = 2.3 - orbit.pitch * 5;
    if (fovBase > 0 && cam.fov != null && !reducedMotion()) {
      const top = state.race ? RACE.vMax : CAR.vBoost;
      const want = fovBase + 8 * Math.min(1, Math.abs(state.speed) / top);
      if (Math.abs(cam.fov - want) > 0.04) { cam.fov += (want - cam.fov) * damp(3.2, dt || 0.016); cam.updateProjectionMatrix(); }
    }
    if (dressTick && car) dressTick(car, state, dt);
    const tx = x + Math.sin(cy) * dist, tz = z + Math.cos(cy) * dist;
    let ty = y + h;
    ty = Math.max(ty, L.heightAt(tx, tz) + 1.2);
    if (!camInit || dt <= 0) { camPos.set(tx, ty, tz); camInit = true; }
    else camPos.lerp(_ct.set(tx, ty, tz), damp(5.22, dt));
    camLook.set(x - Math.sin(yaw) * 3, y + 1.2, z - Math.cos(yaw) * 3);
    cam.position.copy(camPos); cam.lookAt(camLook);
  }
  /** Streaming focus: a little ahead of the car, more at speed. */
  function focus() { const k = 3 + Math.abs(state.speed) * 2.5, s = Math.sign(state.speed || 1); return { x: state.x - Math.sin(state.yaw) * k * s, z: state.z - Math.cos(state.yaw) * k * s }; }

  // the other views take the camera back: leave the car first (V drone / walk, hold R home, F fly, the number keys)
  // [v4:polish2] C is handled on keydown (not polled once per frame), so a short press during a frame hitch is never lost
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.code === 'KeyC' && !e.repeat && !typing && document.body?.classList?.contains('playing')) { toggle(); return; }
      if (state.active && (e.code === 'KeyV' || e.code === 'KeyF' || /^Digit\d$/.test(e.code)) && !typing) exit();
    }, true);
    addEventListener(HELD_R, () => { if (state.active) exit(); });
  }
  // [smooth] the physics at the fixed rate, the drawing every frame (in shot mode and window.__sim: one after the other, as update() did)
  ctx.onStep((dt) => { step(dt); });
  ctx.onUpdate((dt) => {
    if (state.active && (ctx.services.life?.tour?.flying || ctx.planet?.active)) exit();
    if (state.active || eng.on) try { engine(dt); } catch (e) { /* no audio: silent car */ }
    if (state.active && dt > 0) present(dt, ctx.alpha ?? 1);
  });

  // [smooth] the car is built now, hidden, so the loading card's warm-up frame (main.js) compiles its programs: built on the first 乗る, its
  // lamps and glow cost a shader compile in the middle of play
  if (!carMesh && typeof document !== 'undefined') { try { car = makeCar(); } catch (e) { console.warn('[explore:drive] car', e); } }

  function setLook(next) {
    const paint = next?.color && next.color !== look.color;
    if (next) Object.assign(look, next);
    if (paint && car && !carMesh) { dropCar(); car = makeCar(); car.visible = state.active; }
    else if (dress && car) dress(car, look);
  }
  const api = {
    enter, exit, toggle, update, step, present, focus, place, canEnter,
    setAssist(on) { assistOn = !!on; },
    setRace(on) { state.race = !!on; },
    setLocked(on) { state.locked = !!on; },
    setLook,
    /** Hold a chase-camera orbit (radians) for `hold` seconds. The garage shots use it; play eases back on its own. */
    lookOrbit(yaw, pitch, hold = 4) {
      orbit.yaw = yaw;
      orbit.pitch = Math.max(-0.7, Math.min(0.25, pitch));
      orbit.back = hold;
    },
    setDress(fn, tick) { dress = fn; dressTick = tick || null; if (dress && car) dress(car, look); },
    onShift(fn) { onShift.add(fn); return () => onShift.delete(fn); },
    get active() { return state.active; }, state, look,
    get kmh() { return Math.abs(state.speed) * 3.6; },
    get car() { return car; },
    get assist() { return assistOn; },
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
  };
  return api;
}
