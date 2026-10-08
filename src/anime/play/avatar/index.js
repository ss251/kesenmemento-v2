// [play] Third person on foot: the chase camera, three original looks, footsteps,
// and a character slot. The default id is meme. Until that module loads, the original figure walks.

import { sfx, ui } from '../kit/index.js';
import { createWalkCam, damp1, placeWalk, thirdFor, THIRD } from './camera.js';
import { bodyOccupy, walkerShown } from './shown.js';
import { createBuildingProbe } from './boxes.js';
import { armHandoff, blendHandoff, createHandoff } from './handoff.js';
import { characterById, loadCharacter, pickerIds } from './characters.js';
import { LOOKS, readPrefs, writePrefs } from './prefs.js';
import { CHARACTER_SPEED, LEAN_TAU, characterTurnLean, clipOf, easeScalar, landBob, landSquash, placeCharacterRoot, speedFrom, stepPhase, turnLean, wrapPi } from './pose.js';
import { classifySurface, footstep, stepSpacing, stepTick } from './steps.js';
import { createFigure, poseFigure } from './figure.js';
import { registerGullAudio } from '../gull/voice.js';
import * as THREE from 'three';

export const CSS = `
#klc-play .avatar-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
#klc-play .avatar-row button { border-radius: 999px; padding: 0 16px; background: rgba(255,255,255,.78); color: #223A70; font: 700 14px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#klc-play .avatar-row button[aria-pressed="true"] { background: #223A70; color: #FBFAF5; }
#klc-play .avatar-note { margin: 0 0 12px; font-size: 14px; color: #595857; }
`;

/**
 * [feel] A custom character's walk cycle locked to ground speed: cycles per second = speed × stance / travel, from the model's own
 * stride (`gait(speed) -> { travel, stance }` on the built model), held to a readable 1.6–5.5 Hz. Undefined until the model offers
 * `gait`: then the animator keeps its own cadence.
 */
export const CADENCE = { min: 1.6, max: 5.5 };
/** Re-export so a caller can read the slot's third-person speeds without importing the pose module. */
export { CHARACTER_SPEED, speedFrom };
export function gaitCadence(model, speed, run) {
  if (!model || typeof model.gait !== 'function' || !(speed > 0.05)) return undefined;
  let g = null; try { g = model.gait(speed, run); } catch (e) { return undefined; }
  if (!g || !(g.travel > 0) || !(g.stance > 0)) return undefined;
  // the model's own readable ceiling for the pose it shows (rate = min(maxHz, no-slide hz): the walk ≤ 4.2 Hz, the run ≤ 5.5), else no-slide
  const c = Number.isFinite(g.rate) ? g.rate : speed * g.stance / g.travel;
  return c < CADENCE.min ? CADENCE.min : c > CADENCE.max ? CADENCE.max : c;
}

/** [feel] A footfall's gain: 0.5 up to 5 footfalls a second (his old patter), then softer in proportion, down to 0.25 (CRAFT §4: gentle,
 *  never a drum roll), so a run's 11 footfalls a second stay a light patter, each still in time with a foot. */
export function footstepGain(cadence) {
  const perS = cadence > 0 ? 2 * cadence : 0;
  return perS > 5 ? Math.max(0.25, 0.5 * 5 / perS) : 0.5;
}

/** [feel] Run fn with the physics' moving colliders (the townspeople's boxes) left out, then put them back (even if fn throws): the walker's
 *  camera answers walls, not passers-by. Allocation-free; a physics without moving colliders is left alone. */
const NO_MOVING = Object.freeze([]);
export function withoutMoving(physics, fn) {
  const dyn = physics && physics._dynItems, skip = Array.isArray(dyn) && dyn.length > 0;
  if (skip) physics._dynItems = NO_MOVING;
  try { return fn(); } finally { if (skip) physics._dynItems = dyn; }
}

/** [feel] The run's sense of speed, small enough that a portrait phone (88°) does not visibly distort. The field of view
 *  widens by at most `deg` (2°) at a run, critically damped: in at 3 /s (90 % in ~1.3 s), out at 4 /s. Walking adds nothing. */
export const RUN_FOV = Object.freeze({ deg: 2, wIn: 3, wOut: 4 });
/** One step of the run's widening (0..1) toward `want`, critically damped, into out { x, v }; dt 0 (a still) lets go at once. */
export function runFovStep(x, v, want, dt, out) {
  if (dt > 0) { damp1(x, v, want, dt, want > x ? RUN_FOV.wIn : RUN_FOV.wOut, out); out.x = Math.min(1, Math.max(0, out.x)); return out; }
  out.x = want ? x : 0; out.v = want ? v : 0; return out;
}

