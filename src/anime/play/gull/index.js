// [play] ウミネコ flight. The drone stays player.fly with the walker enabled.
// A gull sets player.gull, disables the walker, and integrates its own body,
// so a course can tell the two apart. player.fly stays true: charms and
// playMode() keep the fly radius.

import { ui } from '../kit/index.js';
import * as kitApi from '../kit/index.js';
import { placeChase, createChaseState, seedChase } from '../avatar/camera.js';
import { gullState, gullStep, wingPose, GULL } from './flight.js';
import { gullModeSpec, lookoutPerch, nextCoach, readGullRecord, writeGullRecord, WING_OPEN } from './mode.js';
import { nearestPerch, canPerch } from './perch.js';
import { makeFlock, flockStep } from './boids.js';
import { createBird, createFlock, poseWings, writeFlock } from './bird.js';
import { createFeatherMesh, createPuff, emitPuff, stepPuff, writeFeathers } from './feathers.js';
import { registerGullAudio, windGain } from './voice.js';
import { footstep } from '../avatar/steps.js';
import { lazyWorld } from '../kit/lazy.js';
import { HELD_R } from '../../ui/holdkey.js';   // [r-hold]
import { mouseLook, lookBlocked } from '../../ui/look-settings.js';

// 3.4 m: at 6.8 m the wings were a speck over the bay. −18° looks down onto the bird and the water.
const CAM = { dist: 3.4, height: 0.55, pitch: -18 * Math.PI / 180, shoulder: 0.15, tau: 0.16, boomStep: 0.25, boomMin: 0.7, boomRadius: 0.16, hide: 0.35 };
const CAM_PERCH = { dist: 2.6, height: 0.7, pitch: -14 * Math.PI / 180, shoulder: 0.32, tau: 0.18, boomStep: 0.2, boomMin: 0.5, boomRadius: 0.12, hide: 0.3 };

