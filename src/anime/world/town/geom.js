// [sys:12] Pure polyline helpers (no three.js), shared by common.js and streetlogic.js.
/** Resample a polyline every `step` metres: [{x, z, tx, tz, s}] (unit tangent, arclength). */
export function resample(pts, step) {
  const out = []; let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, tx, tz, s: s + len * k / n });
    s += len;
  }
  if (pts.length > 1) {
    const [ax, az] = pts[pts.length - 2], [bx, bz] = pts[pts.length - 1]; const len = Math.hypot(bx - ax, bz - az) || 1;
    out.push({ x: bx, z: bz, tx: (bx - ax) / len, tz: (bz - az) / len, s });
  }
  // smooth tangents at joints
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i + 1]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1;
    out[i].tx = tx / l; out[i].tz = tz / l;
  }
  return out;
}

export function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
