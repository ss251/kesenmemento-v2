// [v3:town] vendored from Sakuragaoka Station src/world/poles/atlas.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:fix] leftover Sakura text replaced with local fictional names (魚町 plates, コーポうみねこ, みなと不動産, Kesennuma Sta.; no phone numbers)
// Canvas atlases for the poles module (電柱): concrete shaft strip, tiger-stripe sleeve, yellow guard,
// transformer wrap, enamel pole ads (巻付広告), telecom plates (atlas A, opaque) and pole number plates,
// stickers, pole-mounted signs (atlas B, alpha-tested die-cuts). All text is fictional-brand Japanese.
import { fitFontSize } from '../../../core/textures.js';   // [v4:polish1]

export const AW = 1024;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- rects (px, top-left origin)
export const RA = {
  shaft: [1, 0, 127, 1024],
  white: [128, 0, 160, 32],
  sleeve: [160, 0, 416, 256],
  cover: [416, 0, 480, 256],
  trans: [128, 256, 448, 512],
  guard: [160, 32, 416, 256],     // re-use of the sleeve stripes for guy guards
};
export const adRect = (i) => { const c = i % 6, r = (i / 6) | 0; return [480 + c * 88, r * 448, 568 + c * 88, 448 + r * 448]; };
export const telPlateRect = (i) => { const c = i % 5, r = (i / 5) | 0; return [128 + c * 64, 512 + r * 160, 192 + c * 64, 672 + r * 160]; };
export const plateRect = (i) => { const c = i % 21, r = (i / 21) | 0; return [c * 48, 384 + r * 192, 48 + c * 48, 576 + r * 192]; };
export const RB = {
  mascot0: [0, 0, 160, 160], mascot1: [160, 0, 320, 160], mascot2: [320, 0, 480, 160],
  camera: [480, 0, 608, 96], suido: [480, 96, 608, 160],
  harigami: [608, 0, 672, 160], poisute: [672, 0, 768, 128], hittakuri: [768, 0, 864, 128],
  tako: [864, 0, 960, 144], scrap: [960, 0, 1024, 64], scrap2: [960, 64, 1024, 128],
  diamond: [0, 160, 192, 352], aux: [192, 160, 384, 224], station: [192, 224, 448, 320],
  hydrant: [448, 160, 544, 320], dog: [544, 160, 656, 272], koatsu: [656, 160, 784, 224],
  noboruna: [784, 160, 880, 288], kodomo: [880, 144, 976, 272], lampTag: [656, 224, 784, 256],
};
/** px rect -> uv rect [u0,v0,u1,v1] (canvas flipY). */
export const uvOf = (r) => [r[0] / AW, 1 - r[3] / AW, r[2] / AW, 1 - r[1] / AW];
export const WHITE_UV = [(RA.white[0] + 16) / AW, 1 - (RA.white[1] + 16) / AW];

// ---------------------------------------------------------------- ad content (fictional advertisers)
export const ADS = [
  { band: '八日町', bg: '#fbf5ee', fg: '#c64a6e', main: 'みなと内科', sub: '内科・小児科', foot: 'この先100m', arrow: 1 },
  { band: '魚町', bg: '#2f6fb5', fg: '#ffffff', main: '水道修理', sub: '内湾水道サービス', foot: '24時間受付' },
  { band: '八日町', bg: '#f5f0dc', fg: '#2f7a4f', main: 'かもめ不動産', sub: '賃貸・売買・管理', foot: '内湾 徒歩2分' },
  { band: '南町', bg: '#ef9a47', fg: '#ffffff', main: '学習塾みなとゼミ', sub: '小・中・高 個別指導', foot: '無料体験' },
  { band: '魚町', bg: '#fff3cf', fg: '#8a5a1f', main: '汐見歯科医院', sub: '予約優先', foot: '50m', arrow: -1 },
  { band: '八日町', bg: '#e6f1f6', fg: '#2d5d86', main: '白波クリーニング', sub: 'ワイシャツ一枚から', foot: '内湾店' },
  { band: '南町', bg: '#6d5690', fg: '#ffffff', main: '安波整骨院', sub: '各種保険取扱', foot: 'この先右折', arrow: 1 },
  { band: '魚町', bg: '#f3ece0', fg: '#8c3b2e', main: '御食事処 汐騒', sub: '海鮮丼・定食', foot: 'この先30m', arrow: 1 },
  { band: '八日町', bg: '#3f8f5b', fg: '#ffffff', main: 'はまなす薬局', sub: '処方せん受付', foot: '駐車場有' },
  { band: '南町', bg: '#fbe4ec', fg: '#b3445f', main: '美容室なぎさ', sub: 'カット・カラー', foot: '予約制' },
  { band: '魚町', bg: '#f7f3e8', fg: '#2f64b5', main: 'うみねこ保育園', sub: '園児募集中', foot: '見学随時' },
  { band: '八日町', bg: '#394a6b', fg: '#f7e6b0', main: '書道教室', sub: '墨香会', foot: '体験レッスン' },
];

