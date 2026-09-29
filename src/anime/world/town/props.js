// [v3:town] Street life props in the hero zone: vending machines (Sakura's full machine: lit header, product rows,
// price rails, recycle bins, nobori) at the layout's vending spots and in front of shops, ママチャリ bicycles in
// front yards and outside shops, street trees along the wide sidewalks (autumn-tinted broadleaf clumps with iron
// tree grates), and domestic clutter: potted plants, garbage stations, buckets, polystyrene fish boxes, beer crates.
import * as THREE from 'three';
import { buildVending } from './sakura/props_vending.js';
import { promAt, PROM_VENDING } from '../harbor/stall.js';   // [v3:fix]
import { makeBicycle, BIKE_COLORS } from './sakura/vehicles_bike.js';
import { pick } from './common.js';

const stripUD = (g) => { g.traverse((o) => { o.userData = {}; }); return g; };

export function buildProps(ctx, H, { lotIdx, roadIdx, street, shopFronts, bikeSpots, heroZone }) {
  const L = ctx.L;
  const root = new THREE.Group(); root.name = 'town-props';
  const stats = { vending: 0, bikes: 0, trees: 0, clutter: 0 };
  const r = ctx.rng('town-props');
  const water = (x, z) => L.shoreDist(x, z) > -0.5;
  const free = (x, z, pad = 0.3) => !lotIdx.at(x, z, pad) && !water(x, z) && !roadIdx.covering(x, z, 0.2, null).some((q) => q.kind !== 'alley' || q.width > 3);

  // ------------------------------------------------------------------ vending machines
  const VH = {
    footprint(x, z, w, d, rot) { let min = 1e9, max = -1e9; const c = Math.cos(rot), s = Math.sin(rot); for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const g = L.heightAt(x + lx * c + lz * s, z - lx * s + lz * c); min = Math.min(min, g); max = Math.max(max, g); } return { min, max }; },
    place(x, y, z, rot) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; root.add(g); return g; },
    toWorld(x, z, rot, lx, lz) { const c = Math.cos(rot), s = Math.sin(rot); return { x: x + lx * c + lz * s, z: z - lx * s + lz * c }; },
  };
  const lineups = ['V1a', 'V1b', 'V2', 'V4'];   // four machines' worth of price rails / door art (canvas budget)
  const spots = [];
  const taken = [];
  const clear = (x, z, d) => !taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < d);
  // layout spots: face the nearest road
  for (const [i, v] of (L.SPOTS.vending || []).entries()) {
    const nr = roadIdx.nearest(v.x, v.z, 30);
    let rot = 0;
    if (nr) { const rx = nr.a[0] + (nr.b[0] - nr.a[0]) * nr.t, rz = nr.a[1] + (nr.b[1] - nr.a[1]) * nr.t; rot = Math.atan2(rx - v.x, rz - v.z); }
    spots.push({ id: 'LV' + i, x: v.x, z: v.z, rotY: rot, lineup: lineups[i % lineups.length] });
    taken.push([v.x, v.z]);
  }
  // [v3:fix] the promenade machine beside harbor's fish stall (wow frame 2: a vending machine glowing by the seawall)
  { const [px, pz] = promAt(PROM_VENDING.s, PROM_VENDING.d); spots.push({ id: 'PV0', x: px, z: pz, rotY: PROM_VENDING.rotY, lineup: 'V2' }); taken.push([px, pz]); }
  // shop fronts: a machine beside every few shops, against the facade, facing the street
  for (const [i, s] of shopFronts.entries()) {
    if (i % 4 !== 1 || spots.length > 12) continue;
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    for (const u of [s.w / 2 + 0.6, -s.w / 2 - 0.6]) {
      const x = s.x + u * c + 0.45 * sn, z = s.z - u * sn + 0.45 * c;
      if (!free(x, z, 0.1) || !clear(x, z, 6)) continue;
      spots.push({ id: 'SV' + i, x, z, rotY: s.rotY, lineup: lineups[(i * 3) % lineups.length] });
      taken.push([x, z]); break;
    }
  }
  // a few against house walls along the main streets
  for (const [i, wp] of (street.walkPaths || []).entries()) {
    if (i % 7 || wp.length < 6 || spots.length > 17) continue;
    const k = Math.floor(wp.length / 2), a = wp[k], b = wp[k + 1];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    for (const side of [1, -1]) {
      const nx = -tz / l * side, nz = tx / l * side;
      // step outward until we are 0.5 m from a building
      for (let o = 0.5; o < 3; o += 0.25) {
        const x = a[0] + nx * o, z = a[1] + nz * o;
        if (lotIdx.at(x + nx * 0.5, z + nz * 0.5, 0)) { if (free(x, z, 0.05) && clear(x, z, 12)) { spots.push({ id: 'WV' + i, x, z, rotY: Math.atan2(-nx, -nz), lineup: lineups[i % lineups.length] }); taken.push([x, z]); } break; }
      }
    }
  }
  if (spots.length) { buildVending(ctx, VH, spots); stats.vending = spots.length; }

  // ------------------------------------------------------------------ bicycles
  const bikeCols = Object.values(BIKE_COLORS);
  const bikeCache = new Map();
  const placeBike = (x, z, rot, seed, lod) => {
    const y = L.heightAt(x, z);
    const v = seed % 12, key = v + '|' + lod;
    if (!bikeCache.has(key)) bikeCache.set(key, stripUD(makeBicycle(ctx, { color: bikeCols[(v * 5) % bikeCols.length], seed: v + 1, lod, stand: 'down', basket: v % 5 ? 'wire' : 'none', contents: v % 7 === 0 ? 'groceries' : 'none', childSeat: v === 11 ? 'rear' : null, umbrella: v === 9 })));
    const b = bikeCache.get(key).clone();
    b.position.set(x, y + 0.01, z); b.rotation.y = rot;
    root.add(b); stats.bikes++;
    ctx.physics.addBox(x, z, 0.5, 1.8, rot, y, y + 1.1);
  };
  for (const s of bikeSpots.slice(0, 22)) { if (!water(s.x, s.z)) placeBike(s.x, s.z, s.rotY, s.seed % 1000, 0); }
  for (const [i, s] of shopFronts.entries()) {
    if (i % 2) continue;
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    const n = 1 + (i % 2);
    for (let k = 0; k < n; k++) {
      const u = -s.w / 2 + 0.6 + k * 0.7, x = s.x + u * c + 1.6 * sn, z = s.z - u * sn + 1.6 * c;
      if (!free(x, z, 0.1) || !clear(x, z, 0.6)) continue;
      placeBike(x, z, s.rotY + Math.PI / 2 + (k % 2 ? 0.08 : -0.06), i * 13 + k, k === 0 && i < 24 ? 1 : 0);
    }
  }

  // ------------------------------------------------------------------ street trees along the wide sidewalks
  for (const [i, wp] of (street.walkPaths || []).entries()) {
    const kind = street.walkKinds?.[i];
    if (kind !== 'sidewalk' || wp.length < 10) continue;
    let acc = 9 + (i % 7);
    for (let k = 1; k < wp.length; k++) {
      const a = wp[k - 1], b = wp[k], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc += d;
      if (acc < 19) continue;
      acc = 0;
      const x = b[0], z = b[1];
      if (lotIdx.at(x, z, 1.6) || water(x, z) || !clear(x, z, 7)) continue;
      const y = L.heightAt(x, z) + 0.15;
      const F = H.Frame.at(H.gb, x, y, z, 0);
      const tr = ctx.rng('st-tree-' + i + '-' + k);
      F.box(H.M.plain, '#6d6a66', 1.1, 0.03, 1.1, 0, 0.0, 0);
      avenueTree(H, F, 0, 0, 0, 0.85 + tr() * 0.3, tr);
      taken.push([x, z]); stats.trees++;
      ctx.physics.addCylinder(x, z, 0.25, y - 0.2, y + 3);
    }
  }

  // ------------------------------------------------------------------ domestic clutter at shop fronts and walls
  for (const [i, s] of shopFronts.entries()) {
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    const tr = ctx.rng('clutter-' + i);
    const F = H.Frame.at(H.gb, s.x, s.y, s.z, s.rotY);
    const side = tr() < 0.5 ? -1 : 1;
    const u = side * (s.w / 2 - 0.35);
    const gy = H.gy(F, u, 0.5);
    if (s.type === '鮮魚' || s.type === '乾物') {
      for (let k = 0; k < 4; k++) F.boxB(H.M.plain, k % 2 ? '#e9ecee' : '#dfe6ea', 0.62, 0.28, 0.42, u, gy + k * 0.28, 0.45 + (k % 2) * 0.02);
      F.boxB(H.M.plain, '#2f64b5', 0.6, 0.35, 0.4, u - side * 0.75, gy, 0.5);
    } else if (s.type === '酒店') {
      // beer crates (P箱): open-topped plastic crates with bottle caps, stacked 2-4 high
      for (let st = 0; st < 2; st++) {
        const cu = u - side * st * 0.5, n = 2 + ((i + st) % 3);
        for (let k = 0; k < n; k++) {
          const col = (k + st) % 3 === 0 ? '#e7c14f' : '#c43d34', y = gy + k * 0.3;
          F.boxB(H.M.plain, col, 0.46, 0.05, 0.34, cu, y, 0.45);
          F.boxB(H.M.plain, col, 0.46, 0.04, 0.34, cu, y + 0.25, 0.45);
          for (const sx of [-1, 1]) F.boxB(H.M.plain, col, 0.03, 0.29, 0.34, cu + sx * 0.215, y, 0.45);
          for (const sz of [-1, 1]) F.boxB(H.M.plain, col, 0.46, 0.29, 0.03, cu, y, 0.45 + sz * 0.155);
          if (k === n - 1) for (let b = 0; b < 6; b++) F.cyl(H.M.plain, '#6b4a2a', 0.03, 0.22, cu - 0.15 + (b % 3) * 0.15, y + 0.13, 0.45 + (b < 3 ? -0.07 : 0.07), { seg: 6 });
        }
      }
    } else {
      H.props.pot(F, u, gy, 0.4, tr, 1.3);
      if (tr() < 0.6) H.props.pot(F, u - side * 0.45, H.gy(F, u - side * 0.45, 0.4), 0.4, tr, 1.0);
    }
    if (tr() < 0.3) H.props.bucket?.(F, -u, H.gy(F, -u, 0.35), 0.35, tr);
    if (tr() < 0.25) H.props.umbrellaFolded?.(F, -u * 0.8, H.gy(F, -u * 0.8, 0.25), 0.25, tr);
    stats.clutter++;
  }
  // garbage stations (net-covered piles by the kerb) at a few junctions
  for (const [i, j] of (street.junctions || []).entries()) {
    if (i % 6 !== 3) continue;
    const a = (i * 2.4) % 6.28, x = j.x + Math.cos(a) * (j.R + 1.5), z = j.z + Math.sin(a) * (j.R + 1.5);
    if (!free(x, z, 0.5) || !clear(x, z, 3)) continue;
    const F = H.Frame.at(H.gb, x, L.heightAt(x, z), z, a);
    H.props.gomiStation?.(F, 0, 0, 0, ctx.rng('gomi' + i));
    stats.clutter++;
  }
  ctx.addStatic(root);
  return stats;
}

