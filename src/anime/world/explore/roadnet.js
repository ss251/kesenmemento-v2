// [v4:explore] The drivable road network: every GSI road centre-line of the city (the layout's roads, with the far
// part of the core at full precision and its alleys from explore.json) as segments in a spatial hash, with the road's
// real carriageway width. Pure functions, no three.js: tested in test/v4-explore.test.js.
//
//   const net = makeRoadNet(roads)
//   net.nearest(x, z, maxD)     -> { road, d, t, x, z, dx, dz, seg } (closest centre-line point and unit direction)
//   net.clampToRoad(x, z, margin)  -> { x, z, off } the point pulled back inside the nearest carriageway (margin m in)
//   net.onRoad(x, z, margin)    true inside some carriageway (half width - margin)
//   net.spawn(x, z, yaw)        a start pose on the left lane of the nearest road, facing along it (Japan drives left)
//   net.ahead(x, z, yaw, dist)  the road direction to follow `dist` m ahead (lane keeping)
const CELL = 24;

export function makeRoadNet(roads) {
  const grid = new Map(), segs = [];
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const r of roads) {
    if (!r?.pts || r.pts.length < 2 || r.tunnel) continue;
    for (let k = 1; k < r.pts.length; k++) {
      const a = r.pts[k - 1], b = r.pts[k];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
      const s = { r, a, b, len, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len, hw: Math.max(1.1, (r.width || 4) / 2) };
      segs.push(s);
      const pad = s.hw + 2;
      const x0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
      const z0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL), z1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k2 = key(i, j); let l = grid.get(k2); if (!l) grid.set(k2, (l = [])); l.push(s); }
    }
  }
  function near(x, z, r, fn) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = grid.get(key(i, j)); if (l) for (const s of l) fn(s); }
  }
  function proj(s, x, z) {
    const t = Math.max(0, Math.min(s.len, (x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz));
    const px = s.a[0] + s.dx * t, pz = s.a[1] + s.dz * t;
    return { t, px, pz, d: Math.hypot(x - px, z - pz) };
  }
  function nearest(x, z, maxD = 60) {
    let best = null;
    const seen = new Set();
    near(x, z, Math.min(maxD, CELL), (s) => {
      if (seen.has(s)) return; seen.add(s);
      const p = proj(s, x, z);
      if (p.d <= maxD && (!best || p.d - s.hw < best.d - best.seg.hw)) best = { road: s.r, seg: s, d: p.d, t: p.t, x: p.px, z: p.pz, dx: s.dx, dz: s.dz };
    });
    if (!best && maxD > CELL) {   // wider search, rarely needed (spawning far from a road)
      for (const s of segs) { const p = proj(s, x, z); if (p.d <= maxD && (!best || p.d < best.d)) best = { road: s.r, seg: s, d: p.d, t: p.t, x: p.px, z: p.pz, dx: s.dx, dz: s.dz }; }
    }
    return best;
  }
  /** Inside some carriageway, `margin` m in from its edge? */
  function onRoad(x, z, margin = 0) {
    let ok = false;
    near(x, z, 0, (s) => { if (!ok) { const p = proj(s, x, z); if (p.d <= s.hw - margin) ok = true; } });
    return ok;
  }
  /** The point pulled back inside the nearest carriageway (the car slides along the kerb instead of leaving the road). */
  function clampToRoad(x, z, margin = 0.6) {
    if (onRoad(x, z, margin)) return { x, z, off: 0 };
    let best = null;
    near(x, z, 6, (s) => { const p = proj(s, x, z); const lim = Math.max(0.05, s.hw - margin); const over = p.d - lim; if (!best || over < best.over) best = { s, p, lim, over }; });
    if (!best) return { x, z, off: Infinity };
    const { p, lim } = best, k = p.d > 1e-6 ? lim / p.d : 0;
    return { x: p.px + (x - p.px) * k, z: p.pz + (z - p.pz) * k, off: best.over };
  }
  /** A start pose on the left lane of the nearest road, facing along the road (the direction closest to `yaw`). */
  function spawn(x, z, yaw = 0) {
    const n = nearest(x, z, 400); if (!n) return null;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const sgn = n.dx * fx + n.dz * fz >= 0 ? 1 : -1;
    const dx = n.dx * sgn, dz = n.dz * sgn;
    // left lane: offset to the left of the driving direction by a quarter of the width (single-lane alleys: centre)
    const lx = dz, lz = -dx;   // left of (dx, dz) in this frame (+X east, -Z north): rotate by +90 deg about Y
    const off = n.seg.hw > 2.2 ? n.seg.hw * 0.45 : 0;
    return { x: n.x + lx * off, z: n.z + lz * off, yaw: Math.atan2(-dx, -dz), road: n.road };
  }
  /** Direction of the road `dist` m ahead of (x, z) along heading yaw (the continuation that bends least). */
  function ahead(x, z, yaw, dist = 8) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const px = x + fx * dist, pz = z + fz * dist;
    let best = null;
    near(px, pz, 8, (s) => {
      const p = proj(s, px, pz); if (p.d > s.hw + 3) return;
      const al = s.dx * fx + s.dz * fz, sc = Math.abs(al) - p.d * 0.05;
      if (!best || sc > best.sc) best = { sc, dx: s.dx * Math.sign(al || 1), dz: s.dz * Math.sign(al || 1), seg: s, x: p.px, z: p.pz };
    });
    return best;
  }
  /** [v4:integrate] every segment within r m of (x, z), once each ({ r: road, a, b, len, dx, dz, hw }) */
  function segmentsNear(x, z, r) {
    const out = new Set();
    near(x, z, r, (s) => { if (!out.has(s) && proj(s, x, z).d <= r) out.add(s); });
    return [...out];
  }
  return { nearest, onRoad, clampToRoad, spawn, ahead, segmentsNear, segments: segs.length };
}
