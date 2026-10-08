// Trace the night circuit on GSI centre-lines. The courses lane's 港町ぐるっと
// gates are the waypoints. Writes data/play/race-minato.json when --write is set.
//   env -u NODE_OPTIONS bun tools/anime/race-loop.mjs
//   env -u NODE_OPTIONS bun tools/anime/race-loop.mjs --write

import { makeRoadNet } from '../../src/anime/world/explore/roadnet.js';
import { carStep, RACE } from '../../src/anime/world/explore/drive-model.js';

const WRITE = process.argv.includes('--write');

const GATES = [
  [102.38, 111.29],
  [14.1, 115.64],
  [-52.87, 11.13],
  [-86.1, -102.98],
  [-12.4, -45.5],
  [98.0, -95.3],
  [155.1, -128.2],
  [50.1, -62],
  [-68.9, -27.1],
  [-13.7, 74.2],
  [69.8, 140.4],
];

const BOX = { x0: -500, x1: 700, z0: -450, z1: 900 };

function inBox(x, z) {
  return x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1;
}

function loadRoads(layout, explore) {
  const out = [];
  const push = (r) => {
    if (!r?.pts || r.pts.length < 2) return;
    if ((r.width || 0) < 3.2) return;
    let hit = false;
    for (const p of r.pts) if (inBox(p[0], p[1])) { hit = true; break; }
    if (!hit) return;
    out.push(r);
  };
  for (const r of layout.roads) push(r);
  for (const r of explore.roads) push(r);
  return out;
}

function buildGraph(roads) {
  const nodes = [];
  const segs = [];
  const cell = 8;
  const buckets = new Map();
  function bucket(x, z, id) {
    const k = Math.floor(x / cell) * 73856093 ^ Math.floor(z / cell) * 19349663;
    let list = buckets.get(k);
    if (!list) buckets.set(k, (list = []));
    list.push(id);
  }
  function nodeAt(x, z, join) {
    const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
    let best = -1, bestD = join;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      const list = buckets.get(i * 73856093 ^ j * 19349663);
      if (!list) continue;
      for (const id of list) {
        const n = nodes[id];
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push({ x, z, e: [] });
    bucket(x, z, id);
    return id;
  }
  function link(ia, ib, len, pen) {
    if (ia === ib || len < 0.3) return;
    const ea = nodes[ia].e;
    for (let i = 0; i < ea.length; i += 2) if (ea[i] === ib) return;
    const cost = len * pen;
    ea.push(ib, cost);
    nodes[ib].e.push(ia, cost);
  }
  for (const r of roads) {
    const w = r.width || 4;
    const pen = w >= 7 ? 1 : w >= 5 ? 1.08 : w >= 4 ? 1.25 : 1.8;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.4 || len > 90) continue;
      if (!inBox(a[0], a[1]) && !inBox(b[0], b[1])) continue;
      const ia = nodeAt(a[0], a[1], 1.6);
      const ib = nodeAt(b[0], b[1], 1.6);
      link(ia, ib, len, pen);
      segs.push({ ia, ib, ax: a[0], az: a[1], bx: b[0], bz: b[1], pen, road: r.id });
    }
  }
  // An end that stops a few metres short of a crossing still turns onto it.
  const ends = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].e.length <= 2) ends.push(i);
  for (const id of ends) {
    const n = nodes[id];
    let best = null;
    for (const s of segs) {
      if (s.ia === id || s.ib === id) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((n.x - s.ax) * dx + (n.z - s.az) * dz) / len2));
      const x = s.ax + dx * t, z = s.az + dz * t;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < 7 && (!best || d < best.d)) best = { d, x, z, pen: s.pen };
    }
    if (!best) continue;
    const j = nodeAt(best.x, best.z, 1.6);
    link(id, j, best.d, best.pen);
  }
  return nodes;
}

