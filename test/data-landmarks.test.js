// data/landmarks.json: tour stops (BUILD-SPEC §3 schema, §7 stops), cross-checked against the terrain and footprints.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BBOX, llToEnu, sampleGrid } from "../src/core/geo.js";

const ROOT = join(import.meta.dir, "..");
const P = join(ROOT, "data/landmarks.json");
const have = existsSync(P) && existsSync(join(ROOT, "data/terrain/city.f32"));
const IDS = ["bay", "market", "pier7", "kanae", "oshima", "anba", "karakuwa"];

describe.skipIf(!have)("landmarks.json", () => {
  let stops, ground;
  const load = async () => {
    if (stops) return;
    stops = await Bun.file(P).json();
    const grids = [];
    for (const n of ["core", "city"]) {
      grids.push({
        meta: await Bun.file(join(ROOT, `data/terrain/${n}.json`)).json(),
        h: new Float32Array(await Bun.file(join(ROOT, `data/terrain/${n}.f32`)).arrayBuffer()),
      });
    }
    ground = (x, z) => {
      for (const g of grids) {
        const v = sampleGrid(g.h, g.meta, x, z);
        if (!Number.isNaN(v)) return v;
      }
      return 0;
    };
  };
  const byId = (id) => stops.find((s) => s.id === id);

  test("seven stops with the spec schema", async () => {
    await load();
    expect(Array.isArray(stops)).toBe(true);
    expect(stops.map((s) => s.id)).toEqual(IDS);
    const [lonMin, latMin, lonMax, latMax] = BBOX.city;
    for (const s of stops) {
      for (const k of ["ja", "en"]) expect(typeof s[k]).toBe("string");
      expect(s.lat).toBeGreaterThan(latMin);
      expect(s.lat).toBeLessThan(latMax);
      expect(s.lon).toBeGreaterThan(lonMin);
      expect(s.lon).toBeLessThan(lonMax);
      expect(s.cam.pos.length).toBe(3);
      expect(s.cam.look.length).toBe(3);
      expect(s.splat === null || typeof s.splat === "string").toBe(true);
      expect(s.blurb.ja.length).toBeGreaterThan(5);
      expect(s.blurb.en.length).toBeGreaterThan(5);
      expect(typeof s.verified).toBe("string");
      const e = llToEnu(s.lat, s.lon);
      expect(Math.abs(s.enu[0] - e.x)).toBeLessThan(0.1);
      expect(Math.abs(s.enu[2] - e.z)).toBeLessThan(0.1);
    }
  });

  test("cameras sit above the terrain and look somewhere else", async () => {
    await load();
    for (const s of stops) {
      const [x, y, z] = s.cam.pos;
      expect(y).toBeGreaterThanOrEqual(Math.max(0, ground(x, z)) + 1.5);
      expect(Math.hypot(...s.cam.look.map((v, i) => v - s.cam.pos[i]))).toBeGreaterThan(10);
    }
  });

  test("§7 camera heights", async () => {
    await load();
    const above = (id) => {
      const [x, y, z] = byId(id).cam.pos;
      return y - Math.max(0, ground(x, z));
    };
    expect(above("bay")).toBeCloseTo(120, 0);
    expect(above("market")).toBeCloseTo(80, 0);
    expect(above("pier7")).toBeCloseTo(1.6, 1);
    expect(above("kanae")).toBeCloseTo(60, 0);
    expect(above("oshima")).toBeCloseTo(150, 0);
    expect(above("karakuwa")).toBeCloseTo(900, 0);
  });

  test("verified coordinates agree with the terrain and footprints", async () => {
    await load();
    const h = (id) => {
      const e = llToEnu(byId(id).lat, byId(id).lon);
      return ground(e.x, e.z);
    };
    expect(h("anba")).toBeGreaterThanOrEqual(230); // summit
    expect(h("anba")).toBeLessThanOrEqual(245);
    expect(Math.abs(h("bay"))).toBeLessThanOrEqual(1); // inner-bay water
    expect(Math.abs(h("kanae"))).toBeLessThanOrEqual(1); // main span over the water
    expect(byId("pier7").lat).toBe(38.9052); // capture spot from photo EXIF
    expect(byId("pier7").lon).toBe(141.5754);
    const city = join(ROOT, "data/buildings/city.json");
    if (existsSync(city)) {
      const c = await Bun.file(city).json();
      const m = llToEnu(byId("market").lat, byId("market").lon);
      let bd = Infinity;
      for (const f of c.features) for (const p of f.poly) bd = Math.min(bd, Math.hypot(p[0] - m.x, p[1] - m.z));
      expect(bd).toBeLessThan(60); // a market shed footprint nearby
    }
  });
});
