// [r3] SYSTEMIC FIX round 3: a regression test for each of the 19 causes of inaccuracy fixed in code or data (docs/anime/OVERRIDES.md).
// Pure functions and committed data only (no GPU, no raw/ files): the layout is data/anime/layout.json as built.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import * as L from "../src/anime/world/layout.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
// the Earth capture tool (tools/anime/earth-ref.mjs) is not part of the public repository: the tests that read it skip without it
const HAVE_EARTH_TOOL = existsSync(new URL("../tools/anime/earth-ref.mjs", import.meta.url));
const lot = (id) => L.lotById(id);

// ------------------------------------------------------------------ 1. the OSM gap list is a gone-building list
describe("[r3:1] osm-gap and OVERRIDES.md say what the list is, with measured numbers", () => {
  const gap = read("tools/anime/osm-gap.mjs"), doc = read("docs/anime/OVERRIDES.md");
  test("both call it a gone-building list: about 85-90 % gone, about 9 % standing, every ring needs an Earth top check plus o0 / o180", () => {
    for (const t of [gap, doc]) {
      expect(t).toContain("gone-building list");
      expect(t).toContain("85-90 %");
      expect(t).toContain("132");
      expect(t).toMatch(/about 9 %/i);
      expect(t).toContain("o0 and o180");
    }
    expect(doc).not.toContain("under 5 %");
    expect(doc).not.toContain("141 of 12 cells");
    expect(doc).not.toContain("about two of three of the");
    expect(gap).not.toContain("7 of the 20 largest stand");
  });
  test("the confirmed standing buildings are newLots with an 'osm: w... + earth: ...' source", () => {
    for (const [id, w] of [["ovr:c12:osm-1242845988", "w1242845988"], ["ovr:c6:osm-966913923", "w966913923"], ["ovr:c5:osm-928776174", "w928776174"], ["ovr:c2:osm-1242838123", "w1242838123"], ["ovr:c10:osm-792747216", "w792747216"], ["ovr:c12:osm-1242845996", "w1242845996"]]) {
      const l = lot(id); expect(l).toBeTruthy();
      expect(l.src.ovrWhy).toContain("osm: " + w); expect(l.src.ovrWhy).toContain("earth:");
    }
  });
});

// ------------------------------------------------------------------ 2. ghost lots: the green scan, the Earth-side no-edge flag, the recolour gate
describe("[r3:2] vegetation-green scan, presence flags, the recolour gate", () => {
  test("isVegGreen / greenStats / vegFlag: dark green interiors flag; a blue-grey slate roof (B above G) and a bright lawn do not", async () => {
    const G = await import("../scripts/anime/enrich/green.js");
    expect(G.isVegGreen(80, 100, 70)).toBe(true);
    expect(G.isVegGreen(80, 85, 70)).toBe(false);          // G - R under 9
    expect(G.isVegGreen(86, 103, 120)).toBe(false);        // cyan-cast slate: B >= G
    const dark = Array.from({ length: 50 }, () => [70, 95, 72]), lawn = Array.from({ length: 50 }, () => [150, 190, 120]), slate = Array.from({ length: 50 }, () => [86, 103, 120]);
    expect(G.vegFlag(G.greenStats(dark))).toBe(true);
    expect(G.vegFlag(G.greenStats(lawn))).toBe(false);     // luminance over 132
    expect(G.vegFlag(G.greenStats(slate))).toBe(false);
    expect(G.greenStats(dark.slice(0, 5))).toBeNull();     // fewer than 12 samples
    const mixed = [...dark.slice(0, 35), ...Array.from({ length: 15 }, () => [120, 118, 125])];   // 70 % green: under 80 %
    expect(G.vegFlag(G.greenStats(mixed))).toBe(false);
  });
  test("ringSamples stays inside the ring; touchesOther finds a sliver between two lots", async () => {
    const G = await import("../scripts/anime/enrich/green.js");
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10]], pts = []; G.ringSamples(ring, (x, z) => { pts.push([x, z]); return [1, 2, 3]; });
    expect(pts.length).toBeGreaterThan(50);
    for (const [x, z] of pts) { expect(x).toBeGreaterThan(0.7); expect(x).toBeLessThan(9.3); expect(z).toBeGreaterThan(0.7); expect(z).toBeLessThan(9.3); }
    const mk = (id, ring) => ({ id, poly: ring, obb: { cx: ring[0][0] + 5, cz: ring[0][1] + 5, w: 10, d: 10 } });
    const a = mk("a", ring), b = mk("b", [[10, 0], [20, 0], [20, 10], [10, 10]]), c = mk("c", [[40, 40], [50, 40], [50, 50], [40, 50]]);
    expect(G.touchesOther(a, [a, b, c])).toBe(true);
    expect(G.touchesOther(c, [a, b, c])).toBe(false);
  });
  test("scanGreen skips landmark / shrine / temple kinds, excluded areas and slivers (touches is reported)", async () => {
    const G = await import("../scripts/anime/enrich/green.js");
    const green = () => [70, 95, 72], ring = [[0, 0], [12, 0], [12, 12], [0, 12]];
    const mk = (id, kind, off) => ({ id, kind, area: 144, poly: ring.map(([x, z]) => [x + off, z]), obb: { cx: off + 6, cz: 6, w: 12, d: 12 } });
    const lots = [mk("h", "house", 0), mk("s", "shrine", 100), mk("t", "temple", 200), mk("x", "house", 300)];
    const out = G.scanGreen(lots, green, { skip: (l) => l.id === "x" });
    expect(out.map((r) => r.id)).toEqual(["h"]);
    expect(out[0].touches).toBe(false);
  });
  test.skipIf(!HAVE_EARTH_TOOL)("presenceFlags: CHECK-GONE as before, CHECK-EMPTY when flat in BOTH photos, CHECK-GREEN from the scan", async () => {
    const { presenceFlag, presenceFlags, PRESENCE } = await import("../tools/anime/earth-ref.mjs");
    expect(presenceFlag(1.6, 1.35)).toBe("CHECK-GONE");
    expect(presenceFlags(3, 0.4)).toEqual(["CHECK-GONE"]);
    expect(presenceFlags(1.0, 1.1)).toEqual(["CHECK-EMPTY"]);          // no edge in either photo: the ghost lot over forest or grass
    expect(presenceFlags(1.5, 1.1)).toEqual([]);
    expect(presenceFlags(1.0, 1.1, { green: true })).toEqual(["CHECK-EMPTY", "CHECK-GREEN"]);
    expect(presenceFlags(null, null)).toEqual([]);
    expect(PRESENCE.emptyMax).toBe(1.2);
  });
  test("confirmsOblique / greenGateErrors: a recolour of a flagged lot needs o0 / o180 / l45 or a ground photo; 'earth: roof #... on the top view' is not enough; removals and slivers pass", async () => {
    const G = await import("../scripts/anime/enrich/green.js");
    expect(G.confirmsOblique("earth: roof #857172 on the top view (sub/nw, lot 492)")).toBe(false);
    expect(G.confirmsOblique("earth: o180 shows a grey roof")).toBe(true);
    expect(G.confirmsOblique("checked on o0 and o180")).toBe(true);
    expect(G.confirmsOblique("earth: l45 north face")).toBe(true);
    expect(G.confirmsOblique("commons: ground photo 2025-09")).toBe(true);
    expect(G.confirmsOblique("earth: top_annot #o10 and the c6_sub-o1800")).toBe(false);   // not the o0 / o180 tokens
    const flags = { a: { lum: 100, share: 0.9, touches: false }, s: { lum: 100, share: 0.9, touches: true } };
    const ops = (why, extra = {}) => [{ ref: "t.json#lots/0", why, roof: { color: "#aabbcc" }, ...extra }];
    expect(G.greenGateErrors(flags, new Map([["a", ops("earth: roof #aabbcc on the top view")]])).length).toBe(1);
    expect(G.greenGateErrors(flags, new Map([["a", ops("earth: o0 + o180: a grey roof")]])).length).toBe(0);
    expect(G.greenGateErrors(flags, new Map([["a", ops("earth: roof on the top view", { remove: true })]])).length).toBe(0);
    expect(G.greenGateErrors(flags, new Map([["s", ops("earth: roof on the top view")]])).length).toBe(0);   // a sliver
    expect(G.greenGateErrors(null, new Map([["a", ops("x")]])).length).toBe(0);
  });
  test("build-layout runs the gate; the committed override files pass it against data/anime/green-flags.json", async () => {
    expect(read("scripts/anime/build-layout.js")).toContain("greenGateErrors");
    const G = await import("../scripts/anime/enrich/green.js"), F = await import("../scripts/anime/enrich/fold.js");
    const flags = JSON.parse(read("data/anime/green-flags.json")).flagged;
    expect(Object.keys(flags).length).toBeGreaterThan(30);
    const OV = F.compileOverrides(F.loadOverrides(F.OVERRIDES_DIR));
    expect(G.greenGateErrors(flags, OV.lotPatch)).toEqual([]);
  });
  test("the confirmed ghost lots are removals now: c2 /76 /79 /3 /30 /49 /303 /38 /130, c1 /336 /277, c5 /342, c10 /290, c6 /332, c9 /134 (and the older five)", () => {
    for (const id of ["16/58540/25067/76", "16/58540/25067/79", "16/58540/25066/3", "16/58540/25066/30", "16/58541/25066/49", "16/58540/25067/303", "16/58540/25066/38", "16/58541/25067/130",
      "16/58539/25068/336", "16/58539/25067/277", "16/58539/25068/342", "16/58540/25069/290", "16/58541/25069/332", "16/58539/25069/134", "16/58541/25067/217", "16/58541/25067/289"]) expect(lot(id)).toBeFalsy();
  });
});

