// [v4:town-accuracy] Rivers and the bridges over them (V3-SPEC section 10: 大川, 鹿折川, 神山川 and the town's streams).
// Source: OpenStreetMap waterways (© OpenStreetMap contributors, ODbL) with their widths measured on the GSI water
// areas (layout RIVERS, scripts/anime/enrich), and the carved river beds of data/anime/grids.bin (build-grids.js lowers
// every inland-water cell 2 m under its lowest bank; the DEM's interpolated lid had drawn 大川 as a grass strip).
//   * the water: an anime river ribbon 1.2 m under the lower bank (deep teal in the channel, pale at the banks, white
//     foam lines along both edges, painted flow streaks drifting downstream), never under the sea surface;
//   * the banks (hero + mid): sloped concrete revetments (護岸) with a coping kerb;
//   * the bridges: every hero / mid street that crosses a channel gets a deck (asphalt, concrete fascia, parapets with
//     a handrail, piers every ~20 m on wide rivers) that ramps up from the street, walkable (physics walk boxes);
//     the channel itself is a wall on foot.
// channels(L) and crossings() are pure (tested in test/v4-town-accuracy.test.js).
import * as THREE from 'three';
import { resample } from './common.js';

const DEF_W = { river: 10, canal: 6, stream: 3, drain: 2, ditch: 1.5 };

/** [r2:11] A river mouth widens: 鹿折川 (OSM w1133916768, width 37.2) is 70 m across at z -470 and 108-124 m at z -395 (Earth 2026-03-11 teal mask 71 / 78 / 86 / 97 / 108 / 125 m
 *  at z -470 / -455 / -440 / -425 / -410 / -395; the GSI water grid 72 / 76 / 84 / 96 / 108 / 124), while the ribbon was capped at 1.6 x the OSM width = 59.5 m and left
 *  12-48 m of the carved channel bare beside cream banks. Within MOUTH_REACH m (arclength) of the sea the cap is max(1.6 x width, MOUTH_W); the grid run (+1.5 m) still binds, so
 *  the ribbon follows it and cannot overshoot into merged ponds. Upstream (z -740..-560) all three agree at 36-42 m; 大川 (c9) matches its grid: only river mouths are affected. */
export const MOUTH_REACH = 150, MOUTH_W = 140, MOUTH_PAD = 5;
/** Arclength (m) at which a river's sample line meets the sea: the first sample on sea water, else where its end, run on along its tangent, reaches the sea within `ahead` m; Infinity if never. */
export function seaArclength(L, S, ahead = 40) {
  if (!L.isWater || !S.length) return Infinity;
  for (const p of S) if (L.isWater(p.x, p.z)) return p.s;
  const e = S[S.length - 1];
  for (let o = 0; o <= ahead; o += 4) if (L.isWater(e.x + e.tx * o, e.z + e.tz * o)) return e.s + o;
  return Infinity;
}

/** [r3:rivers] Water tones per channel name (vertex colours of the river ribbon; the toon lighting and the flow weave lift them a little). Earth 2026-03-11 seen from above reads 大川 (c9) as muddy
 *  grey-green, L* 37 a* 0 b* -7, and 鹿折川 (c4) as dark slate, L* 31 b* -16, and the 鹿折川 mouth as the same navy as the bay. `sea` is where the mouth blend ends (the river fades to it by p.mouth). A channel
 *  with no entry keeps the default harbour blues. */
export const RIVER_TONE = {
  '大川': { deep: '#42474d', mid: '#4e535a', edge: '#5c6167', sea: '#42474d' },
  '鹿折川': { deep: '#2f4658', mid: '#3a566a', edge: '#4a6678', sea: '#2f4658' },
};

/** River channels from layout RIVERS: [{ name, kind, w, S: [{ x, z, tx, tz, s, y }] }] with a water level y per sample
 *  (1.2 m under the lower bank, >= 0.08, never rising downstream). `near(x, z)` limits detail to an area. */
