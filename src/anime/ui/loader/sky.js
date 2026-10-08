// [loader] The sky of the loading screen: it follows the REAL clock in Kesennuma (JST), so the first thing a visitor sees is the town's own hour. 「帰港」.
//
//   skyState(date, sunPosition)  ->  { elevation, azimuth, hours, night, stops: [c0, c1, c2, c3], ink, sun: { x, y, a, color, glow }, moon: { x, y, a }, vars: { '--s0': '#…', … } }
//
// A pure function of the instant (never of the device's time zone: the hour is UTC + 9) and of the sun's elevation over Kesennuma, from the NOAA formula in src/web/lib/solar.js, which the
// page inlines next to this code (scripts/anime/loader-inline.js copies both into index.html, so the sky is painted with the first bytes: no request, no module). `sunPosition` is passed in
// for that reason, and so a test can give it any sun it likes. ?sky=HH:MM (JST) pins the time of day for screenshots and tests (loader glue in index.html), it is never needed in use.
//
// The colours are traditional Japanese colours (和色大辞典, colordic.org; docs/CRAFT.md section 1). Each anchor below is the 4 stops of the sky at one sun elevation, top to horizon; between
// anchors the stops are mixed linearly in the elevation, so dawn, noon, golden hour, blue hour and night run into each other without a step. Morning (before noon) and evening differ only
// where the real sky does: dawn is 東雲 (peach), dusk is 茜 (madder red). `ink` is the colour of the wordmark and the other lettering that sits on the sky: whichever of 紺 and 生成り has
// the better contrast against the sky behind the mark (the mark is large type: 3:1 or better at every hour, measured in test/loader.test.js).

