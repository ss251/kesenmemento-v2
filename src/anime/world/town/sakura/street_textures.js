// [v3:town] vendored from Sakuragaoka Station src/world/street/textures.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Street module — hand-painted canvas textures and atlases (asphalt, pavers, curbs, gutters,
// tactile blocks, worn paint, road-marking glyphs, utility decals, sign faces).
export const ATLAS = 1024;

// Road-marking glyph atlas cells (canvas px). Canvas top = far end for the approaching driver.
export const GLYPH = {
  tomare: { x: 0, y: 0, w: 256, h: 768 },
  jokou: { x: 256, y: 0, w: 256, h: 512 },
  n30: { x: 256, y: 512, w: 256, h: 256 },
  school: { x: 512, y: 0, w: 512, h: 256 },
  hokou: { x: 512, y: 256, w: 512, h: 256 },
  tsugaku: { x: 512, y: 512, w: 128, h: 384 },
  navi: { x: 640, y: 512, w: 128, h: 256 },
  kids: { x: 768, y: 512, w: 256, h: 256 },
  diamond: { x: 640, y: 768, w: 128, h: 256 },
  bike: { x: 0, y: 768, w: 256, h: 256 },
  tomareS: { x: 256, y: 768, w: 256, h: 256 }, // 止まれ in one line (narrow alleys, across)
  arrowUp: { x: 768, y: 768, w: 128, h: 256 },
  bus: { x: 896, y: 768, w: 128, h: 256 },
  litter: { x: 512, y: 896, w: 128, h: 128 }, // coloured: petals + leaves (use with a white vertex colour)
};
// Utility decal atlas cells.
export const UTIL = {
  manholeA: { x: 0, y: 0, w: 256, h: 256 },
  manholeB: { x: 256, y: 0, w: 256, h: 256 },
  hydrant: { x: 512, y: 0, w: 256, h: 384 },
  valveR: { x: 768, y: 0, w: 128, h: 128 },
  valveS: { x: 896, y: 0, w: 128, h: 128 },
  gas: { x: 768, y: 128, w: 128, h: 128 },
  drain: { x: 896, y: 128, w: 128, h: 128 },
  patchA: { x: 0, y: 256, w: 256, h: 256 },
  patchB: { x: 256, y: 256, w: 256, h: 256 },
  trench: { x: 768, y: 256, w: 128, h: 512 },
  seal: { x: 896, y: 256, w: 128, h: 512 },
  patchC: { x: 512, y: 384, w: 256, h: 256 },
  oilA: { x: 0, y: 512, w: 128, h: 128 },
  oilB: { x: 128, y: 512, w: 128, h: 128 },
  stain: { x: 256, y: 512, w: 256, h: 128 },
  sprayA: { x: 0, y: 640, w: 256, h: 256 },
  sprayB: { x: 256, y: 640, w: 256, h: 256 },
  sprayC: { x: 512, y: 640, w: 256, h: 256 },
  skid: { x: 0, y: 896, w: 256, h: 128 },
  wet: { x: 256, y: 896, w: 256, h: 128 },
  fresh: { x: 512, y: 896, w: 256, h: 128 },
  manholeC: { x: 768, y: 768, w: 256, h: 256 },
};
// Sign-face atlas cells.
export const SIGN = {
  n30: { x: 0, y: 0, w: 256, h: 256 },
  noPark: { x: 256, y: 0, w: 256, h: 256 },
  stop: { x: 512, y: 0, w: 256, h: 256 },
  cross: { x: 768, y: 0, w: 256, h: 256 },
  school: { x: 0, y: 256, w: 256, h: 256 },
  pTsugaku: { x: 256, y: 256, w: 256, h: 96 },
  p820: { x: 256, y: 352, w: 256, h: 96 },
  pStop: { x: 512, y: 256, w: 256, h: 128 },
  pPriority: { x: 768, y: 256, w: 256, h: 96 },
  pSchool: { x: 768, y: 352, w: 256, h: 96 },
  pTown: { x: 256, y: 448, w: 256, h: 64 },
  guide: { x: 0, y: 512, w: 512, h: 384 },
  hydrant: { x: 512, y: 512, w: 128, h: 256 },
  back: { x: 960, y: 960, w: 64, h: 64 },
  pole: { x: 896, y: 960, w: 64, h: 64 },
};
/** atlas cell + local (u,v in 0..1, v=1 top) -> texture uv (flipY canvas textures). */
export function uvOf(cell, u, v) { return [(cell.x + u * cell.w) / ATLAS, 1 - (cell.y + (1 - v) * cell.h) / ATLAS]; }

