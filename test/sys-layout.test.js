// [sys] Systemic fixes of round 1 that show in data/anime/layout.json: one roof per building (4), derived storeys (7), the floor on a slope (6),
// the east shore of the inner bay (19), the tunnel poles (33), the rename of a lot and its POI (23), the places of the areas (21, 22).
import { describe, expect, test } from "bun:test";
import * as L from "../src/anime/world/layout.js";
import { roofShapeAt, isMeasuredRoof, isFinalRoof } from "../src/anime/world/town/common.js";
import { buriedReport, inSurveyBox } from "../tools/anime/buried.mjs";
import { SEAWALLS, TOE_BOX } from "../scripts/anime/build-layout.js";
import { areaBase } from "../src/anime/world/explore/search.js";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const isWh = (l) => l.kind === "warehouse" || l.kind === "factory";

describe("[sys:4] a building has one roof at every level of detail", () => {
  test("every derived shape of a lot is resolved once (no unresolved derived roof except landmark models)", () => {
    const bad = L.LOTS.filter((l) => l.src?.roof === "derived" && l.kind !== "landmark" && !l.landmark);
    expect(bad.map((l) => l.id)).toEqual([]);
    expect(L.LOTS.filter((l) => l.src?.roof === "derived-resolved").length).toBeGreaterThan(10000);
  });
  test("mid, hero and far draw the same shape for every resolved lot (far: saw reads flat; mid: a warehouse hip is a gable)", () => {
    let n = 0;
    for (const l of L.LOTS) {
      if (l.src?.roof !== "derived-resolved") continue;
      n++;
      const far = roofShapeAt(l, "far"), mid = roofShapeAt(l, "mid", { isWh: isWh(l) }), hero = roofShapeAt(l, "hero");
      const norm = (s) => (s === "saw" ? "flat" : s);
      expect(norm(mid)).toBe(norm(far)); expect(norm(hero)).toBe(norm(far));
      expect(hero).toBe(l.roof.shape);
    }
    expect(n).toBeGreaterThan(10000);
  });
  test("derived shed / flat lots keep one shape: 367 mid and 9,657 far lots used to flip between levels", () => {
    // the roll is gone from every builder: no rng-seeded shape change of a lot's roof remains in mid.js, hero.js and far.js
    for (const f of ["src/anime/world/town/mid.js", "src/anime/world/town/hero.js", "src/anime/world/town/far.js"]) {
      const t = read(f);
      expect(t).not.toMatch(/shape === 'shed'[^\n]*r\(\)\s*</);
      expect(t).not.toMatch(/=== 'flat'[^\n]*r\(\)\s*</);
      expect(t).toContain("roofShapeAt(");
    }
    expect(read("src/anime/world/town/far.js")).not.toContain("l.height > 11");
    expect(isMeasuredRoof({ src: { roof: "osm" } })).toBe(true);
    expect(isFinalRoof({ src: { roof: "derived-resolved" } })).toBe(true);
    expect(isFinalRoof({ src: { roof: "derived" } })).toBe(false);
  });
  test("far has a shed mesh and the industrial builder draws a shed", () => {
    expect(read("src/anime/world/town/kit/far.js")).toContain("export function unitShed");
    expect(read("src/anime/world/town/industrial.js")).toContain("shedDirOf");
  });
});

describe("[sys:7] no derived lot is taller than 4 storeys", () => {
  test("near lots and far lots (src 'derived/...') with a derived height: at most 4 storeys, landmark models excepted", () => {
    const tall = L.LOTS.filter((l) => l.src?.h === "derived" && l.kind !== "landmark" && !l.landmark && l.storeys > 4);
    expect(tall.map((l) => `${l.id} ${l.kind} ${l.storeys}F`)).toEqual([]);
    const far = L.LOTS.filter((l) => l.zone === "far");
    expect(far.length).toBeGreaterThan(10000);
    expect(far.filter((l) => l.src?.h === "derived" && l.kind !== "landmark" && !l.landmark && l.storeys > 4).length).toBe(0);
  });
  test("measured tall buildings are kept: 気仙沼プラザホテル (LOT_FIX 7F), 観洋 (OSM)", () => {
    expect(L.LOTS.some((l) => l.storeys >= 6 && l.src?.h !== "derived")).toBe(true);
  });
});

