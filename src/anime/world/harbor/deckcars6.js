// [v6:fix2] The cars parked on C棟's roof deck, as photographed (IMG_0792-0798, 2026-10-01 17:07), each one its own model.
//
// A car is a LOFT: stations from the tail (t = 0) to the nose (t = 1), each a cross-section of the body (width wb from the
// sill yb to the shoulder / belt line ys) and of the greenhouse (inset wg at the belt, wr at the roof, up to yr). Where
// yr == ys the station is a hood or a boot lid. Segments with a roof station at both ends are side windows + roof,
// segments between a hood and a roof station are the windscreen / rear window. Anime treatment: flat-shaded toon
// facets in the body colour, dark glass, black sills and bumpers, silver wheels with a dark tyre, a plate and lamps.
//
// Specs: data/survey/market/cars.json ("types": the lofts, "cars": per car type, colour, wall-frame position and heading;
// each entry names what measured it). Heading `face` is degrees from "facing the wall (west)" toward +s (south).
import * as THREE from 'three';
import CARS from '../../../../data/survey/market/cars.json';

export const CARSPEC = CARS;

/** One loft -> { paint, glass, trim } geometries in the car frame: x to the car's left, y up, z forward (nose +z), origin at
 *  the centre of the footprint on the ground. */
/** Stations from the compact parameters of a type (heights above the ground, t from the tail): belt line, roof H, the tail's roof
 *  height fraction, where the roof ends / starts, where the windscreen meets the bonnet, the bonnet and nose heights. */
