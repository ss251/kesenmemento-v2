// [play:underwater] The dive prompt, the species chip, the stamina ring, the leap line, the one-line hints.
// Glass, 4 px grid, 44 px targets, strict line breaks. No keep-all.
// [fish-fix] While the dive runs, body.klc-swim is set (as the voyage sets body.klc-ship) and the land controls step out: the
// boarding chip, the car, the walk / drone view toggle, the ホヤぼーや credit (he is not on screen). The chip and the hint are
// placed against the live HUD (findSlot), never at fixed pixels: the HUD moved under the old fixed top (120 px on a phone, under
// the あそぶ row since the HUD redesign) and the old hint sat on the coach and the buttons.

import STR from '../../../../data/play-i18n.json';
import { pickLang } from '../../ui/i18n.js';

const CSS = `
.swim-ui{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:"Zen Maru Gothic","Noto Sans JP",sans-serif;color:#16324a}
.swim-ui *{box-sizing:border-box}
.swim-ui button{pointer-events:auto;font:inherit;line-break:strict;text-wrap:pretty;letter-spacing:.04em}
.swim-dive,.swim-become{min-height:44px;min-width:44px;padding:8px 18px;border:0;border-radius:999px;background:rgba(255,255,255,.78);box-shadow:0 8px 28px rgba(22,50,74,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.swim-dive{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);font-size:16px}
.swim-become{position:absolute;top:calc(16px + env(safe-area-inset-top));right:calc(16px + env(safe-area-inset-right));font-size:14px;color:#3d5a72}
.swim-chip{position:absolute;left:0;top:0;display:flex;align-items:center;gap:12px;width:max-content;max-width:min(320px,calc(100vw - 32px));padding:8px 16px 8px 8px;border-radius:999px;background:rgba(251,250,245,.84);box-shadow:0 6px 20px rgba(23,24,75,.14);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.swim-chip>div{min-width:0}
@media (max-height:500px){
  body:has(#klc-play .sheet:not([hidden])) .swim-chip{visibility:hidden}
}
.swim-ring{width:44px;height:44px;flex:none}
.swim-name{font-size:15px;font-weight:700;line-height:1.3;line-break:strict;text-wrap:pretty}
.swim-fact{margin:0;font-size:12px;line-height:1.5;color:#3d5a72;line-break:strict;text-wrap:pretty}
.swim-leap{position:absolute;left:50%;top:22%;transform:translateX(-50%);margin:0;padding:10px 18px;border-radius:999px;background:rgba(251,250,245,.86);font-size:18px;letter-spacing:.08em;line-break:strict}
.swim-hint{position:absolute;left:0;top:0;margin:0;width:max-content;max-width:min(320px,calc(100vw - 32px));padding:10px 16px;border-radius:16px;background:rgba(251,250,245,.88);box-shadow:0 6px 20px rgba(23,24,75,.16);text-align:center;font-size:14px;font-weight:700;line-height:1.6;color:#223A70;line-break:strict;text-wrap:pretty;opacity:0;transition:opacity .2s ease-out}
.swim-hint.on{opacity:1}
@media (prefers-reduced-motion:reduce){.swim-hint{transition:none}}
body.klc-swim #klc-board,body.klc-swim #klc-x [data-act="drive"],body.klc-swim #klc-ui [data-act="view"],body.klc-swim #klc-play .hoya-credit,body.klc-swim .swim-ui .swim-dive{display:none!important}
`;

export function t(key, lang = pickLang()) {
  const pack = STR[lang] || STR.ja;
  return pack[key] || STR.ja[key] || key;
}

export function label(key) {
  return { ja: STR.ja[key] || key, en: STR.en[key] || STR.ja[key] || key };
}

const hits = (x, y, w, h, rects, pad = 0) => {
  for (const q of rects) if (x < q.r + pad && x + w > q.l - pad && y < q.b + pad && y + h > q.t - pad) return true;
  return false;
};

/**
 * A free place for a box of `size` among the HUD's `rects` (all CSS px): the first spot, top to bottom inside `band`
 * ({ top, bottom }), in the columns of `xs` (tried in order), whose box keeps `gap` px off every rect. `keep`: the current spot,
 * kept while it is still free (the chip does not wander when the HUD shifts a little). -> { x, y } or null.
 */
