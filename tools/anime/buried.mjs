// [sys:6] How much of each footprint stands under the terrain: 1 m samples inside the polygon (inset 0.5 m), terrain higher than
// groundY + height - 0.5 m counts as buried. Over all non-excluded lots of 30 m2 or more. Exported for test/sys-ground.test.js.
//   env -u NODE_OPTIONS bun tools/anime/buried.mjs [--list]
import { join } from "node:path";
import { openGrids, makeSampler } from "../../src/anime/world/layout/grids.js";
import { terrainInRing, buriedShare, plinthMax } from "../../scripts/anime/derive.js";

const ROOT = new URL("../../", import.meta.url).pathname;
/** the photo-survey workflow's south shore */
export const inSurveyBox = (x, z) => x >= -80 && x <= 200 && z >= 0 && z <= 140;

export async function loadSampler() {
  const meta = await Bun.file(join(ROOT, "data/anime/grids.json")).json();
  return makeSampler(openGrids(meta, await Bun.file(join(ROOT, "data/anime/grids.bin")).arrayBuffer()));
}
/** the lots of layout.json as { id, ring, groundY, baseY, height, kind, area, cut, landmark } (far lots: their OBB) */
export async function loadLots() {
  const D = await Bun.file(join(ROOT, "data/anime/layout.json")).json();
  const out = D.lots.map((l) => ({ id: l.id, ring: l.poly, groundY: l.groundY, baseY: l.baseY ?? l.groundY, height: l.height, kind: l.kind, area: l.area, cut: !!l.cut, landmark: !!l.landmark || l.kind === "landmark", cx: l.obb.cx, cz: l.obb.cz, near: true }));
  const F = D.farLots, ix = (k) => F.fields.indexOf(k);
  for (const r of F.rows) {
    const [cx, cz, w, d, rot] = [r[ix("cx")], r[ix("cz")], r[ix("w")], r[ix("d")], r[ix("rotY")]], c = Math.cos(rot), s = Math.sin(rot), hw = w / 2, hd = d / 2;
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const id = r[0];
    out.push({ id, ring: [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)], groundY: r[ix("groundY")], baseY: r[ix("baseY")] ?? r[ix("groundY")], height: r[ix("height")], kind: F.kinds[r[ix("kind")]], area: r[ix("area")], cut: !!D.cuts?.some((q) => q.lot === id), landmark: F.extra?.[id]?.landmark != null || F.kinds[r[ix("kind")]] === "landmark", cx, cz, near: false });
  }
  return out;
}
export async function buriedReport({ minArea = 30 } = {}) {
  const S = await loadSampler(), lots = await loadLots(), rows = [];
  for (const l of lots) {
    if (l.area < minArea || l.landmark || inSurveyBox(l.cx, l.cz)) continue;
    const ts = terrainInRing(l.ring, (x, z) => S.heightAt(x, z));
    if (ts.n < 4) continue;
    rows.push({ near: l.near, id: l.id, kind: l.kind, area: l.area, buried: buriedShare(ts.hs, l.groundY, l.height), plinth: l.groundY - ts.min, span: ts.max - ts.min, cut: l.cut, Pmax: plinthMax(l.kind), cx: l.cx, cz: l.cz });
  }
  return rows;
}
if (import.meta.main) {
  const all = await buriedReport();
  // near = hero + mid lots (their real polygon); far lots are only their oriented box in layout.json, so their numbers are approximate
  for (const [label, rows] of [["near", all.filter((r) => r.near)], ["far", all.filter((r) => !r.near)]]) {
    const bad = rows.filter((r) => r.buried > 0.05 && !r.cut), over = rows.filter((r) => r.plinth > r.Pmax + 0.05);
    console.log(label, JSON.stringify({ lots: rows.length, over5pct: bad.length, plinthOverMax: over.length, maxPlinth: Math.max(...rows.map((r) => r.plinth)).toFixed(2) }));
    if (process.argv.includes("--list") && label === "near") for (const r of bad.concat(over)) console.log(r.id, r.kind, r.area, "buried", r.buried.toFixed(2), "plinth", r.plinth.toFixed(2), "span", r.span.toFixed(1), `(${r.cx.toFixed(0)},${r.cz.toFixed(0)})`);
  }
}
