// [smooth] The fixed-step clock (Glenn Fiedler, "Fix Your Timestep"): the screen produces time, the simulation consumes it in fixed steps,
// and what is left over is the blend between the last two simulation states. Pure: test/smooth-timestep.test.js.
//
//   const clock = createClock({ step: 1 / 60 })
//   const { steps, alpha } = clock.advance(frameSeconds)   run `steps` simulation steps of clock.step seconds, then draw at `alpha`
//   clock.time        simulated seconds (whole steps)
//   clock.renderTime  the instant the frame shows: one step behind, blended (time - step + alpha * step)
//
// - Snapping: a frame within 0.5 ms of a whole number of 120 Hz vsyncs counts as exactly that (timestamps jitter by a fraction of a
//   millisecond; unsnapped, a 60 Hz screen with a 60 Hz simulation would now and then run two steps in one frame and none in the next).
// - The spiral of death: a frame never runs more than `maxSteps` steps (a 100 ms frame at 60 Hz); time beyond that is dropped, so a
//   stalled frame slows the world down for a moment instead of making the next frame longer still. The leftover fraction is kept.
// - A frame of more than `maxFrame` seconds (a background tab, a debugger) counts as `maxFrame`.

export const STEP = 1 / 60;
const VSYNC = 1 / 120;

/** A frame's seconds, snapped to a whole number of 120 Hz vsyncs when within `tol` seconds of one. */
export function snapFrame(dt, tol = 0.0005) {
  if (!(dt > 0)) return 0;
  const n = Math.round(dt / VSYNC);
  return n >= 1 && Math.abs(dt - n * VSYNC) <= tol ? n * VSYNC : dt;
}

export function createClock({ step = STEP, maxSteps = 6, maxFrame = 0.25, snap = true } = {}) {
  let acc = 0, total = 0, alpha = 1, dropped = 0;
  return {
    step,
    advance(frameDt) {
      let dt = Math.min(maxFrame, frameDt > 0 ? frameDt : 0);
      if (snap) dt = snapFrame(dt);
      acc += dt;
      let steps = Math.floor((acc + 1e-9) / step);
      if (steps > maxSteps) { dropped += (steps - maxSteps) * step; acc -= (steps - maxSteps) * step; steps = maxSteps; }
      acc = Math.max(0, acc - steps * step);
      total += steps;
      alpha = Math.min(1, acc / step);
      return { steps, alpha };
    },
    /** Start over (a teleport, a mode change that wants no blend): the next frame draws the newest state. */
    reset() { acc = 0; alpha = 1; },
    get alpha() { return alpha; },
    get time() { return total * step; },
    get renderTime() { return (total - 1 + alpha) * step; },
    get dropped() { return dropped; },
  };
}

/**
 * [smooth] Frame pacing: a steady rate on any screen (CRAFT.md section 4: a steady 60). requestAnimationFrame calls back once per vsync;
 * the pacer measures the vsync (the 10th percentile of the last 60 callback gaps) and draws every k-th one, k = the whole number of vsyncs
 * in 1/fps (at least 1): 120 Hz and 144 Hz screens (Chrome on a ProMotion second machine) draw every other vsync, an even 16.7 ms (13.9 ms)
 * instead of a mix of one and two vsyncs; 60, 75 and 90 Hz screens draw every vsync. fps = 0: every vsync.
 *   const pacer = createPacer({ fps: 60 });  pacer.tick(rafTimestampMs) -> draw this callback?
 */
export function createPacer({ fps = 60, window = 60 } = {}) {
  const gaps = new Float64Array(window);
  let n = 0, last = null, lastDrawn = -1e9, k = 1, vsync = 0;
  const sorted = new Float64Array(window);
  function measure() {
    const m = Math.min(n, window);
    for (let i = 0; i < m; i++) sorted[i] = gaps[i];
    const s = sorted.subarray(0, m).sort();
    vsync = s[Math.floor(m * 0.1)];
    k = fps > 0 && vsync > 2 ? Math.max(1, Math.floor(1000 / fps / vsync + 0.1)) : 1;
  }
  return {
    tick(now) {
      if (last !== null) { const g = now - last; if (g > 0 && g < 100) { gaps[n % window] = g; n++; if (n % window === 0 || n === 20) measure(); } }
      last = now;
      if (k <= 1) { lastDrawn = now; return true; }
      // draw when k vsyncs have passed since the last drawn frame (half a vsync of slack for timestamp jitter)
      if (now - lastDrawn >= (k - 0.5) * vsync) { lastDrawn = now; return true; }
      return false;
    },
    get every() { return k; },
    get vsync() { return vsync; },
  };
}

/** Frame-rate independent smoothing: the share of the remaining distance covered in dt seconds at `rate` per second (1 - e^(-rate dt)). */
export const damp = (rate, dt) => (dt > 0 ? 1 - Math.exp(-rate * dt) : 0);
export const lerp = (a, b, k) => a + (b - a) * k;
/** The shorter way round from angle a to angle b (radians), k of the way. */
export function lerpAngle(a, b, k) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * k; }
