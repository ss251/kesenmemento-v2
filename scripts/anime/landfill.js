// [v6:c8] Reclaimed land the GSI water layer (WA) still draws as sea. GSI's water polygons follow the aerial photo
// (about 2020 to 2022); where a quay or yard has been filled in since, the newest imagery wins (docs/anime/OVERRIDES.md).
// One shared list, read by:
//   scripts/anime/build-grids.js   clears the water class inside each ring BEFORE the shore distance (sdf) is derived,
//                                  and lifts the land there to at least `minH` (T.P. m)
//   scripts/anime/build-layout.js  drops GSI coastline (Cstline) pieces whose midpoint lies inside a ring (padded by `pad` m)
//                                  and draws the new edge `wall` as seawall pieces of 24 m or less, chained in place
// ring: [x, z] ENU metres (x east, z south). wall: the new water edge, a polyline from one kept coastline vertex to another,
// with the water on its west (the chain is oriented by build-layout / harbor/world.js quayChains).

export const LAND_FILL = [
  {
    id: "kosaba-yard",
    ring: [[1100, 30], [1140, 30], [1140, 112], [1087, 112], [1087.4, 104.5], [1089, 100], [1097, 60], [1100, 40]],
    wall: [[1098.3, 42.4], [1097, 60], [1089, 100], [1087.4, 104.5]],
    // 1 m, not 2: the kept seawall piece (1087.4,104.5)-(1084.1,112.5) has its midpoint 1.45 m west of the ring edge,
    // and the beach jog (1084.1,112.5)-(1086.6,113.7) 1.98 m from the corner (1087,112); every notch piece is inside the ring
    pad: 1,
    minH: 1.6,
    src: "earth 2026-03-11 c8/sub-s top (c8s_notch): reclaimed 小鯖 yard behind a continuous seawall (the GSI photo, about 2020 to 2022, still shows the reclamation works and shallow water)",
  },
];

/** Even-odd point in polygon. */
export function inRing(x, z, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < xi + (z - zi) / (zj - zi) * (xj - xi)) ins = !ins;
  }
  return ins;
}

/** Distance from (x, z) to the ring's boundary. */
export function ringDist(x, z, ring) {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

/** Inside the ring, or within `pad` metres of it. */
export const inFill = (x, z, f, pad = 0) => inRing(x, z, f.ring) || (pad > 0 && ringDist(x, z, f.ring) <= pad);
