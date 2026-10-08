// [loader] The loader's second runner: a katsuo (bonito / skipjack, the signature catch of Kesennuma) as a six-frame side-view sprite, drawn in code (an original drawing).
//
//   env -u NODE_OPTIONS bun tools/anime/bonito-sprite.mjs [--out src/anime/assets/runner/bonito-run.svg] [--preview /tmp/bonito-preview.html]
//   --preview writes the review sheet as one HTML page: the six frames at 3x, then the cycle at 64, 84 and 96 px tall over the 藍 sea (浅葱 crest line), the 勿忘草 day sky and the 紺 night sky.
//
// One SVG strip, SIX frames side by side (FRAME_W x FRAME_H each, snout to the right), for ui/loader/sprite-runner.js (CSS steps() over the strip: transform only).
// It is the progress head until the city approves the official mascot for that job, so it is a plain original character: a clean flat-colour anime sticker, round soft shapes.
//
// What moves between frames (everything is periodic over the six frames, so frame 5 -> frame 0 is seamless):
//   - the body undulates: a sine wave travels from the head to the tail along the spine (the head, and so the snout and the eye, stay steady, as a tuna's do),
//   - the tail follows the spine's own slope (a little further, so it whips) and swings through one full beat; a fork tip that dips below the waterline is cut off there, under the foam,
//   - the pectoral fin and the two dorsal fins flutter, the finlets ride the back,
//   - a bow curl of foam, two foam banks and two small fountains of droplets (at the chin and behind the tail) breathe at the waterline.
// Frame 0 is the rest pose (and the still for reduced motion): a gently arched body with the tail just under the middle of its beat.
//
// Katsuo features that make it read at 64 px: the dark 藍 back over a silver 生成り belly, five dark belly stripes (the skipjack's trademark), a lunate forked tail, two dorsal
// fins, a row of 山吹 finlets, a pectoral fin, a big round friendly eye with a gold ring, a tiny smile, a 茜 blush. The silver belly tapers out before the tail root, so the
// peduncle is all 藍 and flows into the 紺 tail without a seam; the tail sits behind the body and its root is hidden by it.
//
// The waterline of the sprite is at y = WATER (78 of 96): the lower belly dips into it, and the foam sits on it. The page's crest line goes through y = 78 of the frame.
//
// Palette: traditional Japanese colours only (named below). The 2-unit outline is 紺, never black. A thin 生成り rim (70 %) hugs the silhouette so the fish reads on the 紺 night sky.
// Size: every curve is fitted (Schneider) to a few cubic Beziers and written in relative coordinates, the parts that never change live once in <defs>; the strip stays under 24 KB.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const FRAMES = 6;
export const FRAME_W = 192;   // a 2:1 frame: shown 64 to 96 px tall, so 128 to 192 px wide
export const FRAME_H = 96;
export const WATER = 78;      // the waterline of the sprite, in frame units

const AI = '#165E83';        // 藍 ai: the back
const KON = '#223A70';       // 紺 kon: the outline, the belly stripes, the tail and the dorsal fins
const KINARI = '#FBFAF5';    // 生成り kinari: the belly, the eye white, the foam, the rim
const ASAGI = '#00A3AF';     // 浅葱 asagi: the pectoral fin and the rays of the fins (the fin accent), the splash
const WASURE = '#89C3EB';    // 勿忘草 wasurenagusa: the highlight on the back
const YAMABUKI = '#F8B500';  // 山吹 yamabuki: the finlets and the ring of the eye
const AKANE = '#B7282E';     // 茜 akane: the blush on the cheek
const SUMI = '#1C1C1C';      // 墨 sumi: the pupil
export const INK = KON;

const TAU = Math.PI * 2;

// ---- number and path formatting: one decimal, no leading zeros, no separators that the path grammar does not need
const num = (v) => { let s = String(Math.round(v * 10) / 10); if (s === '-0') s = '0'; return s.replace(/^(-?)0\./, '$1.'); };
const nums = (...v) => { let o = '', prev = ''; for (const x of v) { const s = num(x); o += (o && !(s[0] === '-' || (s[0] === '.' && prev.includes('.'))) ? ' ' : '') + s; prev = s; } return o; };
const q10 = (v) => Math.round(v * 10);

// ---- geometry kit
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const bezAt = (c, t) => { const s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t; return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]; };

