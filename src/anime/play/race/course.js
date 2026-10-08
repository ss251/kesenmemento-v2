// The night circuit, measured on the GSI centre-lines. See data/play/race-minato.json.
import DATA from '../../../../data/play/race-minato.json';

let cached = null;

export function minatoCourse() {
  if (cached) return cached;
  const n = DATA.samples.length;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = DATA.samples[i][0];
    z[i] = DATA.samples[i][1];
    s[i] = DATA.samples[i][2];
  }
  cached = {
    id: DATA.id,
    ja: DATA.ja,
    en: DATA.en,
    laps: DATA.laps,
    lengthM: DATA.lengthM,
    start: DATA.start,
    startYaw: DATA.startYaw,
    medals: DATA.medals,
    gates: DATA.gates,
    cones: DATA.cones || [],
    bars: DATA.bars || [],
    x, z, s, n,
  };
  return cached;
}

/** Pose of the sample at or just before `dist` metres. Used for the start banner. */
export function poseAt(course, dist) {
  let i = 0;
  const n = course.n;
  for (; i < n - 1; i++) if (course.s[i + 1] >= dist) break;
  const b = Math.min(n - 1, i + 1);
  const dx = course.x[b] - course.x[i];
  const dz = course.z[b] - course.z[i];
  return { x: course.x[i], z: course.z[i], yaw: Math.atan2(-dx, -dz) };
}
