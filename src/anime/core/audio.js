// Ported from Sakuragaoka Station (Kenton-GMI/sakuragaoka-station, MIT; see src/anime/LICENSE-sakuragaoka-station).
// Audio engine — fully synthesized WebAudio (no sample files). Nothing plays before start() (user gesture).
//
// API
//   audio.start()                       -> call from a user gesture; creates AudioContext, starts ambience
//   audio.ready                          -> bool
//   audio.loop(name, opts) -> handle     -> opts: { position: Vector3 | () => Vector3, volume: 0..1, params: {} }
//        handle.setVolume(v, rampSeconds), handle.setParam(key, value), handle.setPosition(vec3), handle.stop()
//        Handles may be created before start(); they bind automatically once audio is ready.
//   audio.play(name, opts)               -> one-shot; opts: { position, volume, text (for 'announce') }
//   audio.update(camera, dt)             -> called by the core every frame (listener follows camera)
//   audio.setMaster(v), audio.muted (get/set)
//   None of these ever throw; unknown names are ignored (one console warning).
//
// Sound names
//   loops:     'wind', 'birds', 'town' (ambient; auto-started by start()),
//              'crossingBell' (カンカン alternating bell), 'trainRun' (params: speed m/s, 0..25),
//              'cafeMusic' (soft music box near the café)
//   one-shots: 'trainBrake', 'doorChime', 'doorOpen', 'doorClose', 'departMelody', 'announce' (text),
//              'bicycleBell', 'catMeow', 'sparrow', 'vendingDrop'
//   (there are deliberately no footstep sounds; play('footstep') is a silent no-op)
//
// Extras (optional, backwards compatible)
//   createAudio({ context, ambience = true, speech = true, master = 0.85, muted = false, seed, hrtf = true })
//     context: an existing (Offline)AudioContext used by start() instead of creating one (headless tests)
//   audio.context                 the AudioContext (null before start)
//   audio.meter() -> {rms, peak}  output level (debug), audio.stats -> {voices, loops, awake, sources, hrtf, buffers, state}
//
// Design notes
//   * createAudio() never touches WebAudio; node / headless imports are safe. Everything is built in start().
//   * All sounds are synthesized: short sounds are rendered once in JS (additive / damped-phasor / formant
//     synthesis, seeded PRNG) into cached AudioBuffers and replayed with AudioBufferSourceNodes; continuous
//     sounds (wind, train motor, rolling noise, brake squeal) are small live node graphs fed by three shared,
//     seamlessly looping noise buffers. No ScriptProcessor / worklets.
//   * Timing uses AudioContext.currentTime with a 250 ms look-ahead scheduler; loop logic runs at a ~40 Hz
//     control rate on the audio clock (so it also works when the caller passes dt = 0).
//   * Positional sounds: PannerNode (inverse distance) + distance air-absorption low-pass + far fade; HRTF for
//     the loops and nearby one-shots, equal-power for ambient birds / town events / far sounds (CPU).
//     The listener follows the camera. A synthesized outdoor impulse response gives a light shared reverb.
//   * Loops that are out of range or at volume 0 are disconnected ("asleep") so the browser stops pulling them.
//   * Output: bus -> master -> compressor (glue/limiter) -> soft clipper (WaveShaper) -> mute -> destination.
//   * Voice caps per category; finished voices are stopped and disconnected.
//   * Runtime variation uses a seeded PRNG (never Math.random()).

const TAU = Math.PI * 2;
const LA = 0.25;                       // scheduler look-ahead (s)
const CTL = 0.024;                     // control-rate period (s, audio clock)
const SLEEP = 3;                       // an inaudible loop is disconnected after this many seconds
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const sm = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const nowMs = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
const hasOwn = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

function prng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  return r;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// =====================================================================================================
// Offline JS synthesis (pure functions: sample rate in, Float32Array(s) out)
// =====================================================================================================
const SIN_N = 4096; let SIN = null;
function sinT(ph) {                    // sine of a phase given in cycles (table + linear interpolation)
  if (SIN === null) { SIN = new Float32Array(SIN_N + 1); for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((i / SIN_N) * TAU); }
  ph -= Math.floor(ph); const x = ph * SIN_N, i = x | 0; return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}
const arr = (sr, sec) => new Float32Array(Math.max(1, Math.round(sec * sr)));

/** add amp·e^(-t/tau)·sin(2πft) from t0 (damped phasor, 4 mults per sample) */
function addDamped(x, sr, t0, f, amp, tau, att = 0.001, phase = 0) {
  if (f <= 0 || f >= sr * 0.46 || !amp) return;
  const n0 = Math.max(0, Math.round(t0 * sr)), len = Math.min(x.length - n0, Math.ceil(tau * sr * 7));
  if (len <= 0) return;
  const w = (TAU * f) / sr, k = Math.exp(-1 / (tau * sr)), c = Math.cos(w) * k, s = Math.sin(w) * k;
  let re = Math.cos(phase), im = Math.sin(phase); const na = Math.max(1, Math.round(att * sr));
  for (let i = 0; i < len; i++) {
    x[n0 + i] += (i < na ? (amp * i) / na : amp) * im;
    const nr = re * c - im * s; im = re * s + im * c; re = nr;
  }
}
/** swept tone: frequency fFn(u,t), amplitude envFn(u,t), harmonic weights */
function addSwept(x, sr, t0, dur, fFn, envFn, harm = [1]) {
  const n0 = Math.round(t0 * sr), n = Math.round(dur * sr); let ph = 0;
  for (let i = 0; i < n; i++) {
    const j = n0 + i; if (j >= x.length) break;
    const t = i / sr, u = i / n; ph += fFn(u, t) / sr;
    const e = envFn(u, t); if (!e) continue;
    const s1 = sinT(ph), c2 = 2 * sinT(ph + 0.25); let sp = 0, sc = s1, s = harm[0] * s1;
    for (let k = 1; k < harm.length; k++) { const sn = c2 * sc - sp; sp = sc; sc = sn; s += harm[k] * sn; }
    x[j] += e * s;
  }
}
/** harmonic source f0Fn with a (time-varying) spectral envelope specFn(freq, u) — voices (cat, crow) */
function addFormant(x, sr, t0, dur, f0Fn, envFn, specFn, maxF = 6000) {
  const n0 = Math.round(t0 * sr), n = Math.round(dur * sr), A = new Float32Array(40); let ph = 0, K = 1;
  for (let i = 0; i < n; i++) {
    const j = n0 + i; if (j >= x.length) break;
    const t = i / sr, u = i / n, f0 = f0Fn(u, t); ph += f0 / sr;
    if ((i & 63) === 0) { K = Math.max(1, Math.min(40, Math.floor(maxF / f0))); for (let k = 1; k <= K; k++) A[k - 1] = specFn(k * f0, u); }
    const e = envFn(u, t); if (!e) continue;
    const s1 = sinT(ph), c2 = 2 * sinT(ph + 0.25); let sp = 0, sc = s1, s = A[0] * s1;
    for (let k = 2; k <= K; k++) { const sn = c2 * sc - sp; sp = sc; sc = sn; s += A[k - 1] * sn; }
    x[j] += e * s;
  }
}
function noise(sr, sec, r) { const x = arr(sr, sec); for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1; return x; }
/** filtered, normalised, edge-faded noise segment */
function nseg(sr, sec, r, ...F) { const y = noise(sr, sec, r); for (const [type, f, q] of F) filt(y, sr, type, f, q); norm(y, 1); return fadeEdges(y, sr, 0.004, 0.06); }
function coef(type, f, Q, sr, db) {    // RBJ biquad
  const w0 = (TAU * clamp(f, 10, sr * 0.49)) / sr, cw = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else { const A = Math.pow(10, db / 40); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filt(x, sr, type, f, Q = 0.707, db = 0) {
  const dyn = typeof f === 'function'; let c = dyn ? null : coef(type, f, Q, sr, db);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (dyn && (i & 31) === 0) c = coef(type, f(i / sr), Q, sr, db);
    const x0 = x[i], y0 = c[0] * x0 + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
  }
  return x;
}
function mixIn(x, y, sr, t0, gain = 1, envFn = null) {
  const n0 = Math.round(t0 * sr);
  for (let i = 0; i < y.length && n0 + i < x.length; i++) x[n0 + i] += y[i] * gain * (envFn ? envFn(i / sr) : 1);
}
function norm(x, peak) {
  let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
  if (m > 1e-9) { const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; }
  return x;
}
function normRms(x, target) {
  let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const r = Math.sqrt(s / x.length); if (r > 1e-9) { const k = target / r; for (let i = 0; i < x.length; i++) x[i] *= k; }
  return x;
}
function fadeEdges(x, sr, fin = 0.002, fout = 0.02) {
  const a = Math.round(fin * sr), b = Math.round(fout * sr), n = x.length;
  for (let i = 0; i < a && i < n; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < n; i++) x[n - 1 - i] *= i / b;
  return x;
}
/** pitch-dropping sine thud */
function thump(x, sr, t0, f1, f2, tau, amp) {
  const n0 = Math.round(t0 * sr), n = Math.min(x.length - n0, Math.round(tau * 7 * sr)), na = Math.round(0.0015 * sr); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / sr; ph += (f2 + (f1 - f2) * Math.exp(-t / (tau * 0.45))) / sr; x[n0 + i] += amp * Math.exp(-t / tau) * (i < na ? i / na : 1) * sinT(ph); }
}
/** filtered, normalised noise hit with exponential decay */
function burst(x, sr, r, t0, dur, type, f, Q, amp, tau, att = 0.0008) {
  const y = noise(sr, dur, r); filt(y, sr, type, f, Q); norm(y, 1);
  const na = Math.max(1, Math.round(att * sr));
  for (let i = 0; i < y.length; i++) y[i] *= Math.exp(-i / sr / tau) * (i < na ? i / na : 1);
  mixIn(x, y, sr, t0, amp);
}

