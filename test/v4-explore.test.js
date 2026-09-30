// [v4:explore] The explore package: streamed core tiles, the road network and the car, the places and their framings,
// search, stream batching, physics tags, the interiors' lot, i18n and wiring. Pure modules only (no browser).
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import * as L from "../src/anime/world/layout.js";
import { CORE, TILE, tileOf, tileDist, inCore, patchLots, buildTiles, coreRoads, allRoads, ringOrder } from "../src/anime/world/explore/tiles.js";
import { wantLevel, RADII } from "../src/anime/world/explore/stream.js";
import { makeRoadNet } from "../src/anime/world/explore/roadnet.js";
import { carStep, CAR } from "../src/anime/world/explore/drive.js";
import { EXTRA_PLACES, placeStops, droneFraming, walkFraming, viewDistance, WALK_SET, WALK_NEAR, makeTreeAt } from "../src/anime/world/explore/places.js";
import { createSearch, fold } from "../src/anime/world/explore/search.js";
import { StreamBatch, packable, convertible } from "../src/anime/world/explore/sbatch.js";
import { catGroup, LABEL_KINDS } from "../src/anime/world/explore/labels.js";
import { EXPLORE_LOTS } from "../src/anime/world/explore/taken.js";
import { PLACES_B } from "../src/anime/world/landmarks/sites.js";
import { Physics } from "../src/anime/core/physics.js";
import { makeLotIndex } from "../src/anime/world/town/common.js";
import { buildExplore } from "../scripts/anime/build-explore.js";
import I18N from "../data/i18n.json";

const ROOT = join(import.meta.dir, "..");
const X = await L.loadData("explore.json");
patchLots(L, X);
L.registerRoads(X.roads);
const tiles = buildTiles(L, X);
const net = makeRoadNet(allRoads(L, X));
const idx = makeLotIndex(L.LOTS.filter((l) => inCore(l.obb.cx, l.obb.cz, 50)));
const inLot = (x, z) => !!idx.at(x, z, 0.4);

describe("explore.json (scripts/anime/build-explore.js)", () => {
  test("is deterministic and matches the committed file", async () => {
    const { out } = await buildExplore();
    expect(JSON.stringify(out)).toBe(readFileSync(join(ROOT, "data/anime/explore.json"), "utf8"));
  }, 60000);
  test("restores the far core: full-precision roads with alleys, real footprints for every far core lot", () => {
    expect(X.roads.length).toBeGreaterThan(3000);
    expect(X.roads.filter((r) => r.kind === "alley").length).toBeGreaterThan(1000);
    expect(X.roads.every((r) => r.zone === "far" && r.pts.length >= 2 && r.width > 0)).toBe(true);
    const farCore = L.LOTS.filter((l) => l.zone === "far" && inCore(l.obb.cx, l.obb.cz));
    const withPoly = farCore.filter((l) => l.explore);
    expect(withPoly.length / farCore.length).toBeGreaterThan(0.99);
    // the true footprint, not the box: most polygons are not rectangles
    expect(withPoly.filter((l) => l.poly.length > 4).length).toBeGreaterThan(1500);
  });
  test("frontage roads resolve, and patchLots is idempotent", () => {
    expect(patchLots(L, X)).toBe(0);
    const far = L.LOTS.filter((l) => l.explore && l.front.roadId);
    expect(far.length).toBeGreaterThan(8000);
    expect(far.slice(0, 500).every((l) => L.roadById(l.front.roadId))).toBe(true);
  });
});

