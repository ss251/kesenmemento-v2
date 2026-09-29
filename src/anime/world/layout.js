// [v3:foundation] World contract for Kesennuma Living City v3 (V3-SPEC section 3). Every module consumes this.
// Metres, +X east, -Z north, +Y up (T.P.). ENU origin 38.9060 N 141.5750 E: x = (lon - 141.575) * 86744, z = -(lat - 38.906) * 111014.
// Model forward = local +Z; rotY = three.js rotation.y (0 faces south/+Z, PI north, +PI/2 east, -PI/2 west).
//
// Data (precomputed, deterministic): data/anime/grids.{json,bin} (terrain + sea, scripts/anime/build-grids.js) and
// data/anime/layout.json (zones, water, quays, roads, lots, pole runs, spots, tour; scripts/anime/build-layout.js).
// Loaded once with top-level await: fetch() in the browser (page-relative data/anime/, or globalThis.__KLC_DATA__),
// Bun.file() in bun (tests, tools/anime/check.mjs).
import { openGrids, makeSampler } from './layout/grids.js';
import { sunPosition, dayOfYear } from './layout/sun.js';

export const ORIGIN = { lat: 38.9060, lon: 141.5750 };
export const M_PER_DEG = { lon: 86744.0, lat: 111014.0 };
export const llToXZ = (lat, lon) => [(lon - ORIGIN.lon) * M_PER_DEG.lon, -(lat - ORIGIN.lat) * M_PER_DEG.lat];
export const xzToLl = (x, z) => ({ lat: ORIGIN.lat - z / M_PER_DEG.lat, lon: ORIGIN.lon + x / M_PER_DEG.lon });

// ------------------------------------------------------------------ load
const IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof fetch === 'function' && typeof Bun === 'undefined';
async function load(name, kind) {
  if (IS_BROWSER) {
    const base = globalThis.__KLC_DATA__ || new URL('data/anime/', location.href).href;
    const r = await fetch(base + name);
    if (!r.ok) throw new Error(`layout: ${name} ${r.status}`);
    return kind === 'json' ? r.json() : r.arrayBuffer();
  }
  const url = new URL('../../../data/anime/' + name, import.meta.url);
  const f = Bun.file(url);
  return kind === 'json' ? f.json() : new Uint8Array(await f.arrayBuffer()).slice().buffer;   // own copy: fast typed-array access
}
/** URL of a file in data/anime/ (browser: page-relative or globalThis.__KLC_DATA__; bun: a file:// URL). */
export function dataURL(name) {
  if (IS_BROWSER) return (globalThis.__KLC_DATA__ || new URL("data/anime/", location.href).href) + name;
  return new URL("../../../data/anime/" + name, import.meta.url).href;
}
/** Load a JSON file from data/anime/ (modules use this for their own precomputed data). */
export const loadData = (name) => load(name, "json");
const [GMETA, GBUF, D] = await Promise.all([load('grids.json', 'json'), load('grids.bin', 'bin'), load('layout.json', 'json')]);
const S = makeSampler(openGrids(GMETA, GBUF));

// ------------------------------------------------------------------ zones
/** hero: full Sakura street detail (walkable) · mid: simplified anime buildings · far: the city bbox, instanced. */
export const ZONES = D.zones;
export function zoneOf(x, z) {
  if (Math.hypot(x - ZONES.hero.cx, z - ZONES.hero.cz) <= ZONES.hero.r) return 'hero';
  if (Math.hypot(x - ZONES.mid.cx, z - ZONES.mid.cz) <= ZONES.mid.r) return 'mid';
  return 'far';
}

// ------------------------------------------------------------------ terrain & sea
export const SEA = { level: 0.0 };
/** Terrain y (T.P. m) anywhere in the city bbox: ground on land, a smooth seabed under the sea. Bilinear, C0-smooth. */
export function heightAt(x, z) { return S.heightAt(x, z); }
/** Signed distance to the sea shoreline (m): + in the sea, - on land (clamped to +-300). */
export function shoreDist(x, z) { return S.shoreDist(x, z); }
/** Sea test (the bay and open sea; rivers and ponds are not sea — see waterClass). */
export function isWater(x, z) { return S.shoreDist(x, z) > 0; }
/** 0 land, 1 sea, 2 inland water (rivers, ponds) — nearest cell. */
export function waterClass(x, z) { return S.waterClass(x, z); }
/** Ground a thing can stand on: terrain on land, the sea surface over water. */
export function groundAt(x, z) { const h = S.heightAt(x, z); return isWater(x, z) ? Math.max(h, SEA.level) : h; }

/** Sea polygons: { zone: 'mid'|'far', ring: [[x,z],...], holes: [...] } (GSI WA 5100, clipped at z16 tile borders). */
export const WATER = D.water;
/** Coastline pieces (<= 24 m): { a, b, top (quay top y), kind: 'quay'|'seawall'|'promenade'|'beach'|'rocks', zone }. */
export const QUAYS = D.quays;

// ------------------------------------------------------------------ roads
/** { id, pts, width (m; measured from GSI road edges where available), kind, zone, rank, code } */
export const ROADS = D.roads;
const roadMap = new Map(ROADS.map((r) => [r.id, r]));
export const roadById = (id) => roadMap.get(id) || null;

