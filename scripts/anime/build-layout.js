// [v3:foundation] Real-data layout for the anime world -> data/anime/layout.json (+ grids from build-grids.js).
//   env -u NODE_OPTIONS bun run scripts/anime/vt.js           (once: decode raw/tiles -> data/cache/anime/vt.json)
//   env -u NODE_OPTIONS bun run scripts/anime/build-grids.js  (terrain + sea grids)
//   env -u NODE_OPTIONS bun run scripts/anime/build-layout.js (this: zones, water, quays, roads, lots, poles, spots, tour)
// Everything is deterministic (seeded by ids). Pure maths lives in derive.js (tested in test/v3-layout.test.js).
import { join } from "node:path";
import { siteOfLot, kazemachiOf } from "../../src/anime/world/harbor/real.js";
import { applyLotFix, applyPlaceFix } from "../../src/anime/world/lotfix.js";   // [v4:polish1] reference corrections   // [v4:landmarks-A] [v4:polish1] kazemachiOf
import { siteOfLotB, tagOfSiteB } from "../../src/anime/world/landmarks/sites.js";   // [v4:landmarks-B]
import { ROOT } from "../terrain/tiles.js";
import { openGrids, makeSampler } from "../../src/anime/world/layout/grids.js";
import {
  hash32, polyArea, centroid, minAreaRect, obbSides, rotYFacing, segDist, SegHash, polylineLength, alongPolyline,
  nominalWidth, roadKind, classifyLot, lotRoofColor, lotWallColor, roadWidthFromEdges, simplify, quayKind,
} from "./derive.js";
import { CACHE } from "./vt.js";
// [v4:data] real-source enrichment (OSM, GSI Anno, aerial roof analysis): scripts/anime/enrich/*
import { existsSync } from "node:fs";
import { lotTable, roofWhiteBalance, fitRoofTransform, enrichLot, nameRoads, riverWidth, waterEdges, placeId, showable } from "./enrich/fold.js";
// [v4:overrides] per-cell reference overrides (data/anime/overrides/*.json, docs/anime/OVERRIDES.md), folded in last
import { OVERRIDES_DIR, loadOverrides, compileOverrides, overrideFeatures, patchLot, unusedLotPatches, applyRoadOverrides, applyLanduseOverrides, propPlacements } from "./enrich/fold.js";
import { tileToLl, llToEnu } from "../../src/core/geo.js";
import { LAND_FILL, inFill } from "./landfill.js";   // [v6:c8] reclaimed land GSI still draws as water

export const ZONES = {
  hero: { cx: 180, cz: -20, r: 380 },
  mid: { cx: 250, cz: 150, r: 1100 },
  far: { x0: -6506, z0: -9325, x1: 10843, z1: 8437 },
};
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const P1 = (p) => [r1(p[0]), r1(p[1])];
export function zoneOf(x, z, pad = 0) {
  if (Math.hypot(x - ZONES.hero.cx, z - ZONES.hero.cz) <= ZONES.hero.r + pad) return "hero";
  if (Math.hypot(x - ZONES.mid.cx, z - ZONES.mid.cz) <= ZONES.mid.r + pad) return "mid";
  return "far";
}
const inFar = (x, z) => x >= ZONES.far.x0 && x <= ZONES.far.x1 && z >= ZONES.far.z0 && z <= ZONES.far.z1;

