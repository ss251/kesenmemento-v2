// [ship:acts] The voyage UI of 第一昭福丸: act titles, the sailing HUD (speed in knots, heading, the かなえ大橋 / 商港
// toasts), the set / wait counters, the haul HUD (scale, keep / release, tag, freezer, quota bar), the Act 3 chain
// cards, the final card, and a facts panel. Japanese by default, English on the toggle. Every string is in
// data/ship/i18n.json (its own file: data/i18n.json belongs to other packages).
//
//   const ui = mountShipUI(ctx, { onAction })   ui.show(view)   ui.update(model)   ui.toast(key|text, vars)
//   view: the acts.js state; model: live numbers from the voyage (knots, heading, km, kg, ...)
import { pickLang } from './i18n.js';
import DATA from '../../../data/ship/i18n.json';
import { RULES, SPECIES, ACT_OF, STATES, oceanNoposKey } from '../world/ship/acts.js';
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
#klc-ship{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:"Zen Maru Gothic","Noto Sans JP","Hiragino Sans",sans-serif;color:#2d3350;--k-navy:#1f3a68;--glass:rgba(250,247,241,.86);--ink:#2d3350;--accent:var(--accent-fill, #c4521f);--blue:#2f64b5;--line:rgba(45,51,80,.12);line-break:strict}
#klc-ship :is(h2,h3,b){word-break:auto-phrase;text-wrap:balance}
#klc-ship :is(p,.note,small){text-wrap:pretty}
#klc-ship *{box-sizing:border-box}
#klc-ship .glass{background:var(--glass);backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2);border:0;border-radius:16px;box-shadow:0 8px 28px rgba(35,40,70,.14),0 0 0 1px rgba(255,255,255,.5) inset}
#klc-ship button{pointer-events:auto;font:700 14px/1 "Zen Maru Gothic","Noto Sans JP","Hiragino Sans",sans-serif;cursor:pointer;border:0;border-radius:999px;min-height:44px;padding:0 18px;background:#fff;color:var(--k-navy);box-shadow:0 2px 8px rgba(40,40,70,.15);transition:transform var(--dur-press) var(--ease-out),background-color var(--dur-fast) ease,box-shadow var(--dur-fast) ease,opacity var(--dur-fast) ease}
#klc-ship button.primary{background:var(--accent);color:#fff}
#klc-ship button.blue{background:var(--blue);color:#fff}
#klc-ship button:disabled{opacity:.45;cursor:default}
/* [ui-b2:6] the press layer (ui/style.js) and the two-tone focus ring: navy between two white bands, legible on glass, on the sea and on the card scrim */
#klc-ship button:not(:disabled):active{transform:scale(.97)}
#klc-ship button:focus-visible{outline:2px solid var(--ring-ink, #1f3a68);outline-offset:2px;box-shadow:0 0 0 5px var(--ring-halo, rgba(255, 255, 255, 0.92))}
#klc-ship .top{position:absolute;z-index:2;left:calc(16px + env(safe-area-inset-left,0px));right:calc(16px + env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px));display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:space-between}
#klc-ship .acts{display:flex;gap:6px;padding:6px;pointer-events:auto}
#klc-ship .acts span{padding:6px 12px;border-radius:999px;font-weight:700;font-size:13px;opacity:.5;white-space:nowrap}
#klc-ship .acts span.on{background:var(--k-navy);color:#fff;opacity:1}
#klc-ship .tools{display:flex;gap:6px;pointer-events:auto;margin-left:auto}
#klc-ship .tools button{min-height:44px;padding:0 14px;font-size:13px;white-space:nowrap;flex:none}
#klc-ship .tools button[aria-pressed="true"]{background:var(--k-navy);color:#fff}
#klc-ship .tools .ls{display:none}
#klc-ship .where{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:8px 16px;font-weight:700;font-size:14px;text-align:center;max-width:calc(100% - 32px)}
#klc-ship .where small{display:block;font-weight:400;font-size:12px;opacity:.75}
#klc-ship .titlecard{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#fff;text-shadow:0 2px 18px rgba(20,20,40,.55);transition:opacity .8s;opacity:0}
#klc-ship .titlecard.show{opacity:1}
#klc-ship .titlecard b{display:block;font-size:clamp(28px,6vw,56px);letter-spacing:.06em}
#klc-ship .titlecard span{font-size:clamp(14px,2.4vw,20px)}
#klc-ship .panel{position:absolute;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));width:min(420px,calc(100% - 32px));padding:14px 16px;pointer-events:auto}
#klc-ship .panel h3{margin:0 0 6px;font-size:17px}
#klc-ship .panel p{margin:4px 0;font-size:13px;line-height:1.55}
#klc-ship .panel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
#klc-ship .meters{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:8px 0}
#klc-ship .meter b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
#klc-ship .meter small{font-size:11px;opacity:.7}
#klc-ship .bar{height:10px;border-radius:8px;background:rgba(43,42,58,.12);overflow:hidden;margin:4px 0}
#klc-ship .bar i{display:block;height:100%;background:var(--blue);transition:width .3s}
#klc-ship .bar.quota i{background:var(--accent)}
#klc-ship .scale{display:flex;gap:12px;align-items:center;margin:6px 0}
#klc-ship .scale .lcd{background:#1d2230;color:#8ef0a8;font-family:ui-monospace,monospace;font-size:28px;padding:6px 12px;border-radius:8px;min-width:132px;text-align:right}
#klc-ship .tag{display:inline-block;background:#2f6fd6;color:#fff;font-family:ui-monospace,monospace;font-weight:700;padding:3px 10px;border-radius:8px;font-size:13px;letter-spacing:.03em}
#klc-ship .msg{min-height:20px;font-size:13px;font-weight:700}
#klc-ship .msg.warn{color:#b3302a}
#klc-ship .note{font-size:12px;opacity:.75}
#klc-ship .toast{position:absolute;left:50%;top:calc(112px + env(safe-area-inset-top,0px));transform:translateX(-50%) translateY(-6px);padding:10px 18px;font-weight:700;font-size:14px;opacity:0;transition:opacity .35s,transform .35s;max-width:calc(100% - 32px);text-align:center}
#klc-ship .toast.show{opacity:1;transform:translateX(-50%)}
#klc-ship .card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:calc(63px + env(safe-area-inset-top,0px)) calc(16px + env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) calc(16px + env(safe-area-inset-left,0px));pointer-events:auto;background:rgba(30,32,48,.35)}
#klc-ship .card .inner{width:min(720px,100%);max-height:calc(100% - 32px);overflow:auto;overscroll-behavior:contain;padding:16px}
/* [integrate:fix] the footer row (次へ / もう一度出港 / 町へ戻る) stays at the bottom of a card that scrolls, so it is never clipped at the card edge */
#klc-ship .card .inner>.row:last-child{position:sticky;bottom:-16px;padding:8px 0 16px;background:linear-gradient(to bottom,rgba(250,247,241,0),rgba(250,247,241,.9) 12px)}
/* [integrate:fix] on a phone with the pad the top bar (the act chips, 施設 / 英 / 町へ戻る) sits above the card: the card starts below it, not under it */
body.klc-pad #klc-ship .card{padding-top:calc(63px + env(safe-area-inset-top,0px))}
body.klc-pad #klc-ship .card .inner{max-height:100%}
#klc-ship .card canvas{width:100%;height:auto;border-radius:12px;display:block;background:#eef}
#klc-ship .card h2{margin:12px 0 4px;font-size:22px}
#klc-ship .card p{font-size:14px;line-height:1.65;margin:6px 0}
#klc-ship .rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 10px;margin:8px 0}
#klc-ship .rows div{font-size:13px;font-variant-numeric:tabular-nums}
#klc-ship .line{font-size:clamp(22px,4.4vw,34px);font-weight:900;color:var(--accent);margin:10px 0 4px;letter-spacing:.04em}
#klc-ship .facts{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));top:calc(64px + env(safe-area-inset-top,0px));width:min(360px,calc(100% - 32px));padding:14px 16px;pointer-events:auto}
#klc-ship .facts ul{margin:6px 0;padding-left:18px;font-size:13px;line-height:1.6}
#klc-ship .facts{max-height:calc(100% - 80px - env(safe-area-inset-top,0px));overflow:auto;overscroll-behavior:contain}
#klc-ship .steps{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px;font-size:14px;line-height:1.5}
#klc-ship .steps li{display:flex;gap:8px;align-items:flex-start;opacity:0;animation:klc-step .5s ease-out forwards}
#klc-ship .steps li b{flex:none;width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;display:grid;place-items:center}
#klc-ship .steps li.rule{font-weight:700;color:#a8322a}
#klc-ship .steps li.rule b{background:var(--ink)}
@keyframes klc-step{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
body.shot #klc-ship .steps li{animation:none;opacity:1}
@media (prefers-reduced-motion:reduce){#klc-ship .steps li{animation:none;opacity:1}}
#klc-ship .closing{margin:14px 0 10px;padding:10px 14px;border-left:4px solid var(--accent);background:rgba(210,74,60,.07);border-radius:0 12px 12px 0}
#klc-ship .closing p{margin:0;font-size:16px;font-weight:700;line-height:1.6}
#klc-ship .closing cite{display:block;margin-top:4px;font-style:normal;font-size:12px;opacity:.75}
#klc-ship [hidden]{display:none!important}
body.klc-ship #klc-ui,body.klc-ship #klc-x,body.klc-ship #klc-labels,body.klc-ship #klc-ui-restore{display:none!important}
body.klc-ship #corner,body.klc-ship #help,body.klc-ship #cross,body.klc-ship #toast,body.klc-ship #klc-board{display:none!important}
body:not(.playing):not(.shot) #klc-ship{display:none!important}
@media (max-width:600px){#klc-ship .long{display:none}#klc-ship .where{top:calc(60px + env(safe-area-inset-top,0px));padding:6px 10px;font-size:12px}#klc-ship .where{max-width:60%}#klc-ship .where small{display:none}#klc-ship .meters{gap:2px 10px;margin:4px 0}#klc-ship .meter b{font-size:18px}#klc-ship .panel{left:calc(8px + env(safe-area-inset-left,0px));right:calc(8px + env(safe-area-inset-right,0px));width:auto;bottom:calc(8px + env(safe-area-inset-bottom,0px));padding:12px}#klc-ship .top{left:calc(8px + env(safe-area-inset-left,0px));right:calc(8px + env(safe-area-inset-right,0px))}#klc-ship .acts span{padding:6px 8px;font-size:12px}#klc-ship .toast{top:calc(170px + env(safe-area-inset-top,0px))}#klc-ship .scale .lcd{font-size:22px;min-width:110px}}
/* [ui-b:11] a phone's top bar: the acts and the three tools fit one row. Under 480 px the English labels that are long have a short form (ship.btn.*.short: Facts, Town);
   under 420 px the buttons also tighten, so 375 and 360 px fit in Japanese and in English (measured, the UI round notes (ui-b, not included)). */
@media (max-width:480px){#klc-ship .tools .lf{display:none}#klc-ship .tools .ls{display:inline}}
@media (max-width:420px){#klc-ship .tools{gap:4px}#klc-ship .tools button{padding:0 10px;font-size:12px}#klc-ship .acts{gap:4px;padding:5px}#klc-ship .acts span{padding:6px 6px}}
/* [integrate] a landscape phone (844 x 390): the bottom panel was taller than the screen (its title and the キープ / 放流 row ran off the top) and sat
   on the 「どこの海」 bubble. The long notes fold away (as on a narrow phone), the panel scrolls inside the screen, and the bubble moves to the right. */
@media (max-height:520px) and (orientation:landscape){#klc-ship .long{display:none}#klc-ship .panel{width:min(400px,calc(55% - 24px));max-height:calc(100% - 76px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow-y:auto;overscroll-behavior:contain}#klc-ship .where{left:auto;right:calc(16px + env(safe-area-inset-right,0px));transform:none;top:calc(64px + env(safe-area-inset-top,0px));max-width:min(300px,calc(45% - 24px));text-align:left}#klc-ship .toast{top:calc(64px + env(safe-area-inset-top,0px))}
/* [integrate:fix2] Act 2 on a landscape phone: the bubble is its bold line only, the panel is at most 60% of the height with its meters in one row,
   the long notes sit behind 船のデータ, and the 早送り row stays pinned at the bottom of the scrolling panel */
#klc-ship .where small{display:none}#klc-ship .panel{max-height:60%;padding:10px 14px}#klc-ship .panel .meters{display:flex;flex-wrap:nowrap;gap:2px 14px;margin:4px 0}#klc-ship .panel .meter b{font-size:18px}
#klc-ship .panel h3{margin:0 0 2px;font-size:15px}#klc-ship .panel p{margin:2px 0}
#klc-ship[data-view="OCEAN_SET"] .panel .note,#klc-ship[data-view="WAIT"] .panel .note,#klc-ship[data-view="HAUL"] .panel .note,#klc-ship[data-view="STOW"] .panel .note{display:none}
#klc-ship .panel .meter small{display:block;font-size:10.5px;line-height:1.25}#klc-ship .panel .lcd{font-size:22px;padding:3px 10px;min-width:110px}#klc-ship .panel .scale{margin:2px 0}#klc-ship[data-view="HAUL"] .panel .meter small{display:none}#klc-ship[data-view="HAUL"] .panel .meters{align-items:center;gap:0 16px}#klc-ship[data-view="HAUL"] .panel .meter b{font-size:15px;white-space:nowrap}#klc-ship[data-view="HAUL"] .panel .tag{padding:1px 8px;font-size:12px}#klc-ship[data-view="HAUL"] .panel .row{margin-top:4px}#klc-ship[data-view="HAUL"] .panel{padding:8px 14px}#klc-ship[data-view="HAUL"] .panel h3{margin:0}#klc-ship[data-view="HAUL"] .panel .scale{margin:0}#klc-ship[data-view="HAUL"] .panel .meters{margin:2px 0}#klc-ship[data-view="HAUL"] .panel>small{display:block;line-height:1.3}#klc-ship[data-view="HAUL"] .panel .bar{margin:2px 0}#klc-ship .panel .msg{min-height:0;line-height:1.3}
#klc-ship .panel>.row:last-child{position:sticky;bottom:-10px;margin-top:6px;padding:2px 0 10px;background:transparent}}
/* [integrate] at the helm on a phone with the pad (body.klc-pad): the pad's stick and buttons own the lower half, so the DEPART panel is a slim
   strip at the top, right of the pad's settings gear (speed and heading, the horn, the skip); the autopilot and the way home are pad buttons */
body.klc-pad #klc-ship[data-view="DEPART"] .panel{top:calc(63px + env(safe-area-inset-top,0px));bottom:auto;left:calc(66px + env(safe-area-inset-left,0px));right:auto;width:fit-content;max-width:calc(100% - 74px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));padding:6px 8px 6px 14px;display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;border-radius:22px}
body.klc-pad #klc-ship[data-view="DEPART"] .panel h3,body.klc-pad #klc-ship[data-view="DEPART"] .panel .note,body.klc-pad #klc-ship[data-view="DEPART"] .panel .meter:nth-child(n+3),body.klc-pad #klc-ship[data-view="DEPART"] .panel [data-a="helm"],body.klc-pad #klc-ship[data-view="DEPART"] .tools [data-a="exit"]{display:none}
body.klc-pad #klc-ship[data-view="DEPART"] .panel .meters{display:flex;gap:4px 14px;margin:0}
body.klc-pad #klc-ship[data-view="DEPART"] .panel .meter{display:flex;align-items:baseline;gap:5px}
body.klc-pad #klc-ship[data-view="DEPART"] .panel .meter b{font-size:19px}
body.klc-pad #klc-ship[data-view="DEPART"] .panel .row{margin:0;gap:6px}
body.klc-pad #klc-ship[data-view="DEPART"] .panel .row button{min-height:36px;padding:0 14px;font-size:12.5px}
`;

/** A real DOM (not a test stub): the UI mounts only there. */
const hasDOM = () => typeof document !== 'undefined' && typeof document.getElementById === 'function' && !!document.body?.classList;

export function mountShipUI(ctx, { onAction = () => {}, lang } = {}) {
  if (!hasDOM()) return null;
  const I = createShipI18n(lang);
  const t = (k, v) => I.t(k, v);
  if (!document.getElementById('klc-ship-css')) { const st = document.createElement('style'); st.id = 'klc-ship-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-ship'; el.setAttribute('lang', I.lang); el.hidden = true;
  document.body.appendChild(el);
  const ui = { view: null, data: null, model: {}, facts: false, msg: '', msgWarn: false, titleT: 0 };
  let toastT = 0;

  const actChips = () => [1, 2, 3].map((a) => `<span class="${ACT_OF[ui.view] === a ? 'on' : ''}">${esc(t('ship.chip.' + a))}</span>`).join('');
  /** [ui-b:11] A top-bar button. A label with a short form (ship.btn.*.short differs from the full one: Facts / Town in English) carries both, and CSS shows the short one
   *  on a narrow screen (the full label stays its accessible name). */
  const toolBtn = (a, key, attrs = '') => {
    const full = t(key), short = DATA.ja[key + '.short'] !== undefined ? t(key + '.short') : full;
    return short !== full
      ? `<button data-a="${a}"${attrs} aria-label="${esc(full)}"><span class="lf">${esc(full)}</span><span class="ls">${esc(short)}</span></button>`
      : `<button data-a="${a}"${attrs}>${esc(full)}</button>`;
  };
  function panelFor(view, d) {
    const m = ui.model;
    switch (view) {
      case 'DOCKED': return `<h3>${esc(t('ship.docked.title'))}</h3><p>${esc(t('ship.docked.body'))}</p><p class="note">${esc(t('ship.sendoff.note'))}</p>
        <div class="row"><button class="primary" data-a="START">${esc(t('ship.btn.start'))}</button></div>`;
      case 'SENDOFF': return `<h3>${esc(t('ship.state.SENDOFF'))}</h3><p>${esc(t('ship.sendoff.note'))}</p>
        <div class="meters"><div class="meter"><b data-f="tapes">–</b><small>${esc(t('ship.sendoff.tapesLabel'))}</small></div></div>
        <div class="row"><button data-a="HORN">${esc(t('ship.btn.horn'))}</button><button class="primary" data-a="CAST_OFF" ${d.horn ? '' : 'disabled'}>${esc(t('ship.btn.castoff'))}</button></div>`;
      case 'DEPART': return `<h3>${esc(t('ship.state.DEPART'))}</h3>
        <div class="meters"><div class="meter"><b data-f="kn">0.0</b><small>${esc(I.lang === 'ja' ? `${t('ship.hud.speed')}（${t('ship.hud.kn')}）` : `${t('ship.hud.speed')} (${t('ship.hud.kn')})`)}</small></div>
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
        <div class="meters"><div class="meter"><b data-f="waitH">0.0</b><small>${esc(t('ship.wait.hLabel'))}</small></div>
        <div class="meter"><b data-f="clock">10:00</b><small>${esc(t('ship.wait.time'))}</small></div></div>
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
    // the ship's share (about 80 t, the 臼福本店 talk, 2026-10-03) with this set's catch as a slice; a landed slice stays visible
    const pct = d.landedKg > 0 ? Math.max(1.5, Math.min(100, (d.landedKg / d.allowanceKg) * 100)) : 0;
    return `<h3>${esc(t('ship.haul.title'))}</h3>
      <div class="scale"><div class="lcd" data-f="lcd">${f && ui.model.fishReady ? nf(f.kg, 1) + ' kg' : '—'}</div>
        <div><b>${f && ui.model.fishReady ? esc(sp) : esc(t('ship.haul.waiting'))}</b><br><small>${f && ui.model.fishReady ? esc(t('ship.haul.fl', { cm: f.fl })) : ''}</small></div></div>
      <div class="msg ${ui.msgWarn ? 'warn' : ''}" data-f="msg">${esc(ui.msg || (f && ui.model.fishReady ? t('ship.haul.choose') : ''))}</div>
      <div class="row"><button class="blue" data-a="KEEP" ${f && ui.model.fishReady ? '' : 'disabled'}>${esc(t('ship.btn.keep'))}</button><button data-a="RELEASE" ${f && ui.model.fishReady ? '' : 'disabled'}>${esc(t('ship.btn.release'))}</button></div>
      <p class="note long">${esc(t('ship.haul.rule'))}</p>
      <div class="meters"><div class="meter"><b>${lastTag ? `<span class="tag">${esc(lastTag)}</span>` : '—'}</b><small>${esc(t('ship.haul.tag'))}</small></div>
        <div class="meter"><b>${esc(t('ship.haul.freezerN', { n: d.kept.length }))}</b><small>${esc(t('ship.haul.freezer'))}</small></div></div>
      <small>${esc(t('ship.haul.quotaBar', { kg: nf(d.landedKg, 1), max: nf(d.allowanceKg / 1000) }))}</small>
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
        <blockquote class="closing" data-f="closing"><p>${esc(t(c.closing.line))}</p><cite>— ${esc(t(c.closing.by))}</cite></blockquote>
        <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><a href="${esc(c.link)}" data-a="shop" style="pointer-events:auto"><button class="primary" tabindex="-1">${esc(t('ship.card.go'))}</button></a><button data-a="RESTART">${esc(t('ship.btn.restart'))}</button><button data-a="exit">${esc(t('ship.btn.exit'))}</button></div>
      </div></div>`;
    }
    if (view === 'HOMECOMING') {
      return `<div class="panel glass"><h3>${esc(t(c.title))}</h3><p>${esc(t(c.body))}</p><p class="note">${esc(t(c.fact))}</p>
        <div class="row"><button data-a="HORN">${esc(t('ship.btn.horn'))}</button><button class="primary" data-a="NEXT">${esc(t('ship.btn.next'))}</button></div></div>`;
    }
    // the Shimizu landing inspection: its substeps in order, numbered like the badges on the art, one after another
    const steps = c.steps ? `<ol class="steps" data-f="steps">${c.steps.map((x, i) => `<li class="${x.rule ? 'rule' : ''}" data-step="${esc(x.id)}" style="animation-delay:${(0.4 + i * 1.1).toFixed(1)}s"><b>${x.rule ? '!' : x.n}</b><span>${esc(t(x.key))}</span></li>`).join('')}</ol>` : '';
    const tagNote = c.tagNote ? `<p class="note">${esc(t(c.tagNote))}</p>` : '';
    return `<div class="card"><div class="inner glass"><canvas width="960" height="440" data-art="${esc(view)}"></canvas>
      <h2>${esc(t(c.title))}</h2><p>${esc(t(c.body, c.vars))}</p>${steps}${rows}<p class="note">${esc(t(c.fact, c.vars))}</p>${tagNote}
      <div class="row" style="display:flex;justify-content:flex-end"><button class="primary" data-a="NEXT">${esc(t('ship.btn.next'))}</button></div></div></div>`;
  }
  function factsPanel() {
    const keys = ['gt', 'loa', 'built', 'call', 'speed', 'air', 'crew', 'voyage', 'aroma', 'starlink', 'msc', 'iucn', 'awards', 'fleet', 'trivia'];
    return `<div class="facts glass"><h3 style="margin:0">${esc(t('ship.facts.title'))}</h3><ul>${keys.map((k) => `<li>${esc(t('ship.facts.' + k))}</li>`).join('')}</ul>${ACT_OF[ui.view] === 2 ? `<p class="note">${esc(t('ship.ocean.where'))} ${esc(t(oceanNoposKey(ui.model.today)))} · ${esc(t('ship.ocean.seasonNote'))}</p>${ui.view === 'HAUL' ? `<p class="note">${esc(t('ship.haul.japan'))}</p>` : ''}` : ''}<p class="note">${esc(t('ship.facts.src'))}</p><p class="note">${esc(t(ui.model.livery === 'nendo' ? 'ship.livery.nendo' : 'ship.livery.fallback'))}</p></div>`;
  }
  function render() {
    const v = ui.view, d = ui.data || {};
    el.setAttribute('lang', I.lang);
    const act = ACT_OF[v];
    const ocean = act === 2;
    const isCard = ['TRANSSHIP_LAS_PALMAS', 'REEFER', 'SHIMIZU_WEIGH', 'CARD'].includes(v);
    el.innerHTML = `
      <div class="top"><div class="acts glass">${actChips()}</div>
        <div class="tools">${toolBtn('facts', 'ship.btn.facts', ` aria-pressed="${ui.facts}"`)}${toolBtn('lang', 'ship.btn.lang')}${toolBtn('exit', 'ship.btn.exit')}</div></div>
      ${ocean ? `<div class="where glass">${esc(t('ship.ocean.where'))}<small>${esc(t(oceanNoposKey(ui.model.today)))} · ${esc(t('ship.ocean.seasonNote'))}</small></div>` : ''}
      <div class="titlecard" data-f="title"><b>${esc(t('ship.act' + act))}</b><span>${esc(t('ship.act' + act + '.sub'))}</span></div>
      <div class="toast glass" data-f="toast"></div>
      ${isCard || v === 'HOMECOMING' ? chainCard(v, d) : `<div class="panel glass">${panelFor(v, d)}</div>`}
      ${ui.facts ? factsPanel() : ''}`;
    for (const cv of el.querySelectorAll('canvas[data-art]')) { try { drawChainArt(cv.dataset.art, cv.getContext('2d'), cv.width, cv.height, { weighed: d.weighIn?.weighed ?? 0, tags: (d.weighIn?.rows || []).map((r) => r.tag) }); } catch (e) { console.warn(e); } }
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
    ui.view = view; ui.data = data; if (el.dataset) el.dataset.view = view;   // [ship:pad] the phone CSS lays each beat out from this
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

// ------------------------------------------------------------------------------------------------ boarding chip
// [ship:integrate] 「第一昭福丸に乗る」: a chip that appears while you are near the コの字岸壁 (world/ship/index.js decides
// when), in the explore UI's paper-glass style. Shown only once the visitor is in the town (body.playing) or in a UI shot.
const BOARD_CSS = /* css */`
#klc-board{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(8px);z-index:5;opacity:0;pointer-events:none;transition:opacity .35s,transform .35s;line-break:strict;
  display:flex;align-items:center;gap:12px;padding:8px 10px 8px 18px;border-radius:999px;background:rgba(250,247,241,.9);backdrop-filter:blur(10px) saturate(1.2);-webkit-backdrop-filter:blur(10px) saturate(1.2);
  box-shadow:0 8px 28px rgba(35,40,70,.18),0 0 0 1px rgba(255,255,255,.5) inset;font-family:"Zen Maru Gothic","Noto Sans JP",sans-serif;color:#1f3a68;white-space:nowrap;width:max-content;max-width:calc(100vw - 24px)}   /* (width: max-content: at left 50% a fixed box shrank to the right half of the screen, 195 px on a phone, and cut the title) */
#klc-board.show{opacity:1;transform:translateX(-50%);pointer-events:auto}
#klc-board .txt{display:grid;gap:2px;min-width:0}
#klc-board b{font:900 15px/1.2 "Zen Maru Gothic","Noto Sans JP",sans-serif;overflow:hidden;text-overflow:ellipsis}
#klc-board b .short{display:none}
#klc-board small{font:500 11px/1.2 "Noto Sans JP",sans-serif;color:#55596f;overflow:hidden;text-overflow:ellipsis}
#klc-board button{font:700 14px/1 "Zen Maru Gothic","Noto Sans JP",sans-serif;color:#fff;background:var(--accent-fill, #c4521f);border:0;border-radius:999px;min-height:44px;padding:0 18px;cursor:pointer;box-shadow:0 4px 12px rgba(196,82,31,.35);transition:transform var(--dur-press) var(--ease-out),background-color var(--dur-fast) ease}
#klc-board button:active{transform:scale(.97)}   /* [ui-b2:6] the press layer (ui/style.js) */
#klc-board button:focus-visible{outline:2px solid var(--ring-ink, #1f3a68);outline-offset:2px;box-shadow:0 0 0 5px var(--ring-halo, rgba(255, 255, 255, 0.92))}
body:not(.playing):not(.shotui) #klc-board,body.noui #klc-board{display:none!important}
@media (max-width:720px){#klc-board{bottom:calc(262px + env(safe-area-inset-bottom,0px));padding:6px 6px 6px 14px;gap:8px}#klc-board b{font-size:13px}#klc-board b .full{display:none}#klc-board b .short{display:inline}#klc-board small{display:none}}
@media (prefers-reduced-motion:reduce){#klc-board{transition:none}}
`;

/** The boarding chip. -> { el, update({ visible, lang }) } (null without a DOM). */
export function mountBoardChip(ctx, { onBoard = () => {}, lang } = {}) {
  if (!hasDOM()) return null;
  const I = createShipI18n(lang);
  if (!document.getElementById('klc-board-css')) { const st = document.createElement('style'); st.id = 'klc-board-css'; st.textContent = BOARD_CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'klc-board'; el.setAttribute('role', 'region');
  document.body.appendChild(el);
  let shown = false;
  function render() {
    el.setAttribute('lang', I.lang); el.setAttribute('aria-label', I.t('ship.board.title'));
    el.innerHTML = `<div class="txt"><b><span class="full">${esc(I.t('ship.board.title'))}</span><span class="short">${esc(I.t('ship.board.short'))}</span></b><small>${esc(I.t('ship.board.sub'))}</small></div><button type="button" data-a="board">${esc(I.t('ship.board.go'))}</button>`;
  }
  el.addEventListener('click', (e) => { if (e.target.closest('[data-a="board"]')) { e.target.blur?.(); onBoard(); } });
  render();
  return {
    el,
    update({ visible = shown, lang: l } = {}) {
      if (l && l !== I.lang) { I.set(l); render(); }
      if (visible !== shown) { shown = visible; el.classList.toggle('show', shown); el.setAttribute('aria-hidden', String(!shown)); }
    },
    get visible() { return shown; },
  };
}