describe("tiles", () => {
  test("a 100 m grid over the z18 core", () => {
    expect(TILE).toBe(100);
    expect(tileOf(CORE.x0 + 1, CORE.z0 + 1).key).toBe("0:0");
    const t = tiles.get(tileOf(-661, -53).key);
    expect(tileDist(t, -661, -53)).toBe(0);
  });
  test("every streamed lot is in exactly one tile, the tile of its box centre; hero, landmarks and piers are not", () => {
    const seen = new Set();
    for (const t of tiles.values()) for (const l of [...t.mid, ...t.far]) {
      expect(seen.has(l.id)).toBe(false); seen.add(l.id);
      expect(tileOf(l.obb.cx, l.obb.cz).key).toBe(t.key);
      expect(l.zone).not.toBe("hero");
      expect(l.landmark).toBeFalsy();
    }
    expect(seen.size).toBeGreaterThan(11000);
    const mid = L.LOTS.filter((l) => l.zone === "mid" && !l.landmark && l.kind !== "shrine" && l.kind !== "temple" && l.kind !== "landmark" && l.obb.w >= 2 && l.obb.d >= 2 && L.shoreDist(l.obb.cx, l.obb.cz) <= 0.5 && inCore(l.obb.cx, l.obb.cz));
    expect(mid.every((l) => seen.has(l.id))).toBe(true);
  });
  test("nearest tiles first", () => {
    const o = ringOrder(tiles, 0, 0);
    expect(tileDist(tiles.get(o[0]), 0, 0)).toBeLessThanOrEqual(tileDist(tiles.get(o[20]), 0, 0));
  });
  test("coreRoads = hero / mid roads + the far core's", () => {
    const r = coreRoads(L, X);
    expect(r.length).toBeGreaterThan(X.roads.length);
    expect(r.some((q) => q.zone === "hero")).toBe(true);
  });
});

describe("streaming levels (wantLevel)", () => {
  const R = RADII.high;
  test("on the ground: kit detail close, streets and simplified buildings farther, nothing beyond", () => {
    expect(wantLevel(20, "ground", R)).toEqual({ l0: true, l1: true });
    expect(wantLevel(R.l0 + 10, "ground", R)).toEqual({ l0: false, l1: true });
    expect(wantLevel(R.l1 + 10, "ground", R)).toEqual({ l0: false, l1: false });
  });
  test("from the drone: no kit detail, a wider coarse ring", () => {
    expect(wantLevel(10, "high", R).l0).toBe(false);
    expect(wantLevel(R.l1 * 1.4, "high", R).l1).toBe(true);
  });
  test("hysteresis: a loaded tile stays loaded a little past its load radius", () => {
    expect(wantLevel(R.l0 + 20, "ground", R, { l0: true, l1: true }).l0).toBe(true);
    expect(wantLevel(R.l1 + 30, "ground", R, { l0: false, l1: true }).l1).toBe(true);
    expect(wantLevel(R.l1 + 30, "ground", R).l1).toBe(false);
  });
  test("the low tier keeps smaller rings", () => {
    expect(RADII.low.l0).toBeLessThan(RADII.high.l0);
    expect(RADII.low.l1).toBeLessThan(RADII.high.l1);
  });
});

describe("road network and the car", () => {
  const r = L.roadById("r12500");   // 気仙沼街道 (prefectural 26) in 三日町
  test("centre-lines are on the road; clampToRoad pulls a point back inside the carriageway", () => {
    const [a, b] = r.pts, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    expect(net.onRoad(m[0], m[1])).toBe(true);
    const n = net.nearest(m[0] + 30, m[1] + 30, 80);
    expect(n).toBeTruthy();
    const c = net.clampToRoad(m[0] + 0.1, m[1] + 20, 0.6);
    expect(net.onRoad(c.x, c.z, 0.5)).toBe(true);
  });
  test("spawn: on the left lane, facing along the road", () => {
    const s = net.spawn(-661, -53, 0);
    expect(net.onRoad(s.x, s.z)).toBe(true);
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const n = net.nearest(s.x, s.z, 20);
    expect(Math.abs(fx * n.dx + fz * n.dz)).toBeGreaterThan(0.95);
    // left of the driving direction: (fz, -fx) in this frame
    const lx = fz, lz = -fx;
    expect((s.x - n.x) * lx + (s.z - n.z) * lz).toBeGreaterThan(0.5);
  });
  test("carStep: accelerates to the town speed, brakes, reverses slowly, turns right clockwise within grip", () => {
    let s = { x: 0, z: 0, yaw: 0, speed: 0, steer: 0 };
    for (let i = 0; i < 400; i++) s = carStep(s, { throttle: 1 }, 0.05);
    expect(s.speed).toBeGreaterThan(CAR.vMax * 0.9); expect(s.speed).toBeLessThanOrEqual(CAR.vMax + 1e-6);
    expect(s.z).toBeLessThan(-50);   // yaw 0 drives north (-Z)
    const y0 = s.yaw;
    for (let i = 0; i < 10; i++) s = carStep(s, { throttle: 0.2, steer: 1 }, 0.05);
    expect(s.yaw).toBeLessThan(y0);
    expect((y0 - s.yaw) / 0.5).toBeLessThanOrEqual(6 / Math.max(0.5, s.speed) + 0.2);
    for (let i = 0; i < 80; i++) s = carStep(s, { brake: true }, 0.05);
    expect(Math.abs(s.speed)).toBeLessThan(0.01);
    for (let i = 0; i < 200; i++) s = carStep(s, { throttle: -1 }, 0.05);
    expect(s.speed).toBeGreaterThanOrEqual(-CAR.vRev - 1e-6); expect(s.speed).toBeLessThan(0);
  });
});

