// [v4:explore] The explore package (V3-SPEC section 10, explorability): the whole core streamed by tiles around the
// player (stream.js), a car on the real roads (drive.js, roadnet.js), a minimap with your position and heading and the
// full map (ui.js, basemap.js), place search in Japanese and English over the real names (search.js), POI labels that
// fade with distance (labels.js), 26 more real places for the tour and the places list (places.js), and walk-in
// interiors (interiors.js). Built after life, so it joins the HUD and the tour.
//
// Publishes ctx.services.explore = { stream, tiles, roads, net, drive, search, labels, ui, places, interiors } and
// window.__explore (tests, qa3). URL: ?stream=0 (no streaming: town builds the mid zone as before).
import { patchLots, buildTiles, coreRoads, allRoads, inCore, CORE } from './tiles.js';
import { createStream } from './stream.js';
import { makeRoadNet } from './roadnet.js';
import { createDrive } from './drive.js';
import { createBaseMap } from './basemap.js';
import { createSearch } from './search.js';
import { createLabels, LABEL_KINDS } from './labels.js';
import { mountExploreUI } from './ui.js';
import { EXTRA_PLACES, placeStops, droneFraming, walkFraming, topAt, makeTreeAt } from './places.js';
import { buildInteriors } from './interiors.js';
import { createStoryPins } from './storypins.js';
import { makeLotIndex, makeRoadIndex } from '../town/common.js';
import { makeRealNames } from '../town/realnames.js';

/** The civic landmarks' kind, from their names (landmarks-B lists them without one). */
function kindOfName(ja) {
  return /駅|ターミナル|モノレール/.test(ja) ? 'station' : /病院/.test(ja) ? 'hospital' : /学校/.test(ja) ? 'school' : /神社/.test(ja) ? 'shrine' : /寺/.test(ja) ? 'temple'
    : /教会/.test(ja) ? 'church' : /美術館/.test(ja) ? 'museum' : /庁舎|役所/.test(ja) ? 'townhall' : 'landmark';
}

