// A trimmed copy of the "keep the shell native" lint of the UI review (not included) (A16), with the assertions that the pre-demo rows 6 and 12 made true (the others belong to rows
// 16, 19 and 22, after the demo, and the context-loss one to lane C's test/survive.test.js). One value is not the review's: the review pins the HUD press at scale(.96); the plan
// chose scale(.97) at 140 ms (motion 009, UI review row 6), so the :active test pins .97 for the HUD, the explore UI, the ship UI and the story card, and .95 for the pad
// (it was .92). No browser: a text lint, the same style as test/integrate-fix1.test.js.
import { test, expect } from "bun:test";
import { read } from "./lib/css.js";

const FILES = { hud: "src/anime/ui/style.js", pad: "src/anime/ui/touchpad-style.js", explore: "src/anime/world/explore/ui.js", ship: "src/anime/ui/ship.js", story: "src/anime/world/explore/storypins.js" };
const text = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
const html = read("src/anime/index.html");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");   // (a CSS comment that mentions :hover is no rule)
const css = noComments(Object.values(text).join("\n"));

/** The :hover rules that are not inside @media (hover: hover): the selector text of each. */
const ungatedHover = (s) => {
  const bad = [], st = []; let last = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "{") { st.push(s.slice(last, k).trim()); last = k + 1; if (/:hover/.test(st.at(-1)) && !st.slice(0, -1).some((h) => /@media[^{]*hover:\s*hover/.test(h))) bad.push(st.at(-1).slice(0, 70)); }
    else if (c === "}") { st.pop(); last = k + 1; } else if (c === ";") last = k + 1;
  }
  return bad;
};

test("every :hover rule of the HUD, the explore UI, the ship UI, the story card and the pad is inside @media (hover: hover) and (pointer: fine)", () => {
  expect(ungatedHover(css)).toEqual([]);
});
test("index.html has no ungated :hover rule either (the intro button's 1 px lift was the last one: gated in round 2, row 6, with lane C's leave)", () => {
  expect(ungatedHover(noComments(html))).toEqual([]);
});
test("text fields are 16 px (iOS Safari zooms the page into a smaller one)", () => {
  expect(text.explore).toMatch(/\.xsearch input \{[^}]*font: 500 16px/);
});
test("the Enter that confirms an IME conversion is not 'go'", () => {
  expect(text.explore).toMatch(/isComposing/);
});
test("overscroll is none on html (body alone does not reach the viewport while html has overflow: hidden)", () => {
  expect(text.hud).toMatch(/\nhtml \{ overscroll-behavior: none; \}/);
});
test("HUD buttons have :active (scale .97), the pad's .95: the plan's value, not the review's .96", () => {
  const press = /:active\s*\{[^}]*transform:\s*scale\(0?\.97\)/;
  for (const k of ["hud", "explore", "ship", "story"]) expect([k, press.test(text[k])]).toEqual([k, true]);
  expect(text.ship).toMatch(/#klc-board button:active\{transform:scale\(\.97\)\}/);
  expect(text.pad).toMatch(/#klc-pad \.btn\.down, #klc-pad \.btn:active \{ transform: scale\(0\.95\)/);
  expect(text.pad).toMatch(/#klc-pad \.chip button:active \{ transform: scale\(0\.95\)/);
  for (const v of ["0.92", "0.94", ".96", "0.96"]) expect(css).not.toContain("scale(" + v + ")");   // no stray press depth (the intro card's scale(0.985) is not a press)
});
