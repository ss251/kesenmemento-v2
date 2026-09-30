// [v4:landmarks-A] 気仙沼湾横断橋 (かなえ大橋, 2021) at its measured place and true dimensions (harbor/real.js KANAE;
// reference sheet docs/anime/landmarks/kanae-ohashi.md). The deck follows the mid-line of the OSM bridge outline from the
// 気仙沼港IC viaduct (SW) to the 浪板 abutment (NE):
//   - land part (s 0..650): 3+7 span continuous steel box girder on single RC wall piers every ~66 m;
//   - sea part (s 650..1329): 3-span continuous cable-stayed bridge 160 + 360 + 160 m, a flattened-hexagon steel box
//     girder, one central cable plane (1面吊り) in a semi-fan of 12 stays per side per pylon;
//   - pylons: steel inverted Y (逆Y型), octagonal, 100 m of steel on a 15 m RC pier (115 m above the sea); the two legs
//     straddle the deck and join 26 m above it into the single mast. The south pylon stands on the 朝日町 quay.
// Everything is white (#eef0ee, stays #f4f5f2), RC piers light concrete. Returns { group, deck, towers, lamps, perches,
// spans, pylons } in world coordinates (deck = centreline samples, used by traffic.js for the cars and portals).
import * as THREE from 'three';
import { KANAE } from './real.js';
import { resample, sweepSection, sweepSlab, tubeAlong, worldKit, lineLen } from './lmkit.js';
import { nightMat, addGlint, registry, lightupMat } from './lights.js';

const COL = { white: '#eef0ee', shade: '#d4d9dc', concrete: '#c8c6bd', concreteDark: '#aeaca4', asphalt: '#5f6368', line: '#eeece6', cable: '#f4f5f2', rail: '#c9ced3' };

/** Deck surface height at arclength s: a crest vertical curve over the channel (clearance 32 m + girder). */
export function kanaeDeckY(s) {
  const K = KANAE, mid = (K.pylonS + K.pylonN) / 2, total = lineLen(K.line);
  if (s <= mid) return K.crest - (K.crest - K.endY[0]) * ((mid - s) / mid) ** 2;
  return K.crest - (K.crest - K.endY[1]) * ((s - mid) / (total - mid)) ** 2;
}

