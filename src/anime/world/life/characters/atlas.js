// [v3:life] Adapted from Kenton-GMI/sakuragaoka-station (MIT, raw/ref/sakuragaoka-station/LICENSE), src/world/characters/atlas.js.
// Per-character 512² canvas atlas (one material per character):
//   Q0 (canvas 0..256, 0..256)    painted face in "angle space" (see FACE)
//   Q1 (256..512, 0..256)         plain white — vertex-coloured parts sample its centre
//   Q2 (0..256, 256..512)         hair: vertical tone ramp + "angel ring" highlight strokes
//   Q3 (256..512, 256..512)       4 × 128² cells: stripes (sailor collar / cuffs), plaid, misc A, misc B
// Quadrants are power-of-two aligned so mip levels never bleed between them.

export const FACE = { p0: -80, p1: 80, t0: -90, t1: 42 };   // degrees (azimuth φ, elevation θ)
const S = 512, Q = 256;
const inset = 2 / S;

/** atlas uv of a face-window angle (deg). Outside the window -> plain skin sample. */
export function faceUV(phDeg, thDeg) {
  if (phDeg < FACE.p0 || phDeg > FACE.p1 || thDeg < FACE.t0 || thDeg > FACE.t1) return [6 / S, 1 - 250 / S];
  const x = (phDeg - FACE.p0) / (FACE.p1 - FACE.p0), y = (FACE.t1 - thDeg) / (FACE.t1 - FACE.t0);
  return [inset + x * (0.5 - 2 * inset), 1 - (inset + y * (0.5 - 2 * inset))];
}
/** hair ramp uv: row 0 = crown .. 1 = tips; col 0..1 across the stroke band */
export function hairUV(row, col = 0.5) {
  const r = Math.min(1, Math.max(0, row)), c = Math.min(1, Math.max(0, col));
  return [inset + c * (0.5 - 2 * inset), 0.5 - inset - r * (0.5 - 2 * inset)];
}
/** Q3 cells: 0 stripes, 1 plaid, 2 miscA, 3 miscB. (gu, gv) in 0..1, gv=1 = top of the cell */
export function cellUV(cell, gu, gv) {
  const cx = 256 + (cell % 2) * 128, cy = 256 + Math.floor(cell / 2) * 128;
  const x = cx + 2 + gu * 124, y = cy + 2 + (1 - gv) * 124;
  return [x / S, 1 - y / S];
}
export const cellRect = (cell) => { const a = cellUV(cell, 0, 0), b = cellUV(cell, 1, 1); return [a[0], a[1], b[0], b[1]]; };

// ------------------------------------------------------------------ painting helpers
const fx = (ph) => (ph - FACE.p0) / (FACE.p1 - FACE.p0) * Q;
const fy = (th) => (FACE.t1 - th) / (FACE.t1 - FACE.t0) * Q;
const pxPerDegX = Q / (FACE.p1 - FACE.p0), pxPerDegY = Q / (FACE.t1 - FACE.t0);

function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); }

