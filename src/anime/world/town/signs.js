// [v3:town] Canvas atlases for the town's signage and shop interiors (hand-painted look, fictional names only):
//   boards   512×128 horizontal fascia boards (看板), 16 per 1024² atlas
//   tall     128×512 projecting vertical signs (袖看板), 16 per atlas
//   noren    256×256 noren curtains (3 panels with the shop word), 16 per atlas
//   interior 256×256 back-wall shelves / display tops per interior type (one atlas)
//   company  512×128 painted company names for warehouses (one atlas)
// Every lookup returns a uv rect [u0, v0, u1, v1] (three.js flipY canvas convention) and the material to use.
import { SHOPS, COMPANIES } from './names.js';

const ATL = 1024;
const rectUV = (x, y, w, h) => [x / ATL, 1 - (y + h) / ATL, (x + w) / ATL, 1 - y / ATL];

export const INTERIORS = ['fish', 'sake', 'dry', 'cafe', 'sushi', 'diner', 'sweets', 'veg', 'barber', 'pharmacy', 'goods', 'hardware', 'kimono', 'grocery', 'bakery', 'flower'];
// extra cells in the interior atlas (row 4 would overflow: 16 interiors fill it; display tops go in a 2nd atlas)
export const TOPS = ['fishTray', 'fishTray2', 'vegCrate', 'dryBags', 'flowers', 'boxes', 'menuBoard', 'price', 'shutterArt', 'ceiling', 'tileFloor', 'woodFloor', 'lattice', 'forSale', 'posters', 'parking'];

