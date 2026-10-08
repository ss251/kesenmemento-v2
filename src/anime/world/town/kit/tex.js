// [v3:town] copied from src/anime/world/_houses/tex.js (foundation first-look vendoring of Sakuragaoka Station, MIT); town owns this copy.
// [v3:fix] leftover Sakura text replaced with local fictional names (魚町 plates, コーポうみねこ, みなと不動産, Kesennuma Sta.; no phone numbers)
// Vendored from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station). [v3:foundation] first-look only; town owns buildings.
// Canvas textures + atlas for the houses module. All textures are neutral/light so vertex colours
// tint them (one material serves every wall colour).
import * as THREE from 'three';

export const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上',
  '木村', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤', '坂本', '遠藤', '青木', '西村',
  '福田', '太田', '三浦', '藤原', '岡本', '中川', '原田', '小野', '田村', '竹内', '和田', '中山', '石田', '上田', '森田', '柴田', '宮本', '内田', '桜井', '野口'];
export const ROMAJI = { '佐藤': 'SATO', '鈴木': 'SUZUKI', '高橋': 'TAKAHASHI', '田中': 'TANAKA', '渡辺': 'WATANABE', '伊藤': 'ITO', '山本': 'YAMAMOTO', '中村': 'NAKAMURA', '小林': 'KOBAYASHI', '加藤': 'KATO', '吉田': 'YOSHIDA', '山田': 'YAMADA', '佐々木': 'SASAKI', '山口': 'YAMAGUCHI', '松本': 'MATSUMOTO', '井上': 'INOUE' };

function hashRng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** soft blotches for hand-painted feel */
function blotches(g, w, h, rnd, n, colA, alpha, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rMin + rnd() * (rMax - rMin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, colA.replace('A', String(alpha * (0.5 + rnd() * 0.5))));
    gr.addColorStop(1, colA.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap copies so tiles are seamless
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) { if (x + dx - r < w && x + dx + r > 0 && y + dy - r < h && y + dy + r > 0) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); } }
  }
}
function speckle(g, w, h, rnd, n, col, size = 1.5) { g.fillStyle = col; for (let i = 0; i < n; i++) { const s = size * (0.5 + rnd()); g.fillRect(rnd() * w, rnd() * h, s, s); } }

