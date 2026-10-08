// Night race: two laps of the harbour circuit, a countdown, a personal-best ghost, medals on this device.
import * as THREE from 'three';
import { minatoCourse } from './course.js';
import { createRaceRun, raceTick, medalFor, project } from './progress.js';
import { createLapTape, unpackTape, ghostPose, ghostLine, ghostMsAt } from './ghost.js';
import { startDelay } from './together.js';
import { createSkids, rearPatch } from './marks.js';
import { createPuffs } from './smoke.js';
import { applyCrispNight } from './night.js';
import { buildGates } from './gates.js';
import { readCar, writeCar, readCourse, writeCourse } from '../car/save.js';
import { lazyWorld } from '../kit/lazy.js';

// Game material from PLAY-UI-STYLE: 紺 chip, 生成り quit, timer with a 2 px 紺 outline.
const HUD = `
#klc-car { position: fixed; inset: 0; z-index: 8; pointer-events: none; line-break: strict;
  font-family: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; }
#klc-car[hidden], body:not(.playing) #klc-car, body.noui #klc-car { display: none !important; }
#klc-car .lap { position: absolute; top: calc(88px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  margin: 0; padding: 0 16px; height: 40px; display: flex; align-items: center; white-space: nowrap;
  border-radius: 999px; background: rgba(34, 58, 112, 0.88); color: #FBFAF5;
  font: 700 14px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; letter-spacing: 0.04em;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4), 0 4px 12px rgba(23,24,75,.35); }
body.klc-racing #klc-play .book,
body.klc-racing #klc-play .counter,
body.klc-racing #klc-play .topbar { visibility: hidden; }
body.klc-racing #klc-play .timer { top: calc(8px + env(safe-area-inset-top, 0px));
  font: 800 48px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; letter-spacing: 0.04em; color: #FBFAF5;
  text-shadow: 0 2px 0 #223A70, 0 -2px 0 #223A70, 2px 0 0 #223A70, -2px 0 0 #223A70,
    2px 2px 0 #223A70, -2px -2px 0 #223A70, 2px -2px 0 #223A70, -2px 2px 0 #223A70; }
body.klc-racing #klc-play .split { top: calc(60px + env(safe-area-inset-top, 0px));
  font: 800 18px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#klc-car .quit { pointer-events: auto; position: absolute; left: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  min-width: 44px; min-height: 52px; padding: 0 18px; border: 0; border-radius: 999px; cursor: pointer;
  background: rgba(251, 250, 245, 0.94); color: #223A70; font: 700 13px/1 "Zen Maru Gothic", sans-serif;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4), 0 4px 12px rgba(23,24,75,.35); }
#klc-car .quit:active { transform: scale(0.94); }
#klc-car .quit:focus-visible { outline: 2px solid #223A70; outline-offset: 2px; }
@media (max-width: 720px) {
  body.klc-racing #klc-play .timer { font-size: 40px; }
  body.klc-racing #klc-play .split { top: calc(52px + env(safe-area-inset-top, 0px)); font-size: 16px; }
  #klc-car .lap { top: calc(88px + env(safe-area-inset-top, 0px)); }
}
@media (prefers-reduced-motion: reduce) {
  #klc-car .quit:active { transform: none; }
}
`;

const pose = { x: 0, z: 0, y: 0, yaw: 0 };

function buildGhost(ctx) {
  const body = new THREE.BoxGeometry(1.48, 0.55, 3.2);
  body.translate(0, 0.72, 0.05);
  const cab = new THREE.BoxGeometry(1.28, 0.48, 1.4);
  cab.translate(0, 1.2, -0.15);
  const geo = mergeBox(body, cab);
  const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8dc, transparent: true, opacity: 0.62, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'play-ghost';
  mesh.visible = false;
  ctx.noOutline?.(mesh);
  ctx.add(mesh);
  return mesh;
}

