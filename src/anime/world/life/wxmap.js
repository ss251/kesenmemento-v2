// JMA observation + forecast -> the argument for time.setWeather.
// sky / code / precip10m / precip1h decide clear, partly, cloudy, rain. Wet streets linger after the rain stops.

const round2 = (n) => Math.round(n * 100) / 100;

/** A forecast that is neither plain 晴れ nor plain くもり (時々 / 後 / 一時, or a known mixed telop). */
export function isPartly(code, text = '') {
  const c = String(code || ''), t = String(text || '');
  if (/^(101|102|103|111|201|202|211|212|221)$/.test(c)) return true;
  if (/時々|一時/.test(t) && /晴/.test(t) && /曇|くもり/.test(t)) return true;
  if (c[0] === '2' && /晴/.test(t) && c !== '200') return true;
  if (c[0] === '1' && /曇|くもり/.test(t) && c !== '100') return true;
  return false;
}

/**
 * @param {object} w  /api/live weather block (sky, code, forecast, precip10m, precip1h, temp, render, wind)
 * @param {{wet?: number}|null} prev  previous mapped weather, so wet streets decay after the shower
 */
export function mapWeather(w, prev = null) {
  if (!w) return null;
  const r = w.render || {};
  const text = `${w.forecast || ''} ${w.text || ''}`;
  let sky = w.sky || 'clear';
  if (sky === 'partly-cloudy') sky = 'partly';
  if (w.code && isPartly(w.code, text) && sky !== 'rain' && sky !== 'snow') sky = 'partly';
  const p10 = w.precip10m == null ? null : +w.precip10m;
  const p1 = w.precip1h == null ? null : +w.precip1h;
  let cover = r.cover ?? (sky === 'clear' ? 0.22 : sky === 'partly' ? 0.48 : sky === 'cloudy' ? 0.75 : 0.9);
  let rain = r.rain ?? 0;
  if ((p10 != null && p10 > 0) || (p1 != null && p1 > 0)) {
    // under 1 mm/h is light rain: the same overcast, a lighter grade. A shower is the full deck.
    const mmh = Math.max(p10 > 0 ? p10 * 6 : 0, p1 > 0 ? p1 : 0);
    const intensity = mmh < 1 ? 0.22 + 0.2 * Math.max(mmh, 0.15) : Math.min(1, 0.42 + (mmh - 1) / 7);
    rain = Math.max(rain, intensity);
    cover = Math.max(cover, mmh < 1 ? 0.9 : 0.95);
    sky = w.temp != null && w.temp < 1 ? 'snow' : 'rain';
  } else if (p10 === 0 && p1 === 0 && (sky === 'rain' || sky === 'snow')) {
    rain = 0;
    sky = 'cloudy';
    cover = Math.min(cover, 0.8);
  } else if (sky === 'rain' || sky === 'snow') {
    rain = Math.max(rain, 0.45);
    cover = Math.max(cover, 0.9);
  }
  if (sky === 'clear') cover = Math.min(cover, 0.32);
  else if (sky === 'partly') cover = Math.min(0.62, Math.max(0.4, cover));
  else if (sky === 'cloudy') cover = Math.max(cover, 0.68);
  let wet = 0;
  if (rain > 0.15) wet = Math.min(1, 0.4 + rain * 0.75);
  else if ((p1 ?? 0) > 0 && !(p10 > 0)) wet = Math.min(1, 0.32 + p1 / 5);
  else if (prev && prev.wet > 0.02) wet = Math.max(0, prev.wet * 0.85);
  else if (w.wet != null) wet = +w.wet;
  else if (r.wet != null) wet = +r.wet;
  const windMs = r.windMs ?? w.windMs ?? w.wind?.speed ?? 3;
  const windDirDeg = r.windDirDeg ?? w.windDirDeg ?? w.wind?.dir ?? 270;
  return {
    cover: round2(Math.min(1, Math.max(0, cover))),
    rain: round2(Math.min(1, Math.max(0, rain))),
    wet: round2(Math.min(1, Math.max(0, wet))),
    windMs, windDirDeg, sky,
    temp: w.temp ?? null,
    station: w.station ?? null,
    source: w.source ?? null,
    code: w.code ?? null,
    precip10m: p10, precip1h: p1,
  };
}
