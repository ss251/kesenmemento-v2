// [v5:fix3] 神明崎's west shore is a sloping concrete revetment (Google Earth 2026-03-11 c7n; GSI photo), not a beach:
// the water's hard-shore mask covers it (no pale shoal or surf line), while the terrain and the walkers keep it as land.
import { describe, test, expect } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { hardShores, REVETMENTS } from "../src/anime/world/layout/hardshore.js";

describe("revetments (water-only hard shores)", () => {
  const H = hardShores(L);
  test("神明崎 west: its rocks lines are revetments, kept out of the public hard segments", () => {
    expect(REVETMENTS.find((r) => r.id === "shinmei-west")).toBeTruthy();
    expect(H.revets.length).toBeGreaterThan(5);
    expect(H.segs.some((s) => s.soft)).toBe(false);
  });
  test("the water mask sees them; the terrain clamp, the aprons and the walker test do not", () => {
    for (const s of H.revets) {
      const t = s.len / 2, x = s.ax + s.ux * t + s.nx * 2, z = s.az + s.uz * t + s.nz * 2;
      expect(H.near(x, z, true)).toBeGreaterThan(0.9);
      const bx = s.ax + s.ux * t - s.nx * 2, bz = s.az + s.uz * t - s.nz * 2;
      expect(H.clampY(bx, bz, 1.5)).toBe(1.5);
      expect(H.inApron(bx, bz)).toBe(false);
    }
  });
});
