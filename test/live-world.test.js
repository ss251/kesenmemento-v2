// Live clock, JMA weather mapping, and the Open AIS parser. Pure: no browser, no network.
import { describe, test, expect } from "bun:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import * as THREE from "three";
import { jstNow, clockDelta, easeHours, stepLiveClock } from "../src/anime/world/life/clock.js";
import { createTime, lampsFromSunTimes, LOOK_HOURS, morningShadow, rainCover } from "../src/anime/world/life/time.js";
import { skyPaletteAt } from "../src/anime/core/sky.js";
import { mapWeather } from "../src/anime/world/life/wxmap.js";
import { weatherRender, staleness } from "../src/anime/world/life/live.js";
import { scheduleShift } from "../src/anime/world/harbor/arrivals.js";
import {
  aisKind, parseOpenWaters, parseAisMessage, packAis, projectVessel, smoothToward, onWater,
  attributionLines, KN_TO_MS, KESEN_BBOX,
} from "../src/anime/world/life/ais.js";

const ROOT = resolve(import.meta.dir, "..");
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/ais-tokyo-bay.json"), "utf8"));

function fakeCtx() {
  const scene = new THREE.Scene();
  return {
    scene, camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 30000),
    sunDir: new THREE.Vector3(0, 1, 0), services: {}, quality: { name: "high" },
    shared: {
      uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGust: { value: 0.5 },
      uRipple: { value: 1 }, uNight: { value: 0 }, uLamps: { value: 0 }, uDusk: { value: 0 },
      uWet: { value: 0 }, uRain: { value: 0 }, uLit: { value: 0 },
    },
  };
}
const hex = (c) => c.getHexString();

describe("live clock", () => {
  test("jstNow is Japan time, including the date rollover", () => {
    const noon = jstNow(Date.parse("2026-10-07T11:00:00Z"));
    expect(noon.ymd).toBe("2026-10-07");
    expect(noon.hhmm).toBe("20:00");
    expect(noon.hours).toBeCloseTo(20, 5);
    const next = jstNow(Date.parse("2026-10-07T15:30:00Z"));
    expect(next.ymd).toBe("2026-10-08");
    expect(next.hours).toBeCloseTo(0.5, 5);
    expect(next.hhmm).toBe("00:30");
  });
  test("the short way around midnight, and one ease step is much smaller than the gap", () => {
    expect(clockDelta(23, 1)).toBeCloseTo(2, 5);
    expect(clockDelta(1, 23)).toBeCloseTo(-2, 5);
    const moved = easeHours(12, 14, 1 / 30);
    expect(Math.abs(clockDelta(12, moved))).toBeLessThan(0.05);
    expect(Math.abs(clockDelta(moved, 14))).toBeGreaterThan(1);
  });
  test("stepLiveClock holds, eases a short gap, and asks for a transition past two minutes", () => {
    const held = stepLiveClock(16.5, 20, 0.5, { held: true });
    expect(held.mode).toBe("held");
    expect(held.hours).toBeCloseTo(16.5, 5);
    const ease = stepLiveClock(12, 12.02, 1 / 30);
    expect(ease.mode).toBe("ease");
    expect(Math.abs(clockDelta(12, ease.hours))).toBeLessThan(0.01);
    expect(stepLiveClock(12, 15, 0.5).mode).toBe("transition");
    expect(stepLiveClock(12, 12, 0.5).mode).toBe("sync");
  });
  test("live follows a frozen clock, a preset pins it, and a hold freezes the hour", () => {
    const now = Date.parse("2026-10-07T01:00:00Z"); // 10:00 JST
    const T = createTime(fakeCtx(), { live: true, hours: 10, date: "2026-10-07", now: () => now });
    expect(T.live).toBe(true);
    expect(T.pinned).toBe(false);
    expect(T.preset).toBe(null);
    expect(T.hours).toBeCloseTo(10, 4);
    T.update(2);
    expect(T.hours).toBeCloseTo(10, 3);
    T.set("yoru", { instant: true });
    expect(T.live).toBe(false);
    expect(T.preset).toBe("yoru");
    expect(T.hours).toBeCloseTo(19.5, 4);
    T.update(1);
    expect(T.hours).toBeCloseTo(19.5, 4);
    T.followLive(10.5);
    expect(T.live).toBe(true);
    expect(T.preset).toBe(null);
    expect(T.transitioning).toBe(true);
    T.hold(true);
    const frozen = T.hours;
    T.update(1);
    expect(T.hours).toBeCloseTo(frozen, 5);
    T.hold(false);
    expect(T.transitioning).toBe(true);
  });
  test("without live:true the town stays on the preset (shots and the HUD tests)", () => {
    const T = createTime(fakeCtx(), {});
    expect(T.live).toBe(false);
    expect(T.preset).toBe("yugata");
    expect(T.clock()).toBe("16:30");
  });
});

