// [v4:landmarks-A] 神明崎 as measured (harbor/real.js SHINMEI; sheets docs/anime/landmarks/shinmeizaki.md, ukimido.md,
// isuzu-jinja.md):
//   浮見海道   the vermilion walkway over the sea round the tip (the author's scale model shows the same red rim), from
//              the foot of the west revetment round 浮見堂 and up the east seawall; deck on piles, 朱 rails both sides
//   浮見堂     the small open 四阿 (宝形造, light-grey roof, 朱 posts) on the tip's seawall line, half over the water
//   恵比寿像   the 3rd-generation standing Ebisu (2020, 1.8 m) holding a bonito, right foot forward (kesennuma-kanko)
//   五十鈴神社 a cream-painted RC hall on the 16 m knoll (its GSI footprint), light-grey roofs, reached from the vermilion
//              torii at the 東浜街道 bend by a steep stone stair; stone lanterns and komainu
//   猪狩神社   the small precinct shrine and its torii; 社務所 the long single-storey building on the ridge
//   revetment  the wide sloping concrete revetment on the west side (the inner bay's east edge)
// Returns { pavilion, walk: [[x, z], ...], deckY, ring, shore, perches, lanterns }.
import * as THREE from 'three';
import { SHINMEI } from './real.js';
import { resample, sweepSlab, worldKit, barAlong, seg, capGeo, prismWalls, obbOf, paint } from './lmkit.js';
import { nightMat, addGlint, registry } from './lights.js';
import { vTextTex, FONT, mapMat, textTex } from './util.js';
import { toriiInto } from './shrine.js';

const C = {
  shu: '#d2462f', shuLit: '#e05a3a', shuDark: '#a93a28', deck: '#9a6a55', pile: '#b9b6ad', wall: '#c4c6bf', wallDark: '#a4a69f',
  roof: '#9aa3a2', roofDark: '#7f898a', cream: '#efe6cc', creamShade: '#ddd2b4', stone: '#b9b5aa', stoneDark: '#8e8a80',
  bronze: '#6f5a3e', bronzeLit: '#9a7d52', gold: '#d9b44a', black: '#3b3740', wood: '#8a6446', hall: '#6a4a42', white: '#f1ede2',
};

export const RING_DECK = 2.75;   // walkway deck (T.P.): the tip ground is T.P. 3.5, the sea side sits a little lower

