// [play:courses] The three routes, driven by the real controllers against the committed gates.
// Drone: Player.step. Car: carStep + the road kerb. Ship: sailStep + pursue, then the dock helm.
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import * as L from '../src/anime/world/layout.js';
import { allRoads } from '../src/anime/world/explore/tiles.js';
import { makeRoadNet } from '../src/anime/world/explore/roadnet.js';
import { carStep, CAR } from '../src/anime/world/explore/drive.js';
import { sailStep, pursue, boatState, hullClearance, AUTO } from '../src/anime/world/explore/sail.js';
import { makePath } from '../src/anime/world/ship/route.js';
import { makeLotIndex } from '../src/anime/world/town/common.js';
import { Player } from '../src/anime/core/player.js';
import { KN, createRun, stepRun } from '../src/anime/play/courses/logic.js';
import DATA from '../data/play/courses.json';

const X = await L.loadData('explore.json');
const net = makeRoadNet(allRoads(L, X));
const lots = makeLotIndex(L.LOTS);
const DT = 1 / 60;
const hit = { t: 0, x: 0, y: 0, z: 0, dist: 0, lateral: 0, ok: false, event: '', delta: null, index: 0, elapsed: 0, finished: false, inside: false, speed: 0, headingErr: 0, centre: 0, hold: 0, bonusMs: 0 };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function course(id) { return DATA.courses.find((c) => c.id === id); }

function fly(mode) {
  const c = course('anba');
  const skill = c.gates.findIndex((g) => g.skill);
  if (typeof addEventListener !== 'function') globalThis.addEventListener = () => {};
  const dom = { addEventListener() {}, requestPointerLock() {} };
  const cam = new THREE.PerspectiveCamera();
  const physics = { groundHeight: () => 0, isWater: () => false, resolve() {}, standable: () => true };
  const p = new Player(cam, dom, physics, { x0: -1e5, x1: 1e5, z0: -1e5, z1: 1e5 });
  p.enabled = true;
  const st = c.start;
  p.setPose(st.x, st.z, st.yaw * 180 / Math.PI, -8, st.y);
  const run = createRun();
  const prev = { x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z };
  const pose = { x: prev.x, y: prev.y, z: prev.z };
  const seen = [];
  let skillFirst = null;
  for (let n = 0; n < 180 * 60 && !run.finished; n++) {
    const g = c.gates[run.index];
    if (!g) break;
    const dx = g.x - p.pos.x, dz = g.z - p.pos.z;
    p.yaw = Math.atan2(-dx, -dz);
    const dy = g.y - (p.pos.y + p.eye);
    p.keys.clear();
    p.keys.add('KeyW');
    if (dy > 1.2) p.keys.add('KeyE');
    else if (dy < -1.2) p.keys.add('KeyQ');
    const nxt = c.gates[run.index + 1];
    const soon = !!(nxt && nxt.skill && Math.hypot(nxt.x - p.pos.x, nxt.z - p.pos.z) < 80);
    const boost = mode === 'boost' || (mode === 'managed' && !g.skill && !soon);
    if (boost) p.keys.add('ShiftLeft');
    p.step(DT);
    pose.x = p.pos.x; pose.y = p.pos.y + p.eye; pose.z = p.pos.z;
    const before = run.index;
    stepRun(run, c, prev, pose, DT, null, hit);
    if (hit.event === 'pass' || hit.event === 'near') {
      seen.push(before + hit.event[0] + hit.dist.toFixed(1));
      if (before === skill && skillFirst == null) skillFirst = hit.event;
    }
    prev.x = pose.x; prev.y = pose.y; prev.z = pose.z;
  }
  return { finished: run.finished, t: run.elapsed / 1000, skillFirst, seen: seen.join(' ') };
}

