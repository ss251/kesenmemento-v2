// [play:ippon] 第五凪丸: board at the market quay, read the birds, spray and chum, then the 跳ね上げ.
// Facts on the bid card are the sourced example in data/play-i18n.json. The swing timing is a game.
import * as THREE from 'three';
import TEXT from '../../../../data/play-i18n.json';
import { BERTH, PLACE, buildKatsuoBoat, boatStations } from '../../world/ship/katsuo-boat.js';
import { OUTBOUND_PATH } from '../../world/ship/route.js';
import { Human } from '../../world/life/characters/human.js';
import { Driver } from '../../world/life/characters/anim.js';
import { LOOKS } from '../../world/life/cast.js';
import * as gear from '../../world/life/characters/gear.js';
import {
  CFG, inSeason, schoolsFor, poseSchools, nearestInto, helmInto, departOrder, sessionStep, createSession,
  sonar, gradeOf, strengthFromHold, strengthFromSwipe, rememberTrip, readLog,
  coachStep, coachSeenAfter, readSeen, writeSeen, readFished, markFished, noteFish,
  groundsPose, DEPART_BEAT_S, markOf, sizeClass,
  balloonPx, ringWidth, balloonOpacity,
} from './logic.js';
import { createView } from './view.js';
import { createHud } from './hud.js';
import { createSfx } from './sfx.js';
import { ui } from '../kit/ui.js';
import { registerMode } from '../kit/index.js';
import { store as kitStore } from '../kit/store.js';
import { freeTree } from '../kit/lazy.js';

const posed = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
const near = { x: 0, z: 0, d: 1e9, i: 0 };
const helm = { throttle: 0, rudder: 0, boost: false };
const input = { castOff: 0, spray: 0, bait: 0, pole: 0, lift: 0, strength: 0, lagMs: 0, ice: 0, home: 0, dock: 0, confirm: 0, finish: 0, dist: 9999, nearHome: 0, rush: 0 };
const out = {};
const catchEv = { cm: 0 };
const landEv = { kg: 0, count: 0, biggest: 0 };
const blips = [{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }];
const shipP = { x: 0, z: 0, yaw: 0, y: 0 };
const vis = { ship: shipP, schools: posed, nSchools: 0, nabura: 0, phase: 'quay', spray: 0, baitPulse: 0, fishN: 0, dist: 9999, near: 0, t: 0, aboard: 0, ownCam: 0, flyStart: 0, justLanded: 0, perfect: 0, previewArc: 0, firstCatch: 0, look: '', kick: 0 };
const hudState = { on: 0, lang: 'ja', kg: 0, holdKg: 0, combo: 0, echo: 0, blips, phase: 'quay', note: '', far: 0, coarse: 0, holdN: 0, nearHome: 0, biggest: 0, grade: '', book: 0, log: null, coach: '', sprayOn: 0, cdBait: 0, cdSpray: 0, cdIce: 0, dt: 0 };
const _head = new THREE.Vector3();
const ownCam = () => true;
function clock(q) {
  const m = Number(q.get('month'));
  const d = Number(q.get('day'));
  return { m: m >= 1 && m <= 12 ? m : 10, d: d >= 1 && d <= 31 ? d : 10 };
}

