// [jpyc] 「JPYCで買えるお店」 / "Shops that take JPYC": a sheet that lists the shops of data/shops/jpyc.json and, for one shop, its products as JPYC EC (https://ec.jpyc-service.com)
// sells them: a photo, the name, the price in JPYC, what is left, and 「JPYCで買う」, a link that opens the product page on JPYC EC in a new tab. The app never takes a payment or a
// detail of a buyer: the sheet only reads (through the server's cached proxy, /api/jpyc, server/app/jpyc.js) and links out. docs/jpyc/README.md is the whole story.
//
//   const jpyc = mountJpycStore(ctx, life, { i18n, note, force })      ui/hud.js mounts it and publishes it as ctx.services.jpyc (also window.__jpyc)
//   jpyc.enabled                  false under the flyer's ?src=chirashi (kids), under ?jpyc=off and when the data file has nothing this visitor may see
//   jpyc.open(ref, { opener, list, productIds })   open one shop's products (ref: an entry id, a JPYC EC shop slug, or { id | shopSlug, productIds }); false when it may not be shown
//   jpyc.openList({ opener })      the list of shops          jpyc.close()   jpyc.back()   jpyc.isOpen
//   jpyc.has(ref) / jpyc.entry(ref) / jpyc.entries()           what the visitor may see (copies; no consent details)
//   jpyc.mapsUrl(ref)              the Google Maps search link of a shop (null for the demo): the same link is meant for the splat-interiors shop cards
//
// States of a shop: loading (a skeleton), ok, empty, error, offline (reloads by itself when the connection is back), busy (JPYC EC or the proxy is resting), gone, mismatch;
// a copy older than the proxy's TTL says so (キャッシュ-style note with the time). It is a modal dialog like the report sheet: focus is trapped (Tab / Shift+Tab), Esc steps back or
// closes, the rest of the page is inert, focus returns to the button that opened it, the touch pad steps aside (ctx.pad.suppress('jpyc')), pointer lock is released, and the
// town's keyboard shortcuts do not run while it is open. The look is this file's own (JPYC_CSS, injected on first open); nothing is built until then.
import SHOPS from '../../../data/shops/jpyc.json';
import {
  createT, flyerGate, jpycMode, visibleEntries, resolveRef, resolveApiBase, shopApiUrl, readShopAnswer, productUrl, shopUrl, mapsUrlFor, priceText, availability, availabilityText,
  chainNames, jstHM, GUIDE_URL, SRC_KEY,
} from './jpyc-lib.js';

export const JPYC_STYLE_ID = 'klc-jpyc-css';
export const JPYC_BTN_STYLE_ID = 'klc-jpyc-btn-css';
export const JPYC_ROOT_ID = 'klc-jpyc';
/** A request that takes longer than this is given up (the proxy's own deadline for JPYC EC is 10 s). */
export const FETCH_TIMEOUT_MS = 15000;
/** A shop's products seen this recently are shown at once when the shop is opened again (and refreshed behind them). */
export const LAST_GOOD_MS = 10 * 60 * 1000;

const SVG = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${inner}</svg>`;
export const ICON = {
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  chev: SVG('<path d="M9 5l7 7-7 7"/>'),
  ext: SVG('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  bag: SVG('<path d="M5 8h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>'),
  pin: SVG('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ the look
export const JPYC_CSS = /* css */`
#${JPYC_ROOT_ID} { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #5d6179; --k-glass: rgba(250, 247, 241, 0.97); --k-line: rgba(45, 51, 80, 0.14); --k-accent: #e0703f; --k-blue: #2f7fae;
  --k-err: #a73a2b; --k-warn: #7a3f17; --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  --ease: cubic-bezier(0.23, 1, 0.32, 1); --kj-tap: 40px;
  position: fixed; inset: 0; z-index: 60; pointer-events: none; visibility: hidden; font-family: var(--k-sans); color: var(--k-ink); -webkit-font-smoothing: antialiased; line-break: strict; word-break: auto-phrase;
  transition: visibility 0s .34s; }
#${JPYC_ROOT_ID}[data-open="1"] { visibility: visible; pointer-events: auto; transition: visibility 0s; }
#${JPYC_ROOT_ID} * { box-sizing: border-box; }
#${JPYC_ROOT_ID} [hidden] { display: none !important; }
#${JPYC_ROOT_ID} p { margin: 0; text-wrap: pretty; }
#${JPYC_ROOT_ID} button, #${JPYC_ROOT_ID} a { -webkit-tap-highlight-color: transparent; }
#${JPYC_ROOT_ID} button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; touch-action: manipulation; text-align: inherit; transition: transform var(--dur-press, 140ms) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), background-color var(--dur-fast, 160ms) ease; }
#${JPYC_ROOT_ID} .kj-iconbtn:active, #${JPYC_ROOT_ID} .kj-lang:active { transform: scale(0.97); }
#${JPYC_ROOT_ID} :focus-visible { outline: 2px solid var(--k-blue); outline-offset: 2px; }
#${JPYC_ROOT_ID} [tabindex="-1"]:focus { outline: none; }
#${JPYC_ROOT_ID} svg { width: 18px; height: 18px; flex: none; }
#${JPYC_ROOT_ID} .kj-scrim { position: absolute; inset: 0; background: rgba(22, 30, 60, 0.34); opacity: 0; transition: opacity .3s var(--ease); }
#${JPYC_ROOT_ID}[data-open="1"] .kj-scrim { opacity: 1; }