// ------------------------------------------------------------------ 3 + 16. schools: a per-lot kind table, fill >= 0.85 for the fallback, 気仙沼小 /73 is a 2-storey block
describe("[r3:3][r3:16] schools: classroom blocks are not gyms", async () => {
  const S = await import("../src/anime/world/landmarks/schools.js"), I = await import("../src/anime/world/landmarks/sites.js");
  const kind = (id) => S.schoolKind(lot(id));
  test("the table: gyms /195 /39 /35 /64 /100 /170 /69 /31 and the blocks /196 /24 /73 /126 /168; /38 is a shed", () => {
    for (const id of ["16/58543/25065/195", "16/58538/25071/39", "16/58538/25071/35", "16/58540/25069/64", "16/58540/25069/100", "16/58538/25072/170", "16/58542/25064/69", "16/58544/25064/31"]) expect(kind(id)).toBe("gym");
    for (const id of ["16/58543/25065/196", "16/58537/25071/24", "16/58540/25069/73", "16/58540/25069/126", "16/58538/25072/168", "16/58537/25071/429", "16/58537/25070/531"]) expect(kind(id)).toBe("block");
    expect(kind("16/58538/25071/38")).toBe("shed");
    expect(kind("16/58536/25071/307")).toBe("gym"); expect(kind("16/58536/25071/362")).toBe("block");   // 九条小: decided on Earth 2026-03-11 (outside the core ortho)
    expect(lot("16/58536/25071/307").roof.shape).toBe("gable");
  });
  test("every listed lot exists and carries its school's landmark tag", () => {
    for (const [school, info] of Object.entries(I.SCHOOL_INFO)) for (const id of Object.keys(info.kindOverride || {})) { expect(lot(id)).toBeTruthy(); expect(lot(id).landmark).toBe("school:" + school); }
  });
  test("id-less lots use the heuristic (the v4 expectations hold): 1181 m2 29 x 41 gym, 1815 m2 30 x 103 block; a diagonal wing (fill under 0.85) is not a gym", () => {
    expect(S.schoolKind({ area: 1181, obb: { w: 29, d: 41 } })).toBe("gym");
    expect(S.schoolKind({ area: 1815, obb: { w: 30, d: 103 } })).toBe("block");
    const diag = { area: 1220, obb: { w: 35, d: 48 }, poly: Array.from({ length: 8 }, (_, i) => [i, i * 2]) };
    expect(S.polyFill({ ...diag, poly: [[0, 0], [48, 0], [48, 8], [20, 8], [20, 35], [0, 35]] , obb: { w: 35, d: 48 } })).toBeLessThan(0.85);
    expect(S.schoolKind({ area: 1220, obb: { w: 35, d: 48 }, poly: [[0, 0], [48, 0], [48, 8], [20, 8], [20, 35], [0, 35]] })).toBe("block");
    expect(S.polyFill({ area: 100, obb: { w: 10, d: 10 } })).toBe(1);
  });
  test("/73 is 2 storeys (layout 2 storeys, 7.5 m); /168 keeps its photographed 3", () => {
    expect(S.schoolStoreys(lot("16/58540/25069/73"))).toBe(2);
    expect(lot("16/58540/25069/73").storeys).toBe(2); expect(lot("16/58540/25069/73").height).toBe(7.5);
    expect(S.schoolStoreys(lot("16/58538/25072/168"))).toBe(3);
  });
  test("気仙沼小's central block (the one with the concrete fins) is still /91 now that /73 is a block too", () => {
    const blocks = L.LOTS.filter((l) => l.landmark === "school:schKesennumaE" && S.schoolKind(l) === "block").sort((u, v) => v.area - u.area);
    expect(blocks[0].id).toBe("16/58540/25069/91"); expect(blocks.some((l) => l.id === "16/58540/25069/73")).toBe(true);
  });
  test("far school lots get their real footprint before the walls: schools.js patches them from explore.json (/24 U, /196 U)", async () => {
    expect(read("src/anime/world/landmarks/schools.js")).toContain("patchLots");
    const X = JSON.parse(read("data/anime/explore.json"));
    for (const id of ["16/58537/25071/24", "16/58543/25065/196"]) { expect(X.lots[id][0].length).toBeGreaterThan(8); }
  });
});

describe("[r3:15] school sheds carry no name board", async () => {
  const RN = await import("../src/anime/world/town/realnames.js");
  test("a school lot under 150 m2 with no GSI facility is not signed; the v4 facility case stays", () => {
    expect(RN.wantsSign({ name: "気仙沼市立気仙沼小学校", kind: "school", area: 24 })).toBe(false);
    expect(RN.wantsSign({ name: "気仙沼市立気仙沼中学校", kind: "school", area: 7 })).toBe(false);
    expect(RN.wantsSign({ name: "気仙沼市立気仙沼小学校", kind: "school", area: 400 })).toBe(true);
    expect(RN.wantsSign({ name: "気仙沼市立気仙沼小学校", kind: "school", area: 24, facility: "school" })).toBe(true);
    expect(RN.wantsSign({ name: "気仙沼市立気仙沼小学校", facility: "school" })).toBe(true);   // no kind and no area: undefined < 150 is false
  });
  test("no mid / hero school lot under 150 m2 in the layout gets a board", () => {
    const small = L.LOTS.filter((l) => l.zone !== "far" && l.kind === "school" && l.area < 150 && !l.facility && l.name);
    expect(small.length).toBeGreaterThan(5);
    for (const l of small) expect(RN.wantsSign(l)).toBe(false);
  });
});