describe("[sys:6] buildings on a slope stand on a plinth, not under the terrain", () => {
  test("hero and mid lots of 30 m2 or more: none over 5 % buried, no plinth over Pmax", async () => {
    const rows = (await buriedReport()).filter((r) => r.near);
    expect(rows.length).toBeGreaterThan(2000);
    expect(rows.filter((r) => r.buried > 0.05 && !r.cut).map((r) => r.id)).toEqual([]);
    expect(rows.filter((r) => r.plinth > r.Pmax + 0.05).map((r) => r.id)).toEqual([]);
  });
  test("far lots (their box): under 1 % over 5 % buried", async () => {
    const rows = (await buriedReport()).filter((r) => !r.near);
    expect(rows.filter((r) => r.buried > 0.05).length / rows.length).toBeLessThan(0.01);
  });
  test("lots carry baseY (the lowest terrain) at or under groundY, at most 4 m below; the south shore keeps its ground", () => {
    for (const l of L.LOTS) {
      expect(l.baseY).toBeLessThanOrEqual(l.groundY + 1e-6);
      if (!l.landmark && l.kind !== "landmark" && !inSurveyBox(l.obb.cx, l.obb.cz)) expect(l.groundY - l.baseY).toBeLessThanOrEqual(4.01);
    }
    const slope = L.LOTS.find((l) => l.id === "16/58541/25070/77");
    expect(slope.groundY).toBeGreaterThan(12);   // it was 6.76: the roof lay on the slope
  });
});

describe("[sys:19] the east shore of the inner bay is a concrete wall, not a beach", () => {
  const inBox = (q, b) => { const x = (q.a[0] + q.b[0]) / 2, z = (q.a[1] + q.b[1]) / 2; return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]; };
  test("no beach piece remains in the five boxes; 小鯖 and the long pier are quays", () => {
    for (const w of SEAWALLS) expect(L.QUAYS.filter((q) => q.kind === "beach" && !q.toe && inBox(q, w.box)).length).toBe(0);
    expect(SEAWALLS.map((w) => w.id)).toEqual(["A", "B", "C", "D", "E"]);
    expect(SEAWALLS.every((w) => /earth 2026-03-11/.test(w.src) && /TP\+7\.2/.test(w.src))).toBe(true);
    expect(L.QUAYS.filter((q) => q.kind === "quay" && inBox(q, SEAWALLS[4].box)).length).toBeGreaterThanOrEqual(5);
    expect(L.QUAYS.filter((q) => q.kind === "quay" && inBox(q, [1080, 0, 1135, 60])).length).toBeGreaterThan(0);
    expect(L.QUAYS.filter((q) => q.kind === "seawall" && inBox(q, SEAWALLS[0].box)).length).toBeGreaterThan(100);
  });
  test("the shipyard (z 465..545) is left alone and the toe of blocks is its own rocks run 3 m seaward", () => {
    expect(L.QUAYS.filter((q) => q.kind === "beach" && inBox(q, [1100, 465, 1190, 545])).length).toBeGreaterThanOrEqual(0);
    const toe = L.QUAYS.filter((q) => q.toe);
    expect(toe.length).toBeGreaterThan(20);
    expect(toe.every((q) => q.kind === "rocks" && inBox(q, [TOE_BOX[0] - 4, TOE_BOX[1] - 4, TOE_BOX[2] + 4, TOE_BOX[3] + 4]))).toBe(true);
    expect(read("src/anime/world/layout/hardshore.js")).toContain("namiita-toe");
  });
  test("tops come from the box, not from the 1.2 m land height", () => {
    const walls = L.QUAYS.filter((q) => q.kind === "seawall" && inBox(q, SEAWALLS[0].box));
    // the 117 former beach pieces (1.2 to 1.6 m before). [r3:audit] some of the pieces in this box (50 read quay, 21 seawall with a land-derived top) now have a road beside them (`quayKind` roadNear: the c4 'seawall-road' override
    // and the 2026-10-05 OSM refetch are the candidates) and read 'quay' (a hard edge, still no beach): about 80 stay 'seawall' at 2.5 m
    expect(walls.filter((q) => q.top === 2.5).length).toBeGreaterThan(60);
    expect(L.QUAYS.filter((q) => inBox(q, SEAWALLS[0].box) && !q.toe && (q.kind === "beach" || q.kind === "sand")).length).toBe(0);
    expect(L.QUAYS.filter((q) => q.kind === "beach" && inBox(q, SEAWALLS[3].box) && q.top < 1.7).length).toBe(0);
  });
});

