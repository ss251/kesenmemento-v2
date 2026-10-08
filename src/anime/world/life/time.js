// [v3:life] Time of day for Kesennuma: presets, smooth transitions, the global night factor, and the LIGHTS
// (the sun/moon key light + hemisphere ambient). Foundation's sky core (src/anime/core/sky.js) owns the sky dome,
// clouds and grading: life calls ctx.sky.setTime(T) every frame and the sky reads T.palette / T.sunDir / T.night /
// T.dusk / T.weather. The palette and the key-light cheat are foundation's (skyPaletteAt, keyLight) so the sky and
// the lights can never disagree; life adds the night/lamp factors, transitions and weather dimming.
//
// Presets (JST, on the demo day 2026-10-10):  朝 06:30 · 昼 12:00 · 夕方 16:30 · 夕焼け 17:20 · 夜 19:30
//   const T = ctx.services.time;
//   T.set('yoru')                 animated transition (3.2 s), always the shorter way round the clock
//   T.set('asa', { instant: true }) / T.setHours(17.1)
//   T.night  0 day .. 1 full night (sun elevation driven)      T.lamps  0..1 streetlights / windows on
//   T.dusk   0..1 golden/sunset strength                         T.sunDir direction TO the sun (the same Vector3 as ctx.sunDir)
//   T.palette  skyPaletteAt() THREE.Colors + numbers             T.onChange(fn(state, why))
// Shared uniforms (created here if absent): ctx.shared.uNight, uLamps, uDusk, uWet, uRain.
import * as THREE from 'three';
import { skyPaletteAt, keyLight } from '../../core/sky.js';
import { sunPosition, DEMO_DOY } from '../layout.js';
import { clockDelta, jstNow, stepLiveClock, wrap24 as wrapClock } from './clock.js';

export const PRESETS = [
  { id: 'asa', ja: '朝', en: 'Morning', h: 6.5 },
  { id: 'hiru', ja: '昼', en: 'Noon', h: 12.0 },
  { id: 'yugata', ja: '夕方', en: 'Afternoon', h: 16.5 },
  { id: 'yuyake', ja: '夕焼け', en: 'Sunset', h: 17 + 20 / 60 },
  { id: 'yoru', ja: '夜', en: 'Night', h: 19.5 },
];
export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const DEMO_DATE = '2026-10-10';
/** [v5:detail] Lighting looks layered over the clock (?look=photo, T.setLook('photo')). photo = the author's photos
 *  (raw/author-photos, 2026-10-01 17:07-17:22 JST): an overcast dusk at 17:20 in early October under a grey altocumulus
 *  deck; soft, nearly shadowless light; shop interiors, deck lights and lamps already on. Used by tools/anime/photo-pairs.mjs
 *  so the lighting never hides the comparison. */
export const LOOKS = {
  photo: {
    hours: 17 + 20 / 60, date: '2026-10-01', cover: 1, lit: 0.8, dusk: 0.3,
    pal: { zenith: '#5f7290', mid: '#8a99b0', horizon: '#c9c6c2', warm: '#e9a073', fog: '#a9afb7', sun: '#efe2d0', hemiSky: '#cfd2d6', hemiGround: '#9a968f', cloudLit: '#b7bfcb', cloudShade: '#6e7a90' },
    sunI: 0.62, hemiI: 2.05, exposure: 1.0, bloom: 0.3, glow: 0.16, mix: 1.0,
  },
  // [v5:photos3] the author's second batch (raw/author-photos/drive-1003, 2026-10-02): sunny = the 14:59 promenade and the
  // 16:29 PIER7 street shots (deep blue sky with scattered fair-weather cumulus, a hard low sun, shops unlit); dawn = the
  // 06:48-06:54 fish-market shots (a clear, slightly hazy morning, the sun 15 deg up in the ESE glaring on the water, the
  // hall lamps still on). photo-pairs.mjs sets the photo's own clock on top, so the sun stands where it stood.
  sunny: {
    hours: 16.5, date: '2026-10-02', cover: 0.42, lit: 0, dusk: 0.15, overcast: 0, lamps: 0,
    pal: { zenith: '#3a6fc4', mid: '#79a6dc', horizon: '#cfdde9', warm: '#f3dcbc', fog: '#bccbdb', sun: '#fff0da', hemiSky: '#c6d6ee', hemiGround: '#a69c8c', cloudLit: '#ffffff', cloudShade: '#aab8d0' },
    sunI: 2.6, hemiI: 1.55, exposure: 1.0, bloom: 0.2, glow: 0.08, mix: 0.9,
  },
  dawn: {
    hours: 6.88, date: '2026-10-02', cover: 0.15, lit: 0.55, dusk: 0.35, overcast: 0, lamps: 0.6,
    pal: { zenith: '#6f93c4', mid: '#a9bfd8', horizon: '#ece6d8', warm: '#ffd9a8', fog: '#d6d6cf', sun: '#ffe6c2', hemiSky: '#c9d3df', hemiGround: '#8f8a80', cloudLit: '#fff6e8', cloudShade: '#b7bfcc' },
    sunI: 2.4, hemiI: 1.35, exposure: 1.0, bloom: 0.32, glow: 0.14, mix: 0.9,
  },
};