// ---------------------------------------------------------------- noise beds (seamless loops) + reverb IR
function noiseLoop(sr, r, sec, kind) {
  const N = Math.round(sec * sr), X = Math.round(0.08 * sr), g = new Float32Array(N + X);
  if (kind === 'white') for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
  else if (kind === 'pink') {        // Paul Kellet's refined pink filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < g.length; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      g[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else { let y = 0; for (let i = 0; i < g.length; i++) { y = y * 0.9985 + (r() * 2 - 1) * 0.05; g[i] = y; } filt(g, sr, 'hp', 18, 0.7); }
  const b = new Float32Array(N);           // equal-power crossfade of the overhang into the start -> seamless loop
  for (let i = 0; i < N; i++) b[i] = g[i + X];
  for (let i = 0; i < X; i++) { const w = i / X, k = N - X + i; b[k] = g[k + X] * Math.sqrt(1 - w) + g[i] * Math.sqrt(w); }
  return normRms(b, kind === 'white' ? 0.3 : 0.25);
}
function makeIR(sr, r) {                   // small-town outdoor space: facade slaps + short dark tail
  const len = Math.round(1.4 * sr), pre = Math.round(0.009 * sr), L = new Float32Array(len), R = new Float32Array(len);
  for (const ch of [L, R]) {
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr, a = 0.25 + 0.7 * Math.min(1, t / 1.2);
      y += (1 - a) * ((r() * 2 - 1) - y);
      ch[i] = y * Math.exp((-t * 6.9) / 1.15) * (1 + a);
    }
  }
  const taps = [[0.013, 0.55, 0.3], [0.021, 0.35, 0.5], [0.034, 0.3, 0.25], [0.047, 0.22, 0.35], [0.068, 0.16, 0.14], [0.089, 0.1, 0.12]];
  for (const [t, aL, aR] of taps) { L[Math.round(t * sr)] += aL * 8; R[Math.round((t + 0.003) * sr)] += aR * 8; }
  fadeEdges(L, sr, 0, 0.05); fadeEdges(R, sr, 0, 0.05);
  return [L, R];
}
/** soft-clip transfer curve for a WaveShaper fed with x/4: linear to 0.75, smooth knee, never above 0.97 */
function clipCurve(n = 8192) {
  const c = new Float32Array(n), K = 0.75, H = 0.97 - K;
  for (let i = 0; i < n; i++) {
    const X = ((i / (n - 1)) * 2 - 1) * 4, a = Math.abs(X);
    c[i] = Math.sign(X) * (a <= K ? a : K + H * Math.tanh((a - K) / H));
  }
  return c;
}

// ---------------------------------------------------------------- instruments (damped partial sets)
const INSTR = {
  box: { p: [[1, 1, 1], [1.0017, 0.3, 0.95], [2, 0.14, 0.45], [5.4, 0.1, 0.12], [8.93, 0.035, 0.05]], tau: (f) => clamp(1.25 * Math.sqrt(440 / f), 0.35, 1.9), att: 0.0012, click: 0.05 },
  bass: { p: [[1, 1, 1], [2, 0.5, 0.7], [3, 0.2, 0.5], [4, 0.1, 0.35], [5, 0.05, 0.25]], tau: (f) => clamp(1.5 * Math.sqrt(110 / f), 0.5, 2.0), att: 0.005, click: 0.015 },
  cel: { p: [[1, 1, 1], [2, 0.2, 0.5], [3, 0.07, 0.35], [4.16, 0.16, 0.18], [6.9, 0.04, 0.08]], tau: (f) => clamp(0.95 * Math.sqrt(660 / f), 0.35, 1.4), att: 0.0018, click: 0.03 },
  ep: { p: [[1, 1, 1], [2, 0.3, 0.55], [3, 0.06, 0.4], [7.1, 0.025, 0.08]], tau: (f) => clamp(1.2 * Math.sqrt(330 / f), 0.5, 1.6), att: 0.004, click: 0 },
  vib: { p: [[1, 1, 1], [3.98, 0.2, 0.3], [9.9, 0.035, 0.1]], tau: (f) => clamp(1.3 * Math.sqrt(700 / f), 0.6, 1.9), att: 0.0022, click: 0.02, trem: [5.4, 0.14] },
};
function synthNote(sr, r, inst, midi) {
  const I = INSTR[inst] || INSTR.box, f = mtof(midi), tau = I.tau(f), x = arr(sr, Math.min(2.6, tau * 5 + 0.06));
  for (const [m, a, ts] of I.p) addDamped(x, sr, 0, f * m, a, tau * ts, I.att, 0);
  if (I.click) burst(x, sr, r, 0, 0.012, 'hp', 1800, 0.7, I.click, 0.0025);
  if (I.trem) { const [rt, dp] = I.trem; for (let i = 0; i < x.length; i++) x[i] *= 1 - dp * (0.5 - 0.5 * sinT((rt * i) / sr + 0.25)); }
  fadeEdges(x, sr, 0, 0.05); return norm(x, 0.8);
}

// ---------------------------------------------------------------- sound effects
function bell(sr, r, f0) {                 // crossing bell strike: struck-metal partials, fundamental-heavy (clear, not shrill)
  const x = arr(sr, 0.95);
  const P = [[1, 1, 0.27], [1.0052, 0.42, 0.25], [2.43, 0.4, 0.11], [3.94, 0.16, 0.06], [5.62, 0.055, 0.035], [7.93, 0.018, 0.02]];
  for (const [m, a, tau] of P) addDamped(x, sr, 0, f0 * m, a, tau, 0.0006, 0);
  burst(x, sr, r, 0, 0.012, 'bp', 2500, 1.0, 0.16, 0.0014);
  filt(x, sr, 'lp', 5600, 0.6);
  fadeEdges(x, sr, 0, 0.04); return norm(x, 0.9);
}
function click(sr, r, m) {                 // wheel over a rail joint (one axle)
  const x = arr(sr, 0.26);
  thump(x, sr, 0, 130 * m, 55 * m, 0.05, 0.9);
  addDamped(x, sr, 0, 330 * m, 0.4, 0.03, 0.0008); addDamped(x, sr, 0, 515 * m, 0.25, 0.02, 0.0008);
  addDamped(x, sr, 0, 1260 * m, 0.12, 0.011, 0.0005); addDamped(x, sr, 0, 2390 * m, 0.05, 0.006, 0.0005);
  burst(x, sr, r, 0, 0.03, 'bp', 2100 * m, 0.9, 0.35, 0.004);
  fadeEdges(x, sr, 0, 0.03); return norm(x, 0.9);
}
function sparrow(sr, r) {                  // チュンチュン: 2–4 quick up-down chirps around 3–5.5 kHz
  const n = 2 + Math.floor(r() * 3), C = []; let t = 0.01;
  for (let c = 0; c < n; c++) {
    const dur = r.range(0.045, 0.085);
    C.push({ t, dur, fa: r.range(2700, 3500), fb: r.range(4300, 5500), fc: r.range(3200, 4300), up: r.range(0.25, 0.45), a: r.range(0.7, 1) });
    t += dur + (r() < 0.35 ? r.range(0.035, 0.07) : r.range(0.11, 0.2));
  }
  const x = arr(sr, t + 0.04);
  for (const c of C) addSwept(x, sr, c.t, c.dur, (u) => (u < c.up ? c.fa + (c.fb - c.fa) * sm(u / c.up) : c.fb + (c.fc - c.fb) * sm((u - c.up) / (1 - c.up))), (u) => c.a * Math.pow(Math.sin(Math.PI * u), 1.2), [1, 0.16, 0.05]);
  fadeEdges(x, sr, 0.001, 0.02); return norm(x, 0.8);
}
function uguisu(sr, r, v) {                // ホーホケキョ (Japanese bush warbler)
  const k = v ? 0.95 : 1, hoo = v ? 1.05 : 1.35, x = arr(sr, hoo + 0.95);
  addSwept(x, sr, 0.02, hoo, (u, t) => k * (1010 + 110 * u + 6 * Math.sin(TAU * 4.5 * t) * u), (u, t) => sm(t / 0.32) * (0.72 + 0.28 * u) * (1 - sm((u - 0.9) / 0.1)), [1, 0.07, 0.02]);
  let t = 0.02 + hoo + 0.1;
  addSwept(x, sr, t, 0.085, (u) => k * (1750 - 120 * u), (u) => 0.75 * Math.pow(Math.sin(Math.PI * u), 0.8), [1, 0.06]); t += 0.105;      // ホ
  addSwept(x, sr, t, 0.06, (u) => k * (2000 + 1600 * u * u), (u) => 0.7 * Math.sin(Math.PI * u), [1, 0.05]); t += 0.072;                  // ケ
  addSwept(x, sr, t, 0.3, (u) => k * (3900 - 1300 * Math.pow(u, 0.7)), (u, tt) => (u < 0.08 ? u / 0.08 : Math.exp(-(u - 0.08) * 4.2)) * 0.95 * (1 - 0.18 * Math.sin(TAU * 38 * tt)), [1, 0.08]); // キョ
  fadeEdges(x, sr, 0.002, 0.05); return norm(x, 0.8);
}
function crow(sr, r, v) {                  // distant カァー カァー
  const n = v ? 2 : 3, x = arr(sr, n * 0.64 + 0.35);
  for (let c = 0; c < n; c++) {
    const t0 = 0.02 + c * 0.62 * r.range(0.96, 1.06), dur = r.range(0.34, 0.42), fb = r.range(460, 530) * (c === n - 1 ? 0.94 : 1), p1 = r() * TAU, p2 = r() * TAU;
    addFormant(x, sr, t0, dur,
      (u, t) => fb * (1 + 0.1 * Math.sin(Math.PI * u) - 0.08 * u + 0.025 * Math.sin(TAU * 37 * t + p1) + 0.015 * Math.sin(TAU * 53 * t + p2)),
      (u, t) => sm(u / 0.07) * (1 - 0.3 * u) * (1 - sm((u - 0.85) / 0.15)) * (1 - 0.3 * (0.5 + 0.5 * Math.sin(TAU * 68 * t))),
      (f) => Math.exp(-(((f - 1250) / 420) ** 2)) + 0.6 * Math.exp(-(((f - 2250) / 560) ** 2)) + 0.1, 5000);
  }
  filt(x, sr, 'lp', 2800, 0.7); fadeEdges(x, sr, 0.002, 0.05); return norm(x, 0.75);
}
function meow(sr, r, v) {                  // ニャー: harmonic source through moving formants (i → a → u)
  const [D, a, pk, e, up] = [[0.78, 500, 760, 440, 0.3], [0.5, 560, 700, 600, 0.35], [0.95, 460, 820, 400, 0.4]][v];
  const x = arr(sr, D + 0.08);
  const lerp3 = (A, B, C, u) => (u < 0.5 ? A + (B - A) * sm(u * 2) : B + (C - B) * sm(u * 2 - 1));
  const env = (u) => sm(u / 0.1) * (1 - sm((u - 0.78) / 0.22)) * (0.85 + 0.15 * Math.sin(Math.PI * u));
  addFormant(x, sr, 0.02, D, (u, t) => (u < up ? a + (pk - a) * sm(u / up) : pk + (e - pk) * sm((u - up) / (1 - up))) * (1 + 0.012 * Math.sin(TAU * 6 * t)), env,
    (f, u) => { const F1 = lerp3(620, 1000, 680, u), F2 = lerp3(1750, 1550, 1150, u); return Math.exp(-(((f - F1) / 200) ** 2)) + 0.75 * Math.exp(-(((f - F2) / 280) ** 2)) + 0.3 * Math.exp(-(((f - 3000) / 450) ** 2)) + 0.02; }, 6000);
  const br = nseg(sr, D, r, ['bp', 2800, 0.8]);
  mixIn(x, br, sr, 0.02, 0.05, (t) => env(t / D));
  fadeEdges(x, sr, 0.002, 0.04); return norm(x, 0.75);
}
function doorOpen(sr, r) {                 // プシュッ + slide + soft stop
  const x = arr(sr, 1.6);
  const air = nseg(sr, 0.9, r, ['hp', 1400, 0.7], ['bp', 3800, 0.7]);
  mixIn(x, air, sr, 0, 0.6, (t) => (t < 0.015 ? t / 0.015 : t < 0.12 ? 1 : Math.exp(-(t - 0.12) / 0.2)));
  const sl = nseg(sr, 1.0, r, ['bp', 700, 0.8], ['lp', 1600, 0.7]);
  mixIn(x, sl, sr, 0.1, 0.16, (t) => Math.pow(Math.sin(Math.PI * clamp01(t / 0.95)), 0.7));
  const rb = nseg(sr, 1.0, r, ['lp', 260, 0.7], ['hp', 60, 0.7]);
  mixIn(x, rb, sr, 0.1, 0.1, (t) => Math.pow(Math.sin(Math.PI * clamp01(t / 0.95)), 0.7));
  addSwept(x, sr, 0.1, 0.95, (u) => 140 + 25 * u, (u) => 0.05 * Math.sin(Math.PI * u), [1, 0.3, 0.1]);
  thump(x, sr, 1.06, 120, 65, 0.05, 0.45); addDamped(x, sr, 1.06, 310, 0.15, 0.03, 0.001);
  burst(x, sr, r, 1.06, 0.03, 'lp', 2000, 0.7, 0.12, 0.006);
  fadeEdges(x, sr, 0.001, 0.05); return norm(x, 0.85);
}
function doorClose(sr, r) {                // プシュー + slide + ドン + small hiss
  const x = arr(sr, 1.9);
  const air = nseg(sr, 1.2, r, ['hp', 1200, 0.7], ['bp', 3200, 0.6]);
  mixIn(x, air, sr, 0, 0.55, (t) => (t < 0.02 ? t / 0.02 : t < 0.22 ? 1 : Math.exp(-(t - 0.22) / 0.17)));
  const sl = nseg(sr, 1.05, r, ['bp', 650, 0.8], ['lp', 1500, 0.7]);
  mixIn(x, sl, sr, 0.12, 0.17, (t) => sm(t / 0.2) * (0.6 + 0.4 * t) * (1 - sm((t - 0.95) / 0.07)));
  const rb = nseg(sr, 1.05, r, ['lp', 240, 0.7], ['hp', 60, 0.7]);
  mixIn(x, rb, sr, 0.12, 0.1, (t) => sm(t / 0.2) * (1 - sm((t - 0.95) / 0.07)));
  addSwept(x, sr, 0.12, 1.0, (u) => 130 + 30 * u, (u) => 0.05 * Math.sin(Math.PI * u), [1, 0.3, 0.1]);
  const T = 1.14;
  thump(x, sr, T, 100, 55, 0.08, 0.8); addDamped(x, sr, T, 230, 0.25, 0.05, 0.001); addDamped(x, sr, T, 520, 0.1, 0.02, 0.0008);
  burst(x, sr, r, T, 0.04, 'lp', 2400, 0.7, 0.25, 0.008);
  thump(x, sr, T + 0.07, 90, 55, 0.04, 0.2);
  const s2 = nseg(sr, 0.4, r, ['bp', 3500, 0.8]);
  mixIn(x, s2, sr, T + 0.18, 0.3, (t) => (t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) / 0.08)));
  fadeEdges(x, sr, 0.001, 0.05); return norm(x, 0.9);
}
function airRelease(sr, r) {               // end of braking: bogie clunk + long プシュー
  const x = arr(sr, 2.6);
  thump(x, sr, 0, 75, 45, 0.1, 0.6); addDamped(x, sr, 0, 180, 0.2, 0.06, 0.002); addDamped(x, sr, 0, 920, 0.06, 0.04, 0.001);
  const air = nseg(sr, 2.2, r, ['hp', 1800, 0.7], ['bp', 4200, 0.5]);
  mixIn(x, air, sr, 0.35, 0.6, (t) => (t < 0.03 ? t / 0.03 : t < 0.35 ? 1 : Math.exp(-(t - 0.35) / 0.5)) * (1 - 0.1 * Math.sin(TAU * 23 * t)));
  fadeEdges(x, sr, 0.001, 0.08); return norm(x, 0.85);
}
function bikeBell(sr, r) {                 // チリンチリン: rotary striker on a small dome
  const x = arr(sr, 1.5), f0 = 2250, P = [[1, 1, 0.5], [1.0035, 0.6, 0.5], [2.21, 0.35, 0.26], [3.58, 0.18, 0.14]];
  const hits = [[0, 0.9], [0.038, 0.55], [0.075, 0.7], [0.112, 0.45], [0.46, 0.85], [0.497, 0.5], [0.534, 0.65], [0.571, 0.4]];
  for (const [t, a] of hits) { for (const [m, pa, tau] of P) addDamped(x, sr, t, f0 * m, a * pa, tau, 0.0004, 0); burst(x, sr, r, t, 0.006, 'hp', 3000, 0.7, 0.15 * a, 0.0012); }
  fadeEdges(x, sr, 0, 0.08); return norm(x, 0.8);
}
function vendingDrop(sr, r) {              // short motor whirr, then ガコン (can hits the chute, bounces)
  const x = arr(sr, 1.2);
  addSwept(x, sr, 0, 0.3, (u) => 140 + 35 * u, (u) => 0.04 * Math.sin(Math.PI * u), [1, 0.5, 0.33, 0.25, 0.2, 0.16]);
  const T = 0.32;
  burst(x, sr, r, T, 0.03, 'bp', 900, 0.9, 0.6, 0.006);
  thump(x, sr, T, 105, 50, 0.07, 0.9);
  addDamped(x, sr, T, 430, 0.4, 0.1, 0.001); addDamped(x, sr, T, 1130, 0.22, 0.06, 0.001); addDamped(x, sr, T, 1890, 0.12, 0.035, 0.0008); addDamped(x, sr, T, 2650, 0.06, 0.02, 0.0005);
  const T2 = T + 0.12; thump(x, sr, T2, 90, 55, 0.05, 0.35); addDamped(x, sr, T2, 520, 0.25, 0.08, 0.001); addDamped(x, sr, T2, 1340, 0.1, 0.04, 0.001);
  const T3 = T2 + 0.09; addDamped(x, sr, T3, 610, 0.1, 0.05, 0.001); burst(x, sr, r, T3, 0.01, 'bp', 1500, 1, 0.05, 0.003);
  fadeEdges(x, sr, 0.002, 0.08); return norm(x, 0.9);
}

