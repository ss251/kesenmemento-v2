// [ship:acts] The voyage UI of 第一昭福丸: act titles, the sailing HUD (speed in knots, heading, the かなえ大橋 / 商港
// toasts), the set / wait counters, the haul HUD (scale, keep / release, tag, freezer, quota bar), the Act 3 chain
// cards, the final card, and a facts panel. Japanese by default, English on the toggle. Every string is in
// data/ship/i18n.json (its own file: data/i18n.json belongs to other packages).
//
//   const ui = mountShipUI(ctx, { onAction })   ui.show(view)   ui.update(model)   ui.toast(key|text, vars)
//   view: the acts.js state; model: live numbers from the voyage (knots, heading, km, kg, ...)
import { pickLang } from './i18n.js';
import DATA from '../../../data/ship/i18n.json';
import { RULES, SPECIES, ACT_OF, STATES } from '../world/ship/acts.js';
import { chainCards, drawChainArt, SHOP } from '../world/ship/chain.js';

export const SHIP_STRINGS = DATA;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => Number(v || 0).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });

export function createShipI18n(lang = pickLang()) {
  const I = {
    lang,
    t(key, vars) {
      let s = DATA[I.lang]?.[key] ?? DATA.ja[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v));
      return s;
    },
    set(l) { if (l === 'ja' || l === 'en') { I.lang = l; try { localStorage.setItem('klc.lang', l); } catch (e) { /* private mode */ } } },
  };
  return I;
}

const CSS = /* css */`
#klc-ship{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:"Zen Maru Gothic","Noto Sans JP",system-ui,sans-serif;color:#2b2a3a;--glass:rgba(255,253,248,.86);--ink:#2b2a3a;--accent:#d24a3c;--blue:#2f64b5;--line:rgba(43,42,58,.14)}
#klc-ship *{box-sizing:border-box}
#klc-ship .glass{background:var(--glass);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.7);border-radius:16px;box-shadow:0 6px 24px rgba(40,40,70,.18)}
#klc-ship button{pointer-events:auto;font:inherit;cursor:pointer;border:0;border-radius:999px;min-height:44px;padding:0 18px;background:#fff;color:var(--ink);box-shadow:0 2px 8px rgba(40,40,70,.15);font-weight:700}
#klc-ship button.primary{background:var(--accent);color:#fff}
#klc-ship button.blue{background:var(--blue);color:#fff}
#klc-ship button:disabled{opacity:.45;cursor:default}
#klc-ship .top{position:absolute;left:16px;right:16px;top:12px;display:flex;gap:8px;align-items:flex-start;justify-content:space-between}
#klc-ship .acts{display:flex;gap:6px;padding:6px;pointer-events:auto}
#klc-ship .acts span{padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px;opacity:.5}
#klc-ship .acts span.on{background:var(--ink);color:#fff;opacity:1}
#klc-ship .tools{display:flex;gap:6px;pointer-events:auto}
#klc-ship .tools button{min-height:40px;padding:0 14px;font-size:13px}
#klc-ship .where{position:absolute;left:50%;top:64px;transform:translateX(-50%);padding:8px 16px;font-weight:700;font-size:14px;text-align:center;max-width:calc(100% - 32px)}
#klc-ship .where small{display:block;font-weight:400;font-size:12px;opacity:.75}
#klc-ship .titlecard{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#fff;text-shadow:0 2px 18px rgba(20,20,40,.55);transition:opacity .8s;opacity:0}
#klc-ship .titlecard.show{opacity:1}
#klc-ship .titlecard b{display:block;font-size:clamp(28px,6vw,56px);letter-spacing:.06em}
#klc-ship .titlecard span{font-size:clamp(14px,2.4vw,20px)}
#klc-ship .panel{position:absolute;left:16px;bottom:16px;width:min(420px,calc(100% - 32px));padding:14px 16px;pointer-events:auto}
#klc-ship .panel h3{margin:0 0 6px;font-size:17px}
#klc-ship .panel p{margin:4px 0;font-size:13px;line-height:1.55}
#klc-ship .panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
#klc-ship .meters{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:8px 0}
#klc-ship .meter b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
#klc-ship .meter small{font-size:11px;opacity:.7}
#klc-ship .bar{height:10px;border-radius:6px;background:rgba(43,42,58,.12);overflow:hidden;margin:4px 0}
#klc-ship .bar i{display:block;height:100%;background:var(--blue);transition:width .3s}
#klc-ship .bar.quota i{background:var(--accent)}
#klc-ship .scale{display:flex;gap:12px;align-items:center;margin:6px 0}
#klc-ship .scale .lcd{background:#1d2230;color:#8ef0a8;font-family:ui-monospace,monospace;font-size:28px;padding:6px 12px;border-radius:8px;min-width:132px;text-align:right}
#klc-ship .tag{display:inline-block;background:#2f6fd6;color:#fff;font-family:ui-monospace,monospace;font-weight:700;padding:3px 10px;border-radius:6px;font-size:13px;letter-spacing:.03em}
#klc-ship .msg{min-height:20px;font-size:13px;font-weight:700}
#klc-ship .msg.warn{color:#b3302a}
#klc-ship .note{font-size:12px;opacity:.75}
#klc-ship .toast{position:absolute;left:50%;top:112px;transform:translateX(-50%) translateY(-6px);padding:10px 18px;font-weight:700;font-size:14px;opacity:0;transition:opacity .35s,transform .35s;max-width:calc(100% - 32px);text-align:center}
#klc-ship .toast.show{opacity:1;transform:translateX(-50%)}
#klc-ship .card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:auto;background:rgba(30,32,48,.35)}
#klc-ship .card .inner{width:min(720px,100%);max-height:calc(100% - 32px);overflow:auto;padding:16px}
#klc-ship .card canvas{width:100%;height:auto;border-radius:12px;display:block;background:#eef}
#klc-ship .card h2{margin:12px 0 4px;font-size:22px}
#klc-ship .card p{font-size:14px;line-height:1.65;margin:6px 0}
#klc-ship .rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 10px;margin:8px 0}
#klc-ship .rows div{font-size:13px;font-variant-numeric:tabular-nums}
#klc-ship .line{font-size:clamp(22px,4.4vw,34px);font-weight:900;color:var(--accent);margin:10px 0 4px;letter-spacing:.04em}
#klc-ship .facts{position:absolute;right:16px;top:64px;width:min(360px,calc(100% - 32px));padding:14px 16px;pointer-events:auto}
#klc-ship .facts ul{margin:6px 0;padding-left:18px;font-size:13px;line-height:1.6}
#klc-ship [hidden]{display:none!important}
body.klc-ship #klc-ui,body.klc-ship #klc-x,body.klc-ship #klc-labels,body.klc-ship #klc-ui-restore{display:none!important}
@media (max-width:600px){#klc-ship .long{display:none}#klc-ship .where{top:60px;padding:6px 10px;font-size:12px}#klc-ship .where small{font-size:10.5px}#klc-ship .meters{gap:2px 10px;margin:4px 0}#klc-ship .meter b{font-size:18px}#klc-ship .panel{left:8px;right:8px;width:auto;bottom:8px;padding:12px}#klc-ship .top{left:8px;right:8px}#klc-ship .acts span{padding:6px 8px;font-size:12px}#klc-ship .toast{top:170px}#klc-ship .scale .lcd{font-size:22px;min-width:110px}}
`;

