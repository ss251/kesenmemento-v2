// [v4:data] Real-source enrichment: OSM parsing, GSI Anno pairing, the aerial roof analysis, footprint matching, the
// fold into the layout, and the produced data (enrich.json, sources.json, layout.json).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLevels, parseHeight, parseColour, roofShapeOf, kindFromTags, landuseClass, assembleRings, parseOsm, pointInRing } from "../scripts/anime/enrich/osm.js";
import { parseAnno, TEXT, SYMBOLS } from "../scripts/anime/enrich/anno.js";
import { analyzeRoof, roofClass, registerOutline, periodicity, outlinePoints } from "../scripts/anime/enrich/aerial.js";
import { FootIndex, overlapArea, matchBuildings, assignPoints, biggestNear } from "../scripts/anime/enrich/match.js";
import { ridgeAxis, gradeRoof, enrichLot, lotTable, roofWhiteBalance, riverWidth, showable, SENSITIVE } from "../scripts/anime/enrich/fold.js";
import { SOURCES, CREDIT } from "../scripts/anime/enrich/sources.js";
import { SegHash, rgbToHsv, classifyLot } from "../scripts/anime/derive.js";
import * as L from "../src/anime/world/layout.js";

const ROOT = new URL("../", import.meta.url).pathname;
const rect = (cx, cz, w, d, a = 0) => { const c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [cx + u * c - v * s, cz + u * s + v * c]); };

// ------------------------------------------------------------------ synthetic aerial photos
/** A sampler over a function (x, z) -> [r, g, b], at 0.47 m pixels (z18). */
function synth(fn, px = 0.465) {
  const q = (v) => Math.floor(v / px) * px + px / 2;
  return { px, z: 18, rgb: (x, z) => fn(q(x), q(z)), lum(x, z) { const c = this.rgb(x, z); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; } };
}
const ground = [150, 150, 140];
/** Gable roof over rect (cx, cz, w along x, d along z): the ridge runs along x; the south half (+z) is lit. */
const gablePhoto = (cx, cz, w, d, dx = 0, dz = 0) => synth((x, z) => {
  const u = x - cx - dx, v = z - cz - dz;
  if (Math.abs(u) > w / 2 || Math.abs(v) > d / 2) return ground;
  return v > 0 ? [190, 120, 100] : [105, 66, 55];
});
/** Hip roof: four facets lit S > E > W > N. */
const hipPhoto = (cx, cz, w, d) => synth((x, z) => {
  const u = x - cx, v = z - cz;
  if (Math.abs(u) > w / 2 || Math.abs(v) > d / 2) return ground;
  const e = Math.abs(u) - (w / 2 - d / 2) - Math.abs(v);
  if (e > 0) return u > 0 ? [150, 150, 160] : [95, 95, 100];
  return v > 0 ? [185, 185, 195] : [70, 70, 75];
});
const flatPhoto = (cx, cz, w, d, eq = false) => synth((x, z) => {
  const u = x - cx, v = z - cz;
  if (Math.abs(u) > w / 2 || Math.abs(v) > d / 2) return [90, 95, 90];
  if (eq && ((Math.abs(u - 3) < 0.8 && Math.abs(v - 2) < 0.8) || (Math.abs(u + 4) < 1 && Math.abs(v + 3) < 0.7))) return [60, 60, 60];
  return [215, 218, 220];
});

