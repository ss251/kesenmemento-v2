// [v5:photos] The 内湾 / 南町 waterfront and the fish market's C棟 roof deck rebuilt against the author's photos
// (raw/author-photos, 2026-10-01): the override file, the photo-matched geometry and the pair tool.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "../src/anime/world/layout.js";
import { PLAZA, P7WALL, WALKWAY, KONBINI, clipAxis } from "../src/anime/world/harbor/minami5.js";
import { PHOTOS5, PIER7_SPLIT } from "../src/anime/world/harbor/minami.js";
import { DECK, enu as deckEnu } from "../src/anime/world/harbor/market5.js";   // [v6:rebuild] the surveyed deck replaces CROOF
import { SITES } from "../src/anime/world/harbor/real.js";
import { enu, vfov, FIX } from "../tools/anime/photo-pairs.mjs";

const ROOT = join(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

describe("zz-photos.json", () => {
  const doc = JSON.parse(read("data/anime/overrides/zz-photos.json"));
  test("applies last and names the author's photos as its source", () => {
    const ov = JSON.parse(read("data/anime/layout.json")).overrides;
    expect(ov[ov.length - 1].file).toBe("zz-photos.json");
    expect(doc.sources[0].id).toBe("photos");
    for (const sec of ["lots", "landuse", "roads"]) for (const o of doc[sec]) expect(o.src.startsWith("photos")).toBe(true);
  });
  test("the plaza is a flat quay-level plaza, the slow street a pedestrian plaza, the store shed gone from the lots", () => {
    const plazas = L.LANDUSE.filter((l) => l.cls === "plaza" && l.src === "override");
    expect(plazas.some((l) => inPoly(20, 55, l.ring))).toBe(true);
    expect(plazas.some((l) => inPoly(-40, 97, l.ring))).toBe(true);
    expect(L.lotById("ovr:c6:minami-solar")).toBe(null);
    expect(L.ROADS.some((r) => r.id === "r12645")).toBe(false);
    expect(L.lotById("16/58540/25068/377").storeys).toBe(1);
  });
});

describe("photo-matched geometry", () => {
  test("the plaza, the walkway, the PIER7 wall line and the store are on land and in the photo area", () => {
    expect(PHOTOS5).toBe(true);
    for (const p of [...PLAZA, ...WALKWAY, ...P7WALL, ...KONBINI.poly]) { expect(L.isWater(p[0], p[1])).toBe(false); expect(p[0]).toBeGreaterThan(-90); expect(p[0]).toBeLessThan(70); }
    // the walkway runs from 迎's deck to PIER7's NW face, over the plaza
    expect(Math.min(...SITES.pier7.poly.map((p) => Math.hypot(p[0] - WALKWAY.at(-1)[0], p[1] - WALKWAY.at(-1)[1])))).toBeLessThan(6);
    expect(WALKWAY.slice(1, -1).some((p) => inPoly(p[0], p[1], PLAZA))).toBe(true);
  });
  test("PIER7's middle slice (2F glazing and the stepped terrace) lies between the NW pavilion and the SE block", () => {
    const mid = clipAxis(SITES.pier7.poly, PIER7_SPLIT.axis.o, PIER7_SPLIT.axis.u, -2.5, 40.6);
    const pr = (p) => (p[0] - PIER7_SPLIT.axis.o[0]) * PIER7_SPLIT.axis.u[0] + (p[1] - PIER7_SPLIT.axis.o[1]) * PIER7_SPLIT.axis.u[1];
    for (const p of mid) { expect(pr(p)).toBeGreaterThan(-2.6); expect(pr(p)).toBeLessThan(40.7); }
  });
  test("C棟's roof deck: penthouse, pavilions and lifeboat inside the hall's outline", () => {
    const pts = [deckEnu(DECK.wall.s[0], 0), deckEnu(DECK.wall.s[1], -5), deckEnu(DECK.lifeboat.bow + DECK.lifeboat.L, DECK.lifeboat.off), ...DECK.pavilions.list.flatMap((p) => [deckEnu(p.s[0], p.o[0]), deckEnu(p.s[1], p.o[1])])];
    for (const p of pts) expect(inPoly(p[0], p[1], SITES.marketC.poly)).toBe(true);
    expect(read("src/anime/world/harbor/market4.js")).toContain("buildCRoofPhotos(ctx, k, { cars });");
  });
  test("real names on the buildings; the store's pole sign is a generic 7, no trademark", () => {
    const src = read("src/anime/world/harbor/minami5.js") + read("src/anime/world/harbor/market5.js") + [...DECK.wall.letters.chars].map((c) => `['${c}',`).join(" ");
    for (const s of ["'ANCHOR'.split('')", "'café'", "'RST'", "'BLACK TIDE'", "'KNEWS'", "Kesennuma slow street 結", "Kesennuma Amway House Hirakeru", "'nine one'"]) expect(src).toContain(s);
    for (const ch of ["気", "仙", "沼", "市", "魚", "場"]) expect(src).toContain(`['${ch}',`);
    expect(src).not.toMatch(/7-?ELEVEN|セブン-?イレブン/i);
  });
});

describe("photo-pairs.mjs", () => {
  test("ENU, focal length and the corrected fixes", () => {
    const [x, z] = enu(38.9055, 141.5752); expect(x).toBeCloseTo(17.35, 1); expect(z).toBeCloseTo(55.5, 1);
    expect(vfov(24)).toBeCloseTo(71.6, 0);   // [v5:detail] diagonal-matched 35 mm equivalent (was 73.7)
    for (const [id, f] of Object.entries(FIX)) { expect(id).toMatch(/^IMG_08\d\d|IMG_079\d$/); expect(f.why.length).toBeGreaterThan(10); expect(L.isWater(f.x, f.z)).toBe(false); }
  });
});

// [v5:detail] the detail pass: the photo-match look, the ground pad under the ANCHOR shopfront, the face frame
import { LOOKS, createTime } from "../src/anime/world/life/time.js";
import { ANCHOR } from "../src/anime/world/harbor/minami5.js";
describe("v5 detail pass", () => {
  test("the photo look: overcast dusk at 17:20 JST on 2026-10-01, interiors lit, no light leak", () => {
    const P = LOOKS.photo;
    expect(P.hours).toBeCloseTo(17.333, 2); expect(P.date).toBe("2026-10-01"); expect(P.cover).toBe(1); expect(P.lit).toBeGreaterThan(0.5);
    const shared = {}; const T = createTime({ shared, sunDir: null, sky: null, scene: { add() {} } }, { look: "photo" });
    expect(T.look).toBe("photo"); expect(T.overcast).toBe(1); expect(T.lamps).toBe(1); expect(shared.uLit.value).toBeCloseTo(P.lit, 5);
    expect(T.palette.leak).toBe(0); expect(T.sun.elevation).toBeLessThan(4); expect(T.sun.elevation).toBeGreaterThan(-3);
  });
  test("the ground pad flattens the DEM mound in front of the ANCHOR face, nothing beyond its feather", () => {
    expect(L.heightAt(-12, 52)).toBeLessThanOrEqual(2.31); expect(L.heightAt(-6, 54)).toBeLessThanOrEqual(2.31);
    expect(L.heightAt(20, 50)).toBeLessThan(1.8);   // [v6:rebuild] the plaza pad under the T.P. 1.83 paving
    expect(L.heightAt(-16.5, 57.4)).toBeCloseTo(2.12, 1);
    expect(L.GROUND_PADS.length).toBeGreaterThan(0); for (const p of L.GROUND_PADS) expect(p.src.startsWith("author photos")).toBe(true);
  });
  test("the ANCHOR face is the 10.4 m street segment of 迎's footprint; the eave rises from the box to the glazed corner", () => {
    // [v6:rebuild] P1 / P2 sit on the surveyed façade plane (data/survey/minami/picks.json planes['anchor.face']), 0.6-2 m from
    // GSI's vertices; the fascia rises from the box to a crest 4.2 m in and falls to the glazed corner (IMG_0826, 0911)
    const P = SITES.mukaeru.poly, near = (q) => Math.min(...P.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])));
    expect(near(ANCHOR.P1)).toBeLessThan(2.5); expect(near(ANCHOR.P2)).toBeLessThan(2.5);
    expect(Math.hypot(ANCHOR.P2[0] - ANCHOR.P1[0], ANCHOR.P2[1] - ANCHOR.P1[1])).toBeCloseTo(9.55, 1);
    const E = ANCHOR.eave; expect(E[1][1]).toBeGreaterThan(E[0][1]); expect(E[1][1]).toBeGreaterThan(E[2][1]);
  });
});
