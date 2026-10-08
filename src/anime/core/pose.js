// [contrib] The camera pose of a report, and the ?cam= link that restores it (docs/contrib/APP.md).
//
// A 「修正を報告」 report carries the exact view the contributor was looking at. This module turns the live camera into a plain JSON
// pose and back into a link a moderator can open. It has no DOM and no three.js dependency, so the maths is unit-tested
// (test/contrib-pose.test.js).
//
// Frame (src/anime/world/layout.js): metres, x east, y up (T.P.), z SOUTH; origin 38.9060 N 141.5750 E.
//     lon = x / 86744 + 141.5750          lat = 38.9060 - z / 111014
// heading  compass degrees, clockwise from north (0 north, 90 east), [0, 360): the EXIF GPSImgDirection convention, so a screenshot's
//          heading and a photo's heading compare directly. The engine's yaw is its negative (yaw 0 = north, +90 = west):
//          yaw = -heading, as tools/anime/photo-pairs.mjs does.
// pitch    degrees, positive up.
// fov      the camera's VERTICAL field of view, degrees (what the survey tools call fov).
//
// The pose that goes with a report (JSON, all numbers rounded for a short link):
//   { enu: [x, y, z], latlon: [lat, lon], heading, pitch, fov, mode, at, appVersion, layoutVersion, timePreset, season, viewport: { w, h, dpr } }
//   mode        'walk' | 'drive' | 'fly' | 'drone' | 'sail'
//   at          ISO 8601, UTC
//   timePreset  'asa' | 'hiru' | 'yugata' | 'yuyake' | 'yoru', or the JST clock 'HH:MM' when the time is off a preset; null when unknown
//   season      'spring' | 'summer' | 'autumn' | 'winter' | 'early'; null when unknown
//
// The link:  ?cam=x,y,z,heading,pitch,fov   six numbers. main.js camSpec restores it (the legacy ?cam=x,y,z,yaw,pitch has five and keeps
// its meaning). poseToUrl also appends ?preset= / ?hours= and ?season= so the light and the season match the screenshot.
import { APP_VERSION, LAYOUT_VERSION } from './buildinfo.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
export const ORIGIN = { lat: 38.9060, lon: 141.5750 };
export const M_PER_DEG = { lon: 86744.0, lat: 111014.0 };
export const MODES = ['walk', 'drive', 'fly', 'drone', 'sail'];
export const PRESET_IDS = ['asa', 'hiru', 'yugata', 'yuyake', 'yoru'];
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter', 'early'];
/** The JST hour each time preset starts at (life/time.js PRESETS), for ?hours= when only the preset is known. */
const PRESET_HOURS = { asa: 6.5, hiru: 12, yugata: 16.5, yuyake: 17 + 20 / 60, yoru: 19.5 };

/** Round to d decimals; never -0 (a pose of -0 would print "-0" in the link). */
export const round = (v, d = 2) => { const k = 10 ** d; const r = Math.round(v * k) / k; return r === 0 ? 0 : r; };
/** Any angle -> [0, 360). */
export const norm360 = (a) => ((a % 360) + 360) % 360;
/** Any angle -> (-180, 180]. */
export const norm180 = (a) => { const r = norm360(a); return r > 180 ? r - 360 : r; };

// ------------------------------------------------------------------ frame
/** ENU metres (x east, z south) -> { lat, lon }. */
export const enuToLatLon = (x, z) => ({ lat: ORIGIN.lat - z / M_PER_DEG.lat, lon: ORIGIN.lon + x / M_PER_DEG.lon });
/** { lat, lon } degrees -> ENU metres { x, z }. */
export const latLonToEnu = (lat, lon) => ({ x: (lon - ORIGIN.lon) * M_PER_DEG.lon, z: -(lat - ORIGIN.lat) * M_PER_DEG.lat });
/** The engine's yaw (degrees, 0 north, +90 west) <-> a compass heading (clockwise from north). */
export const headingFromYaw = (yawDeg) => norm360(-yawDeg);
export const yawFromHeading = (headingDeg) => norm180(-headingDeg);

