// P2: buildings, roof colours, trees, roads, coast, rail from GSI optimal_bvmap-v1 z16.
// `bun run scripts/buildings/build.js`  (needs data/terrain + data/ortho from scripts/terrain/build.js)
// Outputs in data/buildings/:
//   layers.json                 layer names, attribute keys, vt_code counts (first-run dump)
//   city.json                   all footprints (ENU, CCW-from-above outer, CW holes) + roof colour
//   city.mesh.bin / core.mesh.bin   KLC1 meshes (city = outside the core bbox, simplified; core = full detail)
//   city.attr.bin / core.attr.bin   KLA1 per-vertex roof palette index + flags (lit / roof / gable end)
//   palette.json                model roof palette
//   trees_core.bin / trees_city.bin + trees.json   KLT1 instanced model-tree points
//   roads.json, coast.json, rail.json   {"lines":[[[x,z],...]], ...}
//   core.obj + core.mtl         Blender-importable core massing (OBJ Y-up, forward -Z => Blender x, -z, y)
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import sharp from "sharp";
import { BBOX, CRS, LAT0, LON0, hash01, llToEnu, sampleGrid, tileToLl, enuToLl } from "../../src/core/geo.js";
import { decodeRaw } from "../terrain/mosaic.js";
import { fetchTiles, rangeTiles, readTile, ROOT, tileRange } from "../terrain/tiles.js";
import {
  MeshBuilder, PALETTE, buildingHeight, centroid, cleanRing, clipLineToBox, clipRingToBox,
  encodeAttr, encodeMesh, extrudeBuilding, isGabled, isLit, pointInPolygon, quantiseRoof,
  signedArea, simplifyRing, triangulate, ringSelfIntersects, FLAG_ROOF, whiteBalanceGains,
} from "./lib.js";

const OUT = join(ROOT, "data/buildings");
const Z = 16, EXTENT = 4096;
const VT = "optimal_bvmap-v1";
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// vegetation symbol codes (GSI 地図記号, Anno layer)
export const TREE_CODES = { 6321: "broadleaf", 6322: "conifer", 6323: "bamboo", 6327: "palm", 6314: "orchard", 6315: "orchard" };
const OPEN_CODES = new Set([6311, 6312, 6313, 6324, 6325, 6326, 6331, 6332]);

// ------------------------------------------------------------------ terrain
async function loadGrid(name) {
  const meta = await Bun.file(join(ROOT, `data/terrain/${name}.json`)).json();
  const h = new Float32Array(await Bun.file(join(ROOT, `data/terrain/${name}.f32`)).arrayBuffer());
  return { meta, h };
}

// ------------------------------------------------------------------ ortho tile sampler (roof colours)
class TileSampler {
  constructor(z) {
    this.z = z;
    this.cache = new Map();
  }
  async tile(x, y) {
    const k = `${x}/${y}`;
    let t = this.cache.get(k);
    if (t !== undefined) return t;
    const buf = await readTile("seamlessphoto", this.z, x, y);
    t = buf ? await decodeRaw(buf, 3) : null;
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(k, t);
    return t;
  }
  /** RGB at lat/lon or null. */
  async rgb(lat, lon) {
    const n = 2 ** this.z;
    const fx = ((lon + 180) / 360) * n;
    const lr = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
    const x = Math.floor(fx), y = Math.floor(fy);
    const t = await this.tile(x, y);
    if (!t) return null;
    const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256));
    const k = (py * 256 + px) * 3;
    return [t[k], t[k + 1], t[k + 2]];
  }
}

function distToRing(x, z, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
    if (d < best) best = d;
  }
  return best;
}

