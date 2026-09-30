// [v4:data] Aerial-photo analysis per building footprint (GSI 全国最新写真（シームレス）, cached in raw/tiles).
// For every footprint it measures, from the photo alone:
//   - the registration offset of the roof against the footprint (the photo is not a true ortho: roofs lean away from
//     the camera nadir, up to ~3 m for a 3-storey building), found by maximising the edge strength along the outline;
//   - the roof colour (median of the facets, so the sun side and the shade side are averaged);
//   - the roof shape class: gable (and the ridge axis), hip, flat, saw-tooth, or uniform (a single plane: flat or shed);
//   - rooftop equipment on flat roofs (small blobs that differ from the roof membrane);
//   - vegetation cover (a footprint that shows trees or grass is a demolished or overgrown building);
//   - the shadow length toward the anti-sun direction (see shadow.js; it turns into a measured height).
// The analysis takes a `sampler` ({ rgb(x, z) -> [r, g, b] | null, px }) so tests can feed synthetic roofs.
import sharp from "sharp";
import { minAreaRect } from "../derive.js";
import { tilePath } from "../../terrain/tiles.js";

// ------------------------------------------------------------------ raster over cached XYZ tiles
const LAT0 = 38.906, LON0 = 141.575, MX = 86744.0, MZ = 111014.0;
/** Nearest-pixel sampler over GSI seamlessphoto tiles at zoom z (decoded lazily, LRU of `cap` tiles). */
export class TileRaster {
  constructor(z, { dataset = "seamlessphoto", cap = 900 } = {}) {
    this.z = z; this.dataset = dataset; this.cap = cap; this.n = 2 ** z; this.cache = new Map(); this.missing = new Set();
    this.px = (360 / (256 * this.n)) * MX;   // ground metres per pixel (east-west)
    this.pending = new Map();
  }
  /** global pixel coordinates of ENU (x, z) */
  gp(x, z) {
    const lon = LON0 + x / MX, lat = LAT0 - z / MZ;
    const gx = ((lon + 180) / 360) * this.n * 256;
    const s = Math.sin((lat * Math.PI) / 180);
    const gy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * this.n * 256;
    return [gx, gy];
  }
  /** Decode every tile touching the ENU box (call before sampling a region; sampling itself is synchronous). */
  async prepare(x0, z0, x1, z1) {
    const [a, b] = [this.gp(x0, z0), this.gp(x1, z1)];
    const tx0 = Math.floor(Math.min(a[0], b[0]) / 256), tx1 = Math.floor(Math.max(a[0], b[0]) / 256);
    const ty0 = Math.floor(Math.min(a[1], b[1]) / 256), ty1 = Math.floor(Math.max(a[1], b[1]) / 256);
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      const k = tx * 1e6 + ty;
      if (this.cache.has(k) || this.missing.has(k)) { if (this.cache.has(k)) { const v = this.cache.get(k); this.cache.delete(k); this.cache.set(k, v); } continue; }
      jobs.push(this.load(tx, ty, k));
    }
    await Promise.all(jobs);
    while (this.cache.size > this.cap) this.cache.delete(this.cache.keys().next().value);
  }
  async load(tx, ty, k) {
    const f = Bun.file(tilePath(this.dataset, this.z, tx, ty));
    if (!(await f.exists()) || f.size === 0) { this.missing.add(k); return; }
    const { data, info } = await sharp(new Uint8Array(await f.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 256 || info.height !== 256) { this.missing.add(k); return; }
    this.cache.set(k, data);
  }
  /** [r, g, b] at ENU (x, z) (nearest pixel), or null outside the cached tiles. */
  rgb(x, z) {
    const [gx, gy] = this.gp(x, z);
    const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
    const t = this.cache.get(tx * 1e6 + ty);
    if (!t) return null;
    const i = ((Math.floor(gy) - ty * 256) * 256 + (Math.floor(gx) - tx * 256)) * 3;
    return [t[i], t[i + 1], t[i + 2]];
  }
  lum(x, z) { const c = this.rgb(x, z); return c ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : NaN; }
}

