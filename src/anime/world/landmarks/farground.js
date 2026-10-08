// [v4:landmarks-B] The ground of the landmarks that lie beyond town's land-use radius (the mid zone + 150 m): the new
// city hall construction site (bare earth behind the white hoarding), the school yards of 気仙沼高, 九条小, 条南中,
// 鹿折中, 鹿折小 and 東陵高 (bare rammed earth instead of painted forest, the S1 of AUDIT.md), and the car parks and
// pitches next to the station, the city hospital and リアス・アーク. It reuses town's land-use painter
// (town/landuse.js, OSM polygons, © OpenStreetMap contributors) on only the polygons whose every vertex is outside
// town's radius, so nothing is drawn twice. The drawn polygon indices are published for other modules.
import * as THREE from 'three';
import { buildLanduse, LOOK } from '../town/landuse.js';
import { SCHOOLS, OSM, KAMEYAMA, URANOHAMA } from './sites.js';
import { OSHIMA } from '../harbor/real.js';   // [sys:24]
import { inCore } from '../explore/tiles.js';
import { resample } from '../town/geom.js';
import { dashSamples } from '../town/streetlogic.js';
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


// ------------------------------------------------------------------ [sys:24] the access roads of the far landmarks
// Roads of the far zone are drawn only inside explore's core, so the tour landmarks beyond it (リアス・アーク美術館, 亀山, 浦の浜, 大島大橋's ends) stood on
// bare grass and forest with no access road or car park. Earth 2026-03-11: リアス・アーク sits inside a paved loop with a car park north of the building,
// 亀山 has the winding access road beside the track and a large car park, 浦の浜 a 4-lane road along the quay and the 県道 junction behind the terminal.
// farAnchors() and farLanduse() stay as they are (explore's 'taken' set and test/v4-landmarks-b.test.js rely on them).
export const FAR_ROAD_R = 300;
const centroidOf = (poly) => poly.reduce((a, q) => [a[0] + q[0] / poly.length, a[1] + q[1] / poly.length], [0, 0]);
/** The anchors the road ribbons gather round: farAnchors() + the 亀山 summit and car park, the 浦の浜 terminal and the two 大島大橋 ends (imported, not typed in). */
export function farRoadAnchors() {
  return [...farAnchors(), KAMEYAMA.summit, centroidOf(KAMEYAMA.parking.poly), centroidOf(URANOHAMA.terminal.poly), OSHIMA.a, OSHIMA.b];
}
/** The 浦の浜 apron (harbor / landmarks uranohama): the road sits above it and wins its z-fight. */
export const URANOHAMA_APRON = { x0: 3282, x1: 3440, z0: 4450, z1: 4630 };
/** Road segments of the far zone to draw: a segment is kept when an endpoint lies within R of an anchor and it is not inside explore's core (which draws its own). -> [{ road, a, b }] */
export function farRoadSegments(L, anchors = farRoadAnchors(), R = FAR_ROAD_R) {
  const out = [];
  for (const r of L.ROADS) {
    if (r.zone !== 'far' || r.kind === 'bridge' || r.tunnel || !r.pts || r.pts.length < 2) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      if (inCore((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      if (anchors.some(([x, z]) => Math.hypot(a[0] - x, a[1] - z) <= R || Math.hypot(b[0] - x, b[1] - z) <= R)) out.push({ road: r, a, b });
    }
  }
  return out;
}
/** Height of a far road at (x, z): the ground + 0.10 m; on the 浦の浜 apron max(ground, 0.9) + 0.10; ramped to the deck end height within 25 m of a 大島大橋 end. */
export function farRoadY(L, x, z) {
  const g = L.groundAt(x, z), A = URANOHAMA_APRON;
  let y = (x >= A.x0 && x <= A.x1 && z >= A.z0 && z <= A.z1 ? Math.max(g, 0.9) : g) + 0.10;
  [[OSHIMA.a, OSHIMA.endY[0]], [OSHIMA.b, OSHIMA.endY[1]]].forEach(([e, ey]) => {
    const d = Math.hypot(x - e[0], z - e[1]);
    if (d < 25) { const k = 1 - d / 25, w = k * k * (3 - 2 * k); y = y + (ey - y) * w; }
  });
  return y;
}

export function buildFarRoads(ctx, anchors = farRoadAnchors()) {
  const L = ctx.L, segs = farRoadSegments(L, anchors);
  if (!segs.length) return { segments: 0 };
  const P = [], N = [], C = [], I = [], LP = [], LI = [];
  const col = new THREE.Color('#6c6e73');   // town's mid-zone asphalt (streets.js: the asphalt texture x 0.84)
  const strip = (pts, hw, push) => {
    let prev = null;
    for (const s of pts) {
      if (!s) { prev = null; continue; }
      const nx = -s.tz, nz = s.tx, a = [s.x + nx * -hw, s.z + nz * -hw], b = [s.x + nx * hw, s.z + nz * hw];
      const ia = push(a[0], farRoadY(L, a[0], a[1]), a[1]), ib = push(b[0], farRoadY(L, b[0], b[1]), b[1]);
      if (prev) push.quad(prev[0], prev[1], ib, ia);
      prev = [ia, ib];
    }
  };
  const pushA = (x, y, z) => { P.push(x, y, z); N.push(0, 1, 0); C.push(col.r, col.g, col.b); return P.length / 3 - 1; };
  pushA.quad = (a, b, c, d) => I.push(a, b, c, a, c, d);
  const pushL = (x, y, z) => { LP.push(x, y + 0.02, z); return LP.length / 3 - 1; };
  pushL.quad = (a, b, c, d) => LI.push(a, b, c, a, c, d);
  for (const { road, a, b } of segs) {
    const S = resample([a, b], 4);
    if (S.length < 2) continue;
    strip(S, road.width / 2, pushA);
    if (road.width >= 6.5) {   // a white centre line on the 6.5 and 8 m roads (dashes 5 m on, 5 m off)
      const D = dashSamples(S, () => true);
      strip(D, 0.075, pushL);
    }
  }
  const root = new THREE.Group(); root.name = 'far-roads';
  const mk = (pos, nrm, col, idx, mat, name) => {
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm || new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; root.add(m);
  };
  // polygonOffset -1.4: stronger than the 浦の浜 apron's -0.6 (landuse-surfaces), so the road above it wins the z-fight
  mk(P, N, C, I, ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03, polygonOffset: -1.4 }), 'far-roads-asphalt');
  mk(LP, null, null, LI, ctx.mat.toon('#efeee9', { paint: 0.01, polygonOffset: -2 }), 'far-roads-lines');
  ctx.addStatic(root);
  return { segments: segs.length, roads: new Set(segs.map((s) => s.road.id)).size, tris: I.length / 3 + LI.length / 3 };
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
  let roads = null;
  try { roads = buildFarRoads(ctx); } catch (e) { console.warn('[landmarks] far roads', e); }   // [sys:24]
  return { ...r, indices: idx, roads };
}
