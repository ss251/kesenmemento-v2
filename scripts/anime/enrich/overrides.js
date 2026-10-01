// [v4:overrides] Per-cell reference overrides, folded into the layout by scripts/anime/build-layout.js (and into the
// far-core streets by scripts/anime/build-explore.js). Schema and workflow: docs/anime/OVERRIDES.md.
//
// Every data/anime/overrides/*.json is applied, in file-name order (plain code-unit order, not locale), and within a
// file in array order, so the same files always give the same layout. A later operation on the same lot or road wins
// field by field; every operation that touches a lot is recorded in lot.src.ovr ("<file>#<section>/<index>") and the
// operation's own `src` (what the value was read from) in lot.src.ovrWhy, so a value can always be traced to its source.
// Precedence: derived < OSM / aerial / GSI facility (fold.js) < LOT_FIX (world/lotfix.js) < overrides (newest imagery).
//
// Pure except loadOverrides (it reads the folder). Tested in test/v4-overrides.test.js.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { polyArea, alongPolyline, polylineLength } from "../derive.js";

export const OVERRIDE_VERSION = 1;
export const LOT_KINDS = ["house", "apartment", "shop", "office", "hotel", "public", "school", "warehouse", "factory", "temple", "shrine"];
export const ROOF_SHAPES = ["flat", "gable", "hip", "shed", "saw"];
/** facade styles understood by the mid / far builders (src/anime/world/town/facade.js STYLE) */
export const FACADES = ["house", "apartment", "office", "shop", "warehouse", "plain", "public"];
export const ROAD_KINDS = ["national", "prefectural", "city", "alley", "bridge"];
/** landuse use -> the layout class drawn by town/landuse.js (LOOK) and the map (explore/basemap.js) */
export const LANDUSE_USES = { parking: "parking", vacant: "gravel", park: "park", plaza: "plaza", apron: "apron", forest: "forest", cedar: "cedar", felled: "felled" };   // [v5] apron: plain asphalt (a quay or yard), no stall lines or cars; [v5:fix2] forest / cedar: mixed or 杉 woods (land cover + trees), felled: a clear-cut strip (bare brown, no trees)
/** [v5:fix2] uses drawn as land cover (scripts/anime/build-landcover.js) and trees, not as a draped town surface */
export const COVER_USES = ["forest", "cedar", "felled"];
export const VACANT_SURFACES = ["gravel", "weeds"];
export const PROP_TYPES = ["vending", "bike", "tree", "bench", "bollard"];
/** how far (m) a coordinate may lie outside its cell's bbox */
export const BBOX_PAD = 30;

