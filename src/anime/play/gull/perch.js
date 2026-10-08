// [play] Perches are harbor.perches: [x,y,z] or {x,y,z}. Nearest is a squared scan.

export function readPerch(p, out) {
  if (!p) return false;
  if (Array.isArray(p)) {
    if (p.length < 3) return false;
    out.x = +p[0]; out.y = +p[1]; out.z = +p[2];
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
  }
  out.x = +p.x; out.y = +p.y; out.z = +p.z;
  return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z);
}

/** Writes the nearest perch into `out` ({ x, y, z, d, ok }). `out.tmp` is reused. */
export function nearestPerch(list, x, y, z, out) {
  out.ok = false; out.d = Infinity; out.x = x; out.y = y; out.z = z;
  if (!list || !list.length) return out;
  const tmp = out.tmp || (out.tmp = { x: 0, y: 0, z: 0 });
  let best = 1e18;
  for (let i = 0; i < list.length; i++) {
    if (!readPerch(list[i], tmp)) continue;
    const dx = tmp.x - x, dy = tmp.y - y, dz = tmp.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; out.x = tmp.x; out.y = tmp.y; out.z = tmp.z; out.ok = true; }
  }
  if (out.ok) out.d = Math.sqrt(best);
  return out;
}

export function canPerch(speed, dist, limits) {
  const speedMax = limits && limits.perchSpeed || 7.2;
  const distMax = limits && limits.perchDist || 4.2;
  return speed < speedMax && dist < distMax;
}
