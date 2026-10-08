// [v4:data] Fold data/anime/enrich.json into the layout (called by scripts/anime/build-layout.js). Pure (tested).
// Precedence for every lot value, and the source recorded in lot.src:
//   height / storeys: OSM height > OSM building:levels > derived (GSI code, area, zone: scripts/anime/derive.js)
//   kind:             OSM tags (building, amenity, shop, religion; or a shop/amenity node inside) > GSI facility > derived
//   roof shape:       OSM roof:shape > aerial class (scripts/anime/enrich/aerial.js) > derived
//   roof colour:      OSM roof:colour > aerial median (through the GSI -> Earth 2026 transform fitted on the override lots,
//                     [v5:fix2]; the white balance without overrides) > derived palette
//   ridge:            aerial ridge direction, when the aerial or OSM shape is pitched
//   wall colour:      OSM building:colour > derived pastel
//   name:             OSM building name > named OSM POI inside > GSI Anno facility name
import { SegHash, alongPolyline, polylineLength, segDist, raySeg, rgbToHsv, hash32 } from "../derive.js";

const r1 = (v) => Math.round(v * 10) / 10;
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Names the app must not show: the V3-SPEC section 5 exclusion list (the app shows a living, hopeful town). Some of its words are written as escapes so that this file does not spell the event out. */
export const SENSITIVE = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難|防潮堤|伝承館|遺構|memorial|disaster/i;
export const showable = (name) => !!name && !SENSITIVE.test(name);

/** enrich.json lots (fields + rows) -> Map(id -> object) */
export function lotTable(E) {
  const F = E.lots.fields, m = new Map();
  for (const r of E.lots.rows) { const o = {}; F.forEach((k, i) => { if (r[i] != null) o[k] = r[i]; }); m.set(o.id, o); }
  return m;
}

/** Global white balance of the aerial roof colours: the photo has a cyan cast. Gains that make the median roof grey. */
export function roofWhiteBalance(table) {
  const R = [], G = [], B = [];
  for (const e of table.values()) if (e.rgb) { const c = rgbOf(e.rgb); R.push(c[0]); G.push(c[1]); B.push(c[2]); }
  if (!R.length) return [1, 1, 1];
  const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
  const m = [med(R), med(G), med(B)], g = (m[0] + m[1] + m[2]) / 3;
  // only half of the correction: the median roof in Kesennuma is a bluish-grey metal roof, not neutral
  return m.map((v) => Math.round((1 + (g / v - 1) * 0.5) * 1000) / 1000);
}
/** [v5:fix2] The GSI photo -> Google Earth 2026-03-11 colour transform: a 3x3 matrix plus offset (sRGB 0..255) fitted by
 *  least squares from each override lot's GSI roof colour (enrich `rgb`) to its Earth override colour (`roof.color` of
 *  data/anime/overrides). One refit drops the pairs whose residual is over 2.5 robust sigmas (a roof re-clad since the
 *  GSI photo). `pairs` = [[gsiHex, earthHex], ...]. -> { m: [[r,g,b,1] coefficients per output channel], k, n, dropped, rms } */