function synthKey(key, sr) {
  const r = prng(hashStr(key)); let m;
  if ((m = /^n:(\w+):(\d+)$/.exec(key))) return synthNote(sr, r, m[1], +m[2]);
  if ((m = /^sp(\d)$/.exec(key))) return sparrow(sr, r);
  if ((m = /^meow(\d)$/.exec(key))) return meow(sr, r, +m[1] % 3);
  if ((m = /^crow(\d)$/.exec(key))) return crow(sr, r, +m[1] % 2);
  if ((m = /^ugu(\d)$/.exec(key))) return uguisu(sr, r, +m[1] % 2);
  switch (key) {
    case 'white': return noiseLoop(sr, r, 3, 'white');
    case 'pink': return noiseLoop(sr, r, 5, 'pink');
    case 'brown': return noiseLoop(sr, r, 5, 'brown');
    case 'ir': return makeIR(sr, r);
    case 'bell0': return bell(sr, r, 760);
    case 'bell1': return bell(sr, r, 690);
    case 'clkHi': return click(sr, r, 1.12);
    case 'clkLo': return click(sr, r, 0.86);
    case 'doorOpen': return doorOpen(sr, r);
    case 'doorClose': return doorClose(sr, r);
    case 'airRel': return airRelease(sr, r);
    case 'bike': return bikeBell(sr, r);
    case 'vending': return vendingDrop(sr, r);
    default: throw new Error('audio: unknown buffer ' + key);
  }
}

// ---------------------------------------------------------------- music (original compositions)
/** 発車メロディ「さくら坂」— original, F major, 132 bpm, 4 bars + sparkle (~8 s). [time, instrument, midi, velocity] */
function departNotes() {
  const E = 60 / 132 / 2, out = [];
  const mel = [[0, 72], [1, 77], [2, 81], [3, 84], [4, 81], [6, 79], [7, 77], [8, 79], [9, 81], [10, 82], [11, 81], [12, 79], [14, 76], [15, 72],
    [16, 74], [17, 77], [18, 81], [19, 86], [20, 84], [22, 81], [23, 77], [24, 82], [25, 81], [26, 79], [27, 76], [28, 77]];
  for (const [e, m] of mel) { const acc = e % 4 === 0 ? 1 : 0.84; out.push([e * E, 'cel', m, 0.85 * acc], [e * E, 'box', m + 12, 0.16 * acc]); }
  out.push([29 * E, 'cel', 81, 0.34], [30 * E, 'cel', 84, 0.3], [31 * E, 'cel', 89, 0.3], [31 * E, 'box', 101, 0.12]);
  const chords = [[0, [65, 69, 72], 53], [4, [65, 69, 72], 57], [8, [64, 67, 72], 52], [12, [64, 67, 70], 48], [16, [62, 65, 69], 50], [20, [58, 62, 65], 46], [24, [64, 70, 72], 48], [28, [65, 69, 72], 53]];
  for (const [e, ch, b] of chords) { for (const m of ch) out.push([e * E + 0.004, 'ep', m, 0.2]); out.push([e * E, 'bass', b, 0.36]); }
  return out;
}
const DEPART = departNotes();
const CHIME_NOTES = [[0, 'vib', 72, 0.8], [0.34, 'vib', 76, 0.8], [0.68, 'vib', 79, 0.82], [1.02, 'vib', 84, 0.9]];   // ピンポンパンポーン
const DOOR_NOTES = [[0, 'vib', 83, 0.85], [0.4, 'vib', 79, 0.9]];                                                   // ピン・ポーン
/** café music box waltz「午後の窓辺」— original, G major, 3/4, 92 bpm, 16 bars (~31 s loop). events {b (beats), inst, midi, vel} */
function cafeSong() {
  const mel = [
    [[0, 74], [1, 79], [2, 83]], [[0, 81], [1.5, 79], [2, 76]], [[0, 76], [1, 79], [2, 84]], [[0, 83], [1, 81], [2, 78]],
    [[0, 79], [1, 74], [2, 71]], [[0, 74], [1, 78], [2, 83]], [[0, 81], [1, 79], [1.5, 76], [2, 72]], [[0, 74], [2, 78]],
    [[0, 79], [1, 83], [2, 79]], [[0, 76], [1, 79], [2, 84]], [[0, 86], [1, 83], [2, 79]], [[0, 81], [1, 78], [2, 74]],
    [[0, 76], [1, 84], [2, 83]], [[0, 81], [1, 79], [2, 78]], [[0, 79], [1, 71], [2, 74]], [[0, 79], [1.5, 91], [2, 86]]];
  const prog = ['G', 'Em', 'C', 'D', 'G', 'Bm', 'C', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'G', 'G'];
  const CH = { G: [43, [67, 71]], Em: [40, [64, 71]], C: [48, [64, 67]], D: [50, [66, 69]], Bm: [47, [66, 71]] };
  const ev = [];
  mel.forEach((bar, i) => {
    for (const [b, m] of bar) ev.push({ b: i * 3 + b, inst: 'box', midi: m, vel: m > 88 ? 0.35 : (i === 15 && b > 0 ? 0.4 : b === 0 ? 0.95 : 0.82) });
    const [bass, dy] = CH[prog[i]];
    ev.push({ b: i * 3, inst: 'bass', midi: bass, vel: 0.3 });
    for (const beat of [1, 2]) for (const m of dy) ev.push({ b: i * 3 + beat, inst: 'box', midi: m, vel: 0.26 });
  });
  return ev.sort((p, q) => p.b - q.b);
}
const CAFE = cafeSong();
/** rail joints every 25 m: the adjacent bogies of car 1 (rear) and car 2 (front) pass it -> ガタン・ゴトン.
 *  [offset along the train (m), buffer, amplitude, rate] */
