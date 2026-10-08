// [ui-c2][loader] The loading screen's progress: a thin bar along the bottom edge, the runner on its solid edge, the number beside the status line, and a faint working layer behind the fill
// (index.html: #ld-fill, #ld-fill-in, #ld-work, #ld-work-in, #ld-ride, #ld-pct, #loadlabel).
//
//   const bar = createLoadBar();   bar.set(0.42, '町並みを準備中…', { to: 0.51, ms: 4000 });   bar.log   // [{ t, bar, label, creepTo, creepMs }]
//
// ONE MARK, and everything solid on the screen says the same thing (the owner, 2026-10-08: 「the loading bar is not always accurate to the percentage number」). A mark is the last stage the load
// has COMPLETED, driven by the real plan (core/loadplan.js) and never faked:
//   - THE NUMBER (#ld-pct) is written by set() itself, in the same call: round(mark * 100). Nothing else writes it while the page loads, and no frame has to run first. (It used to be rewritten
//     by a per-frame script, which freezes when a long step blocks the page's thread: it stood at 10 % while the bar, moving on the compositor, crept from 5 % to 15 %, and at 75 % for 3.5 s
//     while the bar stood at 95 %.)
//   - THE SOLID FILL (#ld-fill, #ld-fill-in) and THE RUNNER (#ld-ride) show exactly that mark. They ease to it (MARK_MS, about 0.4 s) and stop: they never creep past it, so the bar is never
//     ahead of the number. Both are Web Animations of transform on the compositor.
//   - THE WORKING LAYER (#ld-work, #ld-work-in) is where the wait shows: a faint copy of the fill behind it. From the mark it moves linearly toward `to` for `ms` (the time this device is expected
//     to need for the stage), like a buffered bar, on the compositor, so the screen keeps moving while the page's thread is blocked (the 2-20 s the town and the static batch take). It is a
//     forecast, not progress: it never carries a number, and the solid fill never follows it. It is ONE Web Animation per element, so a timer chained after a first leg (which never fires while the
//     thread is blocked) is not needed.
//   - THE RUNNER swims in place (a bob and a wag, the page's stylesheet: a transform animation on its own box, also on the compositor). It rides the solid edge.
//   - MONOTONIC: a mark below the mark already reached is ignored (a stage can only add), and so is the working layer's retreat. `creep.to` is at most the next stage's start (main.js: 97 % of the
//     stage), so the working layer never passes the mark of a stage that has not begun.
//   - IDLE: when the creep has run its course and the stage is still going (a slow phone), nothing moves forward and nothing is invented: the root gets .ld-idle, and the runner swims slower
//     (the page's stylesheet). It leaves that state with the next set().
//   - The fill is a full-width bar clipped to the position: #ld-fill slides in from the left (translateX(-(1-p) * 100%)) and #ld-fill-in slides back the other way, so the fill itself never
//     moves or stretches with p; the runner's lane (#ld-ride) is as wide as the bar and moves by p * 100% of that, so the fill's edge is always under the hull. The working layer is built the
//     same way. Percentages, so a resize or a rotation needs no recomputation.
//   - Reduced motion: no animation at all: the fill, the runner and the working layer step to each mark (the layer shows nothing ahead of the fill), and the page's stylesheet stops the swim.
//   - Capture (html[data-capture], ?capture=1): the title clock paints the gauge, the number and the runner; this module only keeps the labels, the flags and aria-valuenow.
// The log is the page's own record of what it said and when (a poll from outside cannot see a label that was set while the thread was blocked).
import { labelEn } from './loadplan.js';

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of time (0..1) -> progress (0..1): the same curve the compositor uses, so the position can be known without asking the DOM. */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s, dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) { const e = X(s) - x; if (Math.abs(e) < 1e-6) return Y(s); const d = dX(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
    let lo = 0, hi = 1; s = x;
    for (let i = 0; i < 40; i++) { const e = X(s); if (Math.abs(e - x) < 1e-6) break; if (e < x) lo = s; else hi = s; s = (lo + hi) / 2; }
    return Y(s);
  };
}
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ease = bezier(0.22, 1, 0.36, 1);
/** Milliseconds the solid edge (and the runner) takes to reach a new mark. */
export const MARK_MS = 420;

// the transform each element takes at position p (0..1): the runner's lane, the fill's clip and the counter-slide that keeps the fill still inside it
const ride = (p) => `translateX(${+(p * 100).toFixed(3)}%)`;
const clip = (p) => `translateX(${+(-(1 - p) * 100).toFixed(3)}%)`;
const counter = (p) => `translateX(${+((1 - p) * 100).toFixed(3)}%)`;
const SOLID = [['ld-ride', ride], ['ld-fill', clip], ['ld-fill-in', counter]];   // the fill's edge and the runner: the mark, no further
const FAINT = [['ld-work', clip], ['ld-work-in', counter]];                        // the working layer: the mark, then the forecast