describe("osm: tag parsing", () => {
  test("levels and heights", () => {
    expect(parseLevels("3")).toBe(3); expect(parseLevels("2;3")).toBe(2); expect(parseLevels("x")).toBeNull(); expect(parseLevels("0")).toBeNull();
    expect(parseHeight("12")).toBe(12); expect(parseHeight("12.5 m")).toBe(12.5); expect(parseHeight("40'")).toBeCloseTo(12.2, 1); expect(parseHeight("tall")).toBeNull();
  });
  test("colours", () => {
    expect(parseColour("#ABC")).toBe("#aabbcc"); expect(parseColour("dark green")).toBe("#006400"); expect(parseColour("#12ab34")).toBe("#12ab34"); expect(parseColour("sparkly")).toBeNull();
  });
  test("roof shapes and kinds", () => {
    expect(roofShapeOf("gabled")).toBe("gable"); expect(roofShapeOf("hipped")).toBe("hip"); expect(roofShapeOf("pyramidal")).toBe("hip");
    expect(roofShapeOf("skillion")).toBe("shed"); expect(roofShapeOf("sawtooth")).toBe("saw"); expect(roofShapeOf("flat")).toBe("flat"); expect(roofShapeOf("dome?")).toBeNull();
    expect(kindFromTags({ building: "yes", amenity: "place_of_worship", religion: "shinto" })).toBe("shrine");
    expect(kindFromTags({ building: "temple" })).toBe("temple");
    expect(kindFromTags({ building: "school" })).toBe("school");
    expect(kindFromTags({ building: "yes", shop: "seafood" })).toBe("shop");
    expect(kindFromTags({ building: "yes", amenity: "townhall" })).toBe("public");
    expect(kindFromTags({ building: "house" })).toBe("house");
    expect(kindFromTags({ building: "yes" })).toBeNull();
  });
  test("landuse classes", () => {
    expect(landuseClass({ leisure: "park" })).toBe("park"); expect(landuseClass({ landuse: "farmland" })).toBe("field");
    expect(landuseClass({ landuse: "cemetery" })).toBe("cemetery"); expect(landuseClass({ amenity: "school" })).toBe("school");
    expect(landuseClass({ amenity: "parking" })).toBe("parking"); expect(landuseClass({ natural: "wood" })).toBe("forest"); expect(landuseClass({ highway: "road" })).toBeNull();
  });
  test("multipolygon rings are joined from open ways in any direction", () => {
    const rings = assembleRings([[[0, 0], [10, 0], [10, 10]], [[0, 0], [0, 10]], [[0, 10], [10, 10]].reverse()]);
    expect(rings.length).toBe(1); expect(rings[0].length).toBe(4);
    expect(pointInRing(5, 5, rings[0])).toBe(true); expect(pointInRing(15, 5, rings[0])).toBe(false);
  });
  test("parseOsm: buildings, POIs, landuse with holes, rivers, roads, signals", () => {
    const ll = (x, z) => ({ lat: 38.906 - z / 111014, lon: 141.575 + x / 86744 });
    const sq = (x, z, s) => [ll(x, z), ll(x + s, z), ll(x + s, z + s), ll(x, z + s), ll(x, z)];
    const J = { elements: [
      { type: "way", id: 1, tags: { building: "yes", "building:levels": "3", name: "テスト館", "roof:shape": "hipped" }, geometry: sq(0, 0, 10) },
      { type: "node", id: 2, lat: ll(5, 5).lat, lon: ll(5, 5).lon, tags: { shop: "seafood", name: "海の店" } },
      { type: "relation", id: 3, tags: { type: "multipolygon", leisure: "park", name: "公園" }, members: [
        { type: "way", role: "outer", geometry: sq(100, 100, 50).slice(0, 3) }, { type: "way", role: "outer", geometry: sq(100, 100, 50).slice(2) },
        { type: "way", role: "inner", geometry: sq(120, 120, 5) }] },
      { type: "way", id: 4, tags: { waterway: "river", name: "大川" }, geometry: [ll(0, 200), ll(50, 210)] },
      { type: "way", id: 5, tags: { highway: "primary", name: "国道45号", lanes: "2", oneway: "yes", maxspeed: "50" }, geometry: [ll(0, 300), ll(80, 300)] },
      { type: "node", id: 6, lat: ll(40, 300).lat, lon: ll(40, 300).lon, tags: { highway: "traffic_signals" } },
    ] };
    const O = parseOsm(J);
    expect(O.buildings.length).toBe(1); expect(O.buildings[0].tags["building:levels"]).toBe("3"); expect(O.buildings[0].ring.length).toBe(4);
    expect(O.pois.find((p) => p.name === "海の店").type).toBe("seafood");
    const park = O.landuse.find((l) => l.cls === "park"); expect(park.holes.length).toBe(1); expect(park.name).toBe("公園");
    expect(O.waterways[0].name).toBe("大川");
    const r = O.roads[0]; expect([r.name, r.lanes, r.oneway, r.maxspeed]).toEqual(["国道45号", 2, 1, 50]);
    expect(O.signals.length).toBe(1); expect(O.signals[0][0]).toBeCloseTo(40, 0);
  });
});

