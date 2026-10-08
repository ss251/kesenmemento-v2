// [sys:12] Seed the override `crossings` data of a junction whose arms Earth 2026-03-11 shows with zebras: one zebra per arm (a road of 7 m or more),
// centred where streets.js puts a hero arm's zebra: just past the cross carriageway's edge (+1.5 m, +2 m to the zebra's centre).
//   env -u NODE_OPTIONS bun tools/anime/seed-crossings.mjs <x> <z> [radius=12]   -> JSON entries for data/anime/overrides/<cell>.json "crossings"
// The positions are read from the layout (node + arm direction), the arms from the Earth top view of the junction; check them against
// raw/ref/earth/<cell>/top_annot.jpg before committing.
import { roadNodes } from '../../src/anime/world/town/streetlogic.js';
import { cwOf } from '../../src/anime/world/town/streetlogic.js';
import { resample } from '../../src/anime/world/town/geom.js';
const D = await Bun.file(new URL('../../data/anime/layout.json', import.meta.url)).json();
const [x, z, rad = 12] = process.argv.slice(2).map(Number);
const nodes = roadNodes(D.roads);
const out = [];
for (const n of nodes.values()) {
  if (Math.hypot(n.x - x, n.z - z) > rad || n.deg < 3) continue;
  for (const { r, end } of n.roads) {
    if (cwOf(r) * 2 < 6 || r.kind === 'alley') continue;
    const cross = Math.max(0, ...n.roads.filter((q) => q.r !== r).map((q) => cwOf(q.r))), dz = cross + 1.5 + 2;
    const pts = end ? r.pts.slice().reverse() : r.pts, S = resample(pts, 0.5);
    const p = S.find((q) => q.s >= dz); if (!p) continue;
    out.push({ at: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10], road: r.id });
  }
}
console.log(JSON.stringify(out));
