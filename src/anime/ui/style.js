// [v3:life] Minimal UI style: paper-glass pills over the scene, Zen Maru Gothic, navy ink (matches the intro board).
export const CSS = /* css */`
/* [ui-b2:6] One vocabulary of motion for everything the HUD, the explore UI, the ship UI, the story card and the pad draw (the UI round notes (ui-b2, not included)). It sits on :root so that every
   injected stylesheet resolves it; the pad keeps its own --ease / --pop (the same curve as --ease-out). A press takes --dur-press on --ease-out and a colour change --dur-fast;
   a surface enters in --dur-enter (a bottom sheet in --dur-sheet, from --shift below; a menu or a popover from --pop-scale, never from 0) and leaves faster.
   --ring-ink / --ring-halo are the two tones of the focus ring: navy between two white bands, legible on glass, on sky and on dark water.
   [ui-b2:14] --accent-fill is the one coral that carries white text (4.59:1; #e0703f was 3.2:1 and stays for marks without text: glows, rings, the minimap pin); -hover is the
   pressed / hovered shade (4.86:1) and -deep the foot of the pad's primary button (5.73:1). */
:root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --dur-press: 140ms; --dur-fast: 160ms; --dur-enter: 220ms; --dur-exit: 140ms; --dur-sheet: 280ms; --dur-sheet-exit: 200ms; --shift: 8px; --pop-scale: 0.95;
  --ring-ink: #1f3a68; --ring-halo: rgba(255, 255, 255, 0.92);
  --accent-fill: #c4521f; --accent-fill-hover: #b9531f; --accent-fill-deep: #b0431a; }
@media (prefers-reduced-motion: reduce) { :root { --shift: 0px; --pop-scale: 1; --dur-enter: 120ms; --dur-exit: 120ms; --dur-sheet: 120ms; --dur-sheet-exit: 120ms; --dur-fast: 120ms; --dur-press: 80ms; } }
html { overscroll-behavior: none; }   /* html is what the viewport reads for rubber-banding and pull-to-refresh; body alone does not reach it while html has overflow: hidden */
#klc-ui { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #55596f; --k-glass: rgba(250, 247, 241, 0.84); --k-glass-2: rgba(250, 247, 241, 0.94);
  --k-line: rgba(45, 51, 80, 0.12); --k-accent: #e0703f; --k-accent-2: #2f7fae; --k-sel: #1f3a68;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: var(--k-sans); color: var(--k-ink); -webkit-font-smoothing: antialiased; line-break: strict; }
#klc-ui[hidden], body.noui #klc-ui { display: none !important; }
#klc-ui * { box-sizing: border-box; }
/* [craft:C12] 禁則. auto-phrase keeps a heading's phrase together where the browser has it (Chromium). No keep-all fallback: WebKit (every iPhone) lacks auto-phrase, and keep-all there stops Japanese from wrapping at all, so it falls back to normal breaking with line-break: strict. Body text wraps on a phrase, not inside a word. */
#klc-ui :is(h2, h3, h4, .mark, .mhead b) { word-break: auto-phrase; text-wrap: balance; }
#klc-ui :is(p, li, .note, .help, .credits) { text-wrap: pretty; }
#klc-ui .attr, #klc-ui .credits { word-break: auto-phrase; overflow-wrap: normal; }
#klc-ui button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
/* [ui-b2:6] the two-tone focus ring (navy between two white bands: 2.1:1 on dark water before). A list row inside a scroller draws it inside, where the scroller cannot clip it. */
#klc-ui button:focus-visible, #klc-ui #quality:focus-visible, #klc-ui-restore:focus-visible, #klc-ui .attr a:focus-visible, #klc-ui .credits a:focus-visible { outline: 2px solid var(--ring-ink); outline-offset: 2px; box-shadow: 0 0 0 5px var(--ring-halo); }
#klc-ui .places li button:focus-visible { outline-offset: -2px; box-shadow: inset 0 0 0 4px var(--ring-halo); }
#klc-ui .glass { background: var(--k-glass); backdrop-filter: blur(10px) saturate(1.2); -webkit-backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.5) inset; }
#klc-ui svg { width: 18px; height: 18px; flex: none; }

/* brand + live chip */
#klc-ui .brand { position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); left: 20px; display: grid; gap: 10px; justify-items: start; }
#klc-ui .mark { position: relative; isolation: isolate; font: 900 30px/1 var(--k-round); letter-spacing: 0.06em; color: #fff; text-shadow: 0 2px 0 rgba(31, 58, 104, 0.55), 0 0 18px rgba(31, 58, 104, 0.35); white-space: nowrap; }
/* [ui-b2:14] A soft scrim under the wordmark: the white title and its 11 px subtitle sat on the bare sky (1.6:1 at the default 16:30 view, 2.0:1 at clear noon, on the pixels of the review). A navy veil,
   a plateau of .30 under the text that fades out about 110 px beyond it at the sides and 30 px above and below, lifts the contrast of the white with what is under the letters (the sky, the veil and
   the text's own shadow); the heavier subtitle and its tighter glow do the rest (numbers on the real scene: the UI round notes (ui-b2, not included)). It belongs to .mark, so it goes where the wordmark goes: not on
   a portrait phone (touchpad-style.js hides the mark there). pointer-events: none comes from #klc-ui. The subtitle's rule sits here, ahead of the original (which stays as it was), with .brand in its
   selector so that it wins whatever the order. */
#klc-ui .mark::before { content: ""; position: absolute; z-index: -1; inset: -48px -220px; background: radial-gradient(ellipse closest-side, rgba(24, 32, 62, 0.3) 0, rgba(24, 32, 62, 0.27) 44%, rgba(24, 32, 62, 0) 72%); }
#klc-ui .brand .chip, #klc-ui .brand .arrivals { position: relative; }   /* (.mark is positioned now, so it paints after the unpositioned chip and panel below it: they are positioned too, and come later in the tree, so the veil stays under them) */
#klc-ui .brand .mark small { font: 900 11px/1 var(--k-sans); color: #fff; text-shadow: 0 1px 0 rgba(31, 58, 104, 0.9), 0 0 6px rgba(31, 58, 104, 0.8); }
#klc-ui .mark small { display: block; margin-top: 6px; font: 800 11px/1 var(--k-sans); letter-spacing: 0.34em; color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 0 rgba(31, 58, 104, 0.8), 0 0 8px rgba(31, 58, 104, 0.6); }
#klc-ui .chip { display: inline-flex; align-items: center; min-height: 34px; gap: 10px; padding: 8px 14px 8px 12px; border-radius: 999px; font: 500 13px/1 var(--k-sans); font-variant-numeric: tabular-nums; white-space: nowrap; }
#klc-ui .chip .clock { font: 700 15px/1 var(--k-round); color: var(--k-navy); }
#klc-ui .chip .sep { width: 1px; height: 14px; background: var(--k-line); }
#klc-ui .chip .boats b { font-weight: 700; color: var(--k-navy); }
#klc-ui .tag { font: 700 10px/1 var(--k-sans); padding: 4px 7px; border-radius: 8px; background: #f3e1c9; color: #8a4b1f; letter-spacing: 0.04em; }
#klc-ui .tag.live { background: #d8ecdc; color: #2b6a3f; }
#klc-ui .caret { transition: transform .25s ease; opacity: .6; }
#klc-ui .chip[aria-expanded="true"] .caret { transform: rotate(180deg); }

/* arrivals panel */
#klc-ui .arrivals { width: min(360px, calc(100vw - 40px)); border-radius: 16px; padding: 12px 6px 8px 14px; pointer-events: auto; max-height: min(46vh, 380px); display: grid; grid-template-rows: auto auto 1fr; }
#klc-ui .arrivals[hidden] { display: none; }
/* [ui-b2:7] The popover grows out of the chip (top left, 220 ms in, 140 ms out). display holds while it fades (allow-discrete) and the entry starts from @starting-style: where either is
   missing it appears and disappears as before. The phone's ☰ menu, sheets and credits do the same from touchpad-style.js. */
@supports (transition-behavior: allow-discrete) {
  #klc-ui .arrivals { transform-origin: top left; transition: opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out), display var(--dur-enter) allow-discrete; }
  #klc-ui .arrivals[hidden] { opacity: 0; transform: scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5)); transition-duration: var(--dur-exit); }
  @starting-style { #klc-ui .arrivals:not([hidden]) { opacity: 0; transform: scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5)); } }
}
#klc-ui .arrivals h3 { margin: 0 8px 8px 0; font: 700 14px/1.2 var(--k-round); color: var(--k-navy); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
#klc-ui .arrivals ol { list-style: none; margin: 0; padding: 0 8px 0 0; overflow: auto; overscroll-behavior: contain; }
#klc-ui .arrivals .prov { margin: 0 8px 8px 0; font: 500 12px/1.45 var(--k-sans); color: var(--k-muted); }
#klc-ui .arrivals .prov[hidden] { display: none; }
#klc-ui .arrivals li { display: grid; grid-template-columns: 76px 1fr auto; gap: 2px 10px; padding: 7px 0; border-top: 1px solid var(--k-line); align-items: baseline; }
#klc-ui .arrivals li:first-child { border-top: 0; }
#klc-ui .arrivals .t { font: 700 13px/1.2 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
#klc-ui .arrivals .st { display: block; margin-top: 2px; font: 700 10px/1.2 var(--k-sans); color: #B7282E; }
#klc-ui .arrivals .v { font: 700 13px/1.3 var(--k-sans); }
#klc-ui .arrivals .k { font: 500 11px/1.3 var(--k-sans); color: var(--k-muted); text-align: right; white-space: nowrap; }
#klc-ui .arrivals .c { grid-column: 2 / 4; font: 500 11px/1.3 var(--k-sans); color: var(--k-muted); }

/* top-right tools */
#klc-ui .tools { position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); right: 18px; display: flex; gap: 8px; align-items: center; }
#klc-ui .round { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: var(--k-navy); }
#klc-ui .round.txt { width: auto; padding: 0 13px; border-radius: 999px; font: 700 12px/1 var(--k-sans); }
#klc-ui .round[aria-pressed="true"] { background: var(--k-navy); color: #fff; }
#klc-ui #quality { pointer-events: auto; font: 500 12px/1 var(--k-sans); color: var(--k-ink); background: var(--k-glass); border: 0; border-radius: 999px; padding: 11px 12px; box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14); }

/* bottom dock */
#klc-ui .dock { position: absolute; left: 50%; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; max-width: calc(100vw - 24px); }
#klc-ui .livebar { display: flex; align-items: center; gap: 2px; padding: 0 4px 0 8px; }
#klc-ui .dclock { font: 700 15px/1 var(--k-sans); font-variant-numeric: tabular-nums; color: var(--k-navy); min-width: 3.4em; }
#klc-ui .livechip { display: inline-flex; align-items: center; gap: 5px; flex: none; min-height: 44px; padding: 0 8px; font: 700 11px/1 var(--k-sans); letter-spacing: 0.06em; color: var(--k-navy); white-space: nowrap; }
#klc-ui .livechip[hidden] { display: none; }
#klc-ui .livechip i { width: 7px; height: 7px; border-radius: 50%; background: #B7282E; display: block; flex: none; }
#klc-ui .wxbtn { min-height: 44px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: var(--k-navy); font: 700 13px/1 var(--k-sans); font-variant-numeric: tabular-nums; }
#klc-ui .dock .back { min-height: 44px; }
#klc-ui .dock .back[hidden] { display: none; }
#klc-ui .wxpop { position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); margin: 0; padding: 8px 14px; border-radius: 999px; font: 600 12px/1.3 var(--k-sans); color: var(--k-navy); white-space: nowrap; pointer-events: none; }
#klc-ui .wxpop[hidden] { display: none; }
#klc-ui .seg { display: flex; gap: 2px; position: relative; }
#klc-ui .seg button { position: relative; display: grid; justify-items: center; gap: 3px; min-width: 64px; padding: 8px 12px 7px; border-radius: 999px; transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease, transform var(--dur-press) var(--ease-out); }
#klc-ui .seg button .ja { font: 700 14px/1 var(--k-round); }
#klc-ui .seg button .hm { font: 500 10px/1 var(--k-sans); color: var(--k-muted); font-variant-numeric: tabular-nums; }
/* [ui:hover] hover looks only where hovering is real: on a touch screen :hover sticks after a tap (iOS kept 写真 orange), which the old per-click rebuild used to hide */
@media (hover: hover) and (pointer: fine) { #klc-ui .seg button:hover { background: rgba(31, 58, 104, 0.07); } }
#klc-ui .seg button[aria-pressed="true"] { background: var(--k-sel); color: #fff; }
#klc-ui .seg button[aria-pressed="true"] .hm { color: rgba(255, 255, 255, 0.75); }
#klc-ui .seg .dot { position: absolute; top: 6px; right: 9px; width: 6px; height: 6px; border-radius: 50%; }
#klc-ui .dock .div { width: 1px; align-self: stretch; margin: 6px 4px; background: var(--k-line); }
#klc-ui .pill { display: inline-flex; align-items: center; gap: 7px; height: 42px; padding: 0 14px; border-radius: 999px; font: 700 13px/1 var(--k-round); color: var(--k-navy); white-space: nowrap; transition: background-color var(--dur-fast) ease, color var(--dur-fast) ease, transform var(--dur-press) var(--ease-out); }
@media (hover: hover) and (pointer: fine) { #klc-ui .pill:hover { background: rgba(31, 58, 104, 0.07); } }
#klc-ui .pill[aria-pressed="true"] { background: var(--k-sel); color: #fff; }
#klc-ui .pill.shoot { background: var(--accent-fill); color: #fff; }   /* [ui-b2:14] white on #e0703f was 3.2:1; on --accent-fill 4.59:1 */
@media (hover: hover) and (pointer: fine) { #klc-ui .pill.shoot:hover { background: var(--accent-fill-hover); } }

/* places */
#klc-ui .places { position: absolute; left: 20px; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); width: 212px; border-radius: 16px; padding: 12px 8px 8px; }
#klc-ui .places h3 { margin: 0 0 6px; }
#klc-ui .places .ph { width: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 10px 6px; border-radius: 12px; font: 700 12px/1 var(--k-sans); letter-spacing: 0.18em; color: var(--k-muted); }
#klc-ui .places .ph .cur { margin-left: auto; letter-spacing: 0.02em; font: 700 13px/1 var(--k-round); color: var(--k-navy); opacity: 0; transition: opacity .2s; }
#klc-ui .places .ph .caret { transition: transform .25s cubic-bezier(.2,.8,.2,1); }
#klc-ui .places .ph[aria-expanded="true"] .caret { transform: rotate(180deg); }
@media (hover: hover) and (pointer: fine) { #klc-ui .places .ph:hover { background: rgba(31, 58, 104, 0.06); } }
@media (min-width: 721px) {
  #klc-ui .places[data-open="false"] { padding-top: 8px; }
  #klc-ui .places[data-open="false"] ul { display: none; }
  #klc-ui .places[data-open="false"] h3 { margin-bottom: 2px; }
  #klc-ui .places[data-open="false"] .ph .cur { opacity: 1; }
}
#klc-ui .places ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; max-height: min(46vh, 420px); overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; }   /* [v4:explore] 7 stops + 40 real places */
#klc-ui .places li button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; text-align: left; font: 700 14px/1.2 var(--k-round); }
#klc-ui .places li button .n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font: 700 10px/1 var(--k-sans); background: rgba(31, 58, 104, 0.1); color: var(--k-navy); flex: none; }
#klc-ui .places li button small { display: block; margin-top: 2px; font: 500 10px/1.2 var(--k-sans); color: var(--k-muted); }
@media (hover: hover) and (pointer: fine) { #klc-ui .places li button:hover { background: rgba(31, 58, 104, 0.07); } }
#klc-ui .places li button[aria-current="true"] { background: rgba(31, 58, 104, 0.1); }
#klc-ui .places li button[aria-current="true"] .n { background: var(--k-navy); color: #fff; }
#klc-ui .places .auto { margin: 6px 2px 0; width: calc(100% - 4px); justify-content: center; height: 36px; background: rgba(31, 58, 104, 0.08); }
#klc-ui .places .auto[aria-pressed="true"] { background: var(--k-navy); color: #fff; }

#klc-ui .attr a { color: inherit; pointer-events: auto; text-decoration: underline; text-underline-offset: 2px; }   /* [v3:fix] licence link */
#klc-ui .attr { position: absolute; right: 18px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); font: 500 10px/1.4 var(--k-sans); color: #fff; text-shadow: 0 1px 2px rgba(20, 30, 60, 0.45), 0 0 5px rgba(20, 30, 60, 0.5); background: rgba(18, 26, 52, 0.62); border-radius: 999px; padding: 1px 9px; text-align: right; max-width: 46vw; }   /* [v3:polish3] readable on the light planet sky; [ui-b2:14] white on the pill was 1.9:1 over cloud and 3.0:1 over sky at .26, now 5.3 and 7.0 */
#klc-ui .help { position: absolute; right: 18px; bottom: calc(30px + env(safe-area-inset-bottom, 0px)); font: 500 11px/1.4 var(--k-sans); color: rgba(255, 255, 255, 0.95); text-shadow: 0 1px 2px rgba(31, 40, 70, 0.75); text-align: right; }
#klc-ui .note { position: absolute; left: 50%; top: calc(76px + env(safe-area-inset-top, 0px)); transform: translate(-50%, -6px); padding: 9px 16px; border-radius: 999px; font: 700 13px/1 var(--k-round); color: var(--k-navy); opacity: 0; transition: opacity .3s, transform .3s; }
#klc-ui .note.show { opacity: 1; transform: translate(-50%, 0); }
@media (max-width: 1780px) { #klc-ui .help { display: none; } #klc-ui .attr { left: 50%; right: auto; transform: translateX(-50%); text-align: center; max-width: 92vw; white-space: nowrap; bottom: calc(5px + env(safe-area-inset-bottom, 0px)); } #klc-ui .dock { bottom: calc(26px + env(safe-area-inset-bottom, 0px)); } #klc-ui .places { bottom: calc(26px + env(safe-area-inset-bottom, 0px)); } }
@media (pointer: coarse) { #klc-ui .help .desk { display: none; } }
@media (pointer: fine) { #klc-ui .help .touch { display: none; } }

/* phones */
@media (max-width: 720px) {
  #klc-ui .brand { left: 14px; top: calc(12px + env(safe-area-inset-top, 0px)); gap: 8px; }
  #klc-ui .mark { font-size: 21px; }
  #klc-ui .mark small { font-size: 8.5px; letter-spacing: 0.28em; margin-top: 4px; }
  #klc-ui .chip { font-size: 12px; gap: 8px; padding: 7px 11px 7px 10px; }
  #klc-ui .chip .clock { font-size: 13px; }
  #klc-ui .chip .wx { display: inline; }   /* [v3:fix] the weather stays in the chip on phones */
  #klc-ui .chip .sep.wx { display: inline-block; }
  #klc-ui .tools { right: 10px; top: calc(12px + env(safe-area-inset-top, 0px)); gap: 6px; flex-direction: column; }   /* [v3:fix] a column on the right edge: 44 px targets and the full chip both fit */
  #klc-ui .round { width: 44px; height: 44px; }   /* [v3:fix] 44 px touch targets */
  #klc-ui .round.txt { padding: 0 9px; font-size: 11.5px; }
  #klc-ui .round svg { width: 17px; height: 17px; }
  #klc-ui #quality, #klc-ui .help { display: none; }
  #klc-ui .dock { left: 10px; right: 10px; transform: none; bottom: calc(26px + env(safe-area-inset-bottom, 0px)); border-radius: 22px; flex-wrap: wrap; justify-content: center; padding: 6px; max-width: none; }
  #klc-ui .livebar { width: 100%; justify-content: center; }
  #klc-ui .wxpop { white-space: normal; max-width: calc(100vw - 36px); text-align: center; }
  #klc-ui .seg { width: 100%; justify-content: space-between; }
  #klc-ui .seg button { min-width: 0; flex: 1; padding: 8px 2px 7px; }
  #klc-ui .seg button .ja { font-size: 13px; }
  #klc-ui .dock .div { display: none; }
  #klc-ui .pill { height: 38px; padding: 0 12px; font-size: 12.5px; }
  #klc-ui .places { left: 10px; right: 10px; width: auto; bottom: calc(146px + env(safe-area-inset-bottom, 0px)); padding: 6px; border-radius: 999px; }
  #klc-ui .places h3 { display: none; }
  #klc-ui .places ul { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity; pointer-events: auto;
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 44px), transparent); mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 44px), transparent); padding-right: 36px; }   /* [v3:fix] the faded edge says "scroll" */
  #klc-ui .places ul::-webkit-scrollbar { display: none; }
  #klc-ui .places li button { padding: 7px 12px 7px 7px; min-height: 44px; border-radius: 999px; white-space: nowrap; font-size: 13px; scroll-snap-align: start; }
  #klc-ui .places li button small { display: none; }
  #klc-ui .places .auto { display: none; }
  #klc-ui .attr { left: 12px; right: 12px; transform: none; white-space: normal; bottom: calc(6px + env(safe-area-inset-bottom, 0px)); text-align: center; max-width: none; font-size: 9px; border-radius: 12px; }
  #klc-ui .arrivals { max-height: 42vh; }
}
/* [v3:fix] narrow phones: the 出典 credit wraps to two lines; lift the dock and the places strip above it (they clipped it) */
@media (max-width: 480px) {
  #klc-ui .attr { font-size: 8.5px; line-height: 1.3; bottom: calc(4px + env(safe-area-inset-bottom, 0px)); }
  #klc-ui .attr a { white-space: nowrap; }
  #klc-ui .dock { bottom: calc(34px + env(safe-area-inset-bottom, 0px)); }
  #klc-ui .places { bottom: calc(154px + env(safe-area-inset-bottom, 0px)); }
}
/* [integrate] the phone's ☰ menu button, the menu's head and labels, its 名所 and 操作設定 rows and the time sheet's 今日の入船 exist only for a portrait phone with the pad
   (touchpad-style.js turns them on) */
#klc-ui .mbtn, #klc-ui .mhead, #klc-ui .tools .lbl, #klc-ui .tools .prow, #klc-ui .tools .pset, #klc-ui .dock .arr { display: none; }
/* [emil-ui] The HUD is a game's, not a web page's (lanes/emil-ui.md):
   - no wordmark over the town: the title screen carries the name;
   - one clock on the screen, the chip's: the time dock's copy goes;
   - a timed run (#klc-play.timing: a course, a race) is the whole game for its minute. The explore chrome steps back; the run's own HUD (the timer, the rings, やめる),
     the stick and the actions, the minimap and the credit line stay. */
#klc-ui .brand .mark { display: none; }
#klc-ui .livebar .dclock { display: none; }
body:has(#klc-play.timing) #klc-ui :is(.brand, .mbtn, .tools, .dock, .places, .help, .arrivals), body:has(#klc-play.timing) #klc-x .xbar { visibility: hidden; }
/* [emil-ui] while the ☰, a sheet or the credits are open (modal: the pad steps aside), the world's quest markers step back; they draw above the HUD (#klc-m, z-index 8) and covered the menu's rows */
body:has(#klc-ui:is([data-menu="1"], [data-sheet="time"], [data-sheet="places"], [data-credits="1"])) #klc-m { visibility: hidden; }
body.klc-ui #corner, body.klc-ui #help, body.klc-ui #credit { display: none !important; }
#klc-ui .tools .cbtn, #klc-ui .credits { display: none; }   /* [integrate:fix] the ⓘ credits item and its sheet: the portrait phone only (touchpad-style.js) */
#klc-ui-restore { display: none; position: fixed; z-index: 5; top: calc(18px + env(safe-area-inset-top, 0px)); right: 18px; width: 38px; height: 38px; border: 0; border-radius: 50%;
  background: rgba(250, 247, 241, 0.9); color: #1f3a68; opacity: 0.8; cursor: pointer; place-items: center; }   /* [ui-b2:14] it is the only way back: the icon on its disc was 2.1:1 by day and 1.2:1 at night at .28 / .45, now 6:1 */
#klc-ui-restore svg { width: 18px; height: 18px; }
body.klc-pad #klc-ui-restore { top: calc(14px + env(safe-area-inset-top, 0px)); right: 14px; width: 44px; height: 44px; }   /* [integrate:fix] a 44 px touch target on the phone only; the desktop eye is as at 8262120 */
body.klc-pad #klc-ui-restore svg { width: 20px; height: 20px; }
#klc-ui-restore:focus-visible { opacity: 0.9; } @media (hover: hover) and (pointer: fine) { #klc-ui-restore:hover { opacity: 0.9; } }
body.noui.playing #klc-ui-restore { display: grid; }
body.shot #klc-ui-restore { display: none !important; }
body.klc-ui #toast { left: 50%; transform: translateX(-50%); top: calc(18px + env(safe-area-inset-top, 0px)); }
@media (max-width: 720px) { body.klc-ui #toast { display: none; } }   /* [v3:fix] phones: the places strip names the spot; the toast floated in the sky */
@media (prefers-reduced-motion: reduce) { #klc-ui * { transition: none !important; } }
/* [ui-b2:7] hud.js sets data-still on #klc-ui for two frames after render() has replaced the markup (a language change): the open menu or popover is then a new node, and its entry
   transition must not play again. Inert until hud.js does (the UI round notes (ui-b2, not included), Requests). */
#klc-ui[data-still], #klc-ui[data-still] * { transition: none !important; }

/* [ui-b2:6] The press layer. Every HUD button answers a press at once: scale(0.97) in --dur-press on the strong ease-out, and a colour change in --dur-fast. The list rows (a stop,
   a search result) and the phone's ☰ menu rows (touchpad-style.js) press with a background instead: a scaled row inside a scroller reads as a glitch. 「まちへ出る」 presses too
   (its base rules are in index.html). iOS paints :active only while the document has a touch listener; the pad's harden() registers one. */
#klc-ui button { transition: transform var(--dur-press) var(--ease-out), background-color var(--dur-fast) ease, color var(--dur-fast) ease; }
#klc-ui-restore { transition: transform var(--dur-press) var(--ease-out), opacity var(--dur-fast) ease; }
#klc-ui button:active, #klc-ui-restore:active { transform: scale(0.97); }
#klc-ui .places li button:active { transform: none; background: rgba(31, 58, 104, 0.12); }
#go { transition: opacity .3s, transform var(--dur-press) var(--ease-out); }
#go:enabled:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) { #go:focus-visible { outline: 2px solid var(--ring-ink); outline-offset: 2px; box-shadow: 0 0 0 5px var(--ring-halo); } }   /* (a touch screen shows no ring on it: round 1's rule in index.html, which lane C pasted there in round 2; this one is scoped to hover devices so that the order of the two sheets cannot bring a ring back on a touch screen) */

/* [contrib] the 「修正を報告」 button (hud.js data-act="report"). On a wide screen it floats left of the toolbar, out of its flow, so no existing control moves;
   in the phone's ☰ menu it is the last item (touchpad-style.js lists it like the others); in the narrow column (no pad) it is the last button. */
#klc-ui .tools .rep { position: absolute; top: 0; right: calc(100% + 8px); width: auto; height: 38px; padding: 0 15px 0 12px; border-radius: 999px; display: inline-flex; align-items: center; gap: 7px; font: 700 12.5px/1 var(--k-round); color: var(--k-navy); white-space: nowrap; }
#klc-ui .tools .rep svg { color: var(--accent-fill); }
#klc-ui .tools .rep .lbl { display: inline; }
@media (hover: hover) and (pointer: fine) { #klc-ui .tools .rep:hover { background: rgba(255, 255, 255, 0.97); } }
@media (max-width: 1180px) { #klc-ui .tools .rep { width: 38px; padding: 0; justify-content: center; } #klc-ui .tools .rep .lbl { display: none; } }
@media (max-width: 720px) { #klc-ui .tools .rep { position: static; width: 44px; height: 44px; } }
@media (min-width: 721px) { body.klc-pad #klc-ui .tools .rep { top: -3px; width: 44px; height: 44px; } }   /* a 44 px target on a touch screen (a tablet, a landscape phone) */
/* 721-839 px: the toolbar fills the width to the wordmark, so the button drops under the search / map / drive row (still out of the toolbar's flow) */
@media (min-width: 721px) and (max-width: 839px) { #klc-ui .tools .rep { top: 94px; right: 0; } body.klc-pad #klc-ui .tools .rep { top: 92px; } }
body.klc-contrib-open #klc-ui-restore { display: none !important; }

`;

