// [v4:explore] Street life for a streamed kit tile (the hero zone's own props are town/props.js): ママチャリ at the
// bike spots the kit's front yards and shops leave, a vending machine beside one shop front in three, and the
// shop-front clutter of the trade (polystyrene fish boxes at fishmongers, beer crates at liquor shops, potted plants
// elsewhere). Everything goes through the kit batcher (H.gb) or into groups the capture routes into the tile.
import * as THREE from 'three';
import { buildVending } from '../town/sakura/props_vending.js';
import { makeBicycle, BIKE_COLORS } from '../town/sakura/vehicles_bike.js';

const bikeCache = new Map();
const stripUD = (g) => { g.traverse((o) => { o.userData = {}; }); return g; };

export function tileProps(ctx, H, out, { lotIdx, roadIdx, seed = '' }) {
  const L = ctx.L;
  const root = new THREE.Group(); root.name = 'explore-props';
  const r = ctx.rng('explore-props|' + seed);
  const stats = { bikes: 0, vending: 0, clutter: 0 };
  const water = (x, z) => L.shoreDist(x, z) > -0.5;
  const free = (x, z, pad = 0.3) => !lotIdx.at(x, z, pad) && !water(x, z) && !roadIdx.covering(x, z, 0.2, null).some((q) => q.kind !== 'alley' || q.width > 3);
  const taken = [];
  const clear = (x, z, d) => !taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < d);

  // ---- bicycles
  const cols = Object.values(BIKE_COLORS);
  const bike = (x, z, rot, s, lod) => {
    const y = L.heightAt(x, z), v = Math.abs(s) % 12, key = v + '|' + lod;
    if (!bikeCache.has(key)) bikeCache.set(key, stripUD(makeBicycle(ctx, { color: cols[(v * 5) % cols.length], seed: v + 1, lod, stand: 'down', basket: v % 5 ? 'wire' : 'none', contents: v % 7 === 0 ? 'groceries' : 'none', childSeat: v === 11 ? 'rear' : null, umbrella: v === 9 })));
    const b = bikeCache.get(key).clone();
    b.position.set(x, y + 0.01, z); b.rotation.y = rot;
    root.add(b); stats.bikes++; taken.push([x, z]);
    ctx.physics.addBox(x, z, 0.5, 1.8, rot, y, y + 1.1);
  };
  for (const s of out.bikeSpots.slice(0, 14)) if (!water(s.x, s.z) && clear(s.x, s.z, 0.8)) bike(s.x, s.z, s.rotY, s.seed % 1000, 0);
  for (const [i, s] of out.shopFronts.entries()) {
    if (i % 2) continue;
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    const u = -s.w / 2 + 0.6, x = s.x + u * c + 1.6 * sn, z = s.z - u * sn + 1.6 * c;
    if (free(x, z, 0.1) && clear(x, z, 0.6)) bike(x, z, s.rotY + Math.PI / 2 - 0.06, i * 13, 1);
  }

  // ---- vending machines: beside one shop front in three, against the facade, facing the street
  const spots = [];
  for (const [i, s] of out.shopFronts.entries()) {
    if (i % 3 !== 1 || spots.length >= 3) continue;
    const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    for (const u of [s.w / 2 + 0.6, -s.w / 2 - 0.6]) {
      const x = s.x + u * c + 0.45 * sn, z = s.z - u * sn + 0.45 * c;
      if (!free(x, z, 0.1) || !clear(x, z, 5)) continue;
      spots.push({ id: 'XV' + seed + i, x, z, rotY: s.rotY, lineup: ['V1a', 'V1b', 'V2', 'V4'][(i * 3 + spots.length) % 4] }); taken.push([x, z]); break;
    }
  }
  if (spots.length) {
    const VH = {
      footprint(x, z, w, d, rot) { let min = 1e9, max = -1e9; const c = Math.cos(rot), s = Math.sin(rot); for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const g = L.heightAt(x + lx * c + lz * s, z - lx * s + lz * c); min = Math.min(min, g); max = Math.max(max, g); } return { min, max }; },
      place(x, y, z, rot) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; root.add(g); return g; },
      toWorld(x, z, rot, lx, lz) { const c = Math.cos(rot), s = Math.sin(rot); return { x: x + lx * c + lz * s, z: z - lx * s + lz * c }; },
    };
    buildVending(ctx, VH, spots); stats.vending = spots.length;
  }

  // ---- shop-front clutter by trade
  for (const [i, s] of out.shopFronts.entries()) {
    const tr = ctx.rng('xclutter|' + seed + '|' + i);
    const F = H.Frame.at(H.gb, s.x, s.y, s.z, s.rotY);
    const side = tr() < 0.5 ? -1 : 1, u = side * (s.w / 2 - 0.35), gy = H.gy(F, u, 0.5);
    if (s.type === '鮮魚' || s.type === '乾物') {
      for (let k = 0; k < 4; k++) F.boxB(H.M.plain, k % 2 ? '#e9ecee' : '#dfe6ea', 0.62, 0.28, 0.42, u, gy + k * 0.28, 0.45 + (k % 2) * 0.02);
      F.boxB(H.M.plain, '#2f64b5', 0.6, 0.35, 0.4, u - side * 0.75, gy, 0.5);
    } else if (s.type === '酒店') {
      for (let k = 0; k < 3; k++) { const col = k % 3 === 0 ? '#e7c14f' : '#c43d34'; F.boxB(H.M.plain, col, 0.46, 0.29, 0.34, u, gy + k * 0.3, 0.45); }
    } else {
      H.props.pot(F, u, gy, 0.4, tr, 1.3);
      if (tr() < 0.6) H.props.pot(F, u - side * 0.45, H.gy(F, u - side * 0.45, 0.4), 0.4, tr, 1.0);
    }
    stats.clutter++;
  }
  // pots along the fronts of houses that open straight onto a lane
  void r;
  ctx.addStatic(root);
  return stats;
}
