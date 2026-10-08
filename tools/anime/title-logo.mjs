// KesenMemento title logo: 「ケセン／メメント」 riding the swell, with the sea inside the letters and a カツオ leaping.
//   env -u NODE_OPTIONS bun tools/anime/title-logo.mjs
// writes src/anime/assets/loader/title-logo-sun.svg (default, 山吹) and title-logo-sea.svg (生成り).
// Outlines: Dela Gothic One (OFL) via glyphs.py; every other shape is drawn here. No font file ships.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {'sea'|'sun'} variant  sun is the product default (山吹 top); sea stays a build option (生成り top) */
export function logoSvg(variant = 'sun', layout = 'stack') {
const V = variant, LAYOUT = layout;
const J = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url))).glyphs;
const KANA = J('./g-dela.json'), SUB = J('./g-sub.json');

// CRAFT.md §1 palette
const C = { ai: '#165E83', kon: '#223A70', tetsu: '#17184B', asagi: '#00A3AF', wasure: '#89C3EB', shino: '#F19072', yamabuki: '#F8B500', akane: '#B7282E', kinari: '#FBFAF5', sumi: '#595857' };
const f2 = (v) => (+v).toFixed(2).replace(/\.?0+$/, '');

// optical spacing between ink boxes, then per-pair nudges (units of a 100-unit em)
const GAP = 1.5;
const NUDGE = { 'ケセ': 0, 'セン': -1, 'メメ': -2, 'メン': -1, 'ント': -3 };
const AMP = 4.5, K = 1.05, PH = 0.2;                     // the swell each letter rides; its tilt follows the slope

function setLine(glyphs, i0, scale) {
  let x = 0; const out = [];
  glyphs.forEach((g, j) => {
    const [x0, y0, x1, y1] = g.bb, w = (x1 - x0) * scale;
    if (j) x += GAP + (NUDGE[glyphs[j - 1].ch + g.ch] || 0);
    const i = i0 + j, ph = i * K + PH;
    out.push({ ...g, s: scale, x, w, y: AMP * Math.sin(ph), rot: -4 * Math.cos(ph) + (g.ch === 'ト' ? 3 : 0) });
    x += w;
  });
  return { L: out, w: x };
}

const lines = LAYOUT === 'stack'
  ? [{ ...setLine(KANA.slice(0, 3), 0, 1.0), dx: 0, dy: 0 }, { ...setLine(KANA.slice(3), 3, 1.08), dx: 0, dy: 104 }]
  : [{ ...setLine(KANA, 0, 1.0), dx: 0, dy: 0 }];
const W = Math.max(...lines.map((l) => l.w));
if (LAYOUT === 'stack') { lines[0].dx = 2; lines[1].dx = (W - lines[1].w) / 2; }   // line 1 sits left; the fish takes its right

const all = [];
lines.forEach((ln, li) => ln.L.forEach((g) => all.push({ ...g, li, X: ln.dx + g.x, Y: ln.dy + g.y })));
const tf = (g) => {
  const [x0] = g.bb, cx = g.X + g.w / 2, cy = g.Y - 38 * g.s;
  return `translate(${f2(g.X - x0 * g.s)} ${f2(g.Y)}) scale(${g.s})`.replace(/^/, `rotate(${f2(g.rot)} ${f2(cx)} ${f2(cy)}) `);
};
const tops = all.map((g) => g.Y + g.bb[1] * g.s), bots = all.map((g) => g.Y + g.bb[3] * g.s);
const top = Math.min(...tops), bot = Math.max(...bots);

const S1 = 6.5, S2 = 5, EX = 8;                           // navy outline, kinari edge, extrude depth
const defs = all.map((g, i) => `<path id="l${i}" d="${g.d}" transform="${tf(g)}" data-base="${tf(g)}" data-cx="${f2(g.X + g.w / 2)}" data-cy="${f2(g.Y - 38 * g.s)}" data-bot="${f2(g.Y + g.bb[3] * g.s)}" data-li="${g.li}"/>`).join('');
const uses = all.map((_, i) => `<use href="#l${i}"/>`).join('');