function snapNodes(roads) {
  const map = new Map();
  const list = [];
  const key = (x, z) => Math.round(x / 4) + ',' + Math.round(z / 4);
  const node = (x, z) => {
    const k = key(x, z);
    let n = map.get(k);
    if (!n) {
      n = { x: Math.round(x / 4) * 4, z: Math.round(z / 4) * 4, i: list.length, e: [] };
      map.set(k, n); list.push(n);
    }
    return n;
  };
  const link = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 0.5) return;
    a.e.push({ to: b.i, d }); b.e.push({ to: a.i, d });
  };
  for (const r of roads) {
    if (!r?.pts || r.pts.length < 2 || r.tunnel || (r.width || 4) < 5.5) continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      const inside = (p) => p[0] >= -280 && p[0] <= 420 && p[1] >= -280 && p[1] <= 220;
      if (!inside(a) || !inside(b)) continue;
      link(node(a[0], a[1]), node(b[0], b[1]));
    }
  }
  const cell = 8, buckets = new Map();
  for (const n of list) {
    const k = Math.floor(n.x / cell) + ',' + Math.floor(n.z / cell);
    let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(n);
  }
  for (const n of list) {
    const ix = Math.floor(n.x / cell), iz = Math.floor(n.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = buckets.get((ix + dx) + ',' + (iz + dz)); if (!b) continue;
      for (const o of b) if (o.i > n.i && Math.hypot(o.x - n.x, o.z - n.z) < 7) link(n, o);
    }
  }
  return list;
}

function nearestNode(list, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = (list[i].x - x) ** 2 + (list[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function dijkstra(list, a, b) {
  const dist = new Float64Array(list.length);
  const prev = new Int32Array(list.length);
  dist.fill(Infinity); prev.fill(-1); dist[a] = 0;
  const used = new Uint8Array(list.length);
  for (let n = 0; n < list.length; n++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < list.length; i++) if (!used[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    used[u] = 1;
    if (u === b) break;
    for (const e of list[u].e) if (dist[u] + e.d < dist[e.to]) { dist[e.to] = dist[u] + e.d; prev[e.to] = u; }
  }
  const path = [];
  for (let u = b; u >= 0; u = prev[u]) { path.push(list[u]); if (u === a) break; }
  path.reverse();
  return path[0] === list[a] ? path : [];
}

function carPoly(list) {
  const seeds = [[105, 106], [-17, 72], [-120, -70], [178, -146]];
  const ids = seeds.map(([x, z]) => nearestNode(list, x, z));
  ids.push(ids[0]);
  const pts = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const leg = dijkstra(list, ids[i], ids[i + 1]);
    if (!leg.length) return null;
    for (const n of leg) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last[0] - n.x, last[1] - n.z) > 0.5) pts.push([n.x, n.z]);
    }
  }
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, acc, len: acc[acc.length - 1] };
}

