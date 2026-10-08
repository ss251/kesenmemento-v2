// [sys:r2] Systemic fixes, round 2: one regression test per fix (item numbers = the SYSTEMIC FIX round 2 list).
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const json = (p) => JSON.parse(read(p));
// the Earth capture tool (tools/anime/earth-ref.mjs) is not part of the public repository: the tests that read it skip without it
const HAVE_EARTH_TOOL = existsSync(new URL("../tools/anime/earth-ref.mjs", import.meta.url));
const testE = test.skipIf(!HAVE_EARTH_TOOL);
const layout = json("data/anime/layout.json");
const lotById = new Map(layout.lots.map((l) => [l.id, l]));

describe("[r2:1] a vanished building is removed, never recoloured; the presence flag", () => {
  const GONE = { c2: ["16/58541/25067/217"], c3: ["16/58541/25067/289", "16/58541/25067/290"], c10: ["16/58540/25069/256", "16/58540/25069/257"] };
  test("the five lots are `remove: true` with no roof key in their override files, and not in the layout", () => {
    for (const [cell, ids] of Object.entries(GONE)) {
      const f = json(`data/anime/overrides/${cell}.json`);
      for (const id of ids) {
        const ops = f.lots.filter((o) => o.id === id);
        expect(ops.length).toBeGreaterThan(0);
        for (const o of ops) { expect(o.remove).toBe(true); expect(o.roof).toBeUndefined(); expect(o.src.length).toBeGreaterThan(10); }
        expect(lotById.has(id)).toBe(false);
      }
    }
  });
  testE("bandSamples: the samples lie on the edge and up to 1.5 m inside, whichever way the ring winds", async () => {
    const { bandSamples } = await import("../tools/anime/earth-ref.mjs");
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
    for (const ring of [sq, sq.slice().reverse()]) {
      const P = bandSamples(ring);
      expect(P.length).toBeGreaterThan(80);
      expect(P.every(([x, z]) => x >= -1e-6 && x <= 10 + 1e-6 && z >= -1e-6 && z <= 10 + 1e-6)).toBe(true);   // never outside the polygon
      expect(P.some(([x, z]) => Math.abs(x - 1.5) < 1e-6 || Math.abs(z - 1.5) < 1e-6)).toBe(true);           // reaches 1.5 m in
    }
  });
  testE("edgeBandRatio: an outlined building scores high, a flat patch scores about 0; null without a median", async () => {
    const { edgeBandRatio } = await import("../tools/anime/earth-ref.mjs");
    const ring = [[20, 20], [40, 20], [40, 40], [20, 40]];
    const edge = (x, z) => (Math.abs(x - 20) < 1 || Math.abs(x - 40) < 1 || Math.abs(z - 20) < 1 || Math.abs(z - 40) < 1 ? 30 : 5);
    expect(edgeBandRatio(edge, ring, 5)).toBeGreaterThan(2);
    expect(edgeBandRatio(() => 5, ring, 5)).toBeCloseTo(1, 1);
    expect(edgeBandRatio(() => 0.2, ring, 5)).toBeLessThan(0.1);
    expect(edgeBandRatio(edge, ring, 0)).toBeNull();
    expect(edgeBandRatio(() => null, ring, 5)).toBeNull();
  });
  testE("presenceFlag: CHECK-GONE when gsi >= 1.6 and earth <= 1.35 (edges inclusive), else null", async () => {
    const { presenceFlag, PRESENCE } = await import("../tools/anime/earth-ref.mjs");
    expect(PRESENCE.gsiMin).toBe(1.6); expect(PRESENCE.earthMax).toBe(1.35);
    expect(presenceFlag(1.6, 1.35)).toBe("CHECK-GONE");
    expect(presenceFlag(3, 0.4)).toBe("CHECK-GONE");
    expect(presenceFlag(1.59, 0.4)).toBeNull();
    expect(presenceFlag(3, 1.36)).toBeNull();
    expect(presenceFlag(null, 0.4)).toBeNull(); expect(presenceFlag(3, null)).toBeNull();
  });
  testE("earth-ref writes presence into the legend and meta, marks the lot in top_annot, and says it is advisory; OVERRIDES.md step 2 has the rule", () => {
    const t = read("tools/anime/earth-ref.mjs"), d = read("docs/anime/OVERRIDES.md");
    expect(t).toContain("g.presence = { gsi, earth, flag }"); expect(t).toContain("meta.presence ="); expect(t).toContain("l.presenceFlag");
    expect(t).toContain("CHECK-GONE"); expect(t).not.toContain("GONE?"); expect(t).toContain("ADVISORY");
    expect(d).toContain("a CHECK-GONE lot, and any lot whose polygon is flat in the Earth top, must be checked on o0 and o180 (or a ground photo) before a roof");
    expect(d).toContain("write `remove: true`, never a recolour");
  });
});