async function sampleRoof(sampler, b) {
  const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const step = Math.max(0.5, Math.sqrt(b.area / 150));
  const inset = Math.min(maxX - minX, maxZ - minZ) > 4 ? 0.8 : 0;
  const pts = [];
  for (let z = minZ + step / 2; z < maxZ; z += step)
    for (let x = minX + step / 2; x < maxX; x += step) {
      if (!pointInPolygon(x, z, b.poly, b.holes)) continue;
      if (inset && distToRing(x, z, b.poly) < inset) continue;
      pts.push([x, z]);
    }
  if (!pts.length) pts.push(centroid(b.poly));
  const rs = [], gs = [], bs = [];
  for (const [x, z] of pts) {
    const ll = enuToLl(x, z);
    const c = await sampler.rgb(ll.lat, ll.lon);
    if (!c) continue;
    rs.push(c[0]), gs.push(c[1]), bs.push(c[2]);
  }
  if (!rs.length) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

// ------------------------------------------------------------------ vector tile decoding
function tileToEnu(tx, ty, p) {
  const ll = tileToLl(tx + p[0] / EXTENT, ty + p[1] / EXTENT, Z);
  const e = llToEnu(ll.lat, ll.lon);
  return [e.x, e.z];
}

function polygonsOf(feature) {
  // group rings: positive area (tile coords, y down) = exterior, negative = hole of the previous exterior
  const polys = [];
  for (const ring of feature.loadGeometry()) {
    const r = ring.map((p) => [p.x, p.y]);
    const a = signedArea(r);
    if (Math.abs(a) < 1e-9) continue;
    if (a > 0) polys.push({ outer: r, holes: [] });
    else if (polys.length) polys[polys.length - 1].holes.push(r);
  }
  return polys;
}

function linesOf(feature) {
  return feature.loadGeometry().map((l) => l.map((p) => [p.x, p.y]));
}

// ------------------------------------------------------------------ main
async function main() {
  const t0 = performance.now();
  await mkdir(OUT, { recursive: true });
  const city = await loadGrid("city");
  const core = await loadGrid("core");
  const [cLonMin, cLatMin, cLonMax, cLatMax] = BBOX.core;
  const inCore = (lat, lon) => lat >= cLatMin && lat <= cLatMax && lon >= cLonMin && lon <= cLonMax;
  const ground = (x, z) => {
    let h = sampleGrid(core.h, core.meta, x, z);
    if (Number.isNaN(h)) h = sampleGrid(city.h, city.meta, x, z);
    return Number.isNaN(h) ? 0 : h;
  };

  // 1. vector tiles
  const range = tileRange(BBOX.city, Z);
  const tiles = rangeTiles(range);
  await fetchTiles(VT, Z, tiles);

  const layers = {};
  const buildings = [];
  const roads = { lines: [], codes: [], rnk: [] };
  const coast = { lines: [], codes: [] };
  const rail = { lines: [], codes: [] };
  const vegSymbols = [];
  let dropped = { tiny: 0, earcut: 0, selfx: 0 };

  for (const [tx, ty] of tiles) {
    const buf = await readTile(VT, Z, tx, ty);
    if (!buf) continue;
    const vt = new VectorTile(new Pbf(buf));
    for (const [name, layer] of Object.entries(vt.layers)) {
      const L = (layers[name] ??= { features: 0, keys: {}, codes: {}, geomTypes: {} });
      L.features += layer.length;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        for (const k of Object.keys(f.properties)) L.keys[k] = (L.keys[k] || 0) + 1;
        const c = f.properties.vt_code;
        L.codes[c] = (L.codes[c] || 0) + 1;
        L.geomTypes[f.type] = (L.geomTypes[f.type] || 0) + 1;
      }
    }
    // buildings
    const B = vt.layers.BldA;
    if (B) {
      for (let i = 0; i < B.length; i++) {
        const f = B.feature(i);
        const code = Number(f.properties.vt_code);
        const polys = polygonsOf(f);
        polys.forEach((pg, k) => {
          const id = polys.length > 1 ? `${Z}/${tx}/${ty}/${i}.${k}` : `${Z}/${tx}/${ty}/${i}`;
          const outerT = clipRingToBox(pg.outer, 0, EXTENT);
          if (outerT.length < 3) return;
          let poly = cleanRing(outerT.map((p) => tileToEnu(tx, ty, p)), 0.1);
          if (poly.length < 3) return;
          // MVT exterior is +area in (x, y-down) == +area in (x, z): reverse to CCW-from-above
          if (signedArea(poly) > 0) poly.reverse();
          const holes = [];
          for (const h of pg.holes) {
            const hc = clipRingToBox(h, 0, EXTENT);
            if (hc.length < 3) continue;
            let hr = cleanRing(hc.map((p) => tileToEnu(tx, ty, p)), 0.1);
            if (hr.length < 3 || Math.abs(signedArea(hr)) < 1) continue;
            if (signedArea(hr) < 0) hr.reverse(); // holes CW from above
            holes.push(hr);
          }
          const area = -signedArea(poly) - holes.reduce((s, h) => s + signedArea(h), 0);
          if (area < 4) return void dropped.tiny++;
          if (ringSelfIntersects(poly)) return void dropped.selfx++;
          const tri = triangulate(poly, holes);
          if (!tri.indices.length || tri.deviation > 0.02) return void dropped.earcut++;
          buildings.push({ id, code, poly, holes, area });
        });
      }
    }
    // roads, coast, rail
    for (const [lname, target, extra] of [["RdCL", roads, "vt_rnkwidth"], ["Cstline", coast], ["RailCL", rail]]) {
      const Ly = vt.layers[lname];
      if (!Ly) continue;
      for (let i = 0; i < Ly.length; i++) {
        const f = Ly.feature(i);
        for (const line of linesOf(f)) {
          for (const part of clipLineToBox(line, 0, EXTENT)) {
            const pl = part.map((p) => tileToEnu(tx, ty, p).map(r1));
            target.lines.push(pl);
            target.codes.push(Number(f.properties.vt_code));
            if (extra) target.rnk.push(Number(f.properties[extra] ?? 0));
          }
        }
      }
    }
    // vegetation / land-use symbols (points)
    const A = vt.layers.Anno;
    if (A) {
      for (let i = 0; i < A.length; i++) {
        const f = A.feature(i);
        const c = Number(f.properties.vt_code);
        if (!(c in TREE_CODES) && !OPEN_CODES.has(c)) continue;
        for (const ring of f.loadGeometry())
          for (const p of ring) {
            if (p.x < 0 || p.y < 0 || p.x >= EXTENT || p.y >= EXTENT) continue;
            const [x, z] = tileToEnu(tx, ty, [p.x, p.y]);
            vegSymbols.push({ x, z, code: c });
          }
      }
    }
  }
  const layersOut = {
    source: `${VT} z${Z}`,
    tiles: tiles.length,
    buildingLayer: layers.BldA ? "BldA" : null,
    codeAttribute: "vt_code",
    layers: Object.fromEntries(
      Object.entries(layers).map(([k, v]) => [k, { features: v.features, keys: Object.keys(v.keys), codes: v.codes, geomTypes: v.geomTypes }]),
    ),
  };
  await Bun.write(join(OUT, "layers.json"), JSON.stringify(layersOut, null, 1));
  console.log(`vector: ${buildings.length} building polygons, dropped ${JSON.stringify(dropped)}, ${roads.lines.length} road lines, ${vegSymbols.length} land-use symbols`);

  // 2. heights, terrain, roof colours
  const s18 = new TileSampler(18);
  const s17 = new TileSampler(17);
  // z17 ortho tiles for roof sampling outside the core (core uses the cached z18 tiles)
  const need17 = new Set(), need18 = new Set();
  for (const b of buildings) {
    const c = centroid(b.poly);
    const ll = enuToLl(c[0], c[1]);
    b.cx = c[0], b.cz = c[1];
    b.inCore = inCore(ll.lat, ll.lon);
    const z = b.inCore ? 18 : 17;
    const set = b.inCore ? need18 : need17;
    for (const p of b.poly) {
      const q = enuToLl(p[0], p[1]);
      const n = 2 ** z;
      const x = Math.floor(((q.lon + 180) / 360) * n);
      const lr = (q.lat * Math.PI) / 180;
      const y = Math.floor(((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n);
      set.add(`${x}/${y}`);
    }
  }
  const toList = (s) => [...s].map((k) => k.split("/").map(Number));
  await fetchTiles("seamlessphoto", 18, toList(need18), { label: "roof ortho" });
  await fetchTiles("seamlessphoto", 17, toList(need17), { label: "roof ortho" });

  const paletteCount = [0, 0, 0, 0, 0];
  buildings.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const b of buildings) {
    b.h = buildingHeight(b.code, b.area, b.id);
    b.lit = isLit(b.id);
    b.gable = isGabled(b.code, b.id);
    const g = ground(b.cx, b.cz);
    let minV = g;
    for (const p of b.poly) minV = Math.min(minV, ground(p[0], p[1]));
    b.ground = g;
    b.base = Math.min(g, minV) - 0.5;
    b.top = g + b.h;
    const rgb = await sampleRoof(b.inCore ? s18 : s17, b);
    b.rgb = rgb ?? [150, 150, 150];
    b.sampled = !!rgb;
  }
  // local white balance: the aerial mosaic has per-flight colour casts (teal, warm), so normalise
  // each building against the median roof colour of its z16 tile (3x3 tiles when sparse)
  const byTile = new Map();
  for (const b of buildings) {
    if (!b.sampled) continue;
    const [, x, y] = b.id.split("/").map(Number);
    const k = `${x}/${y}`;
    if (!byTile.has(k)) byTile.set(k, []);
    byTile.get(k).push(b.rgb);
  }
  const gainCache = new Map();
  const gainsFor = (id) => {
    const [, x, y] = id.split("/").map(Number);
    const k = `${x}/${y}`;
    if (gainCache.has(k)) return gainCache.get(k);
    let pool = byTile.get(k) ?? [];
    if (pool.length < 25) {
      pool = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) pool.push(...(byTile.get(`${x + dx}/${y + dy}`) ?? []));
    }
    const g = whiteBalanceGains(pool);
    gainCache.set(k, g);
    return g;
  };
  for (const b of buildings) {
    if (!b.sampled) {
      b.roof = 1;
    } else {
      const g = gainsFor(b.id);
      b.rgbBalanced = b.rgb.map((v, i) => Math.min(255, Math.round(v * g[i])));
      b.roof = quantiseRoof(...b.rgbBalanced);
    }
    paletteCount[b.roof]++;
  }
  console.log(`roof palette: ${PALETTE.map((p, i) => `${p.name} ${paletteCount[i]}`).join(", ")}`);

  // 3. meshes
  const mbCity = new MeshBuilder(), mbCore = new MeshBuilder();
  let gabled = 0;
  for (const b of buildings) {
    if (b.inCore) {
      const r = extrudeBuilding(mbCore, { poly: b.poly, holes: b.holes, base: b.base, top: b.top, code: b.code, roof: b.roof, lit: b.lit, gable: b.gable });
      if (r.gabled) gabled++;
      b.gabled = r.gabled;
    } else {
      let poly = simplifyRing(b.poly, 0.75);
      if (poly.length < 3 || ringSelfIntersects(poly)) poly = b.poly;
      const holes = b.holes.filter((h) => Math.abs(signedArea(h)) > 20);
      extrudeBuilding(mbCity, { poly, holes, base: b.base, top: b.top, code: b.code, roof: b.roof, lit: b.lit, gable: false });
      b.gabled = false;
    }
  }
  const cityBin = encodeMesh(mbCity), coreBin = encodeMesh(mbCore);
  await Bun.write(join(OUT, "city.mesh.bin"), cityBin);
  await Bun.write(join(OUT, "core.mesh.bin"), coreBin);
  await Bun.write(join(OUT, "city.attr.bin"), encodeAttr(mbCity));
  await Bun.write(join(OUT, "core.attr.bin"), encodeAttr(mbCore));
  console.log(
    `mesh: city ${mbCity.idx.length / 3} tris / ${mbCity.vertCount} verts, core ${mbCore.idx.length / 3} tris / ${mbCore.vertCount} verts (${gabled} gabled)`,
  );

  // 4. JSON
  const palette = {
    note: "Model-mode roof palette (ADDENDUM-model §2). *.attr.bin roof[] and city.json features[].roof use `index`.",
    colors: PALETTE.map((p) => ({ ...p, hex: "#" + p.rgb.map((v) => v.toString(16).padStart(2, "0")).join("") })),
  };
  await Bun.write(join(OUT, "palette.json"), JSON.stringify(palette, null, 1));
  const cityJson = {
    origin: { lat: LAT0, lon: LON0, crs: CRS },
    count: buildings.length,
    source: `${VT} z${Z} BldA`,
    winding: "poly: outer ring counter-clockwise viewed from above (+y), i.e. shoelace over (x, -z) > 0; holes clockwise",
    fields: {
      id: "z/x/y/featureIndex[.part]", code: "GSI vt_code", h: "eave height above ground (m)", lit: "night window emissive (35% by id hash)",
      ground: "terrain y at footprint centroid", base: "mesh wall bottom y (min terrain under footprint - 0.5)",
      roof: "palette index (palette.json), quantised from rgbWB", rgb: "median aerial roof colour sampled from GSI seamlessphoto (z18 core, z17 city)",
      rgbWB: "rgb after local white balance (grey-world over roofs of the same z16 tile)",
      gable: "true if the core mesh gives it a gabled ridge (+1.5 m)", core: "true if in the core bbox (mesh in core.mesh.bin, else city.mesh.bin)",
    },
    meshes: {
      "city.mesh.bin": "buildings with core=false, footprints simplified 0.75 m, flat roofs",
      "core.mesh.bin": "buildings with core=true, full detail, gabled roofs",
      layout: "KLC1: u32 magic 0x4B4C4331, u32 vertCount, u32 indexCount, f32 pos[V*3], f32 nrm[V*3], f32 uv[V*2] (u = metres along wall, v = height fraction 0 base..1 eave; roofs v=1), u8 code[V] (= vt_code - 3100, 0 other), u32 idx[I]. V is padded to a multiple of 4 with unreferenced vertices so idx is 4-byte aligned.",
      attr: "*.attr.bin KLA1: u32 magic 0x4B4C4131, u32 vertCount, u8 roof[V] (palette index), u8 flags[V] (1 lit, 2 roof surface, 4 gable end)",
    },
    features: buildings.map((b) => ({
      id: b.id, code: b.code, h: r2(b.h), lit: b.lit, ground: r2(b.ground), base: r2(b.base), roof: b.roof, rgb: b.rgb, rgbWB: b.rgbBalanced ?? b.rgb,
      gable: b.gabled, core: b.inCore,
      poly: b.poly.map((p) => [r2(p[0]), r2(p[1])]),
      holes: b.holes.map((h) => h.map((p) => [r2(p[0]), r2(p[1])])),
    })),
  };
  await Bun.write(join(OUT, "city.json"), JSON.stringify(cityJson));
  const lineMeta = (src, extra) => ({ source: `${VT} z${Z} ${src}`, crs: CRS, ...extra });
  await Bun.write(join(OUT, "roads.json"), JSON.stringify({ ...lineMeta("RdCL", { rnk: "vt_rnkwidth per line" }), ...roads }));
  await Bun.write(join(OUT, "coast.json"), JSON.stringify({ ...lineMeta("Cstline"), ...coast }));
  await Bun.write(join(OUT, "rail.json"), JSON.stringify({ ...lineMeta("RailCL"), ...rail }));

  // 5. trees
  await buildTrees({ buildings, roads, vegSymbols, ground, inCore });

  // 6. OBJ for Blender
  await writeObj(mbCore, join(OUT, "core.obj"), join(OUT, "core.mtl"));
  console.log(`P2 done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

// ------------------------------------------------------------------ trees
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.m = new Map();
  }
  key(i, j) {
    return i * 100003 + j;
  }
  add(x, z, v) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.m.get(k);
    if (!a) this.m.set(k, (a = []));
    a.push(v);
  }
  addBox(x0, z0, x1, z1, v) {
    for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
      for (let j = Math.floor(z0 / this.cell); j <= Math.floor(z1 / this.cell); j++) {
        const k = this.key(i, j);
        let a = this.m.get(k);
        if (!a) this.m.set(k, (a = []));
        a.push(v);
      }
  }
  near(x, z, r = 0) {
    const out = [];
    const i0 = Math.floor(x / this.cell), j0 = Math.floor(z / this.cell);
    for (let i = i0 - r; i <= i0 + r; i++)
      for (let j = j0 - r; j <= j0 + r; j++) {
        const a = this.m.get(this.key(i, j));
        if (a) for (const v of a) out.push(v);
      }
    return out;
  }
}

async function loadOrtho(name) {
  const meta = await Bun.file(join(ROOT, `data/ortho/${name}.json`)).json();
  const { data, info } = await sharp(join(ROOT, `data/ortho/${name}.jpg`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { meta, data, w: info.width, h: info.height };
}

function orthoRgb(o, x, z) {
  const i = Math.floor((x - o.meta.x0) / o.meta.dx), j = Math.floor((z - o.meta.z0) / o.meta.dz);
  if (i < 0 || j < 0 || i >= o.w || j >= o.h) return null;
  const k = (j * o.w + i) * 3;
  return [o.data[k], o.data[k + 1], o.data[k + 2]];
}

/** Vegetated canopy in the aerial photo (excess-green with green dominant). */
export function isGreen(rgb) {
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return g >= r && g >= b * 0.92 && 2 * g - r - b > 8 && g < 200;
}

async function buildTrees({ buildings, roads, vegSymbols, ground, inCore }) {
  const t0 = performance.now();
  const orthoCity = await loadOrtho("city");
  const orthoCore = await loadOrtho("core_2k");
  const bGrid = new Grid(40);
  for (const b of buildings) {
    const xs = b.poly.map((p) => p[0]), zs = b.poly.map((p) => p[1]);
    bGrid.addBox(Math.min(...xs) - 3, Math.min(...zs) - 3, Math.max(...xs) + 3, Math.max(...zs) + 3, b);
  }
  const rGrid = new Grid(40);
  roads.lines.forEach((l) => {
    for (let i = 0; i < l.length - 1; i++) {
      const a = l[i], c = l[i + 1];
      rGrid.addBox(Math.min(a[0], c[0]) - 4, Math.min(a[1], c[1]) - 4, Math.max(a[0], c[0]) + 4, Math.max(a[1], c[1]) + 4, [a, c]);
    }
  });
  const sGrid = new Grid(100);
  for (const s of vegSymbols) sGrid.add(s.x, s.z, s);
  const SYMBOL_R = 320;

  const classify = (x, z) => {
    let best = null, bd = SYMBOL_R;
    for (const s of sGrid.near(x, z, 3)) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  };
  const blocked = (x, z) => {
    for (const b of bGrid.near(x, z)) {
      if (pointInPolygon(x, z, b.poly, b.holes)) return true;
      if (Math.abs(x - b.cx) < 60 && Math.abs(z - b.cz) < 60) {
        // within ~2.5 m of a footprint edge
        for (let i = 0; i < b.poly.length; i++) {
          const p = b.poly[i], q = b.poly[(i + 1) % b.poly.length];
          if (segDist(x, z, p, q) < 2.5) return true;
        }
      }
    }
    for (const [a, c] of rGrid.near(x, z)) if (segDist(x, z, a, c) < 4) return true;
    return false;
  };

  const make = (name, bbox, spacing, rMin, rMax, keep) => {
    // spacing also sets the canopy-continuity probe distance below
    const [x0, z0, x1, z1] = bbox;
    const pts = [];
    const stats = { symbol: 0, slope: 0 };
    let n = 0;
    for (let z = z0; z < z1; z += spacing)
      for (let x = x0; x < x1; x += spacing) {
        n++;
        const jx = x + (hash01(`${x}|${z}|a`) - 0.5) * spacing * 0.9;
        const jz = z + (hash01(`${x}|${z}|b`) - 0.5) * spacing * 0.9;
        if (!keep(jx, jz)) continue;
        const y = ground(jx, jz);
        if (y < 1.0) continue; // sea / shore
        const ll = enuToLl(jx, jz);
        const rgb = inCore(ll.lat, ll.lon) ? orthoRgb(orthoCore, jx, jz) : orthoRgb(orthoCity, jx, jz);
        if (!isGreen(rgb)) continue;
        // canopy continuity: most of a 3x3 neighbourhood must be green (drops verges and lone lawns)
        const o = inCore(ll.lat, ll.lon) ? orthoCore : orthoCity;
        const e = spacing * 0.55;
        let green = 0;
        for (const ox of [-e, 0, e]) for (const oz of [-e, 0, e]) if (isGreen(orthoRgb(o, jx + ox, jz + oz))) green++;
        if (green < 7) continue;
        const slope = Math.abs(ground(jx + 6, jz) - ground(jx - 6, jz)) + Math.abs(ground(jx, jz + 6) - ground(jx, jz - 6));
        // flat low ground (reclaimed quay land, fields, lawns): only dark canopy counts as trees
        if (y < 10 && slope < 1.5 && Math.max(...rgb) > 115) continue;
        const sym = classify(jx, jz);
        let type;
        if (sym) {
          if (!(sym.code in TREE_CODES)) continue; // paddy / field / wasteland: no trees
          type = sym.code === 6322 ? 1 : sym.code === 6323 ? 2 : sym.code === 6314 || sym.code === 6315 ? 3 : 0;
          stats.symbol++;
        } else {
          // no land-use symbol nearby: wooded only on higher ground or slopes
          if (y < 25 && slope < 4) continue;
          type = 0;
          stats.slope++;
        }
        if (blocked(jx, jz)) continue;
        const r = rMin + (rMax - rMin) * hash01(`${jx}|${jz}|r`) * (type === 3 ? 0.5 : 1);
        pts.push([jx, y, jz, r, type, hash01(`${jx}|${jz}|o`)]);
      }
    pts.sort((a, b) => a[5] - b[5]); // shuffled: any prefix is a uniform subsample
    const count = pts.length;
    const buf = new ArrayBuffer(8 + count * 16 + count);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x4b4c5431, true); // 'KLT1'
    dv.setUint32(4, count, true);
    const f = new Float32Array(buf, 8, count * 4);
    const ty = new Uint8Array(buf, 8 + count * 16, count);
    pts.forEach((p, i) => {
      f.set([p[0], p[1], p[2], p[3]], i * 4);
      ty[i] = p[4];
    });
    console.log(`  trees ${name}: ${count} of ${n} candidates (symbol-backed ${stats.symbol}, slope/height ${stats.slope})`);
    return { buf: new Uint8Array(buf), count };
  };

  const [cx0, cz0, cx1, cz1] = boxOf(BBOX.core);
  const cityBox = boxOf(BBOX.city);
  const core = make("core", [cx0, cz0, cx1, cz1], 7, 2.2, 3.6, () => true);
  const cityT = make("city", cityBox, 20, 4.5, 7.5, (x, z) => !(x >= cx0 && x <= cx1 && z >= cz0 && z <= cz1));
  await Bun.write(join(OUT, "trees_core.bin"), core.buf);
  await Bun.write(join(OUT, "trees_city.bin"), cityT.buf);
  await Bun.write(
    join(OUT, "trees.json"),
    JSON.stringify(
      {
        source:
          "Forest land cover: GSI optimal_bvmap-v1 Anno vegetation symbols (6321 broadleaf, 6322 conifer, 6323 bamboo, 6327 palm, 6314/6315 orchard; nearest symbol within 320 m), refined by GSI seamlessphoto greenness (7 of 9 neighbourhood probes green; flat ground below 10 m needs dark canopy); unlabelled green slopes/high ground also wooded. Buildings (+2.5 m), roads (4 m) and sea excluded.",
        layout: "KLT1: u32 magic 0x4B4C5431, u32 count, f32 [x, y, z, r] * count (ENU; y = ground; r = crown radius m), u8 type[count] (0 broadleaf, 1 conifer, 2 bamboo, 3 orchard). Order is shuffled: draw the first N for a uniform subsample.",
        files: {
          "trees_core.bin": { count: core.count, spacing: 7, bbox: BBOX.core },
          "trees_city.bin": { count: cityT.count, spacing: 20, bbox: BBOX.city, excludes: "core bbox" },
        },
        model: "Model mode: green sphere of radius r on a short stem, centre at y + 1.1*r (ADDENDUM-model §3).",
        crs: CRS,
      },
      null,
      1,
    ),
  );
  console.log(`  trees done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function boxOf(bbox) {
  const a = llToEnu(bbox[3], bbox[0]), b = llToEnu(bbox[1], bbox[2]);
  return [a.x, a.z, b.x, b.z];
}

// ------------------------------------------------------------------ OBJ
async function writeObj(mb, objPath, mtlPath) {
  const V = mb.vertCount;
  const parts = [];
  parts.push("# Kesennuma Living City core massing. ENU metres, Y up; Blender OBJ import (forward -Z, up Y) gives bx=x, by=-z, bz=y.\n");
  parts.push("mtllib core.mtl\no core_buildings\n");
  for (let i = 0; i < V; i++) parts.push(`v ${mb.pos[i * 3].toFixed(2)} ${mb.pos[i * 3 + 1].toFixed(2)} ${mb.pos[i * 3 + 2].toFixed(2)}\n`);
  for (let i = 0; i < V; i++) parts.push(`vt ${mb.uv[i * 2].toFixed(2)} ${mb.uv[i * 2 + 1].toFixed(3)}\n`);
  for (let i = 0; i < V; i++) parts.push(`vn ${mb.nrm[i * 3].toFixed(3)} ${mb.nrm[i * 3 + 1].toFixed(3)} ${mb.nrm[i * 3 + 2].toFixed(3)}\n`);
  // group triangles by material: walls vs roof_<palette>
  const groups = new Map();
  for (let t = 0; t < mb.idx.length; t += 3) {
    const a = mb.idx[t];
    const mat = mb.flags[a] & FLAG_ROOF ? `roof_${PALETTE[mb.roof[a]].name}` : "wall";
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat).push(t);
  }
  for (const [mat, ts] of groups) {
    parts.push(`usemtl ${mat}\n`);
    for (const t of ts) {
      const [a, b, c] = [mb.idx[t] + 1, mb.idx[t + 1] + 1, mb.idx[t + 2] + 1];
      parts.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`);
    }
  }
  await Bun.write(objPath, parts.join(""));
  const mtl = ["# model-mode materials", "newmtl wall", "Kd 0.914 0.894 0.863", ""];
  for (const p of PALETTE) mtl.push(`newmtl roof_${p.name}`, `Kd ${p.rgb.map((v) => (v / 255).toFixed(3)).join(" ")}`, "");
  await Bun.write(mtlPath, mtl.join("\n"));
  console.log(`  wrote core.obj (${V} verts, ${mb.idx.length / 3} tris)`);
}

if (import.meta.main) await main();
