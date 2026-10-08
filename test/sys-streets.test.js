// [sys:12..15,18] The street rules of town/streetlogic.js: sidewalks on mid roads, the centre-line dashes, the removed crossings, ◇ and arrows.
import { describe, expect, test } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { cwOf, sidewalkOf, carriageHalf, dashSamples, dashLength, crossingRemoved, planMarkings, roadNodes, armPlan, laneOffsets, diamondSpots, arrowSpots, arrowPolys, roadLift, armHasZebra } from "../src/anime/world/town/streetlogic.js";
import { resample } from "../src/anime/world/town/geom.js";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const road = (o) => ({ id: "r1", pts: [[0, 0], [100, 0]], width: 12, kind: "city", zone: "mid", ...o });

describe("[sys:12] mid roads get sidewalks and one carriageway helper", () => {
  test("sidewalkOf: mid roads of 9 m or more (2.0 / 2.5 / 3.0 m), alleys and bridges none, the OSM carriage wins", () => {
    expect(sidewalkOf(road({ width: 8 }))).toBe(0);
    expect(sidewalkOf(road({ width: 9 }))).toBe(2.0);
    expect(sidewalkOf(road({ width: 12 }))).toBe(2.5);
    expect(sidewalkOf(road({ width: 16 }))).toBe(3.0);
    expect(sidewalkOf(road({ width: 16, kind: "alley" }))).toBe(0);
    expect(sidewalkOf(road({ width: 16, kind: "bridge" }))).toBe(0);
    expect(sidewalkOf(road({ width: 24.5, carriage: 9 }))).toBe(4.5);
    expect(carriageHalf(road({ width: 12.1, carriage: 6 }))).toBe(3);
  });
  test("hero sidewalks are as before (7.5 m: 1.5, 9 m: 2.0, 11 m: 2.5)", () => {
    expect(sidewalkOf(road({ zone: "hero", width: 7 }))).toBe(0);
    expect(sidewalkOf(road({ zone: "hero", width: 8 }))).toBe(1.5);
    expect(sidewalkOf(road({ zone: "hero", width: 10 }))).toBe(2.0);
    expect(sidewalkOf(road({ zone: "hero", width: 12 }))).toBe(2.5);
  });
  test("cwOf = half the reserve less the sidewalk; roadLift is 0.05 in the hero zone and 0.14 outside", () => {
    expect(cwOf(road({ width: 16 }))).toBe(5);
    expect(roadLift(true)).toBe(0.05); expect(roadLift(false)).toBe(0.14);
  });
  test("streets.js and signals.js share the helpers (no local copies)", () => {
    const st = read("src/anime/world/town/streets.js"), sg = read("src/anime/world/town/signals.js");
    expect(st).toContain("cwOf(r)"); expect(st).not.toContain("const sidewalkOf =");
    expect(sg).toContain("cwOf(") ; expect(sg).toContain("roadLift(hero(");
    expect(sg).not.toContain("+ 0.075, pz");
  });
});

describe("[sys:15] centre-line dashes are 5 m on, 5 m off whatever the drape step", () => {
  const S = (len, step) => { const out = []; for (let s = 0; s < len; s += step) out.push({ s, x: s, z: 0, tx: 1, tz: 0 }); out.push({ s: len, x: len, z: 0, tx: 1, tz: 0 }); return out; };
  test("a straight 182.4 m road at a 4 m step paints 5 * floor(len / 10) + min(5, len % 10) m (it painted 16 %)", () => {
    const len = 182.4, want = 5 * Math.floor(len / 10) + Math.min(5, len % 10), D = dashSamples(S(len, 4), () => true);
    expect(Math.abs(dashLength(D) - want)).toBeLessThanOrEqual(5);
    expect(dashLength(D) / len).toBeGreaterThan(0.45); expect(dashLength(D) / len).toBeLessThan(0.55);
  });
  test("the same at a 2 m step; and a dash that meets a cut is dropped", () => {
    const len = 182.4, D2 = dashSamples(S(len, 2), () => true);
    expect(Math.abs(dashLength(D2) - (5 * 18 + 2.4))).toBeLessThanOrEqual(5);
    const cut = dashSamples(S(len, 4), (p) => p.s > 30);
    expect(dashLength(cut)).toBeLessThan(dashLength(dashSamples(S(len, 4), () => true)) - 4);
    expect(cut.every((p) => p === null || p.s > 30)).toBe(true);
  });
  test("the mid and hero markCentre both use it", () => {
    const t = read("src/anime/world/town/streets.js");
    expect(t).toContain("dashSamples(S, keepS)");
    expect(t).not.toContain("Math.floor(s.s / 5) % 2");
  });
});

