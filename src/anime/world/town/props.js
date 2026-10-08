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
  const stats = { vending: 0, bikes: 0, trees: 0, clutter: 0, overrides: 0 };
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
  // [v4:integrate] no machine on the 五十鈴神社 approach (the torii at the 東浜街道 bend and the stair behind it)
  const shrineAt = [L.SPOTS.isuzuTorii, L.SPOTS.isuzuShrine].filter(Boolean);
  const clear = (x, z, d) => !taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < d) && !shrineAt.some((p) => Math.hypot(p.x - x, p.z - z) < 14);
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
  // [v4:overrides] vending machines placed by data/anime/overrides (layout PROPS): the real positions from the imagery
  const OVP = (L.PROPS || []).filter((p) => L.shoreDist(p.x, p.z) <= 0);
  for (const [i, p] of OVP.entries()) if (p.type === 'vending') { spots.push({ id: 'OV' + i, x: p.x, z: p.z, rotY: p.rotY, lineup: lineups[i % lineups.length], ...(p.y != null ? { y: p.y } : {}) }); taken.push([p.x, p.z]); }
  if (spots.length) { buildVending(ctx, VH, spots); stats.vending = spots.length; }

  // ------------------------------------------------------------------ bicycles
  const bikeCols = Object.values(BIKE_COLORS);
  const bikeCache = new Map();
  const placeBike = (x, z, rot, seed, lod, y = L.heightAt(x, z)) => {   // [v4:overrides] y: a placed bike on a deck
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
  // ------------------------------------------------------------------ [v4:overrides] the other placed props
  // bikes, street trees, benches (a slatted park bench, seat toward local +z) and bollards, anywhere in the town
  for (const [i, p] of OVP.entries()) {
    // the surface: the op's y (a harbour deck or seawall garden is above the terrain; town builds before harbor), else the terrain
    const y = p.y ?? L.heightAt(p.x, p.z), tr = ctx.rng('ovr-prop-' + i + '-' + p.type);
    if (p.type === 'bike') placeBike(p.x, p.z, p.rotY, 17 + i * 7, 0, y);
    else if (p.type === 'tree') {
      const F = H.Frame.at(H.gb, p.x, y + 0.15, p.z, 0);
      F.box(H.M.plain, '#6d6a66', 1.1, 0.03, 1.1, 0, 0.0, 0);
      avenueTree(H, F, 0, 0, 0, 0.85 + tr() * 0.3, tr);
      ctx.physics.addCylinder(p.x, p.z, 0.25, y - 0.2, y + 3); stats.trees++;
    } else if (p.type === 'bench') {
      const F = H.Frame.at(H.gb, p.x, y, p.z, p.rotY);
      for (const u of [-0.7, 0.7]) { F.boxB(H.M.plain, '#4a4d55', 0.06, 0.42, 0.44, u, 0, 0); F.boxB(H.M.plain, '#4a4d55', 0.06, 0.4, 0.05, u, 0.42, -0.2); }
      for (let k = 0; k < 3; k++) F.boxB(H.M.plain, '#9a7350', 1.7, 0.035, 0.12, 0, 0.42, -0.14 + k * 0.14);
      for (let k = 0; k < 2; k++) F.boxB(H.M.plain, '#9a7350', 1.7, 0.1, 0.03, 0, 0.58 + k * 0.14, -0.22);
      ctx.physics.addBox(p.x, p.z, 1.7, 0.5, p.rotY, y, y + 0.8);
    } else if (p.type === 'busStop') {   // [sys:17] a placed bus stop (face = the compass bearing the plate looks to)
      buildBusStop(H, H.Frame.at(H.gb, p.x, y, p.z, p.rotY), {}); ctx.physics.addCylinder(p.x, p.z, 0.12, y, y + 2.4);
    } else if (p.type === 'brtStop') {
      buildBrtStop(ctx, H, root, { x: p.x, z: p.z, rotY: p.rotY, id: 'ovr' + i }, y); ctx.physics.addCylinder(p.x, p.z, 0.3, y, y + 2.6);
    } else if (p.type === 'bollard') {
      const F = H.Frame.at(H.gb, p.x, y, p.z, 0);
      F.cyl(H.M.plain, '#8f949a', 0.09, 0.8, 0, 0.4, 0, { seg: 8 });
      F.boxB(H.M.plain, '#e0b43c', 0.19, 0.06, 0.19, 0, 0.62, 0);
      ctx.physics.addCylinder(p.x, p.z, 0.12, y, y + 0.8);
    }
    stats.overrides++;
  }
  // ------------------------------------------------------------------ [sys:17] bus stops and BRT stations
  // L.BUS_STOPS: every OSM bus stop on the left kerb of the road a bus uses (scripts/anime/busstops.js)
  stats.busStops = 0; stats.brtStops = 0;
  for (const b of L.BUS_STOPS || []) {
    if (L.shoreDist(b.x, b.z) > -0.3 || Math.hypot(b.x - L.ZONES.mid.cx, b.z - L.ZONES.mid.cz) > L.ZONES.mid.r + 150) continue;
    const y = L.heightAt(b.x, b.z);
    if (b.kind === 'brt') { buildBrtStop(ctx, H, root, b, y); stats.brtStops++; ctx.physics.addCylinder(b.x, b.z, 0.3, y, y + 2.6); }
    else { buildBusStop(H, H.Frame.at(H.gb, b.x, y, b.z, b.rotY), b); stats.busStops++; ctx.physics.addCylinder(b.x, b.z, 0.12, y, y + 2.4); }
  }
  ctx.addStatic(root);
  return stats;
}

