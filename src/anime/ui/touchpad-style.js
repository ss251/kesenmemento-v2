// [v7:pad] The touch pad's style: glass buttons in the app's paper / navy / coral palette (ui/style.js, explore/ui.js).
// Everything the pad draws lives under #klc-pad; the few rules at the end re-seat the existing panels while the pad is on
// (body.klc-pad), so no pad element ever sits on the dock, the time bar, the places strip, the minimap or the credit line.
export const CSS = /* css */`
#klc-pad { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #55596f; --k-glass: rgba(250, 247, 241, 0.86); --k-line: rgba(45, 51, 80, 0.12); --k-accent: #e0703f; --k-blue: #2f7fae; --k-sky: #7fb8d8;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  --ease: cubic-bezier(0.23, 1, 0.32, 1); --pop: cubic-bezier(0.34, 1.56, 0.64, 1);
  position: fixed; top: 0; left: 0; width: 100%; height: 100vh; height: 100svh; height: 100dvh; z-index: 6; pointer-events: none; font-family: var(--k-sans); color: var(--k-ink);
  -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: none;
  transition: opacity var(--dur-enter) var(--ease-out), visibility 0s; line-break: strict; }
#klc-pad :is(h4, b) { word-break: auto-phrase; text-wrap: balance; }
#klc-pad :is(p, small) { text-wrap: pretty; }
#klc-pad * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#klc-pad[data-hidden="1"] { opacity: 0; visibility: hidden; transition: opacity var(--dur-exit) var(--ease-out), visibility 0s var(--dur-exit); }   /* [ui-b2:7] the pad steps aside quickly and comes back at the pace of what replaces it (it left in .3 s and took .35 s to return while a sheet popped in at 0 ms) */
#klc-pad .safe { position: absolute; inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
/* fade to 70 % after 4 s idle; back at once on any touch ([ui-b2:14] it was 35 %: a button label measured 2.1:1 on the sky; at 70 % the navy labels are 4.4 to 5.7:1, outdoors too) */
#klc-pad .ctl { transition: opacity .6s ease; }
#klc-pad[data-idle="1"] .ctl { opacity: .7; }
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
#klc-pad .stick .tag { position: absolute; left: 50%; top: -30px; transform: translateX(-50%) scale(.8); padding: 4px 11px; border-radius: 999px; background: var(--accent-fill, #c4521f); color: #fff; font: 900 12px/1 var(--k-round);
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
#klc-pad .btn.primary { font-size: 12.5px; color: #fff; background: linear-gradient(180deg, var(--accent-fill, #c4521f), var(--accent-fill-deep, #b0431a));   /* [ui-b2:14] white on the old gradient was 3.2:1 (2.5:1 at its top); on this one 4.59 to 5.73 */
  box-shadow: 0 11px 28px rgba(224, 112, 63, 0.42), 0 2px 6px rgba(35, 40, 70, 0.2), inset 0 0 0 1.5px rgba(255, 255, 255, 0.5), inset 0 -5px 0 rgba(160, 60, 20, 0.28); }
#klc-pad .btn.primary svg { width: 31px; height: 31px; }
#klc-pad .btn.down, #klc-pad .btn:active { transform: scale(0.95); background: var(--k-navy); color: #fff;
  box-shadow: 0 3px 9px rgba(35, 40, 70, 0.34), inset 0 0 0 1.5px rgba(255, 255, 255, 0.28), inset 0 4px 10px rgba(0, 0, 0, 0.22); }
#klc-pad .btn.primary.down, #klc-pad .btn.primary:active { background: var(--accent-fill-hover, #b9531f); }
#klc-pad .btn[aria-pressed="true"] { background: var(--k-navy); color: #fff; box-shadow: 0 0 0 3px rgba(127, 184, 216, 0.55), 0 9px 24px rgba(31, 58, 104, 0.4), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3); }
#klc-pad .btn[data-show="0"] { opacity: 0; transform: scale(0.4); pointer-events: none; visibility: hidden; transition: opacity .15s, transform .15s, visibility 0s .15s; }
#klc-pad .btn[data-show="1"]:not(.down):not(:active) { transition-timing-function: var(--pop), ease, ease, ease, ease; }   /* [ui-b2:6] the pop curve is for the entrance and the release; a press is a plain ease-out (data-show stays 1 while the button is up, so every press used to overshoot) */
#klc-pad .btn:focus-visible { outline: 3px solid var(--ring-ink, #1f3a68); outline-offset: 2px; box-shadow: 0 0 0 8px var(--ring-halo, rgba(255, 255, 255, 0.92)), 0 9px 24px rgba(35, 40, 70, 0.26); }   /* [ui-b2:6] the two-tone ring (ui/style.js): navy between two white bands */
#klc-pad .chip button:focus-visible, #klc-pad .gear:focus-visible, #klc-pad .sw:focus-visible, #klc-pad .coach .ok:focus-visible { outline: 2px solid var(--ring-ink, #1f3a68); outline-offset: 2px; box-shadow: 0 0 0 5px var(--ring-halo, rgba(255, 255, 255, 0.92)); }

/* ---------- the mode chip and the settings */
#klc-pad[data-custom="1"] .chip { display: none; }   /* a registered mode (the sail mode) owns the buttons: no 歩く / 飛ぶ / 運転 switch while it runs */
#klc-pad .topbar { position: absolute; display: flex; gap: 8px; align-items: center; }
#klc-pad .chip { display: inline-flex; gap: 2px; padding: 4px; border-radius: 999px; background: var(--k-glass); pointer-events: auto; -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 8px 26px rgba(35, 40, 70, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.55); }
#klc-pad .chip button { display: inline-flex; align-items: center; gap: 5px; height: 40px; min-width: 44px; padding: 0 12px 0 10px; border: 0; border-radius: 999px; background: none; color: var(--k-navy); font: 700 13px/1 var(--k-round);
  cursor: pointer; pointer-events: auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: background .18s, color .18s, transform .12s var(--ease); }
#klc-pad .chip button:active { transform: scale(0.95); }
#klc-pad .chip button[aria-pressed="true"] { background: var(--k-navy); color: #fff; }
#klc-pad .chip svg, #klc-pad .gear svg { width: 17px; height: 17px; flex: none; }
#klc-pad .gear { width: 48px; height: 48px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--k-glass); color: var(--k-navy); pointer-events: auto; cursor: pointer;
  -webkit-backdrop-filter: blur(10px) saturate(1.2); backdrop-filter: blur(10px) saturate(1.2); box-shadow: 0 8px 26px rgba(35, 40, 70, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.55); touch-action: manipulation; }
#klc-pad .gear[aria-expanded="true"] { background: var(--k-navy); color: #fff; }
/* [emil-ui] No mode switch on the screen. 飛ぶ, 歩く, 乗る (shown when a road is within 14 m) and 降りる are each mode's own action buttons, under the thumb, the way a
   game does it; the 歩く / 飛ぶ / 運転 chip said the same a second time at the top of the screen. On a portrait phone the gear goes too: the settings open from the
   HUD's ☰ (操作設定, hud.js) and keep their place under the top bar, which stays as their anchor. Elsewhere (a landscape phone, a tablet) the gear stays: the
   landscape toolbar has no room for another icon (it would reach the minimap), and landscape gets the ☰ in #9. */
#klc-pad .topbar .chip { display: none; }
#klc-pad .settings { z-index: 5; position: absolute; top: calc(100% + 8px); left: 0; width: min(320px, calc(100vw - 32px)); max-height: calc(100dvh - 120px); overflow: auto; padding: 16px 16px 8px; border-radius: 16px; background: var(--k-glass); pointer-events: auto; touch-action: pan-y;
  -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2); box-shadow: 0 16px 40px rgba(35, 40, 70, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.55); }
#klc-pad .settings[hidden] { display: none; }
#klc-pad .settings h4 { margin: 0 0 8px; font: 700 16px/1.3 var(--k-round); color: var(--k-navy); letter-spacing: 0.04em; }
#klc-pad .settings .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; padding: 8px 0; border-top: 1px solid var(--k-line); }
#klc-pad .settings .row.col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-content: center; }
#klc-pad .settings .row b { display: block; font: 700 16px/1.4 var(--k-round); color: var(--k-ink); }
#klc-pad .settings .row small { display: block; margin-top: 4px; font: 500 13px/1.6 var(--k-sans); color: var(--k-muted); }
#klc-pad .settings .row.col span { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
#klc-pad .settings output { font: 700 16px/1 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; }
#klc-pad .sw { position: relative; flex: none; width: 64px; height: 44px; border: 0; border-radius: 999px; background: rgba(45, 51, 80, 0.2); cursor: pointer; padding: 0; transition: background .2s; touch-action: manipulation; }
#klc-pad .sw i { position: absolute; left: 4px; top: 4px; width: 36px; height: 36px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(35, 40, 70, 0.35); transition: transform .22s var(--pop); }
#klc-pad .sw[aria-checked="true"] { background: var(--k-navy); }
#klc-pad .sw[aria-checked="true"] i { transform: translateX(20px); }
#klc-pad input[type="range"] { width: 100%; min-width: 0; justify-self: stretch; height: 44px; margin: 0; accent-color: var(--k-navy); touch-action: pan-y; cursor: pointer; }
#klc-pad .settings :focus-visible { outline: 2px solid var(--k-navy); outline-offset: 2px; }

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
   Phone (portrait, 390 x 844) reads like a mobile game, not a web page: ONE compact top bar (the time / weather chip, search, and a ☰
   that holds language, season, sound, planet and hide), the mode chip + settings gear under it, a small minimap at the right, and ONE
   bottom row of two pills (the place, the time of day) that open the places strip / the time dock as a bottom sheet. Every feature stays
   within two taps: ☰ then the item, the pill then the place or the hour, the minimap for the full map, the mode chip for the car. The
   credit line stays, small, at the very bottom. (ui/hud.js builds the ☰ button, the pills and the sheet state; the pad hides itself
   while a sheet is open.) Landscape phones keep the rules below; desktop and a tablet are untouched (no body.klc-pad / wider). */
@media (max-width: 720px) and (orientation: portrait) {
  /* top bar */
  body.klc-pad #klc-ui .brand { top: calc(8px + env(safe-area-inset-top, 0px)); left: 10px; right: 112px; gap: 0; }
  body.klc-pad #klc-ui .mark { display: none; }
  body.klc-pad #klc-ui .brand .chip { min-height: 44px; max-width: 100%; padding: 0 12px 0 14px; font-size: 12.5px; gap: 8px; overflow: hidden; }
  body.klc-pad #klc-ui .brand .chip .sep.wx, body.klc-pad #klc-ui .brand .chip .boats, body.klc-pad #klc-ui .brand .chip .tag { display: none; }
  body.klc-pad #klc-ui .brand .chip .wx { overflow: hidden; text-overflow: ellipsis; }
  body.klc-pad #klc-ui .arrivals { position: fixed; left: 10px; right: 10px; top: calc(60px + env(safe-area-inset-top, 0px)); width: auto; z-index: 3; }
  body.klc-pad #klc-ui .mbtn { display: grid; position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); right: 10px; width: 44px; height: 44px; z-index: 2; }
  body.klc-pad #klc-ui .mbtn[aria-expanded="true"] { background: var(--k-navy); color: #fff; }
  body.klc-pad #klc-x .xbar { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; left: auto; right: 62px; flex-direction: row; gap: 8px; }
  body.klc-pad #klc-x .xbar button[data-act="map"], body.klc-pad #klc-x .xbar button[data-act="drive"] { display: none; }   /* the minimap opens the map; the pad's 乗る / 降りる drive */
  /* the ☰ menu: the old right-hand column of five round icons, as a labelled list under the button */
  body.klc-pad #klc-ui .tools { display: none; position: absolute; top: calc(60px + env(safe-area-inset-top, 0px)); right: 10px; width: min(268px, calc(100vw - 20px)); flex-direction: column; align-items: stretch; gap: 2px; padding: 8px;
    border-radius: 22px; background: var(--k-glass-2); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); box-shadow: 0 16px 44px rgba(35, 40, 70, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.6) inset; z-index: 3; }
  body.klc-pad #klc-ui[data-menu="1"] .tools { display: flex; }
  body.klc-pad #klc-ui .tools { max-height: calc(100dvh - 72px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); overflow-y: auto; overscroll-behavior: contain; }   /* [emil-ui] 11 rows (名所, 操作設定 joined), 44 px each (the touch minimum; they were 48): at 390 x 844 the menu ends above ホヤぼーや's credit, and on a 667 px phone it scrolls inside itself */
  body.klc-pad #klc-ui[data-menu="1"], body.klc-pad #klc-ui:not([data-sheet=""]) { z-index: 5; }   /* above the minimap while the menu or a sheet is open */
  body.klc-pad #klc-ui .tools .mhead { display: grid; gap: 4px; padding: 6px 10px 10px; border-bottom: 1px solid var(--k-line); margin-bottom: 4px; }
  body.klc-pad #klc-ui .tools .mhead b { font: 900 17px/1.1 var(--k-round); letter-spacing: .05em; color: var(--k-navy); }
  body.klc-pad #klc-ui .tools .mhead small { font: 800 8.5px/1 var(--k-sans); letter-spacing: .3em; color: var(--k-muted); }
  body.klc-pad #klc-ui .tools .round, body.klc-pad #klc-ui .tools .round.txt { width: auto; height: 44px; border-radius: 12px; justify-content: flex-start; justify-items: start; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; font: 700 14px/1 var(--k-round); text-align: left; }
  body.klc-pad #klc-ui .tools .round.txt { font-size: 13px; }
  body.klc-pad #klc-ui .tools .round > svg { width: 20px; height: 20px; }
  body.klc-pad #klc-ui .tools .round.txt:first-of-type { min-width: 0; }
  body.klc-pad #klc-ui .tools .round .lbl { display: inline; font: 700 14px/1.2 var(--k-round); color: var(--k-ink); }
  body.klc-pad #klc-ui .tools .round:active { transform: none; background: rgba(31, 58, 104, 0.08); }   /* [ui-b2:6] a menu row presses with its background; the HUD's scale(0.97) (ui/style.js) is for buttons, not for rows of a list */
  body.klc-pad #klc-ui .tools .round[aria-pressed="true"] { background: rgba(31, 58, 104, 0.1); color: var(--k-navy); }
  /* the minimap: small, at the right, under the ☰ */
  body.klc-pad #klc-x .mini { left: auto; right: 10px; top: calc(60px + env(safe-area-inset-top, 0px)); bottom: auto; width: 84px; justify-items: end; }
  body.klc-pad #klc-x .mini canvas { width: 84px; height: 84px; }
  body.klc-pad #klc-x .mini .cap { max-width: 150px; font-size: 10.5px; padding: 3px 8px; }
  /* the full map covers the screen: no minimap on top of its buttons, no click hint on a phone */
  body.klc-pad #klc-x[data-map="1"] .mini, body.klc-pad #klc-x[data-search="1"] .mini { display: none; }
  body.klc-pad #klc-x[data-grace="1"] .mini { pointer-events: none; }
  body.klc-pad #klc-x .xmap .hd span { display: none; }
  body.klc-pad #klc-x .xmap .hd b { white-space: nowrap; flex: none; }
  /* the car's speed chip: under the mode chip, left */
  body.klc-pad #klc-x .xdrive { top: calc(116px + env(safe-area-inset-top, 0px)); bottom: auto; left: 10px; transform: none; max-width: calc(100vw - 124px); }
  body.klc-pad #klc-x .xdrive .rd { max-width: 92px; }
  /* [emil-ui] No bottom row: the time chip opens the time sheet, the ☰ opens 名所, and the time sheet holds 今日の入船 (hud.js). The bottom of the screen is the thumbs'.
     The band just above the credit line (24 to 72 px) is ホヤぼーや's credit's (play/avatar/index.js), which nothing may cover while he is shown: the sheets rise above it
     (80 px), and the pad steps aside while one is open. */
  body.klc-pad #klc-ui .brand .chip[aria-expanded="true"] { background: var(--k-navy); color: #fff; }
  body.klc-pad #klc-ui .brand .chip[aria-expanded="true"] :is(.clock, .wx) { color: #fff; }
  body.klc-pad #klc-ui .brand .chip[aria-expanded="true"] .caret { transform: rotate(180deg); }
  body.klc-pad #klc-ui .tools .prow, body.klc-pad #klc-ui .tools .pset { display: flex; }
  body.klc-pad #klc-pad .gear { display: none; }
  body.klc-pad #klc-ui .dock .arr { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px 0 12px; }
  body.klc-pad #klc-ui .dock .arr[aria-expanded="true"] { background: var(--k-navy); color: #fff; }
  body.klc-pad #klc-ui .dock, body.klc-pad #klc-ui .places { display: none; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
  body.klc-pad #klc-ui[data-sheet="time"] .dock { display: flex; }
  body.klc-pad #klc-ui[data-sheet="places"] .places { display: block; }
  body.klc-pad #klc-ui .attr { font-size: 8px; padding: 1px 8px; pointer-events: none; }
  body.klc-pad #klc-ui .attr .lic { display: none; }   /* the 8 px licence link was a 40 x 11 px target: the ⓘ item in the ☰ menu opens the credits and the licence at 44 px */
  /* [integrate:fix] the credits sheet (☰ > ⓘ) */
  body.klc-pad #klc-ui .tools .cbtn { display: flex; }
  body.klc-pad #klc-ui[data-credits="1"] .credits { display: block; position: absolute; left: 10px; right: 10px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); padding: 10px 12px 12px 16px; border-radius: 22px; z-index: 3; pointer-events: auto; }
  body.klc-pad #klc-ui .credits .ch { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  body.klc-pad #klc-ui .credits h3 { margin: 0; font: 900 15px/1.2 var(--k-round); color: var(--k-navy); letter-spacing: .04em; }
  body.klc-pad #klc-ui .credits .cx { width: 44px; height: 44px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--k-navy); }
  body.klc-pad #klc-ui .credits .cx svg { width: 20px; height: 20px; }
  body.klc-pad #klc-ui .credits p { margin: 2px 0 8px; font: 500 12.5px/1.6 var(--k-sans); color: var(--k-ink); }
  body.klc-pad #klc-ui .credits .clink { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--k-navy); color: #fff; font: 700 13px/1 var(--k-round); text-decoration: none; transition: transform var(--dur-press) var(--ease-out); }
  body.klc-pad #klc-ui .credits .clink:active { transform: scale(0.97); }
  /* the minimap steps aside for the ☰ menu, the arrivals panel and the credits (the way it does for search and the map): it drew over the arrivals rows */
  body.klc-pad.klc-hud-open #klc-x .mini { display: none; }
  /* 自動で巡る: the places sheet's first chip (it was display: none here, so the tour could not be started on a portrait phone) */
  body.klc-pad #klc-ui[data-sheet="places"] .places { display: flex; align-items: center; gap: 6px; }
  body.klc-pad #klc-ui .places .auto { display: inline-flex; order: -1; flex: none; margin: 0; width: auto; height: 44px; padding: 0 14px 0 12px; gap: 6px; border-radius: 999px; }
  body.klc-pad #klc-ui .places ul { flex: 1 1 auto; min-width: 0; -webkit-mask-image: none; mask-image: none; }
  /* the strip says "scroll": the edge that has more stops fades (hud.js sets data-fade from the scroll position) */
  body.klc-pad #klc-ui .places[data-fade="r"] ul { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 56px), transparent); }
  body.klc-pad #klc-ui .places[data-fade="l"] ul { -webkit-mask-image: linear-gradient(90deg, transparent, #000 56px); mask-image: linear-gradient(90deg, transparent, #000 56px); }
  body.klc-pad #klc-ui .places[data-fade="lr"] ul { -webkit-mask-image: linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 56px), transparent); mask-image: linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 56px), transparent); }
  /* [ui-b2:7] The ☰ menu, the two sheets and the credits are solid, and they move.
     Solid: #klc-ui is pointer-events: none and only its buttons switch it back on, so the padding of a panel and the gaps between its buttons were holes. 4 of the 5 points the review put
     inside the open time sheet went through to the 3D view, and counted as "outside" (hud.js closes on a pointerdown whose target is not in a panel). Now the panels take the touch.
     Moving: they enter from display: none with @starting-style and leave with transition-behavior: allow-discrete (the element stays displayed while it fades). The menu grows out of its ☰
     button (top right: from --pop-scale, 220 ms in, 140 ms out); a sheet rises --shift * 3 = 24 px (280 ms on the drawer curve in, 200 ms out). No scrim: the scene stays undimmed.
     Where allow-discrete is missing (Safari before 17.4) they appear and disappear as before; before 17.5 (no @starting-style) only the exit moves. A sheet that is replaced by the other
     one leaves at once (two glass panels on the same spot for 200 ms read as clutter). Under prefers-reduced-motion ui/style.js switches every HUD transition off. */
  body.klc-pad #klc-ui .tools, body.klc-pad #klc-ui .dock, body.klc-pad #klc-ui .places { pointer-events: auto; }
  @supports (transition-behavior: allow-discrete) {
    body.klc-pad #klc-ui .tools { opacity: 0; transform: scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5)); transform-origin: top right;
      transition: opacity var(--dur-exit) var(--ease-out), transform var(--dur-exit) var(--ease-out), display var(--dur-exit) allow-discrete; }
    body.klc-pad #klc-ui[data-menu="1"] .tools { opacity: 1; transform: none; transition-duration: var(--dur-enter); }
    body.klc-pad #klc-ui .dock, body.klc-pad #klc-ui .places, body.klc-pad #klc-ui .credits { opacity: 0; transform: translateY(calc(var(--shift) * 3));
      transition: opacity var(--dur-sheet-exit) var(--ease-out), transform var(--dur-sheet-exit) var(--ease-out), display var(--dur-sheet-exit) allow-discrete; }
    body.klc-pad #klc-ui[data-sheet="time"] .dock, body.klc-pad #klc-ui[data-sheet="places"] .places, body.klc-pad #klc-ui[data-credits="1"] .credits { opacity: 1; transform: none; transition-duration: var(--dur-sheet); transition-timing-function: var(--ease-drawer); }
    body.klc-pad #klc-ui[data-sheet="places"] .dock, body.klc-pad #klc-ui[data-sheet="time"] .places { transition: none; }
    @starting-style {
      body.klc-pad #klc-ui[data-menu="1"] .tools { opacity: 0; transform: scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5)); }
      body.klc-pad #klc-ui[data-sheet="time"] .dock, body.klc-pad #klc-ui[data-sheet="places"] .places, body.klc-pad #klc-ui[data-credits="1"] .credits { opacity: 0; transform: translateY(calc(var(--shift) * 3)); }
    }
  }
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
  /* [emil-ui] search only: the minimap opens the map, and 乗る / 降りる are the pad's (運転 / 降りる here was the third copy) */
  body.klc-pad #klc-x .xbar button[data-act="map"], body.klc-pad #klc-x .xbar button[data-act="drive"] { display: none; }
  body.klc-pad #klc-x .mini { top: calc(8px + env(safe-area-inset-top, 0px)); bottom: auto; left: 50%; right: auto; transform: translateX(-50%); width: 96px; gap: 4px; }
  body.klc-pad #klc-x .mini canvas { width: 96px; height: 96px; }
  body.klc-pad #klc-x .mini .cap { max-width: 150px; padding: 3px 8px; font-size: 10.5px; }
  body.klc-pad #klc-x .mini .cap small { display: none; }
  body.klc-pad.klc-pad-set #klc-ui .dock, body.klc-pad.klc-pad-set #klc-ui .places { display: none !important; }   /* the settings popover is open: nothing sits under it */
  body.klc-pad #klc-ui .places { width: 186px; left: calc(8px + env(safe-area-inset-left, 0px)); }
  body.klc-pad #klc-ui .places .ph .lbl { display: none; }   /* (めぐる stacked one glyph per line in 160 px; the place name and the caret say what it is) */
  body.klc-pad #klc-ui .places .ph .cur { margin-left: 0; flex: 1 1 auto; text-align: left; }
  body.klc-pad #klc-ui .places .ph .cur { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.klc-pad #klc-ui .places .auto { display: none; }
  body.klc-pad #klc-ui .dock .pill[data-act="view"], body.klc-pad #klc-ui .dock .div { display: none; }
  body.klc-pad #klc-ui .dock .seg button { min-width: 46px; padding: 7px 5px 6px; }   /* (the dock is centred; the places strip needs the room on its left) */
  /* the live clock and the temperature already sit in the brand chip; the dock stays the five times and the photo button.
     a pinned hour still offers ライブに戻る, floated above the dock so the strip keeps its gap */
  body.klc-pad #klc-ui .livebar { display: none; }
  body.klc-pad #klc-ui .livebar:has(.back:not([hidden])) { display: flex; position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); width: max-content; }
  body.klc-pad #klc-ui .livebar .dclock, body.klc-pad #klc-ui .livebar .wxbtn, body.klc-pad #klc-ui .livebar .livechip { display: none; }
}
@media (prefers-reduced-motion: reduce) { #klc-pad *, #klc-pad { transition-duration: 0s !important; animation: none !important; } }
/* [integrate:fix] 44 px touch targets on any phone with the pad: the time sheet's 歩く / 飛ぶ and 写真, the search close, the map's zoom and close */
body.klc-pad #klc-ui .dock .pill { height: 44px; min-width: 44px; }
body.klc-pad #klc-x .xsearch .x { width: 44px; height: 44px; }
body.klc-pad #klc-x .xmap .hd button { width: 44px; height: 44px; }
`;
