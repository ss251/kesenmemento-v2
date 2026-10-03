// [ship:integrate] World module 'ship': 第一昭福丸 (SHOFUKU MARU No.1, 7KFY) berthed at the コの字岸壁, and the three acts.
// Built after life (the send-off crowd uses life's character kit) and before explore (it lists the boarding entry in
// the places list, the map and the labels). Everything it adds is dynamic (ctx.add): never batched, never merged.
//
//   - the model (ship/shofukumaru1.js) at the tier's budget, the livery behind the flag (ship/flags.js: nendo on local and
//     dev hosts, the plain fallback elsewhere; ?livery=nendo|fallback wins). With the flag off, nothing nendo is fetched.
//   - the sail mode (explore/sail.js) holds her pose: by default she lies alongside the コの字岸壁 east face.
//   - the director (ship/voyage.js) and its UI (ui/ship.js), started from the 「第一昭福丸に乗る」 chip near the quay, the
//     places list, or the URL.
//
// URL (deterministic shots and the demo):
//   ?ship=1                board at the quay (DOCKED)
//   ?ship=1&act=1|2|3      start at the first beat of an act: DOCKED, OCEAN_SET, TRANSSHIP_LAS_PALMAS
//   ?ship=1&beat=HAUL      start at any state of acts.js STATES (wins over act); &keep=N keeps N fish first (HAUL);
//                          &fish=1 puts a fish on the scale (HAUL)
//   ?ship=1&auto=1         the hands-free demo (about 5 minutes from the quay to the card)
// With ?shot=1&t=S the beat is entered on the first simulation step, then the scene runs S seconds (main.js __sim).
//
// Publishes ctx.services.ship = { ship, sail, voyage, flags, place, board(state?), parseShipParams } and, for the shot
// tools, window.__ship / __voyage / __sail / __voyageShot / __voyageCam / __voyageKanae / __voyageInit.
import * as ROUTE from './route.js';
import { buildShofukumaru } from './shofukumaru1.js';
import { resolveFlags } from './flags.js';
import { createSail } from '../explore/sail.js';
import { createVoyage } from './voyage.js';
import { STATES } from './acts.js';
import { mountBoardChip } from '../../ui/ship.js';

