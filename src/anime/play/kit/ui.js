// [play] The HUD's sibling. #klc-ui rewrites its own innerHTML, so this chrome
// lives in #klc-play. Tokens follow src/anime/ui/style.js and docs/CRAFT.md.
// 禁則: line-break strict, auto-phrase on headings, never keep-all.

import * as THREE from 'three';
import STR from '../../../../data/play-i18n.json';
import { counterText, timerText, splitText, splitFaster, esc } from './format.js';
import { onPlayTick, playMode } from './runtime.js';
import { readMode } from './mode.js';
import { sfx } from './sfx.js';
import { store } from './store.js';
import { HUB_CSS, mountHub } from './hub.js';
import { mountCoach, clearCoachSeen } from './coach.js';

/** A lower priority cannot cover a higher one. Equal priority may replace it. 0 means nothing is up. */
export function promptReplaces(current, next) {
  if (current == null || current <= 0) return true;
  return next >= current;
}

/** The phone pad beside 話す keeps jump and dash. 飛ぶ sits only on the ordinary walk row. */
export function promptPadIds(opt) {
  const ids = ['jump', 'dash'];
  if (!opt?.talk) ids.push('fly');
  return ids;
}

/** Enter always presses the prompt. E does too, and only while walking (fly and the dive use E to rise). */
export function promptKeyFires(code, walking) {
  if (code === 'Enter') return true;
  if (code === 'KeyE') return !!walking;
  return false;
}

function promptOnFoot(ctx) {
  const p = ctx?.playerObj;
  if (!p || p.fly || p.gull) return false;
  const s = ctx.services || {};
  if (s.swim?.active || s.explore?.drive?.active || s.drive?.active) return false;
  if (s.sail?.active || s.explore?.sail?.active) return false;
  if (s.play?.gull?.active || s.play?.courses?.active || s.playCar?.race?.phase && s.playCar.race.phase !== 'idle') return false;
  return true;
}

