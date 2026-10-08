// Lap progress on a closed centre-line. Pure. A lap counts when the car comes back across the start
// after having been on the far half of the loop, and it is still beside the line (no shortcut across the bay).

const proj = { i: 0, dist: 0, s: 0 };

/** Nearest centre-line sample. Writes into `out` (reused by default: do not keep it). */
export function project(course, x, z, out = proj) {
  let best = 0, bestD = 1e18;
  const n = course.n;
  for (let i = 0; i < n; i++) {
    const dx = course.x[i] - x, dz = course.z[i] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  out.i = best;
  out.dist = Math.sqrt(bestD);
  out.s = course.s[best];
  return out;
}

export function medalFor(ms, medals) {
  if (!(ms > 0) || !medals) return null;
  if (ms <= medals.gold) return 'gold';
  if (ms <= medals.silver) return 'silver';
  if (ms <= medals.bronze) return 'bronze';
  return null;
}

export function createRaceRun() {
  return { phase: 'idle', done: 0, s: 0, ms: 0, armed: false, off: 0, lapStart: 0, seenFar: false };
}

const OFF = 26;
const tickOut = { event: null, split: null, lap: 1, s: 0, dist: 0 };

/** Advance a running race. Writes into `out` (reused by default: do not keep it). */
export function raceTick(run, course, x, z, dt, out = tickOut) {
  out.split = null;
  out.dist = 0;
  if (run.phase !== 'run') {
    out.event = null; out.lap = run.done + 1; out.s = run.s;
    return out;
  }
  run.ms += dt * 1000;
  const p = project(course, x, z);
  out.dist = p.dist;
  if (p.dist > OFF) {
    run.off += dt;
    out.event = 'off'; out.lap = run.done + 1; out.s = run.s;
    return out;
  }
  run.off = 0;
  if (p.s > course.lengthM * 0.72) run.seenFar = true;
  const prev = run.s;
  let event = null;
  // Faster than 40 m/s is beyond the race car, so a shorter gap is a teleport or a start-line flicker.
  const minLap = course.lengthM / 40 * 1000;
  const wrapped = run.armed && run.seenFar && prev > course.lengthM * 0.62 && p.s < course.lengthM * 0.28 && run.ms - run.lapStart > minLap;
  if (wrapped) {
    run.done += 1;
    run.lapStart = run.ms;
    run.seenFar = false;
    event = run.done >= course.laps ? 'finish' : 'lap';
  }
  run.armed = true;
  if (!wrapped) {
    for (let g = 0; g < course.gates.length; g++) {
      const gate = course.gates[g];
      if (gate <= 0) continue;
      if (prev < gate && p.s >= gate && p.s - prev < 500) out.split = gate;
    }
  }
  run.s = p.s;
  out.event = event;
  out.lap = Math.min(course.laps, run.done + 1);
  out.s = p.s;
  return out;
}
