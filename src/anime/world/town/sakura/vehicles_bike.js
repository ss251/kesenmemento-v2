// [v3:town] vendored from Sakuragaoka Station src/world/vehicles/bike.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// ママチャリ (Japanese city bicycle) following L.BIKE exactly:
// forward +Z, origin on the ground midway between the wheel contacts, wheel radius 0.33,
// wheelbase 1.08, grips (±0.28, 1.02, 0.50), saddle top (0, 0.86, -0.22), basket centre (0, 0.92, 0.72).
// Local +X is the rider's LEFT (bell side), -X the rider's right (chain case side).
// Whole bike = 1 vertex-coloured mesh + 1 atlas mesh (spokes, basket mesh, stickers; no outline).
import * as THREE from 'three';
import { VB, C, mtx, arcSweep, hull, cg } from './vehicles_vb.js';
import { getAtlas, getMats, R as AR } from './vehicles_atlas.js';

export const BIKE_COLORS = {
  silver: '#c3c7cc', white: '#e8e6e0', blue: '#a9c5e2', mint: '#a7d8c5', cream: '#efe3c4',
  red: '#94434d', navy: '#44507a', black: '#4a4753', pink: '#eab3c4', yellow: '#efd98e', green: '#7fae8c',
};
const LIGHT = new Set(['#c3c7cc', '#e8e6e0', '#efe3c4', '#efd98e', '#a7d8c5', '#a9c5e2', '#eab3c4']);

const TYRE = '#4a4552', RIM = '#c9cdd2', CHROME = '#d4d7db', STEEL = '#adb2b9', DARK = '#4b4852', SPOKE = '#cfd3d8';

function lighten(hex, k) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), k); return '#' + c.getHexString(); }

/** Chain case outline (z,y) as a convex hull of chainring + rear sprocket circles. */
function chainCaseGeo() {
  return cg('bike-chaincase', () => {
    const pts = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; pts.push([-0.06 + Math.cos(a) * 0.125, 0.27 + Math.sin(a) * 0.125]); pts.push([-0.54 + Math.cos(a) * 0.062, 0.33 + Math.sin(a) * 0.062]); }
    const h = hull(pts);
    const shape = new THREE.Shape(h.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 4 });
    // shape (sx, sy, sz) -> bike (-(0.078 + sz), sy, sx)
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    g.translate(-0.078, 0, 0);
    return g;
  });
}

/** Steering axis: passes through (0, 0.33, 0.487), direction (0, sin70, -cos70). */
const AXIS_P = new THREE.Vector3(0, 0.33, 0.487);
const AXIS_U = new THREE.Vector3(0, Math.sin(70 * Math.PI / 180), -Math.cos(70 * Math.PI / 180)).normalize();
function steerMatrix(a) {
  const m = new THREE.Matrix4().makeTranslation(AXIS_P.x, AXIS_P.y, AXIS_P.z);
  m.multiply(new THREE.Matrix4().makeRotationAxis(AXIS_U, a));
  m.multiply(new THREE.Matrix4().makeTranslation(-AXIS_P.x, -AXIS_P.y, -AXIS_P.z));
  return m;
}

/**
 * makeBicycle(ctx, opts) -> THREE.Group (static; add with ctx.addStatic or parent it yourself)
 * opts: color, seed, lod (0|1), steer (rad, + = front wheel turns toward +X/left), crank (rad),
 *   stand ('down'|'up'), lean (roll rad about the ground line; + leans toward -X), basket ('wire'|'none'),
 *   basketColor, contents ('bag'|'groceries'|'none'), childSeat ('front'|'rear'|null), seatCover (bool),
 *   rainCover (hex|null — rear child-seat canopy), saddleCover (hex|null), umbrella (bool), electric (bool),
 *   isNew (bool: shiny, price tag = 'tag1'|'tag2'|'tag3'), sticker ('park'|null), brand (1|2|3),
 *   saddleColor, fenderColor, rackColor.
 */