/**
 * [sys:17] A city bus stop (ミヤコーバス, 岩手県交通): a grey steel pole 2.3 m tall with a round sign plate on top (white face, dark ring)
 * and a timetable box under it, the plate facing the oncoming bus (local +z). A shelter (roofed bench bay) only where OSM says
 * shelter=yes. F: a Frame at the foot of the pole.
 */
export function buildBusStop(H, F, o) {
  const M = H.M;
  F.cyl(M.plain, '#9ea4a9', 0.035, 2.3, 0, 1.15, 0, { seg: 6 });
  F.boxB(M.concrete, '#b9b7b0', 0.5, 0.12, 0.5, 0, 0, 0, { uv: { world: 2 } });                   // the foot (a small concrete base)
  F.cyl(M.plain, '#2f4d78', 0.255, 0.03, 0, 2.0, 0.04, { rx: Math.PI / 2, seg: 16 });                 // the ring
  F.cyl(M.plain, '#f4f4ef', 0.215, 0.034, 0, 2.0, 0.045, { rx: Math.PI / 2, seg: 16 });               // the white face
  F.boxB(M.plain, '#d9dde0', 0.34, 0.46, 0.05, 0, 1.12, 0.05);                                       // the timetable box
  F.boxB(M.plain, '#f4f4ef', 0.28, 0.36, 0.01, 0, 1.17, 0.08);
  if (o.shelter === 'yes') {
    // a roofed bay beside the pole: back panel, a slatted bench, and a flat roof on two posts (1.6 m wide)
    const sx = 1.3;
    for (const u of [sx - 0.8, sx + 0.8]) F.boxB(M.plain, '#6d747c', 0.06, 2.3, 0.06, u, 0, -0.5);
    F.boxB(M.plain, '#8e949b', 1.8, 0.07, 1.2, sx, 2.3, -0.2);
    F.boxB(M.glass ?? M.plain, '#bcd2dc', 1.5, 1.6, 0.03, sx, 0.4, -0.52);
    F.boxB(M.plain, '#9a7350', 1.2, 0.04, 0.35, sx, 0.45, -0.38);
  }
}
/**
 * [sys:17] A BRT station (大船渡線 / 気仙沼線 BRT, JR 東日本), after the Commons photos of 内湾入口 (2022, 2024): a slim red panel totem about
 * 2.5 m tall carrying the station name, with a solar-panel cap and timetable and map panels; a bench beside it; a kerbed concrete
 * platform strip 6 m long and 1.6 m wide along the busway. o: { x, z, rotY (the panel faces the oncoming bus), name, nameEn }.
 */
export function buildBrtStop(ctx, H, root, o, y) {
  const F = H.Frame.at(H.gb, o.x, y, o.z, o.rotY), M = H.M;
  // kerbed platform strip along the busway (the road is on local +z)
  F.boxB(M.concrete, '#bdbcb5', 6.0, 0.16, 1.6, 0, -0.02, 0, { uv: { world: 2 } });
  F.boxB(M.concrete, '#a9a8a1', 6.0, 0.05, 0.14, 0, 0.14, -0.73, { uv: { world: 2 } });                // the back kerb
  // totem: red slim box (JR 東日本 red), white name board, solar cap
  F.boxB(M.plain, '#c4262e', 0.5, 2.4, 0.12, 0, 0.14, 0);
  F.boxB(M.plain, '#e9ecee', 0.44, 0.7, 0.02, 0, 1.55, 0.07);                                          // the name board
  F.boxB(M.plain, '#e9ecee', 0.34, 0.42, 0.02, 0, 0.95, 0.07);                                         // the timetable panel
  F.boxB(M.plain, '#dfe3e6', 0.34, 0.3, 0.02, 0, 0.58, 0.07);                                          // the area map
  F.box(M.plain, '#23304a', 0.62, 0.05, 0.4, 0, 2.58, 0, { rx: -0.2 });                                // the solar panel cap, tilted to the sun
  // a bench beside the totem (slatted, back toward the road's far side)
  for (const u of [1.6, 2.8]) F.boxB(M.plain, '#4a4d55', 0.05, 0.42, 0.42, u, 0.14, 0);
  F.boxB(M.plain, '#9a7350', 1.4, 0.04, 0.4, 2.2, 0.56, 0);
  F.boxB(M.plain, '#9a7350', 1.4, 0.3, 0.03, 2.2, 0.62, -0.2);
  // the station name on the board: one small canvas texture per stop (the BRT has a handful)
  if (o.name && ctx.tex?.draw) {
    const tex = ctx.tex.draw(256, 128, (g, w, h) => {
      g.fillStyle = '#f4f4ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4262e'; g.fillRect(0, 0, w, 14);
      g.fillStyle = '#1f2630'; g.textAlign = 'center'; g.textBaseline = 'middle';
      ctx.tex.fitText(g, o.name, w / 2, 62, w - 20, 44, ctx.tex.FONTS.sans, 800);
      if (o.nameEn) ctx.tex.fitText(g, o.nameEn, w / 2, 106, w - 20, 16, ctx.tex.FONTS.en || ctx.tex.FONTS.sans, 500);
    }, { key: 'town-brt-' + o.id });
    const geo = new THREE.PlaneGeometry(0.44, 0.7);
    const mesh = new THREE.Mesh(geo, ctx.mat.toon('#ffffff', { map: tex, paint: 0.0 }));
    const p = F.w(0, 1.55, 0.085); mesh.position.copy(p); mesh.rotation.y = o.rotY; mesh.name = 'brt-name'; root.add(mesh);
    ctx.noOutline?.(mesh);
  }
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
  const autumn = r() < 0.06 ? ['#d9853f', '#e2b54a', '#c65a3c'] : null;   // [v5:fix1] 6 % of the avenue trees (was 35 %)
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
