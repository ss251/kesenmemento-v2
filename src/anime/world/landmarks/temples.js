// [v4:landmarks-B] Temples, shrines and the Orthodox church of the core (docs/anime/landmarks/shrines-temples.md).
//   少林寺 (OSM 820921817) and 清護寺 (OSM 928776172): main halls on their outlines, white plaster between dark timber
//     posts on a stone base, a big 入母屋 roof in dark grey 桟瓦 tile with a 向拝 porch on the lot's street side.
//   気仙沼ハリストス正教会 (主の復活聖堂, OSM 436715760): a white church on the 魚町 hillside with a green roof, the
//     small belfry over the entrance with its green cupola and the Orthodox cross (visible from the bay).
//   一景島神社 (OSM 362542440): the dense dark grove of the former islet, the small shrine halls inside, a torii where
//     the path enters from the west. 松尾神社, the 南町 shrine 紫神社 (name verified by the Earth 2026-03-11 pin; red-brown roof) and the
//     OSM shrine nodes 愛宕神社, 大杉神社, 稲荷大明神: small halls with a torii toward the approach.
import * as THREE from 'three';
import { OSM, SPEC } from './sites.js';
import { group, obbOf, obbPt, groundSpan, pitchedRoof, prismWalls, capGeo, colliders, wallGeo, facadeMat, mapMat, textTex, FONT, nightMat, treeClump, inRing, centroid, hash } from './kit.js';

/** A torii at (x, z) facing rotY: vermilion (稲荷, most shrines) or grey stone. `s` scales the 3.6 m standard gate. */
export function torii(ctx, k, x, z, rotY, { color = '#cf4a30', s = 1 } = {}) {
  const L = ctx.L, y = L.heightAt(x, z), m = ctx.mat.toon(color, { paint: 0.03 }), dark = ctx.mat.toon('#2e2a2c', { paint: 0 });
  const G = k.group([x, y, z], rotY), kk = ctx.kit(G);
  for (const sx of [-1.35, 1.35]) { kk.cyl(0.16 * s, 0.19 * s, 3.4 * s, m, [sx * s, 1.7 * s, 0], null, 10); kk.cyl(0.24 * s, 0.24 * s, 0.35 * s, dark, [sx * s, 0.17 * s, 0], null, 10); }
  kk.box(3.5 * s, 0.22 * s, 0.28 * s, m, [0, 2.75 * s, 0]);                     // 貫
  kk.box(4.3 * s, 0.26 * s, 0.36 * s, dark, [0, 3.5 * s, 0]);                   // 笠木 (black cap)
  kk.box(4.1 * s, 0.22 * s, 0.34 * s, m, [0, 3.3 * s, 0]);                      // 島木
  kk.box(0.22 * s, 0.55 * s, 0.24 * s, m, [0, 3.0 * s, 0]);                     // 額束
  return G;
}

/** A small shrine hall (祠 / 社殿) on an oriented frame: timber walls, a copper-green or dark gable roof. */
function shrineHall(ctx, k, o, y0, { roof = '#5f8f7c', wall = '#8a6a4e', h = 2.6 } = {}) {
  const t = (c, p) => ctx.mat.toon(c, p);
  const G = k.group([o.cx, y0, o.cz], o.rotY), kk = ctx.kit(G);
  kk.boxB(o.w + 0.6, 0.5, o.d + 0.6, t('#b9b5aa', { paint: 0.06 }), [0, 0, 0]);
  kk.boxB(o.w, h, o.d, t(wall, { paint: 0.04 }), [0, 0.5, 0]);
  const R = pitchedRoof({ cx: 0, cz: 0, w: o.w, d: o.d, rotY: 0, ux: 0, uz: 1 }, 0.5 + h, { kind: 'gable', pitch: 0.75, over: 0.55, along: 'w' });
  kk.mesh(R.roof, t(roof, { paint: 0.05 })); kk.mesh(R.fascia, t('#3c3a38', { paint: 0 })); if (R.gables) kk.mesh(R.gables, t(wall, { paint: 0.03 }));
  kk.box(o.w * 0.6, 0.12, 0.06, t('#d8b04a', { paint: 0 }), [0, 0.5 + h * 0.8, o.d / 2 + 0.04]);   // the gilded frieze
  return G;
}

