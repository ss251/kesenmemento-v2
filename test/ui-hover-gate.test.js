// The HUD patches its nodes in place (row 5), so a tapped button is no longer replaced: on a touch screen its :hover look
// would stick after the tap (iOS kept 写真 orange). Every HUD :hover rule applies only where hovering is real.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "../src/anime/ui/style.js"), "utf8");
const GATE = "@media (hover: hover) and (pointer: fine) { ";

describe("HUD hover looks only on real hover devices", () => {
  const lines = css.split("\n").filter((l) => /#klc-ui[\w-]*[^{]*:hover/.test(l));
  test("there are HUD hover rules (the scan sees them)", () => { expect(lines.length).toBeGreaterThanOrEqual(7); });
  test("every one sits inside the hover media query, rule text unchanged inside it", () => {
    for (const l of lines) expect([l.trim().slice(0, 60), l.includes(GATE)]).toEqual([l.trim().slice(0, 60), true]);
    expect(css).toContain(GATE + "#klc-ui .pill.shoot:hover { background: var(--accent-fill-hover); } }");   // [ui-b2:14] was #cf6333: white on it was 3.8:1; the one accent's pressed shade is 4.86:1
  });
  test("keyboard focus keeps its look everywhere (focus-visible is not gated)", () => {
    expect(css).toContain("#klc-ui-restore:focus-visible { opacity: 0.9; } " + GATE + "#klc-ui-restore:hover { opacity: 0.9; } }");
  });
});
