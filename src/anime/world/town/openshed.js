// [r2:4] Wall-less sheds (GSI building codes 3111 普通無壁舎 / 3112 堅ろう無壁舎): carports, eaves, lean-tos and canopies. In the 2026-03-11
// Earth top view they are small low roofs beside the neighbouring buildings (shadows 2.2-4.5 m, short sides under 4 m for half of them), not
// closed 6-7 m boxes. A wall-less shed is a thin mono-pitch roof slab on steel posts: no walls, no ribs, no shutters, no windows.
// Pure planning here (test/sys-round2.test.js); mid.js and industrial.js turn the plan into geometry.

/** A lot drawn as a roof on posts: flagged by build-layout.js (lot.wallless), or a far lot, which carries no flag, recognised by what
 *  only a wall-less shed can be: a derived warehouse no taller than 4.5 m (every other derived warehouse stands at least 5.5 m). */
export const walllessOf = (lot) => lot.wallless === true || (lot.kind === 'warehouse' && lot.src?.h === 'derived' && lot.height > 0 && lot.height <= 4.5 && !lot.landmark);

export const SHED = { post: 0.14, slab: 0.14, inset: 0.15, pitch: 4.5, maxRise: 0.6, riseK: 0.12, minH: 2.4, post0: '#8e949b' };

/**
 * Plan of a roof on posts over a w x d footprint (m) whose eave stands h m above the floor. The slab runs across the SHORT axis (a lean-to
 * falls across its depth); sd (+1 / -1) is the side of the low eave.
 * -> { alongX (the long axis is x), L (long), D (short), rise, yLow, yHigh (top face of the slab at the low / high edge, above the floor),
 *      t (slab thickness), posts: [{ a, b, y1 }] in a frame whose a runs along the long axis and b across it; y1 = underside of the slab there }
 */
export function openShedPlan(w, d, h, sd = 1) {
  const alongX = w >= d, L = alongX ? w : d, D = alongX ? d : w;
  const hh = Math.max(SHED.minH, h), rise = Math.min(SHED.maxRise, D * SHED.riseK), t = SHED.slab;
  const yLow = hh, yHigh = hh + rise, posts = [];
  const a0 = -L / 2 + SHED.inset, a1 = L / 2 - SHED.inset, bLow = sd * (D / 2 - SHED.inset), bHigh = -bLow;
  const n = Math.max(1, Math.ceil((a1 - a0) / SHED.pitch));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    posts.push({ a, b: bLow, y1: yLow - t }, { a, b: bHigh, y1: yHigh - t });
  }
  return { alongX, L, D, rise, yLow, yHigh, t, sd, posts };
}
