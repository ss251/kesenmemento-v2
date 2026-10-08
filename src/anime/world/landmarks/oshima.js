// [v4:landmarks-B] 大島: 亀山 and 浦の浜 (docs/anime/landmarks/oshima-kameyama.md, oshima-ferry-pier.md).
//   亀山テラス360° (opened 2026-07-19; 気仙沼市「亀山通信」 3, 5, 7): the monorail from the 亀山駐車場 at mid-slope to
//     the summit (2 fully glazed cars of 20, 409 m, 6–7 min one way; a steel track on posts with an inspection walk),
//     the 駐車場駅舎 and the 待合・休憩棟 in dark timber with gable roofs, the parking toilet block, the 山頂駅舎, the
//     timber café + toilet building, the terraces with outdoor sofas (terrace 1: a three-tier timber deck, 49 sofas),
//     亀山ほしのてらす, and the two old rest houses kept as event space (第1: the fan-shaped hall; 第2: teal roof).
//     The cars run the real rhythm: 7 min up, a 3 min stop, 7 min down, a 3 min stop (a 20 min round trip).
//   浦の浜: the 気仙沼大島ウェルカム・ターミナル (timber, one storey, 468 m², a terrace facing the bay) and the
//     floating pier of the 気仙沼ベイクルーズ on its gangway, and the fishing-boat jetty of the basin.
import * as THREE from 'three';
import { drapeTriangles } from '../town/landuse.js';
import { extrude } from '../../core/geo.js';
import { KAMEYAMA, URANOHAMA } from './sites.js';
import { group, obbOf, obbPt, groundSpan, pitchedRoof, prismWalls, capGeo, colliders, wallGeo, facadeMat, paintWindow, mapMat, textTex, FONT, nightMat, sign, frame, centroid } from './kit.js';

const TIMBER = '#b08a62', DARK = '#3a3634', CREAM = '#e7dcc4';

/**
 * [v6:outside-kameyama-summit] The summit promenade of 亀山テラス360°: a terracotta-red rubber-surfaced path (about 2.5 m wide,
 * #9e6e70 sampled on the Commons photo 'Kameyama Terrace 360°', 2026-08) with a flush 0.35 m dark grey gravel strip on both
 * edges, along the ridge from the 山頂駅 to the east terrace (ほしのてらす). APPROXIMATE: the route is traced from the
 * pre-opening Google Earth strip (imagery 2026-03-11, the path was not yet surfaced); no post-July 2026 capture of the top view
 * exists yet. Re-trace it from one and add any spur from the station to terrace 1 that it shows.
 */
export const PROMENADE = { approx: true, width: 2.5, edge: 0.35, ctrl: [[3729, 3640], [3760, 3636], [3800, 3637], [3843, 3638]] };

/** Polyline helpers: resampled points with arclength, and a point at s. */
function railSamples(L, pts, step = 3) {
  const out = []; let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
    for (let j = (i ? 1 : 0); j <= n; j++) { const u = j / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u; if (out.length) s += Math.hypot(x - out.at(-1).x, z - out.at(-1).z); out.push({ x, z, s, g: L.heightAt(x, z) }); }
  }
  // the track: at least 1.6 m over the ground, smoothed so the gradient changes gently (a rack monorail climbs ≤ ~45 %)
  for (const p of out) p.y = p.g + 1.6;
  for (let it = 0; it < 6; it++) for (let i = 1; i < out.length - 1; i++) out[i].y = Math.max(out[i].g + 1.2, (out[i - 1].y + out[i].y * 2 + out[i + 1].y) / 4);
  return out;
}
function at(S, s) {
  s = Math.max(0, Math.min(S.at(-1).s, s));
  let i = 1; while (i < S.length - 1 && S[i].s < s) i++;
  const a = S[i - 1], b = S[i], u = (s - a.s) / ((b.s - a.s) || 1);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, ux: (b.x - a.x) / ((b.s - a.s) || 1), uz: (b.z - a.z) / ((b.s - a.s) || 1), grade: (b.y - a.y) / ((b.s - a.s) || 1) };
}

