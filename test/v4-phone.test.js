// [v4:phone] The phone tier: device check, forced tier, its build limits against the budgets, atlas page sizing, the
// per-cell proxies of core/phonecells.js, and the size of the data a phone downloads.
import { test, expect, describe } from "bun:test";
import { statSync, readdirSync } from "node:fs";
import * as THREE from "three";
import { looksLikePhone, pickTier, qualityPreset, PHONE, QUALITY_NAMES } from "../src/anime/core/tier.js";
import { shelfPages } from "../src/anime/core/batch2.js";
import { mergeCells, mergeable } from "../src/anime/core/phonecells.js";
import { RADII } from "../src/anime/world/explore/stream.js";
import { TREE_NEAR } from "../src/anime/world/environment/trees.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("phone: device check", () => {
  test("phones and tablets look like phones", () => {
    expect(looksLikePhone({ coarse: true, maxTouchPoints: 5, screenW: 390, screenH: 844, ua: IPHONE })).toBe(true);
    expect(looksLikePhone({ coarse: true, maxTouchPoints: 5, screenW: 1024, screenH: 1366, ua: IPAD_DESKTOP })).toBe(true);   // iPad in desktop mode
    expect(looksLikePhone({ coarse: false, maxTouchPoints: 5, screenW: 820, screenH: 1180, ua: IPAD_DESKTOP })).toBe(true);   // with a trackpad attached
    expect(looksLikePhone({ coarse: true, maxTouchPoints: 5, screenW: 412, screenH: 915, ua: ANDROID })).toBe(true);
    expect(looksLikePhone({ coarse: true, maxTouchPoints: 0, screenW: 600, screenH: 960, ua: "" })).toBe(true);   // touch + small screen
  });
  test("low device memory forces it, even on a desktop UA", () => {
    expect(looksLikePhone({ deviceMemory: 4, ua: MAC, screenW: 1440, screenH: 900 })).toBe(true);
    expect(looksLikePhone({ deviceMemory: 2, ua: MAC })).toBe(true);
    expect(looksLikePhone({ deviceMemory: 8, ua: MAC, screenW: 1440, screenH: 900 })).toBe(false);
  });
  test("desktops (a touchscreen laptop included) do not", () => {
    expect(looksLikePhone({ coarse: false, maxTouchPoints: 0, screenW: 1920, screenH: 1080, ua: MAC })).toBe(false);
    expect(looksLikePhone({ coarse: false, maxTouchPoints: 10, screenW: 1920, screenH: 1080, ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
    expect(looksLikePhone({})).toBe(false);
  });
});

describe("phone: tier selection", () => {
  test("a phone is forced to the phone tier whatever was stored or asked for", () => {
    for (const stored of [null, "high", "medium", "low", "phone"]) for (const param of [null, "high", "low"]) {
      expect(pickTier({ param, stored, phone: true })).toEqual({ tier: "phone", forced: true });
    }
  });
  test("only ?unsafe=1 lifts the force (testing)", () => {
    expect(pickTier({ param: "high", phone: true, unsafe: true })).toEqual({ tier: "high", forced: false });
    expect(pickTier({ phone: true, unsafe: true }).tier).toBe("phone");
  });
  test("desktops: ?q= over the stored choice, high by default, phone selectable for testing", () => {
    expect(pickTier({})).toEqual({ tier: "high", forced: false });
    expect(pickTier({ stored: "medium" }).tier).toBe("medium");
    expect(pickTier({ param: "low", stored: "medium" }).tier).toBe("low");
    expect(pickTier({ param: "phone" }).tier).toBe("phone");
    expect(pickTier({ param: "ultra", stored: "bogus" }).tier).toBe("high");
    expect(QUALITY_NAMES).toContain("phone");
  });
});

describe("phone: budgets of the tier", () => {
  const q = qualityPreset("phone", { dpr: 3, touch: true });
  test("render settings: no MSAA, pixel ratio <= 1.5, a 2048 shadow map at most, 512 px canvases", () => {
    expect(q.phone).toBe(true);
    expect(q.name).toBe("low");   // every low-tier branch applies too
    expect(q.tier).toBe("phone");
    expect(q.msaa).toBe(0);
    expect(q.pixelRatio).toBeGreaterThanOrEqual(1);
    expect(q.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(q.shadowMap).toBeLessThanOrEqual(2048);   // [mobile-perf] 2048 since 2026-10-08 (the image-quality pass: the drone's shadows were half-metre texels at 1024; the memory budget has room)
    expect(q.shadowMax).toBeLessThanOrEqual(300);
    expect(PHONE.canvasMax).toBeLessThanOrEqual(512);
    expect(PHONE.atlasPage).toBeLessThanOrEqual(2048);
  });
  test("a smaller world than low", () => {
    const low = qualityPreset("low");
    expect(q.heroR).toBeLessThan(low.heroR);
    expect(PHONE.farDist).toBeLessThanOrEqual(2500);
    expect(PHONE.maxBoats).toBeLessThan(18);
    expect(PHONE.arrivals).toBeLessThan(14);
    expect(RADII.phone.l1).toBeLessThan(RADII.low.l1);
    expect(RADII.phone.l0).toBeLessThanOrEqual(RADII.low.l0);
    expect(TREE_NEAR.phone).toBeLessThan(TREE_NEAR.low);
    expect(PHONE.treeFarKeep).toBeGreaterThan(0);
    expect(PHONE.treeFarKeep).toBeLessThan(0.5);
    expect(PHONE.shadowEvery).toBeGreaterThanOrEqual(2);
  });
  test("the desktop tiers are unchanged", () => {
    expect(qualityPreset("high", { dpr: 2 })).toMatchObject({ name: "high", pixelRatio: 1.5, msaa: 4, shadowMap: 4096, shadowSize: 75, heroR: 1 });
    expect(qualityPreset("medium", { dpr: 2 })).toMatchObject({ name: "medium", pixelRatio: 1, msaa: 4, shadowMap: 2048, heroR: 0.8 });
    expect(qualityPreset("low", { dpr: 1 })).toMatchObject({ name: "low", pixelRatio: 0.75, msaa: 0, shadowMap: 2048, heroR: 0.55 });
    expect(qualityPreset("high").phone).toBeUndefined();
  });
});

describe("phone: atlas pages fit their content", () => {
  test("a boat's few name plates take a 512 page, not 4096", () => {
    const tiles = [{ w: 256, h: 64 }, { w: 256, h: 64 }, { w: 128, h: 128 }, { w: 200, h: 50 }];
    let S = 256; while (S < 4096 && shelfPages(tiles, S) > 1) S *= 2;
    expect(S).toBeLessThanOrEqual(512);
  });
  test("tiles that cannot fit report Infinity; a full page set packs into several", () => {
    expect(shelfPages([{ w: 3000, h: 10 }], 2048)).toBe(Infinity);
    const many = Array.from({ length: 200 }, () => ({ w: 500, h: 120 }));
    expect(shelfPages(many, 2048)).toBeGreaterThan(1);
    expect(shelfPages(many, 4096)).toBeLessThan(shelfPages(many, 2048));
  });
});

describe("phone: per-cell proxies (core/phonecells.js)", () => {
  const mk = (x, z, mat, cast = true) => { const g = new THREE.BoxGeometry(4, 4, 4); g.translate(x, 2, z); const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
  test("opaque batches of a cell share one geometry; the pre-pass and shadow views are single draws over the same buffers", () => {
    const root = new THREE.Group(), sb = new THREE.Group(); sb.name = "static-batched"; root.add(sb);
    const front = new THREE.MeshLambertMaterial({ color: 0xff0000 }), dbl = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), ground = new THREE.MeshLambertMaterial();
    const glass = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.5 });
    sb.add(mk(10, 10, front), mk(20, 30, dbl), mk(50, 50, ground, false), mk(30, 30, glass), mk(900, 900, front));
    expect(mergeable(sb.children[3])).toBe(false);   // transparent stays as it is
    const px = mergeCells(root, sb, { cell: 400 });
    expect(px.stats.cells).toBe(2);
    expect(px.stats.merged).toBe(4);
    expect(sb.children.length).toBe(1);   // the glass
    const cell = px.cells.children.find((m) => m.material.length === 3);
    expect(cell.castShadow).toBe(false);
    expect(cell.geometry.groups.length).toBe(3);
    const nd = px.nd.children.find((m) => m.geometry.attributes.position === cell.geometry.attributes.position);
    expect(nd).toBeTruthy();
    expect(nd.geometry.index).toBe(cell.geometry.index);
    expect(nd.geometry.drawRange.count).toBe(cell.geometry.index.count);
    expect(px.nd.visible).toBe(false);
    expect(px.shadow.visible).toBe(false);
    const sh = px.shadow.children.filter((m) => m.geometry.attributes.position === cell.geometry.attributes.position);
    expect(sh.length).toBe(2);   // front casters, double-sided casters; the ground does not cast
    const boxIdx = 36;
    expect(sh.map((m) => m.geometry.drawRange.count)).toEqual([boxIdx, boxIdx]);
    expect(sh.every((m) => m.castShadow)).toBe(true);
  });
});

describe("phone: download", () => {
  test("the data a phone fetches stays under 32 MB (the same files as desktop: no stale lite copy)", () => {
    const dir = new URL("../data/anime/", import.meta.url).pathname;
    const files = ["grids.json", "grids.bin", "layout.json", "explore.json", "trees.json", "landcover.json", ...readdirSync(dir).filter((f) => f.endsWith(".png"))];
    const bytes = files.reduce((a, f) => a + statSync(dir + f).size, 0);
    expect(bytes).toBeLessThan(32e6);
  });
});
