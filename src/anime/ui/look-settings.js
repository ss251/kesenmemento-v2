// One look setting for every mode (walk, fly, drive, sail, gull, dive) and for the touch drag.
// At speed 1 a mouse pointer-lock pixel is MOUSE_RAD radians, the same rate walk and fly use today.
// An unlocked drag counts DRAG_GAIN CSS px per pixel, which is how walk and fly already treat a drag.
// A touch pixel stays TOUCH_RAD, the pad's rate. invertY flips pitch only.
// Both live in the pad's localStorage key so a phone and a desktop share one value. Reads and writes
// are inside try/catch: a store that throws leaves the in-memory setting as it is.

import TOUCH from '../../../data/ui-touch-i18n.json';
import { pickLang } from './i18n.js';

export const LOOK_KEY = 'klc.pad.v1';
/** Pointer-lock radians per mouse pixel at speed 1 (walk and fly, core/player.js). */
export const MOUSE_RAD = 0.0022;
/** Unlocked mouse-drag pixels are scaled by this before MOUSE_RAD (walk and fly). */
export const DRAG_GAIN = 1.4;
/** Touch-drag radians per CSS pixel at speed 1 (ui/touchpad.js LOOK.sens). */
export const TOUCH_RAD = 0.008;
export const SPEED = { min: 0.3, max: 2.5, step: 0.1, def: 1 };

const closers = new Set();
let state = { speed: SPEED.def, invertY: false };
let hydrated = false;
let blocked = false;
let desk = null;
let deskDoc = null;

export function clampSpeed(v) {
  if (v === '' || v == null) return SPEED.def;
  const n = Number(v);
  if (!Number.isFinite(n)) return SPEED.def;
  const c = Math.min(SPEED.max, Math.max(SPEED.min, n));
  return Math.round(c * 10) / 10;
}

/** `1.0×` — half-width digits, the times sign after the number. */
export function formatSpeed(v) { return clampSpeed(v).toFixed(1) + '×'; }

/** Pad settings from a stored JSON string, an object, or anything unreadable. Never throws. */
export function parsePad(raw) {
  let o = {};
  if (raw && typeof raw === 'object') o = raw;
  else if (typeof raw === 'string' && raw) { try { o = JSON.parse(raw) || {}; } catch { o = {}; } }
  const speed = clampSpeed(o.speed ?? o.sens ?? SPEED.def);
  return { leftHanded: !!o.leftHanded, invertY: !!o.invertY, sens: speed, speed, coach: !!o.coach };
}

export function loadLook(storage) {
  try { return parsePad(storage.getItem(LOOK_KEY)); }
  catch { return parsePad(null); }
}

