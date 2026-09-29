// [v3:town] vendored from Sakuragaoka Station src/world/vehicles/cars.js (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Parked cars: 軽バン (white kei van), pastel 軽自動車 (retro two-tone), retro taxi (桜ヶ丘タクシー),
// and a small compact waiting at the crossing (driver + lit brake lamps).
// Car-local frame: forward +Z, origin on the ground midway between the axles, +X = car's LEFT side
// (Japan: right-hand drive => driver sits at -X).
// Each car = 1 vertex-colour mesh + 1 atlas mesh (plates/liveries/hubcaps) + 1 glass mesh (+ tiny lit mesh).
import * as THREE from 'three';
import { VB, C, mtx, poly, quad, cg } from './vehicles_vb.js';
import { getAtlas, getMats, R as AR } from './vehicles_atlas.js';

const TYRE = '#4a4552', DARK = '#3f3d47', TRIM = '#56545e', CHROME = '#d2d6da', REDL = '#d9534f', AMBER = '#efb04a', LAMP = '#eef0e5';
const PLANE = () => cg('plane', () => new THREE.PlaneGeometry(1, 1));

/** Sutherland–Hodgman clip of a (z,y) polygon to y in [y0, y1] */
function clipY(pts, y0, y1) {
  const clip = (P, inside, inter) => { const out = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(inter(a, b)); } return out; };
  const at = (a, b, y) => { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y]; };
  let P = clip(pts, p => p[1] >= y0 - 1e-6, (a, b) => at(a, b, y0));
  P = clip(P, p => p[1] <= y1 + 1e-6, (a, b) => at(a, b, y1));
  return P;
}

/** full side profile: `top` from front-bottom over the car to rear-bottom, then bottom with wheel arches */
function profile(top, s) {
  const pts = top.slice();
  const Ra = s.Ra + (s.inset ? 0 : s.bev * 0.8);
  const arch = (zA) => {
    const al = Math.asin(Math.max(-1, Math.min(1, (s.yb - s.R) / Ra)));
    const out = [], n = 12;
    for (let i = 0; i <= n; i++) { const t = (Math.PI - al) + (2 * al - Math.PI) * i / n; out.push([zA + Ra * Math.cos(t), s.R + Ra * Math.sin(t)]); }
    return out;
  };
  pts.push(...arch(-s.wb / 2), ...arch(s.wb / 2));
  return pts;
}

