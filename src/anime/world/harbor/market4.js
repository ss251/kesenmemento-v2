// [v4:landmarks-A] 気仙沼市魚市場 as its real four parts, and 気仙沼 海の市 / シャークミュージアム, on their OSM outlines
// (harbor/real.js SITES; reference sheets docs/anime/landmarks/fish-market.md and uminoichi.md).
//
//   north block (marketNorth)  the market block at the north end: rooftop car park with grey pyramid roof-lights,
//                              a barrel-vaulted entrance hall at the west end, and the curved ramp up to the roof
//   north facility (marketShed) 北側施設 (1995) + A/B棟: the long quay shed. 1F = the open unloading hall (荷捌場) on the
//                              quay side, 2F = the observation / office band, roof = the car park (気仙沼市魚市場屋上駐車場)
//   C棟 (marketC, 2019)        a closed white 高度衛生管理型 hall, 2F observation deck glazing, rooftop view terrace
//   D棟 (marketD, 2019)        a closed white hall with the 250 kW PV array and round roof hoods (z18 photo)
//   海の市 (uminoichi)         the huge red board-and-batten block whose ridge runs corner to corner (so each corner
//                              reads as an A-frame, Commons "Kesennuma uminoiti.jpg"), 「気仙沼 海の市 / シャークミュージアム」,
//                              「UMI ICHI」 and 「氷の水族館」 panels, a lower east block with the timber roof deck and the
//                              footbridge north to the market roof
//
// buildMarket4(ctx, { isWater, berths }) -> { halls, workSpots, forklifts, perches, berths, conveyorSlots, stats }
// (the shape buildFishMarketLots returned, so world.js, unload.js and life keep working).
import * as THREE from 'three';
import { SITES } from './real.js';
import { prismWalls, capGeo, offsetRing, obbOf, seg, barAlong, openRing, signedArea, resample, sweepSlab, worldKit, paint, atLen, lineLen, quadsGeo } from './lmkit.js';
import { hmats, tub, boxYard, boxStack } from './props.js';
import { nightMat, addGlint, registry, lightupMat } from './lights.js';
import { mapMat, textTex, FONT } from './util.js';
import { apronLife } from './market.js';
import { fitFontSize } from '../../core/textures.js';   // [v4:polish1]
import { carColor } from '../town/carcolors.js';
import { buildCRoofPhotos } from './market5.js';   // [v5:photos]   // [v5:fix2] the Japanese car-colour mix

const C = {
  wall: '#e9ebe8', wallShade: '#d9dcd9', concrete: '#c3c6c2', slab: '#b9bcb8', dark: '#4d5462', interior: '#5b6170',
  roofWhite: '#e8eae8', pv: '#2b3444', pvFrame: '#9aa3ad', pyramid: '#8f989b', rail: '#7d8791', blue: '#2f5f9c',
  red: '#bb5954', redShade: '#9c3a33', beige: '#e3d3bd', timber: '#a57b56', steel: '#4b4f55', glass: '#7f97ad',
};

function M4(ctx) {
  if (ctx.__m4) return ctx.__m4;
  const t = (c, o) => ctx.mat.toon(c, o);
  // white metal panel walls: vertical seams every 1.2 m, a darker plinth band, 4 m tile
  const panel = paint(ctx, 'panel', 256, 256, (g, w, h) => {
    g.fillStyle = C.wall; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d6dad7'; for (let x = 0; x < w; x += w / 10 * 1.2 / 1.2) g.fillRect(x, 0, 2, h);
    g.globalAlpha = 0.18; g.fillStyle = '#b9c0c0'; for (let y = 0; y < h; y += h / 4) g.fillRect(0, y, w, 1.5); g.globalAlpha = 1;
  }, [1, 1]);
  const shutter = paint(ctx, 'shutter', 128, 128, (g, w, h) => {
    g.fillStyle = '#b8c3cb'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = '#a3b0ba'; g.fillRect(0, y, w, 2); }
    g.fillStyle = '#8795a0'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
  });
  // parking deck: light concrete, white bay lines every 2.5 m in rows of 5 m, 20 m tile
  const park = paint(ctx, 'park', 512, 512, (g, w, h) => {
    const r = ctx.rng('lm4-park');
    g.fillStyle = '#c2c5c1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.globalAlpha = 0.07; g.fillStyle = r.pick(['#a9ada9', '#d4d6d2', '#9fa5a4']); g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = '#f2f1ea';
    const px = w / 20;   // px per metre
    for (const y0 of [0, 11]) {   // two bay rows per 20 m, 5 m deep, facing an aisle
      for (let x = 0; x <= 20; x += 2.5) g.fillRect(x * px - 1.5, (y0 + 1) * px, 3, 5 * px);
      g.fillRect(0, (y0 + 1) * px, w, 3);
    }
    g.globalAlpha = 0.55; g.fillStyle = '#e8e6de';
    for (let x = 1; x < 20; x += 4) g.fillRect(x * px, 8.5 * px, 2 * px, 3);   // aisle dashes
    g.globalAlpha = 1;
  }, [1, 1]);
  // board-and-batten red cladding for 海の市 (vertical battens every ~0.4 m), 4 m tile
  const board = paint(ctx, 'board', 256, 256, (g, w, h) => {
    g.fillStyle = C.red; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) { g.fillStyle = '#a8483f'; g.fillRect(x, 0, 3, h); g.fillStyle = '#c4665f'; g.fillRect(x + 3, 0, 1.5, h); }
    g.globalAlpha = 0.12; g.fillStyle = '#7d2f29'; for (let i = 0; i < 40; i++) g.fillRect((i * 67) % w, (i * 41) % h, 2, 30 + (i % 5) * 12); g.globalAlpha = 1;
  }, [1, 1]);
  const deckTex = paint(ctx, 'deck', 256, 256, (g, w, h) => {
    g.fillStyle = C.timber; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = ['#a97f5a', '#9c7351', '#b1875f'][(y / 16) % 3]; g.fillRect(0, y + 1, w, 14); g.fillStyle = '#7b5a40'; g.fillRect(0, y, w, 1.5); }
  }, [1, 1]);
  const m = {
    wall: mapMat(ctx, 'toon', '#ffffff', panel, { paint: 0.04, side: 'double' }),
    wallPlain: t(C.wall, { paint: 0.05 }), shade: t(C.wallShade, { paint: 0.05 }), concrete: t(C.concrete, { paint: 0.08 }),
    slab: t(C.slab, { paint: 0.06, side: 'double' }), dark: t(C.dark, { paint: 0 }), interior: t(C.interior, { paint: 0.02, side: 'double' }),
    shutter: mapMat(ctx, 'toon', '#ffffff', shutter, { paint: 0.02 }), park: mapMat(ctx, 'toon', '#ffffff', park, { paint: 0.03 }),
    roofWhite: t(C.roofWhite, { paint: 0.03 }), pv: t(C.pv, { paint: 0 }), pvFrame: t(C.pvFrame, { paint: 0 }), pyramid: t(C.pyramid, { paint: 0.04 }),
    rail: t(C.rail, { paint: 0 }), blue: t(C.blue, { paint: 0 }),
    board: mapMat(ctx, 'toon', '#ffffff', board, { paint: 0.05, side: 'double' }), redPlain: t(C.red, { paint: 0.05 }),
    beige: t(C.beige, { paint: 0.05 }), deck: mapMat(ctx, 'toon', '#ffffff', deckTex, { paint: 0.04 }), steel: t(C.steel, { paint: 0 }),
    roofGrey: t('#a9aca7', { paint: 0.04, side: 'double' }), umiDeck: t('#8f7a68', { paint: 0.05 }),
    walkway: t('#6f9a7f', { paint: 0.05 }),   // [v5:fix2] the green walkway stripe on the roof deck (Earth 2026-03-11)
    win: nightMat(ctx, '#7d93a8', '#ffe4b8', 1.3), winCool: nightMat(ctx, '#86a0b4', '#e6f0ff', 1.1),
    lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2), hall: nightMat(ctx, '#56606f', '#ffe9c4', 0.9),
  };
  ctx.__m4 = m;
  return m;
}

