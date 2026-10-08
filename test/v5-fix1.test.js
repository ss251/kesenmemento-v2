// [v5:fix1] Accuracy blockers from review round 1 (Google Earth imagery 2026-03-11): ground brightness, PIER7 and 迎
// massing, the PIER7 arrival, 神明崎's north base, search ranking, the default season's 紅葉 share and the early-spring preset.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "../src/anime/world/layout.js";
import { PIER7_SPLIT, MUKAERU_SPLIT, MUKAERU_STEPS } from "../src/anime/world/harbor/minami.js";
import { SITES } from "../src/anime/world/harbor/real.js";
import { inPoly } from "../src/anime/world/town/landuse.js";
import { createSearch, areaBase } from "../src/anime/world/explore/search.js";
import { PRESETS, seasonUniform, seasonExtra, SEASON_GLSL } from "../src/anime/core/season.js";
import { FRAMES } from "../src/anime/world/life/tour.js";

const ROOT = join(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const lum = (h) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);

describe("S1 ground", () => {
  test("town ground and paving are at Earth's asphalt / gravel brightness, not pale beige", () => {
    const lc = JSON.parse(read("data/anime/landcover.json"));
    for (const id of ["town", "paving"]) expect(lum(lc.classes.find((c) => c.id === id).color)).toBeLessThan(140);
    expect(read("scripts/anime/build-landcover.js")).toContain('{ id: "town", color: "#6d696b" }');
  });
});

describe("S1 PIER7 massing", () => {
  const foot = SITES.pier7.poly.slice(0, -1);
  test("the 3F covers about half the footprint on the street side; the stepped terrace lies inside the bay side", () => {
    const f = area(PIER7_SPLIT.upper) / area(foot);
    expect(f).toBeGreaterThan(0.4); expect(f).toBeLessThan(0.6);
    for (const r of [PIER7_SPLIT.upper, ...PIER7_SPLIT.steps]) { const c = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]); expect(inPoly(c[0], c[1], foot)).toBe(true); }
    // the steps are nested from the 3F wall: each one smaller (higher) than the last
    const a = PIER7_SPLIT.steps.map(area); expect(a[0]).toBeGreaterThan(a[1]); expect(a[1]).toBeGreaterThan(a[2]);
    // the bay normal points to the NE (the bay)
    expect(PIER7_SPLIT.bayN[0]).toBeGreaterThan(0); expect(PIER7_SPLIT.bayN[1]).toBeLessThan(0);
  });
  test("pale glass, a dark grey terrace and no full-bar third storey in the model", () => {
    const src = read("src/anime/world/harbor/minami.js");
    expect(src).toContain("glassPale: '#a9bccb'"); expect(src).toContain("terraceA: '#6d6664'");
    // [v5:fix2] the 3F is now the main of three blocks along the street-side split (test/v5-fix2.test.js)
    expect(src).toContain("glazedBand(P, f3, top - 0.55");   // [v6:rebuild] the main block's 3F over its surveyed depth
    expect(src).not.toContain("glazedBand(poly, f3,");
  });
  test("迎 has three roof sections and a tan stepped deck at its NW end", () => {
    expect(MUKAERU_SPLIT.length).toBe(3);
    expect(new Set(MUKAERU_SPLIT.map((s) => s.dy)).size).toBe(3);
    const sum = MUKAERU_SPLIT.reduce((s, g) => s + area(g.poly), 0);
    expect(Math.abs(sum - area(SITES.mukaeru.poly.slice(0, -1)))).toBeLessThan(1);
    expect(MUKAERU_STEPS.n[0]).toBeGreaterThan(0);   // off the bay face (NE)
    expect(L.isWater(MUKAERU_STEPS.a[0] + MUKAERU_STEPS.n[0] * 11, MUKAERU_STEPS.a[1] + MUKAERU_STEPS.n[1] * 11)).toBe(false);
  });
});

describe("S2 arrival, surfaces and search", () => {
  test("PIER7's walk spot stands at the garden head, on land and outside every building, facing the garden", () => {
    const w = FRAMES.pier7.walk, t = L.TOUR.find((s) => s.id === "pier7").walk;
    expect([w.x, w.z, w.yaw]).toEqual([5, 40, -130]); expect([t.x, t.z, t.yaw]).toEqual([5, 40, -130]);
    expect(L.isWater(w.x, w.z)).toBe(false);
    for (const id of ["pier7", "mukaeru", "yuwaeru", "hirakeru"]) expect(inPoly(w.x, w.z, SITES[id].poly)).toBe(false);
    // the ring planters lie within 40 deg of the view direction
    const y = (w.yaw * Math.PI) / 180, fx = -Math.sin(y), fz = -Math.cos(y);
    for (const [px, pz] of [[18.8, 55.4], [25.5, 61.5], [31.3, 60.8]]) { const d = Math.hypot(px - w.x, pz - w.z); expect(((px - w.x) * fx + (pz - w.z) * fz) / d).toBeGreaterThan(Math.cos((40 * Math.PI) / 180)); }
  });
  test("神明崎's north base is gravel and a park, no car park", () => {
    const at = (x, z) => L.LANDUSE.filter((l) => l.src === "override" && inPoly(x, z, l.ring)).map((l) => l.cls);
    for (const p of [[285, -170], [320, -130]]) { expect(at(...p)).toContain("gravel"); expect(at(...p)).not.toContain("parking"); }
    expect(at(312, -90)).toContain("apron");   // the west walkway, not a sand beach ([v6:c7r2] grey asphalt / concrete, Earth #86848a: 'apron', no longer the cream 'plaza')
  });
  test("浮見海道 is pale concrete with the 朱 rails, the 魚町 seawall strip grey pavers, 海の市's deck grey-brown", () => {
    expect(read("src/anime/world/harbor/shinmei.js")).toContain("walkDeck: '#b9b6ad'");
    expect(read("src/anime/world/harbor/uwall.js")).toContain("pave: '#b8b6b2'");
    expect(read("src/anime/world/harbor/market4.js")).toContain("umiDeck: t('#8f7a68'");
    expect(read("src/anime/world/harbor/market4.js")).toContain("parkCars(main, roofY, r, 0.15,");
  });
  test("a bare 町名 lists its districts before the shops that carry the name", () => {
    expect(areaBase("八日町一丁目")).toBe("八日町"); expect(areaBase("八日町（二）")).toBe("八日町");
    const S = createSearch(L, { near: () => [-245, -225] });
    const r = S.find("八日町", 4);
    expect(["district", "neighbourhood", "quarter"]).toContain(r[0].cat);
    expect(S.find("八日町調剤薬局", 1)[0].ja).toBe("八日町調剤薬局");
  });
});

describe("S3 seasons", () => {
  test("the default autumn paints about 2 % 紅葉; the early-spring preset has no snow and dry turf", () => {
    expect(read("src/anime/world/environment/terrain.js")).toContain("uAutumn: { value: o.autumn ?? 0.02 }");
    expect(read("src/anime/world/environment/trees.js")).toContain("vTreeSeed >= 0.2");
    expect(PRESETS.early).toMatchObject({ base: "winter", snow: 0, dry: 1 });
    const u = seasonUniform({}); expect(seasonExtra(u).value.toArray()).toEqual([1, 0]);
    expect(SEASON_GLSL).toContain("uniform vec2 uSeasonE;");
    expect(SEASON_GLSL).toContain("float w = uSeasonS.w * uSeasonE.x;");
  });
});
