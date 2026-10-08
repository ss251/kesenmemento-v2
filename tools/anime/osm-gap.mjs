// [sys:2] OSM buildings that no app lot covers. build-layout.js takes its lots from the GSI footprints (about 2020-22) plus the override newLots,
// so a building that OSM mapped later (2020-2026) never becomes a lot unless a reviewer adds a newLot.
// [r3:1] THIS IS A gone-building list, NOT A TO-DO LIST. In the 11 non-excluded cells (c1-c12; the PIER7 / south-shore cell and the fish-market lots left out) 132 OSM buildings of 12 m2 or more had less than 30 % of
// their area under any lot (140 after round 3 removed ghost lots that had covered eight of them), and every one was put beside the 2026-03-11 Earth top and the GSI photo: about 85-90 % of the list (roughly 120 of
// 132) is gone or was never a roof: bare ground and pads (the c4 seawall yard, the 気仙沼公園 prefab rows, the c2 太田 row), car-park stalls (c1, c5, c7), tank bases, forest, slope ramps. About 9 % (about 12) stand in
// Earth 2026, mostly 25-145 m2 buildings (c12 w1242845988 145 m2, c10 w792747189, c6 w966913923, c5 w928776174, c2 w1242838123, c10 w792747216, c1 w929109575, c12 w1242845996 ...). An import of the list
// would have added about 100 phantom buildings. So every listed ring becomes a newLot only after an Earth top check plus o0 and o180 (tools/anime/earth-crop.mjs --ring), with src "osm: w... + earth: ...".
// Run it in the per-cell workflow (docs/anime/OVERRIDES.md step 2).
//
//   env -u NODE_OPTIONS bun tools/anime/osm-gap.mjs --cell c3            (a cell of data/anime/cells.json)
//   env -u NODE_OPTIONS bun tools/anime/osm-gap.mjs --bbox x0,z0,x1,z1   [--min 12] [--cov 0.3] [--json out.json]
//   env -u NODE_OPTIONS bun tools/anime/osm-gap.mjs --all                (every cell)
//
// OSM building rings come from raw/osm/overpass.json (© OpenStreetMap contributors, ODbL), sampled on a 1 m grid against the layout's lots
// (src/anime/world/layout.js LOTS); a building is listed when less than --cov (0.3) of its samples fall inside any lot. tools/anime/earth-ref.mjs
// writes the list for its cell as meta.osmCandidates and draws the rings dashed in top_annot.jpg.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOsm } from '../../scripts/anime/enrich/osm.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const pip = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

let _osm = null;
/** OSM building rings (ENU m): [{ osm, ring, area, name?, levels?, height?, part? }] (the parts of a building and 'building:part' are left out) */
export function osmBuildings(file = join(ROOT, 'raw/osm/overpass.json')) {
  if (_osm) return _osm;
  if (!existsSync(file)) throw new Error('raw/osm/overpass.json is missing (scripts/anime/enrich/fetch-osm.js)');
  const O = parseOsm(JSON.parse(readFileSync(file, 'utf8')));
  _osm = O.buildings.filter((b) => b.ring && !b.part && b.ring.length >= 3).map((b) => ({ osm: b.osm, ring: b.ring, area: area(b.ring), name: b.tags?.name, levels: b.tags?.['building:levels'], height: b.tags?.height, kind: b.tags?.building }));
  return _osm;
}
/** A 24 m grid of lot polygons: cover(x, z) -> is it inside a lot? */
export function lotCover(lots, cell = 24) {
  const g = new Map(), key = (i, j) => i * 100003 + j;
  for (const l of lots) {
    const P = l.poly; if (!P?.length) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) { const k = key(i, j); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(P); }
  }
  return (x, z) => { const a = g.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!a) return false; for (const P of a) if (pip(x, z, P)) return true; return false; };
}
/** Share of a ring's 1 m samples inside a lot */
export function ringCoverage(ring, cover) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  let n = 0, c = 0;
  for (let x = Math.ceil(x0) + 0.5; x < x1; x += 1) for (let z = Math.ceil(z0) + 0.5; z < z1; z += 1) if (pip(x, z, ring)) { n++; if (cover(x, z)) c++; }
  return n ? c / n : 1;
}
/**
 * OSM buildings of `bbox` [x0, z0, x1, z1] (their centroid inside it) of `min` m2 or more with less than `cov` of their area under any lot.
 * lots: layout lots with `poly`. -> [{ osm, ring, area, coverage, name, levels, height }] largest first
 */
export function osmGap({ lots, bbox, min = 12, cov = 0.3, buildings = osmBuildings() }) {
  const cover = lotCover(lots), out = [];
  for (const b of buildings) {
    if (b.area < min) continue;
    let cx = 0, cz = 0; for (const p of b.ring) { cx += p[0]; cz += p[1]; } cx /= b.ring.length; cz /= b.ring.length;
    if (bbox && (cx < bbox[0] || cx > bbox[2] || cz < bbox[1] || cz > bbox[3])) continue;
    const c = ringCoverage(b.ring, cover);
    if (c < cov) out.push({ osm: b.osm, ring: b.ring.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]), area: Math.round(b.area), coverage: Math.round(c * 100) / 100, name: b.name ?? null, levels: b.levels ?? null, height: b.height ?? null });
  }
  return out.sort((p, q) => q.area - p.area);
}

if (import.meta.main) {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf('--' + k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : i >= 0 ? '1' : null; };
  const L = await import(join(ROOT, 'src/anime/world/layout.js'));
  const cells = JSON.parse(readFileSync(join(ROOT, 'data/anime/cells.json'), 'utf8')).cells;
  const jobs = arg('all') ? Object.entries(cells).map(([id, c]) => [id, c.bbox]) : arg('cell') ? [[arg('cell'), cells[arg('cell')]?.bbox]] : arg('bbox') ? [['bbox', arg('bbox').split(',').map(Number)]] : null;
  if (!jobs || jobs.some(([, b]) => !b)) throw new Error('--cell <id> | --bbox x0,z0,x1,z1 | --all');
  const res = {};
  for (const [id, bbox] of jobs) {
    const list = osmGap({ lots: L.LOTS, bbox, min: Number(arg('min') || 12), cov: Number(arg('cov') || 0.3) });
    res[id] = list;
    console.log(`${id} [${bbox}]: ${list.length} OSM buildings of ${arg('min') || 12} m2 or more with under ${Number(arg('cov') || 0.3) * 100} % under a lot`);
    for (const b of list.slice(0, 25)) { const c = b.ring.reduce((s, p) => [s[0] + p[0] / b.ring.length, s[1] + p[1] / b.ring.length], [0, 0]); console.log(`  ${b.osm}\t(${c[0].toFixed(0)}, ${c[1].toFixed(0)})\t${b.area} m2\tcover ${b.coverage}\t${b.name || ''}\t${b.levels ? b.levels + 'F' : ''}`); }
  }
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(res));
}
