// [feel] Pure measurements over a recorded walk (tools/anime/feel-probe.mjs records the frames; test/feel-metrics.test.js tests these).
// A frame is one rendered picture: the physics state after its steps, the drawn body (hoya root) and feet, the camera, the input.
// Time axis: `simT`, the instant the picture shows (core/timestep.js renderTime), so the numbers do not depend on the screen's pacing.
// Yaw convention (core/player.js): forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw).

export const FIELDS = ['t', 'dt', 'alpha', 'px', 'py', 'pz', 'vx', 'vz', 'vy', 'gnd', 'fly', 'yaw', 'pitch',
  'rx', 'ry', 'rz', 'rface', 'cx', 'cy', 'cz', 'lx', 'ly', 'lz', 'fRx', 'fRy', 'fRz', 'fLx', 'fLy', 'fLz',
  'inF', 'inS', 'run', 'boom', 'top', 'bot', 'clip', 'simT', 'water', 'ground', 'ax', 'az', 'fov'];

/** The chase boom the camera aims for on open ground (play/avatar/camera.js THIRD at main 8882864). */
export const THIRD_BEFORE = { dist: 4.5, height: 1.6, pitch: -8 * Math.PI / 180, shoulder: 0.35 };

export const CLIPS = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'turn'];

export function toFrames(flat, fields = FIELDS) {
  const w = fields.length, n = Math.floor(flat.length / w), out = new Array(n);
  for (let i = 0; i < n; i++) { const o = {}; for (let k = 0; k < w; k++) { const v = flat[i * w + k]; o[fields[k]] = v === null ? NaN : v; } out[i] = o; }
  return out;
}

export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const speedOf = (f) => Math.hypot(f.vx, f.vz);
export const inputMag = (f) => Math.hypot(f.inF, f.inS);
/** The world heading (player yaw convention) the input asks for, or null with no input. */
export function inputHeading(f) {
  if (!(inputMag(f) > 1e-3)) return null;
  const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  const mx = fx * f.inF + rx * f.inS, mz = fz * f.inF + rz * f.inS;
  return Math.atan2(-mx, -mz);
}
const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const rms = (a) => (a.length ? Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length) : NaN);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

/** Frames with a fresh picture (the clock moved): duplicates (dt 0) carry no motion. */
export function live(frames) { return frames.filter((f, i) => i === 0 || f.simT > frames[i - 1].simT + 1e-6); }

/** Runs of constant input: [{ a, b (exclusive), inF, inS, run }] over frame indices. */
export function inputRuns(frames) {
  const runs = [];
  const key = (f) => `${Math.round(f.inF * 20)}|${Math.round(f.inS * 20)}|${f.run ? 1 : 0}`;
  let a = 0;
  for (let i = 1; i <= frames.length; i++) {
    if (i === frames.length || key(frames[i]) !== key(frames[a])) {
      runs.push({ a, b: i, inF: frames[a].inF, inS: frames[a].inS, run: frames[a].run });
      a = i;
    }
  }
  return runs;
}

/** Time (s) from the frame `i0` until `pred(frame)` holds, scanning to `i1`; null if it never does. */
function timeUntil(frames, i0, i1, pred) {
  for (let i = i0; i < i1; i++) if (pred(frames[i], i)) return frames[i].simT - frames[i0].simT;
  return null;
}

/** The speed a run of input settles at: the median over its last `tail` seconds. */
export function steadySpeed(frames, a, b, tail = 0.4) {
  const tEnd = frames[b - 1].simT, v = [];
  for (let i = a; i < b; i++) if (frames[i].simT >= tEnd - tail) v.push(speedOf(frames[i]));
  return median(v);
}

/**
 * Start: from the first frame that carries the input (index a) to 90 % (50 %) of the speed the run settles at. `firstMove`: frames from
 * the input until the drawn body has moved by more than 1 mm. `curve`: speed / steady at 50, 100, 150 ms (an eased start reads ~0.5, ~0.9, ~1).
 */
export function startResponse(frames, a, b) {
  const steady = steadySpeed(frames, a, b);
  const t90 = timeUntil(frames, a, b, (f) => speedOf(f) >= 0.9 * steady);
  const t50 = timeUntil(frames, a, b, (f) => speedOf(f) >= 0.5 * steady);
  let firstMove = null;
  for (let i = a; i < b && i < a + 30; i++) {
    const p = frames[i - 1] || frames[i], f = frames[i];
    if (Math.hypot(f.rx - p.rx, f.rz - p.rz) > 1e-3) { firstMove = i - a; break; }
  }
  const at = (ms) => { const t0 = frames[a].simT; for (let i = a; i < b; i++) if (frames[i].simT - t0 >= ms / 1000 - 1e-6) return r3(speedOf(frames[i]) / steady); return null; };
  return { steady: r3(steady), t90: r3(t90), t50: r3(t50), firstMoveFrames: firstMove, curve: { ms50: at(50), ms100: at(100), ms150: at(150), ms250: at(250) } };
}

