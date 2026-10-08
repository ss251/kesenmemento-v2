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
import { makeRealNames } from './realnames.js';   // [v4:town-accuracy]
import { channels, channelIndex, buildRivers, crossings } from './rivers.js';   // [v4:town-accuracy]
import { buildLanduse, parkingIndex } from './landuse.js';   // [v4:town-accuracy]
import { buildSignals } from './signals.js';   // [v4:town-accuracy]
import { EXPLORE_LOTS } from '../explore/taken.js';   // [v4:explore] lots explore models with a walk-in interior
import { KAZEMACHI_LOTS } from '../harbor/real.js';
import { PHONE } from '../../core/tier.js';   // [v4:phone]   // [v4:polish1] 風待ち heritage buildings (harbor/kazemachi.js)

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
  // [v4:phone] the phone tier: poles and wires round the hero centre only, a nearer far town, gardens and land use
  const phone = !!ctx.quality?.phone;
  const nearHero = (x, z, r) => Math.hypot(x - L.ZONES.hero.cx, z - L.ZONES.hero.cz) < r;

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
  const real = makeRealNames(ctx, heroLots.concat(midLots));   // [v4:town-accuracy] real names (OSM / GSI) on signs
  const T = { H, SM, IM, signs, awn, out, shopCounter: 0, lotIdx, roadIdx, names, nameMat: ctx.mat.toon('#ffffff', { map: names.tex, paint: 0.01 }), annex: new Map(), real };
  t = lap('textures', t);
  const cls = classifyHero(L, heroLots, roadIdx);
  const built = new Set(), counts = {};
  const quick = params.get('townlod');          // debug: force a LOD
  const kindMs = {}, kindTris = {}, kindN = {};
  // detail focus: the promenade walk spot and the street hearts of 八日町, 魚町, 南町 and the waterfront road
  const FOCI = [[focus.x, focus.z], [-110, -170], [90, -190], [-160, 70], [150, -125], [30, -60], [200, -200]];
  for (const lot of heroLots) {
    if (EXPLORE_LOTS.has(lot.id)) continue;   // [v4:explore] modelled with its interior by explore/interiors.js
    if (KAZEMACHI_LOTS.has(lot.id)) continue;   // [v4:polish1] the 風待ち heritage shops: harbor/kazemachi.js
    const d = Math.min(...FOCI.map(([fx, fz]) => Math.hypot(lot.obb.cx - fx, lot.obb.cz - fz)));
    const inR = Math.hypot(lot.obb.cx - heroZone.cx, lot.obb.cz - heroZone.cz) <= heroR;
    const [lod2, lod1] = phone ? PHONE.heroLod : [100, 220];   // [v4:phone]
    const lod = quick !== null ? Number(quick) : !inR ? 0 : d < lod2 ? 2 : d < lod1 ? 1 : 0;
    // quiet back lots far from every street heart: the simplified builder (same palette, roof shapes, facades)
    if (lod === 0 && quick === null && (lot.kind === 'house' || lot.kind === 'apartment') && cls.get(lot.id)?.kind !== 'shop') { continue; }
    if (phone && !inR && quick === null) continue;   // [v4:phone] beyond the phone hero radius every lot is a simplified building
    try {
      const tk = performance.now(), g0 = H.gb.tris;
      const k = buildHeroLot(T, lot, cls.get(lot.id), lod);
      if (k) { built.add(lot.id); counts[k] = (counts[k] || 0) + 1; kindMs[k + lod] = (kindMs[k + lod] || 0) + performance.now() - tk; kindTris[k + lod] = (kindTris[k + lod] || 0) + H.gb.tris - g0; kindN[k + lod] = (kindN[k + lod] || 0) + 1; }
    } catch (e) { console.warn('[town] lot', lot.id, e); }
  }
  t = lap('hero', t);

  // ------------------------------------------------------------------ streets, poles, props (hero detail through the kit batcher)
  // [v4:town-accuracy] rivers first: streets stop at the channel edge and rivers.js bridges them
  const HC = L.ZONES.hero, MZ = L.ZONES.mid;
  const chs = channels(L, { near: (x, z) => Math.hypot(x - HC.cx, z - HC.cz) < 3200, step: phone ? PHONE.riverStep : 4 });
  const chIdx = channelIndex(chs);
  const street = buildStreets(ctx, { lotIdx, roadIdx, roads: phone ? roads.filter((r) => r.pts.some((p) => nearHero(p[0], p[1], PHONE.streetR))) : roads, heroZone, rivers: chIdx, ...(phone && { step: PHONE.streetStep }) });
  t = lap('streets', t);
  let rivers = null;
  // [r3:12] the road bridges of the far zone (気仙沼唐桑線 over the 鹿折川, r9949 / r9918; 大川, r13790 / r13760) were never given a deck: rivers.js built decks only for the non-far roads, so the road ran into the water.
  // Only buildRivers gets them (not roadIdx, buildStreets or signals), and only their crossings are widened into the detail test (the banks and the channel walls stay as they were).
  const farBridges = L.ROADS.filter((r) => r.zone === 'far' && r.kind === 'bridge'), farX = crossings(farBridges, chs);
  const inMid = (x, z) => Math.hypot(x - MZ.cx, z - MZ.cz) < MZ.r + 120;
  try { rivers = buildRivers(ctx, { chs, index: chIdx, detail: inMid, bridgeDetail: (x, z) => inMid(x, z) || farX.some((c) => Math.hypot(c.x - x, c.z - z) < 1), roads: roads.concat(farBridges), asphalt: street.materials?.asphalt }); } catch (e) { console.warn('[town] rivers', e); }
  t = lap('rivers', t);
  const poleOpts = phone ? phoneRuns(L, nearHero) : {};
  const poles = buildPoles(ctx, H, { lotIdx, roadIdx, heroZone, facades: facadeAnchors(L, heroLots.filter((l) => built.has(l.id))), ...poleOpts });
  t = lap('poles', t);
  const inParking = parkingIndex(L);
  const parking = buildParking(ctx, H, { lotIdx, roadIdx, heroZone, asphaltTex: street.tex.asphalt, lineTex: street.tex.line, signs, SM, foci: FOCI, maxDetailCars: phone ? 4 : low ? 8 : medium ? 20 : 36, inParking });
  t = lap('parking', t);
  // [v4:town-accuracy] OSM land use on the ground: car parks, school yards, pitches, building sites, cemeteries, parks
  let landuse = null;
  try { landuse = buildLanduse(ctx, { inside: (x, z) => Math.hypot(x - MZ.cx, z - MZ.cz) < (phone ? PHONE.landuseR : MZ.r + 150), heroIn: (x, z) => Math.hypot(x - HC.cx, z - HC.cz) < HC.r, lotIdx, roadIdx, low, trees: ctx.services.environment?.trees }); } catch (e) { console.warn('[town] landuse', e); }
  t = lap('landuse', t);
  // [v4:town-accuracy] OSM traffic signals + crossings, route shields on the numbered roads
  let signals = null;
  try { signals = buildSignals(ctx, { roads, lotIdx, roadIdx, detail: (x, z) => Math.hypot(x - MZ.cx, z - MZ.cz) < MZ.r + 150, hero: (x, z) => Math.hypot(x - HC.cx, z - HC.cz) < HC.r + 40, low }); } catch (e) { console.warn('[town] signals', e); }
  t = lap('signals', t);
  const props = buildProps(ctx, H, { lotIdx, roadIdx, street, shopFronts: out.shopFronts, bikeSpots: phone ? out.bikeSpots.slice(0, PHONE.bikes) : out.bikeSpots, heroZone });
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
  const leftovers = heroLots.filter((l) => !built.has(l.id) && !EXPLORE_LOTS.has(l.id) && !KAZEMACHI_LOTS.has(l.id) && !l.landmark && cls.get(l.id)?.kind !== 'shrine' && L.shoreDist(l.obb.cx, l.obb.cz) <= 0.5);
  // [v4:town-accuracy] + the annex wings of L / T-shaped hero lots (the kit building stands on their main wing)
  const annexLots = heroLots.filter((l) => built.has(l.id) && T.annex.has(l.id));
  const nameItems = [];
  // [v4:explore] with the explore module in the build, the mid-zone lots are built by explore/stream.js instead (the
  // same buildMid, per 100 m tile, packed into BatchedMesh pools so a tile can swap to full kit detail when you walk in)
  const exploreOwnsMid = !!ctx.plan?.explore;
  const mid = buildMid(ctx, (exploreOwnsMid ? [] : midLots).concat(leftovers, annexLots), { H, roadIdx, annex: T.annex, names: nameItems });
  const boards = real.boards(nameItems); ctx.addStatic(boards.group);
  const realStats = { names: real.count, textures: real.textures, midBoards: boards.count, heroShops: out.shopFronts.filter((s) => s.real).length, heroBoards: out.buildingNames.filter((b) => b.real).length };
  t = lap('mid', t);
  const gardens = buildGardens(ctx, heroLots.concat(midLots), { lotIdx, roadIdx, heroZone, maxDist: phone ? PHONE.gardens : low ? 650 : medium ? 900 : 1150 });
  t = lap('gardens', t);
  const far = buildFar(ctx, farLots, { centre: heroZone, maxDist: Number(params.get('farDist') || (phone ? PHONE.farDist : 5600)), ...(phone && { skipSmallBeyond: PHONE.farSmall }) });
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
    poles, props, lanes, parking, gardens, real: realStats, rivers, landuse, signals, ms, tris, px, kindMs: Object.fromEntries(Object.entries(kindMs).map(([k, v]) => [k, Math.round(v)])), kindTris: Object.fromEntries(Object.entries(kindTris).map(([k, v]) => [k, Math.round(v / kindN[k])])), kindN, total: Math.round(performance.now() - t0),
  };
  // [v4:explore] the kit context, so explore/stream.js can build hero-grade lots in the tiles around the player
  ctx.services.town.kit = { T, H, heroZone, chIdx, streetMaterials: street.materials, streetTex: street.tex, exploreOwnsMid };
  if (typeof window !== 'undefined') window.__town = stats;
  return stats;
}

/** [v4:phone] Pole runs (the longest stretch of each run inside PHONE.poleR of the hero centre) and the hero lanes
 *  that carry poles, for buildPoles on the phone tier: poles, their wires and service drops cost ~0.6 M triangles. */
function phoneRuns(L, nearHero) {
  const runs = [];
  for (const r of L.POLE_RUNS) {
    let best = [], cur = [];
    for (const p of r.pts) { if (nearHero(p[0], p[1], PHONE.poleR)) cur.push(p); else { if (cur.length > best.length) best = cur; cur = []; } }
    if (cur.length > best.length) best = cur;
    if (best.length >= 2) runs.push({ roadId: r.roadId, pts: best });
  }
  const lanes = L.ROADS.filter((r) => r.zone === 'hero' && r.pts.some((p) => nearHero(p[0], p[1], PHONE.poleR)));
  return { runs, lanes };
}