/** Paint one anime eye. o = +1 (canvas-right eye) / -1. f: face spec. variant: open|blink|laugh|down */
function eye(g, cx, cy, o, f, variant) {
  const W = f.eyeW * pxPerDegX, H = f.eyeH * pxPerDegY;
  const ink = f.ink || '#3b3144';
  const X = (u) => cx + o * u * W, Y = (v) => cy + v * H; // u: -0.5 inner .. +0.5 outer (mirrored)
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (variant === 'blink' || variant === 'laugh' || f.closed) {
    const up = variant === 'laugh' ? -1 : 1;
    g.strokeStyle = ink; g.lineWidth = Math.max(1.6, H * 0.075 * (f.lash ?? 1));
    g.beginPath();
    g.moveTo(X(-0.46), Y(0.05));
    g.quadraticCurveTo(X(0.0), Y(0.05 + up * 0.28), X(0.5), Y(-0.02));
    g.stroke();
    if ((f.lash ?? 1) > 0.6 && variant !== 'laugh') { g.lineWidth *= 0.6; g.beginPath(); g.moveTo(X(0.46), Y(0.0)); g.lineTo(X(0.6), Y(-0.1)); g.stroke(); }
    if (f.wrinkles) { g.lineWidth = 1; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(X(0.62), Y(0.05)); g.lineTo(X(0.78), Y(-0.02)); g.moveTo(X(0.62), Y(0.18)); g.lineTo(X(0.76), Y(0.24)); g.stroke(); g.globalAlpha = 1; }
    return;
  }
  const lidTop = variant === 'down' ? -0.18 : (f.lidTop ?? -0.5);   // how open (top of the opening)
  // opening shape
  const shape = () => {
    g.beginPath();
    g.moveTo(X(-0.5), Y(0.02));
    g.bezierCurveTo(X(-0.42), Y(lidTop + 0.08), X(0.18), Y(lidTop - 0.02), X(0.52), Y(lidTop * 0.35));
    g.bezierCurveTo(X(0.48), Y(0.3), X(0.2), Y(0.48), X(-0.02), Y(0.47));
    g.bezierCurveTo(X(-0.28), Y(0.46), X(-0.46), Y(0.28), X(-0.5), Y(0.02));
    g.closePath();
  };
  g.save();
  shape(); g.fillStyle = f.white || '#f3efec'; g.fill();
  g.clip();
  // iris
  const ix = X(0.03 * (f.look || 0) + 0.02), iy = Y(0.08 + (variant === 'down' ? 0.12 : 0));
  const irx = W * (f.iris ?? 0.36), iry = H * (f.irisH ?? 0.46);
  const grd = g.createLinearGradient(0, iy - iry, 0, iy + iry);
  grd.addColorStop(0, f.irisDark); grd.addColorStop(0.45, f.irisMid); grd.addColorStop(1, f.irisLight);
  ellipse(g, ix, iy, irx, iry); g.fillStyle = grd; g.fill();
  g.lineWidth = Math.max(1, W * 0.045); g.strokeStyle = f.irisDark; g.stroke();
  ellipse(g, ix, iy + iry * 0.06, irx * 0.46, iry * 0.52); g.fillStyle = f.pupil || f.irisDark; g.fill();
  // lid shadow over the top of the iris
  g.globalAlpha = 0.35; g.fillStyle = f.irisDark; g.fillRect(cx - W, Y(lidTop - 0.1), W * 2, H * 0.22); g.globalAlpha = 1;
  // highlights (same side on both eyes: light from canvas-right/top)
  ellipse(g, ix + irx * 0.34, iy - iry * 0.36, irx * 0.34, iry * 0.26, -0.4); g.fillStyle = '#f7f5f2'; g.fill();
  ellipse(g, ix - irx * 0.38, iy + iry * 0.42, irx * 0.14, iry * 0.1); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
  g.restore();
  // upper lash line (thick, flicked at the outer corner)
  const lw = Math.max(1.8, H * 0.1 * (f.lash ?? 1));
  g.strokeStyle = ink; g.fillStyle = ink;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(X(-0.5), Y(0.04));
  g.bezierCurveTo(X(-0.42), Y(lidTop + 0.06), X(0.18), Y(lidTop - 0.04), X(0.54), Y(lidTop * 0.35 - 0.02));
  g.stroke();
  if ((f.lash ?? 1) > 0.55) {
    g.lineWidth = lw * 0.7;
    g.beginPath(); g.moveTo(X(0.44), Y(lidTop * 0.5 - 0.02)); g.quadraticCurveTo(X(0.6), Y(lidTop * 0.45 - 0.05), X(0.68), Y(lidTop * 0.2 - 0.16)); g.stroke();
    g.lineWidth = lw * 0.45;
    g.beginPath(); g.moveTo(X(0.52), Y(lidTop * 0.35)); g.lineTo(X(0.66), Y(lidTop * 0.2 + 0.02)); g.stroke();
  }
  // double-lid crease
  g.globalAlpha = 0.5; g.lineWidth = Math.max(0.8, lw * 0.28);
  g.beginPath(); g.moveTo(X(-0.28), Y(lidTop - 0.12)); g.quadraticCurveTo(X(0.12), Y(lidTop - 0.24), X(0.46), Y(lidTop * 0.35 - 0.2)); g.stroke();
  g.globalAlpha = 1;
  // lower lash (short, outer half)
  g.lineWidth = Math.max(0.9, lw * 0.32); g.globalAlpha = 0.8;
  g.beginPath(); g.moveTo(X(0.06), Y(0.48)); g.quadraticCurveTo(X(0.34), Y(0.44), X(0.47), Y(0.3)); g.stroke();
  g.globalAlpha = 1;
  if (f.wrinkles) { g.lineWidth = 1; g.globalAlpha = 0.4; g.beginPath(); g.moveTo(X(0.64), Y(0.08)); g.lineTo(X(0.8), Y(0.02)); g.moveTo(X(0.62), Y(0.24)); g.lineTo(X(0.76), Y(0.32)); g.stroke(); g.globalAlpha = 1; }
}

