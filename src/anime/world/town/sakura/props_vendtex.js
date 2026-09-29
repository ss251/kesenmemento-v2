// [v3:town] vendored from Sakuragaoka Station src/world/props/vendtex.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Canvas textures for the vending machines: brand headers, product label atlas, price rails,
// lower door panels (ad + payment), side graphics, grime, the さくらぽん sticker and a nobori flag.
import { rr, sakuraFlower, vtext, ftext } from './props_common.js';

// ------------------------------------------------------------------ brands (fictional)
export const BRANDS = {
  haru: { name: 'はるかぜ飲料', en: 'HARUKAZE BEVERAGE', casing: '#ece7e0', door: '#f0ece6', trim: '#e592ad', stile: '#e9e3dc', inner: '#f3f0ea' },
  sakura: { name: 'SAKURA DRINKS', jp: 'さくらドリンクス', casing: '#d7675f', door: '#dc6e65', trim: '#fbf2ec', stile: '#cf5f58', inner: '#f6ece6' },
  aozora: { name: 'あおぞら飲料', en: 'AOZORA DRINK', casing: '#a6c8e4', door: '#afcfe8', trim: '#2f6db8', stile: '#9dc0de', inner: '#eef4f9' },
  midori: { name: 'みどり茶房', en: 'MIDORI SABOU', casing: '#a3d6bf', door: '#aadbc5', trim: '#2d7a57', stile: '#98cdb5', inner: '#eef6f1' },
};

// ------------------------------------------------------------------ products
// shape: can350 / can190 / pet500 / pet350 / petHot. cell = label atlas cell. swatches allocated below.
export const SHAPES = {
  can350: { kind: 'can', r: 0.033, h: 0.122 },
  can190: { kind: 'can', r: 0.0265, h: 0.104 },
  pet500: { kind: 'pet', r: 0.034, h: 0.205 },
  pet350: { kind: 'pet', r: 0.031, h: 0.165 },
  petHot: { kind: 'pet', r: 0.032, h: 0.158 },
};
export const PRODUCTS = {
  coffee: { shape: 'can190', cell: 0, price: 130 },
  black: { shape: 'can190', cell: 1, price: 130 },
  greenTea: { shape: 'pet500', cell: 2, price: 160, cap: '#3f8a55', liquid: '#bfcb8e' },
  greenTeaHot: { shape: 'petHot', cell: 2, price: 160, cap: '#ec8a2c', liquid: '#bfcb8e' },
  lemon: { shape: 'can350', cell: 3, price: 150 },
  ichigo: { shape: 'pet350', cell: 4, price: 150, cap: '#e57b9b', liquid: '#f6cdd8' },
  water: { shape: 'pet500', cell: 5, price: 120, cap: '#5a8fd0', liquid: '#e4f1f8' },
  orange: { shape: 'pet500', cell: 6, price: 160, cap: '#ec8d2e', liquid: '#f7b45a' },
  sakuraLatte: { shape: 'pet500', cell: 7, price: 170, cap: '#e98aa6', liquid: '#f6c9d5' },
  sakuraSoda: { shape: 'can350', cell: 8, price: 150 },
  oshiruko: { shape: 'can190', cell: 9, price: 140 },
  potage: { shape: 'can190', cell: 10, price: 140 },
  mugi: { shape: 'pet500', cell: 11, price: 150, cap: '#8a5a34', liquid: '#caa05c' },
  milkTea: { shape: 'petHot', cell: 12, price: 160, cap: '#ec8a2c', liquid: '#d9ba92' },
  ion: { shape: 'pet500', cell: 13, price: 150, cap: '#3f7bd0', liquid: '#e7f0f8' },
  cider: { shape: 'can350', cell: 14, price: 140 },
  cafeLatte: { shape: 'can350', cell: 15, price: 140 },
};
export const ATLAS = { W: 1024, H: 1024, cw: 256, ch: 128, swY: 896 };
export const SWATCH = { silver: 0, lid: 1, dark: 2 };
{
  let i = 3;
  for (const p of Object.values(PRODUCTS)) { if (p.cap) { p.capSw = i++; p.liqSw = i++; } }
}
export function swatchPx(i) { return [(i % 64) * 16 + 8, ATLAS.swY + Math.floor(i / 64) * 16 + 8]; }
export function cellPx(cell) { return [(cell % 4) * ATLAS.cw, Math.floor(cell / 4) * ATLAS.ch]; }

