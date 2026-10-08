// 「みんなであそぶ」. The lobby, the shared countdown, and the results screen.
// Tokens follow docs/CRAFT.md and PLAY-UI-STYLE. 禁則: line-break strict, auto-phrase on headings, never keep-all.

import { STAMP_COUNT } from '../../../../server/multi/wire.js';
import { formatTime } from './race.js';
import { fillCard } from './card.js';

const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></svg>';
const KEY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CSS = `
/* 和色: 紺 #223A70, 鉄紺 #17184B, 山吹 #F8B500, 藍 #165E83, 浅葱 #00A3AF, 生成り #FBFAF5, 茜 #B7282E */
#klc-multi { position: fixed; inset: 0; z-index: 8; pointer-events: none;
  --k-ink: #2d3350; --k-navy: #223A70; --k-paper: rgba(251, 250, 245, 0.97);
  --k-glass: rgba(250, 247, 241, 0.94); --k-line: rgba(45, 51, 80, 0.12);
  --k-muted: #595857; --k-alert: #B7282E; --k-gold: #F8B500; --k-iron: #17184B;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif;
  --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  color: var(--k-ink); font-family: var(--k-sans); line-break: strict; -webkit-font-smoothing: antialiased; }
#klc-multi * { box-sizing: border-box; }
#klc-multi h2, #klc-multi h3 { word-break: auto-phrase; text-wrap: balance; line-height: 1.3; font-feature-settings: "palt"; }
#klc-multi p, #klc-multi li { text-wrap: pretty; line-height: 1.6; }
#klc-multi button, #klc-multi input { font: inherit; color: inherit; }
#klc-multi button { border: 0; background: none; cursor: pointer; pointer-events: auto;
  min-height: 44px; min-width: 44px; -webkit-tap-highlight-color: transparent; }
#klc-multi button:focus-visible, #klc-multi input:focus-visible {
  outline: 2px solid var(--k-navy); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255,255,255,.92); }
#klc-multi button svg { width: 22px; height: 22px; flex: none; }
#klc-multi .pri, #klc-multi .sec { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; border-radius: 999px; padding: 0 18px; transition: transform 80ms ease-out; }
#klc-multi .pri { min-height: 56px; font: 800 16px/1 var(--k-round); color: var(--k-navy);
  background: linear-gradient(#FFE27A, #F8B500 48%, #E0A400);
  box-shadow: 0 4px 12px rgba(23, 24, 75, .35), inset 0 0 0 3px #fff, inset 0 2px 0 rgba(255,255,255,.65); }
#klc-multi .pri:active { transform: scale(.94); }
#klc-multi .pri:disabled { opacity: .45; box-shadow: none; }
#klc-multi .sec { min-height: 52px; font: 700 14px/1 var(--k-round); color: var(--k-navy);
  background: rgba(251, 250, 245, .94);
  box-shadow: 0 4px 12px rgba(23, 24, 75, .28), inset 0 0 0 2px rgba(255,255,255,.7), inset 0 0 0 3px rgba(23,24,75,.18); }
#klc-multi .sec:active { transform: scale(.94); }
#klc-multi .tags { position: absolute; inset: 0; overflow: hidden; }
#klc-multi .tag { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 6px; border-radius: 999px; background: var(--k-glass);
  box-shadow: 0 4px 16px rgba(23, 24, 75, 0.18); font: 700 13px/1.3 var(--k-round); color: var(--k-navy);
  white-space: nowrap; }
#klc-multi .tag i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,.8); }
#klc-multi .tag span { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%);
  padding: 6px 10px; border-radius: 14px; background: #FBFAF5; color: var(--k-navy);
  box-shadow: 0 8px 20px rgba(23, 24, 75, 0.18); font: 700 14px/1.3 var(--k-round); }
#klc-multi .tag span::after { content: ""; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px;
  background: #FBFAF5; transform: translateX(-50%) rotate(45deg); }
#klc-multi .tag span.pop { animation: klc-multi-pop 200ms ease-out; }
@keyframes klc-multi-pop { from { transform: translateX(-50%) scale(0.86); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
#klc-multi .people { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); left: calc(12px + env(safe-area-inset-left, 0px));
  margin: 0; height: 40px; padding: 0 14px; display: flex; align-items: center; border-radius: 999px;
  background: #223A70; color: #FBFAF5; font: 700 14px/1 var(--k-round);
  font-variant-numeric: tabular-nums;
  box-shadow: 0 4px 12px rgba(23,24,75,.35), inset 0 0 0 2px rgba(255,255,255,.7); }
#klc-multi .people[hidden] { display: none; }
#klc-multi .tag[hidden], #klc-multi .tag span[hidden] { display: none; }
#klc-multi .multi-hoya-credit { position: absolute; left: 50%; bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%); margin: 0; padding: 4px 10px; border-radius: 999px; background: rgba(251, 250, 245, 0.9);
  color: var(--k-navy); font: 600 12px/1.4 var(--k-round); text-align: center; max-width: min(92vw, 420px); }
#klc-multi .multi-hoya-credit[hidden] { display: none; }
#klc-multi .dialog[hidden], #klc-multi .count[hidden], #klc-multi .race[hidden], #klc-multi .flash[hidden],
#klc-multi .results[hidden], #klc-multi .hub[hidden], #klc-multi .go[hidden], #klc-multi .goal[hidden],
#klc-multi .wait-float[hidden], #klc-multi .coach[hidden], #klc-multi .race-time[hidden] { display: none; }
#klc-multi .dialog { position: absolute; inset: 0; z-index: 4; display: grid; place-items: end center; pointer-events: auto; overflow: hidden;
  padding: 12px; padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  padding-top: calc(12px + env(safe-area-inset-top, 0px)); background: rgba(23, 24, 75, 0.55); }
#klc-multi .sheet { width: min(420px, 100%); max-height: 100%; min-height: 0; overflow: auto; overscroll-behavior: contain;
  background: #FBFAF5; border-radius: 22px 22px 0 0; padding: 16px 16px 20px;
  box-shadow: 0 18px 50px rgba(23, 24, 75, 0.28); }
#klc-multi .head { display: flex; align-items: flex-start; gap: 8px; }
#klc-multi h2 { flex: 1; margin: 4px 0 0; font: 800 26px/1.3 var(--k-round); color: var(--k-navy); }
#klc-multi .x { width: 44px; height: 44px; border-radius: 999px; background: rgba(34, 58, 112, 0.08); color: var(--k-navy);
  font: 700 20px/1 var(--k-round); }
#klc-multi .lead { margin: 8px 0 16px; color: var(--k-muted); font-size: 15px; }
#klc-multi .stack { display: grid; gap: 8px; }
#klc-multi .pass-label { display: block; margin: 0; text-align: center; font: 700 13px/1.4 var(--k-round); color: var(--k-navy); }
#klc-multi .code { margin: 8px 0; display: flex; justify-content: center; gap: 8px; min-height: 72px; align-items: center;
  text-align: center; font: 900 40px/1 var(--k-round); letter-spacing: 0; color: var(--k-navy); }
#klc-multi .code .ch { width: 56px; height: 72px; display: grid; place-items: center; border-radius: 12px; background: #fff;
  box-shadow: inset 0 0 0 2px rgba(34, 58, 112, .28), 0 4px 12px rgba(23,24,75,.12);
  font: 900 36px/1 var(--k-round); font-style: normal; }
#klc-multi .copy { margin-bottom: 8px; }
#klc-multi .coach { margin: 0 0 12px; padding: 12px 14px; border-radius: 16px; background: #fff; color: var(--k-navy);
  box-shadow: 0 8px 20px rgba(23,24,75,.16); font: 700 16px/1.6 var(--k-round); text-align: center; }
#klc-multi .you { margin: 4px 0 12px; text-align: center; font: 700 16px/1.4 var(--k-round); color: var(--k-navy); }
#klc-multi .qr { width: 100%; height: auto; margin: 8px auto; background: transparent; display: grid; justify-items: center; }
#klc-multi .qr svg { width: 112px; height: 112px; background: #FBFAF5; border-radius: 12px; padding: 8px; }
#klc-multi .qr p { margin: 8px 0 0; max-width: 28em; font-size: 12px; line-height: 1.5; color: var(--k-muted); text-align: center; }
#klc-multi .peers { list-style: none; margin: 8px 0 12px; padding: 0; display: grid; gap: 8px; }
#klc-multi .peers li { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 8px;
  border-radius: 12px; background: rgba(34, 58, 112, 0.05); font: 700 15px/1.4 var(--k-round); }
#klc-multi .peers i { width: 16px; height: 16px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); }
#klc-multi .stamps { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 12px; }
#klc-multi .stamps button { border-radius: 12px; min-height: 52px; background: rgba(34, 58, 112, 0.08); color: var(--k-navy);
  font: 700 15px/1.2 var(--k-round); }
#klc-multi .race { display: grid; gap: 8px; margin: 8px 0; }
#klc-multi .hint, #klc-multi .wait { margin: 8px 0; color: var(--k-muted); font-size: 13px; text-align: center; }
#klc-multi label { display: block; margin-bottom: 8px; font: 700 13px/1.4 var(--k-round); color: var(--k-navy); }
#klc-multi input { width: 100%; height: 56px; border-radius: 12px; border: 2px solid rgba(34, 58, 112, 0.28);
  background: #fff; text-align: center; font: 900 28px/1 var(--k-round); letter-spacing: 0.28em; color: var(--k-navy);
  text-transform: uppercase; }
#klc-multi .acts { display: flex; gap: 8px; margin-top: 12px; }
#klc-multi .acts button { flex: 1; }
#klc-multi .err { margin: 12px 0 0; color: var(--k-alert); font: 700 14px/1.6 var(--k-round); }
#klc-multi .count { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; pointer-events: none;
  font: 900 120px/1 var(--k-round); color: #FBFAF5; letter-spacing: 0.02em;
  -webkit-text-stroke: 8px #223A70; paint-order: stroke fill; }
#klc-multi .count.go { color: var(--k-gold); }
#klc-multi .count.beat { animation: klc-beat 420ms cubic-bezier(.2, .8, .2, 1); }
@keyframes klc-beat { from { transform: scale(1.3); } to { transform: scale(1); } }
#klc-multi .race-time { position: absolute; z-index: 2; left: 50%; top: calc(12px + env(safe-area-inset-top, 0px));
  transform: translateX(-50%); margin: 0; font: 800 44px/1 var(--k-round); font-variant-numeric: tabular-nums;
  color: #FBFAF5; -webkit-text-stroke: 2px #223A70; paint-order: stroke fill; pointer-events: none; }
#klc-multi .go, #klc-multi .goal { position: absolute; z-index: 2; left: 50%; width: auto; min-width: 168px;
  bottom: calc(108px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); }
#klc-multi .go:active, #klc-multi .goal:active { transform: translateX(-50%) scale(.94); }
#klc-multi .go kbd { font: 700 12px/1 var(--k-round); padding: 3px 6px; border-radius: 6px; background: rgba(34,58,112,.12); }
#klc-multi .wait-float { position: absolute; z-index: 2; left: 50%; bottom: calc(120px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%); margin: 0; padding: 0 16px; height: 40px; display: flex; align-items: center;
  border-radius: 999px; background: #223A70; color: #FBFAF5; font: 700 14px/1 var(--k-round);
  box-shadow: 0 4px 12px rgba(23,24,75,.35); pointer-events: none; }
#klc-multi .flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
#klc-multi .flash.on { opacity: 0.15; }
#klc-multi .results, #klc-multi .hub { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: rgba(23, 24, 75, .55); pointer-events: auto; opacity: 0; transition: opacity 120ms ease-out; }
#klc-multi .results.show, #klc-multi .hub.show { opacity: 1; }
#klc-multi .stage { width: min(440px, 100%); max-height: 100%; overflow: auto; background: #FBFAF5; border-radius: 22px;
  padding: 24px 20px 16px; box-shadow: 0 18px 50px rgba(23,24,75,.35); text-align: center; }
#klc-multi .medal-lg { position: relative; width: 120px; height: 120px; margin: 0 auto 8px; border-radius: 50%;
  border: 4px solid var(--k-navy); display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(circle at 40% 32%, #FFE27A, #F8B500 52%, #C49000);
  box-shadow: 0 8px 16px rgba(23,24,75,.28), inset 0 0 0 3px rgba(255,255,255,.75);
  font: 900 64px/1 var(--k-round); color: var(--k-iron); }
#klc-multi .medal-lg .shine { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 36%, rgba(255,255,255,.8) 50%, transparent 64%);
  transform: translateX(-120%); animation: klc-shine 700ms ease-out 180ms 1; }
@keyframes klc-shine { to { transform: translateX(120%); } }
#klc-multi .medal-lg.drop { animation: klc-medal 220ms cubic-bezier(.2, .9, .3, 1.2); }
@keyframes klc-medal { from { transform: translateY(-24px) scale(1.16); opacity: 0; } to { transform: none; opacity: 1; } }
#klc-multi .hero { margin: 0; font: 800 44px/1 var(--k-round); font-variant-numeric: tabular-nums; color: var(--k-navy); }
#klc-multi .winner { margin: 4px 0 0; font: 700 16px/1.4 var(--k-round); color: var(--k-navy); }
#klc-multi .hanko { width: 92px; height: 92px; margin: 12px auto 0; display: grid; place-items: center; border-radius: 8px;
  border: 3px solid var(--k-alert); color: var(--k-alert); background: rgba(183, 40, 46, .06);
  font: 900 15px/1.25 var(--k-round); transform: rotate(-8deg); }
#klc-multi .hanko.land { animation: klc-hanko 160ms ease-out 900ms both; }
@keyframes klc-hanko { from { transform: scale(1.4) rotate(-16deg); opacity: 0; } to { transform: rotate(-8deg); opacity: 1; } }
#klc-multi .ranks { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 8px; text-align: start; }
#klc-multi .ranks li { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 4px 12px; border-radius: 12px;
  font: 700 15px/1.4 var(--k-round); color: var(--k-navy); }
#klc-multi .ranks li.you { background: rgba(248, 181, 0, .28); box-shadow: inset 4px 0 0 #F8B500; }
#klc-multi .ranks .mini { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center;
  background: var(--k-gold); border: 2px solid var(--k-navy); font: 900 16px/1 var(--k-round); color: var(--k-iron); }
#klc-multi .ranks .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
#klc-multi .ranks .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
#klc-multi .ranks .who { font-weight: 700; }
#klc-multi .ranks .fast { font-size: 12px; line-height: 1.3; color: var(--k-alert); white-space: nowrap; }
#klc-multi .ranks b { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; font-size: 18px; }
#klc-multi .mode-card { position: relative; width: min(300px, 100%); padding: 12px; border-radius: 16px; background: #FBFAF5;
  box-shadow: 0 18px 50px rgba(23,24,75,.35); }
#klc-multi .mode-card .still { position: relative; aspect-ratio: 16 / 10; border-radius: 12px; overflow: hidden; background: #165E83; }
#klc-multi .mode-card .still svg, #klc-multi .mode-card .still img { width: 100%; height: 100%; object-fit: cover; display: block; }
#klc-multi .mode-card .still img { position: absolute; inset: 0; }
#klc-multi .mode-card h3 { margin: 12px 0 4px; font: 800 22px/1.3 var(--k-round); color: var(--k-navy); }
#klc-multi .mode-card .hook { margin: 0 0 8px; font-size: 14px; color: var(--k-muted); }
#klc-multi .mode-card .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
#klc-multi .mode-card .chips span { height: 28px; padding: 0 10px; border-radius: 999px; background: rgba(34,58,112,.08);
  font: 700 12px/28px var(--k-round); color: var(--k-navy); }
#klc-multi .mode-card .new { position: absolute; top: 20px; right: 20px; padding: 2px 8px; border-radius: 999px;
  background: var(--k-alert); color: #FBFAF5; font: 800 12px/1.4 var(--k-round); }
body.klc-multi-room #klc-play .book,
body.klc-multi-room #klc-play .counters,
body.klc-multi-room #klc-play .prompt,
body.klc-multi-room #klc-play .timer,
body.klc-multi-room .swim-become,
body.klc-multi-room .swim-chip,
body.klc-multi-room .swim-dive { visibility: hidden !important; }
body.klc-multi-counting #klc-play .count, body.klc-multi-counting #klc-play .flash,
body.klc-multi-counting #course-local, body.klc-multi-counting #course-clock { visibility: hidden !important; }
body.klc-multi-open #course-quit, body.klc-multi-results #course-quit { visibility: hidden !important; }
body.klc-multi-open #klc-multi .go, body.klc-multi-open #klc-multi .goal, body.klc-multi-open #klc-multi .wait-float { visibility: hidden; }
@media (max-width: 720px) {
  #klc-multi .dialog { padding-left: 0; padding-right: 0; }
  #klc-multi .sheet { width: 100%; }
  #klc-multi .go, #klc-multi .goal { bottom: calc(168px + env(safe-area-inset-bottom, 0px)); }
  #klc-multi .go kbd { display: none; }
  #klc-multi .code .ch { width: 52px; height: 64px; font-size: 32px; }
}
@media (min-width: 721px), (max-height: 500px) {
  #klc-multi .dialog { place-items: center; }
  #klc-multi .sheet { border-radius: 22px; max-height: calc(100vh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
}
@media (max-height: 500px) {
  #klc-multi .lead { margin: 4px 0 8px; }
  #klc-multi .code .ch { width: 44px; height: 52px; font-size: 28px; }
  #klc-multi .count { font-size: 72px; -webkit-text-stroke-width: 5px; }
  #klc-multi .sheet { padding: 12px 16px; }
  #klc-multi .qr svg { width: 72px; height: 72px; }
}
@media (prefers-reduced-motion: reduce) {
  #klc-multi .flash.on { opacity: 0; }
  #klc-multi .count { -webkit-text-stroke: 0; text-shadow: none; }
  #klc-multi .count.beat, #klc-multi .medal-lg.drop, #klc-multi .medal-lg .shine, #klc-multi .hanko.land, #klc-multi .tag span.pop { animation: none; }
  #klc-multi .results, #klc-multi .hub { transition: none; }
  #klc-multi .pri, #klc-multi .sec { transition: none; }
}
`;

