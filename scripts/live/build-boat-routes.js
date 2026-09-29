// Water-only boat routes, baked once from the GSI DEM and the GSI coastline (no runtime terrain needed by the boats).
//   env -u NODE_OPTIONS nice -n 15 bun run scripts/live/build-boat-routes.js [--debug <png>]
// -> src/web/scene/boats/routes.json
//
// Method
//   1. A 10 m water grid over the bay: a cell is water when the DEM (core 3.7 m grid where it covers, city 8 m
//      elsewhere; sea = 0 in both) is <= 0.05 m, and no coastline segment (data/buildings/coast.json) passes through it.
//   2. Clearance = distance to the nearest non-water cell (two-pass chamfer transform).
//   3. A* from the bay mouth up the 西湾 (the wide channel between the mainland and 大島; v1's route too),
//      under the 気仙沼湾横断橋 (かなえ大橋) into the inner bay, to a staging point off the fish-market quay. Cost prefers the channel
//      centre; cells with < MIN_CLEAR clearance are forbidden.
//   4. Line-of-sight simplification, Catmull-Rom resampling every 15 m, then verification: every sample has
//      clearance >= MIN_CLEAR and no segment crosses a coastline segment. The build fails otherwise.
//   5. Berths along the market quay (the straight GSI coastline edge the ortho shows boats moored against), two rows
//      (alongside the quay, and rafted outside), each with its own docking leg, also verified.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const OUT = join(ROOT, "src/web/scene/boats/routes.json");
const CELL = 10, MIN_CLEAR = 30;
const GRID = { x0: -600, z0: -800, x1: 9000, z1: 8400 };      // covers the inner bay .. the open sea SE of 大島

function loadDem(name) {
  const meta = JSON.parse(readFileSync(join(ROOT, `data/terrain/${name}.json`), "utf8"));
  const b = readFileSync(join(ROOT, `data/terrain/${name}.f32`));
  return { meta, h: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) };
}
export function makeHeight(core, city) {
  const at = (g, x, z) => {
    const c = Math.round((x - g.meta.x0) / g.meta.dx), r = Math.round((z - g.meta.z0) / g.meta.dz);
    if (c < 0 || r < 0 || c >= g.meta.width || r >= g.meta.height) return null;
    return g.h[r * g.meta.width + c];
  };
  return (x, z) => { const v = core ? at(core, x, z) : null; return v ?? at(city, x, z) ?? 999; };
}

// segment intersection (proper or touching)
export function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}
export function coastIndex(lines, cell = 100) {
  const grid = new Map(), segs = [];
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const a = l[i], b = l[i + 1], k = segs.length; segs.push([a, b]);
    for (let gx = Math.floor(Math.min(a[0], b[0]) / cell); gx <= Math.floor(Math.max(a[0], b[0]) / cell); gx++)
      for (let gz = Math.floor(Math.min(a[1], b[1]) / cell); gz <= Math.floor(Math.max(a[1], b[1]) / cell); gz++) {
        const key = gx * 65536 + gz; let arr = grid.get(key); if (!arr) grid.set(key, (arr = [])); arr.push(k);
      }
  }
  /** true when segment p-q crosses any coastline segment */
  const crosses = (p, q) => {
    const seen = new Set();
    for (let gx = Math.floor(Math.min(p[0], q[0]) / cell); gx <= Math.floor(Math.max(p[0], q[0]) / cell); gx++)
      for (let gz = Math.floor(Math.min(p[1], q[1]) / cell); gz <= Math.floor(Math.max(p[1], q[1]) / cell); gz++)
        for (const k of grid.get(gx * 65536 + gz) ?? []) { if (seen.has(k)) continue; seen.add(k); if (segX(p, q, segs[k][0], segs[k][1])) return true; }
    return false;
  };
  return { segs, crosses };
}

