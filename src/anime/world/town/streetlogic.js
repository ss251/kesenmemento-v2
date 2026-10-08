// [sys:12..15,18] The pure rules of the street builder (streets.js, signals.js): carriageway and sidewalk widths, the centre-line
// dash runs, crossing removals and the ◇ / lane-arrow placements. No three.js here: test/sys-streets.test.js runs them.
import { resample } from './geom.js';

/** Carriageway half-width from OSM (enrich/fold.js r.carriage: the way's width, or lanes x 3.0 m) when it is narrower than the
 *  GSI road edges: the rest of the road reserve is pavement, not asphalt; else null. */
export const carriageHalf = (r) => (r.carriage && r.kind !== 'alley' && r.kind !== 'bridge' && r.carriage < r.width - 0.8 ? r.carriage / 2 : null);

/** Sidewalk width on each side (m). Hero: from the OSM carriage when there is one, else by width. [sys:12] Mid roads too: the OSM
 *  carriage when present, else a road reserve of 9 m or more that is not an alley or a bridge (Earth 2026-03-11 shows pavements
 *  and kerbs on all of them): 3.0 m at 15 m or more, 2.5 m at 11 m or more, 2.0 m below. */
export function sidewalkOf(r) {
  if (r.kind === 'alley' || r.kind === 'bridge') return 0;
  const ch = carriageHalf(r);
  if (r.zone === 'hero') {
    if (ch) return Math.min(4.5, r.width / 2 - ch);
    return r.width < 7.5 ? 0 : r.width >= 11 ? 2.5 : r.width >= 9 ? 2.0 : 1.5;
  }
  if (ch) return Math.min(4.5, r.width / 2 - ch);
  if (r.width >= 9) return r.width >= 15 ? 3.0 : r.width >= 11 ? 2.5 : 2.0;
  return 0;
}
/** Half carriageway of a road (the asphalt), used by the ribbon, the junction fan and disc, and the zebra / stop-line spans. */
export const cwOf = (r) => r.width / 2 - sidewalkOf(r);
/** Height of the road surface over the terrain: hero (0.05 m) or mid (0.14 m; streets.js LIFT). `hero` = inside the hero zone + 40 m. */
export const roadLift = (hero) => (hero ? 0.05 : 0.14);

/**
 * [sys:15] Centre-line dashes from the dash boundaries, not from the drape samples: 5 m on, 5 m off for k = 0, 10, 20, ... < len.
 * S = resampled samples { s, x, z, tx, tz } along the road (any step). keep(p) says whether a point may be painted (junction cut,
 * water, other roads). A dash whose points all pass is emitted as pointAtS(sA), the samples strictly between, pointAtS(sB), then a
 * null; a dash with any point failing is skipped. -> a list of points and nulls for strip().
 */
export function dashSamples(S, keep, on = 5, period = 10) {
  const len = S[S.length - 1].s, out = [];
  const at = (s) => {
    for (let i = 1; i < S.length; i++) if (S[i].s >= s) { const a = S[i - 1], b = S[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz }; }
    const e = S[S.length - 1]; return { s, x: e.x, z: e.z, tx: e.tx, tz: e.tz };
  };
  for (let k = 0; k < len; k += period) {
    const sA = k, sB = Math.min(k + on, len);
    if (sB - sA < 0.05) continue;
    const pts = [at(sA)];
    for (const p of S) if (p.s > sA + 1e-6 && p.s < sB - 1e-6) pts.push(p);
    pts.push(at(sB));
    if (pts.every((p) => keep(p))) out.push(...pts, null);
  }
  return out;
}
/** Painted length of a dashSamples() result (m). */
export function dashLength(D) {
  let L = 0;
  for (let i = 1; i < D.length; i++) if (D[i] && D[i - 1]) L += Math.hypot(D[i].x - D[i - 1].x, D[i].z - D[i - 1].z);
  return L;
}

/** [sys:14] A crossing removed by an override ({ x, z, road }): does one cover this zebra (same road, within `rad` m of its centre)? */
export const crossingRemoved = (removed, roadId, x, z, rad = 6) => !!removed?.some((q) => q.road === roadId && Math.hypot(q.x - x, q.z - z) <= rad);

