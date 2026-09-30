// [v3:harbor] Kesennuma's signature harbour picture: rows of tuna longliners and saury boats moored stern-to
// (bows out, nearly perpendicular to the quay, ~12 m apart) along the east quays. Traced from the aerial photo
// (data/ortho/core.jpg, GSI seamlessphoto z18): the 魚町 north-east quay holds ~17 boats between z -213 and -394,
// the quay north of the fish market ~22 boats between z 240 and 505. Decks read bright green / grey-green from above.
import * as THREE from 'three';
import { buildBoat, BOAT_SPECS } from './boats.js';
import { sagPts } from './util.js';
import { addGlint } from './lights.js';

/** Quay lines (ENU metres, from the ortho + layout QUAYS) and the stretch of each that holds a row. */
export const MOORING_ROWS = [
  { id: 'uomachi-ne', a: [481.1, -193.3], b: [598.0, -458.8], from: 22, to: 222, pitch: 11.8, skew: -0.03 },
  { id: 'market-north', a: [473.4, 237.8], b: [403.2, 508.7], from: 4, to: 274, pitch: 12.2, skew: 0.06 },
];

const TYPES = ['maguro', 'maguro', 'sanma', 'maguro', 'katsuo', 'maguro', 'sanma', 'maguro'];
const DECKS = ['#5f9e7c', '#6aa58a', '#879e93', '#5f9e7c', '#7fae9a', '#8fa39a'];

/**
 * Plan the stern-to rows (pure; no three.js): every boat is checked hull-corner by hull-corner against isWater and
 * skipped where the water is too narrow. rng(seed) must be a seeded PRNG factory (ctx.rng / mulberry32).
 * Returns [{ row, type, x, z, rotY, dx, dz, qx, qz, top, deck, deckLit, flags, seed }].
 * opts: rows (MOORING_ROWS), isWater, heightAt, max (per row), lite (quality low: every other boat).
 */
export function planMooringRows(rng, opts = {}) {
  const isWater = opts.isWater || (() => true);
  const rows = opts.rows || MOORING_ROWS;
  const out = [];
  for (const row of rows) {
    const r = rng(`rows|${row.id}`);
    const [ax, az] = row.a, [bx, bz] = row.b, len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // the water side of this quay line
    let nx = uz, nz = -ux;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (!isWater(mx + nx * 20, mz + nz * 20) && isWater(mx - nx * 20, mz - nz * 20)) { nx = -nx; nz = -nz; }
    const top = opts.heightAt ? Math.max(1.5, opts.heightAt(mx - nx * 4, mz - nz * 4)) : 2.2;
    let s = row.from, i = 0, n = 0;
    while (s <= Math.min(row.to, len) && n < (opts.max ?? 40)) {
      const type = TYPES[(i + r.int(0, 2)) % TYPES.length], S = BOAT_SPECS[type];
      i++;
      if (opts.lite && i % 2) { s += row.pitch; continue; }
      const skew = row.skew + r.range(-0.035, 0.035);
      const c = Math.cos(skew), sn = Math.sin(skew);
      const dx = nx * c - nz * sn, dz = nx * sn + nz * c;              // bow direction (outward, slightly skewed)
      const gap = 1.6 + r.range(0, 1.2);
      const qx = ax + ux * s, qz = az + uz * s;                          // stern point on the quay line
      const cx = qx + dx * (gap + S.L / 2), cz = qz + dz * (gap + S.L / 2);
      const px = dz, pz = -dx;
      const corners = [[S.L / 2, 0], [-S.L / 2, S.B / 2], [-S.L / 2, -S.B / 2], [S.L * 0.3, S.B / 2], [S.L * 0.3, -S.B / 2], [0, 0]];
      const wet = corners.every(([l, w]) => isWater(cx + dx * l + px * w, cz + dz * l + pz * w));
      if (wet) {
        out.push({ row: row.id, type, x: cx, z: cz, rotY: Math.atan2(dx, dz), dx, dz, qx, qz, top, deck: r.pick(DECKS), deckLit: r.chance(0.3), flags: type === 'katsuo' && r.chance(0.35), seed: `row|${row.id}|${n}` });
        n++;
        s += Math.max(row.pitch, S.B + 2.4) + r.range(-0.6, 0.8);
      } else s += 4;
    }
  }
  return out;
}