// ---------------------------------------------------------------- drawing helpers
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const ROT = 'ー－―〜～…→←';
const SMALL = 'ゃゅょっぁぃぅぇぉャュョッァィゥェォ';
/** vertical text, centred at cx, starting at top. */
function vtext(g, text, cx, top, size, font, weight = 700, gap = 1.04) {
  g.font = `${weight} ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let y = top + size * 0.5;
  for (const ch of text) {
    if (ch === ' ') { y += size * 0.45; continue; }
    if (ROT.includes(ch)) { g.save(); g.translate(cx, y); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }
    else if (SMALL.includes(ch)) g.fillText(ch, cx + size * 0.12, y - size * 0.1);
    else if ('、。'.includes(ch)) g.fillText(ch, cx + size * 0.34, y - size * 0.34);
    else g.fillText(ch, cx, y);
    y += size * gap;
  }
  return y;
}
const vlen = (t) => [...t].reduce((s, c) => s + (c === ' ' ? 0.45 : 1.04), 0);
function fit(g, text, x, y, maxW, size, font, weight = 700) {
  const s = fitFontSize(g, text, maxW, size, font, weight, 6);   // [v4:polish1] one cached measurement
  g.fillText(text, x, y); return s;
}
function flower(g, x, y, r, col, mid) {
  g.save(); g.translate(x, y); g.fillStyle = col;
  for (let i = 0; i < 5; i++) {
    g.save(); g.rotate(i * TAU / 5); g.beginPath();
    g.ellipse(0, -r * 0.52, r * 0.36, r * 0.52, 0, 0, TAU); g.fill();
    // petal notch
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(-r * 0.09, -r * 1.06); g.lineTo(0, -r * 0.86); g.lineTo(r * 0.09, -r * 1.06); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  g.fillStyle = mid; g.beginPath(); g.arc(0, 0, r * 0.22, 0, TAU); g.fill();
  g.restore();
}
function blob(g, x, y, r, rgb, a, wrapW, x0) {
  for (const ox of [-wrapW, 0, wrapW]) {
    const cx = x + ox; if (cx + r < x0 || cx - r > x0 + wrapW) continue;
    const gr = g.createRadialGradient(cx, y, 0, cx, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(cx - r, y - r, r * 2, r * 2);
  }
}

// ---------------------------------------------------------------- atlas A parts
function drawShaft(g, rnd) {
  const [x0, , x1] = [0, 0, 128]; const W = x1 - x0;
  g.save(); g.beginPath(); g.rect(0, 0, 128, 1024); g.clip();
  g.fillStyle = '#c9c7c0'; g.fillRect(0, 0, 128, 1024);
  // soft mottling (wraps horizontally)
  for (let i = 0; i < 110; i++) {
    const light = rnd() < 0.5;
    blob(g, rnd() * W, rnd() * 1024, 10 + rnd() * 40, light ? '226,224,217' : '160,157,151', light ? 0.28 : 0.16, W, 0);
  }
  // warm/cool wash patches
  for (let i = 0; i < 18; i++) blob(g, rnd() * W, rnd() * 1024, 30 + rnd() * 60, rnd() < 0.5 ? '205,196,182' : '184,190,198', 0.18, W, 0);
  // faint vertical rain streaks (from equipment above)
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W, y0 = rnd() * 820, len = 50 + rnd() * 280, w = 1 + rnd() * 2.5;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(128,124,120,0.16)'); gr.addColorStop(1, 'rgba(128,124,120,0)');
    g.fillStyle = gr; g.fillRect(x, y0, w, len);
  }
  // a few rust drips under the (implied) arm bolts near the top
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W, y0 = 20 + rnd() * 160, len = 30 + rnd() * 70;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(150,104,80,0.22)'); gr.addColorStop(1, 'rgba(150,104,80,0)');
    g.fillStyle = gr; g.fillRect(x, y0, 1.5, len);
  }
  // speckles (pits of spun concrete)
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rnd() < 0.55 ? 'rgba(118,114,110,0.22)' : 'rgba(238,236,230,0.3)';
    g.fillRect(rnd() * W, rnd() * 1024, 1, 1 + (rnd() < 0.2 ? 1 : 0));
  }
  // hairline cracks
  g.strokeStyle = 'rgba(120,116,112,0.22)'; g.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = rnd() * W, y = 150 + rnd() * 800; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 12; y += 4 + rnd() * 10; g.lineTo(x, y); }
    g.stroke();
  }
  // embossed maker marks band (faint horizontal line pair) at ~ 1/6 height
  g.fillStyle = 'rgba(150,147,141,0.22)'; g.fillRect(0, 880, W, 1); g.fillRect(0, 884, W, 1);
  // splash grime + moss at the foot
  let gr = g.createLinearGradient(0, 1024, 0, 930);
  gr.addColorStop(0, 'rgba(118,104,88,0.55)'); gr.addColorStop(1, 'rgba(118,104,88,0)');
  g.fillStyle = gr; g.fillRect(0, 930, W, 94);
  gr = g.createLinearGradient(0, 1024, 0, 995);
  gr.addColorStop(0, 'rgba(112,140,86,0.45)'); gr.addColorStop(1, 'rgba(112,140,86,0)');
  g.fillStyle = gr; g.fillRect(0, 995, W, 29);
  g.restore();
}

function drawSleeve(g, rnd, ox, oy) {
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
  g.fillStyle = '#f1c83c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3e3a46';
  for (let k = -6; k < 12; k++) {
    const x = k * 64; g.beginPath();
    g.moveTo(x, 0); g.lineTo(x + 30, 0); g.lineTo(x + 30 + 256, 256); g.lineTo(x + 256, 256); g.closePath(); g.fill();
  }
  // retro-reflective micro-prism sheen
  g.fillStyle = 'rgba(255,255,240,0.07)';
  for (let y = 0; y < 256; y += 5) g.fillRect(0, y, 256, 2);
  // gloss band
  const gl = g.createLinearGradient(0, 0, 0, 256);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.35, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(90,70,50,0.18)');
  g.fillStyle = gl; g.fillRect(0, 0, 256, 256);
  // scuffs (bicycles, shoes) and dirt near the bottom
  for (let i = 0; i < 40; i++) {
    const y = 150 + rnd() * 100, x = rnd() * 256;
    g.fillStyle = rnd() < 0.5 ? 'rgba(250,246,230,0.35)' : 'rgba(96,84,70,0.25)';
    g.fillRect(x, y, 3 + rnd() * 16, 1 + rnd() * 2);
  }
  for (let i = 0; i < 12; i++) blob(g, rnd() * 256, 200 + rnd() * 56, 10 + rnd() * 20, '110,96,80', 0.18, 256, 0);
  // folded tape edges
  g.fillStyle = 'rgba(70,62,52,0.45)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 253, 256, 3);
  g.restore();
}

function drawCover(g, rnd, ox, oy) {
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, 64, 256); g.clip();
  g.fillStyle = '#efc23b'; g.fillRect(0, 0, 64, 256);
  // vertical ribs of the moulded plastic guard
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = 'rgba(160,112,20,0.18)'; g.fillRect(x, 0, 3, 256);
    g.fillStyle = 'rgba(255,248,210,0.25)'; g.fillRect(x + 4, 0, 2, 256);
  }
  // black reflective band near the top (painted stripe)
  g.fillStyle = '#3e3a46'; g.fillRect(0, 34, 64, 22);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 38, 64, 3);
  // rims
  g.fillStyle = 'rgba(150,100,20,0.45)'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 250, 64, 6);
  // dirt splash
  const gr = g.createLinearGradient(0, 256, 0, 170);
  gr.addColorStop(0, 'rgba(110,92,70,0.45)'); gr.addColorStop(1, 'rgba(110,92,70,0)');
  g.fillStyle = gr; g.fillRect(0, 170, 64, 86);
  for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(255,250,230,0.3)'; g.fillRect(rnd() * 64, 120 + rnd() * 120, 2 + rnd() * 8, 1); }
  g.restore();
}

function drawTrans(g, rnd, F, ox, oy) {
  const W = 320, H = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, W, H); g.clip();
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#cdd2d4'); bg.addColorStop(1, '#b7bcbf');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, y0 = rnd() * 120, len = 60 + rnd() * 130;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(120,122,124,0.18)'); gr.addColorStop(1, 'rgba(120,122,124,0)');
    g.fillStyle = gr; g.fillRect(x, y0, 1.5 + rnd() * 2, len);
  }
  // capacity stencil + nameplate facing u = 0.5 (x = 160)
  g.save(); g.translate(160, 0); g.scale(0.62, 1);
  g.fillStyle = '#34405a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 92px ${F.sans}`; g.fillText('30', 0, 98);
  g.font = `700 22px ${F.sans}`; g.fillText('kVA', 0, 150);
  g.restore();
  g.fillStyle = '#eeeee8'; rr(g, 134, 176, 52, 40, 4); g.fill();
  g.strokeStyle = '#6d747c'; g.lineWidth = 1.5; rr(g, 134, 176, 52, 40, 4); g.stroke();
  g.fillStyle = '#3a3346'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'みなと電力', 160, 188, 46, 10, F.sans, 700);
  fit(g, '6600V/210V', 160, 204, 46, 8, F.sans, 500);
  // yellow 高圧注意 sticker beside it
  g.fillStyle = '#f2c230'; g.fillRect(196, 70, 30, 44);
  g.fillStyle = '#3a3346'; g.fillRect(196, 70, 30, 12);
  g.fillStyle = '#f2c230'; fit(g, '注意', 211, 76, 26, 10, F.sans, 900);
  g.fillStyle = '#3a3346'; vtext(g, '高圧', 211, 84, 13, F.sans, 900, 1.0);
  // top dark band
  g.fillStyle = 'rgba(80,84,92,0.35)'; g.fillRect(0, 0, W, 8);
  g.restore();
}

