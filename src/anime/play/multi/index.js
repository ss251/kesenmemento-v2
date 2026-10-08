// 「みんなであそぶ」. Mounted from play/index.js after the kit.
//
// Other lanes (car, courses) talk to this without importing it:
//   ctx.services.multi.startTogether('car' | 'race')
//   ctx.services.multi.onTogether(fn)  -> fn({ course, go })  go is the shared GO, in server ms
//   ctx.services.multi.finishTogether(ms)
// car arms courses.start('minato', { at }) on the performance clock.
// race arms playCar.race.start({ at: go }) with the server GO in epoch ms.
//   window 'klc-multi-race'    detail { course, go }
//   window 'klc-multi-finish'  detail { ms }
// A course that registers onTogether owns the finish. Until one does, the page shows ゴール.
// setStandIn(mode, geometry) swaps a stand-in once that lane's mesh exists.
// The race itself is not written to disk. The relay forgets the room when it empties.
// The only on-device bit is the coach-seen flag in mode.js (not a name, never sent).

import STR from '../../../../data/play-i18n.json';
import { qrEncode, qrToSvg } from '../../ui/qr.js';
import * as kit from '../kit/index.js';
import { sfx, fx, ui, onPlayTick } from '../kit/index.js';
import { resolveWs, roomLink, codeFromHash } from './endpoint.js';
import { readPose } from './pose.js';
import { sample } from './interp.js';
import { phase, formatTime } from './race.js';
import { COUNT_LEAD_MS as KIT_GO_MS } from '../race/together.js';
import { modeSpec, registerMode, coachSeen, markCoach } from './mode.js';
import { togetherStart } from './presence.js';
import { whoLabel, colorHex } from './names.js';
import { createSession } from './session.js';
import { mountBodies, setStandIn } from './bodies.js';
import { compileQuiet } from '../kit/lazy.js';
import { mountSheet } from './sheet.js';
import { mountCredit } from './credit.js';

export { setStandIn };