const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
/** Ground level of a site: the median terrain under its vertices, never below the quay apron. */
function baseY(L, poly) { return Math.max(2.2, Math.min(3.2, med(openRing(poly).map(([x, z]) => L.heightAt(x, z))))); }
/** An oriented box: yaw about Y, then a tilt about its own X axis (order YXZ). */
function ob(k, w, h, d, mat, pos, yaw, tilt = 0) { const mesh = k.box(w, h, d, mat, pos); mesh.rotation.order = 'YXZ'; mesh.rotation.set(tilt, yaw, 0); return mesh; }
/** Edges whose outside faces the sea within `r` metres. */
function seaEdges(L, poly, r = 45) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1, out = new Set();
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 12) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, n = sign > 0 ? [dz, -dx] : [-dz, dx];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    for (let d = 3; d <= r; d += 3) if (L.isWater(mx + n[0] * d, mz + n[1] * d)) { out.add(i); break; }
  }
  return out;
}
/** Walk every edge of a ring: fn(a, b, len, outward normal, index). */
function edges(poly, fn) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    fn(a, b, len, sign > 0 ? [dz, -dx] : [-dz, dx], i, [dx, dz]);
  }
}
/** A band of boxes (windows, fascias) along every edge longer than minLen, offset out by `out`. */
function bandRing(k, poly, y, h, mat, { out = 0.06, margin = 1.2, minLen = 5, depth = 0.1, skip = null, every = 0, gap = 0 } = {}) {
  edges(poly, (a, b, len, n, i, u) => {
    if (len < minLen || (skip && skip(i))) return;
    const run = (s0, s1) => { const x0 = a[0] + u[0] * s0, z0 = a[1] + u[1] * s0, x1 = a[0] + u[0] * s1, z1 = a[1] + u[1] * s1; barAlong(k, [x0 + n[0] * out, z0 + n[1] * out], [x1 + n[0] * out, z1 + n[1] * out], y, depth, h, mat); };
    if (!every) run(margin, len - margin);
    else for (let s = margin; s + every - gap <= len - margin + 0.01; s += every) run(s, s + every - gap);
  });
}
/**
 * Car list inside a ring: rows along the ring's long axis (2.5 m bays, 5 m deep, two rows per 20 m), filled `fill` of
 * the bays; `frame` aligns the painted bay lines of the deck texture with the cars (capGeo uvFrame).
 */
function parkCars(poly, y, r, fill = 0.6, avoid = () => false) {
  const o = obbOf(poly), ax = [o.ux, o.uz], ay = [-o.uz, o.ux];
  const inner = offsetRing(poly, -2.2), cars = [];
  const inside = (x, z) => { let c = false; for (let i = 0, k = inner.length - 1; i < inner.length; k = i++) { const [xi, zi] = inner[i], [xk, zk] = inner[k]; if ((zi > z) !== (zk > z) && x < (xk - xi) * (z - zi) / (zk - zi) + xi) c = !c; } return c; };
  cars.frame = { cx: o.cx, cz: o.cz, ax, ay, u0: -o.d / 2, v0: -o.w / 2 + 2 };
  for (let v = -o.w / 2 + 2; v < o.w / 2 - 2; v += 20) for (const rowOff of [3.5, 14.5]) {
    const vv = v + rowOff; if (vv > o.w / 2 - 2.5) continue;
    for (let u = -o.d / 2 + 1.25; u < o.d / 2 - 1.5; u += 2.5) {
      const x = o.cx + ax[0] * u + ay[0] * vv, z = o.cz + ax[1] * u + ay[1] * vv;
      if (!inside(x, z) || avoid(x, z) || r() > fill) continue;
      cars.push({ x, y, z, rot: Math.atan2(ay[0], ay[1]) + (rowOff ? Math.PI : 0) + r.range(-0.05, 0.05) });
    }
  }
  return cars;
}
function carMesh(ctx, list, name) {
  if (!list.length) return null;
  const body = new THREE.BoxGeometry(1.72, 0.72, 4.2).translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(1.5, 0.58, 2.1).translate(0, 1.27, -0.25);
  const geo = ctx.geo.mergeGeometries([body.toNonIndexed(), cab.toNonIndexed()]);
  const im = new THREE.InstancedMesh(geo, ctx.mat.toon('#ffffff', { paint: 0.02 }), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const r = ctx.rng(name);
  list.forEach((c, i) => { q.setFromEuler(e.set(0, c.rot, 0)); m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(carColor(r()))); });
  im.name = name; im.castShadow = true; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  ctx.add(im);
  return im;
}
/** Parapet round a roof ring: outer wall face, inner face, cap. */
function parapet(k, poly, y, h, mat, capMat, t = 0.3) {
  const inner = offsetRing(poly, -t);
  k.mesh(prismWalls(poly, y - 0.2, y + h, { tile: 4 }), mat);
  const iw = prismWalls(inner, y, y + h, { tile: 4 }); k.mesh(iw, mat);   // mat is double-sided
  k.mesh(capGeo(poly, y + h, { holes: [inner] }), capMat);
}
function pyramid(k, mat, x, y, z, s, h, rot = 0) { return k.mesh(new THREE.ConeGeometry(s / Math.SQRT2, h, 4, 1), mat, [x, y + h / 2, z], [0, Math.PI / 4 + rot, 0]); }