describe("[r2:2][r2:4] derived heights follow the footprint; wall-less sheds are roofs on posts", () => {
  const cls = async (o) => { const { classifyLot } = await import("../scripts/anime/derive.js"); return classifyLot({ id: "x/1/2/3", code: 3101, area: 100, h: 5, zone: "mid", shore: -300, front: null, ...o }); };
  test("GSI 3111 / 3112 under 100 m2: 1 storey at the GSI eave height clamped to 3.0-3.8 m (3.4 without one), shed, wallless", async () => {
    for (const code of [3111, 3112]) {
      for (const [A, h, want] of [[7, 3.09, 3.1], [40, 2.2, 3.0], [60, 5.5, 3.8], [99, 0, 3.4], [30, undefined, 3.4]]) {
        const c = await cls({ code, area: A, h });
        expect(c.kind).toBe("warehouse"); expect(c.storeys).toBe(1); expect(c.height).toBe(want); expect(c.roofShape).toBe("shed"); expect(c.wallless).toBe(true);
      }
    }
  });
  test("a wall-less shed of 100 m2 or more keeps the old warehouse rule (reviewed one by one against Earth), and is not flagged", async () => {
    const c = await cls({ code: 3111, area: 133, h: 3.2 });
    expect(c.wallless).toBeUndefined(); expect(c.height).toBeGreaterThanOrEqual(5.5);
  });
  test("school / public / office under 25 m2 are 1 storey and at most 3.5 m; apartment at most 5.8 m; factory under 100 m2 at most 6 m", async () => {
    for (const kind of ["school", "public", "office"]) { const c = await cls({ tag: kind, area: 20, h: 12 }); expect(c.storeys).toBe(1); expect(c.height).toBeLessThanOrEqual(3.5); }
    for (const kind of ["school", "public", "office"]) { const c = await cls({ tag: kind, area: 200, h: 12 }); expect(c.height).toBeGreaterThan(5); }   // bigger ones unchanged
    expect((await cls({ tag: "apartment", area: 20 })).height).toBeLessThanOrEqual(5.8);
    const f = await cls({ tag: "factory", area: 60 }); expect(f.storeys).toBe(1); expect(f.height).toBeLessThanOrEqual(6);
    expect((await cls({ tag: "factory", area: 400 })).height).toBeGreaterThan(7);   // 100 m2 and over: unchanged
  });
  test("shop, house, temple and shrine are never capped; the photo-survey box (legacy) keeps the old values", async () => {
    const { classifyLot } = await import("../scripts/anime/derive.js");
    for (const kind of ["shop", "house", "temple", "shrine"]) { const a = await cls({ tag: kind, area: 20 }); const b = classifyLot({ id: "x/1/2/3", code: 3101, area: 20, h: 5, zone: "mid", shore: -300, front: null, tag: kind, legacy: true }); expect(a).toEqual(b); }
    const old = classifyLot({ id: "x/1/2/3", code: 3111, area: 7, h: 3.1, zone: "hero", shore: -300, front: null, legacy: true });
    expect(old.height).toBeGreaterThanOrEqual(5.5); expect(old.wallless).toBeUndefined();
  });
  test("no new random draw: warehouse / factory / school above the thresholds are byte-identical to the old formulas", async () => {
    const { classifyLot, hash32, mulberry } = await import("../scripts/anime/derive.js");
    const id = "16/58541/25067/999", r = mulberry(hash32(id + "#kind"));
    const c = classifyLot({ id, code: 3101, area: 800, h: 8, zone: "mid", shore: -300, front: null, tag: "warehouse" });
    expect(c.height).toBe(Math.round(Math.min(11, 5.5 + Math.sqrt(800) * 0.08 + r() * 1.5) * 10) / 10);
  });
  test("layout: no derived lot of those kinds is out of range; override heights, kinds and the survey box did not move", () => {
    const rows = layout.farLots.rows, F = layout.farLots;
    const all = layout.lots.map((l) => ({ id: l.id, kind: l.kind, area: l.area, height: l.height, h: l.src?.h, x: l.obb.cx, z: l.obb.cz, w: l.wallless }))
      .concat(rows.map((r) => ({ id: r[0], kind: F.kinds[r[9]], area: r[13], height: r[7], h: F.srcs[r[14]].split("/")[0], x: r[1], z: r[2] })));
    const wl = all.filter((l) => l.kind === "warehouse" && l.h === "derived" && l.height <= 4.5);
    expect(wl.length).toBeGreaterThan(2000);
    for (const l of wl) expect(l.area).toBeLessThan(100);
    for (const l of all) if (l.h === "derived" && l.kind === "warehouse" && l.area < 100 && l.height <= 4.5 && l.x < 200 && l.x > -80 && l.z > 0 && l.z < 140) throw new Error("survey box lot changed " + l.id);
    expect(all.filter((l) => l.h === "derived" && l.kind === "school" && l.area < 25 && l.height > 3.5).length).toBe(0);
    expect(all.filter((l) => l.h === "derived" && l.kind === "factory" && l.area < 100 && l.height > 6).length).toBe(0);
    // flagged lots in hero / mid carry wallless: true and are low warehouses
    for (const l of layout.lots.filter((l) => l.wallless)) { expect(l.kind).toBe("warehouse"); expect(l.height).toBeLessThanOrEqual(4.5); if (l.src.roof.startsWith("derived")) expect(l.roof.shape).toBe("shed"); }   // a measured (aerial / OSM) shape stays
    expect(layout.lots.filter((l) => l.wallless).length).toBeGreaterThan(100);
  });
  test("walllessOf: the flag, or a far derived warehouse no taller than 4.5 m; a normal warehouse, an override and a landmark are not", async () => {
    const { walllessOf } = await import("../src/anime/world/town/openshed.js");
    expect(walllessOf({ wallless: true })).toBe(true);
    expect(walllessOf({ kind: "warehouse", height: 3.1, src: { h: "derived" } })).toBe(true);
    expect(walllessOf({ kind: "warehouse", height: 6.4, src: { h: "derived" } })).toBe(false);
    expect(walllessOf({ kind: "warehouse", height: 3.1, src: { h: "override" } })).toBe(false);
    expect(walllessOf({ kind: "warehouse", height: 3.1, src: { h: "derived" }, landmark: "marketShed" })).toBe(false);
    expect(walllessOf({ kind: "house", height: 3.1, src: { h: "derived" } })).toBe(false);
  });
  test("openShedPlan: the slab runs across the short axis, posts at every corner and at most 4.5 m apart, the slab is one thin roof, no walls", async () => {
    const { openShedPlan, SHED } = await import("../src/anime/world/town/openshed.js");
    const p = openShedPlan(17, 2.3, 3.4, 1);
    expect(p.alongX).toBe(true); expect(p.L).toBe(17); expect(p.D).toBe(2.3);
    expect(p.yLow).toBe(3.4); expect(p.rise).toBeGreaterThan(0); expect(p.rise).toBeLessThanOrEqual(SHED.maxRise); expect(p.t).toBeLessThan(0.2);
    expect(p.posts.length).toBeGreaterThanOrEqual(8);
    const lowSide = p.posts.filter((q) => q.b > 0), highSide = p.posts.filter((q) => q.b < 0);
    expect(lowSide.length).toBe(highSide.length);
    expect(Math.max(...lowSide.map((q) => q.y1))).toBeCloseTo(3.4 - p.t, 5);
    const as = lowSide.map((q) => q.a).sort((a, b) => a - b); for (let i = 1; i < as.length; i++) expect(as[i] - as[i - 1]).toBeLessThanOrEqual(SHED.pitch + 1e-6);
    const q = openShedPlan(3, 9, 3.0, -1); expect(q.alongX).toBe(false); expect(q.L).toBe(9); expect(q.posts.length).toBeGreaterThanOrEqual(6);
  });
  test("mid.js and industrial.js draw them as a roof on posts and fold.js does not raise them to 5.5 m", () => {
    for (const f of ["src/anime/world/town/mid.js", "src/anime/world/town/industrial.js"]) { const t = read(f); expect(t).toContain("walllessOf(lot)"); expect(t).toContain("openShedPlan"); }
    expect(read("scripts/anime/enrich/fold.js")).toContain("base.wallless");
  });
});

