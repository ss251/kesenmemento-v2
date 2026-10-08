// [v6:c8c12r3] The east-shore boat yards: 浪板 (c8) and 大浦 (c12). Boats exist only on the two MOORING_ROWS quays and the inner-bay
// pontoons (rows.js, world.js), and Google Earth 2026-03-11 shows both yards busy: a fan of small boats on three finger floats at
// 浪板, boats on the launch ramp and the slipway, two ships on the slip, and workboats rafted at the 大浦 pier end. Not MOORING_ROWS
// (planMooringRows has no per-row type: it would fill the yard with 50 m tuna longliners, stern-to). An explicit list instead.
//
// Every position is read off the Earth top views (raw/ref/earth/meta8928r3/c8n and c12N, the real capture cameras: the views are
// tilted 5 degrees and not linear in the cyan 40 m grid, so each was ortho-rectified onto the ENU ground plane first; the
// boats were traced on 10..30 px/m crops) and checked against the app's own render of the same cameras. The Earth boats are 6.5..9.5 m
// (BOAT_SPECS.small is 14 m), so each hull is drawn at its measured length: `scale` on the pose (a uniform length scale, the beam
// follows the measured beam where one is given).
//
//   water boats  hulls afloat on the finger floats, checked hull-corner by hull-corner against isWater
//   dry boats    hulls on the launch ramp and hardstand (the 2026 yard keeps them on keel blocks), never on a lot
//   ships        two 22 .. 29 m vessels at the slipway of the shipyard (c8: 丸竹造船所 lot 16/58543/25068/22): one on the rails, one at the foot of the ramp
//
// Tests: test/v6-c8c12-yards.test.js. Phone / low tiers thin the small boats (the ships stay).
import * as THREE from 'three';
import { buildBoat, BOAT_SPECS } from './boats.js';
import { inPoly } from './real.js';

/** compass bearing (0 north, 90 east) of the bow -> the pose's rotY (local +Z is the bow; x east, z south) */
export const bearingToRotY = (deg) => Math.PI - (deg * Math.PI) / 180;
/** the bow bearing of a hull whose axis runs `phi` degrees from east towards north (the axis as read on the Earth rectification) and whose bow is at the west end */
const bowW = (phi) => 270 + phi;

/** The finger floats and pontoons (grey, 0.4 m proud of the water): the boats lie along them. [x, z] ends, w the width. */
export const YARD_FLOATS = [
  { id: 'c8-f1', a: [1053.3, -34.8], b: [1081.5, -48.0], w: 1.8, src: 'earth c8n: the north finger float, grey, 2 boats a side' },
  { id: 'c8-f2', a: [1059.5, -24.3], b: [1087.5, -38.8], w: 2.0, src: 'earth c8n: the middle finger float' },
  { id: 'c8-f3', a: [1075.0, -18.8], b: [1092.5, -27.0], w: 1.8, src: 'earth c8n: the south finger float' },
  { id: 'c8-p1', a: [1050.5, 0.5], b: [1071.8, 0.5], w: 5.6, src: 'earth c8n: the north grey pontoon off the 丸竹 quay (21 x 5.6 m)' },
  { id: 'c8-p2', a: [1049.5, 6.0], b: [1070.0, 6.0], w: 5.0, src: 'earth c8n: the south grey pontoon (20.5 x 5 m)' },
  { id: 'c8-p3', a: [1070.0, 3.0], b: [1086.0, 2.2], w: 1.8, src: 'earth c8n: the gangway from the pontoons to the quay' },
  { id: 'c8-s1', a: [1072.0, 29.5], b: [1092.0, 24.5], w: 3.0, src: 'earth c8n: the 小鯖 pier float (20 x 3 m)' },
];

/**
 * Small boats afloat. L the measured hull length (m), B the measured beam (optional), bow the bow bearing.
 * phi is the axis as traced (degrees from east towards north); the bows are west (the task trace: bows west to south-west).
 */
