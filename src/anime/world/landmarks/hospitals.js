// [v4:landmarks-B] Hospitals (docs/anime/landmarks/hospitals.md).
//   気仙沼市立病院 (赤岩杉ノ沢, 2017; OSM way 761241989): SRC with seismic isolation, 6 storeys built (7F legal + B1),
//     8,174 m² footprint. The outline is built as a 3-storey podium with the 6-storey ward bar along its north-east
//     edge (the bar that casts the long shadow on the ortho), rooftop plant, the name on the ward bar, the entrance
//     canopy, and the ground-level heliport west of the building (OSM aeroway=helipad 761241990).
//   大友病院 (新町; OSM way 761402305, building:levels 5): white walls, the mint-green flat roofs of the ortho.
import * as THREE from 'three';
import { OSM, SPEC, POOLS_HELI } from './sites.js';
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, paintWindow, flatRoof, colliders, sign, capGeo, prismWalls, mapMat, textTex, FONT, nightMat, offsetRing, edges } from './kit.js';

export function buildHospitals(ctx) {
  const L = ctx.L, t = (c, o) => ctx.mat.toon(c, o);
  const { k } = group(ctx, 'lmB-hospitals');
  const out = {};
  // ---------------------------------------------------------------- 気仙沼市立病院
  {
    const sp = SPEC.cityHospital, poly = OSM.cityHospital.poly, gs = groundSpan(L, poly);
    const hs = poly.map(([x, z]) => L.heightAt(x, z)).sort((a, b) => a - b), y0 = hs[Math.floor(hs.length * 0.35)];
    const fac = facadeMat(ctx, 'cityhosp', { draw: paintWindow({ wall: sp.wall, frame: '#d9dde0', glass: ['#58728a', '#aec2d0'], win: [0.06, 0.34, 0.94, 0.78], mull: 3, band: { c: sp.band, y0: 0.05, y1: 0.12 } }), win: [0.06, 0.34, 0.94, 0.78], lit: 0.55 });
    const pTop = y0 + sp.podium * sp.fh;
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#b3b0a8', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, pTop, { tu: 3.6, tv: sp.fh, yRef: y0 }), fac);
    flatRoof(k, poly, pTop, t(sp.roof, { paint: 0.04 }), t(sp.wall, { paint: 0.02 }), 1.0);
    // the ward bar: 22 m deep along the north-east edge (OSM vertices 0 → 4), 6 storeys
    const A = [-694.7, 2076.7], B = [-791.5, 1989.6], n = [-0.669, 0.743], dw = 22;
    const ward = [[A[0] - 2.4 * 0.743, A[1] - 2.4 * 0.669], [B[0] + 1.5 * 0.743, B[1] + 1.5 * 0.669], [B[0] + 1.5 * 0.743 + n[0] * dw, B[1] + 1.5 * 0.669 + n[1] * dw], [A[0] - 2.4 * 0.743 + n[0] * dw, A[1] - 2.4 * 0.669 + n[1] * dw]].map(([x, z]) => [x + n[0] * 0.6, z + n[1] * 0.6]);
    const wTop = y0 + sp.wards * sp.fh;
    k.mesh(wallGeo(ward, pTop, wTop, { tu: 3.6, tv: sp.fh, yRef: y0 }), fac);
    flatRoof(k, ward, wTop, t(sp.roof, { paint: 0.04 }), t(sp.wall, { paint: 0.02 }), 1.2);
    // rooftop plant: cooling towers and plant rooms on the podium, a plant room on the ward bar
    const plant = t('#aeb3b7', { paint: 0.04 }), fanM = t('#6d747c', { paint: 0 });
    for (const [x, z, w, d] of [[-790, 2036, 14, 9], [-770, 2060, 10, 12], [-745, 2080, 9, 7]]) { k.boxB(w, 3.2, d, plant, [x, pTop, z], [0, 0.84, 0]); for (let i = -1; i <= 1; i++) k.cyl(1.1, 1.1, 0.5, fanM, [x + i * 2.6, pTop + 3.4, z], null, 10); }
    const wc = [(ward[0][0] + ward[2][0]) / 2, (ward[0][1] + ward[2][1]) / 2];
    k.boxB(12, 3.6, 8, plant, [wc[0], wTop, wc[1]], [0, 0.84, 0]);
    // the name on the ward bar's south-west face, near the top
    const nm = [(ward[2][0] + ward[3][0]) / 2 + n[0] * 0.3, (ward[2][1] + ward[3][1]) / 2 + n[1] * 0.3];
    sign(ctx, k, '気仙沼市立病院', 16, 2.4, nm[0], wTop - 2.2, nm[1], Math.atan2(n[0], n[1]), { color: '#23557a', bg: '#f4f5f3', depth: 0.2 });
    // the entrance canopy on the south-west face (towards the car park)
    const E = edges(poly).filter((e) => e.len > 40).sort((a, b) => (b.n[1] - a.n[1]))[0];
    if (E) {
      const c = [E.mid[0] + E.n[0] * 4, E.mid[1] + E.n[1] * 4], ry = Math.atan2(E.ux, E.uz);
      const Cg = k.group([c[0], y0, c[1]], ry), kc = ctx.kit(Cg);
      kc.box(9, 0.5, 26, t('#e9ebea', { paint: 0.02 }), [0, 4.4, 0]);
      for (const z of [-11, -4, 4, 11]) kc.box(0.4, 4.2, 0.4, t('#c9ccce', { paint: 0 }), [3.8, 2.1, z]);
      kc.box(0.12, 3.0, 12, nightMat(ctx, '#7f98aa', '#ffe4bc', 1.3), [-4.1, 1.5, 0]);
    }
    colliders(ctx, poly, gs.lo - 2, wTop + 2);
    // ---- the heliport (OSM 761241990): a pale pad with the white circle and H, a windsock
    const hp = POOLS_HELI.helipad.poly, ho = obbOf(hp), hy = groundSpan(L, hp).hi + 0.05;
    const heli = ctx.tex.draw(512, 512, (g, W, H) => { g.fillStyle = '#7fb4c9'; g.fillRect(0, 0, W, H); g.strokeStyle = '#f4f6f4'; g.lineWidth = 26; g.beginPath(); g.arc(W / 2, H / 2, W * 0.36, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#f4f6f4'; g.font = `900 250px ${FONT.en || 'sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', W / 2, H / 2 + 8); g.strokeStyle = '#f2c23c'; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, H - 20); }, { key: 'lmB-heli' });
    const HP = k.group([ho.cx, hy, ho.cz], ho.rotY), kh = ctx.kit(HP);
    kh.box(ho.w + 2, 0.4, ho.d + 2, t('#a9aaa6', { paint: 0.05 }), [0, -0.2, 0]);
    kh.plane(ho.w, ho.d, mapMat(ctx, 'toon', '#ffffff', heli, { paint: 0 }), [0, 0.01, 0], [-Math.PI / 2, 0, 0]);
    kh.box(0.08, 4.5, 0.08, t('#d6d8db', { paint: 0 }), [ho.w / 2 + 2, 2.25, ho.d / 2 + 2]);
    kh.cyl(0.18, 0.32, 1.4, t('#e8542f', { paint: 0 }), [ho.w / 2 + 2.7, 4.3, ho.d / 2 + 2], [0, 0, Math.PI / 2 - 0.25], 8);
    out.cityHospital = { x: wc[0], z: wc[1], y: y0, top: wTop };
  }
  // ---------------------------------------------------------------- 大友病院
  {
    const sp = SPEC.otomo, poly = OSM.otomo.poly, gs = groundSpan(L, poly), y0 = gs.lo + 0.3, top = y0 + sp.storeys * sp.fh;
    const fac = facadeMat(ctx, 'otomo', { draw: paintWindow({ wall: sp.wall, frame: '#dfe1de', glass: ['#5a7386', '#adc1cd'], win: [0.14, 0.32, 0.86, 0.8], mull: 1, sill: '#c9c6bd' }), win: [0.14, 0.32, 0.86, 0.8], lit: 0.6 });
    k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a9a69e', { paint: 0.06 }));
    k.mesh(wallGeo(poly, y0, top, { tu: 3.0, tv: sp.fh, yRef: y0 }), fac);
    flatRoof(k, poly, top, t(sp.roof, { paint: 0.04 }), t('#e8e6de', { paint: 0.02 }), 0.9);
    const o = obbOf(poly), pc = obbPt(o, -4, -20);
    k.boxB(8, 3.2, 6, t('#ecebe5', { paint: 0.02 }), [pc[0], top, pc[1]], [0, o.rotY, 0]);
    const sg = edges(poly).sort((a, b) => b.len - a.len)[0];
    sign(ctx, k, '大友病院', 6, 1.3, sg.mid[0] + sg.n[0] * 0.15, top - 1.6, sg.mid[1] + sg.n[1] * 0.15, Math.atan2(sg.n[0], sg.n[1]), { color: '#1f6a5a', bg: '#f4f4ef' });
    colliders(ctx, poly, gs.lo - 2, top + 1);
    out.otomo = { x: o.cx, z: o.cz, top };
  }
  return out;
}