/** A monotone cubic (PCHIP) through (xs ascending, ys): y(x) with no overshoot, clamped outside the range. */
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
/** A Catmull-Rom curve through P, sampled densely (open: ends doubled; closed: wraps). */
function crSample(P, closed, per = 8) {
  const n = P.length, out = [], at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c = [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2];
    for (let j = 0; j < per; j++) out.push(bezAt(c, j / per));
  }
  if (!closed) out.push(P[n - 1]);
  return out;
}
// Schneider's curve fitting (Graphics Gems I): a dense polyline -> as few cubic Beziers as the tolerance allows. t1 points forward at the start, t2 backward at the end.
function genBezier(P, u, t1, t2) {
  const p0 = P[0], p3 = P[P.length - 1];
  let C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
  P.forEach((p, i) => {
    const ui = u[i], s = 1 - ui, B0 = s * s * s, B1 = 3 * ui * s * s, B2 = 3 * ui * ui * s, B3 = ui * ui * ui;
    const a1 = mul(t1, B1), a2 = mul(t2, B2), tmp = sub(p, add(mul(p0, B0 + B1), mul(p3, B2 + B3)));
    C00 += dot(a1, a1); C01 += dot(a1, a2); C11 += dot(a2, a2); X0 += dot(a1, tmp); X1 += dot(a2, tmp);
  });
  const det = C00 * C11 - C01 * C01, seg = len(sub(p3, p0));
  let al = 0, ar = 0;
  if (Math.abs(det) > 1e-12) { al = (X0 * C11 - X1 * C01) / det; ar = (C00 * X1 - C01 * X0) / det; }
  if (al < 1e-6 * seg || ar < 1e-6 * seg) al = ar = seg / 3;
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3];
}
function newton(c, p, u) {
  const s = 1 - u, d = sub(bezAt(c, u), p);
  const q1 = mul(add(add(mul(sub(c[1], c[0]), s * s), mul(sub(c[2], c[1]), 2 * s * u)), mul(sub(c[3], c[2]), u * u)), 3);
  const q2 = mul(add(mul(add(sub(c[2], mul(c[1], 2)), c[0]), s), mul(add(sub(c[3], mul(c[2], 2)), c[1]), u)), 6);
  const den = dot(q1, q1) + dot(d, q2);
  return den === 0 ? u : u - dot(d, q1) / den;
}
function fitCubic(P, t1, t2, tol, out) {
  if (P.length === 2) { const d = len(sub(P[1], P[0])) / 3; out.push([P[0], add(P[0], mul(t1, d)), add(P[1], mul(t2, d)), P[1]]); return; }
  let u = [0];
  for (let i = 1; i < P.length; i++) u.push(u[i - 1] + len(sub(P[i], P[i - 1])));
  u = u.map((v) => v / u[u.length - 1]);
  let bez = genBezier(P, u, t1, t2), maxD = 0, split = P.length >> 1;
  const check = () => { maxD = 0; for (let i = 1; i < P.length - 1; i++) { const d = len(sub(bezAt(bez, u[i]), P[i])); if (d >= maxD) { maxD = d; split = i; } } };
  check();
  if (maxD < tol) { out.push(bez); return; }
  if (maxD < tol * 6) for (let k = 0; k < 5 && maxD >= tol; k++) { u = u.map((ui, i) => Math.min(1, Math.max(0, newton(bez, P[i], ui)))); bez = genBezier(P, u, t1, t2); check(); }
  if (maxD < tol) { out.push(bez); return; }
  const tc = unit(sub(P[split - 1], P[split + 1]));
  fitCubic(P.slice(0, split + 1), t1, tc, tol, out);
  fitCubic(P.slice(split), mul(tc, -1), t2, tol, out);
}
/** Fit an open dense polyline; t1/t2 override the end tangents (else estimated from the samples). */
function fitOpen(P, tol = 0.14, t1 = null, t2 = null) {
  const n = P.length, out = [];
  fitCubic(P, t1 ?? unit(sub(P[Math.min(2, n - 1)], P[0])), t2 ?? unit(sub(P[Math.max(n - 3, 0)], P[n - 1])), tol, out);
  return out;
}
/** SVG path data for cubics: absolute 'M', relative 'c' (computed from the rounded current point, so rounding never accumulates). */
function cubicsD(cubics) {
  let d = '', cur = null;
  for (const [p0, c1, c2, p3] of cubics) {
    if (!cur || cur[0] !== q10(p0[0]) || cur[1] !== q10(p0[1])) { cur = [q10(p0[0]), q10(p0[1])]; d += 'M' + nums(cur[0] / 10, cur[1] / 10); }
    const e = [q10(p3[0]), q10(p3[1])];
    d += 'c' + nums((q10(c1[0]) - cur[0]) / 10, (q10(c1[1]) - cur[1]) / 10, (q10(c2[0]) - cur[0]) / 10, (q10(c2[1]) - cur[1]) / 10, (e[0] - cur[0]) / 10, (e[1] - cur[1]) / 10);
    cur = e;
  }
  return d;
}
const openD = (P, tol, t1, t2) => cubicsD(fitOpen(P, tol, t1, t2));

