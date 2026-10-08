// [integrate:fix2] The blockers of the second phone review, as static checks (the real-touch checks are in test/integrate-fix2.e2e.test.js).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const ship = read("src/anime/ui/ship.js"), shipIdx = read("src/anime/world/ship/index.js"), pad = read("src/anime/ui/touchpad.js"), padCss = read("src/anime/ui/touchpad-style.js");
const base = read("src/anime/ui/style.js"), html = read("src/anime/index.html");
const mediaBlock = (src, head) => { const i = src.indexOf(head); expect(i).toBeGreaterThan(-1); return src.slice(i, src.indexOf("\n", i)); };

describe("fix2 B1: the boarding chip steps aside for the sheets", () => {
  test("it is off while the search sheet or the full map is open, or the pad is suppressed", () => {
    expect(shipIdx).toContain("document.querySelector('#klc-x .xsearch:not([hidden]), #klc-x .xmap:not([hidden])')");
    expect(shipIdx).toContain("!(ctx.pad?.suppressed?.length)");
    expect(shipIdx).toMatch(/nearBerth\(p\.x, p\.z, c\.y\)\s*&&/);
  });
});
describe("fix2 B2: portrait Act 2 keeps the caption to one line", () => {
  test("@media (max-width:600px) hides the paragraph and caps the width; the full text is in the 船のデータ panel", () => {
    const m = mediaBlock(ship, "@media (max-width:600px){#klc-ship .long");
    expect(m).toContain("#klc-ship .where small{display:none}");
    expect(m).toContain("#klc-ship .where{max-width:60%}");
    const facts = ship.slice(ship.indexOf("function factsPanel"), ship.indexOf("function render"));
    expect(facts).toContain("ship.ocean.where"); expect(facts).toContain("ship.ocean.seasonNote"); expect(facts).toContain("ship.haul.japan");
  });
});
describe("fix2 B3: landscape Act 2 shows the ship", () => {
  test("the short-landscape block hides the caption paragraph, caps the panel at 60%, one row of meters and a pinned footer row", () => {
    const i = ship.indexOf("[integrate:fix2] Act 2 on a landscape phone");
    expect(i).toBeGreaterThan(-1);
    const b = ship.slice(i, ship.indexOf("\n/* [integrate] at the helm", i));
    expect(b).toContain("#klc-ship .where small{display:none}");
    expect(b).toContain("#klc-ship .panel{max-height:60%;");
    expect(b).toMatch(/\.meters\{display:flex;flex-wrap:nowrap/);
    expect(b).toMatch(/\.panel>\.row:last-child\{position:sticky;bottom:-10px/);
    expect(b).toContain('#klc-ship[data-view="HAUL"] .panel .note');
  });
});
describe("fix2 B4: 「まちへ出る」 is a 44 px target", () => {
  test("#go has min-height: 44px", () => { expect(html).toMatch(/#go \{[^}]*min-height: 44px/); });
});
describe("fix2 B5: the settings popover has nothing under it", () => {
  test("the pad toggles body.klc-pad-set, and the dock and places strip fold away under it", () => {
    expect(pad).toContain("function setSettingsOpen(open)");
    expect(pad).toContain("doc.body.classList.toggle('klc-pad-set', !!open)");
    expect(pad).toContain("setSettingsOpen(false)");
    expect(pad).toContain("classList.remove('klc-pad', 'klc-pad-set')");
    expect(padCss).toMatch(/body\.klc-pad\.klc-pad-set #klc-ui \.dock, body\.klc-pad\.klc-pad-set #klc-ui \.places \{ display: none !important; \}/);
  });
});
describe("fix2 B6: the desktop restore eye is as at 8262120", () => {
  test("38 px at 18 / 18 by default; the 44 px one at 14 / 14 only under body.klc-pad", () => {
    expect(base).toMatch(/#klc-ui-restore \{ display: none; position: fixed; z-index: 5; top: calc\(18px \+ env\(safe-area-inset-top, 0px\)\); right: 18px; width: 38px; height: 38px;/);
    expect(base).toMatch(/#klc-ui-restore svg \{ width: 18px; height: 18px; \}/);
    expect(base).toMatch(/body\.klc-pad #klc-ui-restore \{ top: calc\(14px \+ env\(safe-area-inset-top, 0px\)\); right: 14px; width: 44px; height: 44px; \}/);
  });
});
