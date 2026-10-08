// [v6:fix3] The vessels moored at the north-facility quay in the dawn frames (IMG_0853 / 0855 / 0860 / 0861): the white tug 「KO1-875」
// with the 龍 roundel on its funnel, the squid boat on its stern side (rod racks, arched doors) and the long gangway to the vessel on
// its bow side. Everything is cut off the photos in the quay frame (tools/survey/tug_spec.py -> data/survey/market/tug.json:
// rectangles read off IMG_0861 and cut onto the plane of their face; hull side plane d = 1.0 (life rings 0.76 m, hull foot at the
// curb top 1.84, mooring lines); set-back faces on their own planes). Frame: a along the quay (group local z), d out to sea
// (local x), y T.P. The kit K is the quay hall's.
import * as THREE from 'three';
import { textTex, mapMat, FONT } from './util.js';
import { capGeo, prismWalls } from './lmkit.js';
import TUG from '../../../../data/survey/market/tug.json';

/** Extrude a side profile [[a, y], ...] across d0..d1 into the quay-frame group. */
function sideProfile(K, pts, d0, d1, mat) {
  const shape = new THREE.Shape(pts.map(([a, y]) => new THREE.Vector2(a, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: d1 - d0, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);   // shape x (a) -> local z, extrusion -> local -x
  return K.mesh(g, mat, [d1, 0, 0]);
}

export function buildTug(ctx, K, { floorY = 0, add = () => {}, dim = () => {} } = {}) {
  const t = (c, o) => ctx.mat.toon(c, o);
  const W = t('#eef0ee', { paint: 0.03 }), W2 = t('#e1e6e6', { paint: 0.03, side: 'double' }), BLUE = t('#2d4b8c', { paint: 0.02 }), DARK = t('#25272b', { paint: 0 }), GLASS = t('#2e3945', { paint: 0 }),
    GREY = t('#8f979c', { paint: 0.03 }), ORANGE = t('#e5622f', { paint: 0.02 }), RED = t('#a63a30', { paint: 0.02 }), STEEL = t('#aeb4b6', { paint: 0.03 }), HULL = t('#e9ece9', { paint: 0.03, side: 'double' }),
    ROD = t('#26282c', { paint: 0 }), TEAL = t('#4a9a9c', { paint: 0.02 }), TAN = t('#c9b48a', { paint: 0.03 });
  const hb = (mat, a0, a1, d0, d1, y0, y1) => K.box(d1 - d0, y1 - y0, a1 - a0, mat, [(d0 + d1) / 2, (y0 + y1) / 2, (a0 + a1) / 2]);
  const T = TUG, dH = 1.0, dEnd = 6.4;   // hull side plane, far side of the 5.4 m beam
  dim('canopy.tug.hull_plane_d', dH);
  const paintTex = (key, w, h, fn) => mapMat(ctx, 'decal', '#ffffff', ctx.tex.draw(w, h, fn, { key }), { transparent: true, alphaTest: 0.2 });

  // ---- hull: plan polygon with the bow, to the deck level; the stern end is behind the squid boat (assumed at a 80)
  const deckY = 2.1;
  { const ring = [[80.0, dH], [94.2, dH], [97.2, 2.0], [98.5, 3.7], [97.2, 5.4], [94.2, dEnd], [80.0, dEnd]].map(([a, d]) => [d, a]);
    K.mesh(prismWalls(ring, floorY, deckY, { tile: 4 }), HULL); K.mesh(capGeo(ring, deckY, { tile: 4 }), W2);
    // the hull's red boot-top / fender strake at the foot of the wall
    hb(DARK, 80.0, 94.2, dH - 0.03, dH + 0.04, 1.84, 2.0);
  }
  // ---- quarter-deck: the tall wall with the hull marking (a 82.3-89.2, top y 4.08), stepping down toward the stern
  { const w = T.wallTall;
    sideProfile(K, [[80.0, deckY], [80.0, 3.4], [w.a[0], 3.55], [w.a[0] + 0.5, w.y[1]], [w.a[1], w.y[1]], [w.a[1], deckY]], dH, dEnd - 0.4, W);
    // bulwark rail on top (posts and two rails) and the deck edge coping
    hb(GREY, w.a[0] + 0.5, w.a[1], dH, dH + 0.05, w.y[1], w.y[1] + 0.06);
    // hull marking, three portholes, two lamps, the ladder
    const txt = paintTex('tug-mark', 512, 96, (g) => { g.fillStyle = '#1b1c20'; g.textAlign = 'center'; g.textBaseline = 'middle'; let px = 96; g.font = `800 ${px}px ${FONT.sans}`; const wd = g.measureText('KO1-875').width; px = Math.floor(px * 490 / wd); g.font = `800 ${px}px ${FONT.sans}`; g.fillText('KO1-875', 256, 50); });
    K.plane(T.text.a[1] - T.text.a[0], 0.33, txt, [dH - 0.01, (T.text.y[0] + T.text.y[1]) / 2, (T.text.a[0] + T.text.a[1]) / 2], [0, -Math.PI / 2, 0]);
    for (const a of [85.5, 86.9, 88.6]) { K.cyl(0.19, 0.19, 0.06, DARK, [dH - 0.02, 3.72, a], [0, 0, Math.PI / 2], 12); K.cyl(0.14, 0.14, 0.065, GLASS, [dH - 0.03, 3.72, a], [0, 0, Math.PI / 2], 12); }
    for (const a of [84.1, 89.0]) { K.box(0.2, 0.16, 0.22, STEEL, [dH - 0.1, 3.5, a]); K.sphere(0.07, t('#fff6d0', { paint: 0 }), [dH - 0.2, 3.38, a], 8); }
    const L = T.ladder; for (const a of [L.a[0], L.a[1]]) hb(GREY, a - 0.02, a + 0.02, dH - 0.1, dH - 0.04, 2.3, L.y[1]);
    for (let y = 2.5; y < L.y[1]; y += 0.3) hb(GREY, L.a[0], L.a[1], dH - 0.1, dH - 0.04, y, y + 0.03);
    // two life rings (0.76 m, orange with white bands) hung on the rail above the wall
    [T.ring1, T.ring2].forEach((R, i) => { const a = (R.a[0] + R.a[1]) / 2, y = (R.y[0] + R.y[1]) / 2; K.mesh(new THREE.TorusGeometry(0.29, 0.085, 8, 18), ORANGE, [dH + 0.2, y, a], [0, Math.PI / 2, 0]); add(`canopy.tug.ring#${i + 1}`, a, dH + 0.2, y); });
    add('canopy.tug.mark', (T.text.a[0] + T.text.a[1]) / 2, dH - 0.01, (T.text.y[0] + T.text.y[1]) / 2); add('canopy.tug.wall_top', (w.a[0] + w.a[1]) / 2, dH, w.y[1]);
  }
  // ---- deck gear on the quarter-deck: white boxes, two blue drums, a red tank, the rails
  { const B = T.aftBox; hb(W, B.a[0], B.a[1], 2.2, 3.7, B.y[0], B.y[1]); hb(W, B.a[0] - 1.3, B.a[0], 2.2, 3.5, B.y[0], B.y[0] + 0.62); hb(W, B.a[0] - 3.1, B.a[0] - 1.6, 2.5, 3.9, B.y[0], B.y[0] + 0.55);
    hb(RED, 87.1, 87.5, 3.6, 4.0, 4.08, 4.34);
    for (const R of [T.drumL, T.drumR]) K.cyl(0.5, 0.5, R.y[1] - 4.08, BLUE, [3.1, 4.08 + (R.y[1] - 4.08) / 2, (R.a[0] + R.a[1]) / 2], null, 14);
    const w = T.wallTall; for (let a = w.a[0] + 0.5; a < w.a[1]; a += 1.2) hb(GREY, a - 0.015, a + 0.015, dH + 0.02, dH + 0.05, w.y[1], w.y[1] + 0.75);
    hb(GREY, w.a[0] + 0.5, w.a[1], dH + 0.02, dH + 0.05, w.y[1] + 0.72, w.y[1] + 0.76); hb(GREY, w.a[0] + 0.5, w.a[1], dH + 0.02, dH + 0.05, w.y[1] + 0.38, w.y[1] + 0.41);
  }
  // ---- funnel: raked white casing with the 龍 roundel, black raked cowl, blue gantry behind it
  { const F = T.funnel;
    sideProfile(K, [[F.a[0], F.y[0]], [F.a[0] + 0.02, F.y[0] + 1.8], [F.a[0] + 0.25, F.y[0] + 2.45], [F.a[0] + 0.7, F.y[1] - 0.15], [F.a[1], F.y[1] - 0.15], [F.a[1], F.y[0]]], 1.4, 3.7, W);
    sideProfile(K, [[F.a[0] + 0.5, F.y[1] - 0.15], [F.a[1], F.y[1] - 0.16], [F.a[1], F.y[1] + 0.02], [F.a[0] + 0.7, F.y[1] - 0.15 + 0.0], [F.a[0] - 0.55, F.y[1] - 0.85], [F.a[0] - 0.2, F.y[1] - 0.8]], 1.7, 3.4, DARK);
    add('canopy.tug.funnel_top', (F.a[0] + F.a[1]) / 2, 1.4, F.y[1]);
    const roundel = paintTex('tug-roundel', 256, 256, (g) => { g.strokeStyle = '#2d4b8c'; g.lineWidth = 22; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#2d4b8c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 150px ${FONT.serif}`; g.fillText('龍', 128, 138); });
    K.plane(0.68, 0.68, roundel, [1.4 - 0.008, 5.42, 87.7], [0, -Math.PI / 2, 0]);   // centre (1482, 1468) in IMG_0861 cut at d 1.4: a 87.7, T.P. 5.42
    hb(BLUE, F.a[1] + 0.02, F.a[1] + 0.9, 2.5, 3.9, F.y[0], F.y[0] + 0.7); hb(BLUE, F.a[1] + 0.05, F.a[1] + 0.2, 2.9, 3.2, F.y[0] + 0.7, F.y[1] + 0.8); hb(BLUE, F.a[1] + 0.6, F.a[1] + 0.75, 2.9, 3.2, F.y[0] + 0.7, F.y[1] + 0.8);
    hb(BLUE, F.a[1] + 0.05, F.a[1] + 0.75, 2.85, 3.25, F.y[1] + 0.7, F.y[1] + 0.85);
  }
  // ---- stair wedge between the quarter-deck and the house roof, with its blue coping and rails
  { const S = T.stair;
    sideProfile(K, [[T.wallTall.a[1], deckY], [T.wallTall.a[1], 4.0], [S.a[1] - 0.1, S.y[1] - 0.05], [S.a[1] - 0.1, deckY]], dH, dH + 0.9, W);
    hb(BLUE, T.wallTall.a[1] + 0.6, S.a[1] - 0.1, dH, dH + 0.9, S.y[1] - 0.1, S.y[1] - 0.04);
    for (const dd of [dH + 0.02, dH + 0.88]) { const g = new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(S.a[1] - T.wallTall.a[1], 1.9), 6); const m = K.mesh(g, GREY, [dd, (4.0 + deckY) / 2 + 0.4, (S.a[1] + T.wallTall.a[1]) / 2]); m.rotation.x = Math.atan2(S.a[1] - T.wallTall.a[1], 1.9); }
  }
  // ---- forward house (door, two windows, window slot) and the pilothouse above/behind it with its roof overhang and radar
  { const Hs = T.house, y0 = Hs.y[0] - 0.05;
    hb(W, Hs.a[0], Hs.a[1], Hs.d, 5.7, y0, Hs.y[1]);
    const face = paintTex('tug-house', 512, 512, (g) => {
      g.fillStyle = '#2b3139'; g.fillRect(250, 260, 110, 140); g.fillRect(380, 260, 100, 140); g.fillStyle = '#d9dede'; g.fillRect(262, 272, 86, 116);   // two windows (the left one dark, the right one lit)
      g.fillStyle = '#2b3139'; g.fillRect(262, 272, 86, 116); g.fillStyle = '#e5e9ea'; g.fillRect(392, 272, 38, 90);
      g.strokeStyle = '#b5bcc0'; g.lineWidth = 5; g.strokeRect(20, 250, 190, 250); g.fillStyle = '#2b3139'; g.fillRect(45, 290, 45, 70);   // the door with its porthole
      g.fillStyle = '#2b3139'; g.fillRect(230, 90, 210, 80);   // the window slot under the roof
    });
    K.plane(Hs.a[1] - Hs.a[0], Hs.y[1] - y0, face, [(Hs.d) - 0.01, (y0 + Hs.y[1]) / 2, (Hs.a[0] + Hs.a[1]) / 2], [0, -Math.PI / 2, 0]);
    hb(GREY, Hs.a[0], Hs.a[1], 1.85, 1.9, 3.0, 3.05);   // the gunwale rail wire
    add('canopy.tug.house_roof', (Hs.a[0] + Hs.a[1]) / 2, Hs.d, Hs.y[1]);
    const P = T.pilot;
    hb(W, P.a[0], P.a[1], 2.6, 5.4, Hs.y[1], P.y[1] - 0.15); hb(W2, P.a[0] - 0.25, P.a[1] + 0.3, 2.35, 5.65, P.y[1] - 0.15, P.y[1]);
    hb(GLASS, P.a[0] + 0.15, P.a[1] - 0.12, 2.58, 2.62, Hs.y[1] + 0.9, P.y[1] - 0.5);
    K.cyl(0.04, 0.04, 2.2, W, [4.0, P.y[1] + 1.1, (P.a[0] + P.a[1]) / 2], null, 6); K.sphere(0.32, W, [4.0, P.y[1] + 2.0, (P.a[0] + P.a[1]) / 2 - 0.1], 12);
  }
  // ---- gangway from the bow to the vessel on the bow side (a 94.1 -> 101.4 rising 0.67 m: the near handrail cut at d 1.25 in IMG_0861), rails and a stanchion at each end
  { const a0 = 94.1, a1 = 101.4, y0 = 2.12, y1 = 2.79, len = Math.hypot(a1 - a0, y1 - y0), ang = Math.atan2(y1 - y0, a1 - a0);
    const gw = K.box(1.3, 0.14, len, STEEL, [1.9, (y0 + y1) / 2, (a0 + a1) / 2]); gw.rotation.x = -ang;
    for (const d of [1.25, 2.55]) { const r = K.box(0.04, 0.06, len, GREY, [d, (y0 + y1) / 2 + 0.95, (a0 + a1) / 2]); r.rotation.x = -ang; const r2 = K.box(0.04, 0.05, len, GREY, [d, (y0 + y1) / 2 + 0.5, (a0 + a1) / 2]); r2.rotation.x = -ang;
      for (let q = 0; q <= 6; q++) { const f = q / 6; hb(GREY, a0 + f * (a1 - a0) - 0.02, a0 + f * (a1 - a0) + 0.02, d - 0.02, d + 0.02, y0 + f * (y1 - y0), y0 + f * (y1 - y0) + 0.98); } }
  }
  // ---- the neighbours: the vessel on the bow side (superstructure, mast with ladder) and the squid boat on the stern side (white house with arched doors, rod racks)
  { hb(HULL, 101.2, 112, 1.5, 8, 0, 3.05); hb(W, 102.6, 107.5, 2.8, 7.0, 3.05, 4.9); hb(GLASS, 102.6, 107.5, 2.76, 2.82, 3.7, 4.4); hb(W2, 102.4, 107.7, 2.5, 7.3, 4.9, 5.0);
    hb(W, 101.7, 102.3, 4.0, 4.6, 5.0, 8.0); hb(GREY, 101.75, 101.8, 3.9, 3.95, 3.05, 8.0); for (let y = 5.2; y < 8; y += 0.4) hb(GREY, 101.8, 102.25, 4.1, 4.18, y, y + 0.03);   // the mast with its ladder
    hb(HULL, 70, 80.4, 1.0, 3.2, 0, 1.9); hb(HULL, 70, 80.4, 3.2, 8, 0, 3.3); hb(W, 74.5, 79.0, 3.0, 7.2, 3.3, 6.0); hb(DARK, 77.2, 77.5, 2.9, 3.05, 3.3, 5.6); hb(W2, 74.3, 79.2, 2.8, 7.4, 6.0, 6.12);
    hb(W, 77.6, 80.0, 2.0, 3.0, 3.3, 4.5);
    for (let q = 0; q < 8; q++) { const a = 80.2 + q * 0.26; hb(ROD, a, a + 0.05, 2.7, 2.78, 3.3, 7.1); }   // the rod rack, black fishing rods standing up
    hb(GREY, 76.0, 82.8, 2.05, 2.1, 3.6, 3.65); hb(GREY, 76.0, 82.8, 2.05, 2.1, 4.0, 4.05);
  }
  void TEAL; void TAN;
}