export function findSlot({ size, view, rects, xs, band = null, gap = 8, keep = null, step = 4 }) {
  const w = Math.min(size.w, view.w - 2 * gap), h = size.h;
  const top = band?.top ?? gap, bottom = band?.bottom ?? view.h - gap;
  if (keep && keep.y >= top && keep.y + h <= bottom && keep.x >= 0 && keep.x + w <= view.w && !hits(keep.x, keep.y, w, h, rects, gap)) return { x: keep.x, y: keep.y };
  for (const x0 of xs) {
    const x = Math.max(gap, Math.min(view.w - gap - w, x0));
    for (let y = top; y + h <= bottom; y += step) if (!hits(x, y, w, h, rects, gap)) return { x, y };
  }
  return null;
}

/** The HUD the dive's own boxes keep off (everything persistent on screen; toasts and sheets are not). */
const HUD = '#klc-ui .brand, #klc-ui .tools > *, #klc-ui .mbtn, #klc-ui .pbar, #klc-ui .dock, #klc-ui .places, #klc-ui .attr, #klc-ui button, #klc-ui .chip, '
  + '#klc-x .xbar > *, #klc-x .mini, #klc-x .xdrive, #klc-play .topbar > *, #klc-play .counters > *, #klc-play .cluster .act, #klc-play .prompt, '
  + '#klc-pad .ghost, #klc-pad .cluster .btn, #klc-pad .topbar, #klc-pad .gear';
const CONTROLS = '#klc-pad .ghost, #klc-pad .cluster .btn, #klc-play .cluster .act';

function rectsOf(sel) {
  const out = [];
  if (typeof document === 'undefined') return out;
  const W = innerWidth, H = innerHeight;
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (!(r.width > 1 && r.height > 1) || r.width * r.height > W * H * 0.4) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || e.dataset?.show === '0') continue;
    out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  return out;
}