function paintFace(g, f, variant) {
  g.fillStyle = f.skin; g.fillRect(0, 0, Q, Q);
  // soft cheek/neck shading bands (anime faces keep it minimal)
  const ey = fy(f.eyeT), ex = fx(f.eyeP) - fx(0);
  // blush
  if (f.blush > 0) {
    for (const o of [-1, 1]) {
      const bx = fx(o * (f.eyeP + 6)), by = fy(f.eyeT - f.eyeH * 0.95);
      const rg = g.createRadialGradient(bx, by, 0, bx, by, 13 * pxPerDegX);
      rg.addColorStop(0, `rgba(240,140,150,${0.5 * f.blush})`); rg.addColorStop(1, 'rgba(240,140,150,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(bx, by, 13 * pxPerDegX, 6 * pxPerDegY, 0, 0, Math.PI * 2); g.fill();
      if (f.blushLines) {
        g.strokeStyle = `rgba(214,110,128,${0.55 * f.blush})`; g.lineWidth = 1.1;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(bx + i * 5 - 2, by + 3); g.lineTo(bx + i * 5 + 2, by - 3); g.stroke(); }
      }
    }
  }
  // brows
  g.strokeStyle = f.brow || f.ink; g.lineCap = 'round';
  for (const o of [-1, 1]) {
    const b0 = fx(o * (f.eyeP - f.eyeW * 0.45)), b1 = fx(o * (f.eyeP + f.eyeW * 0.55));
    const by = fy(f.eyeT + f.eyeH * 0.5 + f.browGap);
    g.lineWidth = f.browW;
    g.beginPath(); g.moveTo(b0, by + 1.5); g.quadraticCurveTo((b0 + b1) / 2, by - f.browArch, b1, by + 2.5 + (f.browTilt || 0)); g.stroke();
  }
  // eyes
  for (const o of [-1, 1]) eye(g, fx(o * f.eyeP), ey, o, f, variant);
  // nose: tiny soft stroke
  g.strokeStyle = f.noseCol || 'rgba(196,130,120,0.75)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(fx(1.2), fy(f.noseT + 2)); g.lineTo(fx(-0.6), fy(f.noseT)); g.stroke();
  // mouth
  const mx = fx(0), my = fy(f.mouthT);
  const mw = f.mouthW * pxPerDegX;
  if (variant === 'talk' || variant === 'laugh') {
    const oh = (variant === 'laugh' ? 0.75 : 0.45) * mw;
    g.fillStyle = '#9a4f5a';
    g.beginPath(); g.moveTo(mx - mw * 0.55, my - oh * 0.15); g.quadraticCurveTo(mx, my - oh * 0.35, mx + mw * 0.55, my - oh * 0.15);
    g.quadraticCurveTo(mx + mw * 0.3, my + oh, mx, my + oh); g.quadraticCurveTo(mx - mw * 0.3, my + oh, mx - mw * 0.55, my - oh * 0.15); g.fill();
    g.fillStyle = '#d98890'; ellipse(g, mx, my + oh * 0.62, mw * 0.25, oh * 0.28); g.fill();
  } else {
    g.strokeStyle = f.mouthCol || '#a8626a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(mx - mw * 0.5, my - (f.smile || 0) * 1.5); g.quadraticCurveTo(mx, my + 1.5 + (f.smile || 0) * 2, mx + mw * 0.5, my - (f.smile || 0) * 1.5); g.stroke();
  }
  if (f.wrinkles) {
    g.strokeStyle = 'rgba(170,120,110,0.45)'; g.lineWidth = 1.1;
    for (const o of [-1, 1]) { g.beginPath(); g.moveTo(fx(o * 9), fy(f.noseT - 5)); g.quadraticCurveTo(fx(o * 14), fy(f.mouthT + 2), fx(o * 12), fy(f.mouthT - 6)); g.stroke(); }
  }
}

