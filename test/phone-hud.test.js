// [integrate] The portrait phone HUD with the pad (ui/hud.js, ui/touchpad-style.js, explore/ui.js): one top bar, a ☰ menu, two pills that open the
// places strip and the time dock as bottom sheets, a small minimap, the credit line. The pure / static parts; the real-touch checks are in
// test/ship-pad.e2e.test.js.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

describe("the phone HUD (ui/hud.js, touchpad-style.js): one top bar, a ☰ menu, two pills and sheets", () => {
  const hud = read("src/anime/ui/hud.js"), css = read("src/anime/ui/touchpad-style.js"), base = read("src/anime/ui/style.js");
  test("hud.js builds the ☰ button, the menu with all five tools, and the two pills", () => {
    expect(hud).toContain('data-act="menu"');
    expect(hud).toContain('id="klc-menu"');
    for (const a of ["lang", "season", "sound", "planet", "hide"]) expect(hud).toContain(`data-act="${a}"`);
    expect(hud).toContain('data-sheet="places"'); expect(hud).toContain('data-sheet="time"');
    expect(hud).toContain("el.dataset.menu"); expect(hud).toContain("el.dataset.sheet");
  });
  test("the ☰ menu, the pills and their labels are hidden unless the portrait phone CSS turns them on (desktop is unchanged)", () => {
    expect(base).toMatch(/#klc-ui \.mbtn, #klc-ui \.pbar, #klc-ui \.mhead, #klc-ui \.tools \.lbl \{ display: none; \}/);
    const m = css.match(/@media \(max-width: 720px\) and \(orientation: portrait\) \{([\s\S]*?)\n\}\n/);
    expect(m).not.toBeNull();
    for (const sel of ["#klc-ui .mbtn", "#klc-ui .pbar", "#klc-ui .tools", "#klc-ui .dock", "#klc-ui .places", "#klc-x .mini", "#klc-x .xbar"]) expect(m[1]).toContain("body.klc-pad " + sel);
    // every portrait rule is under body.klc-pad (the pad being on), so the desktop and a pad-less phone never see them
    // ([ui-b2:7] a line that only opens a nested @supports / @starting-style group is no rule: the rules inside it carry the prefix and are checked as before)
    for (const line of m[1].split("\n")) { const t = line.trim(); if (t && !t.startsWith("/*") && !t.startsWith("*") && /\{/.test(t) && !t.startsWith("}") && !/^@(supports|starting-style)\b/.test(t)) expect(t.startsWith("body.klc-pad")).toBe(true); }
  });
  test("the map and drive buttons of the xbar fold away in portrait: the minimap opens the map, the mode chip and 乗る drive", () => {
    expect(css).toMatch(/#klc-x \.xbar button\[data-act="map"\], body\.klc-pad #klc-x \.xbar button\[data-act="drive"\] \{ display: none; \}/);
    expect(read("src/anime/world/explore/ui.js")).toContain("openMap(true)");
  });
  test("the credit line stays: small, never hidden by the portrait rules", () => {
    expect(css).toMatch(/body\.klc-pad #klc-ui \.attr \{ font-size: 8px/);
    expect(css).not.toMatch(/\.attr \{[^}]*display: none/);
  });
  test("a sheet and the ☰ menu are modal: the pad steps aside (suppress) and a touch outside closes them", () => {
    expect(hud).toContain("ctx.pad?.suppress?.('hud-sheet'");
    expect(hud).toContain("document.addEventListener('pointerdown'");
  });
  test("search and the full map are modal too, and the minimap is gone while the full map is open", () => {
    const ex = read("src/anime/world/explore/ui.js");
    expect(ex).toContain("ctx.pad?.suppress?.('xui'");
    expect(css).toContain('body.klc-pad #klc-x[data-map="1"] .mini, body.klc-pad #klc-x[data-search="1"] .mini { display: none; }');
    expect(css).toContain('body.klc-pad #klc-x[data-grace="1"] .mini { pointer-events: none; }');
  });
  test("the pad grabs the pills like any HUD panel (a drag is the stick or the look, a tap opens the sheet) and lifts clear of them", () => {
    const pad = read("src/anime/ui/touchpad.js");
    expect(pad).toContain("#klc-ui .pbar");
    expect(pad).toMatch(/const PANELS = \[[^\]]*#klc-ui \.pbar[^\]]*\]/);
  });
  test("the strings the HUD adds live in the pad's i18n file, not data/i18n.json", () => {
    const T = JSON.parse(read("data/ui-touch-i18n.json"));
    expect(T.ja["touch.hud.menu"]).toBe("メニュー"); expect(T.en["touch.hud.menu"]).toBe("Menu");
    expect(Object.keys(JSON.parse(read("data/i18n.json")).ja).some((k) => k.startsWith("touch."))).toBe(false);
  });
  test("a custom pad mode hides the 歩く / 飛ぶ / 運転 chip (it would unhook the sail buttons)", () => {
    expect(css).toMatch(/#klc-pad\[data-custom="1"\] \.chip \{ display: none;/);
    expect(read("src/anime/ui/touchpad.js")).toContain("root.dataset.custom");
  });
  test("the ship UI keeps clear of the notch (safe-area insets) and the helm panel is a slim strip while the pad is on", () => {
    const ui = read("src/anime/ui/ship.js");
    expect(ui).toMatch(/#klc-ship \.top\{[^}]*env\(safe-area-inset-top/);
    expect(ui).toMatch(/#klc-ship \.panel\{[^}]*env\(safe-area-inset-bottom/);
    expect(ui).toContain('body.klc-pad #klc-ship[data-view="DEPART"] .panel{top:');
    expect(ui).toContain("el.dataset.view = view");
  });
});

