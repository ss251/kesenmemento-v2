// GSI XYZ tile fetcher with an on-disk cache under raw/tiles/{dataset}/{z}/{x}/{y}.{ext}.
// 4-way concurrency, retry with backoff, User-Agent kesennuma-living-city/0.1 (BUILD-SPEC §3).
// Missing tiles (404) are cached as zero-byte files so reruns stay offline.
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { llToTile } from "../../src/core/geo.js";

export const ROOT = new URL("../../", import.meta.url).pathname;
export const TILE_ROOT = join(ROOT, "raw/tiles");
const BASE = "https://cyberjapandata.gsi.go.jp/xyz";
const UA = "kesennuma-living-city/0.1";

export const EXT = {
  dem_png: "png",
  dem5a_png: "png",
  seamlessphoto: "jpg",
  "optimal_bvmap-v1": "pbf",
};

export function tilePath(dataset, z, x, y) {
  return join(TILE_ROOT, dataset, String(z), String(x), `${y}.${EXT[dataset]}`);
}

/** Integer tile range covering a [lonMin, latMin, lonMax, latMax] bbox at zoom z (inclusive). */
export function tileRange(bbox, z) {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const nw = llToTile(latMax, lonMin, z);
  const se = llToTile(latMin, lonMax, z);
  return { z, x0: nw.x, y0: nw.y, x1: se.x, y1: se.y };
}

export function rangeTiles(r) {
  const out = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push([x, y]);
  return out;
}

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size >= 0;
  } catch {
    return false;
  }
}

async function fetchOne(dataset, z, x, y) {
  const p = tilePath(dataset, z, x, y);
  if (await exists(p)) return { path: p, cached: true };
  const url = `${BASE}/${dataset}/${z}/${x}/${y}.${EXT[dataset]}`;
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 404) {
        await mkdir(dirname(p), { recursive: true });
        await Bun.write(p, new Uint8Array(0));
        return { path: p, cached: false, missing: true };
      }
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      await mkdir(dirname(p), { recursive: true });
      await Bun.write(p + ".part", buf);
      const { rename } = await import("node:fs/promises");
      await rename(p + ".part", p);
      return { path: p, cached: false };
    } catch (e) {
      lastErr = e;
      await Bun.sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(`tile fetch failed ${url}: ${lastErr}`);
}

/** Fetch (or reuse from cache) every tile in the list. Returns Map "x/y" -> path ('' size = missing). */
export async function fetchTiles(dataset, z, tiles, { concurrency = 4, label = dataset } = {}) {
  const out = new Map();
  let i = 0, done = 0, fetched = 0;
  const t0 = performance.now();
  async function worker() {
    while (i < tiles.length) {
      const [x, y] = tiles[i++];
      const r = await fetchOne(dataset, z, x, y);
      if (!r.cached) fetched++;
      out.set(`${x}/${y}`, r.path);
      done++;
      if (fetched && done % 200 === 0) {
        console.log(`  ${label} z${z}: ${done}/${tiles.length} (${fetched} downloaded)`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(
    `  ${label} z${z}: ${tiles.length} tiles, ${fetched} downloaded, ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
  return out;
}

export async function readTile(dataset, z, x, y) {
  const f = Bun.file(tilePath(dataset, z, x, y));
  if (!(await f.exists()) || f.size === 0) return null;
  return new Uint8Array(await f.arrayBuffer());
}
