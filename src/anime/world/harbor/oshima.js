// [v4:landmarks-A] 気仙沼大島大橋 (鶴亀大橋, 2019) on its OSM ends and true dimensions (harbor/real.js OSHIMA; reference
// sheet docs/anime/landmarks/oshima-ohashi.md): a white steel mid-deck arch (鋼中路式アーチ), total 356 m, spans
// 24.7 + 40.5 + 224 + 40.5 + 24.7 m, arch span 297 m and rise 54 m springing from the rock on both shores, deck 9.5 m
// (2.5 m walkway on the east side + two 3.5 m lanes), clearance ≥ 32 m. Two parallel box ribs joined by horizontal
// portal struts near the crown (ladder bracing, no X-bracing: Commons "Kesennumaooshima.jpg"), vertical hangers over
// the 224 m central span, posts from the ribs up to the deck in the 40.5 m spans. Lit railings and bridge ends at night.
// Returns { group, deck, towers, lamps, perches, span, ribs }.
import * as THREE from 'three';
import { OSHIMA } from './real.js';
import { sweepSection, sweepSlab, worldKit, quadsGeo } from './lmkit.js';
import { nightMat, addGlint, registry, lightupMat } from './lights.js';

const COL = { white: '#eeefec', shade: '#d3d8dc', concrete: '#c8c5bb', asphalt: '#5f6368', line: '#eeece6', cable: '#f1f2ee', walk: '#b7b3a9' };