/**
 * [r3:11] The painted lines of a carriageway with `lanes` = [a, b]: a lanes on the +o side, b on the -o side (the convention of the hatched median: looking along the road from its first point to its last, +o is
 * the right). cw: the carriageway's half width. Lanes are equally wide (2 cw / (a + b)); the centre line sits where that puts it, o_c = cw - a x laneW, and a lane line stands on every boundary between lanes
 * of one side. [2, 2] -> centre 0, lane lines at +-cw / 2 (Earth 2026-03-11, r12692 at (111,-158): lines at -4.2, 0.4, 2.3, 3.6 round the edge lines at about +-5.5 to 6.5); [2, 1] -> the centre
 * at -cw / 3 and one lane line at +cw / 3. -> { centre, lines: [offsets of the dashed lane lines], laneW }
 */
export function laneLines(cw, lanes = [1, 1]) {
  const [a, b] = lanes, laneW = (2 * cw) / (a + b), centre = cw - a * laneW, lines = [];
  for (let k = 1; k < a; k++) lines.push(centre + k * laneW);
  for (let k = 1; k < b; k++) lines.push(centre - k * laneW);
  return { centre: Math.round(centre * 1000) / 1000, lines: lines.map((o) => Math.round(o * 1000) / 1000).sort((p, q) => p - q), laneW: Math.round(laneW * 1000) / 1000 };
}

/** Lane centres (lateral offsets o in the samples' frame n = (-tz, tx)) of the traffic that drives ALONG +t (dir = 1) or -t (dir = -1)
 *  on a two-way carriageway of half-width cw: left-hand traffic, so +t keeps to the left of its heading = o < 0. */
export function laneOffsets(cw, dir, lanes = 1) {
  const n = Math.max(1, lanes), w = cw / n, out = [];
  for (let k = 0; k < n; k++) out.push(-dir * (w * (k + 0.5)));
  return out;
}
/** Lanes per direction from the OSM tag / the carriageway. */
export const lanesPerDir = (r, cw) => Math.max(1, Math.min(4, r.lanes ? Math.floor(r.lanes / 2) || 1 : Math.round(cw / 3.0 / 1) || 1));

/**
 * [sys:18] Crossing-ahead ◇ (標示207, 1.5 m x 5 m, long axis along the road): one in each inbound lane at 30 m and 50 m before the
 * near edge of a zebra. road: { pts, ... }; at: the zebra centre {x, z}; half: the zebra's half length along the road (2 m); cw:
 * the carriageway half width; lanes: lanes per direction; S: the road resampled; lo / hi: the arc-length range that is free of
 * junction fans and other zebras (a placement beyond it is skipped). -> [{ x, z, tx, tz, s, dir, lane }] with (tx, tz) the direction of
 * travel (the glyph's far end points at the crossing).
 */
export function diamondSpots({ S, sC, half = 2, cw, lanes = 1, lo = 0, hi = Infinity, dists = [30, 50], dirs = [1, -1], skip = [] }) {
  const out = [];
  const pointAt = (s) => { for (let i = 1; i < S.length; i++) if (S[i].s >= s) { const a = S[i - 1], b = S[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz }; } return null; };
  for (const dir of dirs) for (const d of dists) {
    const s = sC - dir * (half + d);                       // before the near edge, in the direction of travel
    if (s < lo + 2.5 || s > hi - 2.5) continue;            // reaches back past the previous junction
    if (skip.some((q) => Math.abs(q - s) < 6)) continue;   // ... or past another zebra
    const p = pointAt(s); if (!p) continue;
    const nx = -p.tz, nz = p.tx;
    laneOffsets(cw, dir, lanes).forEach((o, lane) => out.push({ x: p.x + nx * o, z: p.z + nz * o, tx: p.tx * dir, tz: p.tz * dir, s, dir, lane, dist: d }));
  }
  return out;
}

/** [sys:18] Lane-direction arrows at an approach to a node where the lanes are designated. node: [x, z]; approach: the road's samples S
 *  leaving the node (s = 0 at the node); kinds: the arrow of each inbound lane from the driver's left to right ('S' straight, 'L', 'R',
 *  'SL', 'SR'); stop: the stop-line distance from the node. One arrow 5 m behind the stop line, repeated 30 m back while the approach
 *  is long enough. -> [{ x, z, tx, tz, kind }] with (tx, tz) the direction of travel. */