/** [v4:polish3] The lots built as temple halls here (and skipped by town and explore). */
export function templeLots(L) { return L.LOTS.filter((l) => l.kind === 'temple' && l.zone !== 'far' && !l.landmark && l.poly?.length > 2); }   // hero + mid (far temples stay town/far.js boxes)

/**
 * A temple main hall on footprint `poly`: stone base, white plaster between dark timber on an inset body, the 入母屋
 * roof with ridge and 鬼瓦 ends, a 向拝 porch with stair, offering box and name plaque toward `front` ([x, z], the
 * street point). Scaled down for small halls (a 地蔵堂 of 3 x 4 m keeps a roof over its walls). sp = { wall, roof, wood }.
 */
const _hallMats = new WeakMap();
export function templeHall(ctx, k, poly, sp, { name = null, front = null } = {}) {
  const L = ctx.L;
  // materials shared by every hall of the same colours (the module's material budget: test/v4-landmarks-b.test.js)
  let cache = _hallMats.get(ctx); if (!cache) _hallMats.set(ctx, (cache = new Map()));
  const t = (c, o) => { const key = c + '|' + JSON.stringify(o || {}); let m = cache.get(key); if (!m) cache.set(key, (m = ctx.mat.toon(c, o))); return m; };
  const o = obbOf(poly), gs = groundSpan(L, poly);
  const sc = Math.max(0.3, Math.min(1, Math.min(o.w, o.d) / 12));   // 1 for a 12 m hall and up
  const y0 = gs.hi + 0.6 * sc, eave = y0 + Math.max(2.4, 4.2 * sc);
  const pk = 'plaster|' + sp.wall + '|' + sp.wood;
  const plaster = cache.get(pk) || cache.set(pk, facadeMat(ctx, 'temple', { W: 128, H: 128, draw: (g, W, H) => {
    g.fillStyle = sp.wall; g.fillRect(0, 0, W, H);
    g.fillStyle = sp.wood; g.fillRect(0, 0, 10, H); g.fillRect(0, H * 0.72, W, 8); g.fillRect(0, H * 0.06, W, 6);
    g.fillStyle = '#6b5644'; for (let x = 24; x < W - 14; x += 18) g.fillRect(x, H * 0.32, 3, H * 0.38);   // lattice doors (蔀戸) in the lower bays
  }, win: [0.15, 0.3, 0.95, 0.7], lit: 0.25 })).get(pk);
  // stone base and the hall body inset from the eaves
  k.mesh(prismWalls(poly, gs.lo - 0.5, y0, { tile: 2 }), t('#b3ada1', { paint: 0.07 }));
  k.mesh(capGeo(poly, y0, { tile: 2 }), t('#c7c1b5', { paint: 0.05 }));
  const inset = 3.2 * sc;
  const body = { ...o, w: Math.max(1.2, o.w - inset), d: Math.max(1.2, o.d - inset) };
  const br = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => obbPt(o, a * body.w / 2, b * body.d / 2));
  k.mesh(wallGeo(br, y0, eave, { tu: 1.8, tv: eave - y0, yRef: y0 }), plaster);
  // the 入母屋 roof: big overhangs, a steep hip below the small gable, a ridge with 鬼瓦 ends
  const R = pitchedRoof(body, eave, { kind: 'irimoya', pitch: 0.72, over: 1.9 * sc });
  const tile = t(sp.roof, { paint: 0.05 });
  k.mesh(R.roof, tile); k.mesh(R.fascia, t('#2f3236', { paint: 0 })); if (R.gables) k.mesh(R.gables, t('#e9e4d8', { paint: 0.03 }));
  const rl = Math.max(0.6, R.D - R.W * 0.55) * 2;
  const rc = k.group([o.cx, eave + R.rise + 0.25 * sc, o.cz], o.rotY); const kr = ctx.kit(rc);
  kr.box(0.55 * sc, 0.5 * sc, rl + 0.4 * sc, t('#34373b', { paint: 0 }), [0, 0, 0]);
  for (const s of [-1, 1]) kr.box(0.7 * sc, 0.9 * sc, 0.4 * sc, t('#34373b', { paint: 0 }), [0, 0.2 * sc, s * (rl / 2 + 0.2 * sc)]);
  // 向拝: the porch roof on the street side, on two timber posts, with the stair (halls of 6 m and more)
  if (Math.min(o.w, o.d) >= 5.5) {
    const fr = front ? [front[0] - o.cx, front[1] - o.cz] : [0, 1];
    const lx = fr[0] * o.uz - fr[1] * o.ux, lz = fr[0] * o.ux + fr[1] * o.uz;
    const alongD = Math.abs(lz) / o.d > Math.abs(lx) / o.w, sgn = Math.sign(alongD ? lz : lx) || 1;
    const pc = alongD ? obbPt(o, 0, sgn * (o.d / 2 + 0.2)) : obbPt(o, sgn * (o.w / 2 + 0.2), 0);
    const pry = o.rotY + (alongD ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2));
    const Pg = k.group([pc[0], y0, pc[1]], pry), kp = ctx.kit(Pg);
    const pw = Math.min(6.2, (alongD ? o.w : o.d) * 0.6);
    for (const x of [-pw * 0.35, pw * 0.35]) kp.boxB(0.3, Math.max(2.1, 3.6 * sc), 0.3, t(sp.wood, { paint: 0.03 }), [x, 0, 1.2]);
    kp.box(pw, 0.35, 3.4, tile, [0, Math.max(2.4, 3.9 * sc), 0.6], [0.35, 0, 0]);
    for (let i = 0; i < 4; i++) kp.boxB(Math.min(3.4, pw * 0.6), 0.15, 0.35, t('#b3ada1', { paint: 0.05 }), [0, -0.15 * (i + 1), 2.5 + i * 0.35]);
    kp.box(1.2, 0.8, 0.9, t('#6b4a34', { paint: 0.02 }), [0, 0.4, -0.6]);   // the offering box (賽銭箱)
    if (name) kp.box(0.8, 1.1, 0.05, mapMat(ctx, 'toon', '#ffffff', textTex(ctx, name, { w: 128, h: 320, color: '#f0e6c8', bg: '#3b2c22', font: FONT.brush || FONT.serif }), { paint: 0 }), [0, Math.max(1.9, 3.1 * sc), 0.2]);
  }
  colliders(ctx, br, gs.lo - 1, eave);
  return { x: o.cx, z: o.cz, top: eave + R.rise };
}

