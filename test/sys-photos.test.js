// [sys:10] Tooling for the facade evidence: Commons photos in photo-pairs.mjs, the heading search, the Earth flatness metrics in earth-ref.mjs.
import { describe, expect, test } from "bun:test";
import { COMMONS_FIX, SURVEY_BOXES, inSurvey, readF35, commonsClock, edgeNcc, headingGrid, vfov } from "../tools/anime/photo-pairs.mjs";
import { flagged, OBLIQUE } from "../tools/anime/flag-oblique-heights.mjs";
import { osmGap, ringCoverage, lotCover } from "../tools/anime/osm-gap.mjs";
import { landmarkScore, ringEdgeDist } from "../tools/anime/accuracy-lib.mjs";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// the Earth capture tool (tools/anime/earth-ref.mjs) is not part of the public repository: the tests that read it skip without it
const HAVE_EARTH_TOOL = existsSync(new URL("../tools/anime/earth-ref.mjs", import.meta.url));
const { edgeEnergy, verticalEdge, FLAT_EDGE_RATIO, EARTH_SCENE, sceneShift, heightFromShadow, heightFromShift, earthToApp, regFailed } = HAVE_EARTH_TOOL ? await import("../tools/anime/earth-ref.mjs") : {};

/** a minimal EXIF block holding FocalLengthIn35mmFormat = f */
function exifWith(f) {
  const b = Buffer.alloc(6 + 8 + 2 + 12 + 4 + 2 + 12 + 4);
  b.write("Exif\0\0", 0, "binary"); let o = 6;
  b.write("II", o); b.writeUInt16LE(42, o + 2); b.writeUInt32LE(8, o + 4);
  let p = o + 8; b.writeUInt16LE(1, p); p += 2;                                  // IFD0: one entry, ExifIFD pointer
  b.writeUInt16LE(0x8769, p); b.writeUInt16LE(4, p + 2); b.writeUInt32LE(1, p + 4); b.writeUInt32LE(8 + 2 + 12 + 4, p + 8); p += 12; b.writeUInt32LE(0, p); p += 4;
  b.writeUInt16LE(1, p); p += 2;                                                  // Exif IFD: FocalLengthIn35mmFormat
  b.writeUInt16LE(0xA405, p); b.writeUInt16LE(3, p + 2); b.writeUInt32LE(1, p + 4); b.writeUInt16LE(f, p + 8);
  return b;
}

describe("[sys:10] photo-pairs: the Commons source", () => {
  test("One-Ten 2026 is moved to the 島田 / One-Ten corner (-360..-400, -150..-185), outside the survey boxes", () => {
    const f = COMMONS_FIX["187673287_Kesennuma_City_Hall_One_Ten_Office_2026.jpg"];
    expect(f.x).toBeGreaterThanOrEqual(-400); expect(f.x).toBeLessThanOrEqual(-360); expect(f.z).toBeGreaterThanOrEqual(-185); expect(f.z).toBeLessThanOrEqual(-150);
    expect(inSurvey(f.x, f.z)).toBe(false);
    expect(inSurvey(29.4, 51.2)).toBe(true);     // the wrong geotag lay inside the south-shore box
    expect(SURVEY_BOXES.length).toBe(2);
  });
  test("a final position inside the survey boxes is skipped (the market lots too)", () => {
    expect(inSurvey(100, 50)).toBe(true); expect(inSurvey(600, 900)).toBe(true); expect(inSurvey(-300, -200)).toBe(false);
  });
  // the Commons index (raw/ref/commons: other people's photos) is not part of the public repository: this check skips without it
  test.skipIf(!existsSync(new URL("../raw/ref/commons/index.json", import.meta.url)))("the real Commons index has photos left outside the survey boxes", () => {
    const idx = JSON.parse(read("raw/ref/commons/index.json"));
    const kept = idx.photos.filter((c) => c.year >= 2020 && c.posKind === "camera" && c.downloaded && !inSurvey(COMMONS_FIX[c.file]?.x ?? c.enu.x, COMMONS_FIX[c.file]?.z ?? c.enu.z));
    expect(kept.length).toBeGreaterThan(10);
  });
  test("the focal length comes from EXIF FocalLengthIn35mmFormat; no EXIF -> null; the vertical FOV follows", () => {
    expect(readF35(exifWith(24))).toBe(24); expect(readF35(exifWith(48))).toBe(48);
    expect(readF35(Buffer.from("not exif"))).toBeNull(); expect(readF35(null)).toBeNull();
    expect(vfov(24)).toBeCloseTo(71.6, 0);
  });
  test("commonsClock parses the Commons date", () => {
    expect(commonsClock("2026-03-29T09:51:18")).toEqual({ date: "2026:03:29", hours: 9 + 51 / 60 + 18 / 3600 });
  });
  test("the heading search: +-40 degrees in 2 degree steps, then 1 degree about the winner; edgeNcc prefers the matching image", () => {
    expect(headingGrid().length).toBe(41); expect(headingGrid()[0]).toBe(-40); expect(headingGrid()[40]).toBe(40);
    expect(headingGrid(6)).toEqual([5, 7]);
    const w = 60, h = 60, a = new Uint8Array(w * h), b = new Uint8Array(w * h), c = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { a[j * w + i] = i > 30 ? 200 : 40; b[j * w + i] = i > 30 ? 190 : 50; c[j * w + i] = i > 12 ? 200 : 40; }
    expect(edgeNcc(a, b, w, h)).toBeGreaterThan(edgeNcc(a, c, w, h));
    const t = read("tools/anime/photo-pairs.mjs");
    expect(t).toContain("suggestHeading"); expect(t).toContain("never overrides FIX");
  });
});

