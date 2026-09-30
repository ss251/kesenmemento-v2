// [v4:data] Fold data/anime/enrich.json into the layout (called by scripts/anime/build-layout.js). Pure (tested).
// Precedence for every lot value, and the source recorded in lot.src:
//   height / storeys: OSM height > OSM building:levels > derived (GSI code, area, zone: scripts/anime/derive.js)
//   kind:             OSM tags (building, amenity, shop, religion; or a shop/amenity node inside) > GSI facility > derived
//   roof shape:       OSM roof:shape > aerial class (scripts/anime/enrich/aerial.js) > derived
//   roof colour:      OSM roof:colour > aerial median (white-balanced, lightly graded) > derived palette
//   ridge:            aerial ridge direction, when the aerial or OSM shape is pitched
//   wall colour:      OSM building:colour > derived pastel
//   name:             OSM building name > named OSM POI inside > GSI Anno facility name
import { SegHash, alongPolyline, polylineLength, segDist, raySeg, rgbToHsv, hash32 } from "../derive.js";

const r1 = (v) => Math.round(v * 10) / 10;
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Names the app must not show (V3-SPEC section 5: never reference the 2011 disaster; a living, hopeful town). */
export const SENSITIVE = /津波|震災|被災|復興|tsunami|earthquake|2011|3\.11|慰霊|避難|防潮堤|伝承館|遺構|memorial|disaster/i;
export const showable = (name) => !!name && !SENSITIVE.test(name);

/** enrich.json lots (fields + rows) -> Map(id -> object) */
export function lotTable(E) {
  const F = E.lots.fields, m = new Map();
  for (const r of E.lots.rows) { const o = {}; F.forEach((k, i) => { if (r[i] != null) o[k] = r[i]; }); m.set(o.id, o); }
  return m;
}

/** Global white balance of the aerial roof colours: the photo has a cyan cast. Gains that make the median roof grey. */
export function roofWhiteBalance(table) {
  const R = [], G = [], B = [];
  for (const e of table.values()) if (e.rgb) { const c = rgbOf(e.rgb); R.push(c[0]); G.push(c[1]); B.push(c[2]); }
  if (!R.length) return [1, 1, 1];
  const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
  const m = [med(R), med(G), med(B)], g = (m[0] + m[1] + m[2]) / 3;
  // only half of the correction: the median roof in Kesennuma is a bluish-grey metal roof, not neutral
  return m.map((v) => Math.round((1 + (g / v - 1) * 0.5) * 1000) / 1000);
}
/** Photo roof colour -> the rendered roof colour: white balance, then a light anime grade (saturation x1.18, a small
 *  lift of the darks) that keeps the hue, so the roof still matches the photo (the accuracy audit measures the ΔE). */
export function gradeRoof(photoHex, wb = [1, 1, 1]) {
  const c = rgbOf(photoHex).map((v, i) => Math.min(255, v * wb[i]));
  const [h, s, v] = rgbToHsv(c[0], c[1], c[2]);
  const s2 = Math.min(1, s * 1.18), v2 = Math.min(1, 0.06 + v * 0.97);
  // quantised to 4-level steps (imperceptible, and it keeps the far-lot colour table small)
  return hex(hsvToRgb(h, s2, v2).map((x) => Math.min(252, Math.round(x / 4) * 4)));
}
function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Storey height by kind (m), for OSM building:levels. */
export const STOREY = { house: 2.9, shop: 3.0, apartment: 2.9, office: 3.3, hotel: 3.1, public: 3.5, school: 3.6, temple: 5.5, shrine: 4.5, warehouse: 4.5, factory: 4.5, landmark: 3.5 };
/** Ridge direction (radians in x-z) relative to a lot frame: 'x' = along the frontage (local x), 'z' = front to back. */
export function ridgeAxis(ridge, rotY) {
  const lx = Math.cos(rotY), lz = -Math.sin(rotY);   // local +x in world (three.js rotation.y)
  return Math.abs(Math.cos(ridge) * lx + Math.sin(ridge) * lz) >= Math.SQRT1_2 ? "x" : "z";
}