function reducedMotion() {
  try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

export function mountGull(ctx) {
  const player = ctx?.playerObj;
  if (!player || !ctx.physics) return null;
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = new URLSearchParams(); }

  const st = gullState(player.pos.x, player.pos.y, player.pos.z, player.yaw);
  const prev = { x: st.x, y: st.y, z: st.z };
  const inp = { pitch: 0, bank: 0, flap: false, perch: false, launch: false, lookYaw: 0, lookPitch: 0 };
  const lookPx = { dx: 0, dy: 0 };
  const lookRad = { dx: 0, dy: 0 };
  const perchOut = { x: 0, y: 0, z: 0, d: Infinity, ok: false };
  const windAt = { x: 0, y: 0, z: 0 };
  const chase = createChaseState();
  const camUse = { dist: CAM.dist, height: CAM.height, pitch: CAM.pitch, shoulder: CAM.shoulder, tau: CAM.tau, boomStep: CAM.boomStep, boomMin: CAM.boomMin, boomRadius: CAM.boomRadius, hide: CAM.hide };
  const birds = makeFlock(ctx.quality?.phone ? 3 : 4);
  const puff = createPuff(10);
  let feathers = null;
  let ease = 0;
  const held = { flap: false };
  let active = false;
  let wantPerch = false;
  let wantLaunch = false;
  let near = false;
  let cryIn = 6;
  let wind = null;
  let promptKey = '';
  let prompt = null;
  const perchFns = [];
  let coaching = false;
  let coachPhase = 'done';
  let coachHandle = null;
  let actionBar = null;
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  let bird = null;
  let flock = null;
  let built = false;
  const cost = { n: 0, sum: 0, max: 0 };

  const solid = (x, y, z) => ctx.physics.solidAt(x, z, y);
  const floorAt = (x, z) => {
    let g = 0;
    try { g = ctx.physics.groundHeight(x, z, 1e9); } catch (e) { g = 0; }
    if (ctx.L.isWater?.(x, z)) return Math.max(g, 0.6);
    return g;
  };

  function onPadLook(dx, dy) { lookRad.dx += dx; lookRad.dy += dy; }
  function onMouseLook(dx, dy) { lookPx.dx += dx; lookPx.dy += dy; }

  // [mobile-play] the bird, its flock and the feathers: built on the first flight (behind the hub's card, or compiled quietly
  // before the drone becomes the gull), freed on a phone when the flight ends (kit/lazy.js)
  const world = lazyWorld(ctx, 'gull', (w) => {
    const p = { bird: createBird(w), flock: createFlock(w, birds.length), feathers: createFeatherMesh(w, puff.n) };
    p.bird.group.visible = false;
    p.flock.mesh.visible = false;
    p.feathers.mesh.visible = false;
    return p;
  });
  function ensureMeshes() {
    if (built) return;
    built = true;
    try {
      ({ bird, flock, feathers } = world.ensure());
    } catch (e) { console.error('[gull] mesh', e); bird = null; flock = null; }
  }
  /** The drone's 「ウミネコになる」: the world compiled first (hidden), then the gull. */
  function enterQuiet() {
    if (world.ready || world.built) { enter(); return; }
    world.prepare({ warm: false }).then(() => { if (!active) enter(); }, () => enter());
  }

  function ensureWind() {
    if (wind || !ctx.audio || typeof ctx.audio.loop !== 'function') return;
    try { registerGullAudio(ctx.audio, footstep); } catch (e) { /* */ }
    try { wind = ctx.audio.loop('play-gull-wind', { volume: 0, position: windAt }); } catch (e) { wind = null; }
  }

  function hidePrompt() {
    promptKey = '';
    try { prompt?.hide(); } catch (e) { /* */ }
    prompt = null;
  }

  function showPrompt(key, onPress, text) {
    if (promptKey === key && prompt?.shown) return;
    hidePrompt();
    promptKey = key;
    const padOn = !!ctx.pad?.active;
    const line = text || ui.t('play.gull.prompt.' + key);
    try { prompt = ui.prompt(line, { onPress, pad: false, top: padOn, priority: 1 }); } catch (e) { prompt = null; }
    if (prompt && prompt.shown === false) { prompt = null; promptKey = ''; return; }
    if (active && ctx.pad?.mode !== 'gull') { try { ctx.pad.setMode('gull'); } catch (err) { /* */ } }
  }

  function blocked() {
    return !!(ctx.services?.explore?.drive?.active || ctx.services?.explore?.sail?.active || ctx.services?.sail?.active || ctx.planet?.active);
  }

  let enterVia = 'free';
  function enter() {
    if (active || blocked()) return false;
    const via = enterVia;
    enterVia = 'free';
    if (typeof player.allowMode === 'function' && !player.allowMode('gull', { via })) return false;
    const tour = ctx.services?.life?.tour;
    if (tour?.playing || tour?.flying) tour.stop();
    ensureMeshes();
    ensureWind();
    const born = gullState(player.pos.x, player.pos.y + (player.fly ? 0 : player.eye * 0.35), player.pos.z, player.yaw);
    for (const k in born) st[k] = born[k];
    if (st.y < floorAt(st.x, st.z) + 1.2) st.y = floorAt(st.x, st.z) + 1.2;
    prev.x = st.x; prev.y = st.y; prev.z = st.z;
    player.pos.set(st.x, st.y, st.z);
    player.prevPos?.copy(player.pos);
    player.vel.set(0, 0, 0);
    player.gull = true;
    player.fly = true;
    player.enabled = false;
    player.lookSink = onPadLook;
    player.lookCapture = onMouseLook;
    if (player.camera) seedChase(chase, player.camera.position.x, player.camera.position.y, player.camera.position.z);
    ease = reducedMotion() ? 0 : 0.48;
    active = true;
    cryIn = 5;
    try { ctx.pad?.setMode('gull'); } catch (e) { /* */ }
    try { player.requestLock?.(); } catch (e) { /* */ }
    try { wind?.setVolume(0.35, 0.4); } catch (e) { /* */ }
    if (bird) bird.group.visible = true;
    if (flock) flock.mesh.visible = true;
    mountActions();
    return true;
  }

  function endCoach() {
    try { coachHandle?.done?.(); } catch (e) { /* */ }
    try { coachHandle?.hide?.(); } catch (e) { /* */ }
    coachHandle = null;
  }

  function showCoach(phase) {
    endCoach();
    hidePrompt();
    const id = phase === 'dive' ? 'gull-dive' : 'gull-flap';
    const key = phase === 'dive' ? 'play.gull.coach.dive' : 'play.gull.coach.flap';
    let text = key;
    try { text = ui.t(key); } catch (e) { /* */ }
    const gesture = phase === 'dive' ? 'drag' : 'tap';
    if (typeof ui.coach === 'function') {
      try {
        coachHandle = ui.coach({ id, text, gesture, dim: true });
        return;
      } catch (e) { coachHandle = null; }
    }
    const onPress = () => { if (phase !== 'dive') { held.flap = true; wantLaunch = true; } };
    showPrompt(phase === 'dive' ? 'coach-dive' : 'coach-flap', onPress, text);
  }

  function mountActions() {
    if (actionBar || typeof ui.actions !== 'function') return;
    try {
      actionBar = ui.actions({
        id: 'gull',
        items: [
          { id: 'flap', key: 'Space', primary: true, label: () => ui.t('play.gull.flap'), onPress: () => { held.flap = true; } },
          { id: 'dive', key: 'S', label: () => ui.t('play.gull.dive') },
          { id: 'walk', key: 'V', label: () => ui.t('play.gull.walk'), onPress: () => leave('walk') },
        ],
      });
    } catch (e) { actionBar = null; }
  }

  function clearActions() {
    try { actionBar?.hide?.(); } catch (e) { /* */ }
    actionBar = null;
  }

  function beginNear(spot) {
    if (!spot) return false;
    enterVia = 'mission';
    const x = spot.x;
    const z = spot.z + 30;
    const y = floorAt(x, z) + 12;
    player.pos.set(x, y, z);
    player.prevPos?.set(x, y, z);
    player.yaw = Math.atan2(-(spot.x - x), -(spot.z - z));
    player.fly = true;
    player.enabled = true;
    return enter();
  }

  function beginLookout() {
    enterVia = 'hub';
    if (active) leave('stop', true);
    const spot = lookoutPerch((x, z) => {
      try { return ctx.L.heightAt(x, z); } catch (e) { return 0; }
    });
    player.pos.set(spot.x, spot.y, spot.z);
    player.yaw = spot.yaw;
    player.prevPos?.set(spot.x, spot.y, spot.z);
    if (!enter()) return false;
    st.perched = true;
    st.x = spot.x; st.y = spot.y; st.z = spot.z;
    st.yaw = spot.yaw;
    st.speed = 0; st.vy = 0; st.pitch = 0; st.roll = 0;
    st.open = reducedMotion() ? 1 : 0;
    player.pos.set(spot.x, spot.y, spot.z);
    player.yaw = spot.yaw;
    const rec = readGullRecord(storage);
    rec.played = true;
    writeGullRecord(storage, rec);
    if (!rec.flap) { coaching = true; coachPhase = 'flap'; showCoach('flap'); }
    else if (!rec.dive) { coaching = true; coachPhase = 'dive'; showCoach('dive'); }
    else { coaching = false; coachPhase = 'done'; }
    return true;
  }

  /** keep: the bird stays built (a restart from the hub while flying builds nothing). */
  function leave(why, keep = false) {
    if (!active) return;
    active = false;
    player.gull = false;
    player.enabled = true;
    if (player.lookSink === onPadLook) player.lookSink = null;
    if (player.lookCapture === onMouseLook) player.lookCapture = null;
    held.flap = false;
    wantPerch = false;
    wantLaunch = false;
    hidePrompt();
    if (bird) bird.group.visible = false;
    if (flock) flock.mesh.visible = false;
    if (feathers) feathers.mesh.visible = false;
    if (!keep) world.leave();   // [mobile-play] a phone frees the bird and its flock; the next flight builds them again
    if (!world.built) { bird = null; flock = null; feathers = null; built = false; }
    try { wind?.setVolume(0, 0.3); } catch (e) { /* */ }
    coaching = false;
    endCoach();
    clearActions();
    try { if (ctx.pad?.mode === 'gull') ctx.pad.setMode(null); } catch (e) { /* */ }
    const hud = ctx.services?.life?.hud;
    const av = ctx.services?.play?.avatar;
    player.vel.set(0, 0, 0);
    if (why === 'drone') {
      player.fly = true;
      player.pos.y -= player.eye;
      player.prevPos?.copy(player.pos);
      player.yaw = st.yaw;
      player.pitch = Math.max(-1.1, Math.min(1.1, st.pitch));
      player.onGround = false;
      try { av?.armHandoff?.(); } catch (e) { /* */ }
      try { hud?.noteMode?.('fly'); } catch (e) { /* */ }
    } else if (why === 'walk') {
      const g = floorAt(st.x, st.z);
      player.fly = false;
      player.yaw = st.yaw;
      player.pitch = 0;
      player.pos.set(st.x, st.y, st.z);
      if (st.y <= g + 0.35) {
        player.pos.y = g;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.vy = Math.min(0, st.vy);
        player.onGround = false;
      }
      player.prevPos?.copy(player.pos);
      try { av?.adoptBoom?.(); } catch (e) { /* */ }
      try { hud?.noteMode?.('walk3'); } catch (e) { /* */ }
    } else if (why === 'stop') {
      player.fly = false;
      try { av?.armHandoff?.(); } catch (e) { /* */ }
    } else {
      try { av?.armHandoff?.(); } catch (e) { /* */ }
    }
    player.camera?.up?.set(0, 1, 0);
  }

  if (ctx.pad && typeof ctx.pad.registerMode === 'function') {
    try {
      ctx.pad.registerMode('gull', {
        stick: 'analog',
        buttons: [
          { id: 'gull-flap', hold: true, icon: 'up', label: () => ({ ja: 'はばたく', en: 'Flap' }), onDown: () => { held.flap = true; }, onUp: () => { held.flap = false; } },
          { id: 'gull-perch', icon: 'land', visible: () => active && (st.perched || near),
            label: () => (st.perched ? { ja: 'とぶ', en: 'Fly' } : { ja: 'とまる', en: 'Perch' }),
            onDown: () => { if (st.perched) wantLaunch = true; else wantPerch = true; } },
          { id: 'gull-drone', icon: 'fly', label: () => ({ ja: 'ドローン', en: 'Drone' }), onDown: () => leave('drone') },
          { id: 'gull-walk', icon: 'walk', label: () => ({ ja: '歩く', en: 'Walk' }), onDown: () => leave('walk') },
        ],
      });
    } catch (e) { console.warn('[gull] pad', e); }
  }

  let drag = false, lx = 0, ly = 0;
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (!active) return;
      const typing = e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (typing) return;
      if (e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); leave('drone'); }
      else if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); leave('view'); }
      else if (e.code === 'Space') e.preventDefault();
    }, true);
    addEventListener(HELD_R, () => { if (active) leave('view'); });
    addEventListener('mousedown', (e) => { if (!active) return; drag = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('mouseup', () => { drag = false; });
    addEventListener('mousemove', (e) => {
      if (!active || lookBlocked()) return;
      const locked = typeof document !== 'undefined' && document.pointerLockElement;
      if (locked) { lookPx.dx += e.movementX || 0; lookPx.dy += e.movementY || 0; }
      else if (drag) { lookPx.dx += (e.clientX - lx) * 1.4; lookPx.dy += (e.clientY - ly) * 1.4; lx = e.clientX; ly = e.clientY; }
    });
  }

  function readInput() {
    const k = player.keys;
    const mv = player.touchMove;
    inp.bank = (mv?.x || 0);
    inp.pitch = -(mv?.y || 0);
    if (k?.has('KeyA') || k?.has('ArrowLeft')) inp.bank -= 1;
    if (k?.has('KeyD') || k?.has('ArrowRight')) inp.bank += 1;
    if (k?.has('ArrowDown') || k?.has('KeyS')) inp.pitch -= 1;
    if (k?.has('ArrowUp')) inp.pitch += 1;
    inp.flap = !!(held.flap || k?.has('Space') || k?.has('KeyW'));
    inp.perch = wantPerch;
    inp.launch = wantLaunch;
    wantPerch = false;
    wantLaunch = false;
    if (lookBlocked()) lookPx.dx = lookPx.dy = 0;
    const d = mouseLook(lookPx.dx, lookPx.dy);
    inp.lookYaw = d.yaw - lookRad.dx;
    inp.lookPitch = d.pitch - lookRad.dy * 0.65;
    lookPx.dx = lookPx.dy = 0;
    lookRad.dx = lookRad.dy = 0;
  }

  ctx.onStep((dt) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!active && params.get('gull') === 'lookout') { params = new URLSearchParams(); beginLookout(); }
    else if (!active && params.get('gull') === '1') { params = new URLSearchParams(); enter(); }
    if (active && (blocked() || ctx.services?.life?.tour?.flying)) { leave('view'); return; }
    if (!active) {
      if (promptKey === 'become') hidePrompt();
      return;
    }
    const list = ctx.services?.harbor?.perches;
    if (list) nearestPerch(list, st.x, st.y, st.z, perchOut);
    else perchOut.ok = false;
    near = !!(perchOut.ok && canPerch(st.speed, perchOut.d, GULL));
    prev.x = st.x; prev.y = st.y; prev.z = st.z;
    readInput();
    const wasPerched = st.perched;
    gullStep(st, inp, dt, { floor: floorAt, solid, perch: perchOut.ok ? perchOut : null });
    if (st.perched && !wasPerched) {
      const ev = { x: st.x, y: st.y, z: st.z, perched: true, id: null };
      api.perch = ev;
      for (let i = 0; i < perchFns.length; i++) { try { perchFns[i](ev); } catch (e) { /* one listener */ } }
    } else if (!st.perched) api.perch = null;
    player.pos.set(st.x, st.y, st.z);
    player.prevPos?.set(prev.x, prev.y, prev.z);
    player.yaw = st.yaw;
    player.pitch = Math.max(-1.2, Math.min(1.2, st.pitch));
    if (ctx.player?.position) ctx.player.position.set(st.x, st.y, st.z);
    if (st.perched && st.open != null && st.open < 1) st.open = reducedMotion() ? 1 : Math.min(1, st.open + dt / WING_OPEN);
    if (coaching) {
      const event = coachPhase === 'flap' && (st.flapped || !st.perched) ? 'flap'
        : coachPhase === 'dive' && !st.perched && st.pitch < -0.35 ? 'dive' : null;
      const next = nextCoach(coachPhase, event);
      if (next !== coachPhase) {
        const rec = readGullRecord(storage);
        if (coachPhase === 'flap') rec.flap = true;
        if (next === 'done') rec.dive = true;
        rec.played = true;
        writeGullRecord(storage, rec);
        endCoach();
        hidePrompt();
        coachPhase = next;
        if (next === 'done') coaching = false;
        else showCoach(next);
      }
    }
    if (st.flapped && !reducedMotion()) emitPuff(puff, st.x, st.y + 0.05, st.z, st.yaw);
    stepPuff(puff, reducedMotion() ? 0 : dt);
    cryIn -= dt;
    if (cryIn <= 0 && !st.perched && ctx.audio && !ctx.audio.muted) {
      cryIn = 7.5 + (st.speed % 3);
      try { ctx.audio.play('play-gull-cry', { volume: 0.7, position: { x: st.x, y: st.y, z: st.z } }); } catch (e) { /* */ }
    }
    windAt.x = st.x; windAt.y = st.y; windAt.z = st.z;
    try {
      wind?.setPosition(windAt);
      wind?.setParam('speed', st.speed);
      wind?.setVolume(windGain(st.speed, st.perched), 0.18);
    } catch (e) { /* */ }
    if (coaching) { /* the coach line is the only instruction */ }
    else if (st.perched) showPrompt('launch', () => { wantLaunch = true; });
    else if (near && st.speed < GULL.perchSpeed) showPrompt('perch', () => { wantPerch = true; });
    else if (promptKey === 'perch' || promptKey === 'launch') hidePrompt();
    if (t0) { const ms = performance.now() - t0; cost.n++; cost.sum += ms; if (ms > cost.max) cost.max = ms; }
  });

  ctx.onUpdate((dt) => {
    if (!active) return;
    const a = ctx.alpha ?? 1;
    const x = prev.x + (st.x - prev.x) * a;
    const y = prev.y + (st.y - prev.y) * a;
    const z = prev.z + (st.z - prev.z) * a;
    if (bird) {
      bird.group.visible = true;
      bird.group.position.set(x, y, z);
      bird.group.rotation.set(st.pitch * 0.85, st.yaw, st.roll, 'YXZ');
      poseWings(bird, wingPose(st, reducedMotion()));
    }
    flockStep(birds, { x, y, z }, reducedMotion() ? 0 : dt, reducedMotion());
    if (flock) { flock.mesh.visible = !st.perched; if (!st.perched) writeFlock(flock, birds); }
    const src = st.perched ? CAM_PERCH : CAM;
    camUse.dist = src.dist; camUse.height = src.height; camUse.pitch = src.pitch; camUse.shoulder = src.shoulder;
    camUse.boomStep = src.boomStep; camUse.boomMin = src.boomMin; camUse.boomRadius = src.boomRadius; camUse.hide = src.hide;
    camUse.tau = ease > 0 ? 0.36 : src.tau;
    if (ease > 0) ease = Math.max(0, ease - (dt > 0 ? dt : 0));
    placeChase(chase, x, y, z, st.yaw, dt, solid, (px, pz) => floorAt(px, pz), reducedMotion() || !(dt > 0), camUse);
    if (feathers) writeFeathers(feathers, puff);
    const cam = player.camera;
    const bank = reducedMotion() ? 0 : st.roll * 0.28;
    cam.up.set(Math.sin(bank), Math.cos(bank), 0);
    cam.position.set(chase.x, chase.y, chase.z);
    cam.lookAt(chase.tx, chase.ty, chase.tz);
  });

  const api = {
    get active() { return active; },
    get state() { return st; },
    get coach() { return coachPhase; },
    perch: null,
    enter, leave,
    start: beginLookout,
    beginNear,
    world,
    on(ev, fn) {
      if (ev !== 'perch' || typeof fn !== 'function') return () => {};
      perchFns.push(fn);
      return () => { const i = perchFns.indexOf(fn); if (i >= 0) perchFns.splice(i, 1); };
    },
    cost: () => (cost.n ? { mean: cost.sum / cost.n, max: cost.max, n: cost.n } : { mean: 0, max: 0, n: 0 }),
  };
  ctx.services.play = Object.assign(ctx.services.play || {}, { gull: api });
  try { if (typeof window !== 'undefined') window.__gull = api; } catch (e) { /* tests */ }
  const spec = gullModeSpec(beginLookout, storage);
  spec.prepare = () => world.prepare();   // [mobile-play] behind the hub's title card
  const reg = kitApi.registerMode || ctx.services?.play?.registerMode;
  if (typeof reg === 'function') {
    try { reg(spec); } catch (e) { console.warn('[gull] registerMode', e); }
  }
  return api;
}