/** opts.overridesDir: the override folder (default data/anime/overrides; tests pass a fixture folder). */
export async function buildLayout({ overridesDir = OVERRIDES_DIR } = {}) {
  const t0 = performance.now();
  const vt = await Bun.file(join(CACHE, "vt.json")).json();
  const meta = await Bun.file(join(ROOT, "data/anime/grids.json")).json();
  const S = makeSampler(openGrids(meta, await Bun.file(join(ROOT, "data/anime/grids.bin")).arrayBuffer()));
  const bld = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
  const landmarks = await Bun.file(join(ROOT, "data/landmarks.json")).json();
  const LM = Object.fromEntries(landmarks.map((l) => [l.id, l]));
  const log = {};
  // [v4:data] enrichment (optional: the layout still builds from GSI alone without it)
  const enrichPath = join(ROOT, "data/anime/enrich.json");
  const E = existsSync(enrichPath) ? await Bun.file(enrichPath).json() : null;
  const ET = E ? lotTable(E) : new Map();
  const WB = E ? roofWhiteBalance(ET) : [1, 1, 1];
  // [v4:overrides] every override file, in file-name order (validated: the build stops on a malformed file)
  const OV = compileOverrides(loadOverrides(overridesDir));
  // [v5:fix2] the aerial roof colours go through a GSI -> Google Earth 2026-03-11 transform fitted on the override lots
  // (their roof colours were read on Earth), in place of the white balance; without overrides, the white balance
  const roofPairs = [];
  for (const [id, ops] of OV.lotPatch) { const c = ops.map((o) => o.roof?.color).filter(Boolean).pop(), e = ET.get(id); if (c && e?.rgb && !(e.veg > 0.5)) roofPairs.push([e.rgb, c.toLowerCase()]); }
  const ROOF_T = roofPairs.length >= 24 ? fitRoofTransform(roofPairs) : null;
  log.roofTransform = ROOF_T;
  const ovLog = { files: OV.files, lots: 0, removed: 0, newLots: OV.newLots.length, warnings: [] };

  // ---------------------------------------------------------------- roads (RdCL) + widths from road edges (RdEdg)
  const edgeHash = new SegHash(24);
  for (const e of vt.RdEdg) for (let i = 1; i < e.pts.length; i++) edgeHash.add(e.pts[i - 1], e.pts[i], null);
  const ROADS = [];
  let measured = 0;
  vt.RdCL.forEach((f, i) => {
    const pts = f.pts;
    const mid = alongPolyline(pts, polylineLength(pts) / 2).p;
    if (!inFar(mid[0], mid[1])) return;
    const zone = zoneOf(mid[0], mid[1], 60);
    let kind = roadKind(f);
    const nominal = nominalWidth(f);
    if (zone === "far" && kind === "alley") return;
    let width = nominal;
    if (zone !== "far") {
      const w = roadWidthFromEdges(pts, f.rnkwidth, edgeHash);
      if (w) { width = w; measured++; }
    }
    ROADS.push({ id: "r" + i, pts: (zone === "far" ? simplify(pts, 2) : pts).map(P1), width: r1(width), kind, zone, rank: f.rnkwidth, code: f.code });
  });
  log.roads = { n: ROADS.length, measured }; console.error("roads", Math.round(performance.now() - t0));
  if (E) log.roads.osm = nameRoads(ROADS, E.roads);   // [v4:data] names, refs, lanes, one-way, speed limits
  // [v4:overrides] road patches and new roads (before the lots, so a lot faces the corrected street). A patch whose id is
  // a far alley (dropped here, kept at full precision by build-explore.js) is applied there; an unknown id is an error.
  ovLog.roads = applyRoadOverrides(ROADS, OV, { zoneOf: (x, z) => zoneOf(x, z, 60), keep: (r) => !(r.zone === "far" && r.kind === "alley") });
  for (const id of ovLog.roads.missing) if (!vt.RdCL[Number(id.slice(1))]) throw new Error(`overrides: road ${id} does not exist (${OV.roadPatch.get(id)[0].ref})`);
  const roadHash = new SegHash(32);
  for (const r of ROADS) for (let i = 1; i < r.pts.length; i++) roadHash.add(r.pts[i - 1], r.pts[i], r);

  // ---------------------------------------------------------------- water polygons (sea, WA 5100)
  const WATER = [];
  for (const f of vt.WA) {
    if (f.code !== 5100) continue;
    const c = centroid(f.outer);
    const near = zoneOf(c[0], c[1], 400) !== "far";
    const ring = simplify(f.outer, near ? 0.6 : 6).map(P1);
    if (ring.length >= 3) WATER.push({ zone: near ? "mid" : "far", ring, holes: f.holes.map((h) => simplify(h, near ? 0.6 : 6).map(P1)).filter((h) => h.length >= 3) });
  }
  log.water = WATER.length; console.error("water", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- quays (coastline pieces <= 24 m, classified)
  const QUAYS = [];
  // [v6:c8] the new edge of a land fill (scripts/anime/landfill.js): seawall pieces of 24 m or less, top from the land
  // height like the pieces below. Chained right after the kept piece that ends where the wall starts (so harbor/world.js
  // quayChains joins them), or appended when no piece ends there.
  const fillWalls = new Map(LAND_FILL.filter((f) => f.wall?.length >= 2).map((f) => [f.id, f]));
  log.landFill = { skipped: 0, walls: 0 };
  const pushWall = (f) => {
    fillWalls.delete(f.id);
    for (let i = 1; i < f.wall.length; i++) {
      const a = f.wall[i - 1], b = f.wall[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 24));
      for (let k = 0; k < n; k++) {
        const pa = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], pb = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2, zone = zoneOf(mx, mz);
        const dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        const inl = S.shoreDist(mx + nx * 6, mz + nz * 6) < S.shoreDist(mx - nx * 6, mz - nz * 6) ? 1 : -1;
        const land = S.heightAt(mx + nx * inl * 8, mz + nz * inl * 8);
        QUAYS.push({ a: P1(pa), b: P1(pb), top: r2(Math.max(1.2, Math.min(4.2, land))), kind: "seawall", zone, fill: f.id });
        log.landFill.walls++;
      }
    }
  };
  for (const c of vt.Cstline) {
    const pts = c.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      const n = Math.max(1, Math.ceil(L / 24));
      for (let k = 0; k < n; k++) {
        const pa = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], pb = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
        if (!inFar(mx, mz)) continue;
        const zone = zoneOf(mx, mz);
        if (zone === "far") continue;
        if (LAND_FILL.some((f) => inFill(mx, mz, f, f.pad ?? 2))) { log.landFill.skipped++; continue; }   // [v6:c8] filled in since
        // inland normal: the side where the shore distance is negative
        const dx = pb[0] - pa[0], dz = pb[1] - pa[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        const s1 = S.shoreDist(mx + nx * 6, mz + nz * 6), s2 = S.shoreDist(mx - nx * 6, mz - nz * 6);
        const inl = s1 < s2 ? 1 : -1;
        const lx = mx + nx * inl * 8, lz = mz + nz * inl * 8;
        const land = S.heightAt(lx, lz), far = S.heightAt(mx + nx * inl * 30, mz + nz * inl * 30);
        const kind = quayKind({ x: mx, z: mz, zone, land, slope: (far - land) / 22, roadNear: roadHash.near(lx, lz, 14).some((s) => segDist(lx, lz, s.a, s.b).d < 10) });
        QUAYS.push({ a: P1(pa), b: P1(pb), top: r2(Math.max(1.2, Math.min(kind === "rocks" || kind === "beach" ? 2.2 : 4.2, land))), kind, zone });
        for (const f of [...fillWalls.values()]) if (Math.hypot(pb[0] - f.wall[0][0], pb[1] - f.wall[0][1]) < 0.6) pushWall(f);
      }
    }
  }
  for (const f of [...fillWalls.values()]) pushWall(f);
  log.quays = QUAYS.length; console.error("quays", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- lots
  const tagged = landmarkTags(LM);
  const LOTS = [];
  const seenIds = new Set();
  for (const b of bld.features.concat(overrideFeatures(OV))) {   // [v4:overrides] + the new lots
    const ring = b.poly;
    if (!ring || ring.length < 3) continue;
    const A = Math.abs(polyArea(ring));
    if (A < 6) continue;
    const c = centroid(ring);
    if (!inFar(c[0], c[1])) continue;
    const zone = zoneOf(c[0], c[1]);
    const box = minAreaRect(ring);
    // frontage: the OBB side whose outward normal best faces the nearest road
    let best = null;
    for (const s of roadHash.near(c[0], c[1], 40)) {
      const q = segDist(c[0], c[1], s.a, s.b);
      if (!best || q.d < best.d) best = { d: q.d, q: q.q, road: s.data };
    }
    const sides = obbSides(box);
    let side = sides[2], front = null;
    if (best) {
      const vx = best.q[0] - c[0], vz = best.q[1] - c[1], vl = Math.hypot(vx, vz) || 1;
      side = sides.reduce((m, sd) => ((sd.n[0] * vx + sd.n[1] * vz) / vl > (m.n[0] * vx + m.n[1] * vz) / vl ? sd : m), sides[0]);
      const fd = Math.max(0, best.d - (side.half || 0) - best.road.width / 2);
      front = { kind: best.road.kind, width: best.road.width, dist: fd, roadId: best.road.id };
    } else {
      // no road: face the downhill side (toward the sea usually)
      side = sides.reduce((m, sd) => (S.heightAt(sd.mid[0], sd.mid[1]) < S.heightAt(m.mid[0], m.mid[1]) ? sd : m), sides[0]);
    }
    const w = side.len, d = 2 * side.half;
    const rotY = rotYFacing(side.n[0], side.n[1]);
    seenIds.add(b.id);
    const tag = b.ovr ? null : tagged(c, A, b, ET.get(b.id));   // [v4:landmarks-A] the enrichment carries the lot's OSM match
    const shore = S.shoreDist(c[0], c[1]);
    const cls = classifyLot({ id: b.id, code: b.code, area: A, h: b.h, zone, shore, front, tag: tag?.kind });
    // ground: the lowest of centre + OBB corners (never float); the frontage height too
    const ca = Math.cos(box.ang), sa = Math.sin(box.ang);
    let gy = S.heightAt(c[0], c[1]);
    for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) gy = Math.min(gy, S.heightAt(box.cx + ca * box.hu * u - sa * box.hv * v, box.cz + sa * box.hu * u + ca * box.hv * v));
    const roofShape = tag?.roof || cls.roofShape;
    // [v4:data] real values from OSM, GSI Anno and the aerial photo override the derived ones (fold.js precedence)
    const classify = (kind) => classifyLot({ id: b.id, code: b.code, area: A, h: b.h, zone, shore, front, tag: kind });
    const en = enrichLot(ET.get(b.id), { area: A, kind: cls.kind, storeys: cls.storeys, height: cls.height, roofShape, roofColor: tag?.roofColor || lotRoofColor(cls.kind, roofShape, b.rgbWB || b.rgb, b.id),
      roofSrc: tag?.roofColor ? "landmark" : "derived", wall: lotWallColor(cls.kind, b.id), rotY, landmark: tag?.landmark }, ROOF_T || WB, classify);
    if (tag?.storeys) { en.storeys = tag.storeys; en.height = tag.height; en.src.h = "landmark"; }
    const lot = {
      id: b.id, zone, kind: en.kind,
      poly: (zone === "far" ? simplify(ring, 0.8) : ring).map(P1),
      obb: { cx: r2(box.cx), cz: r2(box.cz), w: r2(w), d: r2(d), rotY: r3(rotY) },
      front: { rotY: r3(rotY), roadId: front?.roadId ?? null, x: r2(side.mid[0]), z: r2(side.mid[1]), dist: front ? r1(front.dist) : null },
      storeys: en.storeys, height: en.height, groundY: r2(Math.max(0.6, gy)),
      roof: en.roof,
      wall: en.wall, seed: hash32(b.id), area: Math.round(A),
      src: en.src,
    };
    for (const k of ["name", "nameEn", "use", "facility", "osm"]) if (en[k] != null) lot[k] = en[k];
    if (tag?.landmark) lot.landmark = tag.landmark;
    applyLotFix(lot);   // [v4:polish1]
    // [v4:overrides] a new lot takes its values from its op; then every patch of the lot, in file order
    if (b.ovr) { lot.src = { h: "derived", kind: "override", roof: "derived", color: "derived" }; delete lot.roof.photo; if (patchLot(lot, [b.ovr], classify) === "remove") continue; }
    const ops = OV.lotPatch.get(b.id);
    if (ops) {
      if (lot.landmark) ovLog.warnings.push(`${ops[0].ref}: lot ${b.id} is drawn by the dedicated model '${lot.landmark}'; only its data changes`);
      if (patchLot(lot, ops, classify) === "remove") { ovLog.removed++; continue; }
      ovLog.lots++;
    }
    LOTS.push(lot);
  }
  console.error("lots", Math.round(performance.now() - t0));
  const unused = unusedLotPatches(OV, seenIds);
  if (unused.length) throw new Error(`overrides: no such lot ${unused.map((id) => `${id} (${OV.lotPatch.get(id)[0].ref})`).join(", ")}`);
  LOTS.sort((a, b) => (a.zone === b.zone ? 0 : a.zone === "hero" ? -1 : b.zone === "hero" ? 1 : a.zone === "mid" ? -1 : 1));
  log.enrich = E ? enrichLog(LOTS) : null;
  log.lots = { n: LOTS.length, hero: LOTS.filter((l) => l.zone === "hero").length, mid: LOTS.filter((l) => l.zone === "mid").length, kinds: count(LOTS.filter((l) => l.zone !== "far"), "kind") };

  // ---------------------------------------------------------------- utility pole runs (hero + mid streets)
  const lotHash = new SegHash(24);
  for (const l of LOTS) if (l.zone !== "far") { const o = l.obb; lotHash.add([o.cx, o.cz], [o.cx, o.cz], l); }
  const POLE_RUNS = [];
  for (const r of ROADS) {
    if (r.zone === "far" || r.kind === "bridge" || r.width < 3.2) continue;
    const L = polylineLength(r.pts);
    if (L < 45) continue;
    const spacing = 28 + (hash32(r.id) % 9);
    const sideSign = hash32(r.id + "side") & 1 ? 1 : -1;
    let pts = [];
    const flush = () => { if (pts.length >= 2) POLE_RUNS.push({ roadId: r.id, pts }); pts = []; };
    for (let s = spacing * 0.35; s < L; s += spacing) {
      const { p, t } = alongPolyline(r.pts, s);
      const off = r.width / 2 + 0.45;
      const x = p[0] - t[1] * off * sideSign, z = p[1] + t[0] * off * sideSign;
      if (S.shoreDist(x, z) > -1.5) { flush(); continue; }
      // keep clear of building footprints (pole must stand on the sidewalk)
      const clash = lotHash.near(x, z, 30).some((s2) => { const o = s2.data.obb; const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.rotY), sn = Math.sin(o.rotY); const lx = dx * c - dz * sn, lz = dx * sn + dz * c; return Math.abs(lx) < o.w / 2 + 0.2 && Math.abs(lz) < o.d / 2 + 0.2; });
      if (clash) { flush(); continue; }
      const last = pts[pts.length - 1];
      if (last && Math.hypot(x - last[0], z - last[1]) > 45) flush();
      pts.push([r1(x), r1(z)]);
    }
    flush();
  }
  log.poleRuns = POLE_RUNS.length; console.error("poles", Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- spots, tour, hero
  const SPOTS = spots(S, ROADS, QUAYS, LM, vt);
  const TOUR = tour(S, LM);
  const HERO = {
    // 16:30 drone over the inner bay toward 安波山 (glittering bay left, 神明崎 + town right); walk: the north-shore
    // promenade looking along the seawall toward 神明崎 (sun from behind-right)
    drone: { pos: [400, 95, 90], look: [80, 10, -220] },
    walk: { x: 168, z: -122, y: Math.round(S.heightAt(168, -122) * 100) / 100, yaw: 111, pitch: 2 },   // [v3:fix] the promenade deck looking west along the seawall (the old spot faced the rocks)
  };
  // [v4:data] land use, rivers, places, signals: the real-world layers from OSM and GSI (enrich.json)
  const X = E ? extras(E, vt, ROADS, LOTS) : {};
  // [v4:overrides] land use polygons, prop placements, and the provenance of every override file
  if (OV.landuse.length) { const lu = applyLanduseOverrides(X.landuse || [], OV); X.landuse = lu.landuse; ovLog.landuse = { added: OV.landuse.length, replaced: lu.replaced }; }
  if (OV.props.length) X.props = propPlacements(OV);
  if (OV.meta.length) X.overrides = OV.meta;
  log.overrides = ovLog;
  log.extras = Object.fromEntries(Object.entries(X).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]));
  log.ms = Math.round(performance.now() - t0);
  return { ...X, version: 1, generated: "scripts/anime/build-layout.js", origin: { lat: 38.906, lon: 141.575 }, zones: ZONES, water: WATER, quays: QUAYS, roads: ROADS, lots: LOTS, poleRuns: POLE_RUNS, spots: SPOTS, tour: TOUR, hero: HERO, log };
}

