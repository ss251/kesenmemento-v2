// [sys:21] The census small areas (町丁) of 気仙沼市 as polygons in the layout's ENU metres -> data/anime/areas-estat.json.
//   download the 気仙沼市 (code 04205) shapefile of the 令和2年国勢調査 小地域 (境界データ, 世界測地系, shapefile) from https://www.e-stat.go.jp/gis/statmap-search into raw/ref/estat/estat_04205.zip
//   (cd raw/ref/estat && unzip -o estat_04205.zip)
//   env -u NODE_OPTIONS bun run scripts/anime/build-areas-estat.js
// Source: 政府統計の総合窓口(e-Stat) 境界データ, 令和2年国勢調査 小地域 (A002005212020DDSWC04205, the JGD datum, EPSG:6668). The shapefile is read as it is (no
// shapefile library): a polygon record is parts + points in lon / lat, projected with src/core/geo.js's formula (x = (lon - 141.575) * 86744,
// z = -(lat - 38.906) * 111014), simplified with Douglas-Peucker to 5 m (the layout JSON stays small) and rounded to 1 m.
// build-layout.js folds the file into layout.areas = [{ ja, en, ring, holes? }] (en from the GSI / OSM place names where one exists).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { simplify, polyArea } from "./derive.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIR = join(ROOT, "raw/ref/estat");
const prj = ([lon, lat]) => [(lon - 141.575) * 86744, -(lat - 38.906) * 111014];

/** Polygon records of a .shp -> [{ rings: [[[lon, lat], ...], ...] }] (one per record, in file order) */
export function readShp(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = [];
  let o = 100;
  while (o + 8 <= buf.byteLength) {
    const len = dv.getInt32(o + 4, false) * 2; o += 8;
    const type = dv.getInt32(o, true);
    if (type === 5 || type === 15) {
      const nParts = dv.getInt32(o + 36, true), nPts = dv.getInt32(o + 40, true);
      const parts = []; for (let i = 0; i < nParts; i++) parts.push(dv.getInt32(o + 44 + i * 4, true));
      const p0 = o + 44 + nParts * 4, rings = [];
      for (let i = 0; i < nParts; i++) {
        const a = parts[i], b = i + 1 < nParts ? parts[i + 1] : nPts, ring = [];
        for (let k = a; k < b; k++) ring.push([dv.getFloat64(p0 + k * 16, true), dv.getFloat64(p0 + k * 16 + 8, true)]);
        rings.push(ring);
      }
      out.push({ rings });
    } else out.push({ rings: [] });
    o += len;
  }
  return out;
}
/** .dbf -> [{ field: string }] (Shift-JIS text) */
export function readDbf(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true), fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) fields.push({ name: new TextDecoder().decode(buf.subarray(o, o + 11)).replace(/\0.*$/, ""), len: buf[o + 16] });
  const sj = new TextDecoder("shift_jis"), recs = [];
  for (let i = 0; i < n; i++) {
    const r = buf.subarray(hl + i * rl, hl + (i + 1) * rl); let p = 1; const d = {};
    for (const f of fields) { d[f.name] = sj.decode(r.subarray(p, p + f.len)).trim(); p += f.len; }
    recs.push(d);
  }
  return recs;
}
const pointIn = (x, z, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

const baseOf = (s) => String(s || "").replace(/[（(][^）)]*[）)]\s*$/, "").replace(/[一二三四五六七八九十0-9０-９]+丁目$/, "").trim();
/**
 * Reconcile the census names with the address names (GSI 逆ジオコーダ lv01Nm) the residents use: the e-Stat 小地域 name of a polygon can
 * differ from the 町字 of the address inside it (町裏 sits in the census area 切通, 浪板 in 東八幡前, 本郷 in 川畑). A polygon whose 50 m GSI
 * samples (test/fixtures/gsi_revgeo_50m.json) agree on another base name by 60 % or more, over at least 3 samples, takes that name (the
 * 丁目 of the census name is kept when the base name is the same). The polygon geometry stays the census one.
 */
export function reconcile(areas, grid) {
  let renamed = 0;
  for (const a of areas) {
    const votes = new Map(); let n = 0;
    for (const [k, g] of Object.entries(grid)) {
      if (!g || g === "－" || g === "-") continue;
      const [x, z] = k.split(",").map(Number);
      if (!pointIn(x, z, a.ring) || (a.holes || []).some((h) => pointIn(x, z, h))) continue;
      n++; votes.set(g, (votes.get(g) || 0) + 1);
    }
    if (n < 3) continue;
    const [top, c] = [...votes.entries()].sort((p, q) => q[1] - p[1])[0];
    if (c / n >= 0.6 && baseOf(top) !== baseOf(a.ja)) { a.ja = top; a.renamed = true; renamed++; }
  }
  return renamed;
}
export function buildAreas({ dir = DIR, tol = 5, grid = null } = {}) {
  const shp = readShp(readFileSync(join(dir, "r2ka04205.shp"))), dbf = readDbf(readFileSync(join(dir, "r2ka04205.dbf")));
  if (shp.length !== dbf.length) throw new Error("shp / dbf record count differ");
  const out = [];
  shp.forEach((rec, i) => {
    const ja = dbf[i].S_NAME; if (!ja) return;                        // water / unnamed pieces
    const rings = rec.rings.map((r) => r.map(prj));
    // ESRI outer rings run clockwise (in lon / lat, y up), holes counter-clockwise; in ENU (z south) the orientation flips: outer rings
    // have a positive polyArea there
    const outers = rings.filter((r) => polyArea(r) > 0).map((r) => ({ ring: r, holes: [] })), holes = rings.filter((r) => polyArea(r) <= 0);
    for (const h of holes) { const o = outers.find((q) => pointIn(h[0][0], h[0][1], q.ring)); if (o) o.holes.push(h); }
    for (const o of outers) {
      const ring = simplify(o.ring.slice(0, -1), tol).map((p) => [Math.round(p[0]), Math.round(p[1])]);
      if (ring.length < 3) continue;
      const e = { ja, en: null, ring };
      const hs = o.holes.map((h) => simplify(h.slice(0, -1), tol).map((p) => [Math.round(p[0]), Math.round(p[1])])).filter((h) => h.length >= 3);
      if (hs.length) e.holes = hs;
      out.push(e);
    }
  });
  if (grid) reconcile(out, grid);
  return out;
}

if (import.meta.main) {
  if (!existsSync(join(DIR, "r2ka04205.shp"))) throw new Error("raw/ref/estat/r2ka04205.shp is missing: see the header for the download");
  const grid = JSON.parse(readFileSync(join(ROOT, "test/fixtures/gsi_revgeo_50m.json"), "utf8"));
  const areas = buildAreas({ grid });
  const txt = JSON.stringify({ source: "政府統計の総合窓口(e-Stat) 境界データ, 令和2年国勢調査 小地域 04205 (A002005212020DDSWC04205)", areas });
  writeFileSync(join(ROOT, "data/anime/areas-estat.json"), txt);
  console.log(JSON.stringify({ ok: true, renamed: areas.filter((a) => a.renamed).length, areas: areas.length, names: new Set(areas.map((a) => a.ja)).size, bytes: txt.length }));
}