describe("places (tour + places list)", () => {
  const stops = placeStops(L, net, EXTRA_PLACES, { inLot });
  test("20+ real places, unique ids, JA and EN names", () => {
    expect(EXTRA_PLACES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EXTRA_PLACES.map((p) => p.id)).size).toBe(EXTRA_PLACES.length);
    for (const p of EXTRA_PLACES) { expect(p.ja.length).toBeGreaterThan(1); expect(p.en.length).toBeGreaterThan(3); }
  });
  test("every place is a real named feature of the data within 60 m of its position", () => {
    for (const p of EXTRA_PLACES) {
      const hit = L.PLACES.find((q) => q.name === (p.ref || p.ja) && Math.hypot(q.x - p.at[0], q.z - p.at[1]) < 60);
      expect([p.id, !!hit]).toEqual([p.id, true]);
    }
  });
  test("every place has a drone framing over land with a clear view and a walk spot on a street", () => {
    for (const s of stops) {
      expect(s.drone.pos[1]).toBeGreaterThan(L.heightAt(s.drone.pos[0], s.drone.pos[2]) + 15);
      expect(s.walk).toBeTruthy();
      expect(inLot(s.walk.x, s.walk.z)).toBe(false);
      expect(L.isWater(s.walk.x, s.walk.z)).toBe(false);
      // [v4:polish1] hand-set spots may stand on a shrine stair (a walk ramp); the rest stand on a street
      if (!WALK_SET[s.id]) expect(net.onRoad(s.walk.x, s.walk.z, -0.3)).toBe(true);
      expect(s.walk.dist).toBeLessThan(160);
    }
  });
  // [v4:integrate] walk spots look at the place over a clear line of sight (lots, terrain), from 8 m or more
  test("walk spots see their place: a clear sight line past other buildings and the terrain, at least 8 m away", () => {
    const lotAt = (x, z) => idx.at(x, z, 0.4);
    const all = [...EXTRA_PLACES, ...PLACES_B.filter((p) => !p.walk).map((p) => ({ ...p, id: "lm-" + p.id }))];
    let clear = 0;
    for (const p of all) {
      const w = walkFraming(L, net, p.at[0], p.at[1], { lotAt });
      expect([p.id, !!w]).toEqual([p.id, true]);
      expect(w.dist).toBeGreaterThanOrEqual(8);
      expect(lotAt(w.x, w.z)).toBeFalsy();
      if (w.clear) clear++;
    }
    expect(clear / all.length).toBeGreaterThan(0.9);
    const segs = net.segmentsNear(-508.8, -142.6, 40);
    expect(segs.length).toBeGreaterThan(0);
    expect(new Set(segs).size).toBe(segs.length);
  });
  // [v4:polish1] the viewing distance follows the place's own footprint; nothing stands within 6 m of the eye
  test("walk spots stand back by the place's size, with nothing (a wall, a tree) in the first 6 m", () => {
    const lotAt = (x, z) => idx.at(x, z, 0.4);
    expect(viewDistance(null)).toBe(30);
    expect(viewDistance({ obb: { w: 10, d: 8 } })).toBe(25);
    expect(viewDistance({ obb: { w: 60, d: 30 } })).toBeCloseTo(0.6 * 60 / Math.tan(26 * Math.PI / 180), 5);
    expect(viewDistance({ obb: { w: 200, d: 90 } })).toBe(110);
    const trees = JSON.parse(readFileSync(join(ROOT, "data/anime/trees.json"), "utf8")).rows.map(([x, z, y, t, h, r]) => ({ x, z, y, h, r }));
    const treeAt = makeTreeAt(trees);
    const all = [...EXTRA_PLACES, ...PLACES_B.map((p) => ({ ...p, id: "lm-" + p.id }))].filter((p) => !WALK_SET[p.id] && !p.walk);
    for (const p of all) {
      const w = walkFraming(L, net, p.at[0], p.at[1], { lotAt, treeAt });
      if (!w.clear) continue;
      const own = lotAt(p.at[0], p.at[1]);
      // a big hall is seen from well back (the police station, 49 m, from 60 m), not from its doorstep; the streets
      // round a bluff (気仙沼プラザホテル) allow half the ideal distance
      if (own && Math.max(own.obb.w, own.obb.d) > 40) expect([p.id, w.dist >= Math.min(45, viewDistance(own) * 0.5)]).toEqual([p.id, true]);
      const ey = L.heightAt(w.x, w.z) + 1.6, a = w.yaw * Math.PI / 180;
      for (let u = 0.5; u <= WALK_NEAR; u += 0.5) {
        const px = w.x - Math.sin(a) * u, pz = w.z - Math.cos(a) * u;
        expect([p.id, u, !!lotAt(px, pz), treeAt(px, pz, ey)]).toEqual([p.id, u, false, false]);
      }
    }
    // the hand-set spots (checked by screenshot and qa3's near-depth check) stand outside every lot, on land
    for (const [id, w] of Object.entries(WALK_SET)) { expect([id, !!lotAt(w.x, w.z), L.isWater(w.x, w.z)]).toEqual([id, false, false]); }
  });
  test("framings are deterministic", () => {
    expect(droneFraming(L, -508.8, -142.6)).toEqual(droneFraming(L, -508.8, -142.6));
    expect(walkFraming(L, net, -508.8, -142.6, { inLot })).toEqual(walkFraming(L, net, -508.8, -142.6, { inLot }));
  });
});

