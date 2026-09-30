// [v4:explore] The streamed core (V3-SPEC section 10, explorability): a 100 m tile grid over the z18 core (the extent
// of data/ortho/core.jpg and of the 4 m terrain grid), the street data of its far part (data/anime/explore.json,
// scripts/anime/build-explore.js) and the lot / road lists of every tile. Pure functions, no three.js: tested in
// test/v4-explore.test.js.
//
//   CORE, TILE, inCore(x, z), tileOf(x, z) -> { ix, iz, key }, tileCentre(ix, iz)
//   patchLots(L, X)        far lots of the core get their real footprint polygon and a frontage that also sees the
//                          alleys (explore.json); a quarter turn swaps the measured ridge axis with the frame
//   coreRoads(L, X)        every street of the core: layout hero / mid roads + explore.json's far roads (alleys too)
//   buildTiles(L, X, o)    Map key -> { key, ix, iz, cx, cz, mid: [lots], far: [lots], roads: [far roads] }
//   ringOrder(tiles, x, z) tile keys nearest first
export const TILE = 100;   // m: fine enough that the kit ring around the player stays small (L0 ~ 3 x 3 tiles)
export const CORE = { x0: -1730, z0: -2100, x1: 2600, z1: 2330 };
export const NX = Math.ceil((CORE.x1 - CORE.x0) / TILE), NZ = Math.ceil((CORE.z1 - CORE.z0) / TILE);
export const inCore = (x, z, pad = 0) => x >= CORE.x0 - pad && x <= CORE.x1 + pad && z >= CORE.z0 - pad && z <= CORE.z1 + pad;
export const tileKey = (ix, iz) => ix + ':' + iz;
export function tileOf(x, z) {
  const ix = Math.floor((x - CORE.x0) / TILE), iz = Math.floor((z - CORE.z0) / TILE);
  return { ix, iz, key: tileKey(ix, iz) };
}
export const tileCentre = (ix, iz) => [CORE.x0 + (ix + 0.5) * TILE, CORE.z0 + (iz + 0.5) * TILE];
/** Distance from (x, z) to the nearest point of a tile (0 inside). */
export function tileDist(t, x, z) {
  const x0 = CORE.x0 + t.ix * TILE, z0 = CORE.z0 + t.iz * TILE;
  const dx = Math.max(x0 - x, 0, x - (x0 + TILE)), dz = Math.max(z0 - z, 0, z - (z0 + TILE));
  return Math.hypot(dx, dz);
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** explore.json -> far lots of the core: true footprint, frontage that sees the alleys. Idempotent. -> patched count */
export function patchLots(L, X) {
  let n = 0;
  for (const id in X.lots) {
    const lot = L.lotById(id);
    if (!lot || lot.zone !== 'far' || lot.explore) continue;
    const [poly, rotY, w, d, roadId, dist] = X.lots[id];
    const quarter = ((Math.round(wrap(rotY - lot.obb.rotY) / (Math.PI / 2)) % 4) + 4) % 4;
    if (lot.roof?.ridge && quarter % 2 === 1) lot.roof.ridge = lot.roof.ridge === 'x' ? 'z' : 'x';
    lot.poly = poly;
    lot.obb.rotY = rotY; lot.obb.w = w; lot.obb.d = d;
    const s = Math.sin(rotY), c = Math.cos(rotY);
    lot.front = { rotY, roadId, x: +(lot.obb.cx + s * d / 2).toFixed(2), z: +(lot.obb.cz + c * d / 2).toFixed(2), dist };
    lot.explore = 1;
    n++;
  }
  return n;
}

/** Every street of the core: the layout's hero / mid roads and explore.json's far roads (full precision, alleys). */
export function coreRoads(L, X) {
  const out = L.ROADS.filter((r) => r.zone !== 'far' && inCore(r.pts[0][0], r.pts[0][1], 400));
  for (const r of X.roads) out.push(r);
  return out;
}
/** Roads for the whole city: the core set, plus the layout's far roads outside the core (minimap, drive graph). */
export function allRoads(L, X) {
  const ids = new Set(X.roads.map((r) => r.id));
  const out = L.ROADS.filter((r) => !(r.zone === 'far' && ids.has(r.id)));
  for (const r of X.roads) out.push(r);
  return out;
}

function midPoint(pts) {
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let s = len / 2;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= l) { const t = l ? s / l : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    s -= l;
  }
  return pts[pts.length - 1];
}

/**
 * The tiles of the core. A lot belongs to the tile of its box centre, a road to the tile of its middle.
 *   mid:   mid-zone lots (built once at load at the simplified level; full kit detail when you come near)
 *   far:   far lots of the core (instanced until you come near, then simplified on their real footprints, then kit)
 *   roads: explore.json's far roads (streets are laid when the tile streams in; hero / mid streets are town's)
 * Lots the harbour builds (landmark sites, piers) and lots `skip(lot)` claims (explore's own station) are left out.
 */
export function buildTiles(L, X, { skip = () => false } = {}) {
  const tiles = new Map();
  const get = (x, z) => {
    const t = tileOf(x, z);
    let e = tiles.get(t.key);
    if (!e) { const [cx, cz] = tileCentre(t.ix, t.iz); tiles.set(t.key, (e = { key: t.key, ix: t.ix, iz: t.iz, cx, cz, mid: [], far: [], roads: [] })); }
    return e;
  };
  for (const lot of L.LOTS) {
    if (lot.zone === 'hero') continue;
    const o = lot.obb;
    if (!inCore(o.cx, o.cz)) continue;
    if (lot.landmark || lot.kind === 'landmark' || lot.kind === 'shrine' || lot.kind === 'temple' || skip(lot)) continue;
    if (o.w < 2 || o.d < 2) continue;
    if (L.shoreDist(o.cx, o.cz) > 0.5) continue;
    get(o.cx, o.cz)[lot.zone === 'mid' ? 'mid' : 'far'].push(lot);
  }
  for (const r of X.roads) { const m = midPoint(r.pts); if (inCore(m[0], m[1])) get(m[0], m[1]).roads.push(r); }
  return tiles;
}

/** Tile keys sorted by distance from (x, z). */
export function ringOrder(tiles, x, z) {
  return [...tiles.values()].map((t) => [tileDist(t, x, z), t.key]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}
