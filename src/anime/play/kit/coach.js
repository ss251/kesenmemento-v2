// [play] Teach one thing, once. Seen flags live in klc.play.v1 meta.seen.
// The spotlight follows a target; the hand shows the gesture. PLAY-ENTRY §3.

import { onPlayTick } from './runtime.js';
import { sfx } from './sfx.js';

const HAND = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#FBFAF5" stroke="#223A70" stroke-width="2.5" stroke-linejoin="round" d="M22 46c0-6 1.5-12 5-16 0-7 3-12 7.5-12s6.5 5 6.5 12c2.2-1.2 6-.6 8 2.5 2.2 3.4 1.2 9-.4 13L45 54c-1 3.5-5 6-11 6h-5c-6 0-7-4-7-8z"/><path fill="none" stroke="#223A70" stroke-width="2" stroke-linecap="round" d="M30 20v10M36 18v12M42 22v8"/></svg>';
const WHO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#165E83"/><path fill="#223A70" d="M12 18c1.5-7 22.5-7 24 0-2 2-4 3-6 2 0-3-4-5-6-5s-6 2-6 5c-2 1-4 0-6-2z"/><circle cx="24" cy="22" r="7" fill="#F3D5C4"/><circle cx="21.5" cy="21.5" r="1" fill="#223A70"/><circle cx="26.5" cy="21.5" r="1" fill="#223A70"/><path fill="#223A70" d="M12 40c2.2-7 7.2-10 12-10s9.8 3 12 10"/></svg>';

export function coachSeen(store, id) {
  if (!id || !store) return false;
  const seen = store.get('meta').seen;
  return !!(seen && typeof seen === 'object' && seen[id]);
}

export function markCoachSeen(store, id, when = new Date().toISOString()) {
  if (!id || !store) return;
  store.update('meta', (d) => {
    if (!d.seen || typeof d.seen !== 'object' || Array.isArray(d.seen)) d.seen = {};
    d.seen[id] = when;
  });
}

export function clearCoachSeen(store) {
  if (!store) return;
  store.update('meta', (d) => { delete d.seen; });
}

export function coachShouldShow(store, id, force) {
  if (force) return true;
  if (!id) return true;
  return !coachSeen(store, id);
}

/**
 * Element, selector, or () => {x, y} in CSS pixels.
 * `query(selector)` resolves a string. `into` is reused by the follower so a
 * frame does not allocate.
 */
export function resolveCoachTarget(target, query, into) {
  if (target == null) return null;
  let x = NaN;
  let y = NaN;
  if (typeof target === 'function') {
    let p = null;
    try { p = target(); } catch (e) { p = null; }
    if (!p) return null;
    x = Number(p.x);
    y = Number(p.y);
  } else if (typeof target === 'string') {
    const q = query || ((s) => (typeof document !== 'undefined' ? document.querySelector(s) : null));
    let el = null;
    try { el = q(target); } catch (e) { el = null; }
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const r = el.getBoundingClientRect();
    x = r.left + r.width * 0.5;
    y = r.top + r.height * 0.5;
  } else if (typeof target.getBoundingClientRect === 'function') {
    const r = target.getBoundingClientRect();
    x = r.left + r.width * 0.5;
    y = r.top + r.height * 0.5;
  } else return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const o = into || { x: 0, y: 0 };
  o.x = x;
  o.y = y;
  return o;
}

const NO = { done() {}, hide() {} };

/** [fish-fix] What the bubble must never cover: the controls a coach teaches (the touch pad's stick and buttons, the kit's
 *  action cluster). `soft`: the rest of the HUD, avoided when there is room. */
export const COACH_HARD = '#klc-pad .ghost, #klc-pad .cluster .btn, #klc-play .cluster .act';
export const COACH_SOFT = '#klc-ui .brand, #klc-ui .tools, #klc-ui .mbtn, #klc-ui .pbar, #klc-ui .dock, #klc-ui .places, #klc-ui .attr, #klc-x .xbar, #klc-x .mini, #klc-x .xdrive, #klc-play .topbar, #klc-play .counters, #klc-pad .topbar, #klc-pad .gear, .swim-ui .swim-chip';

const overlap = (x, y, w, h, list) => {
  let a = 0;
  for (const q of list) {
    const ox = Math.min(x + w, q.r) - Math.max(x, q.l), oy = Math.min(y + h, q.b) - Math.max(y, q.t);
    if (ox > 0 && oy > 0) a += ox * oy;
  }
  return a;
};

/**
 * [fish-fix] Where the speech bubble goes (top-left, CSS px). It sits next to the spotlight and never on it, nor on a `hard`
 * rect (the controls the coach teaches); `soft` rects (the rest of the HUD) cost area. Four ways out from the target, in this
 * order: above, right, left, below; each slides away from the target in 8 px steps until it is clear of every hard rect.
 * Among the clear ones the cheapest wins (soft area + 20 per px from the target). With nothing clear, the least covered spot.
 * The bubble used to sit 108 px above the target whatever its height, so a two-line bubble lay on its own target and its
 * 90vw width on the buttons beside it (the swim coach on a phone: the stick, あがる and 上がる).
 *   placeBubble({ target: { x, y }, size: { w, h }, view: { w, h }, hole, hard: [{ l, t, r, b }], soft, margin, gap })
 */