export function mountSheet(doc, o) {
  const reduce = () => {
    try { return !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
  };
  if (!doc.getElementById('klc-multi-css')) {
    const st = doc.createElement('style');
    st.id = 'klc-multi-css';
    st.textContent = CSS;
    doc.head.appendChild(st);
  }
  const root = doc.createElement('div');
  root.id = 'klc-multi';
  root.lang = 'ja';
  root.innerHTML = `
    <div class="tags" data-f="tags"></div>
    <div class="dialog" data-f="dialog" hidden>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="klc-multi-title">
        <div class="head"><h2 id="klc-multi-title"></h2><button type="button" class="x" data-act="close"></button></div>
        <p class="lead" data-f="lead"></p>
        <div data-pane="home"><div class="stack">
          <button type="button" class="pri" data-act="create">${FLAG}<span></span></button>
          <button type="button" class="sec" data-act="join">${KEY}<span></span></button>
        </div></div>
        <div data-pane="join" hidden>
          <label data-f="code-label" for="klc-multi-code"></label>
          <input id="klc-multi-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" enterkeyhint="go">
          <p class="hint" data-f="code-hint"></p>
          <div class="acts"><button type="button" class="sec" data-act="back"><span></span></button><button type="button" class="pri" data-act="enter"><span></span></button></div>
        </div>
        <div data-pane="room" hidden>
          <p class="pass-label" data-f="pass-label"></p>
          <p class="code" data-f="code" aria-live="polite"></p>
          <button type="button" class="sec copy" data-act="copy">${COPY}<span></span></button>
          <p class="coach" data-f="coach" data-act="coach" hidden></p>
          <p class="you" data-f="you"></p>
          <div class="race" data-f="race" hidden></div>
          <p class="wait" data-f="wait" hidden></p>
          <ul class="peers" data-f="peers"></ul>
          <div class="stamps" data-f="stamps"></div>
          <div class="qr" data-f="qr"></div>
          <button type="button" class="sec" data-act="leave"><span></span></button>
        </div>
        <p class="err" data-f="err" role="alert" hidden></p>
      </div>
    </div>
    <p class="people" data-f="people" hidden></p>
    <p class="race-time" data-f="race-time" hidden aria-hidden="true"></p>
    <button type="button" class="pri go" data-act="go" hidden>${FLAG}<span></span><kbd>Enter</kbd></button>
    <button type="button" class="pri goal" data-act="goal" hidden>${FLAG}<span></span></button>
    <p class="wait-float" data-f="wait-float" hidden></p>
    <div class="count" data-f="count" hidden aria-live="assertive"></div>
    <div class="flash" data-f="flash" hidden></div>
    <div class="results" data-f="results" hidden role="dialog" aria-modal="true" aria-labelledby="klc-multi-results">
      <div class="stage">
        <div class="medal-lg" data-f="medal" role="img" hidden><span class="shine" aria-hidden="true"></span>金</div>
        <p class="hero" data-f="hero"></p>
        <p class="winner" data-f="winner"></p>
        <p class="hanko" data-f="hanko" hidden></p>
        <h2 id="klc-multi-results" data-f="results-title"></h2>
        <ul class="ranks" data-f="ranks"></ul>
        <div class="acts">
          <button type="button" class="pri" data-act="again">${FLAG}<span></span></button>
          <button type="button" class="sec" data-act="dismiss"><span></span></button>
        </div>
      </div>
    </div>
    <div class="hub" data-f="hub" hidden></div>`;
  doc.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const dialog = $('[data-f="dialog"]');
  const results = $('[data-f="results"]');
  const hub = $('[data-f="hub"]');
  const panes = {
    home: $('[data-pane="home"]'),
    join: $('[data-pane="join"]'),
    room: $('[data-pane="room"]'),
  };
  const input = $('#klc-multi-code');
  const err = $('[data-f="err"]');
  const countEl = $('[data-f="count"]');
  const peopleEl = $('[data-f="people"]');
  const coachEl = $('[data-f="coach"]');
  let clockOn = true;
  let coachTimer = 0;
  const flash = $('[data-f="flash"]');
  let opener = null;
  let pane = 'home';
  let phase = '';

  function clear(el) {
    if (el.replaceChildren) el.replaceChildren();
    else while (el.firstChild) el.removeChild(el.firstChild);
  }

  function t(key, vars) { return o.t(key, vars); }

  function label(btn, text) {
    const span = btn.querySelector('span');
    if (span) span.textContent = text;
    else btn.textContent = text;
  }

  function showPane(name) {
    pane = name;
    for (const k in panes) panes[k].hidden = k !== name;
  }

  function paint() {
    root.lang = o.lang || 'ja';
    $('[data-f="lead"]').textContent = t('play.multi.lead');
    $('#klc-multi-title').textContent = t('play.multi.title');
    $('[data-act="close"]').setAttribute('aria-label', t('play.multi.close'));
    $('[data-act="close"]').textContent = '×';
    label($('[data-act="create"]'), t('play.multi.create'));
    label($('[data-act="join"]'), t('play.multi.join'));
    $('[data-f="code-label"]').textContent = t('play.multi.code');
    $('[data-f="pass-label"]').textContent = t('play.multi.code');
    $('[data-f="code-hint"]').textContent = t('play.multi.code.hint');
    input.setAttribute('aria-label', t('play.multi.code'));
    label($('[data-act="back"]'), t('play.multi.back'));
    label($('[data-act="enter"]'), t('play.multi.enter'));
    label($('[data-act="leave"]'), t('play.multi.leave'));
    label($('[data-act="copy"]'), t('play.multi.copy'));
    label($('[data-act="go"]'), t('play.multi.race.car'));
    label($('[data-act="goal"]'), t('play.multi.goal'));
    $('[data-f="wait-float"]').textContent = t('play.multi.waitHost');
    const stamps = $('[data-f="stamps"]');
    clear(stamps);
    for (let i = 0; i < STAMP_COUNT; i++) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.s = String(i);
      b.textContent = t('play.multi.stamp.' + i);
      stamps.appendChild(b);
    }
    const race = $('[data-f="race"]');
    clear(race);
    for (const course of ['car', 'race']) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = course === 'car' ? 'pri' : 'sec';
      b.dataset.course = course;
      if (course === 'car') b.innerHTML = FLAG + '<span></span>';
      else b.innerHTML = '<span></span>';
      label(b, t(course === 'car' ? 'play.multi.race.car' : 'play.multi.race.night'));
      race.appendChild(b);
    }
    $('[data-f="wait"]').textContent = t('play.multi.waitHost');
  }

  function setError(key) {
    if (!key) { err.hidden = true; err.textContent = ''; return; }
    err.hidden = false;
    err.textContent = t('play.multi.' + key) === 'play.multi.' + key ? t('play.multi.bad') : t('play.multi.' + key);
  }

  function finishCoach() {
    coachEl.hidden = true;
    if (coachTimer) { clearTimeout(coachTimer); coachTimer = 0; }
    const fn = o.onCoachDone;
    o.onCoachDone = null;
    try { fn?.(); } catch { /* */ }
  }

  function open(from) {
    opener = from || null;
    dialog.hidden = false;
    doc.body.classList.add('klc-multi-open');
    try { doc.exitPointerLock?.(); } catch { /* */ }
    o.onOpen?.();
    const first = pane === 'join' ? input : $('[data-act="create"]');
    first?.focus?.();
  }

  function close() {
    dialog.hidden = true;
    doc.body.classList.remove('klc-multi-open');
    finishCoach();
    o.onClose?.();
    try { opener?.focus?.(); } catch { /* the menu may have been rebuilt */ }
  }

  function hideResults() {
    results.hidden = true;
    results.classList.remove('show');
    doc.body.classList.remove('klc-multi-results');
  }

  function hideCard() {
    hub.hidden = true;
    hub.classList.remove('show');
  }

  function copyCode() {
    const code = $('[data-f="code"]').dataset.code || '';
    if (code.length < 4) return;
    const btn = $('[data-act="copy"]');
    const done = (ok) => {
      label(btn, ok ? t('play.multi.copied') : t('play.multi.copy'));
      if (ok) finishCoach();
      setTimeout(() => label(btn, t('play.multi.copy')), 1200);
    };
    const clip = doc.defaultView?.navigator?.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      Promise.resolve(clip.writeText(code)).then(() => done(true)).catch(() => fallback());
      return;
    }
    fallback();
    function fallback() {
      let ok = false;
      try {
        const ta = doc.createElement('textarea');
        ta.value = code;
        root.appendChild(ta);
        ta.focus?.();
        const sel = doc.defaultView?.getSelection?.();
        if (ta.select) ta.select();
        ok = !!(doc.execCommand && doc.execCommand('copy'));
        if (sel && ta.remove) { /* selection left as it was */ }
        ta.remove();
      } catch { ok = false; }
      done(ok);
    }
  }

  function runCount(el, ms, animate) {
    const raf = doc.defaultView?.requestAnimationFrame || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    if (!animate || reduce() || !raf) { el.textContent = formatTime(ms); return; }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 500);
      const eased = 1 - (1 - k) * (1 - k);
      el.textContent = formatTime(ms * eased);
      if (k < 1) raf(step);
    };
    raf(step);
  }

  function showResults(spec) {
    hideCard();
    results.hidden = false;
    doc.body.classList.add('klc-multi-results');
    $('[data-f="results-title"]').textContent = spec.title || '';
    const medal = $('[data-f="medal"]');
    const rows = spec.rows || [];
    medal.hidden = rows.length === 0;
    medal.classList.toggle('drop', !reduce() && rows.length > 0);
    if (spec.medalLabel) medal.setAttribute('aria-label', spec.medalLabel);
    const firstMs = rows.length ? rows[0][1] : 0;
    const hero = $('[data-f="hero"]');
    if (rows.length) runCount(hero, firstMs, spec.animate);
    else hero.textContent = '';
    const winner = $('[data-f="winner"]');
    winner.textContent = rows.length ? spec.nameOf(rows[0][0]) : '';
    const hanko = $('[data-f="hanko"]');
    if (spec.stamp) {
      hanko.hidden = false;
      hanko.textContent = spec.stamp;
      hanko.classList.toggle('land', !reduce());
    } else hanko.hidden = true;
    const list = $('[data-f="ranks"]');
    clear(list);
    for (let i = 0; i < rows.length; i++) {
      const li = doc.createElement('li');
      if (spec.youId != null && rows[i][0] === spec.youId) li.className = 'you';
      if (i === 0) {
        const m = doc.createElement('span');
        m.className = 'mini';
        m.setAttribute('aria-hidden', 'true');
        m.textContent = '金';
        li.appendChild(m);
      }
      const mid = doc.createElement('span');
      mid.className = 'mid';
      const name = doc.createElement('span');
      name.className = 'who';
      name.textContent = spec.nameOf(rows[i][0]);
      mid.appendChild(name);
      if (i === 0 && spec.fastest) {
        const f = doc.createElement('span');
        f.className = 'fast';
        f.textContent = spec.fastest;
        mid.appendChild(f);
      }
      li.appendChild(mid);
      const b = doc.createElement('b');
      runCount(b, rows[i][1], spec.animate);
      li.appendChild(b);
      list.appendChild(li);
    }
    const pending = spec.pending || [];
    for (let i = 0; i < pending.length; i++) {
      const li = doc.createElement('li');
      const mid = doc.createElement('span');
      mid.className = 'mid';
      const name = doc.createElement('span');
      name.className = 'who';
      name.textContent = pending[i];
      mid.appendChild(name);
      const b = doc.createElement('b');
      b.textContent = spec.pendingLabel || '';
      li.appendChild(mid);
      li.appendChild(b);
      list.appendChild(li);
    }
    label($('[data-act="again"]'), spec.again || '');
    label($('[data-act="dismiss"]'), spec.quit || '');
    results.classList.remove('show');
    const reveal = () => results.classList.add('show');
    const raf = doc.defaultView?.requestAnimationFrame;
    if (reduce() || !raf) reveal();
    else raf(reveal);
    $('[data-act="again"]')?.focus?.();
  }

  root.addEventListener('click', (e) => {
    if (e.target === dialog) { close(); return; }
    if (e.target === results) { hideResults(); o.onDismiss?.(); return; }
    if (e.target === hub) { hideCard(); return; }
    const b = e.target.closest?.('button') || (e.target?.dataset?.act ? e.target : null);
    if (e.target === coachEl) { finishCoach(); return; }
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'close') close();
    else if (act === 'create') { setError(''); showPane('room'); o.onCreate?.(); }
    else if (act === 'join') { setError(''); showPane('join'); input.focus?.(); }
    else if (act === 'back') { setError(''); showPane('home'); }
    else if (act === 'enter') o.onJoin?.(input.value);
    else if (act === 'leave') o.onLeave?.();
    else if (act === 'copy') copyCode();
    else if (act === 'go') { finishCoach(); o.onRace?.('car'); }
    else if (act === 'goal') o.onGoal?.();
    else if (act === 'again') o.onAgain?.();
    else if (act === 'dismiss') { hideResults(); o.onDismiss?.(); }
    else if (b.dataset.s != null) o.onStamp?.(Number(b.dataset.s));
    else if (b.dataset.course) { finishCoach(); o.onRace?.(b.dataset.course); }
  });
  input.addEventListener('input', () => {
    const clean = String(input.value || '').toUpperCase().replace(/[^ACDEFHJKMNPQRTUVWXY3479]/g, '').slice(0, 4);
    if (input.value !== clean) input.value = clean;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); o.onJoin?.(input.value); }
  });
  doc.addEventListener('keydown', (e) => {
    const typing = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '');
    const go = $('[data-act="go"]');
    if (e.key === 'Enter' && !typing && dialog.hidden && results.hidden && hub.hidden && go && !go.hidden) {
      e.preventDefault();
      finishCoach();
      o.onRace?.('car');
      return;
    }
    if (dialog.hidden && countEl.hidden && results.hidden && hub.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!results.hidden) { hideResults(); o.onDismiss?.(); return; }
      if (!hub.hidden) { hideCard(); return; }
      if (!dialog.hidden) close();
      return;
    }
    if (typing) return;
    const onButton = e.target?.closest?.('#klc-multi button');
    if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'Tab' && (!dialog.hidden || !results.hidden || !hub.hidden)) {
      const nodes = [];
      const found = root.querySelectorAll('button, input');
      for (let i = 0; i < found.length; i++) {
        const el = found[i];
        if (el.hidden || el.closest('[hidden]')) continue;
        nodes.push(el);
      }
      if (!nodes.length) { e.preventDefault(); e.stopPropagation(); return; }
      const i = nodes.indexOf(doc.activeElement);
      const next = nodes[(i + (e.shiftKey ? nodes.length - 1 : 1)) % nodes.length];
      e.preventDefault();
      e.stopPropagation();
      next.focus?.();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, true);

  paint();

  return {
    root,
    tags: $('[data-f="tags"]'),
    open, close, paint,
    showHome() { setError(''); showPane('home'); },
    showJoin() { showPane('join'); },
    showRoom() { showPane('room'); },
    setError,
    setCode(code) {
      const el = $('[data-f="code"]');
      const s = String(code || '');
      el.dataset.code = s;
      clear(el);
      if (!s || s === '…' || s.length < 4) { el.textContent = s; return; }
      for (let i = 0; i < s.length; i++) {
        const ch = doc.createElement('span');
        ch.className = 'ch';
        ch.textContent = s[i];
        el.appendChild(ch);
      }
    },
    setYou(text) { $('[data-f="you"]').textContent = text || ''; },
    setQr(svg) { const q = $('[data-f="qr"]'); q.innerHTML = svg || ''; },
    setPeers(html) { $('[data-f="peers"]').innerHTML = html; },
    setHost(on, note) {
      $('[data-f="race"]').hidden = !on;
      const w = $('[data-f="wait"]');
      w.hidden = !!on;
      if (note) w.textContent = note;
    },
    setBusy(on) {
      $('[data-act="create"]').disabled = on;
      $('[data-act="enter"]').disabled = on;
    },
    setPeople(text, show) {
      peopleEl.textContent = text || '';
      peopleEl.hidden = !show;
    },
    setClock(on) {
      clockOn = !!on;
      if (!clockOn) {
        countEl.hidden = true;
        phase = '';
        doc.body.classList.remove('klc-multi-counting');
      }
    },
    setPhase(next, goWord) {
      if (!clockOn) { countEl.hidden = true; phase = ''; doc.body.classList.remove('klc-multi-counting'); return 'done'; }
      if (next === phase) return phase;
      phase = next;
      const show = next === '3' || next === '2' || next === '1' || next === 'go';
      countEl.hidden = !show;
      doc.body.classList.toggle('klc-multi-counting', show);
      countEl.classList.toggle('go', next === 'go');
      countEl.textContent = next === 'go' ? (goWord || 'GO!') : (show ? next : '');
      if (show && !reduce()) {
        countEl.classList.remove('beat');
        void countEl.offsetWidth;
        countEl.classList.add('beat');
      } else countEl.classList.remove('beat');
      if (next === 'go' && !reduce()) {
        flash.hidden = false;
        flash.classList.add('on');
        setTimeout(() => { flash.classList.remove('on'); flash.hidden = true; }, 160);
      }
      return phase;
    },
    setRoom(on) { doc.body.classList.toggle('klc-multi-room', !!on); },
    setLive(on) {
      doc.body.classList.toggle('klc-multi-race', !!on);
      if (!on) {
        const clock = $('[data-f="race-time"]');
        clock.hidden = true;
        clock.textContent = '';
      }
    },
    setRaceTime(text, show) {
      const clock = $('[data-f="race-time"]');
      clock.textContent = text || '';
      clock.hidden = !show;
    },
    setGo(show, host) {
      const go = $('[data-act="go"]');
      const wait = $('[data-f="wait-float"]');
      go.hidden = !(show && host);
      wait.hidden = !(show && !host);
    },
    setGoal(on) { $('[data-act="goal"]').hidden = !on; },
    showCoach(text) {
      if (coachTimer) { clearTimeout(coachTimer); coachTimer = 0; }
      coachEl.hidden = false;
      coachEl.dataset.full = text || '';
      if (!doc.defaultView || reduce()) { coachEl.textContent = text || ''; return; }
      coachEl.textContent = '';
      let i = 0;
      const step = () => {
        if (coachEl.hidden) return;
        i += 1;
        coachEl.textContent = String(text || '').slice(0, i);
        if (i < String(text || '').length) coachTimer = setTimeout(step, 42);
      };
      step();
    },
    hideCoach() { finishCoach(); },
    showResults,
    hideResults,
    showCard(spec, lang) {
      fillCard(hub, spec, lang || o.lang || 'ja');
      hub.hidden = false;
      const reveal = () => hub.classList.add('show');
      const raf = doc.defaultView?.requestAnimationFrame;
      if (!raf) reveal();
      else raf(reveal);
    },
    hideCard,
    codePoint() {
      const el = $('[data-f="code"]');
      const r = el.getBoundingClientRect?.();
      if (!r) return { x: 0, y: 0 };
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    get coachHidden() { return coachEl.hidden; },
    get hidden() { return dialog.hidden; },
    get resultsHidden() { return results.hidden; },
    reduce,
  };
}
