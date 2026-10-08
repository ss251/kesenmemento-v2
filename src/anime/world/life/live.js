// [v3:life] Live data in the browser: today's Kesennuma from /api/live (scripts/live.js via scripts/serve.js:
// JMA AMeDAS + forecast, 気仙沼漁協 入船情報), falling back to the saved sample data/live/sample.json (always flagged
// サンプル). Weather drives the sky and rain (time.setWeather), arrivals feed a boat list for the UI and the harbor.
//
//   const live = createLive(ctx, T, { fixtures, applyWeather })
//   live.state   { status: 'loading'|'ok'|'error', origin: 'live'|'cache'|'fixture'|'sample', sample: bool, stale: bool, staleAt, weather, arrivals, updated }
//   [v3:fix] stale: served from the server's cache over 1 h old, or a port list dated before today (JST) -> labelled キャッシュ
//   live.onChange(fn)    live.refresh()
// Publishes ctx.services.arrivals = { list: [{ vessel, time, h, type, typeEn, catch, catchEn, kg, kind, estimated }], sample,
//   origin, onChange(fn) } — the harbor package may spawn arriving boats with these real vessel names.

import { mapWeather } from './wxmap.js';

export function normalizeArrivals(port) {
  return (port?.arrivals || []).map((a) => ({
    vessel: a.vessel, time: a.time, h: a.eta?.h ?? null, estimated: !!a.eta?.estimated,
    type: a.type, typeEn: a.typeEn, kind: a.kind, catch: a.catch, catchEn: a.catchEn, kg: a.kg ?? null,
  })).filter((a) => a.vessel);
}
/** [v3:fix] Is a live answer really live? Cached blocks (the server's network fetch failed) over 1 h old, or a port list
 *  dated before today in JST, are stale: the chip says キャッシュ with the time instead of ライブ. Pure (tests). */
export function staleness(s, origin, now = Date.now()) {
  let stale = false, at = null;
  if (origin !== 'live' || !s) return { stale, at };
  for (const k of ['weather', 'port']) {
    const b = s[k]; if (!b) continue;
    const t = b.fetchedAt ? Date.parse(b.fetchedAt) : NaN;
    if ((b.origin === 'cache' || s.origins?.[k] === 'cache') && !(now - t < 3600e3)) { stale = true; if (Number.isFinite(t)) at = t; }
  }
  const jstToday = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const pd = String(s.port?.date || '').replace(/\//g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(pd) && pd < jstToday) stale = true;   // the co-op lists tomorrow's 予定 in the evening
  return { stale, at };
}
/** The /api/live weather block -> { cover, rain, wet, windMs, windDirDeg, sky, temp }. */
export function weatherRender(w, prev = null) {
  return mapWeather(w, prev);
}

export function createLive(ctx, T, o = {}) {
  const listeners = new Set();
  const arrL = new Set();
  const state = { status: 'loading', origin: null, sample: false, weather: null, arrivals: [], updated: null, error: null };
  const svc = { list: [], sample: false, origin: null, onChange: (fn) => (arrL.add(fn), () => arrL.delete(fn)) };
  ctx.services.arrivals = svc;
  const emit = () => { for (const f of listeners) try { f(state); } catch (e) { console.error(e); } for (const f of arrL) try { f(svc); } catch (e) { console.error(e); } };

  async function get(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
  async function refresh() {
    let s = null, origin = null;
    if (!o.offline) {
      try { s = await get('/api/live' + (o.fixtures ? '?fixtures=1' : '')); origin = s.sample ? 'fixture' : 'live'; } catch (e) { state.error = String(e.message || e); }
    }
    if (!s) {
      try { s = await get(new URL('data/live/sample.json', location.href).href); origin = 'sample'; } catch (e) { state.error = String(e.message || e); }
    }
    if (!s) { state.status = 'error'; emit(); return state; }
    state.status = 'ok'; state.origin = origin; state.sample = origin !== 'live' || !!s.sample;
    state.weather = s.weather ? { ...weatherRender(s.weather, state.weather), station: s.weather.station, observedAt: s.weather.observedAt, forecast: s.weather.forecast, source: s.weather.source } : null;
    state.sun = s.sun || null;
    state.ais = s.ais || null;
    state.arrivals = normalizeArrivals(s.port);
    state.portDate = s.port?.date || null;
    state.updated = s.updated || null;
    // [v3:fix] a cached copy (network failed) older than 1 h, or a port list dated before today (JST), is not "live"
    { const st = staleness(s, origin); state.stale = st.stale; state.staleAt = st.at; }
    svc.list = state.arrivals; svc.sample = state.sample; svc.origin = origin; svc.date = state.portDate;
    if (o.applyWeather !== false && state.weather) T.setWeather(state.weather);
    if (state.sun) T.setSun?.(state.sun);
    ctx.services.ais = state.ais;
    emit();
    return state;
  }
  const api = { state, refresh, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)) };
  api.ready = refresh();
  if (o.poll && typeof setInterval === 'function') setInterval(refresh, o.poll);
  return api;
}
