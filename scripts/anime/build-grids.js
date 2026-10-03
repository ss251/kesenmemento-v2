// [v3:foundation] Terrain + water grids for the anime layout (heightAt / isWater / shore distance).
//   env -u NODE_OPTIONS bun run scripts/anime/build-grids.js     (after scripts/anime/vt.js)
// Outputs data/anime/grids.json (+ grids.bin): two nested grids
//   core: 4 m cells over the core bbox (the hero and mid zones live here)
//   city: 16 m cells over the whole city bbox (far zone)
// each with   h   Int16 decimetres: ground (T.P.) on land, a smooth seabed under water
//             sdf Int16 decimetres: signed distance to the shoreline, + in the sea, - on land (clamped to +-300 m)
//             wat Uint8: 0 land, 1 sea (WA 5100), 2 inland water (WA 5200: rivers, ponds)
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { ROOT } from "../terrain/tiles.js";
import { Grid, fillRings, edt, bilinear, inGrid } from "./raster.js";
import { CACHE } from "./vt.js";
import { LAND_FILL, inRing } from "./landfill.js";   // [v6:c8] reclaimed land GSI still draws as water

export const OUT = join(ROOT, "data/anime");

async function loadDem(name) {
  const meta = await Bun.file(join(ROOT, `data/terrain/${name}.json`)).json();
  const h = new Float32Array(await Bun.file(join(ROOT, `data/terrain/${name}.f32`)).arrayBuffer());
  // DEM grids are sample-centred at x0 + col*dx: wrap them as Grid with x0 shifted by half a cell
  return { g: new Grid(name, meta.x0 - meta.dx / 2, meta.z0 - meta.dz / 2, meta.dx, meta.width, meta.height), h, meta };
}

/** [v4:town-accuracy] For every inland-water cell, the lowest land DEM value within r cells (Infinity if none). */
export function riverBanks(g, wat, dem, r) {
  const n = g.w * g.h, out = new Float32Array(n).fill(Infinity);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const k = j * g.w + i; if (wat[k] !== 2) continue;
    let m = Infinity;
    for (let dj = -r; dj <= r; dj++) { const jj = j + dj; if (jj < 0 || jj >= g.h) continue;
      for (let di = -r; di <= r; di++) { const ii = i + di; if (ii < 0 || ii >= g.w || di * di + dj * dj > r * r) continue; const q = jj * g.w + ii; if (wat[q] === 0 && dem[q] > 0.2 && dem[q] < m) m = dem[q]; } }
    out[k] = m;
  }
  return out;
}

