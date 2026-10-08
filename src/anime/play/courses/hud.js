// [play:courses] The race HUD. The giant clock stays: Dela Gothic One, a 紺 stroke,
// the gate line under it, a split for 1.2 s. やめる is a 56 px back arrow (PLAY-UI-STYLE).
// The countdown, the result card and the action cluster belong to the kit.

import { writeTime, SPLIT_HOLD_MS, RETRY_FADE_S } from './logic.js';
import { splitText, splitFaster } from '../kit/format.js';

const FONT = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&display=swap';

/** Back arrow, 2 px stroke. The face is 56 px; the word sits under it. */
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M15 6 9 12l6 6"/></svg>';

const CSS = /* css */`
#course-hud { position: fixed; left: 50%; top: calc(64px + env(safe-area-inset-top, 0px)); transform: translateX(-50%);
  z-index: 8; width: min(calc(100vw - 120px), 640px); text-align: center; pointer-events: none;
  font-family: "Dela Gothic One", "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#course-hud[hidden] { display: none !important; }
#course-hud .time { margin: 0; color: #FBFAF5; font: 400 clamp(48px, 13vw, 88px)/0.9 "Dela Gothic One", "Zen Maru Gothic", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0.01em;
  -webkit-text-stroke: clamp(4px, 0.9vw, 8px) #223A70; paint-order: stroke fill;
  text-shadow: 0 4px 0 #17184B; }
#course-hud .line { margin: 4px 0 0; color: #FBFAF5; font: 400 clamp(18px, 4.4vw, 28px)/1.2 "Dela Gothic One", "Zen Maru Gothic", sans-serif;
  -webkit-text-stroke: 3px #223A70; paint-order: stroke fill; text-shadow: 0 2px 0 #17184B; }
#course-hud .split { margin: 4px 0 0; min-height: 1.15em; font: 400 clamp(22px, 5vw, 32px)/1 "Dela Gothic One", "Zen Maru Gothic", sans-serif;
  font-variant-numeric: tabular-nums; opacity: 0; }
#course-hud .split.fast { color: #00A3AF; -webkit-text-stroke: 3px #17184B; paint-order: stroke fill; }
#course-hud .split.slow { color: #B7282E; -webkit-text-stroke: 3px #17184B; paint-order: stroke fill; }
#course-hud .split.show { animation: course-split 1.2s cubic-bezier(0.23, 1, 0.32, 1) both; }
@keyframes course-split { 0% { transform: scale(1.18); opacity: 0; } 16% { transform: none; opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; } }
#course-quit { position: fixed; top: calc(8px + env(safe-area-inset-top, 0px)); right: calc(12px + env(safe-area-inset-right, 0px));
  z-index: 8; width: 64px; min-height: 76px; padding: 0; border: 0; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px; color: #223A70;
  font: 700 12px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; }
#course-quit .face { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(251, 250, 245, 0.94); color: #223A70;
  box-shadow: 0 4px 12px rgba(23, 24, 75, 0.35), inset 0 0 0 2px rgba(255, 255, 255, 0.7);
  outline: 1px solid rgba(23, 24, 75, 0.4); }
#course-quit svg { width: 26px; height: 26px; }
#course-quit .nm { color: #FBFAF5; font: 700 12px/1.2 "Zen Maru Gothic", "Noto Sans JP", sans-serif;
  -webkit-text-stroke: 3px #223A70; paint-order: stroke fill; text-shadow: 0 1px 0 #17184B; }
#course-quit kbd { font: 700 12px/1 "Noto Sans JP", sans-serif; color: #223A70; background: rgba(251, 250, 245, 0.94);
  border: 1px solid rgba(23, 24, 75, 0.28); border-radius: 4px; padding: 2px 4px; }
#course-quit:active .face { transform: scale(0.94); }
#course-quit:focus-visible { outline: none; }
#course-quit:focus-visible .face { outline: 2px solid #223A70; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255,255,255,.92), 0 4px 12px rgba(23, 24, 75, 0.35); }
#course-quit[hidden] { display: none !important; }
#course-fade { position: fixed; inset: 0; z-index: 6; background: #FBFAF5; opacity: 0; pointer-events: none; }
body.klc-racing #klc-play .topbar,
body.klc-racing #klc-play .book,
body.klc-racing #klc-play .counters { visibility: hidden; }
#klc-play .cluster kbd { font-size: 12px; }
#klc-play .veil.results .hanko { margin: 28px auto 18px; }
#klc-play .course-card { display: grid; grid-template-columns: 72px 1fr; gap: 12px; align-items: center;
  margin: 0 0 12px; padding: 12px; border-radius: 16px; background: rgba(255,255,255,.55); }
#klc-play .course-medal { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
  border: 3px solid #223A70; font: 400 22px/1 "Dela Gothic One", "Zen Maru Gothic", sans-serif; color: #17184B; background: transparent; }
#klc-play .course-medal.gold { background: #F8B500; }
#klc-play .course-medal.silver { background: #C9CDD6; }
#klc-play .course-medal.bronze { background: #C8763F; }
#klc-play .course-card h3 { margin: 0 0 4px; font: 700 16px/1.3 "Zen Maru Gothic", "Noto Sans JP", sans-serif; color: #1f3a68; }
#klc-play .course-card p { margin: 0; font-variant-numeric: tabular-nums; color: #2d3350; }
#course-local { position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 8; pointer-events: none;
  color: #FBFAF5; font: 400 clamp(72px, 16vw, 128px)/1 "Dela Gothic One", "Zen Maru Gothic", sans-serif;
  -webkit-text-stroke: 10px #223A70; paint-order: stroke fill; text-shadow: 0 6px 0 #17184B; }
#course-local[hidden] { display: none !important; }
#course-go { position: fixed; left: 50%; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  z-index: 8; min-height: 44px; padding: 0 22px; border: 0; border-radius: 16px; background: #c4521f; color: #fff;
  font: 700 16px/1 "Zen Maru Gothic", "Noto Sans JP", sans-serif; cursor: pointer; }
#course-go[hidden] { display: none !important; }
@media (max-width: 420px) {
  #course-hud { left: 50%; transform: translateX(-50%); top: calc(64px + env(safe-area-inset-top, 0px));
    width: calc(100vw - 96px); text-align: center; }
  #course-hud .time { font-size: 40px; -webkit-text-stroke-width: 4px; text-shadow: 0 3px 0 #17184B; }
  #course-hud .line { font-size: 16px; -webkit-text-stroke-width: 2px; }
}
@media (max-width: 720px) { #course-quit kbd { display: none; } }
@media (max-height: 420px) {
  #course-hud { top: calc(48px + env(safe-area-inset-top, 0px)); }
  #course-hud .time { font-size: 40px; }
  #course-hud .line, #course-hud .split { font-size: 16px; }
  #course-quit { min-height: 56px; }
  #course-quit .nm, #course-quit kbd { display: none; }
}
@media (pointer: coarse) { #course-quit kbd { display: none; } }
@media (prefers-reduced-motion: reduce) {
  #course-hud .split.show { animation: none; opacity: 1; }
  #course-fade { transition: none !important; }
  #course-quit:active .face { transform: none; }
}
`;