function paintHair(g, h) {
  const x0 = 0, y0 = Q, W = Q, H = Q;
  const grd = g.createLinearGradient(0, y0, 0, y0 + H);
  grd.addColorStop(0, h.top); grd.addColorStop(0.42, h.base); grd.addColorStop(0.75, h.base); grd.addColorStop(1, h.tip || h.base);
  g.fillStyle = grd; g.fillRect(x0, y0, W, H);
  // angel ring: lens-shaped strokes centred on col 0.5 fading toward the band ends
  const ry = y0 + H * (h.ring ?? 0.3);
  g.fillStyle = h.hi;
  g.beginPath();
  g.moveTo(x0 + 0.05 * W, ry);
  g.quadraticCurveTo(x0 + 0.5 * W, ry - H * 0.055, x0 + 0.95 * W, ry);
  g.quadraticCurveTo(x0 + 0.5 * W, ry + H * 0.03, x0 + 0.05 * W, ry);
  g.fill();
  g.globalAlpha = 0.6; g.fillStyle = h.hi2 || h.hi;
  g.beginPath(); g.moveTo(x0 + 0.3 * W, ry - H * 0.004); g.quadraticCurveTo(x0 + 0.5 * W, ry - H * 0.03, x0 + 0.7 * W, ry - H * 0.004); g.quadraticCurveTo(x0 + 0.5 * W, ry + H * 0.01, x0 + 0.3 * W, ry - H * 0.004); g.fill();
  g.globalAlpha = 1;
}

function paintStripes(g, s) {
  const x0 = 256, y0 = 256;
  g.fillStyle = s.base; g.fillRect(x0, y0, 128, 128);
  g.fillStyle = s.line;
  for (const [a, b] of s.bands || [[0.12, 0.17], [0.23, 0.28]]) g.fillRect(x0, y0 + a * 128, 128, (b - a) * 128);
}
function paintPlaid(g, p) {
  const x0 = 384, y0 = 256;
  g.fillStyle = p.base; g.fillRect(x0, y0, 128, 128);
  g.globalAlpha = 0.55; g.fillStyle = p.band;
  g.fillRect(x0 + 18, y0, 30, 128); g.fillRect(x0, y0 + 50, 128, 30);
  g.globalAlpha = 0.5; g.fillStyle = p.dark;
  g.fillRect(x0 + 70, y0, 14, 128); g.fillRect(x0, y0 + 100, 128, 14);
  g.globalAlpha = 0.9; g.fillStyle = p.line;
  g.fillRect(x0 + 104, y0, 3, 128); g.fillRect(x0, y0 + 20, 128, 3);
  g.globalAlpha = 1;
}

/** Build the atlas texture for one character + variant. spec: { key, face, hair, stripes?, plaid?, misc?(g, cell) } */
export function makeAtlas(ctx, spec, variant = 'open') {
  const key = `chr|${spec.key}|${variant}`;
  return ctx.tex.draw(S, S, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(256, 0, 256, 256);
    g.fillStyle = '#ffffff'; g.fillRect(256, 256, 256, 256);
    if (spec.face) paintFace(g, spec.face, variant); else { g.fillStyle = '#ffffff'; g.fillRect(0, 0, Q, Q); }
    if (spec.hair) paintHair(g, spec.hair); else { g.fillStyle = '#ffffff'; g.fillRect(0, Q, Q, Q); }
    if (spec.stripes) paintStripes(g, spec.stripes);
    if (spec.plaid) paintPlaid(g, spec.plaid);
    if (spec.misc) { spec.misc(g, 256, 384, 128); }   // cell 2 origin
    if (spec.misc2) { spec.misc2(g, 384, 384, 128); } // cell 3 origin
    if (spec.paintQ0) spec.paintQ0(g, variant);
  }, { key, anisotropy: 4 });
}
