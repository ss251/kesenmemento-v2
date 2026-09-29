// [v3:foundation] Decode the cached GSI optimal_bvmap-v1 z16 tiles (raw/tiles) into ENU features for the anime layout.
//   env -u NODE_OPTIONS bun run scripts/anime/vt.js      -> data/cache/anime/vt.json (gitignored intermediate)
// Layers kept: WA (water areas), RdCL (road centre-lines with rdCtg / rnkWidth / width), RdEdg (road edges),
// Cstline (coast), WL (water lines), WStrL (water structures: quays, breakwaters), RdCompt (bridge parts), Anno (place names).
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BBOX, llToEnu, tileToLl } from "../../src/core/geo.js";
import { rangeTiles, readTile, ROOT, tileRange } from "../terrain/tiles.js";

const Z = 16, EXTENT = 4096, VT = "optimal_bvmap-v1";
export const CACHE = join(ROOT, "data/cache/anime");
const r1 = (v) => Math.round(v * 10) / 10;

function toEnu(tx, ty, p) {
  const ll = tileToLl(tx + p.x / EXTENT, ty + p.y / EXTENT, Z);
  const e = llToEnu(ll.lat, ll.lon);
  return [r1(e.x), r1(e.z)];
}
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }

export async function decodeAll() {
  const tiles = rangeTiles(tileRange(BBOX.city, Z));
  const out = { WA: [], RdCL: [], RdEdg: [], Cstline: [], WL: [], WStrL: [], RdCompt: [], Anno: [], StrctArea: [], tiles: 0 };
  for (const [tx, ty] of tiles) {
    const buf = await readTile(VT, Z, tx, ty);
    if (!buf) continue;
    out.tiles++;
    const vt = new VectorTile(new Pbf(buf));
    const props = (f) => { const o = {}; for (const [k, v] of Object.entries(f.properties)) o[k.replace(/^vt_/, "")] = v; return o; };
    for (const name of ["RdCL", "RdEdg", "Cstline", "WL", "WStrL", "RdCompt"]) {
      const L = vt.layers[name]; if (!L) continue;
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i);
        for (const line of f.loadGeometry()) {
          if (line.length < 2) continue;
          out[name].push({ ...props(f), tile: `${tx}/${ty}`, pts: line.map((p) => toEnu(tx, ty, p)) });
        }
      }
    }
    for (const name of ["WA", "StrctArea"]) {
      const L = vt.layers[name]; if (!L) continue;
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i);
        const polys = [];
        for (const ring of f.loadGeometry()) {
          const a = signedArea(ring);
          if (Math.abs(a) < 1e-9) continue;
          const r = ring.map((p) => toEnu(tx, ty, p));
          if (a > 0) polys.push({ outer: r, holes: [] });
          else if (polys.length) polys[polys.length - 1].holes.push(r);
        }
        for (const pg of polys) out[name].push({ ...props(f), ...pg });
      }
    }
    const A = vt.layers.Anno;
    if (A) for (let i = 0; i < A.length; i++) {
      const f = A.feature(i);
      const g = f.loadGeometry()[0]?.[0];
      if (!g) continue;
      out.Anno.push({ ...props(f), p: toEnu(tx, ty, g) });
    }
  }
  return out;
}

if (import.meta.main) {
  const t0 = performance.now();
  const out = await decodeAll();
  mkdirSync(CACHE, { recursive: true });
  await Bun.write(join(CACHE, "vt.json"), JSON.stringify(out));
  const counts = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]));
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), counts }));
}
