// Best-lap ghost. Recorded at 10 Hz, played back by linear interpolation. The tape is a flat
// Float32Array of x, z, y, yaw so a frame never allocates.

export const GHOST_HZ = 10;
const STRIDE = 4;

export function createLapTape(capacity = 6000) {
  const buf = new Float32Array(capacity * STRIDE);
  let n = 0, acc = 0;
  return {
    buf,
    get count() { return n; },
    reset() { n = 0; acc = 0; },
    /** Record the pose if a 10 Hz boundary has passed. At most three samples per call (a hitch). */
    push(dt, x, z, y, yaw) {
      acc += dt;
      const step = 1 / GHOST_HZ;
      let k = 0;
      while (acc >= step && k < 3 && n < capacity) {
        acc -= step;
        const i = n * STRIDE;
        buf[i] = x; buf[i + 1] = z; buf[i + 2] = y; buf[i + 3] = yaw;
        n += 1;
        k += 1;
      }
    },
    /** A compact copy for the device store. Centimetres and milliradians. Called once a lap, not per frame. */
    pack() {
      const out = new Array(n * STRIDE);
      for (let i = 0; i < n * STRIDE; i++) out[i] = Math.round(buf[i] * 100) / 100;
      return out;
    },
  };
}

export function unpackTape(arr) {
  const buf = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) buf[i] = arr[i];
  return buf;
}

const pose = { x: 0, z: 0, y: 0, yaw: 0 };

/**
 * Centre-line distance for each ghost sample, written into `into` (length `count`).
 * `project` is progress.project. Called when a tape is loaded, not per frame.
 */
export function ghostLine(buf, count, project, course, into) {
  const tmp = { i: 0, dist: 0, s: 0 };
  const n = count | 0;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    project(course, buf[o], buf[o + 1], tmp);
    into[i] = tmp.s;
  }
  return into;
}

/** Milliseconds at which a monotonic distance tape reaches `s`. */
export function ghostMsAt(line, count, s) {
  const n = count | 0;
  if (n < 1) return 0;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (line[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return (lo / GHOST_HZ) * 1000;
}

/** Write the ghost pose at `t` seconds into `out` ({x,z,y,yaw}). Returns false when the tape is empty. */
export function ghostPose(buf, count, t, out = pose) {
  if (!count) return false;
  const step = 1 / GHOST_HZ;
  const maxT = (count - 1) * step;
  const u = t < 0 ? 0 : t > maxT ? maxT : t;
  const f = u / step;
  let i = f | 0;
  if (i >= count - 1) i = count - 1;
  const j = i + 1 < count ? i + 1 : i;
  const a = j === i ? 0 : f - i;
  const ia = i * STRIDE, ib = j * STRIDE;
  out.x = buf[ia] + (buf[ib] - buf[ia]) * a;
  out.z = buf[ia + 1] + (buf[ib + 1] - buf[ia + 1]) * a;
  out.y = buf[ia + 2] + (buf[ib + 2] - buf[ia + 2]) * a;
  const dy = Math.atan2(Math.sin(buf[ib + 3] - buf[ia + 3]), Math.cos(buf[ib + 3] - buf[ia + 3]));
  out.yaw = buf[ia + 3] + dy * a;
  return true;
}