/**
 * Stop: from the release frame (index a, no input) to under 5 % of the speed before it. `slide`: metres the drawn body travels after the
 * release; `overshoot`: how far it goes past where it finally rests (a spring that settles back), along the travel direction.
 */
export function stopResponse(frames, a, b) {
  const before = speedOf(frames[a - 1] || frames[a]);
  const tStop = timeUntil(frames, a, b, (f) => speedOf(f) < 0.05 * Math.max(before, 0.01));
  const rest = frames[b - 1];
  const p0 = frames[a - 1] || frames[a];
  const dirX = p0.vx / (before || 1), dirZ = p0.vz / (before || 1);
  let slide = 0, over = 0;
  for (let i = a; i < b; i++) {
    const f = frames[i], p = frames[i - 1];
    slide += Math.hypot(f.rx - p.rx, f.rz - p.rz);
    over = Math.max(over, (f.rx - rest.rx) * dirX + (f.rz - rest.rz) * dirZ);
  }
  return { from: r3(before), tStop: r3(tStop), slide: r3(slide), overshoot: r3(over) };
}

/**
 * Turn: from the frame the input direction changes (index a) to the drawn facing within `tol` (10°) of the input's heading. `never` when the
 * body ends the run still facing away (it walks backwards: the facing follows the camera, not the input).
 */
export function turnResponse(frames, a, b, tol = 10 * Math.PI / 180, wantHeading = null) {
  const want = wantHeading ?? inputHeading(frames[a]);
  if (want === null) return null;
  const start = wrapPi(frames[a - 1]?.rface ?? frames[a].rface);
  const swing = Math.abs(wrapPi(want - start));
  const t = timeUntil(frames, a, b, (f) => Math.abs(wrapPi(f.rface - (wantHeading ?? inputHeading(f) ?? want))) < tol);
  // the body's speed through the reversal and its heading of travel relative to its facing (backwards = 180°)
  let minSpeed = Infinity, backwards = 0, n = 0, maxRate = 0;
  for (let i = a; i < b; i++) {
    const f = frames[i], s = speedOf(f);
    minSpeed = Math.min(minSpeed, s);
    if (s > 0.5) { n++; const travel = Math.atan2(-f.vx, -f.vz); if (Math.abs(wrapPi(travel - f.rface)) > 2.3) backwards++; }
    const p = frames[i - 1]; if (p && f.simT > p.simT) maxRate = Math.max(maxRate, Math.abs(wrapPi(f.rface - p.rface)) / (f.simT - p.simT));
  }
  const end = Math.abs(wrapPi(frames[b - 1].rface - want));
  return { swingDeg: r3(swing * 180 / Math.PI), tTurn: r3(t), endErrDeg: r3(end * 180 / Math.PI), minSpeed: r3(minSpeed), backwardsShare: n ? r3(backwards / n) : 0, maxRateDegS: r3(maxRate * 180 / Math.PI) };
}

/** Where the boom wants the camera on open ground, from the drawn feet and the view yaw (camera.js desiredCam). */
export function idealCam(f, C = THIRD_BEFORE) {
  const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
  const tx = f.rx + rx * C.shoulder, ty = f.ry + C.height, tz = f.rz + rz * C.shoulder;
  const cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
  return { x: tx - fx * C.dist * cp, y: ty - C.dist * sp, z: tz - fz * C.dist * cp };
}

/** Second differences on the frames' own clock: acceleration per frame (vector), skipping duplicate frames. */
function accel(frames, a, b, get) {
  const out = [];
  for (let i = Math.max(a, 1); i < b - 1; i++) {
    const p = frames[i - 1], f = frames[i], n = frames[i + 1];
    const d0 = f.simT - p.simT, d1 = n.simT - f.simT;
    if (!(d0 > 1e-6 && d1 > 1e-6)) continue;
    const P = get(p), F = get(f), N = get(n);
    const ax = ((N[0] - F[0]) / d1 - (F[0] - P[0]) / d0) / ((d0 + d1) / 2);
    const ay = ((N[1] - F[1]) / d1 - (F[1] - P[1]) / d0) / ((d0 + d1) / 2);
    const az = ((N[2] - F[2]) / d1 - (F[2] - P[2]) / d0) / ((d0 + d1) / 2);
    out.push({ t: f.simT, ax, ay, az });
  }
  return out;
}

