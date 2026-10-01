// [v4:explore] Tile streaming of the core (V3-SPEC section 10: "the walkable, full-detail area expands from the inner
// bay to the whole core, streamed by tiles with LOD and loaded around the player").
//
// Levels of detail per 100 m tile (explore/tiles.js), outside the hero zone (town builds that one at full detail):
//   base  mid-zone lots: town's simplified buildings on their real footprints, built once at load ('m1:<tile>');
//         far lots: town's instanced boxes (town/far.js)
//   L1    the far part of a tile streams in: its streets from the full-precision GSI centre-lines (alleys too,
//         explore.json) with town's street builder ('s1:<tile>'), and its far lots as simplified buildings on their
//         real footprints with their real name boards ('f1:<tile>'); their far instances are hidden
//   L0    near the player on foot or in the car: every lot of the tile is built with the hero kit (Sakura's house
//         generator, shops with their fronts and real names, apartment and office blocks, warehouses, front yards,
//         laundry, bikes, potted plants, vending machines, power drops) ('k0:<tile>'); the tile's base / L1 buildings
//         are hidden while it is shown
// Every building level carries its own colliders (physics tags), so the whole core is walkable and drivable.
//
// Work is time-sliced: each build is a generator that yields after a street batch, a slice of lots or one kit lot,
// and `update()` runs jobs for a few milliseconds per frame (quality tier), nearest tile first. Unloads are
// immediate. `settle()` finishes every wanted tile at once (screenshots, tests).
import * as THREE from 'three';
import { StreamBatch } from './sbatch.js';
import { tileDist } from './tiles.js';
import { buildMid } from '../town/mid.js';
import { classifyHero, buildHeroLot } from '../town/hero.js';
import { buildStreets } from '../town/streets.js';
import { GB } from '../town/kit/gb.js';
import { Laundry } from '../town/kit/laundry.js';
import { wings, toWorld } from '../town/wings.js';
import { tileProps } from './props.js';
import { buildPoles, facadeAnchors } from '../town/poles.js';
import { buildLanduse, LOOK } from '../town/landuse.js';
import { farLanduse, TOWN_LU } from '../landmarks/farground.js';
import { tileOf } from './tiles.js';

/** Radii (m, from the focus point to the nearest point of a tile) per quality tier. */
export const RADII = {
  high: { l0: 95, l1: 620, budget: 4.0, still: 2.5 },   // [v4:polish2] still: budget x while the camera stands still
  medium: { l0: 75, l1: 500, budget: 3.2, still: 1.5 },
  low: { l0: 45, l1: 360, budget: 2.4 },
  phone: { l0: 40, l1: 240, budget: 2.0 },   // [v4:phone]
};
const HYST = 70;   // a tile unloads this much farther out than it loads

/**
 * What a tile wants at this view. mode: 'ground' (walk, drive: altitude < 40 m), 'low' (a low drone) or 'high'.
 * Pure: tested in test/v4-explore.test.js.
 */
export function wantLevel(dist, mode, R, current = { l0: false, l1: false }) {
  const l1R = mode === 'ground' ? R.l1 : mode === 'low' ? R.l1 * 1.25 : R.l1 * 1.6;
  const l0R = mode === 'ground' ? R.l0 : 0;
  const l1 = current.l1 ? dist < l1R + HYST : dist < l1R;
  const l0 = l0R > 0 && (current.l0 ? dist < l0R + HYST * 0.6 : dist < l0R);
  return { l0, l1: l1 || l0 };
}

