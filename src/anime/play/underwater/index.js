// [play:underwater] Dive. main.js mounts this before the programs compile.
// play/index.js calls mount again; the second call returns the same service.
// The boat stays where it was (sail.step and sail.present no-op while swim.active).
// The camera is written here, in onUpdate, after player.present.
// [mobile-play] The mount is the service only (the offer, the HUD, the keys, the hub card). The dive's world (the player fish,
// the rafts and longlines, the schools and jellyfish, the bubbles, the crops) is built when a dive starts, behind the hub's
// title card (kit/lazy.js), and a phone frees it when the dive ends. Deploy #5 built it here, before the start view's
// programs compiled, so every phone compiled the dive's programs at startup.

import * as THREE from 'three';
import RAFTS from '../../../../data/play/rafts.json';
import { TUNE } from './tune.js';
import { createState, swimStep, speciesAt, canDive, cameraBeat, entryPose, airTap, quayStart } from './logic.js';
import { swimU, updateSwimLight, setSwimTier } from './fog.js';
import { createPlayerFish } from './fish.js';
import { createCulture } from './culture.js';
import { createCrops } from './crops.js';
import { createLife } from './life.js';
import { createBits } from './bits.js';
import { createHud, t, label } from './hud.js';
import { shimKit, shimUnder } from './shim.js';
import { loadKit } from './kit-link.js';
import { lazyWorld } from '../kit/lazy.js';
import { HELD_R } from '../../ui/holdkey.js';   // [r-hold]
import { mouseLook } from '../../ui/look-settings.js';

const input = { thrust: 0, strafe: 0, lift: 0, dash: false };
const splashAt = { x: 0, y: 0, z: 0 };
const splashFx = { count: 18, scale: 0.22 };
const rippleFx = { radius: 2.6 };
const hear = { position: splashAt, pitch: 0, gain: 1 };
let punch = 0;
let apexMarked = 0;
let mounting = null;
const beat = { back: 0, up: 0, fov: 0, roll: 0 };
const look = new THREE.Vector3();
/** [fish-fix] where the fish is drawn this frame: between the last two simulation steps (ctx.alpha), as the walker is */
const drawn = { x: 0, y: 0, z: 0 };
const keys = new Set();
const _hullBox = new THREE.Box3();
const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'ControlLeft']);

function paramsOf() {
  return new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
}

