// [v7:pad] The touch pad: the de-facto mobile-game control scheme on top of the scene (Genshin / PUBG Mobile / Roblox style).
//
//   LEFT   a floating analog thumbstick (a ghost ring rests bottom-left as a hint; the base appears under the thumb)
//   RIGHT  drag anywhere that is not a button to look; a context action cluster in an arc, bottom right
//   TOP-L  a mode chip 歩く / 飛ぶ / 運転 and a settings button (left-handed, invert Y, look sensitivity)
//
// Active when (pointer: coarse) matches, on the first touch of any device, or with ?touch=1 (desktop testing);
// ?touch=0 forces it off. Desktop keyboard and mouse never go through this module.
//
//   const pad = createTouchpad({ canvas, ctx, player })      main.js; ctx.pad = pad; window.__pad = pad
//   pad.move        THREE.Vector2: x right, y down (the stick, dead zone removed, eased), length 0..1  [= player.touchMove]
//   pad.running     the stick is past 85 %: RUN on foot, BOOST in a car, fast flight
//   pad.takeLook(dt)  { dx, dy } radians for this frame (finger right = dx > 0, finger down = dy > 0), smoothed, Y inversion applied
//   pad.isDown(id) / pad.vertical (+1 rise, -1 descend) / pad.dash (the ダッシュ toggle)
//   pad.on(fn)      button / mode events { type: 'down' | 'up' | 'mode' | 'settings', id, mode }; returns the off function
//   pad.registerMode(name, { buttons: [{ id, label, icon, hold?, toggle?, visible?, onDown, onUp }], stick: 'analog' | 'none' })
//   pad.setMode(name)   a registered mode (the first button is the big primary one); setMode(null | 'walk' | 'fly' | 'drive')
//                       hands the buttons back to the game (walk / fly / drive follow the player and the car by themselves)
// docs/MOBILE-CONTROLS.md has the full API.
import * as THREE from 'three';
import DATA from '../../../data/ui-touch-i18n.json';
import { pickLang } from './i18n.js';
import { CSS as PAD_CSS } from './touchpad-style.js';

// ------------------------------------------------------------------ pure parts (bun test: test/mobile-pad.test.js)
/** The stick: 56 CSS px of travel (scaled on small screens), a 12 % dead zone, RUN past 85 % of the travel. */
export const STICK = { travel: 56, deadZone: 0.12, runAt: 0.85, runHysteresis: 0.05, base: 8, knob: 52 };
/** Look: radians per CSS px (0.008 = about 85 degrees for a 190 px swipe, the Genshin / PUBG feel; the slider scales it 0.5 to 1.8),
 *  a light smoothing (time constant, s) and the safe pitch limit. */
export const LOOK = { sens: 0.008, tau: 0.035, pitchMax: 80 * Math.PI / 180 };
/** The arc: sizes and gaps in CSS px at scale 1; every button is at least 56 px. */
export const BTN = { primary: 76, size: 60, min: 56, ring: 92, gap: 12 };
export const IDLE_MS = 4000, IDLE_OPACITY = 0.35;
export const STORE_KEY = 'klc.pad.v1';
export const DEFAULTS = { leftHanded: false, invertY: false, sens: 1, coach: false };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** The smoothstep that eases the stick magnitude (precise at a gentle push, quick at the end). */
export const easeStick = (m) => { m = clamp(m, 0, 1); return m * m * (3 - 2 * m); };
/** Everything is sized for a 390 px short side; small phones shrink a little, tablets grow a little, and a landscape phone
 *  (a short screen) takes 8 % off so the arc and the stick fit between the top panels and the bottom ones. */
export const padScale = (vw, vh) => clamp(Math.min(vw, vh) / 390, 0.8, 1.15) * (vw > vh && vh <= 520 ? 0.92 : 1);

/**
 * One stick sample: the thumb's offset (dx, dy CSS px, y down) from where it landed.
 * -> { x, y (the eased vector, y down), mag (0..1), raw (travel fraction 0..1), run, knob { x, y } (clamped, px) }
 * `prevRun` gives the run threshold a little hysteresis so the ring does not flicker at 85 %.
 */
export function stickMath(dx, dy, { scale = 1, travel = STICK.travel, deadZone = STICK.deadZone, runAt = STICK.runAt, prevRun = false } = {}) {
  const T = travel * scale, len = Math.hypot(dx, dy);
  const raw = T > 0 ? Math.min(1, len / T) : 0;
  const k = len > T && len > 0 ? T / len : 1;
  const knob = { x: dx * k, y: dy * k };
  if (!(len > 0) || raw <= deadZone) return { x: 0, y: 0, mag: 0, raw, run: false, knob };
  const mag = easeStick((raw - deadZone) / (1 - deadZone));
  return { x: dx / len * mag, y: dy / len * mag, mag, raw, run: raw >= (prevRun ? runAt - STICK.runHysteresis : runAt), knob };
}

/** Which job does a new touch at (x, y) get? The stick owns the lower 75 % of its half (the left one, the right one when left-handed). */
export function touchZone(x, y, vw, vh, { leftHanded = false, stick = 'analog' } = {}) {
  const inHalf = leftHanded ? x >= vw / 2 : x < vw / 2;
  return stick !== 'none' && inHalf && y >= vh * 0.25 ? 'stick' : 'look';
}

/** HUD panels a thumb may land on: a drag that starts on one still drives the pad (the stick or the look); a tap still reaches the panel. */
export const HUD_GRAB = {
  move: 10,   // CSS px of travel before a touch on a panel becomes a stick / look touch
  selector: '#klc-places, #klc-ui .places, #klc-ui .dock, #klc-ui .attr, #klc-x .mini, #klc-x .xdrive, #klc-pad .chip, #klc-pad .gear',
  skip: 'input, select, textarea, .xsearch, .arrivals, .xmap, [data-scroll], #klc-pad .settings',   // (these keep their own drags)
};
/** What a touch that began on a HUD panel does at its current offset: 'wait' (still a tap), 'promote' (a drag: the pad takes it) or
 *  'scroll' (the panel's own scroller is going the way the finger goes: leave it). `axis` is the panel scroller's axis, 'x' | 'y' | null. */
export function grabDecision(dx, dy, axis = null) {
  if (Math.hypot(dx, dy) < HUD_GRAB.move) return 'wait';
  if (axis === 'x' && Math.abs(dx) > Math.abs(dy)) return 'scroll';
  if (axis === 'y' && Math.abs(dy) > Math.abs(dx)) return 'scroll';
  return 'promote';
}
export const mirrorX = (x, width, mirrored) => (mirrored ? width - x : x);