/** ケヤキ-like avenue tree: a stout trunk forking into limbs and a broad vase of soft leaf lobes (a few autumn-tinted). */
export function avenueTree(H, F, x, y, z, s, r) {
  const M = H.M, leaf = H.leafRaw;
  const th = 2.3 * s, trunk = '#6e5646';
  F.cyl(M.plain, trunk, 0.17 * s, th, x, y + th / 2, z, { seg: 7, rTop: 0.12 * s });
  const limbs = 3 + Math.floor(r() * 2), ends = [];
  for (let i = 0; i < limbs; i++) {
    const a = i / limbs * 6.28 + r() * 0.8, rr = (1.1 + r() * 0.6) * s, hh = th + (1.2 + r() * 0.8) * s;
    const e = [x + Math.cos(a) * rr, y + hh, z + Math.sin(a) * rr];
    F.beam(M.plain, trunk, [x, y + th - 0.2, z], e, 0.11 * s, 0.11 * s);
    ends.push(e);
  }
  const greens = ['#6f9a5a', '#7aa564', '#5f8c5c', '#86ad6a', '#6a9660'];
  const autumn = r() < 0.35 ? ['#d9853f', '#e2b54a', '#c65a3c'] : null;
  const n = 9;
  const cy = y + th + 2.4 * s, R = 2.4 * s;
  for (let i = 0; i < n; i++) {
    const top = i === 0;
    const a = i * 2.39996 + r() * 0.5, d = top ? 0 : R * (0.45 + r() * 0.25);
    const sc = (top ? 2.8 : 2.0 + r() * 0.6) * s;
    const col = autumn && r() < 0.45 ? autumn[Math.floor(r() * autumn.length)] : greens[Math.floor(r() * greens.length)];
    F.raw(M.plain, col, leaf(i % 4, 1), x + Math.cos(a) * d, cy + (top ? 0.6 * s : (r() - 0.6) * 1.2 * s), z + Math.sin(a) * d, { sx: sc, sy: sc * 0.72, sz: sc, ry: r() * 6 });
  }
}