const SEND_DT = 1 / 15;
const HELD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function mountMulti(ctx) {
  if (!ctx) return null;
  if (ctx.services?.multi) return ctx.services.multi;
  let off = false;
  try {
    const q = new URLSearchParams(location.search);
    off = q.get('play') === '0' || q.get('multi') === '0';
  } catch { off = false; }
  if (off || typeof document === 'undefined') return null;

  let lang = 'ja';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    lang = q === 'en' || document.documentElement.lang === 'en' ? 'en' : 'ja';
  } catch { lang = 'ja'; }

  function t(key, vars) {
    const pack = STR[lang] || STR.ja;
    let s = pack[key];
    if (s == null) s = STR.ja[key];
    if (s == null) return key;
    if (!vars) return s;
    let out = s;
    for (const k in vars) out = out.split('{' + k + '}').join(String(vars[k]));
    return out;
  }

  const sheetOpts = {
    t,
    get lang() { return lang; },
    onCoachDone: null,
    onOpen() {
      ctx.pad?.suppress?.('multi', true);
      try { document.exitPointerLock?.(); } catch { /* already free */ }
      releaseKeys();
      syncGo();
    },
    onClose() { ctx.pad?.suppress?.('multi', false); syncGo(); },
    onCreate() { begin(); session.create(); },
    onJoin(code) { begin(); session.join(code); },
    onLeave() { leaveRoom(); },
    onStamp(s) { session.stamp(s); },
    onRace(course) { lastCourse = course; session.startRace(course); },
    onGoal() {
      if (!goAt) return;
      reportFinish(Date.now() - goAt);
      sheet.setGoal(false);
    },
    onAgain() {
      if (!session.isHost) { ui.toast(t('play.multi.waitHost')); return; }
      sheet.hideResults();
      session.startRace(lastCourse);
    },
    onDismiss() { syncGo(); },
  };
  const sheet = mountSheet(document, sheetOpts);

  // [mobile-play] The friends' bodies (the van, the boats, the gull, the fish, the ホヤぼーや) are baked when a room is joined,
  // not at mount: deploy #5 baked them in every phone's load (the ホヤぼーや alone is 12.7k vertices), whether or not anyone
  // played together. Until then a stand-in with nothing to draw.
  const IDLE = { aim: { on: false, x: 0, y: 0, z: 0 }, hoya: false, sawAvatar: false, kind: {}, draw() {} };
  let bodies = IDLE;
  /** [mobile-play] A phone frees the bodies when the room is left or closed; the next room bakes them again. */
  function freeBodies() {
    if (bodies === IDLE || !ctx.quality?.phone) return;
    const b = bodies;
    bodies = IDLE;
    try { b.dispose?.(); } catch (e) { console.warn('[multi] bodies', e); }
  }
  function ensureBodies() {
    if (bodies !== IDLE) return bodies;
    try { bodies = mountBodies(ctx, sheet.tags); } catch (e) { console.error('[multi] bodies', e); bodies = IDLE; return bodies; }
    try { window.__multiKind = bodies.kind; } catch { /* not a browser */ }
    // their programs compile now, hidden, so a friend's first frame does not wait for them
    compileQuiet(ctx, bodies.mesh);
    compileQuiet(ctx, bodies.accent);
    return bodies;
  }
  const credit = mountCredit(sheet.root);
  const session = createSession({ url: resolveWs(location) });
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, look: 0, mode: 'avatar', vehicle: 0 };
  const slots = [];
  for (let i = 0; i < 8; i++) slots.push({ id: 0, mode: 'avatar', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, color: '', label: '', stamp: '' });
  const at = { x: 0, y: 0, z: 0 };
  const together = [];
  const boards = [];
  let lastCourse = 'car';
  let lastRace = null;
  let goAt = 0;
  let finFor = 0;
  let courseHeld = false;
  let shown = '';
  let goal = null;
  let fanfareFor = 0;
  let lastBoard = null;
  let acc = 0;
  let frameMs = 0;
  let hashed = false;
  let reduced = false;
  let owned = false;
  let offCourse = null;
  let offRace = null;
  let arrow = null;
  let arrowWant = false;
  let peopleN = -1;
  let peopleShow = false;
  let creditOn = false;
  let avatarCredit = null;
  let avatarCreditLooked = false;
  let racing = false;
  let clockCs = -1;
  let coached = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduced = false; }
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { reduced = !!e.matches; });
  } catch { /* the first read stands */ }

  function sep() { return lang === 'ja' ? '・' : ' · '; }

  function relabel() {
    const self = session.self;
    if (self) self.label = whoLabel(t, self.fish, self.color);
    const order = session.order;
    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      p.label = whoLabel(t, p.fish, p.color);
      if (p.stamp) p.stampText = t('play.multi.stamp.' + p.stamp);
    }
  }

  function row(hex, name, you) {
    const extra = you ? sep() + t('play.multi.you') : '';
    return '<li><i style="background:' + hex + '"></i><span>' + esc(name + extra) + '</span></li>';
  }

  function peersHtml() {
    const self = session.self;
    let html = '';
    if (self) html += row(colorHex(self.color), self.label || t('play.multi.friend'), true);
    const order = session.order;
    if (!order.length) html += '<li><span>' + esc(t('play.multi.empty')) + '</span></li>';
    else for (let i = 0; i < order.length; i++) html += row(colorHex(order[i].color), order[i].label || t('play.multi.friend'), false);
    return html;
  }

  function paintRoom() {
    const code = session.code;
    sheet.setCode(code);
    sheet.setYou(session.self ? (session.self.label || '') + sep() + t('play.multi.you') : t('play.multi.connecting'));
    sheet.setPeers(peersHtml());
    sheet.setHost(session.isHost, session.isHost ? t('play.multi.hostNote') : t('play.multi.waitHost'));
    if (!code) { sheet.setQr(''); return; }
    try {
      const link = roomLink(location, code);
      const svg = qrToSvg(qrEncode(link, { ecl: 'M' }), { dark: '#223A70', light: '#FBFAF5', title: t('play.multi.qr') });
      sheet.setQr(svg + '<p>' + esc(t('play.multi.qr')) + '</p>');
    } catch { sheet.setQr(''); }
  }

  function begin() {
    sheet.setError('');
    sheet.setBusy(true);
    sheet.showRoom();
    sheet.setCode('…');
    sheet.setYou(t('play.multi.connecting'));
    sheet.setQr('');
  }

  function leaveRoom() {
    session.leave();
    freeBodies();
    goAt = 0;
    finFor = 0;
    courseHeld = false;
    shown = '';
    owned = false;
    racing = false;
    clockCs = -1;
    sheet.setClock(true);
    sheet.setLive(false);
    sheet.setRoom(false);
    sheet.setGoal(false);
    sheet.setGo(false, false);
    sheet.hideResults();
    lastRace = null;
    goal?.hide?.();
    goal = null;
    sheet.setPhase('done', t('play.multi.go'));
    sheet.setBusy(false);
    sheet.setError('');
    sheet.showHome();
    sheet.setCode('');
    sheet.setYou('');
    sheet.setPeers('');
    sheet.setQr('');
  }

  function syncGo() {
    const show = !!session.self && sheet.hidden && !racing && sheet.resultsHidden;
    sheet.setGo(show, !!session.isHost);
  }

  function maybeCoach() {
    if (coached || coachSeen()) return;
    coached = true;
    const text = t('play.multi.coach');
    let handed = false;
    if (typeof ui.coach === 'function') {
      try {
        const c = ui.coach({ id: 'multi-pass', text, gesture: 'tap', target: () => sheet.codePoint(), dim: false });
        if (c && c.shown) {
          handed = true;
          sheetOpts.onCoachDone = () => { markCoach(); try { c.done?.(); } catch { /* */ } };
        }
      } catch { handed = false; }
    }
    if (handed) return;
    sheetOpts.onCoachDone = () => markCoach();
    sheet.showCoach(text);
  }

  function releaseKeys() {
    if (typeof KeyboardEvent !== 'function') return;
    for (let i = 0; i < HELD.length; i++) {
      try { window.dispatchEvent(new KeyboardEvent('keyup', { code: HELD[i] })); } catch { /* */ }
    }
  }

  function burst(x, y, z) {
    at.x = x; at.y = y; at.z = z;
    fx.burst(at, 'spark', { count: 10, scale: 0.7 });
  }

  function nameOf(id) {
    if (session.self && id === session.self.id) return (session.self.label || t('play.multi.friend')) + sep() + t('play.multi.you');
    const p = session.peers.get(id);
    return p?.label || t('play.multi.friend');
  }

  function showBoard(rows, n) {
    lastBoard = { rows, n };
    const seen = Object.create(null);
    for (let i = 0; i < rows.length; i++) seen[rows[i][0]] = 1;
    const wait = [];
    if (session.self && !seen[session.self.id]) wait.push(session.self.label || t('play.multi.friend'));
    for (let i = 0; i < session.order.length; i++) {
      const p = session.order[i];
      if (!seen[p.id]) wait.push(p.label || t('play.multi.friend'));
    }
    const youId = session.self?.id;
    const won = !!(youId != null && rows.length && rows[0][0] === youId);
    racing = false;
    clockCs = -1;
    sheet.setLive(false);
    sheet.setGoal(false);
    sheet.setGo(false, false);
    let kitBoard = false;
    if (typeof ui.results === 'function') {
      try {
        const src = Function.prototype.toString.call(ui.results);
        if (src.includes('rows') || src.includes('ranked')) {
          ui.results({
            title: t('play.multi.board'),
            rows, youId, won,
            medal: rows.length ? 'gold' : null,
            again: t('play.multi.again'),
            quit: t('play.kit.quit'),
            onAgain: () => sheetOpts.onAgain(),
            onQuit: () => { sheet.hideResults(); syncGo(); },
          });
          kitBoard = true;
        }
      } catch { kitBoard = false; }
    }
    if (!kitBoard) {
      sheet.showResults({
        title: t('play.multi.board'),
        rows,
        youId,
        nameOf,
        fastest: t('play.multi.fastest'),
        stamp: won ? t('play.multi.win') : '',
        again: t('play.multi.again'),
        quit: t('play.kit.quit'),
        pending: wait,
        pendingLabel: t('play.multi.pending'),
        medalLabel: t('play.kit.medal.gold'),
        animate: !reduced,
      });
    }
    if (fanfareFor !== n) { fanfareFor = n; sfx.play('fanfare'); }
    for (let i = 0; i < boards.length; i++) { try { boards[i](rows); } catch { /* */ } }
  }

  function announce(detail) {
    lastRace = detail;
    for (let i = 0; i < together.length; i++) { try { together[i](detail); } catch { /* */ } }
    try { window.dispatchEvent(new CustomEvent('klc-multi-race', { detail })); } catch { /* */ }
  }

  function reportFinish(ms) {
    const n = Math.round(Number(ms));
    if (!Number.isFinite(n) || n < 0 || !goAt) return false;
    if (finFor === goAt) return false;
    const ok = session.finish(n);
    if (ok === false) return false;
    finFor = goAt;
    courseHeld = false;
    return ok;
  }

  function laneBusy() {
    const c = ctx.services?.play?.courses?.phase;
    const r = ctx.services?.playCar?.race?.phase;
    const courseOn = c === 'arm' || c === 'countdown' || c === 'live' || c === 'flyby' || c === 'result' || (!c && courseHeld);
    const raceOn = r === 'arm' || r === 'count' || r === 'run';
    return courseOn || raceOn;
  }

  function armLanes(course, go) {
    const call = togetherStart(course, go, Date.now(), typeof performance !== 'undefined' ? performance.now() : 0, KIT_GO_MS);
    if (!call) return false;
    try {
      if (course === 'car') {
        const api = ctx.services?.play?.courses;
        if (typeof api?.start !== 'function' || !api.start(call.id, { at: call.at })) return false;
        courseHeld = true;
        if (!offCourse && typeof api.on === 'function') {
          offCourse = api.on('finish', (e) => { if (Number.isFinite(e?.ms)) reportFinish(e.ms); });
        }
        return true;
      }
      const race = ctx.services?.playCar?.race;
      if (typeof race?.start !== 'function') return false;
      const started = race.start({ at: call.at });
      if (started === false) return false;
      if (!offRace && typeof race.on === 'function') {
        offRace = race.on('finish', (e) => {
          const ms = Number.isFinite(e?.ms) ? e.ms : e;
          if (Number.isFinite(ms)) reportFinish(ms);
        });
      }
      return true;
    } catch (e) { /* ゴール stays, for a page that has no course yet */ }
    return false;
  }

  function tickCount(nowMs) {
    if (!goAt) return;
    const ph = phase(nowMs, goAt);
    if (ph === shown) return;
    shown = ph;
    sheet.setPhase(ph === 'wait' || ph === 'done' ? 'done' : ph, t('play.multi.go'));
    if (owned) return;
    if (ph === '3' || ph === '2' || ph === '1') sfx.play('count');
    else if (ph === 'go') {
      sfx.play('go');
      try { navigator.vibrate?.(12); } catch { /* no haptic */ }
      if (!together.length) sheet.setGoal(true);
    }
  }

  function paintClock(nowMs) {
    if (!racing || !goAt || nowMs < goAt || !sheet.resultsHidden) {
      if (clockCs !== -2) { clockCs = -2; sheet.setRaceTime('', false); }
      return;
    }
    const cs = Math.floor((nowMs - goAt) / 100);
    if (cs === clockCs) return;
    clockCs = cs;
    sheet.setRaceTime(formatTime(nowMs - goAt), true);
  }

  function paintPeople() {
    const n = session.self ? session.order.length + 1 : 0;
    const show = n > 0 && sheet.hidden;
    if (n === peopleN && show === peopleShow) return;
    peopleN = n;
    peopleShow = show;
    sheet.setPeople(show ? t('play.multi.people', { n }) : '', show);
  }

  function syncArrow() {
    const want = !!(session.self && bodies.aim.on && !laneBusy());
    if (want === arrowWant) return;
    arrowWant = want;
    if (!want) { arrow?.hide(); arrow = null; return; }
    arrow = ui.edgeArrow((out) => {
      if (!bodies.aim.on || laneBusy()) return null;
      out.x = bodies.aim.x;
      out.y = bodies.aim.y;
      out.z = bodies.aim.z;
      return out;
    });
  }

  function paintCredit() {
    const show = !!(bodies.hoya && bodies.sawAvatar);
    if (show && !avatarCreditLooked) {
      avatarCreditLooked = true;
      try { avatarCredit = document.querySelector('#klc-play .hoya-credit'); } catch { avatarCredit = null; }
    }
    const already = !!(show && avatarCredit && !avatarCredit.hidden);
    const on = show && !already;
    if (on === creditOn) return;
    creditOn = on;
    credit.set(on);
  }

  function draw(nowMs) {
    const order = session.order;
    if (session.self) ensureBodies();
    let n = 0;
    for (let i = 0; i < order.length && n < 8; i++) {
      const p = order[i];
      const o = slots[n];
      if (!sample(p.buf, nowMs, o)) continue;
      o.id = p.id;
      o.color = p.color || '';
      o.label = p.label || '';
      o.stamp = p.stampUntil > nowMs ? (p.stampText || '') : '';
      p.x = o.x; p.y = o.y; p.z = o.z; p.modeSeen = o.mode;
      n++;
    }
    bodies.draw(slots, n, ctx.camera, reduced, nowMs / 1000);
  }

  session.on((ev) => {
    if (ev.type === 'room') {
      ensureBodies();
      sheet.setBusy(false);
      sheet.setError('');
      relabel();
      paintRoom();
      sheet.showRoom();
      sheet.setRoom(true);
      if (sheet.hidden) sheet.open(null);
      maybeCoach();
      syncGo();
      sfx.play('chime');
    } else if (ev.type === 'peer') {
      relabel();
      paintRoom();
      const p = session.peers.get(ev.id);
      ui.toast(t('play.multi.joined', { who: p?.label || t('play.multi.friend') }));
      sfx.play('chime');
    } else if (ev.type === 'gone') {
      const who = ev.label || whoLabel(t, ev.fish, ev.color);
      paintRoom();
      ui.toast(t('play.multi.left', { who }));
    } else if (ev.type === 'host') {
      paintRoom();
      syncGo();
    } else if (ev.type === 'stamp') {
      if (ev.local) {
        sfx.play('tap');
        const p = ctx.player?.position;
        if (p) burst(p.x || 0, (p.y || 0) + 1.5, p.z || 0);
      } else {
        const p = session.peers.get(ev.id);
        if (p) p.stampText = t('play.multi.stamp.' + ev.s);
        sfx.play('chime', { gain: 0.3, pitch: 1.18 });
        if (p && p.buf?.n) burst(p.x || 0, (p.y || 0) + 1.5, p.z || 0);
      }
    } else if (ev.type === 'race') {
      lastCourse = ev.course;
      goAt = ev.go;
      finFor = 0;
      courseHeld = false;
      shown = '';
      clockCs = -1;
      racing = true;
      goal?.hide?.();
      goal = null;
      owned = armLanes(ev.course, ev.go);
      sheet.setClock(true);
      sheet.setLive(true);
      sheet.setGoal(false);
      sheet.hideResults();
      if (arrow) { arrow.hide(); arrow = null; arrowWant = false; }
      if (!sheet.hidden) sheet.close();
      syncGo();
      announce({ course: ev.course, go: ev.go });
      tickCount(Date.now());
    } else if (ev.type === 'board') {
      owned = false;
      sheet.setClock(true);
      showBoard(ev.rows || [], ev.n);
    } else if (ev.type === 'err') {
      sheet.setBusy(false);
      if (!session.self) sheet.showHome();
      sheet.setError(ev.e || 'bad');
    } else if (ev.type === 'closed' || ev.type === 'offline') {
      freeBodies();
      goAt = 0;
      finFor = 0;
      courseHeld = false;
      shown = '';
      owned = false;
      racing = false;
      clockCs = -1;
      sheet.setClock(true);
      sheet.setLive(false);
      sheet.setRoom(false);
      sheet.setGoal(false);
      sheet.hideResults();
      goal?.hide?.();
      goal = null;
      sheet.setPhase('done', t('play.multi.go'));
      sheet.setBusy(false);
      sheet.showHome();
      sheet.setError(ev.type === 'offline' ? 'offline' : 'closed');
    }
  });

  function maybeHash() {
    if (hashed || session.self) return;
    const playing = document.body.classList.contains('playing') || document.body.classList.contains('shot');
    if (!playing) return;
    const c = codeFromHash(location.hash);
    if (!c) return;
    hashed = true;
    sheet.open(null);
    begin();
    session.join(c);
  }

  onPlayTick((dt) => {
    acc += dt;
    if (acc < SEND_DT) return;
    acc = 0;
    if (!session.self) return;
    if (!document.body.classList.contains('playing')) return;
    readPose(ctx, pose);
    session.sendPose(pose);
  });

  const prevMod = ctx.__mod;
  ctx.__mod = 'play-multi';
  ctx.onUpdate?.(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const nowMs = Date.now();
    tickCount(nowMs);
    paintClock(nowMs);
    draw(nowMs);
    paintPeople();
    syncArrow();
    paintCredit();
    if (t0) frameMs = performance.now() - t0;
  });
  ctx.__mod = prevMod;

  try {
    new MutationObserver(maybeHash).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch { /* a document without a body observer still joins from the menu */ }
  window.addEventListener?.('hashchange', () => { if (!session.self) { hashed = false; maybeHash(); } });
  window.addEventListener?.('klc-multi-finish', (e) => {
    const ms = e?.detail?.ms;
    if (Number.isFinite(ms)) reportFinish(ms);
  });
  maybeHash();

  const spec = modeSpec(() => ctx.services.multi?.open());
  const registered = registerMode(kit, spec);

  const api = {
    open(opts) {
      sheet.open(opts?.opener || null);
      if (session.self) sheet.showRoom();
      else sheet.showHome();
    },
    close() { sheet.close(); },
    setLang(next) {
      lang = next === 'en' ? 'en' : 'ja';
      peopleN = -1;
      const coachUp = !sheet.coachHidden;
      sheet.paint();
      relabel();
      if (session.self) paintRoom();
      if (coachUp) sheet.showCoach(t('play.multi.coach'));
      if (lastBoard) showBoard(lastBoard.rows, lastBoard.n);
    },
    startTogether(course) { lastCourse = course; return session.startRace(course); },
    onTogether(fn) {
      if (typeof fn !== 'function') return () => {};
      together.push(fn);
      if (lastRace && Date.now() < lastRace.go + 30000) { try { fn(lastRace); } catch { /* */ } }
      return () => { const i = together.indexOf(fn); if (i >= 0) together.splice(i, 1); };
    },
    finishTogether(ms) { return reportFinish(ms); },
    onBoard(fn) {
      if (typeof fn !== 'function') return () => {};
      boards.push(fn);
      return () => { const i = boards.indexOf(fn); if (i >= 0) boards.splice(i, 1); };
    },
    setStandIn,
    get code() { return session.code; },
    get self() { return session.self; },
    get peers() { return session.peers; },
    get frameMs() { return frameMs; },
    get goAt() { return goAt; },
    get ready() { return session.ready; },
    showCard() { sheet.showCard(spec, lang); },
    hideCard() { sheet.hideCard(); },
    get registered() { return registered; },
  };
  ctx.services.multi = api;
  return api;
}
