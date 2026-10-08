// [sys] Systemic fixes of round 1 that live in scripts/anime/derive.js: conservative derived storeys (7), one derived roof shape (4), the road width
// of the '5.5m-13m未満' class measured through the sidewalks (11), the photo-based wall palette (9) and the floor of a building on a slope (6).
import { describe, expect, test } from "bun:test";
import { classifyLot, resolveRoofShape, roadWidthFromEdges, SegHash, WALLS, plinthGround, plinthMax, terrainInRing, buriedShare, hash32, mulberry, lotWallColor } from "../scripts/anime/derive.js";
import { WALLS as PALETTE_WALLS } from "../src/anime/world/town/palette.js";

const pickW = (r, table) => { let t = 0; for (const [, w] of table) t += w; let x = r() * t; for (const [k, w] of table) { x -= w; if (x <= 0) return k; } return table[0][0]; };

describe("[sys:7] derived storeys are conservative and deterministic", () => {
  test("office 2 to 4, apartment 2 to 4, hotel 3 to 4, public 2 to 3 whatever the area and the seed", () => {
    for (let i = 0; i < 400; i++) for (const A of [20, 120, 310, 650, 950, 2600, 9000]) {
      const id = "16/1/2/" + i;
      const o = classifyLot({ id, code: i % 2 ? 3102 : 3101, area: A, h: 9, zone: "mid", shore: -300, front: null, tag: "office" });
      expect(o.storeys).toBeGreaterThanOrEqual(A < 25 ? 1 : 2); expect(o.storeys).toBeLessThanOrEqual(4);   // [r2:2] under 25 m2 an office is a 1-storey kiosk
      const a = classifyLot({ id, code: 3101, area: A, h: 9, zone: "mid", shore: -300, front: null, tag: "apartment" });
      expect(a.storeys).toBeGreaterThanOrEqual(2); expect(a.storeys).toBeLessThanOrEqual(4);
      const h = classifyLot({ id, code: 3101, area: A, h: 9, zone: "mid", shore: -300, front: null, tag: "hotel" });
      expect(h.storeys).toBeGreaterThanOrEqual(3); expect(h.storeys).toBeLessThanOrEqual(4);
      const p = classifyLot({ id, code: 3101, area: A, h: 9, zone: "mid", shore: -300, front: null, tag: "public" });
      expect(p.storeys).toBeGreaterThanOrEqual(A < 25 ? 1 : 2); expect(p.storeys).toBeLessThanOrEqual(3);
    }
  });
  test("the formulas: a 2600 m2 derived hotel is 4 storeys (it was 6 or more); an office is 2 + (code 3102) + (A > 600)", () => {
    expect(classifyLot({ id: "h", code: 3101, area: 2600, h: 9, zone: "mid", shore: -300, front: null, tag: "hotel" }).storeys).toBe(4);
    expect(classifyLot({ id: "h", code: 3101, area: 500, h: 9, zone: "mid", shore: -300, front: null, tag: "hotel" }).storeys).toBe(3);
    expect(classifyLot({ id: "o", code: 3102, area: 700, h: 9, zone: "mid", shore: -300, front: null, tag: "office" }).storeys).toBe(4);
    expect(classifyLot({ id: "o", code: 3101, area: 200, h: 9, zone: "mid", shore: -300, front: null, tag: "office" }).storeys).toBe(2);
  });
  test("the rng stream is unchanged: an apartment's roof shape is the draw after the discarded storeys draw", () => {
    for (let i = 0; i < 40; i++) {
      const id = "16/9/9/" + i, r = mulberry(hash32(id + "#kind")); r();
      const want = pickW(r, [["flat", 0.55], ["hip", 0.25], ["gable", 0.2]]);
      expect(classifyLot({ id, code: 3101, area: 500, h: 9, zone: "mid", shore: -300, front: null, tag: "apartment" }).roofShape).toBe(want);
    }
  });
});