/** A finger drag in CSS px -> look radians. `mult` is the user's sensitivity setting; invertY flips pitch. */
export function lookDelta(dxPx, dyPx, { sens = LOOK.sens, mult = 1, invertY = false } = {}) {
  const k = sens * mult;
  return { dx: dxPx * k, dy: dyPx * k * (invertY ? -1 : 1) };
}
/** The part of the pending look delta applied this frame (exponential smoothing). */
export const smoothTake = (pending, dt, tau = LOOK.tau) => pending * (1 - Math.exp(-Math.max(dt, 0.001) / tau));

/**
 * Where the buttons sit, as offsets of their centres from the primary button's centre (CSS px, y down).
 * The primary is the big one at the thumb's rest; the others fan out in an arc up and away from the screen edge
 * (three on the first ring, then a second ring). `hand` 'right' = a right-handed layout; 'left' mirrors it.
 */
export function clusterLayout(n, { scale = 1, hand = 'right' } = {}) {
  const P = BTN.primary * scale, S = Math.max(BTN.min, BTN.size * scale);
  // the first ring: the nominal radius, or wider when the 56 px floor would make neighbours (46 degrees apart) touch
  const R1 = Math.max(BTN.ring * scale, (S + 6) / (2 * Math.sin(23 * Math.PI / 180))), R2 = R1 + S + BTN.gap * scale;
  const ring1 = { 1: [135], 2: [112, 160], 3: [92, 138, 184] };
  const out = [{ x: 0, y: 0, size: P, primary: true }];
  const rest = Math.max(0, n - 1), a = Math.min(3, rest), b = rest - a;
  const put = (angles, R) => angles.forEach((deg) => { const t = deg * Math.PI / 180; out.push({ x: Math.cos(t) * R, y: -Math.sin(t) * R, size: S }); });
  put(ring1[a] || [], R1);
  if (b) put(b === 1 ? [150] : b === 2 ? [118, 166] : b === 3 ? [100, 142, 184] : [100, 128, 156, 184].slice(0, Math.min(4, b)), R2);
  const sign = hand === 'left' ? -1 : 1;
  return out.map((o) => ({ ...o, x: o.x * sign }));
}
/** The box that holds a layout (relative to the primary's centre). */
export function layoutBounds(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x - b.size / 2); y0 = Math.min(y0, b.y - b.size / 2); x1 = Math.max(x1, b.x + b.size / 2); y1 = Math.max(y1, b.y + b.size / 2); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export const rectsOverlap = (a, b, pad = 0) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
/** Lift a box (anchored at the bottom) until it clears the given panel rects { l, t, r, b }: returns its bottom edge. */
export function liftClear(box, bottom, panels, gap = 8, floor = -Infinity) {
  let y1 = bottom;
  for (let i = 0; i < 12; i++) {
    const r = { l: box.l, r: box.l + box.w, t: y1 - box.h, b: y1 };
    const hit = panels.filter((p) => rectsOverlap(r, p, gap)).sort((a, b) => a.t - b.t)[0];
    if (!hit) break;
    y1 = Math.max(floor + box.h, hit.t - gap);
  }
  return y1;
}

/** Is the pad on? ?touch=1 forces it, ?touch=0 forbids it; else a coarse primary pointer or a touch seen so far. */
export function touchEnabled(search = '', { coarse = false, touched = false } = {}) {
  let v = null;
  try { v = new URLSearchParams(search).get('touch'); } catch { /* none */ }
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return !!(coarse || touched);
}

export function loadSettings(raw) {
  let o = {};
  try { o = JSON.parse(raw) || {}; } catch { /* first run */ }
  return { leftHanded: !!o.leftHanded, invertY: !!o.invertY, sens: clamp(Number(o.sens) || 1, 0.5, 1.8), coach: !!o.coach };
}

// ------------------------------------------------------------------ icons (stroke style of ui/hud.js)
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICONS = {
  jump: svg('<path d="M12 18.5V5.5"/><path d="M6.5 11l5.5-5.5L17.5 11"/><path d="M7 21h10" opacity=".55"/>'),
  dash: svg('<path d="M6 11.5l6-6 6 6"/><path d="M6 18.5l6-6 6 6"/>'),
  fly: svg('<path d="M3.5 11.2L20.5 4l-7.2 17-2.4-7.4z"/><path d="M10.9 13.6L20.5 4"/>'),
  board: svg('<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="18.8" r="1.5"/><circle cx="16.5" cy="18.8" r="1.5"/><path d="M6.5 11h11"/>'),
  enter: svg('<path d="M14 4h4.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H14"/><path d="M4 12h9.5"/><path d="M10 8l4 4-4 4"/>'),
  leave: svg('<path d="M10 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H10"/><path d="M10.5 12H20"/><path d="M16.5 8l4 4-4 4"/>'),
  up: svg('<path d="M12 20V6"/><path d="M6 11.5L12 5.5l6 6"/>'),
  down: svg('<path d="M12 4v14"/><path d="M6 12.5l6 6 6-6"/>'),
  boost: svg('<path d="M13.5 3L5.5 13.5H11L10 21l8.5-10.5H13z"/>'),
  land: svg('<path d="M12 4v10"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>'),   // (a down arrow onto the ground; 歩く in flight uses the walker)
  brake: svg('<circle cx="12" cy="12" r="8.5"/><path d="M10 16.5v-9h3.2a2.5 2.5 0 0 1 0 5H10"/>'),
  nitro: svg('<path d="M12 3c.8 3.7 5.2 5.6 5.2 10.2A5.2 5.2 0 0 1 6.8 13.2c0-2.1 1-3.4 2.2-4.5.3 1.4 1 2.2 1.8 2.6C10.4 8.6 10.9 5.7 12 3z"/>'),
  getout: svg('<path d="M10 4H5.5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1H10"/><path d="M10.5 12H20"/><path d="M16.5 8l4 4-4 4"/>'),
  walk: svg('<circle cx="13" cy="4.5" r="2"/><path d="M11 21l2-6 3 3v3"/><path d="M8 12l3-4 3 2 3 1"/><path d="M11 8l-1 5 3 2"/>'),
  car: svg('<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="18.5" r="1.6"/><circle cx="16.5" cy="18.5" r="1.6"/><path d="M6.5 11h11"/>'),
  sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  hand: svg('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M14 11.5V7a1.5 1.5 0 0 1 3 0v8c0 3.5-2 6-5.5 6-3 0-4.2-1.6-5.7-4l-1.6-2.6a1.5 1.5 0 0 1 2.4-1.7L8 14"/>'),
};