/* the sheet: a head and one scrolling body (a column, so the body takes what the head leaves); the footer is the last thing in the body and rests at the sheet's bottom, or sticks to it while the list scrolls */
#${JPYC_ROOT_ID} .kj-sheet { position: absolute; display: flex; flex-direction: column; overflow: hidden; border-radius: 22px; background: var(--k-glass);
  -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); box-shadow: 0 18px 50px rgba(35, 40, 70, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  opacity: 0; transform: translate3d(28px, 0, 0); transition: opacity .28s var(--ease), transform .36s var(--ease); }
#${JPYC_ROOT_ID}[data-open="1"] .kj-sheet { opacity: 1; transform: none; }
@media (min-width: 721px) and (min-height: 521px) {
  #${JPYC_ROOT_ID} .kj-sheet { top: calc(18px + env(safe-area-inset-top, 0px)); right: calc(18px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px)); width: min(440px, calc(100vw - 36px)); }
}
@media (max-width: 720px) {
  #${JPYC_ROOT_ID} { --kj-tap: 44px; }
  #${JPYC_ROOT_ID} .kj-sheet { left: max(10px, env(safe-area-inset-left, 0px)); right: max(10px, env(safe-area-inset-right, 0px)); bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    height: min(780px, calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); height: min(780px, calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); transform: translate3d(0, 40px, 0); }   /* (the vh line is for a Safari before 15.4, which does not know dvh and would drop the whole declaration) */
}
@media (orientation: landscape) and (max-height: 520px) {
  #${JPYC_ROOT_ID} { --kj-tap: 44px; }
  #${JPYC_ROOT_ID} .kj-sheet { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: calc(8px + env(safe-area-inset-bottom, 0px)); height: auto; left: calc(10px + env(safe-area-inset-left, 0px)); right: calc(10px + env(safe-area-inset-right, 0px));
    width: min(780px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); margin: 0 auto; transform: translate3d(0, 28px, 0); }
}
@media (pointer: coarse) { #${JPYC_ROOT_ID} { --kj-tap: 44px; } }
body.klc-pad #${JPYC_ROOT_ID} { --kj-tap: 44px; }
body.klc-jpyc-open #klc-ui-restore { display: none !important; }

#${JPYC_ROOT_ID} .kj-head { flex: none; display: flex; align-items: center; gap: 6px; padding: 10px 12px 8px 14px; border-bottom: 1px solid var(--k-line); min-height: calc(var(--kj-tap) + 18px); }
#${JPYC_ROOT_ID} .kj-title { margin: 0; flex: 1 1 auto; min-width: 0; font: 900 17px/1.3 var(--k-round); letter-spacing: 0.03em; color: var(--k-navy); overflow-wrap: break-word; }
#${JPYC_ROOT_ID} .kj-iconbtn, #${JPYC_ROOT_ID} .kj-lang { flex: none; display: grid; place-items: center; min-width: var(--kj-tap); height: var(--kj-tap); border-radius: 999px; color: var(--k-navy); }
#${JPYC_ROOT_ID} .kj-iconbtn { width: var(--kj-tap); border-radius: 50%; }
#${JPYC_ROOT_ID} .kj-iconbtn svg { width: 20px; height: 20px; }
#${JPYC_ROOT_ID} .kj-lang { padding: 0 12px; font: 700 12px/1 var(--k-sans); background: rgba(31, 58, 104, 0.07); }
@media (hover: hover) and (pointer: fine) { #${JPYC_ROOT_ID} .kj-iconbtn:hover, #${JPYC_ROOT_ID} .kj-lang:hover { background: rgba(31, 58, 104, 0.13); } }

#${JPYC_ROOT_ID} .kj-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 14px 16px 0; scroll-padding: 12px; }
#${JPYC_ROOT_ID} .kj-screen { flex: 1 0 auto; display: flex; flex-direction: column; gap: 12px; }
#${JPYC_ROOT_ID} .kj-shophead { display: grid; gap: 6px; justify-items: start; }
#${JPYC_ROOT_ID} .kj-intro { font: 500 13px/1.7 var(--k-sans); }
#${JPYC_ROOT_ID} .kj-note { font: 500 12.5px/1.65 var(--k-sans); color: var(--k-muted); }
#${JPYC_ROOT_ID} .kj-rate { font: 700 12.5px/1.4 var(--k-round); color: var(--k-navy); padding: 6px 10px; border-radius: 12px; background: rgba(31, 58, 104, 0.07); align-self: flex-start; }
#${JPYC_ROOT_ID} .kj-h { margin: 4px 0 0; font: 900 14px/1.3 var(--k-round); color: var(--k-navy); letter-spacing: 0.03em; }
#${JPYC_ROOT_ID} .kj-links { display: flex; flex-wrap: wrap; gap: 4px 14px; }
#${JPYC_ROOT_ID} .kj-link, #${JPYC_ROOT_ID} .kj-maps { display: inline-flex; align-items: center; gap: 6px; min-height: var(--kj-tap); padding: 0 2px; font: 700 13px/1.3 var(--k-sans); color: var(--k-blue); text-decoration: underline; text-underline-offset: 3px; }
#${JPYC_ROOT_ID} .kj-link svg, #${JPYC_ROOT_ID} .kj-maps svg { width: 15px; height: 15px; }
#${JPYC_ROOT_ID} .kj-badge { display: inline-block; align-self: flex-start; padding: 4px 9px; border-radius: 8px; background: #f3e1c9; color: var(--k-warn); font: 700 12px/1.35 var(--k-sans); }
#${JPYC_ROOT_ID} .kj-badge[data-kind="kesennuma"] { background: rgba(47, 127, 174, 0.14); color: #1d5a80; }
#${JPYC_ROOT_ID} .kj-badge[data-kind="pending"] { background: #e9d6d2; color: #7e2a1e; }
#${JPYC_ROOT_ID} .kj-badge[data-kind="alcohol"] { background: #e6dcef; color: #46285f; }
#${JPYC_ROOT_ID} .kj-sub { font: 500 12px/1.5 var(--k-sans); color: var(--k-muted); overflow-wrap: break-word; }
#${JPYC_ROOT_ID} .kj-stale { padding: 8px 12px; border-radius: 12px; background: #f3e1c9; color: var(--k-warn); font: 700 12px/1.5 var(--k-sans); }

/* the shop list */
#${JPYC_ROOT_ID} .kj-shops { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
#${JPYC_ROOT_ID} .kj-shopcard { display: grid; gap: 2px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1px var(--k-line) inset; padding: 4px 4px 4px; }
#${JPYC_ROOT_ID} .kj-cardmain { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; min-height: calc(var(--kj-tap) + 14px); padding: 8px 10px 8px 12px; border-radius: 12px; }
#${JPYC_ROOT_ID} .kj-cardname { grid-column: 1; font: 900 15px/1.35 var(--k-round); color: var(--k-navy); overflow-wrap: break-word; }
#${JPYC_ROOT_ID} .kj-cardmain svg { grid-column: 2; grid-row: 1 / span 3; color: var(--k-muted); }
#${JPYC_ROOT_ID} .kj-cardmain .kj-badge, #${JPYC_ROOT_ID} .kj-cardmain .kj-sub { grid-column: 1; }
@media (hover: hover) and (pointer: fine) { #${JPYC_ROOT_ID} .kj-cardmain:hover { background: rgba(31, 58, 104, 0.06); } }
#${JPYC_ROOT_ID} .kj-shopcard .kj-maps { margin: 0 0 2px 10px; }

/* the products */
#${JPYC_ROOT_ID} .kj-products { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
#${JPYC_ROOT_ID} .kj-product { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px 12px; padding: 10px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1px var(--k-line) inset; }
#${JPYC_ROOT_ID} .kj-thumb { grid-row: 1; width: 84px; height: 84px; border-radius: 12px; overflow: hidden; background: rgba(31, 58, 104, 0.07); display: grid; place-items: center; }
#${JPYC_ROOT_ID} .kj-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
#${JPYC_ROOT_ID} .kj-noimg { display: grid; justify-items: center; gap: 4px; color: var(--k-muted); font: 500 10.5px/1.2 var(--k-sans); text-align: center; padding: 4px; }
#${JPYC_ROOT_ID} .kj-noimg svg { width: 22px; height: 22px; }
#${JPYC_ROOT_ID} .kj-pinfo { grid-row: 1; min-width: 0; display: grid; gap: 4px; align-content: start; }
#${JPYC_ROOT_ID} .kj-pname { font: 700 14px/1.4 var(--k-sans); overflow-wrap: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
#${JPYC_ROOT_ID} .kj-price { font: 900 17px/1.2 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
#${JPYC_ROOT_ID} .kj-avail { font: 700 12px/1.3 var(--k-sans); color: #2b6a3f; }
#${JPYC_ROOT_ID} .kj-avail[data-kind="out"], #${JPYC_ROOT_ID} .kj-avail[data-kind="ended"], #${JPYC_ROOT_ID} .kj-avail[data-kind="unavailable"], #${JPYC_ROOT_ID} .kj-avail[data-kind="soon"] { color: var(--k-warn); }
#${JPYC_ROOT_ID} .kj-avail[data-kind="low"] { color: #8a4b1f; }
#${JPYC_ROOT_ID} .kj-btn { grid-column: 1 / -1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: var(--kj-tap); padding: 0 16px; border-radius: 999px; font: 700 14px/1.2 var(--k-round);
  text-decoration: none; background: var(--k-navy); color: #fff; box-shadow: 0 4px 12px rgba(31, 58, 104, 0.28); transition: transform var(--dur-press, 140ms) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), background-color var(--dur-fast, 160ms) ease; }
#${JPYC_ROOT_ID} .kj-btn.kj-view { background: rgba(31, 58, 104, 0.1); color: var(--k-navy); box-shadow: none; }
#${JPYC_ROOT_ID} .kj-btn svg { width: 16px; height: 16px; }
#${JPYC_ROOT_ID} .kj-btn:active { transform: scale(0.97); }
#${JPYC_ROOT_ID} .kj-cardmain:active { background: rgba(31, 58, 104, 0.12); }   /* a row inside a scroller presses with a background, not a scale */
@media (hover: hover) and (pointer: fine) { #${JPYC_ROOT_ID} .kj-btn:hover { background: #17305a; } #${JPYC_ROOT_ID} .kj-btn.kj-view:hover { background: rgba(31, 58, 104, 0.17); } }
#${JPYC_ROOT_ID} .kj-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* loading, empty, error: one block each */
#${JPYC_ROOT_ID} .kj-state { display: grid; gap: 8px; justify-items: start; padding: 14px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1px var(--k-line) inset; }
#${JPYC_ROOT_ID} .kj-state b { font: 900 14.5px/1.4 var(--k-round); color: var(--k-navy); }
#${JPYC_ROOT_ID} .kj-state[data-phase="error"] b, #${JPYC_ROOT_ID} .kj-state[data-phase="gone"] b, #${JPYC_ROOT_ID} .kj-state[data-phase="mismatch"] b { color: var(--k-err); }
#${JPYC_ROOT_ID} .kj-state .kj-btn { grid-column: auto; justify-self: stretch; }
#${JPYC_ROOT_ID} .kj-skel { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px 12px; padding: 10px; border-radius: 16px; background: rgba(255, 255, 255, 0.6); box-shadow: 0 0 0 1px var(--k-line) inset; }
#${JPYC_ROOT_ID} .kj-skel i { display: block; border-radius: 12px; background: rgba(31, 58, 104, 0.09); animation: kj-pulse 1.3s ease-in-out infinite; }
#${JPYC_ROOT_ID} .kj-skel .a { width: 84px; height: 84px; grid-row: 1 / span 3; }
#${JPYC_ROOT_ID} .kj-skel .b { height: 14px; width: 80%; } #${JPYC_ROOT_ID} .kj-skel .c { height: 18px; width: 40%; } #${JPYC_ROOT_ID} .kj-skel .d { height: 12px; width: 55%; }
@keyframes kj-pulse { 50% { opacity: 0.45; } }

/* the footer: the guardian's line and the credits, stuck to the bottom of what scrolls */
#${JPYC_ROOT_ID} .kj-foot { position: sticky; bottom: 0; margin: auto -16px 0; flex: none; padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px)); display: grid; gap: 6px; background: linear-gradient(to bottom, rgba(250, 247, 241, 0.88), var(--k-glass) 30%); border-top: 1px solid var(--k-line); }
#${JPYC_ROOT_ID} .kj-guardian { font: 700 12px/1.55 var(--k-sans); color: var(--k-ink); }
#${JPYC_ROOT_ID} .kj-credit { font: 500 11px/1.55 var(--k-sans); color: var(--k-muted); }
@media (max-width: 720px), (orientation: landscape) and (max-height: 520px) { #${JPYC_ROOT_ID} .kj-foot { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); } }
@media (orientation: landscape) and (max-height: 520px) { #${JPYC_ROOT_ID} .kj-foot { position: static; } }
@media (prefers-reduced-motion: reduce) { #${JPYC_ROOT_ID}, #${JPYC_ROOT_ID} * { transition: none !important; animation: none !important; } }
`;

/**
 * The toolbar item's one layout rule, injected when the HUD mounts (the sheet's own style waits for the first open). The toolbar is right-anchored, so an item at its start moves none of the others, but
 * between 721 and 839 px it is full up to the wordmark (the report button leaves it for a second row there: style.js): one more 46 px item would push the quality selector over 気仙沼リビングシティ,
 * so there the item leaves the row too and sits beside the report button, in the same second row (the pad's 44 px variant has its own offsets, like the report button's).
 */
export const JPYC_BTN_CSS = `@media (min-width: 721px) and (max-width: 839px) {
  #klc-ui .tools .jpyc { position: absolute; top: 94px; right: 46px; margin: 0; }
  body.klc-pad #klc-ui .tools .jpyc { top: 92px; right: 52px; width: 44px; height: 44px; }
}`;

// ------------------------------------------------------------------ the views (pure: a model and a t() in, HTML out)
const external = (t) => `<span class="kj-sr">${esc(t('jpyc.external'))}</span>`;
const guideLine = (t) => `<p class="kj-links"><a class="kj-link" href="${esc(GUIDE_URL)}" target="_blank" rel="noopener noreferrer" title="${esc(t('jpyc.what.hint'))}">${esc(t('jpyc.what'))}${ICON.ext}${external(t)}</a></p>`;
const footHtml = (t) => `<footer class="kj-foot"><p class="kj-guardian">${esc(t('jpyc.guardian'))}</p><p class="kj-credit">${esc(t('jpyc.credit'))}</p></footer>`;
const nameOf = (e, lang) => (lang === 'en' ? e.en || e.ja : e.ja || e.en);
const devBadge = (key, t) => `<span class="kj-badge" data-kind="pending">${esc(t(key))}</span>`;
const badgeHtml = (e, t) => (e.kind === 'demo' ? `<span class="kj-badge" data-kind="demo">${esc(t('jpyc.demo.badge'))}</span>`
  : e.pending ? devBadge('jpyc.dev.pending', t) : `<span class="kj-badge" data-kind="kesennuma">${esc(t('jpyc.kind.kesennuma'))}</span>`) + (e.off ? devBadge('jpyc.dev.off', t) : '');   // (the dev-only labels: this entry would not be shown in production)
const mapsLink = (e, t) => { const u = mapsUrlFor(e); return u ? `<a class="kj-maps" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(t('jpyc.maps.hint'))}">${ICON.pin}${esc(t('jpyc.maps'))}${ICON.ext}${external(t)}</a>` : ''; };

/** The shop list. m: { lang, entries } */
export function listHtml(m, t) {
  const cards = m.entries.map((e) => `<li class="kj-shopcard"><button type="button" class="kj-cardmain" data-act="shop" data-id="${esc(e.id)}"><span class="kj-cardname">${esc(nameOf(e, m.lang))}</span>${badgeHtml(e, t)}`
    + `${e.kind === 'demo' ? `<span class="kj-sub">${esc(t('jpyc.demo.note'))}</span>` : ''}${ICON.chev}<span class="kj-sr">${esc(t('jpyc.shop.see'))}</span></button>${mapsLink(e, t)}</li>`).join('');
  return `<div class="kj-screen" data-screen="list"><p class="kj-intro">${esc(t('jpyc.intro'))}</p>${guideLine(t)}<p class="kj-rate">${esc(t('jpyc.rate'))}</p>`
    + `<h3 class="kj-h">${esc(t('jpyc.shops'))}</h3><ul class="kj-shops">${cards}</ul><p class="kj-note">${esc(t('jpyc.elsewhere'))}</p>${footHtml(t)}</div>`;
}
const productHtml = (p, shop, slug, t) => {
  const a = availability(p, shop), url = productUrl(slug, p);
  const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="" width="84" height="84" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  const thumb = `<span class="kj-thumb">${img || `<span class="kj-noimg" aria-hidden="true">${ICON.bag}<span>${esc(t('jpyc.photo.none'))}</span></span>`}</span>`;
  const cta = !url ? '' : a.buy
    ? `<a class="kj-btn kj-buy" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('jpyc.buy'))}: ${esc(p.name)} ${esc(t('jpyc.external'))}" title="${esc(t('jpyc.buy.hint'))}"><span>${esc(t('jpyc.buy'))}</span>${ICON.ext}</a>`
    : `<a class="kj-btn kj-view" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t('jpyc.view'))}: ${esc(p.name)} ${esc(t('jpyc.external'))}" title="${esc(t('jpyc.view.hint'))}"><span>${esc(t('jpyc.view'))}</span>${ICON.ext}</a>`;
  return `<li class="kj-product" data-id="${esc(p.id)}"${p.alcohol ? ' data-alcohol="1"' : ''}>${thumb}<div class="kj-pinfo"><span class="kj-pname">${esc(p.name)}</span><span class="kj-price">${esc(priceText(p, t))}</span>`
    + `<span class="kj-avail" data-kind="${esc(a.kind)}">${esc(availabilityText(a, t))}</span>${p.alcohol ? `<span class="kj-badge" data-kind="alcohol">${esc(t('jpyc.alcohol.badge'))}</span>` : ''}</div>${cta}</li>`;
};
const skeleton = () => `<ul class="kj-products" aria-hidden="true">${'<li class="kj-skel"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></li>'.repeat(3)}</ul>`;
const stateHtml = (phase, t, { retry = true } = {}) => `<div class="kj-state" data-phase="${esc(phase)}"><b>${esc(t('jpyc.state.' + phase))}</b><p class="kj-note">${esc(t('jpyc.state.' + phase + '.hint'))}</p>${retry ? `<button type="button" class="kj-btn kj-view" data-act="retry">${esc(t('jpyc.retry'))}</button>` : ''}</div>`;

/** One shop's screen. m: { lang, entry, phase, data, stale, narrow } */
export function shopHtml(m, t) {
  const e = m.entry, d = m.data, shop = d?.shop;
  const names = chainNames(shop?.available_chains);
  const ecName = shop?.name && shop.name !== e.ja && shop.name !== e.en ? `<p class="kj-sub">${esc(t('jpyc.shop.ecname', { name: shop.name }))}</p>` : '';
  const head = `<div class="kj-shophead">${badgeHtml(e, t)}${e.kind === 'demo' ? `<p class="kj-note">${esc(t('jpyc.demo.note'))}</p>` : ''}${ecName}`
    + `${names.length ? `<p class="kj-sub">${esc(t('jpyc.chains', { names: names.join(' · ') }))}</p>` : ''}`
    + `<p class="kj-links"><a class="kj-link" href="${esc(shopUrl(e.shopSlug) ?? '')}" target="_blank" rel="noopener noreferrer">${esc(t('jpyc.shop.ec'))}${ICON.ext}${external(t)}</a>${mapsLink(e, t)}</p></div>`;
  const stale = m.stale ? `<p class="kj-stale" role="note">${esc(t('jpyc.state.stale', { time: m.stale }))}</p>` : '';
  let main;
  if (m.phase === 'loading') main = skeleton();
  else if (m.phase === 'ok' && d?.products.length) main = `<p class="kj-rate">${esc(t('jpyc.rate.line'))}</p>${d.products.some((p) => p.alcohol) ? `<p class="kj-note kj-alcohol" role="note">${esc(t('jpyc.alcohol.note'))}</p>` : ''}<ul class="kj-products">${d.products.map((p) => productHtml(p, shop, e.shopSlug, t)).join('')}</ul>`;
  else if (m.phase === 'empty' || (m.phase === 'ok')) main = stateHtml('empty', t, { retry: false });
  else main = stateHtml(['error', 'busy', 'offline', 'gone', 'mismatch'].includes(m.phase) ? m.phase : 'error', t, { retry: m.phase !== 'gone' && m.phase !== 'mismatch' });
  return `<div class="kj-screen" data-screen="shop" data-phase="${esc(m.phase)}">${head}${stale}${main}${guideLine(t)}<p class="kj-note">${esc(t('jpyc.elsewhere'))}</p>${footHtml(t)}</div>`;
}

// ------------------------------------------------------------------ focus helpers
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';
/** The focusable controls inside `root`, in DOM order (disabled, hidden, tabindex=-1 and not-displayed ones left out). */
export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1' && !(el.getAttribute('type') === 'hidden') && !el.closest('[hidden]')
    && (typeof el.getClientRects !== 'function' || el.getClientRects().length > 0));
}
/** Where Tab / Shift+Tab goes from `active` inside `list`: the other end at an edge, the first or last when focus is outside, null = leave it to the browser. */
export function nextFocus(list, active, shift) {
  if (!list.length) return null;
  const i = list.indexOf(active);
  if (i < 0) return shift ? list[list.length - 1] : list[0];
  if (shift && i === 0) return list[list.length - 1];
  if (!shift && i === list.length - 1) return list[0];
  return null;
}
/** What identifies a control across a rebuild of the body: its action and id, else its link, else its text. */
const placeKey = (el) => `${el.getAttribute('data-act') ?? ''}|${el.getAttribute('data-id') ?? ''}|${el.getAttribute('href') ?? ''}|${el.className ?? ''}`;
function safeSession() {
  return { get(k) { try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) : null; } catch { return null; } }, set(k, v) { try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(k, v); } catch { /* private mode */ } } };
}

// ------------------------------------------------------------------ the panel
export function mountJpycStore(ctx, life, o = {}) {
  const doc = o.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;
  const I = o.i18n || null, lang = () => (I?.lang === 'en' ? 'en' : 'ja'), t = createT(lang);
  const search = o.search ?? (typeof location !== 'undefined' ? location.search : '');
  const session = o.session || safeSession();
  const gate = flyerGate({ search, stored: session.get(SRC_KEY) });
  if (gate.persist) session.set(SRC_KEY, gate.persist);
  const hostname = o.hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  const mode = jpycMode(search, hostname), now = o.now || (() => Date.now());   // (?jpyc=dev counts on a dev host only)
  const entries = gate.kids || mode === 'off' ? [] : visibleEntries(o.data ?? SHOPS, { dev: mode === 'dev' });   // (no clock: a phone with a wrong date must not hide a shop that agreed)
  const enabled = entries.length > 0;
  const api = resolveApiBase(search), doFetch = o.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const timeoutMs = o.timeoutMs ?? FETCH_TIMEOUT_MS;
  const on = (type, fn, cap) => { if (typeof addEventListener === 'function') addEventListener(type, fn, cap); };
  const off = (type, fn, cap) => { if (typeof removeEventListener === 'function') removeEventListener(type, fn, cap); };

  const S = { open: false, screen: 'list', entry: null, narrow: null, from: 'list', phase: 'idle', data: null, stale: '', token: 0, opener: null, last: new Map() };
  let root = null, sheet = null, body = null, titleEl = null, backEl = null, langEl = null, liveEl = null, ctl = null, closeT = 0;
  const inerted = [];
  const $ = (sel) => root?.querySelector(sel);
  const focusEl = (el) => { try { el?.focus?.({ preventScroll: false }); } catch { /* gone */ } };
  const byId = (id) => entries.find((e) => e.id === id) || null;
  const raf = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 16));

  // ---------------------------------------------------------------- the page around it
  function ensureStyle() {
    if (doc.getElementById(JPYC_STYLE_ID)) return;
    const st = doc.createElement('style'); st.id = JPYC_STYLE_ID; st.textContent = JPYC_CSS; doc.head.appendChild(st);
  }
  function ensureButtonStyle() {
    if (!doc.head || doc.getElementById(JPYC_BTN_STYLE_ID)) return;
    const st = doc.createElement('style'); st.id = JPYC_BTN_STYLE_ID; st.textContent = JPYC_BTN_CSS; doc.head.appendChild(st);
  }
  function ensureRoot() {
    if (root) return;
    ensureStyle();
    root = doc.createElement('div'); root.id = JPYC_ROOT_ID; root.dataset.open = '0'; root.dataset.screen = 'list';
    root.innerHTML = `<div class="kj-scrim" data-act="close" aria-hidden="true"></div>
<section class="kj-sheet" role="dialog" aria-modal="true" aria-labelledby="kj-title">
  <header class="kj-head"><button type="button" class="kj-iconbtn" data-act="back" hidden>${ICON.back}</button><h2 class="kj-title" id="kj-title"></h2>
    <button type="button" class="kj-lang" data-act="lang"></button><button type="button" class="kj-iconbtn" data-act="close">${ICON.close}</button></header>
  <div class="kj-body" tabindex="-1" role="region" aria-labelledby="kj-title" data-scroll data-f="body"></div><div class="kj-sr" role="status" aria-live="polite" data-f="live"></div>
</section>`;
    doc.body.appendChild(root);
    sheet = $('.kj-sheet'); body = $('[data-f="body"]'); titleEl = $('#kj-title'); backEl = $('[data-act="back"]'); langEl = $('[data-act="lang"]'); liveEl = $('[data-f="live"]');
    root.addEventListener('click', onClick);
    root.addEventListener('error', onImgError, true);   // (an image that fails to load becomes the placeholder; load errors do not bubble)
    root.addEventListener('keydown', (e) => e.stopPropagation());   // (the window handler below runs first; this keeps anything that slips through from reaching the town)
  }
  /** Everything behind the sheet is inert (not focusable, not read out) while it is open: every other child of the body. */
  function setBackground(onOff) {
    if (onOff) {
      for (const el of [...doc.body.childNodes]) if (el.nodeType === 1 && el !== root && !/^(SCRIPT|STYLE|LINK)$/.test(el.tagName) && !el.hasAttribute('inert')) { el.setAttribute('inert', ''); inerted.push(el); }
    } else { for (const el of inerted.splice(0)) el.removeAttribute('inert'); }
  }
  function setModal(onOff) {
    setBackground(onOff);
    doc.body.classList.toggle('klc-jpyc-open', onOff);
    try { ctx?.pad?.suppress?.('jpyc', onOff); } catch { /* no pad */ }
    if (onOff) { try { if (doc.pointerLockElement) doc.exitPointerLock?.(); } catch { /* no lock */ } }
  }
  const announce = (msg) => { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { if (liveEl?.isConnected) liveEl.textContent = msg; }, 30); };

  // ---------------------------------------------------------------- what is on screen
  const model = () => ({ lang: lang(), entries, entry: S.entry, phase: S.phase, data: S.data && S.narrow ? { ...S.data, products: S.data.products.filter((p) => S.narrow.includes(p.id)) } : S.data, stale: S.stale, narrow: S.narrow });
  function render() {
    if (!root) return;
    const m = model();
    root.setAttribute('lang', lang()); root.dataset.screen = S.screen; root.dataset.phase = S.screen === 'shop' ? S.phase : '';
    titleEl.textContent = S.screen === 'shop' && S.entry ? nameOf(S.entry, lang()) : t('jpyc.title.list');
    backEl.hidden = !(S.screen === 'shop' && S.from === 'list');
    backEl.setAttribute('aria-label', t('jpyc.back')); backEl.title = t('jpyc.back');
    root.querySelectorAll('[data-act="close"]').forEach((b) => { if (b.tagName === 'BUTTON') { b.setAttribute('aria-label', t('jpyc.close')); b.title = t('jpyc.close'); } });
    langEl.textContent = I?.t ? I.t('v3.lang') : (lang() === 'en' ? 'JA' : 'EN'); langEl.setAttribute('aria-label', I?.t ? I.t('lang.toggle') : 'Language'); langEl.hidden = !I?.set;
    // the body is replaced as a whole (a phase changed, the language did): a keyboard user who is on a link or a button of it keeps the place, found again by what it is
    const here = doc.activeElement && body.contains(doc.activeElement) && doc.activeElement !== body ? placeKey(doc.activeElement) : null;
    body.innerHTML = S.screen === 'shop' && S.entry ? shopHtml(m, t) : listHtml(m, t);
    if (here) { const again = [...body.querySelectorAll(FOCUSABLE)].find((el) => placeKey(el) === here); if (again) focusEl(again); else focusEl(body); }
  }
  function showList({ focus = true } = {}) {
    S.screen = 'list'; S.entry = null; S.data = null; S.narrow = null; S.stale = ''; S.token++; ctl?.abort();
    render(); body.scrollTop = 0;
    if (focus) focusEl(body);
  }
  function showShop(entry, { from = 'list', narrow = null, focus = true } = {}) {
    S.screen = 'shop'; S.entry = entry; S.from = from; S.narrow = narrow;
    render(); body.scrollTop = 0;
    if (focus) focusEl(body);
    load(entry);
  }
  function setPhase(phase, msg) { S.phase = phase; render(); if (msg) announce(msg); }

  // ---------------------------------------------------------------- the products
  function failure(e) {
    if (e?.code === 'mismatch') return 'mismatch';
    if (e?.code === 'gone') return 'gone';
    if (e?.code === 'busy') return 'busy';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'error';
  }
  /**
   * One GET of the proxy, under one deadline for the whole exchange (the headers and the body: a proxy that answers and then stalls leaves the sheet in the loading state otherwise). The deadline aborts
   * the fetch and also ends the wait for a fetch that ignores the abort. -> { ok, status, json } (json is null when the body was not JSON).
   */
  async function request(url) {
    if (!doFetch) throw Object.assign(new Error('no fetch'), { code: 'error' });
    const c = typeof AbortController === 'function' ? new AbortController() : null; ctl = c;
    let timer;
    const deadline = new Promise((_, rej) => { timer = setTimeout(() => { try { c?.abort(); } catch { /* done */ } rej(Object.assign(new Error('timeout'), { code: 'error' })); }, timeoutMs); });
    const work = (async () => {
      const res = await doFetch(url, { signal: c?.signal, credentials: 'omit', headers: { accept: 'application/json' }, referrerPolicy: 'no-referrer' });
      let json = null;
      try { json = await res.json(); } catch { /* not JSON: an error page of some proxy in between */ }
      return { ok: !!res.ok, status: res.status, json };
    })();
    work.catch(() => {});   // (when the deadline wins, the work's own rejection must not surface as unhandled)
    try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); }
  }
  /** What the proxy said when it refused (its JSON `error`: not_found, busy, mismatch, unavailable, timeout ...) as one of the panel's phases; anything it did not say in words is `error`. */
  function errorCode(r) {
    const said = String(r.json?.error ?? '');
    return said === 'mismatch' ? 'mismatch' : said === 'not_found' || (r.status === 404 && !said) ? 'gone' : said === 'busy' || (r.status === 503 && !said) ? 'busy' : 'error';
  }
  /** The products the visitor sees: the whole list, or the ones the room that opened the panel named. */
  const shownOf = (data) => (S.narrow ? data.products.filter((p) => S.narrow.includes(p.id)) : data.products);
  /** The label of a copy that is old: the time the proxy fetched it from the platform, in Japan time ('' when it is not stale). */
  const asOf = (data) => jstHM(data?.fetchedAt) || '';
  async function load(entry) {
    const token = ++S.token, last = S.last.get(entry.id);
    if (last && now() - last.at < LAST_GOOD_MS) { S.data = last.data; S.stale = last.data.stale ? asOf(last.data) : ''; setPhase(shownOf(last.data).length ? 'ok' : 'empty'); }   // (an answer the proxy itself called stale stays marked when the sheet is opened again)
    else { S.data = null; S.stale = ''; setPhase('loading', t('jpyc.state.loading')); }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { if (!S.data) setPhase('offline', t('jpyc.state.offline')); else { S.stale = asOf(S.data) || jstHM(last.at); render(); } return; }
    try {
      const r = await request(shopApiUrl(api.base, entry.shopSlug));
      if (token !== S.token) return;
      if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: errorCode(r) });
      const data = readShopAnswer(r.json, entry, null);
      S.last.set(entry.id, { at: now(), data }); S.data = data; S.stale = data.stale ? asOf(data) : '';
      const n = shownOf(data).length;
      setPhase(n ? 'ok' : 'empty', n ? t('jpyc.state.loaded', { n }) : t('jpyc.state.empty'));
    } catch (e) {
      if (token !== S.token) return;
      const phase = failure(e);
      if (S.data && phase !== 'mismatch' && phase !== 'gone') { S.stale = asOf(S.data) || jstHM(S.last.get(entry.id)?.at ?? now()); setPhase(shownOf(S.data).length ? 'ok' : 'empty'); return; }   // (the last good copy stays on screen, labelled with the time of the data)
      S.data = null; setPhase(phase, t('jpyc.state.' + phase));
    }
  }

  // ---------------------------------------------------------------- open / close
  const playing = () => !!o.force || doc.body.classList.contains('playing');
  function show(opener) {
    if (!S.open) {
      S.opener = opener || doc.activeElement || null;
      ensureRoot();
      clearTimeout(closeT);
      S.open = true;
      setModal(true);
      void root.offsetWidth;   // (the closed look is computed first, so the slide-in animates)
      root.dataset.open = '1';
    }
  }
  /** Open one shop's products. ref: an entry id, a JPYC EC shop slug, or { id | shopSlug, productIds }. opts.list: came from the list (the back arrow returns to it). */
  function open(ref, opts = {}) {
    if (!enabled || !playing()) return false;
    const r = resolveRef(entries, ref);
    if (!r) return false;
    show(opts.opener);
    showShop(r.entry, { from: opts.list ? 'list' : 'direct', narrow: r.narrow ?? (Array.isArray(opts.productIds) && opts.productIds.length ? opts.productIds : null) });
    return true;
  }
  function openList(opts = {}) {
    if (!enabled || !playing()) return false;
    show(opts.opener);
    showList();
    return true;
  }
  function close({ restoreFocus = true } = {}) {
    if (!S.open) return false;
    S.open = false; S.token++; ctl?.abort();
    root.dataset.open = '0';
    setModal(false);
    closeT = setTimeout(() => { if (!S.open && body) body.innerHTML = ''; }, 380);   // after the slide-out
    const op = S.opener?.isConnected ? S.opener : doc.querySelector('[data-act="jpyc"]');
    S.opener = null;
    if (!restoreFocus) { try { doc.activeElement?.blur?.(); } catch { /* nothing focused */ } return true; }   // (closed with a pointer: like the HUD's own buttons, no focus is left behind for the game's Space to press)
    focusEl(op);
    if (doc.activeElement !== op) focusEl(doc.querySelector('[data-act="menu"]'));   // (a phone: the item lived in the ☰ menu, which is closed again)
    return true;
  }
  /** One step back: a shop to the list it came from, else close. */
  function back() {
    if (!S.open) return false;
    if (S.screen === 'shop' && S.from === 'list') { const id = S.entry?.id; showList({ focus: false }); focusEl($(`[data-act="shop"][data-id="${id}"]`) || body); return true; }
    return close();
  }

  // ---------------------------------------------------------------- events
  function onClick(e) {
    const b = e.target.closest?.('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    const byPointer = e.detail > 0;   // (a mouse click or a tap; a keyboard activation has detail 0)
    if (act === 'close') close({ restoreFocus: !byPointer });
    else if (act === 'back') back();
    else if (act === 'shop') { const en = byId(b.dataset.id); if (en) showShop(en, { from: 'list' }); }
    else if (act === 'retry') { if (S.entry) { load(S.entry); focusEl(body); } }   // (the button is replaced by the loading state: the focus stays in the sheet)
    else if (act === 'lang') toggleLang();
  }
  function onImgError(e) {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const th = img.closest?.('.kj-thumb'); if (!th) return;
    th.innerHTML = `<span class="kj-noimg" aria-hidden="true">${ICON.bag}<span>${esc(t('jpyc.photo.none'))}</span></span>`;
  }
  function toggleLang() {
    if (!I?.set) return;
    I.set(lang() === 'en' ? 'ja' : 'en');
    try { life?.hud?.render?.(); } catch { /* hud gone */ }
    render();
    focusEl($('[data-act="lang"]'));
  }
  /** Keyboard, for the whole page while the sheet is open (a window capture listener: it runs before the HUD's, the car's and the ship's). */
  function onKey(e) {
    if (!S.open || e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); back(); return; }
    if (e.key === 'Tab') {
      const list = focusables(sheet), active = doc.activeElement && sheet.contains(doc.activeElement) ? doc.activeElement : null;
      const next = nextFocus(list, active, e.shiftKey);
      if (next) { e.preventDefault(); focusEl(next); } else if (!list.length) e.preventDefault();
      e.stopImmediatePropagation(); return;
    }
    e.stopImmediatePropagation();   // the town's shortcuts (WASD, F, H, M, 1-9 ...) do not run while the visitor reads; the default action (scrolling, activating a link) is untouched
  }
  /** The connection is back: a shop that could not load tries again. */
  function onOnline() { if (S.open && S.screen === 'shop' && S.entry && ['offline', 'error', 'busy'].includes(S.phase)) load(S.entry); }
  if (enabled) { on('keydown', onKey, true); on('online', onOnline); try { ensureButtonStyle(); } catch { /* no head */ } }

  // ---------------------------------------------------------------- the service
  const service = {
    get enabled() { return enabled; },
    get kids() { return gate.kids; },
    get mode() { return mode; },
    get isOpen() { return S.open; },
    entries: () => entries.map((e) => ({ ...e })),
    entry: (ref) => { const r = resolveRef(entries, ref); return r ? { ...r.entry } : null; },
    has: (ref) => !!resolveRef(entries, ref),
    mapsUrl: (ref) => { const r = resolveRef(entries, ref); return r ? mapsUrlFor(r.entry) : null; },
    open, openList, close, back, t, root: () => root,
    get state() { return S; },
    /** Take the keyboard handler off (tests that mount twice). */
    destroy() { off('keydown', onKey, true); off('online', onOnline); if (S.open) close(); setBackground(false); root?.remove(); root = null; },
  };
  if (ctx) { ctx.services = ctx.services || {}; ctx.services.jpyc = service; }
  try { if (typeof window !== 'undefined') window.__jpyc = service; } catch { /* a frozen window */ }   // (like window.__contrib / __life: the e2e and the console reach the panel through it)
  return service;
}