describe("hour grade and sun lamps", () => {
  test("the four poster hours and 夕焼け are unchanged; blue hour and pre-dawn move", () => {
    const T = createTime(fakeCtx(), { hours: 12 });
    const same = (h) => {
      T.setHours(h, { pin: true });
      const pal = skyPaletteAt(h);
      for (const k of ["zenith", "mid", "horizon", "fog"]) expect(hex(T.palette[k]), `${h} ${k}`).toBe(hex(pal[k]));
    };
    for (const h of LOOK_HOURS) same(h);
    same(17 + 20 / 60);
    T.setHours(18.2, { pin: true });
    expect(hex(T.palette.zenith)).not.toBe(hex(skyPaletteAt(18.2).zenith));
    T.setHours(5, { pin: true });
    expect(hex(T.palette.zenith)).not.toBe(hex(skyPaletteAt(5).zenith));
  });
  test("06:30 is clear, and the morning key sits lower than the afternoon cheat", () => {
    const morn = skyPaletteAt(6.5), nine = skyPaletteAt(9);
    expect(morn.zenith.b).toBeGreaterThan(morn.zenith.r);
    expect(morn.fog.b).toBeGreaterThan(morn.fog.r);
    const dawn = skyPaletteAt(5.4);
    expect(dawn.horizon.r).toBeGreaterThan(dawn.horizon.b);
    expect(Math.abs(morn.zenith.r - nine.zenith.r)).toBeLessThan(0.02);
    const T = createTime(fakeCtx(), { hours: 6.5 });
    const el = Math.asin(T.lightDir.y) * 180 / Math.PI;
    expect(el).toBeGreaterThan(8);
    expect(el).toBeLessThan(12);
    const noon = new THREE.Vector3(0, 1, 0);
    morningShadow(12, noon);
    expect(noon.y).toBeCloseTo(1, 5);
  });
  test("lamps follow the published sunrise and sunset", () => {
    const sun = { sunrise: 5.43, sunset: 17.365 };
    expect(lampsFromSunTimes(12, sun)).toBe(0);
    expect(lampsFromSunTimes(18.2, sun)).toBeGreaterThan(0.9);
    expect(lampsFromSunTimes(4, sun)).toBeGreaterThan(0.9);
    const T = createTime(fakeCtx(), { hours: 12 });
    T.setSun(sun);
    expect(T.lamps).toBe(0);
    T.setHours(18.5, { pin: true });
    expect(T.lamps).toBeGreaterThan(0.9);
  });
});

