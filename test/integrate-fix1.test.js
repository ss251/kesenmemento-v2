// [integrate:fix1] The blockers of the first phone review, as static checks (the real-touch checks are in test/integrate-fix1.e2e.test.js; the helm's
// 4x is in test/ship-pad.test.js).
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const pad = read("src/anime/ui/touchpad.js"), padCss = read("src/anime/ui/touchpad-style.js"), ship = read("src/anime/ui/ship.js"), hud = read("src/anime/ui/hud.js");
const base = read("src/anime/ui/style.js"), xui = read("src/anime/world/explore/ui.js"), voyage = read("src/anime/world/ship/voyage.js"), sail = read("src/anime/world/explore/sail.js");
const TOUCH = JSON.parse(read("data/ui-touch-i18n.json")), SHIP = JSON.parse(read("data/ship/i18n.json"));

describe("fix1 B1: 4x / Shift is not a helm input", () => {
  test("readInput() leaves the boost out of 'touched', the idle clock stands while it is held, and the autopilot's input carries the held boost", () => {
    expect(sail).toContain("const touched = Math.abs(dO) > 0.05 || Math.abs(rd) > 0.05;");
    expect(sail).toContain("else if (!boost) state.idle += dt;");
    expect(sail).toContain("boost: ap.boost || man.boost");
  });
});
describe("fix1 B2: the voyage cards and panels scroll by touch", () => {
  test("the pad's touchmove guard lets #klc-ship .inner / .panel / .facts scroll", () => {
    const m = pad.match(/doc\.addEventListener\('touchmove', \(e\) => \{ if \(pad\.active && !e\.target\.closest\?\.\('([^']+)'\)\) e\.preventDefault\(\); \}/);
    expect(m).not.toBeNull();
    for (const sel of ["#klc-ship .inner", "#klc-ship .panel", "#klc-ship .facts", ".xsearch", ".arrivals"]) expect(m[1]).toContain(sel);
  });
});
describe("fix1 B3: the cards start under the top bar and keep their buttons in view", () => {
  test("body.klc-pad cards pad their top by the bar and notch; the footer row is sticky", () => {
    expect(ship).toContain("body.klc-pad #klc-ship .card{padding-top:calc(63px + env(safe-area-inset-top,0px))}");
    expect(ship).toMatch(/#klc-ship \.card \.inner>\.row:last-child\{position:sticky;bottom:-16px;/);
  });
});
describe("fix1 B4: the landscape places list is tall enough to reach the boarding row", () => {
  test("a landscape phone's search sheet takes calc(100vh - 150px)", () => {
    expect(xui).toContain("@media (max-height: 520px) and (orientation: landscape) { #klc-x .xsearch { max-height: calc(100vh - 150px - env(safe-area-inset-bottom, 0px)); } }");
  });
});
describe("fix1 B5: 自動で巡る on the portrait phone", () => {
  test("the places sheet shows the auto chip first, 44 px high", () => {
    const m = padCss.match(/@media \(max-width: 720px\) and \(orientation: portrait\) \{([\s\S]*?)\n\}\n/)[1];
    expect(m).toMatch(/body\.klc-pad #klc-ui \.places \.auto \{ display: inline-flex; order: -1;[^}]*height: 44px/);
    expect(m).toContain('body.klc-pad #klc-ui[data-sheet="places"] .places { display: flex;');
  });
  test("the strip fades the edge that has more stops (data-fade from the scroll position)", () => {
    expect(hud).toContain("nav.dataset.fade");
    for (const f of ["r", "l", "lr"]) expect(padCss).toContain(`.places[data-fade="${f}"] ul`);
  });
});
describe("fix1 B6: portrait HUD polish", () => {
  test("the licence link is out of the 8 px credit line; ☰ has a 48 px ⓘ item that opens a credits sheet with a 44 px close and link", () => {
    expect(hud).toContain('<span class="lic">');
    expect(hud).toContain('data-act="credits"'); expect(hud).toContain('data-act="credits-close"');
    expect(padCss).toContain("body.klc-pad #klc-ui .attr .lic { display: none; }");
    expect(padCss).toMatch(/#klc-ui \.credits \.cx \{ width: 44px; height: 44px/);
    expect(padCss).toMatch(/#klc-ui \.credits \.clink \{[^}]*min-height: 44px/);
    expect(TOUCH.ja["touch.hud.credits"]).toBeTruthy(); expect(TOUCH.en["touch.hud.credits"]).toBeTruthy();
    expect(base).toContain("#klc-ui .tools .cbtn, #klc-ui .credits { display: none; }");   // desktop and landscape are unchanged
  });
  test("the hide-UI eye, the dock pills, the search close and the map's zoom / close are 44 px", () => {
    expect(base).toMatch(/#klc-ui-restore \{[^}]*width: 44px; height: 44px/);
    expect(padCss).toContain("body.klc-pad #klc-ui .dock .pill { height: 44px; min-width: 44px; }");
    expect(padCss).toContain("body.klc-pad #klc-x .xsearch .x { width: 44px; height: 44px; }");
    expect(padCss).toContain("body.klc-pad #klc-x .xmap .hd button { width: 44px; height: 44px; }");
  });
  test("the minimap steps aside for the ☰ menu, the arrivals panel and the credits (body.klc-hud-open)", () => {
    expect(hud).toContain("document.body.classList.toggle('klc-hud-open', !!(ui.menu || ui.arrivalsOpen || ui.credits))");
    expect(padCss).toContain("body.klc-pad.klc-hud-open #klc-x .mini { display: none; }");
  });
});
describe("fix1 B7: 町へ戻る gives the walker and the hour back", () => {
  test("the voyage remembers how she boarded and restores it in exit()", () => {
    expect(voyage).toContain("function remember()");
    expect(voyage).toMatch(/start\(\) \{\s*remember\(\);/);
    expect(voyage).toContain("if (!V.active) { remember(); V.active = true; }");
    expect(voyage).toContain("if (V.prior?.hours != null) hours(V.prior.hours);");
    expect(voyage).toContain("pl.fly = false; pl.setPose?.(BERTH.quay[0]");
  });
});
describe("fix1 B8: the stick label at the helm and the boarding chip's title", () => {
  test("sail mode labels full ahead 全速 (not 走る)", () => {
    expect(pad).toContain("pad.mode === 'sail' ? 'touch.helm.full' : 'touch.run'");
    expect(TOUCH.ja["touch.helm.full"]).toBe("全速"); expect(TOUCH.en["touch.helm.full"]).toBeTruthy();
  });
  test("the boarding chip names 第一昭福丸 on a phone, and the button is the verb", () => {
    expect(SHIP.ja["ship.board.short"]).toBe("第一昭福丸"); expect(SHIP.en["ship.board.short"]).toBe("Daiichi Shofuku Maru");
    expect(SHIP.ja["ship.board.go"]).toBe("乗船する");
    expect(ship).toContain("#klc-board b .full{display:none}#klc-board b .short{display:inline}");
  });
});