const HEX = /^#[0-9a-f]{6}$/i;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ loading + validation
/** The override files of a folder, sorted by name (code-unit order). */
export function listOverrideFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
/** Read and validate every override file of a folder. -> [{ file, ...validated document }] */
export function loadOverrides(dir) {
  return listOverrideFiles(dir).map((f) => {
    let doc;
    try { doc = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { throw new Error(`overrides/${f}: not valid JSON (${e.message})`); }
    return validateOverride(doc, f);
  });
}

class OvError extends Error {}
/** Validate one override document (throws with every problem listed). -> a normalised copy with `file`. */
export function validateOverride(doc, file = "inline.json") {
  const errs = [];
  const E = (path, msg) => errs.push(`${file} ${path}: ${msg}`);
  const allowed = (o, path, keys) => { for (const k of Object.keys(o)) if (!keys.includes(k)) E(path, `unknown field "${k}" (allowed: ${keys.join(", ")})`); };
  const num = (v, path, lo, hi) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) E(path, `must be a number in [${lo}, ${hi}]`); };
  const str = (v, path, max = 120) => { if (typeof v !== "string" || !v.trim() || v.length > max) E(path, `must be a non-empty string (<= ${max} chars)`); };
  const oneOf = (v, path, list) => { if (!list.includes(v)) E(path, `must be one of ${list.join(", ")}`); };
  const pt = (p, path) => { if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && Number.isFinite(v))) { E(path, "must be [x, z] in ENU metres"); return false; } return true; };
  const bb = Array.isArray(doc?.bbox) && doc.bbox.length === 4 && doc.bbox.every(Number.isFinite) ? doc.bbox : null;
  const inCell = (p, path) => { if (bb && pt(p, path) && (p[0] < bb[0] - BBOX_PAD || p[0] > bb[2] + BBOX_PAD || p[1] < bb[1] - BBOX_PAD || p[1] > bb[3] + BBOX_PAD)) E(path, `(${p}) lies outside the cell bbox [${bb}] + ${BBOX_PAD} m (ENU: x east, z SOUTH)`); };
  const ring = (r, path, min = 3) => {
    if (!Array.isArray(r) || r.length < min) { E(path, `must be a list of at least ${min} [x, z] points`); return; }
    r.forEach((p, i) => inCell(p, `${path}[${i}]`));
    if (min >= 3 && r.every((p) => pt(p, path)) && Math.abs(polyArea(r)) < 1) E(path, "has no area");
  };
  const roof = (o, path) => {
    if (typeof o !== "object" || !o || Array.isArray(o)) { E(path, "must be an object { shape, color, ridge }"); return; }
    allowed(o, path, ["shape", "color", "ridge"]);
    if (o.shape != null) oneOf(o.shape, path + ".shape", ROOF_SHAPES);
    if (o.color != null && !HEX.test(o.color)) E(path + ".color", "must be #rrggbb");
    if (o.ridge != null && o.ridge !== "x" && o.ridge !== "z") E(path + ".ridge", 'must be "x" (along the frontage) or "z" (front to back)');
  };
  const lotFields = (o, path) => {
    if (o.kind != null) oneOf(o.kind, path + ".kind", LOT_KINDS);
    if (o.storeys != null) { num(o.storeys, path + ".storeys", 1, 60); if (!Number.isInteger(o.storeys)) E(path + ".storeys", "must be an integer"); }
    if (o.height != null) num(o.height, path + ".height", 1.5, 250);
    if (o.roof != null) roof(o.roof, path + ".roof");
    if (o.wall != null && !HEX.test(o.wall)) E(path + ".wall", "must be #rrggbb");
    if (o.name != null) str(o.name, path + ".name");
    if (o.nameEn != null) str(o.nameEn, path + ".nameEn");
    if (o.facade != null) oneOf(o.facade, path + ".facade", FACADES);
  };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new OvError(`${file}: the document must be a JSON object`);
  allowed(doc, "", ["version", "cell", "bbox", "note", "sources", "lots", "newLots", "landuse", "roads", "props"]);
  if (doc.version !== OVERRIDE_VERSION) E(".version", `must be ${OVERRIDE_VERSION}`);
  if (typeof doc.cell !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(doc.cell)) E(".cell", "must be a lower-case id (a-z, 0-9, -)");
  if (!bb) E(".bbox", "must be [x0, z0, x1, z1] in ENU metres");
  else if (bb[0] >= bb[2] || bb[1] >= bb[3]) E(".bbox", "must have x0 < x1 and z0 < z1");
  if (!Array.isArray(doc.sources) || !doc.sources.length) E(".sources", "must list at least one source");
  const SRC = new Set();
  (doc.sources || []).forEach((s, i) => {
    const p = `.sources[${i}]`;
    if (!s || typeof s !== "object") { E(p, "must be { id, what, date?, ref? }"); return; }
    allowed(s, p, ["id", "what", "date", "ref"]);
    str(s.id, p + ".id", 40); str(s.what, p + ".what", 300);
    if (s.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) E(p + ".date", "must be YYYY-MM-DD");
    if (SRC.has(s.id)) E(p + ".id", "is repeated"); SRC.add(s.id);
  });
  const cite = (o, path) => { if (typeof o.src !== "string" || !o.src.trim()) E(path + ".src", "is required: name the source id and what was read"); else if (!SRC.has(o.src.split(/[:\s]/)[0])) E(path + ".src", `must start with a source id of .sources (${[...SRC].join(", ")})`); };
  const list = (k) => { if (doc[k] == null) return []; if (!Array.isArray(doc[k])) { E("." + k, "must be a list"); return []; } return doc[k]; };

  const lotIds = new Set();
  list("lots").forEach((o, i) => {
    const p = `.lots[${i}]`;
    if (!o || typeof o !== "object") { E(p, "must be an object"); return; }
    allowed(o, p, ["id", "remove", "kind", "storeys", "height", "roof", "wall", "name", "nameEn", "facade", "src"]);
    str(o.id, p + ".id", 60); cite(o, p);
    if (o.remove != null && o.remove !== true) E(p + ".remove", "must be true when present");
    if (o.remove && Object.keys(o).some((k) => !["id", "remove", "src"].includes(k))) E(p, "a remove takes only id and src");
    if (!o.remove && !Object.keys(o).some((k) => !["id", "src"].includes(k))) E(p, "changes nothing");
    lotFields(o, p);
    if (lotIds.has(o.id)) E(p + ".id", "is patched twice in this file (merge the entries)"); lotIds.add(o.id);
  });
  const newIds = new Set();
  list("newLots").forEach((o, i) => {
    const p = `.newLots[${i}]`;
    if (!o || typeof o !== "object") { E(p, "must be an object"); return; }
    allowed(o, p, ["id", "poly", "kind", "storeys", "height", "roof", "wall", "name", "nameEn", "facade", "src"]);
    if (typeof o.id !== "string" || !/^ovr:[a-z0-9-]+:[\w-]+$/.test(o.id)) E(p + ".id", 'must be "ovr:<cell>:<name>"');
    else if (!o.id.startsWith(`ovr:${doc.cell}:`)) E(p + ".id", `must start with "ovr:${doc.cell}:"`);
    if (newIds.has(o.id)) E(p + ".id", "is repeated"); newIds.add(o.id);
    cite(o, p); ring(o.poly, p + ".poly");
    if (o.kind == null) E(p + ".kind", "is required");
    if (o.height == null && o.storeys == null) E(p, "needs height or storeys");
    lotFields(o, p);
  });
  list("landuse").forEach((o, i) => {
    const p = `.landuse[${i}]`;
    if (!o || typeof o !== "object") { E(p, "must be an object"); return; }
    allowed(o, p, ["use", "ring", "holes", "name", "surface", "replace", "fill", "src"]);
    oneOf(o.use, p + ".use", Object.keys(LANDUSE_USES)); cite(o, p); ring(o.ring, p + ".ring");
    if (o.holes != null) { if (!Array.isArray(o.holes)) E(p + ".holes", "must be a list of rings"); else o.holes.forEach((h, j) => ring(h, `${p}.holes[${j}]`)); }
    if (o.name != null) str(o.name, p + ".name");
    if (o.surface != null) { if (o.use !== "vacant") E(p + ".surface", "only for use vacant"); else oneOf(o.surface, p + ".surface", VACANT_SURFACES); }
    if (o.replace != null && typeof o.replace !== "boolean") E(p + ".replace", "must be true or false");
    // [v5:fix2] the share of a car park's stalls that hold a car, counted on the newest imagery (default 0.2)
    if (o.fill != null) { if (o.use !== "parking") E(p + ".fill", "only for use parking"); else if (typeof o.fill !== "number" || !(o.fill >= 0 && o.fill <= 1)) E(p + ".fill", "must be a number from 0 to 1"); }
  });
  const roadIds = new Set();
  list("roads").forEach((o, i) => {
    const p = `.roads[${i}]`;
    if (!o || typeof o !== "object") { E(p, "must be an object"); return; }
    allowed(o, p, ["id", "remove", "pts", "width", "carriage", "kind", "name", "nameEn", "src"]);
    cite(o, p);
    const add = typeof o.id === "string" && o.id.startsWith("ovr:");
    if (typeof o.id !== "string" || !(add ? /^ovr:[a-z0-9-]+:[\w-]+$/.test(o.id) : /^r\d+$/.test(o.id))) E(p + ".id", 'must be a layout road id ("r123") or a new "ovr:<cell>:<name>"');
    else if (add && !o.id.startsWith(`ovr:${doc.cell}:`)) E(p + ".id", `must start with "ovr:${doc.cell}:"`);
    if (roadIds.has(o.id)) E(p + ".id", "is repeated"); roadIds.add(o.id);
    if (o.remove != null && o.remove !== true) E(p + ".remove", "must be true when present");
    if (o.remove && (add || Object.keys(o).some((k) => !["id", "remove", "src"].includes(k)))) E(p, "a remove takes only an existing id and src");
    if (o.pts != null) ring(o.pts, p + ".pts", 2);
    if (o.width != null) num(o.width, p + ".width", 1, 60);
    if (o.carriage != null) num(o.carriage, p + ".carriage", 2, 40);
    if (o.width != null && o.carriage != null && o.carriage > o.width) E(p + ".carriage", "must not exceed width");
    if (o.kind != null) oneOf(o.kind, p + ".kind", ROAD_KINDS);
    if (o.name != null) str(o.name, p + ".name");
    if (o.nameEn != null) str(o.nameEn, p + ".nameEn");
    if (add && (o.pts == null || o.width == null || o.kind == null)) E(p, "a new road needs pts, width and kind");
    if (!o.remove && !Object.keys(o).some((k) => !["id", "src"].includes(k))) E(p, "changes nothing");
  });
  list("props").forEach((o, i) => {
    const p = `.props[${i}]`;
    if (!o || typeof o !== "object") { E(p, "must be an object"); return; }
    allowed(o, p, ["type", "at", "face", "y", "src"]);
    oneOf(o.type, p + ".type", PROP_TYPES); cite(o, p); inCell(o.at, p + ".at");
    if (o.face != null) num(o.face, p + ".face", -360, 360);
    if (o.y != null) num(o.y, p + ".y", -5, 300);
  });
  if (errs.length) throw new OvError(`invalid override file:\n  ${errs.join("\n  ")}`);
  return { file, ...doc };
}