/** Build the planned rows: boats (static, laid up) + stern lines to the quay as wires. Returns [{ boat, row }]. */
export function buildMooringRows(ctx, opts = {}) {
  const plan = planMooringRows(ctx.rng, { isWater: opts.isWater || ctx.L?.isWater, heightAt: ctx.L?.heightAt, ...opts });
  const out = [];
  for (const p of plan) {
    const S = BOAT_SPECS[p.type];
    const boat = buildBoat(ctx, p.type, { x: p.x, y: 0, z: p.z, rotY: p.rotY }, { seed: p.seed, deck: p.deck, idle: true, deckLit: p.deckLit, glints: true, flags: p.flags });
    // stern lines: from both stern quarters to bitts on the quay edge, crossing slightly
    if (ctx.wires && opts.lines !== false) {
      const H = boat.hull, yS = H.sheer(0.02) - 0.2, hw = H.half(0.02, yS) * 0.8, zS = -S.L / 2 + 1.2;
      const toW = (lx, ly, lz) => { const v = boat.group.localToWorld(new THREE.Vector3(lx, ly, lz)); return [v.x, v.y, v.z]; };
      const px = p.dz, pz = -p.dx;
      for (const side of [1, -1]) {
        const p0 = toW(side * hw, yS, zS);
        const q = [p.qx - p.dx * 1.2 + px * side * -2.6, p.top + 0.5, p.qz - p.dz * 1.2 + pz * side * -2.6];
        ctx.wires.add(sagPts(p0, q, 0.35, 8), { width: 0.06, color: '#d8c9a2' });
      }
    }
    // night: the lit wheelhouse windows of the row shimmer on the water in front of each hull
    const bx = p.x + p.dx * (S.L / 2 + 3), bz = p.z + p.dz * (S.L / 2 + 3);    // just off the bow, toward open water
    addGlint(ctx, bx, 0, bz, '#ffd9a0', S.B * 0.28, 16, p.deckLit ? 0.95 : 0.6);
    out.push({ boat, row: p.row });
  }
  return out;
}