describe("search (JA / EN)", () => {
  const S = createSearch(L, { featured: EXTRA_PLACES.map((p) => ({ ...p, group: "places" })), near: () => [0, 0] });
  test("exact Japanese names, katakana folded to hiragana, English names", () => {
    expect(S.find("気仙沼駅", 3)[0].ja).toBe("気仙沼駅");
    expect(fold("マイヤ")).toBe(fold("まいや"));
    expect(S.find("まいや", 5).some((p) => p.ja.startsWith("マイヤ"))).toBe(true);
    expect(S.find("Kesennuma Post Office", 3)[0].ja).toBe("気仙沼郵便局");
    expect(S.find("otokoyama", 3)[0].id).toBe("otokoyama");
  });
  test("kinds in either language list the nearest places of that kind, one per place", () => {
    const h = S.find("hospital", 8);
    expect(h.length).toBeGreaterThan(3);
    expect(h.every((p) => /hospital|clinic|doctors/.test(p.cat))).toBe(true);
    expect(new Set(h.map((p) => p.ja)).size).toBe(h.length);
    expect(S.find("寿司", 5).length).toBeGreaterThan(2);
  });
  test("the neighbourhood (町名) under a point", () => {
    expect(S.areaAt(-661, -53).ja).toMatch(/三日町/);
  });
  test("label kinds and colour groups", () => {
    expect(LABEL_KINDS.test("school")).toBe(true); expect(LABEL_KINDS.test("company")).toBe(false);
    expect(catGroup("place_of_worship")).toBe("temple"); expect(catGroup("bus_stop")).toBe("station");
  });
});