/** The unit vector a camera with quaternion q = { x, y, z, w } looks along (its -z axis), in world coordinates. */
export function forwardFromQuaternion(q) {
  const { x, y, z, w } = q;
  return { x: -2 * (x * z + w * y), y: -2 * (y * z - w * x), z: -(1 - 2 * (x * x + y * y)) };
}
/** Compass heading [0, 360) and pitch (degrees, + up) of a camera quaternion. */
export function anglesFromQuaternion(q) {
  const f = forwardFromQuaternion(q);
  return { heading: norm360(Math.atan2(f.x, -f.z) * DEG), pitch: Math.asin(Math.max(-1, Math.min(1, f.y))) * DEG };
}
/** A quaternion for the engine's camera: yaw (rotation about +y, degrees, + turns west) then pitch (about x, + looks up), Euler 'YXZ'. */
export function quaternionFromYawPitch(yawDeg, pitchDeg) {
  const hy = yawDeg * RAD / 2, hx = pitchDeg * RAD / 2;
  const sy = Math.sin(hy), cy = Math.cos(hy), sx = Math.sin(hx), cx = Math.cos(hx);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };   // q = qY * qX
}

// ------------------------------------------------------------------ capture
/**
 * How the visitor is looking at the town: 'sail' (the voyage or the helm), 'drive', 'walk', else a free camera: 'drone' (the HUD's
 * ドローン view, or an auto-tour flight) or 'fly' (free flight after F / the 飛ぶ button while the HUD says 歩く).
 */
export function deriveMode(ctx) {
  const S = ctx?.services || {};
  if (S.ship?.voyage?.active || S.sail?.active || S.ship?.sail?.active) return 'sail';
  if (S.explore?.drive?.active) return 'drive';
  if (!ctx?.playerObj?.fly) return 'walk';
  const tour = S.life?.tour;
  if (tour?.flying || tour?.playing) return 'drone';
  return S.life?.hud?.view === 'walk' ? 'fly' : 'drone';
}
/** The preset id, or the 'HH:MM' JST clock when the time is off a preset, or null. */
export function deriveTimePreset(ctx) {
  const T = ctx?.services?.time;
  if (!T) return null;
  if (T.preset) return String(T.preset);
  const c = typeof T.clock === 'function' ? T.clock() : null;
  return typeof c === 'string' && /^\d{1,2}:\d{2}$/.test(c) ? c : null;
}
export function deriveSeason(ctx) {
  const id = ctx?.services?.season?.id ?? ctx?.services?.life?.season?.id;
  return typeof id === 'string' && id ? id : null;   // (the backend refuses an empty string, and accepts null)
}
/** The window the visitor sees: CSS px and the device pixel ratio. */
export function viewportOf(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return { w: 0, h: 0, dpr: 1 };
  return { w: Math.round(win.innerWidth || 0), h: Math.round(win.innerHeight || 0), dpr: round(win.devicePixelRatio || 1, 2) };
}

/**
 * The pose of the camera right now. `ctx` is the app context (camera, playerObj, services); everything else is injectable for tests.
 * Rounded: metres and degrees to 0.01, lat / lon to 1e-7 (about a centimetre).
 */
export function capturePose(ctx, { now = new Date(), win, appVersion = APP_VERSION, layoutVersion = LAYOUT_VERSION } = {}) {
  const cam = ctx.camera, p = cam.position;
  const a = anglesFromQuaternion(cam.quaternion);
  const ll = enuToLatLon(p.x, p.z);
  let heading = round(a.heading, 2); if (heading >= 360) heading = 0;
  return {
    enu: [round(p.x, 2), round(p.y, 2), round(p.z, 2)],
    latlon: [round(ll.lat, 7), round(ll.lon, 7)],
    heading,
    pitch: round(a.pitch, 2),
    fov: round(cam.fov, 2),
    mode: deriveMode(ctx),
    at: now.toISOString(),
    appVersion, layoutVersion,
    timePreset: deriveTimePreset(ctx),
    season: deriveSeason(ctx),
    viewport: viewportOf(win),
  };
}

/** Problems with a pose, as a list of field names ([] = fine). The report API and the tests use it. */
export function poseProblems(p) {
  const bad = [];
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!p || typeof p !== 'object') return ['pose'];
  if (!Array.isArray(p.enu) || p.enu.length !== 3 || !p.enu.every(finite)) bad.push('enu');
  if (!Array.isArray(p.latlon) || p.latlon.length !== 2 || !p.latlon.every(finite) || Math.abs(p.latlon[0]) > 90 || Math.abs(p.latlon[1]) > 180) bad.push('latlon');
  if (!finite(p.heading) || p.heading < 0 || p.heading >= 360) bad.push('heading');
  if (!finite(p.pitch) || Math.abs(p.pitch) > 90) bad.push('pitch');
  if (!finite(p.fov) || p.fov <= 1 || p.fov >= 170) bad.push('fov');
  if (!MODES.includes(p.mode)) bad.push('mode');
  if (typeof p.at !== 'string' || Number.isNaN(Date.parse(p.at))) bad.push('at');
  return bad;
}

