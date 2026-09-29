// Client side of the living layer: normalise the /api/live state, classify its honesty (live / cache / sample), and
// feed the weather to the render pipeline through window.__RT.setWeather (cover, rain, wind) - V2-SPEC §5, §8.
// main.js fetches the state (data/loader.js live()) and hands it to the UI; the UI calls applyWeather().

/** "live" | "cache" | "sample" for the whole state (any fixture block makes the state a sample; never shown as live). */
export function honesty(L) {
  if (!L) return "sample";
  const from = String(L.__from ?? "");
  if (L.fixture || L.sample || /fixtures\/|sample\.json/.test(from)) return "sample";
  const o = Object.values(L.origins ?? {});
  if (o.includes("fixture")) return "sample";
  if (o.includes("cache") || /state\.json/.test(from)) return "cache";
  return "live";
}

/** origin of one block: live | cache | fixture | none */
export function originOf(L, key) {
  const o = L?.origins?.[key] ?? L?.[key === "port" ? "port" : key]?.origin;
  if (o) return o;
  return L?.fixture || L?.sample ? "fixture" : L ? "live" : "none";
}

// 晴 0.25, 曇 0.65, 雨 0.85 (V2-SPEC §5) for states without the server's .render block (v1 sample.json)
export function coverFromSky(sky = "", forecast = "") {
  const s = `${sky} ${forecast}`;
  if (/rain|雨/.test(s)) return 0.85;
  if (/snow|雪/.test(s)) return 0.85;
  if (/cloud|曇|くもり/.test(s)) return /晴/.test(s) ? 0.5 : 0.65;
  if (/clear|晴/.test(s)) return 0.25;
  return 0.5;
}

/** The exact __RT.setWeather argument for a live state (or null). `cloudsParam` (URL clouds=) wins over live cover. */
export function weatherForRT(L, cloudsParam = null) {
  const w = L?.weather; if (!w) return null;
  const r = w.render ?? { cover: coverFromSky(w.sky, w.forecast), rain: (w.precip1h ?? 0) > 0 ? Math.min(1, 0.3 + w.precip1h / 6) : 0, windDirDeg: w.wind?.dir ?? 270, windMs: w.wind?.speed ?? 3 };
  const out = { rain: r.rain, windDirDeg: r.windDirDeg, windMs: r.windMs };
  if (cloudsParam == null || cloudsParam === "") out.cover = r.cover;
  return out;
}

/** Push the live weather into the pipeline; tolerates the placeholder hook (throws until the pipeline registers). */
export function applyWeather(L, RT = globalThis.__RT, params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams()) {
  const w = weatherForRT(L, params.get("clouds"));
  if (!w || !RT?.setWeather) return null;
  try { return RT.setWeather(w) ?? w; } catch { return null; }
}

/** Arrival records with decimal hours (a.h) for timelines and ticks. */
export function arrivalsOf(L) {
  return (L?.port?.arrivals ?? []).map((a) => ({ ...a, h: a.eta?.h ?? hm(a.time) })).filter((a) => a.h != null);
}
export function hm(s) { const m = /^(\d{1,2}):(\d{2})/.exec(s ?? ""); return m ? +m[1] + +m[2] / 60 : null; }