function drawAd(g, rect, ad, F, rnd) {
  const [x0, y0] = rect; const w = 88, h = 448;
  g.save(); g.translate(x0, y0); g.beginPath(); g.rect(0, 0, w, h); g.clip();
  g.fillStyle = '#6f7278'; g.fillRect(0, 0, w, h);
  g.fillStyle = ad.bg; rr(g, 2, 2, w - 4, h - 4, 6); g.fill();
  // address band (住居表示)
  g.fillStyle = '#2d5189'; rr(g, 2, 2, w - 4, 64, 6); g.fill(); g.fillRect(2, 40, w - 4, 26);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, '気仙沼市', w / 2, 20, 76, 18, F.sans, 700);
  fit(g, ad.band, w / 2, 46, 76, 22, F.sans, 900);
  // body
  const top = 78, bodyH = 292;
  g.fillStyle = ad.fg;
  if (ad.sub) {
    const s1 = Math.min(40, bodyH / vlen(ad.main)); vtext(g, ad.main, 55, top + (bodyH - s1 * vlen(ad.main)) / 2, s1, F.sans, 900);
    const s2 = Math.min(19, (bodyH - 10) / vlen(ad.sub)); g.globalAlpha = 0.9; vtext(g, ad.sub, 19, top + 6, s2, F.sans, 700); g.globalAlpha = 1;
  } else {
    const s1 = Math.min(46, bodyH / vlen(ad.main)); vtext(g, ad.main, w / 2, top + (bodyH - s1 * vlen(ad.main)) / 2, s1, F.sans, 900);
  }
  // footer
  g.fillStyle = 'rgba(255,255,255,0.78)'; g.fillRect(2, 380, w - 4, 66);
  g.fillStyle = '#3a3346'; g.textAlign = 'center';
  fit(g, ad.foot, w / 2, 402, 80, 17, F.sans, 700);
  if (ad.arrow) {
    g.fillStyle = ad.fg === '#ffffff' ? ad.bg : ad.fg;
    g.save(); g.translate(w / 2, 428); g.scale(ad.arrow, 1);
    g.beginPath(); g.moveTo(-24, -4); g.lineTo(8, -4); g.lineTo(8, -11); g.lineTo(24, 0); g.lineTo(8, 11); g.lineTo(8, 4); g.lineTo(-24, 4); g.closePath(); g.fill();
    g.restore();
  } else { g.globalAlpha = 0.6; fit(g, '内湾', w / 2, 428, 76, 12, F.sans, 500); g.globalAlpha = 1; }
  // enamel gloss & wear
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(10, 4, 6, h - 8);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(138,90,68,0.35)'; g.beginPath(); g.arc(rnd() < 0.5 ? 5 + rnd() * 6 : w - 5 - rnd() * 6, rnd() < 0.5 ? 5 + rnd() * 20 : h - 5 - rnd() * 20, 1 + rnd() * 2, 0, TAU); g.fill(); }
  g.fillStyle = '#9aa1a8'; for (const yy of [8, h - 8]) { g.beginPath(); g.arc(w / 2, yy, 2.5, 0, TAU); g.fill(); }
  g.restore();
}

