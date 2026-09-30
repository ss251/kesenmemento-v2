// [v4:landmarks-A] 南町海岸: the waterfront that hides the T.P. 6.2 m seawall between architecture and landscape
// (harbor/real.js SITES, PONTOONS, MINAMI; docs/anime/landmarks/pier7.md, mukaeru.md, seawall-promenade.md):
//   PIER7 (創 ウマレル)  3 storeys, 85 × 18.6 m bent bar, full-height glazing with slender timber mullions, white slab edges
//                        and a white roof; its 2F deck is cantilevered over the wall toward the bay (RIA, 2019)
//   迎 (ムカエル)        3 storeys, 53 × 10 m, timber cladding and white render, shops on the 1F, the 2F bay terrace
//   結 / 拓              low white-roofed shop houses behind 迎 (2 and 1 storeys)
//   stepped garden       the terraced ステップガーデン that falls from the wall crest to the quay, with three round tree pits
//   the sloped lawn      the green wedge north of 迎; the plaza deck over the wall between 迎 and PIER7
//   the pontoons         the two 気仙沼ベイクルーズ floating piers with white membrane canopies and gangways
// Returns { halls, pontoons, berth: { a, b, side } for the cruise boat, walk }.
import * as THREE from 'three';
import { SITES, PONTOONS, MINAMI } from './real.js';
import { prismWalls, capGeo, offsetRing, obbOf, seg, barAlong, openRing, signedArea, worldKit, paint } from './lmkit.js';
import { nightMat, addGlint, registry } from './lights.js';
import { mapMat, textTex, FONT } from './util.js';

const C = { white: '#f1f1ee', roof: '#eceeed', timber: '#d6b88e', timberDark: '#a9825a', render: '#f0efe9', deck: '#b08a62', steel: '#5d6470', concrete: '#c9c6bc', stepTop: '#d7d3c8', lawn: '#7fa35a', pontoon: '#b9bcb6', membrane: '#f4f5f2' };

function edgesOf(poly, fn) {
  const P = openRing(poly), sign = Math.sign(signedArea(P)) || 1;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.3) continue; const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; fn(a, b, len, sign > 0 ? [u[1], -u[0]] : [-u[1], u[0]], u, i); }
}
function seaward(L, a, b, n, r = 70) { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; for (let d = 4; d <= r; d += 4) if (L.isWater(mx + n[0] * d, mz + n[1] * d)) return true; return false; }