// ---- the body: a torpedo with a rounded snout (faces right). x runs from the snout (NOSE_X) back to the tail root (PED_X); YC is the centre line at rest.
const NOSE_X = 178, PED_X = 46, REAR_X = 37, YC = 56;
// [x, half depth above the centre line, half depth below it]
const STATIONS = [[37, 0, 0], [38.5, 3, 2.7], [41, 4.4, 4], [46, 5.6, 5], [52, 7.6, 6.8], [61, 12, 10.8], [72, 16.8, 16.2], [84, 19.8, 19.6], [98, 21.8, 21.6], [114, 22.4, 22.2], [130, 21.6, 22], [144, 19.2, 20.6], [155, 15.8, 17.4], [164, 11.4, 13], [171, 6.6, 7.8], [175, 3.2, 4], [178, 0, 0]];
const UP = pchip(STATIONS.map((r) => r[0]), STATIONS.map((r) => r[1]));
const DOWN = pchip(STATIONS.map((r) => r[0]), STATIONS.map((r) => r[2]));
// where the 藍 back meets the 生成り belly, as a fraction of the depth from the top: the silver belly tapers out before the tail root (the peduncle is all 藍, so it flows into the 紺 tail), and it is high on the snout so the smile sits on the silver
const SPLIT = pchip([37, 46, 52, 58, 66, 90, 120, 150, 165, 178], [1, 0.96, 0.82, 0.64, 0.5, 0.47, 0.5, 0.55, 0.5, 0.44]);

// ---- the swimming wave: a sine that travels from the head to the tail, zero at the head and growing toward the tail (a stiff-bodied tuna).
const S0 = 0.26, A_TAIL = 6, KAPPA = 0.8, PH0 = 0.1, TAIL_GAIN = 0.78;
const sOf = (x) => (NOSE_X - x) / (NOSE_X - PED_X);                // 0 at the snout, 1 at the tail root
const env = (s) => { if (s <= S0) return 0; const t = (s - S0) / (1 - S0); return t * t; };
const wave = (x, ph) => { const s = sOf(x); return A_TAIL * env(s) * Math.sin(TAU * (KAPPA * (s - 1) - ph)); };
const slopeDeg = (x, ph) => Math.atan(wave(x + 0.5, ph) - wave(x - 0.5, ph)) * 180 / Math.PI;     // the spine's tilt (positive: the tail side rises)
const top = (x, ph) => YC + wave(x, ph) - UP(x);
const bot = (x, ph) => YC + wave(x, ph) + DOWN(x);
const split = (x, ph) => top(x, ph) + SPLIT(x) * (UP(x) + DOWN(x));