// ------------------------------------------------------------------------------------------------ build
export function buildMarket4(ctx, opts = {}) {
  const L = ctx.L, m = M4(ctx), M = hmats(ctx);
  const { k } = worldKit(ctx, 'market4');
  const r = ctx.rng('market4');
  const out = { halls: [], workSpots: [], forklifts: [], perches: [], berths: [], stats: {}, cars: 0 };
  const phys = ctx.physics;
  const cars = [];
  const lampAt = (x, y, z, pool = 9) => registry(ctx)?.streetlight({ x, y, z, groundY: y - 8, poolR: pool });
  const hallOf = (poly, h) => { const o = obbOf(poly); out.halls.push({ x: o.cx, z: o.cz, rotY: o.rotY, depth: o.w, len: o.d, h }); return o; };
  const solid = (poly, y0, y1, skip = null) => {   // wall colliders along every edge (0.5 m thick, in 16 m pieces)
    if (!phys?.addBox) return;
    edges(poly, (a, b, len, n, i, u) => { if (skip?.has(i)) return; const pieces = Math.max(1, Math.ceil(len / 16)); for (let p = 0; p < pieces; p++) { const s = (p + 0.5) * len / pieces; phys.addBox(a[0] + u[0] * s - n[0] * 0.25, a[1] + u[1] * s - n[1] * 0.25, 0.5, len / pieces, Math.atan2(u[0], u[1]), y0, y1); } });
  };
  const roofWalk = (poly, y, bottom) => {   // walkable roof deck: OBB pieces of 16 m (they stop blocking below `bottom`)
    if (!phys?.addWalkBox) return;
    const o = obbOf(offsetRing(poly, -0.4)); const n = Math.max(1, Math.ceil(o.d / 16));
    for (let i = 0; i < n; i++) { const s = -o.d / 2 + (i + 0.5) * o.d / n; phys.addWalkBox(o.cx + o.ux * s, o.cz + o.uz * s, o.w, o.d / n, o.rotY, y, bottom); }
  };

  // ============================================================== north facility: the long quay shed
  {
    const poly = SITES.marketShed.poly, g0 = baseY(L, poly), sea = seaEdges(L, poly);
    const y1F = g0 + 7.0, roofY = g0 + 10.6;   // 1F unloading hall 7 m clear, 2F band, parking deck on top
    // ground slab (the hall floor, raised 0.25 m) and the land-side / end walls of the 1F (the quay side is open)
    k.mesh(capGeo(poly, g0 + 0.25), m.concrete);
    k.mesh(prismWalls(poly, g0 - 1.5, g0 + 0.25), m.concrete);
    k.mesh(prismWalls(poly, g0 + 0.25, y1F, { skip: (i) => sea.has(i) }), m.wall);
    // 2F band all round (windows on every side), the 1F ceiling (soffit) and the roof slab
    k.mesh(prismWalls(poly, y1F, roofY), m.wall);
    k.mesh(capGeo(poly, y1F, { down: true }), m.interior);
    bandRing(k, poly, y1F + 1.5, 1.1, m.win, { every: 6, gap: 1.6 });
    const pyr = [];
    { const o = obbOf(poly); for (let s = -o.d / 2 + 14; s < o.d / 2 - 10; s += 26) pyr.push([o.cx + o.ux * s, o.cz + o.uz * s]); }
    // [v5:fix2] the green walkway stripe along the land side of the deck (Google Earth 2026-03-11 c11d / c11e), 3 m wide,
    // 2 m in from the parapet; Earth shows about 25 cars on the whole deck, so 6 % of the bays (it was 62 %, packed)
    const landEdges = [];
    edges(poly, (a, b, len, n, i, u) => {
      if (sea.has(i) || len < 18) return;
      const mx = (a[0] + b[0]) / 2 + n[0] * 4, mz = (a[1] + b[1]) / 2 + n[1] * 4;   // not the party wall with the north block
      // (the north block's main bar, not its OSM outline: that runs on along the ramp beside this wall)
      if (!inside(mx, mz, NORTH_MAIN) && !['marketC', 'marketD'].some((id) => inside(mx, mz, SITES[id].poly))) landEdges.push({ a, b, len, n, u });
    });
    const onStripe = (x, z) => landEdges.some(({ a, len, n, u }) => { const dx = x - a[0], dz = z - a[1], s = dx * u[0] + dz * u[1], d = -(dx * n[0] + dz * n[1]); return s > -2 && s < len + 2 && d > 1 && d < 7.5; });
    const shedCars = parkCars(poly, roofY, r, 0.06, (x, z) => pyr.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4.2) || onStripe(x, z));
    k.mesh(capGeo(poly, roofY, { uvFrame: shedCars.frame, tile: 20 }), m.park);
    for (const { a, b, len, n, u } of landEdges) {
      const at = (s, d) => [a[0] + u[0] * s - n[0] * d, a[1] + u[1] * s - n[1] * d];
      barAlong(k, at(2, 3.7), at(len - 2, 3.7), roofY + 0.025, 3.0, 0.05, m.walkway);
      for (const d of [2.15, 5.25]) barAlong(k, at(2, d), at(len - 2, d), roofY + 0.03, 0.15, 0.06, m.roofWhite);
    }
    parapet(k, poly, roofY, 1.05, m.wall, m.wallPlain);
    // [v5:fix2] the land side (walk/w_12 showed a 300 m plain white wall with tiny windows over an empty plain): a dock
    // plinth with loading-dock shutters and black rubber bumpers, painted truck bays with 4 t trucks backed onto a few of
    // them, and 「気仙沼市魚市場」 lettered on the 2F band (Google Earth 2026-03-11 c11d o0: the trucks load on this side)
    {
      const tr = ctx.rng('shed-land'), wlab = textTex(ctx, '気仙沼市魚市場', { w: 1024, h: 160, color: C.blue, bg: C.wall, font: FONT.sans, weight: 900, size: 0.78 });
      const wlabM = mapMat(ctx, 'toon', '#ffffff', wlab, { paint: 0 });
      for (const { a, len, n, u } of landEdges) {
        const at = (s, d) => [a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d], ry = Math.atan2(u[0], u[1]), rn = Math.atan2(n[0], n[1]);
        const plinth = g0 + 1.1;
        barAlong(k, at(0.5, 0.8), at(len - 0.5, 0.8), (g0 - 0.5 + plinth) / 2, 1.6, plinth - g0 + 0.5, m.concrete);
        if (phys?.addBox) { const pcs = Math.max(1, Math.ceil(len / 16)); for (let q = 0; q < pcs; q++) { const [x, z] = at((q + 0.5) * len / pcs, 0.8); phys.addBox(x, z, 1.6, len / pcs, ry, g0 - 0.5, plinth); } }
        for (let s = 4; s + 4 <= len - 3; s += 8.5) {
          const c = s + 2;
          const [x, z] = at(c, 0.07); k.box(0.1, 3.9, 3.5, m.shutter, [x, plinth + 1.95, z], [0, ry, 0]);
          for (const e of [-2.05, 2.05]) { const [bx, bz] = at(c + e, 0.25); k.box(0.3, 0.5, 0.25, m.dark, [bx, plinth - 0.1, bz], [0, ry, 0]); }
          if (nearRamp(...at(c, 6))) continue;   // the roof ramp runs along the north part of this side
          // truck bay lines, 12 m out from the plinth
          const [l0x, l0z] = at(c - 2.1, 8.6); k.box(12, 0.03, 0.14, m.roofWhite, [l0x, L.heightAt(l0x, l0z) + 0.04, l0z], [0, ry, 0]);
          if (tr() < 0.22) {
            const gy = L.heightAt(...at(c, 6)), cab = tr() < 0.6 ? m.wallPlain : m.blue;
            const [bx, bz] = at(c, 1.9 + 3.3); k.box(2.3, 2.6, 6.6, m.slab, [bx, gy + 0.9 + 1.3, bz], [0, rn, 0]);
            const [cx2, cz2] = at(c, 1.9 + 6.6 + 1.1); k.box(2.2, 2.2, 1.9, cab, [cx2, gy + 0.55 + 1.1, cz2], [0, rn, 0]);
            const [wx, wz] = at(c, 1.9 + 6.6 + 2.0); k.box(1.9, 0.9, 0.08, m.dark, [wx, gy + 2.05, wz], [0, rn, 0]);
            const [fx, fz] = at(c, 1.9 + 4.5); k.box(2.0, 0.45, 9.0, m.dark, [fx, gy + 0.55, fz], [0, rn, 0]);
            if (phys?.addBox) { const [px, pz] = at(c, 1.9 + 4.5); phys.addBox(px, pz, 2.4, 9.4, rn, gy, gy + 3.6); }
          }
        }
        for (let s = len * 0.22; s < len - 20; s += 110) { const [x, z] = at(s, 0.16); k.plane(26, 4.06, wlabM, [x, y1F + 1.8, z], [0, rn, 0]); }
      }
    }
    // the open quay side: columns every 7.5 m, the dark hall behind, hanging lamps, a fascia sign
    const sign = textTex(ctx, '気仙沼市魚市場', { w: 1024, h: 160, color: C.blue, font: FONT.sans, weight: 900, size: 0.78 });
    const signM = mapMat(ctx, 'decal', '#ffffff', sign, { transparent: true, alphaTest: 0.3 });
    edges(poly, (a, b, len, n, i, u) => {
      if (!sea.has(i)) return;
      for (let s = 0; s <= len + 0.01; s += len / Math.max(1, Math.round(len / 7.5))) {
        const x = a[0] + u[0] * s - n[0] * 0.5, z = a[1] + u[1] * s - n[1] * 0.5;
        k.box(0.8, y1F - g0 - 0.25, 0.8, m.wallPlain, [x, (g0 + 0.25 + y1F) / 2, z], [0, Math.atan2(u[0], u[1]), 0]);
        if (phys?.addCylinder) phys.addCylinder(x, z, 0.5, g0, y1F);
      }
      // back of the open hall: a dark wall 18 m in, lit strip lamps under the soffit
      const ia = [a[0] - n[0] * 18, a[1] - n[1] * 18], ib = [b[0] - n[0] * 18, b[1] - n[1] * 18];
      barAlong(k, ia, ib, (g0 + y1F) / 2, 0.2, y1F - g0, m.interior);
      for (let s = 6; s < len - 3; s += 9) for (const d of [4, 10, 15]) k.box(0.25, 0.1, 2.2, m.lamp, [a[0] + u[0] * s - n[0] * d, y1F - 0.3, a[1] + u[1] * s - n[1] * d], [0, Math.atan2(u[0], u[1]), 0]);
      // 1F edge beam, signs every ~90 m on the 2F band
      barAlong(k, [a[0] + n[0] * 0.05, a[1] + n[1] * 0.05], [b[0] + n[0] * 0.05, b[1] + n[1] * 0.05], y1F - 0.35, 0.3, 0.7, m.shade);
      for (let s = 45; s < len - 20; s += 95) {
        const x = a[0] + u[0] * s + n[0] * 0.08, z = a[1] + u[1] * s + n[1] * 0.08;
        k.plane(24, 3.8, signM, [x, y1F + 1.95, z], [0, Math.atan2(n[0], n[1]), 0]);
      }
      // hall interior life: tub rows, box stacks along the inside (visible through the open side)
      const kr = ctx.rng('shed-inner');
      for (let s = 8; s < len - 6; s += kr.range(10, 16)) {
        const x = a[0] + u[0] * s - n[0] * kr.range(6, 13), z = a[1] + u[1] * s - n[1] * kr.range(6, 13);
        const sub = k.group([x, g0 + 0.25, z], Math.atan2(u[0], u[1])); const kk = ctx.kit(sub);
        if (kr() < 0.5) boxYard(kk, M, 0, 0, 0, { cols: 3, rows: 2, rng: kr, colors: ['blue', 'blue', 'white', 'orange'] });
        else for (let q = 0; q < 4; q++) tub(kk, M, (q % 2) * 1.5, 0, Math.floor(q / 2) * 1.4, kr.range(-0.2, 0.2));
      }
      const w = [a[0] + u[0] * len / 2 + n[0] * 4, a[1] + u[1] * len / 2 + n[1] * 4]; addGlint(ctx, w[0] + n[0] * 12, 0, w[1] + n[1] * 12, '#ffe6c0', 0.8, 14, 0.6);
    });
    // roof: pyramid roof-lights down the middle, lamp posts, parked cars
    const o = obbOf(poly);
    for (const [x, z] of pyr) pyramid(k, m.pyramid, x, roofY, z, 3.6, 2.4);
    for (let s = -o.d / 2 + 20; s < o.d / 2 - 10; s += 40) { const x = o.cx + o.ux * s - o.uz * 4, z = o.cz + o.uz * s + o.ux * 4; k.cyl(0.1, 0.14, 7, m.rail, [x, roofY + 3.5, z], null, 8); k.box(0.9, 0.2, 0.4, m.lamp, [x, roofY + 7, z]); lampAt(x, roofY + 6.9, z, 11); }
    cars.push(...shedCars);
    hallOf(poly, roofY - g0);
    // the quay side has no wall (the 1F is open to walk in): colliders on the other sides, the 2F band above the hall
    solid(poly, g0, roofY + 1, sea);
    edges(poly, (a, b, len, n, i, u) => { if (!sea.has(i) || !phys?.addBox) return; const pieces = Math.max(1, Math.ceil(len / 16)); for (let p = 0; p < pieces; p++) { const s = (p + 0.5) * len / pieces; phys.addBox(a[0] + u[0] * s - n[0] * 0.25, a[1] + u[1] * s - n[1] * 0.25, 0.5, len / pieces, Math.atan2(u[0], u[1]), y1F - 0.4, roofY + 1); } });
    roofWalk(poly, roofY, roofY - 0.8);
    out.stats.shed = { g0, roofY, len: Math.round(o.d) };
    out.shed = { poly, g0, roofY, y1F, sea };
  }

  // ============================================================== north block (roof car park, vault, ramp)
  {
    const P = SITES.marketNorth.poly;
    const main = NORTH_MAIN;
    void P;
    const g0 = baseY(L, main), roofY = out.shed ? out.shed.roofY : g0 + 10.6, y1F = g0 + 7.0;
    k.mesh(prismWalls(main, g0 - 1.5, roofY), m.wall);
    bandRing(k, main, y1F + 1.5, 1.1, m.win, { every: 6, gap: 1.6 });
    bandRing(k, main, g0 + 2.6, 2.2, m.shutter, { every: 9, gap: 3.5, out: 0.05 });
    // the row of pyramid roof-lights on the quay side of the deck (z18 photo: seven along the north edge + a big one)
    const PYR = [[397, 587, 3.8], [418, 592, 3.8], [441, 598, 3.8], [461, 603, 3.8], [481, 608, 3.8], [505, 614, 3.8], [529, 617, 3.8], [488, 624, 7.5]];
    const W = [[372, 583], [388, 587], [383, 606], [368, 602]];
    const inW = (x, z) => inside(x, z, offsetRing(W, 2));
    // [v5:fix1] Google Earth 2026-03-11 shows the north roof car park ~10-15 % occupied (it was packed at 0.66)
    const nCars = parkCars(main, roofY, r, 0.15, (x, z) => inW(x, z) || PYR.some(([px, pz, s]) => Math.hypot(x - px, z - pz) < s * 0.8 + 2.4));
    k.mesh(capGeo(main, roofY, { uvFrame: nCars.frame, tile: 20 }), m.park);
    parapet(k, main, roofY, 1.05, m.wall, m.wallPlain);
    for (const [x, z, s] of PYR) pyramid(k, m.pyramid, x, roofY, z, s, s * 0.62);
    // west-end entrance hall: a taller block with a glazed barrel vault along its long side (the blue-green vault)
    {
      k.mesh(prismWalls(W, roofY - 1, roofY + 3.2), m.wall);
      k.mesh(capGeo(W, roofY + 3.2), m.wallPlain);
      const ax = seg(W[0], W[3]), g = k.group([(372 + 388 + 383 + 368) / 4, roofY + 3.2, (583 + 587 + 606 + 602) / 4], ax.rotY);
      const vault = ctx.kit(g).mesh(new THREE.CylinderGeometry(7.4, 7.4, ax.len - 1, 18, 1, true, -Math.PI / 2, Math.PI), m.winCool, [0, 0, 0], [-Math.PI / 2, 0, 0]);
      vault.scale.set(1, 1, 0.42); vault.material = nightMat(ctx, '#8fb1b8', '#ffe9c4', 0.9, { side: 'double' });
    }
    cars.push(...nCars);
    hallOf(main, roofY - g0);
    solid(main, g0, roofY + 1);
    roofWalk(main, roofY, roofY - 0.8);
    // the ramp: up from the street (474, 706) round the curve and north along the shed's west side onto the deck
    const path = RAMP_PATH;
    const smp = resample(path, 3); const tot = smp[smp.length - 1].s;
    const gStart = Math.max(g0, L.heightAt(474, 707));
    for (const p of smp) { const t = p.s / tot; p.y = gStart + (roofY - gStart) * (t * t * (3 - 2 * t) * 0.35 + t * 0.65); }
    k.mesh(sweepSlab(smp, { l0: -3.8, l1: 3.8, th: 0.7, tile: 4 }), m.concrete);
    for (const side of [-1, 1]) {
      const rail = smp.map((p) => ({ ...p, y: p.y + 1.0 }));
      k.mesh(sweepSlab(rail, { l0: side < 0 ? -4.0 : 3.6, l1: side < 0 ? -3.6 : 4.0, th: 1.0, tile: 4 }), m.wallPlain);
    }
    for (let i = 4; i < smp.length - 3; i += 6) { const p = smp[i]; if (p.y - L.heightAt(p.x, p.z) > 1.5) k.box(1.4, p.y - 0.7 - L.heightAt(p.x, p.z) + 0.5, 1.4, m.concrete, [p.x, (p.y - 0.7 + L.heightAt(p.x, p.z) - 0.5) / 2, p.z]); }
    if (phys?.addWalkRamp) for (let i = 0; i < smp.length - 1; i++) { const a = smp[i], b = smp[i + 1]; const s = seg([a.x, a.z], [b.x, b.z]); phys.addWalkRamp(s.x, s.z, 7.6, s.len + 0.3, s.rotY, a.y, b.y); }
    out.ramp = { from: path[0], to: path[path.length - 1], len: Math.round(tot) };
  }

  // ============================================================== C棟
  {
    const poly = SITES.marketC.poly, g0 = baseY(L, poly), sea = seaEdges(L, poly), roofY = g0 + 13.0, y2F = g0 + 7.5;
    k.mesh(prismWalls(poly, g0 - 1.5, roofY), m.wall);
    k.mesh(capGeo(poly, roofY), m.roofWhite);
    parapet(k, poly, roofY, 1.1, m.wall, m.wallPlain, 0.25);
    // quay side: shutter bays on the 1F, the long glazed 2F observation deck (見学デッキ), lettering
    bandRing(k, poly, g0 + 2.8, 4.8, m.shutter, { every: 8.5, gap: 2.2, skip: (i) => !sea.has(i) });
    bandRing(k, poly, y2F + 1.9, 2.4, m.winCool, { every: 4.2, gap: 0.35, skip: (i) => !sea.has(i) });
    bandRing(k, poly, y2F + 1.8, 1.4, m.win, { every: 7, gap: 3, skip: (i) => sea.has(i), minLen: 20 });
    bandRing(k, poly, g0 + 2.6, 4.2, m.shutter, { every: 11, gap: 5, skip: (i) => sea.has(i), minLen: 30 });
    const sign = textTex(ctx, '気仙沼市魚市場', { w: 1024, h: 160, color: C.blue, font: FONT.sans, weight: 900, size: 0.8 });
    const slog = textTex(ctx, '海と生きる', { w: 512, h: 128, color: C.blue, font: FONT.brush, weight: 700, size: 0.8 });
    edges(poly, (a, b, len, n, i, u) => {
      if (!sea.has(i) || len < 60) return;
      const at = (s, d = 0.1) => [a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d];
      const [x, z] = at(len * 0.5), [x2, z2] = at(len * 0.18);
      k.plane(34, 5.2, mapMat(ctx, 'decal', '#ffffff', sign, { transparent: true, alphaTest: 0.3 }), [x, roofY - 2.3, z], [0, Math.atan2(n[0], n[1]), 0]);
      k.plane(12, 3, mapMat(ctx, 'decal', '#ffffff', slog, { transparent: true, alphaTest: 0.3 }), [x2, roofY - 2.3, z2], [0, Math.atan2(n[0], n[1]), 0]);
      // the observation deck slab and rail in front of the 2F glazing
      const d0 = at(4, 1.6), d1 = at(len - 4, 1.6);
      barAlong(k, d0, d1, y2F + 0.55, 3.2, 0.3, m.wallPlain);
      barAlong(k, at(4, 3.1), at(len - 4, 3.1), y2F + 1.7, 0.08, 0.08, m.rail);
      for (let s = 4; s <= len - 4; s += 2) k.box(0.06, 1.1, 0.06, m.rail, [at(s, 3.1)[0], y2F + 1.25, at(s, 3.1)[1]]);
      // floodlights for the night colour wash (full-colour LEDs on the C/D halls)
      for (let s = 12; s < len - 8; s += 30) { const [lx, lz] = at(s, 5); registry(ctx)?.point({ x: lx, y: g0 + 1, z: lz, color: ['#6fa8ff', '#b48bff', '#5fd9c9'][Math.round(s / 30) % 3], size: 1.2, intensity: 1.6, mode: 'night' }); }
    });
    ctx.noOutline(k.mesh(prismWalls(offsetRing(poly, 0.12), g0 + 0.5, roofY - 0.5), lightupMat(ctx, '#8fb6ff', 0.32, g0, 18)));
    // [v5:photos] the roof deck as the author's photos show it (IMG_0792-0798: a visitors' car park with the pale-blue lettered
    // penthouse, the wave-roofed observation pavilions, the lifeboat; harbor/market5.js), replacing the v4 equipment boxes
    out.stats.Croof = buildCRoofPhotos(ctx, k, { poly, roofY, cars, r: ctx.rng('marketC-roof5') });
    hallOf(poly, roofY - g0);
    solid(poly, g0, roofY + 1);
    out.stats.C = { g0, roofY };
  }

  // ============================================================== D棟 (PV roof)
  {
    const poly = SITES.marketD.poly, g0 = baseY(L, poly), sea = seaEdges(L, poly), roofY = g0 + 11.5;
    k.mesh(prismWalls(poly, g0 - 1.5, roofY), m.wall);
    k.mesh(capGeo(poly, roofY), m.roofWhite);
    parapet(k, poly, roofY, 1.0, m.wall, m.wallPlain, 0.25);
    bandRing(k, poly, g0 + 2.8, 4.8, m.shutter, { every: 8.5, gap: 2.2, skip: (i) => !sea.has(i) });
    bandRing(k, poly, g0 + 8.6, 1.3, m.win, { every: 6, gap: 2.5, minLen: 20 });
    ctx.noOutline(k.mesh(prismWalls(offsetRing(poly, 0.12), g0 + 0.5, roofY - 0.5), lightupMat(ctx, '#c79bff', 0.28, g0, 16)));
    // 10 PV fields in pairs of rows across the roof, and 9 round roof hoods (the z18 photo)
    const o = obbOf(poly);
    const pvRow = new THREE.BoxGeometry(1, 1, 1);
    const fields = [[-50, -12], [-50, 10], [-28, -14], [-28, 8], [-6, -12], [-6, 10], [16, -14], [16, 8], [38, -12], [38, 10], [55, -2]];
    for (const [s, v] of fields) for (const row of [0, 2.6]) {
      const x = o.cx + o.ux * (s + row) - o.uz * v, z = o.cz + o.uz * (s + row) + o.ux * v;
      const yaw = Math.atan2(-o.uz, o.ux);   // the row's 18 m length runs across the hall
      ob(k, 2.2, 0.12, 18, m.pv, [x, roofY + 0.62, z], yaw).rotation.set(0, yaw, 0.2);
      ob(k, 0.25, 0.5, 18, m.pvFrame, [x, roofY + 0.25, z], yaw);
      void pvRow;
    }
    for (const [s, v] of [[-40, 2], [-18, -2], [4, 2], [26, -2], [-40, 20], [-12, 20], [16, 20], [44, 20], [48, -20]]) {
      const x = o.cx + o.ux * s - o.uz * v, z = o.cz + o.uz * s + o.ux * v;
      k.mesh(new THREE.SphereGeometry(2.1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.wallPlain, [x, roofY, z], null, [1, 0.75, 1]);
    }
    hallOf(poly, roofY - g0);
    solid(poly, g0, roofY + 1);
    out.stats.D = { g0, roofY };
  }

  // ============================================================== 海の市 / シャークミュージアム
  out.uminoichi = buildUminoichi(ctx, k, m, out);

  // ---- parked cars (one instanced mesh)
  carMesh(ctx, cars, 'market4-cars'); out.cars = cars.length;

  // ---- berths, apron life and work spots along the market quays (the water edges in front of the shed, C and D)
  const berths = opts.berths || [];
  const shedPoly = SITES.marketShed.poly;
  for (const bth of berths) {
    const s = seg(bth.a, bth.b); if (s.len < 30) continue;
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.rotY; ctx.addStatic(g); g.updateMatrixWorld(true);
    const kk = ctx.kit(g);
    const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
    // apron width: from the quay edge inland to the nearest market wall
    let apron = 12; for (let d = 4; d < 40; d += 1) { const p = toW(-d, 0, 0); if (Object.values(SITES).some((st) => inside(p.x, p.z, st.poly))) { apron = d - 0.5; break; } }
    const top = bth.top ?? 2.2;
    apronLife(ctx, kk, M, ctx.rng('m4apron|' + Math.round(s.x)), { z0: -s.len / 2 + 4, used: s.len - 8, top, apron: Math.max(8, apron), toW, out, rotY: s.rotY, L: s.len, opts: { forklifts: Math.max(1, Math.round(s.len / 90)) } });
    out.berths.push({ a: bth.a, b: bth.b, top });
  }
  void shedPoly; void lineLen; void atLen; void quadsGeo;
  return out;
}