export function fitRoofTransform(pairs, k = 1.3) {
  const P = pairs.map(([a, b]) => [rgbOf(a), rgbOf(b)]);
  const solve = (rows) => {
    const W = [];
    for (let c = 0; c < 3; c++) {
      const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], y = [0, 0, 0, 0];
      for (const [x, t] of rows) { const v = [x[0], x[1], x[2], 255]; for (let i = 0; i < 4; i++) { y[i] += v[i] * t[c]; for (let j = 0; j < 4; j++) A[i][j] += v[i] * v[j]; } }
      // a whisper of ridge toward identity keeps the solve stable for a narrow colour range
      const lam = 1e-3 * rows.length * 255 * 255; for (let i = 0; i < 3; i++) { A[i][i] += lam; y[i] += lam * (i === c ? 1 : 0); }
      // Gauss-Jordan
      const M = A.map((r, i) => [...r, y[i]]);
      for (let i = 0; i < 4; i++) { let p = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; } }
      W.push(M.map((r, i) => r[4] / r[i]));
    }
    return W;
  };
  const apply = (W, x) => W.map((w) => w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3] * 255);
  const res = (W, [x, t]) => Math.hypot(...apply(W, x).map((v, i) => v - t[i]));
  let W = solve(P);
  const r0 = P.map((p) => res(W, p)), med = [...r0].sort((a, b) => a - b)[r0.length >> 1] || 0, cut = 2.5 * 1.4826 * med + 1;
  const keep = P.filter((p, i) => r0[i] <= cut);
  if (keep.length >= 12) W = solve(keep);
  const rms = Math.sqrt(keep.reduce((s, p) => s + res(W, p) ** 2, 0) / Math.max(1, keep.length));
  // least squares pulls every roof toward the mean (L* spread 9.4 vs Earth's 16.0 on the override lots): spread the
  // output by `k` round its mean (k 1.3: median ΔE2000 10.4 -> 10.1, L* spread 12.3; the v4 grade scored 13.3)
  const mu = [0, 1, 2].map((c) => keep.reduce((s, [x]) => s + apply(W, x)[c], 0) / Math.max(1, keep.length));
  const Wk = W.map((w, c) => [w[0] * k, w[1] * k, w[2] * k, w[3] * k + (1 - k) * mu[c] / 255]);
  return { m: Wk.map((w) => w.map((v) => Math.round(v * 1e4) / 1e4)), k, n: keep.length, dropped: P.length - keep.length, rms: Math.round(rms * 10) / 10 };
}
// ------------------------------------------------------------------ [r2:13] the GSI -> paint colour transform, fitted on Earth lot medians
// The v5:fix2 transform above was fitted on the roof colours typed into the override files: eyeballed, partly lifted (c3, c7), partly shifted from
// the GSI colour itself (c9, circular), and a weak model (residual rms 56/255, L* correlation GSI vs Earth 0.56; on c2 worse than painting every roof one constant
// Earth-median colour). It is refitted here on per-lot Earth readings (data/anime/earth-roofs.json, tools/anime/earth-roofs.mjs: derived colour values, no imagery)
// in CIE L*a*b* with the roof shape as a feature, and scored held out (leave-one-area-out) in test/sys-round2.test.js: median dE2000 <= 8.5, |median dL| <= 3
// (the finding's gate; 'median dE < 7' is out of reach of any GSI-to-Earth map tried: the Earth reading and the 2020-22 photo differ by re-roofing, shadow and grading).
//
// The stored roof colour is the PAINT colour: what the renderer needs to land on the Earth colour. A flat roof renders about as painted (the renderer's +3.7 L* on flat tops
// is taken out in town/flatroof.js), a pitched one about 3 L* darker than painted (the slope is lit at an angle), a shed 0.5 L* darker. So the paint is the Earth reading
// plus RENDER_DL[class] in L*; override colours were already tuned against the render and are not shifted.
export const RENDER_DL = { flat: 0, shed: 0.5, pitched: 3 };
export const shapeClass = (shape) => (shape === "flat" ? "flat" : shape === "shed" || shape === "saw" ? "shed" : "pitched");
const srgbLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const linSrgb = (c) => { c = Math.max(0, Math.min(1, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); };
/** sRGB 0..255 [r, g, b] -> CIE L*a*b* (D65) */
export function rgbToLab([r, g, b]) {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
/** CIE L*a*b* (D65) -> sRGB 0..255 [r, g, b] (unrounded, clamped) */
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * f(fx), Y = f(fy), Z = 1.08883 * f(fz);
  return [linSrgb(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z), linSrgb(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z), linSrgb(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)];
}
/** shift a colour's lightness by dL (CIE L*) and keep its chroma: '#rrggbb' -> '#rrggbb' */
export function shiftL(h, dL) { const l = rgbToLab(rgbOf(h)); l[0] = Math.max(0, Math.min(100, l[0] + dL)); return hex(labToRgb(l)); }
const paintFeatures = (photoHex, shape) => { const l = rgbToLab(rgbOf(photoHex)), c = shapeClass(shape); return [l[0] / 100, l[1] / 50, l[2] / 50, c === "flat" ? 1 : 0, c === "shed" ? 1 : 0, 1]; };
/**
 * Fit the paint transform: ridge least squares in L*a*b* of the paint colour on [L, a, b, flat, shed, 1] of the GSI colour, one refit without the samples whose residual is over 2.5 robust
 * sigmas (a roof re-clad since the photo). samples = [{ gsi: '#rrggbb', target: '#rrggbb', shape }]. -> { type: 'lab', W: [6][3], n, dropped, rms (dE76) }
 */
export function fitPaintTransform(samples, lam = 1e-4, k = 1.2) {
  const X = samples.map((s) => paintFeatures(s.gsi, s.shape)), Y = samples.map((s) => { const l = rgbToLab(rgbOf(s.target)); return [l[0] / 100, l[1] / 50, l[2] / 50]; });
  const solve = (idx) => {
    const p = 6, A = Array.from({ length: p }, () => new Array(p).fill(0)), B = Array.from({ length: p }, () => [0, 0, 0]);
    for (const i of idx) for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += X[i][a] * X[i][b]; for (let c = 0; c < 3; c++) B[a][c] += X[i][a] * Y[i][c]; }
    for (let a = 0; a < p - 1; a++) A[a][a] += lam * idx.length;
    const M = A.map((r, i) => [...r, ...B[i]]);
    for (let i = 0; i < p; i++) { let q = i; for (let k = i + 1; k < p; k++) if (Math.abs(M[k][i]) > Math.abs(M[q][i])) q = k; [M[i], M[q]] = [M[q], M[i]]; for (let k = 0; k < p; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < p + 3; j++) M[k][j] -= f * M[i][j]; } }
    return M.map((r, i) => r.slice(p).map((v) => v / r[i]));
  };
  const pred = (W, x) => [0, 1, 2].map((c) => x.reduce((s, v, i) => s + v * W[i][c], 0));
  const res = (W, i) => { const o = pred(W, X[i]), t = Y[i]; return Math.hypot((o[0] - t[0]) * 100, (o[1] - t[1]) * 50, (o[2] - t[2]) * 50); };
  let idx = samples.map((_, i) => i), W = solve(idx);
  const r0 = idx.map((i) => res(W, i)), med = [...r0].sort((a, b) => a - b)[r0.length >> 1] || 0, cut = 2.5 * 1.4826 * med + 1;
  const keep = idx.filter((i, k) => r0[k] <= cut);
  if (keep.length >= 24) { idx = keep; W = solve(idx); }
  const rms = Math.sqrt(idx.reduce((s, i) => s + res(W, i) ** 2, 0) / Math.max(1, idx.length));
  // least squares pulls every roof toward the mean (regression dilution: the GSI colour is a noisy predictor): spread the output by k round its mean, as fitRoofTransform does
  const mu = [0, 1, 2].map((c) => idx.reduce((s, i) => s + pred(W, X[i])[c], 0) / Math.max(1, idx.length));
  const T = { type: "lab", W: W.map((r) => r.map((v) => Math.round(v * 1e5) / 1e5)), k, mu: mu.map((v) => Math.round(v * 1e5) / 1e5), n: idx.length, dropped: samples.length - idx.length, rms: Math.round(rms * 10) / 10 };
  // the spread moves each shape class off its target (flat roofs sit above the mean, pitched below): centre every class on its training median (L*, in units of 1 / 100)
  const dL = {};
  for (const c of ["flat", "shed", "pitched"]) {
    const r = idx.filter((i) => shapeClass(samples[i].shape) === c).map((i) => Y[i][0] - paintRaw(T, X[i])[0]).sort((a, b) => a - b);
    dL[c] = r.length >= 20 ? Math.round(r[r.length >> 1] * 1e5) / 1e5 : 0;
  }
  T.dL = dL;
  return T;
}
/** the transform's L*a*b* output (units L / 100, a / 50, b / 50) for a feature vector, before the per-class centring */
const paintRaw = (T, x) => { const k = T.k ?? 1; return [0, 1, 2].map((c) => { const v = x.reduce((s, w, i) => s + w * T.W[i][c], 0); return (T.mu?.[c] ?? 0) + k * (v - (T.mu?.[c] ?? 0)); }); };
/** the paint colour of a photo colour under a fitted paint transform, quantised like gradeRoof ('#rrggbb') */
export function paintOf(photoHex, T, shape) {
  const x = paintFeatures(photoHex, shape), o = paintRaw(T, x);
  o[0] += T.dL?.[shapeClass(shape)] ?? 0;
  const rgb = labToRgb([o[0] * 100, o[1] * 50, o[2] * 50]);
  return hex(rgb.map((v) => Math.max(0, Math.min(252, Math.round(v / 4) * 4))));
}

