// [sys] Override schema additions and builder rules of round 1: roof.pv (8), crossings and arrows (14, 18), bus-stop props (17), the storey
// rounding of a height-only patch (29), measured walls and kinds on every builder (30, 31), the kit's storey height (29), the PV rows (8).
import { describe, expect, test } from "bun:test";
import { validateOverride, compileOverrides, patchLot, crossingOverrides, PROP_TYPES, ARROW_KINDS } from "../scripts/anime/enrich/overrides.js";
import { enrichLot } from "../scripts/anime/enrich/fold.js";
import { planPv, pvArea, PV } from "../src/anime/world/town/pv.js";
import { realFh, isFinalRoof } from "../src/anime/world/town/common.js";
import { measuredWall, wallOf } from "../src/anime/world/town/palette.js";
import { readFileSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const doc = (extra = {}) => ({ version: 1, cell: "pier7", bbox: [-50, -10, 130, 170], sources: [{ id: "earth", what: "Google Earth, imagery dated 2026-03-11", date: "2026-03-11" }], ...extra });
const err = (d) => { try { validateOverride(d, "t.json"); return ""; } catch (e) { return e.message; } };

describe("[sys:8] roof.pv", () => {
  test("a number in 0..1 or { share, side } validates; out-of-range values are rejected", () => {
    expect(() => validateOverride(doc({ lots: [{ id: "16/1/2/3", roof: { pv: 0.6 }, src: "earth: modules" }] }), "t.json")).not.toThrow();
    expect(() => validateOverride(doc({ lots: [{ id: "16/1/2/3", roof: { pv: { share: 0.5, side: "e" } }, src: "earth: modules" }] }), "t.json")).not.toThrow();
    expect(err(doc({ lots: [{ id: "16/1/2/3", roof: { pv: 1.4 }, src: "earth" }] }))).toContain(".roof.pv");
    expect(err(doc({ lots: [{ id: "16/1/2/3", roof: { pv: -0.1 }, src: "earth" }] }))).toContain(".roof.pv");
    expect(err(doc({ lots: [{ id: "16/1/2/3", roof: { pv: { share: 0.5, side: "up" } }, src: "earth" }] }))).toContain(".roof.pv.side");
    expect(err(doc({ lots: [{ id: "16/1/2/3", roof: { pv: "all" }, src: "earth" }] }))).toContain(".roof.pv");
  });
  test("the lot carries pv after the patch, with src.pv 'override'", () => {
    const lot = { id: "a", kind: "factory", storeys: 2, height: 9, obb: { cx: 0, cz: 0 }, roof: { shape: "flat", color: "#7d8596" }, wall: "#eee", src: { h: "derived", kind: "osm", roof: "aerial", color: "aerial" } };
    patchLot(lot, [{ roof: { pv: 0.7 }, ref: "t#lots/0", why: "earth" }]);
    expect(lot.roof.pv).toEqual({ share: 0.7, side: "all" }); expect(lot.src.pv).toBe("override");
    patchLot(lot, [{ roof: { pv: { share: 0.5, side: "s" } }, ref: "t#lots/1", why: "earth" }]);
    expect(lot.roof.pv).toEqual({ share: 0.5, side: "s" });
  });
  test("the layout carries pv on the measured plants", () => {
    const by = (id) => L.LOTS.find((l) => l.id === id)?.roof.pv;
    expect(by("16/58542/25067/33")).toEqual({ share: 0.5, side: "e" });
    expect(by("16/58542/25067/43").share).toBe(0.9);
    expect(by("16/58542/25067/1").share).toBe(0.7);
    expect(by("16/58541/25067/337").share).toBe(0.6);
    expect(by("16/58542/25066/195").share).toBe(0.85);
    expect(L.LOTS.find((l) => l.id === "16/58540/25068/371")?.roof.pv).toBeUndefined();   // 南町1丁目: ribbing, not modules, until an oblique shows them
  });
  test("planPv: rows 1 m deep, 1 m apart, 1 m inside the outline, within the band", () => {
    const ring = [[0, 0], [30, 0], [30, 20], [0, 20]];
    const all = planPv(ring, 1), east = planPv(ring, { share: 0.5, side: "e" }), south = planPv(ring, { share: 0.5, side: "s" });
    expect(all.length).toBeGreaterThan(8);
    for (const r of all) { expect(r.x0).toBeGreaterThanOrEqual(1 - 1e-9); expect(r.x1).toBeLessThanOrEqual(29 + 1e-9); expect(r.z0).toBeGreaterThanOrEqual(1 - 1e-9); expect(r.z1).toBeLessThanOrEqual(19 + 1e-9); expect(r.z1 - r.z0).toBe(PV.depth); }
    expect(east.every((r) => r.x0 >= 15 - 1e-9)).toBe(true);
    expect(south.every((r) => r.z0 >= 10 - 1e-9)).toBe(true);
    expect(pvArea(east)).toBeLessThan(pvArea(all) * 0.6); expect(pvArea(east)).toBeGreaterThan(pvArea(all) * 0.3);
    expect(planPv(ring, 0)).toEqual([]);
    const rows = all.map((r) => r.z0).sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) if (rows[i] !== rows[i - 1]) expect(rows[i] - rows[i - 1]).toBeCloseTo(PV.depth + PV.gap, 6);
  });
  test("mid.js and industrial.js draw the rows (planPv) in place of the random units; tilt about 10 degrees", () => {
    expect(read("src/anime/world/town/mid.js")).toContain("planPv(");
    expect(read("src/anime/world/town/industrial.js")).toContain("planPv(");
    expect(PV.tilt).toBeCloseTo(Math.PI / 18, 6); expect(PV.dark).toBe("#2f3a52"); expect(PV.frame).toBe("#c9ced6");
  });
});