export function buildTemples(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  const { k } = group(ctx, 'lmB-temples');
  const out = {};
  const lotOf = (site) => L.LOTS.find((l) => l.landmark === site);
  // ---------------------------------------------------------------- temple main halls
  for (const id of ['shorinji', 'seigoji']) {
    const lot = lotOf(id);
    out[id] = templeHall(ctx, k, OSM[id].poly, SPEC[id], { name: id === 'shorinji' ? '少林寺' : '清護寺', front: lot ? [lot.front.x, lot.front.z] : null });
  }
  // [v4:polish3] every other GSI / OSM temple building of the core (lot.kind 'temple': 観音寺, 法玄寺, 青龍禅寺 and the
  // halls round them) gets the same 入母屋 hall on its real footprint, its roof in the aerial photo's colour; town and
  // explore leave these lots to it (town/hero.js, town/mid.js)
  out.lots = [];
  for (const lot of templeLots(L)) {
    try {
      const roof = lot.roof?.photo || lot.roof?.color || '#50565c';
      const r = templeHall(ctx, k, lot.poly, { wall: '#efece4', roof, wood: '#5a4636' }, { name: lot.name || null, front: lot.front ? [lot.front.x, lot.front.z] : null });
      out.lots.push({ id: lot.id, name: lot.name || null, ...r });
    } catch (e) { console.warn('[landmarks] temple lot', lot.id, e); }
  }
  // ---------------------------------------------------------------- 気仙沼ハリストス正教会
  {
    const sp = SPEC.church, poly = OSM.church.poly, o = obbOf(poly), gs = groundSpan(L, poly), y0 = gs.hi + 0.3;
    const white = t(sp.wall, { paint: 0.03 }), green = t(sp.roof, { paint: 0.04 });
    const G = k.group([o.cx, y0, o.cz], o.rotY), kk = ctx.kit(G);
    // [v4:polish1] the stone base reaches the lowest ground under the whole church (the hillside falls ~2 m toward the
    // apse, which used to float): sampled over the nave, the apse drum (to local z -15.1) and the belfry
    let lo = gs.lo;
    for (let lx = -6; lx <= 6; lx += 3) for (let lz = -15.5; lz <= 11.6; lz += 1.5) { const [wx, wz] = obbPt(o, lx, lz); lo = Math.min(lo, L.heightAt(wx, wz)); }
    const baseH = y0 - lo + 0.5, stoneBase = t('#b9b5aa', { paint: 0.06 });
    kk.boxB(o.w + 0.4, baseH, o.d, stoneBase, [0, -baseH, 0]);
    kk.cyl(3.8, 3.8, baseH, stoneBase, [0, -baseH / 2, -11.5], null, 14);
    kk.boxB(3.4, baseH, 3.4, stoneBase, [0, -baseH, 9.9]);
    // the nave (z −11.5..4.3) and the narthex (4.3..8.4); gable roofs in green copper
    for (const [z0, z1, w, h] of [[-11.5, 4.3, 11.0, 5.4], [4.3, 8.4, 8.0, 4.6]]) {
      kk.boxB(w, h, z1 - z0, white, [0, 0, (z0 + z1) / 2]);
      const R = pitchedRoof({ cx: 0, cz: (z0 + z1) / 2, w, d: z1 - z0, rotY: 0, ux: 0, uz: 1 }, h, { kind: 'gable', pitch: 0.85, over: 0.45 });
      kk.mesh(R.roof, green); kk.mesh(R.fascia, t('#e9e8e2', { paint: 0 })); if (R.gables) kk.mesh(R.gables, white);
      for (let z = z0 + 1.5; z < z1 - 1; z += 2.6) for (const x of [-w / 2 - 0.02, w / 2 + 0.02]) kk.box(0.06, 1.8, 0.8, nightMat(ctx, '#6f889a', '#ffd9a0', 1.2), [x, 2.4, z]);
    }
    // the apse at the altar end (−z): a half-drum with a green half-cone roof
    kk.cyl(3.6, 3.6, 4.4, white, [0, 2.2, -11.5], null, 14);
    kk.cyl(0.4, 4.1, 1.8, green, [0, 5.3, -11.5], null, 14);
    // the belfry over the entrance (+z tip, 2.8 m square): a white tower, the green cupola and the cross (八端十字架)
    kk.boxB(3.0, 9.0, 3.0, white, [0, 0, 9.9]);
    kk.boxB(3.3, 0.3, 3.3, t('#e9e8e2', { paint: 0 }), [0, 9.0, 9.9]);
    kk.cyl(0.2, 1.7, 2.2, green, [0, 10.4, 9.9], null, 8);
    const cup = kk.sphere(0.75, green, [0, 11.9, 9.9], 10); cup.scale.set(1.5, 1.9, 1.5);
    const gold = t('#d9b659', { paint: 0 });
    kk.box(0.1, 2.0, 0.1, gold, [0, 13.9, 9.9]); kk.box(0.9, 0.08, 0.08, gold, [0, 14.3, 9.9]); kk.box(0.5, 0.08, 0.08, gold, [0, 14.65, 9.9]); kk.box(0.6, 0.08, 0.08, gold, [0, 13.55, 9.9], [0, 0, 0.35]);
    kk.box(1.3, 2.3, 0.1, t('#6c4f3b', { paint: 0.02 }), [0, 1.15, 11.43]);
    colliders(ctx, poly, gs.lo - 1, y0 + 9);
    out.church = { x: o.cx, z: o.cz, top: y0 + 14.7 };
  }
  // ---------------------------------------------------------------- 一景島神社: the grove, the shrine halls, the torii
  {
    const ring = OSM.ikkeijima.poly, c = centroid(ring);
    let n = 0;
    for (let x = c[0] - 32; x <= c[0] + 32; x += 5.2) for (let z = c[1] - 32; z <= c[1] + 32; z += 5.2) {
      const h = hash(`${Math.round(x)}|${Math.round(z)}`), jx = ((h & 255) / 255 - 0.5) * 3, jz = (((h >> 8) & 255) / 255 - 0.5) * 3;
      const px = x + jx, pz = z + jz; if (!inRing(px, pz, ring)) continue;
      // keep the path from the west and the clearing round the halls open
      if (Math.abs(pz - (c[1] + 2)) < 2.6 && px < c[0] - 4) continue;
      if (Math.hypot(px - c[0] + 2, pz - c[1] + 4) < 9) continue;
      const s = 1.05 + ((h >> 16) & 255) / 255 * 0.5, conifer = ((h >> 24) & 3) === 0;
      treeClump(ctx, k, px, ctx.L.heightAt(px, pz), pz, s, { leaf: conifer ? '#2f4a36' : '#3c5a3a', leafLit: '#4d6e45', trunk: '#4e4238', conifer });
      n++;
    }
    for (const lot of L.LOTS) if (lot.landmark === 'ikkeijima') { const o = { ...lot.obb, ux: Math.sin(lot.obb.rotY), uz: Math.cos(lot.obb.rotY) }; shrineHall(ctx, k, o, L.heightAt(o.cx, o.cz) + 0.2, { roof: '#5d8a78', h: lot.area > 18 ? 2.6 : 1.8 }); }
    torii(ctx, k, 528.5, 1095.5, -Math.PI / 2, { color: '#cf4a30' });
    out.ikkeijima = { trees: n };
  }
  // ---------------------------------------------------------------- small shrines with a torii
  const small = [
    { id: 'matsuo', poly: OSM.matsuo.poly },
    { id: 'minamiShrine', poly: OSM.minamiShrine.poly, roof: '#8e5a55', name: '紫神社' },  // Earth 2026-03-11 pins 紫神社 on this hall; red-brown roof (Earth #7c5f6e / #895e64, GSI #927e77)
    { id: 'atago', at: [-502, -452], name: '愛宕神社' },          // OSM node 7113790365
    { id: 'osugi', at: [-120, -776], name: '大杉神社' },           // OSM node 7113790419
    { id: 'inari', at: [-276, -285], name: '稲荷大明神' },         // OSM node 7448263222
    { id: 'itsukushima', at: [1131.9, 742], name: '厳島神社' },    // 大浦: c12.json newLot ovr:c12:itsukushima (kind shrine); Earth 2026-03-11 pins it on the wooded mound beside the quay
  ];
  for (const s of small) {
    let o;
    if (s.poly) o = obbOf(s.poly);
    else { o = { cx: s.at[0], cz: s.at[1], w: 3.2, d: 3.6, rotY: 0, ux: 0, uz: 1 }; }
    // face downhill (the approach climbs to the hall)
    let best = null; for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4, h = L.heightAt(o.cx + Math.sin(r) * 10, o.cz + Math.cos(r) * 10); if (!best || h < best.h) best = { h, r }; }
    const face = best.r;
    const oo = { cx: o.cx, cz: o.cz, w: Math.min(o.w, o.d), d: Math.max(o.w, o.d), rotY: face, ux: Math.sin(face), uz: Math.cos(face) };
    shrineHall(ctx, k, { ...oo, w: Math.max(oo.w, 2.6), d: Math.max(oo.d, 3) }, L.heightAt(o.cx, o.cz) + 0.1, { roof: s.roof || (s.id === 'inari' ? '#4f5258' : '#5f8f7c') });
    torii(ctx, k, o.cx + Math.sin(face) * 7, o.cz + Math.cos(face) * 7, face, { color: s.id === 'matsuo' || s.id === 'atago' ? '#b9b5aa' : '#cf4a30', s: 0.8 });
    out[s.id] = { x: o.cx, z: o.cz };
  }
  return out;
}