function nearestNode(nodes, x, z) {
  let best = 0, bestD = 1e18;
  for (let i = 0; i < nodes.length; i++) {
    const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function route(nodes, a, b) {
  const n = nodes.length;
  const g = new Float64Array(n);
  const prev = new Int32Array(n);
  g.fill(1e18);
  prev.fill(-1);
  g[a] = 0;
  const open = [a];
  const seen = new Uint8Array(n);
  const bx = nodes[b].x, bz = nodes[b].z;
  while (open.length) {
    let bi = 0, bf = g[open[0]] + Math.hypot(nodes[open[0]].x - bx, nodes[open[0]].z - bz);
    for (let i = 1; i < open.length; i++) {
      const f = g[open[i]] + Math.hypot(nodes[open[i]].x - bx, nodes[open[i]].z - bz);
      if (f < bf) { bf = f; bi = i; }
    }
    const u = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (seen[u]) continue;
    seen[u] = 1;
    if (u === b) break;
    const e = nodes[u].e;
    for (let i = 0; i < e.length; i += 2) {
      const v = e[i], c = g[u] + e[i + 1];
      if (c < g[v]) { g[v] = c; prev[v] = u; open.push(v); }
    }
  }
  if (prev[b] < 0 && a !== b) return null;
  const path = [];
  let u = b;
  while (u >= 0) { path.push(u); if (u === a) break; u = prev[u]; }
  path.reverse();
  return path[0] === a ? path : null;
}

function polyline(nodes, ids) {
  const pts = [];
  for (const id of ids) {
    const n = nodes[id];
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last[0] - n.x, last[1] - n.z) < 0.8) continue;
    pts.push([n.x, n.z]);
  }
  return pts;
}

function resample(pts, step) {
  let total = 0;
  const seg = [];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(len);
    total += len;
  }
  const out = [];
  let s = 0, i = 1, acc = 0;
  out.push([pts[0][0], pts[0][1], 0]);
  while (s + step < total - 0.5) {
    s += step;
    while (i < pts.length && acc + seg[i - 1] < s) { acc += seg[i - 1]; i++; }
    const len = seg[i - 1] || 1;
    const t = (s - acc) / len;
    const a = pts[i - 1], b = pts[i];
    out.push([+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2), +s.toFixed(2)]);
  }
  out.push([+pts[pts.length - 1][0].toFixed(2), +pts[pts.length - 1][1].toFixed(2), +total.toFixed(2)]);
  return { samples: out, lengthM: +total.toFixed(1) };
}

function corners(samples) {
  const cones = [];
  const bars = [];
  for (let i = 2; i < samples.length - 2; i++) {
    const a = samples[i - 2], b = samples[i], c = samples[i + 2];
    const ax = b[0] - a[0], az = b[1] - a[1];
    const bx = c[0] - b[0], bz = c[1] - b[1];
    const al = Math.hypot(ax, az) || 1, bl = Math.hypot(bx, bz) || 1;
    const cross = ax / al * bz / bl - az / al * bx / bl;
    const dot = ax / al * bx / bl + az / al * bz / bl;
    const turn = Math.atan2(cross, dot);
    if (Math.abs(turn) < 0.38) continue;
    // inside of the turn: left of the travel direction when turning left (cross > 0 in x-east, z-south? )
    // travel (ax, az). Left normal is (-az, ax) if +Y up and x east, z south... 
    // rotate (ax,az) by +90 deg CCW in x-right, z-down screen: (az, -ax) is one side.
    const side = turn > 0 ? 1 : -1;
    const nx = (-az / al) * side, nz = (ax / al) * side;
    const inset = 3.2;
    cones.push([+(b[0] + nx * inset).toFixed(2), +(b[1] + nz * inset).toFixed(2)]);
    if (Math.abs(turn) > 0.7) {
      const yaw = Math.atan2(ax, az);
      bars.push([+(b[0] + nx * (inset + 1.1)).toFixed(2), +(b[1] + nz * (inset + 1.1)).toFixed(2), +yaw.toFixed(3), 4.2]);
    }
    i += 3;
  }
  return { cones, bars };
}

const layout = await Bun.file(new URL('../../data/anime/layout.json', import.meta.url)).json();
const explore = await Bun.file(new URL('../../data/anime/explore.json', import.meta.url)).json();
const roads = loadRoads(layout, explore);
const nodes = buildGraph(roads);
console.log('roads', roads.length, 'nodes', nodes.length);

