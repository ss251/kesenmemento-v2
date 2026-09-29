// v2 living layer: 気仙沼漁協 入船情報 (Shift_JIS) parser, JMA AMeDAS/forecast/tide parsers, state assembly, honesty
// flags and the /api/live routes. Offline: everything runs on the saved fixtures in scripts/live/fixtures/.
import { test, expect, describe, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeSJIS, parseMobilePage, parseEta, parseStamp, parseQty, toPortState, kindOf, toHalfWidth } from "../scripts/live/arrivals.js";
import { resolveStation, mapStamp, parseObservation, parseForecast, toWeatherState, coverFromForecast, windCodeToDeg } from "../scripts/live/jma.js";
import { parseTideLine, parseTideTable, toTideState, heightAt, TIDE } from "../scripts/live/tide.js";
import { sunTimes, moonInfo } from "../scripts/live/sky.js";
import { sunPosition, jstDate } from "../src/web/lib/solar.js";
import { LAT0, LON0 } from "../src/core/geo.js";
import { honesty, weatherForRT, applyWeather, coverFromSky, arrivalsOf } from "../src/web/data/live.js";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
process.env.KLC_LIVE_OFFLINE = "1";
process.env.KLC_LIVE_CACHE_DIR = mkdtempSync(join(tmpdir(), "klc-live-"));          // no cached network answers
const ROOT = resolve(import.meta.dir, "..");
const FX = join(ROOT, "scripts/live/fixtures");
const raw = (f) => readFileSync(join(FX, f));

