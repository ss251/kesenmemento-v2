// [v6:phone-budget] The phone tier's texture budget, pinned without a browser.
//
// tools/anime/phonemem.mjs (390 x 844, DPR 3, phone tier) measured 232 MB of texture at ae274fb and 256 MB at df15fdd, over
// the 240 MB budget. The whole difference was the static-batch atlas (core/batch2.js): the error hunt's ~50 new canvas
// tiles (crate plates, boat name plates, tug and hall decals, ...) spilled its next-fit shelves onto a sixth 2048 x 2048
// page, +22 MB with mips, while the tiles themselves added 13 MB. The phone tier now trims every page canvas to its content
// (core/atlaspack.js): the same tiles at the same positions on the same pages, so the batches and draw calls do not move.
// This file lays the REAL tile lists of that measurement (test/fixtures/phone-atlas-tiles.json) out both ways and pins the
// page sizes and the megabytes, proves the desktop layout is the one it always was and that trimming moves no tile, and
// checks the layout's invariants on random tile sets.
// A new capture (tools/anime/atlas-dump.js, via phonemem --eval; its header has the commands) changes the sets, so the
// pinned page sizes below must be re-pinned with it. Plain unit test: no browser, no child process.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { PAD, MIP, texMB, shelfPages, planAtlas, planMB, tileUV } from "../src/anime/core/atlaspack.js";
import { ATLAS, shelfPages as shelfPagesFromBatch } from "../src/anime/core/batch2.js";
import { PHONE, qualityPreset } from "../src/anime/core/tier.js";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/phone-atlas-tiles.json", import.meta.url), "utf8"));
const sizes = (name) => FIX.sets[name].map(([w, h]) => ({ w, h }));
const SQUARE = { page: PHONE.atlasPage, tileMax: PHONE.canvasMax };   // what the phone tier built before: full square pages
const TRIM = { ...SQUARE, trim: PHONE.atlasTrim, quantum: PHONE.atlasQuantum };   // what it builds now
const BOATS = ["arrival-1", "arrival-2", "arrival-3", "arrival-4"];
const dims = (plan) => plan.pages.map((p) => `${p.w}x${p.h}`);
const total = (opt) => Object.keys(FIX.sets).reduce((a, k) => a + planMB(planAtlas(sizes(k), opt)), 0);

