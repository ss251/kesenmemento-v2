// [v3:harbor] 気仙沼市魚市場: the quay-side fish market. Long white halls with low gable roofs parallel to the
// quay, a deep canopy over the unloading apron, roll-shutter bays, big blue lettering, belt conveyors from the
// boats, fish tubs and boxes, forklifts, small jib cranes and a truck crane.
//
//   buildFishMarket(ctx, a, b, { top, apron, depth, hallLen, seed })
//     a, b: [x, z] water edge of the market quay (water on the LEFT of a->b, as for buildQuay).
//   returns { quay, halls: [{ x, z, rotY, len, depth, h }], forklifts: [{ group, path }], workSpots: [Vector3],
//             berth: { a, b } (for mooreAlong), perches }
import { batchStatic } from '../../core/batch2.js';
import * as THREE from 'three';
import { segFrame, mapMat } from './util.js';
import { buildQuay } from './quay.js';
import { hmats, boxYard, boxStack, tub, bollard } from './props.js';
import { nightMat, addGlint, registry } from './lights.js';
import { textTex, FONT } from './util.js';

export function buildFishMarket(ctx, a, b, opts = {}) {
  const top = opts.top ?? 2.4, apron = opts.apron ?? 16, depth = opts.depth ?? 34, hallH = opts.hallH ?? 9.5;
  const F = segFrame(a, b), L = F.len, hz = L / 2;
  const r = ctx.rng(opts.seed ?? 'fishmarket');
  const M = hmats(ctx);
  // quay under everything (apron + halls + back yard)
  const quay = buildQuay(ctx, a, b, { kind: 'quay', top, apron: apron + depth + 10, props: false, bollardSpacing: 16, fenderSpacing: 8 });

  const g = new THREE.Group(); g.name = 'fishMarket';
  g.position.set(F.x, 0, F.z); g.rotation.y = F.rotY; ctx.addStatic(g); g.updateMatrixWorld(true);
  const k = ctx.kit(g);
  const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
  const out = { quay, halls: [], forklifts: [], workSpots: [], berth: { a, b }, perches: [...quay.perches, ...quay.bollards] };

  // halls along the quay
  const hallLen = opts.hallLen ?? 118, gap = 10;
  const n = Math.max(1, Math.floor((L - 8) / (hallLen + gap)));
  const used = n * hallLen + (n - 1) * gap, z0 = -used / 2;
  const xF = -apron, xB = -apron - depth, xc = (xF + xB) / 2;
  for (let i = 0; i < n; i++) {
    const za = z0 + i * (hallLen + gap), zb = za + hallLen;
    hallInto(ctx, k, { xF, xB, za, zb, top, hallH, i, toW, out, rotY: F.rotY, canopy: apron - 3.0 });
  }

  apronLife(ctx, k, M, r, { z0, used, top, apron, toW, out, rotY: F.rotY, L, opts });
  return out;
}