/** [v4:data] Coverage of real values over all lots, and over the hero + mid lots. */
function enrichLog(LOTS) {
  const f = (arr) => {
    const n = arr.length || 1, c = (p) => Math.round((arr.filter(p).length / n) * 10000) / 10000;
    // [v4:overrides] a value set by an override (read from the newest imagery) counts as real
    return { n: arr.length, realHeight: c((l) => l.src.h === "osm" || l.src.h === "landmark" || l.src.h === "override"), name: c((l) => !!l.name), roofShapeReal: c((l) => l.src.roof === "osm" || l.src.roof === "aerial" || l.src.roof === "override"),
      roofColourReal: c((l) => l.src.color === "osm" || l.src.color === "aerial" || l.src.color === "landmark" || l.src.color === "override"), kindReal: c((l) => l.src.kind !== "derived"), ridge: c((l) => !!l.roof.ridge), override: c((l) => !!l.src.ovr) };
  };
  return { all: f(LOTS), near: f(LOTS.filter((l) => l.zone !== "far")), hero: f(LOTS.filter((l) => l.zone === "hero")) };
}

/** [v4:data] The real-world layers for the app: landuse, rivers, places (search + labels), signals, crossings, bridges. */
function extras(E, vt, ROADS, LOTS) {
  const roadHash = new SegHash(32);
  for (const r of ROADS) for (let i = 1; i < r.pts.length; i++) roadHash.add(r.pts[i - 1], r.pts[i], r);
  const nearestRoad = (p, maxD = 25) => { let b = null; for (const s of roadHash.near(p[0], p[1], maxD)) { const q = segDist(p[0], p[1], s.a, s.b); if (q.d <= maxD && (!b || q.d < b.d)) b = { d: q.d, id: s.data.id, q: q.q }; } return b; };
  // z16 tile borders in ENU (WA polygons are clipped there; those edges are not river banks)
  const Z = 16, bx = new Set(), bz = new Set();
  for (let tx = 58520; tx <= 58580; tx++) bx.add(Math.round(llToEnu(38.9, tileToLl(tx, 0, Z).lon).x * 10));
  for (let ty = 25030; ty <= 25090; ty++) bz.add(Math.round(llToEnu(tileToLl(0, ty, Z).lat, 141.575).z * 10));
  const onBorder = (a, b) => (Math.abs(a[0] - b[0]) < 0.3 && [-1, 0, 1].some((k) => bx.has(Math.round(a[0] * 10) + k))) || (Math.abs(a[1] - b[1]) < 0.3 && [-1, 0, 1].some((k) => bz.has(Math.round(a[1] * 10) + k)));
  const edges = waterEdges(vt.WA, onBorder);
  const rivers = E.rivers.map((r) => {
    const o = { name: showable(r.name) ? r.name : null, nameEn: showable(r.nameEn) ? r.nameEn : null, kind: r.kind, pts: r.pts, osm: r.osm };
    const w = r.width ?? (r.kind === "river" ? riverWidth(r.pts, edges) : null);
    if (w) o.width = w;
    if (r.tunnel) o.tunnel = true;
    return o;
  });
  const lotAt = new Map(LOTS.map((l) => [l.id, l]));
  const places = [];
  const seen = new Set();
  // [v6:c11] a name that starts with （旧） is a former use (src/anime/world/layout.js PLACES drops them at load too)
  const add = (o) => { if (!showable(o.name) || /^[（(]旧[）)]/.test(o.name)) return; if (o.nameEn && !showable(o.nameEn)) o.nameEn = null; const k = o.name + "|" + Math.round(o.x / 30) + "," + Math.round(o.z / 30); if (seen.has(k)) return; seen.add(k); places.push({ id: placeId(o.name, [o.x, o.z]), ...o }); };
  // named buildings (lots) first: their position is the building
  for (const l of LOTS) if (l.name) add({ name: l.name, nameEn: l.nameEn ?? null, cat: l.facility || (l.use ? l.use.split(":")[1] : l.kind), x: r1(l.obb.cx), z: r1(l.obb.cz), lot: l.id, src: l.src.name });
  for (const p of E.pois) if (p.name) add({ name: p.name, nameEn: p.nameEn ?? null, cat: p.type, group: p.cat, x: p.p[0], z: p.p[1], lot: p.lot && lotAt.has(p.lot) ? p.lot : null, src: "osm", osm: p.osm });
  for (const f of E.facilities) add({ name: f.name, nameEn: null, cat: f.cat, group: "facility", x: f.p[0], z: f.p[1], lot: f.lot ?? null, src: "gsi" });
  for (const p of E.places) add({ name: p.name, nameEn: null, cat: p.cat, group: "place", x: p.p[0], z: p.p[1], lot: null, src: "gsi" });
  const signals = E.signals.map((p) => { const r = nearestRoad(p, 20); return { x: p[0], z: p[1], roadId: r?.id ?? null }; });
  const crossings = E.crossings.map((c) => { const r = nearestRoad(c.p, 20); return { x: c.p[0], z: c.p[1], kind: c.kind, signals: !!c.signals, roadId: r?.id ?? null }; });
  // near the town: the 0.8 m outlines; elsewhere simplified to 2.5 m on a 1 m grid (a far field reads the same)
  const lu = (l) => { const c = l.ring[0], near = zoneOf(c[0], c[1], 300) !== "far"; const sim = (r) => (near ? r : simplify(r, 2.5).map((p) => [Math.round(p[0]), Math.round(p[1])])); return { ring: sim(l.ring), holes: l.holes.map(sim).filter((h) => h.length >= 3) }; };
  const landuse = E.landuse.map((l) => ({ cls: l.cls, type: l.type, name: showable(l.name) ? l.name : null, ...lu(l), area: l.area })).filter((l) => l.ring.length >= 3);
  const bridges = E.bridges.filter((b) => showable(b.name)).map((b) => ({ name: b.name, kind: b.kind, pts: b.pts }));
  const rail = E.rail.map((r) => ({ kind: r.kind, name: showable(r.name) ? r.name : null, pts: r.pts, bridge: !!r.bridge, tunnel: !!r.tunnel }));
  applyPlaceFix(places);   // [v4:polish3] reference corrections of GSI annotation points
  return { landuse, rivers, places, signals, crossings, bridges, rail, credits: E.attribution };
}

