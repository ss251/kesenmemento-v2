// [ship] Generator for OUTBOUND in src/anime/world/ship/route.js (第一昭福丸 leaving the コの字岸壁 for the bay mouth).
// Run: env -u NODE_OPTIONS bun tools/anime/ship-route.mjs   (prints the polyline to paste; read-only on all data)
//
// 1. Inner harbour: hand-placed waypoints from the berth along the deepest line of the inner harbour (the max-clearance
//    x of every 40 m cross-section of L.shoreDist, printed by --sections), down to the market staging point.
// 2. Bay: src/web/scene/boats/routes.json `main` reversed (the arrivals' inbound line), shifted to its STARBOARD side
//    (COLREGs rule 9: keep to the starboard side of a narrow channel) by up to 30 m where the water allows >= 50 m
//    clearance, so the outbound ship and the inbound AI boats pass port to port instead of head-on.
// 3. Chaikin-smoothed twice and Douglas-Peucker simplified (1.0 m), then every 5 m checked: water and clearance.
import * as L from '../../src/anime/world/layout.js';
const ROUTES = await Bun.file(new URL('../../src/web/scene/boats/routes.json', import.meta.url)).json();

const BERTH = [575.3, -99.2], FACE_U = [-0.374789, 0.927110];
const INNER = [
  BERTH,
  // straight ahead along the quay face for 80 m: her stern clears the SE corner before she turns to port (a port turn
  // swings the stern to starboard, toward the quay)
  [BERTH[0] + FACE_U[0] * 40, BERTH[1] + FACE_U[1] * 40],
  [BERTH[0] + FACE_U[0] * 80, BERTH[1] + FACE_U[1] * 80],
  // then a port turn on a 150 m radius (her steady full-rudder circle is ~97 m: the autopilot keeps rudder in hand)
  ...turnArc([BERTH[0] + FACE_U[0] * 80, BERTH[1] + FACE_U[1] * 80], Math.atan2(FACE_U[0], FACE_U[1]), 150, [763.4, 330]),
  [763.4, 330], [790, 440], [822, 530],
  [842, 620], [862, 720], [880, 820], [905, 920], [932, 1020], [962, 1110], [990, 1200], [1030, 1290],
];
/** Points of a port turn of radius R from p0 at heading h0 (yaw convention) until the bow points at T (tangent). */
function turnArc(p0, h0, R, T) {
  const cx = p0[0] + R * Math.cos(h0), cz = p0[1] - R * Math.sin(h0);   // the centre lies to port (local +X)
  const P = (h) => [cx - R * Math.cos(h), cz + R * Math.sin(h)];
  const out = [];
  for (let h = h0 + 0.1; h < Math.PI; h += 0.1) {
    const p = P(h);
    out.push(p);
    if (Math.atan2(T[0] - p[0], T[1] - p[1]) - h < 0.1) break;
  }
  return out;
}
// the sea leg: routes.json main reversed, from (1059.5, 1324.8) just past the market staging point (995, 1295)
const main = ROUTES.main.slice().reverse();
const sea = main.slice(main.findIndex((p) => Math.hypot(p[0] - 1059.5, p[1] - 1324.8) < 1));

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= l) { out.push([ax + (bx - ax) * s / l, az + (bz - az) * s / l]); s += step; }
    carry = (carry + l) % step;
  }
  const e = pts[pts.length - 1], q = out[out.length - 1];
  if (Math.hypot(e[0] - q[0], e[1] - q[1]) > 0.5) out.push(e);
  return out;
}
// starboard offset along the bay part
const S = resample(sea, 10);
const off = S.map((p, i) => {
  const a = S[Math.max(0, i - 2)], b = S[Math.min(S.length - 1, i + 2)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
  const sx = -dz, sz = dx;   // starboard of heading (dx, dz): local -X
  for (const o of [30, 25, 20, 15, 10, 5, 0]) if (L.shoreDist(p[0] + sx * o, p[1] + sz * o) >= 50) return { o, sx, sz };
  return { o: 0, sx, sz };
});
// smooth the offsets (min over a window, then a moving average) so the line eases on and off the channel edge
const W = 12;
const omin = off.map((_, i) => Math.min(...off.slice(Math.max(0, i - W), i + W + 1).map((q) => q.o)));
const osm = omin.map((_, i) => { const w = omin.slice(Math.max(0, i - W), i + W + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
// ease in from 0 over the first 400 m (the line leaves the inner-harbour leg on the channel centre)
const shifted = S.map((p, i) => { const k = Math.min(1, (i * 10) / 400); const o = osm[i] * k; return [p[0] + off[i].sx * o, p[1] + off[i].sz * o]; });

let pts = INNER.concat(shifted);
function chaikin(P) { const out = [P[0]]; for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); } out.push(P[P.length - 1]); return out; }
// keep the straight run off the berth and the turn exact; smooth the rest
const KEEP = INNER.findIndex((p) => p[0] === 763.4) + 1;
pts = pts.slice(0, KEEP - 1).concat(chaikin(chaikin(pts.slice(KEEP - 1))));
function dp(P, tol) {
  if (P.length < 3) return P;
  const [ax, az] = P[0], [bx, bz] = P[P.length - 1]; const l = Math.hypot(bx - ax, bz - az) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((bx - ax) * (az - P[i][1]) - (ax - P[i][0]) * (bz - az)) / l; if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [P[0], P[P.length - 1]];
  return dp(P.slice(0, mi + 1), tol).slice(0, -1).concat(dp(P.slice(mi), tol));
}
pts = dp(pts, 1.0).map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);

// report
let s = 0, firstClear = null, minAfter = Infinity, minAt = null, dry = 0;
for (let i = 1; i < pts.length; i++) {
  const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
  for (let t = 0; t < l; t += 5) {
    const x = ax + (bx - ax) * t / l, z = az + (bz - az) * t / l, d = L.shoreDist(x, z);
    if (d <= 0) dry++;
    if (firstClear == null && d >= 40) firstClear = s + t;
    if (firstClear != null && d < minAfter) { minAfter = d; minAt = [Math.round(x), Math.round(z), Math.round(s + t)]; }
  }
  s += l;
}
console.error(JSON.stringify({ n: pts.length, len: Math.round(s), dry, firstClear, minAfter: Math.round(minAfter * 10) / 10, minAt, maxOffset: Math.max(...osm) }));
if (process.argv.includes('--sections')) for (let z = -160; z <= 1350; z += 40) { let best = -1e9, bx = 0; for (let x = 350; x <= 1300; x += 5) { const d = L.shoreDist(x, z); if (d > best) { best = d; bx = x; } } console.error(z, bx, Math.round(best)); }
console.log(JSON.stringify(pts));