export function makeSigns(ctx) {
  const T = ctx.tex, F = T.FONTS, R = ctx.rng('town-signs');
  const fontOf = (k) => ({ brush: F.brush, serif: F.serif, round: F.round, sans: F.sans, en: F.en }[k] || F.sans);
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; r = Math.round(Math.min(255, r * k)); g = Math.round(Math.min(255, g * k)); b = Math.round(Math.min(255, b * k)); return `rgb(${r},${g},${b})`; };
  const grime = (g, x, y, w, h, n = 30, a = 0.07) => {
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(80,70,64,${a * R()})`; g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 2 + R() * 14, 1 + R() * 5, R() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = `rgba(60,50,48,${a})`; for (let i = 0; i < 6; i++) { const xx = x + R() * w; g.fillRect(xx, y + h * 0.6, 1 + R() * 2, h * 0.4 * R()); }
  };
  const vtext = (g, text, cx, top, size, font, weight = 700, gap = 1.06) => {
    g.font = `${weight} ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    let y = top + size * 0.5;
    for (const ch of text) {
      if ('ー〜－'.includes(ch)) { g.save(); g.translate(cx, y); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }
      else g.fillText(ch, cx, y);
      y += size * gap;
    }
  };

  // ------------------------------------------------------------------ boards (fascia 看板): 384×96 cells, 20 per 768×960 atlas
  const BW = 384, BH = 96, BPA = 20, AW2 = 768, AH2 = 960;
  const nBoardAtl = Math.ceil(SHOPS.length / BPA);
  const boards = [];
  for (let a = 0; a < nBoardAtl; a++) {
    boards.push(T.draw(AW2, AH2, (g) => {
      for (let k = 0; k < BPA; k++) {
        const s = SHOPS[a * BPA + k]; if (!s) continue;
        const x = (k % 2) * BW, y = Math.floor(k / 2) * BH, w = BW, h = BH;
        const [bg, fg] = s.board;
        g.fillStyle = shade(bg, 0.8); g.fillRect(x, y, w, h);
        g.fillStyle = bg; g.fillRect(x + 5, y + 5, w - 10, h - 10);
        if (s.style === 'wa') { g.strokeStyle = shade(bg, 0.7); g.lineWidth = 3; g.strokeRect(x + 11, y + 11, w - 22, h - 22); }
        if (s.style === 'wa') for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(0,0,0,${0.04 + R() * 0.05})`; g.lineWidth = 1 + R() * 2; const yy = y + 8 + R() * (h - 16); g.beginPath(); g.moveTo(x + 6, yy); g.bezierCurveTo(x + 110, yy + (R() - 0.5) * 6, x + 260, yy + (R() - 0.5) * 6, x + w - 6, yy); g.stroke(); }
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        const font = fontOf(s.font);
        T.fitText(g, s.name, x + w / 2 - (s.style === 'wa' ? 0 : 15), y + (s.sub ? 40 : 50), w - (s.style === 'wa' ? 44 : 82), s.style === 'wa' ? 58 : 53, font, s.font === 'brush' ? 400 : 900);
        if (s.sub) { g.globalAlpha = 0.9; T.fitText(g, s.sub + (s.en ? '  ' + s.en : ''), x + w / 2, y + 78, w - 52, 15, s.font === 'en' ? F.en : F.sans, 700); g.globalAlpha = 1; }
        if (s.style !== 'wa') { g.fillStyle = fg; g.beginPath(); g.arc(x + w - 35, y + 40, 20, 0, Math.PI * 2); g.fill(); g.fillStyle = bg; T.fitText(g, s.name.replace(/^(すし処|寿司|海産物|酒の|喫茶|珈琲|みやげ処|パン工房|中華そば|海鮮食堂|菓子処|茶舗|居酒屋|呉服|かき処|バーバー|花の|文具の|さかなの) ?/, '').slice(0, 1), x + w - 35, y + 42, 30, 26, F.sans, 900); }
        grime(g, x, y, w, h, 18, 0.06);
      }
    }, { key: 'town-boards-' + a, anisotropy: 8 }));
  }
  const boardOf = (i) => { const a = Math.floor(i / BPA), k = i % BPA; const x = (k % 2) * BW, y = Math.floor(k / 2) * BH; return { tex: boards[a], rect: [x / AW2, 1 - (y + BH) / AH2, (x + BW) / AW2, 1 - y / AH2] }; };

  // ------------------------------------------------------------------ tall projecting signs (袖看板): 64×256 cells, one atlas
  const talls = [T.draw(ATL, ATL, (g) => {
    for (let k = 0; k < Math.min(64, SHOPS.length); k++) {
      const s = SHOPS[k];
      const x = (k % 16) * 64, y = Math.floor(k / 16) * 256, w = 64, h = 256;
      const [bg, fg] = s.board;
      const light = s.style !== 'wa';
      g.fillStyle = light ? '#f4f1ea' : shade(bg, 0.85); g.fillRect(x, y, w, h);
      g.fillStyle = bg; g.fillRect(x + 4, y + 4, w - 8, h - 8);
      if (light) { g.fillStyle = '#f7f4ee'; g.fillRect(x + 8, y + 8, w - 16, h - 16); }
      g.fillStyle = light ? bg : fg;
      const word = s.name.replace(/ /g, '');
      const n = [...word].length, size = Math.min(40, (h - 24) / (n * 1.06));
      vtext(g, word, x + w / 2, y + (h - n * size * 1.06) / 2, size, fontOf(s.font), s.font === 'brush' ? 400 : 900);
    }
  }, { key: 'town-tall', anisotropy: 8 })];
  const tallOf = (i) => ({ tex: talls[0], rect: rectUV((i % 16) * 64, Math.floor(i / 16 % 4) * 256, 64, 256) });

  // ------------------------------------------------------------------ noren
  const norenTex = T.draw(ATL, ATL, (g) => {
    let k = 0;
    for (const s of SHOPS) {
      if (!s.noren) { continue; }
      const x = (k % 4) * 256, y = Math.floor(k / 4) * 170, w = 256, h = 170; k++;
      if (k > 24) break;
      const [bg, word] = s.noren; const ink = s.norenInk || '#f6f1e6';
      const panels = 3;
      for (let p = 0; p < panels; p++) {
        const px = x + p * (w / panels) + 2, pw = w / panels - 4;
        g.fillStyle = bg; g.fillRect(px, y + 4, pw, h - 8);
        g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(px + pw - 6, y + 4, 6, h - 8);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px, y + 4, 5, h - 8);
      }
      // top hem
      g.fillStyle = shade(bg, 0.8); g.fillRect(x, y, w, 18);
      g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = [...word];
      if (chars.length <= 3) chars.forEach((ch, i) => { g.font = `400 ${chars.length === 1 ? 118 : 80}px ${F.brush}`; const cx = chars.length === 1 ? x + w / 2 : x + (i + 0.5) * (w / 3); g.fillText(ch, cx, y + h * 0.52); });
      else { g.font = `400 58px ${F.brush}`; chars.slice(0, 4).forEach((ch, i) => g.fillText(ch, x + (i % 2 + 0.5) * (w / 2), y + 52 + Math.floor(i / 2) * 64)); }
      // small shop mark bottom corner
      g.font = `700 15px ${F.sans}`; g.globalAlpha = 0.8; g.fillText(s.name.split(' ').pop().slice(0, 5), x + w / 2, y + h - 16); g.globalAlpha = 1;
    }
  }, { key: 'town-noren', anisotropy: 4 });
  const norenIdx = new Map(); { let k = 0; SHOPS.forEach((s, i) => { if (s.noren && k < 24) norenIdx.set(i, k++); }); }
  const norenOf = (i) => { const k = norenIdx.get(i); return k === undefined ? null : { tex: norenTex, rect: rectUV((k % 4) * 256, Math.floor(k / 4) * 170, 256, 170) }; };

  // ------------------------------------------------------------------ interiors (back walls)
  const inter = T.draw(ATL, ATL, (g) => {
    INTERIORS.forEach((kind, k) => {
      const x = (k % 4) * 256, y = Math.floor(k / 4) * 256, w = 256, h = 256;
      drawInterior(g, kind, x, y, w, h, R, F, T);
    });
  }, { key: 'town-interiors', anisotropy: 4 });
  const interiorOf = (kind) => { const k = Math.max(0, INTERIORS.indexOf(kind)); return { tex: inter, rect: rectUV((k % 4) * 256, Math.floor(k / 4) * 256, 256, 256) }; };

  const tops = T.draw(ATL, ATL, (g) => {
    TOPS.forEach((kind, k) => {
      const x = (k % 4) * 256, y = Math.floor(k / 4) * 256;
      drawTop(g, kind, x, y, 256, 256, R, F, T);
    });
  }, { key: 'town-tops', anisotropy: 4 });
  const topOf = (kind) => { const k = Math.max(0, TOPS.indexOf(kind)); return { tex: tops, rect: rectUV((k % 4) * 256, Math.floor(k / 4) * 256, 256, 256) }; };

  // ------------------------------------------------------------------ company names (warehouse walls)
  const comp = T.draw(ATL, 768, (g) => {
    COMPANIES.forEach((c, k) => {
      if (k >= 12) return;
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 128, w = 512, h = 128;
      g.clearRect(x, y, w, h);
      const blue = k % 3 !== 1;
      g.fillStyle = blue ? '#2a4f86' : '#a13a2e';
      g.beginPath(); g.arc(x + 62, y + 64, 50, 0, Math.PI * 2); g.lineWidth = 9; g.strokeStyle = g.fillStyle; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      T.fitText(g, c.mark, x + 62, y + 67, 70, 58, F.serif, 900);
      g.textAlign = 'left';
      T.fitText(g, c.name, x + 128, y + 58, 370, 72, F.sans, 900);
      g.globalAlpha = 0.85; T.fitText(g, '株式会社  ' + c.sub, x + 132, y + 108, 360, 20, F.sans, 700); g.globalAlpha = 1;
      // weathering: punch light holes
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.35})`; g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 1 + R() * 6, 0.5 + R() * 2.5, R() * 3, 0, Math.PI * 2); g.fill(); }
      g.restore();
    });
  }, { key: 'town-company', anisotropy: 8 });
  const companyOf = (i) => { const k = i % 12, x = (k % 2) * 512, y = Math.floor(k / 2) * 128; return { tex: comp, rect: [x / ATL, 1 - (y + 128) / 768, (x + 512) / ATL, 1 - y / 768] }; };

  return { boardOf, tallOf, norenOf, interiorOf, topOf, companyOf, boards, talls, norenTex, inter, tops, comp };
}