export function createHud() {
  const root = document.createElement('div');
  root.className = 'swim-ui';
  const style = document.createElement('style');
  style.textContent = CSS;
  const dive = document.createElement('button');
  dive.type = 'button'; dive.className = 'swim-dive'; dive.hidden = true;
  const become = document.createElement('button');
  become.type = 'button'; become.className = 'swim-become';
  const chip = document.createElement('div');
  chip.className = 'swim-chip'; chip.hidden = true;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 44 44'); ring.setAttribute('class', 'swim-ring');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', '22'); track.setAttribute('cy', '22'); track.setAttribute('r', '16');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', 'rgba(22,94,131,.18)'); track.setAttribute('stroke-width', '4');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', '22'); arc.setAttribute('cy', '22'); arc.setAttribute('r', '16');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', '#165E83'); arc.setAttribute('stroke-width', '4');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', 'rotate(-90 22 22)');
  const C = 2 * Math.PI * 16;
  arc.setAttribute('stroke-dasharray', String(C));
  ring.append(track, arc);
  const name = document.createElement('div');
  const sp = document.createElement('div'); sp.className = 'swim-name';
  const fact = document.createElement('p'); fact.className = 'swim-fact';
  name.append(sp, fact);
  chip.append(ring, name);
  const leap = document.createElement('p'); leap.className = 'swim-leap'; leap.hidden = true;
  const hint = document.createElement('p'); hint.className = 'swim-hint'; hint.hidden = true;
  hint.setAttribute('role', 'status');
  root.append(style, dive, become, chip, leap, hint);
  document.body.append(root);
  let leapT = 0, lang = '', layAcc = 0, chipAt = null, hintKey = '';

  function paint() {
    const L = pickLang();
    if (L === lang) return;
    lang = L;
    dive.textContent = t('play.swim.dive', L);
    become.textContent = t('play.swim.become', L);
    if (hintKey) hint.textContent = t(hintKey, L);
  }
  paint();

  /** The chip: the first free spot under the top HUD, in the left column, then the middle, then the right. */
  function placeChip() {
    if (chip.hidden) return;
    const W = innerWidth, H = innerHeight;
    const rects = rectsOf(HUD);
    const size = { w: chip.offsetWidth, h: chip.offsetHeight };
    const at = findSlot({ size, view: { w: W, h: H }, rects, xs: [16, (W - size.w) / 2, W - size.w - 16], band: { top: 8, bottom: H * 0.62 }, keep: chipAt })
      || { x: 16, y: 8 };
    chipAt = at;
    chip.style.transform = 'translate3d(' + at.x.toFixed(0) + 'px,' + at.y.toFixed(0) + 'px,0)';
  }
  /** The hint: centred, as low as it fits, near the thumbs: the lowest spot in the bottom 70 % clear of the HUD, the controls
   *  and the chip (portrait: just above the stick and the buttons; landscape: between them, above the time row). */
  function placeHint() {
    if (hint.hidden) return;
    const W = innerWidth, H = innerHeight;
    const rects = rectsOf(HUD + ', .swim-ui .swim-chip');
    const w = Math.min(hint.offsetWidth, W - 32), h = hint.offsetHeight;
    const x = Math.max(16, Math.min(W - 16 - w, (W - w) / 2));
    let at = null;
    for (let y = H - 12 - h; y >= H * 0.3; y -= 4) if (!hits(x, y, w, h, rects, 10)) { at = { x, y }; break; }
    if (!at) {
      const ctl = rectsOf(CONTROLS);
      at = { x, y: Math.max(8, (ctl.length ? Math.min(...ctl.map((q) => q.t)) : H * 0.72) - 12 - h) };
    }
    hint.style.transform = 'translate3d(' + at.x.toFixed(0) + 'px,' + at.y.toFixed(0) + 'px,0)';
  }
  const layout = () => { placeChip(); placeHint(); };
  try { addEventListener('resize', () => requestAnimationFrame(() => { chipAt = null; layout(); })); } catch (e) { /* not a browser */ }

  return {
    root, dive, become, chip, hint,
    onDive(fn) { dive.addEventListener('click', fn); },
    onBecome(fn) { become.addEventListener('click', fn); },
    offer(on) { dive.hidden = !on; },
    hideBecome() { become.hidden = true; },
    show(on) {
      chip.hidden = !on;
      if (on) { chipAt = null; placeChip(); }
      else { leap.hidden = true; hint.hidden = true; hint.classList.remove('on'); hintKey = ''; chip.style.visibility = ''; }
    },
    /** The dive is on (body.klc-swim): the land controls step out (CSS above). */
    swimming(on) { try { document.body.classList.toggle('klc-swim', !!on); } catch (e) { /* */ } },
    /** One thing at a time: while the first-swim coach is up the chip waits (on a phone the bubble, kept off the fish and the
     *  controls, has only the chip's band left), and comes in when the coach goes. */
    wait(on) {
      chip.style.visibility = on ? 'hidden' : '';
      if (!on && !chip.hidden) { chipAt = null; placeChip(); }
    },
    species(id) {
      const L = pickLang();
      sp.textContent = t('play.swim.species.' + id, L);
      fact.textContent = t('play.swim.fact.' + id, L);
      if (!chip.hidden) { chipAt = null; placeChip(); }
    },
    stamina(k) { arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(1, k))))); },
    leapt() { leap.hidden = false; leap.textContent = t('play.swim.breach'); leapT = 1.35; },
    /** One line of teaching at a time (a key of play-i18n), or null to clear it. */
    say(key) {
      if (!key) { hint.classList.remove('on'); hint.hidden = true; hintKey = ''; return; }
      hintKey = key;
      hint.textContent = t(key);
      hint.hidden = false;
      placeHint();
      requestAnimationFrame(() => hint.classList.add('on'));
    },
    get saying() { return hintKey; },
    quiet() { hint.classList.remove('on'); hint.hidden = true; hintKey = ''; },
    layout,
    tick(dt) {
      paint();
      if (leapT > 0) { leapT -= dt; if (leapT <= 0) leap.hidden = true; }
      layAcc += dt > 0 ? dt : 0;
      if (layAcc >= 0.5) { layAcc = 0; if (!chip.hidden || !hint.hidden) layout(); }
    },
  };
}
