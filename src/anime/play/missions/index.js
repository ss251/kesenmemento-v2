// [play:missions] Quests, dialogue and the tracker. The kit lane calls mount(ctx, kit).
// Other lanes are reached only through the events named in docs/play/MISSIONS.md.
import * as THREE from 'three';
import QUESTS from '../../../../data/play/quests.json';
import PARTNERS from '../../../../data/play/partners.json';
import { mountNpcs } from '../npc/index.js';
import { mountUi } from './ui.js';
import { t, langOf } from './strings.js';
import {
  TALK_R, CPS, BALLOON_FAR, katsuoCount, hydrate, serialize, questById, questLog, nearest, advance, onTalk,
  acceptQuest, noteIppon, notePhoto, notePerch, noteSwim, noteRace, absorbCourses, tracker, fillWorld,
  markerFor, balloonOpacity, balloonMark, bearingDeg, stampRows, stampGlyph, forceComplete,
  balloonPx, ringWidth, markIsBang, handoffOf, countStamps, stampLine, modeIsNew, nearestBang, questMode,
} from './logic.js';
import { scriptFor, heardAmbient, openLine, stepLine, skipLine, visible, blipFor, voicePitch } from './dialogue.js';
import { sightBlocked } from './place.js';
import { presentReward, deviceIdOf, formatWhen, inkOn, glyphOnPaper } from './voucher.js';

const SIM = 0.25;

