// Contributor backend: the app's ENU frame. x = (lon - 141.5750) * 86744, z = -(lat - 38.9060) * 111014.
import { describe, test, expect } from "bun:test";
import { latLonToEnu, enuToLatLon, isUsableLatLon, enuDistance, gsiUrl, LAT0, LON0, M_PER_DEG_LON, M_PER_DEG_LAT } from "../server/contrib/geo.js";
import * as appGeo from "../src/core/geo.js";

describe("ENU maths", () => {
  test("the origin maps to (0, 0) and the constants are the spec's", () => {
    expect([LAT0, LON0, M_PER_DEG_LON, M_PER_DEG_LAT]).toEqual([38.906, 141.575, 86744, 111014]);
    const o = latLonToEnu(38.906, 141.575);
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.z).toBeCloseTo(0, 9);
  });
  test("east is +x and south is +z", () => {
    const e = latLonToEnu(38.906, 141.576);
    expect(e.x).toBeCloseTo(86.744, 6);
    expect(e.z).toBeCloseTo(0, 9);
    const s = latLonToEnu(38.905, 141.575);
    expect(s.z).toBeCloseTo(111.014, 6);
    expect(s.x).toBeCloseTo(0, 9);
  });
  test("a known point: the formula of the spec evaluated by hand", () => {
    const { x, z } = latLonToEnu(38.9065, 141.5752);
    expect(x).toBeCloseTo((141.5752 - 141.575) * 86744, 9);
    expect(z).toBeCloseTo(-(38.9065 - 38.906) * 111014, 9);
    expect(x).toBeCloseTo(17.3488, 4);
    expect(z).toBeCloseTo(-55.507, 3);
  });
  test("the inverse round-trips to well under a millimetre across the city", () => {
    for (const [lat, lon] of [[38.83, 141.5], [38.99, 141.7], [38.9, 141.575], [38.8999, 141.6112], [38.9234, 141.5503]]) {
      const { x, z } = latLonToEnu(lat, lon);
      const back = enuToLatLon(x, z);
      expect(Math.abs(back.lat - lat) * 111014).toBeLessThan(1e-6);
      expect(Math.abs(back.lon - lon) * 86744).toBeLessThan(1e-6);
    }
    const { lat, lon } = enuToLatLon(1000, -2000);
    expect(latLonToEnu(lat, lon).x).toBeCloseTo(1000, 6);
    expect(latLonToEnu(lat, lon).z).toBeCloseTo(-2000, 6);
  });
  test("it stays identical to the app's own src/core/geo.js (the service repeats the constants so it can deploy alone)", () => {
    expect(appGeo.LAT0).toBe(LAT0);
    expect(appGeo.LON0).toBe(LON0);
    expect(appGeo.M_PER_DEG_LON).toBe(M_PER_DEG_LON);
    expect(appGeo.M_PER_DEG_LAT).toBe(M_PER_DEG_LAT);
    for (const [lat, lon] of [[38.9065, 141.5752], [38.85, 141.64], [38.95, 141.52]]) {
      const [ax, , az] = appGeo.llToEnu(lat, lon);
      const m = latLonToEnu(lat, lon);
      expect(m.x).toBeCloseTo(ax, 9);
      expect(m.z).toBeCloseTo(az, 9);
    }
    const [alat, alon] = appGeo.enuToLl(321, -654);
    const m = enuToLatLon(321, -654);
    expect(m.lat).toBeCloseTo(alat, 12);
    expect(m.lon).toBeCloseTo(alon, 12);
  });
});

describe("helpers", () => {
  test("isUsableLatLon rejects NaN, out-of-range values and null island", () => {
    expect(isUsableLatLon(38.9, 141.5)).toBe(true);
    expect(isUsableLatLon(-33.8, -70.6)).toBe(true);
    for (const [a, b] of [[NaN, 1], [1, Infinity], [91, 0], [0, 181], [0, 0], [undefined, 1]]) expect(isUsableLatLon(a, b)).toBe(false);
  });
  test("enuDistance is planar metres", () => {
    expect(enuDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
  test("gsiUrl is the GSI map link at zoom 18", () => {
    expect(gsiUrl(38.9065, 141.5752)).toBe("https://maps.gsi.go.jp/#18/38.906500/141.575200/");
    expect(gsiUrl(38.9, 141.5, 16)).toBe("https://maps.gsi.go.jp/#16/38.900000/141.500000/");
  });
});
