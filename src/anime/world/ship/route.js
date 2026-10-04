// [ship] 第一昭福丸's departure route: from her send-off berth at the コの字岸壁 out under かなえ大橋 to the bay mouth.
// World axes: +X east, -Z north, metres, sea level y = 0. Headings (`yaw`) are three.js rotation.y values: the ship's
// local +Z (the bow) points along (sin yaw, cos yaw); yaw 0 = bow due south, -PI/2 = bow due west.
//
//   BERTH            { x, z, yaw, ... }   the send-off berth (ship centre at the waterline, midship s = 29.3 m)
//   OUTBOUND         [[x, z], ...]        water-only polyline, berth -> bay mouth (8.0 km)
//   OUTBOUND_PATH    polyline helper      { pts, len, at(s), dirAt(s), project(x, z, s0?, s1?) }
//   KANAE_CROSSING   { s, x, z, bridgeS, deckY, clearance, airDraft, margin }
//   SHOKO, MIRAI, BAY_MOUTH, BERTH_APPROACH_S, BERTH_RESERVE, routeClearance(path)
//
// ---------------------------------------------------------------------------------------------------------------------
// WHERE IS THE コの字岸壁? (two candidates disagreed; decided on the evidence below)
//   - OSM node 8660824619 "コの字岸壁" (tourism=viewpoint) sits at ENU (530, -100).
//   - The captain's dossier gives 38.901 N 141.580 E = ENU (434, 555). That point comes from the 農水省 漁港 DB entry
//     "気仙沼港（出漁準備岸壁）", whose address is 港町～魚市場前 (jl-db.nfaj.go.jp/location/040100784): the long quay
//     north of the fish market where the longliners lie stern-to (harbor/rows.js 'market-north'). That is the 出漁準備
//     岸壁, not the コの字岸壁.
//   - 気仙沼観光 (kesennuma-kanko.jp/sanma-defune2024) names, for the saury fleet's 大型サンマ漁船一斉出漁 event, the ceremony
//     venue "気仙沼市魚浜町コの字岸壁（セレモニー会場）" and, separately, the departure quay "港町出港岸壁": the ceremony quay is in
//     魚浜町, a separate place from 港町. A blog report (shintomisushi.com/blog/21997, 2024-03-15) has 第一昭福丸 at the コの字岸壁.
//     The berth is inferred from this; it is not stated for her.
//   - The GSI aerial (data/ortho/core.jpg, seamlessphoto z18, measured on a 10 m grid) shows, at the OSM node, a
//     rectangular reclaimed pier (corners ~ (450,-184) NW, (588,-148) NE, (550,-54) SE, (430,-106) SW) whose north, east
//     and south faces are all berths with ships alongside: a quay shaped like コ. The OSM viewpoint is on that pier.
//   => The コの字岸壁 is the 魚浜町 pier. Her berth is its EAST face, the outer deep-water face (101 m long, NE corner
//      (588, -148) to SE corner (550, -54) on the photo; the anime coastline L.shoreDist agrees within 2-3 m), where the
//      photo shows ~50 m ships lying alongside. She lies STARBOARD SIDE TO, bow to the south-south-west (toward the
//      harbour exit), so the starboard 舷門 and the gangway face the crowd on the quay, and she can leave bow first.
//      Fender gap 1.9 m (centre 6.5 m off the photographed face line): every hull sample point is >= 2.69 m from the
//      anime shoreline there.
// ---------------------------------------------------------------------------------------------------------------------
import * as L from '../layout.js';
import { KANAE } from '../harbor/real.js';
import { kanaeDeckY } from '../harbor/kanae.js';
import ROUTES from '../../../web/scene/boats/routes.json';

/** The ship dimensions the route checks need (the full particulars live in ship/shofukumaru1.js SHIP; same sources). */
export const SHIP_DIMS = {
  loa: 58.6,        // usufuku.jp, Usui slide, VesselFinder
  beam: 9.2,        // moulded breadth, JASNAOE Ship of the Year 2020, WCPFC, IATTC
  draft: 3.54,      // design draft d, JASNAOE SOY 2020
  airDraft: 21.0,   // waterline to the top of the radar lattice mast, measured on nendo's port profile (0.1226 m/px)
};

