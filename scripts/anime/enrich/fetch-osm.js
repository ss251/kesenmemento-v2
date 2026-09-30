// [v4:data] Fetch the OpenStreetMap extract for the whole city bbox (lat 38.83-38.99, lon 141.50-141.70) once.
//   env -u NODE_OPTIONS bun run scripts/anime/enrich/fetch-osm.js [--force]   -> raw/osm/overpass.json (+ overpass.meta.json)
// Tries the public Overpass mirrors in order (the main instance timed out for v3): kumi.systems, private.coffee,
// overpass-api.de. The result is cached in raw/ (gitignored); build-enrich.js reads the cache and never fetches.
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). The attribution is written to
// data/anime/sources.json and shown in the app credits.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../terrain/tiles.js";

export const OSM_DIR = join(ROOT, "raw/osm");
export const OSM_FILE = join(OSM_DIR, "overpass.json");
export const OSM_META = join(OSM_DIR, "overpass.meta.json");
export const MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
/** Every way and relation plus every tagged node in the city bbox, with inline geometry (`out geom`). */
export const QUERY = "[out:json][timeout:300][bbox:38.83,141.50,38.99,141.70];(way;relation;node(if:count_tags()>0););out geom qt;";
const UA = "KesennumaLivingCity/4 (civic 3D demo for Kesennuma City; one-off bbox extract)";

export async function fetchOsm({ force = false, log = console.error } = {}) {
  if (existsSync(OSM_FILE) && !force) return { cached: true, file: OSM_FILE };
  mkdirSync(OSM_DIR, { recursive: true });
  for (const url of MIRRORS) {
    try {
      log(`osm: ${url}`);
      const r = await fetch(url, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(QUERY), signal: AbortSignal.timeout(400_000) });
      if (!r.ok) { log(`osm: ${url} -> HTTP ${r.status}`); continue; }
      const txt = await r.text();
      const j = JSON.parse(txt);
      if (!Array.isArray(j.elements) || j.elements.length < 1000) { log(`osm: ${url} -> only ${j.elements?.length} elements`); continue; }
      await Bun.write(OSM_FILE, txt);
      const meta = { mirror: url, fetched: new Date().toISOString(), osmBase: j.osm3s?.timestamp_osm_base ?? null, elements: j.elements.length, bytes: txt.length, query: QUERY };
      await Bun.write(OSM_META, JSON.stringify(meta, null, 1));
      return { cached: false, file: OSM_FILE, ...meta };
    } catch (e) { log(`osm: ${url} -> ${e.message}`); }
  }
  throw new Error("osm: every Overpass mirror failed; download the Geofabrik Tohoku extract (https://download.geofabrik.de/asia/japan/tohoku.html), cut the bbox with osmium and export it as Overpass JSON to raw/osm/overpass.json");
}

if (import.meta.main) {
  const res = await fetchOsm({ force: process.argv.includes("--force") });
  if (res.cached && !existsSync(OSM_META)) {
    // an extract fetched by hand (curl with the same QUERY): record its metadata once
    const j = await Bun.file(OSM_FILE).json();
    await Bun.write(OSM_META, JSON.stringify({ mirror: MIRRORS[0], fetched: new Date().toISOString(), osmBase: j.osm3s?.timestamp_osm_base ?? null, elements: j.elements.length, query: QUERY }, null, 1));
  }
  console.log(JSON.stringify({ ok: true, ...res }));
}