// ------------------------------------------------------------------ polygon helpers
function pip(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function edgeDist(x, z, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    const ex = a[0] + t * dx - x, ez = a[1] + t * dz - z, e = ex * ex + ez * ez;
    if (e < d) d = e;
  }
  return Math.sqrt(d);
}
/** Points every `step` m along the outline with their outward unit normals. */
export function outlinePoints(ring, step = 1) {
  let s2 = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; s2 += p[0] * q[1] - q[0] * p[1]; }
  const ccw = s2 > 0;   // in (x, z) coordinates
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.3) continue;
    // outward normal: for a ring counter-clockwise in (x, z) the outside is on the right of the edge direction
    const nx = ccw ? dz / L : -dz / L, nz = ccw ? -dx / L : dx / L;
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (dx * (k + 0.5)) / n, a[1] + (dz * (k + 0.5)) / n, nx, nz]);
  }
  return out;
}

// ------------------------------------------------------------------ registration
/** Edge score of the outline shifted by (ox, oz): mean |L(outside) - L(inside)| across the outline (0.7 m apart). */
function edgeScore(S, pts, ox, oz, h = 0.7) {
  let s = 0, n = 0;
  for (const [x, z, nx, nz] of pts) {
    const a = S.lum(x + ox + nx * h, z + oz + nz * h), b = S.lum(x + ox - nx * h, z + oz - nz * h);
    if (a === a && b === b) { s += Math.abs(a - b); n++; }
  }
  return n ? s / n : 0;
}
/** Best roof offset within +-maxOff m: coarse 1 m grid, then a 0.5 m refinement. -> { ox, oz, score, score0, gain } */
export function registerOutline(S, ring, maxOff = 3) {
  const per = ring.reduce((L, p, i) => L + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0);
  const pts = outlinePoints(ring, Math.max(0.8, per / 90));
  const score0 = edgeScore(S, pts, 0, 0);
  let best = { ox: 0, oz: 0, score: score0 };
  for (let ox = -maxOff; ox <= maxOff; ox += 1) for (let oz = -maxOff; oz <= maxOff; oz += 1) {
    if (!ox && !oz) continue;
    const s = edgeScore(S, pts, ox, oz); if (s > best.score) best = { ox, oz, score: s };
  }
  const c = best;
  for (let ox = c.ox - 0.5; ox <= c.ox + 0.5; ox += 0.5) for (let oz = c.oz - 0.5; oz <= c.oz + 0.5; oz += 0.5) {
    if (ox === c.ox && oz === c.oz) continue;
    const s = edgeScore(S, pts, ox, oz); if (s > best.score) best = { ox, oz, score: s };
  }
  return { ...best, score0, gain: score0 > 0 ? best.score / score0 : 1 };
}

// ------------------------------------------------------------------ roof analysis
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function groupStats(vals, keys, k) {
  const sum = new Float64Array(k), sum2 = new Float64Array(k), cnt = new Float64Array(k);
  for (let i = 0; i < vals.length; i++) { const g = keys[i]; if (g < 0) continue; sum[g] += vals[i]; sum2[g] += vals[i] * vals[i]; cnt[g]++; }
  let sse = 0, tot = 0; const mean = [];
  // (max 0: sum2 - sum^2/n can round to a tiny negative number on a perfectly even roof)
  for (let g = 0; g < k; g++) { mean.push(cnt[g] ? sum[g] / cnt[g] : NaN); if (cnt[g]) sse += Math.max(0, sum2[g] - (sum[g] * sum[g]) / cnt[g]); tot += cnt[g]; }
  return { sse, mean, cnt: Array.from(cnt), n: tot };
}
/** Periodicity of a 1-D profile: the best normalised autocorrelation for lags in [lo, hi] samples. */
export function periodicity(p, lo, hi) {
  const n = p.length; if (n < lo * 3) return { r: 0, lag: 0 };
  let m = 0; for (const v of p) m += v; m /= n;
  let v0 = 0; for (const v of p) v0 += (v - m) * (v - m);
  if (v0 < 1e-6) return { r: 0, lag: 0 };
  let best = { r: 0, lag: 0 };
  for (let lag = lo; lag <= Math.min(hi, Math.floor(n / 3)); lag++) {
    let s = 0; for (let i = 0; i + lag < n; i++) s += (p[i] - m) * (p[i + lag] - m);
    const r = (s / v0) * (n / (n - lag));
    if (r > best.r) best = { r, lag };
  }
  return best;
}

/**
 * Roof analysis of one footprint. ring: [[x,z],...] (ENU m). S: sampler ({ rgb, lum, px }).
 * -> { off: [ox, oz], reg (edge gain), rgb: '#rrggbb', lum, shape: 'gable'|'hip'|'flat'|'saw'|'uniform', conf (0..1),
 *      ridge: angle (rad, direction of the ridge in the x-z plane, [0, PI)) | null, contrast, equip (blob count), veg (0..1), n }
 */
