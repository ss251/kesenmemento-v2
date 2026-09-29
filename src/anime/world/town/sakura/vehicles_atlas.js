// [v3:town] vendored from Sakuragaoka Station src/world/vehicles/atlas.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// [v3:fix] leftover Sakura text replaced with local fictional names (魚町 plates, コーポうみねこ, みなと不動産, Kesennuma Sta.; no phone numbers)
// One 1024² canvas atlas for every textured bit of the vehicles module (number plates, liveries,
// stickers, price tags, bicycle spokes, basket wire mesh, hubcaps) + the shared material set.
// All alpha/atlas geometry of every vehicle shares ONE material => one draw call per batch cell.
import * as THREE from 'three';

const S = 1024;
// regions in canvas pixels [x, y, w, h]
export const R = {
  plVan: [0, 0, 256, 128], plKei: [256, 0, 256, 128], plTaxi: [512, 0, 256, 128], plCar: [768, 0, 256, 128],
  taxiDoor: [0, 128, 512, 128], vanSide: [512, 128, 512, 128],
  andon: [0, 256, 256, 128], kusha: [256, 256, 128, 64], kinen: [256, 320, 128, 64],
  tag1: [384, 256, 128, 128], tag2: [512, 256, 128, 128], tag3: [640, 256, 128, 128],
  beginner: [768, 256, 64, 64], emblem: [832, 256, 64, 64], seibi: [896, 256, 128, 64],
  reg: [768, 320, 128, 64], park: [896, 320, 128, 64],
  brandW1: [0, 384, 256, 64], brandD1: [256, 384, 256, 64], brandW2: [512, 384, 256, 64], brandD2: [768, 384, 256, 64],
  brandW3: [0, 448, 256, 64], brandD3: [256, 448, 256, 64], taxiRear: [512, 448, 256, 64], vanRear: [768, 448, 256, 64],
  basket: [0, 512, 256, 256], capTaxi: [256, 512, 128, 128], capCover: [384, 512, 128, 128],
  capSteel: [256, 640, 128, 128], capCompact: [384, 640, 128, 128],
  spokes: [512, 512, 512, 512],
  grille: [0, 768, 256, 128], vanGrille: [256, 768, 256, 128], lace: [0, 896, 256, 128],
  bag: [256, 896, 128, 128], charm: [384, 896, 64, 64], sakuraMark: [448, 896, 64, 64],
};

/** remap a geometry's 0..1 uv attribute into atlas region `r` (optionally sub-rect u0,v0,u1,v1 of it) */
export function uvInto(r, sub) {
  const [x, y, w, h] = r;
  const u0 = x / S, u1 = (x + w) / S, v1 = 1 - y / S, v0 = 1 - (y + h) / S;
  const [a0, b0, a1, b1] = sub || [0, 0, 1, 1];
  return (uv) => {
    for (let i = 0; i < uv.count; i++) {
      const u = a0 + (a1 - a0) * uv.getX(i), v = b0 + (b1 - b0) * uv.getY(i);
      uv.setXY(i, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v);
    }
  };
}

