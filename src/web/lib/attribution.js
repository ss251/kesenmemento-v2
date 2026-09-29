// Map mesh.bin vertices back to their city.json footprint (the binary carries no building id).
// Per triangle: roof triangles test their centroid, wall triangles test a point 0.4 m inside the wall
// (both sides are tried, so winding does not matter). A uniform grid of feature bboxes keeps it ~O(n).
export function pointInPoly(poly, x, z) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}

export function buildFeatureGrid(features, cell = 60) {
  const grid = new Map();
  features.forEach((f, i) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of f.poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++)
      for (let gz = Math.floor(z0 / cell); gz <= Math.floor(z1 / cell); gz++) {
        const k = gx * 100003 + gz; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
      }
  });
  const find = (x, z) => {
    const a = grid.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (a) for (const i of a) if (pointInPoly(features[i].poly, x, z)) return i;
    return -1;
  };
  return { find };
}

/** -> Int32Array(vertCount) of feature indices (-1 = unmatched). */
export function attributeVertices(mesh, features) {
  const { pos, idx, vertCount } = mesh, out = new Int32Array(vertCount).fill(-1);
  const { find } = buildFeatureGrid(features);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
    let f = -1;
    if (Math.abs(ny / nl) > 0.5) f = find(cx, cz);
    else {
      const hl = Math.hypot(nx, nz) || 1, hx = nx / hl, hz = nz / hl;
      f = find(cx - hx * 0.4, cz - hz * 0.4); if (f < 0) f = find(cx + hx * 0.4, cz + hz * 0.4);
    }
    if (f >= 0) out[idx[t]] = out[idx[t + 1]] = out[idx[t + 2]] = f;
  }
  return out;
}