describe("weather mapping", () => {
  test("precip makes rain, a mixed code is partly, and a plain sky is left alone", () => {
    const rain = mapWeather({
      sky: "cloudy", temp: 13.8, precip10m: 1.2, precip1h: 3,
      render: { cover: 0.7, rain: 0, windMs: 4, windDirDeg: 180 },
    });
    expect(rain.sky).toBe("rain");
    expect(rain.rain).toBeGreaterThan(0.4);
    expect(rain.cover).toBeGreaterThanOrEqual(0.88);
    expect(rain.wet).toBeGreaterThan(0.5);
    const partly = mapWeather({
      sky: "cloudy", code: "211", forecast: "くもり 夜遅く 晴れ", temp: 16.4,
      precip10m: 0, precip1h: 0, render: { cover: 0.5, rain: 0, windMs: 1.4, windDirDeg: 270 },
    });
    expect(partly.sky).toBe("partly");
    expect(partly.cover).toBeGreaterThanOrEqual(0.4);
    expect(partly.cover).toBeLessThanOrEqual(0.62);
    expect(partly.rain).toBe(0);
    const plain = mapWeather({ sky: "cloudy", render: { cover: 0.75, rain: 0, windMs: 3, windDirDeg: 270 } });
    expect(plain.sky).toBe("cloudy");
    expect(mapWeather(null)).toBe(null);
  });
  test("wet streets linger after the rain stops, then dry", () => {
    const wet = mapWeather({ sky: "rain", temp: 10, precip10m: 0, precip1h: 2, render: { cover: 0.9, rain: 0.4, windMs: 3, windDirDeg: 90 } });
    expect(wet.wet).toBeGreaterThan(0.3);
    const after = mapWeather({ sky: "cloudy", precip10m: 0, precip1h: 0, render: { cover: 0.7, rain: 0, windMs: 2, windDirDeg: 90 } }, wet);
    expect(after.rain).toBe(0);
    expect(after.wet).toBeCloseTo(+(wet.wet * 0.85).toFixed(2), 5);
    const dry = mapWeather({ sky: "clear", precip10m: 0, precip1h: 0, render: { cover: 0.2, rain: 0, windMs: 2, windDirDeg: 90 } }, { wet: 0.01 });
    expect(dry.wet).toBe(0);
    expect(dry.cover).toBeLessThanOrEqual(0.32);
  });
  test("light rain is a lighter overcast than a shower, and a shower eases off", () => {
    const light = mapWeather({
      sky: "cloudy", temp: 16, precip10m: 0, precip1h: 0.5,
      render: { cover: 0.4, rain: 0, windMs: 2, windDirDeg: 270 },
    });
    expect(light.sky).toBe("rain");
    expect(light.rain).toBeGreaterThan(0.2);
    expect(light.rain).toBeLessThan(0.45);
    expect(light.cover).toBeGreaterThanOrEqual(0.9);
    expect(rainCover(light.rain)).toBeGreaterThan(0.6);
    expect(rainCover(light.rain)).toBeLessThan(rainCover(0.8));
    const ctx = fakeCtx();
    const T = createTime(ctx, { hours: 12 });
    T.update(1 / 60);
    T.setWeather({ cover: 0.95, rain: 0.8, wet: 0.9 });
    expect(T.weather.rain).toBe(0.8);
    expect(T.shade.rain).toBeLessThan(0.05);
    T.update(0.5);
    expect(T.shade.rain).toBeGreaterThan(0.2);
    expect(T.shade.rain).toBeLessThan(0.5);
    expect(ctx.shared.uRain.value).toBeCloseTo(T.shade.rain, 5);
    T.setWeather({ cover: 0.25, rain: 0, wet: 0 });
    T.update(4);
    expect(T.shade.rain).toBe(0);
    expect(T.shade.cloud).toBeCloseTo(0.25, 2);
    expect(ctx.shared.uRain.value).toBe(0);
  });
  test("the saved sample still maps into range, and wind sets the ripple speed", () => {
    const sample = JSON.parse(readFileSync(join(ROOT, "data/live/sample.json"), "utf8"));
    const w = weatherRender(sample.weather);
    expect(w.cover).toBeGreaterThanOrEqual(0);
    expect(w.cover).toBeLessThanOrEqual(1);
    expect(w.rain).toBe(0);
    const ctx = fakeCtx();
    const T = createTime(ctx, { preset: "hiru" });
    T.setWeather(w);
    expect(T.weather.cloud).toBe(w.cover);
    expect(ctx.shared.uRipple.value).toBeCloseTo(Math.min(2.1, 0.55 + w.windMs / 7), 5);
  });
});

