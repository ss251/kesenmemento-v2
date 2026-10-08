// [sys:16] The terrain mesh no longer lies over the road ribbons: samples inside each road quad (not only at ribbon vertices) against the DRAWN surface.
import { describe, expect, test } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { buildTerrain, roadCapSamples, roadCapGrid, capHeight, ROAD_CAP } from "../src/anime/world/environment/terrain.js";
import { readFileSync } from "node:fs";

const ex = JSON.parse(readFileSync(new URL("../data/anime/explore.json", import.meta.url), "utf8"));
const roads = L.ROADS.filter((r) => r.zone !== "far").concat(ex.roads);
const lift = (x, z) => (Math.hypot(x - 180, z + 20) < 420 ? 0.05 : 0.14);
const mkCtx = (phone) => ({ quality: { phone, name: phone ? "phone" : "high" }, noBatch() {}, addStatic() {} });
const T = {};
const terrain = (key, phone, withRoads) => (T[key] ||= buildTerrain(mkCtx(phone), {}, withRoads ? { roads } : {}));

/** samples inside each ribbon (4 m along, 5 across): [roadY, drawn surface] */
function burial(surfaceAt) {
  let n = 0, over01 = 0, over03 = 0, worst = 0;
  for (const r of roads) {
    if (r.tunnel || r.kind === "bridge" || r.width < 2.5) continue;
    const hw = r.width / 2;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const nx = -dz / len, nz = dx / len;
      // the area the ribbon covers inside the mid / hero grids only (x -1045..1545, z -1145..1445)
      for (let s = 0; s < len; s += 4) for (const o of [-0.9, -0.45, 0, 0.45, 0.9]) {
        const x = a[0] + (dx * s) / len + nx * hw * o, z = a[1] + (dz * s) / len + nz * hw * o;
        if (x < -1040 || x > 1540 || z < -1140 || z > 1440 || L.isWater(x, z)) continue;
        const ry = L.heightAt(x, z) + lift(x, z), sy = surfaceAt(x, z), bury = sy - ry;
        n++; if (bury > 0.1) over01++; if (bury > 0.3) over03++; if (bury > worst) worst = bury;
      }
    }
  }
  return { n, over01, over03, worst, p01: over01 / n };
}

describe("[sys:16] road ribbons are not buried by the terrain mesh", () => {
  test("the cap helpers: a vertex of a cell that a road touches is at most the lowest road height there minus 0.05 m", () => {
    const samples = Float32Array.from([50, 50, 3.0, 5, 52, 50, 2.5, 5]);
    const g = roadCapGrid(samples, { x0: 0, z0: 0, x1: 100, z1: 100 }, 10);
    const h = capHeight(() => 9, g);
    expect(h(50, 50)).toBe(2.5); expect(h(60, 60)).toBe(2.5);
    expect(h(0, 0)).toBe(9);                                   // far from every road: untouched
    expect(ROAD_CAP.margin).toBe(0.05);
    expect(roadCapSamples([{ pts: [[0, 0], [10, 0]], width: 6, kind: "city" }, { pts: [[0, 0], [10, 0]], width: 6, kind: "bridge" }, { pts: [[0, 0], [10, 0]], width: 6, tunnel: true }]).length).toBeGreaterThan(0);
  });
  test("without the cap the mesh buries a large share of the road (the bug); with it under 0.5 % by more than 0.1 m (8.8 % before) and at most a few by more than 0.3 m (5,338 before), at the high tier", () => {
    const before = burial(terrain("hi0", false, false).surfaceAt), after = burial(terrain("hi1", false, true).surfaceAt);
    expect(before.p01).toBeGreaterThan(0.02);
    expect(after.p01).toBeLessThan(0.005);
    expect(after.over03).toBeLessThanOrEqual(3);   // (one sample on a 200 % cross-slope cliff road, r9996, is still 0.33 m under)
    expect(before.over03).toBeGreaterThan(1000);
  }, 120000);
  test("the same at the phone tier (hero step 5)", () => {
    const after = burial(terrain("ph1", true, true).surfaceAt);
    expect(after.p01).toBeLessThan(0.005);
    expect(after.over03).toBeLessThanOrEqual(3);
  }, 120000);
});