/**
 * Enrichment for one lot. e: the lot's enrich row object (or undefined). base: the derived values
 * { kind, storeys, height, roofShape, roofColor, wall, rotY, landmark }. -> the final values + src + labels.
 */
export function enrichLot(e, base, wb, classify) {
  const out = { kind: base.kind, storeys: base.storeys, height: base.height, roof: { shape: base.roofShape, color: base.roofColor }, wall: base.wall, src: { h: "derived", kind: "derived", roof: "derived", color: base.roofSrc || "derived" } };
  if (!e) return out;
  // kind (a landmark keeps its dedicated role). [v4:polish1] tourism=hotel on a block of 300 m² or more is a hotel
  // (a tall block of guest rooms), not a shop; smaller inns (旅館 in a house) stay shop-houses
  const eKind = e.use === "tourism:hotel" && (base.area ?? 0) >= 300 ? "hotel" : e.kind;
  if (eKind && !base.landmark && eKind !== base.kind) {
    const c = classify(eKind);
    out.kind = eKind; out.storeys = c.storeys; out.height = c.height; out.roof.shape = c.roofShape;
    out.src.kind = e.use || e.osm ? "osm" : "gsi";
  } else if (eKind && !base.landmark) out.src.kind = e.use || e.osm ? "osm" : "gsi";
  // height
  if (e.height) { out.height = r1(e.height); out.storeys = Math.max(1, Math.round(e.height / (STOREY[out.kind] || 3))); out.src.h = "osm"; }
  else if (e.levels) {
    out.storeys = Math.max(1, Math.round(e.levels));
    const tall = out.kind === "warehouse" || out.kind === "factory";
    out.height = r1(tall && out.storeys === 1 ? Math.max(out.height, 5.5) : out.storeys * (STOREY[out.kind] || 3) + (out.kind === "shop" ? 0.3 : 0));
    out.src.h = "osm";
  }
  // roof shape
  if (e.roofShape) { out.roof.shape = e.roofShape; out.src.roof = "osm"; }
  else if (e.aShape && !base.landmark) { out.roof.shape = e.aShape; out.src.roof = "aerial"; out.roof.conf = e.aConf; }
  if (e.ridge != null && (out.roof.shape === "gable" || out.roof.shape === "hip" || out.roof.shape === "saw") && (out.src.roof !== "derived")) out.roof.ridge = ridgeAxis(e.ridge, base.rotY);
  // roof colour
  if (e.roofColour) { out.roof.color = e.roofColour; out.src.color = "osm"; }
  else if (e.rgb && !base.landmark && !(e.veg > 0.5)) { out.roof.color = gradeRoof(e.rgb, wb); out.roof.photo = e.rgb; out.src.color = "aerial"; }
  if (e.wallColour) { out.wall = e.wallColour; out.src.wall = "osm"; }
  // names and use
  // [v4:polish1] a GSI facility name (気仙沼駅) wins over a shop or café POI matched inside the footprint (NewDays)
  const poiName = /^(shop|amenity):/.test(e.use || "") && showable(e.gsiName) && e.gsiCat;
  const name = (poiName ? [e.gsiName, e.name] : [e.name, e.gsiName]).find(showable);
  if (name) { out.name = name; out.src.name = name === e.name ? "osm" : "gsi"; }
  if (name && name === e.name && showable(e.nameEn)) out.nameEn = e.nameEn;
  if (e.use) out.use = e.use;
  if (e.gsiCat) out.facility = e.gsiCat;
  if (e.osm) out.osm = e.osm;
  return out;
}