// ------------------------------------------------------------------ the link
const fmt = (v, d) => String(round(v, d));
/** "x,y,z,heading,pitch,fov": the value of ?cam=. */
export function poseToCam(p) {
  const heading = round(norm360(p.heading), 2) % 360;   // 359.999 rounds to 360: that is north again
  return [fmt(p.enu[0], 2), fmt(p.enu[1], 2), fmt(p.enu[2], 2), fmt(heading, 2), fmt(p.pitch, 2), fmt(p.fov, 2)].join(',');
}
/** "cam=x,y,z,heading,pitch,fov" (commas left as they are: they are legal in a query string). */
export const poseToQuery = (p) => 'cam=' + poseToCam(p);

/** The `cam` value out of whatever the caller has: the bare value, "cam=...", "?cam=...&x=y", a full URL, a URL, a URLSearchParams. */
function camValue(input) {
  if (input == null) return null;
  if (typeof URLSearchParams !== 'undefined' && input instanceof URLSearchParams) return input.get('cam');
  if (typeof URL !== 'undefined' && input instanceof URL) return input.searchParams.get('cam');
  let s = String(input).trim();
  if (!s) return null;
  if (!/[=?]/.test(s)) return s;
  const hash = s.indexOf('#'); if (hash >= 0) s = s.slice(0, hash);
  const q = s.indexOf('?'); if (q >= 0) s = s.slice(q + 1);
  try { return new URLSearchParams(s).get('cam'); } catch { return null; }
}

/**
 * Six numbers -> a (partial) pose { enu, latlon, heading, pitch, fov }, or null when the input is not exactly six finite numbers or
 * is out of range. Accepts the bare value, "cam=...", "?cam=...", a URL or a URLSearchParams.
 */
export function queryToPose(input) {
  const v = camValue(input);
  if (typeof v !== 'string') return null;
  const parts = v.split(',').map((s) => s.trim());
  if (parts.length !== 6 || parts.some((s) => s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s))) return null;
  const [x, y, z, heading, pitch, fov] = parts.map(Number);
  if (![x, y, z, heading, pitch, fov].every(Number.isFinite)) return null;
  if (Math.abs(x) > 1e5 || Math.abs(z) > 1e5 || y < -500 || y > 2e4 || Math.abs(pitch) > 90 || fov <= 1 || fov >= 170) return null;
  const ll = enuToLatLon(x, z);
  return { enu: [x, y, z], latlon: [round(ll.lat, 7), round(ll.lon, 7)], heading: round(norm360(heading), 2) % 360, pitch, fov };
}

/** What Player.setPose(x, z, yaw, pitch, y) and the camera's fov need to show a pose. */
export function poseToCamArgs(p) {
  return { x: p.enu[0], y: p.enu[1], z: p.enu[2], yaw: yawFromHeading(p.heading), pitch: p.pitch, fov: p.fov };
}

/**
 * The link a moderator opens: base?cam=...&preset=...&season=... (the light and the season of the screenshot; only what is known).
 * An off-preset clock 'HH:MM' becomes ?hours=.
 */
export function poseToUrl(p, base = '') {
  const q = [poseToQuery(p)];
  const tp = p.timePreset;
  if (PRESET_IDS.includes(tp)) q.push('preset=' + tp);
  else if (typeof tp === 'string' && /^\d{1,2}:\d{2}$/.test(tp)) { const [h, m] = tp.split(':').map(Number); q.push('hours=' + round(h + m / 60, 3)); }
  if (SEASON_IDS.includes(p.season)) q.push('season=' + p.season);
  return String(base).replace(/[?#].*$/, '') + '?' + q.join('&');
}
/** The hour a preset starts at (JST), for callers that only have the id. */
export const presetHours = (id) => PRESET_HOURS[id] ?? null;

/** The pose as JSON that is safe for a PNG tEXt chunk (Latin-1) and for HTTP: every non-ASCII character escaped as \uXXXX. */
export function poseToJson(p) {
  return JSON.stringify(p).replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