/** High-frequency part of an acceleration series: minus its centred ±win s mean. RMS of the vector and of y alone (m/s²). */
export function jitter(series, win = 0.1) {
  const hf = [], hfy = [];
  for (let i = 0; i < series.length; i++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let j = i; j >= 0 && series[i].t - series[j].t <= win; j--) { sx += series[j].ax; sy += series[j].ay; sz += series[j].az; n++; }
    for (let j = i + 1; j < series.length && series[j].t - series[i].t <= win; j++) { sx += series[j].ax; sy += series[j].ay; sz += series[j].az; n++; }
    const s = series[i];
    hf.push(Math.hypot(s.ax - sx / n, s.ay - sy / n, s.az - sz / n));
    hfy.push(Math.abs(s.ay - sy / n));
  }
  return { rms: r3(rms(hf)), rmsY: r3(rms(hfy)), max: r3(Math.max(0, ...hf)) };
}

/**
 * Camera over frames [a, b): its lag behind the ideal spot (open ground only: boom ≥ 4.4 m), its jitter (HF acceleration of the position,
 * m/s², and of the look direction, rad/s²), and the look-ahead (how far the look point leads the feet along the travel, m).
 */
export function cameraMetrics(frames, a, b, C = THIRD_BEFORE) {
  const lags = [];
  for (let i = a; i < b; i++) {
    const f = frames[i];
    if (!(f.boom >= C.dist - 0.1)) continue;
    const I = idealCam(f, C);
    lags.push(Math.hypot(f.cx - I.x, f.cy - I.y, f.cz - I.z));
  }
  const pos = jitter(accel(frames, a, b, (f) => [f.cx, f.cy, f.cz]));
  const look = jitter(accel(frames, a, b, (f) => [f.lx, f.ly, f.lz]));
  return { lagMean: r3(mean(lags)), lagMax: r3(lags.length ? Math.max(...lags) : NaN), jitter: pos, lookJitter: look, n: lags.length };
}

/**
 * The camera against its own rest framing, whatever the rig: `rest` is a frame standing still. Over [a, b) the camera-to-body offset along
 * the direction of travel, minus the rest one (trail: negative = the camera lags behind, positive = ahead), and the look point's lead along
 * the travel (lookLead, m: where the view aims ahead of him). Rig-independent (the 4.5 m and 2.6 m booms, before and after).
 */
export function trail(frames, rest, a, b) {
  const R = frames[rest];
  if (!R) return { trail: null, lookLead: null };
  const tr = [], ll = [];
  for (let i = a; i < b; i++) {
    const f = frames[i], s = speedOf(f);
    if (!(s > 0.5) || !Number.isFinite(f.rx) || !Number.isFinite(R.rx)) continue;
    const dx = f.vx / s, dz = f.vz / s;
    tr.push(((f.cx - f.rx) - (R.cx - R.rx)) * dx + ((f.cz - f.rz) - (R.cz - R.rz)) * dz);
    if (Number.isFinite(f.ax) && Number.isFinite(R.ax)) ll.push(((f.ax - f.rx) - (R.ax - R.rx)) * dx + ((f.az - f.rz) - (R.az - R.rz)) * dz);
  }
  return { trail: r3(median(tr)), lookLead: ll.length ? r3(median(ll)) : null };
}

/** After a stop (release at a): how long the camera keeps moving after the body is still, and how far (the catch-up). */
export function catchUp(frames, a, b) {
  let still = null;
  for (let i = a; i < b; i++) if (speedOf(frames[i]) < 0.02) { still = i; break; }
  if (still === null) return { after: null, travel: null };
  let travel = 0, last = still;
  for (let i = still + 1; i < b; i++) {
    const d = Math.hypot(frames[i].cx - frames[i - 1].cx, frames[i].cy - frames[i - 1].cy, frames[i].cz - frames[i - 1].cz);
    travel += d;
    if (d > 5e-4) last = i;
  }
  return { after: r3(frames[last].simT - frames[still].simT), travel: r3(travel) };
}