describe("[sys:14][sys:18] crossings and arrows data", () => {
  test("schema: crossings need a road id, an in-cell position and a source; arrows need 1 to 4 known lanes", () => {
    expect(() => validateOverride(doc({ crossings: [{ at: [40, 40], road: "r123", remove: true, src: "earth: none" }, { at: [50, 50], road: "r124", diamonds: true, src: "earth: zebra" }] }), "t.json")).not.toThrow();
    expect(err(doc({ crossings: [{ at: [40, 40], road: "123", src: "earth" }] }))).toContain(".crossings[0].road");
    expect(err(doc({ crossings: [{ at: [4000, 40], road: "r1", src: "earth" }] }))).toContain("outside the cell bbox");
    expect(err(doc({ crossings: [{ at: [40, 40], road: "r1", remove: true, width: 4, src: "earth" }] }))).toContain("not with remove");
    expect(() => validateOverride(doc({ arrows: [{ road: "r9", node: [40, 40], lanes: ["S", "L"], src: "earth: arrows" }] }), "t.json")).not.toThrow();
    expect(err(doc({ arrows: [{ road: "r9", node: [40, 40], lanes: ["U"], src: "earth" }] }))).toContain(".arrows[0].lanes");
    expect(ARROW_KINDS).toEqual(["S", "L", "R", "SL", "SR"]);
  });
  test("compile + crossingOverrides split zebras, removals and arrows", () => {
    const C = compileOverrides([validateOverride(doc({ crossings: [{ at: [40, 40], road: "r5", remove: true, src: "earth: none" }, { at: [50, 50], road: "r6", src: "earth: zebra" }], arrows: [{ road: "r9", node: [40, 40], lanes: ["S"], src: "earth: a" }] }), "t.json")]);
    const o = crossingOverrides(C);
    expect(o.removed).toEqual([{ x: 40, z: 40, road: "r5", ovr: "t.json#crossings/0" }]);
    expect(o.zebras.length).toBe(1); expect(o.arrows[0].lanes).toEqual(["S"]);
  });
});

describe("[sys:17] bus stop props", () => {
  test("busStop and brtStop are override prop types", () => {
    expect(PROP_TYPES).toContain("busStop"); expect(PROP_TYPES).toContain("brtStop");
    expect(() => validateOverride(doc({ props: [{ type: "busStop", at: [40, 40], face: 90, src: "earth: pole" }] }), "t.json")).not.toThrow();
  });
});

