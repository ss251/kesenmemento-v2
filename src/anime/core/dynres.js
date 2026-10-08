// [smooth] Dynamic resolution: the render scale (a share of the tier's pixel ratio, 0.6 to 1.0) that keeps the GPU inside the frame budget.
// Pure: test/smooth-dynres.test.js. main.js feeds it every drawn frame and resizes the render targets when the scale changes.
//
//   const dr = createDynRes({ budgetMs: 1000 / 60 })
//   if (dr.sample({ gpu, frame, cpu })) applyScale(dr.scale)    gpu: the frame's GPU ms (core/gputimer.js) or null; frame: ms since the last
//                                                               drawn frame; cpu: ms the frame took on the main thread
//
// Every `window` frames (half a second) it decides once, on the 90th percentile (a lone spike, a shader compile or an upload, does not move it):
// - with a GPU timer: over 85 % of the budget while frames are late (5 % of the window), or over 115 % of the budget -> down, straight to
//   the step the pixel count says fits 75 % of the budget (GPU time ~ scale²); a GPU that still makes every vsync keeps its resolution;
//   up one step when, twice in a row, the next step would still fit in 80 % of the budget if all the GPU time grew with the pixels (it does
//   not: the shadow map and the vertices do not, so this is the safe side and a step up does not swing back);
// - without one (Safari): more than 10 % of the frames late (over 1.25 budgets) while the main thread is not the cause (cpu p50 under 60 % of
//   the budget) -> down one step; none late for four windows -> up one step, and if that brings late frames back at once, down again and wait
//   twice as long before the next try.
// After a step down it waits `hold` windows before any step up; each step up that has to be taken back doubles that wait (at most 64 windows, 32 s). The scale
// moves in steps of 0.1 and at most once a window, so it never shimmers.
//
// [mobile-perf] The first frames. The phone used to open "brutal, then suddenly better too late": the load's leftovers (uploads, the first
// programs, the stream's first tiles) made the first windows late, the scale fell to its floor, and every probe back up that met another
// late window doubled the wait (up to half a minute). Now:
// - `start`: the scale to begin at (main.js passes the scale this device held last time, core/dynres.js readHeld / main.js);
// - settle(true) while the title still covers the town (main.js, until the visitor is in): the first `warm` frames are not judged, and a
//   clean window steps up at once (no hold, no back-off), so the scale the device holds is found behind the title; settle(false) at the
//   start keeps that scale and starts the normal controller with a fresh back-off;
// - a frame is only counted late when its rAF callback started on time (`lag`, ms between the vsync's timestamp and the callback) and its
//   own main-thread work was light: a frame held up by the main thread (a long task, the GC, a build slice) says nothing about the GPU.