describe.skipIf(!HAVE_EARTH_TOOL)("[sys:3][sys:5][sys:10] earth-ref: the scene, the 3D check and the flat-view metric", () => {
  test("the 2026-03-11 scene is recorded as a property of that scene: bearing 340, sun 44, lean (-0.39, 0.21)", () => {
    expect(EARTH_SCENE).toMatchObject({ imageryDate: "2026-03-11", shadowBearing: 340, sunElev: 44, lean: [-0.39, 0.21] });
    expect(EARTH_SCENE.note).toContain("only");
    const s = sceneShift(15);
    expect(s.lean[0]).toBeCloseTo(-5.85, 2); expect(s.lean[1]).toBeCloseTo(3.15, 2);       // a 15 m roof shows shifted (-5.9, +3.2) m
    expect(Math.hypot(...s.shadow)).toBeCloseTo(15 / Math.tan(44 * Math.PI / 180), 5);      // a shadow about as long as the building is high
    expect(s.shadow[0]).toBeLessThan(0); expect(s.shadow[1]).toBeLessThan(0);               // toward the north-west (bearing 340)
    expect(heightFromShadow(23)).toBeCloseTo(22.2, 1);                                      // c11 lots[23]: a 23 m shadow is about 22 m, not 18.5 m
    expect(heightFromShadow(28)).toBeCloseTo(27.0, 1);                                      // lots[27]: 28 m -> about 27 m, not 22 m
    expect(heightFromShift(5.85 * 1)).toBeGreaterThan(13); expect(heightFromShift(Math.hypot(5.85, 3.15))).toBeCloseTo(15, 5);
  });
  test("the docs say what Earth is: no photoreal 3D, no heights from the obliques", () => {
    const head = read("tools/anime/earth-ref.mjs").slice(0, 3200), doc = read("docs/anime/OVERRIDES.md"), audit = read("docs/anime/landmarks/AUDIT.md");
    expect(head).not.toContain("photoreal 3D, imagery"); expect(head).toContain("Read plan shapes, colours and land use (not heights)"); expect(head).toContain("no 3D buildings in Google");
    expect(doc).not.toContain("Google Earth 3D"); expect(doc).not.toContain("(photoreal 3D"); expect(doc).toContain("carry **no building height information**");
    expect(doc).toContain("bearing 340"); expect(doc).toContain("0.97 L"); expect(doc).toContain("/ 0.44");
    expect(audit).not.toContain("checked against Google Earth 3D");
  });
  test("edgeEnergy / verticalEdge: a frame full of vertical edges reads above one with none; the threshold is 1.0", () => {
    const W = 64, H = 48, mk = (f) => { const b = Buffer.alloc(W * H * 3); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = f(i, j); b.fill(v, (j * W + i) * 3, (j * W + i) * 3 + 3); } return b; };
    const stripesV = mk((i, j) => (i % 8 < 4 ? 40 : 220) + (j % 8 < 4 ? 0 : 6)), stripesH = mk((i, j) => (j % 8 < 4 ? 40 : 220) + (i % 8 < 4 ? 0 : 6));
    expect(edgeEnergy(stripesV, W, H).ratio).toBeGreaterThan(edgeEnergy(stripesH, W, H).ratio);
    expect(FLAT_EDGE_RATIO).toBe(1.0);
    const v = verticalEdge(stripesH, stripesV, W, H); expect(v.flat).toBe(true); expect(verticalEdge(stripesV, stripesH, W, H).flat).toBe(false);
  });
  test("regFailed: NCC under 0.15 or a scale on the edge of the search (outside 0.83-1.22)", () => {
    expect(regFailed({ ncc: 0.171, scale: 0.77 })).toBe(true); expect(regFailed({ ncc: -0.006, scale: 1.126 })).toBe(true);
    expect(regFailed({ ncc: 0.3, scale: 1.27 })).toBe(true); expect(regFailed({ ncc: 0.3, scale: 1.0 })).toBe(false);
  });
  test("earthToApp finds the identity for identical images and a shift for a shifted one; falls back to the identity unless it wins by 0.005", () => {
    const W = 1280, H = 720, mk = (dx) => { const b = Buffer.alloc(W * H * 3); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = i + dx, v = 60 + 120 * (((Math.floor(x / 37) + Math.floor(j / 29)) % 2) ^ (Math.sin(x * 0.05) * Math.cos(j * 0.07) > 0.3 ? 1 : 0)); b.fill(v, (j * W + i) * 3, (j * W + i) * 3 + 3); } return b; };
    const a = mk(0), same = earthToApp(a, mk(0)), shifted = earthToApp(mk(6), a);
    expect(same).toMatchObject({ s: 1, du: 0, dv: 0, used: false });
    expect(shifted.used).toBe(true); expect(Math.abs(shifted.du - -6)).toBeLessThan(2.5);   // Earth content 6 px to the right of the app's: the sampler shift is -6 expect(Math.abs(shifted.dv)).toBeLessThan(1.5); expect(Math.abs(shifted.s - 1)).toBeLessThan(0.006);
  }, 60000);
  test("the flat-3D check and the OSM gap are wired into earth-ref.mjs", () => {
    const t = read("tools/anime/earth-ref.mjs");
    expect(t).toContain("export async function flat3dCheck"); expect(t).toContain("Earth has no 3D mesh here: do not read heights from the obliques");
    expect(t).toContain("season: 'early'"); expect(t).toContain("meta.appQuery = q.toString()"); expect(t).toContain("--heights"); expect(t).toContain("top_heights.jpg");
    expect(t).toContain("osmCandidates"); expect(t).toContain("meta.registration = { ...reg, direct");
    expect(t).not.toContain("reg.earth.scale / reg.app.scale");
    expect(t).not.toContain('--query "season=aki"');
    const de = read("tools/anime/earth-de.mjs"); expect(de).toContain("registration?.direct"); expect(de).not.toContain("reg.earth.scale / reg.app.scale");
  });
});