describe("[sys:29] a measured height is built as given", () => {
  test("a height-only patch keeps a single-storey store at 1 storey (it rounded to 2); the OSM height path agrees", () => {
    const lot = { id: "s", kind: "shop", storeys: 2, height: 6.1, obb: { cx: 0, cz: 0 }, roof: { shape: "flat", color: "#ccc" }, wall: "#eee", src: { h: "derived", kind: "osm", roof: "derived", color: "derived" } };
    patchLot(lot, [{ height: 4.8, ref: "t#lots/0", why: "earth" }]);
    expect(lot.storeys).toBe(1);
    const e = enrichLot({ height: 4.8 }, { kind: "shop", storeys: 2, height: 6.1, roofShape: "flat", roofColor: "#ccc", wall: "#eee", rotY: 0 }, [1, 1, 1], () => ({}));
    expect(e.storeys).toBe(1);
    const h = enrichLot({ height: 8.7 }, { kind: "house", storeys: 2, height: 5.8, roofShape: "gable", roofColor: "#ccc", wall: "#eee", rotY: 0 }, [1, 1, 1], () => ({}));
    expect(h.storeys).toBe(3);
  });
  test("the layout: セブン-イレブン and 昭和シェル are 1 storey", () => {
    expect(L.LOTS.find((l) => l.id === "ovr:c4:seven-eleven").storeys).toBe(1);
    expect(L.LOTS.find((l) => l.id === "16/58541/25066/168").storeys).toBe(1);
  });
  test("the kit's storey height follows lot.height: built height within 0.5 m of lot.height for realH lots", () => {
    const flat = (lot, floors) => floors * realFh(lot, floors, "flat") + 0.32 + 0.9, pitched = (lot, floors) => floors * realFh(lot, floors, "gable") + 0.32;
    for (const [h, fl] of [[16, 5], [9.5, 3], [6, 2], [7, 2], [4.8, 1], [4.5, 1], [11.3, 3]]) {
      const lot = { height: h };
      expect(Math.abs(flat(lot, fl) - h)).toBeLessThan(0.5); expect(Math.abs(pitched(lot, fl) - h)).toBeLessThan(0.5);
    }
    // real lots: every measured (osm / override / landmark) house, shop or office with storeys 1..8
    let n = 0;
    for (const l of L.LOTS) {
      if (!["osm", "override", "landmark"].includes(l.src?.h) || l.zone !== "hero" || l.landmark || !["house", "shop", "office", "apartment"].includes(l.kind)) continue;
      const fl = Math.max(1, Math.min(l.kind === "house" || l.kind === "shop" ? 8 : 14, l.storeys)), fh = realFh(l, fl, l.roof.shape === "flat" ? "flat" : "gable");
      if (fh > 2.6 + 1e-6 && fh < 5.5 - 1e-6) { n++; expect(Math.abs(fl * fh + 0.32 + (l.roof.shape === "flat" ? 0.9 : 0) - l.height)).toBeLessThan(0.5); }
    }
    expect(n).toBeGreaterThan(30);
  });
  test("hero.js, blocks.js and the kit use the measured storey height", () => {
    expect(read("src/anime/world/town/hero.js")).toContain("realFh(lot, floors, roofType)");
    expect(read("src/anime/world/town/blocks.js")).toContain("clamp((lot.height - 0.25 - 0.9) / n, 2.6, 4.5)");
    expect(read("src/anime/world/town/blocks.js")).toContain("clamp((lot.height - 0.2 - 0.9) / n, 2.8, 5.5)");
    expect(read("src/anime/world/town/kit/lot.js")).toContain("D.fh ?? 2.85");
    expect(read("src/anime/world/town/kit/place.js")).toContain("realFh(");
  });
});