export function makeHouseTextures(ctx) {
  const T = ctx.tex, F = T.FONTS;
  const tex = {};
  const rep = (key, w, h, fn) => T.draw(w, h, (g, W, H) => fn(g, W, H, hashRng(key.length * 7919 + key.charCodeAt(0) * 131)), { key: 'houses_' + key, repeat: [1, 1] });

  // plaster (モルタル): uneven wash, soft stains, tiny trowel marks. 1 repeat = 3 m
  tex.plaster = rep('plaster', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#f7f5f1'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 40, 'rgba(205,196,184,A)', 0.22, 18, 60);
    blotches(g, w, h, r, 24, 'rgba(255,255,255,A)', 0.35, 14, 40);
    g.strokeStyle = 'rgba(190,182,170,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.arc(x, y, 8 + r() * 14, r() * 6, r() * 6 + 1.2); g.stroke(); }
    speckle(g, w, h, r, 260, 'rgba(160,150,140,0.16)', 1.3);
  });
  // lap siding (サイディング): horizontal boards with shadow lines, 1 repeat = 1.2 m (6 boards)
  tex.siding = rep('siding', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#f6f6f4'; g.fillRect(0, 0, w, h);
    const n = 6, bh = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * bh;
      const gr = g.createLinearGradient(0, y, 0, y + bh);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.8, 'rgba(220,220,222,0.25)'); gr.addColorStop(1, 'rgba(160,160,170,0.55)');
      g.fillStyle = gr; g.fillRect(0, y, w, bh);
      g.fillStyle = 'rgba(120,120,135,0.55)'; g.fillRect(0, y + bh - 3, w, 3);
      // occasional vertical joint
      const jx = ((i * 97) % 5) / 5 * w + 30; g.fillStyle = 'rgba(140,140,150,0.35)'; g.fillRect(jx % w, y, 2, bh - 3);
    }
    blotches(g, w, h, r, 16, 'rgba(210,210,200,A)', 0.18, 20, 50);
  });
  // exterior tile (外壁タイル 二丁掛け): 1 repeat = 0.96 m
  tex.tile = rep('tile', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#c9c7c2'; g.fillRect(0, 0, w, h);
    const rows = 16, cols = 4, th = h / rows, tw = w / cols;
    for (let y = 0; y < rows; y++) for (let x = -1; x < cols; x++) {
      const ox = (y % 2) * tw / 2, v = 238 + Math.floor(r() * 14) - 7;
      g.fillStyle = `rgb(${v},${v},${v - 2})`;
      g.fillRect(x * tw + ox + 1.5, y * th + 1.5, tw - 3, th - 3);
    }
    blotches(g, w, h, r, 10, 'rgba(200,196,190,A)', 0.2, 20, 50);
  });
  // vertical wood boards (板張り): 1 repeat = 1.2 m, 6 boards with grain
  tex.wood = rep('wood', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#f2efea'; g.fillRect(0, 0, w, h);
    const n = 6, bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * bw, v = 240 + Math.floor(r() * 14) - 7;
      g.fillStyle = `rgb(${v},${v - 3},${v - 7})`; g.fillRect(x, 0, bw, h);
      g.strokeStyle = 'rgba(150,130,110,0.25)'; g.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) { const gx = x + 5 + r() * (bw - 10); g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + 4, h * 0.3, gx - 4, h * 0.6, gx + 2, h); g.stroke(); }
      g.fillStyle = 'rgba(90,70,60,0.55)'; g.fillRect(x, 0, 2, h);
    }
  });
  // concrete block wall (ブロック塀): 0.4 × 0.2 blocks, 1 repeat = 1.6 m wide × 0.8 m tall  (256 × 128)
  tex.block = T.draw(256, 128, (g, w, h) => {
    const r = hashRng(4242);
    g.fillStyle = '#b9b8b2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 236 + Math.floor(r() * 12) - 6;
      g.fillStyle = `rgb(${v},${v},${v - 3})`; g.fillRect(x * 64 + 1.5, y * 32 + 1.5, 61, 29);
    }
    blotches(g, w, h, r, 14, 'rgba(180,178,170,A)', 0.3, 10, 30);
    speckle(g, w, h, r, 200, 'rgba(120,120,115,0.25)', 1.2);
  }, { key: 'houses_block', repeat: [1, 1] });
  // concrete (foundation / slabs): soft wash + faint formwork seams, 1 repeat = 2 m
  tex.concrete = rep('concrete', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#f2f1ee'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 30, 'rgba(190,188,182,A)', 0.3, 16, 50);
    speckle(g, w, h, r, 500, 'rgba(130,130,125,0.22)', 1.2);
    g.fillStyle = 'rgba(160,158,152,0.35)'; g.fillRect(0, h / 2, w, 1.5); g.fillRect(w / 2, 0, 1.5, h);
  });
  // kawara tile field: channels run along v (down-slope). 1 repeat = 1.2 m across (4 channels) × 1.0 m down (4 courses)
  tex.kawara = T.draw(256, 256, (g, w, h) => {
    const r = hashRng(9001);
    const cw = w / 4, ch = h / 4;
    for (let c = 0; c < 4; c++) {
      const x = c * cw;
      const gr = g.createLinearGradient(x, 0, x + cw, 0);
      gr.addColorStop(0, '#cfd0d2'); gr.addColorStop(0.18, '#f4f4f4'); gr.addColorStop(0.45, '#fbfbfb'); gr.addColorStop(0.75, '#dcdcde'); gr.addColorStop(1, '#a9aaaf');
      g.fillStyle = gr; g.fillRect(x, 0, cw, h);
    }
    for (let k = 0; k < 4; k++) { // course overlaps (shadow under each tile's lower lip)
      const y = k * ch;
      g.fillStyle = 'rgba(80,82,95,0.35)'; g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y + 3, w, 2);
      for (let c = 0; c < 4; c++) { const v = r(); if (v < 0.35) { g.fillStyle = `rgba(${v < 0.15 ? '255,255,255' : '60,60,70'},0.08)`; g.fillRect(c * cw, y, cw, ch); } }
    }
  }, { key: 'houses_kawara', repeat: [1, 1] });
  // eave-end tiles (軒瓦): round ends, 1 repeat = 0.3 m  (64×32)
  tex.kawaraEdge = T.draw(64, 32, (g, w, h) => {
    g.fillStyle = '#d8d8da'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.36, h * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(70,70,85,0.6)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(90,90,100,0.35)'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(80,80,95,0.55)'; g.fillRect(0, 0, 2, h);
  }, { key: 'houses_kawaraEdge', repeat: [1, 1] });
  // ridge stack (のし瓦): horizontal layers, 1 repeat = 0.6 m along the ridge
  tex.ridge = T.draw(128, 64, (g, w, h) => {
    g.fillStyle = '#eeeeee'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(70,72,85,0.45)'; g.fillRect(0, i * 16 + 13, w, 3); }
    g.fillStyle = 'rgba(70,72,85,0.3)'; g.fillRect(w / 2, 0, 2, h);
  }, { key: 'houses_ridge', repeat: [1, 1] });
  // standing-seam metal (ガルバリウム): seams along v, 1 repeat = 0.9 m (2 seams)
  tex.metal = T.draw(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#f4f4f4'); gr.addColorStop(0.5, '#ececec'); gr.addColorStop(1, '#f4f4f4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (const x of [0, w / 2]) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(90,95,110,0.5)'; g.fillRect(x + 3, 0, 3, h); }
  }, { key: 'houses_metal', repeat: [1, 1] });
  // shutters (雨戸 / 戸袋): horizontal ribs, 1 repeat = 0.5 m
  tex.shutter = T.draw(64, 128, (g, w, h) => {
    g.fillStyle = '#efefef'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(100,100,115,0.4)'; g.fillRect(0, i * 16 + 12, w, 4); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, i * 16, w, 3); }
  }, { key: 'houses_shutter', repeat: [1, 1] });
  // gravel (砂利) 1 repeat = 1.5 m
  tex.gravel = rep('gravel', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const x = r() * w, y = r() * h, s = 1.5 + r() * 3.2, v = 150 + Math.floor(r() * 100);
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.beginPath(); g.ellipse(x, y, s, s * 0.75, r() * 3, 0, Math.PI * 2); g.fill();
    }
  });
  // lane asphalt: speckle + cracks + patches. 1 repeat = 4 m
  tex.asphalt = rep('asphalt', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#ecebea'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 20, 'rgba(200,200,205,A)', 0.35, 20, 60);
    speckle(g, w, h, r, 900, 'rgba(150,150,155,0.35)', 1.3);
    speckle(g, w, h, r, 300, 'rgba(255,255,255,0.4)', 1.0);
    g.strokeStyle = 'rgba(110,110,118,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 26; y += (r() - 0.3) * 20; g.lineTo(x, y); } g.stroke(); }
  });
  // lawn/moss ground: 1 repeat = 2 m
  tex.lawn = rep('lawn', 256, 256, (g, w, h, r) => {
    g.fillStyle = '#eef2e6'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, r, 30, 'rgba(190,210,160,A)', 0.4, 14, 40);
    g.strokeStyle = 'rgba(120,150,100,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 500; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke(); }
  });
  // soil (garden beds / fields)
  tex.soil = rep('soil', 128, 128, (g, w, h, r) => {
    g.fillStyle = '#e9e1d6'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 500, 'rgba(140,120,100,0.35)', 1.6);
    blotches(g, w, h, r, 10, 'rgba(170,150,130,A)', 0.3, 10, 30);
  });
  // paving tiles for approaches (アプローチ): 30 cm squares, 1 repeat = 1.2 m
  tex.paver = T.draw(128, 128, (g, w, h) => {
    const r = hashRng(77);
    g.fillStyle = '#b8b3aa'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 232 + Math.floor(r() * 18) - 9; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29); }
  }, { key: 'houses_paver', repeat: [1, 1] });

  tex.atlas = makeAtlas(ctx);
  tex.laundry = makeLaundryAtlas(ctx);
  tex.decal = makeDecalAtlas(ctx);
  tex.far = T.draw(128, 128, (g, w, h) => { // far-town facade: 2 storeys × 2 windows
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7d8796';
    for (const y of [22, 82]) for (const x of [18, 76]) { g.fillRect(x, y, 34, 22); }
    g.fillStyle = 'rgba(90,90,100,0.5)'; g.fillRect(0, 60, w, 3);
  }, { key: 'houses_far', repeat: [1, 1] });
  return tex;
}