// ------------------------------------------------------------------ compile (all files -> one ordered plan)
/**
 * -> { files, lotPatch: Map(id -> [op]), newLots: [op], landuse: [op], roadPatch: Map(id -> [op]), newRoads: [op], props: [op], meta }
 * Each op carries `ref` ("<file>#<section>/<index>") and `why` (its src). A new lot or road id used twice is an error.
 */
export function compileOverrides(docs) {
  const C = { files: docs.map((d) => d.file), lotPatch: new Map(), newLots: [], landuse: [], roadPatch: new Map(), newRoads: [], props: [], meta: [] };
  const seen = new Set();
  const push = (m, id, op) => { let l = m.get(id); if (!l) m.set(id, (l = [])); l.push(op); };
  for (const d of docs) {
    const tag = (sec, i, o) => ({ ...o, ref: `${d.file}#${sec}/${i}`, why: o.src, cell: d.cell, bbox: d.bbox });
    (d.lots || []).forEach((o, i) => push(C.lotPatch, o.id, tag("lots", i, o)));
    (d.newLots || []).forEach((o, i) => { if (seen.has(o.id)) throw new Error(`${d.file}: new lot ${o.id} is defined twice`); seen.add(o.id); C.newLots.push(tag("newLots", i, o)); });
    (d.landuse || []).forEach((o, i) => C.landuse.push(tag("landuse", i, o)));
    (d.roads || []).forEach((o, i) => {
      if (o.id.startsWith("ovr:")) { if (seen.has(o.id)) throw new Error(`${d.file}: new road ${o.id} is defined twice`); seen.add(o.id); C.newRoads.push(tag("roads", i, o)); }
      else push(C.roadPatch, o.id, tag("roads", i, o));
    });
    (d.props || []).forEach((o, i) => C.props.push(tag("props", i, o)));
    C.meta.push({ file: d.file, cell: d.cell, bbox: d.bbox, sources: d.sources, note: d.note ?? null,
      counts: { lots: (d.lots || []).length, newLots: (d.newLots || []).length, landuse: (d.landuse || []).length, roads: (d.roads || []).length, props: (d.props || []).length } });
  }
  return C;
}
export const EMPTY = compileOverrides([]);

