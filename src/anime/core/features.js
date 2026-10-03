// [v6:survey] Named 3D features of the built world, for diffing the app against the photo survey in metres
// (tools/anime/survey-diff.mjs reads window.__features(area) and data/survey/<area>/features.json).
// Area modules call ctx.features.add(area, name, [x, y, z]) with ENU metres (x east, y = T.P. up, z south) for the SAME
// names the survey measures (docs/anime/survey/<area>.md); a name added twice keeps the last position.
// Names ending in `#k` form an unordered group (corners of one box, the stilts of a deck, a row of bollards): survey-diff
// matches a group's app points to the survey's by the cheapest assignment, so only membership has to agree, not order.
// ctx.features.dim(area, name, value) records a scalar (a count, a height, a riser) for the same diff.
export function createFeatures() {
  const areas = new Map(), dims = new Map();
  const bucket = (M, a) => { if (!M.has(a)) M.set(a, new Map()); return M.get(a); };
  return {
    add(area, name, p, meta = null) {
      const v = [+(+p[0]).toFixed(3), +(+p[1]).toFixed(3), +(+p[2]).toFixed(3)];
      if (v.some((n) => !Number.isFinite(n))) return;
      bucket(areas, area).set(name, meta ? { p: v, ...meta } : { p: v });
    },
    /** Add a group: points [[x, y, z], ...] as name#1, name#2, ... */
    group(area, name, pts) { pts.forEach((p, i) => this.add(area, `${name}#${i + 1}`, p)); },
    dim(area, name, value) { if (Number.isFinite(+value)) bucket(dims, area).set(name, +(+value).toFixed(3)); },
    /** { name: [x, y, z] } for one area, or { area: { name: [x, y, z] } } for all. */
    dump(area = null) {
      const one = (m) => Object.fromEntries([...m].map(([k, v]) => [k, v.p]));
      if (area) return areas.has(area) ? one(areas.get(area)) : {};
      return Object.fromEntries([...areas].map(([a, m]) => [a, one(m)]));
    },
    dims(area) { return dims.has(area) ? Object.fromEntries(dims.get(area)) : {}; },
    meta(area) { return areas.has(area) ? Object.fromEntries(areas.get(area)) : {}; },
    areas: () => [...new Set([...areas.keys(), ...dims.keys()])],
  };
}
