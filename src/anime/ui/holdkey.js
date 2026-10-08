// [r-hold] R resets the camera, or leaves a mode, only after it has been held.
// A tap does nothing. A key repeat, a text field, and Ctrl, Meta or Alt do not start it.
// WASD, the arrows, Space and Shift keep it from starting, and cancel it if one of them goes down during the hold.
// Releasing R, the window blurring, or the tab hiding cancels it. It fires once per hold.
// The reset and the mode exits listen for HELD_R. 一本釣りの散水 stays on the raw keydown.

export const HOLD_MS = 600;
export const HELD_R = 'klc-held-r';

const MOVE = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
]);

/** True when the key landed in a field the visitor is typing in. */
export function isTypingTarget(el) {
  for (let n = el, i = 0; n && i < 32; n = n.parentNode, i++) {
    const tag = String(n.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (n.isContentEditable) return true;
    if (typeof n.getAttribute === 'function') {
      const ce = n.getAttribute('contenteditable');
      if (ce != null && String(ce).toLowerCase() !== 'false') return true;
    }
  }
  return false;
}

/**
 * Listen for a held R on `target` (the window). `opts.schedule` / `opts.clear` replace the timer in tests.
 * `opts.doc` is the document for visibilitychange (the page's document when omitted).
 * Returns a function that removes the listeners.
 */
export function installHeldR(target = globalThis, opts = {}) {
  const ms = opts.ms ?? HOLD_MS;
  const schedule = opts.schedule ?? ((fn, t) => setTimeout(fn, t));
  const clear = opts.clear ?? ((id) => clearTimeout(id));
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null);
  let gen = 0;
  let timer = null;
  let latched = false;
  let fired = false;
  const move = new Set();

  function disarm() {
    gen += 1;
    if (timer != null) { clear(timer); timer = null; }
  }
  function endGesture() {
    latched = false;
    fired = false;
    move.clear();
    disarm();
  }
  function onDown(e) {
    if (e.repeat) return;
    if (MOVE.has(e.code)) {
      move.add(e.code);
      if (latched && !fired) disarm();
      return;
    }
    if (e.code !== 'KeyR') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (move.size || e.shiftKey) return;
    if (latched) return;
    latched = true;
    fired = false;
    const g = gen;
    timer = schedule(() => {
      timer = null;
      if (g !== gen || !latched || fired) return;
      fired = true;
      target.dispatchEvent(new CustomEvent(HELD_R, { cancelable: true }));
    }, ms);
  }
  function onUp(e) {
    if (MOVE.has(e.code)) { move.delete(e.code); return; }
    if (e.code !== 'KeyR') return;
    latched = false;
    fired = false;
    disarm();
  }
  function onVis() {
    if (doc && doc.visibilityState === 'hidden') endGesture();
  }

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', endGesture);
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVis);

  return function dispose() {
    endGesture();
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.removeEventListener('blur', endGesture);
    if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVis);
  };
}