export function createDynRes({ min = 0.6, max = 1.0, step = 0.1, budgetMs = 1000 / 60, window = 30, hi = 0.85, upFit = 0.8, fit = 0.75, upAfter = 2, hold = 3, maxWait = 64, start = null, warm = 20,
  softMin = null, slowMs = 38, okMs = 33, span = 2000, helpK = 0.97, stuckMs = 60000 } = {}) {   // [mobile-perf] the adaptive floor: see below
  const q = (s) => Math.round(Math.min(max, Math.max(min, s)) / step) * step;
  const qDown = (s) => Math.max(min, Math.floor(Math.min(max, s) / step + 1e-6) * step);   // a step down never rounds up
  let scale = +q(Number.isFinite(start) && start > 0 ? start : max).toFixed(2), changed = 0, last = null;
  const gpu = new Float64Array(window), frm = new Float64Array(window), cpu = new Float64Array(window), lg = new Float64Array(window);
  let n = 0, nGpu = 0, holdLeft = 0, wait = hold, lowRun = 0, cleanRun = 0, probe = 0, settling = false, skip = 0, ceil = max;
  // [mobile-perf] The adaptive floor (softMin, a phone): the 60 Hz controller below never takes the scale under softMin. Under it only a sustained
  // slow stretch does: the median frame over the last `span` ms (the GPU timer's figures where it has them, else the frames' pacing) past
  // slowMs takes it one step down toward min, and at or under okMs one step back up toward softMin; between the two it holds. Each move waits
  // for a whole new span. So a phone holds 1.5x down to 30 fps, and an older one settles at the second floor rather than at 20 fps.
  // A slow step that did not help (the next window's median not under helpK of the one before it: the frames were the main thread's, not
  // the GPU's, and are as slow at any scale) is undone, and the slow rule rests for stuckMs: sharpness is not traded for nothing.
  const recF = [], recG = [];
  let recMs = 0, lastDown = null, stuck = 0;
  const p = (arr, k, qq) => { if (!k) return null; const s = Array.from(arr.subarray(0, k)).sort((a, b) => a - b); return s[Math.min(k - 1, Math.floor(qq * k))]; };
  function set(s, why, round = q) { const v = +round(s).toFixed(2); if (v === scale) return false; scale = v; changed++; last = why; return true; }
  function down(to, why) { let t = Math.min(to, scale - step); if (softMin !== null) t = Math.max(t, softMin); const ok = set(t, why, qDown); holdLeft = wait; lowRun = 0; cleanRun = 0; return ok; }
  const med = (a) => { if (!a.length) return null; const s2 = a.slice().sort((x, y) => x - y); return s2[Math.floor(s2.length / 2)]; };
  function slowRule() {
    if (softMin === null || recMs < span) return null;
    const gs = recG.filter((g) => Number.isFinite(g)), m = gs.length >= recF.length / 2 ? med(gs) : med(recF);
    let moved = null;
    if (lastDown) {   // the first whole window after a slow step down: did it help?
      const was = lastDown; lastDown = null;
      if (!(m < was.m * helpK) && m > okMs) { moved = set(was.scale, 'slow-undo'); stuck = stuckMs; }
    }
    if (moved === null) {
      if (m > slowMs && scale > min + 1e-6 && !(stuck > 0)) { const s0 = scale; moved = set(Math.max(min, scale - step), 'slow', qDown); if (moved) lastDown = { m, scale: s0 }; }
      else if (m <= okMs && scale < softMin - 1e-6) moved = set(Math.min(softMin, scale + step), 'slow-up');
    }
    if (moved !== null) { recF.length = 0; recG.length = 0; recMs = 0; holdLeft = Math.max(holdLeft, hold); }
    return moved;
  }
  function decide() {
    if (softMin !== null) {
      const r = slowRule();
      if (r) return true;
      if (scale < softMin - 1e-6) return false;   // under the soft floor only the slow rule moves the scale
    }
    const g90 = p(gpu, nGpu, 0.9);
    if (holdLeft > 0) holdLeft--;
    if (settling) holdLeft = 0;   // [mobile-perf] behind the title: no hold
    // frames that missed their vsync in this window (more than 1.25 budgets apart), the main thread's own delays left out: a callback that
    // started well after the window's usual delay (a long task before it), or whose own work filled the frame (a build slice, an upload)
    const lag50 = p(lg, n, 0.5) ?? 0;
    let late = 0; for (let i = 0; i < n; i++) if (frm[i] > budgetMs * 1.25 && !(lg[i] > lag50 + 0.3 * budgetMs || cpu[i] > 0.75 * budgetMs)) late++;
    const lateShare = late / n;
    // the last step up did not hold: back off (settling: never try that level again behind this title)
    const failed = () => { if (probe > 0) { if (settling) ceil = Math.min(ceil, scale - step); else wait = Math.min(maxWait, wait * 2); } probe = 0; };
    const mayUp = () => holdLeft === 0 && scale < max && scale + step <= ceil + 1e-6;
    if (g90 !== null && nGpu >= window / 2) {
      if (probe > 0) probe--;
      // down only when frames are actually late (or the GPU is past the whole budget): a busy GPU that still makes every vsync keeps
      // its resolution (the timer query's figure includes waits, so it reads high on a GPU that is keeping up)
      if (g90 > hi * budgetMs && (lateShare >= 0.05 || g90 > 1.15 * budgetMs)) {
        failed();
        // GPU ms ~ a + b * scale^2: assume all of it scales (it does not quite, so this lands a little high and the next window finishes the job)
        return down(scale * Math.sqrt(fit * budgetMs / g90), 'gpu');
      }
      // up when the next step, as if all GPU time grew with the pixels (it does not: a safe guess), still fits in upFit of the budget
      const next = Math.min(max, scale + step), grown = g90 * (next / scale) ** 2;
      if (grown < upFit * budgetMs) { lowRun++; if (lowRun >= (settling ? 1 : upAfter) && mayUp()) { lowRun = 0; probe = 2; return set(next, 'gpu-up'); } }
      else lowRun = 0;
      return false;
    }
    // no GPU timer: late frames while the main thread had time to spare
    const c50 = p(cpu, n, 0.5);
    if (probe > 0) probe--;
    if (lateShare > 0.1 && c50 !== null && c50 < 0.6 * budgetMs) {
      failed();
      return down(scale - step, 'late');
    }
    if (late === 0) { cleanRun++; if (cleanRun >= (settling ? 1 : upAfter * 2) && mayUp()) { cleanRun = 0; probe = 2; return set(scale + step, settling ? 'settle-up' : 'clean-up'); } }
    else cleanRun = 0;
    return false;
  }
  return {
    /** One drawn frame. -> true when the scale changed (resize the render targets). */
    sample({ gpu: g = null, frame = 0, cpu: c = 0, lag = 0 } = {}) {
      if (skip > 0) { skip--; return false; }   // [mobile-perf] the first frames after settle(true): uploads and first programs, not the GPU's pace
      frm[n] = frame; cpu[n] = c; lg[n] = Number.isFinite(lag) && lag > 0 ? lag : 0;
      if (g !== null && g !== undefined && Number.isFinite(g)) gpu[nGpu++] = g;
      n++;
      if (softMin !== null && frame > 0) {   // [mobile-perf] the last `span` ms of frames, for the adaptive floor
        recF.push(frame); recG.push(g !== null && g !== undefined && Number.isFinite(g) ? g : NaN); recMs += frame; if (stuck > 0) stuck -= frame;
        while (recF.length > 1 && recMs - recF[0] >= span) { recMs -= recF.shift(); recG.shift(); }
      }
      if (n < window) return false;
      const r = decide();
      n = 0; nGpu = 0;
      return r;
    },
    get scale() { return scale; },
    get changes() { return changed; },
    get why() { return last; },
    /** Pin a scale (tests, ?dr=0.7) or go back to the top (a new place, a resize). */
    set(s) { return set(s, 'set'); },
    /** [mobile-perf] Settle behind the title (fast, symmetric steps; the first `warm` frames not judged), or end it: the scale found is kept
     *  and the normal controller starts from it with a fresh back-off. */
    settle(on = true) { settling = !!on; n = 0; nGpu = 0; cleanRun = 0; lowRun = 0; probe = 0; holdLeft = 0; wait = hold; ceil = max; recF.length = 0; recG.length = 0; recMs = 0; lastDown = null; stuck = 0; if (on) skip = warm; },
    get settling() { return settling; },
  };
}

/** [mobile-perf] The scale this device held last time (main.js stores it when the visitor leaves the title and when the page is hidden), or
 *  null. Too old (30 days) or out of range: null. `store` is localStorage (or a stand-in). */
export function readHeld(store, key = 'klc.dr', { min = 0.6, max = 1, now = Date.now() } = {}) {
  try { const v = JSON.parse(store?.getItem?.(key) || 'null'); if (!v || !(v.s >= min && v.s <= max) || !(now - v.t < 30 * 864e5)) return null; return v.s; } catch (e) { return null; }
}
export function writeHeld(store, scale, key = 'klc.dr', now = Date.now()) {
  try { store?.setItem?.(key, JSON.stringify({ s: +(+scale).toFixed(2), t: now })); return true; } catch (e) { return false; }
}
