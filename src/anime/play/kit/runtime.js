// [play] One step for every feature. The game calls onStep at a fixed 1/60;
// listeners still take dt. playMode() and playerPos() read the live body.

import { readMode, readPlayerPos } from './mode.js';

const listeners = [];
let ctx = null;
const cost = { n: 0, sum: 0, max: 0 };

export function bindRuntime(c) {
  ctx = c;
  if (!c || c.__playBound) return;
  c.__playBound = true;
  const step = (dt, t) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](dt, t); } catch (e) {
        // One feature stays off the others, but never silently: each listener reports its first failure.
        const fn = listeners[i];
        if (fn && !fn.__failed) {
          fn.__failed = true;
          try { console.error('[play] a tick listener failed', e); (window.__playErrors ||= []).push(String(e && e.stack || e)); } catch (err) { /* not a browser */ }
        }
      }
    }
    if (t0) {
      const ms = performance.now() - t0;
      cost.n++;
      cost.sum += ms;
      if (ms > cost.max) cost.max = ms;
    }
  };
  step.__mod = 'play';
  c.onStep(step);
  try { window.__playCost = playCost; } catch (e) { /* not a browser */ }
}

export function onPlayTick(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function playMode() {
  return readMode(ctx);
}

export function playerPos(out) {
  return readPlayerPos(ctx, out);
}

export function playCost() {
  return { n: cost.n, mean: cost.n ? cost.sum / cost.n : 0, max: cost.max };
}

/** Test seam. */
export function _resetRuntime() {
  listeners.length = 0;
  ctx = null;
  cost.n = 0;
  cost.sum = 0;
  cost.max = 0;
}