describe("AIS", () => {
  test("the Tokyo Bay recording stays in Tokyo Bay", () => {
    const vessels = parseOpenWaters(fixture);
    expect(vessels.length).toBe(fixture.features.length);
    expect(vessels.length).toBeGreaterThanOrEqual(12);
    for (const v of vessels) expect(v.lat).toBeLessThan(37);
    const kaiyo = vessels.find((v) => v.name === "KAIYO MARU");
    expect(kaiyo.mmsi).toBe("431899000");
    expect(kaiyo.kind).toBe("fishing");
    expect(kaiyo.source).toBe("aishub");
    expect(kaiyo.lat).toBeCloseTo(35.649903333333334, 5);
    const lines = attributionLines(vessels, fixture.attribution);
    expect(lines).toContain(fixture.attribution.aishub);
    expect(lines).toContain(fixture.attribution.aisstream);
    const empty = packAis([]);
    expect(empty.coverage).toBe("empty");
    expect(empty.attribution).toEqual([]);
    expect(empty.vessels).toEqual([]);
  });
  test("a copy translated in the test lands in the Kesennuma box; the parser does not move it", () => {
    const src = readFileSync(join(ROOT, "src/anime/world/life/ais.js"), "utf8")
      + readFileSync(join(ROOT, "src/server/ais.js"), "utf8")
      + readFileSync(join(ROOT, "src/anime/world/harbor/ais.js"), "utf8");
    expect(src).not.toContain("translateToKesen");
    expect(src).toContain("Positions are used as reported");
    const copy = structuredClone(fixture);
    const lats = copy.features.map((f) => f.geometry.coordinates[1]);
    const lons = copy.features.map((f) => f.geometry.coordinates[0]);
    const sLat = [Math.min(...lats), Math.max(...lats)], sLon = [Math.min(...lons), Math.max(...lons)];
    for (const f of copy.features) {
      const [lon, lat] = f.geometry.coordinates;
      const u = (lat - sLat[0]) / (sLat[1] - sLat[0] || 1);
      const v = (lon - sLon[0]) / (sLon[1] - sLon[0] || 1);
      f.geometry.coordinates = [
        KESEN_BBOX.lon1 + v * (KESEN_BBOX.lon2 - KESEN_BBOX.lon1),
        KESEN_BBOX.lat1 + u * (KESEN_BBOX.lat2 - KESEN_BBOX.lat1),
      ];
    }
    const moved = parseOpenWaters(copy);
    for (const v of moved) {
      expect(v.lat).toBeGreaterThanOrEqual(KESEN_BBOX.lat1);
      expect(v.lat).toBeLessThanOrEqual(KESEN_BBOX.lat2);
      expect(v.lon).toBeGreaterThanOrEqual(KESEN_BBOX.lon1);
      expect(v.lon).toBeLessThanOrEqual(KESEN_BBOX.lon2);
    }
    expect(parseOpenWaters(fixture)[0].lat).toBeLessThan(37);
  });
  test("dead reckoning, kind, smoothing, and water", () => {
    const ak = parseOpenWaters(fixture).find((v) => v.name === "AKATSUKI MARU");
    expect(ak.kind).toBe("tanker");
    const out = {};
    const t0 = Date.parse(ak.seen);
    projectVessel(ak, t0 + 60_000, out);
    expect(out.ok).toBe(true);
    const dist = Math.hypot(out.deast, out.dnorth);
    expect(dist).toBeCloseTo(10.7 * KN_TO_MS * 60, 1);
    const east = {};
    projectVessel({ sog: 10, cog: 90, seen: new Date(t0).toISOString() }, t0 + 10_000, east);
    expect(east.dnorth).toBeCloseTo(0, 5);
    expect(east.deast).toBeCloseTo(10 * KN_TO_MS * 10, 3);
    expect(east.yaw).toBeCloseTo(Math.PI / 2, 5);
    projectVessel(ak, t0 + 601_000, out);
    expect(out.ok).toBe(false);
    expect(aisKind(30)).toBe("fishing");
    expect(aisKind(60)).toBe("passenger");
    expect(aisKind(70)).toBe("cargo");
    expect(aisKind(80)).toBe("tanker");
    expect(aisKind(52)).toBe("other");
    expect(smoothToward(0, 10, 1.4, 1.4)).toBeGreaterThan(5);
    expect(smoothToward(0, 10, 1.4, 1.4)).toBeLessThan(10);
    expect(onWater(1, 2, () => false)).toBe(null);
    expect(onWater(1, 2, () => true)).toEqual({ x: 1, z: 2 });
  });
  test("aisstream and AIS-catcher JSON parse into vessels", () => {
    const stream = parseAisMessage({
      MessageType: "PositionReport",
      MetaData: { MMSI: 431000001, ShipName: "TEST MARU", time_utc: "2026-10-07T11:00:00Z" },
      Message: { PositionReport: { UserID: 431000001, Latitude: 38.9, Longitude: 141.6, Sog: 4.5, Cog: 10 } },
    });
    expect(stream).toHaveLength(1);
    expect(stream[0].source).toBe("aisstream");
    expect(stream[0].name).toBe("TEST MARU");
    expect(stream[0].lat).toBeCloseTo(38.9, 5);
    const catcher = parseAisMessage({
      stationid: "pier7",
      msgs: [{ mmsi: "431000002", lat: 38.91, lon: 141.58, sog: 1, cog: 180, type: 30, name: "湾丸" }],
    });
    expect(catcher[0].source).toBe("receiver");
    expect(catcher[0].station).toBe("pier7");
    expect(catcher[0].kind).toBe("fishing");
  });
});