export function channels(L, { near = () => true, step = 3, minW = 2.5 } = {}) {
  const out = [];
  for (const r of L.RIVERS || []) {
    if (r.tunnel || !r.pts || r.pts.length < 2) continue;
    const w = r.width || DEF_W[r.kind] || 2;
    if (w < minW) continue;
    if (!r.pts.some(([x, z]) => near(x, z))) continue;
    const S = resample(r.pts, step);
    if (S.length < 2) continue;
    // align with the GSI water area (the carved channel of grids.bin): the OSM centre line can run 10-20 m off it
    const wc = L.waterClass ? (x, z) => L.waterClass(x, z) : () => 0;
    const sSea = seaArclength(L, S);   // [r2:11] where the line meets the bay; the last MOUTH_REACH m before it may be wider than 1.6 x the OSM width
    for (const p of S) {
      const reach = p.s >= sSea - MOUTH_REACH;   // [r2:11] the search reaches the far bank of a mouth up to MOUTH_W wide (it stopped at 0.9 w + 14 m, 48 m for 鹿折川: 97 m of channel)
      const nx = -p.tz, nz = p.tx, R = Math.ceil(reach ? Math.max(w * 0.9 + 14, MOUTH_W / 2 + 10) : w * 0.9 + 14);
      let best = null, a = null;
      for (let o = -R; o <= R + 1; o += 1) {
        const inW = o <= R && wc(p.x + nx * o, p.z + nz * o) === 2;
        if (inW && a === null) a = o;
        if (!inW && a !== null) { const b = o - 1, d = a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)); if (b - a >= 1 && (!best || d < best.d || d === best.d && b - a > best.b - best.a)) best = { a, b, d }; a = null; }
      }
      p.wet = !!best && best.d < w * 0.6 + 6;
      p.c = p.wet ? (best.a + best.b) / 2 : 0;
      // [r2:11] the measured grid run is still the binding cap at the mouth (+5 m there: the grid is 5-15 m narrower than Earth)
      p.w = p.wet ? Math.max(2, Math.min(reach ? Math.max(w * 1.6, MOUTH_W) : w * 1.6, best.b - best.a + (reach ? MOUTH_PAD : 1.5))) : w;
    }
    // smooth the centre offset and width along the river (window 7)
    { const c = S.map((p) => p.c), ww = S.map((p) => p.w); for (let i = 0; i < S.length; i++) { let sc = 0, sw = 0, n = 0; for (let k = Math.max(0, i - 3); k <= Math.min(S.length - 1, i + 3); k++) { sc += c[k]; sw += ww[k]; n++; } S[i].c = sc / n; S[i].w = sw / n; } }
    for (const p of S) { p.x += -p.tz * p.c; p.z += p.tx * p.c; }
    // the bank: the first dry land out from each edge (not the carved bed, not the sea)
    const landAt = (x, z, nx, nz, e) => { for (const o of [2, 4, 7, 11, 16, 24]) { const qx = x + nx * (e + o), qz = z + nz * (e + o); if (wc(qx, qz) === 0 && !(L.isWater?.(qx, qz))) return L.heightAt(qx, qz); } return null; };
    for (const p of S) {
      const nx = -p.tz, nz = p.tx, e = p.w / 2;
      const a = landAt(p.x, p.z, nx, nz, e), b = landAt(p.x, p.z, -nx, -nz, e);
      p.bank = a === null && b === null ? 1.3 : Math.min(a ?? Infinity, b ?? Infinity);
      // a carved channel: 1.2 m under the lower bank; a stream too small for a GSI water area: on the ground
      p.y = p.wet ? Math.max(0.08, p.bank - 1.2) : L.heightAt(p.x, p.z) + 0.1;
    }
    // smooth (window 7) and never rise downstream (OSM waterways run with the flow)
    const ys = S.map((p) => p.y);
    for (let i = 0; i < S.length; i++) { let s = 0, n = 0; for (let k = Math.max(0, i - 3); k <= Math.min(S.length - 1, i + 3); k++) { s += ys[k]; n++; } S[i].y = s / n; }
    for (let i = 1; i < S.length; i++) S[i].y = Math.min(S[i].y, S[i - 1].y);
    // [v4:polish2] the mouth: where the channel meets the bay, the last 30 m of water ease down to the sea surface
    // (+0.08 m), so the ribbon slides into the bay instead of ending in a hard shelf (鹿折川 mouth, a_3.png)
    for (const p of S) p.mouth = 0;   // [sys:20] easeMouth sets the weight where the channel meets the bay
    easeMouth(L, S, 30);
    out.push({ name: r.name || null, nameEn: r.nameEn || null, kind: r.kind, w, S });
  }
  return out;
}