/** [feel] The stop's settle: seconds, and its dip (metres, ≤ 0: the figure's root moves down, never scales). */
const SETTLE_S = 0.2;
function settleBob(t) { return t > 0 ? -0.015 * Math.sin(Math.PI * (1 - t / SETTLE_S)) : 0; }

function reducedMotion() {
  try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

export function mountAvatar(ctx) {
  const player = ctx?.playerObj;
  if (!player || !ctx.physics) return null;
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = new URLSearchParams(); }
  const urlPerson = params.get('person');
  player.person = (urlPerson === 'first' || urlPerson === '1') ? 'first' : 'third';
  player.gull = false;

  const prefs = readPrefs(typeof localStorage !== 'undefined' ? localStorage : null);
  let actor = null;
  let choices = ['original'];
  let boomDist = THIRD.dist;
  const chase = createWalkCam();   // [feel] the walker's camera: zero-lag follow, look-ahead, eased boom (camera.js placeWalk)
  const aim = { x: 0, y: 0, z: 0, dt: 0, sp: 0, alpha: 1, vx: 0, vz: 0, landing: false };   // a placed pose's frame (adoptBoom)
  const hand = createHandoff();
  const physics = ctx.physics;
  const boxes = createBuildingProbe(
    () => ctx.services?.town?.kit?.T?.lotIdx,
    () => ({ phone: !!ctx.quality?.phone, hero: ctx.L?.ZONES?.hero, scale: ctx.quality?.heroR }),
  );
  const solid = (x, y, z) => physics.solidAt(x, z, y) || boxes.hit(x, y, z);
  // the surface just under the camera. groundHeight(x, z, 1e9) is the highest landing in the column: on PIER7 that
  // read as the ground and collapsed the boom. A y of the camera's own height is the tread it is actually over.
  const ground = (x, z, y) => physics.groundHeight(x, z, Number.isFinite(y) ? y : player.pos.y);
  const handDur = () => (reducedMotion() ? 0 : 0.42);

  player.chase = (pl, frame) => {
    boxes.prepare(frame.x, frame.z);
    // [feel] the rig by screen shape: a portrait phone gets the closer boom that frames him at ~20 % (camera.js thirdFor). The boom answers
    // walls, not passers-by: the townspeople's moving boxes (world/life/cast.js, 0.46 m) are left out while it is solved, so one walking
    // past no longer collapses it and hides him (the walker himself still bumps into them: only the camera's query skips them)
    // a placed pose snaps. A rendered frame whose clock did not move must not: that used to snap the boom to the solved length
    withoutMoving(physics, () => placeWalk(chase, frame, pl.yaw, solid, ground, reducedMotion() || !!pl._placed, thirdFor(pl.camera?.aspect)));
    const cam = pl.camera;
    cam.up.set(0, 1, 0);
    cam.position.set(chase.x, chase.y, chase.z);
    cam.lookAt(chase.tx, chase.ty, chase.tz);
    boomDist = chase.dist;
    runFov(cam, frame.dt, pl.running && !frame.landing && frame.sp > 0.6 * (pl.run3 > 0 ? pl.run3 : pl.run));
  };
  // [feel] a sense of speed at a run: the view widens by at most RUN_FOV.deg (2°, ~1.3 s to 90 %), always measured from
  // the screen's own field of view (ctx.fovFor), so nothing accumulates. dropRunFov gives that addition back in one frame when a
  // mode takes the camera (the other mode keeps its own lens). It does not run while he is walking. None under reduced motion.
  let fovRun = 0, fovRunV = 0, fovApplied = 0;
  const _fv = { x: 0, v: 0 };
  function baseFov(cam) { return typeof ctx.fovFor === 'function' ? ctx.fovFor(cam.aspect) : cam.fov - fovApplied; }
  function runFov(cam, dt, running) {
    if (!cam) return;
    const want = running && !reducedMotion() ? 1 : 0;
    runFovStep(fovRun, fovRunV, want, dt, _fv); fovRun = _fv.x; fovRunV = _fv.v;
    const add = RUN_FOV.deg * fovRun, fov = baseFov(cam) + add;
    if (Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
    fovApplied = add;
  }
  function dropRunFov(cam) {
    if (!cam || !(fovApplied > 0)) return;
    cam.fov = baseFov(cam); cam.updateProjectionMatrix();
    fovApplied = 0; fovRun = 0; fovRunV = 0;
  }
  player.cameraBlend = (cam, dt) => blendHandoff(hand, cam, dt);
  // [feel] a flight that ends over the sea lands on the nearest quay (core/player.js): ease the picture from the drone's view down to him
  player.onLanding = (l) => {
    if (!walkingThird()) return;
    armHandoff(hand, player.camera, reducedMotion() ? 0 : Math.min(0.9, Math.max(handDur(), (l?.dur || 0) * 0.6)));
    chase.ready = false;
  };

  const body = {
    face: player.yaw, yawRate: 0, lean: 0, characterLean: 0, phase: 0,
    land: 0, onGround: true, clip: 'idle', look: prefs.look, settle: 0, fast: 0,
  };
  const stepSt = { acc: 0, hit: false, flip: 0 };
  const stepAt = { x: 0, y: 0, z: 0 };
  const stepOpt = { gain: 0.5, pitch: 0, position: stepAt };
  const poseOpt = { speed: 0, lean: 0, squash: null };
  const squash = { y: 1, xz: 1 };
  const actorIn = { speed: 0, onGround: true, vy: 0, cadence: undefined, run: undefined };
  const figures = new Map();
  let broken = false;
  const cost = { n: 0, sum: 0, max: 0 };

  function shownModel() {
    if (prefs.model === 'meme' && actor?.root) return 'meme';
    return 'original';
  }

  function thirdSpeeds() {
    if (shownModel() !== 'meme') return { walk: null, run: null };
    return speedFrom(params.toString() ? '?' + params.toString() : '');
  }

  function figure() {
    if (broken) return null;
    const look = LOOKS.includes(body.look) ? body.look : 'navy';
    let fig = figures.get(look);
    if (fig) return fig;
    try {
      fig = createFigure(ctx, look);
      fig.group.visible = false;
      ctx.add(fig.group);
      figures.set(look, fig);
      return fig;
    } catch (e) {
      broken = true;
      console.error('[avatar] figure', e);
      return null;
    }
  }

  const occupy = { swim: false, gull: false, drive: false, sail: false, race: false, voyage: false };
  function walkingThird() {
    return walkerShown(player, bodyOccupy(ctx, occupy));
  }

  function placeFigure(dt) {
    const model = shownModel();
    const onFoot = walkingThird();
    const show = onFoot && boomDist > THIRD.hide;
    const playing = typeof document !== 'undefined' && (document.body.classList.contains('playing') || document.body.classList.contains('shot') || document.body.classList.contains('loaded'));
    const fig = figure();
    for (const f of figures.values()) if (f !== fig) f.group.visible = false;
    // Hidden first, every frame: another body (the fish included) must not leave the walker or its shadow up.
    if (actor?.root) actor.root.visible = false;
    if (actor?.mesh) actor.mesh.castShadow = false;
    if (!onFoot) dropRunFov(player.camera);   // (a mode that took the camera keeps the screen's own field of view)
    if (!show || !playing) {
      if (fig) fig.group.visible = false;
      return;
    }
    const a = ctx.alpha ?? 1;
    const P = player.pos, Q = player.prevPos || P;
    // [feel] the drawn feet: blended between the last two steps, with the step's eased lift; the facing blended the same way
    const l0 = player.prevLift || 0, l1 = player.lift || 0;
    const x = Q.x + (P.x - Q.x) * a, y = Q.y + (P.y - Q.y) * a + l0 + (l1 - l0) * a, z = Q.z + (P.z - Q.z) * a;
    const f0 = player.prevFace ?? player.face ?? player.yaw, f1 = player.face ?? player.yaw;
    const yaw = f0 + wrapPi(f1 - f0) * a;
    body.face = yaw;
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (model === 'meme' && actor?.root) {
      if (fig) fig.group.visible = false;
      actor.root.visible = true;
      if (actor.mesh) actor.mesh.castShadow = true;
      // The root faces −Z. A roll of the whole root is a pose (≤ 6°). A landing
      // is a translation (≤ 4 cm). The mesh is never scaled or taken apart.
      try { actor.setCalm(reducedMotion()); } catch (e) { /* */ }
      const night = ctx.services?.life?.time?.night;
      if (typeof night === 'number') { try { actor.setLift(night); } catch (e) { /* */ } }
      if (!actor._auto) { try { actor.setPose('auto'); } catch (e) { /* */ } actor._auto = true; }
      actorIn.speed = sp; actorIn.onGround = !!player.onGround; actorIn.vy = player.vy || 0;
      // [feel] the gait: the run pose when the player runs (eased 0.12 s), else the walk pose; the cycle locked to the ground speed
      body.runW = easeScalar(body.runW || 0, player.running && sp > 0.5 ? 1 : 0, reducedMotion() ? 0 : dt, 0.12);
      actorIn.run = typeof actor.gait === 'function' ? body.runW : undefined;
      actorIn.cadence = gaitCadence(actor, sp, actorIn.run);   // [feel] undefined (its own cadence) until the model offers gait()
      const spd = thirdSpeeds();
      player.walk3 = spd.walk; player.run3 = spd.run;   // [feel] the character's third-person speeds (null: the walker's)
      try { actor.update(dt, actorIn); } catch (e) { /* a bad frame must not take the walker down */ }
      const calm = reducedMotion();
      placeCharacterRoot(actor.root, x, y, z, yaw, calm ? 0 : body.characterLean, calm ? 0 : landBob(body.land, 0.2) + settleBob(body.settle));
      return;
    }
    player.walk3 = player.run3 = null;   // the original walker strides at the walker's speeds
    if (!fig) return;
    fig.group.visible = true;
    fig.driver.place(x, y, z, yaw + Math.PI);
    poseOpt.speed = sp;
    poseOpt.lean = reducedMotion() ? 0 : body.lean;
    poseOpt.squash = reducedMotion() ? null : (body.clip === 'land' ? squash : null);
    poseFigure(fig, body.clip, body.phase, ctx.time || 0, dt, body.yawErr || 0, poseOpt);
  }

  if (typeof document !== 'undefined') {
    if (!document.getElementById('klc-avatar-css')) {
      const st = document.createElement('style');
      st.id = 'klc-avatar-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    try { ui.notebook.register('avatar', { label: 'play.avatar.tab', render: renderTab }); } catch (e) { console.warn('[avatar] notebook', e); }
  }

  function renderTab(el) {
    el.replaceChildren();
    const h = document.createElement('h3');
    h.className = 'nm';
    h.textContent = ui.t('play.avatar.looks');
    el.appendChild(h);
    const row = document.createElement('div');
    row.className = 'avatar-row';
    for (const id of LOOKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ui.t('play.avatar.look.' + id);
      b.setAttribute('aria-pressed', body.look === id ? 'true' : 'false');
      b.addEventListener('click', () => {
        body.look = id; prefs.look = id;
        writePrefs(typeof localStorage !== 'undefined' ? localStorage : null, prefs);
        ui.notebook.refresh('avatar');
      });
      row.appendChild(b);
    }
    el.appendChild(row);
    const h2 = document.createElement('h3');
    h2.className = 'nm';
    h2.textContent = ui.t('play.avatar.model');
    el.appendChild(h2);
    const row2 = document.createElement('div');
    row2.className = 'avatar-row';
    const showing = shownModel();
    for (const id of choices) {
      const spec = characterById(id);
      const b = document.createElement('button');
      b.type = 'button';
      const lang = (typeof document !== 'undefined' && document.documentElement.lang === 'en') ? 'en' : 'ja';
      b.textContent = spec ? spec.label[lang] : ui.t('play.avatar.model.' + id);
      b.setAttribute('aria-pressed', (id === 'meme' ? showing === 'meme' : showing !== 'meme') ? 'true' : 'false');
      b.addEventListener('click', () => choose(id));
      row2.appendChild(b);
    }
    el.appendChild(row2);
    if (choices.includes('meme') && !actor) {
      const note = document.createElement('p');
      note.className = 'avatar-note';
      note.textContent = ui.t('play.avatar.nomesh');
      el.appendChild(note);
    }
  }

  function choose(id) {
    prefs.model = id === 'meme' && choices.includes('meme') ? 'meme' : 'original';
    writePrefs(typeof localStorage !== 'undefined' ? localStorage : null, prefs);
    try { ui.notebook.refresh('avatar'); } catch (e) { /* */ }
  }

  try { registerGullAudio(ctx.audio, footstep); } catch (e) { /* audio arrives with the first gesture */ }

  ctx.onStep((dt) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!walkingThird()) { stepSt.acc = 0; return; }
    const sp = Math.hypot(player.vel.x, player.vel.z);
    const was = body.onGround;
    body.onGround = player.onGround;
    if (was === false && player.onGround) body.land = 0.2;
    if (body.land > 0) body.land = Math.max(0, body.land - dt);
    landSquash(body.land, 0.2, squash);
    // [feel] he turns toward the stick (core/player.js face): his own turn rate leans him, and a turn on the spot is the 'turn' clip
    body.yawErr = player.faceErr || 0;
    body.yawRate = player.faceV || 0;
    body.lean = turnLean(body.yawRate);
    const leanTo = reducedMotion() ? 0 : characterTurnLean(body.yawRate);
    body.characterLean = easeScalar(body.characterLean, leanTo, reducedMotion() ? 0 : dt, LEAN_TAU);
    body.clip = clipOf(sp, player.onGround, player.vy, body.land, body.yawErr);
    // a tiny settle when a walk or a run stops (a 1.5 cm dip of the whole figure, translation only, over 0.2 s)
    if (sp > 1.2) body.fast = 0.25; else if (body.fast > 0) body.fast = Math.max(0, body.fast - dt);
    if (body.fast > 0 && sp < 0.25 && player.onGround && !body.settle) { body.settle = SETTLE_S; body.fast = 0; }
    if (body.settle > 0) body.settle = Math.max(0, body.settle - dt);
    if (player.onGround && sp > 0.3) body.phase = stepPhase(body.phase, sp, dt);
    const kind = classifySurface(player.pos.x, player.pos.z, player.pos.y, {
      heightAt: ctx.L.heightAt, shoreDist: ctx.L.shoreDist, isWater: ctx.L.isWater,
    });
    stepTick(stepSt, sp, dt, player.onGround, stepSpacing(sp, shownModel(), undefined, actorIn.cadence));
    if (stepSt.hit) {
      stepAt.x = player.pos.x; stepAt.y = player.pos.y; stepAt.z = player.pos.z;
      stepSt.flip = stepSt.flip ? 0 : 1;
      stepOpt.pitch = stepSt.flip ? 1.4 : -1.2;
      stepOpt.gain = footstepGain(actorIn.cadence);   // [feel] softer as the patter quickens (in time with every footfall)
      try { sfx.play('step-' + kind, stepOpt); } catch (e) { /* */ }
    }
    if (t0) { const ms = performance.now() - t0; cost.n++; cost.sum += ms; if (ms > cost.max) cost.max = ms; }
  });

  ctx.onUpdate((dt) => {
    if (dt === 0 && walkingThird()) player.present(1, 0);
    placeFigure(dt);
  });

  const api = {
    get look() { return body.look; },
    get model() { return shownModel(); },
    get clip() { return body.clip; },
    get boom() { return boomDist; },
    get face() { return body.face; },
    /** [feel] The walker camera's state (read only: tools/anime/feel-probe.mjs reads its look point tx / ty / tz). */
    get aim() { return chase; },
    get lean() { return body.lean; },
    get characterLean() { return body.characterLean; },
    prefs, setLook: chooseLook, setModel: choose,
    armHandoff(dur) { return armHandoff(hand, player.camera, dur == null ? handDur() : dur); },
    /** Snap the boom to the feet and ease the picture in from wherever the camera is now. */
    adoptBoom() {
      armHandoff(hand, player.camera, handDur());
      boxes.prepare(player.pos.x, player.pos.z);
      aim.x = player.pos.x; aim.y = player.pos.y; aim.z = player.pos.z;
      placeWalk(chase, aim, player.yaw, solid, ground, true, thirdFor(player.camera?.aspect));
    },
    cost: () => (cost.n ? { mean: cost.sum / cost.n, max: cost.max, n: cost.n } : { mean: 0, max: 0, n: 0 }),
  };
  function chooseLook(id) {
    if (!LOOKS.includes(id)) return;
    body.look = id; prefs.look = id;
    writePrefs(typeof localStorage !== 'undefined' ? localStorage : null, prefs);
  }

  try { figure(); } catch (e) { /* figure() already records a broken rig */ }
  ctx.services.play = Object.assign(ctx.services.play || {}, { avatar: api });

  pickerIds().then((ids) => {
    choices = ids;
    try { ui.notebook.refresh('avatar'); } catch (e) { /* the notebook may not be open */ }
  }).catch(() => { choices = ['original']; });
  loadCharacter('meme', THREE, {
    quality: ctx.quality?.phone ? 'phone' : 'high',
    mat: ctx.mat,
    calm: reducedMotion(),
  }).then((built) => {
    if (!built?.root) return;
    actor = built;
    built.root.visible = false;
    if (ctx.noOutline) ctx.noOutline(built.root);
    ctx.add(built.root);
  }).catch(() => { actor = null; });

  return api;
}