// ------------------------------------------------------------------ 4. three yellow roofs
describe("[r3:4] サンモリ /470, /213 and 森産婦人科 /305 carry their Earth colours", () => {
  test("the stored colours are yellow / ochre / golden, not mauve-brown", () => {
    const want = { "16/58539/25068/470": "#cdb68a", "16/58540/25069/213": "#c8a889", "16/58540/25068/305": "#c0947e" };
    for (const [id, c] of Object.entries(want)) { const l = lot(id); expect(l.roof.color).toBe(c); expect(l.src.color).toBe("override"); }
    expect(lot("16/58540/25068/305").roof.shape).toBe("hip");   // the earlier override of the shape is kept
    const gb = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 8) & 255) - (n & 255); };
    for (const id of Object.keys(want)) expect(gb(lot(id).roof.color)).toBeGreaterThan(18);   // a yellow cast (G well above B); the mauve-brown it replaced had G - B of 0 to 4
  });
});

// ------------------------------------------------------------------ 5. solar blocks flush on pitched roofs
describe("[r3:5] flush PV blocks on a pitched roof", async () => {
  const P = await import("../src/anime/world/town/pv.js");
  const fr = { Lh: 10, Dh: 6, rl: 10, pitch: 0.3 };
  test("pvRectToRoof maps lot-local rects to the roof frame, ridge along x or z, with ridgeAt", () => {
    const rc = { x: 2, z: -4, w: 4, d: 6 };
    expect(P.pvRectToRoof(rc, { x: 0, z: 0 }, true, 0)).toEqual({ a0: 0, a1: 4, b0: -7, b1: -1 });
    expect(P.pvRectToRoof(rc, { x: 0, z: 0 }, true, 2.5)).toEqual({ a0: 0, a1: 4, b0: -9.5, b1: -3.5 });
    const q = P.pvRectToRoof(rc, { x: 0, z: 0 }, false, 0);          // ridge along z: a = -z, b = x
    expect(q).toEqual({ a0: 1, a1: 7, b0: 0, b1: 4 });
  });
  test("blocks are clipped to one facet: 0.4 m off the ridge, 0.45 m off the eave, never across the ridge; modules tile the block", () => {
    const out = P.flushPvBlocks([{ a0: -3, a1: 3, b0: -4, b1: 4 }], fr);
    expect(out.length).toBe(2);
    for (const bk of out) {
      expect(bk.t0).toBeGreaterThanOrEqual(0.4 - 1e-9); expect(bk.t1).toBeLessThanOrEqual(6 - 0.45 + 1e-9);
      expect(bk.cells.length).toBeGreaterThan(5);
      for (const c of bk.cells) { expect(c.a0).toBeGreaterThanOrEqual(bk.a0 - 1e-9); expect(c.a1).toBeLessThanOrEqual(bk.a1 + 1e-9); expect(c.t0).toBeGreaterThanOrEqual(bk.t0 - 1e-9); expect(c.t1).toBeLessThanOrEqual(bk.t1 + 1e-9); }
    }
    expect(out.map((b) => b.s).sort()).toEqual([-1, 1]);
    expect(P.flushPvBlocks([{ a0: -3, a1: 3, b0: 0.1, b1: 0.6 }], fr)).toEqual([]);   // inside the ridge margin
  });
  test("a hip facet narrows toward the ridge: a block near the ridge is clipped in a", () => {
    const hip = { Lh: 10, Dh: 6, rl: 1, pitch: 0.3 };
    const [bk] = P.flushPvBlocks([{ a0: -9, a1: 9, b0: 0.5, b1: 5.5 }], hip);
    expect(bk.a1).toBeLessThan(2); expect(bk.a0).toBeGreaterThan(-2);
  });
  test("萬屋呉服部 /129: four blocks of about 116 m2 of modules on a rose gable, ridge along the frontage 2.5 m off centre, colour on the stored scale of its neighbours", () => {
    const l = lot("16/58540/25068/129");
    expect(l.roof.shape).toBe("gable"); expect(l.roof.ridge).toBe("x"); expect(l.roof.color).toBe("#a68086");
    expect(P.isFlushPv(l.roof.pv)).toBe(true); expect(l.roof.pv.rects.length).toBe(4); expect(l.roof.pv.ridgeAt).toBe(2.5);
    const o = l.obb, w = o.w / 2, d = o.d / 2, pitch = 0.3;
    const blocks = P.flushPvBlocks(l.roof.pv.rects.map((q) => P.pvRectToRoof(q, { x: 0, z: 0 }, true, l.roof.pv.ridgeAt)), { Lh: w, Dh: d, rl: w, pitch });
    expect(blocks.length).toBe(4);   // two on each facet
    const area = P.flushPvArea(blocks, pitch);
    expect(area).toBeGreaterThan(95); expect(area).toBeLessThan(150);
    const a = (h) => parseInt(h.slice(1, 3), 16), neigh = [lot("16/58540/25068/134"), lot("16/58540/25068/128")].map((q) => a(q.roof.color));
    expect(a(l.roof.color)).toBeGreaterThanOrEqual(Math.min(...neigh) - 4); expect(a(l.roof.color)).toBeLessThanOrEqual(Math.max(...neigh) + 4);
  });
  test("schema: flush needs rects (1..40 x, z, w, d), takes no share / side; the compile keeps rects and ridgeAt", async () => {
    const { validateOverride, compileOverrides } = await import("../scripts/anime/enrich/fold.js");
    const doc = (roof) => ({ version: 1, cell: "t", bbox: [0, 0, 100, 100], sources: [{ id: "earth", what: "t" }], lots: [{ id: "16/1/2/3", roof, src: "earth: t" }] });
    const err = (roof) => { try { validateOverride(doc(roof), "t.json"); return ""; } catch (e) { return String(e.message); } };
    expect(err({ pv: { flush: true, rects: [{ x: 1, z: 2, w: 3, d: 4 }], ridgeAt: 2.5 } })).toBe("");
    expect(err({ pv: { flush: true } })).toContain(".pv.rects");
    expect(err({ pv: { flush: true, rects: [{ x: 1, z: 2, w: 3, d: 4 }], share: 0.3 } })).toContain("no share");
    expect(err({ pv: { rects: [{ x: 1, z: 2, w: 3, d: 4 }] } })).toContain("flush");
    expect(err({ pv: { share: 0.3, side: "s" } })).toBe("");
    const C = compileOverrides([validateOverride(doc({ pv: { flush: true, rects: [{ x: 1.04, z: 2, w: 3, d: 4 }], ridgeAt: 2.5 } }), "t.json")]);
    expect(C.lotPatch.get("16/1/2/3")[0].roof.pv.ridgeAt).toBe(2.5);
  });
  test("kit/lot.js keeps the seeded solar draw where it was (the rng stream of every following value is unchanged) and only masks its result", async () => {
    const { makeSpec } = await import("../src/anime/world/town/kit/lot.js");
    const run = (pvData) => { let n = 0, s = 12345; const r = () => { n++; s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; const spec = makeSpec(r, { floors: 2, roofType: "gable", allowFlat: true, pvData }); const next = r(); delete spec.rng; return { spec, n, next }; };
    let masked = 0;
    for (let seed = 0; seed < 1; seed++) {
      const a = run(false), b = run(true);
      expect(b.n).toBe(a.n); expect(b.next).toBe(a.next);               // the same number of draws, the same next value
      const { solar: sa, ...ra } = a.spec, { solar: sb, ...rb } = b.spec;
      expect(rb).toEqual(ra); expect(sb).toBe(false); if (sa) masked++;
    }
    const src = read("src/anime/world/town/kit/lot.js");
    expect(src).toContain("solar: (!trad && roofType !== 'flat' && r() < 0.1) && !o.pvData");
    void masked;
  });
  test("mid.js and kit/house.js draw the blocks; the hero and kit builders pass the spec on", () => {
    expect(read("src/anime/world/town/mid.js")).toContain("flushPvBlocks");
    expect(read("src/anime/world/town/kit/house.js")).toContain("S.pvFlush");
    expect(read("src/anime/world/town/hero.js")).toContain("pvFlush");
    expect(read("docs/anime/OVERRIDES.md")).toContain('"flush": true');
  });
});

// ------------------------------------------------------------------ 6. big derived sheds are pitched
describe("[r3:6] derived mono-pitch sheds of houses and shops of 100 m2 or more", async () => {
  const D = await import("../scripts/anime/derive.js");
  test("resolveRoofShape: 0.75 for house / shop lots of 100 m2 or more, 0.55 below, warehouses untouched; deterministic", () => {
    expect(D.SHED_TO_PITCHED_BIG).toBe(0.75); expect(D.BIG_SHED_AREA).toBe(100); expect(D.SHED_TO_PITCHED).toBe(0.55);
    const f = (id, area, kind = "house") => ({ id, kind, shape: "shed", height: 5.8, area });
    let big = 0, small = 0, wh = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      if (D.resolveRoofShape(f("b" + i, 150)) === "shed") big++;
      if (D.resolveRoofShape(f("s" + i, 60)) === "shed") small++;
      if (D.resolveRoofShape(f("w" + i, 150, "warehouse")) === "shed") wh++;
    }
    expect(big / N).toBeGreaterThan(0.2); expect(big / N).toBeLessThan(0.3);        // 25 % stay sheds
    expect(small / N).toBeGreaterThan(0.41); expect(small / N).toBeLessThan(0.49);  // 45 %
    expect(wh).toBe(N);
    expect(D.resolveRoofShape(f("x", 150))).toBe(D.resolveRoofShape(f("x", 150)));
  });
  test("the 12 lots Earth shows pitched are gable / hip with a ridge on their long axis; 25070/288 does not exist; the wall-less carports stay mono-pitch", () => {
    const hip = ["16/58539/25068/463", "16/58540/25067/74", "16/58540/25069/44"], gable = ["16/58540/25067/326", "16/58539/25068/364", "16/58539/25068/424", "16/58541/25067/0", "16/58541/25066/174", "16/58539/25067/335", "16/58540/25066/8", "16/58540/25067/247", "16/58543/25068/20"];
    for (const id of hip) { expect(lot(id).roof.shape).toBe("hip"); expect(lot(id).src.roof).toBe("override"); }
    for (const id of gable) expect(lot(id).roof.shape).toBe("gable");
    for (const id of [...hip, ...gable]) { const o = lot(id).obb; expect(lot(id).roof.ridge).toBe(o.w >= o.d ? "x" : "z"); }
    expect(lot("16/58540/25070/288")).toBeFalsy();
    for (const id of ["16/58540/25067/22", "16/58540/25069/398"]) { const l = lot(id); if (l) expect(l.roof.shape).not.toBe("gable"); }
  });
  test("fewer large derived sheds remain in the layout than the 0.55 rule left", () => {
    const sheds = L.LOTS.filter((l) => (l.kind === "house" || l.kind === "shop") && l.roof?.shape === "shed" && l.area >= 100 && l.src?.roof === "derived-resolved");
    const all = L.LOTS.filter((l) => (l.kind === "house" || l.kind === "shop") && l.src?.roof === "derived-resolved" && l.area >= 100);
    expect(sheds.length / Math.max(1, all.length)).toBeLessThan(0.1);
  });
});