const inBox = (x, z, bb, pad = BBOX_PAD) => x >= bb[0] - pad && x <= bb[2] + pad && z >= bb[1] - pad && z <= bb[3] + pad;

// ------------------------------------------------------------------ lots
/** New-lot features for the lot pipeline (the same shape as data/buildings/city.json features). */
export function overrideFeatures(C) {
  return C.newLots.map((o) => ({ id: o.id, poly: o.poly.map((p) => [p[0], p[1]]), code: 3101, h: o.height ?? o.storeys * 3, ovr: o }));
}
/**
 * Apply the override ops of one lot, in order. `classify(kind)` -> { storeys, height, roofShape } re-derives the storeys,
 * height and roof shape when the kind changes and the op does not give them (the same rule as fold.js enrichLot).
 * -> "remove" when a remove op applies, else the number of ops applied. Throws when the lot lies outside an op's cell.
 */
export function patchLot(lot, ops, classify = null) {
  let n = 0;
  for (const o of ops || []) {
    const c = lot.obb ? [lot.obb.cx, lot.obb.cz] : null;
    if (c && o.bbox && !inBox(c[0], c[1], o.bbox)) throw new Error(`${o.ref}: lot ${lot.id} (centre ${c.map(r1)}) lies outside the cell bbox [${o.bbox}]`);
    if (o.remove) return "remove";
    const src = (lot.src ||= {});
    if (o.kind != null && o.kind !== lot.kind) {
      lot.kind = o.kind; src.kind = "override";
      // a new kind re-derives only the values that were derived: measured heights (OSM, landmark, LOT_FIX) and real
      // roof shapes (OSM, aerial) stay
      const derivedH = !src.h || src.h === "derived", derivedRoof = !src.roof || src.roof === "derived";
      if (classify && o.storeys == null && o.height == null && derivedH) { const k = classify(o.kind); lot.storeys = k.storeys; lot.height = k.height; src.h = "override"; }
      if (classify && o.roof?.shape == null && lot.roof && derivedRoof) { lot.roof.shape = classify(o.kind).roofShape; delete lot.roof.ridge; src.roof = "override"; }
    } else if (o.kind != null) src.kind = "override";
    if (o.storeys != null) { lot.storeys = o.storeys; src.h = "override"; if (o.height == null) lot.height = r1(o.storeys * (STOREY_H[lot.kind] || 3)); }
    if (o.height != null) { lot.height = r1(o.height); src.h = "override"; if (o.storeys == null) lot.storeys = Math.max(1, Math.round(o.height / (STOREY_H[lot.kind] || 3))); }
    if (o.roof) {
      lot.roof ||= {};
      if (o.roof.shape != null) { lot.roof.shape = o.roof.shape; src.roof = "override"; if (o.roof.shape === "flat" || o.roof.shape === "shed") delete lot.roof.ridge; }
      if (o.roof.color != null) { lot.roof.color = o.roof.color.toLowerCase(); delete lot.roof.photo; src.color = "override"; }
      if (o.roof.ridge != null) { lot.roof.ridge = o.roof.ridge; src.roof = "override"; }
    }
    if (o.wall != null) { lot.wall = o.wall.toLowerCase(); src.wall = "override"; }
    if (o.name != null) { lot.name = o.name; src.name = "override"; if (o.nameEn == null) delete lot.nameEn; }
    if (o.nameEn != null) lot.nameEn = o.nameEn;
    if (o.facade != null) lot.facade = o.facade;
    src.ovr = src.ovr ? src.ovr + " + " + o.ref : o.ref;
    src.ovrWhy = src.ovrWhy ? src.ovrWhy + " + " + o.why : o.why;
    n++;
  }
  return n;
}
/** Storey height by kind (m): fold.js STOREY. */
const STOREY_H = { house: 2.9, shop: 3.0, apartment: 2.9, office: 3.3, hotel: 3.1, public: 3.5, school: 3.6, temple: 5.5, shrine: 4.5, warehouse: 4.5, factory: 4.5, landmark: 3.5 };