/** Ease the water level of the last `len` m before a channel's mouth down to the sea (pure; exported for the tests). */
export function easeMouth(L, S, len = 30) {
  let iw = -1; for (let i = S.length - 1; i >= 0; i--) if (S[i].wet) { iw = i; break; }
  if (iw < 1 || !L.isWater) return false;
  // the sea within 40 m downstream of the last wet sample (along the polyline, or straight on along its tangent)
  const e = S[iw];
  let sea = false;
  for (let i = iw; i < S.length && !sea; i++) if (Math.hypot(S[i].x - e.x, S[i].z - e.z) <= 40 && L.isWater(S[i].x, S[i].z)) sea = true;
  for (let o = 0; o <= 40 && !sea; o += 4) if (L.isWater(e.x + e.tx * o, e.z + e.tz * o)) sea = true;
  if (!sea) return false;
  const yS = (L.SEA?.level ?? 0) + 0.08;
  let d = 0;
  for (let i = iw; i >= 0; i--) {
    if (i < iw) d += Math.hypot(S[i + 1].x - S[i].x, S[i + 1].z - S[i].z);
    if (d > len) break;
    const t = 1 - d / len, k = t * t * (3 - 2 * t);
    S[i].y = Math.max(yS, S[i].y + (yS - S[i].y) * k);
    S[i].mouth = k;   // [sys:20] the same smoothstep weight, kept: the foam, the banks and the colour fade out with it (rivers.js buildRivers)
  }
  for (let i = iw + 1; i < S.length; i++) { S[i].y = Math.min(S[i].y, yS); S[i].mouth = 1; }
  return true;
}

/** Segment-hash lookup: inChannel(x, z, pad) -> { ch, i, d } | null (d = distance to the centre line). */
export function channelIndex(chs, cell = 40) {
  const map = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  chs.forEach((ch, c) => { for (let i = 1; i < ch.S.length; i++) { const a = ch.S[i - 1], b = ch.S[i], r = Math.max(a.w, b.w) / 2 + 8; const i0 = Math.floor((Math.min(a.x, b.x) - r) / cell), i1 = Math.floor((Math.max(a.x, b.x) + r) / cell), j0 = Math.floor((Math.min(a.z, b.z) - r) / cell), j1 = Math.floor((Math.max(a.z, b.z) + r) / cell); for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) { const k = key(ii, jj); let l = map.get(k); if (!l) map.set(k, (l = [])); l.push([c, i]); } } });
  function at(x, z, pad = 0) {
    const l = map.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!l) return null;
    let best = null;
    for (const [c, i] of l) {
      const ch = chs[c], a = ch.S[i - 1], b = ch.S[i];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if ((a.wet || b.wet) && d <= (a.w + (b.w - a.w) * t) / 2 + pad && (!best || d < best.d)) best = { ch, i, t, d, y: a.y + (b.y - a.y) * t };
    }
    return best;
  }
  return { at };
}