// ------------------------------------------------------------------ 7. no dormant tan on roofs
describe("[r3:7] the early-spring dormant conversion is for ground, not for roofs and facades", async () => {
  const S = await import("../src/anime/core/season.js");
  test("klcSnowMix wraps the conversion in KLC_NO_DORMANT; patchSnow(.., noDormant) defines it; a plain patchSnow does not", () => {
    expect(S.SEASON_GLSL).toContain("#ifndef KLC_NO_DORMANT");
    expect(S.SEASON_GLSL).toContain("#endif");
    expect(S.SEASON_GLSL).toContain("klcSeasonGround");     // the ground conversion stays
    const sh = () => ({ uniforms: {}, fragmentShader: "#include <common>\n#include <lights_toon_fragment>" });
    const U = { value: [1, 0, 0, 0], extra: { value: [0, 1] } };
    const a = sh(), b = sh(); S.patchSnow(a, U, "vP", true); S.patchSnow(b, U, "vP");
    expect(a.fragmentShader).toContain("#define KLC_NO_DORMANT"); expect(b.fragmentShader).not.toContain("#define KLC_NO_DORMANT");
  });
  test("flat green gate: the old up-facing test (nW.y) does not decide it: the flat roof /367 has nW.y = 1 and stays green when the define is set", () => {
    const g = S.SEASON_GLSL, i = g.indexOf("#ifndef KLC_NO_DORMANT"), j = g.indexOf("#endif", i);
    expect(i).toBeGreaterThan(0); expect(g.slice(i, j)).toContain("uSeasonE.y");   // the whole early-spring block is inside
    expect(g.slice(j)).toContain("float w = uSeasonS.w * uSeasonE.x;");             // the snow part stays outside
  });
  test("materials: roofs, facades and building materials pass noDormant (keyed apart '-roof'); terrain and lawns do not", () => {
    const m = read("src/anime/core/materials.js");
    expect(m).toContain("noDormant: !!opts.noDormant"); expect(m).toContain("'paint-s-roof'"); expect(m).toContain("patchSnow(shader, uSeason, 'vPWorld', noDormant)");
    expect(read("src/anime/world/town/facade.js")).toContain("patchSnow(sh, seasonUniform(ctx.shared), 'vFacW', true)");
    const kit = read("src/anime/world/town/kit/tex.js");
    for (const k of ["kawara", "metal", "plaster", "siding", "tile", "concrete"]) expect(kit).toMatch(new RegExp(`${k}: vb\\(`));
    for (const k of ["lawn", "soil", "gravel", "asphalt", "paver"]) expect(kit).toMatch(new RegExp(`${k}: vc\\(`));   // ground keeps the dormant look
    expect(read("src/anime/world/environment/terrain.js")).toContain("klcSeasonGround(lc)");
    // batched copies keep the flag
    expect(read("src/anime/core/batch2.js")).toContain("opts.noDormant = true");
    expect(read("src/anime/world/explore/sbatch.js")).toContain("opts.noDormant = true");
  });
});