// ------------------------------------------------------------------ roads: names and attributes from OSM
/** Give each layout road the OSM way that runs along it (within 9 m, parallel): name, ref, lanes, oneway, maxspeed. */
export function nameRoads(ROADS, osmRoads) {
  const H = new SegHash(24);
  for (const w of osmRoads) for (let i = 1; i < w.pts.length; i++) H.add(w.pts[i - 1], w.pts[i], w);
  let named = 0, matched = 0;
  for (const r of ROADS) {
    const L = polylineLength(r.pts);
    const votes = new Map();
    const n = Math.max(1, Math.min(7, Math.round(L / 25)));
    for (let k = 0; k < n; k++) {
      const { p, t } = alongPolyline(r.pts, (L * (k + 0.5)) / n);
      let best = null;
      for (const s of H.near(p[0], p[1], 10)) {
        const q = segDist(p[0], p[1], s.a, s.b); if (q.d > 9) continue;
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l = Math.hypot(dx, dz) || 1;
        if (Math.abs((dx * t[0] + dz * t[1]) / l) < 0.85) continue;
        if (!best || q.d < best.d) best = { d: q.d, w: s.data };
      }
      if (best) votes.set(best.w, (votes.get(best.w) || 0) + 1);
    }
    let w = null, v = 0; for (const [k, c] of votes) if (c > v || (c === v && k.osm < w.osm)) { w = k; v = c; }
    if (!w || v < Math.max(1, n * 0.5)) continue;
    matched++;
    r.hw = w.hw;
    if (showable(w.name)) { r.name = w.name; named++; }
    if (showable(w.nameEn)) r.nameEn = w.nameEn;
    for (const k of ["ref", "lanes", "oneway", "maxspeed", "tunnel"]) if (w[k] != null) r[k] = w[k];
    // [v4:polish3] the carriageway from OSM where tagged: the way's width, else lanes x 3.0 m (the GSI edges measure the
    // whole road reserve with its pavements; town/streets.js draws the rest as pavement)
    const cw = w.width > 1.5 && w.width < 40 ? w.width : w.lanes > 0 ? w.lanes * 3.0 : null;
    if (cw) r.carriage = Math.round(Math.min(r.width, Math.max(3, cw)) * 10) / 10;
    if (typeof w.bridge === "string" && w.bridge !== "yes" && showable(w.bridge)) r.bridgeName = w.bridge;
  }
  return { matched, named };
}

// ------------------------------------------------------------------ rivers: OSM names + widths from GSI water areas
/** Median river width (m) along a centre-line from the GSI inland-water polygon edges (WA 5200), or null. */
export function riverWidth(pts, edges, step = 15, lo = 1.5, hi = 150) {
  const L = polylineLength(pts), ws = [];
  for (let s = step / 2; s < L; s += step) {
    const { p, t } = alongPolyline(pts, s);
    const n = [-t[1], t[0]];
    let a = Infinity, b = Infinity;
    for (const e of edges.near(p[0], p[1], hi / 2 + 2)) {
      const ta = raySeg(p, n, e.a, e.b); if (ta !== null && ta > 0.2 && ta < a) a = ta;
      const tb = raySeg(p, [-n[0], -n[1]], e.a, e.b); if (tb !== null && tb > 0.2 && tb < b) b = tb;
    }
    if (a === Infinity || b === Infinity) continue;
    const w = a + b; if (w >= lo && w <= hi && Math.abs(a - b) < Math.max(3, w * 0.6)) ws.push(w);
  }
  if (ws.length < 2) return null;
  ws.sort((x, y) => x - y);
  return r1(ws[ws.length >> 1]);
}
/** Inland water edges (WA 5200) without the artificial z16 tile-clip edges. */
export function waterEdges(WA, tileEdge) {
  const H = new SegHash(32);
  for (const f of WA) {
    if (f.code !== 5200) continue;
    for (const ring of [f.outer, ...f.holes]) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (tileEdge && tileEdge(a, b)) continue;
      H.add(a, b, null);
    }
  }
  return H;
}

/** Stable, compact ids for places (search / labels): 'p' + hash of name and rounded position. */
export const placeId = (name, p) => "p" + (hash32(name + "|" + Math.round(p[0]) + "," + Math.round(p[1])) >>> 0).toString(36);