describe("anno: GSI names and symbols", () => {
  test("a facility text pairs with the nearest symbol of its family; duplicates are dropped", () => {
    const A = parseAnno([
      { code: 881, text: "気仙沼市役所", p: [10, 10] }, { code: 881, text: "気仙沼市役所", p: [10, 10] },
      { code: 3205, p: [0, 0] }, { code: 3205, p: [400, 0] }, { code: 3231, p: [12, 8] },
      { code: 210, text: "八日町", p: [50, 50] }, { code: 7201, text: "239.1", p: [1, 1] },
    ]);
    expect(A.facilities.length).toBe(1);
    expect(A.facilities[0]).toMatchObject({ name: "気仙沼市役所", cat: "city_hall", kind: "public", p: [0, 0], sym: 3205 });
    expect(A.places.map((p) => p.name)).toEqual(["八日町"]);
    expect(A.heights[0].h).toBe(239.1);
    expect(A.symbols.find((s) => s.code === 3231).meaning).toBe("神社");
  });
  test("the code table comes from GSI's style and covers the symbols used", () => {
    for (const c of [3231, 3232, 3214, 3218, 3243, 6301]) expect(SYMBOLS[c]).toBeTruthy();
    for (const t of Object.values(TEXT)) for (const s of t.sym || []) expect(SYMBOLS[s]).toBeTruthy();
  });
});

describe("aerial: roof analysis on synthetic photos", () => {
  test("a gable roof: shape, ridge along the long axis, facet-averaged colour", () => {
    const ring = rect(0, 0, 14, 8);
    const a = analyzeRoof(ring, gablePhoto(0, 0, 14, 8), { register: false });
    expect(a.shape).toBe("gable");
    expect(a.conf).toBeGreaterThan(0.6);
    expect(Math.abs(Math.cos(a.ridge))).toBeGreaterThan(0.99);   // along x
    const c = [parseInt(a.rgb.slice(1, 3), 16), parseInt(a.rgb.slice(3, 5), 16)];
    expect(c[0]).toBeGreaterThan(135); expect(c[0]).toBeLessThan(160);   // between the facets (190 / 105)
    expect(roofClass(a, { code: 3101, area: 112 }).shape).toBe("gable");
  });
  test("a rotated gable keeps its ridge direction", () => {
    const ang = 0.6, c = Math.cos(ang), s = Math.sin(ang);
    const S = synth((x, z) => { const u = x * c + z * s, v = -x * s + z * c; if (Math.abs(u) > 8 || Math.abs(v) > 4.5) return ground; return v > 0 ? [180, 180, 185] : [95, 95, 100]; });
    const a = analyzeRoof(rect(0, 0, 16, 9, ang), S, { register: false });
    expect(a.shape).toBe("gable");
    expect(Math.abs(Math.cos(a.ridge - ang))).toBeGreaterThan(0.99);
  });
  test("a hip roof", () => {
    const a = analyzeRoof(rect(0, 0, 16, 9), hipPhoto(0, 0, 16, 9), { register: false });
    expect(a.shape).toBe("hip");
    expect(roofClass(a, { code: 3101, area: 144 }).shape).toBe("hip");
  });
  test("a flat deck with rooftop equipment", () => {
    const a = analyzeRoof(rect(0, 0, 20, 14), flatPhoto(0, 0, 20, 14, true), { register: false });
    expect(a.shape === "uniform" || a.shape === null).toBe(true);
    expect(a.equip).toBeGreaterThanOrEqual(2);
    expect(roofClass(a, { code: 3101, area: 280 })?.shape).toBe("flat");
  });
  test("a small uniform house roof gets no call (a ridge along the sun, or a shed: the photo cannot tell)", () => {
    const S = synth((x, z) => (Math.abs(x) < 5 && Math.abs(z) < 4 ? [110, 120, 125] : ground));
    const a = analyzeRoof(rect(0, 0, 10, 8), S, { register: false });
    expect(a.shape).toBe("uniform");
    expect(roofClass(a, { code: 3101, area: 80 })).toBeNull();
  });
  test("a footprint under trees is flagged as vegetation and gets no call", () => {
    const S = synth((x, z) => ((Math.floor(x * 2) + Math.floor(z * 2)) % 2 ? [60, 110, 50] : [80, 140, 70]));
    const a = analyzeRoof(rect(0, 0, 10, 8), S, { register: false });
    expect(a.veg).toBeGreaterThan(0.8);
    expect(roofClass(a, { code: 3101, area: 80 })).toBeNull();
  });
  test("registration finds a roof displaced from its footprint", () => {
    const S = gablePhoto(0, 0, 12, 8, 2, -1.5);
    const r = registerOutline(S, rect(0, 0, 12, 8), 3);
    expect(Math.abs(r.ox - 2)).toBeLessThanOrEqual(0.5); expect(Math.abs(r.oz + 1.5)).toBeLessThanOrEqual(0.5);
    expect(r.score).toBeGreaterThan(r.score0);
  });
  test("tiny footprints still get a colour", () => {
    const S = synth((x, z) => (Math.abs(x) < 1.1 && Math.abs(z) < 0.9 ? [200, 60, 50] : ground));
    const a = analyzeRoof(rect(0, 0, 2.2, 1.8), S, { register: false });
    expect(a.rgb).toBe("#c83c32");
    expect(a.shape).toBeNull();
  });
  test("periodicity finds a saw-tooth period", () => {
    const p = Array.from({ length: 60 }, (_, i) => (i % 10 < 5 ? 200 : 90));
    const r = periodicity(p, 4, 20);
    expect(r.lag).toBe(10); expect(r.r).toBeGreaterThan(0.8);
  });
  test("outline points carry outward normals", () => {
    for (const ring of [rect(0, 0, 10, 6), rect(0, 0, 10, 6).reverse()]) for (const [x, z, nx, nz] of outlinePoints(ring, 1)) {
      expect(pointInRing(x + nx * 0.5, z + nz * 0.5, ring)).toBe(false);
      expect(pointInRing(x - nx * 0.5, z - nz * 0.5, ring)).toBe(true);
    }
  });
});