function buildGrid(height, coast) {
  const W = Math.ceil((GRID.x1 - GRID.x0) / CELL), H = Math.ceil((GRID.z1 - GRID.z0) / CELL);
  const water = new Uint8Array(W * H);
  const cx = (i) => GRID.x0 + (i + 0.5) * CELL, cz = (j) => GRID.z0 + (j + 0.5) * CELL;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // all four sub-samples must be sea, so a 10 m cell never straddles a quay edge
    const x = cx(i), z = cz(j), q = CELL * 0.3;
    water[j * W + i] = height(x - q, z - q) <= 0.05 && height(x + q, z - q) <= 0.05 && height(x - q, z + q) <= 0.05 && height(x + q, z + q) <= 0.05 ? 1 : 0;
  }
  // coastline cells are land
  for (const [a, b] of coast.segs) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.4)) + 1;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      const i = Math.floor((x - GRID.x0) / CELL), j = Math.floor((z - GRID.z0) / CELL);
      if (i >= 0 && j >= 0 && i < W && j < H) water[j * W + i] = 0;
    }
  }
  // clearance (metres) by a two-pass 3-4 chamfer transform
  const INF = 1e9, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = water[k] ? INF : 0;
  const a1 = CELL, a2 = CELL * Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (!d[k]) continue; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a1); if (j > 0) v = Math.min(v, d[k - W] + a1);
    if (i > 0 && j > 0) v = Math.min(v, d[k - W - 1] + a2); if (i < W - 1 && j > 0) v = Math.min(v, d[k - W + 1] + a2); d[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; if (!d[k]) continue; let v = d[k];
    if (i < W - 1) v = Math.min(v, d[k + 1] + a1); if (j < H - 1) v = Math.min(v, d[k + W] + a1);
    if (i < W - 1 && j < H - 1) v = Math.min(v, d[k + W + 1] + a2); if (i > 0 && j < H - 1) v = Math.min(v, d[k + W - 1] + a2); d[k] = v;
  }
  const idx = (x, z) => { const i = Math.floor((x - GRID.x0) / CELL), j = Math.floor((z - GRID.z0) / CELL); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
  const clearAt = (x, z) => { const k = idx(x, z); return k < 0 ? 0 : d[k]; };
  return { W, H, water, clear: d, idx, clearAt, cx, cz };
}

// nearest cell with the most clearance within r metres of (x, z)
function bestNear(G, x, z, r) {
  let best = null;
  for (let dz = -r; dz <= r; dz += CELL) for (let dx = -r; dx <= r; dx += CELL) {
    if (dx * dx + dz * dz > r * r) continue;
    const c = G.clearAt(x + dx, z + dz); if (!best || c > best.c) best = { x: x + dx, z: z + dz, c };
  }
  return best;
}

function astar(G, from, to) {
  const { W, H, clear } = G;
  const s = G.idx(from[0], from[1]), t = G.idx(to[0], to[1]);
  const g = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const tx = t % W, tz = (t / W) | 0;
  const hfn = (k) => Math.hypot((k % W) - tx, ((k / W) | 0) - tz) * CELL;
  g[s] = 0; push(s, hfn(s));
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === t) break;
    const i = k % W, j = (k / W) | 0;
    for (const [di, dj, w] of N) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (closed[n] || clear[n] < MIN_CLEAR) continue;
      const cost = w * CELL * (1 + 120 / Math.min(clear[n], 400));       // prefer the middle of the channel
      if (g[k] + cost < g[n]) { g[n] = g[k] + cost; came[n] = k; push(n, g[n] + hfn(n)); }
    }
  }
  if (came[t] < 0 && s !== t) throw new Error(`no water path from ${from} to ${to}`);
  const out = []; for (let k = t; k >= 0; k = came[k]) { out.push([G.cx(k % W), G.cz((k / W) | 0)]); if (k === s) break; }
  return out.reverse();
}

// line-of-sight simplification: keep a point only when the straight segment would lose clearance
function simplify(G, coast, pts, need) {
  const ok = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5);
    for (let k = 0; k <= n; k++) if (G.clearAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n) < need) return false;
    return !coast.crosses(a, b);
  };
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !ok(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  return out;
}

