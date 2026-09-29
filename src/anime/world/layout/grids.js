// [v3:foundation] Terrain / water grid sampler shared by layout.js (runtime) and scripts/anime (build).
// data/anime/grids.json + grids.bin (scripts/anime/build-grids.js): a 4 m core grid nested in a 16 m city grid.
// Each grid: h (Int16 dm, ground T.P. / seabed), sdf (Int16 dm, + sea / - land, distance to the shoreline), wat (0 land, 1 sea, 2 inland water).

export function openGrids(meta, buffer) {
  const G = {};
  for (const [name, m] of Object.entries(meta.grids)) {
    const f = m.fields;
    G[name] = {
      ...m,
      x1: m.x0 + m.w * m.d, z1: m.z0 + m.h * m.d,
      // arrays live in .data (m.h is the row count: never shadow it)
      data: {
        h: new Int16Array(buffer, f.h.offset, f.h.length),
        sdf: new Int16Array(buffer, f.sdf.offset, f.sdf.length),
        wat: new Uint8Array(buffer, f.wat.offset, f.wat.length),
      },
    };
  }
  return G;
}

function bil(g, arr, x, z) {
  let fx = (x - g.x0) / g.d - 0.5, fz = (z - g.z0) / g.d - 0.5;
  if (fx < 0) fx = 0; else if (fx > g.w - 1.0001) fx = g.w - 1.0001;
  if (fz < 0) fz = 0; else if (fz > g.h - 1.0001) fz = g.h - 1.0001;
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * g.w + i;
  const a = arr[k], b = arr[k + 1], c = arr[k + g.w], e = arr[k + g.w + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (e - c) * tx) * tz;
}
function nearest(g, arr, x, z) {
  let i = Math.floor((x - g.x0) / g.d), j = Math.floor((z - g.z0) / g.d);
  i = i < 0 ? 0 : i >= g.w ? g.w - 1 : i; j = j < 0 ? 0 : j >= g.h ? g.h - 1 : j;
  return arr[j * g.w + i];
}

const BLEND = 96; // metres over which the core grid fades into the city grid at its border

/** Sampler over both grids: { heightAt, shoreDist, isWater, waterClass, coreWeight }. */
export function makeSampler(G) {
  const core = G.core, city = G.city;
  const coreW = (x, z) => {
    const e = Math.min(x - core.x0, core.x1 - x, z - core.z0, core.z1 - z);
    if (e <= 8) return 0;
    if (e >= BLEND + 8) return 1;
    const t = (e - 8) / BLEND; return t * t * (3 - 2 * t);
  };
  const field = (name) => (x, z) => {
    const w = coreW(x, z);
    if (w >= 1) return bil(core, core.data[name], x, z) * 0.1;
    const c = bil(city, city.data[name], x, z) * 0.1;
    return w <= 0 ? c : c + (bil(core, core.data[name], x, z) * 0.1 - c) * w;
  };
  const heightAt = field('h');
  const shoreDist = field('sdf');
  return {
    grids: G,
    heightAt, shoreDist,
    isWater: (x, z) => shoreDist(x, z) > 0,
    waterClass: (x, z) => (coreW(x, z) > 0.5 ? nearest(core, core.data.wat, x, z) : nearest(city, city.data.wat, x, z)),
    coreWeight: coreW,
  };
}
