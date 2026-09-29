// [v3:fix] Ported from Sakuragaoka Station src/world/sakura/textures.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Spring cherry trees for Kesennuma's hero stops (town/cherry/index.js).
// Canvas textures for the sakura module (hand-painted, anime-simplified):
//  barkOld / barkYoung : tiling bark (u wraps around the trunk, v along it) with horizontal lenticel bands
//  blossom             : 2x2 atlas of alpha-cut blossom clusters (dense / spray / loose umbels / with young leaves)
//  flora               : 2x2 atlas of ground plants (grass tuft, dandelion, small white flowers, violets)
//  ground              : 2x1 atlas of soil patch + moss patch (alpha-cut irregular edges)
export function createSakuraTextures(ctx) {
  const T = ctx.tex;
  const R = ctx.rng('sakura-tex');

  // ------------------------------------------------------------------ helpers
  const wrapDraw = (w, h, fn, vert = true) => { for (const dx of [-w, 0, w]) for (const dy of (vert ? [-h, 0, h] : [0])) fn(dx, dy); };

  function paintBark(g, w, h, o) {
    g.fillStyle = o.base; g.fillRect(0, 0, w, h);
    // long vertical washes
    for (let i = 0; i < o.washes; i++) {
      const x = R() * w, bw = w * (0.04 + R() * 0.18), a = 0.06 + R() * 0.12, dark = R() < 0.55;
      g.fillStyle = dark ? `rgba(38,28,34,${a})` : `rgba(150,132,124,${a})`;
      wrapDraw(w, h, (dx) => g.fillRect(x + dx, 0, bw, h), false);
    }
    // blotches (soft)
    for (let i = 0; i < o.blotches; i++) {
      const x = R() * w, y = R() * h, rx = 6 + R() * 26, ry = 10 + R() * 50, a = 0.07 + R() * 0.1;
      g.fillStyle = R() < 0.5 ? `rgba(44,34,40,${a})` : `rgba(160,146,136,${a})`;
      wrapDraw(w, h, (dx, dy) => { g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill(); });
    }
    // vertical cracks (old bark)
    for (let i = 0; i < o.cracks; i++) {
      const x0 = R() * w, y0 = R() * h, len = h * (0.15 + R() * 0.5), lw = 1.2 + R() * 2.4;
      const pts = []; let x = x0, y = y0;
      for (let s = 0; s < len; s += 10) { x += (R() - 0.5) * 5; y += 10; pts.push([x, y]); }
      wrapDraw(w, h, (dx, dy) => {
        g.strokeStyle = 'rgba(46,34,40,0.8)'; g.lineWidth = lw; g.beginPath(); g.moveTo(x0 + dx, y0 + dy);
        for (const p of pts) g.lineTo(p[0] + dx, p[1] + dy); g.stroke();
        g.strokeStyle = 'rgba(150,134,126,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + dx + lw, y0 + dy);
        for (const p of pts) g.lineTo(p[0] + dx + lw, p[1] + dy); g.stroke();
      });
    }
    // horizontal lenticel bands — the signature of cherry bark
    let y = R() * 10;
    while (y < h) {
      y += o.band[0] + R() * o.band[1];
      const n = o.lent[0] + Math.floor(R() * o.lent[1]);
      for (let k = 0; k < n; k++) {
        const x = R() * w, lw = o.lw[0] + R() * o.lw[1], lh = o.lh[0] + R() * o.lh[1], yy = y + (R() - 0.5) * 5;
        wrapDraw(w, h, (dx, dy) => {
          g.fillStyle = o.lentDark; T.roundRect(g, x + dx, yy + dy, lw, lh, lh / 2); g.fill();
          g.fillStyle = o.lentLight; T.roundRect(g, x + dx + 1, yy + dy + lh, lw - 2, Math.max(1, lh * 0.45), lh / 3); g.fill();
        });
      }
    }
    // pale lichen spots (old bark only)
    for (let i = 0; i < o.lichen; i++) {
      const x = R() * w, y2 = R() * h, rr = 3 + R() * 9;
      wrapDraw(w, h, (dx, dy) => { g.fillStyle = 'rgba(168,176,150,0.32)'; g.beginPath(); g.arc(x + dx, y2 + dy, rr, 0, Math.PI * 2); g.fill(); });
    }
  }

  const barkOld = T.draw(256, 512, (g, w, h) => paintBark(g, w, h, {
    base: '#5f4f4d', washes: 16, blotches: 40, cracks: 12, band: [10, 22], lent: [3, 6], lw: [12, 30], lh: [2, 3],
    lentDark: 'rgba(44,33,38,0.78)', lentLight: 'rgba(158,140,130,0.55)', lichen: 26,
  }), { key: 'sakura-bark-old', repeat: [1, 1] });

  const barkYoung = T.draw(128, 256, (g, w, h) => paintBark(g, w, h, {
    base: '#6a4d4a', washes: 8, blotches: 14, cracks: 0, band: [7, 12], lent: [2, 4], lw: [8, 16], lh: [2, 2],
    lentDark: 'rgba(58,40,44,0.7)', lentLight: 'rgba(186,164,152,0.75)', lichen: 0,
  }), { key: 'sakura-bark-young', repeat: [1, 1] });

  // ------------------------------------------------------------------ blossom atlas
  function petal(g, r, w, cols) {
    g.beginPath();
    g.moveTo(r * 0.06, 0);
    g.bezierCurveTo(r * 0.22, -w * 1.15, r * 0.74, -w * 1.3, r * 0.98, -w * 0.46);
    g.quadraticCurveTo(r * 0.92, -w * 0.08, r * 0.8, 0);        // the notch at the tip
    g.quadraticCurveTo(r * 0.92, w * 0.08, r * 0.98, w * 0.46);
    g.bezierCurveTo(r * 0.74, w * 1.3, r * 0.22, w * 1.15, r * 0.06, 0);
    g.closePath();
    const grd = g.createRadialGradient(0, 0, r * 0.04, 0, 0, r);
    grd.addColorStop(0, cols[0]); grd.addColorStop(0.42, cols[1]); grd.addColorStop(1, cols[2]);
    g.fillStyle = grd; g.fill();
    g.lineWidth = Math.max(1, r * 0.05); g.strokeStyle = cols[3]; g.stroke();
  }
  const FLOWER_COLS = [
    ['#ef98b5', '#fbe0e9', '#fff7f9', 'rgba(214,128,160,0.55)'],
    ['#ec8fae', '#f9d3df', '#fdeff3', 'rgba(208,118,150,0.55)'],
    ['#f2a9c0', '#fdeaf0', '#fffafb', 'rgba(220,150,175,0.5)'],
  ];
  function flower(g, x, y, r, rot, squash = 1) {
    const cols = FLOWER_COLS[Math.floor(R() * FLOWER_COLS.length)];
    g.save(); g.translate(x, y); g.rotate(rot * 0.3); g.scale(1, squash); g.rotate(rot);
    // halo (alpha < 0.5: invisible at full res, keeps edge colour pink and mip coverage solid)
    g.fillStyle = 'rgba(247,214,225,0.3)'; g.beginPath(); g.arc(0, 0, r * 1.2, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 5; k++) {
      g.save(); g.rotate(k * Math.PI * 2 / 5 + (R() - 0.5) * 0.2);
      petal(g, r * (0.9 + R() * 0.16), r * 0.36, cols); g.restore();
    }
    // centre: deep pink eye + stamens
    g.fillStyle = '#e07799'; g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(205,90,125,0.85)'; g.lineWidth = Math.max(1, r * 0.035);
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + R() * 0.3, l = r * (0.26 + R() * 0.1);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
      g.fillStyle = '#f4dc8c'; g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, Math.max(1.2, r * 0.045), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#c95a80'; g.beginPath(); g.arc(0, 0, r * 0.07, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function bud(g, x, y, r, a) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(247,214,225,0.3)'; g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 1.3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e98aab'; g.beginPath(); g.ellipse(0, -r * 0.2, r * 0.5, r * 0.85, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f6c3d3'; g.beginPath(); g.ellipse(-r * 0.12, -r * 0.45, r * 0.2, r * 0.38, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9b5a5c'; g.beginPath(); g.ellipse(0, r * 0.55, r * 0.34, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function stalk(g, x0, y0, x1, y1, wd) {
    g.strokeStyle = 'rgba(247,214,225,0.3)'; g.lineWidth = wd * 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#8f6a4f'; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + wd, (y0 + y1) / 2, x1, y1); g.stroke();
  }
  function leaf(g, x, y, len, a, col) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(210,222,170,0.3)'; g.beginPath(); g.ellipse(len * 0.5, 0, len * 0.62, len * 0.34, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.3, -len * 0.34, len * 0.75, -len * 0.26, len, 0);
    g.bezierCurveTo(len * 0.75, len * 0.26, len * 0.3, len * 0.34, 0, 0); g.closePath();
    g.fillStyle = col; g.fill();
    g.strokeStyle = 'rgba(120,140,80,0.6)'; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = 'rgba(236,240,200,0.8)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.9, 0); g.stroke();
    g.restore();
  }
  function umbel(g, cx, cy, n, r, spreadA, baseA) {
    // 3-5 flowers on short stalks from one point (sakura blooms grow in umbels)
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = baseA + (k - (n - 1) / 2) * spreadA + (R() - 0.5) * 0.3, l = r * (1.1 + R() * 0.7);
      const x = cx + Math.cos(a) * l, y = cy + Math.sin(a) * l;
      stalk(g, cx, cy, x, y, Math.max(1.5, r * 0.05)); pts.push([x, y]);
    }
    for (const [x, y] of pts) flower(g, x, y, r * (0.85 + R() * 0.3), R() * 6.28, R() < 0.3 ? 0.6 + R() * 0.3 : 1);
  }

  const blossom = T.draw(1024, 1024, (g) => {
    const C = 512;
    // cell A (0,0): dense round cluster
    g.save(); g.translate(0, 0);
    // umbels of 3-5 smaller flowers packed into a round clump (drawn back-to-front)
    const fl = [];
    for (let u = 0; u < 15; u++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * C * 0.3, ux = C / 2 + Math.cos(a) * d, uy = C / 2 + Math.sin(a) * d * 0.92;
      const n = 3 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) { const b = R() * 6.28, l = C * (0.05 + R() * 0.05); fl.push([ux + Math.cos(b) * l, uy + Math.sin(b) * l]); }
    }
    fl.sort((p, q) => p[1] - q[1]);
    for (const [x, y] of fl) flower(g, x, y, C * (0.05 + R() * 0.018), R() * 6.28, R() < 0.35 ? 0.55 + R() * 0.35 : 1);
    for (let k = 0; k < 6; k++) { const a = R() * 6.28; bud(g, C / 2 + Math.cos(a) * C * 0.42, C / 2 + Math.sin(a) * C * 0.42, C * 0.026, a + Math.PI / 2); }
    g.restore();
    // cell B (1,0): spray along a curved twig
    g.save(); g.translate(C, 0);
    g.strokeStyle = 'rgba(247,214,225,0.3)'; g.lineWidth = 22; g.beginPath(); g.moveTo(C * 0.06, C * 0.9); g.quadraticCurveTo(C * 0.35, C * 0.35, C * 0.94, C * 0.12); g.stroke();
    g.strokeStyle = '#6e4d45'; g.lineWidth = 7; g.beginPath(); g.moveTo(C * 0.06, C * 0.9); g.quadraticCurveTo(C * 0.35, C * 0.35, C * 0.94, C * 0.12); g.stroke();
    for (let k = 0; k < 6; k++) {
      const t = 0.12 + k * 0.15, u = 1 - t;
      const x = u * u * C * 0.06 + 2 * u * t * C * 0.35 + t * t * C * 0.94, y = u * u * C * 0.9 + 2 * u * t * C * 0.35 + t * t * C * 0.12;
      umbel(g, x, y, 3 + Math.floor(R() * 3), C * (0.05 + R() * 0.012), 0.85, (k % 2 ? -1 : 1) * 1.2 + R() - 1.9);
    }
    bud(g, C * 0.9, C * 0.1, C * 0.04, 1.0); bud(g, C * 0.12, C * 0.72, C * 0.035, -0.6);
    g.restore();
    // cell C (0,1): loose umbels (lacy)
    g.save(); g.translate(0, C);
    const um = [[0.27, 0.3], [0.62, 0.24], [0.8, 0.52], [0.24, 0.66], [0.6, 0.76], [0.46, 0.48], [0.15, 0.45], [0.42, 0.14], [0.82, 0.8], [0.38, 0.84]];
    for (const [ux, uy] of um) umbel(g, C * ux, C * uy, 3 + Math.floor(R() * 2), C * (0.048 + R() * 0.012), 1.05, R() * 6.28);
    for (let k = 0; k < 3; k++) bud(g, C * (0.15 + R() * 0.7), C * (0.15 + R() * 0.7), C * 0.03, R() * 6.28);
    g.restore();
    // cell D (1,1): blossoms with low-saturation young leaves
    g.save(); g.translate(C, C);
    const LC = ['#bfcd92', '#b3c486', '#c9d49c', '#b9a77e'];
    for (let k = 0; k < 7; k++) { const a = R() * 6.28; leaf(g, C / 2 + Math.cos(a) * C * 0.12, C / 2 + Math.sin(a) * C * 0.12, C * (0.2 + R() * 0.1), a, LC[k % LC.length]); }
    for (let k = 0; k < 20; k++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * C * 0.33;
      flower(g, C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, C * (0.05 + R() * 0.02), R() * 6.28, R() < 0.3 ? 0.6 : 1);
    }
    g.restore();
  }, { key: 'sakura-blossom-atlas' });

  // ------------------------------------------------------------------ ground flora atlas (bottom-anchored cells)
  const flora = T.draw(512, 512, (g) => {
    const C = 256;
    // grass tuft (0,0)
    g.save(); g.translate(0, 0);
    const GC = ['#6f9a5a', '#86ad66', '#9bbd72', '#b0cb82', '#7aa35e'];
    for (let k = 0; k < 26; k++) {
      const x0 = C * (0.3 + R() * 0.4), lean = (R() - 0.5) * C * 0.7, hh = C * (0.45 + R() * 0.5);
      g.strokeStyle = GC[k % GC.length]; g.lineWidth = 4 + R() * 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, C); g.quadraticCurveTo(x0 + lean * 0.3, C - hh * 0.6, x0 + lean, C - hh); g.stroke();
    }
    g.restore();
    // dandelion (1,0)
    g.save(); g.translate(C, 0);
    for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + (k - 4) * 0.32; leaf(g, C / 2, C * 0.97, C * (0.3 + R() * 0.12), a, k % 2 ? '#86ad66' : '#7aa35e'); }
    for (const [fx, fh] of [[0.42, 0.55], [0.62, 0.42]]) {
      g.strokeStyle = '#8fb46a'; g.lineWidth = 5; g.beginPath(); g.moveTo(C / 2, C * 0.95); g.quadraticCurveTo(C * fx, C * 0.8, C * fx, C * (1 - fh)); g.stroke();
      for (let k = 0; k < 22; k++) { const a = k / 22 * 6.28; g.strokeStyle = k % 2 ? '#f2c93a' : '#f6d85a'; g.lineWidth = 7; g.beginPath(); g.moveTo(C * fx, C * (1 - fh)); g.lineTo(C * fx + Math.cos(a) * C * 0.09, C * (1 - fh) + Math.sin(a) * C * 0.07); g.stroke(); }
      g.fillStyle = '#e6b22c'; g.beginPath(); g.arc(C * fx, C * (1 - fh), C * 0.035, 0, 6.28); g.fill();
    }
    g.restore();
    // small white flowers (hakobera / daisies) (0,1)
    g.save(); g.translate(0, C);
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.2; leaf(g, C / 2 + (R() - 0.5) * C * 0.3, C * 0.98, C * (0.2 + R() * 0.12), a, '#8db56c'); }
    for (let k = 0; k < 6; k++) {
      const x = C * (0.18 + R() * 0.64), y = C * (0.3 + R() * 0.45);
      g.strokeStyle = '#86ad66'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + (R() - 0.5) * 20, C); g.lineTo(x, y); g.stroke();
      for (let p = 0; p < 8; p++) { const a = p / 8 * 6.28; g.fillStyle = '#f5f2ea'; g.beginPath(); g.ellipse(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 9, 4.5, a, 0, 6.28); g.fill(); }
      g.fillStyle = '#efc94a'; g.beginPath(); g.arc(x, y, 6, 0, 6.28); g.fill();
    }
    g.restore();
    // violets (sumire) (1,1)
    g.save(); g.translate(C, C);
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.0; leaf(g, C / 2 + (R() - 0.5) * C * 0.25, C * 0.98, C * (0.18 + R() * 0.1), a, '#7aa35e'); }
    for (let k = 0; k < 5; k++) {
      const x = C * (0.2 + R() * 0.6), y = C * (0.35 + R() * 0.35);
      g.strokeStyle = '#7fa35e'; g.lineWidth = 3; g.beginPath(); g.moveTo(C / 2, C); g.quadraticCurveTo(x, y + 30, x, y); g.stroke();
      const PC = ['#8e72c4', '#a58bd6', '#7d64b3'];
      for (let p = 0; p < 5; p++) { const a = p / 5 * 6.28 - Math.PI / 2; g.fillStyle = PC[p % 3]; g.beginPath(); g.ellipse(x + Math.cos(a) * 10, y + Math.sin(a) * 10, 11, 7, a, 0, 6.28); g.fill(); }
      g.fillStyle = '#f3e7a8'; g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill();
    }
    g.restore();
  }, { key: 'sakura-flora-atlas' });

  // ------------------------------------------------------------------ soil + moss patches (alpha-cut)
  const ground = T.draw(512, 256, (g) => {
    const C = 256;
    function blob(cx, cy, rad, n, fill) {
      g.beginPath();
      const ph = R() * 6.28, ph2 = R() * 6.28;
      for (let k = 0; k <= 48; k++) {
        const a = k / 48 * Math.PI * 2;
        const rr = rad * (0.84 + 0.1 * Math.sin(a * 3 + ph) + 0.06 * Math.sin(a * 7 + ph2) + (R() - 0.5) * 0.05 * n);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fillStyle = fill; g.fill();
    }
    // soil (0,0)
    blob(C / 2, C / 2, C * 0.47, 1, '#8e7458');
    blob(C / 2, C / 2, C * 0.36, 1, '#83694f');
    for (let k = 0; k < 90; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.4; g.fillStyle = R() < 0.5 ? 'rgba(70,52,40,0.5)' : 'rgba(176,160,136,0.6)'; g.beginPath(); g.arc(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 1.5 + R() * 3.5, 0, 6.28); g.fill(); }
    for (let k = 0; k < 14; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.38; g.fillStyle = '#b9ab95'; g.beginPath(); g.ellipse(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 4 + R() * 5, 3 + R() * 3, R() * 3, 0, 6.28); g.fill(); }
    // moss (1,0)
    g.save(); g.translate(C, 0);
    blob(C / 2, C / 2, C * 0.46, 2, '#7a9160');
    blob(C / 2 + 10, C / 2 - 6, C * 0.3, 2, '#86a068');
    for (let k = 0; k < 120; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * C * 0.4; g.fillStyle = R() < 0.5 ? 'rgba(160,186,120,0.7)' : 'rgba(90,112,70,0.6)'; g.beginPath(); g.arc(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, 1.5 + R() * 3, 0, 6.28); g.fill(); }
    g.restore();
  }, { key: 'sakura-ground-atlas' });

  // ------------------------------------------------------------------ tiling blossom speckle (multiplier) for pad surfaces
  const speck = T.draw(512, 512, (g, w, h) => {
    g.fillStyle = '#eed8df'; g.fillRect(0, 0, w, h);
    // soft darker hollows between clumps
    for (let k = 0; k < 26; k++) { const x = R() * w, y = R() * h, rr = 18 + R() * 30; wrapDraw(w, h, (dx, dy) => { g.fillStyle = 'rgba(196,146,172,0.4)'; g.beginPath(); g.arc(x + dx, y + dy, rr, 0, 6.28); g.fill(); }); }
    const cols = ['#ffffff', '#fdf5f7', '#faeef2', '#fff9fa'];
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < (pass ? 70 : 90); k++) {
      const x = R() * w, y = R() * h, rr = (pass ? 15 : 19) + R() * 8, rot = R() * 6.28;
      const col = cols[Math.floor(R() * cols.length)];
      wrapDraw(w, h, (dx, dy) => {
        g.save(); g.translate(x + dx, y + dy); g.rotate(rot);
        g.fillStyle = 'rgba(205,160,180,0.5)';
        for (let p = 0; p < 5; p++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(rr * 0.6, 0.8, rr * 0.52, rr * 0.36, 0, 0, 6.28); g.fill(); }
        g.fillStyle = col;
        for (let p = 0; p < 5; p++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(rr * 0.56, 0, rr * 0.5, rr * 0.34, 0, 0, 6.28); g.fill(); }
        g.fillStyle = '#efbccc'; g.beginPath(); g.arc(0, 0, rr * 0.22, 0, 6.28); g.fill();
        g.fillStyle = '#e6a8bd'; g.beginPath(); g.arc(0, 0, rr * 0.09, 0, 6.28); g.fill();
        g.restore();
      });
    }
    for (let k = 0; k < 60; k++) { const x = R() * w, y = R() * h; wrapDraw(w, h, (dx, dy) => { g.fillStyle = 'rgba(214,150,176,0.3)'; g.beginPath(); g.ellipse(x + dx, y + dy, 3, 4.5, R() * 3, 0, 6.28); g.fill(); }); }
  }, { key: 'sakura-speck4', repeat: [1, 1] });

  return { barkOld, barkYoung, blossom, flora, ground, speck };
}