/** Photo roof colour -> the rendered roof colour. [v5:fix2] `t` is the fitted GSI -> Earth transform (fitRoofTransform);
 *  an array is the legacy per-channel white balance. No anime lift or saturation boost any more: the v4 grade (+0.06 value,
 *  saturation x1.18) on top of a white balance that kept the photo's cyan cast made the roofs too light and teal
 *  (c6: app L* 63.9 vs Earth 51.8; 59 teal roofs vs 4). Quantised to 4-level steps (keeps the far-lot colour table small). */
export function gradeRoof(photoHex, t = [1, 1, 1], shape = null) {
  if (t && t.type === "lab") return paintOf(photoHex, t, shape);   // [r2:13] the Lab paint transform (fitPaintTransform)
  const x = rgbOf(photoHex);
  const c = Array.isArray(t) ? x.map((v, i) => v * t[i]) : t.m.map((w) => w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3] * 255);
  return hex(c.map((v) => Math.max(0, Math.min(252, Math.round(v / 4) * 4))));
}

/** Storey height by kind (m), for OSM building:levels. */
export const STOREY = { house: 2.9, shop: 3.0, apartment: 2.9, office: 3.3, hotel: 3.1, public: 3.5, school: 3.6, temple: 5.5, shrine: 4.5, warehouse: 4.5, carpark: 2.8, factory: 4.5, landmark: 3.5 };
/** Ridge direction (radians in x-z) relative to a lot frame: 'x' = along the frontage (local x), 'z' = front to back. */
export function ridgeAxis(ridge, rotY) {
  const lx = Math.cos(rotY), lz = -Math.sin(rotY);   // local +x in world (three.js rotation.y)
  return Math.abs(Math.cos(ridge) * lx + Math.sin(ridge) * lz) >= Math.SQRT1_2 ? "x" : "z";
}