function smooth(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function reducedMotion() {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
}

function shotMode() {
  try { return new URLSearchParams(globalThis.location?.search || '').has('shot'); } catch { return false; }
}

function perfMode() {
  try { return new URLSearchParams(globalThis.location?.search || '').has('perf'); } catch { return false; }
}

/** @param {object} ctx @param {object} kit the play kit, or the local shim */
export function mount(ctx, kit) {
  if (ctx.services?.missions) {
    ctx.services.missions.adopt?.(kit);
    return ctx.services.missions;
  }
  const doc = globalThis.document;
  if (!doc?.body) return null;
  const win = globalThis;
  const reduce = reducedMotion();
  const shot = shotMode();
  const perfOn = perfMode();
  const quests = QUESTS.quests;
  const partners = PARTNERS.partners || [];
  const people = mountNpcs(ctx);
  let lang = langOf(win);
  let state = hydrate(null);
  let deviceId = deviceIdOf(null, Math.random);
  let katsuoN = 0;
  let courses = {};
  let near = null;
  let talk = null;
  let enabledWas = true;
  let dirty = false;
  let acc = 0;
  let clock = 0;
  let cardUp = false;
  let easing = 0;
  let easeT = 0;
  let lastMs = 0;
  let promptHandle = null;
  let promptNpc = null;
  let arrowHandle = null;
  const bound = { photo: false, ippon: false, gull: false, swim: false, race: false, courses: false, car: false };
  const world = { pos: { x: 0, y: 0, z: 0 } };
  const pos = { x: 0, y: 0, z: 0 };
  const _hold = new THREE.Vector3();
  const _want = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _shot = new THREE.Vector3();
  const _burst = new THREE.Vector3();
  const _arrow = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  const balloons = [];
  for (let i = 0; i < 16; i++) {
    balloons.push({
      id: '', kind: '', mark: '', x: 0, y: 0, op: 1, show: false, px: 0,
      ring: false, rx: 0, ry: 0, rw: 0, rh: 0,
    });
  }
  const fresh = {};
  const heardCourses = {};
  let trackKey = '';
  let skipChime = true;
  let padLatch = 0;
  let watch = null;
  let watchDist = 8;
  let coachOn = false;
  let coachPending = false;
  let coachAim = null;
  const ART = '/data/play/art/quests.webp';
  const _bear = { x: 0, z: 0, on: false };

  load();

  const ui = mountUi({
    doc, win, reduce, shot, lang, kit: !kit.__shim,
    onAdvance: advanceTalk,
    onChoice: choose,
    onPrompt() { if (near && canTalk()) beginTalk(near); },
    onOpenLog() {
      if (talk) endTalk();
      ui.showLog(logModel());
    },
    onLogClose() {
      if (coachPending) revealCoach();
    },
    onHubStart() {
      ui.hideHub();
      startFromHub();
    },
    onPick: pickLog,
    onCardClose() { cardUp = false; drain(); },
  });
  ui.setBook(!!kit.__shim, tr('play.quest.notebook'));

  function tr(key, vars) { return t(lang, key, vars); }

  function load() {
    try {
      const savedQ = kit.store.get('quests');
      const meta = kit.store.get('meta') || {};
      const saved = savedQ && savedQ.v === 1 && savedQ.progress ? savedQ : meta.missions;
      state = hydrate(saved);
      deviceId = deviceIdOf(meta, Math.random);
      if (!meta.deviceId) kit.store.update('meta', (m) => { m.deviceId = deviceId; return m; });
    } catch { state = hydrate(null); }
    pullStores();
  }

  function pullStores() {
    try { katsuoN = katsuoCount(kit.store.get('katsuo')); } catch { katsuoN = 0; }
    try {
      const saved = kit.store.get('courses') || {};
      const next = {};
      for (const k in heardCourses) next[k] = heardCourses[k];
      for (const k in saved) next[k] = saved[k];
      courses = next;
      absorbCourses(state, next);
    } catch { courses = {}; }
  }

  function saveIf() {
    if (!dirty) return;
    dirty = false;
    const blob = serialize(state);
    try {
      kit.store.update('meta', (m) => {
        m.missions = blob;
        if (!m.deviceId) m.deviceId = deviceId;
        return m;
      });
      kit.store.update('quests', () => blob);
    } catch { /* the memory copy still holds this session */ }
  }

  function readPos() {
    try {
      if (kit.playerPos) { kit.playerPos(pos); return; }
    } catch { /* the walker position below */ }
    const p = ctx.player?.position;
    if (p) { pos.x = p.x; pos.y = p.y; pos.z = p.z; }
  }

  function pump(now) {
    readPos();
    fillWorld(world, state, pos, katsuoN, courses, now || Date.now());
    const before = state.pending.length;
    advance(state, quests, world);
    if (state.pending.length !== before) dirty = true;
  }

  function refreshLang() {
    const next = langOf(win);
    if (next === lang) return;
    lang = next;
    ui.setLang(lang);
  }

  function canTalk() {
    if (shot) return true;
    if (cardUp || ui.isLog()) return false;
    try { if (!doc.body.classList.contains('playing') && !doc.body.classList.contains('shot')) return false; } catch { return false; }
    let mode = 'walk';
    try { mode = kit.playMode?.() || 'walk'; } catch { mode = 'walk'; }
    return mode === 'walk';
  }

  function refreshNear() {
    if (talk || cardUp) { near = null; syncPrompt(); return; }
    if (!canTalk()) { near = null; syncPrompt(); return; }
    readPos();
    near = nearest(people.list, pos.x, pos.z, TALK_R);
    syncPrompt();
  }

  function syncPrompt() {
    const show = !!(near && !talk);
    if (kit.__shim) ui.setPrompt(show, tr('play.quest.talk'));
    else ui.setPrompt(false);
    if (!show || kit.__shim) {
      promptHandle?.hide?.();
      promptHandle = null;
      promptNpc = null;
      return;
    }
    if (promptNpc === near.id) return;
    promptHandle?.hide?.();
    promptNpc = near.id;
    try {
      promptHandle = kit.ui?.prompt?.(tr('play.quest.talk'), {
        onPress: () => { if (near) beginTalk(near); },
        key: 'Enter',
      }) || null;
    } catch { promptHandle = null; }
  }

  function beginTalk(npc) {
    if (!npc || talk) return;
    dismissCoach();
    const script = scriptFor(npc, quests, state, tr);
    talk = { npc, script, page: 0, line: null };
    const body = ctx.playerObj;
    enabledWas = body ? body.enabled !== false : true;
    if (body) body.enabled = false;
    try { if (doc.pointerLockElement) doc.exitPointerLock?.(); } catch { /* no lock */ }
    showPage();
    syncPrompt();
  }

  function showPage() {
    const page = talk.script.pages[talk.page] || { text: '' };
    const instant = reduce || shot;
    talk.line = openLine(page.text, clock, { instant, cps: CPS });
    const color = talk.npc.color || '#223A70';
    ui.showPage({
      act: talk.script.act,
      role: tr(talk.npc.role),
      color,
      ink: inkOn(color),
      full: page.text,
      shown: visible(talk.line),
      done: talk.line.done,
      choices: page.choices || null,
    });
    if (instant) { try { kit.sfx?.play?.('blip', { pitch: voicePitch(talk.npc.id), gain: 0.7 }); } catch { /* mute */ } }
    talkPad(true);
  }

  function advanceTalk() {
    if (!talk?.line) return;
    if (!talk.line.done) {
      skipLine(talk.line);
      ui.paintLine(visible(talk.line), true);
      try { kit.sfx?.play?.('tap', { pitch: 0, gain: 0.3 }); } catch { /* mute */ }
      return;
    }
    const page = talk.script.pages[talk.page];
    if (page?.choices) return;
    if (talk.page + 1 < talk.script.pages.length) { talk.page++; showPage(); return; }
    finishTalk();
  }

  function finishTalk() {
    const script = talk.script;
    const npcId = talk.npc.id;
    if (script.act === 'advance' || script.act === 'deliver') {
      const q = questById(quests, script.quest);
      const p = state.progress[script.quest];
      const finished = q && p ? q.steps[p.step] : null;
      onTalk(state, quests, npcId, Date.now());
      if (handoffOf(finished) === 'ippon') {
        try { win.__ippon?.start?.(); } catch { /* the fishing lane has not exported start */ }
      }
      dirty = true;
    } else if (script.act === 'ambient' || script.act === 'done') {
      heardAmbient(state, npcId);
      dirty = true;
    }
    endTalk();
    pump(Date.now());
    saveIf();
    refreshTracker();
    drain();
  }

  function choose(choice) {
    if (!talk || !choice) return;
    if (choice.act === 'accept') {
      const q = questById(quests, choice.quest);
      if (acceptQuest(state, q, Date.now())) dirty = true;
      endTalk();
      pump(Date.now());
      saveIf();
      refreshTracker();
      drain();
      try { kit.ui?.toast?.(tr('play.quest.accepted')); } catch { /* no toast */ }
      try { kit.sfx?.play?.('stamp', { pitch: 3, gain: 0.5 }); } catch { /* mute */ }
      return;
    }
    endTalk();
  }

  function endTalk() {
    talk = null;
    ui.hideTalk();
    talkPad(false);
    const body = ctx.playerObj;
    if (body) body.enabled = !!enabledWas;
  }

  function talkPad(on) {
    const pad = ctx.pad;
    if (!pad?.registerMode || !pad.setMode) return;
    if (!on) {
      try { if (pad.mode === 'play-talk') pad.setMode(null); } catch { /* no pad */ }
      return;
    }
    try {
      pad.registerMode('play-talk', {
        stick: 'analog',
        buttons: [
          { id: 'm-up', label: { ja: 'うえ', en: 'Up' }, onDown: () => ui.moveChoice(-1) },
          { id: 'm-down', label: { ja: 'した', en: 'Down' }, onDown: () => ui.moveChoice(1) },
          { id: 'm-ok', label: { ja: '決定', en: 'OK' }, onDown: () => confirmTalk() },
        ],
      });
      pad.setMode('play-talk');
    } catch { /* the walk pad stays */ }
  }

  function confirmTalk() {
    if (!talk?.line) return;
    const page = talk.script.pages[talk.page];
    if (!talk.line.done) { advanceTalk(); return; }
    if (page?.choices?.length) { choose(page.choices[ui.choiceIndex()] || page.choices[0]); return; }
    advanceTalk();
  }

  function pollPad() {
    if (!talk?.line?.done) return;
    const page = talk.script.pages[talk.page];
    if (!page?.choices) return;
    const y = ctx.pad?.move?.y;
    if (!Number.isFinite(y) || Math.abs(y) < 0.55) return;
    if (clock - padLatch < 0.22) return;
    padLatch = clock;
    ui.moveChoice(y > 0 ? 1 : -1);
  }

  function logModel() {
    refreshLang();
    const log = questLog(quests, state);
    const row = (q, step, kind) => ({ id: q.id, title: tr(q.title), step, kind });
    return {
      title: tr('play.quest.logTitle'),
      empty: tr('play.quest.empty'),
      close: tr('play.quest.close'),
      heads: {
        active: tr('play.quest.active'),
        available: tr('play.quest.available'),
        done: tr('play.quest.done'),
      },
      active: log.active.map((q) => {
        const p = state.progress[q.id];
        const step = q.steps[p?.step];
        return row(q, step?.hint ? tr(step.hint) : '', 'active');
      }),
      available: log.available.map((q) => {
        let role = '';
        for (let i = 0; i < people.list.length; i++) if (people.list[i].id === q.giver) role = tr(people.list[i].role);
        return row(q, role, 'available');
      }),
      done: log.done.map((q) => row(q, tr(q.reward?.title || q.title), 'done')),
    };
  }

  function pickLog(id, kind) {
    if (kind === 'done') {
      const q = questById(quests, id);
      const view = q && state.rewards[id];
      if (view) { openCard(view); return; }
      if (q) openCard(presentReward(q, partners, state, Date.now(), deviceId));
      return;
    }
    if (kind === 'active') {
      skipChime = true;
      state.active = id;
      dirty = true;
      ui.hideLog();
      saveIf();
      refreshTracker();
    }
  }

  function cardModel(view) {
    const q = questById(quests, view.quest);
    let color = '#223A70';
    for (let i = 0; i < people.list.length; i++) if (people.list[i].id === q?.giver) color = people.list[i].color;
    const partner = view.partner ? partners.find((p) => p.id === view.partner) : null;
    const title = tr(view.titleKey);
    const when = formatWhen(view.at, lang);
    return {
      kind: view.kind,
      title,
      fact: view.factKey ? tr(view.factKey) : '',
      from: view.fromKey ? tr(view.fromKey) : '',
      when,
      whenLabel: tr('play.quest.voucherWhen', { when }),
      code: view.code,
      shop: partner?.shop || '',
      offer: partner ? (partner.offer?.[lang] || partner.offer?.ja || '') : '',
      terms: partner ? (partner.terms?.[lang] || partner.terms?.ja || '') : '',
      seal: Array.from(title)[0] || tr('play.quest.seal'),
      color,
      sealInk: glyphOnPaper(color),
      recruiting: tr('play.quest.recruiting'),
      showLine: tr('play.quest.voucherShow'),
      codeLabel: tr('play.quest.voucherCode'),
      rewardLabel: tr('play.quest.reward'),
      close: tr('play.quest.close'),
    };
  }

  function openCard(view) {
    cardUp = true;
    ui.showCard(cardModel(view));
    try { kit.sfx?.play?.('fanfare', { gain: 0.9 }); } catch { /* mute */ }
    try { kit.sfx?.play?.('stamp', { gain: 0.6 }); } catch { /* mute */ }
    if (!kit.__shim && kit.fx?.burst) {
      _burst.set(pos.x, pos.y + 1.2, pos.z);
      try { kit.fx.burst(_burst, 'confetti', { count: 16, scale: 1 }); } catch { /* no fx */ }
    }
    try { if (!reduce && win.navigator?.vibrate) win.navigator.vibrate(12); } catch { /* no haptics */ }
  }

  function drain() {
    if (talk || cardUp) return;
    if (!state.pending.length) return;
    const id = state.pending.shift();
    const q = questById(quests, id);
    if (!q) { drain(); return; }
    fresh[id] = 1;
    dirty = true;
    openCard(presentReward(q, partners, state, Date.now(), deviceId));
    saveIf();
  }

  function distLabel(dist) {
    if (dist == null || !Number.isFinite(dist)) return '';
    if (dist < 8) return tr('play.quest.here');
    return tr('play.quest.dist', { m: String(Math.round(dist)) });
  }

  function refreshTracker(opt) {
    const info = tracker(state, quests, people.list, world);
    const key = info ? info.quest.id + '#' + info.index : '';
    const prev = trackKey;
    const changed = !!prev && key !== prev;
    const same = !!(info && prev.startsWith(info.quest.id + '#'));
    const finished = !info && !!prev;
    if (!skipChime && changed && (same || finished)) {
      ui.flashTracker(false);
      try { kit.sfx?.play?.('chime', { pitch: 5, gain: 0.65 }); } catch { /* mute */ }
    }
    skipChime = false;
    trackKey = key;
    if (!info) {
      ui.setTracker(null);
      syncArrow(null);
      _bear.on = false;
      return;
    }
    if (info.target) { _bear.x = info.target.x; _bear.z = info.target.z; _bear.on = true; }
    else _bear.on = false;
    ui.setTracker({
      title: tr(info.quest.title),
      step: info.step?.hint ? tr(info.step.hint) : '',
      dist: distLabel(info.dist),
      lit: !!opt?.lit,
    });
    syncArrow(info.target);
  }

  function paintBearing() {
    if (!_bear.on || !ctx.camera) { ui.setBearing(null); return; }
    const e = ctx.camera.matrixWorld.elements;
    const fx = -e[8], fz = -e[10];
    ui.setBearing(bearingDeg(fx, fz, _bear.x - ctx.camera.position.x, _bear.z - ctx.camera.position.z));
  }

  function syncArrow(target) {
    const aim = coachOn && coachAim ? coachAim : target;
    if (!kit.__shim) {
      if (!aim) { arrowHandle?.hide?.(); arrowHandle = null; ui.setEdge(null); return; }
      _arrow.set(aim.x, aim.y, aim.z);
      if (!arrowHandle) {
        try { arrowHandle = kit.ui?.edgeArrow?.(() => _arrow) || null; } catch { arrowHandle = null; }
      }
      ui.setEdge(null);
      return;
    }
    ui.setEdge(edgeFor(aim));
  }

  function edgeFor(target) {
    const cam = ctx.camera;
    const canvas = ctx.renderer?.domElement;
    if (!target || !cam || !canvas) return null;
    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;
    if (w < 2 || h < 2) return null;
    _proj.set(target.x, target.y, target.z).project(cam);
    const behind = _proj.z > 1;
    const nx0 = behind ? -_proj.x : _proj.x;
    const ny0 = behind ? -_proj.y : _proj.y;
    if (!behind && nx0 >= -1 && nx0 <= 1 && ny0 >= -1 && ny0 <= 1) return null;
    const s = Math.max(Math.abs(nx0), Math.abs(ny0), 0.001);
    const nx = nx0 / s, ny = ny0 / s;
    const m = 36;
    return {
      show: true,
      x: (nx * 0.5 + 0.5) * (w - m * 2) + m,
      y: (-ny * 0.5 + 0.5) * (h - m * 2) + m,
      deg: Math.atan2(nx, ny) * 180 / Math.PI,
    };
  }

  function placeBalloons() {
    const cam = ctx.camera;
    const canvas = ctx.renderer?.domElement;
    if (!cam || !canvas) { ui.syncBalloons(balloons, 0); return; }
    const w = canvas.clientWidth || canvas.width || 0;
    const h = canvas.clientHeight || canvas.height || 0;
    let n = 0;
    for (let i = 0; i < people.list.length && n < balloons.length; i++) {
      const npc = people.list[i];
      if (talk?.npc?.id === npc.id) continue;
      const dx = npc.x - pos.x, dz = npc.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > BALLOON_FAR) continue;
      const kind = markerFor(npc, quests, state);
      if (!kind) continue;
      const op = balloonOpacity(dist, kind);
      if (op <= 0.02) continue;
      const bang = markIsBang(kind);
      const fov = cam.fov || 55;
      _proj.set(npc.x, npc.y + 2.15, npc.z).project(cam);
      if (_proj.z > 1) continue;
      const x = (_proj.x * 0.5 + 0.5) * w;
      const y = (-_proj.y * 0.5 + 0.5) * h;
      if (x < -80 || y < -80 || x > w + 80 || y > h + 80) continue;
      const slot = balloons[n];
      slot.id = npc.id;
      slot.kind = kind;
      slot.mark = balloonMark(kind);
      slot.op = op;
      slot.x = x;
      slot.y = y;
      slot.show = true;
      slot.px = bang ? balloonPx(dist, h, fov) : 0;
      slot.ring = false;
      if (bang) {
        _proj.set(npc.x, (npc.y || 0) + 0.05, npc.z).project(cam);
        if (_proj.z <= 1) {
          const rw = ringWidth(dist, h, fov);
          slot.ring = true;
          slot.rx = (_proj.x * 0.5 + 0.5) * w;
          slot.ry = (-_proj.y * 0.5 + 0.5) * h;
          slot.rw = rw;
          slot.rh = rw * 0.36;
        }
      }
      n++;
    }
    ui.syncBalloons(balloons, n);
  }

  function afterEvent() {
    dirty = true;
    pump(Date.now());
    saveIf();
    refreshTracker();
    drain();
  }

  function bindAll() {
    const w = win;
    if (!bound.photo && typeof w.__photo === 'function' && !w.__photo.__missions) {
      const prev = w.__photo;
      const wrapped = function photoWrapped(scale, opt) {
        const r = prev.call(this, scale, opt);
        try {
          const cam = ctx.camera;
          const e = cam.matrixWorld.elements;
          notePhoto(state, { x: cam.position.x, z: cam.position.z, yaw: Math.atan2(-e[8], -e[10]), t: Date.now() });
          afterEvent();
        } catch { /* no camera */ }
        return r;
      };
      wrapped.__missions = true;
      w.__photo = wrapped;
      bound.photo = true;
    }
    const ip = w.__ippon;
    if (!bound.ippon && ip && typeof ip.on === 'function') {
      ip.on('catch', (ev) => { noteIppon(state, Object.assign({ kind: 'catch' }, ev)); afterEvent(); });
      ip.on('landed', (ev) => {
        noteIppon(state, { kind: 'landed', kg: ev?.kg, count: ev?.count, cm: ev?.cm ?? ev?.biggest });
        afterEvent();
      });
      bound.ippon = true;
    }
    const gull = w.__gull;
    if (!bound.gull && gull && typeof gull.on === 'function') {
      gull.on('perch', (ev) => { notePerch(state, ev); afterEvent(); });
      bound.gull = true;
    }
    const swim = w.__swim;
    if (!bound.swim && swim && typeof swim.on === 'function') {
      swim.on('pos', (ev) => { noteSwim(state, ev); afterEvent(); });
      bound.swim = true;
    }
    const race = w.__race;
    if (!bound.race && race && typeof race.on === 'function') {
      race.on('finish', (ev) => { noteFinish(ev); });
      bound.race = true;
    }
    const coursesBus = w.__courses;
    if (!bound.courses && coursesBus && typeof coursesBus.on === 'function') {
      coursesBus.on('finish', (ev) => { noteFinish(ev); });
      bound.courses = true;
    }
    const car = w.__car;
    if (!bound.car && car && typeof car.on === 'function') {
      car.on('finish', (ev) => { noteFinish(ev); });
      bound.car = true;
    }
  }

  function noteFinish(ev) {
    const ms = ev?.ms ?? ev?.time ?? (typeof ev === 'number' ? ev : null);
    if (Number.isFinite(ms)) noteRace(state, ms);
    if (ev && ev.id && (ev.medal || Number.isFinite(ms))) {
      const prev = heardCourses[ev.id] || {};
      heardCourses[ev.id] = {
        medal: ev.medal || prev.medal || null,
        best: Number.isFinite(ms) ? (prev.best == null || ms < prev.best ? ms : prev.best) : prev.best,
      };
      pullStores();
    }
    afterEvent();
  }

  function poll() {
    const swim = win.__swim?.pos;
    if (swim && Number.isFinite(swim.x)) {
      if (!state.swim) state.swim = { x: 0, y: 0, z: 0 };
      if (state.swim.x !== swim.x || state.swim.y !== swim.y || state.swim.z !== swim.z) {
        state.swim.x = +swim.x; state.swim.y = +swim.y || 0; state.swim.z = +swim.z;
        dirty = true;
      }
    }
    const perch = win.__gull?.perch;
    if (perch && Number.isFinite(perch.x)) {
      if (!state.perch) state.perch = { x: 0, y: 0, z: 0, id: null };
      if (state.perch.x !== perch.x || state.perch.z !== perch.z || state.perch.id !== (perch.id || null)) {
        state.perch.x = +perch.x; state.perch.y = +perch.y || 0; state.perch.z = +perch.z; state.perch.id = perch.id || null;
        dirty = true;
      }
    }
  }

  function simTick(dt) {
    acc += dt || 0;
    if ((dt || 0) !== 0 && acc < SIM) return;
    acc = 0;
    refreshLang();
    bindAll();
    poll();
    refreshNear();
    pump(Date.now());
    saveIf();
    refreshTracker();
    drain();
    pollCoach();
  }

  function cameraTick(dt) {
    const cam = ctx.camera;
    if (!cam) return;
    const npc = talk?.npc;
    if (!npc && watch) {
      const fx = Math.sin(watch.yaw), fz = Math.cos(watch.yaw);
      const lx = -fz, lz = fx;
      const dist = watchDist > 1 ? watchDist : 8;
      const ox = watch.x + fx * dist, oz = watch.z + fz * dist;
      const headY = watch.y + (dist > 24 ? 1.15 : 1.5);
      let cx = ox, cz = oz;
      if (people.blocked && sightBlocked(cx, cz, watch.x, watch.z, headY, people.blocked)) {
        cx = ox + lx * 1.6; cz = oz + lz * 1.6;
        if (sightBlocked(cx, cz, watch.x, watch.z, headY, people.blocked)) {
          cx = ox - lx * 1.6; cz = oz - lz * 1.6;
        }
      }
      cam.position.set(cx, watch.y + (dist > 24 ? 3.4 : 1.7), cz);
      cam.lookAt(watch.x, headY, watch.z);
      return;
    }
    if (npc) {
      if (easing !== 1) { easing = 1; easeT = 0; _hold.copy(cam.position); }
      const step = (reduce || shot) ? 1 : dt / 0.3;
      easeT = Math.min(1, easeT + (dt === 0 ? 1 : step));
      let px = pos.x, pz = pos.z;
      const far = (npc.x - px) ** 2 + (npc.z - pz) ** 2;
      if (far > 64) {
        px = npc.x + Math.sin(npc.yaw) * 2.2;
        pz = npc.z + Math.cos(npc.yaw) * 2.2;
      }
      const mx = (px + npc.x) * 0.5, mz = (pz + npc.z) * 0.5;
      let dx = npc.x - px, dz = npc.z - pz;
      let len = Math.hypot(dx, dz);
      if (len < 0.3) { dx = Math.sin(npc.yaw); dz = Math.cos(npc.yaw); len = 1; }
      dx /= len; dz /= len;
      const bx = -dz, bz = dx;
      const y = Math.max(npc.y, pos.y) + 1.2;
      _want.set(mx + bx * 3.2, y, mz + bz * 3.2);
      if (ctx.physics?.solidAt?.(_want.x, _want.z, _want.y)) _want.set(mx - bx * 3.2, y, mz - bz * 3.2);
      // Look at the chest, not the eyes: a portrait phone then keeps the face above the window instead of filling with ceiling.
      _aim.set(npc.x, npc.y + 0.95, npc.z);
      const headY = npc.y + 1.45;
      const blocked = (ox, oz) => people.blocked ? sightBlocked(ox, oz, npc.x, npc.z, headY, people.blocked) : false;
      if (blocked(_want.x, _want.z)) {
        const altX = mx - bx * 3.2, altZ = mz - bz * 3.2;
        if (!blocked(altX, altZ)) _want.set(altX, y, altZ);
      }
      const k = (reduce || shot) ? 1 : smooth(easeT);
      cam.position.lerpVectors(_hold, _want, k);
      cam.lookAt(_aim);
      _shot.copy(cam.position);
      return;
    }
    if (easing === 1) { easing = 2; easeT = 0; _hold.copy(_shot); }
    if (easing === 2) {
      _want.copy(cam.position);
      easeT += (reduce || shot) ? 1 : dt / 0.28;
      const k = Math.min(1, easeT);
      cam.position.lerpVectors(_hold, _want, smooth(k));
      if (k >= 1) easing = 0;
    }
  }

  function drawTick(dt, t) {
    const t0 = perfOn ? performance.now() : 0;
    clock = t || clock;
    readPos();
    if (talk?.line && !talk.line.instant) {
      const prev = talk.line.shown;
      stepLine(talk.line, clock);
      const blip = blipFor(talk.line, prev, voicePitch(talk.npc.id));
      talk.line.blipped = talk.line.shown;
      if (blip && !blip.once) { try { kit.sfx?.play?.('blip', { pitch: blip.pitch, gain: 0.85 }); } catch { /* mute */ } }
      ui.paintLine(visible(talk.line), talk.line.done);
    }
    try { people.pose(dt, t || 0, talk?.npc?.id || null); } catch { /* a figure must not stop the frame */ }
    cameraTick(dt || 0);
    pollPad();
    placeBalloons();
    paintBearing();
    if (perfOn) lastMs = performance.now() - t0;
  }

  function onKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Capture runs before the kit's prompt, so a press that opens a conversation
    // does not also turn the page.
    const wasTalking = !!talk;
    if (e.key === 'Escape') {
      if (cardUp) { ui.hideCard(); e.preventDefault(); return; }
      if (ui.isLog()) { ui.hideLog(); e.preventDefault(); return; }
      if (ui.isHub()) { ui.hideHub(); e.preventDefault(); return; }
      if (coachOn) { dismissCoach(); e.preventDefault(); return; }
      if (talk) { endTalk(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!talk) return;
      const page = talk.script.pages[talk.page];
      if (!page?.choices) return;
      e.preventDefault();
      ui.moveChoice(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key !== 'Enter') return;
    if (wasTalking) {
      e.preventDefault();
      e.stopPropagation();
      const page = talk.script.pages[talk.page];
      if (talk.line && !talk.line.done) { advanceTalk(); return; }
      if (page?.choices?.length) { choose(page.choices[ui.choiceIndex()] || page.choices[0]); return; }
      advanceTalk();
      return;
    }
    if (ui.isLog() || cardUp) return;
    if (kit.__shim && near && canTalk()) {
      e.preventDefault();
      e.stopPropagation();
      beginTalk(near);
    }
  }

  function npcById(id) {
    for (let i = 0; i < people.list.length; i++) if (people.list[i].id === id) return people.list[i];
    return null;
  }

  function standAt(npc) {
    const body = ctx.playerObj;
    if (!body?.setPose || !npc) return;
    const x = npc.x + Math.sin(npc.yaw) * 2.2;
    const z = npc.z + Math.cos(npc.yaw) * 2.2;
    try { body.setPose(x, z, 0, 0, null); } catch { /* physics not ready */ }
    if (ctx.player?.position) ctx.player.position.set(x, npc.y, z);
  }

  function notebookOpen() {
    const sheet = doc.querySelector('#klc-play .sheet');
    return !!(sheet && !sheet.hidden);
  }

  function aimCoach() {
    readPos();
    const npc = nearestBang(people.list, quests, state, pos.x, pos.z);
    if (!npc) { coachAim = null; return null; }
    coachAim = { x: npc.x, y: (npc.y || 0) + 2.15, z: npc.z, id: npc.id };
    return npc;
  }

  function dismissCoach() {
    const was = coachOn;
    coachOn = false;
    coachPending = false;
    coachAim = null;
    ui.hideCoach();
    if (was) {
      arrowHandle?.hide?.();
      arrowHandle = null;
      ui.setEdge(null);
    }
  }

  function revealCoach(opt) {
    if (!opt?.force && state.coach?.['quest-talk']) { coachPending = false; return; }
    const npc = aimCoach();
    if (!npc) { coachPending = false; return; }
    coachOn = true;
    coachPending = false;
    if (!state.coach) state.coach = {};
    state.coach['quest-talk'] = 1;
    dirty = true;
    saveIf();
    const text = tr('play.quest.coach');
    let used = false;
    try {
      if (typeof kit.ui?.coach === 'function') {
        const px = { x: 0, y: 0 };
        kit.ui.coach({
          id: 'quest-talk',
          text,
          gesture: 'none',
          dim: false,
          target: () => {
            const cam = ctx.camera;
            const canvas = ctx.renderer?.domElement;
            if (!cam || !canvas || !coachAim) return px;
            _proj.set(coachAim.x, coachAim.y, coachAim.z).project(cam);
            const w = canvas.clientWidth || 1;
            const h = canvas.clientHeight || 1;
            px.x = (_proj.x * 0.5 + 0.5) * w;
            px.y = (-_proj.y * 0.5 + 0.5) * h;
            return px;
          },
        });
        used = true;
      }
    } catch { /* the kit coach is not in yet */ }
    if (!used) ui.showCoach(text);
    syncArrow(null);
  }

  function pollCoach() {
    if (!coachPending) return;
    if (notebookOpen() || ui.isLog()) return;
    revealCoach();
  }

  function startFromHub() {
    state.introduced = true;
    dirty = true;
    saveIf();
    coachPending = !state.coach?.['quest-talk'];
    aimCoach();
    let opened = false;
    try {
      if (!kit.__shim && typeof kit.ui?.notebook?.open === 'function') {
        kit.ui.notebook.open('quests');
        opened = true;
      }
    } catch { /* the notebook is not up */ }
    if (!opened) ui.showLog(logModel());
    if (coachPending && !opened && !ui.isLog()) revealCoach();
    return true;
  }

  function registerPlayMode() {
    if (registerPlayMode.done) return;
    const reg = kit.registerMode;
    if (typeof reg !== 'function') return;
    try {
      reg(questMode({
        art: ART,
        progress() {
          const n = countStamps(quests, state);
          const total = quests.length;
          return { ja: stampLine(n, total, 'ja'), en: stampLine(n, total, 'en') };
        },
        isNew() { return modeIsNew(state); },
        start() { return startFromHub(); },
      }));
      registerPlayMode.done = true;
    } catch (e) { console.error('[missions] registerMode', e); }
  }

  function hubModel() {
    const ja = lang !== 'en';
    const n = countStamps(quests, state);
    return {
      title: ja ? 'クエスト' : 'Quests',
      hook: ja ? '町の人に、話しかけよう' : 'Talk to someone in town',
      progress: stampLine(n, quests.length, ja ? 'ja' : 'en'),
      start: ja ? 'はじめる' : 'Start',
      isNew: modeIsNew(state),
      art: ART,
      chips: ja ? ['5分', '★☆☆', '1人'] : ['5 min', '★☆☆', '1'],
    };
  }

  function standOff(npc) {
    const x = npc.x + Math.sin(npc.yaw) * 14;
    const z = npc.z + Math.cos(npc.yaw) * 14;
    const face = Math.atan2(npc.x - x, npc.z - z) * 180 / Math.PI;
    const body = ctx.playerObj;
    try { body?.setPose?.(x, z, face + 110, -6, null); } catch { /* physics not ready */ }
    if (ctx.player?.position) ctx.player.position.set(x, npc.y, z);
    pos.x = x; pos.y = npc.y; pos.z = z;
    watch = null;
  }

  const api = {
    open(id) {
      const npc = npcById(id);
      if (!npc) return null;
      people.buildOne(npc);
      standAt(npc);
      if (talk) endTalk();
      beginTalk(npc);
      return npc.id;
    },
    close() { if (talk) endTalk(); ui.hideLog(); if (cardUp) ui.hideCard(); },
    accept(id) {
      const q = questById(quests, id);
      if (!q || !acceptQuest(state, q, Date.now())) return false;
      dirty = true;
      pump(Date.now());
      saveIf();
      refreshTracker();
      drain();
      return true;
    },
    complete(id) {
      const q = questById(quests, id);
      if (!q || !forceComplete(state, q, Date.now())) return false;
      dirty = true;
      saveIf();
      drain();
      return true;
    },
    card(id) {
      const q = questById(quests, id);
      if (!q) return null;
      const view = presentReward(q, partners, { rewards: {} }, Date.now(), deviceId, { preview: true });
      openCard(view);
      return view;
    },
    near(id) {
      const npc = npcById(id);
      if (!npc) return null;
      if (talk) endTalk();
      people.buildOne(npc);
      const x = npc.x + Math.sin(npc.yaw) * 20;
      const z = npc.z + Math.cos(npc.yaw) * 20;
      const body = ctx.playerObj;
      if (body?.setPose) { try { body.setPose(x, z, 0, 0, null); } catch { /* physics not ready */ } }
      if (ctx.player?.position) ctx.player.position.set(x, npc.y, z);
      pos.x = x; pos.y = npc.y; pos.z = z;
      watch = npc;
      watchDist = 8;
      return npc.id;
    },
    away(id, metres) {
      const npc = npcById(id);
      if (!npc) return null;
      if (talk) endTalk();
      people.buildOne(npc);
      const m = metres > 1 ? metres : 60;
      const x = npc.x + Math.sin(npc.yaw) * m;
      const z = npc.z + Math.cos(npc.yaw) * m;
      const body = ctx.playerObj;
      if (body?.setPose) { try { body.setPose(x, z, 0, 0, null); } catch { /* physics not ready */ } }
      if (ctx.player?.position) ctx.player.position.set(x, npc.y, z);
      pos.x = x; pos.y = npc.y; pos.z = z;
      watch = npc;
      watchDist = m;
      return npc.id;
    },
    coach(id) {
      if (talk) endTalk();
      ui.hideHub();
      ui.hideLog();
      const npc = (id && npcById(id)) || nearestBang(people.list, quests, state, pos.x, pos.z) || npcById('barista');
      if (!npc) return null;
      people.buildOne(npc);
      standOff(npc);
      watch = npc;
      watchDist = 16;
      if (state.coach) delete state.coach['quest-talk'];
      revealCoach({ force: true });
      return npc.id;
    },
    hub() {
      if (talk) endTalk();
      dismissCoach();
      ui.showHub(hubModel());
      return true;
    },
    startMode() { return startFromHub(); },
    lang(code) {
      if (code !== 'ja' && code !== 'en') return;
      lang = code;
      ui.setLang(code);
      if (talk) {
        const page = talk.page;
        talk.script = scriptFor(talk.npc, quests, state, tr);
        talk.page = Math.min(page, Math.max(0, talk.script.pages.length - 1));
        showPage();
      } else refreshTracker();
      if (coachOn && typeof kit.ui?.coach !== 'function') ui.showCoach(tr('play.quest.coach'));
      if (ui.isHub()) ui.showHub(hubModel());
    },
    flash(id) {
      watch = null;
      if (!this.accept(id)) return false;
      this.track(id);
      ui.flashTracker(true);
      return true;
    },
    park() {
      watch = null;
      if (talk) endTalk();
      ui.hideLog();
      if (cardUp) ui.hideCard();
      state.active = null;
      skipChime = true;
      refreshTracker();
    },
    log() { ui.showLog(logModel()); },
    stamps(ids) {
      const preview = {};
      const list = ids || [];
      for (let i = 0; i < list.length; i++) if (list[i]) preview[list[i]] = 1;
      openStamps(list.length ? preview : null);
    },
    track(id) {
      if (!questById(quests, id)) return false;
      if (!state.progress[id]) return false;
      state.active = id;
      dirty = true;
      saveIf();
      pump(Date.now());
      refreshTracker();
      return true;
    },
    noteRace(ms) { noteRace(state, ms); afterEvent(); },
    get state() { return state; },
    cost: () => lastMs,
    adopt(next) {
      if (!next || next === kit) return;
      kit = next;
      ui.setBook(!!kit.__shim, tr('play.quest.notebook'));
      promptHandle?.hide?.();
      promptHandle = null;
      promptNpc = null;
      arrowHandle?.hide?.();
      arrowHandle = null;
      registerTab();
      registerPlayMode();
    },
  };

  let previewFresh = true;
  let heldPreview = null;
  function stampModel(preview) {
    const rows = stampRows(quests, state, (q) => tr(q.reward?.title || q.title), fresh);
    if (preview) {
      let stamped = false;
      for (let i = 0; i < rows.length; i++) {
        if (!preview[rows[i].id]) continue;
        rows[i].got = true;
        rows[i].glyph = stampGlyph(rows[i].title);
        if (!stamped && previewFresh) { rows[i].fresh = true; stamped = true; }
      }
      if (stamped) previewFresh = false;
    }
    for (let i = 0; i < rows.length; i++) {
      const q = questById(quests, rows[i].id);
      let color = '#223A70';
      for (let k = 0; k < people.list.length; k++) if (people.list[k].id === q?.giver) color = people.list[k].color;
      rows[i].ink = glyphOnPaper(color);
    }
    let ink = false;
    for (let i = 0; i < rows.length; i++) if (rows[i].fresh) ink = true;
    if (ink) for (const k in fresh) delete fresh[k];
    return {
      title: tr('play.quest.stampsTitle'),
      lead: tr('play.quest.stampsLead'),
      close: tr('play.quest.close'),
      rows,
    };
  }

  function playInk(ink) {
    if (!ink) return;
    try { kit.sfx?.play?.('stamp', { gain: 0.72 }); } catch { /* mute */ }
  }

  function openStamps(preview) {
    if (preview) heldPreview = preview;
    const playing = !shot && doc.body.classList.contains('playing');
    if (playing && !kit.__shim && kit.ui?.notebook?.open) {
      try { kit.ui.notebook.open('stamps'); return; } catch { /* fall through to the sheet */ }
    }
    playInk(ui.showStamps(stampModel(heldPreview)));
  }

  function paintPins(g, P, opt) {
    if (!g || !P) return;
    const full = !!opt?.markers;
    const r = full ? 4.5 : 3.2;
    const W = opt?.W || 0, H = opt?.H || 0;
    g.save();
    g.fillStyle = '#F8B500';
    g.strokeStyle = '#223A70';
    g.lineWidth = full ? 1.5 : 1;
    for (let i = 0; i < people.list.length; i++) {
      const n = people.list[i];
      const xy = P(n.x, n.z);
      if (!xy || xy[0] < -8 || xy[1] < -8 || xy[0] > W + 8 || xy[1] > H + 8) continue;
      g.beginPath();
      g.arc(xy[0], xy[1], r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  function hookMap() {
    const play = ctx.services.play || (ctx.services.play = {});
    const prev = play.paintMap;
    if (prev && prev.__missions) return;
    const wrapped = (g, P, opt) => {
      if (typeof prev === 'function') prev(g, P, opt);
      paintPins(g, P, opt);
    };
    wrapped.__missions = true;
    play.paintMap = wrapped;
  }

  function registerTab() {
    try {
      kit.ui?.notebook?.register?.('quests', {
        label: tr('play.quest.tab'),
        render(el) { ui.fillLog(el, logModel()); },
      });
      kit.ui?.notebook?.register?.('stamps', {
        label: tr('play.quest.stamps'),
        render(el) { playInk(ui.fillStamps(el, stampModel(heldPreview))); },
      });
    } catch { /* the notebook is not up yet */ }
  }

  try {
    kit.store.on?.('katsuo', () => { pullStores(); afterEvent(); });
    kit.store.on?.('courses', () => { pullStores(); afterEvent(); });
  } catch { /* store has no subscriptions */ }
  registerTab();
  registerPlayMode();
  hookMap();
  try { kit.onPlayTick?.(simTick); } catch { /* no tick */ }
  ctx.onUpdate?.(drawTick);
  win.addEventListener?.('keydown', onKey, true);

  try {
    const q = new URLSearchParams(win.location?.search || '').get('missions');
    if (q === 'log') api.log();
    else if (q && q.startsWith('open:')) api.open(q.slice(5));
    else if (q && q.startsWith('card:')) api.card(q.slice(5));
    else if (q && q.startsWith('track:')) api.track(q.slice(6));
    else if (q === 'stamps' || (q && q.startsWith('stamps:'))) {
      const ids = q.startsWith('stamps:') ? q.slice(7).split(',').filter(Boolean) : [];
      api.stamps(ids);
    } else if (q && q.startsWith('near:')) api.near(q.slice(5));
    else if (q && q.startsWith('away:')) api.away(q.slice(5), 60);
    else if (q === 'coach') api.coach('barista');
    else if (q === 'hub') api.hub();
    else if (q === 'start') api.startMode();
    else if (q && q.startsWith('flash:')) api.flash(q.slice(6));
  } catch { /* no query */ }

  // [mobile-play] the figure pool: how many are built now, how many were freed (tools/anime/play-census.mjs)
  Object.defineProperty(api, 'people', { get: () => ({ built: people.built, frees: people.frees }) });
  ctx.services.missions = api;
  try { win.__missions = api; } catch { /* frozen window */ }
  return api;
}