const wrap24 = wrapClock;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The four poster looks. Hour grading is zero on these hours so 朝・昼・夕方・夜 stay as painted. */
export const LOOK_HOURS = [6.5, 12, 16.5, 19.5];
const _tint = new THREE.Color();
function awayFromLooks(h) {
  let d = 24;
  for (const p of LOOK_HOURS) { let dd = Math.abs(h - p); if (dd > 12) dd = 24 - dd; d = Math.min(d, dd); }
  return smooth(0.08, 0.45, d);
}
function bump(h, center, width) {
  let d = Math.abs(h - center); if (d > 12) d = 24 - d;
  const x = 1 - Math.min(1, d / width); return x * x * (3 - 2 * x);
}
/**
 * In-between hours only. 05:00 pre-dawn leans 鉄紺 / 東雲色; 18:00–19:00 blue hour leans 藍色 / 紺色
 * instead of a grey-purple wash. 00:00 and 03:00 take a little 鉄紺. The four look hours are untouched.
 */
export function gradeHour(hours, pal) {
  const h = wrap24(hours);
  const gate = awayFromLooks(h);
  if (gate < 0.001 || !pal) return pal;
  const pre = bump(h, 5.0, 0.42) * gate;
  if (pre > 0) {
    pal.zenith.lerp(_tint.set('#17184B'), pre * 0.62);   // 鉄紺
    pal.mid.lerp(_tint.set('#223A70'), pre * 0.45);      // 紺色
    pal.horizon.lerp(_tint.set('#F19072'), pre * 0.42);  // 東雲色
    pal.fog.lerp(_tint.set('#3a3158'), pre * 0.28);
  }
  const blue = Math.max(bump(h, 18.15, 0.5), bump(h, 18.65, 0.42)) * gate;
  if (blue > 0) {
    pal.zenith.lerp(_tint.set('#165E83'), blue * 0.55);  // 藍色
    pal.mid.lerp(_tint.set('#223A70'), blue * 0.48);     // 紺色
    pal.horizon.lerp(_tint.set('#c45a48'), blue * 0.32); // 東雲, cooled
    pal.warm.lerp(_tint.set('#F19072'), blue * 0.22);
    pal.fog.lerp(_tint.set('#2a4570'), blue * 0.62);
    pal.cloudLit.lerp(_tint.set('#89C3EB'), blue * 0.28); // 勿忘草色
    pal.cloudShade.lerp(_tint.set('#223A70'), blue * 0.4);
  }
  const deep = Math.max(bump(h, 0.1, 0.9), bump(h, 3.0, 0.8)) * gate;
  if (deep > 0) {
    pal.zenith.lerp(_tint.set('#17184B'), deep * 0.35);
    pal.horizon.lerp(_tint.set('#223A70'), deep * 0.28);
    pal.fog.lerp(_tint.set('#17184B'), deep * 0.22);
  }
  return pal;
}

/** Soft grey-blue targets for rain. Brightness is kept; the hue and a little of the saturation move. */
const RAIN_PAL = {
  zenith: '#8ea6ba', mid: '#c5d2dc', horizon: '#dde6ee', warm: '#d4dee6',
  fog: '#d0dbe4', cloudLit: '#eef3f6', cloudShade: '#9aafc0',
  sun: '#dfe6ee', hemiSky: '#c9d6e2', hemiGround: '#b4c0c8',
};
const _rc = new THREE.Color(), _rf = new THREE.Color();
const linLum = (c) => c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
/**
 * How overcast a rain amount reads. Light rain (about 0.3, under 1 mm/h) is the same grey-blue, less of it.
 * A moderate shower is a full deck.
 */
