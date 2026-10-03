// [ship:acts] The director of the three acts: it runs the pure machine (acts.js) and the scenes (sendoff.js, the sail
// mode, ocean.js, the chain cards), owns the camera while no other mode does, and drives the UI (ui/ship.js).
//
//   ACT 1  DOCKED (コの字岸壁, 11:00) -> SENDOFF (tapes, 福来旗, music, horn) -> DEPART (the sail mode: autopilot or the
//          player at the helm, under かなえ大橋, past 商港) -> BAY_MOUTH
//   ACT 2  OCEAN_SET -> WAIT -> HAUL -> STOW   (the town hidden; the stylised North Atlantic)
//   ACT 3  TRANSSHIP_LAS_PALMAS -> REEFER -> SHIMIZU_WEIGH (cards) -> HOMECOMING (back at the コの字岸壁 under 大漁旗)
//          -> CARD (your DEMO tags, 「まぐろの日は北かつまぐろ屋へ」)
//
//   const v = createVoyage(ctx, { ship, sail, route, livery, auto, gate })   gate(): false holds the director (the intro card)
//   v.start() / v.exit() / v.send(ev) / v.jump(state, opts) (tests and shots) / v.acts / v.active
// ship: buildShofukumaru(...) (or a stand-in with { group, anchors }); sail: createSail(...) (optional: without it the
// director follows route.OUTBOUND itself); route: ship/route.js (BERTH, OUTBOUND, BAY_MOUTH, SHOKO, KANAE_CROSSING).
import * as THREE from 'three';
import { createActs, ACT_OF, RULES, SPECIES, CHAIN_ORDER, STATES } from './acts.js';
import { createSendoff } from './sendoff.js';
import { createOcean, shipRig, STAGE_HOURS } from './ocean.js';
import { mountShipUI } from '../../ui/ship.js';

/** Scene timing in sim seconds (time-compressed; the real durations are in RULES and on the HUD). */
export const TIMING = {
  musicAt: 0.8, hornAt: 4.0, castOffAt: 13,          // auto mode casts off on its own; a player presses もやいを解く
  departAuto: 9,                                      // stand-in follower speed (m/s) when no sail mode is wired
  setSeconds: 40, waitSeconds: 9, freezeSeconds: 7,   // 150 km / 2.5 h / 36 h compressed
  fishGap: 0.8, autoDecide: 1.6, cardSeconds: 7,
  homeApproach: 24, homeHornAt: 20,
  ff: 5,                                              // the 早送り button
};
const KN = 0.514444;

function polyline(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc[acc.length - 1];
  const at = (s) => {
    s = Math.max(0, Math.min(len, s));
    let i = 1; while (i < acc.length - 1 && acc[i] < s) i++;
    const t = (s - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: Math.atan2(bx - ax, bz - az) };
  };
  return { len, at };
}

/** Step a fresh machine to `target` along the legal path (keeps every legal fish that fits). Pure; used by jump(). */
export function fastForward(acts, target, { keep = Infinity } = {}) {
  const want = STATES.indexOf(target);
  const S = () => STATES.indexOf(acts.state);
  const go = (ev, p) => acts.send(ev, p);
  let guard = 0;
  while (S() < want && guard++ < 200) {
    switch (acts.state) {
      case 'DOCKED': go('START'); break;
      case 'SENDOFF': go('HORN'); go('CAST_OFF'); break;
      case 'DEPART': go('PASS', { what: 'kanae' }); go('PASS', { what: 'shoko' }); go('REACH_BAY_MOUTH'); break;
      case 'BAY_MOUTH': go('TO_OCEAN'); break;
      case 'OCEAN_SET': go('SET_PROGRESS', { km: RULES.lineKm }); go('SET_DONE'); break;
      case 'WAIT': go('WAIT_PROGRESS', { h: 2.5 }); go('WAIT_DONE'); break;
      case 'HAUL': {
        if (!acts.data.onScale) go('FISH_UP');
        const kept = acts.data.kept.length;
        if (kept >= keep || !go('KEEP').ok) go('RELEASE');
        break;
      }
      case 'STOW': go('FREEZE_PROGRESS', { h: RULES.coreH }); go('STOW_DONE'); break;
      default: go('NEXT');
    }
  }
  return acts;
}

