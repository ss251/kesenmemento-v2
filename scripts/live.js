// Living layer server: today's Kesennuma as one JSON state, cached, served under /api/live/*.
//
//   GET /api/live             full state (v1 fields kept: weather.temp/wind/sky/forecast, tide.height_cm/next,
//                             port.arrivals[{time, vessel, type, catch, kg}], updated, sample, fixture)
//   GET /api/live/weather     weather block; .render is the exact argument for window.__RT.setWeather()
//   GET /api/live/arrivals    port block (気仙沼漁協 入船情報, Shift_JIS pages parsed in scripts/live/arrivals.js)
//   GET /api/live/tide        tide block (JMA 潮位表, 大船渡)
//   GET /api/live/sky         sun + moon for the day
//   GET /api/live/status      where each block came from (live / cache / fixture), fetch ages, last errors
//   ?fixtures=1               force the saved sample (scripts/live/fixtures), flagged sample: true
//   ?at=ISO                   compute sun/tide for another instant (film and QA)
//
// Each block carries origin: "live" (fetched within its TTL), "cache" (network failed; last good copy, with its age)
// or "fixture" (saved sample pages from 2026-09-29; the UI must say サンプル). Nothing is ever passed off as live.
//
// serve.js loads src/server/live.js -> liveRoutes(req); that file re-exports this module.
//   env -u NODE_OPTIONS bun run scripts/live.js            print the current state
//   env -u NODE_OPTIONS bun run scripts/live.js --fixtures print the sample state
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { cachedFetch, text, json, ROOT } from "./live/http.js";
import { decodeSJIS, parseMobilePage, toPortState, GYOKYO_BASE, FISHERY_PAGES } from "./live/arrivals.js";
import { JMA, resolveStation, mapStamp, parseObservation, parseForecast, toWeatherState } from "./live/jma.js";
import { TIDE, parseTideTable, toTideState } from "./live/tide.js";
import { skyState } from "./live/sky.js";
import { toJst } from "../src/web/lib/solar.js";
import { aisBlock, ingestRequest } from "../src/server/ais.js";

export const FIXTURE_DIR = join(ROOT, "scripts/live/fixtures");
const fx = (name) => readFileSync(join(FIXTURE_DIR, name));
export const FIXTURE_INFO = { capturedAt: "2026-09-29T18:20:00+09:00", note: "Saved public pages from 2026-09-29 (sample data)" };

const TTL = { table: 7 * 864e5, latest: 5 * 6e4, map: 10 * 6e4, forecast: 30 * 6e4, tide: 7 * 864e5, port: 10 * 6e4 };
const status = { weather: null, tide: null, port: null };
const note = (k, origin, extra = {}) => (status[k] = { origin, at: new Date().toISOString(), ...extra });

// ------------------------------------------------------------------ blocks
export function fixtureWeather(hoursJst = 18.33) {
  const table = JSON.parse(fx("jma_amedastable_subset.json")), map = JSON.parse(fx("jma_amedas_map_20260929182000_subset.json"));
  const st = resolveStation(table);
  const obs = parseObservation(map[st.id], "2026-09-29T18:20:00+09:00");
  return toWeatherState(obs, parseForecast(JSON.parse(fx("jma_forecast_040000.json"))), { station: st, hoursJst });
}

async function weatherBlock(hoursJst, force) {
  if (!force) {
    try {
      const tab = json(await cachedFetch(JMA.table, { ttlMs: TTL.table }));
      const st = resolveStation(tab) ?? { id: JMA.fallbackStationId, name: JMA.stationName };
      const latest = text(await cachedFetch(JMA.latest, { ttlMs: TTL.latest })).trim();
      const mr = await cachedFetch(JMA.map(mapStamp(latest)), { ttlMs: TTL.map });
      const obs = parseObservation(json(mr)[st.id], latest);
      let fc = null, fr = null;
      try { fr = await cachedFetch(JMA.forecast, { ttlMs: TTL.forecast }); fc = parseForecast(json(fr)); } catch { /* observation alone still drives cover */ }
      const w = toWeatherState(obs, fc, { station: st, hoursJst });
      const origin = mr.from === "cache" ? "cache" : "live";
      note("weather", origin, { fetchedAt: new Date(mr.at).toISOString(), error: mr.error });
      return { ...w, origin, fetchedAt: new Date(mr.at).toISOString() };
    } catch (e) { note("weather", "fixture", { error: String(e.message ?? e) }); }
  } else note("weather", "fixture", { forced: true });
  return { ...fixtureWeather(hoursJst), origin: "fixture", sample: true, fetchedAt: FIXTURE_INFO.capturedAt };
}

async function tideBlock(ymd, hours, force) {
  const year = ymd.slice(0, 4);
  if (!force) {
    try {
      const r = await cachedFetch(TIDE.url(year), { ttlMs: TTL.tide, timeoutMs: 12000 });
      const t = toTideState(parseTideTable(text(r)), ymd, hours);
      if (t) { note("tide", r.from === "cache" ? "cache" : "live"); return { ...t, origin: r.from === "cache" ? "cache" : "live", fetchedAt: new Date(r.at).toISOString() }; }
    } catch (e) { note("tide", "fixture", { error: String(e.message ?? e) }); }
  }
  // predictions are deterministic, so the saved Sep-Oct 2026 table is exact for those dates; outside it, no tide
  const t = toTideState(parseTideTable(fx("jma_tide_OF_2026_sep_oct.txt").toString("utf8")), ymd, hours);
  if (!force) note("tide", t ? "fixture" : "none");
  return t ? { ...t, origin: "fixture", sample: true } : null;
}

