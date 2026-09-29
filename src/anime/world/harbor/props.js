// [v3:harbor] Small harbour props: bollards, fenders, ladders, cleats, buoys, floats, nets, fish boxes, tubs,
// lifebuoy stands, tyre fenders. All take a kit (ctx.kit(parent)) and parent-local positions; y is the surface
// the prop stands on. Built from shared unit geometries so static batching merges them into a few draw calls.
import * as THREE from 'three';

export const HC = {
  concrete: '#bdbab0', concreteLight: '#cfccc2', concreteDark: '#9a988f', wet: '#6f7470', algae: '#6f8a5c',
  bollard: '#474a55', bollardCap: '#e3c34a', rubber: '#3d3e47', steel: '#8f979e', rust: '#946650',
  yellow: '#e9c24a', black: '#3b3a44', rope: '#c9b48a', white: '#e8e8e2',
  boxBlue: '#3f78b9', boxWhite: '#e7ebe8', boxOrange: '#e8833f', boxGreen: '#4e9a78', boxRed: '#c9463c', tubBlue: '#2f66a8',
  float: '#ef7b35', floatYellow: '#f0c73a', net: '#4f6d61', netBlue: '#3f5f8a', wood: '#8a6446', woodLight: '#b48a62',
};

const _g = {};
function G(key, make) { return _g[key] || (_g[key] = make()); }

export function hmats(ctx) {
  if (ctx.__harborMats) return ctx.__harborMats;
  const t = (c, o) => ctx.mat.toon(c, o);
  const M = {};
  for (const [k, v] of Object.entries(HC)) M[k] = t(v, { paint: /concrete|wet|wood/.test(k) ? 0.08 : 0.03 });
  M.foam = t('#eef5f3', { paint: 0 });
  ctx.__harborMats = M;
  return M;
}

/** 係船柱 mooring bollard (mushroom head, 0.55 m). */
export function bollard(k, M, x, y, z, { big = false, capColor = true } = {}) {
  const s = big ? 1.35 : 1;
  k.cyl(0.2 * s, 0.26 * s, 0.1 * s, M.bollard, [x, y + 0.05 * s, z], null, 12);
  k.cyl(0.17 * s, 0.19 * s, 0.4 * s, M.bollard, [x, y + 0.3 * s, z], null, 12);
  k.mesh(G('bhead', () => new THREE.CylinderGeometry(0.3, 0.2, 0.14, 14)), capColor ? M.bollardCap : M.bollard, [x, y + 0.55 * s, z], null, [s, s, s]);
}

/** Rubber fender on a quay face (face plane at local x = xFace, water toward +x). V-shaped D fender, h tall. */
export function fender(k, M, xFace, yTop, z, { h = 1.6, w = 0.9 } = {}) {
  k.box(0.35, h, w, M.rubber, [xFace + 0.17, yTop - h / 2 - 0.15, z]);
  k.box(0.14, h * 0.9, w * 0.55, M.rubber, [xFace + 0.4, yTop - h / 2 - 0.15, z]);
}

/** Old tyre fender hanging on a rope (small-boat quays). */
export function tyreFender(k, M, xFace, yTop, z) {
  k.mesh(G('tyre', () => new THREE.TorusGeometry(0.34, 0.13, 8, 16)), M.black, [xFace + 0.14, yTop - 0.9, z], [0, Math.PI / 2, 0]);
}

/** Steel ladder set into the quay face, from yTop down to yBot. */
export function ladder(k, M, xFace, yTop, yBot, z) {
  const h = yTop - yBot;
  for (const s of [-0.22, 0.22]) k.box(0.06, h + 0.9, 0.06, M.rust, [xFace + 0.12, yBot + (h + 0.9) / 2, z + s]);
  // hand hoops over the edge
  for (const s of [-0.22, 0.22]) k.box(0.06, 0.06, 0.06, M.rust, [xFace - 0.05, yTop + 0.86, z + s]);
  for (let y = yBot + 0.2; y < yTop; y += 0.32) k.box(0.05, 0.05, 0.44, M.rust, [xFace + 0.16, y, z]);
}

/** Small cleat for small boats. */
export function cleat(k, M, x, y, z, rotY = 0) {
  k.box(0.14, 0.12, 0.14, M.bollard, [x, y + 0.06, z]);
  k.box(0.1, 0.07, 0.46, M.bollard, [x, y + 0.14, z], [0, rotY, 0]);
}

/** Orange/yellow fishing float (浮き玉). */
export function float(k, M, x, y, z, r = 0.25, yellow = false) { k.sphere(r, yellow ? M.floatYellow : M.float, [x, y + r * 0.9, z], 10); }