const OUTLINE_XS = [174, 163, 150, 134, 116, 98, 80, 64, 52, 44];
function bodyD(ph) {
  const P = [[NOSE_X, YC + wave(NOSE_X, ph)]];
  for (const x of OUTLINE_XS) P.push([x, top(x, ph)]);
  P.push([REAR_X, YC + wave(REAR_X, ph)]);
  for (const x of [...OUTLINE_XS].reverse()) P.push([x, bot(x, ph)]);
  const D = crSample(P, true), per = D.length / P.length, ir = (1 + OUTLINE_XS.length) * per, N = D.length;
  const tan = (i) => unit(sub(D[(i + 1) % N], D[(i - 1 + N) % N]));
  const a = D.slice(0, ir + 1), b = [...D.slice(ir), D[0]], out = [];      // the nose -> the tail end along the back, then the tail end -> the nose along the belly
  fitCubic(a, tan(0), mul(tan(ir), -1), 0.1, out);
  fitCubic(b, tan(ir), mul(tan(0), -1), 0.1, out);
  return cubicsD(out) + 'Z';
}
/** The 藍 back: everything above the colour split, clipped by the body. */
function backD(ph) {
  const P = [];
  for (let x = 181; x >= 37; x -= 4) P.push([x, split(x, ph)]);
  return openD(P, 0.14) + 'L37 -4 181 -4Z';
}
/** The 勿忘草 highlight: a slim lens on the upper back (a soft cel-shaded gleam). */
function glintD(ph) {
  const a = [], b = [], n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = 146 - 64 * t, w = 3.5 * Math.pow(Math.sin(Math.PI * t), 0.7), c = top(x, ph) + 5.6 + 1.4 * t;
    a.push([x, c - w / 2]); b.push([x, c + w / 2]);
  }
  return cubicsD([...fitOpen(a, 0.1), ...fitOpen(b.reverse(), 0.1)]) + 'Z';
}
/** The belly stripes of a skipjack: parallel to the colour split, the lower ones run out first where the belly rises. [offset below the split, x where it starts, width] */
const STRIPES = [[3.9, 121, 2.5], [8.3, 118, 2.6], [12.7, 114, 2.6], [17, 108, 2.5], [21.2, 100, 2.3]];
function stripesD(ph) {
  let d = '';
  for (const [off, x0] of STRIPES) {
    const P = [];
    for (let x = x0; x >= 60; x -= 3) {
      const y = split(x, ph) + off;
      if (y > bot(x, ph) - 3.9) break;
      P.push([x, y]);
    }
    if (P.length >= 3) d += openD(P, 0.12);
  }
  return d;
}
/** The row of finlets between the second dorsal and the tail: five small triangles that follow the back (drawn twice: a dark pad, then the yellow, so the tips come out round). */
function finletsD(ph) {
  let d = '';
  const N = 5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), xf = 76.5 - i * 6.6, w = 5.9 - 0.8 * t, h = 6.5 - 1.6 * t, lean = 1.4;
    const A = [xf, top(xf, ph)], B = [xf - w, top(xf - w, ph)];
    const tt = unit(sub(B, A)), nn = [-tt[1], tt[0]];                                      // tt: toward the tail, nn: up and out
    const A2 = sub(A, mul(nn, 1.8)), B2 = sub(B, mul(nn, 1.8));
    const M = mul(add(A, B), 0.5), apex = add(add(M, mul(nn, h)), mul(tt, lean));
    d += 'M' + nums(A2[0], A2[1]) + 'l' + nums(apex[0] - A2[0], apex[1] - A2[1], B2[0] - apex[0], B2[1] - apex[1]) + 'z';
  }
  return d;
}

