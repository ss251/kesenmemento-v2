// [v4:explore] Street-level data for the streamed core (V3-SPEC section 10, explorability) -> data/anime/explore.json.
//   env -u NODE_OPTIONS bun run scripts/anime/build-explore.js      (after build-layout.js; deterministic, ~10 s)
//
// layout.json keeps the far zone compact: far lots are only their oriented box (the footprint polygon is dropped),
// far roads are simplified to 2 m and rounded to 1 m, and far alleys (GSI roads under 3 m) are dropped entirely.
// Inside the core (the z18 aerial photo's extent, x -1730..2600, z -2100..2330) the player can now walk and drive, so
// this file restores what the street level needs there, from the same GSI sources and with the same rules as
// build-layout.js:
//   roads  every GSI road centre-line (RdCL) of the far part of the core at full precision (0.1 m), alleys included,
//          widths measured from the GSI road-edge lines (RdEdg) where both edges exist (else the rnkWidth nominal),
//          OSM names / refs / lanes / one-way (enrich/fold.js nameRoads);
//   lots   for every far lot of the core: the real footprint polygon (Douglas-Peucker 0.3 m) and the frontage
//          recomputed against all core roads including the alleys (the side of the minimum-area box that faces the
//          nearest road), so a house on an alley faces the alley.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ROOT } from "../terrain/tiles.js";
import { CACHE } from "./vt.js";
import { zoneOf } from "./build-layout.js";
import { minAreaRect, obbSides, rotYFacing, segDist, SegHash, polylineLength, alongPolyline, nominalWidth, roadKind, roadWidthFromEdges, simplify, centroid, polyArea } from "./derive.js";
import { nameRoads, OVERRIDES_DIR, loadOverrides, compileOverrides, overrideFeatures, applyRoadOverrides } from "./enrich/fold.js";

/** The streamed core: the extent of data/ortho/core.jpg (z18) and of the 4 m core grid. */
export const CORE = { x0: -1730, z0: -2100, x1: 2600, z1: 2330 };
export const inCore = (x, z, pad = 0) => x >= CORE.x0 - pad && x <= CORE.x1 + pad && z >= CORE.z0 - pad && z <= CORE.z1 + pad;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const P1 = (p) => [r1(p[0]), r1(p[1])];

