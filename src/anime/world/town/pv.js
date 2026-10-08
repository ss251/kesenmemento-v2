// [sys:8] Solar (PV) module rows on a flat roof. Earth 2026-03-11 tops show regular dark module grids on the processing plants and
// offices (a 31 to 49 % PV-blue pixel share); no builder drew them (a few random rooftop boxes only). Pure planning here (tested in
// test/sys-pv.test.js); mid.js and industrial.js turn the rows into tilted quads.
//
// A row is 1.0 m deep with a 1.0 m gap, runs east-west (the modules tilt about 10 degrees toward the south), and stays 1 m inside the roof
// outline. lot.roof.pv = { share: 0..1, side: 'n' | 's' | 'e' | 'w' | 'all' } restricts the modules to that band of the roof's bounding box
// ('all' shrinks the field about the roof centre).
export const PV = { depth: 1.0, gap: 1.0, margin: 1.0, tilt: 10 * Math.PI / 180, dark: '#2f3a52', frame: '#c9ced6' };

/** the x intervals of a ring on the horizontal line at z (even-odd) */
function spans(ring, z) {
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  }
  xs.sort((p, q) => p - q);
  const out = [];
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}
const meet = (A, B) => { const out = []; for (const a of A) for (const b of B) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi > lo) out.push([lo, hi]); } return out; };

/**
 * ring: the roof outline in a frame whose x runs east-west and z south (world, or any frame in which rows should run along x).
 * pv: { share, side } | number. -> [{ x0, x1, z0, z1 }] module rows (z1 is the south, lower edge).
 */
export function planPv(ring, pv, opts = {}) {
  const o = { ...PV, ...opts };
  const cfg = typeof pv === 'number' ? { share: pv, side: 'all' } : { share: pv?.share ?? 0, side: pv?.side || 'all' };
  if (!(cfg.share > 0) || !ring || ring.length < 3) return [];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
  const w = x1 - x0, d = z1 - z0;
  // the band of the bounding box that carries modules
  let bx0 = x0, bx1 = x1, bz0 = z0, bz1 = z1;
  const s = Math.min(1, cfg.share);
  if (cfg.side === 'n') bz1 = z0 + d * s;
  else if (cfg.side === 's') bz0 = z1 - d * s;
  else if (cfg.side === 'e') bx0 = x1 - w * s;
  else if (cfg.side === 'w') bx1 = x0 + w * s;
  else { const k = Math.sqrt(s), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; bx0 = cx - (w * k) / 2; bx1 = cx + (w * k) / 2; bz0 = cz - (d * k) / 2; bz1 = cz + (d * k) / 2; }
  const rows = [], m = o.margin, pitch = o.depth + o.gap;
  for (let z = Math.max(z0 + m, bz0); z + o.depth <= Math.min(z1 - m, bz1) + 1e-6; z += pitch) {
    // clear of the outline by `margin` in z too: the row's span is the intersection over the row and its margins
    let iv = spans(ring, z + o.depth / 2);
    for (const dz of [-m, 0, o.depth, o.depth + m]) iv = meet(iv, spans(ring, z + dz));
    for (const [a, b] of iv) {
      const lo = Math.max(a + m, bx0), hi = Math.min(b - m, bx1);
      if (hi - lo >= 1.0) rows.push({ x0: lo, x1: hi, z0: z, z1: z + o.depth });
    }
  }
  return rows;
}
/** Total module area (m2) of a plan */
export const pvArea = (rows) => rows.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

// ------------------------------------------------------------------ [r3:5] flush modules on a PITCHED roof
// Earth 2026-03-11 shows the arrays of a gable or hip roof as contiguous gridded blocks lying IN the roof plane (萬屋呉服部 /129: four blocks of 3 x 10 to 7 x 6 m on a rose gable). The flat-roof rack above (1 m rows, 1 m
// gaps, 10 degrees to the south) is wrong there. `roof.pv = { flush: true, rects: [{ x, z, w, d }], ridgeAt? }` lists the blocks in LOT-LOCAL metres (the frame of roof.plant: x along the frontage, z toward the street, origin at
// the lot's oriented-box centre). The builders (mid.js, kit/house.js) map each rect into the roof frame (a along the ridge, b across, the ridge at b = 0), clip it to the facet it lies on (never over the ridge, 0.4 m off it and the
// eave and the gable / hip edge) and lay coplanar module quads 0.07 m above the plane.
// `ridgeAt`: the real ridge's position across the roof, in lot-local metres on the axis across the ridge (z when the ridge runs along the frontage x, else x), absolute like the rects. The model's ridge
// is at the wing's centre; the real one may not be (萬屋呉服部's runs along z = 2.5, its wing is centred at z = 1.0). Blocks keep their distance from the REAL ridge, so they stay on the right facet and the
// right distance up the slope; without `ridgeAt` the wing's centre is the ridge.
export const PVF = { lift: 0.07, ridge: 0.4, eave: 0.45, end: 0.4, mw: 1.0, ml: 1.65, gap: 0.04, dark: '#27324a', frame: '#c4cad4', edge: 0.05 };

