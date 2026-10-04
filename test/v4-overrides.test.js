// [v4:overrides] Per-cell reference overrides (docs/anime/OVERRIDES.md): the schema validation, the deterministic
// file order, every operation (lot patches and removal, new lots, land use, roads, props), the provenance in lot.src,
// the client side (far-lot provenance, facade style, plaza look, props), and a full layout build with a fixture folder.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateOverride, compileOverrides, loadOverrides, listOverrideFiles, patchLot, overrideFeatures, applyRoadOverrides,
  applyLanduseOverrides, propPlacements, unusedLotPatches, LANDUSE_USES, COVER_USES, FACADES,
} from "../scripts/anime/enrich/overrides.js";
import { STYLE } from "../src/anime/world/town/facade.js";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const doc = (extra = {}) => ({ version: 1, cell: "pier7", bbox: [-50, -10, 130, 170], sources: [{ id: "earth", what: "Google Earth 3D, imagery dated 2026-03-11", date: "2026-03-11" }, { id: "photo", what: "author photo IMG_0001" }], ...extra });
const tmp = (files) => { const d = mkdtempSync(join(tmpdir(), "klc-ovr-")); for (const [f, v] of Object.entries(files)) writeFileSync(join(d, f), typeof v === "string" ? v : JSON.stringify(v)); return d; };
const lot = (id, cx, cz, extra = {}) => ({ id, kind: "warehouse", storeys: 1, height: 7.8, obb: { cx, cz }, roof: { shape: "gable", color: "#aabbcc", photo: "#a0b0c0", ridge: "x" }, wall: "#eeeeee", src: { h: "derived", kind: "osm", roof: "aerial", color: "aerial" }, ...extra });
const classify = (k) => ({ house: { storeys: 2, height: 5.8, roofShape: "gable" }, shop: { storeys: 2, height: 6.1, roofShape: "flat" } }[k] || { storeys: 1, height: 3, roofShape: "flat" });

describe("[v4:overrides] schema", () => {
  test("a valid document passes and keeps its file name", () => {
    const d = validateOverride(doc({ lots: [{ id: "16/1/2/3", kind: "shop", src: "earth: glazed shop front" }] }), "pier7.json");
    expect(d.file).toBe("pier7.json");
    expect(d.lots.length).toBe(1);
  });
  test("every problem is reported with its path", () => {
    const bad = doc({
      extra: 1,
      lots: [{ id: "a", kind: "castle", storeys: 2.5, roof: { shape: "dome", color: "red" }, src: "earth" }, { id: "b", src: "earth" }, { id: "c", remove: true, kind: "house", src: "earth" }],
      newLots: [{ id: "lot1", poly: [[0, 0], [1, 0]], kind: "house", height: 3, src: "nowhere" }],
      landuse: [{ use: "orchard", ring: [[0, 0], [10, 0], [10, 10]], src: "earth" }],
      roads: [{ id: "x9", width: 5, src: "earth" }, { id: "ovr:pier7:new", width: 4, src: "earth" }],
      props: [{ type: "statue", at: [9999, 0], src: "earth" }],
    });
    let msg = "";
    try { validateOverride(bad, "bad.json"); } catch (e) { msg = e.message; }
    for (const s of ['unknown field "extra"', ".lots[0].kind", ".lots[0].storeys", ".lots[0].roof.shape", ".lots[0].roof.color", ".lots[1]: changes nothing", ".lots[2]: a remove takes only id and src",
      '.newLots[0].id: must be "ovr:<cell>:<name>"', ".newLots[0].src: must start with a source id", ".newLots[0].poly", ".landuse[0].use", ".roads[0].id", ".roads[1]: a new road needs pts, width and kind", ".props[0].type", ".props[0].at", "outside the cell bbox"])
      expect(msg).toContain(s);
  });
  test("a coordinate outside the cell (a sign error on z, which points south) is caught", () => {
    expect(() => validateOverride(doc({ props: [{ type: "bench", at: [40, -90], src: "earth" }] }))).toThrow(/outside the cell bbox/);
    expect(() => validateOverride(doc({ props: [{ type: "bench", at: [40, 90], src: "earth" }] }))).not.toThrow();
  });
  test("version, cell id, bbox and sources are required", () => {
    expect(() => validateOverride({ version: 1, cell: "Pier 7", bbox: [1, 1, 0, 0], sources: [] })).toThrow(/\.cell[\s\S]*\.bbox[\s\S]*\.sources/);
  });
  test("vocabularies match the renderers", () => {
    for (const f of FACADES) expect(STYLE[f]).toBeNumber();
    const look = read("src/anime/world/town/landuse.js"), map = read("src/anime/world/explore/basemap.js");
    // [v5:fix2] the woods and clear-cuts (forest, cedar, felled) are land cover, not draped surfaces: build-landcover.js
    // paints them and build-trees.js plants them; the map shows them
    const cover = read("scripts/anime/build-landcover.js");
    for (const cls of [...Object.values(LANDUSE_USES), "weeds"]) {
      if (COVER_USES.includes(cls)) expect(cover).toMatch(new RegExp(`\\b${cls}: \\d`)); else expect(look).toMatch(new RegExp(`\\b${cls}: \\{ col:`));
      expect(map).toContain(`${cls}: '#`);
    }
  });
});

