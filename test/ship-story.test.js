// [ship:story] The Living City story pins (src/anime/world/explore/storypins.js, data/ship/story-pins.json): the
// 波怒棄館遺跡 pin in 唐桑 (next-pass-usui.md item 5). Its facts, its sourced position inside the map, the edge rule for a
// pin outside the map, the places-list entry, the card, the signboard and the explore wiring.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { STORY, EDGE_IN, SHOW_R, pinPosition, storyPlaces, cardHTML, buildSignboard, createStoryPins, mountStoryCard } from "../src/anime/world/explore/storypins.js";

const ROOT = resolve(import.meta.dir, "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8");
const pin = STORY.pins.find((p) => p.id === "story-hanukidate");

describe("story pins: data", () => {
  test("JA and EN carry the same keys and nothing is empty", () => {
    expect(Object.keys(STORY.group).sort()).toEqual(["en", "ja"]);
    expect(Object.keys(STORY.ui.ja).sort()).toEqual(Object.keys(STORY.ui.en).sort());
    for (const p of STORY.pins) {
      for (const k of ["title", "kicker", "story", "where"]) {
        expect(Object.keys(p[k]).sort()).toEqual(["en", "ja"]);
        for (const l of ["ja", "en"]) expect(String(p[k][l]).length).toBeGreaterThan(3);
      }
      expect(p.story.ja.length).toBe(p.story.en.length);
      expect(p.sources.length).toBeGreaterThan(0);
    }
  });
  test("波怒棄館遺跡: early Jōmon, about 5,500 years ago, more than 140 kg of tuna bones, fish over 2 m, stone blades, maybe a butchering site", () => {
    expect(pin).toBeTruthy();
    const ja = pin.story.ja.join(""), en = pin.story.en.join(" ");
    expect(pin.title.ja).toContain("波怒棄館遺跡");
    expect(ja).toContain("5500年前"); expect(ja).toContain("縄文時代前期"); expect(ja).toContain("140kgを超える");
    expect(ja).toContain("2mを超える"); expect(ja).toContain("石の刃"); expect(ja).toContain("解体する場所だったのかもしれません");
    expect(en).toContain("5,500 years ago"); expect(en).toContain("early Jōmon"); expect(en).toContain("more than 140 kg");
    expect(en).toContain("over 2 m"); expect(en).toContain("stone blades"); expect(en).toContain("may have been a place where tuna were butchered");
  });
  test("no disaster framing anywhere in the pins' strings or sources", () => {
    expect(/震災|津波|防災|被災|東日本大震災|tsunami|disaster|遺構/i.test(JSON.stringify(STORY))).toBe(false);
  });
  test("the location is sourced: the prefecture's dig list (唐桑町荒谷前), the 2013 reports and GSI", () => {
    const urls = pin.sources.map((s) => s.url || "").join(" ");
    expect(urls).toContain("pref.miyagi.jp");
    expect(urls).toContain("nikkei.com");
    expect(urls).toContain("gsi.go.jp");
    expect(pin.where.ja).toContain("唐桑町荒谷前");
    expect(pin.accuracyM).toBeLessThanOrEqual(500);
    // 荒谷前 meets 国道45号 by 唐桑大沢 (GSI reverse geocoder): 38.958 N, 141.627 E
    expect(pin.lat).toBeCloseTo(38.958, 3); expect(pin.lon).toBeCloseTo(141.627, 3);
  });
});

describe("story pins: where they stand", () => {
  test("the 波怒棄館 pin is inside the map (layout ZONES.far), at its projected position, not moved to an edge", () => {
    const at = pinPosition(pin, L);
    const [x, z] = L.llToXZ(pin.lat, pin.lon);
    expect(at.inMap).toBe(true); expect(at.edge).toBe(false);
    expect(at.x).toBeCloseTo(x, 6); expect(at.z).toBeCloseTo(z, 6);
    // about 4.5 km east and 5.8 km north of the origin (内湾), on land
    expect(at.x).toBeGreaterThan(4000); expect(at.z).toBeLessThan(-5000);
    expect(L.isWater(at.x, at.z)).toBe(false);
  });
  test("a pin outside the map stands EDGE_IN m inside its nearest edge, flagged so the card says so", () => {
    const F = L.ZONES.far;
    const north = pinPosition({ lat: 39.2, lon: 141.6 }, L);
    expect(north.edge).toBe(true); expect(north.inMap).toBe(false);
    expect(north.z).toBeCloseTo(F.z0 + EDGE_IN, 6);
    expect(north.x).toBeCloseTo(L.llToXZ(39.2, 141.6)[0], 6);
    const east = pinPosition({ lat: 38.9, lon: 142.2 }, L);
    expect(east.x).toBeCloseTo(F.x1 - EDGE_IN, 6);
    expect(cardHTML(pin, "en", true)).toContain(STORY.ui.en.edge);
    expect(cardHTML(pin, "ja", false)).not.toContain(STORY.ui.ja.edge);
  });
});