/** The north block's main bar (the OSM outline minus the strip along the ramp). */
const NORTH_MAIN = [[538.2, 607.5], [535.5, 602.8], [395.4, 568.2], [394, 575.2], [386.9, 573.4], [384.9, 580.6], [375.6, 578.4], [374.2, 583.9], [370.6, 598.2], [380.9, 601], [378.6, 608.7], [416.6, 617.9], [505.4, 639.5], [506.7, 620.3]];
/** The curved ramp from the street (474, 707) up onto the north block's roof deck. */
const RAMP_PATH = [[474, 707], [492, 711], [512, 714], [528, 714], [538, 709], [543, 701], [541, 690], [531, 670], [521, 648], [514, 632]];
function nearRamp(x, z, r = 10) { for (let i = 1; i < RAMP_PATH.length; i++) { const [ax, az] = RAMP_PATH[i - 1], [bx, bz] = RAMP_PATH[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); if (Math.hypot(ax + dx * t - x, az + dz * t - z) < r) return true; } return false; }
function inside(x, z, poly) { let c = false; for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const [xi, zi] = poly[i], [xk, zk] = poly[k]; if ((zi > z) !== (zk > z) && x < (xk - xi) * (z - zi) / (zk - zi) + xi) c = !c; } return c; }

// ------------------------------------------------------------------------------------------------ 海の市
function buildUminoichi(ctx, k, m, out) {
  const L = ctx.L;
  const g0 = Math.max(1.9, L.heightAt(395, 655));
  // the red block (west third): corners measured on the z18 photo; its ridge runs from the NE to the SW corner
  const NW = [357.1, 623.8], NE = [389.1, 631.9], SE = [386.4, 673.0], SW = [355.8, 665.0];
  const eave = g0 + 7.2, ridge = g0 + 19.0, base = g0 + 4.6;   // the red cladding starts over the recessed shop front
  const Y = (p) => (p === NE || p === SW ? ridge : eave);
  // roof: two planes on the diagonal ridge
  const roofQ = [
    [[NE[0], ridge, NE[1]], [SW[0], ridge, SW[1]], [NW[0], eave, NW[1]]],
    [[SW[0], ridge, SW[1]], [NE[0], ridge, NE[1]], [SE[0], eave, SE[1]]],
  ];
  const tri = (pts, want) => { const g = new THREE.BufferGeometry(); const [a, b, c] = pts; const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const n = e1.cross(e2); const o = n.y * want >= 0 ? [a, b, c] : [a, c, b]; g.setAttribute('position', new THREE.Float32BufferAttribute(o.flat(), 3)); g.computeVertexNormals(); return g; };
  for (const q of roofQ) { k.mesh(tri(q, 1), m.roofGrey); }
  // [v5:fix1] PV rows on the SE roof plane (Google Earth 2026-03-11 top: dark panel arrays on the triangle south-east of
  // the diagonal ridge): rows parallel to the ridge, lying on the plane
  {
    const r0 = new THREE.Vector3(SW[0], ridge, SW[1]), r1 = new THREE.Vector3(NE[0], ridge, NE[1]), ap = new THREE.Vector3(SE[0], eave, SE[1]);
    const ux = r1.clone().sub(r0).normalize(), foot = r0.clone().add(ux.clone().multiplyScalar(ap.clone().sub(r0).dot(ux)));
    const uz = ap.clone().sub(foot).normalize(), uy = new THREE.Vector3().crossVectors(uz, ux).normalize();
    if (uy.y < 0) uy.negate();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ux, uy, new THREE.Vector3().crossVectors(ux, uy)));
    const RL = r1.distanceTo(r0);
    for (const f of [0.2, 0.32, 0.44, 0.56]) {
      const a = r0.clone().lerp(ap, f), b = r1.clone().lerp(ap, f), c = a.clone().add(b).multiplyScalar(0.5).add(uy.clone().multiplyScalar(0.12));
      const mesh = k.box((1 - f) * RL * 0.62, 0.1, 1.9, m.pv, [c.x, c.y, c.z]);
      mesh.quaternion.copy(q);
    }
  }
  // a thin eave lip on the roof edges
  for (const [a, b] of [[NW, NE], [NE, SE], [SE, SW], [SW, NW]]) {
    const s = seg(a, b), ya = Y(a), yb = Y(b);
    const g = new THREE.BoxGeometry(0.5, 0.35, s.len + 0.4); const mesh = k.mesh(g, m.steel, [s.x, (ya + yb) / 2 + 0.1, s.z], null);
    mesh.rotation.order = 'YXZ'; mesh.rotation.set(-Math.atan2(yb - ya, s.len), s.rotY, 0);
  }
  // walls: red board-and-batten from `base` up to the sloping top on all four faces (uv metric)
  const wallQ = [];
  for (const [a, b] of [[NW, NE], [NE, SE], [SE, SW], [SW, NW]]) {
    const s = seg(a, b), n = [s.uz, -s.ux];   // the ring runs clockwise in (x, -z)... pick the outward side by the centroid
    const cx = (NW[0] + NE[0] + SE[0] + SW[0]) / 4, cz = (NW[1] + NE[1] + SE[1] + SW[1]) / 4;
    const out = ((s.x - cx) * n[0] + (s.z - cz) * n[1]) > 0 ? [n[0], 0, n[1]] : [-n[0], 0, -n[1]];
    wallQ.push([[a[0], base, a[1]], [b[0], base, b[1]], [b[0], Y(b), b[1]], [a[0], Y(a), a[1]], out]);
  }
  // quadsGeo takes flat quads; the faces are trapezoids: build them as 2 triangles each via a custom geometry
  const pos = [], uv = [];
  for (const [a, b, c, d, want] of wallQ) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const U = (p) => Math.hypot(p[0] - a[0], p[2] - a[2]) / 4, V = (p) => (p[1] - base) / 4;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = n[0] * want[0] + n[2] * want[2] < 0;
    const T = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of T) { pos.push(...p); uv.push(U(p), V(p)); }
    void len;
  }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); k.mesh(g, m.board); }
  // the recessed ground floor under the red mass: beige walls, shop glazing, a big corner column at the SW
  const inset = offsetRing([NW, NE, SE, SW], -2.2);
  k.mesh(prismWalls(inset, g0 - 1, base + 0.05), m.beige);
  k.mesh(capGeo([NW, NE, SE, SW], base, { down: true }), m.beige);
  bandRing(k, inset, g0 + 1.5, 2.6, m.win, { every: 5, gap: 1.2, out: 0.05, minLen: 8 });
  k.box(1.6, base - g0, 1.6, m.beige, [SW[0] + 1.2, (g0 + base) / 2, SW[1] - 1.2]);
  // sign panels (Commons photo): west face 「気仙沼 海の市 / シャークミュージアム」 (red panel, white text, a shark),
  // south face 「UMI ICHI」 (white panel, red letters), and 「氷の水族館」 at the north end of the west face
  const T = ctx.tex;
  const pUmi = T.draw(512, 640, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3423b'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#f4f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fit = (txt, x, y, maxW, size, weight = 900) => { fitFontSize(g, txt, maxW, size, FONT.sans, weight, 10); g.fillText(txt, x, y); };   // [v4:polish1]
    fit('気', 62, 110, 70, 60); fit('仙', 62, 175, 70, 60); fit('沼', 62, 240, 70, 60);
    fit('海の市', 290, 180, 360, 130);
    g.fillRect(40, 300, w - 80, 6);
    fit('シャークミュージアム', w / 2, 360, w - 70, 56);
    fit('SHARK MUSEUM', w / 2, 410, w - 200, 30, 700);
    // shark silhouette
    g.beginPath(); g.moveTo(40, 520); g.quadraticCurveTo(200, 450, 380, 500); g.lineTo(440, 440); g.lineTo(420, 515); g.lineTo(470, 560); g.lineTo(380, 530);
    g.quadraticCurveTo(250, 580, 120, 560); g.lineTo(90, 600); g.lineTo(95, 555); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(220, 480); g.lineTo(250, 420); g.lineTo(280, 485); g.fill();
  }, { key: 'lm4-umi-panel' });
  const pIchi = T.draw(256, 640, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b3423b'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#b3423b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [txt, y] of [['UMI', 180], ['ICHI', 440]]) { let s = 170; g.font = `900 ${s}px Arial Black, Helvetica, sans-serif`; while (s > 10 && g.measureText(txt).width > w * 0.84) { s -= 4; g.font = `900 ${s}px Arial Black, Helvetica, sans-serif`; } g.fillText(txt, w / 2, y); }
  }, { key: 'lm4-umi-ichi' });
  const pIce = T.draw(256, 400, (g, w, h) => {
    g.fillStyle = '#6e2a33'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f4f2ee'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#f4f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 52px ${FONT.sans}`;
    g.fillText('氷の水族館', w / 2, 90); g.font = `700 24px ${FONT.sans}`; g.fillText('- Ice Aquarium -', w / 2, 150);
    g.font = `700 30px ${FONT.sans}`; g.fillText('気仙沼 海の市', w / 2, 320);
  }, { key: 'lm4-umi-ice' });
  const face = (a, b, t, y, w, h, tex) => {
    const s = seg(a, b), cx = (NW[0] + SE[0]) / 2, cz = (NW[1] + SE[1]) / 2;
    let n = [s.uz, -s.ux]; if ((s.x - cx) * n[0] + (s.z - cz) * n[1] < 0) n = [-n[0], -n[1]];
    const x = a[0] + (b[0] - a[0]) * t + n[0] * 0.12, z = a[1] + (b[1] - a[1]) * t + n[1] * 0.12;
    k.plane(w, h, mapMat(ctx, 'toon', '#ffffff', tex, { paint: 0 }), [x, y, z], [0, Math.atan2(n[0], n[1]), 0]);
  };
  face(SW, NW, 0.3, g0 + 9.8, 6.2, 7.8, pUmi);        // west face, near the SW apex
  face(SE, SW, 0.72, g0 + 10.2, 3.4, 8.5, pIchi);     // south face, near the SW apex
  face(SW, NW, 0.78, g0 + 7.2, 2.8, 4.4, pIce);       // west face, toward the low north end
  // the east block: two storeys, flat grey roofs, the timber roof deck in an L, the footbridge north over the road
  const east = [[389.1, 631.9], [439.6, 644.5], [433.1, 670.2], [429.3, 676.7], [418.2, 673.9], [415.6, 684.4], [386.4, 673.0]];
  const eTop = g0 + 9.2;
  k.mesh(prismWalls(east, g0 - 1, eTop), m.wall);
  k.mesh(capGeo(east, eTop), m.concrete);
  parapet(k, east, eTop, 0.9, m.wall, m.wallPlain, 0.2);
  bandRing(k, east, g0 + 1.6, 2.5, m.win, { every: 5.5, gap: 1.2, minLen: 8 });
  bandRing(k, east, g0 + 6.0, 1.6, m.win, { every: 4.5, gap: 1.4, minLen: 8 });
  const deckL = [[383, 657], [431, 669.5], [428.5, 678], [381, 666.5]], deckN = [[405, 628], [415, 630.5], [407, 667], [397, 664.5]];
  // [v5:fix1] the roof deck is grey-brown (Earth 2026 top: a grey roof, no saturated orange T)
  for (const d of [deckL, deckN]) k.mesh(capGeo(d, eTop + 0.18, { tile: 3 }), m.umiDeck);
  // footbridge from the roof deck north over the road to the market block (the brown band on the ortho)
  {
    const a = [410.5, 634], b = [414.5, 614.5], s = seg(a, b), y = eTop + 0.2;
    k.box(4.2, 0.6, s.len, m.wallPlain, [s.x, y - 0.3, s.z], [0, s.rotY, 0]);
    k.box(4.0, 0.08, s.len, m.umiDeck, [s.x, y + 0.02, s.z], [0, s.rotY, 0]);
    for (const sd of [-1, 1]) k.box(0.12, 1.2, s.len, m.rail, [s.x + Math.cos(s.rotY) * sd * 2.0, y + 0.6, s.z - Math.sin(s.rotY) * sd * 2.0], [0, s.rotY, 0]);
    for (const p of [a, b]) k.box(0.8, y - g0, 0.8, m.wallPlain, [p[0], (y + g0) / 2, p[1]]);
  }
  // outside stair up the south side to the 2F (photo: the stair on the right of the apex), with its red rail
  {
    const a = [392, 676.2], b = [412, 681.3], s = seg(a, b), n = 8;
    for (let i = 0; i < n * 2; i++) { const t = (i + 0.5) / (n * 2); k.box(3.2, 0.18, s.len / (n * 2) + 0.05, m.concrete, [a[0] + (b[0] - a[0]) * t, g0 + (eTop - 3.5 - g0) * t, a[1] + (b[1] - a[1]) * t], [0, s.rotY, 0]); }
    barAlong(k, [a[0] + 0.5, a[1] - 1.8], [b[0] + 0.5, b[1] - 1.8], (g0 + eTop - 3.5) / 2 + 1, 0.08, 0.08, m.redPlain);
  }
  // lights: the apex floodlit warm at night, the shop front lamps
  registry(ctx)?.point({ x: SW[0] - 2, y: g0 + 5, z: SW[1] + 2, color: '#ffd9b0', size: 1.4, intensity: 1.2, mode: 'lamps' });
  out.halls.push({ ...(() => { const o = obbOf([NW, NE, SE, SW]); return { x: o.cx, z: o.cz, rotY: o.rotY, depth: o.w, len: o.d, h: ridge - g0 }; })() });
  const oe = obbOf(east); out.halls.push({ x: oe.cx, z: oe.cz, rotY: oe.rotY, depth: oe.w, len: oe.d, h: eTop - g0 });
  if (ctx.physics?.addBox) {
    const o = obbOf([NW, NE, SE, SW]); ctx.physics.addBox(o.cx, o.cz, o.w - 3, o.d - 3, o.rotY, g0, ridge);
    ctx.physics.addBox(oe.cx, oe.cz, oe.w, oe.d, oe.rotY, g0, eTop);
  }
  return { g0, ridge, eave };
}