/**
 * Enrichment for one lot. e: the lot's enrich row object (or undefined). base: the derived values
 * { kind, storeys, height, roofShape, roofColor, wall, rotY, landmark }. -> the final values + src + labels.
 */
export function enrichLot(e, base, wb, classify) {
  const out = { kind: base.kind, storeys: base.storeys, height: base.height, roof: { shape: base.roofShape, color: base.roofColor }, wall: base.wall, src: { h: "derived", kind: "derived", roof: "derived", color: base.roofSrc || "derived" } };
  if (!e) return out;
  // kind (a landmark keeps its dedicated role). [v4:polish1] tourism=hotel on a block of 300 m² or more is a hotel
  // (a tall block of guest rooms), not a shop; smaller inns (旅館 in a house) stay shop-houses
  const eKind = e.use === "tourism:hotel" && (base.area ?? 0) >= 300 ? "hotel" : e.kind;
  if (eKind && !base.landmark && eKind !== base.kind) {
    const c = classify(eKind);
    out.kind = eKind; out.storeys = c.storeys; out.height = c.height; out.roof.shape = c.roofShape;
    if (eKind === "carpark" && base.wallFor) out.wall = base.wallFor(eKind);   // [v6:c6r3] the exposed concrete of an open deck, not the wall derived for the footprint's old 'warehouse' guess (#9fb3c4)
    out.src.kind = e.use || e.osm ? "osm" : "gsi";
  } else if (eKind && !base.landmark) out.src.kind = e.use || e.osm ? "osm" : "gsi";
  // height
  if (e.height) { out.height = r1(e.height); out.storeys = Math.max(1, Math.floor(e.height / (STOREY[out.kind] || 3) + 0.25)); out.src.h = "osm"; }   // [sys:29] floor(h / storey + 0.25): a 4.8 m store is 1 storey
  else if (e.levels) {
    out.storeys = Math.max(1, Math.round(e.levels));
    const tall = (out.kind === "warehouse" || out.kind === "factory") && !(base.wallless && out.kind === base.kind);   // [r2:4] a wall-less shed is not raised to 5.5 m
    out.height = r1(tall && out.storeys === 1 ? Math.max(out.height, 5.5) : out.storeys * (STOREY[out.kind] || 3) + (out.kind === "shop" ? 0.3 : 0));
    out.src.h = "osm";
  }
  // roof shape
  if (e.roofShape) { out.roof.shape = e.roofShape; out.src.roof = "osm"; }
  else if (e.aShape && !base.landmark) { out.roof.shape = e.aShape; out.src.roof = "aerial"; out.roof.conf = e.aConf; }
  if (e.ridge != null && (out.roof.shape === "gable" || out.roof.shape === "hip" || out.roof.shape === "saw") && (out.src.roof !== "derived")) out.roof.ridge = ridgeAxis(e.ridge, base.rotY);
  // roof colour
  if (e.roofColour) { out.roof.color = e.roofColour; out.src.color = "osm"; }
  // [sys:32] keepAerialColour: a landmark lot whose tag has no roof colour (a school) takes the aerial colour too
  else if (e.rgb && (!base.landmark || base.keepAerialColour) && !(e.veg > 0.5)) { out.roof.color = gradeRoof(e.rgb, wb, out.roof.shape); out.roof.photo = e.rgb; out.src.color = "aerial"; }
  if (e.wallColour) { out.wall = e.wallColour; out.src.wall = "osm"; }
  // names and use
  // [v4:polish1] a GSI facility name (気仙沼駅) wins over a shop or café POI matched inside the footprint (NewDays)
  const poiName = /^(shop|amenity):/.test(e.use || "") && showable(e.gsiName) && e.gsiCat;
  // [v5] an open-space POI (a park's name node, ドラゴンパーク) names the open ground, not the shed that stands in it
  const openSpace = /^leisure:(park|garden|pitch|nature_reserve|dog_park|common|track|playground)$/.test(e.use || "");
  const name = (poiName ? [e.gsiName, e.name] : openSpace ? [e.gsiName] : [e.name, e.gsiName]).find(showable);
  if (name) { out.name = name; out.src.name = name === e.name ? "osm" : "gsi"; }
  if (name && name === e.name && showable(e.nameEn)) out.nameEn = e.nameEn;
  if (e.use && !openSpace) out.use = e.use;
  if (e.gsiCat) out.facility = e.gsiCat;
  if (e.osm) out.osm = e.osm;
  return out;
}