describe("story pins: the drone view", () => {
  test("the board in front, the sea beyond it: the view looks toward water within 2.5 km; the board's face turns to the camera", () => {
    const p = storyPlaces(L)[0], [x, z] = p.at, v = p.view;
    const g = (a, b) => Math.max(0, L.heightAt(a, b));
    const back = Math.hypot(v.pos[0] - x, v.pos[2] - z);
    expect(back).toBeGreaterThan(30); expect(back).toBeLessThan(80);
    expect(v.pos[1]).toBeGreaterThan(g(x, z) + 15);
    expect(v.pos[1]).toBeGreaterThan(g(v.pos[0], v.pos[2]) + 5);
    // the sea is found, and the look point lies beyond the pin on the camera's far side
    expect(v.sea).toBeGreaterThan(0); expect(v.sea).toBeLessThanOrEqual(2500);
    const ahead = [v.look[0] - x, v.look[2] - z], toCam = [v.pos[0] - x, v.pos[2] - z];
    expect(ahead[0] * toCam[0] + ahead[1] * toCam[1]).toBeLessThan(0);
    // 波怒棄館: 広田湾 lies north-east (OSM 大沢漁港, 38.965 N 141.633 E)
    const bearing = (Math.atan2(ahead[0], -ahead[1]) * 180 / Math.PI + 360) % 360;
    expect(bearing).toBeGreaterThan(0); expect(bearing).toBeLessThan(135);
    // the lettered face (+z rotated by yaw) points at the camera
    const face = [Math.sin(v.yaw), Math.cos(v.yaw)], n = Math.hypot(...toCam);
    expect((face[0] * toCam[0] + face[1] * toCam[1]) / n).toBeGreaterThan(0.95);
  });
});

describe("story pins: the places list, the card, the signboard", () => {
  test("storyPlaces: one entry per pin, its own group with a JA / EN heading, found by search words", () => {
    const ps = storyPlaces(L);
    expect(ps.length).toBe(STORY.pins.length);
    const p = ps[0];
    expect(p.id).toBe("story-hanukidate"); expect(p.group).toBe("story");
    expect(p.groupLabel).toEqual({ ja: "まちの物語", en: "Stories of the town" });
    expect(p.ja).toContain("マグロ"); expect(p.en.toLowerCase()).toContain("tuna");
    expect(p.at.every(Number.isFinite)).toBe(true);
  });
  test("the card: title, the story, where and every source; text is escaped", () => {
    const ja = cardHTML(pin, "ja"), en = cardHTML(pin, "en");
    expect(ja).toContain(pin.title.ja); expect(en).toContain(pin.title.en);
    for (const t of pin.story.en) expect(en).toContain(t);
    for (const s of pin.sources) if (s.url) expect(ja).toContain(s.url.replaceAll("&", "&amp;"));
    expect(cardHTML({ ...pin, title: { ja: "<b>x</b>", en: "x" } }, "ja")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
  test("no document: no card, and nothing throws", () => {
    expect(mountStoryCard(null)).toBe(null);
  });
  test("the signboard: two posts, a board whose lettered face looks +z, a roof; a few hundred triangles at most", () => {
    const g = buildSignboard(pin.sign);
    expect(g.children.length).toBe(4);
    let tris = 0; g.traverse((o) => { if (o.isMesh) { const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } });
    expect(tris).toBeLessThan(300);
    expect(pin.sign.title).toBe("波怒棄館遺跡");
  });
  test("createStoryPins: the boards hang under one root (the ocean act hides it whole), drawn only near the camera; the action flies and opens", () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const ups = [];
    const ctx = { add: (o) => scene.add(o), onUpdate: (f) => ups.push(f), camera };
    const flown = [];
    const S = createStoryPins(ctx, { L, fly: (p) => flown.push(p.id) });
    expect(scene.children).toContain(S.root);
    expect(S.markers.length).toBe(1); expect(S.markers[0].parent).toBe(S.root);
    const [x, z] = S.places[0].at;
    camera.position.set(0, 50, 0); ups.forEach((f) => f(0.016));
    expect(S.markers[0].visible).toBe(false);
    camera.position.set(x + SHOW_R * 0.5, 80, z); ups.forEach((f) => f(0.016));
    expect(S.markers[0].visible).toBe(true);
    // hiding the root (ocean.hideWorld) is not undone by the distance toggle
    S.root.visible = false; ups.forEach((f) => f(0.016));
    expect(S.root.visible).toBe(false);
    expect(S.open("story-hanukidate")).toBe(true);
    expect(flown).toEqual(["story-hanukidate"]);
    expect(S.open("nope")).toBe(false);
  });
});

describe("story pins: wiring", () => {
  test("explore builds them, puts their group right after the boarding entry, and its search index includes them", () => {
    const ex = read("src/anime/world/explore/index.js");
    expect(ex).toMatch(/import \{ createStoryPins \} from '\.\/storypins\.js'/);
    expect(ex).toMatch(/featured\.splice\(shipPlace\.length, 0, \.\.\.storyFeat\)/);
    // the splice runs before createSearch(L, { featured }) indexes the list
    expect(ex.indexOf("featured.splice(shipPlace.length")).toBeLessThan(ex.indexOf("createSearch(L, { featured"));
  });
});