export function mountIppon(ctx) {
  if (ctx.services?.ippon) return ctx.services.ippon;
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  if (q.get('play') === '0') return null;
  const sail = ctx.services?.sail;
  if (!sail?.registerBoat) return null;

  const built = buildKatsuoBoat(ctx);
  const stations = built.stations || boatStations();
  sail.registerBoat('katsuo', { group: built.group, berth: BERTH, home: BERTH });

  const when = clock(q);
  const seasonOn = inSeason(when.m, when.d);
  let reduced = q.get('reduce') === '1', coarse = false;
  try { reduced = reduced || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* node */ }
  try { coarse = matchMedia('(pointer: coarse)').matches || q.get('touch') === '1'; } catch { /* node */ }

  const perfOn = q.get('perf') === '1';
  const cost = new Float64Array(180);
  let ci = 0;
  const view = createView(ctx, stations, { phone: !!ctx.quality?.phone, reduced });
  const hud = createHud(ctx);
  const sfx = createSfx(ctx);
  const rng = ctx.rng ? ctx.rng('ippon-fish') : Math.random;
  const session = createSession();
  const listeners = { catch: new Set(), landed: new Set() };
  const keys = new Set();
  let sprayOn = false, showBook = false, saved = false, camOn = false, mode = null, pads = false;
  let toGround = false, baitReady = false, baitSpent = false, baitArm = false, routeRec = null;
  let downAt = 0, downY = 0, lastY = 0, swipe = 0, swingAt = 0, wasSwing = false, note = '', noteT = 0;
  let flapIn = 0, hissAt = 0, birdAt = 0, counter = null, counterB = null, counterN = -1, toastCm = 0;
  let lock = q.get('frame') || null;
  const store = () => { try { return localStorage; } catch { return { getItem: () => null, setItem() {} }; } };
  let seen = readSeen(store());
  let ipponMem = readLog(store());
  let baited = false, sprayed = false, poled = false;
  let departing = false, departT = 0, talking = false, resultsOn = false;
  let freeze = 0, pendingStamp = null, praiseAt = 0, shotCoach = '', forceCluster = false;
  let coachShown = '', coachHandle = null, baitCd = 0, iceCd = 0, resultsGen = 0, lastActs = null, actHandle = null;
  let captain = null, captainFailed = false, capScreen = null, talkOn = false, talkHandle = null, fished = readFished(store());
  const COACH_IDS = ['birds', 'bait', 'spray', 'pole', 'swipe', 'praise'];
  let prevKitSeen = {};
  try { prevKitSeen = { ...(kitStore.get('meta').seen || {}) }; } catch { /* notebook not up */ }
  for (const id of COACH_IDS) if (prevKitSeen['ippon-' + id] && !seen[id]) seen = coachSeenAfter(seen, id);

  function emit(name, ev) { const set = listeners[name]; if (!set) return; for (const fn of set) { try { fn(ev); } catch (e) { console.error(e); } } }
  function lang() { return ctx.services.life?.hud?.i18n?.lang || (q.get('lang') === 'en' ? 'en' : 'ja'); }
  function say(key) { note = (TEXT[lang()] || TEXT.ja)[key] || key; noteT = 3.2; }
  function T(key) { return (TEXT[lang()] || TEXT.ja)[key] || key; }
  function coachBag() {
    return { phase: departing ? 'depart' : session.phase, holdN: session.holdN, firstFish: session.firstFish, baited, sprayed, poled };
  }
  function live(a) {
    if (shotCoach) return true;
    const step = coachStep(seen, coachBag());
    if (!step || seen.done) return true;
    if (a === 'port' || a === 'home' || a === 'finish' || a === 'town' || a === 'again') return true;
    if (step === 'bait') return a === 'bait';
    if (step === 'spray') return a === 'spray';
    if (step === 'pole') return a === 'pole';
    if (step === 'swipe') return a === 'pull';
    return a === 'port';
  }
  function kitLive() { return typeof document !== 'undefined' && !!document.getElementById('klc-play'); }
  function persistIppon() {
    const storage = store();
    let o = {};
    try { o = JSON.parse(storage.getItem('klc.play.v1') || '{}') || {}; } catch { o = {}; }
    const prev = o.ippon || {};
    const mem = ipponMem || {};
    o.ippon = {
      trips: mem.trips || prev.trips || 0,
      kg: mem.kg || prev.kg || 0,
      biggest: mem.biggest || prev.biggest || 0,
      n: mem.n || prev.n || 0,
      seen: { ...seen },
    };
    if (mem.last || prev.last) o.ippon.last = mem.last || prev.last;
    if (mem.fished || prev.fished) o.ippon.fished = mem.fished || prev.fished;
    if (!o.v) o.v = 1;
    try { storage.setItem('klc.play.v1', JSON.stringify(o)); } catch { /* private mode */ }
    ipponMem = o.ippon;
  }
  try {
    kitStore.on('meta', (meta) => {
      const next = (meta && meta.seen) || {};
      const lost = COACH_IDS.some((id) => prevKitSeen['ippon-' + id] && !next['ippon-' + id]);
      const still = COACH_IDS.some((id) => next['ippon-' + id]);
      prevKitSeen = { ...next };
      const emptyPlay = !meta.played || !Object.keys(meta.played).length;
      const wiped = !meta.firstRun && !meta.hubOpened && emptyPlay && !Object.keys(next).length && meta.sound == null;
      if (wiped) {
        ipponMem = { trips: 0, kg: 0, biggest: 0, n: 0, seen: {} };
        seen = {};
        return;
      }
      if (lost && !still) {
        seen = {};
        coachShown = '';
        try { coachHandle?.hide?.(); } catch { /* */ }
        coachHandle = null;
      }
      persistIppon();
    });
  } catch { /* the notebook still works in memory */ }
  function coachTarget(id) {
    return () => {
      if (id === 'bait' || id === 'spray' || id === 'pole') {
        const b = document.querySelector('#klc-play .cluster [data-id="' + id + '"]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
      }
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 800;
      if (id === 'birds') {
        const radar = document.querySelector('#klc-ippon .radar');
        if (radar && !radar.hidden) {
          const r = radar.getBoundingClientRect();
          return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.4 };
        }
      }
      if (id === 'swipe') return { x: w * 0.5, y: h * 0.62 };
      return { x: w * 0.5, y: h * 0.34 };
    };
  }
  function showCoach(id) {
    if (!id) {
      coachShown = '';
      if (coachHandle) { try { coachHandle.hide(); } catch { /* */ } coachHandle = null; }
      return;
    }
    if (!kitLive()) return;
    if (coachShown === id && coachHandle) return;
    if (coachHandle) { try { coachHandle.hide(); } catch { /* */ } coachHandle = null; }
    coachShown = id;
    const gesture = id === 'swipe'
      ? ((coarse || ctx.pad?.active) ? 'swipe' : 'tap')
      : (id === 'birds' || id === 'praise' ? 'none' : 'tap');
    const key = id === 'swipe'
      ? ((coarse || ctx.pad?.active) ? 'play.ippon.coach.swipe' : 'play.ippon.coach.click')
      : 'play.ippon.coach.' + id;
    try {
      coachHandle = ui.coach({
        id: 'ippon-' + id,
        text: T(key),
        gesture,
        target: coachTarget(id),
        dim: true,
        force: !!shotCoach,
      });
    } catch { coachHandle = null; }
  }
  function markSeen(id) {
    if (!id || seen[id] || seen.done) return;
    seen = coachSeenAfter(seen, id);
    try { writeSeen(store(), seen); } catch { /* private mode */ }
    if (coachShown === id) {
      const h = coachHandle;
      coachShown = '';
      coachHandle = null;
      try { h?.done?.(); } catch { /* */ }
    }
  }
  const ACT = {
    pole: { icon: 'pole', key: 'Space', cooldownMs: 0, primary: true },
    bait: { icon: 'bait', key: 'KeyE', cooldownMs: 1400 },
    spray: { icon: 'spray', key: 'KeyR', cooldownMs: 0 },
    ice: { icon: 'ice', key: 'KeyC', cooldownMs: 800 },
    port: { icon: 'back', key: '', cooldownMs: 0 },
  };
  function actionIds() {
    if (talking || resultsOn) return [];
    const phase = session.phase;
    if (phase === 'pole' || phase === 'swing' || phase === 'done' || phase === 'auction' || phase === 'quay') return [];
    const onBoat = (sail.active && sail.boatId === 'katsuo') || !!forceCluster || !!shotCoach;
    if (!onBoat) return [];
    if (shotCoach === 'bait' || shotCoach === 'spray' || shotCoach === 'pole') return [shotCoach];
    if (shotCoach) return [];
    if (phase === 'run' || phase === 'return' || departing) return ['port'];
    const step = forceCluster ? '' : coachStep(seen, coachBag());
    if (step === 'bait' || step === 'spray' || step === 'pole') return [step];
    if (step === 'birds' || step === 'praise' || step === 'swipe') return [];
    if (phase !== 'work') return ['port'];
    const ids = ['pole', 'bait', 'spray'];
    if (session.holdN > 0) ids.push('ice');
    ids.push('port');
    return ids;
  }
  function syncActions() {
    if (!kitLive()) { lastActs = null; return; }
    const ids = actionIds();
    const key = ids.join(',') + '|' + lang();
    if (key === lastActs) return;
    lastActs = key;
    const list = ids.map((id) => ({
      id,
      icon: ACT[id].icon,
      label: T(id === 'port' ? 'play.ippon.port' : 'play.ippon.' + id),
      key: ACT[id].key || undefined,
      primary: !!ACT[id].primary,
      cooldownMs: ACT[id].cooldownMs,
      onPress: () => act(id),
    }));
    try { actHandle = ui.actions(list); } catch { actHandle = null; }
  }
  function showResults(o) {
    if (!kitLive()) return;
    for (const el of document.querySelectorAll('#klc-play .toast')) el.remove();
    const hanko = document.querySelector('#klc-play .floathanko');
    if (hanko) { hanko.hidden = true; hanko.classList.remove('in'); }
    const gen = ++resultsGen;
    const n = o.n | 0;
    const kg = (Number(o.kg) || 0).toFixed(1);
    const cm = Math.round(Number(o.biggest) || 0);
    const L = lang();
    const stats = L === 'ja'
      ? n + '本・合計' + kg + 'kg・最大' + cm + 'cm'
      : n + ' fish · ' + kg + ' kg in all · best ' + cm + ' cm';
    const bid = T('play.ippon.auction.title') + '　' + (o.bid || '');
    const SEAL = { yu: '優', ryo: '良', ka: '可' };
    ui.resultCard({
      title: T('play.ippon.tab'),
      grade: SEAL[o.mark] || '可',
      extra: stats + '　' + bid,
      quitLabel: T('play.ippon.town'),
      onRetry: () => { if (gen === resultsGen) o.onAgain?.(); },
      onQuit: () => { if (gen === resultsGen) o.onTown?.(); },
    });
  }
  function hideResults() {
    const veil = typeof document !== 'undefined' ? document.querySelector('#klc-play .veil.results') : null;
    if (!veil || veil.hidden) { resultsGen++; return; }
    resultsGen++;
    const quit = veil.querySelector('[data-act="quit"]');
    if (quit) quit.click();
  }
  function juice(name) {
    if (!kitLive()) return;
    for (const el of document.querySelectorAll('#klc-play .toast.ono')) el.remove();
    if (name === 'catch') {
      ui.toast(T('play.ippon.zab'), { ono: true });
      ui.stamp(T('play.ippon.got'));
    } else if (name === 'stamp') ui.stamp(T('play.ippon.got'));
  }
  function resetTrip() {
    const fresh = createSession();
    for (const k of Object.keys(session)) delete session[k];
    Object.assign(session, fresh);
    saved = false; sprayOn = false; showBook = false;
    baitReady = false; baitSpent = false; baitArm = false; routeRec = null;
    baited = false; sprayed = false; poled = false;
    departing = false; departT = 0; resultsOn = false; pendingStamp = null; praiseAt = 0;
    hideResults();
  }

  function release() {
    if (!downAt) return;
    const held = (performance.now() - downAt) / 1000;
    if (session.phase === 'swing') {
      input.lift = 1;
      let strength = Math.max(strengthFromHold(held), strengthFromSwipe(swipe));
      if (session.big && strength >= 0.45) strength = 0.72 + (strength - 0.45) * 0.85;
      input.strength = strength;
      input.lagMs = swingAt ? performance.now() - swingAt : held * 1000;
    }
    downAt = 0; swipe = 0;
  }

  function board() {
    const voyage = ctx.services.ship?.voyage;
    if (voyage?.active) return false;
    if (sail.active && sail.boatId === 'shofuku') return false;
    try { ctx.services.explore?.drive?.active && ctx.services.explore.drive.exit(); } catch { /* */ }
    const fresh = createSession();
    for (const k of Object.keys(session)) delete session[k];
    Object.assign(session, fresh);
    saved = false; sprayOn = false; showBook = false;
    toGround = false; baitReady = false; baitSpent = false; baitArm = false; routeRec = null;
    baited = false; sprayed = false; poled = false;
    departing = false; departT = 0; resultsOn = false;
    session.firstFish = readFished(store()) ? 0 : 1;
    sail.enter({ boat: 'katsuo', autopilot: false });
    input.castOff = 1;
    return true;
  }

  function openTalk() {
    talking = true;
    showCoach(null);
    hud.dialogue({
      show: true,
      who: T('play.ippon.captain'),
      line: T('play.ippon.hello'),
      go: T('play.ippon.depart'),
      onGo: depart,
    });
  }

  // [mobile-play] A trip started from the town (the captain, the prompt, a mission, the places list) goes in behind the hub's
  // wipe and title card while its meshes build, as はじめる does; the hub's own start arrives here with them ready.
  function start() {
    const aboard = sail.active && sail.boatId === 'katsuo';
    if (!aboard && typeof ctx.playerObj?.allowMode === 'function' && !ctx.playerObj.allowMode('ippon', { via: 'hub' })) return false;
    if (!view.ready && !aboard && typeof ui.run === 'function' && kitLive()) {
      ui.run({ id: 'ippon', title: modeSpec.title, hook: modeSpec.hook, prepare: () => view.prepare(), start: () => { startNow(); } });
      return true;
    }
    return startNow();
  }
  function startNow() {
    const go = () => { if (board()) openTalk(); };
    if (talking && sail.active && sail.boatId === 'katsuo') { openTalk(); return true; }
    try { if (ctx.veil?.cut) { ctx.veil.cut(go); return true; } } catch { /* no veil */ }
    go();
    return true;
  }

  function depart() {
    talking = false;
    hud.dialogue({ show: false });
    toGround = true;
    departing = 'beat';
    departT = 0;
    sfx.horn();
  }

  function againAtGrounds() {
    resetTrip();
    session.firstFish = 0;
    const pose = groundsPose(schoolsFor(seasonOn)[0]);
    if (!sail.active || sail.boatId !== 'katsuo') sail.enter({ boat: 'katsuo', x: pose.x, z: pose.z, yaw: pose.yaw, autopilot: false });
    else sail.setPose(pose.x, pose.z, pose.yaw);
    session.phase = 'work';
    session.nabura = 0.22;
    input.castOff = 0;
  }

  function toTown() {
    resetTrip();
    session.phase = 'quay';
    try { sail.setPose(BERTH.x, BERTH.z, BERTH.yaw); } catch { /* */ }
    try { sail.exit(); } catch { /* already off */ }
  }

  function act(a) {
    if (a === 'board' || a === 'talk') return start();
    if (a === 'book') { showBook = !showBook; return; }
    if (a === 'ground' && seasonOn && !toGround) { toGround = true; departing = 'beat'; departT = 0; say('play.ippon.outbound'); }
    if (a === 'ready' && seasonOn && !baitReady) { baitReady = true; sfx.ready(); say('play.ippon.baitDone'); }
    if (a === 'depart') return depart();
    if (a === 'bait' && live('bait')) { input.bait = 1; baited = true; baitCd = 1; markSeen('bait'); }
    if (a === 'spray' && live('spray')) {
      sprayOn = !sprayOn;
      if (sprayOn) { sprayed = true; markSeen('spray'); }
    }
    if (a === 'pole' && live('pole')) input.pole = 1;
    if (a === 'ice' && live('ice')) { input.ice = 1; iceCd = 1; }
    if (a === 'home') input.home = 1;
    if (a === 'port' || a === 'finish') input.finish = 1;
    if (a === 'dock') input.dock = 1;
    if (a === 'again') againAtGrounds();
    if (a === 'town') toTown();
    if (a === 'confirm') input.confirm = 1;
    if (a === 'pull' && session.phase === 'swing' && live('pull')) {
      input.lift = 1; input.strength = session.big ? 0.84 : 0.62; input.lagMs = swingAt ? performance.now() - swingAt : 200;
    }
  }
  hud.on.act = act;

  function syncPad() {
    const pad = ctx.pad;
    if (!pad?.registerMode || ctx.services.ship?.voyage?.active) return;
    if (!pads) {
      try {
        pad.registerMode('ippon-run', { stick: 'analog', buttons: [] });
        pad.registerMode('ippon-work', { stick: 'analog', buttons: [] });
        pad.registerMode('ippon-pole', { stick: 'none', buttons: [] });
        pads = true;
      } catch (e) { console.warn('[ippon] pad', e); pads = true; return; }
    }
    const onBoat = sail.active && sail.boatId === 'katsuo';
    let want = null;
    if (onBoat && (session.phase === 'run' || session.phase === 'return')) want = 'ippon-run';
    else if (onBoat && session.phase === 'work') want = 'ippon-work';
    else if (onBoat && (session.phase === 'pole' || session.phase === 'swing')) want = 'ippon-pole';
    if (want !== mode) { mode = want; try { pad.setMode(want); } catch { /* voyage owns it */ } }
  }

  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (!sail.active || sail.boatId !== 'katsuo') return;
      keys.add(e.code);
      if (e.code === 'Enter' && !resultsOn) { if (session.phase === 'return' && input.nearHome) input.dock = 1; else input.home = 1; }
      if (e.code === 'Escape') {
        if (resultsOn) return;
        e.preventDefault();
        if (talking) { talking = false; hud.dialogue({ show: false }); try { sail.exit(); } catch { /* */ } session.phase = 'quay'; }
        else input.finish = 1;
      }
      if (e.code === 'Space' && (session.phase === 'swing' || session.phase === 'pole')) { downAt = performance.now(); e.preventDefault(); }
    }, true);
    addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'Space') release(); }, true);
    addEventListener('pointerdown', (e) => {
      if (capScreen && !talking && !(sail.active && sail.boatId === 'katsuo') && session.phase !== 'swing') {
        const dx = e.clientX - capScreen.x, dy = e.clientY - capScreen.y;
        if (dx * dx + dy * dy < 64 * 64 && !e.target?.closest?.('button, a, input')) { start(); return; }
      }
      if (session.phase !== 'swing' && session.phase !== 'pole') return;
      const btn = e.target?.closest?.('button');
      if (btn && btn.dataset.a !== 'pull') return;
      downAt = performance.now(); downY = e.clientY; lastY = e.clientY; swipe = 0;
    });
    addEventListener('pointermove', (e) => { if (downAt) lastY = e.clientY; });
    addEventListener('pointerup', (e) => {
      if (!downAt) return;
      const dt = Math.max(1, performance.now() - downAt) / 1000;
      swipe = (downY - (e.clientY || downY)) / dt;
      release();
    });
    addEventListener('touchend', (e) => {
      if (!downAt) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dt = Math.max(1, performance.now() - downAt) / 1000;
      swipe = (downY - t.clientY) / dt;
      release();
    }, { passive: true });
  }

  ctx.onStep((dt, t) => {
    const list = schoolsFor(seasonOn);
    const n = poseSchools(list, t, posed);
    view.placeBirds(posed, n, session.nabura);
    const onBoat = sail.active && sail.boatId === 'katsuo';
    if (!onBoat) {
      if (!sail.active && session.phase !== 'done' && session.phase !== 'auction' && session.phase !== 'quay') session.phase = 'quay';
      input.castOff = input.bait = input.pole = input.lift = input.ice = input.home = input.dock = input.confirm = input.finish = input.rush = 0;
      return;
    }
    const st = sail.state;
    nearestInto(st.x, st.z, posed, n, near);
    input.dist = near.d;
    input.spray = sprayOn ? 1 : 0;
    input.nearHome = Math.hypot(st.x - BERTH.x, st.z - BERTH.z) < BERTH.ashore ? 1 : 0;
    input.rush = (keys.has('KeyW') || keys.has('ArrowUp')) && Math.abs(st.u) > 1.8 ? 1 : 0;
    const wantedPole = input.pole;
    if (session.phase === 'work' && baitReady && !baitSpent && baitArm) {
      input.bait = 1;
      baitSpent = true;
      say('play.ippon.baitOn');
    }
    if (input.bait && session.phase !== 'run' && session.phase !== 'quay') vis.baitPulse = 1;
    if (input.ice) sfx.ice();
    const sim = freeze > 0 ? 0 : dt;
    if (lock && !input.lift) out.event = null;
    else sessionStep(session, input, sim, CFG, rng, out);
    input.castOff = input.bait = input.pole = input.lift = input.ice = input.home = input.dock = input.confirm = input.finish = input.rush = 0;
    if (session.phase === 'work' && baitReady && !baitSpent) baitArm = true;
    if (out.event === 'catch') {
      catchEv.cm = out.cm;
      emit('catch', catchEv);
      sfx.splash();
      sfx.chime(session.combo);
      vis.flyStart = 1; vis.justLanded = 1; vis.firstCatch = session.holdN === 1 ? 1 : 0;
      vis.perfect = session.quality === 'perfect' ? 1 : 0;
      toastCm = out.cm;
      if (!reduced) { freeze = 0.06; vis.kick = 1; }
      try { ui.toast(T('play.ippon.zab'), { ono: true }); } catch { /* kit not up */ }
      pendingStamp = { cm: out.cm, kg: out.kg, size: out.size || sizeClass(out.cm) };
      if (session.holdN === 1) markSeen('swipe');
      if (!fished) {
        fished = true;
        try {
          const ip = markFished(store());
          if (ip) ipponMem = Object.assign({}, ipponMem, ip, { seen: { ...seen } });
        } catch { /* */ }
      }
      try {
        const row = noteFish(store(), out.cm);
        const id = 'katsuo-' + (out.size || sizeClass(out.cm));
        kitStore.update('fish', (d) => {
          const prev = d[id] && typeof d[id] === 'object' ? d[id] : { n: 0, maxCm: null, first: null };
          d[id] = row
            ? { n: row.n | 0, maxCm: row.maxCm ?? null, first: row.first || prev.first || null }
            : prev;
        });
        persistIppon();
      } catch { /* private mode */ }
    } else if (out.event === 'set') { sfx.set(); say('play.ippon.big'); }
    else if (out.event === 'miss') { sfx.miss(); say('play.ippon.miss'); }
    else if (out.event === 'spook') { sprayOn = false; say('play.ippon.spook'); }
    else if (out.event === 'scatter') { sprayOn = false; say('play.ippon.disperse'); }
    else if (out.event === 'landed' && !saved) {
      saved = true;
      landEv.kg = out.kg; landEv.count = out.count; landEv.biggest = out.biggest;
      emit('landed', landEv);
      ipponMem = rememberTrip(store(), { kg: out.kg, n: out.count, biggest: out.biggest, at: '2026-10-' + String(when.d).padStart(2, '0') }) || ipponMem;
      sfx.bell();
      if (!fished) {
        fished = true;
        try {
          const ip = markFished(store());
          if (ip) ipponMem = Object.assign({}, ipponMem, ip, { seen: { ...seen } });
        } catch { /* */ }
      }
    }
    if (wantedPole && session.phase === 'pole') { poled = true; markSeen('pole'); }
    else if (wantedPole && session.phase === 'work') say('play.ippon.need');
    if (session.swing && !wasSwing) {
      wasSwing = true; swingAt = performance.now();
      if (downAt) { downAt = swingAt; downY = lastY; }
      sfx.cue(); say(session.big ? 'play.ippon.big' : 'play.ippon.came');
    }
    if (!session.swing) wasSwing = false;
    const poling = session.phase === 'pole' || session.phase === 'swing';
    const shotCam = /^(swing|deck|spray|pov|apex|nabura|crew|catch|stamp|actions|coach-)/.test(lock || '');
    const wantCam = !!(poling || shotCam);
    if (wantCam !== camOn) { camOn = wantCam; sail.hold(wantCam); sail.setCam(wantCam ? ownCam : null); }
    const mv = ctx.pad?.active ? ctx.pad.move : null;
    const steer = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD')
      || keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight')
      || (mv && (Math.abs(mv.x) > 0.08 || Math.abs(mv.y) > 0.08));
    if (lock || steer || poling) sail.guide(null);
    else if (seasonOn && session.phase === 'run' && toGround) {
      const order = departOrder(st, near, routeRec, dt);
      routeRec = order.rec;
      helm.throttle = order.throttle; helm.rudder = order.rudder; helm.boost = !!order.boost;
      sail.guide(helm);
    } else if (seasonOn && session.phase === 'run') sail.guide(null);
    else if (session.phase === 'run' || session.phase === 'work') {
      helmInto(st, near, { work: session.phase === 'work' || near.d < CFG.workRadius + 20 }, helm);
      sail.guide(helm);
    } else if (session.phase === 'return') {
      helmInto(st, BERTH, {}, helm);
      sail.guide(helm);
    } else sail.guide(null);
    if (departing === 'beat') {
      departT += dt;
      if (departT >= DEPART_BEAT_S) {
        departing = 'cut';
        const pose = groundsPose(schoolsFor(seasonOn)[0]);
        const drop = () => {
          try { sail.setPose(pose.x, pose.z, pose.yaw); } catch { /* */ }
          session.phase = 'work';
          session.nabura = 0.18;
          departing = false;
          markSeen('birds');
        };
        try { if (ctx.veil?.cut) ctx.veil.cut(drop); else drop(); } catch { drop(); }
      }
    }
    if (noteT > 0) noteT -= dt; else note = '';
    vis.t = t;
  });

  let boardShown = null, boardLang = '';
  ctx.onUpdate((dt, t) => {
    const tCost = perfOn ? performance.now() : 0;
    const onBoat = sail.active && sail.boatId === 'katsuo';
    const st = sail.state;
    if (onBoat) { shipP.x = st.x; shipP.z = st.z; shipP.yaw = st.yaw; }
    else { shipP.x = BERTH.x; shipP.z = BERTH.z; shipP.yaw = BERTH.yaw; }
    const list = schoolsFor(seasonOn);
    vis.nSchools = poseSchools(list, t || vis.t, posed);
    nearestInto(shipP.x, shipP.z, posed, vis.nSchools, near);
    vis.nabura = session.nabura; vis.phase = session.phase; vis.spray = sprayOn && (onBoat || lock === 'spray' || lock === 'pov' || lock === 'nabura' || lock === 'crew' || lock === 'apex') ? 1 : 0;
    vis.fishN = session.holdN; vis.dist = near.d; vis.near = near.i;
    const shotCam = /^(swing|deck|spray|pov|apex|nabura|crew|catch|stamp|actions|coach-)/.test(lock || '');
    vis.aboard = onBoat || shotCam ? 1 : 0;
    vis.ownCam = (camOn || shotCam) ? 1 : 0;
    vis.look = lock || '';
    if (lock === 'swing' || lock === 'catch') vis.previewArc = 0.42;
    else if (lock === 'apex' || lock === 'stamp') vis.previewArc = 0.92;
    else vis.previewArc = 0;
    if (freeze > 0) {
      freeze = Math.max(0, freeze - (dt || 0));
      vis.kick = reduced ? 0 : freeze / 0.06;
    } else vis.kick = 0;
    view.update(vis, freeze > 0 ? 0 : (dt || 0));
    if (view.tookDeck) {
      sfx.thud(); flapIn = 0.1;
      if (pendingStamp) {
        try { ui.stamp(T('play.ippon.got')); } catch { /* kit not up */ }
        pendingStamp = null;
      }
    }
    if (flapIn > 0) { flapIn -= dt || 0; if (flapIn <= 0) { sfx.flap(); flapIn = 0; } }
    if (vis.spray && (t || 0) - hissAt > 1.7) { hissAt = t || 0; sfx.hiss(); }
    if (session.nabura > 0.5 && (t || 0) - birdAt > 2.3) { birdAt = t || 0; sfx.bird(); }
    vis.flyStart = 0; vis.justLanded = 0; vis.firstCatch = 0; vis.baitPulse = 0;

    const L = lang();
    if (toastCm) {
      const word = (TEXT[L] || TEXT.ja)['play.ippon.fish'] || '';
      const extra = session.combo > 1 ? ' · ' + session.combo + ((TEXT[L] || TEXT.ja)['play.ippon.combo'] || '') : '';
      try { ui.toast(word + toastCm + 'cm' + extra); } catch { /* kit not up */ }
      toastCm = 0;
    }
    hudState.on = onBoat || session.phase === 'done' || session.phase === 'auction' ? 1 : 0;
    hudState.lang = L; hudState.kg = session.holdKg; hudState.combo = session.combo;
    hudState.echo = sonar(near.d, session.nabura); hudState.phase = session.phase;
    const T = TEXT[L] || TEXT.ja;
    const steady = note || (seasonOn && session.phase === 'run' && toGround ? T['play.ippon.outbound'] : '')
      || (seasonOn && session.phase === 'run' && !toGround ? T['play.ippon.cast'] : '');
    hudState.note = steady; hudState.far = seasonOn ? 0 : 1; hudState.coarse = (coarse || ctx.pad?.active) ? 1 : 0;
    hudState.season = seasonOn ? 1 : 0; hudState.toGround = toGround ? 1 : 0; hudState.baitReady = baitReady ? 1 : 0;
    hudState.warm = seasonOn && toGround && session.phase === 'run' ? 1 : 0;
    hudState.holdKg = session.holdKg;
    hudState.holdN = session.holdN; hudState.nearHome = input.nearHome;
    hudState.sprayOn = sprayOn ? 1 : 0;
    hudState.dt = dt || 0;
    if (baitCd > 0) baitCd = Math.max(0, baitCd - (dt || 0) / 1.4);
    if (iceCd > 0) iceCd = Math.max(0, iceCd - (dt || 0) / 0.8);
    hudState.cdBait = baitCd; hudState.cdIce = iceCd; hudState.cdSpray = sprayOn ? 0 : 0;
    const stepNow = forceCluster ? '' : (shotCoach || coachStep(seen, coachBag()));
    hudState.coach = stepNow || '';
    hudState.biggest = session.biggest; hudState.grade = session.grade || (session.phase === 'auction' ? gradeOf({ n: session.holdN, kg: session.holdKg, fresh: session.fresh }) : '');
    hudState.book = showBook ? 1 : 0; hudState.log = showBook ? readLog(store()) : hudState.log;
    for (let i = 0; i < 3; i++) {
      const o = blips[i];
      const s = posed[i];
      if (i >= vis.nSchools) { o.on = 0; continue; }
      const dx = s.x - shipP.x, dz = s.z - shipP.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= CFG.seeBirds || dist < 1) { o.on = 0; o.u = 0; o.v = 0; continue; }
      o.on = 1;
      o.u = (Math.cos(shipP.yaw) * dx - Math.sin(shipP.yaw) * dz) / dist;
      o.v = (Math.sin(shipP.yaw) * dx + Math.cos(shipP.yaw) * dz) / dist;
    }
    hud.update(hudState);
    syncActions();
    if (shotCoach) showCoach(shotCoach);
    else if (stepNow && stepNow !== coachShown && !talking && session.phase !== 'done') {
      showCoach(stepNow);
      if (stepNow === 'praise') praiseAt = performance.now();
    } else if (!stepNow && coachShown) showCoach(null);
    if (stepNow === 'praise' && praiseAt && performance.now() - praiseAt > 2200) {
      markSeen('praise');
      praiseAt = 0;
    }
    if ((session.phase === 'done' || session.phase === 'auction') && !resultsOn && !lock) {
      resultsOn = true;
      const mark = session.mark || markOf({ n: session.holdN, kg: session.holdKg, biggest: session.biggest });
      showResults({
        n: session.holdN, kg: session.holdKg, biggest: session.biggest, mark,
        bid: T['play.ippon.auction.example'] + ' ' + T['play.ippon.auction.price'],
        onAgain: () => act('again'),
        onTown: () => act('town'),
      });
    } else if (session.phase !== 'done' && session.phase !== 'auction' && resultsOn) {
      resultsOn = false;
      hideResults();
    }
    placeCaptain(t || 0);
    if (session.swing && !shotCoach) {
      const key = session.big && session.set ? 'play.ippon.big' : 'play.ippon.came';
      const hintKey = (coarse || ctx.pad?.active) ? 'play.ippon.swipe' : 'play.ippon.release';
      hud.cue((TEXT[L] || TEXT.ja)[key], (TEXT[L] || TEXT.ja)[hintKey]);
    } else hud.cue('');
    if (hud.bubbles) hud.bubbles(view.cheers);
    if (onBoat || session.holdN > 0) {
      if (!counter && typeof document !== 'undefined') {
        const chip = ui.counter('ippon', { label: (TEXT[L] || TEXT.ja)['play.ippon.fish'], total: 1 });
        const el = document.querySelector('#klc-play [data-counter="ippon"]');
        if (el) { counter = chip; counterB = el.querySelector('b'); }
      }
      if (counter && session.holdN !== counterN) {
        counterN = session.holdN;
        counter.set(session.holdN);
        if (counterB) counterB.textContent = String(session.holdN | 0);
        if (session.holdN > 0) counter.bump();
      }
    }
    syncPad();

    const cam = ctx.camera?.position;
    const px = cam ? cam.x : 0, pz = cam ? cam.z : 0;
    const nearQ = Math.hypot(px - BERTH.x, pz - BERTH.z) < 90 || Math.hypot(px - BERTH.quay[0], pz - BERTH.quay[1]) < 70;
    const fishing = lock && lock !== 'quay' && lock !== 'birds';
    const show = !fishing && !onBoat && !ctx.services.ship?.voyage?.active && !ctx.planet?.active && nearQ && session.phase !== 'done';
    if (show !== boardShown || L !== boardLang) { boardShown = show; boardLang = L; hud.setBoard(show, L); }

    if (lock === 'quay' && !onBoat && window.__lookAt) {
      const portrait = (window.innerHeight || 1) > (window.innerWidth || 1);
      if (portrait) {
        const dx = BERTH.quay[0] - BERTH.x, dz = BERTH.quay[1] - BERTH.z;
        const len = Math.hypot(dx, dz) || 1;
        const cx = BERTH.quay[0] + (dx / len) * 1.4;
        const cz = BERTH.quay[1] + (dz / len) * 1.4;
        window.__lookAt([cx - 6.4, 7.6, cz + 9.4], [cx + 0.8, 1.35, cz - 0.5]);
      } else window.__lookAt([BERTH.quay[0] - 8, 5.5, BERTH.quay[1] + 14], [BERTH.x, 2.2, BERTH.z]);
    }
    if (lock === 'birds' && window.__lookAt) window.__lookAt([posed[0].x + 40, 18, posed[0].z + 30], [posed[0].x, 8, posed[0].z]);
    if (lock === 'auction' && window.__lookAt) window.__lookAt([BERTH.quay[0] - 6, 4.2, BERTH.quay[1] + 10], [BERTH.x, 2, BERTH.z]);
    if ((lock === 'outbound' || lock === 'mouth' || lock === 'cast') && onBoat && window.__lookAt) {
      const s = sail.state;
      const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
      window.__lookAt([s.x - sy * 55, 18, s.z - cy * 55], [s.x + sy * 24, 3, s.z + cy * 24]);
    }
    if (lock === 'radar' && onBoat && window.__lookAt) {
      const s = sail.state;
      window.__lookAt([s.x - Math.sin(s.yaw) * 48, 16, s.z - Math.cos(s.yaw) * 48], [s.x, 4, s.z]);
    }
    if (perfOn) cost[ci++ % 180] = performance.now() - tCost;
  });

  if (q.get('ippon') === '1' || (lock && lock !== 'quay' && lock !== 'birds')) {
    let pending = true;
    ctx.onUpdate(() => {
      if (!pending) return;
      const shot = q.has('shot') || document.body?.classList?.contains('shot') || document.body?.classList?.contains('playing');
      if (!shot && document.body && !document.body.classList.contains('playing')) return;
      pending = false;
      try { board(); if (lock) applyFrame(lock); } catch (e) { console.error('[ippon] board', e); }
    });
  }

  function applyFrame(name) {
    lock = name;
    session.swing = false;
    vis.previewArc = 0;
    if (coachHandle) { try { coachHandle.hide(); } catch { /* */ } coachHandle = null; }
    coachShown = '';
    shotCoach = '';
    forceCluster = false;
    lastActs = null;
    if (name !== 'talk') { talking = false; hud.dialogue({ show: false }); }
    if (!String(name).startsWith('coach-')) {
      if (name !== 'talk' && name !== 'quay' && name !== 'cast') {
        seen = { birds: 1, bait: 1, spray: 1, pole: 1, swipe: 1, praise: seen.praise || 0, done: 1 };
      }
    }
    if (name !== 'results' && name !== 'auction') { resultsOn = false; hideResults(); }
    if (name === 'outbound' || name === 'mouth') {
      const along = name === 'mouth' ? OUTBOUND_PATH.len - 180 : OUTBOUND_PATH.len * 0.55;
      const [x, z] = OUTBOUND_PATH.at(along);
      const [dx, dz] = OUTBOUND_PATH.dirAt(along);
      const yaw = Math.atan2(dx, dz);
      sail.enter({ boat: 'katsuo', x, z, yaw, autopilot: false });
      session.phase = 'run';
      session.nabura = 0;
      session.holdN = 0;
      toGround = true;
      baitReady = name === 'mouth';
      baitSpent = false;
      baitArm = false;
      return name;
    }
    if (name === 'coach-birds') {
      sail.enter({ boat: 'katsuo', x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw, autopilot: false });
      session.phase = 'run';
      toGround = true;
      shotCoach = 'birds';
      return name;
    }
    if (name === 'talk') {
      sail.enter({ boat: 'katsuo', x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw, autopilot: false });
      session.phase = 'run';
      session.nabura = 0;
      openTalk();
      return name;
    }
    if (name === 'cast') {
      sail.enter({ boat: 'katsuo', x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw, autopilot: false });
      session.phase = 'run';
      session.nabura = 0;
      session.holdN = 0;
      toGround = false;
      baitReady = false;
      baitSpent = false;
      baitArm = false;
      return name;
    }
    const list = schoolsFor(seasonOn);
    const s0 = list[0];
    if (name === 'quay') { if (sail.active && sail.boatId === 'katsuo') sail.exit(); return name; }
    if (!sail.active || sail.boatId !== 'katsuo') sail.enter({ boat: 'katsuo', x: s0.x - 36, z: s0.z - 28, yaw: Math.atan2(36, 28), autopilot: false });
    else sail.enter({ boat: 'katsuo', x: s0.x - 36, z: s0.z - 28, yaw: Math.atan2(36, 28), autopilot: false });
    session.phase = 'run';
    if (name === 'radar') { session.nabura = 0.62; }
    if (name === 'spray') { session.phase = 'work'; session.nabura = 0.72; sprayOn = true; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'swing') { session.phase = 'swing'; session.swing = true; session.nabura = 0.8; vis.previewArc = 0.42; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'deck') { session.phase = 'pole'; session.holdN = 14; session.holdKg = 34; session.biggest = 58; session.nabura = 0.55; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'pov') { session.phase = 'pole'; session.nabura = 0.86; sprayOn = true; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'apex') { session.phase = 'swing'; session.swing = true; session.nabura = 0.9; session.holdN = 1; vis.previewArc = 0.5; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'nabura') { session.phase = 'work'; session.nabura = 0.92; sprayOn = true; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'crew') { session.phase = 'pole'; session.nabura = 0.8; sprayOn = true; camOn = true; sail.hold(true); sail.setCam(ownCam); }
    if (name === 'auction' || name === 'results') {
      session.phase = 'done'; session.holdN = 4; session.holdKg = 11.2; session.biggest = 61; session.fresh = 0.92;
      session.grade = gradeOf({ n: 4, kg: 11.2, fresh: 0.92 });
      session.mark = markOf({ n: 4, kg: 11.2, biggest: 61 });
      sail.enter({ boat: 'katsuo', x: BERTH.x + 6, z: BERTH.z, yaw: BERTH.yaw, autopilot: false });
      showResults({
        n: 4, kg: 11.2, biggest: 61, mark: session.mark,
        bid: T('play.ippon.auction.example') + ' ' + T('play.ippon.auction.price'),
        onAgain: () => act('again'), onTown: () => act('town'),
      });
      resultsOn = true;
      return name;
    }
    shotCoach = '';
    forceCluster = false;
    if (name === 'coach-bait' || name === 'coach-spray' || name === 'coach-pole' || name === 'actions') {
      session.phase = 'work';
      session.nabura = name === 'actions' ? 0.72 : 0.2;
      session.firstFish = 1;
      baited = name !== 'coach-bait';
      sprayed = name === 'coach-pole' || name === 'actions';
      if (name === 'actions') { forceCluster = true; session.holdN = 2; session.holdKg = 5.4; }
      else shotCoach = name.slice('coach-'.length);
      camOn = true; sail.hold(true); sail.setCam(ownCam);
      return name;
    }
    if (name === 'coach-swipe' || name === 'catch' || name === 'stamp') {
      session.phase = 'swing';
      session.swing = true;
      session.nabura = 0.8;
      session.firstFish = 1;
      session.holdN = name === 'stamp' ? 1 : 0;
      vis.previewArc = name === 'stamp' ? 0.92 : 0.18;
      camOn = true; sail.hold(true); sail.setCam(ownCam);
      if (name === 'coach-swipe') shotCoach = 'swipe';
      if (name === 'catch' || name === 'stamp') juice(name);
      return name;
    }
    return name;
  }

  // [mobile-play] The captain is built when the camera comes within CAP_BUILD of his spot on the quay and, on a phone, freed
  // past CAP_FREE, like the town's other quest people (play/npc: 120 / 180 m). His balloon (out to 108 m) is placed from
  // the spot, not from his body. Deploy #5 built him on the first frame wherever the visitor was.
  const CAP_BUILD = 150, CAP_FREE = 220;
  function placeCaptain(t) {
    if (captainFailed || typeof document === 'undefined') return;
    const dx = BERTH.quay[0] - BERTH.x, dz = BERTH.quay[1] - BERTH.z;
    const len = Math.hypot(dx, dz) || 1;
    const cx = BERTH.quay[0] + (dx / len) * 1.4;
    const cz = BERTH.quay[1] + (dz / len) * 1.4;
    const eye = ctx.camera?.position;
    const far = eye ? Math.hypot(eye.x - cx, eye.z - cz) : 0;
    if (!captain && far < CAP_BUILD) {
      try {
        const r = ctx.rng ? ctx.rng('ippon-captain') : null;
        if (!r?.pick) { captainFailed = true; return; }
        const spec = LOOKS.fisherman(r, 3);
        spec.key = 'ippon-captain';
        spec.seed = 17;
        spec.height = 1.74;
        spec.outfit = Object.assign({}, spec.outfit, { topColor: '#223A70' });
        spec.props = [(hh) => gear.workCap(hh, { color: '#223A70', visor: '#1a2d52' })];
        const h = new Human(ctx, spec);
        const d = new Driver(ctx, h, { seed: 17 });
        ctx.add(h.group);
        captain = { h, d };
      } catch (e) { captainFailed = true; console.warn('[ippon] captain', e); return; }
    } else if (captain && far > CAP_FREE && ctx.quality?.phone) {
      const gone = captain;
      captain = null;
      try { freeTree(ctx, gone.h.group, { extra: Object.values(gone.h.mats || {}) }); } catch (e) { console.warn('[ippon] captain free', e); }
    }
    let y = 2.2;
    try { if (ctx.L?.heightAt) y = Math.max(ctx.L.heightAt(cx, cz), 0); } catch { /* */ }
    try { if (ctx.physics?.groundHeight) y = ctx.physics.groundHeight(cx, cz, y + 0.6); } catch { /* */ }
    const yaw = Math.atan2(BERTH.x - cx, BERTH.z - cz);
    if (captain) {
      const d = captain.d;
      d.place(cx, y, cz, yaw);
      d.reset();
      try { d.stand(); d.breathe(t || 0, 0.5); } catch { /* a still pose is enough */ }
    }
    const cam = ctx.camera;
    if (!cam?.position) { capScreen = null; hud.mark(null); return; }
    _head.set(cx, y + 1.7, cz);
    _head.project(cam);
    const w = ctx.renderer?.domElement?.clientWidth || 1;
    const h = ctx.renderer?.domElement?.clientHeight || 1;
    const headZ = _head.z;
    const sx = (_head.x * 0.5 + 0.5) * w;
    const sy = (-_head.y * 0.5 + 0.5) * h;
    capScreen = headZ > 1 ? null : { x: sx, y: sy };
    const onBoat = sail.active && sail.boatId === 'katsuo';
    const dist = Math.hypot(cam.position.x - cx, cam.position.z - cz);
    const bang = !fished;
    const op = balloonOpacity(dist);
    const show = !!(capScreen && !onBoat && !talking && session.phase !== 'done' && (bang ? op > 0.02 : dist < 40));
    let ring = null;
    if (show && bang) {
      _head.set(cx, y + 0.05, cz);
      _head.project(cam);
      if (_head.z <= 1) {
        const rw = ringWidth(dist, h, cam.fov || 55);
        ring = {
          x: (_head.x * 0.5 + 0.5) * w,
          y: (-_head.y * 0.5 + 0.5) * h,
          w: rw,
          h: rw * 0.36,
        };
      }
    }
    hud.mark(show ? {
      text: bang ? '！' : '…',
      x: sx, y: sy,
      px: bang ? balloonPx(dist, h, cam.fov || 55) : 0,
      op: bang ? op : 1,
      bang,
      ring,
    } : null);
    if (!onBoat && dist < 3 && !talking && (session.phase === 'quay' || !sail.active)) {
      if (!talkOn || talkHandle?.shown === false) {
        talkOn = true;
        try {
          talkHandle = ui.prompt(T('play.ippon.talk'), { onPress: () => start(), priority: 1 });
          if (talkHandle?.shown === false) { talkOn = false; talkHandle = null; }
        } catch { talkOn = false; }
      }
    } else if (talkOn) {
      talkOn = false;
      try { talkHandle?.hide?.(); } catch { /* */ }
      talkHandle = null;
    }
  }

  ui.notebook.register('ippon', {
    label: { ja: TEXT.ja['play.ippon.tab'], en: TEXT.en['play.ippon.tab'] },
    render(el) {
      const log = readLog(store());
      const L = lang();
      const T = TEXT[L] || TEXT.ja;
      el.replaceChildren();
      const p = document.createElement('p');
      const kg = Number(log.kg || 0).toFixed(1);
      p.textContent = L === 'ja'
        ? T['play.ippon.trips'] + (log.trips || 0) + '・' + T['play.ippon.total'] + kg + ' ' + T['play.ippon.kg']
        : T['play.ippon.trips'] + ' ' + (log.trips || 0) + ' · ' + T['play.ippon.total'] + ' ' + kg + ' ' + T['play.ippon.kg'];
      el.appendChild(p);
      if (!log.trips) {
        const empty = document.createElement('p');
        empty.textContent = T['play.ippon.empty'];
        el.appendChild(empty);
      }
    },
  });

  function ownsInput() { return !!(sail.active && sail.boatId === 'katsuo'); }
  function leave() {
    // (Escape reaches here through the ship layer's capture listener, so the 漁労長's 「出港する」 closes here too: it stayed
    // on screen in the town after the boat was left)
    if (talking) { talking = false; hud.dialogue({ show: false }); }
    if (sail.active && sail.boatId === 'katsuo') sail.exit();
    session.phase = 'quay';
  }

  function pull(strength = 0.62) {
    if (session.phase !== 'swing') {
      session.phase = 'swing';
      session.swing = true;
      session.big = false;
      session.cm = session.cm || 48;
      session.set = false;
    }
    input.lift = 1;
    input.strength = strength;
    input.lagMs = 200;
  }

  // 「帰港」. Escape cannot do this while the ship layer is listening: its capture
  // handler leaves the boat and stops the event. The button is hidden during a bite.
  function finish() { input.finish = 1; }

  function costReport() {
    const n = Math.min(ci, 180);
    const a = [];
    for (let i = 0; i < n; i++) a.push(cost[i]);
    a.sort((x, y) => x - y);
    const pick = (p) => (n ? a[Math.min(n - 1, Math.floor(p * (n - 1)))] : 0);
    return { n, p50: pick(0.5), p95: pick(0.95), max: n ? a[n - 1] : 0 };
  }

  const modeSpec = {
    id: 'ippon',
    order: 10,
    title: { ja: '一本釣り', en: 'Pole-and-line bonito' },
    hook: { ja: 'カツオを一本釣り！', en: 'Land skipjack the Kesennuma way' },
    minutes: 5,
    stars: 2,
    players: 1,
    art: '/data/play/art/ippon.webp',
    progress() {
      let n = 0;
      try {
        const o = JSON.parse(store().getItem('klc.play.v1') || '{}');
        const fish = o.fish || {};
        if (fish['katsuo-sho']) n++;
        if (fish['katsuo-naka']) n++;
        if (fish['katsuo-dai']) n++;
      } catch { /* private mode */ }
      return { ja: '図鑑 ' + n + '/3', en: 'Log ' + n + '/3' };
    },
    isNew() { return !readFished(store()); },
    // [mobile-play] the hub calls this behind its title card: the trip's meshes are built and warm before start()
    prepare() { return view.prepare(); },
    start() { return start(); },
  };

  const api = {
    board, start, leave, ownsInput, pull, finish, session, stations, cost: costReport, mode: modeSpec,
    /** [mobile-play] on the 第五凪丸 now (the census reads it); the trip's lazy world */
    get active() { return !!(sail.active && sail.boatId === 'katsuo'); },
    trip: view.trip,
    debug() {
      const c = ctx.camera?.position;
      return { cx: c && c.x, cy: c && c.y, cz: c && c.z, sx: shipP.x, sz: shipP.z, phase: session.phase, swing: !!session.swing };
    },
    place: { ...PLACE, action: () => start() },
    on(name, fn) { (listeners[name] ||= new Set()).add(fn); return () => listeners[name].delete(fn); },
    frame: applyFrame,
    juice,
    overlaps() { return hud.overlaps(); },
    get boatId() { return 'katsuo'; },
  };
  registerMode(modeSpec);
  ctx.services.ippon = api;
  if (typeof window !== 'undefined') window.__ippon = api;
  return api;
}

/** Ship build calls `mount`. The play kit can call the same. */
export function mount(ctx) { return mountIppon(ctx); }