function marketMats(ctx) {
  if (ctx.__marketMats) return ctx.__marketMats;
  const wallM = ctx.mat.toon('#e9e8e1', { paint: 0.06 });
  const wallLow = ctx.mat.toon('#cfd6d6', { paint: 0.06 });
  const roofTex = ctx.tex.draw(128, 128, (c, w, h) => {
    c.fillStyle = '#dde2e1'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = '#c9d0d1'; c.fillRect(x, 0, 5, h); c.fillStyle = '#eef1ef'; c.fillRect(x + 6, 0, 3, h); }
  }, { key: 'harbor-roof-corrugated', repeat: [40, 1] });
  const roofM = mapMat(ctx, 'toon', '#ffffff', roofTex, { paint: 0.05 });
  const roofEdge = ctx.mat.toon('#4f76a6', { paint: 0 });
  const shutterTex = ctx.tex.draw(128, 128, (c, w, h) => {
    c.fillStyle = '#9fb0bd'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = '#8a9dab'; c.fillRect(0, y, w, 2); }
  }, { key: 'harbor-shutter' });
  const shutterM = mapMat(ctx, 'toon', '#ffffff', shutterTex, { paint: 0.02 });
  const openM = ctx.mat.toon('#5a6272', { paint: 0 });
  const colM = ctx.mat.toon('#d9dcd8', { paint: 0.04 });
  const floorM = ctx.mat.toon('#a9b2ae', { paint: 0.08 });
  const lampM = nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2);
  const winM = nightMat(ctx, '#7d93a8', '#ffe4b8', 1.3);

  const signTex = textTex(ctx, '気仙沼市魚市場', { w: 1024, h: 160, color: '#2f5f9c', font: FONT.sans, weight: 900, size: 0.78 });
  const signM = mapMat(ctx, 'decal', '#ffffff', signTex, { transparent: true, alphaTest: 0.3 });
  ctx.__marketMats = { wallM, wallLow, roofM, roofEdge, shutterM, openM, colM, floorM, lampM, winM, signM, gableM: ctx.mat.toon('#e9e8e1', { paint: 0.06, side: 'double' }) };
  return ctx.__marketMats;
}