const EXTRA_CSS = /* css */`
/* Results: full screen over the dimmed town. A big medal (a milled rim, the kanji engraved, a shine that sweeps once,
   a 茜 ribbon), the time counting up, and the 判子 landing at 900 ms. Reduced motion: everything at once. */
#klc-play .veil.results { place-items: center; align-content: center; background: rgba(23,24,75,0); padding: 16px; z-index: 5; }
#klc-play.res-open .topbar, #klc-play.res-open .counters, #klc-play.res-open .cluster, #klc-play.res-open .timer, #klc-play.res-open .split { visibility: hidden; }
#klc-play .veil.results.show { background: rgba(23,24,75,.62); transition: background 120ms linear; }
#klc-play .veil.results .panel { position: relative; width: min(560px, 100%); background: transparent; box-shadow: none; color: #FBFAF5; text-align: center; padding: 8px 8px 4px; }
#klc-play .veil.results .res-k { display: inline-block; margin: 0 0 6px; padding: 8px 22px 9px; border-radius: 999px; font: 800 18px/1.2 var(--k-round); letter-spacing: .06em;
  color: #FBFAF5; background: #223A70; box-shadow: inset 0 0 0 2px rgba(255,255,255,.55), 0 4px 12px rgba(23,24,75,.4); }
#klc-play .veil.results .award { position: relative; width: 236px; height: 236px; margin: 0 auto; display: grid; place-items: center; }
#klc-play .veil.results .rays { position: absolute; inset: -84px; border-radius: 50%; pointer-events: none;
  background: repeating-conic-gradient(from 0deg, rgba(255,227,138,.30) 0 7deg, rgba(255,227,138,0) 7deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 70%); mask-image: radial-gradient(circle, #000 18%, transparent 70%);
  animation: klc-spin 24s linear infinite; }
@keyframes klc-spin { to { transform: rotate(360deg); } }
#klc-play .veil.results .strap { position: absolute; top: -6px; width: 46px; height: 120px; background: linear-gradient(90deg, #B7282E 0 34%, #FBFAF5 34% 66%, #B7282E 66%);
  box-shadow: 0 4px 10px rgba(23,24,75,.35); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%); }
#klc-play .veil.results .strap.l { left: 58px; transform: rotate(16deg); transform-origin: 50% 0; }
#klc-play .veil.results .strap.r { right: 58px; transform: rotate(-16deg); transform-origin: 50% 0; }
#klc-play .veil.results .medal { position: relative; width: 188px; height: 188px; margin: 22px 0 0; border: 0; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; font: 700 96px/1 "Noto Serif JP", "Zen Maru Gothic", serif; transform: rotate(-6deg);
  background: radial-gradient(circle at 36% 30%, #FFF3C4 0 10%, #FFE38A 24%, #F8B500 58%, #C98F00 100%);
  box-shadow: 0 0 0 6px #223A70, 0 0 0 9px #FBFAF5, 0 14px 30px rgba(23,24,75,.5);
  color: #A86A00; text-shadow: 0 -2px 0 rgba(90,50,0,.45), 0 2px 0 rgba(255,246,214,.85); }
#klc-play .veil.results .medal::before { content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(rgba(120,70,0,.32) 0 2.5deg, rgba(255,240,190,.38) 2.5deg 5deg);
  -webkit-mask-image: radial-gradient(circle, transparent 0 80%, #000 81%); mask-image: radial-gradient(circle, transparent 0 80%, #000 81%); }
#klc-play .veil.results .medal::after { content: ""; position: absolute; inset: 14%; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(120,70,0,.35), 0 0 0 2px rgba(255,246,214,.55); }
#klc-play .veil.results .medal.silver { background: radial-gradient(circle at 36% 30%, #FFFFFF 0 10%, #F2F4F8 24%, #C9CDD6 58%, #8F96A3 100%); color: #6E7584; text-shadow: 0 -2px 0 rgba(40,44,60,.4), 0 2px 0 rgba(255,255,255,.9); }
#klc-play .veil.results .medal.bronze { background: radial-gradient(circle at 36% 30%, #FFE0C2 0 10%, #F0B07A 24%, #C8763F 58%, #8A4A1E 100%); color: #7A3E14; text-shadow: 0 -2px 0 rgba(60,25,5,.45), 0 2px 0 rgba(255,226,196,.8); }
#klc-play .veil.results .medal .kj { position: relative; z-index: 1; transform: translateY(-3%); }
#klc-play .veil.results .medal .shine { position: absolute; inset: -20%; z-index: 2; pointer-events: none;
  background: linear-gradient(115deg, transparent 36%, rgba(255,255,255,.85) 47%, rgba(255,255,255,.95) 50%, transparent 60%);
  transform: translateX(-120%); animation: klc-shine 760ms 260ms cubic-bezier(.4,0,.2,1) forwards; }
@keyframes klc-shine { to { transform: translateX(120%); } }
@keyframes klc-drop { 0% { transform: translateY(-36px) scale(.6) rotate(-6deg); opacity: 0; } 70% { transform: translateY(5px) scale(1.06) rotate(-6deg); opacity: 1; } 100% { transform: rotate(-6deg); opacity: 1; } }
#klc-play .veil.results .medal.pop { animation: klc-drop 220ms 120ms cubic-bezier(.2,.9,.3,1.25) both; }
#klc-play .veil.results .award > .hanko { position: absolute; right: -58px; bottom: -6px; z-index: 3; }
#klc-play .veil.results .award > .hanko.in { animation: klc-thud 240ms 900ms cubic-bezier(.2,1.4,.36,1) both; }
@keyframes klc-thud { 0% { transform: rotate(-20deg) scale(1.9); opacity: 0; } 55% { transform: rotate(-11deg) scale(.94); opacity: 1; } 100% { transform: rotate(-12deg) scale(1); opacity: 1; } }
#klc-play .veil.results .time-l { margin: 18px 0 0; font: 800 14px/1 var(--k-round); letter-spacing: .2em; color: #FFE38A; }
#klc-play .veil.results .time { margin: 4px 0 0; color: #FBFAF5; font: 900 clamp(52px, 13vw, 72px)/1.05 var(--k-round); font-variant-numeric: tabular-nums;
  -webkit-text-stroke: 10px #223A70; paint-order: stroke fill; text-shadow: 0 5px 0 #17184B; letter-spacing: .01em; }
#klc-play .veil.results .sub { margin: 10px auto 0; display: inline-block; padding: 6px 14px; border-radius: 999px; font: 800 16px/1 var(--k-round);
  font-variant-numeric: tabular-nums; color: #FBFAF5; background: rgba(0,131,143,.92); box-shadow: inset 0 0 0 2px rgba(255,255,255,.5); }
#klc-play .veil.results .sub.slow { background: rgba(183,40,46,.92); }
#klc-play .veil.results .extra { margin: 14px auto 0; color: #FBFAF5; font: 800 18px/1.5 var(--k-round); letter-spacing: .04em; font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 0 rgba(23,24,75,.6); }
/* No medal (a fishing trip): the 優 / 良 / 可 seal stands alone, large, under the title. */
#klc-play .veil.results .panel > .hanko { margin: 18px auto 6px; }
#klc-play .veil.results .panel > .hanko.seal.one { width: 132px; height: 132px; font-size: 84px; border-width: 6px; }
#klc-play .veil.results .panel > .hanko.in { animation: klc-thud 240ms 340ms cubic-bezier(.2,1.4,.36,1) both; }
#klc-play .veil.results .acts { display: flex; justify-content: center; gap: 12px; margin: 22px auto 0; max-width: 460px; }
#klc-play .veil.results .acts button { flex: 1 1 0; max-width: 224px; }
#klc-play .acts .pri { height: 56px; border-radius: 999px; color: #223A70; font: 800 16px/1 var(--k-round); letter-spacing: .06em;
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 5px 14px rgba(23,24,75,.38), inset 0 0 0 3px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .acts .sec { height: 56px; border-radius: 999px; color: #223A70; font: 800 15px/1 var(--k-round); letter-spacing: .06em;
  background: linear-gradient(180deg, rgba(255,255,255,.5) 0 50%, rgba(255,255,255,0) 50%), rgba(251,250,245,.94);
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .acts .pri:active, #klc-play .acts .sec:active { transform: scale(.94); }
/* Erasing the record is the one destructive press: 茜, not the 山吹 of a reward. */
#klc-play .ask .acts .pri { color: #FBFAF5; background: #B7282E; box-shadow: 0 4px 12px rgba(23,24,75,.3), inset 0 0 0 2px rgba(255,255,255,.55); }
/* A phone on its side (393 px tall): the award on the left, the time and the buttons on the right. */
@media (max-height: 540px) and (min-width: 600px) {
  #klc-play .veil.results .panel { width: min(800px, 100%); display: grid; grid-template-columns: 240px minmax(0, 1fr); column-gap: 28px; align-items: center; padding: 0 8px; }
  #klc-play .veil.results .res-k { grid-column: 1 / -1; justify-self: center; margin-bottom: 0; }
  #klc-play .veil.results .award, #klc-play .veil.results .panel > .hanko { grid-column: 1; grid-row: 2 / span 5; }
  #klc-play .veil.results .award { width: 190px; height: 190px; justify-self: center; }
  #klc-play .veil.results .panel > .hanko { justify-self: center; }
  #klc-play .veil.results .medal { width: 140px; height: 140px; margin-top: 18px; font-size: 72px; }
  #klc-play .veil.results .strap { width: 34px; height: 90px; }
  #klc-play .veil.results .strap.l { left: 42px; } #klc-play .veil.results .strap.r { right: 42px; }
  #klc-play .veil.results .award > .hanko { right: -44px; bottom: -4px; }
  #klc-play .veil.results .award > .hanko.word { font-size: 24px; padding: 9px 15px 10px; }
  #klc-play .veil.results :is(.time-l, .time, .sub, .extra, .acts) { grid-column: 2; }
  #klc-play .veil.results .time { font-size: 60px; }
  #klc-play .veil.results .acts { margin: 16px 0 0; width: 100%; justify-self: stretch; }
}
@media (max-width: 720px) {
  #klc-play .veil.results .award { width: 200px; height: 200px; }
  #klc-play .veil.results .medal { width: 160px; height: 160px; font-size: 82px; }
  #klc-play .veil.results .strap { height: 100px; width: 40px; }
  #klc-play .veil.results .strap.l { left: 48px; } #klc-play .veil.results .strap.r { right: 48px; }
  #klc-play .veil.results .award > .hanko { right: -30px; bottom: -14px; }
  #klc-play .veil.results .award > .hanko.word { font-size: 22px; padding: 8px 14px 9px; }
  #klc-play .veil.results .award + .time-l { margin-top: 30px; }
}
/* The action cluster. Desktop: a row in the bottom-right, the primary nearest the corner, a keycap on each.
   Phone: a thumb arc around the primary (slots set in ui.actions), clear of the left stick. */
#klc-play .cluster { position: absolute; right: calc(24px + env(safe-area-inset-right, 0px)); bottom: calc(40px + env(safe-area-inset-bottom, 0px) + var(--lift, 0px));
  display: flex; flex-direction: row-reverse; gap: 20px; align-items: flex-end; z-index: 3; pointer-events: none; }
#klc-play .cluster .act { pointer-events: auto; position: relative; width: 56px; height: 56px; min-width: 56px; min-height: 56px; padding: 0;
  border-radius: 50%; color: #FBFAF5; display: grid; place-items: center;
  background: linear-gradient(180deg, rgba(255,255,255,.16) 0 50%, rgba(255,255,255,0) 50%), rgba(34,58,112,.88);
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4);
  transition: transform 160ms cubic-bezier(.2,.9,.3,1.3), opacity 120ms linear; }
#klc-play .cluster .act.pri { width: 72px; height: 72px; min-width: 72px; min-height: 72px; color: #223A70;
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 5px 14px rgba(23,24,75,.38), inset 0 0 0 3px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .cluster .act:active { transform: scale(.94); transition-duration: 80ms; }
#klc-play .cluster .act:disabled:not(.cool) { opacity: .45; box-shadow: none; }
#klc-play .cluster .act.cool > svg:first-child { opacity: .45; }
#klc-play .cluster .act > svg:first-child { width: 26px; height: 26px; }
#klc-play .cluster .act.pri > svg:first-child { width: 34px; height: 34px; }
#klc-play .cluster .lb { position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%); padding: 3px 9px 4px; border-radius: 999px;
  font: 700 13px/1.2 var(--k-round); color: #FBFAF5; background: rgba(23,24,75,.8); white-space: nowrap; letter-spacing: .02em;
  box-shadow: 0 2px 6px rgba(23,24,75,.3); }
#klc-play .cluster .act.pri .lb { font-size: 15px; font-weight: 800; color: #223A70; background: #FBFAF5; box-shadow: 0 2px 6px rgba(23,24,75,.3), inset 0 0 0 1.5px rgba(34,58,112,.35); }
#klc-play .cluster kbd { position: absolute; left: -8px; top: -8px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 7px;
  font: 800 12px/24px var(--k-round); color: #223A70; background: #FBFAF5; text-align: center; letter-spacing: 0;
  box-shadow: inset 0 -2px 0 rgba(34,58,112,.22), 0 0 0 1.5px #223A70, 0 3px 6px rgba(23,24,75,.3); }
#klc-play .cluster .cd { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); transform: rotate(-90deg); pointer-events: none; }
#klc-play .cluster .cd circle { fill: none; stroke: #F8B500; stroke-width: 3.2; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; }
#klc-play .cluster .cd circle.track { stroke: rgba(23,24,75,.45); stroke-dashoffset: 0; }
#klc-play .cluster:not(.arc) .act.pri { margin-left: 4px; }
#klc-play .cluster.arc { display: block; width: 0; height: 0; right: calc(52px + env(safe-area-inset-right, 0px)); bottom: calc(76px + env(safe-area-inset-bottom, 0px) + var(--lift, 0px)); }
/* With the real HUD. Phones with the touch pad: the HUD owns the top rows, so the kit's row sits on the left under them
   (layoutChrome() measures the HUD and moves the row, the chips and the cluster clear of it). The area name toast moves under
   the あそぶ row. A timed run hides the row: the timer owns the top. */
body.klc-pad #klc-play .topbar { left: calc(10px + env(safe-area-inset-left, 0px)); transform: none; gap: 8px; }
/* One compact row on a phone, so the upper middle stays open for the look: あそぶ (56 px), 手帳 as a 48 px disc, and the
   chips beside them as a badge and a count (they take no touches). */
@media (max-width: 720px) {
  body.klc-pad #klc-play .play-btn { padding: 0 18px 0 10px; }
  body.klc-pad #klc-play .book { width: 48px; min-width: 48px; padding: 0; justify-content: center; }
  body.klc-pad #klc-play .book span { display: none; }
  body.klc-pad #klc-play .counter { padding: 0 14px 0 6px; }
  body.klc-pad #klc-play .counter .nm { display: none; }
}
body.playing.klc-ui #toast { top: calc(78px + env(safe-area-inset-top, 0px)); }
#klc-play.timing .topbar { visibility: hidden; }
/* [emil-ui] A landscape phone: the row starts under the minimap and its caption (top centre, to about 130 px), where #7 had it (132 px). With the wordmark and the
   歩く / 飛ぶ / 運転 row gone it rose to 112 px, level with the minimap, so layoutChrome() found no room beside it for 金のカツオ 0/50 and put the chip under it, on
   the stick (at 128 px the caption's last 2 px still blocked it). */
@media (orientation: landscape) and (max-height: 520px) { body.klc-pad #klc-play .topbar { top: calc(132px + env(safe-area-inset-top, 0px)); } }
/* [emil-ui] The ☰ menu is modal (the pad steps aside): the row and its chips step aside with it. layoutChrome() counts the open menu as an obstacle, so the row
   jumped to just under it, low on the screen, and back when it closed. */
body:has(#klc-ui[data-menu="1"]) #klc-play :is(.topbar, .counters) { visibility: hidden; }
#klc-play .cluster.arc .act { position: absolute; }
#klc-play .cluster.arc kbd { display: none; }
@media (pointer: coarse) { #klc-play .cluster kbd { display: none; } }
/* The coach: a soft spotlight that follows the target (the town dims to 60 %, 200 ms), a pulsing gold ring,
   the hand acting out the gesture, and a speech bubble from a cast-kit portrait. */
#klc-play .coach { position: absolute; inset: 0; z-index: 5; pointer-events: none; --cx: 50vw; --cy: 45vh; }
#klc-play .coach.dim::before { content: ""; position: absolute; inset: 0;
  background: radial-gradient(circle at var(--cx) var(--cy), rgba(23,24,75,0) 0 58px, rgba(23,24,75,.6) 98px); animation: klc-fadein 200ms ease-out both; }
@keyframes klc-fadein { from { opacity: 0; } to { opacity: 1; } }
#klc-play .coach .hole { position: absolute; left: 0; top: 0; width: 116px; height: 116px; margin: -58px 0 0 -58px; border-radius: 50%; }
#klc-play .coach .hole::before { content: ""; position: absolute; inset: 0; border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(248,181,0,.95), 0 0 0 9px rgba(248,181,0,.22); animation: klc-ringpulse 1.2s ease-in-out infinite; }
@keyframes klc-ringpulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: .75; } }
#klc-play .coach .hand { position: absolute; left: 0; top: 0; width: 72px; height: 72px; margin: -6px 0 0 -10px; filter: drop-shadow(0 4px 6px rgba(23,24,75,.45)); }
#klc-play .coach .hand svg { width: 72px; height: 72px; }
#klc-play .coach .glove { width: 72px; height: 72px; position: relative; }
#klc-play .coach .glove.tap { animation: klc-tap 1.2s ease-in-out infinite; }
#klc-play .coach .glove.swipe { animation: klc-swipe 1.2s ease-in-out infinite; }
#klc-play .coach .glove.drag { animation: klc-drag 1.2s ease-in-out infinite; }
#klc-play .coach .glove.hold { animation: klc-hold 1.2s ease-in-out infinite; }
#klc-play .coach .glove.swipe::before { content: ""; position: absolute; left: 28px; top: 50px; width: 8px; height: 70px; border-radius: 4px;
  background: linear-gradient(rgba(251,250,245,.85), rgba(251,250,245,0)); }
#klc-play .coach .holdring { position: absolute; inset: -10px; width: 92px; height: 92px; transform: rotate(-90deg); }
#klc-play .coach .glove.hold .holdring circle { fill: none; stroke: #F8B500; stroke-width: 3; stroke-dasharray: 94; stroke-dashoffset: 94; animation: klc-ring 1.2s linear infinite; }
#klc-play .coach .glove:not(.hold) .holdring { display: none; }
@keyframes klc-tap { 0%, 100% { transform: translateY(0) scale(1); } 45% { transform: translateY(8px) scale(.9); } 60% { transform: translateY(0) scale(1); } }
@keyframes klc-swipe { 0% { transform: translateY(40px); opacity: 0; } 18% { opacity: 1; } 72% { transform: translateY(-40px); opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
@keyframes klc-drag { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(48px); } }
@keyframes klc-hold { 0%, 100% { transform: scale(1); } 30%, 80% { transform: scale(.92); } }
@keyframes klc-ring { to { stroke-dashoffset: 0; } }
#klc-play .coach .bubble { position: absolute; left: 0; top: 0; width: min(380px, 90vw); display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 8px 12px;
  align-items: start; padding: 14px 16px 14px 14px; border-radius: 18px; background: #FBFAF5; color: #223A70; pointer-events: auto;
  box-shadow: 0 10px 28px rgba(23,24,75,.38), 0 0 0 2px #223A70, inset 0 0 0 3px rgba(255,255,255,.9); }
#klc-play .coach .who { width: 56px; height: 56px; grid-column: 1; grid-row: 1 / span 2; border-radius: 50%; box-shadow: 0 0 0 3px #FBFAF5, 0 0 0 4.5px rgba(34,58,112,.35); }
#klc-play .coach .who svg { width: 56px; height: 56px; }
#klc-play .coach .say { grid-column: 2; grid-row: 1; min-width: 0; position: relative; }
#klc-play .coach .say p { margin: 0; font: 700 16px/1.7 var(--k-round); min-height: 1.7em; letter-spacing: .02em; }
#klc-play .coach .caret { position: absolute; right: -2px; bottom: -6px; font-style: normal; font-size: 12px; color: #F8B500; text-shadow: 0 1px 0 #223A70; animation: klc-caret 900ms ease-in-out infinite; }
@keyframes klc-caret { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
#klc-play .coach .ok { grid-column: 2; grid-row: 2; justify-self: end; height: 44px; margin: 2px 0 0; padding: 0 22px; border-radius: 999px; color: #223A70;
  font: 800 15px/1 var(--k-round); letter-spacing: .06em;
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 4px 10px rgba(23,24,75,.3), inset 0 0 0 2.5px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .coach.ok .hole::after { content: "✓"; position: absolute; inset: 0; display: grid; place-items: center; color: #F8B500; font: 900 44px/1 var(--k-round);
  -webkit-text-stroke: 6px #223A70; paint-order: stroke fill; }
#klc-play .floathanko { position: absolute; left: 50%; top: 42%; z-index: 8; pointer-events: none; }
#klc-play .foot { justify-content: space-between; }
#klc-play .foot [data-act="replay"] { color: #223A70; }
@media (prefers-reduced-motion: reduce) {
  #klc-play .coach .glove, #klc-play .coach .hole::before, #klc-play .coach .caret, #klc-play .coach.dim::before, #klc-play .veil.results .medal .shine,
  #klc-play .veil.results .medal.pop, #klc-play .veil.results .rays, #klc-play .veil.results .award > .hanko.in { animation: none; }
  #klc-play .veil.results .medal .shine { display: none; }
}
`;
const FISH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.2 12.2c3.6-4.2 9.2-5.2 15.4-3.4-.2 1.6 1.2 2.6 1.2 3.4s-1.4 1.8-1.2 3.4C12.4 17.4 6.8 16.4 3.2 12.2z"/><path fill="currentColor" d="M3.4 12.2C1.6 10.2.2 8.2.4 6.4c1.6.8 2.6 2.2 3.2 3.6-.8 1.4-1.6 2.6-2.8 3.6 1.2.6 2.2 1.6 2.6 2.6.4-1.4 1.2-2.6 2.2-4z"/></svg>';
// The big toast's underline: one 山吹 brush stroke, heavy in the middle, dry at both ends.
const BRUSH = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 7.2C22 4.6 46 3.4 82 3.6C122 3.8 160 4.4 197 6.4C199 7 198.6 8 196.4 8.2C166 9.4 132 9.6 100 9.4C62 9.2 30 9.8 7 10.6C2.4 10.8.4 8 2 7.2Z" fill="#F8B500"/><path d="M150 4.6L186 5.8M24 9.6L52 9" stroke="#F8B500" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></svg>') + '")';
// Twelve speed lines and a ring behind each countdown beat (集中線).
const BURST = (() => {
  let d = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const w = i % 2 ? 0.035 : 0.06;
    const r0 = 98, r1 = i % 2 ? 150 : 166;
    const p = (r, k) => (Math.cos(a + k) * r).toFixed(1) + ' ' + (Math.sin(a + k) * r).toFixed(1);
    d += 'M' + p(r0, -w) + 'L' + p(r1, 0) + 'L' + p(r0, w) + 'Z';
  }
  return '<circle r="92"/><path d="' + d + '"/>';
})();
const BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M5 4.5h6.2A2.8 2.8 0 0 1 14 7.3V20a2.4 2.4 0 0 0-2.4-2.4H5z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M19 4.5h-6.2A2.8 2.8 0 0 0 10 7.3V20a2.4 2.4 0 0 1 2.4-2.4H19z"/></svg>';