describe("arrival schedule date", () => {
  test("tomorrow's 入港予定 is not treated as already in", () => {
    expect(scheduleShift("2026-10-08", "2026-10-07")).toBe(24);
    expect(scheduleShift("2026-10-07", "2026-10-07")).toBe(0);
    expect(scheduleShift("2026-10-06", "2026-10-07")).toBe(0);
    expect(scheduleShift(null, "2026-10-07")).toBe(0);
  });
});

describe("staleness", () => {
  test("a port list from before today is stale; a fresh live answer is not", () => {
    const now = Date.parse("2026-10-07T10:00:00Z");
    expect(staleness({ port: { date: "2026-10-06", origin: "live" }, origins: { port: "live" } }, "live", now).stale).toBe(true);
    expect(staleness({ port: { date: "2026-10-07", origin: "live", fetchedAt: "2026-10-07T09:00:00Z" }, weather: { origin: "live", fetchedAt: "2026-10-07T09:50:00Z" }, origins: { port: "live", weather: "live" } }, "live", now).stale).toBe(false);
  });
});

describe("AIS server block", () => {
  test("offline Open Waters is an empty coverage, and a posted vessel is remembered", async () => {
    process.env.KLC_LIVE_OFFLINE = "1";
    process.env.KLC_LIVE_CACHE_DIR = mkdtempSync(join(tmpdir(), "klc-ais-"));
    delete process.env.AISSTREAM_API_KEY;
    const srv = await import("../src/server/ais.js");
    srv.resetAisForTests();
    const empty = await srv.aisBlock();
    expect(empty.coverage).toBe("empty");
    expect(empty.vessels).toEqual([]);
    expect(empty.attribution).toEqual([]);
    process.env.AIS_INGEST_TOKEN = "test-token";
    const denied = await srv.ingestRequest(new Request("http://x/api/live/ais", { method: "POST", body: "{}" }));
    expect(denied.status).toBe(404);
    const ok = await srv.ingestRequest(new Request("http://x/api/live/ais", {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify({ msgs: [{ mmsi: "431111111", lat: 38.9, lon: 141.6, sog: 2, cog: 45, name: "試験丸", type: 30 }], stationid: "pier7" }),
    }));
    expect(ok.status).toBe(200);
    const pack = await srv.aisBlock();
    expect(pack.coverage).toBe("live");
    expect(pack.vessels.some((v) => v.name === "試験丸")).toBe(true);
    expect(pack.source).toBe("receiver");
    expect(pack.attribution).toContain("AIS-catcher");
    srv.resetAisForTests();
    delete process.env.AIS_INGEST_TOKEN;
  });
});