function pointAt(poly, s) {
  s = Math.max(0, Math.min(poly.len, s));
  let lo = 0, hi = poly.acc.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (poly.acc[m] <= s) lo = m; else hi = m; }
  const t = (s - poly.acc[lo]) / Math.max(1e-6, poly.acc[hi] - poly.acc[lo]);
  const a = poly.pts[lo], b = poly.pts[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function headingAt(poly, s) {
  const [x0, z0] = pointAt(poly, s);
  const [x1, z1] = pointAt(poly, Math.min(poly.len, s + 4));
  return Math.atan2(-(x1 - x0), -(z1 - z0));
}

/** Circumradius of the path over ±12 m. A fold that reverses on itself reads as straight. */
function radiusAt(poly, s) {
  const a = pointAt(poly, Math.max(0, s - 12));
  const b = pointAt(poly, s);
  const c = pointAt(poly, Math.min(poly.len, s + 12));
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * 0.5;
  if (area < 0.05) return 1e6;
  return (ab * bc * ac) / (4 * area);
}

/**
 * A player on the slip model. Peak grip is about 6.1 m/s² and it falls past 8° of slip,
 * so the lap brakes to 4.6 m/s² before a bend and lifts the boost. The southeast spur
 * folds back along the same 13 m road: circumradius calls that a straight, so a heading
 * reversal is what makes the car arrive under 2.55 m/s and turn in the kinematic regime.
 * The kerb writes `u` as well as `speed`, which is what drive.js does.
 */
function drive() {
  const c = course('minato');
  const poly = carPoly(snapNodes(allRoads(L, X)));
  if (!poly) return { finished: false, why: 'no path' };
  const st = c.start;
  let state = { x: st.x, z: st.z, yaw: st.yaw, speed: 0, u: 0, steer: 0, vLat: 0, yawRate: 0 };
  const run = createRun();
  const prev = { x: state.x, y: L.groundAt(state.x, state.z), z: state.z };
  const pose = { x: prev.x, y: prev.y, z: prev.z };
  let progress = 0;
  const seen = [];
  for (let n = 0; n < 240 * 60 && !run.finished; n++) {
    let bestS = progress, bestD = Infinity;
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const s1 = Math.min(poly.len, progress + 16);
    for (let s = progress; s <= s1; s += 2) {
      const [px, pz] = pointAt(poly, s);
      const dx = px - state.x, dz = pz - state.z;
      const d = Math.hypot(dx, dz);
      // The return leg of the spur sits on the outbound road. Ignore it until the nose has turned.
      if (dx * fx + dz * fz < -1.5 && d > 3) continue;
      if (d < bestD) { bestD = d; bestS = s; }
    }
    progress = bestS;
    const h0 = headingAt(poly, progress);
    let minR = 1e6, reverseAt = 1e9;
    for (let ds = 4; ds <= 40; ds += 4) {
      const s = Math.min(poly.len, progress + ds);
      minR = Math.min(minR, radiusAt(poly, s));
      const turn = Math.abs(wrap(headingAt(poly, s) - h0));
      if (turn > 2.1) reverseAt = Math.min(reverseAt, ds);
    }
    const look = reverseAt < 18 ? Math.max(4, reverseAt * 0.45) : (bestD > 6 ? 6 : clamp(8 + Math.abs(state.speed) * 0.45, 8, 14));
    const [tx, tz] = pointAt(poly, Math.min(poly.len, progress + look));
    const want = Math.atan2(-(tx - state.x), -(tz - state.z));
    const err = wrap(want - state.yaw);
    const steer = clamp(-err / (reverseAt < 18 ? 0.18 : 0.22), -1, 1);
    let vCap = Math.min(bestD > 6 ? CAR.vMax * 0.7 : CAR.vBoost, Math.sqrt(4.6 * Math.max(7, minR)));
    if (reverseAt < 48) {
      const dist = reverseAt;
      const vTurn = dist < 7 ? 2.1 : dist < 14 ? 2.1 + (dist - 7) * 0.55 : 6 + (dist - 14) * 0.35;
      vCap = Math.min(vCap, vTurn);
    }
    const brake = state.speed > vCap + 0.3 || (Math.abs(err) > 0.8 && state.speed > 6);
    const throttle = brake ? 0 : (state.speed > vCap - 0.35 ? 0.3 : 0.9);
    const boost = !brake && reverseAt > 40 && bestD < 4 && minR > 70 && Math.abs(err) < 0.18;
    const input = { throttle, steer, brake, boost, counterSteer: true };
    let next = carStep(state, input, DT);
    const sliding = !!next.skid || input.brake;
    const kerb = net.clampToRoad(next.x, next.z, CAR.halfW * 0.8);
    if (kerb.off > 0 && Number.isFinite(kerb.off)) {
      const bite = Math.min(1, kerb.off / 1.4);
      const speed = next.speed * Math.max(0.45, 1 - DT * (sliding ? 1.4 : 3.2) * bite);
      next = { ...next, x: kerb.x, z: kerb.z, speed, u: speed };
    } else if (!Number.isFinite(kerb.off)) {
      next = { ...next, x: state.x, z: state.z, speed: 0, u: 0, vLat: 0, yawRate: 0 };
    }
    state = next;
    pose.x = state.x; pose.y = L.groundAt(state.x, state.z); pose.z = state.z;
    const before = run.index;
    stepRun(run, c, prev, pose, DT, null, hit);
    if (hit.event === 'pass' || hit.event === 'near' || hit.event === 'finish') {
      seen.push(before + (hit.event === 'finish' ? 'p' : hit.event[0]));
    }
    prev.x = pose.x; prev.y = pose.y; prev.z = pose.z;
  }
  return { finished: run.finished, t: run.elapsed / 1000, len: poly.len, index: run.index, x: state.x, z: state.z, seen: seen.join('') };
}

const SAIL_AUTO = { ...AUTO, straightUntil: 0, slowUntil: 0, boostFrom: 50, boostEndBefore: 200, window: [-120, 700] };

function sail() {
  const c = course('harbour');
  const path = makePath(c.path);
  const box = c.gates.find((g) => g.kind === 'dock');
  const buoys = c.gates.filter((g) => g.kind === 'buoy').length;
  let s = boatState(c.start.x, c.start.z, c.start.yaw);
  const run = createRun();
  const prev = { x: s.x, y: 0, z: s.z, yaw: s.yaw, u: 0, v: 0 };
  const pose = { x: s.x, y: 0, z: s.z, yaw: s.yaw, u: 0, v: 0 };
  let progress = 0, rec = null, minC = Infinity;
  const seen = [];
  for (let n = 0; n < 220 * 60 && !run.finished; n++) {
    let input;
    if (run.index < buoys) {
      const cmd = pursue(path, s, progress, undefined, SAIL_AUTO, rec, DT);
      progress = cmd.s; rec = cmd.rec;
      input = { throttle: cmd.throttle, rudder: cmd.rudder, boost: cmd.boost };
    } else {
      const dx = box.x - s.x, dz = box.z - s.z;
      const dist = Math.hypot(dx, dz);
      const aimErr = wrap(Math.atan2(dx, dz) - s.yaw);
      const headingErr = wrap(box.yaw - s.yaw);
      const sy = Math.sin(box.yaw), cy = Math.cos(box.yaw);
      const lx = (s.x - box.x) * -cy + (s.z - box.z) * sy;
      const lz = (s.x - box.x) * sy + (s.z - box.z) * cy;
      let throttle = dist < 12 ? 0.08 : dist < 30 ? 0.22 : 0.5;
      if (dist < 20 && s.u > 0.55) throttle = -0.55;
      if (Math.abs(lz) <= box.halfL && Math.abs(lx) <= box.halfW && Math.hypot(s.u, s.v) / KN > 0.9) throttle = -1;
      input = { throttle, rudder: clamp(-(dist < 40 ? headingErr : aimErr) * 2.1, -1, 1), boost: false };
    }
    s = sailStep(s, input, DT);
    const clear = hullClearance(s).d;
    if (clear < minC) minC = clear;
    pose.x = s.x; pose.y = 0; pose.z = s.z; pose.yaw = s.yaw; pose.u = s.u; pose.v = s.v;
    const before = run.index;
    stepRun(run, c, prev, pose, DT, null, hit);
    if (hit.event === 'pass' || hit.event === 'near' || hit.event === 'finish') seen.push(before + (hit.event === 'finish' ? 'd' : hit.event[0]));
    prev.x = pose.x; prev.y = 0; prev.z = pose.z; prev.yaw = pose.yaw; prev.u = pose.u; prev.v = pose.v;
  }
  return { finished: run.finished, t: +(run.elapsed / 1000).toFixed(1), index: run.index, minC: +minC.toFixed(1), x: +s.x.toFixed(1), z: +s.z.toFixed(1), seen: seen.join('') };
}

describe('reachable with the real controllers', () => {
  test('no ring hangs inside a roof', () => {
    const low = [];
    for (const g of course('anba').gates) {
      const lot = lots.at(g.x, g.z, 6);
      if (!lot || !(lot.height > 0)) continue;
      const roof = L.heightAt(g.x, g.z) + lot.height;
      if (g.y - 4.5 <= roof) low.push({ x: g.x, z: g.z, y: g.y, roof: +roof.toFixed(1) });
    }
    expect(low).toEqual([]);
  });

  test('a managed drone run clears every ring, including the lookout', () => {
    const r = fly('managed');
    console.log('drone managed', JSON.stringify(r));
    expect(r.finished).toBe(true);
    expect(r.skillFirst).toBe('pass');
  }, 120000);

  test('full boost misses the lookout the first time, then still finishes', () => {
    const r = fly('boost');
    console.log('drone boost', JSON.stringify(r));
    expect(r.skillFirst).toBe('near');
    expect(r.finished).toBe(true);
  }, 120000);

  test('a cruise drone run also finishes clean', () => {
    const r = fly('cruise');
    console.log('drone cruise', JSON.stringify(r));
    expect(r.finished).toBe(true);
    expect(r.skillFirst).toBe('pass');
  }, 180000);

  test('the car stays on the roads and takes every flag', () => {
    const r = drive();
    console.log('car', JSON.stringify(r));
    expect(r.finished).toBe(true);
    expect(r.seen).toBe('0p1p2p3p4p5p6p7p8p9p');
    // 1.3 km at a town pace. A crawl that still finishes inside four minutes does not pass.
    expect(r.t).toBeLessThan(150);
  }, 180000);

  test('the ship passes every buoy and stops in the dock', () => {
    const r = sail();
    console.log('ship', JSON.stringify(r));
    expect(r.finished).toBe(true);
    expect(r.minC).toBeGreaterThan(8);
    expect(r.seen.includes('n')).toBe(false);
  }, 180000);
});