const FACE = { ne: [588, -148], se: [550, -54] };   // コの字岸壁 east face, measured on data/ortho/core.jpg
const FACE_U = (() => { const dx = FACE.se[0] - FACE.ne[0], dz = FACE.se[1] - FACE.ne[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();

/** The send-off berth: ship centre (waterline, midship) 50 m along the east face from its NE corner, 6.5 m off it. */
export const BERTH = {
  name: 'コの字岸壁', nameEn: 'Ko-no-ji Quay (U-shaped quay), Uohama-cho', place: '気仙沼市魚浜町',
  x: 575.3, z: -99.2,
  yaw: Math.round(Math.atan2(FACE_U[0], FACE_U[1]) * 1e4) / 1e4,   // -0.3843: bow SSW along the face
  side: 'starboard',                                               // starboard side to the quay (the gangway side)
  face: FACE, osm: 'n8660824619',
  /** a spot on the quay apron abreast of the gangway (for the send-off crowd and stepping ashore) */
  quay: [575.3 - FACE_U[1] * 14, -99.2 + FACE_U[0] * 14],
};

/** Circles [x, z, r] no moored boat may overlap (harbor/world.js moorRun `avoid`: centre distance < r + L/2). */
export const BERTH_RESERVE = [[BERTH.x, BERTH.z, 40], [556, -45, 26]];
/** True when a moored hull of length `len` centred at (x, z) would sit in the reserved berth. */
export function inBerthReserve(x, z, len = 0) { return BERTH_RESERVE.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + len / 2); }

/**
 * OUTBOUND: tools/anime/ship-route.mjs (2026-10-03). She first runs 80 m straight ahead along the quay face (a port
 * turn swings the stern to starboard, into the quay, so the stern clears the SE corner first), then turns to port on
 * a 150 m radius (her full-rudder circle is ~97 m, so the autopilot keeps rudder in hand). The inner harbour leg then
 * follows the deepest line of the 内湾-魚市場 channel (max L.shoreDist of each 40 m cross-section, x 760-1000), ~150 m
 * off the bows of the 出漁準備岸壁 rows and the market berths, and joins routes.json `main` (reversed) at
 * (1059.5, 1324.8). From there it is the arrivals' line shifted up to 30 m to its starboard side (COLREGs rule 9, keep
 * to starboard in a channel) wherever >= 50 m of water allows, so she meets the inbound AI boats port to port.
 * Water-only; >= 46 m from the shore beyond the berth approach (test/ship-sail.test.js samples it every 5 m).
 */
export const OUTBOUND = [[575.3, -99.2], [545.3, -25], [536.9, 3.7], [534.4, 33.6], [537.9, 63.3], [541.8, 77.8], [553.9, 105.2], [571.2, 129.6], [763.4, 330], [787, 425], [817.3, 518.8], [829.5, 563.8], [849.5, 657.5], [883.6, 832.5], [921.9, 982.5], [943.3, 1053.8], [987.3, 1188.8], [1015, 1256.3], [1033, 1290.9], [1041.1, 1303.1], [1062.8, 1326.6], [1406.4, 1518.1], [1453.4, 1542.1], [1483.4, 1560.7], [1547.2, 1604.6], [1570.8, 1624.5], [1594.5, 1648.4], [1625.9, 1688.6], [1641.7, 1713.7], [1656.3, 1742.6], [1665, 1766], [1671, 1790.3], [1677.3, 1827.2], [1681.5, 1872], [1706.1, 2273.8], [1705.6, 2306.3], [1693.5, 2517.5], [1693.9, 2557.6], [1995.1, 7426.8]];

/** Arclength from the berth within which the ship is still coming off the quay (clearance < 40 m allowed). */
export const BERTH_APPROACH_S = 100;

// ------------------------------------------------------------------------------------------------- polyline helper
/** Polyline helper over [[x, z], ...]: arclength sampling, direction, and a windowed projection (pure). */
export function makePath(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc[acc.length - 1];
  const seg = (s) => { s = Math.max(0, Math.min(len, s)); let lo = 0, hi = acc.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] <= s) lo = m; else hi = m; } return [lo, hi, s]; };
  const at = (s) => { const [lo, hi, ss] = seg(s); const t = (ss - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]); return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t]; };
  const dirAt = (s) => { const [lo, hi] = seg(s); const dx = pts[hi][0] - pts[lo][0], dz = pts[hi][1] - pts[lo][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  /** Nearest point to (x, z) with arclength in [s0, s1]: { s, d (unsigned distance), side (+ = port of the path) }. */
  function project(x, z, s0 = 0, s1 = len) {
    let best = { s: 0, d: Infinity, side: 0 };
    for (let i = 1; i < pts.length; i++) {
      if (acc[i] < s0 || acc[i - 1] > s1) continue;
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      const s = Math.max(s0, Math.min(s1, acc[i - 1] + Math.sqrt(l2) * t));
      // port of a heading (dx, dz) is local +X = (dz, -dx)
      if (d < best.d) best = { s, d, side: Math.sign((x - px) * dz - (z - pz) * dx) || 0 };
    }
    return best;
  }
  return { pts, acc, len, at, dirAt, project };
}
export const OUTBOUND_PATH = makePath(OUTBOUND);

/** Clearance of a path from the shore, sampled every `step` m from arclength `from`: { len, min, at: { s, x, z }, dry }. */
export function routeClearance(path, { step = 5, from = 0, shoreDist = L.shoreDist } = {}) {
  const P = Array.isArray(path) ? makePath(path) : path;
  let min = Infinity, at = null, dry = 0;
  for (let s = from; s <= P.len + 1e-6; s += step) {
    const [x, z] = P.at(s), d = shoreDist(x, z);
    if (d <= 0) dry++;
    if (d < min) { min = d; at = { s, x, z }; }
  }
  return { len: P.len, min, at, dry };
}

// ------------------------------------------------------------------------------------------------- landmarks on the way
/** Where the route crosses かなえ大橋's axis (KANAE.line), and the air-draft check under the girder. */
function kanaeCrossing() {
  const B = makePath(KANAE.line), P = OUTBOUND_PATH;
  for (let i = 1; i < P.pts.length; i++) {
    const [ax, az] = P.pts[i - 1], [bx, bz] = P.pts[i];
    for (let j = 1; j < B.pts.length; j++) {
      const [cx, cz] = B.pts[j - 1], [dx, dz] = B.pts[j];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const s = P.acc[i - 1] + Math.hypot(bx - ax, bz - az) * t, bridgeS = B.acc[j - 1] + Math.hypot(dx - cx, dz - cz) * u;
      const deckY = kanaeDeckY(bridgeS);
      // the hexagonal steel box girder: deck surface - 0.12 (surfacing) - 3.2 (girder depth), harbor/kanae.js `hex`
      const clearance = deckY - GIRDER;
      return { s, x, z, bridgeS, deckY, clearance, airDraft: SHIP_DIMS.airDraft, margin: clearance - SHIP_DIMS.airDraft, pylonS: KANAE.pylonS, pylonN: KANAE.pylonN };
    }
  }
  return null;
}
/** Deck surface to girder underside at かなえ大橋 (kanae.js: hex section 3.2 m deep, laid 0.12 m under the surface). */
export const GIRDER = 3.32;
export const KANAE_CROSSING = kanaeCrossing();

const onRoute = (p) => { const q = OUTBOUND_PATH.project(p.x, p.z); return { ...p, s: Math.round(q.s), offset: Math.round(q.d) }; };
/** 気仙沼商港 (OSM node 8666281417, the commercial port on 朝日町's east side), passed to starboard. */
export const SHOKO = onRoute({ name: '気仙沼商港', nameEn: 'Kesennuma Commercial Port', x: 1483.5, z: 2263.3, osm: 'n8666281417' });
/** 株式会社みらい造船, 朝日町7-5 (her builder; the 75 x 20 m shiplift), passed to starboard. */
export const MIRAI = onRoute({ name: 'みらい造船', nameEn: 'Mirai Shipbuilding', x: 1488, z: 1890 });
/** The bay mouth = the sea end of routes.json `main` (where the arrivals start); `r` = the gate radius. */
export const BAY_MOUTH = { name: '湾口', nameEn: 'bay mouth', x: ROUTES.main[0][0], z: ROUTES.main[0][1], r: 400 };
