// [play:missions] The dialogue, the tracker, the quest log and the reward card.
// Paper, a role-coloured name plate, a typewriter and a ▼. The kit draws the notebook tab when it is here;
// until then a 手帳 button opens the same log.

import { DIALOGUE_DESK_PX, DIALOGUE_PHONE_PX } from './logic.js';

const CSS = `
#klc-m {
  position: fixed; inset: 0; z-index: 8; pointer-events: none; overflow: hidden;
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  color: #17184b; line-break: strict; word-break: normal; -webkit-font-smoothing: antialiased;
}
#klc-m button, #klc-m .m-sheet, #klc-m .m-card, #klc-m .m-log { pointer-events: auto; }
#klc-m h2 {
  font-family: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif;
  font-weight: 700; font-size: 15px; line-height: 1.3; margin: 16px 0 8px;
  font-feature-settings: "palt"; text-wrap: balance; word-break: auto-phrase;
}
#klc-m p, #klc-m .m-line, #klc-m .m-q-step { text-wrap: pretty; line-height: 1.75; }
#klc-m button { font: inherit; cursor: pointer; }
#klc-m button:focus-visible { outline: 2px solid #c4521f; outline-offset: 2px; }
#klc-m .m-track {
  position: absolute; pointer-events: auto; text-align: left;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  top: calc(76px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left));
  max-width: min(400px, calc(100% - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  min-height: 72px; padding: 8px;
  background: rgba(251, 250, 245, 0.94); color: #17184b;
  border: 2px solid #223A70; border-radius: 12px;
  box-shadow: 0 4px 16px rgba(23, 24, 75, 0.16);
}
#klc-m .m-track-open {
  flex: 1 1 160px; min-width: 0; min-height: 44px; padding: 4px 8px;
  display: flex; align-items: center; gap: 12px;
  background: transparent; border: 0; color: inherit; text-align: left;
}
#klc-m .m-track-copy { display: flex; flex-direction: column; min-width: 0; }
#klc-m .m-track-nav {
  width: 44px; height: 44px; flex: none; padding: 0; border-radius: 999px;
  border: 2px solid #223A70; background: #FBFAF5; color: #223A70;
  font: 700 18px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif;
}
#klc-m .m-track-go {
  flex: 1 0 100%; min-height: 44px; padding: 8px 16px; border: 0; border-radius: 999px;
  background: #F8B500; color: #17184b;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 16px;
  box-shadow: inset 0 0 0 2px #fff, 0 0 0 1px #223A70;
}
#klc-m .m-track-go:active, #klc-m .m-track-nav:active { transform: scale(0.94); }
#klc-m .m-track-arrow {
  width: 28px; height: 28px; flex: none; display: block;
}
#klc-m .m-track-arrow[hidden] { display: none !important; }
#klc-m .m-track-title {
  display: block; font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700;
  font-size: 17px; line-height: 1.3; font-feature-settings: "palt"; text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-track-step, #klc-m .m-track-dist {
  display: block; font-size: 15px; line-height: 1.5; color: #223A70;
  font-variant-numeric: tabular-nums;
}
@keyframes m-flash {
  0% { background: #F8B500; }
  100% { background: rgba(251, 250, 245, 0.94); }
}
#klc-m:not(.m-reduce) .m-track.m-flash { animation: m-flash 480ms ease-out; }
#klc-m .m-track.m-lit { background: #F8B500; }
#klc-m .m-book {
  position: absolute; pointer-events: auto;
  top: calc(136px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left));
  min-width: 44px; min-height: 44px; padding: 8px 16px; border: 0; border-radius: 22px;
  background: #fbfaf5; color: #17184b;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 15px;
  box-shadow: 0 4px 16px rgba(23, 24, 75, 0.16);
}
#klc-m .m-prompt {
  position: absolute; pointer-events: auto; left: 50%; transform: translateX(-50%);
  bottom: calc(28px + env(safe-area-inset-bottom));
  min-width: 88px; min-height: 44px; padding: 8px 20px; border: 0; border-radius: 22px;
  background: #fbfaf5; color: #17184b;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 16px;
  box-shadow: 0 4px 16px rgba(23, 24, 75, 0.2);
}
#klc-m .m-balloon {
  position: absolute; margin: 0; pointer-events: none; text-align: center;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700;
  line-height: 1; transform: translate(-50%, -100%);
  animation: m-bob 1.8s ease-in-out infinite;
}
/* 「…」 stays a small glyph. The quest marks are balloons, below. */
#klc-m .m-soft {
  font-size: 22px; color: #F8B500;
  -webkit-text-stroke: 2px #223A70; paint-order: stroke fill;
}
#klc-m .m-soft b { font-weight: 700; -webkit-text-stroke: inherit; }
/* 山吹 balloon, 紺 outline, white 「！」. The stroke keeps the glyph readable on yellow. */
#klc-m .m-bang {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  border-radius: 50%; background: #F8B500; border: 3px solid #223A70; color: #fff;
  box-shadow: 0 6px 14px rgba(23, 24, 75, 0.28);
}
#klc-m .m-bang b {
  position: relative; z-index: 1; color: #fff; font-weight: 700;
  -webkit-text-stroke: 0.08em #223A70; paint-order: stroke fill;
}
#klc-m .m-bang::before, #klc-m .m-bang::after {
  content: ""; position: absolute; left: 50%; bottom: -7px; margin-left: -7px;
  border-style: solid; border-width: 8px 7px 0 7px;
}
#klc-m .m-bang::before { border-color: #223A70 transparent transparent transparent; }
#klc-m .m-bang::after {
  bottom: -4px; margin-left: -5px; border-width: 6px 5px 0 5px;
  border-color: #F8B500 transparent transparent transparent; z-index: 1;
}
#klc-m .m-ring {
  position: absolute; box-sizing: border-box; pointer-events: none; border-radius: 50%;
  border: 2px solid rgba(248, 181, 0, 0.72);
  background: radial-gradient(ellipse at center, rgba(251, 250, 245, 0.42) 0%, rgba(248, 181, 0, 0.16) 46%, transparent 72%);
  box-shadow: 0 0 12px rgba(251, 250, 245, 0.45);
  transform: translate(-50%, -50%);
}
#klc-m .m-edge { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; pointer-events: none; }
#klc-m .m-edge b {
  display: block; width: 0; height: 0; margin: 12px auto 0;
  border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 14px solid #fbfaf5;
  filter: drop-shadow(0 1px 1px rgba(23, 24, 75, 0.45));
}
#klc-m .m-dim { position: absolute; inset: 0; background: rgba(23, 24, 75, 0.28); pointer-events: auto; }
#klc-m .m-sheet {
  position: absolute;
  left: env(safe-area-inset-left, 0px);
  right: env(safe-area-inset-right, 0px);
  bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  width: auto; max-width: none; margin: 0;
  padding: 16px 20px 12px;
  color: #FBFAF5;
  background: rgba(23, 24, 75, 0.9);
  border: 3px solid #223A70;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px #FBFAF5, 0 12px 32px rgba(23, 24, 75, 0.35);
}
#klc-m .m-name {
  position: absolute; top: 0; left: 16px; max-width: min(280px, 70%);
  transform: translateY(calc(-100% + 3px));
  padding: 4px 14px 4px; border: 3px solid #223A70; border-bottom: 0; border-radius: 8px 8px 0 0;
  box-shadow: inset 0 0 0 1px #FBFAF5;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 15px; line-height: 1.3;
  font-feature-settings: "palt";
}
#klc-m .m-line {
  margin: 0;
  font-family: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif;
  font-weight: 700; font-size: ${DIALOGUE_PHONE_PX}px; line-height: 1.7;
  min-height: calc(1.7em * 3); color: #FBFAF5;
}
#klc-m .m-caret { display: inline-block; margin-left: 4px; color: #F8B500; animation: m-caret 0.7s steps(1) infinite; }
#klc-m .m-choices { display: flex; flex-direction: column; gap: 0; margin-top: 8px; }
#klc-m .m-choices button {
  display: flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 4px 8px; border: 0; border-radius: 8px;
  background: transparent; color: #FBFAF5; text-align: left;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: ${DIALOGUE_PHONE_PX}px; line-height: 1.4;
}
#klc-m .m-cur { width: 1.2em; flex: none; color: #F8B500; visibility: hidden; }
#klc-m .m-choice.m-on .m-cur { visibility: visible; }
#klc-m .m-choice.m-on { background: rgba(251, 250, 245, 0.08); }
#klc-m .m-log, #klc-m .m-card {
  position: absolute; left: 0; right: 0; width: calc(100% - 24px); max-width: 480px;
  margin: 0 auto; background: #fbfaf5; border-radius: 16px; overflow: hidden;
  box-shadow: 0 16px 48px rgba(23, 24, 75, 0.28); display: flex; flex-direction: column;
}
#klc-m .m-log {
  top: calc(24px + env(safe-area-inset-top));
  bottom: calc(24px + env(safe-area-inset-bottom));
}
#klc-m .m-stamps.m-log {
  bottom: auto;
  height: auto;
  max-height: calc(100% - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}
#klc-m .m-card {
  top: calc(72px + env(safe-area-inset-top));
  max-height: calc(100% - 120px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}
#klc-m :is(.m-log, .m-card, .m-stamps, .m-sheet, .m-track, .m-book, .m-prompt, .m-edge, .m-dim, .m-balloon, .m-ring, .m-coach, .m-hub)[hidden] {
  display: none !important;
}
#klc-m .m-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 8px 0 20px; }
#klc-m .m-bar h2 { margin: 0; font-size: 20px; }
#klc-m .m-x {
  min-width: 44px; min-height: 44px; border: 0; background: transparent; color: #17184b;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 15px;
}
#klc-m .m-scroll { overflow: auto; padding: 4px 20px 20px; }
#klc-m .m-q {
  display: flex; flex-direction: column; gap: 4px; width: 100%; min-height: 44px; text-align: left;
  background: transparent; border: 0; border-bottom: 1px solid rgba(23, 24, 75, 0.1); padding: 8px 0;
}
#klc-m .m-q-title {
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 16px; line-height: 1.3;
  text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-q-step { font-size: 13px; line-height: 1.6; color: #223a70; }
#klc-m .m-empty { margin: 12px 0; font-size: 15px; }
#klc-m .m-seal {
  width: 72px; height: 72px; margin: 4px auto 12px; border-radius: 36px; border: 3px solid #223a70;
  display: flex; align-items: center; justify-content: center;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 28px; line-height: 1;
}
#klc-m .m-card-title {
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 22px; line-height: 1.3;
  text-align: center; margin: 0 0 8px; font-feature-settings: "palt"; text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-fact { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(23, 24, 75, 0.12); font-size: 15px; }
#klc-m .m-from { margin-top: 8px; font-size: 13px; color: #223a70; }
#klc-m .m-recruit { margin-top: 16px; padding: 16px; border: 1px dashed #223a70; border-radius: 12px; }
#klc-m .m-recruit-title {
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 18px; line-height: 1.3;
  text-align: center; margin: 0; text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-shop { font-weight: 700; font-size: 16px; margin: 0 0 8px; }
#klc-m .m-code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-weight: 700;
  letter-spacing: 0.08em; font-size: 18px; margin: 8px 0;
}
#klc-m .m-show { margin-top: 12px; font-weight: 700; text-align: center; }
#klc-m .m-live {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
@keyframes m-caret { 50% { opacity: 0.15; } }
@keyframes m-bob {
  0%, 100% { transform: translate(-50%, -100%); }
  50% { transform: translate(-50%, calc(-100% - var(--bob, 8px))); }
}
@keyframes m-seal { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes m-hanko {
  0% { transform: scale(1.7) rotate(-14deg); opacity: 0; }
  55% { transform: scale(0.94) rotate(-4deg); opacity: 1; }
  100% { transform: scale(1) rotate(-6deg); opacity: 1; }
}
#klc-m:not(.m-reduce) .m-seal { animation: m-seal 180ms ease-out both; }
#klc-m.m-reduce .m-caret, #klc-m.m-reduce .m-balloon, #klc-m.m-reduce .m-seal, #klc-m.m-reduce .m-hanko-in { animation: none; }
#klc-m .m-coach {
  position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto;
  bottom: calc(128px + env(safe-area-inset-bottom, 0px));
  max-width: min(340px, calc(100% - 32px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  padding: 12px 16px; border-radius: 16px;
  background: rgba(251, 250, 245, 0.96); color: #17184B;
  border: 2px solid #223A70;
  box-shadow: 0 8px 24px rgba(23, 24, 75, 0.28);
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700;
  font-size: 16px; line-height: 1.6; text-wrap: pretty;
}
#klc-m .m-hub {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(400px, calc(100% - 32px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  max-height: calc(100% - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  overflow: auto; pointer-events: auto;
  background: #FBFAF5; color: #17184B; border-radius: 16px;
  box-shadow: 0 16px 48px rgba(23, 24, 75, 0.35);
}
#klc-m .m-dim.m-hub-on { background: rgba(23, 24, 75, 0.55); }
#klc-m .m-hub-still {
  position: relative; width: 100%; aspect-ratio: 16 / 10; background: #223A70; overflow: hidden;
  border-radius: 16px 16px 0 0;
}
#klc-m .m-hub-still img { width: 100%; height: 100%; object-fit: cover; display: block; }
#klc-m .m-hub-new {
  position: absolute; top: 12px; right: 12px; min-height: 28px; padding: 4px 10px;
  border-radius: 8px; background: #B7282E; color: #FBFAF5;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 0.04em;
}
#klc-m .m-hub-body { padding: 16px 16px 20px; }
#klc-m .m-hub-title {
  margin: 0 0 4px; font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif;
  font-weight: 700; font-size: 22px; line-height: 1.3; font-feature-settings: "palt";
  text-wrap: balance; word-break: auto-phrase;
}
#klc-m .m-hub-hook { margin: 0 0 12px; font-size: 15px; line-height: 1.6; color: #223A70; }
#klc-m .m-hub-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
#klc-m .m-chip {
  display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 18px;
  background: rgba(34, 58, 112, 0.88); color: #FBFAF5;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 13px;
  font-variant-numeric: tabular-nums;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55), 0 4px 12px rgba(23, 24, 75, 0.28);
}
#klc-m .m-hub-progress {
  margin: 0 0 16px; font-size: 14px; line-height: 1.5; font-weight: 700; color: #223A70;
  font-variant-numeric: tabular-nums;
}
#klc-m .m-hub-go {
  display: flex; align-items: center; justify-content: center; width: 100%; min-height: 56px;
  border: 3px solid #fff; border-radius: 16px; background: #F8B500; color: #223A70;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 16px;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.7), 0 4px 12px rgba(23, 24, 75, 0.35);
}
#klc-m .m-hub-go:active { transform: scale(0.94); }
@media (min-width: 721px) {
  #klc-m .m-sheet {
    left: 50%; right: auto; width: 60%;
    transform: translateX(-50%);
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
  #klc-m .m-line, #klc-m .m-choices button { font-size: ${DIALOGUE_DESK_PX}px; }
  #klc-m .m-track-title { font-size: 18px; }
  #klc-m .m-soft { font-size: 26px; }
  #klc-m .m-coach { font-size: 16px; }
}
@media (max-width: 720px) {
  #klc-m .m-track { top: calc(12px + env(safe-area-inset-top)); }
  #klc-m .m-book { top: calc(68px + env(safe-area-inset-top)); }
}
@media (pointer: coarse) {
  #klc-m .m-prompt { bottom: calc(108px + env(safe-area-inset-bottom)); }
  body.playing #klc-m .m-sheet { bottom: calc(108px + env(safe-area-inset-bottom, 0px)); }
  #klc-m .m-coach { bottom: calc(188px + env(safe-area-inset-bottom)); }
}
body.playing #klc-m.m-kit .m-track { top: calc(176px + env(safe-area-inset-top)); }
body.noui #klc-m, body:not(.playing):not(.shot) #klc-m { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  #klc-m .m-caret, #klc-m .m-balloon, #klc-m .m-seal, #klc-m .m-hanko-in, #klc-m .m-track, #klc-m .m-hub-go { animation: none; }
  #klc-m .m-hub-go:active { transform: none; }
}
`;