/**
 * Feet over steady walking [a, b): the planted foot's ground speed (slip, m/s) and its share of the body's speed, and the cycle rate
 * measured from the feet (cycles/s, zero crossings of the right foot's lead along the facing). The planted foot is the lower ankle; its
 * slip is the MEDIAN of its horizontal world speed over the window, so the few hand-over frames (one boot still landing while the other
 * lifts) do not count as a slide, and neither does the heel-to-toe roll (the ankle holds still over a planted boot through mid-stance:
 * measured in town, -0.08..+0.11 m/s for ~7 frames a stance at 1.5 m/s). p90 is reported beside it to show the hand-overs.
 */
export function footMetrics(frames, a, b) {
  const slip = [];
  let cross = 0, tA = null, tB = null, prevU = null;
  for (let i = Math.max(a, 1); i < b; i++) {
    const f = frames[i], p = frames[i - 1];
    const dt = f.simT - p.simT; if (!(dt > 1e-6)) continue;
    if (!Number.isFinite(f.fRx) || !Number.isFinite(p.fRx)) continue;
    const lowR = f.fRy <= f.fLy;
    const vx = lowR ? (f.fRx - p.fRx) / dt : (f.fLx - p.fLx) / dt, vz = lowR ? (f.fRz - p.fRz) / dt : (f.fLz - p.fLz) / dt;
    slip.push(Math.hypot(vx, vz));
    const fx = -Math.sin(f.rface), fz = -Math.cos(f.rface);
    const u = (f.fRx - f.rx) * fx + (f.fRz - f.rz) * fz;
    if (prevU !== null && prevU < 0 && u >= 0) { cross++; if (tA === null) tA = f.simT; tB = f.simT; }
    prevU = u;
  }
  const cadence = cross > 1 && tB > tA ? (cross - 1) / (tB - tA) : null;
  const body = steadySpeed(frames, a, b);
  const s = slip.slice().sort((x, y) => x - y), med = median(slip), p90 = s.length ? s[Math.floor(s.length * 0.9)] : NaN;
  return { body: r3(body), slipMean: r3(med), slipShare: body > 0.3 ? r3(med / body) : null, slipP90: r3(p90), cadence: r3(cadence), stride: cadence ? r3(body / cadence) : null };
}

/**
 * The slide per stance over steady walking [a, b): for each foot, every stretch where its ankle is down (within 1.2 cm of its lowest, the
 * hoya lane's definition); the boot's travel along his heading from the frame after it touched down to the frame it lifts (slideCm), and
 * in the touch-down frame itself (skidCm), and across his heading over the same frames (acrossCm), medians over the stances. A planted
 * foot slides 0 cm however its heel and toe roll. acrossMs is the lower ankle's sideways speed at every frame, its swing included (the
 * median of |v|): a coarse number kept for comparison with earlier runs, not a planted foot's.
 */
export function stanceSlide(frames, a, b) {
  const q = frames[b - 1]; const body = speedOf(q);
  if (!(body > 0.3)) return { slideCm: null, skidCm: null, acrossCm: null, stances: 0 };
  const dx = q.vx / body, dz = q.vz / body, slides = [], skids = [], sides = [], across = [];
  for (const k of ['R', 'L']) {
    let lo = Infinity; for (let i = a; i < b; i++) { const y = frames[i]['f' + k + 'y']; if (Number.isFinite(y)) lo = Math.min(lo, y - frames[i].ground); }
    let run = [];
    const along = (i) => frames[i]['f' + k + 'x'] * dx + frames[i]['f' + k + 'z'] * dz;
    const side = (i) => -frames[i]['f' + k + 'x'] * dz + frames[i]['f' + k + 'z'] * dx;
    const flush = () => {
      if (run.length >= 2) { const e = run[run.length - 1]; slides.push(Math.abs(along(e) - along(run[1]))); skids.push(Math.abs(along(run[1]) - along(run[0]))); sides.push(Math.abs(side(e) - side(run[1]))); }
      run = [];
    };
    for (let i = a; i < b; i++) { const y = frames[i]['f' + k + 'y']; if (Number.isFinite(y) && y - frames[i].ground < lo + 0.012) run.push(i); else flush(); }
    flush();
  }
  for (let i = Math.max(a, 1); i < b; i++) {
    const f = frames[i], p = frames[i - 1], dt = f.simT - p.simT; if (!(dt > 1e-6) || !Number.isFinite(f.fRx)) continue;
    const lowR = f.fRy <= f.fLy, vx = lowR ? (f.fRx - p.fRx) / dt : (f.fLx - p.fLx) / dt, vz = lowR ? (f.fRz - p.fRz) / dt : (f.fLz - p.fLz) / dt;
    across.push(Math.abs(-vx * dz + vz * dx));
  }
  return { slideCm: r3(median(slides) * 100), skidCm: r3(median(skids) * 100), acrossCm: r3(median(sides) * 100), stances: slides.length, acrossMs: r3(median(across)) };
}