function reducedMotion(params) {
  if (params.get('motion') === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shotPose(q, hero) {
  if (q === 'hoya' && hero) return { x: hero.park.x, y: hero.park.y, z: hero.park.z, yaw: hero.yaw, pitch: 0.15, frame: hero.frame };
  if (q === 'shafts' && hero) return { x: hero.under.x, y: hero.under.y, z: hero.under.z, yaw: hero.yaw, pitch: 0.35, frame: hero.shaft, glow: hero.at };
  if (q === 'raft') return { x: 1606, y: -6.1, z: 3634, yaw: 0.4, pitch: 0.42 };
  if (q === 'school') return { x: 186, y: -2.3, z: 18, yaw: 0.5, pitch: 0.05 };
  if (q === 'breach') return { x: 420, y: -0.2, z: 40, yaw: 0, pitch: 1.05, kick: true };
  if (q === 'apex') return { x: 420, y: 2.7, z: 36, yaw: 0.35, pitch: 0.2, mode: 'breach', breachT: 0.4, vy: 5.5, vx: -1.1, vz: -2.4, ring: true };
  if (q === 'katsuo') return { x: 1900, y: -4.2, z: 8020, yaw: 0.2, pitch: 0 };
  return { x: 368, y: -1.35, z: 12, yaw: 0.8, pitch: -0.7 };
}

export function mount(ctx, kit) {
  if (!ctx) return null;
  if (ctx.services?.swim) {
    try { ctx.services.swim.attachKit?.(kit); } catch (e) { /* the corner button stays */ }
    return ctx.services.swim;
  }
  if (mounting) return mounting;
  mounting = mountInner(ctx, kit).catch((e) => { mounting = null; throw e; });
  return mounting;
}

async function mountInner(ctx, kit) {
  const params = paramsOf();
  if (params.get('play') === '0') return null;
  setSwimTier(!!ctx.quality?.phone);
  const hud = createHud();
  // [mobile-play] built on the first dive (and again after a phone freed it); hidden until begin() shows it
  const world = lazyWorld(ctx, 'swim', (w) => {
    const p = { fish: createPlayerFish(w) };
    p.culture = createCulture(w, RAFTS);
    p.life = createLife(w);
    p.bits = createBits(w);
    p.crops = createCrops(w, p.culture.list, p.culture.time, p.culture.amp);
    p.fish.mesh.visible = false;
    p.culture.mesh.visible = false;
    p.life.setVisible(false);
    p.bits.setVisible(false);
    p.bits.ring.visible = false;
    p.crops.setVisible(false);
    return p;
  });
  let fish = null, culture = null, life = null, bits = null, crops = null;
  /** The world's parts, built now if they are not (a dive, a shot pose, a tool reading the hero). */
  function built() {
    const p = world.ensure();
    if (p.fish !== fish) ({ fish, culture, life, bits, crops } = p);
    return p;
  }
  if (!kit) kit = (await loadKit()) || shimKit(ctx);
  const L = ctx.L;
  const env = { bed: (x, z) => L.heightAt(x, z), shore: (x, z) => L.shoreDist(x, z) };
  // [fish-fix] metres of open water ahead of (x, y, z) along a heading, in the fish's lane and the camera's (1.2 m either side):
  // no bank, no physics solid, no mesh (the quay's piles are drawn, not colliders). Used once per start, behind the title card.
  const ray = new THREE.Raycaster();
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _bc = new THREE.Vector3();
  let near = null;
  function meshesNear(x, z, r) {
    const out = [];
    ctx.scene?.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || o.userData?.play || o.userData?.sky) return;
      let bs = null;
      if (o.isInstancedMesh || o.isBatchedMesh) { if (!o.boundingSphere) o.computeBoundingSphere?.(); bs = o.boundingSphere; }
      else if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); bs = o.geometry.boundingSphere; }
      if (!bs || !(bs.radius < 5000)) return;
      _bc.copy(bs.center).applyMatrix4(o.matrixWorld);
      const rad = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (Math.hypot(_bc.x - x, _bc.z - z) < r + rad) out.push(o);
    });
    return out;
  }
  // The view is the camera's: a fan of rays from where the camera sits (BACK behind the fish, CAM_SIDE to its right) across the
  // widest lens the dive is seen through (a desktop's ±40°). Straight ahead must be open for 14 m; to the sides less is enough
  // (CAP): a pile 5 m off at 25° fills a wide screen, the town 30 m off does not. Each ray also walks the banks and the physics.
  // -> metres of open view, 0 to 14 (14 × the tightest ray's free / its cap).
  const BACK = 2.6, FAN = [[0, 14], [-0.21, 12], [0.21, 12], [-0.44, 8], [0.44, 8], [-0.7, 6], [0.7, 6]];
  env.clearAhead = (x, y, z, yaw) => {
    const P = ctx.physics, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const cx = x - fx * BACK + rx * TUNE.camSide, cz = z - fz * BACK + rz * TUNE.camSide;
    let score = 14;
    for (const [a, cap] of FAN) {
      const dx = fx * Math.cos(a) + rx * Math.sin(a), dz = fz * Math.cos(a) + rz * Math.sin(a);
      let free = cap;
      for (let d = 0.5; d <= free; d += 0.5) {
        const qx = cx + dx * d, qz = cz + dz * d;
        if (L.shoreDist(qx, qz) < TUNE.shoreKeep) { free = d; break; }
        if (typeof P?.solidAt === 'function' && (P.solidAt(qx, qz, y) || P.solidAt(qx, qz, y + 0.6))) { free = d; break; }
      }
      if (near) {
        _rd.set(dx, 0, dz);
        for (const h of [0, 0.6]) {
          _ro.set(cx, y + h, cz);
          ray.set(_ro, _rd);
          ray.far = free;
          let hit = null;
          try { hit = ray.intersectObjects(near, false)[0]; } catch (e) { hit = null; }
          if (hit) free = Math.min(free, hit.distance);
        }
      }
      // anything between the camera and the fish blocks the heading outright
      if (a === 0 && free < BACK + 0.5) return 0;
      score = Math.min(score, 14 * free / cap);
      if (score <= 0) return 0;
    }
    return score;
  };
  const reduced = reducedMotion(params);
  let state = null;
  let saved = null;
  let shown = null;
  let dashOn = false;
  let padReady = false;
  let booted = false;
  let baseFov = ctx.camera.fov;
  let acc = 0;

  const swimPos = { x: 0, y: 0, z: 0 };
  const posFns = [];
  function publishPos() {
    if (!state) { swimPos._on = false; return; }
    if (swimPos._on && swimPos.x === state.x && swimPos.y === state.y && swimPos.z === state.z) return;
    swimPos.x = state.x; swimPos.y = state.y; swimPos.z = state.z; swimPos._on = true;
    for (let i = 0; i < posFns.length; i++) { try { posFns[i](swimPos); } catch (e) { /* one listener */ } }
  }
  const api = {
    get active() { return !!state; },
    get state() { return state; },
    get pos() { return state ? swimPos : null; },
    get frameMs() { return api._ms || 0; },
    on(ev, fn) {
      if (ev !== 'pos' || typeof fn !== 'function') return () => {};
      posFns.push(fn);
      return () => { const i = posFns.indexOf(fn); if (i >= 0) posFns.splice(i, 1); };
    },
    drive: null,
    get drops() { return culture ? culture.drops : null; },
    /** [mobile-play] the dive's world: built, prepared behind a cover, freed (kit/lazy.js) */
    world,
    enter(from) { begin(from); },
    exit() { end(); },
    pose(p) {
      if (!state) { begin('shot', p); return; }
      state.x = state.px = p.x; state.y = state.py = p.y; state.z = state.pz = p.z;   // a placed pose is not blended from the last one
      if (p.yaw != null) state.yaw = p.yaw;
      if (p.pitch != null) state.pitch = p.pitch;
      if (p.mode) state.mode = p.mode;
      if (p.vy != null) state.vy = p.vy;
      if (p.vx != null) state.vx = p.vx;
      if (p.vz != null) state.vz = p.vz;
      if (p.breachT != null) state.breachT = p.breachT;
      state.frame = p.frame || null;
      state.glow = p.glow || null;
      state.species = speciesAt(state.x, state.z);
      fish.setSpecies(state.species);
      hud.species(state.species);
      place(0);
    },
  };
  // (the shot tools read these before they pose: reading the hero or the crops builds the world; not enumerable, so
  // nothing that walks the service builds it by accident)
  Object.defineProperty(api, 'nodes', { get: () => (fish ? [fish.mesh, culture.mesh, ...life.meshes, life.jellies.mesh, bits.mesh, bits.ring, ...crops.meshes] : []) });
  Object.defineProperty(api, 'hero', { get: () => built().crops.hero });
  Object.defineProperty(api, 'crops', { get: () => built().crops });
  api.swimU = swimU;
  /** the numbers the dive runs on (the framing tools read and try them) */
  api.tune = TUNE;
  /** Probe switches for the shot tools: no caustics, or no water chunk at all. */
  api.debug = { noCaustic: false, noWater: false };
  api.airTap = () => airTap(state, TUNE, reduced);
  api.splash = (which) => {
    if (!state) return;
    bits.burst(state.x, state.z, which === 'in' ? 'in' : 'out');
    bits.step(0.24, false);
    splashAt.x = state.x; splashAt.y = 0.12; splashAt.z = state.z;
    try {
      splashFx.count = which === 'in' ? 32 : 26;
      splashFx.scale = which === 'in' ? 0.4 : 0.32;
      rippleFx.radius = which === 'in' ? 3.6 : 2.8;
      kit.fx?.burst?.(splashAt, 'splash', splashFx);
      kit.fx?.ripple?.(splashAt, rippleFx);
    } catch (e) { /* fx not up */ }
  };
  ctx.services.swim = api;

  // The bay boats loop around the inner bay. A leap beside one can put the camera inside its hull, where the hull is
  // all you see (round 2's "purple slab"). While the dive runs, a boat whose hull holds the camera is hidden.
  const hulls = [];
  let hullsFound = false;
  function findHulls() {
    hullsFound = true;
    const root = ctx.dynamicRoot || ctx.scene;
    if (!root) return;
    for (const o of root.children) {
      if (!o.name || !o.name.startsWith('bay-boat:')) continue;
      const px = o.position.x, py = o.position.y, pz = o.position.z, ry = o.rotation.y;
      o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.updateMatrixWorld(true);
      _hullBox.makeEmpty();
      for (const c of o.children) if (c.name !== 'wake') _hullBox.expandByObject(c);
      o.position.set(px, py, pz); o.rotation.set(0, ry, 0); o.updateMatrixWorld(true);
      if (_hullBox.isEmpty()) continue;
      hulls.push({
        o, hidden: false,
        cx: (_hullBox.min.x + _hullBox.max.x) / 2, cz: (_hullBox.min.z + _hullBox.max.z) / 2,
        hx: (_hullBox.max.x - _hullBox.min.x) / 2, hz: (_hullBox.max.z - _hullBox.min.z) / 2, top: _hullBox.max.y,
      });
    }
  }
  function clearHulls(cam, on) {
    if (!hullsFound) findHulls();
    for (let i = 0; i < hulls.length; i++) {
      const h = hulls[i], o = h.o;
      const c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y);
      const dx = cam.x - o.position.x, dz = cam.z - o.position.z;
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const inside = on && Math.abs(lx - h.cx) < h.hx + 0.7 && Math.abs(lz - h.cz) < h.hz + 0.7 && cam.y < o.position.y + h.top + 0.5;
      if (inside && !h.hidden) { h.hidden = true; o.visible = false; } else if (!inside && h.hidden) { h.hidden = false; o.visible = true; }
    }
  }
  api.hulls = hulls;

  function show(on) {
    if (fish) {
      fish.mesh.visible = on;
      culture.mesh.visible = on;
      life.setVisible(on);
      bits.setVisible(on);
      crops.setVisible(on);
    }
    hud.show(on);
  }

  // Under the surface the outlines fade with the water (4–14 m) and the colour pass skips the town past 90 m.
  const pipe = ctx.pipeline;
  if (pipe && typeof pipe.setView === 'function' && !pipe.__swimView) {
    const base = pipe.setView;
    pipe.setView = (alt) => {
      base(alt);
      if (swimU.uSwim.value > 0.5) pipe.compMat?.uniforms?.uLineRange?.value?.set(4, 14);
    };
    pipe.__swimView = true;
  }
  function syncUnder() {
    const under = ctx.camera.position.y < 0.05 ? 1 : 0;
    swimU.uSwim.value = under;
    try { pipe?.setViewMax?.(under ? 90 : 0); } catch (e) { /* older pipeline */ }
    if (under) updateSwimLight(ctx.shared?.uSunDir?.value || ctx.sunDir, ctx.sky?.uniforms?.uNight?.value || 0, ctx.camera.position);
    if (api.debug.noCaustic) swimU.uSwimCau.value = 0;
    if (api.debug.noWater) swimU.uSwim.value = 0;
    if (ctx.sky?.uniforms?.uSwim) ctx.sky.uniforms.uSwim.value = under;
    try { ctx.audio?.setUnderwater?.(under > 0); } catch (e) { /* graph not built yet */ }
    shimUnder(under > 0);
  }

  function ensurePad() {
    const pad = ctx.pad;
    if (!pad || padReady || typeof pad.registerMode !== 'function') return;
    padReady = true;
    pad.registerMode('swim', {
      stick: 'analog',
      buttons: [
        { id: 'swim-up', label: label('play.swim.up'), icon: 'up', hold: true },
        { id: 'swim-down', label: label('play.swim.down'), icon: 'down', hold: true },
        { id: 'swim-dash', label: label('play.swim.dash'), icon: 'dash', toggle: true, onDown: (_p, on) => { dashOn = !!on; if (on) airTap(state, TUNE, reduced); } },
        { id: 'swim-out', label: label('play.swim.surface'), icon: 'walk', onDown: () => end() },
      ],
    });
  }

  function readInput() {
    if (api.drive) {
      input.thrust = api.drive.thrust || 0;
      input.strafe = api.drive.strafe || 0;
      input.lift = api.drive.lift || 0;
      input.dash = !!api.drive.dash;
      return input;
    }
    let thrust = 0, strafe = 0, lift = 0, dash = false;
    if (keys.has('KeyW') || keys.has('ArrowUp')) thrust += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) thrust -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    if (keys.has('Space') || keys.has('KeyE')) lift += 1;
    if (keys.has('KeyQ') || keys.has('ControlLeft')) lift -= 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) dash = true;
    const pad = ctx.pad;
    if (pad) {
      thrust -= pad.move?.y || 0;
      strafe += pad.move?.x || 0;
      if (pad.isDown?.('swim-up')) lift += 1;
      if (pad.isDown?.('swim-down')) lift -= 1;
      if (dashOn) dash = true;
    }
    input.thrust = thrust; input.strafe = strafe; input.lift = lift; input.dash = dash;
    return input;
  }

  function begin(from, pose) {
    const pl = ctx.playerObj;
    if (!pl || state) return;
    const via = from === 'mission' ? 'mission' : (from === 'menu' || from === 'mode') ? 'hub' : 'chip';
    const atShore = via === 'chip' && from !== 'sail';
    if (typeof pl.allowMode === 'function' && !pl.allowMode('dive', { via, atShore })) return;
    built();
    ensurePad();
    const sail = ctx.services.sail;
    const sailing = from === 'sail' || (from !== 'menu' && from !== 'shot' && from !== 'mode' && sail?.active);
    saved = {
      from: sailing ? 'sail' : from,
      lookCapture: pl.lookCapture, lookSink: pl.lookSink, lookWhileDisabled: pl.lookWhileDisabled,
      fly: pl.fly, enabled: pl.enabled,
      x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch,
    };
    if (!pose) {
      if (from === 'menu') pose = { x: 368, y: -1.4, z: 8, yaw: 0.4, pitch: 0 };
      else if (from === 'mode') pose = quay();
      else {
        const x = sailing ? sail.boat.x : pl.pos.x;
        const z = sailing ? sail.boat.z : pl.pos.z;
        const yaw = sailing ? (sail.boat.yaw || 0) : pl.yaw;
        pose = entryPose(x, z, yaw, env);
      }
    }
    state = createState(pose.x, pose.y, pose.z, pose.yaw || 0, speciesAt(pose.x, pose.z));
    state.pitch = pose.pitch || 0;
    state.frame = pose.frame || null;
    state.glow = pose.glow || null;
    if (pose.mode) state.mode = pose.mode;
    if (pose.vy) state.vy = pose.vy;
    if (pose.vx) state.vx = pose.vx;
    if (pose.vz) state.vz = pose.vz;
    if (pose.breachT) state.breachT = pose.breachT;
    if (pose.kick) { state.mode = 'breach'; state.breachN = 1; state.vy = TUNE.breachKick; state.y = Math.max(state.y, 0.12); }
    punch = 0;
    apexMarked = 0;
    shown = null;
    baseFov = ctx.camera.fov;
    pl.enabled = false;
    pl.fly = true;
    pl.vel?.set(0, 0, 0);
    pl.lookWhileDisabled = true;
    pl.lookCapture = (dx, dy) => { const d = mouseLook(dx, dy); state.yaw += d.yaw; state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch + d.pitch)); };
    pl.lookSink = (dx, dy) => { state.yaw -= dx; state.pitch = Math.max(-1.15, Math.min(1.15, state.pitch - dy)); };
    ctx.services.life?.tour?.stop?.();
    try { ctx.pad?.setMode('swim'); } catch (e) { /* pad not up yet */ }
    hud.swimming(true);
    show(true);
    lesson.from.x = state.x; lesson.from.z = state.z; lesson.t = 0;
    lesson.touch = !!ctx.pad?.active || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    fish.setSpecies(state.species);
    hud.species(state.species);
    shown = state.species;
    place(0);
    if (from !== 'shot') { coachFirstSwim(); deskActions(true); }
    hud.wait(!!(coach && coachEl && !coachEl.hidden));   // the chip comes in once the coach has gone
    if (pose.ring) { api.splash('out'); bits.step(0.2, reduced); }
  }

  // [fish-fix] Teach one thing at a time. The coach (first dive only) teaches the swim; the leap line comes once the fish is
  // swimming and nothing else is teaching; the spin line comes in the air, on the first leap. Each once per visit. They used
  // to come together: the coach said 「勢いよく上がると、跳ねます」 and the old hint, printed on the coach, said it again.
  const lesson = { from: { x: 0, z: 0 }, t: 0, leap: false, spin: false, saying: '', left: 0, touch: false };
  function teach(dt) {
    if (state.mode === 'breach') {
      if (!lesson.spin && state.y > 0.3) { lesson.spin = true; lesson.leap = true; say(lesson.touch ? 'play.swim.lesson.spin.touch' : 'play.swim.lesson.spin.keys', 2.4); }
    } else if (!lesson.leap && !coach && !lesson.saying) {
      lesson.t += dt;
      if (lesson.t > 1.2 && Math.hypot(state.x - lesson.from.x, state.z - lesson.from.z) > 3) { lesson.leap = true; say('play.swim.lesson.leap', 6); }
    }
    if (lesson.saying) { lesson.left -= dt; if (lesson.left <= 0 || (lesson.saying === 'play.swim.lesson.leap' && state.mode === 'breach')) say(null); }
  }
  function say(key, secs = 0) {
    lesson.saying = key || '';
    lesson.left = secs;
    hud.say(key || null);
  }

  // [fish-fix] A desktop has no pad: the way out is a button with its key (V, as the gull's 「歩く」), so it is never only a secret key.
  let desk = null;
  function deskActions(on) {
    const touch = ctx.pad?.active || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    if (on && !touch && typeof kit?.ui?.actions === 'function' && !kit.shim) {
      try { desk = kit.ui.actions([{ id: 'swim-out', icon: 'back', key: 'KeyV', label: t('play.swim.surface'), onPress: () => end() }]); } catch (e) { desk = null; }
    } else if (!on && desk) {
      try { desk.clear(); } catch (e) { /* */ }
      desk = null;
    }
  }

  /** keep: the world stays built (a restart from inside the dive builds nothing). */
  function nearestLand(x, z) {
    let best = null;
    for (let r = 0; r <= 48; r += 3) {
      const n = r === 0 ? 1 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const qx = x + Math.cos(a) * r;
        const qz = z + Math.sin(a) * r;
        const s = env.shore(qx, qz);
        if (s < -0.3 && s > -4) { best = { x: qx, z: qz }; break; }
      }
      if (best) return best;
    }
    return null;
  }

  function end(keep = false) {
    if (!state) return;
    state = null;
    clearHulls(ctx.camera.position, false);
    keys.clear();
    dashOn = false;
    say(null);
    deskActions(false);
    hud.swimming(false);
    show(false);
    if (bits) bits.ring.visible = false;
    // a first-swim coach still up (the fish never moved) goes with the dive; not marked done, so the next dive shows it again
    if (coach) { try { coach.hide?.(); } catch (e) { /* */ } coach = null; }
    if (!keep) {
      world.leave();   // [mobile-play] a phone frees the dive's world; the next dive builds it behind the card
      if (!world.built) fish = culture = life = bits = crops = null;
    }
    const pl = ctx.playerObj;
    if (!pl || !saved) return;
    pl.lookCapture = saved.lookCapture || null;
    pl.lookSink = saved.lookSink || null;
    pl.lookWhileDisabled = !!saved.lookWhileDisabled;
    ctx.camera.fov = typeof ctx.fovFor === 'function' && ctx.camera.aspect > 0 ? ctx.fovFor(ctx.camera.aspect) : baseFov;
    ctx.camera.up.set(0, 1, 0);
    ctx.camera.updateProjectionMatrix();
    if (saved.from === 'mission' || saved.from === 'menu' || saved.from === 'mode') {
      const land = nearestLand(pl.pos.x, pl.pos.z);
      pl.fly = false;
      pl.enabled = saved.enabled !== false;
      const yaw = saved.yaw * 180 / Math.PI;
      if (land) pl.setPose(land.x, land.z, yaw, 0);
      else pl.setPose(saved.x, saved.z, yaw, saved.pitch * 180 / Math.PI);
      try { ctx.pad?.setMode(null); } catch { /* */ }
      saved = null;
      syncUnder();
      return;
    }
    if (saved.from === 'sail') {
      pl.enabled = false;
      pl.fly = true;
      try { ctx.pad?.setMode('sail'); } catch (e) { try { ctx.pad?.setMode(null); } catch (e2) { /* */ } }
      saved = null;
      syncUnder();
      return;
    }
    const yaw = saved.yaw * 180 / Math.PI, pitch = saved.pitch * 180 / Math.PI;
    if (saved.fly && saved.from !== 'menu') pl.setPose(saved.x, saved.z, yaw, pitch, saved.y + pl.eye);
    else { pl.fly = false; pl.setPose(saved.x, saved.z, yaw, pitch); }
    pl.enabled = typeof document !== 'undefined' && document.body?.classList?.contains('playing');
    try { ctx.pad?.setMode(null); } catch (e) { /* */ }
    saved = null;
    syncUnder();
  }

  function step(dt) {
    if (!state || !(dt > 0)) return;
    const t0 = performance.now();
    swimStep(state, readInput(), dt, env);
    const moving = Math.hypot(state.vx, state.vy, state.vz) > 0.4;
    life.step(dt, state, moving);
    life.jellies.step(reduced ? 0 : dt);
    bits.step(dt, reduced);
    {
      // bubbles leave from behind the head (the gills), a little above the body line
      const cp = Math.cos(state.pitch), k = 0.42;
      bits.breathe(dt, state.x - Math.sin(state.yaw) * cp * k, state.y + Math.sin(state.pitch) * k + 0.05, state.z - Math.cos(state.yaw) * cp * k,
        Math.hypot(state.vx, state.vy, state.vz), state.dashing);
    }
    culture.time.value += reduced ? dt * 0.15 : dt;
    culture.amp.value = reduced ? 0.12 : 1;
    fish.beat.value = state.tail;
    fish.amp.value = reduced ? 0.08 : (state.dashing ? 0.62 : 0.38);
    if (state.splash) {
      const out = state.splash === 1;
      bits.burst(state.x, state.z, out ? 'out' : 'in');
      splashAt.x = state.x;
      splashAt.y = out ? Math.max(0.05, state.y) : 0.02;
      splashAt.z = state.z;
      splashFx.count = out ? 26 : 32;
      splashFx.scale = out ? 0.32 : 0.42;
      rippleFx.radius = out ? 2.8 : 3.6;
      punch = out ? 1 : 0.9;
      try {
        // The camera moves after this step. Open the low-pass now so the leap stays bright.
        if (out) ctx.audio?.setUnderwater?.(false);
        hear.pitch = out ? 3 : -4;
        hear.gain = out ? 1 : 1.05;
        kit.sfx?.play?.('splash', hear);
        if (out) { hear.pitch = 1; hear.gain = 0.85; kit.sfx?.play?.('whoosh', hear); }
        else { hear.pitch = -6; hear.gain = 1.15; kit.sfx?.play?.('stamp', hear); }
        kit.fx?.burst?.(splashAt, 'splash', splashFx);
        kit.fx?.ripple?.(splashAt, rippleFx);
      } catch (e) { /* audio not started */ }
      if (out) hud.leapt();
    }
    if (coach && Math.hypot(state.x - coachFrom.x, state.z - coachFrom.z) > 3) { try { coach.done?.(); } catch (e) { /* */ } coach = null; hud.wait(false); }
    if (coach && coachEl && coachEl.hidden) { coach = null; hud.wait(false); }   // わかった closed it
    teach(dt);
    if (state.slowLeft > 0 && !apexMarked) { apexMarked = 1; if (punch < 0.75) punch = 0.75; }
    if (state.trick && !state.trickShown) {
      state.trickShown = 1;
      try { kit.ui?.toast?.(t('play.swim.nice'), { big: true }); } catch (e) { /* */ }
    }
    if (state.species !== shown) {
      shown = state.species;
      fish.setSpecies(state.species);
      hud.species(state.species);
      try { kit.ui?.toast?.(t('play.swim.fact.' + state.species)); } catch (e) { /* */ }
    }
    acc += performance.now() - t0;
  }

  function place(dt) {
    const s = state;
    const pl = ctx.playerObj;
    if (pl?.pos) { pl.pos.set(s.x, s.y, s.z); pl.vel?.set(0, 0, 0); }
    if (ctx.player?.position) ctx.player.position.set(s.x, s.y, s.z);
    const cam = ctx.camera;
    // [fish-fix] the lens follows the engine's rule for the screen now (core/fov.js), so a phone turned mid-dive gets its
    // landscape lens; it used to keep the lens it had when the dive began
    if (typeof ctx.fovFor === 'function' && cam.aspect > 0) baseFov = ctx.fovFor(cam.aspect);
    cameraBeat(s.mode, s.breachT, reduced, TUNE, beat);
    if (!reduced && punch > 0 && dt > 0) punch = Math.max(0, punch - dt / TUNE.punchDur);
    // the simulation steps at a fixed rate; the picture blends its last two steps, so a 120 Hz screen or an uneven frame never
    // shows a step twice (the dive drew the latest step as is, and the fish and the camera juddered)
    const a = Math.max(0, Math.min(1, Number.isFinite(ctx.alpha) ? ctx.alpha : 1));
    drawn.x = s.px + (s.x - s.px) * a; drawn.y = s.py + (s.y - s.py) * a; drawn.z = s.pz + (s.z - s.pz) * a;
    const X = drawn.x, Y = drawn.y, Z = drawn.z;
    const aim = s.mode === 'breach' ? Math.atan2(s.vy, Math.hypot(s.vx, s.vz) || 0.001) : s.pitch;
    const cp = Math.cos(aim), sp = Math.sin(aim);
    const breach = s.mode === 'breach';
    const side = breach ? 0.45 : TUNE.camSide;
    const dist = breach ? 2.65 : beat.back * framing(cam);
    let camY = breach
      ? Math.max(0.42, Y - 1.55)
      : Math.min(-0.28, Y - sp * dist * 0.85 + beat.up * (0.35 + 0.65 * Math.max(0, cp)));
    if (s.frame) {
      cam.position.set(s.frame.cx, s.frame.cy, s.frame.cz);
      look.set(s.frame.lx, s.frame.ly, s.frame.lz);
    } else {
      cam.position.set(
        X + Math.sin(s.yaw) * (breach ? 1 : cp) * dist + Math.cos(s.yaw) * side,
        camY,
        Z + Math.cos(s.yaw) * (breach ? 1 : cp) * dist - Math.sin(s.yaw) * side,
      );
      const ahead = breach ? 0.35 : TUNE.camAhead;
      look.set(
        X - Math.sin(s.yaw) * (breach ? 0 : cp) * ahead,
        Y + (breach ? 0.15 : sp * ahead + TUNE.camAim),
        Z - Math.cos(s.yaw) * (breach ? 0 : cp) * ahead,
      );
      keepCamera(cam.position, drawn, breach);
    }
    fish.mesh.position.set(X, Y, Z);
    fish.mesh.rotation.order = 'YXZ';
    const roll = breach ? beat.roll * 0.35 + (reduced ? 0 : s.spin) : 0;
    fish.mesh.rotation.set(aim, s.yaw, roll);
    cam.up.set(Math.sin(reduced ? 0 : beat.roll), Math.cos(reduced ? 0 : beat.roll), 0);
    cam.lookAt(look);
    const fov = baseFov + (reduced ? 0 : beat.fov + punch * TUNE.punchFov);
    if (Math.abs(cam.fov - fov) > 0.04) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (s.glow) bits.focus.value.set(s.glow.x, s.glow.y, s.glow.z);
    else if (s.frame) bits.focus.value.set(s.frame.lx, s.frame.ly, s.frame.lz);
    else bits.focus.value.set(X, Y, Z);
    bits.mesh.visible = s.y < 0.8;
    bits.rush.value = s.dashing ? 1 : 0;
    hud.stamina(s.stamina / TUNE.staminaMax);
    hud.tick(dt);
    life.beat.value = fish.beat.value;
  }

  /** [fish-fix] The boom for this lens: the fish keeps its share of the screen when the vertical FOV is wide (a portrait phone). */
  function framing() {
    const k = Math.tan(TUNE.camFovRef * Math.PI / 360) / Math.tan(Math.max(20, Math.min(120, baseFov)) * Math.PI / 360);
    return Math.max(TUNE.camFit[0], Math.min(TUNE.camFit[1], k));
  }

  // The follow camera must stay in the water and off the bed (under the surface), or clear of the land (in the leap).
  // Near a bank it would end up inside the slope: pull it in toward the fish until it is clear. No allocation.
  function keepCamera(p, s, breach) {
    for (let k = 0; k < 5; k++) {
      const ground = L.heightAt(p.x, p.z);
      const ok = breach
        ? p.y > ground + 0.5
        : env.shore(p.x, p.z) > 0.6 && p.y > Math.min(-0.55, ground + 0.18) + 0.35;
      if (ok) return;
      p.x += (s.x - p.x) * 0.38;
      p.z += (s.z - p.z) * 0.38;
      if (!breach) p.y = Math.min(-0.2, Math.max(p.y, Math.min(-0.55, L.heightAt(p.x, p.z) + 0.18) + 0.35));
      else p.y += (s.y + 0.3 - p.y) * 0.38;
    }
  }

  function offer() {
    const pl = ctx.playerObj;
    const sail = ctx.services.sail;
    if (!pl || ctx.services.drive?.active || ctx.planet?.active) { hud.offer(false); return; }
    if (!pl.enabled && !sail?.active) { hud.offer(false); return; }
    if (sail?.active) hud.offer(canDive('sail', L.shoreDist(sail.boat.x, sail.boat.z), sail.boat.u || 0));
    else if (pl.fly) hud.offer(false);
    else hud.offer(canDive('walk', L.shoreDist(pl.pos.x, pl.pos.z), 0));
  }

  ctx.onStep((dt) => { step(dt); });
  ctx.onUpdate((dt) => {
    swimU.uSwimTime.value += dt;
    if (!booted) {
      booted = true;
      const q = params.get('swim');
      if (q) begin('shot', shotPose(q, built().crops.hero));
    }
    ensurePad();
    if (state && (ctx.services.life?.tour?.flying || ctx.planet?.active)) end();
    if (state) {
      place(dt);
      publishPos();
      clearHulls(ctx.camera.position, true);
      crops.update(ctx.camera.position);
      api._ms = acc;
      api._sum = (api._sum || 0) + acc;
      api._n = (api._n || 0) + 1;
      acc = 0;
    }
    else offer();
    syncUnder();
    if (!state) hud.tick(dt);
  });

  // [mobile-play] A dive started from the world (the offer at the shore or from the boat, the chip, the notebook) goes in behind
  // the hub's wipe and title card while its world builds, as はじめる does. A world already built and warm goes straight in.
  function enterAt(pose) {
    if (!pose || state) return false;
    const go = () => begin('mission', pose);
    if (world.ready || typeof kit?.ui?.run !== 'function' || kit.shim) { go(); return true; }
    kit.ui.run({
      id: 'underwater', title: label('play.swim.mode.title'), hook: label('play.swim.mode.hook'),
      prepare: () => world.prepare(),
      start: go,
    });
    return true;
  }
  api.enterAt = enterAt;

  function enterCovered(from) {
    if (state) return;
    if (world.ready || typeof kit?.ui?.run !== 'function' || kit.shim) { begin(from); return; }
    kit.ui.run({
      id: 'underwater', title: label('play.swim.mode.title'), hook: label('play.swim.mode.hook'),
      prepare: () => world.prepare(),
      start: () => begin(from === 'here' ? (ctx.services.sail?.active ? 'sail' : 'walk') : from),
    });
  }
  api.enterCovered = enterCovered;

  hud.onDive(() => enterCovered('here'));
  hud.onBecome(() => enterCovered('menu'));

  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (!state) return;
      const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (typing) return;
      if (e.code === 'KeyV' || e.code === 'KeyF') {
        e.preventDefault(); e.stopImmediatePropagation(); end(); return;
      }
      if (e.code === 'Space' && !e.repeat) airTap(state, TUNE, reduced);
      if (MOVE.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); keys.add(e.code); }
    }, true);
    addEventListener('keyup', (e) => { keys.delete(e.code); }, true);
    // [r-hold] a held R surfaces. It must not also snap to the hero overview (the old keydown stopped that).
    addEventListener(HELD_R, (e) => {
      if (!state) return;
      e.stopImmediatePropagation();
      end();
    });
    addEventListener('pointerdown', (e) => {
      if (!state || state.mode !== 'breach') return;
      if (e.target && e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
      airTap(state, TUNE, reduced);
    }, true);
    addEventListener('blur', () => keys.clear());
  }

  // 「海の中」 in the あそぶ hub (PLAY-ENTRY §5). The kit's registerMode and ui.coach are guarded until the kit has them.
  let quayPose = null;
  let coach = null;
  const coachFrom = { x: 0, z: 0 };
  function quay() {
    if (!quayPose) {
      // the meshes around the start, once: the heading check rays them (the hub calls this in prepare(), behind its title card)
      try { near = meshesNear(348, 8, 60); } catch (e) { near = null; }
      try { quayPose = quayStart(348, 8, env); } finally { near = null; }
      if (!quayPose) quayPose = { x: 368, y: -1.4, z: 8, yaw: 0.4, pitch: 0 };
    }
    return { ...quayPose };
  }
  // [fish-fix] One line, then わかった. On a phone the spotlight is the stick itself (it was a guessed point, a quarter in from
  // the left at 78 % down); on a desktop it rings the fish. No dim: the fish is the subject (dimmed to 60 % it read as a grey
  // shape for as long as the coach was up). kit/coach.js keeps the bubble off the stick and the buttons.
  const fishOnScreen = new THREE.Vector3();
  const coachAt = { x: 0, y: 0 };   // (the desktop coach's target, read every frame: one object, reused)
  let coachEl = null;
  /** The fish's box on screen (CSS px), from its drawn position and a 0.6 m radius: the coach's bubble keeps off it. */
  function fishRect() {
    if (!state || typeof innerWidth !== 'number') return [];
    const cam = ctx.camera;
    fishOnScreen.set(drawn.x, drawn.y, drawn.z);
    const d = fishOnScreen.distanceTo(cam.position);
    fishOnScreen.project(cam);
    if (!(d > 0.1) || fishOnScreen.z > 1) return [];
    const x = (fishOnScreen.x + 1) * 0.5 * innerWidth, y = (1 - fishOnScreen.y) * 0.5 * innerHeight;
    const r = (innerHeight * 0.5) * 0.6 / (d * Math.tan(cam.fov * Math.PI / 360));
    return [{ l: x - r, t: y - r * 0.7, r: x + r, b: y + r * 0.7 }];
  }
  function coachFirstSwim() {
    if (coach || typeof kit?.ui?.coach !== 'function' || !state) return;
    coachFrom.x = state.x; coachFrom.z = state.z;
    const touch = !!ctx.pad?.active || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    try {
      coach = kit.ui.coach({
        id: 'swim-first',
        text: t(touch ? 'play.swim.coach.touch' : 'play.swim.coach.keys'),
        gesture: touch ? 'drag' : 'none',
        target: touch ? '#klc-pad .ghost' : () => {
          if (!state || typeof innerWidth !== 'number') return null;
          fishOnScreen.set(drawn.x, drawn.y, drawn.z).project(ctx.camera);
          coachAt.x = (fishOnScreen.x + 1) * 0.5 * innerWidth; coachAt.y = (1 - fishOnScreen.y) * 0.5 * innerHeight;
          return coachAt;
        },
        dim: false,
        // on a phone the bubble also keeps off the fish (on a desktop the spotlight is the fish, so it already does)
        avoid: touch ? fishRect : null,
      }) || null;
      coachEl = typeof document !== 'undefined' ? document.querySelector('#klc-play .coach') : null;
    } catch (e) { coach = null; }
  }
  function registerMode() {
    if (api._mode || typeof kit?.registerMode !== 'function') return;
    api._mode = true;
    try {
      kit.registerMode({
        id: 'underwater',
        order: 40,
        title: label('play.swim.mode.title'),
        hook: label('play.swim.mode.hook'),
        minutes: 3,
        stars: 1,
        players: 1,
        art: 'data/play/art/underwater.webp',
        progress: () => null,
        isNew: () => !(kit.store?.get?.('swim.played')),
        // [mobile-play] the hub calls this behind its title card: the dive's world is built and its programs are ready before start()
        // [fish-fix] and the start's heading is found here too (one pass of rays), so the first frame pays nothing for it
        prepare: async () => { const p = await world.prepare(); quay(); return p; },
        start: async () => {
          if (state) end(true);
          begin('mode');
          try { kit.store?.update?.('swim.played', () => true); } catch (e) { /* */ }
        },
      });
      // [integration] The あそぶ hub's 「海の中」 card is the way in now. The standalone 「魚になる」 chip sat over the HUD's
      // right column and the clock on phones (393 px: x 274–377 against the column at 339), so it steps aside.
      try { hud.hideBecome(); } catch (e) { /* */ }
    } catch (e) { api._mode = false; }
  }
  api.quay = quay;

  api.attachKit = attachKit;
  attachKit(kit);
  if (typeof window !== 'undefined') window.__swim = api;
  return api;

  function attachKit(next) {
    if (next && !next.shim) kit = next;
    registerMode();
    if (api._tab || !kit || kit.shim || typeof kit.ui?.notebook?.register !== 'function') return;
    if (typeof document === 'undefined' || !document.getElementById('klc-play')) return;
    api._tab = true;
    const book = document.querySelector('#klc-play [data-act="book"]');
    if (book && !book.dataset.swimQuiet) {
      book.dataset.swimQuiet = '1';
      book.addEventListener('click', () => hud.quiet());
    }
    try {
      kit.ui.notebook.register('swim', {
        label: 'play.swim.become',
        render(el) {
          el.replaceChildren();
          const say = (key) => (typeof kit.ui.t === 'function' ? kit.ui.t(key) : t(key));
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = say('play.swim.become');
          b.style.borderRadius = '12px';
          b.style.padding = '0 18px';
          b.style.marginBottom = '12px';
          b.style.background = '#c4521f';
          b.style.color = '#fff';
          b.style.fontWeight = '700';
          b.addEventListener('click', () => {
            document.querySelector('#klc-play [data-act="close"]')?.click();
            enterCovered('menu');
          });
          const where = document.createElement('p');
          where.textContent = say('play.swim.where');
          where.style.margin = '0 0 8px';
          const hint = document.createElement('p');
          hint.textContent = say('play.swim.hint');
          hint.style.margin = '0';
          el.append(b, where, hint);
        },
      });
    } catch (e) { api._tab = false; }
  }
}