// ------------------------------------------------------------------ 8. zebras at their real place
describe("[r3:8] a hero arm's zebra and stop line follow `zebraAt`; nothing is removed", async () => {
  const SL = await import("../src/anime/world/town/streetlogic.js");
  const road = (o) => ({ id: "rZ", pts: [[0, 0], [100, 0]], width: 16, kind: "city", zone: "hero", ...o });
  const node = (r) => { const nodes = SL.roadNodes([r, { id: "rA", pts: [[0, 0], [0, 60]], width: 16 }, { id: "rB", pts: [[0, 0], [0, -60]], width: 16 }]); return [nodes, [...nodes.values()].find((n) => n.x === 0 && n.z === 0)]; };
  test("armZebraAt picks the arm whose arc length to the real position matches zebraAt (a short link has two arms); null without data", () => {
    const r = road(), [, n] = node(r);
    expect(SL.armZebraAt([], n, r, 0)).toBeNull();
    expect(SL.armZebraAt([{ x: 14, z: 0, road: "rZ", zebraAt: 14 }], n, r, 0)).toBe(14);
    expect(SL.armZebraAt([{ x: 14, z: 0, road: "rZ", zebraAt: 14 }], n, r, 1)).toBeNull();   // end 1 is the far end of the road: 86 m from (14, 0), not 14
    expect(SL.armZebraAt([{ x: 14, z: 0, road: "rOther", zebraAt: 14 }], n, r, 0)).toBeNull();
  });
  test("armPlan: the zebra centre sits at zebraAt (default R + 3.2), the stop line stays 4 m behind its centre, the arm is not removed", () => {
    const r = road(), [nodes, n] = node(r), arm = { r, end: 0 };
    const base = SL.armPlan(n, arm, 16, { nodes, hero: true }), moved = SL.armPlan(n, arm, 16, { nodes, hero: true, moved: [{ x: 21, z: 0, road: "rZ", zebraAt: 21 }] });
    expect(base.zebra.p.x).toBeCloseTo(n.R + 3.2, 1);
    expect(moved.zebra.p.x).toBeCloseTo(21, 1); expect(moved.zebra.s1 - moved.zebra.s0).toBe(4); expect((moved.zebra.s0 + moved.zebra.s1) / 2).toBe(21);
    expect(moved.gone).toBe(false); expect(moved.stopLine).toBe(true);
    expect(moved.zebra.s1 + 2 - base.zebra.s1 - 2).toBeCloseTo(21 - (n.R + 3.2), 5);   // the stop line moved with it
  });
  test("planMarkings: the ◇ marks and the zebra list follow the moved zebra; arrows stop at zebraAt + 4", () => {
    const r = road(), roads = [r, { id: "rA", pts: [[0, 0], [0, 60]], width: 16 }, { id: "rB", pts: [[0, 0], [0, -60]], width: 16 }];
    const a = SL.planMarkings({ roads, isHero: () => true }), b = SL.planMarkings({ roads, isHero: () => true, moved: [{ x: 25, z: 0, road: "rZ", zebraAt: 25 }] });
    const dz = (p) => p.diamonds.filter((q) => q.road === "rZ").map((q) => q.x);
    expect(dz(a).length).toBeGreaterThan(0); expect(dz(b).length).toBeGreaterThan(0);
    expect(Math.min(...dz(b))).toBeGreaterThan(Math.min(...dz(a)) + 5);   // the marks sit further from the node
  });
  test("schema and compile: `zebraAt` (4..80 m) is its own kind of crossing (not with remove / width / diamonds)", async () => {
    const { validateOverride, compileOverrides, crossingOverrides } = await import("../scripts/anime/enrich/fold.js");
    const doc = (c) => ({ version: 1, cell: "t", bbox: [0, 0, 100, 100], sources: [{ id: "earth", what: "t" }], crossings: [c] });
    const err = (c) => { try { validateOverride(doc(c), "t.json"); return ""; } catch (e) { return String(e.message); } };
    expect(err({ at: [40, 40], road: "r5", zebraAt: 12, src: "earth: z" })).toBe("");
    expect(err({ at: [40, 40], road: "r5", zebraAt: 2, src: "earth: z" })).toContain("zebraAt");
    expect(err({ at: [40, 40], road: "r5", zebraAt: 12, remove: true, src: "earth: z" })).toContain("zebraAt");
    const o = crossingOverrides(compileOverrides([validateOverride(doc({ at: [40.04, 40], road: "r5", zebraAt: 12.34, src: "earth: z" }), "t.json")]));
    expect(o.moved).toEqual([{ x: 40, z: 40, road: "r5", zebraAt: 12.3, ovr: "t.json#crossings/0" }]); expect(o.zebras).toEqual([]); expect(o.removed).toEqual([]);
  });
  test("no zebraAt is written where Earth and the app agree: at 神明崎 (-73,-30) and (-92.5,-98.5) every zebra was within 2 m of the app's once the buildings of the capture were aligned (the claimed 4-9 m were a registration shift of the Earth top), and the junctions whose geometry the app gets wrong stay unmoved until it is right", () => {
    const mv = L.CROSSING_OVR.moved;
    for (const id of ["r12605", "r12616", "r12617", "r12619", "r12674", "r12602", "r12600", "r12720", "r12696", "r12716"]) expect(mv.some((q) => q.road === id)).toBe(false);
    expect(Array.isArray(mv)).toBe(true);
  });
  test("streets.js passes the data on (armPlan, planMarkings)", () => {
    const s = read("src/anime/world/town/streets.js");
    expect(s).toContain("moved: MV"); expect(s).toContain("L.CROSSING_OVR?.moved");
    expect(read("src/anime/world/layout.js")).toContain("moved: []");
  });
});

// ------------------------------------------------------------------ 9 + 10. sidewalk strip, tactile paving colour, asphalt and paver brightness
describe("[r3:9][r3:10] hero sidewalks and asphalt", async () => {
  const s = read("src/anime/world/town/streets.js"), t = read("src/anime/world/town/sakura/street_textures.js");
  test("no continuous guide-bar strip along wide sidewalks any more (Earth shows none)", () => {
    expect(s).not.toContain("barsB"); expect(s).not.toContain("T.bars"); expect(s).not.toContain("town-tactile-bars");
    expect(t).not.toContain("const bars"); expect(t).not.toMatch(/st-bars/);
  });
  test("the tactile-dot texture is a pale beige-grey (#b3a99a / #bdb3a4), not Sakura yellow (#e2bb4d / #eecb5c)", () => {
    expect(t).toContain("#b3a99a"); expect(t).toContain("#bdb3a4"); expect(t).not.toContain("#e2bb4d"); expect(t).not.toContain("#eecb5c");
    const dots = t.slice(t.indexOf("const dots = T.draw"), t.indexOf("st-dots"));
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lab = (h) => { const [r, g, b] = hex(h); return { sat: Math.max(r, g, b) - Math.min(r, g, b) }; };
    expect(lab("#b3a99a").sat).toBeLessThan(30); expect(lab("#bdb3a4").sat).toBeLessThan(30);   // Earth's tactile pixels are #b8aca5 / #9e968a
    expect(dots).toContain("#b3a99a");
  });
  test("asphalt: ASPH_K is 0.85 on hero roads (it was 1.0: 4.4 L* too light), 0.84 on mid roads; the junction fan uses the same factor", async () => {
    const { ASPH_K } = await import("../src/anime/world/town/streets.js");
    expect(ASPH_K(true)).toBe(0.85); expect(ASPH_K(false)).toBe(0.84);
    expect(s).toContain("ASPH_K(hero)"); expect(s).not.toMatch(/\(hero \? 1 : 0\.84\)/); expect(s).not.toMatch(/dk = hero \? 1 : 0\.84/);
    // linear light: the render brightness of 0.85 vs 1.0 is 4 L* or so
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), Lstar = (y) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y);
    const base = 0.43 / 0.85; expect(Lstar(lin(base)) - Lstar(lin(base * 0.85))).toBeGreaterThan(3);
  });
  test("hero sidewalks use their own cool-grey paver material (#adaabe: R, G x0.83, B x1.02 linear), mid sidewalks keep #bcbbba", () => {
    expect(s).toContain("paversH: mat.toon('#adaabe'"); expect(s).toContain("pavers: mat.toon('#bcbbba'");
    expect(s).toContain("strip(paverH, K, lo +"); expect(s).toContain("strip(paverB, K, side < 0 ? -hw : cw");
    expect(s).toContain("add(paverH, M.paversH");
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), n = (h, i) => lin(parseInt(h.slice(i, i + 2), 16) / 255);
    const r = n("#adaabe", 1) / n("#bcbbba", 1), g = n("#adaabe", 3) / n("#bcbbba", 3), b = n("#adaabe", 5) / n("#bcbbba", 5);
    expect(r).toBeCloseTo(0.83, 1); expect(g).toBeCloseTo(0.83, 1); expect(b).toBeCloseTo(1.02, 1);
  });
});

