// 120 ms interpolation buffer. Snapshots are server milliseconds.
// The render instant is "now minus 120". No allocation on sample: `out` is the caller's.

import { lerpAngle } from '../../core/timestep.js';

export const BUFFER_MS = 120;
export const SNAP_CAP = 8;

export function createBuffer() {
  const snaps = new Array(SNAP_CAP);
  for (let i = 0; i < SNAP_CAP; i++) snaps[i] = { t: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, look: 0, mode: 'avatar', vehicle: 0 };
  return { snaps, n: 0, w: 0 };
}

function newest(buf) {
  return buf.snaps[(buf.w + SNAP_CAP - 1) % SNAP_CAP];
}

export function pushSnap(buf, t, pose) {
  if (!(t >= 0) || !pose) return false;
  if (buf.n && t <= newest(buf).t) return false;
  const s = buf.snaps[buf.w];
  s.t = t;
  s.x = pose.x; s.y = pose.y; s.z = pose.z;
  s.yaw = pose.yaw; s.pitch = pose.pitch; s.look = pose.look;
  s.mode = pose.mode; s.vehicle = pose.vehicle;
  buf.w = (buf.w + 1) % SNAP_CAP;
  if (buf.n < SNAP_CAP) buf.n++;
  return true;
}

function copy(s, out) {
  out.x = s.x; out.y = s.y; out.z = s.z;
  out.yaw = s.yaw; out.pitch = s.pitch; out.look = s.look;
  out.mode = s.mode; out.vehicle = s.vehicle;
}

/** Write the pose at `serverNow - 120ms` into `out`. Holds the ends; does not extrapolate. */
export function sample(buf, serverNow, out) {
  if (!buf.n) return false;
  const target = serverNow - BUFFER_MS;
  const oldestI = (buf.w - buf.n + SNAP_CAP) % SNAP_CAP;
  let prev = null;
  let next = null;
  for (let k = 0; k < buf.n; k++) {
    const s = buf.snaps[(oldestI + k) % SNAP_CAP];
    if (s.t <= target) prev = s;
    else { next = s; break; }
  }
  if (!prev) { copy(buf.snaps[oldestI], out); return true; }
  if (!next) { copy(prev, out); return true; }
  const span = next.t - prev.t;
  const k = span > 0 ? (target - prev.t) / span : 1;
  out.x = prev.x + (next.x - prev.x) * k;
  out.y = prev.y + (next.y - prev.y) * k;
  out.z = prev.z + (next.z - prev.z) * k;
  out.yaw = lerpAngle(prev.yaw, next.yaw, k);
  out.pitch = prev.pitch + (next.pitch - prev.pitch) * k;
  out.look = prev.look + (next.look - prev.look) * k;
  out.mode = prev.mode;
  out.vehicle = prev.vehicle;
  return true;
}