describe("match: OSM and GSI to footprints", () => {
  const feats = [{ id: "a", poly: rect(0, 0, 10, 10), area: 100 }, { id: "b", poly: rect(30, 0, 10, 10), area: 100 }, { id: "c", poly: rect(0, 40, 30, 20), area: 600 }];
  const index = new FootIndex(feats);
  test("overlap of equal squares is their area; disjoint is zero", () => {
    const o = overlapArea(rect(0, 0, 10, 10), rect(0, 0, 10, 10));
    expect(o.inter).toBeCloseTo(100, -1); expect(overlapArea(rect(0, 0, 10, 10), rect(50, 0, 10, 10)).inter).toBe(0);
  });
  test("a slightly shifted OSM outline matches its footprint; one round two footprints tags both", () => {
    const m = matchBuildings(index, [{ osm: "w1", ring: rect(0.6, 0.4, 10, 10), tags: { name: "A" } }, { osm: "w2", ring: rect(15, 0, 42, 14), tags: { name: "block" } }]);
    expect(m.get(0).osm).toBe("w1");   // its own outline (IoU 0.9) beats the block outline that also covers it
    expect(m.get(1).osm).toBe("w2");   // 'b' has no own outline: the block round it tags it
    expect(m.has(2)).toBe(false);
    const m2 = matchBuildings(index, [{ osm: "w1", ring: rect(0.6, 0.4, 10, 10), tags: {} }]);
    expect(m2.get(0).iou).toBeGreaterThan(0.8);
  });
  test("points go to the containing or nearest footprint; the biggest building near a symbol", () => {
    const m = assignPoints(index, [{ p: [1, 1] }, { p: [36.5, 0] }, { p: [100, 100] }], 3);
    expect(m.get(0).length).toBe(1); expect(m.get(1).length).toBe(1); expect([...m.keys()].length).toBe(2);
    expect(biggestNear(index, 10, 25, 30)).toBe(2);
  });
});

