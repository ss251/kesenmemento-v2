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