/** deck paint seen from above: the 浪板 boats are white, the 大浦 workboats grey-green (Earth #8f9a98 .. #a3aaa8) */
const WHITE_DECK = '#e4e6e1', GREY_DECK = '#97a09e';
const W = (id, x, z, L, phi, src, o = {}) => ({ id, x, z, L, bow: bowW(phi), kind: 'water', src, ...o });
export const YARD_BOATS = [
  // 浪板 water fan, three finger floats, traced boat by boat on c8n (x 1050..1090, z -47..-15)
  W('c8-a1', 1074.1, -46.25, 8.0, -30, 'c8n north float, north side'),
  W('c8-a2', 1066.0, -41.25, 9.0, -25, 'c8n north float, north side, outer'),
  W('c8-a3', 1067.75, -37.5, 7.5, -25, 'c8n north float, south side'),
  W('c8-a4', 1084.75, -44.5, 8.5, -31, 'c8n north float, inner end'),
  W('c8-a5', 1089.25, -43.75, 6.5, -33, 'c8n north float, at the ramp foot'),
  W('c8-b1', 1064.1, -27.25, 8.0, -25, 'c8n middle float, north side'),
  W('c8-b2', 1055.0, -21.25, 8.0, -22, 'c8n middle float, outer end'),
  W('c8-b3', 1066.75, -22.5, 8.5, -30, 'c8n middle float, south side'),
  W('c8-b4', 1075.75, -28.1, 7.5, -25, 'c8n middle float, north side, inner'),
  W('c8-c1', 1083.5, -24.5, 7.5, -25, 'c8n south float, north side'),
  W('c8-c2', 1085.9, -21.0, 7.5, -25, 'c8n south float, south side'),
  W('c8-c3', 1074.0, -19.25, 7.5, -30, 'c8n south float, outer, north side'),
  W('c8-c4', 1076.6, -15.0, 7.5, -30, 'c8n south float, outer, south side'),
  // the boat at the quay face in front of the shipyard, the one white hull on the water between the fan and the slip
  W('c8-q1', 1080.8, -2.9, 8.3, -12, 'c8n: one white hull alongside the quay at the pontoons'),
  // 小鯖 pier float
  W('c8-s1', 1076.4, 34.5, 7.0, -10, 'c8n: south of the slip, off the pier float'),
  W('c8-s2', 1087.75, 31.9, 7.5, -8, 'c8n: south of the slip, on the pier float'),
  W('c8-s3', 1078.75, 27.75, 6.5, -10, 'c8n: south of the slip, on the pier float, north side'),
  // 大浦 pier end (c12N): three grey workboats rafted to the pier end, bows north-west, and a white boat at its mooring
  W('c12-p', 1137.0, 457.8, 9.6, 0, 'c12N: grey workboat at the pier end, rafted', { bow: 303, B: 3.8, deck: GREY_DECK }),
  W('c12-q', 1143.8, 455.6, 11.0, 0, 'c12N: larger grey workboat, outside the raft', { bow: 303, B: 4.4, deck: GREY_DECK }),
  W('c12-r', 1144.2, 462.6, 9.5, 0, 'c12N: grey workboat against the pier face', { bow: 303, B: 4.0, deck: GREY_DECK }),
  W('c12-s', 1165.8, 460.2, 8.0, 0, 'c12N: white boat at its own mooring off the levee', { bow: 24, B: 2.9 }),
];

/** Boats dry on the 浪板 launch ramp and hardstand (Earth c8n x 1090..1106, z -39..-30: the hulls stand on keel blocks, shadows to the NNW). */
const D = (id, x, z, L, bow, src) => ({ id, x, z, L, bow, kind: 'dry', src });
export const YARD_DRY = [
  D('c8-d3', 1091.7, -38.7, 6.5, 223, 'c8n: on the ramp beside the north float'),
  D('c8-d4', 1091.5, -34.7, 8.0, 226, 'c8n: on the ramp'),
  D('c8-d5', 1092.2, -30.3, 6.5, 229, 'c8n: on the ramp, foot of the south float'),
  D('c8-d6', 1098.0, -35.3, 7.5, 18, 'c8n: hardstand row of three, bows up the yard'),
  D('c8-d7', 1101.3, -37.7, 7.5, 17, 'c8n: hardstand row of three'),
  D('c8-d8', 1105.3, -36.7, 9.0, 30, 'c8n: hardstand row of three, the biggest hull'),
];

/**
 * The two ships at the 丸竹 slipway (c8n, x 1088..1139, z 1.5..13). 'maguro' hulls drawn at the measured length (the scale is length / 50 m).
 * V1 is white, 29 x 7 m, on the rails; V2 is the longer, lower grey-white hull at the foot of the ramp (22 x 4 m).
 */
export const YARD_SHIPS = [
  { id: 'c8-v1', type: 'maguro', x: 1124.5, z: 6.4, L: 29, B: 6.6, bow: 76, kind: 'slip', src: 'c8n: white vessel on the rails, bow up the slip (ENE)', deck: '#e6e8e4' },
  { id: 'c8-v2', type: 'maguro', x: 1099.8, z: 9.4, L: 22, B: 4.4, bow: 258, kind: 'foot', src: 'c8n: grey-white hull at the foot of the ramp', deck: '#b4b8b8' },
];