/** Merge `patch` into the stored object. Returns false when the store throws; the caller keeps its memory copy. */
export function saveLook(storage, patch) {
  try {
    let prev = {};
    try { prev = JSON.parse(storage.getItem(LOOK_KEY)) || {}; } catch { prev = {}; }
    const next = parsePad({ ...prev, ...patch });
    storage.setItem(LOOK_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

function storageOf() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const s = storageOf();
  if (!s) return;
  const p = loadLook(s);
  state = { speed: p.speed, invertY: p.invertY };
}

export function getLook() {
  hydrate();
  return { speed: state.speed, invertY: state.invertY };
}

export function lookBlocked() { return blocked; }

/** Replace the in-memory setting. `persist: false` skips localStorage (tests). A throwing store does not throw here. */
export function setLook(patch = {}, { persist = true } = {}) {
  hydrated = true;
  if (patch.speed != null || patch.sens != null) state.speed = clampSpeed(patch.speed ?? patch.sens);
  if (patch.invertY != null) state.invertY = !!patch.invertY;
  if (persist) { const s = storageOf(); if (s) saveLook(s, { ...patch, speed: state.speed, invertY: state.invertY }); }
}

export function resetLook() {
  hydrated = true;
  state = { speed: SPEED.def, invertY: false };
  blocked = false;
  closers.clear();
  if (desk) {
    try { desk.hidden = true; desk.remove(); } catch { /* already gone */ }
    desk = null;
  }
  deskDoc = null;
}

export function onLookEscape(fn) { closers.add(fn); return () => closers.delete(fn); }

function releaseLock(doc) {
  try { if (doc?.pointerLockElement) doc.exitPointerLock?.(); } catch { /* no lock */ }
}

export function setSheetBlocked(on, doc) {
  blocked = !!on;
  const d = doc || (typeof document !== 'undefined' ? document : null);
  try { d?.body?.classList?.toggle('klc-look-open', blocked); } catch { /* no body */ }
  if (blocked) releaseLock(d);
  ensureKeys(d);
}

function ensureKeys(doc) {
  if (!doc || doc.__klcLookKeys) return;
  try { doc.__klcLookKeys = true; } catch { return; }
  doc.addEventListener('keydown', (e) => {
    if (!blocked) return;
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    for (const fn of [...closers]) { try { fn(); } catch { /* one closer */ } }
  }, true);
}

/**
 * Mouse look, radians to add to yaw and pitch. Positive dx (right) decreases yaw, matching walk.
 * Pitch uses the same magnitude; invertY flips it. While the sheet is open both are 0.
 * `drag` applies DRAG_GAIN (pass raw CSS px). Pointer-lock pixels are already 1:1 — leave drag false,
 * including when a drag was pre-multiplied into the pixel accumulator.
 */
export function mouseLook(dxPx, dyPx, { drag = false, speed, invertY } = {}) {
  if (blocked) return { yaw: 0, pitch: 0 };
  const look = getLook();
  const sp = speed == null ? look.speed : clampSpeed(speed);
  const inv = invertY == null ? look.invertY : !!invertY;
  const k = MOUSE_RAD * sp * (drag ? DRAG_GAIN : 1);
  return { yaw: -dxPx * k, pitch: -dyPx * k * (inv ? -1 : 1) };
}

/** Touch drag, radians. `speed` and `invertY` default to the live setting. */
export function touchLook(dxPx, dyPx, { base = TOUCH_RAD, speed, invertY } = {}) {
  const look = getLook();
  const sp = speed == null ? look.speed : clampSpeed(speed);
  const inv = invertY == null ? look.invertY : !!invertY;
  const k = base * sp;
  return { dx: dxPx * k, dy: dyPx * k * (inv ? -1 : 1) };
}

export function lookControlsHTML(titleId) {
  return `<h4 id="${titleId}" data-t="touch.settings.title"></h4>
    <div class="row"><span><b data-t="touch.settings.lefty"></b><small data-t="touch.settings.lefty.hint"></small></span><button type="button" role="switch" class="sw" data-set="leftHanded"><i></i></button></div>
    <div class="row"><span><b data-t="touch.settings.invertY"></b></span><button type="button" role="switch" class="sw" data-set="invertY"><i></i></button></div>
    <div class="row col"><span><b data-t="touch.settings.sens"></b><output>1.0×</output></span><input type="range" min="${SPEED.min}" max="${SPEED.max}" step="${SPEED.step}" data-set="speed" value="${SPEED.def}"></div>`;
}

export function fillLookSheet(root, tr, settings) {
  if (!root) return;
  const speed = settings.speed ?? settings.sens ?? SPEED.def;
  for (const n of root.querySelectorAll('[data-t]')) n.textContent = tr(n.dataset.t);
  const range = root.querySelector('input[type="range"]');
  if (range) {
    range.value = String(speed);
    range.setAttribute('value', String(speed));
    range.setAttribute('aria-label', tr('touch.settings.sens'));
    range.setAttribute('aria-valuemin', String(SPEED.min));
    range.setAttribute('aria-valuemax', String(SPEED.max));
    range.setAttribute('aria-valuenow', String(speed));
    range.setAttribute('aria-valuetext', formatSpeed(speed));
  }
  const out = root.querySelector('output');
  if (out) out.textContent = formatSpeed(speed);
  for (const b of root.querySelectorAll('.sw')) {
    const on = !!settings[b.dataset.set];
    b.setAttribute('aria-checked', String(on));
    const label = b.parentElement?.querySelector('b')?.textContent;
    if (label) b.setAttribute('aria-label', label);
  }
}

function sheetLang(doc) {
  try {
    const l = doc.getElementById('klc-ui')?.getAttribute('lang');
    if (l === 'en' || l === 'ja') return l;
  } catch { /* fall through */ }
  return pickLang();
}

function trOf(doc) {
  const lang = sheetLang(doc);
  return (key) => TOUCH[lang]?.[key] ?? TOUCH.ja[key] ?? key;
}

/** Keyboard: Tab cycles the sheet, arrows step the slider, Esc closes. */
export function bindLookKeys(root, { onSpeed, onClose, doc }) {
  if (!root || root.__klcLookKeys) return;
  root.__klcLookKeys = true;
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
      return;
    }
    const r = e.target?.matches?.('input[type="range"]') ? e.target : null;
    const arrow = e.key || e.code;
    if (r && (arrow === 'ArrowRight' || arrow === 'ArrowUp' || arrow === 'ArrowLeft' || arrow === 'ArrowDown')) {
      const dir = arrow === 'ArrowRight' || arrow === 'ArrowUp' ? 1 : -1;
      const step = Number(r.step || r.getAttribute('step')) || SPEED.step;
      const cur = Number(r.value != null && r.value !== '' ? r.value : r.getAttribute('value'));
      const next = clampSpeed((Number.isFinite(cur) ? cur : SPEED.def) + dir * step);
      r.value = String(next);
      r.setAttribute('value', String(next));
      e.preventDefault();
      onSpeed?.(next);
      return;
    }
    if ((e.key === 'Tab' || e.code === 'Tab') && doc) {
      const items = [...root.querySelectorAll('button, input')];
      if (items.length < 2) return;
      const i = items.indexOf(doc.activeElement);
      const next = e.shiftKey ? items[(i <= 0 ? items.length : i) - 1] : items[(i + 1) % items.length];
      e.preventDefault();
      next?.focus?.();
    }
  });
}