export function createLoadBar({ doc = typeof document !== 'undefined' ? document : null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), log = [],
  reduced = () => { try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; } }, later = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id) } = {}) {
  const $ = (id) => doc?.getElementById?.(id) ?? null;
  // mark: the last completed stage (what the number says); leg: the solid edge's move to it; work: the working layer's move to it and on toward the forecast
  let mark = 0, leg = null, work = null, idleTimer = null, anims = [], calls = 0, hoisted = 0;
  const capture = () => doc?.documentElement?.dataset?.capture === '1';   // [title] ?capture=1 steps the title clock; the sequence paints the gauge

  /** Where the solid edge (the fill and the runner) is at time t (ms): the eased move to the mark, then the mark. It never passes it. */
  function position(t = now()) {
    if (!leg) return mark;
    const dt = Math.max(0, t - leg.t0);
    return dt >= leg.ms ? leg.to : leg.from + (leg.to - leg.from) * ease(dt / leg.ms);
  }
  /** Where the working layer is at time t: the eased move to the mark, then the linear creep toward its target. Always at or ahead of position(). */
  function working(t = now()) {
    if (!work) return mark;
    const dt = Math.max(0, t - work.t0);
    if (dt < work.markMs) return work.from + (work.mark - work.from) * ease(dt / work.markMs);
    if (work.creepMs <= 0) return work.mark;
    return work.mark + (work.to - work.mark) * Math.min(1, (dt - work.markMs) / work.creepMs);
  }

  /** One layer to its place: an eased move to `mark` over markMs and, with a `creep` = { to, ms }, a linear one after it, as ONE Web Animation of transform per element (the compositor
   *  runs it, thread or no thread). The inline style is the state if the animation is ever dropped, and when there is none (reduced motion, no Web Animations, nothing to move). */
  function glide(parts, from, markAt, markMs, creep, still) {
    for (const [id, at] of parts) {
      const el = $(id); if (!el) continue;
      const D = markMs + (creep && !still ? creep.ms : 0);
      if (still || D <= 0 || typeof el.animate !== 'function') { el.style.transform = at(markAt); continue; }   // (reduced motion, no Web Animations, or nowhere to go: step to the mark)
      const end = at(creep && !still ? creep.to : markAt);
      const kf = creep ? [{ transform: at(from), easing: EASE }, { transform: at(markAt), offset: markMs / D, easing: 'linear' }, { transform: end }] : [{ transform: at(from), easing: EASE }, { transform: end }];
      try { const a = el.animate(kf, { duration: D, fill: 'forwards' }); anims.push(a); el.style.transform = end; }
      catch { el.style.transform = at(markAt); }
    }
  }
  function play(still) {
    if (capture()) return;
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    anims = [];
    glide(SOLID, leg.from, leg.to, leg.ms, null, still);
    glide(FAINT, work.from, work.mark, work.markMs, work.creepMs > 0 ? { to: work.to, ms: work.creepMs } : null, still);
  }
  /** The number: the first text node of #ld-pct (its % sign is a <small> after it). Written here, in the call that moves the mark. */
  function say(n) {
    const pct = $('ld-pct'); if (!pct || capture()) return;
    const s = String(n), t = pct.firstChild;
    if (t && t.nodeType === 3) { if (t.nodeValue !== s) t.nodeValue = s; }
    else if (doc?.createTextNode) pct.insertBefore(doc.createTextNode(s), t ?? null);
  }

  function set(frac, label, creep) {
    const t = now(), still = reduced();                               // (reduced motion: every layer steps to the mark, and the model says so too)
    const f = Math.min(1, Math.max(0, Number(frac) || 0));
    const here = position(t), was = working(t);
    const next = Math.max(f, mark);                                   // never backwards: the completed mark only grows
    // the solid edge eases to the mark and stops there
    leg = { t0: t, from: here, to: next, ms: still || Math.abs(next - here) < 0.0005 ? 0 : MARK_MS };
    // the working layer eases to the mark too (never behind it, never retreating), then creeps toward `to` for `ms` (not at all under reduced motion)
    const wMark = Math.max(next, was);
    const to = !still && creep && creep.to > wMark ? Math.min(1, creep.to) : wMark;
    const creepMs = to > wMark ? Math.max(0, Number(creep.ms) || 0) : 0;
    work = { t0: t, from: was, mark: wMark, to: creepMs > 0 ? to : wMark, markMs: still || Math.abs(wMark - was) < 0.0005 ? 0 : MARK_MS, creepMs };
    mark = next;
    say(Math.round(mark * 100));
    play(still);
    const root = $('intro');
    if (idleTimer != null) { cancel(idleTimer); idleTimer = null; }
    root?.classList?.remove('ld-idle');
    if (mark < 1) idleTimer = later(() => { idleTimer = null; root?.classList?.add('ld-idle'); }, Math.max(leg.ms, work.markMs) + creepMs + 250);   // (the creep has run its course and no stage has ended: a gentle idle)
    // the 大漁旗: one more flag is hoisted on the rope for every stage that has completed (every set() after the first is the start of the next stage); the last set() hoists the rest
    calls++;
    const flags = doc?.querySelectorAll?.('.ld-flag');
    if (flags && flags.length) {
      const want = mark >= 1 ? flags.length : Math.min(flags.length, calls - 1);
      for (let i = hoisted; i < want; i++) { flags[i].style.setProperty('--d', `${(i - hoisted) * 90}ms`); flags[i].classList.add('up'); }
      hoisted = Math.max(hoisted, want);
    }
    const prog = $('ld-progress'); if (prog) prog.setAttribute('aria-valuenow', String(Math.round(mark * 100)));
    const lab = $('loadlabel');
    let text = label;
    if (text !== undefined && text !== '' && doc?.documentElement?.lang === 'en') text = labelEn(text);
    if (lab && text !== undefined && lab.dataset?.title !== '1') lab.textContent = text;           // '' clears it. data-title keeps the designed sentence; the stage name stays in the log.
    log.push({ t: Math.round(t), bar: +mark.toFixed(4), label: label ?? null, creepTo: creep ? +Math.min(1, creep.to).toFixed(4) : null, creepMs: creep ? Math.round(creep.ms) : null });
  }
  return { set, log, position, working, get mark() { return mark; }, get hoisted() { return hoisted; }, get idle() { return !!$('intro')?.classList?.contains('ld-idle'); } };
}