const corners = (p, L, B) => {
  // hull corners + centre, bow direction (dx, dz) = (sin b, -cos b) for a compass bearing b
  const b = (p.bow * Math.PI) / 180, dx = Math.sin(b), dz = -Math.cos(b), px = dz, pz = -dx;
  return [[L / 2, 0], [-L / 2 + 1.0, B * 0.4], [-L / 2 + 1.0, -B * 0.4], [L * 0.3, B / 2], [L * 0.3, -B / 2], [0, 0], [-L * 0.3, B * 0.45], [-L * 0.3, -B * 0.45]]
    .map(([l, w]) => [p.x + dx * l + px * w, p.z + dz * l + pz * w]);
};

/** the drawn beam of a hull: the measured one, else the small boat's own proportions at the measured length */
const beamOf = (p, spec) => p.B ?? (spec.B * (p.L / spec.L) * 1.1);

/**
 * Plan the yard (pure; no three.js): water boats must have every hull corner on water, dry boats and ships none of the hull corners
 * inside a building lot, and a dry boat none on water either. Returns the placements that pass (with `skip` reasons in `rejected`).
 * opts: isWater (required), heightAt, lots ([poly]), thin (a number n: one small boat in n; true: every other), floats.
 */
export function planYards(opts = {}) {
  const isWater = opts.isWater || (() => true), heightAt = opts.heightAt || (() => 1.5), lots = opts.lots || [];
  const inLot = (x, z) => lots.some((P) => inPoly(x, z, P));
  const out = [], rejected = [];
  let i = 0;
  const thinned = (p) => { i++; return opts.thin && (opts.thin === true ? i % 2 === 0 : i % opts.thin !== 0); };
  // a hull that does not fit the app's shore where Earth has it is slid to the nearest pose that does (the app's quay edge is 5..8 m west of the
  // 2026 one at the 浪板 ramp): the smallest displacement within `reach` metres that passes `fits`, 0.5 m grid
  const slide = (p, fits, reach) => {
    if (fits(p.x, p.z)) return { x: p.x, z: p.z, moved: 0 };
    let best = null;
    for (let dx = -reach; dx <= reach; dx += 0.5) for (let dz = -reach; dz <= reach; dz += 0.5) {
      const d = Math.hypot(dx, dz); if (d > reach || (best && d >= best.moved) || !fits(p.x + dx, p.z + dz)) continue;
      best = { x: p.x + dx, z: p.z + dz, moved: d };
    }
    return best;
  };
  // two hulls never overlap: a sample point of the new hull inside the (slightly shrunk) footprint of one already placed rejects the pose
  const inside = (q, x, z) => {
    const b = (q.bow * Math.PI) / 180, dx = Math.sin(b), dz = -Math.cos(b), rx = x - q.x, rz = z - q.z;
    return Math.abs(rx * dx + rz * dz) < q.L * 0.46 && Math.abs(rx * dz - rz * dx) < q.B * 0.46;
  };
  for (const p0 of [...YARD_BOATS, ...YARD_DRY]) {
    const spec = BOAT_SPECS.small, B = beamOf(p0, spec), s = p0.L / spec.L;
    const dry = p0.kind === 'dry';
    const fits = (x, z) => {
      const cs = corners({ ...p0, x, z }, p0.L, B);
      return cs.every(([cx, cz]) => (dry ? !isWater(cx, cz) && !inLot(cx, cz) : isWater(cx, cz))) && !cs.some(([cx, cz]) => out.some((q) => q.type === 'small' && inside(q, cx, cz)));
    };
    const at = slide(p0, fits, dry ? 4 : 7);
    if (!at) { rejected.push({ id: p0.id, why: dry ? 'no dry ground' : 'not on water' }); continue; }
    if (thinned(p0)) { rejected.push({ id: p0.id, why: 'thinned (tier)' }); continue; }
    const p = { ...p0, x: at.x, z: at.z, moved: at.moved };
    const cs = corners(p, p.L, B);
    const ground = dry ? Math.max(...cs.map(([x, z]) => heightAt(x, z))) : 0;
    out.push({ ...p, B, type: 'small', scale: [B / spec.B, s, s], y: dry ? ground + spec.T * s * 0.55 + 0.32 : 0, rotY: bearingToRotY(p.bow), ground });
  }
  for (const p of YARD_SHIPS) {
    const spec = BOAT_SPECS[p.type], s = p.L / spec.L, cs = corners(p, p.L, p.B * 0.6);   // the lot test at 0.6 beam: the 2020 footprints sit 2..3 m north of the real shed edge
    if (cs.some(([x, z]) => inLot(x, z))) { rejected.push({ id: p.id, why: 'inside a lot' }); continue; }
    const ground = Math.max(...corners(p, p.L, p.B).map(([x, z]) => heightAt(x, z)));
    out.push({ ...p, scale: [p.B / spec.B, s, s], ground, y: ground + spec.T * s * 0.55 + 0.32, rotY: bearingToRotY(p.bow) });
  }
  const floats = (opts.floats || YARD_FLOATS).filter((f) => {
    const n = 8; let wet = 0;
    for (let k = 0; k <= n; k++) { const t = k / n; if (isWater(f.a[0] + (f.b[0] - f.a[0]) * t, f.a[1] + (f.b[1] - f.a[1]) * t)) wet++; }
    const ok = wet >= Math.ceil(n * 0.6); if (!ok) rejected.push({ id: f.id, why: 'float not on water', wet: wet + '/' + (n + 1) });
    return ok;
  });
  return { boats: out, floats, rejected };
}

