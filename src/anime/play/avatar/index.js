// [play] Third person on foot: the chase camera, three original looks, footsteps,
// and ホヤぼーや as the default walker. His mesh is hoya-model.js and is not edited here.

import { sfx, ui } from '../kit/index.js';
import { chaseOwns, createWalkCam, placeWalk, thirdFor, THIRD } from './camera.js';
import { createBuildingProbe } from './boxes.js';
import { armHandoff, blendHandoff, createHandoff } from './handoff.js';
import { hoyaPermitted, resolveModel, setModel } from './approval.js';
import { LOOKS, readPrefs, writePrefs } from './prefs.js';
import { clipOf, easeScalar, hoyaTurnLean, HOYA_LEAN_TAU, landBob, landSquash, placeHoyaRoot, stepPhase, turnLean, wrapPi } from './pose.js';
import { classifySurface, footstep, stepSpacing, stepTick } from './steps.js';
import { createFigure, poseFigure } from './figure.js';
import { loadHoya } from './hoya-slot.js';
import { registerGullAudio } from '../gull/voice.js';

// [feel] The credit (気仙沼市観光キャラクター「海の子 ホヤぼーや」) must be on screen, uncovered, whenever he is shown (取扱要綱 第5条). It sits
// bottom centre, where the もぐる chip (.swim-dive: bottom 96 px, 44 px tall) and the kit's prompt (.prompt: bottom 108 px on a desktop,
// 168 px on a phone, 44 px) also appear: while one of them shows, the credit moves above it (200 ms; at once under reduced motion).
// Pinned by test/feel-credit.test.js (the rules) and tools/anime/feel-modes.mjs (the rects in Chrome).
export const CREDIT_LIFT = { base: 96, chip: 44, gap: 8, promptDesk: 108, promptPhone: 168 };
export const CSS = `
#klc-play .avatar-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
#klc-play .avatar-row button { border-radius: 999px; padding: 0 16px; background: rgba(255,255,255,.78); color: #223A70; font: 700 14px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#klc-play .avatar-row button[aria-pressed="true"] { background: #223A70; color: #FBFAF5; }
#klc-play .avatar-note { margin: 0 0 12px; font-size: 14px; color: #595857; }
#klc-play .hoya-credit { position: absolute; left: 50%; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  z-index: 40; margin: 0; padding: 8px 14px; border-radius: 12px; background: rgba(251,250,245,.94); color: #223A70;
  font: 500 13px/1.45 "Noto Sans JP", "Hiragino Sans", sans-serif; text-align: center; pointer-events: none;
  box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14); }
#klc-play .hoya-credit span { display: block; }
#klc-play .hoya-credit[hidden] { display: none !important; }
#klc-play .hoya-credit { transition: bottom .2s cubic-bezier(.2, .8, .2, 1); }
body:has(.swim-dive:not([hidden])) #klc-play .hoya-credit { bottom: calc(148px + env(safe-area-inset-bottom, 0px)); }
#klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit { bottom: calc(160px + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 720px) {
  #klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit { bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  body:has(.swim-dive:not([hidden])) #klc-play:has(.prompt:not([hidden]):not(.top)) .hoya-credit { bottom: calc(220px + env(safe-area-inset-bottom, 0px)); }
}
@media (prefers-reduced-motion: reduce) { #klc-play .hoya-credit { transition: none; } }
`;

/**
 * [feel] His walk cycle locked to his ground speed: cycles per second = speed × stance / travel, from the model's own stride (the
 * hoya-accuracy lane's `gait(speed) -> { travel (m the planted foot covers per stance), stance (0..1) }` on the built model), held to a
 * readable 1.6–5.5 Hz. Undefined until the model offers `gait`: then the animator keeps its own cadence (hoya-model.js is not edited here).
 */