describe("stream batching", () => {
  const ctx = { add: () => {}, mat: null };
  const mk = (color, x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ color })); m.position.x = x; return m; };
  test("packable / convertible", () => {
    expect(packable(mk("#fff", 0))).toBe(true);
    expect(packable(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial()))).toBe(false);
    expect(packable(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshToonMaterial(), 2))).toBe(false);
    expect(convertible(new THREE.MeshToonMaterial())).toBe(false);   // not a ctx.mat.toon material
  });
  test("entries share a slot, hide and come back, and leave no holes", () => {
    const sb = new StreamBatch(ctx, { name: "t" });
    const mat = new THREE.MeshToonMaterial({ color: "#abc" });
    const grp = (x) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.position.x = x; g.add(m); return g; };
    sb.add("a", grp(0), { slot: "blk" }); sb.add("b", grp(5), { slot: "blk" }); sb.add("c", grp(9));
    sb.flush();
    let s = sb.stats();
    expect(s.pools).toBe(1); expect(s.slots).toBe(2); expect(s.verts).toBe(72);
    sb.setVisible("a", false); sb.flush();
    s = sb.stats(); expect(s.verts).toBe(48);
    sb.setVisible("a", true); sb.remove("b"); sb.flush();
    s = sb.stats(); expect(s.verts).toBe(48); expect(s.entries).toBe(2);
    sb.remove("a"); sb.remove("c"); sb.flush();
    expect(sb.stats().slots).toBe(0);
  });
  // [v4:polish3] qa3's walk loop drew a tile's windows without its walls: the flush budget ran out part-way through a
  // change and the later pools waited. A change (group()) is now drawn whole in one flush, across every pool.
  test("a grouped change is flushed whole across pools, even over budget", () => {
    const sb = new StreamBatch(ctx, { name: "t3" });
    const mats = [0, 1, 2, 3].map((i) => new THREE.MeshToonMaterial({ color: "#" + String(i + 1).repeat(3) }));
    const grp = (x) => { const g = new THREE.Group(); mats.forEach((m, i) => { const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1 + i, 1), m); o.position.x = x; g.add(o); }); return g; };
    sb.add("m1", grp(0), { slot: "blk" }); sb.flush();
    sb.group(() => { sb.add("k0", grp(0)); sb.setVisible("m1", false); });
    sb.add("other", grp(50));
    const left = sb.flush(null, -1);   // budget already spent: still the whole first change
    expect(left).toBe(4);              // the later change waits, all four of its pools
    for (const p of sb.pools.values()) {
      const shown = [...p.slots.values()].filter((s) => s.shown && s.v).map((s) => s.key);
      expect(shown).toEqual(["k0"]);    // every pool: the kit shown, the block hidden
    }
    sb.flush(); expect(sb.pending()).toBe(0);
  });
  test("long churn (optimize and growth) keeps every slot intact", () => {
    const sb = new StreamBatch(ctx, { name: "t4" });
    const mat = new THREE.MeshToonMaterial({ color: "#abc" });
    const grp = (x, n) => { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), mat); o.position.set(x, i, 0); g.add(o); } return g; };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const live = new Set();
    for (let it = 0; it < 400; it++) {
      const k = "e" + Math.floor(rnd() * 40);
      if (live.has(k) && rnd() < 0.5) { sb.remove(k); live.delete(k); }
      else { sb.add(k, grp(Math.floor(rnd() * 1000), 1 + Math.floor(rnd() * 30)), rnd() < 0.3 ? { slot: "blk" + Math.floor(rnd() * 3) } : {}); live.add(k); }
      if (rnd() < 0.3) sb.flush();
    }
    sb.flush();
    const st = sb.stats(), v = sb.validate();
    expect(st.optimized).toBeGreaterThan(0); expect(st.grown).toBeGreaterThan(0);
    expect(v.nBad).toBe(0);
    expect(st.entries).toBe(live.size);
  });
  test("baked world positions", () => {
    const sb = new StreamBatch(ctx, { name: "t2" });
    const g = new THREE.Group(); g.add(mk("#fff", 100)); sb.add("k", g); sb.flush();
    const bm = [...sb.pools.values()][0].bm;
    const box = new THREE.Box3(); bm.getBoundingBoxAt(0, box);
    expect(box.min.x).toBeCloseTo(99.5, 3);
  });
});

