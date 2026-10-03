// [ship:acts] ACT 3, 帰港: the TRUE chain of the catch (dossier section 5, "How the catch gets to Japan").
//
// She does NOT sail home with the fish. The frozen catch moves at Las Palmas (her overseas base) into reefer containers
// (or reefer carriers), lands mostly at Shimizu, a bonded port where every fish is weighed on leaving (1 kg over the
// declared catch: the licence is lost, the master faces fines or prison; Usui's slide 79), while the ship and crew come
// home to Kesennuma under 大漁旗 for refit and crew change. The player's tagged fish then becomes a card:
// 「まぐろの日は北かつまぐろ屋へ」 (北かつまぐろ屋 海の市店, 魚市場前7-13), with no discount promise.
//
//   CHAIN                 the steps in order, with their i18n keys (tested: exactly the acts.js CHAIN_ORDER)
//   chainCards(data)      the card models for the UI (tags, weights, the weigh-in rows)
//   drawChainArt(state, g, w, h, data)   a flat anime illustration on a 2D canvas (no photos, no logos)
//   SHOP                  北かつまぐろ屋 海の市店: its place in data/anime/layout.json and a Living City camera link
import { weighIn, RULES } from './acts.js';

export const CHAIN = [
  { state: 'TRANSSHIP_LAS_PALMAS', title: 'ship.chain.lp.title', body: 'ship.chain.lp.body', fact: 'ship.chain.lp.fact', carrier: 'reefer', withCatch: true },
  { state: 'REEFER', title: 'ship.chain.reefer.title', body: 'ship.chain.reefer.body', fact: 'ship.chain.reefer.fact', carrier: 'container', withCatch: true },
  { state: 'SHIMIZU_WEIGH', title: 'ship.chain.shimizu.title', body: 'ship.chain.shimizu.body', fact: 'ship.chain.shimizu.fact', carrier: 'truck', withCatch: true },
  { state: 'HOMECOMING', title: 'ship.chain.home.title', body: 'ship.chain.home.body', fact: 'ship.chain.home.fact', carrier: 'ship', withCatch: false },
  { state: 'CARD', title: 'ship.card.title', body: 'ship.card.body', fact: 'ship.card.fact', carrier: null, withCatch: false },
];

/** 北かつまぐろ屋 海の市店 (OSM node n7181952808, layout place p1m5usud, inside the 海の市 lot 16/58541/25069/401). */
export const SHOP = {
  id: 'p1m5usud', name: '北かつまぐろ屋 海の市店', nameEn: 'Kitakatsu Maguroya (Umi-no-Ichi)', address: '気仙沼市 魚市場前7-13', x: 389.7, z: 675, lot: '16/58541/25069/401',
  // a drone view over the 海の市 roof toward the shop's side, for ?cam= (main.js camSpec 'x,y,z>lx,ly,lz')
  cam: { pos: [452, 38, 742], look: [389.7, 6, 675] },
};
/** A Living City link that opens the camera on the shop (same page, ?cam=). */
export function shopLink(base = '') {
  const c = SHOP.cam;
  return `${base}?cam=${c.pos.join(',')}>${c.look.join(',')}`;
}

/** Card models for the UI. */
export function chainCards(data) {
  const tagged = (data?.kept || []).filter((f) => f.tag);
  const kg = Math.round(tagged.reduce((s, f) => s + f.kg, 0) * 10) / 10;
  const w = weighIn(data || { kept: [] });
  return CHAIN.map((c) => ({
    ...c,
    tags: c.state === 'CARD' || c.state === 'SHIMIZU_WEIGH' ? tagged.map((f) => f.tag) : [],
    vars: { n: tagged.length, kg, declared: w.declared, weighed: w.weighed, freezeC: RULES.freezeC },
    rows: c.state === 'SHIMIZU_WEIGH' ? w.rows : null,
    link: c.state === 'CARD' ? shopLink() : null,
  }));
}