describe("[sys:30][sys:31] measured kinds and walls are not re-rolled", () => {
  test("classifyHero keeps a measured kind (the two random main-street rules apply to derived kinds only)", () => {
    const t = read("src/anime/world/town/hero.js");
    expect(t).toContain("const measuredKind = !!lot.src?.kind && lot.src.kind !== 'derived';");
    expect(t).toContain("!measuredKind && kind === 'house' && main");
    expect(t).toContain("!measuredKind && kind === 'office' && lot.storeys <= 2");
  });
  test("measuredWall: OSM building:colour and an override; the three builders replace only the result", () => {
    expect(measuredWall({ src: { wall: "osm" } })).toBe(true); expect(measuredWall({ src: { wall: "override" } })).toBe(true); expect(measuredWall({ src: {} })).toBe(false);
    expect(wallOf({ src: { wall: "override" }, wall: "#eeeeea", kind: "shop", seed: 5 })).toBe("#eeeeea");
    const ind = read("src/anime/world/town/industrial.js");
    expect(ind).toContain("const mw = measuredWall(lot);"); expect(ind).toContain("const wall = mw ? lot.wall : wall0;"); expect(ind).toContain("const rusty = mw ? false : rusty0;");
    const bl = read("src/anime/world/town/blocks.js");
    expect(bl).toContain("if (measuredWall(lot)) body = lot.wall;"); expect(bl).toContain("measuredWall(lot) && lot.wall ? lot.wall : body0");
    const he = read("src/anime/world/town/hero.js");
    expect(he).toContain("measuredWall(lot) && !tall"); expect(he).toContain("if (measuredWall(lot)) S.wall.color = lot.wall;");
    expect(he).not.toContain("#d6dde0");
  });
  test("the kit palette has no pale-blue siding", () => {
    const kit = read("src/anime/world/town/kit/lot.js");
    for (const c of ["#b7cddb", "#c2d3de", "#aec6d6", "#bccfdc"]) expect(kit).not.toContain(c);
  });
});

describe("[sys:25][sys:32] school yards and the gym", () => {
  test("landuse school / sport colours are the desaturated Earth ones; an override lawn paints above an OSM pitch", async () => {
    const { LOOK, rankOf } = await import("../src/anime/world/town/landuse.js");
    expect(LOOK.school.col).toBe("#c6bba8"); expect(LOOK.sport.col).toBe("#c2bbac");
    expect(rankOf({ cls: "park", ovr: "c9.json#landuse/12" })).toBeGreaterThan(rankOf({ cls: "sport" }));
    expect(rankOf({ cls: "park" })).toBeLessThan(rankOf({ cls: "sport" }));
    const lawn = L.LANDUSE.find((l) => l.ovr?.startsWith("c9.json") && l.cls === "park" && /worn turf/.test(l.ovrWhy || ""));
    expect(lawn).toBeTruthy(); expect(Math.min(...lawn.ring.map((p) => p[1]))).toBeGreaterThanOrEqual(370);
  });
  test("a landmark school lot takes the aerial roof colour unless its tag has one (keepAerialColour), and the gym is pinned light blue", () => {
    const e = { rgb: [116, 198, 211], veg: 0 };
    const base = { kind: "school", storeys: 1, height: 6, roofShape: "flat", roofColor: "#56677a", wall: "#eee", rotY: 0, landmark: "school:x", keepAerialColour: true };
    expect(enrichLot(e, base, [1, 1, 1], () => ({})).src.color).toBe("aerial");
    expect(enrichLot(e, { ...base, keepAerialColour: false }, [1, 1, 1], () => ({})).src.color).toBe("derived");
    expect(L.LOTS.find((l) => l.id === "16/58540/25069/64").roof.color).toBe("#80b0c8");
  });
});

describe("[sys:1] c2 roof colours are the raw Earth medians", () => {
  test("no pale mint cast: the c2 override roof colours with L* > 70 and a* < -4 are gone (70 of 325 before)", () => {
    const d = JSON.parse(read("data/anime/overrides/c2.json"));
    const lab = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116); return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
    const mint = d.lots.filter((o) => o.roof?.color && lab(o.roof.color)[0] > 70 && lab(o.roof.color)[1] < -4);
    expect(mint.length).toBeLessThan(10);
    expect(d.note).toContain("0.839, 0.598, 0.671"); expect(d.note).not.toContain("linear x 1/0.90");
    expect(d.lots.find((o) => o.id === "16/58541/25067/5")?.roof.color ?? "#000000").not.toBe("#b7cfcd");
  });
});