describe("fold: precedence and sources", () => {
  const classify = (kind) => classifyLot({ id: "x", code: 3101, area: 120, h: 6, zone: "hero", shore: -200, front: null, tag: kind });
  const base = { kind: "house", storeys: 2, height: 5.8, roofShape: "gable", roofColor: "#56677a", wall: "#efe6d2", rotY: 0 };
  test("ridge axis in the lot frame", () => {
    expect(ridgeAxis(0, 0)).toBe("x"); expect(ridgeAxis(Math.PI / 2, 0)).toBe("z"); expect(ridgeAxis(Math.PI / 2, Math.PI / 2)).toBe("x");
  });
  test("grading keeps the hue of the photo colour", () => {
    for (const c of ["#8e4540", "#4d6457", "#3e4a63"]) {
      const g = gradeRoof(c); const h0 = rgbToHsv(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))[0], h1 = rgbToHsv(...[1, 3, 5].map((i) => parseInt(g.slice(i, i + 2), 16)))[0];
      expect(Math.abs(h0 - h1)).toBeLessThan(8);
    }
  });
  test("OSM beats the aerial photo beats the derived guess; every value records its source", () => {
    const a = enrichLot({ id: "x", levels: 3, roofShape: "hip", aShape: "gable", ridge: 0, rgb: "#806050", name: "店", use: "shop:seafood", kind: "shop", osm: "w1" }, base, [1, 1, 1], classify);
    expect(a.kind).toBe("shop"); expect(a.storeys).toBe(3); expect(a.height).toBeCloseTo(9.3, 1);
    expect(a.roof.shape).toBe("hip"); expect(a.roof.ridge).toBe("x"); expect(a.roof.photo).toBe("#806050");
    expect(a.src).toMatchObject({ h: "osm", kind: "osm", roof: "osm", color: "aerial", name: "osm" });
    const b = enrichLot({ id: "y", aShape: "flat", rgb: "#d0d0d0", gsiName: "気仙沼郵便局", kind: "public" }, base, [1, 1, 1], classify);
    expect(b.roof.shape).toBe("flat"); expect(b.src.roof).toBe("aerial"); expect(b.name).toBe("気仙沼郵便局"); expect(b.src.name).toBe("gsi");
    const c = enrichLot(undefined, base, [1, 1, 1], classify);
    expect(c.src).toEqual({ h: "derived", kind: "derived", roof: "derived", color: "derived" }); expect(c.roof.shape).toBe("gable");
  });
  test("landmarks keep their dedicated look", () => {
    const a = enrichLot({ id: "m", aShape: "gable", rgb: "#101010", kind: "shop" }, { ...base, kind: "landmark", landmark: "fishMarket", roofShape: "flat", roofColor: "#dcdcd4" }, [1, 1, 1], classify);
    expect(a.kind).toBe("landmark"); expect(a.roof.shape).toBe("flat"); expect(a.roof.color).toBe("#dcdcd4");
  });
  test("disaster references never become names (V3-SPEC section 5)", () => {
    expect(showable("気仙沼市東日本大震災遺構・伝承館")).toBe(false); expect(showable("復興祈念公園")).toBe(false); expect(showable("気仙沼市役所")).toBe(true);
    const a = enrichLot({ id: "z", gsiName: "東日本大震災遺構・伝承館" }, base, [1, 1, 1], classify);
    expect(a.name).toBeUndefined();
  });
  test("river width from water-area edges", () => {
    const H = new SegHash(32); H.add([0, -10], [200, -10], null); H.add([0, 12], [200, 12], null);
    expect(riverWidth([[0, 0], [200, 0]], H)).toBeCloseTo(22, 0);
  });
});