export function mountShipUI(ctx, { onAction = () => {}, lang } = {}) {
  if (typeof document === 'undefined') return null;
  const I = createShipI18n(lang);
  const t = (k, v) => I.t(k, v);
  if (!document.getElementById('klc-ship-css')) { const st = document.createElement('style'); st.id = 'klc-ship-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-ship'; el.setAttribute('lang', I.lang); el.hidden = true;
  document.body.appendChild(el);
  const ui = { view: null, data: null, model: {}, facts: false, msg: '', msgWarn: false, titleT: 0 };
  let toastT = 0;

  const actChips = () => [1, 2, 3].map((a) => `<span class="${ACT_OF[ui.view] === a ? 'on' : ''}">${esc(t('ship.chip.' + a))}</span>`).join('');
  function panelFor(view, d) {
    const m = ui.model;
    switch (view) {
      case 'DOCKED': return `<h3>${esc(t('ship.docked.title'))}</h3><p>${esc(t('ship.docked.body'))}</p><p class="note">${esc(t('ship.sendoff.note'))}</p>
        <div class="row"><button class="primary" data-a="START">${esc(t('ship.btn.start'))}</button></div>`;
      case 'SENDOFF': return `<h3>${esc(t('ship.state.SENDOFF'))}</h3><p>${esc(t('ship.sendoff.note'))}</p>
        <div class="meters"><div class="meter"><b data-f="tapes">–</b><small>${esc(t('ship.sendoff.tapesLabel'))}</small></div></div>
        <div class="row"><button data-a="HORN">${esc(t('ship.btn.horn'))}</button><button class="primary" data-a="CAST_OFF" ${d.horn ? '' : 'disabled'}>${esc(t('ship.btn.castoff'))}</button></div>`;
      case 'DEPART': return `<h3>${esc(t('ship.state.DEPART'))}</h3>
        <div class="meters"><div class="meter"><b data-f="kn">0.0</b><small>${esc(t('ship.hud.speed'))} (${esc(t('ship.hud.kn'))})</small></div>
        <div class="meter"><b data-f="hdg">000°</b><small>${esc(t('ship.hud.heading'))}</small></div>
        <div class="meter"><b data-f="tapes">–</b><small>${esc(t('ship.sendoff.tapesLabel'))}</small></div>
        <div class="meter"><b data-f="air">21 m</b><small>${esc(t('ship.hud.air'))}</small></div></div>
        <p class="note">${esc(t('ship.depart.note'))}</p>
        <div class="row"><button data-a="helm">${esc(t(m.autopilot === false ? 'ship.btn.auto' : 'ship.btn.helm'))}</button><button data-a="HORN">${esc(t('ship.btn.horn'))}</button>${d.passed?.includes('kanae') ? `<button class="primary" data-a="skipBay">${esc(t('ship.btn.skipBay'))}</button>` : ''}</div>`;
      case 'BAY_MOUTH': return `<h3>${esc(t('ship.bay.title'))}</h3><p>${esc(t('ship.bay.body'))}</p>
        <div class="row"><button class="primary" data-a="TO_OCEAN">${esc(t('ship.btn.toOcean'))}</button></div>`;
      case 'OCEAN_SET': return `<h3>${esc(t('ship.set.title'))}</h3>
        <div class="meters"><div class="meter"><b data-f="km">0</b><small>${esc(t('ship.set.lineLabel'))}</small></div>
        <div class="meter"><b data-f="hooks">0</b><small>${esc(t('ship.set.hooksLabel'))}</small></div>
        <div class="meter"><b data-f="floats">0</b><small>${esc(t('ship.set.floatsLabel'))}</small></div>
        <div class="meter"><b data-f="clock">05:30</b><small>${esc(t('ship.set.time'))}</small></div></div>
        <div class="bar"><i data-f="kmbar" style="width:0%"></i></div>
        <p class="note">${esc(t('ship.set.note'))}</p><p class="note long">${esc(t('ship.set.buoy'))}</p>
        <div class="row"><button data-a="ff">${esc(t('ship.btn.ff'))}</button></div>`;
      case 'WAIT': return `<h3>${esc(t('ship.wait.title'))}</h3>
        <div class="meters"><div class="meter"><b data-f="waitH">0.0</b><small>${esc(t('ship.wait.hLabel'))}</small></div></div>
        <div class="bar"><i data-f="waitbar" style="width:0%"></i></div><p class="note">${esc(t('ship.wait.note'))}</p>
        <div class="row"><button data-a="ff">${esc(t('ship.btn.ff'))}</button></div>`;
      case 'HAUL': return haulPanel(d);
      case 'STOW': return `<h3>${esc(t('ship.stow.title'))}</h3>
        <div class="meters"><div class="meter"><b>−60℃</b><small>${esc(t('ship.haul.freezer'))}</small></div>
        <div class="meter"><b data-f="coreH">0</b><small>${esc(t('ship.stow.coreLabel'))}</small></div></div>
        <div class="bar"><i data-f="corebar" style="width:0%"></i></div>
        <p>${esc(t(d.haulEnd === 'quota' ? 'ship.stow.endQuota' : 'ship.stow.endLine'))}</p><p class="note">${esc(t('ship.stow.note'))}</p>
        <div class="row"><button data-a="ff">${esc(t('ship.btn.ff'))}</button></div>`;
      default: return '';
    }
  }
  function haulPanel(d) {
    const f = d.onScale;
    const tagged = d.kept.filter((x) => x.tag);
    const lastTag = tagged.at(-1)?.tag;
    const sp = f ? t('ship.species.' + f.species) : '';
    const pct = Math.min(100, (d.landedKg / d.allowanceKg) * 100);
    return `<h3>${esc(t('ship.haul.title'))}</h3>
      <div class="scale"><div class="lcd" data-f="lcd">${f && ui.model.fishReady ? nf(f.kg, 1) + ' kg' : '—'}</div>
        <div><b>${f && ui.model.fishReady ? esc(sp) : esc(t('ship.haul.waiting'))}</b><br><small>${f && ui.model.fishReady ? esc(t('ship.haul.fl', { cm: f.fl })) : ''}</small></div></div>
      <div class="msg ${ui.msgWarn ? 'warn' : ''}" data-f="msg">${esc(ui.msg || (f && ui.model.fishReady ? t('ship.haul.choose') : ''))}</div>
      <div class="row"><button class="blue" data-a="KEEP" ${f && ui.model.fishReady ? '' : 'disabled'}>${esc(t('ship.btn.keep'))}</button><button data-a="RELEASE" ${f && ui.model.fishReady ? '' : 'disabled'}>${esc(t('ship.btn.release'))}</button></div>
      <p class="note long">${esc(t('ship.haul.rule'))}</p>
      <div class="meters"><div class="meter"><b>${lastTag ? `<span class="tag">${esc(lastTag)}</span>` : '—'}</b><small>${esc(t('ship.haul.tag'))}</small></div>
        <div class="meter"><b>${esc(t('ship.haul.freezerN', { n: d.kept.length }))}</b><small>${esc(t('ship.haul.freezer'))}</small></div></div>
      <small>${esc(t('ship.haul.quotaBar', { kg: nf(d.landedKg, 1), max: nf(d.allowanceKg) }))}</small>
      <div class="bar quota"><i style="width:${pct.toFixed(1)}%"></i></div>
      <p class="note">${esc(t('ship.haul.japan'))}</p>`;
  }
  function chainCard(view, d) {
    const cards = chainCards(d);
    const c = cards.find((x) => x.state === view);
    if (!c) return '';
    const rows = c.rows ? `<div class="rows">${c.rows.map((r) => `<div><span class="tag">${esc(r.tag)}</span> ${nf(r.weighed, 1)} kg ✓</div>`).join('')}</div>` : '';
    if (view === 'CARD') {
      return `<div class="card"><div class="inner glass">
        <h2>${esc(t('ship.card.title'))}</h2><p>${esc(t('ship.card.body'))}</p>
        ${c.tags.length ? `<div class="rows">${c.tags.map((x) => `<div><span class="tag">${esc(x)}</span></div>`).join('')}</div>` : `<p>${esc(t('ship.card.none'))}</p>`}
        <div class="line">${esc(t('ship.card.line'))}</div>
        <p>${esc(t('ship.card.date'))}<br>${esc(t('ship.card.shop'))}</p>
        <p class="note">${esc(t('ship.card.fact'))}</p>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><a href="${esc(c.link)}" data-a="shop" style="pointer-events:auto"><button class="primary" tabindex="-1">${esc(t('ship.card.go'))}</button></a><button data-a="RESTART">${esc(t('ship.btn.restart'))}</button><button data-a="exit">${esc(t('ship.btn.exit'))}</button></div>
      </div></div>`;
    }
    if (view === 'HOMECOMING') {
      return `<div class="panel glass"><h3>${esc(t(c.title))}</h3><p>${esc(t(c.body))}</p><p class="note">${esc(t(c.fact))}</p>
        <div class="row"><button data-a="HORN">${esc(t('ship.btn.horn'))}</button><button class="primary" data-a="NEXT">${esc(t('ship.btn.next'))}</button></div></div>`;
    }
    return `<div class="card"><div class="inner glass"><canvas width="960" height="440" data-art="${esc(view)}"></canvas>
      <h2>${esc(t(c.title))}</h2><p>${esc(t(c.body, c.vars))}</p>${rows}<p class="note">${esc(t(c.fact, c.vars))}</p>
      <div class="row" style="display:flex;justify-content:flex-end"><button class="primary" data-a="NEXT">${esc(t('ship.btn.next'))}</button></div></div></div>`;
  }
  function factsPanel() {
    const keys = ['gt', 'loa', 'built', 'call', 'speed', 'air', 'crew', 'starlink', 'msc', 'iucn', 'awards'];
    return `<div class="facts glass"><h3 style="margin:0">${esc(t('ship.facts.title'))}</h3><ul>${keys.map((k) => `<li>${esc(t('ship.facts.' + k))}</li>`).join('')}</ul><p class="note">${esc(t('ship.facts.src'))}</p><p class="note">${esc(t(ui.model.livery === 'nendo' ? 'ship.livery.nendo' : 'ship.livery.fallback'))}</p></div>`;
  }
  function render() {
    const v = ui.view, d = ui.data || {};
    el.setAttribute('lang', I.lang);
    const act = ACT_OF[v];
    const ocean = act === 2;
    const isCard = ['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'CARD'].includes(v);
    el.innerHTML = `
      <div class="top"><div class="acts glass">${actChips()}</div>
        <div class="tools"><button data-a="facts" aria-pressed="${ui.facts}">${esc(t('ship.btn.facts'))}</button><button data-a="lang">${esc(t('ship.btn.lang'))}</button><button data-a="exit">${esc(t('ship.btn.exit'))}</button></div></div>
      ${ocean ? `<div class="where glass">${esc(t('ship.ocean.where'))}<small>${esc(t('ship.ocean.nopos'))} · ${esc(t('ship.ocean.seasonNote'))}</small></div>` : ''}
      <div class="titlecard" data-f="title"><b>${esc(t('ship.act' + act))}</b><span>${esc(t('ship.act' + act + '.sub'))}</span></div>
      <div class="toast glass" data-f="toast"></div>
      ${isCard || v === 'HOMECOMING' ? chainCard(v, d) : `<div class="panel glass">${panelFor(v, d)}</div>`}
      ${ui.facts ? factsPanel() : ''}`;
    for (const cv of el.querySelectorAll('canvas[data-art]')) { try { drawChainArt(cv.dataset.art, cv.getContext('2d'), cv.width, cv.height, { weighed: d.weighIn?.weighed ?? 0 }); } catch (e) { console.warn(e); } }
    update(ui.model);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === 'lang') { I.set(I.lang === 'ja' ? 'en' : 'ja'); render(); return; }
    if (a === 'facts') { ui.facts = !ui.facts; render(); return; }
    if (a === 'shop') { e.preventDefault(); onAction('shop', SHOP); return; }
    onAction(a);
  });
  const $f = (k) => el.querySelector(`[data-f="${k}"]`);
  const setText = (k, v) => { const n = $f(k); if (n && n.textContent !== v) n.textContent = v; };
  function update(m = {}) {
    Object.assign(ui.model, m);
    const M = ui.model, d = ui.data || {};
    if (M.kn !== undefined) setText('kn', M.kn.toFixed(1));
    if (M.hdg !== undefined) setText('hdg', String(Math.round(((M.hdg % 360) + 360) % 360)).padStart(3, '0') + '°');
    if (M.tapes) setText('tapes', `${M.tapes.n - M.tapes.snapped} / ${M.tapes.n}`);
    if (d.setKm !== undefined) { setText('km', nf(d.setKm, 1) + ' km'); setText('hooks', nf(d.hooks)); setText('floats', nf(d.floats)); const b = $f('kmbar'); if (b) b.style.width = (100 * d.setKm / RULES.lineKm).toFixed(1) + '%'; }
    if (M.clock) setText('clock', M.clock);
    if (d.waitedH !== undefined) { setText('waitH', nf(d.waitedH, 1) + ' h'); const b = $f('waitbar'); if (b) b.style.width = (100 * d.waitedH / RULES.waitMaxH).toFixed(1) + '%'; }
    if (d.freezeH !== undefined) { setText('coreH', nf(d.freezeH) + ' / ' + RULES.coreH + ' h'); const b = $f('corebar'); if (b) b.style.width = (100 * d.freezeH / RULES.coreH).toFixed(1) + '%'; }
  }
  function show(view, data) {
    const actChanged = ACT_OF[view] !== ACT_OF[ui.view];
    ui.view = view; ui.data = data;
    if (view !== 'HAUL') { ui.msg = ''; ui.msgWarn = false; }
    el.hidden = false;
    document.body.classList.add('klc-ship');
    render();
    if (actChanged || view === 'DOCKED') title();
  }
  function title(ms = 2600) {
    const n = $f('title'); if (!n) return;
    n.classList.add('show'); clearTimeout(ui.titleT); ui.titleT = setTimeout(() => $f('title')?.classList.remove('show'), ms);
  }
  function toast(key, vars, ms = 3600) {
    const n = $f('toast'); if (!n) return;
    n.textContent = DATA.ja[key] !== undefined ? t(key, vars) : key;
    n.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => $f('toast')?.classList.remove('show'), ms);
  }
  function message(key, vars, warn = false) { ui.msg = key ? (DATA.ja[key] !== undefined ? t(key, vars) : key) : ''; ui.msgWarn = warn; if (ui.view === 'HAUL') render(); }
  function hide() { el.hidden = true; document.body.classList.remove('klc-ship'); }
  return { el, show, update, toast, message, title, hide, render, i18n: I, t, get state() { return { ...ui }; }, STATES };
}