// the sea level inside each line (one global level per line, so letters bob through it when animated)
const wave = (x0, x1, y0, a, f, ph) => { let d = `M${f2(x0)} ${f2(y0)}`; for (let X = x0; X <= x1 + 6; X += 5) d += `L${f2(X)} ${f2(y0 + a * Math.sin(X / f + ph))}`; return d; };
const seas = lines.map((ln, li) => {
  const lt = Math.min(...all.filter((g) => g.li === li).map((g) => g.Y + g.bb[1] * g.s)), lb = Math.max(...all.filter((g) => g.li === li).map((g) => g.Y + g.bb[3] * g.s));
  const y = lt + (lb - lt) * 0.58, crest = wave(-40, W + 40, y, 2.6, 17, li * 1.7);
  return { y, lb, crest, body: crest + `L${W + 46} ${f2(lb + 30)}L-40 ${f2(lb + 30)}Z` };
});

// 青海波 (seigaiha) tile: concentric arcs in two offset rows
const arcs = (cx, cy) => [9, 6, 3].map((r) => `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}"/>`).join('');
const sgh = `<pattern id="sgh" width="20" height="10" patternUnits="userSpaceOnUse"><g fill="none" stroke="#fff" stroke-width="1">${arcs(0, 10)}${arcs(20, 10)}${arcs(10, 5)}</g></pattern>`;

// an original leaping カツオ: torpedo body, deep crescent tail, first dorsal fin, finlets, the belly stripes.
// v4: it must read as a fish at a glance over the town, so it is drawn like the letters: a soft 鉄紺 drop, a thick 生成り keyline,
// a 紺 line, then a 藍 back over a 生成り belly with 紺 stripes (v3's navy body melted into the night and read as a smudge).
const FISH = {
  body: 'M-44 0C-36 -10 -16 -16 8 -15C26 -14 40 -8 49 -1.5C51 0 51 2 49 3.5C40 10 24 14 6 14C-16 14 -34 9 -44 0Z',
  tail: 'M-43 0C-50 -7 -57 -17 -61 -25C-54 -22 -48 -14 -44 -7C-47 -15 -49 -22 -49 -27C-44 -19 -42 -10 -41 -2C-44 6 -50 16 -57 23C-50 21 -45 13 -42 5Z',
  fin: 'M-6 -13C-2 -23 6 -28 13 -29C11 -22 9 -17 9 -14Z',
};
const fishShape = `<path d="${FISH.body}"/><path d="${FISH.tail}"/><path d="${FISH.fin}"/>`;
const katsuo = (tx, ty, sc, r) => `<g class="fish" transform="translate(${f2(tx)} ${f2(ty)}) rotate(${r}) scale(${sc})">
 <g fill="${C.tetsu}" stroke="${C.tetsu}" stroke-width="14" stroke-linejoin="round" opacity=".32" transform="translate(1 5)">${fishShape}</g>
 <g stroke="${C.kinari}" stroke-width="13" stroke-linejoin="round" fill="${C.kinari}">${fishShape}</g>
 <g stroke="${C.kon}" stroke-width="4" stroke-linejoin="round" fill="${C.kon}">${fishShape}</g>
 <path d="${FISH.body}" fill="${C.ai}"/>
 <path d="M-42 1.5C-32 7 -14 11.5 6 11.5C24 11.5 38 7 47 2.5C38 5 24 6.5 6 6.5C-12 6.5 -30 4.5 -42 1.5Z" fill="${C.kinari}" transform="translate(0 -1.6) scale(1 1.25)"/>
 <path d="M-30 5.2C-12 8.2 8 9 30 6M-24 8.6C-8 10.6 10 11 26 8.8" fill="none" stroke="${C.kon}" stroke-width="1.8" stroke-linecap="round"/>
 <path d="M-36 -5.5C-20 -10.5 4 -12.5 26 -9" fill="none" stroke="${C.kinari}" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>
 <path d="M-30 -10L-27 -13L-25 -9.5M-21 -12L-18 -15L-16 -11.5" fill="${C.kon}" stroke="${C.kon}" stroke-width="1.4" stroke-linejoin="round"/>
 <circle cx="37" cy="-3.5" r="3.6" fill="${C.kinari}"/><circle cx="37.8" cy="-3.5" r="2.1" fill="${C.tetsu}"/><circle cx="38.6" cy="-4.3" r=".75" fill="#fff"/>
 <path d="M30 -6C31 -2 31 2 29.5 6" fill="none" stroke="${C.kon}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
</g>`;