const LOOK_CSS = `
.klc-look { position: fixed; z-index: 9; top: 72px; right: 16px; width: min(320px, calc(100vw - 32px)); max-height: calc(100dvh - 96px); overflow: auto;
  padding: 16px 16px 8px; border-radius: 16px; background: rgba(251, 250, 245, 0.96); color: #2d3350; pointer-events: auto; line-break: strict;
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif; -webkit-font-smoothing: antialiased;
  box-shadow: 0 16px 40px rgba(23, 24, 75, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2); }
.klc-look[hidden] { display: none; }
.klc-look h4 { margin: 0 0 8px; font: 700 16px/1.3 "Zen Maru Gothic", "Noto Sans JP", sans-serif; color: #1f3a68; letter-spacing: 0.04em;
  word-break: auto-phrase; text-wrap: balance; font-feature-settings: "palt"; }
.klc-look .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; padding: 8px 0; border-top: 1px solid rgba(45, 51, 80, 0.12); }
.klc-look .row.col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.klc-look .row b { display: block; font: 700 16px/1.4 "Zen Maru Gothic", "Noto Sans JP", sans-serif; color: #17184B; }
.klc-look .row small { display: block; margin-top: 4px; font: 500 13px/1.6 "Noto Sans JP", sans-serif; color: #595857; text-wrap: pretty; }
.klc-look .row.col > span { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.klc-look output { font: 700 16px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-variant-numeric: tabular-nums; color: #1f3a68; }
.klc-look .sw { position: relative; flex: none; width: 64px; height: 44px; border: 0; border-radius: 999px; background: rgba(45, 51, 80, 0.22); cursor: pointer; padding: 0; }
.klc-look .sw i { position: absolute; left: 4px; top: 4px; width: 36px; height: 36px; border-radius: 50%; background: #FBFAF5; box-shadow: 0 2px 6px rgba(23, 24, 75, 0.28); }
.klc-look .sw[aria-checked="true"] { background: #1f3a68; }
.klc-look .sw[aria-checked="true"] i { transform: translateX(20px); }
.klc-look input[type="range"] { width: 100%; height: 44px; margin: 0; accent-color: #1f3a68; cursor: pointer; }
.klc-look :focus-visible { outline: 2px solid #1f3a68; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.92); }
@media (prefers-reduced-motion: reduce) { .klc-look, .klc-look * { transition: none !important; } }
`;

