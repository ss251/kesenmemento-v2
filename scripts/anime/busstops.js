// [sys:17] Bus stops of the layout: every OSM highway=bus_stop / public_transport=platform node, and every stop_position on a BRT way
// (enrich.json busStops), put on the LEFT kerb of the road a bus really uses (Japan drives on the left).
//
//   * A city bus stop is snapped to the nearest road that a bus uses: a way of an OSM route=bus relation (enrich.json busWays), else the
//     nearest national / prefectural / city road of 5.5 m or more (never an alley or a footway). It then stands on that road's kerb, on
//     the side of the road it is mapped on (the kerb of the direction it serves): lateral offset = half carriageway + 0.6 m, or its own
//     mapped offset when that is already on the pavement (up to 3 m behind the kerb).
//   * A BRT stop is a stop_position on a one-way BRT way: the platform is offset from the way perpendicular to it, to the LEFT of the
//     direction of travel, by half the carriageway + about 1 m (BRT_HALF + 1.0): 内湾入口 eastbound way 1451261720 (stop 4004183275 at
//     -422.1, -306.3) puts its platform at about (-423.5, -309.5), westbound way 1451261719 (13310205926 at -421.2, -303.8) at about
//     (-419.8, -300.6).
// Pure (tested in test/sys-busstops.test.js). Coordinates: ENU metres, x east, z south.
import { cwOf } from "../../src/anime/world/town/streetlogic.js";

export const BRT_HALF = 2.2;      // half the carriageway of the one-way BRT lane (m); the platform adds 1.0 m
const r1 = (v) => Math.round(v * 10) / 10;

/** left of a heading (dx, dz) in (x east, z south): (dz, -dx) */
export const leftOf = (dx, dz) => [dz, -dx];

function nearestOnPolyline(pts, x, z) {
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, l = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d) best = { d, x: qx, z: qz, tx: dx / l, tz: dz / l };
  }
  return best;
}
const BUS_ROAD_KINDS = new Set(["national", "prefectural", "city"]);

/**
 * stops: enrich.json busStops; busWays: enrich.json busWays ([{ pts }]); roads: layout ROADS (id, pts, width, kind, zone, carriage?).
 * -> [{ id, kind: 'bus' | 'brt', name, nameEn, operator, shelter, covered, bench, x, z, rotY, road, src }]
 */
export function placeBusStops(stops, busWays, roads) {
  const out = [];
  const roadNear = (x, z, r = 12) => {
    let best = null;
    for (const rd of roads) {
      if (rd.kind === "alley" || rd.kind === "bridge" || rd.width < 3) continue;
      const q = nearestOnPolyline(rd.pts, x, z); if (q.d > r) continue;
      if (!best || q.d < best.d) best = { ...q, road: rd };
    }
    return best;
  };
  for (const s of stops) {
    const [px, pz] = s.p;
    if (s.kind === "brt") {
      const [lx, lz] = leftOf(s.dir[0], s.dir[1]), off = BRT_HALF + 1.0;
      const x = px + lx * off, z = pz + lz * off;
      // the platform's front faces the road: the travel direction is s.dir; the totem stands with its panel toward oncoming buses
      out.push({ id: s.osm, kind: "brt", name: s.name ?? null, nameEn: s.nameEn ?? null, operator: s.operator ?? null, x: r1(x), z: r1(z), rotY: Math.round(Math.atan2(-s.dir[0], -s.dir[1]) * 1000) / 1000, way: s.way, road: null,
        dir: s.dir, src: "osm stop_position on BRT way " + s.way + "; platform offset to the left of travel by half a carriageway + 1 m" });
      continue;
    }
    // a bus way first, else a main road
    let way = null;
    for (const w of busWays || []) { const q = nearestOnPolyline(w.pts, px, pz); if (q.d <= 30 && (!way || q.d < way.d)) way = { ...q, w }; }
    let rd = null, q = null;
    if (way) { const r = roadNear(way.x, way.z, 10); if (r) { rd = r.road; q = way; } }
    if (!rd) { const rr = roadNear(px, pz, 30); if (rr && BUS_ROAD_KINDS.has(rr.road.kind) && rr.road.width >= 5.5) { rd = rr.road; q = rr; } }
    // measure the kerb from the layout road itself (the OSM way and the GSI centre-line differ by a few metres)
    if (rd) { const own = nearestOnPolyline(rd.pts, px, pz); if (own) q = own; }
    if (!rd || !q) { out.push({ id: s.osm, kind: "bus", name: s.name ?? null, nameEn: s.nameEn ?? null, operator: s.operator ?? null, shelter: s.shelter ?? null, covered: s.covered ?? null, bench: s.bench ?? null, x: r1(px), z: r1(pz), rotY: 0, road: null, src: "osm (no bus road found: left where it is mapped)" }); continue; }
    // side of the road the stop is mapped on, relative to the matched centre-line direction (tx, tz)
    const [lx, lz] = leftOf(q.tx, q.tz);
    const onLeft = (px - q.x) * lx + (pz - q.z) * lz >= 0;   // the node is on the LEFT of the way's direction: the bus travels along it
    const sgn = onLeft ? 1 : -1;                            // outward from the road centre-line on the stop's side
    const cw = cwOf(rd), dist = Math.hypot(px - q.x, pz - q.z);
    const off = Math.max(cw + 0.6, Math.min(dist, cw + 3));
    const x = q.x + lx * sgn * off, z = q.z + lz * sgn * off;
    // the bus serving this kerb travels along the way (kerb on its left) or against it; the plate faces the oncoming bus
    const tdx = onLeft ? q.tx : -q.tx, tdz = onLeft ? q.tz : -q.tz;
    out.push({ id: s.osm, kind: "bus", name: s.name ?? null, nameEn: s.nameEn ?? null, operator: s.operator ?? null, shelter: s.shelter ?? null, covered: s.covered ?? null, bench: s.bench ?? null,
      x: r1(x), z: r1(z), rotY: Math.round(Math.atan2(-tdx, -tdz) * 1000) / 1000, road: rd.id, src: way ? "osm bus-route way, left kerb of " + rd.id : "osm, left kerb of the nearest main road " + rd.id });
  }
  return out;
}
