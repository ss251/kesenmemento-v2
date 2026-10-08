// [v4:data] OpenStreetMap (Overpass JSON, `out geom`) -> ENU features for the anime layout. Pure functions, no I/O
// (tested in test/v4-data.test.js). Data © OpenStreetMap contributors, ODbL 1.0.
// Coordinates: metres, +X east, -Z north, ENU origin 38.9060 N 141.5750 E (same linear map as src/core/geo.js).
import { polyArea } from "../derive.js";

const LAT0 = 38.906, LON0 = 141.575, MX = 86744.0, MZ = 111014.0;
const r1 = (v) => Math.round(v * 10) / 10;
export const llXZ = (lat, lon) => [r1((lon - LON0) * MX), r1(-(lat - LAT0) * MZ)];
const geomXZ = (g) => g.map((p) => llXZ(p.lat, p.lon));

// ------------------------------------------------------------------ tag parsing
/** "3", "3;4", "2.5" -> number of storeys above ground (null if unusable). */
export function parseLevels(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).split(/[;,]/)[0]);
  return Number.isFinite(n) && n > 0 && n < 80 ? n : null;
}
/** OSM height ("12", "12 m", "12.5m", "40'", "40 ft") -> metres (null if unusable). */
export function parseHeight(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(m|meters?|metres?|'|ft|feet)?$/);
  if (!m) return null;
  let h = parseFloat(m[1]);
  if (m[2] && /'|ft|feet/.test(m[2])) h *= 0.3048;
  return h > 0 && h < 400 ? Math.round(h * 10) / 10 : null;
}
const CSS = {
  black: "#000000", white: "#ffffff", gray: "#808080", grey: "#808080", silver: "#c0c0c0", red: "#ff0000", maroon: "#800000",
  brown: "#a52a2a", orange: "#ffa500", yellow: "#ffff00", beige: "#f5f5dc", tan: "#d2b48c", green: "#008000", darkgreen: "#006400",
  lime: "#00ff00", olive: "#808000", blue: "#0000ff", navy: "#000080", darkblue: "#00008b", lightblue: "#add8e6", skyblue: "#87ceeb",
  teal: "#008080", cyan: "#00ffff", purple: "#800080", pink: "#ffc0cb", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3", dimgray: "#696969", darkred: "#8b0000", ivory: "#fffff0", cream: "#fffdd0", terracotta: "#e2725b", slategray: "#708090",
  slategrey: "#708090", steelblue: "#4682b4", cadetblue: "#5f9ea0", seagreen: "#2e8b57", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f",
};
/** OSM colour tag (CSS name, #rgb or #rrggbb) -> "#rrggbb" or null. */
export function parseColour(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().replace(/[\s_-]/g, "");
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return "#" + s.slice(1).split("").map((c) => c + c).join("");
  return CSS[s] ?? null;
}
/** OSM roof:shape -> the layout roof shapes (gable|hip|flat|shed|saw) or null. */
export function roofShapeOf(v) {
  switch (String(v || "").toLowerCase()) {
    case "gabled": case "gable": case "gambrel": case "saltbox": case "round": case "half-hipped": return "gable";
    case "hipped": case "hip": case "pyramidal": case "dome": case "onion": case "mansard": case "hipped-and-gabled": return "hip";
    case "flat": return "flat";
    case "skillion": case "lean_to": case "shed": return "shed";
    case "sawtooth": return "saw";
    default: return null;
  }
}
/** OSM building / amenity / shop tags -> a layout lot kind (null when OSM says nothing specific). */
export function kindFromTags(t) {
  const b = t.building, a = t.amenity, rel = t.religion;
  // [v6:c6r3] a multi-storey car park (building=parking, or amenity=parking + parking=multi-storey): an open stepped deck, not a closed warehouse box
  if (b === "parking" || (a === "parking" && t.parking === "multi-storey")) return "carpark";
  if (a === "place_of_worship" || b === "shrine" || b === "temple" || b === "church") {
    if (b === "shrine" || rel === "shinto") return "shrine";
    if (b === "temple" || rel === "buddhist") return "temple";
    return "temple";
  }
  if (b === "school" || b === "kindergarten" || b === "university" || b === "college" || a === "school" || a === "kindergarten" || a === "college" || a === "university") return "school";
  if (b === "hospital" || a === "hospital" || a === "clinic" || b === "civic" || b === "public" || b === "government" || b === "fire_station" || b === "train_station" || b === "transportation"
    || ["townhall", "police", "fire_station", "post_office", "library", "community_centre", "courthouse", "arts_centre", "theatre", "social_facility", "bus_station", "ferry_terminal"].includes(a)
    || t.office === "government" || t.tourism === "museum") return "public";
  if (t.shop || b === "retail" || b === "commercial" || b === "supermarket" || b === "kiosk" || ["restaurant", "cafe", "bar", "pub", "fast_food", "bank", "pharmacy", "fuel", "izakaya"].includes(a) || t.tourism === "hotel" || t.tourism === "guest_house") return "shop";
  if (b === "apartments" || b === "dormitory") return "apartment";
  if (b === "office" || t.office) return "office";
  if (b === "industrial" || b === "factory" || t.man_made === "works") return "factory";
  if (b === "warehouse" || b === "storage_tank" || b === "hangar" || b === "farm_auxiliary" || b === "barn" || b === "shed" || b === "greenhouse" || b === "garage" || b === "garages" || b === "roof" || b === "hut" || b === "stable") return "warehouse";
  if (b === "house" || b === "detached" || b === "residential" || b === "semidetached_house" || b === "terrace") return "house";
  return null;
}
/** Landuse class used by the layout (null = not a land-use area we draw). */
export function landuseClass(t) {
  const lu = t.landuse, le = t.leisure, n = t.natural, a = t.amenity;
  if (a === "parking" || lu === "garages") return "parking";
  if (a === "school" || a === "kindergarten" || a === "college" || a === "university") return "school";
  if (lu === "cemetery" || a === "grave_yard") return "cemetery";
  if (le === "pitch" || le === "track" || le === "sports_centre" || le === "stadium" || le === "golf_course") return "sport";
  if (le === "park" || le === "garden" || le === "playground" || le === "recreation_ground" || lu === "recreation_ground" || lu === "village_green") return "park";
  if (lu === "farmland" || lu === "meadow" || lu === "orchard" || lu === "vineyard" || lu === "greenhouse_horticulture" || lu === "plant_nursery" || lu === "allotments" || lu === "farmyard") return "field";
  if (lu === "forest" || n === "wood") return "forest";
  if (lu === "grass" || n === "grassland" || lu === "greenfield") return "grass";
  if (n === "scrub" || n === "heath") return "scrub";
  if (n === "beach" || n === "sand") return "beach";
  if (n === "bare_rock" || n === "cliff") return "rock";
  if (lu === "religious" || (a === "place_of_worship")) return "religious";
  if (lu === "industrial" || lu === "port") return "industrial";
  if (lu === "commercial" || lu === "retail") return "commercial";
  if (lu === "construction" || lu === "brownfield") return "construction";
  if (lu === "aquaculture") return "aquaculture";
  if (n === "water" || lu === "reservoir" || lu === "basin") return "water";
  return null;
}
/** Draw order: later classes paint over earlier ones. */
export const LANDUSE_ORDER = ["forest", "scrub", "grass", "field", "rock", "beach", "industrial", "commercial", "construction", "aquaculture", "religious", "cemetery", "park", "sport", "school", "parking", "water"];

// ------------------------------------------------------------------ geometry
/** Join open way geometries (arrays of [x,z]) end to end into closed rings. Unclosable pieces are dropped. */
export function assembleRings(lines) {
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const rings = [], open = [];
  for (const l of lines) { if (l.length < 2) continue; if (l.length >= 4 && eq(l[0], l[l.length - 1])) rings.push(l.slice(0, -1)); else open.push(l.slice()); }
  while (open.length) {
    let cur = open.shift(), grown = true;
    while (!eq(cur[0], cur[cur.length - 1]) && grown) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i], end = cur[cur.length - 1];
        if (eq(o[0], end)) cur = cur.concat(o.slice(1));
        else if (eq(o[o.length - 1], end)) cur = cur.concat(o.slice(0, -1).reverse());
        else if (eq(o[o.length - 1], cur[0])) cur = o.concat(cur.slice(1));
        else if (eq(o[0], cur[0])) cur = o.slice().reverse().concat(cur.slice(1));
        else continue;
        open.splice(i, 1); grown = true; break;
      }
    }
    if (cur.length >= 4 && eq(cur[0], cur[cur.length - 1])) rings.push(cur.slice(0, -1));
  }
  return rings;
}
/** Point in ring (even-odd). */
export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Assign inner rings to the outer ring that contains them -> [{ outer, holes }]. */
function nestRings(outers, inners) {
  const polys = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of inners) { const p = polys.find((pg) => pointInRing(h[0][0], h[0][1], pg.outer)); if (p) p.holes.push(h); }
  return polys;
}
function areaPolys(e) {
  if (e.type === "way") {
    if (!e.geometry || e.geometry.length < 4) return [];
    const g = geomXZ(e.geometry);
    const closed = g.length >= 4 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1];
    return closed ? [{ outer: g.slice(0, -1), holes: [] }] : [];
  }
  if (e.type === "relation" && (e.tags?.type === "multipolygon" || e.tags?.type === "building")) {
    const ways = (e.members || []).filter((m) => m.type === "way" && m.geometry);
    const outer = assembleRings(ways.filter((m) => m.role !== "inner").map((m) => geomXZ(m.geometry.filter(Boolean))));
    const inner = assembleRings(ways.filter((m) => m.role === "inner").map((m) => geomXZ(m.geometry.filter(Boolean))));
    return nestRings(outer, inner);
  }
  return [];
}