// the splash it leaves: a curl of water and drops (kinari with a navy line, like the letters)
const splash = (x, y) => `<g class="splash" stroke="${C.kon}" stroke-width="2.4" fill="${C.kinari}" stroke-linejoin="round">
 <path d="M${x - 16} ${y}C${x - 12} ${y - 10} ${x - 4} ${y - 14} ${x + 4} ${y - 12}C${x - 2} ${y - 9} ${x - 5} ${y - 4} ${x - 4} ${y}Z"/>
 <circle cx="${x + 10}" cy="${y - 20}" r="3.6"/><circle cx="${x + 1}" cy="${y - 27}" r="2.8"/><circle cx="${x + 16}" cy="${y - 9}" r="2.6"/>
</g>`;

const fills = { sea: [C.kinari, '#ffffff'], sun: [C.yamabuki, '#ffd56b'] }[V];

// sheen: one soft highlight near each letter's upper left, clipped to the letter
const sheen = all.map((g, i) => {
  const cx = g.X + g.w * 0.3, cy = g.Y + g.bb[1] * g.s + 13;
  return `<g clip-path="url(#c${i})"><ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(g.w * 0.24)}" ry="5" transform="rotate(${f2(g.rot - 16)} ${f2(cx)} ${f2(cy)})" fill="#fff" opacity=".75"/></g>`;
}).join('');

// the English line in outlines (Dela Gothic One), tracked
const subSize = 0.2, track = 7.2;
let sx = 0; const subG = SUB.map((g) => { const p = { ...g, x: sx }; sx += g.adv * subSize + (g.ch === ' ' ? 4 : track); return p; });
const subW = sx - track;
const subY = bot + EX + 34;
const sub = `<g class="sub" transform="translate(${f2((W - subW) / 2)} ${f2(subY)}) scale(${subSize})">${subG.filter((g) => g.d).map((g) => `<path d="${g.d}" transform="translate(${f2(g.x / subSize)} 0)"/>`).join('')}</g>`;
const subLineY = subY - 7;
const rules = `<g class="rules" stroke="${C.kon}" stroke-width="2.2" stroke-linecap="round"><path d="M${f2((W - subW) / 2 - 46)} ${f2(subLineY)}H${f2((W - subW) / 2 - 14)}M${f2((W + subW) / 2 + 14)} ${f2(subLineY)}H${f2((W + subW) / 2 + 46)}"/></g>`;