// round each corner of a polyline with a quadratic Bezier between points `r` before and after it (never leaves the
// corner's triangle, so unlike a spline through sparse points it cannot overshoot onto land), resampled at `step` m
export function roundCorners(pts, rMax = 260, step = 15) {
  const L = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]), lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dense = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const r = Math.min(rMax, L(a, b) * 0.45, L(b, c) * 0.45);
    const p = lerp(b, a, r / L(a, b)), q = lerp(b, c, r / L(b, c));
    dense.push(p);
    for (let k = 1; k < 12; k++) { const t = k / 12; dense.push(lerp(lerp(p, b, t), lerp(b, q, t), t)); }
    dense.push(q);
  }
  dense.push(pts[pts.length - 1]);
  return resample(dense, step);
}
export function resample(dense, step) {
  const out = [dense[0]]; let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d <= l) { const t = d / l; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
    carry = l - (d - step);
  }
  const last = dense[dense.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last); else out[out.length - 1] = last;
  return out;
}

// centripetal Catmull-Rom through the points, resampled at `step` metres
export function catmull(pts, step = 15) {
  const P = [pts[0], ...pts, pts[pts.length - 1]], dense = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  const out = [dense[0]]; let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (acc >= step || i === dense.length - 1) { out.push(dense[i]); acc = 0; }
  }
  return out;
}

export function verify(G, coast, pts, need, label) {
  let minC = Infinity;
  if (process.env.ROUTES_NOVERIFY) return pts.reduce((m, p) => Math.min(m, G.clearAt(p[0], p[1])), Infinity);
  for (let i = 0; i < pts.length; i++) {
    const c = G.clearAt(pts[i][0], pts[i][1]); minC = Math.min(minC, c);
    if (c < need) throw new Error(`${label}: point ${i} (${pts[i].map(Math.round)}) has ${c.toFixed(0)} m clearance < ${need}`);
    if (i && coast.crosses(pts[i - 1], pts[i])) throw new Error(`${label}: segment ${i - 1}-${i} crosses the coastline`);
  }
  return minC;
}

// fine check on the DEM itself (3.7 m in the core) for manoeuvres close to the quay
export function verifyFine(height, coast, pts, label, path = true, demOk = () => true) {
  for (let i = 0; i < pts.length; i++) {
    if (demOk(pts[i]) && height(pts[i][0], pts[i][1]) > 0.05 && !process.env.ROUTES_NOVERIFY) throw new Error(`${label}: point ${i} (${pts[i].map(Math.round)}) is on land`);
    if (path && i && coast.crosses(pts[i - 1], pts[i]) && !process.env.ROUTES_NOVERIFY) throw new Error(`${label}: segment ${i} crosses the coastline`);
  }
}

const r1 = (v) => Math.round(v * 10) / 10;