const CSS = /* css */`
#klc-play { --k-ink: #2d3350; --k-navy: #1f3a68; --k-kon: #223A70; --k-iron: #17184B;
  --k-gold: #F8B500; --k-silver: #C9CDD6; --k-bronze: #C8763F;
  --k-paper: rgba(251, 250, 245, 0.96); --k-glass: rgba(250, 247, 241, 0.86);
  --k-fast: #00838F; --k-slow: #B7282E;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif;
  --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  position: fixed; inset: 0; z-index: 7; pointer-events: none; color: var(--k-ink);
  font-family: var(--k-sans); line-break: strict; -webkit-font-smoothing: antialiased; }
#klc-play[hidden], body.noui #klc-play, body:not(.playing) #klc-play { display: none !important; }
#klc-play * { box-sizing: border-box; }
#klc-play [hidden] { display: none !important; }
#klc-play :is(h2, h3, .nm) { word-break: auto-phrase; text-wrap: balance; line-height: 1.3; font-feature-settings: "palt"; }
#klc-play :is(p, li) { text-wrap: pretty; line-height: 1.7; }
#klc-play button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; pointer-events: auto;
  -webkit-tap-highlight-color: transparent; min-height: 44px; min-width: 44px; }
#klc-play button:focus-visible { outline: 2px solid var(--k-navy); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255,255,255,.92); }
#klc-play .glass { background: var(--k-glass); backdrop-filter: blur(10px) saturate(1.2); -webkit-backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14), 0 0 0 1px rgba(255,255,255,.5) inset; }
#klc-play svg { width: 18px; height: 18px; flex: none; }
#klc-play .counters { position: absolute; top: calc(108px + env(safe-area-inset-top, 0px)); left: 16px; display: grid; gap: 8px; z-index: 2; }
/* Status chips: 40 px, the game material (紺 88 %, a 2 px white rim, a 1 px 鉄紺 line), a 山吹 icon badge, 14 px text, tabular count. */
#klc-play .counter { display: flex; align-items: center; gap: 8px; height: 40px; min-height: 40px; padding: 0 16px 0 6px; border-radius: 999px;
  color: #FBFAF5; pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,.14) 0 50%, rgba(255,255,255,0) 50%), rgba(34,58,112,.88);
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .counter .nm { font: 700 14px/1.2 var(--k-round); letter-spacing: .02em; }
#klc-play .counter b { font: 800 14px/1 var(--k-round); font-variant-numeric: tabular-nums; margin-left: 2px; color: #FFE38A; letter-spacing: .02em; }
#klc-play .counter svg { width: 28px; height: 28px; padding: 5px; border-radius: 50%; background: #F8B500; color: #223A70;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.75); }
@keyframes klc-bump { from { transform: scale(1.25); } to { transform: scale(1); } }
#klc-play .counter.bump b { animation: klc-bump 220ms cubic-bezier(0.34, 1.56, 0.64, 1); }
#klc-play .toasts { position: absolute; left: 50%; top: calc(72px + env(safe-area-inset-top, 0px)); transform: translateX(-50%);
  display: grid; gap: 8px; justify-items: center; width: min(92vw, 420px); }
/* Toasts: a 生成り pill that slides 12 px up and fades in (200 ms). A big toast gets a 山吹 brush underline. */
#klc-play .toast { position: relative; padding: 10px 20px 11px; border-radius: 999px; background: rgba(251,250,245,.96); color: #223A70;
  font: 800 18px/1.4 var(--k-round); letter-spacing: .02em; text-align: center; opacity: 0; transform: translateY(12px);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7), 0 0 0 1px rgba(23,24,75,.3); }
#klc-play .toast.show { opacity: 1; transform: none; }
#klc-play .toast.big { font-size: 30px; padding: 14px 30px 24px; border-radius: 22px; letter-spacing: .04em; }
#klc-play .toast.big::after { content: ""; position: absolute; left: 22px; right: 22px; bottom: 10px; height: 12px;
  background: ${BRUSH} center / 100% 100% no-repeat; }
/* Onomatopoeia: the heaviest face loaded (Noto Sans JP 900), 紺 letters, a 3 px white keyline, a 紺 outline, tilted −6°, popping 1.4 → 1 in 160 ms. */
#klc-play .toast.ono { isolation: isolate; background: none; box-shadow: none; padding: 0 10px; border-radius: 0;
  font: 900 clamp(48px, 7vw, 64px)/1.1 "Noto Sans JP", var(--k-round); letter-spacing: .02em; font-feature-settings: "palt";
  color: #223A70; -webkit-text-stroke: 6px #FBFAF5; paint-order: stroke fill; transform: rotate(-6deg) scale(1.4); }
#klc-play .toast.ono::before { content: attr(data-t); position: absolute; inset: 0 10px; z-index: -1; color: #223A70;
  -webkit-text-stroke: 12px #223A70; paint-order: stroke fill; text-shadow: 0 6px 0 #17184B; }
#klc-play .toast.ono.show { transform: rotate(-6deg) scale(1); transition: opacity 120ms linear, transform 160ms cubic-bezier(.2,.9,.3,1.3); }
/* The context button (「スタート」「つる」): the primary material, a ▶ mark, 56 px. */
#klc-play .prompt { position: absolute; left: 50%; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; height: 56px; padding: 0 28px 0 22px; border-radius: 999px; color: #223A70;
  font: 800 16px/1 var(--k-round); letter-spacing: .08em; white-space: nowrap;
  background: linear-gradient(180deg, #FFE38A 0%, #FFD24A 49%, #F8B500 51%, #EDA600 100%);
  box-shadow: 0 5px 14px rgba(23,24,75,.38), inset 0 0 0 3px #FFFFFF, 0 0 0 1px rgba(23,24,75,.4); }
#klc-play .prompt::before { content: ""; width: 11px; height: 13px; background: #223A70; clip-path: polygon(0 0, 100% 50%, 0 100%); flex: none; }
#klc-play .prompt.has-key::before { content: none; }
#klc-play .prompt kbd { position: static; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 7px; flex: none;
  font: 800 12px/24px var(--k-round); color: #223A70; background: #FBFAF5; text-align: center; letter-spacing: 0;
  box-shadow: inset 0 -2px 0 rgba(34,58,112,.22), 0 0 0 1.5px #223A70, 0 3px 6px rgba(23,24,75,.3); }
@media (pointer: coarse) { #klc-play .prompt kbd { display: none; } }
#klc-play .prompt:active { transform: translateX(-50%) scale(.94); }
/* 3 · 2 · 1 · GO!: 120 px numerals, 生成り over a 7 px 紺 outline and a 生成り keyline, a hard 鉄紺 drop;
   each beat scales 1.3 → 1 with a burst of speed lines behind it. GO! is 山吹. */
#klc-play .count { position: absolute; left: 50%; top: 42%; width: 0; height: 0; z-index: 4; pointer-events: none; }
#klc-play .count { --cd: clamp(120px, min(19vh, 34vw), 168px); }
#klc-play .count .cd-n, #klc-play .count .cd-n::before { display: block; font: 900 var(--cd)/1 var(--k-round); letter-spacing: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
#klc-play .count .cd-n { position: absolute; left: 0; top: 0; transform: translate(-50%, -54%); color: #FBFAF5; -webkit-text-stroke: 14px #223A70; paint-order: stroke fill; }
#klc-play .count .cd-n::before { content: attr(data-t); position: absolute; inset: 0; z-index: -1; color: #FBFAF5; -webkit-text-stroke: 22px #FBFAF5; paint-order: stroke fill;
  text-shadow: 0 8px 0 #17184B, 0 16px 30px rgba(23,24,75,.5); }
#klc-play .count.is-go .cd-n { color: #F8B500; }
#klc-play .count .cd-burst { position: absolute; left: calc(var(--cd) * -1.15); top: calc(var(--cd) * -1.2); width: calc(var(--cd) * 2.3); height: calc(var(--cd) * 2.3); opacity: 0; overflow: visible; }
#klc-play .count .cd-burst path { fill: #FBFAF5; }
#klc-play .count .cd-burst circle { fill: none; stroke: #F8B500; stroke-width: 6; }
#klc-play .count.is-go .cd-burst path { fill: #FFE38A; }
#klc-play .count.beat .cd-n { animation: klc-beat 220ms cubic-bezier(.2,.8,.2,1) both; }
#klc-play .count.beat .cd-burst { animation: klc-burst 460ms cubic-bezier(.1,.7,.3,1) both; }
@keyframes klc-beat { from { transform: translate(-50%, -54%) scale(1.3); opacity: .35; } 40% { opacity: 1; } to { transform: translate(-50%, -54%) scale(1); opacity: 1; } }
@keyframes klc-burst { from { transform: scale(.45); opacity: .95; } to { transform: scale(1.12); opacity: 0; } }
#klc-play .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#klc-play .flash.on { opacity: 0.15; transition: opacity 120ms linear; }
/* The run timer: 44 px tabular digits, 生成り with a 2.5 px 紺 outline and a hard drop. The split sits under it, a 浅葱 or 茜 chip. */
#klc-play .timer { position: absolute; left: 50%; top: calc(84px + env(safe-area-inset-top, 0px)); transform: translateX(-50%);
  font: 900 44px/1 var(--k-round); font-variant-numeric: tabular-nums; letter-spacing: .02em; color: #FBFAF5;
  -webkit-text-stroke: 5px #223A70; paint-order: stroke fill; text-shadow: 0 3px 0 #17184B; }
#klc-play .split { position: absolute; left: 50%; top: calc(138px + env(safe-area-inset-top, 0px)); transform: translateX(-50%);
  padding: 5px 12px; border-radius: 999px; font: 800 16px/1 var(--k-round); font-variant-numeric: tabular-nums; color: #FBFAF5;
  background: rgba(23,24,75,.7); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.45); }
#klc-play .split.fast { color: #FBFAF5; background: var(--k-fast); }
#klc-play .split.slow { color: #FBFAF5; background: var(--k-slow); }
/* The edge arrow: a 山吹 chevron on a 紺 disc with a white rim, pointing at what is off screen. */
#klc-play .arrow { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; display: grid; place-items: center;
  color: #F8B500; background: rgba(34,58,112,.92); box-shadow: 0 4px 10px rgba(23,24,75,.4), inset 0 0 0 2px rgba(255,255,255,.75); }
#klc-play .arrow svg { width: 24px; height: 24px; margin-left: 3px; }
#klc-play .card, #klc-play .sheet { pointer-events: auto; }
#klc-play :is(.sheet, .veil)[hidden] { display: none !important; }   /* author display:grid would otherwise beat [hidden] and cover the HUD */
#klc-play .veil { position: absolute; inset: 0; display: grid; place-items: end center; padding: 16px; grid-template-columns: minmax(0, 1fr);
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); background: rgba(23, 24, 75, 0.28); }
#klc-play .panel { width: min(420px, 100%); background: var(--k-paper); border-radius: 22px; padding: 22px 22px 16px;
  box-shadow: 0 18px 50px rgba(23, 24, 75, 0.28); transform: translateY(12px); opacity: 0;
  transition: transform var(--dur-sheet, 280ms) var(--ease-out, ease), opacity var(--dur-enter, 220ms) var(--ease-out, ease); }
#klc-play .veil.show .panel, #klc-play .sheet.show .panel { transform: none; opacity: 1; }
#klc-play .panel h2 { margin: 0 0 8px; font: 700 22px/1.3 var(--k-round); color: var(--k-navy); }
#klc-play .medal { width: 76px; height: 76px; margin: 4px auto 12px; border-radius: 50%; border: 3px solid var(--k-kon);
  display: grid; place-items: center; font: 900 36px/1 var(--k-round); color: var(--k-iron); transform: rotate(-6deg); }
#klc-play .medal.gold { background: var(--k-gold); }
#klc-play .medal.silver { background: var(--k-silver); }
#klc-play .medal.bronze { background: var(--k-bronze); }
@keyframes klc-stamp { from { transform: scale(1.6) rotate(-8deg); opacity: 0; } to { transform: scale(1) rotate(-6deg); opacity: 1; } }
#klc-play .medal.pop { animation: klc-stamp 180ms var(--ease-out, ease); }
#klc-play .time { margin: 0; text-align: center; font: 700 32px/1.2 var(--k-round); font-variant-numeric: tabular-nums; color: var(--k-navy); }
#klc-play .best { margin: 4px 0 0; text-align: center; font: 700 14px/1.4 var(--k-round); color: var(--k-fast); }
#klc-play .sub { margin: 2px 0 0; text-align: center; font-size: 13px; color: #55596f; font-variant-numeric: tabular-nums; }
#klc-play .extra { margin: 10px 0 0; text-align: center; font-size: 14px; line-height: 1.7; }
#klc-play .acts { display: flex; gap: 8px; margin-top: 16px; }
#klc-play .acts button { flex: 1; border-radius: 12px; font: 700 15px/1 var(--k-round); }
#klc-play .acts .pri { background: var(--accent-fill, #c4521f); color: #fff; }
#klc-play .acts .sec { background: rgba(34, 58, 112, 0.08); color: var(--k-navy); }
#klc-play .sheet { position: absolute; inset: 0; display: grid; place-items: end center; background: rgba(23, 24, 75, 0.34);
  padding: 12px; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  grid-template-columns: minmax(0, 1fr); }   /* [phone-sheet] the one column is the screen, not the panel's widest row: the 手帳's tabs made it 764 px on a 390 px phone */
#klc-play .sheet .panel { width: min(440px, 100%); min-width: 0; max-height: min(78vh, 680px); display: flex; flex-direction: column; padding: 16px 16px 12px;
  transform: none; opacity: 1; }
#klc-play .shead { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
#klc-play .shead h2 { flex: 1; margin: 0; font-size: 20px; }
#klc-play .tabs { display: flex; gap: 6px; margin: 12px 0 10px; flex-shrink: 0; align-items: center; overflow-x: auto; }
#klc-play .tabs button { height: 44px; min-height: 44px; flex: none; border-radius: 999px; padding: 0 16px; font: 700 14px/44px var(--k-round); color: var(--k-navy); white-space: nowrap; }
#klc-play .tabs button[aria-selected="true"] { background: var(--k-navy); color: #fff; }
#klc-play .body { overflow: auto; flex: 1; min-height: 120px; padding: 4px 2px 8px; }
#klc-play .foot { display: flex; justify-content: flex-end; flex-shrink: 0; padding-top: 8px; border-top: 1px solid rgba(45, 51, 80, 0.12); }
#klc-play .foot button { border-radius: 12px; padding: 0 14px; font: 700 13px/1 var(--k-round); color: var(--k-slow); }
#klc-play .ask { margin-top: 8px; padding: 12px; border-radius: 12px; background: rgba(183, 40, 46, 0.06); }
#klc-play .ask p { margin: 0 0 8px; font-size: 14px; }
@media (min-width: 721px) {
  #klc-play .veil, #klc-play .sheet { place-items: center; }
}
@media (max-width: 720px) {
  #klc-play .counters { top: calc(80px + env(safe-area-inset-top, 0px)); left: 12px; }
  #klc-play .prompt { bottom: auto; top: calc(188px + env(safe-area-inset-top, 0px)); min-width: 168px; }   /* [emil-ui] the context prompts' one place on a phone: the top-centre slot under the HUD's rows (the gull's .prompt.top, the board chip's, もぐる's: ui/ship.js). At 168 px it sat on the stick's top edge; above the thumbs, clear of the walker */
  #klc-play .timer { top: calc(132px + env(safe-area-inset-top, 0px)); font-size: 40px; }
  #klc-play .split { top: calc(180px + env(safe-area-inset-top, 0px)); }
  #klc-play .prompt.top { bottom: auto; top: calc(188px + env(safe-area-inset-top, 0px)); }   /* [integration] avatar's top prompt (the gull), under the kit's row (which ends near 172 px on a phone) */
  /* [integration] the HUD's ☰ menu wins: a kit prompt (the gull's 「ウミネコになる」 while flying) must not sit over its items */
}
@media (prefers-reduced-motion: reduce) {
  #klc-play .toast, #klc-play .panel, #klc-play .counter.bump b, #klc-play .medal.pop, #klc-play .count.beat .cd-n, #klc-play .toast.ono { animation: none; transition: none; }
  #klc-play .count .cd-burst { display: none; }
  #klc-play .toast.ono.show { transform: rotate(-6deg); }
}

body:has(#klc-ui[data-menu="1"]) #klc-play .prompt, body:has(#klc-ui[data-sheet="time"]) #klc-play .prompt, body:has(#klc-ui[data-sheet="places"]) #klc-play .prompt, body:has(#klc-ui[data-credits="1"]) #klc-play .prompt { visibility: hidden; pointer-events: none; }   /* [integration] the ☰ menu is open: kit prompts step back ([emil-ui] and while a HUD sheet or the credits are open) */
/* [mobile-play] the phone's first screen shows one thing: while the touch pad's first-run coach (左で移動・右で視点 / はじめる)
   is up, the kit's prompts (the gull's 「ウミネコになる」) and the ship's boarding chip step back; はじめる brings them back */
body:has(#klc-pad .coach:not([hidden])) #klc-play .prompt,
body:has(#klc-pad .coach:not([hidden])) #klc-board { visibility: hidden; pointer-events: none; }
` + HUB_CSS + EXTRA_CSS;