// ====================================================================== painters
function drawInterior(g, kind, x, y, w, h, R, F, T) {
  const wall = { fish: '#e9ecea', sake: '#e7dcc6', dry: '#eae0cc', cafe: '#e8d9c2', sushi: '#efe4cc', diner: '#efe3c8', sweets: '#f3e9e2', veg: '#e9e6d6', barber: '#eef0f2', pharmacy: '#f1f3f1', goods: '#ece9e1', hardware: '#dcdad2', kimono: '#eadfcf', grocery: '#ece8dc', bakery: '#f1e4cf', flower: '#eef0e6' }[kind] || '#ece8e0';
  g.fillStyle = wall; g.fillRect(x, y, w, h);
  const shelfRows = (n, col, item) => {
    for (let r = 0; r < n; r++) {
      const sy = y + 30 + r * ((h - 60) / n);
      g.fillStyle = col; g.fillRect(x + 8, sy + (h - 60) / n - 10, w - 16, 8);
      for (let i = 0; i < 12; i++) item(x + 14 + i * ((w - 28) / 12), sy + (h - 60) / n - 10, (w - 28) / 12, (h - 60) / n - 14, r, i);
    }
  };
  const P = ['#d9463b', '#2f64b5', '#f2c230', '#3f8f5b', '#ef9a47', '#8a5a9a', '#e6e2d8', '#5ab0c8', '#e98aa6'];
  switch (kind) {
    case 'sake': case 'grocery': case 'pharmacy': case 'goods': case 'hardware': case 'dry':
      shelfRows(4, kind === 'sake' ? '#7a5638' : '#b9bcc0', (sx, sy, sw, sh, r, i) => {
        if (kind === 'dry') { const bh = sh * (0.35 + R() * 0.3); g.fillStyle = ['#3f4a3a', '#6b5a3a', '#e8e0cc', '#2e3f4f', '#8a6a4a'][(R() * 5) | 0]; g.fillRect(sx + 1, sy - bh, sw - 2, bh); g.fillStyle = '#f4efe0'; g.fillRect(sx + 2, sy - bh * 0.6, sw - 4, bh * 0.3); }
        else if (kind === 'sake') { const bh = sh * (0.7 + R() * 0.25); g.fillStyle = R() < 0.5 ? '#3d5a3a' : R() < 0.5 ? '#6b3a2a' : '#2e3a52'; g.fillRect(sx + sw * 0.25, sy - bh, sw * 0.5, bh); g.fillRect(sx + sw * 0.38, sy - bh - 8, sw * 0.24, 9); g.fillStyle = '#f1ead8'; g.fillRect(sx + sw * 0.28, sy - bh * 0.7, sw * 0.44, bh * 0.35); }
        else { const bh = sh * (0.4 + R() * 0.5); g.fillStyle = P[(R() * P.length) | 0]; g.fillRect(sx + 1, sy - bh, sw - 2, bh); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(sx + 2, sy - bh + 3, sw - 5, 4); }
      });
      if (kind === 'hardware') { g.strokeStyle = '#c8a04a'; g.lineWidth = 6; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + 40 + i * 55, y + 26, 18, 0, Math.PI * 2); g.stroke(); } }
      break;
    case 'fish': case 'veg': case 'flower':
      g.fillStyle = '#c9d3d6'; g.fillRect(x, y + h * 0.55, w, h * 0.45);
      for (let i = 0; i < 6; i++) { g.fillStyle = kind === 'fish' ? '#2f5e8e' : kind === 'veg' ? '#3f7a3f' : '#e98aa6'; g.fillRect(x + 10 + i * 40, y + h * 0.35, 34, 22); g.fillStyle = '#fff'; T.fitText(g, ['時価', '198', '298', '380', '500', '特価'][i], x + 27 + i * 40, y + h * 0.35 + 12, 30, 14, F.sans, 900); }
      g.fillStyle = '#6d7f8c'; for (let i = 0; i < 8; i++) g.fillRect(x + 8 + i * 31, y + 12, 3, 40);
      g.fillStyle = '#fff4d8'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x + 30 + i * 64, y + 56, 9, 0, Math.PI * 2); g.fill(); }
      break;
    case 'cafe': case 'bakery':
      g.fillStyle = '#6b4a36'; g.fillRect(x, y + h * 0.62, w, h * 0.38);
      g.fillStyle = '#3a3a3f'; g.fillRect(x + 20, y + 26, 110, 80); g.fillStyle = '#f1efe8'; g.font = `400 16px ${F.hand}`; g.textAlign = 'left'; g.textBaseline = 'top';
      ['ブレンド 450', 'ナポリタン 800', 'ホットケーキ', 'クリームソーダ'].forEach((t, i) => g.fillText(t, x + 28, y + 34 + i * 18));
      for (let i = 0; i < 5; i++) { g.fillStyle = P[i]; g.beginPath(); g.arc(x + 160 + (i % 3) * 30, y + 50 + Math.floor(i / 3) * 34, 11, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#d9b27a'; for (let i = 0; i < 6; i++) g.fillRect(x + 14 + i * 40, y + h * 0.5, 30, 18);
      break;
    case 'sushi': case 'diner':
      g.fillStyle = '#b8905c'; g.fillRect(x, y + h * 0.6, w, h * 0.4);
      g.fillStyle = '#8a6440'; g.fillRect(x, y + h * 0.6, w, 8);
      for (let i = 0; i < 9; i++) { g.fillStyle = '#f4ecd8'; g.fillRect(x + 8 + i * 27, y + 16, 22, 88); g.fillStyle = '#2e2a2c'; const words = kind === 'sushi' ? ['まぐろ', 'かつお', 'さんま', 'ほや', 'うに', 'いくら', 'えび', 'たこ', 'ふかひれ'] : ['海鮮丼', 'かつお定食', 'さんま', '刺身', '塩辛', '焼魚', 'ほや酢', 'ラーメン', 'カレー']; const wd = words[i]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 13px ${F.serif}`; [...wd].slice(0, 5).forEach((ch, j) => g.fillText(ch, x + 19 + i * 27, y + 26 + j * 15)); }
      break;
    case 'sweets':
      g.fillStyle = '#d9c7b0'; g.fillRect(x, y + h * 0.5, w, h * 0.5);
      for (let i = 0; i < 10; i++) { g.fillStyle = ['#f3d9df', '#e6c79a', '#a7c48a', '#f7f0e0', '#c98b6a'][i % 5]; g.beginPath(); g.ellipse(x + 20 + (i % 5) * 50, y + h * 0.58 + Math.floor(i / 5) * 40, 16, 10, 0, 0, Math.PI * 2); g.fill(); }
      break;
    case 'barber':
      for (let i = 0; i < 3; i++) { g.fillStyle = '#cfe0ea'; g.fillRect(x + 12 + i * 82, y + 30, 70, 90); g.fillStyle = '#2f3542'; g.fillRect(x + 22 + i * 82, y + 140, 50, 70); }
      break;
    case 'kimono':
      for (let i = 0; i < 8; i++) { g.fillStyle = ['#6d3a5c', '#c65a6a', '#e0b85a', '#3f5a7a', '#8a3a3a', '#e6d0b0', '#5a7a5a', '#b04a6e'][i]; g.fillRect(x + 8 + i * 30, y + 40, 26, 150); g.fillStyle = 'rgba(255,255,255,0.25)'; for (let j = 0; j < 6; j++) g.fillRect(x + 12 + i * 30, y + 50 + j * 24, 10, 4); }
      break;
  }
  // lower counter / baseboard and a soft vignette
  g.fillStyle = 'rgba(60,50,40,0.12)'; g.fillRect(x, y + h - 14, w, 14);
  const grd = g.createLinearGradient(x, y, x, y + h); grd.addColorStop(0, 'rgba(255,230,190,0.15)'); grd.addColorStop(1, 'rgba(40,30,30,0.18)');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
}

function drawTop(g, kind, x, y, w, h, R, F, T) {
  const fishCol = ['#5f7f9a', '#8aa2b6', '#c65a4a', '#d9a05a', '#6f8f8a', '#e8b0a0'];
  switch (kind) {
    case 'fishTray': case 'fishTray2': {
      g.fillStyle = '#e8eef0'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const bx = x + 6 + i * 62, by = y + 8 + j * 124;
        g.fillStyle = kind === 'fishTray' ? '#f5f7f7' : '#3d5f8f'; g.fillRect(bx, by, 58, 116);
        g.fillStyle = '#dfe9ee'; g.fillRect(bx + 4, by + 4, 50, 108);
        const c = fishCol[(i + j * 2 + (kind === 'fishTray2' ? 3 : 0)) % fishCol.length];
        for (let f = 0; f < 3; f++) { g.fillStyle = c; g.beginPath(); g.ellipse(bx + 29, by + 22 + f * 34, 22, 9, 0.15, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(bx + 49, by + 22 + f * 34); g.lineTo(bx + 56, by + 14 + f * 34); g.lineTo(bx + 56, by + 30 + f * 34); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(bx + 12, by + 19 + f * 34, 26, 2); }
        g.fillStyle = '#ffffff'; g.fillRect(bx + 8, by + 96, 42, 14); g.fillStyle = '#c43d34'; T.fitText(g, ['298円', '480円', '一皿500', '980円'][(i + j) % 4], bx + 29, by + 104, 38, 12, F.sans, 900);
      }
      break;
    }
    case 'vegCrate': {
      g.fillStyle = '#b08a5a'; g.fillRect(x, y, w, h);
      const cols = ['#d9463b', '#f2a33a', '#7aa84f', '#e6d27a', '#8a4a7a', '#f0e6c8'];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const bx = x + 6 + i * 83, by = y + 6 + j * 124; g.fillStyle = '#8a6a44'; g.fillRect(bx, by, 78, 118);
        const c = cols[(i + j * 3) % cols.length];
        for (let k = 0; k < 14; k++) { g.fillStyle = c; g.beginPath(); g.arc(bx + 12 + (k % 4) * 18 + R() * 4, by + 14 + Math.floor(k / 4) * 26 + R() * 4, 9, 0, Math.PI * 2); g.fill(); }
      }
      break;
    }
    case 'dryBags': {
      g.fillStyle = '#d8c9a8'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 16; i++) { const bx = x + 6 + (i % 4) * 62, by = y + 6 + Math.floor(i / 4) * 62; g.fillStyle = ['#3f4a3a', '#6b5a3a', '#e8e0cc', '#2e3f4f'][i % 4]; g.fillRect(bx, by, 56, 56); g.fillStyle = '#f4efe0'; g.fillRect(bx + 8, by + 30, 40, 16); g.fillStyle = '#c43d34'; T.fitText(g, ['わかめ', '昆布', 'するめ', 'ふのり'][i % 4], bx + 28, by + 38, 36, 11, F.sans, 900); }
      break;
    }
    case 'flowers': {
      g.fillStyle = '#6a8f5a'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 60; i++) { g.fillStyle = ['#e98aa6', '#f2d24a', '#f4f0f0', '#e0643a', '#b07ad0'][i % 5]; g.beginPath(); g.arc(x + R() * w, y + R() * h, 8 + R() * 8, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'boxes': {
      g.fillStyle = '#e9ecee'; g.fillRect(x, y, w, h); g.strokeStyle = '#c9d0d4'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.strokeRect(x + 4 + i * 62, y + 4 + j * 62, 58, 58);
      g.fillStyle = '#2f64b5'; for (let i = 0; i < 4; i++) T.fitText(g, '三陸', x + 33 + i * 62, y + 33, 40, 16, F.sans, 900);
      break;
    }
    case 'menuBoard': {
      g.fillStyle = '#4a4a44'; g.fillRect(x, y, w, h); g.fillStyle = '#6b4a36'; g.lineWidth = 12; g.strokeStyle = '#8a6440'; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      g.fillStyle = '#f4efe2'; g.textAlign = 'center'; g.textBaseline = 'middle';
      T.fitText(g, '本日のおすすめ', x + w / 2, y + 40, w - 40, 26, F.hand, 400);
      ['生かつお刺身', 'さんま塩焼', 'ほや酢', '海鮮丼  1200円'].forEach((t, i) => { g.fillStyle = i === 3 ? '#f2c230' : '#f4efe2'; T.fitText(g, t, x + w / 2, y + 92 + i * 40, w - 40, 26, F.hand, 400); });
      break;
    }
    case 'price': {
      g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); g.fillStyle = '#c43d34'; T.fitText(g, '特売', x + w / 2, y + 70, w - 30, 90, F.sans, 900); g.fillStyle = '#2a2a33'; T.fitText(g, '本日限り', x + w / 2, y + 170, w - 30, 50, F.sans, 900);
      break;
    }
    case 'shutterArt': {
      g.fillStyle = '#b9bec2'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#aeb3b8' : '#c3c7cb'; g.fillRect(x, y + i * 8, w, 4); }
      g.fillStyle = 'rgba(120,90,70,0.2)'; for (let i = 0; i < 10; i++) g.fillRect(x + R() * w, y + h * 0.7, 2 + R() * 3, h * 0.3);
      break;
    }
    case 'ceiling': {
      g.fillStyle = '#efe9dc'; g.fillRect(x, y, w, h); g.strokeStyle = '#d8d0c0'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x + i * 32, y); g.lineTo(x + i * 32, y + h); g.stroke(); g.beginPath(); g.moveTo(x, y + i * 32); g.lineTo(x + w, y + i * 32); g.stroke(); }
      break;
    }
    case 'tileFloor': {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#cfc8bb' : '#ddd6c9'; g.fillRect(x + i * 32, y + j * 32, 32, 32); }
      break;
    }
    case 'woodFloor': {
      for (let j = 0; j < 16; j++) { g.fillStyle = j % 2 ? '#9a7450' : '#a67f58'; g.fillRect(x, y + j * 16, w, 16); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x + ((j * 97) % 200), y + j * 16, 2, 16); }
      break;
    }
    case 'lattice': {
      g.clearRect(x, y, w, h);
      g.fillStyle = '#5a3f2e'; for (let i = 0; i < 16; i++) g.fillRect(x + i * 16 + 2, y, 9, h);
      g.fillRect(x, y, w, 10); g.fillRect(x, y + h - 10, w, 10); g.fillRect(x, y + h / 2 - 4, w, 8);
      break;
    }
    case 'forSale': {
      g.fillStyle = '#f4f2ea'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#c43d34'; g.lineWidth = 10; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
      g.fillStyle = '#c43d34'; g.textAlign = 'center'; g.textBaseline = 'middle';
      T.fitText(g, '売地', x + w / 2, y + 80, w - 40, 110, F.sans, 900);
      g.fillStyle = '#2a2a33'; T.fitText(g, '約120坪  建築条件なし', x + w / 2, y + 150, w - 40, 22, F.sans, 700);
      g.fillStyle = '#2f64b5'; T.fitText(g, 'かもめ不動産', x + w / 2, y + 190, w - 40, 30, F.sans, 900);
      g.fillStyle = '#2a2a33'; T.fitText(g, '☎ 0226-00-2525', x + w / 2, y + 224, w - 40, 22, F.en, 700);
      break;
    }
    case 'posters': {
      g.fillStyle = '#f2efe6'; g.fillRect(x, y, w, h);
      const items = [['みなとまつり', '#d9463b'], ['さんままつり', '#2f64b5'], ['朝市 毎週日曜', '#3f8f5b'], ['大漁旗展', '#ef9a47']];
      items.forEach(([t, c], i) => { const bx = x + (i % 2) * 128 + 8, by = y + Math.floor(i / 2) * 128 + 8; g.fillStyle = c; g.fillRect(bx, by, 112, 112); g.fillStyle = '#fff'; g.fillRect(bx + 8, by + 8, 96, 60); g.fillStyle = c; T.fitText(g, t, bx + 56, by + 88, 100, 18, F.sans, 900); });
      break;
    }
    case 'parking': {
      g.fillStyle = '#f4f2ea'; g.fillRect(x, y, w, h);
      g.fillStyle = '#2458a8'; T.roundRect(g, x + 10, y + 10, w - 20, h - 20, 18); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      T.fitText(g, 'P', x + w / 2, y + 100, 160, 150, F.en, 900);
      T.fitText(g, '月極駐車場', x + w / 2, y + 190, w - 50, 30, F.sans, 900);
      T.fitText(g, '空きあり  内湾パーキング', x + w / 2, y + 224, w - 50, 17, F.sans, 700);
      break;
    }
    default: g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h);
  }
}