export function buildMinami(ctx) {
  const L = ctx.L;
  const { k } = worldKit(ctx, 'minami4');
  const t = (c, o) => ctx.mat.toon(c, o);
  const timberTex = paint(ctx, 'timber', 256, 256, (g, w, h) => {
    g.fillStyle = C.timber; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = ['#d3b489', '#dcc098', '#cdae83'][(x / 8) % 3]; g.fillRect(x + 1, 0, 6, h); g.fillStyle = '#b89870'; g.fillRect(x, 0, 1, h); }
  }, [1, 1]);
  const m = {
    white: t(C.white, { paint: 0.03 }), roof: t(C.roof, { paint: 0.03 }), timber: mapMat(ctx, 'toon', '#ffffff', timberTex, { paint: 0.05 }), mullion: t(C.timber, { paint: 0.03 }),
    render: t(C.render, { paint: 0.04 }), deck: t(C.deck, { paint: 0.06 }), steel: t(C.steel, { paint: 0 }), concrete: t(C.concrete, { paint: 0.07 }), step: t(C.stepTop, { paint: 0.06 }),
    lawn: t(C.lawn, { paint: 0.08 }), pontoon: t(C.pontoon, { paint: 0.06 }), membrane: t(C.membrane, { paint: 0.02, side: 'double' }), trunk: t('#76604e', { paint: 0 }), leaf: t('#6f9a52', { paint: 0.06 }), leafLit: t('#8fb566', { paint: 0.06 }),
    glass: nightMat(ctx, '#8aa4b8', '#ffdcaa', 1.25), glassDark: nightMat(ctx, '#5f7486', '#ffdcaa', 1.3), glassWarm: nightMat(ctx, '#95a9b6', '#ffe0b0', 1.35), lamp: nightMat(ctx, '#e8e6dc', '#fff0d0', 2.2),
  };
  const out = { halls: [], pontoons: [] };
  const hall = (poly, h) => { const o = obbOf(poly); out.halls.push({ x: o.cx, z: o.cz, rotY: o.rotY, depth: o.w, len: o.d, h }); if (ctx.physics?.addBox) edgesOf(poly, (a, b, len, n, u) => { const p = Math.max(1, Math.ceil(len / 16)); for (let i = 0; i < p; i++) { const s = (i + 0.5) * len / p; ctx.physics.addBox(a[0] + u[0] * s - n[0] * 0.25, a[1] + u[1] * s - n[1] * 0.25, 0.5, len / p, Math.atan2(u[0], u[1]), -5, 40); } }); return o; };
  const base = (poly) => Math.max(1.9, Math.min(...openRing(poly).map(([x, z]) => L.heightAt(x, z))));
  /** Glazed floor band with timber mullions every `sp` m and a white slab edge on top. */
  const glazedBand = (poly, y0, y1, sp = 1.8, mat = m.glass) => {
    k.mesh(prismWalls(offsetRing(poly, -0.25), y0, y1, { tile: 3 }), mat);
    edgesOf(poly, (a, b, len, n, u) => { for (let s = 0.2; s <= len - 0.1; s += len / Math.max(1, Math.round(len / sp))) k.box(0.12, y1 - y0, 0.2, m.mullion, [a[0] + u[0] * s - n[0] * 0.12, (y0 + y1) / 2, a[1] + u[1] * s - n[1] * 0.12], [0, Math.atan2(u[0], u[1]), 0]); });
    k.mesh(prismWalls(poly, y1, y1 + 0.55, { tile: 3 }), m.white);
    k.mesh(capGeo(poly, y1 + 0.02, { down: true }), m.white);
  };
  const sign = (text, w, h, x, y, z, rotY, { color = '#2b2a33', bg = null, font = FONT.sans, weight = 900 } = {}) => {
    const tex = textTex(ctx, text, { w: 1024, h: Math.round(1024 * h / w), color, bg, font, weight, size: 0.72 });
    k.plane(w, h, mapMat(ctx, bg ? 'toon' : 'decal', '#ffffff', tex, bg ? { paint: 0 } : { transparent: true, alphaTest: 0.3 }), [x, y, z], [0, rotY, 0]);
  };

  // ============================================================== PIER7
  {
    const poly = SITES.pier7.poly, g0 = base(poly), f2 = MINAMI.wallCrest, f3 = f2 + 5.2, roofY = f3 + 4.0;
    k.mesh(prismWalls(poly, g0 - 1, g0 + 0.3), m.concrete);
    glazedBand(poly, g0 + 0.3, f2 - 0.55, 1.8, m.glassWarm);
    glazedBand(poly, f2, f3 - 0.55, 2.4);
    glazedBand(poly, f3, roofY - 0.55, 1.8);
    k.mesh(capGeo(poly, roofY), m.roof);
    k.mesh(prismWalls(offsetRing(poly, 0.05), roofY - 0.55, roofY + 0.6, { tile: 3 }), m.white);
    // interior warmth: timber-lined ceilings read through the glass
    for (const y of [f2 - 0.6, f3 - 0.6, roofY - 0.6]) k.mesh(capGeo(offsetRing(poly, -0.4), y, { down: true, tile: 2 }), m.timber);
    // the cantilevered 2F deck over the wall on the bay side, glass balustrade on steel posts
    edgesOf(poly, (a, b, len, n, u) => {
      if (len < 30 || !seaward(L, a, b, n)) return;
      const d0 = [a[0] + n[0] * 2.1, a[1] + n[1] * 2.1], d1 = [b[0] + n[0] * 2.1, b[1] + n[1] * 2.1];
      barAlong(k, d0, d1, f2 - 0.15, 4.2, 0.3, m.deck); barAlong(k, d0, d1, f2 - 0.45, 3.8, 0.35, m.steel);
      const r0 = [a[0] + n[0] * 4.1, a[1] + n[1] * 4.1], r1 = [b[0] + n[0] * 4.1, b[1] + n[1] * 4.1];
      barAlong(k, r0, r1, f2 + 1.05, 0.08, 0.08, m.steel); barAlong(k, r0, r1, f2 + 0.55, 0.04, 0.9, m.glass);
      if (ctx.physics?.addWalkBox) { const s = seg(d0, d1); ctx.physics.addWalkBox(s.x, s.z, 4.2, s.len, s.rotY, f2, f2 - 1); }
      // signage: PIER7 in Latin letters on the roof edge, the plaza name under it
      const mid = [a[0] + u[0] * len * 0.35 + n[0] * 0.7, a[1] + u[1] * len * 0.35 + n[1] * 0.7];
      sign('PIER7', 9, 1.8, mid[0], roofY - 0.1, mid[1], Math.atan2(n[0], n[1]), { color: '#3a4a5c', font: FONT.en || 'sans-serif' });
      const mid2 = [a[0] + u[0] * len * 0.72 + n[0] * 0.7, a[1] + u[1] * len * 0.72 + n[1] * 0.7];
      sign('気仙沼市まち・ひと・しごと交流プラザ', 14, 0.9, mid2[0], roofY - 0.1, mid2[1], Math.atan2(n[0], n[1]), { color: '#3a4a5c' });
      for (let s = 6; s < len - 4; s += 12) { const p = [a[0] + u[0] * s + n[0] * 3.8, a[1] + u[1] * s + n[1] * 3.8]; registry(ctx)?.point({ x: p[0], y: f2 + 1.2, z: p[1], color: '#ffe0b0', size: 0.5, intensity: 1.2, mode: 'lamps' }); }
    });
    // the bay-cruise ticket office sign at the NW end (気仙沼ベイクルーズ)
    sign('気仙沼ベイクルーズ 乗船券売場', 6.5, 0.9, 1.6, g0 + 3.0, 70.2, Math.atan2(-0.5, -0.87), { color: '#f4f2ea', bg: '#1f4fa8', font: FONT.round });
    hall(poly, roofY - g0);
    out.pier7 = { g0, f2, roofY };
  }

  // ============================================================== 迎 (ムカエル)
  {
    const poly = SITES.mukaeru.poly, g0 = base(poly), f2 = g0 + 3.6, f3 = f2 + 3.5, roofY = f3 + 3.6;
    k.mesh(prismWalls(poly, g0 - 1, g0 + 0.2), m.concrete);
    glazedBand(poly, g0 + 0.2, f2 - 0.5, 3.0, m.glassWarm);                  // shop fronts
    k.mesh(prismWalls(poly, f2 - 0.5, f2 + 0.4), m.render);                 // white render band at the 2F floor
    k.mesh(prismWalls(poly, f2 + 0.4, roofY), m.timber);                    // light timber-clad upper floors
    k.mesh(capGeo(poly, roofY), m.roof);
    k.mesh(prismWalls(offsetRing(poly, 0.05), roofY - 0.4, roofY + 0.5, { tile: 3 }), m.white);
    edgesOf(poly, (a, b, len, n, u) => {
      if (len < 8) return;
      for (const y of [f2 + 1.9, f3 + 1.8]) for (let s = 1.5; s < len - 2.5; s += 3.4) k.box(2.8, 1.9, 0.12, m.glassDark, [a[0] + u[0] * (s + 1.4) + n[0] * 0.05, y, a[1] + u[1] * (s + 1.4) + n[1] * 0.05], [0, Math.atan2(n[0], n[1]), 0]);
      if (len > 30 && seaward(L, a, b, n)) {
        // the 2F bay terrace over the wall, benches along its rail (「2Ｆレベルのデッキからは…内湾を眺められ」)
        const d0 = [a[0] + n[0] * 2.4, a[1] + n[1] * 2.4], d1 = [b[0] + n[0] * 2.4, b[1] + n[1] * 2.4];
        barAlong(k, d0, d1, MINAMI.wallCrest - 0.15, 4.8, 0.3, m.deck);
        barAlong(k, [a[0] + n[0] * 4.7, a[1] + n[1] * 4.7], [b[0] + n[0] * 4.7, b[1] + n[1] * 4.7], MINAMI.wallCrest + 1.0, 0.09, 0.09, m.timberDark || m.deck);
        for (let s = 4; s < len - 3; s += 3) k.box(0.07, 1.0, 0.07, m.steel, [a[0] + u[0] * s + n[0] * 4.7, MINAMI.wallCrest + 0.5, a[1] + u[1] * s + n[1] * 4.7]);
        if (ctx.physics?.addWalkBox) { const s = seg(d0, d1); ctx.physics.addWalkBox(s.x, s.z, 4.8, s.len, s.rotY, MINAMI.wallCrest, MINAMI.wallCrest - 1); }
        const mid = [a[0] + u[0] * len * 0.5 + n[0] * 0.2, a[1] + u[1] * len * 0.5 + n[1] * 0.2];
        sign('迎 MUKAERU', 7, 1.2, mid[0], roofY - 0.9, mid[1], Math.atan2(n[0], n[1]), { color: '#3b3530', font: FONT.serif });
      } else if (len > 30) {
        // street side: real tenant names from OSM (アンカーコーヒー, 内湾の麺食堂 いちりん, Lander Blue)
        const at = (f) => [a[0] + u[0] * len * f + n[0] * 0.2, a[1] + u[1] * len * f + n[1] * 0.2];
        for (const [f, txt, bg] of [[0.2, 'アンカーコーヒー', '#2f3f5c'], [0.5, '麺食堂 いちりん', '#f3efe4'], [0.8, 'Lander Blue', '#3f6fa8']]) { const [x, z] = at(f); sign(txt, 4.8, 0.8, x, g0 + 3.1, z, Math.atan2(n[0], n[1]), { color: bg === '#f3efe4' ? '#3b3530' : '#f4f2ea', bg, font: FONT.round }); }
        const [x, z] = at(0.5); sign('迎', 1.4, 1.4, x, roofY - 1.2, z, Math.atan2(n[0], n[1]), { color: '#3b3530', font: FONT.brush });
      }
    });
    hall(poly, roofY - g0);
    out.mukaeru = { g0, roofY };
  }

  // ============================================================== 結 (2 storeys) and 拓 (1 storey): white roofs
  for (const [id, H, label] of [['yuwaeru', 7.0, '結 ユワエル'], ['hirakeru', 5.4, '拓 ヒラケル']]) {
    const poly = SITES[id].poly, g0 = base(poly), roofY = g0 + H;
    k.mesh(prismWalls(poly, g0 - 1, roofY), H > 6 ? m.timber : m.render);
    k.mesh(capGeo(poly, roofY), m.roof);
    k.mesh(prismWalls(offsetRing(poly, 0.05), roofY - 0.3, roofY + 0.4, { tile: 3 }), m.white);
    edgesOf(poly, (a, b, len, n, u) => {
      if (len < 6) return;
      for (let s = 1.5; s < len - 3; s += 4.5) k.box(3.0, 2.2, 0.12, m.glassWarm, [a[0] + u[0] * (s + 1.5) + n[0] * 0.05, g0 + 1.4, a[1] + u[1] * (s + 1.5) + n[1] * 0.05], [0, Math.atan2(n[0], n[1]), 0]);
      if (H > 6) for (let s = 1.5; s < len - 3; s += 4.5) k.box(2.2, 1.2, 0.12, m.glass, [a[0] + u[0] * (s + 1.5) + n[0] * 0.05, g0 + 4.9, a[1] + u[1] * (s + 1.5) + n[1] * 0.05], [0, Math.atan2(n[0], n[1]), 0]);
    });
    { let best = null; edgesOf(poly, (a, b, len, n, u) => { if (!best || len > best.len) best = { a, b, len, n, u }; }); const { a, len, n, u } = best; sign(label, 4.2, 0.8, a[0] + u[0] * len / 2 + n[0] * 0.15, roofY - 0.9, a[1] + u[1] * len / 2 + n[1] * 0.15, Math.atan2(n[0], n[1]), { color: '#3b3530', font: FONT.round }); }
    hall(poly, H);
  }

  // ============================================================== the stepped garden between 迎 and PIER7
  {
    const [N, E, S, W] = MINAMI.garden;   // steps fall from the W-S edge (the wall crest) to the N-E edge (the quay)
    const top = MINAMI.wallCrest, bot = Math.max(2.1, L.heightAt(N[0], N[1]) + 0.1), n = 7;
    const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = (i + 1) / n, y = top - (top - bot) * i / n;
      const strip = [lerp(W, N, f0), lerp(W, N, f1), lerp(S, E, f1), lerp(S, E, f0)];
      k.mesh(prismWalls(strip, bot - 1.5, y, { tile: 2 }), m.concrete);
      k.mesh(capGeo(strip, y, { tile: 2 }), i % 2 ? m.step : m.deck);
      if (ctx.physics?.addWalkBox) { const o = obbOf(strip); ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, y, bot - 1); }
    }
    // three round tree pits with trees (the dark circles on the z18 photo)
    for (const [x, z] of MINAMI.pits) {
      const f = Math.max(0, Math.min(0.99, ((x - W[0]) * (N[0] - W[0]) + (z - W[1]) * (N[1] - W[1])) / ((N[0] - W[0]) ** 2 + (N[1] - W[1]) ** 2)));
      const y = top - (top - bot) * Math.floor(f * n) / n;
      k.cyl(1.7, 1.7, 0.5, m.concrete, [x, y + 0.25, z], null, 20); k.cyl(1.5, 1.5, 0.08, m.lawn, [x, y + 0.5, z], null, 20);
      k.cyl(0.16, 0.24, 3.2, m.trunk, [x, y + 2.1, z], null, 8);
      for (const [dx, dy, dz, r] of [[0, 4.4, 0, 1.9], [0.9, 3.9, 0.5, 1.4], [-0.8, 3.8, -0.6, 1.4], [0.2, 5.2, -0.2, 1.2]]) k.sphere(r, dy > 4.5 ? m.leafLit : m.leaf, [x + dx, y + dy, z + dz], 10);
    }
    // the plaza deck on the wall crest between 迎 and PIER7 (the 回廊 level), stairs down to the street side
    const plaza = [[-3.9, 47.4], [W[0], W[1]], [S[0], S[1]], [7.6, 67.8], [-4.5, 74.9], [-9.5, 50.1]];
    k.mesh(prismWalls(plaza, 1.0, top, { tile: 2 }), m.concrete);
    k.mesh(capGeo(plaza, top + 0.02, { tile: 3 }), m.deck);
    if (ctx.physics?.addWalkBox) { const o = obbOf(plaza); ctx.physics.addWalkBox(o.cx, o.cz, o.w, o.d, o.rotY, top, 1.5); }
    // the lamps along the garden's quay edge
    for (let f = 0.1; f < 1; f += 0.2) { const p = lerp(N, E, f); k.cyl(0.07, 0.09, 4, m.steel, [p[0], bot + 2, p[1]], null, 8); k.box(0.4, 0.2, 0.4, m.lamp, [p[0], bot + 4.05, p[1]]); registry(ctx)?.streetlight({ x: p[0], y: bot + 3.9, z: p[1], groundY: bot }); }
    out.garden = { top, bot };
  }

  // ============================================================== the sloped lawn north of 迎
  {
    const P = MINAMI.lawn, pos = [], idx = [];
    const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
    const yOf = (x, z) => Math.max(L.heightAt(x, z) + 0.08, 2.2 + Math.max(0, Math.min(1, (x - 14) / -40)) * 3.2);
    const rings = 4;
    for (let r = 0; r <= rings; r++) for (const p of P) { const f = r / rings, x = c[0] + (p[0] - c[0]) * f, z = c[1] + (p[1] - c[1]) * f; pos.push(x, yOf(x, z), z); }
    const n = P.length;
    for (let r = 0; r < rings; r++) for (let i = 0; i < n; i++) { const a = r * n + i, b = r * n + (i + 1) % n, cc = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const nrm = g.attributes.normal; let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } g.computeVertexNormals(); }
    k.mesh(g, m.lawn);
  }

  // ============================================================== the two floating piers
  PONTOONS.forEach((pt, i) => {
    const y = 0.55;
    k.mesh(prismWalls(pt.poly, -0.6, y), m.pontoon); k.mesh(capGeo(pt.poly, y, { tile: 2 }), ctx.mat.toon('#a9aca6', { paint: 0.06 }));
    // white membrane canopy on slim posts: a shallow curved roof over the roof outline
    const o = obbOf(pt.roof), g = k.group([o.cx, y, o.cz], o.rotY), kk = ctx.kit(g);
    const R = o.w * 0.76, arc = new THREE.CylinderGeometry(R, R, o.d, 16, 1, true, -0.72, 1.44); arc.rotateX(-Math.PI / 2);   // axis along local Z, the arc on top
    kk.mesh(arc, m.membrane, [0, 3.4 - R, 0]);
    const eave = 3.4 - R + R * Math.cos(0.72);
    for (const sx of [-1, 1]) for (let s = -o.d / 2 + 1; s <= o.d / 2 - 1 + 0.01; s += (o.d - 2) / 4) kk.cyl(0.08, 0.08, eave, m.steel, [sx * (R * Math.sin(0.72) - 0.1), eave / 2, s], null, 6);
    // gangway from the quay down to the pontoon, railed
    const [ga, gb] = pt.gang, qa = L.heightAt(gb[0], gb[1]) > 0.5 ? Math.max(1.9, L.heightAt(gb[0], gb[1])) : 2.0, s = seg(ga, gb);
    const gw = k.box(1.8, 0.2, s.len + 1, m.concrete, [s.x, (y + qa) / 2, s.z]); gw.rotation.order = 'YXZ'; gw.rotation.set(-Math.atan2(qa - y, s.len), s.rotY, 0);
    for (const sd of [-1, 1]) { const r = k.box(0.06, 0.06, s.len + 1, m.steel, [s.x + Math.cos(s.rotY) * sd * 0.9, (y + qa) / 2 + 1.0, s.z - Math.sin(s.rotY) * sd * 0.9]); r.rotation.order = 'YXZ'; r.rotation.set(-Math.atan2(qa - y, s.len), s.rotY, 0); }
    if (ctx.physics?.addWalkBox) { const po = obbOf(pt.poly); ctx.physics.addWalkBox(po.cx, po.cz, po.w, po.d, po.rotY, y, -1); ctx.physics.addWalkRamp(s.x, s.z, 1.8, s.len + 1, s.rotY, y, qa); }
    registry(ctx)?.point({ x: o.cx, y: y + 2.9, z: o.cz, color: '#fff0d0', size: 0.7, intensity: 1.5, mode: 'lamps' }); addGlint(ctx, o.cx, 0, o.cz, '#ffe0b0', 0.8, 10, 0.6);
    out.pontoons.push({ poly: pt.poly, y });
  });
  // the cruise boat's berth: along the north long side of the first pontoon, bow out to the bay
  { const P = PONTOONS[0].poly; out.berth = { a: P[2], b: P[3] }; }
  return out;
}
