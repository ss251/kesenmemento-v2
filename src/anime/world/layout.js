// [v3:foundation] World contract for Kesennuma Living City v3 (V3-SPEC section 3). Every module consumes this.
// Metres, +X east, -Z north, +Y up (T.P.). ENU origin 38.9060 N 141.5750 E: x = (lon - 141.575) * 86744, z = -(lat - 38.906) * 111014.
// Model forward = local +Z; rotY = three.js rotation.y (0 faces south/+Z, PI north, +PI/2 east, -PI/2 west).
//
// Data (precomputed, deterministic): data/anime/grids.{json,bin} (terrain + sea, scripts/anime/build-grids.js) and
// data/anime/layout.json (zones, water, quays, roads, lots, pole runs, spots, tour; scripts/anime/build-layout.js).
// Loaded once with top-level await: fetch() in the browser (page-relative data/anime/, or globalThis.__KLC_DATA__),
// Bun.file() in bun (tests, tools/anime/check.mjs).
import { AERIAL_LANDUSE } from './landuse_aerial.js';
import { LOT_FIX, applyLotFix, applyPlaceFix } from './lotfix.js';   // [v4:polish1]
import { openGrids, makeSampler } from './layout/grids.js';
import { sunPosition, dayOfYear } from './layout/sun.js';
import { onceByKey } from '../core/once.js';   // [ui-c2] one request per data file (loadData below)

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
/** Load a JSON file from data/anime/ (modules use this for their own precomputed data).
 *  [ui-c2] In the browser explore.json is fetched ONCE per page: environment, the schools and explore each asked for it (2 MB) and each paid for its own request (three, mobile review F24).
 *  Later callers get the first one's promise, so the same parsed object; the modules build one after another and none of them writes to it before the next has read it. A failed request is
 *  forgotten (the next caller tries again). Under bun (tests, tools) every call still reads the file. */
const loadJsonOnce = onceByKey((name) => load(name, "json"));
const SHARED = new Set(["explore.json"]);   // (only the file with several users: the others have one, and a shared parse would stay on the heap for the life of the page)
export const loadData = (name) => (IS_BROWSER && SHARED.has(name) ? loadJsonOnce(name) : load(name, "json"));
const [GMETA, GBUF, D, AGSI] = await Promise.all([load('grids.json', 'json'), load('grids.bin', 'bin'), load('layout.json', 'json'), load('areas-gsi.json', 'json').catch(() => null)]);   // [sys:22] areas-gsi.json: the HUD's 町丁 grid
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
/** [v5:detail] Ground pads: places where the 4 m DEM still carries building bulk or the old seawall that the author's
 *  photos show as a flat pavement. Inside `ring` the ground is clamped to at most `max` (T.P. m), blended back to the DEM
 *  over `feather` metres outside the ring. */