describe("[v4:overrides] order and determinism", () => {
  test("files apply in code-unit name order, whatever the directory order", () => {
    const d = tmp({ "b2.json": doc({ cell: "b", lots: [{ id: "L", height: 9, src: "earth" }] }), "B.json": doc({ cell: "a", lots: [{ id: "L", height: 5, src: "earth" }] }), "a.json": doc({ cell: "c", lots: [{ id: "L", height: 7, src: "earth" }] }), "notes.txt": "x" });
    try {
      expect(listOverrideFiles(d)).toEqual(["B.json", "a.json", "b2.json"]);   // code units: upper case first (a locale sort would not)
      const C = compileOverrides(loadOverrides(d));
      const l = lot("L", 0, 0);
      patchLot(l, C.lotPatch.get("L"));
      expect(l.height).toBe(9);   // the last file wins
      expect(l.src.ovr).toBe("B.json#lots/0 + a.json#lots/0 + b2.json#lots/0");
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test("a missing folder is no overrides; malformed JSON names the file", () => {
    expect(loadOverrides(join(tmpdir(), "klc-no-such-dir-" + process.pid))).toEqual([]);
    const d = tmp({ "x.json": "{ nope" });
    try { expect(() => loadOverrides(d)).toThrow(/overrides\/x\.json: not valid JSON/); } finally { rmSync(d, { recursive: true, force: true }); }
  });
  test("a new lot id defined in two files is an error", () => {
    const n = { id: "ovr:pier7:a", poly: [[0, 0], [10, 0], [10, 10], [0, 10]], kind: "house", height: 6, src: "earth" };
    expect(() => compileOverrides([validateOverride(doc({ newLots: [n] }), "1.json"), validateOverride(doc({ newLots: [n] }), "2.json")])).toThrow(/defined twice/);
  });
});

describe("[v4:overrides] operations", () => {
  const C = compileOverrides([validateOverride(doc({
    lots: [
      { id: "W", kind: "shop", roof: { shape: "flat", color: "#ECEEED" }, wall: "#F1F1EE", name: "テスト商店", facade: "shop", src: "earth: white flat roof, glazed front" },
      { id: "H", kind: "house", src: "photo: a two-storey house" },
      { id: "X", remove: true, src: "earth: demolished, now a car park" },
    ],
    newLots: [{ id: "ovr:pier7:kiosk", poly: [[10, 10], [16, 10], [16, 14], [10, 14]], kind: "shop", storeys: 1, roof: { shape: "shed", color: "#556677" }, src: "earth: a new kiosk" }],
    landuse: [{ use: "parking", ring: [[0, 0], [40, 0], [40, 30], [0, 30]], replace: true, src: "earth: striped car park" }, { use: "vacant", surface: "weeds", ring: [[50, 0], [60, 0], [60, 10]], src: "earth" }, { use: "plaza", ring: [[70, 0], [80, 0], [80, 10], [70, 10]], name: "PIER7 広場", src: "earth" }],
    roads: [{ id: "r1", width: 9, carriage: 6.5, name: "新しい通り", src: "earth" }, { id: "r2", remove: true, src: "earth: the lane is gone" }, { id: "r3", width: 3, src: "earth" }, { id: "ovr:pier7:lane", pts: [[0, 50], [0, 100]], width: 4, kind: "city", src: "earth" }],
    props: [{ type: "vending", at: [30, 90], face: 90, src: "earth" }, { type: "bench", at: [31, 91], y: 5.61, src: "photo" }],
  }), "pier7.json")]);

  test("a lot patch sets every field and records the provenance", () => {
    const l = lot("W", 40, 80, { src: { h: "osm", kind: "osm", roof: "aerial", color: "aerial" } });
    expect(patchLot(l, C.lotPatch.get("W"), classify)).toBe(1);
    expect(l.kind).toBe("shop");
    expect(l.height).toBe(7.8);   // the kind changed but the height is OSM's (it stays): only derived values re-derive
    expect(l.roof).toEqual({ shape: "flat", color: "#eceeed" });   // flat drops the ridge; a set colour drops the photo sample
    expect(l.wall).toBe("#f1f1ee");
    expect(l.name).toBe("テスト商店");
    expect(l.facade).toBe("shop");
    expect(l.src).toMatchObject({ kind: "override", roof: "override", color: "override", wall: "override", name: "override", ovr: "pier7.json#lots/0", ovrWhy: "earth: white flat roof, glazed front" });
  });
  test("a new kind re-derives the derived height and roof", () => {
    const l = lot("H", 40, 80, { src: { h: "derived", kind: "derived", roof: "derived", color: "aerial" } });
    patchLot(l, C.lotPatch.get("H"), classify);
    expect([l.kind, l.storeys, l.height, l.roof.shape]).toEqual(["house", 2, 5.8, "gable"]);
    expect(l.roof.ridge).toBeUndefined();
    expect(l.src.h).toBe("override");
  });
  test("storeys and height fill each other in", () => {
    const a = lot("S", 0, 0), b = lot("S", 0, 0);
    patchLot(a, [{ storeys: 3, ref: "t#0", why: "earth" }]); patchLot(b, [{ height: 10, ref: "t#0", why: "earth" }]);
    expect([a.storeys, a.height]).toEqual([3, 13.5]);   // warehouse storey 4.5 m
    expect([b.storeys, b.height]).toEqual([2, 10]);
  });
  test("remove, and a patch on a lot outside the cell fails", () => {
    expect(patchLot(lot("X", 40, 80), C.lotPatch.get("X"))).toBe("remove");
    expect(() => patchLot(lot("W", 900, 900), C.lotPatch.get("W"))).toThrow(/outside the cell bbox/);
    expect(unusedLotPatches(C, new Set(["W", "H"]))).toEqual(["X"]);
  });
  test("a new lot becomes a footprint feature for the lot pipeline", () => {
    const f = overrideFeatures(C);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "ovr:pier7:kiosk", code: 3101, poly: [[10, 10], [16, 10], [16, 14], [10, 14]] });
    const l = { id: f[0].id, kind: "house", storeys: 2, height: 5.8, obb: { cx: 13, cz: 12 }, roof: { shape: "gable", color: "#4a4f58" }, src: {} };
    patchLot(l, [f[0].ovr], classify);
    expect([l.kind, l.storeys, l.height, l.roof.shape, l.roof.color]).toEqual(["shop", 1, 3, "shed", "#556677"]);
  });
  test("land use: classes, surface, replace, provenance", () => {
    const old = [{ cls: "park", ring: [[5, 5], [15, 5], [15, 15], [5, 15]] }, { cls: "park", ring: [[500, 500], [510, 500], [510, 510]] }];
    const { landuse, replaced } = applyLanduseOverrides(old, C);
    expect(replaced).toBe(1);
    expect(landuse.map((l) => l.cls)).toEqual(["park", "parking", "weeds", "plaza"]);
    expect(landuse[1]).toMatchObject({ type: "override:parking", src: "override", ovr: "pier7.json#landuse/0", area: 1200 });
    expect(landuse[3].name).toBe("PIER7 広場");
  });
  test("roads: patch, remove, missing ids, new roads by zone", () => {
    const roads = [{ id: "r1", pts: [[0, 0], [0, 40]], width: 8, carriage: 7, kind: "city", name: "旧名", nameEn: "Old" }, { id: "r2", pts: [[10, 0], [10, 40]], width: 4, kind: "city" }, { id: "r9", pts: [[0, 0], [5, 5]], width: 4, kind: "city" }];
    const st = applyRoadOverrides(roads, C, { zoneOf: () => "hero" });
    expect(st).toMatchObject({ patched: 1, removed: 1, added: 1, missing: ["r3"] });
    expect(roads.map((r) => r.id)).toEqual(["r1", "r9", "ovr:pier7:lane"]);
    expect(roads[0]).toMatchObject({ width: 9, carriage: 6.5, name: "新しい通り", ovr: "pier7.json#roads/0" });
    expect(roads[0].nameEn).toBeUndefined();
    expect(roads[2]).toMatchObject({ zone: "hero", kind: "city", width: 4 });
    const far = [{ id: "r1", pts: [[0, 0], [0, 40]], width: 8, kind: "city" }];
    applyRoadOverrides(far, C, { keep: (r) => r.zone === "hero" });
    expect(far.map((r) => r.id)).toEqual(["r1"]);   // the new road is not taken by a list that keeps only hero roads
  });
  test("props: compass bearing -> rotY (local +z faces the bearing)", () => {
    const P = propPlacements(C);
    expect(P[0]).toMatchObject({ type: "vending", x: 30, z: 90, ovr: "pier7.json#props/0" });
    expect(Math.sin(P[0].rotY)).toBeCloseTo(1, 3);   // faces east (+x)
    expect(Math.cos(P[0].rotY)).toBeCloseTo(0, 3);
    expect(P[1].rotY).toBeCloseTo(Math.PI, 3);   // default: faces north (-z)
    expect(P[1].y).toBe(5.6);   // a deck above the terrain
    expect("y" in P[0]).toBe(false);
  });
});

describe("[v4:overrides] wiring", () => {
  test("build-layout and build-explore fold the overrides; the client keeps them", () => {
    const bl = read("scripts/anime/build-layout.js"), be = read("scripts/anime/build-explore.js");
    for (const s of ["loadOverrides(overridesDir)", "overrideFeatures(OV)", "patchLot(lot, ops, classify)", "applyRoadOverrides(ROADS, OV", "applyLanduseOverrides(", "propPlacements(OV)", "unusedLotPatches(OV, seenIds)", "x.ovr = l.src.ovr"]) expect(bl).toContain(s);
    for (const s of ["applyRoadOverrides(roads, OV", "overrideFeatures(OV)"]) expect(be).toContain(s);
    expect(read("scripts/anime/enrich/fold.js")).toContain("OVERRIDES_DIR");
    const ly = read("src/anime/world/layout.js");
    expect(ly).toContain("!l.src?.ovr) applyLotFix(l)");
    expect(ly).toContain("export const PROPS");
    expect(read("src/anime/world/town/mid.js")).toContain("STYLE[lot.facade]");
    expect(read("src/anime/world/town/props.js")).toContain("L.PROPS");
    // the builders take override values as measured (heights, roof shapes, roof and wall colours are not re-randomised)
    expect(read("src/anime/world/town/hero.js")).toContain("lot.src?.h === 'override'");
    expect(read("src/anime/world/town/hero.js")).toContain("lot.src?.roof === 'override'");
    expect(read("src/anime/world/town/palette.js").match(/=== 'override'/g).length).toBe(3);
    expect(read("src/anime/world/town/mid.js").match(/=== 'override'/g).length).toBe(2);
    expect(existsSync(join(ROOT, "docs/anime/OVERRIDES.md"))).toBe(true);
  });
  test("every committed override file is valid", () => {
    const docs = loadOverrides(join(ROOT, "data/anime/overrides"));
    expect(() => compileOverrides(docs)).not.toThrow();
  });
});

// A real layout build with a fixture folder (about 15 s; needs the decoded vector tiles in data/cache/anime)
const HAVE_CACHE = existsSync(join(ROOT, "data/cache/anime/vt.json")) && existsSync(join(ROOT, "data/buildings/city.json"));
describe.skipIf(!HAVE_CACHE)("[v4:overrides] build-layout with a fixture folder", () => {
  test("patch, remove, new lot, land use, road, props, provenance", async () => {
    const { buildLayout } = await import("../scripts/anime/build-layout.js");
    const d = tmp({
      "20-pier7.json": doc({
        lots: [
          { id: "16/58541/25068/66", kind: "shop", storeys: 2, roof: { shape: "flat", color: "#d0d4d2" }, facade: "shop", src: "earth: fixture" },
          { id: "16/58541/25068/70", remove: true, src: "earth: fixture" },
        ],
        newLots: [{ id: "ovr:pier7:kiosk", poly: [[80, 60], [88, 60], [88, 66], [80, 66]], kind: "shop", height: 3.4, roof: { shape: "flat", color: "#aab0b4" }, src: "earth: fixture" }],
        landuse: [{ use: "plaza", ring: [[60, 60], [75, 60], [75, 75], [60, 75]], src: "earth: fixture" }],
        roads: [{ id: "r12642", width: 5.5, src: "earth: fixture" }],
        props: [{ type: "bench", at: [70, 70], face: 45, src: "earth: fixture" }],
      }),
      "10-pier7.json": doc({ lots: [{ id: "16/58541/25068/66", height: 20, wall: "#123456", src: "photo: fixture" }] }),
    });
    try {
      const L = await buildLayout({ overridesDir: d });
      const byId = new Map(L.lots.map((l) => [l.id, l]));
      const a = byId.get("16/58541/25068/66");
      expect(a).toMatchObject({ kind: "shop", storeys: 2, height: 6, wall: "#123456", facade: "shop", roof: { shape: "flat", color: "#d0d4d2" } });   // 20 m of 10-* then 2 storeys of 20-*
      expect(a.src.ovr).toBe("10-pier7.json#lots/0 + 20-pier7.json#lots/0");
      expect(a.src.ovrWhy).toBe("photo: fixture + earth: fixture");
      expect(byId.has("16/58541/25068/70")).toBe(false);
      const k = byId.get("ovr:pier7:kiosk");
      expect(k).toMatchObject({ zone: "hero", kind: "shop", height: 3.4, storeys: 1, roof: { shape: "flat", color: "#aab0b4" } });
      expect(k.src.ovr).toBe("20-pier7.json#newLots/0");
      expect(L.landuse.at(-1)).toMatchObject({ cls: "plaza", ovr: "20-pier7.json#landuse/0" });
      expect(L.roads.find((r) => r.id === "r12642")).toMatchObject({ width: 5.5, ovr: "20-pier7.json#roads/0" });
      expect(L.props).toEqual([{ type: "bench", x: 70, z: 70, rotY: expect.any(Number), ovr: "20-pier7.json#props/0" }]);
      expect(L.overrides.map((o) => o.file)).toEqual(["10-pier7.json", "20-pier7.json"]);
      expect(L.log.overrides).toMatchObject({ lots: 1, removed: 1, newLots: 1 });
      // an unknown lot id stops the build
      writeFileSync(join(d, "30-bad.json"), JSON.stringify(doc({ lots: [{ id: "16/0/0/0", kind: "house", src: "earth" }] })));
      await expect(buildLayout({ overridesDir: d })).rejects.toThrow(/no such lot 16\/0\/0\/0/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }, 180000);
});