describe("入船情報: Shift_JIS pages", () => {
  test("the saved pages really are Shift_JIS and decode to Japanese", () => {
    const b = raw("gyokyo_katuo.htm");
    expect(new TextDecoder("utf-8", { fatal: false }).decode(b)).not.toContain("かつお（一本釣）");   // not UTF-8
    const s = decodeSJIS(b);
    expect(s).toContain("charset=shift_jis");
    expect(s).toContain("かつお（一本釣）");
    expect(s).toContain("入港時刻");
  });
  test("かつお page: two fisheries, 10 vessels, times and catches", () => {
    const p = parseMobilePage(decodeSJIS(raw("gyokyo_katuo.htm")), "katuo");
    expect(p.sections.map((s) => s.fishery)).toEqual(["かつお(一本釣)", "かつお(まき網)"]);
    const [pole, seine] = p.sections;
    expect(pole.kind).toBe("pole"); expect(seine.kind).toBe("seine");
    expect(pole.total).toEqual({ vessels: 8 }); expect(pole.vessels).toHaveLength(8);
    expect(seine.total).toEqual({ vessels: 2 }); expect(seine.vessels).toHaveLength(2);
    const fukutoku = pole.vessels.find((v) => v.vessel === "78福徳丸");
    expect(fukutoku.eta).toMatchObject({ h: 6, from: 6, to: 6 });
    expect(fukutoku.catches).toEqual([{ key: "鰹", name: "カツオ", en: "skipjack", qty: 24.5, unit: "t" }, { key: "新口", name: "カツオ（新口）", en: "skipjack (fresh)", qty: 16.5, unit: "t" }]);
    expect(pole.vessels.find((v) => v.vessel === "18清龍丸").eta.h).toBe(4.5);             // "04半"
    expect(pole.vessels.find((v) => v.vessel === "21愛宕丸").eta).toMatchObject({ h: 4.5, from: 4, to: 5 });   // "04〜05ｈ"
    expect(pole.vessels.find((v) => v.vessel === "23海徳丸").eta).toMatchObject({ from: 4, to: 5 });           // "04-05ｈ"
    expect(seine.vessels.find((v) => v.vessel === "78大師丸").eta.h).toBe(10.5);            // "10半"
    expect(pole.stamp.asOf).toEqual({ m: 9, d: 29, h: 17.5 }); expect(pole.stamp.target).toEqual({ m: 9, d: 30, wd: "水" });
    expect(seine.stamp.target).toEqual({ m: 9, d: 30, wd: "水" });
  });
  test("はえ縄 page: sale-scheduled longliners (no time), piece counts, 若干, and the land-transport entry", () => {
    const p = parseMobilePage(decodeSJIS(raw("gyokyo_haenawa.htm")), "haenawa");
    expect(p.sections).toHaveLength(1);
    const s = p.sections[0];
    expect(s.kind).toBe("longline");
    expect(s.vessels.map((v) => v.vessel)).toEqual(["51喜福丸", "38勇仁丸"]);
    expect(s.vessels[0].eta).toBeNull();
    expect(s.vessels[0].catches.find((c) => c.key === "めか")).toMatchObject({ qty: 235, unit: "本", name: "メカジキ" });
    expect(s.vessels[1].catches.find((c) => c.key === "勝さめ")).toMatchObject({ qty: null, text: "若干" });
    expect(s.landed).toHaveLength(2);
    expect(s.landed.find((l) => l.shipper)).toMatchObject({ shipper: "マルヤマコ", origin: "沖縄" });
  });
  test("empty pages (さんま, まき網 青物) parse to no vessels and say so", () => {
    for (const f of ["gyokyo_sanma.htm", "gyokyo_makiami.htm"]) {
      const p = parseMobilePage(decodeSJIS(raw(f)), f);
      expect(p.sections.flatMap((s) => s.vessels)).toHaveLength(0);
      expect(p.empty).toBe(true);
    }
  });
  test("port state: 12 vessels sorted by time, estimated slots flagged, dates resolved", () => {
    const parsed = ["katuo", "haenawa", "sanma", "makiami"].map((k) => parseMobilePage(decodeSJIS(raw(`gyokyo_${k}.htm`)), k));
    const port = toPortState(parsed, { year: 2026 });
    expect(port.arrivals).toHaveLength(12);
    expect(port.date).toBe("2026-09-30"); expect(port.weekday).toBe("水"); expect(port.asOf).toBe("2026-09-29T17:30:00+09:00");
    const hs = port.arrivals.map((a) => a.eta.h); expect([...hs].sort((a, b) => a - b)).toEqual(hs);
    for (const a of port.arrivals) { expect(a.time).toMatch(/^\d\d:\d\d$/); expect(a.vessel.length).toBeGreaterThan(1); expect(["pole", "longline", "seine", "saury"]).toContain(a.kind); }
    const est = port.arrivals.filter((a) => a.eta.estimated);
    expect(est.map((a) => a.vessel).sort()).toEqual(["38勇仁丸", "51喜福丸"]);
    // longliners headline their fish, not the shark tonnage
    expect(port.arrivals.find((a) => a.vessel === "51喜福丸").catch).toBe("メカジキ");
    expect(port.arrivals.find((a) => a.vessel === "光榮丸")).toMatchObject({ time: "05:00", catch: "カツオ", kg: 37500 });
    expect(port.counts.byKind).toEqual({ longline: 2, pole: 8, seine: 2 });
  });
  test("tolerant field parsers", () => {
    expect(parseEta("06ｈ")).toMatchObject({ h: 6 }); expect(parseEta("７時")).toMatchObject({ h: 7 }); expect(parseEta("06:45")).toMatchObject({ h: 6.75 });
    expect(parseEta("未定")).toBeNull(); expect(parseEta("")).toBeNull(); expect(parseEta("25h")).toBeNull();
    expect(parseQty("１６８．５ｔ")).toEqual({ qty: 168.5, unit: "t" }); expect(parseQty("235")).toEqual({ qty: 235, unit: "本" });
    expect(toHalfWidth("９月３０日（水）")).toBe("9月30日(水)");
    expect(parseStamp("１２月３１日　１７時現在　１日（木）予定").target).toEqual({ m: 1, d: 1, wd: "木" });
    expect(kindOf("さんま")).toBe("saury"); expect(kindOf("はえ縄・大目陸送・販売予定船")).toBe("longline"); expect(kindOf("かつお（まき網）")).toBe("seine"); expect(kindOf("かつお（一本釣）")).toBe("pole");
  });
});