/** Distance from (x, z) to the nearest mooring-row quay line (used to turn those seawalls into working quays). */
export function rowDist(x, z, rows = MOORING_ROWS) {
  let best = Infinity;
  for (const { a, b } of rows) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

// ---------------------------------------------------------------------------------------------- [v3:polish] 養殖筏
// Aquaculture rafts (カキ・ホタテ筏): bamboo lattices on rows of black floats, an orange marker buoy at each end of a
// row, anchor lines slanting into the water. Static geometry (batched with the harbour, ~400 triangles a raft). Every
// raft corner is checked on water, 8 m clear of the shore.
// [v4:polish1] Only where the aerial photo shows them. The v3 line of five rafts in the middle of the 内湾 was invented:
// the GSI z18 photo (data/ortho/core.jpg) shows open water there, and the inner bay is a working port basin. The GSI
// z15 photo (data/ortho/city.jpg, 4.2 m/px) shows two raft fields outside the basin, in the channel south of 朝日町 off
// the 波路上 breakwater: dark blocks in rows ~30 m apart. RAFT_FIELDS are those blocks, measured on a 100 m grid
// (±10 m); rows run east-west, the lattices' long side north-south.
export const RAFT_FIELDS = [
  { id: 'southA', x0: 1510, x1: 1730, z0: 3598, z1: 3690, cols: 8, rows: 4 },
  { id: 'southB', x0: 1520, x1: 1790, z0: 3905, z1: 4040, cols: 9, rows: 5 },
];
export const RAFT = { w: 9, len: 15 };
/** @deprecated [v4:polish1] the v3 inner-bay line (not on the aerial photo); kept for the tests' negative check */
export const RAFT_LINE = { a: [196, 30], b: [300, 14], n: 5, w: 9, len: 15 };
export function planRafts(isWater, fields = RAFT_FIELDS) {
  const out = [], { w, len } = RAFT;
  for (const f of fields) for (let r = 0; r < f.rows; r++) {
    const z = f.rows > 1 ? f.z0 + (f.z1 - f.z0) * r / (f.rows - 1) : (f.z0 + f.z1) / 2;
    const row = [];
    for (let c = 0; c < f.cols; c++) {
      const x = f.cols > 1 ? f.x0 + (f.x1 - f.x0) * c / (f.cols - 1) : (f.x0 + f.x1) / 2;
      const ok = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]].every(([s1, s2]) => isWater(x + s2 * (w / 2 + 8), z + s1 * (len / 2 + 8)));
      if (ok) row.push({ x, z, yaw: 0, field: f.id, row: r });
    }
    out.push(...row);
  }
  return out;
}
export function buildRafts(ctx, opts = {}) {
  const plan = planRafts(opts.isWater || ctx.L.isWater, opts.fields || RAFT_FIELDS);
  if (!plan.length) return { rafts: 0 };
  const { w, len } = RAFT;
  const bamboo = ctx.mat.toon('#c9b27a', { paint: 0.06 }), bamboo2 = ctx.mat.toon('#b39b66', { paint: 0.06 });
  const floatM = ctx.mat.toon('#474d5e', { paint: 0.02 }), marker = ctx.mat.toon('#ee7a3a', { paint: 0.03 }), rope = ctx.mat.toon('#d8cba2', { paint: 0 });
  for (const p of plan) {
    const g = new THREE.Group(); g.name = 'kaki-raft'; g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw;
    ctx.addStatic(g); g.updateMatrixWorld(true);
    const k = ctx.kit(g);
    // lattice: 4 long poles, crossbars every ~1.9 m, lashed on top of the floats (0.35 m above the water)
    for (let j = 0; j < 4; j++) k.cyl(0.07, 0.07, len, j % 2 ? bamboo2 : bamboo, [-w / 2 + (j + 0.5) * (w / 4), 0.42, 0], [Math.PI / 2, 0, 0], 5);
    const nb = Math.round(len / 1.9);
    for (let j = 0; j <= nb; j++) k.cyl(0.06, 0.06, w + 0.4, j % 2 ? bamboo : bamboo2, [0, 0.36, -len / 2 + j * (len / nb)], [0, 0, Math.PI / 2], 5);
    // floats: two rows of black drums under the lattice
    for (const fx of [-w / 4, w / 4]) for (let j = 0; j < 5; j++) k.cyl(0.42, 0.42, 1.6, floatM, [fx, 0.1, -len / 2 + 1.4 + j * ((len - 2.8) / 4)], [0, 0, Math.PI / 2], 10);
    // hanging lines (the culture ropes) show as short pale stubs at the crossbars
    for (let j = 1; j < nb; j += 2) for (let q = -1; q <= 1; q += 2) k.box(0.04, 0.5, 0.04, rope, [q * w * 0.12, 0.12, -len / 2 + j * (len / nb)]);
  }
  // orange marker buoys and anchor lines at both ends of every row (along the lattice's long side, north and south)
  const kk = ctx.kit(ctx.staticRoot), ends = [];
  const rows = new Map(); for (const p of plan) { const k = p.field + ':' + p.row; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(p); }
  for (const row of rows.values()) { ends.push([row[0], -1], [row[row.length - 1], 1]); }
  for (const [p, s] of ends) {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), x = p.x + fx * s * (len / 2 + 6), z = p.z + fz * s * (len / 2 + 6);
    if (!(opts.isWater || ctx.L.isWater)(x, z)) continue;
    kk.sphere(0.55, marker, [x, 0.25, z], 12);
    kk.cyl(0.05, 0.05, 1.1, floatM, [x, 0.95, z], null, 5);
    const ex = p.x + fx * s * (len / 2), ez = p.z + fz * s * (len / 2), mx = (x + ex) / 2, mz = (z + ez) / 2, l = Math.hypot(x - ex, z - ez);
    kk.cyl(0.03, 0.03, l, rope, [mx, 0.28, mz], [0, Math.atan2(z - ez, -(x - ex)), Math.PI / 2], 4);   // Y axis laid along the line
  }
  return { rafts: plan.length };
}
