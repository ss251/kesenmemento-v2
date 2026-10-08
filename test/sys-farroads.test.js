// [sys:24] Access roads of the far landmarks, and [sys:20] the river mouth.
import { describe, expect, test } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { farRoadAnchors, farRoadSegments, farRoadY, farAnchors, farLanduse, URANOHAMA_APRON } from "../src/anime/world/landmarks/farground.js";
import { inCore } from "../src/anime/world/explore/tiles.js";
import { KAMEYAMA, URANOHAMA } from "../src/anime/world/landmarks/sites.js";
import { OSHIMA } from "../src/anime/world/harbor/real.js";
import { easeMouth } from "../src/anime/world/town/rivers.js";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const cen = (p) => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);

describe("[sys:24] far roads round the far landmarks", () => {
  test("farAnchors() and farLanduse() are unchanged; the road anchors add the 亀山 summit and car park, the 浦の浜 terminal and the 大島大橋 ends", () => {
    expect(farRoadAnchors().length).toBe(farAnchors().length + 5);
    const extra = farRoadAnchors().slice(farAnchors().length);
    expect(extra[0]).toEqual(KAMEYAMA.summit); expect(extra[1][0]).toBeCloseTo(cen(KAMEYAMA.parking.poly)[0], 6);
    expect(extra[2][0]).toBeCloseTo(cen(URANOHAMA.terminal.poly)[0], 6); expect(extra[3]).toEqual(OSHIMA.a); expect(extra[4]).toEqual(OSHIMA.b);
    expect(farLanduse(L).length).toBeGreaterThan(5);
  });
  test("ribbons exist within 50 m of the 亀山 car park, the 大島大橋 ends and リアス・アーク, within 300 m of the summit and the terminal, and none inside explore's core", () => {
    const segs = farRoadSegments(L), near = (p, r) => segs.some(({ a, b }) => Math.min(Math.hypot(a[0] - p[0], a[1] - p[1]), Math.hypot(b[0] - p[0], b[1] - p[1])) <= r);
    expect(segs.length).toBeGreaterThan(100);
    expect(near(cen(KAMEYAMA.parking.poly), 50)).toBe(true);
    expect(near(OSHIMA.a, 50)).toBe(true); expect(near(OSHIMA.b, 50)).toBe(true);
    expect(near([-2190, 2760], 60)).toBe(true);
    expect(near(KAMEYAMA.summit, 300)).toBe(true); expect(near(cen(URANOHAMA.terminal.poly), 300)).toBe(true);
    for (const { road, a, b } of segs) { expect(road.zone).toBe("far"); expect(road.kind).not.toBe("bridge"); expect(inCore((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)).toBe(false); }
    expect(segs.some(({ road }) => road.id === "r21000" || road.id === "r22502")).toBe(false);   // the 大島大橋 deck is harbor/oshima.js's
  });
  test("the road height: ground + 0.10, above the 浦の浜 apron, ramped to the 大島大橋 deck end", () => {
    expect(farRoadY(L, 0, 4000) - L.groundAt(0, 4000)).toBeCloseTo(0.10, 6);
    const A = URANOHAMA_APRON, x = (A.x0 + A.x1) / 2, z = (A.z0 + A.z1) / 2;
    expect(farRoadY(L, x, z)).toBeGreaterThanOrEqual(1.0 - 1e-9);
    expect(farRoadY(L, OSHIMA.a[0], OSHIMA.a[1])).toBeCloseTo(OSHIMA.endY[0], 5);
    expect(farRoadY(L, OSHIMA.b[0], OSHIMA.b[1])).toBeCloseTo(OSHIMA.endY[1], 5);
    const t = read("src/anime/world/landmarks/farground.js");
    expect(t).toContain("polygonOffset: -1.4");
  });
  test("リアス・アーク car park is a parking override surface", () => {
    expect(L.LANDUSE.some((l) => l.cls === "parking" && l.ovr?.includes("リアス") && l.ring.some(([x, z]) => Math.abs(x + 2214) < 1 && Math.abs(z - 2737) < 1))).toBe(true);
  });
});

describe("[sys:20] the 鹿折川 mouth", () => {
  test("easeMouth keeps its weight on each sample (1 after the last wet one) and the builders use it", () => {
    const S = []; for (let i = 0; i <= 12; i++) S.push({ x: i * 6, z: 0, tx: 1, tz: 0, y: 1.5, wet: i <= 8 });
    const Lw = { SEA: { level: 0 }, isWater: (x) => x >= 48 };
    expect(easeMouth(Lw, S, 30)).toBe(true);
    expect(S[8].mouth).toBeCloseTo(1, 6);                  // the last wet sample: at the mouth
    expect(S[12].mouth).toBe(1);                           // beyond it
    expect(S[3].mouth).toBeLessThan(S[6].mouth); expect(S[3].mouth).toBeGreaterThanOrEqual(0);
    const t = read("src/anime/world/town/rivers.js");
    expect(t).toContain("(p.mouth || 0) > 0.3"); expect(t).toContain("mo > 0.5"); expect(t).toContain("lerp(seaRiver, mo)");
    const w = read("src/anime/world/water.js");
    expect(w).toContain("float nearR = 0.0, nearF = 0.0;"); expect(w).toContain("w_field(xz + vec2(6.0, 0.0))"); expect(w).toContain("w_field(xz + vec2(16.0, 0.0))"); expect(w).toContain("(1.0 - nearF)"); expect(w).toContain("d = max(d, mix(d, 6.0, nearR));");
  });
});