// ------------------------------------------------------------------ the parser
const NAME_KEYS = ["name", "name:en", "name:ja-Latn", "name:ja_rm", "name:ja-Hira", "official_name", "alt_name", "brand", "operator"];
function names(t) { const o = {}; for (const k of NAME_KEYS) if (t[k]) o[k] = t[k]; return o; }
const POI_KEYS = ["amenity", "shop", "tourism", "leisure", "historic", "office", "craft", "healthcare", "man_made", "public_transport", "railway", "highway", "natural", "place", "emergency"];
const POI_SKIP_HIGHWAY = new Set(["crossing", "traffic_signals", "street_lamp", "stop", "give_way", "turning_circle", "motorway_junction", "milestone", "speed_camera"]);
/** Area amenities whose buildings take the site's name and use. */
const SITE_AMENITY = new Set(["school", "kindergarten", "college", "university", "hospital", "clinic", "place_of_worship", "townhall", "community_centre", "library", "police", "fire_station", "post_office", "marketplace", "ferry_terminal", "bus_station", "courthouse", "social_facility", "arts_centre", "theatre"]);
/** Road classes worth drawing (paths and tracks too: they are the walk network in the hills). */
// [r3:18] "busway": between the 2026-05-06 and 2026-10-04 OSM extracts the mappers re-tagged the 気仙沼線BRT ways from highway=service + service=bus_rapid_transit to highway=busway (79 ways: 79 -> 13 BRT ways and 14 -> 2 BRT stops until it was a road kind here)
const ROAD_HW = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "busway", "living_street", "pedestrian", "footway", "path", "steps", "cycleway", "track", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]);