describe("[sys:14] zebras the imagery does not show are removed", () => {
  test("the 25 removals are in the layout; crossingRemoved matches the same road within 6 m", () => {
    const rm = L.CROSSING_OVR.removed;
    expect(rm.length).toBe(25);
    expect(rm.filter((q) => q.ovr.startsWith("c7.json")).length).toBe(12);
    expect(rm.filter((q) => q.ovr.startsWith("c6.json")).length).toBe(13);   // [v6:c6 r2] the 2 bay-road ones + 7 junction arms (r12619, r12620, r12665, r12689 x2, r12691, r12692); [v6:c6 r3] + the 4 南町 boulevard zebras ((12,243) r13899, (25,272) and (22,263) r14055, (24,293) r14057)
    expect(crossingRemoved(rm, "r12731", 358.6 + 3, 132.9)).toBe(true);
    expect(crossingRemoved(rm, "r12731", 358.6 + 9, 132.9)).toBe(false);
    expect(crossingRemoved(rm, "r14153", 412.4, 337.7)).toBe(false);
  });
  test("every removed hero zebra is one the junction rule would paint, and (412.4, 337.7) on r14153 is kept; r12737 has no 止まれ", () => {
    const roads = L.ROADS.filter((r) => r.zone !== "far" && !r.tunnel), nodes = roadNodes(roads);
    const inHero = (x, z) => Math.hypot(x - L.ZONES.hero.cx, z - L.ZONES.hero.cz) < L.ZONES.hero.r + 40;
    const found = [], tomare = [];
    let kept = false;
    for (const n of nodes.values()) {
      if (n.deg < 3) continue;
      const widest = Math.max(...n.roads.map((q) => q.r.width));
      for (const arm of n.roads) {
        const base = armPlan(n, arm, widest, { nodes, removed: [], hero: inHero(n.x, n.z) }), plan = armPlan(n, arm, widest, { nodes, removed: L.CROSSING_OVR.removed, hero: inHero(n.x, n.z) });
        if (base.zebra) { if (plan.gone) found.push(arm.r.id + "@" + base.zebra.p.x.toFixed(0)); if (arm.r.id === "r14153" && !plan.gone && Math.hypot(base.zebra.p.x - 412.4, base.zebra.p.z - 337.7) < 8) kept = true; }
        if (plan.tomare) tomare.push(arm.r.id);
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(12);   // the 12 c7 positions and the 2 c6 ones that the default rule paints (2 may lie on a mid arm)
    expect(kept).toBe(true);
    expect(tomare).not.toContain("r12737");
  });
  test("the signal-junction stop line stays when the zebra is removed", () => {
    const n = { x: 0, z: 0, R: 5, deg: 3, roads: [], maxW: 12 };
    const r = { id: "rZ", pts: [[0, 0], [60, 0]], width: 12, kind: "city", zone: "hero" };
    n.roads = [{ r, end: 0 }];
    const base = armPlan(n, { r, end: 0 }, 12, { hero: true, removed: [] }), p = base.zebra.p;
    const gone = armPlan(n, { r, end: 0 }, 12, { hero: true, removed: [{ x: p.x, z: p.z, road: "rZ" }] });
    expect(gone.gone).toBe(true); expect(gone.stopLine).toBe(false);
    expect(armPlan(n, { r, end: 0 }, 12, { hero: true, sig: true, removed: [{ x: p.x, z: p.z, road: "rZ" }] }).stopLine).toBe(true);
  });
});

describe("[sys:18] ◇ and lane arrows", () => {
  const roads = L.ROADS.filter((r) => r.zone !== "far" && !r.tunnel);
  const isHero = (x, z) => Math.hypot(x - L.ZONES.hero.cx, z - L.ZONES.hero.cz) < L.ZONES.hero.r + 40;
  const zebras = [...L.CROSSINGS.filter((c) => c.roadId && c.kind !== "rail" && c.kind !== "unmarked").map((c) => ({ x: c.x, z: c.z, road: c.roadId })), ...L.CROSSING_OVR.zebras.map((c) => ({ x: c.x, z: c.z, road: c.road, diamonds: !!c.diamonds }))];
  const plan = planMarkings({ roads, zebras, removed: L.CROSSING_OVR.removed, arrows: L.CROSSING_OVR.arrows, isHero });
  const near = (list, x, z, r) => list.filter((d) => Math.hypot(d.x - x, d.z - z) < r);
  test("◇ before the 三日町 mid-block crossing (-635, -70), on 気仙沼街道 east of (-29, -107) near (60, -125), and at the 鹿折 junction (455, -636)", () => {
    expect(near(plan.diamonds, -635, -70, 60).length).toBeGreaterThanOrEqual(2);
    expect(near(plan.diamonds, 60, -125, 45).length).toBeGreaterThanOrEqual(2);
    expect(near(plan.diamonds, 455, -636, 70).length).toBeGreaterThanOrEqual(2);
  });
  test("a ◇ is 30 or 50 m before the zebra's near edge, along the road, in each inbound lane", () => {
    const S = resample([[0, 0], [200, 0]], 2), D = diamondSpots({ S, sC: 100, cw: 6, lanes: 2 });
    expect(D.length).toBe(8);   // 2 directions x (30, 50) x 2 lanes
    const east = D.filter((d) => d.dir === 1).map((d) => Math.round(d.x)).sort((a, b) => a - b);
    expect(east).toEqual([48, 48, 68, 68]);   // 100 - 2 - 50 and 100 - 2 - 30
    expect(D.filter((d) => d.dir === 1).every((d) => d.z < 0)).toBe(true);   // left-hand traffic heading east keeps to the north (z < 0)
    expect(diamondSpots({ S, sC: 20, cw: 6, lanes: 1, lo: 0 }).filter((d) => d.dir === 1).length).toBe(0);   // 30 m back would pass the road's start
  });
  test("lane arrows only where the lanes are designated: the 鹿折 4-lane approaches (455, -636)", () => {
    expect(plan.arrows.length).toBe(L.CROSSING_OVR.arrows.length * 4);   // 2 lanes x 2 rows per approach
    expect(near(plan.arrows, 510, -637, 80).length).toBeGreaterThan(0);
    expect(plan.arrows.every((a) => ["r11277", "r11280"].includes(a.road) && a.kind === "S")).toBe(true);
    expect(laneOffsets(6, 1, 2)).toEqual([-1.5, -4.5]);
    expect(arrowSpots({ S: resample([[0, 0], [100, 0]], 2), kinds: ["L", "S"], cw: 6, stop: 7, }).length).toBe(4);
    for (const k of ["S", "L", "R", "SL", "SR"]) expect(arrowPolys(k).length).toBeGreaterThanOrEqual(2);
  });
  test("a carriageway under 5.4 m gets no ◇, and every glyph is drawn through the atlas cell GLYPH.diamond", () => {
    expect(planMarkings({ roads: [road({ width: 5 })], zebras: [{ x: 50, z: 0, road: "r1" }] }).diamonds.length).toBe(0);
    expect(read("src/anime/world/town/streets.js")).toContain("GLYPH.diamond");
    expect(armHasZebra(road({ width: 12 }), 12, 5, 100)).toBe(true);
  });
});