function extrudeSide(pts, W, bev, taper, inset = false) {
  const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const depth = W - 2 * bev;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelOffset: inset ? -bev * 0.8 : 0, bevelSegments: inset ? 3 : 2, curveSegments: 4 });
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)); // (sx,sy,sz) -> (-sz, sy, sx)
  g.translate(depth / 2, 0, 0);
  if (taper) { // round the plan-view corners (nose / tail narrow a little)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const tf = Math.max(0, (z - taper.zF0) / (taper.zF1 - taper.zF0)), tr = Math.max(0, (taper.zR0 - z) / (taper.zR0 - taper.zR1));
      let k = 1 - taper.kF * tf * tf - taper.kR * tr * tr;
      if (taper.kS) { const ts = Math.max(0, Math.min(1, (p.getY(i) - taper.yS) / (taper.yT - taper.yS))); k *= 1 - taper.kS * ts * ts; }
      p.setX(i, p.getX(i) * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** body tint: dark wheel-arch tunnels + underside, dusty sills */
function bodyTint(s, dirt = '#a39a90', amt = 0.32) {
  const dk = C('#46434d'), dc = C(dirt);
  return (p, c, n) => {
    if (n.y < -0.7) { c.copy(dk); return; }
    for (const za of [-s.wb / 2, s.wb / 2]) {
      const d = Math.hypot(p.z - za, p.y - s.R);
      if (Math.abs(n.x) < 0.8 && d < s.Ra + s.bev + 0.02 && p.y > s.yb - 0.01) { c.copy(dk); return; }
    }
    if (p.y < s.sill) c.lerp(dc, amt * Math.min(1, (s.sill - p.y) / Math.max(0.05, s.sill - s.yb)));
  };
}

function wheels(V, D, A, s) {
  for (const z of [-s.wb / 2, s.wb / 2]) for (const side of [-1, 1]) {
    const x = side * s.track / 2;
    V.cyl(s.R, s.R, s.tw, TYRE, [x, s.R, z], [0, 0, Math.PI / 2], 20);
    V.cyl(s.R * 0.8, s.R * 0.8, s.tw + 0.004, '#3f3c46', [x, s.R, z], [0, 0, Math.PI / 2], 14);
    D.add(cg('circ18', () => new THREE.CircleGeometry(1, 18)), '#ffffff', mtx([x + side * (s.tw / 2 + 0.006), s.R, z], [0, side * Math.PI / 2, 0], [s.R * s.capK, s.R * s.capK, 1]), null, A.uvInto(AR[s.cap]));
  }
}

/** number plate (frame + atlas plane) on a face with outward direction rotY (0 = +Z, PI = -Z) */
function plate(V, D, A, reg, x, y, z, rotY) {
  const nx = Math.sin(rotY), nz = Math.cos(rotY);
  V.box(0.35, 0.185, 0.012, TRIM, [x, y, z], [0, rotY, 0]);
  D.add(PLANE(), '#ffffff', mtx([x + nx * 0.0075, y, z + nz * 0.0075], [0, rotY, 0], [0.33, 0.165, 1]), null, A.uvInto(reg));
}
/** decal plane on the side (+1 = +X side, -1 = -X side) */
function sideDecal(D, A, reg, side, x, y, z, w, h) {
  D.add(PLANE(), '#ffffff', mtx([side * x, y, z], [0, side * Math.PI / 2, 0], [w, h, 1]), null, A.uvInto(reg));
}
function doorMirror(V, x, y, z, side, col) {
  V.rod([side * x, y, z], [side * (x + 0.09), y + 0.03, z - 0.02], 0.012, DARK, 5);
  V.rbox(0.07, 0.10, 0.15, 0.025, col, [side * (x + 0.13), y + 0.05, z - 0.03], [0, side * 0.2, 0], 1);
  V.box(0.05, 0.075, 0.004, '#a9b8c6', [side * (x + 0.13), y + 0.05, z - 0.107], [0, side * 0.2, 0]);
}
function seat(V, x, z, w, col, yb, back = 0.58) {
  V.rbox(w, 0.13, 0.46, 0.045, col, [x, yb + 0.065, z], null, 1);
  V.rbox(w, back, 0.12, 0.045, col, [x, yb + 0.1 + back / 2, z - 0.26], [-0.18, 0, 0], 1);
  V.rbox(w * 0.55, 0.15, 0.1, 0.035, col, [x, yb + 0.12 + back + 0.07, z - 0.30 - back * 0.18], [-0.18, 0, 0], 1);
}
function doorLine(V, W, z, y0, y1) {
  for (const s of [-1, 1]) V.box(0.004, y1 - y0, 0.008, '#57545e', [s * (W / 2 + 0.002), (y0 + y1) / 2, z]);
}
function wipers(V, pts) { for (const [a, b] of pts) V.bar(a, b, 0.018, 0.012, '#403e48'); }

function finish(ctx, V, D, G, E, name, M) {
  const g = new THREE.Group(); g.name = name;
  const inner = new THREE.Group(); g.add(inner); g.userData.inner = inner;
  const add = (vb, mat, opts = {}) => {
    const geo = vb && vb.build(); if (!geo) return null;
    const m = new THREE.Mesh(geo, mat); m.castShadow = opts.cast ?? true; m.receiveShadow = opts.recv ?? true;
    if (opts.noOutline) ctx.noOutline(m);
    if (opts.order) m.renderOrder = opts.order;
    inner.add(m); return m;
  };
  add(V, M.vcol);
  add(D, M.atlas, { noOutline: true });
  add(G, M.glass, { noOutline: true, cast: false, recv: false, order: 1 });
  if (E) for (const [vb, mat] of E) add(vb, mat, { noOutline: true, cast: false });
  return g;
}

// ============================================================================ 軽バン (white kei van)
export function makeKeiVan(ctx) {
  const A = getAtlas(ctx), M = getMats(ctx);
  const s = { W: 1.475, wb: 2.43, R: 0.285, tw: 0.15, track: 1.23, yb: 0.24, Ra: 0.34, sill: 0.46, bev: 0.035, cap: 'capSteel', capK: 0.68 };
  const BODY = '#e8e8e3', RES = '#8e9199';
  const V = new VB(), D = new VB(), G = new VB();
  const top = [[1.70, 0.24], [1.735, 0.30], [1.735, 0.56], [1.705, 0.63], [1.665, 0.93], [1.55, 1.0], [1.36, 1.035], [1.30, 1.04], [-1.63, 1.04], [-1.665, 1.0], [-1.665, 0.30], [-1.63, 0.24]];
  V.add(extrudeSide(profile(top, s), s.W, s.bev, { zF0: 1.35, zF1: 1.76, kF: 0.05, zR0: -1.45, zR1: -1.69, kR: 0.03 }), BODY, null, bodyTint(s));
  wheels(V, D, A, s);
  // greenhouse
  const gx = 0.716;
  for (const sd of [-1, 1]) {
    V.bar([sd * gx, 1.04, 1.30], [sd * gx, 1.84, 0.915], 0.055, 0.055, BODY);         // A
    V.box(0.05, 0.80, 0.07, DARK, [sd * 0.717, 1.44, 0.32]);                          // B (black)
    V.box(0.05, 0.80, 0.09, BODY, [sd * 0.717, 1.44, -0.66]);                         // C
    V.box(0.06, 0.80, 0.10, BODY, [sd * 0.712, 1.44, -1.615]);                        // D
    G.add(poly([[1.30, 1.045], [0.915, 1.83], [-1.615, 1.83], [-1.615, 1.045]]), '#fff', mtx([sd * (gx + 0.001), 0, 0], [0, -Math.PI / 2, 0]));
  }
  V.rbox(1.45, 0.075, 2.64, 0.03, BODY, [0, 1.855, -0.345], null, 1);                  // roof
  G.add(quad([-0.69, 1.045, 1.30], [0.69, 1.045, 1.30], [0.69, 1.83, 0.915], [-0.69, 1.83, 0.915]), '#fff');
  G.add(quad([0.69, 1.07, -1.668], [-0.69, 1.07, -1.668], [-0.69, 1.80, -1.668], [0.69, 1.80, -1.668]), '#fff');
  V.box(1.42, 0.05, 0.06, BODY, [0, 1.055, -1.64]);                                    // hatch sill
  wipers(V, [[[-0.62, 1.06, 1.297], [-0.06, 1.10, 1.285]], [[0.08, 1.06, 1.297], [0.62, 1.10, 1.285]]]);
  // roof rack + aluminium ladder
  for (const z of [0.55, -1.30]) { V.rbox(1.38, 0.035, 0.04, 0.012, DARK, [0, 1.93, z], null, 1); for (const sd of [-1, 1]) V.box(0.04, 0.05, 0.05, DARK, [sd * 0.66, 1.905, z]); }
  for (const x of [-0.2, 0.2]) V.box(0.045, 0.03, 2.3, '#c9ced3', [x, 1.965, -0.37]);
  for (let z = -1.42; z <= 0.72; z += 0.285) V.box(0.40, 0.022, 0.03, '#c9ced3', [0, 1.962, z]);
  // front
  for (const sd of [-1, 1]) {
    V.rbox(0.26, 0.14, 0.05, 0.02, LAMP, [sd * 0.49, 0.77, 1.712], [-0.14, 0, 0], 1);
    V.rbox(0.10, 0.06, 0.04, 0.015, AMBER, [sd * 0.58, 0.655, 1.738], null, 1);
    doorMirror(V, 0.74, 1.08, 1.20, sd, DARK);
  }
  D.add(PLANE(), '#ffffff', mtx([0, 0.79, 1.718], [-0.14, 0, 0], [0.56, 0.13, 1]), null, A.uvInto(AR.vanGrille));
  V.rbox(1.50, 0.22, 0.16, 0.06, RES, [0, 0.43, 1.73], null, 1);
  plate(V, D, A, AR.plVan, 0, 0.45, 1.816, 0);
  // rear
  V.rbox(1.50, 0.2, 0.14, 0.05, RES, [0, 0.40, -1.67], null, 1);
  for (const sd of [-1, 1]) {
    V.rbox(0.10, 0.24, 0.05, 0.02, REDL, [sd * 0.64, 0.86, -1.69], null, 1);
    V.rbox(0.10, 0.10, 0.05, 0.02, AMBER, [sd * 0.64, 0.67, -1.69], null, 1);
  }
  plate(V, D, A, AR.plVan, 0, 0.66, -1.699, Math.PI);
  D.add(PLANE(), '#ffffff', mtx([0, 0.92, -1.702], [0, Math.PI, 0], [0.60, 0.15, 1]), null, A.uvInto(AR.vanRear));
  V.box(0.12, 0.03, 0.02, TRIM, [0, 0.80, -1.70]);                                     // hatch handle
  // sides: doors, sliding-door rail, handles, lettering
  doorLine(V, s.W, 0.32, 0.30, 1.04); doorLine(V, s.W, 1.28, 0.66, 1.04); doorLine(V, s.W, -0.64, 0.30, 1.04);
  for (const sd of [-1, 1]) {
    V.box(0.004, 0.012, 0.94, '#57545e', [sd * (s.W / 2 + 0.002), 1.0, -1.11]);
    V.box(0.014, 0.035, 0.11, TRIM, [sd * (s.W / 2 + 0.006), 0.92, 0.42]);
    V.box(0.014, 0.035, 0.11, TRIM, [sd * (s.W / 2 + 0.006), 0.90, 0.18]);
    V.box(0.004, 0.13, 0.13, '#d9d9d3', [sd * (s.W / 2 + 0.002), 0.86, -1.35]);          // fuel lid
    sideDecal(D, A, AR.vanSide, sd, s.W / 2 + 0.005, 0.83, -0.50, 1.30, 0.325);
  }
  // interior: seats, dash, wheel, cargo (boxes + PVC pipes)
  for (const sd of [-1, 1]) seat(V, sd * 0.32, 0.64, 0.46, '#6f6c78', 0.66, 0.6);
  V.rbox(1.38, 0.16, 0.34, 0.04, '#5a5763', [0, 1.0, 1.16], null, 1);
  V.torus(0.17, 0.017, DARK, [-0.34, 1.15, 0.94], [-0.95, 0, 0], 5, 18);
  V.rbox(0.45, 0.34, 0.40, 0.02, '#c9a77a', [0.30, 0.80, -1.12], null, 1);
  V.rbox(0.40, 0.30, 0.36, 0.02, '#d4b588', [0.28, 1.12, -1.10], [0, 0.12, 0], 1);
  V.rbox(0.36, 0.28, 0.34, 0.02, '#c9a77a', [0.30, 0.78, -0.62], null, 1);
  for (let i = 0; i < 3; i++) V.cyl(0.03, 0.03, 1.9, '#b9bfc4', [-0.28 + i * 0.065, 1.13 + (i % 2) * 0.02, -0.62], [Math.PI / 2, 0, 0], 8);
  const g = finish(ctx, V, D, G, null, 'keiVan', M);
  g.userData.dims = { W: s.W, zF: 1.81, zR: -1.72, H: 2.0, wb: s.wb };
  return g;
}

// ============================================================================ 軽自動車 (retro two-tone kei)
export function makeKeiCar(ctx, o = {}) {
  const A = getAtlas(ctx), M = getMats(ctx);
  const s = { W: 1.475, wb: 2.46, R: 0.28, tw: 0.155, track: 1.24, yb: 0.20, Ra: 0.33, sill: 0.40, bev: 0.065, inset: true, cap: 'capCover', capK: 0.7 };
  const BODY = o.color ?? '#9fd4c2', ROOF = '#efe9dd';
  const V = new VB(), D = new VB(), G = new VB();
  const top = [[1.70, 0.22], [1.73, 0.30], [1.73, 0.52], [1.715, 0.62], [1.67, 0.70], [1.58, 0.76], [1.40, 0.82], [1.15, 0.875], [1.08, 0.895], [-1.52, 0.925], [-1.60, 0.915], [-1.645, 0.86], [-1.665, 0.75], [-1.665, 0.32], [-1.64, 0.22]];
  V.add(extrudeSide(profile(top, s), s.W, s.bev, { zF0: 1.25, zF1: 1.76, kF: 0.09, zR0: -1.35, zR1: -1.69, kR: 0.05, yS: 0.76, yT: 0.95, kS: 0.035 }, true), BODY, null, bodyTint(s, '#a7a092', 0.25));
  wheels(V, D, A, s);
  const gx = 0.685;
  for (const sd of [-1, 1]) {
    V.bar([sd * gx, 0.90, 1.08], [sd * gx, 1.44, 0.45], 0.05, 0.05, ROOF);
    V.box(0.045, 0.53, 0.07, DARK, [sd * 0.687, 1.165, -0.12]);
    V.box(0.05, 0.53, 0.30, ROOF, [sd * 0.688, 1.17, -1.43]);
    V.box(0.004, 0.012, 2.5, CHROME, [sd * (s.W / 2 * 0.981 + 0.003), 0.90, -0.22]);    // belt chrome
    G.add(poly([[1.08, 0.905], [0.46, 1.43], [-1.285, 1.43], [-1.285, 0.915]]), '#fff', mtx([sd * (gx + 0.001), 0, 0], [0, -Math.PI / 2, 0]));
  }
  V.rbox(1.40, 0.09, 2.08, 0.045, ROOF, [0, 1.475, -0.54], null, 2);
  G.add(quad([-0.64, 0.905, 1.08], [0.64, 0.905, 1.08], [0.64, 1.43, 0.46], [-0.64, 1.43, 0.46]), '#fff');
  G.add(quad([0.62, 0.94, -1.628], [-0.62, 0.94, -1.628], [-0.62, 1.43, -1.55], [0.62, 1.43, -1.55]), '#fff');
  wipers(V, [[[-0.58, 0.915, 1.075], [-0.05, 0.955, 1.03]], [[0.06, 0.915, 1.075], [0.56, 0.955, 1.03]]]);
  // front: round lamps with chrome rings, oval grille + emblem, white bumper
  for (const sd of [-1, 1]) {
    V.cyl(0.088, 0.088, 0.05, LAMP, [sd * 0.50, 0.66, 1.72], [Math.PI / 2 - 0.35, 0, 0], 16);
    V.torus(0.09, 0.012, CHROME, [sd * 0.50, 0.6686, 1.7435], [-0.35, 0, 0], 4, 16);
    V.rbox(0.07, 0.04, 0.03, 0.01, AMBER, [sd * 0.62, 0.52, 1.76], null, 1);
    doorMirror(V, 0.72, 0.95, 0.98, sd, ROOF);
  }
  V.rbox(0.36, 0.08, 0.03, 0.02, CHROME, [0, 0.60, 1.735], null, 1);
  D.add(PLANE(), '#ffffff', mtx([0, 0.60, 1.753], null, [0.065, 0.065, 1]), null, A.uvInto(AR.sakuraMark));
  V.rbox(1.50, 0.18, 0.14, 0.05, ROOF, [0, 0.40, 1.735], null, 1);
  plate(V, D, A, AR.plKei, 0, 0.42, 1.812, 0);
  // rear
  V.rbox(1.50, 0.18, 0.13, 0.05, ROOF, [0, 0.40, -1.67], null, 1);
  for (const sd of [-1, 1]) { V.rbox(0.12, 0.17, 0.05, 0.03, REDL, [sd * 0.60, 0.82, -1.69], null, 1); V.rbox(0.12, 0.055, 0.05, 0.02, AMBER, [sd * 0.60, 0.70, -1.69], null, 1); }
  plate(V, D, A, AR.plKei, 0, 0.62, -1.672, Math.PI);
  D.add(PLANE(), '#ffffff', mtx([-0.42, 0.64, -1.672], [0, Math.PI, 0], [0.15, 0.15, 1]), null, A.uvInto(AR.beginner));   // 初心者マーク
  V.box(0.14, 0.03, 0.02, CHROME, [0, 0.78, -1.673]);
  // doors
  doorLine(V, s.W, 1.05, 0.62, 0.85); doorLine(V, s.W, -0.12, 0.24, 0.85); doorLine(V, s.W, -1.05, 0.62, 0.85);
  for (const sd of [-1, 1]) for (const z of [-0.02, -0.95]) V.box(0.014, 0.03, 0.10, CHROME, [sd * (s.W / 2 + 0.006), 0.83, z]);
  // interior
  for (const sd of [-1, 1]) seat(V, sd * 0.32, 0.25, 0.46, '#dccfb6', 0.50, 0.55);
  V.rbox(1.2, 0.12, 0.46, 0.04, '#dccfb6', [0, 0.56, -0.78], null, 1);
  V.rbox(1.2, 0.50, 0.12, 0.04, '#dccfb6', [0, 0.86, -1.03], [-0.15, 0, 0], 1);
  V.rbox(1.36, 0.14, 0.34, 0.04, '#e6dfcf', [0, 0.87, 0.90], null, 1);
  V.torus(0.17, 0.017, '#6d6977', [-0.34, 1.0, 0.64], [-0.5, 0, 0], 5, 18);
  V.box(1.28, 0.02, 0.28, '#5a5763', [0, 0.93, -1.40]);
  V.sph(0.075, '#f2b9c9', [0.36, 1.02, -1.40], 8); V.sph(0.058, '#f2b9c9', [0.36, 1.12, -1.40], 8);    // plush bear
  for (const sd of [-1, 1]) V.sph(0.022, '#f2b9c9', [0.36 + sd * 0.04, 1.17, -1.40], 6);
  V.rbox(0.24, 0.08, 0.12, 0.02, '#f3c8d5', [-0.30, 0.98, -1.40], null, 1);                            // tissue box
  const g = finish(ctx, V, D, G, null, 'keiCar', M);
  g.userData.dims = { W: s.W, zF: 1.81, zR: -1.74, H: 1.56, wb: s.wb };
  return g;
}

// ============================================================================ retro taxi (桜ヶ丘タクシー)
export function makeTaxi(ctx) {
  const A = getAtlas(ctx), M = getMats(ctx);
  const s = { W: 1.695, wb: 2.68, R: 0.30, tw: 0.185, track: 1.40, yb: 0.22, Ra: 0.355, sill: 0.40, bev: 0.03, cap: 'capTaxi', capK: 0.72 };
  const ROSE = '#c47a8f', CREAM = '#f0e9da';
  const V = new VB(), D = new VB(), G = new VB(), E = new VB();
  const top = [[2.23, 0.24], [2.25, 0.30], [2.26, 0.62], [2.24, 0.78], [2.18, 0.84], [1.60, 0.875], [1.10, 0.905], [1.00, 0.915], [-1.38, 0.935], [-1.50, 0.945], [-2.30, 0.935], [-2.40, 0.905], [-2.43, 0.80], [-2.43, 0.34], [-2.40, 0.24]];
  const full = profile(top, s), SPLIT = 0.70, TP = { zF0: 1.7, zF1: 2.29, kF: 0.06, zR0: -1.9, zR1: -2.46, kR: 0.05 };
  V.add(extrudeSide(clipY(full, -1, SPLIT), s.W, s.bev, TP), ROSE, null, bodyTint(s, '#a3928c', 0.28));
  V.add(extrudeSide(clipY(full, SPLIT, 9), s.W, s.bev, TP), CREAM, null, bodyTint(s));
  wheels(V, D, A, s);
  const gx = 0.735, hw = s.W / 2;
  for (const sd of [-1, 1]) {
    V.bar([sd * gx, 0.92, 1.00], [sd * (gx - 0.005), 1.42, 0.30], 0.05, 0.05, CREAM);
    V.box(0.045, 0.49, 0.065, CREAM, [sd * (gx + 0.002), 1.175, -0.19]);
    V.bar([sd * (gx - 0.005), 1.42, -0.80], [sd * gx, 0.94, -1.40], 0.05, 0.12, CREAM);
    V.box(0.012, 0.014, 2.40, CHROME, [sd * (gx + 0.012), 0.93, -0.20]);                 // belt chrome
    V.rod([sd * (gx + 0.01), 1.414, 0.30], [sd * (gx + 0.01), 1.414, -0.80], 0.007, CHROME, 4);
    V.box(0.014, 0.026, 3.6, CHROME, [sd * (hw + 0.004), SPLIT, -0.10]);              // side moulding (two-tone split)
    G.add(poly([[1.00, 0.93], [0.30, 1.415], [-0.80, 1.415], [-1.40, 0.945]]), '#fff', mtx([sd * (gx + 0.001), 0, 0], [0, -Math.PI / 2, 0]));
    sideDecal(D, A, AR.taxiDoor, sd, hw + 0.005, 0.815, 0.36, 0.84, 0.21);
  }
  V.rbox(1.46, 0.06, 1.17, 0.03, CREAM, [0, 1.445, -0.24], null, 1);
  G.add(quad([-0.70, 0.925, 1.00], [0.70, 0.925, 1.00], [0.69, 1.415, 0.30], [-0.69, 1.415, 0.30]), '#fff');
  G.add(quad([0.64, 0.95, -1.40], [-0.64, 0.95, -1.40], [-0.64, 1.415, -0.79], [0.64, 1.415, -0.79]), '#fff');
  wipers(V, [[[-0.64, 0.935, 0.99], [-0.08, 0.975, 0.93]], [[0.08, 0.935, 0.99], [0.62, 0.975, 0.93]]]);
  // andon (roof sign) + 空車 lamp
  V.box(0.30, 0.03, 0.12, DARK, [0, 1.49, 0.02]);
  V.rbox(0.42, 0.15, 0.14, 0.03, '#f3ecdc', [0, 1.58, 0.02], null, 1);
  D.add(PLANE(), '#ffffff', mtx([0, 1.58, 0.0925], null, [0.37, 0.13, 1]), null, A.uvInto(AR.andon));
  D.add(PLANE(), '#ffffff', mtx([0, 1.58, -0.0525], [0, Math.PI, 0], [0.37, 0.13, 1]), null, A.uvInto(AR.andon));
  V.box(0.19, 0.095, 0.03, DARK, [0.40, 1.03, 0.772], [-0.25, 0, 0]);
  E.add(PLANE(), '#ffffff', mtx([0.40, 1.03, 0.789], [-0.25, 0, 0], [0.17, 0.085, 1]), null, A.uvInto(AR.kusha));
  // front: chrome bumper, grille, lamps, fender mirrors
  V.rbox(1.74, 0.13, 0.16, 0.04, CHROME, [0, 0.42, 2.27], null, 1);
  for (const sd of [-1, 1]) V.box(0.10, 0.10, 0.03, DARK, [sd * 0.52, 0.42, 2.355]);
  D.add(PLANE(), '#ffffff', mtx([0, 0.665, 2.292], null, [0.78, 0.19, 1]), null, A.uvInto(AR.grille));
  for (const sd of [-1, 1]) {
    V.rbox(0.22, 0.12, 0.04, 0.015, LAMP, [sd * 0.60, 0.685, 2.285], null, 1);
    V.box(0.235, 0.135, 0.03, CHROME, [sd * 0.60, 0.685, 2.275]);
    V.rbox(0.12, 0.05, 0.03, 0.01, AMBER, [sd * 0.60, 0.57, 2.292], null, 1);
    V.rod([sd * 0.66, 0.87, 1.78], [sd * 0.68, 1.0, 1.76], 0.008, DARK, 5);
    V.rbox(0.06, 0.075, 0.10, 0.02, DARK, [sd * 0.69, 1.03, 1.75], null, 1);
  }
  plate(V, D, A, AR.plTaxi, 0, 0.42, 2.357, 0);
  // rear
  V.rbox(1.74, 0.13, 0.16, 0.04, CHROME, [0, 0.42, -2.44], null, 1);
  for (const sd of [-1, 1]) {
    V.rbox(0.34, 0.13, 0.04, 0.02, REDL, [sd * 0.58, 0.80, -2.452], null, 1);
    V.rbox(0.12, 0.13, 0.04, 0.02, AMBER, [sd * 0.33, 0.80, -2.452], null, 1);
  }
  plate(V, D, A, AR.plTaxi, 0, 0.62, -2.46, Math.PI);
  D.add(PLANE(), '#ffffff', mtx([0, 0.80, -2.462], [0, Math.PI, 0], [0.40, 0.10, 1]), null, A.uvInto(AR.taxiRear));
  D.add(PLANE(), '#ffffff', mtx([0.42, 1.03, -1.21], [-0.8, Math.PI, 0], [0.12, 0.06, 1]), null, A.uvInto(AR.kinen));   // 禁煙車 on the rear glass (inside)
  V.box(1.5, 0.004, 0.006, '#57545e', [0, 0.972, -1.52]);                               // trunk seam
  V.rod([-0.60, 0.97, -2.15], [-0.62, 1.75, -2.25], 0.004, DARK, 4);                    // antenna
  // doors
  doorLine(V, s.W, 0.97, 0.66, 0.93); doorLine(V, s.W, -0.17, 0.24, 0.935); doorLine(V, s.W, -1.28, 0.66, 0.94);
  for (const sd of [-1, 1]) for (const z of [-0.05, -1.16]) V.box(0.014, 0.03, 0.12, CHROME, [sd * (hw + 0.006), 0.84, z]);
  // interior with white lace seat covers
  const SEAT = '#6e6a78', LACE = '#f1efea';
  for (const sd of [-1, 1]) {
    seat(V, sd * 0.36, 0.20, 0.54, SEAT, 0.50, 0.55);
    V.rbox(0.56, 0.24, 0.14, 0.03, LACE, [sd * 0.36, 1.04, -0.12], [-0.18, 0, 0], 1);
    V.rbox(0.32, 0.17, 0.12, 0.03, LACE, [sd * 0.36, 1.24, -0.17], [-0.18, 0, 0], 1);
  }
  V.rbox(1.3, 0.12, 0.48, 0.04, SEAT, [0, 0.56, -0.95], null, 1);
  V.rbox(1.3, 0.55, 0.13, 0.04, SEAT, [0, 0.88, -1.22], [-0.2, 0, 0], 1);
  V.rbox(1.32, 0.22, 0.15, 0.03, LACE, [0, 1.06, -1.26], [-0.2, 0, 0], 1);
  V.rbox(1.50, 0.14, 0.34, 0.04, '#57545f', [0, 0.90, 0.86], null, 1);
  V.box(0.16, 0.07, 0.10, DARK, [0.06, 1.0, 0.70]);                                      // taximeter
  V.torus(0.18, 0.018, DARK, [-0.38, 1.02, 0.55], [-0.55, 0, 0], 5, 18);
  const g = finish(ctx, V, D, G, [[E, M.lit]], 'taxi', M);
  g.userData.dims = { W: s.W, zF: 2.36, zR: -2.52, H: 1.65, wb: s.wb };
  return g;
}

// ============================================================================ compact hatchback at the crossing (driver, brake lamps lit)
export function makeCompact(ctx, o = {}) {
  const A = getAtlas(ctx), M = getMats(ctx);
  const s = { W: 1.695, wb: 2.53, R: 0.30, tw: 0.185, track: 1.45, yb: 0.21, Ra: 0.355, sill: 0.40, bev: 0.085, inset: true, cap: 'capCompact', capK: 0.7 };
  const BODY = o.color ?? '#8fb0d2';
  const V = new VB(), D = new VB(), G = new VB(), E = new VB();
  const top = [[2.03, 0.23], [2.065, 0.30], [2.08, 0.40], [2.075, 0.52], [2.05, 0.61], [2.0, 0.69], [1.92, 0.755], [1.78, 0.815], [1.58, 0.865], [1.42, 0.898], [1.32, 0.915], [-1.70, 1.00], [-1.80, 0.99], [-1.89, 0.93], [-1.925, 0.80], [-1.925, 0.35], [-1.89, 0.23]];
  V.add(extrudeSide(profile(top, s), s.W, s.bev, { zF0: 1.25, zF1: 2.11, kF: 0.17, zR0: -1.40, zR1: -1.96, kR: 0.08, yS: 0.80, yT: 1.02, kS: 0.06 }, true), BODY, null, bodyTint(s, '#a39c94', 0.3));
  wheels(V, D, A, s);
  const gx = 0.73, hw = s.W / 2;
  for (const sd of [-1, 1]) {
    V.bar([sd * gx, 0.92, 1.32], [sd * gx, 1.455, 0.22], 0.05, 0.05, BODY);
    V.box(0.045, 0.52, 0.07, DARK, [sd * (gx + 0.003), 1.19, -0.25]);
    V.bar([sd * gx, 1.44, -1.36], [sd * gx, 1.0, -1.74], 0.05, 0.16, BODY);
    G.add(poly([[1.32, 0.93], [0.22, 1.455], [-1.45, 1.44], [-1.74, 1.005]]), '#fff', mtx([sd * (gx + 0.001), 0, 0], [0, -Math.PI / 2, 0]));
    doorMirror(V, 0.735, 0.97, 1.12, sd, BODY);
  }
  V.rbox(1.46, 0.07, 1.98, 0.035, BODY, [0, 1.49, -0.75], null, 2);
  G.add(quad([-0.70, 0.925, 1.32], [0.70, 0.925, 1.32], [0.70, 1.455, 0.22], [-0.70, 1.455, 0.22]), '#fff');
  G.add(quad([0.62, 1.01, -1.862], [-0.62, 1.01, -1.862], [-0.62, 1.45, -1.70], [0.62, 1.45, -1.70]), '#fff');
  wipers(V, [[[-0.62, 0.94, 1.31], [-0.06, 0.975, 1.255]], [[0.06, 0.94, 1.31], [0.60, 0.975, 1.255]]]);
  // front
  for (const sd of [-1, 1]) {
    V.rbox(0.34, 0.10, 0.20, 0.035, LAMP, [sd * 0.52, 0.70, 1.99], [-0.62, sd * 0.42, 0], 1);
    V.rbox(0.06, 0.03, 0.03, 0.01, AMBER, [sd * 0.64, 0.64, 2.035], [0, sd * 0.5, 0], 1);
  }
  V.rbox(0.40, 0.05, 0.02, 0.008, DARK, [0, 0.62, 2.058], [-0.35, 0, 0], 1);
  D.add(PLANE(), '#ffffff', mtx([0, 0.625, 2.071], [-0.35, 0, 0], [0.05, 0.05, 1]), null, A.uvInto(AR.sakuraMark));
  V.rbox(1.5, 0.15, 0.10, 0.05, BODY, [0, 0.40, 2.06], null, 1);
  V.rbox(0.8, 0.06, 0.02, 0.01, DARK, [0, 0.33, 2.11], null, 1);
  plate(V, D, A, AR.plCar, 0, 0.44, 2.117, 0);
  // rear with lit brake lamps
  for (const sd of [-1, 1]) {
    V.rbox(0.24, 0.14, 0.05, 0.02, '#b8474a', [sd * 0.60, 0.92, -1.925], null, 1);
    E.rbox(0.20, 0.10, 0.02, 0.008, '#ffffff', [sd * 0.60, 0.925, -1.952], null, 1);
  }
  E.box(0.30, 0.03, 0.02, '#ffffff', [0, 1.435, -1.712]);
  plate(V, D, A, AR.plCar, 0, 0.62, -1.932, Math.PI);
  V.box(0.12, 0.03, 0.02, CHROME, [0, 0.79, -1.93]);
  // doors
  doorLine(V, s.W, 1.18, 0.68, 0.88); doorLine(V, s.W, -0.24, 0.24, 0.88); doorLine(V, s.W, -1.30, 0.68, 0.88);
  for (const sd of [-1, 1]) for (const z of [-0.12, -1.18]) V.box(0.014, 0.03, 0.10, BODY, [sd * (hw + 0.006), 0.86, z]);
  // interior + driver silhouette (right-hand drive => -X)
  for (const sd of [-1, 1]) seat(V, sd * 0.37, 0.05, 0.50, '#5f5c69', 0.46, 0.56);
  V.rbox(1.2, 0.12, 0.46, 0.04, '#5f5c69', [0, 0.53, -0.95], null, 1);
  V.rbox(1.2, 0.5, 0.12, 0.04, '#5f5c69', [0, 0.82, -1.2], [-0.15, 0, 0], 1);
  V.rbox(1.50, 0.14, 0.40, 0.04, '#4f4c58', [0, 0.93, 0.92], null, 1);
  const JK = '#58627f', SKIN = '#f1d6c3', HAIR = '#4a3c48';
  V.rbox(0.36, 0.46, 0.22, 0.08, JK, [-0.37, 0.98, -0.03], [-0.12, 0, 0], 1);
  V.sph(0.105, SKIN, [-0.37, 1.30, 0.02], 10);
  V.sph(0.113, HAIR, [-0.37, 1.325, -0.008], 10, [1, 0.94, 1.02]);
  for (const sd of [-1, 1]) {
    V.rod([-0.37 + sd * 0.15, 1.14, 0.0], [-0.37 + sd * 0.13, 1.02, 0.26], 0.045, JK, 6);
    V.rod([-0.37 + sd * 0.13, 1.02, 0.26], [-0.37 + sd * 0.14, 1.08, 0.43], 0.04, JK, 6);
    V.sph(0.035, SKIN, [-0.37 + sd * 0.14, 1.09, 0.46], 6);
  }
  V.torus(0.18, 0.018, DARK, [-0.37, 1.06, 0.46], [-0.5, 0, 0], 5, 18);
  V.box(0.22, 0.06, 0.03, DARK, [0, 1.38, 0.30]);                                          // rear-view mirror
  V.rod([0, 1.35, 0.30], [0, 1.29, 0.30], 0.002, '#e5d9b8', 3); V.sph(0.022, '#f2b5c8', [0, 1.27, 0.30], 6);   // charm
  const g = finish(ctx, V, D, G, [[E, M.brake]], 'compact', M);
  g.userData.dims = { W: s.W, zF: 2.12, zR: -1.98, H: 1.55, wb: s.wb };
  return g;
}
