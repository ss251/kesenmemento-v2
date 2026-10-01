// [v5:fix3] round 3, part B (art and explore): car-park grass, water seen from the waterline, lawn tone, 五十鈴神社's
// walk spot and hall, and the (alternate, PHOTOS5 = false) 迎 / ring-planter build in harbor/minami.js.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";
import { LOOK, PAVED, pavedIndex, parkingIndex, inPoly } from "../src/anime/world/town/landuse.js";
import { LOT_FIX } from "../src/anime/world/lotfix.js";
import { SEA_DECK } from "../src/anime/core/player.js";
import { MINAMI, SITES } from "../src/anime/world/harbor/real.js";
import { gardenY, plazaY, GARDEN_FLAT, GARDEN_STEP_BAND, MUKAERU_AXIS } from "../src/anime/world/harbor/minami.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const hsl = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
};

describe("B1 car parks: no vacant-lot grass on asphalt", () => {
  test("paved landuse classes and the index", () => {
    for (const c of ["parking", "apron", "plaza", "gravel", "construction"]) expect(PAVED.has(c)).toBe(true);
    const inPaved = pavedIndex(L), inPark = parkingIndex(L);
    const lot = L.LANDUSE.find((l) => l.cls === "parking" && l.ring.length > 3);
    let cx = 0, cz = 0; for (const [x, z] of lot.ring) { cx += x / lot.ring.length; cz += z / lot.ring.length; }
    if (inPoly(cx, cz, lot.ring, lot.holes || [])) { expect(inPark(cx, cz)).toBe(true); expect(inPaved(cx, cz)).toBe(true); }
  });
  test("parking.js skips used car parks and paved rings; the grass offset is weaker than the landuse surface", () => {
    const src = read("src/anime/world/town/parking.js");
    expect(src).toContain("if (usedComp.has(id)) return;");
    expect(src).toContain("!inPaved(");
    const off = Number(src.match(/polygonOffset: (-?[\d.]+) \}\), \{ name: 'town-vacant' \}/)[1]);
    const lu = Number(read("src/anime/world/town/landuse.js").match(/const surfMat = [^;]*polygonOffset: (-?[\d.]+)/)[1]);
    expect(off).toBeGreaterThan(lu);   // less negative: the asphalt wins where they meet
  });
});

describe("B9 water at eye level", () => {
  test("a walking eye placed over the sea floats at SEA_DECK (never on the seabed)", () => {
    expect(SEA_DECK).toBeGreaterThan(0); expect(SEA_DECK).toBeLessThan(1.5);
    expect(L.isWater(95, -5)).toBe(true); expect(L.heightAt(95, -5)).toBeLessThan(-1);   // review3's p7_prom eye
    const src = read("src/anime/core/player.js");
    expect(src).toContain("this.physics.isWater?.(x, z) && this.pos.y < SEA_DECK");
    expect(src).toContain("if (g < SEA_DECK && this.physics.isWater?.(this.pos.x, this.pos.z)) g = SEA_DECK;");
  });
  test("the grazing sky reflection is pulled toward the mid sky blue", () => {
    expect(read("src/anime/world/water.js")).toContain("vec3 skyC = mix(mix(uSkyHorizon, uSkyMid, 0.35), uSkyMid, smoothstep(0.0, 0.5, R.y));");
  });
});

describe("B6 lawns: dried, muted turf", () => {
  test("park and grass are muted olive (Earth 2026-03-11), not lime", () => {
    for (const k of ["park", "grass"]) { const c = hsl(LOOK[k].col); expect(c.s).toBeLessThan(0.22); expect(c.l).toBeLessThan(0.55); }
    expect(read("src/anime/world/harbor/minami.js")).toContain("lawn: '#8a9566'");
  });
});

describe("B8 五十鈴神社", () => {
  test("the GSI footprint at the hall door is the shrine's 向拝 (built by shinmei.js), not a town house", () => {
    expect(LOT_FIX["16/58541/25068/119"]).toMatchObject({ kind: "shrine", landmark: "isuzuShrine" });
    const lot = L.LOTS.find((l) => l.id === "16/58541/25068/119");
    expect(lot.landmark).toBe("isuzuShrine");
    const src = read("src/anime/world/harbor/shinmei.js");
    expect(src).toContain("the 向拝 (worship canopy)"); expect(src).toContain("// 貫");
  });
});

describe("B2 / B10 迎 and the plaza (the PHOTOS5 = false build)", () => {
  test("迎's axis runs along the street face, its normal toward the bay", () => {
    const [, Sb, Sa, Ba] = SITES.mukaeru.poly;
    expect(Math.hypot(...MUKAERU_AXIS.u)).toBeCloseTo(1, 6);
    expect((Ba[0] - Sa[0]) * MUKAERU_AXIS.n[0] + (Ba[1] - Sa[1]) * MUKAERU_AXIS.n[1]).toBeGreaterThan(0);
    expect((Sb[0] - Sa[0]) * MUKAERU_AXIS.u[0] + (Sb[1] - Sa[1]) * MUKAERU_AXIS.u[1]).toBeGreaterThan(30);
  });
  test("every ring planter sits whole on the flat paving, below the bleacher band", () => {
    const [N, , , W] = MINAMI.garden;
    for (const [x, z] of MINAMI.pits) {
      const f = ((x - W[0]) * (N[0] - W[0]) + (z - W[1]) * (N[1] - W[1])) / ((N[0] - W[0]) ** 2 + (N[1] - W[1]) ** 2);
      expect(f - 2.3 / Math.hypot(N[0] - W[0], N[1] - W[1])).toBeGreaterThan(GARDEN_STEP_BAND);   // the whole ring is off the steps
      const y = gardenY(L, x, z, 2.3);
      expect(y).toBeGreaterThanOrEqual(GARDEN_FLAT);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; expect(plazaY(L, x + Math.cos(a) * 2.3, z + Math.sin(a) * 2.3)).toBeLessThanOrEqual(y + 1e-9); }
    }
  });
});