export function build() {
  const core = loadDem("core"), city = loadDem("city");
  const height = makeHeight(core, city);
  const coastJson = JSON.parse(readFileSync(join(ROOT, "data/buildings/coast.json"), "utf8"));
  const coast = coastIndex(coastJson.lines);
  const G = buildGrid(height, coast);

  // market quay face: a least-squares line through the GSI coastline vertices along the market's straight quay
  // (seeded by a hand-read line on the ortho: boats lie alongside it on data/ortho/core.jpg), water to its east
  const seedA = [543.3, 590.0], seedB = [792.0, 1150.0];
  const sd = [seedB[0] - seedA[0], seedB[1] - seedA[1]], sl = Math.hypot(...sd), su = [sd[0] / sl, sd[1] / sl], sn = [su[1], -su[0]];
  const near = [];
  for (const [a, b] of coast.segs) for (const p of [a, b]) {
    const s0 = (p[0] - seedA[0]) * su[0] + (p[1] - seedA[1]) * su[1], o = (p[0] - seedA[0]) * sn[0] + (p[1] - seedA[1]) * sn[1];
    if (s0 > -5 && s0 < sl + 120 && Math.abs(o) < 15) near.push([s0, o]);
  }
  const n = near.length, ms = near.reduce((a, p) => a + p[0], 0) / n, mo = near.reduce((a, p) => a + p[1], 0) / n;
  const slope = near.reduce((a, p) => a + (p[0] - ms) * (p[1] - mo), 0) / near.reduce((a, p) => a + (p[0] - ms) ** 2, 0);
  const faceAt = (s0) => [seedA[0] + su[0] * s0 + sn[0] * (mo + slope * (s0 - ms)), seedA[1] + su[1] * s0 + sn[1] * (mo + slope * (s0 - ms))];
  const QA = faceAt(0), QB = faceAt(sl + 100);
  const qd = [QB[0] - QA[0], QB[1] - QA[1]], qlen = Math.hypot(...qd), dir = [qd[0] / qlen, qd[1] / qlen], nrm = [dir[1], -dir[0]];
  const faceResidual = Math.max(...near.map(([s0, o]) => Math.abs(o - (mo + slope * (s0 - ms)))));
  const onQuay = (s, off) => [QA[0] + dir[0] * s + nrm[0] * off, QA[1] + dir[1] * s + nrm[1] * off];

  // waypoints: the bay mouth south of the 西湾 (the wide channel between the mainland and 大島, the main lane) ->
  // mid-channel -> under the 気仙沼湾横断橋 (かなえ大橋) -> a staging point off the market quay
  const mouth = bestNear(G, 2150, 8000, 600), mid = bestNear(G, 1900, 4700, 700), kanae = bestNear(G, 1492, 1465, 150);
  const staging = onQuay(qlen + 120, 120);
  const legs = [[mouth.x, mouth.z], [mid.x, mid.z], [kanae.x, kanae.z], staging];
  let raw = [];
  for (let i = 0; i < legs.length - 1; i++) { const seg = astar(G, legs[i], legs[i + 1]); raw = raw.concat(i ? seg.slice(1) : seg); }
  const simple = simplify(G, coast, raw, MIN_CLEAR + 10);
  const main = roundCorners(simple, 260, 15);
  const minMain = verify(G, coast, main, MIN_CLEAR - 5, "main route");
  let len = 0; const cum = [0]; for (let i = 1; i < main.length; i++) { len += Math.hypot(main[i][0] - main[i - 1][0], main[i][1] - main[i - 1][1]); cum.push(len); }

  // berths: row 0 alongside the quay, row 1 rafted outside it; 14 m of beam per row, bows heading up the quay (-dir)
  const heading = Math.atan2(-dir[0], -dir[1]);               // yaw so local +z (bow) points along -dir
  const berths = [];
  const SLOT = 72;                                             // a 60 m vessel + fenders and lines
  for (let row = 0; row < 2; row++) for (let s = 70; s + SLOT / 2 < qlen - 10; s += SLOT) {
    const off = 7.5 + row * 12.5, pos = onQuay(s, off);
    // docking leg: from the staging point up the quay 60 m out, swing in from astern
    const leg = catmull([staging, onQuay(Math.min(qlen + 40, s + 230), 70 + row * 10), onQuay(s + 95, 26 + row * 12), onQuay(s + 30, off + 2), pos], 6);
    // near the quay the DEM edge is smeared, so there the coastline decides: stay >= 6 m on the water side of the face
    const faceOff = (p) => (p[0] - QA[0]) * nrm[0] + (p[1] - QA[1]) * nrm[1];
    if (leg.some((p) => faceOff(p) < 6) && !process.env.ROUTES_NOVERIFY) throw new Error(`berth ${row}/${s}: leg comes within 6 m of the quay face`);
    verifyFine(height, coast, leg, `berth ${row}/${s} leg`, true, (p) => faceOff(p) >= 14);
    // the moored hull footprint (60 x 11 m) must be all sea and clear of the quay line
    const fp = [];
    for (let u = -30; u <= 30; u += 5) for (const v of [-5.5, 5.5]) fp.push(onQuay(s + u, off + v));
    for (let k = 0; k < fp.length - 2; k += 2) if (coast.crosses(fp[k], fp[k + 1]) || coast.crosses(fp[k], fp[k + 2]) || coast.crosses(fp[k + 1], fp[k + 3])) {
      if (!process.env.ROUTES_NOVERIFY) throw new Error(`berth ${row}/${s}: hull footprint crosses the coastline`);
    }
    // the DEM (3.7 m, edge cells smeared up to ~8 m seaward) must be sea under the hull's outer edge
    verifyFine(height, coast, fp.filter((_, k) => k % 2 === 1 && off + 5.5 >= 12), `berth ${row}/${s} hull`, false);
    berths.push({ row, s: r1(s), pos: pos.map(r1), heading: +heading.toFixed(4), leg: leg.map((p) => p.map(r1)) });
  }
  berths.sort((a, b) => a.row - b.row || a.s - b.s);

  // moored background fleet: the finger moorings north of the market (ortho: 15+ vessels bow-out, ~25-40 m)
  const moored = [];
  const MA = [436, 355], MB = [480, 520];                      // along the west quay of the north basin
  const md = [MB[0] - MA[0], MB[1] - MA[1]], ml = Math.hypot(...md), mdir = [md[0] / ml, md[1] / ml], mn = [mdir[1], -mdir[0]];
  for (let k = 0; k < 13; k++) {
    const s = 8 + k * 12.5, len = 26 + ((k * 7) % 5) * 3;
    const cx = MA[0] + mdir[0] * s + mn[0] * (len / 2 + 4), cz = MA[1] + mdir[1] * s + mn[1] * (len / 2 + 4);
    if (height(cx, cz) > 0.05 || height(cx + mn[0] * len * 0.45, cz + mn[1] * len * 0.45) > 0.05) continue;
    moored.push({ pos: [r1(cx), r1(cz)], heading: +Math.atan2(mn[0], mn[1]).toFixed(4), len, kind: k % 3 === 0 ? "longline" : "pole" });
  }

  return {
    generated: new Date().toISOString().slice(0, 10),
    source: "GSI DEM (data/terrain core 3.7 m + city 8 m, sea = 0) and GSI coastline (data/buildings/coast.json); scripts/live/build-boat-routes.js",
    cell: CELL, minClearance: MIN_CLEAR, measuredMinClearance: Math.round(minMain),
    main: main.map((p) => p.map(r1)), length: Math.round(len),
    waypoints: { mouth: [mouth.x, mouth.z], mid: [mid.x, mid.z], kanae: [kanae.x, kanae.z], staging: staging.map(r1) },
    quay: { a: QA.map(r1), b: QB.map(r1), fitResidual: +faceResidual.toFixed(2), fitVertices: n, length: Math.round(qlen), dir: dir.map((v) => +v.toFixed(5)), normal: nrm.map((v) => +v.toFixed(5)) },
    berths, moored,
    debug: { G, coast, raw, simple },
  };
}