// ------------------------------------------------------------------------------------------------ illustrations
const INK = '#2b2a3a';
function sky(g, w, h, top, bottom) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
function sea(g, w, h, y, c1, c2) {
  g.fillStyle = c1; g.fillRect(0, y, w, h - y);
  g.strokeStyle = c2; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const yy = y + 8 + i * ((h - y) / 9); g.beginPath(); for (let x = -20; x < w + 20; x += 40) { g.moveTo(x + (i % 2) * 20, yy); g.quadraticCurveTo(x + 10 + (i % 2) * 20, yy - 3, x + 20 + (i % 2) * 20, yy); } g.stroke(); }
}
/** 第一昭福丸 in profile from the dossier's measured stations (s aft of the stem, h above the waterline), plain livery. */
export function drawShip(g, x0, wl, scale, { flags = false, facing = 1 } = {}) {
  const X = (s) => x0 + facing * (58.6 / 2 - s) * scale, Y = (h) => wl - h * scale;
  g.save(); g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = Math.max(1.2, scale * 0.12);
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([s, h], i) => (i ? g.lineTo(X(s), Y(h)) : g.moveTo(X(s), Y(h)))); g.closePath(); g.fillStyle = fill; g.fill(); g.stroke(); };
  poly([[0, 6.2], [2.3, 0], [58.6, 0], [58.6, 6], [44, 5.6], [28, 5.0], [10, 5.4]], '#f2f3f1');                 // hull side
  poly([[2.3, 0], [3.5, -1.2], [56, -1.2], [58.6, 0]], '#8c2b2b');                                                     // antifouling
  poly([[0.6, 5.9], [3.1, 4.7], [3.1, 5.9]], '#16181f');                                                               // bow wedge
  poly([[28.3, 5.0], [28.3, 10.9], [40, 10.9], [40, 5.0]], '#f2f3f1');                                                 // bridge house
  g.fillStyle = '#2b3550'; g.fillRect(Math.min(X(28.8), X(33)), Y(10.2), Math.abs(X(33) - X(28.8)), 0.9 * scale);     // wheelhouse windows
  g.fillStyle = '#c8202a'; g.fillRect(Math.min(X(28.3), X(40)), Y(9.2), Math.abs(X(40) - X(28.3)), 0.35 * scale);     // red band
  poly([[44, 5.6], [44, 8.7], [58, 8.7], [58.6, 6]], '#f2f3f1');                                                       // aft shelter house
  poly([[47.2, 8.7], [47.2, 10.5], [48.6, 10.5], [48.6, 8.7]], '#f2f3f1');                                             // funnel
  g.fillStyle = '#16181f'; g.fillRect(Math.min(X(47.2), X(48.6)), Y(10.5), Math.abs(X(48.6) - X(47.2)), 0.5 * scale);
  g.beginPath(); for (const [s, top] of [[14.2, 16.1], [42.8, 20.7], [53.7, 19.1]]) { g.moveTo(X(s), Y(s === 14.2 ? 5.2 : s === 42.8 ? 10.9 : 8.7)); g.lineTo(X(s), Y(top)); } g.stroke();
  g.beginPath(); g.moveTo(X(41.6), Y(20)); g.lineTo(X(44), Y(20)); g.moveTo(X(13.2), Y(14.5)); g.lineTo(X(15.2), Y(14.5)); g.stroke();
  if (flags) {
    const cols = ['#d9463b', '#2f64b5', '#f2c230', '#3f8f5b', '#d9463b', '#f2c230'];
    for (let i = 0; i < 6; i++) { const s = 14.2 + (42.8 - 14.2) * (i + 0.5) / 6, hh = 16 + (20 - 16) * (i + 0.5) / 6 - 1.2; g.fillStyle = cols[i]; g.fillRect(X(s) - scale * 1.1, Y(hh), scale * 2.2, scale * 1.5); g.strokeRect(X(s) - scale * 1.1, Y(hh), scale * 2.2, scale * 1.5); }
  }
  g.restore();
}
function container(g, x, y, w, h, c, label) {
  g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = 2; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(x + (w * i) / 10, y + 3); g.lineTo(x + (w * i) / 10, y + h - 3); g.stroke(); }
  if (label) { g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(h * 0.26)}px "Noto Sans JP", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2); }
}
function frozenTuna(g, x, y, l) {
  g.fillStyle = '#e7eef3'; g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.ellipse(x, y, l / 2, l * 0.14, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - l / 2, y); g.lineTo(x - l / 2 - l * 0.12, y - l * 0.12); g.lineTo(x - l / 2 - l * 0.12, y + l * 0.12); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#2f6fd6'; g.fillRect(x - l * 0.42, y - l * 0.16, l * 0.05, l * 0.32);   // the blue tag at the tail stock
}

