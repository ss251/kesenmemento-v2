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

export const PRESETS = [
  { id: 'asa', ja: '朝', en: 'Morning', h: 6.5 },
  { id: 'hiru', ja: '昼', en: 'Noon', h: 12.0 },
  { id: 'yugata', ja: '夕方', en: 'Afternoon', h: 16.5 },
  { id: 'yuyake', ja: '夕焼け', en: 'Sunset', h: 17 + 20 / 60 },
  { id: 'yoru', ja: '夜', en: 'Night', h: 19.5 },
];
export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const DEMO_DATE = '2026-10-10';

const wrap24 = (h) => ((h % 24) + 24) % 24;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
  const sunDir = ctx.sunDir || new THREE.Vector3(0, 1, 0);
  const doy = opts.date ? dayOfYearOf(opts.date) : DEMO_DOY;
  const listeners = new Set();
  const pal = skyPaletteAt(16.5);
  const state = {
    presets: PRESETS, date: opts.date || DEMO_DATE, dayOfYear: doy,
    hours: 16.5, preset: 'yugata', target: null, night: 0, lamps: 0, dusk: 0, sunDir, palette: pal,
    sun: { azimuth: 0, elevation: 0 }, lightDir: new THREE.Vector3(0, 1, 0),
    weather: { cloud: 0.35, rain: 0, wind: 3, windDirDeg: 270, fog: 0 },   // live.js fills this; the sky core reads it
    // life's grade on top of foundation's palette (T.palette is life's copy; the sky core reads it): the night drops the
    // ambient so thousands of warm windows, lamp pools and boat lights carry the frame (promo.town's night), and the
    // bloom/glow rise with it. Tunable at runtime (window.__life.time.grade) for the look pass.
    grade: { ...GRADE },
    transitioning: false,
    set, setHours, setWeather,
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    get presetInfo() { return PRESET_BY_ID[state.preset] || null; },
    clock() { const h = wrap24(state.hours); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; },
  };
  let tr = null;
  const emit = (why) => { for (const fn of listeners) { try { fn(state, why); } catch (e) { console.error('[life/time] listener', e); } } };

  function resolveHours(p) { if (typeof p === 'number') return p; const pr = PRESET_BY_ID[p]; if (!pr) throw new Error('unknown time preset ' + p); return pr.h; }
  function nearestPreset(h, tol = 0.25) { const hh = wrap24(h); for (const p of PRESETS) if (Math.abs(p.h - hh) < tol) return p.id; return null; }
  function set(p, o = {}) {
    const to = resolveHours(p);
    state.preset = typeof p === 'string' ? p : nearestPreset(to);
    const dur = o.duration ?? 3.2;
    if (o.instant || !dur) { tr = null; apply(to); state.transitioning = false; emit('instant'); return state; }
    let d = wrap24(to) - wrap24(state.hours);
    if (d > 12) d -= 24; if (d < -12) d += 24;
    tr = { from: wrap24(state.hours), d, t: 0, dur };
    state.transitioning = true; state.target = to; emit('start');
    return state;
  }
  function setHours(h) { tr = null; state.preset = nearestPreset(h, 0.02); apply(h); emit('hours'); return state; }
  /** Live weather: { cover 0..1, rain 0..1, windMs, windDirDeg } (the /api/live weather.render block). */
  function setWeather(w = {}) {
    const W = state.weather;
    if (w.cover != null) W.cloud = w.cover; if (w.rain != null) W.rain = w.rain;
    if (w.wet != null) W.wet = w.wet;   // [v3:integrate] streets still wet after a shower (lamp reflections), no rain falling
    if (w.windMs != null) W.wind = w.windMs; if (w.windDirDeg != null) W.windDirDeg = w.windDirDeg;
    // wind uniform: direction the wind blows TO (JMA gives where it comes FROM), strength ~ m/s scaled for sway
    const a = (W.windDirDeg + 180) * Math.PI / 180, k = Math.min(1.6, 0.35 + W.wind / 6);
    S.uWind?.value?.set(Math.sin(a) * k, -Math.cos(a) * k);
    apply(state.hours); emit('weather');
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
    sunDir.set(s.dir[0], s.dir[1], s.dir[2]).normalize();
    keyLight(sunDir, state.lightDir).normalize();
    skyPaletteAt(h, pal);
    // weather: overcast dims and greys the key light a little (never murky: the ambient rises to compensate)
    const W = state.weather, over = Math.min(1, smooth(0.55, 1.0, W.cloud) * 0.8 + 0.3 * W.rain);
    const wet = Math.min(1, Math.max(W.wet || 0, W.rain * 1.6));
    S.uWet.value = wet; S.uRain.value = W.rain;
    // rain darkens the evening earlier: lamps come on sooner under heavy cloud
    state.lamps = Math.min(1, state.lamps + over * 0.35 * smooth(8, 1, el) * (1 - state.lamps));
    S.uNight.value = state.night; S.uLamps.value = state.lamps; S.uDusk.value = state.dusk;
    if (S.uSunDir) S.uSunDir.value.copy(state.lightDir);
    sunL.color.copy(pal.sun).lerp(_grey, over * 0.45); sunL.intensity = pal.sunI * (1 - 0.42 * over);
    hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGround); hemi.intensity = pal.hemiI * (1 + 0.16 * over);
    // overcast / rain: the painted sky, fog and clouds go soft grey-blue (keeping their brightness), no light leak
    if (over > 0.01) {
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
    if (tr && dt > 0) {
      tr.t += dt;
      const u = Math.min(1, tr.t / tr.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      apply(wrap24(tr.from + tr.d * e));
      if (u >= 1) { tr = null; state.transitioning = false; emit('end'); }
    }
  }
  state.update = update;
  apply(opts.hours ?? resolveHours(opts.preset || 'yugata'));
  state.preset = opts.preset || nearestPreset(state.hours, 0.02);
  return state;
}
