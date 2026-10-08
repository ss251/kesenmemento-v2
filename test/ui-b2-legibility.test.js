// [ui-b2] UI lane B, round 2, row 14 of the UI review (not included) (mobile F20 / T10, polish T8): legibility. One accent, #c4521f, for every fill that carries white text; --k-muted #55596f;
// a darker credit pill; the pad's idle floor .7; the hide-UI eye at .8 on a near-opaque disc; a soft scrim under the wordmark. The check is WCAG arithmetic on the colours the stylesheets
// really declare (read by test/lib/css.js, composited over the scene backdrops the reviews sampled: bright sky, cloud, sea, grass, dark water, night): text >= 4.5:1, marks (icons) >= 3:1.
// "Known limits" at the end pins the pairs that stay below the bar and are named in the UI round notes (ui-b2, not included), so the notes cannot drift from the code. The real pixels behind the wordmark
// (before and after the scrim) are measured in test/ui-b2.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { CSS as HUD_CSS, CONTRIB_CSS } from "../src/anime/ui/style.js";
import { CSS as PAD_CSS } from "../src/anime/ui/touchpad-style.js";
import { CSS as XUI_CSS } from "../src/anime/world/explore/ui.js";
import { parseCss, decl, cssIn, read, parseColor, ratio, over, flat, BACKDROPS } from "./lib/css.js";