describe("[sys:4] resolveRoofShape: one decision per lot", () => {
  const house = (id, shape, height = 5.8, area = 90) => ({ id, kind: "house", shape, height, area });
  test("deterministic by lot id", () => {
    for (let i = 0; i < 50; i++) expect(resolveRoofShape(house("x" + i, "shed"))).toBe(resolveRoofShape(house("x" + i, "shed")));
  });
  test("a derived shed on a house is mostly a gable or hip (55 %); a low flat house roof is mostly pitched (60 %)", () => {
    let shed = 0, flat = 0; const N = 2000;
    for (let i = 0; i < N; i++) { if (resolveRoofShape(house("s" + i, "shed")) === "shed") shed++; if (resolveRoofShape(house("f" + i, "flat")) === "flat") flat++; }
    expect(shed / N).toBeGreaterThan(0.38); expect(shed / N).toBeLessThan(0.52);      // 45 % stay shed
    expect(flat / N).toBeGreaterThan(0.34); expect(flat / N).toBeLessThan(0.46);      // 40 % stay flat
    for (let i = 0; i < 200; i++) expect(["gable", "hip"]).toContain(resolveRoofShape(house("g" + i, "shed")) === "shed" ? "gable" : resolveRoofShape(house("g" + i, "shed")));
  });
  test("tall, big and industrial roofs are never touched", () => {
    expect(resolveRoofShape({ id: "a", kind: "apartment", shape: "flat", height: 5.8, area: 100 })).toBe("flat");
    expect(resolveRoofShape(house("b", "flat", 9.5, 90))).toBe("flat");          // 9.5 m: not low
    expect(resolveRoofShape(house("c", "flat", 5.8, 400))).toBe("flat");         // 400 m2: not small
    expect(resolveRoofShape({ id: "d", kind: "warehouse", shape: "saw", height: 6, area: 100 })).toBe("saw");
  });
});

describe("[sys:11] road width from the road-edge lines", () => {
  const edges = (half) => { const h = new SegHash(24); for (const z of [-half, half]) for (let x = 0; x < 150; x += 10) h.add([x, z], [x + 10, z], null); return h; };
  const road = [[0, 0], [150, 0]];
  test("edges at +-8 m on a '5.5m-13m未満' road give about 16 m (they were rejected above 14 m: the 8 m nominal width)", () => {
    expect(roadWidthFromEdges(road, "5.5m-13m未満", edges(8))).toBeGreaterThan(15.8);
    expect(roadWidthFromEdges(road, "5.5m-13m未満", edges(8))).toBeLessThan(16.2);
  });
  test("an in-range width is still measured, and the '3m未満' class still rejects +-9 m (null)", () => {
    expect(roadWidthFromEdges(road, "5.5m-13m未満", edges(3.2))).toBeCloseTo(6.4, 1);
    expect(roadWidthFromEdges(road, "3m未満", edges(9))).toBeNull();
  });
  test("the south-shore box keeps the old rule (wideOk false)", () => {
    expect(roadWidthFromEdges(road, "5.5m-13m未満", edges(8), 6, false)).toBeNull();
  });
});

