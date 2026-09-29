// [v3:fix] Polish pass checks (no browser): sky shader fixes, the promenade props sit on free land, the new stills,
// labels off in stills, the phone credit rule, the cherry / lantern kits' placement rules.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";
import { promAt, PROM, PROM_VENDING, PROM_WALKER } from "../src/anime/world/harbor/stall.js";
import { stillPlan } from "../scripts/render/stills.js";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; } return c; };
const roadEdge = (x, z) => { let d = Infinity; for (const r of L.ROADS) { if (r.zone !== "hero") continue; for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i]; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t) - r.width / 2); } } return d; };

describe("sky: clouds and cirrus", () => {
  const sky = src("src/anime/core/sky.js");
  test("cirrus streaks fade at night and dusk, soft threshold, low gain, broken by fbm(q * 1.7)", () => {
    expect(sky).toContain("streak *= (1.0 - uNight) * (1.0 - uDusk * 0.7)");
    expect(sky).toContain("smoothstep(0.55, 0.95,");
    expect(sky).toContain("fbm(q * 1.7");
    expect(sky).toMatch(/streak \* 0\.15/);
  });
  test("the heap tone comes from the owning puff only; seeded puff count; wider jitter and radii", () => {
    const h0 = sky.indexOf("vec4 heaps("), heaps = sky.slice(h0, sky.indexOf("void main()", h0));
    // litK is assigned only inside the dd > dens branch
    const branch = heaps.slice(heaps.indexOf("if (dd > dens) {"));
    expect(heaps.split("litK =").length - 1).toBe(2);   // the declaration + the branch assignment
    expect(branch.indexOf("litK =")).toBeLessThan(branch.indexOf("}"));
    expect(heaps).toContain("h21(vec2(fi, fk)) < 0.25");
    expect(heaps).toContain("W * 0.5");                  // +-0.25 W crown jitter
    expect(heaps).toContain("(0.6 + 0.8 * j3)");         // +-40 % radii
    expect(heaps).toContain("fwdK");                     // backlit heaps: no crescent shift
  });
});

describe("promenade signature props", () => {
  const free = (x, z) => !L.isWater(x, z) && !L.LOTS.some((l) => l.zone === "hero" && inPoly(x, z, l.poly)) && roadEdge(x, z) > 0;
  test("the stall, the vending machine and the cat's bollard stand on free land within 40 m of the walk spot", () => {
    const pts = [promAt(15.2, 10.2), promAt(PROM_VENDING.s, PROM_VENDING.d), promAt(10.4, 7.1)];
    for (const [x, z] of pts) {
      expect(free(x, z)).toBe(true);
      expect(Math.hypot(x - L.HERO.walk.x, z - L.HERO.walk.z)).toBeLessThan(40);
    }
  });
  test("the promenade frame is orthonormal and the fronts face the water / the walker", () => {
    expect(Math.hypot(...PROM.u)).toBeCloseTo(1, 3);
    expect(PROM.u[0] * PROM.n[0] + PROM.u[1] * PROM.n[1]).toBeCloseTo(0, 3);
    const [x, z] = promAt(0, -3);   // a step seaward of the promenade line is water
    expect(L.isWater(x, z) || L.shoreDist(x, z) > -3).toBe(true);
    expect(Number.isFinite(PROM_WALKER)).toBe(true);
  });
});

describe("stills", () => {
  const plan = stillPlan(), names = plan.map((s) => s.name);
  test("new wow frames: the 安波山 / かなえ大橋 drone, the unloading, the izakaya night", () => {
    for (const n of ["drone_kanae", "market_unload", "night_izakaya"]) expect(names).toContain(n);
  });
  test("stills render with the floating boat labels off", () => {
    expect(src("scripts/render/stills.js")).toContain("labels: '0'");
    expect(src("src/anime/world/harbor/arrivals.js")).toContain("LABELS_ON() &&");
  });
});

describe("phone layout", () => {
  test("under 480 px the dock and places strip sit above the two-line credit", () => {
    const css = src("src/anime/ui/style.js");
    const block = css.slice(css.indexOf("@media (max-width: 480px)"));
    expect(block).toMatch(/\.dock \{ bottom: calc\(34px/);
    expect(block).toMatch(/\.places \{ bottom: calc\(154px/);
  });
});

describe("kits", () => {
  test("izakaya lanterns only on food and drink fronts", () => {
    const lanes = src("src/anime/world/town/lanes.js");
    expect(lanes).toContain("FOOD.test(");
    expect(lanes).not.toMatch(/Math\.random/);
  });
  test("cherries are spring-only and seeded", () => {
    const c = src("src/anime/world/town/cherry/index.js");
    expect(c).toContain("uSeason?.value?.x");
    expect(c).not.toMatch(/Math\.random/);
    for (const f of ["tree", "canopy", "materials", "textures", "util"]) expect(src(`src/anime/world/town/cherry/${f}.js`)).not.toMatch(/Math\.random\(/);
  });
});