export function buildKanae4(ctx, opts = {}) {
  const L = ctx.L, K = KANAE;
  const { g, k } = worldKit(ctx, 'bridge:kanae4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = {
    white: t(COL.white, { paint: 0.03 }), shade: t(COL.shade, { paint: 0.04 }), concrete: t(COL.concrete, { paint: 0.08 }),
    concreteDark: t(COL.concreteDark, { paint: 0.08 }), asphalt: t(COL.asphalt, { paint: 0.02 }), line: ctx.mat.decal(COL.line), rail: t(COL.rail, { paint: 0 }),
    lamp: nightMat(ctx, '#dedfd8', '#ffe6bd', 2.2), red: nightMat(ctx, '#b8403a', '#ff3a2a', 2.6, { always: 0.35 }),
  };
  const total = lineLen(K.line);
  const smp = resample(K.line, 8);
  for (const p of smp) p.y = kanaeDeckY(p.s);
  const at = (s) => { let i = 1; while (i < smp.length - 1 && smp[i].s < s) i++; const a = smp[i - 1], b = smp[i], u = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s))); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: kanaeDeckY(s), ux: b.ux, uz: b.uz, s }; };
  const toW = (s, l, dy) => { const p = at(s); return [p.x - p.uz * l, p.y + dy, p.z + p.ux * l]; };
  const csStart = K.pylonS - K.side, csEnd = Math.min(total, K.pylonN + K.side);   // 650 .. 1329
  const width = (s) => (s >= csStart - 4 ? K.cableWidth : K.landWidth);

  // ---- girder + deck, in two parts (the cable-stayed hexagon, the land box girder)
  const part = (s0, s1) => smp.filter((p) => p.s >= s0 - 0.01 && p.s <= s1 + 0.01);
  const hexW = K.cableWidth;
  const hex = [[-hexW / 2, 0], [hexW / 2, 0], [hexW / 2 + 0.5, -1.1], [hexW * 0.3, -3.2], [-hexW * 0.3, -3.2], [-hexW / 2 - 0.5, -1.1]];
  const box = [[-K.landWidth / 2, 0], [K.landWidth / 2, 0], [K.landWidth / 2 - 1.6, -0.4], [K.landWidth * 0.28, -3.0], [-K.landWidth * 0.28, -3.0], [-K.landWidth / 2 + 1.6, -0.4]];
  const deckSea = part(csStart, total), deckLand = part(0, csStart);
  k.mesh(sweepSection(deckSea.map((p) => ({ ...p, y: p.y - 0.12 })), hex, { tile: 6 }), m.white);
  k.mesh(sweepSection(deckLand.map((p) => ({ ...p, y: p.y - 0.12 })), box, { tile: 6 }), m.shade);
  // road surface, lines, barriers and handrails along the whole deck
  for (const [pts, W] of [[deckSea, K.cableWidth], [deckLand, K.landWidth]]) {
    const road = K.width;
    k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 0.06 })), { l0: -road / 2, l1: road / 2, th: 0.18, tile: 4, bottom: false }), m.asphalt);
    for (const sd of [-1, 1]) {
      // concrete barrier and handrail on each edge, white edge line 1.75 m in (the shoulder)
      const e = sd * (W / 2 - 0.3);
      k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 0.95 })), { l0: e - 0.25, l1: e + 0.25, th: 0.95, tile: 4 }), m.white);
      k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 1.35 })), { l0: e - 0.07, l1: e + 0.07, th: 0.12, tile: 4 }), m.rail);
      k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 0.09 })), { l0: sd * (road / 2 - 1.75) - 0.08, l1: sd * (road / 2 - 1.75) + 0.08, th: 0.02, tile: 4, sides: false, bottom: false }), m.line);
      // cable-stayed part: the median between the lanes carries the stays (a raised strip with the anchor boxes)
    }
    if (W === K.cableWidth) k.mesh(sweepSlab(pts.map((p) => ({ ...p, y: p.y + 0.35 })), { l0: -0.9, l1: 0.9, th: 0.35, tile: 4 }), m.shade);
  }
  for (let s = 6; s < total - 6; s += 12) { if (s > csStart - 2) continue; const p = at(s); k.box(0.15, 0.03, 6, m.line, [p.x, p.y + 0.12, p.z], [0, Math.atan2(p.ux, p.uz), 0]); }

  // ---- land viaduct piers: single RC wall piers, 3+7 spans over 650 m
  const lamps = [];
  const pierAt = (s, wide = false) => {
    const p = at(s), gy = L.heightAt(p.x, p.z), wet = L.isWater(p.x, p.z), yb = (wet ? Math.min(gy, -2) : gy) - 1, top = p.y - 3.1;
    if (top - yb < 1.5) return;
    const rot = Math.atan2(p.ux, p.uz);
    k.box(wide ? 9 : 6.5, top - yb, 2.6, m.concrete, [p.x, (top + yb) / 2, p.z], [0, rot, 0]);
    k.box(width(s) - 1.5, 1.6, 3.4, m.concrete, [p.x, top - 0.6, p.z], [0, rot, 0]);   // pier cap
    if (wet) k.box((wide ? 9 : 6.5) + 3, 1.4, 5, m.concreteDark, [p.x, 0.3, p.z], [0, rot, 0]);
  };
  for (let i = 1; i < 10; i++) pierAt(csStart - i * (csStart / 10));
  pierAt(csStart, true); pierAt(csEnd - 2, true);
  // SW end: the deck runs on toward the IC; an abutment where it meets the slope
  { const p = at(3), gy = L.heightAt(p.x, p.z); if (p.y - gy > 1) k.box(K.landWidth + 1.5, p.y - gy + 1.5, 5, m.concrete, [p.x, (p.y + gy) / 2 - 1, p.z], [0, Math.atan2(p.ux, p.uz), 0]); }

  // ---- pylons: RC pier (15 m), two steel legs straddling the deck, the single octagonal mast to 115 m
  const towers = [], pylons = [];
  for (const sP of [K.pylonS, K.pylonN]) {
    const p = at(sP), rot = Math.atan2(p.ux, p.uz), gy = L.heightAt(p.x, p.z), wet = L.isWater(p.x, p.z);
    const yb = wet ? Math.min(gy, -4) : gy - 0.5, yP = K.pierTop, yd = p.y, yJ = yd + 26, yTop = K.pylonTop;
    const right = [-p.uz, p.ux];
    const W = (l, y, a = 0) => [p.x + right[0] * l + p.ux * a, y, p.z + right[1] * l + p.uz * a];
    // RC pier: a tapered block, wider across the bridge, with a chamfered cap
    const pierG = new THREE.CylinderGeometry(1, 1, 1, 8, 1); pierG.rotateY(Math.PI / 8);
    k.mesh(pierG, m.concrete, [p.x, (yb + yP) / 2, p.z], [0, rot, 0], [15.5, yP - yb, 7.5]);
    k.mesh(pierG, m.concreteDark, [p.x, yP - 0.4, p.z], [0, rot, 0], [17, 0.8, 8.5]);
    if (wet) k.mesh(pierG, m.concreteDark, [p.x, 0.2, p.z], [0, rot, 0], [21, 1.6, 12]);
    // legs: from the pier top at ±11 m, bowing out past the deck edges, joining at yJ (smooth curves)
    for (const sd of [-1, 1]) {
      const pts = [W(sd * 10.5, yP), W(sd * 9.6, yd - 8), W(sd * 8.9, yd + 1.5), W(sd * 6.2, yd + 13), W(sd * 2.4, yJ - 4), W(sd * 0.6, yJ + 0.5)];
      k.mesh(tubeAlong(pts, [1.3, 1.7], { sides: 8 }), m.white);
      if (opts.lightup !== false) ctx.noOutline(k.mesh(tubeAlong(pts, [1.42, 1.82], { sides: 8 }), lightupMat(ctx, '#dfe9ff', 0.5, 0, 90)));
    }
    // cross beam under the deck between the legs (the girder bearing)
    k.box(19, 2.4, 4, m.shade, [p.x, yd - 4.6, p.z], [0, rot, 0]);
    // the mast: tapered octagon from the joint to the top, a cap, the aviation light
    const mastG = new THREE.CylinderGeometry(1.55, 2.5, yTop - yJ + 5, 8, 1); mastG.rotateY(Math.PI / 8);
    k.mesh(mastG, m.white, [p.x, (yJ - 5 + yTop) / 2, p.z], [0, rot, 0], [1, 1, 1.3]);
    if (opts.lightup !== false) ctx.noOutline(k.mesh(mastG, lightupMat(ctx, '#dfe9ff', 0.55, 0, 90), [p.x, (yJ - 5 + yTop) / 2, p.z], [0, rot, 0], [1.07, 1.01, 1.36]));
    k.box(2.4, 1.0, 3.2, m.shade, [p.x, yTop + 0.5, p.z], [0, rot, 0]);
    k.box(0.8, 0.8, 0.8, m.red, [p.x, yTop + 1.4, p.z]);
    towers.push([p.x, yTop + 1.6, p.z]); pylons.push({ s: sP, x: p.x, z: p.z, deckY: yd, top: yTop, wet });
    registry(ctx)?.aviation({ x: p.x, y: yTop + 1.6, z: p.z });
    // stays: one central plane, a semi-fan of 12 per side, anchored on the mast between yJ + 8 and the top
    const nC = opts.cables ?? 12;
    for (const dir of [-1, 1]) {
      const reach = (dir < 0 ? (sP === K.pylonS ? K.side : K.main / 2) : (sP === K.pylonS ? K.main / 2 : Math.min(K.side, total - sP - 2))) - 8;
      for (let i = 0; i < nC; i++) {
        const u = (i + 1) / nC, sd = sP + dir * (12 + (reach - 12) * u);
        const ya = yJ + 8 + (yTop - 4 - yJ - 8) * (0.08 + 0.92 * u);
        const pA = new THREE.Vector3(...W(0, ya, dir * 0.9)), q = at(sd), pB = new THREE.Vector3(q.x, q.y + 0.7, q.z);
        ctx.wires.add([pA, pB], { width: 0.16, color: COL.cable });
      }
    }
    // uplight glints on the water / quay under the pylon
    addGlint(ctx, p.x + p.ux * 8, 0, p.z + p.uz * 8, '#e9f0ff', 2.0, 40, 0.35);
    if (ctx.physics?.addCylinder) ctx.physics.addCylinder(p.x, p.z, 8, yb, yP);
  }

  // ---- deck lamps (both edges, staggered) and their reflections over the water
  for (let s = 20, i = 0; s < total - 10; s += 40, i++) {
    const sd = i % 2 ? 1 : -1, e = sd * (width(s) / 2 - 0.4), p = at(s);
    const base = toW(s, e, 1.0), arm = toW(s, e - sd * 1.3, 10.4);
    k.box(0.22, 9.5, 0.22, m.rail, [base[0], base[1] + 4.75, base[2]]);
    k.box(0.5, 0.18, 0.9, m.lamp, arm);
    lamps.push(arm);
    registry(ctx)?.point({ x: arm[0], y: arm[1] - 0.2, z: arm[2], color: '#ffe6bd', size: 0.9, intensity: 2.0, mode: 'lamps' });
    if (L.isWater(p.x, p.z)) addGlint(ctx, p.x, 0, p.z, '#ffe0b0', 0.9, 30, 0.5);
  }
  // a chain of small deck-edge lights along the cable-stayed part (the necklace across the bay at night)
  for (let s = csStart + 4; s < csEnd - 4; s += 9) for (const sd of [-1, 1]) { const w = toW(s, sd * (K.cableWidth / 2 + 0.05), 1.3); registry(ctx)?.point({ x: w[0], y: w[1], z: w[2], color: '#fff1d6', size: 0.4, intensity: 1.7, mode: 'lamps' }); }

  const deck = smp.map((p) => [p.x, p.y + 0.2, p.z]);
  return { group: g, deck, towers, pylons, lamps, perches: towers.map((q) => [q[0], q[1] + 0.8, q[2]]), spans: { main: K.main, side: K.side, total: Math.round(total) } };
}