function drawTelPlate(g, rect, tp, F) {
  const [x0, y0] = rect; const w = 64, h = 160;
  g.save(); g.translate(x0, y0);
  g.fillStyle = '#8e959c'; rr(g, 0, 0, w, h, 5); g.fill();
  g.fillStyle = '#e3e5e3'; rr(g, 2, 2, w - 4, h - 4, 4); g.fill();
  g.fillStyle = '#3b4658'; g.fillRect(2, 2, w - 4, 26);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'みなと通信', w / 2, 15, 56, 12, F.sans, 700);
  g.fillStyle = '#3a3346';
  vtext(g, tp.line, w / 2, 34, 22, F.sans, 700, 1.02);
  fit(g, tp.num, w / 2, 140, 56, 22, F.sans, 900);
  g.restore();
}

// ---------------------------------------------------------------- atlas B parts (alpha)
function drawPlate(g, rect, p, F) {
  const [x0, y0] = rect; const w = 48, h = 192;
  g.save(); g.translate(x0, y0);
  g.fillStyle = '#8e959c'; rr(g, 0, 0, w, h, 6); g.fill();
  g.fillStyle = '#f4f2ea'; rr(g, 2, 2, w - 4, h - 4, 5); g.fill();
  flower(g, w / 2, 15, 9, '#ea87a3', '#f5d76e');
  g.fillStyle = '#44587f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'みなと電力', w / 2, 32, 42, 10, F.sans, 700);
  g.fillStyle = '#2f3a52';
  const n = vlen(p.line), s = Math.min(26, 96 / n);
  vtext(g, p.line, w / 2, 42, s, F.sans, 900, 1.02);
  g.fillStyle = '#c23a4a'; g.fillRect(8, 144, w - 16, 2);
  g.fillStyle = '#2f3a52'; fit(g, String(p.num), w / 2, 164, 42, 28, F.sans, 900);
  g.fillStyle = '#6d747c'; fit(g, p.sub || '', w / 2, 183, 40, 10, F.sans, 500);
  g.restore();
}