export function rainCover(rain) {
  const r = Math.min(1, Math.max(0, +rain || 0));
  if (r < 0.02) return 0;
  const light = smooth(0.02, 0.25, r);
  const heavy = smooth(0.25, 0.7, r);
  return Math.min(0.96, 0.68 * light + 0.28 * heavy);
}
/** Paint `pal` for rain. Returns the overcast amount. Looks are not passed here. */
export function gradeRain(pal, rain) {
  const cover = rainCover(rain);
  if (cover < 0.01 || !pal) return cover;
  for (const c of Object.keys(RAIN_PAL)) {
    const col = pal[c]; if (!col?.isColor) continue;
    const l0 = linLum(col);
    _rc.set(RAIN_PAL[c]);
    const l1 = linLum(_rc);
    if (l1 > 1e-4) _rc.multiplyScalar(Math.min(1.2, l0 / l1));
    col.lerp(_rc, cover);
    const l = linLum(col);
    _rf.setRGB(l, l, l);
    col.lerp(_rf, 0.16 * cover);
  }
  if (pal.leak != null) pal.leak *= 1 - cover;
  if (pal.exposure != null) pal.exposure += 0.05 * cover;
  return cover;
}

const MORN_KEY = 7.5 * Math.PI / 180;
/** Pull the morning key down from the 13° cheat so 06:30–08:30 throws a long shadow. Returns the weight. */
export function morningShadow(hours, dir, locked = false) {
  const h = wrap24(hours);
  const w = smooth(5.9, 6.35, h) * (1 - smooth(8.3, 9.5, h));
  if (w < 0.001 || locked || !dir) return 0;
  const el = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  if (el < 0.02) return 0;
  const az = Math.atan2(dir.x, -dir.z);
  const e = el + (MORN_KEY - el) * w * 0.7;
  dir.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e));
  return w;
}

/** Lamps from the published sunrise and sunset (hours). Null when the times are missing: the caller keeps the elevation curve. */
export function lampsFromSunTimes(hours, sun) {
  const rise = sun?.sunrise, set = sun?.sunset;
  if (rise == null || set == null || !Number.isFinite(rise) || !Number.isFinite(set)) return null;
  const h = wrap24(hours);
  const morningOff = smooth(rise - 0.28, rise + 0.22, h);
  const eveningOn = smooth(set - 0.12, set + 0.5, h);
  if (h < (rise + set) / 2) return 1 - morningOff;
  return eveningOn;
}

/** Night factor from the sun elevation (deg): 0 through civil twilight, 1 once the sun is 12 deg below the horizon. */
export const nightFromElevation = (el) => smooth(-2, -12, el);
/** Lamps on (street / shop / windows): photo-sensors switch on in the late dusk; homes light up after sunset. */
export const lampsFromElevation = (el) => smooth(2.5, -5, el);
/** Golden hour / sunset strength. */
export const duskFromElevation = (el) => smooth(20, 4, el) * smooth(-10, -1.5, el);
/** Night grade multipliers (k = the night factor): hemi ambient, moon key light, exposure, bloom, glow. */
// [v3:fix] a brighter, bluer moonlight so hills and roofs keep their cel shapes (the night frame read as flat navy)
export const GRADE = { hemi: 0.4, sun: 0.6, exp: 0.0, bloom: 0.24, glow: 0.22, hemiSky: '#5364a6', hemiGround: '#2e2b48', mix: 0.6 };
export function dayOfYearOf(ymd) { const d = new Date(ymd + 'T00:00:00Z'); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5); }