// ------------------------------------------------------------------ lots (one per GSI building footprint)
/** Sakura lot convention: lotFrame(lot) puts the origin at the frontage centre with local +Z facing the street;
 *  the building occupies local x in [-obb.w/2, obb.w/2], z in [-obb.d, 0]. */
function expandFar(F) {
  const out = [];
  for (const r of F.rows) {
    const [id, cx, cz, w, d, rotY, storeys, height, groundY, k, sh, rc, wc, area] = r;
    const c = Math.cos(rotY), s = Math.sin(rotY), hw = w / 2, hd = d / 2;
    // local x axis = (cos, -sin), local z axis = (sin, cos) for three.js rotation.y
    const P = (lx, lz) => [Math.round((cx + lx * c + lz * s) * 10) / 10, Math.round((cz - lx * s + lz * c) * 10) / 10];
    out.push({ id, zone: 'far', kind: F.kinds[k], poly: [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)],
      obb: { cx, cz, w, d, rotY }, front: { rotY, roadId: null, x: P(0, hd)[0], z: P(0, hd)[1], dist: null },
      storeys, height, groundY, roof: { shape: F.shapes[sh], color: F.roofColors[rc] }, wall: F.walls[wc], seed: hashId(id), area });
  }
  return out;
}
function hashId(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; }
/** hero + mid lots first (full footprint poly), then far lots (poly = the OBB). */
export const LOTS = D.lots.concat(expandFar(D.farLots));
const lotMap = new Map(LOTS.map((l) => [l.id, l]));
export const lotById = (id) => lotMap.get(id) || null;
export const lotsInZone = (zone) => LOTS.filter((l) => l.zone === zone);

/** { x, y, z, rotY, w, d }: origin at the frontage centre (y = lot.groundY), local +Z faces the street. */
export function lotFrame(lot) {
  const o = lot.obb, s = Math.sin(o.rotY), c = Math.cos(o.rotY);
  return { x: o.cx + s * o.d / 2, y: lot.groundY, z: o.cz + c * o.d / 2, rotY: o.rotY, w: o.w, d: o.d };
}
/** Lot-local (lx, lz) -> world [x, z] (lz <= 0 goes into the lot). */
export function lotToWorld(lot, lx, lz) {
  const f = lotFrame(lot), s = Math.sin(f.rotY), c = Math.cos(f.rotY);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

// ------------------------------------------------------------------ poles, spots, tour, hero
/** Utility pole runs along hero/mid streets (28-36 m spacing, sidewalk side, never inside a footprint or the sea). */
export const POLE_RUNS = D.poleRuns;
/** Named anchors (see BUILDER-GUIDE): ukimido, isuzuTorii, isuzuShrine, shinmeizaki, pier7, ferryPiers, fishMarket,
 *  innerBay, kanae {a,b,towers,deckY}, oshima {a,b,deckY}, anbaLookout, promenade[], vending[], cats[]. */
export const SPOTS = D.spots;
/** Tour stops from data/landmarks.json, re-framed: { id, ja, en, enu, drone: { pos, look }, walk: { x, z, yaw, pitch } | null } */
export const TOUR = D.tour;
/** First frame. drone = the 16:30 view over the inner bay toward 安波山; walk = the promenade. */
export const HERO = D.hero;

// ------------------------------------------------------------------ sun
export const DEMO_DOY = dayOfYear(new Date(Date.UTC(2026, 9, 10)));   // 2026-10-10, the demo day
/** Unit direction TO the sun at Kesennuma (38.906 N 141.575 E) for a JST hour and day of year: [x, y, z]. */
export function sunDirAt(hoursJST, doy = DEMO_DOY) { return sunPosition(hoursJST, doy).dir; }
export { sunPosition };
/** Default sun (16:30 on the demo day), for Sakura core code that reads L.SUN_DIR. */
export const SUN_DIR = sunDirAt(16.5);

// ------------------------------------------------------------------ Sakura-core compatibility
/** Player bounds (walk): the city bbox less a 200 m margin ([v3:fix] was the mid square, which clamped the walk spots
 *  at the bridges; the far zone is coarse but walkable). */
export const WORLD = { play: { x0: ZONES.far.x0 + 200, x1: ZONES.far.x1 - 200, z0: ZONES.far.z0 + 200, z1: ZONES.far.z1 - 200 } };
/** Area names for the HUD toast (rough boxes, place names from GSI annotations). */
export const AREAS = [
  { name: '内湾', x0: 20, x1: 330, z0: -150, z1: 60 },
  { name: '神明崎', x0: 320, x1: 380, z0: -160, z1: -10 },
  { name: '魚町', x0: 60, x1: 320, z0: -260, z1: -150 },
  { name: '八日町', x0: -250, x1: 60, z0: -300, z1: -60 },
  { name: '南町', x0: -100, x1: 250, z0: 60, z1: 260 },
  { name: '魚市場', x0: 420, x1: 800, z0: 500, z1: 1000 },
];
export const NAMES = { city: '気仙沼', cityEn: 'Kesennuma', bay: '内湾', market: '気仙沼市魚市場' };

/** Raw terrain/sea grids ({ core, city }: x0, z0, d, w, h, data: { h (dm), sdf (dm), wat }) for GPU textures. */
export const GRIDS = S.grids;
