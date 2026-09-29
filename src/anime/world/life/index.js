// [v3:life] The life package: time of day + lights, night lighting, people & cats, rain, harbour soundscape, live
// data, tour camera and the UI. One world module (`export async function build(ctx)`), built LAST (after town and
// harbor) so it can read their services and retrofit their interior lights before static batching.
//
// Publishes (consumers must tolerate absence):
//   ctx.services.time      ./time.js (hours, preset, night, lamps, dusk, sunDir, palette, weather, set(), setHours(), onChange())
//   ctx.services.lights    ./lights.js registry (streetlight / lantern / point / boat / bridge / aviation / windowMaterial /
//                          lampMaterial / interiorMaterial); windowGlow(ctx) for custom facade shaders
//   ctx.services.arrivals  ./live.js ({ list, sample, origin, onChange })
//   ctx.services.life      { time, lights, live, tour, weather, cast, paths, sound, hud, stats }   (also window.__life)
// URL: ?preset=asa|hiru|yugata|yuyake|yoru  ?hours=17.1  ?weather=clear|cloudy|rain|live  ?cloud=0..1  ?rain=0..1
//      ?ui=1 (show the UI in shot mode)  ?fixtures=1 (/api/live sample)  ?nolamps=1  ?nocast=1
import { createTime, PRESETS } from './time.js';
import { lights, buildLights } from './lights.js';
import { buildPaths } from './paths.js';
import { buildCast } from './cast.js';
import { buildLamps } from './lamps.js';
import { buildWeather } from './weather.js';
import { createTour } from './tour.js';
import { createLive } from './live.js';
import { createSoundscape } from './sound.js';
import { createSeason } from './season.js';   // [v3:integrate] 春 / 夏 / 秋 / 冬
import { mountHud } from '../../ui/hud.js';
import { takePhoto } from '../../ui/photo.js';
import { STRINGS } from '../../ui/i18n.js';

const WEATHER = { clear: { cover: 0.25, rain: 0 }, cloudy: { cover: 0.75, rain: 0 }, rain: { cover: 0.95, rain: 0.8 } };