function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, x: a[0] + r[0] * t, z: a[1] + r[1] * t } : null;
}
/** Where roads cross channels: [{ road, ch, x, z, tx, tz, span, y }] (span = channel width along the road). */
export function crossings(roads, chs) {
  const out = [];
  const bbox = (pts, pad) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of pts) { const x = p.x ?? p[0], z = p.z ?? p[1]; x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };
  const cb = chs.map((ch) => bbox(ch.S, 5));
  for (const road of roads) {
    const rb = bbox(road.pts, 0);
    for (const [ci, ch] of chs.entries()) {
      const b = cb[ci]; if (rb[2] < b[0] || rb[0] > b[2] || rb[3] < b[1] || rb[1] > b[3]) continue;
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i];
        for (let k = 1; k < ch.S.length; k++) {
          const p = ch.S[k - 1], q = ch.S[k];
          if (!p.wet && !q.wet) continue;
          const X = segX(a, b, [p.x, p.z], [q.x, q.z]); if (!X) continue;
          const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L0, tz = (b[1] - a[1]) / L0;
          const sin = Math.abs(tx * p.tz - tz * p.tx);
          out.push({ road, ch, x: X.x, z: X.z, tx, tz, span: (p.w + (q.w - p.w) * X.u) / Math.max(0.35, sin), y: p.y + (q.y - p.y) * X.u });
        }
      }
    }
  }
  // one crossing per road and channel within 15 m (polyline joints can report the same crossing twice). [r3:12] A crossing within 15 m of an earlier one on the same channel whose road has the same
  // name or ref is a duplicate too: 大川 x 気仙沼唐桑線 is two road ids (r13790 / r13760, 16 m) that would lay two coplanar decks
  const sameRoad = (a, b) => a === b || (a.name && a.name === b.name) || (a.ref && a.ref === b.ref);
  return out.filter((c, i) => !out.slice(0, i).some((o) => o.ch === c.ch && Math.hypot(o.x - c.x, o.z - c.z) < 15 && sameRoad(o.road, c.road)));
}
/**
 * [r3:12] The deck height of a crossing (m, T.P.). A hero / mid road: 2.3 m over the water (c.y), as before. A FAR road (zone far: 気仙沼唐桑線's bridge over the 鹿折川, r9949): a LEVEL deck at the approach
 * height, max(c.y + 2.3, the lower of the two approach grounds + 0.1): the bank roads there are 4.3 m, the water -0.25 m, and a deck 2.3 m over the water (2.4 m) dipped 1.9 m below both approaches.
 * groundAt(x, z) -> terrain height; half: half the span plus 2.5 m; ramp: the approach length.
 */
export function bridgeDeckY(c, groundAt, half, ramp, far = false) {
  const base = c.y + 2.3;
  if (!far) return base;
  const a = groundAt(c.x - c.tx * (half + ramp), c.z - c.tz * (half + ramp)), b = groundAt(c.x + c.tx * (half + ramp), c.z + c.tz * (half + ramp));
  return Math.max(base, Math.min(a, b) + 0.1);
}

/** The river flow texture: soft painted streaks along v (downstream), tileable. */
function flowTexture(ctx) {
  return ctx.tex.draw(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const r = ctx.rng('river-flow');
    for (let k = 0; k < 26; k++) {
      const x = r() * w, y = r() * h, L = 30 + r() * 70, a = 0.05 + r() * 0.1;
      g.strokeStyle = `rgba(255,255,255,${a * 4})`; g.lineWidth = 1 + r() * 2.5; g.lineCap = 'round';
      for (const dy of [0, -h, h]) { g.beginPath(); g.moveTo(x, y + dy); g.lineTo(x + (r() - 0.5) * 6, y + dy + L); g.stroke(); }
    }
    // a faint darker weave so the white streaks read against the base colour
    g.globalAlpha = 0.08; g.fillStyle = '#36606a';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y + ((y / 16) % 2) * 4, w, 3);
    g.globalAlpha = 1;
  }, { key: 'town-river-flow', repeat: [1, 1] });
}

/**
 * Build the rivers. opts: { detail(x, z) -> true where banks + bridges are built (hero + mid), roads (hero + mid ROADS, plus [r3:12] the far roads of kind 'bridge'),
 * bridgeDetail(x, z) -> true where a bridge crossing gets its deck (default: detail; [r3:12] index.js widens it for the far bridge crossings only), asphalt (the street asphalt material) }. -> { channels, index, stats }
 */