/**
 * Overpass JSON -> { buildings, pois, landuse, waterways, waterAreas, roads, rail, nodes: { signals, crossings, trees, lamps } }.
 */
/**
 * [r3:13] OSM place_of_worship polygons that map a whole HILL as the shrine precinct, keyed by OSM id. 北野神社 (w761768594, 17,127 m2, x -1009..-854, z -474..-182, 福美町) outlines the 155 x 290 m hillside: the app
 * raked it as cream gravel, grew 3D trees in it, hung the name 北野神社 and kind 'shrine' on six house lots, and Earth 2026-03-11 shows a closed wooded ravine with houses along its east edge. Only the compound
 * round the hall is a precinct. `ring` is the compound's real extent (the OSM shrine buildings w775151444..447 span x -998..-934, z -236..-192; the hall is at (-959, -232)); it replaces the polygon
 * (landuse and site); `keepOsm` / `near` / `at` are what build-enrich.js lets take the site's name and kind: a footprint that carries one of those OSM building ids or lies within `near` m of an anchor.
 * The other large religious rings (八幡神社 6,740 m2, 光明寺 9,247 m2) are plausible precincts nothing here checks against Earth: left as mapped.
 */
export const PRECINCT_FIX = {
  w761768594: { ring: [[-992, -252], [-930, -252], [-930, -188], [-992, -188]], keepOsm: ["w775151444", "w775151445", "w775151446", "w775151447"], at: [[-959, -232]], near: 30,
    why: "OSM maps the whole 福美町 hillside (17,127 m2) as the 北野神社 precinct; Earth 2026-03-11 shows a closed wooded ravine, only the compound round the hall is the precinct" },
};
export function parseOsm(json) {
  const out = { buildings: [], sites: [], pois: [], landuse: [], waterways: [], waterAreas: [], roads: [], rail: [], bridges: [], signals: [], crossings: [], trees: [], busStops: [], busWays: [], brtWays: [], counts: {} };
  // [sys:17] bus stops (highway=bus_stop / public_transport=platform nodes), the stop_positions on BRT ways, and the ways a bus route uses
  const stopPositions = [], busWayIds = new Set(), wayPts = new Map();
  for (const e of json.elements || []) {
    const t = e.tags || {};
    const osm = e.type[0] + e.id;
    if (e.type === "node") {
      const p = llXZ(e.lat, e.lon);
      if (t.highway === "traffic_signals" || t.crossing === "traffic_signals") out.signals.push(p);
      if (t.highway === "crossing" || t.railway === "level_crossing") out.crossings.push({ p, kind: t.crossing || (t.railway ? "rail" : "unmarked"), signals: t.crossing === "traffic_signals" || undefined });
      if (t.natural === "tree") out.trees.push({ p, species: t["species:ja"] || t.species || t.genus || undefined });
      if (t.highway === "bus_stop" || (t.public_transport === "platform" && (t.bus === "yes" || t.highway === "bus_stop"))) {
        out.busStops.push({ osm, p, kind: "bus", name: t.name, nameEn: t["name:en"], operator: t.operator, network: t.network, ref: t.ref, shelter: t.shelter, covered: t.covered, bench: t.bench, bin: t.bin });
      } else if (t.public_transport === "stop_position") stopPositions.push({ osm, p, name: t.name, nameEn: t["name:en"], operator: t.operator, bus: t.bus });
      if (t.building) out.buildings.push({ osm, node: true, p, tags: pickBuildingTags(t) });
      const k = POI_KEYS.find((key) => t[key] && !(key === "highway" && (POI_SKIP_HIGHWAY.has(t.highway) || !t.name)) && !(key === "natural" && t.natural === "tree"));
      if (k && (t.name || ["amenity", "shop", "tourism", "historic", "office"].includes(k))) out.pois.push({ osm, p, cat: k, type: t[k], ...names(t), cuisine: t.cuisine, religion: t.religion, ele: t.ele ? parseFloat(t.ele) : undefined });
      continue;
    }
    // ways and relations
    if (e.type === "relation" && t.route === "bus") { for (const m of e.members || []) if (m.type === "way") busWayIds.add(m.ref); continue; }
    if (t.building || t["building:part"]) {
      for (const pg of areaPolys(e)) out.buildings.push({ osm, ring: pg.outer, holes: pg.holes, part: !t.building || undefined, tags: pickBuildingTags(t) });
      continue;
    }
    // a named site (school grounds, hospital, temple precinct, works): the buildings inside it belong to it
    if (t.name && (SITE_AMENITY.has(t.amenity) || t.tourism === "museum" || t.tourism === "hotel" || t.landuse === "religious" || t.man_made === "works" || t.office === "government")) {
      for (const pg of areaPolys(e)) out.sites.push({ osm, ring: PRECINCT_FIX[osm]?.ring ?? pg.outer, holes: PRECINCT_FIX[osm] ? [] : pg.holes, name: t.name, nameEn: t["name:en"], tags: pickBuildingTags(t) });   // [r3:13] a hill-sized precinct is clipped to its compound
    }
    const lu = landuseClass(t);
    if (lu) {
      const polys = areaPolys(e);
      if (polys.length) {
        for (const pg of polys) out.landuse.push({ osm, cls: lu, ring: PRECINCT_FIX[osm]?.ring ?? pg.outer, holes: PRECINCT_FIX[osm] ? [] : pg.holes, name: t.name, type: t.landuse || t.leisure || t.natural || t.amenity, water: t.water });
        if (lu === "water" && (t.water === "river" || t.waterway === "riverbank")) for (const pg of polys) out.waterAreas.push({ osm, ring: pg.outer, holes: pg.holes, name: t.name });
        // an area amenity with a name is also a place (parks, schools, parking lots)
        if (t.name && (t.amenity || t.leisure || t.tourism)) out.pois.push({ osm, p: centroidOf(polys[0].outer), cat: t.amenity ? "amenity" : t.leisure ? "leisure" : "tourism", type: t.amenity || t.leisure || t.tourism, area: true, ...names(t) });
        continue;
      }
    }
    if (e.type !== "way" || !e.geometry) {
      // non-building area POIs (e.g. a named amenity multipolygon) were handled above; skip other relations
      continue;
    }
    const pts = geomXZ(e.geometry);
    if (t.waterway) { out.waterways.push({ osm, kind: t.waterway, name: t.name, nameEn: t["name:en"], pts, width: parseHeight(t.width) ?? undefined, tunnel: t.tunnel || undefined }); continue; }
    if (t.railway && ["rail", "abandoned", "disused", "narrow_gauge", "platform"].includes(t.railway)) { out.rail.push({ osm, kind: t.railway, name: t.name, pts, bridge: t.bridge ? true : undefined, tunnel: t.tunnel ? true : undefined }); continue; }
    if (t.highway && ROAD_HW.has(t.highway)) {
      const r = { osm, hw: t.highway, pts, name: t.name, nameEn: t["name:en"], ref: t.ref, lanes: t.lanes ? parseInt(t.lanes, 10) || undefined : undefined, width: parseHeight(t.width) ?? undefined,
        oneway: t.oneway === "yes" || t.oneway === "1" || t.oneway === "-1" ? (t.oneway === "-1" ? -1 : 1) : undefined, maxspeed: t.maxspeed ? parseInt(t.maxspeed, 10) || undefined : undefined,
        bridge: t.bridge && t.bridge !== "no" ? (t["bridge:name"] || t.bridge) : undefined, tunnel: t.tunnel && t.tunnel !== "no" ? true : undefined, layer: t.layer ? parseInt(t.layer, 10) || undefined : undefined, surface: t.surface, sidewalk: t.sidewalk };
      out.roads.push(r);
      wayPts.set(e.id, { pts, hw: t.highway, service: t.service, oneway: r.oneway, tunnel: r.tunnel, name: t.name });
      if (t.service === "bus_rapid_transit" || t.highway === "busway") out.brtWays.push({ osm, pts, oneway: r.oneway, name: t.name });
      if (r.bridge) out.bridges.push({ osm, name: t["bridge:name"] || t.name, kind: t.bridge, pts });
      continue;
    }
    if (t.man_made === "bridge" || (t.bridge && t.bridge !== "no")) { out.bridges.push({ osm, name: t.name, kind: t.bridge || "area", pts }); continue; }
    if ((t.man_made === "pier" || t.man_made === "breakwater" || t.man_made === "embankment" || t.man_made === "dyke") && pts.length >= 2) { out.pois.push({ osm, p: pts[pts.length >> 1], cat: "man_made", type: t.man_made, line: pts, ...names(t) }); continue; }
  }
  // [sys:17] a stop_position that sits on a BRT way is a BRT stop (with that way's direction of travel); bus-route ways
  for (const id of busWayIds) { const w = wayPts.get(id); if (w && w.hw && !w.tunnel) out.busWays.push({ osm: "w" + id, pts: w.pts, hw: w.hw, oneway: w.oneway }); }
  const nearWay = (p, list) => { let best = null; for (const w of list) for (let i = 1; i < w.pts.length; i++) { const a = w.pts[i - 1], b = w.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)), d = Math.hypot(p[0] - a[0] - dx * tt, p[1] - a[1] - dz * tt); if (d < 3 && (!best || d < best.d)) best = { d, w, t: [dx / Math.sqrt(l2), dz / Math.sqrt(l2)] }; } return best; };
  for (const sp of stopPositions) { const b = nearWay(sp.p, out.brtWays); if (b) out.busStops.push({ osm: sp.osm, p: sp.p, kind: "brt", name: sp.name, nameEn: sp.nameEn, operator: sp.operator || "東日本旅客鉄道", way: b.w.osm, dir: [Math.round(b.t[0] * 1000) / 1000, Math.round(b.t[1] * 1000) / 1000] }); }
  out.counts = Object.fromEntries(Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  return out;
}
function pickBuildingTags(t) {
  const o = {};
  for (const k of ["building", "building:levels", "building:levels:underground", "roof:levels", "height", "min_height", "roof:shape", "roof:colour", "roof:material", "building:colour", "building:material", "amenity", "parking", "shop", "tourism", "office", "religion", "denomination", "man_made", "start_date", "name", "name:en", "name:ja-Latn", "operator", "brand", "cuisine"]) if (t[k] != null) o[k] = t[k];
  return o;
}
export function centroidOf(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cz += (p[1] + q[1]) * c; }
  if (Math.abs(a) < 1e-9) return ring[0];
  return [r1(cx / (3 * a)), r1(cz / (3 * a))];
}
export const ringArea = (r) => Math.abs(polyArea(r));
