// [v3:foundation] Raster helpers for the anime layout: grids, polygon fill, exact Euclidean distance transform.
export class Grid {
  /** Cell centres at x0 + (i + 0.5) * d, z0 + (j + 0.5) * d. */
  constructor(name, x0, z0, d, w, h) { Object.assign(this, { name, x0, z0, d, w, h }); }
  static cover(name, x0, z0, x1, z1, d) { return new Grid(name, x0, z0, d, Math.ceil((x1 - x0) / d), Math.ceil((z1 - z0) / d)); }
  meta() { return { name: this.name, x0: this.x0, z0: this.z0, d: this.d, w: this.w, h: this.h }; }
  cx(i) { return this.x0 + (i + 0.5) * this.d; }
  cz(j) { return this.z0 + (j + 0.5) * this.d; }
}

/** Even-odd scanline fill of rings (each [[x,z],...]) into a Uint8Array mask with value v. */
export function fillRings(grid, mask, rings, v = 1) {
  const edges = [];
  let zmin = Infinity, zmax = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    if (a[1] === b[1]) continue;
    edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1]] : [b[0], b[1], a[0], a[1]]);
    zmin = Math.min(zmin, a[1], b[1]); zmax = Math.max(zmax, a[1], b[1]);
  }
  if (!edges.length) return;
  const j0 = Math.max(0, Math.floor((zmin - grid.z0) / grid.d - 0.5)), j1 = Math.min(grid.h - 1, Math.ceil((zmax - grid.z0) / grid.d - 0.5));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = grid.cz(j); xs.length = 0;
    for (const e of edges) if (z >= e[1] && z < e[3]) xs.push(e[0] + (z - e[1]) / (e[3] - e[1]) * (e[2] - e[0]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - grid.x0) / grid.d - 0.5)), i1 = Math.min(grid.w - 1, Math.floor((xs[k + 1] - grid.x0) / grid.d - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * grid.w + i] = v;
    }
  }
}

/** 1-D squared EDT (Felzenszwalb & Huttenlocher). f: input costs (0 or INF), returns squared distances. */
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
/** Distance (in cells) from every cell to the nearest cell where on(i) is true. */
export function edt(w, h, on) {
  const INF = 1e20, n = Math.max(w, h);
  const out = new Float32Array(w * h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) out[i] = on(i) ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = out[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]); }
  return out;
}

/** Bilinear sample of a Float32/Int16 grid (cell-centred) with scale; clamps at the border. */
export function bilinear(grid, arr, x, z, scale = 1) {
  let fx = (x - grid.x0) / grid.d - 0.5, fz = (z - grid.z0) / grid.d - 0.5;
  fx = Math.max(0, Math.min(grid.w - 1.001, fx)); fz = Math.max(0, Math.min(grid.h - 1.001, fz));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, w = grid.w;
  const a = arr[j * w + i], b = arr[j * w + i + 1], c = arr[(j + 1) * w + i], e = arr[(j + 1) * w + i + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz) * scale;
}
export function inGrid(grid, x, z, margin = 0) {
  return x >= grid.x0 + margin && z >= grid.z0 + margin && x <= grid.x0 + grid.w * grid.d - margin && z <= grid.z0 + grid.h * grid.d - margin;
}
