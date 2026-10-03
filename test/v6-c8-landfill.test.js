// [v6:c8] The reclaimed 小鯖 yard (scripts/anime/landfill.js): GSI's water layer still drew a ~40 m lagoon inlet there;
// Google Earth 2026-03-11 (raw/ref/earth/c8/sub-s top) shows one straight seawall and a level yard behind it.
import { describe, expect, test } from "bun:test";
import { LAND_FILL, inRing, ringDist } from "../scripts/anime/landfill.js";
import * as L from "../src/anime/world/layout.js";

const KOSABA = LAND_FILL.find((f) => f.id === "kosaba-yard");
const mid = (q) => [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];

describe("land fill: 小鯖 yard", () => {
  test("ring helpers", () => {
    expect(inRing(1120, 80, KOSABA.ring)).toBe(true);
    expect(inRing(1080, 80, KOSABA.ring)).toBe(false);
    expect(ringDist(1140, 70, KOSABA.ring)).toBeCloseTo(0, 6);
  });
  test("no water east of the wall at z 60..104, and the yard is at least minH", () => {
    for (let z = 60; z <= 104; z += 2) for (let x = 1100; x <= 1140; x += 2) expect(L.isWater(x, z)).toBe(false);
    for (let z = 44; z <= 108; z += 4) for (let x = 1104; x <= 1136; x += 4) if (inRing(x, z, KOSABA.ring)) expect(L.heightAt(x, z)).toBeGreaterThanOrEqual(KOSABA.minH - 0.05);
    // the sea is still in front of the wall
    for (const z of [50, 70, 90]) expect(L.isWater(1080, z)).toBe(true);
  });
  test("no GSI coastline piece inside the fill; the new seawall is continuous from (1096.5, 29.7) to (1084.1, 112.5)", () => {
    const inside = L.QUAYS.filter((q) => !q.fill && inRing(...mid(q), KOSABA.ring));
    expect(inside).toEqual([]);
    const wall = L.QUAYS.filter((q) => q.fill === "kosaba-yard");
    expect(wall.length).toBeGreaterThanOrEqual(3);
    for (const q of wall) { expect(q.kind).toBe("seawall"); expect(Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1])).toBeLessThanOrEqual(24.01); expect(q.top).toBeGreaterThan(1.5); expect(q.top).toBeLessThan(2.2); }
    for (let i = 1; i < wall.length; i++) expect(wall[i].a).toEqual(wall[i - 1].b);
    const ends = (p) => L.QUAYS.some((q) => q.kind === "seawall" && !q.fill && (Math.hypot(q.a[0] - p[0], q.a[1] - p[1]) < 0.6 || Math.hypot(q.b[0] - p[0], q.b[1] - p[1]) < 0.6));
    expect(ends(wall[0].a)).toBe(true);
    expect(ends(wall[wall.length - 1].b)).toBe(true);
  });
});
