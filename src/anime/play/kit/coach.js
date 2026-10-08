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
  let full = '';
  let shown = 0;
  let acc = 0;
  let active = null;
  let typing = false;
  let gen = 0;

  function place(x, y) {
    const w = window.innerWidth || 393;
    const h = window.innerHeight || 852;
    const cx = Math.max(72, Math.min(w - 72, x));
    const cy = Math.max(96, Math.min(h - 120, y));
    hole.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
    el.style.setProperty('--cx', cx.toFixed(1) + 'px');
    el.style.setProperty('--cy', cy.toFixed(1) + 'px');
    hand.style.transform = 'translate3d(' + (cx + 8).toFixed(1) + 'px,' + (cy + 18).toFixed(1) + 'px,0)';
    const bw = Math.min(380, Math.round(w * 0.9));
    let bx = cx + 28;
    let by = cy - 108;
    if (bx > w - bw - 12) bx = Math.max(12, cx - bw - 8);
    if (by < 72) by = Math.min(h - 180, cy + 48);
    if (by > h - 168) by = Math.max(72, h - 180);
    bx = Math.max(12, Math.min(w - bw - 12, bx));
    bubble.style.transform = 'translate3d(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px,0)';
  }

  function paintText(n) {
    say.textContent = full.slice(0, n);
    const more = n < full.length;
    caret.hidden = !more;
  }

  const offTick = onPlayTick((dt) => {
    if (el.hidden) return;
    if (typing && !reduced()) {
      acc += dt > 0 ? dt : 0.016;
      const n = Math.min(full.length, Math.floor(acc / 0.028));
      if (n !== shown) { shown = n; paintText(n); if (n >= full.length) typing = false; }
    }
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
    paintText(shown);
    ok.textContent = t('play.kit.coach.ok');
    target = o.target || null;
    const p = target ? resolveCoachTarget(target, null, into) : null;
    if (p) place(p.x, p.y);
    else place((window.innerWidth || 400) * 0.5, (window.innerHeight || 800) * 0.45);
    const api = { done, hide };
    active = api;
    ok.focus({ preventScroll: true });
    return api;
  }

  coach.dispose = offTick;
  return coach;
}