// ---- the parts that are the same shape in every frame (drawn once in <defs>, placed per frame with a transform)
// The tail and the dorsal fins are filled AND stroked in 紺 with a fat round stroke (4.4), so their tips come out round and soft; these paths are the thin cores of the shapes.
const TAIL = 'M0 -3.7A3.7 3.7 0 0 1 0 3.7C-3 4.2 -9 7.4 -16 13C-20 16.4 -24 19 -26.4 19.4C-25.2 14 -19.6 7.2 -9.6 0C-19.6 -7.2 -25.2 -14 -26.4 -19.4C-24 -19 -20 -16.4 -16 -13C-9 -7.4 -3 -4.2 0 -3.7Z';   // lunate tail: a round root at the pivot (0,0) under the end of the body, two swept-back horns, tips to -x
const TAIL_RAYS = 'M-5.4 -3.4C-10 -5.8 -15 -9.4 -19.6 -14.4M-5.4 3.4C-10 5.8 -15 9.4 -19.6 14.4';                                                       // two 浅葱 rays
const D1 = `M136 ${YC - 17}C135.5 ${YC - 25} 131.5 ${YC - 31} 126.5 ${YC - 34.5}C120 ${YC - 31} 108 ${YC - 25} 98 ${YC - 18}Z`;                    // first dorsal, swept back
const D1_RAY = `M131 ${YC - 21}C130 ${YC - 25.5} 128.5 ${YC - 28.5} 126 ${YC - 30.5}`;
const D2 = `M94 ${YC - 19}C91.5 ${YC - 25} 89 ${YC - 26.2} 87 ${YC - 26.2}C84.5 ${YC - 22.5} 82 ${YC - 19} 78 ${YC - 16.5}Z`;                       // second dorsal
const PEC = `M146.5 ${YC + 4.6}C138 ${YC + 3.2} 128 ${YC + 8} 119 ${YC + 16.6}C128.5 ${YC + 16.4} 138 ${YC + 14} 145 ${YC + 11.6}Z`;                // pectoral fin
const CURL = 'M0 0C1.4 -3.6 5.6 -6.2 10.2 -6.2C14.8 -6.2 18.4 -3.9 18.8 -.8C16.4 -2 13.4 -2.2 11.9 -.2C10.8 1.2 12 2.5 13.8 2.5C9.6 3.4 3.6 3 0 0Z';   // the bow curl of foam, base at (0,0)
const EX = 159.6, EY = YC - 1.6;
const FACE = `<g fill="none" stroke="${KON}" stroke-width="1.6">
<path d="M149.5 ${YC - 13}Q140.5 ${YC + 1} 148.5 ${YC + 14.5}"/><path d="M177.8 ${YC + 0.5}Q173.6 ${YC + 4.7} 170.1 ${YC + 0.1}" stroke-width="1.8"/></g>
<ellipse cx="155.6" cy="${YC + 9.6}" rx="4.3" ry="2.8" fill="${AKANE}" opacity=".55"/>
<circle cx="${EX}" cy="${EY}" r="7.6" fill="${KINARI}" stroke="${KON}" stroke-width="1.8"/><circle cx="${EX + 1}" cy="${EY + 0.4}" r="5.5" fill="${YAMABUKI}"/>
<circle cx="${EX + 1.6}" cy="${EY + 0.6}" r="3.8" fill="${SUMI}"/><circle cx="${EX + 3.2}" cy="${EY - 1.9}" r="1.8" fill="${KINARI}"/><circle cx="${EX - 0.6}" cy="${EY + 2.4}" r="0.9" fill="${KINARI}"/>`;

// ---- the splash: foam banks (scalloped, one outline) and droplets that each fly one short arc per beat
/** A bank of foam on the waterline: scallops of widths ws and heights hs along y = yw, a shallow belly underneath. */
function bank(x0, yw, ws, hs, under) {
  let d = 'M' + nums(x0, yw), W = 0;
  ws.forEach((w, i) => { const h = Math.max(0.6, hs[i]), r = (w * w / 4 + h * h) / (2 * h); d += 'a' + nums(r, r, 0) + ' 0 1' + ' ' + nums(w, 0); W += w; });
  const r2 = (W * W / 4 + under * under) / (2 * under);
  return d + 'a' + nums(r2, r2, 0) + ' 0 1' + ' ' + nums(-W, 0) + 'z';
}
const breathe = (ph, o, a) => 1 + a * Math.sin(TAU * (ph + o));
// [x0, y0, dx, rise, radius, phase offset, solid 浅葱 (1) or 生成り with a 浅葱 rim (0)]
const DROPS = [
  [172, 75.5, 7, 12, 3, 0.00, 0], [180, 75.5, 9, 14, 1.7, 0.30, 1], [168, 76.5, 3.5, 11, 1.9, 0.52, 1], [176, 76, 13, 9, 1.8, 0.74, 0], [172, 76.5, 6, 7, 1.4, 0.88, 1],
  [16, 77, -5, 14, 2, 0.14, 0], [12, 78, -6, 8, 1.4, 0.46, 1], [20, 77, -2, 19, 1.5, 0.72, 1],
];
function dropsSvg(ph) {
  let rim = '', solid = '';
  for (const [x0, y0, dx, rise, r0, off, kind] of DROPS) {
    const u = (ph + off) % 1, r = r0 * Math.pow(Math.sin(Math.PI * u), 0.55);
    if (r < 0.6) continue;
    const c = `<circle cx="${Math.round(x0 + dx * u)}" cy="${Math.round(y0 - rise * 4 * u * (1 - u))}" r="${num(r)}"/>`;
    if (kind) solid += c; else rim += c;
  }
  return `<g fill="${KINARI}" stroke="${ASAGI}" stroke-width="1.2">${rim}</g><g fill="${ASAGI}">${solid}</g>`;
}