// The layout batch2.js used until [v6:phone-budget], verbatim (df15fdd), as the reference for "the desktop tiers are unchanged".
function legacyLayout(sz, { page: PAGE_MAX, tileMax }) {
  const list = sz.map((s, i) => { const k = Math.min(1, tileMax / Math.max(s.w, s.h)); return { i, w: Math.max(1, Math.round(s.w * k)), h: Math.max(1, Math.round(s.h * k)) }; }).sort((a, b) => b.h - a.h || b.w - a.w);
  let S = 256; while (S < PAGE_MAX && shelfPages(list, S) > 1) S *= 2;
  const pages = []; let page = null, x = 0, y = 0, shelf = 0;
  const newPage = () => { page = { w: S, h: S, tiles: [] }; pages.push(page); x = 0; y = 0; shelf = 0; };
  for (const it of list) {
    const W = it.w + PAD * 2, H = it.h + PAD * 2;
    if (!page) newPage();
    if (x + W > S) { x = 0; y += shelf; shelf = 0; }
    if (y + H > S) newPage();
    page.tiles.push({ i: it.i, x: x + PAD, y: y + PAD, w: it.w, h: it.h });
    x += W; shelf = Math.max(shelf, H);
  }
  return { S, pages };
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomTiles(seed, n, maxSide) {
  const r = rng(seed), pick = [32, 48, 64, 85, 96, 128, 160, 192, 256, 320, 384, 448, 512, 640, 1024, 2048].filter((v) => v <= maxSide);
  return Array.from({ length: n }, () => ({ w: pick[Math.floor(r() * pick.length)] - Math.floor(r() * 12), h: pick[Math.floor(r() * pick.length)] - Math.floor(r() * 12) }));
}

describe("phone budget: the measured tile lists", () => {
  test("the fixture is the df15fdd phone tier: 285 static tiles, 15 interior, four arriving boats", () => {
    expect(Object.keys(FIX.sets)).toEqual(["interiors", "static", ...BOATS]);
    expect(FIX.sets.static.length).toBe(285);
    expect(FIX.sets.interiors.length).toBe(15);
    expect(FIX.page).toBe(PHONE.atlasPage);
    expect(FIX.tileMax).toBe(PHONE.canvasMax);
    expect(FIX.measured.budgetMB).toBe(240);
  });

  test("full square pages reproduce the regression: six 2048 pages for the static atlas, 256 MB in all", () => {
    const st = planAtlas(sizes("static"), SQUARE);
    expect(st.S).toBe(2048);
    expect(dims(st)).toEqual(Array(6).fill("2048x2048"));
    expect(planMB(st)).toBeCloseTo(133.9, 1);
    expect(planMB(planAtlas(sizes("interiors"), SQUARE))).toBeCloseTo(22.3, 1);
    for (const k of BOATS) expect(dims(planAtlas(sizes(k), SQUARE))).toEqual(["1024x1024"]);
    expect(total(SQUARE)).toBeCloseTo(FIX.measured.atlasMB, 1);   // 178.5 MB of atlas pages ...
    expect(total(SQUARE) + FIX.measured.nonAtlasMB).toBeCloseTo(FIX.measured.texMB, 1);   // ... + 77.1 MB of everything else = the 255.6 MB phonemem printed
    expect(total(SQUARE) + FIX.measured.nonAtlasMB).toBeGreaterThan(FIX.measured.budgetMB);
  });

  test("trimmed pages pin the page sizes of every atlas", () => {
    expect(dims(planAtlas(sizes("static"), TRIM))).toEqual(["1600x1600", "2048x2048", "2048x1984", "2048x1920", "1984x1984", "1920x1856"]);
    expect(dims(planAtlas(sizes("interiors"), TRIM))).toEqual(["1856x1408"]);
    expect(dims(planAtlas(sizes("arrival-1"), TRIM))).toEqual(["704x256"]);
    expect(dims(planAtlas(sizes("arrival-2"), TRIM))).toEqual(["704x256"]);
    expect(dims(planAtlas(sizes("arrival-3"), TRIM))).toEqual(["960x384"]);
    expect(dims(planAtlas(sizes("arrival-4"), TRIM))).toEqual(["704x384"]);
  });

  test("trimming brings the phone tier under the budget: 118 + 14 + 5 MB of atlas, ~215 MB in all", () => {
    expect(planMB(planAtlas(sizes("static"), TRIM))).toBeLessThan(119);
    expect(planMB(planAtlas(sizes("interiors"), TRIM))).toBeLessThan(14.5);
    for (const k of BOATS) expect(planMB(planAtlas(sizes(k), TRIM))).toBeLessThan(2.1);
    const atlas = total(TRIM), all = atlas + FIX.measured.nonAtlasMB;
    expect(atlas).toBeLessThan(138);
    expect(all).toBeLessThan(235);   // the aim: 5 MB under the 240 MB budget
    expect(all).toBeGreaterThan(213);   // 214.7 here, ~215 in phonemem: the pin works in both directions (a lost saving shows too)
    expect(total(SQUARE) - atlas).toBeGreaterThan(40);   // ~41 MB saved with no tile resized or moved
  });

  test("no tile is resized, moved or dropped: trimming changes only the page canvases", () => {
    for (const k of Object.keys(FIX.sets)) {
      const a = planAtlas(sizes(k), SQUARE), b = planAtlas(sizes(k), TRIM);
      expect(b.S).toBe(a.S);
      expect(b.pages.map((p) => p.tiles)).toEqual(a.pages.map((p) => p.tiles));   // the same tiles at the same pixels on the same pages
      expect(b.pages.flatMap((p) => p.tiles).length).toBe(FIX.sets[k].length);
      b.pages.forEach((p, i) => { expect(p.w).toBeLessThanOrEqual(a.pages[i].w); expect(p.h).toBeLessThanOrEqual(a.pages[i].h); });
    }
  });
});

describe("phone budget: what the phone tier asks for", () => {
  test("the tier's knobs", () => {
    expect(PHONE.atlasPage).toBe(2048);
    expect(PHONE.atlasTrim).toBe(true);
    expect(PHONE.atlasQuantum).toBe(64);
    expect(PHONE.canvasMax).toBe(512);
    expect(qualityPreset("phone", { dpr: 3, touch: true }).phone).toBe(true);
  });
  test("the desktop tiers keep the classic atlas: 4096 pages, 2048 tiles, full squares", () => {
    expect(ATLAS.page).toBe(4096);
    expect(ATLAS.tileMax).toBe(2048);
    expect(ATLAS.trim).toBe(false);
    for (const t of ["high", "medium", "low"]) expect(qualityPreset(t, { dpr: 1 }).phone).toBeUndefined();
  });
  test("main.js hands the phone tier's atlas knobs to batch2 (and only the phone tier's)", () => {
    const main = readFileSync(new URL("../src/anime/main.js", import.meta.url), "utf8");
    const line = main.split("\n").find((l) => /ATLAS\.page = PHONE\.atlasPage/.test(l)) || "";
    expect(line).toMatch(/^if \(quality\.phone\) \{/);
    expect(line).toContain("ATLAS.tileMax = PHONE.canvasMax");
    expect(line).toContain("ATLAS.trim = PHONE.atlasTrim && params.get('atlas') !== 'square'");   // ?atlas=square: the old pages, for an A/B on a phone
    expect(line).toContain("ATLAS.quantum = PHONE.atlasQuantum");
    expect(main.match(/ATLAS\.trim\s*=/g).length).toBe(1);   // nowhere else: the desktop tiers never trim
  });
  test("phonemem's megabytes: 4 B a texel and a third more for the mip chain", () => {
    expect(MIP).toBeCloseTo(1.33, 2);
    expect(texMB(2048, 2048)).toBeCloseTo(22.31, 2);
    expect(texMB(2048, 1024)).toBeCloseTo(11.16, 2);
    expect(texMB(512, 512)).toBeCloseTo(1.39, 2);
  });
  test("batch2 still exports shelfPages (v4-phone.test.js imports it from there)", () => {
    expect(shelfPagesFromBatch).toBe(shelfPages);
  });
});

describe("phone budget: the desktop layout is the one it always was", () => {
  const desktop = { page: ATLAS.page, tileMax: ATLAS.tileMax };
  test("planAtlas without `trim` equals the layout batch2.js had before, on the phone's real tile sets", () => {
    for (const k of Object.keys(FIX.sets)) expect(planAtlas(sizes(k), SQUARE)).toEqual(legacyLayout(sizes(k), SQUARE));
  });
  test("... and on random desktop-sized sets (tiles up to 2048 px, 4096 pages)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sz = randomTiles(seed, 1 + (seed * 7) % 90, 2048);
      expect(planAtlas(sz, desktop)).toEqual(legacyLayout(sz, desktop));
      expect(planAtlas(sz, { ...desktop, quantum: 16 })).toEqual(legacyLayout(sz, desktop));   // the quantum only matters when trimming
    }
  });
  test("... including tiles that fill a row or a page exactly (the boundaries of the shelf rules)", () => {
    const exact = Array.from({ length: 4 }, () => ({ w: 116, h: 116 }));   // 128 px each with its gutters: two per 256 px row, two rows
    const one = planAtlas(exact, { page: 256, tileMax: 256 });
    expect(dims(one)).toEqual(["256x256"]);
    expect(one.pages[0].tiles.map((t) => [t.x, t.y])).toEqual([[PAD, PAD], [128 + PAD, PAD], [PAD, 128 + PAD], [128 + PAD, 128 + PAD]]);
    expect(one).toEqual(legacyLayout(exact, { page: 256, tileMax: 256 }));
    const five = [...exact, { w: 116, h: 116 }];   // one more spills onto a second page
    expect(planAtlas(five, { page: 256, tileMax: 256 })).toEqual(legacyLayout(five, { page: 256, tileMax: 256 }));
    expect(planAtlas(five, { page: 256, tileMax: 256 }).pages.length).toBe(2);
  });
  test("the classic pages are square powers of two (a boat's plates 1024, the static set 2048)", () => {
    for (const p of planAtlas(sizes("static"), SQUARE).pages.concat(planAtlas(sizes("arrival-1"), SQUARE).pages)) {
      expect(p.w).toBe(p.h);
      expect(Math.log2(p.w) % 1).toBe(0);
    }
  });
  test("an empty set plans no pages", () => {
    expect(planAtlas([], TRIM).pages).toEqual([]);
    expect(planAtlas([], desktop).pages).toEqual([]);
  });
});