export function arrowSpots({ S, kinds, cw, stop, len = S[S.length - 1].s, repeat = 30, maxRepeats = 1 }) {
  const pointAt = (s) => { for (let i = 1; i < S.length; i++) if (S[i].s >= s) { const a = S[i - 1], b = S[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz }; } return null; };
  const out = [], n = kinds.length, w = cw / n;
  // traffic toward the node drives along -t (t points away from the node): its left side is o > 0 ... lane k from the driver's left
  for (let rep = 0; rep <= maxRepeats; rep++) {
    const s = stop + 5 + rep * repeat;
    if (s > len - 3) break;
    const p = pointAt(s); if (!p) continue;
    const nx = -p.tz, nz = p.tx;
    kinds.forEach((kind, k) => { const o = w * (k + 0.5); out.push({ x: p.x + nx * o, z: p.z + nz * o, tx: -p.tx, tz: -p.tz, kind }); });
  }
  return out;
}
/** The outline polygons (local, u across to the right, v ahead; metres) of a lane arrow, to be drawn as flat white polygons: an arrow
 *  1.1 m wide and 4.5 m long (標示 進行方向別通行区分). 'S' straight; 'L' / 'R' turn; 'SL' / 'SR' straight with a turn branch. */
export function arrowPolys(kind) {
  const W = 0.16, HEAD = 0.55;   // shaft half-width, head half-width
  const polys = [];
  const up = (u0, v0, v1) => polys.push([[u0 - W, v0], [u0 + W, v0], [u0 + W, v1], [u0 - W, v1]]);
  const tri = (a, b, c) => polys.push([a, b, c]);
  if (kind === 'S') { up(0, -2.25, 1.3); tri([-HEAD, 1.3], [HEAD, 1.3], [0, 2.25]); }
  else if (kind === 'L' || kind === 'R') {
    const s = kind === 'L' ? -1 : 1;
    up(0, -2.25, 0.4);                                           // shaft
    polys.push([[-W, 0.4 - W], [-W, 0.4 + W], [s * 1.0, 0.4 + W], [s * 1.0, 0.4 - W]]);   // arm to the side
    tri([s * 0.9, 0.4 + HEAD], [s * 0.9, 0.4 - HEAD], [s * 1.7, 0.4]);                                                          // head
  } else {   // SL / SR
    const s = kind === 'SL' ? -1 : 1;
    up(0, -2.25, 1.3); tri([-HEAD, 1.3], [HEAD, 1.3], [0, 2.25]);
    polys.push([[0, -0.2 - W], [0, -0.2 + W], [s * 0.9, 0.5 + W], [s * 0.9, 0.5 - W]]);
    tri([s * 0.8, 0.5 + HEAD * 0.8], [s * 0.8, 0.5 - HEAD * 0.8], [s * 1.55, 0.5]);
  }
  return polys.filter(Boolean);
}

// ------------------------------------------------------------------ the road graph and the marking plan
const nk = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
/** The road graph the way streets.js builds it: nodes at shared end points with R (the junction radius). */
export function roadNodes(roads) {
  const nodes = new Map();
  for (const r of roads) for (const [p, end] of [[r.pts[0], 0], [r.pts[r.pts.length - 1], 1]]) {
    const k = nk(p); let n = nodes.get(k);
    if (!n) nodes.set(k, (n = { x: p[0], z: p[1], roads: [], maxW: 0 }));
    n.roads.push({ r, end }); n.maxW = Math.max(n.maxW, r.width);
  }
  for (const n of nodes.values()) { n.deg = n.roads.length; n.R = n.deg >= 3 ? (n.maxW / 2) * 1.1 + 0.4 : n.maxW / 2; }
  return nodes;
}
const polyLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
/** Nearest point of a road to (x, z): { s (arc length), d, x, z } */
export function projectOnRoad(r, x, z) {
  let best = null, acc = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, l = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d) best = { s: acc + t * l, d, x: qx, z: qz };
    acc += l;
  }
  return best;
}
/** Does a hero junction arm carry a zebra (streets.js): the road is 7 m or wider, so is the widest arm, and the arm is long enough. */
export const armHasZebra = (r, widest, nodeR, len) => r.width >= 7 && widest >= 7 && len > nodeR + 8;
/**
 * [r3:8] Where the real zebra of a hero junction arm is, when the newest imagery puts it elsewhere than the default (centre at R + 3.2 from the node:
 * R ignores the real corner radius and the cross street's width, so the real bars can sit metres either side of it). `moved` is
 * L.CROSSING_OVR.moved: [{ x, z, road, zebraAt }], (x, z) the real zebra centre, zebraAt the arc length from the node to the zebra's centre; the arm is the one whose arc length to (x, z)
 * matches zebraAt (within 2.5 m). -> the arc length, or null (the default). The stop line follows (zebraAt + 4: s1 + 2).
 */