export function createTime(ctx, opts = {}) {
  const S = ctx.shared;
  S.uNight ??= { value: 0 }; S.uLamps ??= { value: 0 }; S.uDusk ??= { value: 0 }; S.uWet ??= { value: 0 }; S.uRain ??= { value: 0 };
  S.uLit ??= { value: 0 };   // [v5:detail] interiors lit regardless of the night factor (harbor nightMat reads it)
  const sunDir = ctx.sunDir || new THREE.Vector3(0, 1, 0);
  const LK = LOOKS[opts.look] || null;
  let doy = opts.date ? dayOfYearOf(opts.date) : LK?.date ? dayOfYearOf(LK.date) : DEMO_DOY;
  const listeners = new Set();
  const pal = skyPaletteAt(16.5);
  const nowFn = opts.now || (() => Date.now());
  const state = {
    presets: PRESETS, date: opts.date || LK?.date || DEMO_DATE, dayOfYear: doy, look: LK ? opts.look : null, overcast: 0,
    hours: 16.5, preset: 'yugata', target: null, night: 0, lamps: 0, dusk: 0, sunDir, palette: pal,
    sun: { azimuth: 0, elevation: 0 }, sunTimes: null, lightDir: new THREE.Vector3(0, 1, 0),
    live: false, pinned: true, held: false,
    weather: { cloud: LK?.cover ?? 0.35, rain: 0, wet: 0, wind: 3, windDirDeg: 270, fog: 0, sky: null, temp: null, station: null },
    // [live r2] the grade eases toward weather (a shower clears in about a second). weather itself is the target.
    // life's grade on top of foundation's palette (T.palette is life's copy; the sky core reads it): the night drops the
    // ambient so thousands of warm windows, lamp pools and boat lights carry the frame (promo.town's night), and the
    // bloom/glow rise with it. Tunable at runtime (window.__life.time.grade) for the look pass.
    grade: { ...GRADE },
    transitioning: false,
    set, setHours, setWeather, setLook, setSun, followLive, hold,
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    get presetInfo() { return PRESET_BY_ID[state.preset] || null; },
    clock() { const h = wrap24(state.hours); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; },
  };
  const shade = { cloud: state.weather.cloud, rain: state.weather.rain, wet: state.weather.wet || 0 };
  state.shade = shade;
  let weatherLive = false;
  const snapShade = () => { shade.cloud = state.weather.cloud; shade.rain = state.weather.rain; shade.wet = state.weather.wet || 0; };
  function easeShade(dt) {
    const W = state.weather, k = 1 - Math.exp(-Math.max(0, dt) / 1.2);
    let moved = false;
    for (const key of ['cloud', 'rain', 'wet']) {
      const target = W[key] || 0;
      const raw = shade[key] + (target - shade[key]) * k;
      const next = Math.abs(target - raw) < 0.012 ? target : raw;
      if (Math.abs(next - shade[key]) > 1e-5) moved = true;
      shade[key] = next;
    }
    return moved;
  }
  let tr = null, pending = null;
  const emit = (why) => { for (const fn of listeners) { try { fn(state, why); } catch (e) { console.error('[life/time] listener', e); } } };
  const reduced = () => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function resolveHours(p) { if (typeof p === 'number') return p; const pr = PRESET_BY_ID[p]; if (!pr) throw new Error('unknown time preset ' + p); return pr.h; }
  function nearestPreset(h, tol = 0.25) { const hh = wrap24(h); for (const p of PRESETS) if (Math.abs(p.h - hh) < tol) return p.id; return null; }
  function pinTo(id) { state.pinned = true; state.live = false; pending = null; state.preset = id; }
  function beginTransition(to, dur = 3.2) {
    const delta = clockDelta(state.hours, to);
    if (Math.abs(delta) < 1 / 3600 || reduced()) { tr = null; apply(to); state.transitioning = false; emit('live'); return; }
    tr = { from: wrap24(state.hours), d: delta, t: 0, dur };
    state.transitioning = true; state.target = to; emit('start');
  }
  function set(p, o = {}) {
    const to = resolveHours(p);
    pinTo(typeof p === 'string' ? p : nearestPreset(to));
    const dur = o.duration ?? 3.2;
    if (o.instant || !dur || reduced()) { tr = null; apply(to); state.transitioning = false; emit('instant'); return state; }
    beginTransition(to, dur);
    return state;
  }
  /** Jump the hour. `{ pin: true }` stops the live clock (shots, tests, a preset). The voyage calls it without pinning. */
  function setHours(h, o = {}) {
    tr = null;
    if (o.pin) pinTo(nearestPreset(h, 0.02));
    else state.preset = state.live ? null : nearestPreset(h, 0.02);
    apply(h); emit('hours'); return state;
  }
  /** Unpin and ease back to a JST hour. A gap over two minutes plays the same 3.2 s transition as a preset. */
  function followLive(h, o = {}) {
    const to = wrap24(h ?? jstNow(nowFn()).hours);
    state.pinned = false; state.live = true; state.preset = null;
    if (state.held && !o.instant) { pending = to; return state; }
    pending = null;
    if (o.instant || reduced()) { tr = null; apply(to); state.transitioning = false; emit('live'); return state; }
    if (Math.abs(clockDelta(state.hours, to)) > 2 / 60) beginTransition(to, o.duration ?? 3.2);
    else { tr = null; state.transitioning = false; emit('live'); }
    return state;
  }
  /** Freeze the live ease while a flight or a fishing trip is running. The queued hour plays when it lets go. */
  function hold(on) {
    state.held = !!on;
    if (!state.held && pending != null && state.live) { const to = pending; pending = null; followLive(to); }
  }
  /** Sunrise / sunset from /api/live `sun`. Lamps follow those hours. */
  function setSun(sun) {
    state.sunTimes = sun && sun.sunrise != null ? { sunrise: sun.sunrise, sunset: sun.sunset, dawn: sun.dawn, dusk: sun.dusk } : null;
    apply(state.hours); emit('sun'); return state;
  }
  /** Live weather: { cover 0..1, rain 0..1, wet, windMs, windDirDeg, sky, temp } (mapWeather / the render block). */
  function setWeather(w = {}, o = {}) {
    const W = state.weather;
    if (w.cover != null) W.cloud = w.cover; if (w.rain != null) W.rain = w.rain;
    if (w.wet != null) W.wet = w.wet;   // [v3:integrate] streets still wet after a shower (lamp reflections), no rain falling
    if (w.windMs != null) W.wind = w.windMs; if (w.windDirDeg != null) W.windDirDeg = w.windDirDeg;
    if (w.sky != null) W.sky = w.sky; if (w.temp != null) W.temp = w.temp; if (w.station != null) W.station = w.station;
    if (!weatherLive || o.instant) snapShade();
    // wind uniform: direction the wind blows TO (JMA gives where it comes FROM), strength ~ m/s scaled for sway.
    // Trees, laundry and the rain streaks already read uWind. uRipple speeds the water's painted ripples with the same wind.
    const a = (W.windDirDeg + 180) * Math.PI / 180, k = Math.min(1.6, 0.35 + W.wind / 6);
    S.uWind?.value?.set(Math.sin(a) * k, -Math.cos(a) * k);
    if (S.uRipple) S.uRipple.value = Math.min(2.1, 0.55 + (W.wind || 0) / 7);
    apply(state.hours); emit('weather');
  }

  /** [v5:detail] Switch a look on (LOOKS id) or off (null): the photo look also moves the clock and the date. */
  function setLook(id) {
    const L2 = LOOKS[id] || null;
    state.look = L2 ? id : null;
    if (L2) { doy = dayOfYearOf(L2.date); state.date = L2.date; state.dayOfYear = doy; state.weather.cloud = L2.cover; tr = null; apply(L2.hours); }
    else { S.uLit.value = 0; state.overcast = 0; apply(state.hours); }
    emit('look'); return state;
  }

  // ---------------------------------------------------------------- lights (life owns them; the sky core made them)
  let sunL = ctx.sky?.sun || null, hemi = ctx.sky?.hemi || null;
  if (!sunL) { sunL = new THREE.DirectionalLight('#fff0dc', 2.75); sunL.castShadow = true; ctx.scene.add(sunL); ctx.scene.add(sunL.target); }
  if (!hemi) { hemi = new THREE.HemisphereLight('#a9b3ee', '#d9c6c8', 1.62); ctx.scene.add(hemi); }
  state.lights = { sun: sunL, hemi };
  const _grey = new THREE.Color('#c9ccd8'), _gs = new THREE.Color(), _gg = new THREE.Color();

  function apply(h) {
    state.hours = h;
    const s = sunPosition(wrap24(h), doy);
    state.sun.azimuth = s.az; state.sun.elevation = s.el;
    const el = s.el;
    state.night = nightFromElevation(el); state.lamps = lampsFromElevation(el); state.dusk = duskFromElevation(el);
    if (!LOOKS[state.look] && state.sunTimes) {
      const fromSun = lampsFromSunTimes(h, state.sunTimes);
      if (fromSun != null) state.lamps = fromSun;
    }
    sunDir.set(s.dir[0], s.dir[1], s.dir[2]).normalize();
    keyLight(sunDir, state.lightDir).normalize();
    const mornW = morningShadow(h, state.lightDir, !!LOOKS[state.look]);   // [live r2] long morning shadows
    skyPaletteAt(h, pal);
    if (!LOOKS[state.look]) gradeHour(h, pal);
    // [v5:detail] a look repaints the hour's palette (keeping a little of its tint) before the weather and night grades
    const LKa = LOOKS[state.look];
    if (LKa) {
      for (const [c, hex] of Object.entries(LKa.pal)) pal[c].lerp(_gs.set(hex), LKa.mix);
      pal.sunI = LKa.sunI; pal.hemiI = LKa.hemiI; pal.exposure = LKa.exposure; pal.bloom = LKa.bloom; pal.glow = LKa.glow; pal.leak = 0; pal.neutral = 1;
      state.dusk = Math.min(state.dusk, LKa.dusk); state.lamps = LKa.lamps ?? 1;   // [v5:photos3] the sunny look keeps the lamps off
    }
    S.uLit.value = LKa ? LKa.lit : 0; if (!LKa) pal.neutral = 0;
    // [live r2] shade is the eased weather. A shower clears in ~1.2 s. The target stays on state.weather.
    const rain = shade.rain || 0, cloud = shade.cloud ?? 0;
    const over = Math.min(1, smooth(0.55, 1.0, cloud) * 0.8 + 0.3 * rain);
    const wet = Math.min(1, Math.max(shade.wet || 0, rain * 1.15));
    state.sheen = wet;
    S.uWet.value = wet; S.uRain.value = rain;
    const cover = !LKa && rain > 0.02 ? gradeRain(pal, rain) : 0;
    state.overcast = LKa ? (LOOKS[state.look].overcast ?? 1) : cover;
    // rain darkens the evening earlier: lamps come on sooner under heavy cloud
    state.lamps = Math.min(1, state.lamps + over * 0.35 * smooth(8, 1, el) * (1 - state.lamps));
    S.uNight.value = state.night; S.uLamps.value = state.lamps; S.uDusk.value = state.dusk;
    if (S.uSunDir) S.uSunDir.value.copy(state.lightDir);
    // heavy rain: the key nearly goes, the hemisphere rises, so the town stays bright without hard shadows
    const sunKeep = cover > 0 ? Math.max(0.1, 1 - 0.86 * cover) : (1 - 0.42 * over);
    sunL.color.copy(pal.sun).lerp(_grey, cover > 0 ? 0.25 * cover : over * 0.45);
    sunL.intensity = pal.sunI * sunKeep;
    hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGround);
    hemi.intensity = pal.hemiI * (cover > 0 ? (1.18 + 0.22 * cover) : (1 + 0.16 * over));
    sunL.shadow.radius = LKa ? 1.6 : 1.6 + mornW * 1.8 + (cover > 0 ? 1.2 + 2.2 * cover : 0);
    // cloud without rain: the old soft grey, brightness kept. Rain took the grade above.
    if (cover < 0.01 && over > 0.01 && !LKa) {
      const k = over * 0.75;
      for (const c of ['zenith', 'mid', 'horizon', 'warm', 'fog', 'cloudLit', 'cloudShade']) {
        const col = pal[c]; if (!col?.isColor) continue;
        const l = col.r * 0.3 + col.g * 0.55 + col.b * 0.15;
        _gs.setRGB(l * 0.93, l * 0.97, l * 1.08); col.lerp(_gs, k).multiplyScalar(1 - 0.12 * over);
      }
      pal.leak *= 1 - over; pal.bloom += 0.04 * over;
    }
    // night grade (see GRADE)
    const G = state.grade, k = state.night;
    if (k > 0) {
      _gs.set(G.hemiSky); _gg.set(G.hemiGround);
      hemi.color.lerp(_gs, k * G.mix); hemi.groundColor.lerp(_gg, k * G.mix);
      hemi.intensity *= 1 - (1 - G.hemi) * k; sunL.intensity *= 1 - (1 - G.sun) * k;
      pal.exposure += G.exp * k; pal.bloom += G.bloom * k; pal.glow += G.glow * k;
    }
  }

  function update(dt) {
    if (weatherLive && easeShade(dt)) apply(state.hours);
    weatherLive = true;
    if (state.held) return;
    if (tr && dt > 0) {
      tr.t += dt;
      const u = Math.min(1, tr.t / tr.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      apply(wrap24(tr.from + tr.d * e));
      if (u >= 1) { tr = null; state.transitioning = false; state.preset = state.live ? null : state.preset; emit('end'); }
      return;
    }
    if (!state.live || state.pinned) return;
    const target = pending ?? jstNow(nowFn()).hours;
    const step = stepLiveClock(state.hours, target, dt);
    if (step.mode === 'transition') { beginTransition(target); return; }
    if (Math.abs(clockDelta(state.hours, step.hours)) > 1e-7) apply(step.hours);
  }
  state.update = update;
  apply(opts.hours ?? LK?.hours ?? resolveHours(opts.preset || 'yugata'));
  state.live = !!opts.live && !LK;
  state.pinned = !state.live;
  state.preset = state.live ? null : (opts.preset || nearestPreset(state.hours, 0.02));
  return state;
}