export function fixturePort() {
  const parsed = FISHERY_PAGES.map((p) => parseMobilePage(decodeSJIS(fx(`gyokyo_${p}.htm`)), p));
  return toPortState(parsed, { year: 2026 });
}

async function portBlock(force) {
  if (!force) {
    try {
      const res = await Promise.all(FISHERY_PAGES.map((p) => cachedFetch(`${GYOKYO_BASE}${p}.htm`, { ttlMs: TTL.port }).then((r) => ({ p, r }))));
      const year = +toJst(new Date()).ymd.slice(0, 4);
      const port = toPortState(res.map(({ p, r }) => parseMobilePage(decodeSJIS(r.bytes), p)), { year });
      const origin = res.some(({ r }) => r.from === "cache") ? "cache" : "live";
      const at = Math.min(...res.map(({ r }) => r.at));
      note("port", origin, { fetchedAt: new Date(at).toISOString(), vessels: port.arrivals.length });
      return { ...port, origin, fetchedAt: new Date(at).toISOString() };
    } catch (e) { note("port", "fixture", { error: String(e.message ?? e) }); }
  } else note("port", "fixture", { forced: true });
  return { ...fixturePort(), origin: "fixture", sample: true, fetchedAt: FIXTURE_INFO.capturedAt };
}

// ------------------------------------------------------------------ state
/** Build the whole state. opts.fixtures forces the saved sample; opts.now sets the instant (sun, tide). */
export async function buildState({ now = new Date(), fixtures = false } = {}) {
  const { ymd, hours } = toJst(now);
  const [weather, tide, port, ais] = await Promise.all([
    weatherBlock(hours, fixtures), tideBlock(ymd, hours, fixtures), portBlock(fixtures),
    aisBlock().catch(() => null),
  ]);
  const { sun, moon } = skyState(ymd, hours);
  const origins = { weather: weather.origin, tide: tide?.origin ?? "none", port: port.origin };
  const sample = Object.values(origins).includes("fixture");
  const aisPack = ais || { vessels: [], source: "openwaters", attribution: [], coverage: "empty", fetchedAt: null };
  return {
    v: 2, updated: new Date().toISOString(), at: now.toISOString(), date: ymd, hours: +hours.toFixed(4),
    sample, fixture: sample && Object.values(origins).every((o) => o === "fixture" || o === "none"), origins,
    sampleNote: sample ? FIXTURE_INFO.note : null,
    sun, moon, weather, tide, port, ais: aisPack,
    credits: ["気象庁（アメダス・天気予報・潮位表）", "気仙沼漁業協同組合（入船情報）", ...aisPack.attribution],
  };
}

let memo = null;
async function state(fixtures, at) {
  if (at || fixtures) return buildState({ fixtures, now: at ? new Date(at) : new Date() });
  if (memo && Date.now() - memo.t < 30000) return memo.p;
  const p = buildState(); memo = { t: Date.now(), p }; p.catch(() => (memo = null)); return p;
}

const send = (obj, maxAge = 30) => new Response(JSON.stringify(obj), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `max-age=${maxAge}`, "access-control-allow-origin": "*" } });

/** serve.js hook: a Response for /api/live and /api/live/*, null for anything else. */
export async function liveRoutes(req) {
  const url = new URL(req.url);
  if (!/^\/api\/live(\/|$)/.test(url.pathname)) return null;
  if (req.method === "POST" && url.pathname === "/api/live/ais") {
    const r = await ingestRequest(req);
    if (r.status === 200) memo = null;
    return r;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const fixtures = url.searchParams.get("fixtures") === "1";
  const at = url.searchParams.get("at");
  const sub = url.pathname.replace(/^\/api\/live\/?/, "");
  if (sub === "status") return send({ status, fixtures: FIXTURE_INFO, ttlMs: TTL }, 0);
  const s = await state(fixtures, at && !isNaN(Date.parse(at)) ? at : null);
  if (sub === "") return send(s);
  if (sub === "weather") return send(s.weather);
  if (sub === "arrivals") return send(s.port);
  if (sub === "tide") return s.tide ? send(s.tide) : new Response("no tide", { status: 404 });
  if (sub === "sky" || sub === "sun") return send({ date: s.date, hours: s.hours, sun: s.sun, moon: s.moon });
  return new Response("not found", { status: 404 });
}

/** Warm the caches in the background (optional; serve.js works without it). */
export function startPoller({ intervalMs = 600000 } = {}) {
  const run = () => buildState().then((s) => (memo = { t: Date.now(), p: Promise.resolve(s) })).catch(() => {});
  run(); const id = setInterval(run, intervalMs); id.unref?.(); return () => clearInterval(id);
}

if (import.meta.main) {
  const s = await buildState({ fixtures: process.argv.includes("--fixtures") });
  console.log(JSON.stringify({ ...s, tide: s.tide && { ...s.tide, hourly: `[${s.tide.hourly.length}]` } }, null, 1));
}