/** A small timber / dark-clad gable building on a frame (w across, d along the ridge). */
function gableHouse(ctx, k, o, y0, h, { wall = DARK, roof = '#4a4f57', soffit = CREAM, glass = true, pitch = 0.75 } = {}) {
  const t = (c, p) => ctx.mat.toon(c, p);
  const G = k.group([o.cx, y0, o.cz], o.rotY), kk = ctx.kit(G);
  kk.boxB(o.w + 0.6, 0.4, o.d + 0.6, t('#a9a7a0', { paint: 0.05 }), [0, -0.3, 0]);
  kk.boxB(o.w, h, o.d, t(wall, { paint: 0.05 }), [0, 0, 0]);
  if (glass) for (const s of [-1, 1]) kk.box(0.06, h * 0.55, o.d * 0.7, nightMat(ctx, '#7f98aa', '#ffe2b8', 1.3), [s * (o.w / 2 + 0.02), h * 0.45, 0]);
  const R = pitchedRoof({ cx: 0, cz: 0, w: o.w, d: o.d, rotY: 0, ux: 0, uz: 1 }, h, { kind: 'gable', pitch, over: 0.8 });
  kk.mesh(R.roof, t(roof, { paint: 0.04 })); kk.mesh(R.fascia, t(soffit, { paint: 0 })); if (R.gables) kk.mesh(R.gables, t(wall, { paint: 0.04 }));
  colliders(ctx, [obbPt(o, -o.w / 2, -o.d / 2), obbPt(o, o.w / 2, -o.d / 2), obbPt(o, o.w / 2, o.d / 2), obbPt(o, -o.w / 2, o.d / 2)], y0 - 2, y0 + h + 1);
  return G;
}

/**
 * Outdoor sofas on a deck, facing the view (+z). [v4:polish1] The 49 seats of terrace 1 (亀山通信) are grouped into
 * sofa sets of about six seats: a three-seat rattan sofa with arms and loose cushions (cream or charcoal, alternating)
 * and a low table in front, spaced across the tier so the deck and its view edge stay open (the v3 grid of ~30
 * identical boxes read as a car park). Returns the set centres.
 */
function sofas(ctx, kk, sets, w, d, y, seed = 0) {
  const t = (c, p) => ctx.mat.toon(c, p), frameM = t('#6b5140', { paint: 0.04 }), cushA = t('#e6dfd0', { paint: 0.02 }), cushB = t('#4a4a4e', { paint: 0.02 }), table = t('#8a6a4a', { paint: 0.04 });
  const out = [];
  if (sets <= 0) return out;
  const gap = w / sets, z = -d / 2 + Math.min(1.3, d * 0.3);
  for (let i = 0; i < sets; i++) {
    const x = -w / 2 + gap * (i + 0.5), cm = (i + seed) % 2 ? cushB : cushA, rot = ((i * 37 + seed * 11) % 7 - 3) * 0.03;
    const G = kk.group([x, y, z], rot), k2 = ctx.kit(G);
    k2.boxB(2.5, 0.36, 0.9, frameM, [0, 0, 0]);                          // the base
    k2.boxB(2.5, 0.48, 0.2, frameM, [0, 0.36, -0.36]);                   // the back
    for (const s2 of [-1, 1]) k2.boxB(0.18, 0.62, 0.9, frameM, [s2 * 1.26, 0, 0]);   // arms
    for (let c = -1; c <= 1; c++) { k2.boxB(0.74, 0.14, 0.66, cm, [c * 0.78, 0.36, 0.06]); k2.boxB(0.66, 0.4, 0.12, cm, [c * 0.78, 0.46, -0.22], [-0.18, 0, 0]); }
    k2.boxB(1.0, 0.34, 0.55, table, [0, 0, 1.15]);                       // the low table
    out.push([x, z]);
  }
  return out;
}

/** [v4:polish1] Deck planks: seams every 0.5 m and alternate boards a shade lighter, across a w x d tier. */
function planks(ctx, kk, w, d, y, zc) {
  const seam = ctx.mat.toon('#7d5e40', { paint: 0.02 }), light = ctx.mat.toon('#c19a70', { paint: 0.05 });
  let i = 0;
  for (let z = -d / 2 + 0.5; z < d / 2 - 0.05; z += 0.5, i++) {
    kk.box(w - 0.1, 0.012, 0.035, seam, [0, y + 0.006, zc + z]);
    if (i % 2 === 0) kk.box(w - 0.1, 0.008, 0.46, light, [0, y + 0.004, zc + z + 0.25]);
  }
}