if (import.meta.main) {
  const t0 = performance.now();
  const r = build();
  const { debug, ...out } = r;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(JSON.stringify({ ok: true, ms: Math.round(performance.now() - t0), length: out.length, points: out.main.length, minClearance: out.measuredMinClearance, berths: out.berths.length, moored: out.moored.length, out: OUT.slice(ROOT.length + 1) }));
  const i = process.argv.indexOf("--debug");
  if (i > 0) {
    const sharp = (await import("sharp")).default;
    const { G } = debug, img = Buffer.alloc(G.W * G.H * 3);
    for (let k = 0; k < G.W * G.H; k++) { const c = G.clear[k]; if (!G.water[k]) { img[k * 3] = 90; img[k * 3 + 1] = 90; img[k * 3 + 2] = 80; } else { img[k * 3] = 10; img[k * 3 + 1] = Math.min(255, 40 + c / 4); img[k * 3 + 2] = Math.min(255, 90 + c / 3); } }
    const px = (p) => [Math.floor((p[0] - GRID.x0) / CELL), Math.floor((p[1] - GRID.z0) / CELL)];
    const dot = (p, rgb) => { const [a, b] = px(p); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (b + dy) * G.W + a + dx; if (k >= 0 && k < G.W * G.H) { img[k * 3] = rgb[0]; img[k * 3 + 1] = rgb[1]; img[k * 3 + 2] = rgb[2]; } } };
    for (const p of out.main) dot(p, [255, 200, 60]);
    for (const b of out.berths) for (const p of b.leg) dot(p, [255, 80, 80]);
    for (const m of out.moored) dot(m.pos, [80, 255, 80]);
    await sharp(img, { raw: { width: G.W, height: G.H, channels: 3 } }).png().toFile(process.argv[i + 1]);
  }
}
