// [sight] The forest's trunks, for the walker's camera. physics has no collider for a tree of the forest (world/environment/trees.js, the
// scatter beside the walk spots): he can stand in one, and the boom used to sit inside one or behind one that hid him (the 気仙沼ハリストス
// 正教会 spot: a 1.1 m broadleaf trunk 0.4 m behind him, the picture a brown wall). The model is the drawn one: trees.js scales a unit tree by
// its crown radius `rad` (cedar x rad / 0.22, broadleaf x rad / 0.5) and by its height h, plants it 0.35 m into the ground, and its trunk
// is a cylinder of the unit tree: cedar 0.026 → 0.018 over 0.22, broadleaf 0.05 → 0.035 over 0.4. Street trees and poles are already
// physics cylinders. Crowns are not modelled: they start 1.4 m or more above the ground and the camera sees through the inside of one.
// The probe gathers the trees round the walker once a frame (`prepare`), then answers `hit(x, y, z)` with no allocation.

const TRUNK = {
  cedar: { r0: 0.026 / 0.22, r1: 0.018 / 0.22, h: 0.22 },
  broad: { r0: 0.05 / 0.5, r1: 0.035 / 0.5, h: 0.4 },
};
/** trees.js plants every tree this far into the ground. */
export const TREE_FOOT = 0.35;
const CELL = 8;
const key = (i, j) => i * 100003 + j;

/** The trunk of a tree record { x, z, y, h, r, type }: [y0, y1, r0, r1] (metres), or null when it has no trunk to speak of. */
export function trunkOf(t, out = [0, 0, 0, 0]) {
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.z) || !(t.h > 0) || !(t.r > 0)) return null;
  const m = t.type === 'cedar' ? TRUNK.cedar : TRUNK.broad;
  const y0 = (Number.isFinite(t.y) ? t.y : 0) - TREE_FOOT;
  out[0] = y0; out[1] = y0 + m.h * t.h; out[2] = Math.max(0.1, m.r0 * t.r); out[3] = Math.max(0.08, m.r1 * t.r);
  return out;
}

/**
 * `getTrees` returns the environment's tree list (or null before it exists). Indexed on first use, and again if the list changes.
 * `reach` is how far from the walker `prepare` gathers (the boom is at most 4.5 m, plus the margins).
 */
export function createTrunkProbe(getTrees, reach = 10) {
  let src = null, count = -1, grid = null;
  let near = new Float64Array(6 * 48), n = 0;
  const tmp = [0, 0, 0, 0];
  function index() {
    const trees = typeof getTrees === 'function' ? getTrees() : getTrees;
    if (!trees || !trees.length) { src = null; count = -1; grid = null; return; }
    if (trees === src && trees.length === count) return;
    src = trees; count = trees.length; grid = new Map();
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (!trunkOf(t, tmp)) continue;
      const k = key(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
      let a = grid.get(k); if (!a) grid.set(k, (a = []));
      a.push(i);
    }
  }
  return {
    /** Gather the trunks within `reach` of (x, z). Call once a frame before `hit`. */
    prepare(x, z) {
      index(); n = 0;
      if (!grid) return 0;
      const i0 = Math.floor((x - reach) / CELL), i1 = Math.floor((x + reach) / CELL), j0 = Math.floor((z - reach) / CELL), j1 = Math.floor((z + reach) / CELL);
      const r2 = reach * reach;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const a = grid.get(key(i, j)); if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const t = src[a[q]], dx = t.x - x, dz = t.z - z;
          if (dx * dx + dz * dz > r2) continue;
          if (n + 6 > near.length) { const g = new Float64Array(near.length * 2); g.set(near); near = g; }
          trunkOf(t, tmp);
          near[n] = t.x; near[n + 1] = t.z; near[n + 2] = tmp[0]; near[n + 3] = tmp[1]; near[n + 4] = tmp[2]; near[n + 5] = tmp[3];
          n += 6;
        }
      }
      return n / 6;
    },
    /** Is (x, y, z) inside a gathered trunk. */
    hit(x, y, z) {
      for (let i = 0; i < n; i += 6) {
        const y0 = near[i + 2], y1 = near[i + 3];
        if (y < y0 || y > y1) continue;
        const dx = x - near[i], dz = z - near[i + 1];
        const r = near[i + 4] + (near[i + 5] - near[i + 4]) * ((y - y0) / (y1 - y0));
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    },
    get gathered() { return n / 6; },
  };
}