export function drawChainArt(state, g, w, h, data = {}) {
  g.save();
  if (state === 'TRANSSHIP_LAS_PALMAS') {
    sky(g, w, h, '#8cc3ea', '#ffe1b8');
    g.fillStyle = '#9a7f86'; g.beginPath(); g.moveTo(w * 0.45, h * 0.58); g.lineTo(w * 0.62, h * 0.3); g.lineTo(w * 0.7, h * 0.36); g.lineTo(w * 0.86, h * 0.26); g.lineTo(w * 1.05, h * 0.58); g.fill();   // volcanic ridge
    g.fillStyle = '#efe7d6'; for (let i = 0; i < 14; i++) g.fillRect(w * (0.5 + i * 0.035), h * (0.52 - (i % 4) * 0.02), w * 0.025, h * 0.06);   // town on the hill
    sea(g, w, h, h * 0.58, '#3d7fa8', '#6aa6c9');
    g.fillStyle = '#c9c4b8'; g.fillRect(w * 0.48, h * 0.62, w * 0.52, h * 0.1); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(w * 0.48, h * 0.62, w * 0.52, h * 0.1);   // quay
    container(g, w * 0.66, h * 0.5, w * 0.16, h * 0.12, '#f3f6f8', 'REEFER −60°C');
    container(g, w * 0.82, h * 0.5, w * 0.16, h * 0.12, '#2f6fae', 'REEFER');
    container(g, w * 0.74, h * 0.38, w * 0.16, h * 0.12, '#f3f6f8', '');
    // crane and sling
    g.strokeStyle = '#d0453b'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.56, h * 0.62); g.lineTo(w * 0.56, h * 0.12); g.lineTo(w * 0.36, h * 0.18); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w * 0.42, h * 0.165); g.lineTo(w * 0.42, h * 0.36); g.stroke();
    frozenTuna(g, w * 0.42, h * 0.39, w * 0.09); frozenTuna(g, w * 0.43, h * 0.43, w * 0.085);
    drawShip(g, w * 0.24, h * 0.66, w * 0.0068, { facing: 1 });
  } else if (state === 'REEFER') {
    sky(g, w, h, '#6fa9d6', '#d8ecf6');
    sea(g, w, h, h * 0.6, '#2d6a93', '#5a96bb');
    // the schematic leg: Las Palmas -> 清水 (no map, no coordinates)
    g.setLineDash([8, 8]); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.08, h * 0.3); g.quadraticCurveTo(w * 0.5, h * 0.02, w * 0.92, h * 0.3); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(h * 0.06)}px "Noto Sans JP", sans-serif`; g.textAlign = 'left'; g.fillText('Las Palmas', w * 0.04, h * 0.38); g.textAlign = 'right'; g.fillText('清水 Shimizu', w * 0.96, h * 0.38);
    // a container ship
    g.fillStyle = '#2b3f73'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.2, h * 0.6); g.lineTo(w * 0.24, h * 0.72); g.lineTo(w * 0.8, h * 0.72); g.lineTo(w * 0.84, h * 0.58); g.closePath(); g.fill(); g.stroke();
    const cols = ['#f3f6f8', '#2f6fae', '#d9733c', '#f3f6f8', '#3f8f5b', '#2f6fae', '#f3f6f8'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) container(g, w * (0.27 + i * 0.07), h * (0.5 - r * 0.07), w * 0.068, h * 0.068, cols[(i + r * 2) % cols.length], r === 0 && i === 3 ? '−60°C' : '');
    g.fillStyle = '#f2f3f1'; g.fillRect(w * 0.73, h * 0.36, w * 0.06, h * 0.2); g.strokeRect(w * 0.73, h * 0.36, w * 0.06, h * 0.2);
  } else if (state === 'SHIMIZU_WEIGH') {
    sky(g, w, h, '#8fc0e6', '#f3e6d6');
    g.fillStyle = '#7d8fb3'; g.beginPath(); g.moveTo(w * 0.05, h * 0.55); g.lineTo(w * 0.3, h * 0.16); g.lineTo(w * 0.55, h * 0.55); g.fill();   // 富士山
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(w * 0.235, h * 0.26); g.lineTo(w * 0.3, h * 0.16); g.lineTo(w * 0.365, h * 0.26); g.lineTo(w * 0.33, h * 0.24); g.lineTo(w * 0.3, h * 0.27); g.lineTo(w * 0.27, h * 0.24); g.fill();
    g.fillStyle = '#d8d6cf'; g.fillRect(w * 0.55, h * 0.3, w * 0.45, h * 0.3); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(w * 0.55, h * 0.3, w * 0.45, h * 0.3);   // bonded warehouse
    g.fillStyle = '#2b3f73'; g.fillRect(w * 0.6, h * 0.33, w * 0.16, h * 0.07); g.fillStyle = '#ffffff'; g.font = `900 ${Math.round(h * 0.05)}px "Noto Sans JP", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('保税', w * 0.68, h * 0.365);
    g.fillStyle = '#5b5e66'; g.fillRect(0, h * 0.6, w, h * 0.4);   // apron
    g.strokeStyle = '#f2c230'; g.lineWidth = 6; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(w * (0.1 + i * 0.12), h * 0.98); g.lineTo(w * (0.16 + i * 0.12), h * 0.72); g.stroke(); }
    g.fillStyle = '#7c8088'; g.fillRect(w * 0.12, h * 0.7, w * 0.62, h * 0.05); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(w * 0.12, h * 0.7, w * 0.62, h * 0.05);   // weighbridge
    container(g, w * 0.14, h * 0.5, w * 0.42, h * 0.17, '#2f64b5', '');
    g.fillStyle = '#2b3550'; g.fillRect(w * 0.57, h * 0.52, w * 0.12, h * 0.17); g.fillStyle = '#e2b54a'; g.fillRect(w * 0.57, h * 0.6, w * 0.12, h * 0.03); g.strokeRect(w * 0.57, h * 0.52, w * 0.12, h * 0.17);
    for (const xx of [0.2, 0.3, 0.47, 0.62, 0.66]) { g.fillStyle = '#2a2a33'; g.beginPath(); g.arc(w * xx, h * 0.72, h * 0.03, 0, 7); g.fill(); }
    // the scale display: the declared catch, every kg checked
    g.fillStyle = '#1d2230'; g.fillRect(w * 0.77, h * 0.64, w * 0.2, h * 0.14); g.fillStyle = '#8ef0a8'; g.font = `700 ${Math.round(h * 0.07)}px ui-monospace, monospace`; g.textAlign = 'center';
    g.fillText(`${(data.weighed ?? 0).toFixed(1)} kg`, w * 0.87, h * 0.715);
  } else if (state === 'HOMECOMING') {
    sky(g, w, h, '#86bde6', '#fde6c8');
    sea(g, w, h, h * 0.62, '#3d84ad', '#79b2d2');
    g.fillStyle = '#4d6457'; g.beginPath(); g.moveTo(0, h * 0.62); g.quadraticCurveTo(w * 0.3, h * 0.28, w * 0.55, h * 0.45); g.quadraticCurveTo(w * 0.8, h * 0.3, w, h * 0.5); g.lineTo(w, h * 0.62); g.fill();   // 安波山 and the hills
    drawShip(g, w * 0.5, h * 0.74, w * 0.011, { flags: true, facing: -1 });
  } else {
    sky(g, w, h, '#f6e6c8', '#f3d3b0');
    frozenTuna(g, w * 0.5, h * 0.5, w * 0.5);
  }
  g.restore();
}