export function buildRivers(ctx, { chs, index, detail, roads, asphalt, bridgeDetail = null }) {
  const L = ctx.L;
  const root = new THREE.Group(); root.name = 'town-rivers';
  const tex = flowTexture(ctx);
  const waterMat = ctx.mat.toon('#ffffff', { map: tex, vertexColors: true, paint: 0.02, polygonOffset: -1 });
  const foamMat = ctx.mat.toon('#f2f7f5', { paint: 0.0, polygonOffset: -2 });
  const conc = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.06, side: 'double' });   // banks run both ways round
  const W = { p: [], n: [], u: [], c: [], i: [] }, Fm = { p: [], n: [], i: [] }, C = { p: [], n: [], c: [], i: [] };
  // [v5:fix1] the bay's harbour blues (鹿折川 and 大川 are tidal here; Google Earth 2026 shows them as dark as the bay, the
  // turquoise #3f8791 / #5ea3a3 / #8cc2b8 read as a different water)
  const dflt = { deep: new THREE.Color('#336d95'), mid: new THREE.Color('#4a8fac'), edge: new THREE.Color('#6f9fb4'), sea: new THREE.Color('#4f8fab') };   // [sys:20] sea = water.js uRiver: the tone the sea shader gives the river water it meets
  // [r3:rivers] a per-river tone, keyed by the channel name (RIVER_TONE): the default palette still rendered saturated cobalt from above (L* 47, b* -32 / -33) where Earth 2026-03-11 reads 大川 as muddy grey-green and 鹿折川 as dark slate
  const tones = Object.fromEntries(Object.entries(RIVER_TONE).map(([n, t]) => [n, Object.fromEntries(Object.entries(t).map(([k, v]) => [k, new THREE.Color(v)]))]));
  const cc = new THREE.Color();
  const put = (B, x, y, z, n = [0, 1, 0], col = null, uv = null) => { B.p.push(x, y, z); B.n.push(n[0], n[1], n[2]); if (B.c) { const c = col || { r: 1, g: 1, b: 1 }; B.c.push(c.r, c.g, c.b); } if (B.u) B.u.push(uv ? uv[0] : 0, uv ? uv[1] : 0); return B.p.length / 3 - 1; };
  const quad = (B, a, b, c, d) => B.i.push(a, b, c, a, c, d);
  let banks = 0, bridges = 0, deckM = 0;
  for (const ch of chs) {
    const S = ch.S;
    // ---- water: 5 lanes across (edge / mid / deep / mid / edge) so the colour bands read like the bay
    const tn = tones[ch.name] || dflt, deep = tn.deep, mid = tn.mid, edge = tn.edge, seaRiver = tn.sea;
    const lanes = [-0.5, -0.36, -0.12, 0.12, 0.36, 0.5], lc = [edge, mid, deep, deep, mid, edge];
    let prev = null, prevF = null;
    for (const p of S) {
      // [sys:20] the ribbon dips under the sea surface as the mouth weight rises (0.2 m at the mouth), so it ends under the bay's own water, not on a shelf
      const nx = -p.tz, nz = p.tx, y = p.y - 0.2 * (p.mouth || 0), w = p.w;
      // [sys:20] near the mouth the lane colours blend into the bay's tone (the river and the sea meet as one dark surface)
      const mo = p.mouth || 0;
      const row = lanes.map((o, k) => { const cl = mo > 0 ? cc.copy(lc[k]).lerp(seaRiver, mo) : lc[k]; return put(W, p.x + nx * o * w, y, p.z + nz * o * w, [0, 1, 0], cl, [o * w / 12 + 0.5, p.s / 24]); });
      if (prev) for (let k = 0; k < lanes.length - 1; k++) quad(W, prev[k], prev[k + 1], row[k + 1], row[k]);
      prev = row;
      // foam: two thin lines just inside each edge
      // [sys:20] the two strips narrow to zero as the mouth weight rises and stop where it passes 0.5: no white bar across the river-sea seam
      if (mo > 0.5) { prevF = null; }
      else {
        const fr = [], fw = (0.9 / w) * (1 - mo);
        for (const [o0, o1] of [[-0.5, -0.5 + fw], [0.5 - fw, 0.5]]) { fr.push(put(Fm, p.x + nx * o0 * w, y + 0.015, p.z + nz * o0 * w), put(Fm, p.x + nx * o1 * w, y + 0.015, p.z + nz * o1 * w)); }
        if (prevF) { quad(Fm, prevF[0], prevF[1], fr[1], fr[0]); quad(Fm, prevF[2], prevF[3], fr[3], fr[2]); }
        prevF = fr;
      }
    }
    // ---- banks (hero + mid only): revetment slope from the water to the bank top, and a coping kerb
    let pr = null;
    for (const p of S) {
      if (!detail(p.x, p.z) || !p.wet || (p.mouth || 0) > 0.3) { pr = null; continue; }   // [sys:20] the levee tips end on land, not in the water
      const nx = -p.tz, nz = p.tx, row = [], w = p.w;
      for (const sd of [-1, 1]) {
        const ex = p.x + nx * sd * w / 2, ez = p.z + nz * sd * w / 2;
        const ox = ex + nx * sd * 1.6, oz = ez + nz * sd * 1.6;
        const top = Math.max(p.y + 0.9, L.heightAt(ox, oz) + 0.25);
        cc.set('#b9b8b0');
        row.push([put(C, ex, p.y - 0.4, ez, [nx * -sd, 0.6, nz * -sd], cc), put(C, ox, top, oz, [nx * -sd, 0.6, nz * -sd], cc), put(C, ox + nx * sd * 0.4, top + 0.1, oz + nz * sd * 0.4, [0, 1, 0], cc.set('#c9c7bf')), put(C, ox + nx * sd * 0.4, L.heightAt(ox + nx * sd * 0.4, oz + nz * sd * 0.4) - 0.3, oz + nz * sd * 0.4, [nx * sd, 0, nz * sd], cc.set('#aeaca4'))]);
      }
      if (pr) for (let s = 0; s < 2; s++) { const A = pr[s], B = row[s]; quad(C, A[0], A[1], B[1], B[0]); quad(C, A[1], A[2], B[2], B[1]); quad(C, A[2], A[3], B[3], B[2]); }
      pr = row; banks++;
    }
  }
  // ---- bridges
  const X = crossings(roads, chs).filter((c) => (bridgeDetail || detail)(c.x, c.z));
  const D = { p: [], n: [], u: [], c: [], i: [] };
  const physics = ctx.physics;
  for (const c of X) {
    const road = c.road, hw = road.width / 2 + 0.5, ramp = 10, half = c.span / 2 + 2.5;
    const deckY = bridgeDeckY(c, (x, z) => L.heightAt(x, z), half, ramp, road.zone === 'far');   // [r3:12] a far road's deck is level at the approach height
    const S = [];
    for (let s = -half - ramp; s <= half + ramp + 1e-6; s += 1) {
      const x = c.x + c.tx * s, z = c.z + c.tz * s;
      const ground = L.heightAt(x, z) + 0.06;
      const k = Math.abs(s) <= half ? 1 : Math.max(0, 1 - (Math.abs(s) - half) / ramp);
      const e = k * k * (3 - 2 * k);
      S.push({ s, x, z, y: Math.max(ground, ground + (deckY - ground) * e) });
    }
    const nx = -c.tz, nz = c.tx;
    let prev = null;
    for (const p of S) {
      const g = 0.93;
      const row = [
        put(D, p.x - nx * hw, p.y, p.z - nz * hw, [0, 1, 0], { r: g, g, b: g }, [(p.x - nx * hw) / 4, -(p.z - nz * hw) / 4]),
        put(D, p.x + nx * hw, p.y, p.z + nz * hw, [0, 1, 0], { r: g, g, b: g }, [(p.x + nx * hw) / 4, -(p.z + nz * hw) / 4]),
      ];
      if (prev) quad(D, prev[0], prev[1], row[1], row[0]);
      prev = row;
    }
    // fascia + parapets + handrails over the channel and its approaches (concrete, vertex coloured)
    const over = S.filter((p) => Math.abs(p.s) <= half + ramp * 0.6);
    for (const sd of [-1, 1]) {
      let pv = null;
      for (const p of over) {
        const ex = p.x + nx * sd * hw, ez = p.z + nz * sd * hw;
        const fy = p.y - (Math.abs(p.s) <= half ? 0.9 : 0.35);
        const row = [put(C, ex, fy, ez, [nx * sd, 0, nz * sd], cc.set('#c6c4bb')), put(C, ex, p.y + 0.02, ez, [nx * sd, 0, nz * sd], cc), put(C, ex, p.y + 0.9, ez, [nx * sd, 0, nz * sd], cc.set('#d8d6ce')),
          put(C, ex - nx * sd * 0.25, p.y + 0.9, ez - nz * sd * 0.25, [0, 1, 0], cc.set('#e2e0d8')), put(C, ex - nx * sd * 0.25, p.y, ez - nz * sd * 0.25, [-nx * sd, 0, -nz * sd], cc.set('#cfcdc4'))];
        if (pv) for (let k = 0; k < 4; k++) quad(C, pv[k], pv[k + 1], row[k + 1], row[k]);
        pv = row;
      }
    }
    // piers under long spans
    const nP = Math.floor(c.span / 20);
    for (let k = 1; k <= nP; k++) {
      const s = -c.span / 2 + (c.span * k) / (nP + 1), x = c.x + c.tx * s, z = c.z + c.tz * s;
      const y0 = c.y - 1.5, y1 = deckY - 0.9;
      const pw = Math.min(hw * 1.6, 7), pd = 1.4;
      const P = (u, v) => [x + nx * u + c.tx * v, z + nz * u + c.tz * v];
      const cn = [P(-pw / 2, -pd / 2), P(pw / 2, -pd / 2), P(pw / 2, pd / 2), P(-pw / 2, pd / 2)];
      cc.set('#bdbbb3');
      for (let e = 0; e < 4; e++) {
        const A = cn[e], B = cn[(e + 1) % 4], ex = B[0] - A[0], ez = B[1] - A[1], el = Math.hypot(ex, ez) || 1, n = [ez / el, 0, -ex / el];
        const q = [put(C, A[0], y0, A[1], n, cc), put(C, B[0], y0, B[1], n, cc), put(C, B[0], y1, B[1], n, cc), put(C, A[0], y1, A[1], n, cc)];
        quad(C, q[0], q[1], q[2], q[3]);
      }
    }
    // walkable deck (2 m slabs following the profile)
    if (physics?.addWalkBox) for (let i = 0; i + 2 < S.length; i += 2) { const a = S[i], b = S[i + 2]; physics.addWalkBox((a.x + b.x) / 2, (a.z + b.z) / 2, hw * 2, 2.05, Math.atan2(c.tx, c.tz), Math.max(a.y, b.y)); }
    bridges++; deckM += S.length;
  }
  // the channel is a wall on foot (below the deck height, so a bridge deck stays walkable)
  if (physics?.addBox) for (const ch of chs) for (let i = 3; i < ch.S.length; i += 3) {
    const a = ch.S[i - 3], b = ch.S[i]; if (!detail(a.x, a.z) || !a.wet) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 0.5) continue;
    physics.addBox((a.x + b.x) / 2, (a.z + b.z) / 2, Math.max(1, a.w - 1.0), len + 0.4, Math.atan2(b.x - a.x, b.z - a.z), -50, a.y + 0.6);
  }
  const mk = (B, mat, name, shadow = false) => {
    if (!B.i.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    if (B.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2)); if (B.c) g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; m.castShadow = shadow; root.add(m);
  };
  mk(W, waterMat, 'river-water'); mk(Fm, foamMat, 'river-foam'); mk(C, conc, 'river-banks', true);
  if (asphalt) mk(D, asphalt, 'bridge-decks', true);
  // flow: the streak texture drifts downstream (texture v runs with the river)
  ctx.onUpdate((dt, t) => { tex.offset.y = -((t * 0.04) % 1); });
  ctx.noBatch(root);
  ctx.addStatic(root);
  return { channels: chs.length, banks, bridges, deckM, names: [...new Set(chs.map((c) => c.name).filter(Boolean))] };
}
