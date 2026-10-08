// [v6:c6r3] An open multi-storey car park (OSM building=parking / amenity=parking + parking=multi-storey: 入沢 / 魚町 hillside, way w775150096).
// It was derived as a closed 'warehouse' box with rib cladding and random roof boxes. Earth 2026-03-11 shows what it is: open decks stepping
// up the slope, white stall lines on the grey deck and a green top deck. So the builder draws an open structure: a plinth where the hill
// falls away, a floor slab per deck with a spandrel / parapet round its edge, columns, no windows and no ribs, and on the top deck the
// stall lines and the parked cars. Pure planning here (no three.js: test/v6-carpark.test.js); mid.js turns the plan into geometry.
//
// What is NOT known: the number of decks and their heights (Earth is 2.5D, OSM has no building:levels for w775150096), so lot.storeys and
// lot.height stay the derived placeholders until a ground photo measures them. The plan follows whatever the lot says.
import { localPoly, simplifyRing, insetRing, ccw, inRing } from './wings.js';
import { carColor } from './carcolors.js';

export const CARPARK = {
  slab: 0.3,        // thickness of a deck slab (its edge shows as the fascia)
  parapet: 0.9,     // spandrel / parapet wall above a deck's floor along the edge
  parapetT: 0.25,   // parapet thickness (inset of the inner face)
  column: 0.4,      // square concrete columns
  colPitch: 5.0,    // column spacing along the edge and across the deck
  stallW: 2.5,      // a stall is 2.5 m wide ...
  stallD: 5.0,      // ... and 5.0 m deep (the usual 普通車 bay)
  aisle: 5.5,       // two-way aisle between stall rows
  line: 0.1,        // painted line width
  edge: 0.55,       // stalls stay this far from the parapet's inner face
  carL: 4.0, carW: 1.7,
  fill: 0.55,       // share of the stalls that hold a car
  lineCol: '#f1f0ea', floorCol: '#8f8d89', underCol: '#6a6c6b',
};

const hash = (seed, k) => { let x = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/**
 * Plan of an open car park on a lot, in the lot's OBB frame (x along obb.w, z along obb.d, y above the lowest deck's floor).
 * -> { ring, inner (the roof deck's floor outline, inset by the parapet), decks: [{ k, y }] (floor slab tops, the last is the roof deck),
 *      fh (deck pitch), top (roof deck floor y), columns: [[x, z]], stalls: [{ cx, cz }], lines: [{ cx, cz, w, d }] (painted rects, local x / z extents), cars: [{ cx, cz, w, d, nose: [nx, nz], color }] }
 * Stalls are laid in rows along the lot's longer side; a car's w / d are its local x / z extents and `nose` the unit direction it faces.
 */
export function carparkPlan(lot) {
  const C = CARPARK, o = lot.obb;
  const ring = ccw(simplifyRing(localPoly(lot), 0.2));
  const inner = insetRing(ring, C.parapetT);
  const n = Math.max(1, Math.min(8, Math.round(lot.storeys || 2)));
  const fh = Math.max(2.2, (lot.height || n * 2.8) / n);
  const decks = []; for (let k = 1; k <= n; k++) decks.push({ k, y: k * fh });
  const top = n * fh;

  // bounding box of the deck, columns: along the edge and on a grid inside
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const columns = [];
  const edgeIn = insetRing(ring, 0.5);
  for (let i = 0; i < edgeIn.length; i++) {
    const a = edgeIn[i], b = edgeIn[(i + 1) % edgeIn.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = Math.max(1, Math.round(len / C.colPitch));
    for (let j = 0; j < m; j++) { const t = j / m, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; if (inRing(x, z, ring)) columns.push([x, z]); }   // (a mitred corner of a concave ring can land outside)
  }
  const gridIn = insetRing(ring, 2.2);
  for (let x = Math.ceil(x0 / C.colPitch) * C.colPitch; x < x1; x += C.colPitch) for (let z = Math.ceil(z0 / C.colPitch) * C.colPitch; z < z1; z += C.colPitch) if (inRing(x, z, gridIn)) columns.push([x, z]);

  // stall rows on the roof deck, along the longer side of the box. Bands of depth stallD: the first faces +b (its back is on the parapet), then an
  // aisle, then a back-to-back pair (one facing -b, one +b), an aisle, and so on, so every nose faces an aisle.
  const alongX = o.w >= o.d;
  const A = (p) => (alongX ? p[0] : p[1]), B = (p) => (alongX ? p[1] : p[0]);
  const ab = (a, b) => (alongX ? [a, b] : [b, a]);   // (along, across) -> local [x, z]
  const room = insetRing(inner, C.edge);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of inner) { a0 = Math.min(a0, A(p)); a1 = Math.max(a1, A(p)); b0 = Math.min(b0, B(p)); b1 = Math.max(b1, B(p)); }
  const inside = (a, b) => { const [x, z] = ab(a, b); return inRing(x, z, room); };
  const stalls = [], lines = [], cars = [];
  const bands = [];
  for (let cur = b0 + C.edge, i = 0; cur + C.stallD <= b1 - C.edge + 1e-6; i++) {
    bands.push({ ba: cur, bb: cur + C.stallD, face: i % 2 === 0 ? 1 : -1 });
    cur += C.stallD + (i % 2 === 0 ? C.aisle : 0);
  }
  const nS = Math.max(0, Math.floor((a1 - a0 - 2 * C.edge) / C.stallW));
  const aStart = a0 + C.edge + ((a1 - a0 - 2 * C.edge) - nS * C.stallW) / 2;
  bands.forEach(({ ba, bb, face }, ri) => {
    const valid = [], mb = (ba + bb) / 2, back = face > 0 ? ba : bb;
    for (let i = 0; i < nS; i++) {
      const sa = aStart + i * C.stallW, ea = sa + C.stallW, ma = (sa + ea) / 2;
      const ok = inside(sa + 0.05, ba + 0.05) && inside(ea - 0.05, ba + 0.05) && inside(sa + 0.05, bb - 0.05) && inside(ea - 0.05, bb - 0.05) && inside(ma, mb);
      valid.push(ok);
      if (!ok) continue;
      const [cx, cz] = ab(ma, mb);
      stalls.push({ cx, cz });
      if (hash(lot.seed, ri * 131 + i) < C.fill) {
        const [px, pz] = ab(ma, mb - face * 0.1);   // parked a little toward the back
        const [w, d] = alongX ? [C.carW, C.carL] : [C.carL, C.carW], nose = alongX ? [0, face] : [face, 0];
        cars.push({ cx: px, cz: pz, w, d, nose, color: carColor(hash(lot.seed, 7000 + ri * 131 + i)) });
      }
    }
    // the side lines (shared by neighbours: drawn once) and the back line of every valid stall
    for (let i = 0; i <= nS; i++) {
      if (!(valid[i - 1] || valid[i])) continue;
      const [cx, cz] = ab(aStart + i * C.stallW, mb), [w, d] = alongX ? [C.line, C.stallD] : [C.stallD, C.line];
      lines.push({ cx, cz, w, d });
    }
    for (let i = 0; i < nS; i++) if (valid[i]) {
      const [cx, cz] = ab(aStart + (i + 0.5) * C.stallW, back), [w, d] = alongX ? [C.stallW, C.line] : [C.line, C.stallW];
      lines.push({ cx, cz, w, d });
    }
  });
  return { ring, inner, n, fh, decks, top, columns, stalls, lines, cars, alongX };
}
