// [v6:c5r3] Cell c5, round 3: the 気仙沼信用金庫 ribbon block, the 三事堂ささ木 plaster shop, the grave terraces, the new two-lane
// road west of 気仙沼小, and the same-lot place dedupe. Data checks on layout.json and the override file, no browser.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FACADES } from "../scripts/anime/enrich/overrides.js";
import { STYLE } from "../src/anime/world/town/facade.js";
import { LOOK, PAVED } from "../src/anime/world/town/landuse.js";

const ROOT = join(import.meta.dir, "..");
const J = (f) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));
const C5 = J("data/anime/overrides/c5.json");
const LAY = J("data/anime/layout.json");
const lot = (id) => LAY.lots.find((l) => l.id === id);
const road = (id) => LAY.roads.find((r) => r.id === id);

describe("c5r3 gets the facts of the evidence", () => {
  test("気仙沼信用金庫 本店: pale blue-grey ribbon block, 5 storeys, 15.3 m kept", () => {
    for (const id of ["16/58540/25068/172", "16/58540/25068/168"]) {
      const l = lot(id);
      expect(l.wall).toBe("#adb9c4");
      expect(l.facade).toBe("ribbon");
      expect(l.storeys).toBe(5);
      expect(l.height).toBe(15.3);
      expect(l.src.wall).toBe("override");
    }
    expect(FACADES).toContain("ribbon");
    expect(STYLE.ribbon).toBe(7);
    const o = C5.lots.find((x) => x.id === "16/58540/25068/172");
    expect(o.src).toContain("Kesennuma Shinkin.jpg");
  });

  test("a measured office keeps its kind in classifyHero; the ribbon style is a block builder, not the shop-front kit", () => {
    const hero = readFileSync(join(ROOT, "src/anime/world/town/hero.js"), "utf8");
    expect(hero).toContain("!(kind === 'office' && measuredKind && lot.storeys >= 3)");
    const blocks = readFileSync(join(ROOT, "src/anime/world/town/blocks.js"), "utf8");
    expect(blocks).toContain("const ribbon = lot.facade === 'ribbon';");
    expect(blocks).toContain("measuredWall(lot) && lot.wall ? lot.wall : body0");
  });

  test("三事堂ささ木 (/96): white plaster, grey gable roof along the frontage, 2 storeys 7.4 m; the footprint and the neighbours are untouched", () => {
    const l = lot("16/58540/25068/96");
    expect(l.wall).toBe("#f4f4f0");
    expect(l.storeys).toBe(2);
    expect(l.height).toBe(7.4);
    expect(l.roof.shape).toBe("gable");
    expect(l.roof.ridge).toBe("x");
    expect(l.area).toBe(66);
    expect(LAY.lots.some((x) => x.id.startsWith("ovr:c5:") && /sanjido|sasaki|sasa/i.test(x.id))).toBe(false);
    expect(C5.lots.some((x) => x.id === "16/58540/25068/139" && (x.wall || x.facade))).toBe(false);
  });
});

describe("c5r3 land: grave terraces", () => {
  const rings = LAY.landuse.filter((l) => l.ovr && /^c5\.json#landuse\/[3-6]$/.test(l.ovr));
  test("the four override terraces are grave class with a measured swatch", () => {
    expect(rings.length).toBe(4);
    for (const l of rings) { expect(l.cls).toBe("grave"); expect(l.col).toMatch(/^#[0-9a-f]{6}$/); }
    expect(LOOK.grave).toBeDefined();
    expect(PAVED.has("grave")).toBe(true);
  });
  test("every swatch is darker than the old gravel and than the OSM cemetery grey", () => {
    const L = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (const l of rings) expect(L(l.col)).toBeLessThan(L("#97938b") + 8);
    expect(L(LOOK.cemetery.col)).toBeLessThan(L("#97938b") - 40);
  });
  test("the south lobe (landuse/6) is the 20-30 m strip, not the 69 x 110 m patch", () => {
    const r = rings.find((l) => l.ovr.endsWith("/6"));
    const xs = r.ring.map((p) => p[0]), zs = r.ring.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-395);
    expect(Math.max(...xs)).toBeLessThanOrEqual(-346);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(86);
    expect(Math.max(...zs)).toBeLessThanOrEqual(205);
    expect(r.area).toBeLessThan(2800);
  });
});

describe("c5r3 road: the two-lane road west of 気仙沼小", () => {
  const trunk = () => road("ovr:c5:trunk-se");
  test("an 11 m reserve with a 7 m carriageway (sidewalks) from the north-west bend to the junction at (-426.6, 373.3)", () => {
    for (const r of [road("r13876"), trunk()]) { expect(r.width).toBe(11); expect(r.carriage).toBe(7); expect(r.kind).toBe("city"); }
    const t = trunk(); expect(t.pts.at(-1)).toEqual([-426.6, 373.3]);
    expect(road("r13876").pts.at(-1)).toEqual(t.pts[0]);
    expect(road("r13887").pts[0]).toEqual(t.pts[0]);
  });
  test("it is not the finding's rounded polyline: the traced centre line sits on the asphalt", () => {
    const t = trunk().pts;
    // the finding's (-441,345) lay about 13 m north-east of the carriageway at that z; the traced line is near x -452 there
    const at = (z) => { for (let i = 0; i < t.length - 1; i++) if (t[i][1] <= z && z <= t[i + 1][1]) return t[i][0] + ((z - t[i][1]) / (t[i + 1][1] - t[i][1])) * (t[i + 1][0] - t[i][0]); return null; };
    expect(at(345)).toBeLessThan(-448);
    expect(at(345)).toBeGreaterThan(-456);
  });
  test("no tree stands on the carriageway", () => {
    const T = J("data/anime/trees.json"), ix = T.fields.indexOf("x"), iz = T.fields.indexOf("z");
    const pts = [...road("r13876").pts, ...trunk().pts.slice(1)];
    const d = (x, z) => { let best = 1e9; for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - (x0 + t * dx), z - (z0 + t * dz))); } return best; };
    expect(T.rows.filter((r) => d(r[ix], r[iz]) < 5).length).toBe(0);
  });
});

describe("c5r3 places: one facility, one place", () => {
  test("ツルハドラッグ 気仙沼八日町店 is one place on lot /444", () => {
    const ps = LAY.places.filter((p) => p.lot === "16/58539/25068/444" && /^ツルハ/.test(p.name));
    expect(ps.map((p) => p.name)).toEqual(["ツルハドラッグ 気仙沼八日町店"]);
    expect(LAY.places.filter((p) => p.name === "ツルハドラッグ").length).toBe(3);   // the other three are other shops
  });
  test("no two places share a lot and a category with one name a strict prefix of the other", () => {
    const byLot = new Map();
    for (const p of LAY.places) if (p.lot) { if (!byLot.has(p.lot)) byLot.set(p.lot, []); byLot.get(p.lot).push(p); }
    for (const [, ps] of byLot) for (const a of ps) for (const b of ps) if (a !== b && a.cat === b.cat) expect(b.name.length > a.name.length && b.name.startsWith(a.name)).toBe(false);
  });
});