export function buildShinmei(ctx, opts = {}) {
  const L = ctx.L, S = SHINMEI;
  const { k } = worldKit(ctx, 'shinmeizaki4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = {
    shu: t(C.shu, { paint: 0.04 }), shuDark: t(C.shuDark, { paint: 0.04 }), deck: t(C.deck, { paint: 0.06 }), pile: t(C.pile, { paint: 0.08 }),
    wall: t(C.wall, { paint: 0.08 }), wallDark: t(C.wallDark, { paint: 0.08 }), roof: t(C.roof, { paint: 0.05, side: 'double' }), roofDark: t(C.roofDark, { paint: 0.04 }),
    cream: t(C.cream, { paint: 0.05 }), creamShade: t(C.creamShade, { paint: 0.05 }), stone: t(C.stone, { paint: 0.1 }), stoneDark: t(C.stoneDark, { paint: 0.1 }),
    bronze: t(C.bronze, { paint: 0.04 }), gold: t(C.gold, { paint: 0.03 }), black: t(C.black, { paint: 0 }), wood: t(C.wood, { paint: 0.08 }), hall: t(C.hall, { paint: 0.05, side: 'double' }),
    white: t(C.white, { paint: 0.03 }),
  };
  const out = { perches: [], lanterns: [], seats: [] };
  const deckY = RING_DECK;

  // ============================================================== 浮見海道 (the red ring walkway)
  const ring = resample(S.ring, 1.5);
  for (const p of ring) p.y = deckY;
  const W = 2.4, hw = W / 2;   // + = sea side (right of travel: the ring runs west -> tip -> east with the land on the left)
  k.mesh(sweepSlab(ring, { l0: -hw, l1: hw, th: 0.28, tile: 2 }), m.deck);
  k.mesh(sweepSlab(ring.map((p) => ({ ...p, y: p.y - 0.28 })), { l0: -hw - 0.08, l1: hw + 0.08, th: 0.22, tile: 2 }), m.shuDark);   // 朱 fascia
  // land side: a concrete seawall face from the deck into the sea, and a fill up to the rock line (no gap under the deck)
  k.mesh(sweepSlab(ring.map((p) => ({ ...p, y: p.y - 0.05 })), { l0: -hw - 1.2, l1: -hw, th: 7.5, tile: 3 }), m.wall);
  // behind it, the rock / seawall fill reaches inland to the peninsula's own ground (no strip of sea behind the walk)
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, rx = -a.uz, rz = a.ux;
    let d = hw + 1.2; while (d < hw + 14 && L.isWater(mx - rx * d, mz - rz * d)) d += 0.5;
    const w = d + 1.5 - (hw + 1.2); if (w < 0.6) continue;
    const c = hw + 1.2 + w / 2, s = seg([a.x, a.z], [b.x, b.z]);
    k.box(w, 7.2, s.len + 0.9, m.wallDark, [mx - rx * c, deckY - 0.45 - 3.6, mz - rz * c], [0, s.rotY, 0]);
  }
  // rails: posts every 1.5 m, a top rail and a mid rail, 擬宝珠 caps every 12 m (sea side); a lower rail on the land side
  const railTop = 0.95;
  for (const [l, top] of [[hw - 0.06, railTop], [-hw + 0.06, 0.75]]) {
    k.mesh(sweepSlab(ring.map((p) => ({ ...p, y: p.y + top + 0.06 })), { l0: l - 0.07, l1: l + 0.07, th: 0.12, tile: 2 }), m.shu);
    k.mesh(sweepSlab(ring.map((p) => ({ ...p, y: p.y + top * 0.5 })), { l0: l - 0.04, l1: l + 0.04, th: 0.06, tile: 2 }), m.shu);
    ring.forEach((p, i) => {
      const x = p.x - p.uz * l, z = p.z + p.ux * l;
      k.box(0.1, top, 0.1, m.shu, [x, p.y + top / 2, z]);
      if (l > 0 && i % 8 === 0) k.sphere(0.08, m.gold, [x, p.y + top + 0.14, z], 8);
    });
  }
  // piles under the sea edge every 4.5 m
  for (let i = 0; i < ring.length; i += 3) { const p = ring[i], x = p.x - p.uz * (hw - 0.25), z = p.z + p.ux * (hw - 0.25); k.cyl(0.16, 0.18, deckY + 3.5, m.pile, [x, deckY - 0.3 - (deckY + 3.5) / 2, z], null, 8); }
  // warm footlights along the rail (lit until 22:00), their glints on the water
  for (let i = 4; i < ring.length; i += 10) { const p = ring[i], x = p.x - p.uz * (hw - 0.2), z = p.z + p.ux * (hw - 0.2); k.box(0.18, 0.14, 0.18, nightMat(ctx, '#cfc6b4', '#ffcf94', 1.8), [x, p.y + 0.25, z]); registry(ctx)?.point({ x, y: p.y + 0.3, z, color: '#ffcf94', size: 0.4, intensity: 1.3, mode: 'lamps' }); addGlint(ctx, x - p.uz * 1.5, 0, z + p.ux * 1.5, '#ffb070', 0.45, 6, 0.8); }
  if (ctx.physics?.addWalkBox) for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1], s = seg([a.x, a.z], [b.x, b.z]); ctx.physics.addWalkBox(s.x, s.z, W, s.len + 0.15, s.rotY, deckY, deckY - 1.5); }
  out.ring = S.ring; out.deckY = deckY;

  // ============================================================== 浮見堂
  {
    const [px, pz] = S.pavilion;
    // square to the ring where it passes (the tip runs E-W here)
    const g = k.group([px, 0, pz], 0), kk = ctx.kit(g);
    const size = 4.8, fy = deckY + 0.1, roofY = fy + 2.85;
    kk.box(size + 1.0, 0.24, size + 1.0, m.deck, [0, fy - 0.1, 0]);
    kk.box(size + 1.1, 0.16, size + 1.1, m.shuDark, [0, fy - 0.3, 0]);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      kk.box(0.24, 2.85, 0.24, m.shu, [x * size / 2, fy + 1.42, z * size / 2]);
      kk.cyl(0.2, 0.22, deckY + 3.4, m.pile, [x * size / 2, fy - 0.4 - (deckY + 3.4) / 2, z * size / 2], null, 8);
    }
    for (const s of [-1, 1]) { kk.box(size + 0.3, 0.24, 0.18, m.shu, [0, roofY - 0.12, s * size / 2]); kk.box(0.18, 0.24, size + 0.3, m.shu, [s * size / 2, roofY - 0.12, 0]); kk.box(size + 0.3, 0.14, 0.14, m.shu, [0, fy + 2.15, s * size / 2]); }
    // railings on the three sea sides (open to the walkway on the north), benches inside
    for (const [a, b] of [[[-1, 1], [1, 1]], [[1, -1], [1, 1]], [[-1, -1], [-1, 1]]]) {
      const A = [a[0] * size / 2, a[1] * size / 2], B = [b[0] * size / 2, b[1] * size / 2];
      barAlong(kk, A, B, fy + 0.8, 0.1, 0.1, m.shu); barAlong(kk, A, B, fy + 0.4, 0.07, 0.07, m.shu);
    }
    kk.box(size - 0.8, 0.08, 0.45, m.deck, [0, fy + 0.44, size / 2 - 0.45]);
    // 宝形造 pyramid roof, light grey, a slight upswept eave and a 宝珠 finial
    const roof = new THREE.ConeGeometry((size + 2.0) / Math.SQRT2, 2.3, 4, 1, true); roof.rotateY(Math.PI / 4);
    kk.mesh(roof, m.roof, [0, roofY + 1.15, 0]);
    kk.box(size + 2.05, 0.16, size + 2.05, m.roofDark, [0, roofY + 0.02, 0]);
    kk.cyl(0.16, 0.26, 0.4, m.roofDark, [0, roofY + 2.35, 0], null, 10);
    kk.sphere(0.2, m.gold, [0, roofY + 2.7, 0], 10);
    const plaque = vTextTex(ctx, '浮見堂', { w: 96, h: 256, color: '#e8d9a8', bg: '#3b3740', font: FONT.brush, border: '#d9b44a' });
    kk.plane(0.42, 1.1, mapMat(ctx, 'toon', '#ffffff', plaque, { paint: 0, nightGlow: 0.4 }), [0, roofY - 0.72, -size / 2 - 0.14], [0, Math.PI, 0]);
    const lamp = nightMat(ctx, '#f1e6cf', '#ffb870', 2.2);
    for (const s of [-1, 1]) {
      const p = [s * (size / 2 - 0.1), roofY - 0.55, -size / 2 - 0.05];
      kk.cyl(0.18, 0.18, 0.42, lamp, p, null, 10); kk.cyl(0.2, 0.2, 0.05, m.black, [p[0], p[1] + 0.23, p[2]], null, 10); kk.cyl(0.2, 0.2, 0.05, m.black, [p[0], p[1] - 0.23, p[2]], null, 10);
      const w = new THREE.Vector3(px + p[0], p[1], pz + p[2]); out.lanterns.push(w); addGlint(ctx, w.x, 0, w.z + 3, '#ffb070', 0.6, 8, 0.9);
      registry(ctx)?.lantern({ x: w.x, y: w.y, z: w.z, real: true, lightI: 5.5 });
    }
    if (ctx.physics?.addWalkBox) ctx.physics.addWalkBox(px, pz, size + 1.0, size + 1.0, 0, fy + 0.02, fy - 1.5);
    out.pavilion = { x: px, z: pz, y: fy, group: g };
    out.perches.push([px, roofY + 2.9, pz], [px + size / 2, fy + 0.9, pz + size / 2]);
  }

  // ============================================================== 立ち恵比寿像 (2020)
  {
    const [ex, ez] = S.ebisu, g = k.group([ex, deckY, ez - 1.2], 0), kk = ctx.kit(g);   // faces the bay (south, local +Z)
    kk.box(1.5, 0.35, 1.5, m.stoneDark, [0, 0.18, 0]); kk.box(1.1, 1.0, 1.1, m.stone, [0, 0.85, 0]);
    const pl = textTex(ctx, '恵比寿像', { w: 256, h: 64, color: '#3b3740', bg: '#d8d2c2', font: FONT.serif, weight: 700 });
    kk.plane(0.8, 0.2, mapMat(ctx, 'toon', '#ffffff', pl, { paint: 0 }), [0, 0.95, 0.56]);
    const b = 1.35, st = m.bronze;
    // legs (right foot stepping forward), robe, sash, round face with a smile, 烏帽子 hat, the rod over the right shoulder
    kk.box(0.2, 0.55, 0.26, st, [-0.14, b + 0.28, -0.05]); kk.box(0.2, 0.55, 0.26, st, [0.15, b + 0.26, 0.16], [0.25, 0, 0]);
    kk.mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.75, 10), st, [0, b + 0.85, 0]);
    kk.box(0.72, 0.1, 0.5, m.gold, [0, b + 0.95, 0.02]);
    kk.sphere(0.25, st, [0, b + 1.43, 0.02], 12);
    kk.mesh(new THREE.ConeGeometry(0.16, 0.34, 8), m.black, [0.02, b + 1.72, -0.05], [-0.4, 0, 0]);
    kk.box(0.16, 0.5, 0.16, st, [0.36, b + 1.05, 0.05], [0, 0, 0.5]);
    kk.cyl(0.02, 0.025, 2.0, m.wood, [0.55, b + 1.9, -0.1], [0.3, 0, -0.5], 5);
    // the bonito under the left arm: a navy back, silver belly with the dark stripes, the forked tail
    const fish = kk.group([-0.42, b + 1.0, 0.12], 0.3);
    const fk = ctx.kit(fish);
    fk.mesh(new THREE.SphereGeometry(0.16, 10, 8), t('#3c4d6b', { paint: 0 }), [0, 0.04, 0], null, [1, 0.9, 3.3]);
    fk.mesh(new THREE.SphereGeometry(0.15, 10, 8), t('#b9c3cc', { paint: 0 }), [0, -0.03, 0], null, [1.02, 0.7, 3.2]);
    fk.mesh(new THREE.ConeGeometry(0.16, 0.25, 4), t('#3c4d6b', { paint: 0 }), [0, 0, -0.6], [-Math.PI / 2, 0, 0], [0.3, 1, 1.4]);
    out.ebisu = { x: ex, z: ez - 1.2 };
  }

  // ============================================================== 五十鈴神社: the cream RC hall on the knoll
  {
    const poly = [[359.7, -127], [356.1, -127.3], [355.1, -117.2], [358.7, -116.9], [358.6, -115.6], [365.4, -114.9], [365.5, -116.3], [368.2, -116.1], [369.1, -125.6], [367.5, -125.7], [367.7, -127.8], [366.2, -127.9], [366.8, -134.5], [360.4, -135.1]];
    const gy = Math.min(...poly.map(([x, z]) => L.heightAt(x, z))), fy = gy + 0.9, eave = fy + 3.6;
    // stone platform, cream walls, a band of dark wood lattice under the eaves
    k.mesh(prismWalls(poly, gy - 1.2, fy, { tile: 2 }), m.stone);
    k.mesh(capGeo(poly, fy, { tile: 2 }), m.stoneDark);
    const body = [[356.3, -126.8], [355.5, -117.8], [367.7, -116.6], [368.5, -125.3]];      // the main hall (wide part)
    const porch = [[360.9, -127.2], [366.9, -127.8], [366.4, -134.2], [360.9, -134.5]];    // the front hall facing the stair
    for (const P of [body, porch]) { k.mesh(prismWalls(P, fy, eave, { tile: 2 }), m.cream); k.mesh(capGeo(P, eave - 0.02, { down: true }), m.creamShade); }
    // gabled roofs, light grey (ortho), ridge along the approach axis
    const roofOn = (P, rise, ov) => {
      const o = obbOf(P), hwid = o.w / 2 + ov, hl = o.d / 2 + ov, ang = Math.atan2(rise, o.w / 2);
      const g = k.group([o.cx, eave, o.cz], o.rotY), kk = ctx.kit(g);
      for (const sd of [-1, 1]) kk.box(hwid / Math.cos(ang), 0.25, hl * 2, m.roof, [sd * hwid / 2, rise * (1 - (hwid / 2) / (o.w / 2)) + 0.05, 0], [0, 0, -sd * ang]);
      kk.box(0.4, 0.35, hl * 2 + 0.2, m.roofDark, [0, rise + 0.15, 0]);
      for (const zz of [-1, 1]) { const sh = new THREE.Shape([new THREE.Vector2(-o.w / 2, 0), new THREE.Vector2(o.w / 2, 0), new THREE.Vector2(0, rise)]); kk.mesh(new THREE.ShapeGeometry(sh), ctx.mat.toon(C.cream, { paint: 0.05, side: 'double' }), [0, 0, zz * o.d / 2]); }
      return o;
    };
    roofOn(body, 2.6, 0.9); const po = roofOn(porch, 2.2, 0.8);
    // the entrance on the porch's north face: doors, 賽銭箱, bell rope, shimenawa, the 社号 plaque
    const front = [(360.9 + 366.4) / 2, -134.6], fg = k.group([front[0], fy, front[1]], Math.PI + po.rotY * 0), fk = ctx.kit(fg);
    fk.box(2.4, 2.4, 0.1, m.wood, [0, 1.2, 0.05]);
    fk.box(1.3, 0.7, 0.6, m.wood, [0, 0.35, 1.0]);
    const plq = vTextTex(ctx, '五十鈴神社', { w: 96, h: 320, color: '#e8d9a8', bg: '#3b3530', font: FONT.brush, border: '#d9b44a' });
    fk.plane(0.5, 1.5, mapMat(ctx, 'toon', '#ffffff', plq, { paint: 0 }), [0, 3.0, 0.12]);
    fk.sphere(0.18, m.gold, [0, 2.45, 0.5], 10);
    // stone lanterns + komainu flanking the entrance
    for (const s of [-1, 1]) { stoneLantern(ctx, fk, m, s * 3.2, -gy + L.heightAt(front[0] + s * 3.2, front[1] - 3) - 0.9 + 0.9 - 0.9, 3); fk.box(0.9, 0.7, 0.9, m.stone, [s * 1.9, 0.35 - 0.9 + (L.heightAt(front[0] + s * 1.9, front[1] - 2.2) - gy), 2.2]); fk.rbox(0.5, 0.75, 0.7, 0.2, m.stoneDark, [s * 1.9, 1.05 - 0.9 + (L.heightAt(front[0] + s * 1.9, front[1] - 2.2) - gy), 2.2]); }
    if (ctx.physics?.addBox) { for (const P of [body, porch]) { const o = obbOf(P); ctx.physics.addBox(o.cx, o.cz, o.w, o.d, o.rotY, fy, eave + 3); } }
    const lw = new THREE.Vector3(front[0], fy + 1.4, front[1] - 3); out.lanterns.push(lw); registry(ctx)?.lantern({ x: lw.x, y: lw.y, z: lw.z });
    out.shrine = { x: 362.4, z: -125, y: fy, footprint: poly };   // [v4:integrate] the rendered hall outline (accuracy.mjs)
    out.perches.push([362, eave + 2.9, -121]);
  }

  // ============================================================== the approach: torii at the road bend, the steep stair
  {
    // [v4:polish3] the torii stands at the foot of the stair, across the stone approach and clear of the footway
    // r12723 that runs down the peninsula's west side (it stood on that path's centre-line, one post in the lane, with
    // an axis-aligned slab across it). Aerial z18: the grove edge and the stair foot at 345-347, -145.
    const stairA = [346.5, -144.6], stairB = [362.8, -137.3], ax = seg(stairA, stairB);
    const [tx, tz] = S.torii, SPAN = 3.6;
    const bx = Math.cos(ax.rotY), bz = -Math.sin(ax.rotY);   // the beam (local x) in world space
    const feet = [-1, 1].map((sd) => L.heightAt(tx + bx * sd * SPAN / 2, tz + bz * sd * SPAN / 2));
    const ty = Math.min(...feet);   // the higher foot's post simply stands a little deeper in the ground
    const tg = k.group([tx, ty, tz], ax.rotY), tk = ctx.kit(tg);   // the approach runs along local z, up to the hall
    toriiInto(ctx, tk, { h: 5.2, span: SPAN });
    const plq = vTextTex(ctx, '五十鈴神社', { w: 96, h: 320, color: '#f1e3b8', bg: '#3b3740', font: FONT.brush, border: '#d9b44a' });
    const pm = mapMat(ctx, 'toon', '#ffffff', plq, { paint: 0 });
    tk.plane(0.42, 1.25, pm, [0, 5.2 * 0.89, 0.18]); tk.plane(0.42, 1.25, pm, [0, 5.2 * 0.89, -0.18], [0, Math.PI, 0]);
    const top = Math.max(...feet) - ty + 0.11; tk.box(SPAN + 1.6, top + 0.3, 1.4, m.stone, [0, (top - 0.3) / 2, 0]);   // the paving between the posts: a stone block level with the higher foot
    for (const [sd, fy] of [[-1, feet[0]], [1, feet[1]]]) tk.box(0.7, fy - ty + 0.3, 0.7, m.stone, [sd * SPAN / 2, (fy - ty + 0.3) / 2 - 0.3, 0]);   // footing per post
    if (ctx.physics?.addCylinder) for (const sd of [-1, 1]) ctx.physics.addCylinder(tx + bx * sd * SPAN / 2, tz + bz * sd * SPAN / 2, 0.3, ty, ty + 5.2);
    out.torii = { x: tx, z: tz, y: ty, rotY: ax.rotY };
    // stone path from the footway's edge through the torii, then the steep stair up to the porch (T.P. 7 -> 15)
    const path = [[340.9, -146.9], stairA];
    const pA = seg(path[0], path[1]); k.box(2.2, 0.2, pA.len, m.stone, [pA.x, (L.heightAt(pA.x, pA.z)) + 0.05, pA.z], [0, pA.rotY, 0]);
    const yA = L.heightAt(...stairA) + 0.1, yB = out.shrine.y, st = ax, n = Math.round((yB - yA) / 0.2);
    // step tops: the straight flight, lifted where the knoll bulges above it, never going down (a stone stair cut
    // into the slope, 「かなり急な階段」)
    let prev = yA; const tops = [];
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, x = stairA[0] + (stairB[0] - stairA[0]) * f, z = stairA[1] + (stairB[1] - stairA[1]) * f;
      const y = Math.min(yB, Math.max(prev, yA + (yB - yA) * (i + 1) / n, L.heightAt(x, z) + 0.18)); prev = y;
      const g = Math.min(L.heightAt(x, z), y - 0.2) - 0.4;
      k.box(2.4, y - g, st.len / n + 0.02, m.stone, [x, (y + g) / 2, z], [0, st.rotY, 0]);
      tops.push([x, y, z]);
    }
    // 朱 handrails on both sides following the step tops, on posts every 5 steps
    for (const sd of [-1, 1]) {
      const ox = Math.cos(st.rotY) * sd * 1.3, oz = -Math.sin(st.rotY) * sd * 1.3;
      for (let i = 0; i + 5 < tops.length; i += 5) {
        const a = tops[i], b = tops[i + 5], L2 = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const bar = k.box(0.07, 0.07, Math.hypot(L2, b[1] - a[1]), m.shu, [(a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + 0.9, (a[2] + b[2]) / 2 + oz]); bar.rotation.order = 'YXZ'; bar.rotation.set(-Math.atan2(b[1] - a[1], L2), st.rotY, 0);
        k.box(0.08, 0.95, 0.08, m.shu, [a[0] + ox, a[1] + 0.45, a[2] + oz]);
      }
    }
    if (ctx.physics?.addWalkRamp) ctx.physics.addWalkRamp(st.x, st.z, 2.4, st.len, st.rotY, yA, yB);
    out.stair = { a: stairA, b: stairB, yA, yB };
  }

  // ============================================================== 猪狩神社 and its torii; the 社務所
  {
    const [ix, iz] = S.ikari, gy = L.heightAt(ix, iz), g = k.group([ix, gy, iz], Math.PI * 0.5), kk = ctx.kit(g);   // faces west (the path)
    kk.box(4.2, 0.5, 4.0, m.stone, [0, 0.25, 0]);
    kk.box(2.6, 2.2, 2.8, m.wood, [0, 0.5 + 1.1, -0.2]);
    for (const sd of [-1, 1]) kk.box(1.9, 0.18, 3.8, m.hall, [sd * 0.85, 2.95, -0.2], [0, 0, -sd * 0.55]);
    kk.box(0.3, 0.3, 3.9, m.hall, [0, 3.45, -0.2]);
    kk.box(2.0, 1.4, 0.06, t('#a07850', { paint: 0.1 }), [0, 1.5, 1.22]);   // carved doors
    const tg = kk.group([0, 0, 4.2], 0); toriiInto(ctx, ctx.kit(tg), { h: 3.2, span: 2.2 });
    out.ikari = { x: ix, z: iz };
    // 社務所: one storey, dark red-brown gable roof on the long footprint
    const P = SITES_SHAMUSHO, o = obbOf(P), gy2 = Math.min(...P.map(([x, z]) => L.heightAt(x, z)));
    k.mesh(prismWalls(P, gy2 - 0.8, gy2 + 3.1, { tile: 2 }), m.creamShade);
    const rg = k.group([o.cx, gy2 + 3.1, o.cz], o.rotY), rk = ctx.kit(rg), ang = Math.atan2(1.6, o.w / 2);
    for (const sd of [-1, 1]) rk.box((o.w / 2 + 0.6) / Math.cos(ang), 0.2, o.d + 1.2, m.hall, [sd * (o.w / 2 + 0.6) / 2, 0.8 - 0.3, 0], [0, 0, -sd * ang]);
    for (const zz of [-1, 1]) { const sh = new THREE.Shape([new THREE.Vector2(-o.w / 2, 0), new THREE.Vector2(o.w / 2, 0), new THREE.Vector2(0, 1.6)]); rk.mesh(new THREE.ShapeGeometry(sh), ctx.mat.toon(C.creamShade, { paint: 0.05, side: 'double' }), [0, 0, zz * o.d / 2]); }
    const winM = nightMat(ctx, '#7d93a8', '#ffe4b8', 1.2);
    for (let s = -o.d / 2 + 2; s < o.d / 2 - 1; s += 3.2) for (const sd of [-1, 1]) rk.box(0.06, 1.1, 1.6, winM, [sd * (o.w / 2 + 0.04), -1.5, s]);
    if (ctx.physics?.addBox) ctx.physics.addBox(o.cx, o.cz, o.w, o.d, o.rotY, gy2, gy2 + 5);
  }

  // ============================================================== the west revetment (sloping concrete)
  {
    const tex = paint(ctx, 'revet', 256, 256, (g, w, h) => {
      g.fillStyle = C.wall; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b3b5ae'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
      g.globalAlpha = 0.25; g.fillStyle = '#a2a49c'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h); g.globalAlpha = 1;
    }, [1, 1]);
    const mat = mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0.06, side: 'double' });
    const A = S.revetWater, B = S.revetCrest, rows = 6, cols = A.length;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j <= rows; j++) {
      const f = j / rows, x = A[i][0] + (B[i][0] - A[i][0]) * f, z = A[i][1] + (B[i][1] - A[i][1]) * f;
      const yLin = -0.8 + (Math.max(2.6, L.heightAt(B[i][0], B[i][1])) + 0.8) * f;
      pos.push(x, Math.max(yLin, L.heightAt(x, z) + 0.06), z); uv.push(i * 0.9, f * 4);
    }
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows; j++) { const a = i * (rows + 1) + j, b = a + rows + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    k.mesh(g, mat);
  }

  // walk polyline for the tour (on the walkway, looking at the pavilion): 12 m west of it on the ring, then the pavilion
  const wi = ring.findIndex((p) => Math.hypot(p.x - S.pavilion[0], p.z - S.pavilion[1]) < 13);
  const w1 = ring[Math.max(0, wi)];
  out.walk = [[S.pavilion[0], S.pavilion[1]], [w1.x, w1.z]];
  out.shore = new THREE.Vector3(w1.x, deckY, w1.z);
  void opts; void seg; void C.shuLit; void C.bronzeLit;
  return out;
}

const SITES_SHAMUSHO = [[343.5, -76.6], [350.8, -76], [352.7, -99.2], [345.4, -99.7]];

function stoneLantern(ctx, k, m, x, y, z) {
  k.box(0.8, 0.25, 0.8, m.stone, [x, y + 0.12, z]);
  k.cyl(0.14, 0.18, 1.0, m.stone, [x, y + 0.75, z], null, 8);
  k.box(0.6, 0.18, 0.6, m.stone, [x, y + 1.33, z]);
  k.box(0.46, 0.45, 0.46, nightMat(ctx, '#bdb8ac', '#ffb26a', 1.8), [x, y + 1.64, z]);
  k.mesh(new THREE.ConeGeometry(0.62, 0.45, 6), m.stone, [x, y + 2.08, z]);
  k.sphere(0.1, m.stone, [x, y + 2.36, z], 8);
}
