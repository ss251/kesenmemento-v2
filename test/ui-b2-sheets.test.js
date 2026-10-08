// [ui-b2] UI lane B, round 2, row 7 of the UI review (not included): the phone's ☰ menu, the two bottom sheets and the credits sheet take the touches inside them (they were holes: 4 of 5
// points inside the open time sheet fell through to the 3D view and closed the sheet) and they move: enter with @starting-style, leave with transition-behavior: allow-discrete; the menu
// grows out of its ☰ button, a sheet rises 24 px (280 ms in, 200 ms out); no scrim. The arrivals popover moves the same way. CSS read by test/lib/css.js; the real-browser numbers (an rAF trace
// of the dock's opacity, five hit tests inside an open sheet, the exits) are in test/ui-b2.e2e.test.js (opt-in, through the machine gate).
import { describe, test, expect } from "bun:test";
import { CSS as HUD_CSS } from "../src/anime/ui/style.js";
import { CSS as PAD_CSS } from "../src/anime/ui/touchpad-style.js";
import { parseCss, decl, rulesOf } from "./lib/css.js";

const HUD = parseCss(HUD_CSS), PAD = parseCss(PAD_CSS);
const PORTRAIT = "@media (max-width: 720px) and (orientation: portrait)", DISCRETE = "@supports (transition-behavior: allow-discrete)", START = "@starting-style";
const P = [PORTRAIT], PD = [PORTRAIT, DISCRETE], PDS = [PORTRAIT, DISCRETE, START];
const ms = (s) => Number(String(s).replace("ms", ""));
const tok = (k) => decl(HUD, ":root", k);
const MENU = "body.klc-pad #klc-ui .tools", DOCK = "body.klc-pad #klc-ui .dock", PLACES = "body.klc-pad #klc-ui .places", CREDITS = "body.klc-pad #klc-ui .credits";
const OPEN_MENU = 'body.klc-pad #klc-ui[data-menu="1"] .tools', OPEN_DOCK = 'body.klc-pad #klc-ui[data-sheet="time"] .dock', OPEN_PLACES = 'body.klc-pad #klc-ui[data-sheet="places"] .places', OPEN_CREDITS = 'body.klc-pad #klc-ui[data-credits="1"] .credits';

describe("ui-b2 row 7: the open panels are solid (no more holes)", () => {
  test("the menu, the dock and the places strip take the touch on their padding and between their buttons; the credits sheet already did", () => {
    for (const sel of [MENU, DOCK, PLACES]) expect([sel, decl(PAD, sel, "pointer-events", P)]).toEqual([sel, "auto"]);
    expect(decl(PAD, OPEN_CREDITS, "pointer-events", P)).toBe("auto");
  });
  test("the HUD root is still click-through (only panels and buttons take touches: the scene gets the rest)", () => {
    expect(decl(HUD, "#klc-ui", "pointer-events")).toBe("none");
  });
  test("the panels' display rules are as they were (the e2e suites read getComputedStyle(...).display)", () => {
    expect(decl(PAD, MENU, "display", P)).toBe("none"); expect(decl(PAD, OPEN_MENU, "display", P)).toBe("flex");
    expect(decl(PAD, DOCK, "display", P)).toBe("none"); expect(decl(PAD, OPEN_DOCK, "display", P)).toBe("flex");
    expect(decl(PAD, PLACES, "display", P)).toBe("none"); expect(decl(PAD, OPEN_PLACES, "display", P)).toBe("flex");   // (the later rule: block, then flex)
    expect(decl(PAD, OPEN_CREDITS, "display", P)).toBe("block");
    expect(decl(HUD, "#klc-ui .credits", "display")).toBe("none");
  });
});