/** One market hall in a frame where +X faces the water: x in [xB, xF], z in [za, zb]. canopy: cantilever width. */
function hallInto(ctx, k, H) {
  const { wallM, wallLow, roofM, roofEdge, shutterM, openM, colM, floorM, lampM, winM, signM, gableM } = marketMats(ctx);
  const { xF, xB, za, zb, top, hallH, i, toW, out, rotY } = H;
  const depth = xF - xB, xc = (xF + xB) / 2, hallLen = zb - za, zm = (za + zb) / 2, apron = (H.canopy ?? 13) + 3.0;
    // floor slab (raised 0.3 m, hygienic hall)
    k.box(depth, 0.3, hallLen, floorM, [xc, top + 0.15, zm]);
    // back wall + end walls full height; quay side: 2 m low wall band then open bays / shutters under the eave band
    k.box(0.4, hallH, hallLen, wallM, [xB + 0.2, top + hallH / 2, zm]);
    for (const z of [za, zb]) k.box(depth, hallH, 0.4, wallM, [xc, top + hallH / 2, z + (z === za ? 0.2 : -0.2)]);
    k.box(0.5, 2.2, hallLen, wallM, [xF - 0.25, top + hallH - 1.1, zm]);           // fascia band over the bays
    k.box(0.52, 0.35, hallLen, wallLow, [xF - 0.25, top + hallH - 2.35, zm]);
    // bays: columns every 10 m, alternate shutters and dark open bays
    const bays = Math.round(hallLen / 10);
    for (let j = 0; j <= bays; j++) {
      const z = za + j * (hallLen / bays);
      k.box(0.7, hallH - 2.2, 0.7, colM, [xF - 0.35, top + (hallH - 2.2) / 2, z]);
      if (j < bays) {
        const zc = z + hallLen / bays / 2, bw = hallLen / bays - 0.7;
        if ((j + i) % 3 === 1) k.box(0.12, hallH - 2.2 - 0.1, bw, shutterM, [xF - 0.2, top + (hallH - 2.3) / 2, zc]);
        else {
          k.box(0.1, hallH - 2.2, bw, openM, [xF - 3.5, top + (hallH - 2.2) / 2, zc]);   // dark interior read
          // hanging fluorescent lamps inside
          for (let q = -1; q <= 1; q += 2) k.box(0.2, 0.08, 1.4, lampM, [xF - 2.2, top + hallH - 2.8, zc + q * 2.2]);
        }
      }
    }
    // high window band on the back half
    for (let z = za + 3; z < zb - 2; z += 4.5) k.box(0.1, 0.8, 2.6, winM, [xB - 0.02, top + hallH - 2.0, z]);
    // gable roof, ridge along the hall; overhangs; blue fascia strip
    const rise = 3.2, ov = 0.9, halfD = depth / 2 + ov;
    const slope = Math.atan2(rise, depth / 2), sl = Math.hypot(halfD, rise * halfD / (depth / 2));
    for (const s of [-1, 1]) {
      const cx = xc + s * halfD / 2, cy = top + hallH + rise / 2 - 0.05;
      k.box(sl, 0.28, hallLen + 1.6, roofM, [cx, cy, zm], [0, 0, -s * slope]);
      k.box(0.12, 0.42, hallLen + 1.7, roofEdge, [xc + s * (halfD - 0.05), top + hallH - rise * ov / (depth / 2) - 0.15, zm]);
    }
    // [v3:fix] a ridge cap, panel seams and translucent skylight strips down both slopes (the roof read as one blank
    // grey slab from the drone); the skylights glow warm at night from the hall lights
    {
      const seamM = ctx.mat.toon('#aeb6b9', { paint: 0 }), ridgeM = ctx.mat.toon('#8f989e', { paint: 0 });
      const skyM = nightMat(ctx, '#a9c4d3', '#ffe9c4', 1.15);
      k.box(1.1, 0.22, hallLen + 1.6, ridgeM, [xc, top + hallH + rise + 0.06, zm]);
      for (const s of [-1, 1]) {
        const sg = new THREE.Group(); sg.position.set(xc + s * halfD / 2, top + hallH + rise / 2 - 0.05, zm); sg.rotation.z = -s * slope; k.parent.add(sg);
        const kk = ctx.kit(sg);
        for (let z = -hallLen / 2 + 4; z < hallLen / 2 - 1; z += 4) kk.box(sl - 0.3, 0.05, 0.14, seamM, [0, 0.165, z]);
        for (let z = -hallLen / 2 + 9; z < hallLen / 2 - 6; z += 13) kk.box(sl * 0.64, 0.05, 1.6, skyM, [s * sl * 0.06, 0.17, z]);
        kk.box(sl - 0.3, 0.05, 0.3, seamM, [0, 0.165, -hallLen / 2 - 0.3]); kk.box(sl - 0.3, 0.05, 0.3, seamM, [0, 0.165, hallLen / 2 + 0.3]);
      }
    }
    for (const z of [za - 0.8, zb + 0.8]) {
      const tri = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, rise)].map((p) => p));
      const tg = new THREE.ShapeGeometry(tri); const m = k.mesh(tg, wallM, [xc, top + hallH, z + (z < zm ? 0.8 : -0.8)], [0, z < zm ? Math.PI : 0, 0]);
      m.material = gableM;
    }
    // lettering on the fascia (faces the water, +X) — every hall
    k.plane(Math.min(26, hallLen * 0.3), 4.0, signM, [xF + 0.02, top + hallH - 1.1, zm], [0, Math.PI / 2, 0]);
    // roof vents
    for (let z = za + 12; z < zb - 6; z += 18) k.rbox(1.6, 1.0, 3.2, 0.1, wallLow, [xc, top + hallH + rise + 0.2, z]);
    // canopy (庇) over the apron: cantilevered slab, slightly tilted, on slim columns at the water side
    const cw = apron - 3.0;
    k.box(cw, 0.35, hallLen, roofM, [xF + cw / 2, top + hallH - 2.6, zm], [0, 0, 0.03]);
    k.box(0.12, 0.6, hallLen, roofEdge, [xF + cw, top + hallH - 2.35 + cw * 0.03, zm]);
    { const seamM = ctx.mat.toon('#aeb6b9', { paint: 0 }); for (let z = za + 3; z < zb - 1; z += 3) k.box(cw - 0.2, 0.04, 0.1, seamM, [xF + cw / 2, top + hallH - 2.6 + 0.19, z], [0, 0, 0.03]); }   // [v3:fix] canopy panel seams
    for (let z = za + 2; z <= zb - 1; z += 12) {
      k.cyl(0.22, 0.22, hallH - 2.8, colM, [xF + cw - 0.6, top + (hallH - 2.8) / 2, z], null, 10);
      out.perches.push(toW(xF + cw - 0.2, top + hallH - 2.1, z));
    }
    // canopy lamps (lit at night) + glints on the water
    for (let z = za + 6; z < zb; z += 12) {
      k.box(0.9, 0.12, 0.4, lampM, [xF + cw * 0.5, top + hallH - 2.82, z]);
      const w = toW(3, 0, z); addGlint(ctx, w.x, 0, w.z, '#ffe6c0', 0.8, 12, 0.7);
    }
    out.halls.push({ ...(() => { const c = toW(xc, 0, zm); return { x: c.x, z: c.z }; })(), rotY, len: hallLen, depth, h: hallH + rise });
    if (ctx.physics?.addBox) { const n = Math.max(1, Math.ceil(hallLen / 20)); for (let q = 0; q < n; q++) { const zq = za + (q + 0.5) * hallLen / n, c = toW(xc, 0, zq); ctx.physics.addBox(c.x, c.z, depth, hallLen / n, rotY, top, top + hallH + rise); } }
  }

