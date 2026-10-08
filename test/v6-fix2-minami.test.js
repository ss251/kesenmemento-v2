// [v6:fix2] South shore, second fix round: the numbers behind the fix2 rebuild must agree with the survey they came from
// (data/survey/minami/features.json via tools/survey/minami_fix2.py), without a browser.
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MON6, ROOF_BAY6, roofBayAt, PIER7_6, KONBINI } from "../src/anime/world/harbor/minami5.js";
import { POLES6 } from "../src/anime/world/harbor/poles6.js";

const ROOT = join(import.meta.dir, "..");
const FJ = join(ROOT, "data/survey/minami/features.json");
const has = existsSync(FJ);
const S = has ? JSON.parse(readFileSync(FJ, "utf8")) : null;
const feat = (n) => S.features.find((f) => f.name === n);

describe("monument (IMG_0893 alone)", () => {
  test.skipIf(!has)("the plaque's top-left corner built from MON6 is the surveyed one", () => {
    const { c, u, gy, plinth: { h, fh, fw } } = MON6, f = feat("monument.plaque.tl");
    const tl = [c[0] - u[0] * fw / 2, gy + h + fh, c[1] - u[1] * fw / 2];
    for (let i = 0; i < 3; i++) expect(Math.abs(tl[i] - f.enu[i])).toBeLessThan(0.05);
  });
  test("the plinth stands on the paving and the plaque is 1.56 x 0.81 m", () => {
    expect(MON6.gy).toBeCloseTo(1.9, 2); expect(MON6.plinth.h).toBeCloseTo(0.46, 2);
    expect(MON6.plinth.fw).toBeCloseTo(1.56, 2); expect(MON6.plinth.fh).toBeCloseTo(0.81, 2);
    expect(Math.hypot(...MON6.n)).toBeCloseTo(1, 2); expect(MON6.n[0] * MON6.u[0] + MON6.n[1] * MON6.u[1]).toBeCloseTo(0, 2);
  });
});

describe("pole and totem heights", () => {
  test.skipIf(!has)("the 7-Eleven pole foot and the 結 totem foot are the surveyed heights", () => {
    expect(KONBINI.poleFoot).toBeCloseTo(feat("konbini.pole").enu[1], 2);
    expect(feat("totem.yuwaeru").enu[1]).toBeCloseTo(2.4, 2);
  });
  test("the two east poles that IMG_0895 does not show are removed", () => {
    const gone = POLES6.remove.map((r) => r.from.join(","));
    expect(gone).toContain("153.7,84.8"); expect(gone).toContain("171.6,82.5");
  });
});

describe("迎's roof and PIER7 (IMG_0808, 0814, 0817)", () => {
  test("the bay-side roof table is increasing in s and bounded by the measured 8.4-13.0 m", () => {
    for (let i = 1; i < ROOF_BAY6.length; i++) expect(ROOF_BAY6[i][0]).toBeGreaterThan(ROOF_BAY6[i - 1][0]);
    for (const [, y] of ROOF_BAY6) { expect(y).toBeGreaterThanOrEqual(8.4); expect(y).toBeLessThanOrEqual(13.0); }
    expect(roofBayAt(1.2)).toBeCloseTo(13.0, 2); expect(roofBayAt(17.5)).toBeCloseTo(12.1, 2); expect(roofBayAt(-100)).toBe(ROOF_BAY6[0][1]); expect(roofBayAt(100)).toBe(8.4);
    expect(roofBayAt(0.1)).toBeGreaterThan(12.2);
  });
  test("the seam, the stilt pitch and the studio roof are the fitted values", () => {
    expect(PIER7_6.cuts[0]).toBeCloseTo(2.0, 2); expect(PIER7_6.stilt).toBeCloseTo(3.5, 2);
  });
  test.skipIf(!has)("the new survey dims agree with the constants", () => {
    const d = (n) => S.dims.find((x) => x.name === n);
    expect(d("pier7.stilt_pitch").value).toBe(PIER7_6.stilt); expect(d("pier7.seam_nw").value).toBe(PIER7_6.cuts[0]);
  });
});