/* [contrib] The 「修正を報告」 sheet (ui/contrib.js, markup in ui/contrib-view.js): the HUD's paper glass, navy ink, coral accents, round Zen Maru Gothic.
   Three layouts, all by size (not by the pad): a panel docked right (desktop), a card at the bottom (a narrow window, a phone upright: the same rounded
   floating card as the HUD's sheets, inside the safe area) and a wide card for a phone on its side. Only transforms and opacity animate. */
export const CONTRIB_CSS = /* css */`
#klc-contrib { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #5d6179; --k-glass: rgba(250, 247, 241, 0.96); --k-line: rgba(45, 51, 80, 0.14); --k-accent: #e0703f; --k-blue: #2f7fae;
  --k-ok: #2b6a3f; --k-err: #a73a2b; --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  --ease: cubic-bezier(0.23, 1, 0.32, 1); --pop: cubic-bezier(0.34, 1.56, 0.64, 1); --kc-tap: 40px; --kc-kb: 0px;
  position: fixed; inset: 0; z-index: 60; pointer-events: none; visibility: hidden; font-family: var(--k-sans); color: var(--k-ink); -webkit-font-smoothing: antialiased; transition: visibility 0s .34s; }
#klc-contrib[data-open="1"] { visibility: visible; pointer-events: auto; transition: visibility 0s; }
#klc-contrib * { box-sizing: border-box; }
#klc-contrib { line-break: strict; word-break: auto-phrase; }   /* [craft:C12] 禁則: phrase breaks where the browser has auto-phrase, strict 禁則 everywhere */
#klc-contrib p { text-wrap: pretty; }
#klc-contrib button, #klc-contrib label { -webkit-tap-highlight-color: transparent; }
#klc-contrib button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; touch-action: manipulation; }
#klc-contrib button:disabled { cursor: default; }
#klc-contrib :focus-visible { outline: 2px solid var(--k-blue); outline-offset: 2px; }
#klc-contrib .kc-sheet:focus, #klc-contrib [tabindex="-1"]:focus { outline: none; }
#klc-contrib .kc-scrim { position: absolute; inset: 0; background: rgba(22, 30, 60, 0.34); opacity: 0; transition: opacity .3s var(--ease); }
#klc-contrib[data-open="1"] .kc-scrim { opacity: 1; }

/* the sheet: header, one scrolling body, footer */
#klc-contrib .kc-sheet { position: absolute; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border-radius: 22px; background: var(--k-glass);
  -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); box-shadow: 0 18px 50px rgba(35, 40, 70, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  opacity: 0; transform: translate3d(28px, 0, 0); transition: opacity .28s var(--ease), transform .36s var(--ease); }
#klc-contrib[data-open="1"] .kc-sheet { opacity: 1; transform: none; }
@media (min-width: 721px) and (min-height: 521px) {
  #klc-contrib .kc-sheet { top: calc(18px + env(safe-area-inset-top, 0px)); right: calc(18px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px)); width: min(440px, calc(100vw - 36px)); }
}
@media (max-width: 720px) {
  #klc-contrib { --kc-tap: 44px; }
  #klc-contrib .kc-sheet { left: max(10px, env(safe-area-inset-left, 0px)); right: max(10px, env(safe-area-inset-right, 0px)); bottom: calc(10px + env(safe-area-inset-bottom, 0px) + var(--kc-kb, 0px));
    height: min(780px, calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - var(--kc-kb, 0px))); transform: translate3d(0, 40px, 0); }
}
@media (orientation: landscape) and (max-height: 520px) {
  #klc-contrib { --kc-tap: 44px; }
  #klc-contrib .kc-sheet { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: calc(8px + env(safe-area-inset-bottom, 0px) + var(--kc-kb, 0px)); height: auto; left: calc(10px + env(safe-area-inset-left, 0px)); right: calc(10px + env(safe-area-inset-right, 0px));
    width: min(780px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); margin: 0 auto; transform: translate3d(0, 28px, 0); }
}
@media (pointer: coarse) { #klc-contrib { --kc-tap: 44px; } }
body.klc-pad #klc-contrib { --kc-tap: 44px; }
@media (hover: hover) and (pointer: fine) { body:not(.klc-pad) #klc-contrib [data-only-touch] { display: none; } }   /* the camera button is for phones (and ?touch=1) */

#klc-contrib .kc-head { padding: 12px 14px 10px 18px; display: grid; gap: 8px; border-bottom: 1px solid var(--k-line); }
#klc-contrib .kc-title { display: flex; align-items: center; gap: 6px; min-height: var(--kc-tap); }
#klc-contrib h2 { margin: 0; flex: 1 1 auto; min-width: 0; font: 900 18px/1.25 var(--k-round); letter-spacing: 0.04em; color: var(--k-navy); }
#klc-contrib .kc-x, #klc-contrib .kc-lang { flex: none; display: grid; place-items: center; min-width: var(--kc-tap); height: var(--kc-tap); border-radius: 999px; color: var(--k-navy); }
#klc-contrib .kc-x { width: var(--kc-tap); border-radius: 50%; }
#klc-contrib .kc-lang { padding: 0 12px; font: 700 12px/1 var(--k-sans); background: rgba(31, 58, 104, 0.07); }
@media (hover: hover) and (pointer: fine) { #klc-contrib .kc-x:hover, #klc-contrib .kc-lang:hover { background: rgba(31, 58, 104, 0.13); } }
#klc-contrib svg { width: 20px; height: 20px; flex: none; }
#klc-contrib .kc-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: rgba(31, 58, 104, 0.07); }
#klc-contrib .kc-tab { flex: 1 1 0; min-width: 0; min-height: var(--kc-tap); padding: 0 6px; border-radius: 999px; font: 700 13px/1.1 var(--k-round); color: var(--k-navy); transition: background .2s, color .2s; }
#klc-contrib .kc-tab[aria-selected="true"] { background: var(--k-navy); color: #fff; box-shadow: 0 4px 12px rgba(31, 58, 104, 0.28); }
#klc-contrib .kc-warn { margin: 0; padding: 6px 12px; border-radius: 12px; background: #f3e1c9; color: #7a3f17; font: 700 12px/1.4 var(--k-sans); }

#klc-contrib .kc-body { overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 14px 18px 20px; scroll-padding: 12px; }
#klc-contrib .kc-form { display: grid; gap: 18px; }
#klc-contrib .kc-fs { margin: 0; padding: 0; border: 0; min-width: 0; display: grid; gap: 8px; }
#klc-contrib .kc-fs > legend { padding: 0; float: left; width: 100%; margin-bottom: 8px; }
#klc-contrib .kc-fs > legend + * { clear: both; }
#klc-contrib .kc-label { display: block; font: 700 14px/1.35 var(--k-round); color: var(--k-navy); }
#klc-contrib .kc-hint { margin: 0; font: 500 12.5px/1.6 var(--k-sans); color: var(--k-muted); }
#klc-contrib .kc-count { margin: 0; font: 500 12px/1 var(--k-sans); color: var(--k-muted); text-align: right; font-variant-numeric: tabular-nums; }
#klc-contrib .kc-err { margin: 0; font: 700 12.5px/1.5 var(--k-sans); color: var(--k-err); }
#klc-contrib [hidden] { display: none !important; }
#klc-contrib .kc-field { display: grid; gap: 6px; }
#klc-contrib input[type="text"], #klc-contrib textarea { width: 100%; font: 500 16px/1.4 var(--k-sans); color: var(--k-ink); background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(45, 51, 80, 0.22); border-radius: 12px; padding: 0 12px; min-height: var(--kc-tap); -webkit-appearance: none; appearance: none; user-select: text; -webkit-user-select: text; }
#klc-contrib textarea { padding: 10px 12px; resize: none; min-height: 104px; }
#klc-contrib input::placeholder, #klc-contrib textarea::placeholder { color: #8a8da3; }
#klc-contrib input[aria-invalid="true"], #klc-contrib textarea[aria-invalid="true"] { border-color: var(--k-err); box-shadow: 0 0 0 1px var(--k-err); }

/* kind: two cards */
#klc-contrib .kc-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#klc-contrib .kc-kindcard, #klc-contrib .kc-chip, #klc-contrib .kc-check { position: relative; display: block; cursor: pointer; }
#klc-contrib .kc-kindcard input, #klc-contrib .kc-chip input, #klc-contrib .kc-check input, #klc-contrib .kc-file { position: absolute; opacity: 0; width: 100%; height: 100%; inset: 0; margin: 0; cursor: pointer; }
#klc-contrib .kc-file { width: 1px; height: 1px; overflow: hidden; }
#klc-contrib .kc-card { display: grid; justify-items: start; align-content: start; gap: 6px; height: 100%; min-height: 76px; padding: 11px 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1.5px var(--k-line) inset; font: 700 14px/1.3 var(--k-round); color: var(--k-navy); transition: background .2s, box-shadow .2s, transform .15s var(--ease); }
#klc-contrib .kc-card-ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(224, 112, 63, 0.14); color: #b9531f; }
#klc-contrib .kc-card-fix .kc-card-ico { background: rgba(47, 127, 174, 0.15); color: #1f6a96; }
#klc-contrib .kc-kindcard input:checked + .kc-card { background: #fff; box-shadow: 0 0 0 2.5px var(--k-navy) inset, 0 6px 16px rgba(31, 58, 104, 0.16); }
#klc-contrib .kc-kindcard:active .kc-card, #klc-contrib .kc-chip:active .kc-chipbody { transform: scale(0.97); }
#klc-contrib .kc-kindcard input:focus-visible + .kc-card, #klc-contrib .kc-chip input:focus-visible + .kc-chipbody, #klc-contrib .kc-check input:focus-visible + .kc-box { outline: 2px solid var(--k-blue); outline-offset: 2px; }
#klc-contrib [data-only] { display: none; }
#klc-contrib[data-kind="issue"] [data-only="issue"], #klc-contrib[data-kind="fix"] [data-only="fix"] { display: inline; }
/* the two one-line explanations share one grid cell: the taller one sets the height, so switching kind never moves what is below */
#klc-contrib .kc-descs { display: grid; }
#klc-contrib .kc-descs > p { grid-area: 1 / 1; margin: 0; display: block !important; visibility: hidden; }
#klc-contrib[data-kind="issue"] .kc-descs > p[data-only="issue"], #klc-contrib[data-kind="fix"] .kc-descs > p[data-only="fix"] { visibility: visible; }

/* the screenshot that goes along: a box with the screen's own shape, so nothing jumps when the picture arrives */
#klc-contrib .kc-shot { display: flex; gap: 12px; align-items: center; padding: 10px; border-radius: 16px; background: rgba(255, 255, 255, 0.7); box-shadow: 0 0 0 1px var(--k-line) inset; }
#klc-contrib .kc-shot-img { flex: none; height: 96px; max-width: 46%; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #dfe8f3, #c8d7ea); box-shadow: 0 0 0 1px rgba(31, 58, 104, 0.16) inset; }
#klc-contrib .kc-shot-img img { display: block; width: 100%; height: 100%; object-fit: cover; }
#klc-contrib .kc-shot[data-state="wait"] .kc-shot-img { animation: kc-pulse 1.2s ease-in-out infinite; }
#klc-contrib .kc-shot[data-state="fail"] .kc-shot-img { background: repeating-linear-gradient(45deg, #ebe3d4, #ebe3d4 8px, #f3ede1 8px, #f3ede1 16px); }
@keyframes kc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
#klc-contrib .kc-shot-txt { min-width: 0; display: grid; gap: 4px; }
#klc-contrib .kc-shot-txt h3 { margin: 0; font: 900 14px/1.3 var(--k-round); color: var(--k-navy); }
#klc-contrib .kc-shot-txt p { margin: 0; font: 500 12.5px/1.5 var(--k-sans); color: var(--k-muted); }
#klc-contrib .kc-shot-txt p[data-f="shot-t"] { min-height: 4.5em; }   /* three lines are always reserved: waiting, ready and failed texts differ in length */
#klc-contrib .kc-meta { display: flex; flex-wrap: wrap; gap: 4px; min-height: 22px; }
#klc-contrib .kc-meta span { padding: 3px 8px; border-radius: 999px; background: rgba(31, 58, 104, 0.09); color: var(--k-navy); font: 700 11px/1.2 var(--k-sans); }

/* categories: icon, name, one example each */
#klc-contrib .kc-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#klc-contrib .kc-chipbody { display: grid; grid-template-columns: 30px minmax(0, 1fr); grid-template-areas: "ico name" "ex ex"; align-items: center; gap: 5px 9px; height: 100%; min-height: 66px; padding: 9px 10px 8px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1.5px var(--k-line) inset; transition: background .2s, color .2s, box-shadow .2s, transform .15s var(--ease); }
#klc-contrib .kc-chip-ico { grid-area: ico; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(31, 58, 104, 0.09); color: var(--k-navy); transition: background .2s, color .2s; }
#klc-contrib .kc-chip-name { grid-area: name; font: 700 14px/1.25 var(--k-round); color: var(--k-ink); min-width: 0; }
#klc-contrib .kc-chip-ex { grid-area: ex; font: 500 11.5px/1.45 var(--k-sans); color: var(--k-muted); text-wrap: balance; }
#klc-contrib .kc-chip input:checked + .kc-chipbody { background: var(--k-navy); box-shadow: 0 6px 16px rgba(31, 58, 104, 0.3); }
#klc-contrib .kc-chip input:checked + .kc-chipbody .kc-chip-name { color: #fff; }
#klc-contrib .kc-chip input:checked + .kc-chipbody .kc-chip-ex { color: rgba(255, 255, 255, 0.88); }
#klc-contrib .kc-chip input:checked + .kc-chipbody .kc-chip-ico { background: rgba(255, 255, 255, 0.18); color: #fff; }

/* buttons */
#klc-contrib .kc-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: var(--kc-tap); padding: 0 18px; border-radius: 999px; font: 700 14px/1.2 var(--k-round); color: var(--k-navy); background: rgba(31, 58, 104, 0.09); text-align: center; transition: background .2s, transform .15s var(--ease), box-shadow .2s; cursor: pointer; }
@media (hover: hover) and (pointer: fine) { #klc-contrib .kc-btn:hover { background: rgba(31, 58, 104, 0.15); } }
#klc-contrib .kc-btn:active { transform: scale(0.97); }
#klc-contrib .kc-btn.primary { background: var(--k-navy); color: #fff; box-shadow: 0 6px 16px rgba(31, 58, 104, 0.3); }
@media (hover: hover) and (pointer: fine) { #klc-contrib .kc-btn.primary:hover { background: #17305a; } }
#klc-contrib .kc-btn.ghost { background: transparent; box-shadow: 0 0 0 1.5px var(--k-line) inset; }
#klc-contrib .kc-btn:disabled { opacity: 0.6; transform: none; }
#klc-contrib .kc-btn svg { width: 19px; height: 19px; }
#klc-contrib .kc-link { display: inline-flex; align-items: center; gap: 8px; min-height: var(--kc-tap); padding: 0 4px; font: 700 13px/1.3 var(--k-sans); color: #1f6a96; text-decoration: underline; text-underline-offset: 3px; text-align: left; }
#klc-contrib .kc-link svg { width: 18px; height: 18px; }

/* photos */
#klc-contrib .kc-addrow { display: flex; flex-wrap: wrap; gap: 8px; }
#klc-contrib .kc-pick:focus-within, #klc-contrib .kc-camera:focus-within { outline: 2px solid var(--k-blue); outline-offset: 2px; }
#klc-contrib .kc-tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 12px 10px; }
#klc-contrib .kc-tiles:empty { display: none; }
#klc-contrib .kc-tile { position: relative; display: grid; gap: 4px; }
#klc-contrib .kc-thumb { display: grid; place-items: center; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #dfe8f3; box-shadow: 0 0 0 1px rgba(31, 58, 104, 0.16) inset; }
#klc-contrib .kc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
#klc-contrib .kc-thumb-none { display: grid; justify-items: center; gap: 2px; color: var(--k-navy); }
#klc-contrib .kc-thumb-none small { font: 700 10px/1 var(--k-sans); }
#klc-contrib .kc-tile-name { font: 500 10.5px/1.2 var(--k-sans); color: var(--k-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#klc-contrib .kc-rm { position: absolute; top: -9px; right: -9px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; color: #fff; }
#klc-contrib .kc-rm svg { width: 14px; height: 14px; padding: 0; box-sizing: content-box; background: var(--k-navy); border-radius: 50%; padding: 6px; width: 14px; height: 14px; box-shadow: 0 2px 6px rgba(35, 40, 70, 0.4), 0 0 0 2px #fff; }

/* consent */
#klc-contrib .kc-consent { display: grid; gap: 4px; }
#klc-contrib .kc-check { display: flex; align-items: flex-start; gap: 12px; min-height: var(--kc-tap); padding: 4px 0; }
#klc-contrib .kc-check input { width: 100%; height: 100%; }
#klc-contrib .kc-box { flex: none; display: grid; place-items: center; width: 28px; height: 28px; margin-top: 2px; border-radius: 8px; background: #fff; box-shadow: 0 0 0 2px rgba(45, 51, 80, 0.35) inset; color: transparent; transition: background .2s, box-shadow .2s, color .2s; }
#klc-contrib .kc-box svg { width: 18px; height: 18px; }
#klc-contrib .kc-check input:checked + .kc-box { background: var(--k-navy); box-shadow: none; color: #fff; }
#klc-contrib .kc-ctext { font: 500 13.5px/1.55 var(--k-sans); color: var(--k-ink); }
#klc-contrib .kc-alert { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: #fbe9e4; color: #8a2c1a; box-shadow: 0 0 0 1px rgba(167, 58, 43, 0.35) inset; font: 500 13px/1.55 var(--k-sans); }
#klc-contrib .kc-alert b { font: 900 14px/1.4 var(--k-round); }

/* the footer: points copy, progress, the send button */
#klc-contrib .kc-foot { display: grid; gap: 8px; padding: 10px 18px 12px; border-top: 1px solid var(--k-line); background: rgba(250, 247, 241, 0.98); }
#klc-contrib[data-view="other"] .kc-foot { display: none; }
#klc-contrib .kc-points { margin: 0; padding: 10px 12px; border-radius: 12px; background: rgba(31, 58, 104, 0.06); font: 500 12.5px/1.6 var(--k-sans); color: var(--k-ink); }
#klc-contrib .kc-prog { display: grid; gap: 6px; }
#klc-contrib .kc-bar { width: 100%; height: 10px; border-radius: 999px; overflow: hidden; border: 0; background: rgba(31, 58, 104, 0.12); -webkit-appearance: none; appearance: none; accent-color: var(--k-navy); }
#klc-contrib .kc-bar::-webkit-progress-bar { background: rgba(31, 58, 104, 0.12); }
#klc-contrib .kc-bar::-webkit-progress-value { background: linear-gradient(90deg, #2f7fae, #1f3a68); border-radius: 999px; transition: width .2s linear; }
#klc-contrib .kc-bar::-moz-progress-bar { background: #1f3a68; border-radius: 999px; }
#klc-contrib .kc-prog-t { font: 700 12.5px/1.3 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
#klc-contrib .kc-actions { display: flex; gap: 8px; }
#klc-contrib .kc-send { flex: 1 1 auto; min-height: 48px; font-size: 15px; }
#klc-contrib .kc-actions .ghost { flex: none; }
#klc-contrib .kc-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
#klc-contrib .kc-live { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* done, privacy, my reports, the leaderboard */
#klc-contrib .kc-done { display: grid; gap: 12px; justify-items: center; text-align: center; padding: 12px 0 4px; }
#klc-contrib .kc-done-ico { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: #d8ecdc; color: var(--k-ok); animation: kc-pop .5s var(--pop) both; }
#klc-contrib .kc-done-ico svg { width: 34px; height: 34px; }
@keyframes kc-pop { from { transform: scale(0.4); opacity: 0; } to { transform: none; opacity: 1; } }
#klc-contrib .kc-done h3, #klc-contrib .kc-h3 { margin: 0; font: 900 18px/1.35 var(--k-round); color: var(--k-navy); }
#klc-contrib .kc-done p { margin: 0; font: 500 14px/1.7 var(--k-sans); }
#klc-contrib .kc-stack { display: grid; gap: 8px; width: 100%; margin-top: 6px; }
#klc-contrib .kc-privacy { display: grid; gap: 8px; }
#klc-contrib .kc-privacy h3 { margin: 4px 0 0; font: 900 18px/1.35 var(--k-round); color: var(--k-navy); }
#klc-contrib .kc-privacy h4, #klc-contrib .kc-block h4 { margin: 8px 0 0; font: 900 14px/1.4 var(--k-round); color: var(--k-navy); display: flex; align-items: center; gap: 8px; }
#klc-contrib .kc-privacy p { margin: 0; font: 500 13.5px/1.75 var(--k-sans); }
#klc-contrib .kc-back { justify-self: start; }
#klc-contrib .kc-state { margin: 12px 0; padding: 18px 12px; text-align: center; border-radius: 16px; background: rgba(255, 255, 255, 0.6); font: 500 14px/1.7 var(--k-sans); color: var(--k-muted); display: grid; gap: 8px; justify-items: center; }
#klc-contrib .kc-closed { margin: 24px 0; padding: 24px 16px; text-align: center; border-radius: 16px; background: rgba(255, 255, 255, 0.72); color: var(--k-ink); font: 500 16px/1.7 var(--k-sans); }
#klc-contrib .kc-total { display: grid; gap: 2px; margin: 10px 0 8px; padding: 12px 14px; border-radius: 16px; background: var(--k-navy); color: #fff; }
#klc-contrib .kc-total b { font: 900 22px/1.2 var(--k-round); letter-spacing: 0.03em; }
#klc-contrib .kc-total small { font: 500 12px/1.4 var(--k-sans); opacity: 0.85; }
#klc-contrib .kc-me { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 8px; font: 500 13px/1.5 var(--k-sans); }
#klc-contrib .kc-me dt { color: var(--k-muted); }
#klc-contrib .kc-me dd { margin: 0; font-weight: 700; overflow-wrap: break-word; }
#klc-contrib .kc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
#klc-contrib .kc-item { display: grid; gap: 6px; padding: 11px 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1px var(--k-line) inset; }
#klc-contrib .kc-item-top, #klc-contrib .kc-item-bot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#klc-contrib .kc-item-top time { margin-left: auto; font: 500 12px/1 var(--k-sans); color: var(--k-muted); font-variant-numeric: tabular-nums; }
#klc-contrib .kc-badge { padding: 3px 8px; border-radius: 8px; background: rgba(224, 112, 63, 0.16); color: #9a4616; font: 700 11px/1.2 var(--k-sans); }
#klc-contrib .kc-badge[data-kind="fix"] { background: rgba(47, 127, 174, 0.16); color: #1a5f88; }
#klc-contrib .kc-cat { font: 700 13px/1.3 var(--k-round); }
#klc-contrib .kc-item-note, #klc-contrib .kc-live-note { margin: 0; font: 500 12.5px/1.6 var(--k-sans); color: var(--k-muted); overflow-wrap: break-word; }
#klc-contrib .kc-live-note { color: var(--k-ok); font-weight: 700; }
#klc-contrib .kc-st { padding: 4px 10px; border-radius: 999px; font: 700 12px/1.2 var(--k-sans); background: #f3e1c9; color: #7a3f17; }
#klc-contrib .kc-st[data-s="accepted"] { background: #d8ecdc; color: var(--k-ok); }
#klc-contrib .kc-st[data-s="used"] { background: var(--k-navy); color: #fff; }
#klc-contrib .kc-st[data-s="rejected"] { background: #ececf2; color: #50536b; }
#klc-contrib .kc-pt { font: 900 14px/1 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
#klc-contrib .kc-block { display: grid; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--k-line); justify-items: start; }
#klc-contrib .kc-block h4 svg { width: 18px; height: 18px; }
#klc-contrib .kc-xfer-card { width: 100%; }
#klc-contrib .kc-xfer-card:empty { display: none; }
#klc-contrib .kc-codecard { display: grid; gap: 8px; justify-items: center; padding: 14px; border-radius: 16px; background: #fff; box-shadow: 0 0 0 1px var(--k-line) inset; text-align: center; }
#klc-contrib .kc-codecard[data-phase="expired"] { opacity: 0.7; }
#klc-contrib .kc-codecard .kc-label { margin: 0; }
#klc-contrib .kc-code { margin: 0; font: 700 28px/1.15 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: 0.14em; color: var(--k-navy); user-select: all; -webkit-user-select: all; }
#klc-contrib .kc-left { margin: 0; font: 700 13px/1.4 var(--k-round); color: var(--k-muted); font-variant-numeric: tabular-nums; }
#klc-contrib .kc-qr { width: 176px; height: 176px; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px var(--k-line); }
#klc-contrib .kc-qr:empty { display: none; }
#klc-contrib .kc-qr svg { width: 100%; height: 100%; display: block; }
#klc-contrib .kc-row-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
#klc-contrib .kc-claimform { display: grid; gap: 6px; width: 100%; }
#klc-contrib .kc-claimrow { display: flex; gap: 8px; }
#klc-contrib .kc-claimrow .kc-btn { flex: none; white-space: nowrap; }
#klc-contrib .kc-claimrow input { flex: 1 1 auto; min-width: 0; letter-spacing: 0.12em; text-transform: uppercase; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-weight: 700; }
#klc-contrib .kc-board { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
#klc-contrib .kc-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto; align-items: center; gap: 4px 10px; padding: 9px 12px 9px 9px; border-radius: 16px; background: rgba(255, 255, 255, 0.78); box-shadow: 0 0 0 1px var(--k-line) inset; }
#klc-contrib .kc-row[data-me="1"] { background: #fff; box-shadow: 0 0 0 2px var(--k-navy) inset; }
#klc-contrib .kc-rank { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: rgba(31, 58, 104, 0.1); color: var(--k-navy); font: 900 13px/1 var(--k-round); font-variant-numeric: tabular-nums; }
#klc-contrib .kc-row[data-rank="1"] .kc-rank { background: var(--accent-fill, #c4521f); color: #fff; }   /* [ui-b2:14] white on #e0703f was 3.2:1 */
#klc-contrib .kc-row[data-rank="2"] .kc-rank, #klc-contrib .kc-row[data-rank="3"] .kc-rank { background: var(--k-navy); color: #fff; }
#klc-contrib .kc-nick { font: 700 14px/1.3 var(--k-round); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 5px 0; margin: -5px 0; }   /* (the padding keeps the 「あなた」 pill inside the clip) */
#klc-contrib .kc-nick em { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 999px; background: var(--k-navy); color: #fff; font: 700 10.5px/1.4 var(--k-sans); font-style: normal; vertical-align: 1px; }
#klc-contrib .kc-acc { font: 500 12px/1.3 var(--k-sans); color: var(--k-muted); white-space: nowrap; }
#klc-contrib .kc-pts { font: 900 15px/1 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* the privacy summary above the consent box, the status line after a delete, the delete question */
#klc-contrib .kc-privsum { margin: 0 0 4px; padding: 9px 12px; border-radius: 12px; background: rgba(47, 127, 174, 0.1); color: #1a5f88; font: 700 12.5px/1.6 var(--k-sans); }
#klc-contrib .kc-privacy .kc-lead { color: var(--k-ink); }
#klc-contrib .kc-privacy .kc-contact { font-weight: 700; }
#klc-contrib .kc-notice { margin: 8px 0 4px; padding: 10px 12px; border-radius: 12px; background: #d8ecdc; color: var(--k-ok); font: 700 13px/1.55 var(--k-sans); }
#klc-contrib .kc-erase-card { width: 100%; display: grid; gap: 8px; justify-items: start; }
#klc-contrib .kc-confirm { width: 100%; display: grid; gap: 10px; padding: 12px; border-radius: 16px; background: #fbe9e4; box-shadow: 0 0 0 1px rgba(167, 58, 43, 0.35) inset; }
#klc-contrib .kc-confirm p { margin: 0; font: 500 13px/1.65 var(--k-sans); color: #7a2b1d; }
#klc-contrib .kc-confirm .kc-row-btns { justify-content: flex-start; }
#klc-contrib .kc-btn.danger { background: var(--k-err); color: #fff; box-shadow: 0 6px 16px rgba(167, 58, 43, 0.3); }
@media (hover: hover) and (pointer: fine) { #klc-contrib .kc-btn.danger:hover { background: #8f2f22; } }
#klc-contrib .kc-btn.danger-ghost { background: transparent; color: var(--k-err); box-shadow: 0 0 0 1.5px rgba(167, 58, 43, 0.45) inset; }
@media (hover: hover) and (pointer: fine) { #klc-contrib .kc-btn.danger-ghost:hover { background: rgba(167, 58, 43, 0.08); } }
@media (max-width: 400px) { #klc-contrib .kc-row { grid-template-columns: 32px minmax(0, 1fr) auto; } #klc-contrib .kc-acc { grid-column: 2; grid-row: 2; } #klc-contrib .kc-pts { grid-row: 1 / 3; grid-column: 3; } }
/* a phone on its side (844 x 390): there is no height to spare, so the header is one row (title, tabs, language, close), the form is two columns and the
   footer is just the send button. These come last: they must beat the base rules above (same specificity, later wins). */
@media (orientation: landscape) and (max-height: 520px) {
  #klc-contrib .kc-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 4px 10px; padding: 6px 8px 6px 16px; }
  #klc-contrib .kc-title { display: contents; }
  #klc-contrib h2 { grid-column: 1; grid-row: 1; font-size: 16px; }
  #klc-contrib .kc-tabs { grid-column: 2; grid-row: 1; }
  #klc-contrib .kc-lang { grid-column: 3; grid-row: 1; }
  #klc-contrib .kc-x { grid-column: 4; grid-row: 1; }
  #klc-contrib .kc-warn { grid-column: 1 / -1; grid-row: 2; }
  #klc-contrib .kc-body { padding: 12px 16px 6px; }
  #klc-contrib .kc-form { display: block; column-count: 2; column-gap: 22px; }
  #klc-contrib .kc-form > * { break-inside: avoid; margin-bottom: 16px; }
  #klc-contrib .kc-foot { padding: 6px 16px 8px; }
  #klc-contrib .kc-send { min-height: var(--kc-tap); }
  #klc-contrib .kc-kind-desc, #klc-contrib .kc-descs { margin-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) { #klc-contrib *, #klc-contrib { transition-duration: 0s !important; animation: none !important; } }
`;