/** Quay-apron life in a frame where x = 0 is the quay edge (+X water), land toward -X, along z in [z0, z0 + used]. */
function apronLife(ctx, k, M, r, E) {
  const { z0, used, top, apron, toW, out, rotY, L, opts = {} } = E;
  const { lampM } = marketMats(ctx);
  // apron life: tubs rows, box yards, conveyors to the berth, forklifts, jib cranes, a truck crane
  const workZ = [];
  for (let z = z0 + 8; z < z0 + used - 8; z += r.range(16, 26)) workZ.push(z);
  workZ.forEach((z, i) => {
    const kind = i % 4;
    if (kind === 0) { for (let q = 0; q < 6; q++) tub(k, M, -4.5 - (q % 3) * 1.5, top, z + Math.floor(q / 3) * 1.3, r.range(-0.1, 0.1)); }
    if (kind === 1) boxYard(k, M, -6, top, z, { cols: 4, rows: 3, rng: r, colors: ['blue', 'blue', 'white', 'white', 'orange'] });
    if (kind === 2) conveyor(ctx, k, M, z, top);
    if (kind === 3) jibCrane(ctx, k, M, -2.2, top, z, r);
    out.workSpots.push(toW(-4, top, z + 3));
  });
  // forklifts (dynamic: ferry tubs up and down the apron as a pure function of t)
  const nF = opts.forklifts ?? Math.min(6, Math.max(2, Math.round(L / 120)));
  for (let i = 0; i < nF; i++) {
    const f = forklift(ctx, M, r, i);
    try { batchStatic(f, { mat: ctx.mat, nearCell: 1000, farCell: 1000, farR: 1e9 }); f.traverse((o) => { o.userData.dynamic = true; o.matrixAutoUpdate = true; }); } catch (e) { /* unbatched still renders */ }
    const lane = -7.5 - (i % 2) * 3.2, zA = z0 + (i + 0.2) * used / nF, zB = zA + used / nF * 0.6;
    const speed = 2.2 + r() * 0.8, phase = r() * 100;
    f.position.copy(toW(lane, top, zA)); f.rotation.y = rotY;
    ctx.add(f);
    const pA = toW(lane, top, zA), pB = toW(lane, top, zB), len = pA.distanceTo(pB);
    ctx.onUpdate((dt, t) => {
      const T = (t * speed + phase) % (2 * len + 8), dir = T < len + 4 ? 1 : -1;
      const s = Math.min(len, Math.max(0, dir > 0 ? T - 2 : 2 * len + 6 - T));
      f.position.lerpVectors(pA, pB, s / len); f.position.y = top;
      f.rotation.y = rotY + (dir > 0 ? 0 : Math.PI);
    });
    out.forklifts.push({ group: f, path: [pA, pB] });
  }
  // a truck crane parked at the back of the apron
  truckCrane(ctx, k, M, -apron + 3.2, top, z0 + used * 0.62);
  // fixed quay lamps (tall poles) along the apron edge with pools
  const poleM = ctx.mat.toon('#8e969d', { paint: 0 });
  for (let z = z0 + 20; z < z0 + used; z += 40) {
    k.cyl(0.14, 0.2, 14, poleM, [-apron + 1.2, top + 7, z], null, 8);
    k.box(1.6, 0.35, 0.6, poleM, [-apron + 1.6, top + 14, z]);
    k.box(1.4, 0.1, 0.5, lampM, [-apron + 1.6, top + 13.8, z]);
    const w = toW(-apron + 1.6, top + 13.7, z);
    registry(ctx)?.streetlight({ x: w.x, y: w.y, z: w.z, groundY: top, poolR: 9 });
  }
}

