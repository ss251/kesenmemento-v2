// [v6:fix3] The JF みやぎ 2 t flat-bed truck that stands on the north-facility apron in the dawn frames (IMG_0855 / 0860 / 0861),
// built from its own parts instead of boxes: an extruded cab (raked windshield, door glass, black mirrors, headlamps, grille with
// the Toyota emblem, white bumper with the plate, orange side marker), the cream flat bed with its drop sides, cab-guard and the
// wire-mesh tail panel, a silver fuel tank, chassis rails, mud flaps and wheels with tyre, rim, hub and wheel nuts.
// Dimensions (data/survey/market/model.json hall.truck): width 1.695 m (the truck's own width, a scale reference of the dawn
// solve), wheelbase 2.47 m (cut from the two tyre contacts), tyre radius 0.33 m; cab 1.75 m long / 1.95 m high; bed 3.0 m.
// Local frame: forward = +z, x across (right = +x when facing forward), y up from the ground, the front axle at z = 0.
import * as THREE from 'three';
import { textTex, mapMat, FONT } from './util.js';

/** A 2D profile [[z, y], ...] extruded across the width (x from -w/2 to w/2), with a small bevel for rounded edges. */
function profileGeo(pts, w, bevel = 0.035) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: w - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -(w - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);   // shape x (= z of the truck) -> truck z, extrusion axis -> truck x
  return g;
}

