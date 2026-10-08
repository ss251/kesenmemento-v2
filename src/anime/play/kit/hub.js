// [play] あそぶ. One tap from anywhere, then a title card, then the mode.
// PLAY-ENTRY §1, §2, §5. Closed, it costs nothing per frame.

import { listModes, onModes } from './modes.js';
import { sfx } from './sfx.js';

const STEP_ICONS = [
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="none" stroke="#223A70" stroke-width="2" stroke-linecap="round" d="M8 24c2-6 4-8 8-8s4 2 6 6M14 10a3 3 0 1 0 0.1 0"/></svg>',
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#F8B500" stroke="#223A70" stroke-width="1.6" d="M16 3l2.2 8.2L26 13l-6.4 4.2L21.2 26 16 21l-5.2 5 1.6-8.8L6 13l7.8-1.8z"/></svg>',
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="none" stroke="#223A70" stroke-width="2" stroke-linejoin="round" d="M10 20c0-3 1-6 3-8 0-3 2-5 4-5s3 2 3 5c1 0 3 1 4 3M12 22h8"/></svg>',
];

// 青海波 (seigaiha), after the title logo's tile: rows of concentric arcs. A fine one for surfaces,
// a bold edge band for the title card, and a column of scallops for the wipe's leading edge.
const svgURI = (w, h, body) => 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>') + '")';
const arcs = (cx, cy, rs, stroke, sw) => rs.map((r) => '<path d="M' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>').join('');
const scallop = (cx, cy, r, fill, rings) => '<path d="M' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + 'Z" fill="' + fill + '"/>' + rings;
const SEI_FINE = svgURI(40, 20, arcs(0, 20, [18, 12, 6], '#FBFAF5', 1.2) + arcs(40, 20, [18, 12, 6], '#FBFAF5', 1.2) + arcs(20, 10, [18, 12, 6], '#FBFAF5', 1.2));
const SEI_EDGE = svgURI(64, 48,
  scallop(32, 32, 32, '#223A70', arcs(32, 32, [26, 18, 10], '#00A3AF', 2.4)) +
  scallop(0, 48, 32, '#223A70', arcs(0, 48, [26, 18, 10], '#FBFAF5', 2.4)) +
  scallop(64, 48, 32, '#223A70', arcs(64, 48, [26, 18, 10], '#FBFAF5', 2.4)));
const SEI_WIPE = svgURI(48, 64,
  '<path d="M0 0A32 32 0 0 1 0 64Z" fill="#165E83"/>' +
  [26, 18, 10].map((r) => '<path d="M0 ' + (32 - r) + 'A' + r + ' ' + r + ' 0 0 1 0 ' + (32 + r) + '" fill="none" stroke="#FBFAF5" stroke-width="2.2"/>').join(''));
// The logo's カツオ, for a card that has no still yet.
const EMBLEM = '<svg viewBox="-66 -34 124 64" aria-hidden="true"><g stroke-linejoin="round">' +
  '<g fill="#FBFAF5" stroke="#FBFAF5" stroke-width="9"><path d="M-44 0C-36 -10 -16 -16 8 -15C26 -14 40 -8 49 -1.5C51 0 51 2 49 3.5C40 10 24 14 6 14C-16 14 -34 9 -44 0Z"/><path d="M-43 0C-50 -7 -57 -17 -61 -25C-54 -22 -48 -14 -44 -7C-47 -15 -49 -22 -49 -27C-44 -19 -42 -10 -41 -2C-44 6 -50 16 -57 23C-50 21 -45 13 -42 5Z"/><path d="M-6 -13C-2 -23 6 -28 13 -29C11 -22 9 -17 9 -14Z"/></g>' +
  '<g fill="#F8B500" stroke="#223A70" stroke-width="2.6"><path d="M-43 0C-50 -7 -57 -17 -61 -25C-54 -22 -48 -14 -44 -7C-47 -15 -49 -22 -49 -27C-44 -19 -42 -10 -41 -2C-44 6 -50 16 -57 23C-50 21 -45 13 -42 5Z"/><path d="M-6 -13C-2 -23 6 -28 13 -29C11 -22 9 -17 9 -14Z"/><path d="M-44 0C-36 -10 -16 -16 8 -15C26 -14 40 -8 49 -1.5C51 0 51 2 49 3.5C40 10 24 14 6 14C-16 14 -34 9 -44 0Z"/></g>' +
  '<path d="M-30 5.2C-12 8.2 8 9 30 6M-24 8.6C-8 10.6 10 11 26 8.8" fill="none" stroke="#A86A00" stroke-width="1.8" stroke-linecap="round"/>' +
  '<circle cx="37" cy="-3.5" r="3.6" fill="#FBFAF5"/><circle cx="37.8" cy="-3.5" r="2.1" fill="#223A70"/></g></svg>';
const CHIP = {
  min: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="9" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 6.2V9l1.8 1.2M6.4 1.8h3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  solo: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.6" fill="currentColor"/><path d="M3.2 14c.4-3 2.4-4.6 4.8-4.6s4.4 1.6 4.8 4.6z" fill="currentColor"/></svg>',
  many: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.4" cy="5.4" r="2.2" fill="currentColor"/><circle cx="10.8" cy="5.4" r="2.2" fill="currentColor"/><path d="M1.4 13.6c.3-2.6 1.9-4 4-4s3.7 1.4 4 4zM7.8 13.6c.3-2.6 1-3.9 3-3.9s3.7 1.3 4 3.9z" fill="currentColor"/></svg>',
};

export const HUB_CSS = /* css */`
/* The top bar: あそぶ is the primary pill (56 px, 山吹, 2-tone bevel, 3 px white rim); 手帳 the secondary (48 px, 生成り). */
#klc-play .topbar { position: absolute; top: calc(10px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; z-index: 2; }
#klc-play .play-btn, #klc-play .book { position: relative; border-radius: 999px; display: flex; align-items: center; flex: none; white-space: nowrap;
  color: #223A70; letter-spacing: .04em; transition: transform 160ms cubic-bezier(.2,.9,.3,1.3); }
#klc-play .play-btn::before, #klc-play .book::before { content: ""; position: absolute; inset: -4px; }
#klc-play .play-btn { height: 56px; min-height: 56px; padding: 0 26px 0 10px; gap: 10px; font: 800 16px/1 var(--k-round);
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 5px 14px rgba(23,24,75,.38), inset 0 0 0 3px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .play-btn svg { width: 36px; height: 36px; padding: 9px 8px 9px 10px; border-radius: 50%; background: #223A70; color: #FFE38A;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.35); }
#klc-play .play-btn .dot { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; background: #B7282E;
  box-shadow: 0 0 0 3px #FFFFFF, 0 2px 4px rgba(23,24,75,.35); }
#klc-play .play-btn:not(.is-new) .dot { display: none; }
@keyframes klc-pulse { 0% { box-shadow: 0 0 0 0 rgba(248,181,0,.7); } 70%, 100% { box-shadow: 0 0 0 14px rgba(248,181,0,0); } }
#klc-play .play-btn.is-new::after { content: ""; position: absolute; inset: 0; border-radius: inherit; animation: klc-pulse 1.8s ease-out infinite; pointer-events: none; }
#klc-play .book { height: 48px; min-height: 48px; padding: 0 20px 0 14px; gap: 8px; font: 800 15px/1 var(--k-round);
  background: linear-gradient(180deg, rgba(255,255,255,.5) 0 50%, rgba(255,255,255,0) 50%), rgba(251,250,245,.94);
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .book svg { width: 22px; height: 22px; }
#klc-play .play-btn:active, #klc-play .book:active { transform: scale(.94); transition-duration: 80ms; }
#klc-play.hub-open .topbar, #klc-play.hub-open .counters, #klc-play.hub-open .cluster { visibility: hidden; }
/* The mode select. The town dims to 鉄紺 55 % (blurred where backdrop-filter is cheap). Phone: a snap carousel, one card
   and a peek of the next, page dots. Desktop: up to 3 columns, the sheet sized to its cards. */
#klc-play .hub { position: absolute; inset: 0; z-index: 4; display: grid; grid-template-columns: minmax(0, 1fr); align-items: end; justify-items: center;
  padding: 12px; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
#klc-play .hub-dim { position: absolute; inset: 0; background: rgba(23,24,75,.55); }
#klc-play .hub-sheet { position: relative; width: 100%; max-width: 960px; min-width: 0; max-height: min(88vh, 780px); display: flex; flex-direction: column;
  background: #FBFAF5; color: #223A70; border-radius: 22px; padding: 18px 16px 10px; overflow: hidden;
  box-shadow: 0 18px 50px rgba(23,24,75,.4), inset 0 0 0 2px rgba(255,255,255,.8); pointer-events: auto; }
#klc-play .hub-sheet::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: linear-gradient(90deg, #165E83, #00A3AF 50%, #165E83); }
#klc-play .hub-head { display: flex; align-items: center; gap: 12px; padding: 0 4px; flex-shrink: 0; }
#klc-play .hub-head h2, #klc-play .mbody h3, #klc-play .titlecard h2 { word-break: auto-phrase; line-break: strict; text-wrap: balance; }
#klc-play .hub-head h2 { margin: 0; font: 800 24px/1.3 var(--k-round); letter-spacing: .02em; }
#klc-play .kicker { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 4px; padding: 4px 10px 4px 8px; border-radius: 999px; font: 800 12px/1 var(--k-round);
  letter-spacing: .12em; color: #223A70; background: #F8B500; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.7); }
#klc-play .kicker::before { content: ""; width: 8px; height: 8px; background: #223A70; clip-path: polygon(0 0, 100% 50%, 0 100%); }
#klc-play .hub-head .x { margin-left: auto; width: 44px; height: 44px; border-radius: 999px; background: rgba(34,58,112,.08);
  font: 700 22px/1 var(--k-round); color: #223A70; box-shadow: inset 0 0 0 1.5px rgba(34,58,112,.18); }
#klc-play .carousel { display: flex; gap: 14px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; padding: 14px 6px 12px; margin: 0 -4px;
  scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; align-items: flex-start; min-width: 0; flex: 1 1 auto; min-height: 0; }
#klc-play .carousel::-webkit-scrollbar { display: none; }
#klc-play .mcard { position: relative; flex: 0 0 82%; flex-shrink: 0; scroll-snap-align: center; text-align: left; background: #FFFFFF; border-radius: 18px;
  box-shadow: 0 8px 22px rgba(23,24,75,.16), 0 0 0 1px rgba(23,24,75,.12); overflow: hidden; min-height: 44px; padding: 0;
  display: flex; flex-direction: column; color: #223A70; cursor: pointer;
  transition: transform 200ms cubic-bezier(.2,.9,.3,1.2), opacity 200ms ease, box-shadow 200ms ease, filter 200ms ease; }
#klc-play .mcard:focus-visible { outline: 3px solid #165E83; outline-offset: 3px; }
#klc-play .carousel.picked .mcard:not(.open) { opacity: .45; filter: saturate(.7); transform: scale(.97); }
#klc-play .mcard.open { opacity: 1; transform: scale(1.04); z-index: 1; filter: none;
  box-shadow: 0 0 0 3px #F8B500, 0 0 0 5px #FFFFFF, 0 16px 36px rgba(23,24,75,.32); }
#klc-play .still { position: relative; aspect-ratio: 16/10; margin: 8px 8px 0; border-radius: 12px; overflow: hidden; display: grid; place-items: center;
  background: ${SEI_FINE} 0 0 / 40px 20px, linear-gradient(160deg, #223A70, #165E83 55%, #00A3AF); background-blend-mode: soft-light, normal;
  box-shadow: inset 0 0 0 1px rgba(23,24,75,.18); }
#klc-play .still > svg { width: 62%; height: auto; filter: drop-shadow(0 4px 0 rgba(23,24,75,.35)); }
/* A card with no still yet takes one of four sea tints in turn (鉄紺, 紺, 藍, 浅葱 only), so a row of them is not one tile repeated. */
#klc-play .mcard:nth-child(4n+2) .still { background: ${SEI_FINE} 0 0 / 40px 20px, linear-gradient(160deg, #17184B, #223A70 55%, #165E83); background-blend-mode: soft-light, normal; }
#klc-play .mcard:nth-child(4n+3) .still { background: ${SEI_FINE} 0 0 / 40px 20px, linear-gradient(160deg, #165E83, #00A3AF); background-blend-mode: soft-light, normal; }
#klc-play .mcard:nth-child(4n+4) .still { background: ${SEI_FINE} 0 0 / 40px 20px, linear-gradient(160deg, #223A70, #165E83); background-blend-mode: soft-light, normal; }
#klc-play .still img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; opacity: 0; transition: opacity 200ms ease-out; }
#klc-play .still img.in { opacity: 1; }
#klc-play .rec { position: absolute; z-index: 2; left: -30px; top: 14px; width: 120px; padding: 5px 0; transform: rotate(-38deg); text-align: center;
  font: 800 12px/1 var(--k-round); letter-spacing: .08em; color: #223A70; background: #F8B500; box-shadow: 0 2px 6px rgba(23,24,75,.35), inset 0 0 0 1px rgba(255,255,255,.6); }
#klc-play .newb { position: absolute; z-index: 2; right: 8px; top: 8px; padding: 5px 9px 5px 11px; border-radius: 6px;
  font: 800 12px/1 var(--k-round); letter-spacing: .08em; color: #FBFAF5; background: #B7282E; box-shadow: 0 2px 6px rgba(23,24,75,.35), inset 0 0 0 1.5px rgba(255,255,255,.55); }
#klc-play .mbody { padding: 12px 14px 14px; display: grid; gap: 6px; }
#klc-play .mbody h3 { margin: 0; font: 800 20px/1.3 var(--k-round); letter-spacing: .02em; }
#klc-play .hook { margin: 0; font: 500 14px/1.6 var(--k-sans); color: #595857; }
#klc-play .mchips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
#klc-play .mchips span, #klc-play .prog { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 999px;
  font: 700 13px/1 var(--k-round); color: #223A70; background: rgba(22,94,131,.1); box-shadow: inset 0 0 0 1px rgba(22,94,131,.16); }
#klc-play .mchips svg { width: 14px; height: 14px; }
#klc-play .mchips .stars { color: #E0A400; letter-spacing: .06em; }
#klc-play .prog { font-variant-numeric: tabular-nums; color: #FBFAF5; background: #165E83; box-shadow: none; }
#klc-play .more { display: grid; gap: 8px; padding: 0 14px 14px; }
#klc-play .how { list-style: none; margin: 2px 0 0; padding: 0; display: grid; gap: 8px; counter-reset: how; }
#klc-play .how li { display: flex; align-items: center; gap: 10px; font: 700 14px/1.4 var(--k-round); counter-increment: how; }
#klc-play .how li::before { content: counter(how); display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; flex: none;
  font: 800 12px/1 var(--k-round); color: #FBFAF5; background: #165E83; }
#klc-play .how svg { width: 32px; height: 32px; flex: none; }
#klc-play .mcard .go { display: flex; align-items: center; justify-content: center; gap: 10px; height: 56px; border-radius: 999px; color: #223A70;
  font: 800 17px/1 var(--k-round); letter-spacing: .1em;
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 5px 14px rgba(23,24,75,.32), inset 0 0 0 3px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .mcard .go::before { content: ""; width: 12px; height: 14px; background: #223A70; clip-path: polygon(0 0, 100% 50%, 0 100%); }
#klc-play .mcard .go:active, #klc-play .howbtn:active { transform: scale(.96); }
#klc-play .howbtn, #klc-play .back { height: 44px; border-radius: 999px; font: 700 14px/1 var(--k-round); color: #223A70; background: rgba(34,58,112,.07);
  box-shadow: inset 0 0 0 1.5px rgba(34,58,112,.2); }
#klc-play .dots { display: flex; justify-content: center; gap: 0; flex-shrink: 0; }
#klc-play .dots button { width: 44px; min-width: 44px; height: 44px; position: relative; }
#klc-play .dots button::before { content: ""; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 99px;
  background: rgba(34,58,112,.3); transition: width 200ms ease, margin 200ms ease, background 200ms ease; }
#klc-play .dots button[aria-current="true"]::before { width: 22px; margin-left: -11px; background: #F8B500; box-shadow: 0 0 0 1px rgba(23,24,75,.25); }
/* はじめる: a 藍 wipe with a 青海波 leading edge (~400 ms), then the title card (~1.2 s, a tap skips it). */
#klc-play .wipe { position: absolute; inset: 0; z-index: 6; pointer-events: auto; overflow: hidden; }
#klc-play .wipe-fill { position: absolute; inset: 0; background: #165E83 ${SEI_FINE} 0 0 / 40px 20px; background-blend-mode: soft-light;
  transform: scaleX(0); transform-origin: left center; }
#klc-play .wipe.run .wipe-fill { transform: scaleX(1); transition: transform 400ms cubic-bezier(.65,.05,.36,1); }
#klc-play .wipe-edge { position: absolute; top: 0; bottom: 0; width: 48px; left: 0; transform: translateX(-48px);
  background: ${SEI_WIPE} 0 0 / 48px 64px repeat-y; }
#klc-play .wipe.run .wipe-edge { transform: translateX(100vw); transition: transform 400ms cubic-bezier(.65,.05,.36,1); }
#klc-play .titlecard { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center; color: #FBFAF5; pointer-events: auto; text-align: center;
  padding: 24px 24px calc(96px + env(safe-area-inset-bottom, 0px));
  background: ${SEI_FINE} 0 0 / 40px 20px, radial-gradient(ellipse at 50% 42%, #1D73A0 0%, #165E83 46%, #123F66 100%); background-blend-mode: soft-light, normal; }
#klc-play .titlecard::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: calc(72px + env(safe-area-inset-bottom, 0px));
  background: ${SEI_EDGE} 0 0 / 64px 48px repeat-x, linear-gradient(transparent 46px, #223A70 46px); }
#klc-play .tc { position: relative; display: grid; justify-items: center; gap: 14px; }
#klc-play .tc-row { display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; max-width: 100%; }
@media (max-width: 720px) { #klc-play .tc-row { flex-direction: column; gap: 10px; } }
#klc-play .titlecard h2 { margin: 0; font: 900 clamp(46px, 8.4vw, 96px)/1.15 "Noto Sans JP", var(--k-round); letter-spacing: .04em; color: #FBFAF5;
  -webkit-text-stroke: 12px #223A70; paint-order: stroke fill; text-shadow: 0 7px 0 #17184B; font-feature-settings: "palt"; }
#klc-play .titlecard .sub { margin: 0; display: flex; align-items: center; gap: 14px; padding: 10px 26px; border-radius: 4px; background: #223A70;
  font: 700 16px/1.4 var(--k-round); letter-spacing: .14em; color: #FBFAF5; box-shadow: 0 6px 16px rgba(23,24,75,.35), inset 0 0 0 1.5px rgba(255,255,255,.18); }
#klc-play .titlecard .sub::before, #klc-play .titlecard .sub::after { content: ""; width: 28px; height: 2px; background: #F8B500; flex: none; }
#klc-play .titlecard .skip { position: absolute; left: 0; right: 0; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); margin: 0;
  font: 700 13px/1 var(--k-round); letter-spacing: .1em; opacity: .85; }
#klc-play .titlecard .tc .hanko.in { animation-delay: 160ms; }
/* 判子. 朱文 (seal): 茜 ink on paper with a double border. 白文 (word): paper on 茜 ink. Brush face, a slight tilt, lands with a thud. */
#klc-play .hanko { display: grid; place-items: center; font-family: "Yuji Syuku", "Noto Serif JP", serif; font-weight: 400; line-height: 1.12; transform: rotate(-8deg); }
#klc-play .hanko.seal { min-width: 66px; padding: 10px 9px; border-radius: 10px; writing-mode: vertical-rl; font-size: 26px; letter-spacing: .08em;
  color: #B7282E; background: rgba(251,250,245,.97); border: 4px solid #B7282E;
  box-shadow: inset 0 0 0 3px rgba(251,250,245,.97), inset 0 0 0 5px #B7282E, 0 8px 20px rgba(23,24,75,.3); }
#klc-play .hanko.seal.one { writing-mode: horizontal-tb; width: 92px; height: 92px; padding: 0; font-size: 54px; letter-spacing: 0; }
#klc-play .hanko.word { padding: 12px 20px 13px; border-radius: 10px; font-size: 30px; letter-spacing: .04em; white-space: nowrap; color: #FBFAF5; background: #B7282E;
  box-shadow: inset 0 0 0 3px #B7282E, inset 0 0 0 5px rgba(251,250,245,.85), 0 8px 20px rgba(23,24,75,.35); }
#klc-play .hanko.in { animation: klc-hanko 200ms cubic-bezier(.2,1.4,.36,1) both; }
@keyframes klc-hanko { 0% { transform: rotate(-18deg) scale(1.7); opacity: 0; } 60% { transform: rotate(-7deg) scale(.95); opacity: 1; } 100% { transform: rotate(-8deg) scale(1); opacity: 1; } }
@media (min-width: 721px) {
  #klc-play .hub { align-items: center; }
  #klc-play .hub-sheet { width: auto; max-width: min(960px, 100%); padding: 22px 22px 18px; }
  /* Rows keep their content (max-content); past the sheet's height the grid scrolls, it never squashes a card. */
  #klc-play .carousel { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 272px)); grid-auto-rows: max-content; justify-content: center; align-items: start;
    align-content: start; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: none; padding: 16px 14px 14px; margin: 0; }
  #klc-play .mcard { flex: none; width: auto; }
  #klc-play .dots { display: none; }
  #klc-play .hub-dim { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
}
@media (prefers-reduced-motion: reduce) {
  #klc-play .play-btn.is-new::after, #klc-play .mcard, #klc-play .hanko.in, #klc-play .still img { animation: none; transition: none; }
  #klc-play .mcard.open { transform: none; }
  #klc-play .carousel.picked .mcard:not(.open) { transform: none; }
  #klc-play .wipe-edge { display: none; }
  #klc-play .wipe-fill, #klc-play .wipe.run .wipe-fill { transform: none; transition: opacity 200ms linear; }
  #klc-play .wipe-fill { opacity: 0; }
  #klc-play .wipe.run .wipe-fill { opacity: 1; }
}
`;

function loc(v, lang) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v[lang] || v.ja || v.en || '';
}