/** Kesennuma City Hall (気仙沼市役所): latitude, longitude. */
export const KESENNUMA = Object.freeze({ lat: 38.9086, lon: 141.5698 });
/** 和色大辞典 (colordic.org) values, the same as docs/CRAFT.md section 1. */
export const WA = Object.freeze({
  AI: '#165E83',        // 藍色 ai: the sea
  KON: '#223A70',       // 紺色 kon: night
  TEKKON: '#17184B',    // 鉄紺 tetsukon: the darkest sky
  ASAGI: '#00A3AF',     // 浅葱色 asagi: the water's crest line
  WASURE: '#89C3EB',    // 勿忘草色 wasurenagusa: the day sky
  SHINO: '#F19072',     // 東雲色 shinonome: dawn
  YAMA: '#F8B500',      // 山吹色 yamabuki: gold, the low sun and the harbour lights
  AKANE: '#B7282E',     // 茜色 akane: dusk, the seal
  KINARI: '#FBFAF5',    // 生成り色 kinari: paper, light lettering
  SUMI: '#595857',      // 墨 sumi: secondary lettering
});

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** Linear mix of two #rrggbb colours: t = 0 gives a, t = 1 gives b. */
export function mix(a, b, t) { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lum = (c) => { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio of two colours (1 to 21). */
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const { AI, KON, TEKKON, WASURE, SHINO, YAMA, AKANE, KINARI } = WA;
/** The sky at six sun elevations (degrees), four stops each (zenith, upper, lower, horizon), for the morning and for the evening. */
export const ANCHORS = Object.freeze([
  { e: -16, am: [TEKKON, KON, mix(KON, AI, 0.3), mix(KON, AI, 0.65)], pm: [TEKKON, KON, mix(KON, AI, 0.3), mix(KON, AI, 0.65)] },
  { e: -7, am: [KON, mix(KON, AI, 0.5), mix(AI, SHINO, 0.32), mix(SHINO, AI, 0.45)], pm: [KON, mix(KON, AI, 0.5), mix(AI, AKANE, 0.3), mix(AKANE, AI, 0.5)] },
  { e: 0, am: [mix(AI, WASURE, 0.5), mix(WASURE, SHINO, 0.28), mix(SHINO, YAMA, 0.35), mix(YAMA, KINARI, 0.2)], pm: [mix(AI, WASURE, 0.45), mix(WASURE, AKANE, 0.2), mix(AKANE, YAMA, 0.45), mix(YAMA, KINARI, 0.15)] },
  { e: 8, am: [mix(WASURE, AI, 0.25), WASURE, mix(WASURE, YAMA, 0.2), mix(YAMA, KINARI, 0.45)], pm: [mix(WASURE, AI, 0.3), WASURE, mix(WASURE, SHINO, 0.25), mix(YAMA, SHINO, 0.35)] },
  { e: 24, am: [mix(WASURE, AI, 0.18), WASURE, mix(WASURE, KINARI, 0.3), mix(WASURE, KINARI, 0.55)], pm: [mix(WASURE, AI, 0.18), WASURE, mix(WASURE, KINARI, 0.3), mix(WASURE, KINARI, 0.55)] },
]);

/** The four stops for a sun elevation and a half of the day (am = before noon). */
export function stopsFor(elevation, am) {
  const A = ANCHORS, k = am ? 'am' : 'pm';
  if (elevation <= A[0].e) return [...A[0][k]];
  if (elevation >= A[A.length - 1].e) return [...A[A.length - 1][k]];
  let i = 0; while (elevation > A[i + 1].e) i++;
  const t = (elevation - A[i].e) / (A[i + 1].e - A[i].e);
  return A[i][k].map((c, j) => mix(c, A[i + 1][k][j], t));
}

/** The sun's apparent place in the picture (percent of the screen, the horizon at `hz`): it rises on the right (the east of a picture looking up the bay) and sets on the left. */
function sunPlace(elevation, hours, hz, wide) {
  const e = clamp(elevation, 0, 56), lo = wide ? 48 : 12, hi = wide ? 82 : 88;   // (a wide screen keeps the sun clear of the mark on the left)
  return { x: clamp(hi - ((hours - 5.5) / (18.5 - 5.5)) * (hi - lo + (wide ? 0 : 2)), lo, hi), y: Math.max(32, hz - (e / 56) * (hz - 15)) };   // (never up in the lettering: the mark ends at about 28 %)
}

/**
 * @param {Date} date                the instant (any time zone; the hour used is JST)
 * @param {(d: Date, lat: number, lon: number) => { azimuth: number, elevation: number }} sunPosition   NOAA, src/web/lib/solar.js
 * @param {{ lat?: number, lon?: number, hz?: number, wide?: boolean }} [o]   hz: the horizon, percent of the height (the page's --hz); wide: a landscape screen (the mark is on the left)
 */
export function skyState(date, sunPosition, { lat = KESENNUMA.lat, lon = KESENNUMA.lon, hz = 72, wide = false } = {}) {
  const jst = new Date(date.getTime() + 9 * 3600000), hours = jst.getUTCHours() + jst.getUTCMinutes() / 60 + jst.getUTCSeconds() / 3600;
  const { elevation, azimuth } = sunPosition(date, lat, lon);
  const am = hours < 12;
  const stops = stopsFor(elevation, am);
  const night = clamp((-elevation - 3) / 9, 0, 1);
  // lettering on the sky: the mark sits over the upper-middle of the sky (between stops 1 and 2); 紺, 鉄紺 or 生成り, whichever reads best
  const behind = mix(stops[1], stops[2], 0.5);
  const ink = [KON, TEKKON, KINARI].reduce((best, c) => (contrast(c, behind) > contrast(best, behind) ? c : best));   // (large lettering: 3:1 is the bar, docs/CRAFT.md section 1)
  const p = sunPlace(elevation, hours, hz, wide);
  const sunA = clamp((elevation + 4) / 6, 0, 1);
  const sunColor = elevation < 6 ? mix(AKANE, YAMA, clamp((elevation + 4) / 10, 0, 1)) : mix(YAMA, KINARI, clamp((elevation - 6) / 18, 0, 1) * 0.7);   // never a white blob: even at noon the sun keeps some 山吹
  const glow = Math.round(104 - clamp(elevation, 0, 40) * 1.4);
  const moon = { x: 22, y: 38, a: +night.toFixed(3) };
  const sun = { x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: +sunA.toFixed(3), color: sunColor, glow };
  const vars = {
    '--s0': stops[0], '--s1': stops[1], '--s2': stops[2], '--s3': stops[3], '--ink': ink,
    '--sun-x': sun.x + '%', '--sun-y': sun.y + '%', '--sun-a': String(sun.a), '--sun-c': sun.color, '--sun-glow': sun.glow + 'px',
    '--moon-x': moon.x + '%', '--moon-y': moon.y + '%', '--moon-a': String(moon.a), '--night': String(+night.toFixed(3)),
    // the town on the far shore: hazier (more of the horizon's colour) the farther it is; the nearest is a dark 紺, darker still at night
    '--h1': mix(stops[3], KON, 0.3), '--h2': mix(stops[3], KON, 0.62), '--h3': mix(mix(KON, TEKKON, 0.45), TEKKON, night),
  };
  return { elevation, azimuth, hours, night, stops, ink, sun, moon, vars };
}

/** Parse ?sky= for a pinned time of day: "HH:MM" (JST, on the real date) or one of the names below. Returns a Date or null. */
export const SKY_NAMES = Object.freeze({ dawn: '05:50', morning: '08:30', day: '12:00', noon: '12:00', afternoon: '15:00', golden: '16:50', dusk: '17:25', blue: '17:55', night: '22:00', midnight: '00:30' });
export function pinnedSky(value, now = new Date()) {
  if (!value) return null;
  const hm = (SKY_NAMES[value] ?? value).match(/^(\d{1,2}):(\d{2})$/);
  if (!hm) return null;
  const j = new Date(now.getTime() + 9 * 3600000);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), +hm[1], +hm[2]) - 9 * 3600000);
}