const BLOCK = '#5d5148', FLOAT = '#aeb3b3', FLOAT_EDGE = '#7e8586';

/** Build the planned yard into the static scene. Returns { boats: [boat], floats, dry, ships, rejected }. */
export function buildYards(ctx, opts = {}) {
  const L = ctx.L;
  const isWater = opts.isWater || ((x, z) => (L.isWater ? L.isWater(x, z) : false));
  const lots = (L.LOTS || []).filter((l) => l.poly && l.poly.length > 2 && l.poly.some(([x, z]) => x > 1040 && x < 1200 && z > -80 && z < 60)).map((l) => l.poly);
  const plan = planYards({ isWater, heightAt: (x, z) => (L.heightAt ? L.heightAt(x, z) : 1.5), lots, thin: opts.thin });
  const out = { boats: [], floats: 0, dry: 0, ships: 0, rejected: plan.rejected };
  for (const p of plan.boats) {
    const boat = buildBoat(ctx, p.type, { x: p.x, y: p.y, z: p.z, rotY: p.rotY, scale: p.scale }, {
      seed: `yard|${p.id}`, deck: p.deck || WHITE_DECK, moored: true, idle: true, lights: false, glints: false, foam: p.kind === 'water',
    });
    boat.yard = { id: p.id, kind: p.kind === 'water' ? 'afloat' : p.kind };
    out.boats.push(boat);
    if (p.kind !== 'water') { cradle(ctx, p); if (p.kind === 'dry') out.dry++; }
    if (p.kind === 'slip' || p.kind === 'foot') out.ships++;
  }
  const kit = (g) => ctx.kit(g);
  const fm = ctx.mat.toon(FLOAT, { paint: 0.03 }), em = ctx.mat.toon(FLOAT_EDGE, { paint: 0.02 });
  for (const f of plan.floats) {
    const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], len = Math.hypot(dx, dz);
    const g = new THREE.Group(); g.name = 'yard-float:' + f.id; g.position.set((f.a[0] + f.b[0]) / 2, 0, (f.a[1] + f.b[1]) / 2); g.rotation.y = Math.atan2(dx, dz);
    ctx.addStatic(g); g.updateMatrixWorld(true);
    const k = kit(g);
    k.box(f.w, 0.6, len, fm, [0, 0.1, 0]);                                    // deck 0.4 m above the water, hull 0.2 m under it
    k.box(f.w + 0.1, 0.12, len + 0.1, em, [0, 0.36, 0]);                        // a darker rubbing strip at the deck edge
    k.box(Math.max(0.3, f.w - 0.5), 0.1, Math.max(0.5, len - 0.6), fm, [0, 0.44, 0]);   // the deck itself, a touch lighter inside the strip
    out.floats++;
  }
  return out;
}

/** Keel blocks (a dry hull or a ship on the slip): two timber sleepers under the keel and a pair of dark rail strips for the slipway ship. */
function cradle(ctx, p) {
  const g = new THREE.Group(); g.name = 'yard-cradle:' + p.id; g.position.set(p.x, p.ground, p.z); g.rotation.y = p.rotY;
  ctx.addStatic(g); g.updateMatrixWorld(true);
  const k = ctx.kit(g), m = ctx.mat.toon(BLOCK, { paint: 0.03 });
  const n = p.kind === 'dry' ? 3 : 6;
  for (let i = 0; i < n; i++) { const z = (-0.38 + (0.76 * i) / (n - 1)) * p.L; k.box(Math.min(1.6, p.B * 0.55), 0.35, 0.45, m, [0, 0.17, z]); }
  if (p.kind !== 'dry') for (const sx of [-1, 1]) k.box(0.3, 0.12, p.L * 1.1, ctx.mat.toon('#3f3a38', { paint: 0 }), [sx * p.B * 0.34, 0.06, 0]);
}