const COMMON_DEFS = `<defs><clipPath id="w"><rect width="${FRAME_W}" height="${WATER + 2.5}"/></clipPath>
<g id="tg"><path d="${TAIL}"/><path d="${TAIL_RAYS}" fill="none" stroke="${ASAGI}" stroke-width="1.5"/></g><g id="dg"><path d="${D1}"/><path d="${D1_RAY}" fill="none" stroke="${ASAGI}" stroke-width="1.5"/></g>
<path id="d2" d="${D2}"/><path id="pc" d="${PEC}"/><path id="cu" d="${CURL}"/><g id="fc">${FACE}</g>`;

/** One frame k of FRAMES (k = FRAMES is the same pose as k = 0: the cycle is seamless). Returns the <defs> part and the nested <svg> tile. */
export function bonitoFrame(k) {
  const ph = k / FRAMES + PH0;
  const tl = `translate(${PED_X} ${num(YC + wave(PED_X, ph))}) rotate(${num(TAIL_GAIN * slopeDeg(PED_X, ph))})`;
  const d1 = `translate(0 ${num(wave(118, ph))}) rotate(${num(slopeDeg(118, ph) + 2.4 * Math.sin(TAU * (ph - 0.1)))} 118 ${YC - 21})`;
  const d2 = `translate(0 ${num(wave(86, ph))}) rotate(${num(slopeDeg(86, ph) + 3.2 * Math.sin(TAU * (ph - 0.28)))} 86 ${YC - 19})`;
  const pc = `rotate(${num(6.5 * Math.sin(TAU * (ph - 0.05)))} 146 ${YC + 8})`;
  const defs = `<path id="b${k}" d="${bodyD(ph)}"/><clipPath id="c${k}"><use href="#b${k}"/></clipPath><g id="s${k}"><use href="#tg" transform="${tl}"/><use href="#dg" transform="${d1}"/><use href="#d2" transform="${d2}"/></g><path id="n${k}" d="${finletsD(ph)}"/>`;
  // the splash breathes: the bow curl rises and settles, the banks swell and shrink out of step
  const cu = `translate(155 ${WATER + 1.4}) scale(${num(breathe(ph, 0.1, 0.06))} ${num(breathe(ph, 0.1, 0.16))})`;
  const banks =
    bank(5, WATER + 2.2, [7, 9.5, 8, 7], [2.6 * breathe(ph, 0.0, .22), 3.6 * breathe(ph, .25, .22), 3.2 * breathe(ph, .5, .22), 2.4 * breathe(ph, .75, .22)], 2.2) +
    bank(62, WATER + 1.6, [10, 12, 11, 13, 10, 11, 10, 9], [3 * breathe(ph, .1, .2), 4.2 * breathe(ph, .35, .2), 3.4 * breathe(ph, .6, .2), 4.4 * breathe(ph, .85, .2), 3.2 * breathe(ph, .2, .2), 3.6 * breathe(ph, .45, .2), 3.4 * breathe(ph, .7, .2), 3 * breathe(ph, .95, .2)], 2.4);
  const fish = `<g stroke-linejoin="round" stroke-linecap="round"><g clip-path="url(#w)">
<g opacity=".7" fill="${KINARI}" stroke="${KINARI}"><use href="#s${k}" stroke-width="7.6"/><use href="#b${k}" stroke-width="5.2"/></g>
<use href="#s${k}" fill="${KON}" stroke="${KON}" stroke-width="4.4"/>
<use href="#n${k}" fill="${KON}" stroke="${KON}" stroke-width="3"/><use href="#n${k}" fill="${YAMABUKI}" stroke="${YAMABUKI}" stroke-width="1.2"/>
<use href="#b${k}" fill="${KINARI}"/>
<g clip-path="url(#c${k})"><path d="${backD(ph)}" fill="${AI}"/><path d="${glintD(ph)}" fill="${WASURE}"/><path d="${stripesD(ph)}" fill="none" stroke="${KON}" stroke-width="2.5"/></g>
<use href="#b${k}" fill="none" stroke="${KON}" stroke-width="2"/>
<use href="#pc" transform="${pc}" fill="${ASAGI}" stroke="${KON}" stroke-width="1.8"/>
<use href="#fc"/></g>
<g fill="${KINARI}" stroke="${ASAGI}" stroke-width="1.3"><path d="${banks}"/><use href="#cu" transform="${cu}"/></g>${dropsSvg(ph)}</g>`;
  return { defs, svg: `<svg x="${k * FRAME_W}" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">${fish}</svg>` };
}

