// [v5:fix2] Accuracy blockers of review round 2, part A (Google Earth imagery 2026-03-11, raw/ref/earth/review2-8851):
// PIER7's roofline in three blocks and its white louvered street face, the plaza's ring planters and landing, the core
// town's ground (no photo lawns on car parks and cleared lots), the roof colours fitted to Earth, the 海の市 walk spot,
// and the cedar hills with the forest / cedar / felled override surfaces.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as L from "../src/anime/world/layout.js";
import { PIER7_SPLIT } from "../src/anime/world/harbor/minami.js";
import { PIER7_6 } from "../src/anime/world/harbor/minami5.js";
import { SITES, MINAMI } from "../src/anime/world/harbor/real.js";
import { WALK_SET } from "../src/anime/world/explore/places.js";
import { fitRoofTransform, gradeRoof } from "../scripts/anime/enrich/fold.js";
import { validateOverride, LANDUSE_USES, COVER_USES } from "../scripts/anime/enrich/overrides.js";
import { CLASSES, coreTown, inCedarCells, cedarCanopy } from "../scripts/anime/build-landcover.js";

const ROOT = join(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const inRing = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const inObb = (x, z, o, m = 0) => { const c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = x - o.cx, dz = z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 + m && Math.abs(dx * s + dz * c) < o.d / 2 + m; };

describe("B1 PIER7 roofline and street face", () => {
  const T = PIER7_SPLIT, len = (poly) => { const pr = poly.map((p) => (p[0] - T.axis.o[0]) * T.axis.u[0] + (p[1] - T.axis.o[1]) * T.axis.u[1]); return Math.max(...pr) - Math.min(...pr); };
  test("three blocks along the bar (NW ~14 m, main ~43 m, SE ~22 m) that tile the street-side split", () => {
    expect(T.blocks.map((b) => b.id)).toEqual(["nw", "main", "se"]);
    const [nw, main, se] = T.blocks.map((b) => len(b.poly));
    expect(nw).toBeGreaterThan(10); expect(nw).toBeLessThan(20);
    expect(main).toBeGreaterThan(38); expect(main).toBeLessThan(48);
    expect(se).toBeGreaterThan(18); expect(se).toBeLessThan(27);
    const sum = T.blocks.reduce((s, b) => s + area(b.poly), 0);
    expect(Math.abs(sum - area(T.upper))).toBeLessThan(1);
  });
  test("roofs at ~9 / 13 / 11 m: the main block is the tallest, the NW block the lowest", () => {
    const h = Object.fromEntries(T.blocks.map((b) => [b.id, b.h]));
    expect(h.main).toBeGreaterThan(h.se); expect(h.se).toBeGreaterThan(h.nw);
    const src = read("src/anime/world/harbor/minami.js");
    // [v6:rebuild] the built eaves come from the photo survey's SfM points (PIER7_6): the NW pavilion lowest, the SE block's
    // eave over the main block's (its top band reaches T.P. 13.6 in the points)
    expect(src).toContain("const tops = { ...PIER7_6.tops };");
    expect(PIER7_6.tops.nw).toBeLessThan(PIER7_6.tops.main); expect(PIER7_6.tops.main).toBeCloseTo(11.9, 1);
  });
  test("the street face is white panels with narrow timber louvers (pitch <= 1.2 m), no punched glass slots", () => {
    const src = read("src/anime/world/harbor/minami.js");
    expect(src).toContain("Math.round(len / 1.1)");
    expect(src).not.toMatch(/kind = i % 3/);
    expect(src).toContain("louver: '#cdbfa8'");
  });
});

describe("B2 PIER7 plaza", () => {
  test("ring planters: a white kerb 0.5 m high and 4.6 m across, low planting, no shrub spheres", () => {
    const src = read("src/anime/world/harbor/minami.js"), i = src.indexOf("for (const [x, z] of MINAMI.pits)"), body = src.slice(i, src.indexOf("}", src.indexOf("lowPlant", i)) + 1);
    expect(body).toContain("k.cyl(2.3, 2.3, 0.5, m.ringWhite"); expect(body).not.toContain("k.sphere");
    expect(src).toContain("ringWhite: '#e9e7e1'");
    expect(MINAMI.pits.length).toBe(3);
  });
  test("the landing is a desaturated stone (#b5ab9f), not salmon", () => {
    const src = read("src/anime/world/harbor/minami.js");
    expect(src).toContain("tanStep: '#b5ab9f'"); expect(src).not.toContain("'#c7b7a6'");
    const [r, g, b] = rgb("#b5ab9f"); expect(r - b).toBeLessThan(25);
  });
});

describe("B3 core-town ground", () => {
  const meta = JSON.parse(read("data/anime/landcover.json")).core;
  const PAL = CLASSES.map((c) => rgb(c.color));
  const near = (c) => { let b = 0, bd = 1e9; PAL.forEach((p, i) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const img = sharp(join(ROOT, "data/anime/landcover_core.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = async (x, z) => { const { data, info } = await img; const S = info.width, i = Math.floor((x - meta.x0) / (meta.x1 - meta.x0) * S), j = Math.floor((z - meta.z0) / (meta.z1 - meta.z0) * S), k = (j * S + i) * 3; return near([data[k], data[k + 1], data[k + 2]]); };
  test("the core-town rule: low ground within 1.5 km of (250, 150)", () => {
    expect(coreTown(250, 150, 3)).toBe(true); expect(coreTown(250, 150, 12)).toBe(false); expect(coreTown(2000, 150, 3)).toBe(false);
  });
  test("under 10 % of the core town's land cover is grass or field (it was 34.5 %)", async () => {
    const { data, info } = await img, S = info.width; let n = 0, g = 0;
    for (let j = 0; j < S; j += 4) for (let i = 0; i < S; i += 4) {
      const x = meta.x0 + (i + 0.5) / S * (meta.x1 - meta.x0), z = meta.z0 + (j + 0.5) / S * (meta.z1 - meta.z0);
      if (L.isWater(x, z) || !coreTown(x, z, L.heightAt(x, z))) continue;
      const k = (j * S + i) * 3, c = near([data[k], data[k + 1], data[k + 2]]); n++; if (c === 2 || c === 3) g++;
    }
    expect(n).toBeGreaterThan(5000); expect(g / n).toBeLessThan(0.1);
  });
  test("every car park and apron is paving under its centre", async () => {
    const paving = CLASSES.findIndex((c) => c.id === "paving");
    let n = 0, ok = 0;
    for (const lu of L.LANDUSE) {
      if (lu.cls !== "parking" && lu.cls !== "apron") continue;
      const c = lu.ring.reduce((s, p) => [s[0] + p[0] / lu.ring.length, s[1] + p[1] / lu.ring.length], [0, 0]);
      if (!inRing(c[0], c[1], lu.ring) || lu.area < 400 || c[0] < meta.x0 || c[0] > meta.x1 || c[1] < meta.z0 || c[1] > meta.z1) continue;
      n++; if ((await at(c[0], c[1])) === paving) ok++;
    }
    expect(n).toBeGreaterThan(50); expect(ok / n).toBeGreaterThan(0.95);
  });
  test("5x5 majority, the forced surfaces and a 1 px feather are in the build", () => {
    const src = read("scripts/anime/build-landcover.js");
    expect(src).toContain("a = majority(a, size, 2)"); expect(src).toContain("forceSurfaces(a, size"); expect(src).toContain("1 px feather");
  });
});

describe("B4 roof colours fitted to Earth", () => {
  test("fitRoofTransform recovers a known affine colour map", () => {
    const f = (c) => [0.7 * c[0] + 20, 0.75 * c[1] + 10 - 0.1 * c[2], 0.8 * c[2] - 0.15 * c[1] + 25];
    const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
    const pairs = []; for (let i = 0; i < 300; i++) { const c = [(i * 37) % 230 + 10, (i * 53) % 220 + 20, (i * 71) % 210 + 30]; pairs.push([hex(c), hex(f(c))]); }
    const t = fitRoofTransform(pairs, 1);
    for (const [g, e] of pairs.slice(0, 40)) { const a = rgb(gradeRoof(g, t)), b = rgb(e); for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThanOrEqual(4); }
  });
  test("no anime lift or saturation boost any more: the identity keeps the colour", () => {
    expect(gradeRoof("#808080")).toBe("#808080"); expect(gradeRoof("#3e4a63")).toBe("#404c64");
  });
  const cells = JSON.parse(read("data/anime/cells.json")).cells;
  const inCells = (x, z) => Object.entries(cells).some(([id, c]) => /^c\d+$/.test(id) && x >= c.bbox[0] && x <= c.bbox[2] && z >= c.bbox[1] && z <= c.bbox[3]);
  test("the photo-coloured roofs of the 12 cells match the Earth-checked ones in tone (was (160,166,167) vs (148,146,149))", () => {
    const a = [0, 0, 0], o = [0, 0, 0]; let na = 0, no = 0, teal = 0;
    for (const l of L.LOTS) {
      if (l.zone === "far" || !inCells(l.obb.cx, l.obb.cz)) continue;
      const c = rgb(l.roof.color);
      if (l.src.color === "aerial") { na++; c.forEach((v, i) => (a[i] += v)); if (c[2] > c[0] + 12 && c[1] > c[0] + 6) teal++; }
      else if (l.src.color === "override") { no++; c.forEach((v, i) => (o[i] += v)); }
    }
    expect(na).toBeGreaterThan(1000); expect(no).toBeGreaterThan(1000);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i] / na - o[i] / no)).toBeLessThan(8);
    expect(a[2] / na - a[0] / na).toBeLessThan(4);          // no cyan cast
    expect(teal / na).toBeLessThan(0.15);                     // 681 of 1,575 were teal-blue
  });
});

describe("B5 the 海の市 walk spot", () => {
  test("it stands on land, outside every footprint, and sees (395, 672) past the office lots", () => {
    const w = WALK_SET.uminoichi;
    expect([w.x, w.z]).toEqual([311.7, 704]);   // [v5:fix2 art] walkprobe's pick 40 m back down the road: the whole A-frame in frame
    expect(L.isWater(w.x, w.z)).toBe(false);
    const yaw = Math.atan2(-(395 - w.x), -(672 - w.z)) * 180 / Math.PI; expect(Math.abs(yaw - w.yaw)).toBeLessThan(10);   // aimed at the red block's centre, (395, 672) stays in frame
    const lots = L.LOTS.filter((l) => Math.hypot(l.obb.cx - 370, l.obb.cz - 690) < 120);
    expect(lots.some((l) => inObb(w.x, w.z, l.obb, 0.5))).toBe(false);
    // the sight line to within 6 m of the target crosses only the 海の市 block itself
    const um = SITES.uminoichi.poly, blockers = new Set();
    const d = Math.hypot(395 - w.x, 672 - w.z);
    for (let s = 1; s < d - 6; s += 0.5) { const x = w.x + (395 - w.x) * s / d, z = w.z + (672 - w.z) * s / d; if (inRing(x, z, um)) continue; for (const l of lots) if (inObb(x, z, l.obb) && !inRing(l.obb.cx, l.obb.cz, um)) blockers.add(l.id); }
    expect([...blockers]).toEqual([]);
  });
});

describe("B7 the cedar hills and the woods overrides", () => {
  test("canopy above 30 m in c1, c2 and c5 is cedar when blue-green or dark", () => {
    expect(inCedarCells(-450, -500)).toBe(true); expect(inCedarCells(-450, 100)).toBe(true); expect(inCedarCells(500, -500)).toBe(false);
    expect(cedarCanopy(100, 0.5)).toBe(true); expect(cedarCanopy(80, 0.4)).toBe(true); expect(cedarCanopy(80, 0.5)).toBe(false);
  });
  test("at least 80 % of the trees on those hills are cedars (it was 34 %)", () => {
    const t = JSON.parse(read("data/anime/trees.json")), n = [0, 0, 0];
    for (const r of t.rows) if (inCedarCells(r[0], r[1]) && r[2] > 30) n[r[3]]++;
    expect(n[0] + n[1] + n[2]).toBeGreaterThan(2000); expect(n[0] / (n[0] + n[1] + n[2])).toBeGreaterThan(0.8);
  });
  test("forest, cedar and felled are override uses; parking takes a counted fill", () => {
    for (const u of COVER_USES) expect(LANDUSE_USES[u]).toBe(u);
    const doc = (lu) => ({ version: 1, cell: "c1", bbox: [-700, -800, -200, -200], sources: [{ id: "earth", what: "Google Earth 3D, imagery dated 2026-03-11", date: "2026-03-11" }], landuse: [lu] });
    const ring = [[-400, -400], [-380, -400], [-380, -380]];
    for (const use of COVER_USES) expect(() => validateOverride(doc({ use, ring, src: "earth" }))).not.toThrow();
    expect(() => validateOverride(doc({ use: "parking", ring, fill: 0.1, src: "earth" }))).not.toThrow();
    expect(() => validateOverride(doc({ use: "cedar", ring, fill: 0.1, src: "earth" }))).toThrow(/fill/);
  });
  test("c2's cedar wood, the 八日町 felled strip and the 赤土山 wood are written; no tree stands on the clear-cut", () => {
    const ov = L.LANDUSE.filter((l) => l.src === "override");
    const felled = ov.filter((l) => l.cls === "felled"), cedar = ov.filter((l) => l.cls === "cedar");
    expect(felled.length).toBeGreaterThanOrEqual(1); expect(cedar.length).toBeGreaterThanOrEqual(2);
    expect(cedar.some((l) => inRing(-66, -306, l.ring))).toBe(true);       // behind 法玄寺 (c2)
    expect(cedar.some((l) => inRing(-372, -391, l.ring))).toBe(true);      // 赤土山自然公園 (c1): no lawn
    expect(L.LANDUSE.some((l) => l.cls === "park" && inRing(-372, -391, l.ring))).toBe(false);
    const t = JSON.parse(read("data/anime/trees.json"));
    for (const f of felled) expect(t.rows.filter((r) => inRing(r[0], r[1], f.ring)).length).toBe(0);
  });
});