// ------------------------------------------------------------------ 11. lane lines
describe("[r3:11] lane lines on a carriageway with several lanes", async () => {
  const { laneLines } = await import("../src/anime/world/town/streetlogic.js");
  test("laneLines: [2, 2] puts the centre at 0 and lane lines at +-cw / 2 (Earth peaks -2.3..-4 and +2.3); [2, 1] shifts the centre to -cw / 3; [1, 1] has no lane line", () => {
    const a = laneLines(5.2, [2, 2]);
    expect(a.centre).toBe(0); expect(a.lines).toEqual([-2.6, 2.6]); expect(a.laneW).toBe(2.6);
    const b = laneLines(6, [2, 1]);
    expect(b.centre).toBe(-2); expect(b.lines).toEqual([2]); expect(b.laneW).toBe(4);
    const c = laneLines(5.2, [1, 1]); expect(c.centre).toBe(0); expect(c.lines).toEqual([]);
    const d = laneLines(5.3, [3, 1]); expect(d.lines.length).toBe(2); expect(d.centre).toBeCloseTo(5.3 - 3 * (2 * 5.3) / 4, 2);
    // an [a, b] pair always spans the carriageway: the lanes' widths add up to 2 cw
    for (const [x, y] of [[1, 2], [2, 3], [3, 3], [4, 1]]) { const q = laneLines(5, [x, y]); expect(q.laneW * (x + y)).toBeCloseTo(10, 2); }
  });
  test("the layout: r12692 r12683 r12665 r12619 are 2 + 2 and r12602 is [2, 1] on a white-dashed centre; r12694 is left alone (its Earth peaks disagree)", () => {
    for (const id of ["r12692", "r12683", "r12665", "r12619"]) expect(L.roadById(id).markings).toEqual({ centre: "white-dashed", lanes: [2, 2] });
    expect(L.roadById("r12602").markings).toEqual({ centre: "white-dashed", lanes: [2, 1] });
    expect(L.roadById("r12694").markings).toBeUndefined();
  });
  test("streets.js draws them from laneLines; no arrows were guessed for r12692 (kinds cannot be read at the capture's resolution)", () => {
    const s = read("src/anime/world/town/streets.js");
    expect(s).toContain("laneLines(cw, mk.lanes)"); expect(s).toContain("(mk?.centre === 'white-dashed' || mk?.centre === 'white-solid') && mk.lanes");
    expect(L.CROSSING_OVR.arrows.some((a) => a.road === "r12692")).toBe(false);
  });
});

// ------------------------------------------------------------------ 12. far road bridges
describe("[r3:12] the far-zone road bridges get a deck", async () => {
  const R = await import("../src/anime/world/town/rivers.js");
  const HC = L.ZONES.hero;
  const chs = R.channels(L, { near: (x, z) => Math.hypot(x - HC.cx, z - HC.cz) < 3200, step: 4 });
  const bridges = L.ROADS.filter((r) => r.kind === "bridge");
  const X = R.crossings(bridges, chs);
  test("bridgeDeckY: a hero / mid crossing stays 2.3 m over the water; a far one is level at the lower approach height + 0.1 (never below the old deck)", () => {
    const c = { x: 0, z: 0, tx: 1, tz: 0, y: 0.08 };
    expect(R.bridgeDeckY(c, () => 4.5, 24, 10, false)).toBeCloseTo(2.38, 5);
    expect(R.bridgeDeckY(c, (x) => (x < 0 ? 4.3 : 9), 24, 10, true)).toBeCloseTo(4.4, 5);
    expect(R.bridgeDeckY(c, () => 0.5, 24, 10, true)).toBeCloseTo(2.38, 5);
  });
  test("r9949 over the 鹿折川 (and every far bridge that crosses a channel in the explore core) yields a crossing whose deck is at least the lower approach height", async () => {
    const T = await import("../src/anime/world/explore/tiles.js");
    const inCore = X.filter((c) => T.inCore(c.x, c.z));
    expect(inCore.length).toBeGreaterThan(5);
    const k = X.find((c) => c.road.id === "r9949"); expect(k).toBeTruthy();
    expect(Math.hypot(k.x - 1018, k.z + 775)).toBeLessThan(15);
    for (const c of inCore) {
      const half = c.span / 2 + 2.5, ramp = 10, far = c.road.zone === "far", g = (x, z) => L.heightAt(x, z);
      const deck = R.bridgeDeckY(c, g, half, ramp, far), lo = Math.min(g(c.x - c.tx * (half + ramp), c.z - c.tz * (half + ramp)), g(c.x + c.tx * (half + ramp), c.z + c.tz * (half + ramp)));
      if (far) expect(deck).toBeGreaterThanOrEqual(lo + 0.1 - 1e-9);
      expect(deck).toBeGreaterThanOrEqual(c.y + 2.3 - 1e-9);
    }
    const k2 = X.find((c) => c.road.id === "r9949"), half2 = k2.span / 2 + 2.5;
    expect(R.bridgeDeckY(k2, (x, z) => L.heightAt(x, z), half2, 10, true)).toBeGreaterThan(4.3);   // level with the approach roads (about 4.3-4.8 m), not 2.4 m
  });
  test("duplicates: two road ids of one named road within 15 m of one crossing give one deck (大川 x 気仙沼唐桑線 r13760 / r13790)", () => {
    const ch = { S: [{ x: -10, z: 0, wet: true, w: 20, y: 0, tz: 1, tx: 0 }, { x: 10, z: 0, wet: true, w: 20, y: 0, tz: 1, tx: 0 }] }, rd = (id, name, off) => ({ id, name, pts: [[0, -20 + off], [0, 20 + off]], width: 8 });
    ch.S = [{ x: -30, z: 0, wet: true, w: 20, y: 0, tx: 1, tz: 0 }, { x: 30, z: 0, wet: true, w: 20, y: 0, tx: 1, tz: 0 }];
    expect(R.crossings([rd("a", "X線", 0), rd("b", "X線", 0)], [ch]).length).toBe(1);   // same name: one
    expect(R.crossings([rd("a", "X線", 0), rd("b", "Y線", 0)], [ch]).length).toBe(2);   // different names: both
    const n13760 = L.roadById("r13760"), n13790 = L.roadById("r13790");
    if (n13760 && n13790) expect(n13760.name).toBe(n13790.name);
  });
  test("index.js hands the far bridge roads to buildRivers only (not to roadIdx, streets or signals) and widens only their crossings", () => {
    const s = read("src/anime/world/town/index.js");
    expect(s).toContain("r.zone === 'far' && r.kind === 'bridge'"); expect(s).toContain("roads: roads.concat(farBridges)"); expect(s).toContain("bridgeDetail:");
    expect(s).toContain("const roadIdx = makeRoadIndex(roads);");
    expect(read("src/anime/world/town/rivers.js")).toContain("(bridgeDetail || detail)(c.x, c.z)");
  });
});

