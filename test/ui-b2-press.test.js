// [ui-b2] UI lane B, round 2, row 6 of the UI review (not included): the press layer. Motion tokens on :root; :active scale(0.97) in 140 ms on every HUD, explore and ship button
// (the pad's 0.92 is 0.95); the remaining :hover rules behind the hover media query; a two-tone focus ring; html overscroll-behavior: none.
// The CSS is read by a small parser (test/lib/css.js: a rule is found by selector and at-rule, not by its spelling). The real-browser numbers (the computed matrix of a pressed
// button, the ring, the tokens on the document) are in test/ui-b2.e2e.test.js (opt-in, through the machine gate).
import { describe, test, expect } from "bun:test";
import { CSS as HUD_CSS, CONTRIB_CSS } from "../src/anime/ui/style.js";
import { CSS as PAD_CSS } from "../src/anime/ui/touchpad-style.js";
import { CSS as XUI_CSS } from "../src/anime/world/explore/ui.js";
import { parseCss, decl, rulesOf, cssIn, read } from "./lib/css.js";

const HUD = parseCss(HUD_CSS), PAD = parseCss(PAD_CSS), XUI = parseCss(XUI_CSS);
const SHIP_SRC = read("src/anime/ui/ship.js"), STORY_SRC = read("src/anime/world/explore/storypins.js");
const SHIP = parseCss(cssIn(SHIP_SRC, "const CSS =")), BOARD = parseCss(cssIn(SHIP_SRC, "const BOARD_CSS =")), STORY = parseCss(cssIn(STORY_SRC, "const CSS ="));
const HOVER = ["@media (hover: hover) and (pointer: fine)"];
const INDEX = parseCss([...read("src/anime/index.html").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n"));   // (the page's own <style>: first paint)

describe("ui-b2 row 6: the motion tokens", () => {
  const T = { "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)", "--ease-in-out": "cubic-bezier(0.77, 0, 0.175, 1)", "--ease-drawer": "cubic-bezier(0.32, 0.72, 0, 1)",
    "--dur-press": "140ms", "--dur-fast": "160ms", "--dur-enter": "220ms", "--dur-exit": "140ms", "--dur-sheet": "280ms", "--dur-sheet-exit": "200ms", "--shift": "8px", "--pop-scale": "0.95" };
  test("the eleven tokens of motion plan 002 are on :root, with the plan's values", () => {
    for (const [k, v] of Object.entries(T)) expect([k, decl(HUD, ":root", k)]).toEqual([k, v]);
  });
  test("reduced motion keeps the fades and drops the movement: no shift, no pop scale, 120 ms, 80 ms for a press", () => {
    const R = ["@media (prefers-reduced-motion: reduce)"];
    expect(decl(HUD, ":root", "--shift", R)).toBe("0px"); expect(decl(HUD, ":root", "--pop-scale", R)).toBe("1");
    for (const k of ["--dur-enter", "--dur-exit", "--dur-sheet", "--dur-sheet-exit", "--dur-fast"]) expect([k, decl(HUD, ":root", k, R)]).toEqual([k, "120ms"]);
    expect(decl(HUD, ":root", "--dur-press", R)).toBe("80ms");
  });
  test("the press and the colour change use the tokens in every stylesheet (the tokens of the sheets' motion are used by row 7: test/ui-b2-sheets.test.js)", () => {
    const all = [HUD_CSS, PAD_CSS, XUI_CSS, cssIn(SHIP_SRC, "const CSS ="), cssIn(SHIP_SRC, "const BOARD_CSS ="), cssIn(STORY_SRC, "const CSS =")].join("\n");
    for (const k of ["--ease-out", "--dur-press", "--dur-fast"]) expect([k, all.includes(`var(${k})`)]).toEqual([k, true]);
    for (const [name, css] of [["ui/style.js", HUD_CSS], ["explore/ui.js", XUI_CSS], ["ui/ship.js", cssIn(SHIP_SRC, "const CSS =")], ["ui/ship.js board", cssIn(SHIP_SRC, "const BOARD_CSS =")], ["storypins.js", cssIn(STORY_SRC, "const CSS =")]])
      expect([name, /var\(--dur-press\)/.test(css) && /var\(--ease-out\)/.test(css)]).toEqual([name, true]);
  });
  test("no stylesheet but ui/style.js defines them (one source), and the pad keeps its own --ease / --pop", () => {
    for (const [name, css] of [["touchpad-style.js", PAD_CSS], ["explore/ui.js", XUI_CSS], ["ship.js", cssIn(SHIP_SRC, "const CSS =")]]) expect([name, /--(ease-out|dur-press|dur-fast|shift|pop-scale):/.test(css)]).toEqual([name, false]);
    expect(decl(PAD, "#klc-pad", "--ease")).toBe("cubic-bezier(0.23, 1, 0.32, 1)"); expect(decl(PAD, "#klc-pad", "--pop")).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });
});

describe("ui-b2 row 6: every button presses (scale 0.97 in --dur-press on --ease-out)", () => {
  const PRESS = "transform var(--dur-press) var(--ease-out)";
  test("the HUD: any #klc-ui button, and the hide-UI eye, scale to 0.97; the transition names the transform", () => {
    expect(decl(HUD, "#klc-ui button:active", "transform")).toBe("scale(0.97)");
    expect(decl(HUD, "#klc-ui-restore:active", "transform")).toBe("scale(0.97)");
    expect(decl(HUD, "#klc-ui button", "transition")).toContain(PRESS);
    expect(decl(HUD, "#klc-ui-restore", "transition")).toContain(PRESS);
  });
  test("a rule that sets its own transition on a HUD button keeps the press in it (a more specific rule would otherwise cancel it)", () => {
    const own = HUD.filter((r) => r.decl.transition && /(^| )(button|\.pill)\b/.test(r.sel) && !/\.caret|\.dot|svg|\.cur/.test(r.sel) && !r.sel.startsWith("#klc-contrib") && !r.at.some((a) => a.includes("allow-discrete")));
    expect(own.map((r) => r.sel)).toEqual(expect.arrayContaining(["#klc-ui .seg button", "#klc-ui .pill", "#klc-ui button"]));
    for (const r of own) expect([r.sel, r.decl.transition.includes("transform var(--dur-press)")]).toEqual([r.sel, true]);
  });
  test("the preset buttons and the pills keep their colour fade (a pressed preset changes colour in --dur-fast)", () => {
    for (const sel of ["#klc-ui .seg button", "#klc-ui .pill"]) { expect(decl(HUD, sel, "transition")).toContain("background-color var(--dur-fast) ease"); expect(decl(HUD, sel, "transition")).toContain("color var(--dur-fast) ease"); }
  });
  test("list rows press with their background, not by scale (a stop in the places list, a search result, a row of the phone's ☰ menu)", () => {
    expect(decl(HUD, "#klc-ui .places li button:active", "transform")).toBe("none"); expect(decl(HUD, "#klc-ui .places li button:active", "background")).toBe("rgba(31, 58, 104, 0.12)");
    expect(decl(XUI, "#klc-x .xsearch li button:active", "transform")).toBe("none"); expect(decl(XUI, "#klc-x .xsearch li button:active", "background")).toBe("rgba(31, 58, 104, 0.12)");
    expect(decl(PAD, "body.klc-pad #klc-ui .tools .round:active", "transform", ["@media (max-width: 720px) and (orientation: portrait)"])).toBe("none");
    expect(decl(PAD, "body.klc-pad #klc-ui .tools .round:active", "background", ["@media (max-width: 720px) and (orientation: portrait)"])).toBe("rgba(31, 58, 104, 0.08)");
  });
  test("the explore UI: every #klc-x button presses, with the same transition", () => {
    expect(decl(XUI, "#klc-x button:active", "transform")).toBe("scale(0.97)"); expect(decl(XUI, "#klc-x button", "transition")).toContain(PRESS);
  });
  test("the ship UI, the boarding chip and the story card's close button", () => {
    expect(decl(SHIP, "#klc-ship button:not(:disabled):active", "transform")).toBe("scale(.97)"); expect(decl(SHIP, "#klc-ship button", "transition")).toContain(PRESS);
    expect(decl(BOARD, "#klc-board button:active", "transform")).toBe("scale(.97)"); expect(decl(BOARD, "#klc-board button", "transition")).toContain(PRESS);
    expect(decl(STORY, "#klc-story .x:active", "transform")).toBe("scale(.97)"); expect(decl(STORY, "#klc-story .x", "transition")).toContain(PRESS);
  });
  test("a disabled ship button does not press", () => {
    expect(rulesOf(SHIP, "#klc-ship button:active")).toEqual([]);   // only the :not(:disabled) form exists
  });
  test("「まちへ出る」 presses too, on the same transition (its base rules are index.html's)", () => {
    expect(decl(HUD, "#go:enabled:active", "transform")).toBe("scale(0.97)"); expect(decl(HUD, "#go", "transition")).toBe("opacity .3s, transform var(--dur-press) var(--ease-out)");
  });
  test("the pad: its buttons press to 0.95 (they were 0.92), the mode chip too (0.94); the press is a plain ease-out and only the entrance and the release pop", () => {
    expect(decl(PAD, "#klc-pad .btn:active", "transform")).toBe("scale(0.95)"); expect(decl(PAD, "#klc-pad .btn.down", "transform")).toBe("scale(0.95)");
    expect(decl(PAD, "#klc-pad .chip button:active", "transform")).toBe("scale(0.95)");
    expect(decl(PAD, '#klc-pad .btn[data-show="1"]:not(.down):not(:active)', "transition-timing-function")).toBe("var(--pop), ease, ease, ease, ease");
    expect(rulesOf(PAD, '#klc-pad .btn[data-show="1"]')).toEqual([]);   // (the old selector, which also caught the press)
  });
});

describe("ui-b2: round 1's intro block lives in index.html only", () => {
  // Round 1 styled the intro card from this sheet (index.html was lane C's); lane C pasted the block into index.html in round 2 (so the card is styled from first paint, not when the HUD
  // mounts) and asked for this copy to go: a second copy would win by order for the rules it repeats and drift from the page's.
  test("the HUD sheet carries no #intro rule and no marker of that block; its only #go:focus-visible rule is the press layer's ring for hover devices", () => {
    expect(HUD_CSS).not.toContain("[ui-b:8]");
    expect(HUD.filter((r) => /#intro\b/.test(r.sel)).map((r) => r.sel)).toEqual([]);
    expect(rulesOf(HUD, "#go:focus-visible").every((r) => r.at.join() === HOVER.join())).toBe(true);   // (the touch rule that hides the ring is index.html's, below)
  });
  test("index.html's loader has what the block gave, in the 「帰港」 form: an exit (the iris, or a quick fade), its own layout for a short landscape screen, and no focus ring on a touch screen", () => {
    expect(decl(INDEX, "#intro.ld-fade", "transition")).toMatch(/^opacity 160ms linear/);
    expect(decl(INDEX, "#intro", "--hz", ["@media (orientation: landscape) and (max-height: 520px)"])).toBe("66%");
    expect(decl(INDEX, "#intro #go:focus-visible", "outline", ["@media (hover: none) and (pointer: coarse)"])).toBe("none");
  });
});

describe("ui-b2 row 6: hover only where there is hover", () => {
  test("the HUD's seven :hover rules and the report sheet's six are all inside the hover media query (round 1 gated the HUD's, this row the sheet's: it is hidden until launch, but it ships)", () => {
    const hud = HUD.filter((r) => /:hover/.test(r.sel)), contrib = parseCss(CONTRIB_CSS).filter((r) => /:hover/.test(r.sel));
    expect(hud.length).toBe(7); expect(contrib.length).toBe(6);   // (.kc-x and .kc-lang share a rule: two selectors)
    for (const r of [...hud, ...contrib]) expect([r.sel, r.at]).toEqual([r.sel, HOVER]);
  });
  test("a search result's hover is gated and the selected row (arrow keys) is not: it must not need a hover", () => {
    expect(decl(XUI, "#klc-x .xsearch li button:hover", "background", HOVER)).toBe("rgba(31, 58, 104, 0.08)");
    expect(decl(XUI, '#klc-x .xsearch li button[aria-selected="true"]', "background")).toBe("rgba(31, 58, 104, 0.08)");
    expect(rulesOf(XUI, "#klc-x .xsearch li button:hover").every((r) => r.at.join() === HOVER.join())).toBe(true);
  });
});

describe("ui-b2 row 6: a focus ring that reads on anything, and html does not rubber-band", () => {
  const RING = { outline: "2px solid var(--ring-ink)", "outline-offset": "2px", "box-shadow": "0 0 0 5px var(--ring-halo)" };
  // outside ui/style.js (which defines the tokens) the two tones carry their value as a fallback: a stylesheet that mounts without the HUD's must still draw a ring, not none
  const FB = (r) => ({ outline: r.outline.replace("var(--ring-ink)", "var(--ring-ink, #1f3a68)"), "outline-offset": r["outline-offset"], "box-shadow": r["box-shadow"].replace("var(--ring-halo)", "var(--ring-halo, rgba(255, 255, 255, 0.92))") });
  test("the tones are tokens: navy and a near-white halo", () => {
    expect(decl(HUD, ":root", "--ring-ink")).toBe("#1f3a68"); expect(decl(HUD, ":root", "--ring-halo")).toBe("rgba(255, 255, 255, 0.92)");
  });
  test("every :focus-visible rule of the product draws navy between white bands (no more 2 px #2f7fae: 2.1:1 on dark water)", () => {
    const fb = FB(RING);
    for (const [k, v] of Object.entries(RING)) {
      expect([k, decl(HUD, "#klc-ui button:focus-visible", k)]).toEqual([k, v]); expect([k, decl(HUD, "#klc-ui #quality:focus-visible", k)]).toEqual([k, v]);
      expect([k, decl(HUD, "#go:focus-visible", k, HOVER)]).toEqual([k, v]);
      expect([k, decl(XUI, "#klc-x button:focus-visible", k)]).toEqual([k, fb[k]]);
      expect([k, decl(SHIP, "#klc-ship button:focus-visible", k)]).toEqual([k, fb[k]]); expect([k, decl(BOARD, "#klc-board button:focus-visible", k)]).toEqual([k, fb[k]]);
      expect([k, decl(STORY, "#klc-story .x:focus-visible", k)]).toEqual([k, fb[k]]); expect([k, decl(PAD, "#klc-pad .gear:focus-visible", k)]).toEqual([k, fb[k]]);
    }
    expect(decl(PAD, "#klc-pad .btn:focus-visible", "outline")).toBe("3px solid var(--ring-ink, #1f3a68)");
    expect(decl(PAD, "#klc-pad .btn:focus-visible", "box-shadow")).toContain("var(--ring-halo, rgba(255, 255, 255, 0.92))");
    expect([HUD_CSS, XUI_CSS, PAD_CSS, cssIn(SHIP_SRC, "const BOARD_CSS =")].join("\n")).not.toMatch(/:focus-visible[^{]*\{[^}]*outline: ?\d+px solid (var\(--k-accent-2\)|var\(--k-blue\)|#2f7fae)/);
  });
  test("the HUD's keyboard focus ring covers the hide-UI eye and the links; a list row draws it inside (a scroller clips a ring drawn outside)", () => {
    for (const s of ["#klc-ui-restore:focus-visible", "#klc-ui .attr a:focus-visible", "#klc-ui .credits a:focus-visible"]) expect([s, rulesOf(HUD, s).some((r) => r.decl.outline === RING.outline)]).toEqual([s, true]);
    expect(decl(HUD, "#klc-ui .places li button:focus-visible", "outline-offset")).toBe("-2px");
    expect(decl(HUD, "#klc-ui .places li button:focus-visible", "box-shadow")).toBe("inset 0 0 0 4px var(--ring-halo)");
    expect(decl(XUI, "#klc-x .xsearch li button:focus-visible", "outline-offset")).toBe("-2px");
    expect(rulesOf(HUD, "#klc-ui #quality:focus-visible").length).toBe(1);   // (the dev quality selector: desktop only, but it is a control and it shows the ring too)
  });
  test("the touch screen shows no ring on the intro button (index.html's rule, round 1's, pasted by lane C): the desktop ring is inside the hover media query, so the two never apply together whatever the order of the sheets", () => {
    expect(decl(INDEX, "#intro #go:focus-visible", "outline", ["@media (hover: none) and (pointer: coarse)"])).toBe("none");
    expect(decl(HUD, "#go:focus-visible", "outline")).toBeUndefined();   // (nothing outside the hover query: no ring could come back on a touch screen from this sheet)
    expect(decl(HUD, "#go:focus-visible", "outline", HOVER)).toBe("2px solid var(--ring-ink)");
  });
  test("html has overscroll-behavior: none", () => { expect(decl(HUD, "html", "overscroll-behavior")).toBe("none"); });
});