const pad = S1 + S2 + 20;
const FISH_SC = 0.8;                                      // v4: up from 0.62, so the カツオ reads at phone size
const fishX = LAYOUT === 'stack' ? lines[0].dx + lines[0].w + 42 : W * 0.55, fishY = LAYOUT === 'stack' ? top + 22 : top - 22;
const vb = [-pad - 6, Math.min(top, fishY - 40) - pad, W + 2 * pad + 12, subY + 14 - (Math.min(top, fishY - 40) - pad)];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(f2).join(' ')}" width="${Math.round(vb[2] * 2)}" height="${Math.round(vb[3] * 2)}" role="img" aria-label="ケセンメメント KesenMemento">
<defs>${defs}<g id="word">${uses}</g><clipPath id="cw">${uses}</clipPath>${all.map((_, i) => `<clipPath id="c${i}"><use href="#l${i}"/></clipPath>`).join('')}
<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fills[1]}"/><stop offset="1" stop-color="${fills[0]}"/></linearGradient>
${seas.map((s, i) => `<linearGradient id="gw${i}" x1="0" y1="${f2(s.y)}" x2="0" y2="${f2(s.lb)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.asagi}"/><stop offset="1" stop-color="${C.ai}"/></linearGradient>`).join('')}
${sgh}<filter id="soft" x="-10%" y="-20%" width="120%" height="150%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<g class="shadow" opacity=".3" transform="translate(0 ${EX + 7})" filter="url(#soft)"><use href="#word" fill="${C.tetsu}" stroke="${C.tetsu}" stroke-width="${2 * (S1 + S2)}" stroke-linejoin="round"/></g>
<g class="extrude">${[...Array(EX)].map((_, k) => `<use href="#word" transform="translate(0 ${EX - k})" fill="${C.tetsu}" stroke="${C.tetsu}" stroke-width="${2 * (S1 + S2)}" stroke-linejoin="round"/>`).join('')}</g>
<use class="edge" href="#word" fill="${C.kinari}" stroke="${C.kinari}" stroke-width="${2 * (S1 + S2)}" stroke-linejoin="round"/>
<use class="outline" href="#word" fill="${C.kon}" stroke="${C.kon}" stroke-width="${2 * S1}" stroke-linejoin="round"/>
<use class="fill" href="#word" fill="url(#gt)"/>
<g class="sea" clip-path="url(#cw)">${seas.map((s, i) => `<g class="sealine" data-y="${f2(s.y)}" data-lb="${f2(s.lb)}" data-ph="${f2(i * 1.7)}"><path class="sb" d="${s.body}" fill="url(#gw${i})"/><path class="sp" d="${s.body}" fill="url(#sgh)" opacity=".2"/><path class="sc" d="${s.crest}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></g>`).join('')}</g>
<g class="sheen">${sheen}</g>
<g class="shine" clip-path="url(#cw)"><rect x="-60" y="${f2(top - 40)}" width="26" height="${f2(bot - top + 80)}" fill="#fff" opacity=".55" transform="skewX(-22)"/><rect x="-24" y="${f2(top - 40)}" width="8" height="${f2(bot - top + 80)}" fill="#fff" opacity=".45" transform="skewX(-22)"/></g>
${splash(fishX - 40, fishY + 34)}${katsuo(fishX, fishY, FISH_SC, -26)}
<g class="spark" opacity="0"><path d="M0 -14C1.5 -4 4 -1.5 14 0C4 1.5 1.5 4 0 14C-1.5 4 -4 1.5 -14 0C-4 -1.5 -1.5 -4 0 -14Z" fill="#fff" stroke="${C.kon}" stroke-width="1.6" stroke-linejoin="round"/></g>
<metadata id="logo-meta">${JSON.stringify({ W, pad: 40, wave: { a: 2.6, f: 17 }, fish: { x: fishX, y: fishY, sc: FISH_SC, r: -26 }, splash: { x: fishX - 40, y: fishY + 34 }, top, bot, sub: { y: subY, w: subW } })}</metadata>
<g fill="${C.kon}" stroke="${C.kinari}" stroke-width="22" paint-order="stroke" stroke-linejoin="round">${sub}</g>${rules}
</svg>`;
return svg;
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../src/anime/assets/loader');
export function writeLogos(dir = OUT) {
  writeFileSync(join(dir, 'title-logo-sun.svg'), logoSvg('sun', 'stack'));
  writeFileSync(join(dir, 'title-logo-sea.svg'), logoSvg('sea', 'stack'));
}

if (import.meta.main) {
  writeLogos();
  console.error('wrote title-logo-sun.svg and title-logo-sea.svg');
}