/** The first beat of each act (?act=). */
export const ACT_START = { 1: 'DOCKED', 2: 'OCEAN_SET', 3: 'TRANSSHIP_LAS_PALMAS' };
/** The boarding chip shows within this distance (m, horizontal) of her berth, below this height over the water. */
export const BOARD = { radius: 320, maxAlt: 420 };
/** Keys the town binds that would fight the voyage for the camera while it runs (blocked while it is active). */
export const BLOCKED_KEYS = new Set(['KeyC', 'KeyV', 'KeyF', 'KeyR', 'KeyN', 'KeyT', 'Slash', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);

/** The places-list entry (explore): selecting it boards the ship. */
export const PLACE = {
  id: 'ship-shofukumaru1', ja: '第一昭福丸に乗る', en: 'Board the 第一昭福丸', cat: 'ship', group: 'ship',
  groupLabel: { ja: '船に乗る', en: 'Go to sea' },
  at: [ROUTE.BERTH.x, ROUTE.BERTH.z],
};

/** Parse the ship's URL parameters (pure). -> { board, state, auto, keep, fish } */
export function parseShipParams(search = '') {
  const q = new URLSearchParams(search);
  const on = ['1', 'true', 'yes'].includes(String(q.get('ship') || '').toLowerCase());
  if (!on) return { board: false, state: null, auto: false, keep: null, fish: false };
  const beat = String(q.get('beat') || '').toUpperCase();
  const act = Number(q.get('act'));
  const state = STATES.includes(beat) ? beat : ACT_START[act] || 'DOCKED';
  const keep = q.has('keep') && Number.isFinite(Number(q.get('keep'))) ? Math.max(0, Math.floor(Number(q.get('keep')))) : null;
  return { board: true, state, auto: q.get('auto') === '1', keep, fish: q.get('fish') === '1' };
}

/** Has the viewer left the intro card? main.js start() adds body.playing; without a DOM class list (tests) it is true. */
export function introDone(doc = typeof document !== 'undefined' ? document : null) {
  const cl = doc?.body?.classList;
  return !cl || typeof cl.contains !== 'function' ? true : cl.contains('playing');
}

/** True when (x, z) at height y is close enough to the berth to offer boarding (pure). */
export function nearBerth(x, z, y = 0, B = BOARD, berth = ROUTE.BERTH) {
  return Math.hypot(x - berth.x, z - berth.z) <= B.radius && y <= B.maxAlt;
}

export async function build(ctx) {
  const t0 = performance.now();
  const search = typeof location !== 'undefined' ? location.search : '';
  const params = new URLSearchParams(search);
  const SHOT = params.has('shot');
  const want = parseShipParams(search);
  const flags = resolveFlags();
  const livery = flags.nendoLivery ? 'nendo' : 'fallback';
  const tier = ctx.quality?.phone ? 'phone' : 'high';

  // the town's keys (drive C, map N, views 1-9, hero R, ...) stay out of the way while the voyage owns the camera;
  // Esc leaves the voyage. Registered before the sail mode so it runs first in the capture phase.
  let voyage = null;
  if (typeof addEventListener === 'function') addEventListener('keydown', (e) => {
    if (!voyage?.active) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); voyage.exit(); return; }
    if (BLOCKED_KEYS.has(e.code)) e.stopImmediatePropagation();
  }, true);

  const ship = buildShofukumaru(ctx, { livery, tier });
  ctx.onUpdate((dt, t) => ship.update(dt, t));
  const sail = createSail(ctx, { ship });   // she lies at ROUTE.BERTH until a voyage moves her
  voyage = createVoyage(ctx, { ship, sail, route: ROUTE, livery, auto: want.auto, gate: () => SHOT || introDone() });

  // the voyage UI needs the cursor: a pointer lock that lands while it runs (main.js start() asks for one as the intro
  // closes, the same frame a URL voyage boards) is released at once
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('pointerlockchange', () => {
    try { if (voyage?.active && document.pointerLockElement) document.exitPointerLock?.(); } catch (e) { /* no lock */ }
  });

  /** Board: start the voyage at its current state, or jump (legally fast-forwarded) to `state`. */
  function board(state = null, opts = {}) {
    ctx.services.explore?.drive?.active && ctx.services.explore.drive.exit();
    ctx.planet?.active && ctx.planet.exit();
    ctx.services.life?.tour?.stop?.();
    try { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.(); } catch (e) { /* no lock */ }   // the voyage UI needs the cursor
    if (state && state !== 'DOCKED') voyage.jump(state, opts);   // jump() enters the scene and shows its UI
    else if (!voyage.active) voyage.start();
    return voyage.state;
  }

  // ---- the boarding chip near the quay (and the places-list entry: explore reads `place`)
  const place = { ...PLACE, action: () => board() };
  const chip = SHOT && params.get('ui') !== '1' ? null : mountBoardChip(ctx, { onBoard: () => board() });
  let chipAcc = 1;
  ctx.onUpdate((dt) => {
    if (!chip) return;
    chipAcc += dt; if (chipAcc < 0.25) return; chipAcc = 0;
    const c = ctx.camera.position, drive = ctx.services.explore?.drive;
    const p = drive?.active ? drive.state : c;
    const on = !voyage.active && !sail.active && !ctx.planet?.active && nearBerth(p.x, p.z, c.y);
    chip.update({ visible: on, lang: ctx.services.life?.hud?.i18n?.lang });
  });

  // ---- the URL: board on the first simulation step after the viewer has left the intro card (「まちへ出る」 adds
  // body.playing), so the send-off, the tapes, the music and the horn are seen, not run behind the card. Shots (?shot)
  // board on the very first step.
  if (want.board) {
    let pending = true;
    ctx.onUpdate(() => {
      if (!pending) return;
      if (!SHOT && !introDone()) return;
      pending = false;
      try { board(want.state, { keep: want.keep ?? Infinity, fishOnScale: want.fish }); }
      catch (e) { console.error('[ship] board', e); (window.__errors ||= []).push({ module: 'ship:board', message: String((e && e.stack) || e) }); }
    });
  }

  // ---- shot and test hooks (the headless tools drive the voyage through these)
  if (typeof window !== 'undefined') {
    Object.assign(window, {
      __ship: ship, __voyage: voyage, __sail: sail,
      __voyageInit: (o = {}) => { voyage.setAuto(!!o.auto); return true; },
      __voyageShot: (state, o = {}) => {
        const got = voyage.jump(state, o);
        const d = voyage.acts.data;
        return { state: got, data: { kept: d.kept.length, tags: d.kept.filter((f) => f.tag).map((f) => f.tag), landed: d.landedKg } };
      },
      __voyageCam: (name) => { if (!voyage.active) voyage.jump(voyage.state); voyage.setCam(name, true); return name; },
      /** Sail mode from arclength `s` of the outbound line, under way, autopilot on (the market and 商港 shots). */
      __voyageAt: (sAt) => {
        if (voyage.state !== 'DEPART' || !voyage.active) voyage.jump('DEPART');
        const P = ROUTE.OUTBOUND_PATH, [x, z] = P.at(sAt), [dx, dz] = P.dirAt(sAt);
        sail.enter({ x, z, yaw: Math.atan2(dx, dz), u: 3.0, autopilot: true });
        return { x: Math.round(x), z: Math.round(z), s: Math.round(sAt) };
      },
      /** Sail mode from `back` m before the かなえ大橋 crossing, autopilot on (the bridge shot). */
      __voyageKanae: (back = 160) => window.__voyageAt(ROUTE.KANAE_CROSSING.s - back),
      __shipRoute: ROUTE,
      /** Point the camera from ship-local [x, y, z] at ship-local [x, y, z] (the transom shots). */
      __shipLook: (from, to) => { const a = ship.localToWorld(from), b = ship.localToWorld(to); window.__lookAt?.([a.x, a.y, a.z], [b.x, b.y, b.z]); return 'ok'; },
    });
  }

  const api = { ship, sail, voyage, flags, livery, tier, place, board, parseShipParams, chip };
  ctx.services.ship = api;
  return { ms: Math.round(performance.now() - t0), livery, tier, triangles: ship.triangles, board: want.board ? want.state : null };
}