/**
 * Steps and kerbs over [a, b): the largest per-frame rise of the drawn body and of the camera (m), frames with a body jump over 5 cm, frames
 * off the ground, frames he is hidden (a collapsed boom), the camera's largest per-frame jump beyond the body's own motion (a pop) and the
 * boom's largest per-frame change.
 */
export function stepMetrics(frames, a, b) {
  let bodyMax = 0, camMax = 0, air = 0, rise = 0, frames5 = 0, hidden = 0, pop = 0, boomJump = 0;
  for (let i = Math.max(a, 1); i < b; i++) {
    const f = frames[i], p = frames[i - 1];
    if (!(f.simT > p.simT)) continue;
    if (!Number.isFinite(f.ry)) { hidden++; continue; }
    const dy = Number.isFinite(p.ry) ? f.ry - p.ry : 0, dc = f.cy - p.cy;
    bodyMax = Math.max(bodyMax, Math.abs(dy)); camMax = Math.max(camMax, Math.abs(dc));
    if (Math.abs(dy) > 0.05) frames5++;
    if (!f.gnd) air++;
    if (Number.isFinite(frames[a].ry)) rise = Math.max(rise, f.ry - frames[a].ry);
    const body = Number.isFinite(p.rx) ? Math.hypot(f.rx - p.rx, f.ry - p.ry, f.rz - p.rz) : 0;
    pop = Math.max(pop, Math.hypot(f.cx - p.cx, f.cy - p.cy, f.cz - p.cz) - body);
    if (Number.isFinite(f.boom) && Number.isFinite(p.boom)) boomJump = Math.max(boomJump, Math.abs(f.boom - p.boom));
  }
  return { bodyMaxDy: r3(bodyMax), camMaxDy: r3(camMax), jumps5cm: frames5, airFrames: air, hiddenFrames: hidden, climbed: r3(rise), camPop: r3(pop), boomJump: r3(boomJump) };
}

/** The character's height on screen (share of the viewport height, from the projected soles and head top). */
export function framing(frames, a, b) {
  const v = [];
  for (let i = a; i < b; i++) if (Number.isFinite(frames[i].top) && Number.isFinite(frames[i].bot)) v.push((frames[i].top - frames[i].bot) / 2);
  return { share: r3(median(v)) };
}

/** The field of view over [a, b) (the run's widening): its range, the largest change in one frame (deg), and its value at the end. */
export function fovMetrics(frames, a, b) {
  let lo = Infinity, hi = -Infinity, step = 0;
  for (let i = a; i < b; i++) {
    const f = frames[i]; if (!Number.isFinite(f.fov)) continue;
    lo = Math.min(lo, f.fov); hi = Math.max(hi, f.fov);
    const p = frames[i - 1]; if (p && Number.isFinite(p.fov)) step = Math.max(step, Math.abs(f.fov - p.fov));
  }
  return { min: r3(lo), max: r3(hi), widen: r3(hi - lo), maxStep: r3(step), end: r3(frames[b - 1]?.fov) };
}

/** Frame pacing over [a, b): the frame interval (ms) mean / p95 / max on the page clock and the simulated seconds per real second. */
export function pacing(frames, a, b) {
  const g = [];
  for (let i = Math.max(a, 1); i < b; i++) g.push((frames[i].t - frames[i - 1].t) * 1000);
  const s = g.slice().sort((x, y) => x - y);
  return { meanMs: r3(mean(g)), p95Ms: r3(s[Math.floor(s.length * 0.95)] ?? NaN), maxMs: r3(s[s.length - 1] ?? NaN), n: g.length };
}

// ------------------------------------------------------------------ the probe's script, scored (feel-probe.mjs and feel-score.mjs)
function bracket(marks, id, next) {
  const a = marks.find((m) => m[0] === id), b = marks.find((m) => m[0] === next);
  return a && b ? [a[1], b[1]] : null;
}
const inputHeadingAt = (fr, i) => (fr[i] ? inputHeading(fr[i]) : null);
/** The first frame in [a, b) where `pred` holds (the input's onset inside a bracket), else a. */
const onset = (fr, a, b, pred) => { for (let i = a; i < Math.min(b, fr.length); i++) if (pred(fr[i])) return i; return a; };