/** A navigation / mooring buoy floating at water level y. kind: 'red'|'green'|'yellow'|'mooring'. */
export function buoy(ctx, k, M, x, y, z, kind = 'mooring') {
  if (kind === 'mooring') { k.sphere(0.6, M.float, [x, y + 0.2, z], 14); k.cyl(0.08, 0.08, 0.4, M.steel, [x, y + 0.85, z], null, 6); return; }
  const col = { red: '#c9463c', green: '#3f8f5b', yellow: '#e9c24a' }[kind] || '#c9463c';
  const m = ctx.mat.toon(col, { paint: 0.04 });
  k.cyl(0.9, 1.1, 0.8, m, [x, y + 0.2, z], null, 14);
  k.cyl(0.35, 0.55, 2.2, m, [x, y + 1.7, z], null, 10);
  k.box(0.9, 0.9, 0.06, m, [x, y + 3.1, z]);
  k.cyl(0.1, 0.1, 0.3, M.black, [x, y + 3.7, z], null, 6);
}

/** Pile of net (網) with floats on top. */
export function netPile(k, M, x, y, z, { w = 3, d = 2.2, h = 0.9, blue = false, rng } = {}) {
  const m = blue ? M.netBlue : M.net;
  k.rbox(w, h, d, 0.4, m, [x, y + h / 2, z]);
  k.rbox(w * 0.7, h * 0.6, d * 0.7, 0.3, m, [x + w * 0.08, y + h * 1.1, z - d * 0.06]);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rng ? rng() : 0);
    float(k, M, x + Math.cos(a) * w * 0.32, y + h * 0.9, z + Math.sin(a) * d * 0.3, 0.16, i % 3 === 0);
  }
}

/** Stack of plastic fish boxes (魚箱). colour: 'blue'|'white'|'orange'|'green'|'red'. 0.64 x 0.42 x 0.25 each. */
export function boxStack(k, M, x, y, z, { n = 5, color = 'blue', rotY = 0, lean = 0 } = {}) {
  const m = { blue: M.boxBlue, white: M.boxWhite, orange: M.boxOrange, green: M.boxGreen, red: M.boxRed }[color] || M.boxBlue;
  for (let i = 0; i < n; i++) k.box(0.64, 0.23, 0.42, m, [x + Math.sin(i * 1.7) * lean, y + 0.12 + i * 0.25, z + Math.cos(i * 2.3) * lean], [0, rotY + Math.sin(i * 3.1) * 0.05, 0]);
  // rim lines read as separate boxes
  for (let i = 1; i <= n; i++) k.box(0.66, 0.025, 0.44, M.white, [x, y + i * 0.25 - 0.01, z], [0, rotY, 0]);
}

/** A block of stacks (pallet area) w x d stacks, heights by rng. */
export function boxYard(k, M, x, y, z, { cols = 4, rows = 3, rotY = 0, rng, colors = ['blue', 'blue', 'white', 'orange'] } = {}) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lx = (i - (cols - 1) / 2) * 0.7, lz = (j - (rows - 1) / 2) * 0.48;
    const n = rng ? rng.int(2, 7) : 4;
    boxStack(k, M, x + lx * c + lz * s, y, z - lx * s + lz * c, { n, color: rng ? rng.pick(colors) : colors[0], rotY, lean: 0.015 });
  }
}

/** Big blue fish tub (ダンベ / 1 t tank). */
export function tub(k, M, x, y, z, rotY = 0) {
  k.rbox(1.3, 0.95, 1.1, 0.1, M.tubBlue, [x, y + 0.48, z], [0, rotY, 0]);
  k.box(1.36, 0.08, 1.16, M.boxWhite, [x, y + 0.96, z], [0, rotY, 0]);
}

/** Lifebuoy on a post (救命浮環). Faces local +z. */
export function lifebuoyStand(ctx, k, M, x, y, z, rotY = 0) {
  const g = k.group([x, y, z], rotY);
  const kk = ctx.kit(g);
  kk.box(0.1, 1.4, 0.1, M.white, [0, 0.7, 0]);
  kk.box(0.7, 0.7, 0.06, M.white, [0, 1.15, 0.05]);
  kk.mesh(G('lbuoy', () => new THREE.TorusGeometry(0.28, 0.08, 8, 18)), ctx.mat.toon('#e8603c', { paint: 0.02 }), [0, 1.15, 0.13]);
}

/** Coil of rope lying on a surface. */
export function ropeCoil(k, M, x, y, z, r = 0.45) {
  k.mesh(G('coil', () => new THREE.TorusGeometry(1, 0.28, 6, 16).rotateX(Math.PI / 2)), M.rope, [x, y + 0.1 * r / 0.45, z], null, [r, r, r]);
}