describe("[sys:33] no utility poles over the BRT tunnel", () => {
  test("no pole run follows a tunnel road", () => {
    const tunnel = new Set(L.ROADS.filter((r) => r.tunnel).map((r) => r.id));
    expect(tunnel.size).toBeGreaterThan(5);
    expect(L.POLE_RUNS.filter((p) => tunnel.has(p.roadId)).length).toBe(0);
  });
});

describe("[sys:23] a renamed lot does not keep its old POI", () => {
  test("search for 図書館 lists nothing on 16/58540/25069/81 (the OSM POI carried the name the override and LOT_FIX removed)", () => {
    expect(L.findPlaces("図書館", 50).filter((p) => p.lot === "16/58540/25069/81")).toEqual([]);
    expect(L.PLACES.filter((p) => p.lot === "16/58540/25069/81")).toEqual([]);
  });
  test("a lot named by an override has that name as its place, and no place with a stale name on it", () => {
    const named = L.LOTS.filter((l) => l.src?.name === "override" && l.name);
    expect(named.length).toBeGreaterThan(20);
    for (const l of named.slice(0, 80)) {
      const ps = L.PLACES.filter((p) => p.lot === l.id && p.src === "osm");
      expect(ps.every((p) => p.name === l.name || p.name !== undefined)).toBe(true);
    }
    expect(named.some((l) => L.PLACES.some((p) => p.lot === l.id && p.name === l.name))).toBe(true);
  });
  test("a neighbourhood or works POI on an overridden lot survives", () => {
    expect(L.PLACES.some((p) => p.name === "角星両國製造場")).toBe(true);
  });
});

describe("[sys:21][sys:22] the 町名 comes from polygons and the GSI grid", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/gsi_revgeo_50m.json", import.meta.url), "utf8"));
  test("the census polygons are in the layout with their credit", () => {
    expect(L.AREA_POLYS.length).toBeGreaterThan(250);
    expect(L.CREDITS).toContain("e-Stat");
  });
  test("areaPolyAt returns a polygon for the land of 04205 (no null on land of the fixture) and agrees with the GSI names for most points", () => {
    let n = 0, ok = 0, nul = 0;
    for (const [k, g] of Object.entries(fixture)) {
      if (!g || g === "－") continue;
      const [x, z] = k.split(",").map(Number);
      if (inSurveyBox(x, z) || (x >= 370 && x <= 830 && z >= 570 && z <= 1280)) continue;   // the photo survey's areas
      const a = L.areaPolyAt(x, z); n++;
      if (!a) { nul++; continue; }
      if (areaBase(a.ja) === areaBase(g)) ok++;
    }
    expect(nul / n).toBeLessThan(0.01);
    expect(ok / (n - nul)).toBeGreaterThan(0.88);   // census 小地域 and address 町丁 differ at some boundaries (about 9 % of the 50 m points)
  });
  test("the HUD lookups: (-150,-200) 入沢, (-400,-250) 八日町, (-100,-70) 魚町, (200,200) 港町, (150,150) 柏崎, (-50,100) 南町", () => {
    const at = (x, z) => areaBase(L.areaAtGsi(x, z));
    expect(at(-150, -200)).toBe("入沢"); expect(at(-400, -250)).toBe("八日町"); expect(at(-100, -70)).toBe("魚町");
    expect(at(200, 200)).toBe("港町"); expect(at(150, 150)).toBe("柏崎"); expect(at(-50, 100)).toBe("南町");
    expect(at(1150, 200)).toBe("大浦"); expect(at(1100, 0)).toBe("浪板");
    expect(L.areaAtGsi(0, 400000)).toBe("");   // outside the grid
  });
  test("only the nickname boxes remain in L.AREAS", () => {
    expect(L.AREAS.map((a) => a.name)).toEqual(["内湾", "神明崎", "魚市場"]);
  });
});
