// [v3:life] The minimal UI (V3-SPEC section 4, life): wordmark 気仙沼リビングシティ + a live chip (time, weather,
// arrivals), time presets, tour stops, drone/walk toggle, photo mode (4K PNG), hide-UI (H), JA/EN, attribution.
// Every string comes from data/i18n.json (the 「JPYCで買えるお店」 sheet's own are in data/ui-jpyc-i18n.json). Mounted by the life module; visible once the player enters the town
// (body.playing), or immediately with ?ui=1 (screenshots of the UI). A movement key or a press on the canvas ends a flight to a place at once
// (tour.skip through ui/veil.js: a quarter-second glide when near, a dip to the sky's colour when far); the touch pad does the same for a touch.
//
//   const hud = mountHud(ctx, life, { force })   ->  { el, update(dt), photo(scale) }
import { CSS } from './style.js';
import { createI18n, STRINGS } from './i18n.js';
import { takePhoto } from './photo.js';
import TOUCH from '../../../data/ui-touch-i18n.json';   // [integrate] the phone HUD's few strings (☰ menu, sheets) live with the pad's, not in data/i18n.json
import { mountContrib } from './contrib.js';
import { contribEnabled } from './contrib-lib.js';   // [contrib] 「修正を報告」: the report sheet (button in the toolbar / the ☰ menu, key B)
import { createVeil, interruptFlight, skyColor } from './veil.js';   // [ui-a2] a key or a press ends a flight (tour.skip); the veil hides the jump when it is far
import { mountJpycStore, ICON as JPYC_ICON } from './jpyc-store.js';   // [jpyc] 「JPYCで買えるお店」: the shop list and each shop's products on JPYC EC, a link out to buy (docs/jpyc/README.md)
import PLAY from '../../../data/play-i18n.json';   // [play] 「みんなであそぶ」: the menu label only. The sheet lives in play/multi.
import { nextView, viewId, viewLabelKey } from '../play/avatar/view.js';