function count(arr, k) { const o = {}; for (const a of arr) o[a[k]] = (o[a[k]] || 0) + 1; return o; }

// [v4:landmarks-A] roof colour (aerial photo, cyan cast removed; docs/anime/landmarks) and [storeys, height] per site
const SITE_ROOF = { mukaeruDeck: "#b08a62", pier7Deck: "#b08a62", pier7Deck2: "#b08a62", shamusho: "#6a4a42", ikari: "#6f5a4a", marketNorth: "#c3c6c2", marketShed: "#c3c6c2", marketC: "#e8eae8", marketD: "#e6e8e6", uminoichi: "#a9aca7", pier7: "#eceeed", mukaeru: "#eceeed", yuwaeru: "#eceeed", hirakeru: "#eceeed" };
const SITE_STOREYS = { mukaeruDeck: [1, 6.2], pier7Deck: [1, 6.2], pier7Deck2: [1, 6.2], shamusho: [1, 4.8], ikari: [1, 3.6], marketNorth: [2, 11], marketShed: [2, 11], marketC: [3, 16], marketD: [2, 14], uminoichi: [2, 19], pier7: [3, 13], mukaeru: [3, 11.5], yuwaeru: [2, 7], hirakeru: [1, 5.5] };
/** Buildings that are landmarks (dedicated models) or have a known use. */
function landmarkTags(LM) {
  void LM;
  return (c, A, b, e) => {
    // [v4:landmarks-A] the market's four parts, 海の市, PIER7, 迎, 結 and 拓 are dedicated harbour models built from
    // their OSM outlines (src/anime/world/harbor/real.js SITES): every footprint of those buildings is tagged so town
    // skips it (the old rule tagged any big footprint within 260 m of the market point as one generic "fishMarket")
    const site = siteOfLot(e?.osm, c[0], c[1]);
    if (site) return { kind: "landmark", landmark: site, roof: "flat", roofColor: SITE_ROOF[site] || "#dcdcd4", storeys: SITE_STOREYS[site]?.[0] ?? 2, height: SITE_STOREYS[site]?.[1] ?? 9.5 };
    // [v4:polish1] 風待ち地区's rebuilt heritage buildings (harbor/real.js KAZEMACHI): the kind stays the lot's own (the
    // brewery's and the rice merchant's shops), storeys / height / roof are the model's, from their records
    const kz = kazemachiOf(b?.id);
    if (kz) return { kind: null, landmark: "kazemachi:" + kz.id, roof: kz.roof, roofColor: kz.roofColor, storeys: kz.storeys, height: kz.height };
    // 五十鈴神社 on 神明崎 (read from the ortho: the tiled hall on the peninsula)
    if (Math.hypot(c[0] - 363, c[1] + 126) < 9) return { kind: "shrine", landmark: "isuzuShrine", roof: "gable", roofColor: "#56677a", storeys: 1, height: 5.2 };
    // [v4:landmarks-B] city hall campus, the new city hall site (the demolished hospital blocks), the station, リアス・
    // アーク, the hospitals, schools, temples and the church, 亀山 and 浦の浜: dedicated models (src/anime/world/landmarks)
    const siteB = siteOfLotB(e?.osm, c[0], c[1], A, b?.poly);   // [v4:integrate] + the footprint (station overlap)
    if (siteB) return { kind: "landmark", landmark: siteB, ...tagOfSiteB(siteB) };
    return null;
  };
}