const HUD = parseCss(HUD_CSS), PAD = parseCss(PAD_CSS), XUI = parseCss(XUI_CSS);
const SHIP_SRC = read("src/anime/ui/ship.js"), STORY_SRC = read("src/anime/world/explore/storypins.js");
const SHIP = parseCss(cssIn(SHIP_SRC, "const CSS =")), BOARD = parseCss(cssIn(SHIP_SRC, "const BOARD_CSS =")), STORY = parseCss(cssIn(STORY_SRC, "const CSS ="));
const HOVER = ["@media (hover: hover) and (pointer: fine)"], PORTRAIT = ["@media (max-width: 720px) and (orientation: portrait)"];
const root = (k) => decl(HUD, ":root", k);
/** A declared colour with its var() resolved (a token on :root, or the fallback written beside it): '#rrggbb' or 'rgba(...)'. */
const col = (v) => String(v).replace(/var\((--[\w-]+)(?:, ?(#[0-9a-f]{3,6}|rgba?\([^)]*\)))?\)/g, (m, name, fb) => root(name) ?? fb ?? m);
const rgb = (v) => parseColor(col(v)).slice(0, 3);
const WHITE = [255, 255, 255], NAVY = rgb("#1f3a68");
const SIX = Object.entries(BACKDROPS);
const worst = (fn) => Math.min(...SIX.map(([, B]) => fn(B)));

describe("ui-b2 row 14: one accent for text on coral, one muted grey", () => {
  test("--accent-fill is #c4521f (white on it 4.59:1); the hover / pressed shade and the foot of the pad's primary button are darker; #e0703f stays only on marks that carry no text", () => {
    expect(root("--accent-fill")).toBe("#c4521f"); expect(root("--accent-fill-hover")).toBe("#b9531f"); expect(root("--accent-fill-deep")).toBe("#b0431a");
    expect(ratio(WHITE, rgb("#c4521f"))).toBeGreaterThanOrEqual(4.5); expect(ratio(WHITE, rgb("#b9531f"))).toBeGreaterThan(4.5); expect(ratio(WHITE, rgb("#b0431a"))).toBeGreaterThan(4.5);
    expect(ratio(WHITE, rgb("#e0703f"))).toBeLessThan(3.3);   // (the old fill: why it went)
  });
  test("every fill that carries white text is the accent: the 写真 pill, the pad's primary button (rest and pressed) and run tag, the ship's primary buttons and the boarding chip", () => {
    expect(decl(HUD, "#klc-ui .pill.shoot", "background")).toContain("var(--accent-fill)"); expect(decl(HUD, "#klc-ui .pill.shoot:hover", "background", HOVER)).toBe("var(--accent-fill-hover)");
    expect(decl(PAD, "#klc-pad .btn.primary", "background")).toBe("linear-gradient(180deg, var(--accent-fill, #c4521f), var(--accent-fill-deep, #b0431a))");
    expect(decl(PAD, "#klc-pad .btn.primary:active", "background")).toBe("var(--accent-fill-hover, #b9531f)");
    expect(decl(PAD, "#klc-pad .stick .tag", "background")).toBe("var(--accent-fill, #c4521f)");
    expect(decl(SHIP, "#klc-ship", "--accent")).toBe("var(--accent-fill, #c4521f)"); expect(decl(SHIP, "#klc-ship button.primary", "background")).toBe("var(--accent)");
    expect(decl(BOARD, "#klc-board button", "background")).toBe("var(--accent-fill, #c4521f)");
    expect(decl(parseCss(CONTRIB_CSS), '#klc-contrib .kc-row[data-rank="1"] .kc-rank', "background")).toBe("var(--accent-fill, #c4521f)");   // (the report sheet's first-place badge: hidden until launch, white text on coral all the same)
    const all = [HUD_CSS, PAD_CSS, XUI_CSS, cssIn(SHIP_SRC, "const CSS ="), cssIn(SHIP_SRC, "const BOARD_CSS ="), cssIn(STORY_SRC, "const CSS =")].join("\n");
    for (const old of ["#cf6333", "#f08a58", "#d24a3c"]) expect([old, all.includes(old)]).toEqual([old, false]);
    for (const [name, v] of [["写真 pill", decl(HUD, "#klc-ui .pill.shoot", "background")], ["run tag", decl(PAD, "#klc-pad .stick .tag", "background")], ["boarding chip", decl(BOARD, "#klc-board button", "background")], ["ship primary", decl(SHIP, "#klc-ship", "--accent")]])
      expect([name, ratio(WHITE, rgb(v)) >= 4.5]).toEqual([name, true]);
    const grad = decl(PAD, "#klc-pad .btn.primary", "background").match(/var\(--accent-fill[\w-]*, (#[0-9a-f]{6})\)/g).map((m) => rgb(m));
    for (const c of grad) expect(ratio(WHITE, c)).toBeGreaterThanOrEqual(4.5);
  });
  test("--k-muted is #55596f on the HUD, the explore UI and the pad (it was #6b6f86, 3.4 to 4.6:1 on the glass); the labels' and the boarding chip's secondary text use it", () => {
    for (const [rules, sel] of [[HUD, "#klc-ui"], [XUI, "#klc-x"], [PAD, "#klc-pad"]]) expect([sel, decl(rules, sel, "--k-muted")]).toEqual([sel, "#55596f"]);
    expect(decl(XUI, "#klc-labels .xl small", "color")).toBe("#55596f"); expect(decl(BOARD, "#klc-board small", "color")).toBe("#55596f");
    for (const css of [HUD_CSS, PAD_CSS, XUI_CSS, cssIn(SHIP_SRC, "const BOARD_CSS =")]) expect(css.includes("#6b6f86")).toBe(false);
  });
});

describe("ui-b2 row 14: text >= 4.5:1 and marks >= 3:1 on the scene (bright sky, cloud, sea, grass, dark water, night)", () => {
  test("muted text on the glass of the HUD (.84), the explore UI and the pad (.86) and the ☰ menu (.94)", () => {
    for (const [rules, sel] of [[HUD, "#klc-ui"], [XUI, "#klc-x"], [PAD, "#klc-pad"]]) {
      const muted = rgb(decl(rules, sel, "--k-muted")), glass = decl(rules, sel, "--k-glass");
      for (const [name, B] of SIX) expect([sel, name, ratio(muted, flat(glass, B)) >= 4.5]).toEqual([sel, name, true]);
    }
    const menu = decl(HUD, "#klc-ui", "--k-glass-2");
    for (const [name, B] of SIX) expect([name, ratio(rgb("#55596f"), flat(menu, B)) >= 4.5]).toEqual([name, true]);
  });
  test("a world label's secondary text, on the label pill, in daylight (the pill is .82 and, for the small ones, .72 over the scene; night and dark water are under 'known limits')", () => {
    for (const a of [0.82, 0.72]) for (const name of ["sky", "cloud", "sea", "grass"]) expect([a, name, ratio(rgb("#55596f"), over([250, 247, 241], a, BACKDROPS[name])) >= 4.5]).toEqual([a, name, true]);
  });
  test("white on every accent fill, at rest", () => {
    for (const hex of [root("--accent-fill"), root("--accent-fill-hover"), root("--accent-fill-deep")]) expect([hex, ratio(WHITE, rgb(hex)) >= 4.5]).toEqual([hex, true]);
  });
  test("the credit line: white on its pill over every backdrop (it was 1.9:1 over cloud and 3.0:1 over sky)", () => {
    const bg = decl(HUD, "#klc-ui .attr", "background");
    expect(bg).toBe("rgba(18, 26, 52, 0.62)");
    for (const [name, B] of SIX) expect([name, ratio(WHITE, flat(bg, B)) >= 4.5]).toEqual([name, true]);
    expect(worst((B) => ratio(WHITE, flat("rgba(24, 32, 62, 0.26)", B)))).toBeLessThan(2.5);   // (the old pill: why it went)
  });
  test("the pad at rest after 4 s idle (opacity .7 on the whole control): a navy label on the middle of its translucent face keeps 4.5:1 (it was .35 and 2.1:1)", () => {
    const O = Number(decl(PAD, '#klc-pad[data-idle="1"] .ctl', "opacity"));
    expect(O).toBe(0.7);
    const face = decl(PAD, "#klc-pad .btn", "background").match(/rgba\([^)]*\)/g).map(parseColor), mid = [0, 1, 2].map((i) => (face[0][i] + face[1][i]) / 2), midA = (face[0][3] + face[1][3]) / 2;
    for (const [name, B] of SIX) expect([name, ratio(over(NAVY, O, B), over(over(mid, midA, B), O, B)) >= 4.5]).toEqual([name, true]);
    expect(decl(PAD, '#klc-pad[data-idle="0"] .ctl', "transition-duration")).toBe(".06s");   // (back at once on a touch, as before)
  });
  test("the hide-UI eye, the only way back: its icon on its disc, the whole control at .8, is a mark of 3:1 or more (it was 2.1:1 by day and 1.2:1 at night)", () => {
    const bg = decl(HUD, "#klc-ui-restore", "background"), O = Number(decl(HUD, "#klc-ui-restore", "opacity")), ink = rgb(decl(HUD, "#klc-ui-restore", "color"));
    expect([bg, O]).toEqual(["rgba(250, 247, 241, 0.9)", 0.8]);
    for (const [name, B] of SIX) expect([name, ratio(over(ink, O, B), over(flat(bg, B), O, B)) >= 3]).toEqual([name, true]);
  });
  test("the report icon (a mark on the glass) uses the accent that has the contrast; the ring is navy against its white halo on every backdrop", () => {
    for (const [name, B] of SIX) expect([name, ratio(rgb(decl(HUD, "#klc-ui .tools .rep svg", "color")), flat(decl(HUD, "#klc-ui", "--k-glass"), B)) >= 3]).toEqual([name, true]);
    for (const [name, B] of SIX) expect([name, ratio(rgb(root("--ring-ink")), flat(root("--ring-halo"), B)) >= 3]).toEqual([name, true]);
  });
});

describe("ui-b2 row 14: a soft scrim under the wordmark", () => {
  test("the scrim belongs to .mark (so it is gone where the wordmark is: a portrait phone hides it), sits behind its text, takes no touch, and is a plateau of about .3 that fades out", () => {
    expect(decl(HUD, "#klc-ui .mark", "position")).toBe("relative"); expect(decl(HUD, "#klc-ui .mark", "isolation")).toBe("isolate");
    expect(decl(HUD, "#klc-ui .mark::before", "z-index")).toBe("-1"); expect(decl(HUD, "#klc-ui .mark::before", "content")).toBe('""');
    expect(decl(HUD, "#klc-ui", "pointer-events")).toBe("none");   // (inherited by the pseudo-element)
    const bg = decl(HUD, "#klc-ui .mark::before", "background"), stops = [...bg.matchAll(/rgba\(24, 32, 62, ([\d.]+)\)(?: (\d+)%)?/g)].map((m) => [Number(m[1]), m[2] === undefined ? null : Number(m[2])]);
    expect(stops.length).toBe(3); expect(stops[0][0]).toBeGreaterThanOrEqual(0.25); expect(stops[0][0]).toBeLessThanOrEqual(0.35); expect(stops[1][0]).toBeGreaterThanOrEqual(0.22); expect(stops[2][0]).toBe(0);
    expect(decl(PAD, "body.klc-pad #klc-ui .mark", "display", PORTRAIT)).toBe("none");
  });
  test("the subtitle is heavier and its glow tighter (900, white; it was 800 at .92): a rule with .brand in its selector, so it wins over the original, which is untouched", () => {
    expect(decl(HUD, "#klc-ui .brand .mark small", "font")).toBe("900 11px/1 var(--k-sans)"); expect(decl(HUD, "#klc-ui .brand .mark small", "color")).toBe("#fff");
    expect(decl(HUD, "#klc-ui .brand .mark small", "text-shadow")).toBe("0 1px 0 rgba(31, 58, 104, 0.9), 0 0 6px rgba(31, 58, 104, 0.8)");
    expect(decl(HUD, "#klc-ui .mark small", "font")).toBe("800 11px/1 var(--k-sans)");   // (the original line, which lane A's neighbouring edit of the chip merges beside)
  });
  test("over a bright sky a plateau of .30 takes white to about 3:1 and cloud to 2:1 (the sky behind the title was 1.6 to 2.0:1: the reviews' pixels); the rest is the text-shadow", () => {
    const sky = BACKDROPS.sky, cloud = BACKDROPS.cloud, veil = (B) => over([24, 32, 62], 0.3, B);
    expect(ratio(WHITE, sky)).toBeLessThan(2); expect(ratio(WHITE, veil(sky))).toBeGreaterThan(3.1); expect(ratio(WHITE, cloud)).toBeLessThan(1.2); expect(ratio(WHITE, veil(cloud))).toBeGreaterThan(1.9);
  });
});

describe("ui-b2 row 14: known limits (named in the UI round notes (ui-b2, not included); pinned so the notes cannot drift)", () => {
  test("the pad's primary button label at idle (white on the accent at .7 over the sky): 2.9 to 3.7:1; it is 4.59 to 5.73 at rest and the pad wakes on the first touch", () => {
    const grad = decl(PAD, "#klc-pad .btn.primary", "background").match(/#[0-9a-f]{6}/gi), O = 0.7;
    const all = grad.flatMap((hex) => SIX.map(([, B]) => ratio(over(WHITE, O, B), over(rgb(hex), O, B))));
    expect(Math.min(...all)).toBeGreaterThan(2.8); expect(Math.max(...all)).toBeLessThan(4.4);
    const day = grad.flatMap((hex) => ["sky", "cloud", "sea", "grass"].map((n) => ratio(over(WHITE, O, BACKDROPS[n]), over(rgb(hex), O, BACKDROPS[n])))); expect(Math.min(...day)).toBeLessThan(3.4);
  });
  test("a world label's secondary text at night: 4.47:1 on a default pill, 3.55:1 on a small one (.72); dark water 4.80 and 4.02", () => {
    const m = rgb("#55596f"), r = (a, n) => ratio(m, over([250, 247, 241], a, BACKDROPS[n]));
    expect([r(0.82, "night"), r(0.72, "night"), r(0.82, "darkWater"), r(0.72, "darkWater")].map((v) => +v.toFixed(2))).toEqual([4.47, 3.55, 4.8, 4.02]);
  });
});