describe("[r2:7] no default yellow centre line on wide hero roads", () => {
  const st = read("src/anime/world/town/streets.js");
  const mark = st.slice(st.indexOf("function markCentre"), st.indexOf("function hatchedMedian"));
  test("markCentre has no `solid` rule and paints YEL only for an override's markings.centre 'yellow'", () => {
    expect(mark).not.toContain("const solid");
    expect(mark).not.toContain("solid && !mk");
    expect(mark).not.toContain("cw * 2 >= 8.5");
    const yel = mark.split("\n").filter((l) => l.includes("YEL"));
    expect(yel.length).toBe(1);
    expect(yel[0]).toContain("mk.centre === 'yellow'");
  });
  test("everything else falls through to the white dashes (5 m on, 5 m off)", () => {
    expect(mark).toContain("dashSamples(S, keepS)");
    expect(mark).toContain("() => WHITE)");
  });
  test("OVERRIDES.md no longer says that hero carriageways of 8.5 m or more get a yellow line", () => {
    const d = read("docs/anime/OVERRIDES.md");
    expect(d).not.toContain("a yellow\n  solid line on hero carriageways of 8.5 m or more");
    expect(d).toContain("no default yellow solid line");
  });
});

describe("[r2:8] vacant weeds: dormant colour driven by the season preset", () => {
  const fakeCtx = () => { const cache = new Map(); return { mat: { toon: (c, o) => { const k = JSON.stringify(o); if (!cache.has(k)) { const m = { userData: {}, defines: {}, onBeforeCompile: (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <lights_toon_fragment>", "{ diffuseColor.rgb = klcSnowMix(diffuseColor.rgb, klcNW, vPWorld); }\n#include <lights_toon_fragment>"); }, customProgramCacheKey: () => "paint-s" }; cache.set(k, m); } return cache.get(k); } } }; };
  const FS = "#include <common>\nuniform vec2 uSeasonE;\nvoid main(){ vec4 diffuseColor = vec4(1.0);\n#include <lights_toon_fragment>\n}";
  test("LOOK.weeds stays #7d8556 (summer and autumn keep their olive); the dry look is a separate constant", async () => {
    const { LOOK, DRY_WEEDS, DRY_WEEDS_RENDER } = await import("../src/anime/world/town/landuse.js");
    expect(LOOK.weeds.col).toBe("#7d8556");
    expect(DRY_WEEDS).toBe("#7c6e71"); expect(DRY_WEEDS_RENDER).toBe("#857679");
  });
  test("the weeds material mixes toward the dry colour by uSeasonE.y after the snow / dormant step, and only there", async () => {
    const { dryWeedsMaterial } = await import("../src/anime/world/town/landuse.js");
    const ctx = fakeCtx(), m = dryWeedsMaterial(ctx);
    const sh = { uniforms: {}, fragmentShader: FS, vertexShader: "" };
    m.onBeforeCompile(sh);
    expect(sh.uniforms.uDryCol.value.r).toBeGreaterThan(0.1);   // a THREE.Color (linear)
    expect(sh.fragmentShader).toContain("uniform vec3 uDryCol;");
    const iSnow = sh.fragmentShader.indexOf("klcSnowMix"), iMix = sh.fragmentShader.indexOf("mix(diffuseColor.rgb, uDryCol, clamp(uSeasonE.y, 0.0, 1.0))"), iLights = sh.fragmentShader.indexOf("#include <lights_toon_fragment>");
    expect(iSnow).toBeGreaterThan(-1); expect(iMix).toBeGreaterThan(iSnow); expect(iLights).toBeGreaterThan(iMix);
    expect(m.customProgramCacheKey()).toContain("dry-weeds"); expect("USE_CUSTOM" in m.defines).toBe(true);
    // a material without a season uniform is left alone
    const sh2 = { uniforms: {}, fragmentShader: "#include <common>\n#include <lights_toon_fragment>", vertexShader: "" };
    dryWeedsMaterial(fakeCtx()).onBeforeCompile(sh2);
    expect(sh2.fragmentShader).not.toContain("uDryCol");
    // the same material is reused, not wrapped twice
    expect(dryWeedsMaterial(ctx)).toBe(m);
  });
  test("buildLanduse paints weeds into their own mesh with that material, the other classes into the shared one", () => {
    const t = read("src/anime/world/town/landuse.js");
    expect(t).toContain("DB[dryClassOf(lu)] || S");
    expect(t).toContain("mk(DB[k], dryMaterial(ctx, k), 'landuse-' + k + '-dry')");
    expect(t).toContain("mk(S, surfMat, 'landuse-surfaces')");
  });
});

describe("[r2:9] early-spring grass and field are darker and browner", () => {
  const src = read("src/anime/core/season.js");
  const fn = src.slice(src.indexOf("vec3 klcSeasonGround"), src.indexOf("// winter snow: up-facing"));
  test("greenness comes from the original colour c, and darkens win in linear space by the early preset", () => {
    expect(fn).toContain("float gr = smoothstep(0.015, 0.06, c.g - max(c.r, c.b));");
    expect(fn).toContain("win *= mix(vec3(1.0), vec3(0.46, 0.40, 0.58), gr * uSeasonE.y);");
    // after the dormant mix, before the season blend; the gate is not computed from win
    expect(fn.indexOf("win *= mix(")).toBeGreaterThan(fn.indexOf("mix(win, mix(c, vec3(l), 0.7)"));
    expect(fn.indexOf("win *= mix(")).toBeLessThan(fn.indexOf("return c * uSeasonS.z"));
    expect(fn).not.toContain("win.g - max");
  });
  test("summer and autumn terms and klcSnowMix are unchanged", () => {
    expect(fn).toContain("return c * uSeasonS.z + spr * uSeasonS.x + sum * uSeasonS.y + win * uSeasonS.w;");
    expect(fn).toContain("vec3 sum = c * vec3(0.72, 1.06, 0.70);");
    expect(src).toContain("albedo = mix(albedo, vec3(lg) * vec3(1.25, 1.0, 0.68), gr * uSeasonE.y * 0.85);");
  });
  test("the factors are the Earth / app median ratios in linear light: grass 0.50 / 0.41 / 0.57, field 0.42 / 0.38 / 0.59; 0.46 / 0.40 / 0.58 sits between", () => {
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), c = (h) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
    const ratio = (e, a) => { const E = c(e), A = c(a); return E.map((v, i) => v / A[i]); };
    const grass = ratio("#746a6f", "#a09f90"), field = ratio("#867c7e", "#c7c2a1"), shared = [0.46, 0.40, 0.58];
    [0.50, 0.41, 0.57].forEach((v, i) => expect(Math.abs(grass[i] - v)).toBeLessThan(0.02));
    [0.42, 0.38, 0.59].forEach((v, i) => expect(Math.abs(field[i] - v)).toBeLessThan(0.02));
    shared.forEach((v, i) => { expect(v).toBeGreaterThanOrEqual(Math.min(grass[i], field[i]) - 0.01); expect(v).toBeLessThanOrEqual(Math.max(grass[i], field[i]) + 0.01); });
  });
});

describe("[r2:10] parking, gravel and park colours follow the Earth medians", () => {
  test("LOOK parking #797577 and gravel #837b7a (all seasons), LOOK.park keeps the summer / autumn lawn", async () => {
    const { LOOK } = await import("../src/anime/world/town/landuse.js");
    expect(LOOK.parking.col).toBe("#797577"); expect(LOOK.gravel.col).toBe("#837b7a"); expect(LOOK.park.col).toBe("#8f9a6a");
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    // the parking colour has no blue cast: the old #8e9197 had b - r = 9, #787a82 would still be bluer than Earth
    const [r, g, b] = rgb(LOOK.parking.col); expect(b - r).toBeLessThanOrEqual(2); expect(g).toBeLessThan(r);
    // render gain (1.06, 1.06, 1.09) lands at the Earth median (128, 124, 130) within 3 per channel
    const gain = [1.06, 1.06, 1.09], earth = [128, 124, 130]; rgb(LOOK.parking.col).forEach((v, i) => expect(Math.abs(v * gain[i] - earth[i])).toBeLessThan(3));
  });
  test("an OSM park is painted into the dry-park mesh, an override lawn (迎) and the other classes are not", async () => {
    const { dryClassOf, DRY } = await import("../src/anime/world/town/landuse.js");
    expect(dryClassOf({ cls: "park", osm: "w1" })).toBe("park");
    expect(dryClassOf({ cls: "park", ovr: "c6.json#landuse/3" })).toBeNull();
    expect(dryClassOf({ cls: "weeds", ovr: "c3.json#landuse/0" })).toBe("weeds");
    for (const c of ["parking", "gravel", "grass", "school", "sport", "plaza"]) expect(dryClassOf({ cls: c })).toBeNull();
    // both targets are warm grey-browns (r >= g > b-ish), the Earth read, not green
    for (const k of Object.keys(DRY)) { const [r, g] = [1, 3].map((i) => parseInt(DRY[k].col.slice(i, i + 2), 16)); expect(r).toBeGreaterThanOrEqual(g); }
  });
});

describe("[r2:11] a river mouth is as wide as its carved channel", () => {
  // a synthetic river 20 m wide (OSM) running south to the sea at z = 0; the water grid is 100 m wide upstream and 130 m at the mouth reach
  const mk = (gridHalf) => ({
    RIVERS: [{ name: "R", kind: "river", width: 20, pts: [[0, -600], [0, -5]] }],
    waterClass: (x, z) => (Math.abs(x) < gridHalf(z) ? 2 : 0), isWater: (x, z) => z > -2, heightAt: () => 2, SEA: { level: 0 },
  });
  test("seaArclength: the first sample on the sea, else the end run on along its tangent, else Infinity", async () => {
    const { seaArclength } = await import("../src/anime/world/town/rivers.js");
    const S = [{ x: 0, z: 0, tx: 0, tz: 1, s: 0 }, { x: 0, z: 3, tx: 0, tz: 1, s: 3 }, { x: 0, z: 6, tx: 0, tz: 1, s: 6 }];
    expect(seaArclength({ isWater: (x, z) => z >= 3 }, S)).toBe(3);
    expect(seaArclength({ isWater: (x, z) => z >= 20 }, S)).toBe(6 + 16);
    expect(seaArclength({ isWater: () => false }, S)).toBe(Infinity);
    expect(seaArclength({}, S)).toBe(Infinity);
  });
  test("within 150 m of the sea the ribbon follows the grid run (+5 m) past 1.6 x the OSM width; upstream the cap holds", async () => {
    const { channels } = await import("../src/anime/world/town/rivers.js");
    const L = mk((z) => (z > -150 ? 65 : 50)), ch = channels(L, { near: () => true })[0], at = (z) => ch.S.reduce((b, q) => (Math.abs(q.z - z) < Math.abs(b.z - z) ? q : b));
    expect(at(-60).w).toBeGreaterThan(110);      // grid 130 + 5 m, smoothed: the old cap was 32 m
    expect(at(-60).w).toBeLessThanOrEqual(140);
    expect(at(-400).w).toBeLessThanOrEqual(32 + 1e-6);   // 1.6 x 20 m upstream, the grid being 100 m wide
    expect(at(-400).w).toBeGreaterThan(30);
  });
  test("the reach is a cap, not a width: a narrow grid run at the mouth stays narrow", async () => {
    const { channels } = await import("../src/anime/world/town/rivers.js");
    const ch = channels(mk(() => 12), { near: () => true })[0];
    for (const p of ch.S) expect(p.w).toBeLessThanOrEqual(24 + 5 + 1e-6);
  });
  test("鹿折川 in the real layout: 63-100 m at z -470..-395 (it was 60), 36-46 m upstream, and 大川 (c9) did not move", async () => {
    const Lr = await import("../src/anime/world/layout.js");
    const { channels } = await import("../src/anime/world/town/rivers.js");
    const chs = channels(Lr, { near: (x, z) => x > 800 && x < 1050 && z > -800 && z < -300 });
    const sh = chs.find((c) => c.name === "鹿折川" && c.S.some((p) => p.x > 856 && p.x < 990 && p.z > -470 && p.z < -395)), at = (z) => sh.S.reduce((b, q) => (Math.abs(q.z - z) < Math.abs(b.z - z) ? q : b));
    expect(at(-470).w).toBeGreaterThan(63); expect(at(-440).w).toBeGreaterThan(75); expect(at(-425).w).toBeGreaterThan(85); expect(at(-410).w).toBeGreaterThan(92);
    for (const z of [-740, -650, -560]) expect(at(z).w).toBeLessThan(60);
    const oh = channels(Lr, { near: (x, z) => x > -720 && x < -190 && z > 380 && z < 1010 }).find((c) => c.name === "大川");
    expect(Math.max(...oh.S.filter((p) => p.x > -720 && p.x < -190 && p.z > 380 && p.z < 1010).map((p) => p.w))).toBeLessThan(60);
  });
});

describe("[r2:6] offices and public buildings default to punched windows", () => {
  test("punchedPlan: pairs of 0.85 m panes on a 3 m pitch, head 2.1-2.4 m (a 22 m wall carries 6 pairs, it carried 4 triples at 5 m)", async () => {
    const { punchedPlan, PUNCH } = await import("../src/anime/world/town/blocks.js");
    expect(PUNCH.panes).toBe(2); expect(PUNCH.pane).toBe(0.85); expect(PUNCH.pitch).toBe(3); expect(PUNCH.sill).toBe(0.9);
    const p = punchedPlan(22, 3.4);
    expect(p.gw).toBeCloseTo(1.7, 5); expect(p.groups).toBe(6); expect(Math.abs(p.pitch - 3)).toBeLessThan(0.5); expect(p.head).toBe(2.4);
    expect(punchedPlan(22, 3.0).head).toBeCloseTo(2.1, 5); expect(punchedPlan(22, 2.8).head).toBeGreaterThanOrEqual(2.1); expect(punchedPlan(22, 5).head).toBe(2.4);
    expect(punchedPlan(6, 3.4).groups).toBe(1);
    for (const len of [4, 9, 13, 22, 40]) { const q = punchedPlan(len, 3.4); expect(q.groups * q.pitch).toBeCloseTo(len - 1.5, 5); expect(q.pitch - q.gw).toBeGreaterThan(0.5); }   // wall between the pairs
  });
  test("buildOfficeBlock: punched = facade ? facade !== 'office' : office or public (not hotel, not school, not an explicit 'office')", () => {
    const t = read("src/anime/world/town/blocks.js");
    expect(t).toContain("const punched = lot.facade ? lot.facade !== 'office' : (lot.kind === 'office' || lot.kind === 'public');");
    expect(t).not.toContain("const punched = !!lot.facade && lot.facade !== 'office';");
    expect(t).toContain("const { groups, pitch, head, gw } = punchedPlan(len, FH);");
    expect(t).not.toContain("gw = 3 * 0.85");
  });
  test("the mid and far shader folds the ribbon variant into the punched pairs under 16 m only", () => {
    const f = read("src/anime/world/town/facade.js");
    expect(f).toContain("var_ = mix(var_, 0.5, step(var_, 0.34) * step(hgt, 16.0));");
    expect(f.indexOf("var_ = mix(var_, 0.5")).toBeLessThan(f.indexOf("if (var_ < 0.34) {"));
  });
  test("no explicit facade 'office' override rests on an Earth top view alone (the obliques carry no facades); the 11 were dropped", () => {
    for (const cell of ["c4", "c5", "c6", "c7", "c9", "c11"]) {
      const f = json(`data/anime/overrides/${cell}.json`);
      for (const o of [...(f.lots || []), ...(f.newLots || [])]) if (o.facade === "office") expect(/ground photo|IMG_|author-photos|commons:/i.test(o.src || "")).toBe(true);
    }
  });
});

describe("[r2:5] rooftop plant: a measured spec drawn exactly", () => {
  const doc = (roof) => ({ version: 1, cell: "t", bbox: [-100, -100, 100, 100], sources: [{ id: "earth", what: "x" }], lots: [{ id: "16/1/2/3", roof, src: "earth: plant" }] });
  test("the override schema takes roof.plant = [{ x, z, w, d, h, kind }] and rejects bad kinds, sizes and unknown fields", async () => {
    const { validateOverride, PLANT_KINDS } = await import("../scripts/anime/enrich/overrides.js");
    const ok = { plant: [{ x: -5, z: 3, w: 10, d: 4, h: 2.5, kind: "penthouse" }, { x: 1, z: 1, w: 8, d: 2, h: 1, kind: "condenser-row" }] };
    expect(() => validateOverride(doc(ok))).not.toThrow();
    for (const bad of [{ plant: [] }, { plant: [{ x: 0, z: 0, w: 5, d: 5, h: 2, kind: "chimney" }] }, { plant: [{ x: 0, z: 0, w: 5, d: 5, h: 40, kind: "duct" }] }, { plant: [{ x: 0, z: 0, w: 0, d: 5, h: 2, kind: "duct" }] },
      { plant: [{ x: 0, z: 0, w: 5, d: 5, h: 2, kind: "duct", y: 3 }] }, { plant: [{ x: 0, z: 0, w: 5, d: 5, kind: "duct" }] }, { plant: "penthouse" }]) expect(() => validateOverride(doc(bad))).toThrow();
    const rp = await import("../src/anime/world/town/roofplant.js");
    expect(rp.PLANT_KINDS).toEqual(PLANT_KINDS);
  });
  test("patchLot copies the spec onto lot.roof.plant and marks src.plant", async () => {
    const { validateOverride, compileOverrides, patchLot } = await import("../scripts/anime/enrich/overrides.js");
    const C = compileOverrides([{ ...validateOverride(doc({ plant: [{ x: -5, z: 3, w: 10, d: 4, h: 2.55, kind: "duct" }] })), file: "t.json" }]);
    const lot = { id: "16/1/2/3", kind: "shop", obb: { cx: 0, cz: 0 }, roof: { shape: "flat", color: "#aaaaaa" }, src: {} };
    patchLot(lot, C.lotPatch.get("16/1/2/3"));
    expect(lot.roof.plant).toEqual([{ x: -5, z: 3, w: 10, d: 4, h: 2.6, kind: "duct" }]);   // rounded to 0.1 m like every metre value
    expect(lot.roof.shape).toBe("flat"); expect(lot.src.plant).toBe("override");
  });
  test("plantBoxes: a penthouse is a body and a cap, ducts are parallel runs on a rail, condensers a row of 1.1 m units on a 1.35 m pitch; pv gives no boxes", async () => {
    const { plantBoxes, plantPvRects, rectRing, PLANT } = await import("../src/anime/world/town/roofplant.js");
    const pen = plantBoxes([{ x: 2, z: 3, w: 10, d: 6, h: 3.4, kind: "penthouse" }]);
    expect(pen.length).toBe(2); expect(pen[0].h + pen[1].h).toBeCloseTo(3.4, 5); expect(pen[1].w).toBeGreaterThan(pen[0].w);
    const duct = plantBoxes([{ x: 0, z: 0, w: 18, d: 14, h: 1.4, kind: "duct" }]);
    expect(duct.length).toBe(2 * 6);   // one run per 2.4 m of the 14 m short side, each a rail and a run
    for (const b of duct.filter((q) => q.y0 > 0)) { expect(b.w).toBe(18); expect(b.y0 + b.h).toBeCloseTo(1.4, 5); expect(Math.abs(b.z)).toBeLessThan(7); }
    const row = plantBoxes([{ x: 0, z: 0, w: 9.6, d: 2.2, h: 1.1, kind: "condenser-row" }]);
    expect(row.length).toBe(Math.floor(9.6 / PLANT.pitch)); for (const b of row) { expect(b.d).toBe(2.2); expect(b.w).toBeLessThanOrEqual(PLANT.unitW); expect(b.h).toBe(1.1); }
    const alongZ = plantBoxes([{ x: 5, z: 0, w: 1.1, d: 26, h: 1.1, kind: "condenser-row" }]);
    expect(alongZ.length).toBe(19); expect(alongZ.every((b) => Math.abs(b.x - 5) < 1e-9)).toBe(true);
    expect(plantBoxes([{ x: 0, z: 0, w: 5, d: 5, h: 1, kind: "pv" }])).toEqual([]);
    expect(plantPvRects([{ x: 1, z: 2, w: 5, d: 4, h: 1, kind: "pv" }, { x: 0, z: 0, w: 1, d: 1, h: 1, kind: "duct" }])).toEqual([{ x: 1, z: 2, w: 5, d: 4 }]);
    expect(rectRing({ x: 1, z: 2, w: 4, d: 2 })).toEqual([[-1, 1], [3, 1], [3, 3], [-1, 3]]);
  });
  test("the five named lots carry a spec, inside their own oriented box, and the builders skip the random boxes for them", () => {
    // 16/58542/25067/5 (かわむら) is no longer here: c4.json r3 splits it into two roof levels (ovr:c4:kawamura-n / -s); its old 3 m penthouse sat on the low north slab
    const layout2 = layout; const ids = ["16/58540/25069/320", "16/58541/25069/227", "16/58542/25066/200", "16/58540/25068/37", "16/58540/25068/59"];
    for (const id of ids) {
      const l = layout2.lots.find((q) => q.id === id); expect(l?.roof.plant?.length).toBeGreaterThan(0); expect(l.roof.shape).toBe("flat");
      for (const q of l.roof.plant) { expect(Math.abs(q.x) - q.w / 2).toBeLessThanOrEqual(l.obb.w / 2 + 0.5); expect(Math.abs(q.z) - q.d / 2).toBeLessThanOrEqual(l.obb.d / 2 + 0.5); }
    }
    for (const f of ["mid", "blocks"]) { const t = read(`src/anime/world/town/${f}.js`); expect(t).toContain("hasPlant"); }
    expect(read("src/anime/world/town/mid.js")).toContain("else if (!plantOn) {");
    expect(read("src/anime/world/town/blocks.js")).toContain("else if (!school) for");
    expect(read("src/anime/world/town/industrial.js")).toContain("drawRoofPlant(HF, M, lot, top + 0.56)");
    expect(read("src/anime/world/town/hero.js")).toContain("drawRoofPlant(HF, H.M, lot,");
  });
  test("[c4r3] (株)かわむら is two roof levels: a 8.7 m north slab and a 13 m south slab (step about 4.3 m), no 3 m penthouse on the low slab", () => {
    expect(layout.lots.find((l) => l.id === "16/58542/25067/5")).toBeUndefined();
    const n = layout.lots.find((l) => l.id === "ovr:c4:kawamura-n"), s = layout.lots.find((l) => l.id === "ovr:c4:kawamura-s");
    expect(n && s).toBeTruthy();
    expect(n.height).toBeGreaterThanOrEqual(8.5); expect(n.height).toBeLessThanOrEqual(9);
    expect(s.height - n.height).toBeGreaterThanOrEqual(4); expect(s.height - n.height).toBeLessThanOrEqual(4.6);
    expect(s.obb.cz).toBeGreaterThan(n.obb.cz);   // north = more negative z
    expect(n.roof.plant ?? []).toEqual([]);
    expect(Math.abs(n.area + s.area - 2878)).toBeLessThan(200);   // together they cover the old 2,878 m2 lot
  });
  test("equip is not a source: no builder or script reads the enrichment's rooftop-equipment count", () => {
    for (const f of ["src/anime/world/town/mid.js", "src/anime/world/town/roofplant.js", "scripts/anime/build-layout.js"]) expect(read(f)).not.toMatch(/\.equip\b/);
  });
});

describe("[r2:3][r2:13] flat roofs land on Earth; the GSI -> paint transform is fitted on Earth readings and gated held out", async () => {
  const fold = await import("../scripts/anime/enrich/fold.js");
  const { lotTable } = fold, ER = json("data/anime/earth-roofs.json"), E = lotTable(json("data/anime/enrich.json"));
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const Lstar = (h) => fold.rgbToLab(hexRgb(h))[0];
  const dE76 = (a, b) => Math.hypot(...fold.rgbToLab(hexRgb(a)).map((v, i) => v - fold.rgbToLab(hexRgb(b))[i]));
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const shapeOf = new Map(layout.lots.map((l) => [l.id, l.roof.shape])); for (const r of layout.farLots.rows) shapeOf.set(r[0], layout.farLots.shapes[r[10]]);
  const posOf = new Map(layout.lots.map((l) => [l.id, [l.obb.cx, l.obb.cz]])); for (const r of layout.farLots.rows) posOf.set(r[0], [r[1], r[2]]);
  test("Lab round trip, shiftL keeps hue and moves L* by exactly dL", () => {
    for (const h of ["#9d9ba2", "#c8bcbc", "#5b666d", "#eeeef0", "#3e4a63"]) {
      const l = fold.rgbToLab(hexRgb(h)), b = fold.rgbToLab(hexRgb(fold.shiftL(h, -3.5)));
      expect(Math.abs(b[0] - (l[0] - 3.5))).toBeLessThan(1.2);   // 8-bit rounding
      expect(Math.abs(Math.atan2(b[2], b[1]) - Math.atan2(l[2], l[1]))).toBeLessThan(0.12);
    }
    expect(fold.shapeClass("flat")).toBe("flat"); expect(fold.shapeClass("saw")).toBe("shed"); expect(fold.shapeClass("hip")).toBe("pitched");
    expect(fold.RENDER_DL.flat).toBe(0); expect(fold.RENDER_DL.pitched).toBeGreaterThan(fold.RENDER_DL.shed);
  });
  test("fitPaintTransform recovers a known colour map per shape, drops re-clad outliers, and gradeRoof(photo, T, shape) applies it", () => {
    const f = (c, s) => { const l = fold.rgbToLab(c); return fold.labToRgb([l[0] * 0.8 + 6 + (s === "flat" ? 4 : 0), l[1] * 0.9, l[2] * 0.9 - 2]); };
    const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
    const S = []; for (let i = 0; i < 400; i++) { const c = [(i * 37) % 200 + 30, (i * 53) % 190 + 40, (i * 71) % 180 + 40], s = i % 3 ? "flat" : "gable"; S.push({ gsi: hex(c), target: hex(f(c, s)), shape: s }); }
    S[5].target = "#ff0000"; S[9].target = "#00ff00";   // a re-clad roof or two
    const T = fold.fitPaintTransform(S, 1e-6, 1);
    expect(T.type).toBe("lab"); expect(T.dropped).toBeGreaterThanOrEqual(2);
    for (const s of S.slice(10, 60)) { const d = dE76(fold.gradeRoof(s.gsi, T, s.shape), s.target); expect(d).toBeLessThan(6); }   // 4-level quantisation
    expect(dE76(fold.gradeRoof("#808080", T, "flat"), fold.gradeRoof("#808080", T, "gable"))).toBeGreaterThan(2);   // the shape is a feature
    expect(fold.gradeRoof("#808080")).toBe("#808080");   // the legacy call (no transform) is unchanged
  });
  test("the held-out gate: leave-one-area-out, median dE2000 <= 8.5 and |median dL| <= 3 against the Earth readings (paint targets: Earth + RENDER_DL)", async () => {
    const { lab, dE2000 } = await import("../tools/anime/accuracy-lib.mjs");
    const data = Object.entries(ER.lots).filter(([id]) => !ER.skip[id] && E.get(id)?.rgb && shapeOf.has(id)).map(([id, e]) => ({ gsi: E.get(id).rgb, target: fold.shiftL(e, fold.RENDER_DL[fold.shapeClass(shapeOf.get(id))]), shape: shapeOf.get(id), p: posOf.get(id) }));
    expect(data.length).toBeGreaterThan(2000);
    const area = (r) => Math.floor(r.p[0] / 300) + "," + Math.floor(r.p[1] / 300), folds = [...new Set(data.map(area))];
    const dE = [], dL = [];
    for (const f of folds) {
      const tr = data.filter((r) => area(r) !== f), te = data.filter((r) => area(r) === f); if (te.length < 5) continue;
      const T = fold.fitPaintTransform(tr);
      for (const r of te) { const c = fold.gradeRoof(r.gsi, T, r.shape); dE.push(dE2000(lab(hexRgb(c)), lab(hexRgb(r.target)))); dL.push(Lstar(c) - Lstar(r.target)); }
    }
    expect(med(dE)).toBeLessThanOrEqual(8.5); expect(Math.abs(med(dL))).toBeLessThanOrEqual(3);
  });
  test("build-layout trains on Earth readings and on override colours only where they were read raw from Earth, never from c9, c7 or c3", () => {
    const b = read("scripts/anime/build-layout.js");
    expect(b).toContain('export const ROOF_PAIR_SKIP = ["c9.json", "c7.json", "c3.json"];');
    expect(b).toContain('ROOF_PAIR_SKIP.some((f) => op.ref.startsWith(f)) || !/^earth\\b/i.test(op.why || "")');
    expect(b).toContain("fitPaintTransform(roofSamples)"); expect(b).toContain("EARTH_ROOFS.skip?.[id]");
    expect(read("scripts/anime/enrich/fold.js")).toContain("gradeRoof(e.rgb, wb, out.roof.shape)");
  });
  test("earth-roofs.json holds derived colour values only (no imagery), sorted, with the skip list", () => {
    expect(ER.version).toBe(1); expect(ER.imagery).toBe("2026-03-11");
    const ids = Object.keys(ER.lots); expect(ids.length).toBeGreaterThan(2500); expect([...ids].sort()).toEqual(ids);
    for (const h of Object.values(ER.lots)) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    for (const [id, why] of Object.entries(ER.skip)) { expect(ER.lots[id]).toBeDefined(); expect(["pv", "veg", "var"]).toContain(why); }
    expect(JSON.stringify(ER).length).toBeLessThan(400000);
  });
  test("stored flat-roof colours sit on the Earth readings: median |stored - Earth| L* of the clean flat lots of the cells <= 3 (it was +11 over 464 lots)", () => {
    const d = [];
    for (const l of layout.lots) { const e = ER.lots[l.id]; if (!e || ER.skip[l.id] || l.roof.shape !== "flat" || l.landmark) continue; d.push(Lstar(l.roof.color) - Lstar(e)); }
    expect(d.length).toBeGreaterThan(200);
    expect(Math.abs(med(d))).toBeLessThanOrEqual(3);
    const pit = []; for (const l of layout.lots) { const e = ER.lots[l.id]; if (!e || ER.skip[l.id] || !["gable", "hip"].includes(l.roof.shape) || l.landmark) continue; pit.push(Lstar(l.roof.color) - Lstar(e)); }
    expect(med(pit)).toBeGreaterThan(0.5); expect(med(pit)).toBeLessThan(4.5);   // painted about RENDER_DL.pitched (2.5) lighter than Earth: the render shades the slope
  });
  test("flatPaint takes 3.5 L* off a flat top (hue kept) in mid.js, blocks.js, industrial.js and the hero kit; the stored colour is untouched", async () => {
    const { flatPaint, FLAT_PAINT_DL } = await import("../src/anime/world/town/flatroof.js");
    expect(FLAT_PAINT_DL).toBe(3.5);
    for (const h of ["#eeeef0", "#9d9ba2", "#c8bcbc", "#bdb8bc"]) { expect(Math.abs(Lstar(flatPaint(h)) - (Lstar(h) - 3.5))).toBeLessThan(1.2); expect(flatPaint(h)).toBe(flatPaint(h)); }
    expect(flatPaint("#000000")).toBe("#000000");
    for (const f of ["mid", "blocks", "industrial", "hero"]) expect(read(`src/anime/world/town/${f}.js`)).toContain("flatPaint(");
    expect(read("src/anime/world/town/mid.js")).toContain("flatPaint(flatRoofOf(lot))");
    expect(read("src/anime/world/town/palette.js")).not.toContain("flatPaint");   // palette.js keeps the stored colour (test/v3-town: the anime palette)
  });
});

describe.skipIf(!HAVE_EARTH_TOOL)("[r2:3] earth-ref reports the L* bias by roof class", () => {
  test("metrics carry roofDLmedian, roofDLflat and roofDLpitched (app minus Earth, per lot)", () => {
    const t = read("tools/anime/earth-ref.mjs");
    expect(t).toContain("roofDLflat: { n: dLs.flat.length, median: medL(dLs.flat) }");
    expect(t).toContain("roofDLpitched: { n: dLs.pitched.length, median: medL(dLs.pitched) }");
    expect(t).toContain("const k = l.roof.shape === 'flat' ? 'flat' : l.roof.shape === 'gable' || l.roof.shape === 'hip' ? 'pitched' : null; if (k) dLs[k].push(dl);");
  });
});

describe("[r2:12] AEON: a flat 2-storey mall with a sign tower, no 46 m wedge", () => {
  const aeon = layout.farLots.rows.find((r) => r[0] === "16/58540/25072/110"), F = layout.farLots;
  test("the lot is 2 storeys, 11.5 m, flat, with the photo's wall and roof colours (an override: LOT_FIX cannot set colours)", () => {
    expect(aeon).toBeDefined();
    expect(aeon[6]).toBe(2); expect(aeon[7]).toBe(11.5); expect(F.shapes[aeon[10]]).toBe("flat");
    expect(F.walls[aeon[12]]).toBe("#e6d6cf"); expect(F.roofColors[aeon[11]]).toBe("#bfb8b2");
    const ov = json("data/anime/overrides/outside cells (イオン気仙沼, far core).json");
    expect(ov.lots[0].id).toBe("16/58540/25072/110"); expect(ov.lots[0].src).toMatch(/^commons:/);
  });
  test("LOT_FIX carries the entry, and the 'ref' height source is honoured by the hero kit, the block builders and place.js", () => {
    const lf = read("src/anime/world/lotfix.js");
    expect(lf).toContain("'16/58540/25072/110': { roofShape: 'flat', storeys: 2, height: 11.5, name: 'イオン', nameEn: 'AEON'");
    for (const f of ["town/hero.js", "town/blocks.js", "town/kit/place.js"]) expect(read(`src/anime/world/${f}`)).toContain("'ref'");
  });
  test("kit/house.js caps the pitch: a mono-pitch rises at most 3.2 m over its depth, a gable or hip 4.5 m from eave to ridge", async () => {
    const t = read("src/anime/world/town/kit/house.js");
    expect(t).toContain("export const MAX_SHED_RISE = 3.2, MAX_RIDGE_RISE = 4.5;");
    expect(t).toContain("if (type === 'shed') p = Math.min(p, MAX_SHED_RISE / (2 * hz));");
    expect(t).toContain("else if (type === 'gable' || type === 'hip') p = Math.min(p, MAX_RIDGE_RISE / hz);");
    expect(t).not.toContain("const tv = rm.t, p = R.pitch");
    // the geometry: the cap is the binding rule on a 72 x 149 m lot, and does nothing to a house
    const cap = (pitch, hz, type) => (type === "shed" ? Math.min(pitch, 3.2 / (2 * hz)) : Math.min(pitch, 4.5 / hz));
    expect(2 * 74.5 * cap(0.3, 74.5, "shed")).toBeCloseTo(3.2, 5); expect(36 * cap(0.45, 36, "gable")).toBeCloseTo(4.5, 5);
    expect(6 * cap(0.42, 6, "gable")).toBeCloseTo(6 * 0.42, 5);   // a 12 m wide house keeps its roof
  });
  test("hero.js routes a big derived-roof block to a flat deck (not a warehouse, not a measured roof) and draws the sign tower on it; mid and far draw it too", async () => {
    const h = read("src/anime/world/town/hero.js");
    expect(h).toContain("kind !== 'warehouse' && !isMeasuredRoof(lot) && (Math.max(w, d) > 30 || lot.area > 1500)) roofType = 'flat';");
    expect(h).toContain("buildSignTower(H, HF,"); expect(h).toContain("HF.m.clone().invert()");
    expect(read("src/anime/world/town/mid.js")).toContain("LOT_TOWER[lot.id] && shape === 'flat'");
    expect(read("src/anime/world/town/far.js")).toContain("towers.set(l.id, g)");
    const { LOT_TOWER, towerRise } = await import("../src/anime/world/town/signtower.js");
    const t = LOT_TOWER["16/58540/25072/110"];
    expect(11.5 + towerRise(t)).toBeGreaterThan(22); expect(11.5 + towerRise(t)).toBeLessThan(24.5);   // about 23 m (Commons 2025-09-19)
    expect(t.color).toBe("#d6247f"); expect(t.w).toBeGreaterThanOrEqual(8); expect(t.w).toBeLessThanOrEqual(10);
    // a WORLD spot inside the lot's footprint (explore turns far lots' frames, so a lot-local spot could land on the other face), 7 m inside the south-west long face
    const { towerLocal } = await import("../src/anime/world/town/signtower.js");
    const l = towerLocal(t, aeon[1], aeon[2], aeon[5]);
    expect(Math.abs(l.x)).toBeLessThan(149 / 2 - 4); expect(Math.abs(l.z)).toBeLessThan(72.2 / 2 - 4);
    // the same spot through a half-turned frame is the mirrored local spot: the same world point
    const l2 = towerLocal(t, aeon[1], aeon[2], aeon[5] + Math.PI); expect(l2.x).toBeCloseTo(-l.x, 5); expect(l2.z).toBeCloseTo(-l.z, 5);
  });
});