function spots(S, ROADS, QUAYS, LM, vt) {
  const onLand = (x, z) => ({ x, z, y: Math.round(S.heightAt(x, z) * 100) / 100 });
  const bridgeAxis = (x, z, r) => {
    // longest bridge RdCL near a landmark -> end points (a, b) of the span
    let best = null;
    for (const f of vt.RdCL) {
      if (!(f.code === 2703 || f.code === 2713 || f.code === 2722 || f.code === 2704 || f.code === 2714)) continue;
      const p = f.pts; if (!p.some((q) => Math.hypot(q[0] - x, q[1] - z) < r)) continue;
      const L = polylineLength(p); if (!best || L > best.L) best = { L, a: p[0], b: p[p.length - 1], pts: p };
    }
    return best;
  };
  void bridgeAxis;   // [v4:landmarks-A] the Oshima ends come from OSM now (the GSI centre-line was 9-10 m off at the ends)
  const promenade = QUAYS.filter((q) => q.kind === "promenade").filter((_, i) => i % 3 === 0).map((q) => { const x = (q.a[0] + q.b[0]) / 2, z = (q.a[1] + q.b[1]) / 2; return { x: r1(x), z: r1(z), top: q.top, rotY: r3(Math.atan2(q.b[0] - q.a[0], q.b[1] - q.a[1]) + Math.PI / 2) }; });
  return {
    ukimido: { x: 341.6, z: -23.4, y: 1.6, rotY: 0, note: "浮見堂 pavilion on the water at the tip of 神明崎 (ortho)" },
    isuzuTorii: { ...onLand(345.0, -145.3), rotY: 1.15, note: "五十鈴神社 torii at the foot of the stair off the road at the north entrance of 神明崎 ([v4:polish3] was 340.5,-150 on footway r12723)" },
    isuzuShrine: { ...onLand(363, -126), rotY: Math.PI },
    shinmeizaki: { x: 352, z: -80, r: 45 },
    pier7: onLand(LM.pier7.enu[0], LM.pier7.enu[2]),
    ferryPiers: [{ x: 47.7, z: 10.5 }, { x: 67.9, z: 45.2 }],   // [v4:landmarks-A] the centres of the OSM pontoons (ways 819508304, 1464061063)
    fishMarket: { ...onLand(LM.market.enu[0], LM.market.enu[2]) },
    innerBay: { x: 156, z: -33, note: "内湾 water centre" },
    // [v3:fix] the longest 27xx centre-line near the landmark was a 570 m land viaduct (2 % over water): use the verified
    // over-water line (GSI RdCL 2703, 120 deg, matches the ortho) and the pylons of harbor's fit through its centre
    // [v4:landmarks-A] the main-span centre and the pylons measured on the construction-era ortho (kanae-ohashi.md), on the
    // OSM deck line (harbor/real.js KANAE): the old centre (1492, 1465.4) was 72 m NNE along the axis
    kanae: { a: [1624.5, 1237.2], b: [1447.7, 1541.6], towers: [[1366, 1682.9], [1546.9, 1371.6]], deckY: 36, length: 1344, center: { x: 1456.4, z: 1527.2 }, note: "a-b: GSI RdCL 2703 over-water line (120 deg); centre + pylons: the ortho measurements projected on the OSM / GSI deck line (harbor/real.js KANAE)" },
    oshima: { a: [2765.8, 2856.0], b: [2654.9, 3194.2], deckY: 34.8, length: 356, note: "OSM way 669276579 (108.2 deg)" },   // [v4:landmarks-A]
    anbaLookout: { x: LM.anba.enu[0], z: LM.anba.enu[2], y: Math.round(S.heightAt(LM.anba.enu[0], LM.anba.enu[2]) * 10) / 10 },
    promenade,
    vending: [landNear(S, 128, -165), landNear(S, 62, -80), landNear(S, 222, -172), landNear(S, 40, 96)],
    cats: [landNear(S, 150, -150, 3), landNear(S, 96, -118, 3), landNear(S, 300, -160, 3)],
  };
}
/** Nearest land point (shore distance <= -min m) to (x, z), searched on rings of 2 m. */
function landNear(S, x, z, min = 6) {
  for (let r = 0; r < 120; r += 2) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (S.shoreDist(px, pz) <= -min && S.heightAt(px, pz) > 0.8) return { x: r1(px), z: r1(pz), y: r2(S.heightAt(px, pz)) };
  }
  return { x, z, y: r2(S.heightAt(x, z)) };
}
function towersOf(pts, n) {
  const L = polylineLength(pts), out = [];
  for (let i = 1; i <= n; i++) { const { p } = alongPolyline(pts, L * (i / (n + 1))); out.push(P1(p)); }
  return out;
}

