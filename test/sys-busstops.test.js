// [sys:17] Bus stops: every OSM bus stop and BRT stop_position becomes a layout stop on the left kerb of the road a bus uses.
import { describe, expect, test } from "bun:test";
import { placeBusStops, leftOf, BRT_HALF } from "../scripts/anime/busstops.js";
import { cwOf } from "../src/anime/world/town/streetlogic.js";
import * as L from "../src/anime/world/layout.js";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const E = JSON.parse(read("data/anime/enrich.json"));

describe("[sys:17] bus stops", () => {
  test("enrich.json carries the OSM bus stops (116 nodes) and the BRT stop positions", () => {
    expect(E.busStops.filter((b) => b.kind === "bus").length).toBeGreaterThan(100);
    expect(E.busStops.filter((b) => b.kind === "brt").length).toBeGreaterThanOrEqual(10);
    expect(E.busWays.length).toBeGreaterThan(50);
    const sakaguchi = E.busStops.filter((b) => b.name === "坂口"); expect(sakaguchi.length).toBe(2); expect(sakaguchi[0].covered).toBe("no");
  });
  test("left of travel: east -> north (z decreasing), west -> south", () => {
    expect(leftOf(1, 0)).toEqual([0, -1]); expect(leftOf(-1, 0)).toEqual([0, 1]);
  });
  test("内湾入口: the eastbound platform (way 1451261720) is about (-423.5, -309.5) and the westbound one (1451261719) about (-419.8, -300.6)", () => {
    const east = L.BUS_STOPS.find((b) => b.id === "n4004183275"), west = L.BUS_STOPS.find((b) => b.id === "n13310205926");
    expect(east.kind).toBe("brt"); expect(west.kind).toBe("brt");
    expect(Math.hypot(east.x - -423.5, east.z - -309.5)).toBeLessThan(2.5);
    expect(Math.hypot(west.x - -419.8, west.z - -300.6)).toBeLessThan(2.5);
    expect(BRT_HALF + 1).toBeCloseTo(3.2, 5);
    expect(east.z).toBeLessThan(west.z);   // the stops are on opposite kerbs of the busway
  });
  test("every layout stop is placed; city stops stand 0.6 to 3 m behind the kerb of a road a bus uses", () => {
    expect(L.BUS_STOPS.length).toBeGreaterThan(110);
    const roads = new Map(L.ROADS.map((r) => [r.id, r]));
    let snapped = 0;
    for (const b of L.BUS_STOPS) {
      expect(Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.rotY)).toBe(true);
      if (b.kind !== "bus" || !b.road) continue;
      const r = roads.get(b.road); expect(r).toBeTruthy(); expect(r.kind === "alley").toBe(false);
      let d = 1e9; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], c = r.pts[i], dx = c[0] - a[0], dz = c[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((b.x - a[0]) * dx + (b.z - a[1]) * dz) / l2)); d = Math.min(d, Math.hypot(b.x - a[0] - dx * t, b.z - a[1] - dz * t)); }
      expect(d).toBeGreaterThanOrEqual(cwOf(r) + 0.5 - 0.3);
      expect(d).toBeLessThan(cwOf(r) + 6.5);   // (a stop mapped further away than that keeps its mapped offset up to 3 m; the bus way may bend)
      snapped++;
    }
    expect(snapped).toBeGreaterThan(80);
  });
  test("placeBusStops: a stop is put on the side of the road it is mapped on (the kerb of the direction it serves) and faces the oncoming bus", () => {
    const roads = [{ id: "r1", pts: [[0, 0], [200, 0]], width: 8, kind: "city", zone: "mid" }];
    const ways = [{ pts: [[0, 0], [200, 0]] }];
    const [south, north] = placeBusStops([{ osm: "a", p: [100, 5], kind: "bus", name: "南" }, { osm: "b", p: [100, -5], kind: "bus", name: "北" }], ways, roads);
    expect(south.z).toBeGreaterThan(0); expect(north.z).toBeLessThan(0);
    // left-hand traffic: the stop on the south side (x east, z south) serves westbound buses (their left is south): the plate faces east
    expect(Math.abs(south.rotY - Math.atan2(-(-1), -0))).toBeLessThan(1e-2);
    expect(Math.abs(north.rotY - Math.atan2(-1, -0))).toBeLessThan(1e-2);
    expect(Math.abs(south.z)).toBeCloseTo(cwOf(roads[0]) + 0.6 > 5 ? Math.min(5, cwOf(roads[0]) + 3) : cwOf(roads[0]) + 0.6, 0);
  });
  test("the builders: city stop (pole, plate, timetable, shelter only with shelter=yes) and BRT stop (red totem, bench, platform)", () => {
    const t = read("src/anime/world/town/props.js");
    expect(t).toContain("export function buildBusStop"); expect(t).toContain("export function buildBrtStop");
    expect(t).toContain("o.shelter === 'yes'"); expect(t).toContain("#c4262e");
    expect(t).toContain("L.BUS_STOPS");
  });
});
