// [v3:harbor] The harbour on the real layout (src/anime/world/layout.js): quays and seawalls from QUAYS, the fish
// market on its landmark lots, moored boats in rows, 浮見堂 / 五十鈴神社 / 安波山, both bridges, buoys and gulls.
// Called by build(ctx) in ./index.js (the world module "harbor"). Publishes ctx.services.harbor.
import { buildPromenadeStall, promAt, PROM } from './stall.js';   // [v3:fix]
import { buildCherries } from '../town/cherry/index.js';   // [v3:fix]
import { buildUnloadScene } from './unload.js';   // [v3:fix]
import { bridgeExtras } from './traffic.js';   // [v3:fix]
import * as THREE from 'three';
import { buildQuay } from './quay.js';
import { buildBoat, BOAT_SPECS, mooringLines } from './boats.js';
import { buildFishMarketLots } from './market.js';
import { buildUkimido, buildIsuzuTorii, buildIsuzuShrine, buildAnbaLookout } from './shrine.js';
import { buildBridgeKanae, buildBridgeOshima } from './bridges.js';
import { buildGulls } from './gulls.js';
import { hmats, buoy } from './props.js';
import { nightUniform, registry, addGlint } from './lights.js';   // [v3:fix] registry, addGlint: channel lights
import { buildMooringRows, rowDist } from './rows.js';
import { createArrivals, slotAvoid } from './arrivals.js';
import { buildShrineGrove } from './grove.js';
import { buildReflection } from './reflect.js';