export function placeBubble({ target, size, view, hole = 66, hard = [], soft = [], margin = 12, gap = 10 }) {
  const bw = Math.min(size.w, view.w - margin * 2), bh = size.h;
  const L = margin, R = view.w - margin - bw, T = margin, B = view.h - margin - bh;
  const spot = { l: target.x - hole, t: target.y - hole, r: target.x + hole, b: target.y + hole };
  const block = [spot, ...hard];
  const cx = Math.max(L, Math.min(R, target.x - bw / 2)), cy = Math.max(T, Math.min(B, target.y - bh / 2));
  const ways = [
    { x: cx, y: spot.t - gap - bh, dx: 0, dy: -8 },
    { x: spot.r + gap, y: cy, dx: 8, dy: 0 },
    { x: spot.l - gap - bw, y: cy, dx: -8, dy: 0 },
    { x: cx, y: spot.b + gap, dx: 0, dy: 8 },
  ];
  let best = null, least = null;
  ways.forEach((wy, i) => {
    for (let k = 0; k < 240; k++) {
      const x = wy.x + wy.dx * k, y = wy.y + wy.dy * k;
      if (x < L - 0.5 || x > R + 0.5 || y < T - 0.5 || y > B + 0.5) break;
      const hit = overlap(x, y, bw, bh, block);
      if (!least || hit < least.hit) least = { x, y, hit };
      if (hit > 0) continue;
      const cost = overlap(x, y, bw, bh, soft) + 20 * Math.hypot(x + bw / 2 - target.x, y + bh / 2 - target.y) + i;
      if (!best || cost < best.cost) best = { x, y, cost };
      break;
    }
  });
  if (best) return { x: best.x, y: best.y, clear: true };
  if (least) return { x: least.x, y: least.y, clear: false };
  return { x: cx, y: Math.max(T, Math.min(B, spot.t - gap - bh)), clear: false };
}