describe("phone budget: invariants of the layout", () => {
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const check = (sz, opt) => {
    const plan = planAtlas(sz, opt);
    const seen = new Set();
    for (const p of plan.pages) {
      expect(p.w).toBeLessThanOrEqual(plan.S);
      expect(p.h).toBeLessThanOrEqual(plan.S);
      if (opt.trim) { expect(p.w % opt.quantum === 0 || p.w === plan.S).toBe(true); expect(p.h % opt.quantum === 0 || p.h === plan.S).toBe(true); }
      const boxes = p.tiles.map((t) => ({ x: t.x - PAD, y: t.y - PAD, w: t.w + 2 * PAD, h: t.h + 2 * PAD }));   // tile and its gutter
      for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(p.w); expect(b.y + b.h).toBeLessThanOrEqual(p.h); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) throw new Error(`tiles ${p.tiles[i].i} and ${p.tiles[j].i} overlap`);
      if (opt.trim) {   // trimmed means trimmed: less than one quantum of slack right of and below the content
        expect(p.w - Math.max(...boxes.map((b) => b.x + b.w))).toBeLessThan(opt.quantum + 1e-9);
        expect(p.h - Math.max(...boxes.map((b) => b.y + b.h))).toBeLessThan(opt.quantum + 1e-9);
      }
      for (const t of p.tiles) seen.add(t.i);
    }
    expect(seen.size).toBe(sz.length);
    return plan;
  };
  test("tiles never overlap (gutters included), stay inside their page, and every tile is placed once", () => {
    for (const k of Object.keys(FIX.sets)) { check(sizes(k), SQUARE); check(sizes(k), TRIM); }
    for (let seed = 1; seed <= 60; seed++) { const sz = randomTiles(seed * 31, 1 + (seed * 5) % 120, 512); check(sz, SQUARE); check(sz, TRIM); }
  });
  test("tileMax scales tiles down with the aspect kept, and never up", () => {
    const scaled = planAtlas([{ w: 1024, h: 256 }, { w: 300, h: 300 }], { page: 2048, tileMax: 512, trim: true, quantum: 64 });
    const t = scaled.pages.flatMap((p) => p.tiles);
    expect(t.find((x) => x.i === 0)).toMatchObject({ w: 512, h: 128 });
    expect(t.find((x) => x.i === 1)).toMatchObject({ w: 300, h: 300 });
  });
  test("a trimmed page is never larger than the square one, and a small set costs a fraction of it", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sz = randomTiles(seed * 13, 1 + (seed * 3) % 40, 512);
      expect(planMB(planAtlas(sz, TRIM))).toBeLessThanOrEqual(planMB(planAtlas(sz, SQUARE)) + 1e-9);
    }
    const plates = [{ w: 128, h: 128 }, { w: 512, h: 85 }, { w: 512, h: 64 }];   // a boat's name plates
    expect(planMB(planAtlas(plates, SQUARE))).toBeCloseTo(5.58, 1);
    expect(planMB(planAtlas(plates, TRIM))).toBeLessThan(1.1);
  });
  test("tileUV maps a mesh's [0,1] uv onto exactly the tile's pixels, on a non-square page", () => {
    const plan = planAtlas(sizes("arrival-3"), TRIM), page = plan.pages[0];
    for (const t of page.tiles) {
      const uv = tileUV(t, page);
      expect(uv.u0 * page.w).toBeCloseTo(t.x, 6);
      expect((uv.u0 + uv.su) * page.w).toBeCloseTo(t.x + t.w, 6);
      expect((1 - uv.v0 - uv.sv) * page.h).toBeCloseTo(t.y, 6);   // the tile's top edge, counted down from the page's top
      expect((1 - uv.v0) * page.h).toBeCloseTo(t.y + t.h, 6);
      expect(uv.su).toBeGreaterThan(0); expect(uv.sv).toBeGreaterThan(0);
    }
    expect(page.w).not.toBe(page.h);
  });
});