function tour(S, LM) {
  // re-framed drone views (look from the sea side toward the hills; the 16:30 sun rakes from the WSW)
  const frames = {
    // [v3:fix] walk spots re-authored by screenshot (same as life/tour.js FRAMES; qa3 checks them): the old market spot
    // stood inside a hall, Pier 7 faced 60 % empty asphalt, 安波山 an empty deck; the bridges had none
    bay: { pos: [400, 95, 90], look: [80, 10, -220], walk: { x: 168, z: -122, yaw: 111, pitch: 2 } },
    market: { pos: [980, 150, 1080], look: [560, 5, 700], walk: { x: 654.5, z: 836.1, yaw: -155, pitch: 2 } },   // [v3:fix] behind the unloading scene
    pier7: { pos: [240, 70, 230], look: [40, 6, 60], walk: { x: 5, z: 40, yaw: -130, pitch: 1 } },   // [v5:fix1] the garden head (was (51, 69) yaw -84, nose-to-glass)  [v3:polish2] down the quay at the moored row  [v3:polish3] pitch 1
    kanae: { pos: [1560, 110, 2050], look: [1457, 40, 1526], walk: { x: 1528, z: 1747, yaw: 14, pitch: 4 } },   // [v3:polish] at the water's edge  [v3:polish3] yaw 14 pitch 4
    oshima: { pos: [2300, 180, 2600], look: [2760, 30, 3060], walk: { x: 2776, z: 3244, yaw: 17, pitch: 2 } },   // [v3:polish3] 8 m uphill, off the bare slab (= life/tour.js FRAMES)
    anba: { pos: [-470, 290, -1040], look: [200, 0, 40], walk: { x: -490.6, z: -986.1, yaw: -128, pitch: -10 } },   // [v3:polish2] near the rail, looking down: the bar below the bay line
    karakuwa: { pos: [5200, 700, 5200], look: [7200, 60, 3300], walk: null },
  };
  return Object.values(LM).map((l) => {
    const f = frames[l.id] || { pos: l.cam.pos, look: l.cam.look, walk: null };
    return { id: l.id, ja: l.ja, en: l.en, enu: l.enu, drone: { pos: f.pos, look: f.look }, walk: f.walk };
  });
}