export const GROUND_PADS = [
  // 迎's SE end: the ANCHOR shopfront, its deck and the plaza corner stand on a flat pavement at T.P. ~2.3 (IMG_0824-0827,
  // 0820); the DEM rises to 5 m there (the pre-2018 wall and 迎's own bulk), which buried the shopfront in a mound
  { ring: [[-17.4, 43.4], [-9.5, 50.1], [-3.9, 47.4], [2, 44], [6, 52], [6, 62], [-6, 64], [-20, 62], [-24, 50], [-20, 44]], max: 2.3, feather: 2.5, src: 'author photos IMG_0824-0827, 0820' },
  // [v6:rebuild] the plaza south of 内湾 and its forecourt up to the bleachers' far block: the photo survey puts the paving at
  // T.P. 1.83 (the cage foot, the ring and winch feet; docs/anime/survey/minami.md); the DEM's 2.1-3.6 m there is the
  // pre-2018 ground and the old wall. The pad sits 13 cm under the paving (harbor/minami5.js) so the plaza landuse surface (+4 cm) stays below it. [v6:fix1] The ring runs out east to the quay edge (IMG_0809-0812: paving to the railing).
  { ring: [[-9.5, 50.1], [-3.9, 47.4], [-9.9, 31.1], [-9.5, 14], [4, 10], [20, 22], [29.8, 23.8], [35, 32.2], [41.4, 45.7], [42.5, 45], [48.6, 55.3], [40.2, 64.8], [23.9, 72.6], [7.6, 67.8], [-4.5, 74.9]], max: 1.70, feather: 2.0, src: 'author photos IMG_0807-0813 via the photo survey: data/survey/minami/features.json (cage.foot, ring, winch.foot)' },
  // [cafe-rst] the room of café RST (floor T.P. 2.62, explore/cafe-rst.js) stands where the DEM still carries 迎's old bulk: it rises from 2.2 m at the
  // street wall to 4.2 m at the rear wall, i.e. through the room's floor. The ground under the room (inside the hollow building, hidden by its walls) is
  // clamped to the street's level; the ring is the room's footprint plus the wall thickness, reaching the bay face at the rear (data: the room frame of
  // harbor/cafe-front.js FRONT, x_r -0.6..10.6, y_r -0.5..8.3).
  { ring: [[-16.1, 44.1], [-8.5, 52.1], [-3.5, 47.6], [-7.1, 42.1], [-9.7, 38]], max: 2.3, feather: 1.0, src: 'author photos IMG_1047 (the room) over the surveyed ANCHOR face: harbor/cafe-front.js, explore/cafe-rst.js' },
].map((p) => { const xs = p.ring.map((q) => q[0]), zs = p.ring.map((q) => q[1]); return { ...p, x0: Math.min(...xs) - p.feather, x1: Math.max(...xs) + p.feather, z0: Math.min(...zs) - p.feather, z1: Math.max(...zs) + p.feather }; });
function padded(x, z, h) {
  for (const p of GROUND_PADS) {
    if (h <= p.max || x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    const R = p.ring; let inside = false, d = Infinity;
    for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
      const [xi, zi] = R[i], [xj, zj] = R[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi, ez = zj - zi, t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez || 1)));
      d = Math.min(d, Math.hypot(x - xi - ex * t, z - zi - ez * t));
    }
    const k = inside ? 1 : Math.max(0, 1 - d / p.feather);
    if (k > 0) h = h + (p.max - h) * (k * k * (3 - 2 * k));
  }
  return h;
}
/** Terrain y (T.P. m) anywhere in the city bbox: ground on land, a smooth seabed under the sea. Bilinear, C0-smooth. */
export function heightAt(x, z) { return padded(x, z, S.heightAt(x, z)); }
/** Signed distance to the sea shoreline (m): + in the sea, - on land (clamped to +-300). */
export function shoreDist(x, z) { return S.shoreDist(x, z); }
/** Sea test (the bay and open sea; rivers and ponds are not sea — see waterClass). */
export function isWater(x, z) { return S.shoreDist(x, z) > 0; }
/** 0 land, 1 sea, 2 inland water (rivers, ponds) — nearest cell. */
export function waterClass(x, z) { return S.waterClass(x, z); }
/** Ground a thing can stand on: terrain on land, the sea surface over water. */
export function groundAt(x, z) { const h = heightAt(x, z); return isWater(x, z) ? Math.max(h, SEA.level) : h; }

/** Sea polygons: { zone: 'mid'|'far', ring: [[x,z],...], holes: [...] } (GSI WA 5100, clipped at z16 tile borders). */
export const WATER = D.water;
/** Coastline pieces (<= 24 m): { a, b, top (quay top y), kind: 'quay'|'seawall'|'promenade'|'beach'|'rocks', zone }. */
export const QUAYS = D.quays;

// ------------------------------------------------------------------ roads
/** { id, pts, width (m; measured from GSI road edges where available), kind, zone, rank, code } */
export const ROADS = D.roads;
const roadMap = new Map(ROADS.map((r) => [r.id, r]));
export const roadById = (id) => roadMap.get(id) || null;
/** [v4:explore] Make extra roads findable by id (explore.json: the far part of the core at full precision, alleys
 *  included); ROADS itself is left as it is. */
export function registerRoads(list) { for (const r of list) roadMap.set(r.id, r); }

// ------------------------------------------------------------------ lots (one per GSI building footprint)
/** Sakura lot convention: lotFrame(lot) puts the origin at the frontage centre with local +Z facing the street;
 *  the building occupies local x in [-obb.w/2, obb.w/2], z in [-obb.d, 0]. */