export async function buildExplore({ overridesDir = OVERRIDES_DIR } = {}) {
  const t0 = performance.now();
  const vt = await Bun.file(join(CACHE, "vt.json")).json();
  const bld = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
  const layout = await Bun.file(join(ROOT, "data/anime/layout.json")).json();
  const enrichPath = join(ROOT, "data/anime/enrich.json");
  const E = existsSync(enrichPath) ? await Bun.file(enrichPath).json() : null;

  // ---------------------------------------------------------------- roads of the far part of the core
  const edgeHash = new SegHash(24);
  for (const e of vt.RdEdg) for (let i = 1; i < e.pts.length; i++) edgeHash.add(e.pts[i - 1], e.pts[i], null);
  const roads = [];
  let measured = 0;
  vt.RdCL.forEach((f, i) => {
    const pts = f.pts;
    const mid = alongPolyline(pts, polylineLength(pts) / 2).p;
    if (!inCore(mid[0], mid[1])) return;
    if (zoneOf(mid[0], mid[1], 60) !== "far") return;          // hero / mid roads are in layout.json already
    const kind = roadKind(f);
    let width = nominalWidth(f);
    const w = roadWidthFromEdges(pts, f.rnkwidth, edgeHash);
    if (w) { width = w; measured++; }
    roads.push({ id: "r" + i, pts: simplify(pts, 0.15).map(P1), width: r1(width), kind, zone: "far", rank: f.rnkwidth, code: f.code });
  });
  const named = E ? nameRoads(roads, E.roads) : null;
  // [v4:overrides] the same road patches as build-layout.js (docs/anime/OVERRIDES.md): here they reach the far alleys too;
  // new roads are taken when they are far roads of the core (hero / mid ones are in layout.json)
  const OV = compileOverrides(loadOverrides(overridesDir));
  const ovRoads = applyRoadOverrides(roads, OV, { zoneOf: (x, z) => zoneOf(x, z, 60), keep: (r) => { const m = alongPolyline(r.pts, polylineLength(r.pts) / 2).p; return r.zone === "far" && inCore(m[0], m[1]); } });

  // ---------------------------------------------------------------- frontage against every core road (alleys too)
  const hash = new SegHash(32);
  for (const r of layout.roads) { if (r.zone === "far") continue; for (let i = 1; i < r.pts.length; i++) hash.add(r.pts[i - 1], r.pts[i], r); }
  for (const r of roads) for (let i = 1; i < r.pts.length; i++) hash.add(r.pts[i - 1], r.pts[i], r);

  const farIds = new Set(layout.farLots.rows.map((row) => row[0]));
  const lots = {};
  let n = 0, turned = 0;
  for (const b of bld.features.concat(overrideFeatures(OV))) {   // [v4:overrides] + the new lots (removed lots are not in farIds)
    if (!farIds.has(b.id) || !b.poly || b.poly.length < 3) continue;
    const ring = b.poly, c = centroid(ring);
    if (!inCore(c[0], c[1])) continue;
    if (Math.abs(polyArea(ring)) < 6) continue;
    const box = minAreaRect(ring);
    let best = null;
    for (const s of hash.near(c[0], c[1], 40)) { const q = segDist(c[0], c[1], s.a, s.b); if (!best || q.d < best.d) best = { d: q.d, q: q.q, road: s.data }; }
    const sides = obbSides(box);
    let side = sides[2], front = null;
    if (best) {
      const vx = best.q[0] - c[0], vz = best.q[1] - c[1], vl = Math.hypot(vx, vz) || 1;
      side = sides.reduce((m, sd) => ((sd.n[0] * vx + sd.n[1] * vz) / vl > (m.n[0] * vx + m.n[1] * vz) / vl ? sd : m), sides[0]);
      front = { roadId: best.road.id, dist: r1(Math.max(0, best.d - (side.half || 0) - best.road.width / 2)) };
    }
    const poly = simplify(ring, 0.3).map(P1);
    lots[b.id] = [poly, r3(rotYFacing(side.n[0], side.n[1])), r2(side.len), r2(2 * side.half), front?.roadId ?? null, front?.dist ?? null];
    n++;
  }
  // how many far lots now face another side than layout.json's (an alley instead of the street behind)
  const rowById = new Map(layout.farLots.rows.map((row) => [row[0], row]));
  for (const [id, v] of Object.entries(lots)) { const row = rowById.get(id); if (row && Math.abs(Math.atan2(Math.sin(v[1] - row[5]), Math.cos(v[1] - row[5]))) > 0.3) turned++; }
  const log = { ms: Math.round(performance.now() - t0), roads: roads.length, alleys: roads.filter((r) => r.kind === "alley").length, measured, named, lots: n, turned, overrides: { files: OV.files.length, roads: { patched: ovRoads.patched, removed: ovRoads.removed, added: ovRoads.added } } };
  return { out: { version: 1, core: CORE, fields: { lot: ["poly", "rotY", "w", "d", "roadId", "frontDist"] }, roads, lots }, log };
}

if (import.meta.main) {
  const ai = process.argv.indexOf("--overrides"), ovArg = ai > 0 ? process.argv[ai + 1] : null;   // as build-layout.js
  const { out, log } = await buildExplore(ovArg ? { overridesDir: ovArg === "none" ? null : ovArg } : {});
  const txt = JSON.stringify(out);
  await Bun.write(join(ROOT, "data/anime/explore.json"), txt);
  console.log(JSON.stringify({ ok: true, bytes: txt.length, ...log }));
}
