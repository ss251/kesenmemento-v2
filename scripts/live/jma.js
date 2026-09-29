// JMA weather for Kesennuma: AMeDAS observations + the Miyagi forecast, reduced to what the scene needs.
//
// Endpoints (JSON, no key; the bosai site the JMA web pages themselves use):
//   station table  https://www.jma.go.jp/bosai/amedas/const/amedastable.json   -> 気仙沼 is 34026 (type C: temp,
//                  precipitation, wind, sunshine; no present-weather element), 38°54.4'N 141°33.4'E, 62 m
//   latest time    https://www.jma.go.jp/bosai/amedas/data/latest_time.txt     -> "2026-09-29T18:20:00+09:00"
//   observations   https://www.jma.go.jp/bosai/amedas/data/map/{YYYYMMDDhhmm00}.json (10-minute buckets, JST)
//   forecast       https://www.jma.go.jp/bosai/forecast/data/forecast/040000.json (宮城県; 気仙沼市 is in 東部 040010)
// Values arrive as [value, qualityFlag]; flag 0 is normal.

export const JMA = {
  table: "https://www.jma.go.jp/bosai/amedas/const/amedastable.json",
  latest: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
  map: (stamp) => `https://www.jma.go.jp/bosai/amedas/data/map/${stamp}.json`,
  forecast: "https://www.jma.go.jp/bosai/forecast/data/forecast/040000.json",
  stationName: "気仙沼",
  fallbackStationId: "34026",
  forecastArea: "040010",
};

/** The AMeDAS station id whose kjName is exactly 気仙沼 (nearest to the city origin if several). */
export function resolveStation(table, name = JMA.stationName, near = [38.906, 141.575]) {
  const deg = ([d, m]) => d + m / 60;
  let best = null;
  for (const [id, s] of Object.entries(table ?? {})) {
    if (s?.kjName !== name) continue;
    const d = Math.hypot(deg(s.lat) - near[0], (deg(s.lon) - near[1]) * Math.cos((near[0] * Math.PI) / 180));
    if (!best || d < best.d) best = { id, d, station: s };
  }
  return best ? { id: best.id, name: best.station.kjName, en: best.station.enName, lat: deg(best.station.lat), lon: deg(best.station.lon), alt: best.station.alt, type: best.station.type } : null;
}

/** "2026-09-29T18:20:00+09:00" -> "20260929182000" (the map file name, in JST) */
export function mapStamp(latestIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(latestIso).trim());
  return m ? `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}00` : null;
}

const val = (o, k) => (Array.isArray(o?.[k]) && o[k][1] === 0 && o[k][0] != null ? o[k][0] : Array.isArray(o?.[k]) && o[k][0] != null && o[k][1] <= 1 ? o[k][0] : null);

/** AMeDAS 16-point wind direction code (1 = NNE ... 16 = N, 0 = calm) -> degrees the wind blows FROM. */
export function windCodeToDeg(code) { return code == null || code === 0 ? null : (code % 16) * 22.5; }

/** One station's row of the map file -> observation. */
export function parseObservation(row, observedAt = null) {
  if (!row) return null;
  const dirCode = val(row, "windDirection");
  return {
    observedAt,
    temp: val(row, "temp"),
    humidity: val(row, "humidity"),
    precip10m: val(row, "precipitation10m"),
    precip1h: val(row, "precipitation1h"),
    sun1h: val(row, "sun1h"),
    wind: { dir: windCodeToDeg(dirCode), speed: val(row, "wind"), code: dirCode },
  };
}

// JMA weather code (telop) first digit: 1 晴 2 曇 3 雨 4 雪. Base cloud cover follows V2-SPEC §5 (晴 0.25, 曇 0.65, 雨 0.85).
export function coverFromForecast(code, text = "") {
  const c = String(code ?? ""), t = String(text ?? ""), d = c[0];
  let cover = d === "1" ? 0.25 : d === "2" ? 0.65 : d === "3" || d === "4" ? 0.85 : 0.5;
  let rain = d === "3" ? 0.6 : d === "4" ? 0.4 : 0;
  if (d === "1" && /くもり|曇/.test(t)) cover = 0.4;          // 晴 時々/後 曇
  if (d === "2" && /晴/.test(t)) cover = 0.5;                  // 曇 時々/後 晴
  if (d !== "3" && /雨/.test(t)) { cover = Math.max(cover, 0.72); rain = Math.max(rain, 0.15); }
  const sky = d === "1" ? "clear" : d === "2" ? "cloudy" : d === "3" ? "rain" : d === "4" ? "snow" : "cloudy";
  return { cover, rain, sky };
}

