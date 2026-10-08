// [play:underwater] The dive prompt, the species chip, the stamina ring, the leap line.
// Glass, 4 px grid, 44 px targets, strict line breaks. No keep-all.

import STR from '../../../../data/play-i18n.json';
import { pickLang } from '../../ui/i18n.js';

const CSS = `
.swim-ui{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:"Zen Maru Gothic","Noto Sans JP",sans-serif;color:#16324a}
.swim-ui *{box-sizing:border-box}
.swim-ui button{pointer-events:auto;font:inherit;line-break:strict;text-wrap:pretty;letter-spacing:.04em}
.swim-dive,.swim-become{min-height:44px;min-width:44px;padding:8px 18px;border:0;border-radius:999px;background:rgba(255,255,255,.78);box-shadow:0 8px 28px rgba(22,50,74,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.swim-dive{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);font-size:16px}
.swim-become{position:absolute;top:calc(16px + env(safe-area-inset-top));right:calc(16px + env(safe-area-inset-right));font-size:14px;color:#3d5a72}
.swim-chip{position:absolute;left:calc(16px + env(safe-area-inset-left));top:calc(16px + env(safe-area-inset-top));display:flex;align-items:center;gap:12px;max-width:calc(100vw - 188px - env(safe-area-inset-left) - env(safe-area-inset-right));padding:8px 14px 8px 8px;border-radius:999px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.swim-chip>div{min-width:0}
@media (max-width:720px) and (orientation:portrait){
  .swim-become{top:calc(64px + env(safe-area-inset-top))}
  .swim-chip{top:calc(120px + env(safe-area-inset-top));max-width:calc(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right))}
}
@media (max-height:500px){
  body:has(#klc-play .sheet:not([hidden])) .swim-chip{visibility:hidden}
}
.swim-ring{width:44px;height:44px;flex:none}
.swim-name{font-size:15px;line-break:strict;text-wrap:pretty}
.swim-fact{margin:0;font-size:12px;color:#3d5a72;line-break:strict;text-wrap:pretty}
.swim-leap{position:absolute;left:50%;top:22%;transform:translateX(-50%);margin:0;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.82);font-size:18px;letter-spacing:.08em;line-break:strict}
.swim-hint{position:absolute;left:50%;bottom:calc(156px + env(safe-area-inset-bottom));transform:translateX(-50%);margin:0;max-width:280px;text-align:center;font-size:13px;color:#16324a;line-break:strict;text-wrap:pretty;text-shadow:0 1px 0 rgba(255,255,255,.7)}
`;

export function t(key, lang = pickLang()) {
  const pack = STR[lang] || STR.ja;
  return pack[key] || STR.ja[key] || key;
}

export function label(key) {
  return { ja: STR.ja[key] || key, en: STR.en[key] || STR.ja[key] || key };
}

export function createHud() {
  const root = document.createElement('div');
  root.className = 'swim-ui';
  const style = document.createElement('style');
  style.textContent = CSS;
  const dive = document.createElement('button');
  dive.type = 'button'; dive.className = 'swim-dive'; dive.hidden = true;
  const become = document.createElement('button');
  become.type = 'button'; become.className = 'swim-become';
  const chip = document.createElement('div');
  chip.className = 'swim-chip'; chip.hidden = true;
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 44 44'); ring.setAttribute('class', 'swim-ring');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', '22'); track.setAttribute('cy', '22'); track.setAttribute('r', '16');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', 'rgba(22,94,131,.18)'); track.setAttribute('stroke-width', '4');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  arc.setAttribute('cx', '22'); arc.setAttribute('cy', '22'); arc.setAttribute('r', '16');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', '#165E83'); arc.setAttribute('stroke-width', '4');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', 'rotate(-90 22 22)');
  const C = 2 * Math.PI * 16;
  arc.setAttribute('stroke-dasharray', String(C));
  ring.append(track, arc);
  const name = document.createElement('div');
  const sp = document.createElement('div'); sp.className = 'swim-name';
  const fact = document.createElement('p'); fact.className = 'swim-fact';
  name.append(sp, fact);
  chip.append(ring, name);
  const leap = document.createElement('p'); leap.className = 'swim-leap'; leap.hidden = true;
  const hint = document.createElement('p'); hint.className = 'swim-hint'; hint.hidden = true;
  root.append(style, dive, become, chip, leap, hint);
  document.body.append(root);
  let leapT = 0, lang = '';
  function paint() {
    const L = pickLang();
    if (L === lang) return;
    lang = L;
    dive.textContent = t('play.swim.dive', L);
    become.textContent = t('play.swim.become', L);
    hint.textContent = t('play.swim.hint', L);
  }
  paint();
  return {
    root, dive, become,
    onDive(fn) { dive.addEventListener('click', fn); },
    onBecome(fn) { become.addEventListener('click', fn); },
    offer(on) { dive.hidden = !on; },
    hideBecome() { become.hidden = true; },
    show(on) { chip.hidden = !on; if (!on) { leap.hidden = true; hint.hidden = true; } },
    species(id) {
      const L = pickLang();
      sp.textContent = t('play.swim.species.' + id, L);
      fact.textContent = t('play.swim.fact.' + id, L);
    },
    stamina(k) { arc.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(1, k))))); },
    leapt() { leap.hidden = false; leap.textContent = t('play.swim.breach'); leapT = 1.35; },
    nudge() { hint.hidden = false; },
    quiet() { hint.hidden = true; },
    tick(dt) {
      paint();
      if (leapT > 0) { leapT -= dt; if (leapT <= 0) leap.hidden = true; }
    },
  };
}