export async function build(ctx) {
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const SHOT = params.has('shot');
  const t0 = performance.now();
  const stats = {};
  // ---- time & lights
  const T = createTime(ctx, { preset: params.get('preset') || undefined, hours: params.has('hours') ? Number(params.get('hours')) : undefined, date: params.get('date') || undefined });
  ctx.services.time = T;
  const wq = params.get('weather');
  if (WEATHER[wq]) T.setWeather(WEATHER[wq]);
  if (params.has('cloud')) T.setWeather({ cover: (Number(params.get('cloud')) - 0.3) / 0.6 });
  if (params.has('rain')) T.setWeather({ rain: Number(params.get('rain')) });
  if (params.has('wet')) T.setWeather({ wet: Number(params.get('wet')) });   // [v3:integrate] ?wet=0..1 wet streets without rain
  const Lt = lights(ctx);
  ctx.services.lights = Lt;
  const life = { time: T, lights: Lt, stats, presets: PRESETS };
  ctx.services.life = life;

  // ---- paths, street lamps, people & cats, rain
  const paths = safe('paths', () => buildPaths(ctx), stats) || { paths: [], at() { return {}; }, blocked: () => true };
  life.paths = paths; stats.paths = paths.paths.length;
  if (!params.has('nolamps')) { stats.lamps = safe('lamps', () => buildLamps(ctx, paths), stats); paths.posts = stats.lamps?.posts || []; if (stats.lamps) stats.lamps = { ...stats.lamps, posts: paths.posts.length }; }
  const cast = params.has('nocast') ? null : safe('cast', () => buildCast(ctx, paths), stats);
  life.cast = cast; if (cast) stats.cast = cast.stats;
  const W = safe('weather', () => buildWeather(ctx, T), stats);
  life.weather = W;

  // ---- night lighting (after every module registered its lamps; before static batching)
  const NL = buildLights(ctx);
  stats.lights = NL.stats;

  // ---- live data, tour camera, sound, UI
  const live = createLive(ctx, T, { fixtures: params.get('fixtures') === '1', offline: SHOT && !params.has('live'), applyWeather: wq === 'live' || (!SHOT && !WEATHER[wq] && !params.has('cloud')), poll: SHOT ? 0 : 600000 });
  life.live = live;
  const tour = createTour(ctx);
  life.tour = tour;
  const season = safe('season', () => createSeason(ctx, { season: params.get('season') || undefined }), stats);   // [v3:integrate]
  life.season = season;
  const sound = SHOT && !params.has('sound') ? null : safe('sound', () => createSoundscape(ctx), stats);
  life.sound = sound;
  const hud = (!SHOT || params.get('ui') === '1') ? safe('hud', () => mountHud(ctx, life, { force: SHOT }), stats) : null;
  life.hud = hud;
  // stills / film: a small attribution line burned into the frame (?credit=1)
  if (params.get('credit') === '1' && typeof document !== 'undefined') {
    const c = document.createElement('div');
    c.textContent = STRINGS[params.get('lang') === 'en' ? 'en' : 'ja']['v3.attribution'];
    c.style.cssText = 'position:fixed;right:1.2vw;bottom:1.1vh;z-index:6;font:500 max(11px,0.62vw)/1.3 "Noto Sans JP",sans-serif;color:rgba(255,255,255,.92);text-shadow:0 1px 3px rgba(20,24,48,.75);pointer-events:none';
    document.body.appendChild(c);
  }

  const sky = ctx.sky;
  const skyHasTime = typeof sky?.setTime === 'function';
  let lastPlanetSig = '';
  ctx.onUpdate((dt, t) => {
    T.update(dt);
    if (skyHasTime) sky.setTime(T);
    NL.update(dt, t);
    W?.update?.(dt, t);
    cast?.update(dt, t);
    tour.update(dt, t);
    season?.update(SHOT ? 1 : dt);   // [v3:integrate] shots jump straight to the target season
    // [v3:integrate] the tiny planet re-captures when the light or the season changed
    const pl = ctx.planet;
    if (pl?.active) { const sig = T.hours.toFixed(2) + '|' + (ctx.shared.uSeason?.value.toArray().map((v) => v.toFixed(2)).join(',') || '') + '|' + (T.weather?.cloud ?? 0).toFixed(2); if (sig !== lastPlanetSig) { lastPlanetSig = sig; pl.invalidate(); } }
    sound?.update(dt);
    hud?.update(dt);
  });
  stats.buildMs = Math.round(performance.now() - t0);
  if (typeof window !== 'undefined') {
    window.__life = life;
    window.__season = (id) => { season?.set(id, { instant: true }); return season?.id; };   // [v3:integrate]
    // shot / film helpers: jump the time instantly, render the film path
    window.__lifeSet = (p) => { if (typeof p === 'number') T.setHours(p); else T.set(p, { instant: true }); if (skyHasTime) sky.setTime(T); };
    // film: camera along tour.filmPose, the afternoon sliding from 16:30 into the 17:20 sunset
    window.__film = (t, dur = 30, h0 = 16.5, h1 = 17 + 20 / 60) => { T.setHours(h0 + (h1 - h0) * Math.min(1, Math.max(0, t / dur))); if (skyHasTime) sky.setTime(T); return tour.applyFilm(t, dur); };
    // photo mode without the HUD too (shot tools): __photo(scale, { data, noDownload })
    window.__photo = (scale = 1, o = {}) => (hud ? hud.photo(scale, o) : takePhoto(ctx, T, { ...o, scale }));
  }
  return life;
}

function safe(name, fn, stats) {
  const t0 = performance.now();
  try { const r = fn(); stats[name + 'Ms'] = Math.round(performance.now() - t0); return r; }
  catch (e) { console.error(`[life:${name}]`, e); stats[name + 'Error'] = String((e && e.stack) || e).slice(0, 400); if (typeof window !== 'undefined') (window.__errors ||= []).push({ module: 'life:' + name, message: String((e && e.stack) || e) }); return null; }
}