// ------------------------------------------------------------------------------------------------ machines
function forklift(ctx, M, r, i) {
  const g = new THREE.Group(); g.name = 'forklift';
  const k = ctx.kit(g);
  const body = ctx.mat.toon(i % 3 === 0 ? '#e38b2f' : i % 3 === 1 ? '#e9c24a' : '#d9d9cf', { paint: 0.03 });
  const dark = ctx.mat.toon('#3f414b', { paint: 0 });
  k.rbox(1.1, 0.8, 2.2, 0.12, body, [0, 0.75, -0.2]);
  k.rbox(1.05, 0.7, 0.6, 0.12, body, [0, 1.0, -1.2]);                // counterweight
  k.box(0.5, 0.1, 0.5, dark, [0, 1.25, -0.3]);                        // seat
  // overhead guard
  for (const x of [-0.5, 0.5]) for (const z of [-0.8, 0.5]) k.box(0.06, 1.2, 0.06, dark, [x, 1.75, z]);
  k.box(1.1, 0.06, 1.4, dark, [0, 2.35, -0.15]);
  // mast + forks + a load of tubs
  for (const x of [-0.35, 0.35]) k.box(0.1, 2.4, 0.12, dark, [x, 1.3, 1.05]);
  for (const x of [-0.3, 0.3]) k.box(0.1, 0.05, 1.1, dark, [x, 0.2, 1.6]);
  k.rbox(1.1, 0.8, 1.0, 0.08, M.tubBlue, [0, 0.62, 1.65]);
  // wheels
  const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).rotateZ(Math.PI / 2);
  for (const x of [-0.55, 0.55]) for (const z of [0.7, -1.0]) k.mesh(wg, dark, [x, 0.3, z]);
  return g;
}

function conveyor(ctx, k, M, z, top) {
  // belt conveyor from the quay edge out over a moored boat's rail (rises toward the water)
  const frame = ctx.mat.toon('#d5d8d4', { paint: 0.02 }), belt = ctx.mat.toon('#4a4e58', { paint: 0 });
  const len = 7, ang = 0.28;
  const cx = -1.5 + Math.cos(ang) * len / 2 - 1, cy = top + 1.1 + Math.sin(ang) * len / 2;
  k.box(len, 0.25, 0.9, frame, [cx, cy, z], [0, 0, ang]);
  k.box(len, 0.06, 0.7, belt, [cx, cy + 0.15, z], [0, 0, ang]);
  for (const s of [-0.4, 0.4]) { k.box(0.1, 1.0, 0.1, frame, [-2.2, top + 0.5, z + s]); k.box(0.1, 2.3, 0.1, frame, [1.8, top + 1.15, z + s]); }
  // fish on the belt: silvery skipjack shapes
  const fish = ctx.mat.toon('#7d8fa6', { paint: 0 });
  for (let i = 0; i < 4; i++) {
    const t = -len / 2 + 1 + i * 1.5;
    k.mesh(new THREE.SphereGeometry(0.1, 8, 6), fish, [cx + Math.cos(ang) * t, cy + 0.26 + Math.sin(ang) * t, z + (i % 2 ? 0.12 : -0.12)], [0, 0, ang], [3.6, 1, 1.2]);
  }
  boxStack(k, M, -2.6, top, z - 1.3, { n: 4, color: 'white' });
  tub(k, M, -3, top, z + 1.3);
}

