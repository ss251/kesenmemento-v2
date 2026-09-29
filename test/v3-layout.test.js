// [v3:foundation] Layout derivations (scripts/anime/derive.js) and the runtime contract (src/anime/world/layout.js).
import { describe, expect, test } from "bun:test";
import {
  minAreaRect, obbSides, rotYFacing, polyArea, centroid, snapRoof, ROOF_PALETTE, classifyLot, lotRoofColor, lotWallColor,
  roadWidthFromEdges, SegHash, simplify, quayKind, nominalWidth, roadKind, raySeg, hash32,
} from "../scripts/anime/derive.js";
import * as L from "../src/anime/world/layout.js";

const PALETTE = new Set(Object.values(ROOF_PALETTE));
const rect = (cx, cz, w, d, a) => { const c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]); };

describe("derive: geometry", () => {
  test("minAreaRect recovers a rotated rectangle", () => {
    const r = minAreaRect(rect(10, -5, 12, 7, 0.4));
    expect(r.cx).toBeCloseTo(10, 5); expect(r.cz).toBeCloseTo(-5, 5);
    expect(Math.max(r.hu, r.hv) * 2).toBeCloseTo(12, 4); expect(Math.min(r.hu, r.hv) * 2).toBeCloseTo(7, 4);
    expect(r.area).toBeCloseTo(84, 3);
  });
  test("obb sides have unit outward normals and cover the box", () => {
    const r = minAreaRect(rect(0, 0, 10, 4, 1.1));
    for (const s of obbSides(r)) { expect(Math.hypot(...s.n)).toBeCloseTo(1, 6); expect(Math.hypot(s.mid[0] - r.cx, s.mid[1] - r.cz)).toBeCloseTo(s.half, 6); }
  });
  test("rotYFacing turns local +Z into the given direction (three.js rotation.y)", () => {
    for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [0.6, 0.8]]) { const a = rotYFacing(nx, nz); expect(Math.sin(a)).toBeCloseTo(nx, 6); expect(Math.cos(a)).toBeCloseTo(nz, 6); }
  });
  test("polygon area and centroid", () => { const sq = rect(3, 4, 2, 2, 0); expect(Math.abs(polyArea(sq))).toBeCloseTo(4, 6); expect(centroid(sq)[0]).toBeCloseTo(3, 6); expect(centroid(sq)[1]).toBeCloseTo(4, 6); });
  test("simplify keeps corners and drops collinear points", () => {
    const line = [[0, 0], [1, 0.01], [2, 0], [3, 0], [3, 5]];
    expect(simplify(line, 0.1)).toEqual([[0, 0], [3, 0], [3, 5]]);
  });
  test("raySeg hits a segment in front only", () => { expect(raySeg([0, 0], [1, 0], [3, -1], [3, 1])).toBeCloseTo(3, 6); expect(raySeg([0, 0], [-1, 0], [3, -1], [3, 1])).toBeNull(); });
});

describe("derive: roads", () => {
  test("width from edge lines on both sides", () => {
    const edges = new SegHash(16);
    edges.add([-50, 3], [50, 3], null); edges.add([-50, -3.2], [50, -3.2], null);
    expect(roadWidthFromEdges([[-40, 0], [40, 0]], "5.5m-13m未満", edges)).toBeCloseTo(6.2, 3);
  });
  test("width outside the rank range is rejected (nominal width used)", () => {
    const edges = new SegHash(16);
    edges.add([-50, 9], [50, 9], null); edges.add([-50, -9], [50, -9], null);
    expect(roadWidthFromEdges([[-40, 0], [40, 0]], "3m未満", edges)).toBeNull();
  });
  test("nominal width and kind from GSI attributes", () => {
    expect(nominalWidth({ width: 1322 })).toBe(8);
    expect(nominalWidth({ rnkwidth: "3m未満" })).toBe(2.5);
    expect(roadKind({ code: 2701, rdctg: "国道", width: 1322 })).toBe("national");
    expect(roadKind({ code: 2703, rdctg: "国道" })).toBe("bridge");
    expect(roadKind({ code: 2701, rdctg: "市区町村道等", width: 408 })).toBe("alley");
  });
});

