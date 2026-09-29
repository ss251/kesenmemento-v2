// [v3:town] The town of Kesennuma on the real layout (V3-SPEC section 4, package "town"):
//   hero  (inner-bay ring)  Sakura-grade houses, apartments, shops with glimpsed interiors (shops.js), port warehouses
//                           and processing plants with rusted corrugated walls (industrial.js), front yards;
//   mid                     simplified anime buildings (mid.js, procedural facades from facade.js);
//   far                     every remaining footprint, instanced (far.js);
//   streets                 asphalt, sidewalks, curbs, gutters, markings, signs, mirrors, guardrails (streets.js);
//   poles                   utility poles on POLE_RUNS with dense sagging wires and service drops (poles.js);
//   props                   vending machines, bicycles, street trees, domestic clutter (props.js).
// Fictional shop / company names in natural Japanese (names.js); no real brands.
// Publishes ctx.services.town, ctx.services.street, ctx.services.poles. Engine credit: Sakuragaoka Station (MIT).
import * as THREE from 'three';
import { makeH, makeLotIndex, makeRoadIndex } from './common.js';
import { makeSigns } from './signs.js';
import { shopMaterials, makeAwnings } from './shops.js';
import { industrialTextures, industrialMaterials } from './industrial.js';
import { classifyHero, buildHeroLot } from './hero.js';
import { buildMid } from './mid.js';
import { buildFar } from './far.js';
import { buildStreets } from './streets.js';
import { buildPoles, facadeAnchors } from './poles.js';
import { buildProps } from './props.js';
import { buildLaneLanterns } from './lanes.js';   // [v3:fix]
import { lights } from '../life/lights.js';
import { buildParking } from './parking.js';
import { buildGardens } from './gardens.js';
import { makeNameAtlas } from './blocks.js';