// ------------------------------------------------------------------ roads: names and attributes from OSM
/** Give each layout road the OSM way that runs along it (within 9 m, parallel): name, ref, lanes, oneway, maxspeed. */
export function nameRoads(ROADS, osmRoads) {
  const H = new SegHash(24);
  for (const w of osmRoads) for (let i = 1; i < w.pts.length; i++) H.add(w.pts[i - 1], w.pts[i], w);
  let named = 0, matched = 0;
  for (const r of ROADS) {
    const L = polylineLength(r.pts);
    const votes = new Map();
    const n = Math.max(1, Math.min(7, Math.round(L / 25)));
    for (let k = 0; k < n; k++) {
      const { p, t } = alongPolyline(r.pts, (L * (k + 0.5)) / n);
      let best = null;
      for (const s of H.near(p[0], p[1], 10)) {
        const q = segDist(p[0], p[1], s.a, s.b); if (q.d > 9) continue;
        const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l = Math.hypot(dx, dz) || 1;
        if (Math.abs((dx * t[0] + dz * t[1]) / l) < 0.85) continue;
        if (!best || q.d < best.d) best = { d: q.d, w: s.data };
      }
      if (best) votes.set(best.w, (votes.get(best.w) || 0) + 1);
    }
    let w = null, v = 0; for (const [k, c] of votes) if (c > v || (c === v && k.osm < w.osm)) { w = k; v = c; }
    if (!w || v < Math.max(1, n * 0.5)) continue;
    matched++;
    r.hw = w.hw;
    if (showable(w.name)) { r.name = w.name; named++; }
    if (showable(w.nameEn)) r.nameEn = w.nameEn;
    for (const k of ["ref", "lanes", "oneway", "maxspeed", "tunnel"]) if (w[k] != null) r[k] = w[k];
    // [v4:polish3] the carriageway from OSM where tagged: the way's width, else lanes x 3.0 m (the GSI edges measure the
    // whole road reserve with its pavements; town/streets.js draws the rest as pavement)
    const cw = w.width > 1.5 && w.width < 40 ? w.width : w.lanes > 0 ? w.lanes * 3.0 : null;
    if (cw) r.carriage = Math.round(Math.min(r.width, Math.max(3, cw)) * 10) / 10;
    if (typeof w.bridge === "string" && w.bridge !== "yes" && showable(w.bridge)) r.bridgeName = w.bridge;
  }
  return { matched, named };
}

