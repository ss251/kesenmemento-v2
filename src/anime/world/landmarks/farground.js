// [v4:landmarks-B] The ground of the landmarks that lie beyond town's land-use radius (the mid zone + 150 m): the new
// city hall construction site (bare earth behind the white hoarding), the school yards of 気仙沼高, 九条小, 条南中,
// 鹿折中, 鹿折小 and 東陵高 (bare rammed earth instead of painted forest, the S1 of AUDIT.md), and the car parks and
// pitches next to the station, the city hospital and リアス・アーク. It reuses town's land-use painter
// (town/landuse.js, OSM polygons, © OpenStreetMap contributors) on only the polygons whose every vertex is outside
// town's radius, so nothing is drawn twice. The drawn polygon indices are published for other modules.
import { buildLanduse, LOOK } from '../town/landuse.js';
import { SCHOOLS, OSM } from './sites.js';
import { centroid } from './kit.js';
import { makeLotIndex, makeRoadIndex } from '../town/common.js';

/** Town's land-use disc (town/index.js: the mid zone circle + 150 m). */
export const TOWN_LU = { cx: 250, cz: 150, r: 1100 + 150 };

export function farAnchors() {
  const a = [];
  for (const s of Object.values(SCHOOLS)) a.push(centroid(s.poly));
  for (const k of ['station', 'newCityHallSite', 'cityHospital', 'riasArk']) a.push(centroid(OSM[k].poly));
  return a;
}

export function farLanduse(L, R = 260) {
  const anchors = farAnchors();
  const out = [];
  (L.LANDUSE || []).forEach((lu, i) => {
    if (!LOOK[lu.cls] || !(lu.ring?.length > 2)) return;
    if (!lu.ring.every(([x, z]) => Math.hypot(x - TOWN_LU.cx, z - TOWN_LU.cz) >= TOWN_LU.r)) return;
    if (!lu.ring.some(([x, z]) => anchors.some(([ax, az]) => Math.hypot(x - ax, z - az) < R))) return;
    out.push(i);
  });
  return out;
}

export function buildFarGround(ctx) {
  const L = ctx.L;
  const idx = farLanduse(L);
  const set = new Set(idx);
  const Lx = Object.assign({}, L, { LANDUSE: (L.LANDUSE || []).filter((_, i) => set.has(i)) });
  const c2 = Object.create(ctx); c2.L = Lx;
  const anchors = farAnchors(), near = (x, z, r) => anchors.some(([ax, az]) => Math.hypot(x - ax, z - az) < r);
  const lotIdx = makeLotIndex(L.LOTS.filter((l) => l.landmark !== 'newCityHallSite' && near(l.obb.cx, l.obb.cz, 450)));
  const roadIdx = makeRoadIndex(L.ROADS.filter((r) => r.pts.some(([x, z]) => near(x, z, 500))));
  const r = buildLanduse(c2, { inside: () => true, heroIn: () => false, lotIdx, roadIdx, low: ctx.quality?.name === 'low', trees: ctx.services.environment?.trees });
  return { ...r, indices: idx };
}