/** The first frame of the last `secs` seconds of [a, b) (windows in time, not frames: 90 frames is 1.5 s at 60 fps but 3 s at 30). */
function lastSecs(fr, a, b, secs) { const t1 = fr[b - 1].simT; let i = b - 1; while (i > a && t1 - fr[i - 1].simT <= secs + 1e-9) i--; return i; }

/** The probe's scripted walk, scored: every number above over its brackets (marks from tools/anime/feel-probe.mjs). */
export function analyseRun(fr, marks) {
  const B = (id, next) => bracket(marks, id, next);
  const out = {};
  const settle = B('settle', 'walk'), walk = B('walk', 'run'), run = B('run', 'reverse'), rev = B('reverse', 'stop'), stop = B('stop', 'curve0');
  const curve = B('curve', 'curveStop');
  if (settle) out.framing = framing(fr, settle[0], settle[1]);
  if (walk) {
    const a = onset(fr, walk[0], walk[1] + 8, (f) => inputMag(f) > 0.01);
    const b = run ? onset(fr, run[0], run[1], (f) => f.run) : walk[1];
    out.walkStart = startResponse(fr, a, b);
    out.walkFeet = { ...footMetrics(fr, lastSecs(fr, a, b, 1), b), ...stanceSlide(fr, lastSecs(fr, a, b, 1.5), b) };
    out.walkCam = { ...cameraMetrics(fr, lastSecs(fr, a, b, 1.5), b), ...trail(fr, a - 1, lastSecs(fr, a, b, 0.5), b) };
  }
  if (run) {
    const a = onset(fr, run[0], run[1] + 8, (f) => f.run);
    const b = onset(fr, a + 1, rev ? rev[1] : run[1], (f) => !f.run || inputMag(f) < 0.5);   // the run window ends with the run input (a thumb's flick passes the dead zone on its way back)
    out.runStart = startResponse(fr, a, b);
    const brev = rev ? onset(fr, rev[0], rev[1], (f) => f.inF < -0.01) : run[1];
    void brev;
    out.runFeet = { ...footMetrics(fr, lastSecs(fr, a, b, 1), b), ...stanceSlide(fr, lastSecs(fr, a, b, 1.15), b) };
    const rest = walk ? onset(fr, walk[0], walk[1] + 8, (f) => inputMag(f) > 0.01) - 1 : a - 1;
    out.runCam = { ...cameraMetrics(fr, lastSecs(fr, a, b, 1), b), ...trail(fr, rest, lastSecs(fr, a, b, 0.33), b) };
  }
  if (rev) {
    const a = onset(fr, rev[0], rev[1] + 8, (f) => f.inF < -0.01);
    const b = stop ? onset(fr, stop[0], stop[1] + 8, (f) => inputMag(f) < 0.01) : rev[1];
    out.turn180 = turnResponse(fr, a, b);
    out.reverseStart = startResponse(fr, a, b);
  }
  if (stop) {
    const a = onset(fr, stop[0], stop[1] + 8, (f) => inputMag(f) < 0.01);
    out.stop = stopResponse(fr, a, stop[1]);
    out.stopCam = { ...cameraMetrics(fr, a, stop[1]), ...catchUp(fr, a, stop[1]) };
  }
  if (curve) {
    const a = onset(fr, curve[0], curve[1] + 8, (f) => Math.abs(f.inS) > 0.01);
    const want = inputHeadingAt(fr, curve[1] - 1);
    out.curve45 = turnResponse(fr, a, curve[1], 10 * Math.PI / 180, want);
  }
  for (const id of ['steps', 'stair']) {
    const st = B(id, id + 'Stop');
    if (!st) continue;
    const a = onset(fr, st[0], st[1] + 8, (f) => inputMag(f) > 0.01);
    const end = B(id + 'Stop', id + 'End');
    out[id] = stepMetrics(fr, a, end ? end[1] : st[1]);
    out[id + 'Cam'] = cameraMetrics(fr, a, st[1]);
  }
  if (walk && stop) out.fov = { walkToStop: fovMetrics(fr, walk[0], stop[1]), atRest: fovMetrics(fr, Math.max(stop[0], stop[1] - 30), stop[1]) };
  const all = B('settle', 'end');
  if (all) { out.pacing = pacing(fr, all[0], all[1]); out.camAll = cameraMetrics(fr, all[0], all[1]); }
  return out;
}

