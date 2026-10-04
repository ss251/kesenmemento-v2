// [v7:pad] The touch pad's style: glass buttons in the app's paper / navy / coral palette (ui/style.js, explore/ui.js).
// Everything the pad draws lives under #klc-pad; the few rules at the end re-seat the existing panels while the pad is on
// (body.klc-pad), so no pad element ever sits on the dock, the time bar, the places strip, the minimap or the credit line.
export const CSS = /* css */`
#klc-pad { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #6b6f86; --k-glass: rgba(250, 247, 241, 0.86); --k-line: rgba(45, 51, 80, 0.12); --k-accent: #e0703f; --k-blue: #2f7fae; --k-sky: #7fb8d8;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  --ease: cubic-bezier(0.23, 1, 0.32, 1); --pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  position: fixed; top: 0; left: 0; width: 100%; height: 100vh; height: 100svh; height: 100dvh; z-index: 6; pointer-events: none; font-family: var(--k-sans); color: var(--k-ink);
  -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none;
  transition: opacity .35s var(--ease), visibility 0s; }
#klc-pad * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#klc-pad[data-hidden="1"] { opacity: 0; visibility: hidden; transition: opacity .3s var(--ease), visibility 0s .3s; }
#klc-pad .safe { position: absolute; inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
/* fade to 35 % after 4 s idle; back at once on any touch */
#klc-pad .ctl { transition: opacity .6s ease; }
#klc-pad[data-idle="1"] .ctl { opacity: .35; }
#klc-pad[data-idle="0"] .ctl { transition-duration: .06s; }

/* ---------- the floating stick: a ghost at rest, the base under the thumb */
#klc-pad .ghost { position: absolute; border-radius: 50%; pointer-events: none; }
#klc-pad .ghost .ring, #klc-pad .stick .ring { position: absolute; inset: 0; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.82);
  background: radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.34), rgba(250, 247, 241, 0.12) 62%, rgba(31, 58, 104, 0.2));
  box-shadow: 0 10px 30px rgba(35, 40, 70, 0.26), inset 0 0 0 1.5px rgba(31, 58, 104, 0.14), inset 0 -8px 18px rgba(31, 58, 104, 0.12);
  -webkit-backdrop-filter: blur(6px) saturate(1.2); backdrop-filter: blur(6px) saturate(1.2); transition: border-color .14s, box-shadow .14s, background .14s; }
#klc-pad .ghost .ring { border-style: solid; border-color: rgba(255, 255, 255, 0.7); }
#klc-pad .knob { position: absolute; left: 50%; top: 50%; width: var(--knob, 52px); height: var(--knob, 52px); margin: calc(var(--knob, 52px) / -2) 0 0 calc(var(--knob, 52px) / -2); border-radius: 50%;
  background: radial-gradient(circle at 38% 30%, #ffffff, #eaf0f9 58%, #cbd8ea); box-shadow: 0 7px 16px rgba(35, 40, 70, 0.34), inset 0 -4px 8px rgba(31, 58, 104, 0.16), 0 0 0 1.5px rgba(255, 255, 255, 0.8) inset;
  transform: translate3d(var(--kx, 0px), var(--ky, 0px), 0); transition: background .14s; }
#klc-pad .ghost .knob { opacity: .8; animation: klc-pad-breathe 3.2s ease-in-out infinite; }
#klc-pad .ghost .dir { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px; border-radius: 50%; --r: calc(var(--base, 128px) / 2 - 13px);
  box-shadow: 0 calc(var(--r) * -1) 0 0 rgba(31, 58, 104, 0.4), 0 var(--r) 0 0 rgba(31, 58, 104, 0.4), var(--r) 0 0 0 rgba(31, 58, 104, 0.4), calc(var(--r) * -1) 0 0 0 rgba(31, 58, 104, 0.4); }
#klc-pad[data-nostick="1"] .ghost { display: none; }   /* a registered mode with stick: 'none' */
#klc-pad[data-stick="1"] .ghost { opacity: 0; transition: opacity .12s; }
#klc-pad[data-stick="0"] .ghost { transition: opacity .3s .1s; }
@keyframes klc-pad-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.9); } }
#klc-pad .stick { position: absolute; left: 0; top: 0; width: var(--base, 128px); height: var(--base, 128px); pointer-events: none; opacity: 0; will-change: transform; transition: opacity .16s; }
#klc-pad .stick[data-on="1"] { opacity: 1; }
#klc-pad .stick[data-run="1"] .ring { border-color: var(--k-accent); box-shadow: 0 0 0 5px rgba(224, 112, 63, 0.26), 0 10px 32px rgba(224, 112, 63, 0.42), inset 0 0 0 1.5px rgba(224, 112, 63, 0.4);
  background: radial-gradient(circle at 50% 38%, rgba(255, 224, 196, 0.46), rgba(224, 112, 63, 0.16) 64%, rgba(224, 112, 63, 0.26)); }
#klc-pad .stick[data-run="1"] .knob { background: radial-gradient(circle at 38% 30%, #fff4ea, #ffc8a2 58%, #f0894f); }
#klc-pad .stick .tag { position: absolute; left: 50%; top: -30px; transform: translateX(-50%) scale(.8); padding: 4px 11px; border-radius: 999px; background: var(--k-accent); color: #fff; font: 900 12px/1 var(--k-round);
  letter-spacing: .06em; white-space: nowrap; opacity: 0; transition: opacity .12s, transform .18s var(--pop); box-shadow: 0 4px 12px rgba(224, 112, 63, 0.45); }
#klc-pad .stick[data-run="1"] .tag { opacity: 1; transform: translateX(-50%) scale(1); }

/* ---------- the action cluster: glass buttons on an arc */
#klc-pad .cluster { position: absolute; }
#klc-pad .btn { position: absolute; display: grid; align-content: center; justify-items: center; gap: 2px; padding: 0; border: 0; border-radius: 50%; color: var(--k-navy); font: 700 11px/1.1 var(--k-round); letter-spacing: .02em; pointer-events: auto; cursor: pointer;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(250, 247, 241, 0.8));
  box-shadow: 0 9px 24px rgba(35, 40, 70, 0.26), 0 2px 5px rgba(35, 40, 70, 0.14), inset 0 0 0 1.5px rgba(255, 255, 255, 0.85), inset 0 -4px 0 rgba(31, 58, 104, 0.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); touch-action: none; -webkit-tap-highlight-color: transparent;
  transition: transform .14s var(--ease), background .14s, color .14s, box-shadow .14s, opacity .22s; }
#klc-pad .btn .ico { display: grid; place-items: center; }
#klc-pad .btn svg { width: 25px; height: 25px; display: block; }
#klc-pad .btn .lbl { display: block; max-width: 100%; padding: 0 2px; white-space: nowrap; overflow: hidden; }
#klc-pad .btn.primary { font-size: 12.5px; color: #fff; background: linear-gradient(180deg, #f08a58, var(--k-accent) 60%, #cf6333);
  box-shadow: 0 11px 28px rgba(224, 112, 63, 0.42), 0 2px 6px rgba(35, 40, 70, 0.2), inset 0 0 0 1.5px rgba(255, 255, 255, 0.5), inset 0 -5px 0 rgba(160, 60, 20, 0.28); }
#klc-pad .btn.primary svg { width: 31px; height: 31px; }
#klc-pad .btn.down, #klc-pad .btn:active { transform: scale(0.92); background: var(--k-navy); color: #fff;
  box-shadow: 0 3px 9px rgba(35, 40, 70, 0.34), inset 0 0 0 1.5px rgba(255, 255, 255, 0.28), inset 0 4px 10px rgba(0, 0, 0, 0.22); }
#klc-pad .btn.primary.down, #klc-pad .btn.primary:active { background: #b9531f; }
#klc-pad .btn[aria-pressed="true"] { background: var(--k-navy); color: #fff; box-shadow: 0 0 0 3px rgba(127, 184, 216, 0.55), 0 9px 24px rgba(31, 58, 104, 0.4), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3); }
#klc-pad .btn[data-show="0"] { opacity: 0; transform: scale(0.4); pointer-events: none; visibility: hidden; transition: opacity .15s, transform .15s, visibility 0s .15s; }
#klc-pad .btn[data-show="1"] { transition-timing-function: var(--pop), ease, ease, ease, ease; }
#klc-pad .btn:focus-visible { outline: 3px solid var(--k-blue); outline-offset: 2px; }

/* ---------- the mode chip and the settings */
#klc-pad .topbar { position: absolute; display: flex; gap: 8px; align-items: center; }
#klc-pad .chip { display: inline-flex; gap: 2px; padding: 4px; border-radius: 999px; background: var(--k-glass); pointer-events: auto; -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 8px 26px rgba(35, 40, 70, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.55); }
#klc-pad .chip button { display: inline-flex; align-items: center; gap: 5px; height: 40px; min-width: 44px; padding: 0 12px 0 10px; border: 0; border-radius: 999px; background: none; color: var(--k-navy); font: 700 13px/1 var(--k-round);
  cursor: pointer; pointer-events: auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: background .18s, color .18s, transform .12s var(--ease); }
#klc-pad .chip button:active { transform: scale(0.94); }
#klc-pad .chip button[aria-pressed="true"] { background: var(--k-navy); color: #fff; }
#klc-pad .chip svg, #klc-pad .gear svg { width: 17px; height: 17px; flex: none; }
#klc-pad .gear { width: 48px; height: 48px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--k-glass); color: var(--k-navy); pointer-events: auto; cursor: pointer;
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); box-shadow: 0 8px 26px rgba(35, 40, 70, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.55); touch-action: manipulation; }
#klc-pad .gear[aria-expanded="true"] { background: var(--k-navy); color: #fff; }
#klc-pad .settings { z-index: 5; position: absolute; top: calc(100% + 8px); left: 0; width: min(272px, calc(100vw - 28px)); max-height: calc(100dvh - 120px); overflow: auto; padding: 12px 14px 8px; border-radius: 18px; background: var(--k-glass); pointer-events: auto; touch-action: pan-y;
  -webkit-backdrop-filter: blur(12px) saturate(1.2); backdrop-filter: blur(12px) saturate(1.2); box-shadow: 0 14px 40px rgba(35, 40, 70, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.55); }
#klc-pad .settings[hidden] { display: none; }
#klc-pad .settings h4 { margin: 0 0 6px; font: 900 13px/1.2 var(--k-round); color: var(--k-navy); letter-spacing: .08em; }
#klc-pad .settings .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 6px 0; border-top: 1px solid var(--k-line); }
#klc-pad .settings .row.col { display: grid; gap: 4px; align-content: center; }
#klc-pad .settings .row b { display: block; font: 700 14px/1.25 var(--k-round); color: var(--k-ink); }
#klc-pad .settings .row small { display: block; font: 500 11px/1.3 var(--k-sans); color: var(--k-muted); }
#klc-pad .settings .row.col span { display: flex; justify-content: space-between; align-items: baseline; }
#klc-pad .settings output { font: 700 12px/1 var(--k-round); color: var(--k-muted); font-variant-numeric: tabular-nums; }
#klc-pad .sw { position: relative; flex: none; width: 52px; height: 32px; border: 0; border-radius: 999px; background: rgba(45, 51, 80, 0.2); cursor: pointer; transition: background .2s; touch-action: manipulation; }
#klc-pad .sw i { position: absolute; left: 3px; top: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(35, 40, 70, 0.35); transition: transform .22s var(--pop); }
#klc-pad .sw[aria-checked="true"] { background: var(--k-navy); }
#klc-pad .sw[aria-checked="true"] i { transform: translateX(20px); }
#klc-pad input[type="range"] { width: 100%; height: 32px; accent-color: var(--k-navy); touch-action: pan-y; }

/* ---------- the first-run coach mark (placed by the pad in the free band between the panels and the thumbs) */
#klc-pad .coach { position: absolute; left: 50%; top: var(--cy, 44%); width: min(300px, calc(100% - 120px)); transform: translate(-50%, -50%) scale(var(--cs, 1)); padding: 12px 12px 12px; border-radius: 22px; text-align: center; pointer-events: auto;
  background: var(--k-glass); -webkit-backdrop-filter: blur(14px) saturate(1.25); backdrop-filter: blur(14px) saturate(1.25); box-shadow: 0 18px 50px rgba(35, 40, 70, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  opacity: 0; transition: opacity .25s var(--ease), transform .35s var(--pop); }
#klc-pad .coach[data-show="1"] { opacity: 1; }
#klc-pad .coach[data-show="0"] { opacity: 0; transform: translate(-50%, -46%) scale(calc(var(--cs, 1) * .96)); }
#klc-pad .coach[hidden] { display: none; }
#klc-pad .coach .hd { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px; }
#klc-pad .coach h3 { margin: 0; font: 900 17px/1.25 var(--k-round); color: var(--k-navy); letter-spacing: .03em; white-space: nowrap; }
#klc-pad .coach .hd i { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 50%; background: #fff; color: var(--k-navy); box-shadow: 0 4px 12px rgba(35, 40, 70, 0.16); animation: klc-pad-nudge 1.8s ease-in-out infinite; }
#klc-pad .coach .hd i.r { animation-name: klc-pad-nudge-r; }
#klc-pad .coach .hd i svg { width: 19px; height: 19px; }
#klc-pad .coach .ok { min-height: 44px; padding: 0 28px; border: 0; border-radius: 999px; background: var(--k-navy); color: #fff; font: 700 15px/1 var(--k-round); cursor: pointer; box-shadow: 0 6px 16px rgba(31, 58, 104, 0.3); touch-action: manipulation; }
@keyframes klc-pad-nudge { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
@keyframes klc-pad-nudge-r { 0%, 100% { transform: translate(-3px, 2px); } 50% { transform: translate(3px, -2px); } }
#klc-pad .note { position: absolute; left: 50%; top: 34%; transform: translate(-50%, 6px); padding: 9px 16px; border-radius: 999px; background: var(--k-glass); font: 700 13px/1 var(--k-round); color: var(--k-navy);
  box-shadow: 0 8px 26px rgba(35, 40, 70, 0.2); opacity: 0; transition: opacity .25s, transform .25s var(--ease); white-space: nowrap; }
#klc-pad .note.show { opacity: 1; transform: translate(-50%, 0); }

/* ---------- iOS: no selection, no callout, no tap flash, no bounce while the pad is on */
body.klc-pad { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none; }
body.klc-pad input, body.klc-pad textarea { -webkit-user-select: text; user-select: text; }
body.klc-pad canvas#scene { touch-action: none; -webkit-touch-callout: none; }
body.klc-pad { touch-action: manipulation; }   /* iOS ignores user-scalable=no: this is what stops double-tap zoom on the panels */
html.klc-pad-root { touch-action: manipulation; }

/* ---------- while the pad is on, a few existing panels move so that nothing of the pad sits on them.
   Phone (portrait): the search / map / drive buttons become a row right of the minimap and the car's speed chip sits under it (the
   pad measures where: --pad-xbar-top / --pad-xbar-left): the lower half of the screen is the thumbs' and the speed stays readable. */
@media (max-width: 720px) {
  body.klc-pad #klc-x .xbar { top: var(--pad-xbar-top, calc(290px + env(safe-area-inset-top, 0px))); bottom: auto; right: auto; left: var(--pad-xbar-left, 10px); flex-direction: row; gap: 8px; }
  body.klc-pad #klc-x .xdrive { top: calc(var(--pad-xbar-top, 290px) + 52px); bottom: auto; left: var(--pad-xbar-left, 10px); transform: none; max-width: calc(100vw - var(--pad-xbar-left, 10px) - 64px); }
  body.klc-pad #klc-x .xdrive .rd { max-width: 92px; }
}
/* Phone (landscape, 844 x 390): a compact brand, the tools and the search / map / drive row clear of the notch, the minimap a small
   disc at the top centre (it was a big one bottom right, where the action arc is), the places pill shrunk to its header, and the dock
   with only the five times of day and the photo button. */
@media (orientation: landscape) and (max-height: 520px) {
  body.klc-pad #klc-ui .brand { top: calc(10px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px)); gap: 6px; }
  body.klc-pad #klc-ui .mark { font-size: 18px; }
  body.klc-pad #klc-ui .mark small { display: none; }
  body.klc-pad #klc-ui .brand .chip { font-size: 12px; gap: 8px; padding: 6px 11px 6px 10px; }
  body.klc-pad #klc-ui .tools { top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(14px + env(safe-area-inset-right, 0px)); }
  body.klc-pad #klc-ui #quality { display: none; }   /* a phone is forced to the phone tier: the selector has nothing else to offer */
  body.klc-pad #klc-x .xbar { top: calc(58px + env(safe-area-inset-top, 0px)); right: calc(14px + env(safe-area-inset-right, 0px)); }
  body.klc-pad #klc-x .mini { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; left: 50%; right: auto; transform: translateX(-50%); width: 96px; gap: 4px; }
  body.klc-pad #klc-x .mini canvas { width: 96px; height: 96px; }
  body.klc-pad #klc-x .mini .cap { max-width: 150px; padding: 3px 8px; font-size: 10.5px; }
  body.klc-pad #klc-x .mini .cap small { display: none; }
  body.klc-pad #klc-ui .places { width: 186px; left: calc(8px + env(safe-area-inset-left, 0px)); }
  body.klc-pad #klc-ui .places .ph .lbl { display: none; }   /* (めぐる stacked one glyph per line in 160 px; the place name and the caret say what it is) */
  body.klc-pad #klc-ui .places .ph .cur { margin-left: 0; flex: 1 1 auto; text-align: left; }
  body.klc-pad #klc-ui .places .ph .cur { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.klc-pad #klc-ui .places .auto { display: none; }
  body.klc-pad #klc-ui .dock .pill[data-act="view"], body.klc-pad #klc-ui .dock .div { display: none; }
  body.klc-pad #klc-ui .dock .seg button { min-width: 46px; padding: 7px 5px 6px; }   /* (the dock is centred; the places strip needs the room on its left) */
}
@media (prefers-reduced-motion: reduce) { #klc-pad *, #klc-pad { transition-duration: 0s !important; animation: none !important; } }
`;