export const CADENCE = { min: 1.6, max: 5.5 };
export function gaitCadence(model, speed) {
  if (!model || typeof model.gait !== 'function' || !(speed > 0.05)) return undefined;
  let g = null; try { g = model.gait(speed); } catch (e) { return undefined; }
  if (!g || !(g.travel > 0) || !(g.stance > 0)) return undefined;
  const c = speed * g.stance / g.travel;
  return c < CADENCE.min ? CADENCE.min : c > CADENCE.max ? CADENCE.max : c;
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
  let record = null;
  let hoya = null;
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
  const ground = (x, z) => physics.groundHeight(x, z, 1e9);
  const handDur = () => (reducedMotion() ? 0 : 0.42);

  player.chase = (pl, frame) => {
    boxes.prepare(frame.x, frame.z);
    // [feel] the rig by screen shape: a portrait phone gets the closer boom that frames him at ~20 % (camera.js thirdFor)
    placeWalk(chase, frame, pl.yaw, solid, ground, reducedMotion() || !(frame.dt > 0), thirdFor(pl.camera?.aspect));
    const cam = pl.camera;
    cam.up.set(0, 1, 0);
    cam.position.set(chase.x, chase.y, chase.z);
    cam.lookAt(chase.tx, chase.ty, chase.tz);
    boomDist = chase.dist;
  };
  player.cameraBlend = (cam, dt) => blendHandoff(hand, cam, dt);
  // [feel] a flight that ends over the sea lands on the nearest quay (core/player.js): ease the picture from the drone's view down to him
  player.onLanding = (l) => {
    if (!walkingThird()) return;
    armHandoff(hand, player.camera, reducedMotion() ? 0 : Math.min(0.9, Math.max(handDur(), (l?.dur || 0) * 0.6)));
    chase.ready = false;
  };

  const body = {
    face: player.yaw, yawRate: 0, lean: 0, hoyaLean: 0, phase: 0,
    land: 0, onGround: true, clip: 'idle', look: prefs.look, settle: 0, fast: 0,
  };
  const stepSt = { acc: 0, hit: false, flip: 0 };
  const stepAt = { x: 0, y: 0, z: 0 };
  const stepOpt = { gain: 0.5, pitch: 0, position: stepAt };
  const poseOpt = { speed: 0, lean: 0, squash: null };
  const squash = { y: 1, xz: 1 };
  const hoyaIn = { speed: 0, onGround: true, vy: 0, cadence: undefined };
  const figures = new Map();
  let broken = false;
  const cost = { n: 0, sum: 0, max: 0 };

  function shownModel() {
    return resolveModel({ record, url: params.get('hoya3d'), mesh: !!hoya, pref: prefs.model }).model;
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

  function walkingThird() {
    return chaseOwns(player) && !player.gull;
  }

  function placeFigure(dt) {
    const model = shownModel();
    const show = walkingThird() && boomDist > THIRD.hide;
    const playing = typeof document !== 'undefined' && (document.body.classList.contains('playing') || document.body.classList.contains('shot') || document.body.classList.contains('loaded'));
    const fig = figure();
    for (const f of figures.values()) if (f !== fig) f.group.visible = false;
    if (hoya?.root) hoya.root.visible = false;
    if (!show || !playing) {
      if (fig) fig.group.visible = false;
      if (credit) credit.hidden = true;
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
    if (model === 'hoya' && hoya?.root) {
      if (fig) fig.group.visible = false;
      hoya.root.visible = true;
      // His root faces −Z. A roll of the whole root is a pose (≤ 6°). A landing
      // is a translation (≤ 4 cm). The mesh is never scaled or taken apart.
      try { hoya.setCalm(reducedMotion()); } catch (e) { /* */ }
      const night = ctx.services?.life?.time?.night;
      if (typeof night === 'number') { try { hoya.setLift(night); } catch (e) { /* */ } }
      if (!hoya._auto) { try { hoya.setPose('auto'); } catch (e) { /* */ } hoya._auto = true; }
      hoyaIn.speed = sp; hoyaIn.onGround = !!player.onGround; hoyaIn.vy = player.vy || 0;
      hoyaIn.cadence = gaitCadence(hoya, sp);   // [feel] undefined (its own cadence) until the model offers gait()
      try { hoya.update(dt, hoyaIn); } catch (e) { /* the model worker owns update */ }
      const calm = reducedMotion();
      placeHoyaRoot(hoya.root, x, y, z, yaw, calm ? 0 : body.hoyaLean, calm ? 0 : landBob(body.land, 0.2) + settleBob(body.settle));
      if (credit) credit.hidden = false;
      return;
    }
    if (credit) credit.hidden = true;
    if (!fig) return;
    fig.group.visible = true;
    fig.driver.place(x, y, z, yaw + Math.PI);
    poseOpt.speed = sp;
    poseOpt.lean = reducedMotion() ? 0 : body.lean;
    poseOpt.squash = reducedMotion() ? null : (body.clip === 'land' ? squash : null);
    poseFigure(fig, body.clip, body.phase, ctx.time || 0, dt, body.yawErr || 0, poseOpt);
  }

  let credit = null;
  if (typeof document !== 'undefined') {
    if (!document.getElementById('klc-avatar-css')) {
      const st = document.createElement('style');
      st.id = 'klc-avatar-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const host = document.getElementById('klc-play') || document.body;
    credit = document.createElement('p');
    credit.className = 'hoya-credit';
    credit.hidden = true;
    credit.innerHTML = '<span>気仙沼市観光キャラクター</span><span>「海の子 ホヤぼーや」</span>';
    host.appendChild(credit);
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
    for (const id of ['hoya', 'original']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ui.t('play.avatar.model.' + id);
      b.setAttribute('aria-pressed', showing === id ? 'true' : 'false');
      b.addEventListener('click', () => choose(id));
      row2.appendChild(b);
    }
    el.appendChild(row2);
    const note = document.createElement('p');
    note.className = 'avatar-note';
    const gate = hoyaPermitted(record);
    if (params.get('hoya3d') === '0') note.textContent = ui.t('play.avatar.urlOff');
    else if (!gate.ok) note.textContent = ui.t('play.avatar.locked');
    else if (!hoya) note.textContent = ui.t('play.avatar.nomesh');
    else if (gate.why === 'owner-interim') note.textContent = ui.t('play.avatar.interim');
    else note.textContent = '';
    if (note.textContent) el.appendChild(note);
  }

  function choose(id) {
    if (id === 'original') {
      prefs.model = 'original';
    } else {
      const r = setModel('hoya', { record, mesh: !!hoya });
      if (!r.ok) {
        prefs.model = 'original';
        try { ui.toast(ui.t(r.why === 'no-mesh' ? 'play.avatar.nomesh' : 'play.avatar.locked')); } catch (e) { /* toast is optional in tests */ }
      } else prefs.model = 'hoya';
    }
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
    const leanTo = reducedMotion() ? 0 : hoyaTurnLean(body.yawRate);
    body.hoyaLean = easeScalar(body.hoyaLean, leanTo, reducedMotion() ? 0 : dt, HOYA_LEAN_TAU);
    body.clip = clipOf(sp, player.onGround, player.vy, body.land, body.yawErr);
    // a tiny settle when a walk or a run stops (a 1.5 cm dip of the whole figure, translation only, over 0.2 s)
    if (sp > 1.2) body.fast = 0.25; else if (body.fast > 0) body.fast = Math.max(0, body.fast - dt);
    if (body.fast > 0 && sp < 0.25 && player.onGround && !body.settle) { body.settle = SETTLE_S; body.fast = 0; }
    if (body.settle > 0) body.settle = Math.max(0, body.settle - dt);
    if (player.onGround && sp > 0.3) body.phase = stepPhase(body.phase, sp, dt);
    const kind = classifySurface(player.pos.x, player.pos.z, player.pos.y, {
      heightAt: ctx.L.heightAt, shoreDist: ctx.L.shoreDist, isWater: ctx.L.isWater,
    });
    stepTick(stepSt, sp, dt, player.onGround, stepSpacing(sp, shownModel(), undefined, hoyaIn.cadence));
    if (stepSt.hit) {
      stepAt.x = player.pos.x; stepAt.y = player.pos.y; stepAt.z = player.pos.z;
      stepSt.flip = stepSt.flip ? 0 : 1;
      stepOpt.pitch = stepSt.flip ? 1.4 : -1.2;
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
    get hoyaLean() { return body.hoyaLean; },
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

  fetch('/data/hoyaboya-approval.json').then((r) => r.ok ? r.json() : null).then((j) => {
    record = j;
    if (params.get('hoya3d') !== '0') {
      loadHoya({
        quality: ctx.quality?.phone ? 'phone' : 'high',
        mat: ctx.mat,
        calm: reducedMotion(),
        blink: !reducedMotion(),
      }).then((built) => {
        if (built?.root) {
          hoya = built;
          built.root.visible = false;
          if (ctx.noOutline) ctx.noOutline(built.root);
          ctx.add(built.root);
        }
      }).catch(() => {});
    }
  }).catch(() => { record = null; });

  return api;
}