export function desktopLookOpen() { return !!desk && !desk.hidden; }

export function closeDesktopLook() {
  if (!desk || desk.hidden) return;
  const doc = desk.ownerDocument || deskDoc;
  desk.hidden = true;
  setSheetBlocked(false, doc);
  try { doc.querySelector('#klc-ui [data-act="padset"]')?.setAttribute('aria-expanded', 'false'); } catch { /* no hud */ }
  try { doc.querySelector('#klc-ui [data-act="padset"]')?.focus?.(); } catch { /* */ }
}

/**
 * The desktop sheet. The phone uses the same rows inside the touch pad (lookControlsHTML).
 * `get` / `set` are the pad's settings so one store backs both.
 */
export function openDesktopLook(doc, { get, set } = {}) {
  if (!doc) return null;
  deskDoc = doc;
  ensureKeys(doc);
  if (!doc.getElementById('klc-look-css')) {
    const st = doc.createElement('style');
    st.id = 'klc-look-css';
    st.textContent = LOOK_CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }
  if (!desk || desk.ownerDocument !== doc) {
    desk = doc.createElement('section');
    desk.id = 'klc-look';
    desk.className = 'klc-look';
    desk.setAttribute('role', 'dialog');
    desk.setAttribute('aria-modal', 'true');
    desk.setAttribute('aria-labelledby', 'klc-look-title');
    desk.hidden = true;
    desk.innerHTML = lookControlsHTML('klc-look-title');
    (doc.body || doc.documentElement).appendChild(desk);
    const read = () => (get ? get() : { ...getLook(), leftHanded: false, coach: false });
    const write = (k, v) => { if (set) set(k, v); else setLook(k === 'invertY' ? { invertY: v } : { speed: v }); };
    bindLookKeys(desk, {
      doc,
      onClose: () => closeDesktopLook(),
      onSpeed: (v) => { write('speed', v); fillLookSheet(desk, trOf(doc), read()); },
    });
    desk.addEventListener('click', (e) => {
      const sw = e.target?.closest?.('.sw');
      if (!sw || !desk.contains(sw)) return;
      const k = sw.dataset.set;
      write(k, !read()[k]);
      fillLookSheet(desk, trOf(doc), read());
    });
    desk.addEventListener('input', (e) => {
      if (!e.target?.matches?.('input[type="range"]')) return;
      write('speed', e.target.value);
      fillLookSheet(desk, trOf(doc), read());
    });
    doc.addEventListener('pointerdown', (e) => {
      if (!desk || desk.hidden) return;
      if (e.target?.closest?.('#klc-look, #klc-ui [data-act="padset"]')) return;
      closeDesktopLook();
    }, true);
    onLookEscape(() => { if (desk && !desk.hidden) closeDesktopLook(); });
  }
  fillLookSheet(desk, trOf(doc), get ? get() : getLook());
  desk.hidden = false;
  setSheetBlocked(true, doc);
  try { doc.querySelector('#klc-ui [data-act="padset"]')?.setAttribute('aria-expanded', 'true'); } catch { /* */ }
  try { desk.querySelector('input[type="range"]')?.focus?.(); } catch { /* */ }
  return desk;
}