function rectsOf(sel, skip) {
  if (!sel || typeof document === 'undefined') return [];
  const out = [];
  const els = typeof sel === 'string' ? document.querySelectorAll(sel) : sel;
  for (const e of els) {
    if (!e || (skip && skip.contains(e)) || typeof e.getBoundingClientRect !== 'function') continue;
    const r = e.getBoundingClientRect();
    if (!(r.width > 1 && r.height > 1)) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || e.dataset?.show === '0') continue;
    out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

export function mountCoach({ root, store, t, reduced }) {
  const el = document.createElement('div');
  el.className = 'coach';
  el.hidden = true;
  el.innerHTML = `
    <div class="hole"></div>
    <div class="hand" hidden><div class="glove">${HAND}<svg class="holdring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/></svg></div></div>
    <div class="bubble" role="dialog" aria-live="polite">
      <div class="who">${WHO}</div>
      <div class="say"><p></p><i class="caret" aria-hidden="true">▼</i></div>
      <button type="button" class="ok"></button>
    </div>`;
  root.appendChild(el);
  const hole = el.querySelector('.hole');
  const hand = el.querySelector('.hand');
  const glove = el.querySelector('.glove');
  const bubble = el.querySelector('.bubble');
  const say = bubble.querySelector('p');
  const caret = bubble.querySelector('.caret');
  const ok = bubble.querySelector('.ok');
  const into = { x: 0, y: 0 };
  let target = null;
  let avoid = null;
  let full = '';
  let shown = 0;
  let acc = 0;
  let active = null;
  let typing = false;
  let gen = 0;
  // [fish-fix] the bubble's final size and the rects it keeps clear of, read when a coach opens, on resize and twice a second
  // (never per frame: place() runs every tick while the target moves)
  const size = { w: 0, h: 0 };
  let hard = [], soft = [], seenAcc = 0, measured = 0;
  const last = { x: NaN, y: NaN, gen: -1, w: 0, h: 0 };

  function measure() {
    if (el.hidden) return;
    measured++;
    // the full line sets the size: the typewriter fills a bubble that never grows (no shift, and it is placed for its final size)
    say.style.minHeight = '';
    const typed = say.textContent;
    say.textContent = full;
    say.style.minHeight = say.offsetHeight + 'px';
    say.textContent = typed;
    size.w = bubble.offsetWidth; size.h = bubble.offsetHeight;
    hard = rectsOf(COACH_HARD, el);
    if (avoid) {
      try {
        const more = typeof avoid === 'function' ? avoid() : rectsOf(avoid, el);
        if (Array.isArray(more)) for (const q of more) if (q && Number.isFinite(q.l)) hard.push(q);
      } catch (e) { /* a mode's avoid list is advice */ }
    }
    soft = rectsOf(COACH_SOFT, el);
  }

  function place(x, y) {
    const w = window.innerWidth || 393;
    const h = window.innerHeight || 852;
    const cx = Math.max(72, Math.min(w - 72, x));
    const cy = Math.max(96, Math.min(h - 120, y));
    hole.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    el.style.setProperty('--cx', cx.toFixed(1) + 'px');
    el.style.setProperty('--cy', cy.toFixed(1) + 'px');
    hand.style.transform = 'translate3d(' + (cx + 8).toFixed(1) + 'px,' + (cy + 18).toFixed(1) + 'px,0)';
    if (!size.h) measure();
    // the bubble moves only when the spotlight moved or the rects were read again (no work, no garbage, on a still frame)
    if (Math.abs(cx - last.x) < 0.5 && Math.abs(cy - last.y) < 0.5 && last.gen === measured && last.w === w && last.h === h) return;
    last.x = cx; last.y = cy; last.gen = measured; last.w = w; last.h = h;
    const b = placeBubble({ target: { x: cx, y: cy }, size: { w: size.w || Math.min(380, Math.round(w * 0.9)), h: size.h || 150 }, view: { w, h }, hard, soft });
    bubble.style.transform = 'translate3d(' + b.x.toFixed(1) + 'px,' + b.y.toFixed(1) + 'px,0)';
  }

  function paintText(n) {
    say.textContent = full.slice(0, n);
    const more = n < full.length;
    caret.hidden = !more;
  }

  const relayout = () => { if (el.hidden) return; size.h = 0; measure(); const p = target ? resolveCoachTarget(target, null, into) : null; if (p) place(p.x, p.y); else place((window.innerWidth || 400) * 0.5, (window.innerHeight || 800) * 0.45); };
  try { window.addEventListener('resize', () => requestAnimationFrame(relayout)); } catch (e) { /* not a browser */ }

  const offTick = onPlayTick((dt) => {
    if (el.hidden) return;
    if (typing && !reduced()) {
      acc += dt > 0 ? dt : 0.016;
      const n = Math.min(full.length, Math.floor(acc / 0.028));
      if (n !== shown) { shown = n; paintText(n); if (n >= full.length) typing = false; }
    }
    seenAcc += dt > 0 ? dt : 0.016;
    if (seenAcc >= 0.5) { seenAcc = 0; measure(); if (!target) place((window.innerWidth || 400) * 0.5, (window.innerHeight || 800) * 0.45); }
    if (!target) return;
    const p = resolveCoachTarget(target, null, into);
    if (!p) return;
    place(p.x, p.y);
  });

  function hide() {
    gen++;
    el.hidden = true;
    el.classList.remove('dim', 'ok');
    target = null;
    avoid = null;
    typing = false;
    active = null;
  }

  function done() {
    const id = el.dataset.id;
    if (id) markCoachSeen(store, id);
    if (el.hidden) return;
    el.classList.add('ok');
    sfx.play('chime');
    const token = gen;
    const finish = () => { if (token === gen) hide(); };
    if (reduced()) finish();
    else setTimeout(finish, 280);
  }

  ok.addEventListener('click', (e) => { e.stopPropagation(); done(); });
  bubble.addEventListener('click', () => {
    if (shown < full.length) { shown = full.length; typing = false; paintText(shown); }
  });

  function coach(o = {}) {
    const id = o.id || '';
    if (!coachShouldShow(store, id, o.force)) return NO;
    hide();
    full = String(o.text || '');
    shown = reduced() ? full.length : 0;
    acc = 0;
    typing = shown < full.length;
    el.dataset.id = id;
    el.hidden = false;
    el.classList.toggle('dim', o.dim !== false);
    el.classList.remove('ok');
    const g = o.gesture || 'tap';
    hand.hidden = g === 'none';
    glove.className = 'glove ' + g;
    say.textContent = '';
    ok.textContent = t('play.kit.coach.ok');
    target = o.target || null;
    // [fish-fix] o.avoid (optional): more rects the bubble keeps off, as a selector, a list of elements, or () => [{ l, t, r, b }]
    avoid = o.avoid || null;
    seenAcc = 0;
    size.h = 0;
    measure();
    paintText(shown);
    const p = target ? resolveCoachTarget(target, null, into) : null;
    if (p) place(p.x, p.y);
    else place((window.innerWidth || 400) * 0.5, (window.innerHeight || 800) * 0.45);
    // [fish-fix] a mode that opens its coach in the frame it starts has not laid out its controls yet (the pad shows its new
    // buttons a frame later): measure again once they are there, so the bubble is never placed against stale rects
    const token = gen;
    try { requestAnimationFrame(() => requestAnimationFrame(() => { if (token === gen && !el.hidden) relayout(); })); } catch (e) { /* not a browser */ }
    const api = { done, hide };
    active = api;
    ok.focus({ preventScroll: true });
    return api;
  }

  coach.dispose = offTick;
  return coach;
}