/** Poster slots for the title (the world presets that have a still). Hours are the same values as life/time.js PRESETS. */
export const POSTER_HOURS = Object.freeze({ asa: 6.5, hiru: 12, yugata: 16.5, yoru: 19.5 });
const SKY_POSTER = Object.freeze({ dawn: 'asa', morning: 'asa', day: 'hiru', noon: 'hiru', afternoon: 'hiru', golden: 'yugata', dusk: 'yugata', blue: 'yoru', night: 'yoru', midnight: 'yoru' });

/** Which still a clock hour uses: 5–10 朝, 10–15 昼, 15–19 夕方, otherwise 夜. */
export function posterName(hours) {
  const h = ((Number(hours) % 24) + 24) % 24;
  if (h >= 5 && h < 10) return 'asa';
  if (h >= 10 && h < 15) return 'hiru';
  if (h >= 15 && h < 19) return 'yugata';
  return 'yoru';
}

/**
 * The poster for this page. `?poster=asa|hiru|yugata|yoru` pins it. Otherwise `?hours`, `?preset`, `?sky`, then the JST clock.
 * @param {URLSearchParams|string} search
 */
export function posterForQuery(search, now = new Date()) {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search : `?${search}`) : search;
  const pin = q.get('poster');
  if (pin && POSTER_HOURS[pin]) return pin;
  if (q.has('hours')) return posterName(Number(q.get('hours')));
  const preset = q.get('preset') || (q.get('look') === 'photo' ? 'photo' : '');
  if (preset === 'asa' || preset === 'hiru' || preset === 'yugata' || preset === 'yoru') return preset;
  if (preset === 'yuyake' || preset === 'photo') return 'yugata';
  const sky = q.get('sky');
  if (sky && SKY_POSTER[sky]) return SKY_POSTER[sky];
  if (sky && /^\d{1,2}:\d{2}$/.test(sky)) { const [h, m] = sky.split(':').map(Number); return posterName(h + m / 60); }
  const jst = new Date(now.getTime() + 9 * 3600000);
  return posterName(jst.getUTCHours() + jst.getUTCMinutes() / 60 + jst.getUTCSeconds() / 3600);
}