let _atlasFor = null, _atlas = null;
export function getAtlas(ctx) {
  if (_atlas && _atlasFor === ctx) return _atlas;
  const T = ctx.tex, F = T.FONTS;
  const tex = T.draw(S, S, (g) => {
    g.clearRect(0, 0, S, S);
    const box = (r, fn) => { g.save(); g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip(); g.translate(r[0], r[1]); fn(r[2], r[3]); g.restore(); };
    const rr = (x, y, w, h, rad) => { T.roundRect(g, x, y, w, h, rad); };
    const txt = (s, x, y, size, font, color, weight = 700, align = 'center', maxW = 9999) => {
      g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
      T.fitText(g, s, x, y, maxW, size, font, weight);
    };
    const sakura = (cx, cy, r, fill, center = '#f7e8a8') => {
      g.fillStyle = fill;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        g.save(); g.translate(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); g.rotate(a + Math.PI / 2);
        // petal with the little notch at the tip (two lobes)
        g.beginPath(); g.moveTo(0, r * 0.5);
        g.bezierCurveTo(-r * 0.55, r * 0.2, -r * 0.42, -r * 0.42, -r * 0.1, -r * 0.5);
        g.lineTo(0, -r * 0.36); g.lineTo(r * 0.1, -r * 0.5);
        g.bezierCurveTo(r * 0.42, -r * 0.42, r * 0.55, r * 0.2, 0, r * 0.5);
        g.fill(); g.restore();
      }
      g.fillStyle = center; g.beginPath(); g.arc(cx, cy, r * 0.18, 0, Math.PI * 2); g.fill();
    };

    // ------------------------------------------------------------ number plates (fictional 桜ヶ丘 region)
    const plate = (r, bg, fg, cls, kana, num) => box(r, (w, h) => {
      g.fillStyle = bg; rr(2, 2, w - 4, h - 4, 10); g.fill();
      g.lineWidth = 3; g.strokeStyle = fg; g.globalAlpha = 0.55; rr(6, 6, w - 12, h - 12, 8); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = fg; g.globalAlpha = 0.5;
      for (const bx of [w * 0.2, w * 0.8]) { g.beginPath(); g.arc(bx, 17, 5, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      txt('宮城', w * 0.43, 30, 30, F.sans, fg, 700, 'center', 90);
      txt(cls, w * 0.68, 30, 30, F.sans, fg, 700, 'center', 70);
      txt(kana, 30, 88, 34, F.sans, fg, 500, 'center', 40);
      txt(num, w * 0.58, 86, 66, F.sans, fg, 700, 'center', 180);
    });
    plate(R.plVan, '#f2d34a', '#2e2c33', '480', 'す', '21-47');
    plate(R.plKei, '#f2d34a', '#2e2c33', '580', 'さ', '33-91');
    plate(R.plTaxi, '#2f7a4f', '#f2f1ea', '500', 'か', '25-11');
    plate(R.plCar, '#f1f0ea', '#2f6b48', '530', 'ね', '88-21');

    // ------------------------------------------------------------ taxi door livery
    box(R.taxiDoor, (w, h) => {
      sakura(58, 64, 44, '#e78aa6');
      txt('みなとタクシー', 290, 54, 70, F.round, '#9a4760', 700, 'center', 380);
      txt('MINATO TAXI', 290, 106, 24, F.en, '#9a4760', 700, 'center', 380);
    });
    // ------------------------------------------------------------ van side lettering
    box(R.vanSide, (w, h) => {
      txt('有限会社', 70, 48, 26, F.sans, '#3b5a86', 700, 'center', 110);
      txt('かもめ設備', 300, 50, 76, F.round, '#2f5d95', 700, 'center', 320);
      g.fillStyle = '#e58aa6'; g.fillRect(20, 88, w - 40, 3);
      txt('水道工事・給湯器・リフォーム', w / 2, 112, 26, F.sans, '#3b4a66', 700, 'center', w - 40);
    });
    // ------------------------------------------------------------ taxi roof sign (andon)
    box(R.andon, (w, h) => {
      g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c96b86'; g.fillRect(0, h - 22, w, 22);
      sakura(48, 54, 34, '#e68ea8');
      txt('宮城', 160, 36, 34, F.round, '#8a3f58', 700, 'center', 150);
      txt('TAXI', 160, 78, 40, F.en, '#8a3f58', 900, 'center', 150);
    });
    box(R.kusha, (w, h) => {
      g.fillStyle = '#2b2830'; rr(0, 0, w, h, 8); g.fill();
      txt('空車', w / 2, h / 2 + 2, 50, F.sans, '#ff4a3a', 900, 'center', w - 10);
    });
    box(R.kinen, (w, h) => {
      g.fillStyle = '#f2f0ea'; rr(2, 2, w - 4, h - 4, 10); g.fill();
      g.strokeStyle = '#d9463b'; g.lineWidth = 5; g.beginPath(); g.arc(30, 32, 20, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(16, 18); g.lineTo(44, 46); g.stroke();
      txt('禁煙車', 86, 33, 30, F.sans, '#3a3346', 700, 'center', 76);
    });
    // ------------------------------------------------------------ price tags (bike shop new bikes)
    const tag = (r, price, l1, l2) => box(r, (w, h) => {
      g.fillStyle = '#f7f4ec'; rr(4, 4, w - 8, h - 8, 10); g.fill();
      g.fillStyle = '#d9463b'; g.fillRect(4, 4, w - 8, 30);
      txt('新車', w / 2, 20, 24, F.sans, '#fffaf0', 900, 'center', w - 16);
      txt(price, w / 2, 58, 34, F.sans, '#c8312c', 900, 'center', w - 12);
      txt(l1, w / 2, 86, 17, F.sans, '#3a3346', 700, 'center', w - 12);
      txt(l2, w / 2, 106, 15, F.sans, '#3a3346', 500, 'center', w - 12);
      g.fillStyle = '#9a94a0'; g.beginPath(); g.arc(w / 2, 44, 0, 0, 1); g.fill();
    });
    tag(R.tag1, '¥29,800', '27インチ 3段変速', 'オートライト 税込');
    tag(R.tag2, '¥32,800', '26インチ 内装3段', 'ステンレスカゴ 税込');
    tag(R.tag3, '¥24,800', '24インチ 通学に', '防犯登録料別 税込');
    // ------------------------------------------------------------ small stickers
    box(R.beginner, (w, h) => { // 初心者マーク (green/yellow chevron)
      g.beginPath(); g.moveTo(8, 4); g.lineTo(32, 18); g.lineTo(56, 4); g.lineTo(56, 44); g.lineTo(32, 60); g.lineTo(8, 44); g.closePath();
      g.fillStyle = '#f7f7f0'; g.fill();
      g.beginPath(); g.moveTo(12, 10); g.lineTo(30, 21); g.lineTo(30, 55); g.lineTo(12, 43); g.closePath(); g.fillStyle = '#e8c52e'; g.fill();
      g.beginPath(); g.moveTo(52, 10); g.lineTo(34, 21); g.lineTo(34, 55); g.lineTo(52, 43); g.closePath(); g.fillStyle = '#35a05a'; g.fill();
    });
    box(R.emblem, (w, h) => { g.fillStyle = '#e9d9a0'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill(); sakura(32, 32, 20, '#f2b5c8', '#c9a64a'); });
    box(R.seibi, (w, h) => {
      g.fillStyle = '#f2f0e8'; rr(2, 2, w - 4, h - 4, 12); g.fill(); g.strokeStyle = '#3f8f5b'; g.lineWidth = 4; rr(6, 6, w - 12, h - 12, 10); g.stroke();
      txt('整備済', w / 2, h / 2 + 1, 34, F.sans, '#3f8f5b', 900, 'center', w - 20);
    });
    box(R.reg, (w, h) => {
      g.fillStyle = '#f2d34a'; rr(2, 2, w - 4, h - 4, 8); g.fill();
      txt('防犯登録', w / 2, 20, 22, F.sans, '#2e2c33', 900, 'center', w - 12);
      txt('気仙沼 482113', w / 2, 46, 17, F.sans, '#2e2c33', 700, 'center', w - 12);
    });
    box(R.park, (w, h) => {
      g.fillStyle = '#5b86c4'; rr(2, 2, w - 4, h - 4, 8); g.fill();
      txt('内湾 駐輪場', w / 2, 20, 19, F.sans, '#f4f2ea', 900, 'center', w - 12);
      txt('定期 2026', w / 2, 46, 20, F.sans, '#f4f2ea', 700, 'center', w - 12);
    });
    // ------------------------------------------------------------ bicycle brand decals (fictional)
    const brand = (r, text, sub, fg) => box(r, (w, h) => {
      g.save(); g.transform(1, 0, -0.22, 1, 8, 0);
      txt(text, w * 0.46, 26, 40, F.en, fg, 900, 'center', w - 30);
      g.restore();
      txt(sub, w * 0.5, 54, 16, F.sans, fg, 700, 'center', w - 30);
    });
    brand(R.brandW1, 'Harukaze', 'ハルカゼ号 City 27', '#f4f1ea');
    brand(R.brandD1, 'Harukaze', 'ハルカゼ号 City 27', '#3d3a48');
    brand(R.brandW2, 'MIYAKO', 'みやこ シティサイクル', '#f4f1ea');
    brand(R.brandD2, 'MIYAKO', 'みやこ シティサイクル', '#3d3a48');
    brand(R.brandW3, 'e-Hana', 'ASSIST  電動アシスト', '#f4f1ea');
    brand(R.brandD3, 'e-Hana', 'ASSIST  電動アシスト', '#3d3a48');
    box(R.taxiRear, (w, h) => {
      g.fillStyle = 'rgba(245,240,230,0.95)'; rr(2, 4, w - 4, h - 8, 10); g.fill();
      txt('みなとタクシー', w / 2, h / 2, 26, F.sans, '#8a3f58', 700, 'center', w - 16);
    });
    box(R.vanRear, (w, h) => {
      txt('かもめ設備', w / 2, h / 2, 30, F.round, '#2f5d95', 700, 'center', w - 16);
    });
    // ------------------------------------------------------------ basket wire mesh (white; tinted per vertex)
    box(R.basket, (w, h) => {
      g.strokeStyle = '#ffffff'; g.lineWidth = 3.4;
      for (let i = 0; i <= 16; i++) { const p = 2 + i * (w - 4) / 16; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    });
    // ------------------------------------------------------------ spokes (tangent-laced, white; tinted per vertex)
    box(R.spokes, (w, h) => {
      const cx = w / 2, cy = h / 2, rim = w / 2 - 4, hubR = w * 0.045;
      g.strokeStyle = '#ffffff'; g.lineCap = 'round';
      g.lineWidth = 3.2;
      const n = 32;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n, dir = i % 2 ? 1 : -1, b = a + dir * 0.55;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * hubR, cy + Math.sin(a) * hubR); g.lineTo(cx + Math.cos(b) * rim, cy + Math.sin(b) * rim); g.stroke();
      }
      g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, rim - 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, hubR + 5, 0, Math.PI * 2); g.fill();
    });
    // ------------------------------------------------------------ hubcaps
    box(R.capTaxi, (w, h) => { // chrome with radial slots
      const c = w / 2; g.fillStyle = '#d5d9dd'; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a9afb6'; for (let i = 0; i < 12; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI / 6); rr(-4, -c * 0.86, 8, c * 0.34, 3); g.fill(); g.restore(); }
      g.strokeStyle = '#b8bdc3'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, c * 0.42, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#eceef0'; g.beginPath(); g.arc(c, c, c * 0.24, 0, Math.PI * 2); g.fill();
    });
    box(R.capCover, (w, h) => { // plastic wheel cover (kei)
      const c = w / 2; g.fillStyle = '#cfd3d8'; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9aa0a8'; for (let i = 0; i < 8; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI / 4); g.beginPath(); g.moveTo(-6, -c * 0.3); g.lineTo(6, -c * 0.3); g.lineTo(12, -c * 0.84); g.lineTo(-12, -c * 0.84); g.closePath(); g.fill(); g.restore(); }
      g.fillStyle = '#e6e8eb'; g.beginPath(); g.arc(c, c, c * 0.22, 0, Math.PI * 2); g.fill();
    });
    box(R.capSteel, (w, h) => { // black steel wheel + small silver cap
      const c = w / 2; g.fillStyle = '#56545d'; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3d3b44'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.ellipse(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62, 7, 11, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#c9cdd2'; g.beginPath(); g.arc(c, c, c * 0.34, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a7adb4'; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.arc(c + Math.cos(a) * c * 0.18, c + Math.sin(a) * c * 0.18, 3.5, 0, Math.PI * 2); g.fill(); }
    });
    box(R.capCompact, (w, h) => { // alloy 5-spoke
      const c = w / 2; g.fillStyle = '#c4c9cf'; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4c4a54'; for (let i = 0; i < 5; i++) { g.save(); g.translate(c, c); g.rotate(i * Math.PI * 2 / 5 + 0.63); g.beginPath(); g.moveTo(-5, -c * 0.3); g.lineTo(5, -c * 0.3); g.quadraticCurveTo(22, -c * 0.6, 14, -c * 0.86); g.lineTo(-14, -c * 0.86); g.quadraticCurveTo(-22, -c * 0.6, -5, -c * 0.3); g.fill(); g.restore(); }
      g.fillStyle = '#e1e4e8'; g.beginPath(); g.arc(c, c, c * 0.2, 0, Math.PI * 2); g.fill();
    });
    // ------------------------------------------------------------ grilles
    box(R.grille, (w, h) => { // taxi chrome grille
      g.fillStyle = '#4a4852'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d4d8dc'; for (let i = 0; i < 6; i++) g.fillRect(0, 8 + i * 20, w, 8);
      g.fillStyle = '#e8eaec'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      sakura(w / 2, h / 2, 22, '#e9a3b8');
    });
    box(R.vanGrille, (w, h) => {
      g.fillStyle = '#4b4953'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3842'; for (let i = 0; i < 5; i++) g.fillRect(8, 12 + i * 22, w - 16, 10);
    });
    box(R.lace, (w, h) => { // 白いレースのシートカバー
      g.fillStyle = '#f1efea'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d8d4cc'; g.lineWidth = 2;
      for (let y = 10; y < h; y += 22) for (let x = 10; x < w; x += 22) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#f1efea'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.arc(x + 8, h - 6, 8, 0, Math.PI); g.fill(); }
    });
    box(R.bag, (w, h) => { // navy school bag side with emblem
      g.fillStyle = '#3f4766'; rr(0, 0, w, h, 10); g.fill();
      g.strokeStyle = '#5b6386'; g.lineWidth = 3; rr(6, 6, w - 12, h - 12, 8); g.stroke();
      g.fillStyle = '#e8d49a'; g.beginPath(); g.arc(w / 2, h * 0.55, 20, 0, Math.PI * 2); g.fill();
      sakura(w / 2, h * 0.55, 14, '#f2b5c8', '#c9a64a');
    });
    box(R.charm, (w, h) => { g.fillStyle = '#f4b7c9'; g.beginPath(); g.arc(32, 36, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3a3346'; g.beginPath(); g.arc(24, 34, 3, 0, 7); g.arc(40, 34, 3, 0, 7); g.fill(); g.fillStyle = '#f4b7c9'; g.beginPath(); g.arc(14, 16, 9, 0, 7); g.arc(50, 16, 9, 0, 7); g.fill(); });
    box(R.sakuraMark, (w, h) => sakura(32, 32, 26, '#f2b5c8'));
  }, { key: 'vehicles-atlas' });
  tex.anisotropy = 8;
  _atlas = { tex, R, uvInto };
  _atlasFor = ctx;
  return _atlas;
}

let _matsFor = null, _mats = null;
export function getMats(ctx) {
  if (_mats && _matsFor === ctx) return _mats;
  const A = getAtlas(ctx), m = ctx.mat;
  _mats = {
    vcol: m.toon('#ffffff', { vertexColors: true, paint: 0.035 }),
    atlas: m.toon('#ffffff', { map: A.tex, vertexColors: true, alphaTest: 0.4, side: 'double', paint: 0.0 }),
    glass: m.glass({ tint: '#8ea4b6', opacity: 0.46 }),
    lit: m.emissive('#ffffff', 1.25, { map: A.tex }),
    brake: m.emissive('#ff5a48', 1.35),
  };
  _matsFor = ctx;
  return _mats;
}
