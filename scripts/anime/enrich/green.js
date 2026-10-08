// [r3:2] The vegetation-green scan: a footprint whose interior in the GSI aerial photo (about 2020-22) is dark vegetation green is no roof but a slope, a copse or a lawn, i.e. a ghost lot. Round 3
// scanned all 2,364 lots of the 12 accuracy cells and found 66 whose interior is dark vegetation (mean luminance under 132, G over R by 9 or more, 80 % of the pixels green); at least 20 of them
// are ghosts (the 8 c2 hill lots among them), and some had been recoloured with a 'roof colour' that sampled trees or soil. CHECK-GONE (earth-ref.mjs, presence) cannot see them: it needs clear
// edges in the GSI photo, and a lot over forest or grass has none. This scan is ADVISORY (tools/anime/green-scan.mjs lists the lots and writes data/anime/green-flags.json); the build gate that
// uses the list is `greenGateErrors`: an override that recolours a flagged lot must name an oblique view (o0 / o180 / l45 ...) or a ground photo in its `src`. Earth top-view colours alone are not
// enough: every bad recolour already said 'earth: roof #... on the top view'.
export const GREEN = { lumMax: 132, gOverR: 9, share: 0.8, inset: 0.8, step: 0.6, minSamples: 12 };
/** the kinds the scan skips (a shrine precinct, a temple compound or a landmark model sits under trees on purpose) */
export const GREEN_SKIP_KINDS = new Set(["landmark", "shrine", "temple"]);
/** vegetation green: G over R by 9 or more, and G above B (the photo has a cyan cast: a blue-grey slate roof has B >= G and must not count) */
export const isVegGreen = (r, g, b) => g - r >= GREEN.gOverR && g > b;
const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
/** { n, lum (mean luminance), share (green share) } of a list of [r, g, b] samples, or null with fewer than minSamples */
export function greenStats(samples) {
  if (!samples || samples.length < GREEN.minSamples) return null;
  let l = 0, g = 0;
  for (const [r, gg, b] of samples) { l += lumOf(r, gg, b); if (isVegGreen(r, gg, b)) g++; }
  return { n: samples.length, lum: Math.round((l / samples.length) * 10) / 10, share: Math.round((g / samples.length) * 100) / 100 };
}
/** true for a dark vegetation-green interior */
export const vegFlag = (st) => !!st && st.lum < GREEN.lumMax && st.share >= GREEN.share;
const inRing = (x, z, ring) => { let s = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) s = !s; } return s; };
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const ringDist = (x, z, ring) => { let d = Infinity; for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(x, z, ring[i], ring[(i + 1) % ring.length])); return d; };
/** [r, g, b] samples of a sampler (x, z) -> rgb | null on a grid inside a ring, at least `inset` m from its edge */
export function ringSamples(ring, sampler, { step = GREEN.step, inset = GREEN.inset } = {}) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const out = [];
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
    if (!inRing(x, z, ring) || ringDist(x, z, ring) < inset) continue;
    const c = sampler(x, z); if (c) out.push(c);
  }
  return out;
}
/** does lot `a` share an edge or corner with another lot (a sliver between two buildings)? others: lots with `poly` (a itself is skipped by id) */
export function touchesOther(a, others, tol = 0.4) {
  for (const b of others) {
    if (b === a || b.id === a.id || !b.poly) continue;
    if (Math.abs(a.obb.cx - b.obb.cx) > (a.obb.w + a.obb.d + b.obb.w + b.obb.d) / 2 + 2) continue;   // far apart (the boxes' half diagonals)
    for (const p of a.poly) if (ringDist(p[0], p[1], b.poly) < tol) return true;
    for (const p of b.poly) if (ringDist(p[0], p[1], a.poly) < tol) return true;
  }
  return false;
}
/**
 * The scan over a list of lots. sampler: (x, z) -> rgb of the GSI photo. skip(lot): true to leave a lot out (an excluded area).
 * -> [{ id, kind, area, lum, share, n, touches }]; `flagged` lots are those with vegFlag and not a sliver (touches) and not of a skipped kind.
 */
export function scanGreen(lots, sampler, { skip = () => false } = {}) {
  const out = [];
  for (const l of lots) {
    if (!l.poly || GREEN_SKIP_KINDS.has(l.kind) || l.landmark || skip(l)) continue;
    const st = greenStats(ringSamples(l.poly, sampler)); if (!vegFlag(st)) continue;
    out.push({ id: l.id, kind: l.kind, area: Math.round(l.area || 0), ...st, touches: touchesOther(l, lots) });
  }
  return out;
}
/** an oblique view or a ground photo is named in the source text of an override (the confirmation a recolour of a flagged lot needs) */
const OBLIQUE_RE = /(^|[^A-Za-z0-9_])(o0|o90|o180|o270|l45|l225)(?![0-9A-Za-z])|ground photo|commons|author photo|photos|street[- ]?view/i;
export const confirmsOblique = (src) => OBLIQUE_RE.test(String(src || ""));
/**
 * The build gate. flags: { [lotId]: {...} } (data/anime/green-flags.json `flagged`); ops: Map(lot id -> [{ roof?, remove?, why, ref }]) (compileOverrides().lotPatch).
 * -> error strings for every recolour (roof.color) of a flagged lot whose `src` names no oblique view or ground photo; removals are always allowed.
 */
export function greenGateErrors(flags, lotPatch) {
  const errs = [];
  if (!flags) return errs;
  for (const [id, ops] of lotPatch) {
    if (!flags[id] || flags[id].touches || ops.some((o) => o.remove)) continue;   // a removed lot needs no confirmation; a sliver between two buildings is not a ghost lead
    for (const o of ops) if (!o.remove && o.roof?.color != null && !confirmsOblique(o.why)) errs.push(`${o.ref}: ${id} recolours a lot whose GSI interior is vegetation green (lum ${flags[id].lum}, ${Math.round(flags[id].share * 100)} % green): its src must name an oblique view (o0 / o180 / l45) or a ground photo that shows a roof there, or the lot must be removed (remove: true)`);
  }
  return errs;
}
