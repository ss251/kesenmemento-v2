// [ui-a2] The veil, and the one rule for ending a flight early (UI lane A round 2, plan row 4; motion F04 / plans 003 + 004, mobile F9 / T9).
//
// A flight to a place takes 1.8 to 4.5 s. A key, a press on the canvas or a touch ends it at once with tour.skip() (never tour.stop(), which would
// freeze the camera in mid-air): near the destination skip() glides the last metres in a quarter of a second; far from it (more than 150 m) it asks
// for a cut, and the cut is the veil: the picture dips to the sky's colour, the jump runs while it is opaque, the picture comes back.
//
//   const veil = createVeil({ color })       veil.cut(fn)   run fn once while the screen is dipped: the layer fades in (100 ms), fn runs when the browser says the
//                                            fade-in is done (about 110 to 130 ms; never before the layer is opaque, however late the frames are), the layer fades out (180 ms)
//                                            veil.pending   a dip is under way (its jump has not run yet)       veil.flush()   run it now
//   interruptFlight(tour, veil) -> bool      the single entry point of the HUD (keys, a press on the canvas) and of the touch pad (a touch)
//
// ctx.veil is this object (mountHud makes it); `cut` is a closure, so it can be handed over detached (`tour.skip(ctx.veil.cut)`) and called without `this`.
// It builds no DOM and no style until the first cut: a page that never interrupts a flight pays nothing, and a ?shot=1 frame never shows it.
// Why `transitionend` and not a timer: a timer set to the length of the fade ran the jump with the layer still transparent whenever the page hitched (measured: in four of six dips on a
// loaded machine, where frames take 200 ms now and then, the jump went off before a single frame of the fade had been drawn). A timer is only the fallback, for a page that draws no
// frames (a hidden tab) or a layer that will not fade (its transition switched off by a stylesheet: then the layer is simply up and the jump runs at once). On a visible page whose
// layer is still transparent when the fallback goes off (a long stall: the frames are late, not absent) the fallback waits up to two more rounds of 150 ms.
// Prefers-reduced-motion: a quick 80 ms crossfade in and out (the page's blanket `* { transition: none !important }` is overridden for this layer only, with !important: a hard
// flash to the sky's colour is no gentler than a fade).

export const VEIL_ID = 'klc-veil';
export const VEIL_STYLE_ID = 'klc-veil-css';
/** The page's own background (index.html), used when the scene has no fog colour to follow. */
export const VEIL_FALLBACK = '#cfdcec';
/** Milliseconds: the screen fades to the veil (in), then back (out). The jump runs between, when the fade-in has finished; `limit` is the longest it waits for the browser to say so
 *  (on a hidden page; a visible page with a transparent layer gets `more` extra rounds of `grace` ms, a stalled one that is about to draw). */
export const DIP = Object.freeze({ in: 100, out: 180, limit: 500, grace: 150, more: 2 });
/** prefers-reduced-motion: a quick crossfade instead (the same shape, shorter). */
export const DIP_REDUCED = Object.freeze({ in: 80, out: 80, limit: 400, grace: 120, more: 2 });

const EASE = 'cubic-bezier(.23,1,.32,1)';
/** The veil's whole stylesheet. Under the HUD (z-index 4) and the pad (6), over the canvas and the place labels (3, which come first in the page): only the scene dips.
 *  `visibility` follows the fade, so a veil at rest is not painted at all (no full-screen layer to composite on a phone). */
export const VEIL_CSS = `#${VEIL_ID}{position:fixed;inset:0;z-index:3;pointer-events:none;background:${VEIL_FALLBACK};opacity:0;visibility:hidden;transition:opacity ${DIP.out}ms ${EASE},visibility 0s linear ${DIP.out}ms}
#${VEIL_ID}.on{opacity:1;visibility:visible;transition:opacity ${DIP.in}ms ${EASE},visibility 0s}
body.shot #${VEIL_ID}{display:none}
@media (prefers-reduced-motion:reduce){#${VEIL_ID}{transition:opacity ${DIP_REDUCED.out}ms linear,visibility 0s linear ${DIP_REDUCED.out}ms !important}#${VEIL_ID}.on{transition:opacity ${DIP_REDUCED.in}ms linear,visibility 0s !important}}`;

/** The colour of the air right now: the scene's fog colour (the sky's palette drives it, so a dip at night is dark and one at dusk is warm), else the page's background. */
export function skyColor(ctx) {
  try {
    const c = ctx?.scene?.fog?.color;
    if (c && typeof c.getHexString === 'function') return '#' + c.getHexString();
  } catch { /* no scene yet */ }
  return VEIL_FALLBACK;
}

/**
 * @param {object} [o]
 * @param {() => string} [o.color]            the dip's colour, read once when a dip starts
 * @param {Document} [o.doc]                  the document (default: the page's)
 * @param {(fn: Function, ms: number) => any} [o.setTimeout]   timers, injectable for tests (looked up at call time otherwise)
 * @param {(id: any) => void} [o.clearTimeout]
 * @param {(fn: Function) => void} [o.raf]    the next frame
 * @param {() => boolean} [o.reducedMotion]   prefers-reduced-motion, read when a dip starts
 * @param {(el: Element) => { opacity: string, transitionDuration: string } | null} [o.computed]   the layer's computed style (default: getComputedStyle; null when there is none)
 */
