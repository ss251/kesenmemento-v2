// [v4:data] Fetch the OpenStreetMap extract for the whole city bbox (lat 38.83-38.99, lon 141.50-141.70) once.
//   env -u NODE_OPTIONS bun run scripts/anime/enrich/fetch-osm.js [--force]   -> raw/osm/overpass.json (+ overpass.meta.json)
// Tries the public Overpass mirrors in order: overpass-api.de FIRST (it serves the live database; the kumi.systems mirror served a base timestamp of 2026-05-06 on 2026-09-30, 147 days stale, and
// every OSM-derived claim of the layout then misses five months of edits), then kumi.systems and private.coffee. [r3:18] A mirror whose osm3s.timestamp_osm_base is more than MAX_LAG_DAYS (3)
// behind now, or has none, is logged and the next mirror is tried; if every mirror is stale the freshest result is kept and a loud warning is printed, so a fetch never leaves no data. The
// result is cached in raw/ (gitignored); build-enrich.js reads the cache and never fetches.
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The attribution is written to
// data/anime/sources.json and shown in the app credits.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../terrain/tiles.js";

export const OSM_DIR = join(ROOT, "raw/osm");
export const OSM_FILE = join(OSM_DIR, "overpass.json");
export const OSM_META = join(OSM_DIR, "overpass.meta.json");
export const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/** [r3:18] a mirror is stale when its database base is more than this many days behind the fetch */
export const MAX_LAG_DAYS = 3;
const DAY = 86_400_000;
/** age (ms) of an Overpass answer's database: now - osm3s.timestamp_osm_base; null when the timestamp is missing or unparseable */
export function osmLagMs(j, now = Date.now()) {
  const t = Date.parse(j?.osm3s?.timestamp_osm_base ?? "");
  return Number.isFinite(t) ? now - t : null;
}
/** true when the lag is missing or above MAX_LAG_DAYS */
export const isStaleLag = (lagMs) => lagMs == null || lagMs > MAX_LAG_DAYS * DAY;
/** days between a meta file's `osmBase` and its `fetched` date (null when either is missing): the cached extract's lag at fetch time */
export function metaLagDays(meta) {
  const a = Date.parse(meta?.osmBase ?? ""), b = Date.parse(meta?.fetched ?? "");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round(((b - a) / DAY) * 10) / 10 : null;
}
/** Every way and relation plus every tagged node in the city bbox, with inline geometry (`out geom`). */
export const QUERY = "[out:json][timeout:300][bbox:38.83,141.50,38.99,141.70];(way;relation;node(if:count_tags()>0););out geom qt;";
const UA = "KesennumaLivingCity/4 (civic 3D demo for Kesennuma City; one-off bbox extract)";

async function save(url, txt, j) {
  await Bun.write(OSM_FILE, txt);
  const meta = { mirror: url, fetched: new Date().toISOString(), osmBase: j.osm3s?.timestamp_osm_base ?? null, elements: j.elements.length, bytes: txt.length, query: QUERY };
  await Bun.write(OSM_META, JSON.stringify(meta, null, 1));
  return { cached: false, file: OSM_FILE, ...meta };
}

export async function fetchOsm({ force = false, log = console.error, mirrors = MIRRORS, now = () => Date.now() } = {}) {
  if (existsSync(OSM_FILE) && !force) {
    // [r3:18] the cached extract: warn when its database was already more than MAX_LAG_DAYS old when it was fetched
    try { const m = JSON.parse(readFileSync(OSM_META, "utf8")), lag = metaLagDays(m); if (lag != null && lag > MAX_LAG_DAYS) log(`osm: WARNING the cached extract is stale: osmBase ${m.osmBase}, fetched ${m.fetched} (${lag} days; edits since are missing). Re-run with --force.`); } catch { /* no meta */ }
    return { cached: true, file: OSM_FILE };
  }
  mkdirSync(OSM_DIR, { recursive: true });
  let best = null;   // the freshest stale answer, kept if no mirror is fresh
  for (const url of mirrors) {
    try {
      log(`osm: ${url}`);
      const r = await fetch(url, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(QUERY), signal: AbortSignal.timeout(400_000) });
      if (!r.ok) { log(`osm: ${url} -> HTTP ${r.status}`); continue; }
      const txt = await r.text();
      const j = JSON.parse(txt);
      if (!Array.isArray(j.elements) || j.elements.length < 1000) { log(`osm: ${url} -> only ${j.elements?.length} elements`); continue; }
      const lag = osmLagMs(j, now());
      if (isStaleLag(lag)) {   // [r3:18] a stale mirror: remember it, try the next
        log(`osm: ${url} -> STALE database (osmBase ${j.osm3s?.timestamp_osm_base ?? "missing"}, ${lag == null ? "unknown" : Math.round(lag / DAY)} days old); trying the next mirror`);
        if (!best || (lag != null && (best.lag == null || lag < best.lag))) best = { url, txt, j, lag };
        continue;
      }
      return await save(url, txt, j);
    } catch (e) { log(`osm: ${url} -> ${e.message}`); }
  }
  if (best) { log(`osm: WARNING every mirror is stale; keeping the freshest (${best.url}, osmBase ${best.j.osm3s?.timestamp_osm_base ?? "missing"}). OSM edits since that date are NOT in the layout.`); return await save(best.url, best.txt, best.j); }
  throw new Error("osm: every Overpass mirror failed; download the Geofabrik Tohoku extract (https://download.geofabrik.de/asia/japan/tohoku.html), cut the bbox with osmium and export it as Overpass JSON to raw/osm/overpass.json");
}

if (import.meta.main) {
  const res = await fetchOsm({ force: process.argv.includes("--force") });
  if (res.cached && !existsSync(OSM_META)) {
    // an extract fetched by hand (curl with the same QUERY): record its metadata once
    const j = await Bun.file(OSM_FILE).json();
    await Bun.write(OSM_META, JSON.stringify({ mirror: MIRRORS[0], fetched: new Date().toISOString(), osmBase: j.osm3s?.timestamp_osm_base ?? null, elements: j.elements.length, query: QUERY }, null, 1));
    console.error("osm: the metadata of a hand-fetched extract was written now: check its osmBase against the fetch date");
  }
  console.log(JSON.stringify({ ok: true, ...res }));
}