export function stationsOf(T) {
  if (T.st) return T.st;
  const { belt, H, tailFrac = 0.6, rearT = 0.06, frontT = 0.55, cowlT = 0.7, hood = belt - 0.05, nose = hood - 0.2, rw = 0.8 } = T;
  return [
    [0.0, 0.4, belt, belt + (H - belt) * tailFrac, 0.92, rw * 0.92],
    [0.012, 0.26, belt, belt + (H - belt) * Math.min(1, tailFrac + 0.2), 0.99, rw],
    [rearT, 0.22, belt, H, 1, rw],
    [frontT, 0.22, belt, H, 1, rw],
    [cowlT, 0.24, hood, hood, 1, 1],
    [(cowlT + 1) * 0.5 + 0.06, 0.28, hood - 0.04, hood - 0.04, 0.98, 1],
    [0.985, 0.34, nose, nose, 0.94, 1],
    [1.0, 0.4, nose - 0.04, nose - 0.04, 0.9, 1],
  ];
}
export function loftCar(type, W, L) {
  const P = { paint: [], glass: [], trim: [] };
  const st = stationsOf(type).map(([t, yb, ys, yr, wb, wr]) => ({ z: (t - 0.5) * L, yb, ys, yr, w: wb * W, wg: Math.max(wb * W - 0.14, 0.3), wr: (wr ?? wb * 0.8) * W, roof: yr > ys + 0.02 }));
  // [v6:fix3] the greenhouse side is split into a paint belt strip, the glass band, and the paint roof rail (the loft's whole slanted side used to
  // be dark glass: every car read as a black box above the belt line). 14 points: 0-1 sill, 1-2 flank, 2-3 shoulder, 3-4 belt strip, 4-5 glass,
  // 5-6 roof rail, 6-7 roof, then the mirror image.
  const lerp = (a, b, f) => a + (b - a) * f;
  const sect = (s) => {
    const g1 = (f) => [lerp(s.wg / 2, s.wr / 2, f), lerp(s.ys, s.yr, f)];
    const A1 = g1(0.1), A2 = g1(0.8);
    return [[-s.w * 0.46, s.yb], [-s.w / 2, s.yb + 0.16], [-s.w / 2, s.ys], [-s.wg / 2, s.ys], [-A1[0], A1[1]], [-A2[0], A2[1]], [-s.wr / 2, s.yr],
      [s.wr / 2, s.yr], [A2[0], A2[1]], [A1[0], A1[1]], [s.wg / 2, s.ys], [s.w / 2, s.ys], [s.w / 2, s.yb + 0.16], [s.w * 0.46, s.yb]];
  };
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  const sx = st.map(sect);
  for (let i = 0; i < st.length - 1; i++) {
    const A = sx[i], B = sx[i + 1], za = st[i].z, zb = st[i + 1].z, ra = st[i].roof, rb = st[i + 1].roof;
    const v = (S, z, j) => [S[j][0], S[j][1], z];
    const face = (j, arr) => quad(arr, v(A, za, j), v(B, zb, j), v(B, zb, j + 1), v(A, za, j + 1));
    face(0, P.trim); face(12, P.trim);
    for (const j of [1, 2, 10, 11]) face(j, P.paint);
    const both = ra && rb, none = !ra && !rb;
    if (none) for (const j of [3, 4, 5, 6, 7, 8, 9]) face(j, P.paint);
    else if (both) {
      for (const j of [3, 5, 6, 7, 9]) face(j, P.paint);
      // [v6:fix3] the side glass is split into panes by the B and C pillars (body colour, 0.13 m): a sedan / hatch reads as a car, not a black wedge
      const L = zb - za, w13 = 0.13 / Math.max(L, 0.01), cuts = L > 1.0 ? [0.0, 0.36, 0.36 + w13, 0.7, 0.7 + w13, 1.0] : [0, 1];
      for (const j of [4, 8]) for (let k = 0; k + 1 < cuts.length; k += 2) {
        const f0 = cuts[k], f1 = cuts[k + 1], lz = (f) => za + (zb - za) * f, mix = (P0, P1, f) => [P0[0] + (P1[0] - P0[0]) * f, P0[1] + (P1[1] - P0[1]) * f];
        const a0 = mix(A[j], B[j], f0), a1 = mix(A[j + 1], B[j + 1], f0), b0 = mix(A[j], B[j], f1), b1 = mix(A[j + 1], B[j + 1], f1);
        quad(P.glass, [a0[0], a0[1], lz(f0)], [b0[0], b0[1], lz(f1)], [b1[0], b1[1], lz(f1)], [a1[0], a1[1], lz(f0)]);
        if (k + 2 < cuts.length) { const c0 = mix(A[j], B[j], cuts[k + 1]), c1 = mix(A[j + 1], B[j + 1], cuts[k + 1]), d0 = mix(A[j], B[j], cuts[k + 2]), d1 = mix(A[j + 1], B[j + 1], cuts[k + 2]);
          quad(P.paint, [c0[0], c0[1], lz(cuts[k + 1])], [d0[0], d0[1], lz(cuts[k + 2])], [d1[0], d1[1], lz(cuts[k + 2])], [c1[0], c1[1], lz(cuts[k + 1])]); }
      }
    }
    else { face(3, P.paint); face(9, P.paint); for (const j of [4, 5, 6, 7, 8]) face(j, P.glass); }
  }
  // end caps: tail and nose faces (fan from the section's mean)
  for (const [i, dir] of [[0, -1], [st.length - 1, 1]]) {
    const S = sx[i], z = st[i].z, n = S.length;
    const cx = 0, cy = (st[i].yb + st[i].yr) / 2;
    for (let j = 0; j < n; j++) {
      const a = S[j], b = S[(j + 1) % n], tri = dir > 0 ? [[cx, cy, z], [b[0], b[1], z], [a[0], a[1], z]] : [[cx, cy, z], [a[0], a[1], z], [b[0], b[1], z]];
      const glassy = j >= 4 && j <= 8 && st[i].roof;
      (glassy ? P.glass : (j < 1 || j > 11 ? P.trim : P.paint)).push(...tri.flat());
    }
  }
  const out = {};
  for (const k of Object.keys(P)) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P[k], 3)); g.computeVertexNormals(); out[k] = g; }
  return out;
}

/** Build every photographed deck car into the wall-frame kit K. `enu(s, off)` is the wall frame -> group-local [x, z] (the
 *  deck group's local x = off, z = s, origin at the frame origin). Returns [{ name, s, off, ...}] for the survey features. */