export function bonitoStripSvg() {
  const fr = Array.from({ length: FRAMES }, (_, k) => bonitoFrame(k));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAMES * FRAME_W} ${FRAME_H}" width="${FRAMES * FRAME_W}" height="${FRAME_H}">${COMMON_DEFS}${fr.map((f) => f.defs).join('')}</defs>\n${fr.map((f) => f.svg).join('\n')}\n</svg>\n`;
}

/** The review sheet: the six frames at 3x on the waterline, then the cycle at real size (84, then 64 and 96 px tall) over the 藍 sea with the 浅葱 crest line, the 勿忘草 day sky and the 紺 night sky. */
export function previewHtml(svg) {
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const scene = (sky, h, gap) => {
    const sc = h / FRAME_H, w = FRAME_W * sc, y = WATER * sc;
    const cells = Array.from({ length: FRAMES }, (_, k) => `<div style="flex:none;width:${w}px;height:${h}px;background:var(--s) -${k * w}px 0/${FRAMES * w}px ${h}px"></div>`).join('');
    return `<div style="position:relative;display:flex;gap:${gap}px;width:max-content;padding:6px ${gap}px ${Math.round(h * 0.24)}px;background:linear-gradient(${sky} 0 ${y + 6}px,${AI} ${y + 6}px)"><div style="position:absolute;left:0;right:0;top:${y + 6 - 1.5}px;height:3px;background:${ASAGI}"></div>${cells}</div>`;
  };
  const big = Array.from({ length: FRAMES }, (_, k) => `<div style="position:relative;width:${FRAME_W * 3}px;height:${FRAME_H * 3}px;background:linear-gradient(${WASURE} 0 ${WATER * 3}px,${AI} ${WATER * 3}px)"><div style="position:absolute;left:0;right:0;top:${WATER * 3 - 2}px;height:4px;background:${ASAGI}"></div><div style="position:absolute;inset:0;background:var(--s) -${k * FRAME_W * 3}px 0/${FRAMES * FRAME_W * 3}px ${FRAME_H * 3}px"></div><span style="position:absolute;left:6px;top:4px;font:12px monospace;color:${KON}">${k}</span></div>`).join('');
  const label = (t) => `<div style="font:12px/1.4 monospace;color:#ddd;margin:14px 0 4px">${t}</div>`;
  return `<!doctype html><meta charset=utf-8><body style="margin:0;padding:10px;background:#2b2b2e;--s:url(${uri});width:${FRAME_W * 3 * 3 + 40}px">
${label('frames 0-5 at 3x (waterline y=78 = the 浅葱 crest line)')}<div style="display:grid;grid-template-columns:repeat(3,${FRAME_W * 3}px);gap:8px">${big}</div>
${label('cycle at real size, 84 px tall: day sky 勿忘草 over the 藍 sea')}${scene(WASURE, 84, 8)}
${label('cycle at real size, 84 px tall: night sky 紺 over the 藍 sea')}${scene(KON, 84, 8)}
${label('64 px (the smallest) and 96 px (the largest), day then night')}<div style="display:flex;gap:10px;flex-wrap:wrap">${scene(WASURE, 64, 4)}${scene(KON, 64, 4)}</div><div style="height:6px"></div><div style="display:flex;gap:10px;flex-wrap:wrap">${scene(WASURE, 96, 4)}${scene(KON, 96, 4)}</div></body>`;
}

if (import.meta.main) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const out = resolve(arg('out', 'src/anime/assets/runner/bonito-run.svg'));
  const svg = bonitoStripSvg();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, svg);
  console.error(`${out}: ${FRAMES} frames of ${FRAME_W}x${FRAME_H}, ${Buffer.byteLength(svg)} bytes`);
  const pv = arg('preview', null);
  if (pv) { mkdirSync(dirname(resolve(pv)), { recursive: true }); writeFileSync(pv, previewHtml(svg)); }
}