export async function build(ctx) {
  const L = ctx.L;
  const t0 = performance.now();
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const SHOT = params.has('shot');
  const stats = { ms: {} };
  const lap = (k, t) => { stats.ms[k] = Math.round(performance.now() - t); return performance.now(); };
  const X = await L.loadData('explore.json');
  let t = performance.now();
  stats.patched = patchLots(L, X);
  L.registerRoads(X.roads);
  const roads = coreRoads(L, X), cityRoads = allRoads(L, X);
  const tiles = buildTiles(L, X);
  t = lap('tiles', t);

  const kit = ctx.services.town?.kit || null;
  const api = { tiles, roads, X, stats, stream: null };
  ctx.services.explore = api;
  if (typeof window !== 'undefined') window.__explore = api;
  const coreLots = L.LOTS.filter((l) => inCore(l.obb.cx, l.obb.cz, 50));
  const lotIdx = makeLotIndex(coreLots);
  const inLot = (x, z) => !!lotIdx.at(x, z, 0.4);

  // ---------------------------------------------------------------- streaming (needs town's kit)
  const cam = ctx.camera;
  if (kit && ctx.plan?.explore) {
    const roadIdx = makeRoadIndex(roads);
    const farCore = [];
    for (const tl of tiles.values()) for (const l of tl.far) farCore.push(l);
    const real2 = makeRealNames(ctx, farCore, { key: 'explore-realnames-' });
    t = lap('index', t);
    const stream = createStream(ctx, { tiles, kit, farTown: ctx.services.farTown, lotIdx, roadIdx, real2, quality: ctx.quality?.phone ? 'phone' : ctx.quality?.name || 'high' });   // [v4:phone] its own radii
    api.stream = stream;
    for (const tl of tiles.values()) { try { stream.buildBase(tl); } catch (e) { console.warn('[explore] base', tl.key, e); } }
    stream.flush();
    t = lap('base', t);
    stats.names = real2.count;
    // shot mode (stills, screenshots): every camera gets its tiles built before the frame
    let last = null;
    // [v4:polish2] standing still (the camera moved < 5 cm and turned < 0.3 deg for 0.4 s): a bigger streaming budget
    // on high / medium (R.still x), so a place reached by search or teleport fills in faster (新町: 24.8 s to settle)
    const lastCam = { p: new ctx.THREE.Vector3(), q: new ctx.THREE.Quaternion(), ok: false }; let still = 0;
    ctx.onUpdate((dt) => {
      if (ctx.planet?.active) { stream.sb.cull(null); return; }
      const sail = ctx.services.sail;   // [ship:integrate] at the helm: stream ahead of her bow (sail.focus)
      const p = api.drive?.active ? api.drive.focus() : sail?.active ? sail.focus() : ctx.playerObj?.pos || cam.position;
      const g = Math.max(L.heightAt(cam.position.x, cam.position.z), 0);
      const alt = cam.position.y - g;
      const mode = alt < 40 ? 'ground' : alt < 260 ? 'low' : 'high';
      if (SHOT) {
        if (!last || last.mode !== mode || Math.hypot(p.x - last.x, p.z - last.z) > 25) { last = { x: p.x, z: p.z, mode }; stream.settle(p.x, p.z, mode); }
        stream.sb.cull(cam);
        return;
      }
      const moved = !lastCam.ok || lastCam.p.distanceTo(cam.position) > 0.05 || lastCam.q.angleTo(cam.quaternion) > 0.005;
      lastCam.p.copy(cam.position); lastCam.q.copy(cam.quaternion); lastCam.ok = true;
      still = moved ? 0 : still + dt;
      const budget = stream.R.budget * (still > 0.4 ? (stream.R.still || 1) : 1);
      stream.update(p.x, p.z, mode, { dt, budget });
    });
    api.settle = () => { const p = api.drive?.active ? api.drive.focus() : ctx.playerObj?.pos || cam.position; const g = Math.max(L.heightAt(cam.position.x, cam.position.z), 0); const alt = cam.position.y - g; return stream.settle(p.x, p.z, alt < 40 ? 'ground' : alt < 260 ? 'low' : 'high'); };
  }

  // the parts below are independent of the streamed town: a failure is reported (window.__errors) but never takes the
  // streamed buildings down with it
  const fail = (part, e) => { console.error('[explore:' + part + ']', e); stats[part + 'Error'] = String((e && e.stack) || e).slice(0, 400); if (typeof window !== 'undefined') (window.__errors ||= []).push({ module: 'explore:' + part, message: String((e && e.stack) || e) }); };
  // ---------------------------------------------------------------- the car on the real roads
  const net = makeRoadNet(cityRoads);
  api.net = net;
  let drive = null;
  try { drive = createDrive(ctx, { net }); } catch (e) { fail('drive', e); }
  api.drive = drive;
  t = lap('drive', t);

  // ---------------------------------------------------------------- places: the tour stops, the civic landmarks, ours
  const life = ctx.services.life;
  const tour = life?.tour;
  const lmPlaces = (ctx.services.landmarks?.places || []).filter((p) => p?.at && p.ja);
  // [v4:integrate] walk spots with a clear view: lots of the core, every other lot, and the colliders built so far
  const allIdx = makeLotIndex(L.LOTS.filter((l) => l.zone !== 'far' || !inCore(l.obb.cx, l.obb.cz, 50)));
  const lotAt = (x, z) => lotIdx.at(x, z, 0.4) || allIdx.at(x, z, 0.4) || null;
  const solidAt = ctx.physics?.solidAt ? (x, z, y) => ctx.physics.solidAt(x, z, y) : null;
  const treeAt = makeTreeAt(ctx.services.environment?.trees, ctx.services.poles?.poles);   // [v4:polish1] no walk spot inside a crown or against a trunk
  const lmStops = placeStops(L, net, lmPlaces.map((p) => ({ id: 'lm-' + p.id, ja: p.ja, en: p.en, cat: kindOfName(p.ja), at: p.at, src: 'landmarks', ...(p.walk && { walk: p.walk }) })), { lotAt, solidAt, treeAt });
  const exStops = placeStops(L, net, EXTRA_PLACES, { lotAt, solidAt, treeAt });
  stats.places = { landmarks: lmStops.length, extra: exStops.length, walk: exStops.filter((s) => s.walk).length };
  if (tour?.add) stats.places.added = tour.add(lmStops.concat(exStops));
  const tourFeat = (tour?.stops || []).filter((s) => !s.extra).map((s) => {
    const at = s.walk ? [s.walk.x, s.walk.z] : [s.drone.look[0], s.drone.look[2]];
    // [v4:integrate] the place's name, not the camera's: 内湾（空から） is the drone stop of the inner bay
    const nm = s.id === 'hero' ? { ja: '内湾', en: 'Inner bay' } : { ja: s.ja, en: s.en };
    return { id: s.id, ...nm, cat: 'landmark', at, group: 'tour' };
  });
  // [ship:integrate] 「第一昭福丸に乗る」 heads the places list (selecting it boards her; world/ship/index.js PLACE)
  const shipPlace = ctx.services.ship?.place ? [ctx.services.ship.place] : [];
  // [ship:story] the story pins (storypins.js, data/ship/story-pins.json): their own group after the boarding entry;
  // selecting one flies the drone there, pins its label and opens its card
  let storyFeat = [];
  try {
    const story = createStoryPins(ctx, {
      L,
      lang: () => api.ui?.i18n?.lang || life?.hud?.i18n?.lang || 'ja',
      fly: (p) => {
        drive?.active && drive.exit(); ctx.planet?.active && ctx.planet.exit();
        tour?.stop?.(); tour?.flyTo?.(p.view ? { pos: p.view.pos, look: p.view.look } : places.frame(p).drone);
        api.labels?.pin(api.labels.items?.find((it) => it.id === p.id) || places.labelItem(p));
      },
    });
    api.story = story; storyFeat = story.places;
  } catch (e) { fail('story', e); }
  const featured = shipPlace.concat(tourFeat).concat(lmStops.map((s) => ({ id: s.id, ja: s.ja, en: s.en, cat: s.cat, at: s.at, group: 'landmarks' })), exStops.map((s) => ({ id: s.id, ja: s.ja, en: s.en, cat: s.cat, at: s.at, group: 'places' })));
  featured.splice(shipPlace.length, 0, ...storyFeat);   // [ship:story] the story group right after the boarding entry
  const search = createSearch(L, { featured, near: () => { const p = drive?.active ? drive.state : cam.position; return [p.x, p.z]; } });
  api.search = search;
  const places = {
    list: featured,
    frame(p) { const [x, z] = p.at; return { drone: droneFraming(L, x, z), walk: walkFraming(L, net, x, z, { lotAt, solidAt, treeAt }) }; },
    walkAt(x, z) { return walkFraming(L, net, x, z, { lotAt, solidAt, treeAt }); },
    labelItem(p) { const [x, z] = p.at; return { id: p.id, ja: p.ja, en: p.en, cat: p.cat, x, z, y: topAt(L, x, z, 12), prio: 3 }; },
  };
  api.places = places;
  t = lap('places', t);

  // ---------------------------------------------------------------- walk-in interiors (market deck, a shop)
  try { api.interiors = buildInteriors(ctx, { inLot }); } catch (e) { fail('interiors', e); }
  t = lap('interiors', t);

  // ---------------------------------------------------------------- the UI: map, search, labels, drive chip
  const uiOn = typeof document !== 'undefined' && (!SHOT || params.get('ui') === '1');
  if (uiOn) try {
    const bm = createBaseMap(L, { roads: cityRoads, core: CORE, quality: ctx.quality?.name });
    bm?.step(1e9);
    t = lap('basemap', t);
    // label items: the featured places, then every named OSM / GSI place of a kind a visitor looks for
    const items = featured.map((p) => ({ id: p.id, ja: p.ja, en: p.en, cat: p.cat, x: p.at[0], z: p.at[1], y: p.labelY ?? topAt(L, p.at[0], p.at[1], 10), prio: p.group === 'places' ? 2 : 3 }));
    const lotTop = (p) => { const l = p.lot ? L.lotById(p.lot) : null; return l ? (l.groundY || 0) + (l.height || 6) : L.heightAt(p.at[0], p.at[1]) + 5; };
    for (const p of search.all) if (LABEL_KINDS.test(p.cat) && !featured.some((f) => f.ja === p.ja && Math.hypot(f.at[0] - p.at[0], f.at[1] - p.at[1]) < 150)) items.push({ id: p.id, ja: p.ja, en: p.en, cat: p.cat, x: p.at[0], z: p.at[1], y: lotTop(p), prio: 1 });
    // [v4:integrate] buildings occlude; [v4:polish1] at most 10 on the low tier and on a portrait screen (the phone's
    // labels overlapped), re-read on resize
    const portrait = () => typeof innerWidth !== 'undefined' && innerHeight > innerWidth;
    const labels = createLabels(ctx, { items, max: 26, maxNow: () => (ctx.quality?.name === 'low' || portrait() ? 10 : 26), lotAt });
    if (SHOT) document.body.classList.add('shotui');
    const ui = mountExploreUI(ctx, { life, drive, net, bm, labels, places, search, force: SHOT });
    api.labels = labels; api.ui = ui; api.basemap = bm;
    // [v4:polish1] no labels over the tiny planet, nor through the walls of a walk-in interior around the camera
    let labelsOn = true;
    ctx.onUpdate((dt) => {
      const c = cam.position, on = !ctx.planet?.active && !api.interiors?.at?.(c.x, c.y, c.z);
      if (labels && on !== labelsOn) { labels.visible = on; labelsOn = on; }
      if (on) labels?.update(dt || 0, ui?.i18n?.lang || 'ja');
      ui?.update(dt || 0.016);
    });
    stats.labels = items.length;
    t = lap('ui', t);
  } catch (e) { fail('ui', e); }
  // screenshots: drive from a point, frame the car without real-time frames
  api.driveAt = (x, z, yaw = 0) => { if (!drive) return null; const ok = drive.enter({ x, z, yaw: yaw * Math.PI / 180 }); drive.place(0); api.settle?.(); drive.place(0); return ok && drive.state; };
  stats.ms.total = Math.round(performance.now() - t0);
  return stats;
}