const STAMP_CSS = `
.m-stamp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 8px 0 4px; }
.m-stamp { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.m-hanko {
  width: 64px; height: 64px; border-radius: 32px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 26px; line-height: 1;
}
.m-hanko-wait {
  border: 2px dashed rgba(34, 58, 112, 0.35); color: rgba(34, 58, 112, 0.28); background: transparent;
}
.m-hanko-got {
  border: 3px solid #223A70; background: rgba(251, 250, 245, 0.96); transform: rotate(-6deg);
}
.m-hanko-in { animation: m-hanko 280ms ease-out both; }
.m-stamp-name {
  font-family: "Zen Maru Gothic", "Noto Sans JP", sans-serif; font-weight: 700; font-size: 12px; line-height: 1.3;
  text-align: center; color: #223A70; word-break: auto-phrase; text-wrap: balance; max-width: 100%;
}
.m-stamps-lead { margin: 4px 0 8px; font-size: 14px; line-height: 1.7; color: #17184b; }
@media (prefers-reduced-motion: reduce) { .m-hanko-in { animation: none; } }
`;

function el(doc, tag, cls) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  return n;
}

/**
 * @param {object} o doc, win, reduce, shot, onAdvance, onChoice, onOpenLog, onPick, onCardClose
 */
export function mountUi(o) {
  const doc = o.doc;
  const reduce = !!(o.reduce || o.shot);
  const root = el(doc, 'div');
  root.id = 'klc-m';
  if (o.lang) root.lang = o.lang;
  if (reduce) root.classList.add('m-reduce');
  if (o.kit) root.classList.add('m-kit');
  const style = el(doc, 'style');
  style.textContent = CSS;
  root.appendChild(style);

  const track = el(doc, 'div', 'm-track');
  track.hidden = true;
  const trackPrev = el(doc, 'button', 'm-track-nav');
  trackPrev.type = 'button';
  trackPrev.hidden = true;
  trackPrev.textContent = '◀';
  const trackOpen = el(doc, 'button', 'm-track-open');
  trackOpen.type = 'button';
  const trackArrow = el(doc, 'span', 'm-track-arrow');
  trackArrow.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="#223A70" stroke="#F8B500" stroke-width="1.5" stroke-linejoin="round" d="M12 2.5l4.2 7.2H14v12h-4v-12H7.8z"/></svg>';
  trackArrow.hidden = true;
  const trackCopy = el(doc, 'span', 'm-track-copy');
  const trackTitle = el(doc, 'span', 'm-track-title');
  const trackStep = el(doc, 'span', 'm-track-step');
  const trackDist = el(doc, 'span', 'm-track-dist');
  trackCopy.appendChild(trackTitle);
  trackCopy.appendChild(trackStep);
  trackCopy.appendChild(trackDist);
  trackOpen.appendChild(trackArrow);
  trackOpen.appendChild(trackCopy);
  const trackNext = el(doc, 'button', 'm-track-nav');
  trackNext.type = 'button';
  trackNext.hidden = true;
  trackNext.textContent = '▶';
  const trackGo = el(doc, 'button', 'm-track-go');
  trackGo.type = 'button';
  trackGo.hidden = true;
  const stop = (e) => e.stopPropagation();
  trackPrev.addEventListener('click', (e) => { stop(e); o.onPrev?.(); });
  trackNext.addEventListener('click', (e) => { stop(e); o.onNext?.(); });
  trackGo.addEventListener('click', (e) => { stop(e); o.onGo?.(); });
  track.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && (t.closest('.m-track-go') || t.closest('.m-track-nav'))) return;
    o.onOpenLog?.();
  });
  track.appendChild(trackPrev);
  track.appendChild(trackOpen);
  track.appendChild(trackNext);
  track.appendChild(trackGo);
  track.addEventListener('animationend', () => track.classList.remove('m-flash'));

  const book = el(doc, 'button', 'm-book');
  book.setAttribute('type', 'button');
  book.hidden = true;
  book.addEventListener('click', () => o.onOpenLog?.());

  const prompt = el(doc, 'button', 'm-prompt');
  prompt.setAttribute('type', 'button');
  prompt.hidden = true;
  prompt.addEventListener('click', () => o.onPrompt?.());

  const balloons = el(doc, 'div', 'm-balloons');
  const rings = el(doc, 'div', 'm-rings');
  const nodes = [];
  const ringNodes = [];
  const edge = el(doc, 'div', 'm-edge');
  edge.hidden = true;
  edge.appendChild(el(doc, 'b'));

  const dim = el(doc, 'div', 'm-dim');
  dim.hidden = true;
  const sheet = el(doc, 'div', 'm-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.tabIndex = -1;
  sheet.hidden = true;
  const name = el(doc, 'div', 'm-name');
  name.id = 'klc-m-name';
  const line = el(doc, 'p', 'm-line');
  line.setAttribute('aria-hidden', 'true');
  const words = el(doc, 'span', 'm-words');
  const caret = el(doc, 'span', 'm-caret');
  caret.textContent = '▼';
  line.appendChild(words);
  line.appendChild(caret);
  const choices = el(doc, 'div', 'm-choices');
  const live = el(doc, 'div', 'm-live');
  live.setAttribute('aria-live', 'polite');
  sheet.appendChild(name);
  sheet.appendChild(line);
  sheet.appendChild(choices);
  sheet.appendChild(live);
  sheet.addEventListener('click', (e) => {
    if (e.target.closest?.('button')) return;
    o.onAdvance?.();
  });
  dim.addEventListener('click', () => {
    if (!hub.hidden) { hideHub(); return; }
    if (!choices.childNodes.length) o.onAdvance?.();
  });

  const log = el(doc, 'div', 'm-log');
  log.setAttribute('role', 'dialog');
  log.hidden = true;
  const logBar = el(doc, 'div', 'm-bar');
  const logTitle = el(doc, 'h2');
  const logX = el(doc, 'button', 'm-x');
  logX.setAttribute('type', 'button');
  logBar.appendChild(logTitle);
  logBar.appendChild(logX);
  const logBody = el(doc, 'div', 'm-scroll');
  log.appendChild(logBar);
  log.appendChild(logBody);
  logX.addEventListener('click', () => hideLog());

  const card = el(doc, 'div', 'm-card');
  card.setAttribute('role', 'dialog');
  card.hidden = true;
  const cardBar = el(doc, 'div', 'm-bar');
  const cardHead = el(doc, 'h2');
  const cardX = el(doc, 'button', 'm-x');
  cardX.setAttribute('type', 'button');
  cardBar.appendChild(cardHead);
  cardBar.appendChild(cardX);
  const cardBody = el(doc, 'div', 'm-scroll');
  card.appendChild(cardBar);
  card.appendChild(cardBody);
  cardX.addEventListener('click', () => hideCard());

  const stamps = el(doc, 'div', 'm-stamps m-log');
  stamps.setAttribute('role', 'dialog');
  stamps.hidden = true;
  const stampsBar = el(doc, 'div', 'm-bar');
  const stampsTitle = el(doc, 'h2');
  const stampsX = el(doc, 'button', 'm-x');
  stampsX.setAttribute('type', 'button');
  stampsBar.appendChild(stampsTitle);
  stampsBar.appendChild(stampsX);
  const stampsBody = el(doc, 'div', 'm-scroll');
  stamps.appendChild(stampsBar);
  stamps.appendChild(stampsBody);
  stampsX.addEventListener('click', () => { stamps.hidden = true; syncDim(); });

  const bookCss = el(doc, 'style');
  bookCss.textContent = STAMP_CSS;
  doc.head.appendChild(bookCss);

  const coach = el(doc, 'div', 'm-coach');
  coach.hidden = true;
  coach.setAttribute('role', 'status');
  const hub = el(doc, 'div', 'm-hub');
  hub.hidden = true;
  hub.setAttribute('role', 'dialog');
  hub.setAttribute('aria-modal', 'true');
  hub.setAttribute('aria-labelledby', 'klc-m-hub-title');
  const hubStill = el(doc, 'div', 'm-hub-still');
  const hubImg = el(doc, 'img');
  hubImg.alt = '';
  const hubNew = el(doc, 'span', 'm-hub-new');
  hubNew.textContent = 'NEW';
  hubStill.appendChild(hubImg);
  hubStill.appendChild(hubNew);
  const hubBody = el(doc, 'div', 'm-hub-body');
  const hubTitle = el(doc, 'h2', 'm-hub-title');
  hubTitle.id = 'klc-m-hub-title';
  const hubHook = el(doc, 'p', 'm-hub-hook');
  const hubChips = el(doc, 'div', 'm-hub-chips');
  const hubProgress = el(doc, 'p', 'm-hub-progress');
  const hubGo = el(doc, 'button', 'm-hub-go');
  hubGo.setAttribute('type', 'button');
  hubBody.appendChild(hubTitle);
  hubBody.appendChild(hubHook);
  hubBody.appendChild(hubChips);
  hubBody.appendChild(hubProgress);
  hubBody.appendChild(hubGo);
  hub.appendChild(hubStill);
  hub.appendChild(hubBody);
  hubGo.addEventListener('click', () => o.onHubStart?.());

  root.appendChild(track);
  root.appendChild(book);
  root.appendChild(prompt);
  root.appendChild(rings);
  root.appendChild(balloons);
  root.appendChild(edge);
  root.appendChild(coach);
  root.appendChild(hub);
  root.appendChild(dim);
  root.appendChild(sheet);
  root.appendChild(log);
  root.appendChild(stamps);
  root.appendChild(card);
  doc.body.appendChild(root);

  let ci = 0;
  let trackKey = '';

  function syncDim() {
    const hubOn = !hub.hidden;
    dim.hidden = log.hidden && card.hidden && stamps.hidden && !hubOn;
    dim.classList.toggle('m-hub-on', hubOn && log.hidden && card.hidden && stamps.hidden);
  }
  function hideLog() {
    const was = !log.hidden;
    log.hidden = true;
    stamps.hidden = true;
    syncDim();
    if (was) o.onLogClose?.();
  }
  function hideCard() {
    const was = !card.hidden;
    card.hidden = true;
    syncDim();
    if (was) o.onCardClose?.();
  }
  function hideTalk() {
    sheet.hidden = true;
    choices.textContent = '';
    syncDim();
  }

  function setTracker(m) {
    if (!m) { track.hidden = true; trackKey = ''; return; }
    track.hidden = false;
    const key = m.title + '\n' + m.step + '\n' + (m.dist || '') + '\n' + (m.action || '') + '\n' + (m.nav ? '1' : '0');
    if (key === trackKey) return;
    trackKey = key;
    trackTitle.textContent = m.title;
    trackStep.textContent = m.step || '';
    trackDist.textContent = m.dist || '';
    trackDist.hidden = !m.dist;
    trackGo.hidden = !m.action;
    trackGo.textContent = m.action || '';
    trackPrev.hidden = !m.nav;
    trackNext.hidden = !m.nav;
    if (m.prev) trackPrev.setAttribute('aria-label', m.prev);
    if (m.next) trackNext.setAttribute('aria-label', m.next);
    if (m.lit) track.classList.add('m-lit');
  }

  function flashTracker(hold) {
    track.classList.remove('m-flash');
    if (hold) { track.classList.add('m-lit'); return; }
    track.classList.remove('m-lit');
    try { void track.offsetWidth; } catch { /* a test DOM may not layout */ }
    track.classList.add('m-flash');
  }

  function setBearing(deg) {
    if (deg == null || !Number.isFinite(deg) || track.hidden) { trackArrow.hidden = true; return; }
    trackArrow.hidden = false;
    const d = (deg + 3600.5) | 0;
    const wrapped = ((d % 360) + 360) % 360;
    if (trackArrow._d === wrapped) return;
    trackArrow._d = wrapped;
    trackArrow.style.transform = 'rotate(' + wrapped + 'deg)';
  }

  function syncBalloons(items, n) {
    const count = n || 0;
    while (nodes.length < count) {
      const node = el(doc, 'div', 'm-balloon');
      const glyph = el(doc, 'b');
      node.appendChild(glyph);
      balloons.appendChild(node);
      nodes.push(node);
      const ring = el(doc, 'div', 'm-ring');
      ring.hidden = true;
      rings.appendChild(ring);
      ringNodes.push(ring);
    }
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const ring = ringNodes[i];
      const it = i < count ? items[i] : null;
      if (!it || it.show === false) {
        node.hidden = true;
        if (ring) ring.hidden = true;
        continue;
      }
      node.hidden = false;
      const mark = it.mark || (it.kind === 'turnin' ? '？' : it.kind === 'quest' ? '！' : '…');
      const bang = it.kind === 'quest' || it.kind === 'turnin';
      const key = it.id + it.kind;
      if (node.dataset.k !== key) {
        node.dataset.k = key;
        node.className = bang ? 'm-balloon m-bang' : 'm-balloon m-soft';
        node.firstChild.textContent = mark;
        if (!bang) {
          node.style.width = '';
          node.style.height = '';
          node.style.fontSize = '';
          node.style.borderWidth = '';
        }
      }
      if (bang) {
        const px = (it.px + 0.5) | 0;
        if (node._px !== px && px > 0) {
          node._px = px;
          node.style.width = px + 'px';
          node.style.height = px + 'px';
          node.style.fontSize = Math.max(12, Math.round(px * 0.48)) + 'px';
          node.style.borderWidth = (px < 36 ? 2 : 3) + 'px';
          node.style.setProperty('--bob', (px < 36 ? 5 : 8) + 'px');
        }
      }
      const op = it.op == null ? 1 : it.op;
      const bucket = Math.round(op * 20) / 20;
      if (node._o !== bucket) { node._o = bucket; node.style.opacity = bucket >= 1 ? '' : String(bucket); }
      const x = (it.x + 0.5) | 0, y = (it.y + 0.5) | 0;
      if (node._x !== x) { node._x = x; node.style.left = x + 'px'; }
      if (node._y !== y) { node._y = y; node.style.top = y + 'px'; }
      if (!ring) continue;
      if (!it.ring) { ring.hidden = true; continue; }
      ring.hidden = false;
      if (ring._o !== bucket) { ring._o = bucket; ring.style.opacity = bucket >= 1 ? '' : String(bucket); }
      const rw = (it.rw + 0.5) | 0, rh = (it.rh + 0.5) | 0;
      const rx = (it.rx + 0.5) | 0, ry = (it.ry + 0.5) | 0;
      if (ring._w !== rw) { ring._w = rw; ring.style.width = rw + 'px'; }
      if (ring._h !== rh) { ring._h = rh; ring.style.height = rh + 'px'; }
      if (ring._x !== rx) { ring._x = rx; ring.style.left = rx + 'px'; }
      if (ring._y !== ry) { ring._y = ry; ring.style.top = ry + 'px'; }
    }
  }

  function showCoach(text) {
    coach.hidden = false;
    coach.textContent = text || '';
  }

  function hideCoach() { coach.hidden = true; }

  function showHub(m) {
    log.hidden = true;
    sheet.hidden = true;
    card.hidden = true;
    stamps.hidden = true;
    hub.hidden = false;
    hubTitle.textContent = m.title || '';
    hubHook.textContent = m.hook || '';
    hubProgress.textContent = m.progress || '';
    hubGo.textContent = m.start || '';
    hubNew.hidden = !m.isNew;
    hubImg.src = m.art || '';
    hubImg.alt = m.title || '';
    hubChips.textContent = '';
    const chips = m.chips || [];
    for (let i = 0; i < chips.length; i++) {
      const c = el(doc, 'span', 'm-chip');
      c.textContent = chips[i];
      hubChips.appendChild(c);
    }
    syncDim();
    if (!root.classList.contains('m-reduce')) hubGo.focus();
  }

  function hideHub() {
    hub.hidden = true;
    syncDim();
  }

  function setEdge(m) {
    if (!m || !m.show) { edge.hidden = true; return; }
    edge.hidden = false;
    const x = (m.x + 0.5) | 0, y = (m.y + 0.5) | 0, deg = (m.deg + 0.5) | 0;
    if (edge._x !== x) { edge._x = x; edge.style.left = x + 'px'; }
    if (edge._y !== y) { edge._y = y; edge.style.top = y + 'px'; }
    if (edge._d !== deg) { edge._d = deg; edge.style.transform = 'rotate(' + deg + 'deg)'; }
  }

  function showPage(m) {
    log.hidden = true;
    sheet.hidden = false;
    sheet.dataset.act = m.act || '';
    name.textContent = m.role || '';
    name.style.background = m.color || '#223a70';
    name.style.color = m.ink || '#fbfaf5';
    live.textContent = m.full || '';
    choices.textContent = '';
    ci = 0;
    const list = m.choices || [];
    for (let i = 0; i < list.length && i < 2; i++) {
      const c = list[i];
      const b = el(doc, 'button', 'm-choice' + (c.act === 'accept' ? ' m-yes' : ''));
      b.setAttribute('type', 'button');
      const cur = el(doc, 'span', 'm-cur');
      cur.textContent = '▶';
      cur.setAttribute('aria-hidden', 'true');
      const lab = el(doc, 'span', 'm-choice-label');
      lab.textContent = c.label;
      b.appendChild(cur);
      b.appendChild(lab);
      b.dataset.act = c.act || '';
      if (i === 0) b.classList.add('m-on');
      b.addEventListener('click', () => o.onChoice?.(c));
      choices.appendChild(b);
    }
    paintLine(m.shown || '', !!m.done);
    syncDim();
    const first = choices.querySelector('button');
    if (!root.classList.contains('m-reduce')) {
      if (first) first.focus();
      else sheet.focus();
    }
  }

  function paintLine(text, done) {
    words.textContent = text || '';
    caret.hidden = !done;
  }

  function fillLog(host, model) {
    host.textContent = '';
    const rows = (model.active?.length || 0) + (model.available?.length || 0) + (model.done?.length || 0);
    if (!rows) {
      const p = el(doc, 'p', 'm-empty');
      p.textContent = model.empty || '';
      host.appendChild(p);
      return;
    }
    addGroup(host, model.heads?.active, model.active);
    addGroup(host, model.heads?.available, model.available);
    addGroup(host, model.heads?.done, model.done);
  }

  function addGroup(host, head, rows) {
    if (!rows || !rows.length) return;
    const h = el(doc, 'h2');
    h.textContent = head || '';
    host.appendChild(h);
    const ul = el(doc, 'ul');
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const li = el(doc, 'li');
      const b = el(doc, 'button', 'm-q');
      b.setAttribute('type', 'button');
      b.dataset.id = row.id;
      b.dataset.kind = row.kind || '';
      const title = el(doc, 'span', 'm-q-title');
      title.textContent = row.title || '';
      const step = el(doc, 'span', 'm-q-step');
      step.textContent = row.step || '';
      b.appendChild(title);
      b.appendChild(step);
      b.addEventListener('click', () => o.onPick?.(row.id, row.kind));
      li.appendChild(b);
      ul.appendChild(li);
    }
    host.appendChild(ul);
  }

  function showLog(model) {
    sheet.hidden = true;
    card.hidden = true;
    stamps.hidden = true;
    log.hidden = false;
    logTitle.textContent = model.title || '';
    logX.textContent = model.close || '';
    fillLog(logBody, model);
    syncDim();
    logX.focus();
  }

  function fillStamps(host, model) {
    host.textContent = '';
    const wrap = el(doc, 'div', 'm-stamp-book');
    if (model.lead) {
      const lead = el(doc, 'p', 'm-stamps-lead');
      lead.textContent = model.lead;
      wrap.appendChild(lead);
    }
    const grid = el(doc, 'div', 'm-stamp-grid');
    const rows = model.rows || [];
    let ink = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cell = el(doc, 'div', 'm-stamp');
      const seal = el(doc, 'div', row.got ? 'm-hanko m-hanko-got' : 'm-hanko m-hanko-wait');
      if (row.fresh) { seal.classList.add('m-hanko-in'); ink = true; }
      seal.textContent = row.glyph || '';
      if (row.got && row.ink) seal.style.color = row.ink;
      if (row.got && row.ink) seal.style.borderColor = row.ink;
      const name = el(doc, 'span', 'm-stamp-name');
      name.textContent = row.title || '';
      cell.appendChild(seal);
      cell.appendChild(name);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    host.appendChild(wrap);
    return ink;
  }

  function showStamps(model) {
    sheet.hidden = true;
    log.hidden = true;
    card.hidden = true;
    stamps.hidden = false;
    stampsTitle.textContent = model.title || '';
    stampsX.textContent = model.close || '';
    const ink = fillStamps(stampsBody, model);
    syncDim();
    if (!root.classList.contains('m-reduce')) stampsX.focus();
    return ink;
  }

  function showCard(m) {
    card.hidden = false;
    card.dataset.kind = m.kind || 'game';
    cardHead.textContent = m.rewardLabel || '';
    cardX.textContent = m.close || '';
    cardBody.textContent = '';
    const seal = el(doc, 'div', 'm-seal');
    seal.textContent = m.seal || '';
    seal.style.borderColor = m.sealInk || m.color || '#223a70';
    seal.style.color = m.sealInk || m.color || '#223a70';
    const title = el(doc, 'h2', 'm-card-title');
    title.textContent = m.title || '';
    const fact = el(doc, 'p', 'm-fact');
    fact.textContent = m.fact || '';
    const from = el(doc, 'p', 'm-from');
    from.textContent = m.from || '';
    cardBody.appendChild(seal);
    cardBody.appendChild(title);
    if (m.fact) cardBody.appendChild(fact);
    if (m.from) cardBody.appendChild(from);
    if (m.kind === 'recruiting') {
      const box = el(doc, 'div', 'm-recruit');
      const h = el(doc, 'p', 'm-recruit-title');
      h.textContent = m.recruiting || '';
      box.appendChild(h);
      cardBody.appendChild(box);
    } else if (m.kind === 'voucher') {
      const box = el(doc, 'div', 'm-recruit');
      const shop = el(doc, 'p', 'm-shop');
      shop.textContent = m.shop || '';
      const offer = el(doc, 'p');
      offer.textContent = m.offer || '';
      const terms = el(doc, 'p');
      terms.textContent = m.terms || '';
      const codeL = el(doc, 'p');
      codeL.textContent = m.codeLabel || '';
      const code = el(doc, 'p', 'm-code');
      code.textContent = m.code || '';
      const when = el(doc, 'p');
      when.textContent = m.whenLabel || '';
      const show = el(doc, 'p', 'm-show');
      show.textContent = m.showLine || '';
      box.appendChild(shop);
      box.appendChild(offer);
      box.appendChild(terms);
      box.appendChild(codeL);
      box.appendChild(code);
      box.appendChild(when);
      box.appendChild(show);
      cardBody.appendChild(box);
    }
    syncDim();
    cardX.focus();
  }

  return {
    root,
    setLang(lang) { root.lang = lang; },
    setBook(on, label) { book.hidden = !on; if (label) book.textContent = label; },
    setPrompt(on, label) { prompt.hidden = !on; if (label) prompt.textContent = label; },
    setTracker, flashTracker, setBearing, syncBalloons, setEdge, showPage, paintLine, hideTalk,
    showLog, hideLog, fillLog, showCard, hideCard, fillStamps, showStamps,
    showCoach, hideCoach, showHub, hideHub,
    isLog: () => !log.hidden,
    isHub: () => !hub.hidden,
    isCard: () => !card.hidden,
    choiceIndex: () => ci,
    moveChoice(dir) {
      const buttons = choices.querySelectorAll('button');
      if (!buttons.length) return;
      buttons[ci]?.classList.remove('m-on');
      ci = (ci + dir + buttons.length) % buttons.length;
      buttons[ci].classList.add('m-on');
      buttons[ci].focus();
    },
  };
}