// ------------------------------------------------------------------ rivers: OSM names + widths from GSI water areas
/** Median river width (m) along a centre-line from the GSI inland-water polygon edges (WA 5200), or null. */
export function riverWidth(pts, edges, step = 15, lo = 1.5, hi = 150) {
  const L = polylineLength(pts), ws = [];
  for (let s = step / 2; s < L; s += step) {
    const { p, t } = alongPolyline(pts, s);
    const n = [-t[1], t[0]];
    let a = Infinity, b = Infinity;
    for (const e of edges.near(p[0], p[1], hi / 2 + 2)) {
      const ta = raySeg(p, n, e.a, e.b); if (ta !== null && ta > 0.2 && ta < a) a = ta;
      const tb = raySeg(p, [-n[0], -n[1]], e.a, e.b); if (tb !== null && tb > 0.2 && tb < b) b = tb;
    }
    if (a === Infinity || b === Infinity) continue;
    const w = a + b; if (w >= lo && w <= hi && Math.abs(a - b) < Math.max(3, w * 0.6)) ws.push(w);
  }
  if (ws.length < 2) return null;
  ws.sort((x, y) => x - y);
  return r1(ws[ws.length >> 1]);
}
/** Inland water edges (WA 5200) without the artificial z16 tile-clip edges. */
export function waterEdges(WA, tileEdge) {
  const H = new SegHash(32);
  for (const f of WA) {
    if (f.code !== 5200) continue;
    for (const ring of [f.outer, ...f.holes]) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (tileEdge && tileEdge(a, b)) continue;
      H.add(a, b, null);
    }
  }
  return H;
}

/** Stable, compact ids for places (search / labels): 'p' + hash of name and rounded position. */
export const placeId = (name, p) => "p" + (hash32(name + "|" + Math.round(p[0]) + "," + Math.round(p[1])) >>> 0).toString(36);

// ------------------------------------------------------------------ [v4:overrides] per-cell reference overrides
// The last fold step: data/anime/overrides/*.json (docs/anime/OVERRIDES.md), applied by build-layout.js after the
// enrichment and LOT_FIX, and by build-explore.js to the far-core streets. Implementation: ./overrides.js.
export { loadOverrides, compileOverrides, validateOverride, overrideFeatures, patchLot, unusedLotPatches, applyRoadOverrides, applyLanduseOverrides, propPlacements, crossingOverrides, EMPTY as NO_OVERRIDES } from "./overrides.js";
export const OVERRIDES_DIR = new URL("../../../data/anime/overrides/", import.meta.url).pathname.replace(/\/$/, "");