function findCycle(nodes, startId) {
  const deg = nodes.map((n) => (n.e.length / 2) | 0);
  const isJ = deg.map((d, i) => d !== 2 || i === startId);
  const adj = new Map();
  function walk(from, first) {
    const pts = [[nodes[from].x, nodes[from].z]];
    const seen = new Set([from]);
    let prev = from, cur = first, len = 0;
    for (let guard = 0; guard < 500; guard++) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      len += Math.hypot(nodes[prev].x - nodes[cur].x, nodes[prev].z - nodes[cur].z);
      pts.push([nodes[cur].x, nodes[cur].z]);
      if (isJ[cur]) return { to: cur, len, pts };
      const e = nodes[cur].e;
      if (e.length < 4) return null;
      const nxt = e[0] === prev ? e[2] : e[0];
      prev = cur;
      cur = nxt;
    }
    return null;
  }
  let junctions = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (!isJ[i]) continue;
    junctions++;
    const outs = [];
    const e = nodes[i].e;
    for (let k = 0; k < e.length; k += 2) {
      const w = walk(i, e[k]);
      if (w && w.len > 4) outs.push(w);
    }
    adj.set(i, outs);
  }
  const ukey = (a, b, pts) => {
    const m = pts[(pts.length / 2) | 0];
    const lo = a < b ? a : b, hi = a < b ? b : a;
    return lo + '-' + hi + '-' + Math.round(m[0] / 3) + '-' + Math.round(m[1] / 3);
  };
  let best = null;
  const found = [];
  function pathBetween(a, b, banned) {
    const gScore = new Map([[a, 0]]);
    const prev = new Map();
    const prevE = new Map();
    const open = [a];
    const done = new Set();
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (gScore.get(open[i]) < gScore.get(open[bi])) bi = i;
      const u = open[bi];
      const last = open.pop();
      if (bi < open.length) open[bi] = last;
      if (done.has(u)) continue;
      done.add(u);
      if (u === b) break;
      for (const w of adj.get(u) || []) {
        if (w.to === startId || banned.has(ukey(u, w.to, w.pts))) continue;
        const c = gScore.get(u) + w.len;
        if (c < (gScore.get(w.to) ?? 1e18)) {
          gScore.set(w.to, c);
          prev.set(w.to, u);
          prevE.set(w.to, w);
          open.push(w.to);
        }
      }
    }
    if (!prev.has(b) && a !== b) return null;
    const edges = [];
    let pts = [];
    let u = b;
    while (u !== a) {
      const w = prevE.get(u);
      if (!w) return null;
      edges.push(ukey(prev.get(u), u, w.pts));
      pts = w.pts.slice(0, -1).concat(pts);
      u = prev.get(u);
    }
    pts.push([nodes[b].x, nodes[b].z]);
    return { len: gScore.get(b), pts, edges };
  }
  function consider(len, pts) {
    if (len < 400 || len > 2200) return;
    let gates = 0;
    for (const g of GATES) {
      let near = false;
      for (let i = 0; i < pts.length; i += 4) if (Math.hypot(pts[i][0] - g[0], pts[i][1] - g[1]) < 40) { near = true; break; }
      if (near) gates++;
    }
    const ss = [0];
    for (let i = 1; i < pts.length; i++) ss.push(ss[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = ss[ss.length - 1] || len;
    let foldD = 1e9;
    for (let i = 0; i < pts.length; i += 2) {
      for (let j = i + 2; j < pts.length; j += 2) {
        const delta = ss[j] - ss[i];
        const along = Math.min(delta, total - delta);
        if (along < 50) continue;
        const dist = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
        if (dist < foldD) foldD = dist;
      }
    }
    found.push({ len: Math.round(len), gates, fold: +foldD.toFixed(1) });
    if (len < 1200 || len > 1800 || foldD < 20) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
    if ((x1 - x0) < 140 || (z1 - z0) < 140) return;
    const score = gates * 1000 - Math.abs(len - 1400);
    if (!best || score > best.score) best = { score, len, pts, gates };
  }
  const outs = adj.get(startId) || [];
  console.log('start outs', outs.length, 'start deg', deg[startId]);
  for (let i = 0; i < outs.length; i++) {
    for (let j = i + 1; j < outs.length; j++) {
      const banned = new Set();
      for (let k = 0; k < 5; k++) {
        const mid = pathBetween(outs[i].to, outs[j].to, banned);
        if (!mid) break;
        const len = outs[i].len + mid.len + outs[j].len;
        const pts = outs[i].pts.concat(mid.pts.slice(1), [...outs[j].pts].reverse().slice(1));
        consider(len, pts);
        if (!mid.edges.length) break;
        for (const e of mid.edges) banned.add(e);
      }
    }
  }
  found.sort((a, b) => b.len - a.len);
  console.log('junctions', junctions, 'cycles', found.length, 'longest', found.slice(0, 8));
  console.log('best', best && { len: +best.len.toFixed(0), gates: best.gates, score: best.score });
  return best;
}

let cyc = null;
const tried = new Set();
for (const g of GATES) {
  const id = nearestNode(nodes, g[0], g[1]);
  if (tried.has(id)) continue;
  tried.add(id);
  const hit = findCycle(nodes, id);
  if (hit && (!cyc || hit.score > cyc.score)) cyc = hit;
}
if (!cyc) { console.error('no cycle'); process.exit(1); }
console.log('chosen', { len: +cyc.len.toFixed(0), gates: cyc.gates });
const raw = cyc.pts;
const { samples, lengthM } = resample(raw, 8);
const dx = samples[1][0] - samples[0][0];
const dz = samples[1][1] - samples[0][1];
const startYaw = Math.atan2(-dx, -dz);
const marks = corners(samples);
const gates = [];
for (let s = 0; s < lengthM - 40; s += 240) gates.push(Math.round(s));

let fold = { d: 1e9, a: 0, b: 0 };
for (let i = 0; i < samples.length; i += 2) {
  for (let j = i + 6; j < samples.length; j += 2) {
    const along = Math.min(samples[j][2] - samples[i][2], lengthM - (samples[j][2] - samples[i][2]));
    if (along < 80) continue;
    const dist = Math.hypot(samples[j][0] - samples[i][0], samples[j][1] - samples[i][1]);
    if (dist < fold.d) fold = { d: +dist.toFixed(1), a: i, b: j, along: +along.toFixed(0) };
  }
}
let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
for (const p of samples) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
const gateD = GATES.map((g) => {
  let d = 1e9;
  for (let i = 0; i < samples.length; i += 3) d = Math.min(d, Math.hypot(samples[i][0] - g[0], samples[i][1] - g[1]));
  return Math.round(d);
});
console.log('fold', fold.d, 'bbox', Math.round(x0), Math.round(x1), Math.round(z0), Math.round(z1), 'gateD', gateD.join(','));

const net = makeRoadNet(roads);
let off = 0;
for (const p of samples) {
  const n = net.nearest(p[0], p[1], 12);
  if (!n || n.d > (n.seg?.hw || 3) + 1.5) off++;
}

const course = {
  id: 'minato',
  ja: '港町ナイト',
  en: 'Minato night',
  laps: 2,
  lengthM,
  start: [samples[0][0], samples[0][1]],
  startYaw: +startYaw.toFixed(4),
  medals: { gold: 70000, silver: 89000, bronze: 112000 },
  ratios: { silver: 1.2667, bronze: 1.6 },
  gates,
  cones: marks.cones,
  bars: marks.bars,
  note: 'Closed GSI loop on the courses lane 港町ぐるっと gates (港町–南町–魚町). 8 m samples. Two laps.',
  samples,
};

function radiusOf(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * 0.5;
  if (area < 0.05) return 1e6;
  return (ab * bc * ac) / (4 * area);
}

/** Centre-line lap, standing start. Lateral limit is the only corner brake. Twelve of these are the clean races. */
function lapOnLine(samples, lat, v0) {
  const n = samples.length;
  const vMax = 110 / 3.6;
  let v = v0 || 0, t = 0;
  for (let i = 1; i < n; i++) {
    const a = samples[Math.max(0, i - 3)];
    const b = samples[i];
    const c = samples[Math.min(n - 1, i + 3)];
    const r = Math.max(8, radiusOf(a, b, c));
    const vLim = Math.min(vMax, Math.sqrt(lat * Math.max(6, r)));
    const seg = Math.hypot(b[0] - samples[i - 1][0], b[1] - samples[i - 1][1]);
    const acc = v < vLim - 0.4 ? 3.0 : v > vLim + 0.4 ? -6 : 0;
    let dt;
    if (acc === 0) dt = seg / Math.max(0.8, v);
    else {
      const disc = v * v + 2 * acc * seg;
      dt = disc > 0 ? (Math.sqrt(disc) - v) / acc : seg / Math.max(0.8, v);
    }
    if (dt < 0) dt = seg / Math.max(0.8, v);
    v = Math.max(1, Math.min(vMax, v + acc * dt));
    t += dt;
  }
  return { t, v };
}

function driveLaps(samples, yaw0, look, bias) {
  const n = samples.length;
  const L = samples[n - 1][2];
  let st = {
    x: samples[0][0], z: samples[0][1], yaw: yaw0, speed: 0, u: 0, vLat: 0, yawRate: 0,
    steer: 0, gear: 1, rpm: 850, slipF: 0, slipR: 0,
  };
  const dt = 1 / 60;
  let time = 0, laps = [], idx = 1, seenFar = false, lapStart = 0;
  for (let f = 0; f < 60 * 200 && laps.length < 2; f++) {
    let best = idx, bestD = 1e9;
    for (let k = 0; k < 8; k++) {
      const j = (idx + k) % n;
      const d = Math.hypot(samples[j][0] - st.x, samples[j][1] - st.z);
      if (d < bestD) { bestD = d; best = j; }
    }
    idx = best;
    const ahead = samples[Math.min(n - 1, (idx + look) % n)];
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    const tx = ahead[0] - st.x, tz = ahead[1] - st.z;
    const cross = fx * tz - fz * tx;
    const dot = fx * tx + fz * tz;
    let steer = Math.max(-1, Math.min(1, cross / Math.max(6, Math.hypot(tx, tz)) * 2.2 + bias));
    const turn = Math.abs(steer);
    const throttle = turn > 0.72 && st.speed > 16 ? 0.35 : 1;
    const brake = turn > 0.85 && st.speed > 20;
    carStep(st, { throttle, steer, brake, boost: true, counterSteer: true }, dt, RACE, st);
    const near = samples[idx];
    const off = Math.hypot(near[0] - st.x, near[1] - st.z);
    if (off > 4.5) {
      const k = 4.5 / off;
      st.x = near[0] + (st.x - near[0]) * k;
      st.z = near[1] + (st.z - near[1]) * k;
    }
    time += dt;
    const prog = samples[idx][2];
    if (prog > L * 0.72) seenFar = true;
    if (seenFar && idx < 6 && time - lapStart > 30) {
      laps.push(+(time - lapStart).toFixed(2));
      lapStart = time;
      seenFar = false;
    }
  }
  if (!laps.length) console.log('stuck idx', idx, 't', time.toFixed(1), 'xz', st.x.toFixed(0), st.z.toFixed(0), 'v', st.speed.toFixed(1));
  return laps;
}

const races = [];
for (let i = 0; i < 12; i++) {
  const lat = 5.4 + i * 0.18;
  const a = lapOnLine(samples, lat, 0);
  const b = lapOnLine(samples, lat, a.v);
  races.push({ lat: +lat.toFixed(2), lap1: +a.t.toFixed(2), lap2: +b.t.toFixed(2), race: +(a.t + b.t).toFixed(2) });
}
races.sort((p, q) => p.race - q.race);
console.log('races', races.map((r) => r.lat + ':' + r.lap1 + '+' + r.lap2 + '=' + r.race).join(' '));
const bestRace = races[0].race;
const gold = Math.round(bestRace * 1.05 * 1000);
const silver = Math.round(gold * 1.2667);
const bronze = Math.round(gold * 1.6);
course.medals = { gold, silver, bronze };
console.log('medals', course.medals, 'bestLap', races[0].lap2);

console.log(JSON.stringify({
  lengthM, n: samples.length, start: course.start, startYaw: course.startYaw,
  gates, cones: marks.cones.length, bars: marks.bars.length, offRoad: off,
}, null, 2));

if (WRITE) {
  const path = new URL('../../data/play/race-minato.json', import.meta.url);
  await Bun.write(path, JSON.stringify(course));
  console.log('wrote', path.pathname, 'bytes', JSON.stringify(course).length);
}
