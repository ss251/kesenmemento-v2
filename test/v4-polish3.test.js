// [v4:polish3] Polish round 3: the data and pure rules behind the fixes (BUILDER-GUIDE section 18).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as L from "../src/anime/world/layout.js";
import { WALK_SET, EXTRA_PLACES } from "../src/anime/world/explore/places.js";
import { KAMEYAMA } from "../src/anime/world/landmarks/sites.js";
import { SHINMEI } from "../src/anime/world/harbor/real.js";
import { FLY, FLY_RUN } from "../src/anime/core/player.js";

const ROOT = join(import.meta.dir, "..");
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); };
const inBox = (x, z, l) => { const o = l.obb, c = Math.cos(o.rotY), s = Math.sin(o.rotY), dx = x - o.cx, dz = z - o.cz; return Math.abs(dx * c - dz * s) < o.w / 2 && Math.abs(dx * s + dz * c) < o.d / 2; };

describe("forest", () => {
  const T = JSON.parse(readFileSync(join(ROOT, "data/anime/trees.json"), "utf8"));
  test("25,000 trees: 20,000 round the core out to ~1.3 km, 5,000 on 亀山", () => {
    expect(T.rows.length).toBe(25000);
    expect(T.regions.map((r) => r.n)).toEqual([20000, 5000]);
    const far = T.rows.filter((r) => Math.hypot(r[0] - L.ZONES.hero.cx, r[1] - L.ZONES.hero.cz) > 820 && Math.hypot(r[0] - 3760, r[1] - 3720) > 700);
    expect(far.length).toBeGreaterThan(8000);   // beyond the old 820 m radius
  });
  test("no tree on the 亀山 monorail or its stations and terraces", () => {
    for (const r of T.rows) {
      if (Math.hypot(r[0] - 3760, r[1] - 3720) > 700) continue;
      for (let i = 1; i < KAMEYAMA.rail.length; i++) expect(segD(r[0], r[1], KAMEYAMA.rail[i - 1], KAMEYAMA.rail[i])).toBeGreaterThan(7.5);
      for (const t of KAMEYAMA.terraces) expect(Math.hypot(r[0] - t.at[0], r[1] - t.at[1])).toBeGreaterThan(17);
    }
  });
  test("the painted canopy is the photo's dark cedar green", () => {
    const lc = JSON.parse(readFileSync(join(ROOT, "data/anime/landcover.json"), "utf8"));
    expect(lc.classes.find((c) => c.id === "forest").color).toBe("#3d6b3f");
    expect(lc.classes.find((c) => c.id === "cedar").color).toBe("#2f5634");
    const sh = readFileSync(join(ROOT, "src/anime/world/environment/terrain.js"), "utf8");
    expect(sh).toMatch(/#3d6b3f/); expect(sh).toMatch(/uNearK/);
  });
});

describe("harbour and ground", () => {
  test("the quay apron of 港町 is paving in the land cover (was a lawn strip)", async () => {
    const lc = JSON.parse(readFileSync(join(ROOT, "data/anime/landcover.json"), "utf8")).core;
    const { data, info } = await sharp(join(ROOT, "data/anime", lc.file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, z) => { const i = Math.floor((x - lc.x0) / (lc.x1 - lc.x0) * info.width), j = Math.floor((z - lc.z0) / (lc.z1 - lc.z0) * info.height), k = (j * info.width + i) * 3; return "#" + [data[k], data[k + 1], data[k + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""); };
    // the strip between the harbour road and the berths north of the fish market (z18 photo), 10-20 m from the seawall
    let paving = 0, green = 0; const PAVING = JSON.parse(readFileSync(join(ROOT, "data/anime/landcover.json"), "utf8")).classes.find((c) => c.id === "paving").color;
    for (let z = 300; z <= 460; z += 8) { const c = at(473.4 - 0.259 * (z - 237.8) - 12, z); if (c === PAVING) paving++; if (c === "#9fc076" || c === "#bccb86") green++; }
    expect(green).toBe(0);
    expect(paving).toBeGreaterThan(5);
  });
  test("the 五十鈴神社 torii stands at the stair foot, both posts clear of the footway r12723", () => {
    const [tx, tz] = SHINMEI.torii, r = L.ROADS.find((q) => q.id === "r12723"), rotY = Math.atan2(362.8 - 346.5, -137.3 + 144.6);
    for (const s of [-1, 1]) {
      const px = tx + Math.cos(rotY) * s * 1.8, pz = tz - Math.sin(rotY) * s * 1.8;
      let d = Infinity; for (let i = 1; i < r.pts.length; i++) d = Math.min(d, segD(px, pz, r.pts[i - 1], r.pts[i]));
      expect(d).toBeGreaterThan(r.width / 2 + 0.3);
    }
    expect(Math.hypot(tx - 346.5, tz + 144.6)).toBeLessThan(3);
    expect(L.SPOTS.isuzuTorii.x).toBe(tx); expect(L.SPOTS.isuzuTorii.z).toBe(tz);
  });
  test("roads carry an OSM carriageway where the way is tagged, never wider than the road", () => {
    const withC = L.ROADS.filter((r) => r.carriage);
    expect(withC.length).toBeGreaterThan(500);
    for (const r of withC) { expect(r.carriage).toBeLessThanOrEqual(r.width); expect(r.carriage).toBeGreaterThanOrEqual(3); }
  });
});

describe("explore", () => {
  test("fly is 25 m/s, Shift 70 m/s", () => { expect(FLY).toBe(25); expect(FLY_RUN).toBe(70); });
  test("the hand walk spots of round 3 stand on land, outside every footprint", () => {
    for (const id of ["lm-newCityHall", "catholic", "kannonji", "plazaHotel", "lm-oshimaTerminal", "lm-seigoji", "library", "civicHall", "hogenji", "lm-ikkeijima"]) {
      const w = WALK_SET[id]; expect(w).toBeTruthy();
      expect(L.isWater(w.x, w.z)).toBe(false);
      expect(L.LOTS.some((l) => Math.abs(l.obb.cx - w.x) < 80 && Math.abs(l.obb.cz - w.z) < 80 && inBox(w.x, w.z, l))).toBe(false);
    }
  });
  test("気仙沼市民会館 is at the hall (OSM relation 12442922), not on the junior high", () => {
    const p = EXTRA_PLACES.find((q) => q.id === "civicHall");
    expect(Math.hypot(p.at[0] + 190, p.at[1] - 574)).toBeLessThan(5);
    expect(p.src).toBe("osm");
  });
  test("labels stay inside the viewport and off the minimap", () => {
    const src = readFileSync(join(ROOT, "src/anime/world/explore/labels.js"), "utf8");
    expect(src).toMatch(/#klc-x \.mini/);
    expect(src).toMatch(/blockers\.some/);
  });
});

describe("data", () => {
  test("気仙沼郵便局 has the photo's flat roof; the church's reference height is its nave ridge", () => {
    const po = L.lotById("16/58539/25068/442"); expect(po.roof.shape).toBe("flat"); expect(po.height).toBe(14);
    const ch = L.lotById("16/58539/25068/472"); expect(ch.height).toBe(10.1);
    const lm = JSON.parse(readFileSync(join(ROOT, "docs/anime/landmarks/landmarks.json"), "utf8")).landmarks;
    expect(lm.find((l) => l.id === "kesennuma-orthodox-church").ridge_m).toBe(10.1);
  });
});