// ------------------------------------------------------------------ 13. 北野神社
describe("[r3:13] the 北野神社 polygon is the compound, not the hillside", async () => {
  const O = await import("../scripts/anime/enrich/osm.js");
  test("PRECINCT_FIX clips only w761768594 to the compound round the hall; 八幡神社 and 光明寺 are left as mapped", () => {
    expect(Object.keys(O.PRECINCT_FIX)).toEqual(["w761768594"]);
    const fx = O.PRECINCT_FIX.w761768594, xs = fx.ring.map((p) => p[0]), zs = fx.ring.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-992); expect(Math.max(...xs)).toBeGreaterThanOrEqual(-930); expect(Math.min(...zs)).toBeLessThanOrEqual(-252); expect(Math.max(...zs)).toBeGreaterThanOrEqual(-188);
    expect((Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))).toBeLessThan(6000);   // not 17,127 m2
    expect(fx.keepOsm).toEqual(["w775151444", "w775151445", "w775151446", "w775151447"]);
    expect(fx.at[0]).toEqual([-959, -232]); expect(fx.near).toBe(30);
  });
  test("parseOsm replaces the ring of the site and of the landuse; a place_of_worship polygon with another id keeps its outline", () => {
    const ll = (x, z) => ({ lat: 38.906 - z / 111014, lon: 141.575 + x / 86744 });
    const way = (id, pts) => ({ type: "way", id, tags: { amenity: "place_of_worship", name: "T" + id, religion: "shinto" }, geometry: pts.map(([x, z]) => ll(x, z)) });
    const hill = [[-1009, -474], [-854, -474], [-854, -182], [-1009, -182], [-1009, -474]], other = [[0, 0], [90, 0], [90, 80], [0, 80], [0, 0]];
    const out = O.parseOsm({ elements: [way(761768594, hill), way(5, other)] });
    const area = (r) => Math.abs(O.ringArea(r));
    const s1 = out.sites.find((s) => s.osm === "w761768594"), s2 = out.sites.find((s) => s.osm === "w5"), l1 = out.landuse.find((l) => l.osm === "w761768594"), l2 = out.landuse.find((l) => l.osm === "w5");
    expect(area(s1.ring)).toBeLessThan(6000); expect(area(l1.ring)).toBeLessThan(6000); expect(area(s2.ring)).toBeGreaterThan(6500); expect(area(l2.ring)).toBeGreaterThan(6500);
  });
  test("the layout: no landuse polygon of the hill remains, only the footprints near the hall carry the name and kind shrine, and the hall's lots still exist", () => {
    const rel = L.LANDUSE.filter((u) => u.cls === "religious" && u.name === "北野神社");
    for (const u of rel) { let a = 0; const r = u.ring; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } expect(Math.abs(a) / 2).toBeLessThan(6000); }
    const named = L.LOTS.filter((l) => l.name === "北野神社" && l.obb.cx < -800 && l.obb.cx > -1100);
    expect(named.length).toBeGreaterThan(2); expect(named.length).toBeLessThan(11);
    for (const l of named) expect(Math.hypot(l.obb.cx + 959, l.obb.cz + 232)).toBeLessThan(60);
    expect(lot("16/58538/25067/480")?.name).not.toBe("北野神社");   // the house up the hill is a house again
  });
});

// ------------------------------------------------------------------ 14. search
describe("[r3:14] kind search", async () => {
  const { createSearch, KINDS } = await import("../src/anime/world/explore/search.js");
  const S = createSearch(L, { near: () => [0, 0] });
  test("教会 lists churches only: no 青龍寺 or 愛宕神社; the Hope Center (a church that is not called one) is found", () => {
    const r = S.find("教会", 40);
    expect(r.length).toBeGreaterThanOrEqual(5);
    for (const it of r) expect(/寺|神社/.test(it.ja)).toBe(false);
    expect(r.some((it) => /ホープセンター/.test(it.ja))).toBe(true); expect(r.some((it) => it.ja === "カトリック気仙沼教会")).toBe(true);
  });
  test("寺: the first 10 hits are temples, no 小野寺 businesses among them; 神社 lists shrines", () => {
    const r = S.find("寺", 40);
    for (const it of r.slice(0, 10)) expect(/小野寺/.test(it.ja)).toBe(false);
    expect(r.slice(0, 10).every((it) => /寺|院|堂/.test(it.ja))).toBe(true);
    const ono = r.findIndex((it) => /小野寺/.test(it.ja)); if (ono >= 0) expect(ono).toBeGreaterThan(10);
    for (const it of S.find("神社", 20).slice(0, 10)) expect(/神社|大明神|稲荷|宮|社/.test(it.ja)).toBe(true);
  });
  test("ガソリンスタンド / ガソリン / 給油 find the petrol stations; 銭湯 / 温泉 / お風呂 find the baths; トイレ the toilets", () => {
    expect(S.find("ガソリンスタンド", 3).every((it) => it.cat === "fuel")).toBe(true);
    expect(S.find("ガソリンスタンド", 30).length).toBeGreaterThanOrEqual(10);
    expect(S.find("給油", 5).length).toBeGreaterThan(0);
    expect(S.find("銭湯").some((it) => it.ja === "亀の湯")).toBe(true);
    expect(S.find("お風呂").some((it) => /鶴亀の湯|友の湯/.test(it.ja))).toBe(true);
    expect(S.find("温泉").length).toBeGreaterThan(0);
    expect(S.find("トイレ").length).toBeGreaterThan(0);
  });
  test("KINDS entries may carry a name test applied to place_of_worship only; a one-character kind word is not skipped but reranked after the kind hits", () => {
    expect(KINDS.find(([w]) => w.includes("教会"))[2]).toBeInstanceOf(RegExp);
    expect(KINDS.find(([w]) => w.includes("教会"))[1].test("place_of_worship")).toBe(false);
    const src = read("src/anime/world/explore/search.js");
    expect(src).toContain("s = 3.5"); expect(src).toContain("KIND_WORD_1");
    const r = S.find("寺", 200);
    expect(r.some((it) => /長命寺|地福寺/.test(it.ja)) || r.length > 30).toBe(true);   // the substring hits are still there, only later
  });
});

