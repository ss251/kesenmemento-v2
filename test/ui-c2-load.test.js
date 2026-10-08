// [ui-c2][loader] UI lane C, round 2, row 9, loading: what is left of this file after 「帰港」 replaced the station-name card (docs/loading/README.md).
// The card's own rules (the fonts hold, the sheen, the footer grid, lane B's compact card) went with the card; the loading screen and the title screen are pinned in test/loader.test.js
// (first paint, palette, motion, safe areas, the sky, the runner, the progress, the tips, the still, the iris). What stays here is what main.js promises the title screen.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const html = read("src/anime/index.html"), main = read("src/anime/main.js");

describe("the title screen's contract with main.js (lane B's request 2, kept)", () => {
  test("main.js focuses 「まちへ出る」 only for a fine pointer, and without scrolling the page to it", () => {
    expect(main).toContain("go.disabled = false; if (window.matchMedia?.('(pointer: fine)')?.matches) go.focus({ preventScroll: true });");
    expect(main).not.toMatch(/\bgo\.focus\(\)/);   // (no bare focus() left)
    expect(main).toMatch(/if \(e\.code === 'Enter' && !started\) \{ if \(window\.__titleOnGo\) window\.__titleOnGo\(\); else start\(\); \}/);   // [title] Enter plays the exit, then the town; a page without the title still starts
  });
  test("the touch pad's document-level touchmove veto no longer needs the loader to scroll: it is a fixed picture (no data-scroll), laid out for every screen", () => {
    expect(html).not.toMatch(/<div id="intro"[^>]*data-scroll/);
    expect(read("src/anime/ui/touchpad.js")).toMatch(/touchmove[^\n]*\.closest\?\.\('[^']*\[data-scroll\]/);   // (the veto still honours [data-scroll] for the sheets that do scroll)
  });
  test("the loading plan still gives build() a weight and a label per stage and the bar is written through core/loadbar.js", () => {
    expect(main).toContain("import { createLoadBar } from './core/loadbar.js';");
    expect(main).toContain("const loadBar = createLoadBar(); window.__loadLog = loadBar.log;");
    expect(main).toContain("const setProgress = loadBar.set;");
  });
});