/** Every lot patch must have found its lot: -> the ids that were never seen (the build fails on them). */
export function unusedLotPatches(C, seenIds) { return [...C.lotPatch.keys()].filter((id) => !seenIds.has(id)); }

// ------------------------------------------------------------------ roads
/**
 * Apply road patches and new roads to a road list in place. `known(id)` says whether an id exists in the source network
 * (a far alley is in explore.json but not in layout.json). `zoneOf(x, z)` places a new road; `keep(road)` filters the
 * new roads a list takes (build-explore takes only the far ones in the core). -> { patched, removed, added, missing }
 */
export function applyRoadOverrides(roads, C, { zoneOf = () => "far", keep = () => true } = {}) {
  const st = { patched: 0, removed: 0, added: 0, missing: [] };
  const byId = new Map(roads.map((r, i) => [r.id, i]));
  const drop = new Set();
  for (const [id, ops] of C.roadPatch) {
    const i = byId.get(id);
    if (i == null) { st.missing.push(id); continue; }
    const r = roads[i];
    for (const o of ops) {
      const m = r.pts[Math.floor(r.pts.length / 2)];
      if (o.bbox && !r.pts.some((p) => inBox(p[0], p[1], o.bbox))) throw new Error(`${o.ref}: road ${id} (near ${m}) does not reach the cell bbox [${o.bbox}]`);
      if (o.remove) { drop.add(i); break; }
      applyRoadFields(r, o);
    }
    if (drop.has(i)) st.removed++; else st.patched++;
  }
  if (drop.size) { const keepList = roads.filter((_, i) => !drop.has(i)); roads.length = 0; roads.push(...keepList); }
  for (const o of C.newRoads) {
    const m = alongPolyline(o.pts, polylineLength(o.pts) / 2).p;   // the zone of a road is the zone of its midpoint (build-layout.js)
    const r = { id: o.id, pts: o.pts.map((p) => [r1(p[0]), r1(p[1])]), width: r1(o.width), kind: o.kind, zone: zoneOf(m[0], m[1]), rank: null, code: 0 };
    if (!keep(r)) continue;
    applyRoadFields(r, o);
    roads.push(r); st.added++;
  }
  return st;
}
function applyRoadFields(r, o) {
  if (o.pts) r.pts = o.pts.map((p) => [r1(p[0]), r1(p[1])]);
  if (o.width != null) { r.width = r1(o.width); if (r.carriage != null && r.carriage > r.width) r.carriage = r.width; }
  if (o.carriage != null) r.carriage = r1(o.carriage);
  if (o.kind != null) r.kind = o.kind;
  if (o.name != null) { r.name = o.name; if (o.nameEn == null) delete r.nameEn; }
  if (o.nameEn != null) r.nameEn = o.nameEn;
  r.ovr = r.ovr ? r.ovr + " + " + o.ref : o.ref;
}

