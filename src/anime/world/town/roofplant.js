// [r2:5] Rooftop plant. The large flat roofs of 2026-03-11 Earth carry stair and lift penthouses, runs of ducting on frames, rows of condensers, light wells and
// solar fields; the mid, hero-block and plant builders drew 0-4 random boxes of 1 x 0.7 m or 2 x 2 m (and nothing at all on a plant roof). The enrichment's `equip` count
// (aerial.js) is NOT a source for them: it counts roof clutter on a 2020-22 photo, 12-30 of them on a big roof, and drawing that many boxes from noise would invent a roof.
// A lot may instead carry a measured spec, lot.roof.plant = [{ x, z, w, d, h, kind }] (data/anime/overrides, schema in docs/anime/OVERRIDES.md): rects in LOT-LOCAL metres
// (x along the frontage, z toward the street, origin at the lot's oriented-box centre), h above the roof deck. Read off the Earth top view with tools (a rectified crop with a
// 5 m grid in the lot frame, +-1.5 m); the builders draw the rects exactly and skip the random boxes of a lot that has a spec.
//   penthouse      a box with a darker cap: stair / lift housing, a plant room, a stepped higher section
//   duct           parallel runs along the rect's long side on a low rail (one per 2.4 m of the short side), h the top of the run: ducting, pipe racks, cable trays
//   condenser-row  a row of outdoor units along the rect's long side (1.1 m units on a 1.35 m pitch, as deep as the rect)
//   pv             solar modules over the rect (the existing planPv rows: 1 m rows, 10 degrees to the south, 1 m inside the rect)
// Pure (no three.js): the builders turn the boxes into geometry; drawRoofPlant is the one shared drawer for the frame-based builders (hero kit, blocks, industrial).
import { planPv, PV } from './pv.js';
export const PLANT_KINDS = ['penthouse', 'duct', 'condenser-row', 'pv'];
export const PLANT = { body: '#d9dcdc', cap: '#8e949b', duct: '#b9bec2', rail: '#6d747c', unit: '#dfe2e3', pitch: 1.35, unitW: 1.1, ductEvery: 2.4, ductW: 0.8, railH: 0.45, maxUnits: 24 };

/** -> [{ x, z, w, d, y0, h, color }] boxes (centre x, z; y0 above the deck) for every non-pv rect of a spec */
export function plantBoxes(plant) {
  const out = [];
  for (const q of plant || []) {
    if (q.kind === 'penthouse') {
      out.push({ x: q.x, z: q.z, w: q.w, d: q.d, y0: 0, h: Math.max(0.2, q.h - 0.12), color: PLANT.body });
      out.push({ x: q.x, z: q.z, w: q.w + 0.3, d: q.d + 0.3, y0: Math.max(0.2, q.h - 0.12), h: 0.12, color: PLANT.cap });
    } else if (q.kind === 'duct') {
      const alongX = q.w >= q.d, L = alongX ? q.w : q.d, S = alongX ? q.d : q.w, n = Math.max(1, Math.round(S / PLANT.ductEvery)), dw = Math.min(PLANT.ductW, S / (n + 0.5));
      for (let i = 0; i < n; i++) {
        const c = -S / 2 + ((i + 0.5) * S) / n, x = alongX ? q.x : q.x + c, z = alongX ? q.z + c : q.z, w = alongX ? L : dw, d = alongX ? dw : L;
        out.push({ x, z, w: alongX ? L : 0.2, d: alongX ? 0.2 : L, y0: 0, h: PLANT.railH, color: PLANT.rail });
        out.push({ x, z, w, d, y0: PLANT.railH, h: Math.max(0.2, q.h - PLANT.railH), color: PLANT.duct });
      }
    } else if (q.kind === 'condenser-row') {
      const alongX = q.w >= q.d, L = alongX ? q.w : q.d, S = alongX ? q.d : q.w, n = Math.max(1, Math.min(PLANT.maxUnits, Math.floor(L / PLANT.pitch)));
      for (let i = 0; i < n; i++) {
        const c = -L / 2 + ((i + 0.5) * L) / n;
        out.push({ x: alongX ? q.x + c : q.x, z: alongX ? q.z : q.z + c, w: alongX ? Math.min(PLANT.unitW, L / n - 0.15) : S, d: alongX ? S : Math.min(PLANT.unitW, L / n - 0.15), y0: 0, h: q.h, color: PLANT.unit });
      }
    }
  }
  return out;
}
/** the solar rects of a spec: [{ x, z, w, d }] (lot-local); each becomes planPv rows over the rect as a ring */
export const plantPvRects = (plant) => (plant || []).filter((q) => q.kind === 'pv').map((q) => ({ x: q.x, z: q.z, w: q.w, d: q.d }));
/** a rect as a ring in lot-local [x, z] points */
export const rectRing = (r) => [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
export const hasPlant = (lot) => Array.isArray(lot?.roof?.plant) && lot.roof.plant.length > 0;

/**
 * Draw a lot's roof plant on a lot-frame HF (hero.js / blocks.js / industrial.js): `deckY` is the roof deck in HF-local metres, `off` the frame's origin in lot-local metres
 * (a wing's centre: HF is centred on the main wing, the spec on the lot's oriented box). Boxes are plain bottom-anchored boxes; solar rects get the PV rows.
 */
export function drawRoofPlant(HF, M, lot, deckY, off = null) {
  const ox = off?.cx || 0, oz = off?.cz || 0, plant = lot.roof.plant;
  let n = 0;
  for (const b of plantBoxes(plant)) { HF.boxB(M.plain, b.color, b.w, b.h, b.d, b.x - ox, deckY + b.y0, b.z - oz); n++; }
  for (const r of plantPvRects(plant)) {
    for (const rw of planPv(rectRing({ ...r, x: r.x - ox, z: r.z - oz }), { share: 1, side: 'all' }, { margin: 0.3 })) {
      const xc = (rw.x0 + rw.x1) / 2, zc = (rw.z0 + rw.z1) / 2, len = rw.x1 - rw.x0, y = deckY + 0.16;
      HF.box(M.plain, PV.frame, len, 0.05, PV.depth, xc, y, zc, { rx: PV.tilt });
      HF.box(M.plain, PV.dark, len - 0.1, 0.02, PV.depth - 0.1, xc, y + 0.03, zc, { rx: PV.tilt });
      n++;
    }
  }
  return n;
}
