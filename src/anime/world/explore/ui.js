// [v4:explore] Explore UI, in the HUD's paper-glass style (ui/style.js): a minimap with your position and heading,
// place search in Japanese and English over every real name, the full map (click a place or a street to go there),
// and the drive button with a speed chip. Strings from data/i18n.json (v4.x.*); the language follows the HUD.
//
//   const ui = mountExploreUI(ctx, { life, drive, net, bm, labels, places, search })   ui.update(dt)   ui.goTo(place)
import { createI18n } from '../../ui/i18n.js';
import { MAP_COLORS } from './basemap.js';
import { CAT_COLORS, catGroup } from './labels.js';

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="18.5" r="1.6"/><circle cx="16.5" cy="18.5" r="1.6"/><path d="M6.5 11h11"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4.5" r="2"/><path d="M11 21l2-6 3 3v3"/><path d="M8 12l3-4 3 2 3 1"/><path d="M11 8l-1 5 3 2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const CSS = /* css */`
#klc-x { --k-ink: #2d3350; --k-navy: #1f3a68; --k-muted: #6b6f86; --k-glass: rgba(250, 247, 241, 0.86); --k-line: rgba(45, 51, 80, 0.12); --k-accent: #e0703f;
  --k-round: "Zen Maru Gothic", "Noto Sans JP", "Hiragino Sans", sans-serif; --k-sans: "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif;
  position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: var(--k-sans); color: var(--k-ink); -webkit-font-smoothing: antialiased; }
#klc-x[hidden], body.noui #klc-x, body.noui #klc-labels { display: none !important; }
#klc-x * { box-sizing: border-box; }
#klc-x button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; }
#klc-x button:focus-visible, #klc-x input:focus-visible { outline: 2px solid #2f7fae; outline-offset: 2px; }
#klc-x .glass { background: var(--k-glass); backdrop-filter: blur(10px) saturate(1.2); -webkit-backdrop-filter: blur(10px) saturate(1.2); box-shadow: 0 8px 28px rgba(35, 40, 70, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.5) inset; }
#klc-x svg { width: 18px; height: 18px; flex: none; }
#klc-x .xbar { position: absolute; top: calc(66px + env(safe-area-inset-top, 0px)); right: 18px; display: flex; gap: 8px; }
#klc-x .xbar button { height: 38px; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; padding: 0 13px 0 11px; font: 700 12.5px/1 var(--k-round); color: var(--k-navy); }
#klc-x .xbar button[aria-pressed="true"] { background: var(--k-navy); color: #fff; }
#klc-x .xbar kbd { font: 700 10px/1 var(--k-sans); opacity: .55; margin-left: 2px; }
/* minimap */
#klc-x .mini { position: absolute; right: 18px; bottom: calc(66px + env(safe-area-inset-bottom, 0px)); width: 176px; display: grid; justify-items: center; gap: 6px; pointer-events: auto; cursor: pointer; }
#klc-x .mini canvas { width: 176px; height: 176px; border-radius: 50%; display: block; box-shadow: 0 8px 26px rgba(35, 40, 70, 0.22), 0 0 0 3px rgba(250, 247, 241, 0.92); background: #f1ebdc; }
#klc-x .mini .cap { max-width: 230px; padding: 5px 11px; border-radius: 999px; font: 700 12px/1.2 var(--k-round); color: var(--k-navy); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#klc-x .mini .cap small { font: 500 10px/1 var(--k-sans); color: var(--k-muted); margin-left: 6px; }
#klc-x .mini .n { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); font: 900 10px/1 var(--k-sans); color: #b3413b; text-shadow: 0 0 3px #fff, 0 0 3px #fff; }
/* search */
#klc-x .xsearch { position: absolute; top: calc(112px + env(safe-area-inset-top, 0px)); right: 18px; width: min(380px, calc(100vw - 36px)); border-radius: 16px; padding: 10px; pointer-events: auto; display: grid; gap: 8px; max-height: calc(100vh - 290px); grid-template-rows: auto 1fr; }
#klc-x .xsearch[hidden] { display: none; }
#klc-x .xsearch .row { display: flex; gap: 6px; align-items: center; }
#klc-x .xsearch input { flex: 1; min-width: 0; height: 40px; border-radius: 12px; border: 1px solid var(--k-line); background: rgba(255,255,255,.8); padding: 0 12px; font: 500 15px/1 var(--k-sans); color: var(--k-ink); pointer-events: auto; }
#klc-x .xsearch .x { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: var(--k-muted); }
#klc-x .xsearch ol { list-style: none; margin: 0; padding: 0; overflow: auto; overscroll-behavior: contain; }
#klc-x .xsearch h4 { margin: 8px 6px 4px; font: 700 11px/1 var(--k-sans); letter-spacing: .16em; color: var(--k-muted); }
#klc-x .xsearch li button { width: 100%; display: grid; grid-template-columns: 12px 1fr auto; gap: 2px 10px; align-items: center; text-align: left; padding: 8px 8px; border-radius: 10px; }
#klc-x .xsearch li button:hover, #klc-x .xsearch li button[aria-selected="true"] { background: rgba(31, 58, 104, 0.08); }
#klc-x .xsearch li i { width: 10px; height: 10px; border-radius: 50%; grid-row: 1 / 3; }
#klc-x .xsearch li b { font: 700 14px/1.25 var(--k-round); color: var(--k-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#klc-x .xsearch li small { grid-column: 2; font: 500 11px/1.2 var(--k-sans); color: var(--k-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#klc-x .xsearch li em { grid-row: 1 / 3; grid-column: 3; font: 500 11px/1 var(--k-sans); font-style: normal; color: var(--k-muted); font-variant-numeric: tabular-nums; }
#klc-x .xsearch .empty { padding: 10px 8px; font: 500 13px/1.4 var(--k-sans); color: var(--k-muted); }
/* full map */
#klc-x .xmap { position: absolute; inset: calc(64px + env(safe-area-inset-top, 0px)) 18px calc(96px + env(safe-area-inset-bottom, 0px)); border-radius: 20px; overflow: hidden; pointer-events: auto; }
#klc-x .xmap[hidden] { display: none; }
#klc-x .xmap canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
#klc-x .xmap .hd { position: absolute; top: 10px; left: 12px; right: 12px; display: flex; gap: 8px; align-items: center; pointer-events: none; }
#klc-x .xmap .hd b { font: 900 16px/1 var(--k-round); color: var(--k-navy); padding: 8px 12px; border-radius: 999px; }
#klc-x .xmap .hd span { font: 500 12px/1.3 var(--k-sans); color: var(--k-muted); padding: 7px 11px; border-radius: 999px; }
#klc-x .xmap .hd .sp { flex: 1; }
#klc-x .xmap .hd button { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: var(--k-navy); pointer-events: auto; }
#klc-x .xmap .credit { position: absolute; left: 10px; bottom: 8px; max-width: calc(100% - 20px); font: 500 10px/1.3 var(--k-sans); color: var(--k-muted); background: rgba(250,247,241,.8); padding: 2px 8px; border-radius: 999px; pointer-events: none; }   /* [v4:docs] bottom left: the minimap (drawn after the map) covered the right end of the ODbL / GSI credit */
/* drive chip */
#klc-x .xdrive { position: absolute; left: 50%; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; gap: 12px; align-items: center; padding: 8px 16px; border-radius: 999px; white-space: nowrap; }
#klc-x .xdrive[hidden] { display: none; }
#klc-x .xdrive .spd { font: 900 22px/1 var(--k-round); color: var(--k-navy); font-variant-numeric: tabular-nums; min-width: 2.2em; text-align: right; }
#klc-x .xdrive .u { font: 700 11px/1 var(--k-sans); color: var(--k-muted); }
#klc-x .xdrive .rd { font: 700 13px/1.2 var(--k-round); color: var(--k-ink); max-width: 36vw; overflow: hidden; text-overflow: ellipsis; }
#klc-x .xdrive .hint { font: 500 11px/1.2 var(--k-sans); color: var(--k-muted); }
/* labels */
#klc-labels { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }
body:not(.playing):not(.shotui) #klc-labels { display: none; }
body.shot:not(.shotui) #klc-labels { display: none; }
#klc-labels .xl { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px; white-space: nowrap;
  background: rgba(250, 247, 241, 0.82); box-shadow: 0 3px 10px rgba(35, 40, 70, 0.16); font: 700 12px/1.2 "Zen Maru Gothic", "Noto Sans JP", sans-serif; color: #2d3350; transition: opacity .25s; will-change: transform, opacity; }
#klc-labels .xl::after { content: ""; position: absolute; left: 50%; bottom: -5px; width: 2px; height: 5px; margin-left: -1px; background: rgba(45, 51, 80, 0.35); }
#klc-labels .xl i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
#klc-labels .xl small { font: 500 10px/1 "Noto Sans JP", sans-serif; color: #6b6f86; }
#klc-labels .xl small:empty { display: none; }
#klc-labels .xl[data-prio="1"] { font-size: 11px; padding: 2px 8px 2px 6px; background: rgba(250, 247, 241, 0.72); }
#klc-labels .xl[data-prio="3"] { font-size: 13.5px; }
#klc-labels .xl.pin { background: #1f3a68; color: #fff; box-shadow: 0 4px 14px rgba(31, 58, 104, 0.4); }
#klc-labels .xl.pin small { color: rgba(255,255,255,.75); }
@media (max-width: 1100px) { #klc-x .xbar kbd { display: none; } }
@media (max-width: 720px) {
  #klc-x .xbar { top: auto; right: 10px; bottom: calc(206px + env(safe-area-inset-bottom, 0px)); flex-direction: column; gap: 6px; }
  #klc-x .xbar button { width: 44px; height: 44px; padding: 0; justify-content: center; }
  #klc-x .xbar button span { display: none; }
  #klc-x .mini { right: auto; left: 12px; top: calc(96px + env(safe-area-inset-top, 0px)); bottom: auto; width: 104px; }
  #klc-x .mini canvas { width: 104px; height: 104px; }
  #klc-x .mini .cap { max-width: 140px; font-size: 10.5px; padding: 4px 8px; }
  #klc-x .mini .cap small { display: none; }
  #klc-x .xsearch { top: calc(66px + env(safe-area-inset-top, 0px)); right: 10px; left: 10px; width: auto; max-height: calc(100vh - 300px); }
  #klc-x .xmap { inset: calc(60px + env(safe-area-inset-top, 0px)) 8px calc(150px + env(safe-area-inset-bottom, 0px)); }
  #klc-x .xdrive { bottom: calc(210px + env(safe-area-inset-bottom, 0px)); padding: 6px 12px; }
  #klc-x .xdrive .hint { display: none; }
  #klc-labels .xl { font-size: 10.5px; }
}
@media (max-width: 480px) { #klc-x .xbar { bottom: calc(214px + env(safe-area-inset-bottom, 0px)); } }
@media (prefers-reduced-motion: reduce) { #klc-labels .xl { transition: none; } }
`;