/** The built-in button sets. `act` is the host: { emit(id), contextKind(), context(), board(), getOut(), ... } (the specs are plain data, so tests pass {}). */
export function builtinModes(act = {}) {
  const call = (n) => (pad) => act[n]?.(pad);
  return {
    walk: { stick: 'analog', buttons: [
      { id: 'jump', label: 'touch.btn.jump', icon: 'jump', onDown: call('jump') },
      { id: 'dash', label: 'touch.btn.dash', icon: 'dash', toggle: true },
      { id: 'fly', label: 'touch.btn.fly', icon: 'fly', onDown: call('fly') },
      { id: 'context', label: () => `touch.btn.${act.contextKind?.() === 'enter' ? 'enter' : act.contextKind?.() === 'leave' ? 'leave' : 'board'}`,
        icon: () => (act.contextKind?.() === 'enter' ? 'enter' : act.contextKind?.() === 'leave' ? 'leave' : 'board'), visible: () => !!act.contextKind?.(), onDown: call('context') },
    ] },
    fly: { stick: 'analog', buttons: [
      { id: 'up', label: 'touch.btn.up', icon: 'up', hold: true },
      { id: 'down', label: 'touch.btn.down', icon: 'down', hold: true },
      { id: 'boost', label: 'touch.btn.boost', icon: 'boost', hold: true },
      { id: 'land', label: 'touch.btn.land', icon: 'walk', onDown: call('land') },
    ] },
    drive: { stick: 'analog', buttons: [
      { id: 'brake', label: 'touch.btn.brake', icon: 'brake', hold: true },
      { id: 'nitro', label: 'touch.btn.nitro', icon: 'nitro', hold: true },
      { id: 'getout', label: 'touch.btn.getout', icon: 'getout', onDown: call('getout') },
    ] },
  };
}
export const BUILTIN_NAMES = ['walk', 'fly', 'drive'];
/** The ids of every button of a mode (what the tests and the sail branch rely on). */
export const buttonIds = (name, extra = null) => ((extra || builtinModes())[name]?.buttons || []).map((b) => b.id);