describe("ui-b2 row 7: they move", () => {
  test("every motion token is used by a stylesheet (--ease-in-out is reserved for lane A's veil, row 4: UI review synthesis makes it depend on these tokens)", () => {
    const all = [HUD_CSS, PAD_CSS].join("\n");
    for (const k of ["--ease-out", "--dur-press", "--dur-fast", "--dur-enter", "--dur-exit", "--dur-sheet", "--dur-sheet-exit", "--shift", "--pop-scale", "--ease-drawer"]) expect([k, all.includes(`var(${k})`)]).toEqual([k, true]);
  });
  test("the menu grows out of its ☰ button (top right): from --pop-scale and half a shift up, 220 ms in, 140 ms out, ease-out, display held while it fades", () => {
    expect(decl(PAD, MENU, "opacity", PD)).toBe("0");
    expect(decl(PAD, MENU, "transform", PD)).toBe("scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5))");
    expect(decl(PAD, MENU, "transform-origin", PD)).toBe("top right");
    expect(decl(PAD, MENU, "transition", PD)).toBe("opacity var(--dur-exit) var(--ease-out), transform var(--dur-exit) var(--ease-out), display var(--dur-exit) allow-discrete");
    expect(decl(PAD, OPEN_MENU, "opacity", PD)).toBe("1"); expect(decl(PAD, OPEN_MENU, "transform", PD)).toBe("none");
    expect(decl(PAD, OPEN_MENU, "transition-duration", PD)).toBe("var(--dur-enter)");
    expect([tok("--dur-enter"), tok("--dur-exit"), tok("--pop-scale")]).toEqual(["220ms", "140ms", "0.95"]);   // never from 0
  });
  test("the sheets and the credits rise --shift x 3 = 24 px: 280 ms in on the drawer curve, 200 ms out on ease-out", () => {
    for (const sel of [DOCK, PLACES, CREDITS]) {
      expect([sel, decl(PAD, sel, "opacity", PD)]).toEqual([sel, "0"]);
      expect([sel, decl(PAD, sel, "transform", PD)]).toEqual([sel, "translateY(calc(var(--shift) * 3))"]);
      expect([sel, decl(PAD, sel, "transition", PD)]).toEqual([sel, "opacity var(--dur-sheet-exit) var(--ease-out), transform var(--dur-sheet-exit) var(--ease-out), display var(--dur-sheet-exit) allow-discrete"]);
    }
    for (const sel of [OPEN_DOCK, OPEN_PLACES, OPEN_CREDITS]) {
      expect([sel, decl(PAD, sel, "opacity", PD)]).toEqual([sel, "1"]); expect([sel, decl(PAD, sel, "transform", PD)]).toEqual([sel, "none"]);
      expect([sel, decl(PAD, sel, "transition-duration", PD)]).toEqual([sel, "var(--dur-sheet)"]); expect([sel, decl(PAD, sel, "transition-timing-function", PD)]).toEqual([sel, "var(--ease-drawer)"]);
    }
    expect(3 * parseFloat(tok("--shift"))).toBe(24); expect([ms(tok("--dur-sheet")), ms(tok("--dur-sheet-exit"))]).toEqual([280, 200]); expect(tok("--ease-drawer")).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
  });
  test("the entry starts from @starting-style: the same transform and opacity as the closed state, on every open rule (same selector, so the cascade keeps it)", () => {
    expect(decl(PAD, OPEN_MENU, "opacity", PDS)).toBe("0"); expect(decl(PAD, OPEN_MENU, "transform", PDS)).toBe("scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5))");
    for (const sel of [OPEN_DOCK, OPEN_PLACES, OPEN_CREDITS]) { expect([sel, decl(PAD, sel, "opacity", PDS)]).toEqual([sel, "0"]); expect([sel, decl(PAD, sel, "transform", PDS)]).toEqual([sel, "translateY(calc(var(--shift) * 3))"]); }
  });
  test("a sheet that the other one replaces leaves at once (two glass panels on one spot for 200 ms read as clutter); closing alone animates", () => {
    expect(decl(PAD, 'body.klc-pad #klc-ui[data-sheet="places"] .dock', "transition", PD)).toBe("none");
    expect(decl(PAD, 'body.klc-pad #klc-ui[data-sheet="time"] .places', "transition", PD)).toBe("none");
    expect(rulesOf(PAD, 'body.klc-pad #klc-ui[data-sheet=""] .dock')).toEqual([]);
  });
  test("it all sits behind @supports (transition-behavior: allow-discrete): where that is missing the panels appear and disappear as before (no half-open state)", () => {
    for (const sel of [MENU, DOCK, PLACES, CREDITS]) expect([sel, rulesOf(PAD, sel).filter((r) => "opacity" in r.decl || "transition" in r.decl).every((r) => r.at.includes(DISCRETE))]).toEqual([sel, true]);
  });
  test("no scrim: nothing dims the scene behind a sheet or the menu (motion 007: it would dim the art, and Safari 26 may sample the layer)", () => {
    const portrait = PAD.filter((r) => r.at[0] === PORTRAIT);
    for (const r of portrait) { expect([r.sel, /::(before|after)/.test(r.sel) && /inset: 0|100%/.test(JSON.stringify(r.decl))]).toEqual([r.sel, false]); }
    for (const r of [...HUD, ...PAD]) expect([r.sel, /\[data-modal/.test(r.sel)]).toEqual([r.sel, false]);
    // a rule whose subject is the HUD root (or a pseudo-element of it) while a menu, a sheet or the credits are open is where a dimming layer would be drawn: it may stack (z-index), not paint
    for (const r of [...HUD, ...PAD]) if (/#klc-ui(\[data-(menu|sheet|credits)[^\]]*\]|:not\(\[data-sheet=""\]\))(::before|::after)?$/.test(r.sel)) expect([r.sel, Object.keys(r.decl).filter((k) => /^(background|backdrop-filter|-webkit-backdrop-filter|opacity|filter|content)/.test(k))]).toEqual([r.sel, []]);
  });
  test("the pad leaves quickly and comes back at the pace of what replaces it (it left in .3 s and took .35 s to return, while a sheet popped in at 0 ms)", () => {
    expect(decl(PAD, "#klc-pad", "transition")).toBe("opacity var(--dur-enter) var(--ease-out), visibility 0s");
    expect(decl(PAD, '#klc-pad[data-hidden="1"]', "transition")).toBe("opacity var(--dur-exit) var(--ease-out), visibility 0s var(--dur-exit)");
  });
});

describe("ui-b2 row 7: the arrivals popover, and the guard that keeps a rebuild from replaying an entry", () => {
  const D = [DISCRETE], DS = [DISCRETE, START];
  test("the popover grows out of the chip (top left): 220 ms in, 140 ms out, from @starting-style, display held while it fades", () => {
    expect(decl(HUD, "#klc-ui .arrivals", "transform-origin", D)).toBe("top left");
    expect(decl(HUD, "#klc-ui .arrivals", "transition", D)).toBe("opacity var(--dur-enter) var(--ease-out), transform var(--dur-enter) var(--ease-out), display var(--dur-enter) allow-discrete");
    expect(decl(HUD, "#klc-ui .arrivals[hidden]", "opacity", D)).toBe("0"); expect(decl(HUD, "#klc-ui .arrivals[hidden]", "transition-duration", D)).toBe("var(--dur-exit)");
    expect(decl(HUD, "#klc-ui .arrivals[hidden]", "transform", D)).toBe("scale(var(--pop-scale)) translateY(calc(var(--shift) * -0.5))");
    expect(decl(HUD, "#klc-ui .arrivals:not([hidden])", "opacity", DS)).toBe("0");
    expect(decl(HUD, "#klc-ui .arrivals[hidden]", "display")).toBe("none");   // the closed state is still display: none (hud.js toggles `hidden`)
  });
  test("data-still on #klc-ui switches every HUD transition off for the frames after render() has replaced the markup (inert until hud.js sets it)", () => {
    expect(decl(HUD, "#klc-ui[data-still] *", "transition")).toBe("none !important"); expect(decl(HUD, "#klc-ui[data-still]", "transition")).toBe("none !important");
  });
  test("reduced motion still switches every HUD transition off (a gentler policy is row 18, after the demo); the tokens drop the movement for any later consumer", () => {
    expect(decl(HUD, "#klc-ui *", "transition", ["@media (prefers-reduced-motion: reduce)"])).toBe("none !important");
    expect(decl(HUD, ":root", "--shift", ["@media (prefers-reduced-motion: reduce)"])).toBe("0px");
  });
});
