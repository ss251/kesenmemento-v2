// [v4:data] Match OSM buildings, OSM POIs and GSI Anno facilities to the GSI footprints (the lots). Pure (tested).
import { pointInRing } from "./osm.js";

function bboxOf(ring) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; }
function segDist2(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  const ex = a[0] + t * dx - px, ez = a[1] + t * dz - pz; return ex * ex + ez * ez;
}
/** Distance from a point to a polygon (0 inside). */
export function ringDist(x, z, ring) {
  if (pointInRing(x, z, ring)) return 0;
  let d = Infinity; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) d = Math.min(d, segDist2(x, z, ring[j], ring[i]));
  return Math.sqrt(d);
}

/** Spatial index over footprints [{ id, poly }] (cell 40 m). */
export class FootIndex {
  constructor(feats, cell = 40) {
    this.cell = cell; this.map = new Map(); this.feats = feats;
    feats.forEach((f, i) => {
      const b = (f.bb = bboxOf(f.poly));
      for (let a = Math.floor(b[0] / cell); a <= Math.floor(b[2] / cell); a++) for (let c = Math.floor(b[1] / cell); c <= Math.floor(b[3] / cell); c++) {
        const k = a * 100003 + c; let l = this.map.get(k); if (!l) this.map.set(k, (l = [])); l.push(i);
      }
    });
  }
  /** feature indices whose bbox touches the box */
  query(x0, z0, x1, z1) {
    const out = new Set(), c = this.cell;
    for (let a = Math.floor(x0 / c); a <= Math.floor(x1 / c); a++) for (let b = Math.floor(z0 / c); b <= Math.floor(z1 / c); b++) {
      const l = this.map.get(a * 100003 + b); if (!l) continue;
      for (const i of l) { const bb = this.feats[i].bb; if (bb[0] <= x1 && bb[2] >= x0 && bb[1] <= z1 && bb[3] >= z0) out.add(i); }
    }
    return [...out];
  }
  /** index of the footprint containing (x, z), else the nearest within maxD (or -1) */
  at(x, z, maxD = 0) {
    let best = -1, bd = Infinity;
    for (const i of this.query(x - maxD, z - maxD, x + maxD, z + maxD)) {
      const d = ringDist(x, z, this.feats[i].poly);
      if (d < bd) { bd = d; best = i; if (d === 0) break; }
    }
    return bd <= maxD ? best : -1;
  }
}

/** Overlap of two rings by sampling: { inter, a, b } in m² (a, b = the ring areas as sampled). */
export function overlapArea(ra, rb, step = null) {
  const A = bboxOf(ra), B = bboxOf(rb);
  const x0 = Math.min(A[0], B[0]), z0 = Math.min(A[1], B[1]), x1 = Math.max(A[2], B[2]), z1 = Math.max(A[3], B[3]);
  const s = step ?? Math.max(0.25, Math.sqrt(((x1 - x0) * (z1 - z0)) / 4000));
  let ia = 0, ib = 0, both = 0;
  for (let z = z0 + s / 2; z < z1; z += s) for (let x = x0 + s / 2; x < x1; x += s) {
    const inA = x >= A[0] && x <= A[2] && z >= A[1] && z <= A[3] && pointInRing(x, z, ra);
    const inB = x >= B[0] && x <= B[2] && z >= B[1] && z <= B[3] && pointInRing(x, z, rb);
    if (inA) ia++; if (inB) ib++; if (inA && inB) both++;
  }
  const k = s * s; return { inter: both * k, a: ia * k, b: ib * k };
}

/**
 * OSM building polygons -> GSI footprints. A footprint takes the OSM building that covers the largest share of it,
 * when that share is >= 50 % (an OSM outline drawn round a whole block of GSI parts tags every part), or when the IoU is
 * >= 0.35. -> Map(footprint index -> { osm, tags, iou, cover })
 */
export function matchBuildings(index, osmBuildings) {
  const best = new Map();
  for (const ob of osmBuildings) {
    if (!ob.ring) continue;
    const b = bboxOf(ob.ring);
    for (const i of index.query(b[0], b[1], b[2], b[3])) {
      const f = index.feats[i];
      const o = overlapArea(f.poly, ob.ring);
      if (!o.inter) continue;
      const cover = o.inter / (o.a || 1), iou = o.inter / (o.a + o.b - o.inter || 1);
      if (cover < 0.5 && iou < 0.35) continue;
      const score = iou + cover * 0.5;
      const prev = best.get(i);
      if (!prev || score > prev.score) best.set(i, { osm: ob.osm, tags: ob.tags, iou: Math.round(iou * 100) / 100, cover: Math.round(cover * 100) / 100, score });
    }
  }
  return best;
}

/** Points -> the footprint that contains them (or the nearest within maxD). -> Map(index -> [item...]) */
export function assignPoints(index, items, maxD, pos = (it) => it.p) {
  const out = new Map();
  for (const it of items) {
    const [x, z] = pos(it);
    const i = index.at(x, z, maxD);
    if (i < 0) continue;
    let l = out.get(i); if (!l) out.set(i, (l = [])); l.push(it);
  }
  return out;
}

/** The biggest footprint within r of a point (a school or hospital symbol stands in the grounds, not on the hall). */
export function biggestNear(index, x, z, r) {
  let best = -1, ba = 0;
  for (const i of index.query(x - r, z - r, x + r, z + r)) {
    const f = index.feats[i]; const d = ringDist(x, z, f.poly);
    if (d > r) continue;
    const a = f.area ?? 0; if (a > ba) { ba = a; best = i; }
  }
  return best;
}