const ICON = {
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',   // [mobile] the 地名ラベル toggle
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
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 7h15M4.5 12h15M4.5 17h15"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11"/></svg>',
  caret: '<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:14px;height:14px"><path d="M6 9l6 6 6-6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="2.2"/><circle cx="16" cy="9" r="1.8"/><path d="M4.5 18.5c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6"/><path d="M13.2 15.2c.7-.3 1.6-.5 2.6-.5 1.7 0 3.1.9 3.7 2.8"/></svg>',
};
const WX = { clear: '☀', partly: '⛅', cloudy: '☁', rain: '☂', snow: '❄' };
const PRESET_DOT = { asa: '#ffd6ae', hiru: '#8fbde9', yugata: '#ffc996', yuyake: '#ff8f5c', yoru: '#2a3a70' };
const stopName = (s, lang) => STRINGS[lang]?.['v3.stop.' + s.id] ?? (lang === 'en' ? s.en : s.ja);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pt = (lang, key) => PLAY[lang]?.[key] ?? PLAY.ja?.[key] ?? key;
const fmtH = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
// [ui-a2] HH:MM in Japan time for a time stamp (ms, or an ISO string): '' when it is not a time. UTC arithmetic only, so the machine's own zone and clock play no part (a board that says キャッシュ 12:04 says it
// the same in a shot frame and on a phone in another zone).
const jstHM = (v) => { const ms = typeof v === 'number' ? v : Date.parse(v); if (!Number.isFinite(ms)) return ''; const d = new Date(ms + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
// [hud:sync] The HUD syncs in place after every click, so a write that changes nothing must cost nothing: each of these touches the DOM only when the value differs
// (a same-value setAttribute / textContent still invalidates style and replaces the text node).
const setText = (n, s) => { if (n && n.textContent !== s) n.textContent = s; };
const setAttr = (n, k, v) => { const s = String(v); if (n && n.getAttribute(k) !== s) n.setAttribute(k, s); };
const setData = (n, k, v) => { if (n && n.dataset[k] !== v) n.dataset[k] = v; };
const setHidden = (n, h) => { if (n && n.hidden !== h) n.hidden = h; };
// [ui-a2] The keys that take the camera back from a flight: the player's movement keys (WASD, QE, the arrows), Space and Escape. The digits and R stay instant picks (they retarget the flight);
// the other keys (time, season, photo ...) do not interrupt a flight.
const FLY_BREAK = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Escape']);

export function mountHud(ctx, life, o = {}) {
  if (typeof document === 'undefined') return null;
  const I = createI18n();
  const T = life.time, tour = life.tour, live = life.live;
  if (!document.getElementById('klc-ui-css')) { const st = document.createElement('style'); st.id = 'klc-ui-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-ui'; el.setAttribute('lang', I.lang);
  document.body.appendChild(el); document.body.classList.add('klc-ui');
  // [ui-a2] ctx.veil: the dip to the sky's colour that hides a camera jump (ui/veil.js). tour.skip(ctx.veil.cut) uses it when a flight is ended far from its destination; it builds nothing until the first cut.
  if (ctx && !ctx.veil) { try { ctx.veil = createVeil({ color: () => skyColor(ctx) }); } catch (e) { console.warn('[veil]', e); } }
  // hidden UI (H / the eye button): a faint eye brings it back on touch screens (never part of a photo: the canvas is)
  const restore = document.createElement('button'); restore.id = 'klc-ui-restore'; restore.setAttribute('aria-label', I.t('v3.hide'));
  restore.innerHTML = ICON.eye; restore.addEventListener('click', () => document.body.classList.remove('noui'));
  document.body.appendChild(restore);
  // the places panel is collapsed by default on desktop (a clean frame; one click opens it); remembered per viewer
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  const qp = new URLSearchParams(location.search);
  // [integrate] portrait phone with the pad (body.klc-pad, touchpad-style.js): the top bar's ☰ menu holds language, season, sound, planet
  // and hide; the places strip and the time dock fold behind one button each (a bottom sheet). `menu` / `sheet` ('places' | 'time') are
  // mirrored on #klc-ui as data-menu / data-sheet; on desktop, landscape and without the pad none of it shows.
  const tt = (k) => TOUCH[I.lang]?.[k] ?? TOUCH.ja[k] ?? k;
  const personQ = qp.get('person');
  const ui = { menu: false, credits: false, sheet: '', arrivalsOpen: qp.get('arrivals') === '1', view: 'drone', person: (personQ === 'first' || personQ === '1') ? 'first' : 'third', placesOpen: qp.has('places') ? qp.get('places') === '1' : store.get('klc.places') === '1' };
  const playLabel = (key) => (PLAY[I.lang === 'en' ? 'en' : 'ja'] || PLAY.ja)[key] || PLAY.ja[key] || key;
  function viewButtonHTML() {
    const id = nextView(viewId(ui.view, ui.person));
    const icon = id === 'fly' ? ICON.drone : ICON.walk;
    return icon + `<span>${esc(playLabel(viewLabelKey(id)))}</span>`;
  }

  // [contrib] the report sheet; mounted before the keyboard handler below so its capture listener runs first (it owns the keys while it is open)
  // [contrib] hidden in production until launch (ui/contrib-lib.js contribEnabled: ?contrib=1 remembered on this device, dev hosts, CONTRIB_DEFAULT_ON)
  const contribOn = (() => {
    try {
      const st = typeof localStorage !== 'undefined' ? localStorage : null;
      const g = contribEnabled({ search: location.search, hostname: location.hostname, stored: st?.getItem('klc.contrib') ?? null });
      if (g.persist) st?.setItem('klc.contrib', g.persist);
      return g.on;
    } catch { return false; }
  })();
  const contrib = contribOn || o.contrib ? mountContrib(ctx, life, { i18n: I, force: o.force, note: (m) => note(m) }) : null;
  const ct = (k) => contrib?.t?.(k) ?? k;
  // [jpyc] the 「JPYCで買えるお店」 sheet. Mounted before the keyboard handler below, so its capture listener runs first (it owns the keys while it is open). It publishes ctx.services.jpyc whatever happens;
  // under the flyer's ?src=chirashi (kids), ?jpyc=off, or with nothing this visitor may see it is not enabled: no menu item, no panel. A fault in it never stops the HUD.
  let jpyc = null;
  try { jpyc = mountJpycStore(ctx, life, { i18n: I, force: o.force, note: (m) => note(m) }); } catch (e) { console.warn('[jpyc]', e); }
  const jpycOn = !!jpyc?.enabled, jt = (k, v) => jpyc?.t?.(k, v) ?? k;

  const qSel = document.getElementById('quality');   // [v3:integrate] kept across re-renders (innerHTML would destroy it)
  // [hud:sync] render() builds the HUD: the first mount, a language change, and a change in the number of tour stops (explore adds its places after the HUD is
  // mounted). Everything else goes through syncState(), which patches the nodes that exist, so a clicked button is the same element after its click
  // (its CSS transition runs, its focus stays, a press that is still down is not lost).
  let stopsDrawn = -1;   // how many tour stops render() put in the places list (-1: nothing drawn yet)
  const shown = {};      // what syncState() last wrote into the nodes whose content is more than an attribute (view, auto, season, sound, boats, arrivals); render() clears it
  function render() {
    const t = I.t;
    // [craft] a key hint belongs to the tooltip, never to the label a touch screen shows, and its brackets follow the language (full-width next to Japanese)
    const withKey = (s, k) => (I.lang === 'ja' ? `${s}（${k}）` : `${s} (${k})`);
    if (qSel?.parentNode) qSel.remove();
    el.setAttribute('lang', I.lang);
    stopsDrawn = tour.stops.length;
    const playOn = qp.get('play') !== '0' && qp.get('multi') !== '0';
    el.innerHTML = `
      <button class="mbtn round glass" data-act="menu" aria-expanded="${ui.menu}" aria-controls="klc-menu" aria-label="${esc(tt('touch.hud.menu'))}">${ICON.menu}</button>
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
          <p class="prov" data-f="prov" hidden></p>
          <ol data-f="list"></ol>
        </section>
      </div>
      <div class="tools" id="klc-menu">
        <div class="mhead"><b>${esc(t('v3.wordmark'))}</b><small>${esc(t('v3.wordmarkSub'))}</small></div>
        ${jpycOn ? `<button class="round glass jpyc" data-act="jpyc" aria-haspopup="dialog" aria-label="${esc(jt('jpyc.menu'))}" title="${esc(jt('jpyc.menu.hint'))}">${JPYC_ICON.bag}<span class="lbl">${esc(jt('jpyc.menu'))}</span></button>` : ''}
        <button class="round txt glass" data-act="lang" aria-label="${esc(t('lang.toggle'))}">${esc(t('v3.lang'))}<span class="lbl">${esc(t('lang.toggle'))}</span></button>
        ${life.season ? `<button class="round txt glass season" data-act="season" aria-label="${esc(t('v3.season'))}: ${esc(t('v3.season.' + life.season.id))}" title="${esc(withKey(t('v3.season'), 'K'))}">${esc(t('v3.season.short.' + life.season.id))}<span class="lbl">${esc(t('v3.season'))} · ${esc(t('v3.season.' + life.season.id))}</span></button>` : ''}
        <button class="round glass" data-act="sound" aria-pressed="false" aria-label="${esc(t('v3.sound'))}" title="${esc(withKey(t('v3.sound'), 'M'))}">${ICON.sound}<span class="lbl">${esc(t('v3.sound'))}</span></button>
        <button class="round glass" data-act="planet" aria-pressed="${!!ctx.planet?.active}" aria-label="${esc(t('v3.planet'))}" title="${esc(withKey(t('v3.planet'), 'O'))}">${ICON.planet}<span class="lbl">${esc(t('v3.planet'))}</span></button>
        <button class="round glass cbtn" data-act="credits" aria-label="${esc(tt('touch.hud.credits'))}">${ICON.info}<span class="lbl">${esc(tt('touch.hud.credits'))}</span></button>
        <button class="round glass cbtn" data-act="labels" aria-pressed="${!!ctx.services?.explore?.ambientLabels}" aria-label="${esc(tt('touch.hud.labels'))}">${ICON.tag}<span class="lbl">${esc(tt('touch.hud.labels'))}</span></button>
        <button class="round glass" data-act="hide" aria-label="${esc(t('v3.hide'))}" title="${esc(withKey(t('v3.hide'), 'H'))}">${ICON.eye}<span class="lbl">${esc(t('v3.hide'))}</span></button>
        ${playOn ? `<button class="round glass" data-act="multi" aria-haspopup="dialog" aria-label="${esc(pt(I.lang, 'play.multi.menu'))}">${ICON.people}<span class="lbl">${esc(pt(I.lang, 'play.multi.menu'))}</span></button>` : ''}
        ${contrib ? `<button class="round glass rep" data-act="report" aria-haspopup="dialog" aria-label="${esc(ct('contrib.open'))}" title="${esc(ct('contrib.open.hint'))}">${ICON.flag}<span class="lbl">${esc(ct('contrib.open'))}</span></button>` : ''}
      </div>
      <nav class="places glass" data-open="${ui.placesOpen}" aria-label="${esc(t('v3.tour.title'))}">
        <h3><button class="ph" data-act="places" aria-expanded="${ui.placesOpen}" aria-controls="klc-places"><span class="lbl">${esc(t('v3.tour.title'))}</span><span class="cur" data-f="cur">${esc(curName())}</span>${ICON.caret}</button></h3>
        <ul id="klc-places">${tour.stops.map((s, i) => `<li><button data-act="stop" data-id="${s.id}" aria-current="${tour.current === s.id}"><span class="n">${i + 1}</span><span>${esc(stopName(s, I.lang))}<small>${esc(stopName(s, I.lang === 'en' ? 'ja' : 'en'))}</small></span></button></li>`).join('')}</ul>
        <button class="pill auto" data-act="auto" aria-pressed="${tour.playing}">${tour.playing ? ICON.pause : ICON.play}<span>${esc(tour.playing ? t('v3.tour.stopAuto') : t('v3.tour.auto'))}</span></button>
      </nav>
      <div class="dock glass" role="toolbar" aria-label="${esc(t('time.label'))}">
        <div class="livebar">
          <span class="dclock" data-f="dclock">${esc(T.clock())}</span>
          <span class="livechip" data-f="livechip"${T.live && !T.pinned ? '' : ' hidden'}><i aria-hidden="true"></i><b>${esc(t('v3.live.mark'))}</b></span>
          <button type="button" class="wxbtn" data-act="wxsrc" data-f="dwx"></button>
          <button type="button" class="pill back" data-act="unlive"${T.live && !T.pinned ? ' hidden' : ''}>${esc(t('v3.live.back'))}</button>
        </div>
        <p class="wxpop glass" data-f="wxpop" hidden></p>
        <div class="seg" role="group" aria-label="${esc(t('time.label'))}">
          ${T.presets.map((p) => `<button data-act="preset" data-id="${p.id}" aria-pressed="${T.preset === p.id}" title="${esc(t('v3.time.' + p.id))} ${fmtH(p.h)}"><span class="dot" style="background:${PRESET_DOT[p.id]}"></span><span class="ja">${esc(t('v3.time.' + p.id))}</span><span class="hm">${fmtH(p.h)}</span></button>`).join('')}
        </div>
        <span class="div"></span>
        <button class="pill" data-act="view" aria-pressed="false" title="V">${viewButtonHTML()}</button>
        <button class="pill shoot" data-act="photo" title="${esc(t('v3.photo.hint'))}">${ICON.camera}<span>${esc(t('v3.photo'))}</span></button>
      </div>
      <div class="pbar">
        <button class="glass" data-act="sheet" data-sheet="places" aria-expanded="${ui.sheet === 'places'}" aria-label="${esc(t('v3.tour.title'))}">${ICON.pin}<span data-f="pcur">${esc(curName())}</span>${ICON.caret}</button>
        <button class="glass" data-act="sheet" data-sheet="time" aria-expanded="${ui.sheet === 'time'}" aria-label="${esc(t('time.label'))}">${ICON.clock}<span data-f="ptime">${esc(timeLabel())}</span>${ICON.caret}</button>
      </div>
      <div class="help"><span class="desk">${esc(t('v3.help'))}</span><span class="touch">${esc(t('v3.help.touch'))}</span></div>
      <div class="attr">${esc(t('v3.attribution'))}<span class="lic"> · <a href="licenses/sakuragaoka-station.txt" target="_blank" rel="noopener">${esc(t('v3.license'))}</a></span></div>
      <section class="credits glass" ${ui.credits ? '' : 'hidden'} role="dialog" aria-label="${esc(tt('touch.hud.credits'))}">
        <div class="ch"><h3>${esc(tt('touch.hud.credits'))}</h3><button class="cx" data-act="credits-close" aria-label="${esc(tt('touch.hud.close'))}">${ICON.close}</button></div>
        <p>${esc(t('v3.credits.map'))}</p>
        <p>${esc(t('v3.credits.live'))}</p>
        <p data-f="aiscred" hidden></p>
        <p>${esc(t('v3.credits.engine'))}</p>
        ${jpycOn ? `<p class="jpyc-credit">${esc(jt('jpyc.credit'))}</p>` : ''}
        <a class="clink" href="licenses/sakuragaoka-station.txt" target="_blank" rel="noopener">${esc(t('v3.credits.licence'))}</a>
      </section>
      <div class="note glass" data-f="note" role="status" aria-live="polite"></div>`;
    // [ui-b2:7] a rebuild (the language button) replaces the open menu / popover with new nodes, and a new node plays its @starting-style entry again;
    // ui/style.js switches the HUD's transitions off for the two frames in which that would start
    if (ui.menu || ui.sheet || ui.credits || ui.arrivalsOpen) { el.dataset.still = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { delete el.dataset.still; })); }
    // keep the engine's quality selector reachable (foundation's element, moved, listeners intact)
    if (qSel) {
      el.querySelector('.tools').prepend(qSel);
      // [v3:fix] the quality selector speaks the UI language too
      qSel.setAttribute('aria-label', t('v3.quality'));
      for (const op of qSel.options) op.textContent = I.lang === 'ja' ? `${t('v3.quality')}：${t('v3.quality.' + op.value)}` : `${t('v3.quality')}: ${t('v3.quality.' + op.value)}`;
    }
    for (const k of Object.keys(shown)) delete shown[k];   // new nodes: none of what was written into the old ones is there
    syncState();   // everything that depends on the state (the clock, the live data, the pressed presets, the sheets ...) is written by the one function that also patches it later
    el.querySelector('.places ul')?.addEventListener('scroll', syncFade, { passive: true });
    syncFade();
  }
  /** [hud:sync] Patch everything render() derives from the state (the UI flags, the time preset, the tour, the season, the planet, the sound, the labels, the
   *  live data) into the nodes that exist: attributes and text only, and only where the value changed. render() is for the first mount, a language
   *  change and a change in the number of stops; every click, key and tour / time event ends here. */
  function syncState() {
    if (tour.stops.length !== stopsDrawn) { render(); return; }   // explore adds its 46 places after the HUD mounted (tour.add emits): the list is built from tour.stops, so rebuild it, once
    const t = I.t;
    for (const b of el.querySelectorAll('[data-act="preset"]')) setAttr(b, 'aria-pressed', T.preset === b.dataset.id);
    // the places list (desktop panel / phone sheet) and the arrivals panel
    setData(el.querySelector('.places'), 'open', String(ui.placesOpen));
    setAttr(el.querySelector('[data-act="places"]'), 'aria-expanded', ui.placesOpen);
    setHidden(el.querySelector('.arrivals'), !ui.arrivalsOpen);
    setAttr(el.querySelector('[data-act="arrivals"]'), 'aria-expanded', ui.arrivalsOpen);
    // the stop the camera is at, and the tour button
    for (const b of el.querySelectorAll('[data-act="stop"]')) setAttr(b, 'aria-current', b.dataset.id === tour.current);
    setText($('cur'), curName()); setText($('pcur'), curName());
    const au = el.querySelector('[data-act="auto"]');
    if (au) { setAttr(au, 'aria-pressed', tour.playing); paint('auto', tour.playing, () => { au.innerHTML = (tour.playing ? ICON.pause : ICON.play) + `<span>${esc(tour.playing ? t('v3.tour.stopAuto') : t('v3.tour.auto'))}</span>`; }); }
    // the 歩く / 飛ぶ button names the view it switches to
    const vp = el.querySelector('[data-act="view"]');
    if (vp) paint('view', ui.view + '/' + ui.person, () => { vp.innerHTML = viewButtonHTML(); });
    // the ☰ menu's toggles
    setAttr(el.querySelector('[data-act="planet"]'), 'aria-pressed', !!ctx.planet?.active);
    const sid = life.season?.id, sb = el.querySelector('.season');
    if (sid && sb) paint('season', sid, () => {   // the label's first child is the short name (a text node); the rest of the button is language, not state
      const short = t('v3.season.short.' + sid), tn = [...sb.childNodes].find((n) => n.nodeType === 3);
      if (tn) tn.nodeValue = short; else sb.insertBefore(document.createTextNode(short), sb.firstChild);
      setText(sb.querySelector('.lbl'), `${t('v3.season')} · ${t('v3.season.' + sid)}`);
      setAttr(sb, 'aria-label', `${t('v3.season')}: ${t('v3.season.' + sid)}`);
    });
    syncLabels(); syncSound();
    fill(); syncSheets();
  }
  /** Write `fn`'s result into the DOM only when `value` is not what was written last (see `shown`). */
  function paint(key, value, fn) { if (shown[key] === value) return; shown[key] = value; fn(); }
  /** [integrate] The ☰ menu and the sheets are shown by CSS from these attributes (only on a portrait phone with the pad). Everything the menu / sheet / credits
   *  state decides is written here, in place and only where it changed: the attributes on #klc-ui, the aria-expanded of the buttons that open them, the credits
   *  sheet's `hidden`, the minimap and the pad. */
  function syncSheets() {
    const m = ui.menu ? '1' : '0', c = ui.credits ? '1' : '0';
    if (el.dataset.menu !== m) el.dataset.menu = m;
    if (el.dataset.sheet !== ui.sheet) el.dataset.sheet = ui.sheet;
    if (el.dataset.credits !== c) el.dataset.credits = c;
    setAttr(el.querySelector('[data-act="menu"]'), 'aria-expanded', ui.menu);
    for (const b of el.querySelectorAll('[data-act="sheet"]')) setAttr(b, 'aria-expanded', b.dataset.sheet === ui.sheet);
    setHidden(el.querySelector('.credits'), !ui.credits);
    // the minimap (in #klc-x, a sibling) steps aside while the menu, the arrivals panel or the credits are open, as it does for search and the map
    document.body.classList.toggle('klc-hud-open', !!(ui.menu || ui.arrivalsOpen || ui.credits));
    try { ctx.pad?.suppress?.('hud-sheet', !!ui.sheet || ui.menu || ui.arrivalsOpen || ui.credits); } catch (e) { /* no pad */ }   // a sheet is modal: the thumbs' controls step aside
  }
  /** [integrate:fix] the places strip (a horizontal scroller on a portrait phone) fades the edge that has more stops: data-fade = r | l | lr | '' */
  function syncFade() {
    const nav = el.querySelector('.places'), ul = nav?.querySelector('ul'); if (!ul) return;
    const more = ul.scrollWidth - ul.clientWidth > 4, l = more && ul.scrollLeft > 4, r = more && ul.scrollLeft < ul.scrollWidth - ul.clientWidth - 4;
    nav.dataset.fade = (l ? 'l' : '') + (r ? 'r' : '');
  }
  function setMenu(on) { ui.menu = !!on; if (on) { ui.sheet = ''; ui.credits = false; syncLabels(); } syncSheets(); }
  /** [mobile] the explore module publishes ambientLabels after the HUD's first render (?labels=1 or a remembered 'on'): read it when the ☰ menu opens (and on every sync) */
  function syncLabels() { const b = el.querySelector('[data-act="labels"]'), ex = ctx.services?.explore; if (b && ex && 'ambientLabels' in ex && b.getAttribute('aria-pressed') !== String(!!ex.ambientLabels)) b.setAttribute('aria-pressed', String(!!ex.ambientLabels)); }
  function setSheet(name) {
    ui.sheet = ui.sheet === name ? '' : name; if (ui.sheet) { ui.menu = false; ui.credits = false; }
    syncSheets();
    syncFade(); requestAnimationFrame(syncFade);   // the strip has no width while its sheet is closed: measure once it is shown
  }
  const $ = (f) => el.querySelector(`[data-f="${f}"]`);
  /** 夕方 16:30 (the time sheet's button). */
  function timeLabel() { const p = T.presets.find((x) => x.id === T.preset); return p ? `${I.t('v3.time.' + p.id)} ${T.clock()}` : T.clock(); }
  function curName() { const s = tour.stops.find((x) => x.id === tour.current) || tour.stops[0]; return s ? stopName(s, I.lang) : ''; }
  function fill() {
    const t = I.t, s = live?.state || {}, w = s.weather;
    setText($('clock'), T.clock());
    setText($('dclock'), T.clock());
    setText($('ptime'), timeLabel());
    const liveOn = !!(T.live && !T.pinned);
    const chip = $('livechip');
    if (chip) { setHidden(chip, !liveOn); setText(chip.querySelector('b'), t('v3.live.mark')); }
    const back = el.querySelector('[data-act="unlive"]');
    if (back) { setHidden(back, liveOn); setText(back, t('v3.live.back')); }
    const skyId = T.weather?.sky || w?.sky || null;
    const dockIcon = !skyId ? '' : (skyId === 'clear' && (T.night ?? 0) > 0.5 ? '☾' : (WX[skyId] || ''));
    const dockTemp = w?.temp != null && Number.isFinite(+w.temp) ? `${(+w.temp).toFixed(1)}℃` : '';
    setText($('dwx'), [dockIcon, dockTemp].filter(Boolean).join(' '));
    const pop = $('wxpop'); if (pop) setText(pop, t('v3.weather.src'));
    // [ui-a2] What the feed is doing: no answer yet ('loading'), an answer ('ok'), or none ('error'). A refresh that fails after an answer leaves that answer in the state (live.js), so it stays on the
    // board, labelled キャッシュ with the time of the answer: `kept`. A feed that never answered has nothing to show and says so. `shown`: the board has an answer to show.
    const failed = s.status === 'error', kept = failed && s.origin != null, shown = s.status === 'ok' || kept;
    // [v3:fix] a clear night shows the moon, not the sun
    const icon = w && (w.sky || 'clear') === 'clear' && (T.state?.night ?? T.night ?? 0) > 0.5 ? '☾' : WX[w?.sky] || '';
    // [v3:polish3] a season view (春 / 夏 / 冬) is not today's weather: the chip names the view instead of the live sky and
    // temperature (snow under '☀ 晴れ 16℃ ライブ' contradicted itself); the ライブ tag then belongs to the arrivals only
    const sid = life.season?.id, seasonView = !!sid && sid !== 'autumn';
    const wx = $('wx');
    if (wx) {
      // [ui-a2] no weather block is not "loading" (the page said 情報を取得中… for as long as it lived): an answer without weather says so, a feed that failed says that, only a first fetch still waiting is loading
      setText(wx, seasonView ? t('v3.season.view.' + sid) : w ? `${icon} ${t('v3.weather.' + (w.sky || 'clear'))}${w.temp != null ? ' ' + Math.round(w.temp) + '℃' : ''}` : shown ? t('v3.weather.none') : failed ? t('v3.feed.error') : t('v3.loadingLive'));
      wx.classList.toggle('seasonview', seasonView); const tip = seasonView ? t('v3.season.view.hint') : ''; if (wx.title !== tip) { if (tip) wx.title = tip; else wx.removeAttribute('title'); }
    }
    const n = s.arrivals?.length ?? 0;
    const bo = $('boats'); if (bo) { const html = shown ? esc(t('v3.arrivals.count', { n })).replace(String(n), `<b>${n}</b>`) : ''; paint('boats', html, () => { bo.innerHTML = html; }); }
    // [v3:fix] old cached data is labelled キャッシュ with its time, never ライブ
    // [ui-a2] ... and so are the old rows after a failed refresh (they used to stay on the board with no tag at all): the time of the last answer, in Japan time; the panel's header names the failure
    const at = s.stale ? s.staleAt : kept ? s.updated : null, hm = jstHM(at);
    const tagTxt = s.sample ? t('v3.sample') : s.stale || kept ? t('v3.cache') + (hm ? ' ' + hm : '') : t('v3.live');
    for (const k of ['tag', 'tag2']) {
      const tg = $(k); if (!tg) continue;
      const off = !shown, cls = 'tag' + (s.sample || s.stale || kept ? '' : ' live'), txt = k === 'tag2' && kept && !s.sample ? `${t('v3.feed.error')} · ${tagTxt}` : tagTxt;
      setText(tg, off ? '' : txt); if (tg.className !== cls) tg.className = cls; setHidden(tg, off);
    }
    const prov = $('prov');
    if (prov) { setHidden(prov, !n); setText(prov, n ? t('v3.arrivals.provenance') : ''); }
    const ais = s.ais && s.ais.coverage === 'live' ? s.ais : null;
    const cred = $('aiscred');
    if (cred) {
      const on = !!(ais && ais.attribution?.length);
      setHidden(cred, !on);
      setText(cred, on ? t('v3.credits.ais', { src: ais.attribution.join(' · ') }) : '');
    }
    const list = $('list');
    if (list) {
      const future = !!(s.portDate && T.date && s.portDate > T.date);
      const due = (a) => {
        if (future) return t('v3.arrivals.due');
        const h = a.h != null && Number.isFinite(+a.h) ? +a.h : etaHoursOf(a.time);
        return h != null && T.hours + 1e-4 >= h ? t('v3.arrivals.in') : t('v3.arrivals.due');
      };
      const html = n ? s.arrivals.slice(0, 40).map((a) => `<li><span class="t">${esc(a.time || '')}<small class="st">${esc(due(a))}</small></span><span class="v">${esc(a.vessel)}</span><span class="k">${esc(I.lang === 'en' ? a.typeEn || a.type : a.type || '')}</span>${a.catch ? `<span class="c">${esc(I.lang === 'en' ? a.catchEn || a.catch : a.catch)}${a.kg ? ' · ' + (a.kg >= 1000 ? (a.kg / 1000).toFixed(1) + ' t' : a.kg + ' kg') : ''}${a.estimated ? ' · ' + esc(t('v3.arrivals.est')) : ''}</span>` : ''}</li>`).join('') : `<li><span class="c">${esc(t(failed && !kept ? 'v3.arrivals.error' : 'v3.arrivals.empty'))}</span></li>`;
      paint('list', html, () => { list.innerHTML = html; });   // (the rows are rebuilt only when the data changed: a click no longer replaces them)
    }
  }
  function etaHoursOf(time) {
    const m = String(time || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] + +m[2] / 60 : null;
  }
  function syncSound() { const b = el.querySelector('[data-act="sound"]'); if (!b) return; const m = !!ctx.audio?.muted; paint('sound', m, () => { b.setAttribute('aria-pressed', String(m)); b.innerHTML = (m ? ICON.muted : ICON.sound) + `<span class="lbl">${esc(I.t('v3.sound'))}</span>`; }); }
  let noteT = 0;
  function note(msg, ms = 2200) { const n = $('note'); if (!n) return; n.textContent = msg; n.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('show'), ms); }

  // ---------------------------------------------------------------- actions
  function noteMode(id) {
    const pl = ctx.playerObj;
    if (id === 'fly') ui.view = 'drone';
    else {
      ui.view = 'walk';
      ui.person = id === 'walk1' ? 'first' : 'third';
      if (pl) pl.person = ui.person;
    }
    syncState();
  }
  function applyPlayView(id, o = {}) {
    const pl = ctx.playerObj;
    const playing = typeof document !== 'undefined' && document.body.classList.contains('playing');
    const av = ctx.services?.play?.avatar;
    if (!o.fromGull && playing) {
      try { if (id === 'walk3') av?.adoptBoom?.(); else av?.armHandoff?.(); } catch (e) { /* */ }
    }
    if (id === 'fly') {
      ui.view = 'drone';
      if (o.fromGull) { /* the gull already became the drone, in place */ }
      else if (playing && pl && !pl.fly && !pl.gull) {
        pl.fly = true; pl.vy = 0; pl.onGround = false;
        // [integration] take off where you stand and rise to a drone's height (~28 m), so 飛ぶ still gives the view over the bay
        try { const g = ctx.physics?.groundHeight?.(pl.pos.x, pl.pos.z, pl.pos.y); if (Number.isFinite(g)) pl.liftTo = g + 28; } catch (e) { /* */ }
      }
      else tour.flyTo(tour.current || 'hero');
    } else {
      const person = id === 'walk1' ? 'first' : 'third';
      const wasWalk = ui.view === 'walk' && !pl?.gull;
      ui.view = 'walk';
      ui.person = person;
      if (pl) { pl.person = person; pl.fly = false; }
      if (!(playing && wasWalk) && !o.fromGull) { if (!tour.walkTo(tour.current)) tour.walkTo('hero'); }
    }
    syncState();
  }
  function cyclePlayView() {
    const next = nextView(viewId(ui.view, ui.person));
    const gull = ctx.services?.play?.gull;
    const was = !!gull?.active;
    if (was) { try { gull.leave(next === 'fly' ? 'drone' : 'walk'); } catch (e) { /* */ } }
    applyPlayView(next, { fromGull: was });
  }
  // [v3:integrate] tiny-planet overview (core/planet.js): the whole bay as a small turning world
  function togglePlanet() {
    const pl = ctx.planet; if (!pl) return;
    let entered = false;
    if (pl.active) pl.exit(); else { tour.stop(); pl.enter({ t: ctx.time || 0 }); entered = true; }
    syncState();
    if (entered) note(I.t('v3.planet.note'), 3200);   // [hud:sync] after the sync: the hint used to be written and then wiped by render() (it never showed); nothing replaces the note node now
  }
  function cyclePreset() { const i = T.presets.findIndex((p) => p.id === T.preset); T.set(T.presets[(i + 1) % T.presets.length].id); syncState(); }
  // photo mode (./photo.js): a desktop saves a 16:9 3840x2160 PNG at scale 1; a phone shoots 1920 px on the long side at the screen's aspect and shows a card whose button opens the share sheet.
  // [ui-c2] photo.js says what it is doing through `note` and these two strings: 撮影中… before the render, and 保存しました only AFTER the share sheet (or the download) has resolved, never before.
  async function photo(scale = 1, o = {}) {
    if (!ctx.renderer || !ctx.pipeline) { note(I.t('photo.unavailable')); return null; }
    try { return await takePhoto(ctx, T, { ...o, scale, lang: I.lang, note, text: { saving: I.t('v3.photo.saving'), saved: I.t('v3.photo.saved') } }); }
    catch (e) { console.warn('photo', e); note(I.t('photo.unavailable')); return null; }   // (a failed shot on a phone: the card says so too; the click handler never sees a rejection)
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act;
    // [hud:sync] blur only after a pointer click (a mouse click or a tap has detail >= 1): the game's keys must not land on the button that was just pressed. A keyboard
    // activation (Enter / Space: detail 0) keeps the focus where Tab left it, and the button is still there to hold it (only a language change rebuilds the HUD).
    const blur = () => { if (e.detail > 0) b.blur?.(); };
    if (act === 'menu') { setMenu(!ui.menu); blur(); return; }
    if (act === 'sheet') { setSheet(b.dataset.sheet); blur(); return; }
    if (act === 'credits') { ui.menu = false; ui.sheet = ''; ui.credits = true; syncState(); blur(); return; }   // [integrate:fix] the ⓘ in the ☰ menu: a 44 px way to the credits and the licence
    if (act === 'credits-close') { ui.credits = false; syncState(); blur(); return; }
    if (act === 'unlive') { T.followLive?.(); syncState(); }
    else if (act === 'wxsrc') { const p = $('wxpop'); if (p) setHidden(p, !p.hidden); }
    else if (act === 'preset') { T.set(b.dataset.id); syncState(); }
    else if (act === 'stop') { ui.placesOpen = false; ui.sheet = ''; tour.stop();   // [v3:polish2] fold the list once a stop is picked (the stored preference stays)
      if (ui.view === 'walk' && tour.walkTo(b.dataset.id)) { /* walk */ } else { ui.view = 'drone'; tour.flyTo(b.dataset.id); } syncState(); }
    else if (act === 'auto') { if (tour.playing) tour.stop(); else { ui.view = 'drone'; tour.play(); } syncState(); }
    else if (act === 'view') cyclePlayView();
    else if (act === 'photo') photo(1);
    else if (act === 'hide') { ui.menu = false; syncSheets(); document.body.classList.add('noui'); }
    else if (act === 'planet') { ui.menu = false; togglePlanet(); }   // [v3:integrate]
    else if (act === 'labels') { const ex = ctx.services?.explore; if (ex?.setAmbientLabels) ex.setAmbientLabels(!ex.ambientLabels); syncLabels(); }   // [mobile] 地名ラベル on / off (phones start with them off)
    else if (act === 'report') { ui.menu = false; syncSheets(); contrib?.open({ opener: b }); }   // [contrib] the report sheet (it takes the keyboard and the pad while it is open)
    else if (act === 'jpyc') { ui.menu = false; syncSheets(); jpyc?.openList({ opener: b }); }   // [jpyc] the shop list (the sheet takes the keyboard and the pad while it is open)
    else if (act === 'multi') { ui.menu = false; syncSheets(); ctx.services?.multi?.open({ opener: b }); ctx.services?.multi?.setLang(I.lang); }   // [play] 「みんなであそぶ」: the sheet is mounted later, with the kit
    else if (act === 'sound') { if (ctx.audio) ctx.audio.muted = !ctx.audio.muted; syncSound(); document.getElementById('mute')?.setAttribute('aria-pressed', String(!!ctx.audio?.muted)); }
    else if (act === 'lang') { I.set(I.lang === 'ja' ? 'en' : 'ja'); render(); ctx.services?.multi?.setLang(I.lang); if (e.detail === 0) el.querySelector('[data-act="lang"]')?.focus(); }   // the one click that rebuilds every string; a keyboard user lands back on the button (the old node is gone)
    else if (act === 'season') { life.season?.next(); syncState(); note(I.t('v3.season') + ' · ' + I.t('v3.season.' + life.season.id)); }   // [v3:integrate]
    else if (act === 'arrivals') { ui.arrivalsOpen = !ui.arrivalsOpen; syncState(); }
    else if (act === 'places') { ui.placesOpen = !ui.placesOpen; store.set('klc.places', ui.placesOpen ? '1' : '0'); syncState(); }
    blur();
  });
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (document.body.classList.contains('klc-contrib-open')) return;   // [contrib] the report sheet owns the keyboard while it is open
    if (document.body.classList.contains('klc-jpyc-open')) return;   // [jpyc] so does the shop sheet (its own capture listener has stopped these keys already; this is the belt to that brace)
    if (document.body.classList.contains('klc-multi-open')) return;   // [play] 「みんなであそぶ」 owns the keyboard while its sheet is open
    if (!document.body.classList.contains('playing') && !o.force) return;
    if (e.code === 'KeyB' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) contrib?.open({ opener: el.querySelector('[data-act="report"]') });   // [contrib]
    else if (e.code === 'KeyT') cyclePreset();
    else if (e.code === 'KeyP') { if (window.__play?.eatKeyP?.(e)) { /* あそぶ owns P while walking, driving or flying */ } else photo(1); }
    else if (e.code === 'KeyG') { if (tour.playing) tour.stop(); else tour.play(); syncState(); }
    else if (e.code === 'KeyV') cyclePlayView();
    else if (e.code === 'KeyO') togglePlanet();   // [v3:integrate]
    else if (e.code === 'KeyK' && life.season) { life.season.next(); syncState(); note(I.t('v3.season') + ' · ' + I.t('v3.season.' + life.season.id)); }   // [v3:integrate]
    else if (e.code === 'KeyM') setTimeout(syncSound, 0);
    // [ui-a2] a movement key takes the camera back. The auto tour stops, as before. A flight to a place is finished with skip(), never with stop() (which freezes the camera in mid-air):
    // a quarter-second glide when it is near its destination, a veil dip when it is far (ui/veil.js). A held key is one press: repeats are ignored, so the flight is ended once.
    else if (FLY_BREAK.has(e.code) && !e.metaKey && !e.ctrlKey && !e.altKey && (tour.playing || (tour.flying && !e.repeat))) { if (tour.playing) { tour.stop(); syncState(); } else interruptFlight(tour, ctx.veil); }
    else if (/^Digit[1-9]$/.test(e.code)) { const s = tour.stops[Number(e.code.slice(5)) - 1]; if (s) { e.stopImmediatePropagation?.(); tour.stop(); if (!(ui.view === 'walk' && tour.walkTo(s.id))) { ui.view = 'drone'; tour.flyTo(s.id); } syncState(); } }   // [v3:fix] number keys follow the view, like the places panel
  }, true);
  T.onChange((s, why) => { if (why === 'end' || why === 'instant' || why === 'hours' || why === 'live' || why === 'start') syncState(); });
  tour.onChange(() => syncState());   // the stop the camera is at, the tour button, the places planet (explore's tour.add): all in place; a changed stop count rebuilds the list once
  live?.onChange?.(() => fill());

  // a touch outside the ☰ menu / a sheet closes it (pointerdown reaches here before the pad's touch handling)
  document.addEventListener('pointerdown', (e) => {
    if (!ui.menu && !ui.sheet && !ui.credits) return;
    const inside = e.target.closest?.('#klc-ui .tools, #klc-ui .mbtn, #klc-ui .pbar, #klc-ui .dock, #klc-ui .places, #klc-ui .credits');
    if (!inside) { ui.menu = false; ui.sheet = ''; ui.credits = false; syncState(); }
  }, true);
  // [ui-a2] a press on the scene takes the camera back from a flight (a mouse or a pen on the canvas). A touch is the pad's (ui/touchpad.js onTouchStart, while it is out of the way): one
  // touch fires pointerdown and touchstart, and the flight must be ended once, so with the pad on the pointer event of a finger is left to it. The auto tour has its own pause button and G.
  document.addEventListener('pointerdown', (e) => {
    if (e.target?.id !== 'scene' || (e.pointerType === 'touch' && ctx.pad?.active)) return;
    interruptFlight(tour, ctx.veil);
  }, true);
  // visibility: after "Enter the town", or forced (?ui=1)
  const show = () => { el.hidden = !(o.force || document.body.classList.contains('playing')); };
  new MutationObserver(show).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  render(); show();
  let acc = 0;
  let minute = '';
  return { el, i18n: I, photo, render, contrib, jpyc, get view() { return ui.view; }, get person() { return ui.person; }, noteMode, syncState, update(dt) {
    acc += dt;
    if (acc > 0.5) {
      acc = 0;
      const c = T.clock();
      setText($('clock'), c); setText($('dclock'), c); setText($('ptime'), timeLabel());
      if (c !== minute) { minute = c; fill(); }   // 予定 / 入港済み flips when the minute crosses an ETA
    }
  } };
}