// ------------------------------------------------------------------ the pad
export function createTouchpad({ canvas, ctx, player = null, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null } = {}) {
  const pad = {
    active: false, ready: false, mode: 'walk', hidden: true,
    move: new THREE.Vector2(), mag: 0, running: false, stickActive: false,
    look: { dx: 0, dy: 0 },
    settings: { ...DEFAULTS },
  };
  if (!doc || !win) return { ...pad, on: () => () => {}, isDown: () => false, takeLook: () => ({ dx: 0, dy: 0 }), registerMode() {}, setMode() {}, mount() {}, update() {}, get vertical() { return 0; }, get dash() { return false; } };

  const params = new URLSearchParams(win.location?.search || '');
  const listeners = new Set();
  const emit = (e) => { for (const f of listeners) try { f(e); } catch (err) { console.error(err); } };
  const store = {
    get() { try { return win.localStorage.getItem(STORE_KEY); } catch { return null; } },
    set(o) { try { win.localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch { /* private mode */ } },
  };
  pad.settings = loadSettings(store.get());
  const held = new Set(), toggled = new Set();
  const suppress = new Set();
  const services = () => ctx?.services || {};
  const explore = () => services().explore || null;
  const drive = () => explore()?.drive || null;
  const tour = () => services().life?.tour || null;
  const pl = () => player || ctx?.playerObj || null;

  // ---- language: follows the HUD's (life), else the stored / ?lang= choice
  let lang = pickLang();
  const tr = (key) => DATA[lang]?.[key] ?? DATA.ja[key] ?? key;
  const text = (v) => { const x = typeof v === 'function' ? v() : v; if (x && typeof x === 'object') return x[lang] ?? x.ja ?? x.en ?? ''; return typeof x === 'string' && x.startsWith('touch.') ? tr(x) : String(x ?? ''); };
  const iconOf = (v) => { const x = typeof v === 'function' ? v() : v; return typeof x === 'string' && ICONS[x] ? ICONS[x] : String(x || ''); };

  // ---- modes
  const act = {
    jump: () => {}, fly: () => {}, land: () => {},
    contextKind: () => ctxState.kind,
    context() {
      const k = ctxState.kind, p = pl();
      if (k === 'board') { if (!drive()?.enter()) note(tr('touch.note.noRoad')); }
      else if ((k === 'enter' || k === 'leave') && ctxState.door && p) {
        // the interiors' own poses (explore/interiors.js): walk in at the door's inside pose, or back out to its entrance
        const d = ctxState.door, to = k === 'enter' ? d.inside : d.entrance;
        if (to) { tour()?.stop?.(); p.fly = false; p.setPose(to.x, to.z, to.yaw ?? 0, to.pitch ?? 0); }
      }
    },
    getOut: () => drive()?.exit(),
  };
  act.getout = act.getOut;
  const modes = new Map(Object.entries(builtinModes(act)));
  const custom = new Set();
  let explicit = false;
  /** Register a game mode (the 第一昭福丸 sail mode will: 停止, 自動操船, 4×, 町へ戻る). */
  function registerMode(name, spec) {
    if (!name || typeof name !== 'string') throw new Error('pad.registerMode: a name is required');
    if (BUILTIN_NAMES.includes(name)) throw new Error('pad.registerMode: "' + name + '" is a built-in mode');
    const buttons = (spec?.buttons || []).map((b) => ({ ...b }));
    const ids = new Set();
    for (const b of buttons) { if (!b.id || ids.has(b.id)) throw new Error('pad.registerMode: every button needs a unique id'); ids.add(b.id); }
    if (spec?.stick && !['analog', 'none'].includes(spec.stick)) throw new Error('pad.registerMode: stick is "analog" or "none"');
    modes.set(name, { stick: spec?.stick || 'analog', buttons, onEnter: spec?.onEnter, onExit: spec?.onExit });
    custom.add(name);
    return pad;
  }
  function setMode(name) {
    if (name == null || name === 'auto') { explicit = false; applyMode(derive(), true); return pad.mode; }
    if (!modes.has(name)) throw new Error('pad.setMode: unknown mode "' + name + '"');
    explicit = custom.has(name);
    applyMode(name, true);
    return pad.mode;
  }
  function applyMode(name, force = false) {
    if (name === pad.mode && !force) return;
    const prev = pad.mode;
    modes.get(prev)?.onExit?.(pad);
    for (const id of [...held]) releaseId(id, true);
    toggled.clear();
    pad.mode = name;
    modes.get(name)?.onEnter?.(pad);
    if (!(modes.get(name)?.stick !== 'none')) endStick();
    dirty.buttons = dirty.layout = true;
    emit({ type: 'mode', id: name, mode: name, prev });
  }
  const derive = () => (drive()?.active ? 'drive' : pl()?.fly ? 'fly' : 'walk');

  // ---- context (a car to board, a door to enter), refreshed at 4 Hz
  const ctxState = { kind: null, door: null, t: 0 };
  function readContext() {
    const p = pl(), ex = explore(), dr = drive();
    let kind = null, door = null;
    if (p && pad.mode === 'walk' && !dr?.active) {
      const cam = ctx.camera?.position;
      const inside = cam && ex?.interiors?.at ? ex.interiors.at(cam.x, cam.y, cam.z) : null;
      const list = ex?.interiors?.list || [];
      if (inside) {
        const d = list.find((i) => i.id === inside && i.entrance);
        if (d) { kind = 'leave'; door = d; }
      } else {
        let best = 8;
        for (const i of list) { if (!i.entrance || !i.inside) continue; const dd = Math.hypot(i.entrance.x - p.pos.x, i.entrance.z - p.pos.z); if (dd < best) { best = dd; door = i; kind = 'enter'; } }
      }
      if (!kind && dr?.canEnter?.(14)) kind = 'board';
    }
    if (kind !== ctxState.kind || door !== ctxState.door) { ctxState.kind = kind; ctxState.door = door; dirty.buttons = true; }
  }

  // ---- DOM
  let root = null, safe = null, ghost = null, base = null, cluster = null, topbar = null, chip = null, settingsEl = null, coachEl = null, noteEl = null, gearBtn = null, tagEl = null;
  const dirty = { buttons: true, layout: true, text: true };
  const geom = { scale: 1, baseR: 64, knobR: 26 };

  function note(msg) {
    if (!noteEl) return;
    noteEl.textContent = msg; noteEl.classList.add('show');
    clearTimeout(note.t); note.t = setTimeout(() => noteEl.classList.remove('show'), 2200);
  }
  function mount() {
    if (root || !doc.body) return;
    root = doc.createElement('div'); root.id = 'klc-pad'; root.dataset.hidden = '1'; root.dataset.idle = '0'; root.dataset.hand = pad.settings.leftHanded ? 'left' : 'right'; root.dataset.mode = pad.mode;
    root.setAttribute('lang', lang);
    root.innerHTML = `
      <div class="ghost ctl" aria-hidden="true"><i class="ring"></i><i class="knob"></i><i class="dir"></i></div>
      <div class="stick" aria-hidden="true"><i class="ring"></i><i class="knob"></i><b class="tag"></b></div>
      <div class="safe">
        <div class="topbar ctl">
          <div class="chip" role="group"></div>
          <button class="gear" type="button" data-act="settings">${ICONS.sliders}</button>
          <section class="settings" hidden>
            <h4></h4>
            <div class="row"><span><b data-t="touch.settings.lefty"></b><small data-t="touch.settings.lefty.hint"></small></span><button type="button" role="switch" class="sw" data-set="leftHanded"><i></i></button></div>
            <div class="row"><span><b data-t="touch.settings.invertY"></b></span><button type="button" role="switch" class="sw" data-set="invertY"><i></i></button></div>
            <div class="row col"><span><b data-t="touch.settings.sens"></b><output></output></span><input type="range" min="0.5" max="1.8" step="0.05" data-set="sens"></div>
          </section>
        </div>
        <div class="cluster ctl"></div>
        <div class="coach" hidden role="dialog">
          <div class="hd"><i class="l">${ICONS.hand}</i><h3 data-t="touch.coach.title"></h3><i class="r">${ICONS.hand}</i></div>
          <button type="button" class="ok" data-act="coach" data-t="touch.coach.ok"></button>
        </div>
        <div class="note" role="status" aria-live="polite"></div>
      </div>`;
    doc.body.appendChild(root);
    safe = root.querySelector('.safe'); ghost = root.querySelector('.ghost'); base = root.querySelector('.stick'); cluster = root.querySelector('.cluster');
    topbar = root.querySelector('.topbar'); chip = root.querySelector('.chip'); settingsEl = root.querySelector('.settings'); coachEl = root.querySelector('.coach'); noteEl = root.querySelector('.note');
    gearBtn = root.querySelector('.gear'); tagEl = root.querySelector('.stick .tag');
    wireDom();
    dirty.buttons = dirty.layout = dirty.text = true;
    pad.ready = true;
  }

  function renderText() {
    root.setAttribute('lang', lang);
    for (const n of root.querySelectorAll('[data-t]')) n.textContent = tr(n.dataset.t);
    root.querySelector('.settings h4').textContent = tr('touch.settings.title');
    gearBtn.setAttribute('aria-label', tr('touch.settings'));
    chip.setAttribute('aria-label', tr('touch.mode.label'));
    chip.innerHTML = BUILTIN_NAMES.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${pad.mode === m}">${ICONS[m === 'walk' ? 'walk' : m === 'fly' ? 'fly' : 'car']}<span>${tr('touch.mode.' + m)}</span></button>`).join('');
    syncSettingsUi();
    renderButtons();
  }
  function syncSettingsUi() {
    if (!root) return;
    for (const b of root.querySelectorAll('.sw')) b.setAttribute('aria-checked', String(!!pad.settings[b.dataset.set]));
    const r = root.querySelector('input[data-set="sens"]'); if (r) { r.value = String(pad.settings.sens); r.setAttribute('aria-label', tr('touch.settings.sens')); }
    const o = root.querySelector('.settings output'); if (o) o.textContent = '×' + pad.settings.sens.toFixed(2);
    root.dataset.hand = pad.settings.leftHanded ? 'left' : 'right';
  }
  function currentButtons() { return modes.get(pad.mode)?.buttons || []; }
  function renderButtons() {
    if (!cluster) return;
    const specs = currentButtons();
    cluster.innerHTML = specs.map((b, i) => {
      const id = String(b.id), tg = !!b.toggle;
      return `<button type="button" class="btn${i === 0 ? ' primary' : ''}" data-id="${id}" data-i="${i}" ${tg ? `aria-pressed="${toggled.has(id)}"` : ''} aria-label="${text(b.label)}">
        <span class="ico">${iconOf(b.icon)}</span><span class="lbl">${text(b.label)}</span></button>`;
    }).join('');
    root.dataset.mode = pad.mode; root.dataset.nostick = modes.get(pad.mode)?.stick === 'none' ? '1' : '0';
    for (const m of chip.querySelectorAll('button[data-mode]')) m.setAttribute('aria-pressed', String(pad.mode === m.dataset.mode));
    syncButtons();
    dirty.buttons = false; dirty.layout = true;
  }
  /** Visibility, labels and pressed states of the current buttons without rebuilding them. */
  function syncButtons() {
    if (!cluster) return;
    const specs = currentButtons();
    for (const el of cluster.children) {
      const b = specs[Number(el.dataset.i)]; if (!b) continue;
      const vis = b.visible ? !!b.visible(pad) : true;
      el.dataset.show = vis ? '1' : '0';
      if (vis) {
        const l = text(b.label); const lb = el.querySelector('.lbl'); if (lb.textContent !== l) { lb.textContent = l; el.setAttribute('aria-label', l); }
        const ic = iconOf(b.icon); const ie = el.querySelector('.ico'); if (ie.dataset.k !== ic) { ie.innerHTML = ic; ie.dataset.k = ic; }
      }
      el.classList.toggle('down', held.has(String(b.id)));
      if (b.toggle) el.setAttribute('aria-pressed', String(toggled.has(String(b.id))));
    }
  }

  // ---- layout (measured against the other panels: nothing of the pad sits on them)
  const PANELS = ['#klc-ui .dock', '#klc-ui .places', '#klc-ui .attr', '#klc-x .xdrive', '#klc-x .mini', '#klc-x .xbar'];   // (the last two only matter on a desktop with ?touch=1: on a phone they sit up top)
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden' ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const panelRects = () => PANELS.flatMap((s) => [...doc.querySelectorAll(s)]).map(rectOf).filter(Boolean);
  /** The coach mark goes in the free band between the top panels and the thumbs' controls (scaled down if the band is short). */
  function placeCoach(sa, vw, vh) {
    if (!coachEl || coachEl.hidden) return;
    const w = Math.min(300, sa.width - 120), cx = sa.left + sa.width / 2, x0 = cx - w / 2, x1 = cx + w / 2;
    const obs = [...doc.querySelectorAll('#klc-ui .brand, #klc-ui .tools, #klc-ui .places, #klc-ui .dock, #klc-ui .attr, #klc-x .mini, #klc-x .xbar, #klc-x .xdrive')].map(rectOf).filter(Boolean);
    for (const e of [topbar, ghost, cluster]) { const r = rectOf(e); if (r) obs.push(r); }
    let top = sa.top + 8, bottom = sa.bottom - 8;
    for (const r of obs) if (r.r > x0 && r.l < x1) { if ((r.t + r.b) / 2 < vh / 2) top = Math.max(top, r.b + 8); else bottom = Math.min(bottom, r.t - 8); }
    const h = coachEl.offsetHeight || 170, avail = Math.max(60, bottom - top);
    coachEl.style.setProperty('--cs', String(avail < h ? Math.max(0.55, avail / h).toFixed(3) : 1));
    coachEl.style.setProperty('--cy', ((top + bottom) / 2 - sa.top).toFixed(1) + 'px');
    void vw;
  }
  function layout() {
    if (!root) return;
    const vw = win.innerWidth, vh = win.innerHeight, sc = padScale(vw, vh), lefty = pad.settings.leftHanded;
    geom.scale = sc; geom.baseR = (STICK.travel * sc) + STICK.base * sc; geom.knobR = STICK.knob * sc / 2;
    root.style.setProperty('--ps', String(sc));
    root.style.setProperty('--base', (geom.baseR * 2) + 'px');
    root.style.setProperty('--knob', (geom.knobR * 2) + 'px');
    const sa = safe.getBoundingClientRect();
    const panels = panelRects();
    const M = 12 * sc + 4, floor = sa.top + 56;
    // the action cluster: bottom corner of the thumb's side, lifted clear of the panels
    const specs = currentButtons(), lay = clusterLayout(specs.length, { scale: sc, hand: lefty ? 'left' : 'right' }), bb = layoutBounds(lay);
    const boxL = lefty ? sa.left + M : sa.right - M - bb.w;
    const bottom = liftClear({ l: boxL, w: bb.w, h: bb.h }, sa.bottom - M, panels, 8, floor);
    const top = bottom - bb.h;
    cluster.style.cssText = `left:${(boxL - sa.left).toFixed(1)}px;top:${(top - sa.top).toFixed(1)}px;width:${bb.w.toFixed(1)}px;height:${bb.h.toFixed(1)}px`;
    for (const el of cluster.children) {
      const L = lay[Number(el.dataset.i)]; if (!L) continue;
      el.style.cssText = `left:${(L.x - L.size / 2 - bb.x0).toFixed(1)}px;top:${(L.y - L.size / 2 - bb.y0).toFixed(1)}px;width:${L.size.toFixed(1)}px;height:${L.size.toFixed(1)}px`;
      el.dataset.size = L.size.toFixed(0);
    }
    // the ghost stick: the other bottom corner
    const gs = geom.baseR * 2, gl = lefty ? sa.right - M - gs : sa.left + M + 8 * sc;
    const gb = liftClear({ l: gl, w: gs, h: gs }, sa.bottom - M - 6 * sc, panels, 8, floor);
    ghost.style.cssText = `left:${gl.toFixed(1)}px;top:${(gb - gs).toFixed(1)}px;width:${gs}px;height:${gs}px`;   // (the ghost is a child of the root, not of the safe box)
    // the mode chip: top left (as in the mobile games), below the brand and the minimap when they are in that corner
    const left = [...doc.querySelectorAll('#klc-ui .brand, #klc-x .mini')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 1 && r.left < vw * 0.25 && r.top < vh * 0.5);
    const below = left.reduce((m, r) => Math.max(m, r.bottom), sa.top);
    topbar.style.cssText = `top:${(below + 8 - sa.top).toFixed(1)}px;left:${(10 * sc).toFixed(1)}px`;
    // (on a phone in portrait the search / map / drive buttons are a row right of the minimap, and the car's speed chip under it:
    // see touchpad-style.js; with no minimap they go under the chip)
    const mini = doc.querySelector('#klc-x .mini')?.getBoundingClientRect();
    const beside = mini && mini.width > 1 && mini.left < vw * 0.25 && mini.top < vh * 0.5;
    doc.documentElement.style.setProperty('--pad-xbar-top', ((beside ? mini.top + 8 : topbar.getBoundingClientRect().bottom + 8)).toFixed(0) + 'px');
    doc.documentElement.style.setProperty('--pad-xbar-left', ((beside ? mini.right + 10 : sa.left + 10)).toFixed(0) + 'px');
    placeCoach(sa, vw, vh);
    dirty.layout = false;
    layout.sig = signature();
  }
  function signature() { const p = panelRects(); const sb = safe.getBoundingClientRect(); return [sb.left, sb.top, sb.right, sb.bottom].map(Math.round).join(',') + '|' + win.innerWidth + 'x' + win.innerHeight + ':' + pad.settings.leftHanded + ':' + pad.mode + ':' + currentButtons().length + ':' + p.map((r) => [r.l, r.t, r.r, r.b].map(Math.round).join(',')).join(';') + ':' + [...doc.querySelectorAll('#klc-ui .brand, #klc-x .mini')].map((e) => Math.round(e.getBoundingClientRect().bottom)).join(','); }

  // ---- touch: stick + look on the canvas, by touch identifier
  const touches = new Map();   // id -> { role, x0, y0, x, y }
  let stickId = null, lookId = null, lastRun = false, lastTouchAt = performance.now();
  const spring = { x: 0, y: 0, vx: 0, vy: 0, on: false };
  const vibrate = (ms = 8) => { try { win.navigator?.vibrate?.(ms); } catch { /* unsupported (iOS) */ } };
  const ignoring = () => !pad.active || pad.hidden;
  const poke = () => { lastTouchAt = performance.now(); if (root && root.dataset.idle !== '0') root.dataset.idle = '0'; };

  // (ox, oy: where the thumb first landed, when it is promoted from a HUD panel after some travel; the base and the dead zone are
  // anchored there, not at the current point, so none of the travel is lost)
  function startStick(t, ox = t.clientX, oy = t.clientY) {
    stickId = t.identifier;
    touches.set(t.identifier, { role: 'stick', x0: ox, y0: oy, x: t.clientX, y: t.clientY });
    spring.on = false;
    base.style.transform = `translate3d(${ox - geom.baseR}px, ${oy - geom.baseR}px, 0)`;
    base.dataset.on = '1'; base.dataset.run = '0'; root.dataset.stick = '1';
    setKnob(0, 0);
    pad.stickActive = true;
    dismissCoach();
  }
  function setKnob(x, y) { base.style.setProperty('--kx', x.toFixed(1) + 'px'); base.style.setProperty('--ky', y.toFixed(1) + 'px'); }
  function moveStick(t) {
    const s = touches.get(t.identifier); if (!s) return;
    s.x = t.clientX; s.y = t.clientY;
    const r = stickMath(s.x - s.x0, s.y - s.y0, { scale: geom.scale, prevRun: lastRun });
    pad.move.set(r.x, r.y); pad.mag = r.mag; pad.running = r.run;
    if (r.run !== lastRun) { lastRun = r.run; if (r.run) vibrate(6); }
    base.dataset.run = r.run ? '1' : '0';
    tagEl.textContent = r.run ? tr(pad.mode === 'drive' ? 'touch.boost.on' : 'touch.run') : '';
    setKnob(r.knob.x, r.knob.y);
    spring.x = r.knob.x; spring.y = r.knob.y;
  }
  function endStick() {
    if (stickId == null && !pad.stickActive) { pad.move.set(0, 0); pad.mag = 0; pad.running = false; return; }
    touches.delete(stickId); stickId = null;
    pad.move.set(0, 0); pad.mag = 0; pad.running = false; lastRun = false; pad.stickActive = false;
    if (base) { base.dataset.run = '0'; tagEl.textContent = ''; spring.on = true; spring.vx = spring.vy = 0; }
  }
  function onTouchStart(e) {
    if (!pad.active) { if (touchEnabled(win.location?.search, { touched: true })) activate(); else return; }
    poke();
    if (pad.hidden) return;
    for (const t of e.changedTouches) {
      if (touches.has(t.identifier)) continue;
      const zone = touchZone(t.clientX, t.clientY, win.innerWidth, win.innerHeight, { leftHanded: pad.settings.leftHanded, stick: modes.get(pad.mode)?.stick });
      if (zone === 'stick' && stickId == null) startStick(t);
      else if (lookId == null) startLook(t);
    }
    e.preventDefault();
  }
  function startLook(t) { lookId = t.identifier; touches.set(t.identifier, { role: 'look', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }); dismissCoach(); }

  // ---- a thumb that lands on a HUD panel (places strip, time dock, credit line, minimap, mode chip): the panel owns the touch for a
  // tap, but a drag of more than HUD_GRAB.move px hands it to the pad (the zone of where it landed: stick or look). Document capture
  // phase, because the panel (not the canvas) is the touch's target.
  const grabs = new Map();   // touch id -> { x0, y0, axis, state: 'pending' | 'live' | 'dead' }
  const scrollAxis = (el) => {
    const u = el.closest?.('ul, ol'); if (!u) return null;
    if (u.scrollWidth > u.clientWidth + 1) return 'x';
    if (u.scrollHeight > u.clientHeight + 1) return 'y';
    return null;
  };
  function onGrabStart(e) {
    if (!pad.active || pad.hidden) return;
    for (const t of e.changedTouches) {
      const el = t.target;
      if (touches.has(t.identifier) || grabs.has(t.identifier) || !el || el === canvas || !el.closest) continue;
      if (!el.closest(HUD_GRAB.selector) || el.closest(HUD_GRAB.skip) || el.closest('#klc-pad .cluster')) continue;
      grabs.set(t.identifier, { x0: t.clientX, y0: t.clientY, axis: scrollAxis(el), state: 'pending' });
    }
  }
  function onGrabMove(e) {
    if (!pad.active || !grabs.size) return;
    let took = false;
    for (const t of e.changedTouches) {
      const g = grabs.get(t.identifier); if (!g || g.state === 'dead') continue;
      if (g.state === 'pending') {
        const d = grabDecision(t.clientX - g.x0, t.clientY - g.y0, g.axis);
        if (d === 'wait') continue;
        if (d === 'scroll') { g.state = 'dead'; continue; }
        const zone = touchZone(g.x0, g.y0, win.innerWidth, win.innerHeight, { leftHanded: pad.settings.leftHanded, stick: modes.get(pad.mode)?.stick });
        if (zone === 'stick' && stickId == null) startStick(t, g.x0, g.y0); else if (lookId == null) startLook(t); else { g.state = 'dead'; continue; }
        g.state = 'live'; poke();
      }
      moveTouch(t); took = true;
    }
    if (took && e.cancelable) e.preventDefault();
  }
  function onGrabEnd(e) {
    if (!grabs.size) return;
    let live = false;
    for (const t of e.changedTouches) { const g = grabs.get(t.identifier); if (g) { live = live || g.state === 'live'; grabs.delete(t.identifier); } }
    if (live) { onTouchEnd(e); if (e.type === 'touchend' && e.cancelable) e.preventDefault(); }   // (no ghost click on the panel under the finger)
  }
  const acc = { dx: 0, dy: 0 };
  function onTouchMove(e) {
    if (!pad.active) return;
    poke();
    for (const t of e.changedTouches) moveTouch(t);
    e.preventDefault();
  }
  function moveTouch(t) {
    const s = touches.get(t.identifier); if (!s) return;
    if (s.role === 'stick') moveStick(t);
    else {
      const d = lookDelta(t.clientX - s.x, t.clientY - s.y, { mult: pad.settings.sens, invertY: pad.settings.invertY });
      acc.dx += d.dx; acc.dy += d.dy; s.x = t.clientX; s.y = t.clientY;
    }
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      if (s.role === 'stick') endStick(); else { lookId = null; touches.delete(t.identifier); }
    }
    poke();
  }

  /** Smoothed look radians for this frame (the player calls it once per frame). */
  function takeLook(dt = 1 / 60) {
    const dx = smoothTake(acc.dx, dt), dy = smoothTake(acc.dy, dt);
    acc.dx -= dx; acc.dy -= dy;
    if (Math.abs(acc.dx) < 1e-6) acc.dx = 0; if (Math.abs(acc.dy) < 1e-6) acc.dy = 0;
    pad.look.dx = dx; pad.look.dy = dy;
    return pad.look;
  }

  // ---- buttons (pointer events: each finger its own pointer id, so hold buttons and the stick work together)
  const ptr = new Map();   // pointerId -> button id
  const spec = (id) => currentButtons().find((b) => String(b.id) === id);
  function pressId(id, el) {
    const b = spec(id); if (!b || (b.visible && !b.visible(pad))) return;
    poke(); vibrate(8);
    if (b.toggle) {
      if (toggled.has(id)) toggled.delete(id); else toggled.add(id);
      el?.setAttribute('aria-pressed', String(toggled.has(id)));
      emit({ type: toggled.has(id) ? 'down' : 'up', id, mode: pad.mode, toggle: true });
      b.onDown?.(pad, toggled.has(id));
      return;
    }
    held.add(id); el?.classList.add('down');
    emit({ type: 'down', id, mode: pad.mode });
    b.onDown?.(pad);
  }
  function releaseId(id, silent = false) {
    if (!held.has(id)) return;
    held.delete(id);
    const el = cluster?.querySelector(`[data-id="${CSS.escape(id)}"]`); el?.classList.remove('down');
    const b = spec(id);
    if (!silent) emit({ type: 'up', id, mode: pad.mode });
    b?.onUp?.(pad);
  }

  // ---- settings / coach
  function setSetting(k, v) {
    pad.settings[k] = k === 'sens' ? clamp(Number(v) || 1, 0.5, 1.8) : !!v;
    store.set(pad.settings); syncSettingsUi(); dirty.layout = true;
    if (k === 'leftHanded') { endStick(); dirty.buttons = true; }
    emit({ type: 'settings', id: k, mode: pad.mode });
  }
  function showCoach() {
    if (!coachEl || !coachEl.hidden) return;
    coachEl.hidden = false; coachEl.dataset.show = '1'; dirty.layout = true;
    pad.settings.coach = true; store.set(pad.settings);
    clearTimeout(showCoach.t); showCoach.t = setTimeout(dismissCoach, 12000);
  }
  function dismissCoach() {
    if (!coachEl || coachEl.hidden) return;
    coachEl.dataset.show = '0';
    clearTimeout(showCoach.t);
    setTimeout(() => { if (coachEl.dataset.show === '0') coachEl.hidden = true; }, 260);
  }
  const mayCoach = () => !pad.settings.coach || params.get('coach') === '1';

  function wireDom() {
    const onPtrDown = (e) => {
      const b = e.target.closest?.('button.btn'); if (!b || !cluster.contains(b) || ignoring()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch { /* ok */ }
      ptr.set(e.pointerId, b.dataset.id); pressId(b.dataset.id, b);
    };
    const onPtrUp = (e) => { const id = ptr.get(e.pointerId); if (id == null) return; ptr.delete(e.pointerId); releaseId(id); poke(); };
    cluster.addEventListener('pointerdown', onPtrDown);
    cluster.addEventListener('pointerup', onPtrUp); cluster.addEventListener('pointercancel', onPtrUp); cluster.addEventListener('lostpointercapture', onPtrUp);
    // the mode chip and the settings
    root.addEventListener('click', (e) => {
      poke();
      const m = e.target.closest('button[data-mode]');
      if (m) { switchTo(m.dataset.mode); return; }
      const a = e.target.closest('[data-act]');
      if (a?.dataset.act === 'settings') { settingsEl.hidden = !settingsEl.hidden; gearBtn.setAttribute('aria-expanded', String(!settingsEl.hidden)); }
      else if (a?.dataset.act === 'coach') dismissCoach();
      const sw = e.target.closest('.sw'); if (sw) setSetting(sw.dataset.set, !pad.settings[sw.dataset.set]);
    });
    root.querySelector('input[data-set="sens"]').addEventListener('input', (e) => setSetting('sens', e.target.value));
    // iOS: a touch on a button or the chip never scrolls, zooms or fires a ghost click; the settings keep their native sliders
    root.addEventListener('touchstart', (e) => { if (e.target.closest('.cluster')) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  /** The mode chip: 歩く / 飛ぶ / 運転 as quick switches. */
  function switchTo(m) {
    const p = pl(), dr = drive();
    explicit = false;
    if (m === 'drive') { if (!dr?.active && !dr?.enter()) note(tr('touch.note.noRoad')); }
    else {
      if (dr?.active) dr.exit();
      if (p) { p.fly = m === 'fly'; if (m === 'fly') p.vy = 0; }
    }
    applyMode(derive(), true);
  }

  // ---- iOS hardening: no pinch / gesture zoom, no scroll on a stray touchmove (scrollable panels excepted)
  let hardened = false;
  function harden() {
    if (hardened) return; hardened = true;
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    doc.addEventListener('touchmove', (e) => { if (pad.active && !e.target.closest?.('ul, ol, input, select, textarea, .xsearch, .arrivals, [data-scroll]')) e.preventDefault(); }, { passive: false });
    // double-tap zoom: a second tap within 350 ms on anything that is not a text field
    let lastEnd = 0;
    doc.addEventListener('touchend', (e) => { const n = performance.now(); if (pad.active && n - lastEnd < 350 && (e.target === canvas || e.target.closest?.('#klc-pad .cluster'))) e.preventDefault(); lastEnd = n; }, { passive: false });
    doc.addEventListener('touchstart', poke, { capture: true, passive: true });
    doc.addEventListener('touchstart', onGrabStart, { capture: true, passive: true });
    doc.addEventListener('touchmove', onGrabMove, { capture: true, passive: false });
    doc.addEventListener('touchend', onGrabEnd, { capture: true, passive: false }); doc.addEventListener('touchcancel', onGrabEnd, { capture: true, passive: false });
    canvas?.addEventListener('contextmenu', (e) => { if (pad.active) e.preventDefault(); });
  }

  // ---- activation
  let styleEl = null;
  function activate() {
    if (pad.active) return;
    pad.active = true;
    doc.body.classList.add('klc-pad'); doc.documentElement.classList.add('klc-pad-root');
    if (!styleEl) { styleEl = doc.createElement('style'); styleEl.id = 'klc-pad-css'; styleEl.textContent = PAD_CSS; doc.head.appendChild(styleEl); }
    mount(); harden();
    if (canvas) canvas.style.touchAction = 'none';
    dirty.buttons = dirty.layout = dirty.text = true;
  }
  function deactivate() {
    if (!pad.active) return;
    pad.active = false; endStick(); lookId = null; touches.clear(); grabs.clear(); acc.dx = acc.dy = 0;
    doc.body.classList.remove('klc-pad'); doc.documentElement.classList.remove('klc-pad-root'); root?.remove(); root = null; pad.ready = false;
  }

  // ---- per frame
  let langAt = 0, ctxAt = 0, sigAt = 0;
  function update(dt = 0) {
    if (!pad.active || !root) return;
    const now = performance.now();
    // language follows the HUD
    if (now - langAt > 500) {
      langAt = now;
      const hl = services().life?.hud?.i18n?.lang; if (hl && hl !== lang && DATA[hl]) { lang = hl; dirty.text = true; }
    }
    // the mode follows the player and the car unless a registered mode holds it
    if (!explicit) { const d = derive(); if (d !== pad.mode) applyMode(d); }
    if (now - ctxAt > 250) { ctxAt = now; readContext(); }
    const cl = doc.body.classList;
    const hide = !cl.contains('playing') || cl.contains('noui') || cl.contains('shot') || cl.contains('klc-photo') || cl.contains('cinematic') || cl.contains('film')
      || !!tour()?.playing || !!tour()?.flying || !!ctx?.planet?.active || suppress.size > 0;
    if (hide !== pad.hidden) {
      pad.hidden = hide; root.dataset.hidden = hide ? '1' : '0';
      if (hide) { endStick(); lookId = null; grabs.clear(); for (const [k, v] of touches) if (v.role === 'look') touches.delete(k); for (const id of [...held]) releaseId(id, true); settingsEl.hidden = true; }
      else { dirty.layout = true; if (mayCoach()) setTimeout(() => { if (!pad.hidden) showCoach(); }, 700); }
    }
    if (dirty.text) { renderText(); dirty.text = false; }
    if (dirty.buttons) renderButtons(); else syncButtons();
    if (now - sigAt > 400) { sigAt = now; if (layout.sig !== signature()) dirty.layout = true; }
    if (dirty.layout) layout();
    // fade to 35 % after 4 s without a touch (a held stick or button counts as a touch)
    const busy = touches.size > 0 || held.size > 0 || !settingsEl.hidden || !coachEl.hidden;
    if (busy) lastTouchAt = now;
    const idle = now - lastTouchAt > IDLE_MS;
    if ((root.dataset.idle === '1') !== idle) root.dataset.idle = idle ? '1' : '0';
    // the spring that brings the knob home
    if (spring.on && dt > 0) {
      const k = 420, c = 26, h = Math.min(dt, 1 / 30);
      spring.vx += (-k * spring.x - c * spring.vx) * h; spring.vy += (-k * spring.y - c * spring.vy) * h;
      spring.x += spring.vx * h; spring.y += spring.vy * h;
      setKnob(spring.x, spring.y);
      if (Math.hypot(spring.x, spring.y) < 0.4 && Math.hypot(spring.vx, spring.vy) < 8) { spring.on = false; setKnob(0, 0); base.dataset.on = '0'; if (!pad.stickActive) root.dataset.stick = '0'; }
    } else if (spring.on && dt === 0) { spring.on = false; setKnob(0, 0); base.dataset.on = '0'; if (!pad.stickActive) root.dataset.stick = '0'; }
  }

  // ---- public surface
  Object.defineProperties(pad, Object.getOwnPropertyDescriptors({
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    isDown: (id) => held.has(id),
    registerMode, setMode, mount, update, layout: () => { dirty.layout = true; if (root) layout(); }, takeLook, activate, deactivate, setSetting, note, showCoach, dismissCoach,
    suppress(reason, on = true) { if (on) suppress.add(reason); else suppress.delete(reason); },
    get vertical() { return (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0); },
    get dash() { return toggled.has('dash'); },
    get brake() { return held.has('brake'); },
    get boost() { return held.has('boost') || held.has('nitro'); },
    get modes() { return [...modes.keys()]; },
    get el() { return root; },
    get rects() { return root ? { ghost: ghost.getBoundingClientRect(), cluster: [...cluster.children].filter((b) => b.dataset.show !== '0').map((b) => b.getBoundingClientRect()), chip: chip.getBoundingClientRect(), gear: gearBtn.getBoundingClientRect() } : null; },
    geometry: geom,
  }));
  // the player consumes the jump / fly / land buttons through the event bus
  act.jump = () => emit({ type: 'action', id: 'jump', mode: pad.mode });
  act.fly = () => emit({ type: 'action', id: 'fly', mode: pad.mode });
  act.land = () => emit({ type: 'action', id: 'land', mode: pad.mode });

  // ---- wire up
  if (canvas) {
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd); canvas.addEventListener('touchcancel', onTouchEnd);
  }
  win.addEventListener('resize', () => { dirty.layout = true; });
  win.addEventListener('orientationchange', () => { dirty.layout = true; setTimeout(() => { dirty.layout = true; }, 350); });
  win.visualViewport?.addEventListener('resize', () => { dirty.layout = true; });
  const coarse = win.matchMedia?.('(pointer: coarse)');
  coarse?.addEventListener?.('change', () => { if (touchEnabled(win.location?.search, { coarse: coarse.matches })) activate(); });
  const boot = () => { if (touchEnabled(win.location?.search, { coarse: !!coarse?.matches })) activate(); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  ctx?.onUpdate?.((dt) => update(dt));
  return pad;
}