/** true when a roof.pv value asks for flush modules on a pitched roof */
export const isFlushPv = (pv) => !!pv && typeof pv === 'object' && pv.flush === true && Array.isArray(pv.rects) && pv.rects.length > 0;

/**
 * A lot-local rect { x, z, w, d } (centre, size) in a pitched wing's roof frame: { a0, a1, b0, b1 }. `at` = the roof frame's origin in lot-local metres { x, z }; alongX: the ridge runs along lot-local x
 * (frame: a = x - at.x), else along z (a = at.z - z: mid.js RP / kit RF turned a quarter); b is the distance across from the ridge, the real one (`ridgeAt`, see above) or, without it, the wing's centre.
 */
export function pvRectToRoof(rc, at, alongX, ridgeAt = null) {
  const xs = [rc.x - rc.w / 2, rc.x + rc.w / 2], zs = [rc.z - rc.d / 2, rc.z + rc.d / 2];
  const ridge = ridgeAt ?? (alongX ? at.z : at.x);
  const A = alongX ? xs.map((x) => x - at.x) : zs.map((z) => at.z - z), Bv = (alongX ? zs : xs).map((v) => v - ridge);
  return { a0: Math.min(...A), a1: Math.max(...A), b0: Math.min(...Bv), b1: Math.max(...Bv) };
}

/**
 * Clip roof-frame blocks to the facets of a gable / hip roof and tile them with modules.
 *   fr: { Lh, Dh, rl, pitch } the roof's half length along the ridge at the eave, half depth, the ridge's half length (= Lh for a gable), the slope (rise per metre of run)
 * -> [{ s (+1: the b > 0 facet), a0, a1, t0, t1 (t = distance from the ridge along b), cells: [{ a0, a1, t0, t1 }] }]; the cells are the dark module quads, the block is the frame under them.
 */
export function flushPvBlocks(blocks, fr, opts = {}) {
  const o = { ...PVF, ...opts }, out = [];
  const lim = (t) => fr.rl + (fr.Lh - fr.rl) * Math.min(1, Math.max(0, t / fr.Dh));   // the facet's half length at distance t from the ridge (a hip narrows to the ridge)
  const slope = Math.sqrt(1 + fr.pitch * fr.pitch);
  for (const bk of blocks) {
    for (const s of [1, -1]) {
      let t0 = s > 0 ? Math.max(bk.b0, 0) : Math.max(-bk.b1, 0), t1 = s > 0 ? bk.b1 : -bk.b0;
      t0 = Math.max(t0, o.ridge); t1 = Math.min(t1, fr.Dh - o.eave);
      if (t1 - t0 < 0.8) continue;
      const aL = lim(t0) - o.end;   // the narrowest edge of a hip facet is the ridge side
      const a0 = Math.max(bk.a0, -aL), a1 = Math.min(bk.a1, aL);
      if (a1 - a0 < 0.8) continue;
      // modules: mw along the ridge, ml along the slope (ml / slope of horizontal run), the grid fitted to the clipped block
      const nA = Math.max(1, Math.round((a1 - a0) / o.mw)), nT = Math.max(1, Math.round(((t1 - t0) * slope) / o.ml));
      const da = (a1 - a0) / nA, dt = (t1 - t0) / nT, cells = [];
      for (let i = 0; i < nA; i++) for (let j = 0; j < nT; j++) cells.push({ a0: a0 + i * da + o.gap / 2, a1: a0 + (i + 1) * da - o.gap / 2, t0: t0 + j * dt + o.gap / 2, t1: t0 + (j + 1) * dt - o.gap / 2 });
      out.push({ s, a0, a1, t0, t1, cells });
    }
  }
  return out;
}
/** Module area (m2, on the slope) of the blocks of flushPvBlocks */
export const flushPvArea = (blocks, pitch) => blocks.reduce((sum, b) => sum + b.cells.reduce((q, c) => q + (c.a1 - c.a0) * (c.t1 - c.t0) * Math.sqrt(1 + pitch * pitch), 0), 0);
