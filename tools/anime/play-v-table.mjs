// [play] The visual pass measurement table: BEFORE (round 3) against AFTER, from the DOM (getBoundingClientRect)
// at 1440x900 and 393x852. Reads docs/play/shots/play-kit/v-{before,after}-measure.json; prints Markdown.
//   env -u NODE_OPTIONS bun tools/anime/play-v-table.mjs
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { ROOT } from './cdp.mjs';

const dir = join(ROOT, 'docs/play/shots/play-kit');
const load = (t) => { const f = join(dir, `v-${t}-measure.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; };
const B = load('before');
const A = load('after');
const get = (m, dev, item, sel, i = 0) => m?.[`${dev}-ja`]?.[item]?.[sel]?.[i] || null;
const px = (v) => (v == null ? '–' : (Math.round(v * 10) / 10) + '');
const fs = (r) => (r ? Math.round(parseFloat(r.fs) * 10) / 10 : null);
const wh = (r) => (r ? `${px(r.w)}×${px(r.h)}` : '–');

const rows = [];
const row = (item, spec, f) => {
  const cell = (m, dev) => { try { return f(m, dev) ?? '–'; } catch { return '–'; } };
  rows.push(`| ${item} | ${spec} | ${cell(B, 'desktop')} | ${cell(B, 'phone')} | ${cell(A, 'desktop')} | ${cell(A, 'phone')} |`);
};
row('あそぶ pill (h × w)', '56 px tall, primary', (m, d) => { const r = get(m, d, 'hud', 'pill'); return r && `${px(r.h)} × ${px(r.w)}, text ${fs(get(m, d, 'hud', 'pillText'))} px`; });
row('手帳 pill (h)', '≥ 44 px, secondary', (m, d) => { const r = get(m, d, 'hud', 'book'); return r && `${px(r.h)} px`; });
row('Status chip', '36–40 px, 13–14 px text', (m, d) => { const r = get(m, d, 'hud', 'chip'); return r && `${px(r.h)} px, name ${fs(get(m, d, 'hud', 'chipName'))} / count ${fs(get(m, d, 'hud', 'chipNum'))} px`; });
row('Countdown 「2」', '120 px numerals, 紺 outline', (m, d) => { const r = get(m, d, 'countdown', 'num') || get(m, d, 'countdown', 'count'); return r && `${fs(r)} px font, box ${wh(r)}`; });
row('「GO!」', '山吹', (m, d) => { const r = get(m, d, 'go', 'num') || get(m, d, 'go', 'count'); return r && `${fs(r)} px font, box ${wh(r)}`; });
row('Timer', '40–48 px digits, 2 px 紺 outline', (m, d) => { const r = get(m, d, 'timer', 'timer'); return r && `${fs(r)} px`; });
row('Action, primary', '64–72 px', (m, d) => { const r = get(m, d, 'actions', 'act', 0); return r && wh(r); });
row('Action, secondary', '52–56 px, labelled 12–13 px', (m, d) => { const r = get(m, d, 'actions', 'act', 1); const l = get(m, d, 'actions', 'label', 1); return r && `${wh(r)}, label ${fs(l)} px`; });
row('Key hints', 'desktop: Space · E · R · C · Esc', (m, d) => { const all = m?.[`${d}-ja`]?.actions?.key || []; return all.length ? all.map((k) => k.text).join(' · ') : (d === 'phone' ? 'none (touch)' : '–'); });
row('Toast / big toast', '18 / 28–34 px', (m, d) => { const r = get(m, d, 'toast', 'toast'); const b = get(m, d, 'toast', 'big'); return r && `${fs(r)} / ${fs(b)} px`; });
row('Onomatopoeia', 'heaviest JP face, 3 px white + 紺', (m, d) => { const r = get(m, d, 'ono', 'ono'); return r && `${fs(r)} px ${r.ff} ${r.fw}`; });
row('判子 stamp', 'lands with a thud', (m, d) => { const r = get(m, d, 'stamp', 'stamp'); return r && wh(r); });
row('Results medal', 'big medal, rim, engraved kanji, shine, ribbon', (m, d) => { const r = get(m, d, 'results', 'medal'); return r && `${px(r.w)} px`; });
row('Results time', 'big tabular digits', (m, d) => { const r = get(m, d, 'results', 'time'); return r && `${fs(r)} px`; });
row('Results 判子', 'a stamp, not a band', (m, d) => { const r = get(m, d, 'results', 'stamp'); return r && wh(r); });
row('Results buttons', '56 px pills', (m, d) => { const r = get(m, d, 'results', 'retry'); return r && wh(r); });
row('Pickup sparkles', '4-point stars 6–14 px', (m, d) => { const t = m === A ? 'after' : 'before'; const s = (m.spark || {})[t + '-' + d]; return s ? `${s.n} stars, ${s.min}–${s.max} px (p50 ${s.p50})` : '–'; });
row('60 m glint', 'obvious at a glance, every 2.2 s', (m, d) => { const r = get(m, d, 'charm-60', 'glint'); return r && `${px(r.w)} px at the flash`; });
row('Hub, chosen card', 'scales ~1.04, stays vivid', (m, d) => { const r = get(m, d, 'hub-card', 'open'); return r && `${wh(r)}, opacity ${r.op}`; });
row('Hub, 7 cards', 'phone carousel / desktop 3 columns', (m, d) => { const r = get(m, d, 'hub-7', 'sheet'); return r && `sheet ${wh(r)}`; });
console.log('| Item | Spec | BEFORE desktop | BEFORE phone | AFTER desktop | AFTER phone |');
console.log('|---|---|---|---|---|---|');
console.log(rows.join('\n'));