export function analyzeRoof(ring, S, opts = {}) {
  const box = minAreaRect(ring);
  const long = box.hu >= box.hv;
  // u = the long axis of the OBB
  const ang = long ? box.ang : box.ang + Math.PI / 2;
  const hu = long ? box.hu : box.hv, hv = long ? box.hv : box.hu;
  const Ux = Math.cos(ang), Uz = Math.sin(ang), Vx = -Uz, Vz = Ux;
  const reg = opts.register === false ? { ox: 0, oz: 0, gain: 1 } : registerOutline(S, ring, opts.maxOff ?? 3);
  const ox = reg.ox, oz = reg.oz;
  const area = 4 * hu * hv;
  const step = Math.max(S.px, Math.sqrt(area / 5000));
  const erode = Math.max(0.5, Math.min(1.0, Math.min(hu, hv) * 0.18));
  const U = [], V = [], Lm = [], R = [], G = [], B = [];
  const nu = Math.floor(hu / step), nv = Math.floor(hv / step);
  const grid = new Int32Array((2 * nu + 1) * (2 * nv + 1)).fill(-1);
  for (let iu = -nu; iu <= nu; iu++) for (let iv = -nv; iv <= nv; iv++) {
    const u = iu * step, v = iv * step;
    const x = box.cx + u * Ux + v * Vx, z = box.cz + u * Uz + v * Vz;
    if (!pip(x, z, ring) || edgeDist(x, z, ring) < erode) continue;
    const c = S.rgb(x + ox, z + oz);
    if (!c) continue;
    grid[(iu + nu) * (2 * nv + 1) + (iv + nv)] = Lm.length;
    U.push(u); V.push(v); R.push(c[0]); G.push(c[1]); B.push(c[2]); Lm.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  }
  const n = Lm.length;
  const res = { off: [ox, oz], reg: Math.round(reg.gain * 100) / 100, n };
  if (n < 12) {
    // too small for a shape: the colour alone, from every pixel inside the outline (no erosion), at a half-pixel step
    const cs = [];
    const st = S.px / 2, mu = Math.ceil(hu / st), mv = Math.ceil(hv / st);
    for (let iu = -mu; iu <= mu; iu++) for (let iv = -mv; iv <= mv; iv++) {
      const x = box.cx + iu * st * Ux + iv * st * Vx, z = box.cz + iu * st * Uz + iv * st * Vz;
      if (!pip(x, z, ring)) continue;
      const c = S.rgb(x + ox, z + oz); if (c) cs.push(c);
    }
    if (cs.length < 3) return { ...res, shape: null, conf: 0, rgb: null, ridge: null };
    const col = [0, 1, 2].map((j) => median(cs.map((c) => c[j])));
    const vg = cs.filter((c) => { const t = c[0] + c[1] + c[2] + 1; return (2 * c[1] - c[0] - c[2]) / t > 0.1 && c[1] > c[0] + 6 && c[1] > c[2] + 6; }).length / cs.length;
    return { ...res, shape: null, conf: 0, ridge: null, rgb: hex(col), lum: Math.round(0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]), veg: Math.round(vg * 100) / 100, small: true };
  }

  // vegetation: excess green with texture
  let veg = 0;
  // (the photo has a cyan cast: grey roofs read g ~ b > r, so vegetation must beat both red and blue clearly)
  for (let i = 0; i < n; i++) { const s = R[i] + G[i] + B[i] + 1; if ((2 * G[i] - R[i] - B[i]) / s > 0.1 && G[i] > R[i] + 6 && G[i] > B[i] + 6) veg++; }
  res.veg = Math.round((veg / n) * 100) / 100;

  // facet models
  const all = groupStats(Lm, new Int8Array(n), 1);
  const sse0 = all.sse || 1e-9;
  const dead = Math.max(0.35, step * 0.6);
  const kGL = new Int8Array(n), kGS = new Int8Array(n), kH = new Int8Array(n);
  const inner = hu - hv;
  for (let i = 0; i < n; i++) {
    const u = U[i], v = V[i];
    kGL[i] = Math.abs(v) < dead ? -1 : v > 0 ? 1 : 0;
    kGS[i] = Math.abs(u) < dead ? -1 : u > 0 ? 1 : 0;
    // hip: end facets where |u| - (hu - hv) > |v| (the 45-degree hips); keep a dead band along the hips and the ridge
    const e = Math.abs(u) - inner - Math.abs(v);
    kH[i] = Math.abs(e) < dead || (Math.abs(v) < dead && e < 0) ? -1 : e > 0 ? (u > 0 ? 3 : 2) : v > 0 ? 1 : 0;
  }
  const gl = groupStats(Lm, kGL, 2), gs = groupStats(Lm, kGS, 2), hp = groupStats(Lm, kH, 4);
  // R^2 over the pixels each model keeps (dead bands excluded), relative to their own total variance
  const r2 = (g, keys) => { let s = 0, s2 = 0, c = 0; for (let i = 0; i < n; i++) if (keys[i] >= 0) { s += Lm[i]; s2 += Lm[i] * Lm[i]; c++; } const tot = Math.max(0, s2 - (s * s) / (c || 1)); return tot > 1e-6 ? 1 - g.sse / tot : 0; };
  const rGL = r2(gl, kGL), rGS = r2(gs, kGS), rH = r2(hp, kH);
  const cGL = Math.abs(gl.mean[1] - gl.mean[0]), cGS = Math.abs(gs.mean[1] - gs.mean[0]);
  const aspect = hu / Math.max(hv, 0.1);
  // ridge along the long axis (usual), or along the short one (rare; only when clearly better)
  // a ridge across the short axis only on near-square roofs (on a long roof a step across it is a shadow or two roofs)
  let ridgeLong = true, rG = rGL, cG = cGL;
  if (aspect < 1.3 && rGS > rGL * 1.35 && cGS > cGL) { ridgeLong = false; rG = rGS; cG = cGS; }
  // two facets of one roof: the shade side keeps >= 42 % of the sun side (white deck next to a black shadow is not a gable)
  const gm = ridgeLong ? gl.mean : gs.mean;
  const facetRatio = Math.min(gm[0], gm[1]) / Math.max(gm[0], gm[1], 1);
  // hip: end facets must differ from both side facets in a way the gable split cannot explain
  const hEnds = Math.abs(hp.mean[3] - hp.mean[2]);
  const hipGain = rH - Math.max(rGL, rGS);
  const std = Math.sqrt(sse0 / n);
  res.contrast = Math.round(Math.max(cGL, cGS));
  res.r2 = [Math.round(rGL * 100) / 100, Math.round(rGS * 100) / 100, Math.round(rH * 100) / 100];

  // colour: the mean of the facet medians (sun and shade sides averaged), or the plain median
  const med = (idx) => [median(idx.map((i) => R[i])), median(idx.map((i) => G[i])), median(idx.map((i) => B[i]))];
  const idxAll = [...Array(n).keys()];
  let shape, conf, ridge = null;
  // saw-tooth: a strong periodic brightness profile across the ridges (big sheds only)
  let saw = null;
  if (area > 350 && hu > 12) {
    const prof = (axisU) => { const m = new Map(); for (let i = 0; i < n; i++) { const k = Math.round((axisU ? U[i] : V[i]) / step); const o = m.get(k) || [0, 0]; o[0] += Lm[i]; o[1]++; m.set(k, o); } return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => o[0] / o[1]); };
    const lo = Math.max(2, Math.round(4 / step)), hi = Math.round(16 / step);
    const pu = periodicity(prof(true), lo, hi), pv = periodicity(prof(false), lo, hi);
    const p = pu.r >= pv.r ? { ...pu, axisU: true } : { ...pv, axisU: false };
    if (p.r > 0.55 && std > 10) saw = p;
  }
  if (saw) {
    shape = "saw"; conf = Math.min(1, (saw.r - 0.4) * 2);
    // the ridges run across the periodic axis
    ridge = saw.axisU ? ang + Math.PI / 2 : ang;
  } else if (hipGain > 0.12 && rH > 0.35 && hEnds > 10 && aspect < 4) {
    shape = "hip"; conf = Math.min(1, hipGain * 3 + (rH - 0.35));
    ridge = ang;
  } else if (rG > 0.3 && cG > 12 && facetRatio >= 0.42) {
    shape = "gable"; conf = Math.min(1, (rG - 0.2) * 1.6 + Math.min(0.3, cG / 100));
    ridge = ridgeLong ? ang : ang + Math.PI / 2;
  } else if (std < 16 && Math.max(cGL, cGS) < 12) {
    shape = "uniform"; conf = Math.min(1, (16 - std) / 12 + 0.25);
  } else {
    shape = null; conf = 0;   // textured or ambiguous (trees, mixed roofs, bad registration): no call
  }
  if (ridge != null) { ridge = ((ridge % Math.PI) + Math.PI) % Math.PI; ridge = Math.round(ridge * 1000) / 1000; }

  let col;
  if (shape === "gable" || shape === "hip") {
    const keys = shape === "hip" ? kH : ridgeLong ? kGL : kGS;
    const a = idxAll.filter((i) => keys[i] === 0 || keys[i] === 2), b = idxAll.filter((i) => keys[i] === 1 || keys[i] === 3);
    const ca = med(a), cb = med(b);
    col = [0, 1, 2].map((j) => (ca[j] + cb[j]) / 2);
  } else col = med(idxAll);
  res.rgb = hex(col);
  res.lum = Math.round(0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]);

  // rooftop equipment: blobs that differ from the median by > 28 levels (flat / uniform roofs only)
  if (shape === "uniform" || shape === "flat" || (shape == null && area > 200)) {
    const m0 = median(Lm), W = 2 * nv + 1, seen = new Uint8Array(n);
    let blobs = 0, odd = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0] || Math.abs(Lm[s0] - m0) < 28) continue;
      let size = 0; const st = [s0]; seen[s0] = 1;
      while (st.length) {
        const i = st.pop(); size++;
        const iu = Math.round(U[i] / step) + nu, iv = Math.round(V[i] / step) + nv;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ju = iu + du, jv = iv + dv; if (ju < 0 || jv < 0 || ju > 2 * nu || jv > 2 * nv) continue;
          const j = grid[ju * W + jv]; if (j < 0 || seen[j] || Math.abs(Lm[j] - m0) < 28) continue;
          seen[j] = 1; st.push(j);
        }
      }
      odd += size;
      const a = size * step * step; if (a >= 0.4 && a <= 60) blobs++;
    }
    res.equip = blobs;
    res.odd = Math.round((odd / n) * 100) / 100;
  }
  res.shape = shape; res.conf = Math.round(conf * 100) / 100; res.ridge = ridge; res.std = Math.round(std);
  return res;
}