const AXLES = [[0, 'clkHi', 0.8, 1.0], [2.1, 'clkHi', 1.0, 0.97], [5.6, 'clkLo', 0.78, 1.02], [7.7, 'clkLo', 0.95, 0.98]];
const JOINT = 25;

// =====================================================================================================
export function createAudio(options = {}) {
  const O = Object.assign({ context: null, ambience: true, speech: true, master: 0.85, muted: false, seed: 0x5a4b17, hrtf: true }, options && typeof options === 'object' ? options : {});
  const R = prng(Number(O.seed) >>> 0);
  R.pick = (a) => a[Math.floor(R() * a.length)];
  let ac = null, N = null, SR = 48000, offline = false, failed = false, lastCtl = -1, hooked = false;
  let masterVol = clamp(Number(O.master) || 0, 0, 2), muted = !!O.muted, srcLive = 0, hrtfLive = 0, suspendTimer = null, jaVoice = null, meterBuf = null;
  const LS = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 }, LA_ = { x: NaN };
  const handles = new Set(), voices = [], disposals = [], cache = new Map(), warm = [], warned = new Set();
  const CAP = { sfx: 16, bird: 5, town: 3 };
  const HRTF_VOICES = 8;                                   // one-shots using HRTF at once (the rest: equal-power)
  const SILENT = new Set(['footstep', 'footsteps', 'step']); // removed on purpose: accepted and ignored

  const warnOnce = (k, ...a) => { if (warned.has(k)) return; warned.add(k); try { console.warn('[audio]', ...a); } catch (e) { /* */ } };
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  // ------------------------------------------------------------ node helpers
  const G = (v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const BQ = (type, f, q = 0.707, db = 0) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (db) b.gain.value = db; return b; };
  const OSC = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  function NOISE(kind, t) { const s = ac.createBufferSource(); s.buffer = buf(kind); s.loop = true; s.start(Math.max(ac.currentTime, t === undefined ? 0 : t), R() * s.buffer.duration * 0.9); return s; }
  /** smooth control-rate parameter tracking (skips negligible changes) */
  function set(param, v, tc, now) {
    if (!Number.isFinite(v)) return;
    if (param._lv !== undefined && Math.abs(param._lv - v) <= Math.abs(v) * 0.002 + 1e-6) return;
    param._lv = v; param.setTargetAtTime(v, now, tc);
  }
  /** interrupting exponential approach from the current value (volume changes) */
  function glide(param, v, tc, t = ac.currentTime) {
    try {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
      param.setTargetAtTime(v, t, Math.max(0.003, tc));
    } catch (e) { try { param.value = v; } catch (e2) { /* */ } }
    param._lv = v;
  }
  /** linear ramp from the current value that reaches v exactly (mute / stop) */
  function ramp(param, v, dur, t = ac.currentTime) {
    try {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else { const cur = param.value; param.cancelScheduledValues(t); param.setValueAtTime(cur, t); }
      param.linearRampToValueAtTime(v, t + Math.max(0.005, dur));
    } catch (e) { try { param.value = v; } catch (e2) { /* */ } }
    param._lv = v;
  }
  function buf(key) {
    let b = cache.get(key); if (b) return b;
    const data = synthKey(key, SR), ch = Array.isArray(data) ? data : [data];
    b = ac.createBuffer(ch.length, ch[0].length, SR);
    ch.forEach((d, i) => b.getChannelData(i).set(d));
    cache.set(key, b); return b;
  }
  function setPP(p, v) {
    if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
  }
  function PAN(ref, roll, pos, hq) {
    const p = ac.createPanner();
    p.panningModel = hq && O.hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 10000;
    p.coneInnerAngle = 360; p.coneOuterAngle = 360;
    if (pos) setPP(p, pos);
    return p;
  }
  function resolvePos(p) {
    try { if (typeof p === 'function') p = p(); } catch (e) { return null; }
    if (!p || typeof p !== 'object') return null;
    if (Array.isArray(p)) { const v = { x: +p[0], y: +p[1], z: +p[2] }; return Number.isFinite(v.x) && Number.isFinite(v.z) ? { x: v.x, y: Number.isFinite(v.y) ? v.y : 1.5, z: v.z } : null; }
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) return Number.isFinite(p.y) ? p : { x: p.x, y: 1.5, z: p.z };
    return null;
  }
  const distTo = (p) => Math.hypot(p.x - LS.x, p.y - LS.y, p.z - LS.z);
  const airCut = (d) => clamp(19000 / Math.pow(1 + d / 40, 1.05), 1200, 20000);    // air absorption
  const farFade = (d, range) => sm((range - d) / (range * 0.6));                     // last 60 % of the range
  /** a scheduled buffer source that cleans itself up (loop sub-events: bell strikes, clicks, notes) */
  function playSrc(key, dest, t, gain = 1, rate = 1, cap = 96) {
    if (srcLive >= cap) return null;
    const s = ac.createBufferSource(); s.buffer = buf(key); s.playbackRate.value = rate;
    let g = null;
    if (gain !== 1) { g = G(gain); s.connect(g); g.connect(dest); } else s.connect(dest);
    srcLive++;
    s.onended = () => { srcLive = Math.max(0, srcLive - 1); try { s.disconnect(); if (g) g.disconnect(); } catch (e) { /* */ } };
    s.start(Math.max(t, ac.currentTime));
    return s;
  }

  // ------------------------------------------------------------ one-shot voices
  function voice(kind, { pos = null, dist = 0, gain = 1, ref = 3, roll = 1, wet = null, pa = false, bus = null, pan = 0, hq = false } = {}) {
    let n = 0, oldest = null;
    for (const v of voices) if (v.kind === kind && !v.dying) { n++; if (!oldest) oldest = v; }
    const now = ac.currentTime;
    if (n >= (CAP[kind] || 16)) {             // full: steal the oldest voice, but drop the newcomers of a burst (no churn)
      if (!oldest || now - oldest.born < 0.08) return null;
      killVoice(oldest);
    }
    const v = { kind, born: now, nodes: [], srcs: [], end: now + 0.25, tick: null, dying: false, panner: null, hrtf: false };
    const vg = G(gain); v.nodes.push(vg); v.out = vg; v.in = vg;
    let head = vg;
    if (pos) {
      if (dist > 22) { const lp = BQ('lowpass', airCut(dist), 0.5); head.connect(lp); head = lp; v.nodes.push(lp); }
      v.hrtf = !!(hq && O.hrtf && dist < 40 && hrtfLive < HRTF_VOICES); if (v.hrtf) hrtfLive++;
      const p = PAN(ref, roll, pos, v.hrtf); head.connect(p); p.connect(bus || N.sfx); if (wet) p.connect(wet);
      v.nodes.push(p); v.panner = p;
    } else if (pan && ac.createStereoPanner) {
      const sp = ac.createStereoPanner(); sp.pan.value = clamp(pan, -1, 1); head.connect(sp); sp.connect(bus || N.sfx); v.nodes.push(sp);
    } else head.connect(bus || N.sfx);
    if (pa) {   // platform PA speakers: band-limited, a little presence, a second speaker's slap
      const i = G(1), hp = BQ('highpass', 300, 0.6), hp2 = BQ('highpass', 300, 0.9), pk = BQ('peaking', 2600, 0.9, 3), lp = BQ('lowpass', 7200, 0.7), dl = ac.createDelay(0.2), dg = G(0.22);
      dl.delayTime.value = 0.052;
      i.connect(hp); hp.connect(hp2); hp2.connect(pk); pk.connect(lp); lp.connect(vg); i.connect(dl); dl.connect(dg); dg.connect(hp);
      v.nodes.push(i, hp, hp2, pk, lp, dl, dg); v.in = i;
    }
    voices.push(v);
    return v;
  }
  function vSrc(v, key, t, gain = 1, rate = 1, dest = v.in) {
    const b = buf(key), s = ac.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    if (gain !== 1) { const g = G(gain); s.connect(g); g.connect(dest); v.nodes.push(g); } else s.connect(dest);
    s.start(Math.max(t, ac.currentTime)); v.srcs.push(s);
    v.end = Math.max(v.end, t + b.duration / rate + 0.08);
    return s;
  }
  function killVoice(v) {
    if (!ac || v.dying) return;
    v.dying = true; const now = ac.currentTime;
    glide(v.out.gain, 0, 0.02, now);
    for (const s of v.srcs) { try { s.stop(now + 0.12); } catch (e) { /* */ } }
    v.tick = null; v.end = Math.min(v.end, now + 0.16);
  }
  function disposeVoice(v) {
    for (const s of v.srcs) { try { s.stop(); } catch (e) { /* */ } try { s.disconnect(); } catch (e) { /* */ } }
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* */ } }
    if (v.hrtf) { hrtfLive = Math.max(0, hrtfLive - 1); v.hrtf = false; }
    v.srcs.length = 0; v.nodes.length = 0; v.tick = null;
  }

  // ------------------------------------------------------------ one-shot definitions
  // gain: level at refDistance (inverse distance model beyond it); range: not started beyond this distance
  const SFX = {
    trainBrake: { ref: 12, range: 400, gain: 0.55, run: brakeVoice },
    doorChime: { ref: 4, range: 80, gain: 0.25, wet: 'lo', notes: () => DOOR_NOTES },
    doorOpen: { ref: 4, range: 90, gain: 0.55, wet: 'lo', buf: ['doorOpen'], jitter: 0.02 },
    doorClose: { ref: 4, range: 90, gain: 0.6, wet: 'lo', buf: ['doorClose'], jitter: 0.02 },
    departMelody: { ref: 8, range: 220, gain: 0.14, wet: 'hi', pa: true, notes: () => DEPART },
    announce: { ref: 8, range: 220, gain: 0.19, wet: 'hi', pa: true, notes: () => CHIME_NOTES, speech: 1.75 },
    bicycleBell: { ref: 3, range: 80, gain: 0.5, wet: 'lo', buf: ['bike'], jitter: 0.03 },
    catMeow: { ref: 2, range: 45, gain: 0.25, wet: 'lo', buf: ['meow0', 'meow1', 'meow2'], jitter: 0.06 },
    sparrow: { ref: 3, range: 60, gain: 0.45, wet: 'lo', buf: ['sp0', 'sp1', 'sp2', 'sp3', 'sp4', 'sp5'], jitter: 0.05 },
    vendingDrop: { ref: 2, range: 50, gain: 0.7, wet: 'lo', buf: ['vending'], jitter: 0.03 },
  };
  function play(name, o) {
    try {
      if (SILENT.has(name)) return null;
      if (!ac || failed || !N) return null;
      const def = hasOwn(SFX, name) ? SFX[name] : null;
      if (!def) { warnOnce('sfx:' + name, 'unknown sound', name); return null; }
      if (muted) return null;
      o = o && typeof o === 'object' ? o : {};
      const pos = resolvePos(o.position), dist = pos ? distTo(pos) : 0;
      if (pos && dist > def.range) return null;
      const vol = clamp(o.volume === undefined ? 1 : Number(o.volume) || 0, 0, 4);
      if (vol <= 0) return null;
      const now = ac.currentTime, t0 = now + 0.01;
      const fade = pos ? farFade(dist, def.range) : 1;
      if (def.run) return def.run({ pos, dist, vol: vol * fade, t0 });
      let hold = 0;
      if (name === 'announce') {   // the platform melody ducks under an announcement on the same platform, then comes back
        hold = def.speech + (o.text ? 0.6 + 0.14 * String(o.text).length : 0.9);
        for (const w of voices) {
          if (w.name !== 'departMelody' || w.dying || (pos && w.pos && Math.hypot(w.pos.x - pos.x, w.pos.z - pos.z) > 45)) continue;
          glide(w.out.gain, w.base * 0.3, 0.2, now);
          try { w.out.gain.setTargetAtTime(w.base, now + hold, 0.5); } catch (e) { /* */ }
        }
      }
      const v = voice('sfx', { pos, dist, gain: vol * def.gain * fade, ref: def.ref, roll: def.roll || 1, wet: pos && def.wet ? (def.wet === 'hi' ? N.wetHi : N.wetLo) : null, pa: def.pa, pan: Number(o.pan) || 0, hq: true });
      if (!v) return null;
      v.name = name; v.base = vol * def.gain * fade; v.pos = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
      if (def.buf) vSrc(v, R.pick(def.buf), t0, 1, 1 + (R() * 2 - 1) * (def.jitter || 0));
      if (def.notes) for (const [t, inst, midi, vel] of def.notes()) vSrc(v, `n:${inst}:${midi}`, t0 + t, vel, 1);
      if (def.speech && o.text) speakLater(String(o.text), pos, vol, def.speech + (t0 - now));
      return { stop: () => { try { killVoice(v); } catch (e) { /* */ } } };
    } catch (e) { warnOnce('play:' + name, 'play failed', name, e); return null; }
  }
  /** brake: friction hiss + squeal that follows the (linked) train's real speed, then clunk + air release */
  function brakeVoice({ pos, dist, vol, t0 }) {
    let link = null, best = 90;
    if (pos) for (const h of handles) if (h.name === 'trainRun' && h.impl && h.impl.lastPos && !h.stopped) { const d = Math.hypot(h.impl.lastPos.x - pos.x, h.impl.lastPos.z - pos.z); if (d < best) { best = d; link = h; } }
    const v = link ? voice('sfx', { gain: vol, bus: link.impl.in }) : voice('sfx', { pos, dist, gain: vol * SFX.trainBrake.gain, ref: 12, wet: N.wetLo, hq: true });
    if (!v) return null;
    if (link) v.out.gain.value = vol * SFX.trainBrake.gain / Math.max(0.05, link.vol || 1);   // the loop's own volume applies after
    v.name = 'trainBrake';
    const sq = OSC('sine', 3100), sq2 = OSC('sine', 6230), lfo = OSC('sine', 6.3), lfoG = G(22), lfoG2 = G(44), sqG = G(0), sq2G = G(0.22);
    lfo.connect(lfoG); lfoG.connect(sq.frequency); lfo.connect(lfoG2); lfoG2.connect(sq2.frequency);
    sq.connect(sqG); sq2.connect(sq2G); sq2G.connect(sqG); sqG.connect(v.in);
    const fr = NOISE('pink', t0), frBp = BQ('bandpass', 1500, 0.6), frG = G(0); fr.connect(frBp); frBp.connect(frG); frG.connect(v.in);
    for (const o of [sq, sq2, lfo]) o.start(t0);
    v.srcs.push(sq, sq2, lfo, fr); v.nodes.push(lfoG, lfoG2, sqG, sq2G, frBp, frG);
    v.end = t0 + 40;
    const st = { seen: false, done: false };
    v.tick = (now) => {
      const el = now - t0;
      const sp = link && !link.stopped ? Math.max(0, +link.params.speed || 0) : Math.max(0, 8 - 0.75 * el);
      if (sp > 0.5) st.seen = true;
      if (!st.done && ((st.seen && sp < 0.05) || el > 30 || (!st.seen && el > 3))) {
        st.done = true;
        glide(sqG.gain, 0, 0.03, now); glide(frG.gain, 0, 0.06, now);
        vSrc(v, 'airRel', now + 0.08, 0.8, 1);
        for (const o of [sq, sq2, lfo, fr]) { try { o.stop(now + 0.4); } catch (e) { /* */ } }
        v.end = now + 3.2; v.tick = null; return;
      }
      set(frG.gain, sp > 0.1 ? 0.05 + 0.08 * clamp01(sp / 8) : 0, 0.15, now); set(frBp.frequency, 900 + 90 * sp, 0.2, now);
      const q = sp < 4.6 && sp > 0.08 ? sm((4.6 - sp) / 2.4) : 0;
      const wob = 0.72 + 0.2 * Math.sin(TAU * 2.1 * el) + 0.08 * Math.sin(TAU * 5.3 * el + 1);
      set(sqG.gain, 0.08 * q * wob, 0.05, now);
      const f = 3020 + 160 * (1 - clamp01(sp / 4.6)) + 70 * Math.sin(TAU * 0.4 * el);
      set(sq.frequency, f, 0.1, now); set(sq2.frequency, f * 2.012, 0.1, now);
    };
    return { stop: () => { try { killVoice(v); } catch (e) { /* */ } } };
  }

  // ------------------------------------------------------------ speech (announce)
  function pickVoice() {
    const ss = globalThis.speechSynthesis; if (!ss || !ss.getVoices) return null;
    const ja = (ss.getVoices() || []).filter((v) => /^ja/i.test(v.lang || ''));
    if (!ja.length) return null;
    for (const re of [/nanami/i, /haruka/i, /ayumi/i, /kyoko/i, /mizuki/i, /google/i, /female/i]) { const v = ja.find((x) => re.test(x.name || '')); if (v) return v; }
    return ja[0];
  }
  function initSpeech() {
    if (!O.speech || offline) return;
    try {
      const ss = globalThis.speechSynthesis; if (!ss) return;
      jaVoice = pickVoice();
      if (ss.addEventListener) ss.addEventListener('voiceschanged', () => { try { jaVoice = pickVoice(); } catch (e) { /* */ } });
    } catch (e) { /* speech optional */ }
  }
  function cancelSpeech() { try { if (globalThis.speechSynthesis) globalThis.speechSynthesis.cancel(); } catch (e) { /* */ } }
  function speakLater(text, pos, vol, delay) {
    if (!O.speech || offline || typeof setTimeout !== 'function') return;
    const p = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
    setTimeout(() => {
      try {
        const ss = globalThis.speechSynthesis, U = globalThis.SpeechSynthesisUtterance;
        if (!ss || !U || muted || hidden() || !ac || ac.state !== 'running') return;
        const v = jaVoice || (jaVoice = pickVoice()); if (!v) return;       // no Japanese voice -> silent
        const d = p ? distTo(p) : 0, att = p ? 10 / (10 + Math.max(0, d - 10)) : 1;
        const g = clamp(vol * masterVol * att * 0.7, 0, 0.55); if (g < 0.04) return;
        const u = new U(text); u.voice = v; u.lang = v.lang || 'ja-JP'; u.rate = 0.96; u.pitch = 1.08; u.volume = g;
        if (ss.speaking || ss.pending) ss.cancel();
        ss.speak(u);
      } catch (e) { /* fail silently */ }
    }, Math.max(0, delay * 1000));
  }

  // ------------------------------------------------------------ loops
  // ref / roll: PannerNode distance model; range: silent (and asleep) beyond it, fading over its last 60 %
  const LOOPS = {
    wind: { amb: true, build: buildWind },
    birds: { amb: true, build: buildBirds },
    town: { amb: true, build: buildTown },
    crossingBell: { ref: 6, roll: 1, range: 300, wet: 'hi', build: buildBell },
    trainRun: { ref: 10, roll: 1, range: 600, wet: 'lo', build: buildTrain },
    cafeMusic: { ref: 3, roll: 1.1, range: 45, wet: 'hi', build: buildCafe },
  };
  function bind(h) {
    const def = LOOPS[h.name], now = ac.currentTime;
    const I = { def, h, nodes: [], srcs: [], sends: [], tick: null, setParam: null, audible: true, awake: true, quiet: 0, dist: 0, lastPos: null, panner: null, lastT: now, errs: 0 };
    I.in = G(1); I.vg = G(0); I.in.connect(I.vg); I.nodes.push(I.in, I.vg);
    glide(I.vg.gain, h.vol, def.amb ? 0.8 : 0.03, now);
    /** extra output of the loop (e.g. a reverb send) whose level follows the loop volume */
    I.send = (dest, level) => { const s = G(0); s.connect(dest); I.nodes.push(s); I.sends.push([s, level]); glide(s.gain, h.vol * level, 0.05, now); return s; };
    const pos = def.amb ? null : resolvePos(h.pos);
    if (!pos) I.vg.connect(def.amb ? N.amb : N.sfx);
    else {
      I.fg = G(1); I.air = BQ('lowpass', 20000, 0.5); I.panner = PAN(def.ref, def.roll, null, true);
      I.vg.connect(I.fg); I.fg.connect(I.air); I.air.connect(I.panner); I.panner.connect(N.sfx);
      if (def.wet) I.panner.connect(def.wet === 'hi' ? N.wetHi : N.wetLo);
      I.nodes.push(I.fg, I.air, I.panner);
      placeLoop(I, now, true);
    }
    try { def.build(I, now); } catch (e) { disposeLoop(I); throw e; }
    if (h.stopped) { disposeLoop(I); return; }
    h.impl = I;
  }
  function volTo(I, v, tc) {
    glide(I.vg.gain, v, tc);
    for (const [s, level] of I.sends) glide(s.gain, v * level, tc);
  }
  function placeLoop(I, now, first) {
    const p = resolvePos(I.h.pos);
    if (!p) { I.audible = I.lastPos !== null && I.h.vol > 1e-4; return; }
    if (!I.lastPos || Math.abs(p.x - I.lastPos.x) + Math.abs(p.y - I.lastPos.y) + Math.abs(p.z - I.lastPos.z) > 0.01) { setPP(I.panner, p); I.lastPos = { x: p.x, y: p.y, z: p.z }; }
    const d = distTo(p), range = I.def.range || 500, fade = farFade(d, range), fc = airCut(d);
    I.dist = d;
    if (first) { I.fg.gain.value = fade; I.fg.gain._lv = fade; I.air.frequency.value = fc; I.air.frequency._lv = fc; } else { set(I.fg.gain, fade, 0.2, now); set(I.air.frequency, fc, 0.15, now); }
    I.audible = fade > 0.001 && I.h.vol > 1e-4;
  }
  /** asleep = the loop's sources are disconnected so the browser stops pulling (processing) them */
  function setAwake(I, on) {
    if (I.awake === on) return;
    I.awake = on;
    try { if (on) I.in.connect(I.vg); else I.in.disconnect(); } catch (e) { /* */ }
  }
  function disposeLoop(I) {
    I.tick = null; I.setParam = null;
    for (const s of I.srcs) { try { s.stop(); } catch (e) { /* */ } try { s.disconnect(); } catch (e) { /* */ } }
    for (const n of I.nodes) { try { n.disconnect(); } catch (e) { /* */ } }
    I.srcs.length = 0; I.nodes.length = 0; I.sends.length = 0;
  }
  function retire(I, fadeS) {       // fade a bound loop out, dispose it a little later
    const now = ac.currentTime; I.tick = null; I.setParam = null;
    ramp(I.vg.gain, 0, fadeS, now); for (const [s] of I.sends) ramp(s.gain, 0, fadeS, now);
    disposals.push({ at: now + fadeS + 0.25, I });
  }
  function loop(name, o) {
    const h = { name, vol: 0, params: {}, pos: null, stopped: false, impl: null };
    const handle = {
      get name() { return name; },
      get volume() { return h.vol; },
      get stopped() { return h.stopped; },
      setVolume(v, rampS = 0.1) {
        try {
          h.vol = clamp(Number(v) || 0, 0, 4);
          const I = h.impl;
          if (I && ac) { volTo(I, h.vol, Math.max(0.004, (Number(rampS) || 0) / 3)); if (h.vol > 1e-4 && (!I.panner || I.dist < (I.def.range || 500))) { I.quiet = 0; setAwake(I, true); } }
        } catch (e) { warnOnce('setVolume:' + name, 'setVolume failed', name, e); }
      },
      setParam(k, v) {
        try { h.params[k] = v; if (h.impl && h.impl.setParam) h.impl.setParam(k, v); } catch (e) { warnOnce('setParam:' + name, 'setParam failed', name, e); }
      },
      setPosition(p) {
        try {
          h.pos = p;
          const I = h.impl;
          if (I && ac && !h.stopped && !I.panner && !I.def.amb && resolvePos(p)) { h.impl = null; retire(I, 0.05); bind(h); }   // non-spatial -> spatial
        } catch (e) { warnOnce('setPosition:' + name, 'setPosition failed', name, e); }
      },
      stop() {
        try {
          if (h.stopped) return; h.stopped = true; handles.delete(h);
          const I = h.impl; h.impl = null;
          if (I && ac) retire(I, 0.15);
        } catch (e) { warnOnce('stop:' + name, 'stop failed', name, e); }
      },
    };
    try {
      o = o && typeof o === 'object' ? o : {};
      h.vol = clamp(o.volume === undefined ? 1 : Number(o.volume) || 0, 0, 4);
      h.params = Object.assign({}, o.params && typeof o.params === 'object' ? o.params : {});
      h.pos = o.position || null;
      if (!hasOwn(LOOPS, name)) { if (!SILENT.has(name)) warnOnce('loop:' + name, 'unknown loop', name); h.stopped = true; return handle; }
      handles.add(h);
      if (ac && N && !failed) { try { bind(h); } catch (e) { warnOnce('bind:' + name, 'loop failed', name, e); } }
    } catch (e) { warnOnce('loop:' + name, 'loop failed', name, e); }
    return handle;
  }

  // ---- wind: two decorrelated pink-noise bands (gust-driven cutoff/level) + leaf rustle + low body
  function buildWind(I, now) {
    const m = ac.createChannelMerger(2), hp = BQ('highpass', 110, 0.6); m.connect(hp); hp.connect(I.in); I.nodes.push(m, hp);
    const mk = (kind, type, f, q, ch) => { const s = NOISE(kind, now), fl = BQ(type, f, q), g = G(0); s.connect(fl); fl.connect(g); g.connect(m, 0, ch); I.srcs.push(s); I.nodes.push(fl, g); return { fl, g }; };
    const wL = mk('pink', 'lowpass', 400, 0.5, 0), wR = mk('pink', 'lowpass', 420, 0.5, 1);
    const rL = mk('white', 'bandpass', 4200, 0.55, 0), rR = mk('white', 'bandpass', 5300, 0.55, 1);
    const body = mk('brown', 'lowpass', 140, 0.6, 0); body.g.connect(m, 0, 1);
    let gs = 0.5, gr = 0.5;
    I.tick = (t, dt) => {
      const g = clamp01(gustNow(t));
      gs += (g - gs) * Math.min(1, dt * 1.6); gr += (g - gr) * Math.min(1, dt * 0.9);
      const f1 = 0.62 + 0.38 * (0.5 + 0.5 * (0.6 * Math.sin(t * 9.1) + 0.4 * Math.sin(t * 14.3 + 1.3)));
      const f2 = 0.62 + 0.38 * (0.5 + 0.5 * (0.6 * Math.sin(t * 8.3 + 2) + 0.4 * Math.sin(t * 12.7 + 0.2)));
      set(wL.fl.frequency, 230 + 850 * Math.pow(gs, 1.6), 0.2, t); set(wR.fl.frequency, 250 + 800 * Math.pow(gr, 1.6), 0.2, t);
      set(wL.g.gain, 0.014 + 0.085 * gs * gs, 0.25, t); set(wR.g.gain, 0.014 + 0.085 * gr * gr, 0.25, t);
      set(rL.g.gain, (0.0035 + 0.024 * gs * gs) * f1, 0.05, t); set(rR.g.gain, (0.0035 + 0.024 * gr * gr) * f2, 0.05, t);
      set(body.g.gain, 0.008 + 0.026 * gs * gs, 0.3, t);
    };
  }
  function gustNow(t) {   // the core's visual gust (window.__ctx.shared.uGust) so audible gusts match swaying trees
    try { const c = globalThis.__ctx, g = c && c.shared && c.shared.uGust && c.shared.uGust.value; if (Number.isFinite(g)) return g; } catch (e) { /* */ }
    t += 14; return 0.5 + 0.28 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 1.13 + 1.7) + 0.08 * Math.sin(t * 2.9 + 0.4);
  }

  // ---- birds: sparrows around the listener + an occasional distant bush warbler
  function buildBirds(I, now) {
    const wet = I.send(N.wetAmb, 0.5);
    const st = { sp: now + R.range(0.6, 2.2), ug: now + R.range(5, 9), ugPos: null };
    const around = (d0, d1, h0, h1) => { const az = R() * TAU, d = R.range(d0, d1); return { x: LS.x + Math.cos(az) * d, y: LS.y + R.range(h0, h1), z: LS.z + Math.sin(az) * d }; };
    const spawn = (key, t, pos, ref, gain, rate) => { const v = voice('bird', { pos, dist: distTo(pos), gain, ref, bus: I.in, wet }); if (v) vSrc(v, key, t, 1, rate); };
    I.tick = (t, dt, _d, aud) => {
      if (st.sp < t - 1) st.sp = t + 0.4;
      if (st.ug < t - 1) st.ug = t + 4;
      if (!aud) return;
      if (st.sp <= t + LA) {
        spawn('sp' + Math.floor(R() * 6), st.sp, around(5, 24, 2.5, 8), 3, R.range(0.2, 0.38), R.range(0.93, 1.08));
        if (R() < 0.4) spawn('sp' + Math.floor(R() * 6), st.sp + R.range(0.35, 1.0), around(6, 26, 2.5, 8), 3, R.range(0.15, 0.3), R.range(0.95, 1.1));
        st.sp += R() < 0.18 ? R.range(5, 11) : R.range(0.9, 4.0);
      }
      if (st.ug <= t + LA) {
        const again = st.ugPos && R() < 0.4;
        const pos = again ? st.ugPos : around(26, 58, 4, 11);
        spawn(R() < 0.65 ? 'ugu0' : 'ugu1', st.ug, pos, 7, R.range(0.32, 0.42), R.range(0.97, 1.03));
        st.ugPos = pos;
        st.ug += again ? R.range(24, 50) : (R() < 0.45 ? R.range(6, 9) : R.range(24, 50));
      }
    };
  }

  // ---- town: distant low murmur/traffic bed + rare far events (car, moped, crows, a bicycle bell)
  function buildTown(I, now) {
    const m = ac.createChannelMerger(2); m.connect(I.in); I.nodes.push(m);
    const wet = I.send(N.wetAmb, 1);
    const hum = (ch) => { const s = NOISE('brown', now), lp = BQ('lowpass', 420, 0.5), hp = BQ('highpass', 80, 0.6), g = G(0); s.connect(lp); lp.connect(hp); hp.connect(g); g.connect(m, 0, ch); I.srcs.push(s); I.nodes.push(lp, hp, g); return g; };
    const hL = hum(0), hR = hum(1);
    const tr = NOISE('pink', now), bp = BQ('bandpass', 620, 0.55), tg = G(0); tr.connect(bp); bp.connect(tg); tg.connect(m, 0, 0); tg.connect(m, 0, 1);
    I.srcs.push(tr); I.nodes.push(bp, tg);
    const st = { ev: now + R.range(4, 9) };
    I.tick = (t, dt, _d, aud) => {
      const s1 = 0.5 + 0.5 * Math.sin(t * 0.061 + 1), s2 = 0.5 + 0.5 * Math.sin(t * 0.047);
      set(hL.gain, 0.019 + 0.008 * s1, 0.5, t); set(hR.gain, 0.019 + 0.008 * s2, 0.5, t); set(tg.gain, 0.005 + 0.006 * s1 * s2, 0.5, t);
      if (st.ev < t - 2) st.ev = t + 2;
      if (!aud) return;
      if (st.ev <= t + LA) { townEvent(I, st.ev, wet); st.ev += R.range(9, 24); }
    };
  }
  function townEvent(I, t, wet) {
    const r = R();
    if (r < 0.42) passBy(I, t, false);
    else if (r < 0.56) passBy(I, t, true);
    else if (r < 0.86) {
      const az = R() * TAU, d = R.range(60, 120), pos = { x: LS.x + Math.cos(az) * d, y: LS.y + R.range(10, 25), z: LS.z + Math.sin(az) * d };
      const v = voice('town', { pos, dist: distTo(pos), gain: 0.45, ref: 12, bus: I.in, wet }); if (v) vSrc(v, R() < 0.6 ? 'crow0' : 'crow1', t, 1, R.range(0.95, 1.05));
    } else {
      const az = R() * TAU, d = R.range(25, 45), pos = { x: LS.x + Math.cos(az) * d, y: 1.1, z: LS.z + Math.sin(az) * d };
      const v = voice('town', { pos, dist: distTo(pos), gain: 0.22, ref: 3, bus: I.in, wet }); if (v) vSrc(v, 'bike', t, 1, R.range(0.96, 1.04));
    }
  }
  function passBy(I, t, moped) {      // a vehicle passing on a far street: moving panner, faded envelope
    const dur = moped ? R.range(6, 8) : R.range(5.5, 7.5), az = R() * TAU, dx = Math.cos(az), dz = Math.sin(az), off = R.range(40, 75), half = R.range(45, 70);
    const cx = LS.x - dz * off, cz = LS.z + dx * off;
    const a = { x: cx - dx * half, y: 1, z: cz - dz * half }, b = { x: cx + dx * half, y: 1, z: cz + dz * half };
    const v = voice('town', { pos: a, dist: Math.hypot(off, half), gain: moped ? 0.22 : 0.4, ref: 10, bus: I.in });
    if (!v) return;
    const P = v.panner;
    if (P && P.positionX) { P.positionX.setValueAtTime(a.x, t); P.positionX.linearRampToValueAtTime(b.x, t + dur); P.positionZ.setValueAtTime(a.z, t); P.positionZ.linearRampToValueAtTime(b.z, t + dur); }
    const eg = G(0); eg.gain.setValueAtTime(0, t); eg.gain.linearRampToValueAtTime(1, t + 1.2); eg.gain.setValueAtTime(1, t + dur - 1.2); eg.gain.linearRampToValueAtTime(0, t + dur);
    eg.connect(v.in); v.nodes.push(eg);
    if (!moped) {
      const s = NOISE('pink', t), lp = BQ('lowpass', 600, 0.6), h = NOISE('white', t), hb = BQ('bandpass', 2400, 0.8), hg = G(0.1);
      s.connect(lp); lp.connect(eg); h.connect(hb); hb.connect(hg); hg.connect(eg);
      v.srcs.push(s, h); v.nodes.push(lp, hb, hg);
    } else {
      const o = OSC('sawtooth', 97), lp = BQ('lowpass', 750, 0.9), og = G(0.35), w = OSC('sine', 7), wg = G(2.5);
      o.frequency.setValueAtTime(97, t); o.frequency.linearRampToValueAtTime(84, t + dur);
      w.connect(wg); wg.connect(o.frequency); o.connect(lp); lp.connect(og); og.connect(eg); o.start(t); w.start(t);
      v.srcs.push(o, w); v.nodes.push(lp, og, wg);
    }
    for (const s of v.srcs) s.stop(t + dur + 0.1);
    v.end = t + dur + 0.3;
  }

  // ---- crossing bell: カン・カン, ~2 strikes/s alternating two pitches
  function buildBell(I) {
    const g = G(0.62), hp = BQ('highpass', 320, 0.7), lp = BQ('lowpass', 6000, 0.6);
    g.connect(hp); hp.connect(lp); lp.connect(I.in); I.nodes.push(g, hp, lp);
    const st = { next: null, i: 0 };
    I.tick = (t, dt, d, aud) => {
      if (!aud || I.h.vol <= 1e-3) { st.next = null; return; }
      if (st.next === null || st.next < t - 0.25) st.next = t + 0.015;
      while (st.next <= t + LA) { playSrc(st.i & 1 ? 'bell1' : 'bell0', g, st.next, 1, 1 + (R() - 0.5) * 0.004); st.i++; st.next += 0.5 * (1 + (R() - 0.5) * 0.008); }
    };
  }

  // ---- train running: rolling noise + inverter whine + gear hum + idle aux + rail-joint ガタンゴトン
  function buildTrain(I, now) {
    const out = I.in;
    const chain = (src, f, g) => { src.connect(f); f.connect(g); g.connect(out); I.nodes.push(f, g); return g; };
    const roll = NOISE('brown', now), rollLp = BQ('lowpass', 150, 0.6), rollG = chain(roll, rollLp, G(0));
    const roar = NOISE('pink', now), roarBp = BQ('bandpass', 600, 0.7), roarG = chain(roar, roarBp, G(0));
    const hiss = NOISE('white', now), hissHp = BQ('highpass', 3800, 0.6), hissG = chain(hiss, hissHp, G(0));
    const w1 = OSC('triangle', 300), w1G = G(0); w1.connect(w1G); w1G.connect(out);
    const w2 = OSC('sawtooth', 600), w2Lp = BQ('lowpass', 2200, 0.7), w2G = chain(w2, w2Lp, G(0));
    const gear = OSC('sine', 60), gearG = G(0); gear.connect(gearG); gearG.connect(out);
    const idle = OSC('sine', 118), idle2 = OSC('triangle', 236), idleG = G(0), idle2G = G(0.35); idle.connect(idleG); idle2.connect(idle2G); idle2G.connect(idleG); idleG.connect(out);
    const fan = NOISE('pink', now), fanLp = BQ('lowpass', 520, 0.5), fanG = chain(fan, fanLp, G(0));
    for (const o of [w1, w2, gear, idle, idle2]) o.start(now);
    const clat = G(1); clat.connect(out);
    I.srcs.push(roll, roar, hiss, fan, w1, w2, gear, idle, idle2); I.nodes.push(w1G, gearG, idleG, idle2G, clat);
    const st = { v: 0, vS: null, acc: 0, dop: 1, dPrev: null, s: R() * JOINT, sched: null, pend: [] };
    I.setParam = (k, val) => { if (k === 'speed') st.v = clamp(Number(val) || 0, 0, 40); };
    I.setParam('speed', I.h.params.speed);
    I.tick = (t, dt, dist, aud) => {
      const v = st.v;
      if (dt > 0) {
        if (st.vS === null) st.vS = v;
        const a = (v - st.vS) / dt; if (Math.abs(a) < 6) st.acc += (a - st.acc) * Math.min(1, dt * 2.2); st.vS = v;
        if (st.dPrev !== null && Math.abs(dist - st.dPrev) < 2.5) { const vr = clamp((st.dPrev - dist) / dt, -35, 35); st.dop += (343 / (343 - vr) - st.dop) * Math.min(1, dt * 5); }
      }
      st.dPrev = dist;
      if (!aud) { st.pend.length = 0; st.sched = null; return; }
      const dop = clamp(st.dop, 0.9, 1.12), vn = Math.min(1.3, v / 20);
      const trac = clamp01(Math.abs(st.acc) / 0.65) * clamp01(v / 1.0), cruise = clamp01(v / 6) * 0.12;
      set(rollG.gain, 0.3 * Math.pow(vn, 1.1), 0.1, t); set(rollLp.frequency, (110 + 26 * v) * dop, 0.1, t);
      set(roarG.gain, 0.11 * Math.pow(vn, 1.6), 0.1, t); set(roarBp.frequency, (420 + 28 * v) * dop, 0.1, t);
      set(hissG.gain, 0.035 * Math.pow(vn, 2.2), 0.1, t);
      const fw = (240 + 56 * v) * dop, wg = v > 0.05 ? trac * 0.8 + cruise : 0;
      set(w1.frequency, fw, 0.06, t); set(w2.frequency, fw * 2.006, 0.06, t);
      set(w1G.gain, 0.05 * wg, 0.12, t); set(w2G.gain, 0.012 * wg, 0.12, t);
      set(gear.frequency, Math.max(18, 15.5 * v) * dop, 0.06, t); set(gearG.gain, 0.05 * clamp01(v / 8) * (0.45 + 0.55 * trac), 0.12, t);
      const idl = 1 - clamp01(v / 6);
      set(idleG.gain, 0.005 + 0.008 * idl, 0.3, t); set(fanG.gain, 0.013 + 0.022 * idl, 0.3, t);
      // rail joints: every JOINT metres of travel the axle group passes one; the rhythm follows the speed
      if (st.sched === null || st.sched < t - 0.3) st.sched = t;
      const until = t + LA;
      if (v > 0.3) {
        const s1 = st.s + v * (until - st.sched);
        for (let j = Math.floor(st.s / JOINT) + 1; j <= Math.floor(s1 / JOINT); j++) {
          const tj = st.sched + (j * JOINT - st.s) / v, amp = 0.36 * clamp(v / 9, 0.25, 1.2) * (1 + 0.5 * clamp01((v - 10) / 10));
          for (const [off, key, a, rate] of AXLES) if (st.pend.length < 64) st.pend.push({ t: tj + off / v, key, amp: amp * a, rate });
        }
        st.s = s1 % (JOINT * 1000);
      } else st.pend.length = 0;
      st.sched = until;
      for (let i = st.pend.length - 1; i >= 0; i--) {
        const c = st.pend[i];
        if (c.t <= until) { st.pend.splice(i, 1); if (c.t > t - 0.05) playSrc(c.key, clat, c.t, c.amp * (0.88 + 0.24 * R()), c.rate * dop * (0.97 + 0.06 * R())); }
      }
    };
  }

  // ---- café: music-box waltz sequenced from cached note buffers, muffled by the window
  function buildCafe(I, now) {
    const g = G(0.3), lp = BQ('lowpass', 3600, 0.6), hp = BQ('highpass', 150, 0.6); g.connect(hp); hp.connect(lp); lp.connect(I.in); I.nodes.push(g, lp, hp);
    const spb = 60 / 92, LB = 48, st = { t0: now + 0.3, pass: 0, idx: 0 };
    const at = (k, p) => st.t0 + (p * LB + CAFE[k].b) * spb;
    I.tick = (t, dt, d, aud) => {
      if (at(st.idx, st.pass) < t - 0.5) {      // fell behind (asleep / suspended): jump to the current bar
        const beats = (t - st.t0) / spb; st.pass = Math.floor(beats / LB);
        const rem = beats - st.pass * LB; st.idx = CAFE.findIndex((e) => e.b >= rem); if (st.idx < 0) { st.idx = 0; st.pass++; }
      }
      for (let guard = 0; guard < 48; guard++) {
        const tt = at(st.idx, st.pass); if (tt > t + LA) break;
        const e = CAFE[st.idx];
        if (aud && tt >= t - 0.03) playSrc(`n:${e.inst}:${e.midi}`, g, tt + (R() - 0.5) * 0.012, e.vel * (0.9 + 0.2 * R()), 1, 80);
        if (++st.idx >= CAFE.length) { st.idx = 0; st.pass++; }
      }
    };
  }

  // ------------------------------------------------------------ graph, start, update
  const PREWARM = (() => {
    const k = ['sp0', 'sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'ugu0', 'ugu1', 'bike', 'crow0', 'crow1',
      'meow0', 'meow1', 'meow2', 'vending', 'doorOpen', 'doorClose', 'airRel'];
    const notes = new Set();
    for (const e of CAFE) notes.add(`n:${e.inst}:${e.midi}`);
    for (const [, i, m] of [...CHIME_NOTES, ...DOOR_NOTES, ...DEPART]) notes.add(`n:${i}:${m}`);
    return k.concat([...notes]);
  })();
  function buildGraph() {
    N = {};
    // HRTF database: load it now. (Chromium: a first HRTF panner created while an OfflineAudioContext is
    // suspended mid-render can stall that render forever; creating one up front avoids it.)
    if (O.hrtf) { try { N.hrtfWarm = ac.createPanner(); N.hrtfWarm.panningModel = 'HRTF'; } catch (e) { /* */ } }
    N.sfx = G(1); N.amb = G(1); N.bus = G(1);
    N.rvIn = G(1); N.conv = ac.createConvolver(); N.conv.buffer = buf('ir'); N.rvOut = G(0.8);
    N.wetLo = G(0.12); N.wetHi = G(0.3); N.wetAmb = G(0.2);
    N.wetLo.connect(N.rvIn); N.wetHi.connect(N.rvIn); N.wetAmb.connect(N.rvIn);
    N.rvIn.connect(N.conv); N.conv.connect(N.rvOut); N.rvOut.connect(N.bus);
    N.sfx.connect(N.bus); N.amb.connect(N.bus);
    N.master = G(masterVol);
    N.comp = ac.createDynamicsCompressor();       // glue + peak control (adds ~+4 dB make-up below threshold)
    N.comp.threshold.value = -10; N.comp.knee.value = 8; N.comp.ratio.value = 4; N.comp.attack.value = 0.002; N.comp.release.value = 0.25;
    N.pre = G(0.25); N.clip = ac.createWaveShaper(); N.clip.curve = clipCurve(); N.clip.oversample = 'none';   // hard ceiling 0.97
    N.mute = G(muted ? 0 : 1);
    N.bus.connect(N.master); N.master.connect(N.comp); N.comp.connect(N.pre); N.pre.connect(N.clip); N.clip.connect(N.mute); N.mute.connect(ac.destination);
    N.meter = ac.createAnalyser(); N.meter.fftSize = 2048; N.mute.connect(N.meter);
  }
  function hookPage() {
    if (hooked || typeof document === 'undefined' || !document.addEventListener) return;
    hooked = true;
    document.addEventListener('visibilitychange', () => {
      try {
        if (!ac || offline) return;
        if (hidden()) { ac.suspend().catch(() => {}); cancelSpeech(); } else if (!muted) ac.resume().catch(() => {});
      } catch (e) { /* */ }
    });
  }
  function start() {
    try {
      if (failed) return;
      if (ac) { if (!offline && ac.state !== 'running' && !muted && !hidden()) ac.resume().catch(() => {}); return; }
      if (O.context) ac = O.context;
      else {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { failed = true; return; }
        try { ac = new AC({ latencyHint: 'balanced' }); } catch (e) { ac = new AC(); }
      }
      offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
      SR = ac.sampleRate;
      for (const k of ['white', 'pink', 'brown', 'bell0', 'bell1', 'clkHi', 'clkLo']) buf(k);
      buildGraph();
      applyListener(true);
      warm.push(...PREWARM);
      if (O.ambience) for (const n of ['wind', 'birds', 'town']) loop(n, { volume: 1 });
      for (const h of handles) if (!h.impl && !h.stopped) { try { bind(h); } catch (e) { warnOnce('bind:' + h.name, 'loop failed', h.name, e); } }
      if (!offline) { if (ac.state !== 'running' && !muted) ac.resume().catch(() => {}); hookPage(); if (muted) applyMute(); }
      initSpeech();
    } catch (e) {
      warnOnce('start', 'start failed', e);
      failed = true; N = null;
      try { if (ac && !O.context && ac.close) ac.close(); } catch (e2) { /* */ }
      ac = null;
    }
  }
  function readCam(camera) {
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    const e = camera.matrixWorld && camera.matrixWorld.elements;
    if (e && Number.isFinite(e[12]) && Number.isFinite(e[14])) {
      LS.x = e[12]; LS.y = e[13]; LS.z = e[14];
      const fl = Math.hypot(e[8], e[9], e[10]) || 1, ul = Math.hypot(e[4], e[5], e[6]) || 1;
      LS.fx = -e[8] / fl; LS.fy = -e[9] / fl; LS.fz = -e[10] / fl; LS.ux = e[4] / ul; LS.uy = e[5] / ul; LS.uz = e[6] / ul;
    } else if (camera.position && Number.isFinite(camera.position.x)) { LS.x = camera.position.x; LS.y = camera.position.y; LS.z = camera.position.z; }
  }
  function applyListener(force) {
    if (!force && Math.abs(LS.x - LA_.x) + Math.abs(LS.y - LA_.y) + Math.abs(LS.z - LA_.z) < 0.004 &&
      Math.abs(LS.fx - LA_.fx) + Math.abs(LS.fy - LA_.fy) + Math.abs(LS.fz - LA_.fz) + Math.abs(LS.ux - LA_.ux) + Math.abs(LS.uy - LA_.uy) + Math.abs(LS.uz - LA_.uz) < 0.002) return;
    Object.assign(LA_, LS);
    const l = ac.listener;
    if (l.positionX) {
      l.positionX.value = LS.x; l.positionY.value = LS.y; l.positionZ.value = LS.z;
      l.forwardX.value = LS.fx; l.forwardY.value = LS.fy; l.forwardZ.value = LS.fz;
      l.upX.value = LS.ux; l.upY.value = LS.uy; l.upZ.value = LS.uz;
    } else { l.setPosition(LS.x, LS.y, LS.z); l.setOrientation(LS.fx, LS.fy, LS.fz, LS.ux, LS.uy, LS.uz); }
  }
  /** control-rate work: loop placement / sleep / sequencing, voice ticks and clean-up */
  function control(now) {
    for (const h of handles) {
      const I = h.impl; if (!I) continue;
      try {
        const dt = clamp(now - I.lastT, 0, 0.25); I.lastT = now;
        if (I.panner) placeLoop(I, now, false); else I.audible = h.vol > 1e-4;
        // sleep only after SLEEP s of silence, so every strike / note / click already scheduled has finished
        if (I.audible) { I.quiet = 0; setAwake(I, true); } else if ((I.quiet += dt) > SLEEP) setAwake(I, false);
        if (I.tick) I.tick(now, dt, I.dist, I.audible && I.awake);
      } catch (e) {
        warnOnce('tick:' + h.name, 'loop error', h.name, e);
        if (++I.errs > 3) I.tick = null;
      }
    }
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      try { if (v.tick) v.tick(now); } catch (e) { warnOnce('vtick', 'voice error', e); v.tick = null; v.end = Math.min(v.end, now + 3); }
      if (now > v.end) { disposeVoice(v); voices.splice(i, 1); }
    }
    for (let i = disposals.length - 1; i >= 0; i--) if (now > disposals[i].at) { disposeLoop(disposals[i].I); disposals.splice(i, 1); }
  }
  function update(camera, dt) {
    try {
      if (camera && typeof camera === 'object') { try { readCam(camera); } catch (e) { /* */ } }
      if (!ac || failed || !N) return;
      const now = ac.currentTime;
      applyListener(false);
      if (lastCtl < 0 || now - lastCtl >= CTL || now < lastCtl) { lastCtl = now; control(now); }
      if (warm.length) { const t0 = nowMs(); do { const k = warm.shift(); try { buf(k); } catch (e) { warnOnce('warm:' + k, 'synth failed', k, e); } } while (warm.length && nowMs() - t0 < 2.5); }
    } catch (e) { warnOnce('update', 'update error', e); }
  }
  function applyMute() {
    if (!ac || !N) return;
    try {
      clearTimeout(suspendTimer);
      if (muted) {
        ramp(N.mute.gain, 0, 0.12); cancelSpeech();
        if (!offline) suspendTimer = setTimeout(() => { try { if (muted && ac && ac.state === 'running') ac.suspend().catch(() => {}); } catch (e) { /* */ } }, 700);
      } else {
        if (!offline && ac.state !== 'running' && !hidden()) ac.resume().catch(() => {});
        ramp(N.mute.gain, 1, 0.35);
      }
    } catch (e) { warnOnce('mute', 'mute failed', e); }
  }

  const api = {
    get ready() { return !!ac && !!N && !failed; },
    get context() { return ac; },
    get muted() { return muted; },
    set muted(v) { muted = !!v; applyMute(); },
    get master() { return masterVol; },
    setMaster(v) { try { masterVol = clamp(Number(v) || 0, 0, 2); if (ac && N) glide(N.master.gain, masterVol, 0.05); } catch (e) { /* */ } },
    start, update, loop, play,
    names: { loops: Object.keys(LOOPS), oneShots: Object.keys(SFX) },
    meter() {
      try {
        if (!N || !N.meter) return { rms: 0, peak: 0 };
        const n = N.meter.fftSize; if (!meterBuf || meterBuf.length !== n) meterBuf = new Float32Array(n);
        N.meter.getFloatTimeDomainData(meterBuf);
        let s = 0, p = 0; for (let i = 0; i < n; i++) { const x = meterBuf[i]; s += x * x; const a = Math.abs(x); if (a > p) p = a; }
        return { rms: Math.sqrt(s / n), peak: p };
      } catch (e) { return { rms: 0, peak: 0 }; }
    },
    get stats() {
      let awake = 0; for (const h of handles) if (h.impl && h.impl.awake) awake++;
      return { voices: voices.length, loops: handles.size, awake, sources: srcLive, hrtf: hrtfLive, buffers: cache.size, pending: warm.length, state: ac ? ac.state : 'none' };
    },
  };
  return api;
}