export async function build(ctx) {
  const L = ctx.L;
  const t0 = performance.now();
  const ms = {};
  const tris = {};
  const triCount = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.geometry) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); } }); return Math.round(n); };
  let gbLast = 0, stLast = 0;
  const px = {}; let pxLast = 0;
  const lap = (k, t) => { px[k] = +((ctx.tex.pixels - pxLast) / 1e6).toFixed(2); pxLast = ctx.tex.pixels; ms[k] = Math.round(performance.now() - t); const st = triCount(ctx.staticRoot) + triCount(ctx.dynamicRoot); tris[k] = { gb: Math.round((H?.gb?.tris || 0) - gbLast), scene: st - stLast }; gbLast = H?.gb?.tris || 0; stLast = st; return performance.now(); };
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const heroR = L.ZONES.hero.r * (ctx.quality?.heroR ?? 1);
  const heroZone = { cx: L.ZONES.hero.cx, cz: L.ZONES.hero.cz, r: L.ZONES.hero.r };
  const focus = L.HERO.walk;
  const low = ctx.quality?.name === 'low', medium = ctx.quality?.name === 'medium';

  const H = makeH(ctx);
  const pxKit = ctx.tex.pixels;
  const root = new THREE.Group(); root.name = 'town';
  const heroLots = L.LOTS.filter((l) => l.zone === 'hero');
  const midLots = L.LOTS.filter((l) => l.zone === 'mid');
  const farLots = L.LOTS.filter((l) => l.zone === 'far');
  const lotIdx = makeLotIndex(heroLots.concat(midLots));
  const roads = L.ROADS.filter((r) => r.zone !== 'far');
  const roadIdx = makeRoadIndex(roads);
  let t = lap('index', t0);

  // ------------------------------------------------------------------ hero buildings
  const signs = makeSigns(ctx);
  const SM = shopMaterials(ctx, signs);
  const awn = makeAwnings(ctx);
  const IM = industrialMaterials(ctx, industrialTextures(ctx));
  const out = { shops: [], shopFronts: [], warehouses: [], lanterns: [], bikeSpots: [], gates: [], buildingNames: [], bigBuildings: [], windowsHint: 0 };
  const names = makeNameAtlas(ctx);
  const T = { H, SM, IM, signs, awn, out, shopCounter: 0, lotIdx, roadIdx, names, nameMat: ctx.mat.toon('#ffffff', { map: names.tex, paint: 0.01 }) };
  t = lap('textures', t);
  const cls = classifyHero(L, heroLots, roadIdx);
  const built = new Set(), counts = {};
  const quick = params.get('townlod');          // debug: force a LOD
  const kindMs = {}, kindTris = {}, kindN = {};
  // detail focus: the promenade walk spot and the street hearts of 八日町, 魚町, 南町 and the waterfront road
  const FOCI = [[focus.x, focus.z], [-110, -170], [90, -190], [-160, 70], [150, -125], [30, -60], [200, -200]];
  for (const lot of heroLots) {
    const d = Math.min(...FOCI.map(([fx, fz]) => Math.hypot(lot.obb.cx - fx, lot.obb.cz - fz)));
    const inR = Math.hypot(lot.obb.cx - heroZone.cx, lot.obb.cz - heroZone.cz) <= heroR;
    const lod = quick !== null ? Number(quick) : !inR ? 0 : d < 100 ? 2 : d < 220 ? 1 : 0;
    // quiet back lots far from every street heart: the simplified builder (same palette, roof shapes, facades)
    if (lod === 0 && quick === null && (lot.kind === 'house' || lot.kind === 'apartment') && cls.get(lot.id)?.kind !== 'shop') { continue; }
    try {
      const tk = performance.now(), g0 = H.gb.tris;
      const k = buildHeroLot(T, lot, cls.get(lot.id), lod);
      if (k) { built.add(lot.id); counts[k] = (counts[k] || 0) + 1; kindMs[k + lod] = (kindMs[k + lod] || 0) + performance.now() - tk; kindTris[k + lod] = (kindTris[k + lod] || 0) + H.gb.tris - g0; kindN[k + lod] = (kindN[k + lod] || 0) + 1; }
    } catch (e) { console.warn('[town] lot', lot.id, e); }
  }
  t = lap('hero', t);

  // ------------------------------------------------------------------ streets, poles, props (hero detail through the kit batcher)
  const street = buildStreets(ctx, { lotIdx, roadIdx, roads, heroZone });
  t = lap('streets', t);
  const poles = buildPoles(ctx, H, { lotIdx, roadIdx, heroZone, facades: facadeAnchors(L, heroLots.filter((l) => built.has(l.id))) });
  t = lap('poles', t);
  const parking = buildParking(ctx, H, { lotIdx, roadIdx, heroZone, asphaltTex: street.tex.asphalt, lineTex: street.tex.line, signs, SM, foci: FOCI, maxDetailCars: low ? 8 : medium ? 20 : 36 });
  t = lap('parking', t);
  const props = buildProps(ctx, H, { lotIdx, roadIdx, street, shopFronts: out.shopFronts, bikeSpots: out.bikeSpots, heroZone });
  t = lap('props', t);
  let lanes = null; if (!low) { try { lanes = buildLaneLanterns(ctx, out.shopFronts, out); } catch (e) { console.warn('[town] lane lanterns', e); } }   // [v3:fix] 魚町 / 南町 izakaya lanterns + 行灯
  t = lap('lanes', t);
  H.laundry.build();
  const heroTris = H.gb.tris;
  H.gb.flush(root, 'town-hero');
  ctx.addStatic(root);
  t = lap('flush', t);

  // ------------------------------------------------------------------ mid + far
  // hero lots that the hero builder skipped (odd footprints) fall back to the simplified builder
  const leftovers = heroLots.filter((l) => !built.has(l.id) && !l.landmark && cls.get(l.id)?.kind !== 'shrine' && L.shoreDist(l.obb.cx, l.obb.cz) <= 0.5);
  const mid = buildMid(ctx, midLots.concat(leftovers), { H, roadIdx });
  t = lap('mid', t);
  const gardens = buildGardens(ctx, heroLots.concat(midLots), { lotIdx, roadIdx, heroZone, maxDist: low ? 650 : medium ? 900 : 1150 });
  t = lap('gardens', t);
  const far = buildFar(ctx, farLots, { centre: heroZone, maxDist: Number(params.get('farDist') || 5600) });
  t = lap('far', t);

  // ------------------------------------------------------------------ services
  ctx.services.street = { edges: street.edges, gutters: street.gutters, walkPaths: street.walkPaths, crosswalks: street.crosswalks, junctions: street.junctions, stops: street.stops };
  ctx.services.town = {
    poles: ctx.services.poles?.poles || [], spans: ctx.services.poles?.spans || [],
    shops: out.shopFronts.map((s) => ({ lotId: s.lotId, name: s.name, type: s.type, x: s.x, z: s.z, rotY: s.rotY })),
    windows: [], lanterns: out.lanterns, gates: out.gates, buildingNames: out.buildingNames,
  };
  // lanterns glow at dusk through life's registry
  { const Lt = lights(ctx); for (const p of out.lanterns) Lt.lantern({ x: p.x, y: p.y, z: p.z }); }

  const stats = {
    hero: counts, big: out.bigBuildings.length, heroSimplified: leftovers.length, shops: out.shopFronts.length, warehouses: out.warehouses.length, heroTris,
    mid: { count: mid.count, tris: mid.tris, meshes: mid.meshes, roofs: mid.stats }, far,
    street: { km: street.km, nodes: street.nodes, signs: street.signs, mirrors: street.mirrors, guardrails: street.guardrails, crosswalks: street.crosswalks.length, walkPaths: street.walkPaths.length },
    poles, props, lanes, parking, gardens, ms, tris, px, kindMs: Object.fromEntries(Object.entries(kindMs).map(([k, v]) => [k, Math.round(v)])), kindTris: Object.fromEntries(Object.entries(kindTris).map(([k, v]) => [k, Math.round(v / kindN[k])])), kindN, total: Math.round(performance.now() - t0),
  };
  if (typeof window !== 'undefined') window.__town = stats;
  return stats;
}