export function makeBicycle(ctx, o = {}) {
  const r = ctx.rng('bike|' + (o.seed ?? 1));
  const A = getAtlas(ctx), M = getMats(ctx);
  const lod = o.lod ?? 1;
  const frame = o.color ?? BIKE_COLORS.silver;
  const light = LIGHT.has(frame);
  const V = new VB(), D = new VB();
  const saddleC = o.saddleColor ?? r.pick(['#5a4438', '#48444f', '#6b5143', '#4c4957']);
  const gripC = saddleC;
  const fenderC = o.fenderColor ?? (o.isNew || r.chance(0.7) ? CHROME : frame);
  const rackC = o.rackColor ?? (r.chance(0.6) ? CHROME : DARK);
  const caseC = o.caseColor ?? (r.chance(0.5) ? frame : r.pick([CHROME, DARK]));
  const basketC = o.basketColor ?? (r.chance(0.55) ? '#c4c8cd' : r.pick(['#4c4a55', '#e4e2dc', frame]));
  const lockC = r.chance(0.6) ? '#47444e' : '#bfc3c8';
  const tubR = o.electric ? 0.03 : 0.024;
  const tSeg = lod ? 24 : 16, tRad = lod ? 5 : 4;

  // ================================================================ wheels
  const wheel = (z, front) => {
    V.torus(0.312, 0.0195, TYRE, [0, 0.33, z], [0, Math.PI / 2, 0], tRad, tSeg);
    V.torus(0.289, 0.009, RIM, [0, 0.33, z], [0, Math.PI / 2, 0], 4, lod ? 20 : 14);
    V.cyl(front && o.hubDynamo ? 0.038 : 0.024, front && o.hubDynamo ? 0.038 : 0.024, 0.11, STEEL, [0, 0.33, z], [0, 0, Math.PI / 2], 8);
    if (!front) V.cyl(0.05, 0.05, 0.03, DARK, [-0.05, 0.33, z], [0, 0, Math.PI / 2], 10); // band brake drum (rider's right)
    D.add(cg('bike-spokedisc', () => new THREE.CircleGeometry(0.287, lod ? 20 : 14)), SPOKE, mtx([0, 0.33, z], [0, Math.PI / 2, 0]), null, A.uvInto(AR.spokes));
  };
  const fenderProf = [[-0.028, 0.005], [0.028, 0.005], [0.028, -0.005], [-0.028, -0.005]];

  // ================================================================ rear / frame (does not steer)
  wheel(-0.54, false);
  V.add(cg('bike-fenderR' + lod, () => arcSweep(0.347, fenderProf, 0.95, 3.85, lod ? 16 : 10)), fenderC, mtx([0, 0.33, -0.54]));
  V.bar([0, 0.105, -0.80], [0, 0.03, -0.80], 0.05, 0.005, DARK);                          // mud flap
  V.box(0.04, 0.05, 0.012, '#d9463b', [0, 0.345, -0.899]);                                   // rear reflector
  // frame tubes
  V.tube([[0, 0.74, 0.338], [0, 0.60, 0.25], [0, 0.45, 0.15], [0, 0.34, 0.05], [0, 0.285, -0.02], [0, 0.27, -0.06]], tubR, frame, lod ? 12 : 8, lod ? 7 : 5);
  V.rod([0, 0.683, 0.358], [0, 0.878, 0.287], 0.027, frame, 10);                            // head tube
  V.rod([0, 0.27, -0.06], [0, 0.752, -0.216], 0.02, frame, 10);                              // seat tube
  V.rod([0, 0.73, -0.209], [0, 0.805, -0.232], 0.0125, CHROME, 6);                           // seat post
  V.tube([[0, 0.36, 0.07], [0, 0.45, -0.045], [0, 0.56, -0.15]], 0.013, frame, 5, 5);       // twin (gusset) tube
  for (const s of [-1, 1]) {
    V.rod([s * 0.035, 0.27, -0.08], [s * 0.062, 0.33, -0.54], 0.011, frame, 6);              // chain stays
    V.rod([s * 0.022, 0.70, -0.20], [s * 0.062, 0.335, -0.535], 0.0095, frame, 6);           // seat stays
  }
  V.cyl(0.03, 0.03, 0.075, frame, [0, 0.27, -0.06], [0, 0, Math.PI / 2], 10);               // BB shell
  if (o.isNew) { // anime gloss stripe on the main tube
    V.tube([[0, 0.752, 0.33], [0, 0.617, 0.244], [0, 0.468, 0.146], [0, 0.36, 0.05]], 0.009, lighten(frame, 0.55), 10, 5);
  }
  // chain case (rider's right = -X)
  V.add(chainCaseGeo(), caseC, null);
  const caseLight = caseC === CHROME || LIGHT.has(caseC);
  const bi = o.brand ?? (o.electric ? 3 : r.pick([1, 2]));
  D.add(cg('plane', () => new THREE.PlaneGeometry(1, 1)), '#ffffff', mtx([-0.1215, 0.30, -0.30], [0, -Math.PI / 2, 0], [0.22, 0.055, 1]), null, A.uvInto(AR[(caseLight ? 'brandD' : 'brandW') + bi]));
  // crank + pedals
  const ca = o.crank ?? r.range(0, Math.PI * 2);
  const cz = Math.cos(ca) * 0.165, cy = Math.sin(ca) * 0.165;
  V.rod([-0.132, 0.27, -0.06], [0.1, 0.27, -0.06], 0.012, STEEL, 6);
  V.bar([-0.132, 0.27, -0.06], [-0.132, 0.27 + cy, -0.06 + cz], 0.014, 0.024, STEEL);
  V.bar([0.1, 0.27, -0.06], [0.1, 0.27 - cy, -0.06 - cz], 0.014, 0.024, STEEL);
  for (const [px, py, pz] of [[-0.19, 0.27 + cy, -0.06 + cz], [0.158, 0.27 - cy, -0.06 - cz]]) {
    V.box(0.095, 0.026, 0.07, DARK, [px, py, pz]);
    V.box(0.02, 0.02, 0.072, '#e79a3c', [px + Math.sign(px) * 0.04, py, pz]);
  }
  // saddle (wide rear + nose), springs
  if (o.saddleCover) {
    V.rbox(0.235, 0.072, 0.30, 0.034, o.saddleCover, [0, 0.826, -0.225], null, 1);
    V.rbox(0.24, 0.022, 0.305, 0.01, lighten(o.saddleCover, -0.0), [0, 0.795, -0.225], null, 1);
  } else {
    V.sph(1, saddleC, [0, 0.83, -0.255], lod ? 12 : 8, [0.108, 0.032, 0.125]);      // wide rear
    V.sph(1, saddleC, [0, 0.828, -0.135], 8, [0.06, 0.028, 0.10]);                     // nose
    V.rbox(0.19, 0.022, 0.2, 0.01, DARK, [0, 0.805, -0.24], null, 1);                    // saddle base
  }
  for (const s of [-1, 1]) V.cyl(0.016, 0.016, 0.045, DARK, [s * 0.055, 0.782, -0.305], null, 6);
  V.box(0.13, 0.02, 0.2, DARK, [0, 0.795, -0.24]);
  // rear rack
  const RY = 0.735;
  for (const x of [-0.075, 0, 0.075]) V.box(0.014, 0.014, 0.54, rackC, [x, RY, -0.535]);
  for (const z of [-0.29, -0.45, -0.62, -0.795]) V.box(0.164, 0.012, 0.014, rackC, [0, RY, z]);
  for (const s of [-1, 1]) {
    V.rod([s * 0.075, RY, -0.79], [s * 0.066, 0.336, -0.545], 0.006, rackC, 4);
    V.rod([s * 0.075, RY, -0.52], [s * 0.066, 0.336, -0.535], 0.006, rackC, 4);
    V.rod([s * 0.05, RY, -0.275], [s * 0.024, 0.705, -0.205], 0.006, rackC, 4);
  }
  // ring lock on the seat stays (tyre passes through it)
  V.rbox(0.10, 0.065, 0.105, 0.02, lockC, [0, 0.587, -0.312], [0.723, 0, 0], 1);
  V.cyl(0.012, 0.012, 0.014, CHROME, [-0.054, 0.595, -0.31], [0, 0, Math.PI / 2], 6);
  V.box(0.004, 0.03, 0.05, '#e58aa6', [0.051, 0.583, -0.315], [0.723, 0, 0]);
  // two-leg stand
  if ((o.stand ?? 'down') === 'down') {
    for (const s of [-1, 1]) {
      V.rod([s * 0.07, 0.318, -0.556], [s * 0.135, 0.014, -0.632], 0.0085, STEEL, 5);
      V.box(0.05, 0.012, 0.045, DARK, [s * 0.135, 0.006, -0.632]);
    }
    V.rod([-0.132, 0.045, -0.628], [0.132, 0.045, -0.628], 0.007, STEEL, 5);
    V.rod([-0.085, 0.26, -0.575], [0.085, 0.26, -0.575], 0.006, STEEL, 4);
  } else {
    for (const s of [-1, 1]) V.rod([s * 0.07, 0.318, -0.556], [s * 0.118, 0.44, -0.885], 0.0085, STEEL, 5);
    V.rod([-0.118, 0.44, -0.888], [0.118, 0.44, -0.888], 0.007, STEEL, 5);
  }
  // registration / parking stickers on the seat tube (left side)
  D.add(cg('plane', () => new THREE.PlaneGeometry(1, 1)), '#ffffff', mtx([0.0215, 0.47, -0.125], [-0.314, Math.PI / 2, 0], [0.05, 0.025, 1]), null, A.uvInto(AR.reg));
  if (o.sticker === 'park') D.add(cg('plane', () => new THREE.PlaneGeometry(1, 1)), '#ffffff', mtx([0.0215, 0.40, -0.103], [-0.314, Math.PI / 2, 0], [0.05, 0.025, 1]), null, A.uvInto(AR.park));
  // rear brake cable (left lever -> along the main tube -> drum on the right)
  if (lod) V.tube([[0.20, 1.0, 0.525], [0.12, 0.9, 0.42], [0.03, 0.78, 0.35], [-0.028, 0.6, 0.25], [-0.03, 0.45, 0.155], [-0.03, 0.33, 0.04], [-0.05, 0.3, -0.2], [-0.06, 0.315, -0.44], [-0.07, 0.33, -0.5]], 0.0042, DARK, 14, 3);
  // electric assist: battery + motor
  if (o.electric) {
    V.rbox(0.085, 0.30, 0.062, 0.02, o.batteryColor ?? '#4d4a56', [0, 0.54, -0.196], [-0.314, 0, 0], 1);
    V.box(0.086, 0.04, 0.064, '#9aa1a8', [0, 0.405, -0.155], [-0.314, 0, 0]);
    V.rbox(0.10, 0.12, 0.17, 0.03, DARK, [0, 0.235, -0.07], null, 1);
  }
  // rear child seat (+ optional rain canopy)
  if (o.childSeat === 'rear') {
    const cs = o.childSeatColor ?? '#8e959f';
    V.rbox(0.33, 0.07, 0.30, 0.025, cs, [0, RY + 0.05, -0.52], null, 1);
    V.rbox(0.36, 0.44, 0.06, 0.03, cs, [0, RY + 0.25, -0.70], [0.12, 0, 0], 1);
    for (const s of [-1, 1]) {
      V.rbox(0.045, 0.2, 0.30, 0.02, cs, [s * 0.165, RY + 0.14, -0.52], null, 1);
      V.rbox(0.02, 0.22, 0.20, 0.01, cs, [s * 0.108, 0.52, -0.47], null, 1);               // foot guards
      V.box(0.07, 0.015, 0.06, DARK, [s * 0.14, 0.44, -0.42]);                               // foot rests
    }
    V.rbox(0.31, 0.05, 0.26, 0.02, '#5b5f6b', [0, RY + 0.09, -0.52], null, 1);               // cushion
    V.rod([-0.14, RY + 0.24, -0.38], [0.14, RY + 0.24, -0.38], 0.012, DARK, 6);             // grab bar
    if (o.rainCover) {
      // dome canopy (レインカバー): box body + domed roof, clear vinyl windows, reflective strip
      V.rbox(0.44, 0.36, 0.50, 0.07, o.rainCover, [0, RY + 0.21, -0.53], null, 2);
      V.sph(1, o.rainCover, [0, RY + 0.36, -0.53], 12, [0.215, 0.27, 0.245]);
      V.rbox(0.45, 0.035, 0.51, 0.015, lighten(o.rainCover, 0.3), [0, RY + 0.035, -0.53], null, 1);    // elastic hem
      for (const s of [-1, 1]) V.rbox(0.012, 0.2, 0.28, 0.005, '#d6dfe5', [s * 0.221, RY + 0.25, -0.52], null, 1);  // clear side windows
      V.rbox(0.28, 0.2, 0.012, 0.005, '#d6dfe5', [0, RY + 0.25, -0.281], null, 1);                        // front window
      V.box(0.30, 0.025, 0.006, '#e9ecef', [0, RY + 0.17, -0.781]);                                       // reflective strip
      V.rbox(0.05, 0.04, 0.02, 0.008, '#e8c547', [0.13, RY + 0.12, -0.279], null, 1);                     // zip tab
    }
  }

  // ================================================================ front assembly (steers)
  const steer = o.steer ?? 0;
  const SM = steerMatrix(steer);
  V.push(SM); D.push(SM);
  wheel(0.54, true);
  V.add(cg('bike-fenderF' + lod, () => arcSweep(0.347, fenderProf, 0.22, 3.45, lod ? 16 : 10)), fenderC, mtx([0, 0.33, 0.54]));
  V.box(0.035, 0.045, 0.01, '#f1efe6', [0, 0.52, 0.845], [-0.6, 0, 0]);                   // front reflector
  // fork
  V.box(0.12, 0.03, 0.05, frame, [0, 0.683, 0.36], [-0.349, 0, 0]);
  for (const s of [-1, 1]) V.tube([[s * 0.045, 0.68, 0.36], [s * 0.047, 0.52, 0.42], [s * 0.048, 0.40, 0.49], [s * 0.048, 0.33, 0.54]], 0.011, frame, 6, 5);
  V.box(0.05, 0.035, 0.03, DARK, [0, 0.705, 0.395], [-0.349, 0, 0]);                       // front caliper
  if (o.bottleDynamo) V.cyl(0.018, 0.018, 0.07, CHROME, [0.05, 0.575, 0.428], [-0.43, 0, 0], 8);
  // stem + handlebar
  V.rod([0, 0.86, 0.293], [0, 0.966, 0.256], 0.0145, CHROME, 8);
  V.cyl(0.02, 0.02, 0.07, CHROME, [0, 0.966, 0.262], [0, 0, Math.PI / 2], 8);
  const half = [[0.045, 0.966, 0.265], [0.085, 0.969, 0.33], [0.105, 0.976, 0.44], [0.135, 0.986, 0.535], [0.18, 1.0, 0.552], [0.215, 1.011, 0.525], [0.228, 1.015, 0.508]];
  const bar = [...half.slice().reverse().map(p => [-p[0], p[1], p[2]]), [0, 0.966, 0.262], ...half];
  V.tube(bar, 0.0115, CHROME, lod ? 26 : 16, lod ? 5 : 4);
  for (const s of [-1, 1]) {
    V.rod([s * 0.226, 1.015, 0.51], [s * 0.338, 1.022, 0.49], 0.0175, gripC, 8);            // grips (centre ±0.28, 1.02, 0.50)
    V.box(0.022, 0.022, 0.03, DARK, [s * 0.212, 1.012, 0.52]);                             // lever brackets
    V.bar([s * 0.215, 1.006, 0.54], [s * 0.325, 0.998, 0.575], 0.012, 0.02, s < 0 ? CHROME : DARK);
  }
  V.sph(0.027, CHROME, [0.158, 1.018, 0.553], 8, [1, 0.62, 1]);                             // bell
  V.cyl(0.008, 0.01, 0.02, DARK, [0.158, 1.0, 0.553], null, 6);
  if (lod) V.tube([[-0.20, 1.0, 0.525], [-0.14, 0.93, 0.47], [-0.05, 0.80, 0.43], [0, 0.72, 0.40]], 0.0042, DARK, 8, 3);  // front brake cable
  if (o.electric) V.rbox(0.07, 0.035, 0.05, 0.01, '#3f3d47', [0.075, 0.99, 0.35], [0.4, 0, 0], 1);   // assist switch
  if (o.umbrella) {
    V.rod([-0.05, 0.968, 0.30], [-0.05, 1.34, 0.285], 0.008, DARK, 5);
    V.torus(0.028, 0.006, DARK, [-0.05, 1.345, 0.285], [Math.PI / 2, 0, 0], 4, 10);
    V.box(0.03, 0.05, 0.02, DARK, [-0.05, 1.31, 0.285]);
  }
  // basket (or front child seat)
  if (o.childSeat === 'front') {
    const cs = o.childSeatColor ?? '#9aa0ab';
    V.rbox(0.28, 0.08, 0.25, 0.025, cs, [0, 0.84, 0.72], null, 1);
    V.rbox(0.30, 0.32, 0.05, 0.022, cs, [0, 1.0, 0.605], [-0.1, 0, 0], 1);
    for (const s of [-1, 1]) V.rbox(0.04, 0.13, 0.22, 0.015, cs, [s * 0.14, 0.92, 0.72], null, 1);
    V.rbox(0.25, 0.045, 0.2, 0.015, '#5b5f6b', [0, 0.885, 0.72], null, 1);
    V.rbox(0.26, 0.05, 0.05, 0.02, cs, [0, 1.0, 0.845], null, 1);
    for (const s of [-1, 1]) { V.rod([s * 0.12, 0.99, 0.845], [s * 0.12, 0.88, 0.85], 0.01, cs, 5); V.box(0.07, 0.015, 0.06, DARK, [s * 0.09, 0.60, 0.70]); V.rod([s * 0.09, 0.60, 0.70], [s * 0.1, 0.82, 0.71], 0.007, STEEL, 4); }
    V.rod([0, 0.966, 0.27], [0, 0.93, 0.59], 0.012, STEEL, 5);
  } else if ((o.basket ?? 'wire') === 'wire') {
    const bx = 0.18, y0 = 0.80, y1 = 1.04, z0 = 0.59, z1 = 0.85;
    // rims + posts
    for (const y of [y0, y1]) {
      V.rod([-bx, y, z0], [bx, y, z0], 0.0055, basketC, 4); V.rod([-bx, y, z1], [bx, y, z1], 0.0055, basketC, 4);
      V.rod([-bx, y, z0], [-bx, y, z1], 0.0055, basketC, 4); V.rod([bx, y, z0], [bx, y, z1], 0.0055, basketC, 4);
    }
    for (const x of [-bx, bx]) for (const z of [z0, z1]) V.rod([x, y0, z], [x, y1, z], 0.005, basketC, 4);
    // wire mesh panels (atlas, alpha)
    const P = cg('plane', () => new THREE.PlaneGeometry(1, 1));
    const W = 0.36, H = 0.24, Dd = 0.26, U = 0.36;
    D.add(P, basketC, mtx([0, 0.92, z1], null, [W, H, 1]), null, A.uvInto(AR.basket, [0, 0, W / U, H / U]));
    D.add(P, basketC, mtx([0, 0.92, z0], null, [W, H, 1]), null, A.uvInto(AR.basket, [0, 0, W / U, H / U]));
    D.add(P, basketC, mtx([bx, 0.92, 0.72], [0, Math.PI / 2, 0], [Dd, H, 1]), null, A.uvInto(AR.basket, [0, 0, Dd / U, H / U]));
    D.add(P, basketC, mtx([-bx, 0.92, 0.72], [0, Math.PI / 2, 0], [Dd, H, 1]), null, A.uvInto(AR.basket, [0, 0, Dd / U, H / U]));
    D.add(P, basketC, mtx([0, y0, 0.72], [-Math.PI / 2, 0, 0], [W, Dd, 1]), null, A.uvInto(AR.basket, [0, 0, W / U, Dd / U]));
    // mounting: bracket to the stem, stays to the front axle
    V.bar([0, 0.966, 0.27], [0, 0.985, 0.59], 0.03, 0.006, CHROME);
    for (const s of [-1, 1]) V.rod([s * 0.12, y0, 0.83], [s * 0.05, 0.335, 0.54], 0.005, CHROME, 4);
    // lamp under the basket front
    const lampC = o.lampColor ?? (r.chance(0.5) ? CHROME : DARK);
    V.cyl(0.03, 0.034, 0.085, lampC, [0, 0.755, 0.815], [Math.PI / 2, 0, 0], 10);
    V.cyl(0.027, 0.027, 0.01, '#f4efcf', [0, 0.755, 0.86], [Math.PI / 2, 0, 0], 10);
    V.rod([0, 0.79, 0.80], [0, 0.755, 0.80], 0.008, lampC, 4);
    // contents
    if (o.contents === 'bag') {   // navy school bag standing in the basket + charm
      V.rbox(0.30, 0.23, 0.10, 0.02, '#3f4766', [0, 0.935, 0.705], [-0.16, 0, 0], 1);
      V.torus(0.055, 0.008, '#34394f', [0.0, 1.052, 0.69], [-0.16, 0, 0], 4, 10, Math.PI);
      D.add(P, '#ffffff', mtx([0, 0.93, 0.652], [-0.16 + Math.PI, 0, 0], [0.09, 0.09, 1]), null, A.uvInto(AR.bag, [0.15, 0.2, 0.85, 0.9]));
      D.add(P, '#ffffff', mtx([0.13, 0.975, 0.635], [0, Math.PI, 0], [0.05, 0.05, 1]), null, A.uvInto(AR.charm));
      V.rod([0.13, 1.03, 0.64], [0.13, 1.0, 0.64], 0.002, '#e5d9b8', 3);
    } else if (o.contents === 'groceries') {   // eco bag + a leek sticking out (the classic)
      V.rbox(0.27, 0.19, 0.2, 0.04, o.bagColor ?? '#d9c7a8', [0, 0.9, 0.72], null, 1);
      V.cyl(0.018, 0.018, 0.3, '#eef0e4', [0.06, 1.03, 0.66], [-0.55, 0, 0.25], 6);
      V.cyl(0.02, 0.012, 0.26, '#7fae62', [0.1, 1.18, 0.55], [-0.55, 0, 0.25], 6);
      V.rbox(0.1, 0.08, 0.06, 0.02, '#e9c56a', [-0.07, 1.0, 0.76], null, 1);
    }
    if (o.isNew) {
      D.add(P, '#ffffff', mtx([0.01, 0.93, z1 + 0.012], [0.04, 0, 0.05], [0.118, 0.118, 1]), null, A.uvInto(AR[o.tag || 'tag1']));
      V.rod([0.0, 1.04, z1 + 0.005], [0.008, 0.99, z1 + 0.011], 0.0015, '#e5e0d4', 3);
      D.add(P, '#ffffff', mtx([-bx - 0.004, 0.955, 0.72], [0, -Math.PI / 2, 0], [0.09, 0.045, 1]), null, A.uvInto(AR.seibi));
    }
  }
  V.pop(); D.pop();

  // ================================================================ assemble
  const group = new THREE.Group(); group.name = 'bicycle';
  const inner = new THREE.Group(); inner.rotation.z = o.lean || 0; group.add(inner);
  const m1 = new THREE.Mesh(V.build(), M.vcol); m1.castShadow = true; m1.receiveShadow = true; inner.add(m1);
  const g2 = D.build();
  if (g2) { const m2 = new THREE.Mesh(g2, M.atlas); m2.castShadow = true; m2.receiveShadow = true; ctx.noOutline(m2); inner.add(m2); }
  group.userData.tris = V.tris + D.tris;
  return group;
}