/** Forecast JSON -> today's text/code for the area (the first time series row for 東部). */
export function parseForecast(json, area = JMA.forecastArea) {
  const series = json?.[0]?.timeSeries ?? [];
  const w = series[0], pops = series[1];
  const a = w?.areas?.find((x) => x.area?.code === area) ?? w?.areas?.[0];
  if (!a) return null;
  const p = pops?.areas?.find((x) => x.area?.code === area) ?? pops?.areas?.[0];
  return {
    reportedAt: json?.[0]?.reportDatetime ?? null,
    area: a.area?.name ?? null,
    code: a.weatherCodes?.[0] ?? null,
    text: (a.weathers?.[0] ?? "").replace(/　/g, " ").trim(),
    wind: (a.winds?.[0] ?? "").replace(/　/g, " ").trim(),
    wave: (a.waves?.[0] ?? "").replace(/　/g, " ").trim(),
    pop: p?.pops?.map((x, i) => ({ t: pops.timeDefines?.[i], pct: x === "" ? null : +x })) ?? [],
    tomorrow: a.weatherCodes?.[1] ? { code: a.weatherCodes[1], text: (a.weathers?.[1] ?? "").replace(/　/g, " ").trim() } : null,
  };
}

/**
 * Observation + forecast -> the weather block, including `render` = the exact argument for __RT.setWeather:
 * { cover 0..1, rain 0..1, windDirDeg (from, meteorological), windMs }.
 * Observed rain overrides the forecast; strong recent sunshine thins the cover.
 */
export function toWeatherState(obs, fc, { station = null, hoursJst = null } = {}) {
  const base = coverFromForecast(fc?.code, fc?.text);
  let { cover, rain, sky } = base;
  if (obs?.precip10m > 0 || obs?.precip1h >= 0.5) {
    rain = Math.min(1, Math.max(rain, 0.25 + (obs.precip1h ?? 0) / 6 + (obs.precip10m ?? 0) / 2));
    cover = Math.max(cover, 0.85); sky = obs.temp != null && obs.temp < 1 ? "snow" : "rain";
  } else if (obs?.precip10m === 0 && obs?.precip1h === 0 && sky === "rain") { rain = Math.min(rain, 0.1); cover = Math.min(cover, 0.8); }
  const daylight = hoursJst == null || (hoursJst > 7 && hoursJst < 17);
  if (daylight && obs?.sun1h != null) {
    if (obs.sun1h >= 0.7) { cover = Math.min(cover, 0.35); if (sky === "cloudy") sky = "clear"; }
    else if (obs.sun1h <= 0.1 && sky === "clear") cover = Math.max(cover, 0.5);
  }
  const windMs = obs?.wind?.speed ?? 3, windDirDeg = obs?.wind?.dir ?? 270;
  return {
    source: "気象庁 アメダス・天気予報",
    station: station?.name ?? JMA.stationName, stationId: station?.id ?? JMA.fallbackStationId,
    observedAt: obs?.observedAt ?? null,
    temp: obs?.temp ?? null, humidity: obs?.humidity ?? null,
    wind: { dir: obs?.wind?.dir ?? null, dirDeg: obs?.wind?.dir ?? null, speed: obs?.wind?.speed ?? null },
    windDirDeg, windMs,
    precip10m: obs?.precip10m ?? null, precip1h: obs?.precip1h ?? null, sun1h: obs?.sun1h ?? null,
    sky, code: fc?.code ?? null, forecast: fc?.text ?? null, forecastWind: fc?.wind ?? null, wave: fc?.wave ?? null,
    pop: fc?.pop ?? [], tomorrow: fc?.tomorrow ?? null, forecastAt: fc?.reportedAt ?? null,
    render: { cover: +cover.toFixed(2), rain: +rain.toFixed(2), windDirDeg, windMs },
  };
}