describe("JMA weather", () => {
  const table = JSON.parse(raw("jma_amedastable_subset.json")), map = JSON.parse(raw("jma_amedas_map_20260929182000_subset.json"));
  const fc = JSON.parse(raw("jma_forecast_040000.json"));
  test("station 気仙沼 resolves to AMeDAS 34026 (not 大船渡 or 志津川)", () => {
    const st = resolveStation(table);
    expect(st).toMatchObject({ id: "34026", name: "気仙沼", en: "Kesennuma" });
    expect(st.lat).toBeCloseTo(38.9067, 3); expect(st.lon).toBeCloseTo(141.5567, 3);
  });
  test("map stamp, wind codes, observation", () => {
    expect(mapStamp("2026-09-29T18:20:00+09:00")).toBe("20260929182000");
    expect(windCodeToDeg(16)).toBe(0); expect(windCodeToDeg(4)).toBe(90); expect(windCodeToDeg(12)).toBe(270); expect(windCodeToDeg(0)).toBeNull();
    const o = parseObservation(map["34026"], "x");
    expect(o).toMatchObject({ temp: 16.4, humidity: 95, precip1h: 0, sun1h: 0, wind: { dir: 270, speed: 1.4 } });
  });
  test("forecast: 宮城県東部, today's code and text", () => {
    const f = parseForecast(fc);
    expect(f).toMatchObject({ area: "東部", code: "211", text: "くもり 夜遅く 晴れ" });
    expect(f.tomorrow).toMatchObject({ code: "100", text: "晴れ" });
    expect(f.pop.length).toBeGreaterThan(2);
  });
  test("cover follows V2-SPEC §5 (晴 0.25, 曇 0.65, 雨 0.85) and observed rain wins", () => {
    expect(coverFromForecast("100", "晴れ").cover).toBe(0.25);
    expect(coverFromForecast("200", "くもり").cover).toBe(0.65);
    expect(coverFromForecast("300", "雨").cover).toBe(0.85);
    expect(coverFromForecast("211", "くもり 夜遅く 晴れ").cover).toBe(0.5);
    const wet = toWeatherState({ precip10m: 1.5, precip1h: 4, temp: 15, wind: { dir: 90, speed: 6 } }, { code: "100", text: "晴れ" });
    expect(wet.sky).toBe("rain"); expect(wet.render.cover).toBeGreaterThanOrEqual(0.85); expect(wet.render.rain).toBeGreaterThan(0.5);
    expect(wet.render).toMatchObject({ windDirDeg: 90, windMs: 6 });
  });
  test("weather state carries the exact __RT.setWeather argument", () => {
    const w = toWeatherState(parseObservation(map["34026"]), parseForecast(fc), { station: resolveStation(table), hoursJst: 18.3 });
    expect(w.render).toEqual({ cover: 0.5, rain: 0, windDirDeg: 270, windMs: 1.4 });
    expect(w.wind).toMatchObject({ dir: 270, dirDeg: 270, speed: 1.4 });
  });
});

describe("JMA tide (大船渡)", () => {
  const days = parseTideTable(raw("jma_tide_OF_2026_sep_oct.txt").toString("utf8"));
  test("fixed-width lines parse; 2026-09-29 highs/lows match the published table", () => {
    const d = days.get("2026-09-29");
    expect(d.code).toBe("OF"); expect(d.hourly).toHaveLength(24);
    expect(d.highs).toEqual([{ hm: "05:01", h: 5 + 1 / 60, cm: 141 }, { hm: "16:20", h: 16 + 20 / 60, cm: 149 }]);
    expect(d.lows).toEqual([{ hm: "10:34", h: 10 + 34 / 60, cm: 73 }, { hm: "23:11", h: 23 + 11 / 60, cm: 17 }]);
    expect(days.size).toBe(61);
  });
  test("interpolation passes through the hourly values and the state gives T.P. metres", () => {
    const d = days.get("2026-09-29");
    for (const h of [0, 7, 15]) expect(heightAt(d, h)).toBeCloseTo(d.hourly[h], 6);
    const s = toTideState(days, "2026-09-29", 16.5);
    expect(s.height_cm).toBeGreaterThan(145); expect(s.rising).toBe(false);
    expect(s.tp_m).toBeCloseTo((s.height_cm + TIDE.datumTPcm) / 100, 1);
    expect(s.next[0]).toMatchObject({ type: "low", cm: 17, t: "2026-09-29T23:11:00+09:00" });
    expect(toTideState(days, "2026-09-29", 23.5).next[0].t.startsWith("2026-09-30")).toBe(true);
    expect(parseTideLine("garbage")).toBeNull();
  });
});

describe("sun and moon", () => {
  test("sunset ~17:2x JST on 2026-09-29; the slider marks agree with the pipeline's solar module", () => {
    const s = sunTimes("2026-09-29");
    expect(s.sunset).toBeGreaterThan(17.2); expect(s.sunset).toBeLessThan(17.6);
    expect(s.sunrise).toBeGreaterThan(5.3); expect(s.sunrise).toBeLessThan(5.6);
    expect(sunPosition(jstDate("2026-09-29", s.sunset), LAT0, LON0).elevation).toBeCloseTo(-0.833, 2);
  });
  test("moon: waning gibbous around 2026-09-29 (full moon 2026-09-26)", () => {
    const m = moonInfo("2026-09-29", 21);
    expect(m.phase).toBeGreaterThan(190); expect(m.phase).toBeLessThan(240);
    expect(m.illum).toBeGreaterThan(0.8); expect(m.name).toBe("waning-gibbous");
  });
});