function jibCrane(ctx, k, M, x, y, z, r) {
  const yel = ctx.mat.toon('#e9b93a', { paint: 0.03 }), dark = ctx.mat.toon('#3f414b');
  k.cyl(0.35, 0.45, 5.5, yel, [x, y + 2.75, z], null, 10);
  k.box(1.1, 0.8, 1.1, yel, [x, y + 5.6, z]);
  const ang = r.range(-0.9, 0.9), len = 8;
  const bx = x + Math.cos(ang) * len / 2 * 0.95, bz = z + Math.sin(ang) * len / 2 * 0.95;
  k.box(len, 0.35, 0.35, yel, [bx, y + 6.6, bz], [0, -ang, 0.22]);
  const tip = [x + Math.cos(ang) * len * 0.95, y + 6.6 + Math.sin(0.22) * len / 2, z + Math.sin(ang) * len * 0.95];
  k.box(0.08, 3.2, 0.08, dark, [tip[0], tip[1] - 1.6, tip[2]]);
  k.box(0.35, 0.3, 0.35, yel, [tip[0], tip[1] - 3.3, tip[2]]);
}

function truckCrane(ctx, k, M, x, y, z) {
  const cab = ctx.mat.toon('#e6e6df', { paint: 0.03 }), blue = ctx.mat.toon('#3f6fa8', { paint: 0.03 }), dark = ctx.mat.toon('#3f414b'), yel = ctx.mat.toon('#e9b93a');
  const g = k.group([x, y, z], 0); const kk = ctx.kit(g);
  kk.rbox(2.1, 2.2, 2.0, 0.15, cab, [0, 1.5, 3.6]);
  kk.box(1.9, 0.8, 0.08, ctx.mat.toon('#5b6c80'), [0, 2.0, 4.61]);
  kk.box(2.2, 0.3, 7.4, dark, [0, 0.8, 0.4]);
  kk.box(2.2, 0.9, 4.2, blue, [0, 1.4, -0.8]);
  for (const s of [-1, 1]) kk.box(0.05, 0.9, 4.2, cab, [s * 1.12, 1.4, -0.8]);
  kk.box(0.9, 0.9, 1.0, yel, [0, 2.2, 2.2]);
  kk.box(0.4, 0.4, 5.2, yel, [0, 3.0, 0.2], [0.18, 0, 0]);
  const wg = new THREE.CylinderGeometry(0.48, 0.48, 0.35, 14).rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) for (const zz of [3.4, -0.8, -2.2]) kk.mesh(wg, dark, [s * 1.0, 0.48, zz]);
}

// ------------------------------------------------------------------------------------------------ from layout lots
/**
 * The market on the real layout: one hall per landmark lot (layout LOTS with kind 'landmark', e.g. the 4 気仙沼市魚市場
 * sheds), the canopy and apron life on the side that faces the nearest sea. isWater(x, z) defaults to ctx.L.isWater.
 * Returns the same shape as buildFishMarket (minus quay; the quay edge comes from buildHarbor / buildQuay).
 */