// ------------------------------------------------------------------ 17. the app's sun in the Earth pairs
describe.skipIf(!HAVE_EARTH_TOOL)("[r3:17] the app half of an Earth pair is lit like the imagery", async () => {
  const E = HAVE_EARTH_TOOL ? await import("../tools/anime/earth-ref.mjs") : null;
  test("earthSunHours: about 10.4 h on the demo day, shadow bearing 340 (12:00 gave 14: 34 degrees off); an explicit --hours (even 0) is honoured", () => {
    const s = E.earthSunHours();
    expect(s.hours).toBeGreaterThan(10.2); expect(s.hours).toBeLessThan(10.6);
    expect(Math.abs(s.shadowBearing - E.EARTH_SCENE.shadowBearing)).toBeLessThan(1);
    expect(Math.abs(s.el - E.EARTH_SCENE.sunElev)).toBeLessThan(2.5);
    expect(E.appHoursFor(undefined)).toBe(s.hours); expect(E.appHoursFor(0)).toBe(0); expect(E.appHoursFor("12")).toBe("12");
    const twelve = L.sunPosition(12, L.DEMO_DOY); expect(Math.abs((((twelve.az + 180) % 360) - 340 + 540) % 360 - 180)).toBeGreaterThan(30);
  });
  test("earth-ref.mjs and zz-meta-sweep.mjs use it; the GSI audit (accuracy.mjs) is left at 12:00 (it scores plan geometry and colour, no shadow of the photo)", () => {
    expect(read("tools/anime/earth-ref.mjs")).toContain("hours: String(appHoursFor(args.hours))");
    expect(read("tools/anime/earth-ref.mjs")).toContain("meta.scene = { ...EARTH_SCENE, appSun");
    expect(read("tools/anime/zz-meta-sweep.mjs")).toContain("appHoursFor(args.hours)");
    expect(read("tools/anime/accuracy.mjs")).toContain("hours: String(args.hours || 12)");
  });
});

// ------------------------------------------------------------------ 18. the OSM extract is fresh
describe("[r3:18] the OSM extract's database is not months behind its fetch date", async () => {
  const F = await import("../scripts/anime/enrich/fetch-osm.js");
  test("overpass-api.de (the live database) is tried first; the lag helpers", () => {
    expect(F.MIRRORS[0]).toBe("https://overpass-api.de/api/interpreter"); expect(F.MAX_LAG_DAYS).toBe(3);
    const now = Date.parse("2026-10-05T00:00:00Z");
    expect(F.osmLagMs({ osm3s: { timestamp_osm_base: "2026-10-04T22:33:21Z" } }, now)).toBeLessThan(3 * 3600e3);
    expect(F.osmLagMs({}, now)).toBeNull();
    expect(F.isStaleLag(null)).toBe(true); expect(F.isStaleLag(2 * 86400e3)).toBe(false); expect(F.isStaleLag(3.5 * 86400e3)).toBe(true);
    expect(F.metaLagDays({ osmBase: "2026-05-06T03:25:00Z", fetched: "2026-09-30T03:45:00Z" })).toBe(147);   // the stale extract of 2026-09-30
    expect(F.metaLagDays({})).toBeNull();
  });
  test("fetchOsm: a stale mirror is skipped for the next; if every mirror is stale the freshest result is kept with a warning (never no data)", async () => {
    const real = globalThis.fetch, logs = [], wrote = [], realWrite = Bun.write;
    const answer = (base) => ({ ok: true, text: async () => JSON.stringify({ osm3s: { timestamp_osm_base: base }, elements: Array.from({ length: 1200 }, (_, i) => ({ type: "node", id: i })) }) });
    const bases = { "https://stale.test/a": "2026-05-06T03:25:00Z", "https://stale.test/b": "2026-08-01T00:00:00Z", "https://fresh.test/c": new Date().toISOString() };
    globalThis.fetch = async (url) => answer(bases[url]);
    Bun.write = async (f, t) => { wrote.push([String(f), t]); return 0; };
    try {
      let r = await F.fetchOsm({ force: true, log: (m) => logs.push(m), mirrors: ["https://stale.test/a", "https://fresh.test/c"] });
      expect(r.mirror).toBe("https://fresh.test/c"); expect(logs.some((m) => /STALE/.test(m))).toBe(true);
      logs.length = 0;
      r = await F.fetchOsm({ force: true, log: (m) => logs.push(m), mirrors: ["https://stale.test/a", "https://stale.test/b"] });
      expect(r.mirror).toBe("https://stale.test/b"); expect(logs.some((m) => /WARNING every mirror is stale/.test(m))).toBe(true);
    } finally { globalThis.fetch = real; Bun.write = realWrite; }
  });
  test("the committed extract record (data/anime/sources.json): osmBase is within 3 days of the fetch date; raw/ is absent on CI, so nothing there is read", () => {
    const S = JSON.parse(read("data/anime/sources.json"));
    expect(Date.parse(S.osmBase)).toBeGreaterThan(Date.parse("2026-09-01"));
    if (!S.osmFetched) { console.warn("[r3:18] sources.json has no osmFetched: re-run build-enrich.js"); return; }
    const lag = (Date.parse(S.osmFetched) - Date.parse(S.osmBase)) / 86400e3;
    expect(lag).toBeLessThanOrEqual(3); expect(lag).toBeGreaterThanOrEqual(-0.1);
  });
});

// ------------------------------------------------------------------ 19. accuracy coverage
describe("[r3:19] the accuracy audit says what it scored", async () => {
  const A = await import("../tools/anime/accuracy-lib.mjs");
  const cells = { pier7: { bbox: [-40, -10, 140, 170] }, c1: { bbox: [0, 0, 100, 100] }, c2: { bbox: [100, 0, 200, 100] } };
  test("cellIdAt: the first accuracy cell holding the point (half-open), pier7 left out", () => {
    expect(A.cellIdAt(cells, 50, 50)).toBe("c1"); expect(A.cellIdAt(cells, 100, 50)).toBe("c2"); expect(A.cellIdAt(cells, 0, 0)).toBe("c1"); expect(A.cellIdAt(cells, 500, 5)).toBeNull();
    expect(A.cellIdAt(cells, 0, 100)).toBeNull(); expect(A.cellIdAt(cells, 20, 20, { skip: [] })).toBe("pier7");
  });
  test("cellCoverage: footprint and area share scored per cell and overall", () => {
    const items = [{ cx: 10, cz: 10, area: 100 }, { cx: 60, cz: 60, area: 300 }, { cx: 150, cz: 50, area: 100 }, { cx: 160, cz: 50, area: 100 }, { cx: 900, cz: 9, area: 50 }];
    const r = A.cellCoverage(cells, items, (it) => it.cx < 100);
    expect(r.cells.c1).toEqual({ n: 2, scored: 2, share: 1, area: 400, areaScored: 400, areaShare: 1 });
    expect(r.cells.c2).toEqual({ n: 2, scored: 0, share: 0, area: 200, areaScored: 0, areaShare: 0 });
    expect(r.all.n).toBe(4); expect(r.all.scored).toBe(2); expect(r.all.areaShare).toBeCloseTo(0.667, 3);
    expect(A.shareOf(1, 3)).toBe(0.333); expect(A.shareOf(1, 0)).toBeNull();
  });
  test("accuracy.mjs writes cells[id].coverage and the top-level coveredShare (buildings, roofs, roads, heights), labels the core headline, and documents --region ortho", () => {
    const t = read("tools/anime/accuracy.mjs");
    expect(t).toContain("coveredShare"); expect(t).toContain("cells: cellsReport"); expect(t).toContain("coverage: {"); expect(t).toContain("core-only"); expect(t).toContain("--region ortho");
    for (const k of ["buildings: { coveredShare", "roofs: {\n    coveredShare", "roads: { coveredShare", "heights: { coveredShare"]) expect(t).toContain(k);
  });
});