// -------------------------------------------------------------------------------------------
//  Atlas: nameplates, doors, window interiors, meters, AC grilles, labels…  (1024×1024)
// -------------------------------------------------------------------------------------------
function makeAtlas(ctx) {
  const T = ctx.tex, F = T.FONTS;
  const W = 1024, H = 1024, PAD = 3;
  const items = [];
  const add = (name, w, h, draw) => items.push({ name, w, h, draw });
  // --- white texel (plain faces)
  add('white', 16, 16, (g, w, h) => { g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h); });
  // --- doors (128×256 ≈ 0.9×2.0 m)
  const door = (name, fn) => add(name, 112, 240, fn);
  door('door_wood', (g, w, h) => { // dark wood-grain door with a vertical glass slit
    g.fillStyle = '#6a4d3b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,28,22,0.35)'; g.lineWidth = 1.5; for (let y = 6; y < h; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (y % 3)); g.stroke(); }
    g.fillStyle = '#b8c6cf'; g.fillRect(w * 0.18, h * 0.12, 11, h * 0.62); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(w * 0.18 + 2, h * 0.12, 3, h * 0.62);
    g.fillStyle = '#c8c3b8'; g.fillRect(w * 0.78, h * 0.42, 6, 34); g.fillRect(w * 0.74, h * 0.47, 12, 5);
    g.strokeStyle = '#3e2e26'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  door('door_white', (g, w, h) => { // ivory door with small square windows
    g.fillStyle = '#e9e4da'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,110,100,0.45)'; g.lineWidth = 2; g.strokeRect(12, 14, w - 24, h * 0.36); g.strokeRect(12, h * 0.46, w - 24, h * 0.46);
    g.fillStyle = '#aebfcc'; for (let i = 0; i < 3; i++) g.fillRect(w / 2 - 9, 26 + i * 24, 18, 18);
    g.fillStyle = '#8f8a80'; g.fillRect(w * 0.8, h * 0.45, 5, 30);
    g.strokeStyle = '#5d5750'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  door('door_grey', (g, w, h) => { // modern dark grey-brown door with horizontal grooves
    g.fillStyle = '#5a5654'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,28,30,0.4)'; for (let y = 20; y < h - 10; y += 22) g.fillRect(8, y, w - 16, 2);
    g.fillStyle = '#b5c3cc'; g.fillRect(w - 26, 18, 12, h - 36);
    g.fillStyle = '#c9c9c9'; g.fillRect(w * 0.2, h * 0.4, 5, 40);
    g.strokeStyle = '#2f2c2e'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  door('door_steel', (g, w, h) => { // apartment steel door
    g.fillStyle = '#d9d4c9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b0aa9f'; g.fillRect(w * 0.14, h * 0.25, w * 0.72, 2);
    g.fillStyle = '#777'; g.fillRect(w * 0.76, h * 0.48, 16, 7); g.fillStyle = '#555'; g.beginPath(); g.arc(w * 0.5, h * 0.3, 3, 0, 7); g.fill();
    g.fillStyle = '#9a948a'; g.fillRect(w * 0.3, h * 0.72, w * 0.4, 8); // letter slot
    g.strokeStyle = '#6a655d'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  add('door_slide', 256, 240, (g, w, h) => { // traditional 格子戸: two sliding leaves, lattice over frosted glass
    for (let k = 0; k < 2; k++) {
      const x0 = k * w / 2;
      g.fillStyle = '#e6e4dc'; g.fillRect(x0, 0, w / 2, h);
      g.fillStyle = '#5b4232';
      g.fillRect(x0, 0, 10, h); g.fillRect(x0 + w / 2 - 10, 0, 10, h); g.fillRect(x0, 0, w / 2, 10); g.fillRect(x0, h - 30, w / 2, 30); g.fillRect(x0, h * 0.55, w / 2, 6);
      for (let i = 1; i < 7; i++) g.fillRect(x0 + i * (w / 2) / 7 - 2, 10, 4, h * 0.55 - 10);
      for (let i = 1; i < 4; i++) g.fillRect(x0 + i * (w / 2) / 4 - 2, h * 0.55, 4, h * 0.45 - 30);
    }
    g.fillStyle = '#2f241d'; g.fillRect(w / 2 - 1, 0, 2, h);
  });
  add('gate_alu', 128, 96, (g, w, h) => { // aluminium swing gate leaf (門扉): vertical lattice
    g.clearRect(0, 0, w, h); g.fillStyle = '#5c4a3e';
    g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    for (let x = 16; x < w - 8; x += 12) g.fillRect(x, 0, 5, h);
  });
  // --- window interiors (128×128 each)
  const win = (name, fn) => add(name, 128, 128, fn);
  const room = (g, w, h, tone = '#5f6173') => { g.fillStyle = tone; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,220,0.18)'); gr.addColorStop(1, 'rgba(20,20,40,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  win('int_lace', (g, w, h) => { room(g, w, h, '#8d8e9c'); g.fillStyle = 'rgba(245,245,240,0.82)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(190,190,200,0.6)'; g.lineWidth = 2; for (let x = 4; x < w; x += 9) { g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, h * 0.4, x - 3, h * 0.7, x + 1, h); g.stroke(); } });
  win('int_curtain_pink', (g, w, h) => { room(g, w, h); g.fillStyle = 'rgba(240,240,236,0.75)'; g.fillRect(w * 0.3, 0, w * 0.4, h); g.fillStyle = '#e7b8b8'; g.fillRect(0, 0, w * 0.3, h); g.fillRect(w * 0.7, 0, w * 0.3, h); g.strokeStyle = 'rgba(160,100,110,0.5)'; g.lineWidth = 2; for (let x = 6; x < w * 0.3; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(w - x, 0); g.lineTo(w - x, h); g.stroke(); } });
  win('int_curtain_green', (g, w, h) => { room(g, w, h, '#6b6e7a'); g.fillStyle = '#b9cfae'; g.fillRect(0, 0, w * 0.38, h); g.fillRect(w * 0.82, 0, w * 0.18, h); g.strokeStyle = 'rgba(90,120,80,0.5)'; g.lineWidth = 2; for (let x = 6; x < w * 0.38; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.fillStyle = 'rgba(255,230,190,0.35)'; g.fillRect(w * 0.45, h * 0.5, w * 0.3, h * 0.5); });
  win('int_curtain_blue', (g, w, h) => { room(g, w, h); g.fillStyle = 'rgba(245,245,240,0.8)'; g.fillRect(0, 0, w, h); g.fillStyle = '#a9bcd6'; g.fillRect(0, 0, w * 0.22, h); g.fillRect(w * 0.78, 0, w * 0.22, h); });
  win('int_blind', (g, w, h) => { room(g, w, h, '#9a9aa4'); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(245,242,235,0.92)'; g.fillRect(0, y, w, 6); } g.fillStyle = 'rgba(80,80,90,0.3)'; g.fillRect(0, h * 0.75, w, h * 0.25); });
  win('int_shoji', (g, w, h) => { g.fillStyle = '#f1ece0'; g.fillRect(0, 0, w, h); g.fillStyle = '#9c8468'; for (let x = 0; x <= w; x += w / 4) g.fillRect(x - 1.5, 0, 3, h); for (let y = 0; y <= h; y += h / 6) g.fillRect(0, y - 1.5, w, 3); });
  win('int_dark', (g, w, h) => { room(g, w, h, '#4c4f63'); g.fillStyle = 'rgba(30,30,45,0.5)'; g.fillRect(w * 0.1, h * 0.45, w * 0.35, h * 0.55); g.fillRect(w * 0.6, h * 0.25, w * 0.22, h * 0.75); g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(w * 0.64, h * 0.3, w * 0.14, h * 0.1); });
  win('int_frost', (g, w, h) => { g.fillStyle = '#c7cdd6'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(120,130,150,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  win('int_louver', (g, w, h) => { // jalousie (ルーバー窓): frosted glass slats with a crank handle
    g.fillStyle = '#b9c2cc'; g.fillRect(0, 0, w, h);
    const n = 9, sh = h / n;
    for (let i = 0; i < n; i++) { const y = i * sh; const gr = g.createLinearGradient(0, y, 0, y + sh); gr.addColorStop(0, '#e9eef2'); gr.addColorStop(0.7, '#cdd5dd'); gr.addColorStop(1, '#a3adb9'); g.fillStyle = gr; g.fillRect(0, y + 1, w, sh - 2); g.fillStyle = 'rgba(70,78,92,0.55)'; g.fillRect(0, y + sh - 2, w, 2); }
    g.fillStyle = '#8c939b'; g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    g.fillStyle = '#6d737b'; g.fillRect(w - 18, h - 16, 10, 8);
  });
  win('int_room', (g, w, h) => { room(g, w, h, '#7d7a86'); g.fillStyle = 'rgba(250,245,235,0.6)'; g.fillRect(0, 0, w * 0.25, h); g.fillStyle = '#6e5b50'; g.fillRect(w * 0.35, h * 0.6, w * 0.5, h * 0.12); g.fillStyle = 'rgba(255,225,180,0.5)'; g.beginPath(); g.arc(w * 0.62, h * 0.15, 10, 0, 7); g.fill(); });
  win('int_warm', (g, w, h) => { g.fillStyle = '#e8c79a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,245,225,0.7)'; g.fillRect(0, 0, w * 0.3, h); g.fillRect(w * 0.7, 0, w * 0.3, h); g.fillStyle = 'rgba(120,80,60,0.35)'; g.fillRect(w * 0.35, h * 0.62, w * 0.3, h * 0.38); });
  // --- nameplates 表札 (horizontal 112×44 and vertical 44×112)
  const names = SURNAMES;
  const plateStyles = [
    { bg: '#e9e1d0', fg: '#2e2a28', font: F.serif, border: '#8b7a66' },       // stone/ceramic
    { bg: '#5d4535', fg: '#f3ead8', font: F.brush, border: '#3e2d23' },        // dark wood, carved
    { bg: '#f2f0ea', fg: '#34343c', font: F.sans, border: '#a9a9ad' },         // white acrylic
    { bg: '#c9b28f', fg: '#3b2b1f', font: F.brush, border: '#8a6f50' },        // light wood
  ];
  for (let i = 0; i < 24; i++) {
    const nm = names[i % names.length], st = plateStyles[i % plateStyles.length];
    if (i % 3 === 1) add('plateV' + i, 44, 112, (g, w, h) => { g.fillStyle = st.bg; T.roundRect(g, 0, 0, w, h, 4); g.fill(); g.strokeStyle = st.border; g.lineWidth = 3; T.roundRect(g, 2, 2, w - 4, h - 4, 3); g.stroke(); g.fillStyle = st.fg; const cs = [...nm]; const s = Math.min(34, (h - 16) / cs.length); T.verticalText(g, nm, w / 2, (h - s * cs.length * 1.05) / 2, s, st.font, 700); });
    else add('plateH' + i, 112, 44, (g, w, h) => { g.fillStyle = st.bg; T.roundRect(g, 0, 0, w, h, 4); g.fill(); g.strokeStyle = st.border; g.lineWidth = 3; T.roundRect(g, 2, 2, w - 4, h - 4, 3); g.stroke(); g.fillStyle = st.fg; g.textAlign = 'center'; g.textBaseline = 'middle'; const ro = ROMAJI[nm]; if (ro && i % 2 === 0) { T.fitText(g, nm, w / 2, h * 0.4, w - 16, 24, st.font, 700); g.globalAlpha = 0.8; T.fitText(g, ro, w / 2, h * 0.8, w - 20, 9, F.en, 500); g.globalAlpha = 1; } else T.fitText(g, nm, w / 2, h * 0.54, w - 16, 30, st.font, 700); });
  }
  // --- 住居表示 address plates (blue)
  for (let i = 0; i < 6; i++) add('addr' + i, 96, 40, (g, w, h) => { g.fillStyle = '#2f5fa0'; T.roundRect(g, 0, 0, w, h, 5); g.fill(); g.fillStyle = '#f4f4f4'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '魚町', w / 2, h * 0.3, w - 10, 12, F.sans, 700); T.fitText(g, `${['一', '二', '三'][i % 3]}丁目 ${[3, 7, 12, 15, 21, 26][i]}`, w / 2, h * 0.72, w - 10, 16, F.sans, 700); });
  // --- equipment faces
  add('ac_front', 128, 88, (g, w, h) => { // 室外機: fan grille + side panel
    g.fillStyle = '#ecebe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b9bab8'; g.beginPath(); g.arc(w * 0.38, h * 0.5, h * 0.4, 0, 7); g.fill();
    g.strokeStyle = '#7d7f84'; g.lineWidth = 1.6; for (let r = 5; r < h * 0.4; r += 5) { g.beginPath(); g.arc(w * 0.38, h * 0.5, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(w * 0.38 - h * 0.4, h * 0.5); g.lineTo(w * 0.38 + h * 0.4, h * 0.5); g.moveTo(w * 0.38, h * 0.1); g.lineTo(w * 0.38, h * 0.9); g.stroke();
    g.fillStyle = '#d5d4cf'; g.fillRect(w * 0.76, h * 0.12, w * 0.18, h * 0.76); g.fillStyle = 'rgba(100,100,110,0.4)'; for (let y = h * 0.18; y < h * 0.85; y += 6) g.fillRect(w * 0.78, y, w * 0.14, 2);
    g.strokeStyle = 'rgba(90,90,100,0.6)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
  add('gas_meter', 64, 72, (g, w, h) => { g.fillStyle = '#c9c9c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f4ee'; g.fillRect(10, 12, w - 20, 22); g.fillStyle = '#333'; g.font = `700 11px ${F.sans}`; g.textAlign = 'center'; g.fillText('0 4 7 2 8', w / 2, 28); g.fillStyle = '#e2c045'; g.fillRect(8, 44, w - 16, 10); g.fillStyle = '#333'; g.font = `700 9px ${F.sans}`; g.fillText('ガス', w / 2, 53); g.strokeStyle = '#777'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); });
  add('elec_meter', 56, 80, (g, w, h) => { g.fillStyle = '#efefeb'; g.fillRect(0, 0, w, h); g.fillStyle = '#2d3b36'; g.fillRect(10, 16, w - 20, 16); g.fillStyle = '#8ff0b5'; g.font = `700 10px ${F.sans}`; g.textAlign = 'center'; g.fillText('1 2 8 6 . 4', w / 2, 28); g.fillStyle = '#555'; g.font = `500 8px ${F.sans}`; g.fillText('kWh', w / 2, 44); g.fillStyle = '#d33'; g.fillRect(w / 2 - 3, 54, 6, 6); g.strokeStyle = '#999'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); });
  add('intercom', 40, 64, (g, w, h) => { g.fillStyle = '#ecebe7'; T.roundRect(g, 0, 0, w, h, 6); g.fill(); g.fillStyle = '#2d2d38'; g.beginPath(); g.arc(w / 2, 16, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(80,80,90,0.5)'; for (let y = 30; y < 40; y += 3) g.fillRect(10, y, w - 20, 1.5); g.fillStyle = '#b8c4cc'; T.roundRect(g, 9, 44, w - 18, 14, 4); g.fill(); g.fillStyle = '#e0a040'; g.beginPath(); g.arc(w / 2, 51, 3, 0, 7); g.fill(); });
  add('mailbox', 96, 72, (g, w, h) => { g.fillStyle = '#e9e6de'; g.fillRect(0, 0, w, h); g.fillStyle = '#4b4a4f'; g.fillRect(14, 14, w - 28, 8); g.fillStyle = '#6b6a70'; g.font = `700 12px ${F.en}`; g.textAlign = 'center'; g.fillText('POST', w / 2, 48); g.strokeStyle = '#9b988f'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); });
  add('mailbox_red', 96, 72, (g, w, h) => { g.fillStyle = '#b8483e'; g.fillRect(0, 0, w, h); g.fillStyle = '#3b2a2a'; g.fillRect(14, 14, w - 28, 8); g.fillStyle = '#f1e4d6'; g.font = `700 16px ${F.serif}`; g.textAlign = 'center'; g.fillText('〒 郵便', w / 2, 50); });
  add('mailbox_dark', 96, 72, (g, w, h) => { g.fillStyle = '#56544f'; g.fillRect(0, 0, w, h); g.fillStyle = '#26262a'; g.fillRect(14, 14, w - 28, 8); g.fillStyle = '#d9d2c2'; g.font = `500 11px ${F.sans}`; g.textAlign = 'center'; g.fillText('郵便受', w / 2, 48); });
  add('milk', 72, 56, (g, w, h) => { g.fillStyle = '#f0ebe0'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f74b8'; g.fillRect(0, 0, w, 16); g.fillStyle = '#fff'; g.font = `700 11px ${F.sans}`; g.textAlign = 'center'; g.fillText('さくら牧場', w / 2, 12); g.fillStyle = '#3f74b8'; g.font = `700 20px ${F.serif}`; g.fillText('牛乳', w / 2, 44); });
  add('parcel_box', 96, 64, (g, w, h) => { g.fillStyle = '#e6e2d8'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a6a8a'; g.font = `700 13px ${F.sans}`; g.textAlign = 'center'; g.fillText('宅配ボックス', w / 2, 24); g.fillStyle = '#777'; g.fillRect(w * 0.7, 36, 14, 14); });
  add('cardboard', 96, 64, (g, w, h) => { g.fillStyle = '#d8b88c'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(230,220,190,0.9)'; g.fillRect(w * 0.44, 0, 10, h); g.fillStyle = '#6b8f5c'; g.font = `700 10px ${F.sans}`; g.textAlign = 'left'; g.fillText('ワレモノ注意', 6, h - 8); g.fillStyle = '#f5f2ea'; g.fillRect(8, 10, 28, 18); });
  const binLabel = (name, bg, text) => add(name, 96, 40, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, text, w / 2, h / 2 + 1, w - 10, 20, F.round, 700); });
  binLabel('bin_burn', '#d0634f', 'もえるごみ');
  binLabel('bin_res', '#3f7fb8', '資源ごみ');
  binLabel('bin_pla', '#4f9a66', 'プラスチック');
  add('gomi_sign', 160, 96, (g, w, h) => { g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f7a4f'; g.fillRect(0, 0, w, 26); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, 'ごみ集積所', w / 2, 14, w - 10, 18, F.sans, 700); g.fillStyle = '#333'; T.fitText(g, '収集日の朝8時までに', w / 2, 44, w - 12, 13, F.sans, 700); T.fitText(g, '出してください', w / 2, 62, w - 12, 13, F.sans, 700); g.fillStyle = '#c44'; T.fitText(g, '魚町町内会', w / 2, 84, w - 12, 11, F.sans, 700); });
  add('sticker_dog', 64, 40, (g, w, h) => { g.fillStyle = '#f2d23d'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '猛犬注意', w / 2, h / 2, w - 6, 16, F.sans, 900); });
  add('sticker_nosale', 72, 32, (g, w, h) => { g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#b33'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '押し売りお断り', w / 2, h / 2, w - 6, 12, F.sans, 700); });
  add('vent', 64, 24, (g, w, h) => { g.fillStyle = '#9d9c97'; g.fillRect(0, 0, w, h); g.fillStyle = '#4e4e56'; for (let x = 6; x < w - 4; x += 7) g.fillRect(x, 4, 4, h - 8); });
  add('shed_door', 256, 160, (g, w, h) => { // steel storage shed front (物置)
    g.fillStyle = '#dfdcd2'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,120,110,0.35)'; for (let x = 8; x < w; x += 16) g.fillRect(x, 10, 2, h - 20);
    g.fillStyle = '#8a8f86'; g.fillRect(w / 2 - 2, 0, 4, h); g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    g.fillStyle = '#555'; g.fillRect(w / 2 - 14, h * 0.45, 8, 20); g.fillRect(w / 2 + 6, h * 0.45, 8, 20);
  });
  add('apt_sign', 256, 64, (g, w, h) => { g.fillStyle = '#f3efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a4a3e'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, 'コーポうみねこ', w / 2, h * 0.42, w - 20, 34, F.serif, 700); g.globalAlpha = 0.8; T.fitText(g, 'CORPO UMINEKO', w / 2, h * 0.82, w - 40, 11, F.en, 500); g.globalAlpha = 1; });
  for (const n of [101, 102, 103, 104, 201, 202, 203, 204]) add('room' + n, 48, 24, (g, w, h) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#333'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, String(n), w / 2, h / 2 + 1, w - 6, 16, F.en, 700); });
  add('posts', 192, 96, (g, w, h) => { // apartment mailbox bank 集合ポスト (2×4)
    g.fillStyle = '#c9c6bd'; g.fillRect(0, 0, w, h);
    const nm = ['101', '102', '103', '104', '201', '202', '203', '204'];
    for (let i = 0; i < 8; i++) { const x = (i % 4) * 48 + 3, y = Math.floor(i / 4) * 48 + 3; g.fillStyle = '#e8e6df'; g.fillRect(x, y, 42, 42); g.fillStyle = '#4a4a50'; g.fillRect(x + 6, y + 8, 30, 4); g.font = `700 10px ${F.en}`; g.textAlign = 'center'; g.fillText(nm[i], x + 21, y + 32); }
  });
  add('hose', 64, 64, (g, w, h) => { g.fillStyle = '#3f8f5b'; g.beginPath(); g.arc(w / 2, h / 2, 30, 0, 7); g.fill(); g.strokeStyle = '#a7d99a'; g.lineWidth = 3; for (let r = 6; r < 30; r += 5) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke(); } });
  // futon / quilt patterns
  add('futon_a', 128, 96, (g, w, h) => { g.fillStyle = '#f2e6ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#e9b7c6'; for (let i = 0; i < 16; i++) { const x = (i * 37) % w, y = (i * 23) % h; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 3, a, 0, 7); } g.fill(); } g.strokeStyle = 'rgba(160,110,130,0.5)'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6); });
  add('futon_b', 128, 96, (g, w, h) => { g.fillStyle = '#dfe7f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fb7d3'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h); g.strokeStyle = 'rgba(90,110,140,0.5)'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6); });
  add('futon_c', 128, 96, (g, w, h) => { g.fillStyle = '#f1ead8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a86c'; g.lineWidth = 2; for (let y = 8; y < h; y += 14) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.2) * 3); g.stroke(); } });
  add('solar', 128, 64, (g, w, h) => { g.fillStyle = '#2f3d5c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8fa2c4'; g.lineWidth = 1.5; for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w * 0.4, h); });
  add('kotatsu_sign', 128, 48, (g, w, h) => { g.fillStyle = '#f3efe4'; g.fillRect(0, 0, w, h); g.fillStyle = '#3d6b4f'; g.textAlign = 'center'; g.textBaseline = 'middle'; T.fitText(g, '月極駐車場', w / 2, h * 0.36, w - 10, 18, F.sans, 700); g.fillStyle = '#c33'; T.fitText(g, '空き有り みなと不動産', w / 2, h * 0.76, w - 10, 11, F.sans, 700); });
  add('greenhouse', 128, 64, (g, w, h) => { g.fillStyle = 'rgba(230,236,238,1)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(160,170,175,0.9)'; g.lineWidth = 2; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } });

  // ---- pack (shelf, tallest first)
  let x = 0, y = 0, rowH = 0;
  const rects = {};
  const order = items.slice().sort((a, b) => b.h - a.h || b.w - a.w);
  for (const it of order) {
    if (x + it.w + PAD > W) { x = 0; y += rowH + PAD; rowH = 0; }
    it.x = x; it.y = y; x += it.w + PAD; rowH = Math.max(rowH, it.h);
    const e = 0.5;
    rects[it.name] = [(it.x + e) / W, 1 - (it.y + it.h - e) / H, (it.x + it.w - e) / W, 1 - (it.y + e) / H];
  }
  if (y + rowH > H) console.warn('houses atlas overflow', y + rowH);
  const texture = T.draw(W, H, (g) => {
    g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, W, H);
    for (const it of items) { g.save(); g.translate(it.x, it.y); g.beginPath(); g.rect(0, 0, it.w, it.h); g.clip(); it.draw(g, it.w, it.h); g.restore(); }
  }, { key: 'houses_atlas' });
  const wr = rects.white;
  return { texture, rects, white: [(wr[0] + wr[2]) / 2, (wr[1] + wr[3]) / 2], has: (n) => !!rects[n] };
}

// -------------------------------------------------------------------------------------------
//  Laundry atlas (alpha cut-outs, white garments tinted by vertex colour where noted)
// -------------------------------------------------------------------------------------------
function makeLaundryAtlas(ctx) {
  const T = ctx.tex;
  const W = 1024, H = 512;
  const items = [];
  const add = (name, x, y, w, h, draw) => items.push({ name, x, y, w, h, draw });
  const ink = 'rgba(70,64,90,0.85)';
  const hanger = (g, w) => { g.strokeStyle = '#6d6f78'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 2); g.lineTo(w / 2, 12); g.moveTo(w * 0.18, 26); g.lineTo(w / 2, 12); g.lineTo(w * 0.82, 26); g.stroke(); };
  const shirtPath = (g, w, h, sleeve = 0.34) => {
    g.beginPath();
    g.moveTo(w * 0.36, h * 0.12); g.lineTo(w * 0.12, h * 0.2); g.lineTo(w * 0.02, h * sleeve + 0.12 * h); g.lineTo(w * 0.16, h * sleeve + 0.16 * h); g.lineTo(w * 0.22, h * 0.34);
    g.lineTo(w * 0.22, h * 0.97); g.lineTo(w * 0.78, h * 0.97); g.lineTo(w * 0.78, h * 0.34); g.lineTo(w * 0.84, h * sleeve + 0.16 * h); g.lineTo(w * 0.98, h * sleeve + 0.12 * h);
    g.lineTo(w * 0.88, h * 0.2); g.lineTo(w * 0.64, h * 0.12); g.quadraticCurveTo(w * 0.5, h * 0.2, w * 0.36, h * 0.12); g.closePath();
  };
  // white dress shirt on hanger
  add('shirt', 0, 0, 160, 200, (g, w, h) => { hanger(g, w); shirtPath(g, w, h); g.fillStyle = '#f7f7f5'; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.strokeStyle = 'rgba(150,150,170,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, h * 0.17); g.lineTo(w / 2, h * 0.96); g.stroke(); for (let y = 0.3; y < 0.95; y += 0.13) { g.fillStyle = '#b0b0b8'; g.beginPath(); g.arc(w / 2 + 5, h * y, 2.5, 0, 7); g.fill(); } g.fillStyle = 'rgba(180,185,205,0.35)'; g.fillRect(w * 0.22, h * 0.7, w * 0.56, h * 0.27); });
  // sailor uniform blouse セーラー服
  add('sailor', 160, 0, 160, 200, (g, w, h) => { hanger(g, w); shirtPath(g, w, h, 0.4); g.fillStyle = '#f5f5f2'; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.fillStyle = '#2f3b63'; g.beginPath(); g.moveTo(w * 0.3, h * 0.13); g.lineTo(w * 0.7, h * 0.13); g.lineTo(w * 0.8, h * 0.3); g.lineTo(w * 0.5, h * 0.52); g.lineTo(w * 0.2, h * 0.3); g.closePath(); g.fill(); g.strokeStyle = '#f5f5f2'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.25, h * 0.29); g.lineTo(w * 0.5, h * 0.47); g.lineTo(w * 0.75, h * 0.29); g.stroke(); g.fillStyle = '#c84a57'; g.beginPath(); g.moveTo(w * 0.44, h * 0.46); g.lineTo(w * 0.56, h * 0.46); g.lineTo(w * 0.6, h * 0.62); g.lineTo(w * 0.5, h * 0.56); g.lineTo(w * 0.4, h * 0.62); g.closePath(); g.fill(); g.fillStyle = '#2f3b63'; g.fillRect(w * 0.06, h * 0.49, w * 0.12, h * 0.04); g.fillRect(w * 0.82, h * 0.49, w * 0.12, h * 0.04); });
  // T-shirt (white, tinted)
  add('tee', 320, 0, 160, 160, (g, w, h) => { hanger(g, w); g.beginPath(); g.moveTo(w * 0.36, h * 0.16); g.lineTo(w * 0.08, h * 0.26); g.lineTo(w * 0.02, h * 0.44); g.lineTo(w * 0.2, h * 0.48); g.lineTo(w * 0.22, h * 0.97); g.lineTo(w * 0.78, h * 0.97); g.lineTo(w * 0.8, h * 0.48); g.lineTo(w * 0.98, h * 0.44); g.lineTo(w * 0.92, h * 0.26); g.lineTo(w * 0.64, h * 0.16); g.quadraticCurveTo(w * 0.5, h * 0.28, w * 0.36, h * 0.16); g.closePath(); g.fillStyle = '#f6f6f6'; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.fillStyle = 'rgba(170,170,190,0.3)'; g.fillRect(w * 0.22, h * 0.74, w * 0.56, h * 0.23); });
  // gym shirt 体操服 (white with navy trim + name tag)
  add('gym', 480, 0, 160, 160, (g, w, h) => { hanger(g, w); g.beginPath(); g.moveTo(w * 0.36, h * 0.16); g.lineTo(w * 0.08, h * 0.26); g.lineTo(w * 0.02, h * 0.44); g.lineTo(w * 0.2, h * 0.48); g.lineTo(w * 0.22, h * 0.97); g.lineTo(w * 0.78, h * 0.97); g.lineTo(w * 0.8, h * 0.48); g.lineTo(w * 0.98, h * 0.44); g.lineTo(w * 0.92, h * 0.26); g.lineTo(w * 0.64, h * 0.16); g.quadraticCurveTo(w * 0.5, h * 0.28, w * 0.36, h * 0.16); g.closePath(); g.fillStyle = '#f7f7f5'; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.strokeStyle = '#2f4f8f'; g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.37, h * 0.18); g.quadraticCurveTo(w * 0.5, h * 0.29, w * 0.63, h * 0.18); g.stroke(); g.fillStyle = '#fff'; g.fillRect(w * 0.3, h * 0.5, w * 0.4, h * 0.2); g.strokeStyle = '#333'; g.lineWidth = 1.5; g.strokeRect(w * 0.3, h * 0.5, w * 0.4, h * 0.2); g.fillStyle = '#333'; g.font = `700 14px ${T.FONTS.sans}`; g.textAlign = 'center'; g.fillText('2-3 桜井', w / 2, h * 0.64); });
  // towel (tinted; white bands)
  add('towel', 640, 0, 128, 200, (g, w, h) => { g.fillStyle = '#f4f4f2'; g.fillRect(4, 0, w - 8, h - 4); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(4, h * 0.78, w - 8, 10); g.fillRect(4, h * 0.84, w - 8, 4); g.fillStyle = 'rgba(160,160,175,0.35)'; for (let y = 10; y < h * 0.75; y += 8) g.fillRect(4, y, w - 8, 1.5); g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(5, 1, w - 10, h - 6); });
  // sheet (large, white with faint check)
  add('sheet', 768, 0, 256, 256, (g, w, h) => { g.fillStyle = '#f7f6f2'; g.fillRect(4, 0, w - 8, h - 4); g.strokeStyle = 'rgba(170,190,215,0.45)'; g.lineWidth = 2; for (let x = 20; x < w; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 20; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = 'rgba(160,165,190,0.25)'; g.fillRect(4, h * 0.6, w - 8, h * 0.4); g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(5, 1, w - 10, h - 6); });
  // pinch hanger 角ハンガー with socks & small things
  add('pinch', 0, 256, 256, 200, (g, w, h) => {
    g.strokeStyle = '#8a8f9a'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 18); g.stroke(); g.strokeRect(12, 18, w - 24, 10);
    const cols = ['#f4f4f4', '#9fb3d6', '#f0c2cc', '#f4f4f4', '#c7dcb4', '#3f4660', '#f4f4f4', '#e9d59a'];
    for (let i = 0; i < 8; i++) { const x = 20 + i * (w - 40) / 7.2; g.strokeStyle = '#9aa0aa'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 8, 28); g.lineTo(x + 8, 40); g.stroke(); g.fillStyle = cols[i]; if (i % 3 === 0) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 16, 40); g.lineTo(x + 16, 110); g.lineTo(x + 26, 122); g.lineTo(x + 18, 132); g.lineTo(x, 116); g.closePath(); g.fill(); g.strokeStyle = ink; g.lineWidth = 2.5; g.stroke(); } else { g.fillRect(x - 4, 40, 24, 50 + (i % 2) * 24); g.strokeStyle = ink; g.lineWidth = 2.5; g.strokeRect(x - 4, 40, 24, 50 + (i % 2) * 24); } }
  });
  // pleated skirt (navy) on hanger
  add('skirt', 256, 256, 144, 176, (g, w, h) => { g.strokeStyle = '#6d6f78'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 10); g.moveTo(w * 0.2, 14); g.lineTo(w * 0.8, 14); g.stroke(); g.beginPath(); g.moveTo(w * 0.24, 16); g.lineTo(w * 0.76, 16); g.lineTo(w * 0.94, h * 0.96); g.lineTo(w * 0.06, h * 0.96); g.closePath(); g.fillStyle = '#34405f'; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.strokeStyle = 'rgba(20,24,40,0.6)'; g.lineWidth = 2; for (let k = 1; k < 8; k++) { g.beginPath(); g.moveTo(w * (0.24 + 0.52 * k / 8), 18); g.lineTo(w * (0.06 + 0.88 * k / 8), h * 0.95); g.stroke(); } });
  // wind chime 風鈴 strip (tanzaku) — hangs below the glass bell
  add('tanzaku', 400, 256, 40, 140, (g, w, h) => { g.strokeStyle = '#777'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 30); g.stroke(); g.fillStyle = '#f3e6ea'; g.fillRect(6, 30, w - 12, h - 34); g.fillStyle = '#d96c86'; g.font = `700 16px ${T.FONTS.brush}`; g.textAlign = 'center'; g.fillText('春', w / 2, 60); g.fillText('風', w / 2, 82); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(6, 30, w - 12, h - 34); });
  // koinobori (carp streamers): 3 fish textures (U along length)
  const carp = (name, x, y, body, belly) => add(name, x, y, 256, 64, (g, w, h) => {
    g.fillStyle = body; g.fillRect(0, 0, w, h); g.fillStyle = belly; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(70 + i * 18 + (j % 2) * 9, 10 + j * 16, 7, 0, Math.PI); g.fill(); }
    g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(30, h * 0.4, 13, 0, 7); g.fill(); g.fillStyle = '#2b2b33'; g.beginPath(); g.arc(30, h * 0.4, 6, 0, 7); g.fill();
    g.strokeStyle = '#f4d05a'; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 0); g.lineTo(4, h); g.stroke();
    g.fillStyle = body; g.beginPath(); g.moveTo(w - 30, 0); g.lineTo(w, 0); g.lineTo(w - 12, h / 2); g.lineTo(w, h); g.lineTo(w - 30, h); g.fill();
  });
  carp('carp_black', 440, 256, '#3a3f58', '#e8dfc8');
  carp('carp_red', 440, 324, '#d9575a', '#f4e4d2');
  carp('carp_blue', 440, 392, '#4f7fc4', '#e9eef4');
  add('fukinagashi', 700, 256, 256, 64, (g, w, h) => { const c = ['#4f7fc4', '#f4f2ea', '#d9575a', '#e8c84a', '#4f9a66']; for (let i = 0; i < 5; i++) { g.fillStyle = c[i]; g.fillRect(0, i * h / 5, w, h / 5 + 1); } });
  const rects = {};
  for (const it of items) { const e = 1; rects[it.name] = [(it.x + e) / W, 1 - (it.y + it.h - e) / H, (it.x + it.w - e) / W, 1 - (it.y + e) / H]; }
  const texture = T.draw(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    for (const it of items) { g.save(); g.translate(it.x, it.y); g.beginPath(); g.rect(0, 0, it.w, it.h); g.clip(); it.draw(g, it.w, it.h); g.restore(); }
  }, { key: 'houses_laundry' });
  return { texture, rects };
}