export function makeStreetTextures(ctx) {
  const T = ctx.tex, F = T.FONTS;
  const R = ctx.rng('street-textures');
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ helpers
  const wrap9 = (x, y, r, w, h, fn) => {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const X = x + dx, Y = y + dy; if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue; fn(X, Y);
    }
  };
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const ellipse = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); g.fill(); };
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const crackPts = (x, y, ang, n, step) => {
    const pts = [[x, y]];
    for (let i = 0; i < n; i++) { ang += (R() - 0.5) * 0.9; const s = step * (0.6 + R() * 0.8); x += Math.cos(ang) * s; y += Math.sin(ang) * s; pts.push([x, y]); }
    return pts;
  };
  const strokeWrapped = (g, pts, w, h) => {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy))); g.stroke();
    }
  };
  const speckle = (g, x0, y0, w, h, n, cols, rmin = 0.6, rmax = 1.6) => {
    for (let i = 0; i < n; i++) { const r = rmin + R() * (rmax - rmin); g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(x0 + R() * w, y0 + R() * h, r * 1.5, r * 1.5); }
  };
  /** punch soft wear holes (paint abrasion) into already-drawn paint inside a rect */
  const wear = (g, x0, y0, w, h, density = 1, tile = false) => {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    const n = Math.round(w * h / 1400 * density);
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * w, y = y0 + R() * h, rx = 1.5 + R() * R() * 9, ry = 1 + R() * 5, a = 0.2 + R() * 0.65;
      g.fillStyle = `rgba(0,0,0,${a})`;
      if (tile) wrap9(x, y, rx, w, h, (X, Y) => ellipse(g, X, Y, rx, ry, R() * 3)); else ellipse(g, x, y, rx, ry, R() * 3);
    }
    // long scuffs along the travel direction (canvas x for lines, y for glyphs is fine either way)
    for (let i = 0; i < n / 14; i++) {
      const x = x0 + R() * w, y = y0 + R() * h, rx = 10 + R() * 40, ry = 0.8 + R() * 2;
      g.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.3})`;
      if (tile) wrap9(x, y, rx, w, h, (X, Y) => ellipse(g, X, Y, rx, ry, 0)); else ellipse(g, x, y, rx, ry, (R() - 0.5) * 0.3);
    }
    g.restore();
    // a little grime tint on the paint
    g.save(); g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < n / 3; i++) { const x = x0 + R() * w, y = y0 + R() * h; g.fillStyle = `rgba(120,118,112,${0.12 + R() * 0.18})`; const r = 2 + R() * 8; ellipse(g, x, y, r, r * (0.4 + R() * 0.6), R() * 3); }
    g.restore();
  };

  /** multiply RGB by tileable smooth value noise; octaves: [[cells, amplitude], ...] (+ white-noise dither, no lattice) */
  const wash = (g, w, h, octaves) => {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const field = new Float32Array(w * h);
    for (const [n, amp] of octaves) {
      const lat = new Float32Array(n * n); for (let i = 0; i < n * n; i++) lat[i] = R() * 2 - 1;
      const X0 = new Int32Array(w), X1 = new Int32Array(w), TX = new Float32Array(w);
      for (let x = 0; x < w; x++) { const f = x / w * n, i = Math.floor(f); let t = f - i; TX[x] = t * t * (3 - 2 * t); X0[x] = i % n; X1[x] = (i + 1) % n; }
      for (let y = 0; y < h; y++) {
        const f = y / h * n, i = Math.floor(f); let t = f - i; t = t * t * (3 - 2 * t); const r0 = (i % n) * n, r1 = ((i + 1) % n) * n;
        for (let x = 0; x < w; x++) {
          const a = lat[r0 + X0[x]] + (lat[r0 + X1[x]] - lat[r0 + X0[x]]) * TX[x], b = lat[r1 + X0[x]] + (lat[r1 + X1[x]] - lat[r1 + X0[x]]) * TX[x];
          field[y * w + x] += amp * (a + (b - a) * t);
        }
      }
    }
    for (let i = 0; i < w * h; i++) { const k = 1 + field[i], o = i * 4, e = R() - 0.5; d[o] = d[o] * k + e; d[o + 1] = d[o + 1] * k + e; d[o + 2] = d[o + 2] * k * 0.995 + e; }
    g.putImageData(img, 0, 0);
  };

  // ------------------------------------------------------------------ asphalt (6 m tile, world UV)
  const asphalt = T.draw(512, 512, (g, w, h) => {   // [v3:town] 512² (canvas budget)
    g.fillStyle = '#85868a'; g.fillRect(0, 0, w, h);
    // uneven wash: pixel-level tileable value noise (canvas gradients are dithered by Skia and the stacked
    // ordered-dither patterns showed up as a texel lattice in close-ups)
    wash(g, w, h, [[5, 0.085], [13, 0.05], [37, 0.028]]);
    // painterly dabs
    for (let i = 0; i < 350; i++) {
      const x = R() * w, y = R() * h, r = 2 + R() * 6, t = R();
      g.fillStyle = t < 0.5 ? `rgba(158,158,160,${0.05 + R() * 0.07})` : `rgba(108,110,116,${0.05 + R() * 0.06})`;
      const rr = r * (0.5 + R() * 0.5), rot = R() * 3;
      wrap9(x, y, r, w, h, (X, Y) => ellipse(g, X, Y, r, rr, rot));
    }
    // aggregate grain: soft round dots (>= 1.3 px radius so close-ups never show the texel lattice)
    const dot = (rgb, n, r0, r1, a0, a1) => { for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0); g.fillStyle = `rgba(${rgb},${a0 + R() * (a1 - a0)})`; wrap9(x, y, r, w, h, (X, Y) => circle(g, X, Y, r)); } };
    dot('176,176,178', 900, 1.3, 2.3, 0.1, 0.2);
    dot('100,102,108', 900, 1.3, 2.4, 0.1, 0.18);
    dot('192,190,186', 70, 2.0, 3.4, 0.16, 0.26);
    // fine hairline cracks
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const pts = crackPts(R() * w, R() * h, R() * TAU, 10 + (R() * 14 | 0), 5);
      g.strokeStyle = 'rgba(88,89,95,0.5)'; g.lineWidth = 1.8; strokeWrapped(g, pts, w, h);
      g.strokeStyle = 'rgba(170,170,172,0.16)'; g.lineWidth = 1.4; strokeWrapped(g, pts.map(p => [p[0] + 1.6, p[1] + 1.6]), w, h);
      if (R() < 0.8) { const k = pts[(pts.length * R()) | 0]; const b = crackPts(k[0], k[1], R() * TAU, 5 + (R() * 8 | 0), 7); g.strokeStyle = 'rgba(88,89,95,0.42)'; g.lineWidth = 1.4; strokeWrapped(g, b, w, h); }
    }
  }, { key: 'st-asphalt', repeat: [1, 1], anisotropy: 16 });

  // ------------------------------------------------------------------ interlocking pavers (1.6 m tile, u across, v along)
  const pavers = T.draw(512, 512, (g, w, h) => {   // [v3:town] 512² (canvas budget)
    g.fillStyle = '#9d968c'; g.fillRect(0, 0, w, h);
    const cols = ['#cfc7ba', '#c7beb0', '#d6cfc3', '#cbc1b2', '#c2b8aa', '#d2c9bb'];
    const bw = 32, bh = 64;
    for (let i = 0; i < w / bw; i++) for (let j = -1; j < h / bh + 1; j++) {
      const x = i * bw, y = j * bh + (i % 2 ? bh / 2 : 0);
      let c = cols[(R() * cols.length) | 0];
      if (R() < 0.06) c = '#c6ada0'; else if (R() < 0.05) c = '#b8b3aa';
      g.fillStyle = c; T.roundRect(g, x + 1.5, y + 1.5, bw - 3, bh - 3, 3); g.fill();
      g.fillStyle = 'rgba(255,250,240,0.22)'; g.fillRect(x + 2, y + 2, bw - 4, 2); g.fillRect(x + 2, y + 2, 2, bh - 4);
      g.fillStyle = 'rgba(90,80,70,0.16)'; g.fillRect(x + 2, y + bh - 4, bw - 4, 2); g.fillRect(x + bw - 4, y + 2, 2, bh - 4);
      if (R() < 0.3) { g.fillStyle = `rgba(110,100,90,${0.05 + R() * 0.07})`; ellipse(g, x + bw * R(), y + bh * R(), 4 + R() * 8, 3 + R() * 6, R() * 3); }
    }
    speckle(g, 0, 0, w, h, 2400, ['rgba(150,140,128,0.25)', 'rgba(235,228,216,0.25)', 'rgba(120,112,104,0.2)'], 0.6, 1.4);
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h, r = 20 + R() * 55; const a = 0.04 + R() * 0.05;
      wrap9(x, y, r, w, h, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, `rgba(96,88,80,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2); });
    }
  }, { key: 'st-pavers', repeat: [1, 1], anisotropy: 8 });

  // ------------------------------------------------------------------ curb stones (u: 1.2 m = 2 blocks; v: face 0..0.45, chamfer, top 0.55..1)
  const curb = T.draw(512, 128, (g, w, h) => {
    g.fillStyle = '#cbc9c1'; g.fillRect(0, 0, w, h * 0.45);
    g.fillStyle = '#dcdad2'; g.fillRect(0, h * 0.45, w, h * 0.1);
    g.fillStyle = '#b9b7af'; g.fillRect(0, h * 0.55, w, h * 0.45);
    const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(110,106,100,0)'); gr.addColorStop(1, 'rgba(110,106,100,0.45)');
    g.fillStyle = gr; g.fillRect(0, h * 0.7, w, h * 0.3);
    speckle(g, 0, 0, w, h, 1600, ['rgba(140,138,130,0.35)', 'rgba(230,228,222,0.35)'], 0.6, 1.3);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(120,116,108,${0.06 + R() * 0.08})`; ellipse(g, R() * w, R() * h, 10 + R() * 30, 4 + R() * 10, 0); }
    for (const x of [0, 256]) { g.fillStyle = 'rgba(96,94,90,0.85)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(230,228,222,0.5)'; g.fillRect(x + 3, 0, 2, h * 0.45); }
    g.fillStyle = 'rgba(96,94,90,0.8)'; g.fillRect(w - 2, 0, 2, h);
  }, { key: 'st-curb', repeat: [1, 1] });

  // ------------------------------------------------------------------ L-shaped road-side concrete gutter (u: 2 m, v across)
  const lgutter = T.draw(256, 64, (g, w, h) => {
    g.fillStyle = '#bdbbb3'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,118,110,0.35)'); gr.addColorStop(0.35, 'rgba(120,118,110,0.0)'); gr.addColorStop(1, 'rgba(120,118,110,0.12)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, 700, ['rgba(140,138,130,0.35)', 'rgba(226,224,218,0.35)'], 0.5, 1.2);
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(110,108,100,${0.05 + R() * 0.08})`; ellipse(g, R() * w, R() * h * 0.5, 10 + R() * 22, 2 + R() * 5, 0); }
    g.fillStyle = 'rgba(96,94,90,0.8)'; g.fillRect(0, 0, 2, h); g.fillRect(128, 0, 2, h);
  }, { key: 'st-lgutter', repeat: [1, 1] });

  // ------------------------------------------------------------------ U-ditch lids (2 lids per tile along u; v across incl. rims)
  const lid = T.draw(512, 256, (g, w, h) => {
    g.fillStyle = '#b1afa7'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2; k++) {
      const x0 = k * 256;
      g.fillStyle = k ? '#c0beb6' : '#c6c4bc'; g.fillRect(x0 + 4, 30, 250, 196);
      speckle(g, x0 + 4, 30, 250, 196, 900, ['rgba(140,138,130,0.35)', 'rgba(230,228,222,0.3)'], 0.6, 1.4);
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(110,106,100,${0.05 + R() * 0.08})`; ellipse(g, x0 + 20 + R() * 220, 40 + R() * 170, 14 + R() * 30, 8 + R() * 20, R() * 3); }
      // lifting notches at both ends
      g.fillStyle = '#4e4c49';
      for (const nx of [x0 + 4, x0 + 254]) { g.beginPath(); g.arc(nx, 128, 11, 0, TAU); g.fill(); }
      // seams
      g.fillStyle = 'rgba(70,68,64,0.9)'; g.fillRect(x0, 0, 4, h); g.fillRect(x0 + 254, 26, 2, 204);
      g.fillStyle = 'rgba(70,68,64,0.7)'; g.fillRect(x0, 28, 256, 2); g.fillRect(x0, 226, 256, 2);
      g.fillStyle = 'rgba(240,238,232,0.35)'; g.fillRect(x0 + 5, 31, 248, 2);
    }
    // rims: older concrete, mossy hints
    speckle(g, 0, 0, w, 28, 500, ['rgba(120,118,110,0.4)', 'rgba(220,218,210,0.3)']);
    speckle(g, 0, 228, w, 28, 500, ['rgba(120,118,110,0.4)', 'rgba(220,218,210,0.3)']);
    for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(118,134,96,${0.1 + R() * 0.12})`; ellipse(g, R() * w, R() < 0.5 ? 12 + R() * 10 : 236 + R() * 10, 6 + R() * 18, 2 + R() * 4, 0); }
  }, { key: 'st-lid', repeat: [1, 1], anisotropy: 8 });

  const grate = null;   // [v3:town] unused in Kesennuma (canvas budget)

  // ------------------------------------------------------------------ tactile blocks (0.3 m), yellow
  const dots = T.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#e2bb4d'; g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, 700, ['rgba(180,140,50,0.25)', 'rgba(250,225,140,0.25)']);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const x = 26 + i * 51, y = 26 + j * 51;
      g.fillStyle = 'rgba(150,112,30,0.55)'; circle(g, x + 2.5, y + 3.5, 16);
      g.fillStyle = '#eecb5c'; circle(g, x, y, 15);
      g.fillStyle = 'rgba(255,238,170,0.8)'; circle(g, x - 4, y - 5, 5.5);
    }
    g.fillStyle = 'rgba(140,110,40,0.75)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(110,96,70,${0.06 + R() * 0.08})`; ellipse(g, R() * w, R() * h, 10 + R() * 30, 8 + R() * 20, R() * 3); }
  }, { key: 'st-dots', repeat: [1, 1] });
  const bars = T.draw(256, 256, (g, w, h) => {
    g.fillStyle = '#e2bb4d'; g.fillRect(0, 0, w, h);
    speckle(g, 0, 0, w, h, 700, ['rgba(180,140,50,0.25)', 'rgba(250,225,140,0.25)']);
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 64;
      g.fillStyle = 'rgba(150,112,30,0.55)'; T.roundRect(g, x + 3, 18, 30, 226, 14); g.fill();
      g.fillStyle = '#eecb5c'; T.roundRect(g, x, 14, 28, 226, 14); g.fill();
      g.fillStyle = 'rgba(255,238,170,0.75)'; g.fillRect(x + 5, 24, 6, 200);
    }
    g.fillStyle = 'rgba(140,110,40,0.75)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(110,96,70,${0.06 + R() * 0.08})`; ellipse(g, R() * w, R() * h, 10 + R() * 30, 8 + R() * 20, R() * 3); }
  }, { key: 'st-bars', repeat: [1, 1] });

  // ------------------------------------------------------------------ worn road paint (tileable both ways, 0.8 m tile)
  const line = T.draw(512, 512, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(0, 0, w, h);
    wear(g, 0, 0, w, h, 1.4, true);
  }, { key: 'st-line', repeat: [1, 1], anisotropy: 16 });

  const paint = null;   // [v3:town] unused in Kesennuma (canvas budget)

  // ------------------------------------------------------------------ glyph atlas (white road text + symbols)
  const glyphs = T.draw(ATLAS, ATLAS, (g) => {
    g.clearRect(0, 0, ATLAS, ATLAS);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const W = '#ffffff';
    const stack = (cell, chars, size, cw) => {
      g.fillStyle = W; g.font = `900 ${size}px ${F.sans}`;
      const n = chars.length, ch = cell.h / n;
      chars.forEach((c, i) => {
        g.save(); g.translate(cell.x + cell.w / 2, cell.y + ch * (i + 0.5) + size * 0.04);
        if (cw) g.scale(cw, 1);
        g.fillText(c, 0, 0); g.restore();
      });
    };
    stack(GLYPH.tomare, ['止', 'ま', 'れ'], 238);
    stack(GLYPH.jokou, ['徐', '行'], 238);
    // 30 (two digits, condensed)
    g.save(); g.fillStyle = W; g.font = `900 250px ${F.sans}`; g.translate(GLYPH.n30.x + 128, GLYPH.n30.y + 136); g.scale(0.56, 1); g.fillText('30', 0, 0); g.restore();
    const twoLines = (cell, a, b, size) => {
      g.fillStyle = W; g.font = `900 ${size}px ${F.sans}`;
      T.fitText(g, a, cell.x + cell.w / 2, cell.y + cell.h * 0.26, cell.w * 0.96, size, F.sans, 900);
      T.fitText(g, b, cell.x + cell.w / 2, cell.y + cell.h * 0.76, cell.w * 0.96, size, F.sans, 900);
    };
    twoLines(GLYPH.school, 'スクール', 'ゾーン', 118);
    twoLines(GLYPH.hokou, '歩行者', '優先', 118);
    stack(GLYPH.tsugaku, ['通', '学', '路'], 116);
    // one-line 止まれ (for narrow alleys, text across the lane, stretched along travel)
    g.save(); g.fillStyle = W; g.font = `900 120px ${F.sans}`; g.translate(GLYPH.tomareS.x + 128, GLYPH.tomareS.y + 128); g.scale(0.62, 1.9); g.fillText('止まれ', 0, 4); g.restore();
    // ◇ crosswalk-ahead diamond (outline)
    { const c = GLYPH.diamond; g.strokeStyle = W; g.lineWidth = 11; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(c.x + 64, c.y + 8); g.lineTo(c.x + 120, c.y + 128); g.lineTo(c.x + 64, c.y + 248); g.lineTo(c.x + 8, c.y + 128); g.closePath(); g.stroke(); }
    // lane arrow ↑
    { const c = GLYPH.arrowUp; g.fillStyle = W; g.beginPath(); g.moveTo(c.x + 64, c.y + 6); g.lineTo(c.x + 120, c.y + 96); g.lineTo(c.x + 82, c.y + 96); g.lineTo(c.x + 82, c.y + 250); g.lineTo(c.x + 46, c.y + 250); g.lineTo(c.x + 46, c.y + 96); g.lineTo(c.x + 8, c.y + 96); g.closePath(); g.fill(); }
    // bicycle pictogram helper (side view, front to the right)
    const bicycle = (cx, cy, s, col, lw) => {
      g.save(); g.translate(cx, cy); g.scale(s, s); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.arc(-26, 10, 17, 0, TAU); g.stroke();
      g.beginPath(); g.arc(26, 10, 17, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-26, 10); g.lineTo(-6, 10); g.lineTo(14, -12); g.lineTo(-12, -12); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-6, 10); g.lineTo(-14, -20); g.moveTo(-20, -21); g.lineTo(-7, -21); g.stroke();
      g.beginPath(); g.moveTo(26, 10); g.lineTo(16, -22); g.lineTo(24, -26); g.stroke();
      g.restore();
    };
    // 自転車ナビマーク: blue arrow + white bicycle
    { const c = GLYPH.navi; g.fillStyle = '#4a86c8';
      g.beginPath(); g.moveTo(c.x + 64, c.y + 4); g.lineTo(c.x + 124, c.y + 78); g.lineTo(c.x + 98, c.y + 78); g.lineTo(c.x + 98, c.y + 252); g.lineTo(c.x + 30, c.y + 252); g.lineTo(c.x + 30, c.y + 78); g.lineTo(c.x + 4, c.y + 78); g.closePath(); g.fill();
      g.save(); g.translate(c.x + 64, c.y + 168); g.rotate(-Math.PI / 2); bicycle(0, 0, 1.05, W, 7); g.restore(); }
    // white bicycle pictogram + arrow (shoulder symbol)
    { const c = GLYPH.bike; bicycle(c.x + 128, c.y + 100, 2.2, W, 9);
      g.fillStyle = W; g.beginPath(); g.moveTo(c.x + 128, c.y + 150); g.lineTo(c.x + 170, c.y + 196); g.lineTo(c.x + 142, c.y + 196); g.lineTo(c.x + 142, c.y + 248); g.lineTo(c.x + 114, c.y + 248); g.lineTo(c.x + 114, c.y + 196); g.lineTo(c.x + 86, c.y + 196); g.closePath(); g.fill(); }
    // children pictogram (two kids walking hand in hand)
    { const c = GLYPH.kids; g.fillStyle = W; g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
      const kid = (x, y, s, bag) => {
        g.save(); g.translate(x, y); g.scale(s, s);
        circle(g, 0, -62, 17);
        g.beginPath(); g.moveTo(-15, -40); g.lineTo(15, -40); g.lineTo(20, 12); g.lineTo(-20, 12); g.closePath(); g.fill();
        if (bag) { T.roundRect(g, -34, -38, 20, 30, 5); g.fill(); }
        g.lineWidth = 11; g.beginPath(); g.moveTo(-8, 10); g.lineTo(-18, 58); g.moveTo(8, 10); g.lineTo(20, 56); g.stroke();
        g.restore();
      };
      kid(c.x + 96, c.y + 150, 1.35, true); kid(c.x + 176, c.y + 168, 1.05, false);
      g.lineWidth = 9; g.beginPath(); g.moveTo(c.x + 118, c.y + 110); g.quadraticCurveTo(c.x + 140, c.y + 132, c.x + 160, c.y + 128); g.stroke(); }
    // バス box text (for the bus bay)
    stack(GLYPH.bus, ['バ', 'ス'], 110);
    for (const k of Object.keys(GLYPH)) { if (k === 'litter') continue; const c = GLYPH[k]; wear(g, c.x, c.y, c.w, c.h, 1.1); }
    // petals and small fallen leaves (drawn in colour, after the paint wear)
    { const c = GLYPH.litter;
      const petal = (x, y, s, rot, col) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.beginPath();
        g.moveTo(0, -s); g.quadraticCurveTo(s * 0.85, -s * 0.2, 0, s); g.quadraticCurveTo(-s * 0.85, -s * 0.2, 0, -s); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-s * 0.15, -s * 0.25, s * 0.18, s * 0.4, 0, 0, TAU); g.fill(); g.restore(); };
      const leaf = (x, y, s, rot, col) => { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col; g.beginPath();
        g.moveTo(0, -s); g.quadraticCurveTo(s * 0.55, 0, 0, s); g.quadraticCurveTo(-s * 0.55, 0, 0, -s); g.fill();
        g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -s * 0.9); g.lineTo(0, s * 1.15); g.stroke(); g.restore(); };
      const pinks = ['#f7d3de', '#f2b5c8', '#fbe4ec', '#eba3b9', '#f5c6d4'];
      leaf(c.x + 38, c.y + 84, 17, 0.9, '#a58b58'); leaf(c.x + 96, c.y + 40, 13, -0.6, '#8f9a5c');
      for (let i = 0; i < 16; i++) { const a = R() * TAU, r = Math.sqrt(R()) * 50; petal(c.x + 64 + Math.cos(a) * r, c.y + 64 + Math.sin(a) * r, 5 + R() * 4, R() * TAU, pinks[(R() * pinks.length) | 0]); }
    }
  }, { key: 'st-glyphs', anisotropy: 16 });

  // ------------------------------------------------------------------ utility decals atlas
  const util = T.draw(ATLAS, ATLAS, (g) => {
    g.clearRect(0, 0, ATLAS, ATLAS);
    const flower = (x, y, r, col, mid, rot = 0) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col;
      for (let i = 0; i < 5; i++) { g.save(); g.rotate(i * TAU / 5); g.beginPath(); g.ellipse(0, -r * 0.55, r * 0.36, r * 0.52, 0, 0, TAU); g.fill(); g.restore(); }
      g.fillStyle = mid; circle(g, 0, 0, r * 0.2); g.restore();
    };
    const arcText = (text, cx, cy, rad, a0, a1, size, col, inward = false) => {
      g.save(); g.fillStyle = col; g.font = `900 ${size}px ${F.round}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const chars = [...text]; const n = chars.length;
      chars.forEach((c, i) => {
        const a = n === 1 ? (a0 + a1) / 2 : a0 + (a1 - a0) * i / (n - 1);
        g.save(); g.translate(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); g.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2)); g.fillText(c, 0, 0); g.restore();
      });
      g.restore();
    };
    // --- manhole A: municipal sakura design, painted
    { const c = UTIL.manholeA, cx = c.x + 128, cy = c.y + 128;
      g.fillStyle = '#58575f'; circle(g, cx, cy, 126);
      g.fillStyle = '#6b6a72'; circle(g, cx, cy, 119);
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.fillStyle = 'rgba(150,150,160,0.55)'; ellipse(g, cx + Math.cos(a) * 110, cy + Math.sin(a) * 110, 4, 2, a); }
      g.fillStyle = '#58575f'; circle(g, cx, cy, 100);
      g.save(); g.beginPath(); g.arc(cx, cy, 96, 0, TAU); g.clip();
      g.fillStyle = '#a9cde2'; g.fillRect(cx - 100, cy - 100, 200, 200);
      g.fillStyle = '#f4eee0'; ellipse(g, cx + 30, cy - 50, 40, 12, 0); ellipse(g, cx + 50, cy - 42, 26, 9, 0);
      g.fillStyle = '#9dc99a'; g.beginPath(); g.moveTo(cx - 100, cy + 30); g.quadraticCurveTo(cx - 40, cy - 5, cx + 10, cy + 22); g.quadraticCurveTo(cx + 60, cy + 45, cx + 100, cy + 18); g.lineTo(cx + 100, cy + 100); g.lineTo(cx - 100, cy + 100); g.fill();
      g.fillStyle = '#7fb3d6'; g.beginPath(); g.moveTo(cx - 100, cy + 62); g.quadraticCurveTo(cx, cy + 44, cx + 100, cy + 64); g.lineTo(cx + 100, cy + 100); g.lineTo(cx - 100, cy + 100); g.fill();
      // little train on the embankment
      g.fillStyle = '#f5f0e6'; T.roundRect(g, cx - 58, cy + 16, 84, 22, 7); g.fill();
      g.fillStyle = '#ef9fbe'; g.fillRect(cx - 58, cy + 28, 84, 5);
      g.fillStyle = '#8fb6d6'; for (let i = 0; i < 5; i++) g.fillRect(cx - 52 + i * 15, cy + 19, 10, 7);
      g.fillStyle = '#58575f'; g.fillRect(cx - 62, cy + 38, 92, 3);
      // sakura branch
      g.strokeStyle = '#6a4d42'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 100, cy - 58); g.quadraticCurveTo(cx - 40, cy - 40, cx + 10, cy - 12); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 45, cy - 42); g.quadraticCurveTo(cx - 30, cy - 70, cx - 10, cy - 78); g.stroke();
      const fl = [[-70, -52, 17], [-40, -40, 19], [-15, -24, 17], [8, -12, 15], [-28, -72, 15], [-5, -80, 13], [-58, -30, 12], [22, -30, 11]];
      for (const [x, y, r] of fl) flower(cx + x, cy + y, r, '#f5c3d2', '#dd7f9d', x * 0.1);
      for (let i = 0; i < 9; i++) { g.fillStyle = '#f5c3d2'; ellipse(g, cx - 60 + R() * 150, cy - 20 + R() * 60, 4, 2.5, R() * 3); }
      g.restore();
      g.strokeStyle = '#48474e'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 98, 0, TAU); g.stroke();
      arcText('けせんぬま', cx, cy, 109, -Math.PI * 0.82, -Math.PI * 0.18, 17, '#d8d6dc');
      arcText('おすい', cx, cy, 109, Math.PI * 0.64, Math.PI * 0.36, 17, '#d8d6dc', true);
      g.fillStyle = 'rgba(40,38,44,0.25)'; g.beginPath(); g.arc(cx, cy, 124, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(40,38,44,0.4)'; g.stroke();
    }
    // --- manhole B: cast-iron relief sakura (unpainted)
    const manholePlain = (c, label) => {
      const cx = c.x + 128, cy = c.y + 128;
      g.fillStyle = '#5a5960'; circle(g, cx, cy, 126);
      g.fillStyle = '#6c6b72'; circle(g, cx, cy, 118);
      g.strokeStyle = '#86858c'; g.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.save(); g.translate(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); g.rotate(a);
        for (let k = 0; k < 5; k++) { g.save(); g.rotate(k * TAU / 5); g.beginPath(); g.ellipse(0, -11, 7, 10, 0, 0, TAU); g.stroke(); g.restore(); } g.restore(); }
      g.fillStyle = '#7b7a81'; circle(g, cx, cy, 40);
      g.fillStyle = '#6c6b72'; circle(g, cx, cy, 34);
      flower(cx, cy, 44, '#85848b', '#6c6b72', 0.3);
      for (let i = 0; i < 90; i++) { const a = R() * TAU, r = 96 + R() * 18; g.fillStyle = 'rgba(140,140,150,0.35)'; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3); }
      arcText('気仙沼市', cx, cy, 104, -Math.PI * 0.75, -Math.PI * 0.25, 18, '#9a99a0');
      arcText(label, cx, cy, 104, Math.PI * 0.6, Math.PI * 0.4, 18, '#9a99a0', true);
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,38,44,0.45)'; g.beginPath(); g.arc(cx, cy, 124, 0, TAU); g.stroke();
      speckle(g, c.x + 20, c.y + 20, 216, 216, 300, ['rgba(40,40,46,0.25)', 'rgba(160,160,168,0.2)']);
    };
    manholePlain(UTIL.manholeB, '汚水');
    manholePlain(UTIL.manholeC, '雨水');
    // --- hydrant area: yellow frame, big 消火栓 text, yellow lid
    { const c = UTIL.hydrant, Y = '#e8c547';
      g.strokeStyle = Y; g.lineWidth = 12; g.strokeRect(c.x + 14, c.y + 14, c.w - 28, c.h - 28);
      g.fillStyle = Y; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(c.x + 128, c.y + 92); g.scale(0.8, 1.35); g.font = `900 64px ${F.sans}`; g.fillText('消火栓', 0, 0); g.restore();
      g.fillStyle = '#c9a93c'; T.roundRect(g, c.x + 62, c.y + 170, 132, 180, 10); g.fill();
      g.fillStyle = Y; T.roundRect(g, c.x + 68, c.y + 176, 120, 168, 8); g.fill();
      g.fillStyle = '#6b5a2a'; g.font = `900 30px ${F.sans}`; g.fillText('消火栓', c.x + 128, c.y + 228);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = 'rgba(120,96,40,0.5)'; circle(g, c.x + 92 + j * 36, c.y + 268 + i * 18, 4); }
      wear(g, c.x, c.y, c.w, c.h, 0.9);
    }
    // --- small lids
    { const c = UTIL.valveR, cx = c.x + 64, cy = c.y + 64;
      g.fillStyle = '#5c5b62'; circle(g, cx, cy, 60); g.fillStyle = '#5a82b3'; circle(g, cx, cy, 50);
      g.fillStyle = '#eaf0f6'; g.font = `900 24px ${F.sans}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('仕切弁', cx, cy - 12);
      g.beginPath(); g.moveTo(cx - 22, cy + 18); g.lineTo(cx + 16, cy + 18); g.lineTo(cx + 16, cy + 10); g.lineTo(cx + 28, cy + 22); g.lineTo(cx + 16, cy + 34); g.lineTo(cx + 16, cy + 26); g.lineTo(cx - 22, cy + 26); g.fill();
      wear(g, c.x, c.y, c.w, c.h, 0.6); }
    { const c = UTIL.valveS;
      g.fillStyle = '#5c5b62'; g.fillRect(c.x + 6, c.y + 6, 116, 116); g.fillStyle = '#6f6e75'; g.fillRect(c.x + 14, c.y + 14, 100, 100);
      g.strokeStyle = '#86858c'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(c.x + 20 + i * 17, c.y + 70); g.lineTo(c.x + 28 + i * 17, c.y + 106); g.stroke(); }
      g.fillStyle = '#a3a2a8'; g.font = `900 24px ${F.sans}`; g.textAlign = 'center'; g.fillText('制水弁', c.x + 64, c.y + 44); }
    { const c = UTIL.gas, cx = c.x + 64, cy = c.y + 64;
      g.fillStyle = '#5c5b62'; circle(g, cx, cy, 56); g.fillStyle = '#d7b448'; circle(g, cx, cy, 48); g.fillStyle = '#6f6e75'; circle(g, cx, cy, 38);
      g.fillStyle = '#e6d9a8'; g.font = `900 30px ${F.sans}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ガス', cx, cy + 2);
      wear(g, c.x, c.y, c.w, c.h, 0.5); }
    { const c = UTIL.drain;
      g.fillStyle = '#b6b4ac'; g.fillRect(c.x, c.y, 128, 128); g.fillStyle = '#3f3e44'; g.fillRect(c.x + 14, c.y + 14, 100, 100);
      g.fillStyle = '#7f868d'; for (let x = c.x + 16; x < c.x + 112; x += 9) g.fillRect(x, c.y + 14, 5, 100);
      g.fillRect(c.x + 14, c.y + 60, 100, 4);
      g.fillStyle = '#9aa1a8'; g.fillRect(c.x + 14, c.y + 14, 100, 3); g.fillRect(c.x + 14, c.y + 111, 100, 3); g.fillRect(c.x + 14, c.y + 14, 3, 100); g.fillRect(c.x + 111, c.y + 14, 3, 100);
      speckle(g, c.x, c.y, 128, 128, 200, ['rgba(80,78,72,0.3)', 'rgba(140,90,70,0.25)']); }
    // --- asphalt repair patches (darker, rough edge + tar seam)
    const patch = (c, pts, fill = '#76777b', seam = 'rgba(84,85,90,0.55)') => {
      g.save(); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(c.x + x, c.y + y) : g.moveTo(c.x + x, c.y + y))); g.closePath();
      g.fillStyle = fill; g.fill(); g.clip();
      speckle(g, c.x, c.y, c.w, c.h, c.w * c.h / 22, ['rgba(150,151,155,0.22)', 'rgba(92,94,100,0.22)', 'rgba(166,166,170,0.16)'], 1.0, 1.8);
      for (let i = 0; i < 6; i++) { const x = c.x + R() * c.w, y = c.y + R() * c.h, r = 20 + R() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(120,122,130,${0.1 + R() * 0.1})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.restore();
      g.strokeStyle = seam; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(c.x + x, c.y + y) : g.moveTo(c.x + x, c.y + y))); g.closePath(); g.stroke();
    };
    const jag = (x0, y0, x1, y1, n = 6) => { const out = []; const e = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
      for (const [ax, ay, bx, by] of e) for (let i = 0; i < n; i++) { const f = i / n; out.push([ax + (bx - ax) * f + (R() - 0.5) * 5, ay + (by - ay) * f + (R() - 0.5) * 5]); } return out; };
    patch(UTIL.patchA, jag(10, 10, 246, 246, 8));
    patch(UTIL.patchB, [[10, 10], [246, 12], [244, 130], [140, 132], [138, 246], [12, 244]].map(([x, y]) => [x + (R() - 0.5) * 4, y + (R() - 0.5) * 4]), '#78797d');
    patch(UTIL.patchC, jag(8, 8, 248, 248, 10), '#7b7c80');
    patch(UTIL.trench, jag(12, 6, 116, 506, 12), '#77787c');
    patch(UTIL.fresh, jag(6, 8, 250, 120, 10), '#686a6f', 'rgba(72,73,78,0.7)');
    { const c = UTIL.seal; g.strokeStyle = 'rgba(52,53,59,0.78)'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) { g.lineWidth = 5 + R() * 3; const pts = crackPts(c.x + 30 + k * 34, c.y + 10, Math.PI / 2 + (R() - 0.5) * 0.3, 30, 16);
        g.beginPath(); pts.forEach(([x, y], i) => { x = Math.min(c.x + c.w - 8, Math.max(c.x + 8, x)); y = Math.min(c.y + c.h - 8, y); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); } }
    // --- oil spots & stains
    const blot = (x, y, r, a, col = '62,63,70') => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const c of [UTIL.oilA, UTIL.oilB]) { for (let i = 0; i < 7; i++) blot(c.x + 64 + (R() - 0.5) * 50, c.y + 64 + (R() - 0.5) * 50, 14 + R() * 30, 0.22 + R() * 0.15); }
    { const c = UTIL.stain; for (let i = 0; i < 26; i++) blot(c.x + 20 + R() * 216, c.y + 64 + (R() - 0.5) * 50, 16 + R() * 34, 0.08 + R() * 0.08, '70,72,78'); }
    { const c = UTIL.wet; for (let i = 0; i < 30; i++) blot(c.x + 20 + R() * 216, c.y + 30 + R() * 70, 12 + R() * 30, 0.1 + R() * 0.08, '72,78,86'); }
    { const c = UTIL.skid; g.lineCap = 'round'; for (const y of [40, 88]) { g.strokeStyle = 'rgba(52,53,58,0.22)'; g.lineWidth = 16; g.beginPath(); g.moveTo(c.x + 10, c.y + y); g.quadraticCurveTo(c.x + 128, c.y + y + 6, c.x + 246, c.y + y - 4); g.stroke(); } }
    // --- survey / repair spray marks
    const spray = (fn, col, lw) => {
      g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalAlpha = 0.18; g.lineWidth = lw + 7; fn(); g.globalAlpha = 0.9; g.lineWidth = lw; fn(); g.restore();
    };
    const sprayText = (t, x, y, size, col) => { g.save(); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${size}px ${F.hand}`; g.globalAlpha = 0.2; for (let i = 0; i < 6; i++) g.fillText(t, x + (R() - 0.5) * 4, y + (R() - 0.5) * 4); g.globalAlpha = 0.9; g.fillText(t, x, y); g.restore(); };
    { const c = UTIL.sprayA;
      spray(() => { g.beginPath(); g.moveTo(c.x + 70, c.y + 220); g.lineTo(c.x + 70, c.y + 60); g.moveTo(c.x + 44, c.y + 90); g.lineTo(c.x + 70, c.y + 56); g.lineTo(c.x + 96, c.y + 90); g.stroke(); }, '#f2f0ea', 7);
      spray(() => { g.beginPath(); g.arc(c.x + 170, c.y + 80, 30, 0, TAU); g.stroke(); }, '#f0cf4a', 6);
      sprayText('ガ', c.x + 170, c.y + 80, 34, '#f0cf4a');
      for (let i = 0; i < 5; i++) spray(() => { g.beginPath(); g.arc(c.x + 130 + i * 22, c.y + 180, 3, 0, TAU); g.fill(); }, '#e2574c', 3);
      spray(() => { g.beginPath(); g.moveTo(c.x + 196, c.y + 196); g.lineTo(c.x + 226, c.y + 226); g.moveTo(c.x + 226, c.y + 196); g.lineTo(c.x + 196, c.y + 226); g.stroke(); }, '#e2574c', 6); }
    { const c = UTIL.sprayB;
      sprayText('水', c.x + 60, c.y + 60, 54, '#5e8fd0');
      spray(() => { g.beginPath(); g.moveTo(c.x + 20, c.y + 110); g.lineTo(c.x + 236, c.y + 110); g.moveTo(c.x + 206, c.y + 92); g.lineTo(c.x + 236, c.y + 110); g.lineTo(c.x + 206, c.y + 128); g.stroke(); }, '#5e8fd0', 6);
      sprayText('1.2m', c.x + 170, c.y + 58, 36, '#f2f0ea');
      spray(() => { g.beginPath(); g.moveTo(c.x + 30, c.y + 170); g.lineTo(c.x + 110, c.y + 170); g.lineTo(c.x + 110, c.y + 236); g.stroke(); }, '#f2f0ea', 6);
      sprayText('下', c.x + 180, c.y + 196, 50, '#ea8fb0'); }
    { const c = UTIL.sprayC;
      g.save(); g.setLineDash([22, 14]); spray(() => { g.strokeRect(c.x + 24, c.y + 24, 208, 208); }, '#f2f0ea', 6); g.restore();
      for (const [x, y] of [[24, 24], [232, 24], [24, 232], [232, 232]]) spray(() => { g.beginPath(); g.arc(c.x + x, c.y + y, 7, 0, TAU); g.fill(); }, '#ea8fb0', 3);
      sprayText('工', c.x + 128, c.y + 110, 70, '#f0cf4a'); sprayText('3/24', c.x + 128, c.y + 180, 34, '#f2f0ea'); }
  }, { key: 'st-util', anisotropy: 16 });

  // ------------------------------------------------------------------ sign faces atlas
  const signs = T.draw(ATLAS, ATLAS, (g) => {
    g.fillStyle = '#a9aeb3'; g.fillRect(0, 0, ATLAS, ATLAS); // default: galvanised back
    const RED = '#d9463b', BLUE = '#2f64b5', WHITE = '#f3f1ea', INK = '#2e2c36', YEL = '#f2c230';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const disc = (c, fill) => { g.fillStyle = fill; circle(g, c.x + c.w / 2, c.y + c.h / 2, c.w / 2 - 1); };
    // backs + pole metal
    { const c = SIGN.back; g.fillStyle = '#a6abb0'; g.fillRect(c.x, c.y, c.w, c.h); speckle(g, c.x, c.y, c.w, c.h, 60, ['rgba(120,124,130,0.4)', 'rgba(200,204,208,0.4)']); }
    { const c = SIGN.pole; g.fillStyle = '#b3b8bc'; g.fillRect(c.x, c.y, c.w, c.h); }
    // 30 km/h
    { const c = SIGN.n30, cx = c.x + 128, cy = c.y + 128;
      disc(c, WHITE); g.fillStyle = RED; circle(g, cx, cy, 116); g.fillStyle = WHITE; circle(g, cx, cy, 88);
      g.save(); g.fillStyle = BLUE; g.font = `900 150px ${F.sans}`; g.translate(cx, cy + 6); g.scale(0.72, 1.06); g.fillText('30', 0, 0); g.restore(); }
    // 駐車禁止
    { const c = SIGN.noPark, cx = c.x + 128, cy = c.y + 128;
      disc(c, WHITE); g.fillStyle = RED; circle(g, cx, cy, 116); g.fillStyle = BLUE; circle(g, cx, cy, 90);
      g.save(); g.beginPath(); g.arc(cx, cy, 90, 0, TAU); g.clip(); g.strokeStyle = RED; g.lineWidth = 26; g.beginPath(); g.moveTo(cx - 70, cy - 70); g.lineTo(cx + 70, cy + 70); g.stroke(); g.restore(); }
    // 止まれ (inverted triangle)
    { const c = SIGN.stop; const P = [[c.x + 6, c.y + 14], [c.x + 250, c.y + 14], [c.x + 128, c.y + 242]];
      const tri = (inset, fill) => { const cx = c.x + 128, cy = c.y + 90; g.fillStyle = fill; g.beginPath(); P.forEach(([x, y], i) => { const X = cx + (x - cx) * inset, Y = cy + (y - cy) * inset; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.fill(); };
      tri(1, WHITE); tri(0.9, RED);
      g.fillStyle = WHITE; g.font = `900 54px ${F.sans}`; g.fillText('止まれ', c.x + 128, c.y + 72);
      g.font = `700 26px ${F.en}`; g.fillText('STOP', c.x + 128, c.y + 122); }
    // 横断歩道 (blue square, white triangle, pedestrian)
    { const c = SIGN.cross;
      g.fillStyle = WHITE; T.roundRect(g, c.x + 4, c.y + 4, 248, 248, 20); g.fill();
      g.fillStyle = BLUE; T.roundRect(g, c.x + 14, c.y + 14, 228, 228, 14); g.fill();
      g.fillStyle = WHITE; g.beginPath(); g.moveTo(c.x + 128, c.y + 34); g.lineTo(c.x + 226, c.y + 214); g.lineTo(c.x + 30, c.y + 214); g.closePath(); g.fill();
      g.fillStyle = INK; for (let i = 0; i < 5; i++) g.fillRect(c.x + 66 + i * 26, c.y + 196, 16, 10);
      g.save(); g.translate(c.x + 128, c.y + 130); g.fillStyle = INK; g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
      circle(g, 4, -48, 11); g.lineWidth = 15; g.beginPath(); g.moveTo(2, -32); g.lineTo(-2, 8); g.stroke();
      g.lineWidth = 10; g.beginPath(); g.moveTo(-2, 6); g.lineTo(-22, 50); g.moveTo(-2, 6); g.lineTo(18, 48); g.moveTo(1, -24); g.lineTo(-22, -2); g.moveTo(1, -24); g.lineTo(24, -6); g.stroke(); g.restore(); }
    // 学校・幼稚園等あり (yellow diamond + children)
    { const c = SIGN.school, cx = c.x + 128, cy = c.y + 128;
      const dia = (r, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fill(); };
      dia(126, INK); dia(116, YEL); dia(106, INK); dia(101, YEL);
      g.fillStyle = INK; g.strokeStyle = INK; g.lineCap = 'round';
      const kid = (x, y, s, bag) => { g.save(); g.translate(x, y); g.scale(s, s); circle(g, 0, -40, 11); g.beginPath(); g.moveTo(-10, -26); g.lineTo(10, -26); g.lineTo(13, 8); g.lineTo(-13, 8); g.fill();
        if (bag) { T.roundRect(g, -22, -24, 12, 18, 3); g.fill(); } g.lineWidth = 7; g.beginPath(); g.moveTo(-5, 6); g.lineTo(-12, 36); g.moveTo(5, 6); g.lineTo(13, 35); g.stroke(); g.restore(); };
      kid(cx - 18, cy + 8, 1.15, true); kid(cx + 30, cy + 18, 0.85, false);
      g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 5, cy - 10); g.quadraticCurveTo(cx + 8, cy + 2, cx + 22, cy - 2); g.stroke(); }
    // supplementary plates
    const plate = (c, lines, col = INK, font = F.sans) => {
      g.fillStyle = WHITE; g.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
      g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(c.x + 8, c.y + 8, c.w - 16, c.h - 16);
      g.fillStyle = col;
      if (lines.length === 1) T.fitText(g, lines[0], c.x + c.w / 2, c.y + c.h / 2 + 2, c.w - 36, c.h * 0.56, font, 900);
      else { T.fitText(g, lines[0], c.x + c.w / 2, c.y + c.h * 0.35, c.w - 36, c.h * 0.36, font, 900); T.fitText(g, lines[1], c.x + c.w / 2, c.y + c.h * 0.72, c.w - 36, c.h * 0.26, F.en, 700); }
    };
    plate(SIGN.pTsugaku, ['通学路']);
    plate(SIGN.p820, ['8 - 20']);
    { const c = SIGN.pStop; g.fillStyle = WHITE; g.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4); g.strokeStyle = RED; g.lineWidth = 8; g.strokeRect(c.x + 10, c.y + 10, c.w - 20, c.h - 20);
      g.fillStyle = RED; T.fitText(g, '一時停止', c.x + 128, c.y + 56, 200, 58, F.sans, 900); g.fillStyle = INK; T.fitText(g, 'STOP', c.x + 128, c.y + 100, 150, 28, F.en, 700); }
    plate(SIGN.pPriority, ['前方優先道路']);
    plate(SIGN.pSchool, ['スクールゾーン', '7:30 - 9:00']);
    { const c = SIGN.pTown; g.fillStyle = WHITE; g.fillRect(c.x, c.y, c.w, c.h); g.fillStyle = INK; T.fitText(g, '八日町  No.12', c.x + 128, c.y + 33, 230, 30, F.sans, 700); }
    // blue guide sign: T junction diagram
    { const c = SIGN.guide, x0 = c.x, y0 = c.y;
      g.fillStyle = WHITE; T.roundRect(g, x0 + 2, y0 + 2, 508, 380, 26); g.fill();
      g.fillStyle = '#2c5fae'; T.roundRect(g, x0 + 10, y0 + 10, 492, 364, 20); g.fill();
      g.strokeStyle = WHITE; g.fillStyle = WHITE; g.lineCap = 'butt'; g.lineWidth = 26;
      const cx = x0 + 256, jy = y0 + 214;
      g.beginPath(); g.moveTo(cx, y0 + 352); g.lineTo(cx, y0 + 150); g.stroke();
      g.beginPath(); g.moveTo(x0 + 110, jy); g.lineTo(x0 + 402, jy); g.stroke();
      const head = (x, y, dx, dy) => { g.beginPath(); g.moveTo(x + dx * 34, y + dy * 34); g.lineTo(x - dy * 30, y + dx * 30); g.lineTo(x + dy * 30, y - dx * 30); g.closePath(); g.fill(); };
      head(cx, y0 + 150, 0, -1); head(x0 + 110, jy, -1, 0); head(x0 + 402, jy, 1, 0);
      // station pictogram
      g.fillStyle = WHITE; T.roundRect(g, cx + 22, y0 + 104, 40, 34, 6); g.fill(); g.fillStyle = '#2c5fae'; g.fillRect(cx + 28, y0 + 110, 28, 12); g.fillRect(cx + 26, y0 + 128, 8, 6); g.fillRect(cx + 50, y0 + 128, 8, 6);
      g.fillStyle = WHITE; g.textAlign = 'center'; g.textBaseline = 'middle';
      T.fitText(g, '気仙沼駅', cx, y0 + 56, 300, 58, F.sans, 900);
      T.fitText(g, 'Kesennuma Sta.', cx, y0 + 98, 190, 22, F.en, 700);
      T.fitText(g, '魚市場', x0 + 90, jy - 56, 160, 44, F.sans, 900);
      T.fitText(g, 'Fish Market', x0 + 94, jy + 44, 170, 19, F.en, 700);
      T.fitText(g, '内湾', x0 + 422, jy - 56, 160, 44, F.sans, 900);
      T.fitText(g, 'Inner Bay', x0 + 420, jy + 44, 150, 19, F.en, 700);
      g.textAlign = 'left'; T.fitText(g, '1.5km', x0 + 30, jy + 82, 90, 20, F.en, 700); g.textAlign = 'right'; T.fitText(g, '2.8km', x0 + 482, jy + 82, 90, 20, F.en, 700); g.textAlign = 'center'; }
    // 消火栓 sign
    { const c = SIGN.hydrant; g.fillStyle = WHITE; g.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4); g.fillStyle = RED; g.fillRect(c.x + 10, c.y + 10, c.w - 20, c.h - 20);
      T.verticalText(g, '消火栓', c.x + 64, c.y + 34, 58, F.sans, 900); g.fillStyle = WHITE; T.verticalText(g, '消火栓', c.x + 64, c.y + 34, 58, F.sans, 900); }
    for (const k of Object.keys(SIGN)) { if (k === 'back' || k === 'pole') continue; const c = SIGN[k]; speckle(g, c.x, c.y, c.w, c.h, c.w * c.h / 90, ['rgba(120,118,120,0.12)', 'rgba(255,255,255,0.12)'], 0.6, 1.5); }
  }, { key: 'st-signs', anisotropy: 8 });

  return { asphalt, pavers, curb, lgutter, lid, grate, dots, bars, line, paint, glyphs, util, signs };
}
