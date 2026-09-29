// Arrival timeline: which berth each vessel takes, when it leaves the bay mouth, and where it is at any hour.
// Pure functions (no three.js), shared by the renderer, the replay and the tests.
import ROUTES from "./routes.json" with { type: "json" };

export { ROUTES };
export const CRUISE = { pole: 6.2, seine: 6.0, longline: 5.7, saury: 5.7 };   // m/s (12, 11.7, 11, 11 kn) in the open bay
const SLOW = 2.6, CRAWL = 0.35;                                // m/s off the quay, and at the berth

/** a polyline [[x,z],...] -> { pts, cum, length } */
export function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}
/** point + unit tangent at arc length d */
export function sampleAt(pl, d) {
  const { pts, cum } = pl, D = Math.min(Math.max(d, 0), pl.length);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= D) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, t = (D - cum[lo]) / seg;
  const a = pts[lo], b = pts[hi];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg };
}

/** speed (m/s) at arc length d on a path of length D */
export function speedAt(d, D, cruise) {
  const r = D - d;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (r > 250) return SLOW + (cruise - SLOW) * sm(250, 1500, r);
  return CRAWL + (SLOW - CRAWL) * sm(0, 250, r);
}

/** travel-time table for a path: T[k] = seconds to reach k*step metres */
export function timeTable(D, cruise, step = 5) {
  const n = Math.ceil(D / step) + 1, T = new Float64Array(n);
  for (let k = 1; k < n; k++) { const d = Math.min(D, k * step); T[k] = T[k - 1] + (d - (k - 1) * step) / speedAt(d - step / 2, D, cruise); }
  return { T, step, total: T[n - 1] };
}
export function distanceAtTime(tab, secs) {
  const { T, step } = tab;
  if (secs <= 0) return 0;
  if (secs >= tab.total) return (T.length - 1) * step;
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= secs) lo = m; else hi = m; }
  return (lo + (secs - T[lo]) / (T[hi] - T[lo])) * step;
}

const MAIN = ROUTES.main;

/**
 * arrivals (server port.arrivals) -> voyages. Vessels sharing a published hour are spread 8 min apart inside it
 * (the co-op publishes hour windows; the label keeps the published text). Berths fill the quay row first (north to
 * south), then raft outside.
 */
export function planVoyages(arrivals, routes = ROUTES) {
  const list = (arrivals ?? []).map((a, i) => ({ a, i, h: a.eta?.h ?? parseHM(a.time) })).filter((v) => v.h != null).sort((p, q) => p.h - q.h || p.i - q.i);
  const berths = [...routes.berths].sort((p, q) => p.row - q.row || p.s - q.s);
  let lastH = -1;
  return list.map((v, k) => {
    const h = Math.max(v.h, lastH + 8 / 60); lastH = h;
    const berth = berths[k % berths.length];
    const kind = ["pole", "longline", "saury", "seine"].includes(v.a.kind) ? v.a.kind : kindFromType(v.a.type);
    const path = polyline([...MAIN, ...berth.leg.slice(1)]);
    const tab = timeTable(path.length, CRUISE[kind]);
    return { id: `${v.a.vessel ?? "boat"}#${v.i}`, arrival: v.a, kind, trim: TRIMS[k % TRIMS.length], berth, path, tab, berthH: h, departH: h - tab.total / 3600, seed: (k * 0.618) % 1 };
  });
}
const TRIMS = ["navy", "red", "navy", "teal", "red", "navy"];
export function kindFromType(type) { const t = String(type ?? ""); return /さんま|棒受/.test(t) ? "saury" : /はえ縄|まぐろ/.test(t) ? "longline" : /まき網/.test(t) ? "seine" : "pole"; }
export function parseHM(s) { const m = /^(\d{1,2}):(\d{2})/.exec(s ?? ""); return m ? +m[1] + +m[2] / 60 : null; }

/** where a voyage is at JST hour h -> { state: "before" | "under-way" | "moored", x, z, heading, speed01, d } */
export function voyageAt(v, h) {
  if (h < v.departH) return { state: "before" };
  if (h >= v.berthH) {
    const b = v.berth;
    return { state: "moored", x: b.pos[0], z: b.pos[1], heading: b.heading, speed01: 0, d: v.path.length };
  }
  const d = distanceAtTime(v.tab, (h - v.departH) * 3600);
  const p = sampleAt(v.path, d), ahead = sampleAt(v.path, d + 18);
  const hx = ahead.x - p.x, hz = ahead.z - p.z;
  return { state: "under-way", x: p.x, z: p.z, heading: Math.atan2(hx, hz), speed01: speedAt(d, v.path.length, CRUISE[v.kind]) / CRUISE.pole, d };
}

/** replay window: from the first departure to just after the last berthing */
export function replayWindow(voyages) {
  if (!voyages.length) return null;
  return { from: Math.min(...voyages.map((v) => v.departH)) - 0.05, to: Math.max(...voyages.map((v) => v.berthH)) + 0.25 };
}
