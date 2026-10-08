// [v6:c4e] c4 east edge and beyond (x > 1300): the 三陸沿岸道路 cuttings. The GSI photo (about 2020-22) shows the road works as
// bare cream cuts, which classify() calls sand (#e2d4ae, L* 91 in the app). Earth 2026-03-11 shows the expressway finished with
// dormant tan-brown slopes (L* median 47), so bright tan on a hill, away from buildings, is `felled` (#7f6b57, L* 47).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { ROOT } from "../scripts/terrain/tiles.js";
import { SAND_HILL_H, CLASSES } from "../scripts/anime/build-landcover.js";
import * as L from "../src/anime/world/layout.js";

const read = (f) => readFileSync(join(ROOT, f), "utf8");

describe("c4 east edge: expressway cuttings are not cream sand", () => {
  test("the build maps hill sand and far-from-town sand over SAND_HILL_H to felled (class 9)", () => {
    const src = read("scripts/anime/build-landcover.js");
    expect(src).toContain("c !== 5");
    expect(src).toContain("c === 5 ? 9");
    expect(src).toContain("a[k] = 9; sandN++");
    expect(SAND_HILL_H).toBeGreaterThan(6);       // a beach is under 6 m
    expect(SAND_HILL_H).toBeLessThanOrEqual(12);
    expect(CLASSES[9].id).toBe("felled");
  });
  test("almost no sand (#e2d4ae) is left in the corridor x 1300..1520, z -900..-300 of the core land cover", async () => {
    const meta = JSON.parse(read("data/ortho/core.json")), size = 2048;
    const W = meta.width * meta.dx, H = meta.height * meta.dz, px = (W / size) * (H / size);
    const { data } = await sharp(join(ROOT, "data/anime/landcover_core.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let sand = 0, felled = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = meta.x0 + ((x + 0.5) / size) * W, wz = meta.z0 + ((y + 0.5) / size) * H;
      if (wx < 1300 || wx > 1520 || wz < -900 || wz > -300) continue;
      const k = (y * size + x) * 3, r = data[k], g = data[k + 1], b = data[k + 2];
      if (Math.abs(r - 226) < 7 && Math.abs(g - 212) < 7 && Math.abs(b - 174) < 7) sand++;
      if (Math.abs(r - 127) < 7 && Math.abs(g - 107) < 7 && Math.abs(b - 87) < 7) felled++;
    }
    expect(sand * px).toBeLessThan(300);          // was 10,400 m2 (4,600 + 4,350 + 3,200 + 2,000 in the Earth check)
    expect(felled * px).toBeGreaterThan(8000);
  });
  test("the c4e override file is a plain 'felled' ring inside its bbox and every other cell file is untouched by it", () => {
    const f = "data/anime/overrides/c4 east edge and beyond (outside the cells, x > 1300).json";
    const d = JSON.parse(read(f));
    expect(d.cell).toBe("c4e");
    expect(d.bbox).toEqual([1300, -900, 1520, -300]);
    expect(d.landuse.length).toBeGreaterThan(0);
    for (const u of d.landuse) {
      expect(u.use).toBe("felled");
      for (const [x, z] of u.ring) { expect(x).toBeGreaterThanOrEqual(1300); expect(x).toBeLessThanOrEqual(1520); expect(z).toBeGreaterThanOrEqual(-900); expect(z).toBeLessThanOrEqual(-300); }
    }
    expect(L.LANDUSE.some((l) => String(l.ovr || "").startsWith("c4 east edge") && l.cls === "felled")).toBe(true);
  });
  test("cells.json still has 12 numbered cells (test/v5-fix2a.test.js reads it): no c4e entry shadows c4", () => {
    const cells = JSON.parse(read("data/anime/cells.json")).cells;
    expect(Object.keys(cells).filter((id) => /^c\d+$/.test(id)).length).toBe(12);
  });
});