export function createVeil(o = {}) {
  const doc = () => o.doc ?? (typeof document !== 'undefined' ? document : null);
  const later = (fn, ms) => (o.setTimeout ? o.setTimeout(fn, ms) : setTimeout(fn, ms));
  const cancel = (id) => (o.clearTimeout ? o.clearTimeout(id) : clearTimeout(id));
  const frame = (fn) => { if (o.raf) o.raf(fn); else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn); else later(fn, 16); };
  const reduced = () => { try { return o.reducedMotion ? !!o.reducedMotion() : typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const computed = (e) => { try { return o.computed ? o.computed(e) : typeof getComputedStyle === 'function' ? getComputedStyle(e) : null; } catch { return null; } };
  /** Is the layer drawn fully opaque right now? (Unknown, without a computed style, counts as no.) */
  const opaque = (e) => { const cs = computed(e); return !!cs && Number(cs.opacity) >= 0.98; };
  /** Will the layer fade at all? (Unknown counts as yes; a transition switched off by a stylesheet counts as no.) */
  const fades = (e) => { const cs = computed(e); return !cs || String(cs.transitionDuration ?? '').split(',').some((x) => parseFloat(x) > 0); };
  const hidden = () => { try { return doc()?.hidden === true; } catch { return false; } };
  let el = null, timer = null, jobs = [], waits = 0;

  /** The browser says the layer's opacity transition ended: if a dip is waiting for its fade-in, that is the moment (the layer is opaque in the frames that follow). */
  function onEnd(e) {
    if (timer == null || e.target !== el || e.propertyName !== 'opacity' || !el.classList.contains('on')) return;
    if (computed(el) && !opaque(el)) return;   // (the end of an earlier fade-out, arriving late: not this dip's fade-in)
    finish();
  }
  function ensure() {
    const d = doc();
    if (!d?.body) return null;
    if (!d.getElementById(VEIL_STYLE_ID) && d.head) { const st = d.createElement('style'); st.id = VEIL_STYLE_ID; st.textContent = VEIL_CSS; d.head.appendChild(st); }
    if (!el) { el = d.createElement('div'); el.id = VEIL_ID; el.setAttribute('aria-hidden', 'true'); el.addEventListener('transitionend', onEnd); }
    // at rest the veil goes to the end of the body, so it is over the place labels that share its z-index (they are built after the HUD); never moved during a dip
    if (el.parentNode !== d.body || (!el.classList.contains('on') && d.body.lastChild !== el)) d.body.appendChild(el);
    return el;
  }
  const runJobs = () => {
    const run = jobs; jobs = [];
    for (const fn of run) { try { fn(); } catch (e) { console.error('[veil] the jump failed', e); } }
  };
  /** The fallback timer. A page that draws no frames (hidden), a layer that cannot say how opaque it is, or a visible page that has had its extra rounds: run the jump. A visible page whose
   *  layer is still transparent has stalled and is about to draw: give it a little longer (the fade-in's own transitionend, or the next round, runs the jump). */
  function limit(d) {
    if (timer == null) return;
    if (computed(el) && !opaque(el) && !hidden() && waits < d.more) { waits++; timer = later(() => limit(d), d.grace); return; }
    finish();
  }
  function finish() {
    if (timer != null) cancel(timer);
    timer = null; waits = 0;
    runJobs();
    // one frame under the opaque veil first, so the new view is drawn before the fade out starts; a cut that arrives in between keeps the veil up
    frame(() => { if (timer == null && el) el.classList.remove('on'); });
  }

  const veil = {
    /** Run `fn` once, hidden behind a dip. A cut inside a dip rides the same dip. Returns whether it was taken (always, unless fn is not a function). No `this` inside: pass it around freely. */
    cut(fn) {
      if (typeof fn !== 'function') return false;
      const e = ensure();
      if (!e) { try { fn(); } catch (err) { console.error('[veil] the jump failed', err); } return true; }   // no page (a server, a test): the jump is not hidden, but it happens
      jobs.push(fn);
      if (timer != null) return true;
      const d = reduced() ? DIP_REDUCED : DIP;
      const up = e.classList.contains('on') && opaque(e);   // the layer of the dip before is still up and opaque (its fade-out has not started): there is no fade-in to wait for
      try { e.style.backgroundColor = o.color ? o.color() : VEIL_FALLBACK; } catch { /* the fallback is in the stylesheet */ }
      void e.offsetWidth;   // the element may have just been inserted: flush its style, so the fade starts from transparent
      e.classList.add('on');
      waits = 0;
      const now = up || !fades(e);   // nothing to wait for: the layer is up already, or it will not fade
      timer = later(now ? finish : () => limit(d), now ? 0 : d.limit);   // the fade-in's own `transitionend` comes first (onEnd); this is the fallback
      return true;
    },
    /** Is a dip under way, with a jump that has not run yet? */
    get pending() { return timer != null; },
    /** Run the jump now (a page that is going away, a test); the veil fades out. */
    flush() { if (timer == null) return; finish(); },
    get el() { return el; },
  };
  return veil;
}

/**
 * Finish the flight in progress, the way a visitor expects: it is over now, not in three seconds. Called for a movement key, a press on the canvas and a touch while the pad
 * is out of the way. Never touches the auto tour (it has its own pause button and G key); never stops the camera in mid-air (skip, not stop).
 * `tour.skip(cut)` decides near or far: within 150 m of the framing a quarter-second glide, farther the veil's dip (`cut` runs the jump once). A second request while the
 * dip is carrying the first one is the same gesture arriving by another road (pointerdown and touchstart, two keys): it is left alone, so the jump runs once, when the veil is up.
 * -> whether the request was taken.
 */
export function interruptFlight(tour, veil = null) {
  if (!tour?.flying || tour.playing || typeof tour.skip !== 'function') return false;
  if (veil?.pending) return true;
  return tour.skip(veil ? veil.cut : undefined) !== false;
}