// -------------------------------------------------------------------------------------------
//  Decals (alpha): rain streaks, moss band, cracks, oil stain, petals-free wear
// -------------------------------------------------------------------------------------------
function makeDecalAtlas(ctx) {
  const T = ctx.tex;
  const W = 512, H = 256;
  const rects = {};
  const items = [
    ['streak', 0, 0, 128, 256, (g, w, h, r) => { for (let i = 0; i < 9; i++) { const x = 8 + r() * (w - 16), len = h * (0.35 + r() * 0.6), ww = 3 + r() * 7; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(90,88,100,0.34)'); gr.addColorStop(1, 'rgba(90,88,100,0)'); g.fillStyle = gr; g.fillRect(x, 0, ww, len); } }],
    ['moss', 128, 0, 256, 64, (g, w, h, r) => { for (let i = 0; i < 70; i++) { const x = r() * w, y = h * (0.45 + r() * 0.55), rr = 5 + r() * 14; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${95 + r() * 30 | 0},${125 + r() * 25 | 0},${70 + r() * 20 | 0},0.6)`); gr.addColorStop(1, 'rgba(100,130,80,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } const gb = g.createLinearGradient(0, 0, 0, h); gb.addColorStop(0.4, 'rgba(90,110,80,0)'); gb.addColorStop(1, 'rgba(90,110,80,0.45)'); g.fillStyle = gb; g.fillRect(0, 0, w, h); }],
    ['crack', 128, 64, 128, 128, (g, w, h, r) => { g.strokeStyle = 'rgba(70,66,80,0.7)'; g.lineWidth = 1.6; let x = w * 0.3, y = 0; g.beginPath(); g.moveTo(x, y); while (y < h) { x += (r() - 0.5) * 18; y += 6 + r() * 10; g.lineTo(x, y); } g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.35, h * 0.4); g.lineTo(w * 0.7, h * 0.55); g.lineTo(w * 0.8, h * 0.75); g.stroke(); }],
    ['stain', 256, 64, 128, 128, (g, w, h, r) => { for (let i = 0; i < 6; i++) { const x = w / 2 + (r() - 0.5) * 50, y = h / 2 + (r() - 0.5) * 50, rr = 16 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(70,68,78,0.28)'); gr.addColorStop(1, 'rgba(70,68,78,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } }],
    ['mesh', 384, 64, 128, 128, (g, w, h) => { g.strokeStyle = 'rgba(70,80,78,0.55)'; g.lineWidth = 1.6; for (let k = -h; k < w + h; k += 11) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); } }],
    ['dirt', 384, 0, 128, 64, (g, w, h, r) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,110,100,0)'); gr.addColorStop(1, 'rgba(120,110,100,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(110,100,90,0.25)'; g.fillRect(r() * w, h * 0.5 + r() * h * 0.5, 2, 2); } }],
  ];
  for (const [name, x, y, w, h] of items) { const e = 1; rects[name] = [(x + e) / W, 1 - (y + h - e) / H, (x + w - e) / W, 1 - (y + e) / H]; }
  const texture = T.draw(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const r = hashRng(31337);
    for (const [name, x, y, w, h, fn] of items) { g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h, r); g.restore(); }
  }, { key: 'houses_decal' });
  return { texture, rects };
}

/** Materials used by the houses module (vertex-coloured so few materials serve all colours). */
export function makeHouseMaterials(ctx, tex) {
  const { mat } = ctx;
  const vc = (map, extra = {}) => mat.toon('#ffffff', { vertexColors: true, map, paint: 0.05, ...extra });
  // [r3:7] roofs, walls and facades keep their green in the early-spring preset (klcSnowMix's dormant tan is for ground: lawn, soil, gravel, asphalt, paver)
  const vb = (map, extra = {}) => vc(map, { noDormant: true, ...extra });
  const M = {
    plain: vb(null, { paint: 0.05 }),
    plainLow: vb(null, { paint: 0.02 }),
    plaster: vb(tex.plaster, { paint: 0.06 }),
    siding: vb(tex.siding, { paint: 0.04 }),
    tile: vb(tex.tile, { paint: 0.04 }),
    wood: vb(tex.wood, { paint: 0.05 }),
    block: vb(tex.block, { paint: 0.06 }),
    concrete: vb(tex.concrete, { paint: 0.06 }),
    kawara: vb(tex.kawara, { paint: 0.05 }),
    kawaraEdge: vb(tex.kawaraEdge, { paint: 0.03 }),
    ridge: vb(tex.ridge, { paint: 0.04 }),
    metal: vb(tex.metal, { paint: 0.04 }),
    shutter: vb(tex.shutter, { paint: 0.03 }),
    gravel: vc(tex.gravel, { paint: 0.05 }),
    asphalt: vc(tex.asphalt, { paint: 0.06 }),
    lawn: vc(tex.lawn, { paint: 0.08 }),
    soil: vc(tex.soil, { paint: 0.06 }),
    paver: vc(tex.paver, { paint: 0.04 }),
    atlas: vb(tex.atlas.texture, { paint: 0.02 }),
    atlasCut: mat.toon('#ffffff', { vertexColors: true, map: tex.atlas.texture, alphaTest: 0.5, side: 'double', paint: 0.02, noDormant: true }),
    decal: mat.decal('#ffffff', { map: tex.decal.texture, vertexColors: true, transparent: true }),
    glass: mat.glass({ tint: '#8fa6bb', opacity: 0.38 }),
    frost: mat.glass({ tint: '#b9c4cc', opacity: 0.5, frost: true, streaks: false }),
    poly: mat.toon('#dfe6ea', { transparent: true, opacity: 0.55, side: 'double', depthWrite: false, paint: 0.0, noDormant: true }), // polycarbonate roofs
    lamp: mat.emissive('#ffd9a0', 1.25),
    lampDim: mat.emissive('#ffe2b8', 0.95),
    farWall: mat.toon('#ffffff', { map: tex.far, paint: 0.04, noDormant: true }),
    farPlain: mat.toon('#ffffff', { paint: 0.04, noDormant: true }),
  };
  return M;
}
