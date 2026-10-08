// [play:courses] The run: prompt, countdown, clock, arrow, finish, the notebook.
// The kit is optional. Before it lands, the gates are in the world and a small
// prompt still starts a course. Sound and sparks go through the kit when it is here.

import * as THREE from 'three';
import STR from '../../../../data/play-i18n.json';
import { createRun, stepRun, recordResult, formatTime, createBus, RETRY_FADE_S } from './logic.js';
import { createWorld } from './world.js';
import { createHud } from './hud.js';
import { coachRequest, courseModeList, ndcToCss, quitActions, registerCourseModes } from './hub.js';

const REACH = 26;
const REACH_Y = 36;

function readLang(ctx) {
  try {
    const l = ctx?.services?.life?.hud?.i18n?.lang;
    if (l === 'en' || l === 'ja') return l;
  } catch (e) { /* */ }
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') return q;
    const s = localStorage.getItem('klc.lang');
    if (s === 'en' || s === 'ja') return s;
  } catch (e) { /* */ }
  return 'ja';
}

function text(ctx, key, vars) {
  const lang = readLang(ctx);
  let s = (STR[lang] && STR[lang][key]) || STR.ja[key] || key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

function driveOf(ctx) { return ctx.services?.explore?.drive || null; }
function sailOf(ctx) { return ctx.services?.explore?.sail || ctx.services?.sail || null; }

function modeNow(ctx, kit) {
  if (kit && typeof kit.playMode === 'function') {
    const m = kit.playMode();
    if (m === 'drive' || m === 'sail' || m === 'fly' || m === 'walk') return m;
    return m;
  }
  const d = driveOf(ctx), s = sailOf(ctx);
  if (d?.active) return 'drive';
  if (s?.active) return 'sail';
  if (ctx.playerObj?.fly) return 'fly';
  return 'walk';
}

function playing(ctx) {
  try {
    if (document.body.classList.contains('playing') || document.body.classList.contains('shot')) return true;
  } catch (e) { /* tests */ }
  return !!ctx.playerObj?.enabled;
}

export function mount(ctx, kit) {
  const world = createWorld(ctx);
  const courses = world.courses;
  const ui = kit?.ui || null;
  const sfx = kit?.sfx || null;
  const fx = kit?.fx || null;
  const store = kit?.store || null;

  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hud = createHud(reduce);
  const bus = createBus();
  const pose = { x: 0, y: 0, z: 0, yaw: 0, u: 0, v: 0 };
  const prev = { x: 0, y: 0, z: 0, yaw: 0, u: 0, v: 0 };
  const stepOut = {};
  const arrowPt = { x: 0, y: 0, z: 0 };

  let phase = 'idle';
  let course = null;
  let run = null;
  let shownCs = -1;
  let count = null;
  let timer = null;
  let arrow = null;
  let counter = null;
  let prompt = null;
  let nearId = null;
  let flyT = 0;
  let countT = -1;
  let countI = -1;
  let armAt = 0;
  let restarting = false;
  let locked = false;
  let savedLook = undefined;
  const camFrom = { x: 0, y: 0, z: 0 };
  const camLook = { x: 0, y: 0, z: 0 };

  const quit = hud.quit;
  const screenPt = { x: 0, y: 0 };
  const projV = new THREE.Vector3();
  let coach = null;
  let actionHandle = null;
  let actionsOn = false;
  let modeList = null;
  let modesBound = false;
  const localCount = document.createElement('div');
  localCount.id = 'course-local';
  localCount.hidden = true;
  const localGo = document.createElement('button');
  localGo.type = 'button';
  localGo.id = 'course-go';
  localGo.hidden = true;
  if (!ui && document.body) {
    document.body.appendChild(localCount);
    document.body.appendChild(localGo);
    localGo.addEventListener('click', () => { const c = courses.find((x) => x.id === nearId); if (c) onPrompt(c); });
  }
  quit.addEventListener?.('click', () => finishQuit());
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (e.repeat || e.code !== 'Escape') return;
      if (phase !== 'live' && phase !== 'countdown' && phase !== 'flyby' && phase !== 'arm') return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      finishQuit();
    });
  }

  function pins(on) {
    try { ctx.pad?.suppress?.('course', on); } catch (e) { /* no pad */ }
  }

  function setLock(on) {
    pins(on);
    const p = ctx.playerObj;
    if (!p) { locked = on; return; }
    if (on && !locked) {
      savedLook = p.lookCapture;
      p.lookCapture = () => {};
      locked = true;
    } else if (!on && locked) {
      p.lookCapture = savedLook;
      savedLook = undefined;
      locked = false;
    }
  }

  function readPose() {
    const p = ctx.player?.position;
    if (p) { pose.x = p.x; pose.y = p.y; pose.z = p.z; }
    const sail = sailOf(ctx);
    if (course?.mode === 'sail' && sail?.boat) {
      pose.x = sail.boat.x; pose.y = 0; pose.z = sail.boat.z;
      pose.yaw = sail.boat.yaw; pose.u = sail.boat.u; pose.v = sail.boat.v;
    } else if (course?.mode === 'drive') {
      const d = driveOf(ctx);
      if (d?.state) { pose.x = d.state.x; pose.y = d.state.y; pose.z = d.state.z; pose.yaw = d.state.yaw; }
    } else if (ctx.playerObj) {
      pose.yaw = ctx.playerObj.yaw;
    }
  }

  function pin() {
    if (!course) return;
    const st = course.start;
    const player = ctx.playerObj;
    if (course.mode === 'fly' && player) {
      player.fly = true;
      player.enabled = true;
      player.pos.set(st.x, st.y - (player.eye || 1.6), st.z);
      player.yaw = st.yaw; player.pitch = -0.12; player.vy = 0;
      player.vel?.set(0, 0, 0);
      player.applyCamera?.(0);
    } else if (course.mode === 'drive') {
      const d = driveOf(ctx);
      if (d?.state) { d.state.x = st.x; d.state.z = st.z; d.state.yaw = st.yaw; d.state.speed = 0; d.state.steer = 0; }
    } else if (course.mode === 'sail') {
      const s = sailOf(ctx);
      s?.setPose?.(st.x, st.z, st.yaw);
      s?.setAutopilot?.(false);
    }
  }

  function enterMode(c) {
    const st = c.start;
    const drive = driveOf(ctx), sail = sailOf(ctx), player = ctx.playerObj;
    if (c.mode === 'fly') {
      if (drive?.active) drive.exit();
      if (sail?.active) sail.exit();
      if (player) {
        player.enabled = true; player.fly = true;
        player.setPose(st.x, st.z, st.yaw * 180 / Math.PI, -8, st.y);
        player.vel?.set(0, 0, 0);
      }
    } else if (c.mode === 'drive') {
      if (sail?.active) sail.exit();
      if (drive?.active) drive.exit();
      drive?.enter?.({ x: st.x, z: st.z, yaw: st.yaw });
    } else if (c.mode === 'sail') {
      if (drive?.active) drive.exit();
      if (sail?.active) sail.exit();
      sail?.enter?.({ x: st.x, z: st.z, yaw: st.yaw, autopilot: false, u: 0 });
      sail?.setAutopilot?.(false);
    }
  }

  function hidePrompt() {
    prompt?.hide?.();
    prompt = null;
    if (!ui) localGo.hidden = true;
    nearId = null;
  }

  function showPrompt(c) {
    const wrong = modeNow(ctx, kit) !== c.mode;
    const label = wrong ? text(ctx, 'play.course.switch.' + c.mode) : text(ctx, 'play.course.start');
    if (ui?.prompt) {
      if (prompt?.shown && nearId === c.id && prompt._label === label) return;
      hidePrompt();
      prompt = ui.prompt(label, { onPress: () => onPrompt(c), priority: 2 });
      if (prompt && prompt.shown === false) { prompt = null; return; }
      prompt._label = label;
    } else {
      localGo.hidden = false;
      localGo.textContent = label;
    }
    nearId = c.id;
  }

  function onPrompt(c) {
    if (!playing(ctx) && !document.body.classList.contains('shot')) return;
    if (modeNow(ctx, kit) !== c.mode) { enterMode(c); hidePrompt(); return; }
    hidePrompt();
    begin(c);
  }

  function closeCard() {
    restarting = true;
    try {
      const b = document.querySelector('#klc-play .veil [data-act="quit"]');
      if (b) b.click();
    } catch (e) { /* no card */ }
    restarting = false;
  }

  function rowsOf(id) {
    try { return store ? store.get('courses')?.[id] : null; }
    catch (e) { return null; }
  }

  function projectGate(g) {
    const cam = ctx.camera;
    if (!g || !cam) return null;
    projV.set(g.x, g.y || 0, g.z);
    projV.project(cam);
    if (projV.z < -1 || projV.z > 1) return null;
    const w = typeof innerWidth === 'number' ? innerWidth : 0;
    const h = typeof innerHeight === 'number' ? innerHeight : 0;
    if (!(w > 0 && h > 0)) return null;
    return ndcToCss(projV.x, projV.y, w, h, screenPt);
  }

  function endCoach(done) {
    const c = coach;
    if (!c) return;
    coach = null;
    try {
      if (done && typeof c.done === 'function') c.done();
      else if (typeof c.hide === 'function') c.hide();
    } catch (e) { /* the race continues */ }
  }

  function showCoach() {
    endCoach(false);
    if (typeof ui?.coach !== 'function' || !course) return;
    const req = coachRequest(course);
    if (!req) return;
    try {
      coach = ui.coach({
        id: req.id,
        text: text(ctx, req.textKey),
        gesture: req.gesture,
        dim: req.dim,
        target: () => (course ? projectGate(course.gates[0]) : null),
      }) || null;
    } catch (e) { coach = null; }
  }

  function showQuit() {
    const label = text(ctx, 'play.course.quit');
    if (typeof ui?.actions === 'function') {
      quit.hidden = true;
      if (actionsOn) return;
      try {
        const ret = ui.actions(quitActions(() => finishQuit(), label));
        actionHandle = ret && typeof ret === 'object' ? ret : null;
        actionsOn = true;
        return;
      } catch (e) { /* the arrow button still quits */ }
    }
    hud.setQuit(label);
  }

  function hideQuit() {
    quit.hidden = true;
    if (!actionsOn) return;
    actionsOn = false;
    const h = actionHandle;
    actionHandle = null;
    try {
      if (h && typeof h.hide === 'function') h.hide();
      else ui?.actions?.([]);
    } catch (e) { /* the cluster can stay until the next mode */ }
  }

  function begin(c) {
    endCoach(false);
    course = c;
    phase = 'countdown';
    run = null;
    armAt = 0;
    enterMode(c);
    pin();
    setLock(true);
    world.setRun(c.id, 0);
    hud.setRacing(true);
    showQuit();
    if (ui?.countdown) {
      let went = false;
      ui.countdown({ onGo() { went = true; goLive(); } }).then(() => { if (!went && phase === 'countdown') goLive(); });
      // 「3」 at once (もう一回 left GO! up until the next tick), written into the kit's digit: replacing the whole
      // .count's text took its .cd-n span with it, so the next countdown (the night race's) threw on every tick and
      // never reached GO
      const digit = document.querySelector('#klc-play .count');
      if (digit) {
        const n = digit.querySelector('.cd-n') || digit;
        n.textContent = '3';
        if (n.dataset) n.dataset.t = '3';
        digit.classList.remove('is-go');
        digit.hidden = false;
      }
    } else {
      countT = -1; countI = -1;
      localCount.hidden = false;
    }
  }

  function lineLabel() {
    if (!course || !run) return '';
    const n = run.index;
    const total = course.gates.length;
    const g = course.gates[Math.min(n, total - 1)];
    if (g && g.kind === 'dock') return text(ctx, 'play.course.docking');
    const key = g && g.kind === 'flag' ? 'play.course.flags' : g && g.kind === 'buoy' ? 'play.course.buoys' : 'play.course.rings';
    return text(ctx, key, { n, total });
  }

  function goLive() {
    if (phase !== 'countdown' || !course) return;
    phase = 'live';
    run = createRun();
    readPose();
    prev.x = pose.x; prev.y = pose.y; prev.z = pose.z; prev.yaw = pose.yaw; prev.u = pose.u; prev.v = pose.v;
    shownCs = -1;
    localCount.hidden = true;
    setLock(false);
    hud.show();
    showQuit();
    hud.setLine(lineLabel());
    hud.setTime(0);
    showCoach();
    if (ui?.edgeArrow) {
      arrow = ui.edgeArrow((out) => {
        const g = course && run ? course.gates[run.index] : null;
        if (!g) return null;
        const o = out || arrowPt;
        o.x = g.x; o.y = g.y || 2; o.z = g.z;
        return o;
      });
    }
    world.setRun(course.id, 0);
  }

  function bestSplits() {
    if (!store || !course) return null;
    const row = store.get('courses')?.[course.id];
    return row && row.splits ? row.splits : null;
  }

  function endHud() {
    endCoach(false);
    timer?.hide?.(); timer = null;
    arrow?.hide?.(); arrow = null;
    counter = null;
    localCount.hidden = true;
    const digit = typeof document !== 'undefined' ? document.querySelector('#klc-play .count') : null;
    if (digit) digit.hidden = true;
    hideQuit();
    hud.hide();
    setLock(false);
  }

  function showCard() {
    if (!course || !run) { phase = 'idle'; world.clearRun(); return; }
    phase = 'result';
    setLock(true);
    const saved = store ? store.get('courses')?.[course.id] : null;
    const rec = recordResult(saved, course, run);
    if (store && run.finished) store.update('courses', (d) => { d[course.id] = rec.row; });
    const score = rec.score;
    if (run.finished) bus.emit('finish', { id: course.id, ms: Math.round(score.effectiveMs), medal: score.medal });
    const bonus = score.bonusMs > 0 ? text(ctx, 'play.course.dockBonus', { sec: (score.bonusMs / 1000).toFixed(1) }) : '';
    const extra = bonus ? (formatTime(score.timeMs) + '　' + bonus) : '';
    world.clearRun();
    if (ui?.resultCard) {
      ui.resultCard({
        title: text(ctx, 'play.course.' + course.id),
        medal: score.medal,
        timeMs: score.effectiveMs,
        isBest: rec.isBest,
        bestMs: saved && Number.isFinite(saved.best) ? saved.best : null,
        extra,
        onRetry: () => retry(),
        onQuit: () => { if (restarting) return; phase = 'idle'; course = null; run = null; setLock(false); world.clearRun(); },
      });
    } else {
      phase = 'idle';
      setLock(false);
    }
    try { ui?.notebook?.refresh?.('courses'); } catch (e) { /* */ }
  }

  function retry() {
    if (!course) return;
    const c = course;
    hud.fade(reduce ? 0 : RETRY_FADE_S);
    begin(c);
  }

  function finishQuit() {
    endHud();
    world.clearRun();
    phase = 'idle';
    course = null;
    run = null;
    setLock(false);
  }

  function onPass(g, before, t) {
    const name = g.kind === 'buoy' ? 'buoy' : g.kind === 'flag' ? 'checkpoint' : 'ring';
    sfx?.play(name, { position: { x: g.x, y: g.y || 0, z: g.z }, pitch: 1 });
    fx?.burst({ x: g.x, y: (g.y || 0) + 1, z: g.z }, 'ring');
    fx?.burst({ x: g.x, y: (g.y || 0) + 1.2, z: g.z }, 'gold', { count: 16 });
    try { navigator.vibrate?.(g.kind === 'buoy' ? 12 : 10); } catch (e) { /* no haptic */ }
    counter?.set(run.index);
    counter?.bump();
    const best = bestSplits();
    const at = run.splits.length - 1;
    hud.split(run.elapsed, best ? best[at] : null);
    timer?.splitAt(run.elapsed, best ? best[at] : null);
    world.setRun(course.id, run.index);
    world.pass(course.id, before, t || 0);
    hud.setLine(lineLabel());
  }

  const step = (dt, t) => {
    if (!modesBound && modeList) modesBound = registerCourseModes(kit, modeList);
    world.tick(t || 0);
    if (phase === 'arm') {
      pin();
      const now = typeof performance !== 'undefined' ? performance.now() : armAt;
      if (now >= armAt) begin(course);
      return;
    }
    if (phase === 'countdown') {
      pin();
      if (!ui?.countdown) {
        if (countT < 0) { countT = 0; countI = 0; localCount.textContent = '3'; sfx?.play('count'); }
        else countT += dt;
        const at = [0, 0.72, 1.44, 2.16];
        while (countI < 3 && countT >= at[countI + 1]) {
          countI++;
          localCount.textContent = countI === 3 ? 'GO' : String(3 - countI);
          sfx?.play(countI === 3 ? 'go' : 'count');
          if (countI === 3) hud.fade(0.16);
        }
        if (countI === 3 && countT >= 2.56) goLive();
      }
      return;
    }
    if (phase === 'live' && course && run) {
      if (course.mode === 'sail') {
        const s = sailOf(ctx);
        if (s?.state?.autopilot) s.setAutopilot(false);
        else if (s?.state) s.state.idle = 0;
      }
      readPose();
      const before = run.index;
      stepRun(run, course, prev, pose, dt, bestSplits(), stepOut);
      prev.x = pose.x; prev.y = pose.y; prev.z = pose.z; prev.yaw = pose.yaw; prev.u = pose.u; prev.v = pose.v;
      const cs = (run.elapsed / 10) | 0;
      if (cs !== shownCs) { shownCs = cs; hud.setTime(run.elapsed); }
      if (stepOut.event === 'pass' || stepOut.event === 'finish') {
        if (before === 0) endCoach(true);
      }
      if (stepOut.event === 'pass') onPass(course.gates[before], before, t);
      else if (stepOut.event === 'near') sfx?.play('whoosh', { gain: 0.35 });
      else if (stepOut.event === 'finish') {
        const g = course.gates[before];
        if (g && g.kind !== 'dock') onPass(g, before, t);
        else if (g) {
          sfx?.play('buoy', { position: { x: g.x, y: 1, z: g.z } });
          fx?.burst({ x: g.x, y: 2, z: g.z }, 'gold', { count: 18 });
          try { navigator.vibrate?.(16); } catch (e) { /* no haptic */ }
        }
        sfx?.play('fanfare');
        phase = reduce ? 'result' : 'flyby';
        flyT = 0;
        setLock(true);
        if (ctx.camera) { camFrom.x = ctx.camera.position.x; camFrom.y = ctx.camera.position.y; camFrom.z = ctx.camera.position.z; }
        if (g) { camLook.x = g.x; camLook.y = (g.y || 0) + 4; camLook.z = g.z; }
        if (reduce) { endHud(); showCard(); }
      }
      return;
    }
    if (phase === 'idle' && playing(ctx)) {
      readPose();
      let best = null, bd = REACH, nearest = Infinity;
      const claim = ctx.services?.missions?.travelCourse?.() || null;
      for (let i = 0; i < courses.length; i++) {
        const c = courses[i];
        if (claim && claim !== c.id) continue;
        const dx = c.start.x - pose.x, dy = (c.start.y || 0) - pose.y, dz = c.start.z - pose.z;
        const h = Math.hypot(dx, dz);
        if (h < nearest) nearest = h;
        if (h < bd && Math.abs(dy) < (c.mode === 'fly' ? REACH_Y : 12)) { bd = h; best = c; }
      }
      if (best) showPrompt(best);
      else if (nearId) hidePrompt();
      world.near?.(nearest);   // [mobile-play] the rings and buoys warm up quietly near a start line, and go when the visitor is far
    }
  };
  ctx.onStep(step);
  step.__mod = 'play:courses';

  const flyCam = (dt) => {
    if (phase !== 'flyby' || !ctx.camera) return;
    flyT += dt;
    const k = Math.min(1, flyT / 2);
    const ease = k * k * (3 - 2 * k);
    const y = camFrom.y + (camLook.y + 16 - camFrom.y) * ease;
    const x = camFrom.x + (camLook.x - camFrom.x) * ease * 0.35;
    const z = camFrom.z + (camLook.z - camFrom.z) * ease * 0.35;
    ctx.camera.position.set(x, y, z);
    ctx.camera.lookAt(camLook.x, camLook.y, camLook.z);
    if (flyT >= 2) { endHud(); showCard(); }
  };
  ctx.onUpdate(flyCam);
  flyCam.__mod = 'play:courses';

  if (ui?.notebook?.register) {
    ui.notebook.register('courses', {
      label: { ja: STR.ja['play.course.tab'], en: STR.en['play.course.tab'] },
      render(host) {
        host.replaceChildren();
        const data = store ? store.get('courses') || {} : {};
        for (const c of courses) {
          const row = data[c.id];
          const art = document.createElement('article');
          art.className = 'course-card';
          const medal = document.createElement('div');
          const kind = row?.medal;
          medal.className = 'course-medal' + (kind ? ' ' + kind : '');
          const stamp = { gold: '金', silver: '銀', bronze: '銅' };
          medal.textContent = kind ? stamp[kind] : '–';
          medal.setAttribute('role', 'img');
          medal.setAttribute('aria-label', kind ? text(ctx, 'play.kit.medal.' + kind) : text(ctx, 'play.course.none'));
          const body = document.createElement('div');
          const h = document.createElement('h3');
          h.className = 'nm';
          h.textContent = text(ctx, 'play.course.kana.' + c.mode) + '　' + text(ctx, 'play.course.' + c.id);
          const p = document.createElement('p');
          p.textContent = row?.best != null
            ? text(ctx, 'play.course.best', { time: formatTime(row.best) }) + '　' + text(ctx, 'play.course.runs', { n: row.runs || 0 })
            : text(ctx, 'play.course.none');
          body.append(h, p);
          art.append(medal, body);
          host.appendChild(art);
        }
      },
    });
  }

  try {
    const feat = ctx.services?.explore?.search?.featured?.();
    if (Array.isArray(feat)) {
      for (const c of courses) {
        feat.push({
          id: 'course-' + c.id,
          ja: STR.ja['play.course.' + c.id],
          en: STR.en['play.course.' + c.id],
          cat: 'viewpoint',
          at: [c.start.x, c.start.z],
          group: 'play',
          groupLabel: { ja: STR.ja['play.course.tab'], en: STR.en['play.course.tab'] },
        });
      }
    }
  } catch (e) { /* the gates are still in the world */ }

  function start(id, opts = {}) {
    const c = courses.find((x) => x.id === id);
    if (!c) return false;
    const to = c.mode === 'drive' ? 'drive' : c.mode === 'sail' ? 'sail' : 'fly';
    if (typeof ctx.playerObj?.allowMode === 'function' && !ctx.playerObj.allowMode(to, { via: 'hub', atPlace: true })) return false;
    if (phase === 'result') closeCard();
    hidePrompt();
    const at = opts && Number.isFinite(Number(opts.at)) ? Number(opts.at) : 0;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (at > now + 40) {
      course = c;
      phase = 'arm';
      armAt = at;
      enterMode(c);
      pin();
      setLock(true);
      world.setRun(c.id, 0);
      hud.setRacing(true);
      showQuit();
      return true;
    }
    begin(c);
    return true;
  }

  modeList = courseModeList(courses, {
    rows: rowsOf,
    strings: STR,
    start: (id) => api.start(id),
    prepare: () => world.prepare(),
  });
  modesBound = registerCourseModes(kit, modeList);

  const api = {
    courses,
    world,
    modes: modeList,
    start,
    on(ev, fn) { return bus.on(ev, fn); },
    off(ev, fn) { bus.off(ev, fn); },
    /** 'idle' | 'arm' | 'countdown' | 'live' | 'flyby' | 'result' (read-only; the together lane hides a friend's arrow by it). */
    get phase() { return phase; },
    /** [mobile-play] a run is on (armed, counting, live, or its fly-by and card) */
    get active() { return phase !== 'idle'; },
    /** [mobile-play] end the run as the quit button does (the census and the tests leave a course with it) */
    abort() { if (phase === 'result') closeCard(); if (phase !== 'idle') finishQuit(); },
  };
  ctx.services.play = Object.assign(ctx.services.play || {}, { courses: api });
  try { if (typeof window !== 'undefined') window.__race = api; } catch (e) { /* */ }
  return api;
}