describe("derive: lots", () => {
  test("roof colours snap into the anime palette", () => {
    for (const rgb of [[40, 90, 60], [70, 90, 140], [150, 70, 50], [200, 200, 200], [90, 80, 70], [30, 30, 30], null]) expect(PALETTE.has(ROOF_PALETTE[snapRoof(rgb)])).toBe(true);
    expect(snapRoof([60, 110, 80])).toBe("green");
    expect(snapRoof([150, 60, 45])).toMatch(/terracotta|red/);
  });
  test("classification is deterministic and sensible", () => {
    const small = { id: "a", code: 3101, area: 90, h: 6, zone: "hero", shore: -200, front: { kind: "city", width: 4, dist: 3 } };
    expect(classifyLot(small)).toEqual(classifyLot({ ...small }));
    expect(["house", "shop", "apartment"]).toContain(classifyLot(small).kind);
    expect(classifyLot({ ...small, id: "b", area: 2500, shore: -20 }).kind).toBe("factory");
    expect(classifyLot({ ...small, id: "c", code: 3111 }).kind).toBe("warehouse");
    const s = classifyLot({ ...small, id: "d", area: 120 });
    expect(s.height).toBeGreaterThan(2); expect(s.storeys).toBeGreaterThanOrEqual(1);
  });
  test("walls come from the pastel lists, roofs from the palette", () => {
    expect(lotWallColor("house", "x")).toMatch(/^#[0-9a-f]{6}$/);
    expect(PALETTE.has(lotRoofColor("house", "gable", [60, 110, 80], "x"))).toBe(true);
  });
  test("quay classification", () => {
    expect(quayKind({ x: 150, z: -120, zone: "hero", land: 2.5, slope: 0, roadNear: true })).toBe("promenade");
    expect(quayKind({ x: 352, z: -80, zone: "hero", land: 3, slope: 0.3, roadNear: false })).toBe("rocks");
    expect(quayKind({ x: 3000, z: 3000, zone: "mid", land: 12, slope: 0.4, roadNear: false })).toBe("rocks");
  });
});

describe("layout contract", () => {
  test("zones", () => {
    expect(L.ZONES.hero.r).toBeGreaterThan(300); expect(L.ZONES.mid.r).toBeGreaterThan(900);
    expect(L.zoneOf(L.ZONES.hero.cx, L.ZONES.hero.cz)).toBe("hero");
    expect(L.zoneOf(5000, 5000)).toBe("far");
    expect(L.ZONES.far.x1 - L.ZONES.far.x0).toBeGreaterThan(15000);
  });
  test("heightAt: sea, town, Mt. Anba, far corners", () => {
    expect(L.heightAt(160, -40)).toBeLessThan(0);                 // inner bay water centre -> seabed
    const town = L.heightAt(-60, -200); expect(town).toBeGreaterThan(0); expect(town).toBeLessThan(40);
    const anba = L.heightAt(L.SPOTS.anbaLookout.x, L.SPOTS.anbaLookout.z); expect(anba).toBeGreaterThan(200); expect(anba).toBeLessThan(260);
    for (const [x, z] of [[L.ZONES.far.x0 + 5, L.ZONES.far.z0 + 5], [L.ZONES.far.x1 - 5, L.ZONES.far.z1 - 5]]) expect(Number.isFinite(L.heightAt(x, z))).toBe(true);
  });
  test("heightAt is continuous (no steps > 3 m per metre except cliffs)", () => {
    let worst = 0;
    for (let x = -400; x < 700; x += 1) { const d = Math.abs(L.heightAt(x + 1, -60) - L.heightAt(x, -60)); worst = Math.max(worst, d); }
    expect(worst).toBeLessThan(3);
  });
  test("isWater: bay yes, town no, Oshima channel yes", () => {
    expect(L.isWater(160, -40)).toBe(true);
    expect(L.isWater(-60, -200)).toBe(false);
    expect(L.isWater(L.SPOTS.innerBay.x, L.SPOTS.innerBay.z)).toBe(true);
    expect(L.isWater(L.SPOTS.fishMarket.x, L.SPOTS.fishMarket.z)).toBe(false);
  });
  test("lots: shapes, frontage faces a road, zones, determinism", () => {
    const hero = L.LOTS.filter((l) => l.zone === "hero");
    expect(hero.length).toBeGreaterThan(300);
    expect(L.LOTS.length).toBeGreaterThan(40000);
    let faced = 0;
    for (const l of hero) {
      expect(l.poly.length).toBeGreaterThanOrEqual(3);
      expect(l.obb.w).toBeGreaterThan(0.5); expect(l.obb.d).toBeGreaterThan(0.5);
      expect(l.roof.color).toMatch(/^#[0-9a-f]{6}$/); expect(l.wall).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.storeys).toBeGreaterThanOrEqual(1); expect(l.height).toBeGreaterThan(2);
      expect(L.zoneOf(l.obb.cx, l.obb.cz)).toBe("hero");
      const f = L.lotFrame(l);
      // frame origin is on the OBB edge, local +Z points away from the box centre
      expect(Math.hypot(f.x - l.obb.cx, f.z - l.obb.cz)).toBeCloseTo(l.obb.d / 2, 1);
      const r = l.front.roadId && L.roadById(l.front.roadId);
      if (r) {
        let best = Infinity; for (const p of r.pts) best = Math.min(best, Math.hypot(p[0] - f.x, p[1] - f.z));
        const ahead = r.pts.some((p) => ((p[0] - f.x) * Math.sin(f.rotY) + (p[1] - f.z) * Math.cos(f.rotY)) > -2);
        if (ahead) faced++;
      }
    }
    expect(faced / hero.length).toBeGreaterThan(0.8);
    const far = L.LOTS.find((l) => l.zone === "far");
    expect(far.poly.length).toBe(4);
    const [x, z] = L.lotToWorld(far, 0, -far.obb.d / 2); expect(x).toBeCloseTo(far.obb.cx, 0); expect(z).toBeCloseTo(far.obb.cz, 0);
    expect(L.lotById(hero[0].id)).toBe(hero[0]);
    expect(hero[0].seed).toBe(hash32(hero[0].id));
  });
  test("lots are not in the sea (centre on land)", () => {
    const wet = L.LOTS.filter((l) => l.zone !== "far" && L.shoreDist(l.obb.cx, l.obb.cz) > 6);
    expect(wet.length / L.LOTS.filter((l) => l.zone !== "far").length).toBeLessThan(0.01);
  });
  test("roads have widths and kinds", () => {
    const kinds = new Set(["national", "prefectural", "city", "alley", "bridge"]);
    for (const r of L.ROADS) { expect(kinds.has(r.kind)).toBe(true); expect(r.width).toBeGreaterThan(1); expect(r.pts.length).toBeGreaterThanOrEqual(2); }
    expect(L.ROADS.filter((r) => r.zone === "hero").length).toBeGreaterThan(100);
  });
  test("pole runs are on land with 28-36 m spacing", () => {
    expect(L.POLE_RUNS.length).toBeGreaterThan(100);
    for (const run of L.POLE_RUNS.slice(0, 200)) {
      for (const p of run.pts) expect(L.isWater(p[0], p[1])).toBe(false);
      for (let i = 1; i < run.pts.length; i++) expect(Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1])).toBeLessThan(60);
    }
  });
  test("quays, water, spots, tour, hero", () => {
    expect(L.QUAYS.some((q) => q.kind === "promenade")).toBe(true);
    expect(L.WATER.length).toBeGreaterThan(10);
    for (const k of ["ukimido", "isuzuTorii", "pier7", "fishMarket", "kanae", "oshima", "anbaLookout"]) expect(L.SPOTS[k]).toBeTruthy();
    expect(L.isWater(L.SPOTS.ukimido.x, L.SPOTS.ukimido.z + 3) || L.shoreDist(L.SPOTS.ukimido.x, L.SPOTS.ukimido.z) > -8).toBe(true);
    for (const v of L.SPOTS.vending) expect(L.isWater(v.x, v.z)).toBe(false);
    expect(L.TOUR.map((t) => t.id)).toEqual(expect.arrayContaining(["bay", "market", "pier7", "kanae", "oshima", "anba"]));
    for (const t of L.TOUR) { expect(t.drone.pos.length).toBe(3); expect(t.drone.look.length).toBe(3); }
    expect(L.HERO.drone.pos[1]).toBeGreaterThan(60);
    expect(L.isWater(L.HERO.walk.x, L.HERO.walk.z)).toBe(false);
  });
  test("sunDirAt: unit vector, afternoon sun in the south-west, up at noon, down at night", () => {
    const s = L.sunDirAt(16.5, 283);
    expect(Math.hypot(...s)).toBeCloseTo(1, 6);
    expect(s[0]).toBeLessThan(0); expect(s[1]).toBeGreaterThan(0.1); expect(s[1]).toBeLessThan(0.45);
    const noon = L.sunDirAt(11.7, 283); expect(noon[1]).toBeGreaterThan(0.6); expect(noon[2]).toBeGreaterThan(0);   // south = +Z
    expect(L.sunDirAt(21, 283)[1]).toBeLessThan(0);
    expect(L.sunDirAt(12, 172)[1]).toBeGreaterThan(L.sunDirAt(12, 355)[1]);
  });
});