/**
 * Final roof class from the aerial result + footprint facts. Thresholds were set against OSM roof:shape and hand labels
 * (scripts/anime/enrich/eval.js): at z17 (0.9 m/px) only strong gable calls are right often enough (hip calls were
 * right about half the time, so they only keep their ridge); a uniform roof is flat only when it reads as a deck
 * (big, sturdy GSI 3102, rooftop equipment, or a bright white membrane); a small uniform roof is a pitched roof whose
 * ridge runs along the sun, or a shed roof, and the photo cannot tell which. -> { shape, conf } or null.
 */
export function roofClass(a, { code, area }) {
  if (!a || !a.shape || !a.rgb) return roofNull(a, area);
  if (a.veg > 0.55) return null;
  const z17 = a.z === 17;
  const { lum, sat } = tone(a.rgb);
  switch (a.shape) {
    case "saw": return a.conf >= 0.5 ? { shape: "saw", conf: a.conf } : null;
    case "hip": return !z17 && a.conf >= 0.7 ? { shape: "hip", conf: a.conf } : null;
    case "gable": return a.conf >= (z17 ? 0.9 : 0.6) ? { shape: "gable", conf: a.conf } : null;
    case "uniform": {
      // at z17 (0.9 m/px) grey house roofs read uniform and noise reads as equipment: only sturdy or big pale decks
      const deck = z17 ? code === 3102 || (area >= 400 && lum >= 160 && sat < 0.12)
        : code === 3102 || area >= 150 || (a.equip ?? 0) >= 2 || (lum >= 195 && sat < 0.12 && area >= 60);
      return deck && a.conf >= 0.25 ? { shape: "flat", conf: Math.min(1, a.conf) } : null;
    }
  }
  return null;
}
/** No shape call, but a big bright white roof with no facet structure is a flat deck with equipment. */
function roofNull(a, area) {
  if (!a || !a.rgb || a.veg > 0.3 || !a.r2) return null;
  const { lum, sat } = tone(a.rgb);
  if (area >= 150 && lum >= 200 && sat < 0.1 && Math.max(...a.r2) < 0.2) return { shape: "flat", conf: 0.5 };
  return null;
}
function tone(c) {
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return { lum: 0.299 * r + 0.587 * g + 0.114 * b, sat: mx ? (mx - mn) / mx : 0 };
}