if (import.meta.main) {
  // --overrides <dir>: another override folder; --overrides none: no overrides (the "before" state of an accuracy sweep)
  const ai = process.argv.indexOf("--overrides"), ovArg = ai > 0 ? process.argv[ai + 1] : null;
  const L = await buildLayout(ovArg ? { overridesDir: ovArg === "none" ? null : ovArg } : {});
  const { log, ...out } = L;
  const near = out.lots.filter((l) => l.zone !== "far"), far = out.lots.filter((l) => l.zone === "far");
  const KIND = [...new Set(far.map((l) => l.kind))], SHAPE = [...new Set(far.map((l) => l.roof.shape))], RC = [...new Set(far.map((l) => l.roof.color))], WC = [...new Set(far.map((l) => l.wall))];
  out.lots = near;
  out.farLots = { kinds: KIND, shapes: SHAPE, roofColors: RC, walls: WC,
    fields: ["id", "cx", "cz", "w", "d", "rotY", "storeys", "height", "groundY", "kind", "shape", "roof", "wall", "area", "src", "ridge"],
    // [v4:data] src = index into srcs ("h/kind/roof/color" source key), ridge 0 none / 1 'x' / 2 'z'; names etc. in extra
    srcs: [], extra: {},
    rows: far.map((l) => [l.id, r1(l.obb.cx), r1(l.obb.cz), r1(l.obb.w), r1(l.obb.d), Math.round(l.obb.rotY * 100) / 100, l.storeys, l.height, r1(l.groundY), KIND.indexOf(l.kind), SHAPE.indexOf(l.roof.shape), RC.indexOf(l.roof.color), WC.indexOf(l.wall), l.area]) };
  const SRC = out.farLots.srcs, srcKey = (s) => [s.h, s.kind, s.roof, s.color].join("/");
  far.forEach((l, i) => {
    const k = srcKey(l.src); let j = SRC.indexOf(k); if (j < 0) { j = SRC.length; SRC.push(k); }
    out.farLots.rows[i].push(j, l.roof.ridge === "x" ? 1 : l.roof.ridge === "z" ? 2 : 0);
    const x = {}; for (const f of ["name", "nameEn", "use", "facility", "landmark", "facade"]) if (l[f] != null) x[f] = l[f];   // [v4:landmarks-A] landmark  [v4:overrides] facade
    if (l.src.name) x.nameSrc = l.src.name; if (l.src.wall) x.wallSrc = l.src.wall;
    if (l.src.ovr) { x.ovr = l.src.ovr; x.ovrWhy = l.src.ovrWhy; }   // [v4:overrides] provenance
    if (Object.keys(x).length) out.farLots.extra[l.id] = x;
  });
  for (const r of out.roads) if (r.zone === "far") r.pts = r.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
  const txt = JSON.stringify(out);
  await Bun.write(join(ROOT, "data/anime/layout.json"), txt);
  console.log(JSON.stringify({ ok: true, bytes: txt.length, ...log }));
}
