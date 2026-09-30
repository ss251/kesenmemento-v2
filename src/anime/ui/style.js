// [v3:life] Minimal UI style: paper-glass pills over the scene, Zen Maru Gothic, navy ink (matches the intro board).
export const CSS = /* css */`
#klc-ui { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #6b6f86; --k-glass: rgba(250, 247, 241, 0.84); --k-glass-2: rgba(250, 247, 241, 0.94);
  --k-line: rgba(45, 51, 80, 0.12); --k-accent: #e0703f; --k-accent-2: #2f7fae; --k-sel: #1f3a68;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: var(--k-sans); color: var(--k-ink); -webkit-font-smoothing: antialiased; }
#klc-ui[hidden], body.noui #klc-ui { display: none !important; }
#klc-ui * { box-sizing: border-box; }
#klc-ui button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
#klc-ui button:focus-visible { outline: 2px solid var(--k-accent-2); outline-offset: 2px; }
#klc-ui .glass { background: var(--k-glass); backdrop-filter: blur(10px) saturate(1.2); -webkit-backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.5) inset; }
#klc-ui svg { width: 18px; height: 18px; flex: none; }

/* brand + live chip */
#klc-ui .brand { position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); left: 20px; display: grid; gap: 10px; justify-items: start; }
#klc-ui .mark { font: 900 30px/1 var(--k-round); letter-spacing: 0.06em; color: #fff; text-shadow: 0 2px 0 rgba(31, 58, 104, 0.55), 0 0 18px rgba(31, 58, 104, 0.35); white-space: nowrap; }
#klc-ui .mark small { display: block; margin-top: 6px; font: 800 11px/1 var(--k-sans); letter-spacing: 0.34em; color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 0 rgba(31, 58, 104, 0.8), 0 0 8px rgba(31, 58, 104, 0.6); }
#klc-ui .chip { display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px 8px 12px; border-radius: 999px; font: 500 13px/1 var(--k-sans); font-variant-numeric: tabular-nums; white-space: nowrap; }
#klc-ui .chip .clock { font: 700 15px/1 var(--k-round); color: var(--k-navy); }
#klc-ui .chip .sep { width: 1px; height: 14px; background: var(--k-line); }
#klc-ui .chip .boats b { font-weight: 700; color: var(--k-navy); }
#klc-ui .tag { font: 700 10px/1 var(--k-sans); padding: 4px 7px; border-radius: 6px; background: #f3e1c9; color: #8a4b1f; letter-spacing: 0.04em; }
#klc-ui .tag.live { background: #d8ecdc; color: #2b6a3f; }
#klc-ui .caret { transition: transform .25s ease; opacity: .6; }
#klc-ui .chip[aria-expanded="true"] .caret { transform: rotate(180deg); }

/* arrivals panel */
#klc-ui .arrivals { width: min(360px, calc(100vw - 40px)); border-radius: 14px; padding: 12px 6px 8px 14px; pointer-events: auto; max-height: min(46vh, 380px); display: grid; grid-template-rows: auto 1fr; }
#klc-ui .arrivals[hidden] { display: none; }
#klc-ui .arrivals h3 { margin: 0 8px 8px 0; font: 700 14px/1.2 var(--k-round); color: var(--k-navy); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
#klc-ui .arrivals ol { list-style: none; margin: 0; padding: 0 8px 0 0; overflow: auto; overscroll-behavior: contain; }
#klc-ui .arrivals li { display: grid; grid-template-columns: 46px 1fr auto; gap: 2px 10px; padding: 7px 0; border-top: 1px solid var(--k-line); align-items: baseline; }
#klc-ui .arrivals li:first-child { border-top: 0; }
#klc-ui .arrivals .t { font: 700 13px/1.2 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
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
#klc-ui .seg { display: flex; gap: 2px; position: relative; }
#klc-ui .seg button { position: relative; display: grid; justify-items: center; gap: 3px; min-width: 64px; padding: 8px 12px 7px; border-radius: 999px; transition: background .2s, color .2s; }
#klc-ui .seg button .ja { font: 700 14px/1 var(--k-round); }
#klc-ui .seg button .hm { font: 500 10px/1 var(--k-sans); color: var(--k-muted); font-variant-numeric: tabular-nums; }
#klc-ui .seg button:hover { background: rgba(31, 58, 104, 0.07); }
#klc-ui .seg button[aria-pressed="true"] { background: var(--k-sel); color: #fff; }
#klc-ui .seg button[aria-pressed="true"] .hm { color: rgba(255, 255, 255, 0.75); }
#klc-ui .seg .dot { position: absolute; top: 6px; right: 9px; width: 6px; height: 6px; border-radius: 50%; }
#klc-ui .dock .div { width: 1px; align-self: stretch; margin: 6px 4px; background: var(--k-line); }
#klc-ui .pill { display: inline-flex; align-items: center; gap: 7px; height: 42px; padding: 0 14px; border-radius: 999px; font: 700 13px/1 var(--k-round); color: var(--k-navy); white-space: nowrap; transition: background .2s; }
#klc-ui .pill:hover { background: rgba(31, 58, 104, 0.07); }
#klc-ui .pill[aria-pressed="true"] { background: var(--k-sel); color: #fff; }
#klc-ui .pill.shoot { background: var(--k-accent); color: #fff; }
#klc-ui .pill.shoot:hover { background: #cf6333; }

/* places */
#klc-ui .places { position: absolute; left: 20px; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); width: 212px; border-radius: 16px; padding: 12px 8px 8px; }
#klc-ui .places h3 { margin: 0 0 6px; }
#klc-ui .places .ph { width: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 10px 6px; border-radius: 10px; font: 700 12px/1 var(--k-sans); letter-spacing: 0.18em; color: var(--k-muted); }
#klc-ui .places .ph .cur { margin-left: auto; letter-spacing: 0.02em; font: 700 13px/1 var(--k-round); color: var(--k-navy); opacity: 0; transition: opacity .2s; }
#klc-ui .places .ph .caret { transition: transform .25s cubic-bezier(.2,.8,.2,1); }
#klc-ui .places .ph[aria-expanded="true"] .caret { transform: rotate(180deg); }
#klc-ui .places .ph:hover { background: rgba(31, 58, 104, 0.06); }
@media (min-width: 721px) {
  #klc-ui .places[data-open="false"] { padding-top: 8px; }
  #klc-ui .places[data-open="false"] ul { display: none; }
  #klc-ui .places[data-open="false"] h3 { margin-bottom: 2px; }
  #klc-ui .places[data-open="false"] .ph .cur { opacity: 1; }
}
#klc-ui .places ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; max-height: min(46vh, 420px); overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; }   /* [v4:explore] 7 stops + 40 real places */
#klc-ui .places li button { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; text-align: left; font: 700 14px/1.2 var(--k-round); }
#klc-ui .places li button .n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font: 700 10px/1 var(--k-sans); background: rgba(31, 58, 104, 0.1); color: var(--k-navy); flex: none; }
#klc-ui .places li button small { display: block; margin-top: 2px; font: 500 10px/1.2 var(--k-sans); color: var(--k-muted); }
#klc-ui .places li button:hover { background: rgba(31, 58, 104, 0.07); }
#klc-ui .places li button[aria-current="true"] { background: rgba(31, 58, 104, 0.1); }
#klc-ui .places li button[aria-current="true"] .n { background: var(--k-navy); color: #fff; }
#klc-ui .places .auto { margin: 6px 2px 0; width: calc(100% - 4px); justify-content: center; height: 36px; background: rgba(31, 58, 104, 0.08); }
#klc-ui .places .auto[aria-pressed="true"] { background: var(--k-navy); color: #fff; }

#klc-ui .attr a { color: inherit; pointer-events: auto; text-decoration: underline; text-underline-offset: 2px; }   /* [v3:fix] licence link */
#klc-ui .attr { position: absolute; right: 18px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); font: 500 10px/1.4 var(--k-sans); color: #fff; text-shadow: 0 1px 2px rgba(20, 30, 60, 0.45), 0 0 5px rgba(20, 30, 60, 0.5); background: rgba(24, 32, 62, 0.26); border-radius: 999px; padding: 1px 9px; text-align: right; max-width: 46vw; }   /* [v3:polish3] readable on the light planet sky */
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
  #klc-ui .attr { left: 12px; right: 12px; transform: none; white-space: normal; bottom: calc(6px + env(safe-area-inset-bottom, 0px)); text-align: center; max-width: none; font-size: 9px; border-radius: 10px; }
  #klc-ui .arrivals { max-height: 42vh; }
}
/* [v3:fix] narrow phones: the 出典 credit wraps to two lines; lift the dock and the places strip above it (they clipped it) */
@media (max-width: 480px) {
  #klc-ui .attr { font-size: 8.5px; line-height: 1.3; bottom: calc(4px + env(safe-area-inset-bottom, 0px)); }
  #klc-ui .attr a { white-space: nowrap; }
  #klc-ui .dock { bottom: calc(34px + env(safe-area-inset-bottom, 0px)); }
  #klc-ui .places { bottom: calc(154px + env(safe-area-inset-bottom, 0px)); }
}
body.klc-ui #corner, body.klc-ui #help, body.klc-ui #credit { display: none !important; }
#klc-ui-restore { display: none; position: fixed; z-index: 5; top: calc(18px + env(safe-area-inset-top, 0px)); right: 18px; width: 38px; height: 38px; border: 0; border-radius: 50%;
  background: rgba(250, 247, 241, 0.28); color: #1f3a68; opacity: 0.45; cursor: pointer; place-items: center; }
#klc-ui-restore svg { width: 18px; height: 18px; }
#klc-ui-restore:hover, #klc-ui-restore:focus-visible { opacity: 0.9; }
body.noui.playing #klc-ui-restore { display: grid; }
body.shot #klc-ui-restore { display: none !important; }
body.klc-ui #toast { left: 50%; transform: translateX(-50%); top: calc(18px + env(safe-area-inset-top, 0px)); }
@media (max-width: 720px) { body.klc-ui #toast { display: none; } }   /* [v3:fix] phones: the places strip names the spot; the toast floated in the sky */
@media (prefers-reduced-motion: reduce) { #klc-ui * { transition: none !important; } }
`;