export function buildOshima4(ctx, opts = {}) {
  const L = ctx.L, O = OSHIMA;
  const { g, k } = worldKit(ctx, 'bridge:oshima4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const m = {
    white: t(COL.white, { paint: 0.03 }), shade: t(COL.shade, { paint: 0.04 }), concrete: t(COL.concrete, { paint: 0.08 }), asphalt: t(COL.asphalt, { paint: 0.02 }),
    line: ctx.mat.decal(COL.line), walk: t(COL.walk, { paint: 0.05 }), lamp: nightMat(ctx, '#dedfd8', '#ffe6bd', 2.2), railLit: nightMat(ctx, '#e6e8e4', '#fff0d0', 1.6),
  };
  const [ax, az] = O.a, [bx, bz] = O.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const right = [-uz, ux], mid = len / 2;
  const deckY = (s) => { const e = s < mid ? O.endY[0] : O.endY[1]; return O.crest - (O.crest - e) * ((s - mid) / mid) ** 2; };
  const W = (s, l, y) => [ax + ux * s + right[0] * l, y, az + uz * s + right[1] * l];
  const smp = []; for (let i = 0, n = Math.ceil(len / 4); i <= n; i++) { const s = len * i / n; smp.push({ x: ax + ux * s, z: az + uz * s, y: deckY(s), ux, uz, s }); }   // both OSM ends exactly
  const hw = O.width / 2;
  // girder (a shallow box with fascia), road, east walkway, white barriers with the lit handrail
  k.mesh(sweepSection(smp.map((p) => ({ ...p, y: p.y - 0.1 })), [[-hw - 0.4, 0], [hw + 0.4, 0], [hw + 0.2, -0.5], [hw - 1.2, -2.3], [-hw + 1.2, -2.3], [-hw - 0.2, -0.5]], { tile: 6 }), m.white);
  k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 0.05 })), { l0: -hw + 2.5, l1: hw, th: 0.15, tile: 4, bottom: false }), m.asphalt);
  k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 0.25 })), { l0: -hw, l1: -hw + 2.5, th: 0.35, tile: 2, bottom: false }), m.walk);
  for (const l of [-hw + 2.5, hw]) k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 0.65 })), { l0: l - 0.25, l1: l + 0.25, th: 0.65, tile: 4 }), m.white);
  for (const l of [-hw - 0.1, hw + 0.1]) {
    k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 1.25 })), { l0: l - 0.08, l1: l + 0.08, th: 0.12, tile: 4 }), m.railLit);
    k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 0.75 })), { l0: l - 0.06, l1: l + 0.06, th: 0.08, tile: 4 }), m.white);
    for (let s = 1; s < len; s += 2.2) { const p = W(s, l, deckY(s)); k.box(0.1, 1.2, 0.12, m.white, [p[0], p[1] + 0.65, p[2]], [0, Math.atan2(ux, uz), 0]); }
  }
  // lane lines: white edge line, dashed centre
  k.mesh(sweepSlab(smp.map((p) => ({ ...p, y: p.y + 0.07 })), { l0: hw - 0.6, l1: hw - 0.45, th: 0.02, tile: 4, sides: false, bottom: false }), m.line);
  for (let s = 4; s < len - 4; s += 10) { const p = W(s, (-hw + 2.5 + hw) / 2, deckY(s) + 0.08); k.box(0.15, 0.02, 5, m.line, p, [0, Math.atan2(ux, uz), 0]); }

  // arch ribs: parabola, spring at O.springY on the rock, rise 54 m, span 297 m, two box ribs outside the deck
  const s0 = mid - O.archSpan / 2, s1 = mid + O.archSpan / 2;
  const archY = (s) => O.springY + O.rise * (1 - ((s - mid) / (O.archSpan / 2)) ** 2);
  const ribL = hw + 1.9;
  const ribPts = []; for (let i = 0; i <= 60; i++) { const s = s0 + (s1 - s0) * i / 60; ribPts.push(s); }
  for (const sd of [-1, 1]) {
    // sweep a 2.2 × 3.4 box along the rib (the path's own tangent tilts with the arch: build it from quads per step)
    const ribGeo = (sc) => {
    const sec = [[-1.1, 1.7], [1.1, 1.7], [1.1, -1.7], [-1.1, -1.7]].map(([a, b]) => [a * sc, b * sc]);
    const P = (s, a, b) => { const y = archY(s), dyds = -2 * O.rise * (s - mid) / (O.archSpan / 2) ** 2, n = Math.hypot(1, dyds); const ty = dyds / n, ts = 1 / n; const ny = ts, ns = -ty; return W(s + ns * b, sd * ribL + a, y + ny * b); };
    const quads = [];
    for (let i = 0; i < ribPts.length - 1; i++) for (let j = 0; j < 4; j++) {
      const [a0, b0] = sec[j], [a1, b1] = sec[(j + 1) % 4], sA = ribPts[i], sB = ribPts[i + 1];
      const c = P((sA + sB) / 2, 0, 0), f = P((sA + sB) / 2, (a0 + a1) / 2, (b0 + b1) / 2);
      quads.push([P(sA, a0, b0), P(sB, a0, b0), P(sB, a1, b1), P(sA, a1, b1), [f[0] - c[0], f[1] - c[1], f[2] - c[2]]]);
    }
    return quadsGeo(quads, 4);
    };
    k.mesh(ribGeo(1), m.white);
    if (opts.lightup !== false) ctx.noOutline(k.mesh(ribGeo(1.08), lightupMat(ctx, '#f4f7ff', 0.45, O.springY, 60)));   // a shell 8 % larger (no z-fight)
  }
  // springing blocks on the rock of both shores
  for (const s of [s0, s1]) { const p = W(s, 0, 0), gy = L.heightAt(p[0], p[2]); k.box(ribL * 2 + 6, O.springY + 4 - Math.min(gy, 0) + 2, 10, m.concrete, [p[0], (O.springY + Math.min(gy, 0) - 2) / 2 + 1, p[2]], [0, Math.atan2(ux, uz), 0]); }
  // portal struts (ladder bracing) where the ribs stand clear above the deck
  for (const ds of [0, -24, 24, -48, 48, -70, 70]) {
    const s = mid + ds, y = archY(s); if (y < deckY(s) + 7.5) continue;
    const c = W(s, 0, y - 0.3); k.box(ribL * 2, 1.6, 1.8, m.white, c, [0, Math.atan2(ux, uz), 0]);
  }
  // hangers (arch above deck) and posts (arch below deck), cross beams under the deck at each station
  for (let s = s0 + 6; s <= s1 - 6; s += 8) {
    const ya = archY(s), yd = deckY(s);
    for (const sd of [-1, 1]) {
      if (ya > yd + 2) ctx.wires.add([new THREE.Vector3(...W(s, sd * ribL, ya - 1.8)), new THREE.Vector3(...W(s, sd * ribL, yd - 0.3))], { width: 0.15, color: COL.cable });
      else if (ya < yd - 2.4) k.box(0.9, yd - ya - 2.2, 0.9, m.white, W(s, sd * ribL, (ya + yd) / 2 - 1.1));
    }
    k.box(ribL * 2 + 1, 0.8, 0.8, m.shade, W(s, 0, yd - 1.8), [0, Math.atan2(ux, uz), 0]);
  }
  // end piers of the 24.7 m spans and the abutments
  for (const s of [O.spans[0], len - O.spans[4]]) {
    const p = W(s, 0, 0), gy = L.heightAt(p[0], p[2]), top = deckY(s) - 2.3; if (top - gy < 1) continue;
    k.box(3.6, top - gy + 1, 2.4, m.concrete, [p[0], (top + gy - 1) / 2, p[2]], [0, Math.atan2(ux, uz), 0]);
    k.box(O.width + 1, 1.2, 3.0, m.concrete, W(s, 0, top - 0.4), [0, Math.atan2(ux, uz), 0]);
  }
  for (const s of [1.5, len - 1.5]) { const p = W(s, 0, 0), gy = L.heightAt(p[0], p[2]), y = deckY(s); if (y - gy > 0.8) k.box(O.width + 2, y - gy + 1.5, 4, m.concrete, [p[0], (y + gy) / 2 - 1, p[2]], [0, Math.atan2(ux, uz), 0]); }
  // lamps along the walkway side, a light at each bridge end (袂), the crown lights
  const lamps = [];
  for (let s = 18, i = 0; s < len - 10; s += 30, i++) {
    const l = i % 2 ? hw - 0.3 : -hw + 0.3, p = W(s, l, deckY(s));
    k.box(0.18, 7.5, 0.18, m.white, [p[0], p[1] + 3.75, p[2]]);
    const h = W(s, l - Math.sign(l) * 1.2, deckY(s) + 7.6); k.box(0.5, 0.16, 0.8, m.lamp, h); lamps.push(h);
    registry(ctx)?.point({ x: h[0], y: h[1] - 0.2, z: h[2], color: '#ffe6bd', size: 0.9, intensity: 1.8, mode: 'lamps' });
    addGlint(ctx, p[0], 0, p[2], '#ffe0b0', 0.9, 26, 0.45);
  }
  for (const s of [3, len - 3]) for (const l of [-hw - 0.4, hw + 0.4]) { const p = W(s, l, deckY(s) + 1.2); registry(ctx)?.point({ x: p[0], y: p[1], z: p[2], color: '#fff4dc', size: 0.8, intensity: 2.0, mode: 'lamps' }); }
  for (const sd of [-1, 1]) for (let i = -4; i <= 4; i++) { const s = mid + i * O.archSpan / 10, p = W(s, sd * ribL, archY(s) + 1.9); registry(ctx)?.point({ x: p[0], y: p[1], z: p[2], color: '#e9f0ff', size: 0.8, intensity: 1.4, mode: 'lamps' }); }
  // the deck and ribs high over the water cast no sun shadow (their long 13-degree shadows landed as a dark slab)
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  g.traverse((o) => { if (!o.isMesh) return; bb.setFromObject(o); if (bb.max.y > 14) o.castShadow = false; });   // ribs, deck, lamps: no shadow slabs on the strait
  const crown = W(mid, 0, archY(mid) + 2);
  return { group: g, deck: smp.map((p) => [p.x, p.y + 0.2, p.z]), towers: [crown], lamps, perches: [[crown[0], crown[1] + 1.8, crown[2]]], span: O.archSpan, ribs: { s0, s1, crownY: archY(mid) } };
}