export function mountExploreUI(ctx, { life, drive, net, bm, labels, places, search, force = false }) {
  if (typeof document === 'undefined') return null;
  const L = ctx.L;
  const I = createI18n();
  if (!document.getElementById('klc-x-css')) { const st = document.createElement('style'); st.id = 'klc-x-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-x'; el.setAttribute('lang', I.lang);
  document.body.appendChild(el);
  const isPhone = () => innerWidth <= 720;
  const ui = { search: false, map: false, sel: -1, results: [], q: '' };

  el.innerHTML = `
    <div class="xbar">
      <button class="glass" data-act="search" aria-pressed="false">${ICON.search}<span data-t="v4.x.search"></span><kbd>/</kbd></button>
      <button class="glass" data-act="map" aria-pressed="false">${ICON.map}<span data-t="v4.x.map"></span><kbd>N</kbd></button>
      <button class="glass" data-act="drive" aria-pressed="false">${ICON.car}<span data-t="v4.x.drive"></span><kbd>C</kbd></button>
    </div>
    <section class="xsearch glass" hidden aria-label="">
      <div class="row"><input type="search" enterkeyhint="go" autocomplete="off" spellcheck="false"><button class="x" data-act="search-close" aria-label="">${ICON.close}</button></div>
      <ol role="listbox"></ol>
    </section>
    <section class="xmap glass" hidden>
      <canvas></canvas>
      <div class="hd"><b class="glass" data-t="v4.x.map"></b><span class="glass" data-t="v4.x.mapHint"></span><i class="sp"></i>
        <button class="glass" data-act="zin" aria-label="+">${ICON.plus}</button><button class="glass" data-act="zout" aria-label="-">${ICON.minus}</button><button class="glass" data-act="map-close" aria-label="">${ICON.close}</button></div>
      <div class="credit"></div>
    </section>
    <div class="mini" role="button" tabindex="-1" aria-label=""><canvas></canvas><span class="n">N</span><div class="cap glass"><span data-f="area"></span><small data-f="road"></small></div></div>
    <div class="xdrive glass" hidden><span class="spd" data-f="spd">0</span><span class="u">km/h</span><span class="rd" data-f="droad"></span><span class="hint" data-f="dhint"></span></div>`;
  const $ = (s) => el.querySelector(s);
  const input = $('.xsearch input'), list = $('.xsearch ol');
  const miniCv = $('.mini canvas'), mapCv = $('.xmap canvas');

  function texts() {
    el.setAttribute('lang', I.lang);
    for (const n of el.querySelectorAll('[data-t]')) n.textContent = I.t(n.dataset.t);
    input.placeholder = I.t('v4.x.searchPh');
    $('.xsearch').setAttribute('aria-label', I.t('v4.x.search'));
    $('.xsearch .x').setAttribute('aria-label', I.t('v4.x.close'));
    $('.xmap [data-act="map-close"]').setAttribute('aria-label', I.t('v4.x.close'));
    $('.mini').setAttribute('aria-label', I.t('v4.x.map'));
    $('.xmap .credit').textContent = L.CREDITS;
    $('[data-f="dhint"]').textContent = I.t(matchMedia('(pointer: coarse)').matches ? 'v4.x.driveHintTouch' : 'v4.x.driveHint');
    syncDrive();
    if (ui.search) renderResults();
  }

  // ------------------------------------------------------------------ going places
  const tour = () => life?.tour;
  function note(msg) { life?.hud?.render && life.hud.el?.querySelector('[data-f="note"]') && (() => { const n = life.hud.el.querySelector('[data-f="note"]'); n.textContent = msg; n.classList.add('show'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.remove('show'), 2600); })(); }
  /** Go to a place: the stops fly or walk as the tour does; any other place gets a framing computed on the spot. */
  function goTo(p, { how = null } = {}) {
    if (!p) return;
    if (drive?.active) drive.exit();
    ctx.planet?.active && ctx.planet.exit();
    const pl = ctx.playerObj, T = tour();
    const walking = how ? how === 'walk' : pl && !pl.fly;
    const st = T?.stops?.find((s) => s.id === p.id);
    const fr = st || places.frame(p);
    if (walking && fr.walk) { T?.stop?.(); if (st && T.walkTo(st.id)) { /* tour walk */ } else pl.setPose(fr.walk.x, fr.walk.z, fr.walk.yaw, fr.walk.pitch); }
    else if (fr.drone) { if (T) { T.stop(); if (st) T.flyTo(st.id); else T.flyTo(fr.drone); } }
    const item = labels?.items.find((it) => it.id === p.id) || places.labelItem(p);
    labels?.pin(item);
    note((I.lang === 'en' && p.en ? p.en : p.ja));
  }
  function goToPoint(x, z) {
    const n = net.nearest(x, z, 120);
    const pl = ctx.playerObj;
    if (n && pl && !pl.fly && Math.hypot(n.x - x, n.z - z) < 120) { if (drive?.active) drive.exit(); const f = places.walkAt(x, z); if (f) { tour()?.stop?.(); pl.setPose(f.x, f.z, f.yaw, f.pitch); return; } }
    const g = Math.max(L.heightAt(x, z), 0);
    tour()?.stop?.(); if (drive?.active) drive.exit();
    tour()?.flyTo({ pos: [x + 60, g + 70, z + 90], look: [x, g + 4, z] });
  }

  // ------------------------------------------------------------------ search
  function openSearch(v = !ui.search) {
    ui.search = v; $('.xsearch').hidden = !v; $('[data-act="search"]').setAttribute('aria-pressed', String(v));
    if (v) { if (ui.map) openMap(false); renderResults(); setTimeout(() => input.focus(), 0); } else input.blur();
  }
  function renderResults() {
    const q = input.value.trim(); ui.q = q;
    const c = ctx.camera.position;
    const dist = (p) => Math.hypot(p.at[0] - c.x, p.at[1] - c.z);
    const fmt = (d) => (d < 950 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km');
    const row = (p, i) => `<li><button role="option" data-i="${i}" aria-selected="${i === ui.sel}"><i style="background:${CAT_COLORS[catGroup(p.cat)] || CAT_COLORS.other}"></i><b>${esc(I.lang === 'en' && p.en ? p.en : p.ja)}</b><small>${esc(I.lang === 'en' ? (p.en ? p.ja : I.t('v4.x.cat.' + catGroup(p.cat))) : (p.en || I.t('v4.x.cat.' + catGroup(p.cat))))}</small><em>${fmt(dist(p))}</em></button></li>`;
    if (!q) {
      // the places list: the tour stops, the civic landmarks and explore's places, by kind
      ui.results = search.featured();
      const groups = new Map();
      ui.results.forEach((p, i) => { const g = p.group || 'places'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(row(p, i)); });
      list.innerHTML = [...groups].map(([g, rows]) => `<h4>${esc(I.t('v4.x.group.' + g))}</h4>${rows.join('')}`).join('');
      return;
    }
    ui.results = search.find(q, 30);
    list.innerHTML = ui.results.length ? ui.results.map(row).join('') : `<li class="empty">${esc(I.t('v4.x.noResults'))}</li>`;
  }
  input.addEventListener('input', () => { ui.sel = input.value.trim() ? 0 : -1; renderResults(); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { openSearch(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = ui.results.length; if (!n) return; ui.sel = (Math.max(-1, ui.sel) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; renderResults(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { const p = ui.results[Math.max(0, ui.sel)]; if (p) { openSearch(false); goTo(p); } }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; const p = ui.results[Number(b.dataset.i)]; openSearch(false); goTo(p); });

  // ------------------------------------------------------------------ minimap
  const mini = { mpp: 2.5, t: 0 };   // [v4:polish1] 2.5 m per px (1.3 showed one road and blank paper)
  function drawMap(cv, cx, cz, mpp, { round = false, markers = false, heading = true } = {}) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MAP_COLORS.sea; g.fillRect(0, 0, W, H);
    if (bm) {
      for (const layer of mpp > 7 ? [bm.city] : [bm.city, bm.core]) {
        const s = layer.mpp / mpp;   // screen px per layer px
        const sx = (cx - layer.x0) / layer.mpp - W / 2 / s, sz = (cz - layer.z0) / layer.mpp - H / 2 / s;
        g.imageSmoothingEnabled = s < 2;
        g.drawImage(layer.canvas, sx, sz, W / s, H / s, 0, 0, W, H);
      }
    }
    const P = (x, z) => [W / 2 + (x - cx) / mpp, H / 2 + (z - cz) / mpp];
    if (markers) {
      const lab = mpp < 6;
      g.font = '700 11px "Zen Maru Gothic", "Noto Sans JP", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      for (const p of search.featured()) {
        const [x, y] = P(p.at[0], p.at[1]); if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = CAT_COLORS[catGroup(p.cat)] || CAT_COLORS.other; g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill();
        if (lab || p.group === 'tour') { const t = I.lang === 'en' && p.en ? p.en : p.ja; g.lineWidth = 3; g.strokeStyle = 'rgba(250,247,241,.9)'; g.strokeText(t, x + 9, y); g.fillStyle = '#2d3350'; g.fillText(t, x + 9, y); }
      }
    } else {
      for (const p of search.featured()) { const [x, y] = P(p.at[0], p.at[1]); if (x < 0 || y < 0 || x > W || y > H) continue; g.fillStyle = CAT_COLORS[catGroup(p.cat)] || CAT_COLORS.other; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    }
    const pin = labels?.pinned; if (pin) { const [x, y] = P(pin.x, pin.z); g.fillStyle = '#e0703f'; g.beginPath(); g.arc(x, y - 7, 5.5, Math.PI, 0); g.lineTo(x, y + 2); g.closePath(); g.fill(); }
    if (heading) {
      // you: an arrow with a view cone
      const cam = ctx.camera, pos = drive?.active ? { x: drive.state.x, z: drive.state.z } : cam.position;
      const [x, y] = P(pos.x, pos.z);
      const dx = -Math.sin(yawOf()), dz = -Math.cos(yawOf()), a = Math.atan2(dz, dx);
      const fov = (cam.fov * cam.aspect) * Math.PI / 180 / 2;
      const grad = g.createRadialGradient(x, y, 2, x, y, 46); grad.addColorStop(0, 'rgba(47,127,174,.45)'); grad.addColorStop(1, 'rgba(47,127,174,0)');
      g.fillStyle = grad; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 46, a - Math.min(0.9, fov), a + Math.min(0.9, fov)); g.closePath(); g.fill();
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -10); g.lineTo(7.5, 7.5); g.lineTo(0, 4); g.lineTo(-7.5, 7.5); g.closePath(); g.fill();
      g.fillStyle = drive?.active ? '#e0703f' : '#1f3a68'; g.beginPath(); g.moveTo(0, -7.5); g.lineTo(5, 5.5); g.lineTo(0, 2.5); g.lineTo(-5, 5.5); g.closePath(); g.fill();
      g.restore();
    }
    // [v4:integrate] an opaque mask: after the heading arrow's save / restore the fill style was the view-cone gradient
    // (alpha 0.45 -> 0 over 46 px), which faded the whole minimap out except round the arrow
    if (round) { g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#000'; g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; }
  }
  function yawOf() {
    if (drive?.active) return drive.state.yaw;
    const d = new ctx.THREE.Vector3(); ctx.camera.getWorldDirection(d); return Math.atan2(-d.x, -d.z);
  }
  function caption() {
    const c = drive?.active ? { x: drive.state.x, z: drive.state.z } : ctx.camera.position;
    const area = search.areaAt(c.x, c.z);
    const n = net.nearest(c.x, c.z, 14);
    const road = n?.road ? (I.lang === 'en' ? n.road.nameEn || n.road.name || '' : n.road.name || '') : '';
    $('[data-f="area"]').textContent = area ? (I.lang === 'en' && area.en ? area.en : area.ja) : (I.lang === 'en' ? 'Kesennuma' : '気仙沼');
    $('[data-f="road"]').textContent = road;
    return road;
  }

  // ------------------------------------------------------------------ full map
  const fm = { cx: 0, cz: 0, mpp: 4, drag: null, moved: false };
  function openMap(v = !ui.map) {
    ui.map = v; $('.xmap').hidden = !v; $('[data-act="map"]').setAttribute('aria-pressed', String(v));
    if (v) { if (ui.search) openSearch(false); const c = ctx.camera.position; fm.cx = c.x; fm.cz = c.z; fm.mpp = 4; document.exitPointerLock?.(); }
  }
  const mapAt = (e) => { const r = mapCv.getBoundingClientRect(); return [fm.cx + (e.clientX - r.left - r.width / 2) * fm.mpp, fm.cz + (e.clientY - r.top - r.height / 2) * fm.mpp]; };
  const pointers = new Map();
  mapCv.addEventListener('pointerdown', (e) => { mapCv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); fm.drag = [e.clientX, e.clientY]; fm.moved = false; });
  mapCv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {   // pinch
      const [a, b] = [...pointers.values()], other = [...pointers.entries()].find(([k]) => k !== e.pointerId)[1];
      const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]), d1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d0 > 0) fm.mpp = Math.max(0.6, Math.min(40, fm.mpp * d0 / d1)); fm.moved = true; return;
    }
    fm.cx -= (e.clientX - prev[0]) * fm.mpp; fm.cz -= (e.clientY - prev[1]) * fm.mpp;
    if (Math.hypot(e.clientX - fm.drag[0], e.clientY - fm.drag[1]) > 5) fm.moved = true;
  });
  const up = (e) => {
    const was = pointers.has(e.pointerId); pointers.delete(e.pointerId);
    if (!was || fm.moved || pointers.size) return;
    // a click: a place marker within 12 px, else the point itself
    const [x, z] = mapAt(e);
    let best = null; for (const p of search.featured()) { const d = Math.hypot(p.at[0] - x, p.at[1] - z) / fm.mpp; if (d < 12 && (!best || d < best.d)) best = { p, d }; }
    openMap(false);
    if (best) goTo(best.p); else goToPoint(x, z);
  };
  mapCv.addEventListener('pointerup', up); mapCv.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  mapCv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, z] = mapAt(e); const k = Math.exp(e.deltaY * 0.0015); const m2 = Math.max(0.6, Math.min(40, fm.mpp * k)); fm.cx = x + (fm.cx - x) * m2 / fm.mpp; fm.cz = z + (fm.cz - z) * m2 / fm.mpp; fm.mpp = m2; }, { passive: false });

  // ------------------------------------------------------------------ drive
  function syncDrive() {
    const on = !!drive?.active;
    const b = $('[data-act="drive"]'); b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${on ? ICON.walk : ICON.car}<span>${esc(I.t(on ? 'v4.x.getOut' : 'v4.x.drive'))}</span><kbd>C</kbd>`;
    $('.xdrive').hidden = !on;
  }
  drive?.onChange?.(() => { syncDrive(); if (drive.active) { openSearch(false); openMap(false); } });

  // ------------------------------------------------------------------ events
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) { if (e.target.closest('.mini')) openMap(true); return; }
    const a = b.dataset.act;
    if (a === 'search') openSearch();
    else if (a === 'search-close') openSearch(false);
    else if (a === 'map') openMap();
    else if (a === 'map-close') openMap(false);
    else if (a === 'zin') fm.mpp = Math.max(0.6, fm.mpp / 1.5);
    else if (a === 'zout') fm.mpp = Math.min(40, fm.mpp * 1.5);
    else if (a === 'drive') drive?.toggle();
    b.blur?.();
  });
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (!document.body.classList.contains('playing') && !force) return;
    if (e.key === '/' || (e.code === 'KeyF' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openSearch(true); }
    else if (e.code === 'KeyN') openMap();
    else if (e.code === 'Escape') { openSearch(false); openMap(false); }
  });
  // the visitor enters the town: the HUD rule (body.playing), or forced for UI screenshots (?ui=1)
  const show = () => { el.hidden = !(force || document.body.classList.contains('playing')); };
  new MutationObserver(show).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  show(); texts();

  let acc = 0, capAcc = 1;
  function update(dt) {
    acc += dt; capAcc += dt;
    const hl = life?.hud?.i18n?.lang; if (hl && hl !== I.lang) { I.set(hl); texts(); }
    if (el.hidden) return;
    if (acc >= 1 / 20) {
      acc = 0;
      // minimap scale: walking close in, driving wider with speed, from the drone by altitude
      const c = ctx.camera.position, alt = c.y - Math.max(L.heightAt(c.x, c.z), 0);
      const want = drive?.active ? 1.6 + Math.abs(drive.state.speed) * 0.12 : ctx.playerObj?.fly ? Math.max(1.4, Math.min(30, alt / 45)) : 1.1;
      mini.mpp += (want - mini.mpp) * 0.25;
      const p = drive?.active ? { x: drive.state.x, z: drive.state.z } : c;
      drawMap(miniCv, p.x, p.z, mini.mpp * (isPhone() ? 1.5 : 1), { round: true });
      if (ui.map) drawMap(mapCv, fm.cx, fm.cz, fm.mpp, { markers: true });
      if (drive?.active) { $('[data-f="spd"]').textContent = String(Math.round(drive.kmh)); }
    }
    if (capAcc > 0.4) { capAcc = 0; const road = caption(); if (drive?.active) $('[data-f="droad"]').textContent = road; }
  }
  return { el, update, goTo, goToPoint, openSearch, openMap, get state() { return { ...ui }; }, i18n: I };
}