export function createHud(reduce) {
  if (typeof document === 'undefined') {
    const noop = () => {};
    return { root: null, quit: { hidden: true }, show: noop, hide: noop, setQuit: noop, setTime: noop, setLine: noop, split: noop, fade: noop, setRacing() {} };
  }
  if (!document.querySelector('link[data-course-font]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT;
    link.dataset.courseFont = '1';
    document.head.appendChild(link);
  }
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'course-hud';
  root.hidden = true;
  root.innerHTML = '<p class="time">0:00.00</p><p class="line"></p><p class="split"></p>';
  const timeEl = root.querySelector('.time');
  const lineEl = root.querySelector('.line');
  const splitEl = root.querySelector('.split');
  const quit = document.createElement('button');
  quit.type = 'button';
  quit.id = 'course-quit';
  quit.hidden = true;
  quit.setAttribute('aria-keyshortcuts', 'Escape');
  quit.innerHTML = '<span class="face">' + BACK + '</span><span class="nm"></span><kbd>Esc</kbd>';
  const fadeEl = document.createElement('div');
  fadeEl.id = 'course-fade';
  fadeEl.hidden = true;
  document.body.append(root, quit, fadeEl);

  const buf = ['0', ':', '0', '0', '.', '0', '0'];
  let shown = '';
  let splitTimer = 0;

  function paintTime(ms) {
    writeTime(ms, buf);
    let same = shown.length === 7;
    if (same) for (let i = 0; i < 7; i++) if (shown.charCodeAt(i) !== buf[i].charCodeAt(0)) { same = false; break; }
    if (same) return;
    shown = buf[0] + buf[1] + buf[2] + buf[3] + buf[4] + buf[5] + buf[6];
    timeEl.textContent = shown;
  }

  return {
    root,
    quit,
    show() {
      root.hidden = false;
      paintTime(0);
      document.body.classList.add('klc-racing');
    },
    setQuit(label) {
      const nm = quit.querySelector('.nm');
      if (nm) nm.textContent = label || '';
      quit.setAttribute('aria-label', label || '');
      quit.hidden = false;
    },
    hide() {
      root.hidden = true;
      quit.hidden = true;
      splitEl.textContent = '';
      splitEl.className = 'split';
      document.body.classList.remove('klc-racing');
    },
    setTime: paintTime,
    setLine(s) { if (lineEl.textContent !== s) lineEl.textContent = s; },
    split(ms, bestMs) {
      const text = splitText(ms, bestMs);
      if (splitTimer) { clearTimeout(splitTimer); splitTimer = 0; }
      if (!text) { splitEl.textContent = ''; splitEl.className = 'split'; return; }
      const fast = splitFaster(ms, bestMs);
      splitEl.textContent = text;
      splitEl.className = 'split show ' + (fast ? 'fast' : (text === '0.0' ? '' : 'slow'));
      splitTimer = setTimeout(() => {
        splitEl.className = 'split';
        splitEl.textContent = '';
        splitTimer = 0;
      }, SPLIT_HOLD_MS);
    },
    fade(seconds = RETRY_FADE_S) {
      if (reduce || !(seconds > 0)) { fadeEl.hidden = true; fadeEl.style.opacity = '0'; return; }
      fadeEl.hidden = false;
      fadeEl.style.transition = 'none';
      fadeEl.style.opacity = '0.72';
      requestAnimationFrame(() => {
        fadeEl.style.transition = 'opacity ' + seconds + 's linear';
        fadeEl.style.opacity = '0';
      });
    },
    setRacing(on) { document.body.classList.toggle('klc-racing', !!on); },
  };
}
