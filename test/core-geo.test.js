import { describe, expect, test } from "bun:test";
import {
  BBOX, LAT0, LON0, bboxToEnu, decodeGsiDem, decodeTerrarium, encodeTerrarium, enuToLl, hash01,
  llToEnu, llToTile, sampleGrid, tileToLl,
} from "../src/core/geo.js";

describe("ENU conversion (BUILD-SPEC §3)", () => {
  test("origin maps to 0,0", () => {
    const e = llToEnu(LAT0, LON0);
    expect(e.x).toBe(0);
    expect(e.z).toBe(-0); // -(0) is fine; compare numerically below
    expect(Math.abs(e.z)).toBe(0);
  });

  test("exact spec constants, x east and z south", () => {
    const e = llToEnu(38.9160, 141.5850);
    expect(e.x).toBeCloseTo(0.01 * 86744.0, 6);
    expect(e.z).toBeCloseTo(-0.01 * 111014.0, 6); // north is -z
    const [x, y, z] = llToEnu(38.8960, 141.5650, 12.5);
    expect(x).toBeCloseTo(-867.44, 6);
    expect(y).toBe(12.5);
    expect(z).toBeCloseTo(1110.14, 6);
  });

  test("core bbox corner matches the spec example x0/z0", () => {
    const [x0, z0] = bboxToEnu(BBOX.core);
    expect(x0).toBeCloseTo(-1735.0, 0);
    expect(z0).toBeCloseTo(-2109.0, 0);
  });

  test("enuToLl inverts llToEnu (all call styles)", () => {
    for (const [lat, lon] of [[38.9052, 141.5754], [38.83, 141.5], [38.99, 141.7]]) {
      const e = llToEnu(lat, lon);
      for (const ll of [enuToLl(e.x, e.z), enuToLl(e), enuToLl([e.x, 0, e.z])]) {
        expect(ll.lat).toBeCloseTo(lat, 10);
        expect(ll.lon).toBeCloseTo(lon, 10);
        expect(ll[0]).toBe(ll.lat);
        expect(ll[1]).toBe(ll.lon);
      }
    }
  });
});

describe("Web Mercator tiles", () => {
  test("llToTile / tileToLl agree and match known tiles", () => {
    // z16 tile holding the fish market: 58541/25069 (x = floor((lon+180)/360*2^16), y from the Mercator formula)
    const t = llToTile(38.90017, 141.58033, 16);
    expect([t.x, t.y, t.z]).toEqual([58541, 25069, 16]);
    const nw = tileToLl(t.x, t.y, 16), se = tileToLl(t.x + 1, t.y + 1, 16);
    expect(38.90017).toBeLessThan(nw.lat);
    expect(38.90017).toBeGreaterThan(se.lat);
    expect(141.58033).toBeGreaterThan(nw.lon);
    expect(141.58033).toBeLessThan(se.lon);
    // fractional round trip
    const back = tileToLl(t.fx, t.fy, 16);
    expect(back.lat).toBeCloseTo(38.90017, 9);
    expect(back.lon).toBeCloseTo(141.58033, 9);
  });

  test("tile 0/0/0 corners", () => {
    expect(tileToLl(0, 0, 0).lon).toBe(-180);
    expect(tileToLl(0, 0, 0).lat).toBeCloseTo(85.0511287798, 8);
    expect(tileToLl(1, 1, 0).lat).toBeCloseTo(-85.0511287798, 8);
  });
});

describe("GSI PNG DEM decode", () => {
  // Real pixels from raw/tiles/dem5a_png/15/..., compared with the GSI elevation API
  // (cyberjapandata2.gsi.go.jp getelevation.php, 1 m laser source) on 2026-09-29.
  const known = [
    { where: "Anbasan summit", tile: "15/29269/12533 px 244,52", rgb: [0, 93, 38], api: 238.5 },
    { where: "Anbasan west slope", tile: "15/29269/12533 px 143,200", rgb: [0, 23, 179], api: 60.7 },
    { where: "Uoichiba-mae quay", tile: "15/29270/12534 px 213,243", rgb: [0, 0, 170], api: 1.7 },
  ];
  for (const k of known) {
    test(`${k.where} (${k.tile})`, () => {
      expect(Math.abs(decodeGsiDem(...k.rgb) - k.api)).toBeLessThan(0.5);
    });
  }
  test("no-data, negative and zero", () => {
    expect(Number.isNaN(decodeGsiDem(128, 0, 0))).toBe(true);
    expect(decodeGsiDem(255, 255, 255)).toBeCloseTo(-0.01, 10);
    expect(decodeGsiDem(255, 255, 156)).toBeCloseTo(-1.0, 10);
    expect(decodeGsiDem(0, 0, 0)).toBe(0);
    expect(decodeGsiDem(0, 1, 0)).toBeCloseTo(2.56, 10);
  });
});

describe("Terrarium encoding", () => {
  test("round trip within 1/256 m from -50 to 600 m", () => {
    for (let h = -50; h <= 600; h += 0.37) {
      const [r, g, b] = encodeTerrarium(h);
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
      expect(Math.abs(decodeTerrarium(r, g, b) - h)).toBeLessThanOrEqual(1 / 256);
    }
  });
  test("spec formula for 0 m and NaN -> 0", () => {
    expect(encodeTerrarium(0)).toEqual([128, 0, 0]);
    expect(encodeTerrarium(NaN)).toEqual([128, 0, 0]);
    expect(encodeTerrarium(238.5)).toEqual([128, 238, 128]);
  });
});

describe("helpers", () => {
  test("sampleGrid bilinear and bounds", () => {
    const meta = { x0: 0, z0: 0, dx: 10, dz: 10, width: 2, height: 2 };
    const h = new Float32Array([0, 10, 20, 30]);
    expect(sampleGrid(h, meta, 5, 5)).toBeCloseTo(15, 6);
    expect(sampleGrid(h, meta, 10, 10)).toBeCloseTo(30, 6);
    expect(Number.isNaN(sampleGrid(h, meta, -1, 0))).toBe(true);
  });
  test("hash01 is stable and in [0,1)", () => {
    expect(hash01("16/58541/25067/3")).toBe(hash01("16/58541/25067/3"));
    for (let i = 0; i < 1000; i++) {
      const v = hash01(`id${i}`);
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
