// [v4:polish1] Polish round 1: the 風待ち heritage buildings, the Plaza Hotel and the station name (world/lotfix.js),
// hotel semantics (enrich/fold.js), the rafts only where the aerial photo shows them, the minimap colours and scales,
// street-level grading, the qa3 near-depth check.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as L from "../src/anime/world/layout.js";
import { KAZEMACHI, KAZEMACHI_LOTS, kazemachiOf, inPoly } from "../src/anime/world/harbor/real.js";
import { LOT_FIX, applyLotFix } from "../src/anime/world/lotfix.js";
import { PLAZA, PLAZA_LOTS } from "../src/anime/world/harbor/plaza.js";
import { enrichLot } from "../scripts/anime/enrich/fold.js";
import { classifyLot } from "../scripts/anime/derive.js";
import { MAP_COLORS } from "../src/anime/world/explore/basemap.js";
import { EXPLORE_LOTS } from "../src/anime/world/explore/taken.js";

const ROOT = join(import.meta.dir, "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

describe("風待ち地区 heritage buildings (harbor/real.js KAZEMACHI)", () => {
  test("every entry sits on a real hero lot and the records' storeys / heights are on the lot", () => {
    for (const [id, k] of Object.entries(KAZEMACHI)) {
      const lot = L.lotById(k.lot);
      expect([id, !!lot, lot?.zone]).toEqual([id, true, "hero"]);
      expect(k.height).toBeGreaterThan(k.storeys * 2.8);
      expect(kazemachiOf(k.lot).id).toBe(id);
    }
    expect(KAZEMACHI.otokoyama.storeys).toBe(3);
    expect(KAZEMACHI.otokoyama.height).toBeGreaterThan(10.5);
    expect(KAZEMACHI.otokoyama.height).toBeLessThan(12.5);
    expect(KAZEMACHI_LOTS.has(KAZEMACHI.kakuboshi.lot) && KAZEMACHI_LOTS.has(KAZEMACHI.takeyama.lot)).toBe(true);
    expect(EXPLORE_LOTS.has(KAZEMACHI.otokoyama.lot)).toBe(true);   // 男山本店 keeps its walk-in shop
  });
  test("the fronts face the bay road (south, +z) as the records say, and the OSM names lie in the footprints", () => {
    for (const id of ["otokoyama", "kakuboshi", "takeyama"]) {
      const lot = L.lotById(KAZEMACHI[id].lot), f = L.lotFrame(lot);
      expect([id, f.z > lot.obb.cz]).toEqual([id, true]);
    }
    expect(inPoly(-98.4, -39.8, L.lotById(KAZEMACHI.kakuboshi.lot).poly)).toBe(true);   // OSM node 角星園茶舗
    expect(inPoly(-184.5, -103.6, L.lotById(KAZEMACHI.takeyama.lot).poly)).toBe(true);  // OSM node 武山米店
    // ja.wikipedia: 38°54′25″N 141°34′22″E, within the seconds' rounding (±31 m) of the lot
    const x = (141 + 34 / 60 + 22 / 3600 - 141.575) * 86744, z = -(38 + 54 / 60 + 25 / 3600 - 38.906) * 111014;
    expect(Math.hypot(x - L.lotById(KAZEMACHI.takeyama.lot).obb.cx, z - L.lotById(KAZEMACHI.takeyama.lot).obb.cz)).toBeLessThan(31);
  });
  test("town leaves the lots to harbor; the builders and the sheets exist; no disaster wording", () => {
    expect(read("src/anime/world/town/index.js")).toContain("KAZEMACHI_LOTS.has(lot.id)");
    expect(read("src/anime/world/harbor/world.js")).toContain("buildKazemachi(ctx)");
    expect(read("scripts/anime/build-layout.js")).toContain("kazemachiOf(b?.id)");
    for (const f of ["docs/anime/landmarks/otokoyama.md", "docs/anime/landmarks/kakuboshi.md", "docs/anime/landmarks/takeyama.md", "docs/anime/landmarks/plaza-hotel.md", "src/anime/world/harbor/kazemachi.js", "src/anime/world/harbor/plaza.js"]) {
      expect(read(f)).not.toMatch(/震災|津波|被災|tsunami|disaster|earthquake/i);
    }
  });
});

describe("reference corrections (world/lotfix.js) and hotel semantics", () => {
  test("the Plaza Hotel stands on its bluff as a hotel; the station lot is named for the station", () => {
    const h = L.lotById("16/58541/25068/142");
    expect(h.kind).toBe("hotel"); expect(h.storeys).toBe(7); expect(h.landmark).toBe("plazaHotel");
    expect(h.groundY).toBeGreaterThan(L.heightAt(305, 212) - 1);   // the bluff top, not the cliff foot
    for (const id of PLAZA_LOTS) expect([id, L.lotById(id)?.landmark]).toEqual([id, "plazaHotel"]);
    expect(L.lotById("16/58538/25067/12").name).toBe("気仙沼駅");
    expect(PLAZA.floors).toBe(7);
    expect(applyLotFix({ id: "nope" })).toBe(false);
    for (const [id, f] of Object.entries(LOT_FIX)) expect([id, typeof f.src]).toEqual([id, "string"]);
  });
  test("fold: tourism=hotel on a block of 300 m² or more becomes a hotel; small inns stay shop-houses", () => {
    const classify = (kind) => classifyLot({ id: "h", code: 3101, area: 1400, h: 12, zone: "hero", shore: -200, front: null, tag: kind });
    const base = { kind: "shop", storeys: 2, height: 6.1, roofShape: "flat", roofColor: "#aaaaaa", wall: "#eeeeee", rotY: 0 };
    const big = enrichLot({ id: "h", use: "tourism:hotel", kind: "shop", osm: "w1" }, { ...base, area: 1400 }, [1, 1, 1], classify);
    expect(big.kind).toBe("hotel"); expect(big.storeys).toBeGreaterThanOrEqual(3); expect(big.roof.shape).toBe("flat");
    const inn = enrichLot({ id: "i", use: "tourism:hotel", kind: "shop", osm: "w2" }, { ...base, area: 90 }, [1, 1, 1], classify);
    expect(inn.kind).toBe("shop");
  });
  test("fold: a GSI facility name wins over a shop POI matched inside the footprint", () => {
    const base = { kind: "landmark", storeys: 1, height: 4.6, roofShape: "flat", roofColor: "#aaaaaa", wall: "#eeeeee", rotY: 0, landmark: "station" };
    const r = enrichLot({ id: "s", name: "NewDays", nameEn: "New Days", use: "shop:convenience", kind: "shop", gsiName: "気仙沼駅", gsiCat: "station", osm: "w3" }, base, [1, 1, 1], () => ({}));
    expect(r.name).toBe("気仙沼駅"); expect(r.nameEn).toBeUndefined();
    const shop = enrichLot({ id: "t", name: "角星", use: "shop:alcohol", kind: "shop" }, { ...base, landmark: null, kind: "shop" }, [1, 1, 1], () => ({}));
    expect(shop.name).toBe("角星");
  });
  test("town builds hotels as blocks of rooms", () => {
    expect(read("src/anime/world/town/hero.js")).toContain("kind === 'hotel'");
    expect(read("src/anime/world/town/mid.js")).toContain("k === 'hotel'");
    expect(classifyLot({ id: "h2", code: 3101, area: 2600, h: 12, zone: "mid", shore: -200, front: null, tag: "hotel" }).storeys).toBeGreaterThanOrEqual(6);
  });
});

describe("the bay, the maps and the look", () => {
  test("the minimap and full map: darker roads and buildings, 2.5 m / px minimap, an 8 m city layer", () => {
    expect(MAP_COLORS.roadEdge).toBe("#a39a88"); expect(MAP_COLORS.building).toBe("#c9b595");
    expect(read("src/anime/world/explore/ui.js")).toContain("const mini = { mpp: 2.5");
    expect(read("src/anime/world/explore/basemap.js")).toContain("quality === 'low' ? 12 : 8");
  });
  test("street-level grading: less shadow cooling, more saturation below 40 m", () => {
    const r = read("src/anime/core/renderer.js");
    expect(r).toContain("mix(0.40, 0.35, uStreet)"); expect(r).toContain("mix(1.07, 1.15, uStreet)");   // [v4:polish2] drone 0.55 -> 0.40
    expect(r).toContain("uStreet.value = 1 - THREE.MathUtils.smoothstep(alt, 40, 70)");
    expect(read("src/anime/world/explore/interiors.js")).toContain("opacity: 0.15, streaks: false");
  });
  test("labels hide over the tiny planet and inside the walk-ins; the phone shows at most 10", () => {
    const x = read("src/anime/world/explore/index.js");
    expect(x).toContain("!ctx.planet?.active && !api.interiors?.at?.(c.x, c.y, c.z)");
    expect(x).toContain("portrait() ? 10 : 26");
    expect(read("src/anime/world/explore/labels.js")).toContain("widths.set(key, ow)");
  });
  test("qa3 fails a walk spot with more than 25 % of a 16 x 9 ray grid closer than 6 m", () => {
    const q = read("tools/anime/qa3.mjs");
    expect(q).toContain("nearShare(window.__ctx.camera, 6, 16, 9)"); expect(q).toContain("near <= 0.25");
    expect(read("src/anime/core/renderer.js")).toContain("function nearShare(camera, near = 6, gw = 16, gh = 9)");
  });
});

// ------------------------------------------------------------------ headless builds (a fake 2D canvas, no GPU)
class Ctx2D {
  constructor(c) { this.canvas = c; this.font = "10px sans-serif"; }
  measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const s = m ? Number(m[1]) : 10; return { width: [...String(t)].length * s * 0.92 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  putImageData() {}
}
const ctxProxy = (c) => new Proxy(new Ctx2D(c), { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
class FakeCanvas { constructor() { this.width = 300; this.height = 150; this.style = {}; } getContext(t) { return t === "2d" ? (this._c ||= ctxProxy(this)) : null; } toDataURL() { return "data:,"; } addEventListener() {} }

describe("headless builds: the heritage shops, the Plaza Hotel, the text fitting", async () => {
  globalThis.document ??= { createElement: (t) => (t === "canvas" ? new FakeCanvas() : { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }), fonts: { load: async () => [] }, body: { appendChild() {} }, addEventListener() {} };
  const THREE = await import("three");
  const { createContext } = await import("../src/anime/core/ctx.js");
  const { buildKazemachi } = await import("../src/anime/world/harbor/kazemachi.js");
  const { buildPlazaHotel } = await import("../src/anime/world/harbor/plaza.js");
  const { fitFontSize, textWidth100 } = await import("../src/anime/core/textures.js");
  const scene = new THREE.Scene();
  const ctx = createContext({ scene, camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000), renderer: null, audio: null, quality: { name: "high", heroR: 1 }, sunDir: new THREE.Vector3(...L.SUN_DIR).normalize() });
  test("角星店舗 and 武山米店 (with its 土蔵) build on their lots, with the records' heights", () => {
    const K = buildKazemachi(ctx);
    expect(K.built.map((b) => b.id)).toEqual(["kakuboshi", "takeyama"]);
    const kb = K.built[0], ty = K.built[1];
    expect(kb.top - kb.y).toBeGreaterThan(7.5); expect(kb.top - kb.y).toBeLessThan(9.5);
    expect(ty.top - ty.y).toBeGreaterThan(7.2); expect(ty.kura).toBeTruthy();
    expect(L.lotById(KAZEMACHI.otokoyama.lot).storeys).toBe(3);
  });
  test("the Plaza Hotel: the tower on the bluff, the wing, the lift tower and its bridge", () => {
    const P = buildPlazaHotel(ctx);
    expect(P.lots).toContain(PLAZA.main); expect(P.lots).toContain(PLAZA.wing);
    expect(P.tower.y).toBeGreaterThan(24); expect(P.tower.top).toBeGreaterThan(45);
    expect(P.lift.top - P.lift.y).toBeGreaterThan(25);
    expect(P.bridge.len).toBeGreaterThan(20);
  });
  test("fitFontSize solves the size in one cached measurement", () => {
    const c = new FakeCanvas().getContext("2d");
    let n = 0; const m0 = c.measureText.bind(c); c.measureText = (t) => { n++; return m0(t); };
    const s = fitFontSize(c, "気仙沼市魚町二丁目の長い看板", 200, 60, "sans", 900, 6);
    expect(s).toBeLessThan(60); expect([..."気仙沼市魚町二丁目の長い看板"].length * s * 0.92).toBeLessThanOrEqual(200);
    fitFontSize(c, "気仙沼市魚町二丁目の長い看板", 300, 60, "sans", 900, 6);
    expect(n).toBe(1);
    expect(textWidth100(c, "", "sans", 900)).toBe(0);
  });
});