export function armZebraAt(moved, n, r, end) {
  if (!moved || !moved.length) return null;
  let len = 0; for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
  for (const q of moved) {
    if (q.road !== r.id) continue;
    const pr = projectOnRoad(r, q.x, q.z); if (!pr || pr.d > 8) continue;
    // the arm of this node: the arc length from the node to the real position is the zebraAt that was measured (a short link between two nodes has two arms: only one matches)
    const sNode = end ? len - pr.s : pr.s;
    if (Math.abs(sNode - q.zebraAt) <= 2.5) return q.zebraAt;
  }
  return null;
}

/**
 * [sys:18] Everything the markings pass places on a road list: ◇ before the zebras (the OSM / override crossings and the hero junction
 * arms, on carriageways of 7 m or more) and the lane arrows of the `arrows` data.
 *   zebras: [{ x, z, road }] mid-block / arm crossings (OSM L.CROSSINGS, L.CROSSING_OVR.zebras); removed: [{ x, z, road }];
 *   arrows: [{ road, node: [x, z], lanes: ['S', 'L', ...] }]; isHero(x, z): inside the hero zone (its junction arms are zebra'd by streets.js).
 * -> { diamonds: [{ x, z, tx, tz, road, dist }], arrows: [{ x, z, tx, tz, kind, road }] }
 */
export function planMarkings({ roads, zebras = [], removed = [], moved = [], arrows = [], isHero = () => false }) {
  const byId = new Map(roads.map((r) => [r.id, r])), nodes = roadNodes(roads);
  const diamonds = [], arrowOut = [];
  const nodeOf = (r, end) => nodes.get(nk(end ? r.pts[r.pts.length - 1] : r.pts[0]));
  const zebraS = new Map();   // road id -> arc lengths of its zebras (a diamond must not reach back over one)
  const addZ = (id, s) => { let l = zebraS.get(id); if (!l) zebraS.set(id, (l = [])); l.push(s); };
  // crossings on a road (mid-block, or an arm's zebra from the data)
  const mids = [];
  for (const z of zebras) {
    const r = byId.get(z.road); if (!r) continue;
    const q = projectOnRoad(r, z.x, z.z); if (!q || q.d > 8) continue;
    mids.push({ r, sC: q.s, force: !!z.diamonds }); addZ(r.id, q.s);
  }
  // hero junction arms with a zebra at s0 = R + 1.2 .. +4.0 from the node (centre R + 3.2)
  const arms = [];
  for (const n of nodes.values()) {
    if (n.deg < 3 || !isHero(n.x, n.z)) continue;
    const widest = Math.max(...n.roads.map((q) => q.r.width));
    for (const { r, end } of n.roads) {
      const len = polyLen(r.pts);
      if (!armHasZebra(r, widest, n.R, len)) continue;
      const zc = armZebraAt(moved, n, r, end) ?? (n.R + 3.2), sNode = end ? len - zc : zc;
      const cx = n.x, cz = n.z;
      if (removed.some((q) => q.road === r.id && Math.hypot(q.x - cx, q.z - cz) < n.R + 8 + 6)) continue;
      arms.push({ r, n, end, sC: sNode, len });
      addZ(r.id, sNode);
    }
  }
  const planFor = (r, sC, dirs, min = 6.9) => {
    const cw = cwOf(r); if (cw * 2 < min) return;
    const S = resample(r.pts, 2), len = S[S.length - 1].s, sN = nodeOf(r, 0), eN = nodeOf(r, 1);
    const lo = sN && sN.deg >= 3 ? sN.R + 2 : 0, hi = eN && eN.deg >= 3 ? len - eN.R - 2 : len;
    const others = (zebraS.get(r.id) || []).filter((q) => Math.abs(q - sC) > 1);
    for (const d of diamondSpots({ S, sC, cw, lanes: lanesPerDir(r, cw), lo, hi, dirs, skip: others })) diamonds.push({ x: d.x, z: d.z, tx: d.tx, tz: d.tz, road: r.id, dist: d.dist });
  };
  for (const m of mids) planFor(m.r, m.sC, [1, -1], m.force ? 0 : 5.4);   // a crossing: carriageway of 5.4 m or more (or flagged `diamonds` in the data)
  for (const a of arms) planFor(a.r, a.sC, [a.end ? 1 : -1]);   // inbound toward the node only (-1 = along -t: t points away from node at end 0)
  // lane arrows where the lanes are designated (data)
  for (const a of arrows) {
    const r = byId.get(a.road); if (!r) continue;
    const n = [...nodes.values()].find((q) => Math.hypot(q.x - a.node[0], q.z - a.node[1]) < 15 && q.roads.some((u) => u.r === r)); if (!n) continue;
    const arm = n.roads.find((u) => u.r === r), pts = arm.end ? r.pts.slice().reverse() : r.pts;
    const S = resample(pts, 1.5), cw = cwOf(r);
    const stop = (armZebraAt(moved, n, r, arm.end) ?? (n.R + 3.2)) + 4.0;   // the stop line of the hero arm (streets.js): the zebra's centre + 2 (s1) + 2
    for (const q of arrowSpots({ S, kinds: a.lanes, cw, stop })) arrowOut.push({ ...q, road: r.id });
  }
  return { diamonds, arrows: arrowOut };
}