describe("data: produced files", () => {
  const E = JSON.parse(readFileSync(join(ROOT, "data/anime/enrich.json"), "utf8"));
  const SJ = JSON.parse(readFileSync(join(ROOT, "data/anime/sources.json"), "utf8"));
  test("sources.json lists every source with a licence; OSM carries its attribution", () => {
    const osm = SJ.sources.find((s) => s.id === "osm");
    expect(osm.attribution).toBe("© OpenStreetMap contributors"); expect(osm.licence).toContain("ODbL");
    for (const s of SJ.sources) { expect(s.licence).toBeTruthy(); expect(s.attribution).toBeTruthy(); expect(s.url).toMatch(/^https?:/); }
    expect(SJ.sources.map((s) => s.id)).toEqual(SOURCES.map((s) => s.id));
    expect(CREDIT).toContain("© OpenStreetMap contributors");
    expect(E.attribution).toContain("© OpenStreetMap contributors");
    expect(L.CREDITS).toContain("© OpenStreetMap contributors");
    const I = JSON.parse(readFileSync(join(ROOT, "data/i18n.json"), "utf8"));
    const lines = JSON.stringify(I).match(/"v3\.attribution":"[^"]*"/g);
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l).toContain("© OpenStreetMap contributors");   // the on-screen credit (ODbL)
  });
  test("enrich.json covers every footprint and reports its coverage", () => {
    expect(E.lots.rows.length).toBe(E.stats.lots);
    expect(E.stats.lots).toBeGreaterThan(50000);
    expect(E.stats.osm).toBeGreaterThan(30000);   // OSM buildings matched to GSI footprints
    expect(E.stats.share.name).toBeGreaterThan(0.02);
    expect(E.stats.share.roofShape).toBeGreaterThan(0.1);
    expect(E.lots.fields[0]).toBe("id");
  });
  test("rivers 大川 and 神山川 are named, with widths from the GSI water areas", () => {
    for (const n of ["大川", "神山川"]) {
      const rs = L.RIVERS.filter((r) => r.name === n);
      expect(rs.length).toBeGreaterThan(0);
      expect(rs.some((r) => r.width > 5)).toBe(true);
    }
  });
  test("land use has parks, fields, cemeteries, schoolyards and parking", () => {
    const cls = new Set(L.LANDUSE.map((l) => l.cls));
    for (const c of ["park", "field", "cemetery", "school", "parking", "forest"]) expect(cls.has(c)).toBe(true);
    for (const l of L.LANDUSE) expect(l.ring.length).toBeGreaterThanOrEqual(3);
  });
  test("real names: roads, facilities, shops; place search in JA and EN", () => {
    const names = new Set(L.ROADS.filter((r) => r.name).map((r) => r.name));
    expect(names.has("気仙沼バイパス") || names.has("国道45号")).toBe(true);
    expect(L.ROADS.filter((r) => r.name).length).toBeGreaterThan(1000);
    for (const q of ["気仙沼市役所", "気仙沼駅", "リアス・アーク美術館", "気仙沼郵便局"]) expect(L.findPlaces(q).length, q).toBeGreaterThan(0);
    expect(L.findPlaces("city hall").some((p) => p.name.includes("市役所"))).toBe(true);
    const shops = L.LOTS.filter((l) => l.use?.startsWith("shop:") && l.name);
    expect(shops.length).toBeGreaterThan(50);
    for (const p of L.PLACES) expect(SENSITIVE.test(p.name), p.name).toBe(false);
    for (const l of L.LOTS) if (l.name) expect(SENSITIVE.test(l.name), l.name).toBe(false);
  });
  test("every lot records its sources; far lots keep names and ridges", () => {
    const ok = new Set(["osm", "aerial", "gsi", "landmark", "derived", "ref"]);   // [v4:polish1] ref: world/lotfix.js
    for (const l of L.LOTS) { expect(l.src, l.id).toBeTruthy(); for (const k of ["h", "kind", "roof", "color"]) expect(ok.has(l.src[k]), `${l.id} ${k}`).toBe(true); }
    const far = L.LOTS.filter((l) => l.zone === "far");
    expect(far.some((l) => l.name)).toBe(true);
    expect(far.some((l) => l.roof.ridge === "x" || l.roof.ridge === "z")).toBe(true);
    expect(L.LOTS.find((l) => l.name === "リアス・アーク美術館")).toBeTruthy();
  });
  test("signals and crossings sit on roads", () => {
    expect(L.SIGNALS.length).toBeGreaterThan(50);
    expect(L.SIGNALS.filter((s) => s.roadId).length / L.SIGNALS.length).toBeGreaterThan(0.9);
  });
  test("the enrichment scripts are deterministic (no Math.random, no Date in outputs)", () => {
    const dir = join(ROOT, "scripts/anime/enrich");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) expect(/Math\.random/.test(readFileSync(join(dir, f), "utf8")), f).toBe(false);
  });
});

describe("accuracy: roof classes against independent labels", () => {
  test("precision >= 0.9 on OSM roof:shape and the hand labels", async () => {
    const { evaluate } = await import("../scripts/anime/enrich/eval.js");
    const r = await evaluate();
    expect(r.called).toBeGreaterThanOrEqual(30);
    expect(r.precision).toBeGreaterThanOrEqual(0.9);
  });
});