export function buildFishMarketLots(ctx, lots, opts = {}) {
  const isWater = opts.isWater || ctx.L?.isWater || (() => false);
  const M = hmats(ctx);
  const out = { halls: [], forklifts: [], workSpots: [], perches: [], berths: [] };
  lots.forEach((lot, i) => {
    const o = lot.obb; const c = Math.cos(o.rotY), s = Math.sin(o.rotY);
    const ax = [c, -s], az = [s, c];                        // lot local +X and +Z in world XZ
    const longX = o.w >= o.d, long = Math.max(o.w, o.d), short = Math.min(o.w, o.d);
    const perp = longX ? az : ax, along = longX ? ax : az;
    // water distance on both sides of the long axis
    const dist = (dir) => { for (let d = short / 2; d < short / 2 + 140; d += 2) if (isWater(o.cx + dir[0] * d, o.cz + dir[1] * d)) return d; return Infinity; };
    const dp = dist(perp), dn = dist([-perp[0], -perp[1]]);
    const dir = dp <= dn ? perp : [-perp[0], -perp[1]], wd = Math.min(dp, dn);
    const r = ctx.rng(opts.seed ?? `market|${lot.id}`);
    const g = new THREE.Group(); g.name = 'fishMarket:' + lot.id;
    // group +X = toward the water, +Z = along the hall
    g.position.set(o.cx, 0, o.cz); g.rotation.y = Math.atan2(-dir[1], dir[0]);
    ctx.addStatic(g); g.updateMatrixWorld(true);
    // make sure +Z is along the long axis (it is by construction: +Z = +X rotated by -90 deg around Y)
    void along;
    const k = ctx.kit(g);
    const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
    // deck height: the lot's ground or the quay top next to it, whichever is higher (the working apron is one level)
    let qTop = 0;
    for (const q of ctx.L?.QUAYS || []) { const mx = (q.a[0] + q.b[0]) / 2, mz = (q.a[1] + q.b[1]) / 2; if (Math.hypot(mx - o.cx, mz - o.cz) < long / 2 + 40) qTop = Math.max(qTop, q.top || 0); }
    const top = opts.top ?? Math.max(lot.groundY ?? 1.8, Math.min(2.4, qTop));
    const hallH = Math.max(7.5, Math.min(12, lot.height || 9.5));
    const apronW = Number.isFinite(wd) ? wd - short / 2 : 0;
    const canopy = Math.max(3, Math.min(12, apronW - 2.5));
    // one paved deck under the hall and across the unloading apron to the quay edge (the aerial photo is all concrete
    // here; without it the terrain skin shows grass and the hall floats over low ground)
    {
      const x1 = Number.isFinite(wd) ? wd - 0.4 : short / 2 + 2, x0 = -short / 2 - 2, base = Math.min(0, (lot.groundY ?? 1) - 1.5);
      k.box(x1 - x0, top - base, long + 3, M.concreteLight, [(x0 + x1) / 2, (top + base) / 2 - 0.02, 0]);
      for (let z = -long / 2 + 6; z < long / 2 - 4; z += 9) k.box(0.12, 0.012, 3.2, M.yellow || M.concreteDark, [x1 - 5.5, top + 0.008, z]);   // painted lane dashes
    }
    hallInto(ctx, k, { xF: short / 2, xB: -short / 2, za: -long / 2 + 0.5, zb: long / 2 - 0.5, top, hallH, i, toW, out, rotY: g.rotation.y, canopy });
    if (apronW > 8 && opts.apronLife !== false) {
      const sub = new THREE.Group(); sub.position.set(wd - 0.2, 0, 0); g.add(sub); sub.updateMatrixWorld(true);
      const ks = ctx.kit(sub);
      const toWs = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(sub.matrixWorld);
      apronLife(ctx, ks, M, r, { z0: -long / 2 + 4, used: long - 8, top, apron: apronW, toW: toWs, out, rotY: g.rotation.y, L: long, opts: { forklifts: Math.max(1, Math.round(long / 90)) } });
      const ea = toWs(0, 0, -long / 2), eb = toWs(0, 0, long / 2);
      out.berths.push({ a: [ea.x, ea.z], b: [eb.x, eb.z], top });
    }
  });
  return out;
}