const queued = [];
let lang = 'ja';

function strings() { return STR[lang] || STR.ja; }
export function t(key, vars) {
  let s = strings()[key] ?? STR.ja[key] ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

function readLang(ctx) {
  try {
    const l = ctx?.services?.life?.hud?.i18n?.lang;
    if (l === 'en' || l === 'ja') return l;
  } catch (e) { /* */ }
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') return q;
    const s = localStorage.getItem('klc.lang');
    if (s === 'en' || s === 'ja') return s;
  } catch (e) { /* */ }
  return 'ja';
}

const MEDAL_KANJI = { gold: '金', silver: '銀', bronze: '銅' };

export function mountUi(ctx) {
  lang = readLang(ctx);
  const root = document.createElement('div');
  root.id = 'klc-play';
  root.lang = lang;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root.innerHTML = `
    <div class="topbar">
      <button type="button" class="play-btn" data-act="play" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 6.5v11l9-5.5-9-5.5z"/></svg><span></span><i class="dot" aria-hidden="true"></i></button>
      <button type="button" class="book" data-act="book">${BOOK}<span></span></button>
    </div>
    <div class="counters"></div>
    <div class="toasts" role="status" aria-live="polite"></div>
    <button type="button" class="prompt" hidden></button>
    <div class="count" hidden aria-live="assertive"><svg class="cd-burst" viewBox="-170 -170 340 340" aria-hidden="true">${BURST}</svg><span class="cd-n"></span></div>
    <div class="flash" hidden></div>
    <div class="timer" hidden></div>
    <div class="split" hidden></div>
    <div class="arrow" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M8.5 4.5 16 12l-7.5 7.5"/></svg></div>
    <div class="cluster" hidden></div>
    <div class="floathanko hanko" hidden></div>
    <div class="veil" hidden><div class="panel" role="dialog" aria-modal="true"></div></div>
    <div class="sheet" hidden>
      <div class="panel" role="dialog" aria-modal="true">
        <div class="shead"><h2></h2><button type="button" class="glass" data-act="close" style="border-radius:999px;padding:0 14px"></button></div>
        <div class="tabs" role="tablist"></div>
        <div class="body"></div>
        <div class="foot"><button type="button" data-act="replay"></button><button type="button" data-act="erase"></button></div>
        <div class="ask" hidden>
          <p></p>
          <div class="acts"><button type="button" class="pri" data-act="erase-yes"></button><button type="button" class="sec" data-act="erase-no"></button></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const book = root.querySelector('.book');
  const bookLabel = book.querySelector('span');
  const playBtn = root.querySelector('[data-act="play"]');
  const playLabel = playBtn.querySelector('span');
  const cluster = root.querySelector('.cluster');
  const floatHanko = root.querySelector('.floathanko');
  const replayBtn = root.querySelector('[data-act="replay"]');
  const counters = root.querySelector('.counters');
  const toasts = root.querySelector('.toasts');
  const promptEl = root.querySelector('.prompt');
  const countEl = root.querySelector('.count');
  const flashEl = root.querySelector('.flash');
  const timerEl = root.querySelector('.timer');
  const splitEl = root.querySelector('.split');
  const arrowEl = root.querySelector('.arrow');
  const veil = root.querySelector('.veil');
  const card = veil.querySelector('.panel');
  const sheet = root.querySelector('.sheet');
  const sheetTitle = sheet.querySelector('h2');
  const closeBtn = sheet.querySelector('[data-act="close"]');
  const tabsEl = sheet.querySelector('.tabs');
  const bodyEl = sheet.querySelector('.body');
  const eraseBtn = sheet.querySelector('[data-act="erase"]');
  const ask = sheet.querySelector('.ask');
  const askP = ask.querySelector('p');
  const eraseYes = sheet.querySelector('[data-act="erase-yes"]');
  const eraseNo = sheet.querySelector('[data-act="erase-no"]');

  const tabs = new Map();
  let activeTab = null;
  let sheetOpen = false;
  let askOpen = false;
  let overlay = false;
  let hubApi = null;
  let hidePrompt = () => {};
  let promptPri = 0;
  let promptGen = 0;
  let cardCleanup = () => {};
  let promptPad = false;
  const arrowPos = { x: 0, y: 0, z: 0 };
  let arrowFn = null;
  let arrowAcc = 0;

  function paintChrome() {
    root.lang = lang;
    bookLabel.textContent = t('play.kit.book');
    book.setAttribute('aria-label', t('play.kit.book.open'));
    playLabel.textContent = t('play.kit.play');
    playBtn.setAttribute('aria-label', t('play.kit.play.open'));
    replayBtn.textContent = t('play.kit.coach.again');
    sheetTitle.textContent = t('play.kit.notebook');
    closeBtn.textContent = t('play.kit.close');
    eraseBtn.textContent = t('play.kit.erase');
    askP.textContent = t('play.kit.erase.ask');
    eraseYes.textContent = t('play.kit.erase.yes');
    eraseNo.textContent = t('play.kit.erase.no');
    tabsEl.replaceChildren();
    for (const [id, spec] of tabs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.textContent = tabLabel(spec);
      b.setAttribute('aria-selected', id === activeTab ? 'true' : 'false');
      b.addEventListener('click', () => openTab(id));
      tabsEl.appendChild(b);
    }
    if (sheetOpen && activeTab) renderTab(activeTab);
  }
  function tabLabel(spec) {
    const l = spec.label;
    if (l && typeof l === 'object') return l[lang] || l.ja || l.en || '';
    if (typeof l === 'string' && (STR.ja[l] || STR.en[l])) return t(l);
    return l || '';
  }
  function renderTab(id) {
    const spec = tabs.get(id);
    bodyEl.replaceChildren();
    if (!spec) { const p = document.createElement('p'); p.textContent = t('play.kit.empty'); bodyEl.appendChild(p); return; }
    try { spec.render(bodyEl); } catch (e) { console.error('[play] notebook', id, e); }
  }
  function openTab(id) {
    if (!tabs.has(id)) return;
    activeTab = id;
    for (const b of tabsEl.querySelectorAll('button')) b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false');
    renderTab(id);
  }
  let motionStill = false;
  try { motionStill = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* */ }
  if (motionStill) root.classList.add('still');
  function reduced() { return motionStill || root.classList.contains('still'); }
  function setOverlay(on) {
    overlay = on;
    try { ctx.pad?.suppress?.('play', on); } catch (e) { /* no pad */ }
  }
  function openSheet(id) {
    sheetOpen = true;
    askOpen = false;
    ask.hidden = true;
    sheet.hidden = false;
    setOverlay(true);
    if (!activeTab) activeTab = id || tabs.keys().next().value || null;
    if (id && tabs.has(id)) activeTab = id;
    paintChrome();
    // .panel starts at opacity 0; only .show reveals it (the veil cards already do this).
    requestAnimationFrame(() => { if (sheetOpen) sheet.classList.add('show'); });
    closeBtn.focus({ preventScroll: true });
  }
  function closeSheet() {
    sheetOpen = false;
    askOpen = false;
    sheet.classList.remove('show');
    sheet.hidden = true;
    ask.hidden = true;
    if (veil.hidden && !root.classList.contains('hub-open')) setOverlay(false);
    book.focus();
  }

  book.addEventListener('click', () => { sfx.play('tap'); openSheet(); });
  closeBtn.addEventListener('click', closeSheet);
  eraseBtn.addEventListener('click', () => { askOpen = true; ask.hidden = false; eraseNo.focus(); });
  eraseNo.addEventListener('click', () => { askOpen = false; ask.hidden = true; eraseBtn.focus(); });
  replayBtn.addEventListener('click', () => {
    clearCoachSeen(store);
    sfx.play('tap');
    ui.toast(t('play.kit.coach.reset'));
  });
  eraseYes.addEventListener('click', () => {
    store.reset();
    askOpen = false;
    ask.hidden = true;
    sfx.play('tap');
    if (activeTab) renderTab(activeTab);
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !hubApi || !hubApi.isOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hubApi.cancelTitle();
    hubApi.hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || (hubApi && hubApi.isOpen())) return;
    if (askOpen) { askOpen = false; ask.hidden = true; return; }
    if (sheetOpen) { closeSheet(); return; }
    if (!veil.hidden) cardCleanup();
  });

  function movementButtons(opt) {
    const p = ctx.playerObj;
    const drive = ctx.services?.explore?.drive;
    if (drive?.active) return [
      { id: 'brake', label: 'touch.btn.brake', icon: 'brake', hold: true },
      { id: 'nitro', label: 'touch.btn.nitro', icon: 'nitro', hold: true },
      { id: 'getout', label: 'touch.btn.getout', icon: 'getout', onDown: () => drive.exit?.() },
    ];
    if (p?.fly) return [
      { id: 'up', label: 'touch.btn.up', icon: 'up', hold: true },
      { id: 'down', label: 'touch.btn.down', icon: 'down', hold: true },
      { id: 'boost', label: 'touch.btn.boost', icon: 'boost', hold: true },
      { id: 'land', label: 'touch.btn.land', icon: 'walk', onDown: () => { p.fly = false; } },
    ];
    const byId = {
      jump: { id: 'jump', label: 'touch.btn.jump', icon: 'jump', onDown: () => p?.jump?.() },
      dash: { id: 'dash', label: 'touch.btn.dash', icon: 'dash', toggle: true },
      fly: { id: 'fly', label: 'touch.btn.fly', icon: 'fly', onDown: () => {
        if (p && typeof p.allowMode === 'function' && !p.allowMode('fly', { via: 'pad' })) return;
        if (p) { p.fly = true; p.vy = 0; p.onGround = false; }
      } },
    };
    return promptPadIds(opt).map((id) => byId[id]);
  }
  function syncPad(text, onPress, opt) {
    const pad = ctx.pad;
    if (!pad || typeof pad.registerMode !== 'function') return;
    const mode = pad.mode;
    if (mode && mode !== 'walk' && mode !== 'fly' && mode !== 'drive' && mode !== 'play-prompt') return;
    try {
      pad.registerMode('play-prompt', {
        stick: 'analog',
        buttons: [
          { id: 'play-go', label: { ja: text, en: text }, icon: FISH, onDown: () => onPress?.() },
          ...movementButtons(opt),
        ],
      });
      pad.setMode('play-prompt');
      promptPad = true;
    } catch (e) { console.error('[play] pad', e); }
  }
  function clearPad() {
    if (!promptPad) return;
    promptPad = false;
    try { if (ctx.pad?.mode === 'play-prompt') ctx.pad.setMode(null); } catch (e) { /* */ }
  }

  let tickN = 0;
  onPlayTick(() => {
    if ((tickN++ % 15) === 0) {
      const next = readLang(ctx);
      if (next !== lang) { lang = next; paintChrome(); if (hubApi) hubApi.paint(); }
      const mode = playMode();
      playBtn.hidden = !(mode === 'walk' || mode === 'fly' || mode === 'drive');
    }
    if (!arrowFn) return;
    arrowAcc += 1;
    if (arrowAcc < 6) return;
    arrowAcc = 0;
    let p = null;
    try { p = arrowFn(arrowPos) || arrowPos; } catch (e) { p = null; }
    if (!p || !ctx.camera) { arrowEl.hidden = true; return; }
    const v = arrowPos;
    v.x = p.x; v.y = p.y; v.z = p.z;
    const ndc = v.x != null ? project(v) : null;
    if (!ndc) { arrowEl.hidden = true; return; }
    const behind = ndc.z > 1;
    let sx = ndc.x, sy = -ndc.y;
    if (!behind && Math.abs(sx) < 0.9 && Math.abs(sy) < 0.82) { arrowEl.hidden = true; return; }
    if (behind) { sx = -sx; sy = -sy; }
    const len = Math.hypot(sx, sy) || 1;
    sx /= len; sy /= len;
    const w = window.innerWidth, h = window.innerHeight, m = 28;
    const px = w * 0.5 + sx * (w * 0.5 - m);
    const py = h * 0.5 + sy * (h * 0.5 - m);
    arrowEl.hidden = false;
    arrowEl.style.transform = 'translate(' + px.toFixed(0) + 'px,' + py.toFixed(0) + 'px) rotate(' + Math.atan2(sy, sx).toFixed(3) + 'rad)';
  });

  const _ndc = new THREE.Vector3();
  function project(p) {
    const cam = ctx.camera;
    if (!cam) return null;
    return _ndc.set(p.x, p.y, p.z).project(cam);
  }

  ui.counter = (id, o = {}) => {
    const el = document.createElement('div');
    el.className = 'counter glass';
    el.dataset.counter = id;
    const total = o.total | 0;
    el.innerHTML = (o.icon || FISH) + '<span class="nm"></span><b></b>';
    const nm = el.querySelector('.nm');
    const num = el.querySelector('b');
    nm.textContent = o.label || '';
    const set = (n) => {
      num.textContent = counterText(n, total);
      el.setAttribute('aria-label', (o.label || id) + ' ' + num.textContent);
    };
    set(0);
    counters.appendChild(el);
    return {
      set,
      bump() {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      },
    };
  };
  ui.toast = (text, o = {}) => {
    while (toasts.children.length >= 3) toasts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (o.ono ? ' ono' : o.big ? ' big' : '');
    el.textContent = text;
    if (o.ono) el.dataset.t = text;
    toasts.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (o.sting) sfx.play('fanfare');
    const life = o.ono ? 1200 : o.big ? 3200 : 2200;
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 320); }, life);
  };
  ui.prompt = (text, o = {}) => {
    const priority = Number.isFinite(+o.priority) ? +o.priority : 1;
    if (!promptEl.hidden && !promptReplaces(promptPri, priority)) return { hide() {}, shown: false };
    hidePrompt();
    const gen = ++promptGen;
    promptPri = priority;
    promptEl.hidden = false;
    promptEl.classList.toggle('has-key', !!o.keycap);
    promptEl.classList.toggle('top', !!o.top);
    promptEl.setAttribute('aria-label', text);
    if (o.keycap) {
      promptEl.textContent = '';
      const cap = document.createElement('kbd');
      cap.textContent = o.keycap;
      promptEl.appendChild(cap);
      promptEl.appendChild(document.createTextNode(text));
    } else promptEl.textContent = text;
    const press = () => { sfx.play('tap'); o.onPress?.(); };
    promptEl.onclick = press;
    const onKey = (e) => {
      if (gen !== promptGen || overlay || e.repeat) return;
      if (!promptKeyFires(e.code, promptOnFoot(ctx))) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (document.body && !document.body.classList.contains('playing') && !document.body.classList.contains('shot')) return;
      if (e.code === 'KeyE' && !promptOnFoot(ctx)) return;
      e.preventDefault();
      press();
    };
    document.addEventListener('keydown', onKey);
    if (o.pad !== false) syncPad(text, press, o);
    const handle = { shown: true, hide() { hide(); } };
    const hide = () => {
      if (gen !== promptGen) { handle.shown = false; return; }
      handle.shown = false;
      promptPri = 0;
      promptEl.hidden = true;
      promptEl.classList.remove('top', 'has-key');
      promptEl.onclick = null;
      promptEl.textContent = '';
      document.removeEventListener('keydown', onKey);
      clearPad();
      hidePrompt = () => {};
    };
    hidePrompt = hide;
    return handle;
  };
  ui.countdown = (o = {}) => new Promise((resolve) => {
    const beats = ['3', '2', '1', t('play.kit.go')];
    const at = [0, 0.72, 1.44, 2.16];
    let start = -1, i = -1, done = false;
    const num = countEl.querySelector('.cd-n');
    const beat = (k) => {
      num.textContent = beats[k];
      num.dataset.t = beats[k];
      countEl.classList.toggle('is-go', k === 3);
      countEl.classList.remove('beat');
      void countEl.offsetWidth;
      if (!reduced()) countEl.classList.add('beat');
    };
    countEl.hidden = false;
    const off = onPlayTick((dt, time) => {
      if (start < 0) {
        start = time; i = 0;
        beat(0);
        sfx.play('count');
        return;
      }
      const e = time - start;
      while (i < 3 && e >= at[i + 1]) {
        i++;
        beat(i);
        sfx.play(i === 3 ? 'go' : 'count');
        if (i === 3) {
          flashEl.hidden = false;
          flashEl.classList.add('on');
          setTimeout(() => { flashEl.classList.remove('on'); flashEl.hidden = true; }, 160);
          try { o.onGo?.(); } catch (err) { /* */ }
        }
      }
      if (i === 3 && e >= at[3] + 0.4 && !done) {
        done = true; off(); countEl.hidden = true; resolve();
      }
    });
  });
  ui.timer = () => {
    let running = false, origin = 0, lastMs = 0, shown = '', wait = true;
    const paint = (ms) => {
      const text = timerText(ms);
      if (text !== shown) { shown = text; timerEl.textContent = text; }
    };
    const off = onPlayTick((dt, time) => {
      if (!running) return;
      if (wait) { origin = time; wait = false; lastMs = 0; paint(0); return; }
      lastMs = (time - origin) * 1000;
      paint(lastMs);
    });
    return {
      start() { running = true; wait = true; shown = ''; lastMs = 0; timerEl.hidden = false; splitEl.hidden = true; timerEl.textContent = '0:00.00'; root.classList.add('timing'); },
      stop() { running = false; return lastMs; },
      splitAt(ms, bestMs) {
        const text = splitText(ms, bestMs);
        splitEl.hidden = !text;
        splitEl.textContent = text;
        splitEl.classList.toggle('fast', splitFaster(ms, bestMs));
        splitEl.classList.toggle('slow', !!text && !splitFaster(ms, bestMs) && text !== '0.0');
      },
      hide() { running = false; timerEl.hidden = true; splitEl.hidden = true; root.classList.remove('timing'); off(); },
    };
  };
  ui.edgeArrow = (getWorldPos) => {
    arrowFn = getWorldPos;
    arrowEl.hidden = false;
    return { hide() { if (arrowFn === getWorldPos) { arrowFn = null; arrowEl.hidden = true; } } };
  };
  ui.resultCard = (o = {}) => {
    cardCleanup();
    const medal = o.medal && MEDAL_KANJI[o.medal] ? o.medal : null;
    const aria = medal ? t('play.kit.medal.' + medal) : '';
    const mark = o.grade || (o.isBest ? t('play.kit.best') : '');
    const delta = (o.bestMs != null && o.timeMs != null && !o.isBest) ? splitText(o.timeMs, o.bestMs) : '';
    const slower = delta && !splitFaster(o.timeMs, o.bestMs);
    const n = [...mark].length;
    const stamp = mark ? `<div class="hanko ${n > 3 ? 'word' : n === 1 ? 'seal one' : 'seal'} in" aria-hidden="true">${esc(mark)}</div>` : '';
    card.innerHTML = `
      <h2 class="res-k">${esc(o.title || '')}</h2>
      ${medal ? `<div class="award"><i class="rays" aria-hidden="true"></i><i class="strap l" aria-hidden="true"></i><i class="strap r" aria-hidden="true"></i>
        <div class="medal ${medal} pop" role="img" aria-label="${esc(aria)}"><span class="kj">${MEDAL_KANJI[medal]}</span><i class="shine"></i></div>${stamp}</div>` : stamp}
      ${o.timeMs != null ? `<p class="time-l">${esc(t('play.kit.time'))}</p><p class="time">${reduced() ? esc(timerText(o.timeMs)) : '0:00.00'}</p>` : ''}
      ${delta ? `<p class="sub${slower ? ' slow' : ''}">${esc(delta)}</p>` : (o.bestMs != null && !o.isBest ? `<p class="sub">${esc(t('play.kit.bestTime'))} ${esc(timerText(o.bestMs))}</p>` : '')}
      ${o.extra ? `<p class="extra">${esc(o.extra)}</p>` : ''}
      <div class="acts"><button type="button" class="pri" data-act="retry"></button><button type="button" class="sec" data-act="quit"></button></div>`;
    card.querySelector('[data-act="retry"]').textContent = t('play.kit.retry');
    card.querySelector('[data-act="quit"]').textContent = o.quitLabel || t('play.kit.quit');
    veil.classList.add('results');
    root.classList.add('res-open');
    veil.hidden = false;
    requestAnimationFrame(() => veil.classList.add('show'));
    setOverlay(true);
    const timeEl = card.querySelector('.time');
    const finalMs = Number(o.timeMs) || 0;
    if (timeEl && !reduced() && finalMs > 0) {
      // The count-up starts as the medal lands (120 ms dim + 220 ms drop) and runs 500 ms.
      const t0 = performance.now() + 340;
      const climb = (now) => {
        if (veil.hidden) return;
        if (now < t0) { requestAnimationFrame(climb); return; }
        const u = Math.min(1, (now - t0) / 500);
        timeEl.textContent = timerText(finalMs * (1 - Math.pow(1 - u, 3)));
        if (u < 1) requestAnimationFrame(climb);
      };
      requestAnimationFrame(climb);
    }
    if (medal) sfx.play('fanfare');
    if (mark) setTimeout(() => { if (!veil.hidden) sfx.play('stamp'); }, reduced() ? 0 : 900);
    const retry = card.querySelector('[data-act="retry"]');
    const quit = card.querySelector('[data-act="quit"]');
    const close = (which) => {
      root.classList.remove('res-open');
      veil.classList.remove('show', 'results');
      veil.hidden = true;
      if (!sheetOpen && !root.classList.contains('hub-open')) setOverlay(false);
      document.removeEventListener('keydown', onKey);
      cardCleanup = () => {};
      if (which === 'retry') o.onRetry?.();
      else o.onQuit?.();
    };
    const onKey = (e) => {
      if (e.repeat) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Enter') { e.preventDefault(); close('retry'); }
    };
    retry.addEventListener('click', () => close('retry'));
    quit.addEventListener('click', () => close('quit'));
    document.addEventListener('keydown', onKey);
    cardCleanup = () => close('quit');
    retry.focus({ preventScroll: true });
  };
  ui.card = (o = {}) => {
    cardCleanup();
    veil.classList.remove('results');
    card.innerHTML = `<h2>${esc(o.title || '')}</h2><div class="extra"></div><div class="acts"></div>`;
    card.querySelector('.extra').innerHTML = o.html || '';
    const acts = card.querySelector('.acts');
    for (const a of o.actions || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'pri' : 'sec';
      b.textContent = a.label || '';
      b.addEventListener('click', () => { veil.hidden = true; veil.classList.remove('show'); if (!sheetOpen) setOverlay(false); a.onPress?.(); });
      acts.appendChild(b);
    }
    if (!acts.children.length) acts.remove();
    veil.hidden = false;
    requestAnimationFrame(() => veil.classList.add('show'));
    setOverlay(true);
    cardCleanup = () => { veil.hidden = true; veil.classList.remove('show', 'results'); if (!sheetOpen && !root.classList.contains('hub-open')) setOverlay(false); };
  };
  // One icon set: 24 grid, 2 px round strokes (PLAY-UI-STYLE: bait = small fish, spray = water arcs,
  // ice = crystal, pole = rod, back = arrow, book = 手帳).
  const ico = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="' + d + '"/></svg>';
  const ICONS = {
    fish: FISH,
    bait: ico('M3.5 12c2.6-3.3 6.2-4.6 10-3.6 1.8.5 3.3 1.6 4.5 3.6-1.2 2-2.7 3.1-4.5 3.6-3.8 1-7.4-.3-10-3.6zM18 12l2.8-2.6v5.2zM8.6 11.2v.1'),
    pole: ico('M4.5 20.5 18.5 4M18.5 4v9.6M18.5 13.6a2.2 2.2 0 1 1-2.2 2.2'),
    spray: ico('M6 19c0-4.5 2.6-8 6-8s6 3.5 6 8M4 9.5c2.4-2.6 5-3.9 8-3.9s5.6 1.3 8 3.9M12 3v2.6'),
    ice: ico('M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.6 12 6.4l2.5-1.8M9.5 19.4 12 17.6l2.5 1.8'),
    back: ico('M10 6 4 12l6 6M4.5 12H20'),
    book: ico('M4 5.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 5.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z'),
    go: ico('M8 5.5v13l10-6.5z'),
  };
  const KEYCAP = { Space: 'Space', Escape: 'Esc', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift' };
  // The thumb arc on a phone: [angle from the primary's centre in degrees (180 = left, 90 = up), radius px].
  // Three on the inner arc, two on the outer; all stay in the right half, clear of the left stick.
  const ARC = [[180, 112], [135, 112], [90, 116], [128, 198], [101, 204]];
  const arcMQ = (() => { try { return matchMedia('(max-width: 720px)'); } catch (e) { return null; } })();
  function layoutCluster() {
    const arc = !!(arcMQ && arcMQ.matches);
    cluster.classList.toggle('arc', arc);
    let k = 0;
    for (const b of cluster.querySelectorAll('.act')) {
      if (!arc) { b.style.left = ''; b.style.top = ''; continue; }
      const half = b.classList.contains('pri') ? 36 : 28;
      let dx = 0, dy = 0;
      if (!b.classList.contains('pri')) {
        const slot = ARC[Math.min(k++, ARC.length - 1)];
        const a = slot[0] * Math.PI / 180;
        dx = Math.cos(a) * slot[1];
        dy = -Math.sin(a) * slot[1];
      }
      b.style.left = (dx - half).toFixed(1) + 'px';
      b.style.top = (dy - half).toFixed(1) + 'px';
    }
  }
  try { arcMQ?.addEventListener?.('change', layoutCluster); } catch (e) { /* old engines */ }

  // The kit lays itself out against the live HUD (#klc-ui, explore's #klc-x, the touch pad, the ship): the あそぶ row and
  // the chips go under any HUD panel in their column, and the action cluster rises above anything under it. Shot mode never
  // mounts the HUD, so this only moves things in the real app.
  const topbar = root.querySelector('.topbar');
  const TOP_OBS = ['#klc-ui .brand', '#klc-ui .tools', '#klc-ui .mbtn', '#klc-x .xbar', '#klc-x .mini', '#klc-ui-restore', '#klc-ship .top', '#klc-pad .topbar .chip', '#klc-pad .gear'];
  const LOW_OBS = ['#klc-x .mini', '#klc-pad .cluster .btn', '#klc-ui .dock', '#klc-ui .pbar', '#klc-ui .attr', '#klc-ui .places', '#klc-x .xdrive', '#klc-ship .panel'];
  const natural = { top: NaN, chips: NaN };
  function shown(e) {
    if (!e || root.contains(e)) return null;
    const q = e.getBoundingClientRect();
    if (!(q.width > 1 && q.height > 1)) return null;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return null;
    return q;
  }
  function lowestAbove(sels, l, r, limit) {
    let y = 0;
    for (const sel of sels) for (const e of document.querySelectorAll(sel)) {
      const q = shown(e);
      if (q && q.right > l + 0.5 && q.left < r - 0.5 && q.top < limit && q.bottom > y) y = q.bottom;
    }
    return y;
  }
  function highestBelow(sels, l, r, limit) {
    let y = Infinity;
    for (const sel of sels) for (const e of document.querySelectorAll(sel)) {
      const q = shown(e);
      if (q && q.right > l + 0.5 && q.left < r - 0.5 && q.bottom > limit && q.top < y) y = q.top;
    }
    return y;
  }
  function readNatural() {
    topbar.style.top = '';
    counters.style.top = '';
    counters.style.left = '';
    // a page without a style engine (the tests' small DOM, where the 600 ms layout timer can fire after the test) keeps the defaults
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle : null;
    natural.top = (cs && parseFloat(cs(topbar).top)) || 10;
    natural.chips = (cs && parseFloat(cs(counters).top)) || 108;
  }
  function liftCluster() {
    if (cluster.hidden || !cluster.children.length) return;
    const was = parseFloat(cluster.style.getPropertyValue('--lift')) || 0;
    let l = Infinity, r = -Infinity, low = 0;
    for (const e of cluster.querySelectorAll('.act, .lb')) {
      const q = e.getBoundingClientRect();
      if (!q.width) continue;
      l = Math.min(l, q.left); r = Math.max(r, q.right); low = Math.max(low, q.bottom + was);
    }
    if (!(r > l)) return;
    const top = highestBelow(LOW_OBS, l, r, (window.innerHeight || 852) * 0.5);
    const lift = top < Infinity ? Math.max(0, Math.ceil(low - top + 10)) : 0;
    if (lift !== was) cluster.style.setProperty('--lift', lift + 'px');
  }
  function layoutChrome(fresh) {
    if (typeof topbar.getBoundingClientRect !== 'function') return;   // no layout engine (the tests' small DOM, after its test ended)
    if (fresh || !Number.isFinite(natural.top)) readNatural();
    const H = window.innerHeight || 852;
    const t = topbar.getBoundingClientRect();
    let barBottom = 0;
    if (t.width) {
      const below = lowestAbove(TOP_OBS, t.left, t.right, H * 0.45);
      const top = Math.round(Math.max(natural.top, below ? below + 8 : 0));
      if (Math.abs(top - (parseFloat(topbar.style.top) || natural.top)) > 0.5) topbar.style.top = top === Math.round(natural.top) ? '' : top + 'px';
      barBottom = top + t.height;
    }
    const c = counters.getBoundingClientRect();
    const padded = !!(document.body && document.body.classList.contains('klc-pad'));
    if (c.width && padded && barBottom) {
      // Beside the row when the chips fit before whatever HUD panel is to the right (the minimap); else under it.
      const left = Math.round(t.right + 8);
      const room = lowestAbove(TOP_OBS, left, left + c.width, barBottom) > barBottom - t.height ? 0 : 1;
      const W = window.innerWidth || 393;
      if (room && left + c.width <= W - 8) {
        counters.style.left = left + 'px';
        counters.style.top = Math.round(barBottom - t.height + (t.height - 40) / 2) + 'px';
      } else {
        counters.style.left = '';
        counters.style.top = Math.round(barBottom + 10) + 'px';
      }
    } else if (c.width) {
      counters.style.left = '';
      let below = lowestAbove(TOP_OBS, c.left, c.right, H * 0.45);
      if (barBottom && t.left < c.right && t.right > c.left) below = Math.max(below, barBottom);
      const top = Math.round(Math.max(natural.chips, below ? below + 10 : 0));
      if (Math.abs(top - (parseFloat(counters.style.top) || natural.chips)) > 0.5) counters.style.top = top === Math.round(natural.chips) ? '' : top + 'px';
    }
    liftCluster();
  }
  try {
    window.addEventListener('resize', () => requestAnimationFrame(() => layoutChrome(true)));
    setTimeout(() => layoutChrome(true), 600);
  } catch (e) { /* not a browser */ }
  let layoutAcc = 0;
  onPlayTick((dt) => {
    layoutAcc += dt > 0 ? dt : 0;
    if (layoutAcc < 0.5) return;
    layoutAcc = 0;
    if (document.body && document.body.classList.contains('playing')) layoutChrome(false);
  });

  // While the kit's actions are up, a phone's pad keeps its stick and drops its own buttons, so the two clusters never stack.
  // Only over the pad's own modes (walk, fly, drive): a lane that set its own pad mode keeps it.
  let actionsPad = false;
  function padForActions(on) {
    const pad = ctx.pad;
    if (!pad || typeof pad.registerMode !== 'function') return;
    try {
      if (on) {
        const mode = pad.mode;
        if (mode && mode !== 'walk' && mode !== 'fly' && mode !== 'drive' && mode !== 'play-actions') return;
        pad.registerMode('play-actions', { stick: 'analog', buttons: [] });
        pad.setMode('play-actions');
        actionsPad = true;
      } else if (actionsPad) {
        actionsPad = false;
        if (pad.mode === 'play-actions') pad.setMode(null);
      }
    } catch (e) { console.error('[play] pad', e); }
  }
  let actionSpec = [];
  let actionCool = new Map();
  ui.actions = (list) => {
    actionSpec = Array.isArray(list) ? list.slice(0, 5) : [];
    actionCool = new Map();
    for (const b of cluster.children) b._off?.();
    cluster.replaceChildren();
    if (!actionSpec.length) { cluster.hidden = true; cluster.style.removeProperty('--lift'); padForActions(false); return { set() {}, clear() { ui.actions([]); } }; }
    cluster.hidden = false;
    padForActions(true);
    // The primary goes first in the DOM, so it sits nearest the corner (row-reverse) and is the arc's centre.
    const order = actionSpec.map((a, i) => [a, i]).sort((x, y) => (y[0].primary ? 1 : 0) - (x[0].primary ? 1 : 0));
    order.forEach(([a, i]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act' + (a.primary ? ' pri' : '');
      b.dataset.id = a.id || String(i);
      b.dataset.i = String(i);
      const raw = a.key ? String(a.key) : '';
      const hint = KEYCAP[raw] || raw.replace(/^Key/, '').replace(/^Digit/, '');
      b.innerHTML = (ICONS[a.icon] || ICONS.fish) + `<span class="lb"></span>` + (hint ? `<kbd>${esc(hint)}</kbd>` : '') +
        `<svg class="cd" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="16.4" pathLength="100" hidden/><circle cx="18" cy="18" r="16.4" pathLength="100"/></svg>`;
      b.querySelector('.lb').textContent = a.label || '';
      b.setAttribute('aria-label', (a.label || a.id || '') + (hint ? ' (' + hint + ')' : ''));
      const fire = () => {
        if (b.disabled) return;
        sfx.play('tap');
        if (a.cooldownMs > 0) actionCool.set(b.dataset.id, a.cooldownMs);
        try { a.onPress?.(); } catch (e) { /* */ }
      };
      b.addEventListener('click', fire);
      if (a.key) {
        const onKey = (e) => {
          if (e.repeat || cluster.hidden) return;
          const hit = e.code === a.key || (String(a.key).length === 1 && e.key && e.key.toLowerCase() === String(a.key).toLowerCase());
          if (!hit) return;
          const tag = e.target && e.target.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          fire();
        };
        document.addEventListener('keydown', onKey);
        b._off = () => document.removeEventListener('keydown', onKey);
      }
      cluster.appendChild(b);
    });
    layoutCluster();
    requestAnimationFrame(() => requestAnimationFrame(() => liftCluster()));
    return {
      set(id, patch) {
        const b = cluster.querySelector(`[data-id="${id}"]`);
        if (!b || !patch) return;
        if (patch.label != null) b.querySelector('.lb').textContent = patch.label;
        if (patch.disabled != null) b.disabled = !!patch.disabled;
      },
      clear() { ui.actions([]); },
    };
  };
  onPlayTick((dt) => {
    if (cluster.hidden || !actionCool.size) return;
    for (const b of cluster.querySelectorAll('.act')) {
      const id = b.dataset.id;
      if (!actionCool.has(id)) continue;
      const spec = actionSpec.find((a, i) => (a.id || String(i)) === id);
      const total = spec && spec.cooldownMs > 0 ? spec.cooldownMs : 1;
      let left = actionCool.get(id) - dt * 1000;
      if (left <= 0) { actionCool.delete(id); left = 0; b.disabled = false; b.classList.remove('cool'); }
      else { actionCool.set(id, left); b.disabled = true; b.classList.add('cool'); }
      const track = b.querySelector('.cd .track');
      if (track) track.hidden = left <= 0;
      const ring = b.querySelector('.cd circle:not(.track)');
      if (ring) ring.style.strokeDashoffset = String(100 * (1 - left / total));
    }
  });
  let stampTimer = 0;
  ui.stamp = (text) => {
    floatHanko.textContent = text || t('play.kit.stamp');
    const n = [...(text || t('play.kit.stamp'))].length;
    floatHanko.className = 'floathanko hanko ' + (n > 3 ? 'word' : n === 1 ? 'seal one' : 'seal');
    floatHanko.hidden = false;
    floatHanko.classList.remove('in');
    void floatHanko.offsetWidth;
    floatHanko.classList.add('in');
    sfx.play('stamp');
    clearTimeout(stampTimer);
    stampTimer = setTimeout(() => { floatHanko.hidden = true; floatHanko.classList.remove('in'); }, reduced() ? 400 : 900);
  };
  ui.coach = mountCoach({ root, store, t, reduced });
  hubApi = mountHub({
    root, store, t, lang: () => lang, setOverlay, reduced,
    allow: (to, extra) => {
      const fn = ctx.playerObj?.allowMode;
      return typeof fn === 'function' ? fn(to, extra) : true;
    },
  });
  ui.run = (spec) => hubApi.run(spec);   // [mobile-play] a mode started from the world: the wipe and title card, its world built behind it
  ui.hubStart = () => hubApi.lastStart;
  playBtn.addEventListener('click', () => {
    if (!hubApi || playBtn.hidden) return;
    if (hubApi.isOpen()) hubApi.hide();
    else hubApi.show();
  });
  try {
    const live = window.__play || (window.__play = {});
    live.ui = ui;
    // The photo shortcut is on window, registered before the kit. It asks us first.
    live.eatKeyP = (e) => {
      if (!hubApi || e.repeat || e.metaKey || e.ctrlKey || e.altKey || playBtn.hidden) return false;
      // While walking, P takes the photo. あそぶ stays the pill, and P still opens it in the air or the car.
      if (readMode(ctx) === 'walk' || live.photoOwnsP) return false;
      e.preventDefault();
      if (hubApi.isOpen()) hubApi.hide();
      else hubApi.show();
      return true;
    };
  } catch (e) { /* */ }
  ui.notebook.register = (tabId, spec) => {
    if (!tabId || !spec || typeof spec.render !== 'function') return;
    tabs.set(tabId, spec);
    if (!activeTab) activeTab = tabId;
    if (sheetOpen) paintChrome();
  };
  ui.notebook.refresh = (tabId) => { if (sheetOpen && tabId === activeTab) renderTab(tabId); };
  ui.notebook.open = (tabId) => openSheet(tabId);
  ui.t = t;
  for (const [id, spec] of queued) ui.notebook.register(id, spec);
  queued.length = 0;
  paintChrome();
  return ui;
}

export const ui = {
  counter() { return { set() {}, bump() {} }; },
  toast() {},
  prompt() { return { hide() {} }; },
  countdown() { return Promise.resolve(); },
  timer() { return { start() {}, stop: () => 0, splitAt() {}, hide() {} }; },
  edgeArrow() { return { hide() {} }; },
  resultCard() {},
  card() {},
  actions() { return { set() {}, clear() {} }; },
  stamp() {},
  coach() { return { done() {}, hide() {} }; },
  /** [mobile-play] Before the hub is mounted (tests, ?play=0 paths): build, then start, with no card. */
  async run(spec) {
    try { await spec?.prepare?.(); } catch (e) { console.error('[play] prepare', spec?.id, e); }
    await spec?.start?.();
  },
  hubStart() { return null; },
  notebook: {
    register(id, spec) { queued.push([id, spec]); },
    refresh() {},
    open() {},
  },
  t,
};