function expandFar(F) {
  const out = [];
  for (const r of F.rows) {
    const [id, cx, cz, w, d, rotY, storeys, height, groundY, k, sh, rc, wc, area, sx, rg, baseY] = r;   // [sys:6] baseY (16)
    const c = Math.cos(rotY), s = Math.sin(rotY), hw = w / 2, hd = d / 2;
    // local x axis = (cos, -sin), local z axis = (sin, cos) for three.js rotation.y
    const P = (lx, lz) => [Math.round((cx + lx * c + lz * s) * 10) / 10, Math.round((cz - lx * s + lz * c) * 10) / 10];
    const lot = { id, zone: 'far', kind: F.kinds[k], poly: [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)],
      obb: { cx, cz, w, d, rotY }, front: { rotY, roadId: null, x: P(0, hd)[0], z: P(0, hd)[1], dist: null },
      storeys, height, groundY, baseY: baseY ?? groundY, roof: { shape: F.shapes[sh], color: F.roofColors[rc] }, wall: F.walls[wc], seed: hashId(id), area };
    // [v4:data] value sources ("h/kind/roof/color"), the aerial ridge axis, and names for the named far buildings
    if (F.srcs && sx != null) { const [h, kind, roof, color] = F.srcs[sx].split('/'); lot.src = { h, kind, roof, color }; }
    if (rg) lot.roof.ridge = rg === 1 ? 'x' : 'z';
    const x = F.extra?.[id];
    // [v4:landmarks-A] 'landmark' too (a far lot under a harbour landmark, e.g. the fish market's D棟)
    if (x) { for (const key of ['name', 'nameEn', 'use', 'facility', 'landmark', 'facade']) if (x[key] != null) lot[key] = x[key]; if (x.nameSrc) (lot.src ||= {}).name = x.nameSrc; if (x.wallSrc) (lot.src ||= {}).wall = x.wallSrc; }
    // [v4:overrides] the provenance of a far lot changed by data/anime/overrides (docs/anime/OVERRIDES.md)
    if (x?.ovr) { lot.src ||= {}; lot.src.ovr = x.ovr; lot.src.ovrWhy = x.ovrWhy; }
    out.push(lot);
  }
  return out;
}
function hashId(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; }
/** hero + mid lots first (full footprint poly), then far lots (poly = the OBB). */
export const LOTS = D.lots.concat(expandFar(D.farLots));
D.farLots.rows = null;   // [v4:phone] the packed rows are garbage once expanded (layout.js keeps D alive: ~20 MB)
const lotMap = new Map(LOTS.map((l) => [l.id, l]));
// [v4:polish1] reference corrections (the Plaza Hotel on its bluff, the station's name): world/lotfix.js
// [v4:overrides] a lot changed by an override file keeps the override's values (they were folded in after LOT_FIX)
for (const id of Object.keys(LOT_FIX)) { const l = lotMap.get(id); if (l && !l.src?.ovr) applyLotFix(l); }
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
/** Nickname boxes for the HUD toast (the places a visitor knows by a nickname: the inner bay, the cape, the fish market). [sys:22] The 魚町 /
 *  八日町 / 南町 boxes are gone: they sat on 入沢 / 港町 / 柏崎 / 陣山 (a walker at (-150, -200) was told 八日町 in 入沢); the 町丁 comes from
 *  areaAtGsi below. */
export const AREAS = [
  { name: '内湾', x0: 20, x1: 330, z0: -150, z1: 60 },
  { name: '神明崎', x0: 320, x1: 380, z0: -160, z1: -10 },
  { name: '魚市場', x0: 420, x1: 800, z0: 500, z1: 1000 },
];
/** [sys:22] The 町丁 name at (x, z) from the GSI 逆ジオコーダ grid (data/anime/areas-gsi.json, 25 m): the nearest cell; '' over the sea, outside the
 *  grid, or when the file is missing (main.js then asks explore's search.areaAt). 出典：国土地理院. */
export function areaAtGsi(x, z) {
  if (!AGSI) return '';
  const i = Math.round((x - AGSI.x0) / AGSI.step), j = Math.round((z - AGSI.z0) / AGSI.step);
  if (i < 0 || j < 0 || i >= AGSI.nx || j >= AGSI.nz) return '';
  const k = AGSI.idx[j * AGSI.nx + i];
  return k >= 0 ? AGSI.names[k] : '';
}
/** [sys:21] The census small areas (町丁, e-Stat 令和2年国勢調査) as ENU polygons: { ja, en, ring, holes?, bbox }. */
export const AREA_POLYS = (D.areas || []).map((a) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of a.ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { ...a, bbox: [x0, z0, x1, z1] }; });
const inRing = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
/** The census area containing (x, z), or null (over the sea, or outside 04205). */
export function areaPolyAt(x, z) {
  for (const a of AREA_POLYS) {
    const b = a.bbox; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
    if (inRing(x, z, a.ring) && !(a.holes || []).some((h) => inRing(x, z, h))) return a;
  }
  return null;
}
export const NAMES = { city: '気仙沼', cityEn: 'Kesennuma', bay: '内湾', market: '気仙沼市魚市場' };