const FOOT = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);   // OSM highway kinds without car markings
const pointAtS = (S, s) => { for (let i = 1; i < S.length; i++) if (S[i].s >= s) { const a = S[i - 1], b = S[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz }; } return null; };
/**
 * [sys:12] [sys:14] What streets.js paints on one arm of a node of 3 or more arms. n: a roadNodes() node; arm: { r, end }; widest: the widest arm;
 * o: { nodes (roadNodes map), removed, moved ([r3:8] real zebra positions, armZebraAt), sig (a signalised node), hero (the node is in the hero zone) }.
 *   zebra: hero arms of 7 m or more (a 4 m zebra starting 1.2 m past the fillet) | null; gone: an override removes it (no bars, no sign;
 *   the stop line stays on a signalised node); stopLine: the line behind the zebra; tomare: a minor approach to a main road gets its stop line, 止まれ
 *   and sign, unless it is an internal link of a channelised junction (its other end is also a node of 3 arms or more, within 40 m).
 */
export function armPlan(n, arm, widest, o = {}) {
  const { r, end } = arm, pts = end ? r.pts.slice().reverse() : r.pts, S = resample(pts, 1.0), len = S.length ? S[S.length - 1].s : 0;
  const out = { S, len, zebra: null, gone: false, stopLine: false, tomare: false, channelised: false };
  if (S.length < 3) return out;
  if (o.hero && armHasZebra(r, widest, n.R, len)) {
    const zc = armZebraAt(o.moved, n, r, end), s0 = (zc ?? (n.R + 3.2)) - 2.0, s1 = s0 + 4.0, p = pointAtS(S, (s0 + s1) / 2);   // [r3:8] zebraAt moves the zebra and its stop line
    if (p) { out.zebra = { s0, s1, p }; out.gone = crossingRemoved(o.removed, r.id, p.x, p.z); out.stopLine = !out.gone || !!o.sig; }
    return out;
  }
  if (r.width < 7 && widest >= 7 && len > n.R + 6 && r.width >= 3 && !FOOT.has(r.hw)) {
    const far = o.nodes ? o.nodes.get(nk(end ? r.pts[0] : r.pts[r.pts.length - 1])) : null;
    out.channelised = !!(far && far !== n && far.deg >= 3 && polyLen(r.pts) <= 40);
    out.tomare = !out.channelised; out.stopLine = out.tomare;
  }
  return out;
}