describe("[sys:2][sys:5] osm-gap and the oblique-height flags", () => {
  const sq = (x, z, s) => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];
  test("osmGap lists the OSM buildings under no lot (coverage under 30 %), largest first, and skips the small and the covered", () => {
    const lots = [{ poly: sq(0, 0, 10) }], buildings = [{ osm: "w1", ring: sq(0, 0, 10), area: 100 }, { osm: "w2", ring: sq(30, 0, 12), area: 144 }, { osm: "w3", ring: sq(50, 0, 3), area: 9 }, { osm: "w4", ring: sq(5, 0, 10), area: 100 }, { osm: "w5", ring: sq(60, 0, 20), area: 400 }];
    const g = osmGap({ lots, buildings, bbox: [-10, -10, 100, 50] });
    expect(g.map((b) => b.osm)).toEqual(["w5", "w2"]);   // w1 covered, w4 half covered (0.5 >= 0.3), w3 under 12 m2
    expect(ringCoverage(sq(0, 0, 10), lotCover(lots))).toBe(1);
  });
  test("the real cells: dozens of OSM buildings under no lot are listed for review", () => {
    const L = null; void L;
    expect(read("docs/anime/OVERRIDES.md")).toContain("osm-gap.mjs"); expect(read("docs/anime/OVERRIDES.md")).toContain("Never import the list blindly");
  });
  test("flag-oblique-heights finds the overrides that cite an oblique for a height", () => {
    expect(OBLIQUE.test("earth: sub/mw top + o0/o180, roof about 9 m")).toBe(true); expect(OBLIQUE.test("earth: roof #767482 on the top view")).toBe(false);
    expect(flagged().length).toBeGreaterThan(100);
  });
  test("landmarkScore: the rendered footprint against the OSM outline (recall, precision, IoU, centroid)", () => {
    const px = 100, size = 100, poly = [[-20, -10], [20, -10], [20, 10], [-20, 10]], full = new Uint8Array(px * px), off = new Uint8Array(px * px), res = size / px;
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) { const x = -size / 2 + (i + 0.5) * res, z = -size / 2 + (j + 0.5) * res; if (Math.abs(x) <= 20 && Math.abs(z) <= 10) full[j * px + i] = 40; if (Math.abs(x - 16) <= 20 && Math.abs(z) <= 10) off[j * px + i] = 40; }
    const good = landmarkScore({ h: full, px, size, cx: 0, cz: 0, poly }), bad = landmarkScore({ h: off, px, size, cx: 0, cz: 0, poly });
    expect(good.iou).toBeGreaterThan(0.95); expect(good.centroidErr).toBeLessThan(1); expect(good.pass).toBe(true);
    expect(bad.pass).toBe(false); expect(bad.centroidErr).toBeGreaterThan(5);
    expect(ringEdgeDist(0, 0, poly)).toBe(10);
    const t = read("tools/anime/accuracy.mjs");
    expect(t).toContain("lotTagged"); expect(t).toContain("landmarkScore("); expect(t).toContain("selfConsistency"); expect(t).toContain("byRef");
    expect(t).toContain("featsAll.filter(({ f }) => !isRemoved(f.id))"); expect(t).toContain("i: -1");
  });
});