export function buildOshima(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o), K = KAMEYAMA;
  const { k } = group(ctx, 'lmB-oshima');
  const out = {};
  // ================================================================ the monorail
  const S = railSamples(L, K.rail, 3), len = S.at(-1).s;
  {
    // [v6:outside-kameyama-summit] the track as photographed (Commons 2026-08 'Between Stations', 'Monorail and Oshima Below'): a
    // dark brown steel truss (a top and a bottom chord with diagonal web bars) carrying the rack rail and the inspection walk,
    // on splayed A-frame leg pairs with a tie bar at mid height, each leg on a pale concrete footing block
    const STEEL = '#3b322d', beam = t(STEEL, { paint: 0.02 }), post = t(STEEL, { paint: 0.02 }), grate = t(STEEL, { paint: 0.02 }), rail = t('#2b2926', { paint: 0 }), foot = t('#d8dad6', { paint: 0.03 });
    const LEAN = 8 * Math.PI / 180;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2, l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const ry = Math.atan2(b.x - a.x, b.z - a.z), pitch = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      const B = k.group([mx, my, mz], ry); B.rotation.x = pitch; B.rotation.order = 'YXZ'; const kb = ctx.kit(B);
      kb.box(0.5, 0.1, l + 0.05, beam, [0, 0.27, 0]);               // the top chord and the rack plate
      kb.box(0.34, 0.1, l + 0.05, beam, [0, -0.27, 0]);             // the bottom chord
      const dl = Math.hypot(l, 0.44), da = Math.atan2(0.44, l) * (i % 2 ? 1 : -1);
      for (const sx of [-0.2, 0.2]) kb.box(0.06, 0.06, dl, beam, [sx, 0, 0], [da, 0, 0]);   // the diagonal web bars, one per bay, alternating
      kb.box(0.9, 0.06, l + 0.05, grate, [1.1, -0.2, 0]);          // the inspection walk
      kb.box(0.04, 0.04, l, rail, [1.55, 0.8, 0]);                 // its hand rail
      if (i % 2 === 0) kb.box(0.04, 1.0, 0.04, rail, [1.55, 0.3, 0]);
      if (i % 2 === 0) {
        // the A-frame: two legs lean +-8 deg across the track, meeting under the girder; a tie bar at mid height; a footing block under each
        const top = a.y - 0.32, G = k.group([a.x, 0, a.z], ry), kg2 = ctx.kit(G), cs = Math.cos(ry), sn = Math.sin(ry);
        const legs = [];
        for (const sg of [-1, 1]) {
          const bx0 = sg * (0.3 + (top - a.g) * Math.tan(LEAN)), gb0 = L.heightAt(a.x + bx0 * cs, a.z - bx0 * sn);
          const H = Math.max(0.3, top - (gb0 + 0.3)), bx = sg * (0.3 + H * Math.tan(LEAN)), gb = L.heightAt(a.x + bx * cs, a.z - bx * sn), Hf = Math.max(0.3, top - (gb + 0.3));
          kg2.box(0.22, Hf / Math.cos(LEAN), 0.22, post, [sg * (0.3 + (Hf / 2) * Math.tan(LEAN)), gb + 0.3 + Hf / 2, 0], [0, 0, sg * LEAN]);
          kg2.box(0.6, 0.4, 0.6, foot, [sg * (0.3 + Hf * Math.tan(LEAN)), gb + 0.1, 0]);   // the pale concrete footing block
          legs.push({ sg, H: Hf });
        }
        const H = Math.min(legs[0].H, legs[1].H);
        if (H > 1.1) { const ym = top - H / 2, hw = 0.3 + (H / 2) * Math.tan(LEAN); kg2.box(2 * hw, 0.12, 0.12, post, [0, ym, 0]); }
      }
    }
    // the train: two fully glazed cars, kept level on the slope; animated. [v6:outside-kameyama-summit] Commons 2026-08 ('Monorail
    // and Oshima Below'): a white body (#f5f8f9) over a deep blue skirt (#1f518f) tapering to a wedge, a thin gold pinstripe at the
    // seam, black-framed glazing above and a white roof with an air-conditioner box
    const train = new THREE.Group(); train.name = 'lmB-monorail';
    const cars = [];
    const skirtGeo = extrude([[-1.15, 0.5], [1.15, 0.5], [0.78, 0], [-0.78, 0]], 3.6);
    for (let c = 0; c < 2; c++) {
      const car = new THREE.Group(), kc = ctx.kit(car);
      kc.mesh(skirtGeo, t('#1a4c9a', { paint: 0 }));                                             // the blue skirt, 0.5 m, wedge underside
      kc.boxB(2.32, 0.06, 3.62, t('#d4b04a', { paint: 0 }), [0, 0.5, 0]);                        // the gold band at the seam
      kc.boxB(2.3, 1.1, 3.6, t('#f4f6f6', { paint: 0 }), [0, 0.56, 0]);                          // the white lower body, 1.1 m
      kc.boxB(2.2, 1.5, 3.4, t('#a9c3d3', { paint: 0.0, transparent: true, opacity: 0.55 }), [0, 1.66, 0]);   // the glazing
      for (const [x, z] of [[-1.1, -1.7], [1.1, -1.7], [1.1, 1.7], [-1.1, 1.7]]) kc.boxB(0.08, 1.5, 0.08, t('#2a2d33', { paint: 0 }), [x, 1.66, z]);
      kc.boxB(2.24, 0.06, 3.44, t('#2a2d33', { paint: 0 }), [0, 1.66, 0]);                      // the black sill frame
      kc.boxB(2.4, 0.2, 3.7, t('#f2f2ee', { paint: 0 }), [0, 3.16, 0]);                          // the white roof slab
      kc.boxB(1.0, 0.35, 0.7, t('#eef0f0', { paint: 0 }), [-0.3, 3.36, -0.9]);                   // the air-conditioner unit
      for (const sx of [-1, 1]) kc.boxB(0.04, 0.04, 3.2, t('#9aa0a8', { paint: 0 }), [sx * 1.0, 2.62, 0]);   // the inside hand rails (passengers stand)
      kc.box(0.4, 0.8, 3.4, t('#3a3f47', { paint: 0 }), [0, -0.1, 0]);
      train.add(car); cars.push(car);
    }
    ctx.add(train);
    const place = (s) => {
      for (let c = 0; c < 2; c++) {
        const p = at(S, s - c * 4.0), car = cars[c];
        car.position.set(p.x, p.y + 0.3, p.z); car.rotation.set(0, Math.atan2(p.ux, p.uz), 0);
      }
    };
    // 20 min cycle: 0–420 s up, 420–600 s at the top, 600–1020 s down, 1020–1200 s at the bottom
    const pos = (tt) => { const c = ((tt % 1200) + 1200) % 1200; const e = (u) => u * u * (3 - 2 * u); if (c < 420) return 6 + (len - 12) * e(c / 420); if (c < 600) return len - 6; if (c < 1020) return len - 6 - (len - 12) * e((c - 600) / 420); return 6; };
    place(pos(0));
    ctx.onUpdate((dt, tt) => place(pos(tt)));
    let len3 = 0; for (let i = 1; i < S.length; i++) len3 += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y, S[i].z - S[i - 1].z);
    out.monorail = { length: Math.round(len), length3d: Math.round(len3), bottom: [S[0].x, S[0].z, S[0].y], top: [S.at(-1).x, S.at(-1).z, S.at(-1).y], rise: Math.round(S.at(-1).y - S[0].y) };
    ctx.services.monorail = { length: len, at: (s) => at(S, s), pos };
  }
  // ================================================================ the lower station, waiting building, toilets
  {
    const p0 = S[0], dir = Math.atan2(S[1].x - p0.x, S[1].z - p0.z);
    const st = frame(p0.x - Math.sin(dir) * 6, p0.z - Math.cos(dir) * 6, 9, 16, dir);
    gableHouse(ctx, k, st, p0.g + 0.2, 4.2, { wall: DARK, roof: '#2f3338', soffit: CREAM, pitch: 0.95 });
    const side = [Math.cos(dir), -Math.sin(dir)];
    const wt = frame(st.cx + side[0] * 12, st.cz + side[1] * 12, 8, 14, dir + 0.2);
    gableHouse(ctx, k, wt, L.heightAt(wt.cx, wt.cz) + 0.2, 3.6, { wall: '#4a4440', roof: '#3b4046', soffit: CREAM, pitch: 0.7 });
    const pk = K.parking.poly, pc = centroid(pk), wc = frame(pc[0] + 28, pc[1] - 4, 6, 9, 0);
    gableHouse(ctx, k, wc, L.heightAt(wc.cx, wc.cz) + 0.2, 3.0, { wall: '#d9d2c3', roof: '#4a4f57', soffit: CREAM, glass: false, pitch: 0.5 });
    // the 亀山駐車場 (92 cars, 3 buses, 18 motorcycles; the city): asphalt draped on the ground with stall lines
    {
      const tris = drapeTriangles(K.parking.poly, [], 6), pos = [];
      for (const [x, z] of tris) pos.push(x, L.heightAt(x, z) + 0.06, z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, t('#8e9197', { paint: 0.04, side: 'double', polygonOffset: -0.6 })); m.receiveShadow = true; k.parent.add(m);
      const po = obbOf(K.parking.poly), line = t('#f2f2ee', { paint: 0 });
      for (let u = -po.w / 2 + 2; u < po.w / 2 - 1; u += 2.5) for (const v of [-po.d / 2 + 5, po.d / 2 - 5]) { const p = obbPt(po, u, v); k.box(0.12, 0.03, 5, line, [p[0], L.heightAt(p[0], p[1]) + 0.1, p[1]], [0, po.rotY, 0]); }
    }
    const sg = [st.cx - side[0] * 6, st.cz - side[1] * 6];
    sign(ctx, k, '亀山モノレール  駐車場駅', 4.2, 0.7, sg[0], L.heightAt(...sg) + 2.4, sg[1], dir + Math.PI, { color: '#f4efe2', bg: '#2e3a4a' });
    out.lower = { x: st.cx, z: st.cz, y: p0.g };
  }
  // ================================================================ the summit
  {
    const pN = S.at(-1), dir = Math.atan2(pN.x - S.at(-2).x, pN.z - S.at(-2).z);
    const us = frame(pN.x + Math.sin(dir) * 5, pN.z + Math.cos(dir) * 5, K.upperStation.wid, K.upperStation.len, dir);
    const uy = L.heightAt(us.cx, us.cz) + 0.3;
    const G = k.group([us.cx, uy, us.cz], dir), kg = ctx.kit(G);
    kg.boxB(us.w, 3.8, us.d, t('#2e3238', { paint: 0 }), [0, 0, 0]);
    for (const s of [-1, 1]) kg.box(0.06, 2.8, us.d - 1, nightMat(ctx, '#8fa9ba', '#ffe4bc', 1.35), [s * (us.w / 2 + 0.03), 1.8, 0]);
    kg.boxB(us.w + 1.4, 0.3, us.d + 1.4, t('#f0efe9', { paint: 0 }), [0, 3.8, 0]);
    colliders(ctx, [obbPt(us, -us.w / 2, -us.d / 2), obbPt(us, us.w / 2, -us.d / 2), obbPt(us, us.w / 2, us.d / 2), obbPt(us, -us.w / 2, us.d / 2)], uy - 3, uy + 5);
    // terraces: timber decks stepping down the slope, sofas facing the view, glass balustrades
    // [v4:polish1] the view edge stays open: a steel top rail on slim posts over clear glass (the v3 panel was a pale wall)
    const deckM = t(TIMBER, { paint: 0.06 }), edgeM = t('#8a6a4a', { paint: 0.03 }), balu = t('#dfeef4', { paint: 0, transparent: true, opacity: 0.16 }), railM = t('#5c6068', { paint: 0 });
    out.terraces = [];
    for (const tr of K.terraces) {
      const face = Math.atan2(tr.face[0], tr.face[1]);
      const o = frame(tr.at[0], tr.at[1], tr.w, tr.d, face);
      const gy = groundSpan(L, [obbPt(o, -tr.w / 2, -tr.d / 2), obbPt(o, tr.w / 2, -tr.d / 2), obbPt(o, tr.w / 2, tr.d / 2), obbPt(o, -tr.w / 2, tr.d / 2)]);
      const T = k.group([o.cx, 0, o.cz], face), kt = ctx.kit(T);
      let n = 0; const stepD = tr.d / tr.steps;
      // tiers step down 0.6 m toward the view from the highest ground under the deck; posts carry them over the slope
      const yTop = gy.hi + 0.35; let lastY = yTop;
      for (let i = 0; i < tr.steps; i++) {
        const zc = -tr.d / 2 + stepD * (i + 0.5), c = obbPt(o, 0, zc), y = Math.max(yTop - i * 0.6, L.heightAt(c[0], c[1]) + 0.25);
        const wI = tr.w - i * 2.0; lastY = y;
        kt.boxB(wI, 0.25, stepD, deckM, [0, y - 0.25, zc]);
        // the deck stands on short posts; a fascia board only as deep as the ground under this tier's front edge
        const fe = obbPt(o, 0, zc + stepD / 2), gFront = L.heightAt(fe[0], fe[1]);
        kt.boxB(wI, 0.45, 0.2, edgeM, [0, y - 0.45, zc + stepD / 2 - 0.1]);   // the fascia board; posts below carry the deck
        for (let px = -wI / 2 + 0.6; px <= wI / 2 - 0.5; px += 3) for (const pz of [zc - stepD / 2 + 0.4, zc + stepD / 2 - 0.4]) { const pw = obbPt(o, px, pz), gp = L.heightAt(pw[0], pw[1]); if (y - gp > 0.4) kt.boxB(0.18, y - gp, 0.18, edgeM, [px, gp, pz]); }
        planks(ctx, kt, wI, stepD, y, zc);
        const sub = kt.group([0, 0, zc], 0), ks = ctx.kit(sub);
        // [v4:polish1] sets of ~6 seats: terrace 1's 49 seats are 8 sofa sets over its three tiers
        const nSets = Math.max(tr.sofas ? 1 : 0, Math.round((tr.sofas || 0) / 6));
        const ns = Math.round(nSets * (i + 1) / tr.steps) - Math.round(nSets * i / tr.steps);
        n += sofas(ctx, ks, ns, wI - 1, stepD, y, i).length;
        ctx.physics?.addWalkBox?.(c[0], c[1], wI, stepD, face, y);
      }
      const bw = tr.w - (tr.steps - 1) * 2;
      kt.box(bw, 0.9, 0.04, balu, [0, lastY + 0.5, tr.d / 2]);
      kt.box(bw + 0.1, 0.06, 0.08, railM, [0, lastY + 1.05, tr.d / 2]);
      for (let px = -bw / 2; px <= bw / 2 + 0.01; px += 2) kt.box(0.05, 1.05, 0.05, railM, [px, lastY + 0.52, tr.d / 2]);
      out.terraces.push({ id: tr.id, sofas: n, seats: tr.sofas || 0, at: tr.at });   // [v4:polish1] sofas = sets of ~6 seats
    }
    // the café + toilet building (timber, 21 m² café): a small gable building
    const cf = frame(K.cafe.at[0], K.cafe.at[1], K.cafe.w, K.cafe.d, 0.6);
    gableHouse(ctx, k, cf, L.heightAt(cf.cx, cf.cz) + 0.2, 3.2, { wall: TIMBER, roof: '#3c4148', soffit: CREAM, pitch: 0.6 });
    sign(ctx, k, 'KAMEYAMA TERRACE 360°  café', 3.6, 0.5, cf.cx + Math.sin(0.6) * 3.3, L.heightAt(cf.cx, cf.cz) + 2.9, cf.cz + Math.cos(0.6) * 3.3, 0.6, { color: '#3a2e24', bg: '#efe6d2', font: FONT.en || FONT.sans });
    // 第1レストハウス: the fan-shaped hall, curved side to the west
    const r1 = K.restHouse1, ry1 = L.heightAt(r1.at[0], r1.at[1]) + 0.2;
    const fan = new THREE.CylinderGeometry(r1.r, r1.r, 5.0, 16, 1, false, Math.PI, Math.PI); fan.translate(0, 2.5, 0);
    const fm = new THREE.Mesh(fan, t('#e9e5da', { paint: 0.03 })); fm.position.set(r1.at[0] + 7, ry1, r1.at[1]); fm.castShadow = fm.receiveShadow = true; k.parent.add(fm);
    const fanRoof = new THREE.CylinderGeometry(r1.r * 0.2, r1.r + 0.8, 1.6, 16, 1, false, Math.PI, Math.PI); fanRoof.translate(0, 5.8, 0);
    const fr = new THREE.Mesh(fanRoof, t('#6f8791', { paint: 0.04 })); fr.position.copy(fm.position); fr.rotation.y = fm.rotation.y; fr.castShadow = true; k.parent.add(fr);
    k.box(0.4, 5.0, r1.r * 2, t('#d9d4c8', { paint: 0.03 }), [r1.at[0] + 7, ry1 + 2.5, r1.at[1]]);
    ctx.physics?.addCylinder?.(r1.at[0] + 7 - r1.r * 0.5, r1.at[1], r1.r * 0.7, ry1 - 2, ry1 + 6);
    // 第2レストハウス: the teal-roofed block
    const r2 = K.restHouse2, o2 = obbOf(r2.poly), ry2 = groundSpan(L, r2.poly).lo + 0.2;
    k.mesh(wallGeo(r2.poly, ry2, ry2 + 4.4, { tu: 3.2, tv: 4.4, yRef: ry2 }), facadeMat(ctx, 'resthouse', { draw: paintWindow({ wall: '#ece8de', frame: '#d6d2c6', glass: ['#607a8c', '#b1c3cc'], win: [0.1, 0.25, 0.9, 0.8], mull: 1 }), win: [0.1, 0.25, 0.9, 0.8], lit: 0.4 }));
    const R2 = pitchedRoof(o2, ry2 + 4.4, { kind: 'hip', pitch: 0.35, over: 0.7 });
    k.mesh(R2.roof, t(r2.roof, { paint: 0.04 })); k.mesh(R2.fascia, t('#e8e6de', { paint: 0 }));
    colliders(ctx, r2.poly, ry2 - 2, ry2 + 5);
    // the summit post (235 m) and a signed welcome
    const [sx, sz] = K.summit, sy = L.heightAt(sx, sz);
    k.box(0.35, 1.6, 0.35, t('#d9d4c4', { paint: 0.03 }), [sx, sy + 0.8, sz]);
    sign(ctx, k, '亀山 235m', 1.3, 0.3, sx, sy + 1.2, sz + 0.2, 0, { color: '#2d2a26', bg: '#e9e1cc', font: FONT.serif });
    // [v6:outside-kameyama-summit] the promenade (PROMENADE above): a ribbon draped on the ridge with flush gravel edges, and black
    // steel railings wherever the ground falls away beside it. The land use under it is cleared of trees by the override file.
    {
      const P = PROMENADE, C = P.ctrl, pts = [];
      for (let i = 0; i < C.length - 1; i++) {   // Catmull-Rom through the control points, one sample every 1.5 m
        const p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(C.length - 1, i + 2)], n = Math.max(2, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 1.5));
        for (let j = i ? 1 : 0; j <= n; j++) {
          const u = j / n, u2 = u * u, u3 = u2 * u, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
          pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
        }
      }
      const nrm = pts.map((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; });
      const strip = (o0, o1, col) => {   // a ribbon between offsets o0 and o1 (m, + to the right of travel), draped on the terrain
        const pos = [], idx = [];
        pts.forEach((q, i) => { for (const o of [o0, o1]) { const x = q[0] + nrm[i][0] * o, z = q[1] + nrm[i][1] * o; pos.push(x, L.heightAt(x, z) + 0.07, z); } });
        for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, t(col, { paint: 0.04, side: 'double', polygonOffset: -0.6 })); m.receiveShadow = true; k.parent.add(m);
      };
      const hw = P.width / 2;
      strip(-hw, hw, '#9e6668');                                    // the terracotta-red surface
      strip(hw, hw + P.edge, '#5e5c60'); strip(-hw - P.edge, -hw, '#5e5c60');   // the dark grey gravel edging, flush, no kerb
      const black = t('#1b1d20', { paint: 0 });
      let rails = 0;
      for (const sg of [-1, 1]) {
        const off = sg * (hw + P.edge + 0.5);
        const hp = pts.map((q, i) => L.heightAt(q[0], q[1])), drop = pts.map((q, i) => hp[i] - L.heightAt(q[0] + nrm[i][0] * sg * 4, q[1] + nrm[i][1] * sg * 4));
        for (let i = 0; i < pts.length - 1; i++) {
          if (drop[i] < 1.2 || drop[i + 1] < 1.2) continue;   // railing only where the ridge drops off (a 1.2 m fall within 4 m)
          const A = [pts[i][0] + nrm[i][0] * off, pts[i][1] + nrm[i][1] * off], B = [pts[i + 1][0] + nrm[i + 1][0] * off, pts[i + 1][1] + nrm[i + 1][1] * off];
          const ya = L.heightAt(A[0], A[1]), yb = L.heightAt(B[0], B[1]), l = Math.hypot(B[0] - A[0], B[1] - A[1]), mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, ry = Math.atan2(B[0] - A[0], B[1] - A[1]), yy = (ya + yb) / 2;
          for (const hh of [1.0, 0.5]) k.box(0.04, 0.04, l + 0.02, black, [mx, yy + hh, mz], [0, ry, 0]);
          k.box(0.05, 1.05, 0.05, black, [A[0], ya + 0.52, A[1]]); rails++;
        }
      }
      out.promenade = { approx: P.approx, width: P.width, edge: P.edge, length: Math.round(pts.reduce((s2, q, i) => s2 + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0)), from: C[0], to: C.at(-1), railSegments: rails };
    }
    out.summit = { x: us.cx, z: us.cz, y: uy };
  }
  // ================================================================ 浦の浜
  {
    const U = URANOHAMA;
    // the welcome terminal: timber walls, a grey metal gable roof, glazing and the terrace on the bay (west) side
    const tp = U.terminal.poly, to = obbOf(tp), ty = groundSpan(L, tp).lo + 0.3;
    const cladding = facadeMat(ctx, 'terminal', { W: 128, H: 128, draw: (g, W, H) => { g.fillStyle = TIMBER; g.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? '#a88259' : '#b8936a'; g.fillRect(x, 0, 7, H); } const X0 = W * 0.1, X1 = W * 0.9, Y0 = H * 0.18, Y1 = H * 0.8; const gr = g.createLinearGradient(0, Y0, 0, Y1); gr.addColorStop(0, '#62798c'); gr.addColorStop(1, '#b3c5cf'); g.fillStyle = gr; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0); g.fillStyle = '#6f5238'; g.fillRect(W / 2 - 2, Y0, 4, Y1 - Y0); }, win: [0.1, 0.2, 0.9, 0.82], lit: 0.6 });
    k.mesh(wallGeo(tp, ty, ty + 4.6, { tu: 3.0, tv: 4.6, yRef: ty }), cladding);
    const R = pitchedRoof(to, ty + 4.6, { kind: 'gable', pitch: 0.45, over: 1.4 });
    k.mesh(R.roof, t('#6d737a', { paint: 0.04 })); k.mesh(R.fascia, t('#e6e2d8', { paint: 0 })); if (R.gables) k.mesh(R.gables, t(TIMBER, { paint: 0.04 }));
    const deck = [[3368, 4506], [3378, 4506], [3378, 4527], [3368, 4527]];
    k.mesh(capGeo(deck, ty + 0.1, { tile: 1.2 }), t(TIMBER, { paint: 0.06 }));
    k.mesh(prismWalls(deck, ty - 0.8, ty + 0.1, { tile: 2 }), t('#8a6a4a', { paint: 0.04 }));
    ctx.physics?.addWalkBox?.(3373, 4516.5, 10, 21, 0, ty + 0.1);
    sign(ctx, k, '気仙沼大島ウェルカム・ターミナル', 8.0, 0.8, 3377.6, ty + 3.6, 4516.5, -Math.PI / 2, { color: '#27415c', bg: '#f1ece0' });
    colliders(ctx, tp, ty - 2, ty + 5);
    // the bay-cruise floating pier on its gangway, with bollards, a hand rail and the 「のりば」 board
    const pp = U.pontoon.poly, po = obbOf(pp);
    const P = k.group([po.cx, 0, po.cz], po.rotY), kp = ctx.kit(P);
    kp.box(po.w, 1.2, po.d, t('#c9c9c2', { paint: 0.05 }), [0, 0.1, 0]);
    kp.box(po.w - 0.4, 0.05, po.d - 0.4, t('#a7a8a2', { paint: 0.06 }), [0, 0.72, 0]);
    for (let z = -po.d / 2 + 2; z < po.d / 2; z += 5) for (const x of [-po.w / 2 + 0.4, po.w / 2 - 0.4]) kp.cyl(0.18, 0.2, 0.5, t('#3a3f47', { paint: 0 }), [x, 0.95, z], null, 8);
    const [g0, g1] = U.pontoon.gang, gl = Math.hypot(g1[0] - g0[0], g1[1] - g0[1]), gTop = L.heightAt(g1[0] + 2, g1[1]);
    const Gg = k.group([(g0[0] + g1[0]) / 2, (0.72 + gTop) / 2, (g0[1] + g1[1]) / 2], Math.atan2(g1[0] - g0[0], g1[1] - g0[1])); Gg.rotation.x = -Math.atan2(gTop - 0.72, gl); Gg.rotation.order = 'YXZ';
    const kg = ctx.kit(Gg);
    kg.box(1.6, 0.15, gl + 0.4, t('#8e939a', { paint: 0 }), [0, 0, 0]);
    for (const x of [-0.8, 0.8]) kg.box(0.05, 0.05, gl + 0.4, t('#c9ccd0', { paint: 0 }), [x, 1.0, 0]);
    sign(ctx, k, '気仙沼ベイクルーズ のりば', 3.6, 0.5, g1[0] + 1.5, gTop + 2.2, g1[1] + 1.4, -Math.PI / 2, { color: '#ffffff', bg: '#1f4fa8' });
    ctx.physics?.addWalkBox?.(po.cx, po.cz, po.w, po.d, po.rotY, 0.72);
    // [v4:polish1] the paved apron of 浦の浜 round the terminal (the GSI photo: pale asphalt from the basin's east quay to
    // the road, x 3282..3440, z 4450..4625), the OSM car park east of the terminal with its stall lines, and the
    // basin's quay kerb; the terrain's land cover left it an olive field
    {
      const apron = [[3282, 4462], [3425, 4450], [3440, 4625], [3282, 4630]];
      const tris = drapeTriangles(apron, [tp], 5), pos = [];
      for (const [x, z] of tris) pos.push(x, Math.max(L.heightAt(x, z), 0.9) + 0.05, z);
      const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ag.computeVertexNormals();
      const am = new THREE.Mesh(ag, t('#b9b4aa', { paint: 0.05, side: 'double', polygonOffset: -0.6 })); am.receiveShadow = true; k.parent.add(am);
      const lot = (L.LANDUSE || []).find((u) => u.cls === 'parking' && u.ring?.length > 2 && Math.hypot(centroid(u.ring)[0] - 3420, centroid(u.ring)[1] - 4570) < 60);
      if (lot) {
        const lo = obbOf(lot.ring), line = t('#f2f2ee', { paint: 0 });
        for (let u = -lo.w / 2 + 1.5; u < lo.w / 2 - 1; u += 2.5) for (const v of [-lo.d / 4, lo.d / 4]) { const p2 = obbPt(lo, u, v); k.box(0.12, 0.03, 5, line, [p2[0], Math.max(L.heightAt(p2[0], p2[1]), 0.9) + 0.09, p2[1]], [0, lo.rotY, 0]); }
      }
      k.box(0.5, 0.4, 170, t('#d2cfc6', { paint: 0.04 }), [3283, Math.max(L.heightAt(3284, 4545), 0.9) + 0.15, 4545]);   // the quay kerb
      out.apron = { area: apron, parking: !!lot };
    }
    // the jetty of the fishing-boat basin
    const J = U.fingerPier, jl = Math.hypot(J.b[0] - J.a[0], J.b[1] - J.a[1]);
    k.box(J.w, 2.2, jl, t('#b7b5ad', { paint: 0.07 }), [(J.a[0] + J.b[0]) / 2, 0.5, (J.a[1] + J.b[1]) / 2], [0, Math.atan2(J.b[0] - J.a[0], J.b[1] - J.a[1]), 0]);
    out.uranohama = { terminal: [to.cx, to.cz], pontoon: [po.cx, po.cz] };
  }
  return out;
}