export function buildTruck(ctx, parent, T) {
  const t = (c, o) => ctx.mat.toon(c, o);
  const w = T.width, wb = T.wb ?? 2.47, ovF = T.overhang[0], ovR = T.overhang[1];
  const M = {
    cab: t('#efeadb', { paint: 0.03 }), bed: t('#e7e1cf', { paint: 0.03 }), bedDark: t('#5a5750', { paint: 0.02 }), glass: t('#2f3b48', { paint: 0 }), glassHi: t('#53687a', { paint: 0 }),
    black: t('#25262a', { paint: 0 }), tyre: t('#222328', { paint: 0 }), rim: t('#c9ccce', { paint: 0 }), hub: t('#7d8286', { paint: 0 }), steel: t('#9aa0a3', { paint: 0.03 }),
    tank: t('#aeb2b3', { paint: 0.03 }), chassis: t('#34363c', { paint: 0 }), lamp: t('#dfe6ea', { paint: 0 }), amber: t('#e8892c', { paint: 0 }), plate: t('#f4f4ee', { paint: 0 }),
    rope: t('#c4382b', { paint: 0.02 }), mesh: t('#8a8f92', { paint: 0.02 }),
  };
  const logo = mapMat(ctx, 'decal', '#ffffff', textTex(ctx, 'JFみやぎ', { w: 512, h: 128, color: '#2f4ba3', font: FONT.sans, weight: 800, size: 0.74, key: 'jf-miyagi' }), { transparent: true, alphaTest: 0.25 });
  const logoJ = mapMat(ctx, 'decal', '#ffffff', textTex(ctx, 'JF', { w: 128, h: 96, color: '#2f4ba3', font: FONT.sans, weight: 900, size: 0.8, key: 'jf-mark' }), { transparent: true, alphaTest: 0.25 });
  const plateTx = mapMat(ctx, 'decal', '#ffffff', textTex(ctx, '宮城 800 あ 95-46', { w: 256, h: 128, color: '#25362c', bg: '#f4f4ee', font: FONT.sans, weight: 800, size: 0.5, key: 'jf-plate' }), {});
  const tg = new THREE.Group(); parent.add(tg);
  const K = ctx.kit(tg);
  const zr = -wb - ovR, zf = ovF;   // tail and nose

  // ---- chassis: two rails, cross members, the fuel tank, rear bumper
  K.box(0.1, 0.16, zf - zr - 0.1, M.chassis, [w / 2 - 0.3, 0.62, (zf + zr) / 2]); K.box(0.1, 0.16, zf - zr - 0.1, M.chassis, [-w / 2 + 0.3, 0.62, (zf + zr) / 2]);
  K.cyl(0.19, 0.19, 0.95, M.tank, [w / 2 - 0.5, 0.52, -wb * 0.5 + 0.1], [Math.PI / 2, 0, 0], 12);
  K.box(w - 0.1, 0.12, 0.1, M.steel, [0, 0.5, zr + 0.05]);

  // ---- cab: extruded side profile (cab-over: the face is the front of the truck), face tilted back at the windshield
  const cabH = T.cab?.h ?? 1.95, zcr = -0.85;
  K.mesh(profileGeo([[zcr, 0.62], [0.96, 0.5], [0.96, 1.12], [0.82, cabH - 0.02], [-0.78, cabH], [zcr, cabH - 0.1]], w), M.cab);
  // front: bumper (white, plate), grille bars, emblem, headlamps, fog lamps
  K.box(w - 0.12, 0.26, 0.07, M.cab, [0, 0.43, 0.985]); K.box(w - 0.2, 0.05, 0.02, M.black, [0, 0.31, 1.0]);
  K.plane(0.34, 0.17, plateTx, [-w / 2 + 0.34, 0.4, 1.025]);
  K.box(0.62, 0.06, 0.02, M.black, [0.1, 0.74, 0.975]); K.box(0.62, 0.05, 0.02, M.black, [0.1, 0.62, 0.975]);
  K.mesh(new THREE.SphereGeometry(0.06, 10, 6).scale(1.5, 0.9, 0.3), M.steel, [0.0, 0.88, 0.97]);
  for (const s of [-1, 1]) {
    K.box(0.3, 0.17, 0.06, M.lamp, [s * (w / 2 - 0.26), 0.82, 0.96]); K.box(0.32, 0.19, 0.03, M.black, [s * (w / 2 - 0.26), 0.82, 0.945]);
    K.box(0.1, 0.07, 0.04, M.black, [s * (w / 2 - 0.3), 0.5, 1.02]);
  }
  // windshield (raked 8.7 deg), black wipers, sun-visor line
  { const ang = Math.atan(0.14 / 0.86), wsh = 0.64, wsw = w - 0.2;
    K.plane(wsw, wsh / Math.cos(ang), M.glass, [0, 1.52, 0.894], [-ang, 0, 0]);
    K.plane(wsw - 0.3, 0.05, M.glassHi, [0.05, 1.8, 0.86], [-ang, 0, 0]);
  }
  // side glass, door and mirror, both sides
  for (const s of [-1, 1]) {
    const rot = [0, s * Math.PI / 2, 0], x = s * (w / 2 + 0.012);
    K.plane(1.02, 0.62, M.glass, [x, 1.55, 0.05], rot);   // door glass + quarter light
    K.plane(0.04, 0.62, M.cab, [x + s * 0.001, 1.55, 0.56], rot);   // A-pillar
    K.plane(0.3, 0.07, M.black, [x, 1.05, -0.2], rot);   // door handle recess / grip
    K.box(0.02, 0.9, 0.012, M.black, [x, 1.2, -0.58]); K.box(0.02, 0.012, 1.4, M.black, [x, 0.74, 0.1]);   // door seams
    K.plane(0.07, 0.07, M.amber, [x, 0.72, 0.78], rot);   // side marker
    // mirror: a tall black housing on two arms
    K.box(0.08, 0.5, 0.2, M.black, [s * (w / 2 + 0.24), 1.55, 0.8]); K.box(0.3, 0.025, 0.025, M.black, [s * (w / 2 + 0.1), 1.35, 0.78]); K.box(0.3, 0.025, 0.025, M.black, [s * (w / 2 + 0.1), 1.75, 0.78]);
  }
  K.plane(0.52, 0.13, logo, [w / 2 + 0.014, 1.04, 0.2], [0, Math.PI / 2, 0]); K.plane(0.18, 0.13, logoJ, [w / 2 + 0.014, 1.2, 0.2], [0, Math.PI / 2, 0]);
  K.plane(0.52, 0.13, logo, [-w / 2 - 0.014, 1.04, 0.2], [0, -Math.PI / 2, 0]); K.plane(0.18, 0.13, logoJ, [-w / 2 - 0.014, 1.2, 0.2], [0, -Math.PI / 2, 0]);
  K.box(w - 0.15, 0.04, 0.5, M.chassis, [0, 0.58, 0.55]);   // under-cab shadow strip

  // ---- flat bed: floor, three drop sides (0.38 m, rails), the cab guard behind the cab and the wire-mesh tail panel
  const gate = T.bed?.gate ?? 0.38, bz0 = zr, bz1 = -0.97, bl = bz1 - bz0, yf = 0.9;
  K.box(w, 0.16, bl, M.bed, [0, yf - 0.08, (bz0 + bz1) / 2]); K.box(w - 0.1, 0.02, bl - 0.1, M.bedDark, [0, yf + 0.005, (bz0 + bz1) / 2]);
  for (const s of [-1, 1]) {
    K.box(0.045, gate, bl, M.bed, [s * (w / 2 - 0.0225), yf + gate / 2, (bz0 + bz1) / 2]); K.box(0.07, 0.04, bl, M.bedDark, [s * (w / 2 - 0.03), yf + gate + 0.01, (bz0 + bz1) / 2]);
    for (let q = 0; q < 4; q++) K.box(0.03, 0.08, 0.04, M.steel, [s * (w / 2 + 0.015), yf + 0.18, bz0 + 0.35 + q * (bl - 0.7) / 3]);   // rope hooks
  }
  K.box(w, gate, 0.045, M.bed, [0, yf + gate / 2, bz0 + 0.022]);
  K.box(w - 0.04, 0.55, 0.05, M.mesh, [0, yf + gate + 0.275, bz0 + 0.03]);   // the grey wire-mesh panel standing up at the tail
  K.box(w - 0.04, gate + 0.12, 0.05, M.bed, [0, yf + (gate + 0.12) / 2, bz1 + 0.025]);   // cab guard (front board)
  K.box(0.9, 0.06, 0.45, M.rope, [-0.35, yf + 0.04, bz1 - 0.35 + 0.5 * 0]);   // the red hose / rope coil lying on the bed
  // ---- mud flaps, wheels
  for (const z of [0, -wb]) for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.12);
    K.cyl(0.33, 0.33, 0.24, M.tyre, [x, 0.33, z], [0, 0, Math.PI / 2], 16);
    K.cyl(0.215, 0.215, 0.255, M.rim, [x + s * 0.005, 0.33, z], [0, 0, Math.PI / 2], 14);
    K.cyl(0.075, 0.075, 0.28, M.hub, [x + s * 0.01, 0.33, z], [0, 0, Math.PI / 2], 8);
    for (let q = 0; q < 5; q++) { const an = q / 5 * Math.PI * 2; K.cyl(0.022, 0.022, 0.29, M.steel, [x + s * 0.012, 0.33 + Math.cos(an) * 0.12, z + Math.sin(an) * 0.12], [0, 0, Math.PI / 2], 6); }
    K.box(0.02, 0.28, 0.2, M.black, [s * (w / 2 - 0.02), 0.2, z - 0.4]);   // mud flap
  }
  return tg;
}