function dieCut(g, draw) { // white sticker border via a fat stroke of the same path
  g.save(); g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; draw(); g.restore();
}

function drawMascot(g, rect, v, F) {
  const [x0, y0] = rect;
  g.save(); g.translate(x0, y0);
  // die-cut white border
  g.fillStyle = '#fbfaf7';
  g.beginPath(); g.arc(80, 72, 66, 0, TAU); g.fill();
  rr(g, 8, 110, 144, 44, 20); g.fill();
  if (v === 1) { g.beginPath(); g.ellipse(34, 30, 32, 22, 0, 0, TAU); g.fill(); }
  if (v === 2) { g.beginPath(); g.ellipse(124, 26, 34, 22, 0, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(200,190,200,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(80, 72, 65, 0.25 * Math.PI, 0.75 * Math.PI, true); g.stroke();
  // body (mochi-like round blossom spirit)
  g.fillStyle = '#f5a9c0'; g.beginPath(); g.ellipse(80, 80, 48, 42, 0, 0, TAU); g.fill();
  g.fillStyle = '#fbd6e0'; g.beginPath(); g.ellipse(80, 92, 29, 20, 0, 0, TAU); g.fill();
  g.strokeStyle = '#c85d7e'; g.lineWidth = 3; g.beginPath(); g.ellipse(80, 80, 48, 42, 0, 0, TAU); g.stroke();
  // little arms
  g.fillStyle = '#f5a9c0';
  g.beginPath(); g.ellipse(34, v === 1 ? 62 : 92, 9, 13, v === 1 ? -0.9 : 0.5, 0, TAU); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(126, 92, 9, 13, -0.5, 0, TAU); g.fill(); g.stroke();
  // blossom on the head
  flower(g, 100, 40, 19, '#ee7c9e', '#f7e27a');
  flower(g, 74, 38, 9, '#fbe9ef', '#f5c26a');
  // face
  g.fillStyle = '#3a3346';
  g.beginPath(); g.ellipse(64, 78, 5.5, 7.5, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(96, 78, 5.5, 7.5, 0, 0, TAU); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(66, 75, 2.2, 0, TAU); g.fill(); g.beginPath(); g.arc(98, 75, 2.2, 0, TAU); g.fill();
  g.fillStyle = 'rgba(242,110,140,0.7)';
  g.beginPath(); g.ellipse(51, 91, 8, 5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(109, 91, 8, 5, 0, 0, TAU); g.fill();
  g.strokeStyle = '#3a3346'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.arc(75, 89, 5, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  g.beginPath(); g.arc(85, 89, 5, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  // name ribbon
  g.fillStyle = v === 1 ? '#4f86c6' : '#e0507a'; rr(g, 14, 115, 132, 34, 15); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, v === 1 ? '気仙沼市' : 'かもめ', 80, 133, 120, 24, F.round, 700);
  if (v === 1) { g.fillStyle = '#e0507a'; fit(g, 'ようこそ!', 34, 30, 56, 15, F.round, 700); }
  if (v === 2) { g.fillStyle = '#3f8f5b'; fit(g, 'ゴミは', 124, 20, 60, 13, F.round, 700); fit(g, '持ちかえろ', 124, 36, 62, 12, F.round, 700); }
  g.restore();
}

function drawStickers(g, F, rnd) {
  const T = (r) => { g.save(); g.translate(r[0], r[1]); return [r[2] - r[0], r[3] - r[1]]; };
  const C = () => g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  drawMascot(g, RB.mascot0, 0, F); drawMascot(g, RB.mascot1, 1, F); drawMascot(g, RB.mascot2, 2, F);
  // 防犯カメラ作動中
  let [w, h] = T(RB.camera);
  g.fillStyle = '#f2c230'; rr(g, 1, 1, w - 2, h - 2, 6); g.fill();
  g.fillStyle = '#3a3346'; rr(g, 1, 1, w - 2, 30, 6); g.fill(); g.fillRect(1, 18, w - 2, 13);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fit(g, '防犯カメラ', w / 2, 17, w - 14, 20, F.sans, 900);
  g.fillStyle = '#3a3346'; fit(g, '作動中', w / 2 + 14, 55, 80, 26, F.sans, 900);
  g.fillRect(12, 46, 22, 14); g.beginPath(); g.moveTo(34, 50); g.lineTo(42, 45); g.lineTo(42, 61); g.lineTo(34, 56); g.fill(); g.fillRect(20, 60, 4, 8);
  fit(g, '八日町防犯協会', w / 2, 82, w - 12, 12, F.sans, 700);
  C();
  // 水のトラブル (classic plumbing sticker)
  [w, h] = T(RB.suido);
  g.fillStyle = '#f7d23a'; rr(g, 1, 1, w - 2, h - 2, 5); g.fill();
  g.fillStyle = '#2458a8'; fit(g, '水のトラブル', w / 2, 18, w - 12, 20, F.sans, 900);
  g.fillStyle = '#d9463b'; fit(g, 'すぐ行きます!', w / 2, 38, w - 14, 15, F.sans, 900);
  g.fillStyle = '#2458a8'; fit(g, '内湾水道 0226-00-7171', w / 2, 54, w - 10, 10, F.sans, 700);
  C();
  // はり紙禁止
  [w, h] = T(RB.harigami);
  g.fillStyle = '#fbfaf5'; g.fillRect(1, 1, w - 2, h - 2);
  g.strokeStyle = '#d9463b'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#d9463b'; vtext(g, 'はり紙禁止', w / 2, 12, 22, F.sans, 900, 1.02);
  g.fillStyle = '#44587f'; fit(g, 'みなと電力', w / 2, h - 14, w - 12, 10, F.sans, 700);
  C();
  // ポイ捨て禁止
  [w, h] = T(RB.poisute);
  g.fillStyle = '#3f8f5b'; rr(g, 1, 1, w - 2, h - 2, 8); g.fill();
  g.fillStyle = '#ffffff'; fit(g, 'ポイ捨て', w / 2, 22, w - 12, 20, F.sans, 900); fit(g, '禁止', w / 2, 46, w - 12, 22, F.sans, 900);
  g.beginPath(); g.arc(w / 2, 84, 20, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 6, 74, 12, 20); g.fillRect(w / 2 - 4, 70, 8, 4);
  g.save(); g.translate(w / 2, 84); g.rotate(-0.8); g.fillRect(-20, -2, 40, 4); g.restore();
  fit(g, '気仙沼市', w / 2, 116, w - 12, 12, F.sans, 700);
  C();
  // ひったくり注意
  [w, h] = T(RB.hittakuri);
  g.fillStyle = '#fbfaf5'; rr(g, 1, 1, w - 2, h - 2, 4); g.fill();
  g.fillStyle = '#d9463b'; rr(g, 1, 1, w - 2, 30, 4); g.fill(); g.fillRect(1, 20, w - 2, 11);
  g.fillStyle = '#ffffff'; fit(g, '注意!', w / 2, 16, w - 12, 22, F.sans, 900);
  g.fillStyle = '#3a3346'; fit(g, 'ひったくり', w / 2, 46, w - 10, 17, F.sans, 900);
  g.fillStyle = '#44587f'; fit(g, '自転車のカゴに', w / 2, 70, w - 10, 11, F.sans, 700); fit(g, 'ネットをかけよう', w / 2, 86, w - 10, 11, F.sans, 700);
  g.fillStyle = '#6d747c'; fit(g, '魚町防犯協会', w / 2, 112, w - 10, 10, F.sans, 700);
  C();
  // たこあげ・つり注意 (near the river)
  [w, h] = T(RB.tako);
  g.fillStyle = '#fbfaf5'; rr(g, 1, 1, w - 2, h - 2, 6); g.fill();
  g.strokeStyle = '#d9463b'; g.lineWidth = 3; rr(g, 4, 4, w - 8, h - 8, 5); g.stroke();
  g.fillStyle = '#ef9a47'; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2 + 16, 34); g.lineTo(w / 2, 58); g.lineTo(w / 2 - 16, 34); g.closePath(); g.fill();
  g.strokeStyle = '#3a3346'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w / 2, 58); g.bezierCurveTo(w / 2 + 12, 66, w / 2 - 12, 72, w / 2 + 4, 80); g.stroke();
  g.strokeStyle = '#d9463b'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, 36, 26, 0, TAU); g.moveTo(w / 2 - 18, 18); g.lineTo(w / 2 + 18, 54); g.stroke();
  g.fillStyle = '#d9463b'; fit(g, 'でんせんの', w / 2, 94, w - 12, 13, F.round, 700); fit(g, 'ちかくで', w / 2, 109, w - 12, 13, F.round, 700);
  fit(g, 'たこあげ・つり', w / 2, 124, w - 10, 12, F.round, 700);
  g.fillStyle = '#44587f'; fit(g, 'しないでね みなと電力', w / 2, 137, w - 10, 9, F.sans, 700);
  C();
  // old sticker scraps (torn paper remains)
  for (const r of [RB.scrap, RB.scrap2]) {
    [w, h] = T(r);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(244,240,228,0.95)' : 'rgba(226,222,208,0.95)';
      g.beginPath(); const cx = 8 + rnd() * (w - 16), cy = 8 + rnd() * (h - 16);
      g.moveTo(cx, cy); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const rr_ = 4 + rnd() * 9; g.lineTo(cx + Math.cos(a) * rr_, cy + Math.sin(a) * rr_); }
      g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(200,110,120,0.6)'; g.fillRect(10, 20, 14, 3);
    C();
  }
  // 通学路 diamond (学校、幼稚園、保育所等あり)
  [w, h] = T(RB.diamond);
  const dia = (inset) => { g.beginPath(); g.moveTo(w / 2, inset); g.lineTo(w - inset, h / 2); g.lineTo(w / 2, h - inset); g.lineTo(inset, h / 2); g.closePath(); };
  g.fillStyle = '#f4f2ea'; dia(0); g.fill();
  g.fillStyle = '#f2c230'; dia(7); g.fill();
  g.strokeStyle = '#3a3346'; g.lineWidth = 6; g.lineJoin = 'round'; dia(18); g.stroke();
  g.fillStyle = '#3a3346';
  const kid = (x, y, s, bag) => {
    g.beginPath(); g.arc(x, y - 30 * s, 9 * s, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x - 9 * s, y - 20 * s); g.lineTo(x + 9 * s, y - 20 * s); g.lineTo(x + 12 * s, y + 8 * s); g.lineTo(x - 12 * s, y + 8 * s); g.closePath(); g.fill();
    g.fillRect(x - 8 * s, y + 8 * s, 5 * s, 18 * s); g.save(); g.translate(x + 4 * s, y + 8 * s); g.rotate(-0.35); g.fillRect(0, 0, 5 * s, 18 * s); g.restore();
    if (bag) g.fillRect(x - 20 * s, y - 16 * s, 9 * s, 14 * s);
  };
  kid(80, 104, 1.05, true); kid(114, 110, 0.85, false);
  g.lineWidth = 3; g.beginPath(); g.moveTo(88, 86); g.lineTo(104, 94); g.stroke();
  C();
  // 通学路 auxiliary plate
  [w, h] = T(RB.aux);
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2f3a52'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#2f3a52'; fit(g, '通学路', w / 2, 27, w - 30, 32, F.sans, 900);
  fit(g, 'みなと小学校', w / 2, 51, w - 40, 12, F.sans, 700);
  C();
  // 桜ヶ丘駅 → pedestrian guide plate
  [w, h] = T(RB.station);
  g.fillStyle = '#f4f2ea'; rr(g, 0, 0, w, h, 10); g.fill();
  g.fillStyle = '#2f64b5'; rr(g, 4, 4, w - 8, h - 8, 8); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'left'; fit(g, '気仙沼駅', 16, 38, 150, 38, F.sans, 900);
  g.globalAlpha = 0.9; fit(g, 'Kesennuma Sta.', 18, 72, 150, 15, F.en, 700); g.globalAlpha = 1;
  g.textAlign = 'center';
  g.beginPath(); g.moveTo(178, 38); g.lineTo(212, 38); g.lineTo(212, 22); g.lineTo(242, 48); g.lineTo(212, 74); g.lineTo(212, 58); g.lineTo(178, 58); g.closePath(); g.fill();
  C();
  // 消火栓
  [w, h] = T(RB.hydrant);
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d9463b'; g.fillRect(4, 4, w - 8, 112);
  g.fillStyle = '#ffffff'; vtext(g, '消火栓', w / 2, 12, 30, F.sans, 900, 1.05);
  g.fillStyle = '#d9463b'; fit(g, '気仙沼市', w / 2, 132, w - 12, 15, F.sans, 700); fit(g, '駐車禁止', w / 2, 150, w - 14, 13, F.sans, 900);
  C();
  // 犬のフン (round die-cut)
  [w, h] = T(RB.dog);
  g.fillStyle = '#fbfaf5'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, TAU); g.fill();
  g.fillStyle = '#cfe7c2'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, TAU); g.fill();
  g.fillStyle = '#6a5448';
  g.beginPath(); g.ellipse(w / 2 - 2, 46, 22, 11, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(w / 2 + 22, 36, 9, 0, TAU); g.fill();
  g.fillRect(w / 2 - 20, 50, 5, 14); g.fillRect(w / 2 + 8, 50, 5, 14);
  g.beginPath(); g.ellipse(w / 2 + 27, 30, 4, 7, 0.5, 0, TAU); g.fill();
  g.fillStyle = '#2f7a4f'; fit(g, 'フンは', w / 2, 76, 80, 15, F.round, 700); fit(g, '持ち帰ろう', w / 2, 93, 86, 14, F.round, 700);
  C();
  // 高圧危険
  [w, h] = T(RB.koatsu);
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a3346'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  g.beginPath(); g.moveTo(22, 8); g.lineTo(12, 34); g.lineTo(22, 32); g.lineTo(16, 56); g.lineTo(34, 24); g.lineTo(24, 26); g.lineTo(32, 8); g.closePath(); g.fill();
  fit(g, '高圧危険', 82, 26, 84, 22, F.sans, 900); fit(g, 'さわるな', 82, 48, 80, 13, F.sans, 700);
  C();
  // 危険 のぼるな
  [w, h] = T(RB.noboruna);
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d9463b'; g.fillRect(3, 3, w - 6, 42);
  g.fillStyle = '#ffffff'; fit(g, '危険', w / 2, 25, w - 16, 32, F.sans, 900);
  g.fillStyle = '#3a3346'; fit(g, 'のぼるな', w / 2, 68, w - 14, 20, F.sans, 900);
  g.fillStyle = '#44587f'; fit(g, 'みなと電力', w / 2, 104, w - 20, 13, F.sans, 700);
  g.strokeStyle = '#3a3346'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  C();
  // こども110番 style "見守り" sticker
  [w, h] = T(RB.kodomo);
  g.fillStyle = '#fbfaf5'; rr(g, 1, 1, w - 2, h - 2, 10); g.fill();
  g.fillStyle = '#ef9a47'; rr(g, 6, 6, w - 12, 46, 8); g.fill();
  g.fillStyle = '#ffffff'; fit(g, 'みまもり', w / 2, 22, w - 20, 17, F.round, 700); fit(g, '隊', w / 2, 41, 30, 15, F.round, 700);
  g.fillStyle = '#3f8f5b'; fit(g, '子どもたちを', w / 2, 70, w - 12, 12, F.round, 700); fit(g, 'みんなで', w / 2, 86, w - 12, 12, F.round, 700); fit(g, 'みまもろう', w / 2, 102, w - 12, 12, F.round, 700);
  flower(g, w / 2, 116, 8, '#ee7c9e', '#f7e27a');
  C();
  // street-lamp tag
  [w, h] = T(RB.lampTag);
  g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3a3346'; g.fillRect(0, 0, 34, h);
  g.fillStyle = '#ffffff'; fit(g, '防犯灯', 17, h / 2, 30, 12, F.sans, 900);
  g.fillStyle = '#3a3346'; fit(g, '八日町 No.23', 81, h / 2, 88, 13, F.sans, 700);
  C();
}

// ---------------------------------------------------------------- build
export function makeAtlases(ctx, { plates, telPlates }) {
  const T = ctx.tex, F = T.FONTS;
  const A = T.draw(AW, AW, (g) => {
    const rnd = ctx.rng('poles:atlasA');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AW);
    drawShaft(g, rnd);
    drawSleeve(g, rnd, RA.sleeve[0], RA.sleeve[1]);
    drawCover(g, rnd, RA.cover[0], RA.cover[1]);
    drawTrans(g, rnd, F, RA.trans[0], RA.trans[1]);
    telPlates.forEach((tp, i) => drawTelPlate(g, telPlateRect(i), tp, F));
    ADS.forEach((ad, i) => drawAd(g, adRect(i), ad, F, rnd));
    // re-assert the pure white patch (vertex-coloured untextured parts sample it)
    g.fillStyle = '#ffffff'; g.fillRect(RA.white[0], RA.white[1], RA.white[2] - RA.white[0], RA.white[3] - RA.white[1]);
  }, { key: 'poles:atlasA', anisotropy: 8 });
  const B = T.draw(AW, AW, (g) => {
    const rnd = ctx.rng('poles:atlasB');
    g.clearRect(0, 0, AW, AW);
    drawStickers(g, F, rnd);
    plates.forEach((p, i) => drawPlate(g, plateRect(i), p, F));
  }, { key: 'poles:atlasB', anisotropy: 8 });
  return { A, B };
}