const D2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Chain consecutive QUAYS pieces (same kind, touching, gentle turns) into polylines with the water on the left. */
export function quayChains(L, { maxTurn = 0.45 } = {}) {
  const Q = L.QUAYS || [];
  const chains = [];
  let cur = null;
  const dirOf = (q) => Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]);
  for (const q of Q) {
    const ok = cur && cur.kind === q.kind && D2(cur.pts[cur.pts.length - 1], q.a) < 0.6 && Math.abs(((dirOf(q) - cur.lastDir + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < maxTurn;
    if (!ok) { cur = { kind: q.kind, zone: q.zone, pts: [q.a.slice()], tops: [], lastDir: 0 }; chains.push(cur); }
    cur.pts.push(q.b.slice()); cur.tops.push(q.top); cur.lastDir = dirOf(q);
    if (q.zone === 'hero') cur.zone = 'hero';
  }
  // orient: water on the left of a->b (normal (uz, -ux)) by majority vote
  const isWater = L.isWater || (() => false);
  for (const c of chains) {
    let left = 0, right = 0;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const a = c.pts[i], b = c.pts[i + 1], len = D2(a, b); if (len < 0.5) continue;
      const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (isWater(mx + uz * 6, mz - ux * 6)) left++;
      if (isWater(mx - uz * 6, mz + ux * 6)) right++;
    }
    if (right > left) { c.pts.reverse(); c.tops.reverse(); }
    c.len = 0; for (let i = 0; i < c.pts.length - 1; i++) c.len += D2(c.pts[i], c.pts[i + 1]);
  }
  return chains;
}

/** Straight runs (turn < maxTurn) of a chain, at least minLen long: [{ a, b, len, top }]. */
function straightRuns(c, minLen = 40, maxTurn = 0.12) {
  const runs = []; let s = 0;
  const dir = (i) => Math.atan2(c.pts[i + 1][1] - c.pts[i][1], c.pts[i + 1][0] - c.pts[i][0]);
  for (let i = 1; i <= c.pts.length - 1; i++) {
    const end = i === c.pts.length - 1 || Math.abs(((dir(i) - dir(s) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > maxTurn;
    if (end) { const a = c.pts[s], b = c.pts[i], len = D2(a, b); if (len >= minLen) runs.push({ a, b, len, top: c.tops[s] ?? 2 }); s = i; }
  }
  return runs;
}

/** Moor boats along a straight berth, checking every hull corner is on water. Returns built boats. */
function moorRun(ctx, run, types, r, { fender = 1.0, gap = 4, isWater, max = 99, raft = 0, avoid = [] } = {}) {
  const { a, b, len } = run; const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = uz, nz = -ux;
  const boats = []; let s = 5 + r() * 6, i = 0;
  while (s < len - 8 && boats.length < max) {
    const type = types[i % types.length], S = BOAT_SPECS[type];
    if (s + S.L > len - 2) break;
    const along = s + S.L / 2, off = fender + S.B / 2;
    const cx = a[0] + ux * along + nx * off, cz = a[1] + uz * along + nz * off;
    const corners = [[-S.L / 2, -S.B / 2], [S.L / 2, -S.B / 2], [-S.L / 2, S.B / 2], [S.L / 2, S.B / 2], [0, 0]];
    const wet = corners.every(([l, w]) => isWater(cx + ux * l + nx * w, cz + uz * l + nz * w));
    const free = !avoid.some(([x, z, rr]) => Math.hypot(cx - x, cz - z) < rr + S.L / 2);   // arrival berths stay open
    if (wet && free) {
      const fwd = r.chance(0.5) ? 1 : -1;
      const bt = buildBoat(ctx, type, { x: cx, y: 0, z: cz, rotY: Math.atan2(ux * fwd, uz * fwd) }, { seed: `${type}|${Math.round(cx)}|${Math.round(cz)}`, flags: type === 'katsuo' && r.chance(0.5) });
      boats.push(bt);
      if (run.top != null) bt.ties = mooringLines(ctx, bt, a, b, run.top);
      // rafted second boat (small boats tie up two abreast)
      if (raft && type === 'small' && r.chance(raft)) {
        const off2 = off + S.B + 0.8, x2 = a[0] + ux * along + nx * off2, z2 = a[1] + uz * along + nz * off2;
        if (isWater(x2, z2)) boats.push(buildBoat(ctx, 'small', { x: x2, y: 0, z: z2, rotY: Math.atan2(ux * fwd, uz * fwd) }, { seed: `small2|${Math.round(x2)}|${Math.round(z2)}` }));
      }
      s += S.L + gap + r.range(0, 5); i++;
    } else s += 6;
  }
  return boats;
}

export function buildHarbor(ctx, opts = {}) {
  const L = ctx.L; const t0 = performance.now();
  const r = ctx.rng(opts.seed ?? 'harbor');
  const isWater = (x, z) => (L.isWater ? L.isWater(x, z) : false);
  nightUniform(ctx);
  const SP = L.SPOTS || {};
  const out = { quays: [], boats: [], perches: [], seats: [], berths: [], stats: {} };
  const low = ctx.quality?.name === 'low';

  // ---- fish market lots and the market quay (QUAYS near the market become working quays, no seawall)
  const marketLots = (L.LOTS || []).filter((l) => l.kind === 'landmark' && Math.hypot(l.obb.cx - (SP.fishMarket?.x ?? 596), l.obb.cz - (SP.fishMarket?.z ?? 777)) < 450);
  const nearMarket = (x, z) => marketLots.some((l) => Math.hypot(l.obb.cx - x, l.obb.cz - z) < Math.max(l.obb.w, l.obb.d) / 2 + 70);

  // ---- quays
  const chains = quayChains(L);
  for (const c of chains) {
    if (c.kind === 'beach' && opts.beaches !== true) continue;          // sand is the environment's terrain skin
    const hero = c.zone === 'hero';
    // one quay piece per straight run (chord of the chain): far fewer meshes than one per 24 m layout piece
    for (const run of straightRuns(c, 0, 0.1)) {
      const a = run.a, b = run.b; if (D2(a, b) < 0.8) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let kind = c.kind;
      if (nearMarket(mx, mz) || (kind === 'seawall' && rowDist(mx, mz) < 12)) kind = 'quay';
      const tq = performance.now();
      const q = buildQuay(ctx, a, b, {
        kind, top: run.top ?? 2, apron: kind === 'quay' ? 4 : kind === 'promenade' ? 7 : 3.2,
        props: hero && !low, lod: hero ? 'hero' : 'mid', windows: hero, noLand: false,
        setback: 1.4, seed: `q|${Math.round(mx)}|${Math.round(mz)}`,
      });
      const kk = kind + (hero ? ':hero' : ':mid'); (out.stats.kindMs ||= {})[kk] = Math.round(((out.stats.kindMs[kk] || 0) + performance.now() - tq) * 10) / 10;
      (out.stats.kindLen ||= {})[kk] = Math.round((out.stats.kindLen[kk] || 0) + D2(a, b));
      out.quays.push(q);
      out.perches.push(...q.bollards.filter((_, j) => j % 2 === 0), ...q.perches);
      (out.bollards ||= []).push(...q.bollards.filter((_, j) => j % 2 === 1));   // [v3:life] the caps gulls never use: cats sit there
      out.seats.push(...q.seats);
    }
  }
  // [v3:fix] the promenade's fish stall (暖簾 + hand-painted kanban) and a cat's bollard ahead of the hero walk spot
  if (opts.stall !== false) { try { buildPromenadeStall(ctx, out); } catch (e) { console.warn('[harbor] promenade stall', e); } }
  out.stats.quayMs = Math.round(performance.now() - t0);
  out.stats.quayPieces = out.quays.length;

  // ---- market halls on their lots
  if (marketLots.length && opts.market !== false) {
    const mk = buildFishMarketLots(ctx, marketLots, { isWater });
    // life puts its market crews at workSpots[0], [3], [6]: lead with the spots around the central arrival berths
    const HB = { x: 669, z: 847 };
    mk.workSpots.sort((p, q) => Math.hypot(p.x - HB.x, p.z - HB.z) - Math.hypot(q.x - HB.x, q.z - HB.z));
    out.market = mk; out.perches.push(...mk.perches); out.berths.push(...mk.berths.map((b) => ({ ...b, where: 'market' })));
    // [v3:fix] the skipjack unloading scene beside the hero arrival berth (boxes, forklifts, fish rows, crew spots)
    if (!low) { try { mk.unload = buildUnloadScene(ctx, mk); } catch (e) { console.warn('[harbor] unload scene', e); } }
  }

  // ---- boats: market berths (big boats), inner-bay quays (small boats + a few big ones)
  const maxBoats = opts.maxBoats ?? (low ? 18 : 64);   // [v3:fix] a full harbour (was 12 / 30: the quays read empty)
  const marketTypes = ['katsuo', 'katsuo', 'maguro', 'sanma', 'katsuo', 'maguro'];
  for (const bth of out.berths) {
    if (out.boats.length >= maxBoats) break;
    const len = D2(bth.a, bth.b);
    out.boats.push(...moorRun(ctx, { a: bth.a, b: bth.b, len, top: bth.top }, marketTypes, r, { fender: 1.0, gap: 5, isWater, max: Math.min(low ? 6 : 10, maxBoats - out.boats.length), avoid: opts.arrivals === false ? [] : slotAvoid() }));   // [v3:fix] up to 10 per berth
  }
  // [v3:fix] the 内湾 south quay (南町, east of Pier 7): working boats moored alongside in a row, as on the aerial photo
  // (data/ortho/core.jpg: eight to ten hulls between x 168 and 400)
  const SOUTH = { a: [170, 60], b: [398, 101] };   // shared with the hero-run filter below
  if (opts.southQuay !== false) {
    const run = { a: SOUTH.a, b: SOUTH.b }; run.len = D2(run.a, run.b); run.top = 2.2;
    out.boats.push(...moorRun(ctx, run, ['sanma', 'small', 'maguro', 'small', 'small', 'sanma', 'small', 'katsuo'], r, { fender: 1.0, gap: 4, isWater, max: low ? 4 : 10, raft: 0.4 }));
  }
  const heroRuns = [];
  const southD = (q) => { const m = { x: (q.a[0] + q.b[0]) / 2, z: (q.a[1] + q.b[1]) / 2 }; return segDist(m, SOUTH); };
  for (const c of chains) if (c.zone === 'hero' && (c.kind === 'quay' || c.kind === 'seawall' || c.kind === 'promenade')) heroRuns.push(...straightRuns(c, 30).filter((q) => (opts.rows === false || rowDist((q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2) > 14) && (opts.southQuay === false || southD(q) > 14)));
  heroRuns.sort((p, q) => q.len - p.len);
  const heroTypes = ['small', 'sanma', 'small', 'small', 'maguro', 'small', 'katsuo', 'small', 'sanma'];   // [v3:fix] more working hulls in the inner bay
  for (const run of heroRuns) {
    if (out.boats.length >= maxBoats) break;
    out.boats.push(...moorRun(ctx, run, heroTypes.slice(r.int(0, 3)).concat(heroTypes), r, { fender: 0.9, gap: 3, isWater, max: Math.min(low ? 5 : 9, maxBoats - out.boats.length), raft: 0.45 }));   // [v3:fix] 9 per run
  }
  // the Oshima ferry at the ferry pier
  const fp = SP.ferryPiers?.[0];
  if (fp && opts.ferry !== false) {
    // berth parallel to the nearest hero run
    const run = heroRuns.slice().sort((p, q) => segDist(fp, p) - segDist(fp, q))[0];
    if (run) {
      const len = run.len, ux = (run.b[0] - run.a[0]) / len, uz = (run.b[1] - run.a[1]) / len;
      const t = Math.max(22, Math.min(len - 22, (fp.x - run.a[0]) * ux + (fp.z - run.a[1]) * uz));
      const x = run.a[0] + ux * t + uz * 6.2, z = run.a[1] + uz * t - ux * 6.2;
      if (isWater(x, z)) out.boats.push(buildBoat(ctx, 'ferry', { x, y: 0, z, rotY: Math.atan2(ux, uz) }, { seed: 'ferry', name: 'うみねこ丸' }));
    }
  }
  // the stern-to rows of longliners on the east quays (Kesennuma's signature harbour picture)
  if (opts.rows !== false) {
    const tr = performance.now();
    out.rows = buildMooringRows(ctx, { isWater, lite: low });
    for (const { boat } of out.rows) out.boats.push(boat);
    out.stats.rows = out.rows.length; out.stats.rowsMs = Math.round(performance.now() - tr);
  }
  for (const b of out.boats) out.perches.push(...b.perches);
  out.stats.boats = out.boats.length; out.stats.boatsMs = Math.round(performance.now() - t0);

  // ---- 神明崎: 浮見堂, torii, shrine
  if (SP.ukimido) {
    const u = SP.ukimido; let len = 10;
    // walkway toward local -Z (rotY) until the shore
    const dx = -Math.sin(u.rotY || 0), dz = -Math.cos(u.rotY || 0);
    for (let d = 4; d < 60; d += 1) if (!isWater(u.x + dx * d, u.z + dz * d)) { len = d - 1.5; break; }
    out.ukimido = buildUkimido(ctx, { x: u.x, z: u.z, rotY: u.rotY || 0 }, { bridgeLen: Math.max(6, len), deckH: Math.max(1.8, (u.y ?? 1.6) + 0.4) });
    out.perches.push(...out.ukimido.perches);
    // [v3:fix] the shrine's small sea-side torii where the 浮見堂 walkway leaves the rocks (wow frame 4 holds the pavilion
    // and a torii of 五十鈴神社 together; the main torii stands 125 m north at the road, hidden by the grove)
    const sh = out.ukimido.shore;
    if (sh) {
      const tx = sh.x + dx * 2.2, tz = sh.z + dz * 2.2;
      const ty = Math.max(L.heightAt(tx, tz), sh.y - 0.15);
      out.seaTorii = buildIsuzuTorii(ctx, { x: tx, y: ty, z: tz, rotY: u.rotY || 0 }, { h: 4.3, span: 2.9 });
      out.perches.push(...out.seaTorii.perches);
    }
  }
  if (SP.isuzuTorii) out.torii = buildIsuzuTorii(ctx, { x: SP.isuzuTorii.x, y: SP.isuzuTorii.y, z: SP.isuzuTorii.z, rotY: SP.isuzuTorii.rotY ?? Math.PI });
  if (SP.isuzuShrine) out.shrine = buildIsuzuShrine(ctx, { x: SP.isuzuShrine.x, y: SP.isuzuShrine.y, z: SP.isuzuShrine.z, rotY: SP.isuzuShrine.rotY ?? Math.PI }, { steps: 10 });
  // 鎮守の森 on 神明崎: dense grove, clearings for the shrine, the torii approach and the pavilion's shore end
  if (opts.grove !== false && SP.shinmeizaki) {
    const keep = [];
    if (SP.isuzuShrine) keep.push([SP.isuzuShrine.x, SP.isuzuShrine.z, 12]);
    if (SP.isuzuTorii) keep.push([SP.isuzuTorii.x, SP.isuzuTorii.z, 6]);
    if (SP.isuzuShrine && SP.isuzuTorii) for (let t = 0; t <= 1; t += 0.1) keep.push([SP.isuzuTorii.x + (SP.isuzuShrine.x - SP.isuzuTorii.x) * t, SP.isuzuTorii.z + (SP.isuzuShrine.z - SP.isuzuTorii.z) * t, 4]);
    if (out.ukimido?.shore) keep.push([out.ukimido.shore.x, out.ukimido.shore.z, 9]);   // [v3:fix] 9 m: the sea-side torii stands here
    const zN = (SP.isuzuTorii?.z ?? -150) - 4;   // the peninsula only (south of the road past the torii)
    out.grove = buildShrineGrove(ctx, { center: SP.shinmeizaki, r: 85, keep, clip: (x, z) => z > zN && x > 312 && x < 400 });
    out.stats.grove = out.grove.count;
    // the terrain's painted 紅葉 crowns read as flat red decals under a real grove: quiet them on the peninsula
    ctx.services.environment?.terrainMaterial?.userData?.uniforms?.uQuiet?.value.set(SP.shinmeizaki.x, SP.shinmeizaki.z, 95);
  }
  // [v3:fix] spring cherry trees at the hero stops (shown in spring only): the promenade lawn, the 浮見堂 walkway, Pier 7
  if (opts.cherries !== false && !low) {
    const where = [];
    const n = [-PROM.n[0], -PROM.n[1]];
    for (const [i, s] of [26, 38, 50, 62, 76, -9, -23].entries()) { const [x, z] = promAt(s, 8.4); where.push({ id: 'prom-' + i, x, z, lod: i < 2 ? 0 : 1, lean: [n[0] * 0.5, n[1] * 0.5], big: i === 1 }); }
    const sh = out.ukimido?.shore, u = SP.ukimido;
    if (sh && u) {
      const dx = -Math.sin(u.rotY || 0), dz = -Math.cos(u.rotY || 0), px = -dz, pz = dx;
      for (const [i, side] of [-1, 1].entries()) where.push({ id: 'uki-' + i, x: sh.x + dx * 7 + px * side * 6, z: sh.z + dz * 7 + pz * side * 6, lod: 0, lean: [-dx * 0.6, -dz * 0.6], big: i === 0 });
    }
    if (SP.pier7) for (const [i, [ox, oz]] of [[-12, -14], [-22, -4], [6, -22], [-4, -28]].entries()) where.push({ id: 'p7-' + i, x: SP.pier7.x + ox, z: SP.pier7.z + oz, lod: 1 });
    const tc = performance.now();
    try { out.cherries = buildCherries(ctx, where); out.stats.cherries = { specs: out.cherries.specs, ms: Math.round(performance.now() - tc) }; } catch (e) { console.warn('[harbor] cherries', e); }
  }
  // painted reflections on the water: 浮見堂 and the small boats of the inner bay
  if (opts.reflections !== false && !low) {
    const bay = SP.innerBay || { x: 156, z: -33 };
    const src = [out.ukimido?.group, ...out.boats.filter((b) => (b.type === 'small' || b.type === 'ferry') && Math.hypot(b.group.position.x - bay.x, b.group.position.z - bay.z) < 320).map((b) => b.group)];
    const rf = buildReflection(ctx, src, { name: 'harbor-reflections', fade: 17, strength: 0.7 });   // [v3:fix] fade 9 -> 17 m: the pavilion's roof mirrors too
    out.stats.reflectionTris = rf?.tris || 0;
  }
  if (SP.anbaLookout) {
    const a = SP.anbaLookout, bay = SP.innerBay || { x: 156, z: -33 };
    out.anba = buildAnbaLookout(ctx, { x: a.x, y: a.y, z: a.z, rotY: Math.atan2(bay.x - a.x, bay.z - a.z) });
  }

  // ---- bridges: axis fitted to the real crossing (narrowest water crossing through the verified main-span centre),
  // unless the layout gives towers that stand at the water. Real: Kanae main span 360 m / total 1344 m / 100 m
  // inverted-Y pylons; Oshima arch span 297 m / total 356 m.
  if (opts.bridges !== false) {
    const K = SP.kanae || {};
    const towersWet = false;   // [v3:fix] always fit through the verified centre on the known axis (layout towers are informative only)
    // [v3:fix] the real axis: GSI RdCL 2703 over-water segments (1624.5, 1237.2) -> (1447.7, 1541.6) run at 120 deg
    // (matches the ortho); the narrowest-crossing guess gave 110 deg and put the pylons ~32 m off the true line
    const kfit = towersWet ? null : fitCrossing(L, K.center || KANAE_CENTRE, { half: 672, crest: K.deckY ?? 34, deg: KANAE_DEG });
    const ka = kfit ? kfit.a : K.a, kb = kfit ? kfit.b : K.b;
    if (ka && kb) {
      out.kanae = buildBridgeKanae(ctx, ka, kb, { deckY: K.deckY ?? 34, centerAt: kfit?.centerAt, mainSpan: towersWet ? D2(K.towers[0], K.towers[1]) : 360 });
      try { out.stats.kanaeExtras = bridgeExtras(ctx, out.kanae, { width: 13 }); } catch (e) { console.warn('[harbor] kanae extras', e); }   // [v3:fix] portal + traffic
      out.perches.push(...out.kanae.perches); out.stats.kanae = kfit ? { fitted: true, deg: kfit.deg, water: kfit.water } : { fitted: false };
    }
    const O = SP.oshima || {};
    const ofit = fitCrossing(L, O.center || OSHIMA_CENTRE, { half: 178, crest: 30 });
    if (ofit) {
      out.oshima = buildBridgeOshima(ctx, ofit.a, ofit.b, { deckY: 30, centerAt: ofit.centerAt, archSpan: 297, springY: 5 });
      // [v3:fix] the deck and arch (> 8 m up) cast no sun shadow: with the 13 deg anime key light their shadows landed
      // ~110 m away as a dark outlined slab in open water (the 大島 walk view); piers and abutments still cast
      noHighShadows(out.oshima.group, 8);
      out.stats.oshima = { deg: ofit.deg, water: ofit.water };
    }
  }

  // ---- channel buoys in the inner bay
  if (SP.innerBay) {
    const k = ctx.kit(ctx.staticRoot), M = hmats(ctx);
    const c = SP.innerBay;
    for (const [dx, dz, kind] of [[-40, 30, 'mooring'], [30, 45, 'mooring'], [60, -20, 'mooring'], [-70, -10, 'red'], [90, 60, 'green']]) {
      if (!isWater(c.x + dx, c.z + dz)) continue;
      buoy(ctx, k, M, c.x + dx, 0, c.z + dz, kind);
      // [v3:fix] red / green channel lights on the bay at night, with their reflections
      if (kind !== 'mooring') {
        const col = kind === 'red' ? '#ff4a3a' : '#48ff86';
        registry(ctx)?.point({ x: c.x + dx, y: 2.6, z: c.z + dz, color: col, size: 0.55, intensity: 2.4, mode: 'night' });
        addGlint(ctx, c.x + dx, 0, c.z + dz + 2, col, 0.4, 7, 0.8);
      }
    }
    // [v3:fix] harbour entrance lights on the bay mouth breakwaters (red on the east side, green on the west), market channel
    for (const [x, z, col] of [[420, 330, '#48ff86'], [560, 150, '#ff4a3a'], [700, 560, '#ff4a3a'], [470, 600, '#48ff86']]) {
      if (!isWater(x, z)) continue;
      buoy(ctx, k, M, x, 0, z, col === '#ff4a3a' ? 'red' : 'green');
      registry(ctx)?.point({ x, y: 2.6, z, color: col, size: 0.6, intensity: 2.4, mode: 'night' });
      addGlint(ctx, x, 0, z + 2, col, 0.45, 8, 0.8);
    }
  }

  // ---- gulls: circling flocks over the inner bay and the market, sitters on bollards, masts and the pavilion
  if (opts.gulls !== false) {
    const flocks = [];
    if (SP.innerBay) flocks.push({ center: [SP.innerBay.x, 4, SP.innerBay.z], radius: 90, count: 14, height: 14 });
    if (SP.fishMarket) flocks.push({ center: [SP.fishMarket.x + 30, 4, SP.fishMarket.z], radius: 70, count: 16, height: 10 });
    flocks.push({ center: [684, 3, 850], radius: 26, count: 9, height: 8 });    // over the central unloading berths (ウミネコ wait for scraps)
    if (SP.pier7) flocks.push({ center: [SP.pier7.x, 3, SP.pier7.z - 20], radius: 35, count: 6, height: 7 });
    const perchPts = out.perches.map((p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]));
    out.gulls = buildGulls(ctx, { flocks, perches: perchPts, perchCount: Math.min(40, Math.round(perchPts.length * 0.15)), seed: 'harbor-gulls' });
  }

  // ---- arriving boats (today's 入船情報 from life's ctx.services.arrivals, or setArrivals(list) directly)
  if (opts.arrivals !== false) out.arrivals = createArrivals(ctx, { isWater });

  out.stats.ms = Math.round(performance.now() - t0);
  ctx.services.harbor = {
    setArrivals: (list, o) => out.arrivals?.setArrivals(list, o), arrivals: () => out.arrivals?.state() || [],
    rows: (out.rows || []).length,
    boats: out.boats.map((b) => ({ type: b.type, name: b.name, x: b.group.position.x, z: b.group.position.z, rotY: b.group.rotation.y, L: b.spec.L, B: b.spec.B, perches: b.perches, deck: b.anchors.deck })),
    berths: out.berths, perches: out.perches, seats: out.seats, bollards: out.bollards || [],   // [v3:life] bollards
    market: out.market ? { halls: out.market.halls, workSpots: out.market.workSpots, forklifts: out.market.forklifts.length + (out.market.unload ? 2 : 0), crew: out.market.unload?.crew || [] } : null,   // [v3:fix] crew
    ukimido: out.ukimido ? { walk: out.ukimido.walk, deckY: out.ukimido.deckY } : null,
    anbaEye: out.anba?.eye || null, bridges: { kanae: out.kanae?.towers || null, oshima: out.oshima?.towers || null },
    gulls: out.gulls ? { count: out.gulls.count, positions: out.gulls.positions } : null,
    stats: out.stats,
  };
  return out;
}

function segDist(p, run) {
  const ax = run.a[0], az = run.a[1], bx = run.b[0], bz = run.b[1];
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
  return Math.hypot(p.x - ax - dx * t, p.z - az - dz * t);
}

// verified main-span centres (data/landmarks.json: 38.8928 N 141.5922 E; 38.87875 N 141.60625 E)
const KANAE_CENTRE = { x: 1492.0, z: 1465.4 };
export const KANAE_DEG = 120;   // [v3:fix] atan2(dz, dx) of the GSI over-water centre-line
const OSHIMA_CENTRE = { x: 2710.8, z: 3025.1 };
function nearWater(isWater, x, z, r) { for (let a = 0; a < 6.28; a += 0.8) if (isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true; return isWater(x, z); }

/**
 * Fit a bridge axis through centre c: the direction with the narrowest water crossing (5 deg steps), half-length
 * `half` each way, shortened where the terrain climbs to the deck (the deck runs into the hillside there).
 * Returns { a:[x,y,z], b:[x,y,z], centerAt, deg, water } or null.
 */
export function fitCrossing(L, c, { half = 600, crest = 32, deg: fixedDeg = null } = {}) {
  if (!L.isWater || !L.heightAt) return null;
  let best = null;
  for (let deg = fixedDeg ?? 0; deg < (fixedDeg != null ? fixedDeg + 1 : 180); deg += 5) {   // [v3:fix] fixedDeg: a known axis
    const r = deg * Math.PI / 180, ux = Math.cos(r), uz = Math.sin(r);
    let lo = 0, hi = 0;
    while (lo < 3000 && L.isWater(c.x - ux * lo, c.z - uz * lo)) lo += 5;
    while (hi < 3000 && L.isWater(c.x + ux * hi, c.z + uz * hi)) hi += 5;
    if (!best || lo + hi < best.w) best = { w: lo + hi, lo, hi, ux, uz, deg };
  }
  if (!best) return null;
  const end = (sgn, water) => {
    for (let t = water + 10; t <= half; t += 5) {
      const x = c.x + sgn * best.ux * t, z = c.z + sgn * best.uz * t, g = L.heightAt(x, z);
      if (g >= crest - 4) return { t, y: g + 0.6 };
    }
    const x = c.x + sgn * best.ux * half, z = c.z + sgn * best.uz * half;
    return { t: half, y: Math.max(8, L.heightAt(x, z) + 6) };
  };
  const A = end(-1, best.lo), B = end(1, best.hi);
  const a = [c.x - best.ux * A.t, A.y, c.z - best.uz * A.t], b = [c.x + best.ux * B.t, B.y, c.z + best.uz * B.t];
  return { a, b, centerAt: A.t, deg: best.deg, water: best.w };
}

// [v3:fix] meshes of a bridge group whose lowest point is more than minY above the sea cast no shadows
function noHighShadows(group, minY) {
  if (!group) return;
  group.updateMatrixWorld(true);
  const b = new THREE.Box3();
  group.traverse((o) => { if (!o.isMesh) return; b.setFromObject(o); if (b.min.y > minY) o.castShadow = false; });
}