export function createStream(ctx, { tiles, kit, farTown, lotIdx, roadIdx, real2, quality = 'high' }) {
  const L = ctx.L, THREEc = THREE;
  const R = RADII[quality] || RADII.high;
  const sb = new StreamBatch(ctx, { name: 'explore-stream' });
  const T = kit.T, H = kit.H;
  // OSM land use of the far core (car parks, school yards, pitches, parks, cemeteries, fields): each polygon wholly
  // outside town's land-use disc and not painted by landmarks-B streams in with the tile of its first vertex
  let luN = 0;
  try {
    const taken = new Set(farLanduse(L));
    (L.LANDUSE || []).forEach((lu, i) => {
      if (taken.has(i) || !LOOK[lu.cls] || !(lu.ring?.length > 2) || lu.area > 250000) return;
      if (!lu.ring.every(([x, z]) => Math.hypot(x - TOWN_LU.cx, z - TOWN_LU.cz) >= TOWN_LU.r)) return;
      const t = tiles.get(tileOf(lu.ring[0][0], lu.ring[0][1]).key); if (!t) return;
      (t.lu ||= []).push(lu); luN++;
    });
  } catch (e) { console.warn('[explore] land use', e); }
  const st = new Map();          // tile key -> { l1: 'none'|'busy'|'ready', l0: ..., m1: bool }
  const hasL1 = (t) => t.far.length || t.roads.length || t.lu?.length;
  for (const t of tiles.values()) st.set(t.key, { l1: hasL1(t) ? 'none' : 'ready', l0: 'none', m1: false });
  const stats = { built: { m1: 0, l1: 0, l0: 0 }, unloaded: { l1: 0, l0: 0 }, ms: { m1: 0, l1: 0, l0: 0 }, kitLots: 0, kitMs: 0, aborted: 0, jobs: 0, failures: [] };
  const HZ_FAR = { cx: 1e7, cz: 1e7, r: 1 };   // streets: no hero sidewalks outside the hero zone

  // ---------------------------------------------------------------- capture: route a builder's output into a tile
  function makeCap(tag) { return { tag, group: new THREEc.Group(), dyn: new THREEc.Group(), wires: ctx.geo.createWireSystem(), gb: new GB(ctx), laundry: new Laundry(H), out: freshOut(), annex: new Map() }; }
  function freshOut() { return { shops: [], shopFronts: [], warehouses: [], lanterns: [], bikeSpots: [], gates: [], buildingNames: [], bigBuildings: [], windowsHint: 0 }; }
  function step(cap, fn) {
    const saved = { addStatic: ctx.addStatic, add: ctx.add, wires: ctx.wires, tag: ctx.physics.tag, gb: H.gb, laundry: H.laundry, out: T.out, annex: T.annex, lotIdx: T.lotIdx, roadIdx: T.roadIdx, real: T.real, poles: ctx.services.poles };
    ctx.addStatic = (o) => { cap.group.add(o); return o; };
    ctx.add = (o) => { o.traverse((x) => { x.userData.dynamic = true; x.userData.noStream = true; }); cap.dyn.add(o); return o; };
    ctx.wires = cap.wires; ctx.physics.tag = cap.tag;
    H.gb = cap.gb; H.laundry = cap.laundry; T.out = cap.out; T.annex = cap.annex; T.lotIdx = lotIdx; T.roadIdx = roadIdx;
    if (cap.real) T.real = cap.real;
    try { return fn(); }
    finally {
      ctx.addStatic = saved.addStatic; ctx.add = saved.add; ctx.wires = saved.wires; ctx.physics.tag = saved.tag;
      H.gb = saved.gb; H.laundry = saved.laundry; T.out = saved.out; T.annex = saved.annex; T.lotIdx = saved.lotIdx; T.roadIdx = saved.roadIdx; T.real = saved.real;
      ctx.services.poles = saved.poles;   // the pole builder publishes its poles; the town's list stays the town's
    }
  }
  /** Coarse levels share a slot per block of BLOCK x BLOCK tiles (one BatchedMesh instance per pool and block). */
  const BLOCK = 5;
  const slotOf = (prefix, t) => prefix + ':' + Math.floor(t.ix / BLOCK) + ':' + Math.floor(t.iz / BLOCK);
  function commit(key, cap, { visible = true, slot = null } = {}) {
    step(cap, () => { if (cap.gb.bins.size) cap.gb.flush(cap.group, 'explore-kit'); const wm = cap.wires.build(); if (wm) { wm.userData.noStream = true; cap.group.add(wm); } });
    if (cap.dyn.children.length) cap.group.add(cap.dyn);
    const r = sb.add(key, cap.group, { visible, slot });
    return r;
  }
  function dropCap(cap) { ctx.physics.removeTag(cap.tag); }

  // ---------------------------------------------------------------- colliders of the simplified buildings
  function colliders(lots, tag) {
    const P = ctx.physics, prev = P.tag; P.tag = tag;
    try {
      for (const lot of lots) {
        const o = lot.obb, h = Math.max(2.8, Math.min(60, lot.height || 3));
        let W; try { W = wings(lot); } catch { W = { rects: [{ cx: 0, cz: 0, w: o.w, d: o.d }] }; }
        for (const r of W.rects) {
          if (r.w < 1 || r.d < 1) continue;
          const [x, z] = toWorld(o, r.cx, r.cz);
          P.addBox(x, z, Math.max(0.6, r.w - 0.35), Math.max(0.6, r.d - 0.35), o.rotY, lot.groundY - 2, lot.groundY + h + 2);
        }
      }
    } finally { P.tag = prev; }
  }

  // ---------------------------------------------------------------- the base level of the mid-zone lots (at load)
  function buildBase(t) {
    if (!t.mid.length) return;
    const t0 = performance.now();
    const cap = makeCap('m1:' + t.key), names = [];
    step(cap, () => buildMid(ctx, t.mid, { H, roadIdx, names }));
    if (names.length) step(cap, () => { const b = T.real.boards(names); ctx.addStatic(b.group); });
    commit('m1:' + t.key, cap, { slot: slotOf('m1', t) });
    colliders(t.mid, 'm1:' + t.key);
    st.get(t.key).m1 = true;
    stats.built.m1++; stats.ms.m1 += performance.now() - t0;
  }

  // ---------------------------------------------------------------- L1: streets + far lots on their real footprints
  function* jobL1(t) {
    const capS = makeCap('s1:' + t.key), capB = makeCap('f1:' + t.key);
    capB.real = real2;
    try {
      if (t.roads.length) {
        step(capS, () => buildStreets(ctx, { lotIdx, roadIdx, roads: t.roads, heroZone: HZ_FAR, rivers: kit.chIdx })); yield 'streets';
        // 電柱 and their wires along the tile's streets and lanes (the layout's pole runs cover hero / mid streets only)
        step(capS, () => buildPoles(ctx, H, { lotIdx, roadIdx, heroZone: HZ_FAR, facades: facadeAnchors(L, t.far), runs: [], lanes: t.roads })); yield 'poles';
      }
      if (t.lu?.length) {
        const c2 = Object.create(ctx); c2.L = Object.assign({}, L, { LANDUSE: t.lu });
        step(capS, () => buildLanduse(c2, { inside: () => true, heroIn: () => false, lotIdx, roadIdx, low: true, trees: ctx.services.environment?.trees })); yield 'landuse';
      }
      const names = [];
      for (let i = 0; i < t.far.length; i += 48) { const part = t.far.slice(i, i + 48); step(capB, () => buildMid(ctx, part, { H, roadIdx, names })); yield 'mid'; }
      if (names.length) step(capB, () => { const b = real2.boards(names); ctx.addStatic(b.group); });
      colliders(t.far, 'f1:' + t.key);
      commit('s1:' + t.key, capS, { slot: slotOf('s1', t) });
      commit('f1:' + t.key, capB, { visible: st.get(t.key).l0 !== 'ready', slot: slotOf('f1', t) });
      farTown?.hide(t.far.map((l) => l.id));
    } catch (e) { dropCap(capS); dropCap(capB); ctx.physics.removeTag('f1:' + t.key); throw e; }
  }
  function unloadL1(t) {
    sb.remove('s1:' + t.key); sb.remove('f1:' + t.key);
    ctx.physics.removeTag('s1:' + t.key); ctx.physics.removeTag('f1:' + t.key);
    farTown?.show(t.far.map((l) => l.id));
    stats.unloaded.l1++;
  }

  // ---------------------------------------------------------------- L0: the hero kit on every lot of the tile
  function* jobL0(t, focus) {
    const cap = makeCap('k0:' + t.key);
    const lots = t.mid.concat(t.far).sort((a, b) => Math.hypot(a.obb.cx - focus[0], a.obb.cz - focus[1]) - Math.hypot(b.obb.cx - focus[0], b.obb.cz - focus[1]));
    const cls = classifyHero(L, lots, roadIdx);
    const leftovers = [], built = [];
    const near = tileDist(t, focus[0], focus[1]) < 60;
    try {
      for (const lot of lots) {
        const c = cls.get(lot.id);
        // the kit's two finer levels: 2 (full dressing) right around you when the tile is built, 1 elsewhere
        const lod = near && Math.hypot(lot.obb.cx - focus[0], lot.obb.cz - focus[1]) < 55 ? 2 : 1;
        const k0 = performance.now();
        let k = null;
        // the far core's names live in explore's own atlas
        cap.real = lot.zone === 'far' ? real2 : null;
        try { k = c ? step(cap, () => buildHeroLot(T, lot, c, lod)) : null; } catch (e) { k = null; }
        stats.kitMs += performance.now() - k0; stats.kitLots++;
        if (k) built.push(lot); else leftovers.push(lot);
        yield 'lot';
      }
      cap.real = null;
      const annexLots = built.filter((l) => cap.annex.has(l.id));
      const namesMid = [], namesFar = [];
      if (leftovers.length || annexLots.length) {
        const midL = leftovers.filter((l) => l.zone !== 'far'), farL = leftovers.filter((l) => l.zone === 'far');
        step(cap, () => buildMid(ctx, midL.concat(annexLots.filter((l) => l.zone !== 'far')), { H, roadIdx, annex: cap.annex, names: namesMid }));
        cap.real = real2;
        step(cap, () => buildMid(ctx, farL.concat(annexLots.filter((l) => l.zone === 'far')), { H, roadIdx, annex: cap.annex, names: namesFar }));
        cap.real = null;
        if (namesMid.length) step(cap, () => ctx.addStatic(T.real.boards(namesMid).group));
        if (namesFar.length) step(cap, () => ctx.addStatic(real2.boards(namesFar).group));
        colliders(leftovers, 'k0:' + t.key);
        yield 'leftovers';
      }
      step(cap, () => tileProps(ctx, H, cap.out, { lotIdx, roadIdx, seed: t.key }));
      step(cap, () => cap.laundry.build());
      step(cap, () => cap.gb.flush(cap.group, 'explore-kit'));
      // swap: show the kit and hide the simplified buildings of this tile (one change: drawn in the same frame, [v4:polish3])
      sb.group(() => { commit('k0:' + t.key, cap); sb.setVisible('m1:' + t.key, false); sb.setVisible('f1:' + t.key, false); });
      ctx.physics.removeTag('m1:' + t.key); ctx.physics.removeTag('f1:' + t.key);
      stats.lastL0 = { tile: t.key, kit: built.length, simplified: leftovers.length, shops: cap.out.shopFronts.length };
    } catch (e) { dropCap(cap); throw e; }
  }
  function unloadL0(t) {
    const s = st.get(t.key);
    sb.group(() => { sb.remove('k0:' + t.key); if (s.m1) sb.setVisible('m1:' + t.key, true); if (s.l1 === 'ready' && t.far.length) sb.setVisible('f1:' + t.key, true); });
    ctx.physics.removeTag('k0:' + t.key);
    if (s.m1) colliders(t.mid, 'm1:' + t.key);
    if (s.l1 === 'ready' && t.far.length) colliders(t.far, 'f1:' + t.key);
    stats.unloaded.l0++;
  }

  // ---------------------------------------------------------------- scheduler
  let job = null, jobInfo = null, planT = 0, wantList = [];
  const focus = [0, 0];
  let mode = 'high';
  function plan(fx, fz, m) {
    focus[0] = fx; focus[1] = fz; mode = m;
    wantList = [];
    for (const t of tiles.values()) {
      const s = st.get(t.key), d = tileDist(t, fx, fz);
      const w = wantLevel(d, m, R, { l0: s.l0 === 'ready' || s.l0 === 'busy', l1: s.l1 === 'ready' || s.l1 === 'busy' });
      // unload at once (cheap), except the tile under construction
      if (!w.l0 && s.l0 === 'ready') { unloadL0(t); s.l0 = 'none'; }
      if (!w.l1 && s.l1 === 'ready' && hasL1(t) && s.l0 === 'none') { unloadL1(t); s.l1 = 'none'; }
      if (w.l1 && s.l1 === 'none') wantList.push({ t, d, lvl: 'l1' });
      if (w.l0 && s.l0 === 'none') wantList.push({ t, d: d + 25, lvl: 'l0' });
    }
    wantList.sort((a, b) => a.d - b.d);
  }
  function nextJob() {
    for (const w of wantList) {
      const s = st.get(w.t.key);
      if (w.t.failed || w.t._ab === workId) continue;   // a tile whose build threw stays at its current level (never retried in a loop)
      if (w.lvl === 'l1' && s.l1 === 'none') { s.l1 = 'busy'; return { gen: jobL1(w.t), t: w.t, lvl: 'l1', t0: performance.now(), work: 0 }; }
      if (w.lvl === 'l0' && s.l0 === 'none' && s.l1 === 'ready') { s.l0 = 'busy'; return { gen: jobL0(w.t, focus.slice()), t: w.t, lvl: 'l0', t0: performance.now(), work: 0 }; }
    }
    return null;
  }
  function finish(j, ok) {
    const s = st.get(j.t.key);
    s[j.lvl] = ok ? 'ready' : 'none';
    if (ok) { stats.built[j.lvl]++; stats.ms[j.lvl] += j.work; } else stats.aborted++;
    stats.jobs++;
  }
  function stillWanted(j) {
    const s = st.get(j.t.key), d = tileDist(j.t, focus[0], focus[1]);
    return wantLevel(d, mode, R, { l0: true, l1: true })[j.lvl];
  }
  function abort(j) {
    j.t._ab = workId;   // not again in this work() call
    try { j.gen.return(); } catch { /* generator cleanup */ }
    ctx.physics.removeTag((j.lvl === 'l0' ? 'k0:' : 'f1:') + j.t.key); if (j.lvl === 'l1') ctx.physics.removeTag('s1:' + j.t.key);
    finish(j, false);
  }
  /** Run jobs for up to `budget` ms. */
  let workId = 0;
  function work(budget) {
    const t0 = performance.now(); workId++;
    while (performance.now() - t0 < budget) {
      if (!job) { job = nextJob(); if (!job) return false; }
      if (!stillWanted(job)) { abort(job); job = null; continue; }
      const s0 = performance.now();
      let r;
      try { r = job.gen.next(); } catch (e) { console.warn('[explore] tile', job.t.key, job.lvl, e); job.t.failed = String((e && e.stack) || e).slice(0, 600); stats.failures.push({ tile: job.t.key, lvl: job.lvl, error: job.t.failed }); abort(job); job = null; continue; }
      job.work += performance.now() - s0;
      if (r.done) { finish(job, true); job = null; }
    }
    return true;
  }

  stats.landuse = luN;
  const api = {
    sb, tiles, st, stats, R,
    buildBase,
    /** Plan against a focus point and do a frame's worth of work. mode: 'ground' | 'low' | 'high'. */
    update(fx, fz, m, { budget = R.budget, replanEvery = 0.25, dt = 0 } = {}) {
      planT -= dt;
      if (planT <= 0 || m !== mode) { plan(fx, fz, m); planT = replanEvery; }
      else { focus[0] = fx; focus[1] = fz; }
      const busy = work(budget);
      sb.flush(ctx.pipeline?.size, Math.max(3, budget));
      sb.cull(ctx.planet?.active ? null : ctx.camera);
      return busy;
    },
    /** Build (and unload) everything the focus wants, now. */
    settle(fx, fz, m = 'ground', maxMs = 60000) {
      plan(fx, fz, m);
      const t0 = performance.now();
      while (performance.now() - t0 < maxMs) { plan(fx, fz, m); if (!work(1e9) && !job) break; }
      plan(fx, fz, m);
      sb.flush(ctx.pipeline?.size);
      sb.cull(ctx.camera);
      return api.summary();
    },
    level(key) { const s = st.get(key); return s ? { l1: s.l1, l0: s.l0, m1: s.m1 } : null; },
    flush: () => sb.flush(ctx.pipeline?.size),
    summary() {
      let l0 = 0, l1 = 0, m1 = 0;
      for (const [k, s] of st) { if (s.l0 === 'ready') l0++; if (s.l1 === 'ready' && hasL1(tiles.get(k))) l1++; if (s.m1) m1++; }
      return { tiles: tiles.size, l0, l1, m1, busy: !!job, pending: wantList.length, batch: sb.stats(), colliders: ctx.physics.tagged(), built: { ...stats.built }, unloaded: { ...stats.unloaded }, kitMsPerLot: stats.kitLots ? +(stats.kitMs / stats.kitLots).toFixed(2) : 0, aborted: stats.aborted, failures: stats.failures.length, farHidden: farTown?.hiddenCount ?? 0 };
    },
  };
  return api;
}