export async function buildGrids(vt) {
  const core = await loadDem("core"), city = await loadDem("city");
  const G = {
    core: Grid.cover("core", -1736, -2112, 2612, 2340, 4),
    city: Grid.cover("city", -6512, -9328, 10848, 8448, 16),
  };
  const res = {};
  for (const [name, g] of Object.entries(G)) {
    const n = g.w * g.h;
    const wat = new Uint8Array(n);
    for (const f of vt.WA) fillRings(g, wat, [f.outer, ...f.holes], f.code === 5100 ? 1 : 2);
    // [v6:c8] reclaimed since the GSI photo: land, before the shore distance is derived (so sdf follows)
    const fill = new Uint8Array(n);
    for (const f of LAND_FILL) { fillRings(g, wat, [f.ring], 0); fillRings(g, fill, [f.ring], 1); }
    const fillMin = (x, z) => { let m = -Infinity; for (const f of LAND_FILL) if (inRing(x, z, f.ring)) m = Math.max(m, f.minH ?? 0); return m; };
    // ground from the DEMs (core preferred, city elsewhere); DEM sea / no-data = 0
    const dem = new Float32Array(n);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const x = g.cx(i), z = g.cz(j);
      dem[j * g.w + i] = inGrid(core.g, x, z, 4) ? bilinear(core.g, core.h, x, z) : bilinear(city.g, city.h, x, z);
    }
    // signed shore distance (m): + inside the sea, - on land
    const dLand = edt(g.w, g.h, (k) => wat[k] !== 1);
    const dSea = edt(g.w, g.h, (k) => wat[k] === 1);
    const sdf = new Int16Array(n), h = new Int16Array(n);
    // [v4:town-accuracy] river channels: the DEM over inland water is an interpolated lid (大川 at 気仙沼大橋 reads
    // 3.3-4.8 m inside the channel against 0.5-2 m banks), which drew the river as a raised grass strip. Carve every
    // inland-water cell to 2 m under the lowest bank within ~R cells (never below -1.5 m); the water surface itself is
    // drawn by town/rivers.js 1.2 m under that bank.
    const bank = riverBanks(g, wat, dem, Math.max(3, Math.round(40 / g.d)));
    for (let k = 0; k < n; k++) {
      const s = wat[k] === 1 ? (dLand[k] - 0.5) * g.d : -(dSea[k] - 0.5) * g.d;
      sdf[k] = Math.max(-3000, Math.min(3000, Math.round(s * 10)));
      let y = dem[k];
      if (wat[k] === 1) y = Math.min(y, -(0.8 + Math.min(13, Math.max(0, s) * 0.09)));   // seabed shelves down from the shore
      else if (wat[k] === 2) y = Math.min(y, Math.max(dem[k] - 0.8, -0.8), Number.isFinite(bank[k]) ? Math.max(-1.5, bank[k] - 2.0) : Infinity);
      else y = Math.max(y, 0.45, fill[k] ? fillMin(g.cx(k % g.w), g.cz((k / g.w) | 0)) : -Infinity);   // land never dips under the sea surface (DEM no-data = 0 along the shore); [v6:c8] a fill yard sits at least at its minH
      h[k] = Math.max(-32000, Math.min(32000, Math.round(y * 10)));
    }
    res[name] = { g, h, sdf, wat };
  }
  return res;
}

export async function writeGrids(res) {
  mkdirSync(OUT, { recursive: true });
  const parts = [], meta = { version: 1, units: { h: "decimetres (Int16)", sdf: "decimetres (Int16), + sea / - land", wat: "0 land, 1 sea, 2 inland water" }, grids: {} };
  let off = 0;
  for (const [name, r] of Object.entries(res)) {
    const m = { ...r.g.meta(), fields: {} };
    for (const [f, arr] of [["h", r.h], ["sdf", r.sdf], ["wat", r.wat]]) {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; }
      m.fields[f] = { offset: off, type: arr.constructor.name, length: arr.length };
      parts.push(bytes); off += bytes.byteLength;
    }
    meta.grids[name] = m;
  }
  meta.bytes = off;
  await Bun.write(join(OUT, "grids.bin"), new Blob(parts));
  await Bun.write(join(OUT, "grids.json"), JSON.stringify(meta, null, 1));
  return meta;
}

if (import.meta.main) {
  const t0 = performance.now();
  const vt = await Bun.file(join(CACHE, "vt.json")).json();
  const res = await buildGrids(vt);
  const meta = await writeGrids(res);
  // debug preview of the core grid
  const sharp = (await import("sharp")).default;
  const c = res.core, px = new Uint8Array(c.g.w * c.g.h * 3);
  for (let k = 0; k < c.g.w * c.g.h; k++) {
    const y = c.h[k] / 10, s = c.sdf[k] / 10;
    let col = c.wat[k] === 1 ? [40, 90 + Math.min(100, s), 160] : c.wat[k] === 2 ? [60, 160, 220] : [80 + Math.min(170, y * 1.2), 120 + Math.min(120, y), 70];
    if (Math.abs(s) < 3) col = [255, 255, 255];
    px.set(col, k * 3);
  }
  mkdirSync(join(ROOT, "shots/foundation"), { recursive: true });
  await sharp(px, { raw: { width: c.g.w, height: c.g.h, channels: 3 } }).png().toFile(join(ROOT, "shots/foundation/grids_core.png"));
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), bytes: meta.bytes, grids: Object.fromEntries(Object.entries(meta.grids).map(([k, v]) => [k, [v.w, v.h, v.d]])) }));
}