describe("state + routes (offline, fixtures)", () => {
  let live;
  beforeAll(async () => { live = await import("../scripts/live.js"); });
  test("fixture state is flagged sample everywhere; weather.render is present", async () => {
    const s = await live.buildState({ fixtures: true, now: new Date("2026-09-29T08:05:00Z") });
    expect(s.sample).toBe(true); expect(s.fixture).toBe(true);
    expect(s.origins).toEqual({ weather: "fixture", tide: "fixture", port: "fixture" });
    expect(s.weather.sample).toBe(true); expect(s.port.sample).toBe(true);
    expect(s.port.arrivals).toHaveLength(12);
    expect(s.weather.render).toEqual({ cover: 0.5, rain: 0, windDirDeg: 270, windMs: 1.4 });
    expect(s.hours).toBeCloseTo(17.0833, 3);
    expect(s.sun.elevation).toBeGreaterThan(0); expect(s.sun.elevation).toBeLessThan(6);
    expect(s.sampleNote).toMatch(/sample/i);
  });
  test("offline without cache falls back to fixtures, never claims live", async () => {
    const s = await live.buildState({ now: new Date("2026-09-29T08:05:00Z") });
    for (const o of Object.values(s.origins)) expect(o === "fixture" || o === "cache").toBe(true);
    if (Object.values(s.origins).includes("fixture")) expect(s.sample).toBe(true);
  });
  test("routes: /api/live, sub-blocks, status; foreign paths fall through to serve.js", async () => {
    const get = (p) => live.liveRoutes(new Request("http://x" + p));
    const r = await get("/api/live?fixtures=1"); expect(r.status).toBe(200);
    const j = await r.json(); expect(j.v).toBe(2); expect(j.sample).toBe(true);
    expect((await (await get("/api/live/arrivals?fixtures=1")).json()).arrivals).toHaveLength(12);
    expect((await (await get("/api/live/weather?fixtures=1")).json()).stationId).toBe("34026");
    expect((await (await get("/api/live/tide?fixtures=1&at=2026-09-29T08:00:00Z")).json()).station).toBe("大船渡");
    expect((await (await get("/api/live/sky?fixtures=1")).json()).moon.phase).toBeGreaterThan(0);
    expect((await get("/api/live/status")).status).toBe(200);
    expect(await get("/api/config")).toBeNull();
    expect(await get("/api/splat-transform")).toBeNull();
  });
  test("serve.js hook path exists and re-exports liveRoutes", async () => {
    const m = await import("../src/server/live.js");
    expect(typeof m.liveRoutes).toBe("function");
  });
});

describe("client live helpers", () => {
  test("honesty: fixtures and v1 sample.json are never 'live'", () => {
    expect(honesty({ sample: true })).toBe("sample");
    expect(honesty({ __from: "fixtures/live/sample.json" })).toBe("sample");
    expect(honesty({ origins: { weather: "live", tide: "live", port: "fixture" } })).toBe("sample");
    expect(honesty({ origins: { weather: "live", tide: "cache", port: "live" } })).toBe("cache");
    expect(honesty({ origins: { weather: "live", tide: "live", port: "live" } })).toBe("live");
    expect(honesty(null)).toBe("sample");
  });
  test("weather -> __RT.setWeather, clouds= URL override keeps its cover", () => {
    const L = { weather: { render: { cover: 0.5, rain: 0, windDirDeg: 270, windMs: 1.4 } } };
    expect(weatherForRT(L)).toEqual({ cover: 0.5, rain: 0, windDirDeg: 270, windMs: 1.4 });
    expect(weatherForRT(L, "0.9")).toEqual({ rain: 0, windDirDeg: 270, windMs: 1.4 });
    let got = null; const RT = { setWeather: (w) => (got = w) };
    applyWeather(L, RT, new URLSearchParams("")); expect(got).toEqual({ cover: 0.5, rain: 0, windDirDeg: 270, windMs: 1.4 });
    expect(applyWeather(L, { setWeather() { throw new Error("placeholder"); } }, new URLSearchParams(""))).toBeNull();
    expect(coverFromSky("cloudy", "くもり 時々 晴れ")).toBe(0.5);
    expect(weatherForRT({ weather: { sky: "rain", precip1h: 3, wind: { dir: 90, speed: 5 } } })).toMatchObject({ cover: 0.85, windDirDeg: 90, windMs: 5 });
    expect(arrivalsOf({ port: { arrivals: [{ time: "06:30" }, { time: "x" }] } })).toHaveLength(1);
  });
});