describe("physics tags (streamed colliders)", () => {
  test("removeTag takes out exactly the tagged colliders; removeNear cuts a doorway", () => {
    const P = new Physics(() => 0);
    P.addBox(0, 0, 1, 1);
    P.tag = "t1"; P.addBox(5, 0, 1, 1); P.addBox(6, 0, 1, 1); P.tag = null;
    expect(P.count).toBe(3); expect(P.tagged("t1")).toBe(2);
    const p = { x: 5.1, z: 0 }; P.resolve(p, 0.3, 0, 1.7); expect(Math.abs(p.x - 5.1) + Math.abs(p.z)).toBeGreaterThan(0.05);
    expect(P.removeTag("t1")).toBe(2);
    const q = { x: 5.1, z: 0 }; P.resolve(q, 0.3, 0, 1.7); expect(q.x).toBe(5.1);
    expect(P.count).toBe(1);
    expect(P.removeNear(0, 0, 1).length).toBe(1); expect(P.count).toBe(0);
  });
});

describe("wiring", () => {
  test("the explore module is registered after life and town leaves its lots to it", () => {
    const main = readFileSync(join(ROOT, "src/anime/main.js"), "utf8");
    expect(main).toMatch(/'life', 'explore'\]/);
    const town = readFileSync(join(ROOT, "src/anime/world/town/index.js"), "utf8");
    expect(town).toMatch(/EXPLORE_LOTS\.has\(lot\.id\)/);
    expect(town).toMatch(/exploreOwnsMid/);
  });
  test("the walk-in shop lot is 男山本店's", () => {
    const lot = L.lotById([...EXPLORE_LOTS][0]);
    expect(lot.name).toMatch(/男山本店/);
  });
  test("every v4.x string exists in Japanese and English", () => {
    const ja = Object.keys(I18N.ja).filter((k) => k.startsWith("v4.x.")), en = Object.keys(I18N.en).filter((k) => k.startsWith("v4.x."));
    expect(ja.length).toBeGreaterThan(20); expect(ja.sort()).toEqual(en.sort());
    const src = readdirSync(join(ROOT, "src/anime/world/explore")).map((f) => readFileSync(join(ROOT, "src/anime/world/explore", f), "utf8")).join("\n");
    for (const m of src.matchAll(/I\.t\('(v4\.x\.[\w.]+)'\)/g)) expect(I18N.ja[m[1]]).toBeDefined();
  });
  test("no Math.random and no TODO / stub in the package", () => {
    for (const f of readdirSync(join(ROOT, "src/anime/world/explore"))) {
      const s = readFileSync(join(ROOT, "src/anime/world/explore", f), "utf8");
      expect([f, /Math\.random\(/.test(s)]).toEqual([f, false]);
      expect([f, /\bTODO\b|\bstub\b|FIXME/i.test(s)]).toEqual([f, false]);
    }
  });
  test("no place, label or string refers to the 2011 disaster", () => {
    const bad = /震災|津波|東日本大震災|tsunami|disaster|遺構/i;
    for (const p of EXTRA_PLACES) expect(bad.test(p.ja + p.en)).toBe(false);
    for (const [k, v] of Object.entries(I18N.ja)) if (k.startsWith("v4.x.")) expect(bad.test(v)).toBe(false);
  });
});
