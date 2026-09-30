// [v4:landmarks-B] リアス・アーク美術館 (docs/anime/landmarks/rias-ark.md; 石山修武 1994, AIJ Prize 1995) on its OSM
// outline (way 761761293, 88.6 × 41.6 m) on the 赤岩牧沢 hilltop. The "ark": a long gallery bar clad in ribbed
// aluminium-alloy panels along the north side, the main block with pink-rendered walls under a white vaulted roof,
// the roof deck with its railing, the two salmon-pink boxy pods standing on thin steel stilts, the tall narrow
// concrete chimney-mast (Commons "Riasu ark museum.jpg"). Local frame: the OBB, +x north (the bar), +z ENE.
import * as THREE from 'three';
import { OSM, SPEC } from './sites.js';
import { group, obbOf, obbPt, groundSpan, wallGeo, facadeMat, prismWalls, capGeo, mapMat, textTex, FONT, nightMat, colliders, sign } from './kit.js';

export function buildRiasArk(ctx) {
  const L = ctx.L, sp = SPEC.riasArk, t = (c, o) => ctx.mat.toon(c, o);
  const poly = OSM.riasArk.poly, o = obbOf(poly), gs = groundSpan(L, poly);
  const y0 = 94.0;   // the entrance floor (city DEM 85.5–97.7 under the outline; the museum stands on the T.P. 94–104 top)
  const { k } = group(ctx, 'lmB-riasark');
  const G = k.group([o.cx, 0, o.cz], o.rotY), kk = ctx.kit(G);
  // ribbed aluminium panels: 1.8 × 0.9 m panels with raised seams and grey weathering streaks
  const alu = facadeMat(ctx, 'riasark-alu', { W: 128, H: 64, draw: (g, W, H) => {
    g.fillStyle = sp.alu; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(60,70,80,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8f949b'; g.fillRect(0, H - 3, W, 3); g.fillRect(W - 3, 0, 3, H);
    g.fillStyle = 'rgba(90,96,104,0.25)'; for (let i = 0; i < 5; i++) g.fillRect(12 + i * 23, 4, 3, H * (0.35 + (i % 3) * 0.2));
  }, win: [0, 0, 0, 0], lit: 0 });
  const pink = t(sp.render, { paint: 0.05 }), roofW = t('#e4e6e6', { paint: 0.03 }), deck = t('#a9a8a2', { paint: 0.05 }), rail = t('#7c828b', { paint: 0 });
  // plinth: from the terrain up to the floor (the hill falls ~8 m to the NE)
  k.mesh(prismWalls(poly, gs.lo - 1, y0, { tile: 3 }), t('#a7a39a', { paint: 0.07 }));
  // ---- the gallery bar (north strip, x 12.4..20.8 along the whole length): aluminium walls, a gentle vault
  const bx0 = 12.4, bx1 = 20.8, bz0 = -44.3, bz1 = 44.3, bh = 11.0;
  const bar = [[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]];
  kk.mesh(wallGeo(bar, y0, y0 + bh, { tu: 1.8, tv: 0.9, yRef: y0 }), alu);
  const vault = new THREE.CylinderGeometry(1, 1, bz1 - bz0, 18, 1, false, Math.PI / 2, Math.PI);
  vault.rotateX(Math.PI / 2); vault.scale((bx1 - bx0) / 2, 1.3, 1);
  const vm = new THREE.Mesh(vault, alu); vm.position.set((bx0 + bx1) / 2, y0 + bh, 0); vm.castShadow = vm.receiveShadow = true; G.add(vm);
  // round portholes on the bar (the photo's circle), and the slit windows of the gallery
  for (const z of [-30, -6, 18]) { kk.cyl(1.1, 1.1, 0.25, t('#d6d9dc', { paint: 0 }), [bx1 + 0.05, y0 + 6.5, z], [0, 0, Math.PI / 2], 16); kk.cyl(0.8, 0.8, 0.3, nightMat(ctx, '#5b6a78', '#ffdcaa', 1.1), [bx1 + 0.1, y0 + 6.5, z], [0, 0, Math.PI / 2], 16); }
  for (let z = bz0 + 4; z < bz1 - 3; z += 6) kk.box(0.12, 0.5, 4.0, nightMat(ctx, '#5b6a78', '#ffdcaa', 1.1), [bx1 + 0.06, y0 + 2.2, z]);
  // ---- the main block (x −20.7..12.4, z −3..44): pink rendered walls, white vaulted roof, the roof deck
  const main = [[-20.7, -3.2], [-14.5, -8.3], [1.1, -10], [bx0, -10], [bx0, 43.9], [-20.6, 43.5]];
  const mh = 9.5;
  // the lower storey in pink render (the photo's salmon walls), the upper storeys clad in the ribbed aluminium
  kk.mesh(prismWalls(main, y0, y0 + 3.6, { tile: 3 }), pink);
  kk.mesh(wallGeo(main, y0 + 3.6, y0 + mh + 2.2, { tu: 1.8, tv: 0.9, yRef: y0 }), alu);
  const mv = new THREE.CylinderGeometry(1, 1, 46, 20, 1, false, Math.PI / 2, Math.PI);
  mv.rotateX(Math.PI / 2); mv.scale((bx0 + 20.7) / 2 - 0.3, 2.6, 1);
  const mm = new THREE.Mesh(mv, roofW); mm.position.set((bx0 - 20.7) / 2, y0 + mh + 2.2, 20.4); mm.castShadow = mm.receiveShadow = true; G.add(mm);
  kk.mesh(capGeo(main, y0 + mh + 2.2, { tile: 3 }), roofW);
  // the long roof deck on the bar with its railing (the photo's railing line)
  const dy = y0 + bh + 1.3;
  kk.box(bx1 - bx0 - 1, 0.3, bz1 - bz0 - 6, deck, [(bx0 + bx1) / 2, dy, 0]);
  for (const x of [bx0 + 0.6, bx1 - 0.6]) { kk.box(0.06, 0.06, bz1 - bz0 - 6, rail, [x, dy + 1.1, 0]); for (let z = bz0 + 3; z <= bz1 - 3; z += 2.2) kk.box(0.05, 1.1, 0.05, rail, [x, dy + 0.6, z]); }
  // ---- the two salmon-pink pods on stilts (three legs each) and the concrete chimney-mast
  const pinkPod = t(sp.pink, { paint: 0.04 }), under = t(sp.pinkDark, { paint: 0.02 }), leg = t('#8a9098', { paint: 0 });
  for (const [z, h, s] of [[-14, 5.5, 1.0], [10, 8.0, 1.15]]) {
    const P = kk.group([(bx0 + bx1) / 2, dy + h, z], 0.4), kp = ctx.kit(P);
    const pod = new THREE.Shape([[-2.6, 0], [2.6, 0], [3.2, 2.9], [-3.2, 2.9]].map(([a, b]) => new THREE.Vector2(a * s, b * s)));
    const pg = new THREE.ExtrudeGeometry(pod, { depth: 3.4 * s, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 }); pg.translate(0, 0, -1.7 * s);
    kp.mesh(pg, pinkPod);
    kp.box(5.0 * s, 0.1, 3.0 * s, under, [0, -0.02, 0]);
    kp.box(1.8 * s, 0.9 * s, 0.1, nightMat(ctx, '#b8c7cf', '#ffe2b8', 1.2), [-1.2 * s, 2.2 * s, 1.98 * s]);
    for (const a of [0, 2.1, 4.2]) kp.box(0.16, h + 0.3, 0.16, leg, [Math.cos(a) * 1.6, -h / 2, Math.sin(a) * 1.2], [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08]);
    kp.box(0.3, h, 0.3, t('#3d4048', { paint: 0 }), [0.4, -h / 2, 0.3]);   // the service ladder column
  }
  kk.boxB(1.3, 9.5, 1.8, t('#c9c2b0', { paint: 0.06 }), [(bx0 + bx1) / 2, dy, -34]);
  kk.box(0.06, 3.0, 0.06, rail, [(bx0 + bx1) / 2, dy + 11, -34]);
  // the museum plate by the entrance on the south side (the car park side)
  const en = obbPt(o, -21.4, 20);
  sign(ctx, k, 'リアス・アーク美術館  RIAS ARK MUSEUM OF ART', 6.4, 0.7, en[0], y0 + 1.4, en[1], o.rotY - Math.PI / 2, { color: '#3a3f47', bg: '#e9e6de' });
  colliders(ctx, poly, gs.lo - 2, y0 + 14);
  return { x: o.cx, z: o.cz, y: y0, top: dy + 12 };
}