function mergeBox(a, b) {
  const geos = [a, b];
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let v = 0, ii = 0;
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { pos[(v + i) * 3] = p.getX(i); pos[(v + i) * 3 + 1] = p.getY(i); pos[(v + i) * 3 + 2] = p.getZ(i); }
    for (let i = 0; i < g.index.count; i++) idx[ii++] = g.index.getX(i) + v;
    v += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function mountRace(ctx, kit, drive) {
  const course = minatoCourse();
  const { ui, sfx, onPlayTick } = kit;
  const run = createRaceRun();
  const tape = createLapTape();
  const saved = readCar(kit.store);
  let ghostCount = Number(saved.race.ghostCount) || 0;
  let ghostBuf = Array.isArray(saved.race.ghost) && saved.race.ghost.length >= 8 ? unpackTape(saved.race.ghost) : null;
  if (ghostBuf && ghostCount * 4 > ghostBuf.length) ghostCount = (ghostBuf.length / 4) | 0;
  let bestLap = Number(saved.race.bestLapMs) || 0;
  let bestPack = Array.isArray(saved.race.ghost) ? saved.race.ghost : null;
  let ghostS = null;
  let splitBucket = 99;
  const finishers = [];
  const skids = createSkids(ctx);
  const puffs = createPuffs(ctx);
  // [mobile-play] The course's arches, cones and signal lamps: built when a race begins (behind the hub's title card, or
  // warmed quietly when the car comes near the start line), shown while it runs, and on a phone freed once the car is away
  // from the line. Deploy #5 built and drew them in the town from startup.
  const arches = lazyWorld(ctx, 'race', (w, root) => { root.visible = false; return { mesh: buildGates(w, course) }; });
  function showArches(on) {
    if (on && !arches.built) arches.ensure();
    if (arches.root && !arches.warming) arches.root.visible = !!on;
  }
  const ghost = buildGhost(ctx);
  let timer = null;
  let prompt = null;
  let savedPreset = null;
  let offNote = false;
  let crisp = false;

  const hud = document.createElement('div');
  hud.id = 'klc-car';
  hud.hidden = true;
  const lapEl = document.createElement('p');
  lapEl.className = 'lap';
  const quitBtn = document.createElement('button');
  quitBtn.type = 'button';
  quitBtn.className = 'quit';
  hud.append(lapEl, quitBtn);
  const style = document.createElement('style');
  style.textContent = HUD;
  document.head.appendChild(style);
  document.body.appendChild(hud);
  quitBtn.addEventListener('click', () => leave(false));

  function paintLap(n) {
    lapEl.textContent = ui.t('play.car.lap') + ' ' + n + '/' + course.laps;
  }

  function bindGhost() {
    if (!ghostBuf || ghostCount < 2) { ghostS = null; return; }
    if (!ghostS || ghostS.length !== ghostCount) ghostS = new Float32Array(ghostCount);
    ghostLine(ghostBuf, ghostCount, project, course, ghostS);
  }
  bindGhost();

  function emitFinish(ms, medal) {
    const detail = { ms, medal: medal || null };
    for (let i = 0; i < finishers.length; i++) {
      try { finishers[i](detail); } catch (e) { console.error(e); }
    }
    try { window.dispatchEvent(new CustomEvent('klc-multi-finish', { detail })); } catch { /* no window */ }
    try { ctx.services.multi?.finishTogether?.(ms); } catch { /* multi lane is optional */ }
  }

  function nearStart() {
    if (!drive.active) return false;
    const s = drive.state;
    return Math.hypot(s.x - course.start[0], s.z - course.start[1]) < 18;
  }

  function hidePrompt() {
    prompt?.hide();
    prompt = null;
  }

  let sheetEl = null;
  function notebookOpen() {
    if (!sheetEl) sheetEl = document.querySelector('#klc-play .sheet');
    return !!(sheetEl && !sheetEl.hidden);
  }

  function veilOpen() {
    const veil = document.querySelector('#klc-play .veil');
    return !!(veil && !veil.hidden);
  }

  function showPrompt() {
    if (prompt?.shown || run.phase !== 'idle' || notebookOpen() || veilOpen()) return;
    prompt = ui.prompt(ui.t('play.car.start'), { onPress: () => { hidePrompt(); begin(); }, priority: 2 });
    if (prompt && prompt.shown === false) prompt = null;
  }

  function armNight() {
    const time = ctx.services?.time;
    if (time && savedPreset == null) savedPreset = time.preset || 'yugata';
    try { time?.set?.('yoru', { instant: true }); } catch { /* keep the current hour */ }
    if (ctx.services.playCar) ctx.services.playCar.quiet = true;
    crisp = true;
    applyCrispNight(ctx);
  }

  function restoreClock() {
    crisp = false;
    if (ctx.services.playCar) ctx.services.playCar.quiet = false;
    const time = ctx.services?.time;
    if (savedPreset && time?.set) { try { time.set(savedPreset, { instant: true }); } catch { /* */ } }
    savedPreset = null;
  }

  function endHud() {
    drive.setRace(false);
    drive.setLocked(false);
    showArches(false);
    ghost.visible = false;
    hud.hidden = true;
    document.body?.classList.remove('klc-racing');
    timer?.hide();
    timer = null;
    hidePrompt();
  }

  function leave(finished) {
    const total = run.ms;
    run.phase = 'idle';
    endHud();
    if (!finished) { restoreClock(); return; }
    const prev = readCourse(kit.store);
    const prevBest = Number(prev?.best);
    const isBest = !(prevBest > 0) || total < prevBest;
    const best = isBest ? total : prevBest;
    const medal = medalFor(best, course.medals);
    writeCourse(kit.store, { best, medal, runs: (Number(prev?.runs) || 0) + 1 });
    writeCar(kit.store, {
      race: { bestMs: best, medal, bestLapMs: bestLap || null, ghost: bestPack, ghostCount },
    });
    emitFinish(total, medal);
    ui.resultCard({
      title: ui.t('play.car.raceTitle'),
      medal,
      timeMs: total,
      bestMs: isBest ? null : best,
      isBest,
      onRetry: () => begin(),
      onQuit: () => restoreClock(),
    });
  }

  let countGen = 0;
  async function begin(at) {
    if (typeof ctx.playerObj?.allowMode === 'function' && !ctx.playerObj.allowMode('race', { via: 'hub' })) return;
    hidePrompt();
    if (run.phase === 'count' || run.phase === 'run') return;
    const gen = ++countGen;
    const poseIn = at && typeof at === 'object' ? at : null;
    const wait = startDelay(typeof at === 'number' ? at : null, Date.now());
    if (wait > 0) {
      run.phase = 'count';
      await new Promise((r) => setTimeout(r, wait));
      if (gen !== countGen || run.phase !== 'count') return;
    }
    const ok = drive.enter({
      x: poseIn?.x ?? course.start[0],
      z: poseIn?.z ?? course.start[1],
      yaw: poseIn?.yaw ?? course.startYaw,
    });
    if (!ok) { if (gen === countGen) run.phase = 'idle'; ui.toast(ui.t('play.car.offCourse')); return; }
    if (gen !== countGen) return;
    showArches(true);
    run.phase = 'count';
    splitBucket = 99;
    run.done = 0; run.s = 0; run.ms = 0; run.armed = false; run.off = 0; run.lapStart = 0; run.seenFar = false;
    tape.reset();
    drive.setRace(true);
    drive.setLocked(true);
    armNight();
    quitBtn.textContent = ui.t('play.car.quit');
    paintLap(1);
    hud.hidden = false;
    document.body?.classList.add('klc-racing');
    ghost.visible = false;
    timer = ui.timer();
    await ui.countdown({
      onGo() {
        if (gen !== countGen || run.phase !== 'count') return;
        drive.setLocked(false);
        run.phase = 'run';
        run.ms = 0;
        run.lapStart = 0;
        timer?.start();
      },
    });
  }

  function noteLap(lapMs) {
    if (!(lapMs > 1000)) return;
    if (!(bestLap > 0) || lapMs < bestLap) {
      bestLap = lapMs;
      bestPack = tape.pack();
      ghostBuf = unpackTape(bestPack);
      ghostCount = tape.count;
      bindGhost();
      ui.toast(ui.t('play.car.best'));
      sfx.play('chime');
    } else {
      sfx.play('checkpoint');
    }
    tape.reset();
  }

  onPlayTick((dt) => {
    const st = drive.state;
    if (drive.active) {
      const patch = rearPatch(st.x, st.z, st.yaw);
      const sliding = !!st.skid && Math.abs(st.speed) > 2.4;
      skids.step(patch.lx, patch.lz, patch.rx, patch.rz, st.y, sliding);
      // The axle sits inside the body. Step the puffs back so they clear the bumper.
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
      const back = 0.95;
      puffs.step(dt, sliding, patch.lx - fx * back, st.y, patch.lz - fz * back, patch.rx - fx * back, patch.rz - fz * back);
    }
    if (run.phase === 'idle') {
      // [mobile-play] the arches compile quietly while the car nears the line; away from it (or out of the car) a phone frees them
      const away = drive.active ? Math.hypot(st.x - course.start[0], st.z - course.start[1]) : Infinity;
      if (away < 60 && !arches.built) arches.prepare({ warm: false }).then(() => { if (run.phase === 'idle') showArches(false); });
      else if (away > 260 && arches.built && !arches.warming) arches.leave();
      if (notebookOpen() || veilOpen() || Math.abs(drive.state.speed) > 1.5) { if (prompt) hidePrompt(); return; }
      if (nearStart()) showPrompt();
      else if (prompt) hidePrompt();
      return;
    }
    if (run.phase !== 'run' || !drive.active) return;
    tape.push(dt, st.x, st.z, st.y, st.yaw);
    const prevStart = run.lapStart;
    const ev = raceTick(run, course, st.x, st.z, dt);
    paintLap(ev.lap);
    if (timer && ghostS && ghostCount > 1) {
      const player = run.ms - run.lapStart;
      const gms = ghostMsAt(ghostS, ghostCount, ev.s);
      const bucket = (player - gms) / 100 | 0;
      if (bucket !== splitBucket) {
        splitBucket = bucket;
        timer.splitAt(player, gms);
      }
    }
    if (ev.event === 'off') {
      if (!offNote) { ui.toast(ui.t('play.car.offCourse')); offNote = true; }
    } else offNote = false;
    if (ev.split != null) sfx.play('checkpoint');
    if (ghostBuf && ghostCount > 1) {
      const t = (run.ms - run.lapStart) / 1000;
      if (ghostPose(ghostBuf, ghostCount, t, pose)) {
        ghost.visible = true;
        ghost.position.set(pose.x, pose.y + 0.02, pose.z);
        ghost.rotation.set(0, pose.yaw + Math.PI, 0);
      }
    }
    if (ev.event === 'lap' || ev.event === 'finish') noteLap(run.ms - prevStart);
    if (ev.event === 'finish') {
      timer?.stop();
      leave(true);
    }
  });

  ctx.onUpdate(() => { if (crisp) applyCrispNight(ctx); });

  function start(opts) {
    let at = null;
    if (typeof opts === 'number') at = opts;
    else if (opts && typeof opts === 'object' && 'at' in opts) at = opts.at;
    if (run.phase !== 'idle') leave(false);
    return begin(at);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('klc-multi-race', (e) => {
      const d = e.detail || {};
      if (d.course !== 'race') return;
      start({ at: d.go });
    });
  }

  return {
    start,
    /** [mobile-play] the hub's title card: the arches built and warm before start() */
    prepare: () => arches.prepare(),
    arches,
    on(ev, fn) {
      if (ev !== 'finish' || typeof fn !== 'function') return () => {};
      finishers.push(fn);
      return () => {
        const i = finishers.indexOf(fn);
        if (i >= 0) finishers.splice(i, 1);
      };
    },
    quit: () => leave(false),
    /** Keep the crisp night up behind a results card that was opened without a race. */
    holdNight() { crisp = true; applyCrispNight(ctx); },
    goToLine() {
      document.querySelector('#klc-play [data-act="close"]')?.click();
      if (run.phase !== 'idle') leave(false);
      const ok = drive.enter({ x: course.start[0], z: course.start[1], yaw: course.startYaw });
      if (ok) drive.place?.(0);
      showPrompt();
    },
    get phase() { return run.phase; },
  };
}