// ------------------------------------------------------------------ [v4:data] real-world layers (OSM + GSI, scripts/anime/enrich)
// Lot fields added by the enrichment (all optional): name, nameEn, use ('shop:seafood', 'amenity:restaurant', ...),
// facility (GSI category: school, post_office, ...), osm (OSM id, hero/mid lots), roof.ridge ('x' along the frontage,
// 'z' front to back; only when measured), roof.photo (the aerial roof colour before grading), roof.conf, and
// src = { h, kind, roof, color, name?, wall? } with values 'osm' | 'aerial' | 'gsi' | 'landmark' | 'derived' | 'ref' (LOT_FIX) | 'override' (data/anime/overrides).
/** Land use areas: { cls: park|field|cemetery|school|parking|sport|forest|grass|scrub|beach|rock|religious|industrial|
 *  commercial|construction|aquaculture|water, type (OSM tag value), name, ring, holes, area }, painted in array order. */
export const LANDUSE = (D.landuse || []).concat(AERIAL_LANDUSE);   // [v4:polish2] + areas traced on the aerial photo
/** Rivers and streams (OSM centre-lines): { name (大川, 神山川, ...), nameEn, kind: river|stream|canal|drain|ditch, pts, width? (m, from the GSI water areas), tunnel? } */
export const RIVERS = D.rivers || [];
/** Real named places for labels and search: named buildings, OSM POIs, GSI facilities and place names.
 *  { id, name, nameEn, cat, group?, x, z, lot (lot id or null), src: 'osm'|'gsi' } */
// [v6:c11] OSM names that start with （旧） mark a former use (（旧）気仙沼魚市場前郵便局 moved to 仲町 in 2021; （旧）気仙沼南町郵便局
// is a plot whose OSM description says 現在建物はない): neither is a place today. build-layout.js add() drops them too.
export const FORMER_NAME = /^[（(]旧[）)]/;
export const PLACES = (D.places || []).filter((p) => !FORMER_NAME.test(p.name || ''));
applyPlaceFix(PLACES);   // [v4:polish3]
/** Traffic signals { x, z, roadId } and crossings { x, z, kind, signals, roadId } from OSM. */
export const SIGNALS = D.signals || [];
export const CROSSINGS = D.crossings || [];
/** [sys:14] [sys:18] Crossings and lane arrows read from the newest imagery (data/anime/overrides `crossings` / `arrows`): zebras to paint, `removed`
 *  zebras the hero junction rule must not paint, and { road, node, lanes } lane arrows. */
export const CROSSING_OVR = { zebras: [], removed: [], moved: [], arrows: [], ...(D.crossingOvr || {}) };
/** Named bridges { name, kind, pts } and rail { kind, name, pts, bridge, tunnel } from OSM. */
export const BRIDGES = D.bridges || [];
export const RAIL = D.rail || [];
/** [sys:17] Bus stops { id, kind: 'bus' | 'brt', name, nameEn, operator, shelter?, covered?, bench?, x, z, rotY, road } on the left kerb of the road a bus uses. */
export const BUS_STOPS = D.busStops || [];
/** [craft:C13] Show the generated credit line with Japanese punctuation. Official source titles stay; ASCII `;` and `()` do not. */
export function presentCredits(raw) {
  return String(raw || '出典：国土地理院')
    .replace(/\s*;\s*/g, '、')
    .replace(/\s*\(([^)]+)\)/g, '（$1）')
    .replace(/([ぁ-んァ-ヶー一-鿿　-〿（）]) +(?=[ぁ-んァ-ヶー一-鿿])/g, '$1');   // （） are U+FF08/09, outside U+3000–303F
}
/** Data credit line required by the sources (OSM: © OpenStreetMap contributors). */
export const CREDITS = presentCredits(D.credits || '出典：国土地理院');
/** [v4:overrides] Prop placements from data/anime/overrides ({ type, x, z, rotY, ovr }; town/props.js builds them). */
export const PROPS = D.props || [];
/** [v4:overrides] The override files folded into this layout ({ file, cell, bbox, sources, note, counts }). */
export const OVERRIDES = D.overrides || [];
const norm = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
/** Search PLACES by a JA or EN query (NFKC, case-insensitive substring; exact and prefix matches first). */
export function findPlaces(query, limit = 20) {
  const q = norm(query); if (!q) return [];
  const hits = [];
  for (const p of PLACES) {
    const a = norm(p.name), b = norm(p.nameEn);
    const s = a === q || b === q ? 0 : a.startsWith(q) || b.startsWith(q) ? 1 : a.includes(q) || b.includes(q) ? 2 : -1;
    if (s >= 0) hits.push([s, a.length, p]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return hits.slice(0, limit).map((h) => h[2]);
}

/** Raw terrain/sea grids ({ core, city }: x0, z0, d, w, h, data: { h (dm), sdf (dm), wat }) for GPU textures. */
export const GRIDS = S.grids;