function stars(n) {
  const k = Math.max(0, Math.min(3, n | 0));
  return '★'.repeat(k) + '☆'.repeat(3 - k);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountHub({ root, store, t, lang, setOverlay, reduced }) {
  const hub = document.createElement('div');
  hub.className = 'hub';
  hub.hidden = true;
  hub.innerHTML = `
    <div class="hub-dim" data-act="dim"></div>
    <div class="hub-sheet" role="dialog" aria-modal="true">
      <div class="hub-head"><div><p class="kicker"></p><h2></h2></div><button type="button" class="x" data-act="x">×</button></div>
      <div class="carousel"></div>
      <div class="dots" role="tablist"></div>
    </div>`;
  const wipe = document.createElement('div');
  wipe.className = 'wipe';
  wipe.hidden = true;
  wipe.innerHTML = '<div class="wipe-fill"></div><div class="wipe-edge" aria-hidden="true"></div>';
  const title = document.createElement('div');
  title.className = 'titlecard';
  title.hidden = true;
  title.setAttribute('role', 'dialog');
  title.setAttribute('aria-modal', 'true');
  title.innerHTML = '<div class="tc"><div class="tc-row"><h2></h2><div class="hanko seal"></div></div><p class="sub"></p></div><p class="skip"></p>';
  root.appendChild(hub);
  root.appendChild(wipe);
  root.appendChild(title);

  const sheet = hub.querySelector('.hub-sheet');
  const headK = hub.querySelector('.kicker');
  const headH = hub.querySelector('h2');
  const closeBtn = hub.querySelector('[data-act="x"]');
  const carousel = hub.querySelector('.carousel');
  const dots = hub.querySelector('.dots');
  const playBtn = root.querySelector('[data-act="play"]');
  let open = false;
  let busy = false;
  let skipTitle = null;
  let artsOn = false;

  function played(id) {
    const row = store.get('meta').played;
    return !!(row && row[id]);
  }
  function isNew(spec) {
    try { if (typeof spec.isNew === 'function') return !!spec.isNew(); } catch (e) { /* */ }
    return !played(spec.id);
  }
  function recommended(spec) {
    if (spec.id !== 'ippon') return false;
    return !played('ippon');
  }
  function progressOf(spec) {
    try {
      const p = typeof spec.progress === 'function' ? spec.progress() : null;
      if (!p) return '';
      if (typeof p === 'string') return p;
      return p[lang()] || p.ja || p.en || '';
    } catch (e) { return ''; }
  }

  function paint() {
    const L = lang();
    headK.textContent = t('play.kit.play');
    headH.textContent = t('play.kit.hub');
    closeBtn.setAttribute('aria-label', t('play.kit.close'));
    sheet.setAttribute('aria-label', t('play.kit.hub'));
    const list = listModes();
    const openId = carousel.querySelector('.mcard.open')?.dataset.mode || '';
    carousel.replaceChildren();
    dots.replaceChildren();
    carousel.style.setProperty('--cols', String(Math.max(1, Math.min(3, list.length))));
    list.forEach((spec, i) => {
      const card = document.createElement('div');
      card.className = 'mcard' + (spec.id === openId ? ' open' : '');
      card.dataset.mode = spec.id;
      card.tabIndex = 0;
      const still = document.createElement('div');
      still.className = 'still';
      still.innerHTML = EMBLEM;
      if (spec.art) {
        const img = artFor(spec);
        if (!img.failed) still.appendChild(img);
      }
      if (recommended(spec)) {
        const b = document.createElement('span');
        b.className = 'rec';
        b.textContent = t('play.kit.hub.rec');
        still.appendChild(b);
      }
      if (isNew(spec)) {
        const b = document.createElement('span');
        b.className = 'newb';
        b.textContent = t('play.kit.hub.new');
        still.appendChild(b);
      }
      const body = document.createElement('div');
      body.className = 'mbody';
      const h = document.createElement('h3');
      h.textContent = loc(spec.title, L);
      const hook = document.createElement('p');
      hook.className = 'hook';
      hook.textContent = loc(spec.hook, L);
      const chips = document.createElement('div');
      chips.className = 'mchips';
      const chip = (icon, text, cls) => {
        const c = document.createElement('span');
        if (cls) c.className = cls;
        c.innerHTML = icon || '';
        c.append(text);
        chips.appendChild(c);
        return c;
      };
      if (spec.minutes) chip(CHIP.min, t('play.kit.hub.min', { n: spec.minutes }));
      if (spec.stars) chip('', stars(spec.stars), 'stars').setAttribute('aria-label', String(spec.stars));
      const many = spec.players === 'many' || (typeof spec.players === 'number' && spec.players > 1);
      chip(many ? CHIP.many : CHIP.solo, many ? t('play.kit.hub.many') : t('play.kit.hub.solo'));
      const prog = progressOf(spec);
      if (prog) {
        const s = document.createElement('span');
        s.className = 'prog';
        s.textContent = prog;
        chips.appendChild(s);
      }
      body.append(h, hook, chips);
      const more = document.createElement('div');
      more.className = 'more';
      more.hidden = spec.id !== openId;
      const how = document.createElement('ol');
      how.className = 'how';
      how.hidden = true;
      const steps = Array.isArray(spec.how) ? spec.how.slice(0, 3) : [];
      steps.forEach((step, si) => {
        const li = document.createElement('li');
        li.innerHTML = STEP_ICONS[si] || STEP_ICONS[0];
        const span = document.createElement('span');
        span.textContent = loc(step, L);
        li.appendChild(span);
        how.appendChild(li);
      });
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'go';
      go.dataset.go = spec.id;
      go.textContent = t('play.kit.hub.start');
      const howBtn = document.createElement('button');
      howBtn.type = 'button';
      howBtn.className = 'howbtn';
      howBtn.dataset.how = spec.id;
      howBtn.textContent = t('play.kit.hub.how');
      howBtn.hidden = steps.length === 0;
      more.append(go, howBtn, how);
      card.append(still, body, more);
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-go]')) { begin(spec); return; }
        if (e.target.closest('[data-how]')) { how.hidden = !how.hidden; return; }
        expand(spec.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); expand(spec.id); }
      });
      carousel.appendChild(card);
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', loc(spec.title, L));
      dot.addEventListener('click', () => {
        card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      });
      dots.appendChild(dot);
    });
    if (list.length === 0) {
      const p = document.createElement('p');
      p.className = 'hook';
      p.textContent = t('play.kit.empty');
      carousel.appendChild(p);
    }
    carousel.classList.toggle('picked', !!openId);
    syncDots();
    const fresh = !store.get('meta').hubOpened;
    if (playBtn) playBtn.classList.toggle('is-new', fresh);
  }

  function syncDots() {
    const cards = [...carousel.querySelectorAll('.mcard')];
    const buttons = [...dots.querySelectorAll('button')];
    if (!cards.length || hub.hidden) return;
    const mid = carousel.scrollLeft + carousel.clientWidth * 0.5;
    let best = 0;
    let bestD = Infinity;
    cards.forEach((c, i) => {
      const x = c.offsetLeft + c.offsetWidth * 0.5;
      const d = Math.abs(x - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    buttons.forEach((b, i) => b.setAttribute('aria-current', i === best ? 'true' : 'false'));
  }

  // [mobile-play] The card stills. One <img> per mode for the life of the hub: a repaint moves it into the new card instead
  // of making it again (each open used to fetch and decode every photo anew, showing the emblem meanwhile). The photos
  // start loading on the first press of the あそぶ pill (pointerdown, before its click opens the sheet) and each fades in
  // over the emblem once decoded, so the phone's first open no longer flashes the emblem and swaps the photo in.
  const arts = new Map();
  function artFor(spec) {
    let img = arts.get(spec.id);
    if (img && img.dataset.art === spec.art) return img;
    img = document.createElement('img');
    img.alt = '';
    img.width = 640;
    img.height = 400;
    img.decoding = 'async';
    img.dataset.art = spec.art;
    const shown = () => { if (!img.failed) img.classList.add('in'); };
    img.addEventListener('load', () => {
      const d = typeof img.decode === 'function' ? img.decode() : null;
      if (d && typeof d.then === 'function') d.then(shown, shown); else shown();
    });
    img.addEventListener('error', () => { img.failed = true; img.remove(); });
    if (artsOn) img.src = spec.art;
    else img.dataset.src = spec.art;
    arts.set(spec.id, img);
    return img;
  }

  function loadArts() {
    if (artsOn) return;
    artsOn = true;
    for (const spec of listModes()) if (spec.art) artFor(spec);   // (cards not painted yet load too)
    for (const img of arts.values()) {
      if (!img.dataset.src) continue;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    }
  }
  if (playBtn) playBtn.addEventListener('pointerdown', loadArts, { once: true, passive: true });

  function expand(id) {
    for (const card of carousel.querySelectorAll('.mcard')) {
      const on = card.dataset.mode === id;
      card.classList.toggle('open', on);
      const more = card.querySelector('.more');
      if (more) more.hidden = !on;
    }
    carousel.classList.add('picked');
    const go = carousel.querySelector('.mcard.open .go');
    if (go) go.focus({ preventScroll: true });
  }

  function show() {
    if (open || busy) return;
    open = true;
    hub.hidden = false;
    root.classList.add('hub-open');
    setOverlay(true);
    // A fresh sheet: nothing chosen yet, so every card is vivid.
    for (const c of carousel.querySelectorAll('.mcard.open')) c.classList.remove('open');
    paint();
    carousel.scrollLeft = 0;
    carousel.scrollTop = 0;
    loadArts();
    sfx.play('tap');
    if (!store.get('meta').hubOpened) {
      store.update('meta', (d) => { d.hubOpened = new Date().toISOString(); });
      if (playBtn) playBtn.classList.remove('is-new');
    }
    closeBtn.focus({ preventScroll: true });
  }
  function hideSheet() {
    open = false;
    hub.hidden = true;
    if (title.hidden && wipe.hidden) {
      root.classList.remove('hub-open');
      setOverlay(false);
    }
    if (playBtn) playBtn.focus({ preventScroll: true });
  }

  // One line, sized to fit: WebKit has no auto-phrase, so a long title would break mid-word (金のカツ／オさがし).
  // Shrink to fit down to 30 px; only past that may it wrap, balanced.
  function fitTitle(h2) {
    h2.style.fontSize = '';
    h2.style.whiteSpace = 'nowrap';
    const room = Math.max(120, (title.clientWidth || window.innerWidth || 393) - 48);
    const fs = parseFloat(getComputedStyle(h2).fontSize) || 46;
    const w = h2.scrollWidth;
    if (w > room) {
      const next = Math.max(30, Math.floor(fs * room / w));
      h2.style.fontSize = next + 'px';
      if (next === 30 && h2.scrollWidth > room) h2.style.whiteSpace = '';
    }
  }

  function showTitle(spec) {
    const L = lang();
    title.querySelector('h2').textContent = loc(spec.title, L);
    const sub = L === 'ja' ? (spec.hook && spec.hook.en) || (spec.title && spec.title.en) || '' : (spec.hook && spec.hook.ja) || (spec.title && spec.title.ja) || '';
    title.querySelector('.sub').textContent = sub;
    title.querySelector('.skip').textContent = t('play.kit.hub.skip');
    const seal = title.querySelector('.hanko');
    seal.textContent = t('play.kit.stamp');
    seal.className = 'hanko seal';
    seal.classList.remove('in');
    title.hidden = false;
    fitTitle(title.querySelector('h2'));
    title.setAttribute('aria-label', loc(spec.title, L));
    if (!reduced()) requestAnimationFrame(() => seal.classList.add('in'));
    else seal.classList.add('in');
    setTimeout(() => { if (!title.hidden) sfx.play('stamp'); }, reduced() ? 0 : 280);
  }

  function endTitle() {
    title.hidden = true;
    wipe.hidden = true;
    wipe.classList.remove('run');
    root.classList.remove('hub-open');
  }

  // [mobile-play] A mode's world is built when it starts (kit/lazy.js), behind this card: prepare() builds it, compiles its
  // programs and uploads its buffers while the card is up, and the card stays until that is done (a tap skips the card's
  // 1.2 s, never the build), so the mode's first frame is the finished world. Never longer than PREP_CAP: a build that
  // never settles must not hold the card forever.
  const PREP_CAP = 12000;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  let lastStart = null;
  function prepareOf(spec) {
    if (typeof spec.prepare !== 'function') return Promise.resolve(null);
    const t0 = performance.now();
    let p;
    try { p = Promise.resolve(spec.prepare()); } catch (e) { console.error('[play] prepare', spec.id, e); return Promise.resolve(null); }
    return Promise.race([p.catch((e) => { console.error('[play] prepare', spec.id, e); }), wait(PREP_CAP)]).then(() => Math.round(performance.now() - t0));
  }

  async function begin(spec) {
    if (busy) return;
    busy = true;
    const t0 = performance.now();
    hideSheet();
    root.classList.add('hub-open');
    setOverlay(true);
    sfx.play('whoosh');
    wipe.hidden = false;
    wipe.classList.remove('run');
    await wait(reduced() ? 20 : 30);
    wipe.classList.add('run');
    await wait(reduced() ? 200 : 420);
    showTitle(spec);
    // the card is on the glass (two frames) before the build starts: the world is drawn behind it while it warms up
    const ready = frame().then(frame).then(() => prepareOf(spec));
    const tCard = performance.now();
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
      const onKey = (e) => {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); finish(); }
      };
      const onPtr = () => finish();
      title.addEventListener('pointerdown', onPtr);
      document.addEventListener('keydown', onKey, true);
      const timer = setTimeout(finish, reduced() ? 400 : 1200);
      function cleanup() {
        clearTimeout(timer);
        title.removeEventListener('pointerdown', onPtr);
        document.removeEventListener('keydown', onKey, true);
      }
      skipTitle = finish;
    });
    skipTitle = null;
    const prepMs = await ready;
    const cardMs = Math.round(performance.now() - tCard);
    endTitle();
    try { store.update('meta', (d) => { if (!d.played || typeof d.played !== 'object' || Array.isArray(d.played)) d.played = {}; d.played[spec.id] = new Date().toISOString(); }); } catch (e) { /* */ }
    try { await spec.start?.(); } catch (e) { console.error('[play] start', spec.id, e); }
    lastStart = { id: spec.id, prepMs, cardMs, totalMs: Math.round(performance.now() - t0) };
    setOverlay(false);
    busy = false;
  }

  hub.addEventListener('click', (e) => { if (e.target === hub || e.target.dataset.act === 'dim') hideSheet(); });
  closeBtn.addEventListener('click', hideSheet);
  carousel.addEventListener('scroll', () => syncDots(), { passive: true });
  onModes(() => { if (!hub.hidden || root.isConnected) paint(); });

  function trap(e) {
    if (e.code !== 'Tab' || hub.hidden) return;
    const list = [...sheet.querySelectorAll('button, [tabindex="0"]')].filter((n) => !n.disabled && n.offsetParent !== null);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', trap);

  return {
    show, hide: hideSheet, paint,
    isOpen: () => open || busy,
    cancelTitle: () => { if (skipTitle) skipTitle(); },
    /** [mobile-play] A mode started from the world (the dive offer, boarding at the quay, the garage door): the same wipe and
     *  title card as はじめる, with the mode's world built behind it. spec: { id, title, hook, prepare, start }. */
    run: (spec) => begin(spec),
    get busy() { return busy; },
    get lastStart() { return lastStart; },
  };
}