export function makeVendTextures(ctx) {
  const T = ctx.tex, F = T.FONTS;

  // ---------------------------------------------------------------- label atlas
  const atlas = T.draw(ATLAS.W, ATLAS.H, (g) => {
    g.fillStyle = '#d8dde2'; g.fillRect(0, 0, ATLAS.W, ATLAS.H);
    const cell = (i, fn, kind = 'can', liquid = null) => {
      const [x, y] = cellPx(i); const w = ATLAS.cw, h = ATLAS.ch;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
      if (kind === 'pet') {
        // bottle body: liquid visible above / below the label band
        g.fillStyle = liquid || '#e0eef6'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 8, w, 8);
        g.save(); g.beginPath(); g.rect(0, 16, w, h - 30); g.clip(); g.translate(0, 16); fn(g, w, h - 30); g.restore();
      } else fn(g, w, h);
      g.restore();
    };
    const C = 128; // front centre x in a cell
    // 0 coffee 微糖 (short can)
    cell(0, (g, w, h) => {
      g.fillStyle = '#2e416b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9a36a'; g.fillRect(0, h * 0.72, w, 6); g.fillRect(0, h * 0.2, w, 3);
      g.fillStyle = '#6b4a36'; g.beginPath(); g.ellipse(C, h * 0.86, 30, 9, 0, 0, Math.PI * 2); g.fill();
      ftext(g, '微糖', C, h * 0.48, 90, 44, F.serif, 900, '#f4ead8');
      ftext(g, 'BLEND COFFEE', C, h * 0.12, 110, 13, F.en, 700, '#e5c98f');
    });
    // 1 black coffee
    cell(1, (g, w, h) => {
      g.fillStyle = '#3d3336'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b89a62'; g.fillRect(0, h * 0.18, w, 2); g.fillRect(0, h * 0.8, w, 2);
      ftext(g, 'BLACK', C, h * 0.45, 104, 32, F.en, 900, '#f1ece2');
      ftext(g, '無糖', C, h * 0.68, 60, 20, F.sans, 700, '#e0c48c');
      ftext(g, 'はるかぜ珈琲', C, h * 0.9, 90, 11, F.sans, 500, '#cbb89a');
    });
    // 2 green tea (pet)
    cell(2, (g, w, h) => {
      g.fillStyle = '#eef3e2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#6aa46c'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.fillStyle = '#9cc782'; g.beginPath(); g.ellipse(C + 36, h * 0.55, 18, 34, 0.5, 0, Math.PI * 2); g.fill();
      vtext(g, '緑茶', C - 6, 16, 30, F.brush, 700, 1.0, '#2f6b3f');
      ftext(g, 'みどり茶', C + 40, h * 0.86, 60, 11, F.sans, 700, '#3d7a4a');
    }, 'pet', '#bfcb8e');
    // 3 lemon soda (can)
    cell(3, (g, w, h) => {
      g.fillStyle = '#f3d84f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff6c4';
      for (const [x, y, r] of [[C - 44, h * 0.3, 16], [C + 48, h * 0.72, 20], [C + 90, h * 0.25, 12], [C - 88, h * 0.78, 14]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#3f86c9'; g.fillRect(0, h * 0.58, w, 5);
      ftext(g, 'レモン', C, h * 0.42, 100, 34, F.round, 900, '#2f6fb5');
      ftext(g, 'SODA', C, h * 0.76, 80, 22, F.en, 900, '#ffffff');
    });
    // 4 いちごみるく (pet350)
    cell(4, (g, w, h) => {
      g.fillStyle = '#f8cdd8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 18; i++) { g.beginPath(); g.arc((i * 37) % w, (i * 23) % h, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e2465c'; g.beginPath(); g.moveTo(C - 50, h * 0.5); g.quadraticCurveTo(C - 50, h * 0.2, C - 38, h * 0.18); g.quadraticCurveTo(C - 26, h * 0.2, C - 26, h * 0.5); g.quadraticCurveTo(C - 38, h * 0.72, C - 50, h * 0.5); g.fill();
      ftext(g, 'いちご', C + 10, h * 0.34, 90, 26, F.round, 900, '#d33d5a');
      ftext(g, 'みるく', C + 10, h * 0.7, 90, 26, F.round, 900, '#ffffff');
    }, 'pet', '#f6cdd8');
    // 5 天然水 (pet)
    cell(5, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9fcde9'; g.beginPath(); g.moveTo(0, h); g.lineTo(C - 60, h * 0.45); g.lineTo(C - 20, h * 0.7); g.lineTo(C + 30, h * 0.32); g.lineTo(w, h); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(C + 14, h * 0.44); g.lineTo(C + 30, h * 0.32); g.lineTo(C + 46, h * 0.44); g.fill();
      ftext(g, '天然水', C, h * 0.2, 110, 26, F.serif, 900, '#2b5d99');
      ftext(g, '安波山の水', C + 44, h * 0.88, 70, 12, F.sans, 700, '#ffffff');
    }, 'pet', '#e4f1f8');
    // 6 orange (pet)
    cell(6, (g, w, h) => {
      g.fillStyle = '#f39a3b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd08a'; g.beginPath(); g.arc(C + 40, h * 0.58, 24, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f39a3b'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(C + 40, h * 0.58); g.lineTo(C + 40 + 22 * Math.cos(i * 1.047), h * 0.58 + 22 * Math.sin(i * 1.047)); g.stroke(); }
      ftext(g, 'ORANGE', C - 6, h * 0.3, 110, 26, F.en, 900, '#ffffff');
      ftext(g, '100%', C - 24, h * 0.66, 60, 20, F.en, 900, '#7a3d12');
    }, 'pet', '#f7b45a');
    // 7 さくらラテ 春限定 (pet)
    cell(7, (g, w, h) => {
      g.fillStyle = '#fbe3ea'; g.fillRect(0, 0, w, h);
      for (const [x, y, r] of [[C - 60, h * 0.25, 13], [C + 62, h * 0.7, 15], [C + 20, h * 0.1, 8], [C - 100, h * 0.8, 12], [C + 110, h * 0.3, 10]]) sakuraFlower(g, x, y, r, '#f2a5bd', '#e0708f');
      ftext(g, 'さくら', C, h * 0.4, 100, 30, F.round, 900, '#c9557a');
      ftext(g, 'ラテ', C - 10, h * 0.72, 60, 22, F.round, 900, '#c9557a');
      g.fillStyle = '#d9463b'; rr(g, C + 16, h * 0.62, 44, 22, 5); g.fill();
      ftext(g, '春限定', C + 38, h * 0.62 + 11, 40, 12, F.sans, 900, '#ffffff');
    }, 'pet', '#f6c9d5');
    // 8 桜ソーダ (can)
    cell(8, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f6b3c8'); gr.addColorStop(1, '#fde8ef');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 53) % w, h - ((i * 31) % h), 3 + (i % 3), 0, Math.PI * 2); g.fill(); }
      sakuraFlower(g, C, h * 0.3, 20, '#ffffff', '#e27a98');
      ftext(g, '桜ソーダ', C, h * 0.68, 110, 26, F.round, 900, '#b8456a');
      ftext(g, 'SAKURA SODA', C, h * 0.9, 110, 11, F.en, 700, '#ffffff');
    });
    // 9 おしるこ (short can)
    cell(9, (g, w, h) => {
      g.fillStyle = '#8c3a3d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5e2a2e'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(C - 60 + i * 15, h * 0.88, 6, 4, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#f5ecdc'; rr(g, C - 30, 8, 60, h * 0.72, 8); g.fill();
      vtext(g, 'おしるこ', C, 12, 20, F.brush, 700, 1.0, '#7c2e33');
    });
    // 10 コーンポタージュ (short can)
    cell(10, (g, w, h) => {
      g.fillStyle = '#f2c94c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fbe39a'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(C + 30 + (i % 3) * 9, h * 0.35 + Math.floor(i / 3) * 11, 4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#7fae55'; g.beginPath(); g.ellipse(C + 20, h * 0.6, 7, 26, -0.4, 0, Math.PI * 2); g.fill();
      ftext(g, 'コーン', C - 22, h * 0.36, 80, 22, F.round, 900, '#7a4c1c');
      ftext(g, 'ポタージュ', C - 12, h * 0.66, 104, 19, F.round, 900, '#7a4c1c');
      ftext(g, 'つぶたっぷり', C, h * 0.9, 90, 11, F.sans, 700, '#a35a1c');
    });
    // 11 むぎ茶 (pet)
    cell(11, (g, w, h) => {
      g.fillStyle = '#f6ecd4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d7a950'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
      g.strokeStyle = '#c99a44'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(C + 34 + i * 4, h * 0.9); g.quadraticCurveTo(C + 30 + i * 6, h * 0.5, C + 42 + i * 5, h * 0.18); g.stroke(); }
      vtext(g, 'むぎ茶', C - 8, 10, 25, F.brush, 700, 1.0, '#7a4a22');
    }, 'pet', '#caa05c');
    // 12 ミルクティー (hot pet)
    cell(12, (g, w, h) => {
      g.fillStyle = '#f1e3cb'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9b6a45'; g.fillRect(0, h * 0.78, w, h * 0.22);
      g.fillStyle = '#ffffff'; rr(g, C + 26, h * 0.3, 26, 22, 4); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(C + 54, h * 0.41, 6, -1.2, 1.2); g.stroke();
      ftext(g, 'ミルク', C - 14, h * 0.28, 80, 22, F.round, 900, '#7b4a2c');
      ftext(g, 'ティー', C - 14, h * 0.56, 80, 22, F.round, 900, '#7b4a2c');
      ftext(g, 'ROYAL MILK TEA', C, h * 0.89, 110, 11, F.en, 700, '#f4e8d6');
    }, 'pet', '#d9ba92');
    // 13 ION water (pet)
    cell(13, (g, w, h) => {
      g.fillStyle = '#f6f9fc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3f7bd0'; g.beginPath(); g.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.62 + Math.sin(x / 20) * 6); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      ftext(g, 'SORA', C, h * 0.26, 100, 30, F.en, 900, '#2f6fc0');
      ftext(g, 'ION WATER', C, h * 0.8, 100, 14, F.en, 700, '#ffffff');
    }, 'pet', '#e7f0f8');
    // 14 サイダー (can)
    cell(14, (g, w, h) => {
      g.fillStyle = '#7cc3e8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i * 41 + 7) % w, (i * 29 + 11) % h, 2 + (i % 4), 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e24a4a'; g.fillRect(0, h * 0.14, w, 5);
      ftext(g, 'サイダー', C, h * 0.5, 104, 28, F.round, 900, '#ffffff');
      ftext(g, 'あおぞら', C, h * 0.82, 90, 14, F.round, 900, '#1f5a9c');
    });
    // 15 カフェラテ (can)
    cell(15, (g, w, h) => {
      g.fillStyle = '#e9dcc6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a5238'; g.fillRect(0, 0, w, h * 0.3);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(C, h * 0.62, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b98b62'; g.beginPath(); g.ellipse(C, h * 0.62, 10, 6, 0, 0, Math.PI * 2); g.fill();
      ftext(g, 'CAFÉ LATTE', C, h * 0.15, 110, 18, F.en, 900, '#f3e6d2');
      ftext(g, 'カフェラテ', C, h * 0.9, 100, 13, F.sans, 700, '#6d472f');
    });
    // swatches
    const sw = (i, c) => { const [x, y] = swatchPx(i); g.fillStyle = c; g.fillRect(x - 8, y - 8, 16, 16); };
    sw(SWATCH.silver, '#c9ced4'); sw(SWATCH.lid, '#b3b9c0'); sw(SWATCH.dark, '#4b4d52');
    for (const p of Object.values(PRODUCTS)) if (p.cap) { sw(p.capSw, p.cap); sw(p.liqSw, p.liquid); }
  }, { key: 'props.vend.atlas', anisotropy: 8 });

  // ---------------------------------------------------------------- brand headers (1024x224)
  const headers = {};
  headers.haru = T.draw(1024, 224, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f3b6c9'); gr.addColorStop(1, '#fbe2ea');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(560, 190); g.bezierCurveTo(700, 120, 820, 210, 1000, 110); g.stroke();
    g.beginPath(); g.moveTo(620, 212); g.bezierCurveTo(760, 160, 860, 230, 1010, 160); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(120, h / 2, 82, 0, Math.PI * 2); g.fill();
    sakuraFlower(g, 120, h / 2, 64, '#ee92ae', '#d4577d');
    ftext(g, 'はるかぜ飲料', 560, 96, 640, 96, F.round, 900, '#b24a6d');
    ftext(g, 'HARUKAZE BEVERAGE', 560, 176, 560, 30, F.en, 700, '#c96a8a');
    for (const [x, y, r] of [[900, 48, 14], [960, 86, 10], [870, 190, 9]]) sakuraFlower(g, x, y, r, '#ffffff', '#f1a3ba');
  }, { key: 'props.vend.head.haru' });
  headers.sakura = T.draw(1024, 224, (g, w, h) => {
    g.fillStyle = '#fbf2ec'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d24b44'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    sakuraFlower(g, 118, h / 2, 76, '#d9544c', '#fbf2ec');
    ftext(g, 'SAKURA', 470, 100, 520, 110, F.en, 900, '#cc453e');
    ftext(g, 'DRINKS', 850, 104, 270, 64, F.en, 900, '#e0857c');
    ftext(g, 'さくらドリンクス', 560, 178, 600, 34, F.round, 900, '#b8433d');
  }, { key: 'props.vend.head.sakura' });
  headers.aozora = T.draw(1024, 224, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2f6db8'); gr.addColorStop(1, '#6aa6e0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, rx, ry] of [[860, 150, 90, 34], [930, 120, 60, 36], [800, 130, 50, 28], [150, 70, 60, 20], [200, 58, 40, 22]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    ftext(g, 'あおぞら', 420, 98, 560, 104, F.round, 900, '#ffffff');
    ftext(g, 'AOZORA DRINK · 飲料', 420, 180, 560, 32, F.en, 700, '#dcecfb');
  }, { key: 'props.vend.head.aozora' });
  headers.midori = T.draw(1024, 224, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2e7c58'); gr.addColorStop(1, '#46996f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#bfe3c4'; g.beginPath(); g.ellipse(112, 100, 34, 70, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8fd0a0'; g.beginPath(); g.ellipse(160, 130, 26, 54, -0.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2e7c58'; g.lineWidth = 4; g.beginPath(); g.moveTo(80, 150); g.quadraticCurveTo(112, 100, 138, 44); g.stroke();
    ftext(g, 'みどり茶房', 560, 98, 640, 100, F.brush, 700, '#ffffff');
    ftext(g, 'MIDORI SABOU — お茶のある毎日', 560, 182, 640, 30, F.sans, 700, '#d7efdf');
  }, { key: 'props.vend.head.midori' });

  // ---------------------------------------------------------------- side graphics (384x1024), alpha
  const sides = {};
  sides.haru = T.draw(256, 683, (g) => { g.scale(256 / 384, 683 / 1024); const w = 384, h = 1024;   // [v3:town] 2/3 scale (canvas budget)

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(238,146,174,0.9)'; g.fillRect(0, 0, w, 40);
    g.fillStyle = 'rgba(243,182,201,0.85)';
    g.beginPath(); g.moveTo(0, h * 0.58); g.bezierCurveTo(w * 0.4, h * 0.5, w * 0.6, h * 0.7, w, h * 0.6); g.lineTo(w, h * 0.72); g.bezierCurveTo(w * 0.6, h * 0.8, w * 0.4, h * 0.62, 0, h * 0.7); g.fill();
    for (const [x, y, r] of [[90, 220, 44], [270, 330, 30], [150, 440, 22], [300, 820, 38], [80, 900, 26]]) sakuraFlower(g, x, y, r, 'rgba(236,140,170,0.85)', 'rgba(210,90,125,0.9)');
    g.fillStyle = 'rgba(178,74,109,0.95)'; vtext(g, 'はるかぜ', w / 2, 480, 56, F.round, 900, 1.02);
  }, { key: 'props.vend.side.haru' });
  sides.sakura = T.draw(256, 683, (g) => { g.scale(256 / 384, 683 / 1024); const w = 384, h = 1024;   // [v3:town] 2/3 scale (canvas budget)

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(251,242,236,0.95)'; g.fillRect(w * 0.18, 0, w * 0.64, h);
    sakuraFlower(g, w / 2, 190, 110, 'rgba(215,84,76,0.95)', 'rgba(251,242,236,1)');
    g.fillStyle = 'rgba(204,69,62,1)'; vtext(g, 'SAKURA', w / 2, 360, 62, F.en, 900, 0.98);
    for (const [x, y, r] of [[w / 2 - 50, 850, 20], [w / 2 + 40, 920, 26]]) sakuraFlower(g, x, y, r, 'rgba(224,133,124,0.9)', null);
  }, { key: 'props.vend.side.sakura' });
  sides.aozora = T.draw(256, 683, (g) => { g.scale(256 / 384, 683 / 1024); const w = 384, h = 1024;   // [v3:town] 2/3 scale (canvas budget)

    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(47,109,184,0.95)'); gr.addColorStop(0.55, 'rgba(106,166,224,0.7)'); gr.addColorStop(1, 'rgba(106,166,224,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.7);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [x, y, rx, ry] of [[120, 160, 90, 40], [230, 140, 70, 46], [280, 520, 80, 30], [160, 560, 50, 26]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,1)'; vtext(g, 'あおぞら', w / 2, 250, 58, F.round, 900, 1.02);
  }, { key: 'props.vend.side.aozora' });
  sides.midori = T.draw(256, 683, (g) => { g.scale(256 / 384, 683 / 1024); const w = 384, h = 1024;   // [v3:town] 2/3 scale (canvas budget)

    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(46,124,88,0.92)'; g.fillRect(0, h * 0.1, w, h * 0.46);
    g.fillStyle = 'rgba(191,227,196,0.95)'; g.beginPath(); g.ellipse(w * 0.3, h * 0.72, 60, 130, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(143,208,160,0.95)'; g.beginPath(); g.ellipse(w * 0.66, h * 0.8, 44, 100, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; vtext(g, '茶房', w / 2, h * 0.14, 110, F.brush, 700, 1.04);
    ftext(g, 'お茶のある毎日', w / 2, h * 0.5, 300, 34, F.sans, 700, '#e3f3e8');
  }, { key: 'props.vend.side.midori' });

  // ---------------------------------------------------------------- grime (alpha)
  const grime = (strong) => T.draw(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const a = strong ? 1 : 0.6;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,108,96,0)'); gr.addColorStop(0.6, `rgba(120,108,96,${0.14 * a})`); gr.addColorStop(1, `rgba(104,92,82,${0.42 * a})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let s = strong ? 7 : 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) { // rain streaks
      const x = rnd() * w, y0 = rnd() * h * 0.5, l = 20 + rnd() * 70;
      g.strokeStyle = `rgba(110,98,90,${(0.06 + rnd() * 0.1) * a})`; g.lineWidth = 1 + rnd() * 2;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (rnd() - 0.5) * 3, y0 + l); g.stroke();
    }
    for (let i = 0; i < 8; i++) { // scratches
      const x = rnd() * w, y = h * 0.4 + rnd() * h * 0.55, l = 6 + rnd() * 16, an = (rnd() - 0.5) * 1.2;
      g.strokeStyle = `rgba(255,255,255,${0.25 * a})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
    }
    // splash band at the very bottom
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(96,86,78,${(0.08 + rnd() * 0.12) * a})`; g.beginPath(); g.arc(rnd() * w, h - rnd() * 16, 1 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
  }, { key: 'props.vend.grime' + (strong ? 'S' : '') });

  // ---------------------------------------------------------------- price rails per machine
  // rows: [{slots:[{price, hot}]}] x 3 ; slot x positions in metres (-0.455..0.455 over 1024 px)
  function rails(id, rows, xs) {
    return T.draw(1024, 160, (g) => {
      g.fillStyle = '#e4e8ec'; g.fillRect(0, 0, 1024, 160);
      rows.forEach((row, r) => {
        const y0 = r * 53;
        g.fillStyle = '#d3d8de'; g.fillRect(0, y0, 1024, 3); g.fillRect(0, y0 + 49, 1024, 3);
        row.forEach((s, i) => {
          const cx = (xs[i] + 0.455) / 0.91 * 1024;
          g.fillStyle = s.hot ? '#d94a3e' : '#2f6fc9';
          rr(g, cx - 52, y0 + 32, 104, 17, 4); g.fill();
          ftext(g, s.hot ? 'あったか〜い' : 'つめた〜い', cx, y0 + 41, 98, 14, F.sans, 900, '#ffffff');
          g.fillStyle = '#fbfbf8'; rr(g, cx - 40, y0 + 6, 80, 23, 5); g.fill();
          g.strokeStyle = '#9aa3ad'; g.lineWidth = 1.5; rr(g, cx - 40, y0 + 6, 80, 23, 5); g.stroke();
          g.fillStyle = '#2a2d36'; g.font = `900 20px ${F.en}`; g.textAlign = 'right'; g.textBaseline = 'middle';
          g.fillText(String(s.price), cx + 16, y0 + 18);
          g.font = `700 12px ${F.sans}`; g.textAlign = 'left'; g.fillText('円', cx + 18, y0 + 20);
          if (s.sold) { g.fillStyle = '#e03a3a'; g.font = `900 12px ${F.sans}`; g.textAlign = 'center'; g.fillText('売切', cx - 28, y0 + 18); }
        });
      });
    }, { key: 'props.vend.rails.' + id, anisotropy: 8 });
  }

  // ---------------------------------------------------------------- lower door panel per machine (512x448, alpha)
  // panel covers local x -0.475..0.475, y 0.025..0.855
  const PX = (x) => (x + 0.475) / 0.95 * 512, PY = (y) => (0.855 - y) / 0.83 * 448;
  const ADS = {
    sakuraLatte: (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#fbd9e3'); gr.addColorStop(1, '#f6b9cb'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      for (let i = 0; i < 14; i++) sakuraFlower(g, x + ((i * 97) % w), y + ((i * 61) % h), 8 + (i % 4) * 3, 'rgba(255,255,255,0.8)', null);
      g.fillStyle = '#f7e9ee'; rr(g, x + w * 0.64, y + h * 0.2, w * 0.18, h * 0.7, 16); g.fill();
      g.fillStyle = '#eea3ba'; rr(g, x + w * 0.64, y + h * 0.44, w * 0.18, h * 0.28, 4); g.fill();
      sakuraFlower(g, x + w * 0.73, y + h * 0.58, 12, '#ffffff', '#e0708f');
      g.fillStyle = '#e98aa6'; rr(g, x + w * 0.69, y + h * 0.1, w * 0.08, h * 0.11, 3); g.fill();
      g.fillStyle = '#b8456a'; vtext(g, 'さくら香る', x + w * 0.93, y + 16, 22, F.round, 900, 1.0);
      ftext(g, 'さくらラテ', x + w * 0.31, y + h * 0.3, w * 0.56, 46, F.round, 900, '#b8456a');
      g.fillStyle = '#d9463b'; rr(g, x + 20, y + h * 0.5, 118, 42, 10); g.fill();
      ftext(g, '春限定', x + 79, y + h * 0.5 + 21, 108, 28, F.sans, 900, '#ffffff');
      ftext(g, '新発売', x + w * 0.31, y + h * 0.84, w * 0.5, 30, F.sans, 900, '#b8456a');
    },
    sakuraSoda: (g, x, y, w, h) => {
      g.fillStyle = '#fbf2ec'; g.fillRect(x, y, w, h);
      g.fillStyle = '#f3b6c6'; g.beginPath(); g.arc(x + w * 0.72, y + h * 0.5, h * 0.42, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + w * 0.6 + ((i * 37) % 90), y + 30 + ((i * 53) % (h - 60)), 4 + (i % 3) * 2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#d9544c'; rr(g, x + w * 0.64, y + h * 0.24, w * 0.16, h * 0.56, 8); g.fill();
      sakuraFlower(g, x + w * 0.72, y + h * 0.48, 18, '#ffffff', null);
      ftext(g, '桜ソーダ', x + w * 0.3, y + h * 0.36, w * 0.54, 52, F.round, 900, '#cc453e');
      ftext(g, 'しゅわっと、春。', x + w * 0.3, y + h * 0.62, w * 0.54, 28, F.round, 700, '#b8433d');
      ftext(g, 'NEW', x + w * 0.3, y + h * 0.85, w * 0.4, 30, F.en, 900, '#e0857c');
    },
    water: (g, x, y, w, h) => {
      const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#dcefff'); gr.addColorStop(1, '#9fcde9'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x, y + h * 0.75); g.lineTo(x + w * 0.3, y + h * 0.35); g.lineTo(x + w * 0.45, y + h * 0.55); g.lineTo(x + w * 0.62, y + h * 0.28); g.lineTo(x + w, y + h * 0.72); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
      g.fillStyle = '#7fb6de'; g.fillRect(x, y + h * 0.84, w, h * 0.16);
      ftext(g, '安波山の天然水', x + w / 2, y + h * 0.16, w * 0.9, 44, F.serif, 900, '#2b5d99');
      ftext(g, 'いつでも、すっきり。', x + w / 2, y + h * 0.92, w * 0.8, 24, F.sans, 700, '#ffffff');
    },
    tea: (g, x, y, w, h) => {
      g.fillStyle = '#eaf3e1'; g.fillRect(x, y, w, h);
      g.fillStyle = '#9cc782'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x + w * 0.75 + (i % 2) * 30, y + 40 + i * 42, 18, 36, 0.6 * (i % 2 ? 1 : -1), 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#2f6b3f'; vtext(g, '新茶の季節', x + w * 0.52, y + 16, 34, F.brush, 700, 1.0);
      ftext(g, 'みどり茶', x + w * 0.24, y + h * 0.4, w * 0.44, 46, F.brush, 700, '#2f6b3f');
      ftext(g, '国産茶葉100%', x + w * 0.24, y + h * 0.62, w * 0.44, 22, F.sans, 700, '#3d7a4a');
      g.fillStyle = '#3f8a55'; rr(g, x + 20, y + h * 0.74, 140, 40, 8); g.fill();
      ftext(g, '160円', x + 90, y + h * 0.74 + 20, 130, 28, F.sans, 900, '#ffffff');
    },
    coffee: (g, x, y, w, h) => {
      g.fillStyle = '#2e416b'; g.fillRect(x, y, w, h);
      g.fillStyle = '#f4ead8'; g.beginPath(); g.arc(x + w * 0.74, y + h * 0.55, h * 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6b4a36'; g.beginPath(); g.arc(x + w * 0.74, y + h * 0.55, h * 0.22, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + w * 0.68 + i * 16, y + h * 0.2); g.quadraticCurveTo(x + w * 0.66 + i * 16, y + h * 0.1, x + w * 0.7 + i * 16, y + 8); g.stroke(); }
      ftext(g, '朝の一杯に。', x + w * 0.3, y + h * 0.3, w * 0.54, 34, F.serif, 900, '#f4ead8');
      ftext(g, '微糖コーヒー', x + w * 0.3, y + h * 0.56, w * 0.54, 40, F.serif, 900, '#e5c98f');
      ftext(g, 'あったか〜いも あります', x + w * 0.3, y + h * 0.82, w * 0.56, 22, F.sans, 700, '#f39a8a');
    },
    ichigo: (g, x, y, w, h) => {
      g.fillStyle = '#f7d6de'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(x + (i * 41) % w, y + (i * 67) % h, 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e2465c'; g.beginPath(); g.arc(x + w * 0.76, y + h * 0.5, 50, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6aa46c'; g.beginPath(); g.ellipse(x + w * 0.76, y + h * 0.5 - 50, 26, 10, 0, 0, Math.PI * 2); g.fill();
      ftext(g, 'いちごみるく', x + w * 0.34, y + h * 0.38, w * 0.62, 44, F.round, 900, '#d33d5a');
      ftext(g, 'やさしい甘さ', x + w * 0.34, y + h * 0.64, w * 0.6, 26, F.round, 700, '#b8456a');
    },
    lemon: (g, x, y, w, h) => {
      g.fillStyle = '#fff3b0'; g.fillRect(x, y, w, h);
      g.fillStyle = '#f3d84f'; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.42, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff9d8'; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.42, 56, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f3d84f'; g.lineWidth = 5; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(x + w * 0.78, y + h * 0.42); g.lineTo(x + w * 0.78 + 56 * Math.cos(i * 0.785), y + h * 0.42 + 56 * Math.sin(i * 0.785)); g.stroke(); }
      ftext(g, 'レモンソーダ', x + w * 0.32, y + h * 0.32, w * 0.6, 44, F.round, 900, '#2f6fb5');
      ftext(g, 'しゅわっと春', x + w * 0.32, y + h * 0.58, w * 0.58, 30, F.round, 900, '#3f86c9');
      ftext(g, '150円', x + w * 0.32, y + h * 0.84, w * 0.4, 30, F.sans, 900, '#e0853a');
    },
  };
  function lowerPanel(id, brand, ad, opts = {}) {
    const B = BRANDS[brand];
    return T.draw(512, 448, (g) => {
      g.clearRect(0, 0, 512, 448);
      // ad poster (frame + art)
      const ax = PX(-0.45), ay = PY(0.84), aw = PX(0.215) - ax, ah = PY(0.33) - ay;
      g.fillStyle = 'rgba(80,80,90,0.35)'; rr(g, ax - 5, ay - 5, aw + 10, ah + 10, 10); g.fill();
      g.save(); rr(g, ax, ay, aw, ah, 8); g.clip();
      (ADS[ad] || ADS.water)(g, ax, ay, aw, ah);
      if (opts.faded) { g.fillStyle = 'rgba(255,250,240,0.32)'; g.fillRect(ax, ay, aw, ah); }
      g.restore();
      // payment column
      const px = PX(0.245), pw = PX(0.455) - px, py = PY(0.845), ph = PY(0.3) - py;
      g.fillStyle = '#434a57'; rr(g, px, py, pw, ph, 10); g.fill();
      g.fillStyle = '#2b3038'; rr(g, px + 14, py + 10, pw - 28, 22, 4); g.fill();
      g.fillStyle = '#ff6a4a'; g.font = `700 16px ${F.en}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('- - -', px + pw / 2, py + 22);
      const lab = (t, y, s = 12) => ftext(g, t, px + pw / 2, PY(y), pw - 10, s, F.sans, 700, '#e8ecf1');
      lab('硬貨', 0.795, 12); lab('10・50・100・500円', 0.7, 9);
      lab('千円札のみ', 0.595, 12);
      lab('交通系IC・電子マネー', 0.445, 9);
      lab('おつり', 0.405, 11);
      // take-out door art
      const tx = PX(-0.43), tw = PX(0.17) - tx, ty = PY(0.27), th = PY(0.09) - ty;
      g.fillStyle = '#4a5260'; rr(g, tx, ty, tw, th, 8); g.fill();
      const gr = g.createLinearGradient(0, ty, 0, ty + th); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = gr; rr(g, tx, ty, tw, th, 8); g.fill();
      ftext(g, '取出口', tx + tw / 2, ty + th * 0.42, tw * 0.6, 26, F.sans, 900, '#e8ecf1');
      ftext(g, 'PUSH ▼', tx + tw / 2, ty + th * 0.78, tw * 0.5, 13, F.en, 700, '#c5cdd8');
      // management sticker near the bottom right
      g.fillStyle = '#f6f4ef'; rr(g, PX(0.25), PY(0.26), PX(0.45) - PX(0.25), PY(0.14) - PY(0.26), 4); g.fill();
      ftext(g, B.name, PX(0.35), PY(0.235), 90, 11, F.sans, 900, '#3a3346');
      ftext(g, '管理番号 ' + (opts.no || 'SK-01'), PX(0.35), PY(0.205), 96, 10, F.sans, 700, '#5a5566');
      ftext(g, '故障の際はご連絡ください', PX(0.35), PY(0.172), 96, 8, F.sans, 500, '#5a5566');
      // brand strip above the kick plate
      ftext(g, B.en || B.jp || '', PX(0.0), PY(0.055), 300, 14, F.en, 700, 'rgba(60,56,70,0.55)');
    }, { key: 'props.vend.lower.' + id, anisotropy: 8 });
  }

  // ---------------------------------------------------------------- flap, IC face, back panel, liners
  const icFace = T.draw(128, 96, (g, w, h) => {
    g.fillStyle = '#2d3440'; rr(g, 0, 0, w, h, 14); g.fill();
    g.strokeStyle = '#7fd0ff'; g.lineWidth = 5; rr(g, 8, 8, w - 16, h - 16, 10); g.stroke();
    g.fillStyle = '#bfe8ff'; g.font = `900 28px ${F.en}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('IC', w / 2, h / 2 - 4);
    g.strokeStyle = '#bfe8ff'; g.lineWidth = 3; for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(w / 2 + 26, h / 2 - 4, i * 5, -0.8, 0.8); g.stroke(); }
    g.font = `700 11px ${F.sans}`; g.fillText('タッチ', w / 2, h - 20);
  }, { key: 'props.vend.ic' });
  const backPanel = T.draw(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#eaf3fb'); gr.addColorStop(1, '#dbe9f6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200,216,232,0.8)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  }, { key: 'props.vend.back' });

  // ---------------------------------------------------------------- さくらぽん sticker (256x256)
  const sticker = T.draw(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f7c9d6'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
    // body/face (a round tanuki with a sakura on its head)
    g.fillStyle = '#c99a6e'; g.beginPath(); g.ellipse(128, 124, 64, 56, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c99a6e'; g.beginPath(); g.arc(78, 78, 18, 0, Math.PI * 2); g.arc(178, 78, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4e6d4'; g.beginPath(); g.ellipse(128, 138, 42, 34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b4a3a'; g.beginPath(); g.ellipse(100, 116, 20, 15, -0.3, 0, Math.PI * 2); g.ellipse(156, 116, 20, 15, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3346'; g.beginPath(); g.arc(102, 116, 8, 0, Math.PI * 2); g.arc(154, 116, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(105, 112, 3, 0, Math.PI * 2); g.arc(157, 112, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3346'; g.beginPath(); g.ellipse(128, 136, 8, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3346'; g.lineWidth = 3; g.beginPath(); g.arc(120, 144, 8, 0.2, 2.6); g.stroke(); g.beginPath(); g.arc(136, 144, 8, 0.5, 2.9); g.stroke();
    g.fillStyle = 'rgba(240,120,150,0.6)'; g.beginPath(); g.ellipse(84, 142, 11, 7, 0, 0, Math.PI * 2); g.ellipse(172, 142, 11, 7, 0, 0, Math.PI * 2); g.fill();
    sakuraFlower(g, 150, 70, 22, '#f08fb0', '#ffffff');
    // name
    g.fillStyle = '#ffffff'; rr(g, 50, 184, 156, 40, 18); g.fill();
    ftext(g, 'かもめくん', 128, 205, 144, 28, F.round, 900, '#d24f7a');
    ftext(g, '内湾 みなとまつり', 128, 238, 150, 11, F.sans, 700, '#b8456a');
  }, { key: 'props.sticker.sakurapon' });

  // ---------------------------------------------------------------- nobori flag for the station pair (128x448)
  const flag = T.draw(128, 448, (g, w, h) => {
    g.fillStyle = '#fbe3ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e98aa6'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 26, w, 26);
    for (const [x, y, r] of [[26, 60, 14], [104, 150, 11], [22, 330, 12], [100, 380, 15]]) sakuraFlower(g, x, y, r, '#f4b3c6', '#e0708f');
    g.fillStyle = '#d9463b'; rr(g, 18, 34, 92, 40, 8); g.fill();
    ftext(g, '春限定', 64, 55, 84, 28, F.sans, 900, '#ffffff');
    vtext(g, 'さくらドリンク', 64, 88, 36, F.round, 900, 1.0, '#b8456a');
    ftext(g, '販売中', 64, h - 13, 100, 18, F.sans, 900, '#ffffff');
  }, { key: 'props.flag.sakura' });

  // ---------------------------------------------------------------- recycle bin front (256x320)
  const bin = (style) => T.draw(256, 320, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const col = style === 'old' ? '#4d8a6a' : style === 'red' ? '#d24b44' : '#2f6fc9';
    g.fillStyle = col; rr(g, 12, 150, w - 24, 150, 12); g.fill();
    ftext(g, '空き缶・ペットボトル', w / 2, 184, w - 40, 24, F.sans, 900, '#ffffff');
    ftext(g, 'CANS & PET BOTTLES', w / 2, 212, w - 60, 13, F.en, 700, 'rgba(255,255,255,0.85)');
    // recycle arrows
    g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { const a = i * 2.094 - 1.57; g.beginPath(); g.arc(w / 2, 256, 22, a + 0.25, a + 1.75); g.stroke(); const ex = w / 2 + 22 * Math.cos(a + 1.75), ey = 256 + 22 * Math.sin(a + 1.75); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, 5, 0, Math.PI * 2); g.fill(); }
    ftext(g, 'リサイクルにご協力ください', w / 2, 290, w - 40, 12, F.sans, 700, '#ffffff');
    if (style === 'old') { g.fillStyle = 'rgba(255,250,240,0.25)'; g.fillRect(12, 150, w - 24, 150); }
  }, { key: 'props.bin.' + style });

  // ---------------------------------------------------------------- crate side (256x128)
  const crate = (c) => T.draw(256, 128, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,36,50,0.45)';
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { rr(g, 14 + i * 39, 22 + r * 46, 28, 32, 6); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, w, 8);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = `900 12px ${F.en}`; g.textAlign = 'center'; g.fillText('HARUKAZE', w / 2, h - 6);
  }, { key: 'props.crate.' + c });

  return { atlas, headers, sides, grime, rails, lowerPanel, icFace, backPanel, sticker, flag, bin, crate };
}