// ------------------------------------------------------------------ landuse
const centroidOf = (ring) => { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; };
function inRing(x, z, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
/** -> the landuse list with the override polygons appended (and, with `replace`, the polygons whose centre they cover removed). */
export function applyLanduseOverrides(landuse, C) {
  let out = landuse.slice(), replaced = 0;
  for (const o of C.landuse) {
    if (o.replace) { const n = out.length; out = out.filter((l) => { const c = centroidOf(l.ring); return !inRing(c[0], c[1], o.ring); }); replaced += n - out.length; }
    const cls = o.use === "vacant" ? (o.surface || "gravel") : LANDUSE_USES[o.use];
    out.push({ cls, type: "override:" + o.use, name: o.name ?? null, ring: o.ring.map((p) => [r1(p[0]), r1(p[1])]), holes: (o.holes || []).map((h) => h.map((p) => [r1(p[0]), r1(p[1])])), area: Math.round(Math.abs(polyArea(o.ring))), ...(o.fill != null ? { fill: o.fill } : {}), src: "override", ovr: o.ref, ovrWhy: o.why });
  }
  return { landuse: out, replaced };
}

// ------------------------------------------------------------------ props
/** -> layout props: { type, x, z, rotY, y?, ovr }. `face` is the compass bearing the prop's front looks to (0 north, the
 *  default; 90 east); `y` the height of the surface it stands on (T.P. m) where that is not the terrain (a deck, a seawall). */
export function propPlacements(C) {
  return C.props.map((o) => ({ type: o.type, x: r1(o.at[0]), z: r1(o.at[1]), rotY: r3(Math.PI - ((o.face ?? 0) * Math.PI) / 180), ...(o.y != null ? { y: r1(o.y) } : {}), ovr: o.ref }));
}
