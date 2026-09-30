// [v4:data] Enrichment of the anime layout from real sources -> data/anime/enrich.json + data/anime/sources.json.
//   env -u NODE_OPTIONS bun run scripts/anime/enrich/fetch-osm.js      (once; cached in raw/osm)
//   env -u NODE_OPTIONS bun run scripts/anime/enrich/build-enrich.js   (this; ~2 min, run it through tools/anime/gate.sh run)
//   env -u NODE_OPTIONS bun run scripts/anime/build-layout.js          (folds enrich.json into layout.json)
// Inputs: raw/osm/overpass.json (OSM, ODbL), data/cache/anime/vt.json (GSI vector tiles: Anno names, WA water),
// data/buildings/city.json (GSI footprints), raw/tiles/seamlessphoto/{17,18} (GSI aerial photo).
// Per lot it records what each source says (OSM tags, the GSI facility name, the aerial roof analysis); build-layout.js
// decides the final values and records each value's source. Deterministic: the same inputs give the same file.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../terrain/tiles.js";
import { CACHE } from "../vt.js";
import { polyArea, simplify } from "../derive.js";
import { OSM_FILE, OSM_META } from "./fetch-osm.js";
import { parseOsm, parseLevels, parseHeight, parseColour, roofShapeOf, kindFromTags, LANDUSE_ORDER, ringArea, pointInRing } from "./osm.js";
import { parseAnno } from "./anno.js";
import { FootIndex, matchBuildings, assignPoints, biggestNear } from "./match.js";
import { TileRaster, analyzeRoof, roofClass } from "./aerial.js";
import { SOURCES } from "./sources.js";

export const ENRICH_FILE = join(ROOT, "data/anime/enrich.json");
export const AERIAL_CACHE = join(CACHE, "aerial.json");
const r1 = (v) => Math.round(v * 10) / 10;
const P1 = (p) => [r1(p[0]), r1(p[1])];
const BBOX = { x0: -6506, z0: -9325, x1: 10843, z1: 8437 };
const inCity = (p) => p[0] >= BBOX.x0 && p[0] <= BBOX.x1 && p[1] >= BBOX.z0 && p[1] <= BBOX.z1;

/** Aerial analysis of every footprint (cached: the photo and the footprints do not change between runs). */
export async function aerialAll(feats, { log = console.error, force = false } = {}) {
  if (!force && existsSync(AERIAL_CACHE)) {
    const c = await Bun.file(AERIAL_CACHE).json();
    if (c.n === feats.length) return c.res;
  }
  const z18 = new TileRaster(18, { cap: 400 }), z17 = new TileRaster(17, { cap: 400 });
  // walk the footprints in tile order so the LRU stays warm
  const order = feats.map((f, i) => i).sort((a, b) => {
    const ca = feats[a].c, cb = feats[b].c;
    return Math.floor(ca[1] / 300) - Math.floor(cb[1] / 300) || ca[0] - cb[0];
  });
  const res = new Array(feats.length).fill(null);
  const t0 = performance.now();
  let k = 0;
  for (const i of order) {
    const f = feats[i], b = f.bb;
    let S = z18;
    await z18.prepare(b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5);
    if (!z18.rgb(f.c[0], f.c[1]) || !z18.rgb(b[0] - 4, b[1] - 4) || !z18.rgb(b[2] + 4, b[3] + 4)) { S = z17; await z17.prepare(b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5); }
    if (!S.rgb(f.c[0], f.c[1])) continue;
    const a = analyzeRoof(f.poly, S);
    a.z = S.z;
    res[i] = a;
    if (++k % 5000 === 0) log(`aerial ${k}/${feats.length} ${Math.round((performance.now() - t0) / 1000)} s`);
  }
  mkdirSync(CACHE, { recursive: true });
  await Bun.write(AERIAL_CACHE, JSON.stringify({ n: feats.length, res }));
  return res;
}