export function createVoyage(ctx, { ship, sail = null, route, livery = 'fallback', auto: auto0 = false, withUI = true, seed, date, gate = null } = {}) {
  let auto = !!auto0;   // [ship:integrate] mutable: the hands-free demo can be switched on after the module is built
  const L = ctx.L;
  const BERTH = route.BERTH, BAY = route.BAY_MOUTH;
  const outbound = polyline(route.OUTBOUND);
  let acts = createActs({ seed, date });
  const sendoff = createSendoff(ctx, { ship });
  // the ship is moved through the sail's carrier when the sail mode exists (it owns her pose), else directly
  const rig = (() => {
    if (sail?.setPose && sail.carrier) {
      const R = {
        root: sail.carrier, x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw,
        set(x, z, yaw) { R.x = x; R.z = z; R.yaw = yaw; sail.setPose(x, z, yaw); ship.group.updateWorldMatrix(true, true); },
        bob(y, pitch, roll) { ship.group.position.y = y; ship.group.rotation.set(pitch, 0, roll, 'YXZ'); ship.group.updateWorldMatrix(true, true); },
        sync() { if (sail.state) { R.x = sail.state.x; R.z = sail.state.z; R.yaw = sail.state.yaw; } },
      };
      return R;
    }
    const R = shipRig(ship); R.sync = () => { R.x = ship.group.position.x; R.z = ship.group.position.z; R.yaw = ship.group.rotation.y; };
    return R;
  })();
  const ocean = createOcean(ctx, { ship, rig });
  const V = { active: false, t: 0, ff: 1, cam: null, camSnap: true, homeS: 0, followS: 0, fishWait: 0, decideT: 0, lastPos: null, kn: 0, cardT: 0, toasts: new Set() };
  const ui = withUI ? mountShipUI(ctx, { onAction: action }) : null;
  const _p = new THREE.Vector3(), _l = new THREE.Vector3();

  // ------------------------------------------------------------------------------------------------ helpers
  const hours = (h) => { const T = ctx.services?.time; if (T?.setHours) T.setHours(h); else ctx.sky?.setHours?.(h); };
  const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(ship.group.matrixWorld);
  function berth() { V.home = false; rig.set(BERTH.x, BERTH.z, BERTH.yaw); rig.bob(0, 0, 0); }
  // [ship:integrate] home from the sea she comes in bow first along the outbound line reversed, so she lies at the same
  // berth turned end for end (port side to the quay). The approach ends exactly on this pose: no 180 deg snap.
  const HOME_YAW = Math.atan2(Math.sin(BERTH.yaw + Math.PI), Math.cos(BERTH.yaw + Math.PI));
  /** [ship:integrate] Her heading coming home at `s` along the outbound line: the chord over +-12 m (the polyline's
   *  corners turn her smoothly instead of snapping). At s = 0 it is exactly HOME_YAW. */
  function homeYaw(s) { const a = outbound.at(s + 12), b = outbound.at(Math.max(0, s - 12)); return Math.atan2(b.x - a.x, b.z - a.z); }
  function berthHome() { V.home = true; rig.set(BERTH.x, BERTH.z, HOME_YAW); rig.bob(0, 0, 0); }
  const quaySide = () => (BERTH.side === 'port' ? 1 : -1) * (V.home ? -1 : 1);
  function holdPlayer(x, z) {
    const pl = ctx.playerObj; if (!pl) return;
    pl.enabled = false; pl.fly = true;
    if (pl.pos && x !== undefined) { pl.pos.set(x, 6, z); pl.vel?.set?.(0, 0, 0); }
  }
  function camRig(name) {
    ship.group.updateWorldMatrix(true, false);
    const s = quaySide();
    // behind and above the stern on the quay side, looking along the crowd and her side (clear of the quay's poles)
    if (name === 'berth') return { pos: W(s * 13, 17, -62), look: W(s * 6, 3, 2) };
    if (name === 'sendoff') return { pos: W(s * 12 + Math.sin(V.t * 0.07) * 1.5, 14, -54 + Math.min(10, V.t * 0.25)), look: W(s * 6, 3.5, 0) };
    if (name === 'crowd') return { pos: W(s * 9.6, 3.2, -27), look: W(s * 7, 4.0, 10) };
    if (name === 'depart') return { pos: W(s * 40, 22, -95), look: W(0, 6, 10) };
    if (name === 'bay') return { pos: W(-70, 28, -110), look: W(0, 6, 10) };
    if (name === 'home') return { pos: W(s * 13, 17, -64), look: W(s * 6, 4, 4) };
    if (name === 'side') return { pos: W(-80, 7, 0), look: W(0, 6, 0) };
    if (name === 'sidePort') return { pos: W(80, 7, 0), look: W(0, 6, 0) };
    return ocean.camera(name, V.t);
  }
  /** Act 2 (and the cards before the homecoming) play over the ocean; entering it hides the town. */
  function ensureOcean() { if (!ocean.active) { ship.setFlags?.(false); ocean.enter({ at: { x: BAY.x, z: BAY.z }, heading: 0.22 }); } }
  function setCam(name, snap = false) { V.cam = name; if (snap) V.camSnap = true; }
  function applyCam(dt) {
    if (!V.cam || sail?.active) return;
    const r = camRig(V.cam);
    const cam = ctx.camera;
    if (V.camSnap || dt <= 0 && V.camSnapOnZero) { cam.position.copy(r.pos); V.look = r.look.clone(); V.camSnap = false; }
    else { const k = 1 - Math.exp(-dt * 1.6); cam.position.lerp(r.pos, k); V.look = (V.look || r.look.clone()).lerp(r.look, k); }
    cam.lookAt(V.look);
    const pl = ctx.playerObj; if (pl?.pos) pl.pos.set(cam.position.x, cam.position.y, cam.position.z);
  }

  // ------------------------------------------------------------------------------------------------ state entry
  function enter(state, from) {
    V.t = 0; V.ff = 1; V.prog = 0;
    if (state === 'DEPART') { V.cutKanae = false; V.afterKanae = 0; }
    const d = acts.data;
    switch (state) {
      case 'DOCKED':
        if (ocean.active) ocean.exit();
        if (sail?.active) sail.exit();
        sendoff.dispose();
        berth(); ship.setFlags?.(true); hours(11); holdPlayer(BERTH.x, BERTH.z);
        setCam('berth', true); break;
      case 'SENDOFF':
        berth(); hours(11); sendoff.start({ mode: 'sendoff' }); setCam('sendoff', true);
        ui?.toast('ship.toast.sendoff'); break;
      case 'DEPART':
        if (sail?.enter) { sail.enter({ x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw, autopilot: true }); }
        else V.followS = 0;
        setCam('depart', true); break;
      case 'BAY_MOUTH':
        if (sail?.active) sail.exit();
        rig.sync(); holdPlayer(rig.x, rig.z); ship.setFlags?.(false);   // the dressing comes down once she is out
        sendoff.dispose();
        setCam('bay', true); break;
      case 'OCEAN_SET':
        ship.setFlags?.(false);
        ensureOcean(); ocean.setStage('set'); setCam('set', true); break;
      case 'WAIT': ensureOcean(); ocean.setStage('wait'); setCam('wait', true); break;
      case 'HAUL': ensureOcean(); ocean.setStage('haul'); setCam('haul', true); V.fishWait = TIMING.fishGap; break;
      case 'STOW': ensureOcean(); ocean.setStage('stow'); setCam('stow', !from); break;
      case 'TRANSSHIP_LAS_PALMAS': case 'REEFER': case 'SHIMIZU_WEIGH': V.cardT = 0; setCam('wait'); break;
      case 'HOMECOMING': {
        if (ocean.active) ocean.exit();
        hours(14.5); ship.setFlags?.(true);
        V.homeS = 0; const p = outbound.at(420); rig.set(p.x, p.z, homeYaw(420)); rig.bob(0, 0, 0);
        holdPlayer(BERTH.x, BERTH.z);
        // the quay crowd waits with 福来旗 (built at the home pose, then the ship is moved out to approach)
        const keep = { x: rig.x, z: rig.z, yaw: rig.yaw }; berthHome(); sendoff.start({ mode: 'homecoming' }); rig.set(keep.x, keep.z, keep.yaw);
        setCam('home', true); V.hornDone = false; break;
      }
      case 'CARD': if (!from) { if (ocean.active) ocean.exit(); hours(14.5); ship.setFlags?.(true); berthHome(); setCam('home', true); } break;   // [ship:integrate] a jump (?beat=CARD) lands her home behind the card
    }
    ui?.show(state, d);
  }

  function send(ev, payload) {
    const from = acts.state;
    const r = acts.send(ev, payload);
    if (r.ok && r.state !== from) enter(r.state, from);
    else if (ui && acts.state === 'HAUL') ui.show('HAUL', acts.data);
    return r;
  }

  // ------------------------------------------------------------------------------------------------ the haul
  function keep() {
    const r = send('KEEP');
    if (r.ok) {
      const f = acts.data.kept.at(-1);
      ocean.decide('keep', f.tag);
      ui?.message(f.tag ? 'ship.haul.kept' : 'ship.haul.keptOther', { tag: f.tag, sp: ui?.t('ship.species.' + f.species) });
    } else if (r.reason === 'undersize') ui?.message('ship.haul.undersize', null, true);
    else if (r.reason === 'quota') ui?.message('ship.haul.quota', null, true);
    return r;
  }
  function release() {
    const f = acts.data.onScale;
    const legal = f && !(f.species === 'bluefin' && f.kg < RULES.minKg) && !acts.data.quotaHit;
    const r = send('RELEASE');
    if (r.ok) { ocean.decide('release'); ui?.message(legal ? 'ship.haul.releasedLegal' : 'ship.haul.released'); }
    return r;
  }
  function haulStep(dt) {
    if (acts.state !== 'HAUL') return;
    const d = acts.data;
    if (!d.onScale && !ocean.fishBusy) {
      V.fishWait -= dt;
      if (V.fishWait <= 0) { const r = send('FISH_UP'); if (r.ok) { ocean.fishUp(acts.data.onScale); V.decideT = 0; ui?.message(''); } V.fishWait = TIMING.fishGap; }
    }
    if (d.onScale && ocean.fishReady) {
      if (!V.readyShown) { V.readyShown = true; ui?.update({ fishReady: true }); ui?.show('HAUL', d); }
      if (auto) { V.decideT += dt; if (V.decideT > TIMING.autoDecide) { V.decideT = -1e9; const f = d.onScale; const legal = !(f.species === 'bluefin' && f.kg < RULES.minKg) && !(SPECIES[f.species].quota && d.landedKg + f.kg > d.allowanceKg); if (legal) keep(); else { if (SPECIES[f.species].quota && f.kg >= RULES.minKg) keep(); release(); } } }
    } else if (V.readyShown) { V.readyShown = false; ui?.update({ fishReady: false }); }
  }

  // ------------------------------------------------------------------------------------------------ per frame
  function update(dt, t) {
    if (!V.active) return;
    if (gate && !gate()) return;   // [ship] nothing runs behind the intro card (index.js: body.playing)
    const st = acts.state, d = acts.data;
    const fdt = dt * V.ff;
    V.t += fdt;
    switch (st) {
      case 'DOCKED': if (auto && V.t > 3) send('START'); break;
      case 'BAY_MOUTH': if (auto && V.t > 5) send('TO_OCEAN'); break;
      case 'SENDOFF':
        if (V.t >= TIMING.musicAt && !V.music) { V.music = true; try { sendoff.music(); } catch (e) { /* */ } ui?.toast('ship.toast.music'); }
        if (V.t >= TIMING.hornAt && !d.horn) horn();
        if (auto && V.t >= TIMING.castOffAt) send('CAST_OFF');
        break;
      case 'DEPART':
        // the crowd waves until she is well out (then it is freed: the phone never holds it through the transit)
        if (sendoff.active && Math.hypot(rig.x - BERTH.x, rig.z - BERTH.z) > 450) sendoff.dispose();
        // hands-free demo: once the tapes are gone, cut to the approach to かなえ大橋, then on to the bay mouth
        if (auto && sail?.enter && !V.cutKanae && (V.t > 45 || (sendoff.active && sendoff.stats.snapped === sendoff.stats.tapes)) && route.OUTBOUND_PATH && route.KANAE_CROSSING) {
          V.cutKanae = true; sendoff.dispose();
          const P = route.OUTBOUND_PATH, k = route.KANAE_CROSSING.s - 220, [x, z] = P.at(k), [dx, dz] = P.dirAt(k);
          sail.enter({ x, z, yaw: Math.atan2(dx, dz), u: 3.0, autopilot: true });
        }
        if (auto && acts.data.passed.includes('kanae')) { V.afterKanae = (V.afterKanae || 0) + fdt; if (V.afterKanae > 8) action('skipBay'); }
        if (!sail) {   // stand-in follower along OUTBOUND (no sail mode wired)
          V.followS += fdt * Math.min(TIMING.departAuto, 1 + V.t * 0.6);
          const p = outbound.at(V.followS); rig.set(p.x, p.z, p.yaw);
          if (route.SHOKO?.s && V.followS >= route.SHOKO.s) onSail({ type: 'passShoko' });
          if (route.KANAE_CROSSING?.s && V.followS >= route.KANAE_CROSSING.s) onSail({ type: 'passKanae' });
          if (V.followS >= outbound.len - 1) onSail({ type: 'bayMouth' });
        }
        break;
      case 'OCEAN_SET': {
        V.prog = Math.max(V.prog || 0, d.setKm); V.prog = Math.min(RULES.lineKm, V.prog + (RULES.lineKm / TIMING.setSeconds) * fdt); const km = V.prog;   // the director's own accumulator (the machine rounds to 0.1)
        send('SET_PROGRESS', { km }); ocean.setLineKm(km);
        if (km >= RULES.lineKm) send('SET_DONE');
        break;
      }
      case 'WAIT': {
        V.prog = Math.max(V.prog || 0, d.waitedH); V.prog = Math.min(RULES.waitMaxH, V.prog + (2.5 / TIMING.waitSeconds) * fdt); const h = V.prog;
        send('WAIT_PROGRESS', { h }); if (h >= 2.5) send('WAIT_DONE');
        break;
      }
      case 'HAUL': haulStep(fdt); break;
      case 'STOW': {
        if (ocean.fishBusy) break;   // the last fish finishes its slide into the hatch first
        V.prog = Math.max(V.prog || 0, d.freezeH); V.prog = Math.min(RULES.coreH, V.prog + (RULES.coreH / TIMING.freezeSeconds) * fdt); const h = V.prog;
        send('FREEZE_PROGRESS', { h }); if (h >= RULES.coreH) send('STOW_DONE');
        break;
      }
      case 'TRANSSHIP_LAS_PALMAS': case 'REEFER': case 'SHIMIZU_WEIGH':
        if (auto && (V.cardT += fdt) > TIMING.cardSeconds) send('NEXT');
        break;
      case 'HOMECOMING': {
        // she comes in along the last 420 m of the outbound line, reversed, and stops at the berth
        const k = Math.min(1, V.t / TIMING.homeApproach), e = 1 - (1 - k) * (1 - k);
        if (k < 1) { const sH = 420 * (1 - e), p = outbound.at(sH); rig.set(p.x, p.z, homeYaw(sH)); }
        else if (!V.berthed) { V.berthed = true; berthHome(); }
        if (V.t >= TIMING.homeHornAt && !V.hornDone) { V.hornDone = true; horn(); }
        if (auto && V.t > TIMING.homeApproach + 8) send('NEXT');
        break;
      }
    }
    if (st !== 'HOMECOMING') V.berthed = false;
    sendoff.update(dt, t);
    ocean.update(fdt, t);
    // the live numbers
    rig.sync?.();
    const p = new THREE.Vector3(); ship.group.getWorldPosition(p);
    if (V.lastPos && dt > 0) { const v = Math.hypot(p.x - V.lastPos.x, p.z - V.lastPos.z) / dt; V.kn += (v / KN - V.kn) * Math.min(1, dt * 2); }
    V.lastPos = p;
    const f = new THREE.Vector3(0, 0, 1).transformDirection(ship.group.matrixWorld);
    const model = { kn: sail?.active && sail.state?.kn !== undefined ? Math.abs(sail.state.kn) : V.kn, hdg: (Math.atan2(f.x, -f.z) * 180) / Math.PI, tapes: sendoff.active ? { n: sendoff.stats.tapes, snapped: sendoff.stats.snapped } : null, livery, autopilot: sail?.state?.autopilot };
    if (st === 'OCEAN_SET') { const h = STAGE_HOURS.set - 0.4 + (d.setKm / RULES.lineKm) * 4.5; model.clock = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }
    ui?.update(model);
    applyCam(dt);
  }
  function horn() {
    if (['SENDOFF', 'DEPART', 'HOMECOMING'].includes(acts.state)) acts.send('HORN');
    try { sendoff.horn(); } catch (e) { /* no audio */ }
    ui?.toast(acts.state === 'HOMECOMING' ? 'ship.toast.hornHome' : 'ship.toast.horn');
    if (acts.state === 'SENDOFF') ui?.show('SENDOFF', acts.data);
  }
  function onSail(ev) {
    const type = ev?.type || ev;
    if (V.toasts.has(type)) return;
    V.toasts.add(type);
    if (type === 'passKanae') { send('PASS', { what: 'kanae' }); ui?.toast('ship.toast.kanae'); }
    else if (type === 'passShoko') { send('PASS', { what: 'shoko' }); ui?.toast('ship.toast.shoko'); }
    else if (type === 'passMirai') ui?.toast('ship.toast.mirai');
    else if (type === 'bayMouth') { if (!acts.data.passed.includes('kanae')) send('PASS', { what: 'kanae' }); send('REACH_BAY_MOUTH'); }
    if (acts.state === 'DEPART') ui?.show('DEPART', acts.data);
  }
  if (sail?.onEvent) sail.onEvent((ev) => { if (V.active && acts.state === 'DEPART') onSail(ev); });

  function action(a) {
    if (a === 'exit') return api.exit();
    if (a === 'ff') { V.ff = V.ff > 1 ? 1 : TIMING.ff; return; }
    if (a === 'helm') { if (sail) sail.setAutopilot(!sail.state.autopilot); ui?.show(acts.state, acts.data); return; }
    if (a === 'skipBay') { if (acts.data.passed.includes('kanae')) { if (sail?.active) sail.exit(); rig.set(BAY.x, BAY.z, Math.PI * 0.98); onSail({ type: 'bayMouth' }); } return; }
    if (a === 'HORN') return horn();
    if (a === 'KEEP') return keep();
    if (a === 'RELEASE') return release();
    if (a === 'RESTART') { const r = send('RESTART'); V.toasts.clear(); return r; }
    if (a === 'shop') {
      // [ship:integrate] explore's goTo takes a place ({ id, ja, en, cat, at }); without the explore UI, the card's camera
      const S = arguments[1]; api.exit();
      const go = ctx.services?.explore?.ui?.goTo;
      if (go) go({ id: 'shop-' + S.id, ja: S.name, en: S.nameEn || S.name, cat: 'shop', at: [S.x, S.z] }, { how: 'fly' });
      else { const c = S.cam; try { window.__lookAt?.(c.pos, c.look); } catch (e) { /* */ } }
      return;
    }
    if (a === 'CAST_OFF') { V.toasts.clear(); }
    return send(a);
  }

  // ------------------------------------------------------------------------------------------------ api
  const api = {
    get acts() { return acts; },
    get active() { return V.active; },
    get state() { return acts.state; },
    get auto() { return auto; },
    setAuto(on) { auto = !!on; },
    sendoff, ocean, ui, rig, TIMING,
    start() {
      V.active = true; V.toasts.clear();
      ctx.services?.life?.tour?.stop?.();
      enter(acts.state, null);
      return api;
    },
    exit() {
      if (!V.active) return;
      V.active = false;
      if (ocean.active) ocean.exit();
      if (sail?.active) sail.exit();
      sendoff.dispose();
      berth(); ship.setFlags?.(true);
      ui?.hide();
      const pl = ctx.playerObj;
      if (pl) { pl.enabled = typeof document !== 'undefined' ? (document.body?.classList?.contains('playing') ?? true) : true; pl.fly = true; }
      V.cam = null;
    },
    send, action, horn, keep, release,
    /** Jump straight to a state (shots and tests): the machine is fast-forwarded legally, then that scene entered. */
    jump(target, { keep: nKeep = Infinity, fishOnScale = false } = {}) {
      if (!V.active) { V.active = true; }
      if (ocean.active && ACT_OF[target] !== 2 && !['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH'].includes(target)) ocean.exit();
      if (sail?.active) sail.exit();
      sendoff.dispose();
      acts = createActs({ seed, date });
      fastForward(acts, target, { keep: nKeep });
      if (['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH'].includes(target) && !ocean.active) { ensureOcean(); ocean.setStage('stow'); setCam('wait', true); }
      enter(acts.state, null);
      if (acts.state === 'HAUL' && Number.isFinite(nKeep)) {
        for (let i = 0; i < 20 && acts.state === 'HAUL' && acts.data.kept.length < nKeep; i++) { acts.send('FISH_UP'); if (!acts.send('KEEP').ok) acts.send('RELEASE'); }
        ui?.show(acts.state, acts.data);
      }
      if (fishOnScale && acts.state === 'HAUL') {
        acts.send('FISH_UP'); const F = ocean.fishUp(acts.data.onScale); F.phase = 'scale'; F.t = 1; V.readyShown = false;
      }
      return acts.state;
    },
    setCam, camRig,
    get time() { return V.t; },
    dispose() { api.exit(); ocean.dispose(); ui?.el?.remove(); },
  };
  ctx.onUpdate((dt, t) => update(dt, t));
  return api;
}
