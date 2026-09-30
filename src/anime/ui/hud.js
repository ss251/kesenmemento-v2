// [v3:life] The minimal UI (V3-SPEC section 4, life): wordmark 気仙沼 リビングシティ + a live chip (time, weather,
// arrivals), time presets, tour stops, drone/walk toggle, photo mode (4K PNG), hide-UI (H), JA/EN, attribution.
// Every string comes from data/i18n.json. Mounted by the life module; visible once the player enters the town
// (body.playing), or immediately with ?ui=1 (screenshots of the UI).
//
//   const hud = mountHud(ctx, life, { force })   ->  { el, update(dt), photo(scale) }
import { CSS } from './style.js';
import { createI18n, STRINGS } from './i18n.js';
import { takePhoto } from './photo.js';

const ICON = {
  drone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 14c3-5 6-7 9-7s6 2 9 7"/><path d="M12 7v10"/><path d="M8 20h8"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4.5" r="2"/><path d="M11 21l2-6 3 3v3"/><path d="M8 12l3-4 3 2 3 1"/><path d="M11 8l-1 5 3 2"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 20L20 4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  boat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15h18l-2.5 4.5h-13z"/><path d="M7 15V9h6l3 6"/><path d="M10 9V5"/></svg>',
  planet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M3.5 15.5c3 2.2 12.3 -1.2 17 -6.5"/><path d="M8 9.5l1.5 1.5M14 13l1 2"/></svg>',
  caret: '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px"><path d="M6 9l6 6 6-6"/></svg>',
};
const WX = { clear: '☀', cloudy: '☁', rain: '☂', snow: '❄' };
const PRESET_DOT = { asa: '#ffd6ae', hiru: '#8fbde9', yugata: '#ffc996', yuyake: '#ff8f5c', yoru: '#2a3a70' };
const stopName = (s, lang) => STRINGS[lang]?.['v3.stop.' + s.id] ?? (lang === 'en' ? s.en : s.ja);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtH = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };

export function mountHud(ctx, life, o = {}) {
  if (typeof document === 'undefined') return null;
  const I = createI18n();
  const T = life.time, tour = life.tour, live = life.live;
  if (!document.getElementById('klc-ui-css')) { const st = document.createElement('style'); st.id = 'klc-ui-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-ui'; el.setAttribute('lang', I.lang);
  document.body.appendChild(el); document.body.classList.add('klc-ui');
  // hidden UI (H / the eye button): a faint eye brings it back on touch screens (never part of a photo: the canvas is)
  const restore = document.createElement('button'); restore.id = 'klc-ui-restore'; restore.setAttribute('aria-label', I.t('v3.hide'));
  restore.innerHTML = ICON.eye; restore.addEventListener('click', () => document.body.classList.remove('noui'));
  document.body.appendChild(restore);
  // the places panel is collapsed by default on desktop (a clean frame; one click opens it); remembered per viewer
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  const qp = new URLSearchParams(location.search);
  const ui = { arrivalsOpen: qp.get('arrivals') === '1', view: 'drone', placesOpen: qp.has('places') ? qp.get('places') === '1' : store.get('klc.places') === '1' };

  const qSel = document.getElementById('quality');   // [v3:integrate] kept across re-renders (innerHTML would destroy it)
  function render() {
    const t = I.t;
    if (qSel?.parentNode) qSel.remove();
    el.setAttribute('lang', I.lang);
    el.innerHTML = `
      <div class="brand">
        <div class="mark" role="heading" aria-level="1">${esc(t('v3.wordmark'))}<small>${esc(t('v3.wordmarkSub'))}</small></div>
        <button class="chip glass" data-act="arrivals" aria-expanded="${ui.arrivalsOpen}" aria-controls="klc-arr">
          <span class="clock" data-f="clock">${esc(T.clock())}</span><span class="sep"></span>
          <span class="wx" data-f="wx"></span><span class="sep wx"></span>
          <span class="boats" data-f="boats"></span>
          <span class="tag" data-f="tag"></span>${ICON.caret}
        </button>
        <section class="arrivals glass" id="klc-arr" ${ui.arrivalsOpen ? '' : 'hidden'} aria-label="${esc(t('v3.arrivals.title'))}">
          <h3><span>${esc(t('v3.arrivals.title'))}</span><span class="tag" data-f="tag2"></span></h3>
          <ol data-f="list"></ol>
        </section>
      </div>
      <div class="tools">
        <button class="round txt glass" data-act="lang" aria-label="${esc(t('lang.toggle'))}">${esc(t('v3.lang'))}</button>
        ${life.season ? `<button class="round txt glass season" data-act="season" aria-label="${esc(t('v3.season'))}: ${esc(t('v3.season.' + life.season.id))}" title="${esc(t('v3.season'))} (K)">${esc(t('v3.season.short.' + life.season.id))}</button>` : ''}
        <button class="round glass" data-act="sound" aria-pressed="false" aria-label="${esc(t('v3.sound'))}" title="${esc(t('v3.sound'))} (M)">${ICON.sound}</button>
        <button class="round glass" data-act="planet" aria-pressed="${!!ctx.planet?.active}" aria-label="${esc(t('v3.planet'))}" title="${esc(t('v3.planet'))} (O)">${ICON.planet}</button>
        <button class="round glass" data-act="hide" aria-label="${esc(t('v3.hide'))}" title="${esc(t('v3.hide'))}">${ICON.eye}</button>
      </div>
      <nav class="places glass" data-open="${ui.placesOpen}" aria-label="${esc(t('v3.tour.title'))}">
        <h3><button class="ph" data-act="places" aria-expanded="${ui.placesOpen}" aria-controls="klc-places"><span class="lbl">${esc(t('v3.tour.title'))}</span><span class="cur" data-f="cur">${esc(curName())}</span>${ICON.caret}</button></h3>
        <ul id="klc-places">${tour.stops.map((s, i) => `<li><button data-act="stop" data-id="${s.id}" aria-current="${tour.current === s.id}"><span class="n">${i + 1}</span><span>${esc(stopName(s, I.lang))}<small>${esc(stopName(s, I.lang === 'en' ? 'ja' : 'en'))}</small></span></button></li>`).join('')}</ul>
        <button class="pill auto" data-act="auto" aria-pressed="${tour.playing}">${tour.playing ? ICON.pause : ICON.play}<span>${esc(tour.playing ? t('v3.tour.stopAuto') : t('v3.tour.auto'))}</span></button>
      </nav>
      <div class="dock glass" role="toolbar" aria-label="${esc(t('time.label'))}">
        <div class="seg" role="group" aria-label="${esc(t('time.label'))}">
          ${T.presets.map((p) => `<button data-act="preset" data-id="${p.id}" aria-pressed="${T.preset === p.id}" title="${esc(t('v3.time.' + p.id))} ${fmtH(p.h)}"><span class="dot" style="background:${PRESET_DOT[p.id]}"></span><span class="ja">${esc(t('v3.time.' + p.id))}</span><span class="hm">${fmtH(p.h)}</span></button>`).join('')}
        </div>
        <span class="div"></span>
        <button class="pill" data-act="view" aria-pressed="false" title="V">${ui.view === 'drone' ? ICON.walk : ICON.drone}<span>${esc(ui.view === 'drone' ? t('v3.view.walk') : t('v3.view.drone'))}</span></button>
        <button class="pill shoot" data-act="photo" title="${esc(t('v3.photo.hint'))}">${ICON.camera}<span>${esc(t('v3.photo'))}</span></button>
      </div>
      <div class="help"><span class="desk">${esc(t('v3.help'))}</span><span class="touch">${esc(t('v3.help.touch'))}</span></div>
      <div class="attr">${esc(t('v3.attribution'))} · <a href="licenses/sakuragaoka-station.txt" target="_blank" rel="noopener">${esc(t('v3.license'))}</a></div>
      <div class="note glass" data-f="note" role="status" aria-live="polite"></div>`;
    // keep the engine's quality selector reachable (foundation's element, moved, listeners intact)
    if (qSel) {
      el.querySelector('.tools').prepend(qSel);
      // [v3:fix] the quality selector speaks the UI language too
      qSel.setAttribute('aria-label', t('v3.quality'));
      for (const op of qSel.options) op.textContent = `${t('v3.quality')}: ${t('v3.quality.' + op.value)}`;
    }
    fill();
    syncSound();
  }
  const $ = (f) => el.querySelector(`[data-f="${f}"]`);
  function curName() { const s = tour.stops.find((x) => x.id === tour.current) || tour.stops[0]; return s ? stopName(s, I.lang) : ''; }
  function fill() {
    const t = I.t, s = live?.state || {};
    const c = $('clock'); if (c) c.textContent = T.clock();
    const w = s.weather;
    // [v3:fix] a clear night shows the moon, not the sun
    const icon = w && (w.sky || 'clear') === 'clear' && (T.state?.night ?? T.night ?? 0) > 0.5 ? '☾' : WX[w?.sky] || '';
    // [v3:polish3] a season view (春 / 夏 / 冬) is not today's weather: the chip names the view instead of the live sky and
    // temperature (snow under '☀ 晴れ 16℃ ライブ' contradicted itself); the ライブ tag then belongs to the arrivals only
    const sid = life.season?.id, seasonView = !!sid && sid !== 'autumn';
    const wx = $('wx');
    if (wx) {
      wx.textContent = seasonView ? t('v3.season.view.' + sid) : w ? `${icon} ${t('v3.weather.' + (w.sky || 'clear'))}${w.temp != null ? ' ' + Math.round(w.temp) + '℃' : ''}` : t('v3.loadingLive');
      wx.classList.toggle('seasonview', seasonView); wx.title = seasonView ? t('v3.season.view.hint') : '';
    }
    const n = s.arrivals?.length ?? 0;
    const bo = $('boats'); if (bo) bo.innerHTML = s.status === 'ok' ? esc(t('v3.arrivals.count', { n })).replace(String(n), `<b>${n}</b>`) : '';
    // [v3:fix] old cached data is labelled キャッシュ with its time, never ライブ
    const tagTxt = s.sample ? t('v3.sample') : s.stale ? t('v3.cache') + (s.staleAt ? ' ' + fmtH(((new Date(s.staleAt).getUTCHours() + 9) % 24) + new Date(s.staleAt).getUTCMinutes() / 60) : '') : t('v3.live');
    for (const k of ['tag', 'tag2']) { const tg = $(k); if (tg) { tg.textContent = s.status === 'ok' ? tagTxt : ''; tg.className = 'tag' + (s.sample || s.stale ? '' : ' live'); tg.hidden = s.status !== 'ok'; } }
    const list = $('list');
    if (list) list.innerHTML = n ? s.arrivals.slice(0, 40).map((a) => `<li><span class="t">${esc(a.time || '')}</span><span class="v">${esc(a.vessel)}</span><span class="k">${esc(I.lang === 'en' ? a.typeEn || a.type : a.type || '')}</span>${a.catch ? `<span class="c">${esc(I.lang === 'en' ? a.catchEn || a.catch : a.catch)}${a.kg ? ' · ' + (a.kg >= 1000 ? (a.kg / 1000).toFixed(1) + ' t' : a.kg + ' kg') : ''}${a.estimated ? ' · ' + esc(t('v3.arrivals.est')) : ''}</span>` : ''}</li>`).join('') : `<li><span class="c">${esc(t('v3.arrivals.empty'))}</span></li>`;
  }
  function syncSound() { const b = el.querySelector('[data-act="sound"]'); if (!b) return; const m = !!ctx.audio?.muted; b.setAttribute('aria-pressed', String(m)); b.innerHTML = m ? ICON.muted : ICON.sound; }
  let noteT = 0;
  function note(msg, ms = 2200) { const n = $('note'); if (!n) return; n.textContent = msg; n.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('show'), ms); }

  // ---------------------------------------------------------------- actions
  function setView(v) {
    ui.view = v;
    if (v === 'walk') { if (!tour.walkTo(tour.current)) tour.walkTo('hero'); }
    else tour.flyTo(tour.current || 'hero');
    render();
  }
  // [v3:integrate] tiny-planet overview (core/planet.js): the whole bay as a small turning world
  function togglePlanet() {
    const pl = ctx.planet; if (!pl) return;
    if (pl.active) pl.exit(); else { tour.stop(); pl.enter({ t: ctx.time || 0 }); note(I.t('v3.planet.note'), 3200); }
    render();
  }
  function cyclePreset() { const i = T.presets.findIndex((p) => p.id === T.preset); T.set(T.presets[(i + 1) % T.presets.length].id); render(); }
  // photo mode (./photo.js): always a 16:9 3840x2160 PNG at scale 1
  async function photo(scale = 1, o = {}) {
    if (!ctx.renderer || !ctx.pipeline) { note(I.t('photo.unavailable')); return null; }
    note(I.t('v3.photo.saving'), 4000);
    await new Promise((res) => setTimeout(res, 30));
    const res = await takePhoto(ctx, T, { ...o, scale });
    note(I.t('v3.photo.saved'));
    return res;
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'preset') { T.set(b.dataset.id); render(); }
    else if (act === 'stop') { ui.placesOpen = false; tour.stop();   // [v3:polish2] fold the list once a stop is picked (the stored preference stays)
      if (ui.view === 'walk' && tour.walkTo(b.dataset.id)) { /* walk */ } else { ui.view = 'drone'; tour.flyTo(b.dataset.id); } render(); }
    else if (act === 'auto') { if (tour.playing) tour.stop(); else { ui.view = 'drone'; tour.play(); } render(); }
    else if (act === 'view') setView(ui.view === 'drone' ? 'walk' : 'drone');
    else if (act === 'photo') photo(1);
    else if (act === 'hide') document.body.classList.add('noui');
    else if (act === 'planet') togglePlanet();   // [v3:integrate]
    else if (act === 'sound') { if (ctx.audio) ctx.audio.muted = !ctx.audio.muted; syncSound(); document.getElementById('mute')?.setAttribute('aria-pressed', String(!!ctx.audio?.muted)); }
    else if (act === 'lang') { I.set(I.lang === 'ja' ? 'en' : 'ja'); render(); }
    else if (act === 'season') { life.season?.next(); render(); note(I.t('v3.season') + ' · ' + I.t('v3.season.' + life.season.id)); }   // [v3:integrate]
    else if (act === 'arrivals') { ui.arrivalsOpen = !ui.arrivalsOpen; render(); }
    else if (act === 'places') { ui.placesOpen = !ui.placesOpen; store.set('klc.places', ui.placesOpen ? '1' : '0'); render(); }
    b.blur?.();
  });
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (!document.body.classList.contains('playing') && !o.force) return;
    if (e.code === 'KeyT') cyclePreset();
    else if (e.code === 'KeyP') photo(1);
    else if (e.code === 'KeyG') { if (tour.playing) tour.stop(); else tour.play(); render(); }
    else if (e.code === 'KeyV') setView(ui.view === 'drone' ? 'walk' : 'drone');
    else if (e.code === 'KeyO') togglePlanet();   // [v3:integrate]
    else if (e.code === 'KeyK' && life.season) { life.season.next(); render(); note(I.t('v3.season') + ' · ' + I.t('v3.season.' + life.season.id)); }   // [v3:integrate]
    else if (e.code === 'KeyM') setTimeout(syncSound, 0);
    else if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown'].includes(e.code) && tour.playing) { tour.stop(); render(); }
    else if (/^Digit[1-9]$/.test(e.code)) { const s = tour.stops[Number(e.code.slice(5)) - 1]; if (s) { e.stopImmediatePropagation?.(); tour.stop(); if (!(ui.view === 'walk' && tour.walkTo(s.id))) { ui.view = 'drone'; tour.flyTo(s.id); } render(); } }   // [v3:fix] number keys follow the view, like the places panel
  }, true);
  T.onChange((s, why) => { if (why === 'end' || why === 'instant' || why === 'hours') render(); });
  tour.onChange(() => { const cur = el.querySelectorAll('[data-act="stop"]'); cur.forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === tour.current))); const cn = $('cur'); if (cn) cn.textContent = curName(); const a = el.querySelector('[data-act="auto"]'); if (a && a.getAttribute('aria-pressed') !== String(tour.playing)) render(); });
  live?.onChange?.(() => fill());

  // visibility: after "Enter the town", or forced (?ui=1)
  const show = () => { el.hidden = !(o.force || document.body.classList.contains('playing')); };
  new MutationObserver(show).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  render(); show();
  let acc = 0;
  return { el, i18n: I, photo, render, update(dt) { acc += dt; if (acc > 0.5) { acc = 0; const c = $('clock'); if (c) c.textContent = T.clock(); } } };
}