export async function buildEnrich({ log = console.error, forceAerial = false } = {}) {
  const t0 = performance.now();
  if (!existsSync(OSM_FILE)) throw new Error("no OSM extract: run scripts/anime/enrich/fetch-osm.js first");
  const osmJson = await Bun.file(OSM_FILE).json();
  const osmMeta = existsSync(OSM_META) ? await Bun.file(OSM_META).json() : { osmBase: osmJson.osm3s?.timestamp_osm_base };
  const O = parseOsm(osmJson);
  log("osm", JSON.stringify(O.counts));
  const vt = await Bun.file(join(CACHE, "vt.json")).json();
  const A = parseAnno(vt.Anno);
  log("anno", A.places.length, A.facilities.length, A.symbols.length);
  const bld = await Bun.file(join(ROOT, "data/buildings/city.json")).json();
  const feats = bld.features.filter((b) => b.poly && b.poly.length >= 3).map((b) => {
    let x = 0, z = 0; for (const p of b.poly) { x += p[0]; z += p[1]; }
    return { id: b.id, code: b.code, poly: b.poly, area: Math.abs(polyArea(b.poly)), c: [x / b.poly.length, z / b.poly.length] };
  });
  const index = new FootIndex(feats);

  // ---------------------------------------------------------------- OSM buildings -> footprints
  const bm = matchBuildings(index, O.buildings.filter((b) => b.ring && !b.part));
  log("osm buildings matched", bm.size, Math.round(performance.now() - t0));
  // ---------------------------------------------------------------- OSM POIs (shops, amenities) -> footprints
  const namedPoi = O.pois.filter((p) => !p.area && !p.line && (p.cat === "amenity" || p.cat === "shop" || p.cat === "tourism" || p.cat === "office" || p.cat === "healthcare" || p.cat === "craft" || p.cat === "leisure" || p.cat === "historic") && inCity(p.p));
  const poiAt = assignPoints(index, namedPoi.filter((p) => !["parking", "bench", "waste_disposal", "waste_basket", "toilets", "vending_machine", "bicycle_parking", "drinking_water", "shelter", "fountain", "telephone", "atm", "post_box", "recycling", "parking_entrance", "memorial", "viewpoint", "information", "artwork", "picnic_site", "playground", "fitness_station"].includes(p.type)), 6);
  // ---------------------------------------------------------------- GSI facilities -> footprints
  const facAt = new Map();
  for (const f of A.facilities) {
    if (!inCity(f.p)) continue;
    // schools, hospitals, care homes: the symbol stands in the grounds -> the biggest building nearby; others: the building under the symbol
    const big = f.kind === "school" || f.cat === "hospital" || f.cat === "care_home" || f.cat === "city_hall" || f.cat === "museum" || f.cat === "station";
    let i = big ? biggestNear(index, f.p[0], f.p[1], f.cat === "station" ? 60 : 90) : index.at(f.p[0], f.p[1], 25);
    if (i < 0) i = index.at(f.p[0], f.p[1], 40);
    if (i < 0) continue;
    const l = facAt.get(i) || []; l.push(f); facAt.set(i, l);
    f.lot = feats[i].id;
  }
  // named OSM sites (school grounds, hospital, temple precinct): every footprint whose centre lies inside takes the site
  const siteAt = new Map();
  for (const st of O.sites) {
    const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of st.ring) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], z); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], z); }
    for (const i of index.query(b[0], b[1], b[2], b[3])) {
      const c = feats[i].c;
      if (!pointInRing(c[0], c[1], st.ring) || st.holes.some((h) => pointInRing(c[0], c[1], h))) continue;
      const prev = siteAt.get(i);
      if (!prev || ringArea(st.ring) < ringArea(prev.ring)) siteAt.set(i, st);   // the smallest site wins (a school inside a park)
    }
  }
  // shrine / temple symbols without a name still set the kind
  const symAt = assignPoints(index, A.symbols.filter((s) => s.kind && inCity(s.p)), 20);

  // ---------------------------------------------------------------- aerial roof analysis
  const aer = await aerialAll(feats, { log, force: forceAerial });
  log("aerial", aer.filter(Boolean).length, Math.round(performance.now() - t0));

  // ---------------------------------------------------------------- per-lot rows
  const FIELDS = ["id", "osm", "name", "nameEn", "use", "kind", "levels", "height", "roofShape", "roofColour", "wallColour", "gsiName", "gsiCat", "aShape", "aConf", "ridge", "rgb", "equip", "veg", "off", "z"];
  const rows = [];
  const cov = { lots: feats.length, osm: 0, levels: 0, height: 0, name: 0, gsiName: 0, poiName: 0, siteName: 0, osmRoof: 0, aerialRoof: 0, aerialRidge: 0, kindTag: 0, analysed: 0 };
  feats.forEach((f, i) => {
    const m = bm.get(i), t = m?.tags || {};
    const pois = (poiAt.get(i) || []).filter((p) => p.name);
    const fac = facAt.get(i) || [];
    const sym = symAt.get(i) || [];
    const a = aer[i];
    const levels = parseLevels(t["building:levels"]);
    const height = parseHeight(t.height);
    const rs = roofShapeOf(t["roof:shape"]);
    const rc = parseColour(t["roof:colour"]);
    const wc = parseColour(t["building:colour"]);
    // name: the OSM building's own name, else a named POI inside it, else the GSI facility. [v4:polish1] a station
    // building (building=train_station, railway / public_transport=station) or a GSI facility (気仙沼駅) is named for
    // itself, not for a kiosk or café matched inside it (NewDays)
    const poi = pois[0], site = siteAt.get(i);
    const facFirst = !t.name && fac[0]?.name && (t.building === "train_station" || t.railway === "station" || t.public_transport === "station" || poi);
    const name = t.name || (facFirst ? fac[0].name : null) || poi?.name || site?.name || null;
    const nameEn = t["name:en"] || (t.name ? null : poi?.["name:en"]) || (t.name || poi?.name ? null : site?.nameEn) || null;
    const st = site?.tags || {};
    const use = t.amenity || t.shop ? (t.shop ? "shop:" + t.shop : "amenity:" + t.amenity) : poi ? `${poi.cat}:${poi.type}` : t.tourism ? "tourism:" + t.tourism
      : st.amenity ? "amenity:" + st.amenity : st.tourism ? "tourism:" + st.tourism : null;
    // kind from the tags (building + the POI inside), else the site round it, else the GSI facility or symbol
    const kindTags = { ...t, ...(poi ? { [poi.cat]: poi.type, religion: poi.religion } : {}) };
    let kind = kindFromTags(kindTags) || (site ? kindFromTags({ ...st, building: undefined }) : null);
    if (!kind && fac[0]?.kind) kind = fac[0].kind;
    if (!kind && sym[0]?.kind) kind = sym[0].kind;
    if (kind === "house" && f.area > 400) kind = null;   // building=house on a big hall is an import artefact
    const ac = a ? roofClass(a, { code: f.code, area: f.area }) : null;
    const row = [f.id, m?.osm ?? null, name, nameEn, use, kind, levels, height, rs, rc, wc, fac[0]?.name ?? null, fac[0]?.cat ?? null,
      ac?.shape ?? null, ac ? ac.conf : null, a?.ridge ?? null, a?.rgb ?? null, a?.equip ?? null, a?.veg != null ? Math.round(a.veg * 10) / 10 : null, a && (a.off[0] || a.off[1]) ? a.off : null, a?.z ?? null];
    rows.push(row);
    if (m) cov.osm++; if (levels) cov.levels++; if (height) cov.height++; if (name || fac[0]) cov.name++; if (fac[0]) cov.gsiName++; if (poi) cov.poiName++; if (site) cov.siteName++;
    if (rs) cov.osmRoof++; if (ac) cov.aerialRoof++; if (ac && a.ridge != null && (ac.shape === "gable" || ac.shape === "hip" || ac.shape === "saw")) cov.aerialRidge++; if (kind) cov.kindTag++; if (a) cov.analysed++;
  });

  // ---------------------------------------------------------------- landuse, water, roads, points
  const landuse = O.landuse.filter((l) => l.cls !== "water" || l.water !== "river").filter((l) => inCity(l.ring[0]))
    .map((l) => ({ cls: l.cls, type: l.type, name: l.name, osm: l.osm, ring: simplify(l.ring, 0.8).map(P1), holes: l.holes.map((h) => simplify(h, 0.8).map(P1)).filter((h) => h.length >= 3), area: Math.round(ringArea(l.ring)) }))
    .filter((l) => l.ring.length >= 3 && l.area >= 30)
    .sort((a, b) => LANDUSE_ORDER.indexOf(a.cls) - LANDUSE_ORDER.indexOf(b.cls) || b.area - a.area || (a.osm < b.osm ? -1 : 1));
  const rivers = O.waterways.filter((w) => ["river", "stream", "canal", "drain", "ditch"].includes(w.kind) && w.pts.some(inCity))
    .map((w) => ({ osm: w.osm, kind: w.kind, name: w.name, nameEn: w.nameEn, pts: simplify(w.pts, 0.8).map(P1), width: w.width, tunnel: w.tunnel }));
  const riverAreas = O.waterAreas.map((w) => ({ osm: w.osm, name: w.name, ring: simplify(w.ring, 0.8).map(P1) }));
  const roads = O.roads.filter((r) => r.pts.some(inCity)).map((r) => {
    const o = { osm: r.osm, hw: r.hw, pts: simplify(r.pts, 0.5).map(P1) };
    for (const k of ["name", "nameEn", "ref", "lanes", "width", "oneway", "maxspeed", "bridge", "tunnel", "layer", "surface"]) if (r[k] != null) o[k] = r[k];
    return o;
  });
  const pois = O.pois.filter((p) => inCity(p.p) && (p.name || ["amenity", "shop", "tourism", "historic"].includes(p.cat))).map((p) => {
    const o = { osm: p.osm, cat: p.cat, type: p.type, p: p.p };
    for (const k of ["name", "name:en", "name:ja-Latn", "cuisine", "religion", "ele", "area"]) if (p[k] != null) o[k === "name:en" ? "nameEn" : k === "name:ja-Latn" ? "nameLatn" : k] = p[k];
    if (p.line) o.line = simplify(p.line, 0.8).map(P1);
    const i = index.at(p.p[0], p.p[1], 6); if (i >= 0 && !p.area) o.lot = feats[i].id;
    return o;
  });
  const hints = A.symbols.filter((s) => inCity(s.p) && [6301, 3221, 8105, 4104, 4105, 6341, 6342, 653, 8103, 3261, 4101].includes(s.code)).map((s) => ({ code: s.code, what: s.meaning, p: s.p }));

  const stats = {
    ...cov,
    share: {
      realHeight: +(cov.levels + cov.height > 0 ? rows.filter((r) => r[6] || r[7]).length / cov.lots : 0).toFixed(4),
      name: +(cov.name / cov.lots).toFixed(4),
      roofShape: +(rows.filter((r) => r[8] || r[13]).length / cov.lots).toFixed(4),
      osmMatched: +(cov.osm / cov.lots).toFixed(4),
    },
    landuse: count(landuse, "cls"), rivers: rivers.length, namedRivers: [...new Set(rivers.filter((r) => r.name).map((r) => r.name))],
    roads: roads.length, namedRoads: roads.filter((r) => r.name).length, pois: pois.length, places: A.places.length, facilities: A.facilities.length,
    signals: O.signals.length, crossings: O.crossings.length, trees: O.trees.length,
  };
  log("enrich ms", Math.round(performance.now() - t0));   // (not in the file: the output stays byte-identical between runs)
  return {
    version: 1, generated: "scripts/anime/enrich/build-enrich.js", osmBase: osmMeta.osmBase ?? null, attribution: "© OpenStreetMap contributors (ODbL); 出典：国土地理院（地理院タイル）を加工して作成",
    sources: SOURCES.map((s) => s.id),
    lots: { fields: FIELDS, rows },
    landuse, rivers, riverAreas, roads, pois,
    places: A.places.filter((p) => inCity(p.p)), facilities: A.facilities.filter((f) => inCity(f.p)), heights: A.heights.filter((h) => inCity(h.p)), hints,
    signals: O.signals.filter(inCity), crossings: O.crossings.filter((c) => inCity(c.p)), trees: O.trees.filter((t) => inCity(t.p)),
    rail: O.rail.filter((r) => r.pts.some(inCity)).map((r) => ({ ...r, pts: simplify(r.pts, 0.5).map(P1) })),
    bridges: O.bridges.filter((b) => b.pts.some(inCity) && b.name).map((b) => ({ osm: b.osm, name: b.name, kind: b.kind, pts: b.pts.map(P1) })),
    stats,
  };
}
function count(arr, k) { const o = {}; for (const a of arr) o[a[k]] = (o[a[k]] || 0) + 1; return o; }

if (import.meta.main) {
  const E = await buildEnrich({ forceAerial: process.argv.includes("--aerial") });
  const txt = JSON.stringify(E);
  await Bun.write(ENRICH_FILE, txt);
  await Bun.write(join(ROOT, "data/anime/sources.json"), JSON.stringify({ generated: "scripts/anime/enrich/sources.js", osmBase: E.osmBase, sources: SOURCES }, null, 1) + "\n");
  console.log(JSON.stringify({ ok: true, bytes: txt.length, stats: E.stats }, null, 1));
}