describe("[sys:9] the wall palette follows the ground photos", () => {
  const hsv = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
  const cls = (hex) => { const [h, s, v] = hsv(hex); if (v < 0.5) return "dark"; if (s < 0.12 && v <= 0.8) return "grey"; if (h >= 170 && h <= 260 && s >= 0.045) return "blue"; if (h >= 75 && h < 170 && s > 0.06) return "mint"; if (s < 0.075) return "white"; if (h < 28 || h >= 330) return s > 0.1 ? "salmon" : "cream"; return s > 0.3 ? "other" : v > 0.78 && s < 0.1 ? "white" : "cream"; };
  const share = (list) => { const c = {}; for (const h of list) c[cls(h)] = (c[cls(h)] || 0) + 1; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / list.length])); };
  for (const [name, list] of [["derive.js WALLS.house", WALLS.house], ["palette.js WALLS", PALETTE_WALLS]]) {
    test(name + ": ~35 % white, ~20 % grey, ~22 % cream, ~8 % dark, blue 5 % at most, no mint", () => {
      const s = share(list);
      expect(s.white).toBeGreaterThan(0.3); expect(s.white).toBeLessThan(0.42);
      expect(s.grey).toBeGreaterThan(0.15); expect(s.grey).toBeLessThan(0.27);
      expect(s.cream).toBeGreaterThan(0.17); expect(s.cream).toBeLessThan(0.28);
      expect(s.dark).toBeGreaterThan(0.05); expect(s.dark).toBeLessThan(0.13);
      expect(s.blue ?? 0).toBeLessThanOrEqual(0.05);
      expect(s.mint ?? 0).toBe(0);
    });
  }
  test("no mint or pale-blue entry in any residential list", () => {
    for (const k of ["house", "shop", "apartment", "office"]) { const s = share(WALLS[k]); expect(s.mint ?? 0).toBe(0); expect(s.blue ?? 0).toBeLessThanOrEqual(0.08); }
    expect(lotWallColor("house", "x")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("[sys:6] the floor of a building on a slope", () => {
  test("terrainInRing: a 1 m grid inside the polygon, inset 0.5 m", () => {
    const ts = terrainInRing([[0, 0], [10, 0], [10, 10], [0, 10]], (x) => 5 + x * 0.1);
    expect(ts.n).toBeGreaterThan(70); expect(ts.n).toBeLessThanOrEqual(100);
    expect(ts.min).toBeGreaterThanOrEqual(5.05 - 1e-9); expect(ts.max).toBeLessThan(6);
  });
  test("lot 16/58541/25070/77: terrain 12.6 to 15.7 under a 5.8 m house is no longer buried", () => {
    const hs = []; for (let i = 0; i < 100; i++) hs.push(12.6 + (3.1 * i) / 99);
    const ts = { n: 100, hs, min: 12.6, med: 14.1, max: 15.7 };
    const g = plinthGround({ ts, height: 5.8, kind: "house", groundOld: 6.76 });
    expect(g.baseY).toBeCloseTo(12.6, 2); expect(g.groundY).toBeCloseTo(12.6, 2);   // the floor is at the lowest terrain: the 5.8 m roof clears the 15.7 m top
    expect(buriedShare(hs, 6.76, 5.8)).toBeGreaterThan(0.9);          // the old floor
    expect(buriedShare(hs, g.groundY, 5.8)).toBeLessThan(0.05);
  });
  test("the plinth never exceeds Pmax: 3 m for houses and shops, 4 m for warehouses and factories", () => {
    const hs = Array.from({ length: 50 }, (_, i) => 5 + (13 * i) / 49), ts = { n: 50, hs, min: 5, med: 11, max: 18 };
    expect(plinthGround({ ts, height: 7, kind: "house", groundOld: 5 }).groundY - 5).toBeCloseTo(3, 5);
    expect(plinthGround({ ts, height: 7, kind: "warehouse", groundOld: 5 }).groundY - 5).toBeCloseTo(4, 5);
    expect(plinthMax("shop")).toBe(3); expect(plinthMax("factory")).toBe(4);
  });
  test("a flat site keeps its ground (baseY = groundY) and a sparse footprint falls back", () => {
    const ts = { n: 40, hs: Array(40).fill(4.2), min: 4.2, med: 4.2, max: 4.2 };
    expect(plinthGround({ ts, height: 6, kind: "house", groundOld: 4.1 })).toEqual({ groundY: 4.2, baseY: 4.2 });
    expect(plinthGround({ ts: { n: 2, hs: [1, 2], min: 1, med: 2, max: 2 }, height: 6, kind: "house", groundOld: 3.3 })).toEqual({ groundY: 3.3, baseY: 3.3 });
  });
});