export function buildDeckCars(ctx, K, y, { physics } = {}) {
  const t = (c, o) => ctx.mat.toon(c, o);
  const matGlass = t('#2c3641', { paint: 0 }), matTrim = t('#26282b', { paint: 0 }), matWheel = t('#202225', { paint: 0 }), matHub = t('#b9bcc0', { paint: 0 });
  const matPlate = t('#eceae2', { paint: 0 }), matLampW = t('#f3efe2', { paint: 0 }), matLampR = t('#a8322d', { paint: 0 });
  const built = [];
  const paintMats = {};
  const cache = {};
  for (const c of CARS.cars) {
    const T = CARS.types[c.type]; if (!T) continue;
    const L = c.L ?? T.L, W = c.W ?? T.W, H = c.H ?? T.H;
    const key = `${c.type}:${L}:${W}`;
    const geo = cache[key] || (cache[key] = loftCar(T, W, L));
    const g = new THREE.Group();
    const pm = paintMats[c.color] || (paintMats[c.color] = t(c.color, { paint: 0.02 }));
    const add = (geom, mat, pos, rot) => { const m = new THREE.Mesh(geom, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(geo.paint, pm); add(geo.glass, matGlass); add(geo.trim, matTrim);
    // wheels: tyre, hub; a wheel base and front/rear overhang from the type
    const wb = T.wheelbase ?? L * 0.62, rr = T.tyre ?? 0.32;
    const zFront = -L / 2 + (T.rearOver ?? 0.2 * L) + wb, zRear = -L / 2 + (T.rearOver ?? 0.2 * L);
    for (const zz of [zFront, zRear]) for (const sd of [-1, 1]) {
      const x = sd * (W / 2 - 0.12);
      add(new THREE.CylinderGeometry(rr, rr, 0.22, 14), matWheel, [x, rr, zz], [0, 0, Math.PI / 2]);
      add(new THREE.CylinderGeometry(rr * 0.62, rr * 0.62, 0.23, 10), matHub, [x + sd * 0.005, rr, zz], [0, 0, Math.PI / 2]);
    }
    // plates (front and rear), lamps, grille
    const plateY = 0.5;
    add(new THREE.BoxGeometry(c.kei ? 0.33 : 0.33, 0.165, 0.02), matPlate, [0, plateY, L / 2 + 0.005]);
    add(new THREE.BoxGeometry(0.33, 0.165, 0.02), matPlate, [0, plateY + 0.15, -L / 2 - 0.005]);
    for (const sd of [-1, 1]) {
      add(new THREE.BoxGeometry(0.42 * (W / 1.75), 0.11, 0.04), matLampW, [sd * (W / 2 - 0.3), T.lampY ?? 0.7, L / 2 - 0.03]);
      add(new THREE.BoxGeometry(0.22, 0.28, 0.04), matLampR, [sd * (W / 2 - 0.12), T.tailY ?? 0.85, -L / 2 + 0.03]);
      add(new THREE.BoxGeometry(0.12, 0.08, 0.1), matTrim, [sd * (W / 2 + 0.05), (T.mirrorY ?? 1.05), L * (T.mirrorZ ?? 0.12)]);
    }
    add(new THREE.BoxGeometry(W * 0.5, 0.14, 0.03), matTrim, [0, T.lampY ?? 0.7, L / 2 - 0.02]);
    const ph = (c.face ?? 0) * Math.PI / 180;
    // `nose` = the front plate's wall-frame stand (the measured point); the footprint centre is half a body length behind it
    const cs = c.nose ? c.nose[0] - Math.sin(ph) * L / 2 : c.s, co = c.nose ? c.nose[1] + Math.cos(ph) * L / 2 : c.off;
    // wall frame -> local: x = off, z = s; the nose points (ds, doff) = (sin ph, -cos ph) -> (x, z) = (-cos ph, sin ph)
    g.rotation.y = Math.atan2(-Math.cos(ph), Math.sin(ph));
    g.position.set(co, y, cs);
    K.parent.add(g);
    built.push({ name: c.name, s: cs, off: co, face: c.face ?? 0, L, W, H });
    if (physics?.addBox && c.solid !== false) { /* the deck cars are scenery: the avatar walks around the row, not through it */ }
  }
  return built;
}
